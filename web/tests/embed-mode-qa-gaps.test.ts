// @vitest-environment happy-dom
/**
 * Story 2.5 — QA gap suite (cross-cutting integration coverage).
 *
 * The dev-authored tests already cover the seven primary ACs at the unit
 * tier:
 *   - `web/src/services/embed-mode-state.test.ts` (14 tests) — strict-
 *     boolean parse + immutability (AC1).
 *   - `web/src/services/url-sync.test.ts` § "Story 2.5 AC4 — URLSync
 *     embed=true preservation" (+10 tests) — every writeback API
 *     appends `&embed=true` in isolation (AC4 at the URLSync surface).
 *   - `web/tests/embed-mode-first-paint.test.ts` (13 tests) — first-
 *     paint conditional `<v-chapter-index>` mount-skip + keyboard NO-OPs
 *     in embed mode (AC2 + AC3).
 *   - `web/tests/url-router-qa-gaps.test.ts` § "Story 2.5 — `?embed=true`
 *     preservation through chapter + home writebacks" (+5 tests) — the
 *     URLRouter-driven chapter pushState / home revert / back-then-
 *     forward preserves embed=true.
 *
 * This QA file fills the gaps the dev suites do not reach:
 *
 *   1. **Full first-paint composition at `?embed=true`** — every other
 *      embed test exercises ONE seam at a time (URLSync writes alone, or
 *      first-paint mount-skip alone). This file boots the FULL stack
 *      (real ClockManager, real URLSync, real ChapterDirector, real
 *      URLRouter, real first-paint composition) at a `?embed=true` URL
 *      and verifies the wire-up — the dev surface that catches a
 *      regression where one seam was updated and another was not.
 *
 *   2. **End-to-end URL preservation sweep** — boot at `/?embed=true`,
 *      click a marker (chapter-jump CustomEvent) → URL becomes
 *      `/c/<slug>?t=<iso>&embed=true`; free-scrub within the chapter
 *      → URL still carries embed=true; popstate back/forward → URL
 *      retains embed=true throughout. The url-router-qa-gaps test
 *      exercises the chapter writes but not the throttled `?t=` writes
 *      from a free-scrub gesture; this file closes that gap.
 *
 *   3. **Negative parse cases at boot composition** — the unit test
 *      file enumerates `parseEmbedParam` rejections (`1`, `yes`,
 *      `TRUE`, etc.) but doesn't verify that a mixed-case URL leads to
 *      first-paint MOUNTING the chapter-index (because `enabled=false`).
 *      `?embed=tRUE` and `?embed=1` must both result in the standard
 *      chrome being mounted; this file pins that contract at the
 *      composition level.
 *
 *   4. **Keyboard isolation in embed mode (orphan-listener check)** —
 *      AC3 assertion that pressing M / 1..9 from `document.body` when
 *      the chapter-index element is NOT in the DOM produces no error,
 *      no `chapter-jump` dispatch, no `aria-expanded` change anywhere.
 *      The first-paint test asserts the chapter-jump absence; this
 *      file additionally pins that NO `[aria-expanded]` element exists
 *      anywhere in `document` after embed-mode mount (catches a future
 *      regression where some other component might erroneously register
 *      a global M listener).
 *
 *   5. **Document the MCP smoke probe plan for Integration AC8** — the
 *      lead-executed Chrome DevTools MCP smoke is the binding browser-
 *      evidence gate per voyager-skill-rules.md Rule 3 + Rule 7. The
 *      probe sequence is documented at the bottom of this file so the
 *      lead can execute it deterministically.
 *
 * Test pattern mirrors `web/tests/url-router-qa-gaps.test.ts` Story 2.4
 * — a single `bootStack({ embedEnabled })` helper composes the real
 * URLSync × ClockManager × ChapterDirector × URLRouter instances so the
 * tests run against the wire-up, not against mocks.
 *
 * Per Voyager skill rules Rule 3, the binding browser-evidence gate
 * remains the lead-executed Chrome DevTools MCP smoke. This integration
 * tier catches regressions earlier.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { startFirstPaint, type FirstPaintHandle } from '../src/boot/first-paint';
import { URLSync } from '../src/services/url-sync';
import { URLRouter } from '../src/services/url-router';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { EmbedModeState, parseEmbedParam } from '../src/services/embed-mode-state';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import { TITLE_CARD_HOLD_MS } from '../src/constants/mission';

/** Flush microtasks queued by URLRouter.scheduleWaveSettle. */
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/**
 * Boot the FULL first-paint composition — mirrors `main.ts`'s wire-up:
 *
 *   1. Parse the URL's `?embed=` via `EmbedModeState.fromSearch`.
 *   2. Construct `URLSync` with the embedEnabled flag (so writebacks
 *      preserve `&embed=true`).
 *   3. Parse the initial path → seed the `ClockManager`.
 *   4. Construct `ChapterDirector` and seed it via `director.update(et)`
 *      BEFORE installing the router (Story 2.4 boot-time race
 *      ordering — see url-router-qa-gaps.test.ts).
 *   5. Mount first-paint with the real `clockManager`,
 *      `chapterDirector`, `urlSync`, and the boot-time embedEnabled flag.
 *   6. Install `URLRouter`.
 *
 * Returns the assembled handles + a `dispose()` that tears down everything
 * in the reverse order. Tests get the SAME composition main.ts produces,
 * minus the RenderEngine (which doesn't affect URL routing or DOM mount
 * for chapter-index).
 */
const bootFullStack = (): {
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
  const initialUrlState = urlSync.parseInitialPath();
  const clock = new ClockManager();
  clock.scrubTo(initialUrlState.initialEt);
  const director = new ChapterDirector(ALL_CHAPTERS);
  // Seed director BEFORE the router subscribes — matches main.ts.
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

beforeEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

// ─────────────────────────────────────────────────────────────────────
// Full first-paint composition at ?embed=true (cross-cutting wire-up)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.5 — full first-paint composition at ?embed=true', () => {
  it('boot at /?embed=true mounts simulation surface but NOT chapter-index', () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootFullStack();
    try {
      // EmbedModeState parsed correctly.
      expect(stack.embedMode.enabled).toBe(true);
      // Simulation surface — all present.
      expect(stack.host.querySelector('v-timeline-scrubber')).not.toBeNull();
      expect(stack.host.querySelector('v-play-button')).not.toBeNull();
      expect(stack.host.querySelector('v-speed-multiplier')).not.toBeNull();
      expect(stack.host.querySelector('v-hud')).not.toBeNull();
      // Chrome — chapter-index NOT in the DOM.
      expect(stack.host.querySelector('v-chapter-index')).toBeNull();
      expect(stack.firstPaint.chapterIndex).toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('boot at /?embed=true with no chapter, no ?t= produces no URL writes (cold-load is canonical)', async () => {
    window.history.replaceState(null, '', '/?embed=true');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const stack = bootFullStack();
    try {
      await flushMicrotasks();
      // The boot pipeline must not write the URL — there is no transition
      // to mirror. The cold-load URL stands as the canonical state.
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();
      // URL is unchanged.
      expect(window.location.pathname).toBe('/');
      expect(window.location.search).toBe('?embed=true');
    } finally {
      replaceSpy.mockRestore();
      pushSpy.mockRestore();
      stack.dispose();
    }
  });

  it('boot at /c/v1-jupiter?t=<iso>&embed=true initializes the FULL stack with embed enabled', () => {
    window.history.replaceState(
      null,
      '',
      '/c/v1-jupiter?t=1979-03-05T12:00:00Z&embed=true',
    );
    const stack = bootFullStack();
    try {
      expect(stack.embedMode.enabled).toBe(true);
      expect(stack.director.activeChapter?.slug).toBe('v1-jupiter');
      expect(stack.host.querySelector('v-chapter-index')).toBeNull();
      // Simulation present.
      expect(stack.host.querySelector('v-timeline-scrubber')).not.toBeNull();
      // URL unchanged at boot.
      expect(window.location.pathname).toBe('/c/v1-jupiter');
      const params = new URLSearchParams(window.location.search);
      expect(params.get('embed')).toBe('true');
      expect(params.get('t')).toBe('1979-03-05T12:00:00Z');
    } finally {
      stack.dispose();
    }
  });

  it('debug surface exposes embedMode flag (AC1 lead-smoke read path)', () => {
    // main.ts exposes `__voyagerDebug.embedMode` so the lead's MCP smoke
    // can verify AC1 (enabled=true for ?embed=true) without re-parsing
    // the URL. We can't exercise main.ts directly here, but we can pin
    // the contract: EmbedModeState.fromSearch is the production parse,
    // and reading `.enabled` is the assertion shape.
    window.history.replaceState(null, '', '/?embed=true');
    const embed = EmbedModeState.fromSearch(window.location.search);
    expect(embed.enabled).toBe(true);
    // Read-only contract — there is no setter.
    expect(() => {
      (embed as unknown as { enabled: boolean }).enabled = false;
    }).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// End-to-end URL preservation sweep (boot → marker click → scrub → popstate)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.5 AC4 — end-to-end URL preservation sweep', () => {
  it('boot at /?embed=true → marker click (chapter-jump) → URL becomes /c/<slug>?t=<iso>&embed=true', async () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootFullStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      stack.clock.scrubTo(v1Jupiter.anchorEt);
      // Simulate the marker click — chapter-jump bubbles+composed from
      // shadow DOM up to document.
      document.dispatchEvent(
        new CustomEvent('chapter-jump', {
          detail: { slug: v1Jupiter.slug, anchorEt: v1Jupiter.anchorEt },
          bubbles: true,
          composed: true,
        }),
      );
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      expect(window.location.pathname).toBe('/c/v1-jupiter');
      const params = new URLSearchParams(window.location.search);
      expect(params.get('t')).not.toBeNull();
      expect(params.get('embed')).toBe('true');
    } finally {
      stack.dispose();
    }
  });

  it('free-scrub within a chapter via writeEtImmediate preserves embed=true on the replaceState write', async () => {
    // After the chapter-jump pushState, subsequent free-scrubs replaceState
    // the `?t=` only — the path stays `/c/<slug>` and embed=true must
    // continue to ride along on every write.
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootFullStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      stack.clock.scrubTo(v1Jupiter.anchorEt);
      document.dispatchEvent(
        new CustomEvent('chapter-jump', {
          detail: { slug: v1Jupiter.slug, anchorEt: v1Jupiter.anchorEt },
          bubbles: true,
          composed: true,
        }),
      );
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      expect(new URLSearchParams(window.location.search).get('embed')).toBe(
        'true',
      );

      // Now free-scrub within v1-jupiter's window — emit several writeEtImmediate
      // calls (pointerup release) at distinct ETs.
      const replaceSpy = vi.spyOn(window.history, 'replaceState');
      for (let i = 1; i <= 5; i++) {
        const et = v1Jupiter.anchorEt + i * 100;
        stack.clock.scrubTo(et);
        stack.urlSync.writeEtImmediate(et);
        stack.director.update(et);
        await flushMicrotasks();
      }
      // Every replaceState write must carry embed=true.
      expect(replaceSpy.mock.calls.length).toBeGreaterThanOrEqual(5);
      for (const call of replaceSpy.mock.calls) {
        expect(String(call[2])).toContain('embed=true');
      }
      // And the final URL still has it.
      expect(new URLSearchParams(window.location.search).get('embed')).toBe(
        'true',
      );
      replaceSpy.mockRestore();
    } finally {
      stack.dispose();
    }
  });

  it('throttled writeEtThrottled writes preserve embed=true (drag-coalesced writes)', () => {
    // Drag gestures emit writeEtThrottled (replaceState, coalesced at
    // 250ms). The leading write must carry embed=true.
    window.history.replaceState(null, '', '/c/v1-jupiter?embed=true');
    const stack = bootFullStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      const replaceSpy = vi.spyOn(window.history, 'replaceState');
      stack.urlSync.writeEtThrottled(v1Jupiter.anchorEt + 50);
      // Throttled write goes through immediately on the leading edge.
      expect(replaceSpy).toHaveBeenCalled();
      const url = String(replaceSpy.mock.calls[0]![2]);
      expect(url).toContain('embed=true');
      replaceSpy.mockRestore();
    } finally {
      stack.dispose();
    }
  });

  it('push → push → back → forward sweep keeps embed=true through every URL state', async () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootFullStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      const v2Saturn = findChapterBySlug('v2-saturn')!;

      // Push v1-jupiter
      stack.clock.scrubTo(v1Jupiter.anchorEt);
      document.dispatchEvent(
        new CustomEvent('chapter-jump', {
          detail: { slug: v1Jupiter.slug, anchorEt: v1Jupiter.anchorEt },
          bubbles: true,
          composed: true,
        }),
      );
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      expect(window.location.pathname).toBe('/c/v1-jupiter');
      expect(new URLSearchParams(window.location.search).get('embed')).toBe(
        'true',
      );

      // Push v2-saturn
      stack.clock.scrubTo(v2Saturn.anchorEt);
      document.dispatchEvent(
        new CustomEvent('chapter-jump', {
          detail: { slug: v2Saturn.slug, anchorEt: v2Saturn.anchorEt },
          bubbles: true,
          composed: true,
        }),
      );
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      expect(new URLSearchParams(window.location.search).get('embed')).toBe(
        'true',
      );

      // Back to v1-jupiter (popstate)
      window.history.back();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(window.location.pathname).toBe('/c/v1-jupiter');
      expect(new URLSearchParams(window.location.search).get('embed')).toBe(
        'true',
      );

      // Forward to v2-saturn (popstate)
      window.history.forward();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(window.location.pathname).toBe('/c/v2-saturn');
      expect(new URLSearchParams(window.location.search).get('embed')).toBe(
        'true',
      );
    } finally {
      stack.dispose();
    }
  });

  it('free-scrub crossing chapter boundary → director replaceState preserves embed=true', async () => {
    // The director-driven boundary replaceState path is the third
    // writeback in URLRouter; this exercises it in the full stack.
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootFullStack();
    try {
      const v2Saturn = findChapterBySlug('v2-saturn')!;
      // Scrub across many chapter boundaries to land in v2-saturn.
      stack.clock.scrubTo(v2Saturn.anchorEt);
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      // The director-driven settle should have written exactly once to
      // v2-saturn (replaceState since this is not a user-driven jump).
      expect(window.location.pathname).toBe('/c/v2-saturn');
      expect(new URLSearchParams(window.location.search).get('embed')).toBe(
        'true',
      );
    } finally {
      stack.dispose();
    }
  });

  it('home revert (free-scrub into cruise gap) preserves embed=true on the / URL', async () => {
    window.history.replaceState(null, '', '/c/v1-jupiter?embed=true');
    const stack = bootFullStack();
    try {
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      const v2Jupiter = findChapterBySlug('v2-jupiter')!;
      const cruiseEt = v1Jupiter.windowEndEt + 1;
      expect(cruiseEt).toBeLessThan(v2Jupiter.windowStartEt);
      stack.clock.scrubTo(cruiseEt);
      stack.director.update(stack.clock.simTimeEt);
      await flushMicrotasks();
      expect(window.location.pathname).toBe('/');
      expect(new URLSearchParams(window.location.search).get('embed')).toBe(
        'true',
      );
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Negative parse cases at boot composition (mixed case, numeric, etc.)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.5 AC1 — negative parse cases at full-stack boot', () => {
  it('boot at /?embed=tRUE (mixed case) — enabled=false; chapter-index IS mounted', () => {
    // The parser is strict-equality against "true" (lowercase).
    // Mixed-case must NOT enable embed mode and the chapter-index
    // toggle must mount normally.
    window.history.replaceState(null, '', '/?embed=tRUE');
    const stack = bootFullStack();
    try {
      expect(stack.embedMode.enabled).toBe(false);
      expect(stack.host.querySelector('v-chapter-index')).not.toBeNull();
      expect(stack.firstPaint.chapterIndex).not.toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('boot at /?embed=TRUE (all caps) — enabled=false; chapter-index IS mounted', () => {
    window.history.replaceState(null, '', '/?embed=TRUE');
    const stack = bootFullStack();
    try {
      expect(stack.embedMode.enabled).toBe(false);
      expect(stack.host.querySelector('v-chapter-index')).not.toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('boot at /?embed=1 — enabled=false; chapter-index IS mounted', () => {
    // Numeric variants (`1`, `0`) are explicit NFR-S7 rejections — must
    // not enable embed mode.
    window.history.replaceState(null, '', '/?embed=1');
    const stack = bootFullStack();
    try {
      expect(stack.embedMode.enabled).toBe(false);
      expect(stack.host.querySelector('v-chapter-index')).not.toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('boot at /?embed=yes — enabled=false; chapter-index IS mounted', () => {
    window.history.replaceState(null, '', '/?embed=yes');
    const stack = bootFullStack();
    try {
      expect(stack.embedMode.enabled).toBe(false);
      expect(stack.host.querySelector('v-chapter-index')).not.toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('boot at /?embed= (empty value) — enabled=false; chapter-index IS mounted', () => {
    window.history.replaceState(null, '', '/?embed=');
    const stack = bootFullStack();
    try {
      expect(stack.embedMode.enabled).toBe(false);
      expect(stack.host.querySelector('v-chapter-index')).not.toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('boot at / (no embed param at all) — enabled=false; chapter-index IS mounted', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootFullStack();
    try {
      expect(stack.embedMode.enabled).toBe(false);
      expect(stack.host.querySelector('v-chapter-index')).not.toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('parseEmbedParam directly: every NFR-S7-listed reject variant returns false', () => {
    // Pin the strict-boolean contract at the parser level (defense in
    // depth — the full-stack tests cover the wire-up, this covers the
    // parser itself for the bootFullStack assertions above).
    for (const variant of [
      '?embed=tRUE',
      '?embed=TRUE',
      '?embed=True',
      '?embed=1',
      '?embed=0',
      '?embed=yes',
      '?embed=Yes',
      '?embed=on',
      '?embed=',
      '?embed= true', // leading whitespace
      '?embed=true ', // trailing whitespace
      '?other=true', // no embed param
      '', // no query at all
    ]) {
      expect(parseEmbedParam(variant)).toBe(false);
    }
    // Sanity: the only accepting form.
    expect(parseEmbedParam('?embed=true')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Keyboard isolation in embed mode (orphan-listener / aria check)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.5 AC3 — keyboard isolation + orphan-listener safety in embed mode', () => {
  it('pressing M from document.body in embed mode does NOT toggle any aria-expanded element', async () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootFullStack();
    try {
      // Pre-press snapshot: every element with [aria-expanded] (there
      // should be NONE because chapter-index didn't mount).
      const before = Array.from(
        document.querySelectorAll<HTMLElement>('[aria-expanded]'),
      ).map((el) => ({ el, value: el.getAttribute('aria-expanded') }));
      expect(before).toEqual([]);

      // Now press M from document.body.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', bubbles: true }));
      await flushMicrotasks();

      // Post-press: still no aria-expanded element anywhere.
      const after = Array.from(
        document.querySelectorAll<HTMLElement>('[aria-expanded]'),
      );
      expect(after.length).toBe(0);
    } finally {
      stack.dispose();
    }
  });

  it('pressing M / 1..9 from document.body in embed mode dispatches no chapter-jump events', async () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootFullStack();
    try {
      const captured: Event[] = [];
      document.addEventListener('chapter-jump', (e) => captured.push(e));
      // M
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
      // 1..9
      for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }
      await flushMicrotasks();
      expect(captured.length).toBe(0);
      // URL did NOT change as a side effect either.
      expect(window.location.pathname).toBe('/');
    } finally {
      stack.dispose();
    }
  });

  it('pressing M / A / ? / 1..9 in embed mode does not throw', async () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootFullStack();
    try {
      expect(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
        for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        }
      }).not.toThrow();
    } finally {
      stack.dispose();
    }
  });

  it('baseline parity: in non-embed mode, M is captured by chapter-index (orphan check sanity)', async () => {
    // Sanity: when chapter-index IS mounted, there exists an
    // [aria-expanded] element (the toggle button). Without this baseline
    // the embed-mode "no aria-expanded" assertion is uninformative —
    // because if it were never there in any mode, the embed assertion
    // would be trivially true.
    window.history.replaceState(null, '', '/');
    const stack = bootFullStack();
    try {
      // Lit element with shadow DOM — the [aria-expanded] is inside the
      // shadow root, so query *=* across shadow roots manually.
      const chapterIndex = stack.host.querySelector('v-chapter-index');
      expect(chapterIndex).not.toBeNull();
      // The component renders its toggle button asynchronously; await
      // updateComplete to ensure the shadow DOM has rendered.
      await (chapterIndex as unknown as { updateComplete: Promise<unknown> })
        .updateComplete;
      const ariaButton = chapterIndex!.shadowRoot?.querySelector('[aria-expanded]');
      expect(ariaButton).not.toBeNull();
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// AC2 invariant: chapterIndex element is wholly absent, not display:none
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.5 AC2 — chrome elements wholly absent (not hidden) at composition tier', () => {
  it('embed mode: querySelectorAll("v-chapter-index") returns zero matches across host AND document', () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootFullStack();
    try {
      // Stronger than "host.querySelector" — anywhere in the document.
      expect(document.querySelectorAll('v-chapter-index').length).toBe(0);
      expect(stack.host.querySelectorAll('v-chapter-index').length).toBe(0);
    } finally {
      stack.dispose();
    }
  });

  it('embed mode: no element with the chapter-index display style exists (CSS hide path is NOT used)', () => {
    // AC2 is explicit that the implementation skips appendChild rather
    // than applying display:none after mount. If a future refactor
    // regressed to the CSS-hide approach, the chapter-index element
    // WOULD exist with display:none — this test catches that.
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootFullStack();
    try {
      const hidden = document.querySelectorAll<HTMLElement>(
        'v-chapter-index[style*="display: none"], v-chapter-index[hidden]',
      );
      expect(hidden.length).toBe(0);
      // And the absence is total — no element at all.
      expect(document.querySelectorAll('v-chapter-index').length).toBe(0);
    } finally {
      stack.dispose();
    }
  });

  it('embed mode: firstPaint.chapterIndex is null in the handle (AC2 contract)', () => {
    window.history.replaceState(null, '', '/?embed=true');
    const stack = bootFullStack();
    try {
      expect(stack.firstPaint.chapterIndex).toBeNull();
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Documentation: Chrome DevTools MCP smoke plan for Integration AC8
// ─────────────────────────────────────────────────────────────────────

/**
 * # Chrome DevTools MCP smoke plan — Story 2.5 Integration AC8
 *
 * Per voyager-skill-rules.md Rule 3 + Rule 6 + Rule 7, the lead-executed
 * Chrome DevTools MCP smoke is the binding browser-evidence gate for this
 * story. The CI vitest tests above (this file + the dev's
 * `embed-mode-first-paint.test.ts` + `url-sync.test.ts` AC4 section +
 * `url-router-qa-gaps.test.ts` Story 2.5 section) catch regressions
 * early; the MCP smoke is the authoritative gate that the chrome-less
 * view actually renders chrome-less in a real Chrome build and that the
 * `&embed=true` parameter survives a full user navigation cycle.
 *
 * No `initScript` shim needed (Rule 6, post-Story-1.16).
 *
 * Evidence path:
 *   `_bmad-output/implementation-artifacts/2-5-smoke-evidence/<frame>.png`
 *
 * ## Probe sequence (recommended order)
 *
 * ### Setup
 *
 * 1. Ensure the dev server is running: `cd web && npm run dev`
 *    (default port 5173).
 *
 * 2. `mcp__chrome-devtools-mcp__navigate_page` →
 *    `http://localhost:5173/c/v1-jupiter?t=1979-03-05T12:05:00Z&embed=true`
 *    (deep-link to a mid-encounter timestamp with embed enabled — the
 *    Integration AC8 primary path).
 *
 * 3. `mcp__chrome-devtools-mcp__wait_for` → `__voyagerDebug.urlRouter`
 *    is defined (post-boot signal — same predicate the 2-4 smoke uses).
 *
 * ### AC1 + AC2 — embed mode enabled, chrome NOT in DOM
 *
 * 4. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
 *    - `window.__voyagerDebug.embedMode.enabled === true`
 *    - `window.__voyagerDebug.chapterIndex === null` (NOT a DOM
 *      element — the handle is null in embed mode per first-paint
 *      contract).
 *    - `document.querySelectorAll('v-chapter-index').length === 0`
 *    - `document.querySelector('v-timeline-scrubber') !== null` (sim
 *      surface still present)
 *    - `document.querySelector('v-play-button') !== null`
 *    - `document.querySelector('v-speed-multiplier') !== null`
 *    - `document.querySelector('v-hud') !== null`
 *
 * 5. `mcp__chrome-devtools-mcp__take_screenshot` → evidence:
 *    `_bmad-output/implementation-artifacts/2-5-smoke-evidence/01-cold-load-embed-v1-jupiter.png`
 *    Confirms visually no chapter-index toggle in the top-right; the
 *    canvas + HUD + scrubber + play button fill the viewport.
 *
 * 6. `mcp__chrome-devtools-mcp__take_snapshot` → accessibility tree at
 *    embed-mode cold-load.
 *    Evidence: `2-5-smoke-evidence/01-cold-load-a11y.txt`
 *    The a11y tree should contain the slider (scrubber), play button
 *    (toggle button), and HUD live regions but NOT the chapter-index
 *    expanded toggle.
 *
 * ### AC3 — keyboard NO-OP for M / A / ? from document.body
 *
 * 7. `mcp__chrome-devtools-mcp__evaluate_script` — capture pre-press
 *    snapshot:
 *    `JSON.stringify({
 *       pathname: location.pathname,
 *       embedParam: new URLSearchParams(location.search).get('embed'),
 *       aria: Array.from(document.querySelectorAll('[aria-expanded]'))
 *               .map(el => el.getAttribute('aria-expanded'))
 *     })`.
 *    Save the snapshot.
 *
 * 8. `mcp__chrome-devtools-mcp__press_key` → `M` — pressing from
 *    document.body (no input focused) should be a NO-OP because the
 *    chapter-index element (which owns the M shortcut) is not mounted.
 *
 * 9. `mcp__chrome-devtools-mcp__press_key` → `A` — placeholder for
 *    Story 2.7; today there is no listener so this is a NO-OP.
 *
 * 10. `mcp__chrome-devtools-mcp__press_key` → `Shift+/` (the `?` key) —
 *     placeholder for Story 2.8 help overlay; today no listener exists
 *     so this is also a NO-OP.
 *
 * 11. `mcp__chrome-devtools-mcp__press_key` → `5` (digit shortcut for a
 *     chapter). In embed mode there is no `installGlobalShortcuts`
 *     registration (chapter-index didn't mount) so the digit is a
 *     NO-OP — the URL pathname must NOT change.
 *
 * 12. `mcp__chrome-devtools-mcp__evaluate_script` — capture post-press
 *     snapshot using the same template as step 7. Assert it is
 *     IDENTICAL to the pre-press snapshot (no aria-expanded change,
 *     pathname unchanged, embed param still `'true'`).
 *
 * 13. `mcp__chrome-devtools-mcp__take_screenshot` → evidence:
 *     `2-5-smoke-evidence/02-after-key-presses-no-op.png`.
 *
 * ### AC4 — URL preservation across chapter-jump + popstate
 *
 * Note: in embed mode the chapter-jump CustomEvent is normally emitted
 * by the chapter-index listbox click OR the marker click in the
 * scrubber. Since the chapter-index is not mounted, exercise the
 * scrubber marker click (which DOES still emit chapter-jump because
 * the scrubber is part of the simulation surface, not chrome).
 *
 * 14. `mcp__chrome-devtools-mcp__take_snapshot` of the scrubber's
 *     accessibility tree to identify the V2 Saturn marker. Then
 *     `mcp__chrome-devtools-mcp__click` it (or use
 *     `evaluate_script` to dispatch the chapter-jump CustomEvent
 *     directly if the marker uid is unstable).
 *
 * 15. `mcp__chrome-devtools-mcp__wait_for` → URL change (
 *     `location.pathname === '/c/v2-saturn'`).
 *
 * 16. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
 *     - `location.pathname === '/c/v2-saturn'`
 *     - `new URLSearchParams(location.search).get('embed') === 'true'`
 *     - `new URLSearchParams(location.search).get('t') !== null`
 *     - `window.__voyagerDebug.chapterDirector.activeChapter.slug === 'v2-saturn'`
 *
 * 17. `mcp__chrome-devtools-mcp__take_screenshot` → evidence:
 *     `2-5-smoke-evidence/03-after-marker-jump-v2-saturn.png`.
 *
 * 18. `mcp__chrome-devtools-mcp__evaluate_script` → `window.history.back()`.
 *
 * 19. `mcp__chrome-devtools-mcp__wait_for` → URL change back to v1-jupiter.
 *
 * 20. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
 *     - `location.pathname === '/c/v1-jupiter'`
 *     - `new URLSearchParams(location.search).get('embed') === 'true'`
 *       (the BINDING preservation assertion — Story 2.4 pin replaced
 *        by Story 2.5)
 *
 * 21. `mcp__chrome-devtools-mcp__evaluate_script` → `window.history.forward()`.
 *
 * 22. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
 *     - `location.pathname === '/c/v2-saturn'`
 *     - `new URLSearchParams(location.search).get('embed') === 'true'`
 *
 * 23. `mcp__chrome-devtools-mcp__take_screenshot` → evidence:
 *     `2-5-smoke-evidence/04-after-back-forward-embed-preserved.png`.
 *
 * ### AC6 — touchscreen scrubber drag still works (Tier 2 touch parity)
 *
 * 24. `mcp__chrome-devtools-mcp__emulate` → mobile viewport (e.g.
 *     iPhone 14 — 390×844, touch-enabled) to verify the touchscreen
 *     scrubber drag works in embed mode. The scrubber is simulation
 *     surface (not chrome) so this should be unaffected by embed
 *     mode, but the Risk Mitigation Audit cites it explicitly.
 *
 * 25. `mcp__chrome-devtools-mcp__drag` → drag the scrubber knob across
 *     ~30% of the track width. Verify the `?t=` parameter updates in
 *     the URL and the `embed=true` parameter is preserved on the
 *     replaceState write.
 *
 * 26. `mcp__chrome-devtools-mcp__take_screenshot` → evidence:
 *     `2-5-smoke-evidence/05-touch-scrub-embed-preserved.png`.
 *
 * ### AC1 negative case — boot at /?embed=tRUE (mixed case)
 *
 * 27. `mcp__chrome-devtools-mcp__navigate_page` →
 *     `http://localhost:5173/?embed=tRUE`
 *
 * 28. `mcp__chrome-devtools-mcp__wait_for` → `__voyagerDebug.urlRouter`
 *     is defined.
 *
 * 29. `mcp__chrome-devtools-mcp__evaluate_script` — assert:
 *     - `window.__voyagerDebug.embedMode.enabled === false` (strict-
 *       boolean reject)
 *     - `document.querySelector('v-chapter-index') !== null` (the
 *       chapter-index IS mounted because embed mode parsed false)
 *     - `window.__voyagerDebug.chapterIndex !== null`
 *
 * 30. `mcp__chrome-devtools-mcp__take_screenshot` → evidence:
 *     `2-5-smoke-evidence/06-mixed-case-embed-falls-through.png`.
 *
 * ### Console hygiene
 *
 * 31. `mcp__chrome-devtools-mcp__list_console_messages` — assert no
 *     errors. The only allow-listed message is the Lit dev-mode banner
 *     (`https://lit.dev/msg/dev-mode`). Save as:
 *     `2-5-smoke-evidence/07-console.json`.
 *
 * ## Skip rules / notes
 *
 * - This story DOES touch `web/src/` (multiple files per the dev's
 *   File List), so the MCP smoke stage is REQUIRED — not skippable.
 * - Per voyager-skill-rules.md Rule 7, this smoke is **lead-executed**;
 *   QA sub-agents inherit the harness MCP tool inventory best-effort
 *   but the lead's tool inventory is the binding gate.
 * - axe-core: deferred to Story 6.4 (axe-core CI expansion) per the
 *   dev's Risk Mitigation Audit note. Do NOT add axe-core in the
 *   smoke probe sequence above — it belongs in the dedicated 6.4
 *   harness work, not bolted on here.
 * - The dev server must be running at port 5173 (`cd web && npm run
 *   dev`) before invoking the probe sequence.
 * - For deterministic timing, prefer `mcp__chrome-devtools-mcp__wait_for`
 *   on a DEV-surface predicate (e.g., `__voyagerDebug.urlRouter`,
 *   `location.pathname === ...`) rather than fixed `setTimeout` waits.
 */
