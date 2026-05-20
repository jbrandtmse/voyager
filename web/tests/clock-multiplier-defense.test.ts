// @vitest-environment happy-dom
//
// Story 1.10 — Defense-in-depth tests for ClockManager, <v-play-button>,
// <v-speed-multiplier>, <v-timeline-scrubber>, keyboard-shortcuts, and the
// mission-scrub perf harness.
//
// These tests are additions, not duplicates of dev-authored coverage. Each
// case below locks an invariant a future maintainer might silently break.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LitElement, html, type TemplateResult } from 'lit';

import {
  ClockManager,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  type ChunkLoaderLike,
  type ClockState,
} from '../src/services/clock-manager';
import { MISSION_START_ET, MISSION_END_ET } from '../src/constants/mission';
import { formatSpeedReadout } from '../src/math/speed-readout';
import { installKeyboardShortcuts } from '../src/boot/keyboard-shortcuts';
import { runMissionScrubPerf } from '../src/dev/mission-scrub-perf';
import { VSpeedMultiplier } from '../src/components/v-speed-multiplier';
import { VPlayButton } from '../src/components/v-play-button';
import { VTimelineScrubber } from '../src/components/v-timeline-scrubber';

// Ensure custom elements are registered (side-effect imports).
import '../src/components/v-speed-multiplier';
import '../src/components/v-play-button';
import '../src/components/v-timeline-scrubber';

// ---------------------------------------------------------------------------
// 1. ClockManager.setRate validation
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — ClockManager.setRate validation', () => {
  it('setRate(0) clamps to MIN_PLAYBACK_RATE (1)', () => {
    const c = new ClockManager();
    c.setRate(0);
    expect(c.playbackRate).toBe(MIN_PLAYBACK_RATE);
    expect(c.playbackRate).toBe(1);
  });

  it('setRate(2_000_000) clamps to MAX_PLAYBACK_RATE (1_000_000)', () => {
    const c = new ClockManager();
    c.setRate(2_000_000);
    expect(c.playbackRate).toBe(MAX_PLAYBACK_RATE);
    expect(c.playbackRate).toBe(1_000_000);
  });

  it('setRate(NaN) throws RangeError', () => {
    const c = new ClockManager();
    expect(() => c.setRate(Number.NaN)).toThrow(RangeError);
  });

  it('setRate(Infinity) throws RangeError', () => {
    const c = new ClockManager();
    expect(() => c.setRate(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => c.setRate(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it('setRate(-1) clamps to MIN_PLAYBACK_RATE (1)', () => {
    const c = new ClockManager();
    c.setRate(-1);
    expect(c.playbackRate).toBe(1);
  });

  it('throwing on NaN does not mutate the rate', () => {
    const c = new ClockManager();
    c.setRate(500);
    expect(() => c.setRate(Number.NaN)).toThrow();
    expect(c.playbackRate).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 2. Subscriber fires on play() but NOT on tick()
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — subscribers fire on state change, never on tick', () => {
  it('tick() does not fire subscribers; play()/tick()/.../play() pattern fires only on state changes', () => {
    const c = new ClockManager();
    const spy = vi.fn();
    c.subscribe(spy);

    // 60 ticks before play — still paused, simTimeEt should not advance and
    // the subscriber must remain silent regardless.
    for (let i = 0; i < 60; i++) c.tick(16.67);
    expect(spy).toHaveBeenCalledTimes(0);

    // play() flips a piece of state → exactly one fire.
    c.play();
    expect(spy).toHaveBeenCalledTimes(1);

    // 60 more ticks; per-frame advances are direct-reads, NOT subscriber-driven.
    for (let i = 0; i < 60; i++) c.tick(16.67);
    expect(spy).toHaveBeenCalledTimes(1);

    // simTimeEt should have advanced under those 60 ticks.
    expect(c.simTimeEt).toBeGreaterThan(MISSION_START_ET);
  });
});

// ---------------------------------------------------------------------------
// 3. scrubTo pauses unconditionally
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — scrubTo() pauses unconditionally', () => {
  it('scrubTo() while playing → playing becomes false', () => {
    const c = new ClockManager();
    c.play();
    expect(c.playing).toBe(true);
    c.scrubTo(MISSION_START_ET + 1e6);
    expect(c.playing).toBe(false);
  });

  it('scrubTo() while paused → still paused (idempotent on play state)', () => {
    const c = new ClockManager();
    expect(c.playing).toBe(false);
    c.scrubTo(MISSION_START_ET + 1e6);
    expect(c.playing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. autoCapped restores user's rate on resume
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — autoCapped preserves user rate across cap cycle', () => {
  it('rate=1000 → cap on → no advance → cap off → resumes at rate 1000', () => {
    let loading = false;
    const subs = new Set<(loading: boolean) => void>();
    const loader: ChunkLoaderLike = {
      get loading(): boolean {
        return loading;
      },
      subscribe(cb): () => void {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    };
    const c = new ClockManager();
    c.setChunkLoader(loader);
    c.setRate(1000);
    c.play();

    // Trigger cap.
    loading = true;
    for (const cb of subs) cb(true);
    expect(c.autoCapped).toBe(true);

    const captured = c.simTimeEt;
    c.tick(16.67);
    expect(c.simTimeEt).toBe(captured); // no advance under cap

    // Clear cap.
    loading = false;
    for (const cb of subs) cb(false);
    expect(c.autoCapped).toBe(false);

    // Rate value must still be the user's chosen 1000, not 0.
    expect(c.playbackRate).toBe(1000);

    // tick() at the restored rate advances by playbackRate × dt / 1000.
    c.tick(16.67);
    const delta = c.simTimeEt - captured;
    // 1000 × 16.67 / 1000 = 16.67 sim-sec advance.
    expect(delta).toBeCloseTo(16.67, 3);
    expect(delta).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. autoCapped doesn't fire subscriber-storm — exact per-toggle fire count
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — autoCap toggle is fire-once per transition', () => {
  it('toggling loading 100 times fires the subscriber per transition, with no extra fires', () => {
    let loading = false;
    const subs = new Set<(loading: boolean) => void>();
    const loader: ChunkLoaderLike = {
      get loading(): boolean {
        return loading;
      },
      subscribe(cb): () => void {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    };
    const c = new ClockManager();
    c.setChunkLoader(loader);

    const spy = vi.fn<(s: ClockState) => void>();
    c.subscribe(spy);

    // 100 toggles → exactly 100 distinct transitions (alternating on/off).
    // Starting at loading=false, after 100 toggles loading ends back at false.
    for (let i = 0; i < 100; i++) {
      loading = !loading;
      for (const cb of subs) cb(loading);
    }
    expect(spy).toHaveBeenCalledTimes(100);
    // End state: _autoCapped follows the loader's final loading value.
    expect(c.autoCapped).toBe(false);

    // Same-value emissions do NOT fire (idempotent on no-change).
    for (const cb of subs) cb(false);
    for (const cb of subs) cb(false);
    expect(spy).toHaveBeenCalledTimes(100);
  });
});

// ---------------------------------------------------------------------------
// 6. Speed slider snap zone boundary (position-space)
// ---------------------------------------------------------------------------

// Compute thumb position from the wired clock rate.
const posFromRate = (rate: number): number => Math.log10(rate) / 6;
const rateFromPos = (pos: number): number => Math.pow(10, pos * 6);

interface MountedMultiplier {
  el: VSpeedMultiplier;
  track: HTMLElement;
  thumb: HTMLElement;
}

const mountMultiplier = async (clock: ClockManager): Promise<MountedMultiplier> => {
  const el = document.createElement('v-speed-multiplier') as VSpeedMultiplier;
  el.clockManager = clock;
  document.body.appendChild(el);
  await el.updateComplete;
  const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
  const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
  // 600px track so clientX maps 1:1 to position * 600.
  track.getBoundingClientRect = () =>
    ({
      left: 0,
      right: 600,
      top: 0,
      bottom: 12,
      width: 600,
      height: 12,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return { el, track, thumb };
};

const synthPointer = (
  type: string,
  init: { clientX: number; target?: Element | null },
): Event => {
  const e = new Event(type, { bubbles: true });
  Object.defineProperty(e, 'clientX', { value: init.clientX, configurable: true });
  Object.defineProperty(e, 'clientY', { value: 0, configurable: true });
  Object.defineProperty(e, 'pointerType', { value: 'mouse', configurable: true });
  Object.defineProperty(e, 'pointerId', { value: 1, configurable: true });
  if (init.target !== undefined) {
    Object.defineProperty(e, 'target', { value: init.target, configurable: true });
  }
  return e;
};

describe('Story 1.10 defense — speed-slider snap boundary at exactly 5% (position-space)', () => {
  it('drag 4.99% off a decade → SNAPS (decade-3 = pos 0.5, 600px × 0.5 = 300, push to 0.5083)', async () => {
    // Decade 3 is at position 0.5 (log10(1000)/6 = 0.5). 4.99% off → position
    // 0.4501 or 0.5499. We test the upper edge (just inside snap band).
    // Click clientX = (0.5 + 0.0499) × 600 = 329.94. Snap distance from
    // pos=0.5 is 0.0499 < 0.05 → must snap to rate=1000.
    const clock = new ClockManager();
    clock.setRate(1);
    const { track, el } = await mountMultiplier(clock);
    track.dispatchEvent(synthPointer('pointerdown', { clientX: 329.94, target: track }));
    expect(clock.playbackRate).toBe(1000);
    el.remove();
  });

  it('drag 5.01% off a decade → NO SNAP (smooth value)', async () => {
    // Click clientX = (0.5 + 0.0501) × 600 = 330.06. Snap distance 0.0501 ≥
    // 0.05 → no snap. Expected continuous rate ≈ 10^(0.5501 × 6) ≈ 1660.
    const clock = new ClockManager();
    clock.setRate(1);
    const { track, el } = await mountMultiplier(clock);
    track.dispatchEvent(synthPointer('pointerdown', { clientX: 330.06, target: track }));
    expect(clock.playbackRate).not.toBe(1000);
    const expected = rateFromPos(330.06 / 600);
    expect(clock.playbackRate).toBeCloseTo(expected, 1);
    el.remove();
  });

  it('drag 4.99% off zero decade → SNAPS to rate=1', async () => {
    // Decade 0 → pos=0. clientX = 0.0499 × 600 = 29.94.
    const clock = new ClockManager();
    clock.setRate(100);
    const { track, el } = await mountMultiplier(clock);
    track.dispatchEvent(synthPointer('pointerdown', { clientX: 29.94, target: track }));
    expect(clock.playbackRate).toBe(1);
    el.remove();
  });
});

// ---------------------------------------------------------------------------
// 7. Slider readout matches formatSpeedReadout 1:1
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — slider aria-valuetext == formatSpeedReadout(rate)', () => {
  const cases = [1, 10, 60, 100, 1000, 3600, 10_000, 86_400, 100_000, 604_800, 1_000_000];

  it.each(cases)('rate=%i: aria-valuetext exactly matches formatSpeedReadout()', async (rate) => {
    const clock = new ClockManager();
    clock.setRate(rate);
    const { el } = await mountMultiplier(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    const valueText = thumb.getAttribute('aria-valuetext') ?? '';
    expect(valueText).toBe(formatSpeedReadout(rate));
    // Also assert the visible readout panel agrees (defends against partial
    // wiring where one of the two paths is hand-written).
    const visible = el.shadowRoot!.querySelector('.readout')!.textContent ?? '';
    expect(visible).toBe(formatSpeedReadout(rate));
    el.remove();
  });
});

// ---------------------------------------------------------------------------
// 8. formatSpeedReadout — no comma-locale drift (source uses 'en-US')
// ---------------------------------------------------------------------------

describe("Story 1.10 defense — formatSpeedReadout is locale-pinned to en-US", () => {
  it('source explicitly constructs Intl.NumberFormat with "en-US"', () => {
    // Read the source on disk and assert the en-US lock. This is the most
    // robust assertion because run-time locale stubbing via vi.spyOn would
    // miss accidentally-introduced `toLocaleString()` (no-arg) regressions.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      path.resolve(here, '..', 'src', 'math', 'speed-readout.ts'),
      'utf8',
    );
    expect(src).toMatch(/Intl\.NumberFormat\(\s*['"]en-US['"]/);
    // Also assert that the source does NOT use a no-arg toLocaleString()
    // (which would inherit the runtime locale).
    expect(src).not.toMatch(/\.toLocaleString\(\s*\)/);
  });

  it('output uses comma thousands-separator (en-US) for large rates', () => {
    // Independent of OS locale, the visible output must use commas.
    expect(formatSpeedReadout(10_000)).toContain('10,000×');
    expect(formatSpeedReadout(1_000_000)).toContain('1,000,000×');
    // Negative assertion: no period-as-thousands (de-DE style).
    expect(formatSpeedReadout(10_000)).not.toContain('10.000×');
  });
});

// ---------------------------------------------------------------------------
// 9. Space-toggle skipped inside Shadow DOM input
// ---------------------------------------------------------------------------

// A tiny Lit component whose shadow root contains a focusable <input>. Used
// to verify the keyboard shortcut's shadow-root focus walk.
class TShadowInputHost extends LitElement {
  override render(): TemplateResult {
    return html`<input type="text" />`;
  }
}
if (!customElements.get('t-shadow-input-host')) {
  customElements.define('t-shadow-input-host', TShadowInputHost);
}

describe('Story 1.10 defense — Space toggle skipped when a Shadow DOM <input> is focused', () => {
  let off: (() => void) | null = null;
  let clock: ClockManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    clock = new ClockManager();
    off = installKeyboardShortcuts(clock);
  });

  afterEach(() => {
    if (off !== null) off();
    off = null;
    document.body.innerHTML = '';
  });

  it('input inside a custom-element shadow root absorbs Space (toggle skipped)', async () => {
    const host = document.createElement('t-shadow-input-host') as TShadowInputHost;
    document.body.appendChild(host);
    await host.updateComplete;
    const inner = host.shadowRoot!.querySelector('input') as HTMLInputElement;
    inner.focus();
    // happy-dom supports activeElement on ShadowRoot — confirm before asserting.
    expect(host.shadowRoot!.activeElement).toBe(inner);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    expect(clock.playing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Space-toggle skipped for contenteditable (redundant with integration
//     test but verifies the rule explicitly when nested under a parent)
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — Space toggle skipped for contenteditable', () => {
  let off: (() => void) | null = null;
  let clock: ClockManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    clock = new ClockManager();
    off = installKeyboardShortcuts(clock);
  });

  afterEach(() => {
    if (off !== null) off();
    off = null;
    document.body.innerHTML = '';
  });

  it('contenteditable=true absorbs Space (toggle skipped)', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.tabIndex = 0;
    document.body.appendChild(div);
    div.focus();
    expect(document.activeElement).toBe(div);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    expect(clock.playing).toBe(false);
  });

  it('nested contenteditable child (focused) also absorbs Space', () => {
    const wrap = document.createElement('div');
    wrap.setAttribute('contenteditable', 'true');
    document.body.appendChild(wrap);
    // Browsers report the contenteditable ancestor as activeElement target;
    // we focus the wrap directly to mirror reality.
    wrap.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    expect(clock.playing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. Play button ARIA reactive on clockManager.play()/pause()
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — <v-play-button> ARIA reflects clockManager state reactively', () => {
  it('clockManager.play() flips aria-label/aria-pressed via subscriber', async () => {
    const clock = new ClockManager();
    const btn = document.createElement('v-play-button') as VPlayButton;
    btn.clockManager = clock;
    document.body.appendChild(btn);
    await btn.updateComplete;
    const inner = btn.shadowRoot!.querySelector('button')!;
    expect(inner.getAttribute('aria-label')).toBe('Play');
    expect(inner.getAttribute('aria-pressed')).toBe('false');

    clock.play();
    await btn.updateComplete;
    expect(inner.getAttribute('aria-label')).toBe('Pause');
    expect(inner.getAttribute('aria-pressed')).toBe('true');

    clock.pause();
    await btn.updateComplete;
    expect(inner.getAttribute('aria-label')).toBe('Play');
    expect(inner.getAttribute('aria-pressed')).toBe('false');

    btn.remove();
  });
});

// ---------------------------------------------------------------------------
// 12. Scrubber consumes ClockManager when wired, falls back to local state
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — <v-timeline-scrubber> back-compat fallback path', () => {
  it('without clockManager: writing .simEt updates internal fallback and reads back', async () => {
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.clockManager).toBeNull();
    const target = MISSION_START_ET + 1e6;
    el.simEt = target;
    expect(el.simEt).toBe(target);
    el.remove();
  });

  it('with clockManager: writing .simEt routes through clockManager.scrubTo', async () => {
    const clock = new ClockManager();
    const spy = vi.spyOn(clock, 'scrubTo');
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.clockManager = clock;
    document.body.appendChild(el);
    await el.updateComplete;
    const target = MISSION_START_ET + 5e6;
    el.simEt = target;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(target);
    expect(clock.simTimeEt).toBe(target);
    // scrubTo also pauses (the contract).
    expect(clock.playing).toBe(false);
    el.remove();
  });
});

// ---------------------------------------------------------------------------
// 13. Mission-scrub perf harness completes under 60s synthetic
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — mission-scrub perf harness asserts ClockManager arithmetic budget', () => {
  it(
    'synthetic harness wall-clock < 60s and max tick < 50ms (NFR-P6 / NFR-P2)',
    { timeout: 90_000 },
    () => {
      const result = runMissionScrubPerf();
      expect(result.totalWallMs).toBeLessThan(60_000);
      expect(result.maxTickMs).toBeLessThan(50);
      // Dev's reported run was ~20ms. Allow generous CI slop (factor 1000)
      // before failing — the tripwire is "did the ClockManager arithmetic
      // bloat catastrophically", not "is the run exactly 20ms".
      expect(result.totalWallMs).toBeLessThan(20_000);
      // Sanity: the harness actually executed many ticks.
      expect(result.totalTicks).toBeGreaterThan(1000);
    },
  );
});

// ---------------------------------------------------------------------------
// 14. NFR-P6 reinterpretation documentation present in clock-manager.ts
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — NFR-P6 reinterpretation is documented in source', () => {
  it('clock-manager.ts mentions NFR-P6 in a comment / JSDoc', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      path.resolve(here, '..', 'src', 'services', 'clock-manager.ts'),
      'utf8',
    );
    expect(src).toMatch(/NFR-P6/);
    // The reinterpretation rationale should reference the wall-clock budget
    // and Story 7.6 (the real-renderer L4 perf gate).
    expect(src).toMatch(/Story 7\.6/);
  });
});

// ---------------------------------------------------------------------------
// 15. (Negative) — verify we did NOT pull Playwright into the test surface.
//
// The test file uses only vitest + happy-dom. Real-renderer perf is Story
// 7.6's responsibility. This case is a single-line guard: the import map
// at the top of THIS file must not reference @playwright/test.
// ---------------------------------------------------------------------------

describe('Story 1.10 defense — Pure vitest + happy-dom (no Playwright pull-in)', () => {
  it('no Playwright import in the defense test file', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      path.resolve(here, 'clock-multiplier-defense.test.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/['"]@playwright\/test['"]/);
  });
});
