// Story 1.6 defense-in-depth tests.
//
// Tripwires for contractual invariants of the manifest / chunk-loader /
// ephemeris-service pipeline. Each test targets a class of regression that
// the co-located unit tests don't exercise directly — silent version bumps,
// loose URL matching, LRU recency-tracking errors, fetch coalescing, etc.

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
  ManifestLoader,
  ManifestValidationError,
  __resetCacheForTests,
  type Manifest,
  type ManifestFile,
} from '../src/services/manifest-loader';
import {
  ChunkLoader,
  DEFAULT_LRU_CAPACITY,
  type LoadedChunk,
} from '../src/services/chunk-loader';
import { EphemerisService } from '../src/services/ephemeris-service';
import { isEphemerisPerfMode } from '../src/dev/ephemeris-perf';

// === Shared fixture builders =========================================

const REPO_ROOT = resolve(__dirname, '..', '..');
const WEB_SRC = resolve(__dirname, '..', 'src');
const RUNTIME_MANIFEST_PATH = resolve(__dirname, '..', 'public', 'data', 'manifest.json');
const L2_FIXTURES_PATH = resolve(REPO_ROOT, 'bake', 'out', 'l2-reference-fixtures.json');

const buildVtrj = (params: {
  bodyId: number;
  etStart: number;
  etEnd: number;
  sampleCount: number;
  cadenceSeconds: number;
  samples?: Float64Array;
  magic?: string;
  version?: number;
}): ArrayBuffer => {
  const {
    bodyId,
    etStart,
    etEnd,
    sampleCount,
    cadenceSeconds,
    magic = 'VTRJ',
    version = 1,
  } = params;
  const bodyBytes = sampleCount * 48;
  const total = 40 + bodyBytes;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  for (let i = 0; i < 4; i++) view.setUint8(i, magic.charCodeAt(i));
  view.setUint16(4, version, true);
  view.setInt32(6, bodyId, true);
  view.setFloat64(10, etStart, true);
  view.setFloat64(18, etEnd, true);
  view.setUint32(26, sampleCount, true);
  view.setFloat64(30, cadenceSeconds, true);
  view.setUint16(38, 0, true);
  if (params.samples) {
    const f64 = new Float64Array(buf, 40, sampleCount * 6);
    f64.set(params.samples);
  }
  return buf;
};

const passthrough = (input: ArrayBuffer): ArrayBuffer => input;

const sha256Hex = (input: ArrayBuffer): string => {
  const h = createHash('sha256');
  h.update(Buffer.from(input));
  return h.digest('hex');
};

// (Story 1.16 removed nodeBrotliDecompress — chunk-loader no longer decompresses)

const mockFetchOk = (compressed: ArrayBuffer): typeof fetch =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => compressed,
  } as unknown as Response)) as unknown as typeof fetch;

const makeChunkFromLinear = (params: {
  bodyId: number;
  etStart: number;
  cadence: number;
  sampleCount: number;
  slope: [number, number, number]; // velocity vector
  origin: [number, number, number]; // p(etStart)
}): LoadedChunk => {
  const samples = new Float64Array(params.sampleCount * 6);
  for (let i = 0; i < params.sampleCount; i++) {
    const dt = i * params.cadence;
    samples[i * 6 + 0] = params.origin[0] + params.slope[0] * dt;
    samples[i * 6 + 1] = params.origin[1] + params.slope[1] * dt;
    samples[i * 6 + 2] = params.origin[2] + params.slope[2] * dt;
    samples[i * 6 + 3] = params.slope[0];
    samples[i * 6 + 4] = params.slope[1];
    samples[i * 6 + 5] = params.slope[2];
  }
  return {
    header: {
      magic: 'VTRJ',
      version: 1,
      bodyId: params.bodyId,
      etStart: params.etStart,
      etEnd: params.etStart + (params.sampleCount - 1) * params.cadence,
      sampleCount: params.sampleCount,
      cadenceSeconds: params.cadence,
    },
    samples,
  };
};

const buildValidManifestJson = (): Record<string, unknown> => ({
  schemaVersion: 1,
  bakeCommit: 'deadbeef',
  bakeTimestamp: '2026-05-18T00:00:00Z',
  kernels: [],
  bodies: [
    {
      naifId: -31,
      name: 'Voyager 1',
      files: [
        {
          url: 'data/v1.bin.br',
          sha256: 'a'.repeat(64),
          decompressedSha256: 'a'.repeat(64),
          sizeBytes: 100,
          timeRangeEt: [0, 60],
          cadenceSec: 60,
          kind: 'trajectory',
        },
      ],
    },
  ],
  chapters: [],
  validationTolerances: { maxPositionErrorKm: 20, rmsPositionErrorKm: 5 },
});

const jsonFetchResponse = (body: unknown): typeof fetch =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as unknown as Response)) as unknown as typeof fetch;

// === 1. schemaVersion is locked at 1 =================================

describe('Manifest schemaVersion is locked at 1 (defense)', () => {
  it('rejects schemaVersion: 2 with a ManifestValidationError', async () => {
    __resetCacheForTests();
    const bad = { ...buildValidManifestJson(), schemaVersion: 2 };
    await expect(
      ManifestLoader.load('test://v2-bump', { fetchImpl: jsonFetchResponse(bad) }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
    __resetCacheForTests();
  });

  it('rejects schemaVersion: 0 (any unknown major)', async () => {
    __resetCacheForTests();
    const bad = { ...buildValidManifestJson(), schemaVersion: 0 };
    await expect(
      ManifestLoader.load('test://v0-bump', { fetchImpl: jsonFetchResponse(bad) }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
    __resetCacheForTests();
  });
});

// === 2. sha256 regex is exactly /^[0-9a-f]{64}$/ — lowercase only ====

describe('Manifest sha256 hex regex is lowercase-only (defense)', () => {
  it('rejects uppercase hex in sha256', async () => {
    __resetCacheForTests();
    const bad = buildValidManifestJson() as unknown as { bodies: Array<{ files: Array<{ sha256: string }> }> };
    bad.bodies[0].files[0].sha256 = 'A'.repeat(64); // valid hex chars, wrong case
    await expect(
      ManifestLoader.load('test://sha-upper', {
        fetchImpl: jsonFetchResponse(bad),
      }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
    __resetCacheForTests();
  });

  it('rejects mixed-case hex', async () => {
    __resetCacheForTests();
    const bad = buildValidManifestJson() as unknown as { bodies: Array<{ files: Array<{ sha256: string }> }> };
    bad.bodies[0].files[0].sha256 = 'aA'.repeat(32);
    await expect(
      ManifestLoader.load('test://sha-mixed', {
        fetchImpl: jsonFetchResponse(bad),
      }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
    __resetCacheForTests();
  });

  it('accepts a valid lowercase 64-char hex sha256', async () => {
    __resetCacheForTests();
    await expect(
      ManifestLoader.load('test://sha-ok', {
        fetchImpl: jsonFetchResponse(buildValidManifestJson()),
      }),
    ).resolves.toBeDefined();
    __resetCacheForTests();
  });
});

// === 3. ChunkLoader rejects byte-truncated brotli payloads ===========

describe('ChunkLoader rejects byte-truncated payloads (defense)', () => {
  it('a brotli stream truncated mid-body fails with a useful error, not a silent empty', async () => {
    const dec = buildVtrj({
      bodyId: -31,
      etStart: 0,
      etEnd: 600,
      sampleCount: 11,
      cadenceSeconds: 60,
      samples: new Float64Array(66).map((_, i) => i + 1),
    });
    const fullCompressed = passthrough(dec);
    // Truncate enough bytes that the brotli stream is unrecoverable. Brotli
    // tail-truncation reliably fails Node's brotliDecompressSync.
    const truncBytes = Math.max(8, Math.floor(fullCompressed.byteLength / 3));
    const truncated = fullCompressed.slice(0, fullCompressed.byteLength - truncBytes);
    const file: ManifestFile = {
      url: 'data/truncated.bin.br',
      sha256: sha256Hex(truncated),
      decompressedSha256: sha256Hex(truncated),
      sizeBytes: truncated.byteLength,
      timeRangeEt: [0, 600],
      cadenceSec: 60,
      kind: 'trajectory',
    };
    const loader = new ChunkLoader({
      fetchImpl: mockFetchOk(truncated),
    });
    // Must throw; must NOT silently resolve to an empty chunk.
    await expect(loader.load(file)).rejects.toBeInstanceOf(Error);
  });
});

// === 4. EphemerisService never extrapolates ==========================

describe('EphemerisService never extrapolates outside segment range (defense)', () => {
  const buildOneSegSetup = (): { svc: EphemerisService; etStart: number; etEnd: number } => {
    const etStart = 1000;
    const cadence = 50;
    const sampleCount = 5;
    const etEnd = etStart + (sampleCount - 1) * cadence; // 1200
    const chunk = makeChunkFromLinear({
      bodyId: -31,
      etStart,
      cadence,
      sampleCount,
      slope: [1, 0, 0],
      origin: [0, 0, 0],
    });
    const manifest: Manifest = {
      schemaVersion: 1,
      bakeCommit: 'test',
      bakeTimestamp: '2026-05-18T00:00:00Z',
      kernels: [],
      bodies: [
        {
          naifId: -31,
          name: 'V1',
          files: [
            {
              url: 'data/seg.bin.br',
              sha256: 'a'.repeat(64),
              decompressedSha256: 'a'.repeat(64),
              sizeBytes: 100,
              timeRangeEt: [etStart, etEnd],
              cadenceSec: cadence,
              kind: 'trajectory',
            },
          ],
        },
      ],
      chapters: [],
      validationTolerances: { maxPositionErrorKm: 20, rmsPositionErrorKm: 5 },
    };
    const cache = new Map<string, LoadedChunk>([['data/seg.bin.br', chunk]]);
    const chunkLoader = {
      peek: (url: string) => cache.get(url),
      load: vi.fn(async () => chunk),
      subscribe: () => () => {},
      get loading() {
        return false;
      },
    } as unknown as import('../src/services/chunk-loader').ChunkLoader;
    return { svc: new EphemerisService(manifest, chunkLoader), etStart, etEnd };
  };

  it('returns null 1 second past etEnd (no extrapolation past the right edge)', () => {
    const { svc, etEnd } = buildOneSegSetup();
    expect(svc.getStateAt(etEnd + 1, -31)).toBeNull();
  });

  it('returns null 1 second before etStart (no extrapolation past the left edge)', () => {
    const { svc, etStart } = buildOneSegSetup();
    expect(svc.getStateAt(etStart - 1, -31)).toBeNull();
  });

  it('returns a value exactly at etStart and etEnd (boundary inclusive)', () => {
    const { svc, etStart, etEnd } = buildOneSegSetup();
    expect(svc.getStateAt(etStart, -31)).not.toBeNull();
    expect(svc.getStateAt(etEnd, -31)).not.toBeNull();
  });
});

// === 5. Hermite is monotonic for linear data =========================

describe('Hermite interpolator is monotonic on linear data (defense)', () => {
  it('100 evenly-spaced samples of a positive-slope linear chunk are strictly monotonic', () => {
    const etStart = 0;
    const cadence = 100;
    const sampleCount = 10; // span = 900
    const chunk = makeChunkFromLinear({
      bodyId: -31,
      etStart,
      cadence,
      sampleCount,
      slope: [3.7, 0, 0],
      origin: [50, 0, 0],
    });
    const manifest: Manifest = {
      schemaVersion: 1,
      bakeCommit: 'test',
      bakeTimestamp: '2026-05-18T00:00:00Z',
      kernels: [],
      bodies: [
        {
          naifId: -31,
          name: 'V1',
          files: [
            {
              url: 'data/lin.bin.br',
              sha256: 'a'.repeat(64),
              decompressedSha256: 'a'.repeat(64),
              sizeBytes: 100,
              timeRangeEt: [etStart, etStart + (sampleCount - 1) * cadence],
              cadenceSec: cadence,
              kind: 'trajectory',
            },
          ],
        },
      ],
      chapters: [],
      validationTolerances: { maxPositionErrorKm: 20, rmsPositionErrorKm: 5 },
    };
    const cache = new Map<string, LoadedChunk>([['data/lin.bin.br', chunk]]);
    const chunkLoader = {
      peek: (url: string) => cache.get(url),
      load: vi.fn(async () => chunk),
      subscribe: () => () => {},
      get loading() {
        return false;
      },
    } as unknown as import('../src/services/chunk-loader').ChunkLoader;
    const svc = new EphemerisService(manifest, chunkLoader);

    const span = (sampleCount - 1) * cadence;
    const N = 100;
    let prev = -Infinity;
    for (let i = 0; i < N; i++) {
      const et = etStart + (i / (N - 1)) * span;
      const s = svc.getStateAt(et, -31);
      expect(s).not.toBeNull();
      const x = s!.position[0];
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
  });
});

// === 6. Hermite reproduces the sample exactly at sample boundaries ===

describe('Hermite reproduces sample values exactly at sample boundaries (defense)', () => {
  it('querying etStart + i * cadence returns the i-th stored sample within 1e-9 km', () => {
    const etStart = 500_000;
    const cadence = 73; // non-round cadence to stress accumulation
    const sampleCount = 8;
    const samples = new Float64Array(sampleCount * 6);
    for (let i = 0; i < sampleCount; i++) {
      // Use a cubic so the Hermite reproduction is exact even mid-interval,
      // but we only check sample boundaries here.
      const t = i * cadence;
      samples[i * 6 + 0] = 1 + 2 * t - 0.001 * t * t + 1e-7 * t * t * t;
      samples[i * 6 + 1] = -5 + 0.25 * t;
      samples[i * 6 + 2] = 7;
      samples[i * 6 + 3] = 2 - 0.002 * t + 3e-7 * t * t;
      samples[i * 6 + 4] = 0.25;
      samples[i * 6 + 5] = 0;
    }
    const chunk: LoadedChunk = {
      header: {
        magic: 'VTRJ',
        version: 1,
        bodyId: -31,
        etStart,
        etEnd: etStart + (sampleCount - 1) * cadence,
        sampleCount,
        cadenceSeconds: cadence,
      },
      samples,
    };
    const manifest: Manifest = {
      schemaVersion: 1,
      bakeCommit: 'test',
      bakeTimestamp: '2026-05-18T00:00:00Z',
      kernels: [],
      bodies: [
        {
          naifId: -31,
          name: 'V1',
          files: [
            {
              url: 'data/exact.bin.br',
              sha256: 'a'.repeat(64),
              decompressedSha256: 'a'.repeat(64),
              sizeBytes: 100,
              timeRangeEt: [etStart, etStart + (sampleCount - 1) * cadence],
              cadenceSec: cadence,
              kind: 'trajectory',
            },
          ],
        },
      ],
      chapters: [],
      validationTolerances: { maxPositionErrorKm: 20, rmsPositionErrorKm: 5 },
    };
    const cache = new Map<string, LoadedChunk>([['data/exact.bin.br', chunk]]);
    const chunkLoader = {
      peek: (url: string) => cache.get(url),
      load: vi.fn(async () => chunk),
      subscribe: () => () => {},
      get loading() {
        return false;
      },
    } as unknown as import('../src/services/chunk-loader').ChunkLoader;
    const svc = new EphemerisService(manifest, chunkLoader);

    const TOL = 1e-9;
    for (let i = 0; i < sampleCount; i++) {
      const et = etStart + i * cadence;
      const s = svc.getStateAt(et, -31);
      expect(s).not.toBeNull();
      expect(Math.abs(s!.position[0] - samples[i * 6 + 0])).toBeLessThanOrEqual(TOL);
      expect(Math.abs(s!.position[1] - samples[i * 6 + 1])).toBeLessThanOrEqual(TOL);
      expect(Math.abs(s!.position[2] - samples[i * 6 + 2])).toBeLessThanOrEqual(TOL);
    }
  });
});

// === 7. LRU eviction respects recency ================================

describe('LRU eviction respects recency, not insertion order (defense)', () => {
  it('re-accessing chunk 0 before overflow keeps it cached; chunk 1 evicts instead', async () => {
    // Default capacity is 12. We load chunks 0..11 (filling cache), then bump
    // chunk 0 via re-access so it becomes MRU, then load chunk 12 to force
    // one eviction. Expected eviction: chunk 1 (now the least-recently-used).
    const N = 13;
    const files: ManifestFile[] = [];
    const blobs = new Map<string, ArrayBuffer>();
    for (let i = 0; i < N; i++) {
      const dec = buildVtrj({
        bodyId: -31,
        etStart: i * 1000,
        etEnd: i * 1000 + 60,
        sampleCount: 1,
        cadenceSeconds: 60,
        samples: new Float64Array([i, 0, 0, 0, 0, 0]),
      });
      const c = passthrough(dec);
      const url = `data/lru-${i}.bin.br`;
      blobs.set(url, c);
      files.push({
        url,
        sha256: sha256Hex(c),
        decompressedSha256: sha256Hex(c),
        sizeBytes: c.byteLength,
        timeRangeEt: [i * 1000, i * 1000 + 60],
        cadenceSec: 60,
        kind: 'trajectory',
      });
    }
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const data = blobs.get(String(input));
      if (!data) {
        return { ok: false, status: 404, statusText: 'NF', arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
      }
      return { ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => data } as unknown as Response;
    }) as unknown as typeof fetch;
    const loader = new ChunkLoader({ fetchImpl });

    // Load chunks 0..11 (fills cache to capacity 12).
    for (let i = 0; i < 12; i++) {
      await loader.load(files[i]);
    }
    // Insertion order now: 0,1,2,3,4,5,6,7,8,9,10,11

    // Touch chunk 0 ONCE to bump it to MRU (peek -> LruCache.get bumps order).
    expect(loader.peek(files[0].url)).toBeDefined();
    // Order now: 1,2,3,4,5,6,7,8,9,10,11,0

    // Loading chunk 12 forces eviction of the oldest, which is now chunk 1.
    await loader.load(files[12]);

    // Inspect via __cacheKeys (does NOT bump order, unlike peek). This avoids
    // any test-time confounding of recency.
    const keys = new Set(loader.__cacheKeys());
    expect(keys.has(files[0].url), 'chunk 0 was just-accessed and must survive').toBe(true);
    expect(keys.has(files[1].url), 'chunk 1 must be the eviction victim').toBe(false);
    expect(keys.has(files[12].url)).toBe(true);
    expect(loader.__cacheSize()).toBe(DEFAULT_LRU_CAPACITY);
  });
});

// === 8. Concurrent fetch of the same URL is coalesced ================

describe('ChunkLoader coalesces concurrent in-flight requests (defense)', () => {
  it('5 concurrent load() calls for the same file result in exactly 1 fetch', async () => {
    const dec = buildVtrj({
      bodyId: -31,
      etStart: 0,
      etEnd: 60,
      sampleCount: 1,
      cadenceSeconds: 60,
      samples: new Float64Array([1, 2, 3, 0, 0, 0]),
    });
    const c = passthrough(dec);
    const file: ManifestFile = {
      url: 'data/coalesce.bin.br',
      sha256: sha256Hex(c),
      decompressedSha256: sha256Hex(c),
      sizeBytes: c.byteLength,
      timeRangeEt: [0, 60],
      cadenceSec: 60,
      kind: 'trajectory',
    };
    // Mock fetch that returns only after a microtask delay so the 5 callers
    // all see the in-flight promise.
    let resolveResp: (r: Response) => void = () => {};
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((res) => {
          resolveResp = res;
        }),
    ) as unknown as typeof fetch;
    const loader = new ChunkLoader({ fetchImpl });
    const calls = [
      loader.load(file),
      loader.load(file),
      loader.load(file),
      loader.load(file),
      loader.load(file),
    ];
    // Let the first fetch start, then resolve.
    await Promise.resolve();
    resolveResp({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => c,
    } as unknown as Response);
    const results = await Promise.all(calls);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // All 5 return the same chunk object (cache hit after first resolve).
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(results[0]);
    }
  });
});

// === 9. web/public/data/manifest.json lockfile contract ==============

describe('Runtime manifest.json lockfile contract (defense)', () => {
  it('exists, parses with Zod, and declares the V1+V2+celestial body set with the expected file counts', async () => {
    expect(existsSync(RUNTIME_MANIFEST_PATH), `missing ${RUNTIME_MANIFEST_PATH}`).toBe(true);
    __resetCacheForTests();
    const raw = JSON.parse(readFileSync(RUNTIME_MANIFEST_PATH, 'utf-8'));
    const fetchImpl = jsonFetchResponse(raw);
    const manifest = await ManifestLoader.load('test://runtime-lock', { fetchImpl });
    __resetCacheForTests();

    // Story 1.13: manifest extended with 10 celestial bodies (Sun, 8
    // planet barycenters, Moon). Total bodies = 2 spacecraft + 10
    // celestial = 12.
    expect(manifest.bodies.length).toBe(12);
    const v1 = manifest.bodies.find((b) => b.naifId === -31);
    const v2 = manifest.bodies.find((b) => b.naifId === -32);
    expect(v1, 'V1 (NAIF -31) missing from runtime manifest').toBeDefined();
    expect(v2, 'V2 (NAIF -32) missing from runtime manifest').toBeDefined();
    expect(v1!.files.length).toBe(7);
    expect(v2!.files.length).toBe(11);

    // Each of the 10 celestial bodies has exactly one VTRJ file (DE440 is
    // continuous; no per-segment chunking).
    const celestialIds = [10, 1, 2, 3, 4, 5, 6, 7, 8, 301];
    for (const naifId of celestialIds) {
      const body = manifest.bodies.find((b) => b.naifId === naifId);
      expect(body, `celestial NAIF ${naifId} missing from manifest`).toBeDefined();
      expect(body!.files.length).toBe(1);
    }

    // Total files = 7 V1 + 11 V2 + 10 celestial = 28.
    const total = manifest.bodies.reduce((acc, b) => acc + b.files.length, 0);
    expect(total).toBe(28);
  });
});

// === 10. L2 fixture body set ⊆ runtime manifest body set =============

describe('L2 fixture bodies are a subset of runtime manifest bodies (defense)', () => {
  it('every NAIF id in bake/out/l2-reference-fixtures.json is present in web/public/data/manifest.json', () => {
    if (!existsSync(L2_FIXTURES_PATH)) {
      // Mirror the L2 hook test: skip gracefully when the fixture isn't on
      // disk (fresh checkout). This is a brittleness guard, not a hard gate.
      return;
    }
    expect(existsSync(RUNTIME_MANIFEST_PATH)).toBe(true);
    const fixtures = JSON.parse(readFileSync(L2_FIXTURES_PATH, 'utf-8')) as {
      bodies: Array<{ naifId: number }>;
    };
    const manifest = JSON.parse(readFileSync(RUNTIME_MANIFEST_PATH, 'utf-8')) as {
      bodies: Array<{ naifId: number }>;
    };
    const manifestIds = new Set(manifest.bodies.map((b) => b.naifId));
    const fixtureIds = fixtures.bodies.map((b) => b.naifId);
    expect(fixtureIds.length).toBeGreaterThan(0);
    for (const id of fixtureIds) {
      expect(
        manifestIds.has(id),
        `L2 fixture body NAIF ${id} is not in runtime manifest`,
      ).toBe(true);
    }
  });
});

// === 11. ChunkLoader subscribe contract ==============================

describe('ChunkLoader.subscribe contract (defense)', () => {
  it('notifies subscribers in registration order, and unsubscribed callbacks stop firing', async () => {
    const dec = buildVtrj({
      bodyId: -31,
      etStart: 0,
      etEnd: 60,
      sampleCount: 1,
      cadenceSeconds: 60,
      samples: new Float64Array([1, 2, 3, 0, 0, 0]),
    });
    const c = passthrough(dec);
    const file: ManifestFile = {
      url: 'data/sub-order.bin.br',
      sha256: sha256Hex(c),
      decompressedSha256: sha256Hex(c),
      sizeBytes: c.byteLength,
      timeRangeEt: [0, 60],
      cadenceSec: 60,
      kind: 'trajectory',
    };
    const loader = new ChunkLoader({
      fetchImpl: mockFetchOk(c),
    });
    const log: Array<{ sub: string; value: boolean }> = [];
    const unsubA = loader.subscribe((v) => log.push({ sub: 'A', value: v }));
    const unsubB = loader.subscribe((v) => log.push({ sub: 'B', value: v }));
    const unsubC = loader.subscribe((v) => log.push({ sub: 'C', value: v }));

    await loader.load(file);
    // For one load: A,B,C each see [true, false] in registration order per
    // edge transition. The notify loop iterates the Set in insertion order.
    const trueEvents = log.filter((e) => e.value === true).map((e) => e.sub);
    const falseEvents = log.filter((e) => e.value === false).map((e) => e.sub);
    expect(trueEvents).toEqual(['A', 'B', 'C']);
    expect(falseEvents).toEqual(['A', 'B', 'C']);

    // Unsubscribe B; load another chunk; B must not receive further events.
    unsubB();
    const dec2 = buildVtrj({
      bodyId: -32,
      etStart: 0,
      etEnd: 60,
      sampleCount: 1,
      cadenceSeconds: 60,
      samples: new Float64Array([4, 5, 6, 0, 0, 0]),
    });
    const c2 = passthrough(dec2);
    const file2: ManifestFile = {
      url: 'data/sub-order-2.bin.br',
      sha256: sha256Hex(c2),
      decompressedSha256: sha256Hex(c2),
      sizeBytes: c2.byteLength,
      timeRangeEt: [0, 60],
      cadenceSec: 60,
      kind: 'trajectory',
    };
    // Replace fetch impl by constructing a new loader is too heavy; instead,
    // use a loader with a fresh fetchImpl that serves c2.
    const loader2 = new ChunkLoader({
      fetchImpl: mockFetchOk(c2),
    });
    const log2: string[] = [];
    const ua = loader2.subscribe(() => log2.push('A'));
    const ub = loader2.subscribe(() => log2.push('B'));
    ub();
    await loader2.load(file2);
    expect(log2).toEqual(['A', 'A']); // A only, on both transitions
    ua();
    unsubA();
    unsubC();
  });
});

// === 12. getStateAt is referentially transparent (exact equality) =====

describe('EphemerisService.getStateAt is referentially transparent (defense)', () => {
  it('two calls with the same (et, bodyId) return position/velocity that are *exactly* equal', () => {
    const chunk = makeChunkFromLinear({
      bodyId: -31,
      etStart: 100,
      cadence: 50,
      sampleCount: 5,
      slope: [1.234567, -0.7891011, 3.14],
      origin: [42, -17, 9001],
    });
    const manifest: Manifest = {
      schemaVersion: 1,
      bakeCommit: 'test',
      bakeTimestamp: '2026-05-18T00:00:00Z',
      kernels: [],
      bodies: [
        {
          naifId: -31,
          name: 'V1',
          files: [
            {
              url: 'data/det.bin.br',
              sha256: 'a'.repeat(64),
              decompressedSha256: 'a'.repeat(64),
              sizeBytes: 100,
              timeRangeEt: [100, 300],
              cadenceSec: 50,
              kind: 'trajectory',
            },
          ],
        },
      ],
      chapters: [],
      validationTolerances: { maxPositionErrorKm: 20, rmsPositionErrorKm: 5 },
    };
    const cache = new Map<string, LoadedChunk>([['data/det.bin.br', chunk]]);
    const chunkLoader = {
      peek: (url: string) => cache.get(url),
      load: vi.fn(async () => chunk),
      subscribe: () => () => {},
      get loading() {
        return false;
      },
    } as unknown as import('../src/services/chunk-loader').ChunkLoader;
    const svc = new EphemerisService(manifest, chunkLoader);
    const et = 173.4242;
    const a = svc.getStateAt(et, -31);
    const b = svc.getStateAt(et, -31);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Bit-exact equality on Float64 outputs. If the implementation ever
    // introduces non-determinism (e.g., reading from a mutating buffer or
    // adding a randomized cache layer) this assertion fires.
    expect(a!.position[0]).toBe(b!.position[0]);
    expect(a!.position[1]).toBe(b!.position[1]);
    expect(a!.position[2]).toBe(b!.position[2]);
    expect(a!.velocity[0]).toBe(b!.velocity[0]);
    expect(a!.velocity[1]).toBe(b!.velocity[1]);
    expect(a!.velocity[2]).toBe(b!.velocity[2]);
  });
});

// === 13. ?perf=ephemeris URL gate is exact ===========================

describe('?perf=ephemeris URL gate is exact-match (defense)', () => {
  it('does NOT activate on a loose-prefix value like "ephemeris1"', () => {
    expect(isEphemerisPerfMode('ephemeris1')).toBe(false);
    expect(isEphemerisPerfMode('ephemeris-something')).toBe(false);
    expect(isEphemerisPerfMode('ephemeris ')).toBe(false);
    expect(isEphemerisPerfMode(' ephemeris')).toBe(false);
    expect(isEphemerisPerfMode('EPHEMERIS')).toBe(false);
  });

  it('does activate on the exact value "ephemeris"', () => {
    expect(isEphemerisPerfMode('ephemeris')).toBe(true);
  });
});

// === 14. No new framework imports in web/src/ ========================

describe('No unexpected framework imports in web/src/ (defense, Story 1.6 boundary)', () => {
  // Story 1.7 introduced Lit 3+ as the sanctioned component framework.
  // The architectural ban on React/Preact/Vue/Svelte/state libs holds; Lit
  // (lit / lit-html / lit-element / lit-* subpaths) is explicitly allowed.
  // Match common bare-module specifiers in `import ... from '<pkg>'` or
  // `import('<pkg>')` to catch any sneaked-in framework.
  const FORBIDDEN_PACKAGES = [
    'react',
    'react-dom',
    'preact',
    'vue',
    'svelte',
    'rxjs',
    'mobx',
    'redux',
    'zustand',
    'jotai',
    'lodash',
    'lodash-es',
    'ramda',
    'immer',
  ];

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...walk(full));
      } else if (
        e.isFile() &&
        (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) &&
        !e.name.endsWith('.test.ts') &&
        !e.name.endsWith('.test.tsx')
      ) {
        out.push(full);
      }
    }
    return out;
  };

  const buildImportRegex = (pkg: string): RegExp => {
    // Match either: from '<pkg>' / from "<pkg>" / from '<pkg>/sub' / import('<pkg>')
    // Escape regex metachars (none of the forbidden packages contain any, but
    // be defensive).
    const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `(?:from\\s*['"]${escaped}(?:/[^'"\\s]*)?['"]|import\\s*\\(\\s*['"]${escaped}(?:/[^'"\\s]*)?['"]\\s*\\))`,
    );
  };

  it.each(FORBIDDEN_PACKAGES)(
    'no source file under web/src/ imports "%s"',
    (pkg) => {
      const re = buildImportRegex(pkg);
      const files = walk(WEB_SRC);
      const offenders: Array<{ file: string; line: number; text: string }> = [];
      for (const f of files) {
        const text = readFileSync(f, 'utf-8');
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            offenders.push({ file: f, line: i + 1, text: lines[i].trim() });
          }
        }
      }
      expect(
        offenders,
        `unexpected import of "${pkg}": ${offenders.map((o) => `${o.file}:${o.line} → ${o.text}`).join('; ')}`,
      ).toEqual([]);
    },
  );
});

// === Sanity: the runtime manifest file is reasonably sized ===========

describe('Runtime manifest file size sanity (defense)', () => {
  it('web/public/data/manifest.json is < 50 KB (committed runtime contract)', () => {
    if (!existsSync(RUNTIME_MANIFEST_PATH)) return;
    const stat = statSync(RUNTIME_MANIFEST_PATH);
    expect(stat.size).toBeLessThan(50 * 1024);
  });
});
