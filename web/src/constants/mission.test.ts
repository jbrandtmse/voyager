import { describe, it, expect } from 'vitest';

import {
  MISSION_START_ISO,
  MISSION_END_ISO,
  MISSION_START_ET,
  MISSION_END_ET,
  TITLE_CARD_HOLD_MS,
  URL_WRITEBACK_THROTTLE_MS,
  SCRUB_RESUME_DELAY_MS,
} from './mission';
import { etFromIso, isoFromEt } from '../math/et-conversions';

describe('Story 1.9 Task 2 — mission constants', () => {
  describe('Mission ET endpoints', () => {
    it('MISSION_START_ET matches etFromIso(MISSION_START_ISO) within 5 ms', () => {
      // Re-derivation guard: if etFromIso() ever drifts (e.g. a new leap
      // second added to the table), this test fails and forces an explicit
      // constant update.
      const derived = etFromIso(MISSION_START_ISO);
      expect(Math.abs(derived - MISSION_START_ET)).toBeLessThan(0.005);
    });

    it('MISSION_END_ET matches etFromIso(MISSION_END_ISO) within 5 ms', () => {
      const derived = etFromIso(MISSION_END_ISO);
      expect(Math.abs(derived - MISSION_END_ET)).toBeLessThan(0.005);
    });

    it('isoFromEt(MISSION_START_ET) round-trips to MISSION_START_ISO', () => {
      expect(isoFromEt(MISSION_START_ET)).toBe(MISSION_START_ISO);
    });

    it('isoFromEt(MISSION_END_ET) round-trips to MISSION_END_ISO', () => {
      expect(isoFromEt(MISSION_END_ET)).toBe(MISSION_END_ISO);
    });

    it('MISSION_START_ET < MISSION_END_ET (53-year mission window)', () => {
      expect(MISSION_START_ET).toBeLessThan(MISSION_END_ET);
      const spanYears = (MISSION_END_ET - MISSION_START_ET) / (365.25 * 86400);
      expect(spanYears).toBeGreaterThan(53);
      expect(spanYears).toBeLessThan(54);
    });
  });

  describe('Mission ISO endpoints', () => {
    it('MISSION_START_ISO is 1977-08-20T00:00:00Z (V2 launch)', () => {
      expect(MISSION_START_ISO).toBe('1977-08-20T00:00:00Z');
    });

    it('MISSION_END_ISO is 2030-12-31T23:59:59Z (projected mission end)', () => {
      expect(MISSION_END_ISO).toBe('2030-12-31T23:59:59Z');
    });
  });

  describe('Timing constants', () => {
    it('TITLE_CARD_HOLD_MS is 2000 ms (two beats)', () => {
      expect(TITLE_CARD_HOLD_MS).toBe(2000);
    });

    it('URL_WRITEBACK_THROTTLE_MS is 250 ms (≤4 history writes per second)', () => {
      expect(URL_WRITEBACK_THROTTLE_MS).toBe(250);
    });

    it('SCRUB_RESUME_DELAY_MS is 300 ms', () => {
      expect(SCRUB_RESUME_DELAY_MS).toBe(300);
    });
  });
});
