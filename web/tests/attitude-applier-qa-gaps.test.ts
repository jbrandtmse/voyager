// @vitest-environment happy-dom
/**
 * Story 3.4 — QA gap suite (cross-cutting integration coverage).
 *
 * Dev-3-4 shipped 10 unit + 5 integration tests covering the AC2/AC3/AC5
 * happy paths and the AC8 boot-stack integration. This QA gap file fills
 * the cross-cutting gaps the dev suite does not exercise (per epic-cycle
 * lead's QA brief on Story 3.4 handoff):
 *
 *   1. **AC5 LOD-handle transition: non-null → null mid-life** — the dev
 *      tests cover the case where handle.lod stays null (legacy fallback)
 *      and the case where it stays non-null across an LOD-level swap. The
 *      QA brief calls out a third case: handle.lod was non-null on tick 1
 *      (cache resolved against the active level's subtree), then becomes
 *      null on a subsequent tick (e.g., a recovery path that re-attaches a
 *      single-LOD fallback after a load failure). The cached nodes belong
 *      to a now-detached subtree. The applier MUST detect the transition
 *      and re-resolve against handle.group.
 *
 *   2. **AC2 cross-spacecraft asymmetry: V1 CK while V2 holds previous** —
 *      a realistic ET pattern: V1 sits inside a CK window (getBusQuat
 *      returns a non-null SLERP'd quaternion); V2 is at an ET where its CK
 *      file is not yet loaded and EphemerisService also returns null (so
 *      synthesized falls back to null). V1 must update while V2 holds. The
 *      dev tests verify each cell of the matrix in isolation but never the
 *      cross-spacecraft mixing.
 *
 *   3. **AC3 integration-tier zero-allocation: instance identity over many
 *      ticks** — the dev integration test asserts `Quaternion.prototype.copy`
 *      call counts; the unit test asserts identity is preserved after one
 *      tick. A future regression along the AttitudeService → Applier →
 *      Object3D chain that swapped `node.quaternion = freshQuat` for the
 *      `.copy(...)` write would pass the unit test if scoped narrowly. The
 *      QA gap asserts the BUS / SCAN_PLATFORM Quaternion instance IDENTITY
 *      is preserved across 200 ticks AND the quaternion object's values
 *      track the AttitudeService output (compound assertion: identity
 *      preserved AND values flow through).
 *
 *   4. **AC7 boundary discipline: adjacent-ET writes across CK ↔ synthesized
 *      regime** — at the manifest-driven boundary instant the AttitudeService
 *      transitions from 'ck' to 'synthesized' (or vice versa) as a step
 *      function. The Applier must transparently write both regimes' outputs
 *      at adjacent ETs — no smoothing, no lag, no stale cache. The dev
 *      integration test exercises CK and synthesized in separate sub-tests;
 *      this gap test asserts the transition is captured in two consecutive
 *      ticks against the same applier instance.
 *
 *   5. **AC5 edge case: handle.lod.getCurrentLevel() === -1 (no LOD level
 *      matches)** — Three.js returns -1 from `getCurrentLevel()` before
 *      the first `renderer.render(...)` call selects a level (or in tests
 *      that don't render). The dev unit test stubs `getCurrentLevel` to a
 *      valid integer; the integration test relies on Three.js's default
 *      behaviour (which may also return -1 in headless test harnesses).
 *      The applier's source falls back to `handle.group` when
 *      `currentLevel < 0`, but no test pins this behaviour. The QA gap
 *      asserts that with `getCurrentLevel === -1`, the BUS / SCAN_PLATFORM
 *      resolution still succeeds (via the handle.group walk) and the
 *      quaternion writes still happen.
 *
 *   6. **AC2 visible=true → false → true transition** — defense against a
 *      regression where the visibility-skip path leaves the cache in a
 *      bad state. The dev test only exercises a permanently-invisible
 *      spacecraft. The Applier's per-tick "if (!visible) return" runs
 *      BEFORE the LOD-level read, so a subsequent visible=true tick must
 *      pick up where the previous visible=true tick left off — same cache,
 *      no spurious re-resolution unless the LOD level changed.
 *
 *   7. **AC9 __voyagerDebug.attitudeApplier surface contract** — mirrors
 *      the Story 3.2 / 3.3 QA gap pattern. The lead-driven MCP smoke
 *      evaluates `window.__voyagerDebug.attitudeApplier.tick(...)`; if a
 *      future refactor tree-shakes the publication, the lead's probes
 *      silently degrade. This gap test source-greps `main.ts` to verify
 *      the DEV-gated publication and the spread-preserve invariant (the
 *      attitudeApplier publication does NOT overwrite the coexisting
 *      attitudeService / spacecraftModels surfaces).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Group, LOD } from 'three';

import { AttitudeApplier } from '../src/render/attitude-applier';
import type { AttitudeService } from '../src/services/attitude-service';
import type {
  SpacecraftModels,
  SpacecraftHandle,
} from '../src/render/spacecraft-models';
import type { Quaternion as BrandedQuaternion } from '../src/types/branded';
import { quaternion as brandedQuat } from '../src/types/branded';

// === Fixture builders (mirror attitude-applier.test.ts) =====================

interface FixtureSpacecraft {
  handle: SpacecraftHandle;
  busNode: Group;
  platformNode: Group;
}

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
    const targetLevelScene = lodInstance.levels[initialLevel].object;
    bus = targetLevelScene.getObjectByName('BUS') as Group;
    platform = targetLevelScene.getObjectByName('SCAN_PLATFORM') as Group;
    let currentLevel = initialLevel;
    lodInstance.getCurrentLevel = (): number => currentLevel;
    (lodInstance as unknown as { __setLevelForTest: (n: number) => void }).__setLevelForTest = (
      n,
    ) => {
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

const buildModelsStub = (
  v1: FixtureSpacecraft,
  v2: FixtureSpacecraft,
): SpacecraftModels => {
  return {
    getHandle: (id: 'voyager-1' | 'voyager-2'): SpacecraftHandle =>
      id === 'voyager-1' ? v1.handle : v2.handle,
  } as unknown as SpacecraftModels;
};

interface AttitudeReturns {
  busV1?: BrandedQuaternion | null;
  busV2?: BrandedQuaternion | null;
  platformV1?: BrandedQuaternion | null;
  platformV2?: BrandedQuaternion | null;
}

const buildAttitudeServiceStub = (
  returns: AttitudeReturns,
): {
  service: AttitudeService;
  getBusQuat: ReturnType<typeof vi.fn>;
  getPlatformQuat: ReturnType<typeof vi.fn>;
} => {
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

// =============================================================================

describe('AttitudeApplier — QA gaps', () => {
  let applier: AttitudeApplier;

  beforeEach(() => {
    applier = new AttitudeApplier();
  });

  describe('QA gap 1 — AC5 LOD-handle transition: non-null → null mid-life', () => {
    it('invalidates cached nodes when handle.lod transitions from non-null to null (re-resolves against handle.group)', () => {
      // Tick 1: 3-LOD fixture with active level 0. Cache resolves against
      // the level-0 scene subtree. Cache: { busNode = level0BUS, platformNode = level0PLATFORM, cachedLodLevel = 0 }.
      const v1 = buildFixture('voyager-1', { lodLevels: 3, initialLevel: 0 });
      const v2 = buildFixture('voyager-2', { lodLevels: 3, initialLevel: 0 });
      const models = buildModelsStub(v1, v2);

      const lod = v1.handle.lod!;
      const level0Bus = lod.levels[0].object.getObjectByName('BUS') as Group;
      const level0Platform = lod.levels[0].object.getObjectByName('SCAN_PLATFORM') as Group;

      // Initial apply: writes go to level-0 subtree's BUS/PLATFORM.
      const busV1A = brandedQuat(0.3, 0, 0, Math.sqrt(0.91));
      const platformV1A = brandedQuat(0, 0.3, 0, Math.sqrt(0.91));
      const stub1 = buildAttitudeServiceStub({
        busV1: busV1A,
        platformV1: platformV1A,
      });
      applier.tick(1000, stub1.service, models);
      expect(level0Bus.quaternion.x).toBeCloseTo(0.3, 12);
      expect(level0Platform.quaternion.y).toBeCloseTo(0.3, 12);

      // Simulate a recovery / detach: the LOD instance is replaced with a
      // legacy single-LOD fallback where handle.lod === null and the
      // spacecraft has a direct BUS / SCAN_PLATFORM child on the group.
      // The cached level-0 nodes are still attached to the (now-orphaned)
      // LOD instance. The applier must detect the transition (currentLevel
      // changes from 0 → null) and re-resolve against handle.group.
      const fallbackBus = new Group();
      fallbackBus.name = 'BUS';
      const fallbackPlatform = new Group();
      fallbackPlatform.name = 'SCAN_PLATFORM';
      v1.handle.group.remove(lod);
      v1.handle.group.add(fallbackBus);
      v1.handle.group.add(fallbackPlatform);
      (v1.handle as { lod: LOD | null }).lod = null;

      const busV1B = brandedQuat(0.5, 0, 0, Math.sqrt(0.75));
      const platformV1B = brandedQuat(0, 0.5, 0, Math.sqrt(0.75));
      const stub2 = buildAttitudeServiceStub({
        busV1: busV1B,
        platformV1: platformV1B,
      });
      applier.tick(2000, stub2.service, models);

      // The fallback BUS / SCAN_PLATFORM nodes (newly attached to
      // handle.group, NOT children of the removed LOD) MUST have received
      // the second-tick quaternion writes.
      expect(fallbackBus.quaternion.x).toBeCloseTo(0.5, 12);
      expect(fallbackPlatform.quaternion.y).toBeCloseTo(0.5, 12);

      // The orphaned level-0 nodes (still living inside the detached LOD
      // graph) must NOT have received the second-tick writes — they retain
      // the tick-1 values (0.3 / 0.3), defending against the bug where the
      // applier wrote to the wrong subtree because the LOD-null transition
      // wasn't detected.
      expect(level0Bus.quaternion.x).toBeCloseTo(0.3, 12);
      expect(level0Platform.quaternion.y).toBeCloseTo(0.3, 12);
    });
  });

  describe('QA gap 2 — AC2 cross-spacecraft asymmetry (V1 CK while V2 holds)', () => {
    it('applies V1 bus quaternion while V2 holds previous when V2 attitude is null', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      // Tick 1: both V1 and V2 have valid CK / synthesized quaternions.
      const v1InitialBus = brandedQuat(0.2, 0, 0, Math.sqrt(0.96));
      const v2InitialBus = brandedQuat(0, 0.2, 0, Math.sqrt(0.96));
      const stub1 = buildAttitudeServiceStub({
        busV1: v1InitialBus,
        platformV1: brandedQuat(0, 0, 0, 1),
        busV2: v2InitialBus,
        platformV2: brandedQuat(0, 0, 0, 1),
      });
      applier.tick(1000, stub1.service, models);

      // Snapshot V2's quaternion after tick 1.
      const v2BusSnapshotX = v2.busNode.quaternion.x;
      const v2BusSnapshotY = v2.busNode.quaternion.y;
      const v2BusSnapshotZ = v2.busNode.quaternion.z;
      const v2BusSnapshotW = v2.busNode.quaternion.w;

      // Tick 2: V1 CK still returns valid quat; V2 returns null (e.g., V2 CK
      // file not yet loaded AND EphemerisService can't resolve V2 position
      // for the synthesized fallback — both regimes blocked).
      const v1NextBus = brandedQuat(0.7, 0, 0, Math.sqrt(0.51));
      const stub2 = buildAttitudeServiceStub({
        busV1: v1NextBus,
        platformV1: brandedQuat(0, 0, 0, 1),
        busV2: null,
        platformV2: null,
      });
      applier.tick(2000, stub2.service, models);

      // V1 MUST have updated to the tick-2 quaternion.
      expect(v1.busNode.quaternion.x).toBeCloseTo(0.7, 12);

      // V2 MUST have HELD the tick-1 quaternion (no flicker on cross-spacecraft
      // asymmetry).
      expect(v2.busNode.quaternion.x).toBe(v2BusSnapshotX);
      expect(v2.busNode.quaternion.y).toBe(v2BusSnapshotY);
      expect(v2.busNode.quaternion.z).toBe(v2BusSnapshotZ);
      expect(v2.busNode.quaternion.w).toBe(v2BusSnapshotW);
    });

    it('applies V2 platform while V1 platform holds when V1 platform CK is missing but V2 CK is valid', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      // Tick 1: both spacecraft platforms have valid quats.
      const stub1 = buildAttitudeServiceStub({
        busV1: brandedQuat(0, 0, 0, 1),
        busV2: brandedQuat(0, 0, 0, 1),
        platformV1: brandedQuat(0.4, 0, 0, Math.sqrt(0.84)),
        platformV2: brandedQuat(0, 0.4, 0, Math.sqrt(0.84)),
      });
      applier.tick(1000, stub1.service, models);

      const v1PlatformSnap = {
        x: v1.platformNode.quaternion.x,
        y: v1.platformNode.quaternion.y,
        z: v1.platformNode.quaternion.z,
        w: v1.platformNode.quaternion.w,
      };

      // Tick 2: V1 platform CK is missing (PBD-style asymmetry — V1 bus CK
      // exists but platform CK was not baked for this window); V2 platform
      // CK is valid.
      const stub2 = buildAttitudeServiceStub({
        busV1: brandedQuat(0, 0, 0, 1),
        busV2: brandedQuat(0, 0, 0, 1),
        platformV1: null, // missing
        platformV2: brandedQuat(0, 0.8, 0, Math.sqrt(0.36)),
      });
      applier.tick(2000, stub2.service, models);

      // V1 platform held the tick-1 value.
      expect(v1.platformNode.quaternion.x).toBe(v1PlatformSnap.x);
      expect(v1.platformNode.quaternion.y).toBe(v1PlatformSnap.y);
      expect(v1.platformNode.quaternion.z).toBe(v1PlatformSnap.z);
      expect(v1.platformNode.quaternion.w).toBe(v1PlatformSnap.w);

      // V2 platform updated to tick-2 value.
      expect(v2.platformNode.quaternion.y).toBeCloseTo(0.8, 12);
    });
  });

  describe('QA gap 3 — AC3 integration-tier zero-allocation: instance identity over many ticks', () => {
    it('preserves BUS / SCAN_PLATFORM Quaternion instance identity across 200 ticks with values tracking AttitudeService', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      const initialV1Bus = v1.busNode.quaternion;
      const initialV1Platform = v1.platformNode.quaternion;
      const initialV2Bus = v2.busNode.quaternion;
      const initialV2Platform = v2.platformNode.quaternion;

      // Drive 200 ticks with varying quaternion outputs to ensure the
      // applier mutates rather than reassigns. If a regression replaced
      // `cache.busNode.quaternion.copy(q)` with `cache.busNode.quaternion =
      // freshQuat`, the instance identity would diverge.
      const N = 200;
      for (let i = 0; i < N; i += 1) {
        const t = (i / N) * Math.PI;
        const stub = buildAttitudeServiceStub({
          busV1: brandedQuat(Math.sin(t), 0, 0, Math.cos(t)),
          platformV1: brandedQuat(0, Math.sin(t), 0, Math.cos(t)),
          busV2: brandedQuat(0, 0, Math.sin(t), Math.cos(t)),
          platformV2: brandedQuat(Math.sin(t * 2), 0, 0, Math.cos(t * 2)),
        });
        applier.tick(1000 + i, stub.service, models);
      }

      // Identity preserved — the SAME Quaternion instances live on the
      // Object3D nodes across all 200 ticks.
      expect(v1.busNode.quaternion).toBe(initialV1Bus);
      expect(v1.platformNode.quaternion).toBe(initialV1Platform);
      expect(v2.busNode.quaternion).toBe(initialV2Bus);
      expect(v2.platformNode.quaternion).toBe(initialV2Platform);

      // Values reflect the FINAL tick's AttitudeService output (not stale,
      // not stuck at identity).
      const finalT = ((N - 1) / N) * Math.PI;
      expect(v1.busNode.quaternion.x).toBeCloseTo(Math.sin(finalT), 12);
      expect(v1.busNode.quaternion.w).toBeCloseTo(Math.cos(finalT), 12);
      expect(v2.platformNode.quaternion.x).toBeCloseTo(Math.sin(finalT * 2), 12);
    });

    it('AttitudeService.getBusQuat/getPlatformQuat are called exactly once per spacecraft per tick (no double-query)', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      const { service, getBusQuat, getPlatformQuat } = buildAttitudeServiceStub({
        busV1: brandedQuat(0, 0, 0, 1),
        platformV1: brandedQuat(0, 0, 0, 1),
        busV2: brandedQuat(0, 0, 0, 1),
        platformV2: brandedQuat(0, 0, 0, 1),
      });

      const N = 50;
      for (let i = 0; i < N; i += 1) {
        applier.tick(1000 + i, service, models);
      }

      // Across N ticks × 2 spacecraft → 2*N calls to each of
      // getBusQuat / getPlatformQuat. Defends against a regression that
      // re-queries the service (e.g., separate bus + platform queries that
      // cascade through the AttitudeService cache twice per spacecraft).
      expect(getBusQuat).toHaveBeenCalledTimes(2 * N);
      expect(getPlatformQuat).toHaveBeenCalledTimes(2 * N);
    });
  });

  describe('QA gap 4 — AC7 boundary discipline: adjacent-ET writes across CK ↔ synthesized regime', () => {
    it('applies CK quaternion at boundary-T then synthesized quaternion at boundary-T - 1 in two consecutive ticks (transparent step function)', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      // Simulate the AC7 boundary: at et = T, AttitudeService returns the
      // CK SLERP'd quaternion; at et = T - 1 (one second before the CK
      // window opens), it returns a DIFFERENT quaternion (the synthesized
      // HGA-Earth-pointing result). The applier must transparently write
      // both regimes' outputs at adjacent ticks — no smoothing, no lag.
      const ckQuat = brandedQuat(0.6, 0.0, 0.0, Math.sqrt(0.64)); // arbitrary CK orientation
      const synthQuat = brandedQuat(0.0, 0.0, 0.9, Math.sqrt(0.19)); // arbitrary synth orientation
      const boundaryT = -657_000_000;

      // Tick at synthesized regime (just before boundary).
      const stubSynth = buildAttitudeServiceStub({
        busV1: synthQuat,
        platformV1: synthQuat,
        busV2: brandedQuat(0, 0, 0, 1),
        platformV2: brandedQuat(0, 0, 0, 1),
      });
      applier.tick(boundaryT - 1, stubSynth.service, models);
      expect(v1.busNode.quaternion.z).toBeCloseTo(0.9, 12);
      expect(v1.platformNode.quaternion.z).toBeCloseTo(0.9, 12);

      // Tick at CK regime (one second after boundary).
      const stubCk = buildAttitudeServiceStub({
        busV1: ckQuat,
        platformV1: ckQuat,
        busV2: brandedQuat(0, 0, 0, 1),
        platformV2: brandedQuat(0, 0, 0, 1),
      });
      applier.tick(boundaryT, stubCk.service, models);
      expect(v1.busNode.quaternion.x).toBeCloseTo(0.6, 12);
      expect(v1.platformNode.quaternion.x).toBeCloseTo(0.6, 12);

      // Critically: the new CK regime's z-component is 0 (NOT the prior
      // synth quat's 0.9). The applier transparently wrote the discontinuous
      // value — no smoothing.
      expect(v1.busNode.quaternion.z).toBeCloseTo(0.0, 12);
      expect(v1.platformNode.quaternion.z).toBeCloseTo(0.0, 12);
    });

    it('discontinuous quaternion transitions are passed through verbatim (no shortest-path adjustment by the applier)', () => {
      // ADR-0024 places the sign-flip discipline at bake time, not runtime.
      // The applier is a dumb copy — it MUST NOT shortest-path adjust the
      // quaternion. A regression that called slerp-with-shortest-path here
      // would mask a missing bake-side walk. This test feeds two quaternions
      // that differ by a sign flip and asserts the applier writes BOTH
      // verbatim across consecutive ticks.
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      const q = brandedQuat(0.1, 0.2, 0.3, Math.sqrt(1 - 0.14));
      const qFlipped = brandedQuat(-q.x, -q.y, -q.z, -q.w); // double-cover sign flip

      applier.tick(1000, buildAttitudeServiceStub({ busV1: q, platformV1: q }).service, models);
      expect(v1.busNode.quaternion.x).toBeCloseTo(q.x, 12);

      applier.tick(2000, buildAttitudeServiceStub({ busV1: qFlipped, platformV1: qFlipped }).service, models);
      expect(v1.busNode.quaternion.x).toBeCloseTo(-q.x, 12);
      expect(v1.busNode.quaternion.w).toBeCloseTo(-q.w, 12);
    });
  });

  describe('QA gap 5 — AC5 edge case: handle.lod.getCurrentLevel() === -1', () => {
    it('falls back to handle.group walk when LOD currentLevel is -1 (no level matched)', () => {
      // Build a multi-LOD fixture but stub getCurrentLevel to return -1.
      // Three.js can return -1 in headless test environments before the
      // first renderer.render(...) call selects a level — the applier
      // source falls back to handle.group's depth-first walk when
      // `currentLevel < 0`, but no dev test pins this behaviour.
      const v1 = buildFixture('voyager-1', { lodLevels: 3, initialLevel: 0 });
      const v2 = buildFixture('voyager-2', { lodLevels: 3, initialLevel: 0 });
      const models = buildModelsStub(v1, v2);

      // Override getCurrentLevel to -1.
      v1.handle.lod!.getCurrentLevel = (): number => -1;
      v2.handle.lod!.getCurrentLevel = (): number => -1;

      const stub = buildAttitudeServiceStub({
        busV1: brandedQuat(0.5, 0, 0, Math.sqrt(0.75)),
        platformV1: brandedQuat(0, 0.5, 0, Math.sqrt(0.75)),
        busV2: brandedQuat(0, 0, 0.5, Math.sqrt(0.75)),
        platformV2: brandedQuat(0.5, 0.5, 0, Math.sqrt(0.5)),
      });

      // Tick must NOT throw despite the -1 currentLevel. The applier
      // resolves BUS / SCAN_PLATFORM via handle.group.getObjectByName
      // (which walks depth-first across all LOD levels) — the walk
      // returns SOME bus / platform node (the first match wins).
      expect(() => applier.tick(1000, stub.service, models)).not.toThrow();

      // Find which subtree was written to. handle.group's depth-first walk
      // returns the FIRST BUS / SCAN_PLATFORM in traversal order — that's
      // the level-0 subtree's bus, since addLevel(level0, 0) was called
      // first.
      const v1Lod = v1.handle.lod!;
      const level0Bus = v1Lod.levels[0].object.getObjectByName('BUS') as Group;
      const level0Platform = v1Lod.levels[0].object.getObjectByName(
        'SCAN_PLATFORM',
      ) as Group;
      expect(level0Bus.quaternion.x).toBeCloseTo(0.5, 12);
      expect(level0Platform.quaternion.y).toBeCloseTo(0.5, 12);
    });

    it('re-resolves correctly when LOD transitions from -1 to a valid level (first render pass)', () => {
      // Simulates the boot sequence: tick 1 happens before any LOD level
      // has been selected (currentLevel returns -1); tick 2 happens after
      // the first renderer.render(...) selects level 0. The applier must
      // detect the transition (-1 → 0) and re-resolve against the level-0
      // subtree.
      const v1 = buildFixture('voyager-1', { lodLevels: 3, initialLevel: 0 });
      const v2 = buildFixture('voyager-2', { lodLevels: 3, initialLevel: 0 });
      const models = buildModelsStub(v1, v2);

      let v1Level = -1;
      let v2Level = -1;
      v1.handle.lod!.getCurrentLevel = (): number => v1Level;
      v2.handle.lod!.getCurrentLevel = (): number => v2Level;

      const stub = buildAttitudeServiceStub({
        busV1: brandedQuat(0.3, 0, 0, Math.sqrt(0.91)),
        platformV1: brandedQuat(0, 0.3, 0, Math.sqrt(0.91)),
        busV2: brandedQuat(0, 0.3, 0, Math.sqrt(0.91)),
        platformV2: brandedQuat(0.3, 0, 0, Math.sqrt(0.91)),
      });

      applier.tick(1000, stub.service, models);

      // After tick 1, the cache resolved against handle.group (since
      // currentLevel was -1, the fallback path). cachedLodLevel is now -1.

      // Simulate renderer.render selecting level 0.
      v1Level = 0;
      v2Level = 0;

      const stub2 = buildAttitudeServiceStub({
        busV1: brandedQuat(0.7, 0, 0, Math.sqrt(0.51)),
        platformV1: brandedQuat(0, 0.7, 0, Math.sqrt(0.51)),
        busV2: brandedQuat(0, 0.7, 0, Math.sqrt(0.51)),
        platformV2: brandedQuat(0.7, 0, 0, Math.sqrt(0.51)),
      });
      applier.tick(2000, stub2.service, models);

      // Level-0 subtree's BUS now reflects the tick-2 quat.
      const level0Bus = v1.handle.lod!.levels[0].object.getObjectByName('BUS') as Group;
      expect(level0Bus.quaternion.x).toBeCloseTo(0.7, 12);
    });
  });

  describe('QA gap 6 — AC2 visible=true → false → true transition (cache preservation)', () => {
    it('preserves cache across a visible=false tick and resumes writes when visible=true again', () => {
      const v1 = buildFixture('voyager-1');
      const v2 = buildFixture('voyager-2');
      const models = buildModelsStub(v1, v2);

      // Tick 1: both visible. Cache resolves.
      const stub1 = buildAttitudeServiceStub({
        busV1: brandedQuat(0.1, 0, 0, Math.sqrt(0.99)),
        platformV1: brandedQuat(0, 0.1, 0, Math.sqrt(0.99)),
      });
      applier.tick(1000, stub1.service, models);
      expect(v1.busNode.quaternion.x).toBeCloseTo(0.1, 12);

      // Tick 2: V1 becomes invisible (chunk-load gap). No work for V1.
      v1.handle.group.visible = false;
      const stub2 = buildAttitudeServiceStub({
        busV1: brandedQuat(0.5, 0, 0, Math.sqrt(0.75)),
        platformV1: brandedQuat(0, 0.5, 0, Math.sqrt(0.75)),
      });
      applier.tick(2000, stub2.service, models);
      // V1 held the tick-1 value because it was invisible.
      expect(v1.busNode.quaternion.x).toBeCloseTo(0.1, 12);

      // Tick 3: V1 becomes visible again. Cache must NOT have been
      // invalidated; the same BUS / SCAN_PLATFORM nodes are reused. The
      // tick-3 quaternion writes through.
      v1.handle.group.visible = true;
      const v1GroupSpy = vi.spyOn(v1.handle.group, 'getObjectByName');
      const stub3 = buildAttitudeServiceStub({
        busV1: brandedQuat(0.9, 0, 0, Math.sqrt(0.19)),
        platformV1: brandedQuat(0, 0.9, 0, Math.sqrt(0.19)),
      });
      applier.tick(3000, stub3.service, models);
      expect(v1.busNode.quaternion.x).toBeCloseTo(0.9, 12);
      // No re-resolution — the cache held.
      expect(v1GroupSpy).not.toHaveBeenCalled();
    });
  });

  describe('QA gap 7 — AC9 __voyagerDebug.attitudeApplier surface contract (source-grep)', () => {
    it('main.ts publishes __voyagerDebug.attitudeApplier under import.meta.env.DEV alongside attitudeService', () => {
      // Source-grep main.ts to verify the publication contract. Mirrors
      // qa-3-2's attitude-service surface-contract test and qa-3-3's
      // spacecraft-models surface-contract test. If a future refactor
      // tree-shakes the publication or moves it out of the DEV gate, this
      // test fails loudly at the QA tier before reaching the lead's MCP
      // probes.
      const mainSrc = readFileSync(resolve(__dirname, '../src/main.ts'), 'utf8');

      // 1. The import is present.
      expect(mainSrc).toMatch(
        /import\s+\{\s*AttitudeApplier\s*\}\s+from\s+['"]\.\/render\/attitude-applier['"]/,
      );

      // 2. Construction at the boot path (in ManifestLoader.then closure).
      expect(mainSrc).toMatch(/new\s+AttitudeApplier\s*\(\s*\)/);

      // 3. Publication is gated by import.meta.env.DEV (tree-shaken in prod).
      expect(mainSrc).toMatch(/import\.meta\.env\.DEV/);

      // 4. The publication preserves coexisting surfaces via spread
      // (`...(w.__voyagerDebug ?? {})`). Defends against a refactor that
      // overwrites the namespace.
      expect(mainSrc).toMatch(/\.{3}\(\s*w\.__voyagerDebug\s*\?\?\s*\{\s*\}\s*\)/);

      // 5. The attitudeApplier key is present in the publication object.
      // Match across whitespace and trailing comma flexibly.
      expect(mainSrc).toMatch(/attitudeApplier\s*,?\s*\n/);

      // 6. The attitudeService key STILL coexists (Story 3.2 surface
      // preserved alongside Story 3.4).
      expect(mainSrc).toMatch(/attitudeService\s*,?\s*\n/);

      // 7. The applier.tick is called inside the engine.onFrame callback
      // BETWEEN the spacecraftModels.tick and the trajectory/celestial
      // ticks (AC1 ordering). The regex's lazy `[\s\S]*?` would stop at
      // the first `});` it finds — which may be inside the callback's
      // `if (x !== null) y.tick(et);` lines. Instead, locate the onFrame
      // signature manually and walk braces to find the matching closer.
      // There are MULTIPLE `engine.onFrame(...)` callbacks in main.ts
      // (chapter-director update + spacecraftModels/attitude/trajectory/
      // celestial tick). The Story 3.4 wiring lives inside the ChunkLoader/
      // EphemerisService closure (later in the file). Find the LAST
      // `engine.onFrame(` occurrence to scope to the right callback.
      const onFrameStart = mainSrc.lastIndexOf('engine.onFrame(');
      expect(onFrameStart).toBeGreaterThanOrEqual(0);
      const bodyStart = mainSrc.indexOf('{', onFrameStart);
      expect(bodyStart).toBeGreaterThanOrEqual(0);
      let depth = 1;
      let bodyEnd = bodyStart;
      for (let i = bodyStart + 1; i < mainSrc.length && depth > 0; i += 1) {
        const c = mainSrc[i];
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        if (depth === 0) bodyEnd = i;
      }
      expect(bodyEnd).toBeGreaterThan(bodyStart);
      const blockBody = mainSrc.slice(bodyStart + 1, bodyEnd);
      const spacecraftTickIdx = blockBody.indexOf('spacecraftModels.tick(');
      const attitudeApplierIdx = blockBody.indexOf('attitudeApplier.tick(');
      const trajectoryIdx = blockBody.indexOf('trajectoryLines.tick(');
      const celestialIdx = blockBody.indexOf('celestialBodies.tick(');
      expect(spacecraftTickIdx).toBeGreaterThanOrEqual(0);
      expect(attitudeApplierIdx).toBeGreaterThan(spacecraftTickIdx);
      // attitudeApplier.tick precedes trajectory + celestial body updates.
      if (trajectoryIdx >= 0) expect(attitudeApplierIdx).toBeLessThan(trajectoryIdx);
      if (celestialIdx >= 0) expect(attitudeApplierIdx).toBeLessThan(celestialIdx);
    });

    it('publishes the AttitudeApplier instance with a callable tick method', () => {
      // Type-level + structural contract: the published instance must have
      // the same shape the lead's MCP probe expects.
      const a = new AttitudeApplier();
      expect(typeof a.tick).toBe('function');
      expect(a.tick.length).toBeGreaterThanOrEqual(3); // (et, attitudeService, spacecraftModels)
    });
  });

  describe('QA gap 8 — defensive: missing BUS or SCAN_PLATFORM name does not throw', () => {
    it('handles a malformed handle.group that lacks BUS gracefully (cache.busNode stays null)', () => {
      // Build a fixture without the BUS-named child. The applier's
      // `?? null` fallback (attitude-applier.ts line 176) should leave
      // cache.busNode null and skip the bus write — without throwing.
      const group = new Group();
      group.name = 'voyager-1';
      group.visible = true;
      const platform = new Group();
      platform.name = 'SCAN_PLATFORM';
      group.add(platform);
      // NOTE: deliberately no BUS child.

      const v1Handle: SpacecraftHandle = {
        id: 'voyager-1',
        naifId: -31,
        group,
        lod: null,
        hasInitialPosition: true,
      };

      const v2 = buildFixture('voyager-2');
      const models = {
        getHandle: (id: 'voyager-1' | 'voyager-2'): SpacecraftHandle =>
          id === 'voyager-1' ? v1Handle : v2.handle,
      } as unknown as SpacecraftModels;

      const stub = buildAttitudeServiceStub({
        busV1: brandedQuat(0.5, 0, 0, Math.sqrt(0.75)),
        platformV1: brandedQuat(0, 0.5, 0, Math.sqrt(0.75)),
      });

      // Must not throw despite missing BUS.
      expect(() => applier.tick(1000, stub.service, models)).not.toThrow();

      // The SCAN_PLATFORM write still landed because that name resolves.
      expect(platform.quaternion.y).toBeCloseTo(0.5, 12);
    });
  });
});
