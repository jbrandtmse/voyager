/**
 * Story 2.6 QA — build-output integration test for OG card pipeline.
 *
 * The dev-authored tests cover:
 *   - `src/build/og-cards.test.ts` — manifest builder + content hash + helper shape (in-memory)
 *   - `src/build/og-html-emitter.test.ts` — HTML templating + escape discipline (string-level)
 *   - `scripts/og-cards-defense.test.ts` — emitOgArtifacts / verifyOgArtifacts (temp-dir filesystem)
 *
 * What those DON'T cover: the REAL Vite-plugin-driven `web/dist/` tree that
 * ships to the CDN. The plugin path and the script path are two distinct
 * code branches (`vite.config.ts::ogCardsPlugin` vs `scripts/og-cards.ts::
 * emitOgArtifacts`); a regression that breaks only the plugin path would
 * slip past the existing tier. This file closes that gap by asserting the
 * cross-cutting contract against the real `web/dist/` artifacts.
 *
 * Gated on `dist/og/og-manifest.json` existing — a `vitest run` without a
 * prior `vite build` is allowed to skip these tests (mirrors the pattern
 * established by `tests/feature-probe-size.test.ts`). The CI lane is
 * expected to `npm run build` before `npm test`.
 *
 * Voyager skill rules:
 *   - Rule 2 (Integration ACs): this IS the Integration AC6 evidence —
 *     "smoke against built artifacts (PNG existence + meta tag emission)"
 *     from the story file's Integration ACs section.
 *   - Rule 3 (browser-smoke per-story exit criterion): Story 2.6 is
 *     PARTIALLY EXEMPT — the story touches BUILD-time artifacts under
 *     web/src/build/ + web/scripts/, not runtime browser surfaces. The
 *     `ChapterSpec.ogDescription` field added to web/src/types/chapter.ts
 *     is type-only data (consumed at build time by the OG generator; the
 *     runtime FSM in chapter-director.ts treats it as opaque). Per the
 *     Story 2.6 Dev Agent Record's Lead-side smoke recipe section:
 *     "ADR-0010 Layer-1 (Chrome DevTools MCP) is reserved for stories
 *     whose code runs in a real browser; OG card generation is build-only."
 *     This integration test is the equivalent gate.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { ALL_CHAPTERS } from '../src/chapters/registry';
import {
  buildOgManifest,
  indexManifestBySlug,
  OG_PUBLIC_DIR,
  ogPngFilenameFor,
  type OgManifest,
} from '../src/build/og-cards';
import { CANONICAL_ORIGIN } from '../src/build/og-html-emitter';

const WEB_ROOT = resolve(__dirname, '..');
const DIST_DIR = resolve(WEB_ROOT, 'dist');
const DIST_OG_DIR = join(DIST_DIR, OG_PUBLIC_DIR);
const DIST_MANIFEST = join(DIST_OG_DIR, 'og-manifest.json');
const DIST_INDEX = join(DIST_DIR, 'index.html');
const DIST_C_DIR = join(DIST_DIR, 'c');

const distHasOgArtifacts = existsSync(DIST_MANIFEST);

// PNG magic-byte signature — Story 2.6 currently emits 1×1 transparent
// placeholders (real Playwright capture deferred to Story 4.9 / 7.x). The
// signature check is byte-stable across the deferral; only the post-IHDR
// payload changes.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('Story 2.6 — dist/og/ manifest + PNG artifacts (Integration AC6)', () => {
  it.skipIf(!distHasOgArtifacts)(
    'dist/og/og-manifest.json exists and parses as JSON',
    () => {
      expect(existsSync(DIST_MANIFEST)).toBe(true);
      const raw = readFileSync(DIST_MANIFEST, 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'on-disk manifest is byte-identical to buildOgManifest() — single source of truth (R4)',
    () => {
      const raw = readFileSync(DIST_MANIFEST, 'utf8');
      const onDisk = JSON.parse(raw) as OgManifest;
      const expected = buildOgManifest();
      // JSON-roundtrip the expected too so we compare like-for-like
      // (Object.freeze artefacts vs plain objects).
      const expectedRoundTrip = JSON.parse(JSON.stringify(expected)) as OgManifest;
      expect(onDisk).toEqual(expectedRoundTrip);
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'manifest contains exactly 11 entries (AC3 count)',
    () => {
      const onDisk = JSON.parse(readFileSync(DIST_MANIFEST, 'utf8')) as OgManifest;
      expect(onDisk.entries.length).toBe(11);
      expect(onDisk.entries.length).toBe(ALL_CHAPTERS.length);
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'each manifest entry has a corresponding PNG on disk with PNG magic bytes',
    () => {
      const onDisk = JSON.parse(readFileSync(DIST_MANIFEST, 'utf8')) as OgManifest;
      for (const entry of onDisk.entries) {
        const pngPath = join(DIST_DIR, entry.imagePath);
        expect(existsSync(pngPath), `missing PNG: ${pngPath}`).toBe(true);
        const bytes = readFileSync(pngPath);
        // PNG magic-byte signature check — survives the Playwright-
        // deferral migration (placeholder OR real PNG both start with
        // the same 8-byte signature).
        for (let i = 0; i < PNG_SIGNATURE.length; i++) {
          expect(bytes[i], `PNG signature mismatch in ${entry.slug}`).toBe(
            PNG_SIGNATURE[i],
          );
        }
        expect(statSync(pngPath).size).toBeGreaterThan(0);
      }
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'every ALL_CHAPTERS slug resolves to a hashed PNG matching ogPngFilenameFor',
    () => {
      for (const chapter of ALL_CHAPTERS) {
        const expected = ogPngFilenameFor(chapter);
        const pngPath = join(DIST_OG_DIR, expected);
        expect(
          existsSync(pngPath),
          `expected hashed PNG ${expected} for chapter ${chapter.slug}`,
        ).toBe(true);
      }
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'no extra PNG files in dist/og/ beyond the 11 hashed chapter PNGs (and the manifest)',
    () => {
      // Defense against an old / stale PNG drifting in from a previous
      // build with a different content hash. The plugin emits files
      // additively via emitFile() — stale files from a previous build
      // would NOT be detected by the parity test alone.
      const { readdirSync } = require('node:fs') as typeof import('node:fs');
      const entries = readdirSync(DIST_OG_DIR);
      const pngFiles = entries.filter((f: string) => f.endsWith('.png'));
      expect(pngFiles.length).toBe(11);
    },
  );
});

describe('Story 2.6 — per-chapter HTML shells at dist/c/<slug>/index.html (Integration AC6)', () => {
  it.skipIf(!distHasOgArtifacts)(
    'dist/c/ exists with one directory per chapter slug',
    () => {
      expect(existsSync(DIST_C_DIR)).toBe(true);
      for (const chapter of ALL_CHAPTERS) {
        const chapterIndex = join(DIST_C_DIR, chapter.slug, 'index.html');
        expect(
          existsSync(chapterIndex),
          `expected per-chapter HTML at ${chapterIndex}`,
        ).toBe(true);
      }
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'each per-chapter HTML carries the chapter-specific og:url meta tag',
    () => {
      for (const chapter of ALL_CHAPTERS) {
        const path = join(DIST_C_DIR, chapter.slug, 'index.html');
        const html = readFileSync(path, 'utf8');
        expect(html).toContain(
          `og:url" content="${CANONICAL_ORIGIN}/c/${chapter.slug}"`,
        );
      }
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'each per-chapter HTML carries the chapter-specific og:title and og:description',
    () => {
      for (const chapter of ALL_CHAPTERS) {
        const path = join(DIST_C_DIR, chapter.slug, 'index.html');
        const html = readFileSync(path, 'utf8');
        expect(html).toContain(
          `og:title" content="${chapter.name} — Voyager"`,
        );
        expect(html).toContain(
          `og:description" content="${chapter.ogDescription}"`,
        );
      }
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'each per-chapter HTML has EXACTLY ONE og:title meta tag (no homepage stacking)',
    () => {
      // The 'pre' transformIndexHtml ordering in ogCardsPlugin is the
      // defense against double-injection: if fallbackAndProbePlugin's
      // post-order handler injects the homepage block first, then this
      // plugin's per-chapter block stacks via the </head>-fallback
      // injection path, you get two og:title blocks per chapter shell.
      // The single-block invariant is the contract.
      for (const chapter of ALL_CHAPTERS) {
        const path = join(DIST_C_DIR, chapter.slug, 'index.html');
        const html = readFileSync(path, 'utf8');
        const ogTitleCount = (html.match(/property="og:title"/g) ?? []).length;
        expect(ogTitleCount, `${chapter.slug} should have exactly 1 og:title`).toBe(1);
        const twTitleCount = (html.match(/name="twitter:title"/g) ?? []).length;
        expect(twTitleCount, `${chapter.slug} should have exactly 1 twitter:title`).toBe(1);
      }
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'each per-chapter HTML contains all 9 expected meta tags (5 og + 4 twitter)',
    () => {
      for (const chapter of ALL_CHAPTERS) {
        const path = join(DIST_C_DIR, chapter.slug, 'index.html');
        const html = readFileSync(path, 'utf8');
        const allMetaCount = (
          html.match(/<meta\s+(?:property|name)="(?:og|twitter):/g) ?? []
        ).length;
        expect(
          allMetaCount,
          `${chapter.slug} should have exactly 9 OG/Twitter meta tags`,
        ).toBe(9);
      }
    },
  );

  // Resolved by ogCardsPlugin's `generateBundle` FEATURE_PROBE
  // substitution — when the plugin clones the captured pristine root
  // HTML for each chapter shell, it now runs the same `buildProbeInline`
  // step that `fallbackAndProbePlugin` uses on the homepage, so the
  // shells inherit the IIFE boot probe (ADR-0001 chapter-URL public-API
  // contract). Direct-land at `/c/<slug>` now dynamic-imports the same
  // main bundle the homepage does.
  it.skipIf(!distHasOgArtifacts)(
    'per-chapter HTML shells carry the same IIFE boot-probe payload as the homepage (ADR-0001 direct-land contract)',
    () => {
      const rootHtml = readFileSync(DIST_INDEX, 'utf8');
      const rootProbeMatch = rootHtml.match(
        /<script(?:\s[^>]*)?>(\(function\(\)\{[\s\S]*?)<\/script>/,
      );
      expect(rootProbeMatch).not.toBeNull();
      const rootProbeBody = rootProbeMatch![1];
      for (const chapter of ALL_CHAPTERS) {
        const path = join(DIST_C_DIR, chapter.slug, 'index.html');
        const chapterHtml = readFileSync(path, 'utf8');
        expect(chapterHtml).toContain(rootProbeBody);
        // Defensive — also verify the literal placeholder is gone.
        expect(chapterHtml).not.toContain('<!-- FEATURE_PROBE -->');
      }
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'per-chapter HTML imagePath in og:image matches the manifest entry exactly',
    () => {
      const onDisk = JSON.parse(readFileSync(DIST_MANIFEST, 'utf8')) as OgManifest;
      const idx = indexManifestBySlug(onDisk);
      for (const chapter of ALL_CHAPTERS) {
        const entry = idx.get(chapter.slug);
        expect(entry).toBeDefined();
        const path = join(DIST_C_DIR, chapter.slug, 'index.html');
        const html = readFileSync(path, 'utf8');
        // Absolute URL = canonical origin + entry.imagePath
        const expectedAbsImageUrl = `${CANONICAL_ORIGIN}${entry!.imagePath}`;
        expect(html).toContain(`og:image" content="${expectedAbsImageUrl}"`);
        expect(html).toContain(`twitter:image" content="${expectedAbsImageUrl}"`);
      }
    },
  );
});

describe('Story 2.6 — homepage default OG block on dist/index.html (AC2)', () => {
  it.skipIf(!distHasOgArtifacts)(
    'root index.html has exactly one og:url meta pointing at the canonical origin /',
    () => {
      const html = readFileSync(DIST_INDEX, 'utf8');
      expect(html).toContain(`og:url" content="${CANONICAL_ORIGIN}/"`);
      const ogUrlCount = (html.match(/property="og:url"/g) ?? []).length;
      expect(ogUrlCount).toBe(1);
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'root index.html has the homepage default og:image (v2-neptune card per AC2 note)',
    () => {
      const onDisk = JSON.parse(readFileSync(DIST_MANIFEST, 'utf8')) as OgManifest;
      const idx = indexManifestBySlug(onDisk);
      const defaultEntry = idx.get('v2-neptune');
      expect(defaultEntry).toBeDefined();
      const html = readFileSync(DIST_INDEX, 'utf8');
      expect(html).toContain(
        `og:image" content="${CANONICAL_ORIGIN}${defaultEntry!.imagePath}"`,
      );
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'root index.html does NOT carry a per-chapter og:url (no chapter-block leak into homepage)',
    () => {
      const html = readFileSync(DIST_INDEX, 'utf8');
      for (const chapter of ALL_CHAPTERS) {
        expect(html).not.toContain(`og:url" content="${CANONICAL_ORIGIN}/c/${chapter.slug}"`);
      }
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'root index.html has exactly 9 OG/Twitter meta tags (homepage default block)',
    () => {
      const html = readFileSync(DIST_INDEX, 'utf8');
      const allMetaCount = (
        html.match(/<meta\s+(?:property|name)="(?:og|twitter):/g) ?? []
      ).length;
      expect(allMetaCount).toBe(9);
    },
  );

  it.skipIf(!distHasOgArtifacts)(
    'root index.html OG_META placeholder has been substituted (no leftover comment slot)',
    () => {
      const html = readFileSync(DIST_INDEX, 'utf8');
      expect(html).not.toContain('<!-- OG_META -->');
    },
  );
});
