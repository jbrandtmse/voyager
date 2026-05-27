// @vitest-environment happy-dom
/**
 * Story 6.2 AC4 — extended keyboard-navigation coverage for the
 * `<v-chapter-copy>` bottom-sheet drawer grab-handle.
 *
 * The per-component test (`v-chapter-copy-drawer.test.ts`) covers the
 * primary keystrokes (ArrowUp/ArrowDown/Enter/click). The parent QA
 * prompt flagged the following keyboard-nav edges:
 *
 *   Gap 4a — repeated ArrowUp from collapsed → partial → full → no-op.
 *   Gap 4b — repeated ArrowDown from full → partial → collapsed → no-op.
 *   Gap 4c — ArrowUp / ArrowDown preventDefault is honored (prevents
 *     page scroll consumption).
 *   Gap 4d — non-arrow keys (Home, End, PageUp, PageDown, Tab) do NOT
 *     mutate drawerState (handler only owns ArrowUp/ArrowDown/Enter).
 *   Gap 4e — Esc keydown on the grab-handle does NOT toggle drawer
 *     (Esc is reserved for overlay-close elsewhere).
 *   Gap 4f — Space key does NOT mutate (only Enter toggles per
 *     subtask 3.4); ensures we honour the AC's "Enter toggles between
 *     partial and full" rather than the default `<button>` Space-as-
 *     activator semantic.
 *   Gap 4g — keydown on a NON-handle element does NOT propagate to
 *     the drawer state machine (the handler is bound to the grab-handle
 *     only, not the article).
 *   Gap 4h — reduced-motion AC: drawer state mutates immediately under
 *     synthetic media-query — we can't assert opacity-transition
 *     instantly, but we assert the property mutates synchronously
 *     after the keydown.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/components/v-chapter-copy';
import { VChapterCopy } from '../src/components/v-chapter-copy';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS } from '../src/chapters/registry';

const seedHandle = async (): Promise<{
  el: VChapterCopy;
  handle: HTMLButtonElement;
}> => {
  const el = document.createElement('v-chapter-copy') as VChapterCopy;
  document.body.appendChild(el);
  await el.updateComplete;
  const director = new ChapterDirector(ALL_CHAPTERS);
  el.chapterDirector = director;
  const v1Heliopause = ALL_CHAPTERS.find((c) => c.slug === 'v1-heliopause')!;
  director.update(v1Heliopause.anchorEt);
  el.narrowViewport = true;
  await el.updateComplete;
  const handle = el.querySelector(
    '.v-chapter-copy-drawer-handle',
  ) as HTMLButtonElement;
  return { el, handle };
};

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Story 6.2 AC4 — drawer keyboard navigation (repeated keys)', () => {
  it('ArrowUp from collapsed → partial → full → full (no-op past full)', async () => {
    const { el, handle } = await seedHandle();
    el.drawerState = 'collapsed';
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(el.drawerState).toBe('partial');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(el.drawerState).toBe('full');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(el.drawerState).toBe('full');
  });

  it('ArrowDown from full → partial → collapsed → collapsed (no-op past collapsed)', async () => {
    const { el, handle } = await seedHandle();
    el.drawerState = 'full';
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(el.drawerState).toBe('partial');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(el.drawerState).toBe('collapsed');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(el.drawerState).toBe('collapsed');
  });
});

describe('Story 6.2 AC4 — drawer keyboard preventDefault', () => {
  it('ArrowUp keydown is preventDefault-ed when handled', async () => {
    const { el, handle } = await seedHandle();
    el.drawerState = 'collapsed';
    const ev = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    handle.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('ArrowDown keydown is preventDefault-ed when handled', async () => {
    const { el, handle } = await seedHandle();
    el.drawerState = 'full';
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    handle.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Enter keydown is preventDefault-ed when handled', async () => {
    const { el, handle } = await seedHandle();
    el.drawerState = 'partial';
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    handle.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe('Story 6.2 AC4 — drawer keyboard non-arrow keys are no-ops', () => {
  const keysThatShouldNotMutate = ['Home', 'End', 'PageUp', 'PageDown', 'Tab', 'Escape', ' '];

  for (const key of keysThatShouldNotMutate) {
    it(`'${key}' does NOT mutate drawerState (only ArrowUp/ArrowDown/Enter own this surface)`, async () => {
      const { el, handle } = await seedHandle();
      el.drawerState = 'partial';
      handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      expect(el.drawerState).toBe('partial');
    });
  }
});

describe('Story 6.2 AC4 — drawer keyboard handler scope (handle-only)', () => {
  it('keydown on the article (not the handle) does NOT mutate state', async () => {
    const { el } = await seedHandle();
    el.drawerState = 'partial';
    const article = el.querySelector('article.v-chapter-copy') as HTMLElement;
    expect(article).not.toBeNull();
    // Dispatch ArrowUp directly on the article — the handler is bound
    // to the handle button, so this should NOT mutate.
    article.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(el.drawerState).toBe('partial');
  });

  it('keydown on the body bubbles up but does NOT mutate (handler scoped to handle)', async () => {
    const { el } = await seedHandle();
    el.drawerState = 'partial';
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(el.drawerState).toBe('partial');
  });
});

describe('Story 6.2 AC4 — drawer state mutation is synchronous (reduced-motion contract)', () => {
  it('drawerState reflects to data-drawer attribute synchronously on next microtask', async () => {
    const { el, handle } = await seedHandle();
    el.drawerState = 'collapsed';
    await el.updateComplete;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(el.drawerState).toBe('partial');
    await el.updateComplete;
    expect(el.getAttribute('data-drawer')).toBe('partial');
  });
});

describe('Story 6.2 AC4 — Enter toggle semantics (partial ↔ full only)', () => {
  it('Enter from collapsed → full (collapsed !== "full", so condition jumps to full)', async () => {
    const { el, handle } = await seedHandle();
    el.drawerState = 'collapsed';
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // The handler: `drawerState === 'full' ? 'partial' : 'full'` — so
    // collapsed transitions to full (one keystroke = expand to full).
    expect(el.drawerState).toBe('full');
  });

  it('Enter cycles partial → full → partial → full', async () => {
    const { el, handle } = await seedHandle();
    el.drawerState = 'partial';
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(el.drawerState).toBe('full');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(el.drawerState).toBe('partial');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(el.drawerState).toBe('full');
  });
});

describe('Story 6.2 AC4 — grab-handle aria-expanded contract', () => {
  it('aria-expanded reflects "true" only when drawerState is "full"', async () => {
    const { el, handle } = await seedHandle();
    el.drawerState = 'collapsed';
    await el.updateComplete;
    let h = el.querySelector('.v-chapter-copy-drawer-handle') as HTMLButtonElement;
    expect(h.getAttribute('aria-expanded')).toBe('false');
    el.drawerState = 'partial';
    await el.updateComplete;
    h = el.querySelector('.v-chapter-copy-drawer-handle') as HTMLButtonElement;
    expect(h.getAttribute('aria-expanded')).toBe('false');
    el.drawerState = 'full';
    await el.updateComplete;
    h = el.querySelector('.v-chapter-copy-drawer-handle') as HTMLButtonElement;
    expect(h.getAttribute('aria-expanded')).toBe('true');
    // Mark unused 'handle' var as referenced.
    void handle;
  });
});
