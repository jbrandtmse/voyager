/**
 * Voyager 1 — Saturn encounter chapter spec (Stories 2.1, 4.1, 4.6).
 *
 * V1's closest approach to Saturn: 1980-11-12T23:46:00Z. Story 4.6
 * narrowed the held window from the Story-2.1 placeholder ±30 days to
 * the Story-4.6-spec ±5 days, populated the editorial chapter copy
 * (`copy`, consumed by `<v-chapter-copy>`), and tuned the default camera
 * framing (`defaultFraming`, consumed by `VoyagerCameraController`).
 *
 * V1's Saturn encounter was shaped by a single targeting priority: a
 * close Titan flyby (1980-11-12T05:41:00Z at 6,490 km above Titan's
 * surface) for atmospheric characterization. The Titan pass deflected
 * V1 northward out of the ecliptic, ending its planetary tour — the
 * "slingshot" the simulation makes visible per Story 4.6 AC4 and Story
 * 4.8.
 *
 * Citation surface: all dated / distanced / named facts in the `copy`
 * block trace to `MISSION_FACTS.md` § Voyager 1 Saturn encounter Titan
 * flyby parameters. The copy is editorial, not a direct quotation.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1980-11-12T23:46:00Z');

/**
 * Story 4.6 AC3 — body-centered framing tuned for V1S.
 *
 * Saturn at origin (body-centered frame). Titan is the slingshot body
 * and needs to be in frame for AC3's "V1 + Saturn + Titan visible
 * together" criterion. Titan's semi-major axis is ~1,221,830 km from
 * Saturn's center — markedly larger than Io's ~421,700 km baseline used
 * by V1J. The offset is scaled up accordingly: ~3.0 Mm pull-back along
 * Z, ~1.5 Mm above the ring plane (Y), ~1.5 Mm side offset (X) so
 * Titan's orbital position remains in the viewport at closest approach.
 * Final values may be tuned by the lead's Story 4.6 AC8 smoke (Rule 5
 * candidate).
 */
const V1S_DEFAULT_FRAMING_OFFSET_KM = [1_500_000, 1_500_000, 3_000_000] as const;

/**
 * Story 4.6 AC2 — hand-written chapter copy. 50–150 words covering the
 * Titan flyby at 6,490 km, the radio occultation atmospheric probe, the
 * slingshot deflection out of the ecliptic, V1's Saturn closest approach
 * at 23:46 UTC, ring-system imaging (broad rings, F-ring braiding,
 * spokes), and the post-encounter trajectory toward interstellar space.
 * All facts trace to `MISSION_FACTS.md` § Voyager 1 Saturn encounter
 * Titan flyby parameters.
 */
const V1S_COPY = Object.freeze({
  lede: 'V1 Saturn.',
  body:
    "On 12 November 1980, Voyager 1 reaches Saturn. Eighteen hours " +
    "earlier the spacecraft has already cleared its hero target — Titan, " +
    "6,490 kilometers above the surface, an upper-atmosphere flyby tuned " +
    "to let the radio occultation experiment probe Titan's haze " +
    "top-down. The Titan pass deflects V1 northward; it will never again " +
    "cross the plane of the planets. Across the day the spacecraft " +
    "sweeps the ring system: the first high-resolution photometry of the " +
    "broad rings, the braided F-ring, and a new feature — radial " +
    "'spokes' that rotate with Saturn's magnetic field rather than " +
    "Keplerian orbital motion. After Saturn closest approach at " +
    "twenty-three forty-six UTC, V1 climbs out of the ecliptic toward " +
    "interstellar space.",
});

const spec: ChapterSpec = {
  slug: 'v1-saturn',
  name: 'Voyager 1 — Saturn',
  markerLabel: 'V1S',
  anchorEt: ANCHOR_ET,
  // Story 4.6 AC1 — narrowed from ±30 days to ±5 days per the epic spec.
  // The Titan flyby (1980-11-12T05:41:00Z) and the Saturn closest
  // approach (1980-11-12T23:46:00Z) both sit inside the held band; the
  // post-Saturn ecliptic-exit bend (AC4) is visible at the band's
  // outbound edge. The lead's AC8 smoke may flag a wider window if the
  // bend isn't legible from inside ±5d (Rule 5 candidate per the story's
  // Dev Notes).
  windowStartEt: ANCHOR_ET - 5 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 5 * SECONDS_PER_DAY,
  spacecraft: 'v1',
  ogDescription:
    'Voyager 1 closes on Saturn on 12 November 1980, bending past Titan at 6,490 km to leave the ecliptic for interstellar space.',
  // Story 4.1 AC5 — Saturn barycenter (NAIF 6).
  targetBody: 6,
  // Story 4.6 AC2 — editorial chapter copy.
  copy: V1S_COPY,
  // Story 4.6 AC3 — body-centered default framing.
  defaultFraming: {
    offsetKm: V1S_DEFAULT_FRAMING_OFFSET_KM,
  },
};

export default spec;
