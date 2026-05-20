/**
 * Voyager 1 launch chapter spec (Story 2.1 AC2). Slug `launch-v1` per
 * ADR-0001 (URL public-API contract).
 *
 * V1 launched 1977-09-05T12:56:00Z from Cape Canaveral LC-41, 16 days
 * after V2. The ±7 day window is tighter than the encounter ±30 day
 * default so it does NOT overlap with the `launch-v2` window.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1977-09-05T12:56:00Z');

const spec: ChapterSpec = {
  slug: 'launch-v1',
  name: 'Voyager 1 Launch',
  markerLabel: 'V1L',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - 7 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 7 * SECONDS_PER_DAY,
  spacecraft: 'v1',
  ogDescription:
    'Voyager 1 launches from Cape Canaveral on 5 September 1977, sixteen days after its twin.',
};

export default spec;
