import type { WorldVec3, RenderVec3 } from '../types/branded';

// Compute the per-frame WorldGroup translation that recenters render-space on
// the camera. The renderer applies `WorldGroup.position = floatingOriginOffset(
// cameraWorldPos)`, which has the effect of translating the entire world so
// the camera sits at the render-space origin — that's where Float32 precision
// is densest.
//
// Architecture Decision 3a / ADR 0012: with SCALE = 1 (km), the offset is
// simply -cameraWorldPos in km. No division by SCALE.
//
// This is the second (and last) site allowed to construct a Float32Array
// directly. The no-float32-leakage defense test enforces the allow-list.
export const floatingOriginOffset = (cameraWorldPos: WorldVec3): RenderVec3 => {
  const out = new Float32Array(3);
  out[0] = -cameraWorldPos[0];
  out[1] = -cameraWorldPos[1];
  out[2] = -cameraWorldPos[2];
  return out as RenderVec3;
};
