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
import type { VTimelineScrubber } from '../components/v-timeline-scrubber';
import type { VPlayButton } from '../components/v-play-button';
import type { VSpeedMultiplier } from '../components/v-speed-multiplier';
import type { VHud } from '../components/v-hud';
import type { RenderEngine } from '../render/render-engine';
import type { EphemerisService } from '../services/ephemeris-service';

export interface FirstPaintOptions {
  /** When provided, the HUD wires its per-frame tick into the engine. */
  renderEngine?: RenderEngine;
  /** When provided, `<v-hud-distance>` reads V1/V2 positions through it. */
  ephemerisService?: EphemerisService;
}

export interface FirstPaintHandle {
  titleCard: HTMLElement;
  scrubber: VTimelineScrubber;
  playButton: VPlayButton;
  speedMultiplier: VSpeedMultiplier;
  hud: VHud;
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
  const urlSync = new URLSync();
  const { initialEt } = urlSync.parseInitialT();

  const clockManager = new ClockManager();
  // Seed the clock to the URL-parsed ET. Uses scrubTo so the clamp + pause
  // semantics apply uniformly. ?t= always lands paused.
  clockManager.scrubTo(initialEt);

  const titleCard = document.createElement('v-title-card');
  host.appendChild(titleCard);

  const scrubber = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
  scrubber.urlSync = urlSync;
  scrubber.clockManager = clockManager;
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
  };
  titleCard.addEventListener('voyager:title-card-complete', onComplete, { once: true });

  const dispose = (): void => {
    detachKeyboard();
    if (detachFrame !== null) {
      detachFrame();
      detachFrame = null;
    }
    clockManager.dispose();
  };

  return {
    titleCard,
    scrubber,
    playButton,
    speedMultiplier,
    hud,
    clockManager,
    urlSync,
    dispose,
  };
};
