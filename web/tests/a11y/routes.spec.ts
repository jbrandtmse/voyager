/**
 * Story 6.4 AC2 — axe-core route matrix.
 *
 * Drives axe-core against every static route in the production dist
 * via Playwright + @axe-core/playwright. The 14 routes are:
 *
 *   - `/` (homepage simulation surface)
 *   - `/about` (editorial surface)
 *   - 11 chapter deep-links: `/c/<slug>` for each of the chapter slugs
 *     `launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`,
 *     `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`,
 *     `v1-heliopause`, `v2-heliopause`
 *   - `/unsupported.html` (three variants per Story 1.8: default webgl2,
 *     `?reason=webgl2`, `?reason=brotli` — the brotli historical
 *     pre-Story-1.16 path; per ADR-0004 the modern boot never produces
 *     this URL, but the rendered fallback page must still be a11y-clean)
 *
 * Impact-tier gate (Story 6.4 AC2):
 *   - critical + serious violations FAIL the build (per-route assertion).
 *   - moderate + minor violations are reported via test.info().annotations
 *     and logged to the test output — not a build failure.
 *
 * Gate against dist presence (Story 3.7 slow-tier discipline): the suite
 * presumes `cd web && npm run build` ran before invocation; the
 * `webServer.command` (`vite preview`) prints a clear error if
 * `web/dist/` is missing.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM-safe `__dirname` resolution (Playwright transpiles the spec as an
// ES module).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Chapter slugs — keep in sync with ALL_CHAPTERS in web/src/chapters/registry.ts.
// Listed verbatim (not imported) so the spec file is decoupled from the runtime
// TS resolution — Playwright's testFs picks up this file as a plain .ts module.
const CHAPTER_SLUGS = [
  'launch-v1',
  'launch-v2',
  'v1-jupiter',
  'v2-jupiter',
  'v1-saturn',
  'v2-saturn',
  'v2-uranus',
  'v2-neptune',
  'pale-blue-dot',
  'v1-heliopause',
  'v2-heliopause',
] as const;

const ROOT_ROUTES = ['/', '/about'] as const;

const UNSUPPORTED_VARIANTS = [
  '/unsupported.html',
  '/unsupported.html?reason=webgl2',
  '/unsupported.html?reason=brotli',
] as const;

// AC2 — gate the suite behind dist-presence so a fresh checkout that
// hasn't run `npm run build` produces a clear skip rather than a
// confusing "404 against vite preview" cascade.
const distIndexHtml = resolve(__dirname, '..', '..', 'dist', 'index.html');
const distPresent = existsSync(distIndexHtml);

test.describe('Story 6.4 AC2 — axe-core route matrix', () => {
  test.skip(
    !distPresent,
    'web/dist/index.html missing — run `npm run build` first (AC2 dist-presence gate)',
  );

  for (const route of ROOT_ROUTES) {
    test(`axe-core: ${route} — no critical/serious violations`, async ({
      page,
    }, testInfo) => {
      await page.goto(route);
      // Let the SPA boot far enough that the first-paint surface is
      // present. The HUD `aside` is the most reliable anchor on the
      // simulation surface; for `/about` the `v-about-page` element
      // is the anchor. We try both — whichever resolves first.
      await Promise.race([
        page.waitForSelector('aside[aria-label="Mission HUD"]', {
          timeout: 15_000,
        }),
        page.waitForSelector('v-about-page', { timeout: 15_000 }),
      ]).catch(() => {
        // Fallback — if neither selector lands within 15s the route
        // is degenerate; let axe surface whatever it sees.
      });
      const results = await new AxeBuilder({ page }).analyze();
      logImpactTiers(results, testInfo);
      const blockers = filterBlockers(results.violations);
      expect(blockers, formatBlockers(route, blockers)).toEqual([]);
    });
  }

  for (const slug of CHAPTER_SLUGS) {
    const route = `/c/${slug}`;
    test(`axe-core: ${route} — no critical/serious violations`, async ({
      page,
    }, testInfo) => {
      await page.goto(route);
      await page
        .waitForSelector('aside[aria-label="Mission HUD"]', {
          timeout: 15_000,
        })
        .catch(() => {
          // Fallback — same pattern as the root routes.
        });
      const results = await new AxeBuilder({ page }).analyze();
      logImpactTiers(results, testInfo);
      const blockers = filterBlockers(results.violations);
      expect(blockers, formatBlockers(route, blockers)).toEqual([]);
    });
  }

  for (const route of UNSUPPORTED_VARIANTS) {
    test(`axe-core: ${route} — no critical/serious violations`, async ({
      page,
    }, testInfo) => {
      await page.goto(route);
      // The unsupported page is static (no JS boot dependency); the
      // body content is already rendered by the time goto resolves.
      const results = await new AxeBuilder({ page }).analyze();
      logImpactTiers(results, testInfo);
      const blockers = filterBlockers(results.violations);
      expect(blockers, formatBlockers(route, blockers)).toEqual([]);
    });
  }
});

interface AxeViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null | undefined;
  description: string;
  nodes: Array<{ target: ReadonlyArray<string | string[]> }>;
}

function filterBlockers(violations: AxeViolation[]): AxeViolation[] {
  return violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
}

function logImpactTiers(
  results: { violations: AxeViolation[] },
  testInfo: { annotations: Array<{ type: string; description?: string }> },
): void {
  for (const v of results.violations) {
    const tier =
      v.impact === 'critical' || v.impact === 'serious'
        ? 'BLOCKER'
        : 'ADVISORY';
    const msg = `[axe ${v.impact ?? 'unknown'} — ${tier}] ${v.id}: ${v.description} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`;
    if (tier === 'ADVISORY') {
      testInfo.annotations.push({ type: 'a11y-advisory', description: msg });
      console.warn(msg);
    } else {
      testInfo.annotations.push({ type: 'a11y-blocker', description: msg });
      console.error(msg);
    }
  }
}

function formatBlockers(route: string, blockers: AxeViolation[]): string {
  if (blockers.length === 0) return '';
  return [
    `Route ${route} has ${blockers.length} critical/serious axe-core violation${blockers.length === 1 ? '' : 's'}:`,
    ...blockers.map((b) => {
      const targets = b.nodes
        .slice(0, 3)
        .map((n) => JSON.stringify(n.target))
        .join(', ');
      return `  - [${b.impact}] ${b.id}: ${b.description} (e.g. ${targets})`;
    }),
  ].join('\n');
}
