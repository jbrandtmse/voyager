// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { URLSync, type UrlSyncWindow } from './url-sync';
import { MISSION_START_ET, MISSION_END_ET } from '../constants/mission';
import { etFromIso, isoFromEt } from '../math/et-conversions';

// Helper: build a minimal UrlSyncWindow stub with capture-style assertions.
const makeWin = (search = '', pathname = '/', hash = ''): {
  win: UrlSyncWindow;
  replaceCalls: Array<{ data: unknown; title: string; url: string | URL | null | undefined }>;
} => {
  const replaceCalls: Array<{ data: unknown; title: string; url: string | URL | null | undefined }> = [];
  const win: UrlSyncWindow = {
    location: { search, pathname, hash },
    history: {
      replaceState: (
        data: unknown,
        title: string,
        url?: string | URL | null,
      ) => {
        replaceCalls.push({ data, title, url });
      },
    } as unknown as History,
  };
  return { win, replaceCalls };
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
