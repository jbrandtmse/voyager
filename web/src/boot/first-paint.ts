/**
 * First-paint sequence (Story 1.9 + Story 1.10).
 *
 * Mounts `<v-title-card>` immediately on boot, then constructs the shared
 * `ClockManager` and wires it into `<v-timeline-scrubber>`,
 * `<v-play-button>`, and `<v-speed-multiplier>` (all hidden until the
 * title-card dissolve completes). The global Space-key shortcut is
 * installed here too. Parses any `?t=<iso>` URL parameter via URLSync
 * (silent reject on malformed per NFR-S7).
 *
 * Lives in `boot/` (not `main.ts`) so tests can import the function
 * without triggering main.ts's WebGL bootstrap.
 */
import { URLSync } from '../services/url-sync';
import { ClockManager } from '../services/clock-manager';
import { installKeyboardShortcuts } from './keyboard-shortcuts';
import '../components/v-title-card';
import '../components/v-timeline-scrubber';
import '../components/v-play-button';
import '../components/v-speed-multiplier';
import '../components/v-hud';
import '../components/v-chapter-index';
import type { VTimelineScrubber } from '../components/v-timeline-scrubber';
import type { VPlayButton } from '../components/v-play-button';
import type { VSpeedMultiplier } from '../components/v-speed-multiplier';
import type { VHud } from '../components/v-hud';
import type { VChapterIndex } from '../components/v-chapter-index';
import type { RenderEngine } from '../render/render-engine';
import type { EphemerisService } from '../services/ephemeris-service';
import type { ChapterDirector } from '../services/chapter-director';

/**
 * Story 2.7 AC4 — mount the homepage "Attributions" footer link unless
 * embed mode is enabled. Returns the mounted footer (or null) so callers
 * can include it in the dispose path. The link uses a native anchor with
 * `href="/about#attribution"` — clicking is handled by the URLRouter's
 * existing chapter-jump / popstate machinery once we promote the click
 * through pushState; we keep the implementation here minimal and rely on
 * a click handler so the SPA navigation does not cause a full reload.
 */
export const mountAttributionsFooter = (
  host: HTMLElement,
  embedEnabled: boolean,
  navigate: (url: string) => void,
): HTMLElement | null => {
  if (embedEnabled) return null;
  const footer = document.createElement('footer');
  footer.className = 'v-app-footer';
  const link = document.createElement('a');
  link.href = '/about#attribution';
  link.textContent = 'Attributions';
  link.addEventListener('click', (e: MouseEvent) => {
    // Only intercept plain left-clicks; modifier-clicks (Ctrl/Cmd/Shift/
    // middle-click) keep their native open-in-new-tab semantics.
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    navigate('/about#attribution');
  });
  footer.appendChild(link);
  host.appendChild(footer);
  return footer;
};

export interface FirstPaintOptions {
  /** When provided, the HUD wires its per-frame tick into the engine. */
  renderEngine?: RenderEngine;
  /** When provided, `<v-hud-distance>` reads V1/V2 positions through it. */
  ephemerisService?: EphemerisService;
  /**
   * Story 1.15 — caller-supplied `ClockManager`. When `main.ts` constructs
   * the clock up-front so it can also be wired into `RenderEngine`, it
   * passes the same instance here so the scrubber / play button / speed
   * multiplier / HUD share the canonical clock. Omitting the option keeps
   * the Story 1.10 behavior of constructing a fresh `ClockManager` here
   * (used by tests).
   */
  clockManager?: ClockManager;
  /**
   * Story 2.2 — caller-supplied `ChapterDirector`. When provided, set on
   * the scrubber BEFORE its `connectedCallback` runs so the chapter-
   * transition subscription wires in cleanly during the first paint.
   * Omitting the option leaves the scrubber's `chapters` slot empty,
   * preserving Story 1.9-only test setups.
   */
  chapterDirector?: ChapterDirector;
  /**
   * Story 2.4 — caller-supplied `URLSync`. When provided, first-paint
   * skips its own `parseInitialT()` + `scrubTo(initialEt)` seed (main.ts
   * has already done it via `parseInitialPath()`) and just forwards the
   * shared instance to the scrubber. When omitted, the legacy Story 1.9
   * `?t=` parse runs as before.
   */
  urlSync?: URLSync;
  /**
   * Story 2.5 — chrome-less embed mode. When `true`, first-paint SKIPS
   * mounting chrome elements (the chapter-index toggle today; about /
   * methodology / help links in future stories). It does NOT add
   * `display: none` after mount — the elements are not in the DOM at
   * all, so document-level keyboard shortcuts they own (M / 1..9) are
   * automatically NO-OPS because no listener is attached. Wire from
   * `EmbedModeState.fromSearch(location.search).enabled` at boot.
   *
   * The simulation surface — canvas, HUD, scrubber, play button, speed
   * multiplier — still mounts normally; those are the embed view's
   * actual content, not chrome.
   *
   * Per AC2, mounting via conditional `appendChild` (rather than
   * post-mount `display: none`) is the binding contract: a kiosk-host
   * cannot accidentally toggle the toggle button back on by editing CSS.
   */
  embedEnabled?: boolean;
}

export interface FirstPaintHandle {
  titleCard: HTMLElement;
  scrubber: VTimelineScrubber;
  playButton: VPlayButton;
  speedMultiplier: VSpeedMultiplier;
  hud: VHud;
  /**
   * Story 2.5 — `null` when `embedEnabled === true` (the chapter-index
   * is intentionally not mounted in embed mode); otherwise the mounted
   * `<v-chapter-index>` element. Consumers like main.ts's debug surface
   * must null-check before exposing it.
   */
  chapterIndex: VChapterIndex | null;
  clockManager: ClockManager;
  urlSync: URLSync;
  /** Detach the global keyboard handlers and stop subscriptions. */
  dispose: () => void;
}

/**
 * Mount the first-paint sequence in `host` (defaults to document.body).
 *
 * Returns a handle exposing the mounted elements for callers that need to
 * inspect them (e.g. tests, or downstream stories that wire the scrubber
 * to a real ClockManager).
 */
export const startFirstPaint = (
  host: HTMLElement = document.body,
  options: FirstPaintOptions = {},
): FirstPaintHandle => {
  // Story 2.4 — when main.ts already constructed a URLSync (so it could
  // parse `/c/<slug>` AND `?t=` together via parseInitialPath), reuse
  // that instance and skip the internal seed. Otherwise fall back to the
  // Story 1.9 `?t=`-only path, which keeps every existing test that
  // never set up a chapter route working unchanged.
  const externalUrlSync = options.urlSync !== undefined;
  const urlSync = options.urlSync ?? new URLSync();

  // Reuse a caller-supplied ClockManager if one was provided (Story 1.15
  // wires the same instance into RenderEngine before `startFirstPaint`
  // runs). Falling back to a fresh instance preserves the legacy Story
  // 1.10 test-only call site that didn't construct a clock externally.
  const clockManager = options.clockManager ?? new ClockManager();
  if (!externalUrlSync) {
    const { initialEt } = urlSync.parseInitialT();
    // Seed the clock to the URL-parsed ET. Uses scrubTo so the clamp + pause
    // semantics apply uniformly. ?t= always lands paused.
    clockManager.scrubTo(initialEt);
  }

  const titleCard = document.createElement('v-title-card');
  host.appendChild(titleCard);

  const scrubber = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
  scrubber.urlSync = urlSync;
  scrubber.clockManager = clockManager;
  if (options.chapterDirector !== undefined) {
    // Story 2.2 — set BEFORE appendChild so the scrubber's
    // connectedCallback sees the director and wires the transition
    // subscription on the same tick the scrubber mounts.
    scrubber.chapterDirector = options.chapterDirector;
  }
  scrubber.style.visibility = 'hidden';
  host.appendChild(scrubber);

  const playButton = document.createElement('v-play-button') as VPlayButton;
  playButton.clockManager = clockManager;
  playButton.style.visibility = 'hidden';
  host.appendChild(playButton);

  const speedMultiplier = document.createElement(
    'v-speed-multiplier',
  ) as VSpeedMultiplier;
  speedMultiplier.clockManager = clockManager;
  speedMultiplier.style.visibility = 'hidden';
  host.appendChild(speedMultiplier);

  // Story 1.11 — HUD overlay. Wired with the shared ClockManager + (optional)
  // EphemerisService; the host (main.ts) supplies them when available.
  const hud = document.createElement('v-hud') as VHud;
  hud.clockManager = clockManager;
  if (options.ephemerisService !== undefined) {
    hud.ephemerisService = options.ephemerisService;
  }
  hud.style.visibility = 'hidden';
  host.appendChild(hud);

  // Story 2.3 — chapter index (top-right hamburger toggle).
  //
  // Story 2.5 (AC2) — in embed mode, the chapter-index toggle is chrome
  // and is NOT appended to the DOM. The element's connectedCallback is
  // what registers the global `M` + `1..9` keyboard shortcuts; by
  // skipping the appendChild we automatically achieve the AC3 contract
  // that those shortcuts become NO-OPS in embed mode (no listener
  // attached). The kiosk-host cannot accidentally toggle the panel back
  // on via CSS — there is no element to unhide.
  //
  // Future Story 2.7 (About / Methodology links) and Story 2.8 (help
  // overlay icon) should follow the SAME conditional-mount pattern: if
  // (!options.embedEnabled) host.appendChild(...).
  let chapterIndex: VChapterIndex | null = null;
  if (options.embedEnabled !== true) {
    chapterIndex = document.createElement('v-chapter-index') as VChapterIndex;
    chapterIndex.clockManager = clockManager;
    if (options.chapterDirector !== undefined) {
      chapterIndex.chapterDirector = options.chapterDirector;
    }
    chapterIndex.style.visibility = 'hidden';
    host.appendChild(chapterIndex);
  }

  // Per-frame visible-DOM mutation lives outside Lit reactivity
  // (architecture line 424). When a RenderEngine is wired, hook each frame.
  let detachFrame: (() => void) | null = null;
  if (options.renderEngine !== undefined) {
    detachFrame = options.renderEngine.onFrame((et: number) => {
      hud.tick(et);
    });
  }

  const detachKeyboard = installKeyboardShortcuts(clockManager);

  const onComplete = (): void => {
    titleCard.remove();
    scrubber.style.visibility = '';
    playButton.style.visibility = '';
    speedMultiplier.style.visibility = '';
    hud.style.visibility = '';
    // Story 2.5 — chapterIndex is null in embed mode (not appended).
    if (chapterIndex !== null) {
      chapterIndex.style.visibility = '';
    }
  };
  titleCard.addEventListener('voyager:title-card-complete', onComplete, { once: true });

  const ownsClock = options.clockManager === undefined;
  const dispose = (): void => {
    detachKeyboard();
    if (detachFrame !== null) {
      detachFrame();
      detachFrame = null;
    }
    if (ownsClock) {
      clockManager.dispose();
    }
  };

  return {
    titleCard,
    scrubber,
    playButton,
    speedMultiplier,
    hud,
    chapterIndex,
    clockManager,
    urlSync,
    dispose,
  };
};
