// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import { BaseElement } from './base-element';
import { VSpeedMultiplier } from './v-speed-multiplier';
import { ClockManager, MAX_PLAYBACK_RATE } from '../services/clock-manager';

const mount = async (clock: ClockManager): Promise<VSpeedMultiplier> => {
  const el = document.createElement('v-speed-multiplier') as VSpeedMultiplier;
  el.clockManager = clock;
  document.body.appendChild(el);
  await el.updateComplete;
  const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
  // 600px track for round-number positions.
  track.getBoundingClientRect = () =>
    ({ left: 0, right: 600, top: 0, bottom: 12, width: 600, height: 12, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return el;
};

const pointer = (
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

describe('Story 1.10 Task 6 — <v-speed-multiplier> registration + structure', () => {
  it('class extends BaseElement', () => {
    expect(Object.getPrototypeOf(VSpeedMultiplier.prototype)).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element', () => {
    expect(customElements.get('v-speed-multiplier')).toBe(VSpeedMultiplier);
  });

  it('renders track / fill / thumb / readout', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    expect(el.shadowRoot!.querySelector('.track')).toBeTruthy();
    expect(el.shadowRoot!.querySelector('.fill')).toBeTruthy();
    expect(el.shadowRoot!.querySelector('.thumb')).toBeTruthy();
    expect(el.shadowRoot!.querySelector('.readout')).toBeTruthy();
    el.remove();
  });

  it('anchors bottom-right with edge margin and 120px track width', () => {
    const flat = (VSpeedMultiplier.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('right: var(--v-edge-margin)');
    expect(joined).toContain('bottom: var(--v-edge-margin)');
    expect(joined).toMatch(/\.track\s*\{[^}]*width:\s*120px/);
  });

  it('end labels are "1×" and "1M×"', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const labels = el.shadowRoot!.querySelectorAll('.label');
    expect(labels.length).toBe(2);
    expect(labels[0].textContent).toBe('1×');
    expect(labels[1].textContent).toBe('1M×');
    el.remove();
  });
});

describe('Story 1.10 AC4 — log-scale mapping', () => {
  it('rate=1 → thumb at left=0%', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    expect(thumb.style.left).toMatch(/^0(\.0+)?%$/);
    el.remove();
  });

  it('rate=1,000,000 → thumb at left=100%', async () => {
    const clock = new ClockManager();
    clock.setRate(MAX_PLAYBACK_RATE);
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    expect(thumb.style.left).toMatch(/^100(\.0+)?%$/);
    el.remove();
  });

  it('rate=1000 → thumb at left=50% (log10(1000)/6 = 3/6)', async () => {
    const clock = new ClockManager();
    clock.setRate(1000);
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    const pct = parseFloat(thumb.style.left);
    expect(Math.abs(pct - 50)).toBeLessThan(0.01);
    el.remove();
  });
});

describe('Story 1.10 AC4 — snap-to-decade within 5% tolerance', () => {
  it('clicking ~3% into the track snaps to decade 0 (rate=1)', async () => {
    const clock = new ClockManager();
    clock.setRate(100); // start far away to verify snap
    const el = await mount(clock);
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    // x = 18px / 600 = 3% — within 5% of decade 0 (pos=0).
    track.dispatchEvent(pointer('pointerdown', { clientX: 18, target: track }));
    expect(clock.playbackRate).toBe(1);
    el.remove();
  });

  it('clicking near decade 3 (50%) snaps to rate=1000', async () => {
    const clock = new ClockManager();
    clock.setRate(1);
    const el = await mount(clock);
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    // x = 305 / 600 = 0.5083; within 5% of pos=0.5 → snap to rate=1000.
    track.dispatchEvent(pointer('pointerdown', { clientX: 305, target: track }));
    expect(clock.playbackRate).toBe(1000);
    el.remove();
  });

  it('clicking outside snap band keeps smooth (continuous) value', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    // x = 230 / 600 = 0.3833; far from decade pos 1/3 (0.333) and 0.5.
    // |0.3833 - 0.333| = 0.05 (right at the boundary). Pick something off:
    // x = 240 / 600 = 0.4; midway between decade pos 0.333 and 0.5, distance
    // 0.067 to nearer → no snap. Expected rate: 10^(0.4 * 6) = 251.19.
    track.dispatchEvent(pointer('pointerdown', { clientX: 240, target: track }));
    const expectedRate = Math.pow(10, 0.4 * 6);
    expect(clock.playbackRate).toBeCloseTo(expectedRate, 1);
    expect(clock.playbackRate).not.toBe(100);
    expect(clock.playbackRate).not.toBe(1000);
    el.remove();
  });
});

describe('Story 1.10 AC4 — WAI-ARIA Slider on log scale', () => {
  it('role/aria-label/aria-valuemin/aria-valuemax', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('role')).toBe('slider');
    expect(thumb.getAttribute('aria-label')).toBe('Playback speed');
    expect(thumb.getAttribute('aria-valuemin')).toBe('0');
    expect(thumb.getAttribute('aria-valuemax')).toBe('6');
    expect(thumb.getAttribute('aria-orientation')).toBe('horizontal');
    el.remove();
  });

  it('aria-valuenow reflects log10(rate)', async () => {
    const clock = new ClockManager();
    clock.setRate(100);
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    const valueNow = parseFloat(thumb.getAttribute('aria-valuenow') ?? '');
    expect(valueNow).toBeCloseTo(2, 6);
    el.remove();
  });

  it('aria-valuetext is the formatted readout', async () => {
    const clock = new ClockManager();
    clock.setRate(60);
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    expect(thumb.getAttribute('aria-valuetext')).toBe('60× — 1 min/sec');
    el.remove();
  });

  // Story 1.15 AC4 — UTF-8 cleanliness. The post-Epic-1 manual smoke
  // surfaced `1Ã â 1 sec/sec` (UTF-8 bytes of `×` mis-decoded as Latin-1).
  // We assert (a) byte-exact equality against the expected default-rate
  // string AND (b) explicit code-point checks for the multiplication sign
  // (U+00D7) and em-dash (U+2014). The code-point assertion guards against
  // any future regression that re-introduces the mojibake sequence
  // (`0xC3 0x97` interpreted as `Ã` `—` or similar).
  it('aria-valuetext at 1× is byte-exact "1× — 1 sec/sec" (no mojibake)', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    const raw = thumb.getAttribute('aria-valuetext');
    expect(raw).not.toBeNull();
    const expected = '1× — 1 sec/sec';
    expect(raw).toBe(expected);
    // Code-point spot check: index 1 must be U+00D7 (×), not the Latin-1
    // mojibake byte pair `Ã—` (`0xC3 0x97` decoded as 'Ã' + something).
    expect(raw!.charCodeAt(1)).toBe(0x00d7);
    // Em-dash sits at index 3 in "1× — …".
    expect(raw!.charCodeAt(3)).toBe(0x2014);
    // Ensure no mojibake byte values leaked through.
    expect(raw!.includes('Ã')).toBe(false); // Ã
    el.remove();
  });
});

describe('Story 1.10 AC5 — keyboard', () => {
  it('+/= advances by one decade', async () => {
    const clock = new ClockManager();
    clock.setRate(1);
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true }));
    expect(clock.playbackRate).toBe(10);
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    expect(clock.playbackRate).toBe(100);
    el.remove();
  });

  it('- retreats by one decade', async () => {
    const clock = new ClockManager();
    clock.setRate(1000);
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
    expect(clock.playbackRate).toBe(100);
    el.remove();
  });

  it('Shift++ adjusts by 5% (smooth, no snap)', async () => {
    const clock = new ClockManager();
    clock.setRate(1); // pos = 0
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: '=', shiftKey: true, bubbles: true }),
    );
    // pos = 0.05 → rate = 10^0.3 ≈ 1.995. Not snapped to 1 or 10.
    expect(clock.playbackRate).toBeCloseTo(Math.pow(10, 0.3), 3);
    expect(clock.playbackRate).not.toBe(1);
    expect(clock.playbackRate).not.toBe(10);
    el.remove();
  });

  it('Home jumps to 1×', async () => {
    const clock = new ClockManager();
    clock.setRate(1000);
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(clock.playbackRate).toBe(1);
    el.remove();
  });

  it('End jumps to 1,000,000×', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(clock.playbackRate).toBe(MAX_PLAYBACK_RATE);
    el.remove();
  });

  it('preventDefault is called on +/-/Home/End', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    for (const key of ['=', '+', '-', 'Home', 'End']) {
      const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      thumb.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
    }
    el.remove();
  });

  it('ignores unrelated keys', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const thumb = el.shadowRoot!.querySelector('.thumb')!;
    const evt = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true });
    thumb.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    expect(clock.playbackRate).toBe(1);
    el.remove();
  });
});

describe('Story 1.10 AC4 — readout text', () => {
  it('shows formatted readout for current rate', async () => {
    const clock = new ClockManager();
    clock.setRate(3600);
    const el = await mount(clock);
    const readout = el.shadowRoot!.querySelector('.readout')!;
    expect(readout.textContent).toBe('3,600× — 1 hour/sec');
    el.remove();
  });

  it('re-renders reactively when clockManager.setRate changes', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const readout = el.shadowRoot!.querySelector('.readout')!;
    expect(readout.textContent).toBe('1× — 1 sec/sec');
    clock.setRate(60);
    await el.updateComplete;
    expect(readout.textContent).toBe('60× — 1 min/sec');
    el.remove();
  });
});

describe('Story 1.10 AC6 — auto-cap indicator in readout', () => {
  it('appends "—paused (loading)" when clock.autoCapped is true', async () => {
    const clock = new ClockManager();
    clock.setRate(100);
    // Wire a fake loader that toggles autoCapped on.
    const subs = new Set<(loading: boolean) => void>();
    clock.setChunkLoader({
      get loading(): boolean { return true; },
      subscribe(cb): () => void {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    });
    const el = await mount(clock);
    const readout = el.shadowRoot!.querySelector('.readout')!;
    expect(readout.textContent).toContain('—paused (loading)');
    el.remove();
  });

  it('removes the indicator when autoCapped clears', async () => {
    const clock = new ClockManager();
    let loading = true;
    const subs = new Set<(loading: boolean) => void>();
    const fake = {
      get loading(): boolean { return loading; },
      subscribe(cb: (loading: boolean) => void): () => void {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    };
    clock.setChunkLoader(fake);
    const el = await mount(clock);
    expect(el.shadowRoot!.querySelector('.readout')!.textContent).toContain(
      '—paused (loading)',
    );
    // Emit loading=false.
    loading = false;
    for (const cb of subs) cb(false);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.readout')!.textContent).not.toContain(
      '—paused (loading)',
    );
    el.remove();
  });
});

describe('Story 1.10 — pointer drag updates speed', () => {
  it('dragging the thumb across the track updates clockManager.playbackRate', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const track = el.shadowRoot!.querySelector('.track') as HTMLElement;
    const thumb = el.shadowRoot!.querySelector('.thumb') as HTMLElement;
    track.dispatchEvent(pointer('pointerdown', { clientX: 0, target: thumb }));
    expect(thumb.hasAttribute('data-dragging')).toBe(true);
    // Drag to ~58% (outside any 5% decade band)
    track.dispatchEvent(pointer('pointermove', { clientX: 350 }));
    const expected = Math.pow(10, (350 / 600) * 6);
    expect(clock.playbackRate).toBeCloseTo(expected, 1);
    track.dispatchEvent(pointer('pointerup', { clientX: 350 }));
    expect(thumb.hasAttribute('data-dragging')).toBe(false);
    el.remove();
  });
});
