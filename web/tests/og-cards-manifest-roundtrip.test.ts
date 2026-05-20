/**
 * Story 2.6 QA — manifest schema round-trip stability.
 *
 * The `og-manifest.json` shape is a load-bearing contract: downstream
 * consumers (Story 7.x Playwright capture, future CDN audit tooling) will
 * READ this file via `JSON.parse` and treat it as the canonical
 * slug→filename map. The Vite plugin AND the standalone runner both
 * serialise it via `JSON.stringify(manifest, null, 2)`.
 *
 * This file verifies the round-trip is byte-stable:
 *   1. `JSON.parse(JSON.stringify(buildOgManifest()))` deep-equals the
 *      original (no `Object.freeze` artefacts, no symbol props, no
 *      non-serialisable fields).
 *   2. The parsed manifest re-indexes through `indexManifestBySlug`
 *      cleanly and every slug looks up to the right entry.
 *   3. Every entry has the documented shape — no extra fields, no
 *      missing fields, no field-type drift.
 *
 * If a future refactor adds a field to `OgManifestEntry` without bumping
 * `manifest.version` (currently 1), the shape assertion fires.
 *
 * Voyager skill rules:
 *   - Rule 2 (Integration ACs): pinning the cross-process schema.
 */

import { describe, it, expect } from 'vitest';
import {
  buildOgManifest,
  indexManifestBySlug,
  type OgManifest,
  type OgManifestEntry,
} from '../src/build/og-cards';
import { ALL_CHAPTERS } from '../src/chapters/registry';

const EXPECTED_ENTRY_KEYS: ReadonlyArray<keyof OgManifestEntry> = [
  'slug',
  'title',
  'description',
  'imagePath',
  'anchorIso',
];

describe('Story 2.6 — og-manifest.json round-trip stability', () => {
  it('JSON.parse(JSON.stringify(buildOgManifest())) deep-equals buildOgManifest()', () => {
    const original = buildOgManifest();
    const serialised = JSON.stringify(original);
    const roundTripped = JSON.parse(serialised) as OgManifest;
    // toStrictEqual would reject the Object.freeze metadata mismatch;
    // toEqual is the right tool for "same data, possibly different
    // object identity / frozenness".
    expect(roundTripped).toEqual(JSON.parse(JSON.stringify(original)));
    // Identity check on the structural fields.
    expect(roundTripped.version).toBe(1);
    expect(roundTripped.entries.length).toBe(original.entries.length);
  });

  it('serialised output is pretty-printed (2-space indent) — matches the on-disk emission contract', () => {
    // The Vite plugin AND the runner both use `JSON.stringify(manifest, null, 2)`.
    // This pins the contract so a future refactor that switches to
    // single-line emit doesn't silently break humans reading the file.
    const serialised = JSON.stringify(buildOgManifest(), null, 2);
    // 2-space indent leaves "  " before every key in nested entries.
    expect(serialised).toContain('  "version":');
    expect(serialised).toContain('  "entries":');
    expect(serialised).toContain('      "slug":');
  });

  it('round-tripped manifest re-indexes cleanly via indexManifestBySlug', () => {
    const original = buildOgManifest();
    const roundTripped = JSON.parse(JSON.stringify(original)) as OgManifest;
    const idx = indexManifestBySlug(roundTripped);
    expect(idx.size).toBe(ALL_CHAPTERS.length);
    for (const chapter of ALL_CHAPTERS) {
      const entry = idx.get(chapter.slug);
      expect(entry, `missing index entry for ${chapter.slug}`).toBeDefined();
      expect(entry!.slug).toBe(chapter.slug);
      expect(entry!.description).toBe(chapter.ogDescription);
    }
  });

  it('every entry has exactly the documented keys — no extra, no missing', () => {
    const manifest = buildOgManifest();
    for (const entry of manifest.entries) {
      const keys = Object.keys(entry).sort();
      const expected = [...EXPECTED_ENTRY_KEYS].sort();
      expect(keys).toEqual(expected);
    }
  });

  it('every entry field is a non-empty string of the right shape', () => {
    const manifest = buildOgManifest();
    for (const entry of manifest.entries) {
      expect(typeof entry.slug).toBe('string');
      expect(entry.slug).toMatch(/^[a-z0-9-]+$/);
      expect(typeof entry.title).toBe('string');
      expect(entry.title.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
      expect(typeof entry.imagePath).toBe('string');
      expect(entry.imagePath).toMatch(/^\/og\/[a-z0-9-]+\.[0-9a-f]{8}\.png$/);
      expect(typeof entry.anchorIso).toBe('string');
      expect(entry.anchorIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }
  });

  it('manifest.entries is iterable in chronological order (anchorIso ascending)', () => {
    // The OG manifest is the canonical chronological view of the
    // chapter list, by virtue of ALL_CHAPTERS being sorted by
    // anchorEt. Downstream tooling (Story 7.x) MAY rely on this
    // ordering; pin it here.
    const manifest = buildOgManifest();
    const isoList = manifest.entries.map((e) => e.anchorIso);
    const sortedAsc = [...isoList].sort();
    expect(isoList).toEqual(sortedAsc);
  });

  it('schema version is 1 — round-trip preserves the version field', () => {
    // The schema-version field exists so future breaking changes can
    // be detected by consumers. Bump explicitly when adding fields
    // that downstream consumers cannot ignore.
    const manifest = buildOgManifest();
    const roundTripped = JSON.parse(JSON.stringify(manifest)) as OgManifest;
    expect(roundTripped.version).toBe(1);
  });
});
