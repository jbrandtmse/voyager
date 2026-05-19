// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Sprite } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  SpacecraftModels,
  DEFAULT_VOYAGER_GLB_URL,
  SPACECRAFT_RENDER_SCALE_KM,
} from './spacecraft-models';
import { worldVec3 } from '../types/branded';
import type { WorldVec3 } from '../types/branded';
import type { EphemerisService } from '../services/ephemeris-service';
import { V1_LAUNCH_ET, V2_LAUNCH_ET } from '../constants/mission';

const makeFakeGltf = (): GLTF => {
  // Trivial cube as the "loaded" scene. The clone-based fan-out in
  // SpacecraftModels uses gltf.scene.clone(true), which Three.js implements
  // generically — any Group with a Mesh child round-trips.
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

/**
 * Build a stub GLTFLoader that synchronously invokes onLoad with the fake GLTF.
 * Real GLTFLoader is async, but the loader contract (callback-style) allows
 * sync resolution and that's what we want for deterministic tests.
 */
const makeSyncLoader = (gltf: GLTF) => ({
  load: (
    _url: string,
    onLoad: (gltf: GLTF) => void,
    _onProgress?: (event: ProgressEvent) => void,
    _onError?: (err: unknown) => void,
  ): void => {
    onLoad(gltf);
  },
});

/** Build a stub EphemerisService that returns position-only state. */
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

describe('Story 1.12 — SpacecraftModels', () => {
  beforeEach(() => {
    // Ensure document is fresh for each test (CanvasTexture sprite reads
    // document.createElement('canvas')).
    document.body.innerHTML = '';
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

  it('load() resolves once and appends one cloned mesh subtree per spacecraft', async () => {
    const gltf = makeFakeGltf();
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
    // Each mesh is an independent clone — not the same Object3D reference.
    expect(v1mesh).not.toBe(v2mesh);
  });

  it('load() returns the same promise on repeat calls (loads exactly once)', async () => {
    const gltf = makeFakeGltf();
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

  it('applies the SPACECRAFT_RENDER_SCALE_KM uniform scale to loaded meshes', async () => {
    const gltf = makeFakeGltf();
    const models = new SpacecraftModels();
    await models.load({ loader: makeSyncLoader(gltf) });

    const v1mesh = models
      .getHandle('voyager-1')
      .group.children.find((c) => c.name === 'voyager-1-mesh');
    expect(v1mesh!.scale.x).toBeCloseTo(SPACECRAFT_RENDER_SCALE_KM, 8);
    expect(v1mesh!.scale.y).toBeCloseTo(SPACECRAFT_RENDER_SCALE_KM, 8);
    expect(v1mesh!.scale.z).toBeCloseTo(SPACECRAFT_RENDER_SCALE_KM, 8);
  });

  it('uses the default GLB URL when none is provided', () => {
    const calls: string[] = [];
    const loader = {
      load: (
        url: string,
        _onLoad: (gltf: GLTF) => void,
      ): void => {
        calls.push(url);
        // Don't resolve — test only the URL argument.
      },
    };
    const models = new SpacecraftModels();
    void models.load({ loader });
    expect(calls).toEqual([DEFAULT_VOYAGER_GLB_URL]);
  });

  it('tick(et) applies the EphemerisService position to V1 and V2 groups', () => {
    const models = new SpacecraftModels();
    const ephem = stubEphemeris({
      [-31]: worldVec3(1.0e8, 2.0e8, 3.0e8),
      [-32]: worldVec3(-1.5e8, 0.0, 1.0e8),
    });
    // Use an ET well after both launches (e.g. 2010).
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

    // First tick at a valid time with valid ephemeris.
    models.tick(0, stubEphemeris({ [-31]: worldVec3(42, 0, 0), [-32]: worldVec3(0, 42, 0) }));
    expect(v1.position.x).toBe(42);
    expect(v1.visible).toBe(true);

    // Second tick with null ephemeris — position must NOT jump to origin.
    models.tick(0, stubEphemeris({ [-31]: null, [-32]: null }));
    expect(v1.position.x).toBe(42); // unchanged
    expect(v1.visible).toBe(true); // still visible — we have a valid prior
  });

  it('tick(et): hides V2 before V2_LAUNCH_ET (AC8)', () => {
    const models = new SpacecraftModels();
    // Pre-launch ET: 100 seconds before V2 liftoff.
    const preLaunchEt = V2_LAUNCH_ET - 100;
    models.tick(preLaunchEt, stubEphemeris({ [-32]: worldVec3(1, 2, 3) }));
    expect(models.getHandle('voyager-2').group.visible).toBe(false);
  });

  it('tick(et): hides V1 before V1_LAUNCH_ET (AC8)', () => {
    const models = new SpacecraftModels();
    // V1 hasn't launched but V2 has — pick an ET in the V2-only window.
    const v2OnlyEt = V2_LAUNCH_ET + 86400; // one day after V2 launch
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
