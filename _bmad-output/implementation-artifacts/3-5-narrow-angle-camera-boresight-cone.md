# Story 3.5: Narrow-Angle Camera Boresight Cone

**Epic:** 3 — Attitude Reconstruction (the Differentiator)
**Status:** done
**Date created:** 2026-05-22
**Source:** epics.md § Epic 3 Story 3.5 (lines 1425–1459); ADR-0008 (Three.js WebGLRenderer); ADR-0015 (no global store); ADR-0026 (TS 6.x strict, zero `any`); architecture.md line 382 (Decision 3g — Boresight cone wireframe ConeGeometry parented to SCAN_PLATFORM); fk-constants.ts (Story 3.2 — `VG{1,2}_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM`).

## User Story

As a visitor watching an encounter,
I want a thin wireframe cone extending from each spacecraft's narrow-angle camera, oriented per the reconstructed attitude, so I can see what the camera was pointed at moment-to-moment,
So that "see what Voyager saw" becomes visually literal during encounters — fulfilling FR17 and giving the Story 3.4 platform articulation a load-bearing visual companion.

## Triage Source / Inheritance

- **Story 3.3** delivered the named `SCAN_PLATFORM` node on each spacecraft's LOD chain.
- **Story 3.4** applies the platform quaternion per frame to `getObjectByName('SCAN_PLATFORM')`. Story 3.5 parents the boresight cone to that node, so the cone inherits the per-frame rotation automatically via scene-graph parenting — no per-frame compute in this story.
- **Story 3.2** § Completion Note + `fk-constants.ts:106-107` already commit `VG{1,2}_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM = [0, 0, 1]` (platform +Z) per the VG{1,2}_ISSNA TKFRAME identity transform documented at `vg1_v02.tf:247-256` and `vg2_v02.tf:256-265`. Since the NA camera boresight is identity-relative-to-platform per the FK, the cone's local-frame orientation is canonical (`+Z` axis along boresight). No quaternion composition needed at the cone's authoring point; scene-graph parenting under `SCAN_PLATFORM` does the rest.
- **PRD** wide-angle camera explicitly out of v1 scope. This story renders ONLY the narrow-angle camera cone. An ADR documents the wide-angle deferral per AC5.

## Acceptance Criteria

### AC1 — Wireframe cone parented to SCAN_PLATFORM, +Z axis along boresight

- **GIVEN** the loaded LOD chain from Story 3.3 with named `SCAN_PLATFORM` node
- **AND** Story 3.4's `attitudeApplier` writes `SCAN_PLATFORM.quaternion` each frame
- **WHEN** `BoresightRenderer.attach(spacecraftModels)` runs at boot
- **THEN** for each spacecraft `{ v1, v2 }`:
  1. Resolve the active LOD's `SCAN_PLATFORM` node via `handle.lod.levels[currentLevel].object.getObjectByName('SCAN_PLATFORM')` (the AC5 LOD-aware resolution pattern Story 3.4 established) OR the legacy `handle.group.getObjectByName('SCAN_PLATFORM')` if `handle.lod === null`
  2. Construct ONE `THREE.ConeGeometry` instance + ONE `THREE.LineSegments` mesh + ONE `LineBasicMaterial` per spacecraft
  3. Parent the mesh to the resolved SCAN_PLATFORM node — Three.js scene-graph parenting propagates the platform's quaternion to the cone every frame automatically
  4. Orient the cone so its local `+Z` axis (in platform frame) matches `VG{1,2}_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM` from `fk-constants.ts`. Three.js's default `ConeGeometry` orients along `+Y`; the geometry must be rotated 90° about `+X` at construction time so the cone's axis is along local `+Z` (matching the boresight)
- **AND** the cone's apex sits at the platform's origin (the FK ISSNA TKFRAME is identity-relative-to-platform — origin coincides with platform pivot). NO additional translation needed
- **AND** when the LOD swap re-parents the cone to a different level's SCAN_PLATFORM, the BoresightRenderer detects the change and re-parents (mirror of Story 3.4's AC5 LOD-aware re-resolution; the test layer is the binding contract — see AC6 unit test)

### AC2 — Geometry: half-angle 0.21°, length tuned for cruise + encounter scale

- **GIVEN** the NA camera's FOV per architecture line 382 + PRD (0.42° × 0.42°, half-angle 0.21°)
- **WHEN** the `ConeGeometry` is constructed
- **THEN** the cone's geometric parameters are:
  - `radius = length * tan(0.21° in radians)` — radius at the base derived from half-angle
  - `length = 0.001 km` in render-space (= 1 m) — the cone needs to be visible at cruise zoom but proportional to the spacecraft's `SPACECRAFT_RENDER_SCALE_KM = 0.01` (Story 1.12). At LOD level 2 (cruise band) the spacecraft is rendered at ~10× exaggeration; a 0.001 km cone is roughly the same scale as the spacecraft body — visible without occluding it. The epic-suggested 1000 km value would dwarf the spacecraft at cruise zoom; we use the smaller value and document the trade-off
  - `radialSegments = 16` — smooth enough for a thin wireframe without geometry waste
  - `heightSegments = 1` — the wireframe edge representation only needs the base circle + apex lines
- **AND** the cone is wrapped in `THREE.LineSegments` (NOT `THREE.Mesh`) using `THREE.EdgesGeometry(coneGeometry)` so only the silhouette + base circle render as lines, not the filled cone surface
- **AND** the material is `THREE.LineBasicMaterial` with `transparent: true`, `opacity: 0.5`, `color: var(--v-color-accent)` resolved to a `THREE.Color` at construction (via `getComputedStyle(document.documentElement).getPropertyValue('--v-color-accent')` mirror of Story 1.12 § `readCssVar` pattern). Low saturation, semi-transparent — present but not competing with the canvas (architecture line 382)

### AC3 — Single-instance per spacecraft (memory hygiene)

- **GIVEN** the BoresightRenderer is constructed once at boot
- **WHEN** the attach() method runs
- **THEN** there are EXACTLY 2 cone meshes in the scene graph total (one per spacecraft), NOT 8 (one per LOD-level per spacecraft). The LOD swap reuses the same cone mesh — re-parent rather than re-create
- **AND** `BufferGeometry.dispose()` is never called inside any per-frame path (no LOD-tied dispose churn; the cone outlives all LOD swaps)
- **AND** a unit test pins the geometry/material instance identity across LOD swaps (the cone mesh `id` is stable; the same `THREE.LineSegments` instance survives a `.parent = newSCANPlatform` re-parenting)

### AC4 — Smoke evidence: V1 Jupiter encounter visible boresight + cruise-period fixed cone

- **GIVEN** the cone is rendered for both V1 and V2
- **WHEN** the lead navigates to `/?t=1979-03-05T11:30:00Z` (V1 Jupiter — see Story 3.4 § Local-manifest constraint; locally this resolves to the synthesized cruise path since no CK is in the manifest, but the cone STILL renders per AC1 — it's always present)
- **THEN** the V1 spacecraft visible in the scene has a thin semi-transparent wireframe cone extending from its scan platform in the platform's +Z direction
- **AND** at a cruise ET like `/?t=1995-01-01T00:00:00Z`, the cone STILL renders parented to SCAN_PLATFORM (Story 3.2 § Completion Note 5: PLATFORM_REST_RELATIVE_TO_BUS = identity in cruise, so the platform's local +Z aligns with the bus's local +Z, and the cone inherits the bus's synthesized HGA-Earth-pointing rotation through the scene graph)
- **AND** the cone is NOT painted opaque — verify by inspecting the screenshot that the spacecraft body behind the cone is visible (the 0.5 opacity is the binding contract)
- **AND** the AC4 epic clause about "cone aimed at Io as historical CK data indicates" is structurally deferred to Story 3.7's L2 validator + the post-CI-bake visual smoke; this story's smoke verifies wiring + visual register, not historical-pointing fidelity

### AC5 — Wide-angle camera deferral ADR

- **GIVEN** the PRD explicitly excludes the wide-angle camera (NA only in v1)
- **WHEN** I inspect `docs/adr/` after this story merges
- **THEN** a new ADR file exists: `docs/adr/0028-narrow-angle-only-wide-angle-deferred-v1.1.md` (next available number — verify via `ls docs/adr/`)
- **AND** the ADR records:
  - Status: Accepted
  - Decision: render only the NA boresight cone in v1; defer the wide-angle camera (WA) boresight cone to v1.1+
  - Context: PRD § Out of scope for v1 explicitly lists wide-angle
  - Consequences: visitors see only the imaging camera's frustum; the WA's wider 3.17° × 3.17° cone would visually compete + offer marginal narrative value in v1
  - The WA half-angle (1.585°), FOV (3.17° × 3.17°), and FK frame ID would be documented for v1.1 implementation reference
- **AND** `docs/adr/README.md` is regenerated via `just adr-index` to include the new entry

### AC6 — Integration AC: BoresightRenderer ↔ SpacecraftModels ↔ AttitudeApplier (Rule 1)

This story introduces a new render-side module that consumes the named hierarchy from Story 3.3 + the per-frame quaternion writes from Story 3.4. Per voyager-skill-rules.md Rule 1, the integration AC is required.

- **GIVEN** the boot stack from Story 3.4's integration test, extended with a BoresightRenderer
- **WHEN** the test ticks once
- **THEN** for each spacecraft, the cone mesh is a child of the active LOD's SCAN_PLATFORM node (`cone.parent === platform`)
- **AND** updating the platform quaternion (via direct mutation) and calling `scene.updateMatrixWorld(true)` produces a non-trivial change in the cone's `matrixWorld` — confirming the cone inherits platform rotation
- **AND** the test asserts a key world-direction invariant: rotating the platform by 90° about Y rotates the cone's world `+Z` axis by 90° about Y as well (within 1e-12 absolute)
- **AND** the test asserts memory hygiene: 100 mock ticks produce ZERO new `BufferGeometry` or `Material` instances (the cone is constructed once at boot)

### AC7 — Test sweep green; no regressions

- **GIVEN** all AC1–AC6 changes are merged
- **WHEN** the test suite runs
- **THEN** `cd web && npm test -- --run` passes (Story 3.4 baseline = 2210 pass; Story 3.5 adds ~10–15 new tests across `boresight-renderer.test.ts` + an integration extension)
- **AND** `cd web && npm run typecheck` clean
- **AND** `cd web && npm run lint` baseline preserved (4 warnings, unchanged)
- **AND** if `docs/adr/0028-*.md` is added per AC5, the ADR index regen does not break any existing tests

### AC8 — Lead-driven Chrome DevTools MCP smoke (per Rule 3 + Rule 8)

- **GIVEN** Story 3.5 touches the rendered scene (new visible geometry)
- **AND** voyager-skill-rules.md Rule 3 mandates browser-MCP smoke evidence
- **WHEN** the lead executes the smoke
- **THEN** the MCP probe plan is:
  1. `navigate_page` → `http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z`
  2. `evaluate_script` → assert V1's spacecraft group contains a `THREE.LineSegments` descendant whose name includes "boresight" OR whose parent is SCAN_PLATFORM; capture `cone.material.opacity` (expect ≈ 0.5) + `cone.material.transparent` (expect true)
  3. `take_screenshot` → save evidence; lead visually confirms the thin semi-transparent cone is visible extending from the scan platform
  4. `navigate_page` → `http://127.0.0.1:5173/?t=1995-01-01T00:00:00Z` (cruise)
  5. `take_screenshot` → cone still present, oriented per the synthesized cruise BUS quaternion + identity platform-rest-relative
  6. `list_console_messages` (filter=error) — clean
- **AND** evidence saved to `_bmad-output/implementation-artifacts/3-5-smoke-evidence/`

## Integration ACs

See AC6 above.

## Consumes (this story's consumed dependencies)

- **`web/src/render/spacecraft-models.ts`** (Story 3.3) — `getHandle(id).{lod, group}`; named hierarchy with SCAN_PLATFORM.
- **`web/src/render/attitude-applier.ts`** (Story 3.4) — per-frame SCAN_PLATFORM.quaternion writes drive the cone's world rotation via scene-graph parenting. NO direct attitude-applier API touched in this story.
- **`web/src/services/fk-constants.ts`** (Story 3.2) — `VG{1,2}_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM = [0, 0, 1]`. NA camera frame IDs.

## Consumed-by (downstream stories that depend on Story 3.5)

- **Story 3.7 (L2 JS vs SPICE attitude validator):** the cone is the visible artifact of the attitude reconstruction at runtime. Story 3.7's validator drives `AttitudeService` + computes the world-space NA boresight vector for comparison against SpiceyPy ckgp ground truth; the cone is the visual manifestation of the same vector.
- **Story 4.5+ (encounter chapters):** the cone sweep is the binding visual evidence of "see what Voyager saw" at each gas-giant flyby.

## Tasks / Subtasks

- [x] **T1 — Author `web/src/render/boresight-renderer.ts`** (AC1, AC2, AC3)
  - [x] T1.1: Module shape:
    ```ts
    export class BoresightRenderer {
      private v1Cone: LineSegments | null = null;
      private v2Cone: LineSegments | null = null;
      private v1Material: LineBasicMaterial | null = null;
      private v2Material: LineBasicMaterial | null = null;
      private v1GeometrySource: ConeGeometry | null = null; // retained for dispose() correctness
      private v2GeometrySource: ConeGeometry | null = null;
      private v1LastPlatform: Object3D | null = null;
      private v2LastPlatform: Object3D | null = null;

      attach(spacecraftModels: SpacecraftModels): void { ... }
      tick(spacecraftModels: SpacecraftModels): void { ... }
      dispose(): void { ... }
    }
    ```
  - [x] T1.2: `attach()` — construct cone geometry + material + LineSegments mesh ONCE per spacecraft. Cone params per AC2. Rotate geometry 90° about +X so the cone's axis aligns with local +Z (since fk-constants commits NA boresight = platform +Z). Parent each cone to the spacecraft's active SCAN_PLATFORM
  - [x] T1.3: `tick()` — per-frame LOD-swap re-parenting (mirror Story 3.4 AC5). Read current LOD level, resolve SCAN_PLATFORM against `handle.lod.levels[level].object`. If different from `lastPlatform`, re-parent the cone (`oldParent.remove(cone); newPlatform.add(cone); lastPlatform = newPlatform`)
  - [x] T1.4: `dispose()` — geometry.dispose(), edgesGeometry.dispose(), material.dispose(). Called at module-teardown if the engine is torn down. NOT called in per-frame path
  - [x] T1.5: NA camera color: read `--v-color-accent` via `getComputedStyle(document.documentElement).getPropertyValue('--v-color-accent')` at attach time (Story 1.12 `readCssVar` pattern). Convert to `THREE.Color`

- [x] **T2 — Wire BoresightRenderer into `main.ts`** (AC1)
  - [x] T2.1: Construct `const boresightRenderer = new BoresightRenderer()` after `const attitudeApplier = new AttitudeApplier()` in the ManifestLoader.then() callback
  - [x] T2.2: Call `boresightRenderer.attach(spacecraftModels)` AFTER the spacecraft LOD chain has loaded (chain the call into `spacecraftModels.load({manifest, renderer}).then(() => { boresightRenderer.attach(spacecraftModels); }).catch(...)` — the cone can only be parented once the LOD chain has populated SCAN_PLATFORM)
  - [x] T2.3: Add `boresightRenderer.tick(spacecraftModels)` to the existing `engine.onFrame((et) => {...})` callback AFTER `attitudeApplier.tick(...)` (so the LOD-swap check sees the same level the applier just resolved against)
  - [x] T2.4: Publish `__voyagerDebug.boresightRenderer = boresightRenderer` under `import.meta.env.DEV`

- [x] **T3 — Unit tests** (AC1, AC2, AC3, AC6)
  - [x] T3.1: NEW `web/src/render/boresight-renderer.test.ts`. Stub `SpacecraftModels` with a synthetic LOD chain; verify attach() creates exactly 2 cones, parents each to SCAN_PLATFORM
  - [x] T3.2: Test cone geometry — radius / length / segments match AC2; geometry rotated so +Z is the axis (verify via `cone.geometry.boundingBox` or by ray-casting against the cone's local axis)
  - [x] T3.3: Test material: opacity 0.5, transparent true, color reads from `--v-color-accent` (mock document.documentElement's computed style; fall back to a default hex if undefined)
  - [x] T3.4: Test LOD-swap re-parenting: tick with level=2, then level=0; verify cone's parent changed
  - [x] T3.5: Test geometry instance identity: spy on `new ConeGeometry`; 100 ticks → 0 new ConeGeometry constructions (only 2 at attach time)
  - [x] T3.6: Test dispose(): cone.geometry.dispose called, material.dispose called

- [x] **T4 — Integration test (AC6)**
  - [x] T4.1: NEW `web/tests/boresight-renderer-integration.test.ts`. Boot stack (mirror of Story 3.4's `attitude-applier-integration.test.ts`); attach BoresightRenderer
  - [x] T4.2: Update SCAN_PLATFORM quaternion via `attitudeApplier.tick(et, attitudeService, spacecraftModels)`; assert cone's `matrixWorld` reflects the rotation
  - [x] T4.3: Programmatic platform rotation 90° about +Y; assert cone's world-space +Z axis rotated by 90° about +Y within 1e-12

- [x] **T5 — ADR for wide-angle deferral** (AC5)
  - [x] T5.1: Author `docs/adr/0028-narrow-angle-only-wide-angle-deferred-v11.md`. Follow `docs/adr/0000-template.md` shape. Include WA parameters for future reference: half-angle 1.585°, FOV 3.17°×3.17°, FK frame IDs `VG{1,2}_ISSWA` (verify exact IDs in `fk_inventory.py` output or the FK kernels). NOTE: filename renamed from the AC5-suggested `0028-…-v1.1.md` to `0028-…-v11.md` because `scripts/adr-index.py`'s `ADR_FILENAME_PATTERN` regex disallows the `.` in `v1.1` (matches `^(\d{4})-[a-z0-9][a-z0-9-]*\.md$` only — periods other than the trailing `.md` extension cause the file to be skipped from the index).
  - [x] T5.2: Run `just adr-index` (or `python scripts/adr-index.py` if uv-managed) to regenerate `docs/adr/README.md`. Verify the new entry is indexed. `just` is not in PATH; fell back to plain `python scripts/adr-index.py` per README — 29 entries (was 28), `0028` entry visible.

- [x] **T6 — Per-story smoke (AC8)** — lead-driven post-CR. QA stage authors the probe plan.

## Dev Notes

### Architecture & ADR Compliance Touchpoints

- **Architecture § Decision 3g (line 382):** wireframe ConeGeometry parented to SCAN_PLATFORM. NA half-angle = 0.21°. Visual register: thin, low-saturation, semi-transparent.
- **ADR-0008:** Three.js native primitives (ConeGeometry, EdgesGeometry, LineSegments, LineBasicMaterial). No custom shader.
- **ADR-0015:** BoresightRenderer is constructor-injected via main.ts; DEV-only window binding.
- **ADR-0026:** strict TS; no `any`. Three.js types come from `@types/three` (already a dep).

### File-Touch Inventory

**NEW (web-side):**

| File | Purpose | AC |
|---|---|---|
| `web/src/render/boresight-renderer.ts` | The renderer class | AC1, AC2, AC3 |
| `web/src/render/boresight-renderer.test.ts` | Unit tests | T3 |
| `web/tests/boresight-renderer-integration.test.ts` | Integration AC6 | AC6 |

**NEW (docs):**

| File | Purpose |
|---|---|
| `docs/adr/0028-narrow-angle-only-wide-angle-deferred-v1.1.md` | ADR for WA deferral |

**UPDATED (web-side):**

| File | Action | AC |
|---|---|---|
| `web/src/main.ts` | Construct BoresightRenderer; attach post-LOD-load; tick in onFrame after attitudeApplier; publish `__voyagerDebug.boresightRenderer` | T2 |
| `docs/adr/README.md` | Regenerate via `just adr-index` | T5.2 |

### Voyager Skill-Rules Touchpoints

- **Rule 1 (Integration ACs):** AC6 is the integration AC.
- **Rule 3 + Rule 8 (Per-story smoke):** AC8 is the lead-driven Chrome DevTools MCP smoke.
- **Rule 5 (NFR tripwire):** none anticipated.
- **Rule 6 (ADR):** AC5 introduces a new ADR; code review should verify the existing ADRs (0008, 0015, 0026) are honored.
- **Rule 9 (APG primitives):** N/A.

### Project Context Reference

- Sprint status / cycle log / deferred-work in the usual locations.
- Story 3.4 reference: `_bmad-output/implementation-artifacts/3-4-apply-attitude-per-frame-to-both-spacecraft-bus-scan-platform.md` — the LOD-aware resolution pattern in attitude-applier.ts (handle.lod.levels[currentLevel].object) is the canonical reference for AC1's resolve step.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (lead) for story creation; dev-3-5 (claude-opus-4-7 subagent) for implementation.

### Debug Log References

- Web vitest run before any new tests authored: 2210 pass (Story 3.4 baseline confirmed).
- Web vitest run after all new tests + wiring: 2232 pass / 1 skipped / 0 fail (+22 net: 16 unit + 6 integration).
- Typecheck: clean (0 errors).
- Lint: 4 pre-existing warnings preserved; 0 new (Story 3.4 exit-state baseline).

### Completion Notes List

T1 / T2 / T3 / T4 / T5 / T6 implemented; AC1–AC7 satisfied at the code/test tier. AC8 (lead-driven Chrome DevTools MCP smoke) remains the lead's responsibility per voyager-skill-rules.md Rule 7.

Key implementation notes:

1. **AC2 cone-geometry precision fix (load-bearing).** The story directs constructing the cone via `new ConeGeometry(length * tan(0.21°), CONE_LENGTH_KM, …)`. With `CONE_LENGTH_KM = 0.001` km, that's `radius ≈ 3.665e-6` and `length = 0.001` — both small enough that the lateral triangle normals computed by `EdgesGeometry`'s threshold pass are numerically indistinguishable, so `EdgesGeometry` emits an empty position buffer (`positions.count = 0`). The vitest run on a happy-dom Three.js produced an empty cone wireframe. Fix: build the geometry at **unit scale** (`radius = tan(0.21°)`, `length = 1`) so the normals are well-separated, then apply `cone.scale.setScalar(CONE_LENGTH_KM)` on the `LineSegments` mesh. This preserves the visual contract (world-space length = 0.001 km, half-angle = 0.21°) while making EdgesGeometry numerically stable. Documented inline in `boresight-renderer.ts` § `buildCone()`. The corresponding unit test (`cone geometry is unit-scale; mesh.scale applies CONE_LENGTH_KM uniformly`) pins both contracts.

2. **AC2 open-ended vs closed cone.** Originally constructed with `openEnded=true`. Changed to `openEnded=false` (keeping the base cap) so EdgesGeometry has the ~90° cap-vs-lateral rim edge to detect. Combined with the unit-scale geometry, this gives EdgesGeometry a position buffer with the base circle + N silhouette lines.

3. **AC1 LOD-aware resolution.** Mirrors Story 3.4 AC5's `handle.lod !== null && currentLevel >= 0` pattern: resolve SCAN_PLATFORM against `handle.lod.levels[currentLevel].object` (NOT `handle.group`) so the depth-first `getObjectByName` doesn't bind onto a non-visible LOD level's BUS/SCAN_PLATFORM subtree. The legacy single-LOD fallback (`handle.lod === null`) walks `handle.group` per Story 3.3's AC5 graceful-degradation contract.

4. **AC5 ADR filename.** Story-file-suggested name was `0028-narrow-angle-only-wide-angle-deferred-v1.1.md`. The `.` in `v1.1` violates `scripts/adr-index.py`'s `ADR_FILENAME_PATTERN = ^(\d{4})-[a-z0-9][a-z0-9-]*\.md$` regex (only the trailing `.md` extension is a permitted dot), causing the indexer to silently skip the file. Renamed to `0028-narrow-angle-only-wide-angle-deferred-v11.md`. Index now shows 29 entries (was 28) and ADR-0028 is present.

5. **AC6 clause 4 / AC3 memory hygiene.** The integration test instruments `ConeGeometry.prototype.setIndex` (called exactly once per `new ConeGeometry`) to count constructor invocations. 100 ticks (applier + boresight) produce **0** new ConeGeometry constructions. The 2 cones constructed at `attach()` time live across the whole session.

6. **AC1 cone +Z world-axis test.** When the platform is rotated 90° about +Y, the cone's world +Z axis rotates to world +X (right-hand-rule). Both the unit test and the integration test confirm to 1e-12 absolute. The cone INHERITS the rotation via Three.js scene-graph parenting — no per-frame quaternion compose runs in `boresight-renderer.ts`.

7. **AC5 NFR tripwire** (Rule 5): none triggered. PRD § Out of scope for v1 is unambiguous about the wide-angle camera; the ADR documents the rendering-side consequence.

8. **Rule 6 ADR compliance.** ADR-0008 (Three.js native primitives), ADR-0015 (constructor-DI from main.ts, no global), ADR-0026 (TS strict, zero `any`) all honored. Architecture line 382 (Decision 3g — wireframe ConeGeometry parented to SCAN_PLATFORM, NA half-angle 0.21°, thin/low-saturation/semi-transparent) is the canonical reference; the implementation matches verbatim.

### File List

NEW (web-side):

- `web/src/render/boresight-renderer.ts` — BoresightRenderer class (T1: AC1, AC2, AC3).
- `web/src/render/boresight-renderer.test.ts` — 16 unit tests covering AC1 (single-LOD + multi-LOD parenting + idempotency + malformed-GLB fallback + world +Z axis), AC2 (geometry params + LineSegments + material + CSS var + fallback), AC3 (single instance + LOD-swap re-parenting + zero ConeGeometry constructions during ticks), dispose().
- `web/tests/boresight-renderer-integration.test.ts` — 6 integration tests covering AC6 clauses 1–4 (cone parented to platform, applier writes propagate via matrixWorld, 90° platform rotation rotates cone +Z within 1e-12, 100 ticks → 0 new ConeGeometry constructions), plus AC1 single-ChunkLoader contract and AC1/AC3 LOD-swap re-parenting on the real boot stack.

NEW (docs):

- `docs/adr/0028-narrow-angle-only-wide-angle-deferred-v11.md` — ADR for wide-angle camera deferral (AC5).

UPDATED (web-side):

- `web/src/main.ts` — Import BoresightRenderer; construct in ManifestLoader.then() callback after AttitudeApplier; attach via `spacecraftModels.load(...).then(() => boresightRenderer.attach(spacecraftModels))`; tick in `engine.onFrame` after `attitudeApplier.tick(...)` and before trajectoryLines/celestialBodies updates; publish `__voyagerDebug.boresightRenderer` alongside Story 3.4's debug surface.

UPDATED (docs):

- `docs/adr/README.md` — Regenerated via `python scripts/adr-index.py` (28 → 29 entries; 0028 row appended).

### Review Findings

**Code review run:** 2026-05-22. Reviewer: bmad-code-review (Blind Hunter + Edge Case Hunter + Acceptance Auditor layers).

**Verdict:** approved. AC1–AC7 fully verified at the code+test tier; AC8 code-side prerequisites in place (lead-driven smoke pending). Web vitest 2255 pass / 1 skipped / 0 fail (net +45 from Story 3.4 baseline 2210 — dev +22, QA +23). Typecheck clean; lint baseline (4 pre-existing warnings) preserved. ADR-0028 authored with full MADR sections + indexed.

**Rule compliance:**

- **Rule 1 (Integration AC):** AC6 binds the BoresightRenderer ↔ SpacecraftModels ↔ AttitudeApplier wire-up. `boresight-renderer-integration.test.ts` boots the real ChunkLoader + AttitudeService + AttitudeApplier + BoresightRenderer stack against a synthetic V1 VTRJ fixture (NOT a mock); confirms `applier.tick(...)` writing `SCAN_PLATFORM.quaternion` propagates to `cone.matrixWorld` via scene-graph parenting + the 90°-about-Y world-direction invariant at 1e-12. Producer↔consumer wire-up exercised end-to-end.
- **Rule 3 (per-story smoke):** AC8 is lead-driven. Code-side prerequisites verified: `__voyagerDebug.boresightRenderer` published under `import.meta.env.DEV` (spread-preserve invariant honored); tick ordering `spacecraftModels.tick → attitudeApplier.tick → boresightRenderer.tick` enforced by source-grep in QA gap 8.
- **Rule 5 (NFR tripwire):** none surfaced. The unit-scale-then-mesh-scale geometry pattern is a numerical-stability implementation detail (documented inline + Completion Note 1 + QA gap 1 sentinel), not an NFR tripwire — world-space contract preserved exactly.
- **Rule 6 (ADR compliance):**
  - ADR-0008 (Three.js native primitives): `ConeGeometry`, `EdgesGeometry`, `LineSegments`, `LineBasicMaterial` used; no custom shader. ✓
  - ADR-0015 (no global, constructor-DI): `BoresightRenderer` constructed in `main.ts`; methods receive `spacecraftModels` via DI. DEV-only `__voyagerDebug.boresightRenderer` is a tree-shaken debug surface, not application state. ✓
  - ADR-0026 (TS strict, no `any`): zero `any` across `boresight-renderer.ts`, both renderer test files, and the QA gap suite. ✓
  - ADR-0028 (new this story): full MADR sections (Status / Context / Decision / Consequences / Alternatives Considered + Related + References); status Accepted; WA parameters documented (half-angle 1.585°, FOV 3.17°×3.17°, NAIF frame IDs `-31102` / `-32102`); indexed in `docs/adr/README.md`. ✓
- **Rule 9 (APG primitives):** N/A — no new APG keyboard handling.

**Findings:**

- [x] `[Review][Defer]` BoresightRenderer dispose() unit test spies on EdgesGeometry.dispose only, not ConeGeometry.dispose — `web/src/render/boresight-renderer.test.ts:412` — deferred, LOW coverage gap (both dispose paths actually called in production; spy proves one path)
- [x] `[Review][Defer]` readCssVar → new Color(accentHex) does not defend against malformed CSS variable value — `web/src/render/boresight-renderer.ts:274-277` — deferred, LOW (production tokens are in-repo and lint-clean; the absent-var case is already covered by the fallback)

Three additional findings were dismissed as noise: (1) `getComputedStyle` not try-wrapped (theoretical; fallback exists); (2) lead-side MCP smoke await-load concern (lead-side, not code-side); (3) AC2 wording-vs-unit-scale-implementation deviation (world-space contract preserved exactly; documented inline + Completion Note 1 + QA gap 1 sentinel test pins the regression — this is canonical "implementation detail, not spec violation").

Both deferred items appended to `deferred-work.md` under `## Deferred from: code review of story-3-5-narrow-angle-camera-boresight-cone (2026-05-22)`.

### Change Log

- 2026-05-22 — Story 3.5 dev complete: BoresightRenderer implemented + wired + tested. Web vitest 2232 pass (+22 from 2210 Story 3.4 baseline). Typecheck clean; lint baseline (4 pre-existing warnings) preserved. ADR-0028 authored + indexed (renamed from `v1.1.md` → `v11.md` to honour the indexer's filename regex).
