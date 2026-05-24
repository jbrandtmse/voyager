// @vitest-environment node
/**
 * Story 6.2 AC5 — additional QA coverage for marker-clustering edge
 * cases beyond the per-component unit + integration tests.
 *
 * The parent QA prompt flagged the following gaps:
 *
 *   Gap 3a — zero markers (already covered in marker-cluster.test.ts;
 *     re-asserted here for parity).
 *   Gap 3b — single marker (already covered; re-asserted here).
 *   Gap 3c — all-overlapping markers (3+ way collision; the lib's
 *     intentional pairwise sweep handles these by clustering pair-wise
 *     and leaving the third as a single, but the boundary needs an
 *     explicit test so a future contributor doesn't regress to a
 *     "cluster all overlapping" semantic without thinking about the
 *     order-sensitivity).
 *   Gap 3d — asymmetric label widths (e.g. "A" vs "VERYLONGCHAPTER"):
 *     overlap should be driven by the SUM of half-widths, not by either
 *     alone.
 *
 * Plus a few defensive scenarios discovered while reading the lib:
 *
 *   Gap 3e — already-clustered output should be IDempotent under
 *     repeated clustering passes (clustering(clusters) === clusters; we
 *     can't run this directly since clusters aren't MarkerDescriptors,
 *     but we can assert: re-running with the SAME inputs yields the
 *     SAME output, no off-by-one in `i += 2`).
 *   Gap 3f — markers at the SAME fraction (degenerate but valid)
 *     should cluster regardless of label widths.
 *   Gap 3g — negative fractions and fractions > 1 — out-of-bounds is
 *     not the lib's contract but it must not crash; verify
 *     deterministic behaviour.
 */
import { describe, it, expect } from 'vitest';
import {
  clusterMarkers,
  markersOverlap,
  defaultLabelWidthPx,
  type MarkerDescriptor,
} from '../src/lib/marker-cluster';

const m = (
  id: string,
  fraction: number,
  label: string = id,
): MarkerDescriptor<string> => ({ id, fraction, label, data: id });

// 10 px per char, no padding — easy mental arithmetic.
const tenPxPerChar = (s: string): number => s.length * 10;

describe('marker-cluster edge cases — zero / single (parity)', () => {
  it('zero markers → []', () => {
    expect(clusterMarkers([], 100, tenPxPerChar)).toEqual([]);
  });

  it('single marker → single cluster, members=[marker]', () => {
    const r = clusterMarkers([m('only', 0.5, 'X')], 100, tenPxPerChar);
    expect(r).toHaveLength(1);
    expect(r[0]!.members).toHaveLength(1);
    expect(r[0]!.members[0]!.id).toBe('only');
  });
});

describe('marker-cluster edge cases — all-overlapping (3+ way collisions)', () => {
  it('3 mutually-overlapping markers: first pair clusters, third stays single', () => {
    // All three within tight fractional gap < threshold.
    const markers = [
      m('A', 0.40, 'AA'), // half-width = 10 px = 0.10 frac
      m('B', 0.45, 'BB'),
      m('C', 0.50, 'CC'),
    ];
    // Threshold (per pair): (20+20)/2/100 = 0.20. Each gap is 0.05.
    // The single-sweep algorithm collapses A+B (advance 2), then C is
    // left as a single — even though C would have overlapped with B
    // had B not been consumed. This is the documented intentional
    // pairwise-only behavior.
    const r = clusterMarkers(markers, 100, tenPxPerChar);
    expect(r).toHaveLength(2);
    expect(r[0]!.id).toBe('A+B');
    expect(r[0]!.members).toHaveLength(2);
    expect(r[1]!.id).toBe('C');
    expect(r[1]!.members).toHaveLength(1);
  });

  it('4 mutually-overlapping markers: two adjacent pairs cluster (A+B, C+D)', () => {
    const markers = [
      m('A', 0.10, 'AA'),
      m('B', 0.12, 'BB'),
      m('C', 0.14, 'CC'),
      m('D', 0.16, 'DD'),
    ];
    // Sweep: A+B clusters (advance 2), then C+D clusters (advance 2).
    const r = clusterMarkers(markers, 100, tenPxPerChar);
    expect(r).toHaveLength(2);
    expect(r[0]!.id).toBe('A+B');
    expect(r[1]!.id).toBe('C+D');
  });

  it('5 mutually-overlapping markers: two pairs + trailing single', () => {
    const markers = [
      m('A', 0.10, 'AA'),
      m('B', 0.12, 'BB'),
      m('C', 0.14, 'CC'),
      m('D', 0.16, 'DD'),
      m('E', 0.18, 'EE'),
    ];
    const r = clusterMarkers(markers, 100, tenPxPerChar);
    expect(r).toHaveLength(3);
    expect(r[0]!.id).toBe('A+B');
    expect(r[1]!.id).toBe('C+D');
    expect(r[2]!.id).toBe('E');
  });
});

describe('marker-cluster edge cases — asymmetric label widths', () => {
  it('short-left + long-right: overlap driven by SUM of half-widths', () => {
    // Left label = 1 char × 10 px = 10 px → half = 5 px.
    // Right label = 12 chars × 10 px = 120 px → half = 60 px.
    // Sum of halves = 65 px on a 100 px track → minNonOverlapFrac = 0.65.
    // Gap = 0.40 < 0.65 → cluster.
    const r = clusterMarkers(
      [m('S', 0.10, 'X'), m('L', 0.50, 'VERYLONGLABEL')],
      100,
      tenPxPerChar,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe('S+L');
    // Midpoint at 0.30.
    expect(r[0]!.fraction).toBeCloseTo(0.30, 10);
  });

  it('long-left + short-right (reverse asymmetry): same overlap math', () => {
    const r = clusterMarkers(
      [m('L', 0.10, 'VERYLONGLABEL'), m('S', 0.50, 'X')],
      100,
      tenPxPerChar,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe('L+S');
  });

  it('asymmetric labels far enough apart do NOT cluster', () => {
    // Sum of halves = 65 px → 0.65 on 100 px. Gap = 0.80 > 0.65 → no cluster.
    const r = clusterMarkers(
      [m('S', 0.10, 'X'), m('L', 0.90, 'VERYLONGLABEL')],
      100,
      tenPxPerChar,
    );
    expect(r).toHaveLength(2);
  });

  it('one zero-width label + one normal label: overlap driven by normal label alone', () => {
    // Zero-length label → estimator returns 0 (10 px × 0 chars).
    // Sum of halves = 0 + 10 = 10 px → minNonOverlap = 0.10. We use
    // a gap of 0.20 (well above the threshold) to dodge floating-
    // point noise around the boundary.
    const r = clusterMarkers(
      [m('Z', 0.30, ''), m('N', 0.50, 'AA')],
      100,
      tenPxPerChar,
    );
    expect(r).toHaveLength(2);
    // Now shrink the gap to 0.05 — well below the 0.10 threshold.
    const r2 = clusterMarkers(
      [m('Z', 0.45, ''), m('N', 0.50, 'AA')],
      100,
      tenPxPerChar,
    );
    expect(r2).toHaveLength(1);
  });
});

describe('marker-cluster edge cases — pathological inputs', () => {
  it('markers at exactly the SAME fraction cluster (zero gap < any positive threshold)', () => {
    const r = clusterMarkers(
      [m('A', 0.50, 'A'), m('B', 0.50, 'B')],
      1000,
      tenPxPerChar,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe('A+B');
    expect(r[0]!.fraction).toBe(0.50);
  });

  it('NaN trackWidthPx → treated as zero (no clustering)', () => {
    // NaN < 0 is false, NaN > 0 is false; the guard `trackWidthPx <= 0`
    // also returns false for NaN. The fall-through path computes
    // `(leftW + rightW) / 2 / NaN === NaN`, and `gap < NaN` is false.
    // So the function returns singles for NaN — verified by behaviour.
    const r = clusterMarkers(
      [m('A', 0.40, 'AA'), m('B', 0.50, 'BB')],
      Number.NaN,
      tenPxPerChar,
    );
    // Without overlap detected, both pass as singles.
    expect(r).toHaveLength(2);
  });

  it('infinite trackWidthPx → never clusters (threshold → 0)', () => {
    const r = clusterMarkers(
      [m('A', 0.40, 'AA'), m('B', 0.40001, 'BB')], // tiny gap
      Number.POSITIVE_INFINITY,
      tenPxPerChar,
    );
    expect(r).toHaveLength(2);
  });

  it('markers with negative fractions still process without crashing', () => {
    // Out-of-bounds inputs are not the lib's contract but the math is
    // pure arithmetic — verify no exceptions and a consistent result.
    const r = clusterMarkers(
      [m('A', -0.10, 'AA'), m('B', -0.05, 'BB')],
      100,
      tenPxPerChar,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.fraction).toBeCloseTo(-0.075, 10);
  });

  it('markers with fractions > 1 still process without crashing', () => {
    const r = clusterMarkers(
      [m('A', 1.10, 'AA'), m('B', 1.15, 'BB')],
      100,
      tenPxPerChar,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.fraction).toBeCloseTo(1.125, 10);
  });
});

describe('marker-cluster — overlap-predicate symmetry + determinism', () => {
  it('markersOverlap returns false when trackWidthPx is exactly 0', () => {
    expect(markersOverlap(m('A', 0.4, 'AA'), m('B', 0.5, 'BB'), 0, tenPxPerChar)).toBe(false);
  });

  it('repeated runs against the same input produce identical output (deterministic)', () => {
    const inputs = [
      m('A', 0.10, 'AA'),
      m('B', 0.15, 'BB'),
      m('C', 0.70, 'CC'),
      m('D', 0.75, 'DD'),
    ];
    const r1 = clusterMarkers(inputs, 100, tenPxPerChar);
    const r2 = clusterMarkers(inputs, 100, tenPxPerChar);
    expect(r1).toHaveLength(r2.length);
    for (let i = 0; i < r1.length; i++) {
      expect(r1[i]!.id).toBe(r2[i]!.id);
      expect(r1[i]!.fraction).toBe(r2[i]!.fraction);
      expect(r1[i]!.label).toBe(r2[i]!.label);
    }
  });
});

describe('marker-cluster — dual cluster id stability', () => {
  it('dual cluster id is `${leftId}+${rightId}` (insertion order preserved)', () => {
    const r = clusterMarkers(
      [m('aa', 0.40, 'A'), m('bb', 0.50, 'B')],
      100,
      tenPxPerChar,
    );
    expect(r[0]!.id).toBe('aa+bb');
  });

  it('swapping marker order would change id (sweep is left-to-right)', () => {
    // Note: clusterMarkers requires ascending input; swapping inputs
    // means swapping fractions too, which changes what's "left" vs
    // "right". The id ordering follows the input.
    const r = clusterMarkers(
      [m('alpha', 0.40, 'A'), m('beta', 0.50, 'B')],
      100,
      tenPxPerChar,
    );
    expect(r[0]!.id).toBe('alpha+beta');
    const r2 = clusterMarkers(
      [m('beta', 0.40, 'B'), m('alpha', 0.50, 'A')],
      100,
      tenPxPerChar,
    );
    expect(r2[0]!.id).toBe('beta+alpha');
  });
});

describe('marker-cluster — defaultLabelWidthPx defensive', () => {
  it('handles a 1-char label correctly', () => {
    expect(defaultLabelWidthPx('X')).toBe(6.5 + 8);
  });

  it('handles a 50-char label without surprises', () => {
    expect(defaultLabelWidthPx('A'.repeat(50))).toBe(50 * 6.5 + 8);
  });
});
