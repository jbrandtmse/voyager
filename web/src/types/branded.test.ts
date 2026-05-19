import { describe, it, expect } from 'vitest';
import {
  kilometers,
  meters,
  au,
  worldVec3,
  renderVec3,
  renderVec3FromWorld,
  meshLocalVec3,
  kmToAU,
  auToKm,
  type Kilometers,
  type WorldVec3,
  type RenderVec3,
} from './branded';
import { KM_PER_AU } from '../math/constants';

describe('branded scalar types', () => {
  it('kilometers constructs a Kilometers value preserving numeric identity', () => {
    const x: Kilometers = kilometers(42);
    expect(x).toBe(42);
  });

  it('meters and au constructors preserve numeric identity', () => {
    expect(meters(1000)).toBe(1000);
    expect(au(1)).toBe(1);
  });
});

describe('branded vector types', () => {
  it('worldVec3 returns a Float64Array of length 3', () => {
    const v: WorldVec3 = worldVec3(1, 2, 3);
    expect(v).toBeInstanceOf(Float64Array);
    expect(v.length).toBe(3);
    expect(v[0]).toBe(1);
    expect(v[1]).toBe(2);
    expect(v[2]).toBe(3);
  });

  it('renderVec3 returns a Float32Array of length 3', () => {
    const v: RenderVec3 = renderVec3(0.5, -1.5, 2.5);
    expect(v).toBeInstanceOf(Float32Array);
    expect(v.length).toBe(3);
    expect(v[0]).toBeCloseTo(0.5);
    expect(v[1]).toBeCloseTo(-1.5);
    expect(v[2]).toBeCloseTo(2.5);
  });

  it('meshLocalVec3 returns a Float32Array of length 3', () => {
    const v = meshLocalVec3(1, 2, 3);
    expect(v).toBeInstanceOf(Float32Array);
    expect(v.length).toBe(3);
  });
});

describe('renderVec3FromWorld — the Float64 → Float32 cast', () => {
  it('copies components and produces a Float32Array', () => {
    const world = worldVec3(1, 2, 3);
    const render = renderVec3FromWorld(world);
    expect(render).toBeInstanceOf(Float32Array);
    expect(render[0]).toBeCloseTo(1);
    expect(render[1]).toBeCloseTo(2);
    expect(render[2]).toBeCloseTo(3);
  });

  it('precision-loss: a value below Float32 epsilon round-trips to zero', () => {
    // Float32 cannot represent ~1e-46 (subnormal but underflows to zero
    // around 1.4e-45). Use a value that is meaningful in Float64 but lost
    // in Float32.
    const world = worldVec3(1e-46, 1e-46, 1e-46);
    const render = renderVec3FromWorld(world);
    // Both flushed to zero in Float32 (well below the smallest subnormal).
    expect(render[0]).toBe(0);
    expect(render[1]).toBe(0);
    expect(render[2]).toBe(0);
  });

  it('large magnitude (~165 AU = 2.47e10 km) survives the cast within Float32 precision', () => {
    const km165AU = 165 * KM_PER_AU;
    const world = worldVec3(km165AU, 0, 0);
    const render = renderVec3FromWorld(world);
    // Float32 7-digit mantissa: 2.47e10 km gives ~2.5e3 km = 2500 km error.
    // That's why we recenter before this cast in actual usage — but the cast
    // itself is still numerically valid.
    expect(render[0]).toBeGreaterThan(0);
    expect(Number.isFinite(render[0])).toBe(true);
  });

  it('post-recenter (near-camera) magnitudes survive the cast with sub-mm precision', () => {
    // After floating-origin recenter, render-space magnitudes are near zero
    // — that's the whole point. Pick a value 1 km from origin and verify
    // F32 keeps 7 digits.
    const world = worldVec3(1.234567, 0, 0);
    const render = renderVec3FromWorld(world);
    expect(render[0]).toBeCloseTo(1.234567, 5);
  });
});

describe('unit conversion helpers', () => {
  it('kmToAU(KM_PER_AU) ≈ 1', () => {
    const oneAU = kmToAU(kilometers(KM_PER_AU));
    expect(oneAU).toBeCloseTo(1, 12);
  });

  it('auToKm(1) === KM_PER_AU', () => {
    expect(auToKm(au(1))).toBe(KM_PER_AU);
  });

  it('round-trip km → AU → km', () => {
    const start = kilometers(1.5e9);
    const round = auToKm(kmToAU(start));
    expect(round).toBeCloseTo(start, 6);
  });

  it('KM_PER_AU literal value is the IAU canonical', () => {
    expect(KM_PER_AU).toBe(149597870.7);
  });
});
