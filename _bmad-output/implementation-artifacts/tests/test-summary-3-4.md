# Test Automation Summary — Story 3.4 (Apply Attitude Per Frame to Both Spacecraft)

**QA agent:** qa-3-4 (Opus 4.7) under `/epic-cycle 3`
**Story file:** `_bmad-output/implementation-artifacts/3-4-apply-attitude-per-frame-to-both-spacecraft-bus-scan-platform.md`
**Story status going in:** review (dev-3-4 committed Tasks T1–T4; T5 lead-driven MCP smoke pending)
**Baseline going in:** web vitest 2197 pass / 1 skipped / 120 files; typecheck clean; lint baseline preserved (4 pre-existing warnings)
**Baseline going out:** web vitest **2210 pass** / 1 skipped / 121 files (+13 net new QA gap tests in `web/tests/attitude-applier-qa-gaps.test.ts`); typecheck clean; lint baseline preserved

## Chrome DevTools MCP smoke stage (Rule 3 + Rule 8 — AC9)

Story 3.4 touches `web/src/main.ts` (engine.onFrame wiring + `__voyagerDebug.attitudeApplier` publication) and introduces `web/src/render/attitude-applier.ts` (the per-frame articulation driver — user-facing surface). Per voyager-skill-rules.md Rule 3, browser-MCP smoke is the per-story exit criterion when web/src/ is touched. Per Rule 8, no initScript shim is needed (post-Story-1.16 Chrome-for-Testing 148 loads Voyager via brotli-dec-wasm).

Per ADR-0010 Layer 1 and Rule 7, the smoke is executed by the **lead** (qa-3-4 authors the plan; lead runs the probes). The lead-driven probe plan below is authored to be one-shot executable against the local dev server on `http://127.0.0.1:5173/`.

### Pre-flight checklist

1. **toktx + LFS prerequisites met** (carried forward from Story 3.3 path A). If the lead's local environment is on path B (no LOD GLBs on disk), probes 1, 4, and 7 still run but probes 2, 3, 5, and 6 are degraded — see per-probe notes.
2. **Dev server up.** `cd web && npm run dev` running on `127.0.0.1:5173`.
3. **Evidence directory exists.** `mkdir -p _bmad-output/implementation-artifacts/3-4-smoke-evidence/`.
4. **Story 3.3 evidence dir intact.** Probes 4 (CK encounter) and 5 (cruise rest) diff against `_bmad-output/implementation-artifacts/3-3-smoke-evidence/probe4-attitude-applied-cruise.png` as the "before" baseline — Story 3.3 manually applied attitude via the dev surface; Story 3.4 must reproduce that pose automatically via the per-frame applier.

### Probe 1 — Boot + `__voyagerDebug.attitudeApplier` publication (AC9 substrate, AC1)

**Goal:** Confirm the boot path constructs AttitudeApplier and publishes `__voyagerDebug.attitudeApplier` under `import.meta.env.DEV`, coexisting with `attitudeService` and `spacecraftModels` from earlier stories.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  ({
    voyagerDebugExists: typeof window.__voyagerDebug !== 'undefined',
    applierExists: typeof window.__voyagerDebug?.attitudeApplier !== 'undefined',
    applierTickIsFunction: typeof window.__voyagerDebug?.attitudeApplier?.tick === 'function',
    applierTickArity: window.__voyagerDebug?.attitudeApplier?.tick?.length ?? null,
    attitudeServiceCoexists: typeof window.__voyagerDebug?.attitudeService !== 'undefined',
    spacecraftModelsCoexists: typeof window.__voyagerDebug?.spacecraftModels !== 'undefined',
  })
`
```

**Asserted observations:**
- `voyagerDebugExists === true`
- `applierExists === true`
- `applierTickIsFunction === true`
- `applierTickArity === 3` (et, attitudeService, spacecraftModels)
- `attitudeServiceCoexists === true` (Story 3.2 surface preserved)
- `spacecraftModelsCoexists === true` (Story 3.3 surface preserved — the spread-preserve invariant)

**Failure modes addressed:**
- Tree-shaking strips the applier publication (would show `applierExists === false`).
- Spread regression (`__voyagerDebug = { attitudeApplier }` overwrites the namespace) — would show `attitudeServiceCoexists === false` and/or `spacecraftModelsCoexists === false`.
- AttitudeApplier constructed too late / inside a then-callback that never resolves — would show `applierExists === false`.
- Method rename without updating this probe plan.

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-4-smoke-evidence/probe1-boot.png
```

### Probe 2 — V1 Jupiter CK attitude applied per frame (AC2, AC4, AC8)

**Goal:** Navigate to ET inside V1's Jupiter CK coverage window. Confirm the BUS and SCAN_PLATFORM Object3D quaternions are NOT identity (i.e., attitude has been applied per frame) and match the AttitudeService's current outputs within a tight tolerance.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const dbg = window.__voyagerDebug;
    if (!dbg?.attitudeApplier || !dbg?.attitudeService || !dbg?.spacecraftModels || !dbg?.clockManager) {
      return { ok: false, reason: 'missing debug surface' };
    }

    // Drain the LOD load + attitude chunk load.
    let attempts = 0;
    while ((!dbg.spacecraftModels.isLoaded) && attempts < 60) {
      await new Promise((r) => setTimeout(r, 100));
      attempts += 1;
    }
    if (!dbg.spacecraftModels.isLoaded) return { ok: false, reason: 'LOD chain not loaded after 6s' };

    // Let the engine tick a few frames so the applier reads through.
    await new Promise((r) => setTimeout(r, 500));

    const et = dbg.clockManager.simTimeEt;
    const v1 = dbg.spacecraftModels.getHandle('voyager-1');
    const bus = v1.group.getObjectByName('BUS');
    const platform = v1.group.getObjectByName('SCAN_PLATFORM');
    if (!bus || !platform) return { ok: false, reason: 'named hierarchy missing' };

    // AttitudeService reference values at the same ET.
    const refBus = dbg.attitudeService.getBusQuat(-31, et);
    const refPlatform = dbg.attitudeService.getPlatformQuat(-31, et);
    const busProv = dbg.attitudeService.getBusProvenance(-31, et);
    const platformProv = dbg.attitudeService.getPlatformProvenance(-31, et);
    if (!refBus || !refPlatform) return { ok: false, reason: 'attitude null at CK ET', et, busProv, platformProv };

    const isIdentity = (q) => Math.abs(q.x) < 1e-9 && Math.abs(q.y) < 1e-9 && Math.abs(q.z) < 1e-9 && Math.abs(q.w - 1.0) < 1e-9;
    const delta = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z), Math.abs(a.w - b.w));

    return {
      ok: true,
      et,
      busProv,
      platformProv,
      busIsIdentity: isIdentity(bus.quaternion),
      platformIsIdentity: isIdentity(platform.quaternion),
      busDelta: delta(bus.quaternion, refBus),
      platformDelta: delta(platform.quaternion, refPlatform),
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `busProv === 'ck'` (1979-03-05 sits inside the V1 bus CK coverage window)
- `platformProv === 'ck'` (V1 platform CK is the load-bearing scan-platform articulation regime)
- `busIsIdentity === false` (the bus has been articulated away from default GLB pose)
- `platformIsIdentity === false` (the scan platform has been articulated)
- `busDelta < 1e-6` (applier's BUS quaternion matches AttitudeService — same regime, same ET → same value modulo the inter-frame gap; tolerance accounts for the multiplier of frames between the AttitudeService query and the bus.quaternion read)
- `platformDelta < 1e-6`

**Failure modes addressed:**
- Applier never runs (`engine.onFrame` registration drops or `attitudeApplier.tick` is never called) — would show `busIsIdentity === true && platformIsIdentity === true`.
- Applier writes to the wrong subtree (the AC5 dev-caught bug regressed) — bus would show as identity OR a stale prior-frame quaternion.
- AttitudeService → Applier wire-up broken (e.g., applier reads `getBusQuat` with wrong NAIF ID) — busDelta would be wildly out of tolerance.

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-4-smoke-evidence/probe2-v1-jupiter-ck-applied.png
```

### Probe 3 — V1 Jupiter SCAN_PLATFORM rotates over simulated time (AC4 articulation)

**Goal:** Scrub time at 1× through ~5 simulated seconds inside the V1 Jupiter CK window and capture the SCAN_PLATFORM quaternion at 5 sample points 1 second apart. Verify the quaternion CHANGES (the platform is articulating per the CK data, not stuck at a single attitude).

```js
// (still on http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z from probe 2)

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const dbg = window.__voyagerDebug;
    const v1 = dbg.spacecraftModels.getHandle('voyager-1');
    const samples = [];

    // Set the clock to 1× (real-time). The default at chapter URLs is
    // often higher; lock it to 1× so 1 second = 1 simulated second.
    dbg.clockManager.setMultiplier(1);

    for (let i = 0; i < 5; i += 1) {
      const platform = v1.group.getObjectByName('SCAN_PLATFORM');
      samples.push({
        et: dbg.clockManager.simTimeEt,
        x: platform.quaternion.x,
        y: platform.quaternion.y,
        z: platform.quaternion.z,
        w: platform.quaternion.w,
      });
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Compute max pairwise delta across the 5 samples — non-zero means
    // the platform is articulating over time.
    let maxDelta = 0;
    for (let i = 0; i < samples.length - 1; i += 1) {
      const a = samples[i];
      const b = samples[i + 1];
      const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z), Math.abs(a.w - b.w));
      maxDelta = Math.max(maxDelta, d);
    }

    return { samples, maxDelta };
  })()
`
```

**Asserted observations:**
- `samples.length === 5`
- All five `et` values are distinct and monotonically increasing.
- `maxDelta > 1e-6` (the platform is articulating — not stuck).

**Failure modes addressed:**
- Applier returns the same value every frame (stale or cached output) — would show `maxDelta === 0`.
- Time doesn't advance because the engine tick isn't running — would show all five `et` values identical.
- AttitudeService SLERP is broken at the inter-knot path (returns the first knot for every query) — would show `maxDelta === 0`.

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-4-smoke-evidence/probe3-platform-articulating.png
```

### Probe 4 — Cruise ET synthesized attitude (AC6, AC8)

**Goal:** Navigate to a deep-cruise ET (1995-01-01, outside any CK window). Confirm the AttitudeApplier writes the synthesized BUS quaternion + identity-relative SCAN_PLATFORM quaternion, and that the synthesized provenance is reported.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1995-01-01T00:00:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const dbg = window.__voyagerDebug;
    if (!dbg?.attitudeApplier || !dbg?.spacecraftModels?.isLoaded) {
      // Brief drain.
      let attempts = 0;
      while (!dbg.spacecraftModels?.isLoaded && attempts < 40) {
        await new Promise((r) => setTimeout(r, 100));
        attempts += 1;
      }
    }
    await new Promise((r) => setTimeout(r, 500));

    const et = dbg.clockManager.simTimeEt;
    const v1 = dbg.spacecraftModels.getHandle('voyager-1');
    const bus = v1.group.getObjectByName('BUS');
    const platform = v1.group.getObjectByName('SCAN_PLATFORM');
    if (!bus || !platform) return { ok: false, reason: 'named hierarchy missing' };

    const busProv = dbg.attitudeService.getBusProvenance(-31, et);
    const platformProv = dbg.attitudeService.getPlatformProvenance(-31, et);

    const busNorm = Math.hypot(bus.quaternion.x, bus.quaternion.y, bus.quaternion.z, bus.quaternion.w);
    const platformNorm = Math.hypot(platform.quaternion.x, platform.quaternion.y, platform.quaternion.z, platform.quaternion.w);

    // Per Story 3.2 § Completion Note 5: synthesized platform = bus_quat · identity = bus_quat.
    // So bus.quaternion and platform.quaternion should be component-wise equal in cruise.
    const platformMatchesBus = Math.max(
      Math.abs(bus.quaternion.x - platform.quaternion.x),
      Math.abs(bus.quaternion.y - platform.quaternion.y),
      Math.abs(bus.quaternion.z - platform.quaternion.z),
      Math.abs(bus.quaternion.w - platform.quaternion.w),
    ) < 1e-9;

    return {
      ok: true,
      et,
      busProv,
      platformProv,
      busUnit: Math.abs(busNorm - 1.0) < 1e-10,
      platformUnit: Math.abs(platformNorm - 1.0) < 1e-10,
      platformMatchesBus,
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `busProv === 'synthesized'` (1995-01-01 is well outside any encounter window)
- `platformProv === 'synthesized'`
- `busUnit === true` (the synthesized HGA-pointing quaternion is unit-length)
- `platformUnit === true`
- `platformMatchesBus === true` (cruise rest pose — platform inherits bus orientation; no platform-relative articulation)

**Failure modes addressed:**
- Synthesized path broken (e.g., EphemerisService returns null at cruise ET) — `busUnit === false` because the quaternion is identity/zero.
- Platform regime divergence: the platform quaternion no longer equals bus in cruise (would indicate `PLATFORM_REST_RELATIVE_TO_BUS` regressed away from identity).
- Applier writes 0,0,0,0 instead of the synthesized output (would show `busUnit === false`).

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-4-smoke-evidence/probe4-cruise-synthesized.png
```

### Probe 5 — Cross-spacecraft asymmetry: V1 CK while V2 cruise-synthesized (AC2, AC4)

**Goal:** At the V1 Jupiter encounter ET, V1 has CK coverage but V2 does NOT (V2 is in cruise between Jupiter and Saturn). Both spacecraft must show valid (unit-length, non-identity) quaternions but from different regimes. This probe verifies cross-spacecraft asymmetric provenance is handled correctly by the applier — neither spacecraft is stuck at identity.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z"

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
    if (!v1.group.visible) return { ok: false, reason: 'V1 not visible at ET', et };

    const v1Bus = v1.group.getObjectByName('BUS').quaternion;
    const v2Bus = v2.group.getObjectByName('BUS')?.quaternion;
    const v1BusProv = dbg.attitudeService.getBusProvenance(-31, et);
    const v2BusProv = dbg.attitudeService.getBusProvenance(-32, et);

    const isIdentity = (q) => q && Math.abs(q.x) < 1e-9 && Math.abs(q.y) < 1e-9 && Math.abs(q.z) < 1e-9 && Math.abs(q.w - 1.0) < 1e-9;
    const norm = (q) => q ? Math.hypot(q.x, q.y, q.z, q.w) : 0;

    return {
      ok: true,
      et,
      v1BusProv,
      v2BusProv,
      v1Visible: v1.group.visible,
      v2Visible: v2.group.visible,
      v1IsIdentity: isIdentity(v1Bus),
      v2IsIdentity: isIdentity(v2Bus),
      v1Unit: Math.abs(norm(v1Bus) - 1.0) < 1e-9,
      v2Unit: Math.abs(norm(v2Bus) - 1.0) < 1e-9,
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `v1Visible === true && v2Visible === true` (both spacecraft past launch at 1979-03-05)
- `v1BusProv === 'ck'`
- `v2BusProv === 'synthesized'` (V2 is in cruise at this ET — Jupiter is in V2's future)
- `v1IsIdentity === false && v2IsIdentity === false` (both have valid articulation)
- `v1Unit === true && v2Unit === true`

**Failure modes addressed:**
- Cross-spacecraft provenance mixup (e.g., V2's bus quaternion accidentally pulled from V1's CK) — would show `v2BusProv === 'ck'` incorrectly.
- One spacecraft's applier path fails silently (e.g., V2 stuck at identity because the synthesized path was never triggered) — `v2IsIdentity === true`.
- V2's NAIF ID is wrong in attitude-applier.ts (e.g., -32 → -33) — would show `v2Unit === false` (zero quaternion from the AttitudeService).

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-4-smoke-evidence/probe5-cross-spacecraft-asymmetry.png
```

### Probe 6 — CK ↔ synthesized boundary discipline (AC7)

**Goal:** Scrub from a synthesized-regime ET into a CK-regime ET across the V1 Jupiter window boundary. Verify the BUS quaternion at the boundary instant matches CK; the BUS quaternion at boundary − 1s matches synthesized; the transition is a STEP function (no smoothing), and both adjacent values are valid (unit-length).

```js
// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const dbg = window.__voyagerDebug;
    // The V1 Jupiter CK window opens approximately at closest_approach - 2 days.
    // The exact ET boundary is documented in bake/inventory/voyager-1.json
    // (CK file timeRangeEt[0]); the AttitudeService.getBusProvenance step
    // function fires at that boundary. We exercise the step by scrubbing
    // from outside to inside.

    // First: locate the boundary by binary search on getBusProvenance.
    // Search window: ±5 days around closest_approach (1979-03-05T11:30Z =
    // approximately ET -657_500_000.0).
    const approxCenter = -657_500_000.0;
    const dayInSec = 86400;
    let synthEt = approxCenter - 5 * dayInSec;
    let ckEt = approxCenter;
    if (dbg.attitudeService.getBusProvenance(-31, synthEt) !== 'synthesized') {
      // The synth boundary is further out — abort with explanation.
      return { ok: false, reason: 'manifest boundary not where probe expects', synthEt, synthProvAtSynth: dbg.attitudeService.getBusProvenance(-31, synthEt) };
    }
    // Binary-search for boundary.
    for (let i = 0; i < 30; i += 1) {
      const mid = (synthEt + ckEt) / 2;
      if (dbg.attitudeService.getBusProvenance(-31, mid) === 'ck') ckEt = mid;
      else synthEt = mid;
    }

    // synthEt and ckEt are now within ~1ms of the boundary.
    const synthQuat = dbg.attitudeService.getBusQuat(-31, synthEt);
    const ckQuat = dbg.attitudeService.getBusQuat(-31, ckEt);
    if (!synthQuat || !ckQuat) return { ok: false, reason: 'quat null near boundary', synthEt, ckEt };

    // Step-function evidence: the two adjacent quaternions are NOT
    // equivalent (modulo double-cover sign). dot product < 1 - epsilon
    // confirms the transition is observable.
    const dot = Math.abs(
      synthQuat.x * ckQuat.x + synthQuat.y * ckQuat.y + synthQuat.z * ckQuat.z + synthQuat.w * ckQuat.w,
    );

    return {
      ok: true,
      synthEt,
      ckEt,
      boundaryGap: ckEt - synthEt,
      synthProv: dbg.attitudeService.getBusProvenance(-31, synthEt),
      ckProv: dbg.attitudeService.getBusProvenance(-31, ckEt),
      synthNorm: Math.hypot(synthQuat.x, synthQuat.y, synthQuat.z, synthQuat.w),
      ckNorm: Math.hypot(ckQuat.x, ckQuat.y, ckQuat.z, ckQuat.w),
      // dot near 1 = quaternions equivalent (no step); dot < 0.99 = observable step
      adjacentDot: dot,
      stepObservable: dot < 0.99,
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `synthProv === 'synthesized' && ckProv === 'ck'` (the boundary is captured)
- `boundaryGap < 0.01` (binary search converged to within 10ms — sub-frame precision)
- `synthNorm` and `ckNorm` both ≈ 1.0 (unit quaternions on both sides of the boundary)
- `stepObservable === true` (the two quaternions differ enough to be visually distinguishable — defends the "no smoothing" contract: the applier is NOT interpolating between regimes)

**Failure modes addressed:**
- Smoothing layer accidentally introduced (e.g., a future blend-in at the boundary that this story's spec defers to Story 4.5) — would show `stepObservable === false`.
- One side returns identity (regime path broken on that side) — would show `synthNorm` or `ckNorm` ≠ 1.

**Note:** This probe operates against the AttitudeService directly (no applier-side state) because the boundary is the AttitudeService's responsibility; the applier just writes through. The dev's integration tests already pin the applier's transparent write at adjacent ETs (and QA gap 4 reinforces this at unit tier).

### Probe 7 — Console clean + no per-frame errors (Rule 3, AC8)

**Goal:** No console errors during a 5-second sustained tick at 1×. The Lit dev-mode banner is the only acceptable warning. No `[attitude-applier]` errors, no Three.js mutation errors, no `Cannot read property 'copy' of undefined`-style applier-tier crashes.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// Wait 5 seconds for sustained ticks at the chapter ET (the engine onFrame
// fires at every requestAnimationFrame — ~300 frames at 60 Hz over 5s).
// This is the sustained-playback period; any per-frame regression
// surfaces here.
// mcp__chrome-devtools-mcp__wait_for { time: 5000 }   // or sleep

// mcp__chrome-devtools-mcp__list_console_messages
// filter: "error" (then also "warn" separately)
```

**Asserted observations:**
- Zero `error`-level messages (the AC9 default-allow-list permits the Lit dev-mode banner only).
- Zero `[attitude-applier]` references in any console message.
- Zero `Cannot read property` or `is not a function` exceptions thrown during the 5s tick window.
- `warn`-level messages: only the Lit dev-mode banner. No `[spacecraft-models]` fallback warn (Path A — full LOD chain on disk).

```js
// mcp__chrome-devtools-mcp__list_network_requests
// filter: "manifest|attitude|voyager-lod"
```

**Asserted observations:**
- All bus_attitude + platform_attitude chunk requests return HTTP 200.
- All LOD GLB requests return HTTP 200.
- No 404s for missing CK chunks at the V1 Jupiter window (bake-time CK inventory must include this window).

## Evidence directory layout

After lead executes the probes:

```
_bmad-output/implementation-artifacts/3-4-smoke-evidence/
├── probe1-boot.png
├── probe2-v1-jupiter-ck-applied.png
├── probe3-platform-articulating.png
├── probe4-cruise-synthesized.png
├── probe5-cross-spacecraft-asymmetry.png
├── probe-results.json    # optional — copy of each evaluate_script return value
```

## Coverage gap analysis vs dev's tests

Dev-3-4's 10 unit + 5 integration tests cover the AC2/AC3/AC5/AC8 happy paths deeply, including the load-bearing AC5 LOD-swap re-resolution bug they self-caught. Gaps identified and filled in `web/tests/attitude-applier-qa-gaps.test.ts` (13 new tests, all in the default Vitest collection):

| Gap | AC | Why dev missed it | Resolution |
|---|---|---|---|
| **AC5 LOD-handle transition: non-null → null mid-life** — dev tests cover stay-null and stay-non-null with level swaps; transition between the two regimes is not covered. A recovery path that re-attaches a single-LOD fallback after a load failure (e.g., LOD-load retry succeeds with degraded chain) would leave the cache pointing at a detached subtree. | AC5 | The dev tests partitioned LOD = null vs LOD ≠ null as two separate cases. The transition between them was not exercised because no test removes the LOD instance after construction. | New: `QA gap 1 — AC5 LOD-handle transition: non-null → null mid-life` (1 test: detach the LOD post-tick-1; reattach plain BUS/SCAN_PLATFORM children; verify re-resolution + write to the new subtree) |
| **AC2 cross-spacecraft asymmetry: V1 CK while V2 holds previous** — the dev tests verify each cell of the AttitudeService-returns-null matrix in isolation. The QA brief calls out a specific pattern: V1 has CK (updates) while V2 doesn't (holds). The mixing is the load-bearing visitor experience during V1's Jupiter window when V2 is still in cruise. | AC2 | Dev's null-hold tests use a single fixture and toggle return values uniformly across both spacecraft. The asymmetric case (V1 non-null, V2 null) wasn't explicitly constructed. | New: `QA gap 2 — AC2 cross-spacecraft asymmetry` (2 tests: V1 bus updates / V2 holds; V1 platform holds / V2 platform updates) |
| **AC3 integration-tier zero-allocation: instance identity over many ticks** — the dev unit test asserts `Quaternion.prototype.copy` call counts and identity-after-one-tick. A future regression that replaced `node.quaternion.copy(q)` with `node.quaternion = freshQuat` would pass narrow tests but break Three.js's scene-graph mutation tracking. | AC3 | Dev's integration test asserts call counts but not instance identity persistence at the integration tier. Identity-after-one-tick is the unit-tier guarantee; identity-after-200-ticks is the sustained-playback guarantee (NFR-R5). | New: `QA gap 3a — AC3 instance identity over 200 ticks` + `QA gap 3b — AttitudeService called exactly once per spacecraft per tick` (2 tests) |
| **AC7 boundary discipline: adjacent-ET writes** — dev's integration test exercises CK and synthesized in separate sub-tests; the QA brief calls out "transparent writes at adjacent ETs" as the load-bearing AC7 contract. A future blending layer accidentally introduced at the applier tier would mask the AttitudeService's step function. | AC7 | The dev tests exercise one regime at a time. The transition between regimes (manifest step function) is the AttitudeService's job; verifying the applier transparently writes both values at adjacent ticks is the applier's job — not exercised. | New: `QA gap 4 — AC7 boundary discipline: CK → synthesized step function` (2 tests: regime transition writes through; double-cover sign-flipped quaternions are passed verbatim — no shortest-path adjustment in the applier) |
| **AC5 edge case: `lod.getCurrentLevel() === -1`** — Three.js returns -1 before the first renderer.render() selects a level (and in headless test harnesses). The applier source falls back to `handle.group` when `currentLevel < 0`, but no dev test pins this. | AC5 | Dev's tests stub `getCurrentLevel` to a valid integer (0, 1, 2). The boot-time / no-render-yet -1 case was not exercised. | New: `QA gap 5 — AC5 -1 edge case` (2 tests: -1 falls back to handle.group walk + writes succeed; -1 → 0 transition re-resolves correctly when the first render selects a level) |
| **AC2 visible=true → false → true transition** — dev tests cover permanently-invisible spacecraft. A chunk-load gap mid-playback would flip visibility off then on; the applier's cache must survive the gap. | AC2 | Dev's visible=false test stays invisible. The toggle behaviour wasn't exercised. | New: `QA gap 6 — AC2 visibility toggle preserves cache` (1 test: visible=true → false → true; cache held; no re-resolution on resume) |
| **AC9 `__voyagerDebug.attitudeApplier` surface contract** — mirrors qa-3-2 / qa-3-3 pattern. The lead-driven MCP probes evaluate the published surface; if a future refactor tree-shakes the publication or breaks the spread-preserve invariant, the probes silently degrade. | AC9 | Dev's tests bypass main.ts and construct the applier directly. The published-surface contract is an integration-tier invariant. | New: `QA gap 7 — AC9 __voyagerDebug.attitudeApplier surface contract` (2 tests: source-grep main.ts for DEV-gated publication + spread-preserve + onFrame ordering; constructed instance has callable tick of arity ≥ 3) |
| **Defensive: missing BUS or SCAN_PLATFORM name does not throw** — the applier's `?? null` fallback at attitude-applier.ts:176-179 shields against malformed GLBs; no test pins this behaviour. A future regression that throws on missing names would crash the per-frame loop. | AC2 | Dev's tests assume well-formed fixtures. The malformed-GLB case is a defense-in-depth gap. | New: `QA gap 8 — missing BUS handled gracefully` (1 test: handle.group lacks BUS child; tick doesn't throw; SCAN_PLATFORM write still lands) |

## Generated Tests

### Web-side (vitest)

| File | Test block | AC | Discoverability |
|---|---|---|---|
| `web/tests/attitude-applier-qa-gaps.test.ts` | `QA gap 1 — AC5 LOD-handle transition: non-null → null mid-life` (1 test) | AC5 | Default Vitest collection (no markers, no `.skip`); `@vitest-environment happy-dom` directive matches other QA-gap files |
| `web/tests/attitude-applier-qa-gaps.test.ts` | `QA gap 2 — AC2 cross-spacecraft asymmetry` (2 tests) | AC2 | Default collection |
| `web/tests/attitude-applier-qa-gaps.test.ts` | `QA gap 3 — AC3 integration-tier zero-allocation: instance identity over many ticks` (2 tests) | AC3 | Default collection |
| `web/tests/attitude-applier-qa-gaps.test.ts` | `QA gap 4 — AC7 boundary discipline: adjacent-ET writes across CK ↔ synthesized regime` (2 tests) | AC7 | Default collection |
| `web/tests/attitude-applier-qa-gaps.test.ts` | `QA gap 5 — AC5 edge case: handle.lod.getCurrentLevel() === -1` (2 tests) | AC5 | Default collection |
| `web/tests/attitude-applier-qa-gaps.test.ts` | `QA gap 6 — AC2 visible=true → false → true transition` (1 test) | AC2 | Default collection |
| `web/tests/attitude-applier-qa-gaps.test.ts` | `QA gap 7 — AC9 __voyagerDebug.attitudeApplier surface contract` (2 tests) | AC9 | Default collection (source-grep uses node:fs; happy-dom supports) |
| `web/tests/attitude-applier-qa-gaps.test.ts` | `QA gap 8 — defensive: missing BUS or SCAN_PLATFORM name does not throw` (1 test) | AC2 | Default collection |

**Total: 13 new tests in 1 new file. All discovered by `cd web && npx vitest run` with no special markers.**

## Coverage

- **AC1 (Per-frame attitude application wired into onFrame loop):** Dev's integration test asserts the AC8 contract end-to-end; QA gap 7 reinforces by source-grepping main.ts for the AC1 ordering (spacecraftModels.tick → attitudeApplier.tick → trajectory/celestial ticks).
- **AC2 (Per-frame query → assign to BUS + SCAN_PLATFORM):** Dev's 4 unit tests + 1 integration test cover the happy path and uniform null. **+4 QA tests** for cross-spacecraft asymmetry, visibility toggle, and the missing-name defense.
- **AC3 (Zero per-frame allocation):** Dev's 1 unit test + 1 integration test cover call-count and one-tick identity. **+2 QA tests** for 200-tick instance identity and AttitudeService call-count invariant.
- **AC4 (V1 Jupiter visible articulation):** Lead-driven MCP probe 2 + probe 3 are the binding test (visible articulation cannot be tested headlessly without a real GPU).
- **AC5 (LOD swap re-resolution):** Dev's 2 unit tests + integration test cover the standard swap. **+4 QA tests** for the non-null→null transition, the -1 edge case (with and without subsequent level resolution), and the legacy single-LOD fallback identity.
- **AC6 (Synthesized cruise BUS-Earth tracking):** Dev's integration test pins HGA-Earth-pointing geometry within 1e-12. Lead-driven MCP probe 4 verifies the runtime cruise pose.
- **AC7 (Boundary discipline):** **+2 QA tests** for the CK ↔ synthesized transition + double-cover sign-flipped pass-through. Lead-driven MCP probe 6 verifies the runtime AttitudeService step function across the V1 Jupiter window boundary.
- **AC8 (Integration AC):** Dev's 5 integration tests cover the full boot stack (CK match, synthesized match, platform-equals-bus in cruise, zero-allocation, single-ChunkLoader contract). QA finds no additional gap.
- **AC9 (Lead-driven MCP smoke):** Probe plan authored above (7 probes per AC9's 7-step plan plus an additional cross-spacecraft asymmetry probe). **+2 QA tests** pin the AC9-substrate `__voyagerDebug.attitudeApplier` surface so a regression breaks at the QA tier before reaching the lead.

## Discoverability check (per skill `on_complete` hook)

All 13 new tests run in the default suite. Verified:

- `web/tests/attitude-applier-qa-gaps.test.ts` — discovered by `cd web && npx vitest run` (default Vitest glob picks up `*.test.ts` under both `src/` and `tests/`; no special markers; no `.skip`; no `it.skip`/`describe.skip`).
- The `@vitest-environment happy-dom` directive at the top of the file matches the pattern in `web/tests/attitude-service-qa-gaps.test.ts` and other QA-gap test files; happy-dom is configured via the file directive.
- No tags (`@slow`, `@flaky`, etc.) that would exclude from default run.

Confirmation runs (from this QA session):
- `cd web && npx vitest run tests/attitude-applier-qa-gaps.test.ts` → **1 file, 13 tests passed** in 1.80s.
- `cd web && npx vitest run` → **121 test files, 2210 tests passed, 1 skipped** in 41.99s (+13 net new from 2197 baseline). 0 failures.
- `cd web && npx tsc --noEmit` → clean (typecheck preserved).
- `cd web && npx eslint tests/attitude-applier-qa-gaps.test.ts` → clean (no new lint warnings).

## Voyager skill-rules compliance summary

- **Rule 1 (Integration ACs):** Verified — AC8 IS the Integration AC for Story 3.4 (AttitudeApplier ↔ AttitudeService ↔ SpacecraftModels). Dev's `attitude-applier-integration.test.ts` honours it; QA gap 2 (cross-spacecraft asymmetry) + gap 4 (boundary discipline) reinforce the integration contract at the unit tier.
- **Rule 3 (per-story smoke):** **APPLIED** — Story 3.4 touches `web/src/main.ts` (engine.onFrame wiring + DEV-debug surface) + new `web/src/render/attitude-applier.ts`. MCP smoke plan authored above; lead executes per Rule 7.
- **Rule 4 (structured completion):** Closing summary at the bottom of this QA agent's return message.
- **Rule 5 (NFR tripwire response):** Not triggered by QA work. Dev surfaced NO tripwires; NFR-P2 + NFR-R5 are honoured by the AC3 zero-allocation contract; QA gap 3 adds the 200-tick identity defense.
- **Rule 6 (ADR violations are HIGH):** No ADR violations introduced. The applier honours ADR-0008 (per-frame mutation outside Lit), ADR-0015 (no global store; dependency-injected via main.ts), ADR-0024 (no runtime shortest-path adjustment — verified by QA gap 4's sign-flip pass-through test), ADR-0026 (zero `any` casts).
- **Rule 7 (sub-agent tool inventory is harness-inherited):** Honoured — MCP probes are placed on the lead (Layer 1 of ADR-0010), not in this QA agent's execution. Probe plan is fully scripted so the lead can execute without re-deriving.
- **Rule 8 (Chrome DevTools MCP is the canonical browser-smoke driver):** Honoured — no initScript shim referenced. Post-Story-1.16 brotli-dec-wasm handles the browser brotli path.
- **Rule 9 (ADR-0025 APG primitives are extracted):** Not applicable — Story 3.4 introduces no APG-keyboard-handling components.

## Notes for the lead

- **Dev self-caught a load-bearing AC5 defect.** The initial implementation walked `handle.group` for `getObjectByName('BUS')`, which returns the FIRST depth-first match — wrong subtree when the LOD has multiple levels. The fix resolves against `handle.lod.levels[currentLevel].object` instead. QA gap 1 (non-null → null transition) and QA gap 5 (-1 edge case) exercise adjacent corners of this code path that the dev's fix does not directly cover.
- **Probe 2 + probe 4 + Story 3.3 probe 4 are a triplet.** Story 3.3's probe 4 manually applied attitude via the dev surface; Story 3.4's probe 2 (CK) and probe 4 (cruise) must reproduce that pose AUTOMATICALLY via the per-frame applier. Visual diff between Story 3.3's `probe4-attitude-applied-cruise.png` and Story 3.4's `probe4-cruise-synthesized.png` should be visually identical (modulo any animation/time-of-day frame differences).
- **Probe 6 operates against AttitudeService directly.** The boundary step function is AttitudeService's responsibility; the applier just writes through. QA gap 4 covers the applier-side transparent-write contract at unit tier; probe 6 covers the runtime AttitudeService step. Both are necessary.
- **Probe 3's 1× scrub may show sub-perceptual SCAN_PLATFORM articulation if the V1 Jupiter CK has slow-rate intervals.** If `maxDelta` reads close to but above the 1e-6 threshold, that is still success — the test asserts ANY change, not a minimum magnitude. The CK data itself is the ground truth.

## Next Steps

- **Lead:** Execute the AC9 MCP smoke plan above against `http://127.0.0.1:5173/` (start dev server with `cd web && npm run dev`). Save evidence to `_bmad-output/implementation-artifacts/3-4-smoke-evidence/`. Hand off to code review (`bmad-code-review` skill) after smoke evidence is captured.
- **Code review (cr-3-4):** Cross-check each AC against ADR registry per Rule 6. Particular attention to: ADR-0008 (per-frame mutation outside Lit — applier is plain TS class, no Lit decorators); ADR-0009 (no web workers — `.copy()` runs main-thread); ADR-0015 (no global store — applier is constructor-injected via ManifestLoader.then closure); ADR-0024 (no runtime shortest-path SLERP — verified by QA gap 4); ADR-0026 (zero `any` casts in applier source — verify the SpacecraftHandle.lod field is non-readonly cast pattern from Story 3.3 is preserved).
- **Story 3.5 dev (downstream):** The NA-camera boresight cone parents to SCAN_PLATFORM. Once Story 3.4 applies the platform quaternion per frame, the cone's world orientation derives automatically from scene-graph parenting. Story 3.5 ADDS the cone geometry; it does NOT touch the attitude application. Verify probe 3's articulation evidence is the "before" baseline for Story 3.5's cone-tracks-platform smoke.

## Tests Added
- C:/git/Voyager/web/tests/attitude-applier-qa-gaps.test.ts

## Decisions
- Targeted eight cross-cutting QA gaps (LOD-handle non-null→null transition, cross-spacecraft asymmetry, 200-tick instance identity, CK↔synthesized boundary pass-through, -1 currentLevel edge case + transition, visibility toggle cache preservation, __voyagerDebug surface contract + AC1 ordering source-grep, missing-name defense) rather than re-testing dev's covered paths.
- Probe 6 (boundary discipline) exercises AttitudeService directly because the step function is the service's responsibility; the applier-side transparent-write contract is covered by QA gap 4 at unit tier. Both layers are necessary defense-in-depth.

## Issues Encountered
- The source-grep for the AC1 ordering had to disambiguate between the chapter-director `engine.onFrame((et) => {...})` at main.ts:159 and the spacecraft/attitude/trajectory `engine.onFrame((et) => {...})` at main.ts:409 — used `lastIndexOf('engine.onFrame(')` to scope to the Story 3.4 wire-up.
