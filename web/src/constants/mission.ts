/**
 * Mission-wide canonical constants for the Voyager simulation.
 *
 * Single source of truth for the mission window endpoints (1977-08-20 V2
 * launch → 2030-12-31 projected mission end) and the first-paint timing
 * primitives used by `<v-title-card>` + `<v-timeline-scrubber>`.
 *
 * ## ET values
 *
 * The ET endpoints are pre-computed SpiceyPy-derived values (SPICE TDB
 * seconds past J2000, naif0012.tls leap-second table). They are committed
 * here as plain numeric literals so this module has no runtime dependency
 * on `et-conversions.ts` — the co-located test re-derives them via
 * `etFromIso()` and asserts the constants match within 5 ms, so a future
 * leap-second addition that shifts `etFromIso` will surface as a failing
 * test rather than silent drift.
 *
 * @see web/src/math/et-conversions.ts for the conversion algorithm.
 * @see web/src/constants/mission.test.ts for the re-derivation guard test.
 */

/** ISO-8601 UTC string for 1977-08-20T00:00:00Z (Voyager 2 launch day, midnight). */
export const MISSION_START_ISO = '1977-08-20T00:00:00Z';

/** ISO-8601 UTC string for 2030-12-31T23:59:59Z (projected mission end). */
export const MISSION_END_ISO = '2030-12-31T23:59:59Z';

/**
 * ISO-8601 UTC string for the Voyager 1 launch instant (1977-09-05T12:56:00Z).
 *
 * Reference: NASA JPL Voyager 1 mission record. Cape Canaveral LC-41 liftoff.
 */
export const V1_LAUNCH_ISO = '1977-09-05T12:56:00Z';

/**
 * ISO-8601 UTC string for the Voyager 2 launch instant (1977-08-20T14:29:00Z).
 *
 * Reference: NASA JPL Voyager 2 mission record. Cape Canaveral LC-41 liftoff.
 * Voyager 2 launched first chronologically; "Voyager 1" is so named for being
 * the lead probe at the Jupiter encounter.
 */
export const V2_LAUNCH_ISO = '1977-08-20T14:29:00Z';

/**
 * SPICE ET (TDB seconds past J2000) for 1977-08-20T00:00:00Z UTC.
 *
 * Reference: SpiceyPy `str2et('1977-08-20T00:00:00')` with naif0012.tls.
 */
export const MISSION_START_ET = -705844751.8171712;

/**
 * SPICE ET (TDB seconds past J2000) for 2030-12-31T23:59:59Z UTC.
 *
 * Reference: SpiceyPy `str2et('2030-12-31T23:59:59')` with naif0012.tls.
 * Note: future leap seconds beyond 2017-01-01 would shift this value by
 * an integer number of seconds; update naif0012.tls and re-derive when
 * IERS announces a new leap second.
 */
export const MISSION_END_ET = 978264068.1839114;

/**
 * SPICE ET (TDB seconds past J2000) for V1 launch (1977-09-05T12:56:00Z UTC).
 *
 * Reference: SpiceyPy `str2et('1977-09-05T12:56:00')` with naif0012.tls.
 * Used by `TrajectoryLines` (Story 1.12) to determine the start of V1's past
 * trajectory polyline.
 */
export const V1_LAUNCH_ET = -704415791.8174509;

/**
 * SPICE ET (TDB seconds past J2000) for V2 launch (1977-08-20T14:29:00Z UTC).
 *
 * Reference: SpiceyPy `str2et('1977-08-20T14:29:00')` with naif0012.tls.
 * Used by `TrajectoryLines` (Story 1.12) and the V2-pre-launch visibility
 * gate in `SpacecraftModels`.
 */
export const V2_LAUNCH_ET = -705792611.8171833;

/** Title card hold duration before dissolve, in milliseconds (Story 1.9 AC1). */
export const TITLE_CARD_HOLD_MS = 2000;

/** URL `?t=` writeback throttle window during continuous drag (Story 1.9 AC6). */
export const URL_WRITEBACK_THROTTLE_MS = 250;

/**
 * Delay after the last scrub keystroke / pointerup before resuming playback
 * (Story 1.9 AC4). Captures the "playing-before-scrub" memory so the user
 * sees a brief pause + resume rather than juddery mid-scrub playback.
 */
export const SCRUB_RESUME_DELAY_MS = 300;
