// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { startFirstPaint } from '../src/boot/first-paint';
import { MISSION_START_ET, MISSION_END_ET } from '../src/constants/mission';
import { etFromIso, isoFromEt } from '../src/math/et-conversions';
import type { VTimelineScrubber } from '../src/components/v-timeline-scrubber';

const getScrubberSimEt = (): number => {
  const el = document.querySelector('v-timeline-scrubber') as VTimelineScrubber | null;
  if (el === null) throw new Error('scrubber missing');
  return el.simEt;
};

describe('Story 1.9 AC7 — boot-time ?t= parsing (end-to-end)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it('valid ?t=1989-08-25T09:23:00Z initializes the scrubber paused at that ET', async () => {
    window.history.replaceState(null, '', '/?t=1989-08-25T09:23:00Z');
    startFirstPaint(document.body);
    await Promise.resolve();
    const et = getScrubberSimEt();
    const expected = etFromIso('1989-08-25T09:23:00Z');
    expect(Math.abs(et - expected)).toBeLessThan(0.01);
    // Initialized paused (default isPlaying=false in placeholder mode).
    const el = document.querySelector('v-timeline-scrubber') as HTMLElement & { isPlaying: boolean };
    expect(el.isPlaying).toBe(false);
  });

  it('no ?t= at all → simEt = MISSION_START_ET', async () => {
    window.history.replaceState(null, '', '/');
    startFirstPaint(document.body);
    await Promise.resolve();
    expect(getScrubberSimEt()).toBe(MISSION_START_ET);
  });

  it('?t= empty value → silent-reject → simEt = MISSION_START_ET', async () => {
    window.history.replaceState(null, '', '/?t=');
    startFirstPaint(document.body);
    await Promise.resolve();
    expect(getScrubberSimEt()).toBe(MISSION_START_ET);
  });

  it('?t=not-an-iso → silent-reject (no error UI) → simEt = MISSION_START_ET', async () => {
    window.history.replaceState(null, '', '/?t=not-an-iso');
    startFirstPaint(document.body);
    await Promise.resolve();
    expect(getScrubberSimEt()).toBe(MISSION_START_ET);
    // Confirm no error overlay / alert role was injected.
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.textContent ?? '').not.toContain('Error');
    expect(document.body.textContent ?? '').not.toContain('Invalid');
  });

  it('?t=1900-01-01T00:00:00Z (before MISSION_START) → silent reject', async () => {
    window.history.replaceState(null, '', '/?t=1900-01-01T00:00:00Z');
    startFirstPaint(document.body);
    await Promise.resolve();
    expect(getScrubberSimEt()).toBe(MISSION_START_ET);
  });

  it('?t=2100-01-01T00:00:00Z (after MISSION_END) → silent reject', async () => {
    window.history.replaceState(null, '', '/?t=2100-01-01T00:00:00Z');
    startFirstPaint(document.body);
    await Promise.resolve();
    expect(getScrubberSimEt()).toBe(MISSION_START_ET);
  });

  it('boundary ?t=<MISSION_START_ISO> is accepted', async () => {
    const iso = isoFromEt(MISSION_START_ET);
    window.history.replaceState(null, '', `/?t=${iso}`);
    startFirstPaint(document.body);
    await Promise.resolve();
    expect(Math.abs(getScrubberSimEt() - MISSION_START_ET)).toBeLessThan(0.01);
  });

  it('boundary ?t=<MISSION_END_ISO> is accepted', async () => {
    const iso = isoFromEt(MISSION_END_ET);
    window.history.replaceState(null, '', `/?t=${iso}`);
    startFirstPaint(document.body);
    await Promise.resolve();
    // Accepted (close to MISSION_END_ET); ARIA contract requires the bound
    // be reachable.
    expect(Math.abs(getScrubberSimEt() - MISSION_END_ET)).toBeLessThan(1.0);
  });

  it('?t= with additional query params is parsed correctly', async () => {
    window.history.replaceState(null, '', '/?dev=0&t=1989-08-25T09:23:00Z&foo=bar');
    startFirstPaint(document.body);
    await Promise.resolve();
    const et = getScrubberSimEt();
    const expected = etFromIso('1989-08-25T09:23:00Z');
    expect(Math.abs(et - expected)).toBeLessThan(0.01);
  });

  it('?t= with URL-encoded ISO (%3A for colon) is parsed correctly', async () => {
    // URLSearchParams automatically decodes percent-escapes.
    window.history.replaceState(null, '', '/?t=1989-08-25T09%3A23%3A00Z');
    startFirstPaint(document.body);
    await Promise.resolve();
    const et = getScrubberSimEt();
    const expected = etFromIso('1989-08-25T09:23:00Z');
    expect(Math.abs(et - expected)).toBeLessThan(0.01);
  });

  it('multiple boot-time parse failures do NOT crash the app', async () => {
    // Note: `'0'` is omitted from this list because `Date.parse('0')` is
    // implementation-defined and on V8 returns a year-2000 instant — which
    // is in-range and therefore not a "parse failure". Both the in-range
    // and silent-reject paths must avoid crashing, but only the silent-
    // reject path returns MISSION_START_ET.
    const bogus = ['undefined', 'null', 'NaN', '{}', '<script>'];
    for (const v of bogus) {
      document.body.innerHTML = '';
      window.history.replaceState(null, '', `/?t=${encodeURIComponent(v)}`);
      expect(() => startFirstPaint(document.body)).not.toThrow();
      await Promise.resolve();
      expect(getScrubberSimEt()).toBe(MISSION_START_ET);
    }
  });
});
