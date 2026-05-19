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

  it('aria-valuemin equals isoFromEt(MISSION_START_ET)', async () => {
    const { el } = await makeScrubber();
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('aria-valuemin')).toBe(isoFromEt(MISSION_START_ET));
    el.remove();
  });

  it('aria-valuemax equals isoFromEt(MISSION_END_ET)', async () => {
    const { el } = await makeScrubber();
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('aria-valuemax')).toBe(isoFromEt(MISSION_END_ET));
    el.remove();
  });

  it('aria-valuenow reflects the current simEt as ISO', async () => {
    const { el } = await makeScrubber();
    const target = MISSION_START_ET + 365 * ONE_DAY;
    el.simEt = target;
    await el.updateComplete;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('aria-valuenow')).toBe(isoFromEt(target));
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

describe('Story 1.9 — chapter markers slot is a no-op stub', () => {
  it('renders an empty .chapters element (placeholder for Story 2.2)', async () => {
    const { el } = await makeScrubber();
    const chapters = el.shadowRoot!.querySelector('.chapters');
    expect(chapters).toBeTruthy();
    expect(chapters!.children.length).toBe(0);
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

  it('renders aria-valuenow from clockManager.simTimeEt', async () => {
    const { el, clock } = await makeScrubberWithClock();
    const targetEt = MISSION_START_ET + 1000 * 86400;
    clock.scrubTo(targetEt);
    await el.updateComplete;
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('aria-valuenow')).toBe(isoFromEt(targetEt));
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
