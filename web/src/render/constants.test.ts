import { describe, it, expect } from 'vitest';
import { DEFAULT_FOV, NEAR_PLANE_KM, FAR_PLANE_KM } from './constants';
import { KM_PER_AU } from '../math/constants';

describe('render camera constants', () => {
  it('DEFAULT_FOV = 50 degrees (Architecture Decision 3c)', () => {
    expect(DEFAULT_FOV).toBe(50);
  });

  it('NEAR_PLANE_KM = 1e-6 km (1 micrometer)', () => {
    expect(NEAR_PLANE_KM).toBe(1e-6);
  });

  it('FAR_PLANE_KM = 300 AU expressed in km', () => {
    expect(FAR_PLANE_KM).toBe(300 * KM_PER_AU);
  });

  it('FAR_PLANE_KM comfortably exceeds the 165 AU requirement (FR13)', () => {
    expect(FAR_PLANE_KM).toBeGreaterThan(165 * KM_PER_AU);
  });
});
