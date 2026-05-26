import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Group,
  type WebGLRendererParameters,
} from 'three';

import type { WorldVec3 } from '../types/branded';
import { worldVec3 } from '../types/branded';
import { floatingOriginOffset } from '../math/floating-origin';
import {
  DEFAULT_FOV,
  NEAR_PLANE_KM,
  FAR_PLANE_KM,
} from './constants';
import type { GPUCapabilities } from '../boot/gpu-capability-probe';
import { MISSION_START_ET } from '../constants/mission';
import type { ViewFrameService } from '../services/view-frame';
import type { ChapterDirector } from '../services/chapter-director';
import type { TextureTier } from '../services/texture-loader';

/**
 * Story 4.3 AC4 — minimum CelestialBodies surface RenderEngine consumes so
 * `upgradePlanetTexture(bodyId)` can delegate to the actual mesh-owning
 * module without a runtime import cycle. The concrete CelestialBodies class
 * (web/src/render/celestial-bodies.ts) satisfies this shape.
 */
export interface CelestialBodiesLike {
  upgradePlanetTexture(bodyId: number, targetTier?: TextureTier): void;
}

// Minimum surface RenderEngine consumes from ClockManager. The concrete
// ClockManager satisfies this shape; tests inject a stub that exposes
// `simTimeEt` and (optionally) `tick`. Keeps the engine free of a runtime
// import cycle through `services/clock-manager`.
export interface ClockSource {
  readonly simTimeEt: number;
  tick?(realDtMs: number): void;
}

export interface RenderEngineOptions {
  // Override the probe's reverse-Z recommendation; forces logarithmic depth.
  // Sourced from ?force-log-depth=1 at the main.ts call site.
  forceLogDepth?: boolean;
  // Story 1.15 AC1 — ClockManager dependency. When provided, `tick()`
  // reads `simTimeEt` directly from the clock each frame and advances the
  // clock by the real-time delta since the previous tick (so play / pause
  // / scrub / speed multipliers all flow through the canonical clock).
  // When omitted (legacy tests, dev harnesses), the engine emits
  // `MISSION_START_ET` as a static value to onFrame callbacks — no
  // wall-clock derivative.
  clockManager?: ClockSource;
  // Story 4.1 AC2 — ViewFrameService dependency. When provided alongside
  // a `chapterDirector`, `tick()` calls
  // `viewFrame.getTransform(et, chapterDirector.activeChapter)` BEFORE the
  // floating-origin recenter and adds the returned `originOffsetWorld` to
  // the camera world position. The blend is translation-only per ADR-0023.
  // When omitted, the engine falls back to the pure heliocentric path
  // (zero-offset identity) preserving backward compatibility with the
  // Story 1.5 test surface and any caller that hasn't yet wired the
  // encounter substrate.
  viewFrame?: ViewFrameService;
  // Story 4.1 AC2 — ChapterDirector source for the active-chapter query
  // ViewFrame keys off. Engineered as a separate option (rather than
  // bundled with `viewFrame`) so future tests can inject a stub director
  // independently of the view-frame implementation.
  chapterDirector?: ChapterDirector;
}

export type FrameCallback = (et: number) => void;

// Minimum surface the engine needs from a WebGLRenderer — listed explicitly
// so tests can inject a mock without instantiating real WebGL.
export interface WebGLRendererLike {
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(value: number): void;
  setAnimationLoop(cb: ((time: number) => void) | null): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
}

// Injectable so unit tests can substitute a mock renderer in place of the
// real WebGLRenderer constructor.
export type RendererFactory = (params: WebGLRendererParameters) => WebGLRendererLike;

const defaultRendererFactory: RendererFactory = (params) =>
  new WebGLRenderer(params) as unknown as WebGLRendererLike;

export class RenderEngine {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly worldGroup: Group;
  readonly skyboxGroup: Group;

  private readonly capabilities: GPUCapabilities;
  private readonly options: RenderEngineOptions;
  private readonly rendererFactory: RendererFactory;
  private renderer: WebGLRendererLike | null = null;
  private frameCallbacks: FrameCallback[] = [];
  private cameraWorldPos: WorldVec3 = worldVec3(0, 0, 0);
  private readonly clockManager: ClockSource | null;
  // Story 4.1 — viewFrame + chapterDirector are mutable post-construction
  // (via `setViewFrame`) because main.ts constructs RenderEngine BEFORE
  // the manifest lands, but the ViewFrameService needs an
  // EphemerisService which is only available POST-manifest. The setter
  // matches the established `attitudeService = …` post-manifest wiring
  // used by `<v-hud>` (Story 3.6). They may also be supplied directly
  // via the constructor options (tests and the integration AC test do
  // this).
  private viewFrame: ViewFrameService | null;
  private chapterDirector: ChapterDirector | null;
  // Story 4.3 AC4 — CelestialBodies handle. Set post-construction via
  // `setCelestialBodies(...)` because `main.ts` constructs RenderEngine
  // BEFORE the manifest lands (and CelestialBodies needs the celestial-
  // body chunks pre-cached per Story 1.13). `RenderEngine.upgradePlanetTexture`
  // delegates to this handle; without it the call is a silent no-op (test
  // harnesses that don't wire CelestialBodies still drive the engine).
  private celestialBodies: CelestialBodiesLike | null = null;
  // Story 4.2 AC2 — flips to `true` the moment VoyagerCameraController sees
  // a user gesture on the canvas, and back to `false` when the restore
  // animation completes (R shortcut or restore-button click). While true,
  // chapter-driven framing must NOT write to camera.position /
  // camera.quaternion — the controller owns the local transform. The
  // RenderEngine itself reads this flag for the CSS attribute promotion
  // contract (the host element gets a `data-manual-camera` attribute that
  // promotes `<button class="restore-camera">` from display:none to
  // inline-flex per AC4). Wiring to the host attribute is performed by
  // first-paint.ts; the engine just owns the boolean.
  private _manualCameraActive = false;
  private lastTickMs: number | null = null;
  private running = false;
  // BUG-CR-014 fix (2026-05-25): remember whether the engine was running
  // when WebGL context was lost so the `webglcontextrestored` listener
  // knows whether to auto-resume or leave the loop quiescent (e.g. if the
  // app had paused before the context loss).
  private _wasRunningBeforeContextLoss = false;

  // Resolved depth mode, set during init().
  private _depthMode: 'reverse-z' | 'logarithmic' = 'logarithmic';

  constructor(
    capabilities: GPUCapabilities,
    options: RenderEngineOptions = {},
    rendererFactory: RendererFactory = defaultRendererFactory,
  ) {
    this.capabilities = capabilities;
    this.options = options;
    this.rendererFactory = rendererFactory;
    this.clockManager = options.clockManager ?? null;
    this.viewFrame = options.viewFrame ?? null;
    this.chapterDirector = options.chapterDirector ?? null;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
      DEFAULT_FOV,
      1, // aspect — overwritten on init()/resize
      NEAR_PLANE_KM,
      FAR_PLANE_KM,
    );

    this.worldGroup = new Group();
    this.worldGroup.name = 'WorldGroup';
    this.skyboxGroup = new Group();
    this.skyboxGroup.name = 'SkyboxGroup';

    this.scene.add(this.worldGroup);
    this.scene.add(this.skyboxGroup);
  }

  get depthMode(): 'reverse-z' | 'logarithmic' {
    return this._depthMode;
  }

  /**
   * Story 4.2 AC2 — public getter mirroring `setManualCameraActive`. Read
   * by `<button class="restore-camera">` mount logic in `first-paint.ts`
   * (the button is `display: none` by default and promotes to
   * `inline-flex` when this flag is `true` via a `data-manual-camera`
   * attribute on the host element). Defaults to `false` (chapter-driven
   * framing owns the camera at boot).
   */
  get manualCameraActive(): boolean {
    return this._manualCameraActive;
  }

  /**
   * Story 4.2 AC2 — flip the manual-camera ownership flag. Called by
   * `VoyagerCameraController.onPointerDown` (true) and by the controller's
   * restore-animation completion path (false). Listeners (passed via
   * `onManualCameraChange`) fire only when the value actually transitions,
   * so an idempotent `setManualCameraActive(true)` on a still-active
   * gesture stream doesn't churn the host's `data-manual-camera`
   * attribute or trigger redundant DOM mutations.
   */
  setManualCameraActive(value: boolean): void {
    if (this._manualCameraActive === value) return;
    this._manualCameraActive = value;
    for (const cb of this.manualCameraListeners) {
      try {
        cb(value);
      } catch (err) {
        console.error('[RenderEngine] manualCamera listener threw:', err);
      }
    }
  }

  /**
   * Story 4.2 AC2 + AC4 — subscribe to manual-camera transitions. Returns
   * an unsubscribe function. `first-paint.ts` subscribes so the host's
   * `data-manual-camera` attribute (and therefore the restore button's
   * `display: inline-flex` rule) tracks the flag. Listeners that throw
   * are logged and swallowed (mirroring the ChapterDirector + ChunkLoader
   * notify-hardening pattern).
   */
  onManualCameraChange(cb: (value: boolean) => void): () => void {
    this.manualCameraListeners.push(cb);
    return () => {
      const idx = this.manualCameraListeners.indexOf(cb);
      if (idx >= 0) this.manualCameraListeners.splice(idx, 1);
    };
  }

  private manualCameraListeners: Array<(value: boolean) => void> = [];

  /**
   * Story 3.3 — public read-only accessor for the underlying WebGLRenderer.
   * Required so consumers (e.g. `SpacecraftModels`) can pass it to
   * `KTX2Loader.detectSupport(renderer)` per ADR-0006. The renderer is
   * `null` before `init()` has been called.
   */
  getRenderer(): WebGLRendererLike | null {
    return this.renderer;
  }

  init(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    const useReverseZ =
      this.capabilities.supportsReverseZ && !this.options.forceLogDepth;

    // AC4: emit the fallback warn only when the GPU genuinely lacks reverse-Z.
    // A user-driven ?force-log-depth=1 override is an opt-in, not a capability
    // gap — silently honor it without the misleading "unavailable" warning.
    if (!this.capabilities.supportsReverseZ) {
      console.warn(
        '[RenderEngine] Reverse-Z unavailable; using logarithmic depth fallback.',
      );
    }

    const params: WebGLRendererParameters = {
      canvas: canvas as HTMLCanvasElement,
      depth: true,
      antialias: true,
      logarithmicDepthBuffer: !useReverseZ,
      reversedDepthBuffer: useReverseZ,
    };

    this.renderer = this.rendererFactory(params);
    this._depthMode = useReverseZ ? 'reverse-z' : 'logarithmic';

    const w = (canvas as HTMLCanvasElement).clientWidth || (canvas as HTMLCanvasElement).width || 1;
    const h = (canvas as HTMLCanvasElement).clientHeight || (canvas as HTMLCanvasElement).height || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(
      typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
    );
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.lastTickMs = null;

    // BUG-CR-014 fix (2026-05-25): WebGL context-loss / restore handling.
    // Without these listeners, a transient GPU context loss (driver reset,
    // tab backgrounding, MCP-controlled browser switching pages) leaves the
    // canvas blank and the rAF loop firing against a dead context — the
    // user sees only the HTML chrome on a black/white background until
    // they reload manually. Calling `event.preventDefault()` on
    // `webglcontextlost` is what tells the browser to attempt restoration;
    // Three.js's WebGLRenderer re-uploads textures + re-binds programs on
    // its own once the new context fires. We pause the animation loop
    // during the gap so frame callbacks don't run with no GPU backing, and
    // resume it on restore. HTMLCanvasElement only — OffscreenCanvas does
    // not dispatch these events.
    if (
      typeof HTMLCanvasElement !== 'undefined' &&
      canvas instanceof HTMLCanvasElement
    ) {
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        console.warn(
          '[RenderEngine] WebGL context lost; pausing animation loop ' +
            '(will auto-resume on restore).',
        );
        const wasRunning = this.running;
        this.stop();
        // Stash whether we were running so the restore path knows whether
        // to call start() again (vs. a manual stop the app issued earlier).
        this._wasRunningBeforeContextLoss = wasRunning;
      });
      canvas.addEventListener('webglcontextrestored', () => {
        console.warn('[RenderEngine] WebGL context restored; resuming.');
        if (this._wasRunningBeforeContextLoss) {
          this.start();
        }
      });
    }
  }

  setCameraPosition(world: WorldVec3): void {
    this.cameraWorldPos = world;
    // The camera itself sits at render-space origin (the floating-origin
    // recenter handles the world translation). We do NOT move the camera
    // in render-space; instead we move WorldGroup by -cameraWorldPos.
    this.camera.position.set(0, 0, 0);
  }

  /**
   * Story 4.1 AC2 — wire the ViewFrameService + ChapterDirector
   * post-construction. `main.ts` constructs RenderEngine before the
   * manifest lands (so EphemerisService doesn't exist yet); once the
   * manifest resolves and ViewFrameService is constructed, this setter
   * promotes the engine into the encounter-blend path. Passing `null` for
   * either argument reverts to the heliocentric (identity) path.
   *
   * Idempotent — calling with the same instance is a no-op. May be called
   * any number of times across the engine's lifetime.
   */
  setViewFrame(
    viewFrame: ViewFrameService | null,
    chapterDirector: ChapterDirector | null,
  ): void {
    this.viewFrame = viewFrame;
    this.chapterDirector = chapterDirector;
  }

  /**
   * Story 4.3 AC4 — wire the CelestialBodies handle post-construction.
   * Mirror of `setViewFrame`: `main.ts` constructs RenderEngine before
   * the celestial-body chunks land in the ChunkLoader cache (and therefore
   * before CelestialBodies can be constructed). Once the chunks resolve
   * and `new CelestialBodies({textureLoader})` is constructed, this setter
   * promotes the engine into the texture-upgrade-capable state.
   *
   * Idempotent — calling with the same instance is a no-op. Passing `null`
   * reverts to the silent-no-op posture (used by `dispose()` if a future
   * teardown path needs it).
   */
  setCelestialBodies(handle: CelestialBodiesLike | null): void {
    this.celestialBodies = handle;
  }

  /**
   * Story 4.3 AC4 — async-load the higher-tier KTX2 texture for a single
   * planet and atomically swap it into the body's material. Delegates to
   * `CelestialBodies.upgradePlanetTexture(bodyId, targetTier)` when wired;
   * a silent no-op otherwise.
   *
   * GPU-memory gate (NFR-C6): callers MUST check
   * `capabilities.adequateForEightK` before requesting `'8k'`. The engine
   * does NOT enforce the gate here (separation of concerns: the FSM
   * subscriber is the right place to gate the request, so a low-end-GPU
   * user simply never receives an `upgradePlanetTexture(_, '8k')` call).
   *
   * The default `targetTier` is `'4k'` because the gas-giant texture
   * sources cap at 4K resolution — see the docstring on
   * `GAS_GIANT_JOBS` in `web/scripts/build_textures.ts` for the Rule-5
   * amendment that documents the procurement-time discovery: Solar
   * System Scope's "8K" files are actually 4K dimensions, and no NASA /
   * USGS source ships genuinely 8K gas-giant equirectangular maps. The
   * runtime `'8k'` request still works (tier-ordering accepts it), but
   * no caller in Story 4.3 exercises that path.
   */
  upgradePlanetTexture(bodyId: number, targetTier: TextureTier = '4k'): void {
    if (this.celestialBodies === null) return;
    this.celestialBodies.upgradePlanetTexture(bodyId, targetTier);
  }

  /**
   * Story 4.3 AC4 — public accessor for the GPU capability snapshot.
   * Used by the SOI-entry subscriber wiring in main.ts (or the lead's
   * integration test) to gate `upgradePlanetTexture` calls on
   * `adequateForEightK`.
   */
  getCapabilities(): GPUCapabilities {
    return this.capabilities;
  }

  setSize(width: number, height: number): void {
    if (!this.renderer) return;
    this.renderer.setSize(width, height, false);
    // Story 2.0 AC9 — re-apply devicePixelRatio so dragging the window
    // between monitors with different DPRs takes effect without a reload.
    // Gated on `typeof devicePixelRatio !== 'undefined'` so the node/jsdom
    // test path remains operative.
    if (typeof devicePixelRatio !== 'undefined') {
      this.renderer.setPixelRatio(devicePixelRatio);
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  onFrame(callback: FrameCallback): () => void {
    this.frameCallbacks.push(callback);
    return () => this.offFrame(callback);
  }

  offFrame(callback: FrameCallback): void {
    const idx = this.frameCallbacks.indexOf(callback);
    if (idx >= 0) this.frameCallbacks.splice(idx, 1);
  }

  start(): void {
    if (!this.renderer || this.running) return;
    this.running = true;
    this.renderer.setAnimationLoop(() => this.tick());
  }

  stop(): void {
    if (!this.renderer) return;
    this.renderer.setAnimationLoop(null);
    this.running = false;
  }

  dispose(): void {
    this.stop();
    this.frameCallbacks = [];
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }

  // Public for testability — exercised by tests that want a deterministic
  // single-frame step instead of relying on the rAF loop.
  tick(): void {
    if (!this.renderer) return;

    // 1) advance the wired ClockManager by the wall-clock delta since the
    //    previous tick (so play / pause / setRate / scrubTo all flow
    //    through the canonical clock), then read its `simTimeEt` for the
    //    onFrame fan-out. When no clock is wired, fall back to
    //    MISSION_START_ET so onFrame consumers still receive a finite ET.
    const now = nowMs();
    if (this.clockManager !== null) {
      if (this.lastTickMs !== null && typeof this.clockManager.tick === 'function') {
        this.clockManager.tick(now - this.lastTickMs);
      }
    }
    this.lastTickMs = now;
    const et =
      this.clockManager !== null ? this.clockManager.simTimeEt : MISSION_START_ET;

    // 2) Story 4.1 AC2 — compose the view-frame origin offset INTO the
    //    camera world position before the floating-origin recenter. The
    //    blend is translation-only per ADR-0023; no camera rotation is
    //    touched here (VoyagerCameraController owns camera orientation
    //    per Story 4.2). When viewFrame/chapterDirector are not wired
    //    (legacy boot path or tests), the path is identity.
    let renderCameraPos: WorldVec3 = this.cameraWorldPos;
    if (this.viewFrame !== null) {
      const active =
        this.chapterDirector !== null ? this.chapterDirector.activeChapter : null;
      const transform = this.viewFrame.getTransform(et, active);
      const off = transform.originOffsetWorld;
      // Identity branch short-circuits the array allocation — vast
      // majority of frames are cruise.
      if (off[0] !== 0 || off[1] !== 0 || off[2] !== 0) {
        renderCameraPos = worldVec3(
          this.cameraWorldPos[0] + off[0],
          this.cameraWorldPos[1] + off[1],
          this.cameraWorldPos[2] + off[2],
        );
      }
    }

    // 3) compute floating-origin offset from (possibly view-frame-shifted)
    //    camera world position
    const offset = floatingOriginOffset(renderCameraPos);

    // 4) set WorldGroup.position = -renderCameraPos (the only place a
    //    RenderVec3 escapes into Three.js scene-graph state)
    this.worldGroup.position.set(offset[0], offset[1], offset[2]);
    // SkyboxGroup intentionally NOT recentered (Architecture lines 374–376).

    // 5) fire onFrame callbacks (HUD updates bypass Lit, Architecture line 424)
    for (const cb of this.frameCallbacks) {
      cb(et);
    }

    // 6) render
    this.renderer.render(this.scene, this.camera);
  }
}

const nowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};
