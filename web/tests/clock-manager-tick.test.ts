// @vitest-environment happy-dom
//
// Story 1.10 Task 10 — integration test that constructs a ClockManager,
// sets a rate, calls tick() N times, and asserts simTimeEt advances
// correctly. This is the canonical end-to-end smoke for the per-frame
// heartbeat (architecture line 78).

import { describe, it, expect } from 'vitest';

import {
  ClockManager,
  MAX_PLAYBACK_RATE,
  type ChunkLoaderLike,
} from '../src/services/clock-manager';
import { MISSION_START_ET, MISSION_END_ET } from '../src/constants/mission';

describe('Story 1.10 — ClockManager.tick() end-to-end advance', () => {
  it('advances by playbackRate × dt over N ticks at 1×', () => {
    const c = new ClockManager();
    c.play();
    const start = c.simTimeEt;
    for (let i = 0; i < 100; i++) c.tick(10); // 100 × 10 ms = 1 sec
    // simTimeEt baseline is ~-7e8, so the ULP at that magnitude is ~1e-7 —
    // accumulating 100 additions gives ~1e-5 relative error budget.
    expect(c.simTimeEt - start).toBeCloseTo(1, 4);
  });

  it('advances by ~1 day-worth of sim time at 86400× over 1 wall-second', () => {
    const c = new ClockManager();
    c.setRate(86_400);
    c.play();
    const start = c.simTimeEt;
    // 60 ticks of 16.67 ms = ~1000 ms wall-clock.
    for (let i = 0; i < 60; i++) c.tick(16.67);
    const advancedSimSec = c.simTimeEt - start;
    // Expected: 86400 × 1.0002 ≈ 86417 sec; allow ±2 sec for dt rounding.
    expect(advancedSimSec).toBeGreaterThan(86_400 - 10);
    expect(advancedSimSec).toBeLessThan(86_400 + 100);
  });

  it('respects pause: tick during pause does not advance', () => {
    const c = new ClockManager();
    c.play();
    c.tick(100);
    c.pause();
    const at = c.simTimeEt;
    for (let i = 0; i < 100; i++) c.tick(16.67);
    expect(c.simTimeEt).toBe(at);
  });

  it('scrubTo + play resumes from the new ET', () => {
    const c = new ClockManager();
    const mid = MISSION_START_ET + 1e8;
    c.scrubTo(mid);
    expect(c.simTimeEt).toBe(mid);
    c.play();
    c.tick(100); // 1× × 0.1s = +0.1
    // ET ~ -6e8 → ULP ≈ 1e-7; one tick advances by 0.1, so test to 6 sig figs.
    expect(c.simTimeEt - mid).toBeCloseTo(0.1, 6);
  });

  it('clamps at MISSION_END_ET when ticks overshoot', () => {
    const c = new ClockManager();
    c.setRate(MAX_PLAYBACK_RATE);
    c.scrubTo(MISSION_END_ET - 1);
    c.play();
    c.tick(1000); // would advance 1e9 sec — clamps.
    expect(c.simTimeEt).toBe(MISSION_END_ET);
  });

  it('autoCap from a chunk-loader-like suppresses advance', () => {
    let loading = false;
    const subs = new Set<(loading: boolean) => void>();
    const loader: ChunkLoaderLike = {
      get loading(): boolean { return loading; },
      subscribe(cb): () => void {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    };
    const c = new ClockManager();
    c.setChunkLoader(loader);
    c.setRate(100);
    c.play();
    c.tick(100); // +10 sim-sec
    const beforeCap = c.simTimeEt;
    loading = true;
    for (const cb of subs) cb(true);
    expect(c.autoCapped).toBe(true);
    c.tick(1000); // would advance, but auto-capped → no-op.
    expect(c.simTimeEt).toBe(beforeCap);
    // Release the cap; ticks resume at user's chosen rate.
    loading = false;
    for (const cb of subs) cb(false);
    expect(c.autoCapped).toBe(false);
    c.tick(100); // +10 sim-sec resumed
    expect(c.simTimeEt).toBeGreaterThan(beforeCap);
  });
});
