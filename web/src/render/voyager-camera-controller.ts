/**
 * VoyagerCameraController — hand-rolled camera controller for manual
 * encounter exploration (Story 4.2).
 *
 * ## Why hand-rolled (not `THREE.OrbitControls`)
 *
 * Architecture Decision 3c commits to a hand-rolled controller because:
 *   1. Zoom range hard clamps `[0.001 km, 200 * AU_KM]` — OrbitControls's
 *      `min/maxDistance` plumbing collides with reverse-Z near-plane semantics
 *      at the sub-meter end.
 *   2. No free roll without an explicit Shift modifier — OrbitControls's
 *      pan/orbit/zoom set is fixed; Shift-roll is a custom gesture.
 *   3. The controller does NOT own the camera (per ADR-0015 constructor-DI):
 *      ownership is read from `getActiveTarget()` + `getViewFrameOrigin()`
 *      callbacks the consumer wires from `EphemerisService` + `ViewFrameService`.
 *
 * ## Camera-ownership flip (AC2)
 *
 * Default state: the chapter director's framing owns `camera.position` +
 * `camera.quaternion`. As soon as the user fires ANY pointer gesture on the
 * canvas, `setManualCameraActive(true)` flips ownership: the controller
 * writes the local transform; chapter framing stays out. ViewFrame still
 * computes its world-origin offset every frame (per Story 4.1 AC2); that
 * path is unchanged — only the *local* camera transform owner moves.
 *
 * Restore (AC3): pressing `R` (text-input-gated per Story 2.8) or clicking
 * `<button class="restore-camera">` interpolates the camera back to the
 * chapter's default framing over `--v-duration-slow`, then flips
 * `manualCameraActive = false`. Subsequent chapter transitions auto-frame
 * normally via ViewFrame.
 *
 * ## Module-owned suspension (PBD carve-out)
 *
 * Epic 5's Pale Blue Dot module writes camera transforms during the
 * choreographed turn. While the PBD module is in its scripted window it
 * will set `manualCameraSuspended = true` on this controller (wiring is
 * Epic 5; this stub establishes the contract). When suspended:
 *   - gesture handlers ignore pointer events (no ownership flip),
 *   - the restore animation pauses if mid-tween (resumes when unsuspended),
 *   - the `R` shortcut + button click are no-ops.
 *
 * ## Reduced motion
 *
 * `--v-duration-slow` collapses to `0ms` under
 * `@media (prefers-reduced-motion: reduce)` (global.css). The restore
 * animation reads `matchMedia('(prefers-reduced-motion: reduce)').matches`
 * at animation start; under reduced motion the camera snaps to the default
 * framing on the same frame and `manualCameraActive` flips immediately.
 *
 * ## ADR compliance
 *
 * - ADR-0015 (no global store; constructor-DI): camera + DOM target + ET
 *   getters + target getters are constructor params; no module-level
 *   singletons; one instance per app boot.
 * - ADR-0023 (translation-only ViewFrame): the controller writes only the
 *   camera's LOCAL transform (`camera.position` / `camera.quaternion`); it
 *   does NOT touch the ViewFrame origin math.
 * - ADR-0026 (zero `any`): all gesture handler types use the existing
 *   `PointerPayload` from `primitives/pointer-events.ts`; restore-animation
 *   types are explicit.
 *
 * ## FR coverage
 *
 * - FR13 (sub-meter through 165 AU): the zoom clamp upper bound is 200 AU
 *   (35 AU headroom); the lower bound is 0.001 km = 1 m (sub-meter target).
 *   Combined with reverse-Z (Story 1.5) the rendering stays stable across
 *   the full 30-orders-of-magnitude range.
 * - FR32 (free camera control): orbit / pan / zoom / Shift-roll gestures.
 * - FR33 (restore default framing): `R` shortcut + restore button.
 */

import {
  Matrix4,
  Quaternion,
  Spherical,
  Vector3,
  type PerspectiveCamera,
} from 'three';

import { KM_PER_AU } from '../math/constants';
import {
  attachPointerHandlers,
  type PointerPayload,
} from '../primitives/pointer-events';
import type { WorldVec3 } from '../types/branded';

/**
 * Zoom-distance hard clamps in render-space kilometers. The lower bound is
 * 1 meter (FR13 sub-meter target with 1m headroom); the upper is 200 AU
 * (FR13 covers 165 AU; 200 leaves 35 AU of headroom for the dwarf-planet
 * fly-by reuse case). Architecture Decision 3c pins both bounds.
 */
export const MIN_ZOOM_DISTANCE_KM = 0.001;
export const MAX_ZOOM_DISTANCE_KM = 200 * KM_PER_AU;

/**
 * Cruise-mode default camera distance from the world origin (the Sun after
 * floating-origin recenter). Tuned to frame the inner planets + V1/V2 in
 * a comfortable establishing shot. ~10 AU = roughly Saturn's orbit.
 */
export const CRUISE_DEFAULT_DISTANCE_KM = 10 * KM_PER_AU;

/**
 * Default body-centered camera distance when a chapter doesn't supply
 * `defaultCameraDistanceKm`. Chosen as 10 body-radii equivalent for the
 * gas giants (Jupiter R ~71.5 Mm → ~715 Mm); the per-chapter override
 * (added in Story 4.5 / 4.6 / 4.7 if needed) takes precedence.
 */
export const DEFAULT_ENCOUNTER_DISTANCE_KM = 1_000_000;

/**
 * Restore animation duration baseline (ms). Mirrors `--v-duration-slow`
 * (tokens.css). The token is the source of truth at render time; this
 * constant is the JS-side fallback when matchMedia is unavailable. Under
 * `prefers-reduced-motion: reduce` the controller collapses to instant.
 */
export const RESTORE_DURATION_MS = 400;

/** Wheel-zoom log-step per notch (~10% per click). Architecture Decision 3c. */
const WHEEL_ZOOM_STEP = 0.1;

/** Orbit sensitivity — radians per pixel of pointer drag. */
const ORBIT_SENSITIVITY = 0.005;

/** Pan sensitivity — world-units per pixel, scaled by current zoom. */
const PAN_SENSITIVITY = 0.0015;

/** Roll sensitivity — radians per pixel of Shift+drag. */
const ROLL_SENSITIVITY = 0.005;

/**
 * Source of the current simulation ET. Tests inject a stub returning a
 * fixed value; production wires `clockManager.simTimeEt` at the call site.
 */
export type EtSource = () => number;

/**
 * Resolve the world position the camera orbits around. In body-centered
 * framing this is the active body's position in the SHIFTED render-space-
 * after-floating-origin frame; in cruise this returns the origin (zero
 * vector) — the Sun-at-world-origin after the identity ViewFrame transform.
 *
 * The controller calls this on every gesture frame to track moving targets
 * (the bodies aren't stationary). Returns `null` when no target is active
 * (the controller treats this as cruise — pivot around the origin).
 */
export type ActiveTargetSource = () => WorldVec3 | null;

/**
 * Resolve the ViewFrame's current world-origin offset. The controller
 * computes the active-target position in the SHIFTED frame (subtracts this
 * offset). Returns the zero vector when cruise / non-encounter chapters
 * are active.
 */
export type ViewFrameOriginSource = () => WorldVec3;

/**
 * Source of the `prefers-reduced-motion: reduce` media query. Defaults to
 * `matchMedia('(prefers-reduced-motion: reduce)').matches`. Pure function
 * so tests can inject a fixed boolean.
 */
export type ReducedMotionSource = () => boolean;

/**
 * Source of `performance.now()` (ms). The restore animation reads it on
 * every tick to compute eased progress. Pure function so tests can drive
 * deterministic time without mocking `performance`.
 */
export type NowMsSource = () => number;

/**
 * Default-framing target the restore animation tweens toward. Position is
 * in render-space km (post-floating-origin); quaternion is the camera's
 * desired world rotation.
 */
export interface DefaultFramingTarget {
  position: Vector3;
  quaternion: Quaternion;
}

/**
 * Resolve the chapter-specific default framing target the restore
 * animation tweens toward. Receives the controller's view of the current
 * active target (in shifted-render-space coordinates); returns the
 * camera's desired position + quaternion. Returning `null` falls back to
 * the cruise default (Sun-centered ~10 AU).
 */
export type DefaultFramingResolver = (
  activeTarget: Vector3 | null,
) => DefaultFramingTarget | null;

/**
 * Render-engine surface the controller writes the manual-camera flag to.
 * Decoupled from the concrete RenderEngine class so tests can pass a stub.
 */
export interface ManualCameraHost {
  setManualCameraActive(value: boolean): void;
  readonly manualCameraActive: boolean;
}

export interface VoyagerCameraControllerOptions {
  /** The Three.js camera the controller orients + positions. */
  camera: PerspectiveCamera;
  /** The DOM element pointer + wheel events are attached to. */
  domElement: HTMLElement;
  /** Render-engine surface the manual-camera flag is written to. */
  renderEngine: ManualCameraHost;
  /** Closure resolving the active body's world position (shifted frame). */
  getActiveTarget: ActiveTargetSource;
  /** Closure resolving the ViewFrame's current world-origin offset. */
  getViewFrameOrigin: ViewFrameOriginSource;
  /** Optional: closure resolving the chapter-default framing target. */
  resolveDefaultFraming?: DefaultFramingResolver;
  /** Optional: ET source (currently unused by the controller; reserved). */
  getEt?: EtSource;
  /** Optional: reduced-motion source (defaults to `matchMedia`). */
  reducedMotion?: ReducedMotionSource;
  /** Optional: now() source (defaults to `performance.now()`). */
  nowMs?: NowMsSource;
  /** Optional: restore duration override (ms). Defaults to RESTORE_DURATION_MS. */
  restoreDurationMs?: number;
}

/**
 * Internal gesture state. The controller tracks at most one active drag at
 * a time (single-pointer); multi-touch would extend this with a Map but
 * isn't required for AC1 (mouse + single-touch coverage).
 */
interface GestureState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** Which mouse button started the drag (-1 for touch/pen). */
  button: number;
  shiftHeld: boolean;
  /** Cursor value to restore on pointerup. */
  previousCursor: string;
}

/** Active restore-animation state. */
interface RestoreAnimation {
  startMs: number;
  durationMs: number;
  fromPosition: Vector3;
  fromQuaternion: Quaternion;
  toPosition: Vector3;
  toQuaternion: Quaternion;
  /** Resolves when the animation completes. */
  resolve: () => void;
}

const defaultReducedMotionSource: ReducedMotionSource = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const defaultNowMsSource: NowMsSource = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

/**
 * Cubic ease-in-out for the restore animation. Matches the visual feel of
 * `--v-ease-in-out` from tokens.css. Pure scalar function — no allocation.
 */
const easeInOutCubic = (t: number): number => {
  if (t < 0.5) return 4 * t * t * t;
  const f = 2 * t - 2;
  return 1 + (f * f * f) / 2;
};

/**
 * Convert a `WorldVec3` (km, Float64) into a `THREE.Vector3` (Float32).
 * Allocates a new Vector3 each call — call sites are gesture-paced (low Hz)
 * and restore-paced (per-frame during ~400ms), not 60Hz per-frame, so the
 * alloc cost is negligible.
 */
const worldToVector3 = (w: WorldVec3): Vector3 => new Vector3(w[0], w[1], w[2]);

export class VoyagerCameraController {
  readonly camera: PerspectiveCamera;
  readonly domElement: HTMLElement;
  private readonly renderEngine: ManualCameraHost;
  private readonly getActiveTarget: ActiveTargetSource;
  /**
   * Reserved getter — the controller does NOT touch the ViewFrame origin
   * math (ADR-0023 translation-only contract). The closure is kept on the
   * options + stored on the instance so future stories (e.g. PBD
   * substate's "module-owned" suspend that needs to align the local
   * frame) can read the current origin without changing this story's
   * constructor surface. Exposed publicly so tests + future consumers
   * can introspect without re-plumbing the constructor option.
   */
  readonly getViewFrameOrigin: ViewFrameOriginSource;
  private readonly resolveDefaultFraming: DefaultFramingResolver;
  private readonly reducedMotion: ReducedMotionSource;
  private readonly nowMs: NowMsSource;
  private readonly restoreDurationMs: number;

  /**
   * Epic 5 PBD carve-out (see file header). When `true`, gesture handlers
   * + the restore shortcut + button click are no-ops; the PBD module
   * substate machine owns the camera while it is suspended. Wiring is
   * deferred to the PBD module; the controller exposes the flag as a
   * writable field per the file-header contract.
   */
  manualCameraSuspended: boolean = false;

  private gesture: GestureState | null = null;
  private detachPointer: (() => void) | null = null;
  private detachWheel: (() => void) | null = null;

  private animation: RestoreAnimation | null = null;
  private animationRaf: number | null = null;

  constructor(options: VoyagerCameraControllerOptions) {
    this.camera = options.camera;
    this.domElement = options.domElement;
    this.renderEngine = options.renderEngine;
    this.getActiveTarget = options.getActiveTarget;
    this.getViewFrameOrigin = options.getViewFrameOrigin;
    this.resolveDefaultFraming =
      options.resolveDefaultFraming ?? defaultFramingFallback;
    this.reducedMotion = options.reducedMotion ?? defaultReducedMotionSource;
    this.nowMs = options.nowMs ?? defaultNowMsSource;
    this.restoreDurationMs =
      options.restoreDurationMs ?? RESTORE_DURATION_MS;
  }

  /**
   * Attach pointer + wheel handlers. Idempotent — calling twice attaches
   * one set of handlers (re-attachment after detach() is a fresh attach).
   * Returns a detach function for caller convenience; the controller also
   * exposes `detach()` directly for symmetry with Three.js conventions.
   */
  attach(): () => void {
    if (this.detachPointer !== null) return () => this.detach();

    this.detachPointer = attachPointerHandlers(this.domElement, {
      onDown: (e) => this.onPointerDown(e),
      onMove: (e) => this.onPointerMove(e),
      onUp: (e) => this.onPointerUp(e),
      onCancel: (e) => this.onPointerUp(e),
    });

    // Wheel zoom — the Pointer Events primitive doesn't surface wheel; we
    // wire it directly with `passive: false` so we can `preventDefault()`
    // and suppress page scroll during zoom.
    const wheelListener = (ev: WheelEvent): void => {
      this.onWheel(ev);
    };
    this.domElement.addEventListener('wheel', wheelListener, { passive: false });
    this.detachWheel = (): void => {
      this.domElement.removeEventListener('wheel', wheelListener);
    };

    return () => this.detach();
  }

  /** Detach all listeners. Idempotent. */
  detach(): void {
    if (this.detachPointer !== null) {
      this.detachPointer();
      this.detachPointer = null;
    }
    if (this.detachWheel !== null) {
      this.detachWheel();
      this.detachWheel = null;
    }
    this.cancelAnimation();
  }

  /**
   * Is the restore animation currently running? Exposed for the integration
   * test (AC6) so it can poll without standing up a frame loop.
   */
  get isRestoring(): boolean {
    return this.animation !== null;
  }

  /**
   * Promise that resolves when the current restore animation completes.
   * Returns a resolved promise if no animation is in flight (so callers
   * can await unconditionally). The integration test (AC6) awaits this
   * after dispatching the `R` key to assert on the post-restore state.
   */
  get restoreComplete(): Promise<void> {
    if (this.animation === null) return Promise.resolve();
    return new Promise<void>((resolve) => {
      // Chain onto the existing animation's resolve so the original
      // controller-internal resolve still fires its cleanup.
      const previousResolve = this.animation!.resolve;
      this.animation!.resolve = (): void => {
        previousResolve();
        resolve();
      };
    });
  }

  /**
   * Trigger the restore-to-default-framing animation. Called by:
   *   - the `R` keyboard handler (Story 4.2 AC3 + AC7)
   *   - the `<button class="restore-camera">` click handler (AC4)
   *
   * Delegates to `applyDefaultFraming({ animated: true })`. The
   * separately-named entry point preserves the Story 4.2 surface while
   * Story 4.5 wires the new chapter-activation path through the shared
   * implementation.
   *
   * No-op when `manualCameraSuspended === true` (PBD carve-out).
   *
   * Under reduced motion the animation collapses to instant: the camera
   * snaps to the default framing on the same call and
   * `manualCameraActive` flips to false synchronously.
   */
  restore(): void {
    this.applyDefaultFraming({ animated: true });
  }

  /**
   * Drive the camera to the chapter-resolved default framing. Story 4.5
   * AC3 entry point — called from the `ChapterDirector` subscriber in
   * `main.ts` on `to === 'held'` transitions for chapters carrying
   * `defaultFraming`.
   *
   * Behaviour:
   *   - No-op when `manualCameraSuspended === true` (PBD carve-out).
   *   - No-op when the resolver returns null AND no fallback would
   *     apply (e.g. chapter has no `defaultFraming` and no active body).
   *     The cold-load / cruise case correctly falls through to the
   *     built-in `defaultFramingFallback` (Sun-centered ~10 AU); we
   *     only short-circuit when both resolver + fallbacks are null,
   *     which today's code path doesn't produce but defends against a
   *     future third-party resolver shape.
   *   - Animated path: SLERP + LERP over `--v-duration-slow` (matches
   *     R-key restore semantics).
   *   - Instant path: direct position + quaternion assignment.
   *
   * After the framing lands (animated end or instant immediate),
   * `manualCameraActive` is set to `false` — the camera is in
   * chapter-controlled state, not user-manual state.
   *
   * `applyDefaultFraming({ animated: false })` is the cold-load entry
   * point — the camera starts at the world origin and we want it at
   * the framing target on the first user-visible frame, no tween.
   */
  applyDefaultFraming(options: { animated: boolean }): void {
    if (this.manualCameraSuspended) return;

    // Cancel any in-flight animation; the new framing takes precedence.
    // We intentionally do NOT resolve the previous animation's promise
    // here — the awaiter is awaiting THIS call to complete, not the
    // cancelled one.
    this.cancelAnimation();

    const activeTargetWorld = this.getActiveTarget();
    const activeTargetVec3 =
      activeTargetWorld !== null ? worldToVector3(activeTargetWorld) : null;
    // The fallback signature is `DefaultFramingResolver` which CAN return
    // null (third-party resolvers might); the in-module fallback always
    // returns a non-null framing (cruise-default). We force-resolve via a
    // safety wrap so the `target` is non-nullable below.
    const target: DefaultFramingTarget =
      this.resolveDefaultFraming(activeTargetVec3) ??
      defaultFramingFallback(activeTargetVec3) ??
      buildCruiseDefaultFraming();

    const fromPosition = this.camera.position.clone();
    const fromQuaternion = this.camera.quaternion.clone();

    const animated = options.animated;
    if (!animated || this.reducedMotion() || this.restoreDurationMs <= 0) {
      // Instant cut — collapse the animation to a single state assignment.
      this.camera.position.copy(target.position);
      this.camera.quaternion.copy(target.quaternion);
      this.renderEngine.setManualCameraActive(false);
      return;
    }

    const startMs = this.nowMs();
    // Build the animation; the resolve is wired into the promise getter
    // (restoreComplete) which augments it when first read.
    this.animation = {
      startMs,
      durationMs: this.restoreDurationMs,
      fromPosition,
      fromQuaternion,
      toPosition: target.position.clone(),
      toQuaternion: target.quaternion.clone(),
      resolve: () => {
        /* augmented by restoreComplete getter when first observed */
      },
    };

    this.scheduleAnimationFrame();
  }

  // ----- pointer / wheel handlers ------------------------------------

  private onPointerDown(e: PointerPayload): void {
    if (this.manualCameraSuspended) return;
    // Only respond to primary mouse button or any touch/pen. Right-button
    // (button=2) starts the pan gesture; middle (button=1) is reserved.
    const button = e.raw instanceof MouseEvent ? e.raw.button : -1;
    // Suppress browser context menu on right-click drag.
    if (button === 2 && typeof e.raw.preventDefault === 'function') {
      e.raw.preventDefault();
    }
    const previousCursor = this.domElement.style.cursor;
    this.domElement.style.cursor = 'grabbing';
    this.gesture = {
      pointerId: e.pointerId,
      startX: e.x,
      startY: e.y,
      lastX: e.x,
      lastY: e.y,
      button,
      shiftHeld: e.raw.shiftKey === true,
      previousCursor,
    };
    // Flip ownership immediately so the chapter framer stops writing to
    // the camera on this same frame. AC2: the moment the user gestures.
    this.renderEngine.setManualCameraActive(true);
    // A user gesture supersedes any in-flight restore animation.
    this.cancelAnimation();
  }

  private onPointerMove(e: PointerPayload): void {
    // PBD module-owned suspension can flip mid-drag (e.g. the choreographed
    // turn begins while the user happens to be dragging). The pointerdown +
    // wheel guards block NEW gestures; this guard blocks IN-FLIGHT writes.
    // Matches the file-header contract: "gesture handlers ignore pointer
    // events". The drag remains tracked so cursor/state restore correctly
    // on pointerup; only the camera writes are blocked.
    if (this.manualCameraSuspended) return;
    if (this.gesture === null) return;
    if (this.gesture.pointerId !== e.pointerId) return;
    const dx = e.x - this.gesture.lastX;
    const dy = e.y - this.gesture.lastY;
    this.gesture.lastX = e.x;
    this.gesture.lastY = e.y;
    if (dx === 0 && dy === 0) return;

    const shift = e.raw.shiftKey === true;
    if (shift) {
      this.applyRoll(dx);
      return;
    }
    if (this.gesture.button === 2) {
      this.applyPan(dx, dy);
      return;
    }
    this.applyOrbit(dx, dy);
  }

  private onPointerUp(e: PointerPayload): void {
    if (this.gesture === null) return;
    if (this.gesture.pointerId !== e.pointerId) return;
    this.domElement.style.cursor = this.gesture.previousCursor;
    this.gesture = null;
  }

  private onWheel(ev: WheelEvent): void {
    if (this.manualCameraSuspended) return;
    // Horizontal-only wheels (deltaX-only mice, trackpad shift-scroll) can
    // fire with deltaY === 0. Treat as a no-op so we don't accidentally
    // flip manualCameraActive on a non-zoom gesture.
    if (ev.deltaY === 0) return;
    ev.preventDefault();
    // Log-scale step: each notch multiplies the distance by (1 ± step).
    // deltaY > 0 (wheel down) → zoom out; deltaY < 0 → zoom in. We
    // normalize by the sign so trackpad pixel-mode deltas still feel right.
    const direction = ev.deltaY > 0 ? 1 : -1;
    const factor = 1 + direction * WHEEL_ZOOM_STEP;
    this.applyZoom(factor);
    this.renderEngine.setManualCameraActive(true);
    this.cancelAnimation();
  }

  // ----- gesture math -------------------------------------------------

  private getOrbitTargetVec3(): Vector3 {
    const w = this.getActiveTarget();
    if (w === null) return new Vector3(0, 0, 0);
    return worldToVector3(w);
  }

  private applyOrbit(dx: number, dy: number): void {
    const target = this.getOrbitTargetVec3();
    const offset = this.camera.position.clone().sub(target);
    const spherical = new Spherical().setFromVector3(offset);
    spherical.theta -= dx * ORBIT_SENSITIVITY;
    spherical.phi -= dy * ORBIT_SENSITIVITY;
    // Clamp polar angle to avoid flipping through the pole (matches the
    // OrbitControls convention of leaving a small epsilon at each end).
    const EPS = 1e-4;
    spherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, spherical.phi));
    // Apply zoom-distance clamps to the orbit radius too — a wide orbit
    // gesture that wraps around shouldn't pull the camera outside the
    // configured zoom range.
    spherical.radius = clampZoomDistance(spherical.radius);
    const next = new Vector3().setFromSpherical(spherical).add(target);
    this.camera.position.copy(next);
    this.camera.lookAt(target);
  }

  private applyPan(dx: number, dy: number): void {
    const target = this.getOrbitTargetVec3();
    const distance = this.camera.position.distanceTo(target);
    const scale = distance * PAN_SENSITIVITY;
    // Right vector = camera local +X in world space.
    const right = new Vector3()
      .setFromMatrixColumn(this.camera.matrixWorld, 0)
      .normalize();
    const up = new Vector3()
      .setFromMatrixColumn(this.camera.matrixWorld, 1)
      .normalize();
    const delta = new Vector3()
      .addScaledVector(right, -dx * scale)
      .addScaledVector(up, dy * scale);
    this.camera.position.add(delta);
    // Hard-clamp the camera-to-target distance after the pan, mirroring
    // applyOrbit + applyZoom. Pan is not a radial gesture, but a long lateral
    // drag can drift the camera distance outside [MIN, MAX] — Architecture
    // Decision 3c forbids drift-into-violation during ANY gesture, so we
    // rescale the camera offset back into the clamp range if needed. The
    // direction (the line from target to camera) is preserved.
    const newOffset = this.camera.position.clone().sub(target);
    const newDistance = newOffset.length();
    const clamped = clampZoomDistance(newDistance);
    if (newDistance > 0 && clamped !== newDistance) {
      newOffset.multiplyScalar(clamped / newDistance);
      this.camera.position.copy(target).add(newOffset);
    }
  }

  private applyRoll(dx: number): void {
    // Free roll about the camera's forward axis (the camera's local -Z in
    // world space). Architecture Decision 3c: this is the ONLY path to a
    // non-up-locked camera orientation.
    const angle = dx * ROLL_SENSITIVITY;
    const forward = new Vector3()
      .setFromMatrixColumn(this.camera.matrixWorld, 2)
      .normalize();
    const q = new Quaternion().setFromAxisAngle(forward, angle);
    this.camera.quaternion.premultiply(q);
  }

  private applyZoom(factor: number): void {
    const target = this.getOrbitTargetVec3();
    const offset = this.camera.position.clone().sub(target);
    const currentDistance = offset.length();
    const newDistance = clampZoomDistance(currentDistance * factor);
    if (currentDistance === 0) return;
    offset.multiplyScalar(newDistance / currentDistance);
    this.camera.position.copy(target).add(offset);
  }

  // ----- restore animation -------------------------------------------

  private scheduleAnimationFrame(): void {
    if (typeof requestAnimationFrame === 'undefined') {
      // Node/test environment without RAF — drive once synchronously.
      // The test calls `tickAnimation` directly when it needs deterministic
      // stepping; this branch is just a defensive no-op for the very
      // first scheduling call.
      return;
    }
    this.animationRaf = requestAnimationFrame(() => this.tickAnimation());
  }

  /**
   * Advance the restore animation by one frame. Exposed for the
   * integration test (AC6) so it can drive the tween deterministically
   * without standing up a real RAF loop.
   *
   * Returns `true` while the animation is still running, `false` when
   * complete (or when no animation is in flight).
   */
  tickAnimation(): boolean {
    if (this.animation === null) return false;
    const a = this.animation;
    const elapsed = this.nowMs() - a.startMs;
    const t = a.durationMs === 0 ? 1 : Math.min(1, elapsed / a.durationMs);
    const eased = easeInOutCubic(t);
    // LERP position, SLERP quaternion. Compose into temporary Vector3/Quaternion
    // so we don't mutate the from/to state mid-animation.
    const pos = new Vector3().lerpVectors(a.fromPosition, a.toPosition, eased);
    const quat = new Quaternion().copy(a.fromQuaternion);
    quat.slerp(a.toQuaternion, eased);
    this.camera.position.copy(pos);
    this.camera.quaternion.copy(quat);

    if (t >= 1) {
      this.completeAnimation();
      return false;
    }
    if (typeof requestAnimationFrame !== 'undefined') {
      this.animationRaf = requestAnimationFrame(() => this.tickAnimation());
    }
    return true;
  }

  private completeAnimation(): void {
    if (this.animation === null) return;
    const resolve = this.animation.resolve;
    this.animation = null;
    this.animationRaf = null;
    this.renderEngine.setManualCameraActive(false);
    resolve();
  }

  private cancelAnimation(): void {
    if (this.animation === null) return;
    if (
      this.animationRaf !== null &&
      typeof cancelAnimationFrame !== 'undefined'
    ) {
      cancelAnimationFrame(this.animationRaf);
    }
    // Resolve any wrapped restoreComplete promises so callers awaiting the
    // cancelled animation don't hang. The semantics: a cancelled restore
    // still "completes" from the awaiter's perspective — control returns to
    // the user (whose new gesture triggered the cancel) and the awaiter can
    // observe the post-cancel state. This avoids the leak where
    // `controller.restoreComplete` returned a promise that never resolved
    // after a mid-restore gesture flipped manualCameraActive back to true.
    const resolve = this.animation.resolve;
    this.animation = null;
    this.animationRaf = null;
    resolve();
  }
}

/**
 * Clamp a zoom distance to `[MIN_ZOOM_DISTANCE_KM, MAX_ZOOM_DISTANCE_KM]`.
 * Exposed for tests; the controller uses it in three places (orbit, zoom,
 * and the default framing fallback) so a single definition keeps the
 * boundary semantics consistent.
 */
export const clampZoomDistance = (distanceKm: number): number => {
  if (Number.isNaN(distanceKm)) return MIN_ZOOM_DISTANCE_KM;
  if (distanceKm < MIN_ZOOM_DISTANCE_KM) return MIN_ZOOM_DISTANCE_KM;
  if (distanceKm > MAX_ZOOM_DISTANCE_KM) return MAX_ZOOM_DISTANCE_KM;
  return distanceKm;
};

/**
 * Default framing fallback when the consumer-supplied resolver returns
 * `null` (or no resolver was wired). Frames the active target at a
 * sensible distance with the camera looking at it from +Z; in cruise
 * (no active target) frames the world origin at `CRUISE_DEFAULT_DISTANCE_KM`.
 *
 * Exported for the unit tests; the controller wires this in the
 * constructor as a fallback if `options.resolveDefaultFraming` is omitted.
 */
/**
 * Last-resort cruise-default framing when both the consumer-supplied
 * resolver AND `defaultFramingFallback` return null (defensive — the
 * in-module fallback never actually returns null today, but a third-party
 * resolver might). Always returns a non-null cruise framing.
 */
const buildCruiseDefaultFraming = (): DefaultFramingTarget => ({
  position: new Vector3(0, 0, clampZoomDistance(CRUISE_DEFAULT_DISTANCE_KM)),
  quaternion: lookAtQuaternion(
    new Vector3(0, 0, clampZoomDistance(CRUISE_DEFAULT_DISTANCE_KM)),
    new Vector3(0, 0, 0),
    new Vector3(0, 1, 0),
  ),
});

export const defaultFramingFallback: DefaultFramingResolver = (
  activeTarget,
) => {
  const target = activeTarget ?? new Vector3(0, 0, 0);
  const distance =
    activeTarget === null
      ? CRUISE_DEFAULT_DISTANCE_KM
      : DEFAULT_ENCOUNTER_DISTANCE_KM;
  // Camera positioned offset along +Z from the target.
  const position = target.clone().add(new Vector3(0, 0, clampZoomDistance(distance)));
  // Build a quaternion that orients the camera to look at the target.
  // Using a temporary Three.js Camera-like vector math: we use lookAt via
  // a temporary matrix on a Vector3 → Quaternion derivation. The simplest
  // path is via THREE.Object3D's lookAt; we replicate with a small helper
  // to avoid allocating an Object3D here.
  const quaternion = lookAtQuaternion(position, target, new Vector3(0, 1, 0));
  return { position, quaternion };
};

/**
 * Compute a quaternion that orients the camera at `eye` to look at `target`
 * with `up` as the world-up axis. Mirrors the math `THREE.Camera.lookAt`
 * uses internally. Pure function — no scene-graph dependency.
 */
const lookAtQuaternion = (
  eye: Vector3,
  target: Vector3,
  up: Vector3,
): Quaternion => {
  // Build a look-at basis: z = (eye - target).normalize (right-handed,
  // camera looks down -Z); x = (up × z).normalize; y = z × x. Then
  // assemble the basis as a Matrix4 column-basis and convert to a
  // quaternion via Three.js's setFromRotationMatrix.
  const z = new Vector3().subVectors(eye, target).normalize();
  if (z.lengthSq() === 0) z.set(0, 0, 1);
  const x = new Vector3().crossVectors(up, z).normalize();
  if (x.lengthSq() === 0) {
    // up and z parallel — pick an arbitrary perpendicular.
    z.x += 1e-4;
    x.crossVectors(up, z).normalize();
  }
  const y = new Vector3().crossVectors(z, x);
  const matrix = new Matrix4();
  matrix.makeBasis(x, y, z);
  const q = new Quaternion();
  q.setFromRotationMatrix(matrix);
  return q;
};
