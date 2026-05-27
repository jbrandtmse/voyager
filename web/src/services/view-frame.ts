/**
 * ViewFrameService — per-frame J2000 → render-space origin offset
 * (Story 4.1 AC1–AC4).
 *
 * Owns the camera-anchoring math that pulls the world origin from the
 * Sun (heliocentric) toward an encounter body (Jupiter / Saturn / Uranus
 * / Neptune barycenter) over a ±2-day window around each chapter's
 * `[windowStartEt, windowEndEt]` band. The blend is **translation-only**
 * per ADR-0023 — no quaternion rotation blend is applied; camera
 * orientation continues to be owned by `VoyagerCameraController`
 * (Story 4.2). See `docs/adr/0023-translation-only-view-frame-blend-
 * no-rotation-blend-v1.md` for the deferred rotation-blend decision.
 *
 * ## Per-frame contract
 *
 * `getTransform(et, activeChapter)` returns `{ originOffsetWorld }` —
 * a Float64 WorldVec3 in km, J2000 ecliptic axes. Consumers (RenderEngine
 * in this story; future VoyagerCameraController in Story 4.2) apply it
 * to the camera world position BEFORE the floating-origin recenter so the
 * world-group settles around the encounter body during the held window.
 *
 * Cruise / launch / heliopause / Pale Blue Dot chapters carry
 * `targetBody === undefined`; the service returns the zero vector and
 * the renderer falls through to the existing heliocentric path
 * unchanged.
 *
 * ## Alpha curve
 *
 * Over an encounter chapter with `[windowStartEt, windowEndEt]`:
 *
 *   et < windowStartEt - 2*DAY                 ⇒ alpha = 0 (helio)
 *   windowStartEt - 2*DAY ≤ et < windowStartEt ⇒ alpha = smoothstep(0,1,
 *                                                   (et-startEt+2*DAY)/(2*DAY))
 *   windowStartEt ≤ et ≤ windowEndEt           ⇒ alpha = 1 (body-centered)
 *   windowEndEt < et ≤ windowEndEt + 2*DAY     ⇒ alpha = smoothstep(0,1,
 *                                                   (windowEndEt+2*DAY-et)/(2*DAY))
 *   et > windowEndEt + 2*DAY                   ⇒ alpha = 0 (helio)
 *
 * The lerp is then `originOffsetWorld = alpha * bodyPosition(et)` —
 * heliocentric coordinates with the Sun at `(0, 0, 0)` are the baseline,
 * so the "from" endpoint of the lerp is the zero vector and the math
 * collapses to a scalar multiplication.
 *
 * ## Reduced motion
 *
 * Under `prefers-reduced-motion: reduce`, the smoothstep collapses to an
 * instant cut at the window boundary — `alpha` jumps 0 → 1 at
 * `windowStartEt` and 1 → 0 at `windowEndEt + ε`. This matches the
 * project-wide reduced-motion contract from Story 1.7 (every UI duration
 * collapses to 0ms via `--v-duration-base`).
 *
 * ## EphemerisService dependency
 *
 * Reads body positions through the injected EphemerisService. If the
 * body chunk hasn't loaded yet, `getPosition` returns `null` and we
 * fall through to the heliocentric (zero offset) branch — the renderer
 * does NOT pop; the entry blend rejoins seamlessly once the chunk lands
 * (the next frame computes the body-centered offset with the same alpha
 * and the world group shifts smoothly).
 *
 * ## ADR-0015 (no-global-store) compliance
 *
 * Constructed in `main.ts` and dependency-injected into `RenderEngine`
 * via its constructor options. The service holds no module-level
 * singleton state; one instance per app boot.
 */

import type { EphemerisService } from './ephemeris-service';
import type { ChapterSpec } from '../types/chapter';
import type { WorldVec3 } from '../types/branded';
import { worldVec3 } from '../types/branded';
import { smoothstep } from '../math/smoothstep';
import { ALL_CHAPTERS } from '../chapters/registry';

/**
 * Source for the reduced-motion preference. The service queries it once
 * per `getTransform` call so the answer tracks runtime OS-level changes
 * (e.g. the user toggles "reduce motion" mid-session). Pure function so
 * tests can inject a fixed boolean.
 */
export type ReducedMotionSource = () => boolean;

/**
 * Per-frame view-frame transform. Translation-only per ADR-0023 — no
 * rotation field; future ViewFrame readers cannot accidentally call
 * `transform.quaternion` and read `undefined`.
 */
export interface ViewFrameTransform {
  /**
   * J2000-axes Float64 displacement in km. Add to the camera world
   * position BEFORE the floating-origin recenter to anchor the world on
   * the encounter body during the held window.
   */
  readonly originOffsetWorld: WorldVec3;
  /**
   * BUG-CR-005 fix (2026-05-25): blend factor in [0, 1] mirroring the
   * smoothstep ramp used for `originOffsetWorld`. 0 = heliocentric/cruise,
   * 1 = full body-centered framing. Consumers (e.g. SpacecraftModels'
   * dynamic scale exaggeration at encounter close-ups) read this to lerp
   * presentation properties along the same blend curve the camera anchor
   * uses, guaranteeing visual synchronization with the ViewFrame's body-
   * centered transition.
   */
  readonly encounterAlpha: number;
}

const SECONDS_PER_DAY = 86_400;
const BLEND_HALF_WINDOW_SEC = 2 * SECONDS_PER_DAY;

/**
 * Default reduced-motion source — matches `<v-help-overlay>` and
 * `<v-chapter-copy>`: the central `prefers-reduced-motion: reduce` media
 * query. Tests inject a stub instead. Returns `false` in non-browser
 * environments (Node tests that don't stand up happy-dom) so the
 * smoothstep path is the default.
 */
const defaultReducedMotionSource: ReducedMotionSource = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export class ViewFrameService {
  private readonly ephemeris: EphemerisService;
  private readonly reducedMotion: ReducedMotionSource;
  /**
   * Chapter set scanned during the entering / exiting ramp zones where
   * `ChapterDirector.activeChapter` returns `null` (the FSM only dwells in
   * `held` per Story 2.1, so the chapter-director hands us null for the
   * ±2-day ramps outside the held window). We resolve the approaching /
   * departing encounter chapter by scanning these specs for one whose
   * ramp band covers `et`. Encounter windows do not overlap (registry
   * test pin), so at most one encounter chapter ever matches at any ET.
   *
   * Defaults to `ALL_CHAPTERS`; tests inject a smaller fixture set to
   * pin the scan behaviour without standing up the full registry.
   */
  private readonly chapters: readonly ChapterSpec[];

  constructor(
    ephemeris: EphemerisService,
    reducedMotion: ReducedMotionSource = defaultReducedMotionSource,
    chapters: readonly ChapterSpec[] = ALL_CHAPTERS,
  ) {
    this.ephemeris = ephemeris;
    this.reducedMotion = reducedMotion;
    this.chapters = chapters;
  }

  /**
   * Compute the per-frame J2000 → render-space origin offset.
   *
   * Returns `{ originOffsetWorld }` — translation-only per ADR-0023.
   * Cruise / non-encounter chapters return the zero vector; encounter
   * chapters lerp from heliocentric (zero) to body-centered over the
   * ±2-day window using a cubic-Hermite smoothstep.
   */
  getTransform(
    et: number,
    activeChapter: ChapterSpec | null,
  ): ViewFrameTransform {
    // Resolve the chapter whose blend window governs `et`. Three sources:
    //   1. `activeChapter` (FSM `held` — the common case during a chapter)
    //   2. an encounter chapter whose ±2-day ramp band covers `et`
    //      (the FSM is between substates, but the renderer still owes a
    //      smooth blend per AC1's ±2-day window contract)
    //   3. neither — pure cruise; identity.
    // Non-encounter held chapters (launch / heliopause / PBD) carry no
    // targetBody, so they short-circuit to identity via the encounter
    // gate below.
    const chapter = this.resolveBlendChapter(et, activeChapter);
    if (chapter === null) {
      return IDENTITY_TRANSFORM;
    }

    const alpha = this.computeAlpha(et, chapter);
    if (alpha === 0) {
      return IDENTITY_TRANSFORM;
    }

    // chapter.targetBody is guaranteed defined because resolveBlendChapter
    // only returns encounter chapters (carry targetBody); narrow with `!`.
    const bodyPos = this.ephemeris.getPosition(et, chapter.targetBody!);
    if (bodyPos === null) {
      // Chunk not yet loaded — keep the heliocentric anchor for this
      // frame. The next frame after the chunk lands will compute the
      // body-centered offset with the same alpha; the lerp resumes
      // without a pop because alpha is continuous in et.
      return IDENTITY_TRANSFORM;
    }

    // Heliocentric (Sun at origin) → body-centered lerp collapses to a
    // scalar multiplication of the body's heliocentric position by alpha.
    return {
      originOffsetWorld: worldVec3(
        alpha * bodyPos[0],
        alpha * bodyPos[1],
        alpha * bodyPos[2],
      ),
      encounterAlpha: alpha,
    };
  }

  /**
   * Find the encounter chapter whose blend window governs `et`. Returns:
   *
   *   - `activeChapter` if it's an encounter (held substate; common path).
   *   - The encounter chapter whose `[windowStartEt - 2*DAY,
   *     windowEndEt + 2*DAY]` band contains `et` when no encounter is
   *     currently held (FSM in transient `entering` / `exiting` or
   *     between-chapters cruise inside a ramp zone).
   *   - `null` for true cruise (no encounter band covers `et`) or for
   *     non-encounter held chapters (launch / heliopause / PBD).
   *
   * Encounter windows don't overlap (registry pin), so the scan returns
   * at most one match.
   */
  private resolveBlendChapter(
    et: number,
    activeChapter: ChapterSpec | null,
  ): ChapterSpec | null {
    if (activeChapter !== null && activeChapter.targetBody !== undefined) {
      return activeChapter;
    }
    // Active chapter is null (cruise) OR non-encounter (launch / heliopause /
    // PBD held). Either way, look for an encounter chapter whose ramp band
    // covers `et`. Reduced-motion collapses the ramp zone to zero width
    // (alpha jumps at the held edges), so the scan is skipped — only the
    // held substate matters under reduced motion, which we already covered
    // above via `activeChapter`.
    if (this.reducedMotion()) {
      return null;
    }
    for (const c of this.chapters) {
      if (c.targetBody === undefined) continue;
      if (
        et >= c.windowStartEt - BLEND_HALF_WINDOW_SEC &&
        et <= c.windowEndEt + BLEND_HALF_WINDOW_SEC
      ) {
        return c;
      }
    }
    return null;
  }

  /**
   * Compute the blend alpha at `et` for a held encounter chapter.
   * Pure — no ephemeris call. Exposed for the unit tests that want to
   * pin the curve at boundary + interior + reduced-motion cases without
   * standing up a real ephemeris stack.
   */
  computeAlpha(et: number, activeChapter: ChapterSpec): number {
    if (activeChapter.targetBody === undefined) return 0;

    const { windowStartEt, windowEndEt } = activeChapter;

    // Reduced-motion collapse: instant cut at the held-window edges. The
    // visitor sees the world snap from heliocentric to body-centered at
    // windowStartEt and back at windowEndEt + ε; no easing curve.
    if (this.reducedMotion()) {
      if (et < windowStartEt) return 0;
      if (et > windowEndEt) return 0;
      return 1;
    }

    // Held: alpha = 1 across the entire held window.
    if (et >= windowStartEt && et <= windowEndEt) {
      return 1;
    }

    // Entering ramp: smoothstep from 0 at (windowStartEt - 2*DAY) to 1
    // at windowStartEt.
    if (et < windowStartEt) {
      const rampStart = windowStartEt - BLEND_HALF_WINDOW_SEC;
      if (et <= rampStart) return 0;
      return smoothstep(rampStart, windowStartEt, et);
    }

    // Exiting ramp: smoothstep from 1 at windowEndEt to 0 at
    // (windowEndEt + 2*DAY). Symmetric mirror of the entering ramp.
    const rampEnd = windowEndEt + BLEND_HALF_WINDOW_SEC;
    if (et >= rampEnd) return 0;
    return smoothstep(rampEnd, windowEndEt, et);
  }
}

/**
 * Shared identity-transform constant — heliocentric origin, no shift.
 * Frozen so a careless consumer can't mutate the singleton vector.
 * The underlying Float64Array is read-only by convention (ADR-0012);
 * we don't deep-freeze the typed-array because that would erase its
 * iterability semantics, but the surface returned from `getTransform`
 * is documented as read-only.
 */
const IDENTITY_TRANSFORM: ViewFrameTransform = Object.freeze({
  originOffsetWorld: worldVec3(0, 0, 0),
  encounterAlpha: 0,
});
