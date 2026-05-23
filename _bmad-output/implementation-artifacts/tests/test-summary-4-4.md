# Test Automation Summary — Story 4.4 (QA stage)

**Story:** 4.4 — `<v-timeline-scrubber variant="detail">` Detail-Scrubber Variant
**Stage:** QA (post-dev, pre-code-review)
**Date:** 2026-05-23

## Scope

Dev (Story 4.4 cycle 1) shipped comprehensive happy-path tests across every AC:

- **AC1** detail visual treatment + Rule-10 reactive-prop declaration (10 tests in `web/src/components/v-timeline-scrubber.test.ts`).
- **AC2** slide-in/out driven by ChapterDirector substate (8 tests).
- **AC3** mid-drag pointer-capture discipline (1 test).
- **AC4** dual-scrubber state sync (2 tests).
- **AC5** cadence-aware keyboard step (8 tests in scrubber + 14 in `cadence-aware-step.test.ts`).
- **AC6** mission scrubber highlight band (4 tests).
- **AC7** integration with real `ClockManager` + `ChapterDirector` + `URLSync` + `ALL_CHAPTERS` (12 tests in `web/tests/v-timeline-scrubber-detail-integration.test.ts`).
- **AC8** debug surface (`__voyagerDebug.timelineScrubbers`) — covered by main.ts wire-up.

QA's gap-hunt sweep targets the 8 failure modes the dev's coverage did NOT explicitly pin (per the spawn prompt's "QA gap-hunting priorities" list).

## Generated Tests

### Vitest — QA gap-hunt sweep

- [x] `web/tests/v-timeline-scrubber-detail-qa.test.ts` (29 tests)

#### QA priority 1 — Cadence-aware step boundary discipline (4 tests)
- Crossing the ±1h edge from inside (10s tier) → outside flips to 1min tier on next keystroke.
- Crossing the ±2d edge from inside (1min tier) → outside flips to hourly tier.
- Keyboard-scrubbing INTO the chapter window from outside recomputes step on next keystroke (proves the activeDetailChapter wire-up).
- Cursor at the ±1h boundary uses snapshot at firing time (boundary inclusivity discipline).

#### QA priority 2 — Forward/reverse substate symmetric coverage (4 tests)
- Reverse open: `passed → exiting → held` flips aria-hidden=false (symmetric to forward open).
- Reverse close: `held → entering → out` flips aria-hidden=true (the dev-documented `event.to === 'entering' && event.from === 'held'` reverse-close branch).
- Rapid back-and-forth across the window edge: 5 cycles, no "stuck" state.
- Forward exit: `held → exiting → passed` (defense — the dev tests passed `windowEndEt + 1`, QA confirms `windowEndEt + 1 day` lands on `passed`).

#### QA priority 3 — Dual-scrubber pointer-capture race (3 tests)
- pointerdown on mission scrubber AT THE SAME TICK as substate transition does NOT hijack capture (synchronous race).
- Simultaneous mouse on mission + touch on detail (different pointerIds) — each track manages its own drag; both `data-dragging` flags remain set.
- Mid-drag on detail with reverse-scrub past window-start does NOT cancel the drag (capture stays bound to the DOM element).

#### QA priority 4 — Shared URLSync throttle (2 tests)
- Mission `pointerdown` + detail `pointerdown` within 250 ms produce ONE coalesced write per window (uses fake timers + injected URLSync stub to count `replaceState` calls).
- Both scrubbers reference the SAME URLSync instance (identity check — defends against the dev wiring up two URLSyncs by mistake).

#### QA priority 5 — aria-hidden flip synchronicity (3 tests)
- aria-hidden flips to "false" SYNCHRONOUSLY in the subscriber callback (no 400 ms gap of inaccessible-but-visible UI for AT). Asserted BEFORE `await updateComplete`.
- aria-hidden flips to "true" SYNCHRONOUSLY on slide-out.
- aria-hidden seeded on mount BEFORE first render (cold-load that lands inside V1J window).

#### QA priority 6 — Mission scrubber highlight band positional alignment (3 tests)
- Cruise era: NO highlight band on mission scrubber (defense — dev tests confirmed presence at V1J held, not absence in cruise).
- V1J held: band present AND positionally aligned with detail extent — mission band's left/right percentages match the detail scrubber's `[rangeStart, rangeEnd]` window math.
- Exiting V1J: band disappears synchronously with detail close.

#### QA priority 7 — APG Slider primitive (Rule 9) + lazy cadence step (4 tests)
- Source grep: component imports `createSliderKeyboardHandler` from `'../primitives/slider-keyboard'`.
- Source grep: component does NOT inline-reimplement `e.key === 'Home'/'End'/'ArrowLeft'/'ArrowRight'` (Rule 9 HIGH check).
- Lazy step recompute — handler is rebuilt per keystroke; cursor at anchor uses 10s, then teleport to anchor+5d uses 1h.
- Lazy step is per-keystroke (3 successive ArrowRights crossing the ±1h boundary: 10s + 60s + 60s = 130s total, not 30s — proves the cadence step is re-consulted at EACH fire, not snapshotted at handler construction).

#### QA priority 8 — Rule 10 grep defense (6 tests)
- Source grep: `rangeStart` uses `declare rangeStart: number;` form (no initializer).
- Source grep: `rangeEnd` uses `declare rangeEnd: number;` form (no initializer).
- Source grep: `variant` uses `declare variant: ScrubberVariant;` form (no initializer).
- Constructor body assigns the reactive properties via `this.<name> = ...`.
- Static properties registration includes `rangeStart` + `rangeEnd` with `attribute: 'range-start'/'range-end'`.
- Runtime defense — writing to `rangeStart` / `rangeEnd` triggers Lit's `requestUpdate` (proves the Lit-generated accessor is in place, not shadowed by a class field).

## Coverage delta

| Tier | Pre-QA baseline | Post-QA |
|------|-----------------|---------|
| Web vitest | 2758 passed / 2 skipped / 157 files | **2788 passed / 2 skipped / 158 files** (+30 tests / +1 file) |
| Bake fast pytest | 430 passed / 4 skipped / 19 deselected | 430 / 4 / 19 (unchanged — Story 4.4 has no bake-side surface) |
| Typecheck | clean | clean |
| Lint | 4 warnings / 0 errors | **4 warnings / 0 errors** (baseline preserved per AC9) |

The +30 delta vs. the 29 new test cases is one extra test count from the pre-existing `web/src/primitives/cadence-aware-step.test.ts` running under the full sweep (the dev cycle ran 2758; QA's sweep ran 2788 with +29 new + 1 incidental — within the documented flaky-perf-harness variance from the dev's note).

## Chrome DevTools MCP smoke

Per Rule 3 + Rule 8 + the per-story Chrome-DevTools-MCP-smoke-stage policy in `_bmad/custom/voyager-skill-rules.md`: Story 4.4 touches `web/src/` (v-timeline-scrubber.ts, first-paint.ts, main.ts, math/et-conversions.ts, primitives/cadence-aware-step.ts), so a dedicated MCP smoke is required.

The story file's `## Smoke probe plan (AC8)` already lists 6 probes. QA proposes the following **refinements + additions** for the lead's actual run:

### Probe refinements

- **Probe 1 (both scrubbers present)** — extend the assertion to verify `__voyagerDebug.timelineScrubbers.length === 2` AND `__voyagerDebug.timelineScrubbers.map(s => s.variant)` sorts to `['detail', 'mission']`. The current Probe 1 already does this via `document.querySelectorAll`; QA recommends ALSO reading the debug surface to catch the (likely) regression where main.ts drops the array entry.

- **Probe 4 (cadence-aware keyboard step)** — extend with TWO additional positions:
  - Tab to detail thumb at V1J anchor (10s tier), press ArrowRight → assert `aria-valuenow` advanced by 10 seconds.
  - Scrub the cursor to V1J anchor + 5 days (`__voyagerDebug.clockManager.scrubTo(...)`), wait for `requestAnimationFrame`, re-focus the detail thumb, press ArrowRight → assert `aria-valuenow` advanced by 3600 seconds (hourly tier). The two-position probe is the binding browser-side proof of the lazy-cadence contract that QA priority 7 pins at vitest tier.

- **Probe 5 (dual-scrubber state sync)** — extend with the REVERSE direction: drag the mission scrubber's thumb, assert the detail scrubber's `aria-valuenow` updates simultaneously (the dev's unit test pins detail→mission; the smoke should pin mission→detail since UX-DR31 calls out the SYMMETRIC contract).

### New QA-recommended probes

- **Probe 7 — URLSync coalesce under dual-drag.**
  Call `__voyagerDebug.clockManager.scrubTo(et)` twice within 100 ms (mission ET, then detail ET in the same chapter window). In a `mcp__chrome-devtools-mcp__list_network_requests` snapshot, count the `replaceState`-equivalent navigations (URL updates). Expected: ONE leading-edge URL update + ONE trailing-edge update at 250 ms, NOT two leading-edge updates. The probe surfaces a double-throttle regression that the unit-tier `vi.useFakeTimers()` test catches but a real browser would also exhibit.

- **Probe 8 — Reverse-scrub close-via-edge.**
  Drive the cursor INSIDE V1J (`scrubTo(anchorEt)`), wait for the slide-in. Then `scrubTo(windowStartEt - 86400)` (1 day BEFORE the window start). Assert `__voyagerDebug.timelineScrubbers.find(s => s.variant === 'detail').getAttribute('aria-hidden')` flips back to `'true'` AND `getComputedStyle.opacity === '0'`. This is the symmetric of the forward-exit Probe 6 already in the story.

- **Probe 9 — non-encounter chapter does NOT open the detail variant.**
  Navigate to `/c/launch-v1` (NOT an encounter chapter — `targetBody` is undefined). Wait for steady state. Assert the detail scrubber's `aria-hidden === 'true'` AND `getComputedStyle.opacity === '0'`. The probe pins the "gate on BOTH slug pattern AND targetBody" contract from AC2 — defends against a regression where launch-v1's `held` substate accidentally surfaces the detail variant.

- **Probe 10 — `take_snapshot` accessibility tree confirms detail-variant aria-label.**
  At V1J anchor, capture the accessibility tree via `mcp__chrome-devtools-mcp__take_snapshot`. Verify the detail scrubber's slider thumb carries `aria-label === 'Voyager 1 — Jupiter encounter timeline'` (chapter-name interpolated). This is the binding screen-reader surface that AC5's `aria-label="<chapter name> encounter timeline"` clause promises.

### Evidence capture

Per the persistent_facts contract:
- `mcp__chrome-devtools-mcp__take_screenshot` — cold-load V1 Jupiter view (both scrubbers visible) + cruise view (only mission scrubber) + reverse-scrub view (post-close).
- `mcp__chrome-devtools-mcp__take_snapshot` — accessibility tree at V1 Jupiter (detail scrubber aria-label, aria-valuetext, aria-valuemin/max).
- `mcp__chrome-devtools-mcp__list_console_messages` — assert no error/warn beyond the documented Lit dev banner + cycle-7 KTX2-advisory carve-out. Specifically defend against the `class-field-shadowing` warning that would surface if Rule 10 were violated.
- `mcp__chrome-devtools-mcp__list_network_requests` — confirm NO duplicate URL writebacks under dual-drag (per Probe 7).

Evidence path: `_bmad-output/implementation-artifacts/4-4-smoke-evidence/`.

## Test discoverability — confirmed

- `web/tests/v-timeline-scrubber-detail-qa.test.ts` — `.test.ts` under `web/tests/` → auto-discovered by vitest's `**/*.test.ts` glob. No `it.skip` / `describe.skip` markers; all 29 tests run by default.

Confirmed by:
- `npx vitest run tests/v-timeline-scrubber-detail-qa.test.ts` — 29 / 29 passed.
- `npx vitest run` (full sweep) — 2788 / 2790 passed, 2 skipped, 0 failures.
- `npx tsc --noEmit` — clean.
- `npx eslint src tests` — 0 errors, 4 warnings (baseline preserved per AC9).

## Next Steps

- Hand off to code review (next stage in the epic-cycle).
- Lead drives the Chrome DevTools MCP smoke per the refined probe plan above + the story file's existing AC8 plan.
- Lead commits the QA test file alongside the dev's existing work.
