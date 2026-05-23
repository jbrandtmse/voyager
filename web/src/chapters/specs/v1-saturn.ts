/**
 * Voyager 1 — Saturn encounter chapter spec (Story 2.1 AC2).
 *
 * V1's closest approach to Saturn: 1980-11-12T23:46:00Z. The encounter
 * is also V1's Titan flyby — the trajectory deflection that ended its
 * planetary tour and aimed it out of the ecliptic.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1980-11-12T23:46:00Z');

const spec: ChapterSpec = {
  slug: 'v1-saturn',
  name: 'Voyager 1 — Saturn',
  markerLabel: 'V1S',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - 30 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 30 * SECONDS_PER_DAY,
  spacecraft: 'v1',
  ogDescription:
    'Voyager 1 closes on Saturn on 12 November 1980, bending past Titan to leave the ecliptic for interstellar space.',
  // Story 4.1 AC5 — Saturn barycenter (NAIF 6).
  targetBody: 6,
};

export default spec;
