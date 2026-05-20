/**
 * Story 2.6 AC1 — post-build OG card generator (standalone runner).
 *
 * Usage:
 *
 *   cd web
 *   npm run build              # produces dist/ via Vite (this script is
 *                              # ALSO run automatically inside the build
 *                              # by `ogCardsPlugin` in vite.config.ts).
 *   npx tsx scripts/og-cards.ts  # OR: re-run the OG side standalone
 *                                # against an existing dist/ tree.
 *
 * ## Architecture
 *
 * Per ADR-0018 the OG card pipeline is build-time. There are two
 * execution paths that produce the same dist/og/ artifacts:
 *
 *   1. **Vite plugin path (default).** `ogCardsPlugin` in vite.config.ts
 *      runs inside `vite build` and emits PNGs + manifest + per-chapter
 *      HTML shells. This is what CI exercises.
 *
 *   2. **Standalone runner path (this file).** Independently produces
 *      the same artifacts against an already-built `dist/`. Useful for:
 *      (a) re-running after a chapter spec edit without a full rebuild,
 *      (b) AC3's CI assertion: post-build, this script verifies the OG
 *      artifacts are present and the manifest matches ALL_CHAPTERS.
 *
 * ## Playwright deferral
 *
 * Real headless-Chromium PNG capture is forward-deferred to Story 4.9
 * (L4 visual regression) / Story 7.x. This runner writes a 1×1
 * transparent PNG placeholder per chapter so the static asset path
 * resolves to HTTP 200. The follow-up story replaces the placeholder
 * with real screenshots — the manifest contract is unchanged.
 *
 * ## R4 mitigation (Epic 2)
 *
 * `ALL_CHAPTERS` is imported from `web/src/chapters/registry.ts` — the
 * same module the runtime FSM (ChapterDirector) consumes. No parallel
 * chapter list is authored here.
 *
 * ## NFR-M4 budget
 *
 * Placeholder path: <100 ms for 11 chapters. With Playwright PNG
 * capture (when it lands in Story 4.9 / 7.x): browser launch 10-15 s +
 * 11 × ~2 s screenshots ≈ 30-40 s total. Within the 5-min CI budget.
 *
 * @see _bmad-output/implementation-artifacts/2-6-pre-rendered-open-graph-cards-per-chapter.md
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildOgManifest,
  indexManifestBySlug,
  ogPngFilenameFor,
  OG_PUBLIC_DIR,
  PLACEHOLDER_PNG_BYTES,
} from '../src/build/og-cards';
import { ALL_CHAPTERS } from '../src/chapters/registry';
import {
  renderChapterHtml,
  renderHomeOgMetaBlock,
  injectOgMeta,
} from '../src/build/og-html-emitter';

const HOMEPAGE_DEFAULT_OG_SLUG = 'v2-neptune';

// Resolve `web/` root from this script's location.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(SCRIPT_DIR, '..');
const DIST_DIR = resolve(WEB_ROOT, 'dist');

/** Process exit codes — distinct for shell-side gating. */
const EXIT = {
  OK: 0,
  MANIFEST_MISMATCH: 2,
  MISSING_DIST: 3,
} as const;

interface RunOptions {
  /** When true, also verify the previously-generated artifacts (AC3). */
  verify?: boolean;
}

const ensureDir = (path: string): void => {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
};

/**
 * Emit `dist/og/<slug>.<hash>.png` + `dist/og/og-manifest.json` +
 * `dist/c/<slug>/index.html`. Returns the emitted manifest.
 */
export const emitOgArtifacts = (
  distDir: string,
): ReturnType<typeof buildOgManifest> => {
  const manifest = buildOgManifest();
  const idx = indexManifestBySlug(manifest);

  const ogDir = join(distDir, OG_PUBLIC_DIR);
  ensureDir(ogDir);

  // 1) Placeholder PNGs (one per chapter).
  for (const chapter of ALL_CHAPTERS) {
    const filename = ogPngFilenameFor(chapter);
    writeFileSync(join(ogDir, filename), PLACEHOLDER_PNG_BYTES);
  }

  // 2) Manifest JSON.
  writeFileSync(
    join(ogDir, 'og-manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  // 3) Per-chapter HTML shells (only if the root index.html was built).
  const rootIndexPath = join(distDir, 'index.html');
  if (existsSync(rootIndexPath)) {
    const rootHtml = readFileSync(rootIndexPath, 'utf8');
    for (const chapter of ALL_CHAPTERS) {
      const entry = idx.get(chapter.slug);
      if (entry === undefined) continue;
      const chapterDir = join(distDir, 'c', chapter.slug);
      ensureDir(chapterDir);
      writeFileSync(
        join(chapterDir, 'index.html'),
        renderChapterHtml(rootHtml, chapter, entry),
      );
    }
    // Also re-inject the homepage default OG block IF the root
    // index.html still carries the OG_META placeholder. The Vite
    // plugin normally replaces it pre-bundle; this runner is the
    // fallback path for ad-hoc local regeneration.
    const defaultEntry = idx.get(HOMEPAGE_DEFAULT_OG_SLUG);
    if (defaultEntry !== undefined && rootHtml.includes('<!-- OG_META -->')) {
      const updated = injectOgMeta(
        rootHtml,
        renderHomeOgMetaBlock(defaultEntry.imagePath),
      );
      writeFileSync(rootIndexPath, updated);
    }
  }

  return manifest;
};

/**
 * AC3 verification — fails loudly if any chapter PNG is missing or if
 * the manifest disagrees with ALL_CHAPTERS. Returns true on success.
 */
export const verifyOgArtifacts = (distDir: string): boolean => {
  const ogDir = join(distDir, OG_PUBLIC_DIR);
  const manifestPath = join(ogDir, 'og-manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`[og-cards] FAIL: manifest missing at ${manifestPath}`);
    return false;
  }
  const onDisk: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const expected = buildOgManifest();
  const onDiskEntries =
    typeof onDisk === 'object' && onDisk !== null && 'entries' in onDisk
      ? (onDisk as { entries: ReadonlyArray<{ slug: string }> }).entries
      : [];
  if (onDiskEntries.length !== expected.entries.length) {
    console.error(
      `[og-cards] FAIL: manifest count ${onDiskEntries.length} ` +
        `!= ALL_CHAPTERS ${expected.entries.length}`,
    );
    return false;
  }
  const onDiskSlugs = new Set(onDiskEntries.map((e) => e.slug));
  const expectedSlugs = new Set(expected.entries.map((e) => e.slug));
  for (const slug of expectedSlugs) {
    if (!onDiskSlugs.has(slug)) {
      console.error(`[og-cards] FAIL: chapter ${slug} missing from manifest`);
      return false;
    }
  }
  for (const slug of onDiskSlugs) {
    if (!expectedSlugs.has(slug)) {
      console.error(
        `[og-cards] FAIL: manifest contains unknown chapter ${slug}`,
      );
      return false;
    }
  }
  // PNG existence check.
  for (const entry of expected.entries) {
    const pngPath = join(distDir, entry.imagePath);
    if (!existsSync(pngPath)) {
      console.error(`[og-cards] FAIL: PNG missing for ${entry.slug} at ${pngPath}`);
      return false;
    }
  }
  console.log(`[og-cards] OK: ${expected.entries.length} chapter PNGs verified`);
  return true;
};

const main = (opts: RunOptions = {}): number => {
  if (!existsSync(DIST_DIR)) {
    console.error(
      `[og-cards] FAIL: dist/ not found at ${DIST_DIR} — run \`npm run build\` first`,
    );
    return EXIT.MISSING_DIST;
  }
  const manifest = emitOgArtifacts(DIST_DIR);
  console.log(
    `[og-cards] emitted ${manifest.entries.length} placeholder PNGs + ` +
      `og-manifest.json + per-chapter HTML shells to ${DIST_DIR}`,
  );
  if (opts.verify ?? true) {
    if (!verifyOgArtifacts(DIST_DIR)) return EXIT.MANIFEST_MISMATCH;
  }
  return EXIT.OK;
};

// Run when invoked directly (not when imported by tests).
const isDirectInvocation = (): boolean => {
  if (typeof process === 'undefined' || process.argv[1] === undefined) {
    return false;
  }
  const scriptPath = resolve(process.argv[1]);
  const thisFilePath = fileURLToPath(import.meta.url);
  return scriptPath === thisFilePath;
};

if (isDirectInvocation()) {
  const code = main({ verify: !process.argv.includes('--no-verify') });
  process.exit(code);
}
