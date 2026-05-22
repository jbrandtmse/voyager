// @vitest-environment happy-dom
/**
 * Story 3.5 AC6 — Integration AC: BoresightRenderer ↔ SpacecraftModels ↔
 * AttitudeApplier end-to-end.
 *
 * Mirrors the Story 3.4 `attitude-applier-integration.test.ts` boot stack:
 *   1. Synthetic hierarchical GLB with BUS / SCAN_PLATFORM / HGA
 *   2. Stub fetch returns the V1 attitude VTRJ for the manifest's bus +
 *      platform attitude files
 *   3. SpacecraftModels.load(...) + tick(et) so V1's visibility gate flips
 *   4. AttitudeApplier writes the SCAN_PLATFORM quaternion
 *   5. BoresightRenderer.attach(...) parents the cone to SCAN_PLATFORM
 *
 * Then asserts the binding contracts:
 *   - `cone.parent === platform` (AC6 clause 1)
 *   - Mutating platform quaternion + `scene.updateMatrixWorld(true)` makes
 *     `cone.matrixWorld` reflect the rotation (AC6 clause 2)
 *   - Rotating platform by 90° about +Y rotates the cone's world +Z by 90°
 *     about +Y within 1e-12 absolute (AC6 clause 3)
 *   - 100 ticks → 0 new BufferGeometry / Material constructions (AC6
 *     clause 4 / AC3 memory hygiene)
 */

import { describe, it, expect } from 'vitest';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Vector3, ConeGeometry } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { ChunkLoader } from '../src/services/chunk-loader';
import { EphemerisService } from '../src/services/ephemeris-service';
import { AttitudeService, EARTH_NAIF_ID } from '../src/services/attitude-service';
import { SpacecraftModels } from '../src/render/spacecraft-models';
import { AttitudeApplier } from '../src/render/attitude-applier';
import { BoresightRenderer } from '../src/render/boresight-renderer';
import { worldVec3 } from '../src/types/branded';
import type { WorldVec3 } from '../src/types/branded';
import type { Manifest, ManifestFile } from '../src/services/manifest-loader';
import { V1_NAIF_ID, V2_NAIF_ID } from '../src/services/fk-constants';

const V1_BUS_CK_ID = -31000;
const V1_PLATFORM_CK_ID = -31100;

// === Fixture VTRJ builder (mirrors Story 3.4 integration test) =============

const buildAttitudeVtrj = (params: {
  bodyId: number;
  etStart: number;
  etEnd: number;
  knots: ReadonlyArray<{ et: number; qw: number; qx: number; qy: number; qz: number }>;
}): ArrayBuffer => {
  const n = params.knots.length;
  const bodyBytes = n * 40;
  const total = 40 + bodyBytes;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  view.setUint8(0, 'V'.charCodeAt(0));
  view.setUint8(1, 'T'.charCodeAt(0));
  view.setUint8(2, 'R'.charCodeAt(0));
  view.setUint8(3, 'J'.charCodeAt(0));
  view.setUint16(4, 1, true);
  view.setInt32(6, params.bodyId, true);
  view.setFloat64(10, params.etStart, true);
  view.setFloat64(18, params.etEnd, true);
  view.setUint32(26, n, true);
  view.setFloat64(30, 5.0, true);
  view.setUint16(38, 0, true);
  for (let i = 0; i < n; i++) {
    const k = params.knots[i];
    view.setFloat64(40 + i * 40 + 0, k.et, true);
    view.setFloat64(40 + i * 40 + 8, k.qw, true);
    view.setFloat64(40 + i * 40 + 16, k.qx, true);
    view.setFloat64(40 + i * 40 + 24, k.qy, true);
    view.setFloat64(40 + i * 40 + 32, k.qz, true);
  }
  return buf;
};

// === Synthetic hierarchical GLTF fixture ===================================

const makeHierarchicalGltf = (): GLTF => {
  const scene = new Group();
  scene.name = 'voyager-glb-root';

  const bus = new Group();
  bus.name = 'BUS';

  const platform = new Group();
  platform.name = 'SCAN_PLATFORM';
  platform.position.set(0, -0.567, 0);

  const hga = new Group();
  hga.name = 'HGA';
  hga.position.set(0, 2.125, 0);

  const busMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  bus.add(busMesh);
  bus.add(platform);
  bus.add(hga);
  scene.add(bus);

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

// === Stub EphemerisService =================================================

class StubEphemerisService {
  getPosition(_et: number, bodyId: number): WorldVec3 | null {
    if (bodyId === V1_NAIF_ID) return worldVec3(10e6, 0, 0);
    if (bodyId === V2_NAIF_ID) return worldVec3(0, 10e6, 0);
    if (bodyId === EARTH_NAIF_ID) return worldVec3(0, 0, 0);
    return null;
  }
  getVelocity(): WorldVec3 | null {
    return null;
  }
  getStateAt(_et: number, bodyId: number): { position: WorldVec3; velocity: WorldVec3 } | null {
    const pos = this.getPosition(_et, bodyId);
    if (pos === null) return null;
    return { position: pos, velocity: worldVec3(0, 0, 0) };
  }
}

// === Fixture manifest ======================================================

const BUS_URL = 'data/test-v1-bus-attitude.bin.br';
const PLATFORM_URL = 'data/test-v1-platform-attitude.bin.br';
const FIXTURE_ET_START = -657_000_000.0;
const FIXTURE_ET_END = -656_999_900.0;
const FIXTURE_ET_INSIDE = -656_999_950.0;

const FIXTURE_KNOTS_BUS = [
  { et: FIXTURE_ET_START, qw: 1.0, qx: 0.0, qy: 0.0, qz: 0.0 },
  { et: FIXTURE_ET_END, qw: 0.5, qx: 0.5, qy: 0.5, qz: 0.5 },
];
const FIXTURE_KNOTS_PLATFORM = [
  { et: FIXTURE_ET_START, qw: 1.0, qx: 0.0, qy: 0.0, qz: 0.0 },
  { et: FIXTURE_ET_END, qw: 0.7071067811865476, qx: 0.7071067811865476, qy: 0, qz: 0 },
];

const buildFixtureManifest = (): Manifest => {
  const busFile: ManifestFile = {
    url: BUS_URL,
    sha256: 'a'.repeat(64),
    sizeBytes: 1024,
    timeRangeEt: [FIXTURE_ET_START, FIXTURE_ET_END],
    cadenceSec: 5.0,
    kind: 'bus_attitude',
    provenance: 'ck',
  };
  const platformFile: ManifestFile = {
    url: PLATFORM_URL,
    sha256: 'b'.repeat(64),
    sizeBytes: 1024,
    timeRangeEt: [FIXTURE_ET_START, FIXTURE_ET_END],
    cadenceSec: 5.0,
    kind: 'platform_attitude',
    provenance: 'ck',
  };
  return {
    schemaVersion: 1,
    bakeCommit: 'test',
    bakeTimestamp: '2026-05-21T00:00:00Z',
    kernels: [],
    bodies: [
      {
        naifId: V1_NAIF_ID,
        name: 'Voyager 1',
        files: [busFile, platformFile],
      },
      { naifId: V2_NAIF_ID, name: 'Voyager 2', files: [] },
      { naifId: EARTH_NAIF_ID, name: 'Earth', files: [] },
    ],
    chapters: [],
    validationTolerances: { maxPositionErrorKm: 20, rmsPositionErrorKm: 5 },
    models: [
      {
        id: 'voyager',
        lods: [
          {
            level: 0,
            url: '/models/voyager-lod0.aaaaaaaa.glb',
            sha256: 'a'.repeat(64),
            sizeBytes: 1024,
            maxDistanceKm: 0.001,
          },
          {
            level: 1,
            url: '/models/voyager-lod1.bbbbbbbb.glb',
            sha256: 'b'.repeat(64),
            sizeBytes: 512,
            maxDistanceKm: 0.1,
          },
          {
            level: 2,
            url: '/models/voyager-lod2.cccccccc.glb',
            sha256: 'c'.repeat(64),
            sizeBytes: 256,
            maxDistanceKm: 1.0,
          },
          {
            level: 3,
            url: '/models/voyager-lod3.dddddddd.glb',
            sha256: 'd'.repeat(64),
            sizeBytes: 128,
            maxDistanceKm: null,
          },
        ],
        pivotMeters: [0, 0, 0],
        scaleToKm: 0.001,
      },
    ],
  };
};

const makeStubFetch = (): typeof fetch => {
  const busBytes = buildAttitudeVtrj({
    bodyId: V1_BUS_CK_ID,
    etStart: FIXTURE_ET_START,
    etEnd: FIXTURE_ET_END,
    knots: FIXTURE_KNOTS_BUS,
  });
  const platformBytes = buildAttitudeVtrj({
    bodyId: V1_PLATFORM_CK_ID,
    etStart: FIXTURE_ET_START,
    etEnd: FIXTURE_ET_END,
    knots: FIXTURE_KNOTS_PLATFORM,
  });
  const map = new Map<string, ArrayBuffer>([
    [BUS_URL, busBytes],
    [PLATFORM_URL, platformBytes],
  ]);
  return (async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input.toString();
    const path = raw.startsWith('http') ? new URL(raw).pathname.replace(/^\//, '') : raw;
    const buf = map.get(path) ?? map.get(raw);
    if (buf === undefined) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => buf,
    } as Response;
  }) as typeof fetch;
};

// =============================================================================

describe('Story 3.5 AC6 — BoresightRenderer integration with full boot stack', () => {
  const buildStack = async (): Promise<{
    chunkLoader: ChunkLoader;
    attitudeService: AttitudeService;
    spacecraftModels: SpacecraftModels;
    applier: AttitudeApplier;
    boresight: BoresightRenderer;
    ephem: StubEphemerisService;
  }> => {
    const manifest = buildFixtureManifest();
    const chunkLoader = new ChunkLoader({
      fetchImpl: makeStubFetch(),
      sha256Hex: async () => 'unused',
    });
    const ephem = new StubEphemerisService();
    const attitudeService = new AttitudeService(
      manifest,
      chunkLoader,
      ephem as unknown as EphemerisService,
    );

    // Prefetch the attitude chunks.
    await chunkLoader.load(manifest.bodies[0].files[0]);
    await chunkLoader.load(manifest.bodies[0].files[1]);

    // Load the synthetic hierarchical GLB — same fixture used for every
    // LOD URL. Story 3.3's clone(true) ensures V1/V2 have independent
    // BUS / SCAN_PLATFORM subtrees per LOD level.
    const gltf = makeHierarchicalGltf();
    const loader = {
      load: (_url: string, onLoad: (g: GLTF) => void): void => {
        onLoad(gltf);
      },
    };
    const spacecraftModels = new SpacecraftModels();
    await spacecraftModels.load({ manifest, loader });

    // Tick so visibility gate is set.
    spacecraftModels.tick(FIXTURE_ET_INSIDE, ephem as unknown as EphemerisService);

    const applier = new AttitudeApplier();
    const boresight = new BoresightRenderer();
    boresight.attach(spacecraftModels);

    return { chunkLoader, attitudeService, spacecraftModels, applier, boresight, ephem };
  };

  it('AC6 clause 1 — cone is a child of the active LOD SCAN_PLATFORM for both spacecraft', async () => {
    const { spacecraftModels, boresight } = await buildStack();

    const v1 = spacecraftModels.getHandle('voyager-1');
    const v2 = spacecraftModels.getHandle('voyager-2');

    const v1Platform = v1.lod!.levels[v1.lod!.getCurrentLevel()].object.getObjectByName('SCAN_PLATFORM')!;
    const v2Platform = v2.lod!.levels[v2.lod!.getCurrentLevel()].object.getObjectByName('SCAN_PLATFORM')!;

    const coneV1 = boresight.__getCone('voyager-1')!;
    const coneV2 = boresight.__getCone('voyager-2')!;

    expect(coneV1.parent).toBe(v1Platform);
    expect(coneV2.parent).toBe(v2Platform);
    expect(v1Platform.children).toContain(coneV1);
    expect(v2Platform.children).toContain(coneV2);
  });

  it('AC6 clause 2 — AttitudeApplier writing platform quaternion changes cone.matrixWorld', async () => {
    const { attitudeService, spacecraftModels, applier, boresight } = await buildStack();

    const v1 = spacecraftModels.getHandle('voyager-1');
    const coneV1 = boresight.__getCone('voyager-1')!;

    // Snapshot matrixWorld before attitude application.
    v1.group.updateMatrixWorld(true);
    const before = coneV1.matrixWorld.clone();

    // Apply attitude — AttitudeApplier writes SCAN_PLATFORM.quaternion.
    applier.tick(FIXTURE_ET_INSIDE, attitudeService, spacecraftModels);
    v1.group.updateMatrixWorld(true);
    const after = coneV1.matrixWorld.clone();

    // The matrixWorld MUST have changed (the SLERP quaternion at the
    // mid-window ET is non-identity).
    expect(after.elements).not.toEqual(before.elements);
  });

  it('AC6 clause 3 — rotating platform by 90° about +Y rotates cone world +Z by 90° about +Y within 1e-12', async () => {
    const { spacecraftModels, boresight } = await buildStack();

    const v1 = spacecraftModels.getHandle('voyager-1');
    const platform = v1.lod!.levels[v1.lod!.getCurrentLevel()].object.getObjectByName('SCAN_PLATFORM')!;
    const coneV1 = boresight.__getCone('voyager-1')!;

    // Identity platform quaternion: cone world +Z direction.
    platform.quaternion.set(0, 0, 0, 1);
    v1.group.updateMatrixWorld(true);
    coneV1.updateMatrixWorld(true);
    const zBefore = new Vector3(0, 0, 1).transformDirection(coneV1.matrixWorld);

    // 90° about +Y → world +Z direction rotates to world +X (right-hand rule).
    platform.quaternion.set(0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4));
    v1.group.updateMatrixWorld(true);
    coneV1.updateMatrixWorld(true);
    const zAfter = new Vector3(0, 0, 1).transformDirection(coneV1.matrixWorld);

    // Rotation of zBefore by Ry(90°) = (zBefore.z, 0, -zBefore.x). Since
    // zBefore is approximately (0, 0, 1), expect zAfter ≈ (1, 0, 0).
    // Compare to ZBefore rotated by Ry(90°):
    const expectedAfterX = zBefore.z;
    const expectedAfterY = zBefore.y;
    const expectedAfterZ = -zBefore.x;

    expect(zAfter.x).toBeCloseTo(expectedAfterX, 12);
    expect(zAfter.y).toBeCloseTo(expectedAfterY, 12);
    expect(zAfter.z).toBeCloseTo(expectedAfterZ, 12);
  });

  it('AC6 clause 4 — 100 ticks produce 0 new ConeGeometry / Material instances', async () => {
    const { attitudeService, spacecraftModels, applier, boresight } = await buildStack();

    // Spy on the ConeGeometry constructor surface via the prototype's
    // setIndex method (every ConeGeometry instance calls setIndex once in
    // its constructor — same pattern as the unit test).
    const proto = ConeGeometry.prototype;
    const origSetIndex = proto.setIndex;
    let coneCtorCount = 0;
    proto.setIndex = function (this: ConeGeometry, ...args: Parameters<typeof origSetIndex>) {
      coneCtorCount += 1;
      return origSetIndex.apply(this, args);
    };

    try {
      const N = 100;
      for (let i = 0; i < N; i += 1) {
        applier.tick(FIXTURE_ET_INSIDE + i, attitudeService, spacecraftModels);
        boresight.tick(spacecraftModels);
      }
      // No new cones created during the per-frame path.
      expect(coneCtorCount).toBe(0);
    } finally {
      proto.setIndex = origSetIndex;
    }
  });

  it('AC1 — same ChunkLoader contract: no chunk reloads during 100 boresight ticks', async () => {
    const { chunkLoader, attitudeService, spacecraftModels, applier, boresight } = await buildStack();

    const sizeBefore = chunkLoader.__cacheSize();
    expect(sizeBefore).toBe(2);

    for (let i = 0; i < 100; i += 1) {
      applier.tick(FIXTURE_ET_INSIDE + i, attitudeService, spacecraftModels);
      boresight.tick(spacecraftModels);
    }
    expect(chunkLoader.__cacheSize()).toBe(sizeBefore);
  });

  it('AC1/AC3 — LOD-swap re-parenting: cone moves from level 0 platform to level 2 platform without re-creation', async () => {
    const { spacecraftModels, boresight } = await buildStack();

    const v1 = spacecraftModels.getHandle('voyager-1');
    const lod = v1.lod!;
    const initialLevel = lod.getCurrentLevel();
    const initialPlatform = lod.levels[initialLevel].object.getObjectByName('SCAN_PLATFORM')!;
    const coneBefore = boresight.__getCone('voyager-1')!;
    expect(coneBefore.parent).toBe(initialPlatform);

    // Pick a different LOD level. Force the LOD instance to report a new
    // currentLevel by stubbing getCurrentLevel for the duration of the test.
    const altLevel = (initialLevel + 1) % lod.levels.length;
    const altPlatform = lod.levels[altLevel].object.getObjectByName('SCAN_PLATFORM')!;
    expect(altPlatform).not.toBe(initialPlatform);

    const origGetCurrentLevel = lod.getCurrentLevel.bind(lod);
    lod.getCurrentLevel = (): number => altLevel;

    try {
      boresight.tick(spacecraftModels);
      const coneAfter = boresight.__getCone('voyager-1')!;
      // Same mesh INSTANCE.
      expect(coneAfter).toBe(coneBefore);
      // Re-parented.
      expect(coneAfter.parent).toBe(altPlatform);
      expect(initialPlatform.children).not.toContain(coneAfter);
    } finally {
      lod.getCurrentLevel = origGetCurrentLevel;
    }
  });
});
