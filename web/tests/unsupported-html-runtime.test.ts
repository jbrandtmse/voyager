// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Story 1.8 AC4 — runtime behavior of `dist/unsupported.html`. Load the
// generated HTML into happy-dom, set `?reason=X`, execute the inline swap
// script, and verify the visible variant updates to match.

const webRoot = resolve(__dirname, '..');
const distUnsupported = resolve(webRoot, 'dist', 'unsupported.html');
const distHasBuild = existsSync(distUnsupported);

interface ParsedFallback {
  bodyHtml: string;
  inlineCss: string;
  swapScript: string;
}

const parseFallback = (): ParsedFallback => {
  const html = readFileSync(distUnsupported, 'utf8');
  const cssMatch = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/);
  // Find inline (no src=) <script> in the body.
  const bodyHtml = bodyMatch?.[1] ?? '';
  const scriptMatch = bodyHtml.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/);
  return {
    bodyHtml: bodyHtml.replace(/<script[\s\S]*?<\/script>/g, '').trim(),
    inlineCss: cssMatch?.[1] ?? '',
    swapScript: scriptMatch?.[1] ?? '',
  };
};

const setLocation = (search: string): void => {
  // happy-dom exposes window.location.search via the underlying URL; the
  // most reliable mutation path is replacing the entire href.
  const base = 'http://localhost/unsupported.html';
  const url = search ? `${base}?${search.replace(/^\?/, '')}` : base;
  // @ts-expect-error happy-dom allows direct href assignment
  window.location.href = url;
};

const renderAndRun = (search: string): { reason: string | undefined; visibleText: string } => {
  const parsed = parseFallback();
  setLocation(search);
  document.body.innerHTML = parsed.bodyHtml;
  // Apply the inline CSS so the [data-reason-copy] visibility selectors are
  // computed against the active reason.
  const style = document.createElement('style');
  style.textContent = parsed.inlineCss;
  document.head.appendChild(style);
  // Execute the inline swap script.
  new Function(parsed.swapScript)();
  const main = document.querySelector('main');
  const reason = (main as HTMLElement | null)?.dataset['reason'];
  // Pick the active reason-copy paragraph by reading the data-reason +
  // matching the corresponding [data-reason-copy="X"] element.
  let visibleText = '';
  if (reason) {
    const active = document.querySelector(`[data-reason-copy="${reason}"]`);
    visibleText = active?.textContent?.trim() ?? '';
  }
  return { reason, visibleText };
};

describe('Story 1.8 AC4 — runtime ?reason swap', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  it.skipIf(!distHasBuild)(
    'with ?reason=wasm, the wasm sentence becomes the active variant within ≤ 100 ms',
    () => {
      const start = Date.now();
      const { reason, visibleText } = renderAndRun('reason=wasm');
      const elapsed = Date.now() - start;
      expect(reason).toBe('wasm');
      expect(visibleText).toContain('Voyager requires WebAssembly');
      expect(elapsed).toBeLessThanOrEqual(100);
    },
  );

  it.skipIf(!distHasBuild)('with ?reason=brotli, the brotli sentence becomes active', () => {
    const { reason, visibleText } = renderAndRun('reason=brotli');
    expect(reason).toBe('brotli');
    expect(visibleText).toContain('brotli');
    expect(visibleText).toContain('DecompressionStream');
  });

  it.skipIf(!distHasBuild)(
    'with ?reason=webgl2, the webgl2 sentence stays active (default)',
    () => {
      const { reason, visibleText } = renderAndRun('reason=webgl2');
      expect(reason).toBe('webgl2');
      expect(visibleText).toContain('Voyager requires WebGL 2');
    },
  );

  it.skipIf(!distHasBuild)('with no ?reason, the baked-in default (webgl2) renders', () => {
    const { reason, visibleText } = renderAndRun('');
    // The baked-in static HTML has data-reason="webgl2"; the script doesn't
    // change it when no reason param is present.
    expect(reason).toBe('webgl2');
    expect(visibleText).toContain('Voyager requires WebGL 2');
  });

  it.skipIf(!distHasBuild)('with an unknown ?reason, default (webgl2) stays active', () => {
    const { reason, visibleText } = renderAndRun('reason=mystery');
    // The script validates against the known set and leaves the attribute
    // alone for unknowns. The baked-in default remains.
    expect(reason).toBe('webgl2');
    expect(visibleText).toContain('Voyager requires WebGL 2');
  });
});
