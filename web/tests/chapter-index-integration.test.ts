// @vitest-environment happy-dom
/**
 * Story 2.3 QA — `<v-chapter-index>` × real ChapterDirector × real
 * ClockManager × real ALL_CHAPTERS cross-cutting integration tests.
 *
 * The dev-authored `v-chapter-index.test.ts` exercises the component
 * against ad-hoc `ChapterDirector` + `ClockManager` instances created
 * inline. Those tests are correct for the component's per-AC unit
 * surface, but they bypass three of the contracts Rules 2/3 + Integration
 * AC8 make load-bearing for Story 2.3:
 *
 *   1. The real `startFirstPaint({ clockManager, chapterDirector })`
 *      composition — the chapter index, scrubber, play button, speed
 *      multiplier and HUD share ONE clock + ONE director. We must
 *      verify the chapter-index is pre-mount bound (clockManager AND
 *      chapterDirector set BEFORE appendChild) so its connectedCallback
 *      both subscribes to the director and installs the global keyboard
 *      handler in the same tick the element mounts.
 *
 *   2. End-to-end shortcut → clock → director propagation. Pressing
 *      `3` on the document body must (a) seek the REAL ClockManager to
 *      `v1-jupiter`'s anchor, (b) leave the clock paused (scrubTo
 *      semantic), and (c) drive the REAL ChapterDirector to surface
 *      `v1-jupiter` as the held chapter on the next per-frame update —
 *      which then propagates back to the chapter-index via its director
 *      subscription as `aria-current="true"` on the matching option.
 *      The dev unit tests stop at step (a); steps (b)+(c) are the
 *      consumer-side integration we own.
 *
 *   3. Subscription/listener cleanup on disconnect — Integration AC8 +
 *      voyager-skill-rules Rule 7 imply a guarantee that removing the
 *      element from the DOM unsubscribes the chapter-index from the
 *      director AND uninstalls the global `M` / `1`-`9` keyboard
 *      handler. Leaks here are silent in unit tests but compound when
 *      multiple test files spawn + dispose chapter-indexes in sequence.
 *
 *   4. Keydown isolation orthogonal to the shadow-DOM input walk — the
 *      dev tests cover the surface-level "focus a top-level <input>"
 *      path; we exercise the SHADOW-ROOT walk (an `<input>` rendered
 *      inside a Lit component) and Space-key non-interference (the
 *      play-button's Space shortcut must coexist with the chapter
 *      index's M / digit shortcuts without either swallowing the other).
 *
 *   5. CustomEvent payload contract symmetry with Story 2.2 — both
 *      sources (scrubber marker click AND chapter-index digit shortcut)
 *      MUST emit `chapter-jump` with `{ slug, anchorEt }`, bubbles and
 *      composed, so Story 2.4's URL router can subscribe ONCE at
 *      document level. We assert the shape from the chapter index via
 *      `startFirstPaint`, with `document.addEventListener` (the same
 *      listener the URL router will use).
 *
 *   6. `main.ts` wire-up shape — the lead's Chrome DevTools MCP smoke
 *      reads `window.__voyagerDebug.chapterIndex` to drive Integration
 *      AC8. Pin the DEV-only debug-surface assignment AND the
 *      first-paint.ts pre-mount-binding lines so a future refactor
 *      can't silently drop them.
 *
 * The lead-executed Chrome DevTools MCP smoke (Integration AC8 — see the
 * "Chrome DevTools MCP smoke" stage at the bottom of this file) remains
 * the binding browser-evidence gate per voyager-skill-rules Rule 3 +
 * Rule 7. These Vitest tests are the consumer-side tier verifying the
 * WIRE-UP shape and the DOM contract that the smoke stage reads.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { startFirstPaint } from '../src/boot/first-paint';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import type { VChapterIndex } from '../src/components/v-chapter-index';

const webRoot = resolve(__dirname, '..');
const mainTsSrc = readFileSync(resolve(webRoot, 'src/main.ts'), 'utf-8');
const firstPaintSrc = readFileSync(
  resolve(webRoot, 'src/boot/first-paint.ts'),
  'utf-8',
);

const cleanupBody = (): void => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
};

describe('Story 2.3 QA — first-paint wires the chapter index to ClockManager + ChapterDirector', () => {
  beforeEach(cleanupBody);
  afterEach(cleanupBody);

  it('startFirstPaint exposes a chapterIndex handle wired with the same clock + director the scrubber consumes', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    await handle.chapterIndex.updateComplete;
    expect(handle.chapterIndex).toBeTruthy();
    // SAME instance — not a fresh ClockManager/ChapterDirector constructed
    // internally. The single-source-of-truth invariant from architecture
    // line 78 (clock) + Rule 2 (consumer-side wire-up).
    expect(handle.chapterIndex.clockManager).toBe(clockManager);
    expect(handle.chapterIndex.chapterDirector).toBe(director);
    expect(handle.chapterIndex.clockManager).toBe(handle.scrubber.clockManager);
    expect(handle.chapterIndex.chapterDirector).toBe(
      handle.scrubber.chapterDirector,
    );
  });

  it('chapter-index subscribes to the director on the same tick it mounts (pre-mount binding)', () => {
    // If the chapterDirector were set AFTER appendChild, the chapter-
    // transition subscription would not exist on first render. Verify the
    // subscription is already live by counting subscribers immediately
    // post-startFirstPaint. Both the scrubber AND the chapter index
    // subscribe during connectedCallback, so we expect >= 2 calls.
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const subscribeSpy = vi.spyOn(director, 'subscribe');
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    expect(subscribeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('mounts the chapter index hidden until title-card completes (visibility = "hidden")', () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    // The chrome chrome (scrubber + play button + speed multiplier + HUD +
    // chapter index) is hidden until the title-card dispatches
    // voyager:title-card-complete — verify the visibility shape.
    expect(handle.chapterIndex.style.visibility).toBe('hidden');
    // Once the title-card-complete event fires, visibility clears.
    handle.titleCard.dispatchEvent(
      new CustomEvent('voyager:title-card-complete'),
    );
    expect(handle.chapterIndex.style.visibility).toBe('');
  });

  it('omitting chapterDirector leaves chapterIndex.chapterDirector null (scrubber-equivalent fallback)', () => {
    const clockManager = new ClockManager();
    const handle = startFirstPaint(document.body, { clockManager });
    expect(handle.chapterIndex.chapterDirector).toBeNull();
    // Clock is still wired (chapter index needs it to scrubTo even when
    // no director is wired).
    expect(handle.chapterIndex.clockManager).toBe(clockManager);
  });
});

describe('Story 2.3 QA — global digit shortcut → real ClockManager → real ChapterDirector propagation', () => {
  beforeEach(cleanupBody);
  afterEach(cleanupBody);

  it('pressing "3" lands ClockManager.simTimeEt on v1-jupiter anchor and pauses the clock', async () => {
    const clockManager = new ClockManager();
    clockManager.play(); // start playing so we can observe scrubTo's pause side-effect
    expect(clockManager.playing).toBe(true);
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    await handle.chapterIndex.updateComplete;
    const v1Jupiter = findChapterBySlug('v1-jupiter');
    if (v1Jupiter === null) throw new Error('expected v1-jupiter in registry');
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', bubbles: true }),
    );
    expect(clockManager.simTimeEt).toBe(v1Jupiter.anchorEt);
    // scrubTo pauses — that's the canonical contract per ClockManager docs.
    expect(clockManager.playing).toBe(false);
  });

  it('after the digit shortcut, the director sees the new ET and surfaces v1-jupiter as activeChapter', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    await handle.chapterIndex.updateComplete;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', bubbles: true }),
    );
    // Drive the director the same way main.ts's engine.onFrame does —
    // it reads clockManager.simTimeEt each frame and calls
    // director.update(et). The clock just moved to v1-jupiter's anchor.
    director.update(clockManager.simTimeEt);
    expect(director.activeChapter?.slug).toBe('v1-jupiter');
  });

  it('after digit + director.update, the chapter-index aria-current treatment moves to the new chapter', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    await handle.chapterIndex.updateComplete;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', bubbles: true }),
    );
    director.update(clockManager.simTimeEt);
    await handle.chapterIndex.updateComplete;
    const opts = Array.from(
      handle.chapterIndex.shadowRoot!.querySelectorAll<HTMLElement>(
        '[role="option"]',
      ),
    );
    const current = opts.filter(
      (o) => o.getAttribute('aria-current') === 'true',
    );
    expect(current.length).toBe(1);
    expect(current[0]!.getAttribute('data-slug')).toBe('v1-jupiter');
  });

  it('chapter-jump CustomEvent from the digit shortcut bubbles past the host and is composed (Story 2.4 router contract)', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    await handle.chapterIndex.updateComplete;
    let docDetail: { slug: string; anchorEt: number } | null = null;
    let captured: CustomEvent | null = null;
    document.addEventListener('chapter-jump', (e) => {
      captured = e as CustomEvent;
      docDetail = (captured as CustomEvent<{ slug: string; anchorEt: number }>)
        .detail;
    });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '7', bubbles: true }),
    );
    expect(docDetail).not.toBeNull();
    const safeCaptured = captured as CustomEvent | null;
    expect(safeCaptured).not.toBeNull();
    if (safeCaptured !== null) {
      expect(safeCaptured.bubbles).toBe(true);
      expect(safeCaptured.composed).toBe(true);
    }
    if (docDetail !== null) {
      const d = docDetail as { slug: string; anchorEt: number };
      expect(d.slug).toBe(ALL_CHAPTERS[6]!.slug);
      expect(d.anchorEt).toBe(ALL_CHAPTERS[6]!.anchorEt);
      // Resolves through the registry — same cross-check Story 2.2 makes
      // for scrubber-emitted events.
      const chapter = findChapterBySlug(d.slug);
      expect(chapter).not.toBeNull();
      expect(chapter!.anchorEt).toBe(d.anchorEt);
    }
  });

  it('chapter-jump payload shape is IDENTICAL to Story 2.2 scrubber marker emissions', async () => {
    // Both sources must speak the same CustomEvent shape so Story 2.4's
    // URL router can listen ONCE at the document level. The Story 2.2
    // contract is { slug: string, anchorEt: number }, bubbles + composed.
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    await handle.chapterIndex.updateComplete;

    const indexPayloads: Array<{ slug: string; anchorEt: number }> = [];
    document.addEventListener('chapter-jump', (e) => {
      indexPayloads.push(
        (e as CustomEvent<{ slug: string; anchorEt: number }>).detail,
      );
    });
    // Fire every digit 1-9; every emission must carry the schema.
    for (let n = 1; n <= 9; n++) {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: String(n), bubbles: true }),
      );
    }
    expect(indexPayloads.length).toBe(9);
    for (let i = 0; i < indexPayloads.length; i++) {
      const p = indexPayloads[i]!;
      expect(Object.keys(p).sort()).toEqual(['anchorEt', 'slug']);
      expect(typeof p.slug).toBe('string');
      expect(p.slug.length).toBeGreaterThan(0);
      expect(Number.isFinite(p.anchorEt)).toBe(true);
      expect(p.slug).toBe(ALL_CHAPTERS[i]!.slug);
      expect(p.anchorEt).toBe(ALL_CHAPTERS[i]!.anchorEt);
    }
  });
});

describe('Story 2.3 QA — Enter on focused option propagates to clock + director (end-to-end Listbox path)', () => {
  beforeEach(cleanupBody);
  afterEach(cleanupBody);

  it('opening the panel + Enter on the seeded option lands the clock at that chapter and the director surfaces it', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    const index = handle.chapterIndex as VChapterIndex;
    await index.updateComplete;
    // Open the panel — focusedIndex seeds to the active chapter, which at
    // boot (no scrubbing has happened) is launch-v2 (index 0).
    index.togglePanel();
    await index.updateComplete;
    expect(index.open).toBe(true);
    const listbox = index.shadowRoot!.querySelector<HTMLElement>(
      '[role="listbox"]',
    )!;
    // Move focus to the 5th option (v1-saturn = index 4) and Enter.
    for (let i = 0; i < 4; i++) {
      listbox.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
      await index.updateComplete;
    }
    listbox.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await index.updateComplete;
    const v1Saturn = ALL_CHAPTERS[4]!;
    expect(v1Saturn.slug).toBe('v1-saturn');
    expect(clockManager.simTimeEt).toBe(v1Saturn.anchorEt);
    expect(clockManager.playing).toBe(false);
    expect(index.open).toBe(false);
    // Drive the director the way the engine.onFrame would.
    director.update(clockManager.simTimeEt);
    expect(director.activeChapter?.slug).toBe('v1-saturn');
  });

  it('option-click activation hits the same code path and lands at the chapter anchor (no race-induced drift)', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    const index = handle.chapterIndex;
    await index.updateComplete;
    index.togglePanel();
    await index.updateComplete;
    const opts = Array.from(
      index.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    // Click v2-neptune (index 7).
    const target = ALL_CHAPTERS[7]!;
    expect(target.slug).toBe('v2-neptune');
    opts[7]!.click();
    await index.updateComplete;
    expect(clockManager.simTimeEt).toBe(target.anchorEt);
    expect(index.open).toBe(false);
    director.update(clockManager.simTimeEt);
    expect(director.activeChapter?.slug).toBe('v2-neptune');
  });
});

describe('Story 2.3 QA — keydown isolation: text-input + Space-key coexistence', () => {
  beforeEach(cleanupBody);
  afterEach(cleanupBody);

  it('digit pressed while a Lit-shadow-rooted <input> has focus is suppressed (shadow-root walk)', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    const index = handle.chapterIndex;
    await index.updateComplete;
    // Mount a host with its OWN shadow root that hosts an <input>. This
    // mirrors the Lit pattern used elsewhere in the app — the chapter
    // index's isTextInputFocused() must walk the shadow root to spot the
    // input (top-level activeElement is the host, not the input).
    const host = document.createElement('div');
    host.attachShadow({ mode: 'open' });
    const innerInput = document.createElement('input');
    innerInput.type = 'text';
    host.shadowRoot!.appendChild(innerInput);
    document.body.appendChild(host);
    innerInput.focus();

    const bootEt = clockManager.simTimeEt;
    let captured = 0;
    document.addEventListener('chapter-jump', () => {
      captured++;
    });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '5', bubbles: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', bubbles: true }),
    );
    expect(captured).toBe(0);
    // startFirstPaint seeds the clock to MISSION_START_ET via scrubTo,
    // so "unchanged" means equal to the boot ET — not literal zero.
    expect(clockManager.simTimeEt).toBe(bootEt);
    expect(index.open).toBe(false); // M didn't toggle
    host.remove();
  });

  it('M with Ctrl/Alt/Meta modifier does NOT toggle the panel (modifier guard)', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    const index = handle.chapterIndex;
    await index.updateComplete;
    // Ctrl+M historically opens a browser menu in Firefox — the chapter
    // index must NOT shadow that interaction by toggling its panel.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'M', metaKey: true, bubbles: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', altKey: true, bubbles: true }),
    );
    expect(index.open).toBe(false);
  });

  it('Space-key (play/pause) coexists with M / digit shortcuts — neither swallows the other', async () => {
    // Story 1.10's installKeyboardShortcuts owns Space; Story 2.3's
    // installGlobalShortcuts owns M + 1-9. Both attach to document. Verify
    // they don't cross-contaminate: pressing Space toggles play, NOT the
    // chapter panel; pressing M toggles the panel, NOT play.
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    const index = handle.chapterIndex;
    await index.updateComplete;
    expect(clockManager.playing).toBe(false);
    expect(index.open).toBe(false);

    // Space → toggles play, NOT the panel.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }),
    );
    expect(clockManager.playing).toBe(true);
    expect(index.open).toBe(false);

    // M → toggles the panel, NOT play.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', bubbles: true }),
    );
    expect(index.open).toBe(true);
    expect(clockManager.playing).toBe(true); // unchanged

    // Esc inside the listbox closes the panel WITHOUT toggling play.
    const listbox = index.shadowRoot!.querySelector<HTMLElement>(
      '[role="listbox"]',
    )!;
    listbox.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await index.updateComplete;
    expect(index.open).toBe(false);
    expect(clockManager.playing).toBe(true);
  });

  it('"0" digit is intentionally inert — chapters 10 and 11 reachable only via the index or markers', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    await handle.chapterIndex.updateComplete;
    const bootEt = clockManager.simTimeEt;
    let emissions = 0;
    document.addEventListener('chapter-jump', () => {
      emissions++;
    });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '0', bubbles: true }),
    );
    expect(emissions).toBe(0);
    expect(clockManager.simTimeEt).toBe(bootEt); // unchanged from boot
  });
});

describe('Story 2.3 QA — disconnect cleanly removes subscription + global listeners (leak guard)', () => {
  beforeEach(cleanupBody);
  afterEach(cleanupBody);

  it('removing the chapter index unsubscribes from the director (no callback after remove)', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    const index = handle.chapterIndex;
    await index.updateComplete;
    // Spy on requestUpdate — the only side-effect the chapter index has on
    // director-fired transitions. If the unsubscribe leaks, advancing the
    // director to a new chapter would call requestUpdate on the removed
    // element.
    const spy = vi.spyOn(index, 'requestUpdate');
    index.remove();
    spy.mockClear();
    // Now drive a director transition. The removed element MUST NOT see it.
    const v1Saturn = findChapterBySlug('v1-saturn')!;
    director.update(v1Saturn.anchorEt);
    expect(spy).not.toHaveBeenCalled();
  });

  it('removing the chapter index uninstalls the global M/digit listeners (no toggle after remove)', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    const index = handle.chapterIndex;
    await index.updateComplete;
    index.remove();
    // Capture clock state BEFORE the post-remove keydown — if the global
    // digit shortcut leaked, it would scrub the clock to ALL_CHAPTERS[2].
    const beforeEt = clockManager.simTimeEt;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', bubbles: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', bubbles: true }),
    );
    expect(clockManager.simTimeEt).toBe(beforeEt);
  });

  it('removing closes the panel as a side effect (no orphaned focus-trap or click-outside listener)', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    const index = handle.chapterIndex;
    await index.updateComplete;
    index.togglePanel();
    await index.updateComplete;
    expect(index.open).toBe(true);
    // Now remove — disconnectedCallback closes the panel (restoreFocus:false)
    // so any document-level pointerdown listener installed by openPanel is
    // detached, and the focus-trap is deactivated.
    index.remove();
    expect(index.open).toBe(false);
    // A subsequent pointerdown anywhere must NOT throw (no orphan listener).
    expect(() => {
      const evt = new Event('pointerdown', { bubbles: true });
      Object.defineProperty(evt, 'composedPath', {
        value: () => [document.body, document.documentElement, document],
      });
      document.body.dispatchEvent(evt);
    }).not.toThrow();
  });

  it('two startFirstPaint instances in sequence (mount → remove → mount) do not double-fire digit shortcuts', async () => {
    // Regression guard: if disconnectedCallback failed to remove the global
    // keydown listener from the first instance, a single digit press after
    // the second mount would fire chapter-jump twice. Pin once-per-press.
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle1 = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    await handle1.chapterIndex.updateComplete;
    document.body.innerHTML = ''; // tears down both mounted elements
    const handle2 = startFirstPaint(document.body, {
      clockManager,
      chapterDirector: director,
    });
    await handle2.chapterIndex.updateComplete;
    let emissions = 0;
    document.addEventListener('chapter-jump', () => {
      emissions++;
    });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '1', bubbles: true }),
    );
    expect(emissions).toBe(1);
  });
});

describe('Story 2.3 QA — first-paint.ts + main.ts wire-up shape (static-source check)', () => {
  // Mirrors the Story 2.1 / 2.2 main wire-up pattern. Pin the load-bearing
  // chapter-index lines so a future refactor cannot silently drop them
  // (the substring checks fail before the lead's MCP smoke would).

  it('first-paint.ts imports and types the chapter index', () => {
    expect(firstPaintSrc).toMatch(/import\s+['"]\.\.\/components\/v-chapter-index['"]/);
    expect(firstPaintSrc).toMatch(/chapterIndex:\s*VChapterIndex/);
  });

  it('first-paint.ts sets clockManager on the chapter index BEFORE appendChild', () => {
    // The assignment line must come before host.appendChild(chapterIndex)
    // so connectedCallback sees the wiring on the same tick the element
    // mounts. The order check guards against an accidental refactor
    // that moves the property assignment after appendChild.
    const assignIdx = firstPaintSrc.indexOf('chapterIndex.clockManager =');
    expect(assignIdx).toBeGreaterThan(-1);
    const appendAfter = firstPaintSrc.indexOf(
      'host.appendChild(chapterIndex)',
      assignIdx,
    );
    expect(appendAfter).toBeGreaterThan(assignIdx);
  });

  it('first-paint.ts sets chapterDirector on the chapter index BEFORE appendChild (when provided)', () => {
    const assignIdx = firstPaintSrc.indexOf('chapterIndex.chapterDirector =');
    expect(assignIdx).toBeGreaterThan(-1);
    const appendAfter = firstPaintSrc.indexOf(
      'host.appendChild(chapterIndex)',
      assignIdx,
    );
    expect(appendAfter).toBeGreaterThan(assignIdx);
  });

  it('first-paint.ts marks the chapter index hidden until title-card-complete clears it', () => {
    expect(firstPaintSrc).toMatch(/chapterIndex\.style\.visibility\s*=\s*['"]hidden['"]/);
    // The onComplete handler clears the visibility once the title card
    // dissolves — pin both halves of the visibility lifecycle.
    expect(firstPaintSrc).toMatch(/chapterIndex\.style\.visibility\s*=\s*['"]['"]/);
  });

  it('first-paint.ts exposes the chapter index on FirstPaintHandle', () => {
    expect(firstPaintSrc).toMatch(/chapterIndex,/);
  });

  it('main.ts exposes __voyagerDebug.chapterIndex inside the DEV gate (Integration AC8 surface)', () => {
    expect(mainTsSrc).toMatch(/import\.meta\.env\.DEV/);
    expect(mainTsSrc).toMatch(/chapterIndex:\s*firstPaintHandle\.chapterIndex/);
  });

  it('the executable __voyagerDebug.chapterIndex assignment lives inside a DEV gate', () => {
    // Strip comments so commentary doesn't false-positive.
    const stripped = mainTsSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');
    const assignIdx = stripped.indexOf('chapterIndex: firstPaintHandle');
    expect(assignIdx).toBeGreaterThan(-1);
    // Find the LAST `import.meta.env.DEV` gate BEFORE this assignment.
    const before = stripped.slice(0, assignIdx);
    expect(before.lastIndexOf('import.meta.env.DEV')).toBeGreaterThan(-1);
  });
});

/* ============================================================
 * Chrome DevTools MCP smoke — Integration AC8 (lead-executed)
 *
 * Per voyager-skill-rules Rule 3 + Rule 7, the lead drives this stage
 * with the Chrome DevTools MCP surface. The DEV-only debug surface
 * `window.__voyagerDebug.chapterIndex` (mounted by main.ts) is the
 * canonical handle — sub-agent MCP propagation is best-effort, so the
 * lead is the binding execution gate.
 *
 * Pre-flight (lead): `cd web && npm run dev` (dev server at
 * http://localhost:5173). No initScript / brotli shim needed
 * post-Story-1.16 (voyager-skill-rules Rule 6).
 *
 * Required MCP probes — one per Integration AC8 sub-clause:
 *
 *   1. mcp__chrome-devtools-mcp__navigate_page
 *      url: http://localhost:5173
 *      Purpose: open the dev server with the chapter index mounted.
 *
 *   2. mcp__chrome-devtools-mcp__evaluate_script
 *      Purpose: pre-condition the DEV surface is live and the panel
 *      starts closed.
 *      Asserts:
 *        - typeof window.__voyagerDebug?.chapterIndex !== 'undefined'
 *        - window.__voyagerDebug.chapterIndex.open === false
 *        - the toggle button has aria-expanded="false"
 *      Covers: AC1 (toggle button structure) + AC2 (closed initial state).
 *
 *   3. mcp__chrome-devtools-mcp__take_snapshot
 *      Purpose: capture the accessibility tree with the panel closed.
 *      Evidence file: 2-3-smoke-evidence/01-panel-closed-a11y.txt
 *      Asserts: toggle button exposes its aria-label + aria-controls.
 *      Covers: AC1 ARIA.
 *
 *   4. mcp__chrome-devtools-mcp__press_key  key=m
 *      OR
 *      mcp__chrome-devtools-mcp__evaluate_script
 *        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))
 *      Purpose: open the panel via global M shortcut.
 *      Follow-up evaluate_script asserts:
 *        - window.__voyagerDebug.chapterIndex.open === true
 *        - host element has data-open attribute
 *        - shadowRoot.querySelector('[role="listbox"]') is non-null
 *        - 11 [role="option"] children, slugs in ALL_CHAPTERS chronological order
 *        - option[data-slug="launch-v2"] has aria-current="true" at boot
 *      Covers: AC2 (M opens panel) + AC3 (listbox structure + 11 options).
 *
 *   5. mcp__chrome-devtools-mcp__take_screenshot
 *      Purpose: visual evidence of the slide-in panel reveal.
 *      Evidence file: 2-3-smoke-evidence/02-panel-open.png
 *      Covers: AC2 (panel slide-in visible).
 *
 *   6. mcp__chrome-devtools-mcp__take_snapshot
 *      Purpose: accessibility tree with panel open — assert listbox is
 *      announced, options carry name + date, aria-current is on the
 *      held chapter.
 *      Evidence file: 2-3-smoke-evidence/03-panel-open-a11y.txt
 *      Covers: AC3 (ARIA listbox semantics) + AC5 (focus on first option).
 *
 *   7. mcp__chrome-devtools-mcp__press_key  key=ArrowDown
 *      Followed by evaluate_script asserting:
 *        - shadowRoot.querySelectorAll('[role="option"]')[1].getAttribute('tabindex') === '0'
 *        - shadowRoot.querySelectorAll('[role="option"]')[0].getAttribute('tabindex') === '-1'
 *      Covers: AC4 (ArrowDown moves roving focus).
 *
 *   8. mcp__chrome-devtools-mcp__press_key  key=Enter
 *      Followed by evaluate_script asserting:
 *        - window.__voyagerDebug.chapterDirector.activeChapter.slug === 'launch-v1'
 *          (Story 2.1 debug surface — the director sees the new ET on the
 *          next engine.onFrame tick.)
 *        - window.__voyagerDebug.chapterIndex.open === false (panel closed)
 *      Covers: AC4 (Enter activates + closes) + Integration AC8 wire-up
 *      (Listbox → clockManager.scrubTo → ChapterDirector activates new chapter).
 *
 *   9. mcp__chrome-devtools-mcp__take_screenshot
 *      Purpose: post-activation visual — panel closed, scrubber needle on
 *      launch-v1 anchor.
 *      Evidence file: 2-3-smoke-evidence/04-after-enter-launch-v1.png
 *      Covers: Integration AC8 (end-to-end keyboard activation).
 *
 *  10. mcp__chrome-devtools-mcp__press_key  key=3
 *      Followed by evaluate_script asserting:
 *        - window.__voyagerDebug.chapterDirector.activeChapter.slug === 'v1-jupiter'
 *      Covers: AC6 (digit shortcut from document level) + Integration AC8
 *      (global shortcut → chapter activation propagates through the same
 *      clock + director instances).
 *
 *  11. mcp__chrome-devtools-mcp__list_console_messages
 *      Purpose: console-clean assertion. Acceptable: the Lit dev-mode
 *      banner ("[lit]...dev mode...") + known-allow-listed warnings
 *      (e.g. third-party trajectory/manifest warnings unrelated to
 *      Story 2.3). No new errors introduced by 2.3.
 *      Evidence file: 2-3-smoke-evidence/05-console.json
 *
 * AC traceability summary:
 *   AC1 (toggle button)        → probes 2, 3
 *   AC2 (slide-in panel)       → probes 4, 5
 *   AC3 (listbox + 11 options) → probes 4, 6
 *   AC4 (keyboard nav)         → probes 7, 8
 *   AC5 (focus trap on open)   → probe 6
 *   AC6 (global digit)         → probe 10
 *   AC7 (test suites green)    → covered by `cd web && npm test -- --run`
 *                                 (Vitest tier; this file + dev tests
 *                                 + the rest of the existing suite)
 *   Integration AC8            → probes 4, 8, 10 (the AC8 sub-clauses
 *                                 map to these explicit MCP probes)
 * ============================================================ */
