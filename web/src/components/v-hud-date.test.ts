// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { BaseElement } from './base-element';
import { VHudDate } from './v-hud-date';
import { ClockManager } from '../services/clock-manager';
import { etFromIso, dateForHud, isoFromEt } from '../math/et-conversions';

const mount = async (clock: ClockManager | null): Promise<VHudDate> => {
  const el = document.createElement('v-hud-date') as VHudDate;
  if (clock !== null) el.clockManager = clock;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

describe('Story 1.11 Task 4 — <v-hud-date> registration', () => {
  it('class extends BaseElement', () => {
    expect(Object.getPrototypeOf(VHudDate.prototype)).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-hud-date>', () => {
    expect(customElements.get('v-hud-date')).toBe(VHudDate);
  });
});

describe('Story 1.11 AC3 — <v-hud-date> structure', () => {
  it('renders the "UT" prefix label and a <time> element', async () => {
    const clock = new ClockManager();
    clock.scrubTo(etFromIso('1989-08-25T09:23:00Z'));
    const el = await mount(clock);
    const label = el.shadowRoot!.querySelector('.label');
    expect(label?.textContent).toBe('UT');
    expect(el.shadowRoot!.querySelector('time')).toBeTruthy();
    el.remove();
  });

  it('seeds the <time> with the clock-current ET', async () => {
    const clock = new ClockManager();
    const et = etFromIso('1989-08-25T09:23:00Z');
    clock.scrubTo(et);
    const el = await mount(clock);
    const timeEl = el.shadowRoot!.querySelector('time')!;
    expect(timeEl.textContent).toBe('1989-08-25 09:23');
    expect(timeEl.getAttribute('datetime')).toBe(isoFromEt(et));
    el.remove();
  });

  it('uses JetBrains Mono with tabular-nums', () => {
    const flat = (VHudDate.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('var(--v-font-mono)');
    expect(joined).toContain('tabular-nums');
  });

  it('uses var(--v-color-fg) for the value and fg-quiet for the label', () => {
    const flat = (VHudDate.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(/\.label\s*\{[^}]*var\(--v-color-fg-quiet\)/);
    expect(joined).toMatch(/time\s*\{[^}]*var\(--v-color-fg\)/);
  });

  it('label letter-spacing is 0.06em uppercase', () => {
    const flat = (VHudDate.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(/letter-spacing:\s*0\.06em/);
    expect(joined).toMatch(/text-transform:\s*uppercase/);
  });
});

describe('Story 1.11 AC6 — per-frame tick(et) mutates visible DOM directly', () => {
  it('tick(et) updates <time> textContent and datetime in place', async () => {
    const clock = new ClockManager();
    clock.scrubTo(etFromIso('1989-08-25T09:23:00Z'));
    const el = await mount(clock);
    const timeEl = el.shadowRoot!.querySelector('time')!;
    const startText = timeEl.textContent;
    const newEt = etFromIso('2012-08-25T00:00:00Z');
    el.tick(newEt);
    expect(timeEl.textContent).toBe(dateForHud(newEt));
    expect(timeEl.textContent).not.toBe(startText);
    expect(timeEl.getAttribute('datetime')).toBe(isoFromEt(newEt));
    el.remove();
  });

  it('tick(et) does NOT trigger Lit reactivity (no requestUpdate)', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const reqSpy = vi.spyOn(el, 'requestUpdate');
    el.tick(etFromIso('2012-08-25T00:00:00Z'));
    expect(reqSpy).not.toHaveBeenCalled();
    reqSpy.mockRestore();
    el.remove();
  });
});

describe('Story 1.11 AC6 — aria-live polite mirror, debounced 500ms', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mirror node has aria-live="polite" (not assertive)', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const mirror = el.shadowRoot!.querySelector('.sr-only')!;
    expect(mirror.getAttribute('aria-live')).toBe('polite');
    expect(mirror.getAttribute('aria-live')).not.toBe('assertive');
    el.remove();
  });

  it('mirror is visually hidden (clipped, position absolute)', () => {
    const flat = (VHudDate.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(/\.sr-only\s*\{[^}]*position:\s*absolute/);
    expect(joined).toMatch(/\.sr-only\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  });

  it('mirror updates only after 500ms debounce on scrub-stop', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const mirror = el.shadowRoot!.querySelector('.sr-only')!;
    expect(mirror.textContent).toBe('');
    clock.scrubTo(etFromIso('2012-08-25T00:00:00Z'));
    expect(mirror.textContent).toBe('');
    vi.advanceTimersByTime(499);
    expect(mirror.textContent).toBe('');
    vi.advanceTimersByTime(1);
    expect(mirror.textContent).toBe('2012-08-25 00:00 UT');
    el.remove();
  });

  it('rapid scrubs coalesce into a single trailing aria-live update', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const mirror = el.shadowRoot!.querySelector('.sr-only')!;
    clock.scrubTo(etFromIso('2012-08-25T00:00:00Z'));
    vi.advanceTimersByTime(100);
    clock.scrubTo(etFromIso('2012-08-26T00:00:00Z'));
    vi.advanceTimersByTime(100);
    clock.scrubTo(etFromIso('2012-08-27T00:00:00Z'));
    vi.advanceTimersByTime(499);
    expect(mirror.textContent).toBe('');
    vi.advanceTimersByTime(1);
    expect(mirror.textContent).toBe('2012-08-27 00:00 UT');
    el.remove();
  });

  it('announceNow(et) flushes immediately (chapter-change path)', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    const mirror = el.shadowRoot!.querySelector('.sr-only')!;
    el.announceNow(etFromIso('2012-08-25T00:00:00Z'));
    expect(mirror.textContent).toBe('2012-08-25 00:00 UT');
    el.remove();
  });
});

describe('Story 1.11 — subscribe/unsubscribe lifecycle', () => {
  it('unsubscribes from clockManager on disconnect', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    el.remove();
    expect(() => clock.scrubTo(etFromIso('2012-08-25T00:00:00Z'))).not.toThrow();
  });

  it('does not crash when no clockManager is wired', async () => {
    const el = document.createElement('v-hud-date') as VHudDate;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(() => el.tick(etFromIso('2012-08-25T00:00:00Z'))).not.toThrow();
    el.remove();
  });
});

describe('Story 1.11 AC2 — no background fill', () => {
  it(':host has no background declaration', () => {
    const flat = (VHudDate.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    // BaseElement adopts the same constraint. Strip BaseElement section
    // then ensure no `background` declarations appear.
    expect(joined).not.toMatch(/(?<!text-)background(-color)?\s*:/);
  });
});
