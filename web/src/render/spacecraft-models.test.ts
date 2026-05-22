// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Sprite, LOD } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  SpacecraftModels,
  DEFAULT_VOYAGER_GLB_URL,
  BASIS_TRANSCODER_PATH,
  SPACECRAFT_RENDER_SCALE_KM,
  __resetFallbackWarnForTests,
} from './spacecraft-models';
import { worldVec3 } from '../types/branded';
import type { WorldVec3 } from '../types/branded';
import type { EphemerisService } from '../services/ephemeris-service';
import type { Manifest, ManifestModel } from '../services/manifest-loader';
import { V1_LAUNCH_ET, V2_LAUNCH_ET } from '../constants/mission';

// === Test fixtures ============================================================

/**
 * Build a fake GLTF whose scene root contains a named BUS/SCAN_PLATFORM/HGA
 * hierarchy mirroring what `web/scripts/build_glb.ts` emits. The pivot
 * positions are nominal — tests don't depend on exact values, only that
 * `getObjectByName` resolves each name.
 */
const makeFakeHierarchicalGltf = (): GLTF => {
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
  hga.quaternion.set(1, 0, 0, 0);

  const busMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  busMesh.name = 'mesh_BODY.040';
  bus.add(busMesh);

  const platformMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
  platformMesh.name = 'mesh_BODY.002';
  platform.add(platformMesh);

  const hgaMesh = new Mesh(new BoxGeometry(2, 0.2, 2), new MeshBasicMaterial());
  hgaMesh.name = 'mesh_BODY.000';
  hga.add(hgaMesh);

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

/** Flat single-mesh GLTF (no named hierarchy) — used for legacy fallback tests. */
const makeFakeFlatGltf = (): GLTF => {
  const scene = new Group();
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  mesh.name = 'voyager-bus';
  scene.add(mesh);
  scene.name = 'voyager-glb-root';
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

const makeSyncLoader = (
  gltfOrFn: GLTF | ((url: string) => GLTF),
): {
  load: (
    url: string,
    onLoad: (gltf: GLTF) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void,
  ) => void;
} => ({
  load: (
    url: string,
    onLoad: (gltf: GLTF) => void,
    _onProgress?: (event: ProgressEvent) => void,
    _onError?: (err: unknown) => void,
  ): void => {
    const gltf = typeof gltfOrFn === 'function' ? gltfOrFn(url) : gltfOrFn;
    onLoad(gltf);
  },
});

const stubEphemeris = (
  positions: Partial<Record<number, WorldVec3 | null>>,
): EphemerisService =>
  ({
    getStateAt: (_et: number, bodyId: number) => {
      const pos = positions[bodyId];
      if (pos === undefined || pos === null) return null;
      return { position: pos, velocity: worldVec3(0, 0, 0) };
    },
  }) as unknown as EphemerisService;

/** Build a fixture Manifest with a 4-LOD `models[0]` entry. */
const makeFixtureManifest = (model?: Partial<ManifestModel>): Manifest =>
  ({
    schemaVersion: 1,
    bakeCommit: 'abc',
    bakeTimestamp: '2026-05-21T00:00:00Z',
    kernels: [],
    bodies: [],
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
        ...model,
      },
    ],
  }) as Manifest;

describe('SpacecraftModels — Story 1.12 constructor + tick behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetFallbackWarnForTests();
  });

  it('exposes a Group named SpacecraftModels with two child groups (voyager-1 + voyager-2)', () => {
    const models = new SpacecraftModels();
    expect(models.root).toBeInstanceOf(Group);
    expect(models.root.name).toBe('SpacecraftModels');
    expect(models.root.children.length).toBe(2);

    const v1 = models.getHandle('voyager-1');
    const v2 = models.getHandle('voyager-2');
    expect(v1.group.name).toBe('voyager-1');
    expect(v2.group.name).toBe('voyager-2');
    expect(v1.naifId).toBe(-31);
    expect(v2.naifId).toBe(-32);
  });

  it('each spacecraft group includes a label sprite (V1/V2) attached as a child', () => {
    const models = new SpacecraftModels();
    const v1 = models.getHandle('voyager-1');
    const v2 = models.getHandle('voyager-2');

    const sprites1 = v1.group.children.filter((c) => c instanceof Sprite);
    const sprites2 = v2.group.children.filter((c) => c instanceof Sprite);
    expect(sprites1.length).toBe(1);
    expect(sprites2.length).toBe(1);
    expect(sprites1[0].name).toBe('voyager-1-label');
    expect(sprites2[0].name).toBe('voyager-2-label');
  });

  it('starts hidden until first valid ephemeris tick', () => {
    const models = new SpacecraftModels();
    expect(models.getHandle('voyager-1').group.visible).toBe(false);
    expect(models.getHandle('voyager-2').group.visible).toBe(false);
  });

  it('legacy modelUrl fallback: load() resolves and appends one cloned mesh subtree per spacecraft', async () => {
    const gltf = makeFakeFlatGltf();
    const loader = makeSyncLoader(gltf);
    const models = new SpacecraftModels();

    await models.load({ loader });

    expect(models.isLoaded).toBe(true);
    const v1mesh = models.getHandle('voyager-1').group.children.find(
      (c) => c.name === 'voyager-1-mesh',
    );
    const v2mesh = models.getHandle('voyager-2').group.children.find(
      (c) => c.name === 'voyager-2-mesh',
    );
    expect(v1mesh).toBeDefined();
    expect(v2mesh).toBeDefined();
    expect(v1mesh).not.toBe(v2mesh);
  });

  it('load() returns the same promise on repeat calls (loads exactly once)', async () => {
    const gltf = makeFakeFlatGltf();
    let callCount = 0;
    const loader = {
      load: (
        _url: string,
        onLoad: (gltf: GLTF) => void,
      ): void => {
        callCount += 1;
        onLoad(gltf);
      },
    };
    const models = new SpacecraftModels();
    const p1 = models.load({ loader });
    const p2 = models.load({ loader });
    expect(p1).toBe(p2);
    await p1;
    expect(callCount).toBe(1);
  });

  it('applies SPACECRAFT_RENDER_SCALE_KM to the loaded mesh (legacy fallback path)', async () => {
    const gltf = makeFakeFlatGltf();
    const models = new SpacecraftModels();
    await models.load({ loader: makeSyncLoader(gltf) });

    const v1mesh = models
      .getHandle('voyager-1')
      .group.children.find((c) => c.name === 'voyager-1-mesh');
    expect(v1mesh!.scale.x).toBeCloseTo(SPACECRAFT_RENDER_SCALE_KM, 8);
    expect(v1mesh!.scale.y).toBeCloseTo(SPACECRAFT_RENDER_SCALE_KM, 8);
    expect(v1mesh!.scale.z).toBeCloseTo(SPACECRAFT_RENDER_SCALE_KM, 8);
  });

  it('uses the default GLB URL when no manifest/modelUrl is provided', () => {
    const calls: string[] = [];
    const loader = {
      load: (
        url: string,
        _onLoad: (gltf: GLTF) => void,
      ): void => {
        calls.push(url);
      },
    };
    const models = new SpacecraftModels();
    void models.load({ loader });
    expect(calls).toEqual([DEFAULT_VOYAGER_GLB_URL]);
  });

  it('tick(et) applies EphemerisService positions to V1 and V2 groups', () => {
    const models = new SpacecraftModels();
    const ephem = stubEphemeris({
      [-31]: worldVec3(1.0e8, 2.0e8, 3.0e8),
      [-32]: worldVec3(-1.5e8, 0.0, 1.0e8),
    });
    models.tick(0, ephem);

    const v1 = models.getHandle('voyager-1').group;
    const v2 = models.getHandle('voyager-2').group;
    expect(v1.position.x).toBeCloseTo(1.0e8, 0);
    expect(v1.position.y).toBeCloseTo(2.0e8, 0);
    expect(v1.position.z).toBeCloseTo(3.0e8, 0);
    expect(v2.position.x).toBeCloseTo(-1.5e8, 0);
    expect(v1.visible).toBe(true);
    expect(v2.visible).toBe(true);
  });

  it('tick(et): null ephemeris returns hold previous position (no flicker)', () => {
    const models = new SpacecraftModels();
    const v1 = models.getHandle('voyager-1').group;

    models.tick(0, stubEphemeris({ [-31]: worldVec3(42, 0, 0), [-32]: worldVec3(0, 42, 0) }));
    expect(v1.position.x).toBe(42);
    expect(v1.visible).toBe(true);

    models.tick(0, stubEphemeris({ [-31]: null, [-32]: null }));
    expect(v1.position.x).toBe(42);
    expect(v1.visible).toBe(true);
  });

  it('tick(et): hides V2 before V2_LAUNCH_ET (AC8)', () => {
    const models = new SpacecraftModels();
    const preLaunchEt = V2_LAUNCH_ET - 100;
    models.tick(preLaunchEt, stubEphemeris({ [-32]: worldVec3(1, 2, 3) }));
    expect(models.getHandle('voyager-2').group.visible).toBe(false);
  });

  it('tick(et): hides V1 before V1_LAUNCH_ET (AC8)', () => {
    const models = new SpacecraftModels();
    const v2OnlyEt = V2_LAUNCH_ET + 86400;
    expect(v2OnlyEt).toBeLessThan(V1_LAUNCH_ET);
    models.tick(
      v2OnlyEt,
      stubEphemeris({ [-31]: worldVec3(1, 1, 1), [-32]: worldVec3(2, 2, 2) }),
    );
    expect(models.getHandle('voyager-1').group.visible).toBe(false);
    expect(models.getHandle('voyager-2').group.visible).toBe(true);
  });

  it('tick(et) without prior position + null ephemeris keeps spacecraft hidden', () => {
    const models = new SpacecraftModels();
    models.tick(0, stubEphemeris({ [-31]: null, [-32]: null }));
    expect(models.getHandle('voyager-1').group.visible).toBe(false);
    expect(models.getHandle('voyager-2').group.visible).toBe(false);
  });

  it('load() rejects when the loader signals an error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const erroringLoader = {
      load: (
        _url: string,
        _onLoad: (gltf: GLTF) => void,
        _onProgress?: (event: ProgressEvent) => void,
        onError?: (err: unknown) => void,
      ): void => {
        onError?.(new Error('synthetic-load-error'));
      },
    };
    const models = new SpacecraftModels();
    await expect(models.load({ loader: erroringLoader })).rejects.toThrow(
      'synthetic-load-error',
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('Story 3.3 AC1 — named hierarchy contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetFallbackWarnForTests();
  });

  it('getObjectByName resolves BUS / SCAN_PLATFORM / HGA on the loaded scene', async () => {
    const gltf = makeFakeHierarchicalGltf();
    const loader = makeSyncLoader(gltf);
    const models = new SpacecraftModels();
    await models.load({ loader });

    const v1 = models.getHandle('voyager-1').group;
    expect(v1.getObjectByName('BUS')).toBeDefined();
    expect(v1.getObjectByName('SCAN_PLATFORM')).toBeDefined();
    expect(v1.getObjectByName('HGA')).toBeDefined();

    // SCAN_PLATFORM's parent in the cloned subtree is the BUS group.
    const platform = v1.getObjectByName('SCAN_PLATFORM');
    const bus = v1.getObjectByName('BUS');
    expect(platform?.parent).toBe(bus);
  });

  it('rotating SCAN_PLATFORM moves its children but leaves HGA world matrix unchanged (AC6)', async () => {
    const gltf = makeFakeHierarchicalGltf();
    const loader = makeSyncLoader(gltf);
    const models = new SpacecraftModels();
    await models.load({ loader });

    const v1 = models.getHandle('voyager-1').group;
    const platform = v1.getObjectByName('SCAN_PLATFORM')!;
    const hga = v1.getObjectByName('HGA')!;
    const platformChild = platform.children[0];

    v1.updateMatrixWorld(true);
    const hgaWorldBefore = hga.matrixWorld.elements.slice();
    const platformChildWorldBefore = platformChild.matrixWorld.elements.slice();

    platform.rotateY(Math.PI / 4);
    v1.updateMatrixWorld(true);

    const hgaWorldAfter = hga.matrixWorld.elements;
    const platformChildWorldAfter = platformChild.matrixWorld.elements;

    // HGA world matrix is unchanged.
    for (let i = 0; i < 16; i += 1) {
      expect(hgaWorldAfter[i]).toBeCloseTo(hgaWorldBefore[i], 10);
    }

    // The platform's child world matrix HAS changed.
    let anyDelta = false;
    for (let i = 0; i < 16; i += 1) {
      if (Math.abs(platformChildWorldAfter[i] - platformChildWorldBefore[i]) > 1e-10) {
        anyDelta = true;
        break;
      }
    }
    expect(anyDelta).toBe(true);
  });
});

describe('Story 3.3 AC3 + AC5 — manifest-driven LOD chain', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetFallbackWarnForTests();
  });

  it('constructs a THREE.LOD with 4 levels when given a 4-LOD manifest', async () => {
    const gltf = makeFakeHierarchicalGltf();
    const loader = makeSyncLoader(gltf);
    const manifest = makeFixtureManifest();
    const models = new SpacecraftModels();

    await models.load({ manifest, loader });

    const v1 = models.getHandle('voyager-1');
    const v2 = models.getHandle('voyager-2');
    expect(v1.lod).toBeInstanceOf(LOD);
    expect(v2.lod).toBeInstanceOf(LOD);
    expect(v1.lod!.levels.length).toBe(4);
    expect(v2.lod!.levels.length).toBe(4);
  });

  it('LOD distance thresholds match manifest maxDistanceKm (null → Infinity)', async () => {
    const gltf = makeFakeHierarchicalGltf();
    const loader = makeSyncLoader(gltf);
    const manifest = makeFixtureManifest();
    const models = new SpacecraftModels();

    await models.load({ manifest, loader });

    const lod = models.getHandle('voyager-1').lod!;
    expect(lod.levels[0].distance).toBe(0.001);
    expect(lod.levels[1].distance).toBe(0.1);
    expect(lod.levels[2].distance).toBe(1.0);
    expect(lod.levels[3].distance).toBe(Number.POSITIVE_INFINITY);
  });

  it('loads every LOD URL from the manifest', async () => {
    const urlsLoaded: string[] = [];
    const gltf = makeFakeHierarchicalGltf();
    const loader = {
      load: (
        url: string,
        onLoad: (gltf: GLTF) => void,
      ): void => {
        urlsLoaded.push(url);
        onLoad(gltf);
      },
    };
    const manifest = makeFixtureManifest();
    const models = new SpacecraftModels();

    await models.load({ manifest, loader });

    expect(urlsLoaded.sort()).toEqual([
      '/models/voyager-lod0.aaaaaaaa.glb',
      '/models/voyager-lod1.bbbbbbbb.glb',
      '/models/voyager-lod2.cccccccc.glb',
      '/models/voyager-lod3.dddddddd.glb',
    ]);
  });

  it('AC5 fallback: empty models[] → console.warn ONCE + falls back to default URL', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const calls: string[] = [];
    const loader = {
      load: (
        url: string,
        onLoad: (gltf: GLTF) => void,
      ): void => {
        calls.push(url);
        onLoad(makeFakeFlatGltf());
      },
    };

    const manifest = makeFixtureManifest();
    (manifest as { models: ManifestModel[] }).models = [];
    const models = new SpacecraftModels();
    await models.load({ manifest, loader });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([DEFAULT_VOYAGER_GLB_URL]);

    // Second SpacecraftModels instance shouldn't re-warn (state is module-static).
    const models2 = new SpacecraftModels();
    await models2.load({ manifest, loader: makeSyncLoader(makeFakeFlatGltf()) });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('LOD scene clones are independent per spacecraft', async () => {
    const gltf = makeFakeHierarchicalGltf();
    const loader = makeSyncLoader(gltf);
    const manifest = makeFixtureManifest();
    const models = new SpacecraftModels();

    await models.load({ manifest, loader });

    const v1lod0 = models.getHandle('voyager-1').lod!.levels[0].object;
    const v2lod0 = models.getHandle('voyager-2').lod!.levels[0].object;
    expect(v1lod0).not.toBe(v2lod0);

    expect(v1lod0.getObjectByName('BUS')).toBeDefined();
    expect(v2lod0.getObjectByName('BUS')).toBeDefined();
    expect(v1lod0.getObjectByName('BUS')).not.toBe(v2lod0.getObjectByName('BUS'));
  });

  it('default GLTFLoader registers MeshoptDecoder + KTX2Loader at /basis/ (ADR-0006)', async () => {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js');

    const setMeshoptSpy = vi.spyOn(GLTFLoader.prototype, 'setMeshoptDecoder');
    const setKTX2Spy = vi.spyOn(GLTFLoader.prototype, 'setKTX2Loader');
    const setTranscoderPathSpy = vi.spyOn(KTX2Loader.prototype, 'setTranscoderPath');
    const loadSpy = vi
      .spyOn(GLTFLoader.prototype, 'load')
      .mockImplementation(() => undefined);

    const models = new SpacecraftModels();
    void models.load();

    expect(setMeshoptSpy).toHaveBeenCalledTimes(1);
    expect(setKTX2Spy).toHaveBeenCalledTimes(1);
    expect(setTranscoderPathSpy).toHaveBeenCalledWith(BASIS_TRANSCODER_PATH);
    expect(loadSpy.mock.calls[0][0]).toBe(DEFAULT_VOYAGER_GLB_URL);

    setMeshoptSpy.mockRestore();
    setKTX2Spy.mockRestore();
    setTranscoderPathSpy.mockRestore();
    loadSpy.mockRestore();
  });
});
