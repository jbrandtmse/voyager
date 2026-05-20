// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';

import { URLRouter } from './url-router';
import { URLSync, type UrlSyncWindow } from './url-sync';
import { ClockManager } from './clock-manager';
import { ChapterDirector } from './chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../chapters/registry';

interface MockWin {
  win: UrlSyncWindow;
  pushCalls: string[];
  replaceCalls: string[];
  popListeners: Array<(e: PopStateEvent) => void>;
  navigate: (pathname: string, search?: string) => void;
}

const makeWin = (search = '', pathname = '/'): MockWin => {
  const pushCalls: string[] = [];
  const replaceCalls: string[] = [];
  const popListeners: Array<(e: PopStateEvent) => void> = [];
  const location = { search, pathname, hash: '' };
  const win: UrlSyncWindow = {
    location,
    history: {
      replaceState: (_d: unknown, _t: string, url?: string | URL | null) => {
        if (typeof url === 'string') {
          replaceCalls.push(url);
          const [path, query = ''] = url.split('?');
          location.pathname = path ?? '/';
          location.search = query === '' ? '' : `?${query.split('#')[0] ?? ''}`;
        }
      },
      pushState: (_d: unknown, _t: string, url?: string | URL | null) => {
        if (typeof url === 'string') {
          pushCalls.push(url);
          const [path, query = ''] = url.split('?');
          location.pathname = path ?? '/';
          location.search = query === '' ? '' : `?${query.split('#')[0] ?? ''}`;
        }
      },
    } as unknown as History,
    addEventListener: (_type: 'popstate', listener: (e: PopStateEvent) => void) => {
      popListeners.push(listener);
    },
    removeEventListener: (
      _type: 'popstate',
      listener: (e: PopStateEvent) => void,
    ) => {
      const idx = popListeners.indexOf(listener);
      if (idx >= 0) popListeners.splice(idx, 1);
    },
  };
  return {
    win,
    pushCalls,
    replaceCalls,
    popListeners,
    navigate: (p, s = '') => {
      location.pathname = p;
      location.search = s;
      for (const l of popListeners) l(new PopStateEvent('popstate'));
    },
  };
};

const setupRouter = (
  pathname = '/',
  search = '',
): {
  router: URLRouter;
  urlSync: URLSync;
  clock: ClockManager;
  director: ChapterDirector;
  mock: MockWin;
  doc: Document;
} => {
  const mock = makeWin(search, pathname);
  const urlSync = new URLSync(mock.win);
  urlSync.parseInitialPath(); // adopt path as currentPath
  const clock = new ClockManager();
  const director = new ChapterDirector(ALL_CHAPTERS);
  // Use the real document so dispatched CustomEvents flow through composedPath.
  const doc = document;
  const router = new URLRouter({
    urlSync,
    clockManager: clock,
    chapterDirector: director,
    doc,
  }).install();
  return { router, urlSync, clock, director, mock, doc };
};

/** Flush microtasks queued by URLRouter.scheduleWaveSettle. */
const flushMicrotasks = async (): Promise<void> => {
  // Two awaits — one for the URL-router microtask and one in case the
  // microtask itself queues another tick.
  await Promise.resolve();
  await Promise.resolve();
};

describe('Story 2.4 AC3 — URLRouter chapter-jump → pushState', () => {
  let cleanup: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanup) c();
    cleanup = [];
  });

  it('user-driven chapter-jump fires history.pushState', () => {
    const { router, mock } = setupRouter('/', '');
    cleanup.push(() => router.dispose());
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    document.dispatchEvent(
      new CustomEvent('chapter-jump', {
        detail: { slug: v1Jupiter.slug, anchorEt: v1Jupiter.anchorEt },
        bubbles: true,
        composed: true,
      }),
    );
    expect(mock.pushCalls.length).toBe(1);
    expect(mock.pushCalls[0]).toContain('/c/v1-jupiter');
    expect(mock.pushCalls[0]).toContain('t=');
  });

  it('ignores chapter-jump events with malformed detail (defensive)', () => {
    const { router, mock } = setupRouter('/', '');
    cleanup.push(() => router.dispose());
    document.dispatchEvent(
      new CustomEvent('chapter-jump', { detail: null, bubbles: true }),
    );
    document.dispatchEvent(
      new CustomEvent('chapter-jump', {
        detail: { slug: 42, anchorEt: 0 },
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new CustomEvent('chapter-jump', {
        detail: { slug: 'v1-jupiter', anchorEt: NaN },
        bubbles: true,
      }),
    );
    expect(mock.pushCalls.length).toBe(0);
  });

  it('suppresses the director-driven replaceState that follows a pushState for the same slug', async () => {
    const { router, director, mock } = setupRouter('/', '');
    cleanup.push(() => router.dispose());
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    // 1. User click triggers chapter-jump
    document.dispatchEvent(
      new CustomEvent('chapter-jump', {
        detail: { slug: v1Jupiter.slug, anchorEt: v1Jupiter.anchorEt },
        bubbles: true,
        composed: true,
      }),
    );
    // 2. Director then observes the new ET and fires entering→held for v1-jupiter
    director.update(v1Jupiter.anchorEt);
    await flushMicrotasks();
    // pushState fired once; replaceState should NOT have fired (suppression).
    expect(mock.pushCalls.length).toBe(1);
    expect(mock.replaceCalls.length).toBe(0);
  });
});

describe('Story 2.4 AC5 — URLRouter director-driven boundary crossings → replaceState', () => {
  let cleanup: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanup) c();
    cleanup = [];
  });

  it('free-scrub crossing INTO a chapter window fires replaceState (not pushState)', async () => {
    const { router, director, mock } = setupRouter('/', '');
    cleanup.push(() => router.dispose());
    // Free-scrub the director to V1 Jupiter's window (no chapter-jump event).
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    director.update(v1Jupiter.anchorEt);
    await flushMicrotasks();
    expect(mock.replaceCalls.length).toBe(1);
    expect(mock.replaceCalls[0]).toContain('/c/v1-jupiter');
    expect(mock.pushCalls.length).toBe(0);
  });

  it('free-scrub crossing from one chapter to another fires replaceState for both transitions, ending on the new slug', async () => {
    const { router, director, mock } = setupRouter('/', '');
    cleanup.push(() => router.dispose());
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const v2Jupiter = findChapterBySlug('v2-jupiter')!;
    director.update(v1Jupiter.anchorEt);
    await flushMicrotasks();
    // Scrub forward past v1-jupiter into v2-jupiter's window.
    director.update(v2Jupiter.anchorEt);
    await flushMicrotasks();
    // Last replaceState target should be v2-jupiter.
    const last = mock.replaceCalls[mock.replaceCalls.length - 1]!;
    expect(last).toContain('/c/v2-jupiter');
    expect(mock.pushCalls.length).toBe(0);
  });

  it('crossing INTO a cruise period (no chapter held) reverts to "/" + ?t=', async () => {
    const { router, director, mock } = setupRouter('/', '');
    cleanup.push(() => router.dispose());
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    director.update(v1Jupiter.anchorEt);
    await flushMicrotasks();
    // Now advance to an ET BEYOND v1-jupiter's windowEndEt but BEFORE the
    // next chapter window starts (gap between adjacent chapter windows).
    const v2JupiterWindowStart = findChapterBySlug('v2-jupiter')!.windowStartEt;
    const cruiseEt = v1Jupiter.windowEndEt + 1; // 1 sec past v1 jupiter, well before v2 jupiter
    // Sanity-check that this ET is truly in a cruise gap.
    expect(cruiseEt).toBeLessThan(v2JupiterWindowStart);
    director.update(cruiseEt);
    await flushMicrotasks();
    // Last replaceState should be a home reversion.
    const last = mock.replaceCalls[mock.replaceCalls.length - 1]!;
    expect(last.startsWith('/?t=')).toBe(true);
    expect(last.startsWith('/c/')).toBe(false);
  });
});

describe('Story 2.4 AC8c — URLRouter popstate → ClockManager.scrubTo', () => {
  let cleanup: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanup) c();
    cleanup = [];
  });

  it('back-button to /c/<slug> drives clockManager.scrubTo(chapter.anchorEt)', () => {
    const { router, clock, mock } = setupRouter('/', '');
    cleanup.push(() => router.dispose());
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    mock.navigate('/c/v1-jupiter', '');
    expect(Math.abs(clock.simTimeEt - v1Jupiter.anchorEt)).toBeLessThan(0.01);
    // scrubTo pauses as a side effect.
    expect(clock.playing).toBe(false);
  });

  it('popstate to "/" suppresses the next director-driven write regardless of which chapter the director resolves (any-slug suppression)', async () => {
    // Regression: when popstate lands on `/`, the director may still
    // resolve a chapter (e.g., MISSION_START_ET inside launch-v2's window).
    // Suppression must NOT be slug-keyed in this case — it must consume
    // the next settle regardless of resolved slug so the `/` back-target
    // is preserved across the next frame.
    const { router, director, mock } = setupRouter('/c/v1-jupiter', '');
    cleanup.push(() => router.dispose());
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    director.update(v1Jupiter.anchorEt);
    await flushMicrotasks();
    const replaceBefore = mock.replaceCalls.length;
    // Simulate browser back to '/'.
    mock.navigate('/', '');
    // Director's next frame resolves a chapter (launch-v2 contains
    // MISSION_START_ET per registry); without any-slug suppression this
    // would emit a replaceState('/c/launch-v2').
    const launchV2 = findChapterBySlug('launch-v2')!;
    director.update(launchV2.anchorEt);
    await flushMicrotasks();
    expect(mock.replaceCalls.length).toBe(replaceBefore);
  });

  it('popstate suppresses the next director-driven write for the popstate target slug', async () => {
    const { router, director, clock, mock } = setupRouter('/', '');
    cleanup.push(() => router.dispose());
    // Click-jump to seed an initial chapter:
    document.dispatchEvent(
      new CustomEvent('chapter-jump', {
        detail: { slug: 'v2-jupiter', anchorEt: findChapterBySlug('v2-jupiter')!.anchorEt },
        bubbles: true,
        composed: true,
      }),
    );
    director.update(findChapterBySlug('v2-jupiter')!.anchorEt);
    await flushMicrotasks();
    // Capture state, then simulate browser back to /c/v1-jupiter.
    const pushBefore = mock.pushCalls.length;
    const replaceBefore = mock.replaceCalls.length;
    mock.navigate('/c/v1-jupiter', '');
    // The router applied scrubTo(v1Jupiter.anchorEt) — director.update would
    // be the engine's job, simulate it here.
    director.update(clock.simTimeEt);
    await flushMicrotasks();
    expect(mock.pushCalls.length).toBe(pushBefore); // popstate writes no pushState
    // The follow-on director transition should be suppressed.
    expect(mock.replaceCalls.length).toBe(replaceBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Story 2.7 — URLRouter.onRouteChange() fires on /about ↔ simulation
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.7 — URLRouter.onRouteChange() popstate transitions', () => {
  let cleanup: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanup) c();
    cleanup = [];
  });

  const setupAboutRouter = (
    pathname: string,
    initialKind: 'home' | 'chapter' | 'about',
  ): {
    router: URLRouter;
    urlSync: URLSync;
    clock: ClockManager;
    director: ChapterDirector;
    mock: MockWin;
    doc: Document;
  } => {
    const base = setupRouter(pathname, '');
    base.router.dispose();
    const router = new URLRouter({
      urlSync: base.urlSync,
      clockManager: base.clock,
      chapterDirector: base.director,
      doc: base.doc,
      initialRouteKind: initialKind,
    }).install();
    return {
      router,
      urlSync: base.urlSync,
      clock: base.clock,
      director: base.director,
      mock: base.mock,
      doc: base.doc,
    };
  };

  it('fires (from, to) when popstate crosses from home → about', () => {
    const { router, mock } = setupAboutRouter('/', 'home');
    cleanup.push(() => router.dispose());
    const calls: Array<[string, string]> = [];
    router.onRouteChange((f, t) => calls.push([f, t]));
    mock.navigate('/about', '');
    expect(calls).toEqual([['home', 'about']]);
  });

  it('fires (from, to) when popstate crosses from chapter → about', () => {
    const { router, mock } = setupAboutRouter('/c/v1-jupiter', 'chapter');
    cleanup.push(() => router.dispose());
    const calls: Array<[string, string]> = [];
    router.onRouteChange((f, t) => calls.push([f, t]));
    mock.navigate('/about', '');
    expect(calls).toEqual([['chapter', 'about']]);
  });

  it('fires (from, to) when popstate crosses from about → home', () => {
    const { router, mock } = setupAboutRouter('/about', 'about');
    cleanup.push(() => router.dispose());
    const calls: Array<[string, string]> = [];
    router.onRouteChange((f, t) => calls.push([f, t]));
    mock.navigate('/', '');
    expect(calls).toEqual([['about', 'home']]);
  });

  it('does NOT fire on chapter-to-chapter popstate (same kind)', () => {
    const { router, mock } = setupAboutRouter('/c/v1-jupiter', 'chapter');
    cleanup.push(() => router.dispose());
    const calls: Array<[string, string]> = [];
    router.onRouteChange((f, t) => calls.push([f, t]));
    mock.navigate('/c/v2-jupiter', '');
    expect(calls).toEqual([]);
  });

  it('does NOT fire on home-to-home popstate', () => {
    const { router, mock } = setupAboutRouter('/', 'home');
    cleanup.push(() => router.dispose());
    const calls: Array<[string, string]> = [];
    router.onRouteChange((f, t) => calls.push([f, t]));
    mock.navigate('/', '?t=1989-08-25T09:23:00Z');
    expect(calls).toEqual([]);
  });

  it('unsubscribe stops the listener from firing on subsequent popstate', () => {
    const { router, mock } = setupAboutRouter('/', 'home');
    cleanup.push(() => router.dispose());
    const calls: Array<[string, string]> = [];
    const unsubscribe = router.onRouteChange((f, t) => calls.push([f, t]));
    mock.navigate('/about', '');
    expect(calls.length).toBe(1);
    unsubscribe();
    mock.navigate('/', '');
    expect(calls.length).toBe(1);
  });

  it('a throwing listener does not break subsequent listeners or scrubTo', () => {
    const { router, mock, clock } = setupAboutRouter('/', 'home');
    cleanup.push(() => router.dispose());
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: string[] = [];
    router.onRouteChange(() => {
      throw new Error('boom');
    });
    router.onRouteChange((f, t) => calls.push(`${f}->${t}`));
    mock.navigate('/about', '');
    expect(calls).toEqual(['home->about']);
    // popstate still calls scrubTo (so the about page's ?t= survives a refresh).
    expect(clock.simTimeEt).toBeDefined();
    errorSpy.mockRestore();
  });
});

describe('Story 2.4 — URLRouter.dispose() detaches all listeners', () => {
  it('after dispose, chapter-jump and director transitions write nothing', async () => {
    const { router, director, mock } = setupRouter('/', '');
    router.dispose();
    document.dispatchEvent(
      new CustomEvent('chapter-jump', {
        detail: { slug: 'v1-jupiter', anchorEt: findChapterBySlug('v1-jupiter')!.anchorEt },
        bubbles: true,
        composed: true,
      }),
    );
    director.update(findChapterBySlug('v1-jupiter')!.anchorEt);
    await flushMicrotasks();
    expect(mock.pushCalls.length).toBe(0);
    expect(mock.replaceCalls.length).toBe(0);
  });
});
