# Test Automation Summary — Story 3.3 (Articulated Spacecraft GLB with Scan-Platform Node)

**QA agent:** qa-3-3 (Opus 4.7) under `/epic-cycle 3`
**Story file:** `_bmad-output/implementation-artifacts/3-3-articulated-spacecraft-glb-with-scan-platform-node.md`
**Story status going in:** review (dev-3-3 committed Tasks T1–T7; T8 lead-driven MCP smoke pending)
**Baseline going in:** web vitest 2159 pass / 0 fail / 117 files; typecheck clean; lint 4 warnings (down from 5 pre-Story-3.3); bake fast 78 pass on spiceypy-free subset (full 337+ suite runs in CI)
**Baseline going out:** web vitest **2177 pass** / 0 fail / 118 files (+18 net new QA gap tests in `web/tests/spacecraft-models-qa-gaps.test.ts`); typecheck clean; lint baseline preserved

## Chrome DevTools MCP smoke stage (Rule 3 + Rule 8 — AC9)

Story 3.3 touches `web/src/render/spacecraft-models.ts` (REWRITTEN), `web/src/main.ts` (debug-surface publication + spacecraftModels.load wire-up), and `web/src/services/manifest-loader.ts` (Zod schema extension for `models[]`). Per voyager-skill-rules.md Rule 3, browser-MCP smoke is the per-story exit criterion when web/src/ is touched. Per Rule 8, no initScript shim is needed (post-Story-1.16 Chrome-for-Testing 148 loads Voyager via brotli-dec-wasm).

Per ADR-0010 Layer 1 and Rule 7, the smoke is executed by the **lead** (qa-3-3 authors the plan; lead runs the probes). The lead-driven probe plan below is authored to be one-shot executable against `http://localhost:5173/`.

### Pre-flight (critical — environmental constraint)

The dev environment in this story did NOT have `toktx` (Khronos KTX-Software v4.3.2) installed locally. As a consequence:

- `web/scripts/build_glb.ts` was NOT exercised end-to-end locally; only its pure-JS unit tests (`restructureHierarchy`, `countVertices`) ran.
- The four LOD GLBs at `web/public/models/voyager-lod{0..3}.<hash>.glb` are NOT present on the lead's local clone.
- `bake/out/models-manifest-fragment.json` is NOT present locally; the on-disk manifest at `web/public/data/manifest.json` therefore does NOT carry a `models[]` entry.
- The full Draco-decode → restructure → KTX2-transcode → meshopt → simplify → write pipeline runs ONLY in CI's `build-glb` job.

**Two viable paths for the lead-driven smoke:**

**Path A — Install toktx locally, run `just bake-glb`, then smoke against the freshly-baked LODs.**

```bash
# Install Khronos KTX-Software v4.3.2 (matches CI version):
# Linux/WSL:
KTX_VER=4.3.2
curl -L "https://github.com/KhronosGroup/KTX-Software/releases/download/v${KTX_VER}/KTX-Software-${KTX_VER}-Linux-x86_64.deb" -o /tmp/ktx.deb
sudo apt-get install -y /tmp/ktx.deb
toktx --version
# Windows: download the .zip from the Khronos releases page; add toktx.exe to PATH.

# Then regenerate the LODs + manifest fragment:
git lfs pull  # hydrate bake/inputs/models/voyager-raw.glb
cd /c/git/Voyager
just bake-glb
ls web/public/models/voyager-lod*.glb   # expect 4 files
cat bake/out/models-manifest-fragment.json | jq .

# Re-run any subsequent bake that emits the manifest so the runtime sees models[]:
just bake-attitude   # or `just bake` which chains bake-glb + bake-attitude
```

Path A is the recommended path because it exercises the production code path against the production manifest schema. Probes 1–7 below all assume Path A.

**Path B — Smoke against the fallback (AC5) path without running `just bake-glb`.**

If toktx procurement is not possible in the lead's local environment, the smoke can still verify the AC5 fallback contract:

- `manifest.models[]` is empty
- AttitudeService and SpacecraftModels still construct correctly
- One `console.warn` fires from `spacecraft-models.ts:246` (per the AC5 fallback path)
- Spacecraft fails to render the LOD chain (since `web/public/models/voyager.glb` was REMOVED in T2.10); HUD remains functional

Path B is a defensible posture for transition-window contributor clones, but does NOT exercise AC1 (named hierarchy), AC3 (LOD threshold parsing), AC6 (platform rotation), or AC7 (integration) — those four ACs require LOD GLBs on disk. The MCP probe plan flags this explicitly per probe so the lead knows which probes degrade and which still apply.

### Pre-flight checklist (Path A — recommended)

1. **toktx installed.** `toktx --version` resolves successfully.
2. **LFS hydrated.** `bake/inputs/models/voyager-raw.glb` is the full 1.6 MB binary (not a 132-byte LFS pointer).
3. **LODs generated.** `ls web/public/models/voyager-lod*.glb | wc -l == 4`.
4. **Manifest fragment emitted.** `bake/out/models-manifest-fragment.json` exists and parses.
5. **Manifest re-emitted.** `web/public/data/manifest.json` (the production manifest the browser loads) carries the `models[]` field, either by running `just bake` end-to-end or by manually merging the fragment via `bake/src/manifest_writer.py`.
6. **Dev server is up.** `cd web && npm run dev` running on `localhost:5173`.
7. **Evidence directory exists.** `mkdir -p _bmad-output/implementation-artifacts/3-3-smoke-evidence/`.

### Probe 1 — Boot + `__voyagerDebug.spacecraftModels` publication (AC9 substrate)

**Goal:** Confirm the boot path constructs SpacecraftModels and publishes `__voyagerDebug.spacecraftModels` under `import.meta.env.DEV`.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://localhost:5173/"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager"   // any text confirming the SPA has booted

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  ({
    voyagerDebugExists: typeof window.__voyagerDebug !== 'undefined',
    spacecraftModelsExists: typeof window.__voyagerDebug?.spacecraftModels !== 'undefined',
    hasGetHandle: typeof window.__voyagerDebug?.spacecraftModels?.getHandle === 'function',
    hasIsLoaded: typeof window.__voyagerDebug?.spacecraftModels?.isLoaded === 'boolean',
    hasTick: typeof window.__voyagerDebug?.spacecraftModels?.tick === 'function',
    attitudeServiceCoexists: typeof window.__voyagerDebug?.attitudeService !== 'undefined',
  })
`
```

**Asserted observations:**
- `voyagerDebugExists === true`
- `spacecraftModelsExists === true`
- `hasGetHandle === true`
- `hasIsLoaded === true`
- `hasTick === true`
- `attitudeServiceCoexists === true` (Story 3.2 surface preserved alongside Story 3.3 surface — both live under the same `__voyagerDebug` namespace, neither overwrites the other)

**Failure modes addressed:**
- Tree-shaking strips the debug-surface assignment (would show `spacecraftModelsExists === false`).
- Construction order regression (SpacecraftModels constructed too late — would show methods missing).
- Method rename without updating this probe plan.
- `__voyagerDebug` spread regression overwrites `attitudeService` (would show `attitudeServiceCoexists === false`).

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-3-smoke-evidence/probe1-boot.png
```

### Probe 2 — Named hierarchy resolves at default cruise zoom (AC1, AC5)

**Goal:** Confirm `BUS`, `SCAN_PLATFORM`, and `HGA` are resolvable via `getObjectByName` on each spacecraft's loaded scene graph. Path A only — Path B is exempt (no LOD chain on disk).

```js
// (already on http://localhost:5173/ from Probe 1)

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const sm = window.__voyagerDebug.spacecraftModels;
    if (!sm) return { ok: false, reason: 'no SpacecraftModels' };

    // Drain the LOD-chain load (load() is fire-and-forget in main.ts; LODs
    // may still be in-flight at this instant). Generous timeout.
    let attempts = 0;
    while (!sm.isLoaded && attempts < 40) {
      await new Promise((r) => setTimeout(r, 100));
      attempts += 1;
    }
    if (!sm.isLoaded) return { ok: false, reason: 'LOD chain failed to load in 4s', et: window.__voyagerDebug.clockManager?.simTimeEt };

    const v1 = sm.getHandle('voyager-1');
    const v2 = sm.getHandle('voyager-2');

    // The LOD chain's level 0 is the highest-quality scene; the named groups
    // live underneath it. getObjectByName walks the entire descendant tree
    // so it resolves through the LOD->scene clone->BUS group nesting.
    const lookups = (h) => ({
      busExists: !!h.group.getObjectByName('BUS'),
      platformExists: !!h.group.getObjectByName('SCAN_PLATFORM'),
      hgaExists: !!h.group.getObjectByName('HGA'),
      platformParentIsBus:
        h.group.getObjectByName('SCAN_PLATFORM')?.parent ===
        h.group.getObjectByName('BUS'),
      lodLevels: h.lod?.levels.length ?? null,
    });

    return {
      ok: true,
      v1: lookups(v1),
      v2: lookups(v2),
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `v1.busExists === true && v1.platformExists === true && v1.hgaExists === true`
- `v1.platformParentIsBus === true`
- `v2.busExists === true && v2.platformExists === true && v2.hgaExists === true`
- `v1.lodLevels === 4 && v2.lodLevels === 4` (AC3 distance schedule populated)

**Failure modes addressed:**
- `restructureHierarchy` regression silently omits a named group (would show one of the three `*Exists` flags as `false`).
- SCAN_PLATFORM parented to the scene root instead of BUS (would show `platformParentIsBus === false`).
- LOD count drift (would show `lodLevels !== 4`).
- Cross-spacecraft clone regression — V1 has the groups but V2 doesn't (would show divergent v1/v2 lookups).

**Path B note:** in fallback mode the named hierarchy is absent (the legacy single-LOD GLB has no BUS/SCAN_PLATFORM/HGA names); this probe degrades to "ok === false, reason='LOD chain failed to load'" because `web/public/models/voyager.glb` was removed. Mark the probe as deferred and proceed.

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-3-smoke-evidence/probe2-named-hierarchy.png
```

### Probe 3 — Programmatic SCAN_PLATFORM rotation visibly changes the spacecraft (AC6, AC9)

**Goal:** Confirm rotating `SCAN_PLATFORM` by 45° about local +Y produces a visible change in the rendered spacecraft. The platform's children (instrument meshes) rotate as a rigid unit; the rest of the spacecraft (HGA, bus chassis) is unaffected. Path A only.

```js
// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const sm = window.__voyagerDebug.spacecraftModels;
    if (!sm || !sm.isLoaded) return { ok: false, reason: 'SpacecraftModels not loaded' };

    const v1 = sm.getHandle('voyager-1');
    const bus = v1.group.getObjectByName('BUS');
    const platform = v1.group.getObjectByName('SCAN_PLATFORM');
    const hga = v1.group.getObjectByName('HGA');
    if (!bus || !platform || !hga) return { ok: false, reason: 'named hierarchy missing' };

    // Capture HGA world matrix before rotation.
    v1.group.updateMatrixWorld(true);
    const hgaWorldBefore = Array.from(hga.matrixWorld.elements);
    const platformChild = platform.children.find((c) => c.name.startsWith('mesh_'));
    if (!platformChild) return { ok: false, reason: 'no platform-child mesh' };
    const platformChildBefore = Array.from(platformChild.matrixWorld.elements);

    // Apply a 45° rotation about local +Y to the platform.
    platform.quaternion.setFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 4);
    v1.group.updateMatrixWorld(true);

    const hgaWorldAfter = Array.from(hga.matrixWorld.elements);
    const platformChildAfter = Array.from(platformChild.matrixWorld.elements);

    const matrixDelta = (a, b) => {
      let max = 0;
      for (let i = 0; i < 16; i += 1) max = Math.max(max, Math.abs(a[i] - b[i]));
      return max;
    };

    return {
      ok: true,
      hgaUnchanged: matrixDelta(hgaWorldBefore, hgaWorldAfter) < 1e-9,
      platformChildMoved: matrixDelta(platformChildBefore, platformChildAfter) > 1e-3,
    };
  })()
`

// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-3-smoke-evidence/probe3-platform-rotated.png

// Restore identity and take a comparison shot.
// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (() => {
    const sm = window.__voyagerDebug.spacecraftModels;
    const v1 = sm.getHandle('voyager-1');
    const platform = v1.group.getObjectByName('SCAN_PLATFORM');
    if (platform) {
      platform.quaternion.identity();
      v1.group.updateMatrixWorld(true);
    }
    return { restored: true };
  })()
`

// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-3-smoke-evidence/probe3-platform-restored.png
```

**Asserted observations:**
- `ok === true`
- `hgaUnchanged === true` (HGA's world matrix delta < 1e-9 — the platform rotation must NOT propagate to HGA)
- `platformChildMoved === true` (platform-child mesh's world matrix moves by > 1e-3 — visibly rotated)
- Visual diff between `probe3-platform-rotated.png` and `probe3-platform-restored.png` shows the rotation was rotational + reversible (lead inspects the two PNGs).

**Failure modes addressed:**
- Platform rotated as a flat clone parented to scene-root rather than to BUS (HGA inherits the rotation incorrectly — would show `hgaUnchanged === false`).
- Pivot at mesh centroid rather than SCAN_PLATFORM origin (would still move the platform child but the geometric center would not move — visible in the screenshot as the platform "spinning in place" rather than swinging about the bus hinge).
- Three.js scene-graph mutation isn't picked up by the renderer (would show no visual change in the screenshot — `platformChildMoved` true but visual unchanged).

### Probe 4 — Cruise-ET attitude application via the dev surface (AC7 anticipation)

**Goal:** Anticipate Story 3.4's per-frame application. Apply Story 3.2's AttitudeService outputs to the named groups and visually confirm the spacecraft orients to the HGA-Earth-pointing geometry. Path A only.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://localhost:5173/?t=1995-01-01T00:00:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const sm = window.__voyagerDebug.spacecraftModels;
    const att = window.__voyagerDebug.attitudeService;
    const clock = window.__voyagerDebug.clockManager;
    if (!sm || !att || !clock) return { ok: false, reason: 'missing debug surface' };
    if (!sm.isLoaded) return { ok: false, reason: 'spacecraft models not loaded' };

    // Drain the attitude chunk-load if needed.
    await new Promise((r) => setTimeout(r, 500));

    const et = clock.simTimeEt;
    const busQuat = att.getBusQuat(-31, et);
    const platformQuat = att.getPlatformQuat(-31, et);
    const busProv = att.getBusProvenance(-31, et);
    const platformProv = att.getPlatformProvenance(-31, et);
    if (!busQuat || !platformQuat) return { ok: false, reason: 'attitude null at cruise ET', et, busProv, platformProv };

    const v1 = sm.getHandle('voyager-1');
    const bus = v1.group.getObjectByName('BUS');
    const platform = v1.group.getObjectByName('SCAN_PLATFORM');
    if (!bus || !platform) return { ok: false, reason: 'named hierarchy missing' };

    bus.quaternion.set(busQuat.x, busQuat.y, busQuat.z, busQuat.w);
    platform.quaternion.set(platformQuat.x, platformQuat.y, platformQuat.z, platformQuat.w);
    v1.group.updateMatrixWorld(true);

    const busNorm = Math.hypot(bus.quaternion.x, bus.quaternion.y, bus.quaternion.z, bus.quaternion.w);
    const platformNorm = Math.hypot(platform.quaternion.x, platform.quaternion.y, platform.quaternion.z, platform.quaternion.w);

    return {
      ok: true,
      et,
      busProv,
      platformProv,
      busUnit: Math.abs(busNorm - 1.0) < 1e-10,
      platformUnit: Math.abs(platformNorm - 1.0) < 1e-10,
    };
  })()
`

// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-3-smoke-evidence/probe4-attitude-applied-cruise.png
```

**Asserted observations:**
- `ok === true`
- `busProv === 'synthesized'` (1995-01-01 is well outside any encounter window)
- `platformProv === 'synthesized'`
- `busUnit === true && platformUnit === true` (unit quaternions after assignment)
- Visual inspection of `probe4-attitude-applied-cruise.png`: the spacecraft is visibly oriented (not in its default GLB-loading pose) and the HGA dish points generally toward Earth.

**Failure modes addressed:**
- Story 3.2's AttitudeService returns null silently at cruise ET (would show `busQuat` null).
- Quaternion assignment doesn't survive `updateMatrixWorld` (would show unit-norm violation if Three.js's auto-normalize regressed).
- Story 3.3 ↔ Story 3.2 wire-up not in place (would show `busProv` undefined or `ok === false`).

### Probe 5 — LOD chain has 4 levels + `getCurrentLevel` is sane (AC3, AC9)

**Goal:** Pin AC9 probe 5 from the story file. Path A only.

```js
// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (() => {
    const sm = window.__voyagerDebug.spacecraftModels;
    if (!sm || !sm.isLoaded) return { ok: false, reason: 'not loaded' };
    const v1 = sm.getHandle('voyager-1');
    const lod = v1.lod;
    if (!lod) return { ok: false, reason: 'no LOD instance' };

    // THREE.LOD's getCurrentLevel returns the int index of the currently-
    // active level (0..levels.length-1). Three.js 0.184 exposes this as a
    // method on the LOD instance. The current level is set on the most-
    // recent renderer.render(...) call — which the dev surface has been
    // through by the time this probe runs.
    return {
      ok: true,
      levelCount: lod.levels.length,
      // distances are monotonic — assert they match the manifest schedule
      distances: lod.levels.map((l) => l.distance),
      currentLevel: typeof lod.getCurrentLevel === 'function' ? lod.getCurrentLevel() : null,
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `levelCount === 4`
- `distances === [0.001, 0.1, 1.0, Infinity]` (matches LOD_SCHEDULE — pinned in QA gap 6)
- `currentLevel` is an integer in `[0, 3]`

**Failure modes addressed:**
- Manifest-driven distance threshold parsing regression (would show distances diverging from [0.001, 0.1, 1.0, Infinity]).
- `null → Infinity` mapping at maxDistanceKm regression (would show `lod.levels[3].distance` as `NaN` or `null`).
- LOD chain construction order off (would show distances out of monotonic order).

### Probe 6 — Console clean + network OK (Rule 3, AC8)

**Goal:** No console errors apart from the Lit dev-mode banner. All LOD GLBs + manifest fetch returns 200.

```js
// mcp__chrome-devtools-mcp__list_console_messages
// filter: "error"
```

**Asserted observations:**
- No errors apart from the Lit dev-mode banner (`"Lit is in dev mode. Not recommended for production"`).
- No `[spacecraft-models]` warnings about fallback (Path A — manifest has `models[]` populated, so the AC5 fallback warn never fires).
- No GLTFLoader 404s / parse errors.
- No MeshoptDecoder / KTX2 errors (a missing `/basis/basis_transcoder.wasm` would surface here as a 404).

```js
// mcp__chrome-devtools-mcp__list_network_requests
// filter: "voyager-lod|basis|manifest|attitude"
```

**Asserted observations:**
- All `voyager-lod{0,1,2,3}.<hash>.glb` requests return HTTP 200.
- `basis_transcoder.js` + `basis_transcoder.wasm` requests return HTTP 200 if any KTX2 texture transcoding is needed (the upstream NASA Voyager Probe (B) GLB has 3 KTX2 textures after AC2's toktx step).
- `manifest.json` returns HTTP 200 with the `models[]` array populated.
- At least one `*bus_attitude*.bin.br` request returns HTTP 200 (Story 3.2 attitude is still active alongside Story 3.3).

**Path B note:** in fallback mode the AC5 console.warn IS expected (`'[spacecraft-models] no models in manifest; falling back to single-LOD legacy path...'`). Allowed in Path B; tracked as the canonical evidence that the fallback fired exactly once.

### Probe 7 — Encounter-chapter zoom (V1 Jupiter) visual check (AC9 probe 7)

**Goal:** Visual sanity check that the spacecraft model renders cleanly at chapter-camera distance (V1 Jupiter encounter chapter). Path A only.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://localhost:5173/c/v1-jupiter"

// mcp__chrome-devtools-mcp__wait_for
text: "Jupiter"

// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-3-smoke-evidence/probe7-v1-jupiter-chapter.png
```

**Asserted observations:**
- Screenshot captured (no rendering crash).
- Spacecraft is visible at chapter-camera distance.
- LOD level chosen is appropriate for the chapter camera (the chapter camera sits closer than cruise → expects LOD1 or LOD0; lead inspects screenshot for visible polygon detail).
- No visible "pop" artifact when navigating between cruise and the chapter URL (lead may take an intermediate screenshot at `localhost:5173/` and `localhost:5173/c/v1-jupiter` to compare).

**Failure modes addressed:**
- LOD threshold tuning mismatch — chapter camera sits at a distance that falls into LOD3 (silhouette-only) instead of LOD1, would show a visibly degenerate spacecraft.
- Chapter-camera floating-origin recenter regression breaks spacecraft positioning at the chapter (would show spacecraft off-screen or at world-origin).

## Evidence directory layout

After lead executes the probes:

```
_bmad-output/implementation-artifacts/3-3-smoke-evidence/
├── probe1-boot.png
├── probe2-named-hierarchy.png
├── probe3-platform-rotated.png
├── probe3-platform-restored.png
├── probe4-attitude-applied-cruise.png
├── probe7-v1-jupiter-chapter.png
└── probe-results.json    # optional — copy of each evaluate_script return value
```

## Coverage gap analysis vs dev's tests

Dev-3-3's 24 new web tests + 7 build_glb pure-JS tests + 5 bake tests + 4 integration tests cover the core ACs deeply. Gaps identified and filled in `web/tests/spacecraft-models-qa-gaps.test.ts` (18 new gap tests, all in the default Vitest collection):

| Gap | AC | Why dev missed it | Resolution |
|---|---|---|---|
| **HGA quaternion is the load-bearing FK derivation** — verify `hga.quaternion` equals (1,0,0,0) Rx(180°) AND that applying it to local +Z yields VG1_HGA_BORESIGHT_RELATIVE_TO_BUS = (0,0,-1) | AC1 | Dev's named-hierarchy test only verifies `getObjectByName('HGA')` is non-null — the quaternion is loaded but never asserted. A future bake change that strips the HGA rotation would silently break Story 3.5's NA-camera-cone direction. | New: `QA gap 1 — AC1 HGA quaternion orientation is the FK derivation` (2 tests: literal quat values + boresight transform parity) |
| **SCAN_PLATFORM rotation pivot is at group origin, not mesh centroid** | AC6 | Dev's AC6 test verifies HGA invariance + platform-child world-matrix change but does NOT distinguish "pivot at group origin" from "pivot at mesh centroid". The story's AC6 explicit language calls for this distinction. We use an offset platform-mesh + 180° rotation to crisply separate the two hypotheses (centroid-pivot leaves the world-position unchanged; group-pivot reflects the world-position across the SCAN_PLATFORM origin). | New: `QA gap 2 — AC6 SCAN_PLATFORM rotation pivot is the group origin` (1 test: 180°-Y rotation reflects mesh world position about platform origin) |
| **BUS quaternion propagates to HGA + SCAN_PLATFORM children** | AC7 | Dev's integration test verifies the inverse (`platform rotation does NOT affect HGA`) but doesn't directly pin `bus rotation DOES affect both`. This is the Story 3.4 per-frame application's primary contract. | New: `QA gap 3 — AC7 BUS quaternion propagation` (2 tests: bus rotation moves both child meshes; bus + platform compose via parent-first quaternion product) |
| **`__voyagerDebug.spacecraftModels` surface contract** | AC9 | Dev's tests bypass `main.ts` and test SpacecraftModels via direct constructor. The AC9 MCP smoke evaluates `window.__voyagerDebug.spacecraftModels.getHandle('voyager-1').{group,lod}` — if a future refactor strips the publication, the MCP probes silently degrade. Mirrors qa-3-2 gap 3 (attitudeService surface contract). | New: `QA gap 4 — AC9 __voyagerDebug.spacecraftModels surface contract` (3 tests: source-grep main.ts for the publication + DEV gate; getHandle returns the {group, lod} shape; post-load lod is THREE.LOD with 4 levels) |
| **AC4 Zod schema boundary cases** | AC4 | Python dev tests cover sha256 + empty lods. The runtime Zod schema has additional invariants — `.max(3)` on level, `.positive()` on maxDistanceKm + scaleToKm (both exclude 0), and tuple-arity on pivotMeters — that aren't tested at either tier. | New: `QA gap 5 — AC4 Zod schema boundary cases` (4 tests: level > 3 reject, maxDistanceKm = 0 reject, scaleToKm = 0 reject, pivotMeters wrong-arity reject) |
| **AC2 LOD_SCHEDULE values are pinned** | AC2 | LOD_SCHEDULE is the single source of truth for AC3's distance thresholds + AC2's simplify ratios. A future contributor tweaking the schedule without updating the story's AC commitments leaves the runtime out-of-sync. Pin the values directly. | New: `QA gap 6 — AC2 LOD_SCHEDULE pinning` (4 tests: 4-entry shape + level ordering; simplify ratios; distance thresholds; monotonic-distance invariant including null→∞) |
| **AC3 single-LOD model entry + permuted-order lods array** | AC3 | Dev tests assume the 4-LOD shape; Zod `.min(1)` allows fewer. A single-LOD manifest must still construct a valid THREE.LOD. Separately, the loader sorts `lods` by `level` before iterating — permuted-order input must still produce a monotonic-distance chain. | New: `QA gap 7 — AC3 single-LOD + permuted-order handling` (2 tests: 1-level manifest → 1-level LOD; permuted-order input still sorted before addLevel) |

## Generated Tests

### Web-side (vitest)

| File | Test block | AC | Discoverability |
|---|---|---|---|
| `web/tests/spacecraft-models-qa-gaps.test.ts` | `QA gap 1 — AC1 HGA quaternion orientation is the FK derivation` (2 tests) | AC1 | Default Vitest collection (no markers, no `.skip`); `@vitest-environment happy-dom` directive matches other QA-gap files |
| `web/tests/spacecraft-models-qa-gaps.test.ts` | `QA gap 2 — AC6 SCAN_PLATFORM rotation pivot is the group origin` (1 test) | AC6 | Default collection |
| `web/tests/spacecraft-models-qa-gaps.test.ts` | `QA gap 3 — AC7 BUS quaternion propagation` (2 tests) | AC7 | Default collection |
| `web/tests/spacecraft-models-qa-gaps.test.ts` | `QA gap 4 — AC9 __voyagerDebug.spacecraftModels surface contract` (3 tests) | AC9 | Default collection (source-grep uses node:fs; happy-dom supports) |
| `web/tests/spacecraft-models-qa-gaps.test.ts` | `QA gap 5 — AC4 Zod schema boundary cases` (4 tests) | AC4 | Default collection |
| `web/tests/spacecraft-models-qa-gaps.test.ts` | `QA gap 6 — AC2 LOD_SCHEDULE pinning` (4 tests) | AC2 / AC3 | Default collection |
| `web/tests/spacecraft-models-qa-gaps.test.ts` | `QA gap 7 — AC3 single-LOD + permuted-order handling` (2 tests) | AC3 / AC5 | Default collection |

**Total: 18 new tests in 1 new file. All discovered by `npm test -- --run` with no special markers.**

## Coverage

- **AC1 (Named hierarchy):** Dev's 2 hierarchy tests in `spacecraft-models.test.ts` + 1 in the integration test cover `getObjectByName` and parent-of-platform. **+2 QA tests** for HGA quaternion literal + boresight-transform parity.
- **AC2 (Asset pipeline):** Dev's 7 pure-JS tests in `build_glb.test.ts` cover restructureHierarchy, countVertices, idempotency, mesh-name mismatch. **+4 QA tests** pin LOD_SCHEDULE (the AC2 contract surface) — 4-entry, ratios, distances, monotonic invariant.
- **AC3 (THREE.LOD integration):** Dev's 3 LOD tests cover 4-level construction, distance parsing, URL loading. **+2 QA tests** for single-LOD + permuted-order edge cases.
- **AC4 (Manifest schema):** Dev's 5 Zod tests cover happy-path + 3 reject cases. **+4 QA tests** for the Zod-boundary edges (level > 3, zero distance, zero scale, pivot arity).
- **AC5 (SpacecraftModels consumes manifest):** Dev's fallback-warn-once + URL-loading tests cover the manifest-consumer path. QA finds no additional gap.
- **AC6 (Platform rotation):** Dev's HGA-invariance + platform-child-changed tests cover the contract behaviorally. **+1 QA test** crisply separates "pivot at group origin" from "pivot at mesh centroid".
- **AC7 (Integration with AttitudeService):** Dev's 4 integration tests cover the full boot stack. **+2 QA tests** for the converse direction (bus rotation propagates to children) + parent-first composition.
- **AC8 (Test sweep green):** Confirmed web vitest **2177 pass** (+18 from dev's 2159); typecheck clean; lint baseline preserved (4 warnings — no new).
- **AC9 (Lead-driven MCP smoke):** Probe plan authored above. **+3 QA tests** pin the AC9-substrate `__voyagerDebug.spacecraftModels` surface so a regression breaks at the QA tier before reaching the lead's MCP session.

## Discoverability check (per skill `on_complete` hook)

All 18 new tests run in the default suite. Verified:

- `web/tests/spacecraft-models-qa-gaps.test.ts` — discovered by `cd web && npm test -- --run` (default Vitest glob `**/*.test.ts`; no special markers; no `.skip`; no `it.skip`/`describe.skip`).
- The `@vitest-environment happy-dom` directive at the top of the file matches the pattern in `web/tests/attitude-service-qa-gaps.test.ts` and other QA-gap test files; happy-dom is configured via the file directive.
- No tags (`@slow`, `@flaky`, etc.) that would exclude from default run.

Confirmation runs (from this QA session):
- `cd web && npm test -- --run tests/spacecraft-models-qa-gaps.test.ts` → **1 file, 18 tests passed** in 2.26s.
- `cd web && npm test -- --run` → **118 test files, 2177 tests passed** in 37.73s (+18 net new from 2159 baseline). 0 failures.
- `cd web && npm run typecheck` → clean.

## Voyager skill-rules compliance summary

- **Rule 1 (Integration ACs):** Verified — AC7 IS the Integration AC for Story 3.3 (named-hierarchy ↔ AttitudeService consumer pattern). Dev's `spacecraft-models-attitude-integration.test.ts` honours it; QA gap 3 reinforces it with the converse direction (bus rotation propagation).
- **Rule 3 (per-story smoke):** **APPLIED** — Story 3.3 touches `web/src/render/spacecraft-models.ts` (rewrite) + `web/src/main.ts` (wire-up + debug-surface) + `web/src/services/manifest-loader.ts` (schema extension). MCP smoke plan authored above; lead executes per Rule 7.
- **Rule 4 (structured completion):** Closing summary at the bottom of this QA agent's return message.
- **Rule 5 (NFR tripwire response):** Not triggered by QA work. Dev surfaced NO tripwires; the LOD-size budgets (LOD0 ≤ 2 MB, LOD3 ≤ 100 KB) are soft targets per the story AC2 §, with breach-handling spelled out.
- **Rule 6 (ADR violations are HIGH):** QA gap 1 (HGA quaternion = bus -Z boresight per Story 3.2 fk-constants) reinforces ADR-0006 (meshopt over Draco) + fk-constants compliance; QA gap 4 reinforces the `__voyagerDebug` surface contract that ADR-0010 + AC9 depend on.
- **Rule 7 (sub-agent tool inventory is harness-inherited):** Honoured — MCP probes are placed on the lead (Layer 1 of ADR-0010), not in this QA agent's execution. Probe plan is fully scripted so the lead can execute without re-deriving.
- **Rule 8 (Chrome DevTools MCP is the canonical browser-smoke driver):** Honoured — no initScript shim referenced. Post-Story-1.16 brotli-dec-wasm handles the browser brotli path.
- **Rule 9 (ADR-0025 APG primitives are extracted):** Not applicable — Story 3.3 introduces no APG-keyboard-handling components.

## Notes for the lead

- **Pre-flight is the load-bearing step.** If toktx is not installed locally, decide Path A vs Path B BEFORE opening Chrome DevTools MCP. Path A requires ~10 min for the toktx install + LFS hydrate + `just bake-glb` run. Path B is faster but only validates the AC5 fallback path.
- **CI is the canonical smoke for the full pipeline.** Even if the lead's local smoke is Path B, CI's `build-glb` job exercises the full toktx + meshopt + KTX2 pipeline end-to-end against `bake/inputs/models/voyager-raw.glb`. CI artifacts (LOD GLBs + manifest fragment) upload to the GitHub Actions artifact store; the lead may inspect them there if local Path A is not feasible.
- **Story 3.4 will diff against Story 3.3 visuals.** Probe 4's screenshot (`probe4-attitude-applied-cruise.png`) becomes the "before" baseline for Story 3.4's per-frame attitude application smoke — Story 3.4 will diff against it to confirm the per-frame application changed the visible orientation. Save it carefully.

## Next Steps

- **Lead:** Execute the AC9 MCP smoke plan above against `localhost:5173`. Decide Path A vs Path B based on local toktx availability. Save evidence to `_bmad-output/implementation-artifacts/3-3-smoke-evidence/`. Hand off to code review (`bmad-code-review` skill) after smoke evidence is captured.
- **Code review (cr-3-3):** Cross-check each AC against ADR registry per Rule 6. Particular attention to: ADR-0006 (meshopt over Draco — verify Draco bundle removal + MeshoptDecoder registration); ADR-0008 (Three.LOD usage); ADR-0011 (LFS-tracked LOD outputs); ADR-0026 (no `any`).
- **Story 3.4 dev (downstream):** When applying per-frame attitude, exercise probe 4's visual baseline as a diff target. The bus + platform quaternion application path is already exercised by AC7's integration test + QA gap 3.

## Tests Added
- C:/git/Voyager/web/tests/spacecraft-models-qa-gaps.test.ts

## Decisions
- Targeted seven cross-cutting gaps (HGA quaternion FK derivation, SCAN_PLATFORM rotation-pivot crispness, BUS quaternion propagation converse, __voyagerDebug surface contract, Zod boundary cases, LOD_SCHEDULE pinning, single-LOD + permuted-lods edge cases) rather than re-testing dev's covered paths.
- Authored the MCP probe plan with explicit Path A / Path B handling because toktx is not in the dev environment locally — the lead must consciously choose which set of probes apply before running the smoke.

## Issues Encountered
- toktx is not installed in the dev environment, so `web/scripts/build_glb.ts` runs only in CI; the LOD GLBs and the `models[]` manifest entry are CI-only artifacts at this point. Probe plan documents both Path A (lead installs toktx locally) and Path B (smoke against the AC5 fallback) so the lead can make an informed choice.
