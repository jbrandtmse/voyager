/**
 * Voyager 2 — Jupiter encounter chapter spec (Story 2.1 AC2).
 *
 * V2's closest approach to Jupiter: 1979-07-09T22:29:00Z.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1979-07-09T22:29:00Z');

const spec: ChapterSpec = {
  slug: 'v2-jupiter',
  name: 'Voyager 2 — Jupiter',
  markerLabel: 'V2J',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - 30 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 30 * SECONDS_PER_DAY,
  spacecraft: 'v2',
};

export default spec;
