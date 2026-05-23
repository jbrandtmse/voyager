/**
 * Story 4.5 — V1J chapter-spec unit tests.
 *
 * Pins:
 *   - AC1: window narrowed from ±30 days to ±5 days; anchor unchanged.
 *   - AC1: optional `copy` field shape (lede + body).
 *   - AC1/AC3: optional `defaultFraming` field shape (offsetKm tuple).
 *   - AC2: body prose word count is in the 80–120 band.
 *   - AC2: every dated / named fact is present in the prose.
 */

import { describe, it, expect } from 'vitest';

import v1Jupiter from './v1-jupiter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;

describe('Story 4.5 AC1 — V1J chapter spec window narrow + structure', () => {
  it('anchorEt matches the 1979-03-05T12:05:00Z closest-approach instant', () => {
    expect(v1Jupiter.anchorEt).toBe(etFromIso('1979-03-05T12:05:00Z'));
  });

  it('windowStartEt is anchor - 5 days (narrowed from Story 2.1 placeholder)', () => {
    expect(v1Jupiter.windowEndEt - v1Jupiter.anchorEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
    expect(v1Jupiter.anchorEt - v1Jupiter.windowStartEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
  });

  it('window span is exactly 10 days (±5d half-window)', () => {
    expect(v1Jupiter.windowEndEt - v1Jupiter.windowStartEt).toBeCloseTo(
      10 * SECONDS_PER_DAY,
      6,
    );
  });

  it('chapter targets Jupiter barycenter (NAIF 5) per Story 4.1 AC5', () => {
    expect(v1Jupiter.targetBody).toBe(5);
  });

  it('preserves slug / name / markerLabel / spacecraft from Story 2.1', () => {
    expect(v1Jupiter.slug).toBe('v1-jupiter');
    expect(v1Jupiter.name).toBe('Voyager 1 — Jupiter');
    expect(v1Jupiter.markerLabel).toBe('V1J');
    expect(v1Jupiter.spacecraft).toBe('v1');
  });
});

describe('Story 4.5 AC1 — V1J encounter chapter copy field shape', () => {
  it('populates copy.lede with "V1 Jupiter."', () => {
    expect(v1Jupiter.copy).toBeDefined();
    expect(v1Jupiter.copy!.lede).toBe('V1 Jupiter.');
  });

  it('populates copy.body with a non-empty prose block', () => {
    expect(v1Jupiter.copy).toBeDefined();
    expect(v1Jupiter.copy!.body.length).toBeGreaterThan(0);
    expect(typeof v1Jupiter.copy!.body).toBe('string');
  });
});

describe('Story 4.5 AC2 — V1J chapter copy word count in 80–120 band', () => {
  it('body prose is between 80 and 120 words inclusive', () => {
    expect(v1Jupiter.copy).toBeDefined();
    const body = v1Jupiter.copy!.body;
    // Split on whitespace and filter out empty tokens. Compound words
    // joined by hyphens (e.g. "long-exposure", "forty-eight") count as a
    // single word — the convention matches the heliopause copy
    // word-count rationale in `heliopause-copy.ts`.
    const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThanOrEqual(80);
    expect(wordCount).toBeLessThanOrEqual(120);
  });
});

describe('Story 4.5 AC2 — fact citations resolve to MISSION_FACTS.md', () => {
  it('mentions the 5 March 1979 closest-approach date', () => {
    expect(v1Jupiter.copy).toBeDefined();
    expect(v1Jupiter.copy!.body).toMatch(/5 March 1979/);
  });

  it('mentions all five moons in the V1J interior sweep timeline', () => {
    expect(v1Jupiter.copy).toBeDefined();
    const body = v1Jupiter.copy!.body;
    expect(body).toMatch(/Amalthea/);
    expect(body).toMatch(/Io/);
    expect(body).toMatch(/Europa/);
    expect(body).toMatch(/Ganymede/);
    expect(body).toMatch(/Callisto/);
  });

  it('names Linda Morabito as the volcanism discoverer', () => {
    expect(v1Jupiter.copy).toBeDefined();
    expect(v1Jupiter.copy!.body).toMatch(/Linda Morabito/);
  });

  it('cites the Io-plume frame identifier 0468J1-001', () => {
    expect(v1Jupiter.copy).toBeDefined();
    expect(v1Jupiter.copy!.body).toMatch(/0468J1-001/);
  });

  it('references the ring discovery (Jupiter has rings)', () => {
    expect(v1Jupiter.copy).toBeDefined();
    expect(v1Jupiter.copy!.body).toMatch(/ring/i);
  });
});

describe('Story 4.5 AC3 — V1J defaultFraming field shape', () => {
  it('defaultFraming.offsetKm is a 3-tuple of finite numbers', () => {
    expect(v1Jupiter.defaultFraming).toBeDefined();
    const offset = v1Jupiter.defaultFraming!.offsetKm;
    expect(offset.length).toBe(3);
    expect(Number.isFinite(offset[0])).toBe(true);
    expect(Number.isFinite(offset[1])).toBe(true);
    expect(Number.isFinite(offset[2])).toBe(true);
  });

  it('offset magnitude is on the order of millions of km (frames Jupiter + Io + V1)', () => {
    expect(v1Jupiter.defaultFraming).toBeDefined();
    const [x, y, z] = v1Jupiter.defaultFraming!.offsetKm;
    const magnitudeKm = Math.sqrt(x * x + y * y + z * z);
    // Io semi-major axis ~421,700 km; V1 closest approach altitude
    // ~349,000 km. The camera offset must be larger than both to frame
    // them together — sanity-check ≥ 500,000 km, ≤ 10,000,000 km.
    expect(magnitudeKm).toBeGreaterThanOrEqual(500_000);
    expect(magnitudeKm).toBeLessThanOrEqual(10_000_000);
  });
});
