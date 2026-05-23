/**
 * Story 4.6 — V2S chapter-spec unit tests.
 *
 * Pins:
 *   - AC1: window narrowed from ±30 days to ±5 days; anchor unchanged.
 *   - AC1: `copy` field shape (lede + body).
 *   - AC1/AC3: `defaultFraming` field shape (offsetKm tuple).
 *   - AC2: body prose word count is in the 50–150 band.
 *   - AC2: every dated / named fact is present in the prose.
 *   - AC2: every fact resolves to MISSION_FACTS.md (regex audit) —
 *     including the Iapetus / Hyperion / Titan triple-flyby and the
 *     Uranus trajectory setup.
 */

import { describe, it, expect } from 'vitest';

import v2Saturn from './v2-saturn';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;

describe('Story 4.6 AC1 — V2S chapter spec window narrow + structure', () => {
  it('anchorEt matches the 1981-08-26T00:00:00Z closest-approach instant (date-level sourcing)', () => {
    expect(v2Saturn.anchorEt).toBe(etFromIso('1981-08-26T00:00:00Z'));
  });

  it('windowStartEt is anchor - 5 days (narrowed from Story 2.1 placeholder)', () => {
    expect(v2Saturn.windowEndEt - v2Saturn.anchorEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
    expect(v2Saturn.anchorEt - v2Saturn.windowStartEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
  });

  it('window span is exactly 10 days (±5d half-window)', () => {
    expect(v2Saturn.windowEndEt - v2Saturn.windowStartEt).toBeCloseTo(
      10 * SECONDS_PER_DAY,
      6,
    );
  });

  it('chapter targets Saturn barycenter (NAIF 6) per Story 4.1 AC5', () => {
    expect(v2Saturn.targetBody).toBe(6);
  });

  it('preserves slug / name / markerLabel / spacecraft from Story 2.1', () => {
    expect(v2Saturn.slug).toBe('v2-saturn');
    expect(v2Saturn.name).toBe('Voyager 2 — Saturn');
    expect(v2Saturn.markerLabel).toBe('V2S');
    expect(v2Saturn.spacecraft).toBe('v2');
  });
});

describe('Story 4.6 AC1 — V2S encounter chapter copy field shape', () => {
  it('populates copy.lede with "V2 Saturn."', () => {
    expect(v2Saturn.copy).toBeDefined();
    expect(v2Saturn.copy!.lede).toBe('V2 Saturn.');
  });

  it('populates copy.body with a non-empty prose block', () => {
    expect(v2Saturn.copy).toBeDefined();
    expect(v2Saturn.copy!.body.length).toBeGreaterThan(0);
    expect(typeof v2Saturn.copy!.body).toBe('string');
  });
});

describe('Story 4.6 AC2 — V2S chapter copy word count in 50–150 band', () => {
  it('body prose is between 50 and 150 words inclusive', () => {
    expect(v2Saturn.copy).toBeDefined();
    const body = v2Saturn.copy!.body;
    const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThanOrEqual(50);
    expect(wordCount).toBeLessThanOrEqual(150);
  });
});

describe('Story 4.6 AC2 — V2S fact citations resolve to MISSION_FACTS.md', () => {
  it('mentions the 26 August 1981 closest-approach date', () => {
    expect(v2Saturn.copy).toBeDefined();
    expect(v2Saturn.copy!.body).toMatch(/26 August 1981/);
  });

  it('names the Iapetus / Hyperion / Titan triple-flyby', () => {
    expect(v2Saturn.copy).toBeDefined();
    const body = v2Saturn.copy!.body;
    expect(body).toMatch(/Iapetus/);
    expect(body).toMatch(/Hyperion/);
    expect(body).toMatch(/Titan/);
  });

  it('references Iapetus two-toned hemispheres (Cassini Regio)', () => {
    expect(v2Saturn.copy).toBeDefined();
    const body = v2Saturn.copy!.body;
    expect(body).toMatch(/two-toned|Cassini Regio/);
  });

  it('references the Uranus trajectory setup (post-encounter cruise)', () => {
    expect(v2Saturn.copy).toBeDefined();
    expect(v2Saturn.copy!.body).toMatch(/Uranus/);
  });

  it('references V2-specific ring imagery (higher-cadence vs V1; C-ring / D-ring)', () => {
    expect(v2Saturn.copy).toBeDefined();
    const body = v2Saturn.copy!.body;
    expect(body).toMatch(/ring/i);
    // At least one of the V2-specific ring contributions must appear —
    // higher cadence vs V1, C-ring detail, or D-ring detail.
    expect(body).toMatch(/higher-cadence|C-ring|D-ring/);
  });
});

describe('Story 4.6 AC3 — V2S defaultFraming field shape', () => {
  it('defaultFraming.offsetKm is a 3-tuple of finite numbers', () => {
    expect(v2Saturn.defaultFraming).toBeDefined();
    const offset = v2Saturn.defaultFraming!.offsetKm;
    expect(offset.length).toBe(3);
    expect(Number.isFinite(offset[0])).toBe(true);
    expect(Number.isFinite(offset[1])).toBe(true);
    expect(Number.isFinite(offset[2])).toBe(true);
  });

  it('offset magnitude is on the order of millions of km (frames Saturn + V2 + Iapetus/Hyperion/Titan)', () => {
    expect(v2Saturn.defaultFraming).toBeDefined();
    const [x, y, z] = v2Saturn.defaultFraming!.offsetKm;
    const magnitudeKm = Math.sqrt(x * x + y * y + z * z);
    // Iapetus orbits at ~3,560,000 km; the framing must keep at least
    // some of the moon system in frame at the band's bookend. Sanity-
    // check ≥ 1,000,000 km, ≤ 20,000,000 km.
    expect(magnitudeKm).toBeGreaterThanOrEqual(1_000_000);
    expect(magnitudeKm).toBeLessThanOrEqual(20_000_000);
  });
});
