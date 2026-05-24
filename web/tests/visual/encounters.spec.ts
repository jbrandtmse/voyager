/**
 * Story 4.9 — L4 visual-regression suite (FR55).
 *
 * Pinned scenes at 1280×720 captured from a real production-build served
 * by `vite preview` (the suite's `webServer`). Each test navigates to a
 * deep-link URL, waits for the simulation to reach a stable frame (per
 * `helpers/wait-for-stable.ts`), and asserts the resulting screenshot
 * matches the baseline at `__snapshots__/<slug>.png`.
 *
 * ## Scene roster (AC1)
 *
 * Cold-load chapter scenes (8):
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
 *
 * Story 4.9 originally shipped a `pale-blue-dot` cold-load stub baseline
 * pending Story 5.X PBD module work. Story 5.4 (Epic 5) REMOVED that
 * stub (Path A — the four substate-anchored PBD tests below subsume the
 * single cold-load scene) and replaced it with the four substate
 * baselines listed in the PBD substates table.
 *
 * PBD substate scenes (4) — Story 5.4:
 *
 * | Slug                 | Substate          | Peak offset (anchor + s) | Deep-link `?t=`           |
 * | -------------------- | ----------------- | ------------------------ | ------------------------- |
 * | pbd-turning          | `turning`         | +15s                     | 1990-02-14T00:00:15Z      |
 * | pbd-sweeping-earth   | `sweeping_earth`  | +52s                     | 1990-02-14T00:00:52Z      |
 * | pbd-sweeping-neptune | `sweeping_neptune`| +142s                    | 1990-02-14T00:02:22Z      |
 * | pbd-composite-decay  | `composite_decay` | +165s                    | 1990-02-14T00:02:45Z      |
 *
 * The peak offsets are integer-second approximations of the canonical
 * substate midpoints in `web/src/chapters/pale-blue-dot/substates.ts`
 * (e.g. `sweeping_earth.peak = 52.5`, rounded down to +52s to match the
 * Story 5.3 smoke-evidence URL convention). Each integer-second offset
 * is verified to fall STRICTLY INSIDE its substate's `[start, end)`
 * window via a cross-check assertion below (Story 5.4 AC1 last clause).
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
import {
  PBD_SUBSTATE_TIMINGS,
  PbdSubstate,
} from '../../src/chapters/pale-blue-dot/substates';

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
  // Story 5.4 (Path A): `pale-blue-dot` cold-load stub baseline REMOVED
  // here. The four substate-anchored tests in the `L4 PBD substates`
  // describe block below subsume the single cold-load scene — every
  // PBD-rendering pathway exercised by the original stub is also
  // exercised by `pbd-turning` (cold-load arrival, then substate
  // transition), and the three remaining substate tests cover scene
  // states the cold-load stub could never reach.
]);

// Each scene gets its own `test()` so failures are isolated per-scene
// in the Playwright report and per-snapshot diff artifacts upload
// cleanly. The describe block is `.parallel` because each scene is
// independent — there's no shared state between captures.
/**
 * Story 5.4 QA gap-filler — SCENES roster invariant.
 *
 * Defends against an accidental re-addition of the `pale-blue-dot` entry
 * to the `SCENES` array. If `pale-blue-dot` reappears as a cold-load
 * encounter scene, the suite would attempt to capture a single PBD frame
 * AND four PBD substate frames — two different baseline contracts for the
 * same chapter, with the cold-load `idle` substate baseline (now obsolete
 * per Story 5.4 Path A) being captured under `__snapshots__/scene-pale-blue-dot.png`
 * again. This guard surfaces that drift at suite-discovery time with a
 * clear diagnostic rather than via a confusing missing-baseline failure
 * downstream.
 *
 * The defensive intent: PBD is owned by the `L4 PBD substates — Story 5.4`
 * describe block below; the cold-load `SCENES` roster MUST NOT include it.
 */
test('Story 5.4 — SCENES roster excludes pale-blue-dot (PBD owned by substate block)', () => {
  const palBlueDotInRoster = SCENES.some((s) => s.slug === 'pale-blue-dot');
  expect(
    palBlueDotInRoster,
    `Story 5.4 Path A removed the 'pale-blue-dot' cold-load scene from SCENES; ` +
      `PBD is now covered by the four substate-anchored tests in the ` +
      `'L4 PBD substates — Story 5.4 (FR55)' describe block. Re-adding ` +
      `'pale-blue-dot' to SCENES would re-introduce the obsolete cold-load ` +
      `baseline contract alongside the substate baselines — pick one. ` +
      `If you intend to restore a cold-load idle baseline, also delete the ` +
      `PBD_SUBSTATE_SCENES entries that overlap.`,
  ).toBe(false);
});

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

/**
 * Story 5.4 — L4 PBD substate visual regression (FR55, Epic 5 closure).
 *
 * Replaces the Story 4.9 single `pale-blue-dot` cold-load stub baseline
 * with FOUR substate-anchored baselines covering the choreographed turn,
 * the iconic Earth-plate composite hero shot, the final-plate Neptune
 * composite, and the post-composite decay state. Each test uses Story
 * 5.2's deep-link `?t=<iso>` contract to anchor the simulation at the
 * substate's peak ET (an integer-second approximation of the canonical
 * `peak` midpoint in `web/src/chapters/pale-blue-dot/substates.ts`).
 *
 * ## Cross-check assertion (AC1 last clause)
 *
 * Each integer-second offset is verified to lie STRICTLY INSIDE its
 * substate's `[start, end)` window from `PBD_SUBSTATE_TIMINGS`. A future
 * change to the substate timing table that would render an offset
 * out-of-band surfaces as a test failure here BEFORE the visual diff
 * runs — so the failure message names the substate timing table as the
 * load-bearing source of drift, not the pixel diff.
 *
 * This is the Rule-5 defense the story spec mandates: the visual test
 * author MUST acknowledge a substate timing change (by re-deriving the
 * peak offsets and re-capturing the four baselines via
 * `--update-snapshots`) rather than silently shipping a now-misaligned
 * URL.
 */
interface PbdSubstateScene {
  /** URL slug + snapshot basename. */
  readonly slug: string;
  /** The substate the deep-link ET resolves to. */
  readonly substate: PbdSubstate;
  /**
   * Offset (seconds) from `PBD_ANCHOR_ET` (1990-02-14T00:00:00Z) that
   * the deep-link `?t=` ISO encodes. MUST lie inside
   * `[PBD_SUBSTATE_TIMINGS[substate].start, end)`.
   */
  readonly offsetSeconds: number;
  /** Deep-link ISO timestamp passed via `?t=<iso>`. */
  readonly deepLinkIso: string;
}

const PBD_SUBSTATE_SCENES: readonly PbdSubstateScene[] = Object.freeze([
  {
    slug: 'pbd-turning',
    substate: PbdSubstate.turning,
    offsetSeconds: 15,
    deepLinkIso: '1990-02-14T00:00:15Z',
  },
  {
    slug: 'pbd-sweeping-earth',
    substate: PbdSubstate.sweeping_earth,
    offsetSeconds: 52,
    deepLinkIso: '1990-02-14T00:00:52Z',
  },
  {
    slug: 'pbd-sweeping-neptune',
    substate: PbdSubstate.sweeping_neptune,
    offsetSeconds: 142,
    deepLinkIso: '1990-02-14T00:02:22Z',
  },
  {
    slug: 'pbd-composite-decay',
    substate: PbdSubstate.composite_decay,
    offsetSeconds: 165,
    deepLinkIso: '1990-02-14T00:02:45Z',
  },
]);

test.describe.parallel('L4 PBD substates — Story 5.4 (FR55)', () => {
  for (const scene of PBD_SUBSTATE_SCENES) {
    test(`pbd substate: ${scene.slug} (@ ${scene.substate})`, async ({ page }) => {
      // Story 5.4 AC1 cross-check assertion. If a future change to
      // `web/src/chapters/pale-blue-dot/substates.ts` shifts the
      // substate's `[start, end)` window such that the integer-second
      // offset we encode in the URL falls out of band, fail HERE
      // (before navigation) with a clear diagnostic naming the table
      // as the source of drift. This is the test-layer defense the
      // story spec mandates (AC1 last clause).
      const timing = PBD_SUBSTATE_TIMINGS[scene.substate];
      expect(
        scene.offsetSeconds,
        `Story 5.4 cross-check: scene ${scene.slug} offset +${scene.offsetSeconds}s ` +
          `must lie inside substate ${scene.substate} window ` +
          `[${timing.start}, ${timing.end}). If PBD_SUBSTATE_TIMINGS shifted, ` +
          `re-derive the four PBD substate-anchored offsets and re-capture ` +
          `baselines via --update-snapshots.`,
      ).toBeGreaterThanOrEqual(timing.start);
      expect(
        scene.offsetSeconds,
        `Story 5.4 cross-check: scene ${scene.slug} offset +${scene.offsetSeconds}s ` +
          `must lie inside substate ${scene.substate} window ` +
          `[${timing.start}, ${timing.end}). See AC1 last clause.`,
      ).toBeLessThan(timing.end);

      // Belt-and-braces: align the per-test timeout with the waiter's
      // internal hard deadline so a slow-network in-flight asset
      // doesn't blow past the wait helper's bound. Same pattern as the
      // encounter scenes above.
      test.setTimeout(STABLE_FRAME_HARD_DEADLINE_MS + 30_000);

      // Deep-link navigation per Story 5.2's `?t=<iso>` contract. The
      // ET seeds ClockManager so the PBD chapter advances through its
      // internal substate timeline to the targeted substate before the
      // stable-frame wait completes.
      //
      // Trailing slash on the chapter path is load-bearing — see the
      // encounter-scene goto block above for the full reason.
      await page.goto(`/c/pale-blue-dot/?t=${scene.deepLinkIso}`);

      // Stable-frame wait. The PBD chapter slug is `pale-blue-dot`
      // regardless of internal substate — the substate machine is an
      // inner timeline within the chapter's `held` state, not a
      // separate ChapterDirector chapter.
      await waitForStableFrame(page, {
        expectedSlug: 'pale-blue-dot',
      });

      // Capture + diff. Same options as the encounter-scene capture
      // path. Snapshot template flattens to `__snapshots__/<slug>.png`
      // per the suite's playwright.config.ts `snapshotPathTemplate`.
      const screenshot = await page.screenshot({
        fullPage: false,
        animations: 'disabled',
      });
      expect(screenshot).toMatchSnapshot(`${scene.slug}.png`);
    });
  }
});
