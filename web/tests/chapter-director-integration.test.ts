/**
 * Story 2.1 QA — ChapterDirector ✕ real ALL_CHAPTERS registry integration.
 *
 * The dev-authored `chapter-director.test.ts` exercises the FSM against a
 * 3-chapter HAND-ROLLED fixture with integer ETs. That keeps the per-AC
 * arithmetic obvious, but it does not verify the director against the
 * REAL 11-chapter registry — which is the only configuration ever shipped
 * to production. This file fills that gap PLUS the ET boundary edge cases
 * the per-AC tests do not pin:
 *
 *   1. Real-registry integration: scrub to each of the 10 canonical
 *      encounter dates (V2 launch → V2 heliopause) and assert
 *      `activeChapter.slug` matches.
 *   2. The "Pale Blue Dot" canonical instant lands on the PBD spec
 *      (placeholder works end-to-end through the FSM, not just lookups).
 *   3. Boundary ETs — exact `windowStartEt` and `windowEndEt` are
 *      inclusive (per AC1/AC2: window bounds are inclusive — see
 *      `restingStateAtEt` in chapter-director.ts).
 *   4. Pre-mission (negative ET, well before V2 launch) — every chapter
 *      stays in `out`, no transitions fire, no active chapter.
 *   5. Post-mission (far future, well past V2 heliopause window end) —
 *      every chapter reaches `passed`, no active chapter, the rapid-
 *      scrub semantics fire all 44 transitions (11 × 4) in chronological
 *      anchor order.
 *   6. Round-trip reverse rapid scrub — forward to mission end, reverse
 *      back to pre-mission, every chapter is back to `out`.
 *   7. `findActiveChapterAtEt` agrees with `ChapterDirector.activeChapter`
 *      at every canonical anchor (cross-consistency between the registry
 *      helper and the FSM).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ALL_CHAPTERS, findActiveChapterAtEt } from '../src/chapters/registry';
import { ChapterDirector } from '../src/services/chapter-director';
import { etFromIso } from '../src/math/et-conversions';
import type { ChapterTransitionEvent } from '../src/types/chapter';

const SECONDS_PER_DAY = 86_400;

/**
 * The 11 (slug → canonical-anchor-ISO) pairs from Story 2.1 AC2. The
 * integration test scrubs to each ET and asserts the FSM activates the
 * matching chapter. This catches both: (a) windows that are mis-sized
 * such that the anchor lands outside its own window, and (b) any future
 * window-overlap that lets a neighbour shadow the canonical anchor.
 */
const ANCHOR_ISO_BY_SLUG: ReadonlyArray<readonly [string, string]> = [
  ['launch-v2', '1977-08-20T14:29:00Z'],
  ['launch-v1', '1977-09-05T12:56:00Z'],
  ['v1-jupiter', '1979-03-05T12:05:00Z'],
  ['v2-jupiter', '1979-07-09T22:29:00Z'],
  ['v1-saturn', '1980-11-12T23:46:00Z'],
  ['v2-saturn', '1981-08-26T00:00:00Z'],
  ['v2-uranus', '1986-01-24T17:59:00Z'],
  ['v2-neptune', '1989-08-25T03:56:00Z'],
  ['pale-blue-dot', '1990-02-14T00:00:00Z'],
  ['v1-heliopause', '2012-08-25T00:00:00Z'],
  ['v2-heliopause', '2018-11-05T00:00:00Z'],
];

describe('Story 2.1 QA — ChapterDirector ✕ real ALL_CHAPTERS', () => {
  let director: ChapterDirector;
  let events: ChapterTransitionEvent[];

  beforeEach(() => {
    director = new ChapterDirector(ALL_CHAPTERS);
    events = [];
    director.subscribe((e) => events.push(e));
  });

  describe('each canonical anchor activates its chapter', () => {
    for (const [slug, iso] of ANCHOR_ISO_BY_SLUG) {
      it(`scrubbing to ${slug} anchor (${iso}) activates ${slug}`, () => {
        const et = etFromIso(iso);
        director.update(et);
        expect(director.activeChapter?.slug).toBe(slug);
        expect(director.getState(slug)).toBe('held');
        // Registry helper agrees with the FSM at the anchor (cross-check
        // — they are two independent code paths reading the same windows).
        expect(findActiveChapterAtEt(et)?.slug).toBe(slug);
      });
    }
  });

  describe('between-chapter quiet zones report no active chapter', () => {
    it('mid-1995 (PBD → V1 heliopause gap, 22 years quiet) has no active chapter', () => {
      director.update(etFromIso('1995-01-01T00:00:00Z'));
      expect(director.activeChapter).toBeNull();
      expect(findActiveChapterAtEt(etFromIso('1995-01-01T00:00:00Z'))).toBeNull();
    });

    it('1983-01-01 (between V2 Saturn and V2 Uranus) has no active chapter', () => {
      director.update(etFromIso('1983-01-01T00:00:00Z'));
      expect(director.activeChapter).toBeNull();
    });
  });

  describe('window-boundary semantics (inclusive at both ends per restingStateAtEt)', () => {
    // Pick V1 Jupiter (anchor 1979-03-05, ±30 day window) as the canonical
    // chapter to probe — its window is wide enough to test both edges
    // without leaking into adjacent chapters' bands.
    const v1Jupiter = ALL_CHAPTERS.find((c) => c.slug === 'v1-jupiter');
    if (!v1Jupiter) throw new Error('expected v1-jupiter in registry');

    it('exactly windowStartEt is `held` (lower bound inclusive)', () => {
      director.update(v1Jupiter.windowStartEt);
      expect(director.activeChapter?.slug).toBe('v1-jupiter');
      expect(director.getState('v1-jupiter')).toBe('held');
    });

    it('exactly windowEndEt is `held` (upper bound inclusive)', () => {
      director.update(v1Jupiter.windowEndEt);
      expect(director.activeChapter?.slug).toBe('v1-jupiter');
      expect(director.getState('v1-jupiter')).toBe('held');
    });

    it('one second past windowEndEt transitions to `passed` and clears activeChapter', () => {
      director.update(v1Jupiter.windowEndEt + 1);
      expect(director.activeChapter).toBeNull();
      expect(director.getState('v1-jupiter')).toBe('passed');
    });

    it('one second before windowStartEt stays `out` and reports no active chapter', () => {
      director.update(v1Jupiter.windowStartEt - 1);
      expect(director.getState('v1-jupiter')).toBe('out');
      // Adjacent chapters (V2 Jupiter at 1979-07-09, V2 launch at 1977-08-20)
      // are too far away to be active at V1 Jupiter's window-start-minus-1.
      expect(director.activeChapter).toBeNull();
    });
  });

  describe('pre-mission ET (far before V2 launch)', () => {
    it('every chapter stays in `out`, no transitions fire, no active chapter', () => {
      // 1900-01-01 — 77 years before V2 launch.
      director.update(etFromIso('1900-01-01T00:00:00Z'));
      for (const c of ALL_CHAPTERS) {
        expect(director.getState(c.slug)).toBe('out');
      }
      expect(director.activeChapter).toBeNull();
      expect(events).toHaveLength(0);
    });

    it('negative ET (pre-J2000 but post-mission-start) handled identically to other ETs', () => {
      // J2000 = 2000-01-01 12:00 TDB, so the entire 1977→1990 chapter
      // band has NEGATIVE ET values. V1 launch ET is around -703_555_440 s.
      // This isn't an edge case for the FSM (it uses simple arithmetic)
      // but exercises the negative-anchor path that the dev's small-integer
      // fixture never reached.
      const v1LaunchEt = etFromIso('1977-09-05T12:56:00Z');
      expect(v1LaunchEt).toBeLessThan(0);
      director.update(v1LaunchEt);
      expect(director.activeChapter?.slug).toBe('launch-v1');
    });
  });

  describe('post-mission ET (well past V2 heliopause window end)', () => {
    it('scrubbing to year 2100 puts every chapter in `passed` and fires 44 transitions', () => {
      director.update(etFromIso('2100-01-01T00:00:00Z'));

      for (const c of ALL_CHAPTERS) {
        expect(director.getState(c.slug)).toBe('passed');
      }
      expect(director.activeChapter).toBeNull();

      // 11 chapters × 4 transitions each (out→entering→held→exiting→passed).
      expect(events).toHaveLength(11 * 4);

      // Transitions fire in chronological anchor order — assert by checking
      // the first event for each chapter group matches the registry's
      // chronological ordering.
      const firstSlugByGroup: string[] = [];
      let lastSlug: string | null = null;
      for (const e of events) {
        if (e.chapter.slug !== lastSlug) {
          firstSlugByGroup.push(e.chapter.slug);
          lastSlug = e.chapter.slug;
        }
      }
      expect(firstSlugByGroup).toEqual(ALL_CHAPTERS.map((c) => c.slug));
    });
  });

  describe('round-trip rapid scrub', () => {
    it('forward to mission-end then reverse to pre-mission leaves every chapter `out`', () => {
      director.update(etFromIso('2100-01-01T00:00:00Z'));
      const forwardEventCount = events.length;
      expect(forwardEventCount).toBe(11 * 4);

      events.length = 0;
      director.update(etFromIso('1900-01-01T00:00:00Z'));

      // Reverse: each chapter walks passed→exiting→held→entering→out.
      expect(events).toHaveLength(11 * 4);
      for (const c of ALL_CHAPTERS) {
        expect(director.getState(c.slug)).toBe('out');
      }
      expect(director.activeChapter).toBeNull();
    });

    it('forward scrub spanning only the encounter band (V1 launch → V2 Neptune anchor) leaves later chapters untouched', () => {
      const v2Neptune = ALL_CHAPTERS.find((c) => c.slug === 'v2-neptune');
      if (!v2Neptune) throw new Error('expected v2-neptune in registry');
      director.update(v2Neptune.anchorEt);

      // The active chapter is V2 Neptune (anchor falls inside its window).
      expect(director.activeChapter?.slug).toBe('v2-neptune');

      // Chapters chronologically AFTER V2 Neptune (PBD, V1H, V2H) are
      // still `out` — never visited on the forward scrub.
      expect(director.getState('pale-blue-dot')).toBe('out');
      expect(director.getState('v1-heliopause')).toBe('out');
      expect(director.getState('v2-heliopause')).toBe('out');

      // Every earlier chapter has reached `passed`.
      for (const slug of [
        'launch-v2',
        'launch-v1',
        'v1-jupiter',
        'v2-jupiter',
        'v1-saturn',
        'v2-saturn',
        'v2-uranus',
      ]) {
        expect(director.getState(slug)).toBe('passed');
      }
    });
  });

  describe('PBD ±1-day window is precise (placeholder integration)', () => {
    const pbdAnchor = etFromIso('1990-02-14T00:00:00Z');
    it('PBD activates at its anchor', () => {
      director.update(pbdAnchor);
      expect(director.activeChapter?.slug).toBe('pale-blue-dot');
    });

    it('PBD activates at anchor + 1 day (window end inclusive)', () => {
      director.update(pbdAnchor + SECONDS_PER_DAY);
      expect(director.activeChapter?.slug).toBe('pale-blue-dot');
    });

    it('PBD activates at anchor − 1 day (window start inclusive)', () => {
      director.update(pbdAnchor - SECONDS_PER_DAY);
      expect(director.activeChapter?.slug).toBe('pale-blue-dot');
    });

    it('PBD deactivates 2 days past anchor (well outside ±1 day window)', () => {
      director.update(pbdAnchor + 2 * SECONDS_PER_DAY);
      expect(director.activeChapter).toBeNull();
    });
  });
});
