# Test Automation Summary — Story 3.5 (Narrow-Angle Camera Boresight Cone)

**QA agent:** qa-3-5 (Opus 4.7) under `/epic-cycle 3`
**Story file:** `_bmad-output/implementation-artifacts/3-5-narrow-angle-camera-boresight-cone.md`
**Story status going in:** review (dev-3-5 committed Tasks T1–T6; T6 lead-driven MCP smoke pending)
**Baseline going in:** web vitest 2232 pass / 1 skipped / 123 files (Story 3.4 baseline 2210 + 22 net new from dev-3-5: 16 boresight-renderer unit + 6 integration); typecheck clean; lint baseline preserved (4 pre-existing warnings)
**Baseline going out:** web vitest **2255 pass** / 1 skipped / 124 files (+23 net new QA gap tests in `web/tests/boresight-renderer-qa-gaps.test.ts`); typecheck clean; lint baseline preserved

## Chrome DevTools MCP smoke stage (Rule 3 + Rule 8 — AC8)

Story 3.5 touches `web/src/main.ts` (BoresightRenderer construction + attach in `spacecraftModels.load(...).then()` + tick in `engine.onFrame` after `attitudeApplier.tick(...)` + `__voyagerDebug.boresightRenderer` publication) and introduces `web/src/render/boresight-renderer.ts` (a new render-side module producing visible wireframe geometry — user-facing surface). Per voyager-skill-rules.md Rule 3, browser-MCP smoke is the per-story exit criterion when `web/src/` is touched. Per Rule 8, no initScript shim is needed (post-Story-1.16 Chrome-for-Testing 148 loads Voyager via brotli-dec-wasm).

Per ADR-0010 Layer 1 and Rule 7, the smoke is executed by the **lead** (qa-3-5 authors the plan; lead runs the probes). The lead-driven probe plan below is authored to be one-shot executable against the local dev server on `http://127.0.0.1:5173/`.

### Pre-flight checklist

1. **toktx + LFS prerequisites met** (carried forward from Stories 3.3 / 3.4 path A). If the lead's local environment is on path B (no LOD GLBs on disk), probes 1, 5, and 7 still run but probes 2, 3, 4, and 6 are degraded — see per-probe notes.
2. **Dev server up.** `cd web && npm run dev` running on `127.0.0.1:5173`.
3. **Evidence directory exists.** `mkdir -p _bmad-output/implementation-artifacts/3-5-smoke-evidence/`.
4. **Story 3.4 evidence dir intact** (optional cross-reference). Probe 2 (V1 Jupiter CK) can diff against `_bmad-output/implementation-artifacts/3-4-smoke-evidence/probe2-v1-jupiter-ck-applied.png` as the "before" baseline — Story 3.4 applied the attitude per frame; Story 3.5 adds the cone wireframe layered on top of that same attitude.

### Probe 1 — Boot + `__voyagerDebug.boresightRenderer` publication (AC1, AC8 substrate)

**Goal:** Confirm the boot path constructs BoresightRenderer and publishes `__voyagerDebug.boresightRenderer` under `import.meta.env.DEV`, coexisting with `attitudeApplier`, `attitudeService`, and `spacecraftModels` from earlier stories.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  ({
    voyagerDebugExists: typeof window.__voyagerDebug !== 'undefined',
    boresightExists: typeof window.__voyagerDebug?.boresightRenderer !== 'undefined',
    boresightAttachIsFunction: typeof window.__voyagerDebug?.boresightRenderer?.attach === 'function',
    boresightTickIsFunction: typeof window.__voyagerDebug?.boresightRenderer?.tick === 'function',
    boresightDisposeIsFunction: typeof window.__voyagerDebug?.boresightRenderer?.dispose === 'function',
    boresightIsAttached: window.__voyagerDebug?.boresightRenderer?.__isAttached?.() ?? null,
    // Story 3.4 attitudeApplier surface coexists (Rule: spread-preserve).
    applierCoexists: typeof window.__voyagerDebug?.attitudeApplier !== 'undefined',
    // Story 3.2 attitudeService surface coexists.
    attitudeServiceCoexists: typeof window.__voyagerDebug?.attitudeService !== 'undefined',
    // Story 3.3 spacecraftModels surface coexists.
    spacecraftModelsCoexists: typeof window.__voyagerDebug?.spacecraftModels !== 'undefined',
  })
`
```

**Asserted observations:**
- `voyagerDebugExists === true`
- `boresightExists === true`
- `boresightAttachIsFunction === true`
- `boresightTickIsFunction === true`
- `boresightDisposeIsFunction === true`
- `boresightIsAttached === true` (the `.then()` chain post-LOD-load has resolved and attach() has run)
- `applierCoexists === true && attitudeServiceCoexists === true && spacecraftModelsCoexists === true` (spread-preserve invariant — Stories 3.2/3.3/3.4 surfaces preserved)

**Failure modes addressed:**
- Tree-shaking strips the boresight publication (would show `boresightExists === false`).
- Spread regression overwrites the namespace (`__voyagerDebug = { boresightRenderer }`) — would show `applierCoexists === false` or `attitudeServiceCoexists === false`.
- BoresightRenderer constructed but attach() never resolved (LOD load promise hangs or path B has no LODs) — would show `boresightIsAttached === false`.

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-5-smoke-evidence/probe1-boot.png
```

### Probe 2 — V1 Jupiter CK: cone visible and parented to SCAN_PLATFORM (AC1, AC4)

**Goal:** Navigate to the V1 Jupiter encounter ET. Confirm the cone mesh exists in the scene graph as a `LineSegments` descendant of V1's active LOD `SCAN_PLATFORM` node, with the expected name + material properties.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const dbg = window.__voyagerDebug;
    if (!dbg?.boresightRenderer || !dbg?.spacecraftModels) {
      return { ok: false, reason: 'missing debug surface' };
    }

    // Drain the LOD load.
    let attempts = 0;
    while ((!dbg.spacecraftModels.isLoaded) && attempts < 60) {
      await new Promise((r) => setTimeout(r, 100));
      attempts += 1;
    }
    if (!dbg.spacecraftModels.isLoaded) return { ok: false, reason: 'LOD chain not loaded after 6s' };

    // Settle a few frames so attach() has run + the cone is parented.
    await new Promise((r) => setTimeout(r, 500));

    const v1 = dbg.spacecraftModels.getHandle('voyager-1');
    const cone = dbg.boresightRenderer.__getCone?.('voyager-1');
    if (!cone) return { ok: false, reason: 'cone not constructed' };

    // The cone's parent must be an Object3D named SCAN_PLATFORM.
    const parent = cone.parent;
    const parentIsScanPlatform = parent?.name === 'SCAN_PLATFORM';

    // The cone's ancestry leads through the active LOD level's scene root.
    let isInsideV1Group = false;
    let cursor = cone.parent;
    while (cursor !== null && cursor !== undefined) {
      if (cursor === v1.group) { isInsideV1Group = true; break; }
      cursor = cursor.parent;
    }

    // Material contract per AC2.
    const mat = cone.material;
    const opacity = mat?.opacity;
    const transparent = mat?.transparent;

    // Mesh scale contract per AC2 (CONE_LENGTH_KM = 0.001 applied to mesh,
    // not geometry — defends against a regression that mutates the
    // geometry directly).
    const scaleX = cone.scale.x;
    const scaleY = cone.scale.y;
    const scaleZ = cone.scale.z;

    // EdgesGeometry positions count > 0 (the dev's float-precision fix).
    const positionsCount = cone.geometry?.getAttribute?.('position')?.count ?? -1;

    return {
      ok: true,
      coneName: cone.name,
      parentIsScanPlatform,
      isInsideV1Group,
      opacity,
      transparent,
      scaleX,
      scaleY,
      scaleZ,
      positionsCount,
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `coneName === 'voyager-1-na-boresight-cone'`
- `parentIsScanPlatform === true`
- `isInsideV1Group === true` (the cone is part of V1's subtree, not floating)
- `opacity === 0.5` (the AC2 visual-register contract)
- `transparent === true`
- `scaleX === 0.001 && scaleY === 0.001 && scaleZ === 0.001` (uniform CONE_LENGTH_KM)
- `positionsCount > 0` (EdgesGeometry float-precision fix is intact)

**Failure modes addressed:**
- Cone never constructed (BoresightRenderer.attach didn't run).
- Cone parented to the wrong node (e.g., handle.group root, BUS instead of SCAN_PLATFORM) — `parentIsScanPlatform === false`.
- A future refactor reverts the unit-scale-then-mesh-scale fix → EdgesGeometry collapses → `positionsCount === 0` and the cone is invisible.
- Opacity / transparent regression (e.g., a UX tweak set opacity=1.0) — `opacity !== 0.5`.

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-5-smoke-evidence/probe2-v1-jupiter-cone.png
```

### Probe 3 — V1 Jupiter visual register: cone is thin + semi-transparent + visible (AC4)

**Goal:** Visual confirmation that the cone reads as "thin wireframe semi-transparent" against the spacecraft body. The lead inspects the screenshot at zoom-in level. The cone's apex should sit at the scan platform pivot; the cone should extend along the platform's +Z; the spacecraft body behind the cone must be visible through the cone (the 0.5 opacity contract).

```js
// (still on http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z from probe 2)

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const dbg = window.__voyagerDebug;
    const v1 = dbg.spacecraftModels.getHandle('voyager-1');
    const cone = dbg.boresightRenderer.__getCone?.('voyager-1');

    // Snapshot the cone's world matrix decomposition — position, the cone's
    // world +Z direction (apex pointing direction), and the platform's
    // world quaternion. These three derive from scene-graph parenting +
    // AttitudeApplier writes.
    v1.group.updateMatrixWorld(true);
    cone.updateMatrixWorld(true);

    const conePos = new (window.THREE?.Vector3 ?? cone.position.constructor)();
    cone.getWorldPosition(conePos);

    const coneWorldZ = new (window.THREE?.Vector3 ?? cone.position.constructor)(0, 0, 1);
    coneWorldZ.transformDirection(cone.matrixWorld);

    return {
      ok: true,
      conePosX: conePos.x,
      conePosY: conePos.y,
      conePosZ: conePos.z,
      coneZDirX: coneWorldZ.x,
      coneZDirY: coneWorldZ.y,
      coneZDirZ: coneWorldZ.z,
      coneZMagnitude: Math.hypot(coneWorldZ.x, coneWorldZ.y, coneWorldZ.z),
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `coneZMagnitude` ≈ 1.0 (cone world +Z direction is unit length — proves the matrixWorld decomposition is well-formed).
- `coneZDirX/Y/Z` are NOT (0, 0, 1) (the cone is NOT at identity orientation — V1's attitude at the Jupiter window has articulated the platform). The exact values are CK-driven and not pinned; the test merely asserts NON-identity.

**Failure modes addressed:**
- Cone is at identity even though attitude was applied (parenting broken — the cone's matrixWorld is decoupled from the platform).
- Cone's world +Z magnitude is wildly off (non-uniform scale leaked into the parent chain).

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-5-smoke-evidence/probe3-cone-visual-register.png
```

### Probe 4 — Cruise ET synthesized regime: cone STILL renders (AC4 cruise resilience)

**Goal:** Navigate to a deep-cruise ET (1995-01-01, outside any CK window). The cone MUST still be present in the scene graph and parented correctly. Per AC4: at a cruise ET the cone STILL renders parented to SCAN_PLATFORM, inheriting the bus's synthesized HGA-Earth-pointing rotation through the scene graph.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1995-01-01T00:00:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const dbg = window.__voyagerDebug;
    let attempts = 0;
    while (!dbg.spacecraftModels?.isLoaded && attempts < 40) {
      await new Promise((r) => setTimeout(r, 100));
      attempts += 1;
    }
    await new Promise((r) => setTimeout(r, 500));

    const et = dbg.clockManager.simTimeEt;
    const v1 = dbg.spacecraftModels.getHandle('voyager-1');
    const v2 = dbg.spacecraftModels.getHandle('voyager-2');
    const coneV1 = dbg.boresightRenderer.__getCone?.('voyager-1');
    const coneV2 = dbg.boresightRenderer.__getCone?.('voyager-2');

    const v1BusProv = dbg.attitudeService.getBusProvenance?.(-31, et);
    const v2BusProv = dbg.attitudeService.getBusProvenance?.(-32, et);

    return {
      ok: true,
      et,
      v1BusProv,
      v2BusProv,
      v1ConePresent: coneV1 !== null && coneV1 !== undefined,
      v2ConePresent: coneV2 !== null && coneV2 !== undefined,
      v1ConeParentIsScanPlatform: coneV1?.parent?.name === 'SCAN_PLATFORM',
      v2ConeParentIsScanPlatform: coneV2?.parent?.name === 'SCAN_PLATFORM',
      // The cone's matrixWorld still has a non-zero rotation component
      // (inherited from the bus's synthesized HGA-pointing quaternion).
      v1ConeMatrixDeterminant: (() => {
        v1.group.updateMatrixWorld(true);
        coneV1?.updateMatrixWorld(true);
        return coneV1?.matrixWorld?.determinant?.() ?? null;
      })(),
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `v1BusProv === 'synthesized'` (1995-01-01 is well outside any encounter window)
- `v2BusProv === 'synthesized'`
- `v1ConePresent === true && v2ConePresent === true` (cones survived the cruise-ET nav)
- `v1ConeParentIsScanPlatform === true && v2ConeParentIsScanPlatform === true` (still parented correctly after the nav)
- `v1ConeMatrixDeterminant` is finite (NaN or 0 would indicate a broken transform chain)

**Failure modes addressed:**
- Cone disappears or unparents on cruise ET (e.g., a defensive guard accidentally hides the cone when attitudeService.getBusQuat returns the synthesized regime).
- LOD-swap during navigation orphans the cone (the synthesized-regime path crosses an LOD threshold; the maybeReparent step must run).

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-5-smoke-evidence/probe4-cruise-cone.png
```

### Probe 5 — Per-spacecraft single-instance contract (AC3)

**Goal:** Confirm EXACTLY 2 cone meshes exist in the combined scene graph (one per spacecraft), regardless of how many LOD levels are loaded. This is the load-bearing memory hygiene contract — Story 3.5's AC3 says the cone is re-parented across LOD swaps, NOT re-created per level.

```js
// (still on http://127.0.0.1:5173/?t=1995-01-01T00:00:00Z from probe 4)

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (() => {
    const dbg = window.__voyagerDebug;
    const v1 = dbg.spacecraftModels.getHandle('voyager-1');
    const v2 = dbg.spacecraftModels.getHandle('voyager-2');

    // Count LineSegments instances under both spacecraft groups. The
    // BoresightRenderer constructs exactly one per spacecraft (2 total).
    // Walking through ALL LOD levels' subtrees, the count must still be 2,
    // not 2 × N_levels = 8.
    let total = 0;
    const visit = (obj) => {
      if (obj?.type === 'LineSegments') total += 1;
      const children = obj?.children ?? [];
      for (const c of children) visit(c);
    };
    visit(v1.group);
    visit(v2.group);

    // Number of LOD levels per spacecraft (for the denominator check).
    const v1LevelCount = v1.lod?.levels?.length ?? 1;
    const v2LevelCount = v2.lod?.levels?.length ?? 1;

    return {
      total,
      v1LevelCount,
      v2LevelCount,
      // If the regression were "construct per LOD level", we'd see total = v1+v2 level count = 8.
      expectedIfBuggy: v1LevelCount + v2LevelCount,
    };
  })()
`
```

**Asserted observations:**
- `total === 2` (one cone per spacecraft, NOT 8)
- `expectedIfBuggy === 8` (sanity: the LOD chain DOES have 4 levels per spacecraft; the regression sentinel is well-formed).

**Failure modes addressed:**
- A future refactor constructs the cone inside each LOD level's subtree (e.g., during the GLB loader) instead of in `BoresightRenderer.attach()` — would show `total === 8`.
- The maybeReparent step ADDS the cone to the new level's SCAN_PLATFORM without REMOVING from the old level's parent — would show `total > 2` (depending on how many swaps had occurred since boot).

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-5-smoke-evidence/probe5-single-instance.png
```

### Probe 6 — Cone tracks platform articulation during 1× scrub (AC1, AC6 runtime check)

**Goal:** Sample the cone's world +Z direction at 5 sample points (1 second apart) during real-time playback inside the V1 Jupiter CK window. Verify the direction CHANGES (the cone is inheriting the platform's per-frame rotation, not stuck at a constant orientation).

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const dbg = window.__voyagerDebug;
    const v1 = dbg.spacecraftModels.getHandle('voyager-1');
    const cone = dbg.boresightRenderer.__getCone?.('voyager-1');
    if (!cone) return { ok: false, reason: 'cone missing' };

    dbg.clockManager.setMultiplier(1);
    const samples = [];

    const VectorCtor = cone.position.constructor;
    for (let i = 0; i < 5; i += 1) {
      v1.group.updateMatrixWorld(true);
      cone.updateMatrixWorld(true);
      const zDir = new VectorCtor(0, 0, 1).transformDirection(cone.matrixWorld);
      samples.push({
        et: dbg.clockManager.simTimeEt,
        x: zDir.x,
        y: zDir.y,
        z: zDir.z,
      });
      await new Promise((r) => setTimeout(r, 1000));
    }

    let maxDelta = 0;
    for (let i = 0; i < samples.length - 1; i += 1) {
      const a = samples[i];
      const b = samples[i + 1];
      const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
      maxDelta = Math.max(maxDelta, d);
    }
    return { ok: true, samples, maxDelta };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `samples.length === 5`
- All five `et` values are distinct and monotonically increasing.
- `maxDelta > 1e-6` (the cone's world direction is changing as the platform articulates — proves scene-graph parenting is propagating the per-frame quaternion).

**Failure modes addressed:**
- Cone parented to a node OTHER than the per-frame-updated SCAN_PLATFORM (cone direction stays constant — `maxDelta === 0`).
- AttitudeApplier writes don't reach the SCAN_PLATFORM the cone is parented to (LOD-level mismatch bug — would also show constant cone direction).
- An accidentally-cached `cone.quaternion.copy(...)` in the boresight tick path (which would prevent the inherited rotation from updating).

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-5-smoke-evidence/probe6-cone-tracks-platform.png
```

### Probe 7 — Console clean + no per-frame errors (Rule 3, AC8)

**Goal:** No console errors during a 5-second sustained tick at 1×. The Lit dev-mode banner is the only acceptable warning. No `[boresight-renderer]` errors, no Three.js mutation errors, no `Cannot read property 'getCurrentLevel' of null` style crashes.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// Sustain the engine for 5 seconds at 1×.
// mcp__chrome-devtools-mcp__wait_for { time: 5000 }

// mcp__chrome-devtools-mcp__list_console_messages
// filter: "error" (then also "warn" separately)
```

**Asserted observations:**
- Zero `error`-level messages (default-allow-list permits the Lit dev-mode banner only).
- Zero `[boresight-renderer]` references in any console message.
- Zero `Cannot read property` / `is not a function` exceptions thrown during the 5s tick window.
- `warn`-level messages: only the Lit dev-mode banner. No `[spacecraft-models]` fallback warn (Path A — full LOD chain on disk).

```js
// mcp__chrome-devtools-mcp__list_network_requests
// filter: "manifest|attitude|voyager-lod"
```

**Asserted observations:**
- All bus_attitude + platform_attitude chunk requests return HTTP 200 (Story 3.4 carry-forward).
- All LOD GLB requests return HTTP 200.
- No 404s for missing CK chunks at the V1 Jupiter window.

## Evidence directory layout

After lead executes the probes:

```
_bmad-output/implementation-artifacts/3-5-smoke-evidence/
├── probe1-boot.png
├── probe2-v1-jupiter-cone.png
├── probe3-cone-visual-register.png
├── probe4-cruise-cone.png
├── probe5-single-instance.png
├── probe6-cone-tracks-platform.png
├── probe-results.json    # optional — copy of each evaluate_script return value
```

## Coverage gap analysis vs dev's tests

Dev-3-5's 16 unit + 6 integration tests cover AC1/AC2/AC3/AC6 happy paths deeply, including the load-bearing EdgesGeometry float-precision fix and the AC1 LOD-aware resolution pattern. Gaps identified and filled in `web/tests/boresight-renderer-qa-gaps.test.ts` (23 new tests, all in the default Vitest collection):

| Gap | AC | Why dev missed it | Resolution |
|---|---|---|---|
| **EdgesGeometry float-precision robustness across CONE_LENGTH_KM scales** — dev's fix builds the cone geometry at UNIT scale and applies CONE_LENGTH_KM via mesh.scale. The fix is fragile: if a future contributor changes CONE_LENGTH_KM or "optimizes" by collapsing the unit-scale step, the wireframe will silently disappear. | AC2 | Dev's test pins the current value but not the pattern's robustness. The native-scale anti-pattern (the pre-fix bug shape) was not regression-tested. | New: `QA gap 1 — EdgesGeometry float-precision robustness` (4 tests: unit-scale baseline; native CONE_LENGTH_KM constant pinned; native-scale anti-pattern documented as informational regression sentinel; attach() integration confirms EdgesGeometry positions > 0 + mesh.scale = CONE_LENGTH_KM uniformly) |
| **AC1 edge case: `lod.getCurrentLevel() === -1`** — Three.js returns -1 before the first renderer.render() selects a level (and in headless test harnesses). The BoresightRenderer's resolveScanPlatform falls back to `handle.group.getObjectByName('SCAN_PLATFORM')` when `level < 0`, but no dev test pins this. | AC1 | Dev's tests stub `getCurrentLevel` to a valid integer (0, 1, 2). The boot-time / no-render-yet -1 case was not exercised. | New: `QA gap 2 — AC1 LOD-aware resolution edge case` (2 tests: -1 falls back to handle.group walk + cone is parented; -1 → 0 transition re-resolves correctly) |
| **AC3 single-instance contract: no LineSegments leak across multiple consecutive LOD swaps** — dev's test exercises ONE LOD swap (level 2 → 0). A future regression to the maybeReparent path (forgetting to `remove()` from the old parent) might not surface until multiple consecutive swaps. | AC3 | Dev's test covers a single swap; multi-swap regression sentinel is missing. | New: `QA gap 3 — AC3 single-instance contract across multiple LOD swaps` (2 tests: 4 consecutive swaps preserve total LineSegments count = 2; mesh ID stays stable across the same swap sequence) |
| **AC4 cruise-cone rendering: cone is independent of attitude provenance** — dev's integration test uses a fixture ET inside the V1 bus CK window. AC4 specifically calls for the cone to render at cruise ET (synthesized regime). | AC4 | Dev's integration test exercises only the CK regime. The "cone STILL renders at cruise ET" clause is untested at the unit/integration tier. | New: `QA gap 4 — AC4 cruise-cone rendering` (2 tests: attach() succeeds with no AttitudeService coupling; cone defaults to visible + opacity strictly between 0 and 1) |
| **AC6 non-axis-aligned rotation invariant** — dev's integration test rotates the platform 90° about +Y. A non-axis-aligned quaternion (Euler 30°/45°/60°) exercises the full quaternion → matrix path with no fortunate float-cancellation. | AC6 | Y-axis-only rotation is a special case where many rotation components are exactly 0. A regression in the matrixWorld composition path might not surface. | New: `QA gap 5 — AC6 non-axis-aligned rotation invariant` (2 tests: Euler (30°, 45°, 60°) rotation matches expected within 1e-12; cone world +Z magnitude stays at 1.0 under arbitrary platform rotation) |
| **ADR-0028 MADR section completeness** — per Rule 6, ADR violations are HIGH-severity. The ADR file must have all canonical MADR sections so future contributors can read the decision rationale. | AC5 | Dev verified the ADR is INDEXED but not the section structure. A future ADR-0028 amendment that drops a section would silently ship. | New: `QA gap 6 — ADR-0028 MADR section completeness` (4 tests: file exists; all 5 MADR sections present; semantic content includes NA + WA + half-angle references; Status is Accepted) |
| **ADR-0028 indexing** — dev re-ran `python scripts/adr-index.py` and verified the row was added. The QA gap pins this in CI: a future contributor who forgets to regenerate the README will be caught by this test. | AC5 | Dev's verification was a one-shot manual check; no CI-discoverable test pins the indexing state. | New: `QA gap 7 — ADR-0028 indexed in docs/adr/README.md` (2 tests: README contains a `\| 0028 \|` row pointing to the v11.md filename; README does NOT reference the rejected v1.1.md filename — pins the dev's note 4 finding that `scripts/adr-index.py` rejects dots in slugs) |
| **AC8 __voyagerDebug.boresightRenderer surface contract** — mirrors qa-3-2 / qa-3-3 / qa-3-4 pattern. The lead-driven MCP probes evaluate the published surface; if a future refactor tree-shakes the publication or breaks the spread-preserve invariant, the probes silently degrade. | AC8 | Dev's tests bypass main.ts and construct the renderer directly. The published-surface contract + tick ordering inside engine.onFrame is an integration-tier invariant. | New: `QA gap 8 — AC8 __voyagerDebug.boresightRenderer surface contract` (3 tests: source-grep main.ts for import + construction + DEV-gated publication + spread-preserve + attach() in then-callback; source-grep verifies `boresightRenderer.tick(...)` runs AFTER `attitudeApplier.tick(...)`; constructed instance has callable attach/tick/dispose) |
| **dispose() idempotency** — a future engine teardown might call dispose() twice (e.g., during hot-reload). The second call must be a no-op (no throw, no double-dispose of already-disposed geometry). | AC3 | Dev's dispose() test runs dispose ONCE. Double-dispose was not exercised. | New: `QA gap 9 — dispose() idempotency` (2 tests: double dispose() does not throw + does not call geometry.dispose() twice; re-attach after dispose() reconstructs cones with new instance IDs) |

## Generated Tests

### Web-side (vitest)

| File | Test block | AC | Discoverability |
|---|---|---|---|
| `web/tests/boresight-renderer-qa-gaps.test.ts` | `QA gap 1 — EdgesGeometry float-precision robustness across CONE_LENGTH_KM scales` (4 tests) | AC2 | Default Vitest collection (no markers, no `.skip`); `@vitest-environment happy-dom` directive matches the dev's other QA-gap files |
| `web/tests/boresight-renderer-qa-gaps.test.ts` | `QA gap 2 — AC1 LOD-aware resolution edge case: getCurrentLevel === -1` (2 tests) | AC1 | Default collection |
| `web/tests/boresight-renderer-qa-gaps.test.ts` | `QA gap 3 — AC3 single-instance contract: no LineSegments leak across multiple LOD swaps` (2 tests) | AC3 | Default collection |
| `web/tests/boresight-renderer-qa-gaps.test.ts` | `QA gap 4 — AC4 cruise-cone rendering: cone is present at cruise ET (synthesized regime)` (2 tests) | AC4 | Default collection |
| `web/tests/boresight-renderer-qa-gaps.test.ts` | `QA gap 5 — AC6 non-axis-aligned rotation invariant (defense-in-depth)` (2 tests) | AC6 | Default collection |
| `web/tests/boresight-renderer-qa-gaps.test.ts` | `QA gap 6 — ADR-0028 MADR section completeness` (4 tests) | AC5 | Default collection (filesystem reads via node:fs; happy-dom supports) |
| `web/tests/boresight-renderer-qa-gaps.test.ts` | `QA gap 7 — ADR-0028 indexed in docs/adr/README.md` (2 tests) | AC5 | Default collection |
| `web/tests/boresight-renderer-qa-gaps.test.ts` | `QA gap 8 — __voyagerDebug.boresightRenderer surface contract (main.ts source-grep)` (3 tests) | AC8 | Default collection (source-grep uses node:fs) |
| `web/tests/boresight-renderer-qa-gaps.test.ts` | `QA gap 9 — dispose() idempotency (defends against double-teardown)` (2 tests) | AC3 | Default collection |

**Total: 23 new tests in 1 new file. All discovered by `cd web && npx vitest run` with no special markers.**

## Coverage

- **AC1 (Wireframe cone parented to SCAN_PLATFORM, +Z axis along boresight):** Dev's 5 unit tests cover single-LOD, multi-LOD, idempotency, malformed-GLB, and the +Z axis invariant. **+2 QA tests** for the `getCurrentLevel === -1` edge case and the -1 → 0 transition. Lead-driven MCP probes 1, 2, 3 verify the published surface + parenting at runtime.
- **AC2 (Geometry: half-angle 0.21°, length tuned for cruise + encounter scale):** Dev's 5 unit tests cover geometry params, LineSegments wrapping, material opacity/transparent, and CSS var resolution. **+4 QA tests** for the EdgesGeometry float-precision robustness across scales (the load-bearing dev fix). Lead-driven MCP probe 2 verifies the runtime mesh scale + EdgesGeometry positions count.
- **AC3 (Single-instance per spacecraft — memory hygiene):** Dev's 4 unit tests pin instance identity across one LOD swap + zero ConeGeometry constructions during ticks. **+4 QA tests** for the no-leak invariant across multiple consecutive LOD swaps and for dispose() idempotency. Lead-driven MCP probe 5 verifies the 2-cones-total contract at runtime.
- **AC4 (Smoke evidence: V1 Jupiter encounter + cruise-period fixed cone):** **+2 QA tests** for the cruise-cone resilience (independent of attitude provenance; visible + opacity strictly between 0 and 1). Lead-driven MCP probes 2, 3, 4, 6 are the binding visual smoke (the visual register can only be confirmed against a real renderer).
- **AC5 (Wide-angle camera deferral ADR):** Dev authored ADR-0028 + ran the indexer. **+6 QA tests** pinning ADR-0028 MADR section completeness, semantic content sanity, indexing state, and the indexer-incompatible-filename sentinel (defends against a future rename to v1.1.md).
- **AC6 (Integration AC: BoresightRenderer ↔ SpacecraftModels ↔ AttitudeApplier):** Dev's 6 integration tests cover the full boot stack: parenting via `cone.parent === platform`, matrixWorld changes under applier writes, 90° Y-axis rotation invariant within 1e-12, 100-tick zero-allocation, single-ChunkLoader contract, and LOD-swap re-parenting. **+2 QA tests** for the non-axis-aligned (Euler 30°/45°/60°) rotation invariant.
- **AC7 (Test sweep green; no regressions):** Verified — `cd web && npm test -- --run` passes at 2255 pass (+23 from 2232 dev baseline); typecheck clean; lint baseline preserved.
- **AC8 (Lead-driven Chrome DevTools MCP smoke):** Probe plan authored above (7 probes covering boot publication, cone parenting at CK ET, visual register, cruise-ET resilience, single-instance contract, per-frame articulation tracking, and console-clean). **+3 QA tests** pin the AC8-substrate `__voyagerDebug.boresightRenderer` surface and the `tick()` ordering inside `engine.onFrame` so a regression breaks at the QA tier before reaching the lead.

## Discoverability check (per skill `on_complete` hook)

All 23 new tests run in the default suite. Verified:

- `web/tests/boresight-renderer-qa-gaps.test.ts` — discovered by `cd web && npx vitest run` (default Vitest glob picks up `*.test.ts` under both `src/` and `tests/`; no special markers; no `.skip`; no `it.skip` / `describe.skip`).
- The `@vitest-environment happy-dom` directive at the top of the file matches the pattern in `web/tests/attitude-applier-qa-gaps.test.ts` and other QA-gap test files; happy-dom is configured via the file directive.
- No tags (`@slow`, `@flaky`, etc.) that would exclude from default run.

Confirmation runs (from this QA session):
- `cd web && npx vitest run tests/boresight-renderer-qa-gaps.test.ts` → **1 file, 23 tests passed** in 1.67s.
- `cd web && npx vitest run` → **124 test files, 2255 tests passed, 1 skipped** in 40.45s (+23 net new from 2232 baseline). 0 failures.
- `cd web && npx tsc --noEmit` → clean (typecheck preserved).
- `cd web && npx eslint tests/boresight-renderer-qa-gaps.test.ts` → clean (no new lint warnings).

## Voyager skill-rules compliance summary

- **Rule 1 (Integration ACs):** Verified — AC6 IS the integration AC for Story 3.5 (BoresightRenderer ↔ SpacecraftModels ↔ AttitudeApplier). Dev's `boresight-renderer-integration.test.ts` honours it; QA gap 5 (non-axis-aligned rotation) reinforces the integration contract at unit tier.
- **Rule 3 (per-story smoke):** **APPLIED** — Story 3.5 touches `web/src/main.ts` + introduces `web/src/render/boresight-renderer.ts` (visible scene-graph geometry). MCP smoke plan authored above; lead executes per Rule 7.
- **Rule 4 (structured completion):** Closing summary at the bottom of this QA agent's return message.
- **Rule 5 (NFR tripwire response):** Not triggered by QA work. Dev surfaced no tripwires.
- **Rule 6 (ADR violations are HIGH):** No ADR violations introduced. The renderer honours ADR-0008 (Three.js native primitives — ConeGeometry, EdgesGeometry, LineSegments, LineBasicMaterial; no custom shader), ADR-0015 (constructor-DI'd from main.ts; no global), ADR-0026 (TS strict, zero `any`). ADR-0028 (Story 3.5's authoring ADR) is fully verified by QA gaps 6 + 7 (MADR completeness + indexing).
- **Rule 7 (sub-agent tool inventory is harness-inherited):** Honoured — MCP probes are placed on the lead (Layer 1 of ADR-0010), not in this QA agent's execution. Probe plan is fully scripted so the lead can execute without re-deriving.
- **Rule 8 (Chrome DevTools MCP is the canonical browser-smoke driver):** Honoured — no initScript shim referenced. Post-Story-1.16 brotli-dec-wasm handles the browser brotli path.
- **Rule 9 (ADR-0025 APG primitives are extracted):** Not applicable — Story 3.5 introduces no APG-keyboard-handling components.

## Notes for the lead

- **Dev self-caught a load-bearing AC2 defect (EdgesGeometry float-precision).** The initial implementation built the ConeGeometry at native km scale (radius ~3.7e-6 km), causing EdgesGeometry's threshold pass to drop every face-to-face edge. The fix builds at unit scale and applies CONE_LENGTH_KM via mesh.scale. QA gap 1 reinforces by pinning the unit-scale baseline + documenting the native-scale anti-pattern as a regression sentinel.
- **Dev's note 4 (ADR filename) is pinned by QA gap 7.** If a future contributor renames `0028-narrow-angle-only-wide-angle-deferred-v11.md` → `0028-...-v1.1.md`, the indexer silently skips it. QA gap 7's negative assertion (`expect(readmeContent).not.toMatch(/v1\.1\.md/)`) defends against this.
- **Probe 6 (cone tracks platform) is the visible counterpart to probe 3 of Story 3.4.** Story 3.4's probe 3 verified the SCAN_PLATFORM.quaternion CHANGES per frame; Story 3.5's probe 6 verifies the cone's world +Z direction inherits that change. Visual diff (cone tip pointing direction) should be perceptible across the 5 samples.
- **AC4 cruise-cone rendering** is the cross-story gap that Story 3.5 closes from Story 3.4's per-frame baseline. The QA gap 4 unit tests assert the BoresightRenderer is independent of AttitudeService; the lead's MCP probe 4 confirms the visual register at runtime.

## Next Steps

- **Lead:** Execute the AC8 MCP smoke plan above against `http://127.0.0.1:5173/` (start dev server with `cd web && npm run dev`). Save evidence to `_bmad-output/implementation-artifacts/3-5-smoke-evidence/`. Hand off to code review (`bmad-code-review` skill) after smoke evidence is captured.
- **Code review (cr-3-5):** Cross-check each AC against ADR registry per Rule 6. Particular attention to: ADR-0008 (Three.js native primitives — verify no custom shader or non-native geometry); ADR-0015 (no global store — verify BoresightRenderer is constructor-DI'd from main.ts and not registered to a singleton); ADR-0026 (zero `any` casts in renderer source — particularly around the `__setLevelForTest` test hook seam); ADR-0028 (the new wide-angle deferral ADR — verify it stays Accepted and is not amended without re-running the indexer).
- **Story 3.6+ (downstream):** Future visible-geometry stories that extend the BoresightRenderer (e.g., a wide-angle cone in v1.1 per ADR-0028's reversal migration story) should reuse the unit-scale-then-mesh-scale pattern. QA gap 1's regression sentinel will catch any deviation.

## Tests Added
- C:/git/Voyager/web/tests/boresight-renderer-qa-gaps.test.ts

## Decisions
- Targeted nine cross-cutting QA gaps (EdgesGeometry float-precision robustness across scales, AC1 `getCurrentLevel === -1` edge case + transition, AC3 multi-swap no-leak invariant + mesh-ID stability, AC4 cruise-cone provenance-independence + visibility defense, AC6 non-axis-aligned rotation invariant via Euler 30/45/60, ADR-0028 MADR completeness + semantic content + status, ADR-0028 indexing + indexer-incompatible-filename sentinel, AC8 `__voyagerDebug.boresightRenderer` surface contract + onFrame ordering source-grep, dispose() idempotency + re-attach lifecycle) rather than re-testing dev's covered paths.
- Probe 4 (cruise-cone) navigates to 1995-01-01 AFTER probe 3's 1979 Jupiter scrub. The clockManager state from probe 3 is reset by the navigate. Lead can run probes 1-7 strictly in sequence or batch probes 2/3 + probes 4/5 + probe 6 + probe 7 in three navigation groups.

## Issues Encountered
- The native-scale EdgesGeometry anti-pattern test (QA gap 1's regression sentinel) intentionally does NOT assert `positions.count === 0` because the exact float-precision threshold is Three.js-version-dependent. Instead, the test documents the pre-fix bug shape and asserts that EdgesGeometry constructs without throwing — the load-bearing positive assertion lives in the adjacent unit-scale test (`positions.count > 0`).
