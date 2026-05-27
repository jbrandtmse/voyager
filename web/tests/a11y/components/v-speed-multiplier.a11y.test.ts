// @vitest-environment happy-dom
//
// Story 6.4 AC1 — `<v-speed-multiplier>`.
// States: at each decade stop (1×, 10×, 100×, 1k, 10k, 100k, 1M), focused,
// at-bounds. Dragging is a pointer-event state — verified via the route
// suite where layout is computed.

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-speed-multiplier';
import type { VSpeedMultiplier } from '../../../src/components/v-speed-multiplier';

const DECADES = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000];

function makeStubClock(rate: number): unknown {
  let r = rate;
  const subs = new Set<() => void>();
  return {
    get playbackRate(): number {
      return r;
    },
    get playing(): boolean {
      return true;
    },
    get autoCapped(): boolean {
      return false;
    },
    get simTimeEt(): number {
      return 0;
    },
    setRate(n: number): void {
      r = n;
      subs.forEach((s) => s());
    },
    subscribe(cb: () => void): () => void {
      subs.add(cb);
      return (): void => {
        subs.delete(cb);
      };
    },
  };
}

describe('Story 6.4 AC1 — <v-speed-multiplier> a11y matrix', () => {
  afterEach(() => {
    document
      .querySelectorAll('v-speed-multiplier')
      .forEach((el) => el.remove());
  });

  for (const rate of DECADES) {
    it(`decade stop ${rate.toLocaleString()}× — a11y-clean, aria-valuenow set`, async () => {
      const el = document.createElement(
        'v-speed-multiplier',
      ) as VSpeedMultiplier;
      (el as unknown as { clockManager: unknown }).clockManager =
        makeStubClock(rate);
      document.body.appendChild(el);
      await el.updateComplete;
      const slider = el.shadowRoot?.querySelector('[role="slider"]');
      // aria-valuemin/max/now must be present for the slider role.
      expect(slider?.getAttribute('aria-valuemin')).not.toBeNull();
      expect(slider?.getAttribute('aria-valuemax')).not.toBeNull();
      expect(slider?.getAttribute('aria-valuenow')).not.toBeNull();
      expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
    });
  }

  it('focused state — slider holds focus, a11y-clean', async () => {
    const el = document.createElement('v-speed-multiplier') as VSpeedMultiplier;
    (el as unknown as { clockManager: unknown }).clockManager = makeStubClock(
      100,
    );
    document.body.appendChild(el);
    await el.updateComplete;
    const slider = el.shadowRoot?.querySelector<HTMLElement>('[role="slider"]');
    slider?.focus();
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('at-bounds (min) — 1× lower bound — a11y-clean', async () => {
    const el = document.createElement('v-speed-multiplier') as VSpeedMultiplier;
    (el as unknown as { clockManager: unknown }).clockManager = makeStubClock(
      1,
    );
    document.body.appendChild(el);
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('at-bounds (max) — 1,000,000× upper bound — a11y-clean', async () => {
    const el = document.createElement('v-speed-multiplier') as VSpeedMultiplier;
    (el as unknown as { clockManager: unknown }).clockManager = makeStubClock(
      1_000_000,
    );
    document.body.appendChild(el);
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});
