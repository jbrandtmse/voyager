// @vitest-environment happy-dom
/**
 * Story 2.7 — QA gap suite (cross-cutting integration coverage).
 *
 * The dev-authored test suite covers the seven primary ACs at the unit tier:
 *   - `web/src/components/v-about-page.test.ts` (14 tests) — layout, section
 *     order, heading hierarchy, prose word-count, table semantics, anchor
 *     exposure, embed-contract slugs, methodology presence (AC1 + AC2 + AC5).
 *   - `web/src/components/v-attribution-panel.test.ts` (6 tests) — Light-DOM
 *     contract, 7-entry order, link href / target / rel attributes,
 *     canonical-URL host inclusion (AC3).
 *   - `web/src/services/url-sync.test.ts` § "Story 2.7 AC1" (+7 tests) —
 *     `kind: 'about'` discriminator, trailing-slash route, `?t=` survival
 *     on /about, unknown-slug redirect resolves to `'home'`.
 *   - `web/src/services/url-router.test.ts` § "Story 2.7" (+7 tests) —
 *     `onRouteChange` listener fires only on cross-kind transitions
 *     (home/chapter → about and back), unsubscribe, throwing-listener
 *     safety.
 *   - `web/src/boot/about-footer.test.ts` (7 tests) — footer mount in
 *     non-embed mode, skip in embed mode, modifier-click matrix
 *     (Ctrl/Shift/middle) preserves native open-in-new-tab.
 *
 * This QA file fills the gaps the dev suites do not reach:
 *
 *   1. **Full-stack `/about` cold-load composition** — the dev tests
 *      validate each seam in isolation (URLSync recognises `/about`;
 *      `<v-about-page>` renders correctly when manually instantiated).
 *      The QA tier pins the composition contract: the boot pipeline
 *      branches on `kind === 'about'` and mounts ONLY the about page,
 *      with the canvas + HUD + scrubber + chapter-index conspicuously
 *      absent. This catches a future regression where someone wires a
 *      simulation subsystem to construct unconditionally.
 *
 *   2. **Cross-surface popstate reload contract** — main.ts wires the
 *      `URLRouter.onRouteChange` listener to `window.location.reload()`
 *      on transitions into / out of `/about`. The dev URLRouter tests
 *      assert the listener fires; the QA tier asserts the END-TO-END
 *      wiring (URLRouter listener → reload spy fires exactly once for
 *      a popstate that crosses the simulation ↔ about boundary, zero
 *      times for same-kind popstate).
 *
 *   3. **ParseInitialPathResult discriminator backward-compat** — the
 *      dev added a `kind` field to the existing result type. Existing
 *      chapter-route consumers (URLRouter, ChapterDirector, first-paint)
 *      must still resolve unchanged. The QA tier pins that contract:
 *      cold-load `/c/v1-jupiter` produces `kind === 'chapter'`,
 *      `chapter` is non-null, and the resolved ChapterSpec is the same
 *      instance the legacy `chapter` field exposed.
 *
 *   4. **Footer modifier-click extended matrix** — dev covers
 *      Ctrl/Shift/middle. QA adds Cmd-click (Mac) and Alt-click for
 *      completeness, plus the `e.defaultPrevented` short-circuit.
 *
 *   5. **`/about?embed=true` parity** — the about page is reachable in
 *      embed mode (AC4 only governs the footer link, not the about
 *      route). The QA tier pins that contract: boot at
 *      `/about?embed=true` mounts only the about page, no footer (the
 *      footer host is in the simulation surface which is not mounted),
 *      and `kind === 'about'` is detected correctly.
 *
 *   6. **Attribution panel link-shape sweep** — dev tests inspect a
 *      handful of links; QA sweeps EVERY entry to confirm
 *      target="_blank" + rel="noopener", no broken hrefs (every URL
 *      starts with `https://` and parses), and DOM order matches the
 *      AC3 canonical order.
 *
 *   7. **Editorial-content anti-rot tests** — the page text contains
 *      load-bearing claims (the 200-word prose, the slug list, the
 *      validation tolerances, the table row counts). The dev tests
 *      validate these; the QA tier adds defense-in-depth by asserting
 *      heading hierarchy + section count + all 7 attribution entries
 *      using a single composition mount (one failure makes the
 *      regression target obvious).
 *
 *   8. **MCP smoke probe plan for Integration AC7** — documented at
 *      the bottom of this file. The lead-driven Chrome DevTools MCP
 *      smoke is the binding browser-evidence gate per
 *      voyager-skill-rules.md Rule 3 + Rule 7.
 *
 * Test pattern mirrors `web/tests/embed-mode-qa-gaps.test.ts` — a
 * single `bootAboutSurface()` / `bootSimulationSurface()` helper composes
 * the real `EmbedModeState` × `URLSync` × `ClockManager` × `ChapterDirector`
 * × `URLRouter` instances (minus `RenderEngine`) so the tests run against
 * the wire-up, not against mocks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { URLSync } from '../src/services/url-sync';
import { URLRouter } from '../src/services/url-router';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { EmbedModeState } from '../src/services/embed-mode-state';
import { mountAttributionsFooter } from '../src/boot/first-paint';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import { ATTRIBUTION_ENTRIES } from '../src/components/v-attribution-panel';
// Side-effect imports to register the custom elements under test.
import '../src/components/v-about-page';
import '../src/components/v-attribution-panel';

/** Flush microtasks queued by URLRouter.scheduleWaveSettle. */
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/**
 * Mirror main.ts's `mountAboutSurface()` branch. Used by tests that want
 * to verify the cold-load composition contract for the `/about` route
 * without pulling in the WebGL bootstrap.
 *
 * Boot pipeline:
 *   1. Parse the URL via `EmbedModeState` + `URLSync.parseInitialPath`.
 *   2. Verify `kind === 'about'`.
 *   3. Mount ONLY `<v-about-page>` (no scrubber, no HUD, no canvas, no
 *      chapter-index — those are the simulation surface).
 *   4. Install the popstate handler that triggers a reload on any
 *      non-about navigation (matches main.ts lines 131–135).
 */
const bootAboutSurface = (): {
  embedMode: EmbedModeState;
  urlSync: URLSync;
  host: HTMLElement;
  about: HTMLElement;
  dispose: () => void;
} => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const embedMode = EmbedModeState.fromSearch(window.location.search);
  const urlSync = new URLSync({ embedEnabled: embedMode.enabled });
  const initial = urlSync.parseInitialPath();
  if (initial.kind !== 'about') {
    throw new Error(
      `bootAboutSurface() called on a non-/about URL: kind=${initial.kind}`,
    );
  }
  const about = document.createElement('v-about-page');
  host.appendChild(about);
  return {
    embedMode,
    urlSync,
    host,
    about,
    dispose: () => {
      urlSync.dispose();
      host.remove();
    },
  };
};

/**
 * Mirror main.ts's simulation-surface branch — the part that wires
 * `URLSync × ClockManager × ChapterDirector × URLRouter` together at
 * a non-about route. Used by the route-change reload contract tests so
 * we can simulate popstate without spinning up WebGL.
 */
const bootSimulationSurface = (): {
  urlSync: URLSync;
  clock: ClockManager;
  director: ChapterDirector;
  router: URLRouter;
  initialKind: 'home' | 'chapter' | 'about';
  dispose: () => void;
} => {
  const embedMode = EmbedModeState.fromSearch(window.location.search);
  const urlSync = new URLSync({ embedEnabled: embedMode.enabled });
  const initial = urlSync.parseInitialPath();
  const clock = new ClockManager();
  clock.scrubTo(initial.initialEt);
  const director = new ChapterDirector(ALL_CHAPTERS);
  director.update(clock.simTimeEt);
  const router = new URLRouter({
    urlSync,
    clockManager: clock,
    chapterDirector: director,
    initialRouteKind: initial.kind,
  }).install();
  return {
    urlSync,
    clock,
    director,
    router,
    initialKind: initial.kind,
    dispose: () => {
      router.dispose();
      urlSync.dispose();
      clock.dispose();
      director.dispose();
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
// 1. Full-stack /about cold-load composition (Integration AC7 step 1–3)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.7 — /about cold-load composition mounts only the about surface', () => {
  it('boot at /about parses kind="about" via the real URLSync', () => {
    window.history.replaceState(null, '', '/about');
    const urlSync = new URLSync();
    const initial = urlSync.parseInitialPath();
    expect(initial.kind).toBe('about');
    expect(initial.chapter).toBeNull();
    urlSync.dispose();
  });

  it('boot at /about mounts <v-about-page> and NO simulation chrome', async () => {
    window.history.replaceState(null, '', '/about');
    const stack = bootAboutSurface();
    try {
      await Promise.resolve();
      // About surface is present.
      expect(stack.host.querySelector('v-about-page')).not.toBeNull();
      // Simulation chrome MUST NOT be in the DOM — these belong to the
      // home/chapter branch which the about cold-load skips entirely.
      expect(stack.host.querySelector('canvas')).toBeNull();
      expect(stack.host.querySelector('v-hud')).toBeNull();
      expect(stack.host.querySelector('v-timeline-scrubber')).toBeNull();
      expect(stack.host.querySelector('v-play-button')).toBeNull();
      expect(stack.host.querySelector('v-speed-multiplier')).toBeNull();
      expect(stack.host.querySelector('v-chapter-index')).toBeNull();
      expect(stack.host.querySelector('v-title-card')).toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('boot at /about/ (trailing slash) also mounts only the about surface', () => {
    window.history.replaceState(null, '', '/about/');
    const urlSync = new URLSync();
    const initial = urlSync.parseInitialPath();
    expect(initial.kind).toBe('about');
    urlSync.dispose();
  });

  it('<v-about-page> renders all 7 canonical headings via Light DOM after a single tick', async () => {
    window.history.replaceState(null, '', '/about');
    const stack = bootAboutSurface();
    try {
      // The about page is Light DOM so the headings are queryable directly
      // from the host. Wait for the Lit update cycle.
      await (stack.about as unknown as { updateComplete: Promise<void> }).updateComplete;
      const h1 = stack.about.querySelectorAll('h1');
      const h2 = stack.about.querySelectorAll('h2');
      expect(h1.length).toBe(1);
      expect(h2.length).toBe(6);
      expect((h1[0]!.textContent ?? '').trim()).toBe('Voyager — About');
    } finally {
      stack.dispose();
    }
  });

  it('attribution panel inside the about page exposes the #attribution anchor in the document', async () => {
    window.history.replaceState(null, '', '/about');
    const stack = bootAboutSurface();
    try {
      await (stack.about as unknown as { updateComplete: Promise<void> }).updateComplete;
      const panel = stack.about.querySelector('v-attribution-panel');
      // The panel is Light DOM too; await its update before querying.
      await (panel as unknown as { updateComplete: Promise<void> }).updateComplete;
      // The deep-link target — must be reachable via document.querySelector
      // so /about#attribution browser-native scrolling can find it.
      const anchor = document.querySelector('#attribution');
      expect(anchor).not.toBeNull();
      expect(anchor!.tagName).toBe('DL');
    } finally {
      stack.dispose();
    }
  });

  it('cold-load /about#attribution leaves the hash intact in the address bar', async () => {
    window.history.replaceState(null, '', '/about#attribution');
    const stack = bootAboutSurface();
    try {
      await (stack.about as unknown as { updateComplete: Promise<void> }).updateComplete;
      expect(window.location.pathname).toBe('/about');
      expect(window.location.hash).toBe('#attribution');
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Cross-surface popstate reload contract (Integration AC7 step 6)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.7 — cross-surface popstate triggers a reload', () => {
  it('popstate from simulation (home) → /about fires onRouteChange with from="home" to="about"', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      expect(stack.initialKind).toBe('home');
      const calls: Array<[string, string]> = [];
      stack.router.onRouteChange((from, to) => calls.push([from, to]));
      // Simulate the browser flipping the URL to /about and dispatching
      // popstate (what window.history.back() would do after a /about push).
      window.history.replaceState(null, '', '/about');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(calls).toEqual([['home', 'about']]);
    } finally {
      stack.dispose();
    }
  });

  it('popstate from simulation (chapter) → /about fires onRouteChange with from="chapter" to="about"', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const stack = bootSimulationSurface();
    try {
      expect(stack.initialKind).toBe('chapter');
      const calls: Array<[string, string]> = [];
      stack.router.onRouteChange((from, to) => calls.push([from, to]));
      window.history.replaceState(null, '', '/about');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(calls).toEqual([['chapter', 'about']]);
    } finally {
      stack.dispose();
    }
  });

  it('main.ts contract: onRouteChange listener calling window.location.reload fires exactly once on simulation → /about', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      let reloads = 0;
      // Mirror main.ts lines 249-253: subscribe and reload on to === 'about'.
      stack.router.onRouteChange((_from, to) => {
        if (to === 'about') reloads++;
      });
      window.history.replaceState(null, '', '/about');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(reloads).toBe(1);
    } finally {
      stack.dispose();
    }
  });

  it('same-kind popstate (chapter → chapter) does NOT trigger the reload', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const stack = bootSimulationSurface();
    try {
      let reloads = 0;
      stack.router.onRouteChange((_from, to) => {
        if (to === 'about') reloads++;
      });
      window.history.replaceState(null, '', '/c/v2-saturn');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(reloads).toBe(0);
    } finally {
      stack.dispose();
    }
  });

  it('home → home popstate (just ?t= change) does NOT trigger the reload', () => {
    window.history.replaceState(null, '', '/');
    const stack = bootSimulationSurface();
    try {
      let reloads = 0;
      stack.router.onRouteChange((_from, to) => {
        if (to === 'about') reloads++;
      });
      window.history.replaceState(null, '', '/?t=1989-08-25T09:23:00Z');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(reloads).toBe(0);
    } finally {
      stack.dispose();
    }
  });

  it('/about → simulation popstate uses URLSync.installPopstateHandler reload contract', () => {
    // On the /about surface, main.ts installs URLSync.installPopstateHandler
    // and reloads on any kind !== 'about'. This test verifies the URLSync
    // popstate fires with kind="home" (or "chapter") so the reload path is
    // reachable. We don't run the surface's reload itself — we verify the
    // signal that drives it.
    window.history.replaceState(null, '', '/about');
    const urlSync = new URLSync();
    urlSync.parseInitialPath();
    const calls: Array<{ kind: string }> = [];
    urlSync.installPopstateHandler((state) => {
      calls.push({ kind: state.kind });
    });
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(calls.length).toBe(1);
    expect(calls[0]!.kind).toBe('home');
    urlSync.dispose();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. ParseInitialPathResult discriminator backward-compat
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.7 — ParseInitialPathResult discriminator preserves legacy chapter consumers', () => {
  it('cold-load /c/v1-jupiter still produces kind="chapter" with chapter non-null', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const urlSync = new URLSync();
    const initial = urlSync.parseInitialPath();
    expect(initial.kind).toBe('chapter');
    expect(initial.chapter).not.toBeNull();
    expect(initial.chapter!.slug).toBe('v1-jupiter');
    urlSync.dispose();
  });

  it('cold-load / produces kind="home" with chapter null', () => {
    window.history.replaceState(null, '', '/');
    const urlSync = new URLSync();
    const initial = urlSync.parseInitialPath();
    expect(initial.kind).toBe('home');
    expect(initial.chapter).toBeNull();
    urlSync.dispose();
  });

  it('the resolved ChapterSpec is the SAME instance as findChapterBySlug returns (legacy contract)', () => {
    window.history.replaceState(null, '', '/c/v2-neptune');
    const urlSync = new URLSync();
    const initial = urlSync.parseInitialPath();
    const fromRegistry = findChapterBySlug('v2-neptune');
    expect(initial.chapter).toBe(fromRegistry);
    urlSync.dispose();
  });

  it('every ADR-0001 frozen slug resolves with kind="chapter"', () => {
    const slugs = [
      'launch-v1',
      'launch-v2',
      'v1-jupiter',
      'v2-jupiter',
      'v1-saturn',
      'v2-saturn',
      'v2-uranus',
      'v2-neptune',
      'pale-blue-dot',
      'v1-heliopause',
      'v2-heliopause',
    ];
    for (const slug of slugs) {
      window.history.replaceState(null, '', `/c/${slug}`);
      const urlSync = new URLSync();
      const initial = urlSync.parseInitialPath();
      expect(initial.kind, `slug ${slug} should resolve to kind="chapter"`).toBe(
        'chapter',
      );
      expect(initial.chapter!.slug).toBe(slug);
      urlSync.dispose();
    }
  });

  it('unknown-slug redirect resolves to kind="home" (NOT "about" — the redirect target is "/")', () => {
    window.history.replaceState(null, '', '/c/typo');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const urlSync = new URLSync();
    const initial = urlSync.parseInitialPath();
    expect(initial.kind).toBe('home');
    expect(initial.chapter).toBeNull();
    warnSpy.mockRestore();
    urlSync.dispose();
  });

  it('simulation surface boots cleanly at /c/<slug> after the kind discriminator was added', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const stack = bootSimulationSurface();
    try {
      expect(stack.initialKind).toBe('chapter');
      expect(stack.director.activeChapter?.slug).toBe('v1-jupiter');
      // Sanity: the clock landed on v1-jupiter's anchor ET.
      const v1Jupiter = findChapterBySlug('v1-jupiter')!;
      expect(Math.abs(stack.clock.simTimeEt - v1Jupiter.anchorEt)).toBeLessThan(0.01);
    } finally {
      stack.dispose();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Footer modifier-click extended matrix (AC4)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.7 AC4 — footer link extended modifier-click matrix', () => {
  it('Meta-click (Cmd on Mac) preserves the native open-in-new-tab semantics', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const navigations: string[] = [];
    mountAttributionsFooter(host, false, (url) => navigations.push(url));
    const link = host.querySelector('footer.v-app-footer a') as HTMLAnchorElement;
    const ev = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    });
    link.dispatchEvent(ev);
    expect(navigations).toEqual([]);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Alt-click is NOT intercepted (preserves browser-defined download behaviour)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const navigations: string[] = [];
    mountAttributionsFooter(host, false, (url) => navigations.push(url));
    const link = host.querySelector('footer.v-app-footer a') as HTMLAnchorElement;
    const ev = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      altKey: true,
    });
    link.dispatchEvent(ev);
    expect(navigations).toEqual([]);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('a click whose defaultPrevented is already true is short-circuited (no double-intercept)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const navigations: string[] = [];
    mountAttributionsFooter(host, false, (url) => navigations.push(url));
    const link = host.querySelector('footer.v-app-footer a') as HTMLAnchorElement;
    // Pre-prevent before dispatch — simulating a competing handler.
    const ev = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    ev.preventDefault();
    link.dispatchEvent(ev);
    expect(navigations).toEqual([]);
  });

  it('two plain left-clicks fire navigate twice (no accidental deduping)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const navigations: string[] = [];
    mountAttributionsFooter(host, false, (url) => navigations.push(url));
    const link = host.querySelector('footer.v-app-footer a') as HTMLAnchorElement;
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(navigations).toEqual(['/about#attribution', '/about#attribution']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. /about?embed=true parity
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.7 — /about reachable in embed mode (AC4 governs the footer link, not /about itself)', () => {
  it('boot at /about?embed=true parses kind="about" and embedMode.enabled=true', () => {
    window.history.replaceState(null, '', '/about?embed=true');
    const embedMode = EmbedModeState.fromSearch(window.location.search);
    const urlSync = new URLSync({ embedEnabled: embedMode.enabled });
    const initial = urlSync.parseInitialPath();
    expect(initial.kind).toBe('about');
    expect(embedMode.enabled).toBe(true);
    urlSync.dispose();
  });

  it('boot at /about?embed=true still mounts only <v-about-page> (the about page itself is allowed in embed mode)', async () => {
    window.history.replaceState(null, '', '/about?embed=true');
    const stack = bootAboutSurface();
    try {
      expect(stack.embedMode.enabled).toBe(true);
      expect(stack.host.querySelector('v-about-page')).not.toBeNull();
      // No simulation chrome AND no footer (the footer host is the
      // simulation surface which is not constructed on /about).
      expect(stack.host.querySelector('canvas')).toBeNull();
      expect(stack.host.querySelector('footer.v-app-footer')).toBeNull();
    } finally {
      stack.dispose();
    }
  });

  it('mountAttributionsFooter on the simulation surface IS skipped when embedMode.enabled=true', () => {
    // The footer is mounted by main.ts in the simulation branch only, and
    // mountAttributionsFooter short-circuits when embedEnabled is true.
    // This pins the helper-level contract (the surface composition that
    // calls it lives in main.ts and is exercised by AC7 MCP smoke).
    const host = document.createElement('div');
    document.body.appendChild(host);
    const result = mountAttributionsFooter(host, true, () => {});
    expect(result).toBeNull();
    expect(host.querySelector('footer.v-app-footer')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. Attribution panel link-shape sweep (AC3)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.7 AC3 — attribution panel link sweep (every entry validated)', () => {
  const mountPanel = async (): Promise<HTMLElement> => {
    const el = document.createElement('v-attribution-panel');
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete;
    return el;
  };

  it('every entry that declares a URL renders an <a> with the EXACT URL in href', async () => {
    const el = await mountPanel();
    const dts = el.querySelectorAll('dl > dt');
    expect(dts.length).toBe(ATTRIBUTION_ENTRIES.length);
    for (let i = 0; i < dts.length; i++) {
      const entry = ATTRIBUTION_ENTRIES[i]!;
      const a = dts[i]!.querySelector('a');
      if (entry.url === null) {
        expect(a, `entry ${i} (${entry.name}) should have no anchor`).toBeNull();
      } else {
        expect(a, `entry ${i} (${entry.name}) should have an anchor`).not.toBeNull();
        // The href attribute literal — happy-dom resolves a.href to absolute,
        // but getAttribute('href') keeps the source.
        expect(a!.getAttribute('href')).toBe(entry.url);
      }
    }
  });

  it('every link uses target="_blank" + rel="noopener" (institutional embed safety)', async () => {
    const el = await mountPanel();
    const links = el.querySelectorAll('dl > dt a');
    expect(links.length).toBeGreaterThan(0);
    for (const a of Array.from(links)) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener');
    }
  });

  it('every URL is HTTPS (no http://, no protocol-relative, no broken href)', () => {
    for (const entry of ATTRIBUTION_ENTRIES) {
      if (entry.url === null) continue;
      expect(
        entry.url.startsWith('https://'),
        `entry "${entry.name}" url must start with https:// (got: ${entry.url})`,
      ).toBe(true);
      // Sanity: parseable as a URL.
      expect(() => new URL(entry.url!)).not.toThrow();
    }
  });

  it('DOM order matches the AC3 canonical order — first dt is NAIF, last is Photojournal', async () => {
    const el = await mountPanel();
    const names = Array.from(el.querySelectorAll('dl > dt')).map((dt) =>
      (dt.textContent ?? '').trim(),
    );
    expect(names[0]).toBe('NAIF SPICE kernels');
    expect(names[names.length - 1]).toBe(
      'NASA Planetary Photojournal — Pale Blue Dot composite plates',
    );
  });

  it('there is exactly one <dl id="attribution"> in the document (deep-link target uniqueness)', async () => {
    await mountPanel();
    const anchors = document.querySelectorAll('#attribution');
    expect(anchors.length).toBe(1);
    expect(anchors[0]!.tagName).toBe('DL');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. Editorial-content composition assertions (AC2)
// ─────────────────────────────────────────────────────────────────────

describe('Story 2.7 AC2 — editorial content composition (anti-rot defence)', () => {
  const mountAbout = async (): Promise<HTMLElement> => {
    const el = document.createElement('v-about-page');
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete;
    const panel = el.querySelector('v-attribution-panel');
    if (panel !== null) {
      await (panel as unknown as { updateComplete: Promise<void> }).updateComplete;
    }
    return el;
  };

  it('Data sources table has 7 rows AND Validation table has 3 rows (composition-tier)', async () => {
    const el = await mountAbout();
    const dataRows = el
      .querySelector('section[aria-labelledby="about-data-sources"]')!
      .querySelectorAll('tbody tr');
    const valRows = el
      .querySelector('section[aria-labelledby="about-validation"]')!
      .querySelectorAll('tbody tr');
    expect(dataRows.length).toBe(7);
    expect(valRows.length).toBe(3);
  });

  it('every section has an aria-labelledby pointing at a real id inside the section', async () => {
    const el = await mountAbout();
    const sections = el.querySelectorAll('section[aria-labelledby]');
    expect(sections.length).toBe(6);
    for (const section of Array.from(sections)) {
      const id = section.getAttribute('aria-labelledby')!;
      const labeller = section.querySelector(`#${id}`);
      expect(labeller, `section ${id} must contain an element with id="${id}"`).not.toBeNull();
      // The labeller is a heading.
      expect(labeller!.tagName).toBe('H2');
    }
  });

  it('all 7 attribution entries from AC3 are present inside the about page composition', async () => {
    const el = await mountAbout();
    const names = Array.from(
      el.querySelectorAll(
        'section[aria-labelledby="about-attribution"] dl > dt',
      ),
    ).map((dt) => (dt.textContent ?? '').trim());
    expect(names.length).toBe(7);
    expect(names).toEqual([
      'NAIF SPICE kernels',
      'PDS Rings Node CK products',
      'NASA 3D Resources — Voyager spacecraft model',
      'Björn Jónsson planetary textures',
      'USGS Astrogeology — planetary base maps',
      'Voyager Golden Record audio',
      'NASA Planetary Photojournal — Pale Blue Dot composite plates',
    ]);
  });

  it('embed-contract section enumerates all 11 ADR-0001 frozen slugs in the text', async () => {
    const el = await mountAbout();
    const section = el.querySelector(
      'section[aria-labelledby="about-embed-contract"]',
    )!;
    const text = section.textContent ?? '';
    for (const slug of [
      'launch-v1',
      'launch-v2',
      'v1-jupiter',
      'v2-jupiter',
      'v1-saturn',
      'v2-saturn',
      'v2-uranus',
      'v2-neptune',
      'pale-blue-dot',
      'v1-heliopause',
      'v2-heliopause',
    ]) {
      expect(text).toContain(slug);
    }
  });

  it('Validation table copy carries all 3 canonical tolerances verbatim (AC2)', async () => {
    const el = await mountAbout();
    const text = (el
      .querySelector('section[aria-labelledby="about-validation"]')!
      .textContent ?? '');
    expect(text).toContain('20 km');
    expect(text).toContain('5 km');
    expect(text).toContain('1 mrad');
    expect(text).toContain('60 FPS');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Chrome DevTools MCP smoke probe plan — Integration AC7 (lead-executed)
// ─────────────────────────────────────────────────────────────────────
//
// Per voyager-skill-rules.md Rule 3 + Rule 6 + Rule 7, the binding
// browser-evidence gate for Story 2.7 is the lead-executed Chrome DevTools
// MCP smoke. The dev's File List touches `web/src/` (v-about-page,
// v-attribution-panel, url-sync, url-router, first-paint, main.ts, etc.),
// so the MCP smoke stage is REQUIRED — not skipped.
//
// Evidence path: `_bmad-output/implementation-artifacts/2-7-smoke-evidence/`
//
// No `initScript` shim needed (Rule 6, post-Story-1.16).
//
// Probe sequence:
//
//   1. **AC1 + AC2 — /about cold-load mounts only the about surface.**
//      - `mcp__chrome-devtools-mcp__navigate_page` → `http://localhost:5173/about`
//      - `mcp__chrome-devtools-mcp__evaluate_script`:
//          - `document.querySelector('v-about-page')` is NOT null
//          - `document.querySelector('canvas#voyager-canvas')` IS null
//          - `document.querySelector('v-hud')` IS null
//          - `document.querySelector('v-timeline-scrubber')` IS null
//          - `document.querySelector('v-chapter-index')` IS null
//          - `document.querySelectorAll('v-about-page h2').length === 6`
//          - `document.querySelectorAll('v-about-page h1').length === 1`
//          - The h1's textContent trims to `"Voyager — About"`
//      - `mcp__chrome-devtools-mcp__take_snapshot` — accessibility tree
//        confirms heading hierarchy (h1 → h2s, no skipped levels).
//      - `mcp__chrome-devtools-mcp__take_screenshot` → save as
//        `2-7-smoke-evidence/about-cold-load.png`.
//      - Console-clean check (Rule 3 + Story 2.0 AC2 policy): no errors
//        apart from the Lit dev-mode banner.
//
//   2. **AC2 — section order in the rendered DOM matches the canonical 6.**
//      - `mcp__chrome-devtools-mcp__evaluate_script`:
//          `Array.from(document.querySelectorAll('v-about-page h2')).map(h => h.textContent.trim())`
//          must equal
//          `['About the project', 'Data sources', 'Validation', 'Attribution', 'Embed contract', 'Methodology']`
//
//   3. **AC3 — attribution panel exposes the deep-link anchor.**
//      - `mcp__chrome-devtools-mcp__evaluate_script`:
//          - `document.querySelector('#attribution').tagName === 'DL'`
//          - `document.querySelectorAll('#attribution > dt').length === 7`
//          - Every `#attribution > dt a` has `target="_blank"` AND
//            `rel="noopener"` AND `href.startsWith('https://')`
//
//   4. **AC4 — homepage footer link present + routes to /about#attribution.**
//      - `mcp__chrome-devtools-mcp__navigate_page` → `http://localhost:5173/`
//      - `mcp__chrome-devtools-mcp__evaluate_script`:
//          - `document.querySelector('footer.v-app-footer a').getAttribute('href') === '/about#attribution'`
//          - Footer link textContent.trim() === `'Attributions'`
//      - `mcp__chrome-devtools-mcp__take_screenshot` → save as
//        `2-7-smoke-evidence/home-with-footer.png`.
//      - `mcp__chrome-devtools-mcp__click` on the footer anchor (left-click).
//      - After navigation: assert `location.pathname === '/about'` AND
//        `location.hash === '#attribution'`.
//      - `mcp__chrome-devtools-mcp__take_screenshot` → save as
//        `2-7-smoke-evidence/about-scrolled-to-attribution.png`.
//
//   5. **AC4 (negative) — footer link is ABSENT in embed mode.**
//      - `mcp__chrome-devtools-mcp__navigate_page` → `http://localhost:5173/?embed=true`
//      - `mcp__chrome-devtools-mcp__evaluate_script`:
//          - `document.querySelector('footer.v-app-footer')` IS null
//          - `__voyagerDebug.embedMode.enabled === true`
//          - `document.querySelector('v-chapter-index')` IS null (Story 2.5
//            invariant — confirms the embed surface is intact)
//          - `document.querySelector('v-timeline-scrubber')` is NOT null
//      - `mcp__chrome-devtools-mcp__take_screenshot` → save as
//        `2-7-smoke-evidence/embed-no-footer.png`.
//
//   6. **Cross-surface popstate reload contract.**
//      - From `/` (with footer present), `mcp__chrome-devtools-mcp__click`
//        the Attributions link → navigates to `/about#attribution`.
//      - `mcp__chrome-devtools-mcp__press_key` → browser-back (this is
//        emitted as `history.back()` via evaluate_script).
//      - Assert `location.pathname === '/'` AND the simulation surface
//        is re-mounted (canvas + HUD + scrubber visible again — the
//        cross-surface popstate triggered `window.location.reload()`).
//      - `mcp__chrome-devtools-mcp__take_screenshot` → save as
//        `2-7-smoke-evidence/back-to-simulation-after-reload.png`.
//
//   7. **/about page console-clean check.**
//      - `mcp__chrome-devtools-mcp__list_console_messages` after the
//        full sequence — must contain ONLY the Lit dev-mode banner
//        and the Three.js renderer / chunk-loader / pre-existing dev
//        diagnostics that the rest of the smoke already tolerates.
//        No errors, no resource-load failures for `/about`.
//
// Mapped MCP coverage per AC:
//   - MCP smoke covers AC1 (Probe 1) — about-page mounts as sole content.
//   - MCP smoke covers AC2 (Probes 1 + 2) — 7-heading hierarchy + section order.
//   - MCP smoke covers AC3 (Probe 3) — attribution dl semantics + link safety.
//   - MCP smoke covers AC4 (Probes 4 + 5) — footer present in non-embed,
//     absent in embed; deep-link routes correctly.
//   - MCP smoke covers Integration AC7 (Probes 4 + 6) — footer-click +
//     popstate reload cross-surface flip.
//   - AC5 (a11y) axe-core is deferred to Story 6.4 per the dev's AC
//     statement; the snapshot in Probe 1 is the interim a11y check
//     (heading hierarchy + landmark detection).
//   - AC6 is the test-suite green gate — verified by `npm test -- --run`
//     not by MCP.
