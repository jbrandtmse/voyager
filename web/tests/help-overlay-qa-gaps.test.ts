// @vitest-environment happy-dom
/**
 * Story 2.8 — QA gap suite (cross-cutting integration coverage).
 *
 * The dev-authored test suite covers the seven primary ACs at the unit
 * tier:
 *   - `web/src/components/v-help-overlay.test.ts` (41 tests) —
 *     toggle-button structure (AC1), `?` global shortcut + modifier
 *     guards + text-input guard + embed-no-mount no-op (AC2),
 *     WAI-ARIA Dialog (Modal) structure + scrim + token-driven
 *     transitions (AC3), four-section shortcut inventory + `<kbd>`
 *     boxes + description token (AC4), focus-trap + Esc + bidirectional
 *     focus-restore (AC5), `A`-key navigation + uppercase + modifier
 *     guards + open-suppression + embed-no-mount no-op (AC6), and the
 *     disconnect/race-guard discipline (cr-2-3 microtask defence).
 *
 * This QA file fills the gaps the dev suites do not reach. The pattern
 * mirrors `web/tests/about-page-qa-gaps.test.ts` (Story 2.7) and
 * `web/tests/embed-mode-qa-gaps.test.ts` (Story 2.5):
 *
 *   1. **Full-stack first-paint composition** — the dev component test
 *      exercises `<v-help-overlay>` in isolation. The QA tier boots the
 *      FULL pipeline (real `EmbedModeState` × `URLSync` × `ClockManager`
 *      × `ChapterDirector` × `URLRouter` × `startFirstPaint`) at
 *      `/?embed=true` and `/` so the test runs against the real
 *      wire-up. This catches a future regression where one seam was
 *      updated but another was not (e.g. first-paint mounts the overlay
 *      but the FirstPaintHandle slot still reads `chapterIndex` instead
 *      of `helpOverlay`).
 *
 *   2. **ParseInitialPathResult discriminator backwards-compat** — the
 *      help overlay does not touch URLSync, but it is the third consumer
 *      of `parseInitialPath()` to arrive (after URLRouter and the
 *      Story 2.7 about-page branch). The QA tier re-pins that adding the
 *      overlay to the pipeline did not regress the existing `kind: 'home'`
 *      / `'chapter'` / `'about'` discriminator for legacy consumers.
 *
 *   3. **Modifier-key matrix for `?` and `A`** — the dev suite covers
 *      Ctrl / Alt / Meta individually for each shortcut. The QA tier
 *      adds the combinatorial cross (Shift IS allowed for `?` because
 *      Shift+/ is how a US keyboard produces `'?'`; Shift on `A` IS
 *      allowed since uppercase A is the same shortcut as lowercase),
 *      Cmd+A (which is select-all — must be preserved by NOT
 *      intercepting), and a deliberate `Shift+?` chord that some
 *      keyboard layouts will produce.
 *
 *   4. **`A` shortcut navigation chain** — the dev suite asserts the
 *      navigate callback receives `/about`. The QA tier verifies that
 *      assertion across the three boot routes the overlay attaches to:
 *      `/` (home), `/c/<slug>` (chapter), and asserts the overlay's
 *      embed-mode no-op contract at the cold-load level for
 *      `/?embed=true` AND `/c/<slug>?embed=true`.
 *
 *   5. **Help overlay × chapter-index coexistence** — both components
 *      register document-level keydown handlers and both own a top-right
 *      toggle in non-embed mode. The QA tier pins:
 *       - `M` toggles the chapter-index, NOT the help overlay
 *       - `?` toggles the help overlay, NOT the chapter-index
 *       - `1..9` activates chapters via chapter-index, NOT the help
 *       - opening one overlay does NOT close the other (the dev author
 *         left this as a deliberate "both visible" affordance — keyboard
 *         users can press `M` then `?` and see both panels)
 *       - the two toggle buttons sit at distinct positions in the
 *         top-right (Story 2.8 dev note: 44px offset for help overlay)
 *
 *   6. **Help overlay × About-page interaction** — the about page is a
 *      separate top-level surface; main.ts's `mountAboutSurface()` does
 *      NOT call `startFirstPaint`. The QA tier pins that the help
 *      overlay is therefore wholly absent on `/about` (the `?` and `A`
 *      shortcuts are also unbound there). The complementary case is
 *      pressing `A` while the help overlay is open in the simulation
 *      surface: the dev suite asserts the suppression (no navigation);
 *      the QA tier additionally asserts the overlay stays open (Esc is
 *      the only path out).
 *
 *   7. **Disconnect cleanup at the composition tier** — the dev suite
 *      checks that removing the element clears its own listener. The QA
 *      tier checks that disposing the FULL FirstPaintHandle and then
 *      reusing the page does not leak `?`/`A` listeners — a real
 *      regression would orphan a handler that re-runs every keydown
 *      against a detached overlay.
 *
 *   8. **MCP smoke probe plan for Integration AC8** — documented at the
 *      bottom of this file. The lead-driven Chrome DevTools MCP smoke
 *      is the binding browser-evidence gate per voyager-skill-rules.md
 *      Rule 3 + Rule 6 + Rule 7.
 *
 * The `bootSimulationSurface()` helper mirrors `main.ts`'s simulation-
 * branch wire-up minus `RenderEngine`; the `bootAboutSurface()` helper
 * mirrors `main.ts`'s `mountAboutSurface()` branch. Both are taken from
 * the Story 2.7 pattern (`about-page-qa-gaps.test.ts`) so the QA tier
 * for Stories 2.7 + 2.8 share the same composition idiom.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { startFirstPaint, type FirstPaintHandle } from '../src/boot/first-paint';
import { URLSync } from '../src/services/url-sync';
import { URLRouter } from '../src/services/url-router';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { EmbedModeState } from '../src/services/embed-mode-state';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import { VHelpOverlay } from '../src/components/v-help-overlay';
// Side-effect imports — register custom elements under test.
import '../src/components/v-help-overlay';
import '../src/components/v-about-page';

/** Flush microtasks queued by URLRouter.scheduleWaveSettle. */
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/**
 * Mirror `main.ts`'s simulation-surface branch — the part that wires
 * `URLSync × ClockManager × ChapterDirector × URLRouter × startFirstPaint`
 * together at a non-about route. Returns the full handle stack so tests
 * can inspect mounted elements, dispatch events, and dispose cleanly.
 */
const bootSimulationSurface = (): {
  embedMode: EmbedModeState;
  urlSync: URLSync;
  clock: ClockManager;
  director: ChapterDirector;
  router: URLRouter;
  firstPaint: FirstPaintHandle;
  host: HTMLElement;
  dispose: () => void;
} => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const embedMode = EmbedModeState.fromSearch(window.location.search);
  const urlSync = new URLSync({ embedEnabled: embedMode.enabled });
  const initial = urlSync.parseInitialPath();
  const clock = new ClockManager();
  clock.scrubTo(initial.initialEt);
  const director = new ChapterDirector(ALL_CHAPTERS);
  director.update(clock.simTimeEt);
  const firstPaint = startFirstPaint(host, {
    clockManager: clock,
    chapterDirector: director,
    urlSync,
    embedEnabled: embedMode.enabled,
  });
  const router = new URLRouter({
    urlSync,
    clockManager: clock,
    chapterDirector: director,
  }).install();
  return {
    embedMode,
    urlSync,
    clock,
    director,
    router,
    firstPaint,
    host,
    dispose: () => {
      router.dispose();
      firstPaint.dispose();
      urlSync.dispose();
      clock.dispose();
      director.dispose();
      host.remove();
    },
  };
};

/**
 * Mirror `main.ts`'s `mountAboutSurface()` branch — mounts ONLY
 * `<v-about-page>` (no `startFirstPaint`, so no help overlay, no
 * chapter-index, no scrubber). Used by the help-overlay × about-page
 * interaction tests to verify the overlay is wholly absent on the about
 * surface.
 */
const bootAboutSurface = (): {
  urlSync: URLSync;
  host: HTMLElement;
  about: HTMLElement;
  dispose: () => void;
} => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const urlSync = new URLSync();
  const initial = urlSync.parseInitialPath();
  if (initial.kind !== 'about') {
    throw new Error(
      `bootAboutSurface() called on a non-/about URL: kind=${initial.kind}`,
    );
  }
  const about = document.createElement('v-about-page');
  host.appendChild(about);
  return {
    urlSync,
    host,
    about,
    dispose: () => {
      urlSync.dispose();
      host.remove();
    },
  };
};

beforeEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

// ─────────────────────────────────────────────────────────────────────
// 1. Full-stack first-paint composition (Integration AC8 step 1)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.8 — full first-paint composition mounts the help overlay (non-embed)', () => {
  it('boot at / mounts <v-help-overlay> as part of the simulation surface', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      expect(stack.embedMode.enabled).toBe(false);
      expect(stack.host.querySelector('v-help-overlay')).not.toBeNull();
      expect(stack.firstPaint.helpOverlay).not.toBeNull();
      // Sanity: the OTHER chrome (chapter-index) is also mounted — the
      // overlay does not compete for the same slot.
      expect(stack.host.querySelector('v-chapter-index')).not.toBeNull();
      expect(stack.firstPaint.chapterIndex).not.toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('boot at /c/<slug> mounts <v-help-overlay> (overlay is chapter-route-agnostic)', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const stack = bootSimulationSurface();
    try {
      expect(stack.embedMode.enabled).toBe(false);
      expect(stack.host.querySelector('v-help-overlay')).not.toBeNull();
      expect(stack.firstPaint.helpOverlay).not.toBeNull();
      // The active chapter was resolved correctly.
      expect(stack.director.activeChapter?.slug).toBe('v1-jupiter');
    } finally {
      stack.dispose();
    }
  });

  it('FirstPaintHandle.helpOverlay is the same VHelpOverlay instance in the DOM', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const inDom = stack.host.querySelector('v-help-overlay');
      expect(inDom).toBe(stack.firstPaint.helpOverlay);
      // And it's an instance of VHelpOverlay (not an HTMLUnknownElement).
      expect(stack.firstPaint.helpOverlay).toBeInstanceOf(VHelpOverlay);
    } finally {
      stack.dispose();
    }
  });

  it('first-paint composition does NOT write the URL at boot (cold-load is canonical)', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      await flushMicrotasks();
      expect(window.location.pathname).toBe('/');
      expect(window.location.search).toBe('');
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Embed-mode no-op composition (AC2 + AC6 cold-load)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.8 — embed-mode composition omits the help overlay entirely', () => {
  it('boot at /?embed=true does NOT mount <v-help-overlay>', () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootSimulationSurface();
    try {
      expect(stack.embedMode.enabled).toBe(true);
      expect(stack.host.querySelector('v-help-overlay')).toBeNull();
      expect(stack.firstPaint.helpOverlay).toBeNull();
      // Sanity: chapter-index is also wholly absent (Story 2.5 invariant).
      expect(stack.host.querySelector('v-chapter-index')).toBeNull();
      // Simulation surface IS present (the overlay is chrome, not content).
      expect(stack.host.querySelector('v-timeline-scrubber')).not.toBeNull();
      expect(stack.host.querySelector('v-hud')).not.toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('boot at /c/v1-jupiter?embed=true does NOT mount <v-help-overlay> either', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter?embed=true');
    const stack = bootSimulationSurface();
    try {
      expect(stack.embedMode.enabled).toBe(true);
      expect(stack.firstPaint.helpOverlay).toBeNull();
      // Chapter resolved fine; embed-mode only suppresses chrome, not content.
      expect(stack.director.activeChapter?.slug).toBe('v1-jupiter');
    } finally {
      stack.dispose();
    }
  });

  it('embed mode: pressing ? from document.body is a true no-op (no listener attached)', async () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootSimulationSurface();
    try {
      // No exception, no visible state change.
      expect(() =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: '?', bubbles: true }),
        ),
      ).not.toThrow();
      // The DOM is unchanged — no help overlay mounted at all.
      expect(document.querySelector('v-help-overlay')).toBeNull();
      // URL did not change as a side effect.
      expect(window.location.pathname).toBe('/');
      expect(window.location.search).toBe('?embed=true');
      await flushMicrotasks();
    } finally {
      stack.dispose();
    }
  });

  it('embed mode: pressing A from document.body is a true no-op (no listener attached)', async () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootSimulationSurface();
    try {
      const before = window.location.pathname;
      // No exception, no navigation. Note: location.assign would normally
      // trigger a navigation, but in happy-dom it does not throw and the
      // navigation is best-effort. The hard assertion is that NO listener
      // is attached at all (no `e.preventDefault()` call), so the
      // KeyboardEvent's defaultPrevented stays false.
      const ev = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
      document.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
      expect(window.location.pathname).toBe(before);
      await flushMicrotasks();
    } finally {
      stack.dispose();
    }
  });

  it('embed mode: no element with the help-overlay toggle exists in the document (AC1 negative)', () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootSimulationSurface();
    try {
      // Strong invariant — the overlay isn't anywhere in the DOM, so
      // the toggle button it owns is also unreachable.
      expect(document.querySelectorAll('v-help-overlay').length).toBe(0);
      // And the AC2-pattern "wholly absent (not display:none)" assertion.
      expect(
        document.querySelectorAll(
          'v-help-overlay[style*="display: none"], v-help-overlay[hidden]',
        ).length,
      ).toBe(0);
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. ParseInitialPathResult discriminator backwards-compat
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.8 — ParseInitialPathResult discriminator still works for legacy consumers', () => {
  it('cold-load / still produces kind="home" with the help overlay mounted', () => {
    window.history.replaceState(null, '', '/');
    const urlSync = new URLSync();
    const initial = urlSync.parseInitialPath();
    expect(initial.kind).toBe('home');
    expect(initial.chapter).toBeNull();
    urlSync.dispose();
  });

  it('cold-load /c/<slug> still produces kind="chapter" + non-null chapter (with help overlay mounted)', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const urlSync = new URLSync();
    const initial = urlSync.parseInitialPath();
    expect(initial.kind).toBe('chapter');
    expect(initial.chapter).not.toBeNull();
    expect(initial.chapter!.slug).toBe('v1-jupiter');
    urlSync.dispose();
  });

  it('cold-load /about still produces kind="about" (the help overlay does not regress the about discriminator)', () => {
    window.history.replaceState(null, '', '/about');
    const urlSync = new URLSync();
    const initial = urlSync.parseInitialPath();
    expect(initial.kind).toBe('about');
    expect(initial.chapter).toBeNull();
    urlSync.dispose();
  });

  it('boot at /c/v1-jupiter?t=<iso> + help overlay still resolves the same ChapterSpec instance', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter?t=1979-03-05T12:00:00Z');
    const urlSync = new URLSync();
    const initial = urlSync.parseInitialPath();
    const fromRegistry = findChapterBySlug('v1-jupiter');
    expect(initial.chapter).toBe(fromRegistry);
    expect(initial.kind).toBe('chapter');
    urlSync.dispose();
  });

  it('full-stack boot with the overlay mounted does not perturb the URL parse for /c/<slug>', () => {
    window.history.replaceState(null, '', '/c/v2-neptune');
    const stack = bootSimulationSurface();
    try {
      // The full composition booted with the overlay in the surface AND
      // the URL parse landed exactly where the legacy /c/<slug> contract
      // promises (no replaceState mutation, same ChapterSpec).
      expect(window.location.pathname).toBe('/c/v2-neptune');
      expect(stack.director.activeChapter?.slug).toBe('v2-neptune');
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Modifier-key matrix for `?` and `A`
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.8 — modifier-key matrix for `?` global shortcut', () => {
  it('plain `?` (Shift+/ implicit) toggles the overlay', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      expect(overlay.open).toBe(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      expect(overlay.open).toBe(false);
    } finally {
      stack.dispose();
    }
  });

  it('Shift+? (explicit Shift modifier) DOES toggle — Shift is the natural carrier of `?`', () => {
    // The dev impl matches `e.key === '?'` directly. Many keyboard
    // layouts emit `'?'` with shiftKey=true; the impl allows that
    // (the modifier guard only rejects ctrl/alt/meta).
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true }),
      );
      expect(overlay.open).toBe(true);
    } finally {
      stack.dispose();
    }
  });

  it('Ctrl+? does NOT toggle (must be preserved for browser shortcuts)', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '?', ctrlKey: true, bubbles: true }),
      );
      expect(overlay.open).toBe(false);
    } finally {
      stack.dispose();
    }
  });

  it('Alt+? does NOT toggle', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '?', altKey: true, bubbles: true }),
      );
      expect(overlay.open).toBe(false);
    } finally {
      stack.dispose();
    }
  });

  it('Meta+? (Cmd on Mac) does NOT toggle — preserves OS-level shortcut surface', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '?', metaKey: true, bubbles: true }),
      );
      expect(overlay.open).toBe(false);
    } finally {
      stack.dispose();
    }
  });

  it('Ctrl+Shift+? does NOT toggle (combinatorial modifier defence)', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '?',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
      expect(overlay.open).toBe(false);
    } finally {
      stack.dispose();
    }
  });

  it('Meta+Shift+? does NOT toggle (Mac combinatorial defence)', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '?',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
      expect(overlay.open).toBe(false);
    } finally {
      stack.dispose();
    }
  });
});

describe('Story 2.8 — modifier-key matrix for `A` global shortcut', () => {
  it('plain `a` (lowercase) routes to /about via the navigate callback', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay.navigate = (url) => navigations.push(url);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(navigations).toEqual(['/about']);
    } finally {
      stack.dispose();
    }
  });

  it('uppercase `A` (Shift+A) routes (Shift is allowed — uppercase A is the same shortcut)', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay.navigate = (url) => navigations.push(url);
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'A', shiftKey: true, bubbles: true }),
      );
      expect(navigations).toEqual(['/about']);
    } finally {
      stack.dispose();
    }
  });

  it('Ctrl+A (select-all) does NOT route — must be preserved for the browser', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay.navigate = (url) => navigations.push(url);
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }),
      );
      expect(navigations).toEqual([]);
    } finally {
      stack.dispose();
    }
  });

  it('Cmd+A (Mac select-all) does NOT route — must be preserved', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay.navigate = (url) => navigations.push(url);
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true }),
      );
      expect(navigations).toEqual([]);
    } finally {
      stack.dispose();
    }
  });

  it('Alt+A does NOT route (OS-level shortcut preserved)', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay.navigate = (url) => navigations.push(url);
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true }),
      );
      expect(navigations).toEqual([]);
    } finally {
      stack.dispose();
    }
  });

  it('Ctrl+Shift+A does NOT route (combinatorial defence)', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay.navigate = (url) => navigations.push(url);
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'a',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
      expect(navigations).toEqual([]);
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. `A` shortcut navigation chain — / and /c/<slug>
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.8 AC6 — `A` shortcut navigation chain across simulation routes', () => {
  it('boot at / + press A → navigate("/about") fires once', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay.navigate = (url) => navigations.push(url);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(navigations).toEqual(['/about']);
    } finally {
      stack.dispose();
    }
  });

  it('boot at /c/v1-jupiter + press A → navigate("/about") fires once', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay.navigate = (url) => navigations.push(url);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(navigations).toEqual(['/about']);
    } finally {
      stack.dispose();
    }
  });

  it('boot at /c/v2-neptune + press A → /about (target is constant, not chapter-derived)', () => {
    window.history.replaceState(null, '', '/c/v2-neptune');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay.navigate = (url) => navigations.push(url);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(navigations).toEqual(['/about']);
      // Sanity: the URL itself did not change yet — the impl delegates
      // to overlay.navigate which a test overrides. The production path
      // (window.location.assign) IS where the cross-pathname reload
      // happens; the unit-tier assertion stops at the navigate-callback
      // boundary so the test does not depend on happy-dom's
      // location.assign semantics.
      expect(window.location.pathname).toBe('/c/v2-neptune');
    } finally {
      stack.dispose();
    }
  });

  it('A from a chapter route with a hash fragment still routes to /about (no hash carry)', () => {
    // The shortcut target is the literal '/about' — no #anchor carry,
    // no preserving the current ?t=. Pinning this contract because a
    // future refactor might mistakenly forward the hash.
    window.history.replaceState(null, '', '/c/v1-jupiter#irrelevant');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay.navigate = (url) => navigations.push(url);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(navigations).toEqual(['/about']);
    } finally {
      stack.dispose();
    }
  });

  it('default navigate is window.location.assign — production path uses location.assign("/about")', () => {
    // Pin the production default. Cannot actually trigger
    // location.assign in happy-dom (it would throw a not-implemented
    // error or be a no-op depending on version), so we assert the
    // BEHAVIOUR: when a fresh overlay is constructed, calling its
    // navigate() invokes window.location.assign with the URL. We do
    // that indirectly by reading the default callback's identity via
    // a temporary spy on window.location.assign.
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const assigned: string[] = [];
      const original = window.location.assign;
      // happy-dom allows overriding location.assign with a writable
      // descriptor; defensively use Object.defineProperty so older
      // happy-dom versions cooperate.
      Object.defineProperty(window.location, 'assign', {
        configurable: true,
        writable: true,
        value: (url: string) => assigned.push(url),
      });
      try {
        // Call the default navigate (not a test override) — this is the
        // production path the `A` shortcut takes.
        overlay.navigate('/about');
        expect(assigned).toEqual(['/about']);
      } finally {
        Object.defineProperty(window.location, 'assign', {
          configurable: true,
          writable: true,
          value: original,
        });
      }
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. Help overlay × chapter-index coexistence
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.8 — help overlay coexists with chapter-index (both global shortcut owners)', () => {
  it('boot at / mounts BOTH chapter-index and help overlay', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      expect(stack.firstPaint.chapterIndex).not.toBeNull();
      expect(stack.firstPaint.helpOverlay).not.toBeNull();
      // Two distinct top-right toggles — both in the DOM, both
      // independent custom elements.
      expect(stack.host.querySelectorAll('v-chapter-index').length).toBe(1);
      expect(stack.host.querySelectorAll('v-help-overlay').length).toBe(1);
    } finally {
      stack.dispose();
    }
  });

  it('pressing `?` opens the help overlay but does NOT open the chapter index', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const help = stack.firstPaint.helpOverlay!;
      const chapterIndex = stack.firstPaint.chapterIndex!;
      // Await chapter-index update so its shadow DOM is in place.
      await (chapterIndex as unknown as { updateComplete: Promise<unknown> })
        .updateComplete;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      await Promise.resolve();
      expect(help.open).toBe(true);
      // Chapter-index toggle's aria-expanded is still 'false' — the
      // listbox is closed. Read it through the shadow DOM.
      const chapterToggle = chapterIndex.shadowRoot?.querySelector(
        '[aria-expanded]',
      );
      expect(chapterToggle?.getAttribute('aria-expanded')).toBe('false');
    } finally {
      stack.dispose();
    }
  });

  it('pressing `M` opens the chapter index but does NOT open the help overlay', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const help = stack.firstPaint.helpOverlay!;
      const chapterIndex = stack.firstPaint.chapterIndex!;
      await (chapterIndex as unknown as { updateComplete: Promise<unknown> })
        .updateComplete;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
      await (chapterIndex as unknown as { updateComplete: Promise<unknown> })
        .updateComplete;
      // Chapter index opened.
      const chapterToggle = chapterIndex.shadowRoot?.querySelector(
        '[aria-expanded]',
      );
      expect(chapterToggle?.getAttribute('aria-expanded')).toBe('true');
      // Help overlay stayed closed.
      expect(help.open).toBe(false);
    } finally {
      stack.dispose();
    }
  });

  it('pressing `1` activates a chapter (chapter-index) — does NOT touch the help overlay', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const help = stack.firstPaint.helpOverlay!;
      const dispatched: Event[] = [];
      document.addEventListener('chapter-jump', (e) => dispatched.push(e));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
      expect(dispatched.length).toBe(1);
      // Help overlay was never opened by a digit press.
      expect(help.open).toBe(false);
    } finally {
      stack.dispose();
    }
  });

  it('opening BOTH overlays sequentially leaves both panels open (no auto-close on the other)', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const help = stack.firstPaint.helpOverlay!;
      const chapterIndex = stack.firstPaint.chapterIndex!;
      await (chapterIndex as unknown as { updateComplete: Promise<unknown> })
        .updateComplete;
      // Open chapter index first.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
      await (chapterIndex as unknown as { updateComplete: Promise<unknown> })
        .updateComplete;
      const chapterToggle = chapterIndex.shadowRoot?.querySelector(
        '[aria-expanded]',
      );
      expect(chapterToggle?.getAttribute('aria-expanded')).toBe('true');
      // Now open the help overlay.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      await help.updateComplete;
      // BOTH are open — the dev impl does not coordinate closure.
      expect(help.open).toBe(true);
      expect(chapterToggle?.getAttribute('aria-expanded')).toBe('true');
    } finally {
      stack.dispose();
    }
  });

  it('Esc closes the help overlay only (chapter-index Esc handler is independent)', async () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const help = stack.firstPaint.helpOverlay!;
      // Open the help via `?`.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      await help.updateComplete;
      expect(help.open).toBe(true);
      // Esc inside the help dialog closes IT — the chapter-index is not
      // open, so closing the help doesn't ripple to it.
      const dialog = help.shadowRoot!.querySelector<HTMLElement>('.dialog')!;
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await help.updateComplete;
      expect(help.open).toBe(false);
    } finally {
      stack.dispose();
    }
  });

  it('toggle positions: help overlay is 44px LEFT of chapter-index (Dev Agent Record decision)', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      // The dev decision pins the help overlay's `:host { right: calc(var(--v-edge-margin) + 44px) }`.
      // We can't compute layout in happy-dom, so we assert the CSS rule
      // literal is present in the component's static styles — this is
      // the binding contract.
      const flat = (VHelpOverlay.styles as Array<{ cssText?: string } | undefined>)
        .map((s) => String(s?.cssText ?? ''))
        .join('\n');
      expect(flat).toMatch(/:host\s*\{[^}]*right:\s*calc\(var\(--v-edge-margin\)\s*\+\s*44px\)/);
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. Help overlay × About page (overlay absent on /about)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.8 — help overlay × /about interaction', () => {
  it('boot at /about does NOT mount the help overlay (the about surface is content-only)', () => {
    window.history.replaceState(null, '', '/about');
    const stack = bootAboutSurface();
    try {
      // mountAboutSurface skips startFirstPaint entirely — no help
      // overlay, no chapter-index, no scrubber.
      expect(stack.host.querySelector('v-help-overlay')).toBeNull();
      expect(stack.host.querySelector('v-chapter-index')).toBeNull();
      expect(stack.host.querySelector('v-timeline-scrubber')).toBeNull();
      // The about page itself IS mounted.
      expect(stack.host.querySelector('v-about-page')).not.toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('boot at /about: pressing ? from document.body is a true no-op (no listener attached)', async () => {
    window.history.replaceState(null, '', '/about');
    const stack = bootAboutSurface();
    try {
      expect(() =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: '?', bubbles: true }),
        ),
      ).not.toThrow();
      // No help overlay magically appears on /about.
      expect(document.querySelector('v-help-overlay')).toBeNull();
      await Promise.resolve();
    } finally {
      stack.dispose();
    }
  });

  it('boot at /about: pressing A from document.body does NOT trigger another navigation (already on /about)', async () => {
    window.history.replaceState(null, '', '/about');
    const stack = bootAboutSurface();
    try {
      const ev = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
      document.dispatchEvent(ev);
      // No overlay listener → defaultPrevented stays false; no
      // attempt to assign location.
      expect(ev.defaultPrevented).toBe(false);
      expect(window.location.pathname).toBe('/about');
      await Promise.resolve();
    } finally {
      stack.dispose();
    }
  });

  it('pressing A while the help overlay is open does NOT navigate AND does NOT close the overlay', async () => {
    // Complement of AC6's open-suppression assertion — the dev test
    // pins "navigations === []" but does not assert the overlay stays
    // open. This QA test pins both halves of the contract.
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      const overlay = stack.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay.navigate = (url) => navigations.push(url);
      // Open the overlay first (via `?`).
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      await overlay.updateComplete;
      expect(overlay.open).toBe(true);
      // Now press A.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      // No navigation AND overlay still open (Esc is the only path out).
      expect(navigations).toEqual([]);
      expect(overlay.open).toBe(true);
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 8. Disconnect cleanup at the composition tier
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.8 — full FirstPaintHandle dispose does not leak `?`/`A` listeners', () => {
  it('dispose() then dispatch `?` from document — no overlay opens (none exists)', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    const overlay = stack.firstPaint.helpOverlay!;
    stack.dispose();
    // Post-dispose: the overlay element has been removed (its
    // disconnectedCallback closed any open dialog and detached the
    // global keydown handler).
    expect(document.querySelector('v-help-overlay')).toBeNull();
    expect(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true })),
    ).not.toThrow();
    // The captured overlay reference is now disconnected; its `open`
    // property reflects the closed state from disconnectedCallback.
    expect(overlay.open).toBe(false);
  });

  it('dispose() then dispatch `A` from document — no navigation fires', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    const overlay = stack.firstPaint.helpOverlay!;
    const navigations: string[] = [];
    overlay.navigate = (url) => navigations.push(url);
    stack.dispose();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(navigations).toEqual([]);
  });

  it('re-bootstrapping after dispose registers fresh listeners on the new overlay', async () => {
    window.history.replaceState(null, '', '/');
    const stack1 = bootSimulationSurface();
    stack1.dispose();
    const stack2 = bootSimulationSurface();
    try {
      const overlay2 = stack2.firstPaint.helpOverlay!;
      const navigations: string[] = [];
      overlay2.navigate = (url) => navigations.push(url);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(navigations).toEqual(['/about']);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      await overlay2.updateComplete;
      expect(overlay2.open).toBe(true);
    } finally {
      stack2.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Chrome DevTools MCP smoke probe plan — Integration AC8 (lead-executed)
// ─────────────────────────────────────────────────────────────────────
//
// Per voyager-skill-rules.md Rule 3 + Rule 6 + Rule 7, the binding
// browser-evidence gate for Story 2.8 is the lead-executed Chrome
// DevTools MCP smoke. The dev's File List touches `web/src/`
// (v-help-overlay.ts, first-paint.ts, main.ts, tokens.css), so the MCP
// smoke stage is REQUIRED — not skipped.
//
// Evidence path:
//   `_bmad-output/implementation-artifacts/2-8-smoke-evidence/<frame>.png`
//
// No `initScript` shim needed (Rule 6, post-Story-1.16). The dev server
// must be running at port 5173 (`cd web && npm run dev`) before invoking
// the probe sequence. Per Rule 7 this smoke is LEAD-executed; QA
// sub-agents inherit the harness MCP tool inventory best-effort but the
// lead's tool inventory is the binding gate.
//
// ## Probe sequence (recommended order — 7 probes covering AC1, AC2,
// ## AC3, AC5, AC6, plus embed-mode parity)
//
// ### Setup
//
// 1. Ensure dev server is running: `cd web && npm run dev` (default 5173).
//
// 2. `mcp__chrome-devtools-mcp__navigate_page` → `http://localhost:5173/`
//    (cold-load homepage, non-embed).
//
// 3. `mcp__chrome-devtools-mcp__wait_for` → `__voyagerDebug.helpOverlay`
//    is defined (post-boot signal — main.ts exposes it on the debug
//    surface).
//
// ### Probe 1 — AC1: toggle icon present at cold-load (non-embed)
//
// 4. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
//    - `document.querySelector('v-help-overlay') !== null`
//    - `window.__voyagerDebug.helpOverlay !== null`
//    - The toggle button is in the shadow root:
//      `document.querySelector('v-help-overlay').shadowRoot
//        .querySelector('button.toggle') !== null`
//    - The toggle's aria-label is "Open keyboard shortcuts help"
//    - The toggle's aria-expanded is "false"
//    - The toggle's aria-controls is "help-overlay-dialog"
//
// 5. `mcp__chrome-devtools-mcp__take_snapshot` — accessibility tree
//    snapshot at cold-load. Save:
//    `2-8-smoke-evidence/01-cold-load-a11y.txt`
//    Must contain the help toggle button labeled
//    "Open keyboard shortcuts help" AND the chapter-index toggle
//    (both top-right; both keyboard-reachable).
//
// 6. `mcp__chrome-devtools-mcp__take_screenshot` →
//    `2-8-smoke-evidence/01-cold-load-icon.png`
//    Confirms visually that the `?` icon is in the top-right, sitting
//    to the LEFT of the chapter-index hamburger icon.
//
// ### Probe 2 — AC2 + AC3: `?` opens the modal dialog
//
// 7. `mcp__chrome-devtools-mcp__press_key` → `?` (Shift+/).
//
// 8. `mcp__chrome-devtools-mcp__wait_for` — wait until
//    `document.querySelector('v-help-overlay').open === true`.
//
// 9. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
//    - The shadow-DOM dialog has role="dialog", aria-modal="true",
//      aria-labelledby="help-title":
//      ```
//      const root = document.querySelector('v-help-overlay').shadowRoot;
//      const dialog = root.querySelector('[role="dialog"]');
//      ({
//        ariaModal: dialog.getAttribute('aria-modal'),
//        labelledBy: dialog.getAttribute('aria-labelledby'),
//        id: dialog.id,
//        titleId: root.querySelector('#help-title') !== null,
//      })
//      ```
//      Expected: `{ ariaModal: 'true', labelledBy: 'help-title',
//                  id: 'help-overlay-dialog', titleId: true }`
//    - aria-expanded on the toggle is now "true":
//      `root.querySelector('button.toggle').getAttribute('aria-expanded')
//       === 'true'`
//    - aria-label is now "Close keyboard shortcuts help"
//
// 10. `mcp__chrome-devtools-mcp__take_screenshot` →
//     `2-8-smoke-evidence/02-overlay-open.png`
//     Captures the modal dialog open with scrim overlay.
//
// ### Probe 3 — AC4: four shortcut sections in canonical order
//
// 11. `mcp__chrome-devtools-mcp__evaluate_script`:
//     ```
//     Array.from(
//       document.querySelector('v-help-overlay').shadowRoot
//         .querySelectorAll('h2.section-heading')
//     ).map(h => h.textContent.trim())
//     ```
//     Expected: `['Playback', 'Navigation', 'Speed', 'Display']`
//
// 12. `mcp__chrome-devtools-mcp__evaluate_script` — kbd inventory:
//     ```
//     Array.from(
//       document.querySelector('v-help-overlay').shadowRoot
//         .querySelectorAll('kbd')
//     ).map(k => k.textContent)
//     ```
//     Must include (at minimum): Space, ←, →, Shift, Home, End, 1, …,
//     9, M, A, +, -, H, G, ?, Esc.
//
// 13. `mcp__chrome-devtools-mcp__take_snapshot` — accessibility tree
//     of the open dialog. Save:
//     `2-8-smoke-evidence/03-overlay-a11y.txt`
//     Must show the dialog as an accessible region with the
//     "Keyboard shortcuts" h1 and the four h2 section headings.
//
// ### Probe 4 — AC5: Esc closes + focus restoration
//
// 14. `mcp__chrome-devtools-mcp__press_key` → `Escape`.
//
// 15. `mcp__chrome-devtools-mcp__wait_for` — wait until
//     `document.querySelector('v-help-overlay').open === false`.
//
// 16. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
//     - `document.querySelector('v-help-overlay').open === false`
//     - aria-expanded on the toggle is back to "false"
//     - aria-label is back to "Open keyboard shortcuts help"
//     - Focus restoration after `?`-keyboard open: per AC5 +
//       Dev decision, focus stays on the body (NOT the toggle).
//       `document.activeElement === document.body` or `null` in
//       Chrome (depends on prior focus state).
//
// 17. `mcp__chrome-devtools-mcp__take_screenshot` →
//     `2-8-smoke-evidence/04-after-esc-close.png`
//     Confirms the dialog is gone and the toggle icon is back to its
//     closed visual state.
//
// ### Probe 5 — AC5 mouse-open variant: scrim click closes (de-scoped
// ###            from unit tier because happy-dom drops shadow-root clicks)
//
// 18. `mcp__chrome-devtools-mcp__click` on the help toggle icon
//     (top-right `?` button). Wait for `open === true`.
//
// 19. `mcp__chrome-devtools-mcp__click` on the scrim — locate via
//     `document.querySelector('v-help-overlay').shadowRoot
//       .querySelector('.scrim')`. The click must close the dialog.
//
// 20. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
//     - `document.querySelector('v-help-overlay').open === false`
//     - The mouse-open path restores focus to the toggle button:
//       `document.querySelector('v-help-overlay').shadowRoot
//         .activeElement === document.querySelector('v-help-overlay')
//         .shadowRoot.querySelector('button.toggle')`
//
// 21. `mcp__chrome-devtools-mcp__take_screenshot` →
//     `2-8-smoke-evidence/05-scrim-click-closes.png`
//
// ### Probe 6 — AC6: `A` navigates to /about
//
// 22. `mcp__chrome-devtools-mcp__press_key` → `A` (or `a`). Must be
//     pressed when no input is focused — press `Tab` first if needed
//     to drop focus from any element, but typically body is the
//     active element on a fresh cold-load.
//
// 23. `mcp__chrome-devtools-mcp__wait_for` — wait until
//     `location.pathname === '/about'`.
//
// 24. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
//     - `location.pathname === '/about'`
//     - `document.querySelector('v-about-page') !== null` (the about
//       surface mounted because main.ts re-bootstrapped at the new URL)
//     - `document.querySelector('v-help-overlay') === null` (the help
//       overlay is NOT mounted on the about surface, per Probe 7 below)
//     - `document.querySelector('canvas#voyager-canvas') === null`
//       (simulation surface is gone)
//
// 25. `mcp__chrome-devtools-mcp__take_screenshot` →
//     `2-8-smoke-evidence/06-after-a-key-navigation.png`
//     Confirms the about page loaded after pressing `A`.
//
// ### Probe 7 — embed-mode parity (AC1 + AC2 + AC6 negative)
//
// 26. `mcp__chrome-devtools-mcp__navigate_page` →
//     `http://localhost:5173/?embed=true`
//
// 27. `mcp__chrome-devtools-mcp__wait_for` —
//     `__voyagerDebug.embedMode.enabled === true`.
//
// 28. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
//     - `__voyagerDebug.embedMode.enabled === true`
//     - `__voyagerDebug.helpOverlay === null` (handle is null in embed)
//     - `document.querySelector('v-help-overlay') === null` (no element
//       in the DOM — the AC2 "wholly absent, not display:none" contract)
//     - `document.querySelector('v-chapter-index') === null`
//       (Story 2.5 invariant — confirms embed surface intact)
//     - `document.querySelector('v-timeline-scrubber') !== null`
//       (simulation surface IS present — overlay is chrome, not content)
//
// 29. `mcp__chrome-devtools-mcp__press_key` → `?`. Must be a NO-OP:
//     no error, no DOM change.
//
// 30. `mcp__chrome-devtools-mcp__press_key` → `A`. Must be a NO-OP:
//     URL pathname must stay `/`, no navigation to /about.
//
// 31. `mcp__chrome-devtools-mcp__evaluate_script` — post-press assert:
//     - `location.pathname === '/'`
//     - `new URLSearchParams(location.search).get('embed') === 'true'`
//     - `document.querySelector('v-help-overlay') === null`
//     - `document.querySelector('v-about-page') === null`
//
// 32. `mcp__chrome-devtools-mcp__take_screenshot` →
//     `2-8-smoke-evidence/07-embed-mode-no-overlay.png`
//
// ### Console hygiene (every probe)
//
// 33. `mcp__chrome-devtools-mcp__list_console_messages` after the full
//     sequence. Assert no errors. Allow-listed messages:
//     - Lit dev-mode banner (`https://lit.dev/msg/dev-mode`)
//     - Three.js renderer / chunk-loader pre-existing dev diagnostics
//       tolerated by every other story's smoke
//     Save: `2-8-smoke-evidence/08-console.json`.
//
// ## Mapped MCP coverage per AC
//
//   - MCP smoke covers AC1 (Probe 1) — toggle icon present, ARIA
//     attributes correct, screenshot evidence.
//   - MCP smoke covers AC2 (Probes 2 + 7) — `?` toggles in non-embed,
//     `?` is NO-OP in embed mode.
//   - MCP smoke covers AC3 (Probe 2 + 3) — WAI-ARIA Dialog (Modal)
//     pattern with role/aria-modal/aria-labelledby; scrim present;
//     four canonical h2 sections.
//   - MCP smoke covers AC4 (Probe 3) — four sections in canonical
//     order, kbd inventory complete.
//   - MCP smoke covers AC5 (Probes 4 + 5) — Esc closes (keyboard-open
//     leaves focus on body); scrim click closes (mouse-open restores
//     focus to toggle).
//   - MCP smoke covers AC6 (Probes 6 + 7) — `A` navigates to /about in
//     non-embed; `A` is NO-OP in embed mode.
//   - AC7 (tests green) is verified by `cd web && npm test -- --run`
//     not by MCP.
//   - Integration AC8 (the lead-driven 7-probe sequence in the story
//     file) maps to Probes 1, 2, 3, 4, 6, 7 in this plan.
//
// ## Skip rules / notes
//
//   - This story touches `web/src/` (multiple files); the MCP smoke
//     stage is REQUIRED — not skippable.
//   - axe-core is deferred to Story 6.4 per the dev's Risk Mitigation
//     Audit. Do NOT add axe-core probes here; the a11y tree
//     snapshots (Probes 1 + 3) are the interim a11y gate.
//   - The `--v-color-bg-elevated` token (#0f1419) added by Story 2.8
//     is verified at the unit tier (`v-help-overlay.test.ts` Story 2.8
//     AC3 — "dialog background uses --v-color-bg-elevated"). The MCP
//     smoke does NOT need to re-assert the token literal; visual
//     inspection of the screenshot is the implicit gate.
//   - For deterministic timing, prefer
//     `mcp__chrome-devtools-mcp__wait_for` on a DEV-surface predicate
//     (e.g., `__voyagerDebug.helpOverlay !== undefined`,
//     `document.querySelector('v-help-overlay').open === true/false`,
//     `location.pathname === ...`) rather than fixed `setTimeout`
//     waits.
