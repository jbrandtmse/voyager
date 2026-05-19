// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import {
  isMissionScrubMode,
  runMissionScrubPerf,
  renderMissionScrubReport,
  startMissionScrubPerf,
} from './mission-scrub-perf';

describe('Story 1.10 Task 9 — mission-scrub mode detection', () => {
  it('isMissionScrubMode returns true for "mission-scrub"', () => {
    expect(isMissionScrubMode('mission-scrub')).toBe(true);
  });

  it('isMissionScrubMode returns false for null / other values', () => {
    expect(isMissionScrubMode(null)).toBe(false);
    expect(isMissionScrubMode('ephemeris')).toBe(false);
    expect(isMissionScrubMode('')).toBe(false);
  });
});

describe('Story 1.10 AC7 — runMissionScrubPerf reaches MISSION_END_ET', () => {
  it('totalTicks > 0 and simulation completes', () => {
    const r = runMissionScrubPerf();
    expect(r.totalTicks).toBeGreaterThan(0);
    // Synthetic harness should never bail at the iteration cap (1M ticks).
    expect(r.totalTicks).toBeLessThan(1_000_000);
  });

  it('wall-clock JS time is well under 60s (NFR-P6 synthetic bound)', () => {
    const r = runMissionScrubPerf();
    expect(r.totalWallMs).toBeLessThan(60_000);
  });

  it('max tick is under 50ms (NFR-P2 synthetic bound)', () => {
    const r = runMissionScrubPerf();
    expect(r.maxTickMs).toBeLessThan(50);
  });

  it('median and p99 are sensible non-negative numbers', () => {
    const r = runMissionScrubPerf();
    expect(r.medianTickMs).toBeGreaterThanOrEqual(0);
    expect(r.p99TickMs).toBeGreaterThanOrEqual(r.medianTickMs);
    expect(r.maxTickMs).toBeGreaterThanOrEqual(r.p99TickMs);
  });
});

describe('Story 1.10 Task 9 — renderMissionScrubReport', () => {
  it('appends a <pre> with the perf numbers to the host', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const r = runMissionScrubPerf();
    const pre = renderMissionScrubReport(r, host);
    expect(pre.tagName).toBe('PRE');
    expect(pre.getAttribute('data-perf')).toBe('mission-scrub');
    expect(host.contains(pre)).toBe(true);
    expect(pre.textContent).toMatch(/mission-scrub perf/);
    expect(pre.textContent).toMatch(/NFR-P6/);
    expect(pre.textContent).toMatch(/NFR-P2/);
    host.remove();
  });

  it('reports PASS for NFR-P6 (wall < 60s)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const r = runMissionScrubPerf();
    const pre = renderMissionScrubReport(r, host);
    expect(pre.textContent).toMatch(/NFR-P6 \(≤60s wall\): PASS/);
    host.remove();
  });
});

describe('Story 1.10 Task 9 — startMissionScrubPerf entry point', () => {
  it('runs the perf + renders a report in one call', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { result, report } = startMissionScrubPerf(host);
    expect(result.totalTicks).toBeGreaterThan(0);
    expect(host.contains(report)).toBe(true);
    host.remove();
  });
});
