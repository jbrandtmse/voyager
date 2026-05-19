/**
 * Frame-rate dev readout (Story 1.13 AC5).
 *
 * URL-gated via `?perf=fps`. Once activated, hooks `RenderEngine.onFrame`
 * and tracks the wall-clock interval between consecutive ticks; renders a
 * minimal text overlay with `frame#`, `fps`, `p95 frame-ms`, `p99 frame-ms`
 * recomputed every `READOUT_REFRESH_MS`.
 *
 * The percentile math runs over a rolling window of the last
 * `WINDOW_SIZE` frame durations (default 240 ≈ 4 s at 60 FPS). Outside
 * this window, older frame durations are discarded.
 *
 * Story 7.6 (L4 Playwright) will lift the manual-run loop into automated
 * CI. For this story, the overlay exists and the developer documents
 * observed values in the Dev Agent Record.
 *
 * Test surface: `computePercentile` is exported for unit testing without
 * standing up a real RenderEngine. The full `startFpsReadout` flow is
 * tested against a fake engine that exposes a synthetic `onFrame`.
 */

export const FPS_MODE_FLAG = 'fps';

/** Rolling window of frame durations to keep for percentile computation. */
export const WINDOW_SIZE = 240;

/** How often the overlay re-renders (independent of frame rate). */
export const READOUT_REFRESH_MS = 250;

export const isFpsReadoutMode = (perfMode: string | null | undefined): boolean =>
  perfMode === FPS_MODE_FLAG;

/**
 * Compute the p-th percentile of `values` via linear interpolation between
 * adjacent samples (matches numpy's default "linear" method). `values` must
 * not be empty; the function does not allocate (callers re-use a sorted-copy
 * buffer).
 *
 * Exported for unit-testing — the readout's main path inlines the same math.
 */
export const computePercentile = (sortedAscending: number[], p: number): number => {
  if (sortedAscending.length === 0) return NaN;
  if (sortedAscending.length === 1) return sortedAscending[0];
  const clamped = Math.min(Math.max(p, 0), 100);
  const rank = (clamped / 100) * (sortedAscending.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAscending[lo];
  const frac = rank - lo;
  return sortedAscending[lo] * (1 - frac) + sortedAscending[hi] * frac;
};

/** Minimum surface the readout needs from a render engine. */
export interface FpsReadoutEngine {
  onFrame(callback: () => void): () => void;
}

export interface FpsReadoutHandle {
  /** Detach the frame-callback and remove the DOM element. */
  dispose(): void;
  /** Test helper — returns the current snapshot without waiting for refresh. */
  _peek(): FpsSnapshot;
}

export interface FpsSnapshot {
  frame: number;
  fps: number;
  p95FrameMs: number;
  p99FrameMs: number;
}

export interface FpsReadoutOptions {
  /** Mount target. Defaults to document.body. */
  mount?: HTMLElement;
  /** Override the now-ms function for deterministic tests. */
  nowMs?: () => number;
  /**
   * Disable the DOM mount; useful for tests that just want to exercise the
   * accumulator and percentile math.
   */
  domless?: boolean;
}

/**
 * Mount the FPS readout overlay and hook the engine's frame callback.
 * Returns a disposer for tests / teardown.
 */
export const startFpsReadout = (
  engine: FpsReadoutEngine,
  options: FpsReadoutOptions = {},
): FpsReadoutHandle => {
  const now = options.nowMs ?? defaultNowMs;
  const durations: number[] = [];
  let frameCount = 0;
  let lastTimeMs = now();
  let lastSnapshot: FpsSnapshot = {
    frame: 0,
    fps: NaN,
    p95FrameMs: NaN,
    p99FrameMs: NaN,
  };

  let overlay: HTMLPreElement | null = null;
  if (!options.domless && typeof document !== 'undefined') {
    overlay = document.createElement('pre');
    overlay.id = 'v-fps-readout';
    // Keep the overlay's styling self-contained — no dependency on
    // tokens.css being loaded. Inline styles only.
    overlay.style.position = 'fixed';
    overlay.style.top = '8px';
    overlay.style.right = '8px';
    overlay.style.padding = '6px 10px';
    overlay.style.background = 'rgba(0, 0, 0, 0.7)';
    overlay.style.color = '#e8eaed';
    overlay.style.font = '12px "JetBrains Mono", monospace';
    overlay.style.borderRadius = '4px';
    overlay.style.zIndex = '99998';
    overlay.style.pointerEvents = 'none';
    overlay.textContent = 'fps: —';
    const mount = options.mount ?? document.body;
    mount.appendChild(overlay);
  }

  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  if (overlay !== null) {
    refreshTimer = setInterval(() => {
      lastSnapshot = computeSnapshot(durations, frameCount);
      overlay!.textContent = formatSnapshot(lastSnapshot);
    }, READOUT_REFRESH_MS);
  }

  const detach = engine.onFrame(() => {
    const t = now();
    const delta = t - lastTimeMs;
    lastTimeMs = t;
    frameCount += 1;
    // First frame's delta is meaningless (it measures the gap between
    // construction and first tick, not a real inter-frame interval).
    // We still bump frameCount + refresh lastSnapshot so callers can
    // observe progress.
    if (frameCount > 1) {
      durations.push(delta);
      if (durations.length > WINDOW_SIZE) {
        durations.shift();
      }
    }
    // Even in domless mode we keep lastSnapshot live so _peek() returns
    // current values for unit tests.
    if (overlay === null) {
      lastSnapshot = computeSnapshot(durations, frameCount);
    }
  });

  return {
    dispose: () => {
      detach();
      if (refreshTimer !== null) clearInterval(refreshTimer);
      if (overlay !== null && overlay.parentNode !== null) {
        overlay.parentNode.removeChild(overlay);
      }
    },
    _peek: () => lastSnapshot,
  };
};

const computeSnapshot = (durations: number[], frameCount: number): FpsSnapshot => {
  if (durations.length === 0) {
    return { frame: frameCount, fps: NaN, p95FrameMs: NaN, p99FrameMs: NaN };
  }
  const sorted = durations.slice().sort((a, b) => a - b);
  const meanMs = durations.reduce((acc, x) => acc + x, 0) / durations.length;
  return {
    frame: frameCount,
    fps: meanMs > 0 ? 1000 / meanMs : NaN,
    p95FrameMs: computePercentile(sorted, 95),
    p99FrameMs: computePercentile(sorted, 99),
  };
};

const formatSnapshot = (s: FpsSnapshot): string => {
  const fps = Number.isFinite(s.fps) ? s.fps.toFixed(1) : '—';
  const p95 = Number.isFinite(s.p95FrameMs) ? s.p95FrameMs.toFixed(2) : '—';
  const p99 = Number.isFinite(s.p99FrameMs) ? s.p99FrameMs.toFixed(2) : '—';
  return [
    `frame#  ${s.frame}`,
    `fps     ${fps}`,
    `p95 ms  ${p95}`,
    `p99 ms  ${p99}`,
  ].join('\n');
};

const defaultNowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};
