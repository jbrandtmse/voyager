/**
 * Voyager 2 — heliopause crossing chapter spec (Story 2.1 AC2).
 *
 * V2 crossed the heliopause on 2018-11-05 (NASA/JPL announcement). The
 * ±90 day window mirrors V1's heliopause spec to share the same Story
 * 2.9 V1H / V2H copy panel layout.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('2018-11-05T00:00:00Z');

const spec: ChapterSpec = {
  slug: 'v2-heliopause',
  name: 'Voyager 2 — Heliopause Crossing',
  markerLabel: 'V2H',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - 90 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 90 * SECONDS_PER_DAY,
  spacecraft: 'v2',
  ogDescription:
    'Voyager 2 crosses the heliopause on 5 November 2018, joining its twin in the interstellar medium.',
};

export default spec;
