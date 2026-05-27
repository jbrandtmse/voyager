// @vitest-environment happy-dom
/**
 * Story 6.2 AC4 — `<v-chapter-copy>` bottom-sheet drawer at narrow
 * viewports (< 1024 px) + short-viewport collision fix.
 *
 * Covers:
 *   - Default wide-viewport layout: no drawer behavior; right-side
 *     panel layout from Story 4.5 preserved.
 *   - narrowViewport=true reflects data-narrow on host.
 *   - data-drawer attribute reflects current state (collapsed | partial
 *     | full).
 *   - Default drawer state is 'partial' (lede + 2 body lines).
 *   - cycleDrawerState() cycles collapsed → partial → full → collapsed.
 *   - ArrowUp expands; ArrowDown collapses.
 *   - Enter on grab-handle toggles between partial and full.
 *   - Grab-handle is rendered only at narrow viewport.
 *   - Existing aria-live="polite" announcement contract preserved.
 *   - Lit Light DOM render path unchanged.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/components/v-chapter-copy';
import { VChapterCopy } from '../src/components/v-chapter-copy';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS } from '../src/chapters/registry';

const mountChapterCopy = async (): Promise<VChapterCopy> => {
  const el = document.createElement('v-chapter-copy') as VChapterCopy;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<v-chapter-copy> AC4 — default wide-viewport layout', () => {
  it('narrowViewport=false by default (happy-dom 1024×768 viewport)', async () => {
    const el = await mountChapterCopy();
    expect(el.narrowViewport).toBe(false);
    expect(el.hasAttribute('data-narrow')).toBe(false);
  });

  it('no drawer grab-handle renders at wide viewports', async () => {
    const el = await mountChapterCopy();
    expect(el.querySelector('.v-chapter-copy-drawer-handle')).toBeNull();
  });

  it('default drawerState is "partial" (the AC4-mandated lede + 2 lines)', async () => {
    const el = await mountChapterCopy();
    expect(el.drawerState).toBe('partial');
  });
});

describe('<v-chapter-copy> AC4 — narrow-viewport bottom-sheet drawer', () => {
  it('narrowViewport=true reflects data-narrow on host', async () => {
    const el = await mountChapterCopy();
    el.narrowViewport = true;
    await el.updateComplete;
    expect(el.hasAttribute('data-narrow')).toBe(true);
  });

  it('drawerState reflects as data-drawer attribute', async () => {
    const el = await mountChapterCopy();
    el.drawerState = 'collapsed';
    await el.updateComplete;
    expect(el.getAttribute('data-drawer')).toBe('collapsed');
    el.drawerState = 'partial';
    await el.updateComplete;
    expect(el.getAttribute('data-drawer')).toBe('partial');
    el.drawerState = 'full';
    await el.updateComplete;
    expect(el.getAttribute('data-drawer')).toBe('full');
  });

  it('grab-handle renders when narrowViewport=true and there is active copy', async () => {
    const el = await mountChapterCopy();
    const director = new ChapterDirector(ALL_CHAPTERS);
    el.chapterDirector = director;
    // Seed an active chapter with copy so the article renders.
    const v1Heliopause = ALL_CHAPTERS.find((c) => c.slug === 'v1-heliopause')!;
    director.update(v1Heliopause.anchorEt);
    el.narrowViewport = true;
    await el.updateComplete;
    const handle = el.querySelector('.v-chapter-copy-drawer-handle');
    expect(handle).not.toBeNull();
    expect(handle!.tagName).toBe('BUTTON');
    expect(handle!.getAttribute('aria-label')).toBe(
      'Adjust chapter detail drawer',
    );
  });

  it('grab-handle does NOT render at wide viewports', async () => {
    const el = await mountChapterCopy();
    const director = new ChapterDirector(ALL_CHAPTERS);
    el.chapterDirector = director;
    const v1Heliopause = ALL_CHAPTERS.find((c) => c.slug === 'v1-heliopause')!;
    director.update(v1Heliopause.anchorEt);
    el.narrowViewport = false;
    await el.updateComplete;
    expect(el.querySelector('.v-chapter-copy-drawer-handle')).toBeNull();
  });
});

describe('<v-chapter-copy> AC4 — drawer state cycling', () => {
  it('cycleDrawerState walks collapsed → partial → full → collapsed', async () => {
    const el = await mountChapterCopy();
    el.drawerState = 'collapsed';
    el.cycleDrawerState();
    expect(el.drawerState).toBe('partial');
    el.cycleDrawerState();
    expect(el.drawerState).toBe('full');
    el.cycleDrawerState();
    expect(el.drawerState).toBe('collapsed');
  });

  it('expandDrawer steps up (collapsed → partial → full); no-op at full', async () => {
    const el = await mountChapterCopy();
    el.drawerState = 'collapsed';
    el.expandDrawer();
    expect(el.drawerState).toBe('partial');
    el.expandDrawer();
    expect(el.drawerState).toBe('full');
    el.expandDrawer();
    expect(el.drawerState).toBe('full');
  });

  it('collapseDrawer steps down (full → partial → collapsed); no-op at collapsed', async () => {
    const el = await mountChapterCopy();
    el.drawerState = 'full';
    el.collapseDrawer();
    expect(el.drawerState).toBe('partial');
    el.collapseDrawer();
    expect(el.drawerState).toBe('collapsed');
    el.collapseDrawer();
    expect(el.drawerState).toBe('collapsed');
  });
});

describe('<v-chapter-copy> AC4 — keyboard handling on grab-handle', () => {
  const seedHandleEl = async (): Promise<{
    el: VChapterCopy;
    handle: HTMLButtonElement;
  }> => {
    const el = await mountChapterCopy();
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

  it('ArrowUp expands the drawer', async () => {
    const { el, handle } = await seedHandleEl();
    el.drawerState = 'collapsed';
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(el.drawerState).toBe('partial');
  });

  it('ArrowDown collapses the drawer', async () => {
    const { el, handle } = await seedHandleEl();
    el.drawerState = 'full';
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(el.drawerState).toBe('partial');
  });

  it('Enter toggles between partial and full', async () => {
    const { el, handle } = await seedHandleEl();
    el.drawerState = 'partial';
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(el.drawerState).toBe('full');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(el.drawerState).toBe('partial');
  });

  it('clicking the grab-handle cycles state', async () => {
    const { el, handle } = await seedHandleEl();
    el.drawerState = 'collapsed';
    handle.click();
    expect(el.drawerState).toBe('partial');
  });
});

describe('<v-chapter-copy> AC4 — aria-live + accessibility', () => {
  it('aria-live="polite" preserved on the article element', async () => {
    const el = await mountChapterCopy();
    const director = new ChapterDirector(ALL_CHAPTERS);
    el.chapterDirector = director;
    const v1Heliopause = ALL_CHAPTERS.find((c) => c.slug === 'v1-heliopause')!;
    director.update(v1Heliopause.anchorEt);
    await el.updateComplete;
    const article = el.querySelector('article.v-chapter-copy');
    expect(article).not.toBeNull();
    expect(article!.getAttribute('aria-live')).toBe('polite');
  });

  it('grab-handle aria-expanded reflects "full" drawer state', async () => {
    const el = await mountChapterCopy();
    const director = new ChapterDirector(ALL_CHAPTERS);
    el.chapterDirector = director;
    const v1Heliopause = ALL_CHAPTERS.find((c) => c.slug === 'v1-heliopause')!;
    director.update(v1Heliopause.anchorEt);
    el.narrowViewport = true;
    el.drawerState = 'full';
    await el.updateComplete;
    const handle = el.querySelector(
      '.v-chapter-copy-drawer-handle',
    ) as HTMLButtonElement;
    expect(handle.getAttribute('aria-expanded')).toBe('true');
    el.drawerState = 'partial';
    await el.updateComplete;
    expect(handle.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('<v-chapter-copy> Rule 10 — reactive property accessors', () => {
  it('narrowViewport + drawerState are reactive accessors on prototype', () => {
    const narrowDesc = Object.getOwnPropertyDescriptor(
      VChapterCopy.prototype,
      'narrowViewport',
    );
    expect(narrowDesc).toBeDefined();
    expect(narrowDesc!.get).toBeTypeOf('function');
    expect(narrowDesc!.set).toBeTypeOf('function');
    const drawerDesc = Object.getOwnPropertyDescriptor(
      VChapterCopy.prototype,
      'drawerState',
    );
    expect(drawerDesc).toBeDefined();
    expect(drawerDesc!.get).toBeTypeOf('function');
    expect(drawerDesc!.set).toBeTypeOf('function');
  });
});
