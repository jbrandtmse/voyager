// Load-bearing camera-config constants for RenderEngine.
//
// FAR_PLANE_KM is 300 AU (well past the 165 AU requirement, leaves headroom
// for future probes / heliopause sky lines). NEAR_PLANE_KM is 1e-6 km =
// 1 micrometer in render-space; sub-meter precision sits comfortably above
// this. FOV 50° from Architecture Decision 3c.

import { KM_PER_AU } from '../math/constants';

export const DEFAULT_FOV = 50;
export const NEAR_PLANE_KM = 1e-6;
export const FAR_PLANE_KM = 300 * KM_PER_AU;
