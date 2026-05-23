// @vitest-environment happy-dom
/**
 * Story 5.2 — turn-choreography unit tests.
 *
 * Covers:
 *   - AC3 / T2.2 — `computePlatformAimQuat` math: V1→target aim
 *     produces a quaternion that brings platform +Z onto the V1→target
 *     direction transformed into bus frame.
 *   - AC3 / T2.3 — `TurnChoreography.setActiveSubstate` + `tick` SLERP
 *     behaviour: mid-transition output bracketed between endpoints;
 *     reaches the endpoint after the SLERP window elapses.
 *   - AC4 / T2.4 — reduced-motion path: instant cut, no SLERP.
 *   - `PBD_TARGET_NAIF_IDS` is the canonical Venus..Neptune table.
 *   - `easeOutCubic` is monotonic on [0, 1] with endpoint pins.
 *
 * Performance / wall-clock contract: tests inject a deterministic
 * `WallClock` so the SLERP timeline does not depend on real time.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';

import {
  TurnChoreography,
  computePlatformAimQuat,
  easeOutCubic,
  PBD_TARGET_NAIF_IDS,
  SLERP_DURATION_MS,
  targetNaifIdForSubstate,
} from './turn-choreography';
import { PbdSubstate } from './substates';
import { quaternion } from '../../types/branded';
import type { EphemerisService } from '../../services/ephemeris-service';
import type { WorldVec3 } from '../../types/branded';

// === Fixture helpers =========================================================

const worldVec = (x: number, y: number, z: number): WorldVec3 => {
  const a = new Float64Array(3);
  a[0] = x; a[1] = y; a[2] = z;
  return a as WorldVec3;
};

/**
 * Build an EphemerisService stub. The PBD math reads V1 (-31) + target
 * body positions; we return canned values per `getPosition(et, bodyId)`.
 */
const buildEphemerisStub = (positions: Record<number, WorldVec3 | null>): EphemerisService => {
  return {
    getPosition: (_et: number, bodyId: number): WorldVec3 | null =>
      positions[bodyId] ?? null,
  } as unknown as EphemerisService;
};

const identityBusQuat = quaternion(0, 0, 0, 1);

// === Tests ===================================================================

describe('Story 5.2 AC3 — PBD_TARGET_NAIF_IDS table', () => {
  it('maps each sweeping_<body> substate to the canonical NAIF ID', () => {
    expect(PBD_TARGET_NAIF_IDS[PbdSubstate.sweeping_venus]).toBe(2);
    expect(PBD_TARGET_NAIF_IDS[PbdSubstate.sweeping_earth]).toBe(3);
    expect(PBD_TARGET_NAIF_IDS[PbdSubstate.sweeping_jupiter]).toBe(5);
    expect(PBD_TARGET_NAIF_IDS[PbdSubstate.sweeping_saturn]).toBe(6);
    expect(PBD_TARGET_NAIF_IDS[PbdSubstate.sweeping_uranus]).toBe(7);
    expect(PBD_TARGET_NAIF_IDS[PbdSubstate.sweeping_neptune]).toBe(8);
  });

  it('returns null for non-sweeping substates', () => {
    expect(targetNaifIdForSubstate(PbdSubstate.idle)).toBe(null);
    expect(targetNaifIdForSubstate(PbdSubstate.turning)).toBe(null);
    expect(targetNaifIdForSubstate(PbdSubstate.composite_active)).toBe(null);
    expect(targetNaifIdForSubstate(PbdSubstate.composite_decay)).toBe(null);
    expect(targetNaifIdForSubstate(PbdSubstate.passed)).toBe(null);
  });

  it('returns the correct NAIF ID for sweeping substates', () => {
    expect(targetNaifIdForSubstate(PbdSubstate.sweeping_venus)).toBe(2);
    expect(targetNaifIdForSubstate(PbdSubstate.sweeping_neptune)).toBe(8);
  });
});

describe('Story 5.2 AC3 — computePlatformAimQuat', () => {
  const PBD_ANCHOR_ET = 0; // ET value doesn't matter for the stub — positions are canned

  it('returns null when V1 ephemeris is unavailable', () => {
    const ephemeris = buildEphemerisStub({ [-31]: null, 3: worldVec(1.5e8, 0, 0) });
    const aim = computePlatformAimQuat(ephemeris, 3, identityBusQuat, PBD_ANCHOR_ET);
    expect(aim).toBe(null);
  });

  it('returns null when target ephemeris is unavailable', () => {
    const ephemeris = buildEphemerisStub({ [-31]: worldVec(1e9, 0, 0), 3: null });
    const aim = computePlatformAimQuat(ephemeris, 3, identityBusQuat, PBD_ANCHOR_ET);
    expect(aim).toBe(null);
  });

  it('returns null when V1 and target are at the same position (zero direction vector)', () => {
    const v1 = worldVec(1e9, 0, 0);
    const ephemeris = buildEphemerisStub({ [-31]: v1, 3: v1 });
    const aim = computePlatformAimQuat(ephemeris, 3, identityBusQuat, PBD_ANCHOR_ET);
    expect(aim).toBe(null);
  });

  it('with identity bus quat: the aim quaternion rotates platform +Z to the V1→target direction in J2000', () => {
    // V1 at far position, Earth at origin. The V1→Earth direction in
    // J2000 is along -X (Earth is "behind" V1 along the +X axis).
    const v1 = worldVec(1e9, 0, 0);
    const earth = worldVec(0, 0, 0);
    const ephemeris = buildEphemerisStub({ [-31]: v1, 3: earth });
    const aim = computePlatformAimQuat(ephemeris, 3, identityBusQuat, PBD_ANCHOR_ET);
    expect(aim).not.toBe(null);

    // Apply the aim quaternion to platform +Z = [0, 0, 1]; the result
    // should be the V1→Earth unit vector = [-1, 0, 0] (bus frame ===
    // J2000 because bus quat is identity).
    const aimThree = new THREE.Quaternion(aim!.x, aim!.y, aim!.z, aim!.w);
    const rotated = new THREE.Vector3(0, 0, 1).applyQuaternion(aimThree);
    expect(rotated.x).toBeCloseTo(-1, 6);
    expect(rotated.y).toBeCloseTo(0, 6);
    expect(rotated.z).toBeCloseTo(0, 6);
  });

  it('with non-identity bus quat: the aim is bus-relative (the platform local quaternion rotates into bus frame)', () => {
    // Bus quat = 90deg rotation around Y — so the bus +X in world is world -Z.
    // V1 at origin, target at +X in world. V1→target in world = +X.
    // In bus frame, +X_world maps via busInverse: rotate [+1,0,0] by inverse of
    // "90deg around Y" (which is "90deg negative around Y") = ...
    // Easier: just verify the final composition.
    const v1 = worldVec(0, 0, 0);
    const target = worldVec(1e9, 0, 0);
    const ephemeris = buildEphemerisStub({ [-31]: v1, 3: target });

    // Bus quat: 90° around Y axis (rotates +X_bus to -Z_world).
    const busThree = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const busBrand = quaternion(busThree.x, busThree.y, busThree.z, busThree.w);

    const aim = computePlatformAimQuat(ephemeris, 3, busBrand, PBD_ANCHOR_ET);
    expect(aim).not.toBe(null);

    // Verify the composite world rotation: bus * platform applied to platform +Z
    // should land on V1→target in world (= +X_world).
    const aimThree = new THREE.Quaternion(aim!.x, aim!.y, aim!.z, aim!.w);
    // Three.js applies child * parent in scene-graph world transforms;
    // but the platform's `quaternion` is the LOCAL bus-relative rotation,
    // and the WORLD rotation = q_bus_world * q_platform_local (multiplicative
    // composition). Three.js: world_q = parent_world_q.multiply(local_q).
    const worldQ = busThree.clone().multiply(aimThree);
    const rotated = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQ);
    expect(rotated.x).toBeCloseTo(1, 6);
    expect(rotated.y).toBeCloseTo(0, 6);
    expect(rotated.z).toBeCloseTo(0, 6);
  });

  it('produces a unit quaternion (norm === 1) under all valid input configurations', () => {
    const v1 = worldVec(1e9, 5e8, -3e8);
    const target = worldVec(1.4e8, 0, 0);
    const ephemeris = buildEphemerisStub({ [-31]: v1, 3: target });
    const aim = computePlatformAimQuat(ephemeris, 3, identityBusQuat, 0);
    expect(aim).not.toBe(null);
    const norm = Math.sqrt(aim!.x * aim!.x + aim!.y * aim!.y + aim!.z * aim!.z + aim!.w * aim!.w);
    expect(norm).toBeCloseTo(1, 12);
  });
});

describe('Story 5.2 AC4 — easeOutCubic', () => {
  it('endpoint pins: 0 → 0, 1 → 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('clamps out-of-range inputs', () => {
    expect(easeOutCubic(-0.5)).toBe(0);
    expect(easeOutCubic(1.5)).toBe(1);
  });

  it('is monotonic on [0, 1]', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('starts faster than it ends (ease-out shape: output(0.5) > 0.5)', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe('Story 5.2 AC3 + AC4 — TurnChoreography SLERP behaviour', () => {
  let wallClockMs: number;
  let choreo: TurnChoreography;

  beforeEach(() => {
    wallClockMs = 1000;
    choreo = new TurnChoreography({
      reducedMotion: () => false,
      wallClock: () => wallClockMs,
    });
  });

  const qX = quaternion(0, 0, 0, 1); // identity
  const qY = quaternion(0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)); // 90° around Y

  it('starts with no current aim; tick returns null', () => {
    expect(choreo.tick()).toBe(null);
  });

  it('setActiveSubstate(sweeping_venus, qX) — first aim snaps (no SLERP from null)', () => {
    choreo.setActiveSubstate(PbdSubstate.sweeping_venus, qX);
    const out = choreo.tick();
    expect(out).not.toBe(null);
    expect(out!.x).toBeCloseTo(qX.x);
    expect(out!.y).toBeCloseTo(qX.y);
    expect(out!.z).toBeCloseTo(qX.z);
    expect(out!.w).toBeCloseTo(qX.w);
  });

  it('setActiveSubstate transitions slerp between previous and next over SLERP_DURATION_MS', () => {
    choreo.setActiveSubstate(PbdSubstate.sweeping_venus, qX);
    choreo.tick(); // latch qX as endpoint
    // Advance substate to Earth with qY — SLERP latches from qX to qY.
    wallClockMs += 0; // SLERP starts at t=1000ms
    choreo.setActiveSubstate(PbdSubstate.sweeping_earth, qY);

    // Mid-transition: at half the SLERP window, output should be
    // between qX and qY (NOT equal to either endpoint).
    wallClockMs += SLERP_DURATION_MS / 2;
    const mid = choreo.tick();
    expect(mid).not.toBe(null);

    // Compute angular distance from qX and qY — both should be positive
    // (i.e. mid is genuinely interpolated, not at either endpoint).
    const dotQX = mid!.x * qX.x + mid!.y * qX.y + mid!.z * qX.z + mid!.w * qX.w;
    const dotQY = mid!.x * qY.x + mid!.y * qY.y + mid!.z * qY.z + mid!.w * qY.w;
    expect(Math.abs(dotQX)).toBeLessThan(0.9999); // not at qX
    expect(Math.abs(dotQY)).toBeLessThan(0.9999); // not at qY
    expect(dotQY).toBeGreaterThan(dotQX); // closer to qY than qX (ease-out pushes past midpoint)
  });

  it('after SLERP window elapses, tick returns the endpoint exactly', () => {
    choreo.setActiveSubstate(PbdSubstate.sweeping_venus, qX);
    choreo.tick();
    choreo.setActiveSubstate(PbdSubstate.sweeping_earth, qY);

    wallClockMs += SLERP_DURATION_MS + 10;
    const out = choreo.tick();
    expect(out!.x).toBeCloseTo(qY.x, 12);
    expect(out!.y).toBeCloseTo(qY.y, 12);
    expect(out!.z).toBeCloseTo(qY.z, 12);
    expect(out!.w).toBeCloseTo(qY.w, 12);
  });

  it('same-substate setActiveSubstate is a no-op (does not restart SLERP)', () => {
    choreo.setActiveSubstate(PbdSubstate.sweeping_venus, qX);
    choreo.tick();
    choreo.setActiveSubstate(PbdSubstate.sweeping_earth, qY);

    wallClockMs += SLERP_DURATION_MS / 4;
    const out1 = choreo.tick();

    // Same-substate call should NOT reset the slerp timer.
    choreo.setActiveSubstate(PbdSubstate.sweeping_earth, qY);
    const out2 = choreo.tick();

    // Both outputs are at the same SLERP progress; only floating-point
    // jitter could differ between calls.
    expect(out1!.x).toBeCloseTo(out2!.x, 12);
    expect(out1!.y).toBeCloseTo(out2!.y, 12);
  });

  it('transitioning to a non-sweeping substate (null aim) returns null tick output', () => {
    choreo.setActiveSubstate(PbdSubstate.sweeping_venus, qX);
    choreo.tick();
    choreo.setActiveSubstate(PbdSubstate.composite_active, null);
    expect(choreo.tick()).toBe(null);
  });

  it('reset() clears state: subsequent tick returns null', () => {
    choreo.setActiveSubstate(PbdSubstate.sweeping_venus, qX);
    choreo.tick();
    choreo.reset();
    expect(choreo.tick()).toBe(null);
  });
});

describe('Story 5.2 AC4 — TurnChoreography reduced-motion path', () => {
  it('reduced-motion=true: substate transitions snap instantly (no SLERP)', () => {
    let wallClockMs = 1000;
    const choreo = new TurnChoreography({
      reducedMotion: () => true,
      wallClock: () => wallClockMs,
    });

    const qX = quaternion(0, 0, 0, 1);
    const qY = quaternion(0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4));

    choreo.setActiveSubstate(PbdSubstate.sweeping_venus, qX);
    choreo.tick();
    choreo.setActiveSubstate(PbdSubstate.sweeping_earth, qY);

    // Even at t=0ms after transition, the output is the endpoint qY exactly.
    const out = choreo.tick();
    expect(out!.x).toBeCloseTo(qY.x, 12);
    expect(out!.y).toBeCloseTo(qY.y, 12);
    expect(out!.z).toBeCloseTo(qY.z, 12);
    expect(out!.w).toBeCloseTo(qY.w, 12);

    // Advance wall-clock; still at qY (no SLERP happened).
    wallClockMs += SLERP_DURATION_MS / 2;
    const out2 = choreo.tick();
    expect(out2!.x).toBeCloseTo(qY.x, 12);
    expect(out2!.w).toBeCloseTo(qY.w, 12);
  });

  it('reducedMotion probe uses window.matchMedia by default', () => {
    // happy-dom provides matchMedia stub returning matches=false.
    const choreo = new TurnChoreography();
    const qX = quaternion(0, 0, 0, 1);
    const qY = quaternion(0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4));

    // Without injected wall-clock the timeline is real; we just verify
    // that the first transition lands a quaternion.
    choreo.setActiveSubstate(PbdSubstate.sweeping_venus, qX);
    choreo.tick();
    choreo.setActiveSubstate(PbdSubstate.sweeping_earth, qY);
    const out = choreo.tick();
    expect(out).not.toBe(null);
  });
});

describe('Story 5.2 AC9 — TurnChoreography.getLatestQuat for DEV accessor', () => {
  it('getLatestQuat returns null before any tick', () => {
    const choreo = new TurnChoreography({ reducedMotion: () => false });
    expect(choreo.getLatestQuat()).toBe(null);
  });

  it('getLatestQuat returns the most recent tick output', () => {
    let wallClockMs = 1000;
    const choreo = new TurnChoreography({
      reducedMotion: () => false,
      wallClock: () => wallClockMs,
    });
    const qX = quaternion(0, 0, 0, 1);
    choreo.setActiveSubstate(PbdSubstate.sweeping_venus, qX);
    const tickOut = choreo.tick();
    const latest = choreo.getLatestQuat();
    expect(latest).not.toBe(null);
    expect(latest!.x).toBeCloseTo(tickOut!.x, 12);
    expect(latest!.w).toBeCloseTo(tickOut!.w, 12);
  });

  it('getLatestQuat returns null after reset()', () => {
    const choreo = new TurnChoreography({ reducedMotion: () => false });
    const qX = quaternion(0, 0, 0, 1);
    choreo.setActiveSubstate(PbdSubstate.sweeping_venus, qX);
    choreo.tick();
    expect(choreo.getLatestQuat()).not.toBe(null);
    choreo.reset();
    expect(choreo.getLatestQuat()).toBe(null);
  });
});
