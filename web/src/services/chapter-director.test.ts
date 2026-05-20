import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChapterDirector } from './chapter-director';
import type { ChapterSpec, ChapterTransitionEvent } from '../types/chapter';

/**
 * Hand-rolled chapter fixtures. Three chapters, non-overlapping windows,
 * sorted by anchorEt. Using small integer ETs keeps the arithmetic
 * obvious to a future reader of the test.
 */
const makeFixture = (): readonly ChapterSpec[] => {
  return Object.freeze([
    {
      slug: 'alpha',
      name: 'Alpha',
      markerLabel: 'A1',
      anchorEt: 100,
      windowStartEt: 90,
      windowEndEt: 110,
      spacecraft: 'v1',
    },
    {
      slug: 'beta',
      name: 'Beta',
      markerLabel: 'B2',
      anchorEt: 200,
      windowStartEt: 190,
      windowEndEt: 210,
      spacecraft: 'v2',
    },
    {
      slug: 'gamma',
      name: 'Gamma',
      markerLabel: 'G3',
      anchorEt: 300,
      windowStartEt: 290,
      windowEndEt: 310,
      spacecraft: 'both',
    },
  ]) as readonly ChapterSpec[];
};

describe('ChapterDirector (Story 2.1 AC1 + AC5)', () => {
  let chapters: readonly ChapterSpec[];
  let director: ChapterDirector;
  let events: ChapterTransitionEvent[];

  beforeEach(() => {
    chapters = makeFixture();
    director = new ChapterDirector(chapters);
    events = [];
    director.subscribe((e) => events.push(e));
  });

  describe('initial state', () => {
    it('every chapter starts in `out` and activeChapter is null', () => {
      for (const c of chapters) {
        expect(director.getState(c.slug)).toBe('out');
      }
      expect(director.activeChapter).toBeNull();
    });

    it('getState returns `out` for unknown slugs', () => {
      expect(director.getState('does-not-exist')).toBe('out');
    });
  });

  describe('forward traversal through a single chapter window (AC5)', () => {
    it('fires out→entering→held→exiting→passed exactly once each', () => {
      // Step the cursor PAST chapter alpha in one update().
      director.update(150);

      // Alpha is the only chapter affected on this update. Beta + gamma
      // are still in `out` because the cursor is below their start.
      const alphaEvents = events.filter((e) => e.chapter.slug === 'alpha');
      expect(alphaEvents.map((e) => `${e.from}->${e.to}`)).toEqual([
        'out->entering',
        'entering->held',
        'held->exiting',
        'exiting->passed',
      ]);
      expect(director.getState('alpha')).toBe('passed');
      expect(director.getState('beta')).toBe('out');
      expect(director.getState('gamma')).toBe('out');
      expect(director.activeChapter).toBeNull();
    });

    it('settles in `held` when the cursor lands inside a chapter window', () => {
      director.update(100); // anchor of alpha
      expect(director.getState('alpha')).toBe('held');
      expect(director.activeChapter?.slug).toBe('alpha');

      const alphaEvents = events.filter((e) => e.chapter.slug === 'alpha');
      expect(alphaEvents.map((e) => `${e.from}->${e.to}`)).toEqual([
        'out->entering',
        'entering->held',
      ]);
    });

    it('settles in `out` when the cursor lands before the first window', () => {
      director.update(50);
      expect(director.getState('alpha')).toBe('out');
      expect(director.activeChapter).toBeNull();
      expect(events).toHaveLength(0);
    });
  });

  describe('reverse traversal (AC5 — reverse symmetry)', () => {
    it('fires passed→exiting→held→entering→out exactly once each on backwards scrub', () => {
      // Forward past alpha first.
      director.update(150);
      events.length = 0; // reset history

      // Now scrub backwards before alpha's window starts.
      director.update(50);

      const alphaEvents = events.filter((e) => e.chapter.slug === 'alpha');
      expect(alphaEvents.map((e) => `${e.from}->${e.to}`)).toEqual([
        'passed->exiting',
        'exiting->held',
        'held->entering',
        'entering->out',
      ]);
      expect(director.getState('alpha')).toBe('out');
      expect(director.activeChapter).toBeNull();
    });

    it('reverse-scrubbing into the middle of a window settles in `held`', () => {
      director.update(150); // past alpha
      events.length = 0;
      director.update(100); // back into alpha's anchor

      const alphaEvents = events.filter((e) => e.chapter.slug === 'alpha');
      expect(alphaEvents.map((e) => `${e.from}->${e.to}`)).toEqual([
        'passed->exiting',
        'exiting->held',
      ]);
      expect(director.getState('alpha')).toBe('held');
      expect(director.activeChapter?.slug).toBe('alpha');
    });
  });

  describe('rapid scrub (AC5 — no transitions skipped)', () => {
    it('single update() crossing three chapter windows fires 12 transitions in chronological order', () => {
      director.update(400); // past gamma — crosses alpha, beta, gamma in one shot

      // All 3 chapters × 4 transitions each = 12 transitions total.
      expect(events).toHaveLength(12);

      // Order: alpha 4, then beta 4, then gamma 4 (chronological).
      const slugsInOrder = events.map((e) => e.chapter.slug);
      expect(slugsInOrder).toEqual([
        'alpha', 'alpha', 'alpha', 'alpha',
        'beta', 'beta', 'beta', 'beta',
        'gamma', 'gamma', 'gamma', 'gamma',
      ]);

      // Each chapter's 4 transitions follow the standard out→passed walk.
      for (const slug of ['alpha', 'beta', 'gamma']) {
        const e = events.filter((ev) => ev.chapter.slug === slug);
        expect(e.map((x) => `${x.from}->${x.to}`)).toEqual([
          'out->entering',
          'entering->held',
          'held->exiting',
          'exiting->passed',
        ]);
        expect(director.getState(slug)).toBe('passed');
      }
    });

    it('reverse rapid scrub across three chapters fires 12 transitions in reverse chronological order', () => {
      director.update(400);
      events.length = 0;
      director.update(0); // back to the start — crosses gamma, beta, alpha

      expect(events).toHaveLength(12);
      const slugsInOrder = events.map((e) => e.chapter.slug);
      expect(slugsInOrder).toEqual([
        'gamma', 'gamma', 'gamma', 'gamma',
        'beta', 'beta', 'beta', 'beta',
        'alpha', 'alpha', 'alpha', 'alpha',
      ]);

      for (const slug of ['alpha', 'beta', 'gamma']) {
        expect(director.getState(slug)).toBe('out');
      }
    });
  });

  describe('idempotency (AC5)', () => {
    it('two consecutive update(et) calls with the same et fire zero subscribers on the second call', () => {
      director.update(100);
      const firstCount = events.length;
      expect(firstCount).toBeGreaterThan(0);

      director.update(100); // same et
      expect(events).toHaveLength(firstCount); // no change
    });

    it('non-finite ETs are silently ignored', () => {
      director.update(Number.NaN);
      director.update(Number.POSITIVE_INFINITY);
      expect(events).toHaveLength(0);
      expect(director.activeChapter).toBeNull();
    });
  });

  describe('activeChapter getter', () => {
    it('returns the chapter currently in `held`, or null if between windows', () => {
      expect(director.activeChapter).toBeNull();

      director.update(100); // inside alpha
      expect(director.activeChapter?.slug).toBe('alpha');

      director.update(150); // between alpha and beta
      expect(director.activeChapter).toBeNull();

      director.update(200); // inside beta
      expect(director.activeChapter?.slug).toBe('beta');

      director.update(310); // at the edge of gamma's end (still held)
      expect(director.activeChapter?.slug).toBe('gamma');

      director.update(311); // just past gamma
      expect(director.activeChapter).toBeNull();
    });
  });

  describe('subscribe / unsubscribe contract', () => {
    it('subscribe returns an unsub function that detaches the callback', () => {
      const second = vi.fn();
      const unsub = director.subscribe(second);

      director.update(100);
      expect(second).toHaveBeenCalled();

      const callsBefore = second.mock.calls.length;
      unsub();
      director.update(200);
      expect(second.mock.calls.length).toBe(callsBefore);
    });

    it('a throwing subscriber does NOT prevent other subscribers from firing', () => {
      const calls: string[] = [];
      director.subscribe(() => {
        throw new Error('boom');
      });
      director.subscribe((e) => {
        calls.push(`${e.chapter.slug}:${e.from}->${e.to}`);
      });

      // Silence the expected console.error so test output stays clean.
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        director.update(100);
      } finally {
        errSpy.mockRestore();
      }

      // The third subscriber (`calls.push`) was called for every alpha
      // event even though the second one threw on each call.
      const alphaEvents = calls.filter((c) => c.startsWith('alpha'));
      expect(alphaEvents.length).toBeGreaterThan(0);
    });

    it('dispose() detaches every subscriber', () => {
      director.dispose();
      director.update(100);
      expect(events).toHaveLength(0);
    });
  });

  describe('transition event payload', () => {
    it('carries the chapter reference, from/to states, and the new et', () => {
      director.update(150);
      const first = events[0];
      expect(first.chapter.slug).toBe('alpha');
      expect(first.from).toBe('out');
      expect(first.to).toBe('entering');
      expect(first.et).toBe(150);
    });
  });
});
