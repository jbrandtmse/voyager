/**
 * Story 2.1 QA — cross-spec consistency across all 11 chapter specs.
 *
 * The dev-authored `registry.test.ts` covers length-11, chronological order,
 * slug shape uniqueness, marker shape, non-overlapping windows, anchor-in-
 * window, frozen mutation, and `findChapterBySlug` / `findActiveChapterAtEt`
 * at three sentinel ETs (V1L, V2L, V1J anchor; PBD-quiet gap).
 *
 * This file adds the gaps:
 *
 *   1. Marker-label UNIQUENESS (registry only validates shape per spec).
 *   2. Slug-to-canonical-marker mapping (V1L↔V1L, V1J↔V1J, PBD↔PBD, …).
 *   3. PRD-canonical anchor verification for the remaining 7 chapters not
 *      asserted in `registry.test.ts` (V2J, V1S, V2S, V2U, V2N, PBD, V1H,
 *      V2H) — the source of truth is the Story 2.1 file AC2 list.
 *   4. `name` non-empty + `spacecraft` ∈ documented union.
 *   5. `windowEndEt` > `windowStartEt` (degenerate windows are forbidden).
 *   6. Mission-window sanity — every anchor falls between V2 launch
 *      (chronologically first) and the V2 heliopause anchor + a small
 *      buffer (chronologically last). Catches a rogue anchor that slipped
 *      outside the mission spine.
 *   7. PBD placeholder annotation contract from AC3 — the spec file must
 *      contain the documented "Do NOT add PBD-specific choreography here"
 *      stop-sign so future contributors don't smuggle behaviour into the
 *      placeholder before Epic 5 ships.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_CHAPTERS } from '../src/chapters/registry';
import { etFromIso } from '../src/math/et-conversions';
import type { Spacecraft } from '../src/types/chapter';

const SECONDS_PER_DAY = 86_400;
const webRoot = resolve(__dirname, '..');

/**
 * The canonical (slug → markerLabel) and (slug → spacecraft) mappings
 * directly transcribed from Story 2.1 AC2. The dev's `registry.test.ts`
 * does not pin marker-label-to-slug, so a rogue spec swapping labels
 * (V1J → 'V2J') would pass the shape regex but break the scrubber.
 */
const EXPECTED_MARKER_BY_SLUG: ReadonlyMap<string, string> = new Map([
  ['launch-v1', 'V1L'],
  ['launch-v2', 'V2L'],
  ['v1-jupiter', 'V1J'],
  ['v2-jupiter', 'V2J'],
  ['v1-saturn', 'V1S'],
  ['v2-saturn', 'V2S'],
  ['v2-uranus', 'V2U'],
  ['v2-neptune', 'V2N'],
  ['v1-heliopause', 'V1H'],
  ['v2-heliopause', 'V2H'],
  ['pale-blue-dot', 'PBD'],
]);

const EXPECTED_SPACECRAFT_BY_SLUG: ReadonlyMap<string, Spacecraft> = new Map([
  ['launch-v1', 'v1'],
  ['launch-v2', 'v2'],
  ['v1-jupiter', 'v1'],
  ['v2-jupiter', 'v2'],
  ['v1-saturn', 'v1'],
  ['v2-saturn', 'v2'],
  ['v2-uranus', 'v2'],
  ['v2-neptune', 'v2'],
  ['v1-heliopause', 'v1'],
  ['v2-heliopause', 'v2'],
  ['pale-blue-dot', 'v1'],
]);

/**
 * PRD/Story-2.1-AC2 canonical anchor instants. Transcribed verbatim from
 * the story file (lines 35–43); the registry test pins three of them
 * (V1L, V2L, V1J). This map pins the remaining eight so a future drift
 * is caught.
 */
const EXPECTED_ANCHOR_ISO_BY_SLUG: ReadonlyMap<string, string> = new Map([
  ['launch-v1', '1977-09-05T12:56:00Z'],
  ['launch-v2', '1977-08-20T14:29:00Z'],
  ['v1-jupiter', '1979-03-05T12:05:00Z'],
  ['v2-jupiter', '1979-07-09T22:29:00Z'],
  ['v1-saturn', '1980-11-12T23:46:00Z'],
  ['v2-saturn', '1981-08-26T00:00:00Z'],
  ['v2-uranus', '1986-01-24T17:59:00Z'],
  ['v2-neptune', '1989-08-25T03:56:00Z'],
  ['pale-blue-dot', '1990-02-14T00:00:00Z'],
  ['v1-heliopause', '2012-08-25T00:00:00Z'],
  ['v2-heliopause', '2018-11-05T00:00:00Z'],
]);

const findBySlug = (slug: string) => {
  const spec = ALL_CHAPTERS.find((c) => c.slug === slug);
  expect(spec, `expected chapter ${slug} in ALL_CHAPTERS`).toBeDefined();
  return spec!;
};

describe('Story 2.1 QA — cross-spec consistency', () => {
  it('marker labels are unique across all 11 chapters', () => {
    const markers = ALL_CHAPTERS.map((c) => c.markerLabel);
    expect(new Set(markers).size).toBe(markers.length);
  });

  it('each slug maps to the AC2-documented markerLabel', () => {
    for (const [slug, expectedMarker] of EXPECTED_MARKER_BY_SLUG) {
      expect(findBySlug(slug).markerLabel).toBe(expectedMarker);
    }
  });

  it('each slug maps to the AC2-documented spacecraft', () => {
    for (const [slug, expectedSpacecraft] of EXPECTED_SPACECRAFT_BY_SLUG) {
      expect(findBySlug(slug).spacecraft).toBe(expectedSpacecraft);
    }
  });

  it('every spacecraft value is in the documented union {v1, v2, both}', () => {
    const valid: ReadonlySet<Spacecraft> = new Set<Spacecraft>(['v1', 'v2', 'both']);
    for (const c of ALL_CHAPTERS) {
      expect(valid.has(c.spacecraft)).toBe(true);
    }
  });

  it('every name is a non-empty trimmed string', () => {
    for (const c of ALL_CHAPTERS) {
      expect(typeof c.name).toBe('string');
      expect(c.name.trim().length).toBeGreaterThan(0);
      expect(c.name).toBe(c.name.trim());
    }
  });

  it('every window is non-degenerate (windowEndEt > windowStartEt)', () => {
    for (const c of ALL_CHAPTERS) {
      expect(c.windowEndEt).toBeGreaterThan(c.windowStartEt);
    }
  });

  it('each anchorEt matches the PRD/AC2 canonical ISO instant', () => {
    for (const [slug, iso] of EXPECTED_ANCHOR_ISO_BY_SLUG) {
      const spec = findBySlug(slug);
      const expected = etFromIso(iso);
      // etFromIso is the canonical SPICE-aware converter used by every
      // spec module. We compare directly (no tolerance) because the spec
      // and the test share the same converter — drift here would indicate
      // a hand-edited anchor diverging from its `etFromIso(iso)` source.
      expect(spec.anchorEt).toBe(expected);
    }
  });

  it('every anchor falls inside the mission spine (V2 launch ± buffer → V2 heliopause + buffer)', () => {
    const missionStart = etFromIso('1977-08-20T14:29:00Z') - 7 * SECONDS_PER_DAY;
    const missionEnd = etFromIso('2018-11-05T00:00:00Z') + 90 * SECONDS_PER_DAY;
    for (const c of ALL_CHAPTERS) {
      expect(c.anchorEt).toBeGreaterThanOrEqual(missionStart);
      expect(c.anchorEt).toBeLessThanOrEqual(missionEnd);
    }
  });

  it('PBD placeholder window is the documented ±1 day, NOT the encounter ±30 day default', () => {
    // AC3 fixes PBD's window to ±1 day around 1990-02-14 because PBD is a
    // precise instant. Slipping back to the ±30-day encounter window would
    // re-enable behaviour Epic 5 explicitly forbids until the dedicated
    // module ships.
    const pbd = findBySlug('pale-blue-dot');
    expect(pbd.windowStartEt).toBe(pbd.anchorEt - SECONDS_PER_DAY);
    expect(pbd.windowEndEt).toBe(pbd.anchorEt + SECONDS_PER_DAY);
  });

  it('PBD spec file is now a re-export shim into the Story-5.1 module (Epic 5 boundary crossed)', () => {
    // Story 5.1 amended this assertion in place per Rule 5: the
    // pre-Story-5.1 stop-sign ("Placeholder per Story 2.1 ... Do NOT
    // add PBD-specific choreography here") was a forward-looking
    // guard against premature PBD work. Story 5.1 IS the Epic 5 PBD
    // module landing, so the spec/ file now re-exports from
    // web/src/chapters/pale-blue-dot/ per ADR-0014 § Story 5.1
    // amendment block.
    const src = readFileSync(
      resolve(webRoot, 'src/chapters/specs/pale-blue-dot.ts'),
      'utf-8',
    );
    expect(src).toMatch(/re-export shim/);
    expect(src).toMatch(/Story 5\.1/);
    expect(src).toMatch(/from '\.\.\/pale-blue-dot'/);
  });
});
