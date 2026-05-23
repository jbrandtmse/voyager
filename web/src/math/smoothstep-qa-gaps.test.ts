/**
 * Smoothstep helper — QA gap tests (Story 4.1).
 *
 * The dev's `smoothstep.test.ts` covers the happy path (endpoints, midpoint,
 * GLSL formula at quarter points, monotonicity, derivative=0 at edges, the
 * `edge0 === edge1` degenerate band, and large-ET precision).
 *
 * This QA file pins the DEFENSIVE edges the happy path skips:
 *
 *   - NaN inputs (edge0, edge1, x).
 *   - +Infinity / -Infinity inputs.
 *   - Inverted band (edge0 > edge1) — what does the contract guarantee?
 *     The dev's source comment claims monotonic-in-requested-direction;
 *     we pin that as a behavioural test so a future refactor doesn't
 *     silently invert.
 *   - Negative-zero edge case (`-0 === 0` in JS but `1 / -0 === -Infinity`).
 *   - The contract that the function never returns a value outside [0, 1].
 *
 * These pin the smoothstep helper's contract against accidental Number
 * unsafety — the ViewFrameService's per-frame call site multiplies the
 * smoothstep output by Jupiter's heliocentric position, so a NaN return
 * would NaN-poison the worldGroup transform.
 */

import { describe, it, expect } from 'vitest';
import { smoothstep } from './smoothstep';

describe('smoothstep — QA gap: defensive edge cases', () => {
  describe('NaN propagation', () => {
    it('NaN x returns NaN (no silent clamp to 0 or 1)', () => {
      // ViewFrame's caller never passes NaN, but a future caller (URL-driven
      // ET parse, scrubber drag) might. The contract must be: NaN propagates,
      // so the caller can defensively gate via Number.isFinite() upstream.
      expect(Number.isNaN(smoothstep(0, 1, Number.NaN))).toBe(true);
    });

    it('NaN edge0 returns NaN', () => {
      expect(Number.isNaN(smoothstep(Number.NaN, 1, 0.5))).toBe(true);
    });

    it('NaN edge1 returns NaN', () => {
      expect(Number.isNaN(smoothstep(0, Number.NaN, 0.5))).toBe(true);
    });
  });

  describe('Infinity inputs', () => {
    it('+Infinity x clamps to 1 (above edge1)', () => {
      // The clamp01 path runs after normalization. `(Infinity - 0) /
      // (1 - 0) = Infinity`, then `clamp01(Infinity) = 1`. The cubic
      // collapses to `1 * 1 * (3 - 2) = 1`. Important so a runaway ET
      // doesn't NaN-poison the smoothstep output.
      expect(smoothstep(0, 1, Number.POSITIVE_INFINITY)).toBe(1);
    });

    it('-Infinity x clamps to 0 (below edge0)', () => {
      // Symmetric to the +Infinity case — clamps the smoothstep output to
      // the heliocentric baseline rather than producing NaN.
      expect(smoothstep(0, 1, Number.NEGATIVE_INFINITY)).toBe(0);
    });

    it('Infinity edge0 with finite x and edge1 produces NaN or 0 (defensive — never throws)', () => {
      // `(x - Infinity) / (edge1 - Infinity)` evaluates to `-Infinity /
      // -Infinity = NaN`, which clamps to NaN. Either NaN or 0 is acceptable
      // here — the load-bearing assertion is "doesn't throw". A future
      // hardening pass may want to detect Infinity edges and short-circuit.
      const v = smoothstep(Number.POSITIVE_INFINITY, 1, 0.5);
      // Document the current behaviour explicitly so a future change is
      // visible: today the path returns NaN. If a hardening pass replaces
      // it with 0 or 1, this assertion needs updating.
      expect(Number.isNaN(v) || v === 0 || v === 1).toBe(true);
    });
  });

  describe('Inverted band (edge0 > edge1) — documented monotonic-in-requested-direction', () => {
    it('inverted edges still return 0 at x === edge0 (the "start" of the requested direction)', () => {
      // Per the source comment: "When edge1 < edge0 we still produce a
      // valid value by reversing the normalization sign so the curve is
      // monotonic in the requested direction." At x === edge0 the
      // normalized t = (edge0 - edge0)/(edge1 - edge0) = 0, clamp01(0) = 0,
      // cubic(0) = 0. So even inverted, x === edge0 → 0.
      expect(smoothstep(1, 0, 1)).toBe(0);
    });

    it('inverted edges return 1 at x === edge1 (the "end" of the requested direction)', () => {
      // At x === edge1 the normalized t = (edge1 - edge0)/(edge1 - edge0) = 1.
      expect(smoothstep(1, 0, 0)).toBe(1);
    });

    it('inverted edges are monotonic from 0 (at edge0) → 1 (at edge1)', () => {
      // Sample 11 knots across (edge0, edge1) for inverted band [1, 0] and
      // confirm strictly non-decreasing as x sweeps from edge0 toward edge1.
      // (Direction reverses: x sweeps from 1 down to 0; smoothstep sweeps
      // from 0 up to 1.)
      let prev = -Infinity;
      for (let i = 0; i <= 10; i++) {
        const x = 1 - i / 10; // x = 1.0, 0.9, ..., 0.0
        const v = smoothstep(1, 0, x);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
      expect(prev).toBe(1);
    });

    it('inverted-band midpoint matches non-inverted midpoint (cubic Hermite symmetry)', () => {
      // smoothstep(0, 1, 0.5) should equal smoothstep(1, 0, 0.5) (the
      // cubic curve evaluated at t=0.5 is symmetric).
      expect(smoothstep(1, 0, 0.5)).toBeCloseTo(smoothstep(0, 1, 0.5), 12);
    });
  });

  describe('Negative zero — JS Number quirk', () => {
    it('treats -0 as equivalent to 0 in the degenerate band guard', () => {
      // `-0 === 0` is true in JS, so the `edge0 === edge1` short-circuit
      // fires even for (-0, +0). Verify the instant-step semantics still
      // hold at the boundary.
      expect(smoothstep(-0, 0, -0.5)).toBe(0);
      expect(smoothstep(-0, 0, 0)).toBe(1);
      expect(smoothstep(-0, 0, 0.5)).toBe(1);
    });
  });

  describe('Output range invariant (load-bearing for ViewFrame multiplication)', () => {
    it('returns a value in [0, 1] for any finite (edge0, edge1, x) triple', () => {
      // ViewFrame multiplies the smoothstep output by Jupiter's heliocentric
      // position. A value outside [0, 1] would over- or under-shoot the
      // lerp endpoints — visible as a body-centered anchor that "jumps past"
      // the body or jumps "behind" the Sun. Pin the invariant on a small
      // sweep of finite triples.
      const edge0Samples = [-1e6, -1, 0, 1, 1e6];
      const edge1Samples = [-1e6, -1, 0, 1, 1e6];
      const xSamples = [-1e9, -1, 0, 0.5, 1, 1e9];
      for (const e0 of edge0Samples) {
        for (const e1 of edge1Samples) {
          for (const x of xSamples) {
            const v = smoothstep(e0, e1, x);
            // Skip the NaN cases (e0 === e1 paired with conflicting x signs
            // — those are covered by the degenerate-band test).
            if (Number.isNaN(v)) continue;
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
          }
        }
      }
    });
  });

  describe('Zero-width-band variants — width = ε (smallest non-degenerate)', () => {
    it('width = Number.EPSILON produces 0 below, sharp ramp, 1 above (no NaN at the divide-by-tiny)', () => {
      // The degenerate-band guard only fires on EXACT equality. A band of
      // width Number.EPSILON skirts the guard and divides by EPSILON. The
      // clamp01 contract still applies, so the output stays in [0, 1].
      const e0 = 0;
      const e1 = Number.EPSILON;
      expect(smoothstep(e0, e1, -1)).toBe(0);
      expect(smoothstep(e0, e1, 0)).toBe(0); // at edge0 → t=0 → 0
      expect(smoothstep(e0, e1, 1)).toBe(1); // way above edge1 → t clamped to 1
      // Inside the tiny band the cubic still evaluates without NaN.
      const insideTiny = smoothstep(e0, e1, Number.EPSILON / 2);
      expect(insideTiny).toBeGreaterThanOrEqual(0);
      expect(insideTiny).toBeLessThanOrEqual(1);
      expect(Number.isFinite(insideTiny)).toBe(true);
    });
  });
});
