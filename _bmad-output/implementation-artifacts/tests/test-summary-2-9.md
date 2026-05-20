# Test Automation Summary — Story 2.9

**Story:** Heliopause Text Cards + Instrument-Shutoff HUD Integration
**Date:** 2026-05-20
**QA agent:** qa-2-9 (epic-cycle-2026-05-20)
**Epic 2 — FINAL story**

## Scope

The dev-authored test suite for Story 2.9 covers AC1–AC6 across six
files at the unit + dev-integration tiers (75 new tests total):

- `web/src/data/heliopause-copy.test.ts` — 14 unit tests for the
  V1H/V2H copy structure (lede, paragraph counts, 80–200 word body
  budget, cosmic-ray + plasma + magnetic-field signature mentions,
  `heliopauseCopyForSlug` lookup).
- `web/src/data/mission-facts.test.ts` — 20 tests across three blocks:
  R4-style MISSION_FACTS.md verbatim-string parity (launch dates,
  encounter instants, heliopause dates, instrument shutoffs, ADR-0021
  declaration), runtime API (`isShutOffAt`, `getShutoffEt`, frozen
  records, V1 PLS < V2 PLS ordering), and cross-spec consistency
  against `web/src/chapters/specs/*.ts`.
- `web/src/components/v-chapter-copy.test.ts` — 14 unit tests for
  Light DOM contract (`createRenderRoot` returns `this`), custom-element
  registration, initial empty article + aria-hidden, V1H/V2H held-state
  copy rendering, copy clearing on forward + reverse exit, ignore for
  non-heliopause slugs (v1-jupiter, pale-blue-dot), late-mount seed
  from `director.activeChapter`, director swap unsub, disconnect cleanup.
- `web/src/components/v-hud-instruments.test.ts` — 20 tests across
  five describes: registration + structure (2 rows, 4 instruments each,
  data-cell attrs), shutoff state transitions (1977 all-active,
  threshold inclusive at V1 PLS, 2020-01-01 V1 ISS/UVS/PLS struck
  through, V2 PLS active at 2020, V2 PLS struck through post-2025,
  tick() non-finite no-op, tick without clock still mutates), shut-off
  CSS rule (line-through, --v-color-fg-quiet color, --v-color-fg-muted
  base, --v-duration-base transition), HUD style defense (no background
  fills), initial render matches wired clock (no flash of all-active),
  and mission-facts cross-reference.
- `web/tests/heliopause-text-card-integration.test.ts` — 8 dev
  integration tests for first-paint mount, embed-mode editorial-content
  rule, V1H + V2H text-card on scrub, encounter chapter empty panel,
  AC5 no-viewframe-events, main.ts debug surface contains chapterCopy.

This QA stage fills cross-cutting gaps the dev suites do not exercise
(Epic 2 FINAL story — broader coverage required per the brief):

1. **Full-stack first-paint composition (Integration AC7 backstop)** —
   the dev tests build hand-driven `ChapterDirector`s in isolation. The
   QA tier composes the FULL pipeline (real `URLSync` × `ClockManager`
   × `ChapterDirector` × `ALL_CHAPTERS` × `startFirstPaint`) and
   exercises four cold-load scenarios: `/` (1977 all-active),
   `/c/v1-heliopause` (V1 copy + 2012-era HUD), `/c/v2-heliopause` (V2
   copy + 2018-era HUD), and deep-link to 2020 (V1 mostly off, V2 PLS
   active). Catches a regression in any seam (e.g. first-paint omits
   v-chapter-copy in some embed branch, or HUD wiring drops the
   instruments tick path).

2. **V1H + V2H share the chapter-copy panel without bleed** — forward
   scrub V1H → cruise → V2H shows the correct slug + lede at each
   stop; reverse scrub V2H → V1H confirms data-slug flips cleanly and
   no V2 paragraph content remains in the DOM after the V1 render. A
   third test counts director transition events to pin the contract
   that one V1H→V2H crossing fires exactly 4 transitions total (V1H
   held→exiting→passed + V2H out→entering→held), no event storm.

3. **Instrument-shutoff progression across the mission** — six ET
   probes covering the historical bass-note elegy: 1977-09-05 (V1
   launch, all active), 1980-03-31 (pre-V1-PLS by hours, all active),
   1980-04-01 (V1 PLS day, exactly one cell struck through),
   2020-01-01 (full state matrix: V1 ISS/UVS/PLS off + V1 LECP active,
   V2 ISS/UVS off + V2 PLS/LECP active), 2025-01-01 (V2 PLS now off,
   V1 LECP still active), and 2030-12-31 (full elegy — every cell
   struck through). A seventh test mounts the HUD AT the V1 LECP
   shutoff boundary instant and verifies the inclusive comparison
   flips the cell on the threshold.

4. **Reduced-motion CSS contract** — four CSS-level proofs of the
   Story 1.7 token-driven reduced-motion pattern:
   - `chapter-copy.css` authors `transition: opacity
     var(--v-duration-base)` (no hardcoded duration).
   - `chapter-copy.css` does NOT author its own
     `@media (prefers-reduced-motion)` block (the per-component
     override pattern Story 1.7 rejects).
   - `global.css` defines the `@media (prefers-reduced-motion: reduce)`
     block that collapses `--v-duration-base` to `0ms`.
   - `v-hud-instruments.ts` follows the same pattern (token-only
     transition; no local prefers-reduced-motion override).
   A fifth test pins happy-dom's `matchMedia` is callable for the
   reduced-motion query (real browser-tier verification belongs in
   the MCP smoke).

5. **Embed-mode `<v-chapter-copy>` editorial-content rule** — three
   tests cold-load `/c/v1-heliopause?embed=true`, `/c/v2-heliopause?embed=true`,
   and verify the HUD-instruments component mounts in embed mode too.
   Pins the Story 2.5 chrome-vs-content split contract: chapter-index
   + help-overlay are chrome (omitted in embed mode); chapter-copy +
   HUD are editorial content (mounted in both modes).

6. **HUD sub-component coexistence (no regressions to date/distance/
   speed)** — four tests prove the instruments tick path coexists
   with the other HUD sub-components in the same `<v-hud>`:
   - All four handles (`hudDate`, `hudDistance`, `hudSpeed`,
     `hudInstruments`) resolve to non-null after first paint, and
     `hud.tick(et)` reaches the instruments without throwing.
   - 60 sequential `hud.tick()` calls produce stable instrument DOM
     (same 8 cells, no flicker).
   - Per-frame mutations are visible-DOM-only (the architecture line
     424 contract: instrument shutoff toggles do NOT cascade Lit
     `requestUpdate` on date/distance siblings — proven by structure-
     stability across 30 ticks).
   - The Story 1.11 hud-defense.test.ts file still contains the
     Story 2.9 supersede assertion (regression guard against
     accidentally reverting the dev's stub-to-fill update).

7. **MISSION_FACTS.md parity drift detection** — six tests prove the
   parity-detection algorithm catches future drift across all four
   citation surfaces (launch dates, heliopause dates, instrument
   shutoffs, encounter dates). Each test asserts a deliberately-
   corrupted date is NOT in the doc, AND that the real value IS. Two
   additional tests pin that MISSION_FACTS.md references both the
   runtime mirror path (`web/src/data/mission-facts.ts`) and the
   parity-test path (`mission-facts.test.ts`) so a future contributor
   reading the doc knows where to edit + verify.

8. **AC5 negative-evidence: no Epic 4 viewframe machinery fires** —
   six tests extend the dev's single AC5 assertion to cover:
   - Forward V1H enter (no viewframe / viewframe-transition /
     camera-frame-change / body-centered-frame events).
   - Reverse V1H exit (same).
   - Forward V2H enter (same).
   - Rapid scrub V1H → V2H crossing multiple windows in a single
     `director.update()` call (same — proves the negative-evidence
     holds under the rapid-scrub stress pattern from Story 2.4 QA).
   - Cross-spec proof: `v1-heliopause` + `v2-heliopause` ChapterSpec
     objects do NOT carry any `cameraFrame` / `centeredBody` /
     `viewFrame` / `frameCenter` / `bodyFrame` field (Epic 4 owns
     these — the heliopause specs must stay clean).
   - Forward heliopause crossing produces ZERO `chapter-jump` events
     (those are USER-driven; director-driven boundary crossings during
     free scrub MUST NOT spoof them or the URL pushState would
     redundant).

9. **MCP smoke probe plan for Integration AC7** — documented inline at
   the bottom of `web/tests/heliopause-text-card-qa-gaps.test.ts` as a
   5-probe sequence (Probes 1–5 = AC7 steps 1–5) + a final console-
   clean assertion. Evidence path:
   `_bmad-output/implementation-artifacts/2-9-smoke-evidence/`. The
   plan explicitly maps each probe to its covered ACs, names the exact
   `mcp__chrome-devtools-mcp__*` tool calls expected, and cites
   voyager-skill-rules.md Rule 3 + Rule 6 + Rule 7 as the binding
   authority. Per Rule 7, the LEAD executes these probes — sub-agent
   MCP propagation is best-effort defense-in-depth.

## Generated Tests

### Integration Tests (Vitest, happy-dom)

- [x] `web/tests/heliopause-text-card-qa-gaps.test.ts` — 39 new tests
      across nine describe blocks:
  - Full first-paint composition (4 tests) — MISSION_START all-active,
    V1H cold-load + 2012-era HUD, V2H cold-load + 2018-era HUD, 2020
    deep-link with V1 mostly off + V2 PLS still active.
  - V1H + V2H share panel without bleed (3 tests) — forward V1H →
    cruise → V2H, reverse V2H → V1H, transition-event-count audit.
  - Instrument-shutoff progression (7 tests) — 1977, 1980-03-31,
    1980-04-01, 2020-01-01, 2025-01-01, 2030-12-31, boundary-instant
    HUD render at V1 LECP shutoff.
  - Reduced-motion CSS contract (5 tests) — chapter-copy.css token
    transition; chapter-copy.css no local @media; global.css token
    override block; v-hud-instruments.ts token transition; happy-dom
    matchMedia probe.
  - Embed-mode editorial-content rule (3 tests) — embed=true + V1H
    shows copy, embed=true + V2H shows copy, embed=true HUD has
    instruments mounted.
  - HUD sub-component coexistence (4 tests) — handles resolve + tick
    reaches instruments, 60-tick stability, structural stability across
    30 ticks (architecture line 424), Story 1.11 supersede pin.
  - MISSION_FACTS.md parity drift detection (7 tests) — corrupted
    launch, heliopause, shutoff, encounter dates each NOT found; every
    shutoff + encounter date IS found; doc references both mirror path
    and parity-test path.
  - AC5 negative-evidence (6 tests) — forward V1H, reverse V1H,
    forward V2H, rapid V1H→V2H, cross-spec field absence, no
    chapter-jump on director-driven crossing.

### Chrome DevTools MCP smoke stage (LEAD-executed per Rule 7)

Documented as a 5-probe sequence inline at the bottom of
`web/tests/heliopause-text-card-qa-gaps.test.ts` so the lead can
execute it deterministically. Evidence path:
`_bmad-output/implementation-artifacts/2-9-smoke-evidence/`.

Probe sequence (covers Integration AC7 steps 1–5 + AC1, AC3, AC4, AC5):

1. **AC7 step 1 — `/c/v1-heliopause` cold-load shows V1 text-card** —
   `navigate_page` + `wait_for` v-chapter-copy + `evaluate_script` on
   data-slug + lede + paragraph count + `take_screenshot` +
   `take_snapshot` (a11y aria-live region).
   Covers Integration AC7 step 1, AC1, AC4.
2. **AC7 step 2 — `/c/v2-heliopause` cold-load shows V2 text-card** —
   same flow for V2. Confirms dual-chapter panel shares correctly.
   Covers Integration AC7 step 2, AC1, AC4.
3. **AC7 step 3 — `/` boot shows 2 HUD rows with all 8 instruments
   active** — `navigate_page` + `wait_for` v-hud-instruments +
   `evaluate_script` on rowCount + cellCount + shutOffCount +
   row labels + `take_screenshot` (1977-all-active) + `take_snapshot`
   (instrument rows have role + aria-label).
   Covers Integration AC7 step 3, AC3.
4. **AC7 step 4 — `/c/v2-neptune?t=2020-01-01` shows multiple V1
   instruments struck through** — `navigate_page` + `wait_for` +
   `evaluate_script` checking the exact shut-off / active matrix (V1
   ISS+UVS+PLS off; V1 LECP active; V2 ISS+UVS off; V2 PLS+LECP
   active) + `take_screenshot` (2020-some-shutoff).
   Covers Integration AC7 step 4, AC3.
5. **AC7 step 5 — trajectory line continuity through heliopause** —
   `navigate_page` to `/c/v1-heliopause` + `wait_for` canvas/WebGL +
   `take_screenshot` (canvas before) + drive scrubber to advance 180
   days + `take_screenshot` (canvas after). Manual visual review of
   the two PNGs confirms the polyline is uninterrupted through the
   boundary (no extra scene-graph elements at the crossing point).
   Covers Integration AC7 step 5, AC5.

Final probe: console-clean check via `list_console_messages` across
the full sequence. Allow-listed: Lit dev-mode banner, Three.js INFO,
chunk-loader pre-fetch warnings (pre-existing baseline). Asserts no
NEW errors introduced by Story 2.9 surfaces.

The MCP smoke plan explicitly maps each probe to its covered ACs and
references voyager-skill-rules.md Rule 3 + Rule 6 + Rule 7 as the
binding authority.

## Verification

- `cd web && npx vitest run tests/heliopause-text-card-qa-gaps.test.ts`
  → 39 tests passed in 3.11 s.
- `cd web && npm test -- --run` → 107 test files / 2007 tests passed
  (1968 baseline + 39 new). 0 regressions.
- `cd web && npm run typecheck` → clean (0 errors).
- `cd web && npm run lint` → 5 pre-existing warnings (0 new — all
  five are the same unused `eslint-disable` directives present before
  Story 2.9).

## Coverage notes

- Dev's 75 unit + integration tests + this file's 39 cross-cutting
  integration tests give 114 vitest-tier tests for Story 2.9 alone
  (across the chapter-copy panel + HUD instruments + MISSION_FACTS.md
  surfaces).
- MCP smoke stage is required (story touches `web/src/`) per
  voyager-skill-rules.md Rule 3 + Rule 6 + Rule 7 and is documented
  inline. The LEAD executes the five probes — sub-agent MCP
  propagation is best-effort defense-in-depth per Rule 7.
- The reduced-motion verification is CSS-level only at the vitest
  tier (happy-dom does not honor `prefers-reduced-motion` as a real
  cascade). The MCP smoke can extend this with a `emulate` call to
  set reduced-motion = reduce + screenshot the instant-cut text-card
  if desired in a future revision.
- AC5 negative-evidence relies on probing four candidate Epic 4 event
  names (`viewframe`, `viewframe-transition`, `camera-frame-change`,
  `body-centered-frame`). When Epic 4 chooses the actual event name,
  the QA file may need a follow-up sweep to align — this is documented
  in the inline test comments so a future Epic-4 author knows where
  to look.
- The MISSION_FACTS.md parity drift detection uses in-test "corrupted
  surrogate" date strings rather than mutating the frozen production
  module. This avoids contaminating subsequent tests and demonstrates
  the algorithm catches drift without requiring fixture data.
- axe-core a11y verification is deferred to Story 6.4. The MCP smoke
  Probes 1 + 3 take a11y snapshots as the interim gate (chapter-copy
  `aria-live` + instrument-row `role + aria-label`).

## Files Created / Modified

- `web/tests/heliopause-text-card-qa-gaps.test.ts` — NEW (39
  cross-cutting integration tests + 5-probe MCP smoke plan)
- `_bmad-output/implementation-artifacts/tests/test-summary-2-9.md`
  — NEW (this file)
