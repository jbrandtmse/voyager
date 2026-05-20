/**
 * Voyager 2 — Neptune encounter chapter spec (Story 2.1 AC2).
 *
 * V2's closest approach to Neptune: 1989-08-25T03:56:00Z. The only
 * spacecraft ever to fly past Neptune, and the post-encounter Triton
 * bend (FR12) sets up the spacecraft's permanent southward heliocentric
 * trajectory.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1989-08-25T03:56:00Z');

const spec: ChapterSpec = {
  slug: 'v2-neptune',
  name: 'Voyager 2 — Neptune',
  markerLabel: 'V2N',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - 30 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 30 * SECONDS_PER_DAY,
  spacecraft: 'v2',
  ogDescription:
    'Voyager 2 reaches Neptune on 25 August 1989, the last planetary encounter of either probe, before bending south past Triton.',
};

export default spec;
