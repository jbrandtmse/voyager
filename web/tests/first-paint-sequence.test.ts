// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { startFirstPaint } from '../src/boot/first-paint';
import { TITLE_CARD_HOLD_MS, MISSION_START_ET } from '../src/constants/mission';

describe('Story 1.9 Task 9 — first-paint sequence integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    // Reset history search to clean state.
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('mounts the title card immediately on first paint', () => {
    startFirstPaint(document.body);
    expect(document.querySelector('v-title-card')).toBeTruthy();
  });

  it('mounts the timeline scrubber underneath, hidden until dissolve', () => {
    startFirstPaint(document.body);
    const scrubber = document.querySelector('v-timeline-scrubber') as HTMLElement | null;
    expect(scrubber).toBeTruthy();
    expect(scrubber!.style.visibility).toBe('hidden');
  });

  it('removes the title card after the dissolve completes', async () => {
    startFirstPaint(document.body);
    const tc = document.querySelector('v-title-card') as HTMLElement;
    expect(tc).toBeTruthy();
    // Wait for connectedCallback → updateComplete.
    await Promise.resolve();
    vi.advanceTimersByTime(TITLE_CARD_HOLD_MS + 700);
    // Yield a microtask so the once-listener fires.
    await Promise.resolve();
    expect(document.querySelector('v-title-card')).toBeNull();
  });

  it('reveals the scrubber after the dissolve completes', async () => {
    startFirstPaint(document.body);
    const scrubber = document.querySelector('v-timeline-scrubber') as HTMLElement;
    await Promise.resolve();
    vi.advanceTimersByTime(TITLE_CARD_HOLD_MS + 700);
    await Promise.resolve();
    expect(scrubber.style.visibility).toBe('');
  });

  it('no modal / cookie banner / signup prompt is rendered (AC1)', () => {
    startFirstPaint(document.body);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('.cookie-banner')).toBeNull();
    expect(document.querySelector('[data-signup]')).toBeNull();
  });

  it('scrubber initial simEt is MISSION_START_ET when no ?t= is present', async () => {
    window.history.replaceState(null, '', '/');
    startFirstPaint(document.body);
    const scrubber = document.querySelector('v-timeline-scrubber') as HTMLElement & {
      simEt: number;
    };
    await Promise.resolve();
    expect(scrubber.simEt).toBe(MISSION_START_ET);
  });

  it('scrubber initial simEt is set from a valid ?t=', async () => {
    window.history.replaceState(null, '', '/?t=1989-08-25T09:23:00Z');
    startFirstPaint(document.body);
    const scrubber = document.querySelector('v-timeline-scrubber') as HTMLElement & {
      simEt: number;
    };
    await Promise.resolve();
    // ET for 1989-08-25T09:23:00Z is ~-326687763.8 — should match within tolerance.
    expect(scrubber.simEt).toBeLessThan(MISSION_START_ET + 1e10);
    expect(scrubber.simEt).toBeGreaterThan(-326687800);
    expect(scrubber.simEt).toBeLessThan(-326687700);
  });

  it('falls back to MISSION_START_ET on malformed ?t= (NFR-S7 silent reject)', async () => {
    window.history.replaceState(null, '', '/?t=garbage');
    startFirstPaint(document.body);
    const scrubber = document.querySelector('v-timeline-scrubber') as HTMLElement & {
      simEt: number;
    };
    await Promise.resolve();
    expect(scrubber.simEt).toBe(MISSION_START_ET);
    // No error surface.
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('mounts exactly one title card and one scrubber on a single boot', () => {
    startFirstPaint(document.body);
    expect(document.querySelectorAll('v-title-card').length).toBe(1);
    expect(document.querySelectorAll('v-timeline-scrubber').length).toBe(1);
  });
});
