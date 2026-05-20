# Test Automation Summary — Story 2.8

**Story:** `<v-help-overlay>` Modal + keyboard shortcut inventory
**Date:** 2026-05-20
**QA agent:** qa-2-8 (epic-cycle-2026-05-20)

## Scope

The dev-authored test suite for Story 2.8 covers AC1–AC6 at the unit
tier in a single file (41 new tests total):

- `web/src/components/v-help-overlay.test.ts` — 41 unit tests for
  custom-element registration + BaseElement inheritance, toggle
  button structure / ARIA attributes / 32×32 sizing / click-opens
  (AC1), `?` global keyboard shortcut + Ctrl/Alt/Meta modifier
  guards + text-input focus guard + embed-mode no-listener-attached
  no-op (AC2), WAI-ARIA Dialog (Modal) pattern with
  `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + 480px
  width + `--v-color-fg-quiet` border + `--v-color-bg-elevated`
  fill + scrim `--v-color-overlay-scrim` + `--v-duration-base`
  scale-fade transition + reduced-motion via global token (AC3),
  four shortcut sections in canonical order with `<kbd>` boxes +
  `--v-color-fg-muted` descriptions + spot-check key inventory
  (AC4), focus-trap activation + initial close-button focus + Esc
  closes + Esc stopPropagation + bidirectional focus-restore
  (button-click open → restore to toggle; keyboard `?` open →
  leave on body) (AC5), `A` shortcut routes via navigate callback
  + uppercase variant + Ctrl/Alt/Meta guards + text-input guard +
  overlay-open suppression + embed-mode no-listener-attached
  no-op (AC6), disconnect cleanup (listener detach + open-overlay
  graceful close), and the cr-2-3 microtask race-guard for
  synchronous open→close sequences.

This QA stage fills cross-cutting gaps the dev suite does not
exercise:

- **Full-stack first-paint composition (Integration AC8 step 1)** —
  the dev test exercises `<v-help-overlay>` in isolation. The QA
  tier composes the FULL stack (real `EmbedModeState` × `URLSync` ×
  `ClockManager` × `ChapterDirector` × `URLRouter` ×
  `startFirstPaint`) at `/`, `/c/<slug>`, and `/?embed=true` /
  `/c/<slug>?embed=true`, verifying the help overlay is mounted as
  part of the chrome AND that the `helpOverlay` slot in
  `FirstPaintHandle` resolves to the same DOM instance. Catches a
  future regression where one seam (`first-paint.ts`) is updated
  but another (the FirstPaintHandle exposed to main.ts's debug
  surface) is missed.

- **Embed-mode composition no-op (AC2 + AC6 cold-load)** — the dev
  suite asserts the no-listener-attached contract for an unmounted
  element. The QA tier pins the same contract at the COMPOSITION
  tier: at `/?embed=true` and `/c/<slug>?embed=true`, the full
  `startFirstPaint` pipeline produces a `FirstPaintHandle` with
  `helpOverlay === null`, NO `v-help-overlay` element anywhere in
  the document (not even `display:none`), and pressing `?` / `A`
  from `document.body` triggers no `preventDefault` and no URL
  change.

- **ParseInitialPathResult discriminator backwards-compat** — the
  help overlay is the third consumer of `parseInitialPath()` to
  arrive (after URLRouter and Story 2.7's about-page branch). The
  QA tier re-pins that adding the overlay does not regress the
  `kind: 'home'` / `'chapter'` / `'about'` discriminator for
  legacy consumers, including ChapterSpec instance identity across
  `findChapterBySlug` and the full-stack `/c/<slug>` URL parse.

- **Modifier-key matrix for `?` and `A`** — the dev suite covers
  Ctrl / Alt / Meta individually for each shortcut. The QA tier
  adds the combinatorial cross (Ctrl+Shift+?, Meta+Shift+?,
  Ctrl+Shift+A) and pins the OS-shortcut preservation contract
  (Ctrl+A = select-all, Cmd+A = Mac select-all — neither must be
  intercepted). Also pins that Shift+? IS allowed (Shift is the
  natural carrier of `?` on US keyboards) and Shift+A IS allowed
  (uppercase A is the same shortcut as lowercase).

- **`A` shortcut navigation chain across simulation routes** — the
  dev suite asserts the navigate callback receives `/about`. The
  QA tier verifies that across `/`, `/c/v1-jupiter`, `/c/v2-neptune`,
  and a chapter route with a hash fragment, and pins that the
  production default callback is `window.location.assign('/about')`
  via a temporary descriptor override on `window.location.assign`.

- **Help overlay × chapter-index coexistence** — both components
  register document-level keydown handlers and both own a top-right
  toggle in non-embed mode. The QA tier pins:
    - both DOM elements present at `/`
    - `?` opens the help overlay, NOT the chapter index
      (chapter-index's `aria-expanded` stays `false`)
    - `M` opens the chapter index, NOT the help overlay
    - `1`–`9` activates a chapter (dispatches `chapter-jump`), NOT
      the help overlay
    - opening both sequentially leaves both visible (the dev
      decision is no auto-close on the other)
    - Esc inside the help dialog closes IT only (no cross-component
      ripple)
    - The `:host { right: calc(var(--v-edge-margin) + 44px) }`
      offset is pinned in the component's static styles (the dev
      decision pinning the help icon 44 px LEFT of chapter-index)

- **Help overlay × /about page interaction** — the about page is a
  separate top-level surface; `main.ts`'s `mountAboutSurface()`
  does NOT call `startFirstPaint`. The QA tier pins:
    - on `/about` the help overlay is wholly absent
    - on `/about`, pressing `?` from body is a true no-op
    - on `/about`, pressing `A` from body is a true no-op (no
      duplicate navigation)
    - on `/` with the overlay OPEN, pressing `A` does NOT navigate
      AND does NOT close the overlay (binding contract — Esc is
      the only path out)

- **Disconnect cleanup at the composition tier** — the dev suite
  checks that removing one element clears its own listener. The QA
  tier checks that disposing the FULL `FirstPaintHandle` (which
  removes the overlay from the DOM, triggering
  `disconnectedCallback`) prevents `?` from opening anything AND
  that re-bootstrapping after dispose registers fresh listeners
  on the new overlay. Catches a regression where the first
  overlay's listener stayed attached and stole subsequent
  document-level keydowns.

- **MCP smoke probe plan for Integration AC8** — documented as a
  7-probe sequence at the bottom of
  `web/tests/help-overlay-qa-gaps.test.ts`. The lead-driven Chrome
  DevTools MCP smoke is the binding browser-evidence gate per
  voyager-skill-rules.md Rule 3 + Rule 6 + Rule 7.

## Generated Tests

### Integration Tests (Vitest, happy-dom)

- [x] `web/tests/help-overlay-qa-gaps.test.ts` — 46 new tests across
      eight describe blocks:
  - Full first-paint composition (4 tests) — non-embed mounts
    overlay at `/` and `/c/<slug>`; handle slot matches DOM
    element; cold-load is canonical (no URL writes).
  - Embed-mode composition no-op (5 tests) — overlay absent at
    `/?embed=true` and `/c/v1-jupiter?embed=true`; `?` and `A`
    are true no-ops; AC2 "wholly absent (not display:none)"
    contract.
  - ParseInitialPathResult backwards-compat (5 tests) — `kind`
    discriminator preserved for `/`, `/c/<slug>`, `/about` with
    overlay mounted; ChapterSpec instance identity; full-stack
    `/c/<slug>` URL parse unchanged.
  - `?` modifier-key matrix (7 tests) — plain `?`, Shift+?
    accepted; Ctrl/Alt/Meta rejected; Ctrl+Shift+? + Meta+Shift+?
    combinatorial defence.
  - `A` modifier-key matrix (6 tests) — plain `a` + uppercase
    accepted; Ctrl+A (select-all), Cmd+A, Alt+A, Ctrl+Shift+A
    rejected.
  - `A` navigation chain (5 tests) — `/`, `/c/v1-jupiter`,
    `/c/v2-neptune`, chapter+hash all route to `/about`;
    production default uses `window.location.assign('/about')`.
  - Help-overlay × chapter-index coexistence (7 tests) — both
    mounted at `/`; `?` opens help only; `M` opens chapter-index
    only; `1` jumps chapter (no help open); both can be open
    simultaneously; Esc closes help only; 44px offset CSS pinned.
  - Help-overlay × /about (4 tests) — overlay absent on `/about`;
    `?` and `A` no-ops on `/about`; `A` suppressed AND overlay
    stays open when overlay is open on `/`.
  - Disconnect cleanup (3 tests) — dispose prevents `?` opening;
    dispose prevents `A` navigation; re-bootstrap registers fresh
    listeners.

### Chrome DevTools MCP smoke stage (LEAD-executed per Rule 7)

Documented as a 7-probe sequence inline at the bottom of
`web/tests/help-overlay-qa-gaps.test.ts` so the lead can execute it
deterministically. Evidence path:
`_bmad-output/implementation-artifacts/2-8-smoke-evidence/`.

Probe sequence (covers AC1, AC2, AC3, AC4, AC5, AC6 + embed-mode
parity):

1. **AC1 — toggle icon present at cold-load** — navigate `/` →
   assert `v-help-overlay` mounted in DOM + ARIA attributes +
   `__voyagerDebug.helpOverlay` non-null → screenshot + a11y
   snapshot.
2. **AC2 + AC3 — `?` opens the modal dialog** — press `?` from
   body → assert dialog has role/aria-modal/aria-labelledby +
   toggle aria-expanded flips to "true" → screenshot.
3. **AC4 — four shortcut sections in canonical order** —
   evaluate_script on `h2.section-heading` text + `kbd` text
   inventory → a11y snapshot of open dialog.
4. **AC5 — Esc closes + focus on body for keyboard-open path** —
   press `Esc` → assert dialog closed + ARIA reverts + focus
   stays on body → screenshot.
5. **AC5 mouse-open variant — scrim click closes + focus restores
   to toggle** — click toggle → click scrim → assert dialog closed
   + shadow-root activeElement is the toggle button → screenshot.
   (This is the assertion happy-dom drops because of its
   shadow-root click limitation — only verifiable in MCP.)
6. **AC6 — `A` navigates to /about** — press `A` from body → wait
   for `pathname === '/about'` → assert about page mounted +
   simulation chrome gone → screenshot.
7. **Embed-mode parity (AC1 + AC2 + AC6 negative)** — navigate
   `/?embed=true` → assert overlay absent + chapter-index absent +
   simulation surface present; press `?` → no-op; press `A` →
   no-op (URL unchanged); embed param preserved → screenshot.

Final probe: console-clean check via
`mcp__chrome-devtools-mcp__list_console_messages`. Allow-listed:
Lit dev-mode banner + Three.js / chunk-loader pre-existing
diagnostics tolerated by every other story.

The MCP smoke plan explicitly maps each probe to its covered ACs,
calls out the scrim-click test that was de-scoped from the unit
tier (happy-dom drops shadow-root clicks), and references
voyager-skill-rules.md Rule 3 + Rule 6 + Rule 7 as the binding
authority.

## Verification

- `cd web && npx vitest run tests/help-overlay-qa-gaps.test.ts`
  → 46 tests passed in 4.10 s.
- `cd web && npm test -- --run` → 102 test files / 1893 tests
  passed (1847 baseline + 46 new). 0 regressions.
- `cd web && npm run typecheck` → clean (0 errors).
- `cd web && npm run lint` → 5 pre-existing warnings (0 new — all
  five are the same unused `eslint-disable` directives present
  before Story 2.8 dev).

## Coverage notes

- The dev's 41 unit tests + this file's 46 integration tests give
  87 vitest-tier tests for Story 2.8 alone.
- The MCP smoke stage is required (story touches `web/src/`) and
  is documented inline; the lead executes it per
  voyager-skill-rules.md Rule 7.
- happy-dom drops click events on shadow-root elements regardless
  of CSS `pointer-events`. The scrim-click-closes assertion was
  therefore de-scoped from the unit + integration tier; the
  source code still wires `@click=${onScrimClick}` and the MCP
  smoke (Probe 5) verifies it end-to-end in a real Chrome session.
- axe-core is deferred to Story 6.4 (axe-core CI expansion) per
  the dev Risk Mitigation Audit and AC3 NFR considerations. The
  a11y tree snapshots in MCP Probes 1 + 3 are the interim a11y
  gate.
- The `--v-color-bg-elevated` design token (#0f1419) added by
  Story 2.8 is verified at the unit tier (the dev's own AC3 test:
  "dialog background uses --v-color-bg-elevated"). No additional
  QA-tier verification needed — the Story 1.7 design-system
  defense suite (`design-system-defense.test.ts`) already enforces
  the "no hardcoded hex literals" contract on the components
  directory.

## Files Created / Modified

- `web/tests/help-overlay-qa-gaps.test.ts` — NEW (46 cross-cutting
  integration tests + 7-probe MCP smoke plan)
- `_bmad-output/implementation-artifacts/tests/test-summary-2-8.md`
  — NEW (this file)
