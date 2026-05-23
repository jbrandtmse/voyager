// EphemerisService — runtime state-at-ET resolution (Story 1.6 AC3, AC4).
//
// Looks up the manifest entry for a given (et, bodyId), identifies the VTRJ
// chunk that covers that ET, and runs per-axis cubic Hermite interpolation
// over position + velocity.
//
// Architecture:
//   - Returns WorldVec3 (Float64-backed); the Float32 cast happens only at
//     the floating-origin recenter in render/render-engine.ts (architecture
//     lines 79, 359, 976).
//   - Hot per-frame path: if a chunk is needed but not yet loaded, this
//     service kicks off the async load and returns `null` to signal "data not
//     yet available" (architecture line 874). NEVER throws on missing data.
//   - Sync API: `getStateAt` is non-async; the only async boundary is the
//     ChunkLoader (architecture lines 874, 1221).
//
// Interpolation:
//   The bake-time grid is `linspace(et_start, et_end, sample_count)` and the
//   stored `cadenceSeconds` in the VTRJ header equals
//   `(et_end - et_start) / (sample_count - 1)` exactly (vtrj_writer +
//   bake_trajectories), so the runtime can compute the sample index as
//   `floor((et - et_start) / cadence)` and offset `dt` accordingly.

import type { ChunkLoader, LoadedChunk } from './chunk-loader';
import type { Manifest, ManifestBody, ManifestFile } from './manifest-loader';
import type { WorldVec3 } from '../types/branded';
import { worldVec3 } from '../types/branded';
import {
  hermiteInterpolatePosition,
  hermiteInterpolateVelocity,
} from '../math/hermite';

export interface State {
  readonly position: WorldVec3;
  readonly velocity: WorldVec3;
}

interface BodyIndex {
  readonly body: ManifestBody;
  // Sorted by timeRangeEt[0] ascending. Same array elements as `body.files`,
  // just reordered (often already sorted by the bake but we re-sort defensively).
  readonly sortedFiles: ReadonlyArray<ManifestFile>;
  // Parallel array: starts[i] = sortedFiles[i].timeRangeEt[0]. Used by binary
  // search; cached at construction to avoid recomputing per call.
  readonly starts: ReadonlyArray<number>;
}

export class EphemerisService {
  private readonly bodiesById = new Map<number, BodyIndex>();
  private readonly chunkLoader: ChunkLoader;
  // Track URLs whose hot-path load has already warned, so a missing chunk
  // doesn't spam the console every frame. One log per (failed) URL is enough
  // to surface 404s and SHA mismatches that would otherwise be invisible.
  private readonly warnedUrls = new Set<string>();
  // Story 4.3 AC2 — track per-body the most recently prefetched neighbour
  // URL so the 10%-of-window trigger doesn't refire the same prefetch every
  // frame inside the trigger band. Cleared on body switch (different keys).
  private readonly prefetchedNeighbourUrls = new Set<string>();
  // Story 4.3 AC2 — `boundaryStalled` is set true on a frame where the
  // requested ET falls inside a covered window but the chunk is NOT yet in
  // cache (loader fetch is inflight). `<v-speed-multiplier>` reads this to
  // auto-cap the speed to 0 until the chunk lands. Cleared on every
  // successful state lookup so the flag is a single-frame "did I miss?"
  // signal — not a sticky alarm.
  private boundaryStalledFlag = false;

  constructor(manifest: Manifest, chunkLoader: ChunkLoader) {
    this.chunkLoader = chunkLoader;
    for (const body of manifest.bodies) {
      // Story 4.0 — filter to `kind === 'trajectory'` BEFORE indexing.
      // Story 3.1 / 4.0 added `bus_attitude` + `platform_attitude` entries
      // to the same spacecraft body (NAIF -31 / -32). Including them in the
      // binary-search index causes `findSegmentFile` to pick an attitude
      // file whose start ET is closer-to-but-not-covering a queried ET,
      // returning null when a trajectory segment WAS the correct match.
      // Attitude lookups go through AttitudeService (Story 3.2), which has
      // its own per-body, per-kind index built on the same manifest.
      const trajectoryFiles = body.files.filter((f) => f.kind === 'trajectory');
      const sorted = trajectoryFiles.slice().sort(
        (a, b) => a.timeRangeEt[0] - b.timeRangeEt[0],
      );
      this.bodiesById.set(body.naifId, {
        body,
        sortedFiles: sorted,
        starts: sorted.map((f) => f.timeRangeEt[0]),
      });
    }
  }

  /**
   * Look up the manifest file that covers `et` for `bodyId`, or null if
   * `et` is outside every segment's range or `bodyId` is unknown.
   *
   * Story 4.3 AC1 — overlapping intervals: with the per-encounter cadence-
   * band chunks (hourly ±30d, 1-min ±2d, 10-sec ±1hr) layered atop the
   * per-SPK-segment baseline, multiple files may cover the same ET. We
   * pick the file with the largest `start ≤ et` that also covers `et` —
   * this naturally selects the narrowest (= finest-cadence) band whose
   * window contains et, and falls back through the wider tiers if a
   * narrower band's window has already exited.
   */
  private findSegmentFile(et: number, bodyId: number): ManifestFile | null {
    const idx = this.bodiesById.get(bodyId);
    if (idx === undefined) return null;
    if (idx.sortedFiles.length === 0) return null;
    if (et < idx.starts[0]) return null;

    // Binary-search for the largest start <= et.
    let lo = 0;
    let hi = idx.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (idx.starts[mid] <= et) lo = mid;
      else hi = mid - 1;
    }
    // Walk backward through files whose `start <= et` until one also
    // covers `et` (et <= end). This handles the Story 4.3 overlapping-
    // interval case where a narrower band's window may have exited
    // even though its start is the closest start-≤-et.
    //
    // In the steady-state (cruise / no encounter overlap) the first
    // candidate covers `et`, so the loop body runs exactly once. Worst
    // case is ~4 files inspected per encounter (per-segment + hourly +
    // 1min + 10sec stacked). Still O(log n + 4) ≈ O(log n).
    for (let i = lo; i >= 0; i--) {
      const candidate = idx.sortedFiles[i];
      if (et <= candidate.timeRangeEt[1]) return candidate;
    }
    return null;
  }

  /**
   * Story 4.3 AC2 — when `et` is inside the last 10% of the current file's
   * window, eagerly load the NEXT file in the sorted index so it's in
   * cache by the time the cursor crosses the boundary. NFR-P6 mandates
   * the prefetch trigger fires by the last 10% of the window. The
   * heuristic is conservative — we trigger any time in the last 10%, not
   * only on first entry, so a slow scrub still benefits.
   *
   * Per-body once-per-URL discipline: each neighbour URL is prefetched
   * once. The Set is bounded by the manifest's file count (small) so we
   * don't bother LRU-evicting.
   */
  private maybePrefetchNeighbour(
    et: number,
    bodyId: number,
    currentFile: ManifestFile,
  ): void {
    const idx = this.bodiesById.get(bodyId);
    if (idx === undefined) return;
    const [start, end] = currentFile.timeRangeEt;
    const span = end - start;
    if (span <= 0) return;
    const triggerEt = end - span * 0.1; // last 10% of window — NFR-P6
    if (et < triggerEt) return;

    // Find the next file whose start > currentFile.start. Linear scan is
    // fine — file counts are bounded (per-spacecraft typically < 30).
    // We look for the SMALLEST start strictly greater than the current
    // file's start; in the overlapping-interval case (Story 4.3) this
    // picks the nearest narrower band when scrubbing INTO an encounter,
    // and the next per-segment chunk when scrubbing OUT.
    let neighbour: ManifestFile | null = null;
    for (const f of idx.sortedFiles) {
      if (f.timeRangeEt[0] <= start) continue;
      if (neighbour === null || f.timeRangeEt[0] < neighbour.timeRangeEt[0]) {
        neighbour = f;
      }
    }
    if (neighbour === null) return;
    if (this.prefetchedNeighbourUrls.has(neighbour.url)) return;
    if (this.chunkLoader.peek(neighbour.url) !== undefined) {
      this.prefetchedNeighbourUrls.add(neighbour.url);
      return;
    }
    this.prefetchedNeighbourUrls.add(neighbour.url);
    void this.chunkLoader.load(neighbour).catch((err: unknown) => {
      // Prefetch failures are silently retried on the next trigger — drop
      // from the Set so the next 10%-window entry kicks another attempt.
      this.prefetchedNeighbourUrls.delete(neighbour.url);
      if (this.warnedUrls.has(neighbour.url)) return;
      this.warnedUrls.add(neighbour.url);
      // eslint-disable-next-line no-console
      console.warn(`[ephemeris] prefetch failed for ${neighbour.url}:`, err);
    });
  }

  /**
   * Sync entry point. Returns the interpolated state at `et` for `bodyId`,
   * or null if the data isn't available yet (loader is fetching) or if `et`
   * is outside every segment for the body. Never throws on the hot path.
   *
   * Story 4.3 AC2 — side effects:
   *   - Sets `boundaryStalled = true` if the queried ET is inside a covered
   *     window but the chunk is missing from cache (forces speed-multiplier
   *     auto-cap per Story 1.10 contract).
   *   - Fires `maybePrefetchNeighbour` when et is in the last 10% of the
   *     current file's window (NFR-P6 prefetch trigger).
   */
  getStateAt(et: number, bodyId: number): State | null {
    const file = this.findSegmentFile(et, bodyId);
    if (file === null) {
      // ET is outside every segment for the body — not a stall, just out
      // of bounds. Don't set boundaryStalled (the speed-multiplier
      // shouldn't auto-cap for "we're outside the mission window").
      return null;
    }

    const chunk = this.chunkLoader.peek(file.url);
    if (chunk === undefined) {
      // Story 4.3 AC2 — the simulation reached a covered window's boundary
      // before the chunk loaded. Set boundaryStalled so the speed
      // multiplier auto-caps; the next successful lookup clears it.
      this.boundaryStalledFlag = true;
      // Kick off the load asynchronously; subsequent frames will see the
      // cached chunk and return real data. ChunkLoader.load doesn't itself
      // log on failure (it just rejects), and the hot-path caller doesn't
      // await — so without a one-shot warning here, integrity violations
      // and 404s would be invisible. ClockManager (Story 1.10) drives the
      // retry policy via the subscribe() observable.
      void this.chunkLoader.load(file).catch((err: unknown) => {
        if (this.warnedUrls.has(file.url)) return;
        this.warnedUrls.add(file.url);
        // eslint-disable-next-line no-console
        console.warn(`[ephemeris] chunk load failed for ${file.url}:`, err);
      });
      return null;
    }

    // Story 4.3 AC2 — successful lookup clears the stall flag and fires
    // the 10%-prefetch trigger if applicable.
    this.boundaryStalledFlag = false;
    this.maybePrefetchNeighbour(et, bodyId, file);

    return interpolateFromChunk(chunk, et);
  }

  /**
   * Story 4.3 AC2 — `true` iff the most recent `getStateAt` call resolved
   * a covered file but the chunk was not yet in cache. Read by the
   * `<v-speed-multiplier>` consumer (or by ClockManager wiring) to
   * auto-cap the speed to 0 until the chunk lands. Reset to false the
   * next time `getStateAt` returns a real State.
   *
   * Cross-reference: `ChunkLoader.loading` (Story 1.6) reports whether
   * ANY chunk is inflight; this flag is narrower — it specifically says
   * "the chunk the per-frame loop wants RIGHT NOW is missing." The
   * speed-multiplier auto-cap watches both: `loading` for "background
   * prefetch in flight, don't accelerate" and `boundaryStalled` for
   * "the visible scene cannot render until I get this chunk."
   */
  get boundaryStalled(): boolean {
    return this.boundaryStalledFlag;
  }

  getPosition(et: number, bodyId: number): WorldVec3 | null {
    const s = this.getStateAt(et, bodyId);
    return s === null ? null : s.position;
  }

  getVelocity(et: number, bodyId: number): WorldVec3 | null {
    const s = this.getStateAt(et, bodyId);
    return s === null ? null : s.velocity;
  }

  /**
   * Returns true if the chunk covering `et` for `bodyId` is already cached.
   * Useful for tests and for `?perf=ephemeris` (which needs to warm the
   * cache before measuring).
   */
  isChunkCachedFor(et: number, bodyId: number): boolean {
    const file = this.findSegmentFile(et, bodyId);
    if (file === null) return false;
    return this.chunkLoader.peek(file.url) !== undefined;
  }

  /**
   * Eagerly load the chunk covering `et` for `bodyId`. Returns a promise that
   * resolves once the chunk is in cache, or rejects on load failure. Returns
   * null if `et` is out of range or `bodyId` unknown.
   */
  prefetchChunkFor(et: number, bodyId: number): Promise<LoadedChunk> | null {
    const file = this.findSegmentFile(et, bodyId);
    if (file === null) return null;
    return this.chunkLoader.load(file);
  }
}

// Pure interpolation core, exported for unit tests and the perf harness so
// tests can feed a hand-built LoadedChunk without standing up a ChunkLoader.
export const interpolateFromChunk = (chunk: LoadedChunk, et: number): State => {
  const { header, samples } = chunk;
  const cadence = header.cadenceSeconds;
  // Clamp into the segment's valid domain. Per AC3 the EphemerisService rejects
  // out-of-range queries upstream via segment-file lookup, so any call reaching
  // this function is in-range — but we still defensively clamp inside the
  // last interval to handle exact-end boundary queries.
  const lastIndex = header.sampleCount - 1;
  const offset = et - header.etStart;
  let i = Math.floor(offset / cadence);
  if (i < 0) i = 0;
  if (i >= lastIndex) i = lastIndex - 1;

  const base = i * 6;
  const next = (i + 1) * 6;
  const p0x = samples[base + 0];
  const p0y = samples[base + 1];
  const p0z = samples[base + 2];
  const v0x = samples[base + 3];
  const v0y = samples[base + 4];
  const v0z = samples[base + 5];
  const p1x = samples[next + 0];
  const p1y = samples[next + 1];
  const p1z = samples[next + 2];
  const v1x = samples[next + 3];
  const v1y = samples[next + 4];
  const v1z = samples[next + 5];

  const dt = offset - i * cadence;

  const px = hermiteInterpolatePosition(p0x, p1x, v0x, v1x, dt, cadence);
  const py = hermiteInterpolatePosition(p0y, p1y, v0y, v1y, dt, cadence);
  const pz = hermiteInterpolatePosition(p0z, p1z, v0z, v1z, dt, cadence);
  const vx = hermiteInterpolateVelocity(p0x, p1x, v0x, v1x, dt, cadence);
  const vy = hermiteInterpolateVelocity(p0y, p1y, v0y, v1y, dt, cadence);
  const vz = hermiteInterpolateVelocity(p0z, p1z, v0z, v1z, dt, cadence);

  return {
    position: worldVec3(px, py, pz),
    velocity: worldVec3(vx, vy, vz),
  };
};
