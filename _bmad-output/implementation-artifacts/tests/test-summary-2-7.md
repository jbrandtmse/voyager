# Test Automation Summary — Story 2.7

**Story:** `<v-about-page>` + `<v-attribution-panel>`
**Date:** 2026-05-20
**QA agent:** qa-2-7 (epic-cycle-2026-05-20)

## Scope

The dev-authored test suite for Story 2.7 covers AC1–AC6 at the unit
tier (27 new tests total):

- `web/src/components/v-about-page.test.ts` — 14 unit tests for
  custom-element registration, Light-DOM render-root, h1+6×h2
  canonical section order, heading hierarchy (no skipped levels),
  prose word-count (~200 words), Data-sources and Validation table
  semantics (`<caption>` + `<thead>` + `<th scope>`), embedded
  `<v-attribution-panel>` + `#attribution` deep-link target,
  embed-contract ADR-0001 slug coverage, Methodology presence
  (AC1 + AC2 + AC5).
- `web/src/components/v-attribution-panel.test.ts` — 6 unit tests
  for registration, Light-DOM contract, 7-entry canonical order,
  link `target`/`rel` attributes, canonical-URL host inclusion
  (AC3).
- `web/src/services/url-sync.test.ts` § "Story 2.7 AC1" — +7 unit
  tests for the `kind: 'about'` discriminator, trailing-slash route,
  `?t=` survival through `/about`, unknown-slug redirect resolving
  to `'home'` not `'about'`.
- `web/src/services/url-router.test.ts` § "Story 2.7" — +7 unit
  tests for `onRouteChange` listener semantics (home→about,
  chapter→about, about→home), same-kind no-fire, unsubscribe,
  throwing-listener defence.
- `web/src/boot/about-footer.test.ts` — 7 unit tests for the
  homepage footer mount + click-intercept behaviour: non-embed
  mount, embed-mode skip, plain left-click navigate, Ctrl-click /
  Shift-click / middle-click native-semantics preservation (AC4).

This QA stage fills cross-cutting gaps the dev suites do not
exercise:

- **Full-stack `/about` cold-load composition** — the dev tests
  validate each seam in isolation (URLSync recognises `/about`;
  `<v-about-page>` renders correctly when manually instantiated).
  The QA tier composes the FULL stack (real `EmbedModeState` ×
  real `URLSync` × real `ClockManager` × real `ChapterDirector` ×
  real `URLRouter`) at `/about` and verifies that ONLY
  `<v-about-page>` mounts — no canvas, HUD, scrubber, play button,
  speed multiplier, chapter-index, or title-card. Catches a future
  regression where someone wires a simulation subsystem to
  construct unconditionally.
- **Cross-surface popstate reload contract (Integration AC7)** —
  main.ts wires `URLRouter.onRouteChange` → `window.location.reload()`
  on transitions into `'about'`, and `URLSync.installPopstateHandler`
  → `window.location.reload()` on transitions out of `'about'`. The
  dev URLRouter tests assert the listener fires; the QA tier pins
  the end-to-end wiring (listener subscribes, popstate dispatch,
  reload counter increments exactly once for cross-kind, zero for
  same-kind).
- **`ParseInitialPathResult` discriminator backward-compat** — the
  dev added a `kind` field to the existing result type. The QA
  tier pins that all 11 ADR-0001 frozen slugs still resolve with
  `kind === 'chapter'`, the resolved `ChapterSpec` is the same
  instance `findChapterBySlug` returns, and the simulation surface
  boots cleanly at `/c/<slug>` after the discriminator was added.
- **Footer extended modifier-click matrix** — dev covers
  Ctrl/Shift/middle (3 cases); QA adds Cmd (meta), Alt, the
  defaultPrevented short-circuit, and the no-accidental-deduping
  contract (two consecutive plain clicks navigate twice).
- **`/about?embed=true` parity** — AC4 governs the footer link
  (absent in embed mode), but the `/about` route itself is
  reachable in embed mode. The QA tier pins that boot at
  `/about?embed=true` mounts the about page, no footer (because
  the simulation surface is not constructed), and `embedMode.enabled
  === true` is honoured by URLSync writebacks.
- **Attribution panel link sweep (AC3)** — dev tests inspect a
  handful of canonical URL hosts; the QA tier sweeps every
  attribution entry to confirm `target="_blank"` + `rel="noopener"`,
  every URL is `https://` (no `http://`, no protocol-relative, no
  broken href), every entry is parseable as a URL, and the DOM
  order matches the AC3 canonical 7-entry list.
- **Editorial content composition assertions (AC2)** — defence-in-
  depth at the composition tier: 7 data-source rows + 3 validation
  rows present together, every `section[aria-labelledby]` points at
  a real `<h2>` id inside the section, all 7 attribution entries
  reachable from inside the about-page composition (not just the
  standalone panel test), all 11 ADR-0001 slugs in the embed-contract
  section, and all 3 canonical tolerances verbatim in the validation
  copy.
- **MCP smoke probe plan for Integration AC7** — lead-executed in
  Chrome DevTools MCP (Rule 3 + Rule 6 + Rule 7), documented
  inline at the bottom of `web/tests/about-page-qa-gaps.test.ts`.

## Generated Tests

### `web/tests/about-page-qa-gaps.test.ts` (NEW)

35 vitest tests organized into 7 describe blocks:

1. **Story 2.7 — `/about` cold-load composition mounts only the
   about surface** (6 tests)
   - parseInitialPath returns `kind="about"` from the real URLSync
   - host mounts `<v-about-page>` and zero simulation chrome
     elements (canvas, HUD, scrubber, play, speed, chapter-index,
     title-card)
   - trailing-slash variant `/about/` is recognised
   - 7 canonical headings reachable after a single Lit update tick
   - `#attribution` anchor reachable from `document.querySelector`
   - cold-load `/about#attribution` keeps the hash in the address bar
2. **Story 2.7 — cross-surface popstate triggers a reload** (6
   tests)
   - home → about fires `onRouteChange` with `from="home" to="about"`
   - chapter → about fires `onRouteChange` with `from="chapter" to="about"`
   - main.ts reload contract: listener fires exactly once on
     simulation → /about
   - chapter → chapter (same-kind) does NOT trigger the reload
   - home → home with `?t=` change does NOT trigger the reload
   - about → simulation: URLSync.installPopstateHandler fires with
     `kind="home"` (the signal main.ts uses to reload)
3. **Story 2.7 — `ParseInitialPathResult` discriminator preserves
   legacy chapter consumers** (6 tests)
   - `/c/v1-jupiter` produces `kind="chapter"` with chapter non-null
   - `/` produces `kind="home"` with chapter null
   - resolved `ChapterSpec` is the same instance `findChapterBySlug`
     returns (reference equality, legacy contract)
   - all 11 ADR-0001 frozen slugs resolve with `kind="chapter"`
   - unknown-slug redirect resolves to `kind="home"` (NOT `"about"`)
   - simulation surface boots cleanly at `/c/<slug>` with the new
     discriminator
4. **Story 2.7 AC4 — footer link extended modifier-click matrix**
   (4 tests)
   - Meta-click (Cmd) preserves native open-in-new-tab
   - Alt-click is NOT intercepted
   - `defaultPrevented`-already-true short-circuit (no double-intercept)
   - two consecutive plain clicks navigate twice (no accidental
     deduping)
5. **Story 2.7 — `/about` reachable in embed mode** (3 tests)
   - `/about?embed=true` parses `kind="about"` AND
     `embedMode.enabled=true`
   - `/about?embed=true` still mounts only the about page, no
     footer (the footer host is the simulation surface)
   - `mountAttributionsFooter` short-circuits with embedEnabled=true
6. **Story 2.7 AC3 — attribution panel link sweep** (5 tests)
   - every entry that declares a URL renders an `<a>` with the
     exact URL in `href`
   - every link uses `target="_blank"` + `rel="noopener"`
   - every URL is HTTPS (no `http://`, no protocol-relative) and
     parseable
   - DOM order matches the AC3 canonical (first NAIF, last
     Photojournal)
   - exactly one `<dl id="attribution">` in the document
     (deep-link uniqueness)
7. **Story 2.7 AC2 — editorial content composition** (5 tests)
   - 7 data-source rows AND 3 validation rows present together
   - every `section[aria-labelledby]` points at a real `<h2>` id
     inside the section
   - all 7 attribution entries reachable from inside the about-page
     composition
   - all 11 ADR-0001 slugs in the embed-contract section
   - all 3 canonical tolerances (`20 km`, `5 km`, `1 mrad`, `60 FPS`)
     in the validation copy

### Chrome DevTools MCP smoke (Integration AC7 — lead-executed)

Documented inline at the bottom of
`web/tests/about-page-qa-gaps.test.ts`. Per Story 2.0 AC2 + Rule 3,
the MCP smoke stage is REQUIRED because the dev's File List touches
`web/src/`. Evidence path:
`_bmad-output/implementation-artifacts/2-7-smoke-evidence/`.

The probe sequence covers 7 stages:

1. **AC1 + AC2 — `/about` cold-load mounts only the about surface.**
   `navigate_page` → `/about` → `evaluate_script` asserts
   `<v-about-page>` present, canvas / HUD / scrubber / chapter-index
   absent, 7 headings present in canonical order. `take_snapshot`
   for the accessibility tree. `take_screenshot` →
   `about-cold-load.png`. Console-clean check.
2. **AC2 — section order matches the canonical 6.** `evaluate_script`
   maps `<h2>` textContent and asserts equality with the canonical
   array.
3. **AC3 — attribution panel link safety.** `evaluate_script` checks
   `#attribution.tagName === 'DL'`, exactly 7 `<dt>` children, every
   link uses `target="_blank"` + `rel="noopener"` + `href.startsWith
   ('https://')`.
4. **AC4 — homepage footer present + routes to `/about#attribution`.**
   `navigate_page` → `/` → assert the footer link href + textContent.
   `take_screenshot` → `home-with-footer.png`. `click` the anchor →
   assert `location.pathname === '/about'` AND `location.hash ===
   '#attribution'`. `take_screenshot` →
   `about-scrolled-to-attribution.png`.
5. **AC4 (negative) — footer ABSENT in embed mode.** `navigate_page`
   → `/?embed=true` → assert footer absent, embedMode enabled,
   chapter-index absent (Story 2.5 invariant cross-check),
   simulation surface present. `take_screenshot` →
   `embed-no-footer.png`.
6. **Cross-surface popstate reload.** From `/` with footer →
   `click` Attributions link → navigate to `/about#attribution`.
   `evaluate_script` calls `history.back()` → assert
   `location.pathname === '/'` AND simulation surface re-mounted
   (proves cross-surface popstate triggers the reload).
   `take_screenshot` → `back-to-simulation-after-reload.png`.
7. **Console-clean assertion.** `list_console_messages` — only the
   Lit dev-mode banner and pre-existing tolerated diagnostics.

MCP smoke covers AC1, AC2, AC3, AC4, and Integration AC7. AC5
(axe-core) remains deferred to Story 6.4 per dev's AC statement;
the `take_snapshot` accessibility tree is the interim check. AC6
is the test-suite green gate, verified by `npm test -- --run` (not
by MCP).

No `initScript` shim needed (Rule 6, post-Story-1.16).

## Verification

- `cd web && npm test -- --run` → **1804 passing** (1769 baseline
  + 35 new from this QA file).
- `npm run typecheck` → clean.
- `npm run lint` → 5 pre-existing warnings (0 new).

## Coverage matrix

| AC   | Dev surface                                        | QA gap-fill                                                  |
| ---- | -------------------------------------------------- | ------------------------------------------------------------ |
| AC1  | `v-about-page.test.ts` (Light-DOM, registration)   | full-stack `/about` cold-load composition (only-about-mount) |
| AC2  | `v-about-page.test.ts` (sections, headings, prose) | composition-tier section/heading/aria-labelledby integrity   |
| AC3  | `v-attribution-panel.test.ts` (6 entries)          | full link sweep — every URL, HTTPS, target/rel               |
| AC4  | `about-footer.test.ts` (Ctrl/Shift/middle)         | Cmd / Alt / defaultPrevented / no-deduping                   |
| AC4  | (footer mount in non-embed)                        | `/about?embed=true` parity — about page reachable, no footer |
| AC5  | (a11y-compliant HTML authored)                     | composition-tier aria-labelledby integrity (interim a11y)    |
| AC5  | axe-core deferred to Story 6.4                     | MCP `take_snapshot` accessibility tree as interim a11y       |
| AC6  | dev-side `npm test` run                            | QA-side run (1769 → 1804)                                    |
| AC7  | (MCP smoke evidence — lead)                        | documented 7-stage probe sequence                            |
| —    | URLRouter onRouteChange unit tests                 | end-to-end reload contract (cross-surface vs same-kind)      |
| —    | URLSync parseInitialPath unit tests                | discriminator backward-compat for all 11 frozen slugs        |

## Decisions

- **Test pattern mirrored from `embed-mode-qa-gaps.test.ts`.** Two
  helpers — `bootAboutSurface()` and `bootSimulationSurface()` —
  compose the real `EmbedModeState`/`URLSync`/`ClockManager`/
  `ChapterDirector`/`URLRouter` instances matching `main.ts`'s
  wire-up minus `RenderEngine`. Tests against the actual wire-up
  catch the class of bug the Epic 1 retrospective surfaced
  (services correct in isolation, broken when composed).
- **Cross-surface popstate reload tested via spies, not real
  reload.** `window.location.reload` cannot be exercised under
  vitest/happy-dom without tearing down the test environment.
  The QA tier asserts the SIGNAL that drives the reload
  (`URLRouter.onRouteChange` cross-kind fire, `URLSync`
  popstate-handler `kind !== 'about'` fire) — the binding
  contract main.ts attaches the reload to. The end-to-end reload
  itself is exercised by the lead-driven MCP smoke probe 6.
- **`<v-about-page>` Lit `updateComplete` awaited via runtime
  type assertion** rather than importing the dev-author's type
  alias. The QA file uses `as unknown as { updateComplete:
  Promise<void> }` so test setup never has to mirror the dev's
  class-shape — if a future refactor moves things around, the
  test still works as long as the Lit `updateComplete` contract
  holds.
- **All 11 ADR-0001 slugs are re-tested in the discriminator
  back-compat suite even though the URLSync unit test already
  enumerates them.** This is intentional defence-in-depth: the
  Story 2.7 risk was that the new `kind` field shadowed an
  existing chapter consumer; sweeping all 11 slugs at the
  composition tier (with a fresh `URLSync` per slug, mirroring a
  cold load) pins the regression detector.
- **No axe-core probes in the MCP smoke.** Per the dev's AC5
  statement, axe-core remains deferred to Story 6.4. The
  `take_snapshot` accessibility tree is the interim a11y check —
  it surfaces heading hierarchy + landmark detection without
  needing the full axe harness.

## Files Modified

- `web/tests/about-page-qa-gaps.test.ts` — NEW. 35 vitest tests
  + inline MCP smoke probe plan.
- `_bmad-output/implementation-artifacts/tests/test-summary-2-7.md`
  — NEW. This summary.

## Issues Encountered

None. All 35 new tests pass on the first run; the baseline of
1769 + 35 = 1804 total tests pass with no regressions, typecheck
clean, lint at the 5 pre-existing warnings (0 new).
