import { describe, it, expect } from 'vitest';

import { formatAU } from './au-format';

describe('Story 1.11 Task 1 — formatAU(): decimal precision ladder', () => {
  it('< 10: shows 2 decimals (0.05 AU)', () => {
    expect(formatAU(0.05)).toBe('0.05 AU');
  });

  it('< 10: shows 2 decimals (1 AU rounds to 1.00 AU)', () => {
    expect(formatAU(1)).toBe('1.00 AU');
  });

  it('< 10: shows 2 decimals (Jupiter scale, 5.20 AU)', () => {
    expect(formatAU(5.2034)).toBe('5.20 AU');
  });

  it('< 10: shows 2 decimals just below the 10 boundary', () => {
    expect(formatAU(9.99)).toBe('9.99 AU');
  });

  it('< 100: shows 1 decimal at the 10 boundary', () => {
    expect(formatAU(10)).toBe('10.0 AU');
  });

  it('< 100: shows 1 decimal (Saturn scale)', () => {
    expect(formatAU(50.27)).toBe('50.3 AU');
  });

  it('< 100: shows 1 decimal just below 100', () => {
    expect(formatAU(99.94)).toBe('99.9 AU');
  });

  it('≥ 100: shows integer at the 100 boundary', () => {
    expect(formatAU(100)).toBe('100 AU');
  });

  it('≥ 100: shows integer (V1-in-2030 example)', () => {
    expect(formatAU(165.32)).toBe('165 AU');
  });

  it('≥ 100: shows integer (V2-in-2030 example)', () => {
    expect(formatAU(137.6)).toBe('138 AU');
  });

  it('≥ 100: rounds the integer (.5 rounds half-away-from-zero)', () => {
    // JS Math.round(165.5) === 166. We assert the actual rounded form.
    expect(formatAU(165.5)).toBe('166 AU');
  });

  it('handles 0 in the < 10 band', () => {
    expect(formatAU(0)).toBe('0.00 AU');
  });

  it('formats negative magnitudes with a leading -', () => {
    expect(formatAU(-5.2)).toBe('-5.20 AU');
    expect(formatAU(-165)).toBe('-165 AU');
  });

  it('returns "— AU" placeholder for NaN', () => {
    expect(formatAU(Number.NaN)).toBe('— AU');
  });

  it('returns "— AU" placeholder for +Infinity', () => {
    expect(formatAU(Number.POSITIVE_INFINITY)).toBe('— AU');
  });

  it('returns "— AU" placeholder for -Infinity', () => {
    expect(formatAU(Number.NEGATIVE_INFINITY)).toBe('— AU');
  });
});
