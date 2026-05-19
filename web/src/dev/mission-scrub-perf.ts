/**
 * Mission-scrub perf harness (Story 1.10 AC7 / NFR-P6).
 *
 * Runs the full mission scrub via `ClockManager.tick(16.67)` at 1,000,000×
 * with NO actual rendering. Measures wall-clock time and per-tick duration
 * (median, p99, max). Real-renderer L4 perf is Story 7.6's responsibility;
 * this synthetic harness validates the ClockManager arithmetic budget only.
 *
 * Activated via `?perf=mission-scrub` in the URL. Reports to a `<pre>` block
 * appended to `document.body`.
 *
 * ## Why this exists
 *
 * NFR-P6 is the load-bearing perf gate: "at 1,000,000× the simulation must
 * scrub the full 1977–2030 mission in ≤ 60 seconds wall-clock without
 * main-thread starvation." The 60-second wall-clock budget includes
 * rendering and is properly measured in a real browser (Story 7.6). What
 * this synthetic harness asserts is the ClockManager-side of the budget:
 *   - The math itself is essentially free (one mul, one add, one compare,
 *     one clamp per tick). If the synthetic loop takes more than a few
 *     hundred milliseconds, the math has regressed.
 *   - No individual `tick(...)` exceeds 50 ms (NFR-P2).
 */

import { ClockManager, MAX_PLAYBACK_RATE } from '../services/clock-manager';
import { MISSION_START_ET, MISSION_END_ET } from '../constants/mission';

const DEFAULT_DT_MS = 16.67;

export interface MissionScrubResult {
  totalTicks: number;
  totalWallMs: number;
  medianTickMs: number;
  p99TickMs: number;
  maxTickMs: number;
}

export const isMissionScrubMode = (perfMode: string | null): boolean =>
  perfMode === 'mission-scrub';

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
};

/**
 * Run the mission scrub and return aggregate timings. The harness records
 * every `tick(...)` duration but sorts the array only at the end, so the
 * cost of measurement itself doesn't taint the steady-state samples.
 */
export const runMissionScrubPerf = (
  dtMs: number = DEFAULT_DT_MS,
): MissionScrubResult => {
  const clock = new ClockManager();
  clock.setRate(MAX_PLAYBACK_RATE);
  clock.play();
  const tickSamples: number[] = [];
  const start = now();
  let iters = 0;
  const maxIters = 1_000_000;
  while (clock.simTimeEt < MISSION_END_ET && iters < maxIters) {
    const t0 = now();
    clock.tick(dtMs);
    const t1 = now();
    tickSamples.push(t1 - t0);
    iters++;
  }
  const totalWallMs = now() - start;
  const sorted = tickSamples.slice().sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const p99 = percentile(sorted, 0.99);
  const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
  return {
    totalTicks: iters,
    totalWallMs,
    medianTickMs: median,
    p99TickMs: p99,
    maxTickMs: max,
  };
};

/**
 * Render the perf result to a `<pre>` block appended to the host. The
 * report includes the same numbers `runMissionScrubPerf` returns plus a
 * pass/fail line against the NFR-P6 (≤60s) and NFR-P2 (≤50ms/tick) bounds.
 */
export const renderMissionScrubReport = (
  result: MissionScrubResult,
  host: HTMLElement = document.body,
): HTMLPreElement => {
  const pre = document.createElement('pre');
  pre.setAttribute('data-perf', 'mission-scrub');
  pre.style.position = 'fixed';
  pre.style.top = '8px';
  pre.style.left = '8px';
  pre.style.padding = '8px';
  pre.style.background = '#0a0e14';
  pre.style.color = '#e8eaed';
  pre.style.font = '12px ui-monospace, monospace';
  pre.style.zIndex = '999999';
  const spanSec = MISSION_END_ET - MISSION_START_ET;
  const nfrP6Pass = result.totalWallMs <= 60_000;
  const nfrP2Pass = result.maxTickMs < 50;
  pre.textContent = [
    `mission-scrub perf @ 1,000,000× (NFR-P6 + NFR-P2 synthetic harness)`,
    ``,
    `mission span:       ${spanSec.toFixed(0)} sec (${(spanSec / 86400).toFixed(1)} days)`,
    `tick dt:            ${DEFAULT_DT_MS} ms`,
    `total ticks:        ${result.totalTicks}`,
    `wall-clock (JS):    ${result.totalWallMs.toFixed(2)} ms`,
    `median tick:        ${result.medianTickMs.toFixed(4)} ms`,
    `p99 tick:           ${result.p99TickMs.toFixed(4)} ms`,
    `max tick:           ${result.maxTickMs.toFixed(4)} ms`,
    ``,
    `NFR-P6 (≤60s wall): ${nfrP6Pass ? 'PASS' : 'FAIL'}`,
    `NFR-P2 (<50ms/tick): ${nfrP2Pass ? 'PASS' : 'FAIL'}`,
  ].join('\n');
  host.appendChild(pre);
  return pre;
};

/**
 * Boot-time entry point. Called from `main.ts` when `?perf=mission-scrub`
 * is present. Idempotent — repeated calls render a fresh report.
 */
export const startMissionScrubPerf = (
  host: HTMLElement = document.body,
): { result: MissionScrubResult; report: HTMLPreElement } => {
  const result = runMissionScrubPerf();
  const report = renderMissionScrubReport(result, host);
  return { result, report };
};
