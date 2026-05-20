/**
 * Voyager 1 — Jupiter encounter chapter spec (Story 2.1 AC2).
 *
 * V1's closest approach to Jupiter: 1979-03-05T12:05:00Z.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1979-03-05T12:05:00Z');

const spec: ChapterSpec = {
  slug: 'v1-jupiter',
  name: 'Voyager 1 — Jupiter',
  markerLabel: 'V1J',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - 30 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 30 * SECONDS_PER_DAY,
  spacecraft: 'v1',
  ogDescription:
    'Voyager 1 sweeps past Jupiter on 5 March 1979, riding the giant planet for a gravitational kick toward Saturn.',
};

export default spec;
