// Per-axis cubic Hermite interpolation (Architecture Decision 3, ADR 0003).
//
// Used by EphemerisService to reconstruct continuous position and velocity
// between the discrete state samples baked into VTRJ files. The bake-time
// counterpart in `bake/src/validate_l1.py` uses scipy's `CubicHermiteSpline`;
// this module implements the same math standalone so the runtime can compute
// per-axis interpolation in O(1) without scipy.
//
// Standard cubic Hermite formulation (one axis):
//
//   Given two consecutive samples at the endpoints of a sub-interval of
//   length h with positions p0, p1 and tangents (= velocities, time
//   derivatives) v0, v1, compute the value at offset dt ∈ [0, h]:
//
//     τ      = dt / h
//     h00(τ) =  2τ³ - 3τ² + 1   (Hermite basis: position at p0)
//     h10(τ) =      τ³ - 2τ² + τ (Hermite basis: tangent at p0, scaled by h)
//     h01(τ) = -2τ³ + 3τ²        (Hermite basis: position at p1)
//     h11(τ) =      τ³ -  τ²    (Hermite basis: tangent at p1, scaled by h)
//
//     p(dt)  = h00*p0 + h*h10*v0 + h01*p1 + h*h11*v1
//
// The interval length `h` is the bake cadence (sample spacing in seconds).
//
// Velocity is the time derivative of the same Hermite polynomial:
//
//     dτ/dt   = 1/h
//     h00'(τ) =  6τ² - 6τ          (scaled by 1/h)
//     h10'(τ) =  3τ² - 4τ + 1
//     h01'(τ) = -6τ² + 6τ          (scaled by 1/h)
//     h11'(τ) =  3τ² - 2τ
//
//     v(dt)  = (h00'/h)*p0 + h10'*v0 + (h01'/h)*p1 + h11'*v1
//
// Inputs in km / (km/s) (architecture line 79: WorldVec3 is Float64 km in
// J2000 ecliptic; velocity in km/s). Output is in the same units.

/**
 * Cubic Hermite interpolation of position at offset `dt` in [0, h].
 *
 * @param p0  position at the left endpoint (axis-scalar, km)
 * @param p1  position at the right endpoint (axis-scalar, km)
 * @param v0  velocity at the left endpoint (axis-scalar, km/s)
 * @param v1  velocity at the right endpoint (axis-scalar, km/s)
 * @param dt  offset within the interval (seconds, 0 <= dt <= h)
 * @param h   interval length (seconds, > 0)
 */
export const hermiteInterpolatePosition = (
  p0: number,
  p1: number,
  v0: number,
  v1: number,
  dt: number,
  h: number,
): number => {
  const tau = dt / h;
  const tau2 = tau * tau;
  const tau3 = tau2 * tau;
  const h00 = 2 * tau3 - 3 * tau2 + 1;
  const h10 = tau3 - 2 * tau2 + tau;
  const h01 = -2 * tau3 + 3 * tau2;
  const h11 = tau3 - tau2;
  return h00 * p0 + h * h10 * v0 + h01 * p1 + h * h11 * v1;
};

/**
 * Cubic Hermite interpolation of velocity (the polynomial's time derivative).
 *
 * @param p0  position at the left endpoint (axis-scalar, km)
 * @param p1  position at the right endpoint (axis-scalar, km)
 * @param v0  velocity at the left endpoint (axis-scalar, km/s)
 * @param v1  velocity at the right endpoint (axis-scalar, km/s)
 * @param dt  offset within the interval (seconds, 0 <= dt <= h)
 * @param h   interval length (seconds, > 0)
 */
export const hermiteInterpolateVelocity = (
  p0: number,
  p1: number,
  v0: number,
  v1: number,
  dt: number,
  h: number,
): number => {
  const tau = dt / h;
  const tau2 = tau * tau;
  const dh00 = (6 * tau2 - 6 * tau) / h;
  const dh10 = 3 * tau2 - 4 * tau + 1;
  const dh01 = (-6 * tau2 + 6 * tau) / h;
  const dh11 = 3 * tau2 - 2 * tau;
  return dh00 * p0 + dh10 * v0 + dh01 * p1 + dh11 * v1;
};
