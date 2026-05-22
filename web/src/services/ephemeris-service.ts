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
    const candidate = idx.sortedFiles[lo];
    if (et > candidate.timeRangeEt[1]) return null;
    return candidate;
  }

  /**
   * Sync entry point. Returns the interpolated state at `et` for `bodyId`,
   * or null if the data isn't available yet (loader is fetching) or if `et`
   * is outside every segment for the body. Never throws on the hot path.
   */
  getStateAt(et: number, bodyId: number): State | null {
    const file = this.findSegmentFile(et, bodyId);
    if (file === null) return null;

    const chunk = this.chunkLoader.peek(file.url);
    if (chunk === undefined) {
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

    return interpolateFromChunk(chunk, et);
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
