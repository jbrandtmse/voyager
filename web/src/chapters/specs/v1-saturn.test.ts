/**
 * Story 4.6 — V1S chapter-spec unit tests.
 *
 * Pins:
 *   - AC1: window narrowed from ±30 days to ±5 days; anchor unchanged.
 *   - AC1: `copy` field shape (lede + body).
 *   - AC1/AC3: `defaultFraming` field shape (offsetKm tuple).
 *   - AC2: body prose word count is in the 50–150 band.
 *   - AC2: every dated / named fact is present in the prose.
 *   - AC2: every fact resolves to MISSION_FACTS.md (regex audit) —
 *     including the Titan flyby altitude (6,490 km) and the slingshot
 *     deflection out of the ecliptic (AC4 referencing).
 */

import { describe, it, expect } from 'vitest';

import v1Saturn from './v1-saturn';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;

describe('Story 4.6 AC1 — V1S chapter spec window narrow + structure', () => {
  it('anchorEt matches the 1980-11-12T23:46:00Z closest-approach instant', () => {
    expect(v1Saturn.anchorEt).toBe(etFromIso('1980-11-12T23:46:00Z'));
  });

  it('windowStartEt is anchor - 5 days (narrowed from Story 2.1 placeholder)', () => {
    expect(v1Saturn.windowEndEt - v1Saturn.anchorEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
    expect(v1Saturn.anchorEt - v1Saturn.windowStartEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
  });

  it('window span is exactly 10 days (±5d half-window)', () => {
    expect(v1Saturn.windowEndEt - v1Saturn.windowStartEt).toBeCloseTo(
      10 * SECONDS_PER_DAY,
      6,
    );
  });

  it('chapter targets Saturn barycenter (NAIF 6) per Story 4.1 AC5', () => {
    expect(v1Saturn.targetBody).toBe(6);
  });

  it('preserves slug / name / markerLabel / spacecraft from Story 2.1', () => {
    expect(v1Saturn.slug).toBe('v1-saturn');
    expect(v1Saturn.name).toBe('Voyager 1 — Saturn');
    expect(v1Saturn.markerLabel).toBe('V1S');
    expect(v1Saturn.spacecraft).toBe('v1');
  });
});

describe('Story 4.6 AC1 — V1S encounter chapter copy field shape', () => {
  it('populates copy.lede with "V1 Saturn."', () => {
    expect(v1Saturn.copy).toBeDefined();
    expect(v1Saturn.copy!.lede).toBe('V1 Saturn.');
  });

  it('populates copy.body with a non-empty prose block', () => {
    expect(v1Saturn.copy).toBeDefined();
    expect(v1Saturn.copy!.body.length).toBeGreaterThan(0);
    expect(typeof v1Saturn.copy!.body).toBe('string');
  });
});

describe('Story 4.6 AC2 — V1S chapter copy word count in 50–150 band', () => {
  it('body prose is between 50 and 150 words inclusive', () => {
    expect(v1Saturn.copy).toBeDefined();
    const body = v1Saturn.copy!.body;
    const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThanOrEqual(50);
    expect(wordCount).toBeLessThanOrEqual(150);
  });
});

describe('Story 4.6 AC2 — V1S fact citations resolve to MISSION_FACTS.md', () => {
  it('mentions the 12 November 1980 closest-approach date', () => {
    expect(v1Saturn.copy).toBeDefined();
    expect(v1Saturn.copy!.body).toMatch(/12 November 1980/);
  });

  it('names Titan and cites the 6,490 km flyby altitude', () => {
    expect(v1Saturn.copy).toBeDefined();
    const body = v1Saturn.copy!.body;
    expect(body).toMatch(/Titan/);
    expect(body).toMatch(/6,490/);
  });

  it('references the slingshot deflection out of the ecliptic (AC4 fact)', () => {
    expect(v1Saturn.copy).toBeDefined();
    const body = v1Saturn.copy!.body;
    // The deflection out of the ecliptic plane is the AC4 fact V1S
    // visualizes; the editorial copy frames it as "never again cross
    // the plane of the planets" / "climbs out of the ecliptic." Match
    // either framing.
    expect(body).toMatch(/ecliptic|plane of the planets/);
  });

  it('references Saturn ring imagery (broad rings, F-ring, spokes)', () => {
    expect(v1Saturn.copy).toBeDefined();
    const body = v1Saturn.copy!.body;
    expect(body).toMatch(/ring/i);
    // At least one of the three documented features — F-ring braiding,
    // broad-ring photometry, or the spokes discovery — must appear.
    expect(body).toMatch(/F-ring|spokes|broad ring/i);
  });
});

describe('Story 4.6 AC3 — V1S defaultFraming field shape', () => {
  it('defaultFraming.offsetKm is a 3-tuple of finite numbers', () => {
    expect(v1Saturn.defaultFraming).toBeDefined();
    const offset = v1Saturn.defaultFraming!.offsetKm;
    expect(offset.length).toBe(3);
    expect(Number.isFinite(offset[0])).toBe(true);
    expect(Number.isFinite(offset[1])).toBe(true);
    expect(Number.isFinite(offset[2])).toBe(true);
  });

  it('offset magnitude is on the order of millions of km (frames Saturn + V1 + Titan)', () => {
    expect(v1Saturn.defaultFraming).toBeDefined();
    const [x, y, z] = v1Saturn.defaultFraming!.offsetKm;
    const magnitudeKm = Math.sqrt(x * x + y * y + z * z);
    // Titan semi-major axis is ~1,221,830 km — the V1S framing must
    // accommodate it. Sanity-check ≥ 1,000,000 km, ≤ 20,000,000 km.
    expect(magnitudeKm).toBeGreaterThanOrEqual(1_000_000);
    expect(magnitudeKm).toBeLessThanOrEqual(20_000_000);
  });
});
