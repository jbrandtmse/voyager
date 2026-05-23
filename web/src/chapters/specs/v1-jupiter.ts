/**
 * Voyager 1 — Jupiter encounter chapter spec (Stories 2.1, 4.1, 4.5).
 *
 * V1's closest approach to Jupiter: 1979-03-05T12:05:00Z. Story 4.5
 * narrowed the held window from the Story-2.1 placeholder ±30 days to
 * the Story-4.5-spec ±5 days, populated the editorial chapter copy
 * (`copy`, consumed by `<v-chapter-copy>`), and tuned the default camera
 * framing (`defaultFraming`, consumed by `VoyagerCameraController`).
 *
 * The body-centered framing was tuned to keep V1 + Jupiter + Io visible
 * together at closest approach. At anchor ET, Io is roughly 421 Mm from
 * Jupiter's center (Io semi-major axis ~421,700 km); V1 sweeps past
 * Jupiter at ~349 Mm altitude. A camera offset of ~1.5 Mm above and
 * ~1.0 Mm to the side of Jupiter (with a ~2.5 Mm pull-back) frames the
 * system without any of the three bodies leaving the viewport.
 *
 * Citation surface: all dated / distanced / named facts in the `copy`
 * block trace to `MISSION_FACTS.md` § Voyager 1 Jupiter encounter
 * interior sweep and § Jupiter ring discovery. The copy is editorial,
 * not a direct quotation.
 */

import type { ChapterSpec } from '../../types/chapter';
import { etFromIso } from '../../math/et-conversions';

const SECONDS_PER_DAY = 86_400;
const ANCHOR_ET = etFromIso('1979-03-05T12:05:00Z');

/**
 * Story 4.5 AC3 — body-centered framing tuned for V1J. The camera offset
 * is in render-space kilometers relative to Jupiter's center (the active
 * body's position in the post-floating-origin shifted frame).
 *
 * The offset vector frames Jupiter, Io (at ~421,700 km from Jupiter
 * center), and V1 (sweeping past at ~349,000 km altitude) together. At
 * 2.5 Mm pull-back along the camera-to-target line plus ~1.5 Mm above
 * Jupiter's equator, the perspective camera's FOV captures all three
 * with comfortable margin. Final values may be tuned by the lead's
 * Story 4.5 AC8 Chrome DevTools MCP smoke (Rule 5 candidate per the
 * story's Dev Notes).
 *
 * The offset axes follow render-space convention: +Y is "up" (J2000
 * ecliptic +Z aligns with render-space +Y per the renderer's basis), +Z
 * is "out of screen toward the camera" by convention for the perspective
 * camera looking down -Z. The 2.5 Mm Z-component places the camera in
 * front of Jupiter (looking back toward the Sun direction); the 1.5 Mm
 * Y-component lifts above the equator; the 1.0 Mm X-component pulls to
 * one side so Io's orbital position is in the frame.
 */
const V1J_DEFAULT_FRAMING_OFFSET_KM = [1_000_000, 1_500_000, 2_500_000] as const;

/**
 * Story 4.5 AC2 — hand-written chapter copy. 80–120 words covering the
 * ring discovery (1979-03-04), the closest approach instant
 * (1979-03-05T12:05:00Z), the 48-hour interior sweep across
 * Amalthea → Io → Europa → Ganymede → Callisto, and Linda Morabito's
 * Io volcano discovery (1979-03-08). All facts trace to
 * `MISSION_FACTS.md` § Voyager 1 Jupiter encounter interior sweep and
 * § Jupiter ring discovery.
 */
const V1J_COPY = Object.freeze({
  lede: 'V1 Jupiter.',
  body:
    "On 5 March 1979, Voyager 1 reaches Jupiter, threading the inner " +
    "system at its closest approach: twelve oh five UTC. The night " +
    "before, a long-exposure backlit frame catches a faint band around " +
    "the planet — Jupiter has rings. Across the next forty-eight hours " +
    "the spacecraft sweeps past Amalthea, Io, Europa, Ganymede, and " +
    "Callisto in turn. Three days later, navigation engineer Linda " +
    "Morabito notices a crescent on Io's limb in frame 0468J1-001 that " +
    "does not match any moon. It is a plume. Io is volcanically " +
    "active — the first body besides Earth where eruptions have been " +
    "observed in real time.",
});

const spec: ChapterSpec = {
  slug: 'v1-jupiter',
  name: 'Voyager 1 — Jupiter',
  markerLabel: 'V1J',
  anchorEt: ANCHOR_ET,
  // Story 4.5 AC1 — narrowed from ±30 days to ±5 days per the epic spec.
  // The 48-hour interior sweep (Amalthea closest approach 1979-03-05
  // 06:54 UT through Callisto closest approach 1979-03-06 17:08 UT)
  // sits comfortably inside the held band; the ring-discovery frame
  // (1979-03-04) and Morabito's volcano discovery (1979-03-08) both
  // fall inside the ±5d band as well.
  windowStartEt: ANCHOR_ET - 5 * SECONDS_PER_DAY,
  windowEndEt: ANCHOR_ET + 5 * SECONDS_PER_DAY,
  spacecraft: 'v1',
  ogDescription:
    'Voyager 1 sweeps past Jupiter on 5 March 1979, discovering ring, watching Io erupt, and riding a gravitational kick toward Saturn.',
  // Story 4.1 AC5 — Jupiter barycenter (NAIF 5), matches the runtime
  // manifest's bake convention (see constants/body-radii.ts).
  targetBody: 5,
  // Story 4.5 AC2 — editorial chapter copy.
  copy: V1J_COPY,
  // Story 4.5 AC3 — body-centered default framing.
  defaultFraming: {
    offsetKm: V1J_DEFAULT_FRAMING_OFFSET_KM,
  },
};

export default spec;
