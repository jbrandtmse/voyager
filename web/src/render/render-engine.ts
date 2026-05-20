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
  private lastTickMs: number | null = null;
  private running = false;

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
  }

  setCameraPosition(world: WorldVec3): void {
    this.cameraWorldPos = world;
    // The camera itself sits at render-space origin (the floating-origin
    // recenter handles the world translation). We do NOT move the camera
    // in render-space; instead we move WorldGroup by -cameraWorldPos.
    this.camera.position.set(0, 0, 0);
  }

  setSize(width: number, height: number): void {
    if (!this.renderer) return;
    this.renderer.setSize(width, height, false);
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

    // 2) compute floating-origin offset from camera world position
    const offset = floatingOriginOffset(this.cameraWorldPos);

    // 3) set WorldGroup.position = -cameraWorldPos (the only place a
    //    RenderVec3 escapes into Three.js scene-graph state)
    this.worldGroup.position.set(offset[0], offset[1], offset[2]);
    // SkyboxGroup intentionally NOT recentered (Architecture lines 374–376).

    // 4) fire onFrame callbacks (HUD updates bypass Lit, Architecture line 424)
    for (const cb of this.frameCallbacks) {
      cb(et);
    }

    // 5) render
    this.renderer.render(this.scene, this.camera);
  }
}

const nowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};
