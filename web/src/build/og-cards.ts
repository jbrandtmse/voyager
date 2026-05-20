/**
 * Pre-rendered OG card generator — core logic (Story 2.6 AC1 + AC3 / R4).
 *
 * Importable from both the Node-side build runner (`web/scripts/og-cards.ts`)
 * and vitest, so the parity contract — manifest entries === ALL_CHAPTERS
 * by slug set — is enforceable without standing up Playwright.
 *
 * ## R4 mitigation (Epic 2)
 *
 * The single source of truth for the chapter list is
 * `web/src/chapters/registry.ts::ALL_CHAPTERS`. This module imports it
 * directly. There is NO parallel chapter list authored here. The defense
 * test in `web/src/build/og-cards.test.ts` enforces parity by importing
 * both sides and asserting slug-set equality.
 *
 * ## Filename hashing
 *
 * Content hash is computed deterministically from `(slug, anchorEt,
 * windowStartEt, windowEndEt)` — the four fields that pin the chapter's
 * canonical "you are here" instant. A real PNG capture (Story 4.9 / 7.x)
 * SHOULD re-hash from the PNG bytes; the deterministic-from-spec hash
 * used here is a stable placeholder so the manifest produced now stays
 * stable across builds until the Playwright capture lands.
 *
 * ## Playwright deferral (per story file decision)
 *
 * This story ships:
 *   1. The manifest builder + parity test (R4 — the critical mitigation).
 *   2. Per-chapter meta tag emission via a Vite plugin (`og-html-emitter`).
 *   3. The `og-manifest.json` shape contract.
 *
 * Real Playwright headless-Chromium PNG capture is forward-deferred to
 * Story 4.9 (L4 visual-regression) / Story 7.x. Until then, the build
 * runner writes a 1×1 transparent PNG placeholder per chapter so the
 * static asset path resolves to HTTP 200 in any deploy smoke (AC4 PNG-
 * fetch leg). The placeholder is replaced by the real screenshot in
 * the follow-up story without changing this manifest contract.
 *
 * See `_bmad-output/implementation-artifacts/2-6-pre-rendered-open-graph-cards-per-chapter.md`
 * § Dev Agent Record for the original-vs-amended decision.
 */

import type { ChapterSpec } from '../types/chapter';
import { ALL_CHAPTERS } from '../chapters/registry';
import { isoFromEt } from '../math/et-conversions';

/** One entry in `og-manifest.json` — slug-keyed lookup for HTML emission. */
export interface OgManifestEntry {
  /** Chapter slug (matches `ChapterSpec.slug`). */
  readonly slug: string;
  /** Editorial title used for `og:title`. */
  readonly title: string;
  /** One-sentence summary for `og:description`. */
  readonly description: string;
  /** Site-absolute path to the hashed PNG, e.g. `/og/v2-neptune.<hash>.png`. */
  readonly imagePath: string;
  /** ISO-8601 UTC form of the chapter's anchorEt — used in the `?t=` deep link. */
  readonly anchorIso: string;
}

/** Top-level shape written to `web/dist/og/og-manifest.json`. */
export interface OgManifest {
  /** Generator schema version — bump on breaking shape changes. */
  readonly version: 1;
  /** Manifest entries, one per chapter, sorted by chapter `anchorEt`. */
  readonly entries: readonly OgManifestEntry[];
}

/** Public OG image directory mounted at the site root. */
export const OG_PUBLIC_DIR = 'og';

/**
 * Build the OG title from a chapter's editorial name.
 *
 * Twitter caps `twitter:title` at ~70 chars before truncation; the Voyager
 * suffix is 11 chars including the em-dash separator, leaving 59 for the
 * chapter name itself. None of the 11 chapter names exceed 32 chars.
 */
export const ogTitleFor = (chapter: ChapterSpec): string =>
  `${chapter.name} — Voyager`;

/**
 * Build the canonical deep-link path the OG card image should advertise.
 * Used by both the HTML meta tag emitter and tests that assert URL contract
 * stability (ADR-0001).
 */
export const ogDeepLinkPathFor = (chapter: ChapterSpec): string =>
  `/c/${chapter.slug}?t=${isoFromEt(chapter.anchorEt)}`;

/**
 * Deterministic content hash for the OG PNG filename. Computed from the
 * fields that pin the chapter's canonical frame — slug + the three ET
 * fields — using FNV-1a 32-bit (no Node `crypto` dep so this is portable
 * across the browser-side test runner too).
 *
 * Returns an 8-char lowercase hex string. Long enough for ~4 B distinct
 * inputs — comfortable for 11 chapters with room to grow.
 */
export const ogContentHash = (chapter: ChapterSpec): string => {
  const input = `${chapter.slug}|${chapter.anchorEt}|${chapter.windowStartEt}|${chapter.windowEndEt}`;
  // FNV-1a 32-bit. Plain bit math — no Node-only imports.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // Mul-mod via shifts (FNV prime 0x01000193). Use Math.imul for 32-bit
    // multiplication semantics.
    h = Math.imul(h, 0x01000193);
  }
  // Mask to 32 unsigned bits and emit padded hex.
  return (h >>> 0).toString(16).padStart(8, '0');
};

/** Hashed PNG filename, e.g. `v2-neptune.a1b2c3d4.png`. */
export const ogPngFilenameFor = (chapter: ChapterSpec): string =>
  `${chapter.slug}.${ogContentHash(chapter)}.png`;

/** Site-absolute path to the OG PNG, e.g. `/og/v2-neptune.a1b2c3d4.png`. */
export const ogImagePathFor = (chapter: ChapterSpec): string =>
  `/${OG_PUBLIC_DIR}/${ogPngFilenameFor(chapter)}`;

/**
 * Build the manifest from a chapter list. Defaults to `ALL_CHAPTERS` — the
 * single source of truth (R4). The `chapters` parameter exists so tests
 * can pass a fixture without monkey-patching the registry import.
 */
export const buildOgManifest = (
  chapters: readonly ChapterSpec[] = ALL_CHAPTERS,
): OgManifest => {
  const entries: OgManifestEntry[] = chapters.map((c) => ({
    slug: c.slug,
    title: ogTitleFor(c),
    description: c.ogDescription,
    imagePath: ogImagePathFor(c),
    anchorIso: isoFromEt(c.anchorEt),
  }));
  return Object.freeze({
    version: 1 as const,
    entries: Object.freeze(entries),
  });
};

/**
 * Build a lookup index so the HTML emitter can resolve `slug → entry` in
 * O(1) per chapter. Returned map is plain — callers are expected not to
 * mutate.
 */
export const indexManifestBySlug = (
  manifest: OgManifest,
): ReadonlyMap<string, OgManifestEntry> => {
  const m = new Map<string, OgManifestEntry>();
  for (const e of manifest.entries) m.set(e.slug, e);
  return m;
};

/**
 * 1×1 transparent PNG bytes — the placeholder payload written for every
 * chapter until Story 4.9 / 7.x runs Playwright. Decoded from the
 * canonical pngcrushed 1×1 RGBA(0,0,0,0) image (67 bytes). Exposed as a
 * Uint8Array so the script runner can write it without re-encoding.
 *
 * Mime: `image/png`. The bytes round-trip the PNG signature check; any
 * crawler that fetches `og:image` gets a valid HTTP 200 PNG — just an
 * intentionally empty one.
 */
export const PLACEHOLDER_PNG_BYTES: Uint8Array = new Uint8Array([
  // PNG signature
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  // IHDR chunk
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
  // IDAT chunk
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00,
  0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
  // IEND chunk
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
