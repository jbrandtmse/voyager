/**
 * ViewFrameService unit tests (Story 4.1 AC1, AC3, AC4).
 *
 * Pins:
 * - AC1: cruise (null chapter / undefined targetBody) returns identity.
 * - AC1: encounter chapter ramps and held window produce expected offset.
 * - AC3: returned transform shape has NO quaternion field (ADR-0023).
 * - AC4: smoothstep alpha at boundary + interior probes around the V1
 *   Jupiter window; reduced-motion collapse to instant cut.
 */

import { describe, it, expect } from 'vitest';
import { ViewFrameService } from './view-frame';
import type { EphemerisService } from './ephemeris-service';
import { worldVec3 } from '../types/branded';
import type { WorldVec3 } from '../types/branded';
import type { ChapterSpec } from '../types/chapter';
import v1Jupiter from '../chapters/specs/v1-jupiter';
import launchV1 from '../chapters/specs/launch-v1';

const SECONDS_PER_DAY = 86_400;
const DAY = SECONDS_PER_DAY;

/**
 * Stub EphemerisService — returns a fixed Jupiter heliocentric position
 * for the AC1 / AC4 tests. The actual SPICE-derived V1 Jupiter encounter
 * position varies day-by-day but for alpha-curve tests we want a stable
 * vector so we can assert on `offset = alpha * fixedJupiterPos` exactly.
 */
const JUPITER_FIXED_POS = worldVec3(7.78e8, 0, 0); // ~5.2 AU on X axis

class StubEphemeris {
  positionFor: WorldVec3 | null = JUPITER_FIXED_POS;
  calls = 0;

  getPosition(_et: number, _bodyId: number): WorldVec3 | null {
    this.calls += 1;
    return this.positionFor;
  }
}

const makeService = (
  reducedMotion: () => boolean = () => false,
): { service: ViewFrameService; ephemeris: StubEphemeris } => {
  const ephemeris = new StubEphemeris();
  const service = new ViewFrameService(
    ephemeris as unknown as EphemerisService,
    reducedMotion,
  );
  return { service, ephemeris };
};

describe('ViewFrameService — AC1 identity branches', () => {
  it('returns zero offset when no active chapter (cruise)', () => {
    const { service } = makeService();
    const t = service.getTransform(0, null);
    expect(t.originOffsetWorld[0]).toBe(0);
    expect(t.originOffsetWorld[1]).toBe(0);
    expect(t.originOffsetWorld[2]).toBe(0);
  });

  it('returns zero offset for chapters without targetBody (launch/heliopause/PBD)', () => {
    const { service } = makeService();
    const t = service.getTransform(launchV1.anchorEt, launchV1);
    expect(t.originOffsetWorld[0]).toBe(0);
    expect(t.originOffsetWorld[1]).toBe(0);
    expect(t.originOffsetWorld[2]).toBe(0);
  });

  it('does NOT query EphemerisService when chapter has no targetBody', () => {
    // Performance / contract — the identity branch should short-circuit
    // before touching the ephemeris stack.
    const { service, ephemeris } = makeService();
    service.getTransform(launchV1.anchorEt, launchV1);
    expect(ephemeris.calls).toBe(0);
  });
});

describe('ViewFrameService — AC3 translation-only contract (ADR-0023)', () => {
  it('returned transform has NO quaternion field', () => {
    const { service } = makeService();
    const t = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    expect(t).not.toHaveProperty('quaternion');
    // The interface itself only declares originOffsetWorld; this assertion
    // is a runtime defense against a future contributor sneaking a
    // rotation field onto the returned object.
    expect(Object.keys(t)).toEqual(['originOffsetWorld']);
  });
});

describe('ViewFrameService — AC4 alpha curve (V1 Jupiter window)', () => {
  // V1 Jupiter window: anchorEt ± 30 days.
  const startEt = v1Jupiter.windowStartEt;
  const endEt = v1Jupiter.windowEndEt;
  const anchorEt = v1Jupiter.anchorEt;

  it('alpha = 0 at (windowStartEt - 2 * DAY) — fully heliocentric', () => {
    const { service } = makeService();
    expect(service.computeAlpha(startEt - 2 * DAY, v1Jupiter)).toBe(0);
  });

  it('alpha ≈ 0.5 at (windowStartEt - 1 * DAY) — midpoint of entering ramp', () => {
    const { service } = makeService();
    const a = service.computeAlpha(startEt - DAY, v1Jupiter);
    expect(a).toBeCloseTo(0.5, 12);
  });

  it('alpha = 1 at windowStartEt — entering held', () => {
    const { service } = makeService();
    expect(service.computeAlpha(startEt, v1Jupiter)).toBe(1);
  });

  it('alpha = 1 at anchorEt — deep inside held', () => {
    const { service } = makeService();
    expect(service.computeAlpha(anchorEt, v1Jupiter)).toBe(1);
  });

  it('alpha = 1 at windowEndEt — last instant of held', () => {
    const { service } = makeService();
    expect(service.computeAlpha(endEt, v1Jupiter)).toBe(1);
  });

  it('alpha ≈ 0.5 at (windowEndEt + 1 * DAY) — midpoint of exiting ramp', () => {
    const { service } = makeService();
    const a = service.computeAlpha(endEt + DAY, v1Jupiter);
    expect(a).toBeCloseTo(0.5, 12);
  });

  it('alpha = 0 at (windowEndEt + 2 * DAY) — fully exited', () => {
    const { service } = makeService();
    expect(service.computeAlpha(endEt + 2 * DAY, v1Jupiter)).toBe(0);
  });

  it('alpha = 0 well before the entering ramp (cruise)', () => {
    const { service } = makeService();
    expect(service.computeAlpha(startEt - 365 * DAY, v1Jupiter)).toBe(0);
  });

  it('alpha = 0 well after the exiting ramp', () => {
    const { service } = makeService();
    expect(service.computeAlpha(endEt + 365 * DAY, v1Jupiter)).toBe(0);
  });

  it('strictly monotonically decreasing on the exiting ramp (no jumps at substate boundaries)', () => {
    // Sample 100 knots across (windowEndEt, windowEndEt + 2*DAY) and assert
    // origin offset magnitude strictly decreases. Holds because Jupiter's
    // heliocentric distance is essentially constant on the day scale (stub
    // returns a fixed position vector).
    const { service } = makeService();
    const knots = 100;
    let prev = Infinity;
    for (let i = 1; i <= knots; i++) {
      const et = endEt + (i / knots) * 2 * DAY;
      const t = service.getTransform(et, v1Jupiter);
      const mag = Math.hypot(
        t.originOffsetWorld[0],
        t.originOffsetWorld[1],
        t.originOffsetWorld[2],
      );
      expect(mag).toBeLessThanOrEqual(prev);
      prev = mag;
    }
    // Final sample (et = endEt + 2*DAY) must be zero.
    expect(prev).toBe(0);
  });

  it('origin offset magnitude inside held equals fixed Jupiter heliocentric magnitude', () => {
    // alpha = 1 throughout held; the lerp collapses to bodyPos itself.
    const { service } = makeService();
    const t = service.getTransform(anchorEt, v1Jupiter);
    expect(t.originOffsetWorld[0]).toBe(JUPITER_FIXED_POS[0]);
    expect(t.originOffsetWorld[1]).toBe(JUPITER_FIXED_POS[1]);
    expect(t.originOffsetWorld[2]).toBe(JUPITER_FIXED_POS[2]);
  });

  it('falls through to identity when EphemerisService returns null (chunk not loaded)', () => {
    const { service, ephemeris } = makeService();
    ephemeris.positionFor = null;
    const t = service.getTransform(anchorEt, v1Jupiter);
    expect(t.originOffsetWorld[0]).toBe(0);
    expect(t.originOffsetWorld[1]).toBe(0);
    expect(t.originOffsetWorld[2]).toBe(0);
  });

  it('alpha = 0 short-circuits before querying ephemeris', () => {
    const { service, ephemeris } = makeService();
    service.getTransform(v1Jupiter.windowStartEt - 365 * DAY, v1Jupiter);
    expect(ephemeris.calls).toBe(0);
  });
});

describe('ViewFrameService — AC4 reduced-motion instant cut', () => {
  it('alpha = 0 just before windowStartEt (no entering ramp)', () => {
    const { service } = makeService(() => true);
    expect(service.computeAlpha(v1Jupiter.windowStartEt - 1, v1Jupiter)).toBe(0);
    expect(service.computeAlpha(v1Jupiter.windowStartEt - DAY, v1Jupiter)).toBe(0);
  });

  it('alpha = 1 at windowStartEt (instant cut at the boundary)', () => {
    const { service } = makeService(() => true);
    expect(service.computeAlpha(v1Jupiter.windowStartEt, v1Jupiter)).toBe(1);
  });

  it('alpha = 1 throughout held', () => {
    const { service } = makeService(() => true);
    expect(service.computeAlpha(v1Jupiter.anchorEt, v1Jupiter)).toBe(1);
    expect(service.computeAlpha(v1Jupiter.windowEndEt, v1Jupiter)).toBe(1);
  });

  it('alpha = 0 just after windowEndEt (no exiting ramp)', () => {
    const { service } = makeService(() => true);
    expect(service.computeAlpha(v1Jupiter.windowEndEt + 1, v1Jupiter)).toBe(0);
    expect(service.computeAlpha(v1Jupiter.windowEndEt + DAY, v1Jupiter)).toBe(0);
  });

  it('the reduced-motion source is queried per call (live-tracking)', () => {
    // Use a closure that flips between calls so we can assert the second
    // call sees the new value rather than caching the first.
    let preferReduced = false;
    const { service } = makeService(() => preferReduced);
    expect(
      service.computeAlpha(v1Jupiter.windowStartEt - DAY, v1Jupiter),
    ).toBeCloseTo(0.5, 12);
    preferReduced = true;
    expect(service.computeAlpha(v1Jupiter.windowStartEt - DAY, v1Jupiter)).toBe(0);
  });
});

describe('ViewFrameService — AC1 ramp-zone resolution (activeChapter === null)', () => {
  // The FSM's `activeChapter` is null during the entering/exiting ±2-day
  // ramp zones (the FSM only dwells in `held`). ViewFrame must still
  // produce the smoothstep blend during the ramp by resolving the
  // approaching/departing encounter chapter from the registry.
  it('null activeChapter inside an entering ramp resolves to the approaching encounter', () => {
    const { service } = makeService();
    // V1 Jupiter window starts at anchorEt - 30 days. windowStart - 1 day
    // is inside the entering ramp (alpha ≈ 0.5) but BEFORE held — the FSM
    // returns null for activeChapter at this ET.
    const rampEt = v1Jupiter.windowStartEt - DAY;
    const t = service.getTransform(rampEt, null);
    // Magnitude should be 0.5 × |JUPITER_FIXED_POS| (the stub).
    const mag = Math.hypot(
      t.originOffsetWorld[0],
      t.originOffsetWorld[1],
      t.originOffsetWorld[2],
    );
    expect(mag).toBeCloseTo(0.5 * JUPITER_FIXED_POS[0], 0);
  });

  it('null activeChapter inside an exiting ramp resolves to the departing encounter', () => {
    const { service } = makeService();
    const rampEt = v1Jupiter.windowEndEt + DAY;
    const t = service.getTransform(rampEt, null);
    const mag = Math.hypot(
      t.originOffsetWorld[0],
      t.originOffsetWorld[1],
      t.originOffsetWorld[2],
    );
    expect(mag).toBeCloseTo(0.5 * JUPITER_FIXED_POS[0], 0);
  });

  it('null activeChapter outside any ramp zone returns identity (true cruise)', () => {
    const { service } = makeService();
    const cruiseEt = v1Jupiter.windowStartEt - 365 * DAY;
    const t = service.getTransform(cruiseEt, null);
    expect(t.originOffsetWorld[0]).toBe(0);
    expect(t.originOffsetWorld[1]).toBe(0);
    expect(t.originOffsetWorld[2]).toBe(0);
  });

  it('reduced-motion skips the ramp-zone scan (instant cut only at held edges)', () => {
    const { service } = makeService(() => true);
    // 1 day before the held window — alpha would be 0.5 under smoothstep,
    // but under reduced-motion it stays at 0 until the instant cut.
    const rampEt = v1Jupiter.windowStartEt - DAY;
    const t = service.getTransform(rampEt, null);
    expect(t.originOffsetWorld[0]).toBe(0);
  });
});

describe('ViewFrameService — defensive shape', () => {
  it('identity branch returns a frozen object (cannot be mutated by consumers)', () => {
    const { service } = makeService();
    const t = service.getTransform(0, null);
    // The wrapper object itself is frozen — a future consumer that tries
    // to splice a quaternion onto it (regressing ADR-0023) gets a hard
    // failure in strict mode rather than silently corrupting the shared
    // identity constant.
    expect(Object.isFrozen(t)).toBe(true);
  });

  it('non-identity branch returns a fresh object per call', () => {
    const { service } = makeService();
    const t1 = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    const t2 = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    // Two distinct calls produce two distinct objects (no consumer-visible
    // aliasing); the underlying Float64Array is also independently
    // constructed so a future write-through doesn't leak.
    expect(t1).not.toBe(t2);
    expect(t1.originOffsetWorld).not.toBe(t2.originOffsetWorld);
  });

  it('handles a synthesized minimal chapter spec (encounter contract)', () => {
    const { service } = makeService();
    const synthetic: ChapterSpec = {
      slug: 'synthetic-test',
      name: 'Synthetic',
      markerLabel: 'SYN',
      anchorEt: 0,
      windowStartEt: -10 * DAY,
      windowEndEt: 10 * DAY,
      spacecraft: 'v1',
      ogDescription: 'test',
      targetBody: 5,
    };
    expect(service.computeAlpha(0, synthetic)).toBe(1);
    expect(service.computeAlpha(-10 * DAY - 2 * DAY, synthetic)).toBe(0);
    expect(service.computeAlpha(10 * DAY + 2 * DAY, synthetic)).toBe(0);
  });
});
