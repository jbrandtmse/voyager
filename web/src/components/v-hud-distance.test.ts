// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { BaseElement } from './base-element';
import { VHudDistance } from './v-hud-distance';
import { ClockManager } from '../services/clock-manager';
import { etFromIso } from '../math/et-conversions';
import { KM_PER_AU } from '../math/constants';
import { worldVec3 } from '../types/branded';
import type { WorldVec3 } from '../types/branded';
import type { EphemerisService } from '../services/ephemeris-service';

// Hand-built EphemerisService stub. Returns a deterministic Pythagorean
// vector whose magnitude in AU equals the configured value.
const stubEphemeris = (
  v1Au: number | null,
  v2Au: number | null,
): EphemerisService => {
  const make = (au: number | null): WorldVec3 | null => {
    if (au === null) return null;
    // Place the body along +x for a magnitude of au * KM_PER_AU.
    return worldVec3(au * KM_PER_AU, 0, 0);
  };
  return {
    getPosition: (_et: number, naifId: number): WorldVec3 | null => {
      if (naifId === -31) return make(v1Au);
      if (naifId === -32) return make(v2Au);
      return null;
    },
  } as unknown as EphemerisService;
};

const mount = async (
  clock: ClockManager,
  eph: EphemerisService | null,
): Promise<VHudDistance> => {
  const el = document.createElement('v-hud-distance') as VHudDistance;
  el.clockManager = clock;
  if (eph !== null) el.ephemerisService = eph;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

describe('Story 1.11 Task 5 — <v-hud-distance> registration', () => {
  it('class extends BaseElement', () => {
    expect(Object.getPrototypeOf(VHudDistance.prototype)).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-hud-distance>', () => {
    expect(customElements.get('v-hud-distance')).toBe(VHudDistance);
  });
});

describe('Story 1.11 AC4 — <v-hud-distance> renders V1 / V2 rows', () => {
  it('renders two rows with V1 and V2 labels', async () => {
    const clock = new ClockManager();
    const eph = stubEphemeris(5.2, 4.4);
    const el = await mount(clock, eph);
    const labels = el.shadowRoot!.querySelectorAll('.label');
    expect(labels.length).toBe(2);
    expect(labels[0].textContent).toBe('V1');
    expect(labels[1].textContent).toBe('V2');
    el.remove();
  });

  it('seeds the value spans from the wired clock + ephemeris', async () => {
    const clock = new ClockManager();
    clock.scrubTo(etFromIso('2012-08-25T00:00:00Z'));
    const eph = stubEphemeris(120.27, 98.6);
    const el = await mount(clock, eph);
    const v1 = el.shadowRoot!.querySelector('[data-body="v1"]')!;
    const v2 = el.shadowRoot!.querySelector('[data-body="v2"]')!;
    expect(v1.textContent).toBe('120 AU');
    expect(v2.textContent).toBe('98.6 AU');
    el.remove();
  });

  it('renders "— AU" placeholder when EphemerisService returns null', async () => {
    const clock = new ClockManager();
    clock.scrubTo(etFromIso('2012-08-25T00:00:00Z'));
    const eph = stubEphemeris(null, null);
    const el = await mount(clock, eph);
    expect(el.shadowRoot!.querySelector('[data-body="v1"]')!.textContent).toBe('— AU');
    expect(el.shadowRoot!.querySelector('[data-body="v2"]')!.textContent).toBe('— AU');
    el.remove();
  });

  it('renders "— AU" when no EphemerisService is wired at all', async () => {
    const clock = new ClockManager();
    clock.scrubTo(etFromIso('2012-08-25T00:00:00Z'));
    const el = await mount(clock, null);
    expect(el.shadowRoot!.querySelector('[data-body="v1"]')!.textContent).toBe('— AU');
    expect(el.shadowRoot!.querySelector('[data-body="v2"]')!.textContent).toBe('— AU');
    el.remove();
  });
});

describe('Story 1.11 AC4 — Sun-at-origin distance math', () => {
  it('treats Sun as origin; |WorldVec3| / KM_PER_AU matches formatAU input', async () => {
    const clock = new ClockManager();
    // Position with Pythagorean magnitude = 5.0 AU exactly.
    const v3 = worldVec3(3 * KM_PER_AU, 4 * KM_PER_AU, 0);
    const eph = {
      getPosition: (_et: number, naifId: number): WorldVec3 | null => {
        if (naifId === -31) return v3;
        if (naifId === -32) return null;
        return null;
      },
    } as unknown as EphemerisService;
    const el = await mount(clock, eph);
    const v1 = el.shadowRoot!.querySelector('[data-body="v1"]')!;
    expect(v1.textContent).toBe('5.00 AU');
    el.remove();
  });
});

describe('Story 1.11 AC6 — tick(et) mutates value spans directly', () => {
  it('tick(et) writes the latest AU strings into V1 / V2 spans', async () => {
    const clock = new ClockManager();
    // First call returns 5.2/4.4; we'll switch the stub midway.
    let mag = 5.2;
    const eph = {
      getPosition: (_et: number, naifId: number): WorldVec3 | null => {
        if (naifId === -31) return worldVec3(mag * KM_PER_AU, 0, 0);
        if (naifId === -32) return worldVec3((mag / 2) * KM_PER_AU, 0, 0);
        return null;
      },
    } as unknown as EphemerisService;
    const el = await mount(clock, eph);
    mag = 165.32; // simulate trajectory progressing
    el.tick(etFromIso('2030-01-01T00:00:00Z'));
    expect(el.shadowRoot!.querySelector('[data-body="v1"]')!.textContent).toBe('165 AU');
    expect(el.shadowRoot!.querySelector('[data-body="v2"]')!.textContent).toBe('82.7 AU');
    el.remove();
  });

  it('tick(et) does not trigger Lit reactivity', async () => {
    const clock = new ClockManager();
    const eph = stubEphemeris(5.2, 4.4);
    const el = await mount(clock, eph);
    const reqSpy = vi.spyOn(el, 'requestUpdate');
    el.tick(etFromIso('2030-01-01T00:00:00Z'));
    expect(reqSpy).not.toHaveBeenCalled();
    reqSpy.mockRestore();
    el.remove();
  });
});

describe('Story 1.11 AC6 — aria-live polite mirror, debounced', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mirror has aria-live="polite", not assertive', async () => {
    const clock = new ClockManager();
    const eph = stubEphemeris(5.2, 4.4);
    const el = await mount(clock, eph);
    const mirror = el.shadowRoot!.querySelector('.sr-only')!;
    expect(mirror.getAttribute('aria-live')).toBe('polite');
    expect(mirror.getAttribute('aria-live')).not.toBe('assertive');
    el.remove();
  });

  it('mirror updates only after 500ms debounce after scrub-stop', async () => {
    const clock = new ClockManager();
    const eph = stubEphemeris(5.2, 4.4);
    const el = await mount(clock, eph);
    const mirror = el.shadowRoot!.querySelector('.sr-only')!;
    clock.scrubTo(etFromIso('2030-01-01T00:00:00Z'));
    vi.advanceTimersByTime(499);
    expect(mirror.textContent).toBe('');
    vi.advanceTimersByTime(1);
    expect(mirror.textContent).toBe('Voyager 1 5.20 AU, Voyager 2 4.40 AU');
    el.remove();
  });

  it('announceNow flushes immediately for chapter-change path', async () => {
    const clock = new ClockManager();
    const eph = stubEphemeris(165, 138);
    const el = await mount(clock, eph);
    const mirror = el.shadowRoot!.querySelector('.sr-only')!;
    el.announceNow(etFromIso('2030-01-01T00:00:00Z'));
    expect(mirror.textContent).toBe('Voyager 1 165 AU, Voyager 2 138 AU');
    el.remove();
  });
});

describe('Story 1.11 AC2 — no background fills', () => {
  it(':host and children carry no background:/background-color: declarations', () => {
    const flat = (VHudDistance.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).not.toMatch(/(?<!text-)background(-color)?\s*:/);
  });

  it('uses var(--v-font-mono) with tabular-nums on numeric values', () => {
    const flat = (VHudDistance.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('var(--v-font-mono)');
    expect(joined).toContain('tabular-nums');
  });
});
