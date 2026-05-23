// @vitest-environment happy-dom
/**
 * Story 2.9 QA — heliopause text-card × marker-click × URL router cross-
 * cutting integration tests.
 *
 * The dev-authored `v-chapter-copy.test.ts` exercises the component against
 * a hand-driven ChapterDirector. This file fills the consumer-side gaps for
 * AC4 (marker click → URL update → text-card appears) and AC1 (the text-
 * card appears when the simulation enters the heliopause window via any
 * path — scrub, marker click, or cold load).
 *
 * Rule 2 (consumer-side integration AC) makes these load-bearing because
 * AC4 says "no new code needed — Story 2.2 markers + Story 2.4 URL routing
 * already fire chapter-jump → ClockManager.scrubTo → ChapterDirector →
 * `<v-chapter-copy>` reacts." That sentence is a contract; the test is the
 * binding evidence.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { startFirstPaint } from '../src/boot/first-paint';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import { V1_HELIOPAUSE_COPY, V2_HELIOPAUSE_COPY } from '../src/data/heliopause-copy';
import type { VChapterCopy } from '../src/components/v-chapter-copy';
import type { ChapterSpec } from '../src/types/chapter';

const requireChapter = (slug: string): ChapterSpec => {
  const c = findChapterBySlug(slug);
  if (c === null) throw new Error(`unknown slug ${slug}`);
  return c;
};

const cleanup = (): void => {
  document.body.innerHTML = '';
};

afterEach(cleanup);

describe('Story 2.9 AC1 + AC4 — first-paint mounts <v-chapter-copy> wired to the director', () => {
  it('startFirstPaint with a director appends a <v-chapter-copy> to the host', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(host, {
      clockManager: clock,
      chapterDirector: director,
    });

    const chapterCopy = host.querySelector<VChapterCopy>('v-chapter-copy');
    expect(chapterCopy).not.toBeNull();
    expect(handle.chapterCopy).toBe(chapterCopy);
    expect(chapterCopy?.chapterDirector).toBe(director);
    handle.dispose();
  });

  it('first-paint omits <v-chapter-copy> when no director is wired (legacy 1.9-only test path)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const clock = new ClockManager();
    const handle = startFirstPaint(host, { clockManager: clock });

    expect(host.querySelector('v-chapter-copy')).toBeNull();
    expect(handle.chapterCopy).toBeNull();
    handle.dispose();
  });

  it('mounts <v-chapter-copy> even in embed mode (editorial content, NOT chrome)', () => {
    // Story 2.5 chrome-skip pattern: chapter-index + help-overlay are
    // skipped in embed mode. Chapter-copy is editorial CONTENT, so it
    // mounts in both modes — institutional embeds still get the prose.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(host, {
      clockManager: clock,
      chapterDirector: director,
      embedEnabled: true,
    });

    expect(handle.chapterIndex).toBeNull();
    expect(handle.helpOverlay).toBeNull();
    expect(handle.chapterCopy).not.toBeNull();
    expect(host.querySelector('v-chapter-copy')).not.toBeNull();
    handle.dispose();
  });
});

describe('Story 2.9 AC4 — chapter-jump simulation → text-card appears', () => {
  it('scrubbing clock to V1H anchor + driving director shows V1 copy', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(host, {
      clockManager: clock,
      chapterDirector: director,
    });

    const v1h = requireChapter('v1-heliopause');
    clock.scrubTo(v1h.anchorEt);
    director.update(clock.simTimeEt);
    await handle.chapterCopy!.updateComplete;

    expect(handle.chapterCopy!.displayedSlug).toBe('v1-heliopause');
    const lede = handle.chapterCopy!.querySelector('.v-chapter-copy-lede');
    expect(lede?.textContent).toBe(V1_HELIOPAUSE_COPY.lede);
    handle.dispose();
  });

  it('scrubbing forward past V1H + into V2H shows V2 copy (text-cards transition)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(host, {
      clockManager: clock,
      chapterDirector: director,
    });

    const v1h = requireChapter('v1-heliopause');
    const v2h = requireChapter('v2-heliopause');

    clock.scrubTo(v1h.anchorEt);
    director.update(clock.simTimeEt);
    await handle.chapterCopy!.updateComplete;
    expect(handle.chapterCopy!.displayedSlug).toBe('v1-heliopause');

    clock.scrubTo(v2h.anchorEt);
    director.update(clock.simTimeEt);
    await handle.chapterCopy!.updateComplete;
    expect(handle.chapterCopy!.displayedSlug).toBe('v2-heliopause');
    const lede = handle.chapterCopy!.querySelector('.v-chapter-copy-lede');
    expect(lede?.textContent).toBe(V2_HELIOPAUSE_COPY.lede);
    handle.dispose();
  });

  it('scrubbing through a non-copy chapter (launch) leaves text-card empty (FR30 closed in Story 4.7: encounters now carry ChapterSpec.copy)', async () => {
    // Pre-Story-4.7 this test used V2 Neptune as the "encounter without
    // copy" sentinel; Story 4.7 closed FR30 by populating V2U + V2N copy
    // (alongside the V1J/V2J/V1S/V2S copy from Stories 4.5 + 4.6). The
    // chapters that still leave the text-card empty are the launch
    // chapters and Pale Blue Dot (the latter handled separately by Epic
    // 5). We assert that launch-v1 still leaves the panel empty —
    // preserving the test's original intent: a chapter outside both the
    // heliopause-copy.ts surface AND the ChapterSpec.copy surface
    // produces no rendered text-card.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(host, {
      clockManager: clock,
      chapterDirector: director,
    });

    const launchV1 = requireChapter('launch-v1');
    clock.scrubTo(launchV1.anchorEt);
    director.update(clock.simTimeEt);
    await handle.chapterCopy!.updateComplete;

    expect(handle.chapterCopy!.displayedSlug).toBeNull();
    // The empty article placeholder is still in the DOM (data-active=false).
    const article = handle.chapterCopy!.querySelector('article.v-chapter-copy');
    expect(article?.getAttribute('data-active')).toBe('false');
    handle.dispose();
  });
});

describe('Story 2.9 AC5 — no view-frame transition for heliopause', () => {
  it('director transitioning into v1-heliopause does NOT dispatch viewframe events', async () => {
    // Per AC5 the existing heliocentric camera framing is preserved; there
    // is no body-centered camera framing or 3D-scene change for heliopause.
    // We assert that the chapter-copy appearance is the ONLY observable
    // side-effect of the transition — no custom event named 'viewframe' or
    // similar fires off the document.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(host, {
      clockManager: clock,
      chapterDirector: director,
    });

    const observed: string[] = [];
    const probe = (e: Event): void => {
      observed.push(e.type);
    };
    document.addEventListener('viewframe', probe);
    document.addEventListener('viewframe-transition', probe);
    document.addEventListener('camera-frame-change', probe);

    const v1h = requireChapter('v1-heliopause');
    clock.scrubTo(v1h.anchorEt);
    director.update(clock.simTimeEt);
    await handle.chapterCopy!.updateComplete;

    expect(observed).toEqual([]);

    document.removeEventListener('viewframe', probe);
    document.removeEventListener('viewframe-transition', probe);
    document.removeEventListener('camera-frame-change', probe);
    handle.dispose();
  });
});

describe('Story 2.9 — main.ts publishes chapterCopy on the debug surface', () => {
  it('main.ts source references firstPaintHandle.chapterCopy in __voyagerDebug', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const mainSrc = readFileSync(
      resolve(__dirname, '..', 'src', 'main.ts'),
      'utf-8',
    );
    expect(mainSrc).toContain('chapterCopy: firstPaintHandle.chapterCopy');
  });
});
