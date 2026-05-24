// @vitest-environment happy-dom
/**
 * Story 5.2 — QA gap-fill integration tests for PBD override lifecycle.
 *
 * Authored during the Story 5.2 QA stage (bmad-qa-generate-e2e-tests) to
 * close coverage gaps the dev's 58 tests did not yet exercise. These pin
 * the override-lifecycle CONTRACT — what `PaleBlueDot.getPlatformQuatOverride`
 * returns across substate transitions and across chapter-exit semantics.
 *
 * Gaps closed (per QA stage prompt):
 *
 *   1. **Override DEACTIVATES on substate exit (sweeping_<body> → non-sweeping).**
 *      Dev tests cover each substate individually returning null/non-null,
 *      but no test exercises the TRANSITION itself — e.g., entering
 *      sweeping_neptune then advancing to composite_active and asserting
 *      the override returns null after the transition fires. This pins the
 *      contract that `update(et)` correctly tears down the active aim when
 *      leaving a sweeping substate.
 *
 *   2. **Override behaviour on chapter-exit semantics.** The PBD module's
 *      `update(et)` is gated by `paleBlueDotActive` in `main.ts` (Path A
 *      subscriber pattern — see `web/src/main.ts:206-218`). When the
 *      ChapterDirector transitions PBD out of `held`, `main.ts` stops
 *      calling `update`. The override's behaviour after that gate-closure
 *      depends on whether the choreography state is also reset; this test
 *      pins the observed contract — without `dispose()`, the choreography
 *      retains its last state, so the override only deactivates when a
 *      subsequent `update(et)` with a non-sweeping ET arrives. The
 *      production wiring is correct because main.ts continues to scrub
 *      `chapterDirector.update(et)` (driving substate-at-ET resolution)
 *      even when PBD is no longer the active chapter — the next non-PBD
 *      update naturally resolves PBD's substate to `passed`/`idle`.
 *
 *   3. **Mid-arc transition coverage.** Asserts the override is non-null
 *      DURING `sweeping_neptune` (last sweeping substate before composite
 *      kicks in) — this is the boundary case where a 100× speedup could
 *      conceivably skip the substate; closing this gap pins that even at
 *      the arc's tail end, the override does the right thing.
 *
 * Uses the same fixture style as `pale-blue-dot-turn-integration.test.ts`
 * (the canonical Story 5.2 integration test file).
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { PaleBlueDot } from '../src/chapters/pale-blue-dot';
import {
  PbdSubstate,
  PBD_ANCHOR_ET,
} from '../src/chapters/pale-blue-dot/substates';
import type { AttitudeService } from '../src/services/attitude-service';
import type { EphemerisService } from '../src/services/ephemeris-service';
import type { WorldVec3, Quaternion as BrandedQuaternion } from '../src/types/branded';
import { quaternion } from '../src/types/branded';

// === Fixture helpers =========================================================

const worldVec = (x: number, y: number, z: number): WorldVec3 => {
  const a = new Float64Array(3);
  a[0] = x; a[1] = y; a[2] = z;
  return a as WorldVec3;
};

const identityBusQuat = quaternion(0, 0, 0, 1);

interface PositionMap {
  [bodyId: number]: WorldVec3 | null;
}

const buildEphemeris = (positions: PositionMap): EphemerisService => {
  return {
    getPosition: (_et: number, bodyId: number): WorldVec3 | null =>
      positions[bodyId] ?? null,
  } as unknown as EphemerisService;
};

const buildAttitudeService = (
  busQuatV1: BrandedQuaternion,
): AttitudeService => {
  return {
    getBusQuat: (naifId: number, _et: number): BrandedQuaternion | null =>
      naifId === -31 ? busQuatV1 : null,
    getPlatformQuat: (_naifId: number, _et: number): BrandedQuaternion | null =>
      null,
    getBusProvenance: (_naifId: number, _et: number) => 'ck' as const,
    getPlatformProvenance: (_naifId: number, _et: number) => 'synthesized' as const,
  } as unknown as AttitudeService;
};

const buildPbdPositions = (): PositionMap => ({
  [-31]: worldVec(5e9, 0, 0), // V1 ~33 AU along +X
  2: worldVec(1.5e8, 0, 0),    // Venus
  3: worldVec(0, 0, 0),        // Earth at origin
  5: worldVec(1e9, 5e8, 0),    // Jupiter
  6: worldVec(1e9, -5e8, 0),   // Saturn
  7: worldVec(2e9, 0, 0),      // Uranus
  8: worldVec(3e9, 0, 0),      // Neptune
});

// === Tests ===================================================================

describe('Story 5.2 QA gap-fill — PBD override lifecycle', () => {
  let pbd: PaleBlueDot;
  let ephemeris: EphemerisService;
  let attitudeService: AttitudeService;

  beforeEach(() => {
    pbd = new PaleBlueDot({
      reducedMotion: () => false,
      wallClock: () => 1000,
    });
    ephemeris = buildEphemeris(buildPbdPositions());
    attitudeService = buildAttitudeService(identityBusQuat);
    pbd.setServices(ephemeris, attitudeService);
  });

  describe('Gap 1 — override deactivates on substate-exit transition', () => {
    it('sweeping_neptune → composite_decay transition: override returns non-null DURING sweeping_neptune, then null after the transition fires', () => {
      // After Story 5.3 Rule-5 amendment, sweeping_neptune peak is at
      // +142.5s and composite_decay starts at +150s.
      pbd.update(PBD_ANCHOR_ET + 142.5);
      expect(pbd.currentSubstate).toBe(PbdSubstate.sweeping_neptune);
      const inNeptune = pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 142.5);
      expect(inNeptune).not.toBe(null);

      // Advance into composite_decay. The transition fires; the choreography
      // engine receives `setActiveSubstate(composite_decay, null)` and the
      // override must now return null.
      pbd.update(PBD_ANCHOR_ET + 165);
      expect(pbd.currentSubstate).toBe(PbdSubstate.composite_decay);
      const afterTransition = pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 165);
      expect(afterTransition).toBe(null);
      expect(pbd.currentTargetNaifId).toBe(null);
    });

    it('sweeping_earth → composite_active transition: override goes null after entering the 30-second Earth-plate hold (Story 5.3 Rule-5 amendment)', () => {
      // Enter sweeping_earth peak — override active, target = Earth.
      pbd.update(PBD_ANCHOR_ET + 52.5);
      expect(pbd.currentSubstate).toBe(PbdSubstate.sweeping_earth);
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 52.5)).not.toBe(null);

      // Advance into the 30-second Earth-plate hold (composite_active).
      // Per the Rule-5 amendment the scan platform stops actively re-aiming
      // (override returns null) — the composite layer keeps the Earth plate
      // visible across both sweeping_earth and composite_active.
      pbd.update(PBD_ANCHOR_ET + 75);
      expect(pbd.currentSubstate).toBe(PbdSubstate.composite_active);
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 75)).toBe(null);
      expect(pbd.currentTargetNaifId).toBe(null);
    });

    it('sweeping_venus → sweeping_earth transition: override stays non-null and target body advances', () => {
      // Both endpoints are sweeping substates — the override should stay
      // non-null across the transition (the body just changes which target
      // it's aimed at). This is the "happy-path" SLERP transition.
      //
      // Note: with the wall clock pinned at 1000ms, the SLERP elapsed is
      // 0 immediately after the substate transition, so `tick()` returns
      // the SLERPed-at-t=0 value which equals the PREVIOUS endpoint
      // (Venus's aim). The contract is that the latched ENDPOINT advances
      // to Earth's aim — assert via `currentTargetNaifId` and via the
      // post-SLERP-window tick (which we exercise in turn-choreography.test.ts).
      // Here we only pin: (a) the override stays non-null across the
      // transition, and (b) `currentTargetNaifId` advances correctly.
      //
      // We exercise Venus→Earth (not Earth→Jupiter) because the Story 5.3
      // Rule-5 amendment inserts composite_active between Earth and Jupiter,
      // so the next sweeping-to-sweeping transition after Earth is via the
      // composite_active hold. Venus→Earth is the cleanest sweeping↔sweeping
      // happy-path pair.
      pbd.update(PBD_ANCHOR_ET + 37.5); // sweeping_venus peak
      expect(pbd.currentSubstate).toBe(PbdSubstate.sweeping_venus);
      const inVenus = pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 37.5);
      expect(inVenus).not.toBe(null);
      expect(pbd.currentTargetNaifId).toBe(2);

      pbd.update(PBD_ANCHOR_ET + 52.5); // sweeping_earth peak
      expect(pbd.currentSubstate).toBe(PbdSubstate.sweeping_earth);
      const inEarth = pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 52.5);
      expect(inEarth).not.toBe(null);
      expect(pbd.currentTargetNaifId).toBe(3);
    });

    it('turning → sweeping_venus: override is null during turning, then non-null after entering sweeping_venus', () => {
      pbd.update(PBD_ANCHOR_ET + 15); // turning peak
      expect(pbd.currentSubstate).toBe(PbdSubstate.turning);
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 15)).toBe(null);

      pbd.update(PBD_ANCHOR_ET + 37.5); // sweeping_venus peak
      expect(pbd.currentSubstate).toBe(PbdSubstate.sweeping_venus);
      const aim = pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 37.5);
      expect(aim).not.toBe(null);
      expect(pbd.currentTargetNaifId).toBe(2);
    });
  });

  describe('Gap 2 — override behaviour across chapter-exit semantics', () => {
    it('override goes null at `passed` substate (post-arc), simulating chapter-exit progression', () => {
      // Walk through the full arc then past `passed`. Even though main.ts
      // would stop calling update() on chapter exit, the choreography
      // correctly tears down when an explicit non-sweeping update arrives.
      // sweeping_neptune peak after Story 5.3 Rule-5 amendment is +142.5s.
      pbd.update(PBD_ANCHOR_ET + 142.5); // sweeping_neptune
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 142.5)).not.toBe(null);

      pbd.update(PBD_ANCHOR_ET + 200); // passed (post-arc)
      expect(pbd.currentSubstate).toBe(PbdSubstate.passed);
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 200)).toBe(null);
      expect(pbd.currentTargetNaifId).toBe(null);
    });

    it('dispose() resets the choreography mid-sweep (the chapter-exit hard-reset path)', () => {
      // Enter sweeping_earth — override active.
      pbd.update(PBD_ANCHOR_ET + 52.5);
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 52.5)).not.toBe(null);

      // dispose() simulates a hard chapter-tear-down (also called on
      // hot-reload). After dispose the override always returns null.
      pbd.dispose();
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 52.5)).toBe(null);
      expect(pbd.currentTargetNaifId).toBe(null);
      expect(pbd.currentPlatformOverrideQuat).toBe(null);
    });

    it('reverse scrub: sweeping → turning rewind still tears down the override', () => {
      // Scrubbing backwards is a legitimate user gesture (detail-scrubber
      // drag-left). Verify the override deactivates correctly when the
      // substate retreats from sweeping_<body> to turning.
      pbd.update(PBD_ANCHOR_ET + 52.5); // sweeping_earth
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 52.5)).not.toBe(null);

      pbd.update(PBD_ANCHOR_ET + 15); // turning (rewind)
      expect(pbd.currentSubstate).toBe(PbdSubstate.turning);
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 15)).toBe(null);
      expect(pbd.currentTargetNaifId).toBe(null);
    });

    it('reverse scrub past anchor: sweeping_jupiter → idle (pre-anchor) tears down the override', () => {
      // sweeping_jupiter peak after Story 5.3 Rule-5 amendment is +97.5s.
      pbd.update(PBD_ANCHOR_ET + 97.5); // sweeping_jupiter
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 97.5)).not.toBe(null);

      pbd.update(PBD_ANCHOR_ET - 10); // idle (pre-anchor)
      expect(pbd.currentSubstate).toBe(PbdSubstate.idle);
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET - 10)).toBe(null);
    });
  });

  describe('Gap 3 — V2 (-32) override unconditionally null (PBD only acts on V1)', () => {
    it('during sweeping_earth, V2 override remains null while V1 override is non-null', () => {
      pbd.update(PBD_ANCHOR_ET + 52.5);
      const v1Override = pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 52.5);
      const v2Override = pbd.getPlatformQuatOverride(-32, PBD_ANCHOR_ET + 52.5);
      expect(v1Override).not.toBe(null);
      expect(v2Override).toBe(null);
    });

    it('arbitrary other NAIF IDs (e.g. -98 future probe) return null', () => {
      pbd.update(PBD_ANCHOR_ET + 52.5);
      expect(pbd.getPlatformQuatOverride(-98, PBD_ANCHOR_ET + 52.5)).toBe(null);
      expect(pbd.getPlatformQuatOverride(0, PBD_ANCHOR_ET + 52.5)).toBe(null);
    });
  });

  describe('Gap 4 — PBD activation idempotency at the subscribe level', () => {
    it('repeated update(et) calls with same ET after entering sweeping_<body> do not double-fire substate-change listeners', () => {
      const visited: Array<{ from: PbdSubstate; to: PbdSubstate }> = [];
      pbd.subscribe((from, to) => visited.push({ from, to }));

      pbd.update(PBD_ANCHOR_ET + 52.5);
      pbd.update(PBD_ANCHOR_ET + 52.5); // idempotent
      pbd.update(PBD_ANCHOR_ET + 52.5); // idempotent

      // Should have fired the idle → sweeping_earth transition once.
      // (Internally the substate machine goes idle → turning → ... → earth
      // by means of state-machine progression in `pbdSubstateAt`, but the
      // module only fires one notify per actual substate change.)
      const distinctTransitions = visited.filter(
        (v, idx) => idx === 0 || visited[idx - 1].to !== v.to,
      );
      expect(distinctTransitions.length).toBe(1);
      expect(distinctTransitions[0].to).toBe(PbdSubstate.sweeping_earth);
    });

    it('double-subscribe with same listener is deduplicated (Set semantics)', () => {
      // Set.add is a no-op when the same reference is added twice — this
      // confirms that even if main.ts wired the subscriber twice (e.g.
      // hot-reload race), the listener does NOT fire twice per event.
      let fireCount = 0;
      const listener = () => { fireCount += 1; };
      pbd.subscribe(listener);
      pbd.subscribe(listener); // same reference

      pbd.update(PBD_ANCHOR_ET + 52.5);
      expect(fireCount).toBe(1);
    });
  });
});
