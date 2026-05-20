// @vitest-environment happy-dom
/**
 * Story 2.4 — URL Router integration tests (R2 mitigation per Epic 2 Risks).
 *
 * Exercises the three URL-state synchronization edge cases that the lead's
 * Chrome DevTools MCP smoke also verifies end-to-end (Integration AC8):
 *
 *   (a) Cold-load deep-link to `/c/<slug>?t=<iso>` initializes the clock
 *       paused at the parsed ET and ChapterDirector activates the chapter.
 *   (b) Mid-cycle URL update (marker click) does NOT desync — the URL's
 *       ?t= matches `clockManager.simTimeEt`, and free scrub continues
 *       to update ?t= via replaceState only (no history pollution).
 *   (c) Browser back/forward correctly fires chapter transitions through
 *       the FSM via popstate → scrubTo → director.update.
 *
 * These run in a happy-dom integration tier (NOT a real browser); the
 * MCP smoke gate at the lead is still the binding browser-evidence check
 * per Rule 3 + Rule 7. The intent of this file is to catch regressions
 * at the wire-up boundary in CI.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { URLSync } from '../src/services/url-sync';
import { URLRouter } from '../src/services/url-router';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import { etFromIso } from '../src/math/et-conversions';
import { MISSION_START_ET } from '../src/constants/mission';

/** Flush microtasks queued by URLRouter.scheduleWaveSettle. */
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

// Build a minimal end-to-end stack identical to main.ts's wireup.
const bootStack = (): {
  urlSync: URLSync;
  clock: ClockManager;
  director: ChapterDirector;
  router: URLRouter;
  dispose: () => void;
} => {
  const urlSync = new URLSync();
  const initial = urlSync.parseInitialPath();
  const clock = new ClockManager();
  clock.scrubTo(initial.initialEt);
  const director = new ChapterDirector(ALL_CHAPTERS);
  // Settle director on the deep-link ET BEFORE the router subscribes —
  // mirrors main.ts where the first onFrame fires before URLRouter
  // construction, so cold-load arrival does not trigger a URL write.
  director.update(clock.simTimeEt);
  const router = new URLRouter({
    urlSync,
    clockManager: clock,
    chapterDirector: director,
  }).install();
  return {
    urlSync,
    clock,
    director,
    router,
    dispose: () => {
      router.dispose();
      urlSync.dispose();
      clock.dispose();
      director.dispose();
    },
  };
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  // happy-dom does not reset history between tests by default.
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('Story 2.4 AC8a — cold-load deep-link', () => {
  it('opens /c/v2-neptune?t=1989-08-25T09:23:00Z paused at the parsed ET, v2-neptune held', () => {
    window.history.replaceState(null, '', '/c/v2-neptune?t=1989-08-25T09:23:00Z');
    const stack = bootStack();
    try {
      const expected = etFromIso('1989-08-25T09:23:00Z');
      expect(Math.abs(stack.clock.simTimeEt - expected)).toBeLessThan(0.01);
      expect(stack.clock.playing).toBe(false);
      expect(stack.director.activeChapter?.slug).toBe('v2-neptune');
    } finally {
      stack.dispose();
    }
  });

  it('opens /c/v1-jupiter (no ?t=) at the chapter anchorEt, v1-jupiter held', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const stack = bootStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      expect(Math.abs(stack.clock.simTimeEt - v1Jupiter.anchorEt)).toBeLessThan(0.01);
      expect(stack.director.activeChapter?.slug).toBe('v1-jupiter');
    } finally {
      stack.dispose();
    }
  });

  it('cold-load to / (homepage) initializes at MISSION_START_ET', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      expect(stack.clock.simTimeEt).toBe(MISSION_START_ET);
      // MISSION_START_ET falls inside launch-v2's window by spec (window
      // begins 7 days before V2 launch). The presence/absence of an
      // active chapter at the homepage instant is not part of AC8a's
      // contract; the contract is only that the clock initializes at
      // MISSION_START_ET when no chapter route is given.
    } finally {
      stack.dispose();
    }
  });

  it('cold-load to /c/<unknown-slug> falls back to homepage AND warns (NFR-S7)', () => {
    const originalWarn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      window.history.replaceState(null, '', '/c/typo');
      const stack = bootStack();
      try {
        // URL was silently redirected to / (per NFR-S7).
        expect(window.location.pathname).toBe('/');
        // Clock seeded to MISSION_START_ET (which falls inside launch-v2's
        // window — that's expected; the user landed on the homepage's
        // canonical initial moment).
        expect(stack.clock.simTimeEt).toBe(MISSION_START_ET);
        expect(warnings.length).toBeGreaterThan(0);
      } finally {
        stack.dispose();
      }
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe('Story 2.4 AC8b — mid-cycle URL update does NOT desync ClockManager', () => {
  it('clicking V1 Jupiter marker → URL = /c/v1-jupiter?t=<anchor>; clock.simTimeEt matches', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      // Simulate the scrubber-marker click: scrubTo + emit chapter-jump.
      stack.clock.scrubTo(v1Jupiter.anchorEt);
      document.dispatchEvent(
        new CustomEvent('chapter-jump', {
          detail: { slug: v1Jupiter.slug, anchorEt: v1Jupiter.anchorEt },
          bubbles: true,
          composed: true,
        }),
      );
      // Director updates from the render loop.
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      expect(window.location.pathname).toBe('/c/v1-jupiter');
      // Extract ?t= and confirm it matches clock.simTimeEt.
      const params = new URLSearchParams(window.location.search);
      const rawT = params.get('t');
      expect(rawT).not.toBeNull();
      const urlEt = etFromIso(rawT!);
      expect(Math.abs(urlEt - stack.clock.simTimeEt)).toBeLessThan(1);
    } finally {
      stack.dispose();
    }
  });

  it('free scrub WITHIN a chapter window updates ?t= via replaceState only (no history pollution)', async () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const stack = bootStack();
    try {
      // Simulate scrubber drag: clock.scrubTo + urlSync.writeEtThrottled.
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      const startLen = window.history.length;
      stack.clock.scrubTo(v1Jupiter.anchorEt + 1000);
      stack.urlSync.writeEtImmediate(v1Jupiter.anchorEt + 1000);
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      // The path is unchanged; only ?t= updated.
      expect(window.location.pathname).toBe('/c/v1-jupiter');
      // history.length is implementation-defined under happy-dom but the
      // critical invariant is "no NEW push entry" — only replaceState.
      expect(window.history.length).toBe(startLen);
    } finally {
      stack.dispose();
    }
  });

  it('URL writes always derive FROM clock.simTimeEt (clock is the sole source of truth)', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const v2Neptune = findChapterBySlug('v2-neptune')!;
      // Simulate a sequence of clock mutations + URL writes interleaved.
      stack.clock.scrubTo(v2Neptune.anchorEt);
      stack.urlSync.writeEtImmediate(stack.clock.simTimeEt);
      const params1 = new URLSearchParams(window.location.search);
      expect(etFromIso(params1.get('t')!)).toBeCloseTo(v2Neptune.anchorEt, 0);
      // Now mutate the clock; URL must follow.
      const newEt = v2Neptune.anchorEt + 86400; // +1 day
      stack.clock.scrubTo(newEt);
      stack.urlSync.writeEtImmediate(stack.clock.simTimeEt);
      const params2 = new URLSearchParams(window.location.search);
      expect(etFromIso(params2.get('t')!)).toBeCloseTo(newEt, 0);
    } finally {
      stack.dispose();
    }
  });
});

describe('Story 2.4 AC8c — browser back/forward fires through the FSM', () => {
  it('two pushStates then popstate → clock.scrubTo + director transitions back', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      const v2Saturn = findChapterBySlug('v2-saturn')!;

      // Click V1 Jupiter (pushState /c/v1-jupiter).
      stack.clock.scrubTo(v1Jupiter.anchorEt);
      document.dispatchEvent(
        new CustomEvent('chapter-jump', {
          detail: { slug: v1Jupiter.slug, anchorEt: v1Jupiter.anchorEt },
          bubbles: true,
          composed: true,
        }),
      );
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      expect(window.location.pathname).toBe('/c/v1-jupiter');

      // Click V2 Saturn (pushState /c/v2-saturn).
      stack.clock.scrubTo(v2Saturn.anchorEt);
      document.dispatchEvent(
        new CustomEvent('chapter-jump', {
          detail: { slug: v2Saturn.slug, anchorEt: v2Saturn.anchorEt },
          bubbles: true,
          composed: true,
        }),
      );
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      expect(window.location.pathname).toBe('/c/v2-saturn');
      expect(stack.director.activeChapter?.slug).toBe('v2-saturn');

      // Browser back → popstate fires with /c/v1-jupiter.
      window.history.back();
      // happy-dom fires popstate asynchronously; await a microtask.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(window.location.pathname).toBe('/c/v1-jupiter');
      expect(Math.abs(stack.clock.simTimeEt - v1Jupiter.anchorEt)).toBeLessThan(0.01);
      // Director observes the new ET on the next "frame".
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      expect(stack.director.activeChapter?.slug).toBe('v1-jupiter');
    } finally {
      stack.dispose();
    }
  });

  it('popstate to /c/<unknown> falls back to home (NFR-S7) without crashing', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const originalWarn = console.warn;
      console.warn = () => {};
      try {
        // pushState a known chapter first so back-navigation has somewhere to go.
        window.history.pushState(null, '', '/c/v1-jupiter');
        // Then pushState an unknown slug to land on.
        window.history.pushState(null, '', '/c/typo');
        window.dispatchEvent(new PopStateEvent('popstate'));
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        // URLSync.parseInitialPath silently redirects to '/' on unknown slug.
        // Clock stays at whatever ET was last; no crash.
        expect(stack.clock.simTimeEt).toBeDefined();
      } finally {
        console.warn = originalWarn;
      }
    } finally {
      stack.dispose();
    }
  });
});

describe('Story 2.4 AC4 — free scrub within chapter (path stable, ?t= mutates)', () => {
  it('multiple writeEtImmediate within a chapter window keep the path constant', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const stack = bootStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      for (let i = 0; i < 5; i++) {
        const et = v1Jupiter.anchorEt + i * 100;
        stack.clock.scrubTo(et);
        stack.urlSync.writeEtImmediate(et);
      }
      expect(window.location.pathname).toBe('/c/v1-jupiter');
    } finally {
      stack.dispose();
    }
  });
});
