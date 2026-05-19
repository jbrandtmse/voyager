import { describe, it, expect } from 'vitest';
import { isPrecisionSmokeMode, __test } from './precision-smoke';
import { KM_PER_AU } from '../math/constants';

describe('isPrecisionSmokeMode', () => {
  it('returns true for "precision"', () => {
    expect(isPrecisionSmokeMode('precision')).toBe(true);
  });

  it('returns false for null', () => {
    expect(isPrecisionSmokeMode(null)).toBe(false);
  });

  it('returns false for unrelated dev mode names', () => {
    expect(isPrecisionSmokeMode('other')).toBe(false);
    expect(isPrecisionSmokeMode('')).toBe(false);
  });
});

describe('computeOrbitDistance — 30-second 1 m ↔ 165 AU triangle wave', () => {
  const { computeOrbitDistance } = __test;

  it('returns ~1 m (1e-3 km) at t=0', () => {
    expect(computeOrbitDistance(0)).toBeCloseTo(1e-3, 8);
  });

  it('returns ~165 AU at t=15 (midpoint)', () => {
    const d = computeOrbitDistance(15);
    // log-space midpoint exactly equals MAX_DISTANCE_KM.
    expect(d).toBeCloseTo(165 * KM_PER_AU, -5);
  });

  it('returns ~1 m again at t=30 boundary (loop end)', () => {
    // t=30 wraps to phase 0 from caller's POV; the inner function reads phase
    // = 30/30 = 1, triangle(1) = 0, so distance = 1e-3.
    expect(computeOrbitDistance(30)).toBeCloseTo(1e-3, 6);
  });

  it('produces strictly positive distance across the full loop', () => {
    for (let t = 0; t <= 30; t += 0.5) {
      expect(computeOrbitDistance(t)).toBeGreaterThan(0);
    }
  });

  it('distance grows monotonically through the first half', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 15; t += 0.5) {
      const d = computeOrbitDistance(t);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});
