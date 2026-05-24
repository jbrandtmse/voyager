// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';

import { VChapterCopy } from './v-chapter-copy';
import { ChapterDirector } from '../services/chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../chapters/registry';
import {
  V1_HELIOPAUSE_COPY,
  V2_HELIOPAUSE_COPY,
} from '../data/heliopause-copy';
import type { ChapterSpec } from '../types/chapter';

const requireChapter = (slug: string): ChapterSpec => {
  const c = findChapterBySlug(slug);
  if (c === null) throw new Error(`unknown slug ${slug}`);
  return c;
};

const mount = async (
  opts: { wireDirector?: boolean; seedEt?: number } = {},
): Promise<{ el: VChapterCopy; director: ChapterDirector | null }> => {
  const wireDirector = opts.wireDirector ?? true;
  const director = wireDirector ? new ChapterDirector(ALL_CHAPTERS) : null;
  const el = document.createElement('v-chapter-copy') as VChapterCopy;
  if (director !== null) {
    el.chapterDirector = director;
    if (opts.seedEt !== undefined) director.update(opts.seedEt);
  }
  document.body.appendChild(el);
  await el.updateComplete;
  return { el, director };
};

afterEach(() => {
  document.querySelectorAll('v-chapter-copy').forEach((el) => el.remove());
});

describe('Story 2.9 AC1 — <v-chapter-copy> registration', () => {
  it('extends LitElement (Light DOM, not BaseElement)', () => {
    // BaseElement uses Shadow DOM. v-chapter-copy renders Light DOM by
    // returning `this` from createRenderRoot. Verify by checking that
    // createRenderRoot is overridden to return the element itself.
    const el = document.createElement('v-chapter-copy') as VChapterCopy;
    const root = (
      el as unknown as { createRenderRoot(): HTMLElement }
    ).createRenderRoot();
    expect(root).toBe(el);
  });

  it('is registered as the custom element <v-chapter-copy>', () => {
    expect(customElements.get('v-chapter-copy')).toBe(VChapterCopy);
  });
});

describe('Story 2.9 AC1 — initial state (no held chapter)', () => {
  it('renders an empty article when no chapter is held', async () => {
    const { el } = await mount();
    const article = el.querySelector<HTMLElement>('article.v-chapter-copy');
    expect(article).not.toBeNull();
    expect(article?.getAttribute('data-active')).toBe('false');
    expect(article?.querySelector('h2')).toBeNull();
    expect(el.displayedSlug).toBeNull();
    el.remove();
  });

  it('renders aria-hidden empty article when chapter director is unwired', async () => {
    const { el } = await mount({ wireDirector: false });
    const article = el.querySelector<HTMLElement>('article.v-chapter-copy');
    expect(article?.getAttribute('aria-hidden')).toBe('true');
    el.remove();
  });
});

describe('Story 2.9 AC1 — V1 heliopause copy appears when held', () => {
  it('shows V1 copy when director enters v1-heliopause held state', async () => {
    const v1h = requireChapter('v1-heliopause');
    const { el, director } = await mount();
    expect(director).not.toBeNull();

    // Drive the director into the V1 heliopause window.
    director!.update(v1h.anchorEt);
    await el.updateComplete;

    const article = el.querySelector<HTMLElement>('article.v-chapter-copy');
    expect(article?.getAttribute('data-active')).toBe('true');
    expect(article?.getAttribute('data-slug')).toBe('v1-heliopause');
    expect(el.displayedSlug).toBe('v1-heliopause');

    const lede = el.querySelector<HTMLElement>('.v-chapter-copy-lede');
    expect(lede?.textContent).toBe(V1_HELIOPAUSE_COPY.lede);

    const paragraphs = el.querySelectorAll<HTMLElement>(
      '.v-chapter-copy-paragraph',
    );
    expect(paragraphs.length).toBe(V1_HELIOPAUSE_COPY.paragraphs.length);
    el.remove();
  });

  it('shows V2 copy when director enters v2-heliopause held state', async () => {
    const v2h = requireChapter('v2-heliopause');
    const { el, director } = await mount();
    director!.update(v2h.anchorEt);
    await el.updateComplete;
    expect(el.displayedSlug).toBe('v2-heliopause');
    const lede = el.querySelector<HTMLElement>('.v-chapter-copy-lede');
    expect(lede?.textContent).toBe(V2_HELIOPAUSE_COPY.lede);
    el.remove();
  });
});

describe('Story 2.9 AC1 — copy clears on exit', () => {
  it('clears copy when exiting the V1 heliopause window forward', async () => {
    const v1h = requireChapter('v1-heliopause');
    const { el, director } = await mount();
    director!.update(v1h.anchorEt);
    await el.updateComplete;
    expect(el.displayedSlug).toBe('v1-heliopause');

    // Scrub forward past the window.
    director!.update(v1h.windowEndEt + 1);
    await el.updateComplete;

    const article = el.querySelector<HTMLElement>('article.v-chapter-copy');
    expect(article?.getAttribute('data-active')).toBe('false');
    expect(el.displayedSlug).toBeNull();
    el.remove();
  });

  it('clears copy when scrubbing reverse out of the window', async () => {
    const v2h = requireChapter('v2-heliopause');
    const { el, director } = await mount();
    director!.update(v2h.anchorEt);
    await el.updateComplete;
    expect(el.displayedSlug).toBe('v2-heliopause');

    // Reverse-scrub before the window.
    director!.update(v2h.windowStartEt - 1);
    await el.updateComplete;
    expect(el.displayedSlug).toBeNull();
    el.remove();
  });
});

describe('Story 4.5 AC5 — V1J encounter copy renders when held', () => {
  it('renders V1J copy (lede + body) when director enters v1-jupiter held state', async () => {
    const v1j = requireChapter('v1-jupiter');
    expect(v1j.copy).toBeDefined();
    const { el, director } = await mount();
    director!.update(v1j.anchorEt);
    await el.updateComplete;

    const article = el.querySelector<HTMLElement>('article.v-chapter-copy');
    expect(article?.getAttribute('data-active')).toBe('true');
    expect(article?.getAttribute('data-slug')).toBe('v1-jupiter');
    expect(el.displayedSlug).toBe('v1-jupiter');

    const lede = el.querySelector<HTMLElement>('.v-chapter-copy-lede');
    expect(lede?.textContent).toBe(v1j.copy!.lede);

    // Encounter copy is a single body string rendered as one <p>.
    const paragraphs = el.querySelectorAll<HTMLElement>(
      '.v-chapter-copy-paragraph',
    );
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0].textContent).toBe(v1j.copy!.body);
    el.remove();
  });

  it('clears V1J copy when scrubbing past windowEnd', async () => {
    const v1j = requireChapter('v1-jupiter');
    const { el, director } = await mount();
    director!.update(v1j.anchorEt);
    await el.updateComplete;
    expect(el.displayedSlug).toBe('v1-jupiter');

    director!.update(v1j.windowEndEt + 1);
    await el.updateComplete;
    expect(el.displayedSlug).toBeNull();
    el.remove();
  });
});

describe('Story 2.9 / 4.5 AC5 — non-copy chapters ignored', () => {
  it('DOES render copy for pale-blue-dot (Story 5.1 — PBD copy landed)', async () => {
    // Amended in place per Rule 5 (Story 5.1 landed the PBD chapter
    // copy via the dedicated module's re-exported ChapterSpec — the
    // V1J pattern). The test's pre-Story-5.1 wording asserted that
    // Epic 5 was deferred; Story 5.1 IS the Epic 5 landing, so the
    // assertion flips: PBD MUST now render its copy block when held.
    const pbd = requireChapter('pale-blue-dot');
    const { el, director } = await mount();
    director!.update(pbd.anchorEt);
    await el.updateComplete;
    expect(el.displayedSlug).toBe('pale-blue-dot');
    el.remove();
  });

  it('does NOT render copy for launch-v1 (no copy field on cruise/launch chapters)', async () => {
    const launchV1 = requireChapter('launch-v1');
    const { el, director } = await mount();
    director!.update(launchV1.anchorEt);
    await el.updateComplete;
    expect(el.displayedSlug).toBeNull();
    el.remove();
  });
});

describe('Story 2.9 AC1 — late-mount seeding', () => {
  it('seeds from director.activeChapter on connectedCallback', async () => {
    // The simulation has already entered the V1 heliopause window before
    // <v-chapter-copy> mounts. Without the seed path, the panel would
    // remain empty until the user scrubbed back out and in again.
    const v1h = requireChapter('v1-heliopause');
    const director = new ChapterDirector(ALL_CHAPTERS);
    director.update(v1h.anchorEt);
    expect(director.activeChapter?.slug).toBe('v1-heliopause');

    const el = document.createElement('v-chapter-copy') as VChapterCopy;
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.displayedSlug).toBe('v1-heliopause');
    el.remove();
  });

  it('seeds V1J encounter copy on connectedCallback (Story 4.5 — late-mount path)', async () => {
    const v1j = requireChapter('v1-jupiter');
    const director = new ChapterDirector(ALL_CHAPTERS);
    director.update(v1j.anchorEt);
    expect(director.activeChapter?.slug).toBe('v1-jupiter');

    const el = document.createElement('v-chapter-copy') as VChapterCopy;
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;

    // V1J now carries its own copy block; the seed path must surface it.
    expect(el.displayedSlug).toBe('v1-jupiter');
    el.remove();
  });

  it('clears if director.activeChapter is a copy-less chapter at mount time', async () => {
    // Amended in place per Rule 5 — pre-Story-5.1 the test used PBD as
    // the "copy-less chapter" sentinel. Story 5.1 populated PBD copy
    // via the dedicated module's re-exported ChapterSpec, so a
    // copy-less chapter is now any of the launch / cruise / heliopause
    // chapters. We pick launch-v1 since launches are the only
    // remaining `copy === undefined` chapters in ALL_CHAPTERS post-
    // Story 5.1 (heliopauses have their copy stitched through
    // heliopause-copy.ts).
    const launchV1 = requireChapter('launch-v1');
    const director = new ChapterDirector(ALL_CHAPTERS);
    director.update(launchV1.anchorEt);
    expect(director.activeChapter?.slug).toBe('launch-v1');

    const el = document.createElement('v-chapter-copy') as VChapterCopy;
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.displayedSlug).toBeNull();
    el.remove();
  });
});

describe('Story 2.9 AC1 — director swap + disconnect', () => {
  it('swapping the chapter director unsubscribes from the old one', async () => {
    const { el, director: a } = await mount();
    const b = new ChapterDirector(ALL_CHAPTERS);
    el.chapterDirector = b;

    // Driving the OLD director should NOT mutate the component.
    const v1h = requireChapter('v1-heliopause');
    a!.update(v1h.anchorEt);
    await el.updateComplete;
    expect(el.displayedSlug).toBeNull();

    // Driving the NEW director SHOULD.
    b.update(v1h.anchorEt);
    await el.updateComplete;
    expect(el.displayedSlug).toBe('v1-heliopause');
    el.remove();
  });

  it('disconnecting the element clears the subscription', async () => {
    const v1h = requireChapter('v1-heliopause');
    const { el, director } = await mount();
    el.remove();
    // Director should fire transitions without throwing or mutating the
    // detached element.
    director!.update(v1h.anchorEt);
    expect(el.displayedSlug).toBeNull();
  });
});
