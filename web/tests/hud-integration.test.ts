// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { VHud } from '../src/components/v-hud';
import { ClockManager } from '../src/services/clock-manager';
import { etFromIso, dateForHud } from '../src/math/et-conversions';
import { KM_PER_AU } from '../src/math/constants';
import { worldVec3 } from '../src/types/branded';
import type { WorldVec3 } from '../src/types/branded';
import type { EphemerisService } from '../src/services/ephemeris-service';

const stubEphemeris = (
  v1Au: number,
  v2Au: number,
): EphemerisService =>
  ({
    getPosition: (_et: number, naifId: number): WorldVec3 | null => {
      if (naifId === -31) return worldVec3(v1Au * KM_PER_AU, 0, 0);
      if (naifId === -32) return worldVec3(v2Au * KM_PER_AU, 0, 0);
      return null;
    },
  }) as unknown as EphemerisService;

const buildHud = async (): Promise<{
  el: VHud;
  clock: ClockManager;
  eph: EphemerisService;
}> => {
  const clock = new ClockManager();
  clock.scrubTo(etFromIso('1989-08-25T09:23:00Z'));
  const eph = stubEphemeris(40.0, 30.0);
  const el = document.createElement('v-hud') as VHud;
  el.clockManager = clock;
  el.ephemerisService = eph;
  document.body.appendChild(el);
  await el.updateComplete;
  if (el.hudDate !== null) await el.hudDate.updateComplete;
  if (el.hudDistance !== null) await el.hudDistance.updateComplete;
  if (el.hudSpeed !== null) await el.hudSpeed.updateComplete;
  return { el, clock, eph };
};

describe('Story 1.11 Task 12 — HUD integration: per-frame mutation vs aria-live cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('hud.tick(et) updates the date AND distance visible DOM on every call', async () => {
    const { el } = await buildHud();
    const ets = [
      etFromIso('2000-01-01T00:00:00Z'),
      etFromIso('2010-06-15T12:00:00Z'),
      etFromIso('2025-11-30T08:45:00Z'),
    ];
    for (const et of ets) {
      el.tick(et);
      const timeEl = el.hudDate!.shadowRoot!.querySelector('time')!;
      expect(timeEl.textContent).toBe(dateForHud(et));
    }
  });

  it('per-frame ticks do NOT trigger Lit reactivity on the sub-components', async () => {
    const { el } = await buildHud();
    const dateReq = vi.spyOn(el.hudDate!, 'requestUpdate');
    const distReq = vi.spyOn(el.hudDistance!, 'requestUpdate');
    for (let i = 0; i < 60; i++) {
      el.tick(etFromIso('2010-06-15T12:00:00Z') + i);
    }
    expect(dateReq).not.toHaveBeenCalled();
    expect(distReq).not.toHaveBeenCalled();
    dateReq.mockRestore();
    distReq.mockRestore();
  });

  it('aria-live mirrors fire only on scrub-stop (after 500ms debounce)', async () => {
    const { el, clock } = await buildHud();
    const dateMirror = el.hudDate!.shadowRoot!.querySelector('.sr-only')!;
    const distMirror = el.hudDistance!.shadowRoot!.querySelector('.sr-only')!;
    expect(dateMirror.textContent).toBe('');
    expect(distMirror.textContent).toBe('');

    // Simulate per-frame ticking — must NOT update the mirrors.
    const base = etFromIso('2010-06-15T12:00:00Z');
    for (let i = 0; i < 30; i++) {
      el.tick(base + i);
    }
    expect(dateMirror.textContent).toBe('');
    expect(distMirror.textContent).toBe('');

    // Now scrub — debounced mirror should fire 500ms later.
    clock.scrubTo(etFromIso('2025-11-30T08:45:00Z'));
    vi.advanceTimersByTime(499);
    expect(dateMirror.textContent).toBe('');
    vi.advanceTimersByTime(1);
    expect(dateMirror.textContent).toBe('2025-11-30 08:45 UT');
    // Distance mirror references the stubbed values.
    expect(distMirror.textContent).toBe(
      'Voyager 1 40.0 AU, Voyager 2 30.0 AU',
    );
  });

  it('rapid scrubs coalesce into one trailing aria-live update per sub-component', async () => {
    const { el, clock } = await buildHud();
    const dateMirror = el.hudDate!.shadowRoot!.querySelector('.sr-only')!;
    for (let i = 0; i < 20; i++) {
      clock.scrubTo(etFromIso('2010-01-01T00:00:00Z') + i * 86400);
      vi.advanceTimersByTime(50); // < 500ms; debounce keeps resetting
    }
    expect(dateMirror.textContent).toBe('');
    vi.advanceTimersByTime(500);
    // Final scrub lands at 2010-01-01 + 19 days = 2010-01-20.
    expect(dateMirror.textContent).toMatch(/^2010-01-20 \d{2}:\d{2} UT$/);
  });

  it('aria-live "polite" is used everywhere; "assertive" never', async () => {
    const { el } = await buildHud();
    // Aria-live nodes live inside each sub-component's own shadow root.
    const chapterTitle = el.shadowRoot!.querySelector('v-hud-chapter-title') as
      | HTMLElement
      | null;
    const subShadows: ShadowRoot[] = [
      el.hudDate!.shadowRoot!,
      el.hudDistance!.shadowRoot!,
      el.hudSpeed!.shadowRoot!,
      ...(chapterTitle?.shadowRoot !== null && chapterTitle?.shadowRoot !== undefined
        ? [chapterTitle.shadowRoot]
        : []),
    ];
    let total = 0;
    for (const root of subShadows) {
      const lives = root.querySelectorAll('[aria-live]');
      for (const n of Array.from(lives)) {
        total++;
        expect(n.getAttribute('aria-live')).toBe('polite');
        expect(n.getAttribute('aria-live')).not.toBe('assertive');
      }
    }
    expect(total).toBeGreaterThan(0);
  });
});
