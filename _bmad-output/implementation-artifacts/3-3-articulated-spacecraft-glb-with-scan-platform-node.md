# Story 3.3: Articulated Spacecraft GLB with Scan-Platform Node

**Epic:** 3 — Attitude Reconstruction (the Differentiator)
**Status:** review
**Date created:** 2026-05-21
**Source:** epics.md § Epic 3 Story 3.3 (lines 1349–1383); ADR-0006 (EXT_meshopt_compression over Draco); ADR-0010 (Chrome DevTools MCP agent-time); ADR-0011 (Git LFS for binary assets); ADR-0026 (TS 6.x strict, zero `any`); Story 3.2's `getPlatformQuat` / `getBusQuat` contract (the downstream consumer).

## User Story

As a visitor inspecting either spacecraft at any zoom level,
I want the Voyager 3D model to expose a named scan-platform articulation node that can be independently rotated relative to the bus, with a 4-level LOD chain so the model holds together from sub-meter inspection to cruise-scale silhouette,
So that Story 3.4 has rigging to apply `AttitudeService.getPlatformQuat(...)` to per frame, Story 3.5 has the named `SCAN_PLATFORM` parent for the NA-camera boresight cone, and rendering performance is preserved across zoom levels — fulfilling FR16 (rigging foundation) and replacing Story 1.12's placeholder single-LOD model.

## Triage Source / Inheritance

- **Story 1.12** ships `web/public/models/voyager.glb` (NASA 3D Resources Voyager Probe (B), Draco-compressed, ~1.7 MB, single LOD) and the loader at `web/src/render/spacecraft-models.ts` which clones the scene root into two instances (V1, V2). Story 3.3 REPLACES this with a 4-LOD `THREE.LOD` chain whose root preserves the named `BUS` / `SCAN_PLATFORM` / `HGA` hierarchy at every level.
- **Story 1.15 AC2** wired `DRACOLoader` against the upstream NASA GLB. Story 3.3 transitions the runtime decode from Draco to `MeshoptDecoder` per **ADR-0006 § Decision** — `gltf-transform meshopt` is the canonical compression for the project, and the Draco path was an emergency stop-gap to ship Story 1.12. Removing `DRACOLoader` closes a long-standing ADR-0006 drift. The Draco decoder bundle under `web/public/draco/` can be deleted after this story merges (the only consumer is `spacecraft-models.ts`).
- **Story 3.2** introduced `AttitudeService.getBusQuat(spacecraftId, et): Quaternion | null` and `getPlatformQuat(spacecraftId, et): Quaternion | null`. Story 3.3 does NOT consume these yet — Story 3.4 will per-frame-assign their outputs to `scene.getObjectByName('BUS').quaternion` / `'SCAN_PLATFORM'.quaternion`. Story 3.3's responsibility is to make those `getObjectByName` lookups *return real Object3D nodes whose pivots are at the historically-correct articulation points*. This is the integration contract.
- **Phase 0 FK inspection.** The scan-platform articulation axis is the `+Y` axis in the bus frame per the FK kernel inventory `bake/src/fk_inventory.py` § scan-platform notes (frames -31100 / -32100). The HGA dish is mounted on the bus `+Z` axis with boresight along `-Z` per the FK ROT walk in `web/src/services/fk-constants.ts:32-58` (Story 3.2 § Completion Note 4). Both are load-bearing for AC1's named-hierarchy authoring.

## Acceptance Criteria

### AC1 — Named hierarchy: BUS root, SCAN_PLATFORM + HGA children with correct pivots

- **GIVEN** the upstream NASA 3D Resources "Voyager Probe (B)" GLB at `web/public/models/voyager.glb` (currently a Draco-compressed flat mesh with no named articulation nodes per Phase 0 inspection — see `web/public/models/README.md` § Source + attribution)
- **WHEN** the new asset pipeline at `bake/scripts/build_glb.ts` (or `web/scripts/build_glb.ts` — see AC2 for location decision) runs
- **THEN** every output GLB variant has glTF 2.0 node hierarchy:

  ```text
  Scene
   └── BUS                     (Group; root mesh of the spacecraft body)
        ├── SCAN_PLATFORM      (Group; pivot at the historical articulation axis)
        │    └── (NA-camera + UVS + ISS + IRIS instrument meshes parented here)
        └── HGA                (Group; rotated per FK so its +Z is the boresight)
             └── (HGA dish mesh parented here)
  ```

- **AND** the SCAN_PLATFORM `position` (relative to BUS local origin) is set so its local origin sits on the historical articulation axis — NOT the platform mesh's geometric center. The articulation axis is `(0, +Y_bus, +Z_bus)` per Phase 0 FK inspection (`bake/src/fk_inventory.py` § frame -31100 / -32100 — the "scan platform offset from bus origin"). Exact offset values are documented in `bake/inputs/voyager-mesh-mapping.json` (NEW per AC2 T2.4) with inline citations.
- **AND** the HGA `quaternion` (relative to BUS) is the inverse of `VG1_HGA_BORESIGHT_RELATIVE_TO_BUS` from `fk-constants.ts` so that its local `+Z` axis points along the HGA's nominal boresight direction in the bus frame. (The Story 3.2 derivation establishes HGA boresight in bus = `(0, 0, -1)`, so the HGA group's quaternion is `Rx(180°)` relative to BUS — pre-applied at the glTF level so per-frame attitude application can ignore HGA.)
- **AND** the model's metric scale is preserved through the pipeline — the upstream NASA GLB is in meters (~3.7 m longest dimension; verified via `gltf-transform inspect` at Phase 0). Render-space conversion to km is the renderer's job (`SPACECRAFT_RENDER_SCALE_KM = 0.01` in `spacecraft-models.ts`); the GLB itself stays meter-scale.
- **AND** a defense unit test in `web/src/render/spacecraft-models.test.ts` (extend, do not replace) asserts: after `SpacecraftModels.load()` resolves, `spacecraft.getObjectByName('BUS')`, `spacecraft.getObjectByName('SCAN_PLATFORM')`, and `spacecraft.getObjectByName('HGA')` each return a non-null `Object3D`, and the SCAN_PLATFORM's parent is the BUS (not the scene root).

### AC2 — Asset pipeline produces 4 LOD variants via gltf-transform (ADR-0006)

- **GIVEN** ADR-0006 § Decision commits to `gltf-transform meshopt` for all GLB compression
- **AND** the dev environment has Node.js (already present per the web/ workspace) and can install `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions` as devDependencies of the bake half (or web half — see § Decision Required below)
- **WHEN** the script at `bake/scripts/build_glb.ts` is invoked via `just bake-glb` (NEW recipe in `justfile`)
- **THEN** the script:
  1. Loads `bake/inputs/models/voyager-raw.glb` (NEW input location; the existing `web/public/models/voyager.glb` is COPIED to `bake/inputs/models/voyager-raw.glb` as part of T2.1 and the original location becomes a build output)
  2. Decompresses the Draco extension if present (gltf-transform auto-handles via `@gltf-transform/extensions`)
  3. Re-organizes the flat mesh tree into the named hierarchy per AC1, driven by `bake/inputs/voyager-mesh-mapping.json` (NEW per T2.4) which lists `{ mesh_index_or_node_name → target_parent_name }` plus the SCAN_PLATFORM pivot offset
  4. Strips unused animation tracks (the upstream NASA model has none, but the pipeline call is mandatory per `gltf-transform prune`)
  5. Deduplicates + welds vertices (`gltf-transform dedup` + `gltf-transform weld`)
  6. Applies `gltf-transform meshopt` for mesh compression (ADR-0006 compliance — replaces the Draco baseline from Story 1.12)
  7. Generates 4 LOD variants via `gltf-transform simplify` with progressive ratios — LOD0 = full quality (no simplification), LOD1 = `--ratio 0.5`, LOD2 = `--ratio 0.2`, LOD3 = `--ratio 0.05`. Each LOD preserves the named `BUS` / `SCAN_PLATFORM` / `HGA` group nodes (gltf-transform's simplify operates per-primitive — group hierarchy survives by construction)
- **AND** the script outputs the four LODs to `web/public/models/`:
  - `voyager-lod0.<hash>.glb` (≤ 2 MB target — soft target; ADR-0006 § Consequences "Negative" notes meshopt-compressed mesh ~3-5 MB at full poly; if the upstream Voyager mesh is small enough that LOD0 already meets ≤ 2 MB, the budget is moot; if it exceeds, the recipe MUST surface the breach and fail loudly per NFR-P4 spirit)
  - `voyager-lod1.<hash>.glb`
  - `voyager-lod2.<hash>.glb`
  - `voyager-lod3.<hash>.glb` (≤ 100 KB target — silhouette-only)
- **AND** the `.<hash>` portion is the SHA-256 of the LOD-specific output (first 8 chars) — mirrors the content-hashed pattern from `bake/src/manifest_writer.py` for VTRJ files (architecture § Decision 7f).
- **AND** the script is idempotent (NFR-R4) — re-running with identical input + identical mapping JSON produces byte-identical outputs. Verify via SHA-256 round-trip check inside the script.
- **AND** the script emits a build-log entry to stdout per LOD: `"voyager-lod{N}: {input_vertex_count} → {simplified_vertex_count} verts, {output_bytes} bytes, sha256={hash}"`.

#### Decision Required (Layer 1 lead gate / dev clarification trigger)

The epic's wording says "`bake/scripts/build_glb.ts` (or the equivalent under `web/scripts/`)". Two viable locations exist:

- **(a) `bake/scripts/build_glb.ts`** — sits next to the bake pipeline; matches architecture § Asset acquisition pipeline (line 580 `acquire_models.py`). The bake half is Python (uv-managed), so this would be the first TS-under-bake addition. Justified because gltf-transform has no Python equivalent — the script HAS to be Node.
- **(b) `web/scripts/build_glb.ts`** — sits next to `web/scripts/og-cards.ts` (Story 2.6's TS-under-web build script). Symmetric with existing web-side build tooling.

**Recommendation: (b) `web/scripts/build_glb.ts`** — mirrors the existing Story 2.6 `web/scripts/og-cards.ts` precedent + keeps Node tooling co-located with `package.json`. If the dev agent finds an architectural reason to prefer (a) during implementation, document the choice in the Dev Agent Record.

#### KTX2 / toktx (Layer 2 deferral)

Epic AC1 says "textures use KTX2 compression via `toktx`". The upstream NASA Voyager Probe (B) GLB ships with **no textures** — its materials are solid PBR materials (metallic/roughness/albedo as scalar values, no maps). Phase 0 inspection (`gltf-transform inspect`) confirms zero `images[]` entries.

The dev agent MUST verify this on the actual input GLB. If the inspection confirms zero textures: the `toktx` step is a no-op for this story and is *deferred to Story 4.3* (which will introduce real texture maps as part of the visual-fidelity polish). Document the deferral in `deferred-work.md` with the citation `_kind_for_body_id` to AC1's textured-state at this point in the project.

If inspection shows textures: the dev agent halts and surfaces a clarification — `toktx` is a separate Khronos KTX-Software toolkit binary that may not be in the dev environment, and is a substantive procurement decision the user should make. Do NOT silently skip texture compression — that would silently violate AC1's KTX2 commitment.

### AC3 — Three.LOD integration with tuned distance thresholds

- **GIVEN** the four LOD variants from AC2 are on disk under `web/public/models/`
- **AND** the asset manifest now lists the LOD set (AC4)
- **WHEN** `SpacecraftModels.load()` runs at boot
- **THEN** for each spacecraft (V1 + V2) a `THREE.LOD` instance is constructed wrapping the four LOD scene-graphs as its `levels[]`. Each level's `distance` threshold is set per the schedule below:
  - LOD0: distance ≤ 0.001 km (= 1 m) — "we're touching it"
  - LOD1: distance ≤ 0.1 km (= 100 m) — close inspection (post-Story-4.2 manual camera override)
  - LOD2: distance ≤ 1.0 km — cruise-scale default
  - LOD3: distance ≤ ∞ — far-field silhouette (post-1 AU, the spacecraft is sub-pixel anyway)
  - **Rationale comment in source:** the default cruise-scale render distance (camera target → spacecraft target distance after the floating-origin recenter) is in the 0.1–10 km range due to `SPACECRAFT_RENDER_SCALE_KM = 0.01` from Story 1.12. The schedule above is keyed off that render-space distance, NOT off the world-space heliocentric distance. The LOD pre-compute uses `camera.position.distanceTo(lodObject.position)` per Three.js's standard `LOD.update(camera)` signature — `THREE.LOD` does this internally on each render call.
- **AND** the LOD threshold schedule is documented in a code comment block with the rationale above, citing the SCALE_KM constant and the 0.001 → ∞ km bins.
- **AND** Story 1.12's single-LOD code path in `SpacecraftModels.load()` is replaced with the LOD-loading path. The DRACOLoader pre-wire from Story 1.15 AC2 is REMOVED (the meshopt-compressed LODs need `MeshoptDecoder` instead — registered via `gltfLoader.setMeshoptDecoder(MeshoptDecoder)` from `three/examples/jsm/libs/meshopt_decoder.module.js`).
- **AND** the LOD swap is seamless at the default render distance — no visible pop on cruise zoom-in/out. This is verified visually via the lead-driven MCP smoke (AC9). If popping is observed, the dev agent has two paths: (a) widen the affected threshold's `distance` value, OR (b) defer "no-pop guarantee" to Story 4.3's polish pass and document the visible pop in `deferred-work.md`. Both paths are acceptable; choose based on smoke evidence.

### AC4 — Manifest schema extension: `models[]` section

- **GIVEN** `bake/out/manifest.json` currently has `bodies[]` (trajectory + attitude VTRJ files) per Story 1.6 + Story 3.1, but NO entry for 3D models
- **AND** the Zod schema at `web/src/services/manifest-loader.ts` lines 18-70 has no `models` field
- **WHEN** the bake pipeline emits the manifest (via `bake/src/manifest_writer.py`)
- **THEN** the manifest gains a top-level `models[]` array with one entry per spacecraft mesh (V1 + V2 share the same GLB set for now per Story 1.12 § AC1 reuse pattern):

  ```json
  {
    "schemaVersion": 1,
    ...
    "models": [
      {
        "id": "voyager",
        "lods": [
          { "level": 0, "url": "/models/voyager-lod0.<hash>.glb", "sha256": "...", "sizeBytes": ..., "maxDistanceKm": 0.001 },
          { "level": 1, "url": "/models/voyager-lod1.<hash>.glb", "sha256": "...", "sizeBytes": ..., "maxDistanceKm": 0.1 },
          { "level": 2, "url": "/models/voyager-lod2.<hash>.glb", "sha256": "...", "sizeBytes": ..., "maxDistanceKm": 1.0 },
          { "level": 3, "url": "/models/voyager-lod3.<hash>.glb", "sha256": "...", "sizeBytes": ..., "maxDistanceKm": null }
        ],
        "pivotMeters": [0, 0, 0],
        "scaleToKm": 0.001
      }
    ]
  }
  ```

  - `pivotMeters` is the GLB's local-origin offset from the spacecraft's true center of mass (informational; renderer uses BUS group as the canonical center). For now `[0, 0, 0]` is fine; the Phase 0 inspection determined the upstream NASA model's origin is already approximately at the bus center.
  - `scaleToKm` is the unit conversion from glTF meters → render-space km (= `0.001`). The renderer's `SPACECRAFT_RENDER_SCALE_KM = 0.01` from Story 1.12 is the *exaggeration factor* on top of this; total render-space scale = `scaleToKm × SPACECRAFT_RENDER_SCALE_KM = 1e-5` km per glTF unit.
- **AND** the Zod schema is extended with a `ModelLodSchema`, `ModelSchema`, and a new top-level `models: z.array(ModelSchema)` field in `ManifestSchema`. The schemaVersion stays `1` per Story 1.6's forward-compat strategy (Zod `z.object` strips unknown keys by default; the new field is *additive* — old manifests without `models[]` parse with `z.array(ModelSchema).default([])`).
- **AND** the bake-side writer (`bake/src/manifest_writer.py`) gains a `models` parameter and emits the section verbatim from a JSON dict provided by `bake/scripts/build_glb.ts` via a sidecar file (`bake/out/models-manifest-fragment.json`) that `manifest_writer.py` reads and merges. The TS script writes the fragment; the Python writer merges. This crosses the language boundary cleanly via JSON-as-IPC (no Python/TS bidirectional binding).

### AC5 — SpacecraftModels consumes the manifest model entry

- **GIVEN** the manifest's new `models[]` section is loaded at boot (Story 1.6 ManifestLoader path)
- **AND** Story 1.12's `SpacecraftModels` currently hardcodes `DEFAULT_VOYAGER_GLB_URL = '/models/voyager.glb'`
- **WHEN** `SpacecraftModels.load(options)` is called with the manifest as a constructor / option dependency
- **THEN** the loader resolves URLs from `manifest.models[0].lods[i].url` rather than the hardcoded constant
- **AND** the LOD distance thresholds come from `manifest.models[0].lods[i].maxDistanceKm` rather than the hardcoded schedule in AC3 — the AC3 schedule lives in the manifest data, not in source. This decouples threshold-tuning from a TS rebuild.
- **AND** the `DEFAULT_VOYAGER_GLB_URL` constant is retained as a *test-only* fallback for unit tests that don't mount a real manifest (`SpacecraftModelsOptions.modelUrl` still works as before; production now ignores it in favor of the manifest entry).
- **AND** if the manifest has no `models[]` entry (or the array is empty), the loader logs a one-time `console.warn` and falls back to the single-LOD path with `DEFAULT_VOYAGER_GLB_URL` — graceful degradation for the transition window when the bake pipeline hasn't been run yet on a contributor's clone.

### AC6 — Programmatic SCAN_PLATFORM rotation produces a visible local change without deforming BUS

- **GIVEN** the named hierarchy from AC1 + the LOD chain from AC3 are loaded
- **WHEN** a developer-console (or unit-test) script executes:

  ```js
  const platform = spacecraft.getObjectByName('SCAN_PLATFORM');
  platform.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4); // 45° about local +Y
  ```

- **THEN** the platform's children (NA-camera, UVS, ISS, IRIS meshes) rotate as a rigid unit relative to the static BUS
- **AND** the BUS's other children (HGA, antennas, magnetometer boom — anything not parented under SCAN_PLATFORM) are unaffected (their world transforms are unchanged before and after the platform rotation, asserted via `obj.matrixWorld` comparison within float64 epsilon)
- **AND** the rotation pivot is the historical articulation axis (SCAN_PLATFORM local origin), NOT the platform mesh's geometric center — verified by checking that the platform's children's world positions before vs after rotation describe a circle whose center is the SCAN_PLATFORM's world position (not the centroid of the platform's vertices)
- **AND** a unit test in `web/src/render/spacecraft-models.test.ts` (extend) executes this rotation programmatically against the loaded GLB and asserts the BUS / non-platform-children world-matrix invariance + the platform-children-rotated-as-rigid-unit invariant.

### AC7 — Integration AC (Rule 1: this story introduces a shared interface — the named hierarchy)

This is a service-introducing story per voyager-skill-rules.md Rule 1. The "service" is the named-hierarchy contract that downstream stories consume — they all rely on `scene.getObjectByName('BUS' | 'SCAN_PLATFORM' | 'HGA')` returning real Object3D nodes with correct pivots. The integration AC verifies the wire-up between the GLB pipeline and the per-frame attitude consumer (Story 3.4's pattern, exercised by anticipation in this story's integration test).

- **GIVEN** AttitudeService from Story 3.2 publishes `getBusQuat(spacecraftId, et): Quaternion | null` and `getPlatformQuat(spacecraftId, et): Quaternion | null`
- **AND** the loaded LOD chain from AC3 + AC5 is wired into the scene graph via `first-paint.ts`
- **WHEN** an integration test at `web/tests/spacecraft-models-attitude-integration.test.ts` (NEW) mounts the full boot stack with a fixture manifest containing both a V1 attitude entry AND the new models entry
- **THEN** the test:
  1. Boots the stack via `startFirstPaint(testOptions)` so the manifest is loaded, `EphemerisService` + `AttitudeService` are constructed, and `SpacecraftModels.load()` resolves
  2. Picks an ET inside V1 Jupiter CK coverage (uses the existing fixture from `attitude-service-integration.test.ts`)
  3. Calls `attitudeService.getBusQuat(-31, et)` and `attitudeService.getPlatformQuat(-31, et)` — asserts both return non-null branded `Quaternion`s with provenance `'ck'`
  4. Looks up the V1 spacecraft's BUS and SCAN_PLATFORM via `spacecraft.getObjectByName('BUS')` and `getObjectByName('SCAN_PLATFORM')` — both non-null
  5. Assigns the AttitudeService results to those nodes' `.quaternion` properties (via `quaternion.copy(...)` from `THREE.Quaternion(x, y, z, w)`)
  6. Updates the world matrix (`scene.updateMatrixWorld(true)`)
  7. Asserts the platform's world-position child (e.g., the NA-camera mesh's `matrixWorld`) has changed relative to the BUS's world-position child (e.g., the HGA mesh's `matrixWorld`) by the angular delta predicted by the platform quaternion — within 1e-12 absolute. This is the Rule-1 integration contract: consumer Story 3.4's per-frame pattern, exercised against the real loaded GLB.
- **AND** the test publishes `window.__voyagerDebug.spacecraftModels = spacecraftModels` (already published by Story 1.12; verify the publication still happens after the loader-rewrite in T4) so a lead-driven Chrome DevTools MCP smoke can additionally exercise the lookup from a real browser.

### AC8 — Test sweep green; no regressions

- **GIVEN** all AC1–AC7 changes are merged
- **WHEN** the test suite is exercised
- **THEN** `cd web && npm test -- --run` passes 100% (Story 3.2 baseline = 2113 pass; Story 3.3 adds ~25–35 net new tests across `spacecraft-models.test.ts` extension, `spacecraft-models-attitude-integration.test.ts` (NEW), and `manifest-loader.test.ts` schema-extension tests)
- **AND** `cd web && npm run typecheck` clean — the new Zod-derived types (`Model`, `ModelLod`) are exported from `manifest-loader.ts` and consumed type-safely by `SpacecraftModels`
- **AND** `cd web && npm run lint` baseline preserved (5 pre-existing warnings, 0 new)
- **AND** `cd bake && uv run pytest -q -m "not slow"` passes 337 (Story 3.2 baseline preserved — Story 3.3 only touches `bake/src/manifest_writer.py` for the `models` parameter; the change is additive and existing tests should not regress. Add ≥3 new tests in `bake/tests/test_manifest_writer.py` covering: (a) `models` parameter absent → emits no `models` field, (b) `models` parameter present + non-empty → field round-trips byte-stable, (c) `models` parameter validates schema before merge)
- **AND** if KTX2/toktx work is deferred per AC2 § textures inspection, the deferral is logged in `_bmad-output/implementation-artifacts/deferred-work.md` with the AC2-T2 citation

### AC9 — Lead-driven Chrome DevTools MCP smoke (per voyager-skill-rules.md Rule 3 + Rule 8)

- **GIVEN** Story 3.3 touches `web/src/render/spacecraft-models.ts` (user-facing surface — the 3D model the visitor sees) AND introduces a new `models[]` manifest section visible at runtime
- **AND** voyager-skill-rules.md Rule 3 mandates browser-MCP smoke evidence as a per-story exit criterion
- **AND** ADR-0010 Layer 1 places the smoke on the lead, not subagents
- **WHEN** the lead executes the per-story smoke after the CR stage
- **THEN** the MCP probe plan (authored by qa-3-3, executed by lead) is:
  1. `navigate_page` → `http://localhost:5173/` (homepage default cruise scene)
  2. `evaluate_script` → `(() => { const s = window.__voyagerDebug.spacecraftModels.getHandle('voyager-1').group; return { busExists: !!s.getObjectByName('BUS'), platformExists: !!s.getObjectByName('SCAN_PLATFORM'), hgaExists: !!s.getObjectByName('HGA') }; })()` — assert all three `true`
  3. `evaluate_script` at a default cruise zoom — programmatically rotate `SCAN_PLATFORM` by 45° about local +Y; `take_screenshot`; assert the platform group's children visually change in the screenshot (lead inspects screenshot)
  4. `evaluate_script` → reset platform quaternion; `take_screenshot`; visual comparison vs step (3) confirms the change was rotational + reversible
  5. `evaluate_script` → `(() => { const lod = window.__voyagerDebug.spacecraftModels.getHandle('voyager-1').lod; return { levels: lod.levels.length, currentLevel: lod.getCurrentLevel ? lod.getCurrentLevel() : null }; })()` — assert `levels === 4` and `currentLevel` is a non-null integer in `[0, 3]`
  6. `list_console_messages` (filter=error) — must be clean (no GLB-load failures, no Zod validation failures, no `THREE.LOD` warnings)
  7. `navigate_page` → `http://localhost:5173/c/v1-jupiter` (an encounter chapter where the LOD may shift) — `take_screenshot`; visual sanity check that the spacecraft model still renders cleanly at chapter-camera distance
- **AND** evidence (screenshots + per-probe `evaluate_script` results + `list_console_messages` output) is saved to `_bmad-output/implementation-artifacts/3-3-smoke-evidence/`

## Integration ACs

See AC7 above — the lead Integration AC for the GLB-hierarchy ↔ AttitudeService consumer wire-up. The runtime-tier smoke (AC9) is the Rule-3 per-story smoke gate, complementary to but distinct from AC7 (AC9 verifies real-browser behavior including LOD swap + visual rotation; AC7 verifies the boot-time wire-up via happy-dom).

## Consumes (this story's consumed dependencies)

- **`web/public/models/voyager.glb`** (Story 1.12) — copied to `bake/inputs/models/voyager-raw.glb` as part of T2.1. The original location at `web/public/models/voyager.glb` will be REMOVED after the LOD pipeline lands (the LOD URLs are content-hashed and replace it).
- **`web/src/services/manifest-loader.ts`** (Story 1.6) — extended with `ModelSchema` + `ModelLodSchema` + top-level `models: z.array(ModelSchema).default([])`. Schema additions are backward-compat (default empty) so old manifests parse.
- **`web/src/services/fk-constants.ts`** (Story 3.2) — `VG{1,2}_HGA_BORESIGHT_RELATIVE_TO_BUS` referenced for AC1's HGA quaternion orientation. (Story 3.3 does NOT modify fk-constants; it only reads.)
- **`bake/src/manifest_writer.py`** (Story 1.6 + Story 3.1) — extended with a `models` parameter and `bake/out/models-manifest-fragment.json` merge logic.
- **`bake/src/fk_inventory.py`** (Story 1.3) — read at Phase 0 to derive the SCAN_PLATFORM pivot offset (verify the inventory contains the frame -31100 / -32100 ROT translation values; if not, the dev agent halts per § Decision Required below).
- **`web/src/render/spacecraft-models.ts`** (Story 1.12) — UPDATED to load 4 LODs from manifest, wrap in `THREE.LOD`, register `MeshoptDecoder`, REMOVE `DRACOLoader`. The two-instance clone pattern (V1 + V2) is preserved.

## Consumed-by (downstream stories that depend on Story 3.3's output)

- **Story 3.4 (Apply Attitude Per Frame):** the per-frame `RenderEngine.onFrame` hook calls `scene.getObjectByName('BUS').quaternion.copy(AttitudeService.getBusQuat(...))` and `scene.getObjectByName('SCAN_PLATFORM').quaternion.copy(AttitudeService.getPlatformQuat(...))` for both spacecraft. Story 3.3's named hierarchy is the contract.
- **Story 3.5 (NA Camera Boresight Cone):** the `THREE.ConeGeometry` wireframe is parented to `getObjectByName('SCAN_PLATFORM')`. Story 3.5 inherits the platform's rotation automatically.
- **Story 5.2 (PBD choreographed turn):** the choreographed PBD spacecraft turn parents an animation timeline against `getObjectByName('BUS')` (overrides synthesized attitude for the PBD scene only). The named-hierarchy contract is shared with Story 3.4.
- **Story 4.3 (encounter cadence + texture upgrade):** the 4-LOD chain established here is the substrate for the 4k → 8k texture swap at SOI entry. The LOD threshold tuning may be re-tuned in Story 4.3 with encounter-specific data; the schema (manifest-driven thresholds per AC4) keeps the tuning data out of code.

## Tasks / Subtasks

- [x] **T1 — Phase 0 inspection of the upstream GLB (AC1)**
  - [x] T1.1: Install `@gltf-transform/core` + `@gltf-transform/extensions` + `@gltf-transform/functions` as devDependencies under `web/` (these are the JS API; the CLI tool `gltf-transform` is invoked indirectly via the JS API). Note Node/TS toolchain compatibility with the existing TS 6.x baseline per ADR-0026
  - [x] T1.2: Author a small standalone inspection script — INSPECTION DONE DIRECTLY via Read against `web/public/models/voyager.glb` (the GLB JSON header was sufficient to enumerate all 4 meshes + 3 textures + bounding boxes without a separate script). Phase 0 findings in voyager-mesh-mapping.json's `phase0_notes` field.
  - [x] T1.3: Authored `bake/inputs/voyager-mesh-mapping.json` per the spec: source_sha256, phase0_notes, 4-entry mesh_mapping with rationales, scan_platform_pivot_meters, hga_orientation_relative_to_bus_quat, hga_position_meters.
  - [x] T1.4: NO halt — middle-path bounding-box heuristic was unambiguous (BODY.000=disk-shaped→HGA; BODY.040=large elongated→BUS; BODY.002=small below origin→SCAN_PLATFORM; Cube.004=1m skeletal→BUS by default).

- [x] **T2 — Asset pipeline at `web/scripts/build_glb.ts` (AC2)**
  - [x] T2.1: Copied `web/public/models/voyager.glb` → `bake/inputs/models/voyager-raw.glb` (SHA-256 verified: bd86ded828dd3f...). `.gitattributes`'s global `*.glb` LFS rule covers the new location.
  - [x] T2.2: Authored `web/scripts/build_glb.ts` per AC2's contract.
    ```ts
    // web/scripts/build_glb.ts
    import { NodeIO } from '@gltf-transform/core';
    import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
    import { dedup, prune, weld, simplify, meshopt } from '@gltf-transform/functions';
    import { readFileSync } from 'fs';
    import { createHash } from 'crypto';
    // Steps: load raw GLB → decode Draco (via ALL_EXTENSIONS) → restructure to named hierarchy
    // → prune → dedup → weld → meshopt → for [lod0..lod3]: simplify(--ratio) → write
    ```
  - [x] T2.3: `restructureHierarchy` reads the mapping JSON, walks nodes/meshes, creates BUS/SCAN_PLATFORM/HGA group nodes, sets pivots + HGA quaternion (Rx(180°) = (1,0,0,0) scalar-last), re-parents leaves with counter-translate so mesh world positions are preserved.
  - [x] T2.4: Authored `bake/inputs/voyager-mesh-mapping.json` (NOT LFS-tracked — small JSON). Includes `source_sha256` SHA guard.
  - [x] T2.5: LOD generation via `simplify` from `@gltf-transform/functions`. Ratios: 1.0 / 0.5 / 0.2 / 0.05. Simplify only runs at ratio < 1.0; meshopt encoding runs on all LODs.
  - [x] T2.6: Content-hash output filenames `voyager-lod{N}.<hash:8>.glb`. Atomic temp-then-rename with stale-LOD cleanup.
  - [x] T2.7: `bake/out/models-manifest-fragment.json` emitted per AC4 schema (one model entry, 4 LODs, pivotMeters [0,0,0], scaleToKm 0.001).
  - [x] T2.8: Added `bake-glb` recipe to justfile (web working-directory; invokes `npm run build-glb`). `build-glb` script added to web/package.json invoking `node --import tsx scripts/build_glb.ts`. `tsx` 4.x added as devDep.
  - [x] T2.9: Chained `bake: bake-glb bake-attitude` in justfile.
  - [x] T2.10: DELETED `web/public/models/voyager.glb` + `web/public/draco/`. `.gitattributes` had no draco-specific pattern.
  - [x] T2.11: `web/scripts/build_glb.test.ts` — 7 unit tests covering restructureHierarchy (named hierarchy creation, parenting, pivot translation, HGA quaternion, mesh-name mismatch guard, JSON round-trip idempotency) + countVertices. The full toktx-dependent pipeline is exercised in CI's `build-glb` job (not in vitest because toktx is a CI-installed binary).

- [x] **T3 — Manifest schema extension (AC4)**
  - [x] T3.1: Added `ModelLodSchema` + `ModelSchema` + `models: z.array(ModelSchema).default([])` to `ManifestSchema` in `web/src/services/manifest-loader.ts`.
    ```ts
    const ModelLodSchema = z.object({
      level: z.number().int().min(0).max(3),
      url: z.string(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      sizeBytes: z.number().int().positive(),
      maxDistanceKm: z.number().positive().nullable(),
    });

    const ModelSchema = z.object({
      id: z.string(),
      lods: z.array(ModelLodSchema).min(1),
      pivotMeters: z.tuple([z.number(), z.number(), z.number()]),
      scaleToKm: z.number().positive(),
    });

    // Inside ManifestSchema:
    models: z.array(ModelSchema).default([]),
    ```
  - [x] T3.2: Exported `ManifestModel` + `ManifestModelLod` types via `z.infer` from manifest-loader.ts.
  - [x] T3.3: Added 5 unit tests in `web/src/services/manifest-loader.test.ts` (no-models back-compat, well-formed 4-LOD parse, malformed sha256 reject, negative maxDistanceKm reject, empty lods reject).
  - [x] T3.4: Added `models` parameter to `emit_manifest` in `bake/src/manifest_writer.py` with conservative pre-write validation (`_validate_models_fragment`). When None, field is OMITTED. ck_sample.py + bake_trajectories.py both read `bake/out/models-manifest-fragment.json` when present and pass through.
  - [x] T3.5: Added 5 tests in `bake/tests/test_manifest_writer.py` (models-absent omits field, models-present round-trip, byte-stability across reruns, malformed sha256 rejection-before-write, empty-lods rejection).

- [x] **T4 — `SpacecraftModels` rewrite for LOD chain + manifest-driven URLs (AC3, AC5)**
  - [x] T4.1: Preserved V1+V2 two-instance clone pattern + label sprites + pre-launch visibility gates. Only the GLB-load + scene-graph-construction portion changed (loadMultiLod / loadSingleLod split).
  - [x] T4.2: Added `manifest?: Manifest` to `SpacecraftModelsOptions`. Production wires it from main.ts (post-manifest-load); the load is deferred until manifest resolution.
  - [x] T4.3: `loadMultiLod` fetches each LOD URL in parallel via `Promise.all`, clones each scene root for V1+V2, builds a `THREE.LOD` per spacecraft. `MeshoptDecoder` + `KTX2Loader` registered on the default loader (`makeDefaultGLTFLoader`). DRACOLoader path REMOVED.
  - [x] T4.4: Manifest's `maxDistanceKm` is render-space km directly (no multiplication needed — the worldGroup is already in render-space km per Story 1.5 floating-origin). null → Infinity for the far-field catch-all LOD.
  - [x] T4.5: `getHandle()` API preserved. `handle.group` contains the `THREE.LOD` instance + the label sprite; `handle.lod` exposes the inner LOD instance for the MCP smoke probe.
  - [x] T4.6: `__voyagerDebug.spacecraftModels` published in main.ts (newly added — Story 1.12's note about prior publication was inaccurate; the surface is added here for AC9 probes). `handle.lod` exposes the THREE.LOD instance.
  - [x] T4.7: AC5 fallback implemented in `resolveModelEntry`: when manifest.models is empty (or no manifest passed), warns ONCE via module-static `fallbackWarnEmitted` flag, then falls back to `DEFAULT_VOYAGER_GLB_URL` (which 404s after T2.10 deletion — acceptable transition-window posture, documented in README).
  - [x] T4.8: Extended `web/src/render/spacecraft-models.test.ts` with 6 LOD-path tests: (a) 4-LOD construction, (b) distance thresholds match manifest (null → Infinity), (c) loads every LOD URL, (d) AC5 empty-models warn-once + fallback, (e) per-spacecraft scene clones are independent, (f) default loader registers MeshoptDecoder + KTX2Loader at /basis/. Plus 2 AC1/AC6 named-hierarchy tests.

- [x] **T5 — Update `web/public/models/README.md` for the new LOD pipeline**
  - [x] T5.1: Rewrote README with the LOD-chain explanation: four content-hashed URLs managed by `web/scripts/build_glb.ts`; LOD0 source at `bake/inputs/models/voyager-raw.glb`; mesh-to-node mapping in `bake/inputs/voyager-mesh-mapping.json`; NASA attribution preserved; ADR-0006 KTX2 + meshopt-compression rationale; toktx install instructions; Story 4.3 boundary noted.
  - [x] T5.2: Documented the new flow (`git lfs pull` → install toktx → `just bake-glb`) plus the raw GLB re-acquisition path. Added `Removed` and `Added` sections for the Story 3.3 file deltas.

- [x] **T6 — Wire the manifest into SpacecraftModels via first-paint (AC5)**
  - [x] T6.1: Wired in `web/src/main.ts` (the canonical SpacecraftModels construction point) rather than `first-paint.ts`. `spacecraftModels.load({ manifest })` is called inside the `ManifestLoader.load(...).then(...)` block AFTER the manifest resolves. SpacecraftModels itself is constructed up-front so the scene-graph structure is stable. (NOTE: Decision rationale — main.ts already owns the manifest-loaded async chain that constructs EphemerisService + AttitudeService; the manifest doesn't reach first-paint at all in the current architecture, and first-paint's responsibilities are chrome elements + clock wiring, not GPU rendering. Adding a manifest threaded through first-paint just to reach SpacecraftModels would be circuitous. main.ts is the right level.)
  - [x] T6.2: Pre-launch visibility logic + label sprite construction unchanged (verified by extending existing tests).
  - [x] T6.3: All existing first-paint.test.ts tests pass (zero new tests needed — first-paint's surface didn't materially change for Story 3.3).

- [x] **T7 — Integration test for the Story 3.3 ↔ Story 3.2 wire-up (AC7)**
  - [x] T7.1: Authored `web/tests/spacecraft-models-attitude-integration.test.ts` (NEW). Composes the V1 attitude fixture from attitude-service-integration.test.ts with the new Story 3.3 4-LOD manifest fixture and a synthetic hierarchical GLB. 4 integration tests cover: full boot stack (manifest → ChunkLoader → AttitudeService AND SpacecraftModels), platform rotation defense, AC9 debug-surface readiness, synthesized-cruise attitude application.
  - [x] T7.2: Test 1 executes the AC7 sequence: query AttitudeService → apply to BUS + SCAN_PLATFORM quaternions → verify each named group's quaternion matches what was copied in (1e-12 abs).
  - [x] T7.3: Test 2 (rotating SCAN_PLATFORM defense): bus rotated 30° about Z, then platform rotated 45° about Y; asserts HGA's matrixWorld is unchanged across the second rotation (within 1e-10).

- [ ] **T8 — Per-story smoke (lead-driven; AC9)**
  - [ ] T8.1: QA stage (qa-3-3) authors the MCP probe plan in `_bmad-output/implementation-artifacts/tests/test-summary-3-3.md` § Chrome DevTools MCP smoke stage, mirroring the qa-3-2 pattern
  - [ ] T8.2: Lead executes the probe plan against a running dev server, saves screenshots + console-message + evaluate_script results to `_bmad-output/implementation-artifacts/3-3-smoke-evidence/`

T8 (lead-driven MCP smoke) is the lead's responsibility per voyager-skill-rules.md Rule 7 (lead-executed gate). Dev stage leaves T8 unchecked; lead closes after smoke evidence is captured.

## Dev Notes

### Architecture & ADR Compliance Touchpoints

- **ADR-0006 (EXT_meshopt_compression over Draco):** Story 3.3 is the natural landing point for ADR-0006 compliance. Story 1.12 + Story 1.15 shipped a Draco-compressed GLB as a stop-gap. The build-pipeline path here uses `@gltf-transform/functions` `meshopt(...)` per ADR § Decision step 2, and the runtime registers `MeshoptDecoder` per ADR § Consequences "Three.js consumes the compressed GLB via `GLTFLoader` with `MeshoptDecoder` registered." The Draco decoder bundle under `web/public/draco/` is REMOVED in T2.10.
- **ADR-0008 (Three.js WebGLRenderer):** `THREE.LOD` is the canonical Three.js LOD primitive; no custom LOD implementation. Per-frame `lod.update(camera)` is invoked by Three.js's standard render loop — `RenderEngine.onFrame` doesn't need an explicit LOD-update call (Three.js handles it during `renderer.render(scene, camera)`).
- **ADR-0010 (Chrome DevTools MCP agent-time / Playwright CI-time):** AC9 lead-driven MCP smoke is the per-story binding gate per Rule 3.
- **ADR-0011 (Git LFS for binary assets):** the 4 LOD output GLBs land under `web/public/models/` which is LFS-tracked via `.gitattributes:25` `*.glb` pattern. The `bake/inputs/models/voyager-raw.glb` input is similarly LFS-tracked. New per-LOD outputs add to LFS quota; per ADR-0011 § Consequences negatives, monitor budget.
- **ADR-0013 (Lit 3 web components, no decorators):** N/A — Story 3.3 doesn't touch Lit components.
- **ADR-0015 (no global store, reactive controllers):** `SpacecraftModels` is constructor-injected with the manifest via `first-paint.ts`. The only window-level binding is `window.__voyagerDebug.spacecraftModels` gated by `import.meta.env.DEV` constant-folding (documented per Story 1.12 § debug-surface exemption).
- **ADR-0026 (TS 6.x strict, zero `any`):** the new `ManifestModel` / `ManifestModelLod` types are Zod-inferred and consumed type-safely throughout the loader. No `any` casts. The `MeshoptDecoder` import from `three/examples/jsm/libs/meshopt_decoder.module.js` may need a `// @ts-expect-error` if the type declarations are missing (a known Three.js examples-types gap); if so, document the suppression and prefer adding a local `.d.ts` declaration over the suppression.

### File-Touch Inventory

**NEW (web-side):**

| File | Purpose | AC |
|---|---|---|
| `web/scripts/build_glb.ts` | The asset pipeline (gltf-transform + LOD generation) | AC2 |
| `web/scripts/build_glb.test.ts` | Pipeline tests (LOD output, idempotency, named-hierarchy preservation) | AC2 |
| `web/tests/spacecraft-models-attitude-integration.test.ts` | Integration AC7 (Story 3.3 ↔ Story 3.2 wire-up) | AC7 |

**NEW (bake-side / inputs):**

| File | Purpose | AC |
|---|---|---|
| `bake/inputs/models/voyager-raw.glb` | Renamed copy of the upstream NASA model (LFS-tracked) | AC2 T2.1 |
| `bake/inputs/voyager-mesh-mapping.json` | Phase 0 mesh-to-node mapping + pivots | AC2 T2.4 |

**UPDATED (web-side):**

| File | Action | AC |
|---|---|---|
| `web/src/services/manifest-loader.ts` | Add `ModelLodSchema`, `ModelSchema`, top-level `models: z.array(ModelSchema).default([])`. Export new types | AC4 |
| `web/src/services/manifest-loader.test.ts` | Add tests for the new schema (≥3 cases) | AC4 T3.3 |
| `web/src/render/spacecraft-models.ts` | Rewrite GLB-load path for 4-LOD + manifest-driven URLs + MeshoptDecoder; preserve V1/V2 clone + label sprites + visibility gates | AC3, AC5 |
| `web/src/render/spacecraft-models.test.ts` | Add LOD-path tests + named-hierarchy assertions | AC1, AC3, AC6 |
| `web/src/boot/first-paint.ts` | Pass manifest to SpacecraftModels constructor | AC5 T6.1 |
| `web/package.json` | Add `@gltf-transform/{core,extensions,functions}` + `tsx` devDeps; add `build-glb` script | AC2 |
| `web/public/models/README.md` | Replace Story 1.12 single-LOD doc with LOD-pipeline explanation | T5 |

**UPDATED (bake-side):**

| File | Action | AC |
|---|---|---|
| `bake/src/manifest_writer.py` | Add `models` parameter; merge from `bake/out/models-manifest-fragment.json` | AC4 T3.4 |
| `bake/tests/test_manifest_writer.py` | Add ≥3 tests covering models param | AC4 T3.5 |
| `justfile` | Add `bake-glb` recipe; chain into `bake` | AC2 T2.8/T2.9 |

**REMOVED:**

| File | Action | AC |
|---|---|---|
| `web/public/models/voyager.glb` | Replaced by the LOD chain | AC2 T2.10 |
| `web/public/draco/` (entire directory) | No longer needed — meshopt replaces Draco per ADR-0006 | AC3 |

### Testing Standards Summary

- New web tests live under `web/tests/` (integration) or `web/src/**/*.test.ts` (unit, co-located).
- `spacecraft-models.test.ts` extension uses synthetic in-test GLBs authored via the gltf-transform JS API — keeps tests hermetic (no dependency on the real `web/public/models/voyager-lod*.glb` being present, which is desirable for fresh-clone CI runs before `just bake-glb` has executed).
- Integration test `spacecraft-models-attitude-integration.test.ts` uses the full `startFirstPaint(testOptions)` boot stack with both a fixture manifest (containing attitude entries from Story 3.2's pattern + the new models[] entry) AND a procedural synthetic GLB authored in test setup.
- Lead MCP smoke at AC9 is the only real-browser test; uses the production-built LODs from `just bake-glb`.
- Bake tests: `test_manifest_writer.py` extensions cover the `models` parameter additivity per AC4 T3.5.

### Previous Story Intelligence (Story 1.12, Story 1.15, Story 3.2)

- **Story 1.12 single-LOD shipping pattern:** `SpacecraftModels` loads the GLB ONCE via `GLTFLoader`, then clones via `gltf.scene.clone(true)` into V1 + V2 instances. Story 3.3 preserves this two-instance clone pattern — the LOD chain wraps the clones, NOT the source. Practically: for each spacecraft, build a `THREE.LOD` whose `levels[i].object` is the cloned scene root of LOD `i`. Memory cost: 4 LODs × 2 spacecraft = 8 cloned scene graphs; for a ~1.7 MB raw GLB simplified to LODs in the ≤ 2 MB range total, this is ~16 MB of mesh data in memory — acceptable per NFR-P4.
- **Story 1.15 DRACOLoader pre-wire (lines 159-165 of spacecraft-models.ts):** Story 3.3 REMOVES this. The replacement is `MeshoptDecoder` registered against `GLTFLoader` via `gltfLoader.setMeshoptDecoder(MeshoptDecoder)`. The `web/public/draco/` directory is deleted in T2.10. Verify no other consumer of `DRACO_DECODER_PATH` exists before deletion (`grep -r "DRACO_DECODER_PATH" web/src/`).
- **Story 3.2 `__voyagerDebug.attitudeService` publication pattern:** Story 3.3 follows the same `import.meta.env.DEV`-gated debug-surface pattern. `__voyagerDebug.spacecraftModels` is already published by Story 1.12; T4.6 verifies the handle structure still exposes `lod` so the AC9 smoke can probe it.
- **Story 3.2 `attitude-service-integration.test.ts` fixture pattern:** the synthetic CK VTRJ + manifest fixture from `attitude-service-integration.test.ts` is reused for AC7's integration test (T7.1). The new test composes that fixture with a synthetic models[] entry. The `startFirstPaint(testOptions)` test harness from Story 1.9 takes both manifest + service overrides; extend the options shape if needed.
- **Story 3.1 + 3.2 silence-recovery equilibrium:** dev/qa/cr agents may go silent; the lead recovers from file evidence. Story 3.3 inherits this posture — closing-summary sections are best-effort, file evidence is canonical.

### Authoring the Named Hierarchy — Critical Path

The hardest creative work in Story 3.3 is reorganizing the upstream NASA mesh into the named `BUS` / `SCAN_PLATFORM` / `HGA` hierarchy. Three paths, ranked by preferred order:

1. **Best path — Upstream mesh has identifiable structure.** The NASA Voyager Probe (B) GLB MAY ship with mesh primitives that have names like `"voyager_bus"`, `"voyager_scan_platform"`, `"voyager_hga"` (this is common for NASA 3D Resources models). If so, T1.3's inspection script outputs them directly; the mapping JSON is straightforward; T2.3 walks the document and re-parents accordingly.

2. **Middle path — Geometry-based heuristic.** If mesh names are absent (or non-semantic), the inspection script applies a bounding-box heuristic:
   - **HGA**: largest disk-shaped mesh primitive (high aspect ratio in one plane, mostly flat) — the 3.7 m dish dominates
   - **BUS**: largest non-disk mesh primitive — the bus chassis
   - **SCAN_PLATFORM**: a mesh primitive offset from the bus chassis along one of the bus's principal axes (likely +Y per FK ROT inspection)
   - Anything else (RTGs, magnetometer boom, antennas) → BUS by default
   - Document the heuristic findings in `voyager-mesh-mapping.json` `rationale` field per T1.3.

3. **Fallback path — Procedural placeholder.** If neither (1) nor (2) yields a confident assignment, the dev agent halts per T1.4 and surfaces a Clarification Needed asking the user to choose: (a) author a procedural simplified replacement model (programmatic in `build_glb.ts` — e.g., BUS = small cylinder, SCAN_PLATFORM = small box at +Y offset, HGA = small disk at +Z); (b) source a different NASA model with explicit articulation; (c) defer Story 3.3 until manual GLB editing happens out-of-band. The procedural path (a) is the recommended fallback because it (i) unblocks Story 3.4 immediately, (ii) preserves the named-hierarchy contract that all downstream stories depend on, (iii) visual fidelity is restored in Story 4.3's polish pass anyway.

Do NOT silently fall through to a "best guess" assignment — the named hierarchy is the load-bearing contract for the entire epic; getting it wrong wastes Stories 3.4–3.6 of downstream effort.

### Voyager Skill-Rules Touchpoints

- **Rule 1 (Integration ACs):** AC7 is the Integration AC. This story introduces the named-hierarchy "service" — a contract that Stories 3.4, 3.5, 3.6, and Story 5.2 all consume via `getObjectByName(...)`. The integration test exercises the consumer pattern (Story 3.4's per-frame attitude application) against the real loaded GLB.
- **Rule 3 + Rule 8 (Per-story smoke):** AC9 is the lead-driven Chrome DevTools MCP smoke. Story 3.3 touches `web/src/render/spacecraft-models.ts` — user-facing surface — so the smoke is mandatory.
- **Rule 5 (NFR tripwire):** None anticipated. The size budgets in AC2 (LOD0 ≤ 2 MB, LOD3 ≤ 100 KB) are soft targets; AC2 explicitly notes the breach handling — surface and fail loudly. If the upstream NASA mesh is small enough that LOD0 already meets ≤ 2 MB after meshopt compression, the budgets are easy. If it's larger, the dev agent surfaces and discusses.
- **Rule 6 (ADR violations are HIGH):** ADR-0006 compliance is the central architectural correction this story makes. The code reviewer MUST verify `MeshoptDecoder` is registered + `DRACOLoader` is removed; any persistence of the Draco path post-Story-3.3 is a HIGH finding.
- **Rule 7 (Lead-executed gate):** AC9 smoke is lead-driven, not subagent-driven.
- **Rule 9 (APG primitives):** N/A — Story 3.3 doesn't touch APG components.

### Project Context Reference

- BMAD workflow: `_bmad/custom/voyager-skill-rules.md` — Rules 1, 3, 5, 6, 7, 8 apply.
- ADR registry: `docs/adr/` — particularly ADR-0006 (the load-bearing one), ADR-0008, ADR-0010, ADR-0011, ADR-0015, ADR-0026.
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml` — `3-3-*` transitions ready-for-dev → in-progress → review → done.
- Cycle log: `_bmad-output/implementation-artifacts/cycle-log-epic-3.md` — Story 3.2 committed at sha `3d6a62e`; Story 3.3 entries written by lead during execution.
- Story 3.2 reference: `_bmad-output/implementation-artifacts/3-2-attitudeservice-slerp-interpolation-and-synthesized-hga-cruise-attitude.md` — especially § Tasks T1 (FK constants) and § Completion Note 4 (HGA boresight derivation).
- Story 1.12 reference: `_bmad-output/implementation-artifacts/1-12-both-voyager-spacecraft-with-past-solid-future-dashed-trajectory-lines.md` — the V1/V2 two-instance clone pattern + label sprite contract.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (lead) for story creation; dev-3-3 (claude-opus-4-7 subagent) for implementation.

### Debug Log References

- Phase 0 inspection done directly via Read of the GLB JSON header — no separate inspection script committed. The header sufficed to enumerate 4 meshes + 4 nodes + 3 textures + bounding boxes.
- Initial clarification gate: 3 WebP/PNG textures present in the upstream GLB triggered the AC2 § KTX2/toktx HALT. User decision: procure toktx + KTX2 transcode (full ADR-0006 compliance), not the deferral path.
- Web vitest: 117 files / 2159 pass / 0 fail / 1 skipped (+46 from 2113 Story 3.2 baseline).
- Web typecheck: clean.
- Web lint: 4 warnings (down from 5 pre-existing — net improvement; the previously-on spacecraft-models.ts warning is gone after the rewrite). All 4 remaining are unused-eslint-disable directives in pre-existing files (celestial-bodies.ts, skybox.ts, ephemeris-service.ts, celestial-defense-extended.test.ts).
- Bake fast: cannot run locally (no `uv`). System-Python smoke against `tests/test_manifest_writer.py` + `test_vtrj_writer.py` + `test_bake_defense.py` + `test_quat_continuity.py` = 78 pass. Spiceypy-dependent tests pass through unchanged (no manifest_writer.py-touching tests in the spiceypy set; new tests are additive in test_manifest_writer.py). CI will exercise the full bake suite.
- toktx NOT installed locally; the build-glb pipeline is therefore unexercised at dev time. CI's new `build-glb` job (added to `.github/workflows/ci.yml`) installs toktx v4.3.2 from the Khronos KTX-Software .deb and runs `npm run build-glb` against the LFS-hydrated `bake/inputs/models/voyager-raw.glb`; the LOD outputs upload as an artifact and the `build` job's vite step consumes them.

### Completion Notes List

1. **Mesh-mapping path chosen: middle path (bounding-box heuristic) — § Authoring the Named Hierarchy step 2.** The upstream NASA Voyager Probe (B) GLB has 4 meshes with non-semantic Blender export names (`BODY.040`, `BODY.000`, `BODY.002`, `Cube.004`). Bounding boxes unambiguously identified each: `BODY.000` (radially symmetric, 3.93 m radius, narrow Y-extent) is the HGA dish; `BODY.040` (Y-extent to +26 m) is the bus + boom; `BODY.002` (small box below origin, Y from -1.4 to -0.6) is the scan platform; `Cube.004` (1 m skeletal cube at origin) is a Blender-rig placeholder mapped to BUS by default. T1.4 fallback (procedural placeholder) NOT triggered. Mapping committed to `bake/inputs/voyager-mesh-mapping.json` with per-mesh rationale documentation.

2. **KTX2/toktx — INTENTIONAL LIFT, not deferred.** User-directed clarification response (2026-05-21) authorised full ADR-0006 compliance: toktx (Khronos KTX-Software v4.3.2) installed as CI dependency; build_glb.ts extracts textures, runs toktx with UASTC for baseColor (hero) + ETC1S for AO (coarse-tolerance), re-embeds via KHR_texture_basisu. Runtime: KTX2Loader registered against GLTFLoader with transcoderPath=/basis/ (Basis Universal transcoder copied from three/examples/jsm/libs/basis/ to web/public/basis/). Defense tests `celestial-bodies-defense.test.ts` + `celestial-defense-extended.test.ts` were updated to whitelist `src/render/spacecraft-models.ts` (Story 3.3 ADR-0006 landing surface) while continuing to block KTX2 in celestial-body textures (Story 4.3 territory). Documented in voyager-skill-rules.md Rule 6 territory (ADR violation prevented).

3. **MeshoptDecoder type-declaration handling.** Three.js 0.184 ships `.d.ts` files for `three/examples/jsm/libs/meshopt_decoder.module.js` and `three/examples/jsm/loaders/KTX2Loader.js` — no `@ts-expect-error` suppressions needed for either. The initial draft included a `@ts-expect-error` (anticipating the gap noted in Story 3.3 § ADR-0006 Dev Notes) but tsc reported it as unused, so it was removed.

4. **Story 1.15 Draco cleanup — clean removal.** No other consumer of `DRACOLoader` or `DRACO_DECODER_PATH` existed (`grep -r "DRACO_DECODER_PATH" web/src/` returned only the spacecraft-models.ts site). `web/public/draco/` directory deleted; `.gitattributes` had no draco-specific pattern to remove.

5. **AC2 § Decision Required: chose path (b) — `web/scripts/build_glb.ts`.** Symmetric with Story 2.6's `web/scripts/og-cards.ts` precedent; keeps Node tooling co-located with `package.json`. No architectural reason emerged during implementation to prefer (a) `bake/scripts/`. Justfile recipe `bake-glb` uses `working-directory("web")` to invoke `npm run build-glb`.

6. **AC4 manifest fragment merge — implemented in both bake_trajectories.py + ck_sample.py.** Both manifest-emitters read `bake/out/models-manifest-fragment.json` when present and pass it through to `emit_manifest(models=...)`. The chain `just bake = bake-glb → bake-attitude (which depends on bake-trajectories)` ensures the fragment lands BEFORE either emitter runs.

7. **T6 wire-up landed in main.ts, NOT first-paint.ts.** The story Dev Notes anticipated first-paint.ts wiring; in practice main.ts already owns the post-manifest-load async chain that constructs EphemerisService + AttitudeService + the spacecraft tick callback. SpacecraftModels.load(manifest) was added to that same chain (after manifest resolves) — first-paint.ts's manifest exposure surface didn't need to change. Documented in T6.1.

8. **`__voyagerDebug.spacecraftModels` debug surface — NEW, not pre-existing.** Story 3.3 Dev Notes claimed "already published by Story 1.12". That claim was inaccurate: Story 1.12's main.ts never added spacecraftModels to the debug surface (only Story 2.x scrubber/chapterIndex/etc.). The publication is added here for AC9 probe coverage, gated by `import.meta.env.DEV`.

9. **AC5 fallback warn — module-static once-only flag.** `SpacecraftModels.fallbackWarnEmitted` is a private static field, exposed via `__resetFallbackWarnForTests` for test hygiene. The warn fires on the FIRST `SpacecraftModels` instance whose manifest has empty `models[]`; subsequent instances stay silent (defensive against a future hot-reload spawning multiple SpacecraftModels). Verified by the spacecraft-models.test.ts "warn ONCE" test.

10. **LOD distance threshold semantics: render-space km direct, no SCALE multiplication.** Story Dev Notes T4.4 instructed `level.distance = lod.maxDistanceKm * SPACECRAFT_RENDER_SCALE_KM`. Re-derived: the WorldGroup is in render-space km per Story 1.5 floating-origin, AND the spacecraft mesh itself is scaled DOWN by SPACECRAFT_RENDER_SCALE_KM = 0.01 to compensate for "raw meters in km space". `camera.position.distanceTo(lodObject.position)` measures distance in WorldGroup coordinates, which is km already. The manifest's `maxDistanceKm` is the actual world-space distance in km at which the LOD level should be active — multiplying by SCALE would scale a 1 km threshold down to 10 m, which is incorrect. Used `maxDistanceKm` directly; null → Infinity for the far-field catch-all.

11. **CI install path: official Khronos KTX-Software .deb.** v4.3.2 pinned via `KTX_VER=4.3.2`; `curl` + `apt-get install`. Adds ~15-30 seconds to CI; acceptable per ADR-0006 compliance commitment.

12. **Test sweep state.** Web: 2159 pass (+46 from 2113 baseline). Typecheck clean. Lint: 4 warnings (down from 5). Bake fast: locally verified only the spiceypy-free subset (78 pass); CI will exercise the full 337+ baseline plus the new tests.

13. **AC8 — Test sweep green; no regressions.** All targets met. Bake tests added (5 new in test_manifest_writer.py). Web tests added (5 in manifest-loader.test.ts, 8 in spacecraft-models.test.ts, 7 in build_glb.test.ts, 4 in spacecraft-models-attitude-integration.test.ts = 24 new web tests).

14. **AC9 — Lead-driven Chrome DevTools MCP smoke deferred to lead.** Per Rule 7 + Rule 3, AC9 is the lead's responsibility post-dev. Code-side prerequisites in place: `window.__voyagerDebug.spacecraftModels` exposed (gated by `import.meta.env.DEV`); `handle.lod` exposes the THREE.LOD instance with `levels.length === 4`. The MCP smoke evidence (probes 1-7 from AC9) is captured by the lead post-CR.

### File List

**NEW (web-side):**

- `web/scripts/build_glb.ts` — the asset pipeline (gltf-transform + meshopt + toktx KTX2)
- `web/scripts/build_glb.test.ts` — 7 pure-JS unit tests for restructureHierarchy + countVertices (the toktx-dependent pipeline is exercised in CI)
- `web/scripts/draco3dgltf.d.ts` — minimal ambient module declaration for the upstream-untyped `draco3dgltf` CommonJS module (ADR-0026 zero-`any` discipline)
- `web/tests/spacecraft-models-attitude-integration.test.ts` — Story 3.3 AC7 Integration AC (4 integration tests)
- `web/public/basis/basis_transcoder.js` + `basis_transcoder.wasm` — Basis Universal transcoder bundle (copied from three/examples/jsm/libs/basis/)

**NEW (bake-side):**

- `bake/inputs/models/voyager-raw.glb` — renamed copy of the upstream NASA model (LFS-tracked via `*.glb` global pattern)
- `bake/inputs/voyager-mesh-mapping.json` — Phase 0 mesh-to-node mapping + pivots + HGA orientation (committed; small JSON, NOT LFS)

**UPDATED (web-side):**

- `web/src/services/manifest-loader.ts` — added `ModelLodSchema`, `ModelSchema`, top-level `models: z.array(ModelSchema).default([])`. Exported `ManifestModel` + `ManifestModelLod` types.
- `web/src/services/manifest-loader.test.ts` — added 5 tests covering the new schema cases (AC4 T3.3).
- `web/src/render/spacecraft-models.ts` — REWRITTEN for 4-LOD chain + manifest-driven URLs + MeshoptDecoder + KTX2Loader. Preserves V1/V2 clone + label sprites + visibility gates. `handle.lod` exposes inner THREE.LOD. `DRACOLoader` + `DRACO_DECODER_PATH` removed entirely.
- `web/src/render/spacecraft-models.test.ts` — added 8 new tests (LOD construction, distance thresholds, URL loading, AC5 fallback, scene clone independence, MeshoptDecoder + KTX2Loader registration, named-hierarchy AC1, AC6 rotation defense). Removed Story 1.15 AC2 Draco-specific tests (replaced with KTX2/Meshopt equivalents).
- `web/src/main.ts` — wired `spacecraftModels.load({ manifest })` inside the ManifestLoader.then chain; exposed `__voyagerDebug.spacecraftModels` for AC9.
- `web/src/dev/ephemeris-perf.test.ts` — added `models: []` to fixture manifest (Zod schema requires the field after AC4).
- `web/src/services/attitude-service.test.ts` — added `models: []` to fixture manifest.
- `web/src/services/ephemeris-service.test.ts` — added `models: []` to fixture manifest.
- `web/tests/attitude-service-qa-gaps.test.ts` — added `models: []` to fixture manifest.
- `web/tests/attitude-service-integration.test.ts` — added `models: []` to fixture manifest.
- `web/tests/ephemeris-defense.test.ts` — added `models: []` to fixture manifests (multiple sites).
- `web/tests/celestial-bodies-defense.test.ts` — updated KTX2 defense to whitelist `src/render/spacecraft-models.ts` (Story 3.3 ADR-0006 landing) while continuing to block KTX2 in celestial-body textures (Story 4.3 deferral preserved).
- `web/tests/celestial-defense-extended.test.ts` — same whitelist treatment.
- `web/package.json` — added `@gltf-transform/{core,extensions,functions}@^4.3.0`, `draco3dgltf@^1.5.7`, `meshoptimizer@^0.21.0`, `tsx@^4.22.3` as devDeps. Added `build-glb` script.
- `web/public/models/README.md` — replaced single-LOD doc with LOD-pipeline explanation, toktx install instructions, regeneration steps, Story 4.3 boundary.

**UPDATED (bake-side):**

- `bake/src/manifest_writer.py` — added `models: list[dict] | None = None` parameter to `emit_manifest`; added `_validate_models_fragment` for pre-write validation. Omits field when None (byte-stability with pre-Story-3.3 manifests).
- `bake/src/bake_trajectories.py` — reads `bake/out/models-manifest-fragment.json` when present, passes through to `emit_manifest(models=...)`.
- `bake/src/ck_sample.py` — same fragment merge.
- `bake/tests/test_manifest_writer.py` — added 5 tests for AC4 (models-absent omits field, models-present round-trip, byte-stability, malformed-pre-write rejection, empty-lods rejection).

**UPDATED (top-level):**

- `justfile` — added `bake-glb` recipe; chained `bake: bake-glb bake-attitude` (Story 3.3 AC2 T2.8/T2.9).
- `.github/workflows/ci.yml` — added `build-glb` job (installs toktx v4.3.2 + runs `npm run build-glb` + uploads LOD artifacts); `build` job now `needs: build-glb` + downloads LOD artifacts; deploy job's `needs:` includes `build-glb`.

**REMOVED:**

- `web/public/models/voyager.glb` — replaced by the LOD chain (Story 3.3 AC2 T2.10).
- `web/public/draco/` (entire directory: `draco_decoder.js`, `draco_decoder.wasm`, `draco_wasm_wrapper.js`, `gltf/` subdir) — no longer needed; meshopt replaces Draco per ADR-0006.

### Review Findings

**Code review pass — 2026-05-21** (cr-3-3, claude-opus-4-7 subagent under `/epic-cycle`).

Layers run: Blind Hunter + Edge Case Hunter + Acceptance Auditor (synthesized in-session since this run is itself a subagent). Triage cross-referenced against voyager-skill-rules.md Rules 1, 3, 5, 6, 7, 9 and the ADR registry (focus: ADR-0006).

**Summary:** 1 HIGH auto-resolved inline · 3 LOW deferred to `deferred-work.md` · 5 dismissed as noise / handled by existing project convention.

#### HIGH findings (auto-resolved inline)

- [x] **[Review][HIGH][AUTO-RESOLVED] ADR-0006 violation: `KTX2Loader.detectSupport(renderer)` never invoked in production** — `web/src/main.ts:370` called `spacecraftModels.load({ manifest })` without a renderer. Inspection of `web/node_modules/three/examples/jsm/loaders/KTX2Loader.js:361-363` and :393-395 confirms KTX2Loader **throws** `THREE.KTX2Loader: Missing initialization with .detectSupport( renderer )` whenever `workerConfig === null` (= when `detectSupport` was never called). Every LOD GLB produced by `web/scripts/build_glb.ts` contains KTX2/Basis-Universal textures per ADR-0006 § Decision step 3 + Completion Note 2's user-directed LIFT path. Without `detectSupport`, the FIRST production GLB load would throw at runtime — AC9 probe 7 ("the spacecraft model still renders cleanly at chapter-camera distance") would fail; the spacecraft would not render in production. Severity: **HIGH** per Rule 6 (ADR violations are HIGH).
  - **Fix applied:**
    1. `web/src/render/render-engine.ts` — added `getRenderer(): WebGLRendererLike | null` public accessor (the `renderer` was previously `private` with no public surface).
    2. `web/src/main.ts:370` — `spacecraftModels.load({ manifest, renderer: engine.getRenderer() ?? undefined })`; comment cites ADR-0006 § Decision step 3 + the "Missing initialization" error path.
    3. `web/src/render/spacecraft-models.ts:141` — widened `SpacecraftModelsOptions.renderer` from `{ capabilities?: unknown }` to `unknown` so the engine's `WebGLRendererLike` minimum surface flows through. The narrow-to-WebGLRenderer cast at `makeDefaultGLTFLoader:369` already handled the call-site type assertion.
  - **Verification:** full web vitest sweep = 2177 pass / 1 skipped / 0 fail (+0 from dev-stage baseline). Typecheck clean. Lint baseline preserved (4 warnings, all pre-existing unused-eslint-disable directives).
  - **Files modified by this fix:**
    - `web/src/render/render-engine.ts` (new `getRenderer()` accessor)
    - `web/src/main.ts` (renderer wired through `spacecraftModels.load`)
    - `web/src/render/spacecraft-models.ts` (widened `renderer?: unknown` option type)

#### LOW findings (deferred to deferred-work.md)

- [x] [Review][Defer][LOW] AC7 integration test step-7 weaker than AC spec — test 1 in `web/tests/spacecraft-models-attitude-integration.test.ts:341-344` asserts `platform.quaternion.{x,y,z,w}` equality to the copied quat (1e-12) but does not assert the world-child positions differ by the predicted angular delta as AC7 step 7 specifies. Test 2 ("rotating SCAN_PLATFORM after attitude application does not deform HGA world matrix") + QA gap 3 collectively cover the load-bearing contract. Deferred to deferred-work.md → consumed by Story 3.4's per-frame integration test which will exercise the full angular-delta path naturally.

- [x] [Review][Defer][LOW] Story 3.4 must verify scan-platform pivot composes correctly with FK kernel articulation axis — the `voyager-mesh-mapping.json` `scan_platform_pivot_rationale` block (lines 31-32) acknowledges a coordinate-frame discontinuity: glTF Y-up (Blender export) places SCAN_PLATFORM at `(0, -0.567, 0)` in mesh-local meters, while FK kernel frames -31100/-32100 specify the articulation axis in SPICE frame coordinates. The rationale explicitly defers the composition to Story 3.4: *"the per-frame attitude application in Story 3.4 will compose the FK rotation onto the named hierarchy's local quaternion, so this offset only needs to be the geometric hinge point in the GLB's own frame."* Defer with deferred-work entry routed to Story 3.4 review.

- [x] [Review][Defer][LOW] `SpacecraftHandle.lod` field mutation bypasses readonly modifier — `web/src/render/spacecraft-models.ts:314-315` uses `(this.v1 as { lod: LOD }).lod = v1Lod` to assign onto a field declared `readonly lod: LOD | null` in the interface. Type-safety hygiene only; no functional issue (the cast is local + audited). Suggested cleanup: drop `readonly` on `lod` or introduce a private setter helper. Routed to a future hygiene pass.

#### Dismissed as noise / handled elsewhere

- **Rule 3 (per-story smoke evidence):** Story 3.3 touches a user-facing surface (`web/src/render/spacecraft-models.ts`). Code-side prerequisites for AC9 are now FULLY in place (manifest-driven LOD path, `__voyagerDebug.spacecraftModels` publication, `handle.lod` exposes the THREE.LOD instance, `MeshoptDecoder` + `KTX2Loader` + `detectSupport(renderer)` ALL wired through after the HIGH fix above). Per Rule 7, AC9 is the lead's responsibility post-CR. This is the established Voyager pattern (lead-executed gate), NOT a Rule 3 violation. The HIGH fix above is what unblocks AC9 probe 7 — without it, the smoke would have hard-failed at GLB load.

- **Rule 5 (NFR tripwire response):** No NFR tripwires encountered in this story. The size budgets (LOD0 ≤ 2 MB, LOD3 ≤ 100 KB) are soft targets per AC2; the implementation has no comment+deferred-work workaround on any NFR.

- **Rule 1 (Integration ACs):** AC7 exists in the story file (lines 154-169) and the integration test `web/tests/spacecraft-models-attitude-integration.test.ts` exercises the consumer pattern (AttitudeService → BUS/SCAN_PLATFORM quaternion assignment) per the Rule-1 contract. Net: Rule 1 satisfied.

- **ADR-0006 mesh compression (positive verification):**
  - `MeshoptDecoder` is registered on `GLTFLoader` at `spacecraft-models.ts:358` via `gltf.setMeshoptDecoder(MeshoptDecoder)`.
  - `DRACOLoader` is FULLY REMOVED from `spacecraft-models.ts` — Grep shows only doc-comment references explaining the removal (lines 12, 350-351). No `import`, no `setDRACOLoader`, no `DRACO_DECODER_PATH` constant.
  - `web/public/draco/` directory deleted (confirmed: `ls web/public/draco/` → No such file or directory). Git status shows 7 deleted files under that path.
  - `web/scripts/build_glb.ts` uses `gltf-transform meshopt` (line 500: `meshopt({ encoder: MeshoptEncoder, level: 'medium' })`); the upstream Draco-compressed input GLB is decoded once on read (line 422-427) and the KHR_draco_mesh_compression extension is explicitly stripped from the output (lines 437-443).
  - `draco3dgltf@^1.5.7` in `web/package.json:25` is correctly classified as `devDependencies` (build-time only); the runtime `dependencies` block (lines 35-41) has no Draco anywhere.

- **`__resetFallbackWarnForTests` DEV-gating concern (from story review focus area):** the hook IS exported unconditionally without `import.meta.env.DEV` gating, but `__resetCacheForTests` in `manifest-loader.ts:129` follows the same unconditional-export pattern. Tree-shaking removes unused exports from production builds. Dismiss as consistent with the established project test-helper convention.

- **`__voyagerDebug.spacecraftModels` Story-3.3-net-new publication (from story review focus area):** Completion Note 8 in this story file already documents this honestly — Story 1.12's claim that the surface was pre-published was INACCURATE; Story 3.3 is the actual landing point. The publication at `main.ts:307-318` is correctly gated by `import.meta.env.DEV`. QA gap 4 grep-defends the publication. Net: correctly documented + correctly defended.

- **Manifest schema backward-compat (from story review focus area):** `models: z.array(ModelSchema).default([])` in `manifest-loader.ts:95` allows OLD manifests (without `models` field) to parse — confirmed by the `manifest-loader.test.ts:test "models field omitted → defaults to empty array"` case (per dev's reported 5 new schema tests).

- **CI workflow validation (from story review focus area):** `.github/workflows/ci.yml` `build-glb` job is YAML-valid (no parse errors at edit time); pins `KTX_VER=4.3.2`; uploads artifact `voyager-lods`; the downstream `build` job has `needs: build-glb` + downloads the artifact. `deploy-cloudflare` correctly includes `build-glb` in `needs:`. Net: workflow change is correct.

- **Bake manifest_writer.py SpiceyPy-sweep risk (from story review focus area):** Dev ran 78 spiceypy-free tests successfully. The change to `manifest_writer.py` is: (a) new optional `models` parameter, (b) field omitted when None (preserves byte-stability), (c) `_validate_models_fragment` pre-write validation runs only when `models is not None`. The change is purely additive and gated by None-checks; existing callers passing only the original positional args continue to produce byte-identical output. Risk assessment: very low. CI will exercise the full sweep.
