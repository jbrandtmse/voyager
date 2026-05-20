/**
 * Story 2.6 AC3 / Epic 2 R4 — OG generator ↔ chapter registry parity.
 *
 * The Epic 2 R4 mitigation mandate (architecture.md / epics.md):
 *
 *   > Story 2.6 must include a build/runtime parity assertion: OG
 *   > generator and FSM read chapter definitions from the same source
 *   > file (no copy-paste). A unit test must enforce that the OG
 *   > generator's chapter list equals the FSM's chapter list at build
 *   > time.
 *
 * This file IS that test. It imports `ALL_CHAPTERS` from the registry
 * (the FSM's source) and `buildOgManifest()` from the OG core (the
 * generator), then asserts slug-set equality, length equality, ordering,
 * and per-entry shape.
 *
 * If a future contributor adds a chapter to the registry but forgets to
 * rebuild the manifest, the parity test still passes (because
 * buildOgManifest defaults to ALL_CHAPTERS) — but if anyone TYPES a
 * sibling list inside og-cards.ts and routes the manifest through it,
 * the slug-set check fires.
 */

import { describe, it, expect } from 'vitest';
import {
  buildOgManifest,
  indexManifestBySlug,
  ogContentHash,
  ogDeepLinkPathFor,
  ogImagePathFor,
  ogPngFilenameFor,
  ogTitleFor,
  OG_PUBLIC_DIR,
  PLACEHOLDER_PNG_BYTES,
  type OgManifest,
} from './og-cards';
import { ALL_CHAPTERS } from '../chapters/registry';
import { isoFromEt } from '../math/et-conversions';

describe('og-cards core — R4 parity (Story 2.6 AC3)', () => {
  it('manifest length === ALL_CHAPTERS length', () => {
    const manifest = buildOgManifest();
    expect(manifest.entries.length).toBe(ALL_CHAPTERS.length);
  });

  it('manifest counts exactly 11 entries (one per chapter, AC3)', () => {
    const manifest = buildOgManifest();
    expect(manifest.entries.length).toBe(11);
  });

  it('manifest slug set === ALL_CHAPTERS slug set (no extras, no drops)', () => {
    const manifest = buildOgManifest();
    const manifestSlugs = new Set(manifest.entries.map((e) => e.slug));
    const registrySlugs = new Set(ALL_CHAPTERS.map((c) => c.slug));
    expect(manifestSlugs).toEqual(registrySlugs);
  });

  it('manifest entry order matches ALL_CHAPTERS order (chronological by anchorEt)', () => {
    const manifest = buildOgManifest();
    const manifestOrder = manifest.entries.map((e) => e.slug);
    const registryOrder = ALL_CHAPTERS.map((c) => c.slug);
    expect(manifestOrder).toEqual(registryOrder);
  });

  it('every chapter in the registry has a manifest entry (forward direction)', () => {
    const manifest = buildOgManifest();
    const idx = indexManifestBySlug(manifest);
    for (const c of ALL_CHAPTERS) {
      expect(idx.has(c.slug)).toBe(true);
    }
  });

  it('every manifest entry maps back to a chapter in the registry (reverse direction)', () => {
    const manifest = buildOgManifest();
    const slugs = new Set(ALL_CHAPTERS.map((c) => c.slug));
    for (const e of manifest.entries) {
      expect(slugs.has(e.slug)).toBe(true);
    }
  });
});

describe('og-cards core — manifest entry shape (Story 2.6 AC1 + AC2)', () => {
  it('each entry has slug, title, description, imagePath, anchorIso', () => {
    const manifest = buildOgManifest();
    for (const e of manifest.entries) {
      expect(typeof e.slug).toBe('string');
      expect(e.slug.length).toBeGreaterThan(0);
      expect(typeof e.title).toBe('string');
      expect(e.title.length).toBeGreaterThan(0);
      expect(typeof e.description).toBe('string');
      expect(e.description.length).toBeGreaterThan(0);
      expect(typeof e.imagePath).toBe('string');
      expect(typeof e.anchorIso).toBe('string');
    }
  });

  it('title follows the "<name> — Voyager" convention', () => {
    const manifest = buildOgManifest();
    for (const e of manifest.entries) {
      expect(e.title).toMatch(/ — Voyager$/);
    }
  });

  it('description is the chapter ogDescription field (sourced from spec)', () => {
    const manifest = buildOgManifest();
    const idx = indexManifestBySlug(manifest);
    for (const c of ALL_CHAPTERS) {
      const entry = idx.get(c.slug);
      expect(entry?.description).toBe(c.ogDescription);
    }
  });

  it('imagePath uses /og/<slug>.<hash>.png shape with content hash', () => {
    const manifest = buildOgManifest();
    for (const e of manifest.entries) {
      expect(e.imagePath).toMatch(/^\/og\/[a-z0-9-]+\.[0-9a-f]{8}\.png$/);
      expect(e.imagePath.startsWith(`/${OG_PUBLIC_DIR}/`)).toBe(true);
    }
  });

  it('anchorIso round-trips through et-conversions (ISO-8601 UTC seconds)', () => {
    const manifest = buildOgManifest();
    for (const e of manifest.entries) {
      expect(e.anchorIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }
  });

  it('schema version is 1 (locked until breaking shape change)', () => {
    const manifest = buildOgManifest();
    expect(manifest.version).toBe(1);
  });
});

describe('og-cards core — content hash determinism (Story 2.6 AC1)', () => {
  it('ogContentHash returns 8-char lowercase hex', () => {
    for (const c of ALL_CHAPTERS) {
      expect(ogContentHash(c)).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('ogContentHash is deterministic for the same spec', () => {
    for (const c of ALL_CHAPTERS) {
      expect(ogContentHash(c)).toBe(ogContentHash(c));
    }
  });

  it('ogContentHash differs when slug differs', () => {
    const a = { ...ALL_CHAPTERS[0]! };
    const b = { ...a, slug: `${a.slug}-mutated` };
    expect(ogContentHash(a)).not.toBe(ogContentHash(b));
  });

  it('ogContentHash differs when anchorEt differs (cache-busts on scene change)', () => {
    const a = { ...ALL_CHAPTERS[0]! };
    const b = { ...a, anchorEt: a.anchorEt + 1 };
    expect(ogContentHash(a)).not.toBe(ogContentHash(b));
  });

  it('every chapter has a unique PNG filename in the produced manifest', () => {
    const manifest = buildOgManifest();
    const paths = new Set(manifest.entries.map((e) => e.imagePath));
    expect(paths.size).toBe(manifest.entries.length);
  });
});

describe('og-cards core — helper shape (Story 2.6 AC2)', () => {
  it('ogTitleFor format', () => {
    const c = ALL_CHAPTERS[0]!;
    expect(ogTitleFor(c)).toBe(`${c.name} — Voyager`);
  });

  it('ogDeepLinkPathFor format embeds anchor as ISO', () => {
    const c = ALL_CHAPTERS[0]!;
    const iso = isoFromEt(c.anchorEt);
    expect(ogDeepLinkPathFor(c)).toBe(`/c/${c.slug}?t=${iso}`);
  });

  it('ogPngFilenameFor / ogImagePathFor consistency', () => {
    const c = ALL_CHAPTERS[0]!;
    const hash = ogContentHash(c);
    expect(ogPngFilenameFor(c)).toBe(`${c.slug}.${hash}.png`);
    expect(ogImagePathFor(c)).toBe(`/og/${c.slug}.${hash}.png`);
  });
});

describe('og-cards core — placeholder PNG payload (deferral leg)', () => {
  it('PLACEHOLDER_PNG_BYTES begins with the PNG signature', () => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < sig.length; i++) {
      expect(PLACEHOLDER_PNG_BYTES[i]).toBe(sig[i]);
    }
  });

  it('PLACEHOLDER_PNG_BYTES ends with the IEND chunk', () => {
    const bytes = PLACEHOLDER_PNG_BYTES;
    // IEND chunk: 4 zero bytes (length) + ASCII "IEND" + 4 bytes CRC.
    const iendName = [0x49, 0x45, 0x4e, 0x44];
    const tail = Array.from(bytes.slice(-8, -4));
    expect(tail).toEqual(iendName);
  });

  it('PLACEHOLDER_PNG_BYTES is small (≤200 bytes)', () => {
    expect(PLACEHOLDER_PNG_BYTES.length).toBeLessThanOrEqual(200);
  });
});

describe('og-cards core — buildOgManifest fixture injection (R4 escape hatch)', () => {
  it('passing a fixture array overrides ALL_CHAPTERS for the call', () => {
    const fixture = [
      {
        slug: 'fixture-a',
        name: 'Fixture A',
        markerLabel: 'FA',
        anchorEt: 0,
        windowStartEt: -1,
        windowEndEt: 1,
        spacecraft: 'v1' as const,
        ogDescription: 'A test fixture.',
      },
    ];
    const manifest: OgManifest = buildOgManifest(fixture);
    expect(manifest.entries.length).toBe(1);
    expect(manifest.entries[0]?.slug).toBe('fixture-a');
  });
});
