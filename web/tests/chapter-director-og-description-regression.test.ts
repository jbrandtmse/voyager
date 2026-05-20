/**
 * Story 2.6 QA — chapter-director ChapterSpec.ogDescription regression.
 *
 * Story 2.6 added a NEW required field to `ChapterSpec`:
 *
 *   readonly ogDescription: string;
 *
 * ChapterDirector is a long-lived consumer of `ChapterSpec` (Story 2.1).
 * Per Voyager skill rule 2 (Consumed-by linkage), adding a required field
 * to a consumed type is a wire-up event that needs an explicit regression
 * test. The contract IS that the director treats this field as opaque
 * data — it never reads or copies `ogDescription`; only the build-time
 * OG generator reads it.
 *
 * This file pins:
 *   1. The director constructs cleanly from the real `ALL_CHAPTERS` (which
 *      now carries `ogDescription` per chapter).
 *   2. The director's FSM semantics (out → entering → held → exiting →
 *      passed) are independent of the new field — the same transitions
 *      fire regardless of `ogDescription` content.
 *   3. The director does NOT propagate `ogDescription` into transition
 *      events (the field never appears in subscriber payloads except
 *      indirectly via `event.chapter.ogDescription`, which is the same
 *      ChapterSpec object the test built it from).
 *   4. `activeChapter` returns a ChapterSpec WITH the new field exposed
 *      to downstream consumers that might want to render it (e.g. a
 *      future HUD chapter card).
 *
 * If a future refactor changes ChapterDirector to mutate or drop fields
 * on the way through, this test fires.
 */

import { describe, it, expect } from 'vitest';
import { ALL_CHAPTERS } from '../src/chapters/registry';
import { ChapterDirector } from '../src/services/chapter-director';
import type {
  ChapterSpec,
  ChapterTransitionEvent,
} from '../src/types/chapter';

describe('Story 2.6 regression — ChapterDirector with new ogDescription field', () => {
  it('constructs cleanly from real ALL_CHAPTERS (no missing field, no type drift)', () => {
    expect(() => new ChapterDirector(ALL_CHAPTERS)).not.toThrow();
    const director = new ChapterDirector(ALL_CHAPTERS);
    expect(director.activeChapter).toBeNull();
  });

  it('every chapter in ALL_CHAPTERS has a non-empty ogDescription string', () => {
    // Per AC2: "og:description = one-sentence chapter summary". This
    // is the cheapest place to verify every chapter actually authored
    // one (catches a chapter that ships with `ogDescription: ''`).
    for (const chapter of ALL_CHAPTERS) {
      expect(typeof chapter.ogDescription).toBe('string');
      expect(
        chapter.ogDescription.length,
        `${chapter.slug} ogDescription is empty`,
      ).toBeGreaterThan(0);
      // Sanity: the description should NOT contain raw HTML-special
      // chars that would break attribute serialisation (the HTML
      // emitter escapes them, but the registry contract is plain text).
      expect(chapter.ogDescription).not.toMatch(/<[^>]+>/);
    }
  });

  it('activeChapter exposes ogDescription on the held chapter (downstream readability)', () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const v2Neptune = ALL_CHAPTERS.find((c) => c.slug === 'v2-neptune');
    expect(v2Neptune).toBeDefined();
    director.update(v2Neptune!.anchorEt);
    const active = director.activeChapter;
    expect(active?.slug).toBe('v2-neptune');
    expect(active?.ogDescription).toBe(v2Neptune!.ogDescription);
    expect(active?.ogDescription).toContain('Neptune');
  });

  it('transition events preserve the ogDescription field on event.chapter', () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const events: ChapterTransitionEvent[] = [];
    director.subscribe((e) => events.push(e));
    const launchV2 = ALL_CHAPTERS.find((c) => c.slug === 'launch-v2');
    expect(launchV2).toBeDefined();
    director.update(launchV2!.anchorEt);
    // The director should have fired entering + held transitions for
    // launch-v2. Both events carry the same ChapterSpec reference.
    const launchV2Events = events.filter((e) => e.chapter.slug === 'launch-v2');
    expect(launchV2Events.length).toBeGreaterThan(0);
    for (const evt of launchV2Events) {
      expect(evt.chapter.ogDescription).toBe(launchV2!.ogDescription);
      expect(evt.chapter.ogDescription.length).toBeGreaterThan(0);
    }
  });

  it('FSM transition sequence is independent of ogDescription content', () => {
    // Same FSM contract as Story 2.1 AC5 — verify with a fixture that
    // varies ogDescription wildly (empty-on-spacecraft, very long, etc.).
    // The director should produce the same transition sequence regardless.
    const baseFixture: ReadonlyArray<ChapterSpec> = Object.freeze([
      {
        slug: 'short-desc',
        name: 'Short',
        markerLabel: 'SD',
        anchorEt: 100,
        windowStartEt: 90,
        windowEndEt: 110,
        spacecraft: 'v1',
        ogDescription: 'A.',
      },
      {
        slug: 'long-desc',
        name: 'Long',
        markerLabel: 'LD',
        anchorEt: 200,
        windowStartEt: 190,
        windowEndEt: 210,
        spacecraft: 'v2',
        ogDescription: 'A '.repeat(500) + 'very long description.',
      },
    ]);
    const director = new ChapterDirector(baseFixture);
    const events: ChapterTransitionEvent[] = [];
    director.subscribe((e) => events.push(e));
    director.update(150); // past short-desc's window, before long-desc
    const shortEvents = events
      .filter((e) => e.chapter.slug === 'short-desc')
      .map((e) => `${e.from}->${e.to}`);
    expect(shortEvents).toEqual([
      'out->entering',
      'entering->held',
      'held->exiting',
      'exiting->passed',
    ]);
    // The long-desc chapter is still 'out'.
    expect(director.getState('long-desc')).toBe('out');
  });

  it('11-chapter rapid-scrub still produces 44 transitions in chronological order', () => {
    // Confirms Story 2.1 AC5 rapid-scrub semantics still hold with the
    // real registry post-ogDescription addition. This is the most
    // likely place a "type drift on ChapterSpec" regression would
    // manifest — a runtime error during update() would short-circuit
    // the transition pipeline.
    const director = new ChapterDirector(ALL_CHAPTERS);
    const events: ChapterTransitionEvent[] = [];
    director.subscribe((e) => events.push(e));
    const lastChapter = ALL_CHAPTERS[ALL_CHAPTERS.length - 1]!;
    // Far past every chapter window.
    director.update(lastChapter.windowEndEt + 86_400 * 365);
    // 11 chapters × 4 transitions = 44.
    expect(events.length).toBe(44);
    // Every chapter ended in 'passed'.
    for (const chapter of ALL_CHAPTERS) {
      expect(director.getState(chapter.slug)).toBe('passed');
    }
  });
});
