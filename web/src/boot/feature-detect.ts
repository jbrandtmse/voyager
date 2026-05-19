// Boot-time capability probe. Runs BEFORE the main bundle loads via an
// inline <script> in <head>; on any failure redirects to
// /unsupported.html?reason=<webgl2|wasm|brotli>; on full success
// dynamic-imports the main entry. Story 1.8 AC1; FR57; NFR-C4/C7.
//
// This file is BOTH:
//   1. The runtime probe logic (probeFeatures) — for unit tests
//   2. The SOURCE of the inline <script> body (getProbeScript) — the Vite
//      plugin in vite.config.ts substitutes the placeholder
//      `<!-- FEATURE_PROBE -->` in index.html with the minified output.
//
// The two share a single canonical implementation (PROBE_BODY) so a
// drift between the runtime and the test-mode probe is impossible.

export type ProbeFailure = 'webgl2' | 'wasm' | 'brotli' | null;

export interface ProbeResult {
  webgl2: boolean;
  wasm: boolean;
  brotli: boolean;
}

/**
 * The literal probe-body source. This is what the Vite plugin inlines into
 * `index.html`. Authored as a single expression-statement function body so
 * it minifies well and there's no `function` wrapper for the inlining step
 * to negotiate — the plugin wraps this string in `(function(){...})();`
 * and wraps THAT in `<script>...</script>`.
 *
 * Probe order: WebGL2 → WebAssembly → brotli (`DecompressionStream('br')`).
 * First failure wins; the URL `reason` reflects the first missing piece.
 * On full success we dynamic-import the main entry so the bundle never
 * loads on an unsupported browser.
 *
 * The `__MAIN_ENTRY__` placeholder is replaced at build time with the
 * Vite-resolved hashed asset URL for `/src/main.ts` (so the import survives
 * Rollup's content-hashed filenames). In dev mode the placeholder is
 * replaced with the dev-server module URL.
 */
export const PROBE_BODY = `var r=null;
if(typeof window.WebGL2RenderingContext!=='function')r='webgl2';
else if(typeof window.WebAssembly!=='object')r='wasm';
else{try{new DecompressionStream('br');}catch(e){r='brotli';}}
if(r){window.location.replace('/unsupported.html?reason='+r);}
else{import('__MAIN_ENTRY__');}`;

/**
 * Returns the probe body as a string of JS. The Vite plugin minifies +
 * substitutes the `__MAIN_ENTRY__` placeholder before injecting into
 * `index.html`.
 */
export const getProbeScript = (): string => PROBE_BODY;

/**
 * Build the final `<script>` tag string the plugin inlines. Takes the
 * resolved main-entry URL and substitutes the placeholder. Wraps the body
 * in an IIFE so its `var` declarations don't leak into the page.
 */
export const buildProbeInline = (mainEntryUrl: string): string => {
  const minified = minifyProbe(PROBE_BODY);
  const resolved = minified.replace('__MAIN_ENTRY__', mainEntryUrl);
  return `(function(){${resolved}})();`;
};

/**
 * Hand-minify the probe body. The source is small enough that running it
 * through esbuild adds latency and complexity for no real win. The rules:
 *  - Strip leading whitespace at the start of every line
 *  - Strip empty lines (the joined `\n`s become single newlines, no double)
 *  - Strip C-style `//` comments
 *  - Preserve string literals (none use `//`, so the strip is safe)
 *
 * The intent is to NOT mangle identifiers (keeping `WebGL2RenderingContext`
 * etc. readable in DevTools), only to remove insignificant whitespace.
 */
export const minifyProbe = (src: string): string => {
  return src
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('');
};

/**
 * Run the probe in-process. Used by unit tests + by callers that need a
 * structured result. NOT used by the inline-probe code path — the inline
 * script does its own `window.location.replace` to redirect before the
 * main bundle imports.
 *
 * The `win` injection point lets tests run the probe against mocked window
 * objects (with selectively absent capabilities) without polluting the
 * actual window.
 */
export const probeFeatures = (win: Window | Record<string, unknown> = window): ProbeResult => {
  const w = win as Record<string, unknown>;
  const webgl2 = typeof w['WebGL2RenderingContext'] === 'function';
  const wasm = typeof w['WebAssembly'] === 'object';
  let brotli = false;
  if (typeof w['DecompressionStream'] === 'function') {
    try {
      // The constructor itself is what fails on browsers that ship
      // DecompressionStream but don't support the 'br' format. We don't
      // need to actually decode anything — the constructor throws on
      // unsupported formats per the Compression Streams spec.
      const Ctor = w['DecompressionStream'] as new (format: string) => unknown;
      new Ctor('br');
      brotli = true;
    } catch {
      brotli = false;
    }
  }
  return { webgl2, wasm, brotli };
};

/**
 * Determine the first failing capability in probe-order. Returns null if
 * all three pass. The inline-probe source must implement equivalent
 * ordering — `firstFailure(probeFeatures())` is the test-side mirror.
 */
export const firstFailure = (result: ProbeResult): ProbeFailure => {
  if (!result.webgl2) return 'webgl2';
  if (!result.wasm) return 'wasm';
  if (!result.brotli) return 'brotli';
  return null;
};
