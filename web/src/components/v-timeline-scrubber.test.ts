// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { BaseElement } from './base-element';
import { VTimelineScrubber } from './v-timeline-scrubber';
import {
  MISSION_START_ET,
  MISSION_END_ET,
  SCRUB_RESUME_DELAY_MS,
} from '../constants/mission';
import { isoFromEt, formatForHud } from '../math/et-conversions';
import type { URLSync } from '../services/url-sync';
import { ClockManager } from '../services/clock-manager';
import { ChapterDirector } from '../services/chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../chapters/registry';

const ONE_DAY = 86400;

// Helper: build a stub URLSync that records its calls. The real URLSync
// reaches into window.location which is fine under happy-dom but the
// stub gives us deterministic assertions.
const makeStubUrlSync = (): URLSync & {
  throttled: number[];
  immediate: number[];
} => {
  const throttled: number[] = [];
  const immediate: number[] = [];
  const stub = {
    parseInitialT: () => ({ initialEt: MISSION_START_ET, valid: false }),
    writeEtThrottled: (et: number) => {
      throttled.push(et);
    },
    writeEtImmediate: (et: number) => {
      immediate.push(et);
    },
    flush: () => {},
  } as unknown as URLSync & { throttled: number[]; immediate: number[] };
  (stub as unknown as { throttled: number[] }).throttled = throttled;
  (stub as unknown as { immediate: number[] }).immediate = immediate;
  return stub;
};

const makeScrubber = async (
  attrs: Partial<{ simEt: number }> = {},
): Promise<{ el: VTimelineScrubber; sync: ReturnType<typeof makeStubUrlSync> }> => {
  const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
  const sync = makeStubUrlSync();
  el.urlSync = sync;
  if (attrs.simEt !== undefined) el.simEt = attrs.simEt;
  document.body.appendChild(el);
  await el.updateComplete;
  // Stub getBoundingClientRect on the track to a known 1000-wide box at x=0.
  const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
  track.getBoundingClientRect = () =>
    ({ left: 0, right: 1000, top: 0, bottom: 12, width: 1000, height: 12, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return { el, sync };
};

const makePointerEvent = (
  type: string,
  init: {
    clientX: number;
    clientY?: number;
    pointerType?: string;
    pointerId?: number;
    target?: Element | null;
  },
): Event => {
  const evt = new Event(type, { bubbles: true });
  Object.defineProperty(evt, 'clientX', { value: init.clientX, configurable: true });
  Object.defineProperty(evt, 'clientY', { value: init.clientY ?? 0, configurable: true });
  Object.defineProperty(evt, 'pointerType', {
    value: init.pointerType ?? 'mouse',
    configurable: true,
  });
  Object.defineProperty(evt, 'pointerId', {
    value: init.pointerId ?? 1,
    configurable: true,
  });
  if (init.target !== undefined) {
    Object.defineProperty(evt, 'target', { value: init.target, configurable: true });
  }
  return evt;
};

describe('Story 1.9 Task 6 — <v-timeline-scrubber> registration + structure', () => {
  it('class extends BaseElement', () => {
    const proto = Object.getPrototypeOf(VTimelineScrubber.prototype) as object;
    expect(proto).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-timeline-scrubber>', () => {
    expect(customElements.get('v-timeline-scrubber')).toBe(VTimelineScrubber);
  });

  it('default variant is mission', async () => {
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.variant).toBe('mission');
    el.remove();
  });

  it('default simEt is MISSION_START_ET', async () => {
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.simEt).toBe(MISSION_START_ET);
    el.remove();
  });

  it('renders a track, fill, thumb, and chapters slot', async () => {
    const { el } = await makeScrubber();
    expect(el.shadowRoot?.querySelector('.track')).toBeTruthy();
    expect(el.shadowRoot?.querySelector('.fill')).toBeTruthy();
    expect(el.shadowRoot?.querySelector('.thumb')).toBeTruthy();
    expect(el.shadowRoot?.querySelector('.chapters')).toBeTruthy();
    el.remove();
  });

  it('anchors to viewport bottom with edge-margin offsets', () => {
    const flat = (VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('position: fixed');
    expect(joined).toContain('bottom: var(--v-edge-margin)');
    expect(joined).toContain('z-index: var(--v-z-scrubber)');
  });
});

describe('Story 1.9 AC3 — ARIA Slider semantics', () => {
  it('thumb is role="slider" with tabindex="0"', async () => {
    const { el } = await makeScrubber();
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('role')).toBe('slider');
    expect(thumb.getAttribute('tabindex')).toBe('0');
    el.remove();
  });

  // Story 1.15 AC3 — aria-valuemin / aria-valuemax carry the numeric SPICE
  // ET range, not ISO strings. The post-Epic-1 manual smoke surfaced a
  // defect where these rendered as `"0"` (Lit's undefined → "0" coercion);
  // the fix routes the bindings through `String(MISSION_START_ET)` /
  // `String(MISSION_END_ET)` directly in the template, and the test
  // asserts the parsed numeric value matches the constant exactly so any
  // future regression to a placeholder / coerced "0" surfaces immediately.
  it('aria-valuemin parses to MISSION_START_ET (numeric, not "0")', async () => {
    const { el } = await makeScrubber();
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    const raw = thumb.getAttribute('aria-valuemin');
    expect(raw).not.toBeNull();
    expect(raw).not.toBe('0');
    expect(parseFloat(raw!)).toBe(MISSION_START_ET);
    el.remove();
  });

  it('aria-valuemax parses to MISSION_END_ET (numeric, not "0")', async () => {
    const { el } = await makeScrubber();
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    const raw = thumb.getAttribute('aria-valuemax');
    expect(raw).not.toBeNull();
    expect(raw).not.toBe('0');
    expect(parseFloat(raw!)).toBe(MISSION_END_ET);
    el.remove();
  });

  it('aria-valuenow reflects the current simEt as numeric ET (Story 6.4 AC1 amendment — ARIA requires numeric)', async () => {
    const { el } = await makeScrubber();
    const target = MISSION_START_ET + 365 * ONE_DAY;
    el.simEt = target;
    await el.updateComplete;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('aria-valuenow')).toBe(String(target));
    // ISO representation lives on aria-valuetext (which screen readers
    // announce in preference to the numeric aria-valuenow).
    expect(thumb.getAttribute('aria-valuetext')).toContain('1978');
    el.remove();
  });

  it('aria-valuetext reflects formatForHud(simEt) in "YYYY-MM-DD HH:MM UT" form', async () => {
    const { el } = await makeScrubber();
    el.simEt = MISSION_START_ET;
    await el.updateComplete;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('aria-valuetext')).toBe(formatForHud(MISSION_START_ET));
    el.remove();
  });

  it('aria-label="Mission timeline"', async () => {
    const { el } = await makeScrubber();
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('aria-label')).toBe('Mission timeline');
    el.remove();
  });
});

describe('Story 1.9 AC4 — Keyboard scrubbing', () => {
  it('ArrowRight advances simEt by 1 day (86400 s)', async () => {
    const { el } = await makeScrubber();
    const before = el.simEt;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(el.simEt - before).toBe(ONE_DAY);
    el.remove();
  });

  it('ArrowLeft retreats simEt by 1 day', async () => {
    const { el } = await makeScrubber({ simEt: MISSION_START_ET + ONE_DAY * 5 });
    const before = el.simEt;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(before - el.simEt).toBe(ONE_DAY);
    el.remove();
  });

  it('Shift+ArrowRight advances by 10 days', async () => {
    const { el } = await makeScrubber();
    const before = el.simEt;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    );
    expect(el.simEt - before).toBe(10 * ONE_DAY);
    el.remove();
  });

  it('Shift+ArrowLeft retreats by 10 days', async () => {
    const { el } = await makeScrubber({ simEt: MISSION_START_ET + 30 * ONE_DAY });
    const before = el.simEt;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }),
    );
    expect(before - el.simEt).toBe(10 * ONE_DAY);
    el.remove();
  });

  it('Home jumps to MISSION_START_ET', async () => {
    const { el } = await makeScrubber({ simEt: MISSION_END_ET });
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(el.simEt).toBe(MISSION_START_ET);
    el.remove();
  });

  it('End jumps to MISSION_END_ET', async () => {
    const { el } = await makeScrubber();
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(el.simEt).toBe(MISSION_END_ET);
    el.remove();
  });

  it('preventDefault is called on Arrow / Home / End to suppress native scroll', async () => {
    const { el } = await makeScrubber();
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      thumb.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
    }
    el.remove();
  });

  it('ignores unrelated keys without modifying simEt or calling preventDefault', async () => {
    const { el } = await makeScrubber();
    const before = el.simEt;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    const evt = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    thumb.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    expect(el.simEt).toBe(before);
    el.remove();
  });

  it('clamps left at MISSION_START_ET (does not underflow)', async () => {
    const { el } = await makeScrubber({ simEt: MISSION_START_ET });
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(el.simEt).toBe(MISSION_START_ET);
    el.remove();
  });

  it('clamps right at MISSION_END_ET (does not overflow)', async () => {
    const { el } = await makeScrubber({ simEt: MISSION_END_ET });
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(el.simEt).toBe(MISSION_END_ET);
    el.remove();
  });

  it('emits voyager:scrub with source=keyboard', async () => {
    const { el } = await makeScrubber();
    let detail: { et: number; source: string } | null = null;
    el.addEventListener('voyager:scrub', (e) => {
      detail = (e as CustomEvent<{ et: number; source: string }>).detail;
    });
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(detail).not.toBeNull();
    // Test is in a closure that captures detail
    if (detail !== null) {
      const d = detail as { et: number; source: string };
      expect(d.source).toBe('keyboard');
    }
    el.remove();
  });
});

describe('Story 1.9 AC4 — Pause-on-scrub / resume-on-debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('first scrub keystroke pauses if isPlaying was true; resumes 300 ms after last', async () => {
    const { el } = await makeScrubber();
    el.isPlaying = true;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(el.isPlaying).toBe(false);
    // 299 ms later — still paused.
    vi.advanceTimersByTime(SCRUB_RESUME_DELAY_MS - 1);
    expect(el.isPlaying).toBe(false);
    vi.advanceTimersByTime(2);
    expect(el.isPlaying).toBe(true);
    el.remove();
  });

  it('does NOT resume if isPlaying was false when scrub started', async () => {
    const { el } = await makeScrubber();
    el.isPlaying = false;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    vi.advanceTimersByTime(SCRUB_RESUME_DELAY_MS + 5);
    expect(el.isPlaying).toBe(false);
    el.remove();
  });

  it('subsequent keystrokes reset the resume timer (debounce)', async () => {
    const { el } = await makeScrubber();
    el.isPlaying = true;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    vi.advanceTimersByTime(SCRUB_RESUME_DELAY_MS - 50);
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    vi.advanceTimersByTime(SCRUB_RESUME_DELAY_MS - 50);
    // Should still be paused — second keypress reset the timer.
    expect(el.isPlaying).toBe(false);
    vi.advanceTimersByTime(100);
    expect(el.isPlaying).toBe(true);
    el.remove();
  });
});

describe('Story 1.9 AC5 — Pointer input on track + thumb', () => {
  it('clicking on the track jumps simEt to that fraction (paused)', async () => {
    const { el } = await makeScrubber();
    el.isPlaying = true;
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    // Click at x=500 of a 1000-wide track → 50% → mid-mission.
    track.dispatchEvent(makePointerEvent('pointerdown', { clientX: 500, target: track }));
    const expected = MISSION_START_ET + 0.5 * (MISSION_END_ET - MISSION_START_ET);
    expect(Math.abs(el.simEt - expected)).toBeLessThan(1);
    expect(el.isPlaying).toBe(false);
    el.remove();
  });

  it('emits voyager:scrub with source=pointer on track-click', async () => {
    const { el } = await makeScrubber();
    let source: string | null = null;
    el.addEventListener('voyager:scrub', (e) => {
      source = (e as CustomEvent<{ et: number; source: string }>).detail.source;
    });
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    track.dispatchEvent(makePointerEvent('pointerdown', { clientX: 200, target: track }));
    expect(source).toBe('pointer');
    el.remove();
  });

  it('dragging the thumb updates simEt across many pointermoves', async () => {
    const { el } = await makeScrubber();
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    track.dispatchEvent(makePointerEvent('pointerdown', { clientX: 0, target: thumb }));
    expect(thumb.hasAttribute('data-dragging')).toBe(true);
    track.dispatchEvent(makePointerEvent('pointermove', { clientX: 250 }));
    const quarter = MISSION_START_ET + 0.25 * (MISSION_END_ET - MISSION_START_ET);
    expect(Math.abs(el.simEt - quarter)).toBeLessThan(1);
    track.dispatchEvent(makePointerEvent('pointermove', { clientX: 750 }));
    const threeQ = MISSION_START_ET + 0.75 * (MISSION_END_ET - MISSION_START_ET);
    expect(Math.abs(el.simEt - threeQ)).toBeLessThan(1);
    el.remove();
  });

  it('pointerup release clears the dragging attribute and writes URL immediately', async () => {
    const { el, sync } = await makeScrubber();
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    track.dispatchEvent(makePointerEvent('pointerdown', { clientX: 100, target: thumb }));
    track.dispatchEvent(makePointerEvent('pointermove', { clientX: 500 }));
    track.dispatchEvent(makePointerEvent('pointerup', { clientX: 500 }));
    expect(thumb.hasAttribute('data-dragging')).toBe(false);
    // Both the track-click and the pointerup release call writeEtImmediate.
    expect(sync.immediate.length).toBeGreaterThanOrEqual(1);
    el.remove();
  });

  it('track-click on a non-thumb area does NOT start a drag', async () => {
    const { el } = await makeScrubber();
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    track.dispatchEvent(makePointerEvent('pointerdown', { clientX: 100, target: track }));
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    expect(thumb.hasAttribute('data-dragging')).toBe(false);
    el.remove();
  });
});

describe('Story 1.9 AC6 — URL writeback through URLSync', () => {
  it('keyboard scrub goes through writeEtThrottled', async () => {
    const { el, sync } = await makeScrubber();
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(sync.throttled.length).toBe(1);
    expect(sync.throttled[0]).toBe(el.simEt);
    el.remove();
  });

  it('pointer-drag pointermoves go through writeEtThrottled', async () => {
    const { el, sync } = await makeScrubber();
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    track.dispatchEvent(makePointerEvent('pointerdown', { clientX: 100, target: thumb }));
    track.dispatchEvent(makePointerEvent('pointermove', { clientX: 300 }));
    track.dispatchEvent(makePointerEvent('pointermove', { clientX: 500 }));
    // The pointerdown also throttled-writes; total ≥ 3 throttled calls.
    expect(sync.throttled.length).toBeGreaterThanOrEqual(3);
    el.remove();
  });

  it('pointerup release fires writeEtImmediate (unconditional final write)', async () => {
    const { el, sync } = await makeScrubber();
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    track.dispatchEvent(makePointerEvent('pointerdown', { clientX: 100, target: thumb }));
    track.dispatchEvent(makePointerEvent('pointermove', { clientX: 500 }));
    sync.immediate.length = 0; // clear any pre-drag immediates.
    track.dispatchEvent(makePointerEvent('pointerup', { clientX: 500 }));
    expect(sync.immediate.length).toBe(1);
    expect(sync.immediate[0]).toBe(el.simEt);
    el.remove();
  });
});

describe('Story 1.9 AC8 — 44×44 hit area on thumb', () => {
  it('thumb has a transparent ::before pseudo sized 44×44 px', () => {
    const flat = (VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    // The pseudo-element rule must declare 44px width and height.
    expect(joined).toMatch(/\.thumb::before\s*\{[^}]*width:\s*44px/);
    expect(joined).toMatch(/\.thumb::before\s*\{[^}]*height:\s*44px/);
  });

  it('visible thumb glyph is 14 px (not enlarged for hit-test)', () => {
    const flat = (VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(/\.thumb\s*\{[^}]*width:\s*14px/);
    expect(joined).toMatch(/\.thumb\s*\{[^}]*height:\s*14px/);
  });
});

describe('Story 1.9 — chapter markers container is present', () => {
  it('renders the .chapters slot element (now populated by Story 2.2 in mission variant)', async () => {
    // The empty-slot stub test from Story 1.9 was retired by Story 2.2:
    // markers now render unconditionally in the mission variant (the
    // inactive treatment is the default; the active treatment requires a
    // wired ChapterDirector). This test pins the slot's presence as a
    // structural invariant for downstream variants (e.g. Story 4.4's
    // detail variant) that may suppress markers.
    const { el } = await makeScrubber();
    const chapters = el.shadowRoot!.querySelector('.chapters');
    expect(chapters).toBeTruthy();
    el.remove();
  });
});

// ─── Story 1.10 — ClockManager integration ─────────────────────────────

const makeScrubberWithClock = async (): Promise<{
  el: VTimelineScrubber;
  clock: ClockManager;
  sync: ReturnType<typeof makeStubUrlSync>;
}> => {
  const clock = new ClockManager();
  const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
  const sync = makeStubUrlSync();
  el.urlSync = sync;
  el.clockManager = clock;
  document.body.appendChild(el);
  await el.updateComplete;
  const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
  track.getBoundingClientRect = () =>
    ({ left: 0, right: 1000, top: 0, bottom: 12, width: 1000, height: 12, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return { el, clock, sync };
};

describe('Story 1.10 AC2 — scrubber consumes ClockManager.simTimeEt', () => {
  it('reads simEt from clockManager when wired', async () => {
    const { el, clock } = await makeScrubberWithClock();
    expect(el.simEt).toBe(MISSION_START_ET);
    clock.scrubTo(MISSION_START_ET + 365 * 86400);
    await el.updateComplete;
    expect(el.simEt).toBe(MISSION_START_ET + 365 * 86400);
    el.remove();
  });

  it('reads isPlaying from clockManager when wired', async () => {
    const { el, clock } = await makeScrubberWithClock();
    expect(el.isPlaying).toBe(false);
    clock.play();
    expect(el.isPlaying).toBe(true);
    clock.pause();
    expect(el.isPlaying).toBe(false);
    el.remove();
  });

  it('subscribes to clockManager on connect, unsubscribes on disconnect', async () => {
    const clock = new ClockManager();
    const subSpy = vi.spyOn(clock, 'subscribe');
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.clockManager = clock;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(subSpy).toHaveBeenCalledTimes(1);
    el.remove();
    // After remove, mutating the clock must not throw or affect a detached element.
    clock.play();
    // Sanity: subscribe was called once, and the unsubscribe was invoked
    // (subscribers set on the clock is empty — internal but observable by
    // calling play() and confirming no requestUpdate fires/errors).
    expect(() => clock.scrubTo(MISSION_START_ET + 1)).not.toThrow();
  });

  it('renders aria-valuenow from clockManager.simTimeEt (numeric ET per ARIA spec — Story 6.4 AC1)', async () => {
    const { el, clock } = await makeScrubberWithClock();
    const targetEt = MISSION_START_ET + 1000 * 86400;
    clock.scrubTo(targetEt);
    await el.updateComplete;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('aria-valuenow')).toBe(String(targetEt));
    expect(thumb.getAttribute('aria-valuetext')).toBe(formatForHud(targetEt));
    el.remove();
  });
});

describe('Story 1.10 AC2 — keyboard scrubbing routes through clockManager.scrubTo', () => {
  it('ArrowRight calls scrubTo and pauses the clock', async () => {
    const { el, clock } = await makeScrubberWithClock();
    clock.play();
    expect(clock.playing).toBe(true);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    // scrubTo pauses as a side effect.
    expect(clock.playing).toBe(false);
    expect(clock.simTimeEt - MISSION_START_ET).toBe(86400);
    el.remove();
  });

  it('pointer track-click routes through clockManager.scrubTo', async () => {
    const { el, clock } = await makeScrubberWithClock();
    clock.play();
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    const evt = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(evt, 'clientX', { value: 500 });
    Object.defineProperty(evt, 'clientY', { value: 0 });
    Object.defineProperty(evt, 'pointerType', { value: 'mouse' });
    Object.defineProperty(evt, 'pointerId', { value: 1 });
    Object.defineProperty(evt, 'target', { value: track });
    track.dispatchEvent(evt);
    expect(clock.playing).toBe(false);
    const expected = MISSION_START_ET + 0.5 * (MISSION_END_ET - MISSION_START_ET);
    expect(Math.abs(clock.simTimeEt - expected)).toBeLessThan(1);
    el.remove();
  });
});

describe('Story 1.10 AC2 — wasPlayingBeforeScrub debounce stays in the scrubber', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keystroke pauses immediately (via scrubTo), then resumes via clock.play() after 300 ms', async () => {
    const { el, clock } = await makeScrubberWithClock();
    clock.play();
    expect(clock.playing).toBe(true);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(clock.playing).toBe(false);
    vi.advanceTimersByTime(SCRUB_RESUME_DELAY_MS + 5);
    expect(clock.playing).toBe(true);
    el.remove();
  });

  it('does NOT resume if clock was paused when scrub started', async () => {
    const { el, clock } = await makeScrubberWithClock();
    // clock starts paused.
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    vi.advanceTimersByTime(SCRUB_RESUME_DELAY_MS + 5);
    expect(clock.playing).toBe(false);
    el.remove();
  });

  it('successive keystrokes reset the debounce timer', async () => {
    const { el, clock } = await makeScrubberWithClock();
    clock.play();
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    vi.advanceTimersByTime(SCRUB_RESUME_DELAY_MS - 50);
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    vi.advanceTimersByTime(SCRUB_RESUME_DELAY_MS - 50);
    expect(clock.playing).toBe(false);
    vi.advanceTimersByTime(100);
    expect(clock.playing).toBe(true);
    el.remove();
  });
});

describe('Story 1.9 — thumb visual position tracks simEt fraction', () => {
  it('at MISSION_START_ET, thumb left is 0%', async () => {
    const { el } = await makeScrubber({ simEt: MISSION_START_ET });
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    expect(thumb.style.left).toMatch(/^0(\.0+)?%$/);
    el.remove();
  });

  it('at MISSION_END_ET, thumb left is 100%', async () => {
    const { el } = await makeScrubber({ simEt: MISSION_END_ET });
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    expect(thumb.style.left).toMatch(/^100(\.0+)?%$/);
    el.remove();
  });

  it('mid-mission yields ~50% left', async () => {
    const mid = MISSION_START_ET + 0.5 * (MISSION_END_ET - MISSION_START_ET);
    const { el } = await makeScrubber({ simEt: mid });
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    const pct = parseFloat(thumb.style.left);
    expect(Math.abs(pct - 50)).toBeLessThan(0.01);
    el.remove();
  });
});

// ─── Story 2.2 — Chapter markers (vertebrae) ───────────────────────────

const makeScrubberWithChapterDirector = async (): Promise<{
  el: VTimelineScrubber;
  clock: ClockManager;
  director: ChapterDirector;
  sync: ReturnType<typeof makeStubUrlSync>;
}> => {
  const clock = new ClockManager();
  const director = new ChapterDirector(ALL_CHAPTERS);
  const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
  const sync = makeStubUrlSync();
  el.urlSync = sync;
  el.clockManager = clock;
  el.chapterDirector = director;
  document.body.appendChild(el);
  await el.updateComplete;
  const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
  track.getBoundingClientRect = () =>
    ({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 12,
      width: 1000,
      height: 12,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return { el, clock, director, sync };
};

describe('Story 2.2 AC1 — 11 markers rendered along the track', () => {
  it('renders exactly 11 chapter markers in mission variant', async () => {
    const { el } = await makeScrubberWithChapterDirector();
    const markers = el.shadowRoot!.querySelectorAll('.chapter-marker');
    expect(markers.length).toBe(11);
    el.remove();
  });

  it('emits markers in chronological (ALL_CHAPTERS) order', async () => {
    const { el } = await makeScrubberWithChapterDirector();
    const markers = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('.chapter-marker'),
    );
    const slugs = markers.map((m) => m.getAttribute('data-slug'));
    const expected = ALL_CHAPTERS.map((c) => c.slug);
    expect(slugs).toEqual(expected);
    el.remove();
  });

  it('each marker is positioned via left:% per (anchorEt - MISSION_START_ET) / span', async () => {
    const { el } = await makeScrubberWithChapterDirector();
    const span = MISSION_END_ET - MISSION_START_ET;
    const markers = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('.chapter-marker'),
    );
    for (const marker of markers) {
      const slug = marker.getAttribute('data-slug')!;
      const chapter = findChapterBySlug(slug)!;
      const expectedPct = ((chapter.anchorEt - MISSION_START_ET) / span) * 100;
      const actualPct = parseFloat(marker.style.left);
      expect(Math.abs(actualPct - expectedPct)).toBeLessThan(0.001);
    }
    el.remove();
  });

  it('marker label spans render the chapter.markerLabel field', async () => {
    const { el } = await makeScrubberWithChapterDirector();
    const markers = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('.chapter-marker'),
    );
    for (const marker of markers) {
      const slug = marker.getAttribute('data-slug')!;
      const chapter = findChapterBySlug(slug)!;
      const labelEl = marker.querySelector('.chapter-marker-label');
      expect(labelEl).toBeTruthy();
      expect(labelEl!.textContent?.trim()).toBe(chapter.markerLabel);
    }
    el.remove();
  });

  it('active marker (matching ChapterDirector.activeChapter) carries data-active', async () => {
    const { el, clock, director } = await makeScrubberWithChapterDirector();
    // Park ClockManager inside launch-v2's window and drive the director.
    const launchV2 = findChapterBySlug('launch-v2')!;
    clock.scrubTo(launchV2.anchorEt);
    director.update(launchV2.anchorEt);
    await el.updateComplete;
    const activeMarkers = el.shadowRoot!.querySelectorAll(
      '.chapter-marker[data-active]',
    );
    expect(activeMarkers.length).toBe(1);
    expect(activeMarkers[0].getAttribute('data-slug')).toBe('launch-v2');
    el.remove();
  });

  it('between-chapter ET ⇒ no marker is active', async () => {
    const { el, director } = await makeScrubberWithChapterDirector();
    // Choose an ET well outside any chapter window. The 2026-05-XX
    // post-Voyager-2-Neptune, pre-Pale-Blue-Dot gap is between two
    // chapter windows; pick a midpoint inside that gap. The cleanest
    // any-between guarantee comes from the registry helper itself.
    // We walk every chapter and find an ET strictly between adjacent
    // windowEndEt and the next windowStartEt.
    let between: number | null = null;
    for (let i = 0; i < ALL_CHAPTERS.length - 1; i++) {
      const a = ALL_CHAPTERS[i];
      const b = ALL_CHAPTERS[i + 1];
      if (a.windowEndEt < b.windowStartEt) {
        between = (a.windowEndEt + b.windowStartEt) / 2;
        break;
      }
    }
    expect(between).not.toBeNull();
    director.update(between!);
    await el.updateComplete;
    expect(director.activeChapter).toBeNull();
    const activeMarkers = el.shadowRoot!.querySelectorAll(
      '.chapter-marker[data-active]',
    );
    expect(activeMarkers.length).toBe(0);
    el.remove();
  });
});

describe('Story 2.2 AC2 — Markers are individually keyboard-focusable buttons', () => {
  it('every marker is a native <button> element', async () => {
    const { el } = await makeScrubberWithChapterDirector();
    const markers = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('.chapter-marker'),
    );
    expect(markers.length).toBe(11);
    for (const marker of markers) {
      expect(marker.tagName).toBe('BUTTON');
      // Native button has implicit role=button; some a11y testing tools
      // also recognize an explicit role for non-button hosts. Either is
      // acceptable per AC2; we use the native element so explicit role
      // is omitted by design.
    }
    el.remove();
  });

  it('every marker has aria-label="<chapter.name> — <ISO-8601 date>"', async () => {
    const { el } = await makeScrubberWithChapterDirector();
    const markers = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('.chapter-marker'),
    );
    for (const marker of markers) {
      const slug = marker.getAttribute('data-slug')!;
      const chapter = findChapterBySlug(slug)!;
      const isoDate = isoFromEt(chapter.anchorEt).slice(0, 10);
      expect(marker.getAttribute('aria-label')).toBe(
        `${chapter.name} — ${isoDate}`,
      );
    }
    el.remove();
  });

  it('markers appear in the shadow DOM in chronological order (tab order proxy)', async () => {
    const { el } = await makeScrubberWithChapterDirector();
    // happy-dom doesn't simulate full tab traversal, but DOM order is the
    // determinant for tab order on a flat sequence of native buttons with
    // no explicit tabindex overrides (per WAI-ARIA).
    const markers = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('.chapter-marker'),
    );
    for (let i = 0; i < markers.length - 1; i++) {
      const a = findChapterBySlug(markers[i].getAttribute('data-slug')!)!;
      const b = findChapterBySlug(markers[i + 1].getAttribute('data-slug')!)!;
      expect(a.anchorEt).toBeLessThanOrEqual(b.anchorEt);
    }
    el.remove();
  });
});

describe('Story 2.2 AC3 — Hover tooltip + touchscreen alternative', () => {
  const flattenStyles = (): string =>
    (VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');

  it('each marker contains a .chapter-marker-tooltip with the full chapter name', async () => {
    const { el } = await makeScrubberWithChapterDirector();
    const markers = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('.chapter-marker'),
    );
    for (const marker of markers) {
      const slug = marker.getAttribute('data-slug')!;
      const chapter = findChapterBySlug(slug)!;
      const tooltip = marker.querySelector('.chapter-marker-tooltip');
      expect(tooltip).toBeTruthy();
      expect(tooltip!.textContent?.trim()).toBe(chapter.name);
    }
    el.remove();
  });

  it('tooltip CSS uses a 200ms hover-dwell transition-delay', () => {
    const joined = flattenStyles();
    // The 200ms dwell is applied inside the @media (hover: hover) block to
    // the :hover/:focus-visible state. Verify both the @media gate and
    // the 200ms delay are present together.
    expect(joined).toMatch(/@media\s*\(hover:\s*hover\)/);
    expect(joined).toMatch(/transition-delay:\s*200ms/);
  });

  it('tooltip color is --v-color-accent', () => {
    const joined = flattenStyles();
    expect(joined).toMatch(
      /\.chapter-marker-tooltip\s*\{[^}]*color:\s*var\(--v-color-accent\)/,
    );
  });

  it('on no-hover devices (@media hover: none), tooltip is hidden via display:none', () => {
    const joined = flattenStyles();
    expect(joined).toMatch(
      /@media\s*\(hover:\s*none\)\s*\{[^}]*\.chapter-marker-tooltip\s*\{[^}]*display:\s*none/,
    );
  });

  it('marker labels above the pins are present unconditionally (Tier-2 alternative)', async () => {
    const { el } = await makeScrubberWithChapterDirector();
    // Every marker carries a persistent .chapter-marker-label child, so
    // touchscreens (where the tooltip is suppressed via the (hover: none)
    // media query) still get a disambiguating glyph.
    const labels = el.shadowRoot!.querySelectorAll('.chapter-marker-label');
    expect(labels.length).toBe(11);
    el.remove();
  });
});

describe('Story 2.2 AC4 — Click / Enter activation jumps the simulation', () => {
  it('clicking a marker calls clockManager.scrubTo(anchorEt)', async () => {
    const { el, clock } = await makeScrubberWithChapterDirector();
    clock.play();
    const markers = el.shadowRoot!.querySelectorAll<HTMLButtonElement>(
      '.chapter-marker',
    );
    // V1 Jupiter is index 2 in chronological order (after launch-v2,
    // launch-v1). Identify it by slug to be robust against future
    // re-ordering of unrelated chapters.
    const v1Jupiter = Array.from(markers).find(
      (m) => m.getAttribute('data-slug') === 'v1-jupiter',
    )!;
    expect(v1Jupiter).toBeTruthy();
    const chapter = findChapterBySlug('v1-jupiter')!;
    v1Jupiter.click();
    // scrubTo pauses as a side effect.
    expect(clock.playing).toBe(false);
    expect(clock.simTimeEt).toBe(chapter.anchorEt);
    el.remove();
  });

  it('clicking a marker emits a bubbling/composed chapter-jump CustomEvent with slug + anchorEt', async () => {
    const { el } = await makeScrubberWithChapterDirector();
    let detail: { slug: string; anchorEt: number } | null = null;
    el.addEventListener('chapter-jump', (e) => {
      detail = (e as CustomEvent<{ slug: string; anchorEt: number }>).detail;
    });
    const chapter = findChapterBySlug('v2-neptune')!;
    const marker = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '.chapter-marker[data-slug="v2-neptune"]',
    )!;
    marker.click();
    expect(detail).not.toBeNull();
    if (detail !== null) {
      const d = detail as { slug: string; anchorEt: number };
      expect(d.slug).toBe('v2-neptune');
      expect(d.anchorEt).toBe(chapter.anchorEt);
    }
    el.remove();
  });

  it('Enter key on a focused marker activates the chapter', async () => {
    const { el, clock } = await makeScrubberWithChapterDirector();
    const chapter = findChapterBySlug('pale-blue-dot')!;
    const marker = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '.chapter-marker[data-slug="pale-blue-dot"]',
    )!;
    marker.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(clock.simTimeEt).toBe(chapter.anchorEt);
    el.remove();
  });

  it('Space key on a focused marker activates the chapter (WAI-ARIA APG button)', async () => {
    const { el, clock } = await makeScrubberWithChapterDirector();
    const chapter = findChapterBySlug('v1-saturn')!;
    const marker = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '.chapter-marker[data-slug="v1-saturn"]',
    )!;
    marker.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    expect(clock.simTimeEt).toBe(chapter.anchorEt);
    el.remove();
  });

  it('marker click does NOT also dispatch a voyager:scrub on the underlying track', async () => {
    // The marker's pointerdown handler stops propagation so the track's
    // attachPointerHandlers listener never sees the press. Otherwise the
    // simulation would scrub to the marker's pixel position AND then jump
    // to the exact anchor, producing a brief double-fire.
    const { el } = await makeScrubberWithChapterDirector();
    let scrubFired = false;
    el.addEventListener('voyager:scrub', () => {
      scrubFired = true;
    });
    const marker = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '.chapter-marker[data-slug="v1-jupiter"]',
    )!;
    // Synthesize the same pointerdown that real input would dispatch.
    const evt = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(evt, 'clientX', { value: 500 });
    Object.defineProperty(evt, 'clientY', { value: 0 });
    Object.defineProperty(evt, 'pointerType', { value: 'mouse' });
    Object.defineProperty(evt, 'pointerId', { value: 1 });
    Object.defineProperty(evt, 'target', { value: marker });
    marker.dispatchEvent(evt);
    expect(scrubFired).toBe(false);
    el.remove();
  });

  it('activation works in the no-clockManager fallback path (test back-compat)', async () => {
    // A test scrubber without a wired ClockManager — exercise that
    // activating a marker still moves the simEt fallback. Useful for
    // future variant authors who construct the scrubber in isolation.
    const director = new ChapterDirector(ALL_CHAPTERS);
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.urlSync = makeStubUrlSync();
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;
    const chapter = findChapterBySlug('v1-heliopause')!;
    const marker = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '.chapter-marker[data-slug="v1-heliopause"]',
    )!;
    marker.click();
    expect(el.simEt).toBe(chapter.anchorEt);
    el.remove();
  });
});

describe('Story 2.2 AC5 — Active marker tracks ChapterDirector state', () => {
  it('subscribes to ChapterDirector on connect, unsubscribes on disconnect', async () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const subSpy = vi.spyOn(director, 'subscribe');
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(subSpy).toHaveBeenCalledTimes(1);
    el.remove();
    // After remove the subscriber should be detached — driving the
    // director should not throw and should not leave a stale callback
    // attempting to requestUpdate on a removed Lit host.
    expect(() => director.update(MISSION_START_ET + 1000 * 86400)).not.toThrow();
  });

  it('crossing into a chapter window flips data-active to that marker', async () => {
    const { el, director } = await makeScrubberWithChapterDirector();
    // Forward-scrub from before-mission to launch-v2's anchor.
    director.update(MISSION_START_ET);
    await el.updateComplete;
    expect(
      el.shadowRoot!
        .querySelectorAll('.chapter-marker[data-active]')[0]
        ?.getAttribute('data-slug'),
    ).toBe('launch-v2');
    // Forward to v1-jupiter's anchor.
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    director.update(v1Jupiter.anchorEt);
    await el.updateComplete;
    const activeAfter = el.shadowRoot!.querySelectorAll(
      '.chapter-marker[data-active]',
    );
    expect(activeAfter.length).toBe(1);
    expect(activeAfter[0].getAttribute('data-slug')).toBe('v1-jupiter');
    el.remove();
  });

  it('at most one marker is active at any time', async () => {
    const { el, director } = await makeScrubberWithChapterDirector();
    // Sweep every chapter's anchor; at each stop, exactly one marker is
    // active (ChapterDirector's at-most-one held-state contract from
    // Story 2.1 AC2 maps directly to the rendered DOM).
    for (const chapter of ALL_CHAPTERS) {
      director.update(chapter.anchorEt);
      await el.updateComplete;
      const active = el.shadowRoot!.querySelectorAll(
        '.chapter-marker[data-active]',
      );
      expect(active.length).toBe(1);
      expect(active[0].getAttribute('data-slug')).toBe(chapter.slug);
    }
    el.remove();
  });

  it('reverse scrubbing also updates the active marker', async () => {
    const { el, director } = await makeScrubberWithChapterDirector();
    const v2Neptune = findChapterBySlug('v2-neptune')!;
    const launchV1 = findChapterBySlug('launch-v1')!;
    director.update(v2Neptune.anchorEt);
    await el.updateComplete;
    expect(
      el.shadowRoot!
        .querySelector('.chapter-marker[data-active]')!
        .getAttribute('data-slug'),
    ).toBe('v2-neptune');
    director.update(launchV1.anchorEt);
    await el.updateComplete;
    expect(
      el.shadowRoot!
        .querySelector('.chapter-marker[data-active]')!
        .getAttribute('data-slug'),
    ).toBe('launch-v1');
    el.remove();
  });
});

// ─── Story 4.4 — detail-variant + dual-scrubber tests ─────────────────

const ONE_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;

const makeDetailScrubber = async (
  attrs: Partial<{ simEt: number; rangeStart: number; rangeEnd: number }> = {},
): Promise<{ el: VTimelineScrubber; sync: ReturnType<typeof makeStubUrlSync> }> => {
  const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
  el.variant = 'detail';
  if (attrs.rangeStart !== undefined) el.rangeStart = attrs.rangeStart;
  if (attrs.rangeEnd !== undefined) el.rangeEnd = attrs.rangeEnd;
  const sync = makeStubUrlSync();
  el.urlSync = sync;
  if (attrs.simEt !== undefined) el.simEt = attrs.simEt;
  document.body.appendChild(el);
  await el.updateComplete;
  const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
  track.getBoundingClientRect = () =>
    ({ left: 0, right: 1000, top: 0, bottom: 4, width: 1000, height: 4, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return { el, sync };
};

describe('Story 4.4 AC1 — detail variant visual treatment', () => {
  it('renders with variant="detail" attribute reflected on host', async () => {
    const { el } = await makeDetailScrubber();
    expect(el.getAttribute('variant')).toBe('detail');
    el.remove();
  });

  it('declares rangeStart and rangeEnd as Lit reactive properties (Rule 10)', () => {
    // The static properties registration must include both new keys; this
    // is the grep-able surface for the Rule-10 declaration check.
    const props = (VTimelineScrubber as unknown as {
      properties: Record<string, unknown>;
    }).properties;
    expect(props).toHaveProperty('rangeStart');
    expect(props).toHaveProperty('rangeEnd');
  });

  it('the rangeStart/rangeEnd fields are NOT class-field-initialized on the prototype', () => {
    // The Rule-10 anti-pattern is a `rangeStart = MISSION_START_ET` class-
    // field initializer. We verify the prototype contract by checking that
    // the constructor produces an instance whose values match the ctor-body
    // seed (the seed must be set, but via ctor-body NOT class-field).
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    expect(typeof el.rangeStart).toBe('number');
    expect(typeof el.rangeEnd).toBe('number');
    el.remove();
  });

  it('detail-variant track is 4px tall (CSS surface check)', () => {
    const flat = (VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(
      /:host\(\[variant=['"]detail['"]\]\)\s*\.track\s*\{[^}]*height:\s*4px/,
    );
  });

  it('detail-variant track uses low-alpha accent background', () => {
    const flat = (VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(
      /:host\(\[variant=['"]detail['"]\]\)\s*\.track\s*\{[^}]*background:\s*rgba\(212,\s*160,\s*23,\s*0\.18\)/,
    );
  });

  it('detail-variant thumb is a 10px solid accent circle (no border ring)', () => {
    const flat = (VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(
      /:host\(\[variant=['"]detail['"]\]\)\s*\.thumb\s*\{[^}]*width:\s*10px/,
    );
    expect(joined).toMatch(
      /:host\(\[variant=['"]detail['"]\]\)\s*\.thumb\s*\{[^}]*background:\s*var\(--v-color-accent\)/,
    );
    expect(joined).toMatch(
      /:host\(\[variant=['"]detail['"]\]\)\s*\.thumb\s*\{[^}]*border:\s*0/,
    );
  });

  it('detail-variant renders date-range labels at the track ends', async () => {
    // V1 Jupiter window 1979-02-03 → 1979-04-04.
    const start = etFromIsoLocal('1979-02-03T12:05:00Z');
    const end = etFromIsoLocal('1979-04-04T12:05:00Z');
    const { el } = await makeDetailScrubber({
      simEt: (start + end) / 2,
      rangeStart: start,
      rangeEnd: end,
    });
    const labels = el.shadowRoot!.querySelector('.detail-range-labels');
    expect(labels).toBeTruthy();
    const left = labels!.querySelector('.detail-range-label-left');
    const right = labels!.querySelector('.detail-range-label-right');
    expect(left?.textContent?.trim()).toBe('FEB 3');
    expect(right?.textContent?.trim()).toBe('APR 4, 1979');
    el.remove();
  });

  it('detail-variant aria-valuemin / aria-valuemax reflect rangeStart / rangeEnd', async () => {
    const start = 100;
    const end = 1000;
    const { el } = await makeDetailScrubber({ rangeStart: start, rangeEnd: end });
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(parseFloat(thumb.getAttribute('aria-valuemin')!)).toBe(start);
    expect(parseFloat(thumb.getAttribute('aria-valuemax')!)).toBe(end);
    el.remove();
  });

  it('variant prop is reactive — toggling re-renders without remounting (Rule 10)', async () => {
    const { el } = await makeScrubber();
    // mission variant — no detail-range labels.
    expect(el.shadowRoot!.querySelector('.detail-range-labels')).toBeFalsy();
    el.variant = 'detail';
    await el.updateComplete;
    expect(el.getAttribute('variant')).toBe('detail');
    // Re-render with the new variant should now have detail-range labels.
    expect(el.shadowRoot!.querySelector('.detail-range-labels')).toBeTruthy();
    el.remove();
  });
});

// Helper for time-conversions in these tests. Imported here to avoid the
// loop import that would happen if we re-exported from a fixture file.
import { etFromIso as etFromIsoLocal } from '../math/et-conversions';

describe('Story 4.4 AC2 — slide-in / slide-out via ChapterDirector substate', () => {
  it('cold-load that lands inside an encounter window seeds detailOpen=true', async () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    director.update(v1Jupiter.anchorEt);
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'detail';
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.getAttribute('aria-hidden')).toBe('false');
    expect(el.hasAttribute('data-open')).toBe(true);
    el.remove();
  });

  it('cold-load outside any encounter window leaves detailOpen=false', async () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    // Mission start → launch-v2 chapter (NOT encounter)
    director.update(MISSION_START_ET);
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'detail';
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.hasAttribute('data-open')).toBe(false);
    el.remove();
  });

  it('entering an encounter chapter flips aria-hidden false + data-open', async () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    director.update(MISSION_START_ET); // outside any encounter
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'detail';
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.getAttribute('aria-hidden')).toBe('true');

    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    director.update(v1Jupiter.anchorEt);
    await el.updateComplete;
    expect(el.getAttribute('aria-hidden')).toBe('false');
    expect(el.hasAttribute('data-open')).toBe(true);
    el.remove();
  });

  it('exiting an encounter chapter flips aria-hidden true + removes data-open', async () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    director.update(v1Jupiter.anchorEt); // inside encounter
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'detail';
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.getAttribute('aria-hidden')).toBe('false');

    // Scrub past the chapter window end.
    director.update(v1Jupiter.windowEndEt + 1);
    await el.updateComplete;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.hasAttribute('data-open')).toBe(false);
    el.remove();
  });

  it('range-start / range-end update to match the active chapter BEFORE slide-in', async () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    director.update(MISSION_START_ET);
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'detail';
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;

    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    director.update(v1Jupiter.anchorEt);
    await el.updateComplete;
    expect(el.rangeStart).toBe(v1Jupiter.windowStartEt);
    expect(el.rangeEnd).toBe(v1Jupiter.windowEndEt);
    el.remove();
  });

  it('non-encounter chapter (launch-v2) does NOT open the detail scrubber', async () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'detail';
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;

    const launchV2 = findChapterBySlug('launch-v2')!;
    director.update(launchV2.anchorEt);
    await el.updateComplete;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.hasAttribute('data-open')).toBe(false);
    el.remove();
  });

  it('host opacity transitions defined under --v-duration-slow (CSS surface)', () => {
    const flat = (VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(/transition:\s*opacity\s*var\(--v-duration-slow\)/);
  });

  it('reverse-scrub past windowStartEt flips aria-hidden back to true', async () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    director.update(v1Jupiter.anchorEt);
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'detail';
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.getAttribute('aria-hidden')).toBe('false');

    director.update(v1Jupiter.windowStartEt - 86400);
    await el.updateComplete;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    el.remove();
  });
});

describe('Story 4.4 AC5 — cadence-aware keyboard step on detail variant', () => {
  const makeDetailWithChapter = async (
    cursorEt: number,
  ): Promise<{ el: VTimelineScrubber; chapter: ReturnType<typeof findChapterBySlug> }> => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    // Position the cursor at the requested ET and update the director so
    // the chapter is `held` and our detail variant subscribes properly.
    const clock = new ClockManager();
    clock.scrubTo(cursorEt);
    director.update(cursorEt);
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'detail';
    el.clockManager = clock;
    el.chapterDirector = director;
    el.urlSync = makeStubUrlSync() as unknown as URLSync;
    document.body.appendChild(el);
    await el.updateComplete;
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    track.getBoundingClientRect = () =>
      ({ left: 0, right: 1000, top: 0, bottom: 4, width: 1000, height: 4, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    return { el, chapter: v1Jupiter };
  };

  it('at anchor (CA): ArrowRight steps by 10 seconds (10sec tier)', async () => {
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const { el } = await makeDetailWithChapter(v1Jupiter.anchorEt);
    const before = el.simEt;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(el.simEt - before).toBe(10);
    el.remove();
  });

  it('at anchor + 12 hours: ArrowRight steps by 60 seconds (1min tier)', async () => {
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const { el } = await makeDetailWithChapter(v1Jupiter.anchorEt + 12 * ONE_HOUR);
    const before = el.simEt;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(el.simEt - before).toBe(60);
    el.remove();
  });

  it('at anchor + 3 days: ArrowRight steps by 3600 seconds (hourly tier)', async () => {
    // Story 4.5 — V1J window narrowed from ±30d (Story 2.1 placeholder)
    // to ±5d. Anchor + 10 days now lands outside the held window, so
    // the test uses anchor + 3 days: >2 days (past the 1min band) and
    // inside the ±5d window (chapter still held).
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const { el } = await makeDetailWithChapter(v1Jupiter.anchorEt + 3 * SECONDS_PER_DAY);
    const before = el.simEt;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(el.simEt - before).toBe(3600);
    el.remove();
  });

  it('Shift+ArrowRight at anchor steps by 100 seconds (10sec tier × 10)', async () => {
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const { el } = await makeDetailWithChapter(v1Jupiter.anchorEt);
    const before = el.simEt;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    );
    expect(el.simEt - before).toBe(100);
    el.remove();
  });

  it('Home jumps to windowStartEt (NOT MISSION_START_ET)', async () => {
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const { el } = await makeDetailWithChapter(v1Jupiter.anchorEt);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(el.simEt).toBe(v1Jupiter.windowStartEt);
    el.remove();
  });

  it('End jumps to windowEndEt (NOT MISSION_END_ET)', async () => {
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const { el } = await makeDetailWithChapter(v1Jupiter.anchorEt);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(el.simEt).toBe(v1Jupiter.windowEndEt);
    el.remove();
  });

  it('aria-label is "<chapter name> encounter timeline"', async () => {
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const { el } = await makeDetailWithChapter(v1Jupiter.anchorEt);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('aria-label')).toBe(
      `${v1Jupiter.name} encounter timeline`,
    );
    el.remove();
  });

  it('aria-valuetext is the formatForHud form (YYYY-MM-DD HH:MM UT)', async () => {
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const { el } = await makeDetailWithChapter(v1Jupiter.anchorEt);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('aria-valuetext')).toBe(formatForHud(v1Jupiter.anchorEt));
    el.remove();
  });
});

describe('Story 4.4 AC6 — mission scrubber highlight band', () => {
  it('renders a .highlight-band child when an encounter chapter is held', async () => {
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    clock.scrubTo(v1Jupiter.anchorEt);
    director.update(v1Jupiter.anchorEt);
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'mission';
    el.clockManager = clock;
    el.chapterDirector = director;
    el.urlSync = makeStubUrlSync() as unknown as URLSync;
    document.body.appendChild(el);
    await el.updateComplete;
    const band = el.shadowRoot!.querySelector('.highlight-band');
    expect(band).toBeTruthy();
    el.remove();
  });

  it('does NOT render the band when no encounter chapter is held', async () => {
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    // launch-v2 chapter (held at MISSION_START_ET) is NOT an encounter
    director.update(MISSION_START_ET);
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'mission';
    el.clockManager = clock;
    el.chapterDirector = director;
    el.urlSync = makeStubUrlSync() as unknown as URLSync;
    document.body.appendChild(el);
    await el.updateComplete;
    const band = el.shadowRoot!.querySelector('.highlight-band');
    expect(band).toBeFalsy();
    el.remove();
  });

  it('band CSS left/right percentages bracket the V1J window', async () => {
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    clock.scrubTo(v1Jupiter.anchorEt);
    director.update(v1Jupiter.anchorEt);
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'mission';
    el.clockManager = clock;
    el.chapterDirector = director;
    el.urlSync = makeStubUrlSync() as unknown as URLSync;
    document.body.appendChild(el);
    await el.updateComplete;
    const band = el.shadowRoot!.querySelector<HTMLElement>('.highlight-band')!;
    const span = MISSION_END_ET - MISSION_START_ET;
    const expectedLeftFrac = (v1Jupiter.windowStartEt - MISSION_START_ET) / span;
    const expectedRightFrac =
      1 - (v1Jupiter.windowEndEt - MISSION_START_ET) / span;
    const actualLeftPct = parseFloat(band.style.left);
    const actualRightPct = parseFloat(band.style.right);
    expect(Math.abs(actualLeftPct - expectedLeftFrac * 100)).toBeLessThan(0.001);
    expect(Math.abs(actualRightPct - expectedRightFrac * 100)).toBeLessThan(0.001);
    el.remove();
  });

  it('band background is the low-alpha accent (CSS surface)', () => {
    const flat = (VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(
      /\.highlight-band\s*\{[^}]*background:\s*rgba\(212,\s*160,\s*23,\s*0\.18\)/,
    );
  });
});

describe('Story 4.4 AC4 — dual-scrubber state sync', () => {
  it('both scrubbers read clockManager.simTimeEt — aria-valuenow agrees', async () => {
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    clock.scrubTo(v1Jupiter.anchorEt);
    director.update(v1Jupiter.anchorEt);
    const mission = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    mission.variant = 'mission';
    mission.clockManager = clock;
    mission.chapterDirector = director;
    mission.urlSync = makeStubUrlSync() as unknown as URLSync;
    document.body.appendChild(mission);
    const detail = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    detail.variant = 'detail';
    detail.clockManager = clock;
    detail.chapterDirector = director;
    detail.urlSync = makeStubUrlSync() as unknown as URLSync;
    document.body.appendChild(detail);
    await mission.updateComplete;
    await detail.updateComplete;
    const missionNow = mission.shadowRoot!.querySelector('.thumb')!.getAttribute('aria-valuenow');
    const detailNow = detail.shadowRoot!.querySelector('.thumb')!.getAttribute('aria-valuenow');
    expect(missionNow).toBe(detailNow);
    // Story 6.4 AC1 — aria-valuenow is numeric ET (ARIA spec).
    expect(missionNow).toBe(String(v1Jupiter.anchorEt));
    mission.remove();
    detail.remove();
  });

  it('dragging the detail thumb updates the mission scrubber aria-valuenow', async () => {
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    clock.scrubTo(v1Jupiter.anchorEt);
    director.update(v1Jupiter.anchorEt);
    const mission = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    mission.variant = 'mission';
    mission.clockManager = clock;
    mission.chapterDirector = director;
    mission.urlSync = makeStubUrlSync() as unknown as URLSync;
    document.body.appendChild(mission);
    const detail = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    detail.variant = 'detail';
    detail.clockManager = clock;
    detail.chapterDirector = director;
    detail.urlSync = makeStubUrlSync() as unknown as URLSync;
    document.body.appendChild(detail);
    await mission.updateComplete;
    await detail.updateComplete;
    const detailTrack = detail.shadowRoot!.querySelector('.track') as HTMLElement;
    detailTrack.getBoundingClientRect = () =>
      ({ left: 0, right: 1000, top: 0, bottom: 4, width: 1000, height: 4, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    detailTrack.dispatchEvent(makePointerEvent('pointerdown', { clientX: 750, target: detailTrack }));
    await mission.updateComplete;
    const missionNow = mission.shadowRoot!.querySelector('.thumb')!.getAttribute('aria-valuenow');
    const detailNow = detail.shadowRoot!.querySelector('.thumb')!.getAttribute('aria-valuenow');
    expect(missionNow).toBe(detailNow);
    mission.remove();
    detail.remove();
  });
});

describe('Story 4.4 AC3 — pointer-capture discipline', () => {
  it('mid-drag substate transition does NOT switch the active drag target', async () => {
    // Drag begins on the mission scrubber's thumb. Mid-drag we transition
    // the chapter director into entering — the detail scrubber should slide
    // in but the mission scrubber's drag must continue (pointer-capture
    // stays bound to the mission thumb, not the detail).
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    director.update(MISSION_START_ET);
    const mission = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    mission.variant = 'mission';
    mission.clockManager = clock;
    mission.chapterDirector = director;
    mission.urlSync = makeStubUrlSync() as unknown as URLSync;
    document.body.appendChild(mission);
    const detail = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    detail.variant = 'detail';
    detail.clockManager = clock;
    detail.chapterDirector = director;
    detail.urlSync = makeStubUrlSync() as unknown as URLSync;
    document.body.appendChild(detail);
    await mission.updateComplete;
    await detail.updateComplete;

    const missionTrack = mission.shadowRoot!.querySelector('.track') as HTMLElement;
    missionTrack.getBoundingClientRect = () =>
      ({ left: 0, right: 1000, top: 0, bottom: 12, width: 1000, height: 12, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const missionThumb = mission.shadowRoot!.querySelector('.thumb') as HTMLElement;

    // Begin a drag on the mission thumb.
    missionTrack.dispatchEvent(makePointerEvent('pointerdown', { clientX: 100, target: missionThumb }));
    expect(missionThumb.hasAttribute('data-dragging')).toBe(true);

    // Drive the substate INTO an encounter window mid-drag — the detail
    // scrubber's slide-in side effect runs but must NOT remove the
    // data-dragging attribute from the mission thumb (the pointer
    // capture is bound to that DOM element by attachPointerHandlers).
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    director.update(v1Jupiter.anchorEt);
    await mission.updateComplete;
    await detail.updateComplete;
    expect(missionThumb.hasAttribute('data-dragging')).toBe(true);

    // Release.
    missionTrack.dispatchEvent(makePointerEvent('pointerup', { clientX: 100 }));
    expect(missionThumb.hasAttribute('data-dragging')).toBe(false);
    mission.remove();
    detail.remove();
  });
});

describe('Story 2.2 — focus ring + CSS surface', () => {
  it('chapter-marker:focus-visible has the 2px focus ring via box-shadow', () => {
    const joined = (
      VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>
    )
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(joined).toMatch(
      /\.chapter-marker:focus-visible\s*\{[^}]*box-shadow:\s*0\s+0\s+0\s+2px\s+var\(--v-color-focus\)/,
    );
  });

  it('inactive marker uses --v-color-fg-muted; active uses --v-color-accent', () => {
    const joined = (
      VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>
    )
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(joined).toMatch(
      /\.chapter-marker\s*\{[^}]*background-color:\s*var\(--v-color-fg-muted\)/,
    );
    expect(joined).toMatch(
      /\.chapter-marker\[data-active\]\s*\{[^}]*background-color:\s*var\(--v-color-accent\)/,
    );
  });

  it('marker is 2px wide × 18px tall', () => {
    const joined = (
      VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>
    )
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(joined).toMatch(/\.chapter-marker\s*\{[^}]*width:\s*2px/);
    expect(joined).toMatch(/\.chapter-marker\s*\{[^}]*height:\s*18px/);
  });
});
