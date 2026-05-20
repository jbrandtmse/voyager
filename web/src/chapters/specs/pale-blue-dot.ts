/**
 * Placeholder per Story 2.1. Full PBD module is Epic 5 (Story 5.1+).
 * Do NOT add PBD-specific choreography here.
 *
 * Pale Blue Dot chapter — V1 captured the "family portrait" mosaic
 * (including the PBD frame) on 1990-02-14. This placeholder is just
 * enough metadata to (a) appear in `ALL_CHAPTERS` so the scrubber gets
 * its PBD vertebra (Story 2.2), (b) resolve a `/chapter/pale-blue-dot`
 * URL slug (Story 2.4), and (c) seed the build-time OG-card generator
 * (Story 2.6). The richer PBD module (turn choreography, photo-plate
 * compositing, internal substates) ships in Epic 5 and replaces this
 * spec's runtime hooks while keeping the slug/anchor stable.
 *
 * Window: ±1 day around the anchor. PBD is a precise instant, not a
 * multi-day encounter — the wider encounter window would force the FSM
 * to enter `held` for PBD far longer than the moment warrants and would
 * overlap nothing else regardless (the closest neighbour is V2 Neptune
 * 1989-08-25, six months earlier).
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1990-02-14T00:00:00Z');

const spec: ChapterSpec = {
  slug: 'pale-blue-dot',
  name: 'Pale Blue Dot',
  markerLabel: 'PBD',
  anchorEt: ANCHOR_ET,
  windowStartEt: ANCHOR_ET - SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + SECONDS_PER_DAY,
  spacecraft: 'v1',
};

export default spec;
