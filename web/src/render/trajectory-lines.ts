/**
 * Trajectory polylines for V1 + V2 (Story 1.12).
 *
 * Each spacecraft owns two `Line2` instances rendered with `LineMaterial`:
 *   - past line: solid, ~1.5 px screen-space, bright color
 *     (`var(--v-color-trajectory-past)`)
 *   - future line: dashed, ~1.0 px screen-space, dim color
 *     (`var(--v-color-trajectory-future)`)
 *
 * The full per-spacecraft polyline is sampled ONCE at construction from a
 * coarse ET grid by calling a position-provider closure injected via the
 * caller (real callers pass `EphemerisService.getStateAt`). The vertex
 * count is fixed at construction; the per-frame `tick(et)` only updates
 * which prefix of the polyline is "past" vs "future" and the position of
 * the split-vertex (the spacecraft's current position).
 *
 * AC6 perf constraint — no `BufferGeometry.dispose()` is ever called on
 * the per-frame path. We achieve this by re-invoking `LineGeometry.setPositions`
 * with a number[] computed in-place: Three.js internally creates a fresh
 * `Float32Array` and a fresh `InstancedInterleavedBuffer`, but never calls
 * `.dispose()` on the prior attribute. The dropped attribute becomes
 * unreferenced and is GC'd; no GPU-resource leak. The defense test
 * `web/tests/trajectory-no-dispose.test.ts` spies on
 * `BufferGeometry.prototype.dispose` and asserts zero calls over 100 ticks.
 *
 * Backward-scrub handling: `tick(et)` is fully idempotent in `et`. Jumping
 * backward in time re-runs the same split-computation; the past line
 * shrinks rather than grows, and the future line grows. No special-case
 * "scrub event" handling is needed at this layer.
 *
 * Float32 leakage: this module never constructs a Float32 typed array
 * directly. All position data is staged in a `number[]` (which Three.js
 * then adopts via `setPositions`). The Float64-to-Float32 cast happens
 * implicitly inside Three when it builds its internal typed-array
 * attribute; from this module's perspective every coordinate stays in
 * JS-number (Float64) until it crosses the Three boundary.
 */

import { Color, type Object3D } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Group } from 'three';

import type { WorldVec3 } from '../types/branded';
import { V1_LAUNCH_ET, V2_LAUNCH_ET, MISSION_END_ET } from '../constants/mission';

/**
 * Total vertices per spacecraft trajectory polyline (past + future combined).
 * The split-point between past and future moves as `et` advances, but the
 * total vertex count is fixed for the life of the TrajectoryLines instance.
 * This lets us pre-allocate the position buffers at construction.
 */
export const VERTICES_PER_SPACECRAFT_TRAJECTORY = 500;

const V1_NAIF_ID = -31;
const V2_NAIF_ID = -32;

const FALLBACK_PAST_COLOR = '#e8eaed';
const FALLBACK_FUTURE_COLOR = '#5f6368';

// BUG-CR-004 fix (2026-05-25): bumped both line widths from
// past=1.5 / future=1.0 to past=2.0 / future=1.5 to absorb sub-pixel
// rasterization jitter when the floating-origin recenters per frame. At
// 1.0 px a thin line straddling pixel boundaries flickers visibly on/off
// frame-to-frame at GPU/AA levels that don't supersample thin geometry.
// Bumping both preserves the past > future width relationship (FR49
// non-color-only encoding) while keeping the rasterized footprint stable.
const PAST_LINE_WIDTH_PX = 2.0;
const FUTURE_LINE_WIDTH_PX = 1.5;
const FUTURE_DASH_SIZE = 0.5;
const FUTURE_GAP_SIZE = 0.3;

/**
 * Position-provider closure. Real callers pass
 * `(et, naifId) => ephemeris.getStateAt(et, naifId)?.position ?? null`.
 * Tests pass a synthetic implementation.
 */
export type PositionProvider = (et: number, naifId: number) => WorldVec3 | null;

export interface TrajectoryLinesOptions {
  /** Initial render-buffer width in CSS px. Updated via `setResolution`. */
  width?: number;
  /** Initial render-buffer height in CSS px. */
  height?: number;
  /** Override the past-line color (CSS color string). Defaults to token. */
  pastColorOverride?: string;
  /** Override the future-line color. */
  futureColorOverride?: string;
}

interface SpacecraftLineSet {
  readonly naifId: number;
  readonly launchEt: number;
  readonly pastLine: Line2;
  readonly futureLine: Line2;
  readonly pastMaterial: LineMaterial;
  readonly futureMaterial: LineMaterial;
  /**
   * Pre-sampled full-mission polyline vertices [x,y,z, x,y,z, ...] in km
   * (J2000 ecliptic). Length = VERTICES_PER_SPACECRAFT_TRAJECTORY * 3.
   * Built once at construction; never mutated except by re-construction.
   */
  readonly sampledPositions: number[];
  /** Parallel array: ET corresponding to each sampled vertex. */
  readonly sampledEts: number[];
}

export class TrajectoryLines {
  readonly root: Group;
  private readonly v1: SpacecraftLineSet;
  private readonly v2: SpacecraftLineSet;
  private readonly pastColor: Color;
  private readonly futureColor: Color;

  constructor(provider: PositionProvider, options: TrajectoryLinesOptions = {}) {
    this.root = new Group();
    this.root.name = 'TrajectoryLines';

    const width = options.width ?? 1;
    const height = options.height ?? 1;

    this.pastColor = new Color(
      options.pastColorOverride ?? readCssVar('--v-color-trajectory-past', FALLBACK_PAST_COLOR),
    );
    this.futureColor = new Color(
      options.futureColorOverride ??
        readCssVar('--v-color-trajectory-future', FALLBACK_FUTURE_COLOR),
    );

    this.v1 = this.buildSet(
      'voyager-1',
      V1_NAIF_ID,
      V1_LAUNCH_ET,
      provider,
      width,
      height,
    );
    this.v2 = this.buildSet(
      'voyager-2',
      V2_NAIF_ID,
      V2_LAUNCH_ET,
      provider,
      width,
      height,
    );

    this.root.add(this.v1.pastLine, this.v1.futureLine);
    this.root.add(this.v2.pastLine, this.v2.futureLine);
  }

  /**
   * Update past/future geometry to reflect the current simulation ET.
   *
   * Idempotent in `et` — jumping backward in time re-runs the same split
   * and naturally shrinks the past line. No `BufferGeometry.dispose()`
   * call ever occurs.
   */
  tick(et: number): void {
    this.updateSet(this.v1, et);
    this.updateSet(this.v2, et);
  }

  /**
   * Update LineMaterial.resolution for both spacecraft. Call from the
   * render engine's window-resize handler.
   */
  setResolution(width: number, height: number): void {
    this.v1.pastMaterial.resolution.set(width, height);
    this.v1.futureMaterial.resolution.set(width, height);
    this.v2.pastMaterial.resolution.set(width, height);
    this.v2.futureMaterial.resolution.set(width, height);
  }

  /** Test helper — expose internal sets so tests can assert vertex counts. */
  _peekSet(id: 'voyager-1' | 'voyager-2'): SpacecraftLineSet {
    return id === 'voyager-1' ? this.v1 : this.v2;
  }

  private buildSet(
    id: 'voyager-1' | 'voyager-2',
    naifId: number,
    launchEt: number,
    provider: PositionProvider,
    width: number,
    height: number,
  ): SpacecraftLineSet {
    const { positions, ets } = sampleFullPolyline(
      provider,
      naifId,
      launchEt,
      MISSION_END_ET,
      VERTICES_PER_SPACECRAFT_TRAJECTORY,
    );

    const pastMaterial = new LineMaterial({
      color: this.pastColor,
      linewidth: PAST_LINE_WIDTH_PX,
      dashed: false,
      transparent: true,
      worldUnits: false,
    });
    pastMaterial.resolution.set(width, height);

    const futureMaterial = new LineMaterial({
      color: this.futureColor,
      linewidth: FUTURE_LINE_WIDTH_PX,
      dashed: true,
      dashSize: FUTURE_DASH_SIZE,
      gapSize: FUTURE_GAP_SIZE,
      transparent: true,
      worldUnits: false,
    });
    futureMaterial.resolution.set(width, height);

    const pastGeometry = new LineGeometry();
    const futureGeometry = new LineGeometry();

    // Seed both lines with a degenerate single-segment polyline (zero-length).
    // The first tick(et) will replace this with the real split.
    const seed: number[] = [
      positions[0],
      positions[1],
      positions[2],
      positions[0],
      positions[1],
      positions[2],
    ];
    pastGeometry.setPositions(seed);
    futureGeometry.setPositions(seed);

    const pastLine = new Line2(pastGeometry, pastMaterial);
    pastLine.name = `${id}-past`;
    pastLine.computeLineDistances();

    const futureLine = new Line2(futureGeometry, futureMaterial);
    futureLine.name = `${id}-future`;
    futureLine.computeLineDistances();

    return {
      naifId,
      launchEt,
      pastLine,
      futureLine,
      pastMaterial,
      futureMaterial,
      sampledPositions: positions,
      sampledEts: ets,
    };
  }

  /**
   * Compute and write the past+future positions for one spacecraft at `et`.
   *
   * Strategy:
   *   - Find the index `k` in `sampledEts` such that `sampledEts[k] <= et < sampledEts[k+1]`.
   *   - The past polyline is `sampledPositions[0..k]` plus the interpolated
   *     spacecraft position at `et` (the split vertex).
   *   - The future polyline starts at that same split vertex, then continues
   *     `sampledPositions[k+1..end]`.
   *   - If `et` is at or after `MISSION_END_ET`, the future line collapses
   *     to a zero-length segment at the final sample.
   *   - If `et` is at or before launch, the past line collapses to a
   *     zero-length segment at the launch sample.
   */
  private updateSet(set: SpacecraftLineSet, et: number): void {
    const { sampledEts, sampledPositions, launchEt, pastLine, futureLine } = set;
    const n = sampledEts.length;

    // Clamp et into the sample domain. AC8: pre-launch → both lines degenerate
    // at launch sample; post-mission-end → degenerate at end.
    if (et <= launchEt) {
      const seed = [
        sampledPositions[0],
        sampledPositions[1],
        sampledPositions[2],
        sampledPositions[0],
        sampledPositions[1],
        sampledPositions[2],
      ];
      pastLine.geometry.setPositions(seed);
      pastLine.computeLineDistances();
      futureLine.geometry.setPositions(sampledPositions.slice());
      futureLine.computeLineDistances();
      return;
    }
    if (et >= sampledEts[n - 1]) {
      pastLine.geometry.setPositions(sampledPositions.slice());
      pastLine.computeLineDistances();
      const lastX = sampledPositions[(n - 1) * 3];
      const lastY = sampledPositions[(n - 1) * 3 + 1];
      const lastZ = sampledPositions[(n - 1) * 3 + 2];
      futureLine.geometry.setPositions([
        lastX,
        lastY,
        lastZ,
        lastX,
        lastY,
        lastZ,
      ]);
      futureLine.computeLineDistances();
      return;
    }

    // Locate split index k: largest k with sampledEts[k] <= et.
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (sampledEts[mid] <= et) lo = mid;
      else hi = mid - 1;
    }
    const k = lo;

    // Linear interpolation between sample k and k+1 for the split vertex.
    // Hermite would be marginally smoother but the sample density (~500 over
    // 53 years ≈ 1 sample per 39 days) makes linear visually indistinguishable
    // at cruise zoom.
    const t = (et - sampledEts[k]) / (sampledEts[k + 1] - sampledEts[k]);
    const baseK = k * 3;
    const baseK1 = (k + 1) * 3;
    const splitX = sampledPositions[baseK] + t * (sampledPositions[baseK1] - sampledPositions[baseK]);
    const splitY = sampledPositions[baseK + 1] +
      t * (sampledPositions[baseK1 + 1] - sampledPositions[baseK + 1]);
    const splitZ = sampledPositions[baseK + 2] +
      t * (sampledPositions[baseK1 + 2] - sampledPositions[baseK + 2]);

    // Past = [sample 0 .. sample k] + split vertex. k+2 vertices total.
    const pastArr: number[] = new Array((k + 2) * 3);
    for (let i = 0; i < (k + 1) * 3; i++) pastArr[i] = sampledPositions[i];
    pastArr[(k + 1) * 3] = splitX;
    pastArr[(k + 1) * 3 + 1] = splitY;
    pastArr[(k + 1) * 3 + 2] = splitZ;
    pastLine.geometry.setPositions(pastArr);
    pastLine.computeLineDistances();

    // Future = split vertex + [sample k+1 .. sample n-1]. n-k vertices total.
    const futureCount = n - k; // split + (n - k - 1) samples
    const futureArr: number[] = new Array(futureCount * 3);
    futureArr[0] = splitX;
    futureArr[1] = splitY;
    futureArr[2] = splitZ;
    for (let i = 0; i < n - k - 1; i++) {
      const srcBase = (k + 1 + i) * 3;
      const dstBase = (i + 1) * 3;
      futureArr[dstBase] = sampledPositions[srcBase];
      futureArr[dstBase + 1] = sampledPositions[srcBase + 1];
      futureArr[dstBase + 2] = sampledPositions[srcBase + 2];
    }
    futureLine.geometry.setPositions(futureArr);
    futureLine.computeLineDistances();
  }
}

/**
 * Sample the full mission polyline for `naifId` from `launchEt` to `endEt`
 * into a `count`-vertex flat number[] (xyz interleaved).
 *
 * If the provider returns `null` at any sample point, that vertex inherits
 * the previous valid position (or `[0,0,0]` if no prior valid sample). This
 * keeps the buffer length stable for the no-dispose contract: a partial
 * load won't trigger geometry re-allocation, just a less-smooth polyline
 * that fixes itself once subsequent chunks land. Story 1.12 doesn't
 * require live re-sampling — the polyline is built once at construction
 * time when (in production) the manifest + initial chunks have already
 * been fetched by `first-paint.ts`.
 */
const sampleFullPolyline = (
  provider: PositionProvider,
  naifId: number,
  launchEt: number,
  endEt: number,
  count: number,
): { positions: number[]; ets: number[] } => {
  const positions: number[] = new Array(count * 3);
  const ets: number[] = new Array(count);
  let lastX = 0;
  let lastY = 0;
  let lastZ = 0;
  let hasValid = false;
  const step = (endEt - launchEt) / (count - 1);
  for (let i = 0; i < count; i++) {
    const et = launchEt + i * step;
    ets[i] = et;
    const p = provider(et, naifId);
    if (p !== null) {
      lastX = p[0];
      lastY = p[1];
      lastZ = p[2];
      hasValid = true;
    }
    if (!hasValid) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    } else {
      positions[i * 3] = lastX;
      positions[i * 3 + 1] = lastY;
      positions[i * 3 + 2] = lastZ;
    }
  }
  return { positions, ets };
};

const readCssVar = (name: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  const root = document.documentElement;
  if (!root) return fallback;
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
};

// Re-export for downstream wiring.
export type TrajectoryLinesRoot = Object3D;
