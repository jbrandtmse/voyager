// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { LitElement, html, css } from 'lit';

import { BaseElement } from './base-element';

describe('Story 1.7 AC4 — BaseElement contract', () => {
  it('extends LitElement', () => {
    const proto = Object.getPrototypeOf(BaseElement.prototype) as object;
    expect(proto).toBe(LitElement.prototype);
  });

  it('exposes a static `styles` declaration (token-aware Shadow DOM CSS)', () => {
    expect(BaseElement.styles).toBeDefined();
  });

  it('the base stylesheet references the --v-color-fg + --v-font-sans tokens', () => {
    // Lit's css`...` template returns a CSSResult with a cssText field.
    // We don't care about exact whitespace — just that the key tokens
    // are referenced so Shadow DOM children inherit them.
    const text = String((BaseElement.styles as { cssText?: string }).cssText ?? '');
    expect(text).toContain('var(--v-color-fg)');
    expect(text).toContain('var(--v-font-sans)');
  });

  it('the base stylesheet includes a *:focus-visible outline rule', () => {
    const text = String((BaseElement.styles as { cssText?: string }).cssText ?? '');
    expect(text).toMatch(/:focus-visible/);
    expect(text).toContain('var(--v-color-focus)');
  });

  it('subclasses concatenating `static styles = [BaseElement.styles, css\\`...\\`]` instantiate cleanly', async () => {
    class TestEl extends BaseElement {
      static override styles = [
        BaseElement.styles,
        css`
          :host {
            display: block;
          }
        `,
      ];
      override render() {
        return html`<span>hi</span>`;
      }
    }
    customElements.define('x-base-test-1', TestEl);
    const el = document.createElement('x-base-test-1') as TestEl;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot).not.toBeNull();
    expect(el.shadowRoot?.textContent?.trim()).toBe('hi');
    document.body.removeChild(el);
  });
});
