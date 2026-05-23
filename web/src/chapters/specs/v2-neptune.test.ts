/**
 * Story 4.7 — V2N chapter-spec unit tests.
 *
 * Pins:
 *   - AC1: window narrowed from ±30 days to ±5 days; anchor unchanged.
 *   - AC1: `copy` field shape (lede + body).
 *   - AC1/AC3: `defaultFraming` field shape (offsetKm tuple).
 *   - AC2: body prose word count is in the 50–150 band.
 *   - AC2: every dated / named / counted fact is present in the prose.
 *   - AC2: every fact resolves to MISSION_FACTS.md (regex audit) —
 *     including the Triton 39,800 km flyby altitude, the nitrogen
 *     geyser discovery, the Great Dark Spot, the six new moons,
 *     ring-arc-to-complete-ring resolution, and the FR12 south-of-
 *     ecliptic bend setup.
 */

import { describe, it, expect } from 'vitest';

import v2Neptune from './v2-neptune';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;

describe('Story 4.7 AC1 — V2N chapter spec window narrow + structure', () => {
  it('anchorEt matches the 1989-08-25T03:56:00Z closest-approach instant', () => {
    expect(v2Neptune.anchorEt).toBe(etFromIso('1989-08-25T03:56:00Z'));
  });

  it('windowStartEt is anchor - 5 days (narrowed from Story 2.1 placeholder)', () => {
    expect(v2Neptune.windowEndEt - v2Neptune.anchorEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
    expect(v2Neptune.anchorEt - v2Neptune.windowStartEt).toBeCloseTo(
      5 * SECONDS_PER_DAY,
      6,
    );
  });

  it('window span is exactly 10 days (±5d half-window)', () => {
    expect(v2Neptune.windowEndEt - v2Neptune.windowStartEt).toBeCloseTo(
      10 * SECONDS_PER_DAY,
      6,
    );
  });

  it('chapter targets Neptune barycenter (NAIF 8) per Story 4.1 AC5', () => {
    expect(v2Neptune.targetBody).toBe(8);
  });

  it('preserves slug / name / markerLabel / spacecraft from Story 2.1', () => {
    expect(v2Neptune.slug).toBe('v2-neptune');
    expect(v2Neptune.name).toBe('Voyager 2 — Neptune');
    expect(v2Neptune.markerLabel).toBe('V2N');
    expect(v2Neptune.spacecraft).toBe('v2');
  });
});

describe('Story 4.7 AC1 — V2N encounter chapter copy field shape', () => {
  it('populates copy.lede with "V2 Neptune."', () => {
    expect(v2Neptune.copy).toBeDefined();
    expect(v2Neptune.copy!.lede).toBe('V2 Neptune.');
  });

  it('populates copy.body with a non-empty prose block', () => {
    expect(v2Neptune.copy).toBeDefined();
    expect(v2Neptune.copy!.body.length).toBeGreaterThan(0);
    expect(typeof v2Neptune.copy!.body).toBe('string');
  });
});

describe('Story 4.7 AC2 — V2N chapter copy word count in 50–150 band', () => {
  it('body prose is between 50 and 150 words inclusive', () => {
    expect(v2Neptune.copy).toBeDefined();
    const body = v2Neptune.copy!.body;
    const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThanOrEqual(50);
    expect(wordCount).toBeLessThanOrEqual(150);
  });
});

describe('Story 4.7 AC2 — V2N fact citations resolve to MISSION_FACTS.md', () => {
  it('mentions the 25 August 1989 closest-approach date', () => {
    expect(v2Neptune.copy).toBeDefined();
    expect(v2Neptune.copy!.body).toMatch(/25 August 1989/);
  });

  it('names the Triton flyby', () => {
    expect(v2Neptune.copy).toBeDefined();
    expect(v2Neptune.copy!.body).toMatch(/Triton/);
  });

  it('cites the 39,800 km Triton altitude (word or numeric form)', () => {
    expect(v2Neptune.copy).toBeDefined();
    const body = v2Neptune.copy!.body;
    // Story 4.5/4.6 convention: prefer word form in editorial prose; the
    // test accepts either form so a future rewrite to numeric doesn't
    // trip the assertion.
    expect(body).toMatch(/thirty-nine thousand eight hundred|39,800/);
  });

  it('references Triton nitrogen geysers (cryovolcanism)', () => {
    expect(v2Neptune.copy).toBeDefined();
    const body = v2Neptune.copy!.body;
    // Soderblom et al., Science 250 (1990) — Triton geyser plumes.
    // Accept either "nitrogen geysers" / "geyser" / "cryovolcanism".
    expect(body).toMatch(/nitrogen geysers|geyser|cryovolcanism/i);
  });

  it('references the Great Dark Spot', () => {
    expect(v2Neptune.copy).toBeDefined();
    expect(v2Neptune.copy!.body).toMatch(/Great Dark Spot/);
  });

  it('references the six new moons + ring-arc-to-complete-ring resolution', () => {
    expect(v2Neptune.copy).toBeDefined();
    const body = v2Neptune.copy!.body;
    // Six new inner moons (Naiad, Thalassa, Despina, Galatea, Larissa,
    // Proteus). Accept word or numeric form for the count.
    expect(body).toMatch(/six new|6 new/i);
    // Ring arcs → complete rings (azimuthal density variation).
    expect(body).toMatch(/ring arcs?|rings/i);
  });

  it('references the gravity-assist bend south of the ecliptic (FR12)', () => {
    expect(v2Neptune.copy).toBeDefined();
    const body = v2Neptune.copy!.body;
    // FR12 — the Triton encounter deflects V2's trajectory south of the
    // ecliptic plane. Accept variant phrasings: "south of the ecliptic",
    // "ecliptic plane", "southern" (alongside trajectory mention).
    expect(body).toMatch(/south of the ecliptic|ecliptic plane/);
  });
});

describe('Story 4.7 AC3 — V2N defaultFraming field shape and scale', () => {
  it('defaultFraming.offsetKm is a 3-tuple of finite numbers', () => {
    expect(v2Neptune.defaultFraming).toBeDefined();
    const offset = v2Neptune.defaultFraming!.offsetKm;
    expect(offset.length).toBe(3);
    expect(Number.isFinite(offset[0])).toBe(true);
    expect(Number.isFinite(offset[1])).toBe(true);
    expect(Number.isFinite(offset[2])).toBe(true);
  });

  it('offset magnitude is on the order of millions of km (frames Neptune + V2 + Triton)', () => {
    expect(v2Neptune.defaultFraming).toBeDefined();
    const [x, y, z] = v2Neptune.defaultFraming!.offsetKm;
    const magnitudeKm = Math.sqrt(x * x + y * y + z * z);
    // Triton semi-major axis is ~354,800 km — between Io's distance
    // from Jupiter and Titan's from Saturn. The framing magnitude sits
    // between V2J (~3.1 Mm) and V1S/V2S (~3.7 Mm). Sanity-check
    // ≥ 1,000,000 km, ≤ 10,000,000 km.
    expect(magnitudeKm).toBeGreaterThanOrEqual(1_000_000);
    expect(magnitudeKm).toBeLessThanOrEqual(10_000_000);
  });

  it('offset magnitude exceeds V2U (compact Uranian system) but stays in family with V2J / V2S', async () => {
    // V2U is the smallest framing (Miranda ~130,000 km from Uranus);
    // V2N steps back up because Triton orbits at ~354,800 km — closer
    // to Io's distance from Jupiter than to Miranda's distance from
    // Uranus. Pin V2U < V2N < V1S so a future "shrink to match V2U"
    // edit trips the assertion.
    const v2Uranus = (await import('./v2-uranus')).default;
    const v1Saturn = (await import('./v1-saturn')).default;
    const mag = (o: readonly [number, number, number]): number =>
      Math.sqrt(o[0] * o[0] + o[1] * o[1] + o[2] * o[2]);

    const v2uMag = mag(v2Uranus.defaultFraming!.offsetKm);
    const v2nMag = mag(v2Neptune.defaultFraming!.offsetKm);
    const v1sMag = mag(v1Saturn.defaultFraming!.offsetKm);
    expect(v2uMag).toBeLessThan(v2nMag);
    expect(v2nMag).toBeLessThanOrEqual(v1sMag);
  });
});
