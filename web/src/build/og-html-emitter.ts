/**
 * Per-chapter HTML shell emission for OG cards (Story 2.6 AC2).
 *
 * Crawlers (`facebookexternalhit/1.1`, `Twitterbot`, `Slackbot`, etc.)
 * fetch the `og:image` URL via HTTP and never execute JavaScript. The
 * Voyager SPA's root `index.html` only contains the homepage meta tags;
 * to serve per-chapter OG cards we need a static HTML shell at the
 * chapter's canonical URL, e.g. `dist/c/v2-neptune/index.html`.
 *
 * This module is the pure builder — it takes the upstream `index.html`
 * shell + a chapter spec + a manifest entry and returns the per-chapter
 * HTML string with templated meta tags injected. The Vite plugin in
 * `vite.config.ts` calls this once per chapter during `generateBundle`.
 *
 * ## Why a separate module
 *
 * Keeping the templating logic in `web/src/build/` (under tsconfig
 * `include: ["src"]`) lets vitest exercise it via unit tests without
 * standing up a full Vite build. The Vite plugin layer is thin glue.
 *
 * ## Twitter card variant
 *
 * Twitter requires its own `twitter:*` tags even when OG tags are
 * present. We emit both. The card type is `summary_large_image` so the
 * 1200×630 PNG renders edge-to-edge in the tweet preview.
 *
 * ## Canonical URL base
 *
 * The production site lives at `https://voyager.app/`. The base is
 * captured in `CANONICAL_ORIGIN` here; downstream CDN deploy stories
 * (Story 7.x) may rewrite it via env injection. For test determinism
 * the test suite passes the origin explicitly.
 */

import type { ChapterSpec } from '../types/chapter';
import type { OgManifestEntry } from './og-cards';

/** Production canonical origin. */
export const CANONICAL_ORIGIN = 'https://voyager.app';

/**
 * The token in the root index.html that the homepage OG block replaces.
 * The Vite plugin substitutes per-chapter HTML files based on the same
 * template by swapping this slot.
 *
 * If no slot is present in the input HTML, the meta tags are inserted
 * immediately before `</head>` instead.
 */
export const OG_META_PLACEHOLDER = '<!-- OG_META -->';

/**
 * HTML attribute-safe escape. The set is intentionally narrow:
 *   - `&` (so `&amp;` decodes back correctly downstream)
 *   - `<` `>` (defense against tag injection if a chapter description ever
 *     contained one)
 *   - `"` (the attribute delimiter we use)
 * Single quotes are left alone — we always use double-quote attributes.
 */
const escapeAttr = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Options for `renderOgMetaBlock`. */
export interface RenderOgMetaOptions {
  /** Canonical origin (no trailing slash). Defaults to CANONICAL_ORIGIN. */
  readonly origin?: string;
}

/**
 * Render the OG + Twitter Card meta-tag block for a single chapter. The
 * returned string is a sequence of `<meta>` tags, one per line, no
 * leading or trailing whitespace.
 */
export const renderOgMetaBlock = (
  chapter: ChapterSpec,
  entry: OgManifestEntry,
  opts: RenderOgMetaOptions = {},
): string => {
  const origin = opts.origin ?? CANONICAL_ORIGIN;
  const imageUrl = `${origin}${entry.imagePath}`;
  const canonicalUrl = `${origin}/c/${chapter.slug}`;
  const title = entry.title;
  const description = entry.description;
  const lines = [
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:image" content="${escapeAttr(imageUrl)}" />`,
    `<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(imageUrl)}" />`,
  ];
  return lines.join('\n    ');
};

/** Options for the homepage default OG block. */
export interface RenderHomeOgOptions {
  /** Canonical origin (no trailing slash). Defaults to CANONICAL_ORIGIN. */
  readonly origin?: string;
  /**
   * Site-absolute path to the default OG image. Defaults to the V2
   * Neptune card as the v1-launch placeholder until Story 5.x lands the
   * PBD hero shot (per AC2 note).
   */
  readonly defaultImagePath?: string;
}

/**
 * Default OG meta tag block for the homepage (`/`). Used by the Vite
 * plugin when it processes the root `index.html`.
 *
 * Per AC2: "any v1-launch scene is acceptable as a placeholder until
 * Epic 5 adds the PBD V1-turn-around hero shot; document the choice in
 * the script's comments." We use V2 Neptune's card as the placeholder
 * because it's the visually distinctive "outer system" hero of the
 * pre-PBD chapter set.
 */
export const renderHomeOgMetaBlock = (
  defaultImagePath: string,
  opts: RenderHomeOgOptions = {},
): string => {
  const origin = opts.origin ?? CANONICAL_ORIGIN;
  const imageUrl = `${origin}${defaultImagePath}`;
  const canonicalUrl = `${origin}/`;
  const title = 'Voyager';
  const description =
    'The Voyager Grand Tour visualisation — track Voyager 1 and Voyager 2 across the outer planets and into interstellar space.';
  const lines = [
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:image" content="${escapeAttr(imageUrl)}" />`,
    `<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(imageUrl)}" />`,
  ];
  return lines.join('\n    ');
};

/**
 * Inject a meta-tag block into an HTML document. If `OG_META_PLACEHOLDER`
 * is present, the block replaces it. Otherwise the block is inserted
 * before the first `</head>` (case-insensitive).
 *
 * If neither marker is found (malformed input), returns the input
 * unchanged — a defense against breaking the build on an HTML shape we
 * don't expect; the Vite plugin logs a warning at this point.
 */
export const injectOgMeta = (html: string, block: string): string => {
  if (html.includes(OG_META_PLACEHOLDER)) {
    return html.replace(OG_META_PLACEHOLDER, block);
  }
  const headCloseIdx = html.toLowerCase().indexOf('</head>');
  if (headCloseIdx < 0) return html;
  return `${html.slice(0, headCloseIdx)}    ${block}\n  ${html.slice(headCloseIdx)}`;
};

/**
 * Render a full per-chapter HTML shell. Given the upstream root
 * `index.html` (with all assets already resolved by Vite's post-bundle
 * pipeline) and a chapter+entry pair, produce the per-chapter HTML
 * string that gets written to `dist/c/<slug>/index.html`.
 *
 * The per-chapter shell is byte-identical to the homepage HTML except
 * for the OG meta-tag block — same JS entry, same CSS, same probe. The
 * client-side router (Story 2.4 URLRouter) reads the `/c/<slug>` path
 * on boot and routes to the chapter. Crawlers, by contrast, only ever
 * parse the static meta tags — the per-chapter HTML serves both
 * audiences.
 *
 * NOTE on bundler asset paths: Vite serves assets via absolute paths
 * (e.g., `/assets/main-abc123.js`), which work from any path depth
 * including `/c/<slug>/`. No path rewriting is needed.
 */
export const renderChapterHtml = (
  rootHtml: string,
  chapter: ChapterSpec,
  entry: OgManifestEntry,
  opts: RenderOgMetaOptions = {},
): string => {
  const block = renderOgMetaBlock(chapter, entry, opts);
  return injectOgMeta(rootHtml, block);
};
