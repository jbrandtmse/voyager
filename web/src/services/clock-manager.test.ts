import { describe, it, expect, vi } from 'vitest';

import {
  ClockManager,
  MIN_PLAYBACK_RATE,
  MAX_PLAYBACK_RATE,
  type ChunkLoaderLike,
  type ClockState,
} from './clock-manager';
import { MISSION_START_ET, MISSION_END_ET } from '../constants/mission';

const SECOND = 1000;

describe('Story 1.10 AC1 — ClockManager initial state', () => {
  it('defaults: simTimeEt=MISSION_START_ET, playbackRate=1, playing=false, autoCapped=false', () => {
    const c = new ClockManager();
    expect(c.simTimeEt).toBe(MISSION_START_ET);
    expect(c.playbackRate).toBe(1);
    expect(c.playing).toBe(false);
    expect(c.autoCapped).toBe(false);
  });
});

describe('Story 1.10 AC1 — tick advances simTimeEt by playbackRate × dt only when playing', () => {
  it('does NOT advance when paused', () => {
    const c = new ClockManager();
    const before = c.simTimeEt;
    c.tick(16.67);
    expect(c.simTimeEt).toBe(before);
  });

  it('advances by playbackRate × dt/1000 seconds when playing', () => {
    const c = new ClockManager();
    c.play();
    const before = c.simTimeEt;
    c.tick(SECOND); // 1 sec real, 1× → +1 sec sim
    expect(c.simTimeEt - before).toBeCloseTo(1, 9);
  });

  it('at 60× advances 60 sec per 1 sec real', () => {
    const c = new ClockManager();
    c.setRate(60);
    c.play();
    const before = c.simTimeEt;
    c.tick(SECOND);
    expect(c.simTimeEt - before).toBeCloseTo(60, 6);
  });

  it('at 1,000,000× advances 1e6 sec per 1 sec real', () => {
    const c = new ClockManager();
    c.setRate(MAX_PLAYBACK_RATE);
    c.play();
    const before = c.simTimeEt;
    c.tick(SECOND);
    expect(c.simTimeEt - before).toBeCloseTo(1_000_000, 0);
  });

  it('clamps simTimeEt at MISSION_END_ET on overshoot', () => {
    const c = new ClockManager();
    c.scrubTo(MISSION_END_ET - 1);
    c.play();
    c.tick(SECOND); // overshoot
    expect(c.simTimeEt).toBe(MISSION_END_ET);
  });

  it('does NOT advance when autoCapped', () => {
    const loader: ChunkLoaderLike = makeFakeLoader(true);
    const c = new ClockManager();
    c.setChunkLoader(loader);
    c.play();
    const before = c.simTimeEt;
    c.tick(SECOND);
    expect(c.simTimeEt).toBe(before);
    expect(c.autoCapped).toBe(true);
  });

  it('tick is a no-op for non-finite or non-positive dt', () => {
    const c = new ClockManager();
    c.play();
    const before = c.simTimeEt;
    c.tick(0);
    c.tick(-100);
    c.tick(Number.NaN);
    c.tick(Number.POSITIVE_INFINITY);
    expect(c.simTimeEt).toBe(before);
  });
});

describe('Story 1.10 AC1 — setRate validation', () => {
  it('clamps below 1', () => {
    const c = new ClockManager();
    c.setRate(0.001);
    expect(c.playbackRate).toBe(MIN_PLAYBACK_RATE);
    c.setRate(-99);
    expect(c.playbackRate).toBe(MIN_PLAYBACK_RATE);
  });

  it('clamps above 1,000,000', () => {
    const c = new ClockManager();
    c.setRate(2_000_000);
    expect(c.playbackRate).toBe(MAX_PLAYBACK_RATE);
  });

  it('accepts in-range integers', () => {
    const c = new ClockManager();
    c.setRate(1000);
    expect(c.playbackRate).toBe(1000);
  });

  it('throws RangeError on NaN / ±Infinity', () => {
    const c = new ClockManager();
    expect(() => c.setRate(Number.NaN)).toThrow(RangeError);
    expect(() => c.setRate(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => c.setRate(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('Story 1.10 AC1 — play / pause are no-ops when already in requested state', () => {
  it('play() then play() fires subscribers exactly once', () => {
    const c = new ClockManager();
    const cb = vi.fn<(s: ClockState) => void>();
    c.subscribe(cb);
    c.play();
    c.play();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].playing).toBe(true);
  });

  it('pause() when already paused does NOT fire', () => {
    const c = new ClockManager();
    const cb = vi.fn<(s: ClockState) => void>();
    c.subscribe(cb);
    c.pause();
    expect(cb).not.toHaveBeenCalled();
  });

  it('pause() while playing fires subscribers', () => {
    const c = new ClockManager();
    c.play();
    const cb = vi.fn<(s: ClockState) => void>();
    c.subscribe(cb);
    c.pause();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].playing).toBe(false);
  });
});

describe('Story 1.10 AC1 — scrubTo clamps + pauses + fires subscribers', () => {
  it('clamps below MISSION_START_ET', () => {
    const c = new ClockManager();
    c.scrubTo(MISSION_START_ET - 1e9);
    expect(c.simTimeEt).toBe(MISSION_START_ET);
  });

  it('clamps above MISSION_END_ET', () => {
    const c = new ClockManager();
    c.scrubTo(MISSION_END_ET + 1e9);
    expect(c.simTimeEt).toBe(MISSION_END_ET);
  });

  it('pauses as a side effect when playing', () => {
    const c = new ClockManager();
    c.play();
    expect(c.playing).toBe(true);
    c.scrubTo(MISSION_START_ET + 1e6);
    expect(c.playing).toBe(false);
  });

  it('fires subscribers with the new ET and playing=false', () => {
    const c = new ClockManager();
    c.play();
    const cb = vi.fn<(s: ClockState) => void>();
    c.subscribe(cb);
    const target = MISSION_START_ET + 1e6;
    c.scrubTo(target);
    // play() + scrubTo() fire; check last invocation.
    expect(cb).toHaveBeenCalled();
    const last = cb.mock.calls[cb.mock.calls.length - 1][0];
    expect(last.simTimeEt).toBe(target);
    expect(last.playing).toBe(false);
  });

  it('non-finite et is silently dropped to current simTimeEt (still pauses)', () => {
    const c = new ClockManager();
    c.play();
    const before = c.simTimeEt;
    c.scrubTo(Number.NaN);
    expect(c.simTimeEt).toBe(before);
    expect(c.playing).toBe(false);
  });
});

describe('Story 1.10 AC1 — subscribe / unsubscribe', () => {
  it('subscriber receives a snapshot, NOT the live instance', () => {
    const c = new ClockManager();
    let captured: ClockState | null = null;
    c.subscribe((s) => {
      captured = s;
    });
    c.play();
    expect(captured).not.toBeNull();
    // Mutate the snapshot externally; service must not be affected.
    if (captured !== null) {
      (captured as ClockState).simTimeEt = 12345;
    }
    expect(c.simTimeEt).toBe(MISSION_START_ET);
  });

  it('unsubscribe stops further notifications', () => {
    const c = new ClockManager();
    const cb = vi.fn<(s: ClockState) => void>();
    const off = c.subscribe(cb);
    c.play();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    c.pause();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('multiple subscribers all fire on each state change', () => {
    const c = new ClockManager();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    c.subscribe(cb1);
    c.subscribe(cb2);
    c.play();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on tick()-driven simTimeEt updates', () => {
    const c = new ClockManager();
    c.play();
    const cb = vi.fn<(s: ClockState) => void>();
    c.subscribe(cb);
    c.tick(16.67);
    c.tick(16.67);
    c.tick(16.67);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('Story 1.10 AC6 — FR7 auto speed-cap via ChunkLoader.loading', () => {
  it('autoCapped follows the loader.loading flag on subscribe-time seed', () => {
    const loader = makeFakeLoader(true);
    const c = new ClockManager();
    c.setChunkLoader(loader);
    expect(c.autoCapped).toBe(true);
  });

  it('autoCapped flips on subsequent loading transitions', () => {
    const loader = makeFakeLoader(false);
    const c = new ClockManager();
    c.setChunkLoader(loader);
    expect(c.autoCapped).toBe(false);
    loader.emit(true);
    expect(c.autoCapped).toBe(true);
    loader.emit(false);
    expect(c.autoCapped).toBe(false);
  });

  it('subscribers fire on auto-cap entry AND exit', () => {
    const loader = makeFakeLoader(false);
    const c = new ClockManager();
    c.setChunkLoader(loader);
    const cb = vi.fn<(s: ClockState) => void>();
    c.subscribe(cb);
    loader.emit(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].autoCapped).toBe(true);
    loader.emit(false);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1][0].autoCapped).toBe(false);
  });

  it('does NOT fire a notification when loading flips to the same value', () => {
    const loader = makeFakeLoader(true);
    const c = new ClockManager();
    c.setChunkLoader(loader);
    const cb = vi.fn();
    c.subscribe(cb);
    loader.emit(true);
    expect(cb).not.toHaveBeenCalled();
  });

  it('user playbackRate is preserved across an auto-cap cycle', () => {
    const loader = makeFakeLoader(false);
    const c = new ClockManager();
    c.setChunkLoader(loader);
    c.setRate(1000);
    c.play();
    loader.emit(true);
    expect(c.playbackRate).toBe(1000); // user value preserved
    loader.emit(false);
    expect(c.playbackRate).toBe(1000);
  });

  it('setChunkLoader(null) detaches and clears autoCapped', () => {
    const loader = makeFakeLoader(true);
    const c = new ClockManager();
    c.setChunkLoader(loader);
    expect(c.autoCapped).toBe(true);
    c.setChunkLoader(null);
    expect(c.autoCapped).toBe(false);
    // Subsequent emissions are ignored.
    loader.emit(true);
    expect(c.autoCapped).toBe(false);
  });

  it('dispose() detaches loader and clears subscribers', () => {
    const loader = makeFakeLoader(false);
    const c = new ClockManager();
    c.setChunkLoader(loader);
    const cb = vi.fn();
    c.subscribe(cb);
    c.dispose();
    loader.emit(true);
    c.play();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('Story 1.10 AC7 — synthetic mission-scrub perf (ClockManager math budget)', () => {
  // NFR-P6 interpretation: the AC7 "≤ 60 seconds wall-clock" target is
  // bounded by the real renderer (Story 7.6 L4 Playwright). This synthetic
  // harness asserts only the ClockManager arithmetic budget: that running
  // every per-frame tick(...) from MISSION_START to MISSION_END at 1,000,000×
  // completes in JS in well under the 60-second wall-clock budget. At 1M×
  // and a 16.67 ms tick, that's ~101k ticks of essentially-free arithmetic
  // (one multiply, one add, one compare, one clamp). On any reasonable host
  // the loop completes in <100 ms.
  it('runs the full mission scrub at 1M× in ≤ 60s of JS wall-clock', () => {
    const c = new ClockManager();
    c.setRate(MAX_PLAYBACK_RATE);
    c.play();
    const dtMs = 16.67;
    const startMs =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    let iters = 0;
    // Loose iteration cap protects against an infinite loop bug.
    const maxIters = 1_000_000;
    while (c.simTimeEt < MISSION_END_ET && iters < maxIters) {
      c.tick(dtMs);
      iters++;
    }
    const elapsedMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs;
    expect(c.simTimeEt).toBe(MISSION_END_ET);
    expect(elapsedMs).toBeLessThan(60_000);
  });

  it('no individual tick(...) call exceeds 50 ms (NFR-P2)', () => {
    const c = new ClockManager();
    c.setRate(MAX_PLAYBACK_RATE);
    c.play();
    const dtMs = 16.67;
    let maxPerTickMs = 0;
    let iters = 0;
    const maxIters = 1_000_000;
    while (c.simTimeEt < MISSION_END_ET && iters < maxIters) {
      const t0 =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      c.tick(dtMs);
      const t1 =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      maxPerTickMs = Math.max(maxPerTickMs, t1 - t0);
      iters++;
    }
    expect(maxPerTickMs).toBeLessThan(50);
  });
});

// === Fake ChunkLoader helper ============================================

interface FakeLoader extends ChunkLoaderLike {
  emit(loading: boolean): void;
}

const makeFakeLoader = (initial: boolean): FakeLoader => {
  let current = initial;
  const subs = new Set<(loading: boolean) => void>();
  return {
    get loading(): boolean {
      return current;
    },
    subscribe(cb): () => void {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    emit(loading: boolean): void {
      current = loading;
      for (const cb of subs) cb(loading);
    },
  };
};
