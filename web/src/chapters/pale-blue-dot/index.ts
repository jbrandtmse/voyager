/**
 * Pale Blue Dot chapter module (Story 5.1 — Epic 5 hero scene).
 *
 * Per ADR-0014 (Hybrid Chapter Definition — Spec for 10, Module for
 * PBD), PBD is the one chapter that warrants imperative latitude: a
 * choreographed turn-back motion (Story 5.2), six photo-plate
 * composites at scripted instants (Story 5.3), and an internal
 * substate machine that runs INSIDE the outer ChapterDirector's
 * `held` state. The 10 ordinary chapters stay declarative; PBD lives
 * here.
 *
 * This module exposes two views:
 *
 *   1. **The spec view** — a `ChapterSpec`-compatible default export
 *      that the `ALL_CHAPTERS` registry consumes uniformly with the
 *      other 10 chapters. Slug, anchor ET, window, copy, etc. The
 *      existing scrubber-marker, URL-routing, OG-card-generator, and
 *      `<v-chapter-copy>` stacks read this without modification.
 *
 *   2. **The module view** — the `PaleBlueDot` class implementing
 *      `ChapterModule`. It owns the internal substate machine
 *      (`PbdSubstate`), exposes the per-frame `update(currentEt)` hook
 *      that Story 5.2's turn choreography and Story 5.3's composite
 *      layer will consume, and provides a `subscribe` API for reactive
 *      listeners.
 *
 * Path A integration (Story 5.1 AC3): `ChapterDirector` itself is
 * unchanged. `web/src/main.ts` constructs the `PaleBlueDot` instance,
 * subscribes to the director, and routes `held` enter → activate the
 * module's per-frame `update(et)`; `exiting` → deactivate. Outside the
 * PBD window the module is inactive and the simulation behaves
 * identically to pre-Story-5.1 baseline.
 *
 * Per ADR-0015 (service-graph + Lit reactive controllers; no global
 * store): the module exposes its substate via a direct subscribe
 * pattern; consumers (Story 5.2 turn choreography, Story 5.3 composite
 * layer, future Lit reactive controllers) consume it through DI, NOT
 * via a global store.
 */

import type { ChapterModule, ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';
import type { AttitudeService } from '../../services/attitude-service';
import type { EphemerisService } from '../../services/ephemeris-service';
import type { Quaternion } from '../../types/branded';
import { PBD_COPY } from './copy';
import {
  PbdSubstate,
  pbdSubstateAt,
} from './substates';
import {
  TurnChoreography,
  computePlatformAimQuat,
  targetNaifIdForSubstate,
  type ReducedMotionProbe,
  type WallClock,
} from './turn-choreography';

const V1_NAIF_ID = -31;

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1990-02-14T00:00:00Z');

/**
 * Story 5.1 AC1 — the PBD chapter spec view. Populated with the
 * Story-2.1 placeholder fields (slug, name, marker, anchor, window,
 * spacecraft, ogDescription) PLUS the Story-5.1 editorial copy from
 * `copy.ts`. `defaultFraming` is intentionally left undefined: PBD's
 * framing is choreographed per-substate by Story 5.2 (declarative
 * defaultFraming would conflict with the choreographed turn). See
 * Story file Dev Notes § "Critical context".
 *
 * `targetBody` is also undefined — PBD's ViewFrame stays heliocentric
 * (identity origin shift); the choreographed turn is scan-platform
 * attitude, not a body-centered camera framing.
 *
 * Slug + anchor ET are preserved exactly from the Story 2.1 placeholder
 * (`web/src/chapters/specs/pale-blue-dot.ts:25-37`) so the existing
 * URLRouter, scrubber-marker, OG-card-generator, and Story 5.0
 * production-build smoke continue to resolve PBD without code change.
 */
export const PBD_SPEC: ChapterSpec = Object.freeze({
  slug: 'pale-blue-dot',
  name: 'Pale Blue Dot',
  markerLabel: 'PBD',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + SECONDS_PER_DAY,
  spacecraft: 'v1',
  ogDescription:
    'Voyager 1 turns to capture Earth from beyond Neptune on 14 February 1990 — the Pale Blue Dot.',
  copy: PBD_COPY,
});

/**
 * Story 5.1 AC3 — substate change listener signature. Fires on
 * transitions between substates (not per-frame). Consumers (Story 5.2
 * turn-choreography subscriber, Story 5.3 composite-layer subscriber,
 * the Story 5.1 DEV `__voyagerDebug.paleBlueDot` accessor) register via
 * `PaleBlueDot.subscribe`.
 */
export type PbdSubstateListener = (
  from: PbdSubstate,
  to: PbdSubstate,
  et: number,
) => void;

/**
 * Story 5.1 AC3 — PaleBlueDot module class.
 *
 * Implements `ChapterModule`: exposes the spec view via the `spec`
 * getter, and the imperative `update(currentEt)` hook for the
 * subscriber-driven Path A integration in `main.ts`.
 *
 * State management: the instance tracks the most-recent substate
 * computed by `pbdSubstateAt`. `update(currentEt)` calls the pure
 * function and fires the substate-change listeners on transitions.
 *
 * Idempotent: two calls to `update` with the same ET produce exactly
 * one substate computation and zero listener invocations on the
 * second call (mirrors `ChapterDirector.update`'s idempotency contract).
 *
 * Inactive-frame safety: the module's `update` may be called with ETs
 * outside the PBD window (during cold-load or rapid scrub before the
 * Path A subscriber's `held` activation fires). The substate function
 * tolerates this — at ETs well before `windowStartEt` it returns
 * `idle` (the pre-anchor default); at ETs well after `windowEndEt` it
 * returns `passed`. Either way the module is harmless.
 *
 * Per ADR-0015 the substate is queryable via a direct method
 * (`currentSubstate`) and a subscribe API. No global store.
 *
 * Per ADR-0026 (zero `any`): all public types are explicit.
 */
export class PaleBlueDot implements ChapterModule {
  readonly spec: ChapterSpec = PBD_SPEC;

  private _currentSubstate: PbdSubstate = PbdSubstate.idle;
  private lastEt: number | null = null;
  private readonly listeners: Set<PbdSubstateListener> = new Set();

  // Story 5.2 — choreographed turn state + service refs. Services are
  // injected post-construction (manifest-landing latency means they
  // don't exist at boot). All choreography state lives on the module
  // instance per ADR-0015 — no global store.
  private ephemerisService: EphemerisService | null = null;
  private attitudeService: AttitudeService | null = null;
  private readonly choreography: TurnChoreography;
  private _currentTargetNaifId: number | null = null;

  constructor(opts?: {
    reducedMotion?: ReducedMotionProbe;
    wallClock?: WallClock;
  }) {
    this.choreography = new TurnChoreography(opts);
  }

  /**
   * Story 5.2 — DI wiring for the choreographed turn. Called from
   * `main.ts` once `AttitudeService` + `EphemerisService` are
   * constructed (post-ManifestLoader). The platform-quat override is
   * a no-op until both refs are wired.
   *
   * Per ADR-0015 these are passed as method parameters (not constructor
   * args) because the module is constructed at boot but the services
   * land later. The Path A subscriber pattern in `main.ts` wires this.
   */
  setServices(
    ephemerisService: EphemerisService,
    attitudeService: AttitudeService,
  ): void {
    this.ephemerisService = ephemerisService;
    this.attitudeService = attitudeService;
  }

  /**
   * Story 5.2 AC9 — the active target body's NAIF ID during a
   * `sweeping_<body>` substate, or `null` otherwise. Read by the
   * DEV-only `__voyagerDebug.paleBlueDot.currentTargetNaifId` accessor
   * for the lead's PBD smoke probes.
   */
  get currentTargetNaifId(): number | null {
    return this._currentTargetNaifId;
  }

  /**
   * Story 5.2 AC9 — the most recent platform aim quaternion (BUS frame).
   * Mirrors `currentSubstate`; returns `null` outside sweeping substates
   * or while the SLERP has not yet produced an output.
   *
   * Read by the DEV-only
   * `__voyagerDebug.paleBlueDot.currentPlatformOverrideQuat` accessor.
   */
  get currentPlatformOverrideQuat(): Quaternion | null {
    return this.choreography.getLatestQuat();
  }

  /**
   * Story 5.1 AC3 + AC7 — the active substate at the most recent
   * `update(et)` call. Defaults to `idle` before the first update.
   * Read by the DEV-only `__voyagerDebug.paleBlueDot.currentSubstate`
   * accessor in `main.ts`.
   */
  get currentSubstate(): PbdSubstate {
    return this._currentSubstate;
  }

  /**
   * Story 5.1 AC3 — per-frame advance. Called by the Path A subscriber
   * in `main.ts` while the outer ChapterDirector has PBD in `held`.
   *
   * Idempotent: repeated calls with the same ET fire no listeners.
   * Inactive-frame safe: tolerates ETs outside the PBD window.
   */
  update(currentEt: number): void {
    if (!Number.isFinite(currentEt)) return;
    if (this.lastEt === currentEt) return;
    this.lastEt = currentEt;

    const next = pbdSubstateAt(currentEt);
    if (next === this._currentSubstate) return;
    const from = this._currentSubstate;
    this._currentSubstate = next;

    // Story 5.2 — substate-transition side effect: feed the new substate
    // (+ aim quaternion if it's a sweeping substate) into the
    // choreography engine. The engine handles SLERP latching internally.
    // The aim quaternion may be null when the ephemeris chunk for the
    // target body hasn't loaded yet; the engine accepts this and reuses
    // the previous aim until a non-null value arrives via a later tick.
    const targetId = targetNaifIdForSubstate(next);
    this._currentTargetNaifId = targetId;
    if (targetId !== null) {
      const aim = this.computeAimForSubstate(targetId, currentEt);
      this.choreography.setActiveSubstate(next, aim);
    } else {
      // Non-sweeping substate — reset the choreography so the override
      // returns null and AttitudeApplier falls through to AttitudeService.
      this.choreography.setActiveSubstate(next, null);
    }

    this.notify(from, next, currentEt);
  }

  /**
   * Story 5.2 AC3 — platform-quat override consumed by `AttitudeApplier`
   * via the override-first check (Path A topology). Returns the
   * synthesized aim quaternion (BUS frame) during sweeping substates;
   * returns `null` for non-sweeping substates so the applier falls through
   * to `AttitudeService.getPlatformQuat`.
   *
   * Per AC3 last clause the override applies ONLY during the six
   * `sweeping_<body>` substates (Venus..Neptune). The `turning` substate
   * is bus-only motion (the CK bus quat is already the visible turn) —
   * no per-target aim yet, so the override returns null and the platform
   * synthesized fallback (identity composed with bus) applies.
   *
   * The method is called per-frame; it consults the choreography state
   * holder for the SLERP-interpolated aim. If the ephemeris chunk for
   * the current target is still loading the choreography may have a
   * stale aim — that's acceptable per AC4 (hold-previous on null).
   *
   * @param naifId — NAIF SPK ID of the spacecraft. PBD only acts on V1
   *                 (-31); for any other ID the override returns null
   *                 immediately so V2 attitude is unaffected.
   * @param et — SPICE ET (TDB seconds past J2000). Used to refresh the
   *             aim quaternion if the underlying ephemeris just landed.
   */
  getPlatformQuatOverride(naifId: number, et: number): Quaternion | null {
    if (naifId !== V1_NAIF_ID) return null;
    // The choreography engine returns null outside sweeping substates.
    // Before returning, if we have a sweeping substate but stale/null
    // aim, try to refresh it (the chunk-loader may have landed the
    // target body's ephemeris since the last substate transition).
    if (this._currentTargetNaifId !== null && this.choreography.getLatestQuat() === null) {
      const aim = this.computeAimForSubstate(this._currentTargetNaifId, et);
      if (aim !== null) {
        this.choreography.setActiveSubstate(this._currentSubstate, aim);
      }
    }
    return this.choreography.tick();
  }

  /**
   * Pure helper — compute the platform aim quaternion for `targetNaifId`
   * at `et`. Returns null if any prerequisite is missing (services not
   * yet wired, ephemeris chunk not yet loaded, bus quat unavailable).
   */
  private computeAimForSubstate(
    targetNaifId: number,
    et: number,
  ): Quaternion | null {
    if (this.ephemerisService === null || this.attitudeService === null) {
      return null;
    }
    const busQuat = this.attitudeService.getBusQuat(V1_NAIF_ID, et);
    if (busQuat === null) return null;
    return computePlatformAimQuat(
      this.ephemerisService,
      targetNaifId,
      busQuat,
      et,
    );
  }

  /**
   * Story 5.1 AC3 — subscribe to substate-change events. Returns an
   * unsubscribe function. Listeners fire only on substate transitions,
   * never per frame.
   *
   * Subscriber callbacks that throw do NOT prevent later subscribers
   * from receiving the same event (mirrors the
   * `ChapterDirector` notify-hardening pattern from Story 2.0 / 2.1).
   */
  subscribe(listener: PbdSubstateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Detach all listeners and reset choreography state. */
  dispose(): void {
    this.listeners.clear();
    this.choreography.reset();
    this._currentTargetNaifId = null;
  }

  private notify(from: PbdSubstate, to: PbdSubstate, et: number): void {
    if (this.listeners.size === 0) return;
    for (const listener of this.listeners) {
      try {
        listener(from, to, et);
      } catch (err) {
        // Defensive: a throwing listener must not silence others.
        // Mirrors `ChapterDirector`'s notify-hardening pattern.
        console.error('[PaleBlueDot] subscriber threw:', err);
      }
    }
  }
}

/**
 * Default export — the `ChapterSpec`-compatible view consumed by
 * `ALL_CHAPTERS` (`web/src/chapters/registry.ts:39`) through the
 * placeholder re-export at `web/src/chapters/specs/pale-blue-dot.ts`
 * (Story 5.1 AC1). The module class is the named export
 * (`PaleBlueDot`).
 */
export default PBD_SPEC;
