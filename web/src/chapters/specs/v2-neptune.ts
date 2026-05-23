/**
 * Voyager 2 — Neptune encounter chapter spec (Stories 2.1, 4.1, 4.7).
 *
 * V2's closest approach to Neptune: 1989-08-25T03:56:00Z. The only
 * spacecraft ever to fly past Neptune, and the post-encounter Triton
 * bend (FR12) sets up the spacecraft's permanent southward heliocentric
 * trajectory. Story 4.7 narrowed the held window from the Story-2.1
 * placeholder ±30 days to the Story-4.7-spec ±5 days, populated the
 * editorial chapter copy (`copy`, consumed by `<v-chapter-copy>`), and
 * tuned the default camera framing (`defaultFraming`, consumed by
 * `VoyagerCameraController`).
 *
 * V2's Neptune flyby was the final planetary encounter of either probe
 * and the lowest-altitude planetary flyby of the entire mission —
 * 4,950 km above Neptune's 1-bar atmospheric level. The trajectory was
 * tuned for a close pass at Triton (39,800 km above Triton's surface)
 * five hours after Neptune closest approach; the Triton encounter
 * geometry deflected V2's heliocentric trajectory south of the
 * ecliptic plane (FR12). The chapter window covers the encounter
 * itself; the full ecliptic-south bend develops over the post-encounter
 * cruise era (1990 onwards) — Story 4.8 captures the canonical
 * annotated screenshot of the bend at end-of-mission framing per AC4.
 *
 * Citation surface: all dated / distanced / named facts in the `copy`
 * block trace to `MISSION_FACTS.md` § Voyager 2 Neptune encounter —
 * Triton flyby parameters and discoveries. Primary sources: NASA
 * SP-525 (Voyager at Neptune); Stone & Miner, *Science* 246, 1417
 * (1989) — V2 Neptune encounter introduction; Smith et al., *Science*
 * 246, 1422 (1989) — V2 Neptune imaging-science results; Soderblom et
 * al., *Science* 250, 410 (1990) — Triton geyser-plume characterisation.
 *
 * Rule-5 note (story Dev Notes section item 3): the post-Neptune
 * Triton-bend visualisation that AC4 describes is qualified "at the
 * end of the mission (2030)" — the bend develops over post-encounter
 * months and is NOT expected to be visible inside the ±5d V2N
 * encounter window. The chapter copy frames the bend as "set up by"
 * the Triton flyby rather than visible-from-inside-the-window; the
 * AC4 visualisation lives in heliocentric framing at post-encounter
 * scrub anchors (1990-06-01 in the AC8 smoke, 2030 in the canonical
 * Story 4.8 screenshot). No Rule-5 amendment to AC4 wording is
 * needed — the AC is internally consistent with the visualisation
 * living outside the chapter window.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1989-08-25T03:56:00Z');

/**
 * Story 4.7 AC3 — body-centered framing tuned for V2N.
 *
 * Neptune at origin (body-centered frame). The "key bodies in frame"
 * criterion is V2 + Neptune + Triton. Triton's semi-major axis is
 * ~354,800 km — between Io's ~421,700 km from Jupiter and Titan's
 * ~1,221,830 km from Saturn. The framing offset `[0.8, 1.2, 2.0] Mm`
 * (recommended in story AC3) keeps Neptune + Triton + V2 visible at
 * closest approach; the lead's smoke iterates if Triton is clipped
 * inside the post-encounter sweep (Rule 5 candidate).
 */
const V2N_DEFAULT_FRAMING_OFFSET_KM = [800_000, 1_200_000, 2_000_000] as const;

/**
 * Story 4.7 AC2 — hand-written chapter copy. 50–150 words covering the
 * V2 Neptune closest-approach instant (1989-08-25T03:56:00Z), the
 * Triton flyby at 39,800 km, the nitrogen geyser discovery (the second
 * confirmed cryovolcanism observation in the solar system after Io
 * 1979), Neptune's Great Dark Spot, the six new inner moons + the
 * ring-arc-to-complete-ring resolution, and the gravity-assist bend
 * that sends V2 south of the ecliptic (FR12). All facts trace to
 * `MISSION_FACTS.md` § Voyager 2 Neptune encounter — Triton flyby
 * parameters and discoveries.
 */
const V2N_COPY = Object.freeze({
  lede: 'V2 Neptune.',
  body:
    "On 25 August 1989, Voyager 2 reaches Neptune. The closest planetary " +
    "approach at three fifty-six UTC is the lowest-altitude planetary " +
    "flyby of the entire Voyager mission — barely five thousand " +
    "kilometres above Neptune's cloud tops. Imagery reveals the Great " +
    "Dark Spot, an Earth-sized anticyclonic storm in the southern " +
    "hemisphere, and resolves the ring arcs detected from Earth into " +
    "complete rings with azimuthal density variations. Six new inner " +
    "moons are discovered. Five hours later, V2 sweeps past Triton at " +
    "thirty-nine thousand eight hundred kilometres, capturing active " +
    "nitrogen geysers — the second confirmed cryovolcanism in the solar " +
    "system. The Triton encounter geometry deflects V2's trajectory " +
    "south of the ecliptic plane, the final gravity assist of the " +
    "mission.",
});

const spec: ChapterSpec = {
  slug: 'v2-neptune',
  name: 'Voyager 2 — Neptune',
  markerLabel: 'V2N',
  anchorEt: ANCHOR_ET,
  // Story 4.7 AC1 — narrowed from ±30 days to ±5 days per the epic spec.
  // The Neptune closest approach (1989-08-25T03:56:00Z) and the Triton
  // flyby (1989-08-25T09:10:00Z) occur on the same UTC date and sit
  // comfortably inside the held band. The post-encounter Triton-bend
  // visualisation (FR12, AC4) lives OUTSIDE this window — see the
  // Rule-5 note in the spec docstring above.
  windowStartEt: ANCHOR_ET - 5 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 5 * SECONDS_PER_DAY,
  spacecraft: 'v2',
  ogDescription:
    'Voyager 2 reaches Neptune on 25 August 1989, the last planetary encounter of either probe, before bending south past Triton at 39,800 km.',
  // Story 4.1 AC5 — Neptune barycenter (NAIF 8).
  targetBody: 8,
  // Story 4.7 AC2 — editorial chapter copy.
  copy: V2N_COPY,
  // Story 4.7 AC3 — body-centered default framing.
  defaultFraming: {
    offsetKm: V2N_DEFAULT_FRAMING_OFFSET_KM,
  },
};

export default spec;
