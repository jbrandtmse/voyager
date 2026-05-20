/**
 * Voyager 1 — heliopause crossing chapter spec (Story 2.1 AC2).
 *
 * V1 crossed the heliopause on 2012-08-25 (NASA/JPL announcement: the
 * date plasma instrument readings indicated departure from the heliosheath
 * into interstellar space). Heliopause crossings get a ±90 day window
 * because the threshold is fuzzier than a planetary encounter — the
 * Story 2.9 V1H / V2H text cards lean on this wider band.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('2012-08-25T00:00:00Z');

const spec: ChapterSpec = {
  slug: 'v1-heliopause',
  name: 'Voyager 1 — Heliopause Crossing',
  markerLabel: 'V1H',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - 90 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 90 * SECONDS_PER_DAY,
  spacecraft: 'v1',
  ogDescription:
    'Voyager 1 crosses the heliopause on 25 August 2012, becoming the first human-made object to enter interstellar space.',
};

export default spec;
