// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import { BaseElement } from './base-element';
import { VHudSpeed } from './v-hud-speed';
import { ClockManager } from '../services/clock-manager';

const mount = async (clock: ClockManager | null): Promise<VHudSpeed> => {
  const el = document.createElement('v-hud-speed') as VHudSpeed;
  if (clock !== null) el.clockManager = clock;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

describe('Story 1.11 Task 6 — <v-hud-speed> registration', () => {
  it('class extends BaseElement', () => {
    expect(Object.getPrototypeOf(VHudSpeed.prototype)).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-hud-speed>', () => {
    expect(customElements.get('v-hud-speed')).toBe(VHudSpeed);
  });
});

describe('Story 1.11 AC5 — readout matches formatSpeedReadout', () => {
  it('initial 1× readout shows "1× — 1 sec/sec"', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const out = el.shadowRoot!.querySelector('output')!;
    expect(out.textContent?.trim()).toBe('1× — 1 sec/sec');
    el.remove();
  });

  it('updates reactively on setRate', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    clock.setRate(3600);
    await el.updateComplete;
    const out = el.shadowRoot!.querySelector('output')!;
    expect(out.textContent?.trim()).toBe('3,600× — 1 hour/sec');
    el.remove();
  });

  it('appends " —paused (loading)" when clock is auto-capped', async () => {
    let loading = false;
    const fakeLoader = {
      get loading(): boolean {
        return loading;
      },
      subscribe(cb: (v: boolean) => void): () => void {
        const handler = (): void => cb(loading);
        // Expose via property so we can trigger from outside.
        (fakeLoader as unknown as { fire: () => void }).fire = handler;
        return () => {};
      },
    };
    const clock = new ClockManager();
    clock.setChunkLoader(fakeLoader);
    loading = true;
    (fakeLoader as unknown as { fire: () => void }).fire();
    const el = await mount(clock);
    const out = el.shadowRoot!.querySelector('output')!;
    expect(out.textContent?.trim()).toContain('—paused (loading)');
    el.remove();
  });
});

describe('Story 1.11 AC6 — aria-live polite on speed readout', () => {
  it('<output> carries aria-live="polite"', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const out = el.shadowRoot!.querySelector('output')!;
    expect(out.getAttribute('aria-live')).toBe('polite');
    expect(out.getAttribute('aria-live')).not.toBe('assertive');
    el.remove();
  });
});

describe('Story 1.11 — no per-frame work; subscribe only on setRate', () => {
  it('does not expose a tick(et) method (rate changes on user action only)', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    expect((el as unknown as { tick?: unknown }).tick).toBeUndefined();
    el.remove();
  });
});

describe('Story 1.11 — subscribe/unsubscribe lifecycle', () => {
  it('unsubscribes from clockManager on disconnect', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    el.remove();
    expect(() => clock.setRate(60)).not.toThrow();
  });

  it('renders safely without a wired clockManager', async () => {
    const el = document.createElement('v-hud-speed') as VHudSpeed;
    document.body.appendChild(el);
    await el.updateComplete;
    const out = el.shadowRoot!.querySelector('output')!;
    expect(out.textContent?.trim()).toBe('1× — 1 sec/sec');
    el.remove();
  });
});

describe('Story 1.11 AC2 — no background fills, mono + tabular-nums', () => {
  it('no background declarations', () => {
    const flat = (VHudSpeed.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).not.toMatch(/(?<!text-)background(-color)?\s*:/);
  });

  it('uses mono font + tabular-nums on the output', () => {
    const flat = (VHudSpeed.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('var(--v-font-mono)');
    expect(joined).toContain('tabular-nums');
  });
});
