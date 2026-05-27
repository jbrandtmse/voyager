# Story 6.4: axe-core CI Expansion and Manual Accessibility Test Layer

**Epic:** 6 — Audio, Reduced Motion & Full Accessibility Pass
**Status:** done
**Date created:** 2026-05-24
**Implements:** NFR-A1 (WCAG 2.2 AA), NFR-A6 (photosensitive-epilepsy safety), UX-DR35 (axe-core full), UX-DR36 (manual a11y checklist), reduced-transparency policy (UX-DR26)
**Resolves:** deferred-work entries [1.7/LOW] global.css reset (BaseElement doc), [2.7/LOW] mountAboutSurface overflow, [2.8/LOW] v-help-overlay focus-trap silent catches (with sibling consolidation for v-chapter-index — Rule 9 candidate `primitives/dialog.ts` extraction)

---

## User Story

As the project maintainer,
I want the axe-core CI gate expanded to cover every component state across the inventory plus a documented manual a11y test checklist run before each phase milestone and launch,
So that NFR-A1 conformance is mechanically gated and the cases axe cannot catch (screen-reader, color blindness, forced-colors, photosensitive-epilepsy) are caught manually — fulfilling UX-DR35, UX-DR36, NFR-A6.

## Acceptance Criteria

### AC1 — axe-core component-state matrix (expand from Story 1.7 baseline)

- **GIVEN** the axe-core CI integration from Story 1.7 (single default-state check per component)
- **WHEN** Story 6.4 expands the coverage
- **THEN** the test suite at `web/tests/a11y/` runs axe-core against every Web Component from the inventory in default state + each documented interactive state. Required matrix (at minimum):
  - `<v-title-card>` — visible, dissolving, dismissed
  - `<v-timeline-scrubber>` mission variant — resting, hovered, focused, dragging, bound (at mission start / end), narrow-viewport-collapsed
  - `<v-timeline-scrubber>` detail variant — closed, opening, open, closing
  - `<v-play-button>` — paused, playing, focused, hovered
  - `<v-speed-multiplier>` — at each decade stop, focused, dragging, at-bounds
  - `<v-hud>` — visible, dismissed (Story 6.2), narrow-viewport-compacted
  - `<v-hud-date>` / `<v-hud-distance>` / `<v-hud-chapter-title>` / `<v-hud-speed>` / `<v-hud-instruments>` — within their parent `<v-hud>` states
  - `<v-chapter-index>` — closed, opening, open, item-hovered, item-focused, item-selected
  - `<v-help-overlay>` — closed, opening, open, item-focused
  - `<v-chapter-copy>` — visible, fading, hidden, narrow-viewport-drawer-collapsed, narrow-viewport-drawer-partial, narrow-viewport-drawer-full
  - `<v-attitude-indicator>` — CK-derived state, synthesized state, transition mid-state
  - `<v-audio-toggle>` (Story 6.1) — off, on, focused, hovered
  - `<v-about-page>` — default
  - `<v-attribution-panel>` — default, scrolled
- **AND** the suite uses `axe-core/playwright` or `axe-core/vitest` (verify which is already in use from Story 1.7; extend rather than re-introduce) to drive the checks
- **AND** each state-check spec uses the canonical pattern: render component in target state → `await axe.run(container)` → assert `violations.filter(v => v.impact === 'critical' || v.impact === 'serious').length === 0`

### AC2 — axe-core route matrix (every static route)

- **GIVEN** the project's URL contract (Story 2.4) + the 11 chapter slugs + the about / embed / unsupported routes
- **WHEN** Story 6.4 adds route-level axe checks
- **THEN** a Playwright-driven axe suite at `web/tests/a11y/routes.spec.ts` (or extending `web/tests/visual/`) runs axe against every static route: `/`, `/about`, each `/c/<slug>` for all 11 chapters (`launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`), `/unsupported.html` (all three variants per Story 1.8: WebGL-fail, brotli-fail-historical, fully-supported probe-pass)
- **AND** each route check fails CI on `critical` or `serious` violations
- **AND** `moderate` and `minor` violations are reported in CI output but do NOT block the build (logged + linked to the routes affected; the CI workflow file emits them as warnings)
- **AND** route checks gate behind `describe.skipIf(!existsSync('web/dist/index.html'))` per Story 3.7's slow-tier discipline (the static-parse portion always runs; full route checks require a built dist)

### AC3 — Manual a11y test checklist + run record format

- **GIVEN** UX-DR36's mandate for manual a11y testing
- **WHEN** Story 6.4 documents the checklist
- **THEN** `docs/accessibility/manual-test-checklist.md` exists and covers each test pass with a clear PASS/FAIL probe:
  - **Keyboard-only navigation:** disconnect mouse, complete every primary flow — first-paint, scrub, chapter jump, deep-link entry, About page, embed mode, HUD dismiss, audio toggle (`G`), help overlay (`?`), narrow-viewport HUD compaction (`⋯` button), chapter-copy drawer (`↑`/`↓`)
  - **VoiceOver on macOS Safari:** announces chapter title on change, HUD updates throttled to scrub-stop, help overlay focus-trap works, audio toggle aria-pressed announced, chapter-copy bottom-sheet drawer state announced
  - **NVDA on Windows Firefox:** same checks
  - **TalkBack on Android Chrome:** Tier 3 best-effort
  - **Color blindness simulation:** Chrome DevTools rendering panel — deuteranopia, protanopia, tritanopia, achromatopsia. No information lost — especially `<v-attitude-indicator>` CK/synthesized colors (verify shape/icon differentiation), past-solid/future-dashed trajectory styling (verify dash pattern not just color), chapter-marker dual-cluster labels (verify text not just position)
  - **Forced-colors mode (Windows high-contrast):** all interactive elements visible and operable; palette overrides applied per UX-DR25
  - **`prefers-reduced-transparency: reduce`:** overlay scrim becomes fully opaque per UX-DR26
  - **Reduced-motion cross-check:** verify against Story 6.3's audit doc — every surface listed there honors reduced-motion in actual VoiceOver / NVDA / TalkBack flows
  - **Photosensitive-epilepsy audit (NFR-A6):** verify no surface flashes >3 times/sec; no large-area high-contrast strobing at any transition (title-card dissolve, attitude transition, chapter-copy fade, PBD plate composites, HUD dismiss fade)
- **AND** the checklist has explicit acceptance gates: each check has a clearly defined PASS criterion (not vague "looks good")
- **AND** the checklist is referenced from `_bmad/custom/skill-rules.md` (a new Rule 16 OR a sentence in an existing rule — dev's choice — documenting that the checklist must run before each Phase milestone)

### AC4 — Manual a11y test run record format + first-run capture

- **GIVEN** the checklist's "run before each Phase milestone" cadence
- **WHEN** a maintainer completes a checklist run
- **THEN** the results are committed to `docs/accessibility/manual-test-runs/<YYYY-MM-DD>.md` with one section per check (Keyboard-only, VoiceOver, NVDA, TalkBack, Color blindness, Forced-colors, Reduced-transparency, Reduced-motion cross-check, Photosensitive-epilepsy)
- **AND** each section captures: pass/fail status, OS + browser + assistive-tech versions, screenshots (where relevant; saved alongside in `docs/accessibility/manual-test-runs/<date>-evidence/`), remediation issues filed for any failures (linked to project issue tracker per `_bmad-output/implementation-artifacts/deferred-work.md` if no external tracker)
- **AND** any `critical` or `serious` manual finding blocks the next milestone until remediated
- **AND** Story 6.4 captures the FIRST manual test run at `docs/accessibility/manual-test-runs/2026-05-24.md` — the baseline-against-Epic-6 run. The dev SHALL execute at least the keyboard-only + axe-core-automated-cross-check portions of the checklist; VoiceOver / NVDA / TalkBack / forced-colors / reduced-transparency are flagged as "DEFERRED — requires manual operator with target OS / browser combos; document the gap explicitly". This is acceptable for the FIRST run; subsequent runs by the maintainer will fill the gaps.

### AC5 — Photosensitive-epilepsy audit (NFR-A6)

- **GIVEN** NFR-A6 prohibits >3 flashes/sec and large-area high-contrast strobing
- **WHEN** Story 6.4 audits every animated surface
- **THEN** the audit covers: title-card dissolve, attitude-indicator transition, chapter-copy fade, PBD plate composites, HUD dismiss fade, marker-cluster label fade (Story 6.2), audio fade-in/out (visual indicator of audio activation), reduced-motion-final-state captures (verify no strobing variants exist)
- **AND** the audit conclusion is documented in `docs/accessibility/manual-test-checklist.md` § "Photosensitive-epilepsy audit (NFR-A6)" with a per-surface verdict (PASS / FAIL / N/A)
- **AND** any surface that flashes the screen is REMOVED (Story 6.4 fix in-place) — no flashing surface ships

### AC6 — Deferred-work cleanup (paired with Story 6.4's a11y scope)

- **GIVEN** three deferred-work items routed to Story 6.4 per Story 6.0's § Out of Scope:
  - `[1.7/LOW]` `global.css` universal margin/padding reset — needs BaseElement doc
  - `[2.7/LOW]` `mountAboutSurface` mutates `document.body.style.overflow` — needs to move to `about.css`
  - `[2.8/LOW]` `v-help-overlay` focus-trap silent catches — needs `console.warn` for diagnostic surface (paired with `v-chapter-index` sibling)
- **WHEN** Story 6.4 picks them up
- **THEN** the `[1.7/LOW]` BaseElement-reset doc lands as a JSDoc block on `web/src/components/base-element.ts` documenting the universal reset's implications + the "form-element reset" sibling stylesheet recommendation for components that opt in (verbatim per the deferred-work suggested resolution)
- **AND** the `[2.7/LOW]` overflow mutation moves from inline `document.body.style.overflow = 'auto'` to `about.css`'s `body.v-about-surface { overflow: auto; }` block; `mountAboutSurface` adds the class and removes it on dispose
- **AND** the `[2.8/LOW]` focus-trap silent catches gain `console.warn` diagnostics across both `<v-help-overlay>` AND `<v-chapter-index>` (the sibling) — the existing try/catch is preserved (test environment without layout still needs the defensive catch), but the warning is emitted in dev mode
- **AND** considering Rule 9: if Story 6.4 finds that `<v-help-overlay>` + `<v-chapter-index>` BOTH consume the focus-trap library in similar shapes, extract `primitives/dialog.ts` per the deferred-work suggestion (Rule 9 third-consumer extraction); document the decision in Dev Notes — extract if the duplication is substantive, leave as-is if both consumers just call the third-party `focus-trap` library directly with minimal wrapping

### AC7 — CI budget compliance (NFR-M4)

- **GIVEN** NFR-M4 budget: L3 + a11y stage ≤ 5 minutes; L4/L5 stage ≤ 15 minutes
- **WHEN** Story 6.4's expanded suite runs in CI
- **THEN** the L3 + a11y stage completes in ≤ 5 minutes (component-state axe checks are colocated with component unit tests in L3)
- **AND** the L4/L5 stage completes in ≤ 15 minutes (Playwright-driven route axe checks are part of L4/L5)
- **AND** the CI workflow file (`.github/workflows/ci.yml` or equivalent) is updated if needed to wire the new axe-tier into the existing L3 + L4/L5 phases without exceeding budget

### AC8 — Integration AC: end-to-end accessibility coverage verified

- **GIVEN** AC1's component-state matrix + AC2's route matrix + AC3's checklist + AC4's first-run record + AC5's photosensitive audit + AC6's deferred-work cleanup
- **WHEN** Story 6.4 closes the cycle
- **THEN** the lead's smoke runs:
  - (a) `cd web && npm test a11y` — verifies all component-state checks pass (no critical / serious violations)
  - (b) `cd web && npm run build && npx playwright test a11y/routes --reporter=list` — verifies all route checks pass
  - (c) Open `docs/accessibility/manual-test-checklist.md` and `docs/accessibility/manual-test-runs/2026-05-24.md` — verify both exist with the required sections
  - (d) Grep the codebase for `console.warn.*focus-trap` — verify the AC6 diagnostic surface landed in both `<v-help-overlay>` and `<v-chapter-index>`
- **AND** smoke evidence saved to `_bmad-output/implementation-artifacts/6-4-smoke-evidence/`

### AC9 — Test sweep + lint baseline preserved + ADR compliance verified

- **GIVEN** the post-Story-6.3 baseline: web vitest 3669 / 10 skipped, Playwright L4 20 baselines deterministic, typecheck clean, 4 lint warnings 0 errors
- **WHEN** Story 6.4 ships
- **THEN** web vitest pass count is ≥ 3669 + new axe-component-state tests (estimate +40 to +80 new tests)
- **AND** Playwright pass count grows by route-axe tests (estimate +14 routes = +14 tests)
- **AND** bake pytest preserved (no bake changes)
- **AND** typecheck clean; lint ≤ 4 warnings 0 errors
- **AND** ADR-0010 (Playwright tier per AC2), ADR-0025 (APG primitives — verify `<v-chapter-copy>` drawer ARIA + the `<v-audio-toggle>` aria-pressed comply), ADR-0027 (line-ending for new markdown docs) all verified

## Out of Scope (Defer to Specific Later Stories)

- **External tracker integration for milestone-blocking findings** — DEFER (the project's deferred-work.md serves as the current tracker; external integration is Epic 7 ops).
- **VoiceOver / NVDA / TalkBack actual operator runs** — DEFER first-run requires real OS + browser combos; document gaps in `manual-test-runs/2026-05-24.md`; subsequent runs by the maintainer fill the gaps.
- **`prefers-color-scheme` light/dark mode support** — out of FR scope (the artifact is dark by design).
- **Full WCAG 2.2 AAA compliance** — out of FR scope (AA is the target per NFR-A1).
- **WCAG-EM evaluation methodology report** — Epic 7 polish.

## Tasks / Subtasks

- [x] T1 — axe-core component-state matrix (AC1, AC7)
  - [x] Subtask 1.1 — Inventory existing `web/tests/a11y/` setup; verify which axe-core integration is in use
  - [x] Subtask 1.2 — Write per-component state-matrix tests; aim for ≥40 new tests
  - [x] Subtask 1.3 — Configure to filter critical/serious as failures; moderate/minor as warnings
  - [x] Subtask 1.4 — Verify L3 budget ≤ 5 min (add `it.concurrent` if parallelism helps)

- [x] T2 — axe-core route matrix (AC2, AC7)
  - [x] Subtask 2.1 — Add `web/tests/a11y/routes.spec.ts` (Playwright)
  - [x] Subtask 2.2 — Loop over the 14 routes; run axe at each
  - [x] Subtask 2.3 — Gate Playwright tier behind dist-presence check
  - [x] Subtask 2.4 — Verify L4/L5 budget ≤ 15 min

- [x] T3 — Manual a11y checklist (AC3)
  - [x] Subtask 3.1 — Author `docs/accessibility/manual-test-checklist.md` per AC3's structure
  - [x] Subtask 3.2 — Cross-reference from `_bmad/custom/skill-rules.md`

- [x] T4 — First manual run record (AC4, AC5)
  - [x] Subtask 4.1 — Execute keyboard-only + axe-automated cross-check portions
  - [x] Subtask 4.2 — Document deferred portions (VoiceOver / NVDA / TalkBack / forced-colors / reduced-transparency) with explicit "requires real operator" callouts
  - [x] Subtask 4.3 — Photosensitive-epilepsy audit conducted + documented per AC5
  - [x] Subtask 4.4 — Commit at `docs/accessibility/manual-test-runs/2026-05-24.md`

- [x] T5 — Deferred-work cleanup (AC6)
  - [x] Subtask 5.1 — `[1.7/LOW]` BaseElement JSDoc — document the universal-reset implications
  - [x] Subtask 5.2 — `[2.7/LOW]` move overflow mutation to about.css via body class
  - [x] Subtask 5.3 — `[2.8/LOW]` add `console.warn` to focus-trap catches in both v-help-overlay + v-chapter-index
  - [x] Subtask 5.4 — Triage Rule 9 dialog primitive extraction (extract OR document why not) — **EXTRACTED** to `web/src/primitives/dialog.ts`; both consumers now delegate via `createDialogFocusTrap`
  - [x] Subtask 5.5 — Strike through the closed items in `deferred-work.md` with closing annotations

- [x] T6 — Lead-side smoke (AC8)
  - [x] Subtask 6.1 — Run the 4-step smoke sequence
  - [x] Subtask 6.2 — Save evidence to `_bmad-output/implementation-artifacts/6-4-smoke-evidence/`

## Dev Notes

### Critical context

- **axe-core/playwright** is the preferred integration for route-level checks (drives a real browser). For component-state checks colocated with vitest, `axe-core/react` or a generic `axe-core` wrapper works; the dev should pick what fits the project's existing pattern (likely already established by Story 1.7's `web/tests/a11y/` directory — read what's there before introducing a new dependency).
- **Critical vs serious vs moderate vs minor** — axe-core's impact levels. The CI gate hard-fails on critical + serious; soft-reports moderate + minor.
- **Photosensitive-epilepsy audit method** — for each animated surface, look at: (a) `transition-duration` (anything < 333ms creates a >3 flashes/sec risk if the transition cycles); (b) keyframe animations with cycles; (c) JS-driven animations with timer cycles. Most Voyager animations are one-shot fades, NOT cycles — likely PASS across the board, but document each.
- **Manual-test-checklist as a contract document** — once committed, this is the binding gate for future phase milestones. Word it carefully.

### Source tree components to touch

| File | NEW / UPDATE | Why |
|---|---|---|
| `web/tests/a11y/*.test.ts` | NEW (multiple) | T1 component-state checks |
| `web/tests/a11y/routes.spec.ts` | NEW | T2 route checks |
| `docs/accessibility/manual-test-checklist.md` | NEW | T3 |
| `docs/accessibility/manual-test-runs/2026-05-24.md` | NEW | T4 first run |
| `_bmad/custom/skill-rules.md` | UPDATE | T3 cross-reference |
| `web/src/components/base-element.ts` | UPDATE | T5.1 JSDoc |
| `web/src/styles/about.css` | UPDATE | T5.2 overflow rule |
| `web/src/main.ts` | UPDATE | T5.2 add/remove body class |
| `web/src/components/v-help-overlay.ts` | UPDATE | T5.3 console.warn |
| `web/src/components/v-chapter-index.ts` | UPDATE | T5.3 console.warn |
| `web/src/primitives/dialog.ts` | possibly NEW | T5.4 if extraction chosen |
| `_bmad-output/implementation-artifacts/deferred-work.md` | UPDATE | T5.5 |
| `.github/workflows/ci.yml` | possibly UPDATE | T2 if CI wiring needed |
| `_bmad-output/implementation-artifacts/6-4-smoke-evidence/` | NEW (directory) | T6 |

### Project Structure Notes

- Alignment: `web/tests/a11y/` already exists per Story 1.7; extend that directory. `docs/accessibility/` already exists per Story 6.3 (reduced-motion.md); add manual-test-checklist.md + manual-test-runs/ subdirectory.
- Variance: this is the FIRST a11y testing expansion since Story 1.7's baseline; consider it the canonical pattern for future a11y extensions.

### References

- Epic 6 Story 6.4 spec — [_bmad-output/planning-artifacts/epics.md](_bmad-output/planning-artifacts/epics.md) lines 2331–2364
- Story 1.7 axe-core baseline — [web/tests/a11y/](web/tests/a11y/) (read existing setup)
- Story 6.3 reduced-motion audit — [docs/accessibility/reduced-motion.md](docs/accessibility/reduced-motion.md) (cross-referenced by manual checklist)
- Deferred-work routings — [_bmad-output/implementation-artifacts/deferred-work.md](_bmad-output/implementation-artifacts/deferred-work.md) lines 113, 147, 151
- ADR-0010 — [docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md](docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md)
- ADR-0025 — [docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md](docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`.

### Debug Log References

- **vitest a11y component-state suite:** 60 tests across 14 files at `web/tests/a11y/components/` + `web/tests/a11y/helpers/` — all PASS in 6.91s (well within NFR-M4 L3 5-min budget).
- **Playwright a11y route suite:** 16 tests at `web/tests/a11y/routes.spec.ts` — all PASS in 1.5 minutes (well within NFR-M4 L4/L5 15-min budget).
- **Full vitest sweep:** 3734 PASS / 10 skipped / 219 files — **+65 net new tests** vs. the 3669 pre-Story-6.4 baseline (60 a11y component tests + 5 dialog primitive tests).
- **Typecheck:** clean.
- **Lint:** 4 warnings / 0 errors (baseline preserved).
- **AC8 lead smoke evidence:** committed at `_bmad-output/implementation-artifacts/6-4-smoke-evidence/` (4 probe files + smoke-summary.md).

### Completion Notes List

**Implementation summary:**

- **AC1 — axe-core component-state matrix:** authored 14 vitest test files at `web/tests/a11y/components/` covering every required state in the AC1 matrix. The `runAxe()` helper at `web/tests/a11y/helpers/run-axe.ts` is the canonical wrapper — splits `critical` + `serious` violations into a failing `failures` tier vs. `moderate` + `minor` into a logged-only `warnings` tier per AC1. Serialised on a module-local promise queue to avoid axe-core's "already running" singleton guard. Three layout-sensitive rules (`color-contrast`, `target-size`, `region`) are disabled at the component tier because happy-dom doesn't compute layout — the route tier re-enables them.
- **AC2 — axe-core route matrix:** authored Playwright suite at `web/tests/a11y/routes.spec.ts` + companion config at `web/tests/a11y/playwright.config.ts`. Mirrors Story 4.9's environment-pinning discipline (1280×720 viewport, en-US locale, UTC timezone, dark colorScheme, reduced motion). 16 route tests cover the 14 routes (`/`, `/about`, 11 chapter slugs, 3 `/unsupported.html` variants). Gated behind `dist/index.html` existence. New CI job `l4-a11y-routes` added; wired into the deploy `needs:` list.
- **AC3 — Manual a11y checklist:** authored `docs/accessibility/manual-test-checklist.md` covering 9 enumerated test passes (Keyboard-only, VoiceOver, NVDA, TalkBack, Color blindness, Forced-colors, Reduced-transparency, Reduced-motion cross-check, Photosensitive-epilepsy). Each pass has explicit PASS criteria, evidence-capture instructions, sign-off schema. Cross-referenced from new Rule 16 in `_bmad/custom/skill-rules.md`.
- **AC4 — First run record:** authored `docs/accessibility/manual-test-runs/2026-05-24.md` with the explicit AGENT-PASS / DEFERRED partition AC4 mandates (Passes 2–7 require real operator with target OS + browser + assistive-tech combo; gap documented).
- **AC5 — Photosensitive-epilepsy audit:** per-surface verdict table in the run record. Static-analysis pass: `grep -r "@keyframes" web/src/` → ZERO matches; `grep -r "setInterval" web/src/components/` → ZERO matches. Every animation is one-shot; zero cycling animations exist anywhere in the codebase. Aggregate verdict: PASS across every surface (the AC5 "any flashing surface is REMOVED" clause is structurally satisfied — none exist to remove).
- **AC6 — Deferred-work cleanup:**
  - `[1.7/LOW]` — JSDoc block added to `web/src/components/base-element.ts` documenting the universal-reset implications + Light-DOM vs. Shadow-DOM insulation + future form-element-bearing component obligations.
  - `[2.7/LOW]` — overflow mutation moved from `main.ts` inline `document.body.style.overflow = 'auto'` to `about.css`'s `body.v-about-surface { overflow: auto; }` rule; `mountAboutSurface` toggles the class.
  - `[2.8/LOW]` — focus-trap diagnostic `console.warn` lands in BOTH `<v-help-overlay>` and `<v-chapter-index>` (now via the extracted primitive — see Rule 9 triage below).
  - **Rule 9 triage** — extracted `web/src/primitives/dialog.ts` carrying `createDialogFocusTrap({ host, initialFocus, componentName })`. Both consumers now delegate. The two consumers' inline focus-trap configurations were near-identical (10+ lines of option-block duplication differing only in `initialFocus`), justifying extraction per Rule 9 (ADR-0025 third-consumer threshold). 5 new vitest tests at `web/src/primitives/dialog.test.ts`.
  - `deferred-work.md` strikes through all three closed items with closing annotations.
- **AC7 — CI budgets:** L3 a11y vitest stage 6.91s wall-clock; L4 a11y route stage 1.5 min wall-clock. Both well within their NFR-M4 budgets (5 min and 15 min respectively).
- **AC8 — Integration smoke:** lead-side 4-probe sequence executed; evidence at `_bmad-output/implementation-artifacts/6-4-smoke-evidence/`.
- **AC9 — Test sweep + ADR compliance:**
  - web vitest 3734 PASS / 10 skipped / 219 files (+65 net new tests vs. 3669 baseline).
  - bake pytest preserved (no bake changes).
  - Typecheck clean. Lint 4 warnings / 0 errors (baseline preserved).
  - ADR-0010 (Playwright per AC2) ✓ — route axe runs in Playwright at L4 tier.
  - ADR-0025 (APG primitives) ✓ — `primitives/dialog.ts` is the third APG extraction (after `slider-keyboard.ts` and `listbox-keyboard.ts`); Rule 9 updated to mandate consumption by future dialog components.
  - ADR-0027 (LF line endings) ✓ — all new markdown + .ts files use LF.

**Rule 5 incidents (NFR-tripwire fixes during implementation):**

Three pre-existing code defects surfaced as critical/serious axe-core violations when the gate first engaged. Per Rule 5, these are code defects (the ACs themselves were implementable as worded), so the response was to fix them in-place — NOT amend the planning artifacts.

1. **`<v-timeline-scrubber>` `aria-valuenow="<ISO>"` → critical `aria-valid-attr-value`** — ARIA spec requires `aria-valuenow` to be numeric. Fixed: `aria-valuenow` now carries raw ET seconds; ISO form moved to `aria-valuetext` (which screen readers announce in preference anyway). Three existing tests updated; docstring at `v-timeline-scrubber.ts:92` corrected.
2. **`<v-hud-instruments>` `role="row"` without grid parent → critical `aria-required-parent`** — semantically a labelled inline list, not a grid row. Fixed: `role="row"` → `role="group"`.
3. **`<v-help-overlay>` + `<v-chapter-index>` + detail-variant `<v-timeline-scrubber>` aria-hidden focusable content → serious `aria-hidden-focus`** — `aria-hidden="true"` on closed panel while the close button / option list / slider thumb remained focusable. Fixed: pair `aria-hidden` with `inert` so the tab order is also suppressed.

**Architectural touches:**

- New file `web/src/primitives/dialog.ts` + sibling test — third APG primitive extraction per Rule 9.
- New axe-core dependency (`axe-core` + `@axe-core/playwright`) — Story 1.7's deferred a11y gate landed.
- New CI job `l4-a11y-routes` in `.github/workflows/ci.yml`.
- New `npm run test:a11y` script.
- vite.config.ts excludes `tests/a11y/routes.spec.ts` from vitest's glob (it's a Playwright spec; mirrors the visual-suite carve-out).

### File List

**New files:**

- `web/tests/a11y/README.md`
- `web/tests/a11y/helpers/run-axe.ts`
- `web/tests/a11y/helpers/run-axe.test.ts`
- `web/tests/a11y/components/v-title-card.a11y.test.ts`
- `web/tests/a11y/components/v-play-button.a11y.test.ts`
- `web/tests/a11y/components/v-audio-toggle.a11y.test.ts`
- `web/tests/a11y/components/v-hud.a11y.test.ts`
- `web/tests/a11y/components/v-hud-children.a11y.test.ts`
- `web/tests/a11y/components/v-attitude-indicator.a11y.test.ts`
- `web/tests/a11y/components/v-speed-multiplier.a11y.test.ts`
- `web/tests/a11y/components/v-timeline-scrubber.a11y.test.ts`
- `web/tests/a11y/components/v-chapter-index.a11y.test.ts`
- `web/tests/a11y/components/v-help-overlay.a11y.test.ts`
- `web/tests/a11y/components/v-chapter-copy.a11y.test.ts`
- `web/tests/a11y/components/v-about-page.a11y.test.ts`
- `web/tests/a11y/components/v-attribution-panel.a11y.test.ts`
- `web/tests/a11y/playwright.config.ts`
- `web/tests/a11y/routes.spec.ts`
- `web/src/primitives/dialog.ts`
- `web/src/primitives/dialog.test.ts`
- `docs/accessibility/manual-test-checklist.md`
- `docs/accessibility/manual-test-runs/2026-05-24.md`
- `_bmad-output/implementation-artifacts/6-4-smoke-evidence/probe-a-vitest-a11y.txt`
- `_bmad-output/implementation-artifacts/6-4-smoke-evidence/probe-b-route-axe.txt`
- `_bmad-output/implementation-artifacts/6-4-smoke-evidence/probe-c-checklist-files.txt`
- `_bmad-output/implementation-artifacts/6-4-smoke-evidence/probe-d-focus-trap-warn.txt`
- `_bmad-output/implementation-artifacts/6-4-smoke-evidence/smoke-summary.md`

**Modified files:**

- `web/package.json` — added `axe-core` + `@axe-core/playwright` devDependencies + `test:a11y` script.
- `web/package-lock.json` — npm install side effects.
- `web/vite.config.ts` — exclude `tests/a11y/routes.spec.ts` from vitest's default glob.
- `web/src/components/base-element.ts` — JSDoc block documenting universal-reset implications (AC6 [1.7/LOW]).
- `web/src/styles/about.css` — `body.v-about-surface { overflow: auto; }` rule (AC6 [2.7/LOW]).
- `web/src/main.ts` — `mountAboutSurface` toggles `v-about-surface` class instead of mutating inline overflow style (AC6 [2.7/LOW]).
- `web/src/components/v-hud-instruments.ts` — `role="row"` → `role="group"` (Rule 5 fix for axe critical violation).
- `web/src/components/v-timeline-scrubber.ts` — `aria-valuenow` is numeric ET (Rule 5 fix); detail variant pairs `aria-hidden` with `inert` (Rule 5 fix).
- `web/src/components/v-help-overlay.ts` — consumes `createDialogFocusTrap` from new primitive; dialog gets `inert` when closed (Rule 5 fix + AC6 [2.8/LOW]).
- `web/src/components/v-chapter-index.ts` — consumes `createDialogFocusTrap`; panel gets `inert` when closed (Rule 5 fix + AC6 [2.8/LOW]).
- `web/src/components/v-timeline-scrubber.test.ts` — two tests updated to assert numeric `aria-valuenow` per Story 6.4 amendment.
- `web/tests/v-timeline-scrubber-detail-integration.test.ts` — same `aria-valuenow` amendment.
- `web/tests/first-paint-defense.test.ts` — same `aria-valuenow` amendment.
- `_bmad/custom/skill-rules.md` — Rule 16 added (manual a11y checklist gate); Rule 9 updated to reference the extracted `primitives/dialog.ts`.
- `_bmad-output/implementation-artifacts/deferred-work.md` — strike-throughs on `[1.7/LOW]`, `[2.7/LOW]`, `[2.8/LOW]` with closing annotations.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story 6.4 status `ready-for-dev` → `in-progress` → `review` (final entry pending).
- `.github/workflows/ci.yml` — new `l4-a11y-routes` job; `deploy-cloudflare` `needs:` extended.

### Change Log

| Date | Change | Author |
|---|---|---|
| 2026-05-24 | Story 6.4 implementation complete — axe-core full coverage, manual checklist, first run record, photosensitive audit, three deferred-work closures, Rule 9 third-consumer dialog primitive extraction. 3734 vitest PASS / 10 skipped / 4 lint warn / typecheck clean. | Story 6.4 agent dev |
| 2026-05-24 | Story 6.4 code review complete — adversarial pass (Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 9 ACs verified PASS. Three in-place a11y fixes confirmed as correct shipping fixes (not workarounds). Dialog primitive extraction confirmed as canonical Rule 9 example. Rule 16 structurally consistent. Manual checklist + first-run record complete with deferred portions honestly flagged. CI workflow `l4-a11y-routes` needs-chain verified. ADR-0010 / 0025 / 0027 compliance verified. 3774 vitest PASS / 10 skipped (matches +105 dev+QA target). 1 LOW patched inline (misleading "dispose" comment); 2 LOWs deferred (pre-existing). | Story 6.4 code reviewer |

## Review Findings

Adversarial code review executed by `bmad-code-review` skill (Blind Hunter + Edge Case Hunter + Acceptance Auditor parallel layers) on 2026-05-24. All ten focus areas from the review brief were verified against the diff + the persistent skill-rules contracts.

**Triage summary:** 0 HIGH, 0 MED, 1 LOW patched inline, 2 LOWs deferred. No `decision-needed` findings.

### Auto-resolved (LOW, patched inline)

- [x] [Review][Patch] Misleading "dispose" comments in `mountAboutSurface` and `about.css` — both files referenced a non-existent dispose path. The about → simulation back-navigation is handled by `window.location.reload()` (popstate handler at `main.ts:176-180`), which naturally clears the body class. Functional behavior is correct; only the comments were misleading. **Patched:** comments in `web/src/main.ts:1243-1251` and `web/src/styles/about.css:7-18` rewritten to accurately describe the reload-driven cleanup. No code change to the runtime path.

### Deferred (LOW, pre-existing surface)

- [x] [Review][Defer] `aria-valuenow` NaN-safety hardening (defense test pins `Number.isFinite` only on the normal-mount path) — pre-existing surface; not a Story 6.4 regression. Routed to deferred-work.md.
- [x] [Review][Defer] `dialog.test.ts` "activate failure surfaces warn" hedge — the test accepts either outcome (warned OR clean) due to happy-dom's tolerant detached-host activation; strengthening to assert the warn is non-blocking and a sibling refinement, not a Story 6.4 contract gap. Routed to deferred-work.md.

### Verified findings (positive — included for the cycle-log handoff)

**Focus 1 — Three in-place fixes are correct shipping fixes (not workarounds):**

- `aria-valuenow` numeric: `String(this.simEt)` in raw SPICE ET seconds. Same numeric domain as `aria-valuemin`/`aria-valuemax`. ARIA spec requires numeric `aria-valuenow`; screen readers announce `aria-valuetext` (ISO form) in preference. The numeric form semantically corresponds to the scrubber's position within `[rangeLow, rangeHigh]` — coherent with the slider role contract. **Correct.**
- `role="row"` → `role="group"` on `<v-hud-instruments>` row containers: the element is a labelled inline list of instrument names ("V1 ISS · UVS · PLS · LECP"), not a grid row. No `role="grid"`/`role="table"` ancestor exists. `role="group"` + `aria-label="${sc} instrument status"` is the correct ARIA pattern. **Correct.**
- `inert` pairing with `aria-hidden`: confirmed symmetric in all three components — `v-help-overlay.ts:431` (`?inert=${!this.open}` + `aria-hidden=${...}`), `v-chapter-index.ts:511` (same pattern), `v-timeline-scrubber.ts:618-626 + 745-754` (synchronous set/remove of both attributes in `connectedCallback` and `handleDetailTransition`). Open clears both; closed sets both. **Correct.**

**Focus 2 — Dialog primitive extraction quality (Rule 9):**

- Third-consumer threshold genuinely met: both `<v-help-overlay>` and `<v-chapter-index>` consumed `focus-trap` with near-identical option blocks (10+ lines, differing only in `initialFocus` callback). The shape duplication was substantive, not contrived.
- Primitive API is minimal: 3 input fields (`host`, `initialFocus`, `componentName`) and 3 output methods (`activate`, `deactivate`, `raw`). No leaky abstractions.
- Encapsulation invariant enforced by defense test `story-6-4-defense.test.ts:419-428` — only the primitive module imports from `focus-trap`; consumers import only the primitive's `createDialogFocusTrap`. Grep-verified across both consumer files.

**Focus 3 — Rule 16 canonical structure:**

- Heading carries the `(applies to ...)` clause matching prior rules' convention.
- Three structural sections: statement (automated + manual halves), `Why this rule exists today`, `Enforcement`.
- Cross-referenced FROM `docs/accessibility/manual-test-checklist.md:18` (the checklist explicitly names Rule 16 as its invocation source). Bidirectional link verified.

**Focus 4 — Manual checklist completeness:**

- 9 enumerated passes (Keyboard / VoiceOver / NVDA / TalkBack / Color blindness / Forced-colors / Reduced-transparency / Reduced-motion cross-check / Photosensitive-epilepsy).
- Each pass has explicit PASS criteria — not vague. Examples: Pass 1 step 5 specifies "date jumps to 1977-08-20" (a falsifiable observation); Pass 9 specifies "transition-duration ≥ 333ms or no cycle" (a measurable threshold).
- Evidence-capture instructions per pass; sign-off schema at the end binding to `CONDITIONAL PASS / PASS / FAIL`.

**Focus 5 — First-run record honesty:**

- Keyboard-only (Pass 1) + automated (Pass 1 proxy via axe-core suites) + reduced-motion (Pass 8) + photosensitive (Pass 9) are all explicitly captured with their AGENT-PASS rationale.
- Passes 2, 3, 4, 5, 6, 7 are explicitly flagged DEFERRED with "requires real operator" callouts at the per-row Status column AND in the dedicated "Gap callout (per AC4)" paragraph. Not silently skipped.
- Sign-off line reads `CONDITIONAL PASS — automated tier GREEN; operator-tier passes (2, 3, 4, 5, 6, 7) explicitly DEFERRED with the gap documented`. Honest and AC4-compliant.

**Focus 6 — CI workflow `l4-a11y-routes` needs-chain:**

- New job `l4-a11y-routes` at `.github/workflows/ci.yml:407-445` correctly declares `needs: [build]` — the build job produces the `web-dist` artifact, which the a11y-routes job downloads to `web/dist/` before running `npm run test:a11y`.
- `deploy-cloudflare` job's `needs:` list (line 458) is extended to include both `l4-visual-regression` AND `l4-a11y-routes`. Both gates fire before deploy.
- `timeout-minutes: 10` (matches NFR-M4 L4/L5 budget envelope of ≤ 15 min); actual measured wall-clock per the smoke evidence is 1.5 min.

**Focus 7 — Photosensitive-epilepsy audit grep-verifiable:**

- Manual checklist Pass 9 names the audit method; first-run record §"Pass 9" captures the verdict table.
- Grep verification re-executed by reviewer: `web/src/` has ZERO `@keyframes` blocks; `web/src/components/` has ZERO `setInterval` calls. (`role="row"` only appears in the documentary comment context inside `v-hud-instruments.ts:160`.)
- Static-analysis rationale (zero cycling animations exist anywhere) holds; aggregate verdict PASS is sound.

**Focus 8 — Three updated `aria-valuenow` contract test files:**

- `web/src/components/v-timeline-scrubber.test.ts` — 3 assertions updated. Each updated assertion now asserts BOTH (a) `aria-valuenow` matches `String(targetEt)` and (b) `aria-valuetext` carries the ISO form (in some cases checking the date prefix). The contract is strengthened, not weakened.
- `web/tests/first-paint-defense.test.ts` — same pattern; the rewritten test asserts the numeric ET AND that aria-valuetext contains the human-readable form.
- `web/tests/v-timeline-scrubber-detail-integration.test.ts` — `expected = String(v1Jupiter.anchorEt)` replaces `expected = isoFromEt(v1Jupiter.anchorEt)`. Detail + mission still asserted to match on the new numeric contract.
- None of the updates are "delete the failing test." All three are faithful contract amendments with paired aria-valuetext assertions.

**Focus 9 — No regression to existing test suite:**

- Full vitest sweep: `3774 PASS / 10 skipped / 220 files` (matches user prompt's 3669 → 3774 expectation, +105 net new tests).
- Story 6.2 HUD tests (v-hud-dismiss-restore, v-hud-narrow-viewport, marker-cluster): all green.
- Story 6.3 reduced-motion tests: all green; reduced-motion audit doc unchanged.
- Story 6.1 audio tests (v-audio-toggle): all green.
- Typecheck clean. Lint 4 warnings / 0 errors (baseline preserved exactly).

**Focus 10 — ADR-0025 (APG primitives) closure:**

- ADR-0025 line 28-32 committed three primitives: `slider-keyboard.ts`, `listbox-keyboard.ts`, `dialog.ts`. With Story 6.4's dialog extraction, all three are landed.
- Rule 9 amended to mandate `createDialogFocusTrap` consumption by future dialog components (matching the existing slider/listbox enforcement). Inline re-implementation is a HIGH finding per Rule 6.
- **Story 6.4 closes the ADR-0025 obligations completely.** No remaining surface.

**Skill-rules cross-check:**

- **Rule 3** (smoke evidence): route-axe at L4 is the real-runtime gate per AC8(b); 4 probe files + smoke-summary.md committed at `6-4-smoke-evidence/`. ✓
- **Rule 5** (NFR tripwire): N/A — the 3 in-place fixes were code defects (axe-flagged), NOT cases where an AC was unimplementable. Dev's classification is correct; no artifact amendment was warranted. ✓
- **Rule 6** (ADR violations): ADR-0010 (Playwright at CI for L4 routes), ADR-0025 (3 APG primitives complete), ADR-0027 (LF line endings on new files — verified via `cat -A`) all compliant. ✓
- **Rule 9** (primitive extraction): dialog extraction is the canonical example — third-consumer threshold met substantively, minimal API, encapsulation enforced by defense test. ✓
- **Rule 13** (test discoverability): 60 component-state + 5 dialog primitive + 40 QA defense + 16 Playwright route = 121 net new tests. All 65+40 vitest tests run under default `npm test`; routes.spec.ts correctly excluded from vitest glob and routed via `npm run test:a11y`. ✓
- **Rule 16** (NEW — manual a11y checklist): structurally consistent with prior rules; bidirectionally cross-referenced from `manual-test-checklist.md`. ✓

### Status

Review complete. Auto-resolved 1 LOW patch inline (comment-only). Deferred 2 LOWs to `deferred-work.md`. Story status moves from `review` → `done`.
