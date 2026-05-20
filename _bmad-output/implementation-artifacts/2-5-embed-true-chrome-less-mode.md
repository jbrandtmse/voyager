# Story 2.5: `?embed=true` Chrome-less Mode

**Epic:** 2
**Status:** done
**Date created:** 2026-05-20
**Source:** `_bmad-output/planning-artifacts/epics.md` § Story 2.5 + Epic 2 Risks/Mitigations § R3

## User Story

As a museum curator (Hanno, J4),
I want any chapter URL to render chrome-less when I append `?embed=true` so I can embed deep-linked moments in kiosk software without a bespoke build,
So that institutional adoption is friction-free, fulfilling FR40, NFR-S7 (strict-boolean parse), and the AR15 / Step 6c contract.

## Consumes / Closes

- **Story 2.4 URL parsing** — extend `parseInitialPath` to also parse `?embed=true` (strict-boolean)
- **Story 2.4 url-router-qa-gaps Story 2.5 pin** — qa-2-4 captured that `?embed=true` is currently DROPPED on chapter writebacks; this story closes that gap by preserving the parameter through every push/replaceState.
- **Story 2.3 v-chapter-index toggle** — must NOT be added to DOM when embed enabled
- **Story 1.11 v-hud-instruments + (future) v-help-overlay + (future) v-about-page** — same rule (chrome NOT added to DOM, not just hidden)

## Acceptance Criteria

### AC1 — Strict-boolean parse at boot, immutable session-scoped state

- **GIVEN** the boot sequence parses URL parameters
- **WHEN** the URL contains `?embed=true` (literal lowercase `true` only)
- **THEN** an `EmbedModeState` singleton is set to `{ enabled: true }` at boot
- **AND** any other value (`?embed=1`, `?embed=yes`, `?embed=TRUE`, `?embed=on`, `?embed=`, no `embed` param at all) parses as `enabled: false`
- **AND** `EmbedModeState` is immutable for the session — toggling at runtime is not possible (no public setter)

### AC2 — Chrome elements NOT added to DOM (not merely hidden)

- **GIVEN** `EmbedModeState.enabled === true`
- **WHEN** the app renders (first-paint)
- **THEN** the following chrome elements are NOT added to the DOM:
  - Site logo (if any; currently none in Epic 1+2 — no action needed if absent)
  - Footer (currently none — no action needed if absent)
  - Share button (currently none — no action needed if absent)
  - `<v-chapter-index>` toggle button (Story 2.3)
  - About-page link (placeholder; Story 2.7 will introduce)
  - Methodology link (placeholder; Story 2.7 will introduce)
  - `<v-help-overlay>` toggle icon (placeholder; Story 2.8 will introduce)
- **AND** the canvas, `<v-hud>`, `<v-chapter-copy>` (placeholder; future), `<v-timeline-scrubber>`, `<v-play-button>`, `<v-speed-multiplier>`, `<v-audio-toggle>` (future) continue to render normally — these are the simulation, not chrome
- **AND** each chrome element check is implemented by first-paint NOT mounting them (skip the appendChild) when embed is enabled — NOT by adding `display: none` after mount

### AC3 — Accessibility preserved on the remaining elements (R3 mitigation)

- **GIVEN** embed mode is enabled
- **WHEN** a screen reader user navigates the page
- **THEN** ARIA labels, `aria-live` regions, and focus management still function on the remaining elements (HUD, scrubber, play button, speed multiplier)
- **AND** all keyboard shortcuts that target remaining elements (Space, ←/→, Home/End, +/-, H) still work
- **AND** the `M` (chapter index), `A` (About), `?` (help) shortcuts are NO-OPS because those elements are not in the DOM — verify by pressing each from the document body and asserting no error + no state change

### AC4 — embed=true preserved on every URL writeback

- **GIVEN** the URL parameter `?embed=true` was set at boot
- **WHEN** the URL router writes any subsequent URL (chapter-jump pushState, free-scrub replaceState, popstate)
- **THEN** the `embed=true` query parameter is preserved in the new URL
- **AND** a URL like `voyager.app/c/v2-neptune?t=1989-08-25T09:23:00Z&embed=true` survives a back-then-forward sequence with `embed=true` still appended
- **AND** the qa-2-4 regression test that PINS the current drop behavior is REPLACED by an opposite-asserting test that PINS the preservation behavior

### AC5 — Documentation in url-contract.md + About page (forward note for Story 2.7)

- **GIVEN** the embed contract is documented
- **WHEN** I inspect `docs/url-contract.md`
- **THEN** the `?embed=true` parameter is documented with the strict-boolean parse rule and the explicit list of stripped chrome elements
- **AND** the URL contract commits to stability of this list for kiosks built against the v1 contract
- **AND** the About page (Story 2.7) will reference this section (note added to the Story 2.7 spec / epics.md; no action this story for the About page itself)

### AC6 — End-to-end smoke evidence

- **GIVEN** I open `voyager.app/c/pale-blue-dot?t=1990-02-14T00:00Z&embed=true` (or any chapter + embed)
- **WHEN** the page renders
- **THEN** no chapter-index toggle button is visible in the DOM
- **AND** the canvas + HUD + scrubber + play button + speed multiplier fill the viewport
- **AND** the touchscreen scrubber drag still works (Tier 2 touch parity from Story 1.9)

### AC7 — Tests green

- `cd web && npm test -- --run` passes (baseline 1546 + new tests)
- `npm run typecheck` clean
- `npm run lint` clean (5 pre-existing warnings OK)

## Risk Mitigation Audit (R3)

Epic 2 R3 mandate: "Story 2.5 must include an a11y AC asserting that keyboard shortcuts and ARIA attributes remain intact when HUD is hidden; verified by an axe-core run AND a Chrome DevTools MCP keyboard-driven smoke (tab through the chrome-less view and assert focus order + ARIA exposure)."

- ✅ AC3 covers ARIA + keyboard preservation
- ✅ AC6 + Integration AC8 below cover the Chrome DevTools MCP keyboard-driven smoke
- ⚠️ axe-core: if Epic 1 didn't wire axe-core into the test suite, this story should add it via a Vitest test that constructs a chrome-less app composition and runs axe — OR formally defer to Story 6.4 ("axe-core CI expansion and manual accessibility test layer"). Decision: dev should make the call based on what's already wired; if axe-core is not yet in place, defer to 6.4 and document the deferral in this story's Dev Agent Record.

## Integration ACs (consumer side + R3)

### Integration AC8 — Chrome-less mode + a11y + URL preservation end-to-end

- **GIVEN** the dev server running with Voyager loaded at `/c/v1-jupiter?t=1979-03-05T12:05:00Z&embed=true`
- **WHEN** the lead-side Chrome DevTools MCP smoke navigates to the URL
- **THEN** the DOM contains: canvas, scrubber (with markers from Story 2.2), play button, speed multiplier, HUD elements
- **AND** the DOM does NOT contain: `<v-chapter-index>` (toggle hidden because not mounted)
- **AND** pressing `M` from document body results in no `aria-expanded` change anywhere; no error in console
- **AND** pressing `Space` from document body toggles play (normal behavior — Space is a Story 1.10 contract, not chrome)
- **AND** clicking a marker still emits chapter-jump CustomEvent; URL writeback preserves `&embed=true`
- **AND** browser back/forward preserves `&embed=true` in the URL

## Files to Modify

| File | Action | Reason |
|---|---|---|
| `web/src/services/embed-mode-state.ts` | NEW | Singleton EmbedModeState class (read-only after boot) |
| `web/src/services/embed-mode-state.test.ts` | NEW | Unit tests for strict-boolean parse |
| `web/src/services/url-sync.ts` | UPDATE | parseInitialPath returns embedEnabled boolean (or add parseEmbedParam helper); pushChapterRoute/replaceChapterRoute/replaceHomeRoute preserve `embed=true` query param |
| `web/src/services/url-sync.test.ts` | UPDATE | New tests for embed param preservation |
| `web/src/services/url-router.ts` | UPDATE | Carry embedEnabled into URL writebacks |
| `web/src/services/url-router.test.ts` | UPDATE | Test preservation across chapter-jump + popstate |
| `web/src/boot/first-paint.ts` | UPDATE | Accept embedEnabled; skip mounting chapter-index toggle when enabled |
| `web/src/main.ts` | UPDATE | Read EmbedModeState from URL; pass to first-paint; DEV `__voyagerDebug.embedMode` |
| `web/tests/url-router-qa-gaps.test.ts` | UPDATE | Replace the "embed dropped" pin with an "embed preserved" assertion |
| `docs/url-contract.md` | UPDATE | Fill in the embed=true section per AC5 |

## Tasks / Subtasks

- [x] **T1 (AC1): EmbedModeState singleton**
  - [x] Create `web/src/services/embed-mode-state.ts` with read-only `enabled` property
  - [x] Strict-boolean parse helper `parseEmbedParam(searchString): boolean` (only literal lowercase `"true"`)
  - [x] Unit tests for all input variants

- [x] **T2 (AC4): URL writeback preserves embed param**
  - [x] Extend pushChapterRoute / replaceChapterRoute / replaceHomeRoute to append `&embed=true` when EmbedModeState.enabled
  - [x] Replace qa-2-4's drop-pin test with a preservation-assertion test

- [x] **T3 (AC2): Skip mounting chrome elements**
  - [x] In first-paint.ts, skip mounting `<v-chapter-index>` when embedEnabled
  - [x] Add a placeholder-comment pattern for future chrome elements (about, help, methodology) so Story 2.7/2.8 follows the same convention

- [x] **T4 (AC3 + R3 mitigation): A11y verification**
  - [x] Test that pressing M/A/? in embed mode causes no error and no state change
  - [x] Verify ARIA labels remain on HUD + scrubber + play + speed (preserved — embed mode does NOT modify any HUD / scrubber / play / speed markup; those components mount unchanged)
  - [x] axe-core: not wired today; deferred to Story 6.4 (see Dev Agent Record)

- [x] **T5 (AC5): Documentation**
  - [x] Fill in the embed section of docs/url-contract.md with the strict-boolean rule + stripped-chrome list

- [x] **T6 (AC7): Verification**
  - [x] Run tests + typecheck + lint

### Review Findings

Code review completed 2026-05-20 by `cr-2-5` against ADR-0001 (URL contract / NFR-S7 strict-boolean), ADR-0015 (no global store / DI), ADR-0025 (a11y patterns / R3), ADR-0026 (TS 6.x — no `any`). Three review layers ran inline (Blind Hunter, Edge Case Hunter, Acceptance Auditor).

**Result:** APPROVE. Zero HIGH, zero MEDIUM, one LOW (deferred), two LOW dismissed as noise.

**ADR audit summary:**

- ADR-0001 NFR-S7 strict-boolean parse — PASS (`parseEmbedParam` uses `URLSearchParams.get('embed') === 'true'`; unit tests cover `TRUE`, `True`, `1`, `yes`, `on`, empty, whitespace, missing, `false`).
- ADR-0001 URL-contract stability — PASS (`docs/url-contract.md` § `embed` enumerates the same chrome elements the code mount-skips, with planned forward-compat for Stories 2.7 / 2.8).
- ADR-0015 no global store — PASS (`EmbedModeState` constructed once at boot in `main.ts:91`, `.enabled` threaded through DI to `URLSync({ embedEnabled })` and `startFirstPaint({ embedEnabled })`; no module-level singleton, no mutable global).
- ADR-0025 a11y / R3 — PASS (M / 1..9 / A / ? are NO-OPs in embed mode because `<v-chapter-index>.connectedCallback` is the only registration site for the global keyboard shortcuts; HUD / scrubber / play / speed multiplier ARIA is untouched).
- ADR-0026 no `any` — PASS (typecheck clean; grep finds zero `any` types in new/modified code).
- Backwards-compat constructor (`URLSync({ win?, embedEnabled? })` ∨ `URLSync(win)`) — PASS (1610 vitest pass; all Story 1.9 / 2.4 sites unchanged).
- Embed preservation on EVERY writeback — PASS (`writeNow`, `writeChapterPushState`, `writeChapterReplaceState`, `writeHomeReplaceState`, unknown-slug redirect all funnel through `appendEmbed` / `appendEmbedIfMissing`).
- AC2 binding contract (NOT in DOM, not display:none) — PASS (`first-paint.ts:183` is an explicit `if (options.embedEnabled !== true) { ... appendChild(...) }`; no display:none fallback path).
- No orphan listeners — PASS (`installGlobalShortcuts` only registers inside `v-chapter-index.connectedCallback`; no fallback in `main.ts` / `first-paint.ts` / `boot/keyboard-shortcuts.ts`).
- EmbedModeState immutability — PASS (`private readonly _enabled`; getter-only `enabled`; no public setter; immutability test pins it).

**Findings (LOW, all deferred):**

- [x] [Review][Defer] Test title vs body mismatch in `embed-mode-first-paint.test.ts:151` — test titled "pressing M opens panel" only asserts element existence [web/tests/embed-mode-first-paint.test.ts:151] — deferred to `deferred-work.md` (the orphan-listener contract is redundantly pinned by the qa-gaps file § "baseline parity" which queries the shadow-root for `[aria-expanded]`).

**Dismissed (noise, no entry created):**

- url-sync.ts:240 — pathological `/?&embed=true` for query-less URLs that contain a stray `?`. Not reachable via in-tree callers (all writebacks construct the URL from `currentPath + ?t= + hash`, no stray-`?` path).
- url-sync.ts:212-214 — backwards-compat constructor discriminator (`!('location' in arg)`) is structural rather than nominal. Inline comment documents the constraint; the only `UrlSyncOptions` fields today (`win`, `embedEnabled`) avoid collision. Future contributors adding new keys to `UrlSyncOptions` must keep `location` out of the shape — the comment is the safeguard.

**Integration AC8 — lead-executed MCP smoke:** code-side prerequisites are in place (`__voyagerDebug.embedMode` exposes the boot flag for AC1 assertion; `__voyagerDebug.chapterIndex` is `null` in embed mode for AC2 assertion; URLSync writes carry `&embed=true` for AC4). The probe sequence is documented in `web/tests/embed-mode-qa-gaps.test.ts:698-894`. Per voyager-skill-rules.md Rule 7, the smoke itself is the lead's responsibility (ADR-0010 Layer 1).

**Verdict:** APPROVE. All ACs satisfied. Tests green (1610 pass, +24 from the 1586 dev baseline once the QA file is included). Typecheck clean. Ready for done.

## Dev Notes

### Strict-boolean parse

NFR-S7 explicitly requires: `?embed=true` literal lowercase `true` only. Reject all other variants silently (`enabled: false`, NOT an error).

### How EmbedModeState is consumed

The architecture (line 319) says "HUDPresenter reads EmbedModeState" — but the v1 implementation in Story 1.11 used Lit reactive properties (no global store per ADR-0015). For Story 2.5, the simpler implementation is: pass `embedEnabled: boolean` through `FirstPaintOptions` and let first-paint conditionally skip the `appendChild` calls for chrome elements. The EmbedModeState singleton remains the source of truth (constructed once from the URL parse, read by first-paint at mount time, never mutated).

### `embed=true` preservation across URL writebacks

The current URLSync writeback methods build the URL from scratch using `pathname + ?t=<iso>`. Story 2.5 must extend these to also append `&embed=true` when the EmbedModeState.enabled flag is true at boot. The flag is captured once at boot — even if the user mucks with `?embed` in the URL bar after load, that doesn't change anything (immutable session state per AC1).

### NFR considerations

- NFR-S7 strict-typed parsing: do not accept `?embed=1`, `?embed=TRUE`, etc. Silent fallback to `enabled: false`.
- NFR-M6 stability: the stripped-chrome list is part of the public contract.
- A11y: per R3, the chrome-less view must still pass axe-core checks. If axe-core isn't wired, defer to Story 6.4 and document the deferral.

## References

- `_bmad-output/planning-artifacts/epics.md` § Story 2.5 + Epic 2 R3 mitigation
- `docs/adr/0001-url-contract-as-public-api.md` (?embed is part of the contract)
- `web/src/services/url-sync.ts` + `web/src/services/url-router.ts` (Story 2.4 substrate)
- `web/src/boot/first-paint.ts` (mount site for chrome elements)
- `web/tests/url-router-qa-gaps.test.ts` § "?embed=true coexistence" (the pin to replace)
- `_bmad/custom/voyager-skill-rules.md`

## Dev Agent Record

### Implementation Plan

**T1 (AC1) — EmbedModeState singleton.** Created `web/src/services/embed-mode-state.ts` with two surfaces:
1. `parseEmbedParam(search: string): boolean` — strict equality against `URLSearchParams.get('embed')` and the literal string `"true"`. Every other variant returns false, including the empty value, whitespace variants, `1`, `yes`, `TRUE`, `True`, `on`, `false`.
2. `class EmbedModeState` — read-only getter for `enabled`; constructor accepts a boolean; `static fromSearch(search)` is the canonical entry point. Per ADR-0015 (no global store), this is NOT imported by consumers directly — `main.ts` constructs one instance at boot and passes `.enabled` to URLSync and first-paint.

**T2 (AC4) — URL writeback preserves embed.** Extended `URLSync`'s constructor with a backward-compatible options shape `UrlSyncOptions { win?, embedEnabled? }`. The class detects whether the constructor argument is a `UrlSyncWindow` (existing call sites) or `UrlSyncOptions` (new call site in main.ts) so Story 1.9 / 2.4 tests pass unchanged. Added a private `appendEmbed(url)` helper invoked from `writeNow`, `writeChapterPushState`, `writeChapterReplaceState`, `writeHomeReplaceState`. The unknown-slug redirect path forwards `location.search` verbatim (which already contains `embed=true` on the source URL), so it uses a sibling `appendEmbedIfMissing` to avoid double-appending. Hash-fragment ordering is preserved (`/?t=...&embed=true#frag`).

**T3 (AC2) — Skip mounting chrome.** Added `embedEnabled?: boolean` to `FirstPaintOptions`. The `<v-chapter-index>` `appendChild` call is wrapped in `if (options.embedEnabled !== true) { ... }`. The element is created and `chapterIndex` is `null` in the returned handle when skipped (changed return-type from `VChapterIndex` to `VChapterIndex | null`). The dissolve `onComplete` callback null-checks chapterIndex before touching visibility. Added an inline comment pattern that Story 2.7 / 2.8 should follow when they introduce About / Help chrome.

**T4 (AC3 + R3) — A11y verification.** Pressing M / A / ? / 1..9 in embed mode is a NO-OP because the global keyboard shortcuts that own M and 1..9 are registered inside `v-chapter-index`'s `connectedCallback` (lines 263–269). When the element is not appended, `connectedCallback` is never invoked, and the listener is never attached — no error path, no state change. A (About) and ? (help) have no listener registered in any story yet (they belong to Stories 2.7 / 2.8). Space (play/pause), arrow keys (scrub), +/- (speed) live in `boot/keyboard-shortcuts.ts` + the scrubber + speed-multiplier components — all of which still mount in embed mode. The simulation-surface ARIA markup (HUD live regions, scrubber `role="slider"` + `aria-valuenow`/`aria-valuetext`, play button label) is unchanged in embed mode because none of those components were modified by this story.

**axe-core deferral.** Searched for `axe-core` / `jest-axe` in `web/package.json` and `web/`: not wired into any tier today. Per the story's R3 spec and Voyager skill rules, this story does NOT add the dependency just for one assertion. Deferred to Story 6.4 (axe-core CI expansion). Pin: when 6.4 lands, it should add a test that boots first-paint with `embedEnabled: true`, lets the title card dissolve, then runs axe-core against `document.body`.

**T5 (AC5) — Documentation.** Replaced the "reserved (Story 2.5)" placeholder in `docs/url-contract.md` § Query Parameters with a complete embed-mode section: strict-boolean parse rule, session immutability note, full stripped-chrome list (table including planned Story 2.7 / 2.8 elements with their forward-compat behavior), simulation-surface preserved list, keyboard contract, URL-preservation rule across writebacks, and concrete example URLs. The list is now contractually frozen per ADR-0001 — adding/removing elements requires a major URL-version bump.

**T6 (AC7) — Verification.** `cd web && npm test -- --run` ran 1586 tests (88 files), all passing (+40 from the 1546 baseline). `npm run typecheck` clean. `npm run lint` clean (5 pre-existing warnings preserved; 0 new). The new test surfaces are:
- `web/src/services/embed-mode-state.test.ts` — 14 tests (strict-boolean + immutability)
- `web/src/services/url-sync.test.ts` — +10 tests under "Story 2.5 AC4 — URLSync embed=true preservation" (44 → 54)
- `web/tests/embed-mode-first-paint.test.ts` — 13 tests (AC2 mount-skip + AC3 NO-OP keyboard + Space still works)
- `web/tests/url-router-qa-gaps.test.ts` — replaced 2 Story-2.4 drop-pin tests with 5 Story-2.5 preservation tests (25 → 27)

### Decisions

- **Backwards-compatible URLSync constructor.** Rather than a breaking parameter shape change, the constructor inspects the argument: an object with `location`/`history` keys is the legacy `UrlSyncWindow`; an object without is the new `UrlSyncOptions`. This keeps every existing Story 1.9 / 2.4 test passing without modification.
- **Skip `appendChild` (not `display:none`)** — AC2 explicitly. The story makes this an integral part of the contract: a kiosk-host cannot accidentally toggle chrome back on by editing CSS. The chapter-index element does not exist in the DOM at all.
- **NO-OPs via "no listener attached"** — M / 1..9 become NO-OPS naturally because the listener registration lives inside `v-chapter-index`'s `connectedCallback`. No defensive code is needed at the keyboard-shortcut layer.
- **EmbedModeState is a typed wrapper, not a registry-style singleton.** Per ADR-0015 (no global store), consumers do not import the singleton directly; main.ts constructs one and threads `.enabled` through `URLSync` options + `FirstPaintOptions`. The class enforces immutability via a getter-only `enabled` property.

### Issues Encountered

None substantive. The only friction point was deciding the URLSync constructor overload shape — preserving the existing `UrlSyncWindow` signature (used by ~40 tests) vs introducing a new options object. The runtime-discriminated overload solves both.

### Completion Notes

All seven ACs satisfied (AC1 strict-boolean parse + immutability, AC2 chrome not in DOM, AC3 a11y preserved + NO-OPs, AC4 embed preserved across writebacks, AC5 documentation, AC6 smoke evidence — deferred to lead MCP gate per Rule 7, AC7 tests green). Integration AC8 (Chrome-less + a11y + URL preservation end-to-end via lead Chrome DevTools MCP smoke) is the binding browser-evidence gate per Voyager skill rules Rule 3 + Rule 7. Code-side prerequisites for that smoke are in place: `window.__voyagerDebug.embedMode` exposes the boot flag for AC1 assertion; `window.__voyagerDebug.chapterIndex` is `null` in embed mode for AC2 assertion; URLSync writes carry `&embed=true` for AC8 URL-preservation assertion.

### File List

**New:**
- `web/src/services/embed-mode-state.ts`
- `web/src/services/embed-mode-state.test.ts`
- `web/tests/embed-mode-first-paint.test.ts`

**Modified:**
- `web/src/services/url-sync.ts` — UrlSyncOptions, backwards-compatible constructor, `appendEmbed` + `appendEmbedIfMissing` helpers wired into all writeback paths + unknown-slug redirect
- `web/src/services/url-sync.test.ts` — +10 tests under Story 2.5 AC4
- `web/src/boot/first-paint.ts` — `FirstPaintOptions.embedEnabled`, conditional `appendChild` for `v-chapter-index`, null-safe `onComplete`, `FirstPaintHandle.chapterIndex` widened to `VChapterIndex | null`
- `web/src/main.ts` — construct `EmbedModeState.fromSearch(window.location.search)`, pass `embedEnabled` to URLSync + first-paint, expose `__voyagerDebug.embedMode` (DEV-only)
- `web/tests/url-router-qa-gaps.test.ts` — bootStack accepts `embedEnabled`; replaced 2 Story-2.4 drop-pin tests with 5 Story-2.5 preservation tests
- `docs/url-contract.md` — replaced placeholder with full embed-mode section
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 2-5 in-progress → review
- `_bmad-output/implementation-artifacts/2-5-embed-true-chrome-less-mode.md` — checkboxes + Dev Agent Record

### Change Log

| Date | Author | Description |
| --- | --- | --- |
| 2026-05-20 | dev-2-5 | T1–T6 implemented; 40 new tests (web vitest 1546 → 1586); typecheck + lint clean; URL contract documented; axe-core deferred to Story 6.4 |
