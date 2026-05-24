/**
 * Marker clustering library — Story 6.2 AC5 (BUG-E5-009 residual).
 *
 * Computes which chapter-marker labels overlap on a timeline-scrubber
 * track and collapses each overlapping pair into a dual-marker rendered
 * at the midpoint anchor of the two contributing markers.
 *
 * ## Contract
 *
 * `clusterMarkers(markers, trackWidthPx, labelEstimator)` takes:
 *
 *   - `markers`: an ascending-by-fraction array of marker descriptors.
 *     Each marker carries an `id` (caller-defined, opaque), a `label`
 *     string, a `fraction` ∈ [0, 1] (track position), and an arbitrary
 *     `data` payload (caller threads through whatever they need — for
 *     `<v-timeline-scrubber>` this carries the `ChapterSpec`).
 *
 *   - `trackWidthPx`: pixel width of the scrubber track. Used to convert
 *     the label width estimator (in pixels) into a fractional overlap
 *     check.
 *
 *   - `labelEstimator`: pure function `(label: string) => number` that
 *     returns the estimated pixel width of the label. Typical impl:
 *     `(s) => s.length * 6 + 8` (monospace char-width × name.length +
 *     padding). Pure-function dependency-injection so tests can pass a
 *     deterministic estimator without touching DOM measurement.
 *
 * Returns an array of `ClusteredMarker`s. Each element is either:
 *
 *   - A "single" cluster carrying ONE original marker — same `id`,
 *     `label`, `fraction`, `data` as the input. `members.length === 1`.
 *
 *   - A "dual" cluster carrying TWO original markers — `id` is a
 *     stable combination of the contributing markers' ids; `label` is
 *     the contributing labels joined with " / "; `fraction` is the
 *     midpoint of the two contributing fractions; `members.length === 2`
 *     (the original markers preserved in input order).
 *
 * The pass is single-sweep O(n): walk the ascending-sorted input, peek
 * at the next marker, and emit either a single (no overlap) or a dual
 * (overlap with next). After emitting a dual, advance two; otherwise
 * advance one. This is INTENTIONALLY simple — it handles pairwise
 * collisions (the four known clusters: V2L/V1L, V1J/V2J, V1S/V2S,
 * V2N/PBD) without trying to handle triple-overlaps. Three+ -way
 * collisions on Voyager's chapter set are out of scope (none exist
 * today and the deferred-work routing notes that future zoom variants
 * inherit the same algorithm — if a triple appears later, this lib is
 * the place to evolve).
 *
 * ## Overlap detection
 *
 * Two markers overlap when the pixel-rectangle of the LEFT marker's
 * label extends past the start of the RIGHT marker's label. Each label
 * is centred on its marker's anchor (translateX(-50%) in CSS), so the
 * label spans `[fraction - widthPx/2/trackWidthPx, fraction +
 * widthPx/2/trackWidthPx]` in fractional units. Two such ranges
 * overlap iff `right.start < left.end`, i.e.:
 *
 *   right.fraction - rightW/2 < left.fraction + leftW/2
 *
 * Solving:
 *
 *   right.fraction - left.fraction < (leftW + rightW) / 2 / trackWidthPx
 *
 * The right-hand side is the minimum non-overlapping fractional gap.
 *
 * ## Non-knowledge of specific clusters
 *
 * Per the story's Dev Notes: the function MUST NOT have hardcoded
 * knowledge of the four known clusters. It computes from positions and
 * label widths. The four known clusters happen to be the ones that
 * collapse today; if a future scrubber zoom level (mission vs detail
 * vs a hypothetical decadal-pan variant) renders the same markers at a
 * different pixel scale, the same function naturally clusters or
 * unclusters them based on the input pixel width.
 *
 * ## Stable IDs
 *
 * Dual cluster ids are formatted as ``${leftId}+${rightId}`` so the
 * scrubber's marker render keying remains deterministic across
 * re-renders. Single cluster ids pass through unchanged.
 */

/** Single marker descriptor — input shape. */
export interface MarkerDescriptor<T = unknown> {
  /** Caller-defined opaque identifier (e.g. chapter slug). */
  readonly id: string;
  /** The label rendered next to the marker (e.g. chapter.markerLabel). */
  readonly label: string;
  /**
   * Position along the track, in [0, 1]. Markers MUST be supplied in
   * ascending-fraction order — the algorithm is single-sweep and does
   * not sort defensively.
   */
  readonly fraction: number;
  /**
   * Caller-threaded payload — opaque to the clustering lib. The
   * scrubber will use this to carry the full `ChapterSpec` so the
   * dual cluster can fire `chapter-jump` events for either contributor.
   */
  readonly data: T;
}

/** A clustered output — either a single marker or a dual collapse. */
export interface ClusteredMarker<T = unknown> {
  /** Stable id; single passes through, dual is `${leftId}+${rightId}`. */
  readonly id: string;
  /** Render label; dual is `${leftLabel} / ${rightLabel}`. */
  readonly label: string;
  /** Render position; dual is midpoint of the two contributors. */
  readonly fraction: number;
  /** One element for single, two (in input order) for dual. */
  readonly members: readonly MarkerDescriptor<T>[];
}

/**
 * Estimator function signature — returns label width in pixels. Tests
 * inject a deterministic one (e.g. `(s) => s.length * 6`); the scrubber
 * in production passes a function that knows the rendered font metrics
 * (monospace + uppercase + a small padding constant).
 */
export type LabelWidthEstimator = (label: string) => number;

/**
 * Cluster overlapping markers on a single pairwise sweep.
 *
 * Preconditions:
 *   - `markers` is sorted ascending by `fraction`.
 *   - `trackWidthPx > 0`.
 *
 * If `trackWidthPx <= 0` the function returns single-clusters for every
 * input (no overlap possible on a zero-width track), so callers can pass
 * in pre-mount layouts without special-casing.
 */
export const clusterMarkers = <T>(
  markers: readonly MarkerDescriptor<T>[],
  trackWidthPx: number,
  labelEstimator: LabelWidthEstimator,
): ClusteredMarker<T>[] => {
  const out: ClusteredMarker<T>[] = [];
  if (markers.length === 0) return out;
  if (trackWidthPx <= 0) {
    for (const m of markers) {
      out.push({ id: m.id, label: m.label, fraction: m.fraction, members: [m] });
    }
    return out;
  }
  let i = 0;
  while (i < markers.length) {
    const left = markers[i];
    const next = i + 1 < markers.length ? markers[i + 1] : null;
    if (next !== null && markersOverlap(left, next, trackWidthPx, labelEstimator)) {
      const midFrac = (left.fraction + next.fraction) / 2;
      out.push({
        id: `${left.id}+${next.id}`,
        label: `${left.label} / ${next.label}`,
        fraction: midFrac,
        members: [left, next],
      });
      i += 2;
    } else {
      out.push({
        id: left.id,
        label: left.label,
        fraction: left.fraction,
        members: [left],
      });
      i += 1;
    }
  }
  return out;
};

/**
 * Pairwise overlap predicate. Two markers overlap iff their centred
 * labels' fractional ranges intersect:
 *
 *   right.fraction - left.fraction < (leftW + rightW) / 2 / trackWidthPx
 *
 * Equivalent: convert both halves to fractional units and ask whether
 * the right label's left edge is less than the left label's right edge.
 *
 * Exported for unit-test introspection; not part of the public clustering
 * surface (callers should use `clusterMarkers`).
 */
export const markersOverlap = <T>(
  left: MarkerDescriptor<T>,
  right: MarkerDescriptor<T>,
  trackWidthPx: number,
  labelEstimator: LabelWidthEstimator,
): boolean => {
  if (trackWidthPx <= 0) return false;
  const leftW = labelEstimator(left.label);
  const rightW = labelEstimator(right.label);
  // Centred labels: each spans ±half on each side. Two centred ranges
  // overlap iff the gap between centres is less than the sum of half-
  // widths.
  const fracGap = right.fraction - left.fraction;
  const minNonOverlapFrac = (leftW + rightW) / 2 / trackWidthPx;
  return fracGap < minNonOverlapFrac;
};

/**
 * Default label-width estimator suitable for `--v-font-mono` at the
 * scrubber's `--v-size-hud-mono-sm` (≈ 11–13 px) with uppercase letters.
 * Approximates each character at 6.5 px and adds 8 px (one `--v-space-2`)
 * of padding. Used by `<v-timeline-scrubber>` in production; tests pass
 * a simpler estimator (e.g. character-count × 6) for deterministic
 * assertions.
 *
 * This estimator is intentionally a heuristic — the alternative (mount
 * each label, read getBoundingClientRect()) would force a layout pass
 * every render. The 6.5-px-per-character constant matches JetBrains
 * Mono's measured em-width at the size token, padded by `--v-space-2`
 * to absorb minor sub-pixel jitter.
 */
export const defaultLabelWidthPx: LabelWidthEstimator = (label: string): number =>
  label.length * 6.5 + 8;
