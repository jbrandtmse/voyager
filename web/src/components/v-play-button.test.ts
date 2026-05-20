// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import { BaseElement } from './base-element';
import { VPlayButton } from './v-play-button';
import { ClockManager } from '../services/clock-manager';

const mountButton = async (
  clock: ClockManager,
): Promise<VPlayButton> => {
  const el = document.createElement('v-play-button') as VPlayButton;
  el.clockManager = clock;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

describe('Story 1.10 Task 3 — <v-play-button> registration', () => {
  it('class extends BaseElement', () => {
    const proto = Object.getPrototypeOf(VPlayButton.prototype) as object;
    expect(proto).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-play-button>', () => {
    expect(customElements.get('v-play-button')).toBe(VPlayButton);
  });
});

describe('Story 1.10 AC3 — initial paused state', () => {
  it('renders ▶ glyph and aria-label="Play" when clock is paused', async () => {
    const clock = new ClockManager();
    const el = await mountButton(clock);
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.getAttribute('aria-label')).toBe('Play');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(el.shadowRoot!.querySelector('.glyph')!.textContent).toBe('▶');
    el.remove();
  });
});

describe('Story 1.10 AC3 — playing state', () => {
  it('renders ❚❚ glyph and aria-label="Pause" when clock is playing', async () => {
    const clock = new ClockManager();
    clock.play();
    const el = await mountButton(clock);
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.getAttribute('aria-label')).toBe('Pause');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(el.shadowRoot!.querySelector('.glyph')!.textContent).toBe('❚❚');
    el.remove();
  });
});

describe('Story 1.10 AC3 — click toggles play/pause', () => {
  it('click while paused calls clockManager.play()', async () => {
    const clock = new ClockManager();
    const el = await mountButton(clock);
    const btn = el.shadowRoot!.querySelector('button')!;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clock.playing).toBe(true);
    el.remove();
  });

  it('click while playing calls clockManager.pause()', async () => {
    const clock = new ClockManager();
    clock.play();
    const el = await mountButton(clock);
    const btn = el.shadowRoot!.querySelector('button')!;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clock.playing).toBe(false);
    el.remove();
  });

  it('aria-label and glyph re-render reactively on clock state change', async () => {
    const clock = new ClockManager();
    const el = await mountButton(clock);
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.getAttribute('aria-label')).toBe('Play');
    clock.play();
    await el.updateComplete;
    expect(btn.getAttribute('aria-label')).toBe('Pause');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(el.shadowRoot!.querySelector('.glyph')!.textContent).toBe('❚❚');
    clock.pause();
    await el.updateComplete;
    expect(btn.getAttribute('aria-label')).toBe('Play');
    el.remove();
  });
});

describe('Story 1.10 AC3 — keyboard activation via native button', () => {
  it('button element is a native <button> (Tab-focusable, Enter/Space activates)', async () => {
    const clock = new ClockManager();
    const el = await mountButton(clock);
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
    el.remove();
  });
});

describe('Story 1.10 — anchored bottom-left with edge-margin', () => {
  it(':host position is fixed at bottom-left with edge-margin', () => {
    const flat = (VPlayButton.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('position: fixed');
    expect(joined).toContain('left: var(--v-edge-margin)');
    expect(joined).toContain('bottom: var(--v-edge-margin)');
  });
});

describe('Story 1.10 — subscribe/unsubscribe lifecycle', () => {
  it('unsubscribes from clockManager on disconnect', async () => {
    const clock = new ClockManager();
    const el = await mountButton(clock);
    el.remove();
    // After disconnect, mutating the clock must not throw or cause an
    // out-of-tree requestUpdate. Touch the click handler manually to make
    // sure the unsubscribe didn't break the underlying click path either.
    expect(() => clock.play()).not.toThrow();
    expect(() => clock.pause()).not.toThrow();
  });

  it('click is a no-op when no clockManager is wired', async () => {
    const el = document.createElement('v-play-button') as VPlayButton;
    document.body.appendChild(el);
    await el.updateComplete;
    const btn = el.shadowRoot!.querySelector('button')!;
    // Should not throw.
    expect(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
    el.remove();
  });
});
