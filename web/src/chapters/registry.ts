/**
 * Chapter registry (Story 2.1 AC4).
 *
 * Single source of truth for the 11 chapters that drive the mission
 * spine: scrubber vertebrae (Story 2.2), chapter index listbox
 * (Story 2.3), URL slug routing (Story 2.4), pre-rendered OG cards
 * (Story 2.6), heliopause text cards (Story 2.9), encounter modules
 * (Epic 4), and the Pale Blue Dot module (Epic 5). Per Epic 2 R4
 * mitigation, downstream consumers MUST read from `ALL_CHAPTERS` —
 * no parallel hard-coded lists are permitted.
 *
 * The array is sorted by `anchorEt` ascending and frozen with
 * `Object.freeze` so accidental mutation throws in strict mode (Vitest
 * runs in strict mode by default).
 */

import type { ChapterSpec } from '../types/chapter';
import launchV1 from './specs/launch-v1';
import launchV2 from './specs/launch-v2';
import v1Jupiter from './specs/v1-jupiter';
import v2Jupiter from './specs/v2-jupiter';
import v1Saturn from './specs/v1-saturn';
import v2Saturn from './specs/v2-saturn';
import v2Uranus from './specs/v2-uranus';
import v2Neptune from './specs/v2-neptune';
import paleBlueDot from './specs/pale-blue-dot';
import v1Heliopause from './specs/v1-heliopause';
import v2Heliopause from './specs/v2-heliopause';

const UNSORTED: readonly ChapterSpec[] = [
  launchV1,
  launchV2,
  v1Jupiter,
  v2Jupiter,
  v1Saturn,
  v2Saturn,
  v2Uranus,
  v2Neptune,
  paleBlueDot,
  v1Heliopause,
  v2Heliopause,
];

/**
 * The 11 chapters in chronological order by `anchorEt` ascending.
 * Frozen — attempting to push/splice/reassign throws in strict mode.
 */
export const ALL_CHAPTERS: readonly ChapterSpec[] = Object.freeze(
  [...UNSORTED].sort((a, b) => a.anchorEt - b.anchorEt),
);

/**
 * Look up a chapter by its URL slug. Returns `null` for unknown slugs;
 * callers (URLRouter in Story 2.4) treat null as a silent-reject signal.
 */
export const findChapterBySlug = (slug: string): ChapterSpec | null => {
  for (const c of ALL_CHAPTERS) {
    if (c.slug === slug) return c;
  }
  return null;
};

/**
 * Return the chapter whose `[windowStartEt, windowEndEt]` band contains
 * `et`, or `null` if `et` falls between adjacent chapter windows. By
 * Story 2.1 AC2 the windows do NOT overlap, so at most one chapter ever
 * matches — the first match is the only match.
 */
export const findActiveChapterAtEt = (et: number): ChapterSpec | null => {
  for (const c of ALL_CHAPTERS) {
    if (et >= c.windowStartEt && et <= c.windowEndEt) return c;
  }
  return null;
};
