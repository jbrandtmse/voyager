// Dev-mode ephemeris perf harness (Story 1.6 AC5).
//
// Gated on `?perf=ephemeris`. Loads the manifest, warms every V1 + V2 chunk,
// then drives EphemerisService.getStateAt at varying ETs and reports median,
// p95, p99 per-call cost. NFR-P7 target is 1 ms median for 12 bodies; with
// only V1 + V2 we assert a proportional 0.2 ms target (the full 12-body
// measurement re-runs in Story 1.13).
//
// The harness renders results to a `<pre>` block (no rich UI; this is a dev
// surface). Logged + asserted via the unit-test surface `runEphemerisPerf`,
// which is exercised against a deterministic in-memory chunk.

import type { ChunkLoader } from '../services/chunk-loader';
import type { Manifest } from '../services/manifest-loader';
import { EphemerisService, interpolateFromChunk } from '../services/ephemeris-service';

export interface PerfStats {
  body: string;
  naifId: number;
  iterations: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
}

export const isEphemerisPerfMode = (perfMode: string | null): boolean =>
  perfMode === 'ephemeris';

/**
 * Run the perf loop against a single body. `etSampler(i)` produces the ET for
 * iteration `i` — sweep across the segment domain so chunk-swap costs are
 * exercised. `service.getStateAt` must return a non-null state for every ET
 * sampled (caller warms the cache first).
 */
export const runEphemerisPerf = (
  service: EphemerisService,
  naifId: number,
  bodyName: string,
  etSampler: (i: number) => number,
  iterations: number,
): PerfStats => {
  const timings = new Float64Array(iterations);
  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? () => performance.now()
      : () => Date.now();

  // Warm-up: a small number of un-timed iterations so first-call JIT noise
  // doesn't pollute the timing distribution.
  const warmups = Math.min(50, iterations);
  for (let i = 0; i < warmups; i++) {
    service.getStateAt(etSampler(i), naifId);
  }

  for (let i = 0; i < iterations; i++) {
    const et = etSampler(i);
    const t0 = now();
    service.getStateAt(et, naifId);
    const t1 = now();
    timings[i] = t1 - t0;
  }
  // Sort once; pick percentiles by index.
  const sorted = Array.from(timings).sort((a, b) => a - b);
  const pick = (q: number): number => {
    const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
    return sorted[idx];
  };
  const mean = sorted.reduce((acc, v) => acc + v, 0) / sorted.length;
  return {
    body: bodyName,
    naifId,
    iterations,
    medianMs: pick(0.5),
    p95Ms: pick(0.95),
    p99Ms: pick(0.99),
    meanMs: mean,
  };
};

/**
 * Boot-time entry point: load manifest, warm all chunks, run the perf loop
 * for V1 + V2, and append a `<pre>` block to the DOM with the results.
 *
 * Throws if the manifest / chunks fail to load — the user sees a stack trace
 * in the dev console (no friendly UI for this surface).
 */
export const startEphemerisPerfHarness = async (
  manifest: Manifest,
  chunkLoader: ChunkLoader,
  iterations = 1000,
): Promise<PerfStats[]> => {
  const svc = new EphemerisService(manifest, chunkLoader);
  const stats: PerfStats[] = [];

  for (const body of manifest.bodies) {
    // Warm: load every segment for this body.
    for (const file of body.files) {
      await chunkLoader.load(file);
    }
    // Build an ET sampler that walks the segment range.
    const firstEt = body.files[0].timeRangeEt[0] + 1.0;
    const lastEt = body.files[body.files.length - 1].timeRangeEt[1] - 1.0;
    const span = lastEt - firstEt;
    const etSampler = (i: number): number => firstEt + (i / iterations) * span;
    const stat = runEphemerisPerf(svc, body.naifId, body.name, etSampler, iterations);
    stats.push(stat);
  }

  if (typeof document !== 'undefined') {
    const block = document.createElement('pre');
    block.style.position = 'fixed';
    block.style.top = '8px';
    block.style.left = '8px';
    block.style.padding = '8px';
    block.style.background = 'rgba(0, 0, 0, 0.75)';
    block.style.color = '#0f0';
    block.style.fontFamily = 'monospace';
    block.style.fontSize = '12px';
    block.style.zIndex = '9999';
    const lines: string[] = [];
    lines.push('?perf=ephemeris (Story 1.6 AC5)');
    lines.push(`iterations per body: ${iterations}`);
    lines.push('');
    for (const s of stats) {
      lines.push(
        `${s.body} (NAIF ${s.naifId}):  median=${s.medianMs.toFixed(4)} ms` +
          `  p95=${s.p95Ms.toFixed(4)} ms` +
          `  p99=${s.p99Ms.toFixed(4)} ms` +
          `  mean=${s.meanMs.toFixed(4)} ms`,
      );
    }
    lines.push('');
    lines.push(
      'NFR-P7 target: 1 ms median for 12 bodies. With only V1+V2 the' +
        ' proportional gate is 0.2 ms. The 12-body measurement re-runs in Story 1.13.',
    );
    block.textContent = lines.join('\n');
    document.body.appendChild(block);
  }

  return stats;
};

// Exposed for the perf-harness assertion test (so we can drive the math
// against a synthetic in-memory chunk without standing up a fetch + zlib
// pipeline). The CI gate runs the assertion through this entry point.
export const __test = { interpolateFromChunk };
