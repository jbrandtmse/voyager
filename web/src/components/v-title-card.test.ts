// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { BaseElement } from './base-element';
import { VTitleCard } from './v-title-card';
import { TITLE_CARD_HOLD_MS } from '../constants/mission';

describe('Story 1.9 Task 5 — <v-title-card>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('v-title-card').forEach((el) => el.remove());
  });

  it('class extends BaseElement', () => {
    const proto = Object.getPrototypeOf(VTitleCard.prototype) as object;
    expect(proto).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-title-card>', () => {
    expect(customElements.get('v-title-card')).toBe(VTitleCard);
  });

  it('renders the canonical title text "Voyager. 1977 to 2030."', async () => {
    const el = document.createElement('v-title-card') as VTitleCard;
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.shadowRoot?.textContent ?? '';
    expect(text).toContain('Voyager. 1977 to 2030.');
  });

  it('static styles reference --v-size-title-card and --v-font-sans tokens', () => {
    const flat = (VTitleCard.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('var(--v-size-title-card)');
    expect(joined).toContain('var(--v-font-sans)');
  });

  it('host transition uses --v-duration-slow (reduced-motion-aware)', () => {
    const flat = (VTitleCard.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('var(--v-duration-slow)');
  });

  it('holds for TITLE_CARD_HOLD_MS (2000 ms) before triggering dissolve', async () => {
    const el = document.createElement('v-title-card') as VTitleCard;
    document.body.appendChild(el);
    await el.updateComplete;
    // Before the hold elapses, the dissolve attribute should not be set.
    vi.advanceTimersByTime(TITLE_CARD_HOLD_MS - 1);
    expect(el.hasAttribute('data-dissolving')).toBe(false);
    // Crossing the threshold sets the attribute → CSS opacity transition starts.
    vi.advanceTimersByTime(2);
    expect(el.hasAttribute('data-dissolving')).toBe(true);
  });

  it('emits voyager:title-card-complete after hold + dissolve completes (via fallback timer)', async () => {
    const el = document.createElement('v-title-card') as VTitleCard;
    let fired = false;
    el.addEventListener('voyager:title-card-complete', () => {
      fired = true;
    });
    document.body.appendChild(el);
    await el.updateComplete;
    // happy-dom does not fire transitionend, so the fallback timer is the
    // path that completes the test. Advance hold + 1.5x slow (~400ms) + 1ms.
    vi.advanceTimersByTime(TITLE_CARD_HOLD_MS + 700);
    expect(fired).toBe(true);
  });

  it('voyager:title-card-complete event bubbles and is composed (escapes shadow DOM)', async () => {
    const el = document.createElement('v-title-card') as VTitleCard;
    let bubbledToBody = false;
    document.body.addEventListener(
      'voyager:title-card-complete',
      () => {
        bubbledToBody = true;
      },
      { once: true },
    );
    document.body.appendChild(el);
    await el.updateComplete;
    vi.advanceTimersByTime(TITLE_CARD_HOLD_MS + 700);
    expect(bubbledToBody).toBe(true);
  });

  it('does not fire complete twice if both transitionend and fallback timer occur', async () => {
    const el = document.createElement('v-title-card') as VTitleCard;
    let count = 0;
    el.addEventListener('voyager:title-card-complete', () => {
      count++;
    });
    document.body.appendChild(el);
    await el.updateComplete;
    // Trigger hold expiry → dissolve starts.
    vi.advanceTimersByTime(TITLE_CARD_HOLD_MS + 1);
    // Synthesize a transitionend on the host (some browsers fire it).
    el.dispatchEvent(new Event('transitionend'));
    vi.advanceTimersByTime(700);
    expect(count).toBe(1);
  });

  it('disconnects cleanly — pending timers cancelled on removal', async () => {
    const el = document.createElement('v-title-card') as VTitleCard;
    let fired = false;
    el.addEventListener('voyager:title-card-complete', () => {
      fired = true;
    });
    document.body.appendChild(el);
    await el.updateComplete;
    // Remove before hold expires.
    el.remove();
    vi.advanceTimersByTime(TITLE_CARD_HOLD_MS + 1000);
    expect(fired).toBe(false);
  });

  it('overlays the viewport via :host position fixed inset 0', () => {
    const flat = (VTitleCard.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('position: fixed');
    expect(joined).toContain('inset: 0');
  });
});
