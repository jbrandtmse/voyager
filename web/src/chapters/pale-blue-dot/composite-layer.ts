/**
 * Pale Blue Dot photo-plate composite layer (Story 5.3).
 *
 * During the PBD chapter's `sweeping_<body>` substates, this layer
 * composites the corresponding NASA Planetary Photojournal narrow-angle
 * frame into the scene at the projected NA-camera boresight position.
 * Per AC4 at most one plate is visible at a time; per AC5 reduced-motion
 * mode replaces the 200ms cross-fade with an instant cut.
 *
 * ## Rendering path — Path A (HTML overlay)
 *
 * Plates render as `<img>` elements inside a sibling DOM container
 * `<div class="pbd-composite-layer">` that's appended to the canvas's
 * parent (NOT inside the WebGL canvas). This:
 *
 *   - Sidesteps ADR-0008 (`THREE.WebGLRenderer` over WebGPU) — no Three.js
 *     entanglement; the layer is purely DOM (per Story 5.3 AC10).
 *   - Is the simplest discoverable approach; preserves text-rendering
 *     quality + native `<img>` caching for the small PNG payloads.
 *   - Sits OUTSIDE the WebGL canvas as a sibling DOM layer so it doesn't
 *     interfere with `engine.onFrame` ordering or the canvas's render
 *     loop.
 *
 * The per-frame loop reads `scanPlatformNode.getWorldPosition()` (or a
 * fallback when the platform isn't yet resolved), projects it to NDC via
 * the perspective camera's `project(vec)`, and maps NDC → viewport
 * pixels. The plate's `style.left` / `style.top` follow this projected
 * position; `style.opacity` follows the substate-driven fade curve.
 *
 * ## Subscriber wiring
 *
 * The layer subscribes to the `PaleBlueDot` module's substate listener
 * (`paleBlueDot.subscribe(listener)` per Story 5.1's `PbdSubstateListener`
 * type). Substate transitions drive the active plate; the per-frame
 * `update(et, currentSubstate)` hook drives the per-frame projection +
 * opacity tween.
 *
 * ## Substate → plate mapping
 *
 *   sweeping_venus     → venus plate (fade-in over 200ms at substate start)
 *   sweeping_earth     → earth plate (fade-in over 200ms at substate start)
 *   composite_active   → earth plate held (30s hold — Story 5.3 Rule-5
 *                        amendment; the Earth plate from the preceding
 *                        sweeping_earth substate remains visible at
 *                        opacity 1 throughout this substate)
 *   sweeping_jupiter   → jupiter plate (Earth fades out, Jupiter fades in)
 *   sweeping_saturn    → saturn plate
 *   sweeping_uranus    → uranus plate
 *   sweeping_neptune   → neptune plate
 *   composite_decay    → final plate fades out
 *   (others)           → no plate visible
 *
 * ## Reduced motion
 *
 * `window.matchMedia('(prefers-reduced-motion: reduce)').matches`
 * — same pattern as Story 5.2's turn-choreography reduced-motion probe.
 * When reduced-motion is active the opacity flips 0→1 (or 1→0)
 * instantly on substate transition (no intermediate frames).
 *
 * ## ADR compliance
 *
 * - ADR-0008 — HTML overlay sidesteps WebGPU/CSS3D path; pure DOM.
 * - ADR-0014 — composite layer lives inside the PBD module directory.
 * - ADR-0015 — class instance subscribed via PBD module's subscribe API;
 *   no global store.
 * - ADR-0019 — same-origin `<img>` loads via the static-CDN; no analytics
 *   beacons; `crossorigin` attribute omitted (same-origin static assets).
 */

import type { Object3D, PerspectiveCamera } from 'three';
import { Vector3 } from 'three';

import { PbdSubstate } from './substates';
import type { PbdSubstateListener } from './index';

/**
 * Bodies that have a composite plate in the layer. Matches the six
 * Story 5.3 plate slugs exactly.
 */
export type PbdPlateBody =
  | 'venus'
  | 'earth'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune';

/**
 * Plate manifest entry — matches the JSON shape produced by
 * `web/scripts/build_pbd_plates.ts` and serialized to
 * `web/public/images/pbd/plate-manifest.json`. Pinned here so the runtime
 * type-check covers the JSON-to-runtime hand-off.
 */
export interface PbdPlateManifestEntry {
  readonly body: PbdPlateBody;
  readonly sourcePia: string;
  readonly filename: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface PbdPlateManifest {
  readonly schemaVersion: number;
  readonly plateSize: number;
  readonly plates: ReadonlyArray<PbdPlateManifestEntry>;
}

/**
 * Per-plate runtime state — opacity tween + the live HTMLImageElement
 * the layer manipulates.
 *
 * The tween is driven by an explicit start time + start opacity so the
 * fade is a pure function of (now - tweenStartMs)/fadeMs. This is more
 * robust than an incremental dt-based step because it tolerates dropped
 * frames and the "first tick after a substate transition" boundary
 * cleanly (the opacity at the first observed wall-clock after a
 * transition is the correctly-interpolated value rather than the
 * pre-transition value).
 */
interface PlateState {
  readonly body: PbdPlateBody;
  readonly img: HTMLImageElement;
  /** Target opacity for the active substate (0 or 1). */
  targetOpacity: number;
  /** Current opacity (driven by the per-frame tween). */
  currentOpacity: number;
  /**
   * Wall-clock ms when the current tween (`from tweenStartOpacity → targetOpacity`)
   * began. Set when `applyActivePlate` flips this plate's targetOpacity.
   */
  tweenStartMs: number;
  /**
   * Opacity at the moment the current tween started (the value to
   * interpolate FROM). When the tween completes (now - tweenStartMs >=
   * fadeMs) `currentOpacity === targetOpacity` and the tween is dormant.
   */
  tweenStartOpacity: number;
}

/**
 * Probe abstraction matching Story 5.2's `ReducedMotionProbe` shape —
 * pure function returning the current reduced-motion preference so the
 * layer is DI-friendly and unit-testable without monkey-patching
 * `window.matchMedia`.
 */
export type ReducedMotionProbe = () => boolean;

/**
 * Wall-clock abstraction — returns milliseconds since some epoch (only
 * the difference between consecutive calls matters). Mirrors Story 5.2's
 * `WallClock`. DI-friendly so unit tests can drive frame timing.
 */
export type WallClock = () => number;

/**
 * Fade duration in milliseconds. Matches `--v-duration-base` from
 * `tokens.css` (200ms per Story 5.3 AC4). Hard-coded as a constant here
 * (NOT read from CSS) because:
 *
 *   1. The fade is driven imperatively from JS, NOT by CSS transitions
 *      — so we don't need to inherit the central token; we just need to
 *      pin the same numeric value so the visual cadence matches the
 *      rest of the design system.
 *   2. Reading `getComputedStyle().getPropertyValue('--v-duration-base')`
 *      requires the document to be in the DOM and the stylesheet to be
 *      parsed — adding a constructor-time DOM dependency we don't need.
 *
 * Reduced-motion overrides this to 0 inside the per-frame tween (per AC5).
 */
export const PBD_FADE_MS_BASE = 200;

/**
 * Default plate display size in CSS pixels (square). Per Story 5.3 AC3
 * the recommended cinematic size is ~96px square at 1280×720 viewport;
 * the source PNGs are 128×128 (next power-of-2 — see
 * `build_pbd_plates.ts` docstring). Rendering at 128 CSS pixels keeps
 * 1:1 pixel mapping at common DPRs; the actual displayed dimension is
 * `style.width: 128px; style.height: 128px;`. Future stories can override
 * via the constructor's `plateSizeCss` option.
 */
export const PBD_PLATE_SIZE_CSS = 128;

/**
 * Manifest URL — fetched at first activation (lazy). Co-located with the
 * plate PNGs under the immutable-cache-headers tree per Story 5.3 AC1.
 */
export const PBD_PLATE_MANIFEST_URL = '/images/pbd/plate-manifest.json';

/**
 * Map from substate to the body whose plate should be visible during
 * that substate. Substates not present in the map have no plate visible.
 *
 * The `composite_active` substate maps to Earth per the Story 5.3 Rule-5
 * amendment in `substates.ts` (Earth-plate hold; the 30-second
 * success-criterion pause).
 */
export const PBD_SUBSTATE_TO_PLATE: Readonly<
  Partial<Record<PbdSubstate, PbdPlateBody>>
> = Object.freeze({
  [PbdSubstate.sweeping_venus]: 'venus',
  [PbdSubstate.sweeping_earth]: 'earth',
  // Story 5.3 Rule-5 amendment: composite_active holds the Earth plate
  // for 30 seconds (the FR28 success-criterion pause).
  [PbdSubstate.composite_active]: 'earth',
  [PbdSubstate.sweeping_jupiter]: 'jupiter',
  [PbdSubstate.sweeping_saturn]: 'saturn',
  [PbdSubstate.sweeping_uranus]: 'uranus',
  [PbdSubstate.sweeping_neptune]: 'neptune',
});

/**
 * Returns the plate body for a substate, or null if no plate is visible.
 * Pure function — exposed for unit tests.
 */
export const plateForSubstate = (substate: PbdSubstate): PbdPlateBody | null =>
  PBD_SUBSTATE_TO_PLATE[substate] ?? null;

/** Construction options for `PbdCompositeLayer`. */
export interface PbdCompositeLayerOptions {
  /** Host element to append the composite container to. Defaults to `document.body`. */
  readonly host?: HTMLElement;
  /** Reduced-motion probe (DI-friendly for tests). */
  readonly reducedMotion?: ReducedMotionProbe;
  /** Wall-clock function (DI-friendly for tests). */
  readonly wallClock?: WallClock;
  /** Optional override for the plate display size in CSS pixels. */
  readonly plateSizeCss?: number;
  /**
   * Resolver returning the live SCAN_PLATFORM Object3D for V1 — used to
   * project the NA boresight to screen-space. The resolver may return
   * null before the spacecraft LOD chain has loaded; the layer holds the
   * plate at its last known position until the resolver returns non-null.
   */
  readonly resolveScanPlatform?: () => Object3D | null;
  /** Override the manifest URL (tests). */
  readonly manifestUrl?: string;
  /** Override the plate base URL (tests). Defaults to `/images/pbd/`. */
  readonly plateBaseUrl?: string;
  /**
   * Pre-loaded plate manifest — when provided the layer skips the
   * runtime `fetch()` and uses these entries directly. Used by unit
   * tests to avoid mocking `fetch`.
   */
  readonly preloadedManifest?: PbdPlateManifest;
}

/**
 * `PbdCompositeLayer` — Story 5.3 AC2 implementation.
 *
 * Construct ONCE in `main.ts`; subscribe to the `PaleBlueDot` module's
 * substate listener; call `update(et, currentSubstate, camera)` from the
 * per-frame loop ONLY while PBD is active (the existing
 * `paleBlueDotActive` gate in `main.ts`).
 *
 * The layer is inactive-frame safe: if `update` is called when no plate
 * is currently visible, the per-frame work is O(plates) cheap pointer
 * walks — no DOM mutation and no DOM read.
 *
 * Per ADR-0015 (no global store): all state lives on the instance.
 */
export class PbdCompositeLayer {
  private readonly host: HTMLElement;
  private readonly container: HTMLDivElement;
  private readonly reducedMotion: ReducedMotionProbe;
  private readonly wallClock: WallClock;
  private readonly plateSizeCss: number;
  private readonly plateBaseUrl: string;
  private readonly manifestUrl: string;
  private readonly resolveScanPlatform: (() => Object3D | null) | null;

  /** Map from body slug to plate state (img + opacity bookkeeping). */
  private readonly plates: Map<PbdPlateBody, PlateState> = new Map();

  /** The currently-visible plate body, or null. Drives AC4 (at most one). */
  private activePlate: PbdPlateBody | null = null;

  /** True after the manifest has been fetched + plate `<img>`s created. */
  private manifestReady: boolean;

  /** True while the manifest fetch is in flight (prevents double-fetch). */
  private manifestLoading = false;

  /** Stored subscriber-unsubscribe function so `dispose()` can detach. */
  private subscriberUnsub: (() => void) | null = null;

  /** Bound listener reference for the subscribe API. */
  private readonly substateListener: PbdSubstateListener;

  /**
   * Persistent scratch Vector3 for boresight projection. MUST be a real
   * `THREE.Vector3` (not a plain `{x,y,z}` object) because `getWorldPosition`
   * calls `.setFromMatrixPosition(matrixWorld)` on it — a method only Vector3
   * provides. Production-build smoke (Story 5.3 AC9) caught the plain-object
   * variant throwing `TypeError: setFromMatrixPosition is not a function`
   * against a real Three.js Object3D; happy-dom test stubs hid the gap.
   */
  private readonly projectScratch: Vector3 = new Vector3();

  constructor(opts: PbdCompositeLayerOptions = {}) {
    this.host = opts.host ?? (typeof document !== 'undefined' ? document.body : ({} as HTMLElement));
    this.reducedMotion =
      opts.reducedMotion ??
      ((): boolean => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
          return false;
        }
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      });
    this.wallClock =
      opts.wallClock ??
      ((): number => {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
          return performance.now();
        }
        return Date.now();
      });
    this.plateSizeCss = opts.plateSizeCss ?? PBD_PLATE_SIZE_CSS;
    this.plateBaseUrl = opts.plateBaseUrl ?? '/images/pbd/';
    this.manifestUrl = opts.manifestUrl ?? PBD_PLATE_MANIFEST_URL;
    this.resolveScanPlatform = opts.resolveScanPlatform ?? null;

    // Build the container div. Absolutely-positioned, full viewport,
    // pointer-events: none so it never intercepts canvas gestures. Per
    // AC8 it remains in the DOM during embed mode (composites are
    // simulation, not chrome).
    this.container = (typeof document !== 'undefined' ? document : ({ createElement: () => ({} as HTMLDivElement) } as unknown as Document))
      .createElement('div');
    this.container.className = 'pbd-composite-layer';
    this.container.setAttribute('data-pbd-composite-layer', '');
    this.container.style.position = 'fixed';
    this.container.style.left = '0';
    this.container.style.top = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'none';
    // z-index: above the canvas but below any HUD chrome (which sits
    // at z-index >= 10 in the Voyager design-system tokens).
    this.container.style.zIndex = '1';

    if (typeof document !== 'undefined' && this.host.appendChild !== undefined) {
      this.host.appendChild(this.container);
    }

    // Manifest may be pre-supplied (unit tests). Otherwise the layer
    // lazily fetches on first activation.
    if (opts.preloadedManifest !== undefined) {
      this.installManifest(opts.preloadedManifest);
      this.manifestReady = true;
    } else {
      this.manifestReady = false;
    }

    // Listener is a stable bound reference so subscribe/unsubscribe can
    // pair correctly.
    this.substateListener = (_from, to, _et) => {
      this.onSubstateTransition(to);
    };
  }

  /**
   * Subscribe the layer to a `PaleBlueDot` module instance's substate
   * stream. Returns the unsubscribe function (also remembered internally
   * for `dispose()`).
   *
   * Calling subscribe twice on the same layer detaches the previous
   * subscription first (defensive against double-wire on hot-reload).
   */
  subscribeTo(paleBlueDot: { subscribe: (l: PbdSubstateListener) => () => void }): () => void {
    if (this.subscriberUnsub !== null) {
      this.subscriberUnsub();
      this.subscriberUnsub = null;
    }
    this.subscriberUnsub = paleBlueDot.subscribe(this.substateListener);
    return this.subscriberUnsub;
  }

  /**
   * Per-frame update — called from `main.ts`'s onFrame block while
   * `paleBlueDotActive === true`. Drives the opacity tween and
   * (when a plate is visible) the screen-space projection.
   *
   * The first call lazily kicks off the manifest fetch — but does NOT
   * block. The layer remains idle (no DOM mutation) until the manifest
   * resolves; substate transitions that arrive before the manifest
   * lands are remembered (`activePlate`) and applied once the plates
   * are present.
   *
   * @param currentSubstate — the PBD module's current substate, read
   *                          via `paleBlueDot.currentSubstate`.
   * @param camera — the Three.js perspective camera used for
   *                 projection. Pass `engine.camera`.
   */
  update(currentSubstate: PbdSubstate, camera: PerspectiveCamera | null): void {
    if (!this.manifestReady && !this.manifestLoading) {
      void this.kickoffManifestLoad();
    }

    // Drive the substate→plate mapping on every tick so the very first
    // activation tick sets `activePlate` even if no substate-transition
    // listener has fired yet (cold-load directly into PBD).
    const expectedPlate = plateForSubstate(currentSubstate);
    if (expectedPlate !== this.activePlate) {
      this.onSubstateTransition(currentSubstate);
    }

    // Tween opacities. Each plate's tween is driven by (now -
    // tweenStartMs)/fadeMs interpolation between tweenStartOpacity and
    // targetOpacity — a pure function of wall-clock time, robust against
    // dropped frames and first-tick boundary conditions.
    const nowMs = this.wallClock();
    const reduced = this.reducedMotion();
    const fadeMs = reduced ? 0 : PBD_FADE_MS_BASE;
    for (const plate of this.plates.values()) {
      if (plate.currentOpacity === plate.targetOpacity) continue;
      let next: number;
      if (fadeMs === 0) {
        next = plate.targetOpacity;
      } else {
        const elapsed = Math.max(0, nowMs - plate.tweenStartMs);
        const t = Math.min(1, elapsed / fadeMs);
        next = plate.tweenStartOpacity + (plate.targetOpacity - plate.tweenStartOpacity) * t;
      }
      plate.currentOpacity = next;
      plate.img.style.opacity = String(next);
      // Hide plates that have fully faded out so embed-mode + ?embed
      // smokes don't see stale display:block at opacity 0 (defensive).
      plate.img.style.visibility = next > 0 ? 'visible' : 'hidden';
    }

    // Project the active plate to screen-space. We project even when
    // `camera === null` so the fallback centering still runs (so the
    // plate doesn't flash at (0, 0) on the first frame after substate
    // entry). `projectActivePlate` short-circuits to `centerPlateInViewport`
    // when the camera or platform node is unavailable.
    if (this.activePlate !== null) {
      if (camera !== null) {
        this.projectActivePlate(camera);
      } else {
        const plate = this.plates.get(this.activePlate);
        if (plate !== undefined) this.centerPlateInViewport(plate.img);
      }
    }
  }

  /**
   * Test-only override of the substate transition path — drives the
   * substate→plate mapping without going through `update()`. Returns
   * the resulting active plate body (or null).
   */
  setActiveSubstateForTest(substate: PbdSubstate): PbdPlateBody | null {
    this.onSubstateTransition(substate);
    return this.activePlate;
  }

  /**
   * Read the current active plate (the body whose plate is visible)
   * — null when no plate is visible. Exposed for unit tests + the
   * Story 5.3 AC9 smoke probe.
   */
  get currentActivePlate(): PbdPlateBody | null {
    return this.activePlate;
  }

  /**
   * Read the current opacity (0..1) of the plate for `body` — exposed
   * for unit tests (AC4 + AC5 verification).
   */
  getPlateOpacity(body: PbdPlateBody): number {
    const plate = this.plates.get(body);
    return plate === undefined ? 0 : plate.currentOpacity;
  }

  /** Read the layer's root container — exposed for tests + the AC9 probe. */
  get rootElement(): HTMLDivElement {
    return this.container;
  }

  /**
   * Detach all subscriptions, remove the container from the DOM, and
   * clear the per-plate state. Idempotent.
   */
  dispose(): void {
    if (this.subscriberUnsub !== null) {
      this.subscriberUnsub();
      this.subscriberUnsub = null;
    }
    if (this.container.parentElement !== null) {
      this.container.parentElement.removeChild(this.container);
    }
    this.plates.clear();
    this.activePlate = null;
  }

  // === Private helpers =====================================================

  private async kickoffManifestLoad(): Promise<void> {
    if (this.manifestReady || this.manifestLoading) return;
    this.manifestLoading = true;
    try {
      const res = await fetch(this.manifestUrl);
      if (!res.ok) {
        console.error(
          `[PbdCompositeLayer] failed to load manifest at ${this.manifestUrl}: HTTP ${res.status}`,
        );
        return;
      }
      const manifest = (await res.json()) as PbdPlateManifest;
      this.installManifest(manifest);
      this.manifestReady = true;
      // If a substate transition arrived while the manifest was in
      // flight, the activePlate field is set; re-apply so the new
      // <img> elements pick up the target opacity.
      if (this.activePlate !== null) {
        this.applyActivePlate(this.activePlate);
      }
    } catch (err) {
      console.error('[PbdCompositeLayer] manifest load threw:', err);
    } finally {
      this.manifestLoading = false;
    }
  }

  private installManifest(manifest: PbdPlateManifest): void {
    for (const entry of manifest.plates) {
      const img = (typeof document !== 'undefined' ? document : ({ createElement: () => ({ style: {} } as unknown as HTMLImageElement) } as unknown as Document))
        .createElement('img');
      img.src = this.plateBaseUrl + entry.filename;
      img.alt = `NASA Voyager 1 narrow-angle plate — ${entry.body} — ${entry.sourcePia}`;
      img.setAttribute('data-target', entry.body);
      img.setAttribute('data-pia', entry.sourcePia);
      img.style.position = 'absolute';
      img.style.width = `${this.plateSizeCss}px`;
      img.style.height = `${this.plateSizeCss}px`;
      img.style.opacity = '0';
      img.style.visibility = 'hidden';
      img.style.pointerEvents = 'none';
      // Block image-smoothing crispness — the plate is a small bitmap;
      // we want pixel-perfect display, not browser-default linear scaling.
      img.style.imageRendering = 'auto';
      // Composite blending: standard alpha-blend. Documented in the
      // class docstring. We do NOT use mix-blend-mode 'screen' or
      // 'plus-lighter' here — the per-pixel star-field already
      // contrasts the plate against black space, and additive blending
      // would oversaturate the iconic Earth pixel.
      img.style.mixBlendMode = 'normal';
      if (this.container.appendChild !== undefined) {
        this.container.appendChild(img);
      }
      this.plates.set(entry.body, {
        body: entry.body,
        img,
        targetOpacity: 0,
        currentOpacity: 0,
        tweenStartMs: this.wallClock(),
        tweenStartOpacity: 0,
      });
    }
  }

  private onSubstateTransition(to: PbdSubstate): void {
    const next = plateForSubstate(to);
    if (next === this.activePlate) return;
    this.activePlate = next;
    this.applyActivePlate(next);
  }

  private applyActivePlate(activeBody: PbdPlateBody | null): void {
    // AC4: at any moment at most ONE plate is visible. The active plate
    // ramps up; all other plates ramp down. The opacity tween itself
    // runs in `update()` based on `tweenStartMs` + `tweenStartOpacity`.
    const nowMs = this.wallClock();
    for (const plate of this.plates.values()) {
      const newTarget = plate.body === activeBody ? 1 : 0;
      if (plate.targetOpacity === newTarget) continue;
      plate.targetOpacity = newTarget;
      plate.tweenStartMs = nowMs;
      plate.tweenStartOpacity = plate.currentOpacity;
    }
  }

  private projectActivePlate(camera: PerspectiveCamera): void {
    const plate = this.activePlate !== null ? this.plates.get(this.activePlate) : null;
    if (plate === undefined || plate === null) return;
    const node = this.resolveScanPlatform !== null ? this.resolveScanPlatform() : null;
    if (node === null) {
      // No platform resolved yet — center the plate as a fallback so
      // it doesn't flash from (0,0) on the first frame after substate
      // entry. Centering matches the visual intent of "small but
      // visible cinematic plate" until the boresight resolves.
      this.centerPlateInViewport(plate.img);
      return;
    }
    // Get the platform's world position. The boresight cone is parented
    // to the platform (Story 3.5) so the platform's world position is
    // the cone's origin; projecting it gives the cone-center pixel.
    // We use position rather than world-direction because the screen
    // anchor IS the cone tip / position, NOT a far-away direction
    // vector — a direction would project to a vanishing-point pixel
    // dependent on camera FOV.
    // MUST be a real Vector3 — `getWorldPosition` calls
    // `setFromMatrixPosition(matrixWorld)` on the target, which exists only
    // on Vector3. The persistent scratch avoids per-frame allocation in the
    // PBD window.
    const pos = this.projectScratch.set(0, 0, 0);
    node.getWorldPosition(pos);
    if (typeof pos.project !== 'function') {
      // happy-dom Object3D stub may not return a real Vector3; fall through
      // to centering so tests don't depend on Three.js internals.
      this.centerPlateInViewport(plate.img);
      return;
    }
    pos.project(camera);
    // After `project()`, NDC coords are in [-1, +1] for points in the
    // camera frustum; |x|>1 or |y|>1 means off-screen; z>1 means behind
    // the camera. At PBD anchor V1 is ~40 AU out; with the cruise-default
    // camera at world origin the boresight projects off-screen. Until a
    // PBD-specific camera framing lands (Story 5.X follow-up), fall back
    // to centering so the cinematic composite reads as "appearing in the
    // scene" per AC3 rather than vanishing off-edge.
    if (
      !Number.isFinite(pos.x) || !Number.isFinite(pos.y) ||
      Math.abs(pos.x) > 1 || Math.abs(pos.y) > 1 || pos.z > 1
    ) {
      this.centerPlateInViewport(plate.img);
      return;
    }
    const projectable = pos;
    // NDC → CSS pixels. Use the live viewport size from
    // `document.documentElement.clientWidth` (matches the canvas's
    // 100vw/100vh sizing in `main.ts:sizeCanvasToWindow`).
    const viewportW = typeof document !== 'undefined'
      ? document.documentElement.clientWidth || window.innerWidth
      : 0;
    const viewportH = typeof document !== 'undefined'
      ? document.documentElement.clientHeight || window.innerHeight
      : 0;
    const cssX = (projectable.x * 0.5 + 0.5) * viewportW - this.plateSizeCss / 2;
    const cssY = (-projectable.y * 0.5 + 0.5) * viewportH - this.plateSizeCss / 2;
    plate.img.style.left = `${cssX}px`;
    plate.img.style.top = `${cssY}px`;
  }

  private centerPlateInViewport(img: HTMLImageElement): void {
    const viewportW = typeof document !== 'undefined'
      ? document.documentElement.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0)
      : 0;
    const viewportH = typeof document !== 'undefined'
      ? document.documentElement.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0)
      : 0;
    const cssX = viewportW / 2 - this.plateSizeCss / 2;
    const cssY = viewportH / 2 - this.plateSizeCss / 2;
    img.style.left = `${cssX}px`;
    img.style.top = `${cssY}px`;
  }
}
