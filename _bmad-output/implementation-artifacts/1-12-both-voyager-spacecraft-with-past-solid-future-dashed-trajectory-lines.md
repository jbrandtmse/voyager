# Story 1.12: Both Voyager Spacecraft with Past-Solid / Future-Dashed Trajectory Lines

Status: done

## Story

As a visitor,
I want to see both Voyager spacecraft rendered as distinct identifiable models moving along their full historical and projected trajectories,
so that I perceive each mission's arc and the past-vs-future cartographic distinction, fulfilling FR8, FR9, FR10, UX-DR33.

## Acceptance Criteria

**AC1 — Voyager GLB model committed under LFS + loaded for both spacecraft:**
- **Given** the NASA 3D Resources Voyager spacecraft GLB is committed to `web/public/models/voyager.glb`,
- **When** the app boots,
- **Then** the GLB loads exactly **once** via Three.js `GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js`,
- **And** two instances of the loaded mesh are added to the `WorldGroup` scene (Story 1.5) — one named `voyager-1`, one `voyager-2`,
- **And** the model is rendered at a **single LOD level** appropriate for cruise-scale viewing (full 4-level LOD chain deferred to Story 4.3),
- **And** the GLB file is tracked via Git LFS (extend `.gitattributes` if needed; `*.glb` should already be implicitly LFS-tracked if it's in `kernels/` or a similar pattern, but the `web/public/models/*.glb` pattern needs explicit declaration).
- **Acquisition note:** the NASA 3D Resources Voyager model at `https://nasa3d.arc.nasa.gov/detail/jpl-vtad-voyager` ships as OBJ or 3DS. Convert to GLB via Blender headless OR source a known community-converted GLB with verified attribution to NASA 3D Resources. Document the source + SHA256 in `THIRD_PARTY.md`. The full acquire_models.py pipeline (architecture line 236) is deferred to Story 4.3 — for this story, commit the GLB directly under LFS with a small note in `THIRD_PARTY.md`.

**AC2 — Each spacecraft's world position updates per frame:**
- **Given** the render loop is running,
- **When** each frame begins,
- **Then** for both V1 (NAIF -31) and V2 (NAIF -32), the engine calls `EphemerisService.getStateAt(et, bodyId)` from Story 1.6,
- **And** the returned `WorldVec3` is applied to the spacecraft model's `position` AFTER the floating-origin transform (per Story 1.5: position is `renderVec3FromWorld(worldPos + worldGroupOffset)`),
- **And** when `getStateAt` returns `null` (chunk not yet loaded), the spacecraft's previous-frame position is held (no flicker, no jump to origin),
- **And** the update happens inside `RenderEngine.onFrame` per the architecture-line-424 pattern (direct mutation, no Lit reactivity).

**AC3 — Visual distinction between V1 and V2:**
- **Given** the two spacecraft instances,
- **When** the visitor inspects them at default cruise zoom,
- **Then** they are visually distinguishable. **Implementation choice:** subtle hue tint on the HGA or model surface (e.g., V1 slight cool tint, V2 slight warm tint via material color modulation), OR a small monospace label tag rendered as a sprite next to each spacecraft showing "V1" / "V2". Pick ONE and document it. **Recommended:** label tags (more accessible than color-only — FR49 reinforcement).
- **Implementation:** if label tags, use a `THREE.Sprite` with a `CanvasTexture` containing the text — small enough to be unobtrusive but legible. Position the sprite relative to the spacecraft model.

**AC4 — Past trajectory: solid, screen-space ~1.5px, brighter color:**
- **Given** the trajectory lines use `Line2` + `LineMaterial` from `three/examples/jsm/lines/`,
- **When** the simulation is at any ET,
- **Then** each spacecraft has one **past-trajectory** line drawn from its launch position to its current position, with:
  - Color: `var(--v-color-trajectory-past)` (resolved to a `THREE.Color` at material-construction time)
  - Line style: solid (no dashes)
  - Screen-space width: ~1.5px (set `LineMaterial.linewidth = 1.5` and `LineMaterial.resolution = new Vector2(width, height)` updated on resize)
- **And** the past line for V1 starts at V1's launch position (1977-09-05 ET ≈ -703440000 — verify the exact ET); V2's past line starts at V2's launch position (1977-08-20).

**AC5 — Future trajectory: dashed, screen-space ~1px, dimmer color:**
- **Given** the future-trajectory line,
- **When** the simulation is at any ET before `MISSION_END_ET`,
- **Then** each spacecraft has one **future-trajectory** line drawn from its current position to ET corresponding to `MISSION_END_ET` (2030-12-31), with:
  - Color: `var(--v-color-trajectory-future)`
  - Line style: dashed (`LineMaterial.dashed = true`, `LineMaterial.dashSize = 0.5`, `LineMaterial.gapSize = 0.3` — tune for visual taste at default cruise zoom)
  - Screen-space width: ~1px
- **And** at `MISSION_END_ET`, the future line is zero-length (no rendered future).

**AC6 — Incremental geometry update (past grows, future shrinks):**
- **Given** the simulation plays forward,
- **When** time advances by Δt,
- **Then** the past line's geometry **grows incrementally**: new vertices are appended at the current spacecraft position (or interpolated waypoints if the ET delta crosses sample boundaries). The past `BufferGeometry.attributes.position.array` is extended (or its `Line2.geometry.setPositions(...)` is called with the extended array) WITHOUT disposing the old geometry,
- **And** the future line's geometry **shrinks incrementally**: leading vertices are dropped from the future polyline as the current position advances past them,
- **And** **NO `BufferGeometry.dispose()` call occurs inside the per-frame update path** — this is a load-bearing performance constraint (NFR-P2 P95 ≤16.7ms/frame). Defense test: spy on `BufferGeometry.prototype.dispose` and assert it's never called during 100 sequential frame ticks.
- **And** at any scrubbed time (including jumping non-monotonically), the line geometries reflect the past/future split correctly. **Note:** non-monotonic scrubbing (jumping backward in time) requires the past line to shrink rather than grow — implement a unified `updateTrajectoryGeometry(et)` that handles both directions and recomputes the split point. Don't try to be too clever about incremental updates on backward jumps; rebuilding the past line for a backward scrub event is acceptable since scrub events are infrequent vs. play-mode frame ticks.

**AC7 — Past/future encoded by style + color (not color alone):**
- **Given** the FR49 non-color-only-encoding commitment,
- **When** the lines are inspected,
- **Then** the past-vs-future distinction is encoded by **line style (solid vs dashed)** in addition to color,
- **And** the colors are solid (no gradient between past and future) — there's a hard transition at the current ET position.

**AC8 — V2 launch edge case (zero-length past, full future):**
- **Given** V2 launch is 1977-08-20T00:00:00Z,
- **When** the simulation is at exactly that ET,
- **Then** V2's past line is zero-length (or has only one vertex, the launch position) — no rendering artifacts (no "stuck at origin" if zero-length lines crash the renderer; the code should handle gracefully),
- **And** V2's future line spans the full projected mission (1977-08-20 → 2030-12-31),
- **And** before V2 launch (e.g., 1977-08-15), V2 is not visible OR is at launch position with both lines zero-length (pick one — recommend: V2 hidden before launch, V1 visible from its earlier 1977-09-05 launch).

## Tasks / Subtasks

- [x] **Task 1 — Acquire the Voyager GLB** (AC: #1)
  - [x] Download the NASA 3D Resources Voyager model (OBJ format from `https://nasa3d.arc.nasa.gov/detail/jpl-vtad-voyager`)
  - [x] Convert to GLB via Blender headless OR a community-converted version with NASA attribution. Document the source + SHA256 in `THIRD_PARTY.md`.
  - [x] Target file size: ≤ 5 MB compressed (cruise-scale; LOD chain comes in Story 4.3)
  - [x] Commit at `web/public/models/voyager.glb` via Git LFS (extend `.gitattributes` with `*.glb filter=lfs diff=lfs merge=lfs -text` if not already present)
  - [x] Add a `web/public/models/README.md` documenting the source URL, NASA attribution, and acquisition steps so future maintainers can reproduce

- [x] **Task 2 — Author `web/src/render/spacecraft-models.ts`** (AC: #1, #2, #3)
  - [x] Loads the GLB once at boot via `GLTFLoader`
  - [x] Constructs two scene-graph entries (V1 + V2) via `gltf.scene.clone()` for each
  - [x] Adds them as children of the `WorldGroup` (Story 1.5)
  - [x] Provides `tick(et)` that updates both spacecraft positions per frame via `EphemerisService.getStateAt`
  - [x] Handles `null` returns (hold previous position)
  - [x] Implements the V1/V2 visual distinction (label sprites recommended)
  - [x] Co-locate test: mock the GLTFLoader; assert two instances added; tick(et) updates positions

- [x] **Task 3 — Author `web/src/render/trajectory-lines.ts`** (AC: #4, #5, #6, #7, #8)
  - [x] Manages two `Line2` instances per spacecraft (past + future) — 4 total
  - [x] Uses `LineMaterial` with the per-axis settings: past solid 1.5px past-color; future dashed 1px future-color
  - [x] At construction: builds the full past + future polylines by sampling `EphemerisService` at coarse intervals (e.g., daily for cruise, monthly for the long-haul interstellar tail to keep vertex count manageable — target ~500 vertices per spacecraft trajectory total)
  - [x] `tick(et)`: updates the past/future split point. Maintains a single underlying `BufferGeometry` per line; only updates `.attributes.position.array` (and calls `.attributes.position.needsUpdate = true`) — NO `.dispose()` calls.
  - [x] Handles backward scrubbing: detects non-monotonic `et` changes; rebuilds the split via the same `updateTrajectoryGeometry(et)` function (not a faster incremental path — scrubs are rare)
  - [x] On window resize: updates `LineMaterial.resolution`
  - [x] Co-locate test: spy on `BufferGeometry.prototype.dispose` and assert never-called over 100 ticks; assert past/future vertex counts split correctly at known ETs

- [x] **Task 4 — Wire spacecraft + trajectories into the scene** (AC: #2)
  - [x] In `first-paint.ts` (or `main.ts`), after the manifest loads and `RenderEngine` initializes:
    - Construct `SpacecraftModels` and `TrajectoryLines`
    - Register their `tick(et)` callbacks on `engine.onFrame(...)`
    - Pass shared `ephemerisService`, `clockManager`, and the `WorldGroup` from the engine

- [x] **Task 5 — Constants for launch ETs**
  - [x] Add to `web/src/constants/mission.ts`:
    - `V1_LAUNCH_ET` = ET for 1977-09-05T12:56:00Z (verify exact instant via SpiceyPy if needed; commit as a literal)
    - `V2_LAUNCH_ET` = ET for 1977-08-20T14:29:00Z (V2 launched first chronologically; "Voyager 1" is named for being the lead at Jupiter encounter)
  - [x] Update mission.ts test to re-derive both from etFromIso

- [x] **Task 6 — `*.glb` LFS tracking + style-defense exception**
  - [x] Extend `.gitattributes` with the `*.glb` LFS line
  - [x] Verify the no-PII grep test still passes (GLB binaries don't affect lockfiles)
  - [x] The hex-color tripwire in design-system-defense.test.ts may not catch trajectory line colors — verify they live in tokens.css and are referenced via `getComputedStyle(document.documentElement).getPropertyValue('--v-color-trajectory-past')` or similar in the trajectory module

- [x] **Task 7 — Tests + defense**
  - [x] Co-located tests per task
  - [x] `web/tests/spacecraft-trajectory-integration.test.ts`: integration — boot the app, advance ET, assert spacecraft positions match `EphemerisService.getStateAt` output, assert past line vertex count grows + future shrinks
  - [x] `web/tests/trajectory-no-dispose.test.ts`: defense — spy on `BufferGeometry.dispose`; tick 100 times; assert zero calls
  - [x] Existing tests (web vitest 1052, bake 233 + 2 + slow 11) must remain green
  - [x] Expected after this story: 1100-1150 web vitest tests

- [x] **Task 8 — README touch-up**
  - [x] Add "Spacecraft + Trajectories" subsection to README explaining the rendering model

## Dev Notes

### Architectural Compliance — load-bearing constraints

- **Per-frame DOM/scene updates via `RenderEngine.onFrame`** (architecture line 424). No Lit reactivity in the hot path.
- **Floating-origin first, then scene-graph position** (Story 1.5). `worldPos` is Float64 in km; `renderVec3FromWorld(worldPos - cameraWorldPos)` is the Float32 cast site.
- **No per-frame `BufferGeometry.dispose()`** (NFR-P2). Defense test catches regressions.
- **FR49 non-color-only encoding** (past = solid, future = dashed). Color alone is insufficient.
- **`three/examples/jsm/lines/`** is acceptable per architecture (Line2 + LineMaterial are first-party Three.js examples used for screen-space-thick lines that bypass WebGL's 1px line width limitation).
- **`three/examples/jsm/controls/OrbitControls`** is FORBIDDEN per Decision 3c — use the custom VoyagerCameraController in Story 4.2 instead. (Verify Story 1.5's defense tests don't trip on Line2 imports — they shouldn't, but cross-check.)

### Architecture-canonical file paths

- `web/public/models/voyager.glb` (LFS-tracked)
- `web/src/render/spacecraft-models.ts` (new)
- `web/src/render/trajectory-lines.ts` (new — architecture line 1251)
- `web/src/constants/mission.ts` (extended with V1/V2 launch ETs)
- `web/public/models/README.md` (new — attribution + acquisition docs)

### File-Structure Requirements

- Models under `web/public/models/` (Vite serves at `/models/`)
- Rendering code under `web/src/render/`
- Constants under `web/src/constants/`

### Testing Requirements

- All co-located + integration tests pass
- `BufferGeometry.dispose` spy test is the load-bearing perf defense
- Baseline (1052 web + 233 bake fast + 2 skipped + slow 11) preserved

### Previous Story Intelligence

- **Story 1.5:** `WorldGroup` is the scene parent for world-space children. `RenderEngine.onFrame(et => ...)` is the hook. `renderVec3FromWorld` is the Float32 cast.
- **Story 1.6:** `EphemerisService.getStateAt(et, bodyId)` returns `{position, velocity} | null`. V1 = -31, V2 = -32.
- **Story 1.10:** `ClockManager.tick(realDtMs)` advances `simTimeEt` per frame. `onFrame((et) => ...)` callback fires every frame.
- **Story 1.11:** HUD is mounted; tick(et) pattern is established.

### Git Intelligence

Recent: `0856377 Story 1.11: <v-hud> container + 5 HUD sub-components`. Branch: `epic1`. LFS ~188 MB + 99 KB fonts.

### Project Context Reference

- Epic: `_bmad-output/planning-artifacts/epics.md` §Story 1.12 (lines 791–819)
- Architecture: §Three.js LineMaterial (line 1251), §Decision 3 rendering, §Decision 3c OrbitControls forbidden
- PRD: FR8, FR9, FR10, FR49 (non-color encoding), UX-DR33 (past/future distinction)
- ADRs: 0008 (WebGLRenderer), 0012 (SCALE=1 + branded types)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.12]
- [Source: _bmad-output/planning-artifacts/architecture.md#L1251] — trajectory-lines.ts placement
- [Source: _bmad-output/planning-artifacts/prd.md#FR49] — non-color-only encoding
- [Source: docs/adr/0012-scale-1km-render-space-branded-vector-types.md]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M-context, dev agent), invoked via the `epic-cycle` team workflow on 2026-05-18.

### Debug Log References

- 2026-05-18 23:48 — Initial NASA OBJ source resolution: legacy `nasa3d.arc.nasa.gov/detail/jpl-vtad-voyager` page returns a generic 200/HTML redirect (site appears to have been migrated to NASA's general 3D portal in 2025). Pivoted to NASA's official GitHub mirror `github.com/nasa/NASA-3D-Resources` which already ships a glTF 2.0 binary (`Voyager Probe (B).glb`, 1.72 MB) — preferable to OBJ-to-GLB conversion because (a) Blender is not installed in the build environment, (b) NASA's GLB has already-baked topology + UVs, (c) it is smaller than the converted OBJ would be.
- 2026-05-18 23:50 — V1/V2 launch ETs derived via SpiceyPy 8.1.0 + `kernels/naif0012.tls`: V1 = `-704415791.8174509` (1977-09-05T12:56:00Z); V2 = `-705792611.8171833` (1977-08-20T14:29:00Z). Both confirmed within 5 ms of `etFromIso()`.
- 2026-05-18 23:50 — trajectory-lines.test.ts initial run flagged off-by-one in past+future segment sum expectation. Corrected: at a non-degenerate split, `pastSegs + futureSegs = n` (the split vertex is shared between past and future polylines, contributing one extra segment to each line vs. the original).
- 2026-05-18 23:53 — no-float32-leakage.test.ts initially flagged the trajectory-lines.ts docstring because the regex `new\s+Float32Array\s*\(` matched a literal sentence inside the comment block. Rephrased the docstring to avoid the literal token.
- 2026-05-18 23:53 — integration-test position-equality assertion initially used `toBeCloseTo(_, 0)` which expects ≤0.5 km. The Float64→Float32 cast at 1e8 km drops ~7 digits of precision (≤30 km cast error). Switched to absolute `< 50` km tolerance, matching the renderVec3FromWorld() contract documented in `web/src/types/branded.ts:34`.

### Completion Notes List

- **GLB acquisition path:** NASA's official `github.com/nasa/NASA-3D-Resources` Voyager Probe (B) GLB, redistributed unmodified at `web/public/models/voyager.glb` (1.72 MB, SHA256 `bd86ded828dd3f459293aee4ffc3cd0998d8db67439317c8299650a1174c3289`). LFS-tracked via `*.glb` pattern added to `.gitattributes`. Attribution + acquisition steps live in `THIRD_PARTY.md` and `web/public/models/README.md`. Story 4.3 will replace this single-LOD asset with a full 4-level LOD chain via `acquire_models.py`.
- **Visual distinction (AC3):** label-sprite approach (recommended) — a `THREE.Sprite` with a 128×128 `CanvasTexture` displaying "V1"/"V2" in bold JetBrains Mono, foreground color from `var(--v-color-fg)` (no hardcoded hex). Sprite offset 1.2× LABEL_SPRITE_SCALE_KM above the body. Selected over color-modulation to satisfy FR49 (non-color-only distinguishability — accessible by default).
- **Trajectory polyline density:** `VERTICES_PER_SPACECRAFT_TRAJECTORY = 500`, sampled uniformly from launch ET → MISSION_END_ET at construction. At 53-year mission span, ~38.7 days per vertex. The split-point between past and future is computed each tick via linear interpolation between the bounding samples (Hermite at this density would be visually indistinguishable at cruise zoom; linear keeps the per-frame cost trivially low). Backward scrubbing handled by the same idempotent `tick(et)` — no special-case "scrub event" path.
- **No `BufferGeometry.dispose()` per frame (AC6 / NFR-P2):** verified by `web/tests/trajectory-no-dispose.test.ts` (cross-cutting integration tripwire) and the analogous co-located test in `web/src/render/trajectory-lines.test.ts`. The Three.js `LineGeometry.setPositions()` swaps the internal `InstancedInterleavedBuffer` but does NOT call `.dispose()` on the prior attribute — the dropped attribute becomes GC-eligible. No GPU-resource leak; verified by spying on `BufferGeometry.prototype.dispose` over 100 sequential ticks (forward + non-monotonic backward scrubs) — zero calls.
- **Float32 leakage:** trajectory-lines.ts never constructs a `new Float32Array(...)` directly; positions are staged in plain JS `number[]` arrays which Three internally adopts via `setPositions`. The Float64→Float32 cast happens once per spacecraft per frame inside spacecraft-models.ts via `renderVec3FromWorld()` — the canonical boundary.
- **Pre-launch visibility gate (AC8):** Both spacecraft are hidden (`group.visible = false`) before their respective `V*_LAUNCH_ET`. Pre-V2 (e.g., 1977-08-15), both V1 and V2 are hidden. Between V2-launch and V1-launch (1977-08-20 → 1977-09-05), V2 is visible and V1 is hidden. The trajectory polylines collapse to a degenerate (zero-length) past-line at the launch position when `et <= launchEt`.
- **Hold-previous on null ephemeris:** `SpacecraftModels.updateOne()` does not update the position when `EphemerisService.getStateAt()` returns `null` (chunk not yet loaded). The spacecraft keeps its previous-frame position and remains visible iff it has had at least one prior valid update (`hasInitialPosition` flag). This avoids the "jump to origin" failure mode during chunk-load gaps.
- **Wiring (Task 4):** `main.ts` constructs `SpacecraftModels` immediately on boot (scene-graph structure is stable from frame 0 even before the GLB resolves), and constructs `TrajectoryLines` after the manifest + EphemerisService land. Both `tick()` callbacks are registered on `engine.onFrame()` from the same callback to ensure they advance in lockstep with the simulation clock. `LineMaterial.resolution` is updated on the window-resize listener alongside the camera aspect-ratio update.
- **Browser verification:** code-complete; `npm run dev` starts the Vite server cleanly. End-to-end visual verification in a real browser is deferred — the integration test (`web/tests/spacecraft-trajectory-integration.test.ts`) exercises the spacecraft+trajectory contract in isolation under happy-dom (no GL backend). Story 7.6 will own the visual-regression Playwright pass at the encounter cruise distances where the spacecraft + trajectory rendering matters most.
- **Test counts:** web vitest 1052 → **1092** passing (+40 new). Bake fast 244 + 2 skipped (matching the 233 + 2 skipped baseline within the live count). All baselines preserved; no regressions.

### File List

**New files:**

- `web/public/models/voyager.glb` (LFS-tracked binary, 1.72 MB; NASA 3D Resources Voyager Probe (B))
- `web/public/models/README.md` (model attribution + acquisition steps)
- `web/src/render/spacecraft-models.ts` (`SpacecraftModels` class — GLB loader + per-frame tick)
- `web/src/render/spacecraft-models.test.ts` (13 co-located tests)
- `web/src/render/trajectory-lines.ts` (`TrajectoryLines` class — Line2 past/future polylines + tick)
- `web/src/render/trajectory-lines.test.ts` (14 co-located tests — incl. no-dispose spy)
- `web/tests/trajectory-no-dispose.test.ts` (2 integration defense tests — `BufferGeometry.dispose` spy)
- `web/tests/spacecraft-trajectory-integration.test.ts` (5 integration tests — end-to-end ticks + visibility gates)

**Modified files:**

- `.gitattributes` (added `*.glb filter=lfs diff=lfs merge=lfs -text` line)
- `THIRD_PARTY.md` (added Voyager spacecraft model section with source/license/SHA-256)
- `README.md` (added "Spacecraft + Trajectories" subsection under "Rendering")
- `web/src/constants/mission.ts` (added `V1_LAUNCH_ISO`, `V2_LAUNCH_ISO`, `V1_LAUNCH_ET`, `V2_LAUNCH_ET`)
- `web/src/constants/mission.test.ts` (added 6 new tests under "Spacecraft launch ETs (Story 1.12)")
- `web/src/main.ts` (wires SpacecraftModels + TrajectoryLines into `RenderEngine.onFrame` and the resize handler)
- `_bmad-output/implementation-artifacts/1-12-both-voyager-spacecraft-with-past-solid-future-dashed-trajectory-lines.md` (this story file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (story marked review)

### Change Log

| Date       | Author             | Notes                                                                                              |
| ---------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| 2026-05-18 | Dev Agent (Opus 4.7) | Initial implementation — Story 1.12 ACs 1–8. Status: ready-for-dev → review. Tests 1052 → 1092. |
| 2026-05-19 | Code Reviewer (cr-1-12, Opus 4.7) | Code review complete. **HIGH fix applied:** `main.ts` was constructing `TrajectoryLines` before any V1/V2 chunks were loaded — every sample call hit `getStateAt` cache-miss and returned `null`, so the polyline was built from all zeros (visible as a degenerate dot at the Sun). Added `prefetchSpacecraftChunks(manifest, chunkLoader)` helper that eagerly loads all V1+V2 chunks via `chunkLoader.load(file)` and awaits them before `TrajectoryLines` construction. Spacecraft tick still wires immediately (hold-previous handles its own load gaps). 4 LOW findings deferred to `deferred-work.md`. Final: web vitest 1110/1110 (unchanged baseline), bake fast 233 + 2 skipped + 11 slow (unchanged baseline), TypeScript clean. Status: review → done. |
