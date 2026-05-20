// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import {
  PROBE_BODY,
  buildProbeInline,
  getProbeScript,
  firstFailure,
  minifyProbe,
  probeFeatures,
} from './feature-detect';

// Build a stub `window` shape with selectively present capabilities. The
// probe reads two keys via `typeof window.X` after Story 1.16 (the brotli
// check was removed because no browser actually supports
// DecompressionStream('br') and the chunk loader now uses a wasm polyfill).
const makeWindow = (caps: {
  webgl2?: boolean;
  wasm?: boolean;
}): Record<string, unknown> => {
  const w: Record<string, unknown> = {};
  if (caps.webgl2) {
    // typeof a function-constructor is "function"
    w['WebGL2RenderingContext'] = function WebGL2RenderingContext() {
      /* stub */
    };
  }
  if (caps.wasm) {
    w['WebAssembly'] = { /* truthy object — typeof === 'object' */ };
  }
  return w;
};

describe('Story 1.8 AC1 — feature-detect probe (amended Story 1.16: brotli check removed)', () => {
  it('detects both capabilities when present', () => {
    const win = makeWindow({ webgl2: true, wasm: true });
    expect(probeFeatures(win)).toEqual({ webgl2: true, wasm: true });
  });

  it('flags missing WebGL2', () => {
    const win = makeWindow({ webgl2: false, wasm: true });
    const r = probeFeatures(win);
    expect(r.webgl2).toBe(false);
    expect(firstFailure(r)).toBe('webgl2');
  });

  it('flags missing WebAssembly when WebGL2 present', () => {
    const win = makeWindow({ webgl2: true, wasm: false });
    const r = probeFeatures(win);
    expect(r.wasm).toBe(false);
    expect(firstFailure(r)).toBe('wasm');
  });

  it('returns null first-failure when both pass', () => {
    const win = makeWindow({ webgl2: true, wasm: true });
    expect(firstFailure(probeFeatures(win))).toBeNull();
  });

  it('probe order is webgl2 → wasm; first miss wins', () => {
    // Both missing simultaneously — should report 'webgl2' as the
    // first failure per the canonical order.
    const win = makeWindow({ webgl2: false, wasm: false });
    expect(firstFailure(probeFeatures(win))).toBe('webgl2');
    // Now grant webgl2 but not wasm — wasm should win.
    const win2 = makeWindow({ webgl2: true, wasm: false });
    expect(firstFailure(probeFeatures(win2))).toBe('wasm');
  });

  it('does NOT check DecompressionStream / brotli (Story 1.16 architectural change)', () => {
    // Even if we explicitly inject a throwing DecompressionStream, the
    // probe ignores it. The wasm polyfill handles brotli decompression
    // separately, gated on WebAssembly support which is the second probe.
    const win = makeWindow({ webgl2: true, wasm: true });
    win['DecompressionStream'] = function DecompressionStream(format: string) {
      throw new TypeError(`unsupported format: ${format}`);
    };
    const r = probeFeatures(win);
    expect(firstFailure(r)).toBeNull();
    // Result shape no longer carries `brotli`.
    expect('brotli' in r).toBe(false);
  });
});

describe('Story 1.8 AC1 — probe source + inline build', () => {
  it('getProbeScript() returns the PROBE_BODY string', () => {
    expect(getProbeScript()).toBe(PROBE_BODY);
  });

  it('probe source probes the two capabilities in order (post Story 1.16)', () => {
    const body = PROBE_BODY;
    const webgl2Index = body.indexOf('WebGL2RenderingContext');
    const wasmIndex = body.indexOf('WebAssembly');
    expect(webgl2Index).toBeGreaterThanOrEqual(0);
    expect(wasmIndex).toBeGreaterThan(webgl2Index);
  });

  it('probe source does NOT reference DecompressionStream (Story 1.16)', () => {
    // Regression guard — if a future change re-introduces a brotli probe,
    // this assertion catches it.
    expect(PROBE_BODY).not.toContain('DecompressionStream');
    expect(PROBE_BODY).not.toContain("'br'");
  });

  it('probe source redirects to /unsupported.html with the reason', () => {
    expect(PROBE_BODY).toContain('/unsupported.html?reason=');
    expect(PROBE_BODY).toContain('window.location.replace');
  });

  it('probe source dynamic-imports the main entry on success', () => {
    expect(PROBE_BODY).toContain("import('__MAIN_ENTRY__')");
  });

  it('buildProbeInline() wraps the minified body in an IIFE + substitutes the main URL', () => {
    const inline = buildProbeInline('/assets/main-abc123.js');
    expect(inline).toContain('/assets/main-abc123.js');
    expect(inline.startsWith('(function(){')).toBe(true);
    expect(inline.endsWith('})();')).toBe(true);
    expect(inline).not.toContain('__MAIN_ENTRY__');
  });

  it('minifyProbe() collapses whitespace + preserves identifiers', () => {
    const out = minifyProbe(PROBE_BODY);
    // No \n in minified output
    expect(out).not.toContain('\n');
    // Identifiers still readable (not mangled)
    expect(out).toContain('WebGL2RenderingContext');
    expect(out).toContain('WebAssembly');
  });
});

describe('Story 1.8 AC1 — inline probe size budget (≤ 1 KB minified, including <script> wrapper)', () => {
  it('the inlined IIFE body is ≤ 1024 bytes utf-8', () => {
    // The plugin substitutes a real Vite asset URL — pick a worst-case
    // length (Vite hashed names are typically ~30 chars; pad here).
    const fakeMainUrl = '/assets/main-Lh3F4nKp.js'; // 24 chars; representative
    const inline = buildProbeInline(fakeMainUrl);
    const size = Buffer.byteLength(inline, 'utf8');
    expect(
      size,
      `Inline probe is ${size} bytes (budget = 1024). Trim PROBE_BODY in feature-detect.ts.`,
    ).toBeLessThanOrEqual(1024);
  });

  it('the inlined IIFE body INCLUDING <script>...</script> wrapper is still ≤ 1 KB', () => {
    const fakeMainUrl = '/assets/main-Lh3F4nKp.js';
    const inline = buildProbeInline(fakeMainUrl);
    const wrapped = `<script>${inline}</script>`;
    const size = Buffer.byteLength(wrapped, 'utf8');
    expect(size).toBeLessThanOrEqual(1024);
  });
});
