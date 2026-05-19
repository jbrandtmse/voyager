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

/** ISO-8601 UTC string for 1977-08-20T00:00:00Z (Voyager 2 launch). */
export const MISSION_START_ISO = '1977-08-20T00:00:00Z';

/** ISO-8601 UTC string for 2030-12-31T23:59:59Z (projected mission end). */
export const MISSION_END_ISO = '2030-12-31T23:59:59Z';

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
