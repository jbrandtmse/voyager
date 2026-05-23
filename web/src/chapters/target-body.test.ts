/**
 * Story 4.1 AC5 — chapter spec `targetBody` invariants.
 *
 * Pins the pattern that the six encounter chapters carry a NAIF barycenter
 * ID for view-frame blend centering, while the cruise / launch / heliopause
 * / Pale Blue Dot chapters explicitly omit it (collapsing the
 * `ViewFrameService.getTransform` blend to the identity heliocentric
 * branch).
 *
 * The IDs use barycenters (5, 6, 7, 8) not the body IDs (599, 699, 799,
 * 899) because the bake samples planet positions at the barycenter per
 * Story 1.13 (see `constants/body-radii.ts`).
 */

import { describe, it, expect } from 'vitest';
import { ALL_CHAPTERS, findChapterBySlug } from './registry';

const ENCOUNTER_TARGET_BODY: ReadonlyMap<string, number> = new Map([
  ['v1-jupiter', 5],
  ['v2-jupiter', 5],
  ['v1-saturn', 6],
  ['v2-saturn', 6],
  ['v2-uranus', 7],
  ['v2-neptune', 8],
]);

const NON_ENCOUNTER_SLUGS = [
  'launch-v1',
  'launch-v2',
  'v1-heliopause',
  'v2-heliopause',
  'pale-blue-dot',
];

describe('Story 4.1 AC5 — ChapterSpec.targetBody', () => {
  it('encounter chapters carry the expected NAIF barycenter ID', () => {
    for (const [slug, expected] of ENCOUNTER_TARGET_BODY) {
      const spec = findChapterBySlug(slug);
      expect(spec, `chapter ${slug} should exist in the registry`).not.toBeNull();
      expect(spec!.targetBody, `chapter ${slug} should declare targetBody`).toBe(
        expected,
      );
    }
  });

  it('non-encounter chapters omit targetBody (undefined)', () => {
    for (const slug of NON_ENCOUNTER_SLUGS) {
      const spec = findChapterBySlug(slug);
      expect(spec, `chapter ${slug} should exist in the registry`).not.toBeNull();
      expect(spec!.targetBody).toBeUndefined();
    }
  });

  it('every chapter in the registry is classified (encounter or not)', () => {
    const classified = new Set<string>([
      ...ENCOUNTER_TARGET_BODY.keys(),
      ...NON_ENCOUNTER_SLUGS,
    ]);
    for (const c of ALL_CHAPTERS) {
      expect(
        classified.has(c.slug),
        `chapter ${c.slug} is missing from the encounter/non-encounter classification`,
      ).toBe(true);
    }
    // Cross-check: total count matches the registry size.
    expect(classified.size).toBe(ALL_CHAPTERS.length);
  });

  it('encounter targetBody IDs are barycenters (1..8), not body IDs (199..899)', () => {
    for (const expected of ENCOUNTER_TARGET_BODY.values()) {
      expect(expected).toBeGreaterThanOrEqual(1);
      expect(expected).toBeLessThanOrEqual(8);
    }
  });
});
