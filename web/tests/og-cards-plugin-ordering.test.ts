/**
 * Story 2.6 QA — Vite plugin lifecycle ordering invariant.
 *
 * The `ogCardsPlugin` in vite.config.ts declares
 * `transformIndexHtml: { order: 'pre' }` so it captures the ROOT
 * `index.html` BEFORE `fallbackAndProbePlugin`'s post-order handler
 * substitutes the homepage default OG meta block into the `<!-- OG_META -->`
 * placeholder. The captured pristine HTML (with the placeholder still in
 * place) is then fed into `renderChapterHtml` once per chapter during
 * `generateBundle`, so each per-chapter shell gets the chapter-specific OG
 * block via PLACEHOLDER substitution — the cleanest path.
 *
 * If a future contributor drops the `order: 'pre'` annotation, the captured
 * `rootHtml` would already have the homepage OG block injected into it.
 * `renderChapterHtml` would then NOT find the OG_META placeholder and
 * would fall back to the `</head>` injection path — RESULTING IN TWO OG
 * BLOCKS PER CHAPTER SHELL (homepage block + chapter block stacked).
 *
 * The build-output integration test (`og-cards-build-integration.test.ts`)
 * asserts the single-block invariant against the real `dist/` tree, but
 * gates on `dist/og/og-manifest.json` existing — without a prior build,
 * it skips silently. This file pins the same invariant at the pure
 * function level so a unit-only `vitest run` (no build) still catches
 * the regression.
 *
 * Voyager skill rules:
 *   - Rule 2 (Integration ACs): pinning the plugin's lifecycle contract.
 */

import { describe, it, expect } from 'vitest';
import {
  injectOgMeta,
  renderChapterHtml,
  renderHomeOgMetaBlock,
  OG_META_PLACEHOLDER,
  CANONICAL_ORIGIN,
} from '../src/build/og-html-emitter';
import { buildOgManifest, indexManifestBySlug } from '../src/build/og-cards';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';

const pristineRootHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Voyager</title>
    ${OG_META_PLACEHOLDER}
  </head>
  <body><div id="app"></div></body>
</html>`;

const manifest = buildOgManifest();
const manifestIdx = indexManifestBySlug(manifest);

describe("Story 2.6 — ogCardsPlugin transformIndexHtml ordering invariant", () => {
  it('pristine root HTML (pre-order capture) produces a chapter shell with EXACTLY ONE og:title', () => {
    // This is the GOOD path — the plugin captures the root HTML BEFORE
    // the homepage block is injected (per `order: 'pre'`).
    const v2Neptune = findChapterBySlug('v2-neptune')!;
    const entry = manifestIdx.get('v2-neptune')!;
    const chapterHtml = renderChapterHtml(pristineRootHtml, v2Neptune, entry);
    const ogTitleCount = (chapterHtml.match(/property="og:title"/g) ?? []).length;
    expect(ogTitleCount).toBe(1);
    expect(chapterHtml).toContain(`og:url" content="${CANONICAL_ORIGIN}/c/v2-neptune"`);
    expect(chapterHtml).not.toContain(OG_META_PLACEHOLDER);
  });

  it('REGRESSION: if root HTML already has homepage OG block (no `pre` capture), per-chapter shell would double-inject', () => {
    // This test demonstrates WHY `order: 'pre'` is load-bearing. We
    // simulate the broken state — root HTML with the homepage block
    // already injected — and confirm renderChapterHtml would produce
    // TWO og:title tags (one from the homepage block, one stacked via
    // the </head>-fallback path). If this regression test starts
    // PASSING with exactly 1 og:title, somebody changed the contract
    // and the build integration test should be updated to match.
    const v2Neptune = findChapterBySlug('v2-neptune')!;
    const entry = manifestIdx.get('v2-neptune')!;
    const homepageInjected = injectOgMeta(
      pristineRootHtml,
      renderHomeOgMetaBlock('/og/v2-neptune.deadbeef.png'),
    );
    // The OG_META placeholder is gone now (the homepage injection
    // consumed it). renderChapterHtml will fall back to inserting
    // the chapter block before </head>, stacking on top of the
    // homepage block.
    expect(homepageInjected).not.toContain(OG_META_PLACEHOLDER);
    const chapterHtml = renderChapterHtml(homepageInjected, v2Neptune, entry);
    const ogTitleCount = (chapterHtml.match(/property="og:title"/g) ?? []).length;
    // Two blocks stacked.
    expect(ogTitleCount).toBe(2);
  });

  it('all 11 chapters produce single-block shells when fed the pristine HTML', () => {
    for (const chapter of ALL_CHAPTERS) {
      const entry = manifestIdx.get(chapter.slug)!;
      const chapterHtml = renderChapterHtml(pristineRootHtml, chapter, entry);
      const ogTitleCount = (chapterHtml.match(/property="og:title"/g) ?? []).length;
      expect(ogTitleCount, `${chapter.slug} should have exactly 1 og:title`).toBe(1);
      const ogUrlCount = (chapterHtml.match(/property="og:url"/g) ?? []).length;
      expect(ogUrlCount, `${chapter.slug} should have exactly 1 og:url`).toBe(1);
      expect(chapterHtml).toContain(
        `og:url" content="${CANONICAL_ORIGIN}/c/${chapter.slug}"`,
      );
    }
  });
});

describe("Story 2.6 — homepage default block on pristine HTML (fallbackAndProbePlugin path)", () => {
  it('injecting the homepage block via OG_META placeholder produces a single-block homepage', () => {
    const home = injectOgMeta(
      pristineRootHtml,
      renderHomeOgMetaBlock('/og/v2-neptune.deadbeef.png'),
    );
    const ogTitleCount = (home.match(/property="og:title"/g) ?? []).length;
    expect(ogTitleCount).toBe(1);
    expect(home).toContain(`og:url" content="${CANONICAL_ORIGIN}/"`);
    expect(home).not.toContain(OG_META_PLACEHOLDER);
  });

  it('homepage block uses the v2-neptune card as the placeholder image (per AC2 note)', () => {
    const v2NeptuneEntry = manifestIdx.get('v2-neptune')!;
    const home = injectOgMeta(
      pristineRootHtml,
      renderHomeOgMetaBlock(v2NeptuneEntry.imagePath),
    );
    expect(home).toContain(
      `og:image" content="${CANONICAL_ORIGIN}${v2NeptuneEntry.imagePath}"`,
    );
  });
});
