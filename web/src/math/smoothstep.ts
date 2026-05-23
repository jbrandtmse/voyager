/**
 * Cubic Hermite smoothstep (Story 4.1 T1.1).
 *
 * Standard `smoothstep(edge0, edge1, x)` matching the GLSL / glslangValidator
 * definition: clamps `x` into [edge0, edge1], normalizes to `t ∈ [0, 1]`,
 * then evaluates the cubic Hermite easing `t * t * (3 - 2 * t)` that has
 * zero first derivative at both endpoints (no velocity discontinuities at
 * the boundary). Outside the [edge0, edge1] band the function is exactly
 * 0 (below) or exactly 1 (above) — no extrapolation.
 *
 * Used by:
 * - `ViewFrameService.getTransform` (Story 4.1) for the heliocentric →
 *   body-centered origin blend over a ±2-day window per ADR-0023.
 *
 * Implementation note: when `edge0 === edge1` the normalization would
 * divide by zero. We treat this degenerate band as an instant step at
 * `x === edge0`: any `x < edge0` is 0, any `x >= edge0` is 1. This
 * matches the reduced-motion collapse semantics (`alpha = 0` everywhere
 * outside the window, `alpha = 1` inside).
 */

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  if (edge0 === edge1) {
    return x < edge0 ? 0 : 1;
  }
  // GLSL convention: smoothstep is symmetric around the midpoint when
  // edge1 > edge0. When edge1 < edge0 we still produce a valid value by
  // reversing the normalization sign so the curve is monotonic in the
  // requested direction.
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const clamp01 = (n: number): number => {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
};
