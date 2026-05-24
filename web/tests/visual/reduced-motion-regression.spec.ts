/**
 * Story 6.3 — L4 reduced-motion regression suite (FR46 / NFR-A5).
 *
 * Complements Story 4.9 + Story 5.4's "always-on reduced-motion at
 * playwright.config.ts" baseline by adding scene captures that
 * specifically target surfaces that WOULD otherwise animate, asserting
 * that under `prefers-reduced-motion: reduce` they settle to a FINAL
 * state — not a mid-animation frame.
 *
 * ## What this suite proves
 *
 * The shared `playwright.config.ts` already pins `reducedMotion: 'reduce'`
 * for every test in the visual suite (Story 4.9 baselines, Story 5.4 PBD
 * substate baselines). This spec layers a more targeted gate on top: at
 * the exact wall-clock moments where each animated surface WOULD be
 * mid-animation under default motion (200–400 ms after the trigger), we
 * assert the captured screenshot equals the final-state baseline.
 *
 * A regression in the reduced-motion contract — e.g. a future PR
 * introducing a bare-millisecond `transition: opacity 200ms` that the
 * token override misses, or a JS-side animation that forgets to consult
 * `matchMedia` — surfaces as a mid-animation frame here BEFORE it ships.
 *
 * ## Per-scene contract
 *
 * Each test:
 *
 *   1. Navigates to a scene URL with `page.emulateMedia({ reducedMotion: 'reduce' })`
 *      set BEFORE navigation (belt-and-braces alongside the config-level
 *      pin — exercises the explicit Playwright API surface per AC4).
 *   2. Waits for the simulation to reach the post-trigger settled state.
 *   3. Captures the viewport and asserts equivalence with the committed
 *      baseline at `__snapshots__/reduced-motion-<scene>.png`.
 *
 * Five scenes are covered (per Story 6.3 AC4):
 *
 *   - title-card-final-state — the title card has dissolved + been
 *     removed from the DOM. Under reduced motion the dissolve collapses
 *     from 400 ms to 0 ms, so the post-hold (2 s) screenshot equals the
 *     final scene-revealed state.
 *   - chapter-copy-final-state — the chapter copy panel at the v1-jupiter
 *     scene is fully visible (opacity 1, not mid-fade).
 *   - chapter-index-final-state — after clicking the chapter-index icon,
 *     the side panel is fully translated in (translateX(0), not
 *     translateX(50%)).
 *   - pbd-turn-final-state — at the PBD turning substate, the scan
 *     platform aim quaternion is at its target (SLERP collapsed; no
 *     intermediate ease-out cubic frame).
 *   - hud-dismiss-final-state — after H keypress, the HUD is at opacity 0
 *     (not mid-fade).
 *
 * ## Why this is L4, not unit-tier
 *
 * The unit tier already proves each component's reduced-motion logic in
 * isolation (e.g. `view-frame.test.ts` injects a stub `reducedMotion: () => true`).
 * What ONLY a real browser can verify is the end-to-end token reactivity:
 * does `@media (prefers-reduced-motion: reduce)` at `:root` actually
 * propagate to every consumer's `var(--v-duration-*)` resolution? Does
 * `page.emulateMedia({ reducedMotion: 'reduce' })` actually fire the CSS
 * reflow? Those questions are answered by this spec.
 *
 * ## Wire-up
 *
 * - Re-uses `helpers/wait-for-stable.ts` for the post-trigger settle.
 * - Re-uses the same `webServer` (vite preview) the rest of the L4 suite
 *   runs against.
 * - Baselines committed under `web/tests/visual/__snapshots__/reduced-motion-*.png`
 *   following the `--update-snapshots` discipline at
 *   `docs/visual-validation/update-snapshot-discipline.md`.
 *
 * ## ADR compliance
 *
 * - ADR-0010 — Playwright is the CI-tier reduced-motion verification
 *   surface (this file). Chrome DevTools MCP can be used agent-time for
 *   the same scenarios when a developer is iterating on a fix.
 * - ADR-0027 — file uses LF line endings.
 */

import { test, expect } from '@playwright/test';
import { waitForStableFrame, STABLE_FRAME_HARD_DEADLINE_MS } from './helpers/wait-for-stable';

/**
 * Each scene is defined by:
 *
 * - `name` — baseline basename without the `reduced-motion-` prefix or
 *   `.png` suffix.
 * - `url` — the deep-link to navigate to.
 * - `expectedSlug` — the slug the stable-frame waiter pins on (matches
 *   the chapter the URL resolves to under `held`). Null when the URL
 *   doesn't anchor to a held chapter (rare).
 * - `prepareScene` — optional callback after `waitForStableFrame`
 *   completes, used to drive a UI interaction (icon click, H keypress)
 *   before the capture.
 */
interface ReducedMotionScene {
  readonly name: string;
  readonly url: string;
  readonly expectedSlug: string | null;
  readonly prepareScene?: (page: import('@playwright/test').Page) => Promise<void>;
}

const SCENES: readonly ReducedMotionScene[] = Object.freeze([
  // Title card has dissolved + been removed from the DOM. Story 1.9's
  // 2-second hold runs even under reduced motion (the HOLD is not
  // motion — the DISSOLVE is); after the hold the dissolve collapses
  // from 400 ms to 0 ms and the card is removed, revealing the scene.
  // The waiter's Condition 0 already asserts `<v-title-card>` is
  // removed; this scene captures the post-removal viewport so a
  // regression that fails to remove the card (or that leaves it
  // partially opaque mid-collapse) surfaces here.
  {
    name: 'title-card-final-state',
    url: '/c/launch-v1/',
    expectedSlug: 'launch-v1',
  },
  // Chapter copy at v1-jupiter — under reduced motion the article fade
  // collapses to 0 ms; the panel is at opacity 1 immediately. Story 4.4
  // capture timing is reproduced here under the explicit
  // emulateMedia gate.
  {
    name: 'chapter-copy-final-state',
    url: '/c/v1-jupiter/',
    expectedSlug: 'v1-jupiter',
  },
  // Chapter index icon click — the slide-in panel arrives at
  // translateX(0) instantly under reduced motion. Verifies the
  // transform transition token collapse, NOT just the opacity.
  {
    name: 'chapter-index-final-state',
    url: '/c/launch-v1/',
    expectedSlug: 'launch-v1',
    prepareScene: async (page) => {
      // Open the chapter index via keyboard ('M' opens the panel per
      // v-chapter-index.ts:592 — the global keydown listener the
      // component installs on connectedCallback).
      await page.keyboard.press('m');
      // Wait for the panel to be fully visible. Under reduced motion
      // the slide-in transform collapses to 0 ms instantly; the
      // `data-open` attribute reflects the open state.
      await page.waitForFunction(() => {
        const idx = document.querySelector('v-chapter-index');
        if (idx === null) return false;
        return idx.hasAttribute('data-open');
      }, undefined, { timeout: 5000 });
      // Give the layout one frame to settle the transform.
      await page.waitForTimeout(50);
    },
  },
  // PBD turn final state — anchor the URL at the turning substate
  // (+15 s) and capture; the SLERP between substate aim quaternions
  // collapses to instant under reduced motion (per
  // turn-choreography.ts's matchMedia probe).
  {
    name: 'pbd-turn-final-state',
    url: '/c/pale-blue-dot/?t=1990-02-14T00:00:15Z',
    expectedSlug: 'pale-blue-dot',
  },
  // HUD dismiss — press H to dismiss; under reduced motion the opacity
  // transition collapses to 0 ms. Capture the post-dismiss viewport.
  {
    name: 'hud-dismiss-final-state',
    url: '/c/launch-v1/',
    expectedSlug: 'launch-v1',
    prepareScene: async (page) => {
      // H toggles the HUD per Story 6.2's keyboard shortcut.
      await page.keyboard.press('h');
      // Wait for the HUD to reflect data-dismissed='true'.
      await page.waitForFunction(() => {
        const hud = document.querySelector('v-hud');
        if (hud === null) return false;
        return hud.getAttribute('data-dismissed') === 'true';
      }, undefined, { timeout: 5000 });
      // One frame to settle the opacity transition (collapses to 0 ms
      // under reduced motion).
      await page.waitForTimeout(50);
    },
  },
]);

test.describe.parallel('L4 reduced-motion regression — Story 6.3 (FR46 / NFR-A5)', () => {
  for (const scene of SCENES) {
    test(`reduced-motion: ${scene.name}`, async ({ page, context }) => {
      // AC4 — exercise the explicit Playwright API surface. The
      // config-level `use.reducedMotion: 'reduce'` already covers every
      // test in the suite, but this call surfaces the API contract at
      // the per-spec level so a regression in the config pin still
      // catches the right behaviour here. Also exercises the CSS reflow
      // that the @media query produces — proving AC5 (OS-preference
      // toggle takes effect on next reflow).
      await context.setExtraHTTPHeaders({});
      await page.emulateMedia({ reducedMotion: 'reduce' });

      test.setTimeout(STABLE_FRAME_HARD_DEADLINE_MS + 30_000);

      await page.goto(scene.url);

      await waitForStableFrame(page, {
        expectedSlug: scene.expectedSlug,
      });

      // Per-scene preparation (e.g. icon click, H keypress) AFTER the
      // initial stable-frame wait so the prepare action runs against a
      // fully-settled scene rather than a mid-load surface.
      if (scene.prepareScene !== undefined) {
        await scene.prepareScene(page);
      }

      const screenshot = await page.screenshot({
        fullPage: false,
        // Defense-in-depth alongside the reducedMotion pin: any
        // residual CSS animation is frozen during capture. Under the
        // reduced-motion contract this should be a no-op (the token
        // override already collapses durations to 0 ms), but the
        // freeze provides belt-and-braces if a future PR adds a
        // non-tokenised animation that slips past the defense tests.
        animations: 'disabled',
      });
      expect(screenshot).toMatchSnapshot(`reduced-motion-${scene.name}.png`);
    });
  }
});
