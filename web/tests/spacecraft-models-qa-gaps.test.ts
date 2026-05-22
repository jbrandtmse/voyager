// @vitest-environment happy-dom
/**
 * Story 3.3 — QA gap suite (cross-cutting integration coverage).
 *
 * Story 3.3 introduces the named-hierarchy contract (BUS / SCAN_PLATFORM / HGA)
 * and the 4-LOD chain, plus the manifest schema extension. The dev-authored
 * suite covers:
 *   - 8 tests in `web/src/render/spacecraft-models.test.ts` (LOD construction,
 *     named-hierarchy resolution, fallback warn-once, MeshoptDecoder + KTX2
 *     registration, AC6 rotation defense).
 *   - 5 tests in `web/src/services/manifest-loader.test.ts` (AC4 schema:
 *     no-models back-compat, well-formed parse, malformed sha256 reject,
 *     negative maxDistanceKm reject, empty lods reject).
 *   - 4 integration tests in `web/tests/spacecraft-models-attitude-integration.test.ts`
 *     (AC7 — full boot stack, AttitudeService ↔ SpacecraftModels wire-up).
 *   - 7 pure-JS pipeline unit tests in `web/scripts/build_glb.test.ts`
 *     (restructureHierarchy + countVertices).
 *   - 5 tests in `bake/tests/test_manifest_writer.py` (models param +
 *     pre-write validation).
 *
 * This QA gap file fills cross-cutting gaps the dev suite does not exercise
 * (per QA brief — Story 3.3 review handoff):
 *
 *   1. **AC1 — HGA quaternion orientation is the load-bearing FK derivation**
 *      Dev verifies `getObjectByName('HGA')` resolves but does NOT verify the
 *      HGA group's quaternion equals the (1,0,0,0) Rx(180°) baked by
 *      `restructureHierarchy`. The HGA quaternion is the FK contract that
 *      maps the dish's local +Z to the bus -Z boresight (per Story 3.2 §
 *      Completion Note 4 derivation of VG1_HGA_BORESIGHT_RELATIVE_TO_BUS).
 *      If a future bake silently strips the HGA quaternion, Story 3.5's
 *      NA-camera-cone visual lands at a wrong direction.
 *
 *   2. **AC6 — SCAN_PLATFORM rotation pivot IS the group origin**
 *      Dev verifies HGA invariance + platform-children world-matrix change
 *      but does NOT pin that the rotation center is the SCAN_PLATFORM's
 *      world position (the historical articulation axis). If a future change
 *      replaces the named-hierarchy SCAN_PLATFORM with a flat node whose
 *      origin is at the mesh's geometric centroid, this test fails loudly.
 *
 *   3. **AC7 — BUS quaternion propagation to HGA + platform descendants**
 *      Dev's integration test rotates BUS then platform and checks HGA
 *      invariance for the second rotation. The complementary contract — that
 *      applying a BUS quaternion DOES move both HGA and SCAN_PLATFORM
 *      children's world matrices — is not directly pinned. This is the
 *      Story 3.4 per-frame application path's primary contract.
 *
 *   4. **AC9 — `__voyagerDebug.spacecraftModels` surface contract**
 *      The lead-driven MCP smoke (AC9 probe 2 + 5) evaluates
 *      `window.__voyagerDebug.spacecraftModels.getHandle('voyager-1').{group,lod}`.
 *      Dev's tests bypass main.ts entirely. If a future refactor strips the
 *      publication, the MCP probes degrade to `undefined.getHandle is not a
 *      function`. Same defense pattern as qa-3-2 gap 3.
 *
 *   5. **AC4 — bake-side `_validate_models_fragment` boundary cases**
 *      Python dev tests cover sha256 + empty lods; this file's TS half asserts
 *      the matching runtime Zod schema rejects `level > 3` (Zod `.max(3)`)
 *      and `maxDistanceKm: 0` (Zod `.positive().nullable()`, where positive
 *      excludes 0). These are the Zod-side mirrors of the bake-side
 *      `_validate_models_fragment` contract that Python tests don't cover.
 *
 *   6. **AC2 — build_glb.ts LOD_SCHEDULE values are pinned**
 *      LOD_SCHEDULE is the source of truth for AC3's distance thresholds.
 *      A future contributor reordering or tweaking the ratios / distances
 *      without updating the runtime AC3 schedule in this story's
 *      Acceptance Criteria leaves the runtime out of sync with the AC. Pin
 *      the values here so the test fails before the AC drift can land.
 *
 *   7. **AC3 — single-LOD model entry constructs a degenerate LOD chain**
 *      Dev tests assume 4 LODs in the manifest. Zod `.min(1)` allows a
 *      single-LOD manifest (e.g., a fast contributor bake that didn't emit
 *      all four levels). The loader must handle this gracefully — single
 *      level becomes the only entry in THREE.LOD.levels. Defense against a
 *      "lods.length === 4" assumption baked into the loader.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, LOD, Vector3, Quaternion } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  SpacecraftModels,
  __resetFallbackWarnForTests,
} from '../src/render/spacecraft-models';
import type { Manifest, ManifestModel } from '../src/services/manifest-loader';
import {
  ManifestLoader,
  ManifestValidationError,
  __resetCacheForTests,
} from '../src/services/manifest-loader';
import { LOD_SCHEDULE } from '../scripts/build_glb';
import { VG1_HGA_BORESIGHT_RELATIVE_TO_BUS } from '../src/services/fk-constants';

// === Shared fixtures =========================================================

/**
 * Build a synthetic hierarchical GLTF whose HGA group carries the (1,0,0,0)
 * scalar-last quaternion — the same Rx(180°) `restructureHierarchy` bakes in.
 * The SCAN_PLATFORM sits at a known offset so the rotation-pivot test can
 * verify the world-space center.
 */
const SCAN_PLATFORM_OFFSET_Y = -0.567;
const HGA_OFFSET_Y = 2.125;
const HGA_QUAT_BAKED = { x: 1, y: 0, z: 0, w: 0 } as const;

const makeHierarchicalGltf = (): GLTF => {
  const scene = new Group();
  scene.name = 'voyager-glb-root';

  const bus = new Group();
  bus.name = 'BUS';

  const platform = new Group();
  platform.name = 'SCAN_PLATFORM';
  // Position SCAN_PLATFORM at the historical articulation axis offset.
  platform.position.set(0, SCAN_PLATFORM_OFFSET_Y, 0);

  const hga = new Group();
  hga.name = 'HGA';
  hga.position.set(0, HGA_OFFSET_Y, 0);
  // Bake the Rx(180°) HGA orientation (scalar-last (1,0,0,0)).
  hga.quaternion.set(HGA_QUAT_BAKED.x, HGA_QUAT_BAKED.y, HGA_QUAT_BAKED.z, HGA_QUAT_BAKED.w);

  // The platform mesh sits OFFSET from the SCAN_PLATFORM group's origin so
  // a "rotation pivots around mesh centroid" regression would visibly shift
  // the world center.
  const platformMesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
  platformMesh.name = 'mesh_PLATFORM';
  platformMesh.position.set(1.0, 0, 0); // 1m offset along +X of platform-local origin
  platform.add(platformMesh);

  const busMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  busMesh.name = 'mesh_BUS';
  bus.add(busMesh);

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

const makeFixtureManifest = (override?: Partial<ManifestModel>): Manifest =>
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
          { level: 0, url: '/models/v0.glb', sha256: 'a'.repeat(64), sizeBytes: 1024, maxDistanceKm: 0.001 },
          { level: 1, url: '/models/v1.glb', sha256: 'b'.repeat(64), sizeBytes: 512, maxDistanceKm: 0.1 },
          { level: 2, url: '/models/v2.glb', sha256: 'c'.repeat(64), sizeBytes: 256, maxDistanceKm: 1.0 },
          { level: 3, url: '/models/v3.glb', sha256: 'd'.repeat(64), sizeBytes: 128, maxDistanceKm: null },
        ],
        pivotMeters: [0, 0, 0],
        scaleToKm: 0.001,
        ...override,
      },
    ],
  }) as Manifest;

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

const mockResponse = (body: unknown, ok = true, status = 200): Response => ({
  ok,
  status,
  statusText: ok ? 'OK' : 'Error',
  json: async () => body,
}) as unknown as Response;

const VALID_TRAJ_MANIFEST = {
  schemaVersion: 1,
  bakeCommit: '7f850febaa40f2dc4443ef1f539a0f93c5ea539b',
  bakeTimestamp: '2026-05-21T00:00:00Z',
  kernels: [
    {
      file: 'naif0012.tls',
      kind: 'lsk',
      sha256: 'a'.repeat(64),
      source_url: 'https://example/lsk',
    },
  ],
  bodies: [
    {
      naifId: -31,
      name: 'Voyager 1',
      files: [
        {
          cadenceSec: 60.0,
          kind: 'trajectory',
          sha256: 'a'.repeat(64),
          sizeBytes: 132171,
          timeRangeEt: [-704412035.617, -704170303.4],
          url: 'data/voyager-1-seg01.bin.br',
        },
      ],
    },
  ],
  chapters: [],
  validationTolerances: { maxPositionErrorKm: 20.0, rmsPositionErrorKm: 5.0 },
};

// =============================================================================
// Gap 1 — AC1 HGA quaternion orientation
// =============================================================================

describe('QA gap 1 — AC1 HGA quaternion orientation is the FK derivation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetFallbackWarnForTests();
  });

  it('HGA group on the loaded scene carries the (1,0,0,0) Rx(180°) quaternion', async () => {
    // The Rx(180°) quaternion in scalar-last form is (x=1, y=0, z=0, w=0).
    // This maps the HGA's local +Z (the dish's boresight in the upstream
    // Blender export) to bus -Z (where VG1_HGA_BORESIGHT_RELATIVE_TO_BUS
    // says the boresight points). If a future change strips this rotation,
    // Story 3.5's NA-camera cone would render pointing the wrong direction.
    const gltf = makeHierarchicalGltf();
    const models = new SpacecraftModels();
    await models.load({ loader: makeSyncLoader(gltf) });

    const v1 = models.getHandle('voyager-1').group;
    const hga = v1.getObjectByName('HGA');
    expect(hga).toBeDefined();
    expect(hga!.quaternion.x).toBeCloseTo(HGA_QUAT_BAKED.x, 12);
    expect(hga!.quaternion.y).toBeCloseTo(HGA_QUAT_BAKED.y, 12);
    expect(hga!.quaternion.z).toBeCloseTo(HGA_QUAT_BAKED.z, 12);
    expect(hga!.quaternion.w).toBeCloseTo(HGA_QUAT_BAKED.w, 12);
  });

  it('HGA quaternion, when applied to the dish\'s local +Z axis, yields bus -Z (Story 3.2 FK derivation)', async () => {
    // The Story 3.2 fk-constants derivation:
    //   VG1_HGA_BORESIGHT_RELATIVE_TO_BUS = (0, 0, -1)
    // The HGA group's quaternion rotates the dish-local-frame +Z (which the
    // upstream Blender export uses as the dish boresight) into bus -Z. We
    // verify this by applying the HGA quaternion to (0, 0, +1) and asserting
    // the result is (0, 0, -1) within float64 epsilon.
    const gltf = makeHierarchicalGltf();
    const models = new SpacecraftModels();
    await models.load({ loader: makeSyncLoader(gltf) });

    const hga = models.getHandle('voyager-1').group.getObjectByName('HGA')!;
    const dishLocalBoresight = new Vector3(0, 0, 1);
    dishLocalBoresight.applyQuaternion(hga.quaternion);

    expect(dishLocalBoresight.x).toBeCloseTo(VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[0], 12);
    expect(dishLocalBoresight.y).toBeCloseTo(VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[1], 12);
    expect(dishLocalBoresight.z).toBeCloseTo(VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[2], 12);
  });
});

// =============================================================================
// Gap 2 — AC6 SCAN_PLATFORM rotation pivot is at group origin
// =============================================================================

describe('QA gap 2 — AC6 SCAN_PLATFORM rotation pivot is the group origin (not mesh centroid)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetFallbackWarnForTests();
  });

  it('platform mesh rotates in a circle whose center is the SCAN_PLATFORM\'s world position', async () => {
    // AC6 explicit contract: "the rotation pivot is the historical articulation
    // axis (SCAN_PLATFORM local origin), NOT the platform mesh's geometric
    // center". We rotate by 180° about local +Y and verify the platform mesh's
    // world position is the reflection-about-the-SCAN_PLATFORM-origin of its
    // original world position. If the pivot were the mesh centroid, a 180°
    // rotation would leave the world position unchanged (the centroid IS the
    // pivot in that case). Reflection ≠ identity for an offset mesh, so this
    // distinguishes the two hypotheses crisply.
    const gltf = makeHierarchicalGltf();
    const models = new SpacecraftModels();
    await models.load({ loader: makeSyncLoader(gltf) });

    const v1 = models.getHandle('voyager-1').group;
    const platform = v1.getObjectByName('SCAN_PLATFORM')!;
    const platformMesh = platform.children.find((c) => c.name === 'mesh_PLATFORM')!;

    // Establish the pre-rotation world positions.
    v1.updateMatrixWorld(true);
    const platformWorld = platform.getWorldPosition(new Vector3());
    const meshWorldBefore = platformMesh.getWorldPosition(new Vector3());
    // Vector from pivot to mesh, pre-rotation
    const offsetBefore = meshWorldBefore.clone().sub(platformWorld);

    // Rotate 180° about local +Y. After the rotation, the mesh's world
    // position offset from the pivot should be the negation of the
    // pre-rotation offset's X and Z components (Y unchanged for a +Y
    // rotation). With a 1m +X offset, post-rotation the mesh sits at
    // 1m -X relative to the platform's world position.
    platform.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    v1.updateMatrixWorld(true);
    const meshWorldAfter = platformMesh.getWorldPosition(new Vector3());
    const offsetAfter = meshWorldAfter.clone().sub(platformWorld);

    // 180° about Y inverts X and Z, preserves Y.
    expect(offsetAfter.x).toBeCloseTo(-offsetBefore.x, 10);
    expect(offsetAfter.y).toBeCloseTo(offsetBefore.y, 10);
    expect(offsetAfter.z).toBeCloseTo(-offsetBefore.z, 10);

    // The SCAN_PLATFORM's own world position is unchanged — the rotation is
    // a pure rotation about the platform's origin.
    const platformWorldAfter = platform.getWorldPosition(new Vector3());
    expect(platformWorldAfter.distanceTo(platformWorld)).toBeCloseTo(0, 10);
  });
});

// =============================================================================
// Gap 3 — AC7 BUS quaternion propagation
// =============================================================================

describe('QA gap 3 — AC7 BUS quaternion propagates to HGA + SCAN_PLATFORM children', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetFallbackWarnForTests();
  });

  it('applying a non-identity quat to BUS visibly moves both HGA and SCAN_PLATFORM child meshes', async () => {
    // The Story 3.4 per-frame application path will do:
    //   bus.quaternion.copy(AttitudeService.getBusQuat(...))
    //   platform.quaternion.copy(AttitudeService.getPlatformQuat(...))
    // The platform's quaternion is in BUS frame. So a non-identity bus quat
    // must propagate to BOTH the HGA's children AND the SCAN_PLATFORM's
    // children (via the scene-graph transform stack). Dev's integration test
    // checks the inverse — "platform rotation does NOT affect HGA" — but
    // doesn't directly verify "bus rotation DOES affect both".
    const gltf = makeHierarchicalGltf();
    const models = new SpacecraftModels();
    await models.load({ loader: makeSyncLoader(gltf) });

    const v1 = models.getHandle('voyager-1').group;
    const bus = v1.getObjectByName('BUS')!;
    const hgaMesh = v1.getObjectByName('mesh_HGA')!;
    const platformMesh = v1.getObjectByName('mesh_PLATFORM')!;

    // Identity bus quat: capture baseline world positions.
    bus.quaternion.identity();
    v1.updateMatrixWorld(true);
    const hgaMeshBaseline = hgaMesh.getWorldPosition(new Vector3());
    const platformMeshBaseline = platformMesh.getWorldPosition(new Vector3());

    // Apply a non-trivial bus quat — 90° about local +Z. The HGA + platform
    // children's world positions MUST move (since they're descendants of BUS
    // and BUS now has a non-identity rotation).
    bus.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
    v1.updateMatrixWorld(true);
    const hgaMeshAfter = hgaMesh.getWorldPosition(new Vector3());
    const platformMeshAfter = platformMesh.getWorldPosition(new Vector3());

    // Both meshes must visibly move (delta > 1e-3 m in world space).
    expect(hgaMeshAfter.distanceTo(hgaMeshBaseline)).toBeGreaterThan(1e-3);
    expect(platformMeshAfter.distanceTo(platformMeshBaseline)).toBeGreaterThan(1e-3);
  });

  it('subsequent platform-quat application composes onto the bus-quat (Story 3.4 per-frame contract)', async () => {
    // The Story 3.4 pattern applies BOTH quats per-frame:
    //   bus.quaternion.copy(busQuat)
    //   platform.quaternion.copy(platformQuat)
    // After updateMatrixWorld, the platform mesh's world transform is
    // bus_world * platform_local — i.e., the platform quat is COMPOSED onto
    // the bus quat. We verify this by applying both and asserting the
    // platform mesh's world quaternion encodes the composition.
    const gltf = makeHierarchicalGltf();
    const models = new SpacecraftModels();
    await models.load({ loader: makeSyncLoader(gltf) });

    const v1 = models.getHandle('voyager-1').group;
    const bus = v1.getObjectByName('BUS')!;
    const platform = v1.getObjectByName('SCAN_PLATFORM')!;

    const busQ = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 6);
    const platQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);

    bus.quaternion.copy(busQ);
    platform.quaternion.copy(platQ);
    v1.updateMatrixWorld(true);

    // Expected platform world rotation = busQ * platQ (parent-first convention).
    const expectedComposed = busQ.clone().multiply(platQ);
    const actualWorld = new Quaternion();
    platform.getWorldQuaternion(actualWorld);

    // Quaternion equality (modulo sign ambiguity is irrelevant here since the
    // factors are themselves canonical positive-w forms in this fixture).
    expect(actualWorld.x).toBeCloseTo(expectedComposed.x, 12);
    expect(actualWorld.y).toBeCloseTo(expectedComposed.y, 12);
    expect(actualWorld.z).toBeCloseTo(expectedComposed.z, 12);
    expect(actualWorld.w).toBeCloseTo(expectedComposed.w, 12);
  });
});

// =============================================================================
// Gap 4 — AC9 __voyagerDebug.spacecraftModels surface contract
// =============================================================================

describe('QA gap 4 — AC9 __voyagerDebug.spacecraftModels surface contract', () => {
  it('main.ts publishes spacecraftModels onto window.__voyagerDebug under import.meta.env.DEV', async () => {
    // We can't execute main.ts directly (boot side-effects: manifest fetch,
    // render loop, DOM mount). The contract under test is "main.ts contains
    // a code path that publishes window.__voyagerDebug.spacecraftModels when
    // import.meta.env.DEV is true". We grep the source for the literal
    // assignment + the DEV gate. Mirrors qa-3-2 gap 3 (attitudeService) and
    // the qa-3-0 / qa-2-x precedent.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const mainPath = path.resolve(__dirname, '..', 'src', 'main.ts');
    const src = fs.readFileSync(mainPath, 'utf8');
    expect(src).toMatch(/__voyagerDebug/);
    expect(src).toMatch(/spacecraftModels/);
    expect(src).toMatch(/import\.meta\.env\.DEV/);
  });

  it('the published surface exposes getHandle returning {group, lod} for both spacecraft ids', () => {
    // Pin the four API surfaces AC9 probes call:
    //   __voyagerDebug.spacecraftModels.getHandle('voyager-1').group
    //   __voyagerDebug.spacecraftModels.getHandle('voyager-1').lod
    //   __voyagerDebug.spacecraftModels.getHandle('voyager-2').group
    //   __voyagerDebug.spacecraftModels.getHandle('voyager-2').lod
    // If `getHandle` is renamed or the handle shape regresses, this test
    // fails before the AC9 smoke does.
    const models = new SpacecraftModels();
    const v1 = models.getHandle('voyager-1');
    const v2 = models.getHandle('voyager-2');
    expect(v1.group).toBeInstanceOf(Group);
    expect(v2.group).toBeInstanceOf(Group);
    // lod field exists on the handle (initially null, populated after a
    // multi-LOD load); test the property is present.
    expect('lod' in v1).toBe(true);
    expect('lod' in v2).toBe(true);
  });

  it('after a multi-LOD load, getHandle().lod is a THREE.LOD with the expected level count', async () => {
    // Pre-condition for AC9 probe 5: lod.levels.length === 4. Dev's tests
    // also cover this; we re-pin from the QA tier so the AC9-substrate
    // contract is locked at this layer too.
    const manifest = makeFixtureManifest();
    const gltf = makeHierarchicalGltf();
    const models = new SpacecraftModels();
    await models.load({ manifest, loader: makeSyncLoader(gltf) });

    const v1 = models.getHandle('voyager-1');
    expect(v1.lod).toBeInstanceOf(LOD);
    expect(v1.lod!.levels.length).toBe(4);
  });
});

// =============================================================================
// Gap 5 — AC4 Zod schema boundary cases (level > 3, maxDistanceKm = 0)
// =============================================================================

describe('QA gap 5 — AC4 Zod schema boundary cases', () => {
  beforeEach(() => {
    __resetCacheForTests();
  });

  it('rejects a model entry with level > 3 (Zod .max(3))', async () => {
    const malformed = {
      ...VALID_TRAJ_MANIFEST,
      models: [
        {
          id: 'voyager',
          lods: [
            {
              level: 4, // out of range — only 0..3 allowed
              url: '/models/v.glb',
              sha256: 'a'.repeat(64),
              sizeBytes: 1024,
              maxDistanceKm: 1.0,
            },
          ],
          pivotMeters: [0, 0, 0],
          scaleToKm: 0.001,
        },
      ],
    };
    const fetchImpl = vi.fn(async () => mockResponse(malformed));
    await expect(
      ManifestLoader.load('/level-too-high.json', { fetchImpl }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
  });

  it('rejects a model entry with maxDistanceKm = 0 (Zod .positive() excludes 0)', async () => {
    // Zod's z.number().positive() is strict (> 0), not non-negative. A
    // future contributor reading "max distance" loosely might pass 0 to
    // mean "this LOD never activates"; the schema must reject so the
    // contributor sees the error at manifest-load time, not via mysterious
    // LOD-misbehavior.
    const malformed = {
      ...VALID_TRAJ_MANIFEST,
      models: [
        {
          id: 'voyager',
          lods: [
            {
              level: 0,
              url: '/models/v.glb',
              sha256: 'a'.repeat(64),
              sizeBytes: 1024,
              maxDistanceKm: 0,
            },
          ],
          pivotMeters: [0, 0, 0],
          scaleToKm: 0.001,
        },
      ],
    };
    const fetchImpl = vi.fn(async () => mockResponse(malformed));
    await expect(
      ManifestLoader.load('/zero-distance.json', { fetchImpl }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
  });

  it('rejects a model entry with scaleToKm = 0 (positive contract)', async () => {
    const malformed = {
      ...VALID_TRAJ_MANIFEST,
      models: [
        {
          id: 'voyager',
          lods: [
            {
              level: 0,
              url: '/models/v.glb',
              sha256: 'a'.repeat(64),
              sizeBytes: 1024,
              maxDistanceKm: 1.0,
            },
          ],
          pivotMeters: [0, 0, 0],
          scaleToKm: 0,
        },
      ],
    };
    const fetchImpl = vi.fn(async () => mockResponse(malformed));
    await expect(
      ManifestLoader.load('/zero-scale.json', { fetchImpl }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
  });

  it('rejects a model entry whose pivotMeters tuple is the wrong length', async () => {
    // The Zod schema uses z.tuple([number, number, number]). A 2-tuple or
    // 4-tuple is a structural mismatch that should fail at manifest-load.
    const malformed = {
      ...VALID_TRAJ_MANIFEST,
      models: [
        {
          id: 'voyager',
          lods: [
            {
              level: 0,
              url: '/models/v.glb',
              sha256: 'a'.repeat(64),
              sizeBytes: 1024,
              maxDistanceKm: 1.0,
            },
          ],
          pivotMeters: [0, 0], // wrong arity
          scaleToKm: 0.001,
        },
      ],
    };
    const fetchImpl = vi.fn(async () => mockResponse(malformed));
    await expect(
      ManifestLoader.load('/bad-pivot.json', { fetchImpl }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
  });
});

// =============================================================================
// Gap 6 — AC2 build_glb.ts LOD_SCHEDULE pinning
// =============================================================================

describe('QA gap 6 — AC2 LOD_SCHEDULE is the single source of truth for AC3 thresholds', () => {
  it('LOD_SCHEDULE has exactly 4 entries with levels 0..3 in order', () => {
    expect(LOD_SCHEDULE.length).toBe(4);
    expect(LOD_SCHEDULE.map((s) => s.level)).toEqual([0, 1, 2, 3]);
  });

  it('LOD_SCHEDULE simplify ratios match AC2 commitment (1.0 / 0.5 / 0.2 / 0.05)', () => {
    expect(LOD_SCHEDULE[0].ratio).toBe(1.0);
    expect(LOD_SCHEDULE[1].ratio).toBe(0.5);
    expect(LOD_SCHEDULE[2].ratio).toBe(0.2);
    expect(LOD_SCHEDULE[3].ratio).toBe(0.05);
  });

  it('LOD_SCHEDULE distance thresholds match AC3 commitment (0.001 / 0.1 / 1.0 / null)', () => {
    expect(LOD_SCHEDULE[0].maxDistanceKm).toBe(0.001);
    expect(LOD_SCHEDULE[1].maxDistanceKm).toBe(0.1);
    expect(LOD_SCHEDULE[2].maxDistanceKm).toBe(1.0);
    expect(LOD_SCHEDULE[3].maxDistanceKm).toBeNull();
  });

  it('LOD_SCHEDULE distances are monotonically increasing (THREE.LOD addLevel requires it)', () => {
    // THREE.LOD.addLevel requires distance values to monotonically increase
    // across levels. null is mapped to Infinity by the loader (per AC3
    // rationale comment + spacecraft-models.ts:301-306). We assert the
    // monotonic invariant explicitly so a future contributor who tweaks
    // LOD_SCHEDULE sees the contract violation up-front.
    const expanded = LOD_SCHEDULE.map((s) =>
      s.maxDistanceKm === null ? Number.POSITIVE_INFINITY : s.maxDistanceKm,
    );
    for (let i = 1; i < expanded.length; i += 1) {
      expect(expanded[i]).toBeGreaterThan(expanded[i - 1]);
    }
  });
});

// =============================================================================
// Gap 7 — AC3 single-LOD model entry construction
// =============================================================================

describe('QA gap 7 — AC3 single-LOD model entry constructs a THREE.LOD with one level', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetFallbackWarnForTests();
  });

  it('a manifest with a single-LOD model still constructs a 1-level THREE.LOD per spacecraft', async () => {
    // Zod schema's z.array(ModelLodSchema).min(1) allows a single-element
    // lods array. The loader must handle this case rather than assuming 4
    // LODs. Defends against a future "lods.length === 4" assumption baked
    // into the loader if a contributor refactors loadMultiLod.
    const manifest = makeFixtureManifest({
      lods: [
        {
          level: 0,
          url: '/models/voyager-lod0.aaaaaaaa.glb',
          sha256: 'a'.repeat(64),
          sizeBytes: 1024,
          maxDistanceKm: null, // sole entry — far-field catch-all
        },
      ],
    });
    const gltf = makeHierarchicalGltf();
    const models = new SpacecraftModels();
    await models.load({ manifest, loader: makeSyncLoader(gltf) });

    const v1 = models.getHandle('voyager-1');
    const v2 = models.getHandle('voyager-2');
    expect(v1.lod).toBeInstanceOf(LOD);
    expect(v1.lod!.levels.length).toBe(1);
    expect(v2.lod!.levels.length).toBe(1);
    expect(v1.lod!.levels[0].distance).toBe(Number.POSITIVE_INFINITY);
  });

  it('a model entry whose LODs are NOT in level-sorted order is sorted by the loader before addLevel', async () => {
    // The loader sorts `model.lods` by `level` ascending before iterating
    // (spacecraft-models.ts:261). This defends against a manifest emitter
    // that doesn't sort — a future bake change that emits LODs in
    // arbitrary order must still produce a monotonic-distance LOD chain
    // (THREE.LOD requires monotonic distances).
    const manifest = makeFixtureManifest();
    // Permute the LODs so they're not in level order.
    manifest.models[0] = {
      ...manifest.models[0],
      lods: [
        manifest.models[0].lods[3], // level 3, distance Infinity
        manifest.models[0].lods[0], // level 0, distance 0.001
        manifest.models[0].lods[2], // level 2, distance 1.0
        manifest.models[0].lods[1], // level 1, distance 0.1
      ],
    };
    const gltf = makeHierarchicalGltf();
    const models = new SpacecraftModels();
    await models.load({ manifest, loader: makeSyncLoader(gltf) });

    const lod = models.getHandle('voyager-1').lod!;
    // Distances must be monotonically increasing (= sorted by level).
    expect(lod.levels[0].distance).toBe(0.001);
    expect(lod.levels[1].distance).toBe(0.1);
    expect(lod.levels[2].distance).toBe(1.0);
    expect(lod.levels[3].distance).toBe(Number.POSITIVE_INFINITY);
  });
});
