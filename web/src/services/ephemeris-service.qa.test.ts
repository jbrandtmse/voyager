/**
 * QA-stage extension tests for `ephemeris-service.ts` Story 4.3 AC2
 * (10%-prefetch trigger + `boundaryStalled` signal + overlapping-interval
 * `findSegmentFile`).
 *
 * Dev pinned: 10%-prefetch single-fire, boundaryStalled set/clear,
 * overlapping-interval lookup, no double-fire inside trigger band.
 *
 * QA pins the failure modes dev didn't pin:
 *
 *   1. **Last-segment / no-next-chunk** — at the LAST manifest file's
 *      trigger window, there is no "next chunk to prefetch." The
 *      `maybePrefetchNeighbour` path must not throw, must not call
 *      `chunkLoader.load`, and must not poison the prefetched-URLs Set
 *      (a future story that adds a new last segment must not be blocked
 *      by a stale Set entry).
 *
 *   2. **Prefetch promise rejection drops from the prefetched-URLs Set
 *      so a future re-entry can retry.** The dev's contract comment in
 *      `maybePrefetchNeighbour` claims this — QA pins it with a chunk
 *      loader that rejects on first call and resolves on second.
 *
 *   3. **Two-call boundary at the exact `triggerEt` threshold** —
 *      `getStateAt(et = triggerEt)` should fire the prefetch on the
 *      first call (et exactly equals the threshold per the `>=` test in
 *      `maybePrefetchNeighbour`). A second call at the same et must not
 *      refire it.
 *
 *   4. **`boundaryStalled` does NOT stick after a successful lookup of a
 *      DIFFERENT body** — the flag is the FSM's per-frame stall signal;
 *      it should be cleared by the next successful `getStateAt` call
 *      regardless of which body that call queries.
 */

import { describe, it, expect, vi } from 'vitest';
import { EphemerisService } from './ephemeris-service';
import type { ChunkLoader, LoadedChunk } from './chunk-loader';
import type { Manifest, ManifestFile } from './manifest-loader';

const makeChunk = (params: {
  bodyId: number;
  etStart: number;
  cadence: number;
  sampleCount: number;
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

const makeManifest = (
  files: { url: string; range: [number, number]; cadenceSec: number; bodyId?: number }[],
): Manifest => {
  // Group files by bodyId (default -31 for V1 trajectory tests).
  const byBody = new Map<number, typeof files>();
  for (const f of files) {
    const id = f.bodyId ?? -31;
    if (!byBody.has(id)) byBody.set(id, []);
    byBody.get(id)!.push(f);
  }
  return {
    schemaVersion: 1,
    bakeCommit: 'qa',
    bakeTimestamp: '2026-05-23T00:00:00Z',
    kernels: [],
    bodies: Array.from(byBody.entries()).map(([naifId, fs]) => ({
      naifId,
      name: `body-${naifId}`,
      files: fs.map((f) => ({
        url: f.url,
        sha256: 'a'.repeat(64),
        sizeBytes: 100,
        timeRangeEt: f.range,
        cadenceSec: f.cadenceSec,
        kind: 'trajectory' as const,
      })),
    })),
    chapters: [],
    validationTolerances: {
      maxPositionErrorKm: 20,
      rmsPositionErrorKm: 5,
    },
    models: [],
  };
};

const fakeChunkLoader = (
  chunks: Map<string, LoadedChunk>,
  options: {
    /** URLs that should reject (e.g. simulated 404). */
    rejectingUrls?: Set<string>;
    /** URLs that should reject on FIRST call but resolve on SECOND. */
    flakyUrls?: Set<string>;
  } = {},
): {
  loader: ChunkLoader;
  loadCalls: string[];
  flakeCount: Map<string, number>;
} => {
  const loadCalls: string[] = [];
  const flakeCount = new Map<string, number>();
  const loader = {
    peek: (url: string) => chunks.get(url),
    load: vi.fn(async (file: ManifestFile) => {
      loadCalls.push(file.url);
      if (options.rejectingUrls?.has(file.url)) {
        throw new Error(`simulated reject for ${file.url}`);
      }
      if (options.flakyUrls?.has(file.url)) {
        const seen = (flakeCount.get(file.url) ?? 0) + 1;
        flakeCount.set(file.url, seen);
        if (seen === 1) throw new Error(`flake on first load of ${file.url}`);
        // Fall through to resolution.
      }
      const c = chunks.get(file.url);
      if (!c) throw new Error(`no chunk for ${file.url}`);
      return c;
    }),
    subscribe: () => () => {},
    get loading() {
      return false;
    },
  } as unknown as ChunkLoader;
  return { loader, loadCalls, flakeCount };
};

describe('EphemerisService QA — last-segment prefetch edge', () => {
  it('does NOT call chunkLoader.load when the current chunk is the LAST in the manifest', async () => {
    // Only one chunk in the manifest. ET inside its last 10% must not
    // attempt to prefetch a non-existent neighbour.
    const chunk = makeChunk({
      bodyId: -31,
      etStart: 0,
      cadence: 100,
      sampleCount: 11,
      pFn: () => [1, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const manifest = makeManifest([
      { url: 'data/only.bin.br', range: [0, 1000], cadenceSec: 100 },
    ]);
    const chunks = new Map<string, LoadedChunk>([['data/only.bin.br', chunk]]);
    const { loader, loadCalls } = fakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);

    // Below trigger band — no load.
    svc.getStateAt(500, -31);
    expect(loadCalls).toEqual([]);
    // Inside last-10% band — there's no neighbour, so still no load.
    svc.getStateAt(950, -31);
    svc.getStateAt(990, -31);
    expect(loadCalls).toEqual([]);
    // boundaryStalled should stay false (current chunk WAS cached).
    expect(svc.boundaryStalled).toBe(false);
  });
});

describe('EphemerisService QA — prefetch rejection drops the URL from the dedupe Set', () => {
  it('a rejected prefetch can be retried on the next 10%-window entry', async () => {
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
    // Only chunkA is cached; chunkB is NEVER cached (peek returns undefined).
    // This forces `maybePrefetchNeighbour` to call chunkLoader.load (not the
    // peek short-circuit). The flaky-loader path then rejects the first
    // attempt, drops the URL from the dedupe Set, and allows a retry.
    const chunks = new Map<string, LoadedChunk>([['data/a.bin.br', chunkA]]);
    const { loader, loadCalls, flakeCount } = fakeChunkLoader(chunks, {
      rejectingUrls: new Set(['data/b.bin.br']),
    });
    const svc = new EphemerisService(manifest, loader);

    // Suppress the expected "prefetch failed" console.warn from the rejection.
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // First entry into trigger band — fires prefetch → rejects.
    svc.getStateAt(950, -31);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(loadCalls).toContain('data/b.bin.br');
    const firstLoadCount = loadCalls.filter((u) => u === 'data/b.bin.br').length;
    expect(firstLoadCount).toBeGreaterThanOrEqual(1);
    // flakeCount only tracks the `flakyUrls` Set, which we're not using
    // here — instead we count via loadCalls.
    void flakeCount;

    // SECOND entry into the trigger band — the dedupe Set should have
    // dropped the URL on rejection so the retry kicks again.
    svc.getStateAt(980, -31);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const secondLoadCount = loadCalls.filter((u) => u === 'data/b.bin.br').length;
    expect(secondLoadCount).toBeGreaterThan(firstLoadCount);

    consoleWarn.mockRestore();
  });
});

describe('EphemerisService QA — double-call at trigger threshold does not double-fire prefetch', () => {
  it('two calls AT triggerEt fire prefetch exactly once', () => {
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

    // triggerEt = end - 0.1 * span = 1000 - 100 = 900. Two getStateAt calls
    // at 900 (the boundary itself) MUST fire prefetch exactly once.
    svc.getStateAt(900, -31);
    svc.getStateAt(900, -31);
    const bLoads = loadCalls.filter((u) => u === 'data/b.bin.br');
    expect(bLoads.length).toBe(1);
  });
});

describe('EphemerisService QA — boundaryStalled cleared by lookup of any body', () => {
  it('a successful lookup of a different body clears the stale stall flag', () => {
    // body -31 chunk missing (stall fires); body 5 chunk present.
    const chunk5 = makeChunk({
      bodyId: 5,
      etStart: 0,
      cadence: 100,
      sampleCount: 11,
      pFn: () => [99, 0, 0],
      vFn: () => [0, 0, 0],
    });
    const manifest = makeManifest([
      { url: 'data/v1.bin.br', range: [0, 1000], cadenceSec: 100, bodyId: -31 },
      { url: 'data/jup.bin.br', range: [0, 1000], cadenceSec: 100, bodyId: 5 },
    ]);
    const chunks = new Map<string, LoadedChunk>([['data/jup.bin.br', chunk5]]);
    const { loader } = fakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);

    // First: stall on body -31 (chunk missing).
    expect(svc.getStateAt(500, -31)).toBeNull();
    expect(svc.boundaryStalled).toBe(true);
    // Then: successful lookup of body 5 clears the flag — the flag is
    // global to the service, not per-body, so the FSM sees "no stall"
    // even though body -31 is still uncached. This is the contract per
    // the getter's docstring ("Reset to false the next time `getStateAt`
    // returns a real State").
    const s = svc.getStateAt(500, 5);
    expect(s).not.toBeNull();
    expect(svc.boundaryStalled).toBe(false);
  });
});
