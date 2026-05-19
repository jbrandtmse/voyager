/**
 * First-paint sequence (Story 1.9).
 *
 * Mounts `<v-title-card>` immediately on boot, then `<v-timeline-scrubber>`
 * underneath (hidden), parses any `?t=<iso>` URL parameter via URLSync
 * (silent reject on malformed per NFR-S7), and wires the
 * `voyager:title-card-complete` event so the scrubber becomes visible
 * after the dissolve.
 *
 * Lives in `boot/` (not `main.ts`) so tests can import the function
 * without triggering main.ts's WebGL bootstrap.
 */
import { URLSync } from '../services/url-sync';
import '../components/v-title-card';
import '../components/v-timeline-scrubber';
import type { VTimelineScrubber } from '../components/v-timeline-scrubber';

export interface FirstPaintHandle {
  titleCard: HTMLElement;
  scrubber: VTimelineScrubber;
  urlSync: URLSync;
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

  const titleCard = document.createElement('v-title-card');
  host.appendChild(titleCard);

  const scrubber = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
  scrubber.urlSync = urlSync;
  scrubber.simEt = initialEt;
  scrubber.style.visibility = 'hidden';
  host.appendChild(scrubber);

  const onComplete = (): void => {
    titleCard.remove();
    scrubber.style.visibility = '';
  };
  titleCard.addEventListener('voyager:title-card-complete', onComplete, { once: true });

  return { titleCard, scrubber, urlSync };
};
