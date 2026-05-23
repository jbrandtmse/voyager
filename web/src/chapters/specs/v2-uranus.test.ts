/**
 * Story 4.7 — V2U chapter-spec unit tests.
 *
 * Pins:
 *   - AC1: window narrowed from ±30 days to ±5 days; anchor unchanged.
 *   - AC1: `copy` field shape (lede + body).
 *   - AC1/AC3: `defaultFraming` field shape (offsetKm tuple).
 *   - AC2: body prose word count is in the 50–150 band.
 *   - AC2: every dated / named / counted fact is present in the prose.
 *   - AC2: every fact resolves to MISSION_FACTS.md (regex audit) —
 *     including Miranda flyby altitude (29,000 km), the
 *     Oberon/Titania/Umbriel/Ariel sweep, the 11 new moons (counted),
 *     and the Miranda surface fractures.
 *   - AC3: framing magnitude scales DOWN from the V2J / V1S / V2S
 *     baseline — the Uranian satellite system is more compact.
 */

import { describe, it, expect } from 'vitest';

import v2Uranus from './v2-uranus';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;

describe('Story 4.7 AC1 — V2U chapter spec window narrow + structure', () => {
  it('anchorEt matches the 1986-01-24T17:59:00Z closest-approach instant', () => {
    expect(v2Uranus.anchorEt).toBe(etFromIso('1986-01-24T17:59:00Z'));
  });

  it('windowStartEt is anchor - 5 days (narrowed from Story 2.1 placeholder)', () => {
    expect(v2Uranus.windowEndEt - v2Uranus.anchorEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
    expect(v2Uranus.anchorEt - v2Uranus.windowStartEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
  });

  it('window span is exactly 10 days (±5d half-window)', () => {
    expect(v2Uranus.windowEndEt - v2Uranus.windowStartEt).toBeCloseTo(
      10 * SECONDS_PER_DAY,
      6,
    );
  });

  it('chapter targets Uranus barycenter (NAIF 7) per Story 4.1 AC5', () => {
    expect(v2Uranus.targetBody).toBe(7);
  });

  it('preserves slug / name / markerLabel / spacecraft from Story 2.1', () => {
    expect(v2Uranus.slug).toBe('v2-uranus');
    expect(v2Uranus.name).toBe('Voyager 2 — Uranus');
    expect(v2Uranus.markerLabel).toBe('V2U');
    expect(v2Uranus.spacecraft).toBe('v2');
  });
});

describe('Story 4.7 AC1 — V2U encounter chapter copy field shape', () => {
  it('populates copy.lede with "V2 Uranus."', () => {
    expect(v2Uranus.copy).toBeDefined();
    expect(v2Uranus.copy!.lede).toBe('V2 Uranus.');
  });

  it('populates copy.body with a non-empty prose block', () => {
    expect(v2Uranus.copy).toBeDefined();
    expect(v2Uranus.copy!.body.length).toBeGreaterThan(0);
    expect(typeof v2Uranus.copy!.body).toBe('string');
  });
});

describe('Story 4.7 AC2 — V2U chapter copy word count in 50–150 band', () => {
  it('body prose is between 50 and 150 words inclusive', () => {
    expect(v2Uranus.copy).toBeDefined();
    const body = v2Uranus.copy!.body;
    const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThanOrEqual(50);
    expect(wordCount).toBeLessThanOrEqual(150);
  });
});

describe('Story 4.7 AC2 — V2U fact citations resolve to MISSION_FACTS.md', () => {
  it('mentions the 24 January 1986 closest-approach date', () => {
    expect(v2Uranus.copy).toBeDefined();
    expect(v2Uranus.copy!.body).toMatch(/24 January 1986/);
  });

  it('names the Miranda close approach', () => {
    expect(v2Uranus.copy).toBeDefined();
    expect(v2Uranus.copy!.body).toMatch(/Miranda/);
  });

  it('cites the 29,000 km Miranda altitude (word or numeric form)', () => {
    expect(v2Uranus.copy).toBeDefined();
    const body = v2Uranus.copy!.body;
    // Story 4.5/4.6 convention: prefer word form ("twenty-nine
    // thousand") in editorial prose; the test accepts either form so a
    // future rewrite to numeric ("29,000") doesn't trip the assertion.
    expect(body).toMatch(/twenty-nine thousand|29,000/);
  });

  it('names all four other major Uranian moons (Ariel / Umbriel / Titania / Oberon)', () => {
    expect(v2Uranus.copy).toBeDefined();
    const body = v2Uranus.copy!.body;
    expect(body).toMatch(/Ariel/);
    expect(body).toMatch(/Umbriel/);
    expect(body).toMatch(/Titania/);
    expect(body).toMatch(/Oberon/);
  });

  it('references the 11 new moons credited to V2U imagery', () => {
    expect(v2Uranus.copy).toBeDefined();
    const body = v2Uranus.copy!.body;
    // Per MISSION_FACTS.md, the historical total credited to V2U imagery
    // is 11 satellites (10 contemporaneous + Perdita via Karkoschka 1999).
    // Accept either "eleven" word form or "11" numeric form.
    expect(body).toMatch(/eleven|11/i);
  });

  it('references Miranda surface fractures (coronae or cliffs)', () => {
    expect(v2Uranus.copy).toBeDefined();
    const body = v2Uranus.copy!.body;
    // At least one of the documented surface features — coronae, ridges,
    // or cliffs (Verona Rupes) — must appear in the prose.
    expect(body).toMatch(/coronae|ridges|cliffs/);
  });

  it('references the onward trajectory toward Neptune (post-encounter cruise)', () => {
    expect(v2Uranus.copy).toBeDefined();
    expect(v2Uranus.copy!.body).toMatch(/Neptune/);
  });
});

describe('Story 4.7 AC3 — V2U defaultFraming field shape and scale', () => {
  it('defaultFraming.offsetKm is a 3-tuple of finite numbers', () => {
    expect(v2Uranus.defaultFraming).toBeDefined();
    const offset = v2Uranus.defaultFraming!.offsetKm;
    expect(offset.length).toBe(3);
    expect(Number.isFinite(offset[0])).toBe(true);
    expect(Number.isFinite(offset[1])).toBe(true);
    expect(Number.isFinite(offset[2])).toBe(true);
  });

  it('offset magnitude is on the order of millions of km (frames Uranus + V2 + Miranda)', () => {
    expect(v2Uranus.defaultFraming).toBeDefined();
    const [x, y, z] = v2Uranus.defaultFraming!.offsetKm;
    const magnitudeKm = Math.sqrt(x * x + y * y + z * z);
    // Miranda semi-major axis is ~129,800 km — much closer to Uranus
    // than Io is to Jupiter (~421,700 km). The framing scales DOWN from
    // the V2J `[1.0, 1.5, 2.5] Mm` baseline. Sanity-check ≥ 500,000 km,
    // ≤ 5,000,000 km (smaller upper bound vs. V2S's 20 Mm).
    expect(magnitudeKm).toBeGreaterThanOrEqual(500_000);
    expect(magnitudeKm).toBeLessThanOrEqual(5_000_000);
  });

  it('offset magnitude is smaller than V2J / V1J baseline (compact Uranian system per AC3)', async () => {
    // V2J baseline: [1.0, 1.5, 2.5] Mm → magnitude ~3.1 Mm.
    // V2U expected: scaled DOWN per AC3 ("Uranus's smaller satellite
    // system"). Pin the inequality so a future "round up to match V2J"
    // edit trips the assertion and forces a Rule-5-style amendment.
    const v2Jupiter = (await import('./v2-jupiter')).default;
    const v2jOffset = v2Jupiter.defaultFraming!.offsetKm;
    const v2jMag = Math.sqrt(
      v2jOffset[0] * v2jOffset[0] +
        v2jOffset[1] * v2jOffset[1] +
        v2jOffset[2] * v2jOffset[2],
    );
    const v2uOffset = v2Uranus.defaultFraming!.offsetKm;
    const v2uMag = Math.sqrt(
      v2uOffset[0] * v2uOffset[0] +
        v2uOffset[1] * v2uOffset[1] +
        v2uOffset[2] * v2uOffset[2],
    );
    expect(v2uMag).toBeLessThan(v2jMag);
  });
});
