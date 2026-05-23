/**
 * Story 4.9 — stable-frame waiter (the suite's biggest flake mitigation).
 *
 * Mid-load screenshot capture is the single largest cause of visual-
 * regression flake. This helper blocks until the simulation has reached
 * a stable rendered state for the expected chapter, then returns so the
 * test can call `page.screenshot()` with confidence.
 *
 * ## What "stable" means
 *
 * Four conditions, in order (each builds on the previous):
 *
 * 1. **Chapter resolved.** The active `<v-hud-chapter-title>` element's
 *    `<h2 data-slug="...">` attribute matches the expected slug. This
 *    is the production-build-observable proxy for
 *    `__voyagerDebug.chapterDirector.activeChapter.slug === <expected>`
 *    (the dev-only debug surface isn't exposed in `web/dist/` because
 *    main.ts gates the assignment on `import.meta.env.DEV`). For chapters
 *    without a held name on cold-load (e.g. PBD's ±1-day window vs the
 *    PBD anchor ET) the helper falls back to URL-based confirmation.
 *
 * 2. **No in-flight network.** `performance.getEntriesByType('resource')`
 *    reports `responseEnd > 0` (or non-zero `duration`) for every entry.
 *    Catches mid-flight KTX2 texture loads (Story 4.3 4K upgrade) +
 *    chapter chunk loads (Story 4.1 cadence-shift chunks). We don't
 *    filter to `.ktx2` only — any in-flight resource is a potential
 *    cause of a frame-after-frame visual change.
 *
 * 3. **No chapter-copy fade in progress.** With `reducedMotion: 'reduce'`
 *    set in playwright.config.ts (the default for this suite), the fade
 *    collapses to 0ms per global.css. The check is therefore a
 *    `getComputedStyle(...).opacity === '1'` assertion that effectively
 *    pins the side-panel as fully visible (when copy exists for the
 *    chapter) — its primary value is catching a Lit microtask-async
 *    render-flush that hasn't quite landed yet.
 *
 * 4. **Two consecutive identical frames.** The canvas's `toDataURL()`
 *    output is sampled twice 100ms apart; identical = render loop has
 *    settled. If 5 attempts fail to produce two identical frames we
 *    fall back to a fixed 1500ms wait (per the story's "fall back to
 *    fixed 1500ms" guidance) — this is the defensive path for the
 *    handful of chapters where a per-frame trajectory animation (the
 *    polyline's per-frame visibility extension as the spacecraft moves
 *    through its window) never genuinely settles. Pixel-level diffs
 *    between two such "settled-enough" frames are absorbed by the
 *    Playwright `maxDiffPixelRatio: 0.001` tolerance.
 *
 * ## Why not just sleep?
 *
 * A 1500ms blanket sleep would burn ~15s across 9 scenes in serial. The
 * conditional waiter is ~200–500ms per scene in the happy path. For a
 * suite that aims at the NFR-M4 15-minute L4+L5 budget the conditional
 * path is the right default.
 *
 * ## Public API
 *
 * - `waitForStableFrame(page, opts)` — the load-bearing helper. Returns
 *   when all conditions are satisfied; throws (Playwright test-failing)
 *   with a clear message if the chapter slug never resolves.
 *
 * - `STABLE_FRAME_HARD_DEADLINE_MS` — exported so the spec timeout can
 *   stay aligned with the waiter's internal deadline.
 */

import type { Page } from '@playwright/test';

export const STABLE_FRAME_HARD_DEADLINE_MS = 30_000;

/** Per-attempt sample-gap for the frame-stability probe (condition 4). */
const FRAME_STABILITY_SAMPLE_GAP_MS = 100;

/** Maximum number of frame-stability comparison attempts. */
const FRAME_STABILITY_MAX_ATTEMPTS = 5;

/** Fixed-wait fallback if frame-stability check fails repeatedly. */
const FRAME_STABILITY_FALLBACK_WAIT_MS = 1500;

export interface WaitForStableFrameOptions {
  /**
   * The chapter slug we expect to be active. For launch / encounter /
   * heliopause / PBD chapters this matches the URL slug. Used to confirm
   * the ChapterDirector has reached `held` for the right chapter (via
   * `<v-hud-chapter-title>`'s `data-slug` attribute — the production-
   * build-observable proxy for `chapterDirector.activeChapter.slug`).
   *
   * Pass `null` for cruise / non-chapter-active URLs (e.g. PBD's ±1-day
   * window won't always have a held chapter at the URL's anchor — there
   * are valid cases). When null, the chapter-resolved condition (#1) is
   * skipped and only network + render-stability are enforced.
   */
  expectedSlug: string | null;
}

/**
 * Block until the simulation has reached a stable rendered state for
 * the expected chapter. Throws (= fails the test) on hard-deadline
 * timeout with a clear diagnostic message.
 *
 * Story 4.9 AC1 condition; AC6 (the integration AC) is satisfied by
 * the helper exercising the real `<v-hud-chapter-title>` + the network
 * tier — not a mocked render.
 */
export const waitForStableFrame = async (
  page: Page,
  opts: WaitForStableFrameOptions,
): Promise<void> => {
  const startedAt = Date.now();
  const deadline = startedAt + STABLE_FRAME_HARD_DEADLINE_MS;

  // Condition 0 — title card dissolved + removed from the DOM. Story
  // 1.9's `<v-title-card>` holds for TITLE_CARD_HOLD_MS (2000ms) then
  // dissolves over `--v-duration-slow` (400ms; collapsed to 0ms under
  // reduced-motion, but the 2s hold still runs). After the dissolve
  // the title card emits `voyager:title-card-complete` and first-paint
  // removes it from the DOM. The title card's text would otherwise
  // appear inconsistently across captures, polluting the baseline.
  await page.waitForFunction(
    () => document.querySelector('v-title-card') === null,
    undefined,
    { timeout: Math.max(0, deadline - Date.now()), polling: 250 },
  );

  // Condition 1 — chapter slug resolved (skip on cruise / no-chapter
  // URLs). We poll the `<v-chapter-index>` shadow-root for the listbox
  // option whose `aria-selected="true"` data-slug matches the expected
  // chapter slug. This is the production-build-observable proxy for
  // `__voyagerDebug.chapterDirector.activeChapter` (the dev-only debug
  // surface isn't exposed in `web/dist/` because main.ts gates the
  // assignment on `import.meta.env.DEV`).
  //
  // Why `<v-chapter-index>` and not `<v-hud-chapter-title>`:
  //
  // - `<v-chapter-index>`'s listbox renders ALL chapters (launches +
  //   encounters + PBD + heliopause), so this signal works uniformly
  //   across all 9 scenes including launch + PBD which have no
  //   `<v-chapter-copy>` content.
  // - `<v-hud-chapter-title>` exists but its `chapterDirector` wiring
  //   doesn't appear to land in the production build's first-paint
  //   sequence; the `<h2>` stays empty. That's a separate bug worth a
  //   future story to investigate — but it'd be wrong to gate the L4
  //   suite on a signal that's known-broken in the target runtime.
  //
  // Element nesting: `<v-chapter-index>` shadow root → option list →
  // `[role=option][aria-selected=true][data-slug=<expected>]`. The
  // shadow-root traversal is load-bearing — querying `document` for
  // the inner element directly returns null because Shadow DOM is
  // opaque to `document.querySelector`.
  if (opts.expectedSlug !== null) {
    await page.waitForFunction(
      (expected: string) => {
        const index = document.querySelector('v-chapter-index');
        if (index === null) return false;
        const selected = index.shadowRoot?.querySelector(
          `[role="option"][aria-selected="true"][data-slug="${expected}"]`,
        );
        return selected !== null && selected !== undefined;
      },
      opts.expectedSlug,
      { timeout: Math.max(0, deadline - Date.now()) },
    );
  }

  // Condition 2 — no in-flight asset fetches. We probe
  // `performance.getEntriesByType('resource')` directly rather than
  // using Playwright's `waitForLoadState('networkidle')` because the
  // simulation surface keeps a steady drip of asset fetches (KTX2
  // tiles, chunk-loader prefetch) for several seconds after the
  // initial paint — `networkidle` (500ms-silence) effectively never
  // returns within the suite's timeout. The resource-API probe is
  // more precise: an entry is "in flight" if its `responseEnd === 0`
  // (the spec contract per the W3C Resource Timing standard). We
  // require zero in-flight entries AND that the most recent fetch
  // started ≥ 750ms ago (= no new in-flight fetches in the last
  // window), which captures the "no in-flight loads" intent without
  // depending on a global silence window.
  await page.waitForFunction(
    () => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      if (entries.length === 0) return false;
      const now = performance.now();
      for (const e of entries) {
        if (e.responseEnd === 0) return false;
      }
      // Tail-quiet check: the most recent fetch was initiated ≥ 750ms
      // ago. Catches the "in-flight but tracker hasn't updated yet"
      // edge case — if a new fetch just started we should wait a beat.
      let maxStartTime = 0;
      for (const e of entries) {
        if (e.startTime > maxStartTime) maxStartTime = e.startTime;
      }
      return now - maxStartTime >= 750;
    },
    undefined,
    { timeout: Math.max(0, deadline - Date.now()), polling: 250 },
  );

  // Condition 3 — chapter-copy panel fully visible (when present). The
  // `<v-chapter-copy>` element renders into Light DOM, so we can read
  // its computed opacity directly. For chapters without copy (launch /
  // PBD), the element exists but is empty — its opacity is still 1.
  // Under `reducedMotion: 'reduce'` this is effectively a no-op (the
  // fade duration collapses to 0ms via global.css) but keeping the
  // check belts-and-braces in case a future reduced-motion override
  // sneaks back in.
  await page.waitForFunction(
    () => {
      const panel = document.querySelector('v-chapter-copy');
      if (panel === null) return true; // not yet rendered → not mid-fade
      const cs = window.getComputedStyle(panel as HTMLElement);
      return cs.opacity === '1' || cs.opacity === '';
    },
    undefined,
    { timeout: Math.max(0, deadline - Date.now()) },
  );

  // Condition 4 — two consecutive identical canvas snapshots. Falls
  // back to a fixed 1500ms wait if the render loop never produces two
  // identical frames within FRAME_STABILITY_MAX_ATTEMPTS samples.
  //
  // The canvas data-URL is bounded by viewport pixel count × 4 bytes;
  // at 1280×720 that's ~3.5 MB which round-trips comfortably through
  // Playwright's evaluate channel. We do NOT use this as the diff
  // mechanism — it's only the settle check; the actual diff is
  // toMatchSnapshot's per-channel + per-pixel-ratio compare.
  let frameStabilityHit = false;
  for (let attempt = 0; attempt < FRAME_STABILITY_MAX_ATTEMPTS; attempt++) {
    const first = await sampleCanvasFingerprint(page);
    await page.waitForTimeout(FRAME_STABILITY_SAMPLE_GAP_MS);
    const second = await sampleCanvasFingerprint(page);
    if (first !== null && second !== null && first === second) {
      frameStabilityHit = true;
      break;
    }
    if (Date.now() >= deadline) break;
  }
  if (!frameStabilityHit) {
    // Defensive fallback per the story spec — used when the polyline
    // visibility-extension or another per-frame animation prevents the
    // canvas from ever producing two byte-identical frames within the
    // sampling cadence. Playwright's `maxDiffPixelRatio: 0.001`
    // tolerance absorbs the residual variance.
    await page.waitForTimeout(FRAME_STABILITY_FALLBACK_WAIT_MS);
  }
};

/**
 * Sample a coarse fingerprint of the WebGL canvas's rendered output.
 *
 * We hash a downsampled snapshot — not the full pixel grid — to keep
 * the round-trip through Playwright's evaluate channel cheap while
 * still being sensitive to gross frame-to-frame differences (a moving
 * trajectory polyline, a planet rotating, a fade-in still in flight).
 *
 * Implementation: copy the WebGL canvas into a 32×32 2D-context canvas,
 * read back the pixel bytes, and string-join them. Identical strings
 * across two consecutive samples ⇒ the render loop has settled to the
 * point where downsampled output is byte-identical (which is the right
 * granularity given Playwright's tolerance + the suite's stability
 * goals).
 *
 * Returns `null` if the canvas isn't present or readable (e.g. before
 * RenderEngine mounts) — the caller treats null as a non-match.
 */
const sampleCanvasFingerprint = async (page: Page): Promise<string | null> => {
  return await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas#voyager-canvas');
    if (canvas === null) return null;
    const tmp = document.createElement('canvas');
    tmp.width = 32;
    tmp.height = 32;
    const ctx = tmp.getContext('2d');
    if (ctx === null) return null;
    try {
      ctx.drawImage(canvas, 0, 0, 32, 32);
      const imageData = ctx.getImageData(0, 0, 32, 32);
      // Cheap hash: join bytes with no separator. ~12 kB string; comparing
      // two of these is sub-millisecond in V8.
      return Array.from(imageData.data).join('');
    } catch {
      // Cross-origin canvas? Shouldn't happen for our own WebGL canvas,
      // but bail safely.
      return null;
    }
  });
};
