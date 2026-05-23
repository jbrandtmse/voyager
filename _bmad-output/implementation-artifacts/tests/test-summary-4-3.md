# Test Automation Summary — Story 4.3 (QA stage)

**Story:** 4.3 — Cadence-Shift Trajectory Chunks and 4k→8k Texture Upgrade
**Stage:** QA (post-dev, pre-code-review)
**Date:** 2026-05-23

## Scope

Dev landed 4 cycles with comprehensive happy-path tests across:
- Bake-side cadence-band plan (8 fast-tier tests)
- EphemerisService prefetch + boundaryStalled (19 unit tests, extended in-file)
- MissionPhaseFSM (15 unit tests)
- CelestialBodies upgrade + moon add/remove (19 unit tests, extended in-file)
- Build-pipeline KTX2 E2E (3 tests, gated on toktx)
- Invisible-loading defense (3 tests, source-grep)
- Integration AC + T5 moon-add chain (6 tests, real RenderEngine/FSM/CelestialBodies + stub TextureLoaderService)

QA extends coverage to the failure modes dev didn't pin.

## Generated Tests

### Vitest — unit + integration

- [x] `web/src/services/mission-phase-fsm.qa.test.ts` (7 tests)
  - Reverse-scrub seeded state contract (cold-load INSIDE Jupiter SOI → reverse → soiExited fires)
  - Multi-event clustering: SOI crossing + instrument shutoff in same `update(et)` both fire
  - Multi-event ordering: SOI events fire BEFORE instrument-shutoff in the same update
  - Subscribe-during-notify safety: no throw, pre-existing subscribers not skipped
  - Far-future cold-load doubly idempotent: second update at the same far-future ET fires nothing
  - `dispose()` mid-pending-notify is safe (no throw, no corruption)
  - Throw isolation under multi-event clustering (multiple throwing subscribers don't silence good ones)

- [x] `web/src/services/ephemeris-service.qa.test.ts` (4 tests)
  - Last-segment edge: `maybePrefetchNeighbour` doesn't call `chunkLoader.load` for a non-existent neighbour
  - Prefetch rejection drops the URL from the dedupe Set (next 10%-window entry can retry)
  - Two calls AT the `triggerEt` threshold fire prefetch exactly once (boundary edge case)
  - `boundaryStalled` cleared by a successful lookup of a DIFFERENT body (the flag is service-wide, not per-body)

- [x] `web/src/render/celestial-bodies.qa.test.ts` (4 tests)
  - Texture-dispose on `removeMoonsFor` (mock-spy on `Texture.dispose()`)
  - Concurrent SOI events for different bodies: `addMoonsFor(5)` then `(6)` produces both systems independently
  - `removeMoonsFor(5)` does NOT affect Saturn-system moons added in the same frame
  - Round-trip add → remove → re-add yields a FRESH `SphereGeometry` (no GPU-buffer leak via retained handle)
  - Idempotent upgrade across the async boundary (second upgrade after texture swap is still a no-op)

- [x] `web/tests/invisible-loading-defense-qa.test.ts` (5 tests)
  - Canary: contrived `html\`...Loading...\`` template trips the scanner
  - Canary: contrived `staticHtml\`...Spinner...\`` template trips the scanner (surfaces the `\bhtml\`` regex hole — dev's regex would miss `staticHtml` per word-boundary semantics; QA pins the broader contract)
  - Canary: `.innerHTML = "please wait"` assignment trips the scanner
  - Negative: comment-only forbidden keywords are NOT false-positives
  - Negative: identifier/property-name `loading` (not in a DOM context) is NOT a false-positive
  - Intentional-injection canary: a tmpdir fixture file with `<v-foo>Loading…</v-foo>` is detected — proves the scanner WOULD fire on real-source regression

- [x] `web/tests/mission-phase-fsm-integration-qa.test.ts` (3 tests)
  - pendingCount > 0 backpressure: second `engine.upgradePlanetTexture(5)` BEFORE first load resolves is a no-op
  - Reverse-scrub then re-enter while upgrade mid-flight: no double-load, atomic swap still lands
  - Multi-subscriber independence under gate-closed: a gated-skip in subscriber A does NOT prevent subscriber B from running

### Pytest — bake fast tier

- [x] `bake/tests/test_bake_trajectories_moons.py` (8 tests)
  - `MOON_BODIES` has 13 entries (4 Galilean + 3 Saturn + 5 Uranian + 1 Triton)
  - Moon NAIF IDs are unique
  - `MOON_BODIES` is disjoint from `CELESTIAL_BODIES` (no double-emit)
  - Slugs are unique (no on-disk filename collision)
  - Hyperion (NAIF 607) IS included in the trajectory bake (only texture is missing — chaotic rotation prevents the equirect map, not the SPK ephemeris)
  - Per-parent counts match NAIF 5xx/6xx/7xx/8xx conventions (4/3/5/1)
  - Skip-path contract: when `spice.spkgeo` raises `SpiceyError` for every moon, exactly ONE `[SKIP]` log line per moon (no per-sample retry, no body_records pollution)
  - Partial-skip isolation: a Hyperion-only `SpiceyError` does NOT poison Titan or Iapetus bakes (only Hyperion is skipped)

## Coverage delta

| Tier | Pre-QA baseline | Post-QA |
|------|-----------------|---------|
| Web vitest | 2641 passed / 2 skipped / 148 files | **2666 passed / 2 skipped / 153 files** (+25 tests / +5 files) |
| Bake fast pytest | 422 passed / 4 skipped / 19 deselected | **430 passed / 4 skipped / 19 deselected** (+8 tests) |
| Typecheck | clean | clean |
| Lint | 4 warnings / 0 errors | 4 warnings / 0 errors (baseline preserved per AC9) |

## Chrome DevTools MCP smoke

Per Rule 3 + Rule 8 + the per-story Chrome-DevTools-MCP-smoke-stage policy in `_bmad/custom/voyager-skill-rules.md`: Story 4.3 touches `web/src/` (mission-phase-fsm, ephemeris-service, render-engine, celestial-bodies, main.ts), so a dedicated MCP smoke is required.

The story file's `## Smoke probe plan (AC8)` already lists 6 probes covering Probes 1-3 (debug surface presence), Probe 4 (moon meshes — now unblocked post-cycle-4), Probe 5 (zero spinner/progress DOM emission), and Probe 6 (console clean). QA proposes the following **refinements + additions** for the lead's actual run:

### Probe refinements

- **Probe 3 (Jupiter 4K KTX2 loaded)** — the current Probe 3 traverses the scene-graph and reads `material.map.image.src`. QA recommendation: ALSO check `__voyagerDebug.celestialBodies._peekTier(5)` returns `'4k'`. This is a more robust contract than image-URL string sniffing (Three.js's KTX2Loader sets the texture's `source.data` differently across versions).

- **Probe 4 (moons in scene)** — extend to verify the moon meshes are NOT visible if the bake-side moon SPK kernels are absent (the runtime contract: mesh constructs OK, `mesh.visible === false` until the trajectory chunk lands). Distinct assertions for "mesh exists" vs "mesh visible" surface the bake-side procurement gap explicitly.

- **Probe 5 (zero spinner DOM)** — add a NEGATIVE-control assertion AFTER the positive: deliberately scrub to a far-future ET, trigger the auto-cap, and confirm the `—paused (loading)` suffix DOES appear on the speed-multiplier readout. The current Probe 5 only verifies absence; QA recommends verifying the legitimate carve-out IS reachable so the test isn't trivially-green when the speed-multiplier is broken.

### New QA-recommended probes

- **Probe 7 — `pendingCount > 0` backpressure under fast scrub.**
  Drag the scrubber rapidly from cruise to V1 Jupiter; in `evaluate_script` count the network requests for `-4k.ktx2` URLs. Expected: at most ONE Jupiter-4k request even if the SOI boundary is crossed multiple times by rapid back-and-forth scrub. This proves the per-body tier ratchet survives real user-input timing.

- **Probe 8 — Reverse-scrub tier non-de-escalation.**
  After Probe 3 establishes Jupiter at 4K, drag the scrubber back to cruise; re-run Probe 3 against Jupiter. Expected: `_peekTier(5) === '4k'` still (per NFR-C6 + the story's Out-of-Scope: "the texture stays at the highest tier loaded for the session"). The current "Reverse-scrub mini-probe" in the story file covers this — QA recommends formalizing it as an explicit numbered probe with the same evidence-capture rigor as Probe 3.

- **Probe 9 — `__voyagerDebug.missionPhaseFSM.getSoiState(-31, 5)` returns `'inside'` at V1 Jupiter anchor.**
  Direct FSM-state inspection (already exposed by T8 per the story Dev Notes). Confirms the FSM is wired correctly into the per-frame loop and that the cold-load seed put V1 inside Jupiter SOI as expected.

### Evidence capture

Per the persistent_facts contract:
- `mcp__chrome-devtools-mcp__take_screenshot` — cold-load V1 Jupiter view + reverse-scrub view + Saturn-system view (when moon meshes are in scene).
- `mcp__chrome-devtools-mcp__take_snapshot` — accessibility tree at V1 Jupiter (HUD + scrubber are user-facing surfaces; the snapshot pins the aria-current / aria-valuetext contract).
- `mcp__chrome-devtools-mcp__list_console_messages` — assert no error/warn messages other than Lit's dev-mode banner.
- `mcp__chrome-devtools-mcp__list_network_requests` — confirm 4K KTX2 loaded (not 8K — the Rule-5 amend); confirm moon-2K KTX2s loaded for the active system; confirm no PNG fallbacks fired for moons that have KTX2 sources.

Evidence path: `_bmad-output/implementation-artifacts/4-3-smoke-evidence/`.

## Test discoverability — confirmed

- `web/src/services/mission-phase-fsm.qa.test.ts` — `.test.ts` under `web/src/` → auto-discovered by vitest.
- `web/src/services/ephemeris-service.qa.test.ts` — same.
- `web/src/render/celestial-bodies.qa.test.ts` — same.
- `web/tests/mission-phase-fsm-integration-qa.test.ts` — `.test.ts` under `web/tests/` → auto-discovered.
- `web/tests/invisible-loading-defense-qa.test.ts` — same.
- `bake/tests/test_bake_trajectories_moons.py` — `test_*.py` under `bake/tests/` → auto-discovered by pytest. NO `@pytest.mark.slow` marker → runs in the default fast tier.

All confirmed by running the targeted suites and the full sweeps above.

## Next Steps

- Hand off to code review (next stage in the epic-cycle).
- Lead drives the Chrome DevTools MCP smoke per the refined probe plan above + the story's existing AC8 plan.
- Lead commits the test files alongside the dev's existing work.
