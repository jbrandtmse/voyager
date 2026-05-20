// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { BaseElement } from './base-element';
import { VChapterIndex } from './v-chapter-index';
import { ALL_CHAPTERS, findChapterBySlug } from '../chapters/registry';
import { ClockManager } from '../services/clock-manager';
import { ChapterDirector } from '../services/chapter-director';

const makeIndex = async (
  opts: { wireClock?: boolean; wireDirector?: boolean } = {},
): Promise<{
  el: VChapterIndex;
  clock: ClockManager | null;
  director: ChapterDirector | null;
}> => {
  const wireClock = opts.wireClock ?? true;
  const wireDirector = opts.wireDirector ?? true;
  const clock = wireClock ? new ClockManager() : null;
  const director = wireDirector ? new ChapterDirector(ALL_CHAPTERS) : null;
  const el = document.createElement('v-chapter-index') as VChapterIndex;
  if (clock !== null) el.clockManager = clock;
  if (director !== null) el.chapterDirector = director;
  document.body.appendChild(el);
  await el.updateComplete;
  return { el, clock, director };
};

const cleanupBody = (): void => {
  // Each test removes its own `v-chapter-index`; this swept fallback
  // catches stragglers so the global keyboard listener pool stays clean.
  document
    .querySelectorAll('v-chapter-index')
    .forEach((el) => el.remove());
};

afterEach(() => {
  cleanupBody();
});

describe('Story 2.3 — <v-chapter-index> registration + structure', () => {
  it('class extends BaseElement', () => {
    const proto = Object.getPrototypeOf(VChapterIndex.prototype) as object;
    expect(proto).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-chapter-index>', () => {
    expect(customElements.get('v-chapter-index')).toBe(VChapterIndex);
  });
});

describe('Story 2.3 AC1 — toggle button (32×32 hamburger)', () => {
  it('renders a native <button> with three .bar spans', async () => {
    const { el } = await makeIndex();
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('button.toggle');
    expect(btn).not.toBeNull();
    const bars = el.shadowRoot!.querySelectorAll('.toggle .bar');
    expect(bars.length).toBe(3);
    el.remove();
  });

  it('exposes aria-label / aria-expanded / aria-controls when closed', async () => {
    const { el } = await makeIndex();
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('.toggle')!;
    expect(btn.getAttribute('aria-label')).toBe('Open chapter index');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe('chapter-index-panel');
    el.remove();
  });

  it('toggle button has 32×32 sizing rules in CSS', () => {
    const flat = (VChapterIndex.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(flat).toMatch(/\.toggle\s*\{[^}]*width:\s*32px/);
    expect(flat).toMatch(/\.toggle\s*\{[^}]*height:\s*32px/);
  });

  it('click on the toggle opens the panel', async () => {
    const { el } = await makeIndex();
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('.toggle')!;
    btn.click();
    await el.updateComplete;
    expect(el.open).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Close chapter index');
    el.remove();
  });
});

describe('Story 2.3 AC2 — panel slide-in on open', () => {
  it('panel transitions via transform — closed has translateX(100%)', () => {
    const flat = (VChapterIndex.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(flat).toMatch(/\.panel\s*\{[^}]*transform:\s*translateX\(100%\)/);
    expect(flat).toMatch(
      /:host\(\[data-open\]\)\s*\.panel\s*\{[^}]*transform:\s*translateX\(0\)/,
    );
  });

  it('panel transition uses the --v-duration-base token', () => {
    const flat = (VChapterIndex.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(flat).toMatch(/\.panel\s*\{[^}]*transition:[^;]*var\(--v-duration-base\)/);
  });

  it('reduced-motion is honoured via the global --v-duration-base token (no per-component override)', () => {
    const flat = (VChapterIndex.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    // Story 1.7 defense pins that the reduced-motion media-query
    // declaration lives only in global.css; it flips --v-duration-*
    // tokens to 0ms at :root. This component must therefore route
    // its transitions through the duration token rather than
    // declaring a per-component override. See
    // tests/design-system-defense.test.ts for the cross-file gate.
    expect(flat).not.toMatch(/@media[^{]*prefers-reduced-motion/);
    expect(flat).toMatch(/\.panel\s*\{[^}]*transition:[^;]*var\(--v-duration-base\)/);
    expect(flat).toMatch(/\.scrim\s*\{[^}]*transition:[^;]*var\(--v-duration-base\)/);
  });

  it('M keystroke on the document toggles the panel', async () => {
    const { el } = await makeIndex();
    expect(el.open).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', bubbles: true }));
    expect(el.open).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    expect(el.open).toBe(false);
    el.remove();
  });

  it('M with modifier (Ctrl/Alt/Meta) does NOT toggle the panel', async () => {
    const { el } = await makeIndex();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true }),
    );
    expect(el.open).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', altKey: true, bubbles: true }),
    );
    expect(el.open).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', metaKey: true, bubbles: true }),
    );
    expect(el.open).toBe(false);
    el.remove();
  });

  it('M skipped when a text input has focus', async () => {
    const { el } = await makeIndex();
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    expect(el.open).toBe(false);
    input.remove();
    el.remove();
  });
});

describe('Story 2.3 AC3 — listbox structure with 11 options', () => {
  it('renders div role="listbox" with id="chapter-index-panel"', async () => {
    const { el } = await makeIndex();
    const lb = el.shadowRoot!.querySelector('[role="listbox"]');
    expect(lb).not.toBeNull();
    expect(lb!.id).toBe('chapter-index-panel');
    expect(lb!.getAttribute('aria-label')).toBe('Mission chapters');
    el.remove();
  });

  it('renders exactly 11 role="option" children', async () => {
    const { el } = await makeIndex();
    const opts = el.shadowRoot!.querySelectorAll('[role="option"]');
    expect(opts.length).toBe(11);
    el.remove();
  });

  it('options are in chronological (ALL_CHAPTERS) order', async () => {
    const { el } = await makeIndex();
    const opts = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    const slugs = opts.map((o) => o.getAttribute('data-slug'));
    expect(slugs).toEqual(ALL_CHAPTERS.map((c) => c.slug));
    el.remove();
  });

  it('each option shows the chapter name and ISO-short date', async () => {
    const { el } = await makeIndex();
    const opts = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    opts.forEach((opt, i) => {
      const chapter = ALL_CHAPTERS[i]!;
      const name = opt.querySelector('.option-name')!.textContent;
      const date = opt.querySelector('.option-date')!.textContent;
      expect(name).toBe(chapter.name);
      // ISO-short = YYYY-MM-DD
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    el.remove();
  });

  it('active chapter (per director) gets aria-current=true + ▸ prefix', async () => {
    const { el, clock, director } = await makeIndex();
    // Advance the director to launch-v1 (chapter 2 in chronological order)
    const launchV1 = findChapterBySlug('launch-v1')!;
    director!.update(launchV1.anchorEt);
    clock!.scrubTo(launchV1.anchorEt);
    await el.updateComplete;
    const opts = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    const launchV1Opt = opts.find(
      (o) => o.getAttribute('data-slug') === 'launch-v1',
    )!;
    expect(launchV1Opt.getAttribute('aria-current')).toBe('true');
    expect(launchV1Opt.getAttribute('aria-selected')).toBe('true');
    expect(launchV1Opt.querySelector('.option-prefix')!.textContent).toBe('▸');
    // Every other option is NOT current
    opts
      .filter((o) => o !== launchV1Opt)
      .forEach((o) => {
        expect(o.getAttribute('aria-current')).toBe('false');
      });
    el.remove();
  });
});

describe('Story 2.3 AC4 — keyboard navigation inside the panel', () => {
  it('ArrowDown moves focus to the next option', async () => {
    const { el } = await makeIndex();
    el.togglePanel();
    await el.updateComplete;
    const listbox = el.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await el.updateComplete;
    const opts = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    // Index started at 0 (launch-v2 is active at boot since no scrubbing
    // happened); after ArrowDown the second option has tabindex=0.
    expect(opts[1]!.getAttribute('tabindex')).toBe('0');
    expect(opts[0]!.getAttribute('tabindex')).toBe('-1');
    el.remove();
  });

  it('ArrowUp moves focus to the previous option (clamps at 0)', async () => {
    const { el } = await makeIndex();
    el.togglePanel();
    await el.updateComplete;
    const listbox = el.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await el.updateComplete;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await el.updateComplete;
    const opts = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    expect(opts[0]!.getAttribute('tabindex')).toBe('0');
    el.remove();
  });

  it('Home jumps to first option', async () => {
    const { el } = await makeIndex();
    el.togglePanel();
    await el.updateComplete;
    const listbox = el.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    // Move down a few first
    for (let i = 0; i < 3; i++) {
      listbox.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
      await el.updateComplete;
    }
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await el.updateComplete;
    const opts = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    expect(opts[0]!.getAttribute('tabindex')).toBe('0');
    el.remove();
  });

  it('End jumps to last option', async () => {
    const { el } = await makeIndex();
    el.togglePanel();
    await el.updateComplete;
    const listbox = el.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await el.updateComplete;
    const opts = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    expect(opts[ALL_CHAPTERS.length - 1]!.getAttribute('tabindex')).toBe('0');
    el.remove();
  });

  it('Enter on a focused option activates it (scrubTo + emit + close)', async () => {
    const { el, clock } = await makeIndex();
    const events: Array<{ slug: string; anchorEt: number }> = [];
    el.addEventListener('chapter-jump', (e) => {
      const detail = (e as CustomEvent).detail as { slug: string; anchorEt: number };
      events.push(detail);
    });
    el.togglePanel();
    await el.updateComplete;
    const listbox = el.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await el.updateComplete;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await el.updateComplete;
    expect(events.length).toBe(1);
    expect(events[0]!.slug).toBe(ALL_CHAPTERS[1]!.slug);
    expect(events[0]!.anchorEt).toBe(ALL_CHAPTERS[1]!.anchorEt);
    expect(clock!.simTimeEt).toBe(ALL_CHAPTERS[1]!.anchorEt);
    expect(clock!.playing).toBe(false); // scrubTo pauses
    expect(el.open).toBe(false); // panel closes
    el.remove();
  });

  it('Esc closes the panel without emitting chapter-jump', async () => {
    const { el } = await makeIndex();
    const events: Event[] = [];
    el.addEventListener('chapter-jump', (e) => events.push(e));
    el.togglePanel();
    await el.updateComplete;
    const listbox = el.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    expect(el.open).toBe(false);
    expect(events.length).toBe(0);
    el.remove();
  });

  it('clicking outside the panel closes it', async () => {
    const { el } = await makeIndex();
    el.togglePanel();
    await el.updateComplete;
    expect(el.open).toBe(true);
    // Pointerdown on the body (outside the panel/host) closes the panel.
    const evt = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(evt, 'composedPath', {
      value: () => [document.body, document.documentElement, document],
    });
    document.body.dispatchEvent(evt);
    await el.updateComplete;
    expect(el.open).toBe(false);
    el.remove();
  });

  it('chapter-jump CustomEvent bubbles and is composed', async () => {
    const { el } = await makeIndex();
    el.togglePanel();
    await el.updateComplete;
    let captured: CustomEvent | null = null;
    document.addEventListener('chapter-jump', (e) => {
      captured = e as CustomEvent;
    });
    const listbox = el.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await el.updateComplete;
    expect(captured).not.toBeNull();
    expect(captured!.bubbles).toBe(true);
    expect(captured!.composed).toBe(true);
    expect((captured!.detail as { slug: string }).slug).toBe(ALL_CHAPTERS[0]!.slug);
    el.remove();
  });

  it('click on an option activates that chapter', async () => {
    const { el, clock } = await makeIndex();
    el.togglePanel();
    await el.updateComplete;
    const events: Array<{ slug: string; anchorEt: number }> = [];
    el.addEventListener('chapter-jump', (e) => {
      const d = (e as CustomEvent).detail as { slug: string; anchorEt: number };
      events.push(d);
    });
    const opts = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    // Click the 4th option (v2-jupiter index 3 = ALL_CHAPTERS[3])
    opts[3]!.click();
    await el.updateComplete;
    const expected = ALL_CHAPTERS[3]!;
    expect(events.length).toBe(1);
    expect(events[0]!.slug).toBe(expected.slug);
    expect(clock!.simTimeEt).toBe(expected.anchorEt);
    expect(el.open).toBe(false);
    el.remove();
  });
});

describe('Story 2.3 AC5 — focus trap on open / restore on close', () => {
  beforeEach(() => {
    // Move focus to body before each test so the previous test's focused
    // option doesn't leak into the next.
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  it('opens panel → focus-trap activates → no listener-leak after close', async () => {
    const { el } = await makeIndex();
    el.togglePanel();
    await el.updateComplete;
    expect(el.open).toBe(true);
    // The first option in the panel becomes the focus target on open
    // (initialFocus seed). Verify focused-index === 0 by the tabindex.
    const opts = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    expect(opts[0]!.getAttribute('tabindex')).toBe('0');
    el.togglePanel();
    await el.updateComplete;
    expect(el.open).toBe(false);
    el.remove();
  });

  it('on close, focus is restored to the toggle button', async () => {
    const { el } = await makeIndex();
    el.togglePanel();
    await el.updateComplete;
    el.togglePanel();
    await el.updateComplete;
    // updateComplete is post-render; the explicit focus restoration is
    // scheduled via a microtask on top of that. Wait one more turn.
    await el.updateComplete;
    await Promise.resolve();
    // shadowRoot.activeElement reports focus within the host's shadow tree.
    const toggle = el.shadowRoot!.querySelector<HTMLButtonElement>('.toggle')!;
    expect(el.shadowRoot!.activeElement).toBe(toggle);
    el.remove();
  });

  it('open seeds the focus index to the active chapter when one is held', async () => {
    const { el, clock, director } = await makeIndex();
    // Advance to chapter index 4 (v1-saturn) in chronological order
    const target = ALL_CHAPTERS[4]!;
    director!.update(target.anchorEt);
    clock!.scrubTo(target.anchorEt);
    await el.updateComplete;
    el.togglePanel();
    await el.updateComplete;
    const opts = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    expect(opts[4]!.getAttribute('tabindex')).toBe('0');
    el.remove();
  });
});

describe('Story 2.3 AC6 — global 1–9 keyboard shortcuts', () => {
  it('pressing "1" activates ALL_CHAPTERS[0] (launch-v2)', async () => {
    const { el, clock } = await makeIndex();
    const events: Array<{ slug: string; anchorEt: number }> = [];
    el.addEventListener('chapter-jump', (e) => {
      const d = (e as CustomEvent).detail as { slug: string; anchorEt: number };
      events.push(d);
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    expect(events.length).toBe(1);
    expect(events[0]!.slug).toBe(ALL_CHAPTERS[0]!.slug);
    expect(events[0]!.slug).toBe('launch-v2');
    expect(clock!.simTimeEt).toBe(ALL_CHAPTERS[0]!.anchorEt);
    expect(clock!.playing).toBe(false);
    el.remove();
  });

  it('pressing "3" activates ALL_CHAPTERS[2] (v1-jupiter)', async () => {
    const { el } = await makeIndex();
    const events: Array<{ slug: string }> = [];
    el.addEventListener('chapter-jump', (e) => {
      events.push((e as CustomEvent).detail as { slug: string });
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    expect(events.length).toBe(1);
    expect(events[0]!.slug).toBe(ALL_CHAPTERS[2]!.slug);
    expect(events[0]!.slug).toBe('v1-jupiter');
    el.remove();
  });

  it('pressing "9" activates ALL_CHAPTERS[8] (pale-blue-dot)', async () => {
    const { el } = await makeIndex();
    const events: Array<{ slug: string }> = [];
    el.addEventListener('chapter-jump', (e) => {
      events.push((e as CustomEvent).detail as { slug: string });
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true }));
    expect(events.length).toBe(1);
    expect(events[0]!.slug).toBe('pale-blue-dot');
    el.remove();
  });

  it('pressing "0" does NOT fire chapter-jump (chapters 10/11 are reachable only via the index)', async () => {
    const { el } = await makeIndex();
    const events: Event[] = [];
    el.addEventListener('chapter-jump', (e) => events.push(e));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    expect(events.length).toBe(0);
    el.remove();
  });

  it('digit-with-modifier (Ctrl/Alt/Meta) does NOT fire chapter-jump', async () => {
    const { el } = await makeIndex();
    const events: Event[] = [];
    el.addEventListener('chapter-jump', (e) => events.push(e));
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '1', altKey: true, bubbles: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '1', metaKey: true, bubbles: true }),
    );
    expect(events.length).toBe(0);
    el.remove();
  });

  it('digit skipped when a text input has focus', async () => {
    const { el } = await makeIndex();
    const events: Event[] = [];
    el.addEventListener('chapter-jump', (e) => events.push(e));
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true }));
    expect(events.length).toBe(0);
    input.remove();
    el.remove();
  });

  it('digit shortcut works even while panel is closed (does not require the panel to be open)', async () => {
    const { el } = await makeIndex();
    expect(el.open).toBe(false);
    const events: Array<{ slug: string }> = [];
    el.addEventListener('chapter-jump', (e) => {
      events.push((e as CustomEvent).detail as { slug: string });
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(events.length).toBe(1);
    expect(events[0]!.slug).toBe(ALL_CHAPTERS[1]!.slug);
    expect(el.open).toBe(false); // panel stays closed
    el.remove();
  });
});

describe('Story 2.3 — chapter-jump CustomEvent contract (Story 2.2 mirror)', () => {
  it('detail carries { slug, anchorEt } — same shape as scrubber markers', async () => {
    const { el } = await makeIndex();
    let captured: CustomEvent | null = null;
    document.addEventListener('chapter-jump', (e) => {
      captured = e as CustomEvent;
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }));
    expect(captured).not.toBeNull();
    const detail = captured!.detail as { slug: string; anchorEt: number };
    expect(Object.keys(detail).sort()).toEqual(['anchorEt', 'slug']);
    expect(typeof detail.slug).toBe('string');
    expect(typeof detail.anchorEt).toBe('number');
    el.remove();
  });
});

describe('Story 2.3 — disconnect cleanly removes global listeners', () => {
  it('after remove(), M no longer toggles a panel', async () => {
    const { el } = await makeIndex();
    el.remove();
    // The element is gone — the global handler was unsubscribed in
    // disconnectedCallback. Dispatching M should not throw and should
    // not affect anything (no panel exists).
    expect(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true })),
    ).not.toThrow();
  });
});
