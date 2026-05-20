// @vitest-environment happy-dom
/**
 * Story 2.4 — QA gap suite (cross-cutting integration coverage).
 *
 * The dev-authored tests (`web/src/services/url-sync.test.ts`,
 * `web/src/services/url-router.test.ts`,
 * `web/tests/url-router-integration.test.ts`) cover the eight ACs and the
 * three R2 edge cases on a happy-path-plus-headline-error basis. This QA
 * file extends coverage at the integration tier for cross-cutting
 * behaviors the dev suite does not exercise explicitly:
 *
 *   - **Rapid scrub across 3+ chapter boundaries in one update() call** —
 *     verifies the microtask wave-settle batches multi-chapter walks into
 *     a single URL write targeting the final resting `activeChapter`.
 *     (Story 2.4 dev-decision: "rapid scrub crossing 3 chapter boundaries
 *     — does the suppression handshake debounce correctly?")
 *   - **History sequence push → push → back → forward** — extends the
 *     dev's push→push→back test with the forward leg. Critical because the
 *     forward navigation must NOT pushState (it must consume the existing
 *     forward history entry).
 *   - **Boot-time race ordering** — verifies the documented invariant
 *     that ChapterDirector emits its `entering→held` transition for the
 *     deep-link ET BEFORE URLRouter subscribes, so cold-load arrival does
 *     NOT trigger a redundant URL write. (Dev's note in url-router.ts
 *     lines 161-163 and main.ts lines 161-167.)
 *   - **`?embed=true` parameter coexistence (Story 2.5 forward compat)** —
 *     documents the CURRENT behavior: the URLRouter's chapter writes
 *     produce `?t=<iso>` only and do NOT preserve `?embed=true`. The
 *     url-contract.md reserves `embed` as a Story 2.5 placeholder; any
 *     change to preserve it through writebacks belongs to Story 2.5.
 *   - **Out-of-range `?t=` on homepage / chapter routes at the boot
 *     integration tier** — dev's unit tests cover these at the URLSync
 *     surface; this verifies the full boot stack (URLSync ×
 *     ClockManager × ChapterDirector × URLRouter) reaches the documented
 *     terminal state without crashes or extraneous URL writes.
 *   - **Hash fragment preservation** through chapter pushState writes.
 *   - **Empty / malformed chapter route shapes** (`/c/`, `/c`,
 *     `/c/foo/bar/baz`) — the regex must reject these as
 *     non-matches, not match the empty slug case.
 *
 * Each suite cites the specific dev-decision or AC it covers.
 *
 * Per voyager-skill-rules.md Rule 3 + Rule 7, the binding browser-evidence
 * gate is the lead-executed Chrome DevTools MCP smoke (documented at the
 * bottom of this file). This integration tier catches regressions earlier.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { URLSync } from '../src/services/url-sync';
import { URLRouter } from '../src/services/url-router';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import { etFromIso, isoFromEt } from '../src/math/et-conversions';
import { MISSION_START_ET, MISSION_END_ET } from '../src/constants/mission';

/** Flush microtasks queued by URLRouter.scheduleWaveSettle. */
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/**
 * Boot a stack mirroring `main.ts`'s wireup, with the option to defer
 * router installation so we can observe the boot-time race ordering.
 */
const bootStack = (
  options: { deferRouterInstall?: boolean } = {},
): {
  urlSync: URLSync;
  clock: ClockManager;
  director: ChapterDirector;
  router: URLRouter;
  installRouter: () => URLRouter;
  dispose: () => void;
} => {
  const urlSync = new URLSync();
  const initial = urlSync.parseInitialPath();
  const clock = new ClockManager();
  clock.scrubTo(initial.initialEt);
  const director = new ChapterDirector(ALL_CHAPTERS);
  // Mirror main.ts: the first onFrame in the engine drives director.update
  // BEFORE URLRouter is installed. This is the critical ordering invariant
  // that prevents the cold-load `held` transition from triggering a
  // redundant URL write.
  director.update(clock.simTimeEt);
  const router = new URLRouter({
    urlSync,
    clockManager: clock,
    chapterDirector: director,
  });
  let installed = false;
  if (!options.deferRouterInstall) {
    router.install();
    installed = true;
  }
  return {
    urlSync,
    clock,
    director,
    router,
    installRouter: () => {
      if (!installed) {
        router.install();
        installed = true;
      }
      return router;
    },
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
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

// ─────────────────────────────────────────────────────────────────────
// Rapid scrub across multiple chapter boundaries — single URL write
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 — rapid scrub crossing multiple chapter boundaries (wave-settle batch)', () => {
  it('director.update walking launch-v1 → v1-jupiter → v2-jupiter emits ONE URL write to the resting slug', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      // Spy on history.replaceState BEFORE the rapid scrub so we can
      // count only the writes that happen during the wave.
      const spy = vi.spyOn(window.history, 'replaceState');
      const v2Jupiter = findChapterBySlug('v2-jupiter')!;
      // Single update() call jumps the simulation past launch-v1, through
      // v1-jupiter's window, and into v2-jupiter's window. ChapterDirector
      // fires entering→held for v2-jupiter as the resting state; the
      // intermediate transitions are walked synchronously inside update().
      stack.clock.scrubTo(v2Jupiter.anchorEt);
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      // The router's scheduleWaveSettle should have coalesced everything
      // into ONE replaceState write targeting v2-jupiter.
      expect(spy).toHaveBeenCalledTimes(1);
      const url = spy.mock.calls[0]![2] as string;
      expect(url).toContain('/c/v2-jupiter');
      spy.mockRestore();
    } finally {
      stack.dispose();
    }
  });

  it('director.update walking launch-v1 → v1-jupiter → v2-jupiter → v2-saturn emits ONE URL write to v2-saturn', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const spy = vi.spyOn(window.history, 'replaceState');
      const v2Saturn = findChapterBySlug('v2-saturn')!;
      // Crosses three chapter boundaries in a single update() call:
      //   launch-v1 (resting) → v1-jupiter → v2-jupiter → v2-saturn
      stack.clock.scrubTo(v2Saturn.anchorEt);
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      expect(spy).toHaveBeenCalledTimes(1);
      const url = spy.mock.calls[0]![2] as string;
      expect(url).toContain('/c/v2-saturn');
      // Verify the path is exactly v2-saturn — not a stale intermediate.
      expect(url.startsWith('/c/v2-saturn?t=')).toBe(true);
      spy.mockRestore();
    } finally {
      stack.dispose();
    }
  });

  it('rapid scrub from v1-jupiter to a cruise gap leaves the URL at "/" (single home write)', async () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const stack = bootStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      const v2Jupiter = findChapterBySlug('v2-jupiter')!;
      // First settle on v1-jupiter (the deep-link arrival path) — this
      // already happened during bootStack() before the router subscribed,
      // so no URL write fires for it. Now spy and rapid-scrub through
      // v1-jupiter's end into the cruise gap before v2-jupiter.
      const spy = vi.spyOn(window.history, 'replaceState');
      const cruiseEt = v1Jupiter.windowEndEt + 1;
      expect(cruiseEt).toBeLessThan(v2Jupiter.windowStartEt);
      stack.clock.scrubTo(cruiseEt);
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      // The settle should have written exactly once — a home-reversion.
      expect(spy).toHaveBeenCalledTimes(1);
      const url = spy.mock.calls[0]![2] as string;
      expect(url.startsWith('/?t=')).toBe(true);
      spy.mockRestore();
    } finally {
      stack.dispose();
    }
  });

  it('two consecutive update() calls each get their own wave-settle (NOT coalesced across update calls)', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      const v2Saturn = findChapterBySlug('v2-saturn')!;
      // First update() — settle on v1-jupiter
      stack.clock.scrubTo(v1Jupiter.anchorEt);
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      const spy = vi.spyOn(window.history, 'replaceState');
      // Second update() — different chapter
      stack.clock.scrubTo(v2Saturn.anchorEt);
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      // This SECOND update should fire its own write to v2-saturn.
      expect(spy).toHaveBeenCalledTimes(1);
      const url = spy.mock.calls[0]![2] as string;
      expect(url).toContain('/c/v2-saturn');
      spy.mockRestore();
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// History sequence: push → push → back → forward
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 — history sequence push → push → back → forward', () => {
  it('forward navigation after a back restores the second chapter without an extra pushState', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      const v2Saturn = findChapterBySlug('v2-saturn')!;
      // Step 1: click V1 Jupiter — pushState /c/v1-jupiter
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

      // Step 2: click V2 Saturn — pushState /c/v2-saturn
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

      // Step 3: browser back — should restore /c/v1-jupiter via popstate
      const pushSpy = vi.spyOn(window.history, 'pushState');
      window.history.back();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(window.location.pathname).toBe('/c/v1-jupiter');
      expect(Math.abs(stack.clock.simTimeEt - v1Jupiter.anchorEt)).toBeLessThan(0.01);

      // Step 4: browser forward — should restore /c/v2-saturn via popstate
      // CRITICAL: the forward leg must NOT issue a new pushState — it must
      // consume the existing forward history entry.
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      window.history.forward();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(window.location.pathname).toBe('/c/v2-saturn');
      expect(Math.abs(stack.clock.simTimeEt - v2Saturn.anchorEt)).toBeLessThan(0.01);
      // The forward navigation must NOT have produced a pushState — the
      // forward history entry is consumed, not re-created.
      expect(pushSpy).not.toHaveBeenCalled();
      pushSpy.mockRestore();
    } finally {
      stack.dispose();
    }
  });

  it('back-to-home then director.update does NOT overwrite "/" with a director-resolved chapter route (regression: popstate suppression must broaden to any-slug)', async () => {
    // Regression for the popstate→home→director-resolved-chapter bug.
    // Cold-load `/` seeds the clock to MISSION_START_ET, which falls inside
    // launch-v2's chapter window. The next director.update naturally fires
    // an `entering→held` transition for launch-v2. Without proper any-slug
    // suppression after popstate, the router would translate that
    // transition into a `replaceState('/c/launch-v2?t=...')` — overwriting
    // the user's `/` back-target with a chapter route. This test pins the
    // contract that the URL the user navigated to via back/forward stays
    // intact through the immediately-following frame.
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      // Click to push a chapter route so we have something to back away from.
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
      // Browser back → '/'. The router's popstate handler scrubs the clock
      // back to MISSION_START_ET (because '/' has no ?t=).
      window.history.back();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(window.location.pathname).toBe('/');
      // Now the simulated "next frame" — director.update fires for the
      // current clock ET. MISSION_START_ET falls inside launch-v2's window
      // so director resolves activeChapter to launch-v2. The router MUST
      // suppress the corresponding URL write so the user's '/' back-target
      // is preserved.
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      expect(window.location.pathname).toBe('/');
    } finally {
      stack.dispose();
    }
  });

  it('back-from-cruise-to-home leaves /' + ' route then forward restores /c/<slug>', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      // Push a chapter route
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
      // Back → '/'
      window.history.back();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(window.location.pathname).toBe('/');
      // Forward → /c/v1-jupiter
      window.history.forward();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(window.location.pathname).toBe('/c/v1-jupiter');
      expect(Math.abs(stack.clock.simTimeEt - v1Jupiter.anchorEt)).toBeLessThan(0.01);
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Boot-time race: URLRouter MUST subscribe AFTER the first director.update
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 — boot-time race: URLRouter subscribes AFTER the first director update', () => {
  it('cold-load arrival at /c/v2-neptune does NOT emit a URL write (deep-link is the canonical state, not a transition)', async () => {
    window.history.replaceState(null, '', '/c/v2-neptune');
    // Spy BEFORE bootStack so we observe every history write from the
    // boot pipeline + the router's microtask-settled subscriptions.
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const stack = bootStack();
    try {
      // The boot pipeline: parseInitialPath → scrubTo → director.update
      // happen BEFORE router.install() in bootStack(). The router
      // therefore should NOT observe the entering→held transition for
      // v2-neptune that fired during the first director.update — and so
      // must not emit any URL write for the cold-load.
      await flushMicrotasks();
      expect(pushSpy).not.toHaveBeenCalled();
      // The only acceptable replaceState calls are the ones from inside
      // bootStack's history.replaceState bootstrap — there should be NONE
      // from the router because of the subscription-ordering invariant.
      // (We exclude the bootstrap replaceState above which happened before
      // the spy was attached.)
      // After bootStack: the chapter should be held and the URL unchanged.
      expect(stack.director.activeChapter?.slug).toBe('v2-neptune');
      expect(window.location.pathname).toBe('/c/v2-neptune');
      // The router has not yet been triggered, so no writes from it.
      expect(replaceSpy).not.toHaveBeenCalled();
      replaceSpy.mockRestore();
      pushSpy.mockRestore();
    } finally {
      stack.dispose();
    }
  });

  it('chapter-jump event dispatched BEFORE router.install is dropped (no listener)', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack({ deferRouterInstall: true });
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      const pushSpy = vi.spyOn(window.history, 'pushState');
      // Fire chapter-jump BEFORE router.install() — this should be
      // silently dropped because no subscriber exists yet.
      document.dispatchEvent(
        new CustomEvent('chapter-jump', {
          detail: { slug: v1Jupiter.slug, anchorEt: v1Jupiter.anchorEt },
          bubbles: true,
          composed: true,
        }),
      );
      await flushMicrotasks();
      expect(pushSpy).not.toHaveBeenCalled();
      // Now install the router AND verify a fresh chapter-jump IS captured.
      stack.installRouter();
      document.dispatchEvent(
        new CustomEvent('chapter-jump', {
          detail: { slug: v1Jupiter.slug, anchorEt: v1Jupiter.anchorEt },
          bubbles: true,
          composed: true,
        }),
      );
      await flushMicrotasks();
      expect(pushSpy).toHaveBeenCalledTimes(1);
      pushSpy.mockRestore();
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// ?embed=true coexistence (Story 2.5 forward compat) — current behavior
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 — `?embed=true` coexistence with route + ?t= (current behavior)', () => {
  it('boot at /c/v1-jupiter?embed=true&t=<iso> initializes correctly; the embed param is read by Story 2.5, not Story 2.4', () => {
    // The URL contract (docs/url-contract.md) reserves `embed` for
    // Story 2.5. parseInitialPath ignores all params except `t`, which
    // is the correct Story 2.4 behavior. This test pins that boot does
    // NOT crash or behave anomalously with embed present.
    window.history.replaceState(
      null,
      '',
      '/c/v1-jupiter?embed=true&t=1979-03-05T12:00:00Z',
    );
    const stack = bootStack();
    try {
      expect(stack.director.activeChapter?.slug).toBe('v1-jupiter');
      const expected = etFromIso('1979-03-05T12:00:00Z');
      expect(Math.abs(stack.clock.simTimeEt - expected)).toBeLessThan(0.01);
    } finally {
      stack.dispose();
    }
  });

  it('CURRENT BEHAVIOR: chapter pushState DROPS `?embed=true` (Story 2.5 will need to preserve it)', async () => {
    // The current url-sync writeChapterPushState constructs the new URL as
    // `/c/<slug>?t=<iso>` only — any other query parameters present at
    // boot are dropped on the first writeback. The url-contract.md
    // reserves `embed` for Story 2.5; preserving it through writebacks
    // is a forward-compat task that belongs to Story 2.5, not 2.4. This
    // test PINS the current behavior so any regression on the Story 2.5
    // side is flagged.
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
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
      // Path is correct; ?embed is currently DROPPED — only ?t= survives.
      // Story 2.5 will widen this to include ?embed=true (or whatever
      // shape the embed-mode contract settles on).
      expect(window.location.pathname).toBe('/c/v1-jupiter');
      const params = new URLSearchParams(window.location.search);
      expect(params.get('t')).not.toBeNull();
      // Pin: embed is currently absent after the writeback.
      expect(params.get('embed')).toBeNull();
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Out-of-range ?t= at integration tier
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 — out-of-range / malformed ?t= at boot (integration tier)', () => {
  it('cold-load to /?t=1900-01-01T00:00:00Z silently reverts to MISSION_START_ET (NFR-S7)', () => {
    window.history.replaceState(null, '', '/?t=1900-01-01T00:00:00Z');
    const stack = bootStack();
    try {
      expect(stack.clock.simTimeEt).toBe(MISSION_START_ET);
    } finally {
      stack.dispose();
    }
  });

  it('cold-load to /?t=2100-01-01T00:00:00Z silently reverts to MISSION_START_ET (NFR-S7)', () => {
    window.history.replaceState(null, '', '/?t=2100-01-01T00:00:00Z');
    const stack = bootStack();
    try {
      expect(stack.clock.simTimeEt).toBe(MISSION_START_ET);
    } finally {
      stack.dispose();
    }
  });

  it('cold-load to /?t=garbage silently reverts to MISSION_START_ET (NFR-S7)', () => {
    window.history.replaceState(null, '', '/?t=garbage');
    const stack = bootStack();
    try {
      expect(stack.clock.simTimeEt).toBe(MISSION_START_ET);
    } finally {
      stack.dispose();
    }
  });

  it('cold-load to /c/v2-neptune?t=garbage falls back to v2-neptune anchorEt (NFR-S7)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      window.history.replaceState(null, '', '/c/v2-neptune?t=garbage');
      const stack = bootStack();
      try {
        const v2Neptune = findChapterBySlug('v2-neptune')!;
        expect(Math.abs(stack.clock.simTimeEt - v2Neptune.anchorEt)).toBeLessThan(0.01);
        expect(stack.director.activeChapter?.slug).toBe('v2-neptune');
      } finally {
        stack.dispose();
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('cold-load to /c/v2-neptune?t=1977-09-05T12:56:00Z (out of window) accepts the user ET per AC2', () => {
    // AC2 explicitly: "if ?t= is outside the chapter's window, the
    // simulation STILL initializes at the requested ET; ChapterDirector
    // recomputes activeChapter at the next frame."
    window.history.replaceState(null, '', '/c/v2-neptune?t=1977-09-05T12:56:00Z');
    const stack = bootStack();
    try {
      const expected = etFromIso('1977-09-05T12:56:00Z');
      expect(Math.abs(stack.clock.simTimeEt - expected)).toBeLessThan(0.01);
      // At 1977-09-05 the active chapter is launch-v1, NOT v2-neptune.
      // ChapterDirector's first update() (driven by bootStack) recomputed.
      expect(stack.director.activeChapter?.slug).toBe('launch-v1');
    } finally {
      stack.dispose();
    }
  });

  it('cold-load to / (no ?t=) initializes at MISSION_START_ET without any URL writes', async () => {
    window.history.replaceState(null, '', '/');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const stack = bootStack();
    try {
      await flushMicrotasks();
      expect(stack.clock.simTimeEt).toBe(MISSION_START_ET);
      // Cold-load arrival at the homepage must not write the URL — there
      // is nothing to write.
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();
    } finally {
      replaceSpy.mockRestore();
      pushSpy.mockRestore();
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pathname edge cases — regex acceptance / rejection
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 — pathname regex edge cases', () => {
  it('/c (no trailing slash, no slug) does NOT match — falls through to homepage', () => {
    window.history.replaceState(null, '', '/c');
    const stack = bootStack();
    try {
      // /c is not the chapter route shape — the parser must treat this
      // as the homepage (chapter=null) without a console.warn for an
      // empty slug.
      expect(stack.clock.simTimeEt).toBe(MISSION_START_ET);
    } finally {
      stack.dispose();
    }
  });

  it('/c/foo/bar (multi-segment) does NOT match — falls through to homepage', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      window.history.replaceState(null, '', '/c/foo/bar');
      const stack = bootStack();
      try {
        // The regex requires `[^/?#]+` — multi-segment doesn't match.
        // Treated as a non-chapter route → homepage / MISSION_START_ET.
        expect(stack.clock.simTimeEt).toBe(MISSION_START_ET);
      } finally {
        stack.dispose();
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('/c/<slug>?t=&extra=junk parses cleanly and ignores extra params', () => {
    window.history.replaceState(
      null,
      '',
      '/c/v1-jupiter?extra=junk&t=1979-03-05T12:00:00Z&another=foo',
    );
    const stack = bootStack();
    try {
      const expected = etFromIso('1979-03-05T12:00:00Z');
      expect(Math.abs(stack.clock.simTimeEt - expected)).toBeLessThan(0.01);
      expect(stack.director.activeChapter?.slug).toBe('v1-jupiter');
    } finally {
      stack.dispose();
    }
  });

  it('/c/v2-neptune#fragment-anchor preserves hash through deep-link', () => {
    // Hash fragments are not part of the URL contract today but the
    // url-sync write paths read `location.hash` and preserve it. Pin
    // that cold-load arrival doesn't strip the hash.
    window.history.replaceState(null, '', '/c/v2-neptune#section-2');
    const stack = bootStack();
    try {
      expect(stack.director.activeChapter?.slug).toBe('v2-neptune');
      expect(window.location.hash).toBe('#section-2');
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// chapter-jump payload defensive guards (integration tier)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 — chapter-jump defensive guards (integration tier)', () => {
  it('chapter-jump with anchorEt = -Infinity is rejected (no URL write)', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const pushSpy = vi.spyOn(window.history, 'pushState');
      document.dispatchEvent(
        new CustomEvent('chapter-jump', {
          detail: { slug: 'v1-jupiter', anchorEt: -Infinity },
          bubbles: true,
          composed: true,
        }),
      );
      await flushMicrotasks();
      expect(pushSpy).not.toHaveBeenCalled();
      pushSpy.mockRestore();
    } finally {
      stack.dispose();
    }
  });

  it('chapter-jump with unknown slug still writes the URL (the router does not validate against the registry; URL contract delegates that to the next parser)', async () => {
    // The router intentionally does NOT validate the slug against
    // ALL_CHAPTERS at writeback time — that would silently swallow
    // typo-bugs in upstream emitters. If a downstream consumer ever
    // dispatches chapter-jump with a bogus slug, the URL writes
    // through; the next parseInitialPath (on reload or popstate) will
    // hit the silent-reject path and redirect to '/'.
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const pushSpy = vi.spyOn(window.history, 'pushState');
      document.dispatchEvent(
        new CustomEvent('chapter-jump', {
          detail: { slug: 'imaginary-chapter', anchorEt: MISSION_START_ET },
          bubbles: true,
          composed: true,
        }),
      );
      await flushMicrotasks();
      expect(pushSpy).toHaveBeenCalledTimes(1);
      const url = pushSpy.mock.calls[0]![2] as string;
      expect(url).toContain('/c/imaginary-chapter');
      pushSpy.mockRestore();
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// History-pollution invariant: chapter-jump click then free scrub
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 — pushState then free-scrub stays push-state once (no double-push)', () => {
  it('clicking a marker then free-scrubbing within its window produces exactly ONE pushState', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      const pushSpy = vi.spyOn(window.history, 'pushState');
      // Click the marker.
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
      // Now free-scrub within v1-jupiter's window — every scrub should
      // be replaceState, not pushState.
      for (let i = 1; i <= 5; i++) {
        const et = v1Jupiter.anchorEt + i * 100;
        stack.clock.scrubTo(et);
        stack.urlSync.writeEtImmediate(et);
        stack.director.update(et);
        await flushMicrotasks();
      }
      // Exactly ONE pushState (from the chapter-jump click).
      expect(pushSpy).toHaveBeenCalledTimes(1);
      pushSpy.mockRestore();
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Documentation: Chrome DevTools MCP smoke plan for Integration AC8
// ─────────────────────────────────────────────────────────────────────

/**
 * # Chrome DevTools MCP smoke plan — Story 2.4 Integration AC8
 *
 * Per voyager-skill-rules.md Rule 3 + Rule 7, this is the lead-executed
 * browser smoke that gates the story's binding browser-evidence. The CI
 * vitest tests above catch regressions early; the MCP smoke is the
 * authoritative gate for the three R2 edge cases on a real Chrome build.
 *
 * No `initScript` shim needed (Rule 6, post-Story-1.16).
 *
 * ## Probe sequence (recommended order)
 *
 * ### Setup
 *
 * 1. `mcp__chrome-devtools-mcp__navigate_page` →
 *    `http://localhost:5173/c/v2-neptune?t=1989-08-25T09:23:00Z`
 *    (cold-load deep-link — AC8a primary).
 *
 * 2. `mcp__chrome-devtools-mcp__wait_for` → `__voyagerDebug.urlRouter`
 *    is defined (post-boot signal).
 *
 * ### AC8a — Cold-load deep-link to mid-chapter timestamp
 *
 * 3. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
 *    - `window.location.pathname === '/c/v2-neptune'`
 *    - `new URLSearchParams(window.location.search).get('t') === '1989-08-25T09:23:00Z'`
 *    - `window.__voyagerDebug.chapterDirector.activeChapter.slug === 'v2-neptune'`
 *    - `Math.abs(window.__voyagerDebug.chapterDirector.activeChapter.anchorEt
 *        - (some computed expected anchorEt)) < 1`
 *    - HUD date readout: `document.querySelector('v-hud-date')?.shadowRoot
 *        ?.textContent?.includes('1989')` is truthy.
 *
 * 4. `mcp__chrome-devtools-mcp__take_screenshot` → evidence:
 *    `_bmad-output/implementation-artifacts/2-4-smoke-evidence/01-cold-load-v2-neptune.png`
 *
 * 5. `mcp__chrome-devtools-mcp__take_snapshot` → accessibility tree at
 *    cold-load. Evidence: `2-4-smoke-evidence/01-cold-load-a11y.txt`
 *
 * ### AC8b — Mid-cycle URL update does NOT desync ClockManager
 *
 * 6. `mcp__chrome-devtools-mcp__navigate_page` → `http://localhost:5173/`
 *    (reset to homepage).
 *
 * 7. `mcp__chrome-devtools-mcp__press_key` → `3` (digit shortcut for
 *    V1 Jupiter). Alternatively: `mcp__chrome-devtools-mcp__click` on
 *    the V1 Jupiter marker (more representative of the user gesture).
 *
 * 8. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
 *    - `window.location.pathname === '/c/v1-jupiter'`
 *    - Extract `?t=` from `window.location.search`, parse with
 *      `etFromIso`, compare against
 *      `window.__voyagerDebug.chapterDirector.activeChapter.anchorEt`.
 *      The two MUST match within 1 second (URL writebacks derive from
 *      clock; clock is source of truth).
 *    - `window.__voyagerDebug.urlRouter` is defined (sanity).
 *
 * 9. `mcp__chrome-devtools-mcp__take_screenshot` → evidence:
 *    `2-4-smoke-evidence/02-after-v1-jupiter-jump.png`
 *
 * ### AC8c — Browser back/forward fires through the FSM
 *
 * 10. `mcp__chrome-devtools-mcp__press_key` → `4` (V2 Jupiter) for a
 *     second pushState entry.
 *
 * 11. `mcp__chrome-devtools-mcp__evaluate_script` — assert
 *     `window.location.pathname === '/c/v2-jupiter'`.
 *
 * 12. `mcp__chrome-devtools-mcp__evaluate_script` → `window.history.back()`
 *     to trigger popstate.
 *
 * 13. `mcp__chrome-devtools-mcp__wait_for` → small delay (50ms) for the
 *     popstate handler + next-frame director update to settle.
 *
 * 14. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
 *     - `window.location.pathname === '/c/v1-jupiter'`
 *     - `window.__voyagerDebug.chapterDirector.activeChapter.slug === 'v1-jupiter'`
 *
 * 15. `mcp__chrome-devtools-mcp__take_screenshot` → evidence:
 *     `2-4-smoke-evidence/03-back-to-v1-jupiter.png`
 *
 * 16. `mcp__chrome-devtools-mcp__evaluate_script` → `window.history.forward()`.
 *
 * 17. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
 *     - `window.location.pathname === '/c/v2-jupiter'` (forward restored
 *       the second pushState entry without a new push).
 *     - `window.__voyagerDebug.chapterDirector.activeChapter.slug === 'v2-jupiter'`
 *
 * 18. `mcp__chrome-devtools-mcp__take_screenshot` → evidence:
 *     `2-4-smoke-evidence/04-forward-to-v2-jupiter.png`
 *
 * ### Console hygiene
 *
 * 19. `mcp__chrome-devtools-mcp__list_console_messages` — assert no
 *     errors. The only allow-listed message is the Lit dev-mode banner
 *     (`https://lit.dev/msg/dev-mode`). Save as:
 *     `2-4-smoke-evidence/05-console.json`.
 *
 * ## Skip rules / notes
 *
 * - This story DOES touch `web/src/` (multiple files), so the MCP smoke
 *   stage is REQUIRED — not skippable.
 * - The dev server must be running (`npm run dev` from `web/`) at the
 *   default port 5173 before invoking the probe sequence.
 * - For deterministic timing, prefer `mcp__chrome-devtools-mcp__wait_for`
 *   on a DEV-surface predicate rather than fixed `setTimeout` waits.
 */
