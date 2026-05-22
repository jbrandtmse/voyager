import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  AttitudeService,
  decodeAttitudeChunk,
  slerpAtEt,
  synthesizeHgaPointingQuat,
  EARTH_NAIF_ID,
  type AttitudeKind,
} from './attitude-service';
import type { ChunkLoader, LoadedChunk } from './chunk-loader';
import type { Manifest, ManifestFile } from './manifest-loader';
import type { EphemerisService } from './ephemeris-service';
import { worldVec3 } from '../types/branded';
import {
  V1_NAIF_ID,
  V2_NAIF_ID,
  VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
  VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS,
} from './fk-constants';

// === Fixture builders =======================================================

const V1_BUS_CK_ID = -31000;
const V1_PLATFORM_CK_ID = -31100;

/**
 * Build a `LoadedChunk` with attitude (N, 5) body shape for unit tests.
 * `samples` is interleaved `[et_0, qw_0, qx_0, qy_0, qz_0, et_1, ...]`
 * — matches the on-disk VTRJ attitude body layout (Story 3.1 amendment).
 */
const makeAttitudeChunk = (params: {
  bodyId: number;
  etStart: number;
  etEnd: number;
  knots: ReadonlyArray<{
    et: number;
    qw: number;
    qx: number;
    qy: number;
    qz: number;
  }>;
}): LoadedChunk => {
  const n = params.knots.length;
  const samples = new Float64Array(n * 5);
  for (let i = 0; i < n; i++) {
    const k = params.knots[i];
    samples[i * 5 + 0] = k.et;
    samples[i * 5 + 1] = k.qw;
    samples[i * 5 + 2] = k.qx;
    samples[i * 5 + 3] = k.qy;
    samples[i * 5 + 4] = k.qz;
  }
  return {
    header: {
      magic: 'VTRJ',
      version: 1,
      bodyId: params.bodyId,
      etStart: params.etStart,
      etEnd: params.etEnd,
      sampleCount: n,
      cadenceSeconds: 5.0, // informational only for attitude (ADR-0004 amendment)
    },
    samples,
  };
};

const makeAttitudeFile = (
  url: string,
  kind: AttitudeKind,
  range: [number, number],
): ManifestFile => ({
  url,
  sha256: 'a'.repeat(64),
  sizeBytes: 100,
  timeRangeEt: range,
  cadenceSec: 5.0,
  kind,
  provenance: 'ck',
});

const makeManifest = (params: {
  v1Files?: ManifestFile[];
  v2Files?: ManifestFile[];
  includeEarth?: boolean;
}): Manifest => ({
  schemaVersion: 1,
  bakeCommit: 'test',
  bakeTimestamp: '2026-05-21T00:00:00Z',
  kernels: [],
  bodies: [
    {
      naifId: V1_NAIF_ID,
      name: 'Voyager 1',
      files: params.v1Files ?? [],
    },
    {
      naifId: V2_NAIF_ID,
      name: 'Voyager 2',
      files: params.v2Files ?? [],
    },
    ...(params.includeEarth !== false
      ? [
          {
            naifId: EARTH_NAIF_ID,
            name: 'Earth',
            files: [],
          },
        ]
      : []),
  ],
  chapters: [],
  validationTolerances: {
    maxPositionErrorKm: 20,
    rmsPositionErrorKm: 5,
  },
  models: [],
});

const makeFakeChunkLoader = (
  chunks: Map<string, LoadedChunk>,
): { loader: ChunkLoader; loadCalls: string[] } => {
  const loadCalls: string[] = [];
  const loader = {
    peek: (url: string) => chunks.get(url),
    load: vi.fn((file: ManifestFile) => {
      loadCalls.push(file.url);
      const c = chunks.get(file.url);
      if (c === undefined) return Promise.reject(new Error(`fixture missing: ${file.url}`));
      return Promise.resolve(c);
    }),
    subscribe: () => () => {},
    get loading() {
      return false;
    },
  } as unknown as ChunkLoader;
  return { loader, loadCalls };
};

/**
 * Fake EphemerisService that returns hand-supplied positions. Used by the
 * synthesized-path tests to control the geometry exactly.
 */
const makeFakeEphemeris = (
  positions: Map<number, [number, number, number]>,
): EphemerisService =>
  ({
    getPosition: (_et: number, bodyId: number) => {
      const p = positions.get(bodyId);
      if (p === undefined) return null;
      return worldVec3(p[0], p[1], p[2]);
    },
    getVelocity: () => null,
    getStateAt: () => null,
  }) as unknown as EphemerisService;

// === decodeAttitudeChunk ====================================================

describe('decodeAttitudeChunk', () => {
  it('reads ETs from column 0 and permutes SPICE→Three.js for quaternion columns', () => {
    // SPICE scalar-first quaternion [w, x, y, z] in columns 1-4.
    // Three.js scalar-last expects [x, y, z, w]. The decoder must permute.
    const chunk = makeAttitudeChunk({
      bodyId: V1_BUS_CK_ID,
      etStart: 100.0,
      etEnd: 110.0,
      knots: [
        { et: 100.0, qw: 0.7071, qx: 0.7071, qy: 0.0, qz: 0.0 }, // 90° about X (SPICE-frame)
        { et: 110.0, qw: 0.5, qx: 0.5, qy: 0.5, qz: 0.5 },
      ],
    });
    const decoded = decodeAttitudeChunk(chunk);
    expect(decoded.knotEts.length).toBe(2);
    expect(decoded.knotEts[0]).toBe(100.0);
    expect(decoded.knotEts[1]).toBe(110.0);

    // Knot 0: [qw=0.7071, qx=0.7071, qy=0, qz=0] (SPICE)
    //   → Three.js: Quaternion(x=0.7071, y=0, z=0, w=0.7071)
    expect(decoded.knotQuats[0].x).toBeCloseTo(0.7071, 4);
    expect(decoded.knotQuats[0].y).toBeCloseTo(0.0, 14);
    expect(decoded.knotQuats[0].z).toBeCloseTo(0.0, 14);
    expect(decoded.knotQuats[0].w).toBeCloseTo(0.7071, 4);

    // Knot 1: [0.5, 0.5, 0.5, 0.5] → Three.js (x=0.5, y=0.5, z=0.5, w=0.5)
    expect(decoded.knotQuats[1].x).toBe(0.5);
    expect(decoded.knotQuats[1].y).toBe(0.5);
    expect(decoded.knotQuats[1].z).toBe(0.5);
    expect(decoded.knotQuats[1].w).toBe(0.5);
  });

  it('throws when the body length does not match (N × 5)', () => {
    const chunk: LoadedChunk = {
      header: {
        magic: 'VTRJ',
        version: 1,
        bodyId: V1_BUS_CK_ID,
        etStart: 0,
        etEnd: 1,
        sampleCount: 2,
        cadenceSeconds: 1.0,
      },
      // Wrong length: 2 × 5 = 10 doubles expected; supplying 8.
      samples: new Float64Array([0, 1, 0, 0, 0, 1, 1, 0]),
    };
    expect(() => decodeAttitudeChunk(chunk)).toThrow(/expected 10 doubles/);
  });
});

// === slerpAtEt ==============================================================

describe('slerpAtEt', () => {
  it('returns the first knot when ET is at or before the first knot ET', () => {
    const chunk = makeAttitudeChunk({
      bodyId: V1_BUS_CK_ID,
      etStart: 100,
      etEnd: 110,
      knots: [
        { et: 100, qw: 1, qx: 0, qy: 0, qz: 0 }, // identity (SPICE [1,0,0,0])
        { et: 110, qw: 0, qx: 0, qy: 0, qz: 1 }, // 180° about Z (SPICE)
      ],
    });
    const decoded = decodeAttitudeChunk(chunk);

    const before = slerpAtEt(decoded, 50);
    expect(before.w).toBe(1);
    expect(before.x).toBe(0);
    expect(before.y).toBe(0);
    expect(before.z).toBe(0);

    const atFirst = slerpAtEt(decoded, 100);
    expect(atFirst.w).toBe(1);
  });

  it('returns the last knot when ET is at or after the last knot ET', () => {
    const chunk = makeAttitudeChunk({
      bodyId: V1_BUS_CK_ID,
      etStart: 100,
      etEnd: 110,
      knots: [
        { et: 100, qw: 1, qx: 0, qy: 0, qz: 0 },
        { et: 110, qw: 0, qx: 0, qy: 0, qz: 1 }, // Three.js: (0, 0, 1, 0)
      ],
    });
    const decoded = decodeAttitudeChunk(chunk);

    const atLast = slerpAtEt(decoded, 110);
    expect(atLast.x).toBe(0);
    expect(atLast.y).toBe(0);
    expect(atLast.z).toBe(1);
    expect(atLast.w).toBe(0);

    const after = slerpAtEt(decoded, 200);
    expect(after.z).toBe(1);
    expect(after.w).toBe(0);
  });

  it('SLERPs between two knots — midpoint equals THREE.Quaternion.slerpQuaternions(q0, q1, 0.5)', () => {
    // Build two non-identity SPICE quaternions and use their Three.js
    // permuted forms to compute the reference midpoint via Three.js itself.
    const qSpiceA = { qw: 1, qx: 0, qy: 0, qz: 0 }; // identity
    const qSpiceB = { qw: 0.5, qx: 0.5, qy: 0.5, qz: 0.5 }; // 120° about (1,1,1) (SPICE)

    const chunk = makeAttitudeChunk({
      bodyId: V1_BUS_CK_ID,
      etStart: 0,
      etEnd: 10,
      knots: [
        { et: 0, ...qSpiceA },
        { et: 10, ...qSpiceB },
      ],
    });
    const decoded = decodeAttitudeChunk(chunk);

    const mid = slerpAtEt(decoded, 5);

    // Reference: Three.js SLERP between the permuted quaternions at t=0.5.
    const tjA = new THREE.Quaternion(qSpiceA.qx, qSpiceA.qy, qSpiceA.qz, qSpiceA.qw);
    const tjB = new THREE.Quaternion(qSpiceB.qx, qSpiceB.qy, qSpiceB.qz, qSpiceB.qw);
    const refMid = new THREE.Quaternion().slerpQuaternions(tjA, tjB, 0.5);

    expect(mid.x).toBeCloseTo(refMid.x, 14);
    expect(mid.y).toBeCloseTo(refMid.y, 14);
    expect(mid.z).toBeCloseTo(refMid.z, 14);
    expect(mid.w).toBeCloseTo(refMid.w, 14);
  });

  it('handles duplicate-ET pair without throwing (defensive)', () => {
    const chunk = makeAttitudeChunk({
      bodyId: V1_BUS_CK_ID,
      etStart: 0,
      etEnd: 10,
      knots: [
        { et: 0, qw: 1, qx: 0, qy: 0, qz: 0 },
        { et: 5, qw: 1, qx: 0, qy: 0, qz: 0 },
        { et: 5, qw: 0.7071, qx: 0.7071, qy: 0, qz: 0 }, // pathological duplicate
        { et: 10, qw: 0.5, qx: 0.5, qy: 0.5, qz: 0.5 },
      ],
    });
    const decoded = decodeAttitudeChunk(chunk);
    expect(() => slerpAtEt(decoded, 5)).not.toThrow();
  });

  it('SLERP result is unit-norm', () => {
    const chunk = makeAttitudeChunk({
      bodyId: V1_BUS_CK_ID,
      etStart: 0,
      etEnd: 10,
      knots: [
        { et: 0, qw: 1, qx: 0, qy: 0, qz: 0 },
        { et: 10, qw: 0.5, qx: 0.5, qy: 0.5, qz: 0.5 },
      ],
    });
    const decoded = decodeAttitudeChunk(chunk);
    for (const et of [0, 1.234, 5, 7.89, 10]) {
      const q = slerpAtEt(decoded, et);
      const n = Math.hypot(q.x, q.y, q.z, q.w);
      expect(n).toBeCloseTo(1.0, 12);
    }
  });
});

// === synthesizeHgaPointingQuat ==============================================

describe('synthesizeHgaPointingQuat', () => {
  // The HGA boresight in bus frame is bus -Z. After rotation R, the HGA
  // boresight in world frame must equal the (sc → Earth) unit vector.
  // Test this primary-alignment invariant for several geometries.

  const applyQuatToVec = (
    q: { x: number; y: number; z: number; w: number },
    v: readonly [number, number, number],
  ): THREE.Vector3 =>
    new THREE.Vector3(v[0], v[1], v[2]).applyQuaternion(
      new THREE.Quaternion(q.x, q.y, q.z, q.w),
    );

  it('aligns the HGA boresight (bus -Z) with the spacecraft→Earth direction', () => {
    // Spacecraft at (10, 0, 0) AU-ish; Earth at origin.
    const sc = worldVec3(10e6, 0, 0);
    const earth = worldVec3(0, 0, 0);
    const q = synthesizeHgaPointingQuat(
      sc,
      earth,
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
      VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS,
    );

    // After applying q, the HGA boresight in bus frame should map to the
    // spacecraft→Earth direction in world frame: (Earth - SC) / |Earth - SC|
    //   = (-10e6, 0, 0) / 10e6 = (-1, 0, 0)
    const boresightInWorld = applyQuatToVec(
      q,
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
    );
    expect(boresightInWorld.x).toBeCloseTo(-1, 12);
    expect(boresightInWorld.y).toBeCloseTo(0, 12);
    expect(boresightInWorld.z).toBeCloseTo(0, 12);
  });

  it('aligns boresight for an off-ecliptic geometry', () => {
    // Spacecraft above the ecliptic; Earth at origin.
    const sc = worldVec3(0, 5e6, 3e6);
    const earth = worldVec3(0, 0, 0);
    const q = synthesizeHgaPointingQuat(
      sc,
      earth,
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
      VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS,
    );

    const dist = Math.hypot(0, 5e6, 3e6);
    const expected = new THREE.Vector3(0, -5e6 / dist, -3e6 / dist);

    const boresightInWorld = applyQuatToVec(
      q,
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
    );
    expect(boresightInWorld.x).toBeCloseTo(expected.x, 12);
    expect(boresightInWorld.y).toBeCloseTo(expected.y, 12);
    expect(boresightInWorld.z).toBeCloseTo(expected.z, 12);
  });

  it('result is unit-norm', () => {
    const sc = worldVec3(1e6, 2e6, -3e6);
    const earth = worldVec3(1.5e8, 0, 0);
    const q = synthesizeHgaPointingQuat(
      sc,
      earth,
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
      VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS,
    );
    const norm = Math.hypot(q.x, q.y, q.z, q.w);
    expect(norm).toBeCloseTo(1.0, 12);
  });

  it('returns identity when spacecraft is colocated with Earth (degenerate)', () => {
    const sc = worldVec3(1e6, 0, 0);
    const earth = worldVec3(1e6, 0, 0);
    const q = synthesizeHgaPointingQuat(
      sc,
      earth,
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
      VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS,
    );
    expect(q.x).toBe(0);
    expect(q.y).toBe(0);
    expect(q.z).toBe(0);
    expect(q.w).toBe(1);
  });

  it('falls back to world +X when scToEarth is parallel to ecliptic-up', () => {
    // Spacecraft directly below Earth on the ecliptic-up axis. scToEarth =
    // +Z; the up projection onto the plane perpendicular to +Z degenerates.
    const sc = worldVec3(0, 0, -5e6);
    const earth = worldVec3(0, 0, 0);
    const q = synthesizeHgaPointingQuat(
      sc,
      earth,
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
      VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS,
    );
    // Still expect a valid unit quaternion and primary alignment.
    const norm = Math.hypot(q.x, q.y, q.z, q.w);
    expect(norm).toBeCloseTo(1.0, 12);

    const boresightInWorld = applyQuatToVec(
      q,
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
    );
    expect(boresightInWorld.x).toBeCloseTo(0, 12);
    expect(boresightInWorld.y).toBeCloseTo(0, 12);
    expect(boresightInWorld.z).toBeCloseTo(1, 12);
  });
});

// === findAttitudeFile / index =============================================

describe('AttitudeService.findAttitudeFile', () => {
  const fileA = makeAttitudeFile(
    'data/v1_bus_attitude.v1-jupiter.bin.br',
    'bus_attitude',
    [100, 200],
  );
  const fileB = makeAttitudeFile(
    'data/v1_bus_attitude.v1-saturn.bin.br',
    'bus_attitude',
    [300, 400],
  );
  const filePlatform = makeAttitudeFile(
    'data/v1_platform_attitude.v1-jupiter.bin.br',
    'platform_attitude',
    [100, 200],
  );
  const manifest = makeManifest({
    v1Files: [fileA, fileB, filePlatform],
  });
  const { loader } = makeFakeChunkLoader(new Map());
  const ephemeris = makeFakeEphemeris(new Map());

  it('returns the file covering a query ET (V1 bus)', () => {
    const svc = new AttitudeService(manifest, loader, ephemeris);
    expect(svc.findAttitudeFile(150, V1_NAIF_ID, 'bus_attitude')).toBe(fileA);
    expect(svc.findAttitudeFile(350, V1_NAIF_ID, 'bus_attitude')).toBe(fileB);
  });

  it('returns the platform file for platform_attitude queries', () => {
    const svc = new AttitudeService(manifest, loader, ephemeris);
    expect(svc.findAttitudeFile(150, V1_NAIF_ID, 'platform_attitude')).toBe(
      filePlatform,
    );
  });

  it('returns null when ET is outside all file windows', () => {
    const svc = new AttitudeService(manifest, loader, ephemeris);
    expect(svc.findAttitudeFile(50, V1_NAIF_ID, 'bus_attitude')).toBe(null);
    expect(svc.findAttitudeFile(250, V1_NAIF_ID, 'bus_attitude')).toBe(null);
    expect(svc.findAttitudeFile(500, V1_NAIF_ID, 'bus_attitude')).toBe(null);
  });

  it('returns null for an unknown spacecraft NAIF ID', () => {
    const svc = new AttitudeService(manifest, loader, ephemeris);
    expect(svc.findAttitudeFile(150, -99, 'bus_attitude')).toBe(null);
  });

  it('returns null when V2 queried at a V1-only-CK ET', () => {
    const svc = new AttitudeService(manifest, loader, ephemeris);
    expect(svc.findAttitudeFile(150, V2_NAIF_ID, 'bus_attitude')).toBe(null);
  });

  it('boundary instant inside file range returns the file', () => {
    const svc = new AttitudeService(manifest, loader, ephemeris);
    expect(svc.findAttitudeFile(100, V1_NAIF_ID, 'bus_attitude')).toBe(fileA);
    expect(svc.findAttitudeFile(200, V1_NAIF_ID, 'bus_attitude')).toBe(fileA);
  });
});

// === getBusProvenance / getPlatformProvenance ==============================

describe('AttitudeService provenance (AC5)', () => {
  it('boundary discipline: 1ns inside CK window is `ck`, 1ns outside is `synthesized`', () => {
    const fileCk = makeAttitudeFile(
      'data/v1_bus_attitude.v1-jupiter.bin.br',
      'bus_attitude',
      [100, 200],
    );
    const manifest = makeManifest({ v1Files: [fileCk] });
    const { loader } = makeFakeChunkLoader(new Map());
    const ephemeris = makeFakeEphemeris(new Map());
    const svc = new AttitudeService(manifest, loader, ephemeris);

    // One nanosecond outside (ETs are float64 seconds; 1e-9 ≈ 1 ns)
    expect(svc.getBusProvenance(V1_NAIF_ID, 100 - 1e-9)).toBe('synthesized');
    // Exactly at the boundary instant
    expect(svc.getBusProvenance(V1_NAIF_ID, 100)).toBe('ck');
    // Just inside
    expect(svc.getBusProvenance(V1_NAIF_ID, 100 + 1e-9)).toBe('ck');
    // Just inside the end
    expect(svc.getBusProvenance(V1_NAIF_ID, 200)).toBe('ck');
    // Just outside the end
    expect(svc.getBusProvenance(V1_NAIF_ID, 200 + 1e-9)).toBe('synthesized');
  });

  it('bus and platform provenance may differ (V1 PBD has bus CK but not platform)', () => {
    const fileBusOnly = makeAttitudeFile(
      'data/v1_bus_attitude.pale-blue-dot.bin.br',
      'bus_attitude',
      [10000, 20000],
    );
    const manifest = makeManifest({ v1Files: [fileBusOnly] });
    const { loader } = makeFakeChunkLoader(new Map());
    const ephemeris = makeFakeEphemeris(
      new Map([
        [V1_NAIF_ID, [1e6, 0, 0] as [number, number, number]],
        [EARTH_NAIF_ID, [0, 0, 0] as [number, number, number]],
      ]),
    );
    const svc = new AttitudeService(manifest, loader, ephemeris);

    expect(svc.getBusProvenance(V1_NAIF_ID, 15000)).toBe('ck');
    expect(svc.getPlatformProvenance(V1_NAIF_ID, 15000)).toBe('synthesized');
  });

  it('cross-spacecraft: V2 queried at V1-only CK ET is `synthesized`', () => {
    const fileV1 = makeAttitudeFile(
      'data/v1_bus_attitude.v1-jupiter.bin.br',
      'bus_attitude',
      [100, 200],
    );
    const manifest = makeManifest({ v1Files: [fileV1] });
    const { loader } = makeFakeChunkLoader(new Map());
    const ephemeris = makeFakeEphemeris(new Map());
    const svc = new AttitudeService(manifest, loader, ephemeris);

    expect(svc.getBusProvenance(V1_NAIF_ID, 150)).toBe('ck');
    expect(svc.getBusProvenance(V2_NAIF_ID, 150)).toBe('synthesized');
  });
});

// === getBusQuat — CK path ==================================================

describe('AttitudeService.getBusQuat — CK path', () => {
  it('returns SLERP-from-chunk when the CK file covers ET and chunk is cached', () => {
    const file = makeAttitudeFile(
      'data/v1_bus_attitude.v1-jupiter.bin.br',
      'bus_attitude',
      [100, 200],
    );
    const manifest = makeManifest({ v1Files: [file] });
    const chunk = makeAttitudeChunk({
      bodyId: V1_BUS_CK_ID,
      etStart: 100,
      etEnd: 200,
      knots: [
        { et: 100, qw: 1, qx: 0, qy: 0, qz: 0 },
        { et: 200, qw: 0, qx: 1, qy: 0, qz: 0 }, // 180° about X (SPICE) → Three.js (1, 0, 0, 0)
      ],
    });
    const chunks = new Map([[file.url, chunk]]);
    const { loader } = makeFakeChunkLoader(chunks);
    const ephemeris = makeFakeEphemeris(new Map());
    const svc = new AttitudeService(manifest, loader, ephemeris);

    const q = svc.getBusQuat(V1_NAIF_ID, 150);
    expect(q).not.toBeNull();
    // Midpoint SLERP between identity and (Three.js) (1, 0, 0, 0)
    const ref = new THREE.Quaternion().slerpQuaternions(
      new THREE.Quaternion(0, 0, 0, 1),
      new THREE.Quaternion(1, 0, 0, 0),
      0.5,
    );
    expect(q!.x).toBeCloseTo(ref.x, 12);
    expect(q!.y).toBeCloseTo(ref.y, 12);
    expect(q!.z).toBeCloseTo(ref.z, 12);
    expect(q!.w).toBeCloseTo(ref.w, 12);
  });

  it('returns null and kicks off async load when chunk is not yet cached', () => {
    const file = makeAttitudeFile(
      'data/v1_bus_attitude.v1-jupiter.bin.br',
      'bus_attitude',
      [100, 200],
    );
    const manifest = makeManifest({ v1Files: [file] });
    const chunks = new Map<string, LoadedChunk>(); // empty — peek returns undefined
    const { loader, loadCalls } = makeFakeChunkLoader(chunks);
    const ephemeris = makeFakeEphemeris(new Map());
    const svc = new AttitudeService(manifest, loader, ephemeris);

    const q = svc.getBusQuat(V1_NAIF_ID, 150);
    expect(q).toBeNull();
    expect(loadCalls).toEqual([file.url]);
  });

  it('does NOT fall through to synthesized path on cache miss (AC5)', () => {
    // Even though the synthesized path COULD produce a value (Earth + SC
    // positions are available), the boundary-discipline contract says
    // provenance reflects the manifest, not the loader state. A cache miss
    // returns null (hold-previous), not a regime substitution.
    const file = makeAttitudeFile(
      'data/v1_bus_attitude.v1-jupiter.bin.br',
      'bus_attitude',
      [100, 200],
    );
    const manifest = makeManifest({ v1Files: [file] });
    const chunks = new Map<string, LoadedChunk>();
    const { loader } = makeFakeChunkLoader(chunks);
    const ephemeris = makeFakeEphemeris(
      new Map([
        [V1_NAIF_ID, [1e6, 0, 0] as [number, number, number]],
        [EARTH_NAIF_ID, [0, 0, 0] as [number, number, number]],
      ]),
    );
    const svc = new AttitudeService(manifest, loader, ephemeris);

    const q = svc.getBusQuat(V1_NAIF_ID, 150);
    // null, not the synthesized quaternion. The provenance still says 'ck'.
    expect(q).toBeNull();
    expect(svc.getBusProvenance(V1_NAIF_ID, 150)).toBe('ck');
  });
});

// === getBusQuat — synthesized path ========================================

describe('AttitudeService.getBusQuat — synthesized path', () => {
  it('synthesizes when no CK file covers ET', () => {
    const manifest = makeManifest({ v1Files: [] });
    const { loader } = makeFakeChunkLoader(new Map());
    const ephemeris = makeFakeEphemeris(
      new Map([
        [V1_NAIF_ID, [10e6, 0, 0] as [number, number, number]],
        [EARTH_NAIF_ID, [0, 0, 0] as [number, number, number]],
      ]),
    );
    const svc = new AttitudeService(manifest, loader, ephemeris);

    const q = svc.getBusQuat(V1_NAIF_ID, 999999);
    expect(q).not.toBeNull();
    // Unit norm
    const n = Math.hypot(q!.x, q!.y, q!.z, q!.w);
    expect(n).toBeCloseTo(1.0, 12);

    // Boresight (bus -Z) should map to sc→Earth direction = (-1, 0, 0)
    const tj = new THREE.Quaternion(q!.x, q!.y, q!.z, q!.w);
    const boresight = new THREE.Vector3(
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[0],
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[1],
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[2],
    ).applyQuaternion(tj);
    expect(boresight.x).toBeCloseTo(-1, 12);
    expect(boresight.y).toBeCloseTo(0, 12);
    expect(boresight.z).toBeCloseTo(0, 12);

    expect(svc.getBusProvenance(V1_NAIF_ID, 999999)).toBe('synthesized');
  });

  it('returns null when ephemeris not yet available', () => {
    const manifest = makeManifest({ v1Files: [] });
    const { loader } = makeFakeChunkLoader(new Map());
    // EphemerisService returns null (no positions in the map)
    const ephemeris = makeFakeEphemeris(new Map());
    const svc = new AttitudeService(manifest, loader, ephemeris);

    const q = svc.getBusQuat(V1_NAIF_ID, 999999);
    expect(q).toBeNull();
  });
});

// === getPlatformQuat ======================================================

describe('AttitudeService.getPlatformQuat', () => {
  it('returns synthesized platform = synthesized bus · platform-rest (identity) during cruise', () => {
    const manifest = makeManifest({ v1Files: [] });
    const { loader } = makeFakeChunkLoader(new Map());
    const ephemeris = makeFakeEphemeris(
      new Map([
        [V1_NAIF_ID, [10e6, 0, 0] as [number, number, number]],
        [EARTH_NAIF_ID, [0, 0, 0] as [number, number, number]],
      ]),
    );
    const svc = new AttitudeService(manifest, loader, ephemeris);
    const busQ = svc.getBusQuat(V1_NAIF_ID, 999);
    const platformQ = svc.getPlatformQuat(V1_NAIF_ID, 999);
    expect(busQ).not.toBeNull();
    expect(platformQ).not.toBeNull();
    // Identity composition = bus quaternion
    expect(platformQ!.x).toBeCloseTo(busQ!.x, 12);
    expect(platformQ!.y).toBeCloseTo(busQ!.y, 12);
    expect(platformQ!.z).toBeCloseTo(busQ!.z, 12);
    expect(platformQ!.w).toBeCloseTo(busQ!.w, 12);
  });

  it('SLERPs platform_attitude file when present', () => {
    const file = makeAttitudeFile(
      'data/v1_platform_attitude.v1-jupiter.bin.br',
      'platform_attitude',
      [100, 200],
    );
    const manifest = makeManifest({ v1Files: [file] });
    const SQRT_HALF = Math.SQRT1_2; // exact unit-norm √(1/2)
    const chunk = makeAttitudeChunk({
      bodyId: V1_PLATFORM_CK_ID,
      etStart: 100,
      etEnd: 200,
      knots: [
        { et: 100, qw: 1, qx: 0, qy: 0, qz: 0 },
        { et: 200, qw: SQRT_HALF, qx: 0, qy: SQRT_HALF, qz: 0 },
      ],
    });
    const chunks = new Map([[file.url, chunk]]);
    const { loader } = makeFakeChunkLoader(chunks);
    const ephemeris = makeFakeEphemeris(new Map());
    const svc = new AttitudeService(manifest, loader, ephemeris);

    const q = svc.getPlatformQuat(V1_NAIF_ID, 150);
    expect(q).not.toBeNull();
    const n = Math.hypot(q!.x, q!.y, q!.z, q!.w);
    expect(n).toBeCloseTo(1.0, 12);
  });
});

// === Cross-spacecraft + integration ========================================

describe('AttitudeService — multi-spacecraft + multi-file index', () => {
  it('builds independent indices per (spacecraft, kind) tuple', () => {
    const v1Bus = makeAttitudeFile(
      'data/v1_bus_attitude.v1-jupiter.bin.br',
      'bus_attitude',
      [100, 200],
    );
    const v1Platform = makeAttitudeFile(
      'data/v1_platform_attitude.v1-jupiter.bin.br',
      'platform_attitude',
      [100, 200],
    );
    const v2Bus = makeAttitudeFile(
      'data/v2_bus_attitude.v2-jupiter.bin.br',
      'bus_attitude',
      [1000, 2000],
    );
    const manifest = makeManifest({
      v1Files: [v1Bus, v1Platform],
      v2Files: [v2Bus],
    });
    const { loader } = makeFakeChunkLoader(new Map());
    const ephemeris = makeFakeEphemeris(new Map());
    const svc = new AttitudeService(manifest, loader, ephemeris);

    expect(svc.findAttitudeFile(150, V1_NAIF_ID, 'bus_attitude')).toBe(v1Bus);
    expect(svc.findAttitudeFile(150, V1_NAIF_ID, 'platform_attitude')).toBe(v1Platform);
    expect(svc.findAttitudeFile(150, V2_NAIF_ID, 'bus_attitude')).toBeNull();
    expect(svc.findAttitudeFile(1500, V2_NAIF_ID, 'bus_attitude')).toBe(v2Bus);
  });

  it('caches decoded chunks once per URL (decode-once contract)', () => {
    const file = makeAttitudeFile(
      'data/v1_bus_attitude.v1-jupiter.bin.br',
      'bus_attitude',
      [100, 200],
    );
    const SQRT_HALF = Math.SQRT1_2;
    const chunk = makeAttitudeChunk({
      bodyId: V1_BUS_CK_ID,
      etStart: 100,
      etEnd: 200,
      knots: [
        { et: 100, qw: 1, qx: 0, qy: 0, qz: 0 },
        { et: 150, qw: SQRT_HALF, qx: SQRT_HALF, qy: 0, qz: 0 },
        { et: 200, qw: 0, qx: 1, qy: 0, qz: 0 },
      ],
    });
    const manifest = makeManifest({ v1Files: [file] });
    const chunks = new Map([[file.url, chunk]]);
    const { loader } = makeFakeChunkLoader(chunks);
    const ephemeris = makeFakeEphemeris(new Map());
    const svc = new AttitudeService(manifest, loader, ephemeris);

    // Two queries on the same file URL — both should succeed and produce
    // consistent unit-length quaternions. The decode-cache hit is internal;
    // we exercise the path by calling repeatedly.
    const q1 = svc.getBusQuat(V1_NAIF_ID, 120);
    const q2 = svc.getBusQuat(V1_NAIF_ID, 180);
    expect(q1).not.toBeNull();
    expect(q2).not.toBeNull();
    expect(Math.hypot(q1!.x, q1!.y, q1!.z, q1!.w)).toBeCloseTo(1.0, 12);
    expect(Math.hypot(q2!.x, q2!.y, q2!.z, q2!.w)).toBeCloseTo(1.0, 12);
  });
});
