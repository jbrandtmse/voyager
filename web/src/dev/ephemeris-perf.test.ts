import { describe, it, expect, vi } from 'vitest';
import {
  isEphemerisPerfMode,
  runEphemerisPerf,
} from './ephemeris-perf';
import { EphemerisService } from '../services/ephemeris-service';
import type { ChunkLoader, LoadedChunk } from '../services/chunk-loader';
import type { Manifest } from '../services/manifest-loader';

describe('isEphemerisPerfMode', () => {
  it('detects ?perf=ephemeris', () => {
    expect(isEphemerisPerfMode('ephemeris')).toBe(true);
  });

  it('rejects other perf values', () => {
    expect(isEphemerisPerfMode(null)).toBe(false);
    expect(isEphemerisPerfMode('precision')).toBe(false);
    expect(isEphemerisPerfMode('')).toBe(false);
  });
});

// === Perf assertion against a synthetic chunk ======================
//
// Build a small in-memory chunk + manifest + ChunkLoader-like stub, then run
// runEphemerisPerf for 1000 iterations and assert median <= 0.2 ms.

const buildSyntheticChunk = (sampleCount: number, cadence: number): LoadedChunk => {
  const samples = new Float64Array(sampleCount * 6);
  for (let i = 0; i < sampleCount; i++) {
    // Smooth cubic-ish trajectory so interpolation always succeeds.
    const t = i * cadence;
    samples[i * 6 + 0] = t * 0.5;
    samples[i * 6 + 1] = Math.sin(t * 1e-3) * 1000;
    samples[i * 6 + 2] = Math.cos(t * 1e-3) * 1000;
    samples[i * 6 + 3] = 0.5;
    samples[i * 6 + 4] = Math.cos(t * 1e-3) * 1.0;
    samples[i * 6 + 5] = -Math.sin(t * 1e-3) * 1.0;
  }
  return {
    header: {
      magic: 'VTRJ',
      version: 1,
      bodyId: -31,
      etStart: 0,
      etEnd: (sampleCount - 1) * cadence,
      sampleCount,
      cadenceSeconds: cadence,
    },
    samples,
  };
};

const buildManifest = (chunkUrl: string, etStart: number, etEnd: number): Manifest => ({
  schemaVersion: 1,
  bakeCommit: 'test',
  bakeTimestamp: '2026-05-18T00:00:00Z',
  kernels: [],
  bodies: [
    {
      naifId: -31,
      name: 'Voyager 1',
      files: [
        {
          url: chunkUrl,
          sha256: 'a'.repeat(64),
          sizeBytes: 100,
          timeRangeEt: [etStart, etEnd],
          cadenceSec: 60,
          kind: 'trajectory',
        },
      ],
    },
  ],
  chapters: [],
  validationTolerances: {
    maxPositionErrorKm: 20,
    rmsPositionErrorKm: 5,
  },
});

const stubChunkLoader = (chunk: LoadedChunk): ChunkLoader => {
  const cache = new Map<string, LoadedChunk>([[chunk ? 'data/syn.bin.br' : '', chunk]]);
  cache.set('data/syn.bin.br', chunk);
  return {
    peek: (url: string) => cache.get(url),
    load: vi.fn(async () => chunk),
    subscribe: () => () => {},
    get loading() {
      return false;
    },
  } as unknown as ChunkLoader;
};

describe('runEphemerisPerf — NFR-P7 proportional gate', () => {
  it('median per-call cost is <= 0.2 ms for a single body, 1000 iterations', () => {
    const sampleCount = 200;
    const cadence = 60;
    const chunk = buildSyntheticChunk(sampleCount, cadence);
    const manifest = buildManifest('data/syn.bin.br', 0, (sampleCount - 1) * cadence);
    const loader = stubChunkLoader(chunk);
    const svc = new EphemerisService(manifest, loader);

    const span = (sampleCount - 1) * cadence;
    const iterations = 1000;
    const etSampler = (i: number) => (i / iterations) * span * 0.99 + 0.5;
    const stat = runEphemerisPerf(svc, -31, 'Voyager 1', etSampler, iterations);

    expect(stat.iterations).toBe(iterations);
    // 0.2 ms median for a single body. The L2 hook test logs the real
    // numbers; this assertion guards regression.
    expect(
      stat.medianMs,
      `median per-call cost = ${stat.medianMs.toFixed(4)} ms (gate 0.2 ms for 1 body)`,
    ).toBeLessThanOrEqual(0.2);
  });
});
