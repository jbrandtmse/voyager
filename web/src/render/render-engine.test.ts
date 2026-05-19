import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RenderEngine,
  type WebGLRendererLike,
  type RendererFactory,
} from './render-engine';
import { worldVec3 } from '../types/branded';
import type { GPUCapabilities } from '../boot/gpu-capability-probe';

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
});
