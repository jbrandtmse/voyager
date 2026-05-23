/**
 * Voyager 2 — Uranus encounter chapter spec (Story 2.1 AC2).
 *
 * V2's closest approach to Uranus: 1986-01-24T17:59:00Z. The only
 * spacecraft ever to fly past Uranus.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1986-01-24T17:59:00Z');

const spec: ChapterSpec = {
  slug: 'v2-uranus',
  name: 'Voyager 2 — Uranus',
  markerLabel: 'V2U',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - 30 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 30 * SECONDS_PER_DAY,
  spacecraft: 'v2',
  ogDescription:
    'Voyager 2 becomes the only spacecraft ever to fly past Uranus on 24 January 1986.',
  // Story 4.1 AC5 — Uranus barycenter (NAIF 7).
  targetBody: 7,
};

export default spec;
