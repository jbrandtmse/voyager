// @vitest-environment happy-dom
/**
 * Story 6.1 AC7 — end-to-end integration test for the AudioPlaybackService
 * exercised against a real-shaped `ChapterDirector` (NOT mocked) using
 * the production `ALL_CHAPTERS` registry. Mirrors the wire-up topology
 * `main.ts` installs: a single `chapterDirector.subscribe` callback
 * narrows on Golden-Record slugs and forwards `to === 'held'` /
 * `from === 'held'` to the service. The audio engine is stubbed (happy-
 * dom has no Web Audio API; the engine surface is tested via call-
 * recording).
 *
 * Per Rule 1 + Rule 3, the lead's Chrome DevTools MCP smoke is the real-
 * runtime gate — this happy-dom integration test is the per-tier
 * confidence layer. It exercises:
 *   - Activation flag flips correctly on `to === 'held'` for each of the
 *     5 Golden-Record slugs.
 *   - No activation fires on non-Golden-Record slugs (Jupiter, Saturn,
 *     Uranus, Neptune).
 *   - Pause / resume propagates through the ClockManager subscription.
 *   - Reduced-motion does NOT affect the 1500ms cross-fade timing — the
 *     audio's own register (AC6).
 *   - Scrubbing backward across a chapter marker fades cleanly out.
 *
 * The test uses a CONCRETE `ChapterDirector` against the real
 * `ALL_CHAPTERS` registry — no mocked transition events. The director
 * is driven via its public `update(et)` API, which produces the real
 * transition events the production main.ts subscriber filters.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import {
  AudioPlaybackService,
  GOLDEN_RECORD_CHAPTER_SLUGS,
  isGoldenRecordSlug,
  type AudioEngineLike,
  type StorageLike,
  type GoldenRecordSlug,
} from '../src/services/audio-playback-service';

interface EngineCall {
  method: string;
  slug: GoldenRecordSlug;
  ms?: number;
}

const makeEngine = (): { engine: AudioEngineLike; calls: EngineCall[] } => {
  const calls: EngineCall[] = [];
  const engine: AudioEngineLike = {
    prepare(slug) {
      calls.push({ method: 'prepare', slug });
    },
    fadeIn(slug, ms) {
      calls.push({ method: 'fadeIn', slug, ms });
    },
    fadeOut(slug, ms) {
      calls.push({ method: 'fadeOut', slug, ms });
    },
    pause(slug) {
      calls.push({ method: 'pause', slug });
    },
    resume(slug) {
      calls.push({ method: 'resume', slug });
    },
    dispose() {
      calls.push({ method: 'dispose', slug: 'launch-v1' });
    },
  };
  return { engine, calls };
};

const makeStorage = (): StorageLike => {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
};

const buildPipeline = (): {
  director: ChapterDirector;
  service: AudioPlaybackService;
  engine: AudioEngineLike;
  calls: EngineCall[];
} => {
  const { engine, calls } = makeEngine();
  const service = new AudioPlaybackService({
    audioEngine: engine,
    storage: makeStorage(),
    generateSessionId: () => 'session-int',
  });
  const director = new ChapterDirector(ALL_CHAPTERS);
  // This mirrors the production main.ts subscriber EXACTLY.
  director.subscribe((event) => {
    const slug = event.chapter.slug;
    if (!isGoldenRecordSlug(slug)) return;
    if (event.to === 'held') {
      service.onChapterEnter(slug);
    } else if (event.from === 'held') {
      service.onChapterExit(slug);
    }
  });
  return { director, service, engine, calls };
};

const anchorOf = (slug: string): number => {
  const spec = findChapterBySlug(slug);
  if (spec === null) throw new Error(`Unknown chapter slug: ${slug}`);
  return spec.anchorEt;
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Story 6.1 AC7 — chapter-window activation for each Golden Record slug', () => {
  for (const slug of GOLDEN_RECORD_CHAPTER_SLUGS) {
    it(`activates audio at the ${slug} anchor when toggle is on`, () => {
      const { director, service, calls } = buildPipeline();
      service.setOn(true);
      const anchor = anchorOf(slug);
      // Seed at a time well before the chapter window.
      director.update(anchor - 1_000_000_000);
      calls.length = 0;
      // Walk into the chapter window (mid-anchor).
      director.update(anchor);
      // The service should be active for this slug.
      const state = service.getState();
      expect(state.activeSlug).toBe(slug);
      expect(state.playing).toBe(true);
      // The engine should have received a fadeIn call for this slug
      // at the canonical 1500ms duration.
      const fadeInCalls = calls.filter(
        (c) => c.method === 'fadeIn' && c.slug === slug,
      );
      expect(fadeInCalls.length).toBeGreaterThanOrEqual(1);
      expect(fadeInCalls[0]?.ms).toBe(1500);
    });
  }

  it('deactivates audio on chapter-window exit (cross-window scrub)', () => {
    const { director, service } = buildPipeline();
    service.setOn(true);
    const launchV1Anchor = anchorOf('launch-v1');
    const launchV2Anchor = anchorOf('launch-v2');
    director.update(launchV1Anchor);
    expect(service.getState().activeSlug).toBe('launch-v1');
    // Scrub forward into V2's launch window. The director will fire
    // exiting+passed for launch-v1 then entering+held for launch-v2.
    director.update(launchV2Anchor);
    expect(service.getState().activeSlug).toBe('launch-v2');
  });

  it('reverse scrub (scrubbing backward across a chapter marker) clears audio', () => {
    const { director, service } = buildPipeline();
    service.setOn(true);
    const launchV1Anchor = anchorOf('launch-v1');
    director.update(launchV1Anchor);
    expect(service.getState().activeSlug).toBe('launch-v1');
    // Reverse scrub to before mission start (very negative ET).
    director.update(launchV1Anchor - 1_000_000_000);
    // Out of every window — service should be silent.
    expect(service.getState().activeSlug).toBeNull();
    expect(service.getState().playing).toBe(false);
  });

  it('outside Golden-Record windows: V1 Jupiter encounter has no audio activation (final state)', () => {
    const { director, service } = buildPipeline();
    service.setOn(true);
    const v1JupiterAnchor = anchorOf('v1-jupiter');
    director.update(v1JupiterAnchor);
    // Active slug should be null (V1 Jupiter is not Golden Record).
    // Note: the director's walk from initial-state DOES fire transient
    // 'held' events for launch-v1 and launch-v2 because the ET cursor
    // moves chronologically through their windows — but by the time
    // it lands at v1-jupiter, those chapters are in 'passed' state and
    // the service's active slug is null again. This mirrors the
    // production "scrub from cold-load through multiple chapters in
    // one update" path.
    expect(service.getState().activeSlug).toBeNull();
    expect(service.getState().playing).toBe(false);
  });

  it('outside Golden-Record windows: V2 Neptune encounter has no audio activation (final state)', () => {
    const { director, service } = buildPipeline();
    service.setOn(true);
    const v2NeptuneAnchor = anchorOf('v2-neptune');
    director.update(v2NeptuneAnchor);
    expect(service.getState().activeSlug).toBeNull();
    expect(service.getState().playing).toBe(false);
  });

  it('chapter director walks: from initial seed to v1-jupiter triggers passes through launches, ends silent', () => {
    const { director, service, calls } = buildPipeline();
    service.setOn(true);
    const v1JupiterAnchor = anchorOf('v1-jupiter');
    director.update(v1JupiterAnchor);
    // Final state is OUTSIDE every Golden-Record window — the service
    // ends with active slug null.
    expect(service.getState().activeSlug).toBeNull();
    // The transient walks through launch-v1 + launch-v2 DID call fadeIn
    // for both (each held event briefly activated the slug) and then
    // fadeOut on the exit, so we expect at least 1 fadeOut per slug.
    const launchV1FadeOuts = calls.filter(
      (c) => c.method === 'fadeOut' && c.slug === 'launch-v1',
    );
    expect(launchV1FadeOuts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Story 6.1 AC7 — pause / resume propagation', () => {
  it('simulation pause inside a window pauses audio (no fade)', () => {
    const { director, service, calls } = buildPipeline();
    service.setOn(true);
    director.update(anchorOf('pale-blue-dot'));
    calls.length = 0;
    service.onPlayStateChange(false);
    const pauseCalls = calls.filter((c) => c.method === 'pause');
    expect(pauseCalls).toHaveLength(1);
    expect(pauseCalls[0]?.slug).toBe('pale-blue-dot');
    expect(service.getState().playing).toBe(false);
  });

  it('simulation resume inside a window fades audio in', () => {
    const { director, service, calls } = buildPipeline();
    service.setOn(true);
    director.update(anchorOf('launch-v2'));
    service.onPlayStateChange(false);
    calls.length = 0;
    service.onPlayStateChange(true);
    const fadeInCalls = calls.filter(
      (c) => c.method === 'fadeIn' && c.slug === 'launch-v2',
    );
    expect(fadeInCalls.length).toBeGreaterThanOrEqual(1);
    expect(service.getState().playing).toBe(true);
  });
});

describe('Story 6.1 AC6 — reduced motion does not affect audio cross-fade', () => {
  it('matchMedia stub for prefers-reduced-motion does NOT shorten the 1500ms fade', () => {
    // happy-dom does provide matchMedia, but reduced-motion is a CSS
    // preference. The service hard-codes 1500ms and does NOT consult
    // any motion-preference signal — verify by stubbing matchMedia to
    // report reduced-motion=true and checking the engine STILL receives
    // a 1500ms fadeIn.
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    try {
      const { director, service, calls } = buildPipeline();
      service.setOn(true);
      director.update(anchorOf('v2-heliopause'));
      const fadeInCalls = calls.filter(
        (c) => c.method === 'fadeIn' && c.slug === 'v2-heliopause',
      );
      expect(fadeInCalls.length).toBeGreaterThanOrEqual(1);
      // 1500ms is the canonical audio cross-fade per AC5; reduced-motion
      // must NOT shorten it (audio is its own register per AC6).
      expect(fadeInCalls[0]?.ms).toBe(1500);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('matchMedia stub for prefers-reduced-transparency does NOT affect audio', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-transparency'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    try {
      const { director, service, calls } = buildPipeline();
      service.setOn(true);
      director.update(anchorOf('pale-blue-dot'));
      const fadeInCalls = calls.filter(
        (c) => c.method === 'fadeIn' && c.slug === 'pale-blue-dot',
      );
      expect(fadeInCalls.length).toBeGreaterThanOrEqual(1);
      expect(fadeInCalls[0]?.ms).toBe(1500);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});

describe('Story 6.1 AC7 — toggle-state lifecycle', () => {
  it('with toggle off, even entering a Golden-Record window does NOT activate audio', () => {
    const { director, service, calls } = buildPipeline();
    // toggle stays OFF (default).
    director.update(anchorOf('launch-v1'));
    const fadeIns = calls.filter((c) => c.method === 'fadeIn');
    expect(fadeIns).toHaveLength(0);
    // Active slug IS still tracked — the service knows the simulation
    // is inside an audio window, it just chooses not to play.
    expect(service.getState().activeSlug).toBe('launch-v1');
    expect(service.getState().playing).toBe(false);
  });

  it('flipping toggle ON while inside a window fades audio in', () => {
    const { director, service, calls } = buildPipeline();
    director.update(anchorOf('launch-v1'));
    calls.length = 0;
    service.setOn(true);
    const fadeIns = calls.filter(
      (c) => c.method === 'fadeIn' && c.slug === 'launch-v1',
    );
    expect(fadeIns.length).toBeGreaterThanOrEqual(1);
    expect(service.getState().playing).toBe(true);
  });

  it('flipping toggle OFF while inside a window fades audio out', () => {
    const { director, service, calls } = buildPipeline();
    service.setOn(true);
    director.update(anchorOf('v1-heliopause'));
    calls.length = 0;
    service.setOn(false);
    const fadeOuts = calls.filter(
      (c) => c.method === 'fadeOut' && c.slug === 'v1-heliopause',
    );
    expect(fadeOuts).toHaveLength(1);
    expect(fadeOuts[0]?.ms).toBe(1500);
  });
});
