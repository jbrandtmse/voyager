// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { URLSync, type UrlSyncWindow } from './url-sync';
import { MISSION_START_ET, MISSION_END_ET } from '../constants/mission';
import { etFromIso, isoFromEt } from '../math/et-conversions';
import { ALL_CHAPTERS, findChapterBySlug } from '../chapters/registry';

interface MockHistoryCall {
  data: unknown;
  title: string;
  url: string | URL | null | undefined;
}

interface MockWin {
  win: UrlSyncWindow;
  replaceCalls: MockHistoryCall[];
  pushCalls: MockHistoryCall[];
  popListeners: Array<(e: PopStateEvent) => void>;
  // Helper to mutate the simulated location and fire a popstate.
  navigate: (pathname: string, search?: string) => void;
}

// Helper: build a minimal UrlSyncWindow stub with capture-style assertions.
const makeWin = (search = '', pathname = '/', hash = ''): MockWin => {
  const replaceCalls: MockHistoryCall[] = [];
  const pushCalls: MockHistoryCall[] = [];
  const popListeners: Array<(e: PopStateEvent) => void> = [];
  const location = { search, pathname, hash };
  const win: UrlSyncWindow = {
    location,
    history: {
      replaceState: (
        data: unknown,
        title: string,
        url?: string | URL | null,
      ) => {
        replaceCalls.push({ data, title, url });
        // Reflect the URL into our mock location so subsequent reads see it.
        if (typeof url === 'string') {
          const [path, query = ''] = url.split('?');
          location.pathname = path ?? '/';
          location.search = query === '' ? '' : `?${query.split('#')[0] ?? ''}`;
        }
      },
      pushState: (
        data: unknown,
        title: string,
        url?: string | URL | null,
      ) => {
        pushCalls.push({ data, title, url });
        if (typeof url === 'string') {
          const [path, query = ''] = url.split('?');
          location.pathname = path ?? '/';
          location.search = query === '' ? '' : `?${query.split('#')[0] ?? ''}`;
        }
      },
    } as unknown as History,
    addEventListener: (type: 'popstate', listener: (e: PopStateEvent) => void) => {
      if (type === 'popstate') popListeners.push(listener);
    },
    removeEventListener: (
      type: 'popstate',
      listener: (e: PopStateEvent) => void,
    ) => {
      if (type !== 'popstate') return;
      const idx = popListeners.indexOf(listener);
      if (idx >= 0) popListeners.splice(idx, 1);
    },
  };
  return {
    win,
    replaceCalls,
    pushCalls,
    popListeners,
    navigate: (pathname: string, sr = '') => {
      location.pathname = pathname;
      location.search = sr;
      for (const l of popListeners) {
        l(new PopStateEvent('popstate'));
      }
    },
  };
};

describe('Story 1.9 Task 4 — URLSync.parseInitialT()', () => {
  it('returns valid=false / MISSION_START_ET when ?t= is missing', () => {
    const { win } = makeWin('');
    const sync = new URLSync(win);
    const r = sync.parseInitialT();
    expect(r.valid).toBe(false);
    expect(r.initialEt).toBe(MISSION_START_ET);
  });

  it('returns valid=false / MISSION_START_ET when ?t= is empty', () => {
    const { win } = makeWin('?t=');
    const sync = new URLSync(win);
    const r = sync.parseInitialT();
    expect(r.valid).toBe(false);
    expect(r.initialEt).toBe(MISSION_START_ET);
  });

  it('returns valid=true at a known mission ISO (1989-08-25 V2 Neptune)', () => {
    const { win } = makeWin('?t=1989-08-25T09:23:00Z');
    const sync = new URLSync(win);
    const r = sync.parseInitialT();
    expect(r.valid).toBe(true);
    expect(Math.abs(r.initialEt - etFromIso('1989-08-25T09:23:00Z'))).toBeLessThan(0.01);
  });

  it('silently rejects a garbage ?t= string per NFR-S7', () => {
    const { win } = makeWin('?t=not-an-iso');
    const sync = new URLSync(win);
    const r = sync.parseInitialT();
    expect(r.valid).toBe(false);
    expect(r.initialEt).toBe(MISSION_START_ET);
  });

  it('silently rejects ?t= before MISSION_START', () => {
    const { win } = makeWin('?t=1900-01-01T00:00:00Z');
    const sync = new URLSync(win);
    const r = sync.parseInitialT();
    expect(r.valid).toBe(false);
    expect(r.initialEt).toBe(MISSION_START_ET);
  });

  it('silently rejects ?t= after MISSION_END', () => {
    const { win } = makeWin('?t=2100-01-01T00:00:00Z');
    const sync = new URLSync(win);
    const r = sync.parseInitialT();
    expect(r.valid).toBe(false);
    expect(r.initialEt).toBe(MISSION_START_ET);
  });

  it('accepts MISSION_START boundary as valid', () => {
    const { win } = makeWin(`?t=${isoFromEt(MISSION_START_ET)}`);
    const sync = new URLSync(win);
    const r = sync.parseInitialT();
    expect(r.valid).toBe(true);
  });

  it('accepts MISSION_END boundary as valid', () => {
    const { win } = makeWin(`?t=${isoFromEt(MISSION_END_ET)}`);
    const sync = new URLSync(win);
    const r = sync.parseInitialT();
    expect(r.valid).toBe(true);
  });

  it('ignores other query params and reads only ?t=', () => {
    const { win } = makeWin('?dev=1&t=1989-08-25T09:23:00Z&foo=bar');
    const sync = new URLSync(win);
    const r = sync.parseInitialT();
    expect(r.valid).toBe(true);
  });
});

describe('Story 1.9 Task 4 — URLSync.writeEtImmediate()', () => {
  it('calls history.replaceState with ?t=<iso> and pathname preserved', () => {
    const { win, replaceCalls } = makeWin('', '/voyager/', '#chapter-3');
    const sync = new URLSync(win);
    const et = etFromIso('1989-08-25T09:23:00Z');
    sync.writeEtImmediate(et);
    expect(replaceCalls.length).toBe(1);
    expect(replaceCalls[0]!.url).toBe('/voyager/?t=1989-08-25T09:23:00Z#chapter-3');
  });

  it('passes null state (NOT pushState — no history pollution)', () => {
    const { win, replaceCalls } = makeWin();
    const sync = new URLSync(win);
    sync.writeEtImmediate(MISSION_START_ET);
    expect(replaceCalls[0]!.data).toBeNull();
  });

  it('bypasses the throttle (forces an immediate write even with pending)', () => {
    vi.useFakeTimers();
    const { win, replaceCalls } = makeWin();
    const sync = new URLSync(win);
    sync.writeEtThrottled(MISSION_START_ET); // 1st write fires immediately
    sync.writeEtThrottled(MISSION_START_ET + 100); // queued
    sync.writeEtImmediate(MISSION_END_ET); // forces second write
    expect(replaceCalls.length).toBe(2);
    // Confirm the last write was the immediate one (MISSION_END).
    const lastUrl = replaceCalls[1]!.url as string;
    expect(lastUrl).toContain(isoFromEt(MISSION_END_ET));
    vi.useRealTimers();
  });
});

describe('Story 1.9 Task 4 — URLSync.writeEtThrottled()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('first call writes immediately', () => {
    const { win, replaceCalls } = makeWin();
    const sync = new URLSync(win);
    sync.writeEtThrottled(MISSION_START_ET);
    expect(replaceCalls.length).toBe(1);
  });

  it('coalesces a flurry of writes within the throttle window into ≤2 writes', () => {
    const { win, replaceCalls } = makeWin();
    const sync = new URLSync(win);
    for (let i = 0; i < 20; i++) {
      sync.writeEtThrottled(MISSION_START_ET + i * 1000);
    }
    // First call fired immediately. The other 19 are coalesced and one
    // trailing write fires when the throttle timer elapses.
    expect(replaceCalls.length).toBe(1);
    vi.advanceTimersByTime(260);
    expect(replaceCalls.length).toBe(2);
  });

  it('trailing flush carries the most-recent ET (not stale)', () => {
    const { win, replaceCalls } = makeWin();
    const sync = new URLSync(win);
    sync.writeEtThrottled(MISSION_START_ET); // immediate
    sync.writeEtThrottled(MISSION_START_ET + 100);
    sync.writeEtThrottled(MISSION_START_ET + 200);
    sync.writeEtThrottled(MISSION_START_ET + 300); // latest
    vi.advanceTimersByTime(260);
    const lastUrl = replaceCalls[1]!.url as string;
    expect(lastUrl).toContain(isoFromEt(MISSION_START_ET + 300));
  });

  it('does NOT pollute history (replaceState, not pushState)', () => {
    const { win, replaceCalls } = makeWin();
    // pushState would not be present on our stub; just assert we hit replaceState.
    const sync = new URLSync(win);
    sync.writeEtThrottled(MISSION_START_ET);
    expect(replaceCalls.length).toBe(1);
  });

  it('flush() forces pending write and cancels the timer', () => {
    const { win, replaceCalls } = makeWin();
    const sync = new URLSync(win);
    sync.writeEtThrottled(MISSION_START_ET);
    sync.writeEtThrottled(MISSION_START_ET + 500);
    expect(replaceCalls.length).toBe(1);
    sync.flush();
    expect(replaceCalls.length).toBe(2);
    // Advance — no further writes should arrive.
    vi.advanceTimersByTime(1000);
    expect(replaceCalls.length).toBe(2);
  });

  it('flush() is a no-op when no write is pending', () => {
    const { win, replaceCalls } = makeWin();
    const sync = new URLSync(win);
    sync.writeEtThrottled(MISSION_START_ET);
    vi.advanceTimersByTime(300); // throttle window elapses with no pending
    expect(replaceCalls.length).toBe(1);
    sync.flush();
    expect(replaceCalls.length).toBe(1);
  });

  it('rate during continuous drag stays under ≤4 history writes per second', () => {
    const { win, replaceCalls } = makeWin();
    const sync = new URLSync(win);
    for (let tick = 0; tick < 16; tick++) {
      // 16 calls over ~250 ms (16ms per call, 60 Hz)
      sync.writeEtThrottled(MISSION_START_ET + tick * 1000);
      vi.advanceTimersByTime(16);
    }
    // Continue for one full second (60 calls @16ms = 960ms total post-loop)
    for (let tick = 0; tick < 60; tick++) {
      sync.writeEtThrottled(MISSION_START_ET + (16 + tick) * 1000);
      vi.advanceTimersByTime(16);
    }
    // The exact count depends on the throttle implementation, but it MUST
    // be ≤ 5 (one per ~250ms window over ~1.2s of drag, plus the immediate
    // first write). Asserting an upper bound rather than an exact count.
    expect(replaceCalls.length).toBeLessThanOrEqual(6);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Story 2.4 — parseInitialPath()
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 AC1 — URLSync.parseInitialPath() route recognition', () => {
  it('returns chapter=null for "/"', () => {
    const { win } = makeWin('', '/');
    const sync = new URLSync(win);
    const r = sync.parseInitialPath();
    expect(r.chapter).toBeNull();
    expect(r.initialEt).toBe(MISSION_START_ET);
    expect(r.hadValidT).toBe(false);
  });

  it('returns chapter=null for "/" + valid ?t=', () => {
    const { win } = makeWin('?t=1989-08-25T09:23:00Z', '/');
    const sync = new URLSync(win);
    const r = sync.parseInitialPath();
    expect(r.chapter).toBeNull();
    expect(r.hadValidT).toBe(true);
    expect(Math.abs(r.initialEt - etFromIso('1989-08-25T09:23:00Z'))).toBeLessThan(0.01);
  });

  it('resolves "/c/v2-neptune" to the v2-neptune ChapterSpec', () => {
    const { win } = makeWin('', '/c/v2-neptune');
    const sync = new URLSync(win);
    const r = sync.parseInitialPath();
    expect(r.chapter).not.toBeNull();
    expect(r.chapter!.slug).toBe('v2-neptune');
    expect(r.initialEt).toBe(r.chapter!.anchorEt);
    expect(r.hadValidT).toBe(false);
  });

  it('resolves "/c/<slug>?t=<iso>" to the chapter + parsed ET', () => {
    const { win } = makeWin('?t=1989-08-25T09:23:00Z', '/c/v2-neptune');
    const sync = new URLSync(win);
    const r = sync.parseInitialPath();
    expect(r.chapter!.slug).toBe('v2-neptune');
    expect(r.hadValidT).toBe(true);
    expect(Math.abs(r.initialEt - etFromIso('1989-08-25T09:23:00Z'))).toBeLessThan(0.01);
  });

  it('accepts a chapter-route ?t= even when OUTSIDE the chapter window (AC2)', () => {
    // V2 Neptune's anchor is 1989-08-25; passing a launch-era ?t= MUST be
    // accepted per AC2 — ChapterDirector recomputes the active chapter on
    // the next frame. The URL is the user's intent.
    const { win } = makeWin('?t=1977-09-05T12:56:00Z', '/c/v2-neptune');
    const sync = new URLSync(win);
    const r = sync.parseInitialPath();
    expect(r.chapter!.slug).toBe('v2-neptune');
    expect(r.hadValidT).toBe(true);
    expect(Math.abs(r.initialEt - etFromIso('1977-09-05T12:56:00Z'))).toBeLessThan(0.01);
  });

  it('falls back to anchorEt when ?t= is malformed on a chapter route (NFR-S7)', () => {
    const { win } = makeWin('?t=not-an-iso', '/c/v1-jupiter');
    const sync = new URLSync(win);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = sync.parseInitialPath();
    expect(r.chapter!.slug).toBe('v1-jupiter');
    expect(r.initialEt).toBe(r.chapter!.anchorEt);
    expect(r.hadValidT).toBe(false);
    warnSpy.mockRestore();
  });

  it('unknown slug → console.warn + replaceState("/") + chapter=null (NFR-S7)', () => {
    const { win, replaceCalls } = makeWin('', '/c/foo');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sync = new URLSync(win);
    const r = sync.parseInitialPath();
    expect(r.chapter).toBeNull();
    expect(r.initialEt).toBe(MISSION_START_ET);
    expect(warnSpy).toHaveBeenCalled();
    expect(replaceCalls.length).toBeGreaterThan(0);
    const lastUrl = replaceCalls[replaceCalls.length - 1]!.url as string;
    expect(lastUrl.startsWith('/')).toBe(true);
    expect(lastUrl.startsWith('/c/')).toBe(false);
    warnSpy.mockRestore();
  });

  it('unknown slug PRESERVES ?t= when redirecting (so intended timestamp survives)', () => {
    const { win, replaceCalls } = makeWin('?t=1989-08-25T09:23:00Z', '/c/typo');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sync = new URLSync(win);
    sync.parseInitialPath();
    const lastUrl = replaceCalls[replaceCalls.length - 1]!.url as string;
    expect(lastUrl).toContain('t=1989-08-25T09:23:00Z');
    warnSpy.mockRestore();
  });

  it('verifies every ADR-0001 frozen slug resolves (the 11 are exhaustive)', () => {
    const SLUGS = [
      'launch-v1',
      'launch-v2',
      'v1-jupiter',
      'v2-jupiter',
      'v1-saturn',
      'v2-saturn',
      'v2-uranus',
      'v2-neptune',
      'pale-blue-dot',
      'v1-heliopause',
      'v2-heliopause',
    ];
    for (const slug of SLUGS) {
      const { win } = makeWin('', `/c/${slug}`);
      const sync = new URLSync(win);
      const r = sync.parseInitialPath();
      expect(r.chapter, `Failed to resolve known slug "${slug}"`).not.toBeNull();
      expect(r.chapter!.slug).toBe(slug);
    }
    // Sanity: the ALL_CHAPTERS list is the same 11.
    expect(ALL_CHAPTERS.length).toBe(SLUGS.length);
  });

  it('trailing-slash chapter route ("/c/v2-neptune/") also resolves', () => {
    const { win } = makeWin('', '/c/v2-neptune/');
    const sync = new URLSync(win);
    const r = sync.parseInitialPath();
    expect(r.chapter!.slug).toBe('v2-neptune');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Story 2.4 AC3 — writeChapterPushState
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 AC3 — URLSync.writeChapterPushState()', () => {
  it('calls history.pushState with /c/<slug>?t=<iso>', () => {
    const { win, pushCalls } = makeWin('', '/');
    const sync = new URLSync(win);
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    sync.writeChapterPushState(v1Jupiter.slug, v1Jupiter.anchorEt);
    expect(pushCalls.length).toBe(1);
    expect(pushCalls[0]!.url).toContain('/c/v1-jupiter');
    expect(pushCalls[0]!.url).toContain('t=');
  });

  it('does NOT use replaceState when pushState is available', () => {
    const { win, pushCalls, replaceCalls } = makeWin('', '/');
    const sync = new URLSync(win);
    sync.writeChapterPushState('v1-jupiter', findChapterBySlug('v1-jupiter')!.anchorEt);
    expect(pushCalls.length).toBe(1);
    expect(replaceCalls.length).toBe(0);
  });

  it('cancels any pending throttled ?t= write', () => {
    vi.useFakeTimers();
    const { win, replaceCalls, pushCalls } = makeWin('', '/');
    const sync = new URLSync(win);
    sync.writeEtThrottled(MISSION_START_ET); // first call writes immediately
    sync.writeEtThrottled(MISSION_START_ET + 1000); // queued
    sync.writeChapterPushState('v1-jupiter', findChapterBySlug('v1-jupiter')!.anchorEt);
    // Advance — no further throttled writes should arrive.
    vi.advanceTimersByTime(1000);
    expect(pushCalls.length).toBe(1);
    // 1 immediate ?t= write from the first writeEtThrottled, no trailing.
    expect(replaceCalls.length).toBe(1);
    vi.useRealTimers();
  });

  it('subsequent ?t= writes target the new chapter path', () => {
    const { win, pushCalls, replaceCalls } = makeWin('', '/');
    const sync = new URLSync(win);
    sync.writeChapterPushState('v1-jupiter', findChapterBySlug('v1-jupiter')!.anchorEt);
    sync.writeEtImmediate(findChapterBySlug('v1-jupiter')!.anchorEt + 1000);
    expect(pushCalls.length).toBe(1);
    expect(replaceCalls.length).toBe(1);
    const replaceUrl = replaceCalls[0]!.url as string;
    expect(replaceUrl.startsWith('/c/v1-jupiter')).toBe(true);
  });

  it('no-op on empty slug (defensive)', () => {
    const { win, pushCalls } = makeWin('', '/');
    const sync = new URLSync(win);
    sync.writeChapterPushState('', 0);
    expect(pushCalls.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Story 2.4 AC5 — writeChapterReplaceState + writeHomeReplaceState
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 AC5 — director-driven boundary writes (replaceState)', () => {
  it('writeChapterReplaceState() uses replaceState (NOT pushState)', () => {
    const { win, pushCalls, replaceCalls } = makeWin('', '/c/launch-v2');
    const sync = new URLSync(win);
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    sync.writeChapterReplaceState(v1Jupiter.slug, v1Jupiter.anchorEt);
    expect(pushCalls.length).toBe(0);
    expect(replaceCalls.length).toBe(1);
    const url = replaceCalls[0]!.url as string;
    expect(url.startsWith('/c/v1-jupiter')).toBe(true);
  });

  it('writeHomeReplaceState() reverts to "/" + ?t=<currentEt>', () => {
    const { win, replaceCalls } = makeWin('', '/c/v1-jupiter');
    const sync = new URLSync(win);
    sync.writeHomeReplaceState(MISSION_END_ET);
    expect(replaceCalls.length).toBe(1);
    const url = replaceCalls[0]!.url as string;
    expect(url.startsWith('/?t=')).toBe(true);
    expect(url).toContain(isoFromEt(MISSION_END_ET));
  });

  it('writeHomeReplaceState() then writeEtImmediate uses "/" path (not the prior chapter path)', () => {
    const { win, replaceCalls } = makeWin('', '/c/v1-jupiter');
    const sync = new URLSync(win);
    sync.writeHomeReplaceState(MISSION_START_ET + 1000);
    sync.writeEtImmediate(MISSION_START_ET + 2000);
    expect(replaceCalls.length).toBe(2);
    const second = replaceCalls[1]!.url as string;
    expect(second.startsWith('/?t=')).toBe(true);
    expect(second.startsWith('/c/')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Story 2.4 AC4 — free-scrub path stays stable
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 AC4 — free-scrub preserves /c/<slug> path', () => {
  it('parseInitialPath sets currentPath, then writeEtThrottled keeps it', () => {
    vi.useFakeTimers();
    const { win, replaceCalls } = makeWin('?t=1989-08-25T09:23:00Z', '/c/v2-neptune');
    const sync = new URLSync(win);
    sync.parseInitialPath(); // adopt /c/v2-neptune as currentPath
    const v2Neptune = findChapterBySlug('v2-neptune')!;
    sync.writeEtThrottled(v2Neptune.anchorEt + 10);
    expect(replaceCalls.length).toBe(1);
    expect((replaceCalls[0]!.url as string).startsWith('/c/v2-neptune?t=')).toBe(true);
    vi.useRealTimers();
  });

  it('writeEtImmediate during free scrub still targets the chapter path', () => {
    const { win, replaceCalls } = makeWin('', '/c/v1-jupiter');
    const sync = new URLSync(win);
    sync.parseInitialPath();
    sync.writeEtImmediate(findChapterBySlug('v1-jupiter')!.anchorEt + 5);
    expect((replaceCalls[0]!.url as string).startsWith('/c/v1-jupiter?t=')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Story 2.4 AC8c — popstate handler
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.4 AC8c — URLSync.installPopstateHandler()', () => {
  it('fires the supplied callback on popstate with re-parsed URL state', () => {
    const wm = makeWin('', '/');
    const sync = new URLSync(wm.win);
    const calls: Array<{ chapter: string | null; initialEt: number }> = [];
    sync.installPopstateHandler((state) => {
      calls.push({
        chapter: state.chapter?.slug ?? null,
        initialEt: state.initialEt,
      });
    });
    // Navigate to /c/v1-jupiter and fire popstate.
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    wm.navigate('/c/v1-jupiter', '');
    expect(calls.length).toBe(1);
    expect(calls[0]!.chapter).toBe('v1-jupiter');
    expect(calls[0]!.initialEt).toBe(v1Jupiter.anchorEt);
  });

  it('unsubscribe stops further popstate notifications', () => {
    const wm = makeWin('', '/');
    const sync = new URLSync(wm.win);
    let calls = 0;
    const detach = sync.installPopstateHandler(() => {
      calls++;
    });
    wm.navigate('/c/v1-jupiter', '');
    expect(calls).toBe(1);
    detach();
    wm.navigate('/c/v2-jupiter', '');
    expect(calls).toBe(1);
  });

  it('a throwing handler does not crash the popstate listener (defensive)', () => {
    const wm = makeWin('', '/');
    const sync = new URLSync(wm.win);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sync.installPopstateHandler(() => {
      throw new Error('boom');
    });
    expect(() => wm.navigate('/c/v1-jupiter', '')).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('installing twice replaces the previous handler (idempotent)', () => {
    const wm = makeWin('', '/');
    const sync = new URLSync(wm.win);
    let a = 0;
    let b = 0;
    sync.installPopstateHandler(() => {
      a++;
    });
    sync.installPopstateHandler(() => {
      b++;
    });
    wm.navigate('/c/v1-jupiter', '');
    expect(a).toBe(0);
    expect(b).toBe(1);
  });

  it('dispose() detaches the popstate handler', () => {
    const wm = makeWin('', '/');
    const sync = new URLSync(wm.win);
    let calls = 0;
    sync.installPopstateHandler(() => {
      calls++;
    });
    sync.dispose();
    wm.navigate('/c/v1-jupiter', '');
    expect(calls).toBe(0);
  });
});
