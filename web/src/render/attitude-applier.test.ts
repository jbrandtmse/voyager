// @vitest-environment happy-dom
/**
 * Story 3.4 — AttitudeApplier unit tests.
 *
 * Covers:
 *   - AC2: happy path (bus + platform quaternions written each tick)
 *   - AC2 clause 3: null hold-previous (quaternion unchanged when
 *     AttitudeService returns null)
 *   - AC2 last clause: visible=false skip (no AttitudeService calls, no
 *     getObjectByName for invisible spacecraft)
 *   - AC5: LOD-swap re-resolution (cached references invalidate on level
 *     change; refresh against the new LOD's named subtree)
 *   - AC3: zero-allocation contract — `Quaternion.copy` called exactly
 *     4 × N times across N ticks (2 spacecraft × bus + platform);
 *     `getObjectByName` called at most 4 times TOTAL (first-tick only).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Group, LOD, Quaternion } from 'three';

import { AttitudeApplier } from './attitude-applier';
import type { AttitudeService } from '../services/attitude-service';
import type { SpacecraftModels, SpacecraftHandle } from './spacecraft-models';
import type { Quaternion as BrandedQuaternion } from '../types/branded';
import { quaternion as brandedQuat } from '../types/branded';

// === Fixture builders ========================================================

interface FixtureSpacecraft {
  handle: SpacecraftHandle;
  busNode: Group;
  platformNode: Group;
}

/**
 * Build a minimal spacecraft fixture mirroring Story 3.3's named-hierarchy
 * contract. `group` is the spacecraft container; inside it is a single
 * synthetic LOD with one level (level 0) containing BUS + SCAN_PLATFORM
 * named children. The lod-level-0 subtree is the only level; LOD-swap
 * tests construct a multi-level variant separately.
 */
const buildFixture = (
  id: 'voyager-1' | 'voyager-2',
  options: {
    lodLevels?: number;
    initialLevel?: number;
  } = {},
): FixtureSpacecraft => {
  const lodLevels = options.lodLevels ?? 1;
  const initialLevel = options.initialLevel ?? 0;
  const naifId = id === 'voyager-1' ? -31 : -32;

  const group = new Group();
  group.name = id;
  group.visible = true;

  let lodInstance: LOD | null = null;
  let bus: Group;
  let platform: Group;

  if (lodLevels > 1) {
    // Multi-LOD fixture: build N levels each with its OWN BUS / SCAN_PLATFORM
    // named subtree. The `getCurrentLevel` mock will be overridden per-test.
    lodInstance = new LOD();
    lodInstance.name = `${id}-lod`;
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
    }
    group.add(lodInstance);
    // Default currentLevel resolution to the requested initialLevel.
    const targetLevelScene = lodInstance.levels[initialLevel].object;
    bus = targetLevelScene.getObjectByName('BUS') as Group;
    platform = targetLevelScene.getObjectByName('SCAN_PLATFORM') as Group;
    // Stub getCurrentLevel so tests can drive LOD-swap behaviour.
    let currentLevel = initialLevel;
    lodInstance.getCurrentLevel = (): number => currentLevel;
    (lodInstance as unknown as { __setLevelForTest: (n: number) => void }).__setLevelForTest = (n) => {
      currentLevel = n;
    };
  } else {
    bus = new Group();
    bus.name = 'BUS';
    platform = new Group();
    platform.name = 'SCAN_PLATFORM';
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

  return { handle, busNode: bus, platformNode: platform };
};

/**
 * Build a SpacecraftModels-shaped stub that returns the two fixtures. We
 * inject the bare minimum surface AttitudeApplier consumes — just
 * `getHandle(id)`.
 */
const buildModelsStub = (
  v1: FixtureSpacecraft,
  v2: FixtureSpacecraft,
): SpacecraftModels => {
  return {
    getHandle: (id: 'voyager-1' | 'voyager-2'): SpacecraftHandle =>
      id === 'voyager-1' ? v1.handle : v2.handle,
  } as unknown as SpacecraftModels;
};

/**
 * Build an AttitudeService stub with configurable per-call returns.
 * Tracks call counts for the zero-allocation assertion.
 */
interface AttitudeServiceStub {
  service: AttitudeService;
  getBusQuat: ReturnType<typeof vi.fn>;
  getPlatformQuat: ReturnType<typeof vi.fn>;
}

const buildAttitudeServiceStub = (returns: {
  busV1?: BrandedQuaternion | null;
  busV2?: BrandedQuaternion | null;
  platformV1?: BrandedQuaternion | null;
  platformV2?: BrandedQuaternion | null;
}): AttitudeServiceStub => {
  const getBusQuat = vi.fn((naifId: number) => {
    if (naifId === -31) return returns.busV1 ?? null;
    if (naifId === -32) return returns.busV2 ?? null;
    return null;
  });
  const getPlatformQuat = vi.fn((naifId: number) => {
    if (naifId === -31) return returns.platformV1 ?? null;
    if (naifId === -32) return returns.platformV2 ?? null;
    return null;
  });
  const service = {
    getBusQuat,
    getPlatformQuat,
  } as unknown as AttitudeService;
  return { service, getBusQuat, getPlatformQuat };
};

// === Tests ===================================================================

describe('AttitudeApplier', () => {
  let applier: AttitudeApplier;

  beforeEach(() => {
    applier = new AttitudeApplier();
  });

  describe('AC2 — happy path', () => {
    it('writes bus and platform quaternions onto the named nodes for both spacecraft', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      const busV1 = brandedQuat(0.1, 0.2, 0.3, Math.sqrt(1 - 0.14));
      const platformV1 = brandedQuat(0.4, 0.0, 0.0, Math.sqrt(1 - 0.16));
      const busV2 = brandedQuat(0.0, 0.5, 0.0, Math.sqrt(0.75));
      const platformV2 = brandedQuat(0.0, 0.0, 0.6, Math.sqrt(1 - 0.36));

      const { service } = buildAttitudeServiceStub({
        busV1,
        busV2,
        platformV1,
        platformV2,
      });

      applier.tick(1000, service, models);

      expect(v1.busNode.quaternion.x).toBeCloseTo(busV1.x, 12);
      expect(v1.busNode.quaternion.y).toBeCloseTo(busV1.y, 12);
      expect(v1.busNode.quaternion.z).toBeCloseTo(busV1.z, 12);
      expect(v1.busNode.quaternion.w).toBeCloseTo(busV1.w, 12);

      expect(v1.platformNode.quaternion.x).toBeCloseTo(platformV1.x, 12);
      expect(v1.platformNode.quaternion.w).toBeCloseTo(platformV1.w, 12);

      expect(v2.busNode.quaternion.y).toBeCloseTo(busV2.y, 12);
      expect(v2.platformNode.quaternion.z).toBeCloseTo(platformV2.z, 12);
    });

    it('uses Quaternion.copy (not reassignment) so the Object3D quaternion instance is preserved', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      const originalV1Bus = v1.busNode.quaternion;
      const originalV1Platform = v1.platformNode.quaternion;

      const { service } = buildAttitudeServiceStub({
        busV1: brandedQuat(0.1, 0, 0, Math.sqrt(0.99)),
        platformV1: brandedQuat(0, 0.2, 0, Math.sqrt(0.96)),
      });

      applier.tick(1000, service, models);

      // The node MUST still point at the same Three.Quaternion instance.
      expect(v1.busNode.quaternion).toBe(originalV1Bus);
      expect(v1.platformNode.quaternion).toBe(originalV1Platform);
    });
  });

  describe('AC2 clause 3 — null hold-previous', () => {
    it('leaves quaternion unchanged when AttitudeService.getBusQuat returns null on a later tick', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      // First tick: real quaternion.
      const busV1 = brandedQuat(0.1, 0.2, 0.3, Math.sqrt(1 - 0.14));
      const { service: service1 } = buildAttitudeServiceStub({
        busV1,
        platformV1: brandedQuat(0, 0, 0, 1),
      });
      applier.tick(1000, service1, models);

      const snapshotX = v1.busNode.quaternion.x;
      const snapshotY = v1.busNode.quaternion.y;
      const snapshotZ = v1.busNode.quaternion.z;
      const snapshotW = v1.busNode.quaternion.w;

      // Second tick: AttitudeService returns null → hold previous.
      const { service: service2 } = buildAttitudeServiceStub({
        busV1: null,
        platformV1: null,
      });
      applier.tick(2000, service2, models);

      expect(v1.busNode.quaternion.x).toBe(snapshotX);
      expect(v1.busNode.quaternion.y).toBe(snapshotY);
      expect(v1.busNode.quaternion.z).toBe(snapshotZ);
      expect(v1.busNode.quaternion.w).toBe(snapshotW);
    });

    it('leaves quaternion at initial identity when AttitudeService returns null on the very first tick', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      const { service } = buildAttitudeServiceStub({
        busV1: null,
        platformV1: null,
      });
      applier.tick(1000, service, models);

      // Three.js default Quaternion is (0, 0, 0, 1) — identity.
      expect(v1.busNode.quaternion.x).toBe(0);
      expect(v1.busNode.quaternion.y).toBe(0);
      expect(v1.busNode.quaternion.z).toBe(0);
      expect(v1.busNode.quaternion.w).toBe(1);
    });
  });

  describe('AC2 last clause — visible=false skip', () => {
    it('does NOT call AttitudeService or getObjectByName for invisible spacecraft', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      // Hide V1 (e.g., pre-launch ET or chunk-load gap).
      v1.handle.group.visible = false;

      const models = buildModelsStub(v1, v2);

      const v1GroupSpy = vi.spyOn(v1.handle.group, 'getObjectByName');
      const v2GroupSpy = vi.spyOn(v2.handle.group, 'getObjectByName');

      const { service, getBusQuat, getPlatformQuat } = buildAttitudeServiceStub({
        busV2: brandedQuat(0, 0, 0, 1),
        platformV2: brandedQuat(0, 0, 0, 1),
      });

      applier.tick(1000, service, models);

      // V1 was invisible → no work.
      expect(v1GroupSpy).not.toHaveBeenCalled();
      expect(getBusQuat).not.toHaveBeenCalledWith(-31, expect.any(Number));
      expect(getPlatformQuat).not.toHaveBeenCalledWith(-31, expect.any(Number));

      // V2 was visible → 2 getObjectByName calls (BUS + SCAN_PLATFORM).
      expect(v2GroupSpy).toHaveBeenCalledTimes(2);
      expect(getBusQuat).toHaveBeenCalledWith(-32, 1000);
      expect(getPlatformQuat).toHaveBeenCalledWith(-32, 1000);
    });
  });

  describe('AC5 — LOD-swap re-resolution', () => {
    it('invalidates cached BUS/SCAN_PLATFORM references when LOD level changes and re-resolves against new level subtree', () => {
      // Build a 3-LOD fixture; start at level 2 (cruise distance).
      const v1 = buildFixture('voyager-1', { lodLevels: 3, initialLevel: 2 });
      const v2 = buildFixture('voyager-2', { lodLevels: 3, initialLevel: 2 });
      const models = buildModelsStub(v1, v2);

      const lod = v1.handle.lod!;
      const level0Scene = lod.levels[0].object;
      const level2Scene = lod.levels[2].object;
      const level0Bus = level0Scene.getObjectByName('BUS')!;
      const level2Bus = level2Scene.getObjectByName('BUS')!;
      const level0Platform = level0Scene.getObjectByName('SCAN_PLATFORM')!;
      const level2Platform = level2Scene.getObjectByName('SCAN_PLATFORM')!;

      // Sanity check: each level has its OWN nodes (distinct identity).
      expect(level0Bus).not.toBe(level2Bus);
      expect(level0Platform).not.toBe(level2Platform);

      const busV1 = brandedQuat(0.5, 0, 0, Math.sqrt(0.75));
      const platformV1 = brandedQuat(0, 0.5, 0, Math.sqrt(0.75));
      const { service } = buildAttitudeServiceStub({
        busV1,
        platformV1,
      });

      // First tick at level 2 — applies to level-2 subtree.
      applier.tick(1000, service, models);
      expect(level2Bus.quaternion.x).toBeCloseTo(0.5, 12);
      expect(level2Platform.quaternion.y).toBeCloseTo(0.5, 12);
      // Level-0 subtree must NOT have been touched.
      expect(level0Bus.quaternion.x).toBe(0);
      expect(level0Platform.quaternion.y).toBe(0);

      // Camera zooms in — LOD switches to level 0.
      (lod as unknown as { __setLevelForTest: (n: number) => void }).__setLevelForTest(0);

      // Second tick — applier must invalidate cache and re-resolve to
      // level-0's BUS / SCAN_PLATFORM.
      applier.tick(2000, service, models);
      expect(level0Bus.quaternion.x).toBeCloseTo(0.5, 12);
      expect(level0Platform.quaternion.y).toBeCloseTo(0.5, 12);
    });

    it('does NOT re-resolve when LOD level is unchanged across ticks', () => {
      const v1 = buildFixture('voyager-1', { lodLevels: 3, initialLevel: 1 });
      const v2 = buildFixture('voyager-2', { lodLevels: 3, initialLevel: 1 });
      const models = buildModelsStub(v1, v2);

      const { service } = buildAttitudeServiceStub({
        busV1: brandedQuat(0, 0, 0, 1),
        platformV1: brandedQuat(0, 0, 0, 1),
        busV2: brandedQuat(0, 0, 0, 1),
        platformV2: brandedQuat(0, 0, 0, 1),
      });

      // With LOD present, the applier resolves against the active LOD
      // level's scene root, not the spacecraft group. Spy on the level-1
      // scene for both spacecraft.
      const v1LevelScene = v1.handle.lod!.levels[1].object;
      const v2LevelScene = v2.handle.lod!.levels[1].object;
      const v1Spy = vi.spyOn(v1LevelScene, 'getObjectByName');
      const v2Spy = vi.spyOn(v2LevelScene, 'getObjectByName');

      applier.tick(1000, service, models);
      applier.tick(2000, service, models);
      applier.tick(3000, service, models);

      // First tick should resolve 2 per spacecraft (BUS + SCAN_PLATFORM).
      // Subsequent ticks reuse the cache → 0 additional calls.
      expect(v1Spy).toHaveBeenCalledTimes(2);
      expect(v2Spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('AC3 — zero-allocation contract', () => {
    it('over 100 ticks: copy() called exactly 4×100, getObjectByName called at most 4 times TOTAL', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      // Spy on Quaternion.prototype.copy globally to count writes.
      const copySpy = vi.spyOn(Quaternion.prototype, 'copy');

      // Spy on each spacecraft group's getObjectByName.
      const v1Spy = vi.spyOn(v1.handle.group, 'getObjectByName');
      const v2Spy = vi.spyOn(v2.handle.group, 'getObjectByName');

      const { service } = buildAttitudeServiceStub({
        busV1: brandedQuat(0.1, 0.2, 0.3, Math.sqrt(1 - 0.14)),
        busV2: brandedQuat(0.4, 0.0, 0.0, Math.sqrt(1 - 0.16)),
        platformV1: brandedQuat(0.0, 0.5, 0.0, Math.sqrt(0.75)),
        platformV2: brandedQuat(0.0, 0.0, 0.6, Math.sqrt(1 - 0.36)),
      });

      const N = 100;
      for (let i = 0; i < N; i += 1) {
        applier.tick(1000 + i, service, models);
      }

      // 2 spacecraft × (bus + platform) = 4 copy() calls per tick.
      // Over 100 ticks: 400 expected. (The spy may also catch the
      // copy() calls inside Three.js internals — we tighten this with
      // "at most" if needed, but our happy-dom fixture has no internal
      // copy paths.)
      expect(copySpy).toHaveBeenCalledTimes(4 * N);

      // First-tick resolution only: 2 calls per spacecraft (BUS + SCAN_PLATFORM).
      // No LOD-level swaps in this fixture (single-level), so no
      // subsequent re-resolution.
      expect(v1Spy.mock.calls.length + v2Spy.mock.calls.length).toBeLessThanOrEqual(4);

      copySpy.mockRestore();
    });
  });

  describe('LOD handle fallback (legacy single-LOD path)', () => {
    it('handles handle.lod === null gracefully (Story 3.3 AC5 fallback path)', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      // Force the legacy path: handle.lod is null. The cache's
      // cachedLodLevel will also be null and stay null — no re-resolution.
      (v1.handle as { lod: LOD | null }).lod = null;
      (v2.handle as { lod: LOD | null }).lod = null;

      const models = buildModelsStub(v1, v2);
      const { service } = buildAttitudeServiceStub({
        busV1: brandedQuat(0.3, 0, 0, Math.sqrt(0.91)),
        platformV1: brandedQuat(0, 0.3, 0, Math.sqrt(0.91)),
        busV2: brandedQuat(0, 0, 0, 1),
        platformV2: brandedQuat(0, 0, 0, 1),
      });

      const v1Spy = vi.spyOn(v1.handle.group, 'getObjectByName');

      applier.tick(1000, service, models);
      applier.tick(2000, service, models);
      applier.tick(3000, service, models);

      // First tick resolves; subsequent ticks reuse.
      expect(v1Spy).toHaveBeenCalledTimes(2);
      expect(v1.busNode.quaternion.x).toBeCloseTo(0.3, 12);
    });
  });

  describe('__resetCachesForTests', () => {
    it('clears both caches forcing re-resolution on next tick', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      const { service } = buildAttitudeServiceStub({
        busV1: brandedQuat(0, 0, 0, 1),
        platformV1: brandedQuat(0, 0, 0, 1),
      });

      const v1Spy = vi.spyOn(v1.handle.group, 'getObjectByName');

      applier.tick(1000, service, models);
      expect(v1Spy).toHaveBeenCalledTimes(2);

      applier.__resetCachesForTests();
      applier.tick(2000, service, models);
      expect(v1Spy).toHaveBeenCalledTimes(4); // 2 more resolutions
    });
  });

  describe('Story 5.2 AC3 — pbdOverrideProvider (platform-quat override-first check)', () => {
    it('applies the override quaternion onto SCAN_PLATFORM when provider returns non-null', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      const overrideQ = brandedQuat(0.5, 0.5, 0.0, Math.sqrt(0.5));
      const serviceQ = brandedQuat(0, 0, 0, 1);
      const { service, getPlatformQuat } = buildAttitudeServiceStub({
        busV1: brandedQuat(0, 0, 0, 1),
        busV2: brandedQuat(0, 0, 0, 1),
        platformV1: serviceQ,
        platformV2: serviceQ,
      });

      const provider = {
        getPlatformQuatOverride: vi.fn((naifId: number) =>
          naifId === -31 ? overrideQ : null,
        ),
      };
      applier.pbdOverrideProvider = provider;

      applier.tick(1000, service, models);

      // V1: override wins over service.
      expect(v1.platformNode.quaternion.x).toBeCloseTo(overrideQ.x, 12);
      expect(v1.platformNode.quaternion.y).toBeCloseTo(overrideQ.y, 12);
      expect(v1.platformNode.quaternion.z).toBeCloseTo(overrideQ.z, 12);
      expect(v1.platformNode.quaternion.w).toBeCloseTo(overrideQ.w, 12);

      // The service's getPlatformQuat MUST NOT have been called for V1
      // (override-first short-circuit).
      expect(getPlatformQuat).not.toHaveBeenCalledWith(-31, expect.any(Number));
      // V2: provider returned null, fall through to service.
      expect(getPlatformQuat).toHaveBeenCalledWith(-32, 1000);
      expect(v2.platformNode.quaternion.x).toBeCloseTo(0, 12);
      expect(v2.platformNode.quaternion.w).toBeCloseTo(1, 12);
    });

    it('falls through to AttitudeService.getPlatformQuat when override returns null for V1', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      const serviceQ = brandedQuat(0.1, 0.2, 0.3, Math.sqrt(1 - 0.14));
      const { service, getPlatformQuat } = buildAttitudeServiceStub({
        busV1: brandedQuat(0, 0, 0, 1),
        busV2: brandedQuat(0, 0, 0, 1),
        platformV1: serviceQ,
        platformV2: serviceQ,
      });

      const provider = {
        getPlatformQuatOverride: vi.fn(() => null),
      };
      applier.pbdOverrideProvider = provider;

      applier.tick(1000, service, models);

      // V1: service quat applied (override returned null).
      expect(v1.platformNode.quaternion.x).toBeCloseTo(serviceQ.x, 12);
      expect(v1.platformNode.quaternion.w).toBeCloseTo(serviceQ.w, 12);
      expect(getPlatformQuat).toHaveBeenCalledWith(-31, 1000);
      expect(getPlatformQuat).toHaveBeenCalledWith(-32, 1000);
    });

    it('does NOT override the BUS quaternion (AC2 — PBD acts on platform only)', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      const busQ = brandedQuat(0.4, 0, 0, Math.sqrt(0.84));
      const overrideQ = brandedQuat(0.5, 0.5, 0.0, Math.sqrt(0.5));
      const { service, getBusQuat } = buildAttitudeServiceStub({
        busV1: busQ,
        busV2: brandedQuat(0, 0, 0, 1),
        platformV1: brandedQuat(0, 0, 0, 1),
        platformV2: brandedQuat(0, 0, 0, 1),
      });

      const provider = {
        getPlatformQuatOverride: vi.fn(() => overrideQ),
      };
      applier.pbdOverrideProvider = provider;

      applier.tick(1000, service, models);

      // Bus quaternion = AttitudeService value, NOT the override.
      expect(v1.busNode.quaternion.x).toBeCloseTo(busQ.x, 12);
      expect(getBusQuat).toHaveBeenCalledWith(-31, 1000);
    });

    it('pbdOverrideProvider null (default) — applier behaves identically to pre-5.2 baseline', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      // Default: no provider set.
      expect(applier.pbdOverrideProvider).toBe(null);

      const platformV1 = brandedQuat(0.1, 0, 0, Math.sqrt(0.99));
      const { service } = buildAttitudeServiceStub({
        busV1: brandedQuat(0, 0, 0, 1),
        busV2: brandedQuat(0, 0, 0, 1),
        platformV1,
        platformV2: brandedQuat(0, 0, 0, 1),
      });

      applier.tick(1000, service, models);

      expect(v1.platformNode.quaternion.x).toBeCloseTo(platformV1.x, 12);
      expect(v1.platformNode.quaternion.w).toBeCloseTo(platformV1.w, 12);
    });
  });
});
