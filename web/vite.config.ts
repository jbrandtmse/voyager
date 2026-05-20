import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

import { buildProbeInline } from './src/boot/feature-detect';
import {
  renderFallbackPageHTML,
  renderFallbackPageInlineCSS,
  renderFallbackPageSwapScript,
} from './src/boot/fallback-page-static';

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
        return html.replace(FEATURE_PROBE_PLACEHOLDER, probeTag);
      },
    },
  };
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
  plugins: [fallbackAndProbePlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/main.ts'),
        index: resolve(__dirname, 'index.html'),
        unsupported: resolve(__dirname, 'unsupported.html'),
      },
    },
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
