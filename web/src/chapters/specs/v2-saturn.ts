/**
 * Voyager 2 — Saturn encounter chapter spec (Stories 2.1, 4.1, 4.6).
 *
 * V2's closest approach to Saturn: 1981-08-26T00:00:00Z (date-level
 * sourcing per MISSION_FACTS — sub-day granularity not required for
 * chapter window membership). Story 4.6 narrowed the held window from
 * the Story-2.1 placeholder ±30 days to the Story-4.6-spec ±5 days,
 * populated the editorial chapter copy (`copy`, consumed by
 * `<v-chapter-copy>`), and tuned the default camera framing
 * (`defaultFraming`, consumed by `VoyagerCameraController`).
 *
 * V2's Saturn flyby was tuned for the Uranus-and-Neptune Grand Tour
 * continuation; V2 kept the ecliptic plane (in contrast with V1's
 * Titan-priority deflection). The approach swept past Iapetus on
 * 1981-08-22, Hyperion on 1981-08-25, and Titan a few hours later, all
 * preceding the Saturn closest-approach anchor.
 *
 * Citation surface: all dated / distanced / named facts in the `copy`
 * block trace to `MISSION_FACTS.md` § Voyager 2 Saturn encounter moon
 * flyby parameters. The copy is editorial, not a direct quotation.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1981-08-26T00:00:00Z');

/**
 * Story 4.6 AC3 — body-centered framing tuned for V2S.
 *
 * Saturn at origin (body-centered frame). The "key bodies in frame"
 * criterion is V2 + Saturn + Iapetus / Hyperion / Titan. Iapetus orbits
 * Saturn at ~3,560,000 km — substantially farther than Titan's
 * ~1,221,830 km. The framing uses the V1S baseline scaled slightly: the
 * Z pull-back at 3.0 Mm keeps Saturn + the nearest moons in frame; the
 * lead's smoke iterates if Iapetus needs to be visible during the
 * 1981-08-22 sub-encounter at the band's inbound edge. Final values may
 * be tuned by the lead's Story 4.6 AC8 smoke (Rule 5 candidate).
 */
const V2S_DEFAULT_FRAMING_OFFSET_KM = [1_500_000, 1_500_000, 3_000_000] as const;

/**
 * Story 4.6 AC2 — hand-written chapter copy. 50–150 words covering the
 * V2 Saturn closest approach (1981-08-26), the Iapetus / Hyperion / Titan
 * sweep, Iapetus's two-toned hemispheres (Cassini Regio), Hyperion's
 * irregular shape, V2's higher-cadence ring imagery (C-ring and D-ring
 * structure refinement), and the Uranus trajectory setup. All facts
 * trace to `MISSION_FACTS.md` § Voyager 2 Saturn encounter moon flyby
 * parameters.
 */
const V2S_COPY = Object.freeze({
  lede: 'V2 Saturn.',
  body:
    "On 26 August 1981, Voyager 2 reaches Saturn. The encounter is the " +
    "second of the Grand Tour — V2's flyby is tuned for Uranus and " +
    "Neptune ahead rather than Titan behind, so V2 keeps the ecliptic. " +
    "The approach takes the spacecraft past Iapetus on the 22nd, " +
    "Hyperion on the 25th, and Titan a few hours later. Iapetus reveals " +
    "its two-toned hemispheres up close for the first time — Cassini " +
    "Regio dark against the bright trailing face. Hyperion's irregular " +
    "three-hundred-by-two-hundred-kilometer shape is captured at close " +
    "range. V2 returns higher-cadence ring imagery than V1, refining " +
    "the C-ring and D-ring structure. After closest approach, the " +
    "spacecraft falls onward toward Uranus, four and a half years away.",
});

const spec: ChapterSpec = {
  slug: 'v2-saturn',
  name: 'Voyager 2 — Saturn',
  markerLabel: 'V2S',
  anchorEt: ANCHOR_ET,
  // Story 4.6 AC1 — narrowed from ±30 days to ±5 days per the epic spec.
  // The Iapetus flyby (1981-08-22T01:26:00Z), Hyperion flyby
  // (1981-08-25T01:25:00Z), and Titan flyby (1981-08-25T09:37:00Z) all
  // sit inside the held band's inbound half; Saturn closest approach
  // anchors the band.
  windowStartEt: ANCHOR_ET - 5 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 5 * SECONDS_PER_DAY,
  spacecraft: 'v2',
  ogDescription:
    'Voyager 2 passes Saturn on 26 August 1981, sweeping past Iapetus, Hyperion, and Titan before continuing toward Uranus and Neptune.',
  // Story 4.1 AC5 — Saturn barycenter (NAIF 6).
  targetBody: 6,
  // Story 4.6 AC2 — editorial chapter copy.
  copy: V2S_COPY,
  // Story 4.6 AC3 — body-centered default framing.
  defaultFraming: {
    offsetKm: V2S_DEFAULT_FRAMING_OFFSET_KM,
  },
};

export default spec;
