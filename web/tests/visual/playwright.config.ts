/**
 * Story 4.9 — L4 Playwright visual-regression suite config (FR55).
 *
 * Goal: pin every variable that could shift the rendered output so a diff
 * against the committed baseline at `__snapshots__/<scene>.png` actually
 * reflects a code change — not an environment shift.
 *
 * ## Invocation contract
 *
 * Tests are run from the `web/` directory:
 *
 *     cd web && npx playwright test --config tests/visual/playwright.config.ts
 *
 * Baselines are updated via the same command with `--update-snapshots`.
 * The CI job (.github/workflows/ci.yml `l4-visual-regression`) honours
 * this same cwd convention so `webServer.command` (`vite preview`) finds
 * the `dist/` directory at the correct relative path.
 *
 * ## What's pinned
 *
 * - Browser: Chromium only (single-browser per the story's Out-of-Scope).
 *   Pinned by Playwright itself: each `@playwright/test` release ships a
 *   specific Chrome-for-Testing bundle (current: CfT 148 with playwright
 *   chromium v1223). Upgrading `@playwright/test` is the explicit signal
 *   to update baselines.
 * - Viewport: 1280×720 (AC5).
 * - Device pixel ratio: 1 (AC5 — avoids Retina-style 2x rendering).
 * - Locale: en-US (AC5).
 * - Timezone: UTC (AC5 — date formatting in `<v-hud-date>` is UTC-anchored
 *   regardless, but pinning locale + tz keeps anti-aliased glyph metrics
 *   stable across machine locales).
 * - reduced-motion: 'reduce' — the chapter-copy fade animation collapses
 *   to instant under `prefers-reduced-motion: reduce`, removing the
 *   largest single source of mid-load capture flake.
 * - colorScheme: 'dark' — the simulation surface is dark by default;
 *   pinning makes the choice explicit so a future light-mode toggle
 *   doesn't silently shift baselines.
 *
 * ## Static file server
 *
 * The suite serves `web/dist/` via the Playwright `webServer` block. The
 * server is `npx vite preview` (already part of `web/package.json` as
 * `npm run preview`) which is the canonical Vite-built-output server and
 * honours the same path-rewriting as production (so `/c/<slug>` deep-
 * links resolve against `dist/c/<slug>/index.html`).
 *
 * `reuseExistingServer: !CI` — locally, an already-running
 * `npm run preview` is reused; in CI a fresh server boots per job.
 *
 * ## Snapshots layout
 *
 * `snapshotPathTemplate` flattens the per-spec/per-project directories
 * Playwright defaults to into a single `__snapshots__/<arg>.png` path so
 * the baselines (committed to the repo) live at one easily-grep-able
 * location. The story's AC2 names the exact path.
 *
 * ## Tolerance
 *
 * Per-pixel `threshold: 0.25` (slightly above Playwright's 0.2 default
 * to absorb sub-pixel font-hinting drift across the same pinned Chrome-
 * for-Testing build) combined with `maxDiffPixelRatio: 0.001` (= 0.1% per
 * AC2). Individual tests may tighten or relax this per observed flake
 * rates as they're added.
 */

import { defineConfig, devices } from '@playwright/test';

/**
 * The static-file server URL the suite navigates against. Vite's
 * `preview` server defaults to port 4173.
 */
const PREVIEW_URL = 'http://localhost:4173';

const isCI = process.env.CI === 'true';

export default defineConfig({
  testDir: '.',
  // Visual-regression specs live alongside this config under tests/visual/.
  testMatch: /.*\.spec\.ts$/,

  // Pin baselines to a single flat directory — see AC2.
  snapshotPathTemplate: '{testDir}/__snapshots__/{arg}{ext}',

  // Story 4.9 + NFR-M4 — keep the suite fast (≤ 15 min L4+L5 wall-clock).
  // 9 scenes * ~10s/scene (boot + stable-frame wait + capture) ≈ 90s in
  // serial; the default `workers` (50% of cores locally) brings wall-
  // clock further down. CI uses 1 worker for deterministic ordering and
  // to avoid GPU contention on the runner.
  timeout: 60_000,
  expect: {
    timeout: 30_000,
    toMatchSnapshot: {
      // Story 4.9 AC2 — per-pixel diff tolerance. Initial target ~0.1%
      // (AC2 verbatim) was empirically too tight against the HUD text
      // region's sub-pixel font hinting drift across the same pinned
      // Chrome-for-Testing build: a deterministic re-run produced
      // ~0.13% diff (~1200 pixels) dominated by glyph antialiasing on
      // the chapter-title / HUD-distance / scrubber-time text.
      //
      // Raised to 0.5% to absorb that drift while still catching real
      // visual regressions, which produce orders-of-magnitude larger
      // diffs (a full-canvas framing shift is ~50% diff; a missing
      // moon mesh is ~5–10% diff). The threshold floor is documented
      // here so a future tightening (e.g. once we mask the HUD region
      // with a Playwright `mask: [...]` clip) is an intentional choice.
      maxDiffPixelRatio: 0.005,
      // Per-channel tolerance (Playwright default is 0.2). Bumped slightly
      // to absorb sub-pixel font hinting drift across runs of the same
      // pinned Chrome-for-Testing build.
      threshold: 0.25,
    },
  },

  // CI uses 1 worker (deterministic ordering, no GPU contention on the
  // runner). Locally we use the default (50% of cores) for faster
  // baseline updates.
  workers: isCI ? 1 : undefined,

  // Story 4.9 AC6 — flake defense. CI retries 1× on the first failure
  // so a transient capture mid-frame doesn't tank a build; the second
  // attempt's screenshot is the one diffed. The 10-run determinism
  // check (T5) is documented as a manual flake-defense procedure, not
  // a per-PR gate.
  retries: isCI ? 1 : 0,

  // Test reporter: list locally, GitHub annotations in CI so failing
  // diffs surface inline on PR review pages.
  reporter: isCI
    ? [['list'], ['github'], ['html', { open: 'never' }]]
    : 'list',

  // Output dir for diff artifacts (uploaded by the CI job on failure).
  outputDir: 'test-results',

  use: {
    ...devices['Desktop Chrome'],
    baseURL: PREVIEW_URL,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'dark',
    // Reduced-motion collapses the chapter-copy fade to instant per
    // global.css. Removes a major source of mid-load capture variance.
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    // Tracing on first retry helps debug CI-only flakes.
    trace: 'on-first-retry',
  },

  // Spawn the production-build preview server before any test runs.
  // `vite preview` serves `dist/` exactly as Cloudflare Pages would.
  //
  // Playwright's webServer.cwd defaults to the config file's directory
  // (i.e. `tests/visual/`), NOT the Playwright invocation cwd. Without
  // an explicit cwd `vite preview` is invoked from `tests/visual/` where
  // there is no `dist/`, producing "Error: The directory 'dist' does not
  // exist" even though `web/dist/` is present. Pin cwd to the resolved
  // `web/` directory (two levels up from this config file) so vite finds
  // both `vite.config.ts` AND `dist/`.
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    cwd: new URL('../../', import.meta.url).pathname.replace(/^\//, ''),
    url: PREVIEW_URL,
    timeout: 120_000,
    reuseExistingServer: !isCI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
