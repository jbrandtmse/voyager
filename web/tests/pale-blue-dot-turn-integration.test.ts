// @vitest-environment happy-dom
/**
 * Story 5.2 — PBD choreographed turn integration tests.
 *
 * Exercises the cross-module wire-up:
 *   - AttitudeApplier consults the PBD module's override BEFORE
 *     calling AttitudeService.getPlatformQuat.
 *   - AC2: during PBD window, the BUS quaternion comes from the
 *     AttitudeService (CK-derived stub here) and is NOT mutated by PBD.
 *   - AC5: the substate machine advances correctly at simulated 1×,
 *     10×, 100× speeds (no skipped substates, deterministic state).
 *   - AC7: the SCAN_PLATFORM Object3D's quaternion equals the PBD
 *     override during sweeping substates, AND (via parent BUS quat
 *     pre-applied) the world-space rotation aims platform +Z near the
 *     V1→target direction in J2000 within 5°.
 *
 * Uses real PaleBlueDot + AttitudeApplier instances against minimal
 * stubs for EphemerisService + AttitudeService + SpacecraftModels.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Group } from 'three';

import { PaleBlueDot } from '../src/chapters/pale-blue-dot';
import { PbdSubstate, PBD_ANCHOR_ET, pbdSubstateAt } from '../src/chapters/pale-blue-dot/substates';
import { AttitudeApplier } from '../src/render/attitude-applier';
import type { AttitudeService } from '../src/services/attitude-service';
import type { EphemerisService } from '../src/services/ephemeris-service';
import type { SpacecraftModels, SpacecraftHandle } from '../src/render/spacecraft-models';
import { quaternion } from '../src/types/branded';
import type { Quaternion as BrandedQuaternion, WorldVec3 } from '../src/types/branded';

// === Fixture helpers =========================================================

const worldVec = (x: number, y: number, z: number): WorldVec3 => {
  const a = new Float64Array(3);
  a[0] = x; a[1] = y; a[2] = z;
  return a as WorldVec3;
};

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
      null, // PBD override should win for V1; null fallback for V2.
    getBusProvenance: (_naifId: number, _et: number) => 'ck' as const,
    getPlatformProvenance: (_naifId: number, _et: number) => 'synthesized' as const,
  } as unknown as AttitudeService;
};

interface FixtureSpacecraft {
  handle: SpacecraftHandle;
  busNode: Group;
  platformNode: Group;
}

const buildSpacecraft = (id: 'voyager-1' | 'voyager-2'): FixtureSpacecraft => {
  const group = new Group();
  group.name = id;
  group.visible = true;
  const bus = new Group();
  bus.name = 'BUS';
  const platform = new Group();
  platform.name = 'SCAN_PLATFORM';
  bus.add(platform);  // SCAN_PLATFORM is a CHILD of BUS — matches Story 3.3 hierarchy.
  group.add(bus);

  const handle: SpacecraftHandle = {
    id,
    naifId: id === 'voyager-1' ? -31 : -32,
    group,
    lod: null,
    hasInitialPosition: true,
  };
  return { handle, busNode: bus, platformNode: platform };
};

const buildModels = (v1: FixtureSpacecraft, v2: FixtureSpacecraft): SpacecraftModels =>
  ({
    getHandle: (id: 'voyager-1' | 'voyager-2'): SpacecraftHandle =>
      id === 'voyager-1' ? v1.handle : v2.handle,
  } as unknown as SpacecraftModels);

const identityBusQuat = quaternion(0, 0, 0, 1);

const V1_POS = worldVec(5e9, 0, 0); // V1 ~33 AU along +X (past Neptune)
const EARTH_POS = worldVec(0, 0, 0); // Earth ~origin

const buildPbdPositions = (): PositionMap => ({
  [-31]: V1_POS,
  2: worldVec(1.5e8, 0, 0),  // Venus
  3: EARTH_POS,              // Earth
  5: worldVec(1e9, 5e8, 0),  // Jupiter
  6: worldVec(1e9, -5e8, 0), // Saturn
  7: worldVec(2e9, 0, 0),    // Uranus
  8: worldVec(3e9, 0, 0),    // Neptune
});

// === Tests ===================================================================

describe('Story 5.2 — PBD choreographed turn integration', () => {
  let pbd: PaleBlueDot;
  let applier: AttitudeApplier;
  let v1: FixtureSpacecraft;
  let v2: FixtureSpacecraft;
  let models: SpacecraftModels;
  let ephemeris: EphemerisService;
  let attitudeService: AttitudeService;

  beforeEach(() => {
    let wallClockMs = 1000;
    pbd = new PaleBlueDot({
      reducedMotion: () => false,
      wallClock: () => wallClockMs,
    });
    applier = new AttitudeApplier();
    v1 = buildSpacecraft('voyager-1');
    v2 = buildSpacecraft('voyager-2');
    models = buildModels(v1, v2);
    ephemeris = buildEphemeris(buildPbdPositions());
    attitudeService = buildAttitudeService(identityBusQuat);
    pbd.setServices(ephemeris, attitudeService);
    applier.pbdOverrideProvider = pbd;
  });

  describe('AC2 — bus quaternion is service-driven (CK), not mutated by PBD', () => {
    it('during the sweeping_earth substate, the BUS node quaternion equals the AttitudeService quat exactly', () => {
      const busQ = quaternion(0.1, 0.2, 0.0, Math.sqrt(1 - 0.05));
      // Re-wire with a non-identity bus quat.
      const svc = {
        getBusQuat: (naifId: number) => (naifId === -31 ? busQ : null),
        getPlatformQuat: () => null,
      } as unknown as AttitudeService;
      pbd.setServices(ephemeris, svc);

      pbd.update(PBD_ANCHOR_ET + 52.5); // sweeping_earth peak
      applier.tick(PBD_ANCHOR_ET + 52.5, svc, models);

      // BUS quaternion equals AttitudeService output exactly.
      expect(v1.busNode.quaternion.x).toBeCloseTo(busQ.x, 12);
      expect(v1.busNode.quaternion.y).toBeCloseTo(busQ.y, 12);
      expect(v1.busNode.quaternion.z).toBeCloseTo(busQ.z, 12);
      expect(v1.busNode.quaternion.w).toBeCloseTo(busQ.w, 12);
    });
  });

  describe('AC3 — PBD override drives the SCAN_PLATFORM quaternion during sweeping substates', () => {
    it('SCAN_PLATFORM quaternion equals the PBD override during sweeping_earth', () => {
      pbd.update(PBD_ANCHOR_ET + 52.5);
      applier.tick(PBD_ANCHOR_ET + 52.5, attitudeService, models);

      const override = pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 52.5);
      expect(override).not.toBe(null);
      // applier just wrote the override quat — but BEFORE we called
      // applier.tick() above, the override was first consumed; the
      // applier reads it again in tick(). The two calls produce the
      // same value because the choreography state (post-SLERP-completion)
      // is stable. Compare the post-tick SCAN_PLATFORM node to override.
      expect(v1.platformNode.quaternion.x).toBeCloseTo(override!.x, 6);
      expect(v1.platformNode.quaternion.y).toBeCloseTo(override!.y, 6);
      expect(v1.platformNode.quaternion.z).toBeCloseTo(override!.z, 6);
      expect(v1.platformNode.quaternion.w).toBeCloseTo(override!.w, 6);
    });

    it('outside sweeping substates (turning), override returns null and AttitudeService fallback applies', () => {
      pbd.update(PBD_ANCHOR_ET + 15); // turning peak
      expect(pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 15)).toBe(null);

      // SCAN_PLATFORM gets AttitudeService.getPlatformQuat (null in our stub
      // → identity quaternion preserved on the node).
      applier.tick(PBD_ANCHOR_ET + 15, attitudeService, models);
      // Default Three.js Quaternion is (0, 0, 0, 1).
      expect(v1.platformNode.quaternion.w).toBeCloseTo(1, 12);
    });
  });

  describe('AC7 — boresight propagates to platform-frame +Z aimed at target', () => {
    it('during sweeping_earth at peak, the world-space platform +Z direction is within 5° of V1→Earth (identity bus)', () => {
      pbd.update(PBD_ANCHOR_ET + 52.5);
      applier.tick(PBD_ANCHOR_ET + 52.5, attitudeService, models);

      // V1 at (5e9, 0, 0), Earth at (0, 0, 0). V1→Earth direction = (-1, 0, 0).
      const target = new THREE.Vector3(-1, 0, 0);

      // Compute world-space platform rotation: parent BUS * child SCAN_PLATFORM.
      // Since BUS is identity (attitudeService returns identity bus quat),
      // world quat == platform local quat.
      const platformWorldQ = new THREE.Quaternion(
        v1.busNode.quaternion.x,
        v1.busNode.quaternion.y,
        v1.busNode.quaternion.z,
        v1.busNode.quaternion.w,
      ).multiply(v1.platformNode.quaternion);

      const boresightWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(platformWorldQ);
      const dot = boresightWorld.dot(target);
      const angleRad = Math.acos(Math.min(1, Math.max(-1, dot)));
      const angleDeg = (angleRad * 180) / Math.PI;
      expect(angleDeg).toBeLessThanOrEqual(5);
    });

    it('during sweeping_venus, boresight aims at Venus within 5°', () => {
      pbd.update(PBD_ANCHOR_ET + 37.5);
      applier.tick(PBD_ANCHOR_ET + 37.5, attitudeService, models);

      const v1Pos = new THREE.Vector3(V1_POS[0], V1_POS[1], V1_POS[2]);
      const venusPos = new THREE.Vector3(1.5e8, 0, 0);
      const target = venusPos.clone().sub(v1Pos).normalize();

      const platformWorldQ = new THREE.Quaternion(
        v1.busNode.quaternion.x,
        v1.busNode.quaternion.y,
        v1.busNode.quaternion.z,
        v1.busNode.quaternion.w,
      ).multiply(v1.platformNode.quaternion);

      const boresightWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(platformWorldQ);
      const dot = boresightWorld.dot(target);
      const angleRad = Math.acos(Math.min(1, Math.max(-1, dot)));
      const angleDeg = (angleRad * 180) / Math.PI;
      expect(angleDeg).toBeLessThanOrEqual(5);
    });
  });

  describe('AC5 — substate sequence proceeds correctly at 1× / 10× / 100× simulation speeds', () => {
    // The substate-at-ET resolution naturally scales with simulation
    // speed because the substate-at-ET resolution is offset-from-anchor
    // based; the ChapterDirector / ClockManager scale ET internally.
    // This test exercises the substate-state-machine correctness by
    // sampling ETs at multiple per-speed cadences.

    // Story 5.3 Rule-5 amendment: composite_active is repositioned to
    // sit BETWEEN sweeping_earth and sweeping_jupiter (the 30-second
    // Earth-plate hold per epic spec line 2141).
    const expectedSequence: PbdSubstate[] = [
      PbdSubstate.turning,
      PbdSubstate.sweeping_venus,
      PbdSubstate.sweeping_earth,
      PbdSubstate.composite_active,
      PbdSubstate.sweeping_jupiter,
      PbdSubstate.sweeping_saturn,
      PbdSubstate.sweeping_uranus,
      PbdSubstate.sweeping_neptune,
      PbdSubstate.composite_decay,
      PbdSubstate.passed,
    ];

    const runSpeed = (etStep: number) => {
      const visited: PbdSubstate[] = [];
      // Start at anchor (enters `turning`) and step through the arc.
      // The arc is 180 simulated seconds; at 1× the etStep is small, at
      // 100× the etStep is large — but in all cases the substate
      // transitions through the canonical sequence.
      let et = PBD_ANCHOR_ET;
      const fresh = new PaleBlueDot({
        reducedMotion: () => false,
        wallClock: () => 1000,
      });
      fresh.setServices(ephemeris, attitudeService);
      fresh.subscribe((_from, to) => visited.push(to));

      while (et < PBD_ANCHOR_ET + 200) {
        fresh.update(et);
        et += etStep;
      }
      // Always end up in `passed`.
      fresh.update(PBD_ANCHOR_ET + 200);
      return visited;
    };

    it('1× cadence (1s steps) — all 10 transitions fire in order', () => {
      const visited = runSpeed(1);
      // Filter unique consecutive states.
      const compact: PbdSubstate[] = [];
      for (const s of visited) {
        if (compact[compact.length - 1] !== s) compact.push(s);
      }
      expect(compact).toEqual(expectedSequence);
    });

    it('10× cadence (10s steps) — all transitions still observed in order', () => {
      const visited = runSpeed(10);
      const compact: PbdSubstate[] = [];
      for (const s of visited) {
        if (compact[compact.length - 1] !== s) compact.push(s);
      }
      expect(compact).toEqual(expectedSequence);
    });

    it('100× cadence (large 15s steps) — no skipped substates as long as ET step <= shortest substate window', () => {
      // The shortest substate window in PBD_SUBSTATE_TIMINGS is the
      // sweeping_<body> substates at 15s wide. A 15s ET step is the
      // canonical "100× simulation speed" cadence at 60Hz frame rate
      // (60 frames × ~16.7ms × 100 = ~100s simulation time, i.e. ~6-7
      // substates per second of wall-clock — but the per-frame step is
      // still small enough to hit each substate at least once). Use 15s
      // here to assert the contract.
      const visited = runSpeed(15);
      const compact: PbdSubstate[] = [];
      for (const s of visited) {
        if (compact[compact.length - 1] !== s) compact.push(s);
      }
      // At 15s ET-steps the substates may be hit unevenly but ALL 6
      // sweeping bodies + composite_active + composite_decay + passed
      // must appear in order.
      // We verify presence of each in order rather than strict equality
      // (the ET step may land on a boundary and skip a transition).
      let cursor = 0;
      for (const expected of expectedSequence) {
        const found = compact.indexOf(expected, cursor);
        expect(found, `expected ${expected} after cursor=${cursor}`).toBeGreaterThanOrEqual(cursor);
        cursor = found;
      }
    });

    it('manual scrub: pbdSubstateAt at arbitrary in-window ETs resolves the correct substate', () => {
      // Scrubbing is just a direct call to pbdSubstateAt; verify a
      // selection of ETs land on the expected substates.
      // Substate boundaries after Story 5.3 Rule-5 amendment:
      //   idle              < +0
      //   turning           [0, 30)
      //   sweeping_venus    [30, 45)
      //   sweeping_earth    [45, 60)
      //   composite_active  [60, 90)    ← Rule-5 amendment (Earth-plate hold)
      //   sweeping_jupiter  [90, 105)
      //   sweeping_saturn   [105, 120)
      //   sweeping_uranus   [120, 135)
      //   sweeping_neptune  [135, 150)
      //   composite_decay   [150, 180)
      //   passed            [180, ∞)
      expect(pbdSubstateAt(PBD_ANCHOR_ET - 1)).toBe(PbdSubstate.idle);
      expect(pbdSubstateAt(PBD_ANCHOR_ET + 0)).toBe(PbdSubstate.turning);
      expect(pbdSubstateAt(PBD_ANCHOR_ET + 30)).toBe(PbdSubstate.sweeping_venus);
      expect(pbdSubstateAt(PBD_ANCHOR_ET + 60)).toBe(PbdSubstate.composite_active);
      expect(pbdSubstateAt(PBD_ANCHOR_ET + 75)).toBe(PbdSubstate.composite_active);
      expect(pbdSubstateAt(PBD_ANCHOR_ET + 90)).toBe(PbdSubstate.sweeping_jupiter);
      expect(pbdSubstateAt(PBD_ANCHOR_ET + 105)).toBe(PbdSubstate.sweeping_saturn);
      expect(pbdSubstateAt(PBD_ANCHOR_ET + 130)).toBe(PbdSubstate.sweeping_uranus);
      expect(pbdSubstateAt(PBD_ANCHOR_ET + 140)).toBe(PbdSubstate.sweeping_neptune);
      expect(pbdSubstateAt(PBD_ANCHOR_ET + 165)).toBe(PbdSubstate.composite_decay);
      expect(pbdSubstateAt(PBD_ANCHOR_ET + 200)).toBe(PbdSubstate.passed);
    });
  });

  describe('AC9 — DEV-only __voyagerDebug.paleBlueDot accessor', () => {
    it('currentSubstate transitions in sync with the choreography', () => {
      pbd.update(PBD_ANCHOR_ET - 1);
      expect(pbd.currentSubstate).toBe(PbdSubstate.idle);

      pbd.update(PBD_ANCHOR_ET + 15);
      expect(pbd.currentSubstate).toBe(PbdSubstate.turning);

      pbd.update(PBD_ANCHOR_ET + 52.5);
      expect(pbd.currentSubstate).toBe(PbdSubstate.sweeping_earth);
    });

    it('currentTargetNaifId is null during turning, then 3 (Earth) at sweeping_earth', () => {
      pbd.update(PBD_ANCHOR_ET + 15);
      expect(pbd.currentTargetNaifId).toBe(null);

      pbd.update(PBD_ANCHOR_ET + 52.5);
      expect(pbd.currentTargetNaifId).toBe(3);
    });

    it('currentPlatformOverrideQuat is null during turning, non-null during sweeping', () => {
      pbd.update(PBD_ANCHOR_ET + 15);
      // Call the override to drive a tick.
      pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 15);
      expect(pbd.currentPlatformOverrideQuat).toBe(null);

      pbd.update(PBD_ANCHOR_ET + 52.5);
      pbd.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 52.5);
      expect(pbd.currentPlatformOverrideQuat).not.toBe(null);
    });
  });
});
