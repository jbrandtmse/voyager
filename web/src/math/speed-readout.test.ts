import { describe, it, expect } from 'vitest';

import { formatSpeedReadout } from './speed-readout';

describe('Story 1.10 AC4 — formatSpeedReadout decade boundaries', () => {
  it('1× → "1× — 1 sec/sec"', () => {
    expect(formatSpeedReadout(1)).toBe('1× — 1 sec/sec');
  });

  it('10× → "10× — 10 secs/sec"', () => {
    // 10 seconds is plural; remains in sec unit (< 60).
    expect(formatSpeedReadout(10)).toBe('10× — 10 secs/sec');
  });

  it('60× → "60× — 1 min/sec"', () => {
    expect(formatSpeedReadout(60)).toBe('60× — 1 min/sec');
  });

  it('3600× → "3,600× — 1 hour/sec"', () => {
    expect(formatSpeedReadout(3600)).toBe('3,600× — 1 hour/sec');
  });

  it('86,400× → "86,400× — 1 day/sec"', () => {
    expect(formatSpeedReadout(86_400)).toBe('86,400× — 1 day/sec');
  });

  it('604,800× → "604,800× — 1 week/sec"', () => {
    expect(formatSpeedReadout(604_800)).toBe('604,800× — 1 week/sec');
  });
});

describe('Story 1.10 AC4 — formatSpeedReadout intermediate values', () => {
  it('100× falls in sec range (< 60 fails → moves to min)', () => {
    // 100 sec/sec → 1.67 min/sec
    expect(formatSpeedReadout(100)).toBe('100× — 1.67 mins/sec');
  });

  it('1000× falls in min range (< 3600)', () => {
    // 1000 sec/sec → 16.67 min/sec
    expect(formatSpeedReadout(1000)).toBe('1,000× — 16.67 mins/sec');
  });

  it('10000× falls in hour range (< 86400)', () => {
    // 10000 sec/sec → 2.78 hours/sec
    expect(formatSpeedReadout(10_000)).toBe('10,000× — 2.78 hours/sec');
  });

  it('100000× falls in day range (< 604800)', () => {
    // 100000 / 86400 = 1.157 days/sec
    expect(formatSpeedReadout(100_000)).toBe('100,000× — 1.16 days/sec');
  });

  it('1,000,000× falls in day range (≈11.57 days/sec)', () => {
    // 1e6 / 86400 = 11.574...
    expect(formatSpeedReadout(1_000_000)).toBe('1,000,000× — 11.57 days/sec');
  });
});

describe('Story 1.10 AC4 — formatSpeedReadout edge cases', () => {
  it('non-finite returns "0× — paused"', () => {
    expect(formatSpeedReadout(Number.NaN)).toBe('0× — paused');
    expect(formatSpeedReadout(Number.POSITIVE_INFINITY)).toBe('0× — paused');
  });

  it('zero or negative returns "0× — paused"', () => {
    expect(formatSpeedReadout(0)).toBe('0× — paused');
    expect(formatSpeedReadout(-5)).toBe('0× — paused');
  });

  it('fractional rate rounds the multiplier prefix', () => {
    // 5.6 sec/sec → rounds to 6× in prefix; value chooses sec unit.
    expect(formatSpeedReadout(5.6)).toBe('6× — 5.6 secs/sec');
  });

  it('rate just under a decade boundary stays in lower unit', () => {
    // 59× → 59 sec
    expect(formatSpeedReadout(59)).toBe('59× — 59 secs/sec');
  });
});
