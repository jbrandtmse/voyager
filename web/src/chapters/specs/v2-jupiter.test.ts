/**
 * Story 4.6 — V2J chapter-spec unit tests.
 *
 * Pins:
 *   - AC1: window narrowed from ±30 days to ±5 days; anchor unchanged.
 *   - AC1: `copy` field shape (lede + body).
 *   - AC1/AC3: `defaultFraming` field shape (offsetKm tuple).
 *   - AC2: body prose word count is in the 50–150 band.
 *   - AC2: every dated / named fact is present in the prose.
 *   - AC2: every dated fact resolves to MISSION_FACTS.md (regex audit).
 */

import { describe, it, expect } from 'vitest';

import v2Jupiter from './v2-jupiter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;

describe('Story 4.6 AC1 — V2J chapter spec window narrow + structure', () => {
  it('anchorEt matches the 1979-07-09T22:29:00Z closest-approach instant', () => {
    expect(v2Jupiter.anchorEt).toBe(etFromIso('1979-07-09T22:29:00Z'));
  });

  it('windowStartEt is anchor - 5 days (narrowed from Story 2.1 placeholder)', () => {
    expect(v2Jupiter.windowEndEt - v2Jupiter.anchorEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
    expect(v2Jupiter.anchorEt - v2Jupiter.windowStartEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
  });

  it('window span is exactly 10 days (±5d half-window)', () => {
    expect(v2Jupiter.windowEndEt - v2Jupiter.windowStartEt).toBeCloseTo(
      10 * SECONDS_PER_DAY,
      6,
    );
  });

  it('chapter targets Jupiter barycenter (NAIF 5) per Story 4.1 AC5', () => {
    expect(v2Jupiter.targetBody).toBe(5);
  });

  it('preserves slug / name / markerLabel / spacecraft from Story 2.1', () => {
    expect(v2Jupiter.slug).toBe('v2-jupiter');
    expect(v2Jupiter.name).toBe('Voyager 2 — Jupiter');
    expect(v2Jupiter.markerLabel).toBe('V2J');
    expect(v2Jupiter.spacecraft).toBe('v2');
  });
});

describe('Story 4.6 AC1 — V2J encounter chapter copy field shape', () => {
  it('populates copy.lede with "V2 Jupiter."', () => {
    expect(v2Jupiter.copy).toBeDefined();
    expect(v2Jupiter.copy!.lede).toBe('V2 Jupiter.');
  });

  it('populates copy.body with a non-empty prose block', () => {
    expect(v2Jupiter.copy).toBeDefined();
    expect(v2Jupiter.copy!.body.length).toBeGreaterThan(0);
    expect(typeof v2Jupiter.copy!.body).toBe('string');
  });
});

describe('Story 4.6 AC2 — V2J chapter copy word count in 50–150 band', () => {
  it('body prose is between 50 and 150 words inclusive', () => {
    expect(v2Jupiter.copy).toBeDefined();
    const body = v2Jupiter.copy!.body;
    // Split on whitespace; compound hyphenated words count as a single
    // word (Story 4.5 convention).
    const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThanOrEqual(50);
    expect(wordCount).toBeLessThanOrEqual(150);
  });
});

describe('Story 4.6 AC2 — V2J fact citations resolve to MISSION_FACTS.md', () => {
  it('mentions the 9 July 1979 closest-approach date', () => {
    expect(v2Jupiter.copy).toBeDefined();
    expect(v2Jupiter.copy!.body).toMatch(/9 July 1979/);
  });

  it('names all four Galilean moons in the V2J sweep (no Amalthea — Rule-5 amendment)', () => {
    expect(v2Jupiter.copy).toBeDefined();
    const body = v2Jupiter.copy!.body;
    expect(body).toMatch(/Callisto/);
    expect(body).toMatch(/Ganymede/);
    expect(body).toMatch(/Europa/);
    expect(body).toMatch(/Io/);
    // Per the Rule-5 PRD amendment, V2 did not make a close Amalthea
    // pass; the spec's copy must not reference one. Permit "Amalthea"
    // as a substring nowhere (case-sensitive).
    expect(body).not.toMatch(/Amalthea/);
  });

  it('references the Saturn-and-beyond Grand Tour trajectory deflection', () => {
    expect(v2Jupiter.copy).toBeDefined();
    const body = v2Jupiter.copy!.body;
    expect(body).toMatch(/Grand Tour/);
    expect(body).toMatch(/Saturn/);
    expect(body).toMatch(/Uranus/);
    expect(body).toMatch(/Neptune/);
  });

  it('references V2-specific imaging (finer ring imagery and Ganymede grooved terrain)', () => {
    expect(v2Jupiter.copy).toBeDefined();
    const body = v2Jupiter.copy!.body;
    expect(body).toMatch(/ring/i);
    expect(body).toMatch(/grooved/);
  });
});

describe('Story 4.6 AC3 — V2J defaultFraming field shape', () => {
  it('defaultFraming.offsetKm is a 3-tuple of finite numbers', () => {
    expect(v2Jupiter.defaultFraming).toBeDefined();
    const offset = v2Jupiter.defaultFraming!.offsetKm;
    expect(offset.length).toBe(3);
    expect(Number.isFinite(offset[0])).toBe(true);
    expect(Number.isFinite(offset[1])).toBe(true);
    expect(Number.isFinite(offset[2])).toBe(true);
  });

  it('offset magnitude is on the order of millions of km (frames Jupiter + V2 + inner Galileans)', () => {
    expect(v2Jupiter.defaultFraming).toBeDefined();
    const [x, y, z] = v2Jupiter.defaultFraming!.offsetKm;
    const magnitudeKm = Math.sqrt(x * x + y * y + z * z);
    // Io semi-major axis ~421,700 km; V2 closest approach altitude
    // ~645,000 km. Sanity-check ≥ 500,000 km, ≤ 10,000,000 km.
    expect(magnitudeKm).toBeGreaterThanOrEqual(500_000);
    expect(magnitudeKm).toBeLessThanOrEqual(10_000_000);
  });
});
