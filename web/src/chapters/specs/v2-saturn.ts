/**
 * Voyager 2 — Saturn encounter chapter spec (Story 2.1 AC2).
 *
 * V2's closest approach to Saturn: 1981-08-26T00:00:00Z (date-level
 * sourcing from MISSION_FACTS — sub-day granularity not required for
 * chapter window membership).
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1981-08-26T00:00:00Z');

const spec: ChapterSpec = {
  slug: 'v2-saturn',
  name: 'Voyager 2 — Saturn',
  markerLabel: 'V2S',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - 30 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 30 * SECONDS_PER_DAY,
  spacecraft: 'v2',
};

export default spec;
