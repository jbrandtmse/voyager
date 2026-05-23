import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RenderEngine,
  type WebGLRendererLike,
  type RendererFactory,
} from './render-engine';
import { worldVec3 } from '../types/branded';
import type { GPUCapabilities } from '../boot/gpu-capability-probe';
import { ClockManager } from '../services/clock-manager';
import { MISSION_START_ET } from '../constants/mission';

// Build a fake canvas with the minimum surface RenderEngine reads during init.
const makeFakeCanvas = (width = 800, height = 600): HTMLCanvasElement =>
  ({
    clientWidth: width,
    clientHeight: height,
    width,
    height,
  }) as unknown as HTMLCanvasElement;

// Build a mock WebGLRenderer + factory + capture handle.
interface RendererCapture {
  factory: RendererFactory;
  paramsSeen: { logarithmicDepthBuffer?: boolean; reversedDepthBuffer?: boolean }[];
  renderer: WebGLRendererLike & {
    renderCalls: number;
    animationLoopCb: ((time: number) => void) | null;
    disposed: boolean;
    sizeCalls: { w: number; h: number }[];
  };
}

const makeRendererCapture = (): RendererCapture => {
  const capture: RendererCapture = {
    factory: () => capture.renderer,
    paramsSeen: [],
    renderer: {
      renderCalls: 0,
      animationLoopCb: null,
      disposed: false,
      sizeCalls: [],
      setSize(w: number, h: number) {
        capture.renderer.sizeCalls.push({ w, h });
      },
      setPixelRatio() {
        /* no-op */
      },
      setAnimationLoop(cb) {
        capture.renderer.animationLoopCb = cb;
      },
      render() {
        capture.renderer.renderCalls += 1;
      },
      dispose() {
        capture.renderer.disposed = true;
      },
    },
  };
  // Wrap factory to also record the params.
  const origFactory = capture.factory;
  capture.factory = (params) => {
    capture.paramsSeen.push({
      logarithmicDepthBuffer: params.logarithmicDepthBuffer,
      reversedDepthBuffer: params.reversedDepthBuffer,
    });
    return origFactory(params);
  };
  return capture;
};

const CAPS_REVERSE_Z_OK: GPUCapabilities = {
  supportsReverseZ: true,
  supportsFloatDepth: true,
  recommendedTextureTier: '8k',
};

const CAPS_NO_REVERSE_Z: GPUCapabilities = {
  supportsReverseZ: false,
  supportsFloatDepth: false,
  recommendedTextureTier: '4k',
};

describe('RenderEngine — scene graph topology', () => {
  it('init() creates WorldGroup + SkyboxGroup as direct children of scene', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    expect(engine.scene.children).toContain(engine.worldGroup);
    expect(engine.scene.children).toContain(engine.skyboxGroup);
    expect(engine.worldGroup.name).toBe('WorldGroup');
    expect(engine.skyboxGroup.name).toBe('SkyboxGroup');
    engine.dispose();
  });

  it('camera has the architecture-specified config (FOV, near, far)', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    expect(engine.camera.fov).toBe(50);
    expect(engine.camera.near).toBe(1e-6);
    // Far ≥ 165 AU; literal is 300 AU in km.
    expect(engine.camera.far).toBeGreaterThan(165 * 149597870.7);
    engine.dispose();
  });
});

describe('RenderEngine — reverse-Z config', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('enables reversedDepthBuffer=true when capability is true and not forced to log', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    expect(cap.paramsSeen[0].reversedDepthBuffer).toBe(true);
    expect(cap.paramsSeen[0].logarithmicDepthBuffer).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(engine.depthMode).toBe('reverse-z');
    engine.dispose();
  });

  it('falls back to logarithmicDepthBuffer=true when capability is false; emits one warn', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_NO_REVERSE_Z, {}, cap.factory);
    engine.init(makeFakeCanvas());
    expect(cap.paramsSeen[0].logarithmicDepthBuffer).toBe(true);
    expect(cap.paramsSeen[0].reversedDepthBuffer).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/Reverse-Z unavailable/);
    expect(engine.depthMode).toBe('logarithmic');
    engine.dispose();
  });

  it('forceLogDepth=true overrides reverse-Z capability', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(
      CAPS_REVERSE_Z_OK,
      { forceLogDepth: true },
      cap.factory,
    );
    engine.init(makeFakeCanvas());
    expect(cap.paramsSeen[0].logarithmicDepthBuffer).toBe(true);
    expect(cap.paramsSeen[0].reversedDepthBuffer).toBe(false);
    expect(engine.depthMode).toBe('logarithmic');
    engine.dispose();
  });
});

describe('RenderEngine — floating-origin per-frame recenter', () => {
  it('tick() sets WorldGroup.position = -cameraWorldPos', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    engine.setCameraPosition(worldVec3(1000, -500, 2000));
    engine.tick();
    expect(engine.worldGroup.position.x).toBeCloseTo(-1000, 5);
    expect(engine.worldGroup.position.y).toBeCloseTo(500, 5);
    expect(engine.worldGroup.position.z).toBeCloseTo(-2000, 5);
    engine.dispose();
  });

  it('camera stays at render-space origin after setCameraPosition (the recenter strategy)', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    engine.setCameraPosition(worldVec3(1e9, 1e9, 1e9));
    engine.tick();
    expect(engine.camera.position.x).toBe(0);
    expect(engine.camera.position.y).toBe(0);
    expect(engine.camera.position.z).toBe(0);
    engine.dispose();
  });

  it('SkyboxGroup is NOT moved by the recenter (Architecture lines 374–376)', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    engine.setCameraPosition(worldVec3(1e6, 1e6, 1e6));
    engine.tick();
    expect(engine.skyboxGroup.position.x).toBe(0);
    expect(engine.skyboxGroup.position.y).toBe(0);
    expect(engine.skyboxGroup.position.z).toBe(0);
    engine.dispose();
  });
});

describe('RenderEngine — onFrame hook', () => {
  it('onFrame callback fires once per tick with an ET value', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    const cb = vi.fn();
    engine.onFrame(cb);
    engine.tick();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(typeof cb.mock.calls[0][0]).toBe('number');
    engine.dispose();
  });

  it('offFrame removes the callback', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    const cb = vi.fn();
    engine.onFrame(cb);
    engine.offFrame(cb);
    engine.tick();
    expect(cb).not.toHaveBeenCalled();
    engine.dispose();
  });

  it('onFrame returns an "off" function as a convenience', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    const cb = vi.fn();
    const off = engine.onFrame(cb);
    off();
    engine.tick();
    expect(cb).not.toHaveBeenCalled();
    engine.dispose();
  });

  it('callbacks fire BEFORE render() (architecture: HUD reads post-recenter state)', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    const order: string[] = [];
    engine.onFrame(() => order.push('cb'));
    // Wrap renderer.render to record order.
    const origRender = cap.renderer.render.bind(cap.renderer);
    cap.renderer.render = (...args) => {
      order.push('render');
      return origRender(...args);
    };
    engine.tick();
    expect(order).toEqual(['cb', 'render']);
    engine.dispose();
  });
});

// ─── Story 1.15 AC1 / T2 — RenderEngine ← ClockManager integration ────────
describe('RenderEngine — ClockManager wire-up (Story 1.15 AC1)', () => {
  it('onFrame ET reads from clockManager.simTimeEt, not a wall-clock derivative', () => {
    const cap = makeRendererCapture();
    const clock = new ClockManager();
    const targetEt = MISSION_START_ET + 1234.5;
    clock.scrubTo(targetEt);
    const engine = new RenderEngine(
      CAPS_REVERSE_Z_OK,
      { clockManager: clock },
      cap.factory,
    );
    engine.init(makeFakeCanvas());
    const seen: number[] = [];
    engine.onFrame((et) => seen.push(et));
    engine.tick();
    // Clock is paused (scrubTo pauses); first tick has no prior wall-clock
    // delta to advance against. ET must equal the scrubbed value exactly.
    expect(seen[0]).toBe(targetEt);
    engine.dispose();
  });

  it('paused clock: successive ticks emit the same ET (no wall-clock drift)', async () => {
    const cap = makeRendererCapture();
    const clock = new ClockManager();
    const fixedEt = MISSION_START_ET + 9_999;
    clock.scrubTo(fixedEt);
    expect(clock.playing).toBe(false);
    const engine = new RenderEngine(
      CAPS_REVERSE_Z_OK,
      { clockManager: clock },
      cap.factory,
    );
    engine.init(makeFakeCanvas());
    const seen: number[] = [];
    engine.onFrame((et) => seen.push(et));
    engine.tick();
    // Force a measurable wall-clock gap. If the engine were still using
    // the placeholder formula, the second tick's ET would diverge.
    await new Promise((r) => setTimeout(r, 25));
    engine.tick();
    expect(seen[0]).toBe(fixedEt);
    expect(seen[1]).toBe(fixedEt);
    engine.dispose();
  });

  it('playing clock: tick() advances simTimeEt by playbackRate × wall-dt', async () => {
    const cap = makeRendererCapture();
    const clock = new ClockManager();
    clock.scrubTo(MISSION_START_ET);
    clock.setRate(1000); // 1000× — easy to see motion in a 50 ms wall window.
    clock.play();
    const engine = new RenderEngine(
      CAPS_REVERSE_Z_OK,
      { clockManager: clock },
      cap.factory,
    );
    engine.init(makeFakeCanvas());
    const seen: number[] = [];
    engine.onFrame((et) => seen.push(et));
    engine.tick(); // seeds lastTickMs; clock not yet advanced.
    expect(seen[0]).toBe(MISSION_START_ET);
    await new Promise((r) => setTimeout(r, 50));
    engine.tick();
    expect(seen[1]).toBeGreaterThan(seen[0]);
    // 1000× over ≥50 ms wall ⇒ at least ~50 sim-sec advance. Use a loose
    // lower bound so timer-scheduler jitter on slow CI can't make this flaky.
    expect(seen[1] - seen[0]).toBeGreaterThanOrEqual(10);
    engine.dispose();
  });

  it('without a clock: tick() emits MISSION_START_ET (no placeholder wall-clock formula)', async () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    const seen: number[] = [];
    engine.onFrame((et) => seen.push(et));
    engine.tick();
    await new Promise((r) => setTimeout(r, 30));
    engine.tick();
    expect(seen[0]).toBe(MISSION_START_ET);
    expect(seen[1]).toBe(MISSION_START_ET);
    engine.dispose();
  });

  it('inverted wire (no clock injected) does NOT match the post-fix expected value', () => {
    // Confirms the test would fail on the broken code: if the engine kept
    // its placeholder ET formula (V2_LAUNCH_ET + wall-clock seconds), the
    // emitted ET would equal neither the scrubbed target nor MISSION_START_ET.
    // Here we assert: omitting the clock means the engine does NOT echo the
    // scrubbed target back — i.e. the wire-up depends on the option being
    // passed in. This catches the regression where someone removes the
    // clock from RenderEngineOptions or fails to thread it through.
    const cap = makeRendererCapture();
    const clock = new ClockManager();
    clock.scrubTo(MISSION_START_ET + 42);
    const engine = new RenderEngine(
      CAPS_REVERSE_Z_OK,
      {}, // intentionally NO clock — broken wire-up
      cap.factory,
    );
    engine.init(makeFakeCanvas());
    const seen: number[] = [];
    engine.onFrame((et) => seen.push(et));
    engine.tick();
    expect(seen[0]).not.toBe(MISSION_START_ET + 42);
    engine.dispose();
  });
});

describe('RenderEngine — lifecycle', () => {
  it('start() registers an animation loop; stop() clears it', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    engine.start();
    expect(cap.renderer.animationLoopCb).not.toBeNull();
    engine.stop();
    expect(cap.renderer.animationLoopCb).toBeNull();
    engine.dispose();
  });

  it('dispose() calls renderer.dispose() and clears callbacks', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    const cb = vi.fn();
    engine.onFrame(cb);
    engine.dispose();
    expect(cap.renderer.disposed).toBe(true);
  });

  it('setSize() updates renderer + camera aspect', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas(800, 600));
    engine.setSize(1600, 800);
    expect(engine.camera.aspect).toBeCloseTo(2);
    expect(
      cap.renderer.sizeCalls.some((s) => s.w === 1600 && s.h === 800),
    ).toBe(true);
    engine.dispose();
  });

  // Story 2.0 AC9 — setSize() must re-apply devicePixelRatio so dragging
  // between monitors with different DPRs takes effect immediately.
  it('setSize() re-applies devicePixelRatio (Story 2.0 AC9)', () => {
    const cap = makeRendererCapture();
    const setPixelRatioSpy = vi.fn();
    cap.renderer.setPixelRatio = setPixelRatioSpy;
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas(800, 600));
    // init() may call setPixelRatio once already — clear, then exercise resize.
    setPixelRatioSpy.mockClear();
    const originalDpr = globalThis.devicePixelRatio;
    Object.defineProperty(globalThis, 'devicePixelRatio', {
      value: 2.5,
      configurable: true,
    });
    try {
      engine.setSize(1024, 768);
      expect(setPixelRatioSpy).toHaveBeenCalledTimes(1);
      expect(setPixelRatioSpy).toHaveBeenCalledWith(2.5);
    } finally {
      Object.defineProperty(globalThis, 'devicePixelRatio', {
        value: originalDpr,
        configurable: true,
      });
    }
    engine.dispose();
  });
});

// =============================================================================
// Story 4.1 AC2 — ViewFrameService composition inside RenderEngine.tick().
// =============================================================================

describe('RenderEngine — Story 4.1 AC2 ViewFrame composition', () => {
  it('no viewFrame wired (default) — worldGroup.position unchanged', () => {
    // Backward-compat probe: the legacy boot path / Story 1.5 tests still
    // construct RenderEngine without a ViewFrameService. The floating-origin
    // recenter must remain `-cameraWorldPos` exactly.
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());
    engine.setCameraPosition(worldVec3(100, 200, 300));
    engine.tick();
    expect(engine.worldGroup.position.x).toBeCloseTo(-100, 5);
    expect(engine.worldGroup.position.y).toBeCloseTo(-200, 5);
    expect(engine.worldGroup.position.z).toBeCloseTo(-300, 5);
    engine.dispose();
  });

  it('viewFrame returns identity (cruise) — worldGroup.position == -cameraWorldPos', () => {
    const cap = makeRendererCapture();
    const stubViewFrame = {
      getTransform: () => ({ originOffsetWorld: worldVec3(0, 0, 0) }),
    };
    const stubDirector = { activeChapter: null };
    const engine = new RenderEngine(
      CAPS_REVERSE_Z_OK,
      {
        viewFrame:
          stubViewFrame as unknown as import('../services/view-frame').ViewFrameService,
        chapterDirector:
          stubDirector as unknown as import('../services/chapter-director').ChapterDirector,
      },
      cap.factory,
    );
    engine.init(makeFakeCanvas());
    engine.setCameraPosition(worldVec3(100, 200, 300));
    engine.tick();
    expect(engine.worldGroup.position.x).toBeCloseTo(-100, 5);
    expect(engine.worldGroup.position.y).toBeCloseTo(-200, 5);
    expect(engine.worldGroup.position.z).toBeCloseTo(-300, 5);
    engine.dispose();
  });

  it('viewFrame returns non-zero offset — worldGroup.position composes the shift', () => {
    // The contract: renderCameraPos = cameraWorldPos + originOffsetWorld;
    // worldGroup.position = -renderCameraPos. So a positive +500 X shift
    // pulls the world (-500 - 100) = -600 on X.
    const cap = makeRendererCapture();
    const stubViewFrame = {
      getTransform: () => ({
        originOffsetWorld: worldVec3(500, -700, 1100),
      }),
    };
    const stubDirector = { activeChapter: null };
    const engine = new RenderEngine(
      CAPS_REVERSE_Z_OK,
      {
        viewFrame:
          stubViewFrame as unknown as import('../services/view-frame').ViewFrameService,
        chapterDirector:
          stubDirector as unknown as import('../services/chapter-director').ChapterDirector,
      },
      cap.factory,
    );
    engine.init(makeFakeCanvas());
    engine.setCameraPosition(worldVec3(100, 200, 300));
    engine.tick();
    expect(engine.worldGroup.position.x).toBeCloseTo(-(100 + 500), 5);
    expect(engine.worldGroup.position.y).toBeCloseTo(-(200 + -700), 5);
    expect(engine.worldGroup.position.z).toBeCloseTo(-(300 + 1100), 5);
    engine.dispose();
  });

  it('viewFrame.getTransform receives the current ET and activeChapter', () => {
    // Pin the wire-up contract — RenderEngine must pass the
    // ChapterDirector's currently-held chapter to ViewFrame, not null or
    // a stale value.
    const cap = makeRendererCapture();
    let lastEt = -1;
    let lastChapter: unknown = 'sentinel';
    const fakeChapter = { slug: 'v1-jupiter', targetBody: 5 } as unknown;
    const stubViewFrame = {
      getTransform: (et: number, chapter: unknown) => {
        lastEt = et;
        lastChapter = chapter;
        return { originOffsetWorld: worldVec3(0, 0, 0) };
      },
    };
    const stubDirector = { activeChapter: fakeChapter };
    const engine = new RenderEngine(
      CAPS_REVERSE_Z_OK,
      {
        viewFrame:
          stubViewFrame as unknown as import('../services/view-frame').ViewFrameService,
        chapterDirector:
          stubDirector as unknown as import('../services/chapter-director').ChapterDirector,
      },
      cap.factory,
    );
    engine.init(makeFakeCanvas());
    engine.tick();
    expect(typeof lastEt).toBe('number');
    expect(lastChapter).toBe(fakeChapter);
    engine.dispose();
  });
});
