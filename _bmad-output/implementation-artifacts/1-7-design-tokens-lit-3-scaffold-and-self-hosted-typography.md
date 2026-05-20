# Story 1.7: Design Tokens, Lit 3 Scaffold, and Self-Hosted Typography

Status: done

## Story

As a visitor,
I want the artifact's visual register established on first paint with AiRT-class typography and a single design-token source of truth,
so that the rest of the UI inherits the deep-space palette, three-voice typography, and reduced-motion contract automatically, and FR49 + UX-DR1 through UX-DR7 + UX-DR21 + UX-DR30 are operational.

## Acceptance Criteria

**AC1 — `web/src/styles/tokens.css` is the single source of truth for the design tokens:**
- **Given** the web app source tree,
- **When** `web/src/styles/tokens.css` is inspected,
- **Then** the file contains a `:root { ... }` block with the full token set from the UX spec §Design Tokens (lines 615–676 and 903–915). Token names use the `--v-*` prefix as declared by the UX spec. Required token groups:
  - **Colors:** `--v-color-bg #0a0e14`, `--v-color-fg #e8eaed`, `--v-color-fg-muted #9aa0a6`, `--v-color-fg-quiet #5f6368`, `--v-color-accent #d4a017`, `--v-color-accent-quiet #8a6a0e`, `--v-color-trajectory-past #e8eaed`, `--v-color-trajectory-future #5f6368`, `--v-color-ck #4a7c4e`, `--v-color-synth #d4a017`, `--v-color-focus #6b8cae`, `--v-color-overlay-scrim rgba(10, 14, 20, 0.85)`, `--v-color-divider #1f2530`.
  - **Typography families:** `--v-font-mono`, `--v-font-sans`, `--v-font-serif` with fallback stacks per UX spec line 615–617 — BUT with the self-hosted primaries set to: `--v-font-mono: 'JetBrains Mono', ui-monospace, monospace`; `--v-font-sans: 'Inter', system-ui, sans-serif`; `--v-font-serif: 'Source Serif 4', Georgia, serif`. (The UX spec's `'Söhne'`, `'Tiempos Text'` placeholders are aspirational; we self-host Inter + Source Serif 4 instead.)
  - **Typography size scale:** at minimum `--v-font-size-body` (16px floor, `clamp()` to 18px at wide viewports), `--v-font-size-hud` (mono 14px), `--v-font-size-chapter-title` (sans 28px+), `--v-font-size-chapter-copy` (serif 17px), `--v-font-size-caption` (sans 12px). Use `clamp(min, vw-based, max)` per UX spec line 614.
  - **Spacing:** 4-px discrete scale `--v-space-1 4px`, `--v-space-2 8px`, `--v-space-3 12px`, `--v-space-4 16px`, `--v-space-6 24px`, `--v-space-8 32px`, `--v-space-12 48px`, `--v-space-16 64px`; plus edge margin `--v-edge-margin: clamp(16px, 3vw, 64px)`.
  - **Motion:** `--v-duration-fast: 120ms`, `--v-duration-base: 200ms`, `--v-duration-slow: 400ms`; `--v-ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`; `--v-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)`.
  - **Z-index:** six discrete levels at minimum, in `--v-z-canvas`, `--v-z-hud`, `--v-z-scrubber`, `--v-z-overlay`, `--v-z-modal`, `--v-z-tooltip`. Values: canvas 0, hud 10, scrubber 20, overlay 30, modal 40, tooltip 50.

**AC2 — Critical first-paint tokens are inlined in `index.html`:**
- **Given** the FOUC-prevention requirement,
- **When** `web/index.html` is opened,
- **Then** the `<head>` contains a `<style>` block with the **critical subset** of tokens needed for first paint: bg/fg colors, body font-family (sans), body font-size (16px or the clamp floor), and the reduced-motion override. The full token sheet at `src/styles/tokens.css` is loaded via the standard Vite bundling chain (CSS imported from `web/src/main.ts`); the inline block is the FOUC-shim.
- **And** the inline `<style>` is no more than 1 KB minified (it's not the full token sheet — just the load-critical subset).

**AC3 — Self-hosted typography is fetched, subsetted, and committed:**
- **Given** the typography stack,
- **When** the app loads on cold cache,
- **Then** JetBrains Mono Regular, Inter Regular, and Source Serif 4 variable (weight axis 350–600 subset, latin-only subset) are loaded from `web/public/fonts/` via `@font-face` rules in `web/src/styles/fonts.css`,
- **And** each font is loaded via `<link rel="preload" as="font" type="font/woff2" crossorigin>` in `web/index.html` (immediately after the inline `<style>`),
- **And** every `@font-face` declaration uses `font-display: swap` (FOUT, not invisible-text-FOIT — UX spec line 1118-ish accessibility commitment),
- **And** the latin subset only is shipped (Unicode range `U+0020–007F` plus the few extended-latin characters NASA mission text actually uses; punctuation per the UX spec — em dash, en dash, ellipsis, smart quotes),
- **And** the combined typography asset size measured at `web/dist/assets/fonts/` after `npm run build` is **≤ 120 KB compressed** (Brotli; verify with `gzip -9` or `brotli` on the .woff2 files since woff2 is already compressed internally — measure the disk-size after build),
- **And** **no Google Fonts, no Adobe Fonts CDN, no third-party font CDN** — analytics-free per ADR 0019 / FR50.

**AC4 — Lit 3+ + `BaseElement` scaffold:**
- **Given** the Lit 3+ dependency is installed (`npm install lit` — current is 3.x),
- **When** `web/src/components/base-element.ts` is inspected,
- **Then** the file exports `class BaseElement extends LitElement` with a shared static `styles` array that includes a default Shadow DOM stylesheet adopting the design tokens (via `:host { color: var(--v-color-fg); font-family: var(--v-font-sans); }` or equivalent inheritance — the tokens are at `:root` so Shadow DOM children inherit them by default),
- **And** the file's JSDoc comment explains the BaseElement contract: future components MAY extend `BaseElement` for the shared stylesheet, or MAY extend `LitElement` directly (per Decision 5 / Step 11 — both are explicitly allowed),
- **And** an example component `web/src/components/v-version.ts` (the minimal `<v-version>` Web Component that just displays the current package.json version) is authored to demonstrate the BaseElement extension pattern. This is the smallest "hello, Lit" component the project ships; future components mirror its file shape.

**AC5 — Global focus and motion CSS rules:**
- **Given** the global focus and motion rules,
- **When** the developer tabs through any focusable element in the DOM,
- **Then** a `2px solid var(--v-color-focus)` outline with `2px` offset is rendered via a global `:focus-visible` rule in `web/src/styles/global.css` (NOT `:focus`; `:focus-visible` ensures the outline only appears for keyboard navigation, not mouse clicks). Selector: `*:focus-visible { outline: 2px solid var(--v-color-focus); outline-offset: 2px; }`.
- **And** setting `prefers-reduced-motion: reduce` in OS settings collapses `--v-duration-fast`, `--v-duration-base`, `--v-duration-slow` to `0ms` via a `@media (prefers-reduced-motion: reduce) { :root { --v-duration-fast: 0ms; --v-duration-base: 0ms; --v-duration-slow: 0ms; } }` rule. No per-component code changes are required; components consume the variables and inherit the override.
- **And** `prefers-reduced-transparency: reduce` flips `--v-color-overlay-scrim` from `rgba(10, 14, 20, 0.85)` to `#0a0e14` (fully opaque) via the same `@media` mechanism.

**AC6 — Responsive breakpoints — exactly three structural:**
- **Given** the responsive breakpoint strategy,
- **When** `web/src/styles/breakpoints.css` is inspected (or the `@media` queries are grepped from anywhere in `web/src/styles/`),
- **Then** exactly three structural breakpoints are defined:
  - `@media (max-width: 767px)` — mobile (Tier 3 phone per NFR-C3)
  - `@media (max-width: 1023px)` — tablet (Tier 2)
  - `@media (min-width: 1920px)` — large desktop
- **And** all other adaptive sizing uses `clamp()`, NOT media queries (UX spec §Responsive Breakpoint Strategy). A test counts `@media (max-width|min-width|max-height|min-height)` occurrences in `web/src/styles/`: must equal exactly 3 (the structural set above) plus any `@media (prefers-*)` accessibility queries.

## Tasks / Subtasks

- [ ] **Task 1 — Install Lit 3+** (AC: #4)
  - [ ] `cd web && npm install lit` — resolves to current 3.x (or 4.x if released; verify ≥ 3.0)
  - [ ] Verify the no-PII grep test at `web/tests/no-pii-grep.test.ts` still passes (Lit is analytics-free)
  - [ ] Add `lit` to the README's tech-stack table

- [ ] **Task 2 — Acquire self-hosted typography** (AC: #3)
  - [ ] **Decision needed:** how to acquire the fonts. Two paths:
    - **Path A (commit pre-subsetted .woff2 files directly):** Download JetBrains Mono Regular, Inter Regular, Source Serif 4 (variable) from their canonical sources (GitHub releases / official sites), subset to latin only + Source Serif 4 weight axis 350–600, commit the resulting .woff2 files under `web/public/fonts/`. Add a `THIRD_PARTY.md` entry or font-attribution file documenting the OFL licenses (JetBrains Mono OFL, Inter OFL, Source Serif 4 OFL).
    - **Path B (acquisition tool):** Author `bake/src/acquire_fonts.py` that downloads + subsets via `fonttools` (pip-installable Python lib). Subsetted .woff2 files land in `web/public/fonts/`. The script is wired into the asset-acquisition chain (and the architecture's existing `acquire_*` family — the architecture doc currently doesn't list `acquire_fonts.py`, so a small doc update is implied).
  - [ ] **Recommended path: Path A** for this story. Reasons: (1) Fonts are OFL-licensed and stable — they don't change. (2) Subsetting via `fonttools` requires adding a Python dep specifically for this one-time operation. (3) The acquisition tool can be added later (as deferred work) without breaking the runtime. (4) The committed .woff2 files are LFS-tracked (extend `.gitattributes` to include `*.woff2`).
  - [ ] **Source URLs (verified live 2026-05-18 per UX spec):**
    - JetBrains Mono: `https://github.com/JetBrains/JetBrainsMono/releases` (download latest stable; extract `JetBrainsMono-Regular.woff2`)
    - Inter: `https://github.com/rsms/inter/releases` (download latest stable; extract `Inter-Regular.woff2` from the woff2 hinted subset)
    - Source Serif 4: `https://github.com/adobe-fonts/source-serif/releases` (download latest stable; extract the variable woff2 with weight axis)
  - [ ] After subsetting, target byte budget per font: JetBrains Mono Regular ≤ 30 KB; Inter Regular ≤ 30 KB; Source Serif 4 variable ≤ 60 KB. Total ≤ 120 KB. Document the subset Unicode range in the THIRD_PARTY entry.
  - [ ] Subsetting tool: `fonttools pyftsubset` (one-off Python invocation; document the exact command in `scripts/font-subset.sh` or as a justfile recipe). Don't add fonttools to bake's runtime deps — invoke as a one-off in this story and document.
  - [ ] Extend `.gitattributes` with `*.woff2 filter=lfs diff=lfs merge=lfs -text` so committed font files are LFS-tracked.

- [ ] **Task 3 — Author `web/src/styles/tokens.css`** (AC: #1)
  - [ ] Implement the full token sheet at `:root` per AC1's enumeration. Source the exact values from the UX spec lines 614–676 + 903–915 + 1100–1104.
  - [ ] Add a header comment citing the UX spec sections so future maintainers can find the source: `/* Voyager design tokens — single source of truth. */ /* Source: _bmad-output/planning-artifacts/ux-design-specification.md §Design Tokens. */`

- [ ] **Task 4 — Author `web/src/styles/fonts.css`** (AC: #3)
  - [ ] `@font-face` declarations for JetBrains Mono, Inter, Source Serif 4 referencing the .woff2 files at `/fonts/<file>.woff2` (Vite serves `web/public/fonts/` at the root path)
  - [ ] `font-display: swap` on every declaration
  - [ ] `unicode-range` declaration limiting to the subsetted range
  - [ ] No Google Fonts imports, no @import from third-party URLs

- [ ] **Task 5 — Author `web/src/styles/global.css`** (AC: #5)
  - [ ] Global `*:focus-visible { outline: 2px solid var(--v-color-focus); outline-offset: 2px; }` rule
  - [ ] `@media (prefers-reduced-motion: reduce)` block overriding the three duration tokens to `0ms` at `:root`
  - [ ] `@media (prefers-reduced-transparency: reduce)` block overriding `--v-color-overlay-scrim` to opaque `#0a0e14`
  - [ ] Reset/normalize: `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }` (minimal CSS reset)
  - [ ] `body { background: var(--v-color-bg); color: var(--v-color-fg); font-family: var(--v-font-sans); font-size: var(--v-font-size-body); line-height: 1.55; }`

- [ ] **Task 6 — Author `web/src/styles/breakpoints.css`** (AC: #6)
  - [ ] Just the three structural breakpoint definitions as CSS custom property declarations (the actual @media usage lives in component CSS). Or, if pure tokens don't capture breakpoints well, use a `web/src/styles/breakpoints.ts` with TS constants exported.
  - [ ] **Recommended approach:** export the breakpoint values as both CSS custom properties at `:root` (`--v-bp-mobile: 767px`, `--v-bp-tablet: 1023px`, `--v-bp-wide: 1920px`) AND as TS constants in a sibling `web/src/styles/breakpoints.ts` for use in JS-side matchMedia listeners.

- [ ] **Task 7 — Inline critical-path `<style>` in `index.html`** (AC: #2)
  - [ ] Add an inline `<style>` block to `web/index.html` `<head>` with the critical-subset tokens: bg color, fg color, font-family fallback, the `prefers-reduced-motion` motion overrides. ≤ 1 KB minified.
  - [ ] Reference: UX spec line 593 mandates this for FOUC prevention.

- [ ] **Task 8 — Author `web/src/components/base-element.ts`** (AC: #4)
  - [ ] `class BaseElement extends LitElement` exported.
  - [ ] Static `styles` array adopting the tokens for Shadow DOM (`css\`:host { color: var(--v-color-fg); font-family: var(--v-font-sans); }\``).
  - [ ] JSDoc explaining the contract per AC4.

- [ ] **Task 9 — Author `web/src/components/v-version.ts`** (AC: #4)
  - [ ] Custom element `<v-version>` extending `BaseElement`.
  - [ ] Reads the version from `web/package.json` via a Vite import (`import pkg from '../../package.json'`).
  - [ ] Renders: `Voyager v{version}` in `font-family: var(--v-font-mono)`, `font-size: var(--v-font-size-caption)`, `color: var(--v-color-fg-quiet)`.
  - [ ] Co-locate `web/src/components/v-version.test.ts` — basic Lit test (use `@open-wc/testing` or a Vitest-friendly Lit test helper; the simplest path is to construct via `document.createElement('v-version')` and assert on `element.shadowRoot.textContent`).
  - [ ] **Important:** Lit testing in vitest requires jsdom or happy-dom AND a Web Components polyfill. The Vite scaffold ships happy-dom-friendly defaults. Verify on first test; if Lit needs an extra config, document and add.

- [ ] **Task 10 — Wire CSS imports into the build**
  - [ ] In `web/src/main.ts`, import the styles: `import './styles/tokens.css'; import './styles/fonts.css'; import './styles/global.css'; import './styles/breakpoints.css';` (Vite picks them up and bundles).
  - [ ] Verify `npm run build` succeeds and produces a single CSS bundle at `web/dist/assets/`.
  - [ ] Verify a Lighthouse run shows no FOUC (deferred to manual test — the inline `<style>` is the AC2 gate).

- [ ] **Task 11 — Tests**
  - [ ] `web/src/components/base-element.test.ts` — assert exports, instantiation, style adoption
  - [ ] `web/src/components/v-version.test.ts` — see Task 9
  - [ ] `web/tests/styles-tokens.test.ts` — parse `web/src/styles/tokens.css` as text and assert every token name from AC1 is present (literal substring match — catches typos in token names like `--v-color-fb` vs `--v-color-bg`)
  - [ ] `web/tests/styles-breakpoints.test.ts` — grep `web/src/styles/` (and optionally all `*.ts` files importing CSS) for `@media` query usage; assert exactly the three structural breakpoints (max-width: 767px / 1023px, min-width: 1920px) plus any `prefers-*` queries are present
  - [ ] `web/tests/fonts-bundle-size.test.ts` — after `npm run build`, measure `web/dist/assets/fonts/*.woff2` total size; assert ≤ 120 KB combined. This test runs in a `describe.skipIf(!fs.existsSync('web/dist/assets/fonts'))` block so it only runs after a build (CI will build then test).
  - [ ] `web/tests/no-google-fonts.test.ts` — grep `web/src/styles/`, `web/index.html`, and `web/package*.json` for `fonts.googleapis.com`, `fonts.gstatic.com`, `use.typekit.net`, `kit.fontawesome.com`. Assert zero matches (FR50 / ADR 0019).
  - [ ] Existing baseline (web vitest 277/277) must remain green.

- [ ] **Task 12 — README + THIRD_PARTY updates**
  - [ ] Append a "Design System" section to README documenting `src/styles/tokens.css` as the source of truth, the three breakpoints, the reduced-motion contract, and the font choices
  - [ ] Create or extend `THIRD_PARTY.md` with the OFL attribution entries for JetBrains Mono, Inter, Source Serif 4 (full OFL text references; URLs to canonical OFL licenses)

## Dev Notes

### Architectural Compliance — load-bearing constraints

- **Lit 3+ ONLY for components.** Architecture line 408, 414, ADR 0013. No React, Preact, Vue, Svelte. Lit is the first (and only) component framework.
- **Vanilla CSS with custom properties.** Architecture line 415. No Tailwind, no CSS-in-JS, no Sass/Less. PostCSS is allowed (Vite ships it for autoprefixing).
- **Self-hosted typography only.** No Google Fonts CDN — that's a tracking risk per ADR 0019 / FR50 (zero analytics) and a NFR-R3 reproducibility risk (the CDN URL changes; the bake should be byte-identical given pinned inputs).
- **Shadow DOM via Lit's default mechanism.** Architecture line 415. No manual `attachShadow` calls.
- **Pointer Events API for input.** Architecture line 418. Future stories build on this; nothing in this story needs it directly.
- **`prefers-reduced-motion` is global.** UX spec line 672, FR46, NFR-A5. One `@media` rule at `:root` flips three tokens. Components do NOT opt in individually.
- **WCAG 2.2 AA contrast.** UX spec lines 930–936. Every documented color pairing already passes; don't introduce new combinations without re-checking.

### Architecture-canonical file paths

- `web/src/styles/tokens.css` (architecture line 696, new)
- `web/src/styles/fonts.css` (new)
- `web/src/styles/global.css` (new)
- `web/src/styles/breakpoints.css` (new)
- `web/src/components/base-element.ts` (new — architecture line 603 names `BaseElement`)
- `web/src/components/v-version.ts` (new — minimal example component)
- `web/public/fonts/` (new directory — committed .woff2 files via LFS)
- `web/index.html` (existing — add inline `<style>` + preload `<link>`s)
- `THIRD_PARTY.md` at the repo root (new or extended — Story 7.5 owns the final audit but this story adds the font entries)

### File-Structure Requirements

- All design tokens MUST be in `web/src/styles/tokens.css`. No tokens defined elsewhere (component CSS uses `var(--v-*)`; never redefines).
- Fonts MUST be at `web/public/fonts/` (Vite serves `public/` at root; the `@font-face` `src: url(...)` uses `/fonts/<file>.woff2`).
- BaseElement MUST be at `web/src/components/base-element.ts` (kebab-case filename matching the architecture's naming convention line 693).

### Testing Requirements

- Co-located component tests for BaseElement and v-version
- Integration-style tests in `web/tests/` for: token presence, breakpoint count, font bundle size (post-build), no-Google-Fonts grep
- The bundle-size test requires a build pass; gate it with `skipIf(!fs.existsSync(...))` so unit-test runs without a build don't fail it
- Existing tests (277 web vitest after Story 1.6) must remain green
- New count expected: ~290–310 vitest tests after this story

### Latest Tech Information

- **Lit 3.x** (current major). 6 KB gzipped. Pure web-components base; no opinions about routing/state.
- **JetBrains Mono OFL** — current OFL license; canonical source `github.com/JetBrains/JetBrainsMono`.
- **Inter OFL** — current OFL license; canonical source `github.com/rsms/inter`.
- **Source Serif 4 OFL** — current OFL license; canonical source `github.com/adobe-fonts/source-serif`. Variable font with weight axis 200–900; we ship the 350–600 subset.
- **fonttools `pyftsubset`** — Python library for font subsetting. Standard tool; widely deployed in webfont pipelines.

### Previous Story Intelligence

- **Story 1.1 (414db52):** web scaffold with TS strict.
- **Story 1.5 (fc378fa):** Three.js renderer foundation. Branded types in `web/src/types/branded.ts`. `RenderEngine.onFrame(...)` hook available.
- **Story 1.6 (c041a0f):** ManifestLoader + EphemerisService. Zod schema validation pattern established.
- Total 22 + 8 + 8 + 9 = 47 LOW deferred items in deferred-work.md. None block this story.

### Git Intelligence

Recent commits on `epic1`:
- `c041a0f Story 1.6: Asset manifest loader + EphemerisService (Cubic Hermite L2)`
- `fc378fa Story 1.5: Three.js renderer foundation (reverse-Z + floating-origin)`
- `40144d1 Story 1.4: Bake pipeline (per-segment VTRJ) + L1 Python validation`

Branch: `epic1`. LFS at ~188 MB (will grow by ~120 KB after font commits).

### Project Context Reference

- Epic: `_bmad-output/planning-artifacts/epics.md` §Story 1.7 (lines 582–614)
- UX spec: `_bmad-output/planning-artifacts/ux-design-specification.md` §Design Tokens (lines 614–676, 903–915, 992, 1100–1118)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` §Category 5 (lines 408–442), §Decision 5 (Lit 3+ choice)
- ADRs: 0013 (Lit 3 over React/Preact/Svelte), 0019 (zero analytics — drives self-hosted fonts), 0025 (WAI-ARIA APG patterns)
- PRD: FR49 (WCAG contrast, no color-only meaning), FR50 (zero analytics)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.7]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design Tokens]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#L992] — body line-height 1.55 serif / 1.45 sans
- [Source: _bmad-output/planning-artifacts/architecture.md#Category 5]
- [Source: docs/adr/0013-lit3-web-components-over-react-preact-svelte.md]
- [Source: docs/adr/0019-zero-analytics-localstorage-only-error-capture.md]
- [Source: docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context). One-shot single-task agent under the
`epic-cycle-2026-05-18` team.

### Debug Log References

- Baseline before changes: web vitest **277/277**, bake fast **233 + 2
  skipped + 11 deselected** (slow).
- After changes: web vitest **365/365** (286 carried forward after lit
  defense exemptions removed 3 it.each cases for `lit` / `lit-html` /
  `lit-element`, plus 88 new tests for AC1–AC6), bake fast unchanged.
- Font subset run (`scripts/font-subset.py`):
  - JetBrains Mono Regular → 19,520 B (19.1 KB)
  - Inter Regular → 21,952 B (21.4 KB)
  - Source Serif 4 variable (wght 350–600) → 59,704 B (58.3 KB)
  - **Total = 101,176 B (98.8 KB)**, 21.2 KB under 120 KB budget.
- Lit 3.3.3 resolved cleanly. happy-dom 19.x added as dev dep for Lit
  component tests; vetted against the no-PII grep (clean).
- Decorator detour: Vite + vitest's esbuild transformer does not yet
  emit the TC39 decorator runtime that Lit's `@customElement` needs, so
  `v-version` registers via plain `customElements.define(...)`. Result
  is behaviorally identical (and the file is the canonical example
  pattern for future components — they should follow the same shape
  unless/until the transformer is upgraded).

### Completion Notes List

- **Font acquisition (Path A from Task 2).** Downloaded canonical OFL
  releases (JetBrains Mono v2.304, Inter v4.1, Source Serif 4 v4.005R)
  via `Invoke-WebRequest` to a workspace at `C:\temp\voyager-fonts\`
  (outside the repo). Extracted, subsetted, and committed under
  `web/public/fonts/` — three .woff2 files, LFS-tracked via
  `*.woff2 filter=lfs` added to `.gitattributes`.
- **Subsetting tool.** `fontTools 4.63.0` (Python). One-off invocation
  via `scripts/font-subset.py`; not a `bake/` runtime dep. The script
  documents the unicode-range, the name-table records preserved for OFL
  compliance, and the variable-axis clipping pass.
- **Source Serif 4 budget detour.** First pass kept all OpenType layout
  features → 133 KB combined (over budget). Trimming GPOS to
  `kern + mark + mkmk + ccmp` (lean_layout=True) brought it to 58 KB
  while preserving body-quality kerning + diacritic positioning.
- **Vite's CSS minifier rewrites `max-width: 767px` → `width<=767px`** in
  the built bundle. The Media Queries Level 4 form is equivalent; the
  breakpoint-count test runs against the source CSS so it stays exact.
- **`web/src/style.css` (Vite scaffold) deleted** — its `--text`/`--bg`
  defaults collided with the `--v-*` namespace, and its
  `@media (max-width: 1024px)` would have violated the AC6 three-
  breakpoint rule. Only `main.ts` referenced it; the new style chain
  replaces every consumer.
- **Story 1.5/1.6 defense tests updated.** `ephemeris-defense.test.ts`
  and `renderer-defense.test.ts` previously forbade Lit imports under
  `web/src/`. Lit is the sanctioned framework per ADR 0013; the
  forbid-list now omits `lit / lit-html / lit-element` while continuing
  to ban React/Preact/Vue/Svelte/state libs.
- **Architecture-doc gap (LOW deferred).** The architecture's existing
  `acquire_*` family in `bake/src/` does not list `acquire_fonts.py`;
  Path A here sidesteps that by treating font acquisition as a one-off
  build step rather than wiring it into the runtime data pipeline.
  Future story can promote `scripts/font-subset.py` into a CI-runnable
  recipe if reproducibility audits surface it.

### File List

#### New — production code

- `web/src/styles/tokens.css` — single design-token source-of-truth
- `web/src/styles/fonts.css` — `@font-face` rules for the three faces
- `web/src/styles/global.css` — reset, focus, motion + transparency overrides
- `web/src/styles/breakpoints.css` — the three structural @media rules
- `web/src/styles/breakpoints.ts` — TS constants + matchMedia query strings
- `web/src/components/base-element.ts` — Lit base with token-aware Shadow CSS
- `web/src/components/v-version.ts` — `<v-version>` demo component
- `web/public/fonts/jetbrains-mono-regular.woff2` (19,520 B, LFS)
- `web/public/fonts/inter-regular.woff2` (21,952 B, LFS)
- `web/public/fonts/source-serif-4-variable.woff2` (59,704 B, LFS)

#### New — tests

- `web/tests/styles-tokens.test.ts`
- `web/tests/styles-breakpoints.test.ts`
- `web/tests/no-google-fonts.test.ts`
- `web/tests/fonts-bundle-size.test.ts`
- `web/src/components/base-element.test.ts`
- `web/src/components/v-version.test.ts`

#### New — tooling + docs

- `scripts/font-subset.py` — fonttools-based one-off subset recipe
- `THIRD_PARTY.md` — OFL attribution for the three font families

#### Modified

- `web/package.json` — adds `lit ^3.3.3` (dep) + `happy-dom ^19.x` (dev)
- `web/package-lock.json` — install side-effects
- `web/index.html` — inline FOUC-shim `<style>`, font preloads, title
- `web/src/main.ts` — switches CSS import chain to the design-tokens set
- `web/tests/ephemeris-defense.test.ts` — drops `lit*` from forbid list
- `web/tests/renderer-defense.test.ts` — drops `lit / lit/` forbid patterns
- `.gitattributes` — `*.woff2 filter=lfs diff=lfs merge=lfs -text`
- `README.md` — appended "Design System" section
- `_bmad-output/implementation-artifacts/1-7-design-tokens-lit-3-scaffold-and-self-hosted-typography.md` — status + Dev Agent Record

#### Removed

- `web/src/style.css` — Vite scaffold sheet; replaced by the new chain
