import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Story 1.8 AC3 / AC5 — assertions against the built `dist/unsupported.html`.
// Gated with skipIf so unit-only runs without a fresh build don't fail.

const webRoot = resolve(__dirname, '..');
const distUnsupported = resolve(webRoot, 'dist', 'unsupported.html');
const distHasBuild = existsSync(distUnsupported);

describe('Story 1.8 AC3 — pre-rendered dist/unsupported.html', () => {
  it.skipIf(!distHasBuild)('exists after build', () => {
    expect(existsSync(distUnsupported)).toBe(true);
  });

  it.skipIf(!distHasBuild)('declares <html lang="en"> + viewport + UTF-8 charset', () => {
    const html = readFileSync(distUnsupported, 'utf8');
    expect(html).toMatch(/<html\s+lang=["']en["']/);
    expect(html).toMatch(/<meta[^>]*name=["']viewport["'][^>]*content=["'][^"']*width=device-width/);
    expect(html.toLowerCase()).toMatch(/<meta[^>]*charset=["']?utf-8["']?/);
  });

  it.skipIf(!distHasBuild)('<title> includes "Browser Not Supported"', () => {
    const html = readFileSync(distUnsupported, 'utf8');
    const m = html.match(/<title>([^<]*)<\/title>/);
    expect(m).toBeTruthy();
    expect(m![1]).toContain('Browser Not Supported');
  });

  it.skipIf(!distHasBuild)(
    'semantic body: <main>, <h1>, <p>, <ul> (no div soup)',
    () => {
      const html = readFileSync(distUnsupported, 'utf8');
      expect(html).toMatch(/<main\b[^>]*>/);
      expect(html).toMatch(/<h1\b[^>]*>/);
      expect(html).toMatch(/<p\b[^>]*>/);
      expect(html).toMatch(/<ul\b[^>]*>/);
    },
  );

  it.skipIf(!distHasBuild)(
    'baked-in default reason is webgl2 (works with JS disabled)',
    () => {
      const html = readFileSync(distUnsupported, 'utf8');
      expect(html).toMatch(/<main\s+data-reason=["']webgl2["']/);
      // The default webgl2 reason copy must be present:
      expect(html).toContain("Voyager requires WebGL 2");
    },
  );

  it.skipIf(!distHasBuild)(
    'all three reason-copy variants are rendered (CSS-driven swap)',
    () => {
      const html = readFileSync(distUnsupported, 'utf8');
      expect(html).toContain('data-reason-copy="webgl2"');
      expect(html).toContain('data-reason-copy="wasm"');
      expect(html).toContain('data-reason-copy="brotli"');
      expect(html).toContain('Voyager requires WebAssembly');
      expect(html).toContain('Voyager requires modern brotli');
    },
  );

  it.skipIf(!distHasBuild)(
    'three browser-recommendation links with explicit hostname text',
    () => {
      const html = readFileSync(distUnsupported, 'utf8');
      expect(html).toContain('https://www.google.com/chrome/');
      expect(html).toContain('google.com/chrome');
      expect(html).toContain('https://www.mozilla.org/firefox/');
      expect(html).toContain('mozilla.org/firefox');
      expect(html).toContain('https://www.apple.com/safari/');
      expect(html).toContain('apple.com/safari');
      // Negative: no "click here" or generic CTA copy.
      expect(html.toLowerCase()).not.toContain('click here');
    },
  );

  it.skipIf(!distHasBuild)('inlines its CSS in <style> (no external CSS link)', () => {
    const html = readFileSync(distUnsupported, 'utf8');
    expect(html).toMatch(/<style\b[^>]*>[\s\S]*?<\/style>/);
    // The page should not depend on an external CSS file.
    expect(html).not.toMatch(/<link\s+rel=["']stylesheet["']/);
  });

  it.skipIf(!distHasBuild)('inline swap <script> is ≤ 1 KB', () => {
    const html = readFileSync(distUnsupported, 'utf8');
    // Find inline (no src=) script tag in the body.
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    const bodies: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      if (m[1].trim().length > 0) bodies.push(m[1]);
    }
    expect(bodies.length).toBeGreaterThanOrEqual(1);
    for (const body of bodies) {
      const size = Buffer.byteLength(body, 'utf8');
      expect(size).toBeLessThanOrEqual(1024);
    }
  });

  it.skipIf(!distHasBuild)(
    'inlined font-face references the dist/fonts/*.woff2 paths',
    () => {
      const html = readFileSync(distUnsupported, 'utf8');
      expect(html).toContain('/fonts/inter-regular.woff2');
      expect(html).toContain('/fonts/source-serif-4-variable.woff2');
    },
  );

  it.skipIf(!distHasBuild)(
    'parses as valid HTML5 (has DOCTYPE, no unclosed body/html)',
    () => {
      const html = readFileSync(distUnsupported, 'utf8');
      expect(html.toLowerCase()).toMatch(/^\s*<!doctype html>/);
      expect(html).toMatch(/<\/body>\s*<\/html>\s*$/);
    },
  );
});
