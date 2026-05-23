import { describe, it, expect } from 'vitest';

import { cadenceAwareStep, CADENCE_BANDS } from './cadence-aware-step';

const ONE_HOUR = 3600;
const ONE_DAY = 86_400;

describe('Story 4.4 T5 — cadenceAwareStep', () => {
  // The anchor ET is arbitrary; the helper compares deltas, not absolute
  // values, so any finite number works. Pick V1 Jupiter's actual anchor so
  // the test reads as the realistic case the story describes.
  const ANCHOR_ET = -657806143; // approx 1979-03-05T12:05:00 ET

  describe('tier selection — at-anchor / closest-approach (±1 hour)', () => {
    it('returns 10-second tier at the anchor itself', () => {
      const result = cadenceAwareStep(ANCHOR_ET, ANCHOR_ET);
      expect(result.stepSmall).toBe(10);
      expect(result.stepLarge).toBe(100);
    });

    it('returns 10-second tier 30 minutes from the anchor', () => {
      const result = cadenceAwareStep(ANCHOR_ET + 30 * 60, ANCHOR_ET);
      expect(result.stepSmall).toBe(10);
      expect(result.stepLarge).toBe(100);
    });

    it('returns 10-second tier at the exact ±1 hour boundary (inclusive)', () => {
      const result = cadenceAwareStep(ANCHOR_ET + ONE_HOUR, ANCHOR_ET);
      expect(result.stepSmall).toBe(10);
      expect(result.stepLarge).toBe(100);
    });

    it('is symmetric — 30 minutes BEFORE the anchor is still 10-second tier', () => {
      const result = cadenceAwareStep(ANCHOR_ET - 30 * 60, ANCHOR_ET);
      expect(result.stepSmall).toBe(10);
      expect(result.stepLarge).toBe(100);
    });
  });

  describe('tier selection — refinement (±2 days)', () => {
    it('returns 1-minute tier 2 hours from the anchor (outside ±1 hour)', () => {
      const result = cadenceAwareStep(ANCHOR_ET + 2 * ONE_HOUR, ANCHOR_ET);
      expect(result.stepSmall).toBe(60);
      expect(result.stepLarge).toBe(600);
    });

    it('returns 1-minute tier 1 day from the anchor', () => {
      const result = cadenceAwareStep(ANCHOR_ET + ONE_DAY, ANCHOR_ET);
      expect(result.stepSmall).toBe(60);
      expect(result.stepLarge).toBe(600);
    });

    it('returns 1-minute tier at the exact ±2 day boundary (inclusive)', () => {
      const result = cadenceAwareStep(ANCHOR_ET + 2 * ONE_DAY, ANCHOR_ET);
      expect(result.stepSmall).toBe(60);
      expect(result.stepLarge).toBe(600);
    });
  });

  describe('tier selection — cruise (±30 days)', () => {
    it('returns 1-hour tier 5 days from the anchor (outside ±2 days)', () => {
      const result = cadenceAwareStep(ANCHOR_ET + 5 * ONE_DAY, ANCHOR_ET);
      expect(result.stepSmall).toBe(ONE_HOUR);
      expect(result.stepLarge).toBe(ONE_HOUR * 10);
    });

    it('returns 1-hour tier at the exact ±30 day boundary (inclusive)', () => {
      const result = cadenceAwareStep(ANCHOR_ET + 30 * ONE_DAY, ANCHOR_ET);
      expect(result.stepSmall).toBe(ONE_HOUR);
      expect(result.stepLarge).toBe(ONE_HOUR * 10);
    });

    it('falls back to 1-hour tier outside ±30 days (defense)', () => {
      const result = cadenceAwareStep(ANCHOR_ET + 60 * ONE_DAY, ANCHOR_ET);
      expect(result.stepSmall).toBe(ONE_HOUR);
      expect(result.stepLarge).toBe(ONE_HOUR * 10);
    });
  });

  describe('NaN / Infinity handling', () => {
    it('falls back to hourly tier for NaN cursor', () => {
      const result = cadenceAwareStep(Number.NaN, ANCHOR_ET);
      expect(result.stepSmall).toBe(ONE_HOUR);
    });

    it('falls back to hourly tier for NaN anchor', () => {
      const result = cadenceAwareStep(ANCHOR_ET, Number.NaN);
      expect(result.stepSmall).toBe(ONE_HOUR);
    });

    it('falls back to hourly tier for Infinity cursor', () => {
      const result = cadenceAwareStep(Number.POSITIVE_INFINITY, ANCHOR_ET);
      expect(result.stepSmall).toBe(ONE_HOUR);
    });
  });

  describe('Shift+Arrow multiplier — stepLarge === stepSmall × 10 invariant', () => {
    it('every band stepLarge is 10× its stepSmall', () => {
      for (const band of CADENCE_BANDS) {
        expect(band.stepLarge).toBe(band.stepSmall * 10);
      }
    });
  });
});
