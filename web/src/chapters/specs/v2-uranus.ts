/**
 * Voyager 2 — Uranus encounter chapter spec (Stories 2.1, 4.1, 4.7).
 *
 * V2's closest approach to Uranus: 1986-01-24T17:59:00Z. The only
 * spacecraft ever to fly past Uranus. Story 4.7 narrowed the held
 * window from the Story-2.1 placeholder ±30 days to the Story-4.7-spec
 * ±5 days, populated the editorial chapter copy (`copy`, consumed by
 * `<v-chapter-copy>`), and tuned the default camera framing
 * (`defaultFraming`, consumed by `VoyagerCameraController`).
 *
 * V2's Uranus flyby was tuned for the Miranda close approach — at
 * 29,000 km above the moon's surface, the closest encounter with any
 * Uranian satellite by an order of magnitude. The body-centered framing
 * keeps V2, Uranus, and the inner moons visible together at closest
 * approach; the Uranian satellite system is more compact than Jupiter's
 * or Saturn's (Miranda orbits at ~129,800 km vs. Titan ~1,222,000 km
 * from Saturn), so the framing offset scales DOWN from the V1J / V1S
 * / V2J / V2S baselines.
 *
 * Citation surface: all dated / distanced / named / counted facts in
 * the `copy` block trace to `MISSION_FACTS.md` § Voyager 2 Uranus
 * encounter — moon flyby parameters and discoveries. The copy is
 * editorial, not a direct quotation. Primary sources: NASA SP-466
 * + NASA SP-495 (Voyager Uranus encounter press materials); Stone &
 * Miner, *Science* 233, 39 (1986) — V2 Uranus encounter introduction;
 * Smith et al., *Science* 233, 43 (1986) — V2 Uranus imaging-science
 * results; Karkoschka, *Icarus* 151, 51 (2001) — Perdita discovery
 * via re-analysis of archived V2 frames.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1986-01-24T17:59:00Z');

/**
 * Story 4.7 AC3 — body-centered framing tuned for V2U.
 *
 * Uranus at origin (body-centered frame). The "key bodies in frame"
 * criterion is V2 + Uranus + Miranda. Miranda's semi-major axis is
 * ~129,800 km — much closer than Io's ~421,700 km from Jupiter or
 * Titan's ~1,221,830 km from Saturn. The framing scales DOWN from the
 * V1J / V2J `[1.0, 1.5, 2.5] Mm` baseline to `[0.6, 0.9, 1.5] Mm`,
 * which keeps Uranus + Miranda + V2 in frame at closest approach
 * (29,000 km Miranda altitude). The story file (AC3) recommended this
 * scaled-down baseline; final values may be tuned by the lead's
 * Story 4.7 AC8 smoke (Rule 5 candidate).
 */
const V2U_DEFAULT_FRAMING_OFFSET_KM = [600_000, 900_000, 1_500_000] as const;

/**
 * Story 4.7 AC2 — hand-written chapter copy. 50–150 words covering the
 * V2 Uranus closest-approach instant (1986-01-24T17:59:00Z), the
 * Miranda close approach at 29,000 km (the closest of any Uranian
 * satellite encounter), the Oberon / Titania / Umbriel / Ariel
 * progressive flybys, Miranda's dramatic surface fractures (coronae,
 * cliffs), and the 11 new moons credited to V2U imagery (10
 * contemporaneous + Perdita via Karkoschka 1999 re-analysis). All
 * facts trace to `MISSION_FACTS.md` § Voyager 2 Uranus encounter —
 * moon flyby parameters and discoveries.
 */
const V2U_COPY = Object.freeze({
  lede: 'V2 Uranus.',
  body:
    "On 24 January 1986, Voyager 2 becomes the only spacecraft ever to " +
    "fly past Uranus. The approach takes the probe past Oberon, then " +
    "Titania, then Umbriel, then Ariel, before the closest planetary " +
    "approach at seventeen fifty-nine UTC. The flyby is tuned for a " +
    "close pass at Miranda — at twenty-nine thousand kilometres above " +
    "the moon's surface, the tightest encounter with any Uranian " +
    "satellite. Miranda returns the encounter's most extraordinary " +
    "imagery: oval coronae, chevron ridges, and cliffs rising twenty " +
    "kilometres from the surface. Eleven new moons are credited to " +
    "the encounter — ten contemporaneous discoveries plus Perdita, " +
    "identified in archived frames in 1999. V2 falls onward toward " +
    "Neptune, three and a half years ahead.",
});

const spec: ChapterSpec = {
  slug: 'v2-uranus',
  name: 'Voyager 2 — Uranus',
  markerLabel: 'V2U',
  anchorEt: ANCHOR_ET,
  // Story 4.7 AC1 — narrowed from ±30 days to ±5 days per the epic spec.
  // The Oberon (14:36 UT) → Titania (15:13 UT) → Umbriel (15:40 UT) →
  // Ariel (16:11 UT) → Miranda (17:00 UT) → Uranus (17:59 UT) sweep
  // occupies ~3.5 hours on 1986-01-24, well inside the held band.
  windowStartEt: ANCHOR_ET - 5 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 5 * SECONDS_PER_DAY,
  spacecraft: 'v2',
  ogDescription:
    'Voyager 2 becomes the only spacecraft ever to fly past Uranus on 24 January 1986, sweeping past Miranda at 29,000 km.',
  // Story 4.1 AC5 — Uranus barycenter (NAIF 7).
  targetBody: 7,
  // Story 4.7 AC2 — editorial chapter copy.
  copy: V2U_COPY,
  // Story 4.7 AC3 — body-centered default framing.
  defaultFraming: {
    offsetKm: V2U_DEFAULT_FRAMING_OFFSET_KM,
  },
};

export default spec;
