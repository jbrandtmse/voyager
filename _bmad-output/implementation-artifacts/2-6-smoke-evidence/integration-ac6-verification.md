# Story 2.6 — Integration AC6 Verification (Build Artifact Smoke)

**Date:** 2026-05-20
**Method:** Lead-side inspection of `web/dist/` artifacts (Rule 3 partial exemption — build-only story, no `web/src/` runtime browser surfaces touched)

## Build Artifact Existence — AC1 + AC3 (R4)

`web/dist/og/` contents:

```
launch-v1.e2056779.png
launch-v2.f8e562e3.png
og-manifest.json
pale-blue-dot.0fa11c6d.png
v1-heliopause.1d392333.png
v1-jupiter.81e02d30.png
v1-saturn.41b07d8f.png
v2-heliopause.23484fb9.png
v2-jupiter.d2669705.png
v2-neptune.902bdb52.png
v2-saturn.9ec776f9.png
v2-uranus.ea6874ee.png
```

- **11 PNGs** (one per chapter; content-hashed filenames) ✓
- **`og-manifest.json`** with 11 entries; first 4 entries match ALL_CHAPTERS chronological order ✓
- R4 parity assertion wired at 3 layers — vitest confirms ✓

## Per-chapter HTML — AC2

`web/dist/c/` contents:

```
launch-v1   launch-v2   pale-blue-dot   v1-heliopause   v1-jupiter
v1-saturn   v2-heliopause   v2-jupiter   v2-neptune   v2-saturn   v2-uranus
```

**11 per-chapter HTML files** (one `<slug>/index.html` per chapter) ✓.

Sample inspection of `dist/c/v2-neptune/index.html`:

```html
<script>(function(){var r=null;if(typeof window.WebGL2RenderingContext!=='function')r='webgl2';else if(typeof window.WebAssembly!=='object')r='wasm';if(r){window.location.replace('/unsupported.html?reason='+r);}else{import('/assets/main-Djh8Tx-p.js');}})();</script>
<meta property="og:title" content="Voyager 2 — Neptune — Voyager" />
<meta property="og:description" content="Voyager 2 reaches Neptune on 25 August 1989, the last planetary encounter of either probe, before bending south past Triton." />
<meta property="og:image" content="https://voyager.app/og/v2-neptune.902bdb52.png" />
<meta property="og:url" content="https://voyager.app/c/v2-neptune" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Voyager 2 — Neptune — Voyager" />
<meta name="twitter:description" content="Voyager 2 reaches Neptune on 25 August 1989, the last planetary encounter of either probe, before bending south past Triton." />
<meta name="twitter:image" content="https://voyager.app/og/v2-neptune.902bdb52.png" />
```

All 5 OG meta tags present ✓. All 4 Twitter Card meta tags present ✓. The hashed PNG path matches the manifest entry ✓.

## HIGH Fix Verification — cr-2-6's FEATURE_PROBE substitution

Critical evidence: the substituted IIFE boot probe IS present in the per-chapter HTML, referencing the hashed main entry `/assets/main-Djh8Tx-p.js`. Before cr-2-6's fix, this line was the literal `<!-- FEATURE_PROBE -->` comment. After fix: full IIFE with WebGL2 + WebAssembly capability check + ESM import.

Direct-land at `/c/<slug>` will now boot the SPA correctly when served from a CDN (the IIFE imports the hashed main bundle, which mounts the Lit components + ChapterDirector + URLRouter).

## R4 Parity

Vitest 3-layer enforcement:
- `web/src/build/og-cards.test.ts` (26 tests; unit-level)
- `web/scripts/og-cards-defense.test.ts` (14 tests; FS-level on actual dist/og/)
- `web/tests/og-cards-build-integration.test.ts` (16 tests; dist-level integration)

All green at vitest 1717 / 1717 pass (0 expected-fail after cr-2-6's fix).

## Verdict

**PASS.** Story 2.6 ships. OG card pipeline emits 11 PNGs + 11 per-chapter HTMLs with full meta tags + substituted boot probe + manifest that parity-asserts against the live registry. Real Playwright PNG capture deferred to Story 4.9/7.x per dev-2-6's authorized path (b); placeholder 1×1 transparent PNGs in place so the contract is byte-stable across the deferral.
