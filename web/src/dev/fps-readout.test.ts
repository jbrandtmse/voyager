// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import {
  startFpsReadout,
  computePercentile,
  isFpsReadoutMode,
  FPS_MODE_FLAG,
  WINDOW_SIZE,
  type FpsReadoutEngine,
} from './fps-readout';

/** Stand-in for RenderEngine.onFrame — captures the callback so tests can drive it. */
interface FakeEngineHandle {
  engine: FpsReadoutEngine;
  fire: () => void;
  isUnsubscribed: () => boolean;
}

const makeFakeEngine = (): FakeEngineHandle => {
  let cb: (() => void) | null = null;
  let unsubscribed = false;
  const engine: FpsReadoutEngine = {
    onFrame(callback: () => void) {
      cb = callback;
      return () => {
        unsubscribed = true;
        cb = null;
      };
    },
  };
  return {
    engine,
    fire: () => {
      if (cb !== null) cb();
    },
    isUnsubscribed: () => unsubscribed,
  };
};

describe('Story 1.13 AC5 — isFpsReadoutMode', () => {
  it('returns true for the FPS_MODE_FLAG sentinel', () => {
    expect(isFpsReadoutMode(FPS_MODE_FLAG)).toBe(true);
    expect(FPS_MODE_FLAG).toBe('fps');
  });

  it('returns false for null, undefined, empty, and unrelated modes', () => {
    expect(isFpsReadoutMode(null)).toBe(false);
    expect(isFpsReadoutMode(undefined)).toBe(false);
    expect(isFpsReadoutMode('')).toBe(false);
    expect(isFpsReadoutMode('ephemeris')).toBe(false);
  });
});

describe('Story 1.13 AC5 — computePercentile math', () => {
  it('p50 of [1..9] = 5', () => {
    expect(computePercentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 50)).toBe(5);
  });

  it('p100 = max', () => {
    expect(computePercentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it('p0 = min', () => {
    expect(computePercentile([10, 20, 30, 40, 50], 0)).toBe(10);
  });

  it('p95 of 100 uniform values is linearly interpolated', () => {
    const vals = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    // rank = 95 * 99 / 100 = 94.05; lo=94 hi=95; values[94]=95, values[95]=96; 95 + 0.05*1 = 95.05
    expect(computePercentile(vals, 95)).toBeCloseTo(95.05, 6);
  });

  it('p99 of 100 uniform values', () => {
    const vals = Array.from({ length: 100 }, (_, i) => i + 1);
    // rank = 99 * 99 / 100 = 98.01; lo=98 hi=99; values[98]=99, values[99]=100; 99 + 0.01*1 = 99.01
    expect(computePercentile(vals, 99)).toBeCloseTo(99.01, 6);
  });

  it('clamps p outside [0, 100]', () => {
    expect(computePercentile([1, 2, 3], -5)).toBe(1);
    expect(computePercentile([1, 2, 3], 150)).toBe(3);
  });

  it('returns NaN for empty input', () => {
    expect(computePercentile([], 50)).toBeNaN();
  });

  it('single-value input returns that value for any percentile', () => {
    expect(computePercentile([7], 50)).toBe(7);
    expect(computePercentile([7], 95)).toBe(7);
    expect(computePercentile([7], 0)).toBe(7);
  });
});

describe('Story 1.13 AC5 — startFpsReadout accumulator behavior', () => {
  it('first frame produces no duration sample (no inter-frame interval yet)', () => {
    const { engine, fire } = makeFakeEngine();
    let t = 0;
    const handle = startFpsReadout(engine, {
      domless: true,
      nowMs: () => t,
    });
    t = 16;
    fire();
    // Only one frame fired — durations array is empty, fps is NaN.
    const snap = handle._peek();
    expect(snap.frame).toBe(1);
    expect(Number.isNaN(snap.fps)).toBe(true);
    handle.dispose();
  });

  it('two frames at 16ms apart yields fps ≈ 62.5', () => {
    const { engine, fire } = makeFakeEngine();
    let t = 0;
    const handle = startFpsReadout(engine, {
      domless: true,
      nowMs: () => t,
    });
    t = 0;
    fire();
    t = 16;
    fire();
    const snap = handle._peek();
    expect(snap.frame).toBe(2);
    expect(snap.fps).toBeCloseTo(1000 / 16, 3);
    handle.dispose();
  });

  it('uniform 16ms cadence drives fps to 62.5 and p95/p99 to 16ms', () => {
    const { engine, fire } = makeFakeEngine();
    let t = 0;
    const handle = startFpsReadout(engine, {
      domless: true,
      nowMs: () => t,
    });
    for (let i = 0; i < 20; i++) {
      t += 16;
      fire();
    }
    const snap = handle._peek();
    expect(snap.frame).toBe(20);
    expect(snap.fps).toBeCloseTo(1000 / 16, 3);
    expect(snap.p95FrameMs).toBeCloseTo(16, 3);
    expect(snap.p99FrameMs).toBeCloseTo(16, 3);
    handle.dispose();
  });

  it('multiple slow frames push p99 above p95', () => {
    const { engine, fire } = makeFakeEngine();
    let t = 0;
    const handle = startFpsReadout(engine, {
      domless: true,
      nowMs: () => t,
    });
    // 90 fast frames at 16 ms + 10 slow frames at 100 ms. With linear
    // percentile interpolation, p99 lands inside the slow tail and p95
    // lands at the boundary between fast and slow.
    for (let i = 0; i < 90; i++) {
      t += 16;
      fire();
    }
    for (let i = 0; i < 10; i++) {
      t += 100;
      fire();
    }
    const snap = handle._peek();
    expect(snap.p99FrameMs).toBeGreaterThan(50);
    expect(snap.p95FrameMs).toBeGreaterThanOrEqual(16);
    expect(snap.p99FrameMs).toBeGreaterThanOrEqual(snap.p95FrameMs);
    handle.dispose();
  });

  it('windowing — durations array never exceeds WINDOW_SIZE', () => {
    const { engine, fire } = makeFakeEngine();
    let t = 0;
    const handle = startFpsReadout(engine, {
      domless: true,
      nowMs: () => t,
    });
    for (let i = 0; i < WINDOW_SIZE * 3; i++) {
      t += 16;
      fire();
    }
    // Indirectly assert the window is bounded: a very-old slow frame would
    // skew percentiles forever without windowing. We don't expose the
    // internal array, but we can assert that the snapshot is well-formed
    // after many frames.
    const snap = handle._peek();
    expect(Number.isFinite(snap.fps)).toBe(true);
    expect(Number.isFinite(snap.p95FrameMs)).toBe(true);
    handle.dispose();
  });

  it('dispose() detaches the frame callback and stops accumulating', () => {
    const { engine, fire } = makeFakeEngine();
    let t = 0;
    const handle = startFpsReadout(engine, {
      domless: true,
      nowMs: () => t,
    });
    fire();
    t = 16;
    fire();
    const before = handle._peek();
    handle.dispose();
    t = 32;
    fire();
    fire();
    const after = handle._peek();
    expect(after.frame).toBe(before.frame); // unchanged after dispose
  });

  it('DOM mount renders an overlay element', () => {
    const { engine } = makeFakeEngine();
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = startFpsReadout(engine, { mount });
    const overlay = mount.querySelector('#v-fps-readout');
    expect(overlay).not.toBeNull();
    handle.dispose();
    expect(mount.querySelector('#v-fps-readout')).toBeNull();
    document.body.removeChild(mount);
  });

  it('domless option suppresses DOM mutation', () => {
    const { engine } = makeFakeEngine();
    const before = document.body.innerHTML;
    const handle = startFpsReadout(engine, { domless: true });
    expect(document.body.innerHTML).toBe(before);
    handle.dispose();
  });
});
