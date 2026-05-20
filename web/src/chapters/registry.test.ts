import { describe, it, expect } from 'vitest';
import {
  ALL_CHAPTERS,
  findChapterBySlug,
  findActiveChapterAtEt,
} from './registry';
import { etFromIso } from '../math/et-conversions';

describe('chapters/registry (Story 2.1 AC4)', () => {
  it('exposes exactly 11 chapters', () => {
    expect(ALL_CHAPTERS).toHaveLength(11);
  });

  it('chapters are sorted by anchorEt ascending', () => {
    for (let i = 1; i < ALL_CHAPTERS.length; i++) {
      expect(ALL_CHAPTERS[i].anchorEt).toBeGreaterThan(ALL_CHAPTERS[i - 1].anchorEt);
    }
  });

  it('every chapter has a non-empty unique slug', () => {
    const slugs = ALL_CHAPTERS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) {
      expect(s).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('every chapter has a 2–4 char uppercase markerLabel', () => {
    for (const c of ALL_CHAPTERS) {
      expect(c.markerLabel).toMatch(/^[A-Z][A-Z0-9]{1,3}$/);
    }
  });

  it('chapter windows do NOT overlap with adjacent chapters', () => {
    // AC2 contract: at most one chapter is active at any ET.
    for (let i = 1; i < ALL_CHAPTERS.length; i++) {
      const prev = ALL_CHAPTERS[i - 1];
      const cur = ALL_CHAPTERS[i];
      expect(cur.windowStartEt).toBeGreaterThan(prev.windowEndEt);
    }
  });

  it('every chapter window contains its anchor', () => {
    for (const c of ALL_CHAPTERS) {
      expect(c.anchorEt).toBeGreaterThanOrEqual(c.windowStartEt);
      expect(c.anchorEt).toBeLessThanOrEqual(c.windowEndEt);
    }
  });

  it('contains the canonical 11 slug set in the expected chronological order', () => {
    expect(ALL_CHAPTERS.map((c) => c.slug)).toEqual([
      'launch-v2',
      'launch-v1',
      'v1-jupiter',
      'v2-jupiter',
      'v1-saturn',
      'v2-saturn',
      'v2-uranus',
      'v2-neptune',
      'pale-blue-dot',
      'v1-heliopause',
      'v2-heliopause',
    ]);
  });

  it('ALL_CHAPTERS is frozen (mutation throws in strict mode)', () => {
    expect(Object.isFrozen(ALL_CHAPTERS)).toBe(true);
    expect(() => {
      (ALL_CHAPTERS as ReadonlyArray<unknown> as unknown[]).push({});
    }).toThrow();
  });

  describe('findChapterBySlug', () => {
    it('returns the spec for a known slug', () => {
      const c = findChapterBySlug('v1-jupiter');
      expect(c).not.toBeNull();
      expect(c?.name).toBe('Voyager 1 — Jupiter');
    });

    it('returns null for an unknown slug', () => {
      expect(findChapterBySlug('mars')).toBeNull();
      expect(findChapterBySlug('')).toBeNull();
    });

    it('is case-sensitive (slugs are kebab-case canonical)', () => {
      expect(findChapterBySlug('V1-JUPITER')).toBeNull();
    });
  });

  describe('findActiveChapterAtEt', () => {
    it('returns the chapter whose window contains the ET', () => {
      const jupiterAnchor = etFromIso('1979-03-05T12:05:00Z');
      const active = findActiveChapterAtEt(jupiterAnchor);
      expect(active?.slug).toBe('v1-jupiter');
    });

    it('returns null between chapter windows', () => {
      // 1995-01-01 falls in the long quiet stretch between PBD (1990-02-14)
      // and V1 heliopause (2012-08-25).
      const between = etFromIso('1995-01-01T00:00:00Z');
      expect(findActiveChapterAtEt(between)).toBeNull();
    });

    it('matches the launch-v1 chapter at the V1 launch instant', () => {
      const v1Launch = etFromIso('1977-09-05T12:56:00Z');
      expect(findActiveChapterAtEt(v1Launch)?.slug).toBe('launch-v1');
    });

    it('matches the launch-v2 chapter at the V2 launch instant (16 days before V1)', () => {
      const v2Launch = etFromIso('1977-08-20T14:29:00Z');
      expect(findActiveChapterAtEt(v2Launch)?.slug).toBe('launch-v2');
    });
  });
});
