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
// probe reads three keys via `typeof window.X`; setting each to undefined
// or the right primitive type lets us isolate behavior per AC.
const makeWindow = (caps: {
  webgl2?: boolean;
  wasm?: boolean;
  brotli?: 'ok' | 'throws' | 'missing';
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
  if (caps.brotli === 'ok') {
    w['DecompressionStream'] = function DecompressionStream(_format: string) {
      // Constructor that accepts any format — represents a browser with
      // full br support.
    };
  } else if (caps.brotli === 'throws') {
    w['DecompressionStream'] = function DecompressionStream(format: string) {
      if (format === 'br') throw new TypeError(`unsupported format: ${format}`);
    };
  }
  // 'missing' → no key at all
  return w;
};

describe('Story 1.8 AC1 — feature-detect probe', () => {
  it('detects all three capabilities when present', () => {
    const win = makeWindow({ webgl2: true, wasm: true, brotli: 'ok' });
    expect(probeFeatures(win)).toEqual({ webgl2: true, wasm: true, brotli: true });
  });

  it('flags missing WebGL2', () => {
    const win = makeWindow({ webgl2: false, wasm: true, brotli: 'ok' });
    const r = probeFeatures(win);
    expect(r.webgl2).toBe(false);
    expect(firstFailure(r)).toBe('webgl2');
  });

  it('flags missing WebAssembly when WebGL2 present', () => {
    const win = makeWindow({ webgl2: true, wasm: false, brotli: 'ok' });
    const r = probeFeatures(win);
    expect(r.wasm).toBe(false);
    expect(firstFailure(r)).toBe('wasm');
  });

  it('flags missing DecompressionStream as brotli failure', () => {
    const win = makeWindow({ webgl2: true, wasm: true, brotli: 'missing' });
    const r = probeFeatures(win);
    expect(r.brotli).toBe(false);
    expect(firstFailure(r)).toBe('brotli');
  });

  it('flags DecompressionStream that throws on `br` as brotli failure', () => {
    const win = makeWindow({ webgl2: true, wasm: true, brotli: 'throws' });
    const r = probeFeatures(win);
    expect(r.brotli).toBe(false);
    expect(firstFailure(r)).toBe('brotli');
  });

  it('returns null first-failure when all three pass', () => {
    const win = makeWindow({ webgl2: true, wasm: true, brotli: 'ok' });
    expect(firstFailure(probeFeatures(win))).toBeNull();
  });

  it('probe order is webgl2 → wasm → brotli; first miss wins', () => {
    // All three missing simultaneously — should report 'webgl2' as the
    // first failure per the canonical order.
    const win = makeWindow({ webgl2: false, wasm: false, brotli: 'missing' });
    expect(firstFailure(probeFeatures(win))).toBe('webgl2');
    // Now grant webgl2 but not wasm/brotli — wasm should win.
    const win2 = makeWindow({ webgl2: true, wasm: false, brotli: 'missing' });
    expect(firstFailure(probeFeatures(win2))).toBe('wasm');
  });
});

describe('Story 1.8 AC1 — probe source + inline build', () => {
  it('getProbeScript() returns the PROBE_BODY string', () => {
    expect(getProbeScript()).toBe(PROBE_BODY);
  });

  it('probe source probes the three capabilities in order', () => {
    const body = PROBE_BODY;
    const webgl2Index = body.indexOf('WebGL2RenderingContext');
    const wasmIndex = body.indexOf('WebAssembly');
    const brotliIndex = body.indexOf("DecompressionStream('br')");
    expect(webgl2Index).toBeGreaterThanOrEqual(0);
    expect(wasmIndex).toBeGreaterThan(webgl2Index);
    expect(brotliIndex).toBeGreaterThan(wasmIndex);
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
    expect(out).toContain('DecompressionStream');
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
