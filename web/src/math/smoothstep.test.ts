/**
 * Smoothstep helper unit tests (Story 4.1 T1.1).
 */

import { describe, it, expect } from 'vitest';
import { smoothstep } from './smoothstep';

describe('smoothstep', () => {
  it('returns 0 at the lower edge', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(10, 20, 10)).toBe(0);
  });

  it('returns 1 at the upper edge', () => {
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(10, 20, 20)).toBe(1);
  });

  it('returns 0.5 at the midpoint (cubic Hermite property)', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(smoothstep(-100, 100, 0)).toBeCloseTo(0.5, 12);
  });

  it('clamps x below edge0 to 0', () => {
    expect(smoothstep(0, 1, -0.5)).toBe(0);
    expect(smoothstep(0, 1, -1e9)).toBe(0);
  });

  it('clamps x above edge1 to 1', () => {
    expect(smoothstep(0, 1, 1.5)).toBe(1);
    expect(smoothstep(0, 1, 1e9)).toBe(1);
  });

  it('matches the GLSL formula t*t*(3-2*t) at quarter points', () => {
    // t = 0.25 → 0.25 * 0.25 * (3 - 0.5) = 0.0625 * 2.5 = 0.15625
    expect(smoothstep(0, 1, 0.25)).toBeCloseTo(0.15625, 12);
    // t = 0.75 → 0.75 * 0.75 * (3 - 1.5) = 0.5625 * 1.5 = 0.84375
    expect(smoothstep(0, 1, 0.75)).toBeCloseTo(0.84375, 12);
  });

  it('is monotonic over the [edge0, edge1] interior', () => {
    const samples = 100;
    let prev = -Infinity;
    for (let i = 0; i <= samples; i++) {
      const x = i / samples;
      const v = smoothstep(0, 1, x);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('zero first derivative at boundaries (no velocity jump)', () => {
    // Numerical derivative: (f(eps) - f(0)) / eps should be ~0 at both edges.
    const eps = 1e-6;
    const dLower = (smoothstep(0, 1, eps) - smoothstep(0, 1, 0)) / eps;
    const dUpper = (smoothstep(0, 1, 1) - smoothstep(0, 1, 1 - eps)) / eps;
    expect(Math.abs(dLower)).toBeLessThan(1e-5);
    expect(Math.abs(dUpper)).toBeLessThan(1e-5);
  });

  it('degenerate band (edge0 === edge1) acts as an instant step', () => {
    expect(smoothstep(5, 5, 4.99)).toBe(0);
    expect(smoothstep(5, 5, 5)).toBe(1);
    expect(smoothstep(5, 5, 5.01)).toBe(1);
  });

  it('works at large absolute ET values (no precision loss at e9 magnitudes)', () => {
    // ViewFrame uses ETs around ±1e9 seconds (SPICE TDB seconds past J2000).
    // The normalization should still produce 0 / 0.5 / 1 at the boundaries.
    const e0 = -657_000_000;
    const e1 = -656_999_000;
    const mid = (e0 + e1) / 2;
    expect(smoothstep(e0, e1, e0)).toBe(0);
    expect(smoothstep(e0, e1, e1)).toBe(1);
    expect(smoothstep(e0, e1, mid)).toBeCloseTo(0.5, 10);
  });
});
