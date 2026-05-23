import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

import { buildProbeInline } from './src/boot/feature-detect';
import {
  renderFallbackPageHTML,
  renderFallbackPageInlineCSS,
  renderFallbackPageSwapScript,
} from './src/boot/fallback-page-static';
import {
  buildOgManifest,
  indexManifestBySlug,
  ogPngFilenameFor,
  OG_PUBLIC_DIR,
  PLACEHOLDER_PNG_BYTES,
} from './src/build/og-cards';
import {
  injectOgMeta,
  renderChapterHtml,
  renderHomeOgMetaBlock,
} from './src/build/og-html-emitter';
import { ALL_CHAPTERS } from './src/chapters/registry';

// Story 1.8 — single inline plugin handles:
//   1. transformIndexHtml on index.html: substitutes <!-- FEATURE_PROBE -->
//      with the inline probe <script> whose `__MAIN_ENTRY__` resolves to
//      the actual main bundle URL (hashed in prod, /src/main.ts in dev).
//   2. transformIndexHtml on unsupported.html: substitutes the three
//      placeholders (FALLBACK_INLINE_CSS, FALLBACK_BODY,
//      FALLBACK_SWAP_SCRIPT) with the pre-rendered content from
//      <v-fallback-page>. The default reason=webgl2 variant is baked in so
//      the page works with JS disabled.
//
// Because index.html has no static <script type="module" src="/src/main.ts">,
// Rollup needs `src/main.ts` declared as a bundled entry. We add it as a
// hidden entry in rollupOptions.input below.

const FEATURE_PROBE_PLACEHOLDER = '<!-- FEATURE_PROBE -->';
const FALLBACK_BODY_PLACEHOLDER = '<!-- FALLBACK_BODY -->';
const FALLBACK_INLINE_CSS_PLACEHOLDER = '/* FALLBACK_INLINE_CSS */';
const FALLBACK_SWAP_SCRIPT_PLACEHOLDER = '/* FALLBACK_SWAP_SCRIPT */';

// Default OG image for the homepage `/`. Per AC2: "any v1-launch scene
// is acceptable as a placeholder until Epic 5 adds the PBD V1-turn-
// around hero shot". V2 Neptune is the distinctive outer-system hero;
// resolved at build time from the manifest so it stays content-hashed.
const HOMEPAGE_DEFAULT_OG_SLUG = 'v2-neptune';

interface ResolvedMainEntry {
  /** URL the inline probe should `import()`. */
  url: string;
}

const fallbackAndProbePlugin = (): Plugin => {
  let resolvedConfig: ResolvedConfig | null = null;

  return {
    name: 'voyager:fallback-and-probe',
    enforce: 'post',

    configResolved(config) {
      resolvedConfig = config;
    },

    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const isDev = resolvedConfig?.command === 'serve';
        const mainEntry = resolveMainEntry(ctx, isDev);
        const filename = ctx.filename ?? '';

        if (filename.endsWith('unsupported.html')) {
          // Bake the default webgl2 variant. The CSS-driven [data-reason]
          // selectors handle ?reason swap when JS is enabled.
          const bodyMain = renderFallbackPageHTML('webgl2');
          const inlineCss = renderFallbackPageInlineCSS();
          const swap = renderFallbackPageSwapScript();
          let out = html;
          out = out.replace(FALLBACK_BODY_PLACEHOLDER, bodyMain);
          out = out.replace(FALLBACK_INLINE_CSS_PLACEHOLDER, inlineCss);
          out = out.replace(FALLBACK_SWAP_SCRIPT_PLACEHOLDER, swap);
          return out;
        }

        // index.html (or any other entry that has the FEATURE_PROBE marker)
        if (!html.includes(FEATURE_PROBE_PLACEHOLDER)) {
          return html;
        }
        const probeBody = buildProbeInline(mainEntry.url);
        const probeTag = `<script>${probeBody}</script>`;
        let out = html.replace(FEATURE_PROBE_PLACEHOLDER, probeTag);
        // Story 2.6 AC2 — inject the homepage default OG meta tags.
        // Per-chapter HTML shells are emitted in generateBundle below
        // (different output paths require a different lifecycle hook).
        const manifest = buildOgManifest();
        const idx = indexManifestBySlug(manifest);
        const defaultEntry = idx.get(HOMEPAGE_DEFAULT_OG_SLUG);
        if (defaultEntry !== undefined) {
          out = injectOgMeta(
            out,
            renderHomeOgMetaBlock(defaultEntry.imagePath),
          );
        }
        return out;
      },
    },
  };
};

/**
 * Story 2.6 — emit `dist/og/<slug>.<hash>.png`, `dist/og/og-manifest.json`,
 * and `dist/c/<slug>/index.html` per chapter during the bundle write
 * phase. Per ADR-0018 the OG card pipeline is build-time; this plugin is
 * the build-time emission point.
 *
 * R4 mitigation: the plugin imports `buildOgManifest` (which defaults to
 * ALL_CHAPTERS) — no parallel chapter list is authored here. The defense
 * test in `src/build/og-cards.test.ts` enforces parity at unit-test time.
 *
 * Real Playwright headless-Chromium PNG capture is forward-deferred to
 * Story 4.9 / 7.x (per story 2.6 Dev Agent Record). Until then a 1×1
 * transparent PNG placeholder is written per chapter so the static
 * asset path resolves to HTTP 200 (AC4 fetch leg).
 *
 * ## Plugin-ordering note — FEATURE_PROBE substitution (ADR-0001)
 *
 * The captured `rootHtml` is taken with `transformIndexHtml.order: 'pre'`
 * so the OG_META slot is still intact for clean per-chapter meta-block
 * substitution (see `og-cards-plugin-ordering.test.ts`). The pre-order
 * capture also runs BEFORE `fallbackAndProbePlugin` substitutes the
 * `<!-- FEATURE_PROBE -->` comment with the inline boot probe `<script>`,
 * so the captured snapshot still carries the literal placeholder. If we
 * cloned that snapshot verbatim into `dist/c/<slug>/index.html`, a user
 * landing directly at `/c/<slug>` would get a static HTML page with no
 * SPA boot — breaking ADR-0001's chapter-URL-as-public-API contract.
 *
 * Fix: when cloning the captured HTML per chapter, this plugin substitutes
 * the FEATURE_PROBE placeholder using the same `buildProbeInline` source
 * that `fallbackAndProbePlugin` calls. The main-entry URL is resolved
 * from the Rollup bundle (the hashed `/assets/main-XXXX.js` path) so the
 * chapter shells boot the same bundle as the homepage. Both plugins thus
 * agree on the probe payload and the OG block, and direct-land works.
 *
 * NFR-M4 budget: the placeholder path adds 11 PNG emissions + 11 HTML
 * emissions ≈ <100 ms. Headroom against the 5-minute CI budget.
 */
const ogCardsPlugin = (): Plugin => {
  let rootHtml: string | null = null;
  return {
    name: 'voyager:og-cards',
    apply: 'build',

    transformIndexHtml: {
      // 'pre' so we capture the root HTML BEFORE the fallback-and-probe
      // plugin substitutes the homepage default OG block into the
      // OG_META slot. Per-chapter HTML shells need the placeholder
      // intact so renderChapterHtml can swap in the chapter-specific
      // meta block via the placeholder substitution path (otherwise
      // injectOgMeta falls back to inserting before </head>, which
      // produces duplicate OG blocks — the homepage default still in
      // place and a chapter block stacked after it).
      //
      // The pre-order capture also predates FEATURE_PROBE substitution,
      // so the captured snapshot still carries the literal
      // `<!-- FEATURE_PROBE -->` comment. `generateBundle` below
      // substitutes it explicitly when cloning per-chapter HTML so the
      // SPA boots on direct-land (ADR-0001 chapter-URL public-API
      // contract).
      order: 'pre',
      handler(html, ctx) {
        const filename = ctx.filename ?? '';
        if (filename.endsWith('index.html') && !filename.endsWith('unsupported.html')) {
          rootHtml = html;
        }
        return html;
      },
    },

    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const manifest = buildOgManifest();
        const idx = indexManifestBySlug(manifest);

        // 1) Emit one placeholder PNG per chapter under dist/og/.
        for (const chapter of ALL_CHAPTERS) {
          const filename = ogPngFilenameFor(chapter);
          this.emitFile({
            type: 'asset',
            fileName: `${OG_PUBLIC_DIR}/${filename}`,
            source: PLACEHOLDER_PNG_BYTES,
          });
        }

        // 2) Emit og-manifest.json so downstream consumers (CDN audit,
        // Story 7.x Playwright capture) can read the canonical slug→
        // filename map without recomputing the hash.
        this.emitFile({
          type: 'asset',
          fileName: `${OG_PUBLIC_DIR}/og-manifest.json`,
          source: JSON.stringify(manifest, null, 2),
        });

        // 3) Emit per-chapter HTML shells at dist/c/<slug>/index.html.
        // Skipped if the root index.html wasn't captured (e.g., test
        // builds that don't include the index entry); the plugin then
        // becomes a no-op for HTML emission while still writing PNGs +
        // manifest, so the parity gate is preserved.
        if (rootHtml !== null) {
          // Resolve the main-entry hashed URL from the bundle so the
          // per-chapter probe imports the same JS the homepage does.
          // This is the same lookup `resolveMainEntry` performs from
          // the transformIndexHtml hook, scoped to generateBundle's
          // bundle shape.
          const mainEntryUrl = resolveMainEntryFromBundle(bundle);
          const probeTag = `<script>${buildProbeInline(mainEntryUrl)}</script>`;
          const probedRootHtml = rootHtml.replace(
            FEATURE_PROBE_PLACEHOLDER,
            probeTag,
          );
          for (const chapter of ALL_CHAPTERS) {
            const entry = idx.get(chapter.slug);
            if (entry === undefined) continue;
            const html = renderChapterHtml(probedRootHtml, chapter, entry);
            this.emitFile({
              type: 'asset',
              fileName: `c/${chapter.slug}/index.html`,
              source: html,
            });
          }
        }
      },
    },
  };
};

/**
 * Locate the hashed `/assets/main-XXXX.js` URL for the `main` entry
 * chunk in the Rollup bundle. Mirrors `resolveMainEntry`'s lookup but
 * accepts the bundle map directly (as supplied to `generateBundle`).
 * Falls back to `/src/main.ts` if the entry is missing — the same
 * conservative default the transformIndexHtml path uses.
 */
const resolveMainEntryFromBundle = (
  bundle: Record<string, unknown>,
): string => {
  for (const [fileName, chunk] of Object.entries(bundle)) {
    const c = chunk as { isEntry?: boolean; name?: string };
    if (c.isEntry && c.name === 'main') {
      return `/${fileName}`;
    }
  }
  return '/src/main.ts';
};

/**
 * Resolve the main-entry URL. In dev mode it's the source path Vite serves
 * directly (`/src/main.ts`). In prod, locate the emitted chunk for main.ts
 * via the bundle map; fall back to `/src/main.ts` (rare; shouldn't happen
 * once the entry is declared in rollupOptions.input.main).
 */
const resolveMainEntry = (
  ctx: { bundle?: Record<string, unknown> | undefined },
  isDev: boolean,
): ResolvedMainEntry => {
  if (isDev) return { url: '/src/main.ts' };
  const bundle = ctx.bundle;
  if (bundle) {
    // Find the entry chunk for main. Rollup names entry chunks by their
    // `name` from rollupOptions.input — we declared `main` below.
    for (const [fileName, chunk] of Object.entries(bundle)) {
      const c = chunk as { isEntry?: boolean; name?: string };
      if (c.isEntry && c.name === 'main') {
        return { url: `/${fileName}` };
      }
    }
  }
  return { url: '/src/main.ts' };
};

export default defineConfig({
  plugins: [fallbackAndProbePlugin(), ogCardsPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/main.ts'),
        index: resolve(__dirname, 'index.html'),
        unsupported: resolve(__dirname, 'unsupported.html'),
      },
    },
  },
  // Story 4.9 — exclude the Playwright L4 visual-regression suite from
  // Vitest's default glob. Both suites live under `web/tests/` and both
  // use the `.spec.ts` extension that Vitest picks up by default; this
  // exclude keeps `npm test` (vitest run) bound to the L3 tier and
  // routes the L4 suite exclusively through `npm run test:visual`.
  //
  // The Playwright config has its own `testMatch` so it ignores the
  // L3 vitest specs — the two suites are cleanly partitioned.
  // @ts-expect-error — `test` is the Vitest config slot (vitest extends
  // Vite's `defineConfig` via module augmentation; the augmented type
  // isn't visible here without a `/// <reference types="vitest" />`).
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/visual/**',
    ],
  },
});

// Helper for unit tests that want to introspect the pre-rendered HTML
// without standing up a full Vite build. Exported so test files can call
// it directly; the plugin lifecycle is unchanged.
export const renderUnsupportedHTMLForTest = (templatePath: string): string => {
  const html = readFileSync(templatePath, 'utf8');
  const bodyMain = renderFallbackPageHTML('webgl2');
  const inlineCss = renderFallbackPageInlineCSS();
  const swap = renderFallbackPageSwapScript();
  return html
    .replace(FALLBACK_BODY_PLACEHOLDER, bodyMain)
    .replace(FALLBACK_INLINE_CSS_PLACEHOLDER, inlineCss)
    .replace(FALLBACK_SWAP_SCRIPT_PLACEHOLDER, swap);
};
