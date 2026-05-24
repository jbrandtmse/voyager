// Defense for BUG-E5-007: production-built HTML must link the main CSS
// asset. Without this link, ~30 design tokens are unset and the HUD
// layout collapses to overlapping rectangles at (0, 0) per corner.
//
// The root cause is in `vite.config.ts`: Story 1.8's capability probe
// replaces the static `<script type="module" src>` tag with an inline
// dynamic-import script. Vite's auto-CSS-injection only fires for
// static script tags; without the explicit injection in
// `fallbackAndProbePlugin.transformIndexHtml` + `ogCardsPlugin.generate
// Bundle`, the CSS file is built but never loaded.
//
// This test is gated on `web/dist/` existence — runs only after
// `npm run build` has emitted the production artifacts. Default
// `npm run test:run` skips it (the parent describe.skipIf pattern
// matches Story 3.7 L2 fixture + Story 5.0 prod regression).

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = join(__dirname, '..', 'dist');
const distExists = existsSync(join(DIST_DIR, 'index.html'));

describe.skipIf(!distExists)('BUG-E5-007 defense — production HTML links main CSS', () => {
  it('root dist/index.html contains <link rel="stylesheet"> to assets/main-*.css', () => {
    const html = readFileSync(join(DIST_DIR, 'index.html'), 'utf-8');
    const cssLinkRegex = /<link\s+rel="stylesheet"\s+(?:crossorigin\s+)?href="\/assets\/main-[^"]+\.css"/;
    expect(html).toMatch(cssLinkRegex);
  });

  it('the CSS file referenced by the link tag exists in dist/assets/', () => {
    const html = readFileSync(join(DIST_DIR, 'index.html'), 'utf-8');
    const match = html.match(/href="(\/assets\/main-[^"]+\.css)"/);
    expect(match).not.toBeNull();
    const cssPath = match![1].slice(1);
    expect(existsSync(join(DIST_DIR, cssPath))).toBe(true);
  });

  it('every per-chapter shell at dist/c/<slug>/index.html links the same CSS', () => {
    const chaptersDir = join(DIST_DIR, 'c');
    if (!existsSync(chaptersDir)) return;
    const cssLinkRegex = /<link\s+rel="stylesheet"\s+(?:crossorigin\s+)?href="\/assets\/main-[^"]+\.css"/;
    const slugs = readdirSync(chaptersDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const shellPath = join(chaptersDir, slug, 'index.html');
      if (!existsSync(shellPath)) continue;
      const html = readFileSync(shellPath, 'utf-8');
      expect(html, `Chapter shell /c/${slug}/index.html missing main CSS link`).toMatch(cssLinkRegex);
    }
  });

  it('the CSS file contains the canonical --v-edge-margin token (sanity check)', () => {
    const html = readFileSync(join(DIST_DIR, 'index.html'), 'utf-8');
    const match = html.match(/href="(\/assets\/main-[^"]+\.css)"/);
    const cssPath = match![1].slice(1);
    const css = readFileSync(join(DIST_DIR, cssPath), 'utf-8');
    expect(css).toContain('--v-edge-margin');
  });
});
