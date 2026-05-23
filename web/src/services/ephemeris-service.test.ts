import { describe, it, expect, vi } from 'vitest';
import {
  EphemerisService,
  interpolateFromChunk,
} from './ephemeris-service';
import type { ChunkLoader, LoadedChunk } from './chunk-loader';
import type { Manifest, ManifestFile } from './manifest-loader';

// === Test fixtures ==================================================

const makeChunk = (params: {
  bodyId: number;
  etStart: number;
  cadence: number;
  sampleCount: number;
  // p(t) = pFn(et) for each axis at each sample; v is the analytic derivative
  pFn: (et: number) => [number, number, number];
  vFn: (et: number) => [number, number, number];
}): LoadedChunk => {
  const samples = new Float64Array(params.sampleCount * 6);
  for (let i = 0; i < params.sampleCount; i++) {
    const et = params.etStart + i * params.cadence;
    const [px, py, pz] = params.pFn(et);
    const [vx, vy, vz] = params.vFn(et);
    samples[i * 6 + 0] = px;
    samples[i * 6 + 1] = py;
    samples[i * 6 + 2] = pz;
    samples[i * 6 + 3] = vx;
    samples[i * 6 + 4] = vy;
    samples[i * 6 + 5] = vz;
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

const makeManifest = (files: { url: string; range: [number, number]; cadenceSec: number }[]): Manifest => {
  return {
    schemaVersion: 1,
    bakeCommit: 'test',
    bakeTimestamp: '2026-05-18T00:00:00Z',
    kernels: [],
    bodies: [
      {
        naifId: -31,
        name: 'Voyager 1',
        files: files.map((f) => ({
          url: f.url,
          sha256: 'a'.repeat(64),
          sizeBytes: 100,
          timeRangeEt: f.range,
          cadenceSec: f.cadenceSec,
          kind: 'trajectory' as const,
        })),
      },
    ],
    chapters: [],
    validationTolerances: {
      maxPositionErrorKm: 20,
      rmsPositionErrorKm: 5,
    },
    models: [],
  };
};

const fakeChunkLoader = (chunks: Map<string, LoadedChunk>): {
  loader: ChunkLoader;
  loadCalls: string[];
} => {
  const loadCalls: string[] = [];
  const loader = {
    peek: (url: string) => chunks.get(url),
    load: vi.fn(async (file: ManifestFile) => {
      loadCalls.push(file.url);
      const c = chunks.get(file.url);
      if (!c) throw new Error(`no chunk for ${file.url}`);
      return c;
    }),
    subscribe: () => () => {},
    get loading() {
      return false;
    },
  } as unknown as ChunkLoader;
  return { loader, loadCalls };
};

// === interpolateFromChunk pure-math tests ===========================

describe('interpolateFromChunk', () => {
  it('returns the exact sampled state at sample boundaries (constant velocity)', () => {
    const chunk = makeChunk({
      bodyId: -31,
      etStart: 0,
      cadence: 60,
      sampleCount: 5,
      // Linear: p(t) = (t, 2t, 3t), v constant (1, 2, 3)
      pFn: (t) => [t, 2 * t, 3 * t],
      vFn: () => [1, 2, 3],
    });
    for (let i = 0; i < chunk.header.sampleCount; i++) {
      const et = i * 60;
      const s = interpolateFromChunk(chunk, et);
      expect(s.position[0]).toBeCloseTo(et, 9);
      expect(s.position[1]).toBeCloseTo(2 * et, 9);
      expect(s.position[2]).toBeCloseTo(3 * et, 9);
      expect(s.velocity[0]).toBeCloseTo(1, 9);
      expect(s.velocity[1]).toBeCloseTo(2, 9);
      expect(s.velocity[2]).toBeCloseTo(3, 9);
    }
  });

  it('interpolates linear motion exactly between samples', () => {
    const chunk = makeChunk({
      bodyId: -31,
      etStart: 1000,
      cadence: 100,
      sampleCount: 4,
      pFn: (t) => [t - 1000, (t - 1000) * 0.5, 7],
      vFn: () => [1, 0.5, 0],
    });
    // Midpoint of first interval (et = 1050)
    const s = interpolateFromChunk(chunk, 1050);
    expect(s.position[0]).toBeCloseTo(50, 8);
    expect(s.position[1]).toBeCloseTo(25, 8);
    expect(s.position[2]).toBeCloseTo(7, 8);
    expect(s.velocity[0]).toBeCloseTo(1, 8);
    expect(s.velocity[1]).toBeCloseTo(0.5, 8);
    expect(s.velocity[2]).toBeCloseTo(0, 8);
  });

  it('interpolates a cubic-in-t trajectory exactly', () => {
    // p(t) = a + b*t + c*t^2 + d*t^3 (per axis), v = derivative.
    // Hermite reproduces cubics exactly.
    const pFn = (t: number): [number, number, number] => [
      1 + 2 * t - 0.01 * t * t + 1e-6 * t * t * t,
      -3 + 0.5 * t,
      4,
    ];
    const vFn = (t: number): [number, number, number] => [
      2 - 0.02 * t + 3e-6 * t * t,
      0.5,
      0,
    ];
    const chunk = makeChunk({
      bodyId: -31,
      etStart: 0,
      cadence: 50,
      sampleCount: 10,
      pFn,
      vFn,
    });
    for (const et of [25, 73, 125, 200, 350]) {
      const s = interpolateFromChunk(chunk, et);
      const [ex, ey, ez] = pFn(et);
      expect(s.position[0]).toBeCloseTo(ex, 6);
      expect(s.position[1]).toBeCloseTo(ey, 6);
      expect(s.position[2]).toBeCloseTo(ez, 6);
    }
  });

  it('returns Float64Array-backed WorldVec3 (precision contract)', () => {
    const chunk = makeChunk({
      bodyId: -31,
      etStart: 0,
      cadence: 60,
      sampleCount: 3,
      pFn: () => [1, 2, 3],
      vFn: () => [0, 0, 0],
    });
    const s = interpolateFromChunk(chunk, 30);
    expect(s.position).toBeInstanceOf(Float64Array);
    expect(s.velocity).toBeInstanceOf(Float64Array);
  });
});

// === EphemerisService segment lookup ================================

describe('EphemerisService — segment lookup', () => {
  it('returns null for et before any segment', () => {
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [100, 200], cadenceSec: 50 },
    ]);
    const { loader } = fakeChunkLoader(new Map());
    const svc = new EphemerisService(manifest, loader);
    expect(svc.getStateAt(50, -31)).toBeNull();
  });

  it('returns null for et after every segment', () => {
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [100, 200], cadenceSec: 50 },
      { url: 'data/b.bin.br', range: [200, 300], cadenceSec: 50 },
    ]);
    const { loader } = fakeChunkLoader(new Map());
    const svc = new EphemerisService(manifest, loader);
    expect(svc.getStateAt(500, -31)).toBeNull();
  });

  it('returns null in a gap between segments', () => {
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [100, 150], cadenceSec: 50 },
      { url: 'data/b.bin.br', range: [200, 300], cadenceSec: 50 },
    ]);
    const { loader } = fakeChunkLoader(new Map());
    const svc = new EphemerisService(manifest, loader);
    expect(svc.getStateAt(175, -31)).toBeNull();
  });

  it('selects the correct segment when et lands in the middle range', () => {
    const chunkA = makeChunk({
      bodyId: -31,
      etStart: 100,
      cadence: 50,
      sampleCount: 2,
      pFn: () => [1, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const chunkB = makeChunk({
      bodyId: -31,
      etStart: 200,
      cadence: 50,
      sampleCount: 3,
      pFn: () => [99, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [100, 150], cadenceSec: 50 },
      { url: 'data/b.bin.br', range: [200, 300], cadenceSec: 50 },
    ]);
    const chunks = new Map<string, LoadedChunk>();
    chunks.set('data/a.bin.br', chunkA);
    chunks.set('data/b.bin.br', chunkB);
    const { loader } = fakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);
    expect(svc.getStateAt(125, -31)?.position[0]).toBeCloseTo(1, 10);
    expect(svc.getStateAt(250, -31)?.position[0]).toBeCloseTo(99, 10);
  });

  it('returns null for unknown bodyId', () => {
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [100, 200], cadenceSec: 50 },
    ]);
    const { loader } = fakeChunkLoader(new Map());
    const svc = new EphemerisService(manifest, loader);
    expect(svc.getStateAt(150, -999)).toBeNull();
  });
});

// === EphemerisService null-on-missing-chunk ==========================

describe('EphemerisService — null on missing chunk + kicks off load', () => {
  it('returns null AND triggers ChunkLoader.load when the chunk is missing', async () => {
    const chunk = makeChunk({
      bodyId: -31,
      etStart: 100,
      cadence: 50,
      sampleCount: 3,
      pFn: () => [42, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [100, 200], cadenceSec: 50 },
    ]);
    // ChunkLoader peek returns undefined initially; the load() call resolves
    // to the chunk we plant in the map, but the synchronous getStateAt call
    // returns null on first invocation.
    const chunks = new Map<string, LoadedChunk>();
    const { loader, loadCalls } = fakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);

    expect(svc.getStateAt(150, -31)).toBeNull();
    expect(loadCalls).toEqual(['data/a.bin.br']);

    // Simulate the chunk arriving in cache.
    chunks.set('data/a.bin.br', chunk);
    const s = svc.getStateAt(150, -31);
    expect(s?.position[0]).toBeCloseTo(42, 10);
  });

  it('getPosition / getVelocity return null when chunk missing', () => {
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [100, 200], cadenceSec: 50 },
    ]);
    const { loader } = fakeChunkLoader(new Map());
    const svc = new EphemerisService(manifest, loader);
    expect(svc.getPosition(150, -31)).toBeNull();
    expect(svc.getVelocity(150, -31)).toBeNull();
  });
});

// === EphemerisService referential transparency =====================

describe('EphemerisService — referential transparency', () => {
  it('same (et, bodyId) returns the same value across calls', () => {
    const chunk = makeChunk({
      bodyId: -31,
      etStart: 100,
      cadence: 50,
      sampleCount: 5,
      pFn: (t) => [t - 100, 0, 0],
      vFn: () => [1, 0, 0],
    });
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [100, 300], cadenceSec: 50 },
    ]);
    const chunks = new Map<string, LoadedChunk>();
    chunks.set('data/a.bin.br', chunk);
    const { loader } = fakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);
    const a = svc.getStateAt(175, -31);
    const b = svc.getStateAt(175, -31);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.position[0]).toBeCloseTo(b!.position[0], 12);
    expect(a!.position[1]).toBeCloseTo(b!.position[1], 12);
    expect(a!.position[2]).toBeCloseTo(b!.position[2], 12);
  });
});

// === Story 4.3 AC1 — overlapping intervals (cadence-band tiers) =======

describe('EphemerisService — overlapping cadence-band tiers (Story 4.3 AC1)', () => {
  it('picks the narrowest covering window when nested bands overlap', () => {
    // Mirror the Story 4.3 cadence-band layering: a wide per-segment chunk
    // (cruise, daily) with a hourly band nested inside, a 1-min band nested
    // inside that, and a 10-sec band nested at the centre. Distinct
    // pFn outputs per chunk so we can tell which one was selected.
    const wideSegChunk = makeChunk({
      bodyId: -31,
      etStart: 0,
      cadence: 86400,
      sampleCount: 11,
      pFn: () => [100, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const hourlyChunk = makeChunk({
      bodyId: -31,
      etStart: 400_000,
      cadence: 3600,
      sampleCount: 3,
      pFn: () => [200, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const oneMinChunk = makeChunk({
      bodyId: -31,
      etStart: 405_000,
      cadence: 60,
      sampleCount: 3,
      pFn: () => [300, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const tenSecChunk = makeChunk({
      bodyId: -31,
      etStart: 405_100,
      cadence: 10,
      sampleCount: 3,
      pFn: () => [400, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const manifest = makeManifest([
      { url: 'data/wide-seg.bin.br', range: [0, 864_000], cadenceSec: 86400 },
      { url: 'data/hourly.bin.br', range: [400_000, 407_200], cadenceSec: 3600 },
      { url: 'data/1min.bin.br', range: [405_000, 405_120], cadenceSec: 60 },
      { url: 'data/10sec.bin.br', range: [405_100, 405_120], cadenceSec: 10 },
    ]);
    const chunks = new Map<string, LoadedChunk>([
      ['data/wide-seg.bin.br', wideSegChunk],
      ['data/hourly.bin.br', hourlyChunk],
      ['data/1min.bin.br', oneMinChunk],
      ['data/10sec.bin.br', tenSecChunk],
    ]);
    const { loader } = fakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);

    // At et = 405_110 — covered by all four tiers; narrowest is 10sec.
    expect(svc.getStateAt(405_110, -31)?.position[0]).toBeCloseTo(400, 9);
    // At et = 405_050 — outside 10sec but inside 1min, hourly, wide.
    expect(svc.getStateAt(405_050, -31)?.position[0]).toBeCloseTo(300, 9);
    // At et = 403_000 — outside 1min + 10sec; inside hourly + wide.
    expect(svc.getStateAt(403_000, -31)?.position[0]).toBeCloseTo(200, 9);
    // At et = 200_000 — only wide-seg covers.
    expect(svc.getStateAt(200_000, -31)?.position[0]).toBeCloseTo(100, 9);
  });

  it('falls back to the wider tier when the narrower tier window has exited', () => {
    // Scrub past the narrow band's end — the wider tier MUST still resolve.
    const wideSegChunk = makeChunk({
      bodyId: -31,
      etStart: 0,
      cadence: 86400,
      sampleCount: 11,
      pFn: () => [100, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const narrowChunk = makeChunk({
      bodyId: -31,
      etStart: 1000,
      cadence: 10,
      sampleCount: 11,
      pFn: () => [999, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const manifest = makeManifest([
      { url: 'data/wide.bin.br', range: [0, 864_000], cadenceSec: 86400 },
      { url: 'data/narrow.bin.br', range: [1000, 1100], cadenceSec: 10 },
    ]);
    const chunks = new Map<string, LoadedChunk>([
      ['data/wide.bin.br', wideSegChunk],
      ['data/narrow.bin.br', narrowChunk],
    ]);
    const { loader } = fakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);

    // Inside narrow band — narrow wins.
    expect(svc.getStateAt(1050, -31)?.position[0]).toBeCloseTo(999, 9);
    // Past narrow band — falls back to wide (the bug this test pins).
    expect(svc.getStateAt(5000, -31)?.position[0]).toBeCloseTo(100, 9);
  });
});

// === Story 4.3 AC2 — 10%-prefetch trigger + boundaryStalled signal ====

describe('EphemerisService — Story 4.3 AC2 prefetch + boundaryStalled', () => {
  it('fires a chunk-load prefetch for the next file when et enters the last 10% of the current window', () => {
    const chunkA = makeChunk({
      bodyId: -31,
      etStart: 0,
      cadence: 100,
      sampleCount: 11,
      pFn: () => [1, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [0, 1000], cadenceSec: 100 },
      { url: 'data/b.bin.br', range: [1000, 2000], cadenceSec: 100 },
    ]);
    const chunks = new Map<string, LoadedChunk>([['data/a.bin.br', chunkA]]);
    const { loader, loadCalls } = fakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);

    // Trigger threshold is 1000 - (1000 * 0.1) = 900. Below 900 → no prefetch.
    svc.getStateAt(500, -31);
    expect(loadCalls).not.toContain('data/b.bin.br');

    // At 950 — inside the last 10% — must fire prefetch.
    svc.getStateAt(950, -31);
    expect(loadCalls).toContain('data/b.bin.br');
  });

  it('does not re-trigger prefetch on subsequent calls inside the same trigger band', () => {
    const chunkA = makeChunk({
      bodyId: -31,
      etStart: 0,
      cadence: 100,
      sampleCount: 11,
      pFn: () => [1, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [0, 1000], cadenceSec: 100 },
      { url: 'data/b.bin.br', range: [1000, 2000], cadenceSec: 100 },
    ]);
    const chunks = new Map<string, LoadedChunk>([['data/a.bin.br', chunkA]]);
    const { loader, loadCalls } = fakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);

    svc.getStateAt(950, -31);
    svc.getStateAt(960, -31);
    svc.getStateAt(970, -31);
    // Exactly one load of data/b.bin.br across all trigger-band calls.
    const bLoads = loadCalls.filter((u) => u === 'data/b.bin.br');
    expect(bLoads.length).toBe(1);
  });

  it('sets boundaryStalled = true when the queried chunk is missing AND inside a covered window', () => {
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [0, 1000], cadenceSec: 100 },
    ]);
    const chunks = new Map<string, LoadedChunk>(); // empty — no chunk in cache
    const { loader } = fakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);

    expect(svc.boundaryStalled).toBe(false); // initial state
    expect(svc.getStateAt(500, -31)).toBeNull();
    expect(svc.boundaryStalled).toBe(true);
  });

  it('clears boundaryStalled on next successful lookup', () => {
    const chunk = makeChunk({
      bodyId: -31,
      etStart: 0,
      cadence: 100,
      sampleCount: 5,
      pFn: () => [42, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [0, 400], cadenceSec: 100 },
    ]);
    const chunks = new Map<string, LoadedChunk>(); // missing initially
    const { loader } = fakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);

    svc.getStateAt(200, -31);
    expect(svc.boundaryStalled).toBe(true);
    chunks.set('data/a.bin.br', chunk);
    const s = svc.getStateAt(200, -31);
    expect(s).not.toBeNull();
    expect(svc.boundaryStalled).toBe(false);
  });

  it('does NOT set boundaryStalled for ET outside every covered window (out-of-mission)', () => {
    const manifest = makeManifest([
      { url: 'data/a.bin.br', range: [0, 1000], cadenceSec: 100 },
    ]);
    const { loader } = fakeChunkLoader(new Map());
    const svc = new EphemerisService(manifest, loader);

    expect(svc.getStateAt(-500, -31)).toBeNull(); // before mission window
    expect(svc.boundaryStalled).toBe(false);
    expect(svc.getStateAt(99999, -31)).toBeNull(); // after mission window
    expect(svc.boundaryStalled).toBe(false);
  });
});
