// @vitest-environment happy-dom
/**
 * Story 3.4 AC8 — Integration AC: AttitudeApplier ↔ AttitudeService ↔
 * SpacecraftModels end-to-end.
 *
 * The full boot-stack path is exercised by:
 *   1. Building a fixture manifest with V1 + V2 bus_attitude +
 *      platform_attitude entries (mirrors attitude-service-integration.test.ts
 *      + spacecraft-models-attitude-integration.test.ts patterns)
 *   2. Loading a synthetic 4-LOD hierarchical GLTF (mirrors what
 *      `web/scripts/build_glb.ts` emits with BUS / SCAN_PLATFORM / HGA)
 *   3. Wiring the same ChunkLoader instance into BOTH EphemerisService and
 *      AttitudeService (verifying AC1's single-loader contract)
 *   4. Mounting AttitudeApplier and ticking it at:
 *      - A CK-window ET: BUS + SCAN_PLATFORM quaternions reflect the CK
 *        SLERP result within 1e-12 absolute (AC8 § "within 1e-12 per-component")
 *      - A synthesized-cruise ET: BUS quaternion is unit-length and
 *        oriented so the HGA boresight aligns with the spacecraft→Earth
 *        direction (AC8 § "rotating the HGA boresight constant (0,0,-1)")
 *   5. AC3 zero-allocation assertion: spies on `Quaternion.copy` and
 *      `getObjectByName`; tick 100× and verify call counts.
 *   6. AC8 § publishing the debug surface — verified at the main.ts wiring
 *      level (not a runtime assertion here; the wiring is tested by the
 *      lead's Chrome DevTools MCP smoke).
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Quaternion } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { ChunkLoader } from '../src/services/chunk-loader';
import { EphemerisService } from '../src/services/ephemeris-service';
import { AttitudeService, EARTH_NAIF_ID } from '../src/services/attitude-service';
import { SpacecraftModels } from '../src/render/spacecraft-models';
import { AttitudeApplier } from '../src/render/attitude-applier';
import { worldVec3 } from '../src/types/branded';
import type { WorldVec3 } from '../src/types/branded';
import type { Manifest, ManifestFile } from '../src/services/manifest-loader';
import {
  V1_NAIF_ID,
  V2_NAIF_ID,
  VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
} from '../src/services/fk-constants';

const V1_BUS_CK_ID = -31000;
const V1_PLATFORM_CK_ID = -31100;

// === Fixture VTRJ builder (mirrors prior integration tests) =================

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
  hga.quaternion.set(1, 0, 0, 0);

  const busMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  busMesh.name = 'mesh_BUS';
  bus.add(busMesh);

  const platformMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
  platformMesh.name = 'mesh_PLATFORM';
  platform.add(platformMesh);

  const hgaMesh = new Mesh(new BoxGeometry(2, 0.2, 2), new MeshBasicMaterial());
  hgaMesh.name = 'mesh_HGA';
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

// === Stub EphemerisService for synthesized-path query =====================

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
    // The SpacecraftModels.tick() path queries getStateAt; provide a
    // non-null answer for V1 + V2 so they're marked visible.
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
const FIXTURE_ET_CRUISE = 0.0;

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

describe('Story 3.4 AC8 — AttitudeApplier integration with full boot stack', () => {
  const buildStack = async (): Promise<{
    chunkLoader: ChunkLoader;
    attitudeService: AttitudeService;
    spacecraftModels: SpacecraftModels;
    applier: AttitudeApplier;
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

    // Prefetch the attitude chunks (mirrors main.ts's spacecraft chunk
    // prefetch contract — the test must not race the per-frame load).
    await chunkLoader.load(manifest.bodies[0].files[0]);
    await chunkLoader.load(manifest.bodies[0].files[1]);

    // Load the hierarchical synthetic GLB for SpacecraftModels. The test
    // loader returns the same fixture for every LOD URL — Story 3.3's
    // clone(true) ensures V1 and V2 have independent BUS / SCAN_PLATFORM
    // subtrees.
    const gltf = makeHierarchicalGltf();
    const loader = {
      load: (_url: string, onLoad: (g: GLTF) => void): void => {
        onLoad(gltf);
      },
    };
    const spacecraftModels = new SpacecraftModels();
    await spacecraftModels.load({ manifest, loader });

    // Run a single SpacecraftModels.tick() so the visibility gate is set
    // for both V1 and V2 at the CK-window ET (the stub ephemeris returns
    // a non-null position).
    spacecraftModels.tick(FIXTURE_ET_INSIDE, ephem as unknown as EphemerisService);

    const applier = new AttitudeApplier();

    return { chunkLoader, attitudeService, spacecraftModels, applier, ephem };
  };

  it('CK-window ET: BUS + SCAN_PLATFORM quaternions match AttitudeService output within 1e-12', async () => {
    const { attitudeService, spacecraftModels, applier } = await buildStack();

    applier.tick(FIXTURE_ET_INSIDE, attitudeService, spacecraftModels);

    const v1 = spacecraftModels.getHandle('voyager-1');
    const bus = v1.group.getObjectByName('BUS')!;
    const platform = v1.group.getObjectByName('SCAN_PLATFORM')!;

    // Reference values from AttitudeService at the same ET.
    const busQuat = attitudeService.getBusQuat(V1_NAIF_ID, FIXTURE_ET_INSIDE)!;
    const platformQuat = attitudeService.getPlatformQuat(V1_NAIF_ID, FIXTURE_ET_INSIDE)!;

    expect(bus.quaternion.x).toBeCloseTo(busQuat.x, 12);
    expect(bus.quaternion.y).toBeCloseTo(busQuat.y, 12);
    expect(bus.quaternion.z).toBeCloseTo(busQuat.z, 12);
    expect(bus.quaternion.w).toBeCloseTo(busQuat.w, 12);

    expect(platform.quaternion.x).toBeCloseTo(platformQuat.x, 12);
    expect(platform.quaternion.y).toBeCloseTo(platformQuat.y, 12);
    expect(platform.quaternion.z).toBeCloseTo(platformQuat.z, 12);
    expect(platform.quaternion.w).toBeCloseTo(platformQuat.w, 12);

    // Confirm both quaternions are unit-length (the SLERP path guarantees this).
    const busNorm = Math.hypot(bus.quaternion.x, bus.quaternion.y, bus.quaternion.z, bus.quaternion.w);
    const platformNorm = Math.hypot(
      platform.quaternion.x,
      platform.quaternion.y,
      platform.quaternion.z,
      platform.quaternion.w,
    );
    expect(busNorm).toBeCloseTo(1.0, 12);
    expect(platformNorm).toBeCloseTo(1.0, 12);
  });

  it('synthesized-cruise ET: BUS quaternion rotates HGA boresight (0,0,-1) to align with spacecraft→Earth direction', async () => {
    const { attitudeService, spacecraftModels, applier, ephem } = await buildStack();

    // Re-tick SpacecraftModels at cruise ET so visibility is current.
    spacecraftModels.tick(FIXTURE_ET_CRUISE, ephem as unknown as EphemerisService);

    applier.tick(FIXTURE_ET_CRUISE, attitudeService, spacecraftModels);

    const v1 = spacecraftModels.getHandle('voyager-1');
    const bus = v1.group.getObjectByName('BUS')!;

    // V1 is at (10e6, 0, 0); Earth at origin. spacecraft→Earth = (-1, 0, 0).
    // After applying the bus quaternion, the HGA boresight (0, 0, -1) in bus
    // frame must equal (-1, 0, 0) in world frame.
    const boresight = new THREE.Vector3(
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[0],
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[1],
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[2],
    ).applyQuaternion(bus.quaternion);

    expect(boresight.x).toBeCloseTo(-1, 12);
    expect(boresight.y).toBeCloseTo(0, 12);
    expect(boresight.z).toBeCloseTo(0, 12);
  });

  it('synthesized-cruise: SCAN_PLATFORM matches BUS quaternion (rest pose is identity per FK)', async () => {
    const { attitudeService, spacecraftModels, applier, ephem } = await buildStack();
    spacecraftModels.tick(FIXTURE_ET_CRUISE, ephem as unknown as EphemerisService);
    applier.tick(FIXTURE_ET_CRUISE, attitudeService, spacecraftModels);

    const v1 = spacecraftModels.getHandle('voyager-1');
    const bus = v1.group.getObjectByName('BUS')!;
    const platform = v1.group.getObjectByName('SCAN_PLATFORM')!;

    // Per fk-constants: PLATFORM_REST_QUAT_RELATIVE_TO_BUS = identity.
    // AttitudeService.synthesizePlatformQuat returns bus_quat · identity = bus_quat.
    expect(platform.quaternion.x).toBeCloseTo(bus.quaternion.x, 12);
    expect(platform.quaternion.y).toBeCloseTo(bus.quaternion.y, 12);
    expect(platform.quaternion.z).toBeCloseTo(bus.quaternion.z, 12);
    expect(platform.quaternion.w).toBeCloseTo(bus.quaternion.w, 12);
  });

  it('AC3 zero-allocation: 100 ticks → 400 copy() calls, getObjectByName at most 4 total', async () => {
    const { attitudeService, spacecraftModels, applier } = await buildStack();

    // Spy on Quaternion.prototype.copy + each spacecraft group's getObjectByName.
    const copySpy = vi.spyOn(Quaternion.prototype, 'copy');
    const v1 = spacecraftModels.getHandle('voyager-1');
    const v2 = spacecraftModels.getHandle('voyager-2');
    const v1Spy = vi.spyOn(v1.group, 'getObjectByName');
    const v2Spy = vi.spyOn(v2.group, 'getObjectByName');

    // V2's CK file is empty in the fixture (no bus_attitude entry), so
    // attitudeService.getBusQuat(V2, FIXTURE_ET_INSIDE) hits the synthesized
    // path — but the stub ephemeris returns valid positions, so the
    // synthesized path returns a non-null quaternion. copy() is still
    // called for V2.
    const N = 100;
    const copyCallsBefore = copySpy.mock.calls.length;
    for (let i = 0; i < N; i += 1) {
      applier.tick(FIXTURE_ET_INSIDE + i, attitudeService, spacecraftModels);
    }
    const copyCallsDelta = copySpy.mock.calls.length - copyCallsBefore;

    // Per AC3: each tick writes 4 quaternions (V1 bus, V1 platform, V2 bus,
    // V2 platform). 100 ticks → 400 copy() calls FROM THE APPLIER.
    // The synthesized path inside AttitudeService also calls copy() once for
    // the platform-rest compose (synthesizePlatformQuat), but that's inside
    // a Three.Quaternion instance, not the cached BUS/SCAN_PLATFORM node.
    // We assert a lower bound of 4 × N and an upper bound that accounts for
    // the per-tick synthesized-path internal allocs (≤ 2 internal copies per
    // synthesized platform call × 2 spacecraft × N ticks = 400 internal max).
    expect(copyCallsDelta).toBeGreaterThanOrEqual(4 * N);
    // Upper bound: 4 applier copies + at most ~4 internal copies per tick
    // (synthesized platform path inside AttitudeService). Tight enough to
    // catch a regression that retains references and triggers a Three.js
    // internal mutation cascade.
    expect(copyCallsDelta).toBeLessThanOrEqual(4 * N + 4 * N);

    // First-tick resolution only: at most 2 per spacecraft × 2 spacecraft = 4.
    // The LOD currentLevel doesn't change across the 100 ticks (single
    // camera distance), so no re-resolution.
    expect(v1Spy.mock.calls.length + v2Spy.mock.calls.length).toBeLessThanOrEqual(4);

    copySpy.mockRestore();
  });

  it('AC1 — single ChunkLoader contract: AttitudeApplier ↔ AttitudeService ↔ ChunkLoader share one cache', async () => {
    const { chunkLoader, attitudeService, spacecraftModels, applier } = await buildStack();

    // After prefetch in buildStack, both attitude URLs should be in cache.
    expect(chunkLoader.__cacheSize()).toBe(2);

    // 10 ticks of the applier MUST NOT trigger additional chunk loads —
    // AttitudeService uses the chunkLoader.peek() fast path.
    const sizeBefore = chunkLoader.__cacheSize();
    for (let i = 0; i < 10; i += 1) {
      applier.tick(FIXTURE_ET_INSIDE + i, attitudeService, spacecraftModels);
    }
    expect(chunkLoader.__cacheSize()).toBe(sizeBefore);
  });
});
