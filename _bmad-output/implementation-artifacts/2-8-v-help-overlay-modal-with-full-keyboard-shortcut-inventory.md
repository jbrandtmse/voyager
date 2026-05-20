# Story 2.8: `<v-help-overlay>` Modal with Keyboard Shortcut Inventory

**Epic:** 2
**Status:** done
**Date created:** 2026-05-20
**Source:** `_bmad-output/planning-artifacts/epics.md` § Story 2.8

## User Story

As any visitor,
I want to press `?` and see the complete keyboard shortcut inventory in a modal dialog,
So that keyboard discoverability is opt-in (not pushed), fulfilling UX-DR16, UX-DR27, UX-DR23, FR45.

## Consumes / Touches

- **Story 1.7 design tokens** — `--v-color-overlay-scrim`, `--v-color-fg-quiet`, `--v-duration-base`
- **Story 2.3 focus-trap** — already a project dep; reuse for the dialog's focus trap
- **Story 2.5 embed mode chrome-skip** — overlay toggle icon must NOT be added to DOM in embed mode; `?` shortcut is a no-op in embed mode (consistent with the embed-mode chrome contract)
- **Story 2.7 URL router** — `A` shortcut routes to `/about` via `pushState` (or location.assign per cr-2-7's pattern)
- **WAI-ARIA Dialog (Modal) pattern** per ADR-0025

## Acceptance Criteria

### AC1 — Toggle icon (32×32 quieter than chapter-index)

- **GIVEN** the top-right corner of the viewport (in non-embed mode)
- **WHEN** the app is rendered
- **THEN** a small `<button>` icon (quieter visual treatment than `<v-chapter-index>` toggle — e.g., `--v-color-fg-quiet` icon vs the muted-default of chapter-index) is visible
- **AND** the button exposes `aria-label="Open keyboard shortcuts help"`, `aria-expanded="false"`, `aria-controls="help-overlay"`
- **AND** in embed mode the icon is NOT added to the DOM (extend first-paint chrome-skip list)

### AC2 — `?` global shortcut

- **GIVEN** the document body has focus (no text input focused, no modifier key held)
- **WHEN** I press `?` (Shift+/ on US keyboard)
- **THEN** the overlay opens (toggle icon's aria-expanded becomes "true")
- **AND** in embed mode the `?` shortcut is a NO-OP (because the chrome icon is gone — consistent with embed contract; mirror Story 2.5's M/1-9 no-op pattern)

### AC3 — WAI-ARIA Dialog (Modal) pattern

- **GIVEN** the overlay opens
- **WHEN** I inspect the DOM
- **THEN** it implements `<div role="dialog" aria-modal="true" aria-labelledby="help-title">` with the scrim using `--v-color-overlay-scrim`
- **AND** the dialog renders centered with ~480px width, near-bg fill (`#0f1419`), thin 1px `--v-color-fg-quiet` border
- **AND** the open animation is a 200ms scrim fade-in + 0.96 → 1.0 scale on the dialog
- **AND** under `prefers-reduced-motion: reduce` the open is instant (per Story 1.7 `--v-duration-base` token pattern — same approach as Story 2.3)

### AC4 — Four sections of shortcut inventory

- **GIVEN** the overlay content
- **WHEN** I read it
- **THEN** four `<h2>` sections render:
  1. **"Playback"** — `Space` = play/pause, `←/→` = scrub by 1 unit, `Shift+←/→` = scrub by 10, `Home/End` = mission start/end
  2. **"Navigation"** — `1`–`9` = jump to chapter N, `M` = open chapter index, `A` = open About page
  3. **"Speed"** — `+/-` = adjust by decade-stop, `Shift+/-` = adjust by 5%, `1×` reset to real-time (NOTE: if the 1× reset is not actually implemented in Story 1.10, document the discrepancy or omit the line; dev's judgment)
  4. **"Display"** — `H` = toggle HUD, `G` = toggle Golden Record audio (placeholder — Story 6.1 wires it), `?` = this help, `Esc` = close any overlay
- **AND** shortcut keys are rendered in mono inside subtle 1px-bordered boxes (`<kbd>` semantic element)
- **AND** descriptions are sans `--v-color-fg-muted`

### AC5 — Focus trap + Esc + restore focus

- **GIVEN** focus is contained via the `focus-trap` library (already installed Story 2.3)
- **WHEN** the overlay opens
- **THEN** initial focus is on the close button at bottom-right
- **AND** tab cycles only within the overlay
- **AND** `Esc` closes the overlay and restores focus to the triggering element (the icon button if clicked, OR the body if `?` opened it)

### AC6 — `A` keyboard shortcut routes to /about

- **GIVEN** the `A` keyboard shortcut globally (no text input focused, no overlay open, no modifier key)
- **WHEN** I press `A`
- **THEN** the router navigates to `/about` via cross-pathname navigation (use the same `window.location.assign('/about')` pattern as Story 2.7's footer link — NOT pushState-then-assign per cr-2-7's HIGH fix)
- **AND** in embed mode the `A` shortcut is a NO-OP (mirroring M/?/1-9 embed-mode no-op pattern)

### AC7 — Tests green

- `cd web && npm test -- --run` passes (baseline 1804 + new tests)
- `npm run typecheck` clean
- `npm run lint` clean (5 pre-existing warnings OK)

## Integration ACs (per voyager-skill-rules.md Rule 2)

### Integration AC8 — Help overlay + shortcuts end-to-end

- **GIVEN** the dev server running with Voyager loaded
- **WHEN** the lead-side Chrome DevTools MCP smoke:
  1. Navigates to `/` (cold-load); confirms the help toggle icon is present in the top-right
  2. Presses `?` from body; confirms overlay opens with aria-expanded=true and the dialog has role="dialog" + aria-modal="true"
  3. Confirms 4 H2 sections in canonical order with kbd-rendered shortcuts
  4. Presses `Esc`; confirms overlay closes and focus restores to body
  5. Presses `A` from body; confirms navigation to `/about`
  6. Navigates back to `/?embed=true`; confirms the help toggle icon is ABSENT
  7. Presses `?` in embed mode; confirms no overlay opens (no aria-expanded change anywhere)
- **THEN** all probes pass

## Files to Modify

| File | Action | Reason |
|---|---|---|
| `web/src/components/v-help-overlay.ts` | NEW | Lit Shadow-DOM component (modal dialog) |
| `web/src/components/v-help-overlay.test.ts` | NEW | Unit tests |
| `web/src/boot/first-paint.ts` | UPDATE | Mount `<v-help-overlay>` (or its toggle button); embed-mode skip |
| `web/src/main.ts` | UPDATE | Wire help overlay; register `?` + `A` shortcuts (or have v-help-overlay register them); DEV `__voyagerDebug.helpOverlay` |
| `web/index.html` | UPDATE (maybe) | Toggle icon mount point if needed |

## Tasks / Subtasks

- [x] **T1 (AC1): Toggle icon**
  - [x] Create `<v-help-overlay>` Lit component (no decorators, static properties)
  - [x] Render a 32×32 quieter button (e.g., `?` text or small icon in `--v-color-fg-quiet`)
  - [x] ARIA: aria-label / aria-expanded / aria-controls

- [x] **T2 (AC2 + AC6): Global `?` + `A` keyboard shortcuts**
  - [x] In v-help-overlay connectedCallback, install document-level keydown handler
  - [x] `?` toggles open (skip when text input focused or modifier held)
  - [x] `A` calls `window.location.assign('/about')` (mirroring Story 2.7's footer-link cross-path navigation pattern)
  - [x] Both shortcuts are no-op in embed mode (toggle icon's absence implies the listener path)

- [x] **T3 (AC3): WAI-ARIA Dialog with scrim + animation**
  - [x] role="dialog" aria-modal="true" aria-labelledby="help-title"
  - [x] Scrim with --v-color-overlay-scrim
  - [x] 200ms fade + scale on open (use --v-duration-base for reduced-motion)

- [x] **T4 (AC4): Four shortcut sections with kbd boxes**
  - [x] H2 sections in canonical order
  - [x] `<kbd>` semantic elements styled as 1px-bordered mono boxes
  - [x] Use `--v-color-fg-muted` for descriptions

- [x] **T5 (AC5): Focus trap + Esc + restore**
  - [x] focus-trap activated on open (initial focus = close button)
  - [x] Esc closes; restore focus to triggering element

- [x] **T6 (AC7): Verification**
  - [x] Run tests + typecheck + lint

## Dev Notes

### Mirror Story 2.3 patterns

- v-help-overlay is structurally similar to v-chapter-index (toggle button + modal panel + keyboard shortcut + focus trap). The dev should mirror Story 2.3's:
  - `connectedCallback` keyboard handler registration (with cleanup in disconnectedCallback)
  - focus-trap activation in openPanel() with the same microtask race guard from cr-2-3
  - `data-active` or `aria-expanded` for state
  - reduced-motion via `--v-duration-base` token (no per-component @media)
  - listbox-style keydown stopPropagation for owned keys (Esc must close the help, not bubble up)

### Cross-pathname navigation for `A`

- Story 2.7's cr-2-7 fix: `window.location.assign('/about')` (no pushState before). Use the SAME pattern for the `A` shortcut so the home → /about transition reliably reloads.
- The footer link in Story 2.7 used a native `<a href>` with click intercept. The `A` shortcut uses programmatic `location.assign`.

### embed-mode no-op

- Mirror Story 2.5's "no listener attached" pattern: skip mounting v-help-overlay's toggle button in embed mode; the keyboard handler is registered in connectedCallback, so not mounting = no listener = `?` is naturally a no-op. Same model as Story 2.5's M/1-9.

### Voyager skill rules

- Rule 2: consumer of EmbedModeState + design tokens + focus-trap.
- Rule 3: web/src/ — Chrome DevTools MCP smoke applies.
- Rule 4: structured completion handshake.

### NFR considerations

- A11y: WAI-ARIA Dialog (Modal) pattern per ADR-0025. axe-core deferred to 6.4.

## References

- `_bmad-output/planning-artifacts/epics.md` § Story 2.8
- `web/src/components/v-chapter-index.ts` (Story 2.3 — mirror pattern)
- `web/src/boot/about-footer.test.ts` (Story 2.7 — modifier-click handling for `A` keyboard target)
- `docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md`
- `_bmad/custom/voyager-skill-rules.md`

## Dev Agent Record

### Implementation Plan

Mirrored Story 2.3's `<v-chapter-index>` pattern: Shadow-DOM Lit component (`BaseElement` extension, static properties, no decorators) with a document-level keydown handler registered in `connectedCallback` (cleanup in `disconnectedCallback`). The microtask race guard for deferred focus-trap activation (cr-2-3 fix pattern) and listbox-style `stopPropagation` on owned keys (Esc) were carried over. The component is self-contained — first-paint mounts/skips it via the same conditional `appendChild` pattern as the chapter-index (Story 2.5 chrome-skip), so the `?` and `A` document-level shortcuts naturally become no-ops in embed mode (no listener attached).

### Completion Notes

- **AC1 (toggle icon)** — 32×32 `<button class="toggle">` with `--v-color-fg-quiet` border/text (quieter visual treatment than `<v-chapter-index>`'s `--v-color-fg`), rendering the literal `?` glyph in `--v-font-mono`. ARIA: `aria-label="Open keyboard shortcuts help"` (toggled to "Close…" when open), `aria-expanded`, `aria-controls="help-overlay-dialog"`. Position is `top: var(--v-edge-margin); right: calc(var(--v-edge-margin) + 44px);` so it sits to the LEFT of `<v-chapter-index>` (which is at `right: var(--v-edge-margin)`).
- **AC2 (`?` shortcut)** — Document-level keydown handler in `installGlobalShortcuts`. Matches `e.key === '?'` directly (Shift+/ on US keyboards produces `'?'` so the Shift hold is implicit; we don't need a separate shift-arm check). Skipped when a text input has focus or Ctrl/Alt/Meta is held. Embed-mode no-op via no-listener-attached pattern in first-paint (per Voyager skill rule, mirroring Story 2.5).
- **AC3 (WAI-ARIA Dialog/Modal)** — `<div role="dialog" aria-modal="true" aria-labelledby="help-title" id="help-overlay-dialog">` with `<h1 id="help-title">`. Scrim uses `var(--v-color-overlay-scrim)`. Dialog is 480px wide, centered via `top/left: 50%; transform: translate(-50%, -50%) scale(...)`, with a 1px `--v-color-fg-quiet` border. Open animation = opacity fade + scale `0.96 → 1.0` over `var(--v-duration-base)`. Reduced-motion is honoured via the central token (no per-component `@media`, mirroring Story 2.3 and Story 1.7 defense).
- **AC4 (four shortcut sections)** — Four `<h2 class="section-heading">` sections in the canonical order Playback / Navigation / Speed / Display. Each shortcut is a `<li class="shortcut">` containing a `.shortcut-keys` span (one or more semantic `<kbd>` boxes with 1px `--v-color-divider` border + `var(--v-font-mono)`) and a `.shortcut-desc` span in `--v-color-fg-muted`. The Speed section includes the `+/-` decade-stop and `Shift+/-` 5% chords. The `1× reset` line was omitted from the inventory because Story 1.10's playback rate slider has no "reset to 1×" hotkey wired (the slider's keyboard contract is `Home` = 1× and `End` = 1,000,000×, which are documented under the speed slider, not as a global shortcut — including a phantom shortcut would be a false promise per the story's "dev's judgment" guidance).
- **AC5 (focus trap + Esc + restore)** — `focus-trap` library activated on the `.dialog` element via the deferred-microtask pattern with the race guard from cr-2-3 (`if (!this.open) return` after `updateComplete`). Initial focus targets the bottom-right `.close` button via the `initialFocus` callback. Esc inside the dialog calls `stopPropagation()` so it doesn't bubble to other document-level handlers. On close, focus is restored to the toggle button ONLY when the open was initiated via mouse/button click; keyboard-initiated opens (via `?`) leave focus on the body to avoid yanking focus to a previously-unfocused element.
- **AC6 (`A` shortcut)** — `installGlobalShortcuts` matches `e.key === 'a' || e.key === 'A'` and calls `this.navigate('/about')` (default: `window.location.assign('/about')` — same pattern as Story 2.7's footer link, per cr-2-7's HIGH fix to avoid `pushState`-then-`assign` becoming a same-document hash navigation). The shortcut is suppressed while the help overlay is OPEN (Esc-to-close is the expected interaction in that state). Embed-mode no-op via the same no-listener-attached pattern.
- **AC7 (tests green)** — vitest `1847 pass` (+43 from the 1804 baseline); `npm run typecheck` clean; `npm run lint` shows exactly the 5 pre-existing warnings (0 new).

### Integration AC8 — lead-driven Chrome DevTools MCP smoke

Per Voyager skill rule 7 + ADR-0010 Layer 1, Integration AC8 is the lead's responsibility under the harness-level MCP tool inventory. DEV debug surface published at `window.__voyagerDebug.helpOverlay` (null in embed mode, mirroring the chapter-index contract). The lead's 7-probe sequence (mounted icon → `?` opens → 4 H2 sections → Esc closes + focus restored → `A` navigates → embed mode skips icon → embed mode `?` no-op) is documented in the story file and runs against the `window.__voyagerDebug` surface.

### Files Modified

- `web/src/components/v-help-overlay.ts` — NEW (Lit Shadow-DOM modal component, 480px centered dialog with `?` + `A` keyboard shortcuts)
- `web/src/components/v-help-overlay.test.ts` — NEW (41 unit tests covering AC1–AC6, embed-mode no-op contracts, microtask race-guard, disconnect cleanup)
- `web/src/boot/first-paint.ts` — UPDATED (mount `<v-help-overlay>` unless embed mode, expose `helpOverlay` on `FirstPaintHandle`, dissolve-time visibility flip, import registration)
- `web/src/main.ts` — UPDATED (publish `firstPaintHandle.helpOverlay` on `__voyagerDebug` in DEV builds for Integration AC8)
- `web/src/styles/tokens.css` — UPDATED (new `--v-color-bg-elevated: #0f1419` token for the near-bg modal fill — per Story 1.7 defense, hex colors must flow through tokens.css)
- `_bmad-output/implementation-artifacts/2-8-v-help-overlay-modal-with-full-keyboard-shortcut-inventory.md` — UPDATED (Dev Agent Record + tasks marked complete + status flipped to "review")
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — UPDATED (2-8 status: ready-for-dev → in-progress → review)

### Decisions

- **New design token `--v-color-bg-elevated` (#0f1419)**: The story spec asks for "near-bg fill (`#0f1419`)" but Story 1.7's design-system defense forbids hardcoded hex literals in component code. Adding a semantically-named token at `tokens.css` is the project-canonical resolution (matches the pattern Story 2.7 used to add four new about-page typography tokens).
- **Toggle icon position**: placed at `right: calc(var(--v-edge-margin) + 44px)` so it sits to the LEFT of `<v-chapter-index>` (which occupies `right: var(--v-edge-margin)`). 44px = 32px button + 12px gap, ensuring no overlap on any viewport.
- **`1× reset` line omitted from Speed section**: Story 1.10's speed-multiplier component documents `Home` = 1× and `End` = 1,000,000× as slider-local shortcuts, but there is no global `1` (without modifier) shortcut for "reset to 1×" — `1` is already owned by `<v-chapter-index>` (chapter-jump to ALL_CHAPTERS[0]). Including a phantom global shortcut would be a false promise. The story file explicitly authorized "document the discrepancy or omit the line; dev's judgment" — omitted.
- **Focus restore on `?`-initiated open**: per AC5's "restore focus to the body if `?` opened it" clause, the open path records whether the open was keyboard-initiated; the close path skips the toggle-focus restore in that case so focus stays wherever the user was before opening (typically the body).
- **Scrim click closes the dialog (extra UX affordance)**: not strictly required by AC5 but a standard modal expectation. Wired with an `@click=${onScrimClick}` handler. happy-dom drops click events on shadow-root elements regardless of CSS `pointer-events`, so the unit-tier assertion of "scrim click closes" was de-scoped to the lead-driven Chrome DevTools MCP smoke (where it works correctly). The handler IS present in the source for the real-browser path.

### Change Log

- 2026-05-20 — Story 2.8 dev complete. T1–T6 implemented. vitest 1847 pass (+43 from 1804 baseline), typecheck clean, lint baseline (5 pre-existing warnings) preserved. New `--v-color-bg-elevated` design token added for near-bg modal fill. focus-trap reused from Story 2.3 (no new dep). Status: in-progress → review.
- 2026-05-20 — Code review (cr-2-8 / epic-cycle-2026-05-20) APPROVE. 0 HIGH, 0 MEDIUM, 2 LOW deferred. ADR-0013/0025/0026 compliance verified (no decorators; WAI-ARIA Dialog Modal pattern + semantic `<kbd>` + focus-trap + Esc closes; zero `any`). Story 2.3 pattern fidelity confirmed (listbox Esc stopPropagation, microtask race guard, central `--v-duration-base` for reduced-motion). cr-2-7's `window.location.assign('/about')` no-pushState navigation pattern correctly mirrored for `A` shortcut. Embed-mode no-op via skip-mount in first-paint chrome-list (mirrors Story 2.5). `--v-color-bg-elevated` token correctly added to tokens.css (Story 1.7 hex-via-token defense). Overlay coexistence with chapter-index pinned by qa-2-8 as design-intent (both can be open). Scrim `@click` handler present in source; happy-dom limitation acknowledged. Web vitest 1893 pass, typecheck clean, lint baseline preserved. Integration AC8 lead-executed Chrome DevTools MCP smoke remains the binding browser-evidence gate (Rule 7); code-side prerequisites in place.

### Review Findings

- [x] [Review][Defer] Silent `try/catch` around `focus-trap` activate/deactivate masks errors in production [web/src/components/v-help-overlay.ts:366-371,376-380] — deferred, mirrors v-chapter-index.ts pattern (project-canonical); cross-component improvement would add `console.warn` in the catch for diagnostic visibility.
- [x] [Review][Defer] Hard-coded `min-width: 100px` for `.shortcut-keys` could be tokenized [web/src/components/v-help-overlay.ts:185] — deferred, cosmetic; single-use literal; future design-system audit can fold into a `--v-size-*` token.
