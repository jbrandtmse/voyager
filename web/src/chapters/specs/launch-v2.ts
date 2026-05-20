/**
 * Voyager 2 launch chapter spec (Story 2.1 AC2). Slug `launch-v2` per
 * ADR-0001 (URL public-API contract).
 *
 * V2 launched first chronologically (1977-08-20T14:29:00Z, Cape Canaveral
 * LC-41), 16 days before V1. The ±7 day window is intentionally tighter
 * than the encounter ±30 day default so it does NOT overlap with the
 * `launch-v1` window (anchor 1977-09-05; centers are only 16 days apart).
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1977-08-20T14:29:00Z');

const spec: ChapterSpec = {
  slug: 'launch-v2',
  name: 'Voyager 2 Launch',
  markerLabel: 'V2L',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - 7 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 7 * SECONDS_PER_DAY,
  spacecraft: 'v2',
};

export default spec;
