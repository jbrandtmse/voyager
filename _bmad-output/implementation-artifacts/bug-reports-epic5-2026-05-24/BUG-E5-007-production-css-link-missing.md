# BUG-E5-007 — Production CSS link missing from built HTML

**Severity:** CRITICAL (visible layout breakage on every production page)
**Found:** 2026-05-24 by Epic 5 cross-review (lead via Chrome DevTools MCP)
**Status:** FIXED (same session, inline)
**Fix commit:** (to be assigned at commit time)

## Symptom

Every production-built page (`web/dist/index.html` + `web/dist/c/<slug>/index.html`) renders with completely broken layout:

- All four HUD corners (top-left chapter title; top-right date/attitude/distance; bottom-left instruments; bottom-right speed multiplier) collapse to overlapping rectangles near coordinate (0, 0).
- Chapter copy panel, attribution panel, scrubber, help overlay, attitude indicator, and every other token-spacing-dependent component renders without its tokens-derived dimensions.
- Only the FOUC shim's 4 critical tokens (`--v-color-bg`, `--v-color-fg`, `--v-font-sans`, `--v-font-size-body`) resolve — all ~30 other tokens in `tokens.css` are unset.

## Reproduction (pre-fix)

```bash
cd web && npm run build
npx vite preview --port 4173
# Navigate http://localhost:4173/ in any browser
# Observe: top-left HUD corner shows chapter title overlapped by
# instruments + speed indicator stacked at the same origin.
```

DOM probe:

```js
getComputedStyle(document.documentElement).getPropertyValue('--v-edge-margin')
// Returns "" (empty) — the variable is unset
document.querySelectorAll('link[rel="stylesheet"]')
// Returns NodeList(0) — no stylesheet link tags in the document head
```

## Root cause

Vite's static-analysis CSS auto-injection fires when an HTML file contains a `<script type="module" src="/src/main.ts">` tag — Vite rewrites that tag to point at the hashed entry chunk AND emits a sibling `<link rel="stylesheet" href="/assets/main-XXX.css">` tag for the entry's extracted CSS.

Story 1.8's capability probe (`fallbackAndProbePlugin` in `vite.config.ts:55-109`) REPLACES the `<!-- FEATURE_PROBE -->` placeholder with an inline `<script>` that uses dynamic `import('/assets/main-XXX.js')` instead of a static script tag. Dynamic imports do NOT trigger Vite's CSS auto-injection — the CSS file is built but never linked from the HTML.

Per-chapter shells (`dist/c/<slug>/index.html`) inherit the same bug because `ogCardsPlugin.generateBundle` clones the root HTML and substitutes the same FEATURE_PROBE placeholder.

## Why this wasn't caught earlier

1. **Dev mode works.** `vite dev` serves CSS via the HMR pipeline which works with both static and dynamic imports — only the production build is broken.
2. **L4 Playwright suite (Story 4.9 + Story 5.4) passes.** Baselines were captured WITH the broken state. Visual regression compares against itself, so a "broken but consistent" baseline passes pixel-diff.
3. **Story 5.0 BUG-006 production-build regression spec passes.** That test asserts on chapter-title TEXT not on layout — empty `<h2>` would fail but a correctly-rendered but mispositioned `<h2>` passes.
4. **Vitest unit tests use happy-dom or jsdom.** Neither runs the actual Vite production build pipeline; both test the source modules directly with mocked browser APIs.

## Fix

Two new helpers in `vite.config.ts`:

1. `resolveMainCssFromBundle(bundle)` — finds the hashed `assets/main-XXX.css` filename from the Rollup bundle map.
2. `injectMainCssLink(html, cssUrl)` — idempotent insertion of `<link rel="stylesheet" crossorigin href="...">` before `</head>`.

Wired into:

1. `fallbackAndProbePlugin.transformIndexHtml` for the root `index.html` (immediately after FEATURE_PROBE substitution).
2. `ogCardsPlugin.generateBundle` for each per-chapter shell (immediately after FEATURE_PROBE substitution of the cloned root HTML).

## Verification

Post-fix build:

```bash
grep "stylesheet" web/dist/index.html web/dist/c/pale-blue-dot/index.html
# Both show: <link rel="stylesheet" crossorigin href="/assets/main-XXX.css">
```

DOM probe after reload:

```js
getComputedStyle(document.documentElement).getPropertyValue('--v-edge-margin')
// Returns "clamp(16px, 3vw, 64px)" — token resolves correctly
```

HUD corners post-fix at 1280×900 viewport:

| Corner | Rect (x, y, w, h) |
|---|---|
| top-left | (38, 38, 342, 48) |
| top-right | (922, 38, 295, 99) |
| bottom-left | (38, 824, 213, 38) |
| bottom-right | (1063, 842, 154, 20) |

All four corners now at the expected edge-margin offset, no overlap.

## Defense

A new regression test asserts that the production-built HTML files contain a `<link rel="stylesheet">` pointing at an `assets/main-*.css` filename. Lives at `web/tests/build-dist-css-link.test.ts` (gated on `web/dist/` existence per Story 5.0 pattern).

## L4 baselines

The four Story 5.4 PBD baselines + Story 4.9 / 5.0 baselines were all captured against the broken layout. They must be re-captured with `--update-snapshots` against the fixed layout. The fix to those baselines lands in the same commit as this bug fix.
