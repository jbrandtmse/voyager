/**
 * Voyager 2 — Jupiter encounter chapter spec (Stories 2.1, 4.1, 4.6).
 *
 * V2's closest approach to Jupiter: 1979-07-09T22:29:00Z. Story 4.6
 * narrowed the held window from the Story-2.1 placeholder ±30 days to
 * the Story-4.6-spec ±5 days, populated the editorial chapter copy
 * (`copy`, consumed by `<v-chapter-copy>`), and tuned the default camera
 * framing (`defaultFraming`, consumed by `VoyagerCameraController`).
 *
 * V2's flyby geometry was inverted relative to V1: V2 swept inward from
 * Callisto to Ganymede to Europa to Io and onto a trajectory tuned for
 * the Saturn-and-beyond Grand Tour (in contrast with V1's Titan-priority
 * deflection). The body-centered framing keeps V2, Jupiter, and the
 * inner Galileans visible together at closest approach.
 *
 * Citation surface: all dated / distanced / named facts in the `copy`
 * block trace to `MISSION_FACTS.md` § Voyager 2 Jupiter encounter
 * interior sweep timeline. The copy is editorial, not a direct
 * quotation.
 *
 * Rule-5 note (planning-artifact amendment): the PRD encounter coverage
 * table at `_bmad-output/planning-artifacts/prd.md` line 129 originally
 * listed V2J's sequence as "Callisto, Ganymede, Europa, Amalthea." Per
 * NASA SP-439 Appendix A the V2 sweep included Io rather than a close
 * Amalthea pass; Amalthea was a V1-only close encounter. Story 4.6
 * amended the PRD row in place per Rule 5 and the editorial copy here
 * cites the historically-correct Callisto/Ganymede/Europa/Io sweep.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1979-07-09T22:29:00Z');

/**
 * Story 4.6 AC3 — body-centered framing tuned for V2J. Same magnitude
 * baseline as V1J's offset (Story 4.5) — Jupiter system geometry is
 * comparable across the two encounters. The offset frames Jupiter (at
 * origin in the body-centered frame), the inner Galileans (Io at
 * ~421,700 km, Europa at ~670,900 km), and V2 sweeping past at roughly
 * 645,000 km altitude. The 2.5 Mm Z pull-back + 1.0 Mm X offset + 1.5 Mm
 * Y lift baseline from V1J holds; the lead's per-story smoke iterates if
 * the V2-specific approach geometry needs adjustment (Rule 5 candidate).
 */
const V2J_DEFAULT_FRAMING_OFFSET_KM = [1_000_000, 1_500_000, 2_500_000] as const;

/**
 * Story 4.6 AC2 — hand-written chapter copy. 50–150 words covering the
 * V2 closest-approach instant (1979-07-09T22:29:00Z), the inverted
 * Callisto → Ganymede → Europa → Io sweep, the Grand Tour deflection
 * setup, and V2's finer ring imagery + Ganymede grooved terrain coverage.
 * All facts trace to `MISSION_FACTS.md` § Voyager 2 Jupiter encounter
 * interior sweep timeline.
 */
const V2J_COPY = Object.freeze({
  lede: 'V2 Jupiter.',
  body:
    "On 9 July 1979, Voyager 2 reaches Jupiter, four months behind its " +
    "sibling. The approach geometry is inverted: V2 sweeps inward from " +
    "Callisto to Ganymede to Europa to Io, capping at closest planetary " +
    "approach at twenty-two twenty-nine UTC. Where V1's flyby was tuned " +
    "for Io and Titan, V2's is tuned for the Grand Tour beyond — Jupiter's " +
    "gravity deflects the spacecraft onto a trajectory that will reach " +
    "Saturn, then Uranus, then Neptune. V2 returns finer ring imagery " +
    "than V1 captured, and the first high-resolution coverage of " +
    "Ganymede's grooved terrain.",
});

const spec: ChapterSpec = {
  slug: 'v2-jupiter',
  name: 'Voyager 2 — Jupiter',
  markerLabel: 'V2J',
  anchorEt: ANCHOR_ET,
  // Story 4.6 AC1 — narrowed from ±30 days to ±5 days per the epic spec.
  // The V2 interior sweep (Callisto 1979-07-08 12:21 UT through Io
  // 1979-07-09 23:17 UT) spans roughly 35 hours and sits comfortably
  // inside the held band.
  windowStartEt: ANCHOR_ET - 5 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 5 * SECONDS_PER_DAY,
  spacecraft: 'v2',
  ogDescription:
    'Voyager 2 reaches Jupiter on 9 July 1979, four months behind its sibling, lining up the Grand Tour through the outer planets.',
  // Story 4.1 AC5 — Jupiter barycenter (NAIF 5).
  targetBody: 5,
  // Story 4.6 AC2 — editorial chapter copy.
  copy: V2J_COPY,
  // Story 4.6 AC3 — body-centered default framing.
  defaultFraming: {
    offsetKm: V2J_DEFAULT_FRAMING_OFFSET_KM,
  },
};

export default spec;
