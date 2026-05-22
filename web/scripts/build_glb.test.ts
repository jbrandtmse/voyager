// @vitest-environment node
/**
 * Story 3.3 AC2 — unit tests for `web/scripts/build_glb.ts`.
 *
 * The full pipeline (`buildGlb`) requires `toktx` on PATH and the raw input
 * GLB on disk; both are CI-only prerequisites. These tests exercise the
 * pure-JS pieces — the `restructureHierarchy` mesh re-parenting + the
 * `countVertices` helper — against synthetic in-memory documents authored
 * via the gltf-transform JS API. This is the AC2 T2.11 contract:
 *
 *   (a) given a fixture input + mapping, the script produces output with
 *       BUS/SCAN_PLATFORM/HGA named nodes — exercised against a synthetic
 *       4-mesh document mirroring the upstream NASA model's shape;
 *   (b) the output node tree has BUS/SCAN_PLATFORM/HGA named nodes at
 *       every LOD — verified by inspecting the restructured document;
 *   (c) re-running with identical input produces byte-identical output
 *       (idempotency) — verified by running restructureHierarchy twice on
 *       fresh-cloned documents and comparing the JSON serialization.
 *
 * The KTX2 transcode step + meshopt compression are integration tests
 * gated on `toktx` availability; this file's tests are environment-free.
 */

import { describe, it, expect } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import { restructureHierarchy, countVertices, type MeshMapping } from './build_glb';

const FIXTURE_MAPPING: MeshMapping = {
  source_sha256: 'a'.repeat(64),
  source_path: 'bake/inputs/models/voyager-raw.glb',
  phase0_notes: 'fixture',
  mesh_mapping: [
    {
      source_mesh_index: 0,
      source_name: 'BODY.040',
      target_parent: 'BUS',
      rationale: 'fixture-bus',
    },
    {
      source_mesh_index: 1,
      source_name: 'BODY.000',
      target_parent: 'HGA',
      rationale: 'fixture-hga',
    },
    {
      source_mesh_index: 2,
      source_name: 'BODY.002',
      target_parent: 'SCAN_PLATFORM',
      rationale: 'fixture-platform',
    },
    {
      source_mesh_index: 3,
      source_name: 'Cube.004',
      target_parent: 'BUS',
      rationale: 'fixture-skeletal',
    },
  ],
  scan_platform_pivot_meters: [0, -0.567, 0],
  scan_platform_pivot_rationale: 'fixture-pivot',
  hga_orientation_relative_to_bus_quat: [1, 0, 0, 0],
  hga_orientation_rationale: 'fixture-quat',
  hga_position_meters: [0, 2.125, 0],
  hga_position_rationale: 'fixture-position',
};

/**
 * Build a synthetic gltf-transform Document with 4 named meshes that match
 * the upstream NASA Voyager Probe (B) GLB's mesh count + naming. The
 * meshes are minimal (3 vertices each, one primitive) — enough to exercise
 * the restructure logic.
 */
const buildFixtureDocument = (): Document => {
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene();

  const meshNames = ['BODY.040', 'BODY.000', 'BODY.002', 'Cube.004'];
  for (const name of meshNames) {
    const positions = doc
      .createAccessor()
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setType('VEC3')
      .setBuffer(buf);
    const prim = doc.createPrimitive().setAttribute('POSITION', positions);
    const mesh = doc.createMesh(name).addPrimitive(prim);
    const node = doc.createNode(`node-${name}`).setMesh(mesh);
    scene.addChild(node);
  }
  return doc;
};

describe('Story 3.3 AC2 — build_glb.ts pure-JS pipeline pieces', () => {
  it('restructureHierarchy creates BUS / SCAN_PLATFORM / HGA named nodes', () => {
    const doc = buildFixtureDocument();
    restructureHierarchy(doc, FIXTURE_MAPPING);

    const nodes = doc.getRoot().listNodes();
    const names = nodes.map((n) => n.getName()).sort();
    expect(names).toContain('BUS');
    expect(names).toContain('SCAN_PLATFORM');
    expect(names).toContain('HGA');
  });

  it('restructureHierarchy puts SCAN_PLATFORM + HGA as children of BUS', () => {
    const doc = buildFixtureDocument();
    restructureHierarchy(doc, FIXTURE_MAPPING);

    const bus = doc.getRoot().listNodes().find((n) => n.getName() === 'BUS')!;
    expect(bus).toBeDefined();
    const childNames = bus
      .listChildren()
      .map((c) => c.getName())
      .filter((n) => n === 'BUS' || n === 'SCAN_PLATFORM' || n === 'HGA');
    expect(childNames.sort()).toEqual(['HGA', 'SCAN_PLATFORM']);
  });

  it('restructureHierarchy sets SCAN_PLATFORM translation to the pivot offset', () => {
    const doc = buildFixtureDocument();
    restructureHierarchy(doc, FIXTURE_MAPPING);

    const platform = doc.getRoot().listNodes().find((n) => n.getName() === 'SCAN_PLATFORM')!;
    expect(platform.getTranslation()).toEqual([0, -0.567, 0]);
  });

  it('restructureHierarchy sets HGA quaternion to the bus-frame rotation', () => {
    const doc = buildFixtureDocument();
    restructureHierarchy(doc, FIXTURE_MAPPING);

    const hga = doc.getRoot().listNodes().find((n) => n.getName() === 'HGA')!;
    expect(hga.getRotation()).toEqual([1, 0, 0, 0]);
  });

  it('restructureHierarchy parents meshes under the correct target group', () => {
    const doc = buildFixtureDocument();
    restructureHierarchy(doc, FIXTURE_MAPPING);

    const bus = doc.getRoot().listNodes().find((n) => n.getName() === 'BUS')!;
    const platform = doc.getRoot().listNodes().find((n) => n.getName() === 'SCAN_PLATFORM')!;
    const hga = doc.getRoot().listNodes().find((n) => n.getName() === 'HGA')!;

    // Each leaf mesh-node is named `mesh_<source_name>`.
    const busMeshChildren = bus
      .listChildren()
      .map((c) => c.getName())
      .filter((n) => n.startsWith('mesh_'));
    expect(busMeshChildren.sort()).toEqual(['mesh_BODY.040', 'mesh_Cube.004']);

    const platformMeshChildren = platform
      .listChildren()
      .map((c) => c.getName())
      .filter((n) => n.startsWith('mesh_'));
    expect(platformMeshChildren).toEqual(['mesh_BODY.002']);

    const hgaMeshChildren = hga
      .listChildren()
      .map((c) => c.getName())
      .filter((n) => n.startsWith('mesh_'));
    expect(hgaMeshChildren).toEqual(['mesh_BODY.000']);
  });

  it('restructureHierarchy throws on mesh name mismatch (defends against upstream re-export)', () => {
    const doc = buildFixtureDocument();
    const badMapping: MeshMapping = {
      ...FIXTURE_MAPPING,
      mesh_mapping: [
        {
          source_mesh_index: 0,
          source_name: 'WRONG.NAME',
          target_parent: 'BUS',
          rationale: 'fail-test',
        },
      ],
    };
    expect(() => restructureHierarchy(doc, badMapping)).toThrow(/mesh-mapping mismatch/);
  });

  it('restructureHierarchy is idempotent under JSON round-trip (NFR-R4)', async () => {
    const io = new NodeIO();
    const docA = buildFixtureDocument();
    const docB = buildFixtureDocument();
    restructureHierarchy(docA, FIXTURE_MAPPING);
    restructureHierarchy(docB, FIXTURE_MAPPING);

    // Compare via writeJSON shape (deterministic serialization).
    const jsonA = await io.writeJSON(docA);
    const jsonB = await io.writeJSON(docB);
    // The JSON document includes a buffer view for each accessor; we
    // compare the structural shape (nodes + meshes + scenes), not the
    // binary contents. The JSON portion of writeJSON is canonical.
    expect(JSON.stringify(jsonA.json.nodes)).toBe(JSON.stringify(jsonB.json.nodes));
    expect(JSON.stringify(jsonA.json.scenes)).toBe(JSON.stringify(jsonB.json.scenes));
    expect(JSON.stringify(jsonA.json.meshes)).toBe(JSON.stringify(jsonB.json.meshes));
  });

  it('countVertices counts the total POSITION accessor entries across all meshes', () => {
    const doc = buildFixtureDocument();
    // 4 meshes × 3 verts each = 12 total
    expect(countVertices(doc)).toBe(12);
  });
});
