# Test Automation Summary — Story 3.2 (AttitudeService SLERP Interpolation and Synthesized HGA Cruise Attitude)

**QA agent:** qa-3-2 (Opus 4.7) under `/epic-cycle 3`
**Story file:** `_bmad-output/implementation-artifacts/3-2-attitudeservice-slerp-interpolation-and-synthesized-hga-cruise-attitude.md`
**Story status going in:** review (dev-3-2 went silent; lead reconstructed from `git status --short` and verified dev's test claim against the test runner)
**Baseline going in:** web vitest 2113 pass / 0 fail / 114 files; typecheck clean; lint baseline preserved (5 pre-existing warnings, 0 new); bake fast 337 pass (unchanged — Story 3.2 is web-only)
**Baseline going out:** web vitest **2136 pass** / 0 fail / 115 files (+23 net new QA gap tests in `web/tests/attitude-service-qa-gaps.test.ts`); typecheck clean; lint baseline preserved

## Chrome DevTools MCP smoke stage (Rule 3 + Rule 8 — AC8)

Story 3.2 touches `web/src/` (5 new files + 4 updated files including `main.ts`), specifically introduces the runtime AttitudeService that subsequent stories' per-frame render loop (Story 3.4), HUD provenance indicator (Story 3.6), and NA-camera boresight (Story 3.5) all consume. Per voyager-skill-rules.md Rule 3, browser-MCP smoke is the per-story exit criterion. Per Rule 8, no initScript shim is needed (post-Story-1.16 Chrome-for-Testing 148 loads Voyager via brotli-dec-wasm).

Per ADR-0010 Layer 1 and Rule 7, the smoke is executed by the **lead** (qa-3-2 authors the plan; lead runs the probes). The lead-driven probe plan below is authored to be one-shot executable against `http://localhost:5173/`.

### Pre-flight

The lead's pre-flight checklist before opening Chrome DevTools MCP:

1. **Dev server is up.** Confirm `cd web && npm run dev` is running on the lead's machine. Default port: `5173`.
2. **Evidence directory exists.** `mkdir -p _bmad-output/implementation-artifacts/3-2-smoke-evidence/` (lead-side bash, separate from this skill's working dir).
3. **Manifest has attitude entries.** Verify by hitting `http://localhost:5173/manifest.json` once and confirming `bodies[*].files[*].kind` contains at least one of `bus_attitude` / `platform_attitude`. (If absent, the bake hasn't run with Story 3.1's CK pipeline; smoke is not actionable until that's resolved.)

### Probe 1 — Boot + debug surface publication (AC1, AC8)

**Goal:** Confirm the boot path constructs AttitudeService and publishes `__voyagerDebug.attitudeService`.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://localhost:5173/"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager"  // any text confirming the SPA has booted; alternately wait_for: "Voyager 1" in the HUD

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  ({
    voyagerDebugExists: typeof window.__voyagerDebug !== 'undefined',
    attitudeServiceExists: typeof window.__voyagerDebug?.attitudeService !== 'undefined',
    hasGetBusQuat: typeof window.__voyagerDebug?.attitudeService?.getBusQuat === 'function',
    hasGetPlatformQuat: typeof window.__voyagerDebug?.attitudeService?.getPlatformQuat === 'function',
    hasGetBusProvenance: typeof window.__voyagerDebug?.attitudeService?.getBusProvenance === 'function',
    hasGetPlatformProvenance: typeof window.__voyagerDebug?.attitudeService?.getPlatformProvenance === 'function',
    hasFindAttitudeFile: typeof window.__voyagerDebug?.attitudeService?.findAttitudeFile === 'function',
  })
`
```

**Asserted observations:**
- `voyagerDebugExists === true`
- `attitudeServiceExists === true`
- All five method existence flags === `true`

**Failure modes addressed:**
- Tree-shaking strips the debug-surface assignment (would show all five as `false`).
- Construction order regression (EphemerisService not yet ready → AttitudeService never constructed).
- Method rename without updating this probe plan.

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-2-smoke-evidence/probe1-boot.png
```

### Probe 2 — V1 Jupiter closest approach: CK provenance + unit quaternion (AC3, AC8)

**Goal:** Confirm the CK SLERP path produces a unit quaternion with provenance `'ck'` at V1's Jupiter closest approach (1979-03-05T12:05:26Z).

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://localhost:5173/?t=1979-03-05T12:05:26Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const svc = window.__voyagerDebug.attitudeService;
    const clock = window.__voyagerDebug.clockManager;
    if (!svc) return { ok: false, reason: 'no AttitudeService' };
    if (!clock) return { ok: false, reason: 'no ClockManager' };

    const et = clock.simTimeEt;
    // Wait one rAF for the bus_attitude chunk to land if it hasn't already.
    await new Promise((r) => requestAnimationFrame(() => r()));
    // Drain any pending chunk-load (AttitudeService kicks off async on the first call).
    svc.getBusQuat(-31, et);
    await new Promise((r) => setTimeout(r, 500));  // generous; brotli + parse + decode

    const q = svc.getBusQuat(-31, et);
    const provenance = svc.getBusProvenance(-31, et);
    if (q === null) {
      return { ok: false, reason: 'still null after 500ms — chunk load slow or missing', et, provenance };
    }
    const norm = Math.hypot(q.x, q.y, q.z, q.w);
    return {
      ok: true,
      et,
      provenance,
      quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
      norm,
      unitWithinTolerance: Math.abs(norm - 1.0) < 1e-10,
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `provenance === 'ck'` (Jupiter closest approach is at the centre of the encounter window — CK coverage)
- `unitWithinTolerance === true` (quaternion is unit-norm within 1e-10)
- All four `quaternion` components are finite numbers

**Failure modes addressed:**
- Chunk load doesn't kick off on the first `getBusQuat` call (silent missing-load bug).
- Quaternion convention permute regression (would produce non-unit quaternion if e.g. only three of four components were filled).
- Provenance computation diverges from the chunk-load (AC5 invariant — provenance is manifest-driven, not loader-driven).

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-2-smoke-evidence/probe2-v1-jupiter-ck.png
```

### Probe 3 — Cruise ET: synthesized provenance + HGA-Earth alignment (AC4, AC8)

**Goal:** Confirm the synthesized HGA-Earth-pointing path produces a unit quaternion with provenance `'synthesized'` outside any CK window, and that the HGA boresight (bus -Z) maps to the spacecraft→Earth direction in world frame.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://localhost:5173/?t=1995-01-01T00:00:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const svc = window.__voyagerDebug.attitudeService;
    const eph = window.__voyagerDebug.ephemerisService;
    const clock = window.__voyagerDebug.clockManager;
    if (!svc || !eph || !clock) return { ok: false, reason: 'missing service surface' };

    const et = clock.simTimeEt;
    // Drain any pending ephemeris chunk-load (needed for the synthesized path
    // since it queries V1 + Earth positions).
    await new Promise((r) => setTimeout(r, 500));

    const q = svc.getBusQuat(-31, et);
    const provenance = svc.getBusProvenance(-31, et);
    if (q === null) {
      return { ok: false, reason: 'null at cruise ET — ephemeris not yet available', et, provenance };
    }

    // HGA boresight in bus frame = (0, 0, -1) per fk-constants.
    // After applying q, the boresight should equal the (V1 → Earth) unit vector.
    const vScPos = eph.getPosition(et, -31);
    const vEarthPos = eph.getPosition(et, 3);
    if (vScPos === null || vEarthPos === null) {
      return { ok: false, reason: 'V1 or Earth position null', et };
    }
    const dx = vEarthPos[0] - vScPos[0];
    const dy = vEarthPos[1] - vScPos[1];
    const dz = vEarthPos[2] - vScPos[2];
    const d = Math.hypot(dx, dy, dz);
    const aim = [dx / d, dy / d, dz / d];

    // Apply q to (0, 0, -1): standard quaternion-vector rotation.
    const v = { x: 0, y: 0, z: -1 };
    // q * v * q⁻¹ for a unit q. We compute the explicit formula:
    // v' = v + 2 q.w (q × v) + 2 (q × (q × v))  where q = (q.x, q.y, q.z) vector part
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const cross1 = {
      x: qy * v.z - qz * v.y,
      y: qz * v.x - qx * v.z,
      z: qx * v.y - qy * v.x,
    };
    const cross2 = {
      x: qy * cross1.z - qz * cross1.y,
      y: qz * cross1.x - qx * cross1.z,
      z: qx * cross1.y - qy * cross1.x,
    };
    const rotated = {
      x: v.x + 2 * qw * cross1.x + 2 * cross2.x,
      y: v.y + 2 * qw * cross1.y + 2 * cross2.y,
      z: v.z + 2 * qw * cross1.z + 2 * cross2.z,
    };

    const norm = Math.hypot(q.x, q.y, q.z, q.w);
    return {
      ok: true,
      et,
      provenance,
      quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
      norm,
      unitWithinTolerance: Math.abs(norm - 1.0) < 1e-10,
      aim,
      boresightInWorld: rotated,
      alignmentError: Math.hypot(rotated.x - aim[0], rotated.y - aim[1], rotated.z - aim[2]),
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `provenance === 'synthesized'` (1995-01-01 is well outside any encounter ±2-day window)
- `unitWithinTolerance === true`
- `alignmentError < 1e-9` (HGA boresight aligns with the (V1 → Earth) direction within float64 epsilon)

**Failure modes addressed:**
- Synthesized path returns null silently (would fail `ok === true`).
- HGA boresight direction sign flip (would surface as `alignmentError ≈ 2` — the boresight pointing AWAY from Earth).
- Secondary-axis Gram-Schmidt degenerates without fallback to world +X (would produce NaN in the quaternion).
- Cross-product chirality regression (would invert the roll about the HGA axis — observable as a flipped solar-panel orientation; not directly checked here but the boresight alignment is the primary contract).

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-2-smoke-evidence/probe3-cruise-synthesized.png
```

### Probe 4 — Cross-spacecraft provenance: V2 at V1-Jupiter ET (AC5)

**Goal:** Confirm V2 at V1's Jupiter closest approach ET returns `'synthesized'` (V2 had no CK coverage there — different mission timeline).

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://localhost:5173/?t=1979-03-05T12:05:26Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const svc = window.__voyagerDebug.attitudeService;
    const clock = window.__voyagerDebug.clockManager;
    if (!svc || !clock) return { ok: false, reason: 'missing service surface' };

    const et = clock.simTimeEt;
    await new Promise((r) => setTimeout(r, 500));

    // V1 should be 'ck' (Jupiter closest approach is in V1's encounter window).
    const v1Prov = svc.getBusProvenance(-31, et);
    // V2 should be 'synthesized' (V2 was not at Jupiter in March 1979).
    const v2Prov = svc.getBusProvenance(-32, et);

    return {
      ok: true,
      et,
      v1Provenance: v1Prov,
      v2Provenance: v2Prov,
      divergent: v1Prov !== v2Prov,
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `v1Provenance === 'ck'`
- `v2Provenance === 'synthesized'`
- `divergent === true`

**Failure modes addressed:**
- AttitudeService allows V2 to see V1's CK coverage (index keying bug — both buses bucketed under the same key without spacecraft discrimination).
- The (spacecraftNaifId, kind) → AttitudeFileIndex map collapses to a single global index.

### Probe 5 — Boundary discipline: provenance flips at encounter file `et_start` (AC5)

**Goal:** Confirm the provenance step function — at `closest_approach - 2 days` exactly, provenance is `'ck'`; one second before, it's `'synthesized'`. (One **second** is used instead of one **nanosecond** because float64 ULP at ~-657e6 seconds is ~1.5e-7 s; a 1 ns step is below distinguishable resolution.)

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://localhost:5173/"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const svc = window.__voyagerDebug.attitudeService;
    if (!svc) return { ok: false, reason: 'no AttitudeService' };

    // V1 Jupiter closest approach: 1979-03-05T12:05:26Z = J2000 ET ≈ -657_172_473.18 s
    // (this is approximate; the real ET comes from the kernels — but the
    // boundary instant we want is closest_approach - 2 days, which is also
    // the et_start of the encounter VTRJ file).
    //
    // Walk the manifest to find V1's bus_attitude file covering this ET range.
    const manifestResp = await fetch('/manifest.json');
    const manifest = await manifestResp.json();
    const v1Body = manifest.bodies.find((b) => b.naifId === -31);
    const v1BusFile = v1Body?.files.find(
      (f) => f.kind === 'bus_attitude' &&
        f.url.toLowerCase().includes('jupiter'),
    );
    if (!v1BusFile) {
      return { ok: false, reason: 'no V1 Jupiter bus_attitude file in manifest' };
    }
    const [etStart, etEnd] = v1BusFile.timeRangeEt;

    // Sample the provenance at: et_start - 1s, et_start, et_start + 1s,
    // et_end - 1s, et_end, et_end + 1s.
    const EPS_S = 1.0;
    const observations = {
      beforeStart: svc.getBusProvenance(-31, etStart - EPS_S),
      atStart: svc.getBusProvenance(-31, etStart),
      insideStart: svc.getBusProvenance(-31, etStart + EPS_S),
      insideEnd: svc.getBusProvenance(-31, etEnd - EPS_S),
      atEnd: svc.getBusProvenance(-31, etEnd),
      afterEnd: svc.getBusProvenance(-31, etEnd + EPS_S),
    };

    return {
      ok: true,
      etStart,
      etEnd,
      observations,
      stepFunctionAtStart:
        observations.beforeStart === 'synthesized' &&
        observations.atStart === 'ck' &&
        observations.insideStart === 'ck',
      stepFunctionAtEnd:
        observations.insideEnd === 'ck' &&
        observations.atEnd === 'ck' &&
        observations.afterEnd === 'synthesized',
    };
  })()
`
```

**Asserted observations:**
- `ok === true`
- `stepFunctionAtStart === true`
- `stepFunctionAtEnd === true`

**Failure modes addressed:**
- Off-by-one (`<` vs `<=`) in the binary search (would produce an asymmetric step function — one boundary lopsided).
- Provenance derived from chunk-cache state instead of manifest (would produce `'synthesized'` at `etStart` if the chunk hasn't loaded — AC5 violation).
- Manifest file range is wider than the body's actual knot ETs (would manifest as `etStart - 1s` returning `'ck'` when the actual `body[0,0]` is later).

### Probe 6 — Console clean (Rule 3)

**Goal:** Confirm no console errors during the boot + probe sequence above.

```js
// mcp__chrome-devtools-mcp__list_console_messages
// filter: "error"
```

**Asserted observations:**
- No console errors apart from the Lit dev-mode banner (`"Lit is in dev mode. Not recommended for production"`).
- No `[attitude]` warnings unless an actual chunk-load failure occurred (the one-time warn pattern from `attitude-service.ts:242` is benign when chunks load eventually).
- No `[chunk-loader]` errors (would indicate a brotli-decompress regression — outside Story 3.2's scope but useful negative-defense signal).

```js
// mcp__chrome-devtools-mcp__list_network_requests
// filter: "manifest|attitude"
```

**Asserted observations:**
- `manifest.json` returned HTTP 200.
- At least one `*bus_attitude*.bin.br` request returned HTTP 200 with `Content-Encoding: br`.
- No 404s for attitude files.

### Probe 7 — Visual regression smoke (optional, recommended)

**Goal:** Confirm the rendered scene at V1's Jupiter closest approach shows the spacecraft mesh oriented (no visible "spinning" or "default-rotated" attitude). Story 3.2 doesn't drive per-frame rendering (that's Story 3.4) — but if the dev surface happens to be wired into a debug HUD before Story 3.4 lands, this probe will catch a regression early.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://localhost:5173/?t=1979-03-05T12:05:26Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-2-smoke-evidence/probe7-v1-jupiter-visual.png
// Note: This is a visual baseline screenshot. Story 3.2 does NOT yet apply
// attitude to the render loop (that's Story 3.4); the spacecraft mesh will
// render in its default GLB orientation. The screenshot is for forward
// reference — Story 3.4's smoke will diff against this baseline to confirm
// per-frame attitude application changed the visible orientation.
```

**Asserted observations:**
- Screenshot captured (no rendering crash).
- Spacecraft mesh visible in the canvas (whatever default orientation; the dev surface drives `getBusQuat` queries but Story 3.2 stops short of applying the result to the Object3D quaternion — Story 3.4's scope).

## Evidence directory layout

After lead executes the probes:

```
_bmad-output/implementation-artifacts/3-2-smoke-evidence/
├── probe1-boot.png
├── probe2-v1-jupiter-ck.png
├── probe3-cruise-synthesized.png
├── probe7-v1-jupiter-visual.png
└── probe-results.json    # optional — copy of each evaluate_script return value
```

## Coverage gap analysis vs dev's tests

Dev-3-2's 48 new tests (30 unit attitude-service + 12 fk-constants + 6 integration) provide deep coverage of every functional path. Gaps identified and filled in `web/tests/attitude-service-qa-gaps.test.ts` (23 new gap tests):

| Gap | AC | Why dev missed it | Resolution |
|---|---|---|---|
| **Quaternion convention tripwire (identity)** — `[w=1, x=0, y=0, z=0]` SPICE → `{x:0, y:0, z:0, w:1}` Three.js as a single isolated defensive test | AC2 | Dev's decode test (`decodeAttitudeChunk` line 159-188) tests the permute on a non-identity quaternion. An identity-quaternion-only defensive test makes any convention regression fail with a clearly-identity-shaped quat (easier to diagnose than a non-identity case). | New: `QA gap 1 — quaternion convention permute defense` (3 tests: identity, 90° about X, 90° about Z) |
| **Runtime SLERP robustness with sign-flipped knots (dot < 0)** | AC3 / ADR-0024 | Dev's tests verify the happy path (sign-walked knots with `dot >= 0`). No test feeds a deliberately sign-flipped pair to defend against the case where a future bake change accidentally skips `walk_signs`. Runtime SLERP must still produce a unit quaternion (no NaN) — the bake walk is for visual continuity, not numerical robustness. | New: `QA gap 2 — ADR-0024 pre-walk gate is load-bearing` (3 tests: standalone SLERP robustness + slerpAtEt robustness + positive-case parity) |
| **`__voyagerDebug.attitudeService` surface contract** | AC7 / AC8 | Dev's integration test exercises the service via constructor injection; no test verifies the `main.ts` wire-up to `window.__voyagerDebug`. The MCP smoke (AC8) relies on this surface — if a refactor strips the assignment, the MCP probes silently fail. | New: `QA gap 3 — __voyagerDebug.attitudeService surface contract` (2 tests: source-grep for the literal assignment + API surface introspection) |
| **`kindForBodyId` namespace defense** | AC1 | Dev introduced the new `kindForBodyId(bodyId): VtrjKind` helper on chunk-loader but added zero tests against it directly. A future bake change that introduces a new attitude body-id (e.g., NA-camera CK at -31101) without updating the runtime `ATTITUDE_BODY_IDS` set would silently misread the byte stream. | New: `QA gap 4 — kindForBodyId namespace defense` (8 tests: V1/V2 bus/platform attitude → 'attitude'; spacecraft SPK IDs and major bodies → 'trajectory'; FK frame-ID parity with chunk-loader allow-set; future NA-camera body-IDs pinned as 'trajectory' until explicitly added) |
| **Boundary discipline at exact `body[0, 0]` and `body[N-1, 0]` knot ETs** | AC5 | Dev's boundary tests use the manifest's `timeRangeEt` (which is a wrapper over the body's knot ETs but could drift). Pinning the boundary against the actual `body[0, 0]` and `body[N-1, 0]` values defends against a future divergence. | New: `QA gap 5 — boundary discipline at exact body[0,0] and body[N-1,0]` (3 tests: query at first knot returns first quaternion; query at last knot returns last quaternion; 1ns before first knot is 'synthesized') |
| **Single ChunkLoader object identity** | AC1 | Dev's integration test asserts cache-size invariance (a behavioral proxy). The structural contract — that AttitudeService and EphemerisService hold the SAME ChunkLoader reference — is not directly asserted. A future refactor that secretly forks a per-service loader could pass the cache-size test if both happen to have the same cache size. | New: `QA gap 6 — single ChunkLoader contract via object identity` (1 test: explicit `toBe(chunkLoader)` reference identity assertion on both services) |
| **V1 PBD bus-vs-platform provenance divergence** | AC4 / AC5 | Dev's test `bus and platform provenance may differ` is generic. The actual V1 PBD shape (bus CK at Pale Blue Dot but NO platform CK — per `docs/kernels/ckbrief-inventory.md` and Story 3.1 § Triage Source) is the canonical divergence case. Pinning this explicitly defends against a bake regression that would emit a (now-missing) platform CK file. | New: `QA gap 7 — V1 PBD bus-vs-platform provenance divergence` (2 tests: V1 PBD divergence; V2 at PBD ET is doubly-synthesized) |

## Generated Tests

### Web-side (vitest)

| File | Test block | AC | Discoverability |
|---|---|---|---|
| `web/tests/attitude-service-qa-gaps.test.ts` | `QA gap 1 — quaternion convention permute defense` (3 tests) | AC2 | Default Vitest collection (no markers, no `.skip`); `@vitest-environment happy-dom` per the test-file directive |
| `web/tests/attitude-service-qa-gaps.test.ts` | `QA gap 2 — ADR-0024 pre-walk gate is load-bearing` (3 tests) | AC3 / ADR-0024 | Default collection |
| `web/tests/attitude-service-qa-gaps.test.ts` | `QA gap 3 — __voyagerDebug.attitudeService surface contract` (2 tests) | AC7 / AC8 | Default collection (source-grep uses node:fs at test time, which happy-dom supports) |
| `web/tests/attitude-service-qa-gaps.test.ts` | `QA gap 4 — kindForBodyId namespace defense` (8 tests) | AC1 | Default collection |
| `web/tests/attitude-service-qa-gaps.test.ts` | `QA gap 5 — boundary discipline at exact body[0,0] and body[N-1,0]` (3 tests) | AC5 | Default collection |
| `web/tests/attitude-service-qa-gaps.test.ts` | `QA gap 6 — single ChunkLoader contract via object identity` (1 test) | AC1 | Default collection |
| `web/tests/attitude-service-qa-gaps.test.ts` | `QA gap 7 — V1 PBD bus-vs-platform provenance divergence` (2 tests) | AC4 / AC5 | Default collection |

**Total: 23 new tests in 1 new file. All discovered by `npm test -- --run` with no special markers.**

## Coverage

- **AC1 (Service module + chunk-loader integration):** Dev's 30 unit tests + 6 integration tests cover findAttitudeFile, multi-spacecraft index, chunk-loader contract. **+8 QA tests** for kindForBodyId namespace. **+1 QA test** for ChunkLoader object identity.
- **AC2 (Quaternion type + SPICE↔Three.js permute):** Dev's decode test covers the permute via a non-identity quaternion. **+3 QA tests** for identity + axis-isolated permute tripwires.
- **AC3 (CK-window SLERP path):** Dev's slerpAtEt tests cover happy-path, boundary cases, unit-norm invariant, duplicate-ET defense. **+3 QA tests** for runtime SLERP robustness against sign-flipped knots (defending the ADR-0024 contract from above).
- **AC4 (Synthesized HGA-Earth-pointing path):** Dev's 5 synthesizeHgaPointingQuat tests cover primary alignment, off-ecliptic geometry, unit-norm, colocated-degenerate, ecliptic-up-parallel degenerate. QA finds no direct gap here; the **V1 PBD divergence test (QA gap 7)** exercises the synthesized-platform-during-bus-CK path implicitly.
- **AC5 (Boundary discipline):** Dev's `boundary discipline: 1ns inside CK window is 'ck'` test + `cross-spacecraft` test. **+3 QA tests** for exact body[0,0] / body[N-1,0] / 1ns-before-start boundary discipline. **+2 QA tests** for V1 PBD provenance divergence (which is a boundary case of AC4/AC5 combined).
- **AC6 (FK constants module):** Dev's 12 fk-constants tests cover frame IDs, unit-norm vectors, HGA-derivation parity. QA finds no gap.
- **AC7 (Integration AC):** Dev's 6 integration tests via ChunkLoader + EphemerisService stack. **+2 QA tests** for the `__voyagerDebug.attitudeService` surface (which is the lead-driven MCP smoke's substrate).
- **AC8 (Lead-driven MCP smoke):** Probe plan authored above. Lead executes; evidence saved to `_bmad-output/implementation-artifacts/3-2-smoke-evidence/`.
- **AC9 (Test sweep green):** Confirmed web vitest **2136 pass** (+23 from dev's 2113); typecheck clean; lint baseline preserved.

## Discoverability check (per skill `on_complete` hook)

All 23 new tests run in the default suite. Verified:

- `web/tests/attitude-service-qa-gaps.test.ts` — discovered by `cd web && npm test -- --run` (default Vitest glob `**/*.test.ts`; no special markers; no `.skip`; no `it.skip`/`describe.skip`).
- The `@vitest-environment happy-dom` directive at the top of the file matches the pattern in `web/tests/heliopause-text-card-qa-gaps.test.ts` and other QA-gap test files; happy-dom is configured at the Vitest project level (verified by precedent — Vitest workspace-config-free + happy-dom from devDependencies).
- No tags (`@slow`, `@flaky`, etc.) that would exclude from default run.

Confirmation runs (from this QA session):
- `cd web && npm test -- --run tests/attitude-service-qa-gaps.test.ts` → **1 file, 23 tests passed** in 1.58s.
- `cd web && npm test -- --run` → **115 test files, 2136 tests passed** in 29.80s (+23 net new from 2113 baseline). 0 failures.
- `cd web && npm run typecheck` → clean.

## Voyager skill-rules compliance summary

- **Rule 1 (Integration ACs):** Verified — AC7 IS the Integration AC. Dev's `attitude-service-integration.test.ts` honours it; QA-gap-6 reinforces it with object-identity assertion.
- **Rule 3 (per-story smoke):** **APPLIED** — Story 3.2 touches `web/src/main.ts` and introduces the AttitudeService consumed by Stories 3.3-3.7. MCP smoke plan authored above; lead executes per Rule 7.
- **Rule 4 (structured completion):** Sent to team-lead at completion.
- **Rule 5 (NFR tripwire response):** Not triggered by QA work. Dev's record reports no tripwires.
- **Rule 6 (ADR violations are HIGH):** QA gap 2 actively defends ADR-0024 (sign-walk pre-bake contract) by pinning runtime robustness even if the bake's walk regresses. QA gap 4 defends ADR-0004 § Body Layout per Kind (Story 3.1 amendment) by pinning the kindForBodyId namespace.
- **Rule 7 (sub-agent tool inventory is harness-inherited):** Honoured — MCP probes are placed on the lead (Layer 1 of ADR-0010), not in this QA agent's execution. Probe plan is fully scripted so the lead can execute without re-deriving.
- **Rule 8 (Chrome DevTools MCP is the canonical browser-smoke driver):** Honoured — no initScript shim referenced. Post-Story-1.16 brotli-dec-wasm handles the browser brotli path.
- **Rule 9 (ADR-0025 APG primitives are extracted):** Not applicable — Story 3.2 introduces no APG-keyboard-handling components.

## Next Steps

- **Lead:** Execute the AC8 MCP smoke plan above against `localhost:5173`. Save evidence to `_bmad-output/implementation-artifacts/3-2-smoke-evidence/`. Hand off to code review (`bmad-code-review` skill) after smoke evidence is captured.
- **Code review (cr-3-2):** Cross-check each AC against ADR registry per Rule 6. Particular attention to: ADR-0004 § Body Layout per Kind (decoder reads column 0); ADR-0009 (no web workers); ADR-0024 (sign-walk pre-bake — and QA gap 2's runtime robustness defense); ADR-0026 (no `any`).
- **Story 3.4 dev (downstream):** When applying per-frame attitude, exercise the Story 3.2 AC8 probe 7 visual baseline as a diff target. The default-GLB-orientation screenshot becomes the "before" frame.
