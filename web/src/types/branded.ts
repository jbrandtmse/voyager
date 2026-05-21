// Branded scalar and vector types for the Float64/Float32 precision boundary
// (Architecture Decision 3a / ADR 0012). The boundary is type-system-enforced:
// services emit Float64 WorldVec3 in km (J2000 ecliptic); the renderer consumes
// Float32 RenderVec3 (km, post-floating-origin-recenter). The cast is explicit
// and constructed in exactly one place: renderVec3FromWorld below.

// === Branded scalar units ============================================

export type Kilometers = number & { readonly __brand: 'Kilometers' };
export type Meters = number & { readonly __brand: 'Meters' };
export type AU = number & { readonly __brand: 'AU' };

export const kilometers = (n: number): Kilometers => n as Kilometers;
export const meters = (n: number): Meters => n as Meters;
export const au = (n: number): AU => n as AU;

// === Branded vector types ============================================
//
// WorldVec3 — Float64-backed, km, J2000 ecliptic. Authoritative trajectory data
// from EphemerisService. Uses Float64Array so that ≥165 AU positions retain
// sub-meter precision (Float64 mantissa: ~15.95 decimal digits; 165 AU =
// 2.47e10 km, so 2.47e10 × 1e-15 ≈ 2.5e-5 km = 2.5 cm error floor, well below
// the sub-meter target).
//
// RenderVec3 — Float32-backed, km, post-recenter. After subtracting camera
// world position, magnitudes shrink to camera-local distances (km), where
// Float32's ~7-digit mantissa gives sub-mm precision (1.2e-7 km = 0.12 mm
// at the origin, scaling linearly outward).
//
// MeshLocalVec3 — Float32-backed, meters, vertex-local within a GLB model.
// Used only inside loaded meshes in later stories; reserved here for the
// type vocabulary.

export type WorldVec3 = Float64Array & { readonly __brand: 'WorldVec3' };
export type RenderVec3 = Float32Array & { readonly __brand: 'RenderVec3' };
export type MeshLocalVec3 = Float32Array & { readonly __brand: 'MeshLocalVec3' };

export const worldVec3 = (x: number, y: number, z: number): WorldVec3 => {
  const arr = new Float64Array(3);
  arr[0] = x;
  arr[1] = y;
  arr[2] = z;
  return arr as WorldVec3;
};

// THE explicit Float64 → Float32 precision-loss cast.
// AC3 forbids `new Float32Array(...)` anywhere except this module and
// floating-origin.ts; the no-float32-leakage defense test enforces it.
export const renderVec3FromWorld = (world: WorldVec3): RenderVec3 => {
  const arr = new Float32Array(3);
  arr[0] = world[0];
  arr[1] = world[1];
  arr[2] = world[2];
  return arr as RenderVec3;
};

export const renderVec3 = (x: number, y: number, z: number): RenderVec3 => {
  const arr = new Float32Array(3);
  arr[0] = x;
  arr[1] = y;
  arr[2] = z;
  return arr as RenderVec3;
};

export const meshLocalVec3 = (x: number, y: number, z: number): MeshLocalVec3 => {
  const arr = new Float32Array(3);
  arr[0] = x;
  arr[1] = y;
  arr[2] = z;
  return arr as MeshLocalVec3;
};

// === Branded Quaternion =============================================
//
// Story 3.2 AC2 — branded scalar-LAST quaternion (Three.js / WebGL convention).
// SPICE stores quaternions as scalar-FIRST `[w, x, y, z]`; the convention
// permute happens ONCE inside AttitudeService at decode time so the cached
// knot quaternions are already Three.js-convention. The brand prevents a
// non-permuted SPICE quaternion from being assigned to an AttitudeService
// consumer surface — every public AttitudeService method returns the branded
// Quaternion, and the only way to construct one is via the `quaternion(...)`
// helper below.
//
// The structural shape mirrors `THREE.Quaternion` for zero-cost interop
// (callers can pass a branded `Quaternion` directly into `THREE.Object3D.
// quaternion.copy(q)`), but the brand is purely TypeScript-level: at runtime
// it is an ordinary plain object with `{x, y, z, w}` and nothing else.

export type Quaternion = Readonly<{
  x: number;
  y: number;
  z: number;
  w: number;
}> & { readonly __brand: 'Quaternion' };

/**
 * Construct a branded scalar-LAST quaternion. The convention is Three.js /
 * WebGL: `q = w + x·i + y·j + z·k` stored as `[x, y, z, w]`. SPICE produces
 * scalar-first `[w, x, y, z]`; the AttitudeService decoder performs the
 * permute before calling this constructor.
 */
export const quaternion = (
  x: number,
  y: number,
  z: number,
  w: number,
): Quaternion => ({ x, y, z, w }) as Quaternion;

// === Unit conversions ===============================================
//
// KM_PER_AU is re-exported from math/constants.ts as the canonical home, but
// imported here for the conversion helpers to keep the type module self-
// contained at the call site.

import { KM_PER_AU } from '../math/constants';

export const kmToAU = (km: Kilometers): AU => (km / KM_PER_AU) as AU;
export const auToKm = (a: AU): Kilometers => (a * KM_PER_AU) as Kilometers;
