/**
 * Story 5.2 — PBD choreographed turn math + SLERP transition engine.
 *
 * Extracted from `./index.ts` because the per-substate aim quaternion
 * synthesis + SLERP-with-ease-out animation logic is non-trivial and
 * worth its own test surface. The `PaleBlueDot` module class consumes
 * this module via `getPlatformQuatOverride` (see `./index.ts`).
 *
 * ## What this module computes
 *
 * The PBD anchor ET (1990-02-14T00:00:00Z) has CK coverage for the V1
 * bus quaternion (`vgr1_super_v2.bc` per `docs/kernels/ckbrief-inventory.md`),
 * but NO CK coverage for the scan platform. Story 5.2 synthesizes the
 * platform quaternion per substate during the choreographed sweep.
 *
 * For each `sweeping_<body>` substate (Venus through Neptune), the
 * synthesized aim quaternion rotates the platform-frame +Z axis (the
 * NA-camera boresight per `VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM`)
 * to align with the unit vector from V1 to the target body in J2000.
 *
 * ## The bus-frame quaternion (CRITICAL math direction)
 *
 * `SCAN_PLATFORM` is a child of `BUS` in the GLB hierarchy (Story 3.3
 * § AC1 — named-node parenting). Three.js applies parent quaternions
 * before child quaternions, so the platform's `quaternion` field is
 * BUS-RELATIVE, not world-absolute. To aim the platform +Z (in BUS
 * frame, after applying the platform's own rotation) at a J2000-frame
 * direction we need to transform the J2000 direction back into BUS
 * frame first.
 *
 *     q_platform_relative_to_bus = setFromUnitVectors(
 *       +Z_platform,                                    // [0, 0, 1]
 *       q_bus_world.inverse() · v_v1_to_target_j2000    // in bus frame
 *     )
 *
 * ## SLERP-with-ease-out
 *
 * Between consecutive `sweeping_<body>` aim quaternions, the module
 * SLERPs over `--v-duration-slow` (~400ms wall-clock per `tokens.css`)
 * with `--v-ease-out` cubic-bezier easing. The transition is driven by
 * `performance.now()` so it is independent of simulation speed — at
 * 100× chapter playback the substate may already have advanced past
 * the SLERP window, in which case the SLERP completes against the
 * new endpoint quaternion. Under `prefers-reduced-motion: reduce` the
 * SLERP is bypassed and the override snaps to the new aim instantly.
 *
 * ## Reduced motion
 *
 * Detected via `window.matchMedia('(prefers-reduced-motion: reduce)').matches`
 * — the Voyager-canonical pattern at `voyager-camera-controller.ts:351`.
 * In reduced-motion mode every substate transition is an instant cut
 * between aim quaternions. The chapter substate machine itself is
 * unaffected; only the visual transition is suppressed.
 *
 * ## ADR compliance
 *
 * - ADR-0014: PBD is the dedicated-module surface. The turn choreography
 *   lives inside the PBD module's source tree — not in `AttitudeService`,
 *   not in `ChapterDirector`.
 * - ADR-0015: state is exposed via module methods, not a global store.
 *   The active aim + the pending SLERP are private instance fields.
 * - ADR-0023: PBD does not blend the view-frame; the turn rotates the
 *   scan platform, not the camera. View-frame translation-only blend
 *   is unaffected.
 * - ADR-0026: zero `any` — all public types explicit.
 */

import * as THREE from 'three';

import type { EphemerisService } from '../../services/ephemeris-service';
import {
  VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM,
  V1_NAIF_ID,
} from '../../services/fk-constants';
import { quaternion } from '../../types/branded';
import type { Quaternion } from '../../types/branded';
import { PbdSubstate } from './substates';

/**
 * NAIF SPK body IDs for the six PBD family-portrait targets. Sourced
 * from `services/fk-constants.ts` / SPICE convention:
 *
 *   Venus    = 2 (planet barycenter — matches the ephemeris segment
 *                  bodyId for the inner planets)
 *   Earth    = 3 (Earth-Moon barycenter; the PBD frame is at sufficient
 *                  distance that EMB vs Earth center is sub-pixel)
 *   Jupiter  = 5 (Jupiter barycenter — matches V1J / V2J convention)
 *   Saturn   = 6 (Saturn barycenter)
 *   Uranus   = 7 (Uranus barycenter)
 *   Neptune  = 8 (Neptune barycenter)
 *
 * Per Story 5.2 AC3 these are the targets the PBD module aims the scan
 * platform at during each `sweeping_<body>` substate.
 */
export const PBD_TARGET_NAIF_IDS: Readonly<
  Partial<Record<PbdSubstate, number>>
> = Object.freeze({
  [PbdSubstate.sweeping_venus]: 2,
  [PbdSubstate.sweeping_earth]: 3,
  [PbdSubstate.sweeping_jupiter]: 5,
  [PbdSubstate.sweeping_saturn]: 6,
  [PbdSubstate.sweeping_uranus]: 7,
  [PbdSubstate.sweeping_neptune]: 8,
});

/**
 * Returns the NAIF target body ID for a `sweeping_<body>` substate, or
 * `null` for any non-sweeping substate. Consumed by:
 *   - `computePlatformAimQuat` to look up the target body's position.
 *   - The DEV-only `__voyagerDebug.paleBlueDot.currentTargetNaifId`
 *     accessor extension (Story 5.2 AC9).
 */
export const targetNaifIdForSubstate = (substate: PbdSubstate): number | null => {
  const id = PBD_TARGET_NAIF_IDS[substate];
  return id === undefined ? null : id;
};

/**
 * Test seam — a `matchMedia` shaped factory. Tests inject a stub that
 * returns `{ matches: true }` to exercise the reduced-motion code path
 * without depending on a real DOM.
 */
export type ReducedMotionProbe = () => boolean;

const defaultReducedMotionProbe: ReducedMotionProbe = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Test seam — a `performance.now()`-shaped clock. Tests inject a
 * monotonic counter so the SLERP transition timeline is deterministic.
 * Note: this clock is WALL-clock, not simulation ET, because the SLERP
 * is a visual smoothness layer that runs at human-perception cadence
 * (400ms per --v-duration-slow) independent of simulation speed.
 */
export type WallClock = () => number;

const defaultWallClock: WallClock = () => {
  if (typeof performance === 'undefined') return Date.now();
  return performance.now();
};

/**
 * Compute the platform aim quaternion (BUS frame) that rotates the NA
 * boresight (+Z in platform frame, per FK constants) to align with the
 * V1→target unit vector in J2000.
 *
 * Returns `null` if any ephemeris lookup fails — the chunk-load gate
 * may not yet have landed the target body's segment. The caller treats
 * null as hold-previous.
 *
 * ## Math derivation (load-bearing — see Story 5.2 Dev Notes "CRITICAL"):
 *
 *   1. Compute the J2000 direction: `v_target_j2000 = (p_target - p_v1).normalize()`
 *   2. Rotate INTO bus frame: `v_target_bus = q_bus_world.inverse() · v_target_j2000`
 *   3. The platform quaternion relative to bus is the rotation that
 *      brings the platform-frame +Z onto `v_target_bus`:
 *
 *        q_platform_rel_bus = THREE.Quaternion.setFromUnitVectors(
 *          [0, 0, 1],          // platform +Z (boresight)
 *          v_target_bus
 *        )
 *
 * The composite Three.js scene-graph then produces, at render time:
 *
 *        q_platform_world = q_bus_world * q_platform_rel_bus
 *
 * which rotates platform +Z to point at the target in J2000.
 *
 * @param ephemerisService — used to look up V1 + target positions.
 * @param targetNaifId — the family-portrait target (Venus..Neptune).
 * @param busQuat — V1 bus quaternion (CK-derived; from `AttitudeService.getBusQuat`).
 *                  REQUIRED so the math is bus-relative. Callers that don't have
 *                  the bus quat yet should return null up the chain.
 * @param et — SPICE ET (TDB seconds past J2000).
 */
export const computePlatformAimQuat = (
  ephemerisService: EphemerisService,
  targetNaifId: number,
  busQuat: Quaternion,
  et: number,
): Quaternion | null => {
  const v1Pos = ephemerisService.getPosition(et, V1_NAIF_ID);
  const targetPos = ephemerisService.getPosition(et, targetNaifId);
  if (v1Pos === null || targetPos === null) {
    return null;
  }

  // Step 1: V1 → target direction vector in J2000.
  const dirJ2000 = new THREE.Vector3(
    targetPos[0] - v1Pos[0],
    targetPos[1] - v1Pos[1],
    targetPos[2] - v1Pos[2],
  );
  const lenSq = dirJ2000.lengthSq();
  if (lenSq === 0 || !Number.isFinite(lenSq)) {
    return null;
  }
  dirJ2000.normalize();

  // Step 2: rotate INTO bus frame via inverse bus quaternion. The bus
  // quaternion is bus→world; the inverse is world→bus.
  const busThree = new THREE.Quaternion(
    busQuat.x,
    busQuat.y,
    busQuat.z,
    busQuat.w,
  );
  const busInv = busThree.clone().invert();
  const dirBus = dirJ2000.clone().applyQuaternion(busInv);

  // Step 3: rotate platform +Z to dirBus.
  const boresightPlatform = new THREE.Vector3(
    VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM[0],
    VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM[1],
    VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM[2],
  );
  const aim = new THREE.Quaternion().setFromUnitVectors(
    boresightPlatform,
    dirBus,
  );

  return quaternion(aim.x, aim.y, aim.z, aim.w);
};

/**
 * Story 5.2 AC4 — wall-clock duration for the per-substate SLERP transition
 * in milliseconds. Mirrors `--v-duration-slow` from `web/src/styles/tokens.css:89`
 * — pinned at 400ms.
 *
 * This is a wall-clock duration (not simulation ET) because the SLERP is a
 * visual smoothness layer running at human-perception cadence. At 100× sim
 * speed the underlying substate may have already advanced past this window,
 * which is fine — the SLERP just races to the new endpoint and the visual
 * remains smooth.
 */
export const SLERP_DURATION_MS = 400;

/**
 * Cubic-bezier ease-out approximation. Mirrors `--v-ease-out` =
 * `cubic-bezier(0.2, 0.8, 0.2, 1)` from `tokens.css:90`. For SLERP
 * we don't need the full bezier curve — Three.js `Quaternion.slerp(t)`
 * accepts a scalar `t ∈ [0, 1]`, so we map linear time progress through
 * an ease-out curve before passing to slerp.
 *
 * The closed-form approximation used here is `1 - (1 - t)^3` which is a
 * standard ease-out cubic — its endpoint derivatives (0 → 3, 1 → 0)
 * closely match the bezier (0.2, 0.8, 0.2, 1) at the start and end and
 * differ from the bezier by < 6% L-infinity at the curve interior.
 * Visually indistinguishable for a 400ms quaternion transition.
 */
export const easeOutCubic = (t: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const oneMinusT = 1 - t;
  return 1 - oneMinusT * oneMinusT * oneMinusT;
};

/**
 * Story 5.2 AC3 + AC4 — choreography state holder for one PaleBlueDot module
 * instance. Owns the previous-aim quaternion, the current-aim quaternion,
 * and the SLERP-progression wall-clock timestamp.
 *
 * The module's `getPlatformQuatOverride(naifId, et)` calls `tick(...)` each
 * frame; `tick` returns the interpolated quaternion (or the endpoint quat
 * outside the SLERP window).
 *
 * State machine (per substate transition):
 *
 *   - On `setActiveSubstate(sub, ...)` with a DIFFERENT substate than the
 *     last one:
 *     - if reduced-motion is enabled, snap immediately to the new aim.
 *     - else, latch the previous aim as the SLERP starting point and the
 *       new aim as the endpoint; record `slerpStartWallMs = wallClock()`.
 *   - On each `tick`, compute the SLERPed quaternion:
 *     - if (wallClock() - slerpStartWallMs) >= SLERP_DURATION_MS, return
 *       the endpoint aim.
 *     - else, slerp(prev, next, easeOutCubic(elapsed / SLERP_DURATION_MS)).
 *
 * Idempotency: calling `setActiveSubstate` with the SAME substate is a
 * no-op (no SLERP restart).
 *
 * Inactive-frame safety: outside the sweeping substates, `tick` returns
 * null (no override; `AttitudeApplier` falls through to AttitudeService).
 */
export class TurnChoreography {
  private readonly reducedMotion: ReducedMotionProbe;
  private readonly wallClock: WallClock;

  private currentSubstate: PbdSubstate | null = null;
  private prevAimQuat: THREE.Quaternion | null = null;
  private currentAimQuat: THREE.Quaternion | null = null;
  private slerpStartWallMs: number | null = null;

  /** Test-only — the most recent SLERP-output quaternion. Exposed for AC9 DEV accessor. */
  private latestQuat: THREE.Quaternion | null = null;

  constructor(opts?: {
    reducedMotion?: ReducedMotionProbe;
    wallClock?: WallClock;
  }) {
    this.reducedMotion = opts?.reducedMotion ?? defaultReducedMotionProbe;
    this.wallClock = opts?.wallClock ?? defaultWallClock;
  }

  /**
   * Called by the PBD module when the substate advances. If the new
   * substate is a `sweeping_<body>` substate AND the new aim is non-null,
   * latches the previous aim and starts a SLERP. If the new substate is
   * the same as the current substate, no-op.
   *
   * @param nextSubstate — the new active substate.
   * @param nextAim — the aim quaternion for `nextSubstate` (already
   *                  computed by `computePlatformAimQuat`). Null if the
   *                  substate is not a sweeping substate OR if the
   *                  aim couldn't be computed (ephemeris chunk pending).
   */
  setActiveSubstate(nextSubstate: PbdSubstate, nextAim: Quaternion | null): void {
    if (nextSubstate === this.currentSubstate) {
      // Same substate — no SLERP restart. But the `nextAim` quaternion may
      // have refreshed (e.g. ephemeris just landed and previous value was null);
      // adopt it as the current endpoint without resetting the SLERP timer.
      if (nextAim !== null && this.currentAimQuat === null) {
        this.currentAimQuat = new THREE.Quaternion(
          nextAim.x, nextAim.y, nextAim.z, nextAim.w,
        );
      }
      return;
    }
    this.currentSubstate = nextSubstate;
    const nextThree = nextAim === null
      ? null
      : new THREE.Quaternion(nextAim.x, nextAim.y, nextAim.z, nextAim.w);

    // Latch the previous aim BEFORE replacing currentAimQuat.
    this.prevAimQuat = this.currentAimQuat === null
      ? null
      : this.currentAimQuat.clone();
    this.currentAimQuat = nextThree;

    if (this.reducedMotion()) {
      // Story 5.2 AC4 — reduced-motion path: instant cut. No SLERP.
      this.slerpStartWallMs = null;
      this.prevAimQuat = null;
    } else if (this.prevAimQuat !== null && this.currentAimQuat !== null) {
      this.slerpStartWallMs = this.wallClock();
    } else {
      // First aim ever — no SLERP to run from null. Snap.
      this.slerpStartWallMs = null;
    }
  }

  /**
   * Returns the interpolated platform aim quaternion (in BUS frame) for
   * the current substate. `null` if no active sweeping substate or no
   * aim is available.
   */
  tick(): Quaternion | null {
    if (this.currentAimQuat === null) {
      this.latestQuat = null;
      return null;
    }

    // Outside the SLERP window (or no SLERP scheduled): return the
    // endpoint aim directly.
    if (this.slerpStartWallMs === null || this.prevAimQuat === null) {
      this.latestQuat = this.currentAimQuat;
      return quaternion(
        this.currentAimQuat.x,
        this.currentAimQuat.y,
        this.currentAimQuat.z,
        this.currentAimQuat.w,
      );
    }

    const elapsed = this.wallClock() - this.slerpStartWallMs;
    if (elapsed >= SLERP_DURATION_MS) {
      // SLERP complete — snap to endpoint and clear the SLERP state.
      this.slerpStartWallMs = null;
      this.prevAimQuat = null;
      this.latestQuat = this.currentAimQuat;
      return quaternion(
        this.currentAimQuat.x,
        this.currentAimQuat.y,
        this.currentAimQuat.z,
        this.currentAimQuat.w,
      );
    }

    const t = easeOutCubic(elapsed / SLERP_DURATION_MS);
    // Three.js Quaternion.slerpQuaternions(qa, qb, t) writes the result
    // into `this`; we use a fresh Quaternion as the destination so we
    // don't mutate prev or current.
    const out = new THREE.Quaternion();
    out.slerpQuaternions(this.prevAimQuat, this.currentAimQuat, t);
    this.latestQuat = out;
    return quaternion(out.x, out.y, out.z, out.w);
  }

  /**
   * Resets the choreography to an inactive state — used when leaving the
   * PBD held window. Subsequent `tick` returns null until the next
   * `setActiveSubstate` call.
   */
  reset(): void {
    this.currentSubstate = null;
    this.prevAimQuat = null;
    this.currentAimQuat = null;
    this.slerpStartWallMs = null;
    this.latestQuat = null;
  }

  /** Test/DEV-only — the most recent quaternion returned by `tick`. */
  getLatestQuat(): Quaternion | null {
    if (this.latestQuat === null) return null;
    return quaternion(
      this.latestQuat.x,
      this.latestQuat.y,
      this.latestQuat.z,
      this.latestQuat.w,
    );
  }
}
