// @vitest-environment happy-dom
/**
 * Unit tests for the marker-clustering library (Story 6.2 AC5).
 *
 * Covers:
 *   - Pairwise overlap detection mathematics
 *   - Single-marker pass-through when no overlap
 *   - Dual-marker collapse at midpoint when labels overlap
 *   - Stable id generation for dual clusters
 *   - Empty input
 *   - Zero-width track defensive fallback
 *   - The four known Voyager intra-decade clusters:
 *       V2L (1977-08-20) / V1L (1977-09-05)  — 16 days apart
 *       V1J (1979-03-05) / V2J (1979-07-09)  — ~4 months apart
 *       V1S (1980-11-12) / V2S (1981-08-26)  — ~9 months apart
 *       V2N (1989-08-25) / PBD (1990-02-14)  — ~6 months apart
 *     resolve cleanly at a representative mission-scrubber track width
 *     (1024 px between the play-button gutter and the speed-multiplier
 *     readout column).
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

// Deterministic estimator — every character is 10 px wide, padding 0.
const tenPxPerChar = (s: string): number => s.length * 10;

describe('marker-cluster — empty + degenerate inputs', () => {
  it('returns [] for empty markers', () => {
    expect(clusterMarkers([], 1000, defaultLabelWidthPx)).toEqual([]);
  });

  it('returns single passthrough for one marker', () => {
    const result = clusterMarkers([m('A', 0.5)], 1000, defaultLabelWidthPx);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('A');
    expect(result[0]!.fraction).toBe(0.5);
    expect(result[0]!.members).toHaveLength(1);
  });

  it('zero-width track → no clustering possible (returns singles)', () => {
    const result = clusterMarkers([m('A', 0.1), m('B', 0.11)], 0, tenPxPerChar);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('A');
    expect(result[1]!.id).toBe('B');
  });

  it('negative track width treated like zero', () => {
    const result = clusterMarkers([m('A', 0.1), m('B', 0.11)], -100, tenPxPerChar);
    expect(result).toHaveLength(2);
  });
});

describe('marker-cluster — pairwise overlap math', () => {
  it('non-overlapping markers pass through as singles', () => {
    const markers = [m('A', 0.1, 'AAA'), m('B', 0.9, 'BBB')]; // far apart
    const result = clusterMarkers(markers, 1000, tenPxPerChar);
    expect(result).toHaveLength(2);
    expect(result[0]!.members).toHaveLength(1);
    expect(result[1]!.members).toHaveLength(1);
  });

  it('overlapping markers collapse to a dual at midpoint', () => {
    // Both labels are 3 chars × 10 px = 30 px each. Total span if both
    // adjacent = 30 px. On a 100-px track, half-width sum = 30 px →
    // minNonOverlapFrac = 30/100 = 0.30.
    // Place markers 0.10 apart — well inside the threshold → overlap.
    const markers = [m('A', 0.40, 'AAA'), m('B', 0.50, 'BBB')];
    const result = clusterMarkers(markers, 100, tenPxPerChar);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('A+B');
    expect(result[0]!.label).toBe('AAA / BBB');
    expect(result[0]!.fraction).toBe(0.45);
    expect(result[0]!.members).toHaveLength(2);
    expect(result[0]!.members[0]!.id).toBe('A');
    expect(result[0]!.members[1]!.id).toBe('B');
  });

  it('overlap predicate computes from positions + label widths (not hardcoded)', () => {
    const a = m('A', 0.40, 'AAA');
    const b = m('B', 0.50, 'BBB');
    // 100-px track → overlap (gap=0.10 < 0.30 threshold).
    expect(markersOverlap(a, b, 100, tenPxPerChar)).toBe(true);
    // 1000-px track → no overlap (gap=0.10 vs 0.03 threshold).
    expect(markersOverlap(a, b, 1000, tenPxPerChar)).toBe(false);
  });

  it('exactly-at-threshold gap is NOT clustered (strict less-than)', () => {
    const a = m('A', 0.0, 'AA');
    const b = m('B', 0.20, 'BB'); // labels 20px each → halfsum/100 = 0.20
    // At exactly the boundary the predicate returns false (right.start
    // touches but does not cross left.end).
    expect(markersOverlap(a, b, 100, tenPxPerChar)).toBe(false);
  });

  it('three markers: first two overlap → collapse; third single', () => {
    const markers = [
      m('A', 0.40, 'AAA'),
      m('B', 0.50, 'BBB'),
      m('C', 0.90, 'CCC'),
    ];
    const result = clusterMarkers(markers, 100, tenPxPerChar);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('A+B');
    expect(result[1]!.id).toBe('C');
  });

  it('three markers: first single → second+third collapse', () => {
    const markers = [
      m('A', 0.10, 'AAA'),
      m('B', 0.60, 'BBB'),
      m('C', 0.65, 'CCC'),
    ];
    const result = clusterMarkers(markers, 100, tenPxPerChar);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('A');
    expect(result[1]!.id).toBe('B+C');
    expect(result[1]!.fraction).toBe(0.625);
  });

  it('four markers: two pairs both cluster', () => {
    const markers = [
      m('A', 0.10, 'AAA'),
      m('B', 0.15, 'BBB'),
      m('C', 0.70, 'CCC'),
      m('D', 0.75, 'DDD'),
    ];
    const result = clusterMarkers(markers, 100, tenPxPerChar);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('A+B');
    expect(result[1]!.id).toBe('C+D');
  });
});

describe('marker-cluster — Voyager intra-decade clusters (AC5)', () => {
  // Real mission-window anchor fractions on the 1977–2030 timeline.
  // Mission span = (2030-12-31) - (1977-08-20) ≈ 53.4 years ≈ 1.685e9 s.
  // We use approximate fractions (precise enough to demonstrate the
  // clustering — the algorithm doesn't care about exact dates, only
  // about pixel adjacency).
  //
  // Track width: 1024 px is representative of the mission-scrubber
  // track on a 1280-viewport — the host element span is 1280 - 56 -
  // 222 = 1002 px wide; rounded for the test.

  const TRACK_WIDTH = 1024;
  // Label estimator matches production's defaultLabelWidthPx.
  const est = defaultLabelWidthPx;

  it('V2L (1977-08-20) and V1L (1977-09-05) cluster (16 days apart)', () => {
    // 16 days / 19490 days mission = 0.000821 fractional gap.
    const v2l = m('launch-v2', 0.000, 'V2L');
    const v1l = m('launch-v1', 0.000821, 'V1L');
    const result = clusterMarkers([v2l, v1l], TRACK_WIDTH, est);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('launch-v2+launch-v1');
    expect(result[0]!.label).toBe('V2L / V1L');
  });

  it('V1J (1979-03-05) and V2J (1979-07-09) cluster (~4 months apart)', () => {
    // ~126 days / 19490 days mission = 0.00647 fractional gap.
    const v1j = m('v1-jupiter', 0.0287, 'V1J');
    const v2j = m('v2-jupiter', 0.0352, 'V2J');
    const result = clusterMarkers([v1j, v2j], TRACK_WIDTH, est);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('v1-jupiter+v2-jupiter');
    expect(result[0]!.label).toBe('V1J / V2J');
  });

  it('V1S (1980-11-12) and V2S (1981-08-26) cluster (~9 months apart)', () => {
    // ~287 days / 19490 days mission = 0.01473 fractional gap. At
    // TRACK_WIDTH=1024, default label width est for 'V1S' = 3*6.5+8
    // = 27.5 px per side → halfsum/track = 27.5/1024 ≈ 0.0269. Gap
    // 0.01473 < 0.0269 → cluster.
    const v1s = m('v1-saturn', 0.0608, 'V1S');
    const v2s = m('v2-saturn', 0.0755, 'V2S');
    const result = clusterMarkers([v1s, v2s], TRACK_WIDTH, est);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('v1-saturn+v2-saturn');
    expect(result[0]!.label).toBe('V1S / V2S');
  });

  it('V2N (1989-08-25) and PBD (1990-02-14) cluster (~6 months apart)', () => {
    // ~173 days / 19490 days mission = 0.00888 fractional gap.
    const v2n = m('v2-neptune', 0.2256, 'V2N');
    const pbd = m('pale-blue-dot', 0.2345, 'PBD');
    const result = clusterMarkers([v2n, pbd], TRACK_WIDTH, est);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('v2-neptune+pale-blue-dot');
    expect(result[0]!.label).toBe('V2N / PBD');
  });

  it('mid-mission heliopause anchors do NOT cluster (years apart)', () => {
    // V1H (2012-08-25) and V2H (2018-11-05) are ~6 years apart →
    // fractional gap ~0.115 — far above any reasonable label-width
    // half-sum on a 1024-px track.
    const v1h = m('v1-heliopause', 0.658, 'V1H');
    const v2h = m('v2-heliopause', 0.773, 'V2H');
    const result = clusterMarkers([v1h, v2h], TRACK_WIDTH, est);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('v1-heliopause');
    expect(result[1]!.id).toBe('v2-heliopause');
  });

  it('clustering NOT applied at a very wide track (detail variant zoom)', () => {
    // If the detail-variant track width is so wide that even the
    // intra-decade clusters fit individually, the algorithm naturally
    // returns singles. Test with a 50× wider track.
    const v2l = m('launch-v2', 0.000, 'V2L');
    const v1l = m('launch-v1', 0.000821, 'V1L');
    const result = clusterMarkers([v2l, v1l], TRACK_WIDTH * 50, est);
    // With a much wider track, the labels are smaller fractionally
    // and the 16-day gap is now well above the threshold.
    expect(result).toHaveLength(2);
  });
});

describe('marker-cluster — payload threading', () => {
  it('single cluster preserves the original data payload', () => {
    interface Spec { slug: string; anchorEt: number; }
    const spec = { slug: 'foo', anchorEt: 42 };
    const marker: MarkerDescriptor<Spec> = {
      id: 'foo', label: 'FOO', fraction: 0.5, data: spec,
    };
    const result = clusterMarkers([marker], 1000, defaultLabelWidthPx);
    expect(result[0]!.members[0]!.data).toBe(spec);
  });

  it('dual cluster preserves BOTH data payloads in input order', () => {
    interface Spec { slug: string; }
    const a: Spec = { slug: 'aaa' };
    const b: Spec = { slug: 'bbb' };
    const markers: MarkerDescriptor<Spec>[] = [
      { id: 'a', label: 'AAA', fraction: 0.40, data: a },
      { id: 'b', label: 'BBB', fraction: 0.50, data: b },
    ];
    const result = clusterMarkers(markers, 100, tenPxPerChar);
    expect(result).toHaveLength(1);
    expect(result[0]!.members).toHaveLength(2);
    expect(result[0]!.members[0]!.data).toBe(a);
    expect(result[0]!.members[1]!.data).toBe(b);
  });
});

describe('marker-cluster — defaultLabelWidthPx estimator', () => {
  it('is monotonic in label length', () => {
    expect(defaultLabelWidthPx('A')).toBeLessThan(defaultLabelWidthPx('AB'));
    expect(defaultLabelWidthPx('AB')).toBeLessThan(defaultLabelWidthPx('ABC'));
  });

  it('returns positive width for empty label (padding only)', () => {
    expect(defaultLabelWidthPx('')).toBeGreaterThan(0);
  });

  it('matches the per-character formula (6.5 px/char + 8 px padding)', () => {
    expect(defaultLabelWidthPx('XYZ')).toBe(3 * 6.5 + 8);
  });
});
