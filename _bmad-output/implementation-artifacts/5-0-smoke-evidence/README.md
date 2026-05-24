# Story 5.0 AC1 — Production-Build Smoke Evidence

_Captured 2026-05-23 by a one-shot Playwright script (`web/tests/screenshot-chapter-title-prod.mjs`, removed post-capture). The durable equivalent is the regression spec at `web/tests/visual/hud-chapter-title-prod.spec.ts`, which can be re-run via `cd web && npx playwright test --config tests/visual/playwright.config.ts hud-chapter-title-prod` against a built `dist/` to re-verify the wire-up._

## Context

Story 4.10 wired `<v-hud-chapter-title>` to subscribe to `ChapterDirector`
transitions so the top-left HUD heading populates with the active chapter
name. Story 4.9's lead Playwright smoke against `web/dist/` flagged the
`<h2>` rendering empty (BUG-006 dist-drift); Story 5.0 AC1 was scoped to
investigate and fix the root cause.

## Investigation result

**The bug does not reproduce against current HEAD.** The standing Story
4.10 fix (per-tick identity-gated propagation of `chapterDirector` through
`<v-hud>.tick()` defending against the post-render assignment trap) is
effective in production builds. The `<v-hud-chapter-title>` `<h2>` renders
the active chapter name correctly for every chapter the Playwright probe
exercised (V1J, PBD — both load-bearing for Epic 5's PBD module).

Hypotheses ruled out during investigation:

- **Rule 10 / Lit class-field shadowing.** `<v-hud-chapter-title>` does not
  use `static properties`; its `chapterDirector` is a custom getter/setter
  pair backed by a private `_chapterDirector` field — not a Lit reactive
  property — so Rule 10 does not apply. `<v-hud>` correctly uses `declare
  embedEnabled` + ctor-init for its sole reactive property; `chapterDirector`
  on `<v-hud>` is intentionally non-reactive, with the per-tick
  identity-gated propagation handling the post-render assignment trap.
- **Vite minifier tree-shake.** Inspection of the minified
  `dist/assets/main-*.js` chunk confirms the setter, `subscribeToDirector`,
  `seedFromActiveChapter`, `onTransition`, and `setName` methods are all
  emitted with their identifiers unmangled (Lit components are not subject
  to terser member-name mangling by default).
- **`import.meta.env.DEV` gating.** No subscription registration code path
  is DEV-gated; the only DEV-gated symbol the chapter-title path touches is
  the `__voyagerDebug.chapterDirector` debug surface (which the title
  component does not consume — it receives its reference via the HUD pipe).

The standing Story 4.9 dev-notes description of the bug ("the `<h2>` is
mounted but `currentSlug` stays null") was most likely a timing artifact:
Story 4.9's stable-frame waiter polled the title element before the
post-mount async chain (`updated()` → setter → `setName()` →
`requestUpdate()` → next-microtask render) completed. Story 4.9 pivoted
to `<v-chapter-index>` as the chapter-resolved proxy on that basis;
Story 5.0 confirms the original `<v-hud-chapter-title>` signal is
reliable when polled with `waitForFunction` rather than read in a one-shot
`evaluate`.

## Regression test

A new Playwright spec at `web/tests/visual/hud-chapter-title-prod.spec.ts`
pins the production-build wire-up invariant. The spec exercises both
V1J and PBD chapters end-to-end (`web/dist/` → `vite preview` → real
Chromium navigation → DOM assertion on `<h2>` text + `data-slug`),
satisfies Rule 11 (build-pipeline E2E test), and runs under `npm run
test:visual` alongside Story 4.9's visual-regression suite.

## Observed values

### v1-jupiter

- `h2 text`: `Voyager 1 — Jupiter`
- `h2 data-slug`: `v1-jupiter`
- screenshot: `5-0-smoke-evidence/production-build-title-v1-jupiter.png`

### pale-blue-dot

- `h2 text`: `Pale Blue Dot`
- `h2 data-slug`: `pale-blue-dot`
- screenshot: `5-0-smoke-evidence/production-build-title-pale-blue-dot.png`
