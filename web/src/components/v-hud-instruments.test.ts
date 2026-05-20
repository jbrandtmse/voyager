// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import { BaseElement } from './base-element';
import { VHudInstruments } from './v-hud-instruments';

const mount = async (): Promise<VHudInstruments> => {
  const el = document.createElement('v-hud-instruments') as VHudInstruments;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

describe('Story 1.11 Task 8 — <v-hud-instruments> stub', () => {
  it('class extends BaseElement', () => {
    expect(Object.getPrototypeOf(VHudInstruments.prototype)).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-hud-instruments>', () => {
    expect(customElements.get('v-hud-instruments')).toBe(VHudInstruments);
  });

  it('renders no visible content during cruise', async () => {
    const el = await mount();
    expect((el.shadowRoot!.textContent ?? '').trim()).toBe('');
    el.remove();
  });
});

describe('Story 1.11 AC2 — no background fill on stub', () => {
  it('no background declarations in component CSS', () => {
    const flat = (VHudInstruments.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).not.toMatch(/(?<!text-)background(-color)?\s*:/);
  });
});
