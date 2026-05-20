// @vitest-environment happy-dom
//
// Story 1.8 defense-in-depth tripwires.
//
// These tests complement the dev's co-located unit tests + build-output
// suites with regression guards on the contracts most likely to drift
// silently:
//
//  - Probe ordering invariants (webgl2 -> wasm -> brotli)
//  - The "no static <script type=module src=/src/main.ts>" promise in
//    index.html (AC1's explicit prohibition)
//  - The full success path (all caps present -> NO redirect, dynamic import
//    IS invoked)
//  - Reason-attribute contract surface on <v-fallback-page>
//  - Body-copy ↔ capability-name coupling (so accidental copy edits trip)
//  - Browser-recommendation href ↔ visible-text alignment
//  - font-display: swap on every @font-face (progressive-enhancement
//    promise: page is readable even with /fonts/ absent)
//  - Probe + swap-script size tripwires below the spec ceiling (early
//    warning, not crash boundary)
//  - SOURCE web/unsupported.html stays an empty placeholder (proof the
//    build-time pre-render is the source of truth)
//  - IIFE wrapping of the probe (no global scope pollution)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  PROBE_BODY,
  buildProbeInline,
  firstFailure,
  probeFeatures,
} from '../src/boot/feature-detect';
import {
  FALLBACK_BROWSER_LINKS,
  FALLBACK_REASON_COPY,
  FALLBACK_REASONS,
  normalizeFallbackReason,
  renderFallbackPageHTML,
} from '../src/boot/fallback-page-static';

import type { VFallbackPage } from '../src/components/v-fallback-page';
import '../src/components/v-fallback-page';

const webRoot = resolve(__dirname, '..');
const indexHtmlSource = resolve(webRoot, 'index.html');
const unsupportedHtmlSource = resolve(webRoot, 'unsupported.html');
const distIndex = resolve(webRoot, 'dist', 'index.html');
const distUnsupported = resolve(webRoot, 'dist', 'unsupported.html');
const distHasIndex = existsSync(distIndex);
const distHasUnsupported = existsSync(distUnsupported);

// Mirror feature-detect.test.ts's stub builder so we can drive probeFeatures
// with cap-specific shapes without polluting the global window.
// Story 1.16 removed the brotli probe; only webgl2 + wasm are probed now.
// (The fallback page still renders a brotli copy variant as defensive dead
// code if a stray `?reason=brotli` URL is hit, but the probe never emits it.)
const makeWin = (caps: {
  webgl2?: boolean;
  wasm?: boolean;
}): Record<string, unknown> => {
  const w: Record<string, unknown> = {};
  if (caps.webgl2) {
    w['WebGL2RenderingContext'] = function WebGL2RenderingContext() {
      /* stub constructor */
    };
  }
  if (caps.wasm) {
    w['WebAssembly'] = {};
  }
  return w;
};

// -----------------------------------------------------------------------
// 1. Probe order is deterministic — first failure wins per the canonical
//    sequence webgl2 -> wasm (post-Story-1.16; previously included brotli).
// -----------------------------------------------------------------------
describe('Story 1.8 defense — probe order is deterministic (amended Story 1.16)', () => {
  it('reports webgl2 when both capabilities are missing', () => {
    const win = makeWin({ webgl2: false, wasm: false });
    expect(firstFailure(probeFeatures(win))).toBe('webgl2');
  });

  it('reports wasm when only webgl2 is present', () => {
    const win = makeWin({ webgl2: true, wasm: false });
    expect(firstFailure(probeFeatures(win))).toBe('wasm');
  });

  it('returns null when both capabilities are present (brotli no longer probed)', () => {
    const win = makeWin({ webgl2: true, wasm: true });
    expect(firstFailure(probeFeatures(win))).toBeNull();
  });

  it('ignores DecompressionStream entirely (Story 1.16 architectural change)', () => {
    const win = makeWin({ webgl2: true, wasm: true });
    // Even a DecompressionStream that throws on every format must not cause
    // the probe to fail — brotli decompression now happens via wasm polyfill
    // in the chunk loader, gated only on WebAssembly support.
    win['DecompressionStream'] = function DecompressionStream(format: string) {
      throw new TypeError(`unsupported format: ${format}`);
    };
    expect(firstFailure(probeFeatures(win))).toBeNull();
  });
});

// -----------------------------------------------------------------------
// 2. The all-caps-present path is the NEGATIVE redirect case: no
//    window.location.replace; the dynamic import IS invoked.
//
// We exercise the actual PROBE_BODY source (substituting __MAIN_ENTRY__
// with a fake URL and a tracking dynamic-import shim) so the inline
// script's branching is observed end-to-end, not a parallel TS mirror.
// -----------------------------------------------------------------------
describe('Story 1.8 defense — full-success path does NOT redirect', () => {
  it('with all three caps present, location.replace is NOT called and import IS called', () => {
    const replaceCalls: string[] = [];
    const importCalls: string[] = [];
    const fakeMainUrl = '/assets/main-FAKE.js';

    // Build the inline body the plugin emits, then evaluate it via Function
    // with a controlled scope. We rebind `window`, `import` (as a function),
    // and `DecompressionStream` so the IIFE sees a fully-supported browser.
    const inlineBody = buildProbeInline(fakeMainUrl);
    // Strip the outer IIFE wrapper so we can re-wrap with our own scope.
    // buildProbeInline returns `(function(){<body>})();`
    const inner = inlineBody.replace(/^\(function\(\)\{/, '').replace(/\}\)\(\);$/, '');

    const fakeWindow = {
      WebGL2RenderingContext: function () {
        /* stub */
      },
      WebAssembly: {},
      DecompressionStream: function (_format: string) {
        /* full br support */
      },
      location: {
        replace(url: string) {
          replaceCalls.push(url);
        },
      },
    };

    // Provide our own `import` shim via a function arg. JS reserves `import`
    // as a statement, but we can intercept it by wrapping the snippet in a
    // function that has `DecompressionStream` and `window` in scope; the
    // inlined `import('/...')` is treated as a dynamic import expression at
    // runtime. To trap it, we substitute `import(` -> `__import(` in the
    // body before evaluation and provide __import as a real function.
    const trapped = inner.replace(/import\(/g, '__import(');

    const runner = new Function(
      'window',
      'DecompressionStream',
      '__import',
      `${trapped}`,
    ) as (
      w: typeof fakeWindow,
      D: (f: string) => void,
      i: (url: string) => unknown,
    ) => void;

    runner(fakeWindow, fakeWindow.DecompressionStream, (url: string) => {
      importCalls.push(url);
      return Promise.resolve({});
    });

    expect(replaceCalls).toHaveLength(0);
    expect(importCalls).toEqual([fakeMainUrl]);
  });

  it('with webgl2 missing, location.replace IS called and import is NOT called', () => {
    const replaceCalls: string[] = [];
    const importCalls: string[] = [];

    const inlineBody = buildProbeInline('/assets/main-FAKE.js');
    const inner = inlineBody.replace(/^\(function\(\)\{/, '').replace(/\}\)\(\);$/, '');

    const fakeWindow = {
      // WebGL2RenderingContext intentionally absent
      WebAssembly: {},
      DecompressionStream: function (_format: string) {
        /* stub */
      },
      location: {
        replace(url: string) {
          replaceCalls.push(url);
        },
      },
    };

    const trapped = inner.replace(/import\(/g, '__import(');
    const runner = new Function(
      'window',
      'DecompressionStream',
      '__import',
      trapped,
    ) as (w: typeof fakeWindow, D: (f: string) => void, i: (url: string) => unknown) => void;

    runner(fakeWindow, fakeWindow.DecompressionStream, (url: string) => {
      importCalls.push(url);
      return Promise.resolve({});
    });

    expect(replaceCalls).toEqual(['/unsupported.html?reason=webgl2']);
    expect(importCalls).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// 3. Static `<script type="module" src="/src/main.ts">` MUST NOT exist in
//    index.html (source) — AC1's explicit prohibition.
// -----------------------------------------------------------------------
describe('Story 1.8 defense — no static module entry in index.html', () => {
  it('source web/index.html has zero <script type="module" src="..."> tags', () => {
    const html = readFileSync(indexHtmlSource, 'utf8');
    // Match any <script ... type="module" ... src=...> regardless of attr order.
    // The probe is INLINE (no src attribute), so this regex must miss it.
    const tagRe = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=/gi;
    const matches = html.match(tagRe);
    expect(matches, `Found static module script tag(s): ${matches?.join('|')}`).toBeNull();
  });

  it('source web/index.html does not reference /src/main.ts as a script src', () => {
    const html = readFileSync(indexHtmlSource, 'utf8');
    // The dynamic import inside the probe DOES reference /src/main.ts via
    // the __MAIN_ENTRY__ placeholder (resolved at build time). But that's a
    // JS expression, not an HTML attribute. The forbidden form is a `src=`
    // attribute referencing /src/main.ts.
    expect(html).not.toMatch(/\bsrc\s*=\s*["'][^"']*\/src\/main\.ts/);
  });

  it.skipIf(!distHasIndex)(
    'built dist/index.html has zero <script type="module" src="..."> tags',
    () => {
      const html = readFileSync(distIndex, 'utf8');
      const tagRe = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=/gi;
      const matches = html.match(tagRe);
      expect(matches).toBeNull();
    },
  );
});

// -----------------------------------------------------------------------
// 4. <v-fallback-page>.reason attribute contract — three documented values
//    map to documented copy; anything else falls back to webgl2 (the
//    dev-chosen behavior, confirmed by normalizeFallbackReason).
// -----------------------------------------------------------------------
describe('Story 1.8 defense — <v-fallback-page> reason contract', () => {
  it('reason="webgl2" renders the webgl2 sentence', async () => {
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    el.setAttribute('reason', 'webgl2');
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot?.textContent ?? '').toContain(FALLBACK_REASON_COPY.webgl2);
    document.body.removeChild(el);
  });

  it('reason="wasm" renders the wasm sentence', async () => {
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    el.setAttribute('reason', 'wasm');
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot?.textContent ?? '').toContain(FALLBACK_REASON_COPY.wasm);
    document.body.removeChild(el);
  });

  it('reason="brotli" renders the brotli sentence', async () => {
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    el.setAttribute('reason', 'brotli');
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot?.textContent ?? '').toContain(FALLBACK_REASON_COPY.brotli);
    document.body.removeChild(el);
  });

  it('reason="unknown" defaults to the webgl2 variant (does not error)', async () => {
    // Documents the contract: unrecognized reasons normalize to webgl2.
    // (normalizeFallbackReason is the authoritative implementation.)
    expect(normalizeFallbackReason('unknown')).toBe('webgl2');
    expect(normalizeFallbackReason(null)).toBe('webgl2');
    expect(normalizeFallbackReason('')).toBe('webgl2');
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    el.setAttribute('reason', 'unknown');
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot?.textContent ?? '').toContain(FALLBACK_REASON_COPY.webgl2);
    document.body.removeChild(el);
  });
});

// -----------------------------------------------------------------------
// 5. Each reason variant's body copy contains the capability name LITERALLY.
//    Locks against accidental copy edits that lose the meaning ("requires
//    decoding" without the word brotli, etc.).
// -----------------------------------------------------------------------
describe('Story 1.8 defense — body copy contains capability name literally', () => {
  it('webgl2 body contains "WebGL 2"', () => {
    expect(FALLBACK_REASON_COPY.webgl2).toContain('WebGL 2');
  });

  it('wasm body contains "WebAssembly"', () => {
    expect(FALLBACK_REASON_COPY.wasm).toContain('WebAssembly');
  });

  it('brotli body contains "DecompressionStream" or "brotli"', () => {
    const body = FALLBACK_REASON_COPY.brotli;
    expect(body.includes('DecompressionStream') || body.includes('brotli')).toBe(true);
  });
});

// -----------------------------------------------------------------------
// 6. Browser-recommendation links: href and visible text are aligned.
// -----------------------------------------------------------------------
describe('Story 1.8 defense — browser-recommendation href ↔ text alignment', () => {
  const byName = (name: string) => FALLBACK_BROWSER_LINKS.find((b) => b.name === name);

  it('Chrome href + visible text', () => {
    const chrome = byName('Chrome');
    expect(chrome).toBeTruthy();
    expect(chrome!.href).toBe('https://www.google.com/chrome/');
    expect(chrome!.hostnameText).toContain('google.com/chrome');
  });

  it('Firefox href + visible text', () => {
    const ff = byName('Firefox');
    expect(ff).toBeTruthy();
    expect(ff!.href).toBe('https://www.mozilla.org/firefox/');
    expect(ff!.hostnameText).toContain('mozilla.org/firefox');
  });

  it('Safari href + visible text', () => {
    const safari = byName('Safari');
    expect(safari).toBeTruthy();
    expect(safari!.href).toBe('https://www.apple.com/safari/');
    expect(safari!.hostnameText).toContain('apple.com/safari');
  });

  it('rendered <v-fallback-page> emits exactly three links and the hrefs+texts agree', async () => {
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    document.body.appendChild(el);
    await el.updateComplete;
    const anchors = Array.from(el.shadowRoot?.querySelectorAll('li a') ?? []);
    expect(anchors).toHaveLength(3);
    for (const a of anchors) {
      const href = a.getAttribute('href') ?? '';
      const text = a.textContent?.trim() ?? '';
      // Find the matching definition and assert text matches the catalog's
      // hostnameText (i.e. href and text don't drift independently).
      const def = FALLBACK_BROWSER_LINKS.find((b) => b.href === href);
      expect(def, `Anchor href ${href} not in catalog`).toBeTruthy();
      expect(text).toBe(def!.hostnameText);
    }
    document.body.removeChild(el);
  });
});

// -----------------------------------------------------------------------
// 7. Progressive-enhancement promise: every @font-face in the static
//    unsupported page uses font-display:swap. With /fonts/ absent, the
//    text remains readable via system-font fallback.
// -----------------------------------------------------------------------
describe('Story 1.8 defense — fonts use font-display: swap (works without /fonts/)', () => {
  it.skipIf(!distHasUnsupported)(
    'every @font-face in dist/unsupported.html declares font-display: swap',
    () => {
      const html = readFileSync(distUnsupported, 'utf8');
      const faceRe = /@font-face\s*\{[^}]*\}/g;
      const faces = html.match(faceRe);
      expect(faces, 'expected at least one @font-face in inline CSS').toBeTruthy();
      expect(faces!.length).toBeGreaterThanOrEqual(1);
      for (const face of faces!) {
        expect(
          face,
          `font-display:swap missing from @font-face block: ${face}`,
        ).toMatch(/font-display\s*:\s*swap/);
        // Negative: must not use font-display:block (FOIT) or :optional.
        expect(face).not.toMatch(/font-display\s*:\s*block/);
        expect(face).not.toMatch(/font-display\s*:\s*optional/);
      }
    },
  );
});

// -----------------------------------------------------------------------
// 8. Inline probe minified size has a 10% buffer below the 1024 B ceiling.
//    Spec budget = 1024; story-measured = 750. Tripwire fires at 900 —
//    well before the 1024 crash boundary — so a 150 B probe-logic addition
//    surfaces in QA before it ships.
// -----------------------------------------------------------------------
describe('Story 1.8 defense — inline probe size tripwire', () => {
  it.skipIf(!distHasIndex)(
    'inline probe <script> body in dist/index.html is ≤ 900 bytes (tripwire below 1024 ceiling)',
    () => {
      const html = readFileSync(distIndex, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      const m = html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/);
      expect(m).toBeTruthy();
      const body = m![1];
      const size = Buffer.byteLength(body, 'utf8');
      expect(
        size,
        `Inline probe is ${size} B (tripwire 900, ceiling 1024). ` +
          `Investigate before the ceiling is reached.`,
      ).toBeLessThanOrEqual(900);
    },
  );

  it('buildProbeInline output is ≤ 900 bytes with a representative hashed asset URL', () => {
    const inline = buildProbeInline('/assets/main-Lh3F4nKp.js');
    const size = Buffer.byteLength(inline, 'utf8');
    expect(size).toBeLessThanOrEqual(900);
  });
});

// -----------------------------------------------------------------------
// 9. unsupported.html swap-script size guard (≤ 256 B minified).
//    Story-measured = 179 B. Tripwire fires before the script bloats into
//    territory that would justify externalizing it.
// -----------------------------------------------------------------------
describe('Story 1.8 defense — swap script size tripwire', () => {
  it.skipIf(!distHasUnsupported)(
    'inline swap <script> body in dist/unsupported.html is ≤ 256 bytes',
    () => {
      const html = readFileSync(distUnsupported, 'utf8');
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
      expect(bodyMatch).toBeTruthy();
      const bodyHtml = bodyMatch![1];
      const scriptMatch = bodyHtml.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/);
      expect(scriptMatch).toBeTruthy();
      const swapBody = scriptMatch![1];
      const size = Buffer.byteLength(swapBody, 'utf8');
      expect(
        size,
        `Swap script body is ${size} B (tripwire 256). If swap logic is ` +
          `growing past this, reconsider whether it belongs inline.`,
      ).toBeLessThanOrEqual(256);
    },
  );
});

// -----------------------------------------------------------------------
// 10. The SOURCE web/unsupported.html stays an empty placeholder. The
//     rendered fallback content lives ONLY in dist/, emitted at build time
//     by the Vite plugin. If someone "helpfully" pre-fills the source,
//     the build-time pre-render contract is silently defeated.
// -----------------------------------------------------------------------
describe('Story 1.8 defense — source unsupported.html stays a placeholder', () => {
  it('source web/unsupported.html does NOT contain rendered headline copy', () => {
    const html = readFileSync(unsupportedHtmlSource, 'utf8');
    // Negative: the rendered headline "Voyager — Browser Not Supported"
    // appears in the <title> of the source (that's hand-authored). The
    // rendered fallback's specific headline string per Story 1.8 AC is the
    // same value, BUT the rendered <h1> body copy with the capability
    // sentence should NOT exist in the source.
    expect(html).not.toContain('Voyager requires WebGL 2');
    expect(html).not.toContain('Voyager requires WebAssembly');
    expect(html).not.toContain('Voyager requires modern brotli');
  });

  it('source web/unsupported.html contains the three substitution placeholders', () => {
    const html = readFileSync(unsupportedHtmlSource, 'utf8');
    expect(html).toContain('<!-- FALLBACK_BODY -->');
    expect(html).toContain('/* FALLBACK_INLINE_CSS */');
    expect(html).toContain('/* FALLBACK_SWAP_SCRIPT */');
  });

  it('source web/unsupported.html does NOT contain any browser-recommendation links', () => {
    const html = readFileSync(unsupportedHtmlSource, 'utf8');
    expect(html).not.toContain('google.com/chrome');
    expect(html).not.toContain('mozilla.org/firefox');
    expect(html).not.toContain('apple.com/safari');
  });
});

// -----------------------------------------------------------------------
// 11. The inline probe is IIFE-wrapped — no var declarations leak into the
//     global scope. Either classic `(function(){...})()` or arrow
//     `(()=>{...})()` is acceptable. Story 1.8 picked the classic form.
// -----------------------------------------------------------------------
describe('Story 1.8 defense — probe is IIFE-wrapped', () => {
  it('buildProbeInline output starts with an IIFE opener and ends with IIFE invocation', () => {
    const inline = buildProbeInline('/assets/main-FAKE.js');
    // Accept either classic function IIFE or arrow IIFE
    const classic = inline.startsWith('(function(){') || inline.startsWith('!function(){');
    const arrow = inline.startsWith('(()=>{') || inline.startsWith('(()=>') || inline.startsWith('(async()=>');
    expect(
      classic || arrow,
      `Expected probe to start with an IIFE opener; got ${inline.slice(0, 20)}...`,
    ).toBe(true);
    // And end with `)()` or `})();` or `)();` depending on form.
    expect(
      inline.endsWith('})();') || inline.endsWith(')()') || inline.endsWith(')();'),
      `Expected probe to end with IIFE invocation; got ...${inline.slice(-12)}`,
    ).toBe(true);
  });

  it.skipIf(!distHasIndex)(
    'inline probe in dist/index.html is wrapped in an IIFE (no top-level var leak)',
    () => {
      // Strip HTML comments first — the docstring above the probe contains
      // the literal text `<script>` (as documentation), which fools the
      // naive script regex.
      const html = readFileSync(distIndex, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      const m = html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/);
      expect(m).toBeTruthy();
      const body = m![1].trim();
      const classic = body.startsWith('(function(){') || body.startsWith('!function(){');
      const arrow = body.startsWith('(()=>{') || body.startsWith('(()=>');
      expect(classic || arrow, `Probe is not IIFE-wrapped: ${body.slice(0, 30)}...`).toBe(true);
      // The body declares `var r=...` — assert that the bare keyword is
      // INSIDE the wrapper (i.e. the wrapper opener appears before `var `).
      const varIdx = body.indexOf('var ');
      const wrapIdx = Math.max(body.indexOf('function(){'), body.indexOf('()=>{'));
      expect(varIdx).toBeGreaterThan(wrapIdx);
    },
  );

  it('PROBE_BODY itself contains no top-level let/const declarations (only var inside IIFE)', () => {
    // The wrapper adds the IIFE; the body is `var r=null; ...`. If a future
    // edit replaced `var` with `let`/`const` at the top of PROBE_BODY,
    // hoisting semantics shift and the IIFE wrapper would still scope it
    // fine, but the intent here is just to lock against accidental
    // top-level lexical declarations (which IDE auto-fixes love to add).
    const firstNonComment = PROBE_BODY.split('\n').find((l) => l.trim().length > 0) ?? '';
    expect(firstNonComment).toMatch(/^\s*var\s/);
  });
});

// -----------------------------------------------------------------------
// Catalog completeness: FALLBACK_REASONS must enumerate every key in
// FALLBACK_REASON_COPY, and renderFallbackPageHTML must emit a
// data-reason-copy entry for each. Catches the bug where a new reason is
// added to one map but not the other.
// -----------------------------------------------------------------------
describe('Story 1.8 defense — reason catalog consistency', () => {
  it('FALLBACK_REASONS keys == FALLBACK_REASON_COPY keys', () => {
    expect([...FALLBACK_REASONS].sort()).toEqual(Object.keys(FALLBACK_REASON_COPY).sort());
  });

  it('renderFallbackPageHTML emits one <p data-reason-copy="X"> per reason', () => {
    const html = renderFallbackPageHTML('webgl2');
    for (const reason of FALLBACK_REASONS) {
      expect(html).toContain(`data-reason-copy="${reason}"`);
    }
  });
});
