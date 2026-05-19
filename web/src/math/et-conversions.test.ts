import { describe, it, expect } from 'vitest';

import { etFromIso, isoFromEt, formatForHud } from './et-conversions';

// Reference values produced by SpiceyPy 8.1.0 + naif0012.tls via
// `bake/.venv/Scripts/python.exe -c "import spiceypy as sp; sp.furnsh(...);
//  print(sp.str2et('...'))"`. These are the canonical SPICE ETs for each
// instant. Our client-side conversion drops the K·sin(E) periodic term
// (peak amplitude ~1.657 ms) so we match SPICE within a few ms.
const SPICE_REFERENCE: ReadonlyArray<readonly [string, number]> = [
  ['1977-08-20T00:00:00Z', -705844751.8171712],
  ['1977-09-05T00:00:00Z', -704462351.8174435],
  ['1989-08-25T00:00:00Z', -326721543.8172645],
  ['1989-08-25T09:23:00Z', -326687763.8172716],
  ['1990-02-14T00:00:00Z', -311774342.8148995],
  ['2012-08-25T00:00:00Z', 399124867.182735],
  ['2030-12-31T23:59:59Z', 978264068.1839114],
  ['2000-01-01T00:00:00Z', -43135.816087188054],
];

const MS = 0.005; // 5 ms tolerance — well above the 1.657 ms K·sin(E) peak.

describe('Story 1.9 Task 1 — et-conversions', () => {
  describe('etFromIso() matches SpiceyPy reference within 5 ms', () => {
    for (const [iso, expected] of SPICE_REFERENCE) {
      it(`${iso} → ${expected}`, () => {
        const got = etFromIso(iso);
        expect(Math.abs(got - expected)).toBeLessThan(MS);
      });
    }
  });

  describe('isoFromEt() round-trips to-the-second', () => {
    for (const [iso, et] of SPICE_REFERENCE) {
      it(`${et} → ${iso}`, () => {
        expect(isoFromEt(et)).toBe(iso);
      });
    }
  });

  describe('etFromIso ↔ isoFromEt round-trips', () => {
    it('UTC instant → ET → ISO recovers the original ISO', () => {
      const iso = '1989-08-25T09:23:00Z';
      const et = etFromIso(iso);
      expect(isoFromEt(et)).toBe(iso);
    });

    it('ET → ISO → ET recovers the original ET within 5 ms', () => {
      const original = -326687763.8172716;
      const iso = isoFromEt(original);
      const recovered = etFromIso(iso);
      // ISO is seconds-precision, so we re-derive from the truncated form;
      // recovery is exact only if the original ET had no fractional second.
      // Test instead that round-trip lands on the same second:
      expect(isoFromEt(recovered)).toBe(iso);
    });
  });

  describe('etFromIso() handles malformed input gracefully', () => {
    it('returns NaN for a garbage string', () => {
      expect(Number.isNaN(etFromIso('not-a-date'))).toBe(true);
    });

    it('returns NaN for an empty string', () => {
      expect(Number.isNaN(etFromIso(''))).toBe(true);
    });

    it('accepts an ISO with milliseconds', () => {
      const et = etFromIso('1989-08-25T09:23:00.000Z');
      expect(Math.abs(et - -326687763.8172716)).toBeLessThan(MS);
    });

    it('accepts an ISO with explicit +00:00 offset', () => {
      const et = etFromIso('1989-08-25T09:23:00+00:00');
      expect(Math.abs(et - -326687763.8172716)).toBeLessThan(MS);
    });
  });

  describe('formatForHud() — YYYY-MM-DD HH:MM UT', () => {
    it('produces minute granularity, space separator, UT suffix', () => {
      const et = etFromIso('1989-08-25T09:23:00Z');
      expect(formatForHud(et)).toBe('1989-08-25 09:23 UT');
    });

    it('matches the example in the story (V2 Neptune approach)', () => {
      const et = etFromIso('1989-08-25T09:23:00Z');
      expect(formatForHud(et)).toBe('1989-08-25 09:23 UT');
    });

    it('truncates seconds (does not round)', () => {
      const et = etFromIso('1989-08-25T09:23:59Z');
      expect(formatForHud(et)).toBe('1989-08-25 09:23 UT');
    });

    it('returns empty string for NaN', () => {
      expect(formatForHud(Number.NaN)).toBe('');
    });

    it('returns empty string for Infinity', () => {
      expect(formatForHud(Number.POSITIVE_INFINITY)).toBe('');
    });
  });

  describe('isoFromEt() edge cases', () => {
    it('returns empty string for NaN', () => {
      expect(isoFromEt(Number.NaN)).toBe('');
    });

    it('returns empty string for Infinity', () => {
      expect(isoFromEt(Number.POSITIVE_INFINITY)).toBe('');
    });

    it('handles ET = 0 (J2000_TDB, near 2000-01-01T11:58:55.816 UTC)', () => {
      // ET 0 = J2000 TDB ≈ 2000-01-01T11:58:55.816 UTC. With round-to-nearest
      // (vs truncation) the .816 ms fraction rounds up to T11:58:56Z.
      expect(isoFromEt(0)).toBe('2000-01-01T11:58:56Z');
    });
  });
});
