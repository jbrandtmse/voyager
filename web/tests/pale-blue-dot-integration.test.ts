// @vitest-environment happy-dom
/**
 * Story 5.1 AC6(d) + AC6(e) + Integration AC8 — PBD module integration
 * with ChapterDirector + `<v-chapter-copy>` + main.ts subscribe pathway.
 *
 * Per Rule 1 (Integration AC) Story 5.1 introduces a new chapter module
 * that wires into the existing ChapterDirector + chapter-copy + main.ts
 * stack via Path A (subscriber-driven activation). This file is the
 * consumer-side verification that:
 *
 *   (a) the PBD module's `update(currentEt)` fires ONLY when the
 *       chapter is in `held` state (the Path A subscriber contract);
 *   (b) navigating to `/c/pale-blue-dot` cold-load resolves the PBD
 *       chapter spec via `ALL_CHAPTERS`;
 *   (c) the `<v-chapter-copy>` panel renders the PBD prose when the
 *       chapter is `held`.
 *
 * Per Rule 6 + Epic 4 retro Action #6, integration tests should exercise
 * the production wire-up. We construct real ChapterDirector + real
 * ALL_CHAPTERS + real `<v-chapter-copy>` + real `PaleBlueDot` module.
 * The PBD module needs no positions / EphemerisService at Story 5.1
 * (Story 5.2 / 5.3 will).
 */

import { describe, it, expect, afterEach } from 'vitest';

import { startFirstPaint } from '../src/boot/first-paint';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import {
  PaleBlueDot,
  PBD_SPEC,
} from '../src/chapters/pale-blue-dot';
import { PbdSubstate, PBD_ANCHOR_ET } from '../src/chapters/pale-blue-dot/substates';
import type { VChapterCopy } from '../src/components/v-chapter-copy';
import type { ChapterTransitionEvent, ChapterSpec } from '../src/types/chapter';

const SECONDS_PER_DAY = 86_400;

const requireChapter = (slug: string): ChapterSpec => {
  const c = findChapterBySlug(slug);
  if (c === null) throw new Error(`unknown slug ${slug}`);
  return c;
};

const cleanup = (): void => {
  document.body.innerHTML = '';
};

afterEach(cleanup);

describe('Story 5.1 AC1 — PBD module registered through ALL_CHAPTERS', () => {
  it('ALL_CHAPTERS contains a chapter with slug "pale-blue-dot"', () => {
    const pbd = ALL_CHAPTERS.find((c) => c.slug === 'pale-blue-dot');
    expect(pbd).toBeDefined();
  });

  it('the chapter resolved via ALL_CHAPTERS is the PBD_SPEC object identity', () => {
    const pbd = ALL_CHAPTERS.find((c) => c.slug === 'pale-blue-dot');
    expect(pbd).toBe(PBD_SPEC);
  });

  it('findChapterBySlug("pale-blue-dot") resolves through the existing registry path', () => {
    const pbd = findChapterBySlug('pale-blue-dot');
    expect(pbd).toBe(PBD_SPEC);
  });

  it('PBD is the 9th chapter in chronological order (1-indexed)', () => {
    // The mission scrubber + chapter index render in chronological
    // order; AC5 confirms the digit-shortcut alignment.
    const pbdIndex = ALL_CHAPTERS.findIndex((c) => c.slug === 'pale-blue-dot');
    expect(pbdIndex).toBe(8); // 0-indexed → 9th chronologically.
  });
});

describe('Story 5.1 AC3 + AC6(d) — Path A subscriber activates PBD module on held', () => {
  it('module update fires ONLY while chapter is in held state', () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const pbd = new PaleBlueDot();

    // Mirror main.ts Path A wiring.
    let active = false;
    director.subscribe((event: ChapterTransitionEvent) => {
      if (event.chapter.slug !== 'pale-blue-dot') return;
      if (event.to === 'held') {
        active = true;
      } else if (event.from === 'held') {
        active = false;
      }
    });

    const tick = (et: number): void => {
      director.update(et);
      if (active) {
        pbd.update(et);
      }
    };

    // Cold-load far before PBD — module never updated.
    tick(PBD_ANCHOR_ET - 30 * SECONDS_PER_DAY);
    expect(pbd.currentSubstate).toBe(PbdSubstate.idle);

    // Enter the PBD window — module activates and begins tracking.
    tick(PBD_ANCHOR_ET);
    expect(pbd.currentSubstate).toBe(PbdSubstate.turning);

    // Exit the PBD window — module deactivates; substate stays at the
    // last value tracked (it does NOT receive further updates while
    // inactive, which is the Path A contract).
    tick(PBD_ANCHOR_ET + 2 * SECONDS_PER_DAY);
    // Module's last update was when active === true at the time of
    // the `exiting` transition; since the subscriber sets active=false
    // BEFORE the tick's update call, the post-exit tick does not run.
    // The module's last observed substate stays at whatever the last
    // active-tick computed (turning, from the prior tick).
    expect(pbd.currentSubstate).toBe(PbdSubstate.turning);
  });

  it('module update does NOT fire outside the PBD window even when the director fires other chapter transitions', () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const pbd = new PaleBlueDot();

    let active = false;
    director.subscribe((event: ChapterTransitionEvent) => {
      if (event.chapter.slug !== 'pale-blue-dot') return;
      if (event.to === 'held') {
        active = true;
      } else if (event.from === 'held') {
        active = false;
      }
    });

    const tick = (et: number): void => {
      director.update(et);
      if (active) {
        pbd.update(et);
      }
    };

    // Walk through V1J (different chapter) — PBD module never advances.
    const v1j = requireChapter('v1-jupiter');
    tick(v1j.anchorEt);
    expect(active).toBe(false);
    expect(pbd.currentSubstate).toBe(PbdSubstate.idle);
  });

  it('module activates on reverse-scrub re-entry to the PBD window', () => {
    // Per ChapterDirector reverse semantics: passed → exiting → held
    // when ET decreases back into the window. The Path A subscriber
    // should re-activate the module.
    const director = new ChapterDirector(ALL_CHAPTERS);
    const pbd = new PaleBlueDot();

    let active = false;
    director.subscribe((event: ChapterTransitionEvent) => {
      if (event.chapter.slug !== 'pale-blue-dot') return;
      if (event.to === 'held') {
        active = true;
      } else if (event.from === 'held') {
        active = false;
      }
    });

    // Forward past PBD.
    director.update(PBD_ANCHOR_ET + 2 * SECONDS_PER_DAY);
    expect(active).toBe(false);

    // Reverse back into PBD window.
    director.update(PBD_ANCHOR_ET);
    expect(active).toBe(true);
  });
});

describe('Story 5.1 AC4 + AC6(e) — `<v-chapter-copy>` renders PBD prose at held', () => {
  it('cold-loading at the PBD anchor ET shows the PBD copy via <v-chapter-copy>', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(host, {
      clockManager: clock,
      chapterDirector: director,
    });

    clock.scrubTo(PBD_ANCHOR_ET);
    director.update(clock.simTimeEt);
    await handle.chapterCopy!.updateComplete;

    expect(handle.chapterCopy!.displayedSlug).toBe('pale-blue-dot');
    const lede = handle.chapterCopy!.querySelector('.v-chapter-copy-lede');
    expect(lede?.textContent).toBe('Pale Blue Dot.');
    const paragraphs = handle.chapterCopy!.querySelectorAll(
      '.v-chapter-copy-paragraph',
    );
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0]?.textContent).toMatch(/1990/);

    handle.dispose();
  });

  it('mounts <v-chapter-copy> even in embed mode (editorial content per Story 2.9 / Story 2.5 chrome-skip pattern)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(host, {
      clockManager: clock,
      chapterDirector: director,
      embedEnabled: true,
    });

    clock.scrubTo(PBD_ANCHOR_ET);
    director.update(clock.simTimeEt);
    await handle.chapterCopy!.updateComplete;

    expect(handle.chapterCopy).not.toBeNull();
    expect(handle.chapterCopy!.displayedSlug).toBe('pale-blue-dot');
    handle.dispose();
  });

  it('scrubbing OUT of the PBD window clears the chapter-copy panel', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(host, {
      clockManager: clock,
      chapterDirector: director,
    });

    // First enter PBD.
    clock.scrubTo(PBD_ANCHOR_ET);
    director.update(clock.simTimeEt);
    await handle.chapterCopy!.updateComplete;
    expect(handle.chapterCopy!.displayedSlug).toBe('pale-blue-dot');

    // Now scrub well past the window (5 days after — past the +1d
    // windowEndEt).
    clock.scrubTo(PBD_ANCHOR_ET + 5 * SECONDS_PER_DAY);
    director.update(clock.simTimeEt);
    await handle.chapterCopy!.updateComplete;
    expect(handle.chapterCopy!.displayedSlug).toBeNull();

    handle.dispose();
  });
});

describe('Story 5.1 AC7 — main.ts publishes paleBlueDot on the DEV debug surface', () => {
  it('main.ts source references __voyagerDebug.paleBlueDot', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const mainSrc = readFileSync(
      resolve(__dirname, '..', 'src', 'main.ts'),
      'utf-8',
    );
    // The DEV debug accessor exposes the PaleBlueDot instance under
    // the `paleBlueDot` key (Story 5.1 AC7); the lead's Chrome
    // DevTools MCP smoke uses this to read `currentSubstate`.
    expect(mainSrc).toContain('paleBlueDot');
  });

  it('main.ts source references the PaleBlueDot Path A subscriber wiring', async () => {
    // Source-grep defense per Rule 11 pattern (build-pipeline E2E) —
    // future refactors that drop the subscriber wiring would break the
    // PBD module's activation; this test fails fast if main.ts no
    // longer constructs PaleBlueDot.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const mainSrc = readFileSync(
      resolve(__dirname, '..', 'src', 'main.ts'),
      'utf-8',
    );
    expect(mainSrc).toContain('new PaleBlueDot()');
    expect(mainSrc).toContain("event.chapter.slug !== 'pale-blue-dot'");
  });

  it('__voyagerDebug.paleBlueDot publish lives inside an import.meta.env.DEV gate (stripped from production builds)', async () => {
    // Mirrors the `viewFrame` DEV-gate defense at
    // `main-ts-boot-ordering-defense.test.ts:156`. The accessor MUST be
    // dead-code-eliminated from production builds via Vite's
    // `import.meta.env.DEV` constant folding (per Story 5.1 AC7 + the
    // canonical Story 2.1 pattern at main.ts:231-246). A future refactor
    // that drops the DEV gate would silently ship an extra ~5 KB module
    // + the entire PaleBlueDot class into production bundles AND violate
    // ADR-0015's "no global store" discipline (the DEV accessor is the
    // ONLY permitted window-side handle).
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const mainSrc = readFileSync(
      resolve(__dirname, '..', 'src', 'main.ts'),
      'utf-8',
    );
    // Locate the `paleBlueDot,` publish line (the value spread into
    // `__voyagerDebug`). It must follow at least one `import.meta.env.DEV`
    // gate token in source order.
    const debugPublishMatch = mainSrc.match(/__voyagerDebug[\s\S]{0,400}paleBlueDot/);
    expect(debugPublishMatch, '__voyagerDebug.paleBlueDot publish must exist').not.toBeNull();
    const publishIdx = mainSrc.indexOf('paleBlueDot,');
    expect(publishIdx, 'publish line `paleBlueDot,` must exist').toBeGreaterThan(0);
    // Walk backwards from the publish line to find the nearest
    // `import.meta.env.DEV` token; it must be present in the preceding
    // ~300 characters (the DEV gate block).
    const slice = mainSrc.slice(Math.max(0, publishIdx - 400), publishIdx);
    expect(
      slice,
      '__voyagerDebug.paleBlueDot publish must be inside an import.meta.env.DEV gate so it is stripped from production builds',
    ).toMatch(/import\.meta\.env\.DEV/);
  });
});
