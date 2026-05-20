// @vitest-environment happy-dom
//
// Story 1.12 defense-in-depth — 15 cross-cutting tripwires for the
// SpacecraftModels + TrajectoryLines implementation. These tests complement
// (and intentionally overlap, but do not duplicate) the co-located suites
// (`web/src/render/spacecraft-models.test.ts`,
//  `web/src/render/trajectory-lines.test.ts`) and the integration suites
// (`web/tests/spacecraft-trajectory-integration.test.ts`,
//  `web/tests/trajectory-no-dispose.test.ts`).
//
// What this suite locks in (one test per contract surface):
//   1.  GLB is LFS-tracked (`*.glb` filter=lfs).
//   2.  GLB on-disk size budget (≤5 MB; skip if pointer-only).
//   3.  GLTFLoader.load() called exactly once for both V1+V2 (load-once,
//       clone-twice pattern).
//   4.  Neither rendering module imports OrbitControls (Decision 3c — the
//       VoyagerCameraController in Story 4.2 is the only allowed camera).
//   5.  V1 hidden before V1_LAUNCH_ET; V2 hidden before V2_LAUNCH_ET.
//   6.  Trajectory line `visible` mirrors the spacecraft launch gate (no
//       "spacecraft hidden but trajectory rendered at origin").
//   7.  Total trajectory vertex count ≤1100 (500 × 2 + headroom).
//   8.  tick(et) is idempotent — same et yields same geometry vertex state.
//   9.  Backward scrubbing actually shrinks the past line.
//  10.  LineMaterial.resolution updates on viewport resize.
//  11.  Past material dashed=false; future material dashed=true.
//  12.  CSS token colors resolve to a real `THREE.Color` instance.
//  13.  Each spacecraft instance has a V1/V2 label sprite.
//  14.  Neither rendering module constructs `new Float32Array(`.
//  15.  500-tick stress (mixed forward+backward) — zero
//       BufferGeometry.prototype.dispose calls.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BufferGeometry,
  Color,
  Group,
  Sprite,
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  TrajectoryLines,
  VERTICES_PER_SPACECRAFT_TRAJECTORY,
  type PositionProvider,
} from '../src/render/trajectory-lines';
import { SpacecraftModels } from '../src/render/spacecraft-models';
import { worldVec3 } from '../src/types/branded';
import type { WorldVec3 } from '../src/types/branded';
import type { EphemerisService } from '../src/services/ephemeris-service';
import {
  V1_LAUNCH_ET,
  V2_LAUNCH_ET,
  MISSION_END_ET,
} from '../src/constants/mission';

// ---------------------------------------------------------------------------
// Path helpers — anchored to web/ root.
// ---------------------------------------------------------------------------
const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(WEB_ROOT, '..');
const GLB_REL = 'web/public/models/voyager.glb';
const GLB_ABS = resolve(REPO_ROOT, GLB_REL);
const GITATTRIBUTES_ABS = resolve(REPO_ROOT, '.gitattributes');
const SPACECRAFT_MODELS_TS = resolve(WEB_ROOT, 'src/render/spacecraft-models.ts');
const TRAJECTORY_LINES_TS = resolve(WEB_ROOT, 'src/render/trajectory-lines.ts');

// Heuristic LFS-pointer detection: pointer files are ~130 bytes ASCII text
// beginning with "version https://git-lfs.github.com/spec/...".
const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec';
const isLfsPointerFile = (path: string): boolean => {
  if (!existsSync(path)) return false;
  const stat = statSync(path);
  if (stat.size > 1024) return false; // real GLBs are MBs
  try {
    const head = readFileSync(path, 'utf-8');
    return head.startsWith(LFS_POINTER_PREFIX);
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Shared test fixtures.
// ---------------------------------------------------------------------------
const linearProvider: PositionProvider = (et, naifId) => {
  if (naifId === -31) return worldVec3(et - V1_LAUNCH_ET, 0, 0);
  if (naifId === -32) return worldVec3(0, et - V2_LAUNCH_ET, 0);
  return null;
};

const ephemerisFromProvider = (provider: PositionProvider): EphemerisService =>
  ({
    getStateAt: (et: number, bodyId: number) => {
      const p = provider(et, bodyId);
      return p === null ? null : { position: p, velocity: worldVec3(0, 0, 0) };
    },
    getPosition: (et: number, bodyId: number): WorldVec3 | null =>
      provider(et, bodyId),
  }) as unknown as EphemerisService;

const makeFakeGltf = (): GLTF => {
  const scene = new Group();
  scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
  return {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: { version: '2.0' },
    parser: {} as unknown as GLTF['parser'],
    userData: {},
  } as unknown as GLTF;
};

// =========================================================================
// 1. GLB LFS tracking — git check-attr (with fallback to .gitattributes).
// =========================================================================
describe('Story 1.12 defense — GLB is LFS-tracked', () => {
  it('voyager.glb resolves to `filter: lfs` via git check-attr (or .gitattributes fallback)', () => {
    let lfsTracked = false;
    let detectionMethod = '';
    try {
      const out = execFileSync(
        'git',
        ['check-attr', 'filter', '--', GLB_REL],
        { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      lfsTracked = /filter:\s*lfs/i.test(out);
      detectionMethod = `git check-attr → ${out.trim()}`;
    } catch (err) {
      // Fallback: read .gitattributes literally and look for `*.glb` LFS pattern.
      // This is acceptable for environments where `git` is unavailable in tests.
      detectionMethod = `fallback to .gitattributes (git failed: ${String(err)})`;
      const attrs = readFileSync(GITATTRIBUTES_ABS, 'utf-8');
      const glbLines = attrs
        .split(/\r?\n/)
        .filter((l) => l.includes('*.glb') && !l.trimStart().startsWith('#'));
      lfsTracked = glbLines.some(
        (l) => /filter\s*=\s*lfs/.test(l) && /diff\s*=\s*lfs/.test(l) && /merge\s*=\s*lfs/.test(l),
      );
    }
    expect(
      lfsTracked,
      `voyager.glb is NOT LFS-tracked. Detection: ${detectionMethod}. ` +
        `Ensure .gitattributes contains a line like:\n` +
        `  *.glb filter=lfs diff=lfs merge=lfs -text\n` +
        `Removing this line would silently break binary tracking — large GLBs ` +
        `would be committed as text, blowing the repo size budget and breaking ` +
        `clones.`,
    ).toBe(true);
  });
});

// =========================================================================
// 2. GLB file size budget — ≤5 MB; skip if pointer-only.
// =========================================================================
describe('Story 1.12 defense — GLB file size budget', () => {
  const isPointer = isLfsPointerFile(GLB_ABS);
  const skipReason = isPointer
    ? `GLB is an LFS pointer file (not pulled). Skipping size check; CI with LFS pull should run this.`
    : !existsSync(GLB_ABS)
      ? `GLB not present at ${GLB_REL}. Skipping size check (fresh clone without LFS pull).`
      : null;

  it.skipIf(skipReason !== null)(
    'voyager.glb is ≤ 5 MB (the cruise-scale single-LOD budget; full LOD chain comes in Story 4.3)',
    () => {
      const sizeBytes = statSync(GLB_ABS).size;
      const sizeMb = sizeBytes / (1024 * 1024);
      const BUDGET_MB = 5;
      expect(
        sizeMb,
        `voyager.glb is ${sizeMb.toFixed(2)} MB, exceeding the 5 MB budget. ` +
          `The Story 1.12 acquisition note caps the GLB at 5 MB for the cruise-scale ` +
          `single-LOD asset; the full 4-level LOD chain is Story 4.3's responsibility. ` +
          `If a larger asset is intentional, update the budget here and in the story.`,
      ).toBeLessThanOrEqual(BUDGET_MB);
    },
  );
});

// =========================================================================
// 3. GLTFLoader.load() called exactly once — load-once, clone-twice pattern.
// =========================================================================
describe('Story 1.12 defense — GLTFLoader called once for both spacecraft', () => {
  it('SpacecraftModels.load() invokes loader.load() exactly once (clones for V2)', async () => {
    const fake = makeFakeGltf();
    let loadCalls = 0;
    const loader = {
      load: (
        _url: string,
        onLoad: (gltf: GLTF) => void,
        _onProgress?: (event: ProgressEvent) => void,
        _onError?: (err: unknown) => void,
      ): void => {
        loadCalls += 1;
        onLoad(fake);
      },
    };
    const models = new SpacecraftModels();
    await models.load({ loader });
    expect(
      loadCalls,
      `GLTFLoader.load() called ${loadCalls} time(s); the load-once/clone-twice ` +
        `pattern requires exactly 1 network fetch + 2 clones for V1+V2.`,
    ).toBe(1);
  });
});

// =========================================================================
// 4. Decision 3c — OrbitControls is FORBIDDEN in the rendering modules.
// =========================================================================
describe('Story 1.12 defense — no OrbitControls import in render modules', () => {
  // Decision 3c (architecture line ~138 of the story): OrbitControls is
  // forbidden; the custom VoyagerCameraController in Story 4.2 is the only
  // allowed camera control. A future dev pulling OrbitControls "just to
  // verify the rendering" would silently break the camera contract.
  const ORBIT_CONTROLS_PATTERN = /from\s+['"]three\/examples\/jsm\/controls\/OrbitControls/;

  it('spacecraft-models.ts does not import OrbitControls', () => {
    const src = readFileSync(SPACECRAFT_MODELS_TS, 'utf-8');
    expect(
      ORBIT_CONTROLS_PATTERN.test(src),
      `spacecraft-models.ts imports OrbitControls — Decision 3c forbids this. ` +
        `Use the VoyagerCameraController (Story 4.2) for camera control.`,
    ).toBe(false);
  });

  it('trajectory-lines.ts does not import OrbitControls', () => {
    const src = readFileSync(TRAJECTORY_LINES_TS, 'utf-8');
    expect(
      ORBIT_CONTROLS_PATTERN.test(src),
      `trajectory-lines.ts imports OrbitControls — Decision 3c forbids this. ` +
        `Use the VoyagerCameraController (Story 4.2) for camera control.`,
    ).toBe(false);
  });
});

// =========================================================================
// 5. V1/V2 pre-launch visibility gate.
// =========================================================================
describe('Story 1.12 defense — pre-launch visibility gate (AC8)', () => {
  it('V1 hidden when et < V1_LAUNCH_ET; visible when et > V1_LAUNCH_ET', () => {
    const models = new SpacecraftModels();
    const ephem = ephemerisFromProvider(linearProvider);

    // Pre-launch: 1 hour before V1 launch (still post-V2 launch).
    models.tick(V1_LAUNCH_ET - 3600, ephem);
    expect(models.getHandle('voyager-1').group.visible).toBe(false);

    // Post-launch: 1 day after V1 launch.
    models.tick(V1_LAUNCH_ET + 86400, ephem);
    expect(models.getHandle('voyager-1').group.visible).toBe(true);
  });

  it('V2 hidden when et < V2_LAUNCH_ET; visible when et > V2_LAUNCH_ET', () => {
    const models = new SpacecraftModels();
    const ephem = ephemerisFromProvider(linearProvider);

    // Pre-launch: 1 hour before V2 launch.
    models.tick(V2_LAUNCH_ET - 3600, ephem);
    expect(models.getHandle('voyager-2').group.visible).toBe(false);

    // Post-launch: 1 day after V2 launch (still pre-V1 launch).
    models.tick(V2_LAUNCH_ET + 86400, ephem);
    expect(models.getHandle('voyager-2').group.visible).toBe(true);
  });
});

// =========================================================================
// 6. Trajectory line `visible` flag mirrors spacecraft launch.
//
// AC8 / FR9 — before a spacecraft has launched, neither its past nor future
// trajectory line should be rendered. The dev's TrajectoryLines.tick() emits
// degenerate (zero-length) past-line geometry when et <= launchEt; this test
// goes one step further and asserts the line's `visible` flag mirrors the
// spacecraft visibility, preventing the "trajectory rendering at origin
// while spacecraft hidden" bug.
//
// If the implementation does NOT toggle `visible` on the Line2 objects, this
// test is permissive: degenerate zero-length geometry is the equivalent
// fallback (no rendered output even if `visible === true`), so we
// alternatively allow `instanceStart.count === 1` (one degenerate segment).
// =========================================================================
describe('Story 1.12 defense — trajectory lines collapse pre-launch', () => {
  it('V1 trajectory geometry is degenerate (or invisible) before V1 launch', () => {
    const lines = new TrajectoryLines(linearProvider);
    lines.tick(V1_LAUNCH_ET - 3600);
    const v1 = lines._peekSet('voyager-1');
    const pastSegments = v1.pastLine.geometry.attributes.instanceStart.count;
    const pastDegenerate = pastSegments === 1;
    const pastInvisible = v1.pastLine.visible === false;
    expect(
      pastDegenerate || pastInvisible,
      `V1 past-line at pre-launch ET has ${pastSegments} segments AND visible=${v1.pastLine.visible}. ` +
        `Expected either degenerate geometry (count=1) or visible=false to avoid rendering ` +
        `a stray trajectory at the spacecraft's launch position while the spacecraft itself is hidden.`,
    ).toBe(true);
  });
});

// =========================================================================
// 7. Trajectory vertex count is bounded.
// =========================================================================
describe('Story 1.12 defense — vertex count budget', () => {
  it('TrajectoryLines total instance-start segments across V1+V2 is ≤ 1100', () => {
    const lines = new TrajectoryLines(linearProvider);
    // Pick a mid-mission ET so both spacecraft have non-degenerate splits.
    const midEt = (V1_LAUNCH_ET + MISSION_END_ET) / 2;
    lines.tick(midEt);
    const v1 = lines._peekSet('voyager-1');
    const v2 = lines._peekSet('voyager-2');
    const total =
      v1.pastLine.geometry.attributes.instanceStart.count +
      v1.futureLine.geometry.attributes.instanceStart.count +
      v2.pastLine.geometry.attributes.instanceStart.count +
      v2.futureLine.geometry.attributes.instanceStart.count;
    const BUDGET = 2 * VERTICES_PER_SPACECRAFT_TRAJECTORY + 100;
    expect(
      total,
      `Total Line2 instance segments across all 4 trajectory lines = ${total}, ` +
        `exceeding the ${BUDGET}-segment budget (500 per spacecraft × 2 + 100 headroom). ` +
        `A runaway vertex count regresses NFR-P2 frame-time.`,
    ).toBeLessThanOrEqual(BUDGET);
  });
});

// =========================================================================
// 8. tick(et) is idempotent — same et → same geometry state.
// =========================================================================
describe('Story 1.12 defense — tick(et) idempotency', () => {
  it('tick(et=X) twice produces identical past-line vertex counts', () => {
    const lines = new TrajectoryLines(linearProvider);
    const etX = V1_LAUNCH_ET + 0.4 * (MISSION_END_ET - V1_LAUNCH_ET);
    const etY = V1_LAUNCH_ET + 0.7 * (MISSION_END_ET - V1_LAUNCH_ET);

    lines.tick(etX);
    const v1 = lines._peekSet('voyager-1');
    const pastX1 = v1.pastLine.geometry.attributes.instanceStart.count;
    const futureX1 = v1.futureLine.geometry.attributes.instanceStart.count;

    lines.tick(etX);
    expect(v1.pastLine.geometry.attributes.instanceStart.count).toBe(pastX1);
    expect(v1.futureLine.geometry.attributes.instanceStart.count).toBe(futureX1);

    lines.tick(etY);
    lines.tick(etX);
    expect(
      v1.pastLine.geometry.attributes.instanceStart.count,
      `tick(et=X) after tick(et=Y) tick(et=X) does not match original tick(et=X) state — ` +
        `the split must be a pure function of et alone, with no hidden state.`,
    ).toBe(pastX1);
    expect(v1.futureLine.geometry.attributes.instanceStart.count).toBe(futureX1);
  });
});

// =========================================================================
// 9. Backward scrubbing — past line shrinks.
// =========================================================================
describe('Story 1.12 defense — backward time-travel correctness', () => {
  it('past line at earlier et has fewer segments than at later et', () => {
    const lines = new TrajectoryLines(linearProvider);
    const lateEt = V1_LAUNCH_ET + 0.9 * (MISSION_END_ET - V1_LAUNCH_ET);
    const earlyEt = V1_LAUNCH_ET + 0.1 * (MISSION_END_ET - V1_LAUNCH_ET);

    lines.tick(lateEt);
    const v1 = lines._peekSet('voyager-1');
    const pastLate = v1.pastLine.geometry.attributes.instanceStart.count;

    lines.tick(earlyEt);
    const pastEarly = v1.pastLine.geometry.attributes.instanceStart.count;

    expect(
      pastEarly,
      `Backward scrub failed: past-line segments at early ET = ${pastEarly}, ` +
        `at late ET = ${pastLate}. Backward scrub must shrink the past line ` +
        `(the same idempotent tick(et) function handles both directions).`,
    ).toBeLessThan(pastLate);
  });
});

// =========================================================================
// 10. LineMaterial.resolution updates on viewport resize.
// =========================================================================
describe('Story 1.12 defense — LineMaterial.resolution tracks viewport', () => {
  it('setResolution(w, h) propagates to all 4 LineMaterial.resolution vectors', () => {
    const lines = new TrajectoryLines(linearProvider, { width: 100, height: 100 });
    const v1 = lines._peekSet('voyager-1');
    const v2 = lines._peekSet('voyager-2');

    // Pre-resize: matches construction-time width/height.
    expect(v1.pastMaterial.resolution.x).toBe(100);

    // Trigger resize.
    lines.setResolution(2560, 1440);

    for (const [name, mat] of [
      ['v1.past', v1.pastMaterial],
      ['v1.future', v1.futureMaterial],
      ['v2.past', v2.pastMaterial],
      ['v2.future', v2.futureMaterial],
    ] as const) {
      expect(mat.resolution.x, `${name}.resolution.x not updated by setResolution`).toBe(2560);
      expect(mat.resolution.y, `${name}.resolution.y not updated by setResolution`).toBe(1440);
    }
  });
});

// =========================================================================
// 11. LineMaterial dashed flag — past=false, future=true.
// =========================================================================
describe('Story 1.12 defense — past=solid, future=dashed (FR49 non-color-only)', () => {
  it('past materials have dashed=false; future materials have dashed=true for both spacecraft', () => {
    const lines = new TrajectoryLines(linearProvider);
    const v1 = lines._peekSet('voyager-1');
    const v2 = lines._peekSet('voyager-2');

    expect(v1.pastMaterial.dashed, 'V1 past must be solid').toBe(false);
    expect(v1.futureMaterial.dashed, 'V1 future must be dashed').toBe(true);
    expect(v2.pastMaterial.dashed, 'V2 past must be solid').toBe(false);
    expect(v2.futureMaterial.dashed, 'V2 future must be dashed').toBe(true);
  });
});

// =========================================================================
// 12. CSS token color resolution.
// =========================================================================
describe('Story 1.12 defense — CSS token color resolution', () => {
  it('past + future materials resolve their colors to actual THREE.Color instances', () => {
    // Inject the design-token CSS variables into the test doc root so the
    // module's readCssVar() picks them up — emulating production where
    // tokens.css is loaded into :root. Otherwise the constructor falls
    // back to the literal hardcoded fallbacks (also valid; we test both).
    const root = document.documentElement;
    root.style.setProperty('--v-color-trajectory-past', '#e8eaed');
    root.style.setProperty('--v-color-trajectory-future', '#5f6368');

    const lines = new TrajectoryLines(linearProvider);
    const v1 = lines._peekSet('voyager-1');

    expect(
      v1.pastMaterial.color,
      'past material color is not a THREE.Color instance — token resolution returned a string or undefined.',
    ).toBeInstanceOf(Color);
    expect(v1.futureMaterial.color).toBeInstanceOf(Color);

    // Past color (#e8eaed) → 0xe8eaed.
    expect(
      v1.pastMaterial.color.getHex(),
      `past color hex mismatch — token --v-color-trajectory-past did not resolve to its literal value`,
    ).toBe(0xe8eaed);
    expect(v1.futureMaterial.color.getHex()).toBe(0x5f6368);

    // Clean up inline style overrides.
    root.style.removeProperty('--v-color-trajectory-past');
    root.style.removeProperty('--v-color-trajectory-future');
  });
});

// =========================================================================
// 13. Sprite labels exist and read "V1" / "V2".
//
// We can't inspect rasterized canvas text reliably (font metrics vary
// across happy-dom + node-canvas + native), so we assert (a) each spacecraft
// has exactly one Sprite child and (b) the sprite is named with the V1/V2
// distinction. The dev's spacecraft-models.ts assigns sprite.name =
// `${id}-label` where id ∈ {'voyager-1', 'voyager-2'}, which encodes the
// V1/V2 distinction in the scene-graph metadata.
// =========================================================================
describe('Story 1.12 defense — V1/V2 label sprites (AC3)', () => {
  it('each spacecraft has a Sprite child with the V1/V2 name encoding', () => {
    const models = new SpacecraftModels();
    const v1Group = models.getHandle('voyager-1').group;
    const v2Group = models.getHandle('voyager-2').group;

    const v1Sprites = v1Group.children.filter((c) => c instanceof Sprite);
    const v2Sprites = v2Group.children.filter((c) => c instanceof Sprite);
    expect(v1Sprites.length, 'voyager-1 should have exactly one label sprite').toBe(1);
    expect(v2Sprites.length, 'voyager-2 should have exactly one label sprite').toBe(1);

    // Names encode the spacecraft identity — accessible via Object3D.name
    // for tooling + debugging without relying on canvas readback.
    expect(v1Sprites[0].name).toBe('voyager-1-label');
    expect(v2Sprites[0].name).toBe('voyager-2-label');
    expect(v1Sprites[0].name).not.toBe(v2Sprites[0].name);
  });
});

// =========================================================================
// 14. No `new Float32Array(` in spacecraft/trajectory modules.
//
// Cross-cutting `no-float32-leakage.test.ts` already enforces this across
// the whole src/ tree, but locking it explicitly for the two new modules
// guards against the allow-list growing in the future (the global rule
// has an allow-list; if someone adds spacecraft-models.ts to that
// allow-list, this test still fires).
// =========================================================================
describe('Story 1.12 defense — no Float32Array constructor in render modules', () => {
  const PATTERN = /new\s+Float32Array\s*\(/;

  it('spacecraft-models.ts does not construct a Float32Array', () => {
    const src = readFileSync(SPACECRAFT_MODELS_TS, 'utf-8');
    const matches = src.split(/\r?\n/).filter((l) => PATTERN.test(l));
    expect(
      matches,
      `spacecraft-models.ts constructs a Float32Array — Story 1.5 ADR 0012 ` +
        `requires Float32 casts go through renderVec3FromWorld() in types/branded.ts. ` +
        `Offending lines: ${matches.join('; ')}`,
    ).toEqual([]);
  });

  it('trajectory-lines.ts does not construct a Float32Array', () => {
    const src = readFileSync(TRAJECTORY_LINES_TS, 'utf-8');
    const matches = src.split(/\r?\n/).filter((l) => PATTERN.test(l));
    expect(
      matches,
      `trajectory-lines.ts constructs a Float32Array — positions must stay in ` +
        `plain number[] until LineGeometry.setPositions() crosses the Three boundary. ` +
        `Offending lines: ${matches.join('; ')}`,
    ).toEqual([]);
  });
});

// =========================================================================
// 15. 500-tick stress — zero BufferGeometry.prototype.dispose calls.
//
// Meta-level NFR-P2 defense: the dev's tests cover 100 forward + 6 backward
// ticks; this expands to a 500-iteration mix (forward sweep + backward
// jumps + repeated tick at same ET) to catch latent dispose calls that
// only trigger after a buffer-pool warm-up or specific scrub pattern.
// =========================================================================
describe('Story 1.12 defense — no BufferGeometry.dispose() over 500-tick stress', () => {
  it('500-iteration mixed forward+backward+repeat ticks trigger zero dispose calls', () => {
    const lines = new TrajectoryLines(linearProvider);
    const disposeSpy = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const baseline = disposeSpy.mock.calls.length;

    const span = MISSION_END_ET - V1_LAUNCH_ET;
    for (let i = 0; i < 500; i++) {
      // Mix three patterns: monotonic forward sweep (50%), backward jumps
      // (30%), and repeated-same-ET (20%) — pseudo-random but deterministic.
      const mode = i % 10;
      let t: number;
      if (mode < 5) {
        t = i / 499; // forward sweep
      } else if (mode < 8) {
        t = 1 - i / 499; // backward sweep
      } else {
        t = 0.5; // repeat at midpoint
      }
      const et = V1_LAUNCH_ET + t * span;
      lines.tick(et);
    }

    const perFrameDisposes = disposeSpy.mock.calls.length - baseline;
    expect(
      perFrameDisposes,
      `BufferGeometry.dispose called ${perFrameDisposes} time(s) over 500 mixed ticks. ` +
        `NFR-P2 (≤16.7ms/frame) requires zero per-frame disposes. Regression: a code ` +
        `path now disposes geometry instead of mutating the existing position attribute.`,
    ).toBe(0);
    disposeSpy.mockRestore();
  });
});
