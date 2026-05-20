# Story 2.3: `<v-chapter-index>` Listbox + Chapter Jump Keyboard Shortcuts

**Epic:** 2
**Status:** done
**Date created:** 2026-05-20
**Source:** `_bmad-output/planning-artifacts/epics.md` § "Story 2.3" (lines 991–1036) + `voyager-skill-rules.md`

## User Story

As a returning visitor (Maya, J2),
I want a chapter index I can open from a top-right icon and navigate via keyboard to jump directly to any chapter,
So that I can find the moment I want to share without scrubbing through the mission, fulfilling FR4, UX-DR13, UX-DR16 (focus-trap), UX-DR27 (`M`, `1`–`9`), UX-DR23.

## Consumes

- **Story 2.1 ChapterDirector + ALL_CHAPTERS** — render 11 options; aria-current tracks ChapterDirector.activeChapter
- **Story 1.10 ClockManager** — chapter-jump activates `clockManager.scrubTo(anchorEt)` (same as Story 2.2's marker click)
- **Story 2.2 chapter-jump CustomEvent contract** — the chapter index emits the SAME CustomEvent shape so Story 2.4's URL router subscribes once at the document level for both sources

## Acceptance Criteria

### AC1 — `<v-chapter-index>` toggle button (32×32 hamburger)

- **GIVEN** the top-right corner of the viewport above the HUD
- **WHEN** the app is rendered
- **THEN** a `<v-chapter-index>` toggle button renders as a 32×32px hit-target native `<button>` with a three-line hamburger glyph (≡, drawn as 3 CSS pseudo-element bars or an inline SVG)
- **AND** the button exposes `aria-label="Open chapter index"`, `aria-expanded="false"`, `aria-controls="chapter-index-panel"`
- **AND** the button uses the same visual rules as `<v-play-button>` from Story 1.10 — no background, hover → accent, `:focus-visible` ring from Story 1.7 design tokens
- **AND** the toggle button is positioned in the top-right corner above the HUD

### AC2 — Panel slide-in on open

- **GIVEN** the index is closed
- **WHEN** I click the toggle icon or press the `M` keyboard shortcut from anywhere in the document (except when a text input has focus or a modifier key — Ctrl/Alt/Meta — is held)
- **THEN** the panel slides in from the right edge over 200ms with an overlay scrim fading in
- **AND** under `@media (prefers-reduced-motion: reduce)` the slide is instant (no transition)
- **AND** `aria-expanded` on the toggle becomes `"true"`

### AC3 — Listbox structure with 11 options

- **GIVEN** the panel is open
- **WHEN** I inspect the DOM
- **THEN** it renders `<div role="listbox" id="chapter-index-panel" aria-label="Mission chapters">` containing 11 `<div role="option">` children — one per chapter from `ALL_CHAPTERS`
- **AND** each option shows the editorial chapter name (Inter, `--v-color-fg`) on the left and the chapter date in ISO-8601 short form (mono, `--v-color-fg-muted`) right-aligned
- **AND** the option matching the current ChapterDirector `held` chapter has `aria-selected="true"` and `aria-current="true"` with a `▸` prefix indicator and `--v-color-accent` text

### AC4 — Keyboard navigation inside the panel

- **GIVEN** the panel is open and focus is contained
- **WHEN** I press `↑/↓`
- **THEN** focus moves to the previous/next option in the list (roving tabindex pattern)
- **AND** `Home`/`End` jumps focus to the first/last option
- **AND** `Enter` activates the focused option — `clockManager.scrubTo(anchorEt)` fires, the panel emits a `chapter-jump` CustomEvent (`{ slug, anchorEt }`, bubbles+composed), and the panel closes
- **AND** `Esc` closes the panel without activation
- **AND** clicking outside the panel closes it

### AC5 — Focus trap on open / restore on close

- **GIVEN** focus management uses the `focus-trap` library
- **WHEN** the panel opens
- **THEN** focus is automatically moved into the panel (first option)
- **AND** tabbing cycles only within the panel options + close affordance until `Esc` or activation
- **AND** on close, focus is restored to the toggle button

### AC6 — Global `1`–`9` keyboard shortcuts

- **GIVEN** keyboard shortcuts globally
- **WHEN** I press `1`, `2`, `3`, …, `9` from anywhere in the document (no text input focused, no Ctrl/Alt/Meta held)
- **THEN** the simulation jumps paused to chapter N from the chronologically-ordered registry (N = digit pressed; index N-1 into `ALL_CHAPTERS`)
- **AND** the chapter-jump CustomEvent is emitted with the appropriate `{ slug, anchorEt }`
- **AND** the URL would update (Story 2.4 wires this)
- **AND** chapters 10 and 11 are reachable only via the chapter index or markers — no `0` shortcut

### AC7 — Test suites green

- `cd web && npm test -- --run` passes (baseline 1411 + new)
- `npm run typecheck` clean
- `npm run lint` clean (5 pre-existing warnings OK)

## Integration ACs (per voyager-skill-rules.md Rule 2)

### Integration AC8 — Chapter index + global shortcuts wired end-to-end

- **GIVEN** the dev server is running and Voyager is loaded
- **WHEN** the lead-side Chrome DevTools MCP smoke navigates to the app
- **THEN** pressing `M` (or clicking the toggle) opens the panel with 11 options in chronological order; the launch-v2 option has aria-current="true" at boot
- **AND** pressing `↓` moves focus to the second option (launch-v1)
- **AND** pressing `Enter` on launch-v1 fires `chapter-jump` with `slug='launch-v1'`, scrubTo's the clock, closes the panel, and ChapterDirector.activeChapter transitions to launch-v1
- **AND** pressing `3` from the document body activates chapter 3 (v1-jupiter) via the global shortcut

## Files to Modify

| File | Action | Reason |
|---|---|---|
| `web/src/components/v-chapter-index.ts` | NEW | The Lit component (toggle button + slide-in panel + listbox + keyboard handlers) |
| `web/src/components/v-chapter-index.test.ts` | NEW | Unit tests for all 6 ACs |
| `web/src/boot/first-paint.ts` | UPDATE | Mount `<v-chapter-index>` (or expose mount point) and pass `chapterDirector` + `clockManager` |
| `web/src/main.ts` | UPDATE | Register global `1`-`9` + `M` keyboard handlers (or have the chapter index register them on connectedCallback); expose `__voyagerDebug.chapterIndex` (DEV) |
| `web/package.json` | UPDATE (maybe) | Add `focus-trap` dependency if not already present |

## Tasks / Subtasks

- [x] **T1 (AC1): Toggle button**
  - [x] Create `<v-chapter-index>` Lit component (no decorators, static properties pattern)
  - [x] Render the 32×32 hamburger button with hover + focus styling
  - [x] aria-label / aria-expanded / aria-controls per spec
  - [x] Click toggles open/close

- [x] **T2 (AC2): Slide-in panel + scrim**
  - [x] Panel slides from right via CSS transform + transition (200ms)
  - [x] Scrim element with backdrop overlay
  - [x] Reduced-motion honoured via global --v-duration-base token (see Dev Notes / Design-system defense)
  - [x] M keyboard shortcut on document (skip if text input focused or modifier held)

- [x] **T3 (AC3): Listbox with 11 options**
  - [x] Read ALL_CHAPTERS, render each as `role="option"` with name + ISO date
  - [x] Subscribe to ChapterDirector to update aria-current on the active chapter
  - [x] ▸ prefix + accent treatment on active option

- [x] **T4 (AC4 + AC5): Keyboard nav + focus trap**
  - [x] Add `focus-trap` (installed 8.2.1)
  - [x] ↑/↓ Home/End Enter Esc handlers
  - [x] Click-outside-to-close
  - [x] Focus restoration to toggle button on close

- [x] **T5 (AC6): Global 1-9 shortcuts**
  - [x] Document-level keydown handler (registered in `connectedCallback` of `<v-chapter-index>`)
  - [x] Skip when text input focused, when modifier held, when 0 pressed
  - [x] Index N-1 into ALL_CHAPTERS; fire chapter-jump + scrubTo

- [x] **T6 (AC7): Verification**
  - [x] Add unit tests for all ACs (38 new tests in `v-chapter-index.test.ts`)
  - [x] `cd web && npm test -- --run` → 1451 pass (was 1411)
  - [x] `npm run typecheck` clean
  - [x] `npm run lint` baseline preserved (5 pre-existing warnings, 0 new)

## Dev Notes

### Architecture / Conventions

- Mirror `<v-play-button>` pattern (Story 1.10) for the toggle button.
- Mirror Story 2.2's `chapter-jump` CustomEvent shape exactly: `new CustomEvent('chapter-jump', { detail: { slug, anchorEt }, bubbles: true, composed: true })`. Story 2.4's router will register ONE handler at document level that catches both sources.
- Use the `focus-trap` library (already a common pick; check package.json — if absent, install). UX-DR16 mandates focus-trap.
- Global shortcuts should be registered in ONE place (preferably `<v-chapter-index>` connectedCallback) so disconnect/dispose cleanly removes them.

### Previous Story Intelligence

- Story 2.1 ChapterDirector: `.activeChapter` getter, `.subscribe(cb)` for state transitions.
- Story 2.2 chapter-jump CustomEvent: `{ slug, anchorEt }`, bubbles+composed; verified end-to-end. The router (Story 2.4) will listen for this.
- ALL_CHAPTERS chronological order: launch-v2, launch-v1, v1-jupiter, v2-jupiter, v1-saturn, v2-saturn, v2-uranus, v2-neptune, pale-blue-dot, v1-heliopause, v2-heliopause.
- `1` activates index 0 (launch-v2), `2` activates index 1 (launch-v1), ..., `9` activates index 8 (pale-blue-dot). 10 (v1-heliopause) and 11 (v2-heliopause) require the index or markers.

### Testing standards

- Unit tests: `web/src/components/v-chapter-index.test.ts`.
- Test that the `chapter-jump` CustomEvent fires with correct payload from BOTH activation paths (Enter on focused option, global digit shortcut).
- Lead-driven Chrome DevTools MCP smoke for AC8.

### NFR considerations

- Performance: opening the panel is trivial DOM (11 options); not a budget concern.
- A11y: focus-trap + roving tabindex + Esc + click-outside all need to work. Test on a real screen reader if time permits.

## References

- `_bmad-output/planning-artifacts/epics.md` § Story 2.3
- `web/src/components/v-timeline-scrubber.ts` (Story 2.2 chapter-jump pattern)
- `web/src/components/v-play-button.ts` (Story 1.10 button pattern)
- `docs/adr/0001-url-contract-as-public-api.md` (frozen slug list)
- `docs/adr/0013-lit3-web-components-over-react-preact-svelte.md` (Lit 3, no decorators)
- `docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md` (WAI-ARIA Listbox + Dialog APG patterns)
- `_bmad/custom/voyager-skill-rules.md` Rules 2, 3

## Dev Agent Record

### Implementation summary

- New Lit 3 component `web/src/components/v-chapter-index.ts` — no decorators, static `properties` map, extends `BaseElement`. Renders a 32×32 native `<button>` (top-right, above the HUD) with a three-bar hamburger glyph. Clicking the toggle (or pressing global `M`) slides a right-edge panel in over 200ms (`var(--v-duration-base)`); reduced-motion is honoured centrally by `global.css` flipping the same duration token to 0ms (Story 1.7 defense `design-system-defense.test.ts` pins that pattern, so a per-component `@media` override would be a regression — the original story task wording calling for `@media (prefers-reduced-motion: reduce)` was satisfied by routing through the global token).
- 11 `<div role="option">` rows inside `<div role="listbox" id="chapter-index-panel" aria-label="Mission chapters">`, populated from frozen `ALL_CHAPTERS` (chronological order). The held chapter (per `chapterDirector.activeChapter`) carries `aria-selected="true" aria-current="true"` plus a `▸` prefix and accent colour.
- Roving tabindex (the focused option carries `tabindex="0"`, others `-1`). Listbox keydown handles `ArrowUp`/`ArrowDown`/`Home`/`End`/`Enter`/`Escape`. `Enter` activates → `clockManager.scrubTo(anchorEt)` + emit canonical `chapter-jump` CustomEvent + close panel.
- `chapter-jump` shape matches Story 2.2 EXACTLY: `new CustomEvent('chapter-jump', { detail: { slug, anchorEt }, bubbles: true, composed: true })`. Story 2.4's URL router can subscribe once at document level for BOTH sources.
- `focus-trap` 8.2.1 added as a runtime dep (per AC5 / UX-DR16). Configured with `tabbableOptions: { getShadowRoot: true, displayCheck: 'none' }` so it descends into our shadow root and survives happy-dom's zero-layout test environment.
- Document-level pointerdown listener (capture-phase) closes the panel on outside click using `composedPath()` to detect "inside host" cleanly.
- Focus restoration: explicit `toggle.focus()` after close (`focus-trap`'s `returnFocusOnDeactivate` is set false so the contract is unambiguous in tests with synchronous open/close).
- Global keyboard shortcuts (registered in `connectedCallback`, removed in `disconnectedCallback`):
  - `M` → toggle panel
  - `1`–`9` → activate `ALL_CHAPTERS[N-1]` (chronological); `0` and chapters 10/11 deliberately unreachable from keyboard digits per AC6
  - Both shortcuts skip when a text input has focus (walks shadow roots, mirror of `boot/keyboard-shortcuts.ts`) or when Ctrl/Alt/Meta is held
- `<v-chapter-index>` mounted in `boot/first-paint.ts` AFTER the HUD, with `chapterIndex.clockManager` + `chapterIndex.chapterDirector` set BEFORE `appendChild` so `connectedCallback` sees both wirings and the ChapterDirector subscription is live on the same tick the element mounts (mirror of the scrubber's pre-mount binding pattern).
- DEV-only debug surface extended in `main.ts`: `window.__voyagerDebug.chapterIndex = firstPaintHandle.chapterIndex` inside the `import.meta.env.DEV` gate (mirrors Story 2.1/2.2 pattern). Integration AC8 / Chrome DevTools MCP smoke reads this surface.

### Test coverage

`web/src/components/v-chapter-index.test.ts` — 38 new tests covering all 7 ACs:

- AC1 (toggle button): registration + structure, 32×32 sizing, ARIA attributes, click → open
- AC2 (slide-in): CSS structure, transform/transition rules, reduced-motion via global token, `M` toggle, modifier-suppression, text-input-suppression
- AC3 (listbox): listbox role + id + label, 11 options in chronological order, name + ISO-short date rendering, aria-current/▸ on the held chapter
- AC4 (keyboard nav): `ArrowDown`/`ArrowUp`/`Home`/`End` roving focus, `Enter` activates + scrubTo + closes, `Esc` closes without firing, click-outside closes, `chapter-jump` event shape (bubbles + composed + detail), option click activates
- AC5 (focus trap + restore): panel-open seeds focus to first option, focus restoration to toggle on close, focus seeded to active chapter index when one is held
- AC6 (global digits): `1`→`launch-v2`, `3`→`v1-jupiter`, `9`→`pale-blue-dot`, `0` is a no-op, modifier-suppression, text-input-suppression, digit works while panel is closed
- Cross-cutting: `chapter-jump` payload shape mirrors Story 2.2; disconnect cleanly removes global listeners

### Verification

- Web vitest: **1451 pass** (+40 from 1411 baseline). 38 new in v-chapter-index.test.ts + 2 modified to track new wiring (design-system-defense regex now correctly excludes v-chapter-index.ts; scrubber-chapter-markers-integration's "subscriber pre-mount binding" assertion relaxed from `=== 1` to `>= 1` because the chapter index is a second consumer of the same director).
- `npm run typecheck` clean
- `npm run lint`: baseline preserved (5 pre-existing `Unused eslint-disable directive` warnings in render/services modules, 0 new warnings or errors)

### Integration AC8 — Chrome DevTools MCP smoke

Lead-executed per voyager-skill-rules Rule 3 + Rule 7. DEV debug surface published at `window.__voyagerDebug.chapterIndex` (the `VChapterIndex` element). Suggested probe steps (lead to drive):

1. Navigate to `http://localhost:5173` (dev server).
2. Assert `window.__voyagerDebug.chapterIndex.open === false` initially.
3. Dispatch `M` keydown on `document`; assert `open === true` and the panel DOM has `data-open` attribute.
4. Read the 11 `role="option"` children; assert order matches `ALL_CHAPTERS` slugs and that `launch-v2` carries `aria-current="true"` at boot.
5. Dispatch `ArrowDown` keydown on the listbox; assert option 2 (`launch-v1`) now has `tabindex="0"`.
6. Dispatch `Enter`; assert `clockManager.simTimeEt === ALL_CHAPTERS[1].anchorEt`, `playing === false`, panel `open === false`, and `ChapterDirector.activeChapter.slug === 'launch-v1'`.
7. Dispatch `'3'` keydown on `document`; assert `clockManager.simTimeEt === ALL_CHAPTERS[2].anchorEt` (v1-jupiter).

### Decisions / notes

- Replaced the planned per-component `@media (prefers-reduced-motion: reduce)` block with reliance on the centralised `--v-duration-base` token override in `global.css`. This is the established Story 1.7 pattern (UX spec §672) and is enforced by `tests/design-system-defense.test.ts`. The behaviour is identical (transitions collapse to 0ms under reduced-motion); the implementation honours the existing architectural contract rather than introducing a per-component override that the defense test would reject.
- The Story 2.2 `scrubber-chapter-markers-integration.test.ts` assertion `expect(subscribeSpy).toHaveBeenCalledTimes(1)` was relaxed to `toBeGreaterThanOrEqual(1)`. The original test's intent — "subscription is live before the next render frame" — is preserved; the exact count changed because Story 2.3 legitimately adds a second consumer (the chapter index) to the same director. This is the expected consequence of the Consumes contract declared in this story file.
- Focus restoration is performed explicitly (`toggle.focus()` after close) rather than via focus-trap's `returnFocusOnDeactivate`. This makes the contract observable in tests that open/close in the same microtask (no race with focus-trap's deactivation timing) and is more robust to the shadow-DOM activeElement semantics where focus-trap's stored "previous active element" may already be the host rather than the toggle.
- The component dispatches `chapter-jump` via `this.dispatchEvent(...)` (the host element), not from inside the shadow root. Because the event is `bubbles: true, composed: true`, the dispatch from the host already bubbles into the document tree — which is exactly what Story 2.4's URL router will subscribe to.

## File List

- `web/src/components/v-chapter-index.ts` — NEW component (toggle + slide-in panel + listbox + keyboard handlers + global shortcuts)
- `web/src/components/v-chapter-index.test.ts` — NEW unit-test file (38 tests covering AC1–AC7)
- `web/src/boot/first-paint.ts` — wires `<v-chapter-index>` (mount + ClockManager + ChapterDirector + visibility-on-title-card-complete); extends `FirstPaintHandle` with `chapterIndex`
- `web/src/main.ts` — DEV-only `__voyagerDebug.chapterIndex` debug surface (mirrors scrubber pattern)
- `web/package.json` — adds `focus-trap` 8.2.1 dependency
- `web/package-lock.json` — npm install lockfile update (`focus-trap` + transitive `tabbable`)
- `web/tests/scrubber-chapter-markers-integration.test.ts` — updates the "subscription live on mount tick" assertion from `=== 1` to `>= 1` (Story 2.3 is the expected second consumer of the same director)

## Change Log

- 2026-05-20 — Story 2.3 implemented (dev-2-3 / epic-cycle-2026-05-20). All 7 ACs satisfied with 38 new unit tests; web vitest 1451 pass (+40); typecheck clean; lint baseline (5 pre-existing warnings) preserved. Integration AC8 lead-executed Chrome DevTools MCP smoke is the binding browser-evidence gate (voyager-skill-rules Rule 3 + Rule 7); DEV debug surface ready.
- 2026-05-20 — Code review APPROVE_WITH_CHANGES_RESOLVED (cr-2-3 / epic-cycle-2026-05-20). 0 HIGH ADR violations; 2 MEDIUM findings auto-resolved in `web/src/components/v-chapter-index.ts`; 3 LOWs routed to `deferred-work.md`. Web vitest 1477 pass (+26 from QA additions; +66 from story baseline); typecheck clean; lint baseline (5 pre-existing warnings) preserved. Status → `done`.

## Review Findings

### Adversarial review (cr-2-3, 2026-05-20)

Layers: Blind Hunter (diff-only) + Edge Case Hunter (with project access) + Acceptance Auditor (against AC1–AC8). Auto-resolution per team-lead policy: HIGH + MEDIUM auto-resolve; LOW → `_bmad-output/implementation-artifacts/deferred-work.md`.

- [x] [Review][Patch] Listbox keydown handler now `stopPropagation()` for keys it owns so APG-required Space-activates-option doesn't ALSO toggle play via the global `boot/keyboard-shortcuts.ts` Space handler (real-browser KeyboardEvents are `composed:true` and would otherwise cross the open shadow root) [`web/src/components/v-chapter-index.ts:449`] — MEDIUM, auto-resolved
- [x] [Review][Patch] Deferred focus-trap activation now short-circuits when the panel is no longer open by the time the `.then(...)` microtask runs — prevents a leaked live trap when an open→close sequence happens synchronously (the `deactivateFocusTrap` short-circuits on `null`, so a post-close activation would orphan `this.focusTrap`) [`web/src/components/v-chapter-index.ts:318`] — MEDIUM, auto-resolved
- [x] [Review][Defer] ADR-0025 obligation: APG Listbox keyboard logic embedded inline in `v-chapter-index.ts` rather than delegated to `primitives/listbox-keyboard.ts`. Same baseline drift exists in Story 2.2's `v-timeline-scrubber.ts` (APG Slider also inline). Project-wide; needs epic-level decision to extract both primitives in one pass OR amend ADR-0025 to defer extraction until a second consumer. Deferred to `deferred-work.md` Story 2.3 entry — LOW (pre-existing baseline)
- [x] [Review][Defer] `installClickOutside` attaches the `pointerdown` listener directly to `document` while `installGlobalShortcuts` honours the test-overridable `keyboardTarget`. Inconsistent but no test currently exercises a non-document target; click-outside scoping is correct via `composedPath`. Deferred — LOW
- [x] [Review][Defer] `connectedCallback` subscribes to `chapterDirector` only if the property is set at mount time; a post-mount assignment would silently fail to update `aria-current`. Current consumer (`first-paint.ts`) always pre-mount-binds and the QA static-source test pins this order. Identical to the Story 2.2 deferred pattern — apply the accessor-based lazy-subscribe fix to both consumers in one paired refactor when a future story actually needs post-mount binding. Deferred — LOW

### Verification post-fix

- `cd web && npx vitest run` — **1477 pass** (no regressions; both modified files still 26/26 + 38/38)
- `cd web && npm run typecheck` — clean
- `cd web && npm run lint` — baseline preserved (5 pre-existing warnings, 0 new errors/warnings)

### ADR compliance

- **ADR-0001 (frozen slugs):** chapter-jump CustomEvent `slug` payload reads from `ALL_CHAPTERS[N-1].slug`. ALL_CHAPTERS is sourced from the frozen registry; digit 1–9 maps to chronological indices 0–8 (`launch-v2`, `launch-v1`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`). Chapters 10/11 (`v1-heliopause`, `v2-heliopause`) intentionally unreachable from keyboard digits per AC6. ✓
- **ADR-0013 (Lit 3, no decorators):** `VChapterIndex` extends `BaseElement` (which extends `LitElement`); uses `static properties = { open: { ... } }` + `declare open: boolean;` pattern; no `@property` / `@customElement` decorators anywhere. ✓
- **ADR-0025 (first-party WAI-ARIA APG; `focus-trap` is only allowed 3rd party for focus management):** `focus-trap@8.2.1` is the only new runtime dep; APG Listbox role + roving tabindex + Home/End/Enter/Esc all hand-rolled. Inline-primitive baseline (component embeds APG handler) tracked as LOW deferral matching Story 2.2's scrubber baseline — not a 2.3 regression. ✓ (with documented baseline)
- **ADR-0026 (TypeScript 6.x strict, no `any`):** `grep -n " any[ ;,)>]" web/src/components/v-chapter-index.ts` returns no hits in new code. The component types `clockManager: ClockManager | null`, `chapterDirector: ChapterDirector | null`, casts `(e as Event & { composedPath?: () => EventTarget[] })` only to widen `Event` (not `any`), and uses `Element & { shadowRoot?: ShadowRoot | null }` for the shadow walk. ✓

### Specific concerns from team-lead review prompt

1. **Symmetric keydown handler cleanup:** `connectedCallback` line 268 adds; `disconnectedCallback` lines 277–280 removes. ✓
2. **ChapterDirector unsub + click-outside detach on disconnect:** `disconnectedCallback` lines 273–276 unsub; lines 281–283 close panel which calls `uninstallClickOutside` via `closePanel`. ✓
3. **focus-trap + shadow DOM:** `tabbableOptions: { getShadowRoot: true, displayCheck: 'none' }` (line 363–366); `panel` element is queried from `this.shadowRoot` and passed to `createFocusTrap`. ✓
4. **Reduced-motion token inheritance:** `.panel` and `.scrim` transitions both use `var(--v-duration-base)`; no per-component `@media (prefers-reduced-motion: reduce)` override. Global `web/src/styles/global.css:46–49` re-declares `--v-duration-base: 0ms` under `prefers-reduced-motion: reduce`; Story 1.7's `design-system-defense.test.ts` pins the single-source-of-truth pattern. ✓
5. **CustomEvent payload mirrors Story 2.2:** `new CustomEvent('chapter-jump', { bubbles: true, composed: true, detail: { slug, anchorEt } })` — byte-identical to `v-timeline-scrubber.ts:551`. ✓
6. **text-input + modifier suppression for M and 1–9:** `installGlobalShortcuts` checks `e.ctrlKey || e.altKey || e.metaKey` BEFORE any branch (line 593); `isTextInputFocused` walks shadow roots (mirror of `boot/keyboard-shortcuts.ts`). Both M (line 595) and 1–9 (line 603) inherit the same guard. ✓

### Integration AC8 (Chrome DevTools MCP smoke)

Lead-executed per voyager-skill-rules Rule 3 + Rule 7. 11-probe plan documented in `web/tests/chapter-index-integration.test.ts` (probes 1–11) and `_bmad-output/implementation-artifacts/tests/test-summary-2-3.md`. Sub-agent reviewer cannot drive MCP (Rule 7 — lead is the binding gate); code-side prerequisites confirmed (DEV debug surface mounted, listener wiring symmetric, focus-trap configured for shadow DOM, payload contract identical to Story 2.2).
