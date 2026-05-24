/**
 * Story 5.0 AC1 — production-build regression for `<v-hud-chapter-title>`.
 *
 * BUG-006 background: Story 4.10 wired `<v-hud-chapter-title>` to
 * `ChapterDirector` so the top-left HUD heading populates with the active
 * chapter's editorial name on `held` transitions. Unit tests + Story 4.10's
 * dev-mode Chrome DevTools MCP smoke confirmed dev-mode correctness, but
 * Story 4.9's lead Playwright smoke against the production build observed
 * the `<h2>` rendering empty — the `chapterDirector` reference was wired
 * in but `currentSlug` stayed `null`. The Story 4.9 dev-notes flagged that
 * the standing unit test in `v-hud-chapter-title.test.ts` covers only the
 * stub render (an empty `<h2>` is the cruise state) and doesn't exercise
 * the production-build wire-up.
 *
 * Story 5.0 AC1 investigation (2026-05-23) found the bug DOES NOT
 * REPRODUCE against current HEAD — Story 4.10's fix + Story 4.11/4.12's
 * follow-up work landed a fully-functional wire-up. The standing
 * concern was either timing (Story 4.9's lead probe sampled before the
 * post-mount `updated()` → `setName()` → `requestUpdate()` chain
 * completed) or an interim regression that closed naturally.
 *
 * Regardless of which, the regression test here pins the production-
 * build invariant so a future minifier upgrade, terser-mangle config
 * change, or refactor that re-introduces the bug fails in CI on the
 * production tier — not just on the dev tier.
 *
 * ## What this test is + isn't
 *
 * **Is:** a build-pipeline E2E test per Rule 11 — full `web/dist/` →
 * `vite preview` → real Chromium navigation → assertion against the
 * production-built `<v-hud-chapter-title>` `<h2>` text + `data-slug`
 * attribute. The signal is observable from the production-build runtime
 * surface (no `__voyagerDebug` symbol required).
 *
 * **Isn't:** a unit test. The unit test in
 * `web/src/components/v-hud-chapter-title.test.ts` correctly covers the
 * stub render in isolation. The dev-mode lead smoke covers the wire-up
 * in the live dev server. This test covers the gap between the two — the
 * production-build wire-up against a real Chromium navigation.
 *
 * ## Scenes covered
 *
 * - `/c/v1-jupiter/` — chapter window straddles the URL's anchor ET; the
 *   `ChapterDirector` sync seed fires `out → entering → held` for V1J
 *   immediately on first `update(et)`, and the title should render
 *   "Voyager 1 — Jupiter".
 *
 * - `/c/pale-blue-dot/` — same shape, different chapter. PBD is the
 *   load-bearing case for Epic 5 (the placeholder spec must render its
 *   title in prod so Story 5.1 isn't blocked by a regression here when
 *   it replaces the placeholder).
 *
 * Both scenes overlap with the Story 4.9 visual-regression spec
 * (`encounters.spec.ts`) but assert a different invariant — the visual
 * spec uses `<v-chapter-index>` as the chapter-resolved proxy because it
 * predated this regression test. Keeping the two specs separate means
 * a regression in either signal fails an obvious test.
 *
 * ## Why the visual suite directory
 *
 * Reuses the suite's `playwright.config.ts` `webServer` block (which
 * spawns `npx vite preview --port 4173 --strictPort` against `web/dist/`)
 * so this test runs alongside the visual-regression suite under
 * `npm run test:visual`. The suite is gated by `web/dist/` existence —
 * if `dist/` doesn't exist, `vite preview` fails to start, the suite
 * fails fast, and `npm test` (the L3 vitest sweep) is unaffected.
 *
 * The `vite.config.ts` Vitest exclude `'**\/tests/visual/**'` keeps this
 * spec out of the default `npm test` run, matching the Story 3.7 +
 * Story 4.9 pattern for production-build-gated tests.
 */

import { test, expect } from '@playwright/test';

interface ProductionBuildScene {
  readonly slug: string;
  readonly expectedH2Text: string;
}

const SCENES: readonly ProductionBuildScene[] = Object.freeze([
  { slug: 'v1-jupiter', expectedH2Text: 'Voyager 1 — Jupiter' },
  { slug: 'pale-blue-dot', expectedH2Text: 'Pale Blue Dot' },
]);

test.describe('Story 5.0 AC1 — <v-hud-chapter-title> wire-up in production builds', () => {
  for (const scene of SCENES) {
    test(`production build renders chapter title for /c/${scene.slug}/`, async ({
      page,
    }) => {
      // 60s spans the post-build chunk-loader + KTX2 fetch tail; the
      // assertions themselves complete in <1s once the title settles.
      test.setTimeout(60_000);

      await page.goto(`/c/${scene.slug}/`, { waitUntil: 'domcontentloaded' });

      // Wait for the title card (`<v-title-card>`, Story 1.9) to dissolve
      // and unmount before reading the HUD. Same gate Story 4.9's
      // stable-frame waiter uses; mirrored here so this test is
      // self-contained (no helper dependency).
      await page.waitForFunction(
        () => document.querySelector('v-title-card') === null,
        undefined,
        { timeout: 30_000, polling: 250 },
      );

      // The load-bearing assertion: the production-built
      // `<v-hud-chapter-title>` `<h2>` text + `data-slug` attribute
      // must populate with the active chapter's name. Reached through
      // two shadow-DOM hops (host → `<v-hud>` shadow → `<v-hud-chapter-title>`
      // shadow → `<h2>`).
      //
      // Uses `waitForFunction` rather than a one-shot `evaluate` so the
      // assertion absorbs the post-mount async chain (Lit's
      // `updated()` → setter → `setName()` → `requestUpdate()` →
      // next-microtask render). Without the wait this test would be
      // sensitive to Lit microtask timing.
      await page.waitForFunction(
        (expected: { slug: string; text: string }) => {
          const hud = document.querySelector('v-hud');
          if (hud === null) return false;
          const title = hud.shadowRoot?.querySelector(
            'v-hud-chapter-title',
          );
          if (title === null || title === undefined) return false;
          const h2 = title.shadowRoot?.querySelector('h2');
          if (h2 === null || h2 === undefined) return false;
          if (h2.getAttribute('data-slug') !== expected.slug) return false;
          if ((h2.textContent ?? '').trim() !== expected.text) return false;
          return true;
        },
        { slug: scene.slug, text: scene.expectedH2Text },
        { timeout: 30_000, polling: 250 },
      );

      // Belt-and-braces: pull the final state out and assert on it
      // directly so a failure produces a useful Playwright diff (not
      // just a "waitForFunction timed out" message).
      const observed = await page.evaluate(() => {
        const hud = document.querySelector('v-hud');
        const title = hud?.shadowRoot?.querySelector('v-hud-chapter-title');
        const h2 = title?.shadowRoot?.querySelector('h2');
        return {
          h2Text: (h2?.textContent ?? '').trim(),
          h2DataSlug: h2?.getAttribute('data-slug') ?? null,
        };
      });
      expect(observed.h2Text).toBe(scene.expectedH2Text);
      expect(observed.h2DataSlug).toBe(scene.slug);
    });
  }
});
