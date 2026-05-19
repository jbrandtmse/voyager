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
import type { VTimelineScrubber } from '../components/v-timeline-scrubber';
import type { VPlayButton } from '../components/v-play-button';
import type { VSpeedMultiplier } from '../components/v-speed-multiplier';

export interface FirstPaintHandle {
  titleCard: HTMLElement;
  scrubber: VTimelineScrubber;
  playButton: VPlayButton;
  speedMultiplier: VSpeedMultiplier;
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
export const startFirstPaint = (host: HTMLElement = document.body): FirstPaintHandle => {
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

  const detachKeyboard = installKeyboardShortcuts(clockManager);

  const onComplete = (): void => {
    titleCard.remove();
    scrubber.style.visibility = '';
    playButton.style.visibility = '';
    speedMultiplier.style.visibility = '';
  };
  titleCard.addEventListener('voyager:title-card-complete', onComplete, { once: true });

  const dispose = (): void => {
    detachKeyboard();
    clockManager.dispose();
  };

  return {
    titleCard,
    scrubber,
    playButton,
    speedMultiplier,
    clockManager,
    urlSync,
    dispose,
  };
};
