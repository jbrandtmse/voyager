import { describe, it, expect } from 'vitest';
import { KM_PER_AU, SCALE } from './constants';

describe('math constants — load-bearing literal values', () => {
  it('KM_PER_AU is the IAU canonical Earth-Sun distance (km)', () => {
    expect(KM_PER_AU).toBe(149597870.7);
  });

  it('SCALE = 1 — Architecture Decision 3a / ADR 0012 (km per render-space unit)', () => {
    expect(SCALE).toBe(1);
  });
});
