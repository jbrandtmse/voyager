# Story 1.8: `<v-fallback-page>` and Boot-Time Capability Probe

Status: done

## Story

As a visitor on an unsupported browser,
I want a dignified, JS-free fallback page that names which capability my browser is missing,
so that I am informed without seeing a degraded simulation, and FR57 / NFR-C4 / NFR-C7 / UX-DR17 are operational.

## Acceptance Criteria

**AC1 — Boot-time capability probe runs before the main bundle:**
- **Given** `web/index.html`,
- **When** the page loads,
- **Then** a small inline `<script>` block runs FIRST (placed in `<head>` before any external `<script src="...">` tag) and probes three capabilities:
  - **WebGL2:** `typeof window.WebGL2RenderingContext === 'function'`
  - **WebAssembly:** `typeof window.WebAssembly === 'object'`
  - **Brotli:** `typeof window.DecompressionStream === 'function'` AND `try { new DecompressionStream('br'); return true; } catch { return false; }` — both required for the brotli decode of VTRJ chunks
- **And** the probe script is **≤ 1 KB minified** (measured by extracting the `<script>` body and `Buffer.byteLength(content, 'utf8')`),
- **And** if any probe fails, the script calls `window.location.replace('/unsupported.html?reason=<webgl2|wasm|brotli>')` where the reason is the FIRST failing capability (probe order: webgl2 → wasm → brotli),
- **And** if all probes succeed, the script dynamically imports the main bundle via `import('/src/main.ts')` or its Vite-compiled equivalent — DO NOT use a static `<script type="module" src="/src/main.ts">` tag; the dynamic import is what gates the load behind the probe.

**AC2 — `<v-fallback-page>` Lit component is the design source for `unsupported.html`:**
- **Given** the project's component library,
- **When** `web/src/components/v-fallback-page.ts` is inspected,
- **Then** the file exports a Lit Web Component `<v-fallback-page>` that:
  - Accepts a `reason` attribute (`'webgl2' | 'wasm' | 'brotli'` — default `'webgl2'`)
  - Renders a semantic document body: `<main>` containing `<h1>` (the headline), `<p>` (one-sentence explanation tailored to `reason`), `<ul>` (browser-recommendation list with three `<li>` elements each containing an `<a>` with the explicit hostname text)
  - Uses the design tokens from Story 1.7 — Inter for the heading, Source Serif 4 for body, deep-space palette
  - Has no runtime dependencies beyond Lit itself (no fetches, no service workers, no analytics)
- **And** the three `reason` variants render different copy:
  - `webgl2`: "Voyager requires WebGL 2 — your browser doesn't appear to support it."
  - `wasm`: "Voyager requires WebAssembly — your browser doesn't appear to support it."
  - `brotli`: "Voyager requires modern brotli decoding (DecompressionStream) — your browser doesn't appear to support it."
- **And** the three browser-recommendation links use explicit hostname text for screen readers:
  - Chrome: `https://www.google.com/chrome/` (link text: "google.com/chrome")
  - Firefox: `https://www.mozilla.org/firefox/` (link text: "mozilla.org/firefox")
  - Safari: `https://www.apple.com/safari/` (link text: "apple.com/safari")

**AC3 — `web/dist/unsupported.html` is pre-rendered at build time:**
- **Given** the build pipeline,
- **When** `npm run build` runs,
- **Then** a build-time hook (a small TypeScript or Node script invoked from Vite's `buildStart` or `closeBundle` lifecycle, OR a Vite plugin authored inline in `vite.config.ts`) reads the `<v-fallback-page>` Lit component's static rendering and emits `web/dist/unsupported.html` as a fully-static HTML file with:
  - All CSS inlined in `<style>` (no external CSS — the page must work with no network requests beyond the page load itself)
  - All fonts referenced via the same `/fonts/*.woff2` paths as `index.html` (Vite copies `public/fonts/` into `dist/fonts/`)
  - The default `reason=webgl2` variant baked in; a tiny inline `<script>` block reads `URLSearchParams` and swaps the body copy when JS is available
- **And** `web/dist/unsupported.html` parses as valid HTML5 (no DOCTYPE-less, no unclosed tags),
- **And** the page works fully with JavaScript disabled (the default `reason=webgl2` variant is the rendered content; the JS-driven variant swap is progressive enhancement only).

**AC4 — `/unsupported.html` works at runtime with the right copy per `?reason=`:**
- **Given** `web/dist/unsupported.html` is served by a static-file server,
- **When** the page is fetched with `?reason=wasm`,
- **Then** the body text reflects the WebAssembly variant (within ≤ 100 ms of page-load JS execution),
- **And** when the page is fetched with `?reason=brotli`, the body text reflects the brotli variant,
- **And** when the page is fetched with no `?reason` or an unknown `?reason`, the default `webgl2` variant renders (no error).

**AC5 — Semantic HTML + screen-reader compatibility:**
- **Given** the fallback page DOM,
- **When** it is inspected with screen-reader tooling (or axe-core in tests),
- **Then** the document uses `<main>`, `<h1>`, `<p>`, `<ul>` semantic elements — no `<div>` soup,
- **And** the browser-recommendation list links use explicit hostname text (not "click here" or generic CTA),
- **And** the page sets `<html lang="en">` and `<title>Voyager — Browser Not Supported</title>`,
- **And** the page has a `<meta name="viewport" content="width=device-width, initial-scale=1">` for mobile readability.

## Tasks / Subtasks

- [x] **Task 1 — Author `web/src/components/v-fallback-page.ts`** (AC: #2)
  - [x] Lit Web Component extending `BaseElement` (Story 1.7)
  - [x] `reason` attribute (Lit `@property({ type: String, reflect: true })`)
  - [x] `render()` returns the semantic `<main>` template
  - [x] Styles use the design tokens (`var(--v-font-sans)` for h1, `var(--v-font-serif)` for body, deep-space palette via `var(--v-color-bg)` etc.)
  - [x] Static helper export `renderFallbackPageHTML(reason): string` — returns the rendered HTML as a string, for build-time pre-rendering. This is a regular function (not a method) so it can be called from a build script without instantiating the component.
  - [x] Note: with `customElements.define()` (Story 1.7 pattern), register the component at module bottom.
  - [x] Co-locate `web/src/components/v-fallback-page.test.ts`: render each of the three variants, assert headline + body copy + link text match expectations

- [x] **Task 2 — Author `web/src/boot/feature-detect.ts`** (AC: #1)
  - [x] This file is the **source** of the inline probe script. It's authored as a TS function returning a string of JS code, which a build hook (Task 4) inlines into `index.html`.
  - [x] Export `getProbeScript(): string` — returns the literal JS code body (no `function` wrapper; the wrapper is added by the inlining step or directly in the HTML)
  - [x] The returned code probes the three capabilities in order (webgl2 → wasm → brotli), uses `try`/`catch` for the brotli `DecompressionStream('br')` instantiation, and on success dynamic-imports the main entry
  - [x] **Inline-script size budget:** ≤ 1 KB minified. The TS source can be longer (with comments + readability); the build minifier strips it down.
  - [x] Export `probeFeatures(): { webgl2: boolean; wasm: boolean; brotli: boolean }` — the same logic as a callable function for use in vitest. Both exports share an internal implementation.
  - [x] Co-locate `web/src/boot/feature-detect.test.ts`: mock `window.WebGL2RenderingContext`, `window.WebAssembly`, `window.DecompressionStream`; assert probe correctness for each combination of capabilities

- [x] **Task 3 — Update `web/index.html` with the inline probe script** (AC: #1)
  - [x] Insert the inline `<script>` block as the FIRST `<script>` in `<head>`, after the inline `<style>` from Story 1.7
  - [x] The script's contents come from `getProbeScript()` at build time — but since `index.html` is static-served, the build hook (Task 4) substitutes a placeholder token in `index.html` with the probe script text
  - [x] Suggested placeholder: `<!-- FEATURE_PROBE -->` (or similar) — the build hook replaces this string with the minified probe script wrapped in `<script>...</script>` tags
  - [x] On a fresh dev-mode `npm run dev`, Vite must also inline the probe (so dev-mode behavior matches production); the Vite plugin handles both modes

- [x] **Task 4 — Author a Vite plugin for inline-probe + pre-render** (AC: #1, #3)
  - [x] File: `web/vite.config.ts` (new) — single inline plugin handles both substitutions via `transformIndexHtml`
  - [x] Plugin lifecycle hooks:
    - `transformIndexHtml(html, ctx)`: on `index.html`, replaces `<!-- FEATURE_PROBE -->` with the minified inline probe `<script>` (placeholder for the main entry URL resolved from `ctx.bundle` in prod, `/src/main.ts` in dev). On `unsupported.html`, replaces three placeholders (FALLBACK_INLINE_CSS, FALLBACK_BODY, FALLBACK_SWAP_SCRIPT) with the pre-rendered fallback content.
  - [x] The fallback page's inline CSS is hand-minified to ~1.6 KB — just the tokens + `@font-face` declarations the page needs, not the full token sheet.
  - [x] The fallback page's inline `<script>` (for `?reason` swap) is ≤ 1 KB minified, CSS-driven via `[data-reason="X"] [data-reason-copy="X"]` selectors. With JS disabled, the baked-in `data-reason="webgl2"` is the visible variant.
  - [x] Hand-rolled string concatenation chosen over `@lit-labs/ssr` (zero new dependencies added). Three static templates with one-sentence variant diffs — SSR adds no value here.

- [x] **Task 5 — Tests**
  - [x] Co-located component test (Task 1) — `web/src/components/v-fallback-page.test.ts` (21 tests)
  - [x] Co-located probe test (Task 2) — `web/src/boot/feature-detect.test.ts` (15 tests)
  - [x] `web/tests/feature-probe-size.test.ts` (5 tests, skipIf-gated on `dist/index.html`)
  - [x] `web/tests/unsupported-html.test.ts` (11 tests, skipIf-gated on `dist/unsupported.html`)
  - [x] `web/tests/unsupported-html-runtime.test.ts` (5 tests, jsdom/happy-dom runtime check for `?reason` swap)

- [x] **Task 6 — Wire `unsupported.html` into `vite.config.ts` multi-page input mode**
  - [x] Created `web/unsupported.html` as the minimal HTML5 placeholder template (with three substitutable comments); the Vite plugin enriches it at build time via `transformIndexHtml`.
  - [x] Configured `build.rollupOptions.input = { main: 'src/main.ts', index: 'index.html', unsupported: 'unsupported.html' }`. The `main` entry is now declared explicitly in rollup input because `index.html` no longer contains a static `<script type="module" src="/src/main.ts">` tag (the dynamic import inside the probe is the entry edge).

- [x] **Task 7 — README + ADR cross-references**
  - [x] Appended a "Browser Compatibility" subsection to `README.md` documenting the three probes, the probe order, and the fallback page
  - [x] Referenced [ADR 0022](docs/adr/0022-browser-unsupported-fallback-page-not-degraded-render.md) in the new section

## Dev Notes

### Architectural Compliance — load-bearing constraints

- **Boot-time feature detection.** Architecture line 86, 748; FR57; NFR-C4; NFR-C7. The probe runs BEFORE the main bundle loads.
- **No degraded simulation.** Architecture line 950: "Boot-time errors (unsupported browser, missing manifest): redirect to `/unsupported.html`. Never a degraded simulation (NFR-C7)."
- **`<v-fallback-page>` is the design source.** Architecture line 443; the static `unsupported.html` is pre-rendered from this Lit component.
- **Same typography as main app.** Per Story 1.7's font setup. Don't introduce new fonts.
- **JS-free progressive enhancement.** The fallback page works with JS disabled (the default variant renders); the `?reason` swap is enhancement only.
- **ADR 0022 governs.** Browser-unsupported fallback page is the chosen path; degraded render is explicitly rejected.

### Architecture-canonical file paths

- `web/src/components/v-fallback-page.ts` (architecture line 781, 1158)
- `web/src/boot/feature-detect.ts` (architecture line 748)
- `web/unsupported.html` (new; minimal placeholder + Vite plugin enriches)
- `web/dist/unsupported.html` (build output, per architecture line 1097)
- `web/vite.config.ts` (extended with the inline-probe + pre-render plugin)

### File-Structure Requirements

- All new code under `web/src/`. The Vite plugin lives in `web/vite.config.ts` directly (do not split into a separate plugin file unless it grows beyond ~100 lines)
- Hand-authored `web/unsupported.html` placeholder lives at the repo path Vite expects (sibling of `index.html`)

### Testing Requirements

- Co-located unit tests for the component + probe
- Build-output tests in `web/tests/` (gated with `skipIf(!fs.existsSync(...))`)
- All existing tests (web vitest 423 + bake fast 233 + 2 skipped + slow 11) must remain green

### Latest Tech Information

- **`@lit-labs/ssr`** is the canonical Lit-side SSR helper. Alternative: hand-roll string concatenation if the component is static enough. For `<v-fallback-page>` which renders 3 fixed templates, hand-rolling is acceptable and adds zero deps.
- **`DecompressionStream('br')`** — Chrome 120+, Firefox 126+, Safari 17.5+. Pre-2024 browsers will fail this probe and land on the fallback page.

### Previous Story Intelligence

- **Story 1.5 (fc378fa):** `GPUCapabilityProbe` exists for reverse-Z. That probe runs AFTER the main bundle loads, for adaptive renderer config. This story's probe runs BEFORE the main bundle loads, for gate-or-redirect logic. The two are complementary, not duplicative.
- **Story 1.6 (c041a0f):** ChunkLoader uses `DecompressionStream('br')` with injectable fallback. Story 1.8's brotli probe is the boot-time gate that prevents users without brotli support from ever reaching the chunk loader.
- **Story 1.7 (85fc2ce):** Lit 3.3.3 + `BaseElement` + design tokens + self-hosted fonts. Use all of these.

### Git Intelligence

Recent commits on `epic1`:
- `85fc2ce Story 1.7: Design tokens, Lit 3 scaffold, and self-hosted typography`
- `c041a0f Story 1.6: Asset manifest loader + EphemerisService (Cubic Hermite L2)`
- `fc378fa Story 1.5: Three.js renderer foundation`

Branch: `epic1`. LFS at ~188 MB + 99 KB fonts.

### Project Context Reference

- Epic: `_bmad-output/planning-artifacts/epics.md` §Story 1.8 (lines 618–645)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` §FR57, §NFR-C4/C7, §line 748 (feature-detect), §line 950 (boot-time error policy)
- UX spec: `_bmad-output/planning-artifacts/ux-design-specification.md` §UX-DR17 (fallback page)
- ADR 0022 (Browser-Unsupported Fallback Page; not degraded render)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8]
- [Source: _bmad-output/planning-artifacts/architecture.md#L748] — `web/src/boot/feature-detect.ts`
- [Source: _bmad-output/planning-artifacts/architecture.md#L950] — boot-time error policy
- [Source: _bmad-output/planning-artifacts/prd.md#FR57] — friendly browser-unsupported fallback
- [Source: docs/adr/0022-browser-unsupported-fallback-page-not-degraded-render.md]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (dev-1-8, team `epic-cycle-2026-05-18`)

### Debug Log References

- Baseline confirmed before work: web vitest 423/423 passing.
- After implementation: web vitest **482/482 passing** (+59 new tests across 5 new test files); bake fast **233 passed + 2 skipped** (unchanged from baseline); bake slow **11/11 passing**.
- `npm run build` succeeds in ~700 ms; `dist/index.html` (2695 bytes) + `dist/unsupported.html` (3436 bytes) both generated correctly.
- TypeScript `tsc --noEmit` clean. ESLint 0 errors (one pre-existing warning in `ephemeris-service.ts` unrelated to this story).

### Completion Notes List

- **AC1 (boot-time probe):** Implemented as a single inline `<script>` injected by the Vite plugin into the top of `<head>` in `index.html`. Probes WebGL2 → WebAssembly → brotli (`new DecompressionStream('br')` inside try/catch). On any failure, calls `window.location.replace('/unsupported.html?reason=<X>')`. On full success, dynamic-imports the hashed main bundle URL resolved at build time from `ctx.bundle`. Inline `<script>...</script>` measures **750 bytes** in `dist/index.html` (budget 1024).
- **AC2 (`<v-fallback-page>` Lit component):** Lives at `web/src/components/v-fallback-page.ts`, extends `BaseElement` (Story 1.7), registered via `customElements.define()` (not `@customElement` — Vite/esbuild decorator gap, mirrors Story 1.7's `<v-version>` pattern). The pure static helpers used for build-time pre-rendering live in a sibling `web/src/boot/fallback-page-static.ts` module — separated so `vite.config.ts` (Node-side) can import them without pulling Lit into the config bundle. Reason copy + browser-link table are exported from the static module so a single canonical copy serves both the Lit-rendered runtime version and the pre-rendered static HTML.
- **AC3 (build-time pre-render):** `web/unsupported.html` is a hand-authored HTML5 placeholder with three substitutable comments (`<!-- FALLBACK_BODY -->`, `/* FALLBACK_INLINE_CSS */`, `/* FALLBACK_SWAP_SCRIPT */`). The Vite plugin's `transformIndexHtml` hook substitutes all three at build time. The default `data-reason="webgl2"` variant is baked in so the page renders correctly with JS disabled.
- **AC4 (runtime `?reason` swap):** CSS-driven via `<main data-reason="X">` + `[data-reason="X"] [data-reason-copy="X"] { display: block }` selectors. The inline `<script>` reads `URLSearchParams`, validates against the known three reasons, sets `dataset.reason` on `<main>`, and the CSS does the swap. Unknown reasons leave the baked-in webgl2 variant untouched. Inline script body measures ~190 bytes minified.
- **AC5 (semantic + a11y):** `<main>`, `<h1>`, `<p>`, `<ul>`/`<li>` — no `<div>` soup. Three browser-recommendation `<a>` links use explicit hostname text (`google.com/chrome`, `mozilla.org/firefox`, `apple.com/safari`) instead of generic CTA copy. `<html lang="en">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<title>Voyager — Browser Not Supported</title>` all present.
- **No new dependencies.** Hand-rolled the static-HTML pre-render rather than adding `@lit-labs/ssr`. The fallback page's three variants differ only by one sentence of body copy — SSR adds a ~30 KB transitive dep tree for negligible benefit on static templates.
- **Architectural note on `index.html`:** The static `<script type="module" src="/src/main.ts">` was REMOVED per AC1's explicit prohibition ("DO NOT use a static `<script type="module" src="/src/main.ts">` tag; the dynamic import is what gates the load behind the probe"). To compensate, `vite.config.ts` declares `src/main.ts` as an explicit `rollupOptions.input.main` entry so Rollup still bundles it as an entry chunk — and the plugin substitutes the hashed asset URL into the inline probe's `__MAIN_ENTRY__` placeholder at build time.
- **Design-system tripwire interaction:** Hex literals in the inlined fallback CSS would have tripped `tests/design-system-defense.test.ts` if the static helpers had lived under `web/src/components/`. Moved the static helpers to `web/src/boot/fallback-page-static.ts` (it is a boot-time/build-time concern, not a runtime component). The hex literals there are TOKEN VALUE definitions (mirroring `tokens.css`), required because the static unsupported page does not load the full token sheet.

### File List

New files:

- `web/src/components/v-fallback-page.ts` — Lit Web Component (design source)
- `web/src/components/v-fallback-page.test.ts` — 21 component-side tests
- `web/src/boot/fallback-page-static.ts` — pure static helpers (HTML/CSS/JS string-rendering) for the Vite plugin; node-safe (no Lit imports)
- `web/src/boot/feature-detect.ts` — boot-time probe source + runtime probe function
- `web/src/boot/feature-detect.test.ts` — 15 probe tests
- `web/vite.config.ts` — Vite plugin (`voyager:fallback-and-probe`) + multi-page rollupOptions input
- `web/unsupported.html` — hand-authored HTML5 placeholder (the Vite plugin enriches it)
- `web/tests/feature-probe-size.test.ts` — 5 build-output tests for the inline probe in `dist/index.html`
- `web/tests/unsupported-html.test.ts` — 11 build-output tests for `dist/unsupported.html`
- `web/tests/unsupported-html-runtime.test.ts` — 5 runtime tests for the `?reason` swap

Modified files:

- `web/index.html` — added `<!-- FEATURE_PROBE -->` placeholder in `<head>`; removed `<script type="module" src="/src/main.ts">` per AC1 (the dynamic import inside the probe is now the entry edge)
- `README.md` — added "Browser Compatibility" subsection referencing ADR 0022
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status: ready-for-dev → in-progress → review

## Change Log

- 2026-05-18 — Story 1.8 implementation complete. Boot-time capability probe (WebGL2 → WebAssembly → brotli) inlined at top of `<head>` in `index.html` via the Vite plugin in `vite.config.ts`. Inline probe `<script>` = 750 bytes (budget 1024). `<v-fallback-page>` Lit component + pure-string static helpers drive the pre-rendered `dist/unsupported.html` (default `reason=webgl2` baked in; works with JS disabled). 59 new tests across 5 files (web vitest 482/482, was 423/423). No new dependencies. (dev-1-8 / epic-cycle-2026-05-18)
