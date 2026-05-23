/**
 * Story 4.9 — L4 visual-regression suite (FR55).
 *
 * Nine pinned scenes at 1280×720 captured from a real production-build
 * served by `vite preview` (the suite's `webServer`). Each test navigates
 * to a deep-link URL, waits for the simulation to reach a stable frame
 * (per `helpers/wait-for-stable.ts`), and asserts the resulting
 * screenshot matches the baseline at `__snapshots__/<slug>.png`.
 *
 * ## Scene roster (AC1)
 *
 * | Slug             | Anchor (UT)                                        |
 * | ---------------- | -------------------------------------------------- |
 * | launch-v1        | 1977-09-05T12:56:00Z (V1 launch from CCAFS LC-41A) |
 * | launch-v2        | 1977-08-20T14:29:00Z (V2 launch from CCAFS LC-41A) |
 * | v1-jupiter       | 1979-03-05T12:05:00Z (V1 Jupiter closest approach) |
 * | v2-jupiter       | 1979-07-09T22:29:00Z (V2 Jupiter closest approach) |
 * | v1-saturn        | 1980-11-12T23:46:00Z (V1 Saturn / Titan flyby)     |
 * | v2-saturn        | 1981-08-26T03:24:00Z (V2 Saturn closest approach)  |
 * | v2-uranus        | 1986-01-24T17:59:00Z (V2 Uranus closest approach)  |
 * | v2-neptune       | 1989-08-25T03:56:00Z (V2 Neptune closest approach) |
 * | pale-blue-dot    | 1990-02-14T00:00:00Z (PBD anchor — stub baseline)  |
 *
 * Story 4.9 ships the PBD stub baseline; Story 5.4 (Epic 5) updates it
 * once the dedicated PBD module is in.
 *
 * ## Wire-up
 *
 * URLs follow ADR-0001's `/c/<slug>` contract. Cold-load arrival into
 * a chapter window seeds ClockManager to the chapter's `anchorEt` (no
 * `?t=` carrier needed) — confirmed by every encounter chapter test
 * since Story 2.4. The `<v-hud-chapter-title>` data-slug attribute is
 * the stable-frame waiter's proxy for `chapterDirector.activeChapter`
 * (the dev-only `__voyagerDebug` surface isn't shipped in `web/dist/`).
 *
 * ## Rule 1 (Integration AC) / AC6
 *
 * Each `test()` exercises the full pipeline: built `web/dist/` →
 * served by `vite preview` → real Chromium navigation → real-runtime
 * stable-frame wait against the live `<v-hud-chapter-title>` element
 * + `performance.getEntriesByType` resource probe + canvas-fingerprint
 * stability check → screenshot diff against committed baseline. No
 * render is mocked; no `__voyagerDebug` surface is required.
 */

import { test, expect } from '@playwright/test';
import {
  waitForStableFrame,
  STABLE_FRAME_HARD_DEADLINE_MS,
} from './helpers/wait-for-stable';

/**
 * Each scene is a `(slug, optsForWaiter)` row driven through the same
 * test body. The `expectedSlug` passed to the waiter is the URL slug
 * by default; we override to `null` for cases where the chapter
 * director may not have a `held` chapter at the URL's anchor ET
 * (currently none — all 9 scenes resolve to a held chapter on cold-
 * load, including PBD's ±1-day window vs. the 1990-02-14 anchor — but
 * the type lets us turn that off if a future scene becomes "in-cruise"
 * at its anchor).
 */
interface VisualRegressionScene {
  /** URL slug. Both the path component and the snapshot filename. */
  readonly slug: string;
  /**
   * The slug we expect the `<v-hud-chapter-title>` to settle on. Equal
   * to `slug` for every current scene; pulled out as its own field so
   * a future scene that lands in cruise (no held chapter) can pass
   * `null` and skip the chapter-resolved check without disabling the
   * other three stability conditions.
   */
  readonly expectedHeldSlug: string | null;
}

const SCENES: readonly VisualRegressionScene[] = Object.freeze([
  { slug: 'launch-v1', expectedHeldSlug: 'launch-v1' },
  { slug: 'launch-v2', expectedHeldSlug: 'launch-v2' },
  { slug: 'v1-jupiter', expectedHeldSlug: 'v1-jupiter' },
  { slug: 'v2-jupiter', expectedHeldSlug: 'v2-jupiter' },
  { slug: 'v1-saturn', expectedHeldSlug: 'v1-saturn' },
  { slug: 'v2-saturn', expectedHeldSlug: 'v2-saturn' },
  { slug: 'v2-uranus', expectedHeldSlug: 'v2-uranus' },
  { slug: 'v2-neptune', expectedHeldSlug: 'v2-neptune' },
  { slug: 'pale-blue-dot', expectedHeldSlug: 'pale-blue-dot' },
]);

// Each scene gets its own `test()` so failures are isolated per-scene
// in the Playwright report and per-snapshot diff artifacts upload
// cleanly. The describe block is `.parallel` because each scene is
// independent — there's no shared state between captures.
test.describe.parallel('L4 visual regression — pinned encounter / launch / PBD scenes', () => {
  for (const scene of SCENES) {
    test(`scene: ${scene.slug}`, async ({ page }) => {
      // Belt-and-braces: align the per-test timeout with the waiter's
      // internal hard deadline so a slow-network in-flight asset
      // doesn't blow past the wait helper's bound and pop up as a
      // test-level deadline mismatch.
      test.setTimeout(STABLE_FRAME_HARD_DEADLINE_MS + 30_000);

      // Deep-link navigation. `goto` resolves against `baseURL`
      // (preview server, port 4173). The per-chapter HTML shell at
      // `dist/c/<slug>/index.html` boots the SPA via the same
      // FEATURE_PROBE main bundle the homepage does (per vite.config
      // ogCardsPlugin generateBundle path).
      //
      // ## Trailing slash
      //
      // We navigate with a trailing slash (`/c/<slug>/`) because Vite's
      // `vite preview` SPA-fallback serves the **root** `dist/index.html`
      // for unslashed paths instead of resolving `dist/c/<slug>/index.html`.
      // Production (Cloudflare Pages) normalises both forms to the
      // slashed-directory shell, so the trailing-slash form is the
      // canonical "what a user actually sees" path. Without the slash
      // an injected per-chapter visual change (e.g. an AC7 deliberate-
      // fail test) wouldn't surface because the chapter-specific shell
      // is never served.
      await page.goto(`/c/${scene.slug}/`);

      // Stable-frame wait — see helpers/wait-for-stable.ts for the
      // full settle protocol.
      await waitForStableFrame(page, {
        expectedSlug: scene.expectedHeldSlug,
      });

      // Capture + diff. The screenshot path is derived from the test
      // name via Playwright's snapshotPathTemplate: the suite's
      // config flattens to `__snapshots__/scene-<slug>.png`.
      //
      // `fullPage: false` — we want the viewport-bounded 1280×720 shot,
      // not a scrolled full-page capture (the simulation surface has
      // no scroll; full-page would still be the viewport but explicit
      // is better).
      //
      // `omitBackground: false` — preserve the page's background so
      // the dark colorScheme + skybox render are part of the baseline.
      //
      // `animations: 'disabled'` — defense-in-depth alongside the
      // playwright.config reducedMotion pin: any residual CSS
      // animation is frozen during capture.
      const screenshot = await page.screenshot({
        fullPage: false,
        animations: 'disabled',
      });
      expect(screenshot).toMatchSnapshot(`scene-${scene.slug}.png`);
    });
  }
});
