// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import { BaseElement } from './base-element';
import {
  VFallbackPage,
  renderFallbackPageHTML,
  renderFallbackPageInlineCSS,
  renderFallbackPageSwapScript,
  FALLBACK_BROWSER_LINKS,
  FALLBACK_REASONS,
  FALLBACK_HEADLINE,
} from './v-fallback-page';

describe('Story 1.8 AC2 — <v-fallback-page> Lit component', () => {
  it('class extends BaseElement', () => {
    const proto = Object.getPrototypeOf(VFallbackPage.prototype) as object;
    expect(proto).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-fallback-page>', () => {
    expect(customElements.get('v-fallback-page')).toBe(VFallbackPage);
  });

  it('default reason is webgl2; renders the webgl2 sentence', async () => {
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.shadowRoot?.textContent ?? '';
    expect(text).toContain('Voyager requires WebGL 2');
    document.body.removeChild(el);
  });

  it('reason="wasm" renders the WebAssembly sentence', async () => {
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    el.setAttribute('reason', 'wasm');
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.shadowRoot?.textContent ?? '';
    expect(text).toContain('Voyager requires WebAssembly');
    document.body.removeChild(el);
  });

  it('reason="brotli" renders the brotli sentence', async () => {
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    el.setAttribute('reason', 'brotli');
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.shadowRoot?.textContent ?? '';
    expect(text).toContain('brotli');
    expect(text).toContain('DecompressionStream');
    document.body.removeChild(el);
  });

  it('unknown reason falls back to the webgl2 variant', async () => {
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    el.setAttribute('reason', 'something-unknown');
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.shadowRoot?.textContent ?? '';
    expect(text).toContain('Voyager requires WebGL 2');
    document.body.removeChild(el);
  });

  it('renders the headline in an <h1>', async () => {
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    document.body.appendChild(el);
    await el.updateComplete;
    const h1 = el.shadowRoot?.querySelector('h1');
    expect(h1?.textContent).toBe(FALLBACK_HEADLINE);
    document.body.removeChild(el);
  });

  it('renders the three browser-recommendation list items with explicit hostname text', async () => {
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    document.body.appendChild(el);
    await el.updateComplete;
    const items = el.shadowRoot?.querySelectorAll('li a');
    expect(items?.length).toBe(3);
    const texts = Array.from(items ?? []).map((a) => a.textContent?.trim() ?? '');
    expect(texts).toEqual(['google.com/chrome', 'mozilla.org/firefox', 'apple.com/safari']);
    const hrefs = Array.from(items ?? []).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      'https://www.google.com/chrome/',
      'https://www.mozilla.org/firefox/',
      'https://www.apple.com/safari/',
    ]);
    document.body.removeChild(el);
  });

  it('static styles reference the design tokens (sans h1, serif body, deep-space palette)', () => {
    const flat = (VFallbackPage.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('var(--v-font-sans)');
    expect(joined).toContain('var(--v-font-serif)');
    expect(joined).toContain('var(--v-color-bg)');
    expect(joined).toContain('var(--v-color-fg)');
  });

  it('uses semantic elements: <main>, <h1>, <p>, <ul>', async () => {
    const el = document.createElement('v-fallback-page') as VFallbackPage;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('main')).toBeTruthy();
    expect(el.shadowRoot?.querySelector('h1')).toBeTruthy();
    expect(el.shadowRoot?.querySelectorAll('p').length).toBeGreaterThanOrEqual(1);
    expect(el.shadowRoot?.querySelector('ul')).toBeTruthy();
    document.body.removeChild(el);
  });
});

describe('Story 1.8 AC2/AC3 — renderFallbackPageHTML() static helper', () => {
  it('produces a <main> with data-reason="webgl2" by default', () => {
    const html = renderFallbackPageHTML();
    expect(html).toContain('<main data-reason="webgl2">');
  });

  it('produces a <main> with data-reason="wasm" when reason=wasm', () => {
    const html = renderFallbackPageHTML('wasm');
    expect(html).toContain('<main data-reason="wasm">');
  });

  it('produces a <main> with data-reason="brotli" when reason=brotli', () => {
    const html = renderFallbackPageHTML('brotli');
    expect(html).toContain('<main data-reason="brotli">');
  });

  it('renders all three <p data-reason-copy="X"> variants (CSS-driven swap)', () => {
    const html = renderFallbackPageHTML();
    expect(html).toContain('data-reason-copy="webgl2"');
    expect(html).toContain('data-reason-copy="wasm"');
    expect(html).toContain('data-reason-copy="brotli"');
  });

  it('includes the three browser links with explicit hostname text', () => {
    const html = renderFallbackPageHTML();
    for (const link of FALLBACK_BROWSER_LINKS) {
      expect(html).toContain(link.href);
      expect(html).toContain(link.hostnameText);
    }
  });

  it('falls back to webgl2 for unknown reasons', () => {
    const html = renderFallbackPageHTML('mystery');
    expect(html).toContain('<main data-reason="webgl2">');
  });

  it('FALLBACK_REASONS lists the three canonical reasons in probe order', () => {
    expect(FALLBACK_REASONS).toEqual(['webgl2', 'wasm', 'brotli']);
  });
});

describe('Story 1.8 — fallback page inline CSS + swap script helpers', () => {
  it('inline CSS references tokens + font-faces + the CSS-driven [data-reason] selectors', () => {
    const css = renderFallbackPageInlineCSS();
    // Token must be defined; the value comes from tokens.css.
    expect(css).toMatch(/--v-color-bg\s*:\s*#[0-9a-fA-F]{6}/);
    expect(css).toContain('@font-face');
    expect(css).toContain('/fonts/inter-regular.woff2');
    expect(css).toContain('[data-reason="webgl2"] [data-reason-copy="webgl2"]');
    expect(css).toContain('[data-reason="brotli"] [data-reason-copy="brotli"]');
  });

  it('inline CSS is ≤ 2 KB minified-ish', () => {
    const css = renderFallbackPageInlineCSS();
    const size = Buffer.byteLength(css, 'utf8');
    expect(size).toBeLessThanOrEqual(2048);
  });

  it('swap script reads URLSearchParams + sets <main> dataset.reason', () => {
    const js = renderFallbackPageSwapScript();
    expect(js).toContain('URLSearchParams');
    expect(js).toContain('querySelector');
    expect(js).toContain('dataset.reason');
  });

  it('swap script is ≤ 1 KB', () => {
    const js = renderFallbackPageSwapScript();
    const size = Buffer.byteLength(js, 'utf8');
    expect(size).toBeLessThanOrEqual(1024);
  });
});
