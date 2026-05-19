// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import { BaseElement } from './base-element';
import { VHudChapterTitle } from './v-hud-chapter-title';

const mount = async (): Promise<VHudChapterTitle> => {
  const el = document.createElement('v-hud-chapter-title') as VHudChapterTitle;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

describe('Story 1.11 Task 7 — <v-hud-chapter-title> stub', () => {
  it('class extends BaseElement', () => {
    expect(Object.getPrototypeOf(VHudChapterTitle.prototype)).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-hud-chapter-title>', () => {
    expect(customElements.get('v-hud-chapter-title')).toBe(VHudChapterTitle);
  });

  it('renders an empty <h2> during cruise', async () => {
    const el = await mount();
    const h2 = el.shadowRoot!.querySelector('h2');
    expect(h2).toBeTruthy();
    expect(h2!.textContent?.trim() ?? '').toBe('');
    el.remove();
  });

  it('the <h2> carries aria-live="polite" so Story 2.1 wiring announces chapter changes', async () => {
    const el = await mount();
    const h2 = el.shadowRoot!.querySelector('h2')!;
    expect(h2.getAttribute('aria-live')).toBe('polite');
    expect(h2.getAttribute('aria-live')).not.toBe('assertive');
    el.remove();
  });
});

describe('Story 1.11 AC2 — no background fill on stub', () => {
  it('no background declarations in component CSS', () => {
    const flat = (VHudChapterTitle.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).not.toMatch(/(?<!text-)background(-color)?\s*:/);
  });
});
