// @vitest-environment happy-dom
/**
 * Story 3.5 — BoresightRenderer unit tests.
 *
 * Covers:
 *   - AC1: attach() resolves SCAN_PLATFORM via the LOD-aware pattern and
 *     parents the cone (single-LOD + multi-LOD paths)
 *   - AC2: ConeGeometry params (radius / length / segments), 90° rotation
 *     about +X so the cone's axis is local +Z, LineSegments wrapping via
 *     EdgesGeometry, LineBasicMaterial { opacity: 0.5, transparent: true,
 *     color: --v-color-accent }
 *   - AC3: ONE cone mesh per spacecraft total (not N×lodLevels); the same
 *     LineSegments instance survives an LOD re-parent
 *   - AC3: 100 ticks → 0 new ConeGeometry / EdgesGeometry constructions
 *   - dispose() drops geometry + material correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Group,
  LOD,
  ConeGeometry,
  EdgesGeometry,
  LineSegments,
  LineBasicMaterial,
  Vector3,
} from 'three';

import {
  BoresightRenderer,
  NA_CAMERA_HALF_ANGLE_DEG,
  CONE_LENGTH_KM,
} from './boresight-renderer';
import type { SpacecraftModels, SpacecraftHandle } from './spacecraft-models';

// === Fixture builders ========================================================

interface FixtureSpacecraft {
  handle: SpacecraftHandle;
  platform: Group;
  /** Multi-LOD only — the per-level platform nodes by level index. */
  levelPlatforms?: Group[];
}

const buildFixture = (
  id: 'voyager-1' | 'voyager-2',
  options: { lodLevels?: number; initialLevel?: number } = {},
): FixtureSpacecraft => {
  const lodLevels = options.lodLevels ?? 1;
  const initialLevel = options.initialLevel ?? 0;
  const naifId = id === 'voyager-1' ? -31 : -32;

  const group = new Group();
  group.name = id;
  group.visible = true;

  let lodInstance: LOD | null = null;
  let platform: Group;
  let levelPlatforms: Group[] | undefined;

  if (lodLevels > 1) {
    lodInstance = new LOD();
    lodInstance.name = `${id}-lod`;
    levelPlatforms = [];
    for (let i = 0; i < lodLevels; i += 1) {
      const levelScene = new Group();
      levelScene.name = `${id}-lod${i}-scene`;
      const levelBus = new Group();
      levelBus.name = 'BUS';
      const levelPlatform = new Group();
      levelPlatform.name = 'SCAN_PLATFORM';
      levelScene.add(levelBus);
      levelScene.add(levelPlatform);
      lodInstance.addLevel(levelScene, i);
      levelPlatforms.push(levelPlatform);
    }
    group.add(lodInstance);
    platform = levelPlatforms[initialLevel];
    let currentLevel = initialLevel;
    lodInstance.getCurrentLevel = (): number => currentLevel;
    (lodInstance as unknown as { __setLevelForTest: (n: number) => void }).__setLevelForTest = (n) => {
      currentLevel = n;
    };
  } else {
    platform = new Group();
    platform.name = 'SCAN_PLATFORM';
    const bus = new Group();
    bus.name = 'BUS';
    group.add(bus);
    group.add(platform);
  }

  const handle: SpacecraftHandle = {
    id,
    naifId,
    group,
    lod: lodInstance,
    hasInitialPosition: true,
  };

  return { handle, platform, levelPlatforms };
};

const buildModelsStub = (
  v1: FixtureSpacecraft,
  v2: FixtureSpacecraft,
): SpacecraftModels => {
  return {
    getHandle: (id: 'voyager-1' | 'voyager-2'): SpacecraftHandle =>
      id === 'voyager-1' ? v1.handle : v2.handle,
  } as unknown as SpacecraftModels;
};

// =============================================================================

describe('BoresightRenderer', () => {
  let renderer: BoresightRenderer;

  beforeEach(() => {
    renderer = new BoresightRenderer();
  });

  afterEach(() => {
    renderer.dispose();
  });

  describe('AC1 — attach() parents cone to SCAN_PLATFORM', () => {
    it('single-LOD fallback path: cone is parented to handle.group SCAN_PLATFORM child', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      renderer.attach(models);

      const coneV1 = renderer.__getCone('voyager-1');
      const coneV2 = renderer.__getCone('voyager-2');
      expect(coneV1).not.toBeNull();
      expect(coneV2).not.toBeNull();
      expect(coneV1?.parent).toBe(v1.platform);
      expect(coneV2?.parent).toBe(v2.platform);
    });

    it('multi-LOD path: cone is parented to the ACTIVE LOD level SCAN_PLATFORM (not handle.group)', () => {
      const v1 = buildFixture('voyager-1', { lodLevels: 4, initialLevel: 2 });
      const v2 = buildFixture('voyager-2', { lodLevels: 4, initialLevel: 2 });
      const models = buildModelsStub(v1, v2);

      renderer.attach(models);

      const coneV1 = renderer.__getCone('voyager-1');
      const coneV2 = renderer.__getCone('voyager-2');
      // Parent must be the level-2 platform, NOT level-0 (which would be the
      // first depth-first match if we walked handle.group instead).
      expect(coneV1?.parent).toBe(v1.levelPlatforms![2]);
      expect(coneV2?.parent).toBe(v2.levelPlatforms![2]);
      expect(coneV1?.parent).not.toBe(v1.levelPlatforms![0]);
    });

    it('attach() is idempotent — second call is a no-op', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      renderer.attach(models);
      const firstCone = renderer.__getCone('voyager-1');
      expect(firstCone).not.toBeNull();

      renderer.attach(models);
      const secondCone = renderer.__getCone('voyager-1');
      expect(secondCone).toBe(firstCone); // Same instance — no re-creation.
    });

    it('handles malformed GLB lacking SCAN_PLATFORM gracefully (cone constructed, un-parented)', () => {
      const v1 = buildFixture('voyager-1');
      // Remove SCAN_PLATFORM from V1 to simulate a malformed GLB.
      v1.handle.group.remove(v1.platform);
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      // Must not throw.
      renderer.attach(models);
      const coneV1 = renderer.__getCone('voyager-1');
      expect(coneV1).not.toBeNull();
      expect(coneV1?.parent).toBeNull();
      // V2 is fine.
      expect(renderer.__getCone('voyager-2')?.parent).toBe(v2.platform);
    });
  });

  describe('AC1 — cone local +Z is the boresight axis', () => {
    it('rotating SCAN_PLATFORM by 90° about Y rotates cone world +Z by 90° about Y', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);
      renderer.attach(models);

      // Identity platform → cone world +Z = (0, 0, 1).
      v1.platform.updateMatrixWorld(true);
      const coneV1 = renderer.__getCone('voyager-1')!;
      coneV1.updateMatrixWorld(true);
      const zBefore = new Vector3(0, 0, 1).transformDirection(coneV1.matrixWorld);
      expect(zBefore.x).toBeCloseTo(0, 12);
      expect(zBefore.y).toBeCloseTo(0, 12);
      expect(zBefore.z).toBeCloseTo(1, 12);

      // Apply 90° rotation about Y to the platform → cone world +Z should
      // become +X (the right-hand-rule 90° rotation maps +Z → +X).
      v1.platform.quaternion.set(0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4));
      v1.platform.updateMatrixWorld(true);
      coneV1.updateMatrixWorld(true);
      const zAfter = new Vector3(0, 0, 1).transformDirection(coneV1.matrixWorld);
      expect(zAfter.x).toBeCloseTo(1, 12);
      expect(zAfter.y).toBeCloseTo(0, 12);
      expect(zAfter.z).toBeCloseTo(0, 12);
    });
  });

  describe('AC2 — geometry params', () => {
    it('cone geometry is unit-scale; mesh.scale applies CONE_LENGTH_KM uniformly', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);
      renderer.attach(models);

      const cone = renderer.__getCone('voyager-1')!;
      const edgesGeom = cone.geometry as EdgesGeometry;
      const positions = edgesGeom.getAttribute('position');
      // Sanity: EdgesGeometry must contain line segments. At unit scale +
      // 0.21° half-angle, the silhouette + base ring resolve cleanly.
      expect(positions.count).toBeGreaterThan(0);

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < positions.count; i += 1) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      // Geometry is unit-length: apex at z = 0, base at z = +1.
      expect(minZ).toBeCloseTo(0, 6);
      expect(maxZ).toBeCloseTo(1, 6);

      // Geometry base radius = tan(0.21°) at unit length.
      const expectedUnitRadius = Math.tan((NA_CAMERA_HALF_ANGLE_DEG * Math.PI) / 180);
      const maxRadius = Math.max(
        Math.abs(minX),
        Math.abs(maxX),
        Math.abs(minY),
        Math.abs(maxY),
      );
      expect(maxRadius).toBeCloseTo(expectedUnitRadius, 5);

      // Mesh scale applies CONE_LENGTH_KM = 0.001 km uniformly so the
      // world-space cone is the right size.
      expect(cone.scale.x).toBeCloseTo(CONE_LENGTH_KM, 12);
      expect(cone.scale.y).toBeCloseTo(CONE_LENGTH_KM, 12);
      expect(cone.scale.z).toBeCloseTo(CONE_LENGTH_KM, 12);
    });

    it('cone uses LineSegments (not Mesh) with EdgesGeometry source', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);
      renderer.attach(models);

      const cone = renderer.__getCone('voyager-1')!;
      expect(cone).toBeInstanceOf(LineSegments);
      expect(cone.geometry).toBeInstanceOf(EdgesGeometry);
    });

    it('material is LineBasicMaterial { transparent: true, opacity: 0.5 }', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);
      renderer.attach(models);

      const cone = renderer.__getCone('voyager-1')!;
      const material = cone.material as LineBasicMaterial;
      expect(material).toBeInstanceOf(LineBasicMaterial);
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(0.5);
    });

    it('reads --v-color-accent for the material color (falls back when unset)', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      // Inject a real --v-color-accent on :root.
      document.documentElement.style.setProperty('--v-color-accent', '#ff8800');
      renderer.attach(models);

      const cone = renderer.__getCone('voyager-1')!;
      const material = cone.material as LineBasicMaterial;
      // 0xff8800 = (1.0, 0.533, 0.0) in linear-ish (Three.js gamma-corrects
      // on demand; for the color-read parity we compare hex).
      expect(material.color.getHexString()).toBe('ff8800');

      document.documentElement.style.removeProperty('--v-color-accent');
    });

    it('falls back to default hex when --v-color-accent is unset', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      document.documentElement.style.removeProperty('--v-color-accent');
      renderer.attach(models);

      const cone = renderer.__getCone('voyager-1')!;
      const material = cone.material as LineBasicMaterial;
      // Fallback FALLBACK_ACCENT_COLOR = '#5fa3ff' (matches default token).
      expect(material.color.getHexString()).toBe('5fa3ff');
    });
  });

  describe('AC3 — single-instance per spacecraft + LOD-swap re-parenting', () => {
    it('exactly 2 cones in the scene graph across all LOD levels', () => {
      const v1 = buildFixture('voyager-1', { lodLevels: 4, initialLevel: 2 });
      const v2 = buildFixture('voyager-2', { lodLevels: 4, initialLevel: 2 });
      const models = buildModelsStub(v1, v2);
      renderer.attach(models);

      // Count all LineSegments instances inside the scene graphs of both
      // spacecraft (descending into all 4 LOD levels).
      let total = 0;
      v1.handle.group.traverse((obj) => {
        if (obj instanceof LineSegments) total += 1;
      });
      v2.handle.group.traverse((obj) => {
        if (obj instanceof LineSegments) total += 1;
      });
      // Exactly 2 — one per spacecraft, NOT 8 (1 per LOD level per spacecraft).
      expect(total).toBe(2);
    });

    it('LOD swap re-parents the SAME cone instance to the new level platform', () => {
      const v1 = buildFixture('voyager-1', { lodLevels: 3, initialLevel: 2 });
      const v2 = buildFixture('voyager-2', { lodLevels: 3, initialLevel: 2 });
      const models = buildModelsStub(v1, v2);

      renderer.attach(models);
      const coneBeforeSwap = renderer.__getCone('voyager-1')!;
      expect(coneBeforeSwap.parent).toBe(v1.levelPlatforms![2]);

      // Camera zooms in — LOD switches to level 0.
      (v1.handle.lod as unknown as { __setLevelForTest: (n: number) => void }).__setLevelForTest(0);
      renderer.tick(models);

      const coneAfterSwap = renderer.__getCone('voyager-1')!;
      // SAME instance — no re-creation.
      expect(coneAfterSwap).toBe(coneBeforeSwap);
      // Re-parented to the new level's platform.
      expect(coneAfterSwap.parent).toBe(v1.levelPlatforms![0]);
      // Old parent no longer holds the cone.
      expect(v1.levelPlatforms![2].children).not.toContain(coneAfterSwap);
    });

    it('100 ticks at unchanged LOD level produce 0 new ConeGeometry constructions', () => {
      const v1 = buildFixture('voyager-1', { lodLevels: 4, initialLevel: 2 });
      const v2 = buildFixture('voyager-2', { lodLevels: 4, initialLevel: 2 });
      const models = buildModelsStub(v1, v2);

      const coneCtorCallCountDuringAttach = countConeGeometryConstructions(() => {
        renderer.attach(models);
      });
      expect(coneCtorCallCountDuringAttach).toBe(2);

      const coneCtorCallCountDuringTicks = countConeGeometryConstructions(() => {
        for (let i = 0; i < 100; i += 1) {
          renderer.tick(models);
        }
      });
      expect(coneCtorCallCountDuringTicks).toBe(0);
    });

    it('LOD swap does NOT construct a new ConeGeometry (cone instance preserved)', () => {
      const v1 = buildFixture('voyager-1', { lodLevels: 3, initialLevel: 2 });
      const v2 = buildFixture('voyager-2', { lodLevels: 3, initialLevel: 2 });
      const models = buildModelsStub(v1, v2);

      renderer.attach(models);

      const coneCtorCallCountDuringSwap = countConeGeometryConstructions(() => {
        (v1.handle.lod as unknown as { __setLevelForTest: (n: number) => void }).__setLevelForTest(0);
        (v2.handle.lod as unknown as { __setLevelForTest: (n: number) => void }).__setLevelForTest(0);
        renderer.tick(models);
      });
      expect(coneCtorCallCountDuringSwap).toBe(0);
    });
  });

  describe('dispose()', () => {
    it('removes cones from their parents and disposes geometry + material', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);
      renderer.attach(models);

      const coneV1 = renderer.__getCone('voyager-1')!;
      const coneV2 = renderer.__getCone('voyager-2')!;
      const v1GeomDisposeSpy = vi.spyOn(coneV1.geometry, 'dispose');
      const v1MatDisposeSpy = vi.spyOn(coneV1.material as LineBasicMaterial, 'dispose');
      const v2GeomDisposeSpy = vi.spyOn(coneV2.geometry, 'dispose');

      expect(v1.platform.children).toContain(coneV1);

      renderer.dispose();

      expect(v1.platform.children).not.toContain(coneV1);
      expect(v2.platform.children).not.toContain(coneV2);
      expect(v1GeomDisposeSpy).toHaveBeenCalled();
      expect(v1MatDisposeSpy).toHaveBeenCalled();
      expect(v2GeomDisposeSpy).toHaveBeenCalled();
      expect(renderer.__isAttached()).toBe(false);
    });

    it('tick after dispose is a no-op (no throw, no re-attach)', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);
      renderer.attach(models);
      renderer.dispose();

      expect(() => renderer.tick(models)).not.toThrow();
      expect(renderer.__getCone('voyager-1')).toBeNull();
    });
  });
});

/**
 * Count `new ConeGeometry(...)` invocations during a scope. Three.js doesn't
 * expose a static counter; we spy on the constructor via the module export
 * for the duration of the callback.
 */
const countConeGeometryConstructions = (fn: () => void): number => {
  let count = 0;
  // Patch the ConeGeometry prototype's constructor-call surface by spying on
  // a known instance method that ConeGeometry calls during construction:
  // `setIndex`. Every ConeGeometry instance calls setIndex exactly once
  // during its constructor; counting those gives us the construction count.
  //
  // Alternative would be to monkey-patch the global ConeGeometry, but the
  // class is imported into boresight-renderer.ts at module load time so a
  // late spy can't intercept the constructor reference. The setIndex spy is
  // more robust.
  const proto = ConeGeometry.prototype;
  const origSetIndex = proto.setIndex;
  proto.setIndex = function (this: ConeGeometry, ...args: Parameters<typeof origSetIndex>) {
    count += 1;
    return origSetIndex.apply(this, args);
  };
  try {
    fn();
  } finally {
    proto.setIndex = origSetIndex;
  }
  return count;
};
