import { describe, it, expect } from 'vitest';

import {
  BODY_RADII_KM,
  CELESTIAL_BODY_NAIF_IDS,
  BODY_TEXTURE_SLUGS,
  BODY_DISPLAY_NAMES,
  SUN_NAIF_ID,
  MOON_NAIF_ID,
} from './body-radii';

describe('Story 1.13 — BODY_RADII_KM canonical IAU table', () => {
  it('contains exactly 10 entries — Sun, 8 planets, Moon', () => {
    expect(Object.keys(BODY_RADII_KM)).toHaveLength(10);
  });

  it.each(CELESTIAL_BODY_NAIF_IDS as number[])(
    'has a positive radius for NAIF %d',
    (naifId) => {
      const r = BODY_RADII_KM[naifId];
      expect(r).toBeTypeOf('number');
      expect(r).toBeGreaterThan(0);
      expect(Number.isFinite(r)).toBe(true);
    },
  );

  it('locks the Sun radius to the IAU 2015 Resolution B3 value (695,700 km)', () => {
    expect(BODY_RADII_KM[SUN_NAIF_ID]).toBe(695_700);
  });

  it('locks the Moon radius to the IAU value (1,737.4 km)', () => {
    expect(BODY_RADII_KM[MOON_NAIF_ID]).toBe(1_737.4);
  });

  it.each([
    [1, 2_439.7], // Mercury
    [2, 6_051.8], // Venus
    [3, 6_371], // Earth
    [4, 3_389.5], // Mars
    [5, 69_911], // Jupiter
    [6, 58_232], // Saturn
    [7, 25_362], // Uranus
    [8, 24_622], // Neptune
  ])('locks the planet radius for NAIF %d at %f km', (naifId, expected) => {
    expect(BODY_RADII_KM[naifId]).toBe(expected);
  });

  it('Sun > Jupiter > Saturn > Uranus > Neptune > Earth > Venus > Mars > Mercury > Moon', () => {
    // Crude sanity ordering matching solar-system body sizes. Catches a typo
    // that swaps two radii.
    expect(BODY_RADII_KM[10]).toBeGreaterThan(BODY_RADII_KM[5]);
    expect(BODY_RADII_KM[5]).toBeGreaterThan(BODY_RADII_KM[6]);
    expect(BODY_RADII_KM[6]).toBeGreaterThan(BODY_RADII_KM[7]);
    expect(BODY_RADII_KM[7]).toBeGreaterThan(BODY_RADII_KM[8]);
    expect(BODY_RADII_KM[8]).toBeGreaterThan(BODY_RADII_KM[3]);
    expect(BODY_RADII_KM[3]).toBeGreaterThan(BODY_RADII_KM[2]);
    expect(BODY_RADII_KM[2]).toBeGreaterThan(BODY_RADII_KM[4]);
    expect(BODY_RADII_KM[4]).toBeGreaterThan(BODY_RADII_KM[1]);
    expect(BODY_RADII_KM[1]).toBeGreaterThan(BODY_RADII_KM[301]);
  });
});

describe('Story 1.13 — CELESTIAL_BODY_NAIF_IDS', () => {
  it('lists the 10 NAIF IDs in heliocentric distance order with Sun first and Moon last', () => {
    expect(CELESTIAL_BODY_NAIF_IDS).toEqual([10, 1, 2, 3, 4, 5, 6, 7, 8, 301]);
  });

  it('matches BODY_RADII_KM keys exactly', () => {
    const radiiKeys = new Set(Object.keys(BODY_RADII_KM).map(Number));
    const idsSet = new Set(CELESTIAL_BODY_NAIF_IDS);
    expect(idsSet).toEqual(radiiKeys);
  });
});

describe('Story 1.13 — texture slugs and display names', () => {
  it('every NAIF ID has a slug', () => {
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      expect(BODY_TEXTURE_SLUGS[naifId]).toBeTypeOf('string');
      expect(BODY_TEXTURE_SLUGS[naifId]).not.toBe('');
    }
  });

  it('slugs are lowercase ASCII', () => {
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      const slug = BODY_TEXTURE_SLUGS[naifId];
      expect(slug).toMatch(/^[a-z]+$/);
    }
  });

  it('every NAIF ID has a display name', () => {
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      expect(BODY_DISPLAY_NAMES[naifId]).toBeTypeOf('string');
      expect(BODY_DISPLAY_NAMES[naifId]).not.toBe('');
    }
  });

  it('display names are unique', () => {
    const names = CELESTIAL_BODY_NAIF_IDS.map((id) => BODY_DISPLAY_NAMES[id]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('Story 1.13 — table is frozen (immutability)', () => {
  it('BODY_RADII_KM is frozen so consumers cannot mutate the IAU values', () => {
    expect(Object.isFrozen(BODY_RADII_KM)).toBe(true);
  });
  it('BODY_TEXTURE_SLUGS is frozen', () => {
    expect(Object.isFrozen(BODY_TEXTURE_SLUGS)).toBe(true);
  });
  it('BODY_DISPLAY_NAMES is frozen', () => {
    expect(Object.isFrozen(BODY_DISPLAY_NAMES)).toBe(true);
  });
});
