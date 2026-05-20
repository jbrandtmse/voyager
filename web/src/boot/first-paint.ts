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
}

export interface FirstPaintHandle {
  titleCard: HTMLElement;
  scrubber: VTimelineScrubber;
  playButton: VPlayButton;
  speedMultiplier: VSpeedMultiplier;
  hud: VHud;
  chapterIndex: VChapterIndex;
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

  // Story 2.3 — chapter index (top-right hamburger toggle). Wired with the
  // shared ClockManager (for scrubTo-on-activation) and the same
  // ChapterDirector the scrubber consumes (so aria-current tracks the
  // held chapter). Both must be set BEFORE appendChild so the
  // connectedCallback sees them and the chapter-transition subscription
  // wires in cleanly. Visibility tracks the rest of the chrome —
  // hidden until the title-card dissolves.
  const chapterIndex = document.createElement('v-chapter-index') as VChapterIndex;
  chapterIndex.clockManager = clockManager;
  if (options.chapterDirector !== undefined) {
    chapterIndex.chapterDirector = options.chapterDirector;
  }
  chapterIndex.style.visibility = 'hidden';
  host.appendChild(chapterIndex);

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
    chapterIndex.style.visibility = '';
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
