import { describe, it, expect } from 'vitest';
import { floatingOriginOffset } from './floating-origin';
import { worldVec3 } from '../types/branded';
import { KM_PER_AU } from './constants';

describe('floatingOriginOffset — per-frame recenter math', () => {
  it('identity at origin: zero in → zero out (magnitude, not sign)', () => {
    const out = floatingOriginOffset(worldVec3(0, 0, 0));
    // -0 is acceptable here — the sign-flip produces it from +0, but
    // -0 === 0 mathematically. Compare on absolute value to keep the
    // identity-at-origin invariant independent of IEEE-754 signed zero.
    expect(Math.abs(out[0])).toBe(0);
    expect(Math.abs(out[1])).toBe(0);
    expect(Math.abs(out[2])).toBe(0);
  });

  it('sign flip: (x, y, z) → (-x, -y, -z)', () => {
    const out = floatingOriginOffset(worldVec3(1, -2, 3));
    expect(out[0]).toBe(-1);
    expect(out[1]).toBe(2);
    expect(out[2]).toBe(-3);
  });

  it('returns a Float32Array (RenderVec3) — boundary cast verified', () => {
    const out = floatingOriginOffset(worldVec3(5, 5, 5));
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(3);
  });

  it('large-magnitude input (~165 AU) produces a finite Float32 result without NaN/Infinity', () => {
    const km165AU = 165 * KM_PER_AU;
    const out = floatingOriginOffset(worldVec3(km165AU, -km165AU, km165AU));
    expect(Number.isFinite(out[0])).toBe(true);
    expect(Number.isFinite(out[1])).toBe(true);
    expect(Number.isFinite(out[2])).toBe(true);
    // Magnitude check: the sign-flipped value should still be roughly the
    // input magnitude in Float32.
    expect(Math.abs(out[0])).toBeGreaterThan(2e10);
  });

  it('does not mutate the input WorldVec3', () => {
    const cam = worldVec3(10, 20, 30);
    floatingOriginOffset(cam);
    expect(cam[0]).toBe(10);
    expect(cam[1]).toBe(20);
    expect(cam[2]).toBe(30);
  });

  it('extreme magnitude (1e30 km) does not produce Infinity — Float32 max ~3.4e38', () => {
    const out = floatingOriginOffset(worldVec3(1e30, 0, 0));
    expect(Number.isFinite(out[0])).toBe(true);
  });
});
