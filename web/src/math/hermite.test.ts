import { describe, it, expect } from 'vitest';
import {
  hermiteInterpolatePosition,
  hermiteInterpolateVelocity,
} from './hermite';

describe('hermiteInterpolatePosition', () => {
  it('returns p0 at dt=0', () => {
    expect(hermiteInterpolatePosition(7, 11, 1, -1, 0, 10)).toBe(7);
  });

  it('returns p1 at dt=h', () => {
    expect(hermiteInterpolatePosition(7, 11, 1, -1, 10, 10)).toBeCloseTo(11, 12);
  });

  it('interpolates a constant function exactly (p0 = p1, v0 = v1 = 0)', () => {
    for (const dt of [0, 1, 2.5, 5, 7.75, 10]) {
      expect(hermiteInterpolatePosition(42, 42, 0, 0, dt, 10)).toBeCloseTo(42, 12);
    }
  });

  it('interpolates a linear function exactly (p(t) = p0 + v*t)', () => {
    const p0 = 5;
    const v = 3; // constant velocity
    const h = 10;
    const p1 = p0 + v * h;
    for (const dt of [0, 0.5, 2, 5, 8, 10]) {
      const expected = p0 + v * dt;
      expect(hermiteInterpolatePosition(p0, p1, v, v, dt, h)).toBeCloseTo(expected, 10);
    }
  });

  it('interpolates a cubic polynomial exactly (Hermite reproduces cubics)', () => {
    // p(t) = a + b*t + c*t^2 + d*t^3 with arbitrary coefficients.
    const a = 1.2;
    const b = -2.5;
    const c = 0.7;
    const d = -0.04;
    const p = (t: number) => a + b * t + c * t * t + d * t * t * t;
    const vp = (t: number) => b + 2 * c * t + 3 * d * t * t;
    const h = 8;
    const p0 = p(0);
    const p1 = p(h);
    const v0 = vp(0);
    const v1 = vp(h);
    for (const dt of [0, 1, 3, 4, 6, 7.5, h]) {
      const expected = p(dt);
      const actual = hermiteInterpolatePosition(p0, p1, v0, v1, dt, h);
      expect(actual).toBeCloseTo(expected, 9);
    }
  });

  it('handles small h (high cadence)', () => {
    expect(hermiteInterpolatePosition(0, 1, 0, 0, 0.5, 1)).toBeCloseTo(0.5, 10);
  });
});

describe('hermiteInterpolateVelocity', () => {
  it('returns v0 at dt=0', () => {
    expect(hermiteInterpolateVelocity(7, 11, 1.5, -1, 0, 10)).toBeCloseTo(1.5, 12);
  });

  it('returns v1 at dt=h', () => {
    expect(hermiteInterpolateVelocity(7, 11, 1.5, -1, 10, 10)).toBeCloseTo(-1, 12);
  });

  it('derivative of constant position is zero (v0 = v1 = 0)', () => {
    for (const dt of [0, 2.5, 5, 7.5, 10]) {
      expect(hermiteInterpolateVelocity(42, 42, 0, 0, dt, 10)).toBeCloseTo(0, 12);
    }
  });

  it('derivative of linear position is the constant velocity', () => {
    const p0 = 5;
    const v = 3;
    const h = 10;
    const p1 = p0 + v * h;
    for (const dt of [0, 1, 5, 9.9, 10]) {
      expect(hermiteInterpolateVelocity(p0, p1, v, v, dt, h)).toBeCloseTo(v, 10);
    }
  });

  it('derivative of cubic position equals analytical derivative', () => {
    const a = 1.2;
    const b = -2.5;
    const c = 0.7;
    const d = -0.04;
    const p = (t: number) => a + b * t + c * t * t + d * t * t * t;
    const vp = (t: number) => b + 2 * c * t + 3 * d * t * t;
    const h = 8;
    const p0 = p(0);
    const p1 = p(h);
    const v0 = vp(0);
    const v1 = vp(h);
    for (const dt of [0, 1, 3, 4, 6, 7.5, h]) {
      const expected = vp(dt);
      const actual = hermiteInterpolateVelocity(p0, p1, v0, v1, dt, h);
      expect(actual).toBeCloseTo(expected, 9);
    }
  });
});
