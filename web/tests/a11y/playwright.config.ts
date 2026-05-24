/**
 * Story 6.4 AC2 — Playwright config for the axe-core route matrix.
 *
 * Runs `routes.spec.ts` against the production-built `dist/` via
 * `vite preview` (mirroring the Story 4.9 visual-regression config's
 * model) so every static route exercises the production rendering
 * pipeline + plugin substitutions.
 *
 * ## Invocation
 *
 *     cd web && npm run build && npx playwright test --config tests/a11y/playwright.config.ts
 *
 * Story 6.4 AC2 — moderate/minor violations are reported in CI output;
 * critical/serious violations FAIL the build.
 *
 * ## NFR-M4 (AC7) — wall-clock budget
 *
 * 14 routes × ~3s/route ≈ 45s serial. CI uses 1 worker for deterministic
 * ordering; comfortably under the 15-minute L4/L5 cap.
 *
 * ## Pinned environment (mirrors Story 4.9 discipline)
 *
 * - Browser: Chromium only (single-browser per the story's Out-of-Scope).
 * - Viewport: 1280×720.
 * - Locale: en-US. Timezone: UTC.
 * - colorScheme: 'dark' (the simulation surface is dark by design).
 * - reducedMotion: 'reduce' (collapses the chapter-copy fade to instant
 *   so axe runs against a stable post-transition DOM, not a mid-fade
 *   snapshot).
 */

import { defineConfig, devices } from '@playwright/test';

const PREVIEW_URL = 'http://localhost:4173';
const isCI = process.env.CI === 'true';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: isCI ? 1 : undefined,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['github']] : 'list',
  outputDir: 'test-results',

  use: {
    ...devices['Desktop Chrome'],
    baseURL: PREVIEW_URL,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    trace: 'on-first-retry',
  },

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
