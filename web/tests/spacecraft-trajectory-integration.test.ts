// @vitest-environment happy-dom
//
// Story 1.12 integration test — exercises SpacecraftModels + TrajectoryLines
// together against a stub EphemerisService, asserting that:
//   - spacecraft positions match `EphemerisService.getStateAt` output post-tick
//   - past-line vertex count grows + future-line vertex count shrinks as
//     simulation time advances (AC6)
//   - the FR49 non-color-only encoding holds (past=solid, future=dashed)
//
// The renderer (real WebGLRenderer) is NOT instantiated — happy-dom has no
// GL backend. This test verifies the scene-graph + tick-callback contract
// in isolation; renderer-side correctness is covered by Story 1.5's tests.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Group } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Mesh, BoxGeometry, MeshBasicMaterial } from 'three';

import { SpacecraftModels } from '../src/render/spacecraft-models';
import { TrajectoryLines, type PositionProvider } from '../src/render/trajectory-lines';
import { worldVec3 } from '../src/types/branded';
import type { WorldVec3 } from '../src/types/branded';
import type { EphemerisService } from '../src/services/ephemeris-service';
import {
  V1_LAUNCH_ET,
  V2_LAUNCH_ET,
  MISSION_END_ET,
} from '../src/constants/mission';

const makeFakeGltf = (): GLTF => {
  const scene = new Group();
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  scene.add(mesh);
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

/** Position provider that traces a circle in the xy-plane scaled by ET delta. */
const circularProvider: PositionProvider = (et, naifId) => {
  // Different orbital radii so V1 and V2 are distinguishable.
  const offset = naifId === -31 ? V1_LAUNCH_ET : V2_LAUNCH_ET;
  const radius = naifId === -31 ? 1.0e8 : 2.0e8; // km
  const dt = et - offset;
  // Full revolution every 10 years in km/s of "fake" simulation.
  const omega = (2 * Math.PI) / (10 * 365.25 * 86400);
  const phase = omega * dt;
  return worldVec3(radius * Math.cos(phase), radius * Math.sin(phase), 0);
};

const ephemerisFromProvider = (provider: PositionProvider): EphemerisService =>
  ({
    getStateAt: (et: number, bodyId: number) => {
      const p = provider(et, bodyId);
      return p === null ? null : { position: p, velocity: worldVec3(0, 0, 0) };
    },
    getPosition: (et: number, bodyId: number): WorldVec3 | null => provider(et, bodyId),
  }) as unknown as EphemerisService;

describe('Story 1.12 — spacecraft + trajectory integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('end-to-end: ticks update spacecraft positions to ephemeris values', async () => {
    const ephem = ephemerisFromProvider(circularProvider);
    const models = new SpacecraftModels();
    await models.load({
      loader: {
        load: (_url: string, onLoad: (gltf: GLTF) => void) => onLoad(makeFakeGltf()),
      },
    });
    const lines = new TrajectoryLines(circularProvider);

    const midEt = V1_LAUNCH_ET + 0.5 * (MISSION_END_ET - V1_LAUNCH_ET);
    models.tick(midEt, ephem);
    lines.tick(midEt);

    const v1Pos = models.getHandle('voyager-1').group.position;
    const expected = circularProvider(midEt, -31);
    expect(expected).not.toBeNull();
    // Compare ratio rather than absolute precision — the Float64→Float32 cast
    // in renderVec3FromWorld() loses ~7 digits, which at 1e8 km absolute is
    // ~10 km of cast-induced error. Assert proximity within 50 km absolute.
    expect(Math.abs(v1Pos.x - expected![0])).toBeLessThan(50);
    expect(Math.abs(v1Pos.y - expected![1])).toBeLessThan(50);
    expect(Math.abs(v1Pos.z - expected![2])).toBeLessThan(50);
  });

  it('past-line vertex count grows as time advances; future shrinks', () => {
    const lines = new TrajectoryLines(circularProvider);
    const earlyEt = V1_LAUNCH_ET + 0.1 * (MISSION_END_ET - V1_LAUNCH_ET);
    const lateEt = V1_LAUNCH_ET + 0.9 * (MISSION_END_ET - V1_LAUNCH_ET);

    lines.tick(earlyEt);
    const v1 = lines._peekSet('voyager-1');
    const pastEarly = v1.pastLine.geometry.attributes.instanceStart.count;
    const futureEarly = v1.futureLine.geometry.attributes.instanceStart.count;

    lines.tick(lateEt);
    const pastLate = v1.pastLine.geometry.attributes.instanceStart.count;
    const futureLate = v1.futureLine.geometry.attributes.instanceStart.count;

    expect(pastLate).toBeGreaterThan(pastEarly);
    expect(futureLate).toBeLessThan(futureEarly);
  });

  it('FR49 non-color-only encoding: past = solid, future = dashed', () => {
    const lines = new TrajectoryLines(circularProvider);
    const v1 = lines._peekSet('voyager-1');
    const v2 = lines._peekSet('voyager-2');
    expect(v1.pastMaterial.dashed).toBe(false);
    expect(v1.futureMaterial.dashed).toBe(true);
    expect(v2.pastMaterial.dashed).toBe(false);
    expect(v2.futureMaterial.dashed).toBe(true);
  });

  it('both spacecraft + 4 trajectory lines live under their respective Groups', async () => {
    const models = new SpacecraftModels();
    const lines = new TrajectoryLines(circularProvider);
    const worldGroup = new Group();
    worldGroup.add(models.root);
    worldGroup.add(lines.root);

    // SpacecraftModels.root contains 2 child groups (voyager-1, voyager-2).
    expect(models.root.children.length).toBe(2);
    // TrajectoryLines.root contains 4 Line2 instances (past+future × 2).
    const line2Count = lines.root.children.filter((c) => c instanceof Line2).length;
    expect(line2Count).toBe(4);
    // Both roots are children of the WorldGroup mock.
    expect(worldGroup.children).toContain(models.root);
    expect(worldGroup.children).toContain(lines.root);
  });

  it('V2 hidden before V2 launch, then visible after launch', () => {
    const ephem = ephemerisFromProvider(circularProvider);
    const models = new SpacecraftModels();
    // Pre-launch: 1 hour before V2 liftoff.
    models.tick(V2_LAUNCH_ET - 3600, ephem);
    expect(models.getHandle('voyager-2').group.visible).toBe(false);

    // Post-launch: 1 day after V2 liftoff (still pre-V1).
    models.tick(V2_LAUNCH_ET + 86400, ephem);
    expect(models.getHandle('voyager-2').group.visible).toBe(true);
    expect(models.getHandle('voyager-1').group.visible).toBe(false);
  });
});
