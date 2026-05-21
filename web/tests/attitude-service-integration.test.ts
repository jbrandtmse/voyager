// @vitest-environment happy-dom
/**
 * Story 3.2 AC7 — Integration AC: AttitudeService ↔ chunk-loader ↔
 * EphemerisService wire-up.
 *
 * The full boot-stack path is exercised by:
 *   1. Constructing a fixture manifest with V1 bus_attitude + platform_attitude
 *      entries pointing at byte-stable VTRJ fixtures hand-built below.
 *   2. Constructing a ChunkLoader with an injected `fetchImpl` that returns the
 *      fixture bytes (verifies the brotli-decompressed payload contract from
 *      Story 1.16) AND a stub `sha256Hex` (no on-disk hash to verify against).
 *   3. Constructing an EphemerisService that returns hand-supplied V1 + Earth
 *      positions via stub injection (the synthesized path queries through it).
 *   4. Constructing AttitudeService against the SAME chunk-loader instance
 *      (verifying AC1's single-loader contract).
 *   5. Asserting:
 *      - CK path: `getBusQuat(V1, ET inside file window)` returns provenance
 *        'ck' and a unit quaternion within tolerance of the SLERP-from-knots
 *        reference computation.
 *      - Synthesized path: `getBusQuat(V1, ET outside any file window)`
 *        returns provenance 'synthesized', a unit quaternion, and the HGA
 *        boresight maps to the spacecraft→Earth direction.
 *      - Cross-spacecraft: `getBusQuat(V2, V1-only ET)` returns 'synthesized'.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ChunkLoader } from '../src/services/chunk-loader';
import { EphemerisService } from '../src/services/ephemeris-service';
import { AttitudeService, EARTH_NAIF_ID } from '../src/services/attitude-service';
import { worldVec3 } from '../src/types/branded';
import type { Manifest, ManifestFile } from '../src/services/manifest-loader';
import type { WorldVec3 } from '../src/types/branded';
import {
  V1_NAIF_ID,
  V2_NAIF_ID,
  VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
} from '../src/services/fk-constants';

const V1_BUS_CK_ID = -31000;
const V1_PLATFORM_CK_ID = -31100;

// === Fixture VTRJ builder ===================================================
//
// Mirrors `bake/src/vtrj_writer.py` for the attitude `kind`. 40-byte LE header
// + (N, 5) Float64 body of [et, qw, qx, qy, qz] per sample.

const buildAttitudeVtrj = (params: {
  bodyId: number;
  etStart: number;
  etEnd: number;
  knots: ReadonlyArray<{ et: number; qw: number; qx: number; qy: number; qz: number }>;
}): ArrayBuffer => {
  const n = params.knots.length;
  const bodyBytes = n * 40; // 5 × f64 per sample
  const total = 40 + bodyBytes;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  // magic "VTRJ"
  view.setUint8(0, 'V'.charCodeAt(0));
  view.setUint8(1, 'T'.charCodeAt(0));
  view.setUint8(2, 'R'.charCodeAt(0));
  view.setUint8(3, 'J'.charCodeAt(0));
  view.setUint16(4, 1, true); // version
  view.setInt32(6, params.bodyId, true);
  view.setFloat64(10, params.etStart, true);
  view.setFloat64(18, params.etEnd, true);
  view.setUint32(26, n, true);
  view.setFloat64(30, 5.0, true); // cadence (informational only for attitude)
  view.setUint16(38, 0, true);
  // Body
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

// Hand-supplied fixture ETs (arbitrary inside a "V1 Jupiter encounter"
// window; the precise values don't matter for the integration test).
const FIXTURE_ET_START = -657_000_000.0;
const FIXTURE_ET_END = -656_999_900.0;
const FIXTURE_ET_INSIDE = -656_999_950.0; // midpoint
const FIXTURE_ET_CRUISE = 0.0; // J2000 epoch — well outside the fixture window
const FIXTURE_KNOTS_BUS = [
  // SPICE scalar-first [w, x, y, z]
  { et: FIXTURE_ET_START, qw: 1.0, qx: 0.0, qy: 0.0, qz: 0.0 }, // identity
  { et: FIXTURE_ET_END, qw: 0.5, qx: 0.5, qy: 0.5, qz: 0.5 }, // 120° about (1,1,1)
];
const FIXTURE_KNOTS_PLATFORM = [
  { et: FIXTURE_ET_START, qw: 1.0, qx: 0.0, qy: 0.0, qz: 0.0 },
  { et: FIXTURE_ET_END, qw: 0.7071067811865476, qx: 0.7071067811865476, qy: 0, qz: 0 },
];

const BUS_URL = 'data/test-v1-bus-attitude.bin.br';
const PLATFORM_URL = 'data/test-v1-platform-attitude.bin.br';

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
  };
};

// Stub fetch that returns the right fixture for each known URL.
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
    const url = typeof input === 'string' ? input : input.toString();
    const buf = map.get(url);
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

// Stub EphemerisService: V1 at (10e6, 0, 0) km, V2 at (0, 10e6, 0) km, Earth at origin.
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

  getStateAt(): null {
    return null;
  }
}

// =============================================================================

describe('AC7 Integration — AttitudeService ↔ ChunkLoader ↔ EphemerisService', () => {
  const buildStack = async (): Promise<{
    chunkLoader: ChunkLoader;
    attitudeService: AttitudeService;
  }> => {
    const manifest = buildFixtureManifest();
    const chunkLoader = new ChunkLoader({
      fetchImpl: makeStubFetch(),
      // The fixture manifest's decompressedSha256 is undefined, so the
      // chunk-loader skips the integrity check (Story 1.16 contract).
      sha256Hex: async () => 'unused',
    });
    const ephemeris = new StubEphemerisService() as unknown as EphemerisService;
    const attitudeService = new AttitudeService(manifest, chunkLoader, ephemeris);

    // Prefetch the bus + platform chunks — mirrors `main.ts`'s spacecraft
    // chunk prefetch contract for trajectory.
    const busFile = manifest.bodies[0].files[0];
    const platformFile = manifest.bodies[0].files[1];
    await chunkLoader.load(busFile);
    await chunkLoader.load(platformFile);

    return { chunkLoader, attitudeService };
  };

  it('CK path: bus quaternion + provenance at an ET inside the fixture window', async () => {
    const { attitudeService } = await buildStack();
    const q = attitudeService.getBusQuat(V1_NAIF_ID, FIXTURE_ET_INSIDE);
    expect(q).not.toBeNull();

    // Unit-norm
    const n = Math.hypot(q!.x, q!.y, q!.z, q!.w);
    expect(n).toBeCloseTo(1.0, 12);

    // Reference: midpoint SLERP between identity and (Three.js) (0.5, 0.5, 0.5, 0.5)
    // SPICE knots: knot 0 = [1,0,0,0] (identity); knot 1 = [0.5, 0.5, 0.5, 0.5]
    // Three.js: knot 0 = (0, 0, 0, 1); knot 1 = (0.5, 0.5, 0.5, 0.5)
    const tjA = new THREE.Quaternion(0, 0, 0, 1);
    const tjB = new THREE.Quaternion(0.5, 0.5, 0.5, 0.5);
    const ref = new THREE.Quaternion().slerpQuaternions(tjA, tjB, 0.5);
    expect(q!.x).toBeCloseTo(ref.x, 12);
    expect(q!.y).toBeCloseTo(ref.y, 12);
    expect(q!.z).toBeCloseTo(ref.z, 12);
    expect(q!.w).toBeCloseTo(ref.w, 12);

    expect(attitudeService.getBusProvenance(V1_NAIF_ID, FIXTURE_ET_INSIDE)).toBe('ck');
  });

  it('Synthesized path: cruise ET produces unit quaternion and HGA-Earth alignment', async () => {
    const { attitudeService } = await buildStack();
    const q = attitudeService.getBusQuat(V1_NAIF_ID, FIXTURE_ET_CRUISE);
    expect(q).not.toBeNull();

    const norm = Math.hypot(q!.x, q!.y, q!.z, q!.w);
    expect(norm).toBeCloseTo(1.0, 12);

    // Boresight (bus -Z) applied by q must equal the V1→Earth unit vector.
    // V1 at (10e6, 0, 0); Earth at (0, 0, 0). Direction = (-1, 0, 0).
    const tj = new THREE.Quaternion(q!.x, q!.y, q!.z, q!.w);
    const boresight = new THREE.Vector3(
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[0],
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[1],
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[2],
    ).applyQuaternion(tj);
    expect(boresight.x).toBeCloseTo(-1, 12);
    expect(boresight.y).toBeCloseTo(0, 12);
    expect(boresight.z).toBeCloseTo(0, 12);

    expect(attitudeService.getBusProvenance(V1_NAIF_ID, FIXTURE_ET_CRUISE)).toBe(
      'synthesized',
    );
  });

  it('Cross-spacecraft: V2 query at V1-only-CK ET is `synthesized`', async () => {
    const { attitudeService } = await buildStack();
    expect(
      attitudeService.getBusProvenance(V2_NAIF_ID, FIXTURE_ET_INSIDE),
    ).toBe('synthesized');

    // The synthesized result for V2 must also be valid (V2 at (0, 10e6, 0);
    // Earth at origin; aim = (0, -1, 0))
    const q = attitudeService.getBusQuat(V2_NAIF_ID, FIXTURE_ET_INSIDE);
    expect(q).not.toBeNull();
    const tj = new THREE.Quaternion(q!.x, q!.y, q!.z, q!.w);
    const boresight = new THREE.Vector3(
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[0],
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[1],
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[2],
    ).applyQuaternion(tj);
    expect(boresight.x).toBeCloseTo(0, 12);
    expect(boresight.y).toBeCloseTo(-1, 12);
    expect(boresight.z).toBeCloseTo(0, 12);
  });

  it('Platform attitude inside the fixture window uses CK SLERP', async () => {
    const { attitudeService } = await buildStack();
    const q = attitudeService.getPlatformQuat(V1_NAIF_ID, FIXTURE_ET_INSIDE);
    expect(q).not.toBeNull();
    const n = Math.hypot(q!.x, q!.y, q!.z, q!.w);
    expect(n).toBeCloseTo(1.0, 12);
    expect(
      attitudeService.getPlatformProvenance(V1_NAIF_ID, FIXTURE_ET_INSIDE),
    ).toBe('ck');
  });

  it('AC1 — single ChunkLoader contract: both bus and platform queries use the same loader cache', async () => {
    const { chunkLoader, attitudeService } = await buildStack();
    // After buildStack's prefetch, both file URLs should be in the chunk cache.
    expect(chunkLoader.__cacheSize()).toBe(2);
    expect(chunkLoader.__cacheKeys()).toContain(BUS_URL);
    expect(chunkLoader.__cacheKeys()).toContain(PLATFORM_URL);

    // Querying bus + platform should NOT trigger additional loads — both hit
    // the existing chunk cache (peek path).
    const sizeBefore = chunkLoader.__cacheSize();
    attitudeService.getBusQuat(V1_NAIF_ID, FIXTURE_ET_INSIDE);
    attitudeService.getPlatformQuat(V1_NAIF_ID, FIXTURE_ET_INSIDE);
    expect(chunkLoader.__cacheSize()).toBe(sizeBefore);
  });

  it('Provenance is manifest-driven, not loader-driven (AC5 invariant)', async () => {
    const { attitudeService } = await buildStack();
    // Even though both chunks are loaded, the provenance for an ET outside
    // the file's [start, end] range remains 'synthesized' — independent of
    // chunk presence. EPS must exceed float64 ULP at the fixture-ET
    // magnitude (~6.57e8); ULP ≈ 1.5e-7 s. Using 1 second as a clearly-
    // outside step the boundary instant still reads `ck`.
    const EPS_S = 1.0;
    expect(
      attitudeService.getBusProvenance(V1_NAIF_ID, FIXTURE_ET_START - EPS_S),
    ).toBe('synthesized');
    expect(attitudeService.getBusProvenance(V1_NAIF_ID, FIXTURE_ET_START)).toBe(
      'ck',
    );
    expect(
      attitudeService.getBusProvenance(V1_NAIF_ID, FIXTURE_ET_END + EPS_S),
    ).toBe('synthesized');
  });
});
