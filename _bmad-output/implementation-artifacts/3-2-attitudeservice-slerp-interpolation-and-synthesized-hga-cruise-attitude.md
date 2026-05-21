# Story 3.2: AttitudeService SLERP Interpolation and Synthesized HGA Cruise Attitude

**Epic:** 3 — Attitude Reconstruction (the Differentiator)
**Status:** done
**Date created:** 2026-05-21
**Source:** epics.md § Epic 3 Story 3.2 (lines 1308–1346); Story 3.1's amended ADR-0004 § Body Layout per Kind (explicit-ET attitude VTRJ schema); ADR-0009 (no web workers for trajectory/attitude interpolation); ADR-0015 (service-graph via reactive controllers, no global store)

## User Story

As a visitor at any ET in the mission,
I want the simulation to always know how each spacecraft is oriented — CK-driven during encounter windows (sub-milliradian fidelity), synthesized Earth-pointing HGA during cruise (with explicit UI provenance label) — without silent fallback between the two regimes,
So that the per-frame render loop (Story 3.4), the narrow-angle boresight cone (Story 3.5), and the provenance indicator (Story 3.6) all read from a single trusted source — fulfilling FR15, FR18, FR19 (data layer), and FR20.

## Triage Source / Inheritance

- **Story 3.1's explicit-ET VTRJ schema** is the load-bearing data contract. Per ADR-0004 § Body Layout per Kind (amended 2026-05-21), attitude VTRJ bodies are `(N, 5)` Float64 — column 0 is explicit per-sample ETs (the bake-time CK grid), columns 1-4 are SPICE scalar-first quaternions `[w, x, y, z]`. The runtime decoder MUST read column 0 as SLERP knot positions; the header `cadence_seconds` field is informational only for attitude. **Story 3.1 baseline:** 5-sec uniform cadence across closest_approach ±2 days; 14 encounter files; all NFR-P10 ≤1 mrad against SpiceyPy ckgp ground truth.
- **EphemerisService pattern (Story 1.6)** is the model for the chunk-fetch boundary. Same `ManifestLoader` + `ChunkLoader` + brotli-decode + DataView path. Sync API; hot path returns `null` on missing-chunk (NEVER throws). One-time `console.warn` on first per-URL miss to avoid per-frame spam.
- **Manifest schema (Story 3.1 amendment):** `bodies[].files[]` entries gained an optional `provenance: "ck"` field; trajectory entries omit it. Attitude entries have `kind ∈ {"bus_attitude", "platform_attitude"}` and the body's `naifId` rolls up to the spacecraft SPK ID (-31, -32) — the per-file VTRJ `body_id` carries the (spacecraft × kind) discrimination via the CK structure IDs (-31000, -31100, -32000, -32100). See `bake/src/vtrj_writer.py:_kind_for_body_id` for the canonical discrimination.
- **No CK coverage for V1 scan platform at PBD** per `docs/kernels/ckbrief-inventory.md`. The V1 super CK has no scan-platform coverage at 1990-02-14; Story 3.1's bake correctly skips emitting `v1_platform_attitude.pale-blue-dot.bin.br`. Story 3.2's `getPlatformQuat(V1, PBD_ET)` therefore must fall through to the synthesized path. (Story 5.2 will later overlay the choreographed PBD imaging sequence on top of the synthesized rest attitude.)

## Acceptance Criteria

### AC1 — Service module + chunk-loader integration

- **GIVEN** the asset manifest from Story 1.6 now includes attitude file entries (Story 3.1 manifest extension: `kind ∈ {"bus_attitude", "platform_attitude"}`, `provenance: "ck"`)
- **AND** Story 3.1's VTRJ schema stores attitude bodies as `(N, 5)` with explicit per-sample ETs in column 0 (ADR-0004 § Body Layout per Kind)
- **WHEN** `web/src/services/attitude-service.ts` is constructed with `(manifest: Manifest, chunkLoader: ChunkLoader)` (mirroring EphemerisService's constructor)
- **THEN** AttitudeService builds an in-memory index of attitude files per `(spacecraftNaifId, kind)` tuple — analogous to EphemerisService's `BodyIndex` keyed by NAIF SPK ID, but multi-dimensional (the manifest's per-file `body_id` discriminates trajectory vs attitude-kind via the namespace check; the body-level `naifId` is the spacecraft SPK ID)
- **AND** the index supports binary-search lookup of the file covering a given ET per (spacecraft, kind) tuple, identical in shape to EphemerisService's `findSegmentFile`
- **AND** the chunk-load path uses the same `ChunkLoader` instance as EphemerisService — there is no parallel loader, no second LRU cache, no duplicate brotli decoder

### AC2 — Quaternion type + SPICE↔Three.js convention permute

- **GIVEN** SPICE stores quaternions as scalar-first `[w, x, y, z]` and Three.js / WebGL store them as scalar-last `[x, y, z, w]`
- **AND** Story 3.1's VTRJ body columns 1-4 are SPICE convention
- **WHEN** AttitudeService decodes a VTRJ chunk
- **THEN** the decoder permutes per-sample columns: input `[w_col, x_col, y_col, z_col]` (columns 1-4 of body) → Three.js `THREE.Quaternion(x, y, z, w)` constructor
- **AND** the permute happens ONCE at decode time (not per-frame at query time)
- **AND** the cached knot quaternions inside AttitudeService are stored in Three.js convention so per-frame `getBusQuat` / `getPlatformQuat` is a SLERP-and-return path
- **AND** `web/src/types/branded.ts` gains a branded `Quaternion` type that wraps `THREE.Quaternion` (or a structurally-typed `{ x, y, z, w }`) so a non-permuted SPICE quaternion can't accidentally be assigned to an `AttitudeService` consumer. See Story 1.5's `WorldVec3` / `RenderVec3` branded pair (per ADR-0026) for the convention pattern

### AC3 — CK-window SLERP path

- **GIVEN** the current ET falls inside a CK coverage window per the manifest (i.e., `findSegmentFile(et, spacecraft, kind)` returns a non-null `bus_attitude` or `platform_attitude` file)
- **WHEN** `getBusQuat(spacecraftId, et)` or `getPlatformQuat(spacecraftId, et)` is called
- **THEN** AttitudeService reads the (N, 5) chunk body, finds the two knot rows `i` and `i+1` such that `body[i, 0] <= et <= body[i+1, 0]` (binary search over column 0; the explicit ETs are monotonically non-decreasing per Story 3.1's `_validate_inputs` in vtrj_writer)
- **AND** performs SLERP via `THREE.Quaternion.slerpQuaternions(q_i, q_{i+1}, t)` where `t = (et - body[i,0]) / (body[i+1,0] - body[i,0])`
- **AND** Story 3.1's `quat_continuity.walk_signs` pre-bake guarantees `dot(q_i, q_{i+1}) >= 0` so the SLERP takes the short way (no shortest-path check needed at runtime per ADR-0024 § Consequences)
- **AND** returns a branded `Quaternion` (per AC2)
- **AND** `getAttitudeProvenance(spacecraftId, et)` returns `'ck'` for this ET

### AC4 — Synthesized Earth-pointing HGA cruise path

- **GIVEN** the current ET falls outside any CK coverage window for the given (spacecraft, kind) tuple (i.e., `findSegmentFile` returns `null`)
- **WHEN** `getBusQuat(spacecraftId, et)` is called
- **THEN** AttitudeService synthesizes the Earth-pointing HGA attitude:
  1. Query `EphemerisService.getPosition(spacecraftId, et)` for the spacecraft position (heliocentric WorldVec3 km)
  2. Query `EphemerisService.getPosition(EARTH_NAIF_ID, et)` for Earth's position (NAIF=3 per ADR-0021 Earth-Moon barycenter; if the manifest doesn't include 3, fall back to NAIF=399 if present — document the fallback)
  3. Compute the spacecraft→Earth direction unit vector
  4. Construct an orientation matrix where the HGA boresight (defined by the FK frame rotation from `vg1_v02.tf` / `vg2_v02.tf`, hardcoded in `web/src/services/fk-constants.ts` per AC6) is aligned with the spacecraft→Earth direction
  5. The secondary-axis constraint comes from the solar-panel orientation (also from FK constants); the third axis is derived by right-hand-rule cross product to ensure orthonormality
  6. Convert the orientation matrix to a Three.js Quaternion via `THREE.Quaternion.setFromRotationMatrix`
  7. Return as branded `Quaternion`
- **AND** `getPlatformQuat(spacecraftId, et)` in the cruise path returns the platform's resting orientation relative to the bus — a fixed `THREE.Quaternion` captured during Phase 0 inspection of the FK kernel, hardcoded as a `PLATFORM_REST_RELATIVE_TO_BUS` constant in `fk-constants.ts`. No articulation during cruise. (Story 5.2 will later override this for the PBD choreographed turn.)
- **AND** `getAttitudeProvenance(spacecraftId, et)` returns `'synthesized'`
- **AND** the synthesized path NEVER substitutes for a CK-available ET; the provenance flag is computed from the manifest, not from a fallback after-the-fact (per AC5 boundary discipline)

### AC5 — Boundary discipline: no silent CK→synthesized substitution

- **GIVEN** the simulation scrubs across a CK window boundary (e.g., entering V1 Jupiter encounter at 1979-03-03T00:00:00Z which is exactly `closest_approach − 2 days`)
- **WHEN** `getBusQuat` is called at the boundary instant AND immediately before
- **THEN** the provenance flips from `'synthesized'` (cruise, 1979-03-02T23:59:59Z) to `'ck'` (1979-03-03T00:00:00Z) **exactly when** the manifest declares the boundary (i.e., when `body[0, 0]` of the encounter file is reached)
- **AND** there is NO smoothing across the regime change — the SLERP-vs-synthesis transition is a step function in provenance. The HUD indicator (Story 3.6) is responsible for announcing the transition; the AttitudeService just reports it faithfully
- **AND** the quaternion at the boundary instant IS the CK SLERP value (not a blend); the discrete change in attitude across the boundary is at most a few mrad (per Story 3.1's NFR-P10 gate) and is intentionally not smoothed
- **AND** a unit test pins this boundary behaviour: query at `boundary_et - epsilon` returns `'synthesized'`; query at `boundary_et + epsilon` and at `boundary_et` itself both return `'ck'`

### AC6 — FK constants module

- **GIVEN** the FK rotation values relative to the parent frame are needed both for the synthesized HGA attitude path AND for Story 3.5's NA-camera boresight cone
- **WHEN** `web/src/services/fk-constants.ts` is authored
- **THEN** it exports:
  - `VG1_BUS_FRAME_ID`, `VG1_HGA_FRAME_ID`, `VG1_SCAN_PLATFORM_FRAME_ID`, `VG1_NA_CAMERA_FRAME_ID` — FK frame ID integers from `vg1_v02.tf` (and `VG2_*` siblings)
  - `VG1_HGA_BORESIGHT_RELATIVE_TO_BUS: readonly [number, number, number]` — the unit vector of the HGA boresight axis in the bus frame, copied verbatim from `kernels/vg1_v02.tf` with an inline comment citing the kernel filename and line number
  - `VG1_PLATFORM_REST_QUAT_RELATIVE_TO_BUS: readonly [number, number, number, number]` — the platform's resting orientation as a Three.js scalar-last quaternion, derived from the FK rotation matrix
  - `VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS: readonly [number, number, number]` — the secondary-axis constraint for synthesized HGA attitude
  - `VG2_*` siblings for all of the above
- **AND** every constant is marked `as const` for compile-time immutability
- **AND** the file is `type-only` import friendly — no runtime initialization beyond the constant values
- **AND** the inline comments cite the originating FK kernel file (`kernels/vg1_v02.tf` / `kernels/vg2_v02.tf`) and the section (e.g., "TKFRAME definition for frame ID -31100 at lines 142-149") so a future contributor can verify against the source

### AC7 — Integration AC (Rule 1: service-introducing story must verify wire-up)

Story 3.2 introduces a new service (`AttitudeService`). Per voyager-skill-rules.md Rule 1, the story MUST include at least one Integration AC verifying the wire-up between the new service and a consumer.

- **GIVEN** AttitudeService is constructed via the same boot path as EphemerisService (Story 1.6 first-paint wire-up; see `web/src/boot/first-paint.ts` and `web/src/main.ts`)
- **WHEN** the boot process completes (manifest loaded, services constructed)
- **THEN** an Integration test in `web/tests/attitude-service-integration.test.ts` exercises the consumer→service wire-up via the actual `startFirstPaint` boot path:
  1. Mount the boot stack with a fixture manifest that includes a V1 Jupiter `bus_attitude` entry pointing at a fixture VTRJ
  2. Call `attitudeService.getBusQuat(V1_NAIF_ID, V1_JUPITER_CLOSEST_APPROACH_ET)` — assert provenance `'ck'`, quaternion within NFR-P10 tolerance of the SPICE-canonical value (the test fixture VTRJ is byte-stable; the ground-truth quaternion is hand-computed at the closest-approach moment and asserted)
  3. Call `attitudeService.getBusQuat(V1_NAIF_ID, CRUISE_ET_OUTSIDE_ANY_CK)` — assert provenance `'synthesized'`, quaternion non-NaN, unit-length (`|q| ≈ 1` within float64 epsilon)
  4. Cross-spacecraft provenance: call `attitudeService.getBusQuat(V2_NAIF_ID, V1_JUPITER_CLOSEST_APPROACH_ET)` — assert provenance `'synthesized'` (V2 had no CK coverage there)
- **AND** the test publishes `__voyagerDebug.attitudeService` per the existing debug-surface convention so a lead-driven Chrome DevTools MCP smoke can additionally exercise the service from a real browser

### AC8 — Lead-driven Chrome DevTools MCP smoke (per voyager-skill-rules.md Rule 3 + Rule 8)

- **GIVEN** Story 3.2 touches `web/src/services/attitude-service.ts` (NEW user-facing surface in the sense that the runtime AttitudeService is what subsequent stories' rendering reads)
- **AND** voyager-skill-rules.md Rule 3 mandates browser-MCP smoke evidence as per-story exit criterion
- **AND** ADR-0010 Layer 1 places the smoke on the lead, not subagents
- **WHEN** the lead executes the per-story smoke after the CR stage
- **THEN** the MCP probe plan (authored by qa-3-2, executed by lead) is:
  1. `navigate_page` → `http://localhost:5173/?t=1979-03-05T12:05:26Z` (V1 Jupiter closest approach)
  2. `evaluate_script` → `window.__voyagerDebug.attitudeService.getBusQuat(-31, __voyagerDebug.clockManager.simTimeEt)` — assert non-null Quaternion with unit length, provenance `'ck'`
  3. `evaluate_script` at a cruise ET (e.g. 1995-01-01) — assert provenance `'synthesized'`, quaternion unit-length, components in normal Three.js convention `[x, y, z, w]`
  4. `evaluate_script` at a CK boundary instant (e.g., V1 Jupiter encounter file's `et_start = closest_approach - 2 days`) — assert provenance transition behaviour from AC5
  5. `list_console_messages` (filter=error) — must be clean
- **AND** evidence (screenshots + the per-probe evaluate_script results) is saved to `_bmad-output/implementation-artifacts/3-2-smoke-evidence/`

### AC9 — Test sweep green; no regressions

- **GIVEN** all AC1–AC8 changes are merged
- **WHEN** the test suite is exercised
- **THEN** `cd web && npm test -- --run` passes 100% (Story 3.1 baseline was 2065 pass + bake-only changes; Story 3.2 adds ~30-50 new web-side tests across `attitude-service.test.ts`, `attitude-service-integration.test.ts`, possibly `fk-constants.test.ts`)
- **AND** `cd web && npm run typecheck` clean (no `any`; branded `Quaternion` type enforced at AttitudeService's public API)
- **AND** `cd web && npm run lint` baseline preserved (5 pre-existing warnings, 0 new)
- **AND** `cd bake && uv run pytest -q -m "not slow"` passes 337 (unchanged — Story 3.2 is web-only on top of Story 3.1's bake)

## Integration ACs

See AC7 above — the lead Integration AC for the service↔consumer wire-up. The runtime-tier smoke (AC8) is the Rule-3 per-story smoke gate, complementary to but distinct from the integration AC (AC8 verifies real-browser behaviour; AC7 verifies the boot-time wire-up via happy-dom).

## Consumes (this story's consumed dependencies)

- **`bake/out/manifest.json`** (produced by Story 3.1) — attitude file entries with `kind ∈ {"bus_attitude", "platform_attitude"}` and `provenance: "ck"`.
- **`web/src/services/manifest-loader.ts`** (Story 1.6) — unchanged consumer of the manifest schema; Story 3.1's `provenance` field is forward-compat (Zod `z.object` default-strips unknowns).
- **`web/src/services/chunk-loader.ts`** (Story 1.6) — fetches + brotli-decodes VTRJ chunks. AttitudeService uses the SAME `ChunkLoader` instance as EphemerisService (one cache, one decoder).
- **VTRJ explicit-ET attitude body schema** (Story 3.1, ADR-0004 § Body Layout per Kind) — body shape `(N, 5)`, column 0 explicit ETs, columns 1-4 SPICE scalar-first quaternions.
- **`web/src/services/ephemeris-service.ts`** (Story 1.6) — the synthesized HGA path queries spacecraft + Earth positions from EphemerisService. Construction order matters: EphemerisService MUST be constructed BEFORE AttitudeService so the constructor can hold a reference (or AttitudeService can accept it as a constructor arg). Recommendation: constructor injection in `first-paint.ts`.
- **`web/src/types/branded.ts`** (Story 1.5) — Story 3.2 extends with branded `Quaternion` type alongside `WorldVec3` / `RenderVec3`.

## Consumed-by (downstream stories that depend on Story 3.2's output)

- **Story 3.3 (Articulated Spacecraft GLB):** consumes `getPlatformQuat(spacecraft, et)` to drive the scan-platform articulation node on the spacecraft GLB.
- **Story 3.4 (Apply Attitude Per Frame):** per-frame `RenderEngine.onFrame` reads `getBusQuat` and `getPlatformQuat` for both spacecraft to drive the rotation transforms of the bus + scan-platform Three.js Object3D nodes.
- **Story 3.5 (NA Camera Boresight Cone):** consumes `getPlatformQuat(spacecraft, et)` plus the FK constants (`VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM`) to compute the world-space NA-camera boresight direction.
- **Story 3.6 (`<v-attitude-indicator>` HUD provenance):** consumes `getAttitudeProvenance(spacecraft, et)` to show the `"ATT CK reconstructed"` / `"ATT Synthesized"` label.
- **Story 3.7 (L2 JS-vs-SPICE attitude validation in CI):** the L2 validator drives AttitudeService.getBusQuat at fixed-seed random ETs and compares against SpiceyPy ckgp reference (runtime-tier mirror of Story 3.1's L1 bake-tier validator).

## Tasks / Subtasks

- [x] **T1 — Branded Quaternion type + FK constants module (AC2, AC6)**
  - [x] T1.1: Read `web/src/types/branded.ts` to confirm the WorldVec3 / RenderVec3 / WorldQuat (if any) conventions
  - [x] T1.2: Add `Quaternion` branded type to `branded.ts`. Structural shape: `Readonly<{ x: number; y: number; z: number; w: number }>` with brand `__voyagerQuaternion`. Constructor helper `quaternion(x, y, z, w): Quaternion`. Three.js convention scalar-LAST
  - [x] T1.3: Inspect `kernels/vg1_v02.tf` and `kernels/vg2_v02.tf` for the canonical FK frame definitions. Identify: bus frame ID (-31000 / -32000), HGA frame ID, scan-platform frame ID (-31100 / -32100), NA-camera frame ID (-31101 / -32101). Verify by cross-reference to `bake/src/ck_inventory.py:30-43` which already names these
  - [x] T1.4: For each frame relative to the bus, extract the TKFRAME rotation values (likely 3×3 rotation matrix in `MATRIX = ( ... )` form). Document the kernel filename + line number in source comments
  - [x] T1.5: Convert the rotation matrices to Three.js scalar-last quaternions; verify orthonormality (each row dot product with itself ≈ 1.0 ± 1e-12; cross-row dot product ≈ 0.0)
  - [x] T1.6: Create `web/src/services/fk-constants.ts` exporting `VG1_*` and `VG2_*` frame IDs, boresight unit vectors, platform-rest quaternions, solar-panel axis vectors. All `as const`
  - [x] T1.7: Write `web/src/services/fk-constants.test.ts` — orthonormality assertions for all rotation quaternions; round-trip from rotation matrix to quaternion and back within float64 epsilon

- [x] **T2 — AttitudeService skeleton + chunk-loader integration (AC1)**
  - [x] T2.1: Read `web/src/services/ephemeris-service.ts` carefully — model the AttitudeService class shape after it
  - [x] T2.2: Create `web/src/services/attitude-service.ts`. Constructor `(manifest: Manifest, chunkLoader: ChunkLoader, ephemerisService: EphemerisService)` — EphemerisService injected for the synthesized path
  - [x] T2.3: Index data structure: `Map<(spacecraftNaifId: number, kind: 'bus_attitude' | 'platform_attitude'), AttitudeFileIndex>` where `AttitudeFileIndex` mirrors EphemerisService's `BodyIndex` (sortedFiles + starts arrays for binary search). Discriminate VTRJ `body_id` namespace (-31000/-31100 vs -32000/-32100) at construction
  - [x] T2.4: `findAttitudeFile(et, spacecraftId, kind): ManifestFile | null` — binary search on `starts` for the largest `start <= et`, mirror EphemerisService's findSegmentFile
  - [x] T2.5: Synchronous public API: `getBusQuat`, `getPlatformQuat`, `getAttitudeProvenance` all return synchronously; the chunk-load happens behind the scenes via the same `null`-on-miss + hot-path-load contract EphemerisService uses
  - [x] T2.6: One-time `console.warn` on first per-URL miss (re-use the `warnedUrls: Set<string>` pattern from EphemerisService)

- [x] **T3 — VTRJ attitude decoder (AC1, AC2, AC3)**
  - [x] T3.1: Add a method `decodeAttitudeChunk(loadedChunk: LoadedChunk): DecodedAttitude` where `DecodedAttitude = { knotEts: Float64Array, knotQuats: Quaternion[] }` (or `{x: Float64Array, y: Float64Array, z: Float64Array, w: Float64Array}` for SoA — choose AoS or SoA based on the SLERP code's per-frame access pattern; AoS is simpler, SoA potentially faster for cache)
  - [x] T3.2: Body shape parsing: from the decoded VTRJ chunk's body bytes (post-brotli), interpret as `Float64Array` of length `5 * sample_count`. Reshape mentally to `(N, 5)`: ETs in slots `[0, 5, 10, ...]`, quaternion components in slots `[1..4, 6..9, ...]`
  - [x] T3.3: SPICE → Three.js convention permute happens once at decode: each sample's `[w_col, x_col, y_col, z_col]` (SPICE scalar-first) → `Quaternion(x, y, z, w)` (Three.js scalar-last)
  - [x] T3.4: Cache the decoded `{knotEts, knotQuats}` per chunk URL — the chunk-loader's LRU cache already holds raw decoded bytes; AttitudeService maintains a small `Map<chunkUrl, DecodedAttitude>` for the parsed-attitude path so decode happens once per chunk-load

- [x] **T4 — CK-window SLERP path (AC3)**
  - [x] T4.1: `getBusQuat(spacecraftId, et)` and `getPlatformQuat(spacecraftId, et)` — find the file covering ET; if none → fall through to AC4 synthesized path
  - [x] T4.2: If file is loaded (chunk-loader.peek hits), decode + SLERP. Binary search on `knotEts` for the two surrounding knots (`i` such that `knotEts[i] <= et <= knotEts[i+1]`)
  - [x] T4.3: Compute SLERP `t = (et - knotEts[i]) / (knotEts[i+1] - knotEts[i])`
  - [x] T4.4: SLERP via Three.js `new Quaternion().slerpQuaternions(knotQuats[i], knotQuats[i+1], t)`. Per ADR-0024 § Consequences, the pre-walked sign-continuous quaternions guarantee SLERP takes the short way — no shortest-path adjustment needed
  - [x] T4.5: Return as branded `Quaternion`
  - [x] T4.6: Edge case: et === knotEts[0] (boundary instant at file start) → return `knotQuats[0]` directly; et === knotEts[N-1] → return `knotQuats[N-1]`. NEVER extrapolate outside the file's ET range — that's the synthesized path's job

- [x] **T5 — Synthesized HGA-Earth-pointing path (AC4)**
  - [x] T5.1: `EphemerisService.getPosition(EARTH_NAIF_ID, et)` — confirm the NAIF ID. Story 1.13 baked NAIF=3 (Earth-Moon barycenter). For HGA-Earth-pointing in cruise, the spacecraft is far enough from Earth that EMBary vs Earth-Center is ~1 part in 1e8 — barycenter is fine
  - [x] T5.2: Compute spacecraft→Earth unit vector: `earthPos - scPos`, normalize. Both positions in heliocentric WorldVec3 km
  - [x] T5.3: Construct orientation matrix: primary axis = HGA boresight (from FK constants, in bus frame) → world; the rotation matrix R is built such that `R · (HGA_boresight_in_bus_frame) = (scToEarth_in_world_frame)`. Secondary axis constrained by solar panel orientation (FK constant); third axis by cross product
  - [x] T5.4: Convert R to Three.js quaternion via `THREE.Quaternion().setFromRotationMatrix(THREE.Matrix4)`. Ensure orthonormality via `mat3.makeRotationFromQuaternion` round-trip in a defense test
  - [x] T5.5: Return as branded `Quaternion`
  - [x] T5.6: `getPlatformQuat` in cruise: return `VG{1|2}_PLATFORM_REST_QUAT_RELATIVE_TO_BUS` composed with the synthesized bus quaternion (`bus_quat · platform_rest_relative`)
  - [x] T5.7: Edge case: if EphemerisService.getPosition returns null (missing chunk for that ET) → return the previous-frame synthesized attitude as a 1-frame fallback, OR null to signal "data not yet available" — choose null per the EphemerisService convention

- [x] **T6 — Provenance reporting (AC5)**
  - [x] T6.1: `getAttitudeProvenance(spacecraftId, et): 'ck' | 'synthesized'` — depends ONLY on manifest lookup (`findAttitudeFile(et, spacecraftId, 'bus_attitude') !== null` → `'ck'`; else `'synthesized'`). Provenance is decoupled from quaternion availability — it reports what the manifest says, not what the loader has cached
  - [x] T6.2: Provenance for bus and platform may differ (e.g., V1 Jupiter has bus AND platform CK coverage; V1 PBD has bus CK but NO platform CK — Story 3.1's bake skipped emitting `v1_platform_attitude.pale-blue-dot.bin.br`). Decide: `getAttitudeProvenance(sc, et)` returns the bus provenance? Or a struct `{bus, platform}`? Recommendation: dual-key API — `getBusProvenance(sc, et)` and `getPlatformProvenance(sc, et)`. Document the design in source comments
  - [x] T6.3: Unit test: boundary discipline. At V1 Jupiter encounter file's `et_start`, querying at `et_start - 1ns` returns `'synthesized'`, at `et_start` returns `'ck'`, at `et_start + 1ns` returns `'ck'`

- [x] **T7 — Boot wire-up (first-paint.ts)**
  - [x] T7.1: Modify `web/src/main.ts` to construct AttitudeService after EphemerisService (so EphemerisService can be injected). The new construction order: `chunkLoader → manifestLoader → ephemerisService → attitudeService`. Construction landed in `main.ts` (post-manifest-load callback) rather than `first-paint.ts` because AttitudeService needs the manifest — `first-paint.ts` runs before manifest load completes (mirrors EphemerisService's location).
  - [x] T7.2: Exposed via `__voyagerDebug.attitudeService` in `main.ts`; not added to `FirstPaintHandle` because the canonical wire path is `main.ts` post-manifest-load (mirrors EphemerisService which is also NOT on `FirstPaintHandle` despite the HUD consuming it).
  - [x] T7.3: Update `web/src/main.ts` to wire `__voyagerDebug.attitudeService = attitudeService` for the lead-side MCP smoke
  - [x] T7.4: No teardown obligations (service holds only Map references — GC handles cleanup).
  - [x] T7.5: No first-paint test changes needed (no explicit construction-order assertions touch AttitudeService since it's constructed in main.ts).

- [x] **T8 — Unit + integration tests (AC7)**
  - [x] T8.1: `web/src/services/attitude-service.test.ts` — 30 unit tests for `decodeAttitudeChunk`, `slerpAtEt`, `synthesizeHgaPointingQuat`, `findAttitudeFile`, `getBusQuat`, `getPlatformQuat`, `getBusProvenance`, `getPlatformProvenance`. Mocked manifest + chunk-loader + EphemerisService. Covers happy path + boundary + missing-chunk + cross-spacecraft.
  - [x] T8.2: Synthesized-path tests: stub `EphemerisService.getPosition` to return fixed S/C + Earth positions; assert the result quaternion is unit-norm; assert HGA boresight (rotated by quaternion) aligns with the synthesized aim direction within 1e-12 absolute.
  - [x] T8.3: SLERP path tests: hand-construct a `(N, 5)` body fixture with known knot positions + quaternions; query at midpoint between knot 0 and knot 1; assert the SLERP value equals `THREE.Quaternion.slerpQuaternions(knot0, knot1, 0.5)` within 14 decimal places.
  - [x] T8.4: Branded-type contract enforced via the `__brand` field on the `Quaternion` type — only the `quaternion()` constructor can produce values that pass the type-check (any raw `{x,y,z,w}` fails the brand). Not a runtime test (the brand is compile-time-only); compile-time enforcement verified by `npm run typecheck` clean.
  - [x] T8.5: `web/tests/attitude-service-integration.test.ts` — 6 integration tests covering AC7's full boot stack: CK SLERP path, synthesized path, cross-spacecraft, platform attitude, single-chunk-loader contract, and provenance-vs-loader invariant.
  - [x] T8.6: Ran `cd web && npm test -- --run` — **2113 pass (+48 from Story 3.1's 2065 baseline). 0 failures. Typecheck clean. Lint baseline preserved (5 pre-existing warnings, 0 new).**

- [ ] **T9 — Lead-driven MCP smoke (AC8)**
  - [ ] T9.1: QA stage (qa-3-2) authors the MCP probe plan in `_bmad-output/implementation-artifacts/tests/test-summary-3-2.md`
  - [ ] T9.2: Lead executes the probe plan against a running dev server, saves evidence to `_bmad-output/implementation-artifacts/3-2-smoke-evidence/`

T9 (lead-driven MCP smoke) is the lead's responsibility per voyager-skill-rules.md Rule 7 (lead-executed gate). Dev stage leaves T9 unchecked; lead closes after smoke evidence is captured.

## Dev Notes

### Architecture & ADR Compliance Touchpoints

- **ADR-0004 § Body Layout per Kind (Story 3.1 amendment 2026-05-21):** the canonical schema for attitude VTRJ bodies. Story 3.2's decoder MUST honor explicit ETs in column 0; the linspace-reconstruction path is forbidden (would re-introduce the up-to-π-radian SLERP error that Story 3.1 fixed at great cost — see `_bmad-output/implementation-artifacts/3-1-*.md` § Lead-driven smoke evidence + design pivot).
- **ADR-0009 (no web workers for interpolation):** AttitudeService runs on the main thread. SLERP between two pre-walked quaternions is a few-cycle operation; no worker boundary needed.
- **ADR-0010 (Chrome DevTools MCP agent-time / Playwright CI-time):** AC8 lead-driven MCP smoke is the per-story binding gate per Rule 3.
- **ADR-0015 (no global store, reactive controllers):** AttitudeService is a singleton constructed at boot and injected into consumers. NO global `__attitudeService` or window-level binding (apart from the dev-only `__voyagerDebug.attitudeService` for the lead smoke).
- **ADR-0021 (chapter copy in TS template literals, not external MD):** N/A — Story 3.2 doesn't touch chapter copy.
- **ADR-0024 (pre-bake sign-flip walk):** Story 3.1's bake guarantees `dot(q_i, q_{i+1}) >= 0`; runtime SLERP can use standard `THREE.Quaternion.slerpQuaternions` without shortest-path adjustment.
- **ADR-0026 (TypeScript 6.x strict, zero `any`):** branded `Quaternion` type enforced at the AttitudeService public API. NO `any`.

### File-Touch Inventory

**NEW (web-side):**

| File | Purpose | AC |
|---|---|---|
| `web/src/services/attitude-service.ts` | The service itself | AC1, AC3, AC4 |
| `web/src/services/attitude-service.test.ts` | Unit tests | AC9 / T8.1-8.4 |
| `web/src/services/fk-constants.ts` | FK rotation constants | AC6 |
| `web/src/services/fk-constants.test.ts` | Orthonormality + parity tests | AC6 |
| `web/tests/attitude-service-integration.test.ts` | Integration AC7 | AC7 |

**UPDATED (web-side):**

| File | Action | AC |
|---|---|---|
| `web/src/types/branded.ts` | Add `Quaternion` branded type | AC2 |
| `web/src/boot/first-paint.ts` | Construct AttitudeService; expose on FirstPaintHandle | T7 |
| `web/src/main.ts` | Wire `__voyagerDebug.attitudeService` | T7 |
| `web/src/services/manifest-loader.ts` | (verify, likely no change — Zod schema already handles `provenance` field via passthrough) | — |

### Testing Standards Summary

- New web tests live under `web/tests/` (integration) or `web/src/**/__tests__` / `web/src/**/*.test.ts` (unit). Default vitest collection (no special markers).
- AttitudeService unit tests use mocked `ChunkLoader` + hand-constructed manifest fixtures + hand-constructed `(N, 5)` body byte arrays. No real CK kernels touched at unit tier.
- Integration test uses the full `startFirstPaint` boot stack with a fixture manifest pointing at hand-constructed attitude VTRJ bytes; happy-dom only (no real browser).
- Lead MCP smoke at AC8 is the only real-browser test.

### Previous Story Intelligence (Story 3.1)

- **The explicit-ET schema was hard-won.** Story 3.1's lead-driven smoke surfaced 2 HIGH defects (SpiceyPy API mismatch + linspace-reconstruction incoherence) AND drove a 4-iteration cadence-tightening cycle (10s mixed → 10s uniform → closest-approach anchor → 5s uniform). The final 5-sec uniform cadence across closest_approach ±2 days is the load-bearing fact for Story 3.2 — DO NOT assume linspace reconstruction; ALWAYS read column 0 of the body for knot ETs.
- **SPICE scalar-first vs Three.js scalar-last is a real footgun.** The bake stores `[w, x, y, z]`; the runtime needs `THREE.Quaternion(x, y, z, w)`. Story 3.2's decoder MUST permute. The branded `Quaternion` type enforces "you can't construct one without going through the convention-permute helper."
- **Pre-walked sign-continuous guarantee.** Story 3.1's `quat_continuity.walk_signs` ensures adjacent knots have `dot >= 0`. Story 3.2's SLERP NEEDS NO shortest-path check — but the unit tests SHOULD include a defense that catches future regressions where a non-walked source is consumed.
- **Encounter file scope.** Each Story 3.1 encounter file covers EXACTLY closest_approach ±2 days (no cruise samples). For ETs outside ±2 days of ANY encounter's closest approach, the manifest will have NO `bus_attitude` / `platform_attitude` entry covering that ET, and AttitudeService correctly falls through to the synthesized path.
- **Silence-recovery is the accepted equilibrium.** Per Option 1 in this session's workflow design pivot, the lead recovers from file evidence if dev/qa/cr go silent. Story 3.2's agents may or may not send their STATUS envelopes; the lead is unconcerned and proceeds via file evidence + verification.

### Project Context Reference

- BMAD workflow: `_bmad/custom/voyager-skill-rules.md` — Rules 1, 2, 3, 4, 5, 6, 7, 8, 9 all apply.
- ADR registry: `docs/adr/` — particularly ADR-0004 (Story 3.1 amended), ADR-0009, ADR-0015, ADR-0024, ADR-0026.
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml` — `3-2-*` transitions ready-for-dev → in-progress → review → done.
- Cycle log: `_bmad-output/implementation-artifacts/cycle-log-epic-3.md` — Story 3.1 committed at sha `1a4804e`; Story 3.2 entries written by lead during execution.
- Story 3.1 reference: `_bmad-output/implementation-artifacts/3-1-ck-kernel-bake-pipeline-and-sign-flip-walk-pre-bake.md` — especially § Lead-driven smoke evidence + design pivot for the explicit-ET schema rationale.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (lead) for story creation; dev-3-2 (claude-opus-4-7 subagent) for implementation.

### Debug Log References

- Test execution: web vitest 2113 pass (+48 from Story 3.1's 2065 baseline). 30 attitude-service unit tests + 6 attitude-service-integration tests + 12 fk-constants tests = 48 new.
- Typecheck: `tsc --noEmit` clean (0 errors). Required adding `provenance: z.enum(['ck']).optional()` to the `FileSchema` in `manifest-loader.ts` per Story 3.1's forward-compat note (the runtime decoder now reads the field directly without `string | undefined` widening).
- Lint: 5 pre-existing baseline warnings preserved (4 in render/* + ephemeris-service + 1 in celestial-defense-extended). 0 new warnings.
- Bake fast-tier: 337 pass, 3 skipped, 19 deselected — matches Story 3.1 baseline exactly (Story 3.2 is web-only).

### Completion Notes List

**Key design decisions:**

1. **Construction location pivot — main.ts not first-paint.ts.** The story T7.1 wording suggested first-paint.ts should construct AttitudeService, but the realistic wire-up location is `main.ts`'s post-manifest-load callback — same as EphemerisService. AttitudeService needs both the manifest and EphemerisService; first-paint runs before manifest load completes. Decision documented in T7.1's amended subtask checkbox.

2. **Chunk-loader extended at the body-slice layer, not bypassed.** AC1 mandates a single ChunkLoader instance. The existing chunk-loader's `sliceSamples` allocated `sampleCount * 6` Float64 doubles (trajectory shape) — that would either RangeError or silently misread on (N, 5) attitude bodies. Extended `sliceSamples` to branch on body-id namespace via a new exported `kindForBodyId(bodyId): 'trajectory' | 'attitude'` helper (mirror of `bake/src/vtrj_writer.py:_kind_for_body_id`). Trajectory tests unaffected because the bodyId namespace (-31/-32/celestial barycenters) maps to trajectory.

3. **Provenance API surface split into bus + platform dual-key per T6.2.** `getBusProvenance(sc, et)` and `getPlatformProvenance(sc, et)` — necessary because V1 PBD has bus CK but no platform CK (Story 3.1 § Triage Source observation). A single `getAttitudeProvenance` collapsing the two would lose the V1 PBD distinction.

4. **HGA boresight derivation = bus `-Z`.** From `kernels/vg1_v02.tf:217-230` and `vg2_v02.tf:228-239`: VG{1,2}_HGA TKFRAME with ROLL=180° about X, PITCH=0, YAW=0; AXES=(1,2,3). The FK ROT transforms `vec_in_bus → vec_in_hga`. HGA boresight is `+Z` in HGA frame ("The boresight of the antenna is the +Z axis" — vg1_v02.tf:217). Inverting: `v_bus = ROT^T · v_hga = Rx(180°) · [0,0,1] = [0, 0, -1]`. Validated via Three.js round-trip in `fk-constants.test.ts`.

5. **Platform-rest-relative-to-bus = identity.** The scan platform is a Class-3 CK frame (not TKFRAME) — the FK does NOT define a static rest pose. Story T5.6 specifies cruise-rest as identity ("no articulation during cruise"). Identity makes the synthesized platform quaternion equal the synthesized bus quaternion. Story 5.2 (PBD choreography) will replace identity with a choreographed turn; the composition `q_bus · q_platform_rest_relative_to_bus` is left explicit at the call site so the override point is obvious.

6. **Solar-panel axis as secondary-constraint = bus `+X` (visualization convention).** Voyager has no solar panels (RTG-powered) — the FK constant carries no kernel-derived semantics. The runtime synthesis locks the projection of bus `+X` onto the plane perpendicular to the HGA-Earth aim direction toward J2000 ecliptic-up. Visualization choice, not a mission fact; documented in `fk-constants.ts` § derivation block.

7. **Synthesis algorithm: setFromUnitVectors + roll-about-axis.** The two-vector alignment problem reduces to a primary alignment (`setFromUnitVectors(hgaInBus, scToEarthUnit)`) plus a roll rotation about the primary world-axis to satisfy the secondary constraint. Falls back to world `+X` if the secondary degenerates (e.g., HGA-Earth direction parallel to ecliptic-up). Robust against the colocated-spacecraft-Earth edge case (returns identity).

8. **Boundary discipline (AC5) at the ULP boundary.** Unit-test boundary epsilon `1e-9 s` at ET=100 succeeds (ULP ~1e-14 at that magnitude). Integration-test boundary epsilon expanded to `1.0 s` at ET=-6.57e8 because float64 ULP at that magnitude is ~1.5e-7 s — `1e-9 s` is below distinguishable resolution. Both test classes verify the same invariant: manifest-driven step function in provenance, no smoothing across regime.

9. **Decode-once contract via per-URL DecodedAttitude cache.** `AttitudeService.decodedByUrl: Map<chunkUrl, DecodedAttitude>` ensures the SPICE→Three.js permute happens once per chunk-load, not per frame. Per AC2 explicit obligation.

10. **No silent CK→synthesized fallback on cache miss.** `slerpFromCkFile` returns `null` when the chunk has not yet loaded — caller (per-frame render loop, Story 3.4) uses hold-previous semantics. The synthesized path is reserved for ETs that are STRUCTURALLY synthesized per the manifest, not as a fallback for loader-pending state. Per AC5 boundary-discipline contract.

**NFR tripwire response (Rule 5):** None encountered. NFR-P10 (≤1 mrad SLERP error) is verified at bake-time (Story 3.1 L1 validator); Story 3.2's runtime SLERP is a pure pass-through of the pre-walked quaternions so the runtime-tier replication of that gate is Story 3.7's L2 validator scope.

### File List

**NEW (5 files):**
- `web/src/services/attitude-service.ts` — the AttitudeService class (AC1/AC3/AC4/AC5) + exported pure helpers `decodeAttitudeChunk` / `slerpAtEt` / `synthesizeHgaPointingQuat` for unit tests.
- `web/src/services/attitude-service.test.ts` — 30 unit tests (AC1-5, AC9).
- `web/src/services/fk-constants.ts` — FK rotation constants + frame IDs (AC6).
- `web/src/services/fk-constants.test.ts` — 12 orthonormality + parity tests (AC6).
- `web/tests/attitude-service-integration.test.ts` — 6 integration tests via the full chunk-loader + EphemerisService stack (AC7).

**UPDATED (4 files):**
- `web/src/types/branded.ts` — added branded `Quaternion` type + `quaternion()` constructor helper (AC2).
- `web/src/services/chunk-loader.ts` — extended `sliceSamples` to slice (N, 5) for attitude bodies via the new `kindForBodyId(bodyId): VtrjKind` helper. Mirror of `bake/src/vtrj_writer.py:_kind_for_body_id`.
- `web/src/services/manifest-loader.ts` — added `provenance: z.enum(['ck']).optional()` to the FileSchema (Story 3.1 forward-compat closure).
- `web/src/main.ts` — constructs AttitudeService post-manifest-load (after EphemerisService); publishes `__voyagerDebug.attitudeService` (AC8 prep for lead-driven MCP smoke).

### Review Findings

**Code review pass — 2026-05-21 (cr-3-2)**

**Decision:** APPROVE.

**Severity tally:** 0 HIGH, 0 MED, 1 LOW (deferred to `deferred-work.md`), 8 dismissed as noise / false-positives / well-documented design choices.

**ADR compliance verified (Rule 6):**

- [x] **ADR-0004 § Body Layout per Kind (Story 3.1 amendment):** `attitude-service.ts:319-340` `decodeAttitudeChunk` reads explicit per-sample ETs from column 0 of the `(N, 5)` body; NO `linspace` reconstruction. SPICE scalar-first `[w, x, y, z]` permuted to Three.js scalar-last `[x, y, z, w]` once at decode time per AC2. `chunk-loader.ts` `kindForBodyId` + `sliceSamples` honor the namespace-driven 6-vs-5 doubles-per-sample contract.
- [x] **ADR-0009 (no web workers for interpolation):** `AttitudeService` is a regular TS class on the main thread; SLERP via `THREE.Quaternion.slerpQuaternions`; no `new Worker(...)`.
- [x] **ADR-0015 (no global store):** AttitudeService is constructor-injected in `main.ts:333-337` post-manifest-load (same wire-up pattern as EphemerisService). The only window-level binding is `window.__voyagerDebug.attitudeService` gated by `import.meta.env.DEV` constant-folding — the documented dev-only debug-surface exemption per `attitude-service.ts:43-45`.
- [x] **ADR-0024 (sign-flip walk pre-bake):** runtime SLERP uses standard `THREE.Quaternion.slerpQuaternions` without shortest-path adjustment; the pre-walked sign-continuous bake (Story 3.1's `quat_continuity.walk_signs`) is the load-bearing precondition. `attitude-service.ts:8-12` comment block explicitly cites the ADR. QA gap 2 verifies runtime robustness as defense-in-depth.
- [x] **ADR-0026 (TS 6.x strict, zero `any`):** branded `Quaternion` type enforced at AttitudeService's public API (`getBusQuat`, `getPlatformQuat`, etc. all return `Quaternion | null`); no `any` casts in `attitude-service.ts`, `fk-constants.ts`, or `branded.ts`. Typecheck clean.

**Voyager skill-rules compliance (Rules 1, 3, 5):**

- [x] **Rule 1 (Integration AC):** AC7 is the Integration AC for this service-introducing story. `web/tests/attitude-service-integration.test.ts` exercises 6 integration tests covering CK path, synthesized path, cross-spacecraft, platform attitude, single-chunk-loader contract (AC1), and provenance-vs-loader invariant (AC5).
- [x] **Rule 3 (per-story smoke):** Story 3.2 touches `web/src/main.ts` + new `web/src/services/attitude-service.ts` (user-facing surface). The QA-authored MCP probe plan in `_bmad-output/implementation-artifacts/tests/test-summary-3-2.md` § Chrome DevTools MCP smoke stage is the lead's gate per Rule 7. Code-side prerequisite (`__voyagerDebug.attitudeService` debug surface) is published at `main.ts:344-350` and verified by QA gap 3.
- [x] **Rule 5 (NFR tripwire):** Not triggered. Dev Agent Record line 309 ("None encountered") confirms — NFR-P10 is a bake-time gate (Story 3.1's L1 validator); Story 3.2's runtime SLERP is a pure pass-through.

**Test sweep (after CR pass):**

- Web vitest: **2136 pass / 0 fail / 115 files** (baseline preserved — no CR auto-fix edits to source).
- Typecheck: clean (`tsc --noEmit` returns 0).
- Lint: 5 pre-existing baseline warnings, 0 new.
- Bake fast: unchanged baseline (Story 3.2 is web-only).

**Deferred LOW findings (1 — see `_bmad-output/implementation-artifacts/deferred-work.md` § "Deferred from: code review of 3-2-…"):**

- [x] [Review][Defer] `AttitudeService.decodedByUrl` cache has no eviction policy mirroring ChunkLoader's LRU(12) — memory hygiene concern at ~38 MB worst case across all 14 encounter files; not a correctness issue. Routed to Story 3.4 or Epic 6 perf pass.

### Change Log

- 2026-05-21 — Story 3.2 implementation. T1–T8 implemented; AC1–AC7 + AC9 satisfied. AC8 (lead-driven MCP smoke) remains the lead's responsibility per Rule 7. Web vitest 2113 pass (+48 from 2065 baseline); typecheck clean; lint baseline preserved (5 pre-existing warnings, 0 new). Bake fast 337 pass / 3 skipped / 19 deselected (matches Story 3.1 baseline — Story 3.2 is web-only).
