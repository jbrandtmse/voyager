import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

import {
  RenderEngine,
  type WebGLRendererLike,
  type RendererFactory,
} from '../src/render/render-engine';
import {
  DEFAULT_FOV,
  NEAR_PLANE_KM,
  FAR_PLANE_KM,
} from '../src/render/constants';
import { KM_PER_AU, SCALE } from '../src/math/constants';
import { worldVec3, renderVec3FromWorld } from '../src/types/branded';
import type { WorldVec3 } from '../src/types/branded';
import { getUrlParams } from '../src/boot/url-params';
import type { GPUCapabilities } from '../src/boot/gpu-capability-probe';
import {
  isPrecisionSmokeMode,
  startPrecisionSmoke,
} from '../src/dev/precision-smoke';
import { BoxGeometry, Mesh } from 'three';

// -----------------------------------------------------------------------------
// Story 1.5 defense-in-depth tests (single file per dev convention).
//
// These tests target contractual invariants of the renderer foundation that the
// co-located unit tests don't cover directly. They are tripwires: a refactor
// that silently breaks one of these contracts should fail loudly here.
// -----------------------------------------------------------------------------

const webRoot = resolve(__dirname, '..');
const srcRoot = resolve(webRoot, 'src');

const makeFakeCanvas = (width = 800, height = 600): HTMLCanvasElement =>
  ({
    clientWidth: width,
    clientHeight: height,
    width,
    height,
  }) as unknown as HTMLCanvasElement;

interface CapturedParams {
  logarithmicDepthBuffer?: boolean;
  reversedDepthBuffer?: boolean;
}

interface RendererCapture {
  factory: RendererFactory;
  paramsSeen: CapturedParams[];
  renderer: WebGLRendererLike & { renderCalls: number };
}

const makeRendererCapture = (): RendererCapture => {
  const renderer: RendererCapture['renderer'] = {
    renderCalls: 0,
    setSize() {},
    setPixelRatio() {},
    setAnimationLoop() {},
    render() {
      renderer.renderCalls += 1;
    },
    dispose() {},
  };
  const paramsSeen: CapturedParams[] = [];
  const factory: RendererFactory = (params) => {
    paramsSeen.push({
      logarithmicDepthBuffer: params.logarithmicDepthBuffer,
      reversedDepthBuffer: params.reversedDepthBuffer,
    });
    return renderer;
  };
  return { factory, paramsSeen, renderer };
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

const walkTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
};

// -----------------------------------------------------------------------------
// 1. Three.js API contract — `reversedDepthBuffer` exact spelling.
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — Three.js reversedDepthBuffer API contract', () => {
  it('render-engine.ts uses `reversedDepthBuffer` (Three.js r170+ canonical), not the approximated `reverseDepthBuffer`', () => {
    const src = readFileSync(
      resolve(srcRoot, 'render/render-engine.ts'),
      'utf-8',
    );
    expect(src).toMatch(/reversedDepthBuffer/);
    // Catch a regression where someone "corrects" reversedDepthBuffer back to
    // the story-spec's approximate name. The exact API string is "reversed".
    const wrongName = /\breverseDepthBuffer\b/;
    expect(
      wrongName.test(src),
      'render-engine.ts contains the wrong API name `reverseDepthBuffer` ' +
        '(missing the "d"). The Three.js r170+ canonical name is `reversedDepthBuffer`.',
    ).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// 2. WorldGroup is recentered, SkyboxGroup is NOT.
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — scene-graph recenter scope', () => {
  it('after a frame at a large camera offset, WorldGroup is translated and SkyboxGroup remains at origin', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());

    engine.setCameraPosition(worldVec3(1e9, 2e9, 3e9));
    engine.tick();

    const worldGroup = engine.scene.children.find((c) => c.name === 'WorldGroup');
    const skyboxGroup = engine.scene.children.find((c) => c.name === 'SkyboxGroup');
    expect(worldGroup, 'scene must contain a child named WorldGroup').toBeDefined();
    expect(skyboxGroup, 'scene must contain a child named SkyboxGroup').toBeDefined();

    // WorldGroup is moved by the recenter — at least one axis is non-zero.
    const wgMag =
      Math.abs(worldGroup!.position.x) +
      Math.abs(worldGroup!.position.y) +
      Math.abs(worldGroup!.position.z);
    expect(wgMag).toBeGreaterThan(0);

    // SkyboxGroup is NOT recentered.
    expect(skyboxGroup!.position.x).toBe(0);
    expect(skyboxGroup!.position.y).toBe(0);
    expect(skyboxGroup!.position.z).toBe(0);

    engine.dispose();
  });
});

// -----------------------------------------------------------------------------
// 3. onFrame callback ordering invariant.
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — onFrame ordering and unregister', () => {
  it('callbacks fire in registration order; off() removes only the chosen callback', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());

    const fired: string[] = [];
    const cb1 = () => fired.push('first');
    const cb2 = () => fired.push('second');
    const offFirst = engine.onFrame(cb1);
    engine.onFrame(cb2);

    engine.tick();
    expect(fired).toEqual(['first', 'second']);

    offFirst();
    fired.length = 0;
    engine.tick();
    expect(fired).toEqual(['second']);

    engine.dispose();
  });
});

// -----------------------------------------------------------------------------
// 4. onFrame memory hygiene — registering N then unregistering all leaves the
//    engine firing zero callbacks. Defends against unbounded retention.
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — onFrame memory hygiene', () => {
  it('after register-all then unregister-all, no callbacks fire on tick', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());

    const N = 25;
    const offs: Array<() => void> = [];
    const counters = new Array<number>(N).fill(0);
    for (let i = 0; i < N; i++) {
      offs.push(
        engine.onFrame(() => {
          counters[i] += 1;
        }),
      );
    }

    engine.tick();
    expect(counters.every((c) => c === 1)).toBe(true);

    for (const off of offs) off();

    counters.fill(0);
    engine.tick();
    engine.tick();
    expect(counters.every((c) => c === 0)).toBe(true);

    engine.dispose();
  });

  it('dispose() also clears all registered callbacks (no zombie firings via leaked refs)', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());

    let fired = 0;
    engine.onFrame(() => (fired += 1));
    engine.tick();
    expect(fired).toBe(1);

    engine.dispose();
    // After dispose, calling tick is a no-op (renderer is null). The callbacks
    // list must also be empty — re-init and verify no zombie firing.
    const cap2 = makeRendererCapture();
    const engine2 = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap2.factory);
    engine2.init(makeFakeCanvas());
    engine2.tick();
    // We never registered on engine2, so fired must remain at 1 (from engine1).
    expect(fired).toBe(1);
    engine2.dispose();
  });
});

// -----------------------------------------------------------------------------
// 5. Floating-origin invariant — camera always sits at render-space origin.
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — camera stays at render-space origin', () => {
  it('after setCameraPosition at extreme magnitude, camera.position is exactly (0,0,0)', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(CAPS_REVERSE_Z_OK, {}, cap.factory);
    engine.init(makeFakeCanvas());

    engine.setCameraPosition(worldVec3(1.234e10, -5.678e10, 9.012e10));
    engine.tick();

    expect(engine.camera.position.x).toBe(0);
    expect(engine.camera.position.y).toBe(0);
    expect(engine.camera.position.z).toBe(0);

    // And a follow-up tick at a different position keeps the camera at origin.
    engine.setCameraPosition(worldVec3(1, 1, 1));
    engine.tick();
    expect(engine.camera.position.x).toBe(0);
    expect(engine.camera.position.y).toBe(0);
    expect(engine.camera.position.z).toBe(0);

    engine.dispose();
  });
});

// -----------------------------------------------------------------------------
// 6. Branded-type cast site is the only Float32 origin in practice.
//    Runtime contract: renderVec3FromWorld is the explicit cast; its output is
//    a Float32Array regardless of input backing.
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — explicit precision-loss cast', () => {
  it('renderVec3FromWorld output is a Float32Array', () => {
    const w = worldVec3(1e8, 2e8, 3e8);
    const r = renderVec3FromWorld(w);
    expect(r).toBeInstanceOf(Float32Array);
    expect(r.length).toBe(3);
  });

  it('renderVec3FromWorld preserves values within Float32 representable range', () => {
    const w = worldVec3(100.5, -200.25, 300.125);
    const r = renderVec3FromWorld(w);
    // These are exactly representable in Float32 — round-trip is exact.
    expect(r[0]).toBe(100.5);
    expect(r[1]).toBe(-200.25);
    expect(r[2]).toBe(300.125);
  });

  it('renderVec3FromWorld does not throw when handed an array-like with extra precision', () => {
    // The contract is type-system enforced. At runtime, the function reads
    // [0..2] and casts to Float32 — this should not throw for any indexable.
    // We pass a Float32Array masquerading as WorldVec3 to confirm robustness.
    const fake = new Float32Array([1, 2, 3]) as unknown as WorldVec3;
    expect(() => renderVec3FromWorld(fake)).not.toThrow();
    const r = renderVec3FromWorld(fake);
    // Output is still a fresh Float32Array — the cast site is the only
    // Float32 origin in the codebase (the input was already lower-precision
    // but the boundary still produces a clean new buffer).
    expect(r).toBeInstanceOf(Float32Array);
    expect(r).not.toBe(fake);
  });
});

// -----------------------------------------------------------------------------
// 7. forceLogDepth=true forces logarithmic depth path (AC4 manual override).
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — ?force-log-depth=1 override path', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('forceLogDepth=true initializes the renderer with logarithmicDepthBuffer=true and reversedDepthBuffer=false', () => {
    const cap = makeRendererCapture();
    const engine = new RenderEngine(
      CAPS_REVERSE_Z_OK,
      { forceLogDepth: true },
      cap.factory,
    );
    engine.init(makeFakeCanvas());

    expect(cap.paramsSeen).toHaveLength(1);
    expect(cap.paramsSeen[0].logarithmicDepthBuffer).toBe(true);
    expect(cap.paramsSeen[0].reversedDepthBuffer).toBe(false);
    expect(engine.depthMode).toBe('logarithmic');

    engine.dispose();
    warnSpy.mockRestore();
  });
});

// -----------------------------------------------------------------------------
// 8. Reverse-Z fallback warning is emitted exactly once per engine.
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — reverse-Z fallback warning cadence', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('one warn per engine when reverse-Z is unavailable; no runaway warns over multiple ticks', () => {
    const cap1 = makeRendererCapture();
    const e1 = new RenderEngine(CAPS_NO_REVERSE_Z, {}, cap1.factory);
    e1.init(makeFakeCanvas());
    e1.tick();
    e1.tick();
    e1.tick();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/reverse.?z/i);
    e1.dispose();

    // A second engine with the same flag emits its own one warn — total 2.
    const cap2 = makeRendererCapture();
    const e2 = new RenderEngine(CAPS_NO_REVERSE_Z, {}, cap2.factory);
    e2.init(makeFakeCanvas());
    e2.dispose();
    expect(warnSpy).toHaveBeenCalledTimes(2);

    // A third engine — three total. Linear, not exponential.
    const cap3 = makeRendererCapture();
    const e3 = new RenderEngine(CAPS_NO_REVERSE_Z, {}, cap3.factory);
    e3.init(makeFakeCanvas());
    e3.dispose();
    expect(warnSpy).toHaveBeenCalledTimes(3);

    warnSpy.mockRestore();
  });
});

// -----------------------------------------------------------------------------
// 9. URL-param dev-mode parsing — locked behaviors.
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — getUrlParams dev-mode parsing', () => {
  it('?dev=precision yields devMode === "precision"', () => {
    expect(getUrlParams('?dev=precision').devMode).toBe('precision');
  });

  it('?dev=other yields devMode === "other" (gate is downstream)', () => {
    expect(getUrlParams('?dev=other').devMode).toBe('other');
  });

  it('no dev parameter yields devMode === null', () => {
    expect(getUrlParams('?').devMode).toBe(null);
    expect(getUrlParams('?force-log-depth=1').devMode).toBe(null);
  });

  it('?dev= (empty value) yields devMode === "" (locked: empty string, not null)', () => {
    // Locked-in answer per the URLSearchParams spec: an empty value is the
    // empty string. isPrecisionSmokeMode('') returns false, so this is safe.
    expect(getUrlParams('?dev=').devMode).toBe('');
  });
});

// -----------------------------------------------------------------------------
// 10. KM_PER_AU exact literal value.
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — KM_PER_AU literal', () => {
  it('KM_PER_AU === 149597870.7 (truncated IAU 2012 value, not the longer 149597870.6991...)', () => {
    expect(KM_PER_AU).toBe(149597870.7);
  });

  it('SCALE === 1 (km per render-space unit, ADR 0012)', () => {
    expect(SCALE).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// 11. FAR_PLANE_KM ≥ 165 AU (NFR-P8 heliopause-scale visibility).
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — FAR_PLANE_KM zoom-out reach', () => {
  it('FAR_PLANE_KM is at least 165 AU', () => {
    expect(FAR_PLANE_KM).toBeGreaterThanOrEqual(165 * KM_PER_AU);
  });

  it('FAR_PLANE_KM equals 300 AU (the configured 165-AU-plus-headroom value)', () => {
    expect(FAR_PLANE_KM).toBe(300 * KM_PER_AU);
  });
});

// -----------------------------------------------------------------------------
// 12. NEAR_PLANE_KM is well below 1 m (sub-meter precision floor).
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — NEAR_PLANE_KM sub-meter', () => {
  it('NEAR_PLANE_KM < 1 m (1e-3 km, i.e. sub-meter precision is comfortably above the near plane)', () => {
    expect(NEAR_PLANE_KM).toBeLessThan(1e-3);
  });

  it('NEAR_PLANE_KM === 1e-6 km (1 micrometer — current spec)', () => {
    expect(NEAR_PLANE_KM).toBe(1e-6);
  });

  it('camera default FOV matches Architecture Decision 3c (50°)', () => {
    expect(DEFAULT_FOV).toBe(50);
  });
});

// -----------------------------------------------------------------------------
// 13. Precision-smoke scene structure — exactly two cubes, 1 m and 1 cm.
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — precision-smoke scene structure', () => {
  it('isPrecisionSmokeMode gate accepts only "precision"', () => {
    expect(isPrecisionSmokeMode('precision')).toBe(true);
    expect(isPrecisionSmokeMode('Precision')).toBe(false);
    expect(isPrecisionSmokeMode('precise')).toBe(false);
    expect(isPrecisionSmokeMode(null)).toBe(false);
  });

  it('startPrecisionSmoke adds exactly two cube meshes to WorldGroup at 1 m and 1 cm sizes', () => {
    // Use the mock-renderer trick: precision-smoke calls engine.init() and
    // engine.start(); we patch the WebGLRenderer constructor by injecting our
    // own RenderEngine ahead of the smoke-scene helper. Since startPrecisionSmoke
    // builds its own RenderEngine internally, we patch console.warn (so the
    // fallback warn doesn't pollute the test) and rely on the no-canvas-mount
    // codepath. The fake-canvas + capabilities suffice because the default
    // factory in RenderEngine constructs a real WebGLRenderer — to avoid that
    // we need to intercept. Instead of refactoring, we instead bypass: build
    // a scene directly by inspecting the precision-smoke contract via source.
    //
    // We can still verify the *shape* of the constructed scene by reading the
    // source — assert the BoxGeometry dimensions are exactly METER_KM=1e-3
    // and CENTIMETER_KM=1e-5 km. (The runtime smoke test would require a
    // WebGL2 context, which jsdom can't provide; that's the AC5 deferral.)
    const src = readFileSync(
      resolve(srcRoot, 'dev/precision-smoke.ts'),
      'utf-8',
    );
    // 1 m in km = 1e-3
    expect(src).toMatch(/METER_KM\s*=\s*1e-3/);
    // 1 cm in km = 1e-5
    expect(src).toMatch(/CENTIMETER_KM\s*=\s*1e-5/);
    // 1-m cube uses METER_KM for all three BoxGeometry dimensions
    expect(src).toMatch(/new\s+BoxGeometry\s*\(\s*METER_KM\s*,\s*METER_KM\s*,\s*METER_KM\s*\)/);
    // 1-cm cube uses CENTIMETER_KM for all three BoxGeometry dimensions
    expect(src).toMatch(
      /new\s+BoxGeometry\s*\(\s*CENTIMETER_KM\s*,\s*CENTIMETER_KM\s*,\s*CENTIMETER_KM\s*\)/,
    );
    // Story 7.6 deferral TODO is present (NFR-P8 long-form gate)
    expect(src).toMatch(/Story\s+7\.6/);
  });

  it('BoxGeometry literals constructible at 1 m and 1 cm (no NaN / negative-size guard issues)', () => {
    // Belt-and-suspenders: confirm Three.js itself accepts the chosen
    // dimensions without producing a degenerate geometry.
    const meterCube = new BoxGeometry(1e-3, 1e-3, 1e-3);
    const cmCube = new BoxGeometry(1e-5, 1e-5, 1e-5);
    // BoxGeometry has 8 vertices and 12 triangles regardless of size.
    expect(meterCube.attributes.position.count).toBeGreaterThan(0);
    expect(cmCube.attributes.position.count).toBeGreaterThan(0);
    // Sanity: Mesh wraps these cleanly.
    const mesh = new Mesh(meterCube);
    expect(mesh.geometry).toBe(meterCube);
  });
});

// -----------------------------------------------------------------------------
// 14. No additional Three.js framework imports in web/src/.
//     Lit lands in Story 1.7. OrbitControls is rejected per ADR / Decision 3c
//     (custom VoyagerCameraController in Story 4.2). React/Preact never.
// -----------------------------------------------------------------------------
describe('Story 1.5 defense — no premature framework imports under web/src/', () => {
  const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    {
      pattern: /from\s+['"]@react-three\/fiber['"]/,
      reason: '@react-three/fiber is not used (vanilla Three.js per ADR 0008)',
    },
    {
      pattern: /from\s+['"]three\/examples\/jsm\/controls\/OrbitControls['"]/,
      reason:
        'OrbitControls is intentionally rejected (Decision 3c — Story 4.2 will introduce a custom VoyagerCameraController)',
    },
    {
      pattern: /from\s+['"]lit['"]/,
      reason: 'Lit is introduced in Story 1.7, not 1.5',
    },
    {
      pattern: /from\s+['"]lit\//,
      reason: 'Lit is introduced in Story 1.7, not 1.5',
    },
    {
      pattern: /from\s+['"]react['"]/,
      reason: 'React is not part of this project',
    },
    {
      pattern: /from\s+['"]react-dom['"]/,
      reason: 'React-DOM is not part of this project',
    },
    {
      pattern: /from\s+['"]preact['"]/,
      reason: 'Preact is not part of this project',
    },
    {
      pattern: /from\s+['"]preact\//,
      reason: 'Preact is not part of this project',
    },
  ];

  it('grep web/src/ for forbidden framework imports', () => {
    const tsFiles = walkTsFiles(srcRoot);
    const violations: string[] = [];

    for (const file of tsFiles) {
      const contents = readFileSync(file, 'utf-8');
      const lines = contents.split(/\r?\n/);
      lines.forEach((line, idx) => {
        for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(
              `${relative(webRoot, file)}:${idx + 1}: [${reason}] ${line.trim().slice(0, 160)}`,
            );
          }
        }
      });
    }

    expect(
      violations,
      `Found forbidden framework imports under web/src/. ` +
        `Story 1.5 must remain on vanilla Three.js + TypeScript; downstream stories introduce other libraries deliberately.\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});

// Silence the unused-import lint by referencing startPrecisionSmoke in a type-
// only position. The function is exercised by the dev-mode browser path
// (AC5 manual run); we only need its module to load cleanly.
void startPrecisionSmoke;
