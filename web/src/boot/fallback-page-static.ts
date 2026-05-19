// Pure static helpers for <v-fallback-page>: no Lit imports, no browser
// globals. Safe to import from `vite.config.ts` (Node) for build-time
// pre-rendering of `dist/unsupported.html`. The Lit element itself lives
// in `v-fallback-page.ts` and consumes these constants.
//
// Why this file exists: Vite evaluates `vite.config.ts` in Node. Importing
// the Lit-decorated component module from the config crashes on
// `customElements is not defined` (and risks pulling Lit's runtime into
// the config bundle for no benefit). Hoisting the static copy + helpers
// here keeps the build-time path Node-clean.

export type FallbackReason = 'webgl2' | 'wasm' | 'brotli';

const REASONS: ReadonlySet<FallbackReason> = new Set(['webgl2', 'wasm', 'brotli']);

export const FALLBACK_HEADLINE = 'Voyager — Browser Not Supported';

export const FALLBACK_REASON_COPY: Record<FallbackReason, string> = {
  webgl2: "Voyager requires WebGL 2 — your browser doesn't appear to support it.",
  wasm: "Voyager requires WebAssembly — your browser doesn't appear to support it.",
  brotli:
    "Voyager requires modern brotli decoding (DecompressionStream) — your browser doesn't appear to support it.",
};

export interface BrowserLink {
  readonly name: string;
  readonly href: string;
  readonly hostnameText: string;
}

export const FALLBACK_BROWSER_LINKS: ReadonlyArray<BrowserLink> = [
  { name: 'Chrome', href: 'https://www.google.com/chrome/', hostnameText: 'google.com/chrome' },
  { name: 'Firefox', href: 'https://www.mozilla.org/firefox/', hostnameText: 'mozilla.org/firefox' },
  { name: 'Safari', href: 'https://www.apple.com/safari/', hostnameText: 'apple.com/safari' },
];

export const FALLBACK_REASONS: ReadonlyArray<FallbackReason> = ['webgl2', 'wasm', 'brotli'];

export const normalizeFallbackReason = (reason: string | null | undefined): FallbackReason => {
  if (reason !== null && reason !== undefined && REASONS.has(reason as FallbackReason)) {
    return reason as FallbackReason;
  }
  return 'webgl2';
};

/**
 * Static HTML-string version of the <v-fallback-page> body. Returns the
 * `<main>...</main>` content only (no document scaffold). The Vite plugin
 * wraps this in the full HTML5 document with inlined CSS and the
 * `?reason` swap script.
 *
 * All three `<p data-reason-copy="X">` variants are rendered; the CSS
 * driven by `<main data-reason="X">` selects which one is visible. With
 * JS disabled, the baked-in `data-reason="webgl2"` is the displayed
 * variant.
 */
export const renderFallbackPageHTML = (reason: FallbackReason | string = 'webgl2'): string => {
  const r = normalizeFallbackReason(reason);
  const links = FALLBACK_BROWSER_LINKS.map(
    (b) => `        <li><a href="${b.href}" rel="noopener">${b.hostnameText}</a></li>`,
  ).join('\n');
  return [
    `<main data-reason="${r}">`,
    `  <h1>${FALLBACK_HEADLINE}</h1>`,
    `  <p data-reason-copy="webgl2">${FALLBACK_REASON_COPY.webgl2}</p>`,
    `  <p data-reason-copy="wasm">${FALLBACK_REASON_COPY.wasm}</p>`,
    `  <p data-reason-copy="brotli">${FALLBACK_REASON_COPY.brotli}</p>`,
    `  <p class="browsers-intro">Try the latest version of one of these browsers and reload this page:</p>`,
    `  <ul>`,
    links,
    `  </ul>`,
    `</main>`,
  ].join('\n');
};

/**
 * Inline CSS for the pre-rendered static page. Mirror of the Lit
 * component's `static styles` but flattened to a single string (no Shadow
 * DOM in the static HTML; selectors target the document). Hand-minified;
 * target size ≤ 2 KB.
 */
export const renderFallbackPageInlineCSS = (): string => {
  return [
    `@font-face{font-family:'Inter';font-style:normal;font-weight:400;font-display:swap;src:url('/fonts/inter-regular.woff2') format('woff2')}`,
    `@font-face{font-family:'Source Serif 4';font-style:normal;font-weight:350 600;font-display:swap;src:url('/fonts/source-serif-4-variable.woff2') format('woff2-variations'),url('/fonts/source-serif-4-variable.woff2') format('woff2')}`,
    `:root{--v-color-bg:#0a0e14;--v-color-fg:#e8eaed;--v-color-fg-muted:#9aa0a6;--v-color-accent:#d4a017;--v-color-focus:#6b8cae;--v-font-sans:'Inter',system-ui,sans-serif;--v-font-serif:'Source Serif 4',Georgia,serif}`,
    `html,body{margin:0;background:var(--v-color-bg);color:var(--v-color-fg);font-family:var(--v-font-sans);font-size:clamp(16px,.95rem + .25vw,18px)}`,
    `body{padding:clamp(16px,3vw,64px);box-sizing:border-box;min-height:100vh}`,
    `main{max-width:720px;margin:0 auto;padding-top:64px}`,
    `h1{font-size:clamp(28px,1.4rem + 1.2vw,40px);font-weight:600;line-height:1.2;margin:0 0 24px}`,
    `p{font-family:var(--v-font-serif);font-size:clamp(17px,1rem + .2vw,20px);line-height:1.55;margin:0 0 32px}`,
    `.browsers-intro{font-family:var(--v-font-sans);color:var(--v-color-fg-muted);margin-bottom:12px}`,
    `ul{list-style:none;padding:0;margin:0}`,
    `li{margin-bottom:8px;color:var(--v-color-fg-muted)}`,
    `a{color:var(--v-color-accent);text-decoration:underline;text-underline-offset:.15em}`,
    `a:hover,a:focus-visible{color:var(--v-color-fg)}`,
    `a:focus-visible{outline:2px solid var(--v-color-focus);outline-offset:2px}`,
    `[data-reason-copy]{display:none}`,
    `[data-reason="webgl2"] [data-reason-copy="webgl2"],[data-reason="wasm"] [data-reason-copy="wasm"],[data-reason="brotli"] [data-reason-copy="brotli"]{display:block}`,
  ].join('\n');
};

/**
 * Tiny inline script for `?reason` runtime swap. Reads URLSearchParams,
 * validates the value, and sets `<main>` dataset.reason — the CSS does
 * the rest. ≤ 1 KB minified.
 */
export const renderFallbackPageSwapScript = (): string => {
  return `(function(){var r=new URLSearchParams(location.search).get('reason');if(r==='webgl2'||r==='wasm'||r==='brotli'){var m=document.querySelector('main');if(m)m.dataset.reason=r;}})();`;
};
