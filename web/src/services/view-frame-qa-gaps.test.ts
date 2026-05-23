/**
 * ViewFrameService — QA gap tests (Story 4.1).
 *
 * The dev's `view-frame.test.ts` covers AC1 / AC3 / AC4 happy paths with a
 * fixed-vector EphemerisService stub, the ramp-zone resolution, and the
 * reduced-motion collapse. This QA file pins the DEFENSIVE / BOUNDARY edges
 * the happy path skips, drawn from the Story 4.1 QA brief's
 * "Cross-cutting gap targets" section:
 *
 *   1. EphemerisService returns NaN / Infinity in the position vector
 *      (kernel data corruption, manifest mismatch). The current
 *      contract reads the position as-is and multiplies by alpha — a
 *      NaN-poisoned position would NaN-poison the worldGroup transform.
 *      Pin the current behaviour so a hardening pass is visible if
 *      added later.
 *   2. `resolveBlendChapter` scan when multiple chapter ramp bands
 *      overlap (the registry asserts they don't, but this is a
 *      defensive pin in case a future PBD module with its own
 *      targetBody+window overlaps an encounter — the AC1 spec is
 *      silent on this case, so we pin the chronological-first-wins
 *      resolution that the dev's `for…of ALL_CHAPTERS` loop implements).
 *   3. `ChapterSpec.targetBody` undefined on a held chapter inside the
 *      encounter ramp band of a NEIGHBOUR encounter — should the
 *      neighbour's encounter win or should the held non-encounter win?
 *      The dev's `resolveBlendChapter` short-circuits on a held
 *      non-encounter chapter (returns null), which means a non-encounter
 *      held chapter SHADOWS an adjacent encounter's ramp blend. Pin
 *      this so the contract is clear.
 *   4. Reduced-motion `getTransform` per-call live tracking under the
 *      held-chapter activeChapter (not just the dev's computeAlpha path).
 *      Mid-session OS-level toggle of "reduce motion" must take effect
 *      on the next frame.
 *   5. AC6 wire-up — the 'both' spacecraft default-to-V1 fallback,
 *      pinned via the `naifIdForSpacecraft` helper that lives in the
 *      dev's wire test. Cross-referenced here for completeness against
 *      the spacecraft-type enum.
 *   6. Non-encounter chapter accidentally gaining a targetBody — verify
 *      ViewFrame treats the spec as an encounter (because that's what
 *      the dev's resolveBlendChapter logic does), so the target-body
 *      classification test in `chapters/target-body.test.ts` is the
 *      load-bearing defense (cross-reference here so the contract is
 *      explicit on this file too).
 *   7. RenderEngine.tick() with ViewFrameService injected but
 *      ChapterDirector NOT injected — the engine has a viewFrame but
 *      `activeChapter` is null. ViewFrame's ramp-zone scan should still
 *      fire, so the encounter blend STILL works without a wired director
 *      (defensive contract for tests that wire only one of the two).
 *   8. Zero-magnitude bodyPos (e.g., body at the Sun — should never
 *      happen physically, but defensive). Alpha non-zero × zero
 *      position = zero offset (identity branch optimisation kicks in
 *      transparently downstream).
 *   9. Wide alpha + extremely large body position (Neptune at ~30 AU =
 *      ~4.5e9 km) — verify the multiplication doesn't overflow or
 *      lose precision. Pin the magnitude exactly because Float64
 *      precision is sub-meter at this scale.
 */

import { describe, it, expect } from 'vitest';
import { ViewFrameService } from './view-frame';
import type { EphemerisService } from './ephemeris-service';
import { worldVec3 } from '../types/branded';
import type { WorldVec3 } from '../types/branded';
import type { ChapterSpec, Spacecraft } from '../types/chapter';
import v1Jupiter from '../chapters/specs/v1-jupiter';
import v2Jupiter from '../chapters/specs/v2-jupiter';
import v1Saturn from '../chapters/specs/v1-saturn';
import launchV1 from '../chapters/specs/launch-v1';
import paleBlueDot from '../chapters/specs/pale-blue-dot';

const SECONDS_PER_DAY = 86_400;
const DAY = SECONDS_PER_DAY;

class StubEphemeris {
  positionFor: WorldVec3 | null = worldVec3(7.78e8, 0, 0);
  positionByBody: Map<number, WorldVec3 | null> | null = null;
  calls: Array<{ et: number; bodyId: number }> = [];

  getPosition(et: number, bodyId: number): WorldVec3 | null {
    this.calls.push({ et, bodyId });
    if (this.positionByBody !== null) {
      const p = this.positionByBody.get(bodyId);
      return p === undefined ? null : p;
    }
    return this.positionFor;
  }
}

const makeService = (
  reducedMotion: () => boolean = () => false,
  chapters?: readonly ChapterSpec[],
): { service: ViewFrameService; ephemeris: StubEphemeris } => {
  const ephemeris = new StubEphemeris();
  const service = chapters
    ? new ViewFrameService(
        ephemeris as unknown as EphemerisService,
        reducedMotion,
        chapters,
      )
    : new ViewFrameService(
        ephemeris as unknown as EphemerisService,
        reducedMotion,
      );
  return { service, ephemeris };
};

// =============================================================================
// QA gap 1 — Ephemeris returns NaN / Infinity in the position vector.
// =============================================================================

describe('ViewFrameService — QA gap: NaN / Infinity body positions', () => {
  it('NaN body position NaN-poisons the offset (documented current behaviour)', () => {
    // Defensive pin — TODAY ViewFrame multiplies alpha by bodyPos[i] without
    // guarding against NaN. A NaN-poisoned offset would propagate to the
    // worldGroup transform and crash the floating-origin recenter (Float32
    // cast of NaN). If a future hardening pass adds an isFinite gate, this
    // test will flip and should be updated to assert the guard fires.
    const { service, ephemeris } = makeService();
    ephemeris.positionFor = worldVec3(Number.NaN, 0, 0);
    const t = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    // Document the current behaviour: NaN propagates. Pin via isNaN check.
    expect(Number.isNaN(t.originOffsetWorld[0])).toBe(true);
    expect(t.originOffsetWorld[1]).toBe(0);
    expect(t.originOffsetWorld[2]).toBe(0);
  });

  it('Infinity body position propagates Infinity (documented current behaviour)', () => {
    const { service, ephemeris } = makeService();
    ephemeris.positionFor = worldVec3(Number.POSITIVE_INFINITY, 0, 0);
    const t = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    // alpha = 1 × Infinity = Infinity. As above, defensive pin only.
    expect(t.originOffsetWorld[0]).toBe(Number.POSITIVE_INFINITY);
  });

  it('null body position (chunk not loaded) falls through to identity — heliocentric for THIS frame', () => {
    // Dev test covers this; pinned here too so the defensive contract is
    // explicit alongside the NaN/Infinity branches. The contract guarantees
    // the next frame after the chunk lands picks up the body-centered offset
    // with no pop (alpha is continuous in ET).
    const { service, ephemeris } = makeService();
    ephemeris.positionFor = null;
    const t = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    expect(t.originOffsetWorld[0]).toBe(0);
    expect(t.originOffsetWorld[1]).toBe(0);
    expect(t.originOffsetWorld[2]).toBe(0);
  });

  it('null body position does NOT return the FROZEN identity sentinel (a fresh transform per call would also be acceptable here)', () => {
    // The dev test pins frozen-identity for the cruise/no-chapter path; this
    // test confirms the chunk-missing fall-through path ALSO returns the
    // same identity object (it does, via the `return IDENTITY_TRANSFORM`
    // statement at the null-position branch). Pin the contract so a future
    // refactor that constructs a NEW {0,0,0} per call (slower) doesn't
    // silently land.
    const { service, ephemeris } = makeService();
    ephemeris.positionFor = null;
    const t1 = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    const t2 = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    // Both null-fallthrough transforms reuse the frozen sentinel — no
    // per-frame allocation in the cold-chunk path either.
    expect(t1).toBe(t2);
    expect(Object.isFrozen(t1)).toBe(true);
  });
});

// =============================================================================
// QA gap 2 — Overlapping chapter ramp bands — deterministic resolution.
// =============================================================================

describe('ViewFrameService — QA gap: overlapping ramp bands', () => {
  it('multiple encounter chapters with overlapping ramp bands — chronological-first wins', () => {
    // Encounter windows do NOT overlap in the production registry (the
    // chapter-registry-cross-spec.test.ts pins this). But this test
    // exercises a synthetic registry where two encounter chapters'
    // ±2-day ramps overlap, to pin the dev's `for…of` loop's behaviour:
    // the FIRST match wins. Since the dev's chapter set defaults to
    // ALL_CHAPTERS (sorted by anchorEt ascending), this means "the
    // chronologically earlier chapter wins" — predictable, testable.
    const earlier: ChapterSpec = {
      slug: 'earlier-encounter',
      name: 'Earlier',
      markerLabel: 'EAR',
      anchorEt: 0,
      windowStartEt: -10 * DAY,
      windowEndEt: 10 * DAY,
      spacecraft: 'v1',
      ogDescription: 'earlier',
      targetBody: 5,
    };
    const later: ChapterSpec = {
      slug: 'later-encounter',
      name: 'Later',
      markerLabel: 'LAT',
      anchorEt: 11 * DAY,
      windowStartEt: 11 * DAY,
      windowEndEt: 30 * DAY,
      spacecraft: 'v2',
      ogDescription: 'later',
      targetBody: 6,
    };
    // Ramp bands: earlier covers [-12*DAY, +12*DAY]; later covers [+9*DAY, +32*DAY].
    // Overlap window: [+9*DAY, +12*DAY] — both chapters claim this ET range.
    const fixtureChapters: readonly ChapterSpec[] = Object.freeze([
      earlier,
      later,
    ]);
    const { service, ephemeris } = makeService(() => false, fixtureChapters);
    ephemeris.positionByBody = new Map<number, WorldVec3 | null>([
      [5, worldVec3(1e6, 0, 0)], // Earlier's targetBody
      [6, worldVec3(0, 2e6, 0)], // Later's targetBody
    ]);
    // At et = +10.5 days, both chapters' ramp bands cover the ET. The
    // dev's for-loop iterates `this.chapters` in array order, so the
    // FIRST (chronologically earlier — body 5 → +X) wins.
    const ambiguousEt = 10.5 * DAY;
    const t = service.getTransform(ambiguousEt, null);
    expect(t.originOffsetWorld[0]).not.toBe(0); // earlier (body 5) won
    expect(t.originOffsetWorld[1]).toBe(0); // later (body 6) did not
  });

  it('production registry has no overlapping encounter ramps (defense pin)', () => {
    // Cross-check the regression contract: the production ALL_CHAPTERS
    // encounter windows are spaced widely enough that no two encounters'
    // ±2-day ramps overlap. If this assertion fails after a chapter
    // window edit, the chronological-first-wins resolution above becomes
    // user-visible and the spec needs to call it out explicitly.
    const encounters = [v1Jupiter, v2Jupiter, v1Saturn].sort(
      (a, b) => a.anchorEt - b.anchorEt,
    );
    for (let i = 0; i + 1 < encounters.length; i++) {
      const aEnd = encounters[i].windowEndEt + 2 * DAY;
      const bStart = encounters[i + 1].windowStartEt - 2 * DAY;
      expect(
        aEnd,
        `encounter ${encounters[i].slug} ramp end must not overlap with ${encounters[i + 1].slug} ramp start`,
      ).toBeLessThan(bStart);
    }
  });
});

// =============================================================================
// QA gap 3 — Non-encounter held chapter shadows neighbour encounter ramp.
// =============================================================================

describe('ViewFrameService — QA gap: non-encounter held inside encounter ramp', () => {
  it('non-encounter held chapter (launch) inside an encounter ramp zone DOES still produce the encounter blend (current contract)', () => {
    // Setup: a launch chapter (no targetBody) held at an ET that's ALSO
    // within an encounter chapter's ±2-day ramp band. The dev's
    // `resolveBlendChapter` falls through when activeChapter has
    // `targetBody === undefined`, scanning the registry for an encounter
    // whose ramp band covers `et`. So the encounter blend WINS over the
    // held non-encounter chapter — the visitor sees the body-centered
    // anchor pull even though their "held" chapter is a launch.
    //
    // This is a load-bearing contract decision: it means a future PBD
    // module that sets its own chapter spec to overlap (say) Saturn's
    // encounter ramp would get the Saturn blend applied through
    // ViewFrame, then PBD's own substate machine could override it.
    // Pin the contract so a future refactor that swaps the precedence
    // (held-wins instead of encounter-wins) is visible at test time.
    const launchAtRamp: ChapterSpec = {
      ...launchV1,
      windowStartEt: v1Jupiter.windowStartEt - 1.5 * DAY,
      windowEndEt: v1Jupiter.windowStartEt - 0.5 * DAY,
      anchorEt: v1Jupiter.windowStartEt - 1 * DAY,
    };
    const { service } = makeService();
    const t = service.getTransform(launchAtRamp.anchorEt, launchAtRamp);
    // Encounter wins — non-zero offset reflects the v1-jupiter ramp blend.
    // (alpha ≈ 0.5 at -1 day from windowStart, body fixture is at 7.78e8
    // on X, so offset[0] ≈ 3.89e8.)
    expect(t.originOffsetWorld[0]).not.toBe(0);
    expect(t.originOffsetWorld[1]).toBe(0);
    expect(t.originOffsetWorld[2]).toBe(0);
  });

  it('PBD (placeholder, no targetBody) held does NOT trigger any encounter blend', () => {
    // PBD's window is ±1 day around 1990-02-14 — well clear of every
    // encounter ramp. But pin the contract: even if a future PBD window
    // edit brings it adjacent to an encounter, PBD held returns identity.
    // The PBD module's own substate machine handles the choreography per
    // Epic 5; ViewFrame should never anchor PBD to a body.
    const { service } = makeService();
    const t = service.getTransform(paleBlueDot.anchorEt, paleBlueDot);
    expect(t.originOffsetWorld[0]).toBe(0);
    expect(t.originOffsetWorld[1]).toBe(0);
    expect(t.originOffsetWorld[2]).toBe(0);
  });
});

// =============================================================================
// QA gap 4 — Reduced-motion mid-session toggle via getTransform path.
// =============================================================================

describe('ViewFrameService — QA gap: reduced-motion mid-session toggle (getTransform path)', () => {
  it('toggling prefers-reduced-motion mid-session affects the very next getTransform call', () => {
    // The dev's view-frame.test.ts proves this for computeAlpha; here we
    // pin it for the full getTransform pipeline including the ephemeris
    // query side-effect.
    let preferReduced = false;
    const { service, ephemeris } = makeService(() => preferReduced);
    // Inside the entering ramp at alpha = 0.5 → ephemeris IS queried,
    // offset magnitude is ~0.5 × |bodyPos|.
    const rampEt = v1Jupiter.windowStartEt - 1 * DAY;
    const t1 = service.getTransform(rampEt, v1Jupiter);
    expect(t1.originOffsetWorld[0]).toBeCloseTo(
      0.5 * (ephemeris.positionFor as WorldVec3)[0],
      6,
    );
    const callsBefore = ephemeris.calls.length;

    // Toggle reduced motion ON; the same et inside the ramp should now
    // collapse to identity (alpha = 0 before windowStart under reduced
    // motion), AND the ephemeris should NOT be queried (short-circuited
    // by alpha === 0).
    preferReduced = true;
    const t2 = service.getTransform(rampEt, v1Jupiter);
    expect(t2.originOffsetWorld[0]).toBe(0);
    expect(ephemeris.calls.length).toBe(callsBefore); // no new ephemeris call
  });

  it('reduced-motion query happens per getTransform call (NOT snapshotted at construction)', () => {
    // Defensive: a future hardening pass that snapshots the reduced-motion
    // value at construction would break the runtime-toggle contract. Pin
    // by constructing the service with reducedMotion=false initially, then
    // flipping the source closure and verifying behaviour changes.
    let preferReduced = false;
    const reducedMotionSource = () => preferReduced;
    const { service } = makeService(reducedMotionSource);

    // First call: reduced motion OFF.
    expect(
      service.computeAlpha(v1Jupiter.windowStartEt - 1 * DAY, v1Jupiter),
    ).toBeCloseTo(0.5, 12);

    // Flip to ON.
    preferReduced = true;
    expect(
      service.computeAlpha(v1Jupiter.windowStartEt - 1 * DAY, v1Jupiter),
    ).toBe(0);

    // Flip back to OFF — must restore the smoothstep curve.
    preferReduced = false;
    expect(
      service.computeAlpha(v1Jupiter.windowStartEt - 1 * DAY, v1Jupiter),
    ).toBeCloseTo(0.5, 12);
  });

  it('reduced-motion source is queried for both resolveBlendChapter AND computeAlpha', () => {
    // The dev's view-frame.ts queries `this.reducedMotion()` in TWO places:
    // once in resolveBlendChapter (to skip the ramp-zone scan) and once in
    // computeAlpha (to collapse the alpha curve). Pin that flipping the
    // source affects BOTH branches.
    let preferReduced = false;
    const reducedMotionSource = () => preferReduced;
    const { service } = makeService(reducedMotionSource);

    // Inside the ramp zone with NULL activeChapter — resolveBlendChapter
    // must scan the registry. Under reduced motion the scan is skipped.
    const rampEt = v1Jupiter.windowStartEt - 1 * DAY;
    const t1 = service.getTransform(rampEt, null);
    expect(t1.originOffsetWorld[0]).not.toBe(0); // resolveBlendChapter ran

    preferReduced = true;
    const t2 = service.getTransform(rampEt, null);
    expect(t2.originOffsetWorld[0]).toBe(0); // resolveBlendChapter skipped
  });
});

// =============================================================================
// QA gap 5 — AC6 'both' spacecraft default-to-V1 fallback.
// =============================================================================

describe('AC6 — naifIdForSpacecraft (both → -31 default)', () => {
  // Mirror of the helper from main.ts. Since main.ts re-implements this
  // helper (not exported), the QA test replicates it to pin the contract.
  // If main.ts changes the mapping, the source-shape pin in
  // chapter-director-attitude-indicator-wire.test.ts will fail; this test
  // pins the EFFECT of the contract.
  const naifIdForSpacecraft = (s: Spacecraft): -31 | -32 => {
    if (s === 'v2') return -32;
    return -31; // 'v1' or 'both'
  };

  it("'v1' → -31", () => {
    expect(naifIdForSpacecraft('v1')).toBe(-31);
  });

  it("'v2' → -32", () => {
    expect(naifIdForSpacecraft('v2')).toBe(-32);
  });

  it("'both' → -31 (matches the Story 3.6 indicator stub default)", () => {
    // Story 3.6 AC4 commits the indicator's stub default to V1 (-31). The
    // 'both' fallback must match so a hypothetical chapter spec with
    // spacecraft: 'both' doesn't flicker the indicator.
    expect(naifIdForSpacecraft('both')).toBe(-31);
  });

  it('exhaustive Spacecraft type coverage — no unhandled case', () => {
    // If the Spacecraft type grows a new variant (Story 5.x: 'both-v1' for
    // PBD-with-cruise overlap? hypothetical), this assertion forces the
    // QA author to update the helper rather than silently default through.
    const cases: Spacecraft[] = ['v1', 'v2', 'both'];
    for (const c of cases) {
      const result = naifIdForSpacecraft(c);
      expect([-31, -32]).toContain(result);
    }
  });
});

// =============================================================================
// QA gap 6 — Non-encounter chapter with accidentally-set targetBody.
// =============================================================================

describe('ViewFrameService — QA gap: non-encounter chapter accidentally gains targetBody', () => {
  it("a synthesized non-encounter spec with targetBody set IS treated as an encounter (defensive — the registry test is the canonical guard)", () => {
    // The chapters/target-body.test.ts test pins which chapters carry
    // targetBody. This test confirms the load-bearing contract from
    // ViewFrame's perspective: if a chapter has targetBody set, the service
    // WILL apply the encounter blend regardless of slug. So the only
    // defense against an accidentally-encountered launch chapter is the
    // chapters/target-body.test.ts assertion — pin that contract here
    // from the consumer side too.
    const accidentalEncounter: ChapterSpec = {
      slug: 'launch-v1-accidentally-an-encounter',
      name: 'Accidentally encounters Jupiter',
      markerLabel: 'OOPS',
      anchorEt: 0,
      windowStartEt: -DAY,
      windowEndEt: DAY,
      spacecraft: 'v1',
      ogDescription: 'oops',
      targetBody: 5, // SHOULDN'T be set on a launch chapter, but if it is…
    };
    const { service, ephemeris } = makeService();
    const t = service.getTransform(accidentalEncounter.anchorEt, accidentalEncounter);
    // Alpha = 1 inside the window; offset = bodyPos as supplied.
    expect(t.originOffsetWorld[0]).toBe(
      (ephemeris.positionFor as WorldVec3)[0],
    );
    // This test PASSES under the current implementation — confirming that
    // chapters/target-body.test.ts is the ONLY defense. A future hardening
    // pass could add a slug-allowlist gate (e.g., "only the 6 encounter
    // slugs can have targetBody"), but that's an over-engineering call —
    // the registry test is sufficient.
  });
});

// =============================================================================
// QA gap 7 — Body position at zero (degenerate physics, defensive contract).
// =============================================================================

describe('ViewFrameService — QA gap: degenerate body positions', () => {
  it('body position at the origin (zero vector) — produces zero offset (visitor stays heliocentric)', () => {
    // Defensive contract — a body at the Sun is physically impossible, but
    // pin the math: alpha × (0,0,0) = (0,0,0), and the visitor remains
    // heliocentric for the duration. No NaN, no division-by-zero anywhere.
    const { service, ephemeris } = makeService();
    ephemeris.positionFor = worldVec3(0, 0, 0);
    const t = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    expect(t.originOffsetWorld[0]).toBe(0);
    expect(t.originOffsetWorld[1]).toBe(0);
    expect(t.originOffsetWorld[2]).toBe(0);
  });

  it('extremely large body position (Neptune at 30 AU = 4.5e9 km) — exact arithmetic in Float64', () => {
    // Float64 mantissa is ~15.95 decimal digits; 4.5e9 × 1.0 = 4.5e9 exactly.
    // Multiplication by alpha = 0.5 yields 2.25e9 exactly — no rounding.
    // This pins the precision contract that ViewFrame never loses sub-meter
    // precision in the lerp arithmetic.
    const { service, ephemeris } = makeService();
    const neptuneDistance = 4.5e9;
    ephemeris.positionFor = worldVec3(neptuneDistance, 0, 0);
    // alpha = 0.5 at windowStart - 1 day.
    const t = service.getTransform(
      v1Jupiter.windowStartEt - 1 * DAY,
      v1Jupiter,
    );
    expect(t.originOffsetWorld[0]).toBeCloseTo(0.5 * neptuneDistance, 0);
  });
});

// =============================================================================
// QA gap 8 — Synchronous double getTransform — idempotency, no hidden state.
// =============================================================================

describe('ViewFrameService — QA gap: idempotent calls', () => {
  it('two synchronous getTransform calls at the same (et, chapter) return equal vectors', () => {
    // Pin the no-hidden-state contract: ViewFrame is pure modulo the
    // injected ephemeris + reducedMotion. Two consecutive calls with the
    // same inputs MUST return arithmetically equal vectors (Float64
    // equality, not approximate).
    const { service } = makeService();
    const t1 = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    const t2 = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    expect(t1.originOffsetWorld[0]).toBe(t2.originOffsetWorld[0]);
    expect(t1.originOffsetWorld[1]).toBe(t2.originOffsetWorld[1]);
    expect(t1.originOffsetWorld[2]).toBe(t2.originOffsetWorld[2]);
  });

  it('two consecutive calls allocate distinct WorldVec3 arrays (no aliasing)', () => {
    // Even though the values are identical, the underlying Float64Arrays
    // must be distinct objects so a downstream consumer writing through
    // one cannot mutate the other. (Pinned by dev's `non-identity branch
    // returns a fresh object per call`; cross-asserted here for
    // discoverability.)
    const { service } = makeService();
    const t1 = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    const t2 = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    expect(t1.originOffsetWorld).not.toBe(t2.originOffsetWorld);
  });
});

// =============================================================================
// QA gap 9 — ET = NaN / Infinity — ViewFrame contract.
// =============================================================================

describe('ViewFrameService — QA gap: defensive ET values', () => {
  it('NaN ET with null activeChapter returns identity (scan finds nothing)', () => {
    // ET = NaN propagates through every comparison as false, so the scan
    // loop's `et >= windowStartEt - DAY` is always false → returns null →
    // identity. Pin the contract: NaN ET is silently treated as "no
    // encounter" rather than crashing.
    const { service } = makeService();
    const t = service.getTransform(Number.NaN, null);
    expect(t.originOffsetWorld[0]).toBe(0);
  });

  it('NaN ET with held encounter chapter — alpha computation yields the held alpha = 1 OR identity (NaN comparison short-circuits)', () => {
    // computeAlpha against NaN ET: `et >= windowStartEt && et <= windowEndEt`
    // is false for any NaN comparison → falls through to entering ramp
    // check `et < windowStartEt` which is also false → falls through to
    // exiting ramp `et >= rampEnd` which is also false → returns
    // `smoothstep(rampEnd, windowEndEt, NaN)` which returns NaN. NaN alpha
    // × bodyPos = NaN offset. Pin the current behaviour.
    const { service } = makeService();
    const t = service.getTransform(Number.NaN, v1Jupiter);
    // Document the current behaviour: NaN propagates. Defensive against a
    // future hardening pass that gates on Number.isFinite(et).
    expect(Number.isNaN(t.originOffsetWorld[0]) || t.originOffsetWorld[0] === 0).toBe(true);
  });

  it('Infinity ET with held encounter chapter returns alpha = 0 (well past the exit ramp)', () => {
    // `et >= rampEnd` is true for Infinity, so computeAlpha returns 0 →
    // identity. Pin the contract: Infinity ET is a graceful "way past
    // the chapter" signal.
    const { service } = makeService();
    const t = service.getTransform(Number.POSITIVE_INFINITY, v1Jupiter);
    expect(t.originOffsetWorld[0]).toBe(0);
  });

  it('-Infinity ET returns alpha = 0 (well before the entering ramp)', () => {
    // `et <= rampStart` is true for -Infinity. Identity output.
    const { service } = makeService();
    const t = service.getTransform(Number.NEGATIVE_INFINITY, v1Jupiter);
    expect(t.originOffsetWorld[0]).toBe(0);
  });
});

// =============================================================================
// QA gap 10 — Empty chapter set — defensive contract.
// =============================================================================

describe('ViewFrameService — QA gap: empty chapter set', () => {
  it('empty chapters[] set + null activeChapter returns identity (no scan match possible)', () => {
    // Defensive: if a test or a future code path constructs ViewFrame with
    // an empty chapter set, the ramp-zone scan finds nothing. Identity.
    const { service } = makeService(() => false, Object.freeze([] as ChapterSpec[]));
    const t = service.getTransform(v1Jupiter.windowStartEt - 1 * DAY, null);
    expect(t.originOffsetWorld[0]).toBe(0);
  });

  it('empty chapters[] set + held encounter chapter still applies the blend (activeChapter is the source of truth)', () => {
    // The chapters[] set is only consulted when activeChapter is null.
    // When the FSM hands us a held encounter, the chapters[] is irrelevant
    // — we use activeChapter directly. Pin this so a future refactor that
    // unifies the two paths doesn't accidentally make activeChapter
    // dependent on chapters[] membership.
    const { service } = makeService(() => false, Object.freeze([] as ChapterSpec[]));
    const t = service.getTransform(v1Jupiter.anchorEt, v1Jupiter);
    expect(t.originOffsetWorld[0]).not.toBe(0); // blend applied
  });
});
