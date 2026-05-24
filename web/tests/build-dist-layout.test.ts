/**
 * Story 6.0 AC1 — LAYOUT-asserting production-build regression test
 * (Epic 5 retro Action item #1 — pre-Epic-6 deferred cleanup).
 *
 * Closes the gap that BUG-E5-007 (Epic 5 cross-review, 2026-05-24)
 * exploited: ALL automated tiers (web vitest 3088, L4 Playwright 9
 * baselines) AND every per-story Chrome DevTools MCP smoke (Stories
 * 5.0–5.4) PASSED while the production build shipped with the main CSS
 * file unlinked from `dist/index.html`. The HUD corners and chapter copy
 * panel collapsed to overlapping rectangles at (0,0), but:
 *
 *   - The L3 vitest tier asserted on `<h2>` text content (not position);
 *     text renders correctly at (0,0).
 *   - The L4 Playwright pixel-diff suite locked the broken layout INTO
 *     its baselines — pixel-diff vs. self is clean when both sides are
 *     broken in the same way.
 *   - The per-story MCP smokes either ran against dev mode (Vite HMR
 *     loads CSS correctly there) OR asserted on text (rendering correct
 *     under broken positions).
 *
 * Story 5.0's `web/tests/build-dist-css-link.test.ts` (added during the
 * cross-review fix) asserts the `<link rel="stylesheet">` is present in
 * the built HTML — but does NOT assert on the layout *consequence*. A
 * future bundler-config change that silently re-broke CSS injection
 * through a different mechanism (split-chunk CSS-import order, CSP-induced
 * load failure, plugin-conditional injection) would slip past the
 * Story-5.0 spec. This test extends defense-in-depth by asserting:
 *
 *   1. The static-parse invariants (link tag present, hashed `main-*.css`
 *      asset, `<link>` comes AFTER the inline FOUC-shim `<style>` block
 *      per HEAD-priority discipline).
 *   2. The layout-rendered invariants (HUD corners at expected pixel
 *      positions per `getBoundingClientRect()`, scrubber gutters present,
 *      chapter-copy panel on-screen) — using Playwright as a library
 *      from inside this vitest spec.
 *   3. The synthetic missing-CSS-link case — programmatically stripping
 *      the `<link rel="stylesheet">` via Playwright's `page.route()`
 *      interception and asserting the layout-invariant check FAILS,
 *      proving the test would catch a re-regression of BUG-E5-007's
 *      class.
 *
 * ## Test pyramid posture (Rule 13 — test discoverability)
 *
 * This spec lives at `web/tests/build-dist-layout.test.ts` so it
 * participates in the default `npm test` (vitest) sweep — NOT under
 * `web/tests/visual/` which is excluded from vitest and routed
 * exclusively through `npm run test:visual` (Playwright runner). The
 * static-parse portion ALWAYS runs (it gates on `existsSync(dist)` to
 * skip if dist is absent, matching the Story 5.0 sibling pattern). The
 * Playwright-tier portion is gated behind `describe.skipIf(!existsSync(
 * web/dist/index.html))` so a fresh `git clone` running `npm test`
 * without `npm run build` first does not see a spurious failure (Story
 * 3.7 + Story 5.0 slow-tier-gating pattern).
 *
 * ## Why not under tests/visual/
 *
 * `tests/visual/` is for L4 pixel-diff snapshot regressions that ship
 * baselines committed to the repo. This spec uses Playwright as a
 * *runtime assertion harness* — it doesn't capture or diff screenshots;
 * it asserts on `getBoundingClientRect()` invariants. The two purposes
 * are intentionally separated so the vitest sweep can run this test
 * (without needing the Playwright runner) while the visual-regression
 * suite stays under its own runner config.
 *
 * ## Why not happy-dom
 *
 * The original story Dev Notes line 206 listed happy-dom as a possible
 * substrate. happy-dom does not compute CSS layout: `getBoundingClientRect`
 * returns zeros regardless of stylesheet linkage, which is precisely the
 * defect class this test exists to catch. A real browser is the binding
 * substrate. Chromium-via-Playwright is the lightest weight option that
 * actually computes layout.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright';
import type { PreviewServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WEB_ROOT = join(__dirname, '..');
const DIST_DIR = join(WEB_ROOT, 'dist');
const ROOT_HTML = join(DIST_DIR, 'index.html');
const distAvailable = existsSync(ROOT_HTML);

// Viewport matches Story 4.9 L4 visual-regression config so HUD-corner
// invariants below align with the same canonical breakpoint baseline.
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

// --- Static-parse tier -------------------------------------------------

// Always runs (subject to dist-presence check). Defense-in-depth restating
// Story 5.0's CSS-link check AND asserting on the document-order invariant
// (`<link>` AFTER the inline FOUC-shim `<style>` block per HEAD-priority
// discipline — if a future plugin emits a `<style>` tag AFTER the `<link>`,
// inline tokens would shadow the linked CSS's same-selector rules).
describe.skipIf(!distAvailable)(
  'Story 6.0 AC1 static parse — dist/index.html link + inline style order',
  () => {
    it('contains a <link rel="stylesheet"> for the hashed main-*.css asset', () => {
      const html = readFileSync(ROOT_HTML, 'utf-8');
      // Story 5.0 BUG-007 fix emits the asset as `main-<hash>.css` per
      // Vite's default `assetFileNames`. The Story 6.0 spec wording
      // originally said `index-*.css`; Rule 5 amendment in the story file
      // corrects this to `main-*.css` (asset name comes from the
      // `rollupOptions.input.main` entry).
      const linkRegex =
        /<link\s+rel="stylesheet"\s+(?:crossorigin\s+)?href="\/assets\/main-[^"]+\.css"/;
      expect(html).toMatch(linkRegex);
    });

    it('contains the Story 1.7 AC2 FOUC-shim inline <style> block', () => {
      // The inline <style> block declares `--v-color-bg`, `--v-color-fg`,
      // `--v-font-sans`, `--v-font-size-body` so the page paints in dark
      // mode + system-ui before the main CSS bundle parses. The block is
      // a hard prerequisite for non-flashing first-paint; assert its
      // anchor selector + at least one of its tokens is emitted to dist.
      const html = readFileSync(ROOT_HTML, 'utf-8');
      expect(html).toMatch(/<style>[\s\S]*?:root\s*\{[\s\S]*?--v-color-bg/);
    });

    it('emits the inline <style> BEFORE the <link rel="stylesheet"> (head-priority)', () => {
      // Document order matters: the inline <style> defines defensive
      // first-paint tokens. If a future plugin reorders the head and
      // places <style> AFTER <link>, the inline tokens would shadow any
      // overriding rules in the linked CSS for these specific custom
      // properties. The current order (inline first, link last) preserves
      // the canonical "link wins for the broad surface, inline only paints
      // before link parses" contract.
      const html = readFileSync(ROOT_HTML, 'utf-8');
      const styleIdx = html.indexOf('<style>');
      const linkIdx = html.search(
        /<link\s+rel="stylesheet"\s+(?:crossorigin\s+)?href="\/assets\/main-/,
      );
      expect(styleIdx).toBeGreaterThan(-1);
      expect(linkIdx).toBeGreaterThan(-1);
      expect(styleIdx).toBeLessThan(linkIdx);
    });
  },
);

// --- Playwright-tier ---------------------------------------------------

// Gated on dist presence per Story 3.7 / Story 5.0 slow-tier discipline.
// Runs Chromium as a library against an in-process `vite preview` server.
// Skipped silently on a fresh checkout without `npm run build`; the
// static-parse tier above still runs.
describe.skipIf(!distAvailable)(
  'Story 6.0 AC1 Playwright tier — production-build HUD layout invariants',
  () => {
    let browser: Browser | null = null;
    let server: PreviewServer | null = null;
    let baseUrl = '';

    beforeAll(async () => {
      // `vite preview` is the canonical static-file server for the
      // production build (also what `web/tests/visual/playwright.config.ts`
      // uses). Programmatic API picks a free port and avoids strict-port
      // collisions with any concurrent `npm run preview`.
      const { preview } = await import('vite');
      server = await preview({
        root: WEB_ROOT,
        preview: { port: 0, strictPort: false, host: '127.0.0.1' },
      });
      const url = server.resolvedUrls?.local?.[0];
      if (typeof url !== 'string' || url.length === 0) {
        throw new Error(
          'vite preview did not expose a local URL — cannot bind Playwright',
        );
      }
      baseUrl = url.replace(/\/$/, '');

      const { chromium } = await import('playwright');
      browser = await chromium.launch();
    }, 120_000);

    afterAll(async () => {
      if (browser !== null) {
        await browser.close();
      }
      if (server !== null) {
        await new Promise<void>((resolve, reject) => {
          server!.httpServer.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });

    // Helper: wait for the `<v-title-card>` (Story 1.9 first-paint) to
    // dismount before reading HUD layout. Mirrors the
    // `hud-chapter-title-prod.spec.ts` gating pattern. The HUD corners
    // are present in the DOM before the card dismounts but the title
    // card overlay can shift bounding-rect reads briefly during fade.
    const waitForHud = async (page: Page): Promise<void> => {
      await page.waitForFunction(
        () => document.querySelector('v-title-card') === null,
        undefined,
        { timeout: 30_000, polling: 250 },
      );
      // After the title card dismounts, wait for <v-hud> to be present
      // and for each of the four corners to have rendered with a
      // non-zero bounding rect (one frame after Lit's first update).
      await page.waitForFunction(
        () => {
          const hud = document.querySelector('v-hud');
          if (hud === null) return false;
          const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
          for (const cls of corners) {
            const div = hud.shadowRoot?.querySelector(`.corner.${cls}`);
            if (div === null || div === undefined) return false;
            const r = (div as HTMLElement).getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return false;
          }
          return true;
        },
        undefined,
        { timeout: 30_000, polling: 250 },
      );
    };

    /**
     * Reads the bounding rects for the five HUD-corner landmarks +
     * the mission scrubber. Returns null entries for elements not
     * present (e.g. embed mode hides the attitude indicator).
     */
    const readLandmarks = async (page: Page): Promise<{
      topLeft: DOMRect;
      topRight: DOMRect;
      bottomLeft: DOMRect;
      bottomRight: DOMRect;
      scrubber: DOMRect | null;
      chapterCopy: DOMRect | null;
    }> => {
      return await page.evaluate(() => {
        const hud = document.querySelector('v-hud');
        if (hud === null) throw new Error('v-hud absent');
        const sr = hud.shadowRoot;
        if (sr === null) throw new Error('v-hud shadow root absent');
        const read = (sel: string): DOMRect => {
          const el = sr.querySelector(sel);
          if (el === null) throw new Error(`landmark ${sel} absent`);
          return (el as HTMLElement).getBoundingClientRect().toJSON() as DOMRect;
        };
        const optional = (sel: string): DOMRect | null => {
          const el = document.querySelector(sel);
          if (el === null) return null;
          return (el as HTMLElement).getBoundingClientRect().toJSON() as DOMRect;
        };
        // Mission scrubber lives in light DOM (mounted by startFirstPaint
        // in main.ts, not inside <v-hud>'s shadow).
        const scrubberEl = document.querySelector(
          'v-timeline-scrubber[variant="mission"]',
        );
        const scrubber =
          scrubberEl === null
            ? null
            : ((scrubberEl as HTMLElement)
                .getBoundingClientRect()
                .toJSON() as DOMRect);
        return {
          topLeft: read('.corner.top-left'),
          topRight: read('.corner.top-right'),
          bottomLeft: read('.corner.bottom-left'),
          bottomRight: read('.corner.bottom-right'),
          scrubber,
          chapterCopy: optional('v-chapter-copy'),
        };
      });
    };

    it('cold-loads root / with HUD corners at expected viewport positions', async () => {
      if (browser === null) throw new Error('browser failed to launch');
      const ctx = await browser.newContext({
        viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      const page = await ctx.newPage();
      try {
        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
        await waitForHud(page);
        const lm = await readLandmarks(page);

        // AC1 (b) — the five HUD-corner invariants. The thresholds come
        // from the canonical `--v-edge-margin` token (24px per
        // `tokens.css`) plus generous tolerance to absorb each corner's
        // own per-child layout (the HUD-distance / attitude / date
        // readouts can be ~60–180 px wide each). The thresholds are
        // INTENTIONALLY LOOSE — the binding signal is "HUD corner is in
        // its proper quadrant", not "HUD corner is at exactly pixel X".
        // BUG-E5-007's failure mode collapses ALL FOUR corners to (0,0),
        // which would fail every one of these.
        expect(
          lm.topLeft.left,
          'top-left corner not in left gutter',
        ).toBeLessThan(200);
        expect(lm.topLeft.top, 'top-left corner not in top band').toBeLessThan(
          100,
        );

        expect(
          lm.topRight.right,
          'top-right corner not in right gutter',
        ).toBeGreaterThan(VIEWPORT_WIDTH - 200);
        expect(
          lm.topRight.top,
          'top-right corner not in top band',
        ).toBeLessThan(100);

        expect(
          lm.bottomLeft.left,
          'bottom-left corner not in left gutter',
        ).toBeLessThan(200);
        expect(
          lm.bottomLeft.bottom,
          'bottom-left corner not in bottom band',
        ).toBeGreaterThan(VIEWPORT_HEIGHT - 100);

        expect(
          lm.bottomRight.right,
          'bottom-right corner not in right gutter',
        ).toBeGreaterThan(VIEWPORT_WIDTH - 200);
        expect(
          lm.bottomRight.bottom,
          'bottom-right corner not in bottom band',
        ).toBeGreaterThan(VIEWPORT_HEIGHT - 100);

        // AC1 (b) — mission scrubber gutters. BUG-E5-009 surfaced when
        // the scrubber spanned the full content width and placed chapter
        // markers under the play button; the gutter fix landed in the
        // cross-review pass. Without the fix, scrubber.left would be at
        // or near 0 and scrubber.right would be at or near 1280.
        expect(lm.scrubber, 'mission scrubber absent at root').not.toBeNull();
        expect(
          lm.scrubber!.left,
          'mission scrubber violates left gutter (BUG-E5-009 class)',
        ).toBeGreaterThan(50);
        expect(
          lm.scrubber!.right,
          'mission scrubber violates right gutter (BUG-E5-009 class)',
        ).toBeLessThan(VIEWPORT_WIDTH - 50);
      } finally {
        await ctx.close();
      }
    }, 90_000);

    it('renders chapter-copy panel on-screen at /c/v1-jupiter/', async () => {
      if (browser === null) throw new Error('browser failed to launch');
      const ctx = await browser.newContext({
        viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      const page = await ctx.newPage();
      try {
        await page.goto(`${baseUrl}/c/v1-jupiter/`, {
          waitUntil: 'domcontentloaded',
        });
        await waitForHud(page);
        // <v-chapter-copy> mounts after ChapterDirector seeds the held
        // state and the chapter spec resolves. Wait for it briefly.
        await page
          .waitForFunction(
            () => document.querySelector('v-chapter-copy') !== null,
            undefined,
            { timeout: 15_000, polling: 250 },
          )
          .catch(() => {
            /* tolerate absence — assertion below treats null as failure */
          });
        const lm = await readLandmarks(page);

        // AC1 (c) — chapter-copy panel must be on-screen + within
        // viewport. BUG-E5-007's failure mode left the panel at (0,0)
        // overlapping the HUD top-left corner. Without the CSS link,
        // `right` would be at or near the panel's natural width (since
        // `left` is 0); WITH the CSS link the panel is positioned per
        // its `--v-chapter-copy-*` tokens. The binding signal is "panel
        // is somewhere reasonable", not "panel is at exact pixel X".
        expect(
          lm.chapterCopy,
          'v-chapter-copy did not mount at /c/v1-jupiter/',
        ).not.toBeNull();
        expect(
          lm.chapterCopy!.right,
          'chapter-copy right edge overflows viewport',
        ).toBeLessThanOrEqual(VIEWPORT_WIDTH);
        expect(
          lm.chapterCopy!.top,
          'chapter-copy top above viewport',
        ).toBeGreaterThanOrEqual(0);
        expect(
          lm.chapterCopy!.bottom,
          'chapter-copy bottom below viewport',
        ).toBeLessThanOrEqual(VIEWPORT_HEIGHT);
      } finally {
        await ctx.close();
      }
    }, 90_000);

    it('catches a missing CSS-link regression (synthetic BUG-E5-007)', async () => {
      // The load-bearing case — proves this test would catch the
      // original defect. We intercept the HTML response and strip the
      // `<link rel="stylesheet">` tag, simulating BUG-E5-007's failure
      // mode. The HUD corners should collapse: at least three of the
      // four corners should fail their gutter check (the unstyled
      // corners stack at the document origin).
      //
      // Page.route() interception is preferable to copying dist/ to a
      // tempfile + spinning a second server: the production-build
      // assets (hashed JS, CSS) all resolve normally; only the HTML
      // entry is rewritten. The intercept is scoped to the root URL
      // only — sub-resources pass through.
      if (browser === null) throw new Error('browser failed to launch');
      const ctx = await browser.newContext({
        viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      const page = await ctx.newPage();
      try {
        await page.route(`${baseUrl}/`, async (route, request) => {
          if (request.url().replace(/\/$/, '') !== baseUrl) {
            await route.continue();
            return;
          }
          const original = readFileSync(ROOT_HTML, 'utf-8');
          const stripped = original.replace(
            /<link\s+rel="stylesheet"\s+(?:crossorigin\s+)?href="\/assets\/main-[^"]+\.css">\s*/,
            '',
          );
          // Sanity check: the substitution must have actually removed a
          // tag; if it didn't, the assertion below would still pass
          // (false confidence). Throw to make the test fail loudly.
          if (stripped === original) {
            throw new Error(
              'CSS-link strip regex did not match — defense test cannot prove regression coverage',
            );
          }
          await route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: stripped,
          });
        });

        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
        // Wait briefly for the HUD to mount even in the broken state —
        // mount itself still works; only the layout collapses.
        await page
          .waitForFunction(
            () => {
              const hud = document.querySelector('v-hud');
              if (hud === null) return false;
              return hud.shadowRoot?.querySelector('.corner.top-left') !== null;
            },
            undefined,
            { timeout: 30_000, polling: 250 },
          )
          .catch(() => {
            /* tolerate timeout — assertion below interrogates state */
          });

        // Title card may never dismount cleanly without CSS; sample
        // landmarks regardless. The binding signal: at least three of
        // the four HUD corners collapse to the viewport origin (no
        // `--v-edge-margin` token means `top/left/right/bottom` resolve
        // to `auto` → 0).
        const rects = await page.evaluate(() => {
          const hud = document.querySelector('v-hud');
          const sr = hud?.shadowRoot;
          if (sr === null || sr === undefined) return null;
          const read = (sel: string): DOMRect | null => {
            const el = sr.querySelector(sel);
            if (el === null) return null;
            return (el as HTMLElement).getBoundingClientRect().toJSON() as DOMRect;
          };
          return {
            topLeft: read('.corner.top-left'),
            topRight: read('.corner.top-right'),
            bottomLeft: read('.corner.bottom-left'),
            bottomRight: read('.corner.bottom-right'),
          };
        });

        // The synthetic case proves the layout-invariant check fails
        // (the test would catch the defect). Count violations against
        // the same gutter thresholds the happy-path test uses.
        expect(rects, 'HUD shadow root never rendered').not.toBeNull();
        const violations: string[] = [];
        // Note (code-review clarification, Story 6.0 review 2026-05-24):
        // the top-left corner is INTENTIONALLY excluded from the
        // violation counter. Under BUG-E5-007 (no CSS link) every
        // `--v-edge-margin`-anchored gutter resolves to 0, so
        // `top-left.left` is 0 — which trivially passes the happy-path
        // `left < 200` check (0 < 200 is true). The top-left corner is
        // structurally unable to fail in a way the other three corners
        // can fail (right edges collapse leftward; bottom edges
        // collapse upward). Counting only the THREE measurable
        // collapse signals (top-right.right, bottom-left.bottom,
        // bottom-right.right, bottom-right.bottom — that's actually
        // four bottom/right checks against the right & bottom edges)
        // is by design. The ≥3 threshold gives one bit of slack while
        // proving regression coverage. Track the top-left rect only as
        // a null-sanity probe (a missing rect is still a violation).
        if (rects!.topLeft === null) {
          violations.push('top-left-missing');
        }
        if (
          rects!.topRight === null ||
          rects!.topRight.right <= VIEWPORT_WIDTH - 200
        ) {
          violations.push('top-right');
        }
        if (
          rects!.bottomLeft === null ||
          rects!.bottomLeft.bottom <= VIEWPORT_HEIGHT - 100
        ) {
          violations.push('bottom-left');
        }
        if (
          rects!.bottomRight === null ||
          rects!.bottomRight.right <= VIEWPORT_WIDTH - 200
        ) {
          violations.push('bottom-right');
        }
        if (
          rects!.bottomRight === null ||
          rects!.bottomRight.bottom <= VIEWPORT_HEIGHT - 100
        ) {
          violations.push('bottom-right-bottom');
        }
        // At least 3 of the 4 gutter-edge invariants fail under the
        // synthetic regression — proves regression coverage.
        expect(
          violations.length,
          `expected ≥3 HUD-corner layout violations under synthetic missing-CSS-link, observed ${violations.length} (${violations.join(
            ', ',
          )})`,
        ).toBeGreaterThanOrEqual(3);
      } finally {
        await ctx.close();
      }
    }, 90_000);
  },
);
