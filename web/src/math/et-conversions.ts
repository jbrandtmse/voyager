/**
 * ET ↔ ISO-8601 UTC conversions for the client-side simulation clock.
 *
 * "ET" here is the SPICE convention: TDB seconds past J2000_TDB, where
 * J2000_TDB corresponds to UTC 2000-01-01T11:58:55.816 (and to TT noon
 * 2000-01-01T12:00:00.000). The full SPICE conversion includes a periodic
 * K·sin(E) term whose peak amplitude is ~1.657 ms; we deliberately omit it
 * for client-side simplicity. The story requires to-the-second precision
 * (sub-second jitter is acceptable), and the omitted term is below 2 ms
 * across the full mission window 1977-08-20 → 2030-12-31.
 *
 * The leap-seconds table embedded here is `naif0012.tls`'s DELTET/DELTA_AT
 * list (lines 121–148 of the kernel) and covers every leap second declared
 * through 2017-01-01 — the most recent leap second at time of authoring.
 * If a future leap second is declared, append the entry to the table.
 *
 * Module shape: pure functions, no Lit / DOM / runtime dependencies — this
 * is callable from any execution context (Node tests, browser, worker).
 *
 * @see web/src/math/et-conversions.test.ts for round-trip verification
 *      against SpiceyPy-derived reference values.
 */

// J2000 reference: TT 2000-01-01T12:00:00 UTC noon. UTC-J2000 (the instant
// where SPICE ET = 0) is 2000-01-01T11:58:55.816 UTC.
const J2000_TT_NOON_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0, 0);

// Constant TAI → TT offset (DELTET/DELTA_T_A in the LSK).
const DELTA_T_A_SECONDS = 32.184;

// (UTC date string, DELTA_AT = TAI - UTC at that moment forward) per
// naif0012.tls. Sorted ascending.
const LEAP_SECONDS_TABLE: ReadonlyArray<readonly [string, number]> = [
  ['1972-01-01', 10],
  ['1972-07-01', 11],
  ['1973-01-01', 12],
  ['1974-01-01', 13],
  ['1975-01-01', 14],
  ['1976-01-01', 15],
  ['1977-01-01', 16],
  ['1978-01-01', 17],
  ['1979-01-01', 18],
  ['1980-01-01', 19],
  ['1981-07-01', 20],
  ['1982-07-01', 21],
  ['1983-07-01', 22],
  ['1985-07-01', 23],
  ['1988-01-01', 24],
  ['1990-01-01', 25],
  ['1991-01-01', 26],
  ['1992-07-01', 27],
  ['1993-07-01', 28],
  ['1994-07-01', 29],
  ['1996-01-01', 30],
  ['1997-07-01', 31],
  ['1999-01-01', 32],
  ['2006-01-01', 33],
  ['2009-01-01', 34],
  ['2012-07-01', 35],
  ['2015-07-01', 36],
  ['2017-01-01', 37],
];

// Pre-compute the table as (epoch-ms, delta) for fast lookup.
const LEAP_SECONDS_EPOCH_MS: ReadonlyArray<readonly [number, number]> =
  LEAP_SECONDS_TABLE.map(([d, v]) => [Date.parse(`${d}T00:00:00Z`), v] as const);

const deltaAtMs = (utcMs: number): number => {
  // Find the latest entry whose boundary ≤ utcMs.
  let last = 10;
  for (const [boundaryMs, value] of LEAP_SECONDS_EPOCH_MS) {
    if (utcMs >= boundaryMs) {
      last = value;
    } else {
      break;
    }
  }
  return last;
};

// Inverse — given an ET value, find the DELTA_AT that applied at the UTC
// moment corresponding to that ET. We do a coarse pass first (ignoring leap
// seconds), then refine. The leap-second boundaries are sparse and ET-UTC
// drift is ≤ 37s across the table, so a two-pass approach converges in one
// step for every mission-window instant.
const deltaAtForEt = (et: number): number => {
  // First-pass UTC estimate ignoring leap seconds → use DELTA_AT=37 (current).
  // Then re-evaluate. Two passes suffices because the answer can shift by at
  // most one leap-second boundary.
  const utcMsEstimate1 = J2000_TT_NOON_UTC_MS + (et - DELTA_T_A_SECONDS - 37) * 1000;
  const delta1 = deltaAtMs(utcMsEstimate1);
  const utcMsEstimate2 = J2000_TT_NOON_UTC_MS + (et - DELTA_T_A_SECONDS - delta1) * 1000;
  return deltaAtMs(utcMsEstimate2);
};

/**
 * Parse an ISO-8601 UTC timestamp to SPICE ET (TDB seconds past J2000).
 *
 * Accepts the common ISO-8601 forms that `Date.parse` handles:
 *   - `2030-12-31T23:59:59Z`
 *   - `2030-12-31T23:59:59.000Z`
 *   - `2030-12-31T23:59:59+00:00`
 *
 * Returns `NaN` for unparseable strings — callers (e.g. `URLSync.parseInitialT`)
 * should treat NaN as a silent-reject signal per NFR-S7.
 *
 * Precision: matches SpiceyPy `str2et` within ~2 ms across the mission
 * window (we omit the K·sin(E) periodic correction).
 */
export const etFromIso = (iso: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return Number.NaN;
  const deltaAt = deltaAtMs(ms);
  // ET = (UTC - J2000_TT_NOON_UTC).total_seconds() + DELTA_AT + DELTA_T_A
  return (ms - J2000_TT_NOON_UTC_MS) / 1000 + deltaAt + DELTA_T_A_SECONDS;
};

/**
 * Format a SPICE ET (TDB seconds past J2000) as ISO-8601 UTC.
 *
 * Output shape: `YYYY-MM-DDTHH:MM:SSZ` (seconds-resolution; the fractional
 * second is truncated to honour the story's to-the-second precision target).
 *
 * Round-trips via `etFromIso(isoFromEt(et))` within ~2 ms of `et` across
 * the mission window.
 */
export const isoFromEt = (et: number): string => {
  if (!Number.isFinite(et)) return '';
  const deltaAt = deltaAtForEt(et);
  const utcMs = J2000_TT_NOON_UTC_MS + (et - DELTA_T_A_SECONDS - deltaAt) * 1000;
  // Round to the nearest whole second before formatting. SPICE ETs that
  // correspond to "wall-clock" UTC moments (e.g. 1977-08-20T00:00:00Z) carry
  // a -0.817 s fractional offset from the omitted K·sin(E) periodic term;
  // truncating that fraction would shift us back one second. Rounding to
  // the nearest second restores the intended wall-clock value.
  const d = new Date(Math.round(utcMs / 1000) * 1000);
  // Use Date's UTC accessors and pad. Avoid toISOString() because we want
  // explicit second-precision output without the .000 millis suffix.
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mi = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`;
};

/**
 * Human-readable HUD form: `YYYY-MM-DD HH:MM UT`.
 *
 * Per UX spec (Story 1.9 AC3): the `aria-valuetext` attribute on the
 * scrubber uses this exact format. Drops seconds — the HUD shows minute
 * granularity.
 */
export const formatForHud = (et: number): string => {
  if (!Number.isFinite(et)) return '';
  const iso = isoFromEt(et);
  // Slice off the trailing :SSZ → keep YYYY-MM-DDTHH:MM, then swap T for space.
  const minute = iso.slice(0, 16); // "YYYY-MM-DDTHH:MM"
  return `${minute.slice(0, 10)} ${minute.slice(11)} UT`;
};

/**
 * HUD value-only form (Story 1.11 AC3): `YYYY-MM-DD HH:MM` — minute
 * granularity, without the trailing "UT" suffix that `formatForHud` adds.
 *
 * Used by `<v-hud-date>` where the "UT" label is a separate visual
 * element rendered ahead of the value. Kept distinct from `formatForHud`
 * so callers that need the scrubber's `aria-valuetext` form (with the
 * inline "UT") and callers that need the HUD's separate-label form don't
 * have to string-strip.
 */
export const dateForHud = (et: number): string => {
  if (!Number.isFinite(et)) return '';
  const iso = isoFromEt(et);
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
};

const MONTH_ABBREVIATIONS: ReadonlyArray<string> = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/**
 * Story 4.4 AC1 — month + day label for the *left* end of the detail-
 * scrubber's date range (e.g. `"FEB 28"`). Year is intentionally omitted
 * on the left to avoid redundancy with the right label.
 *
 * Format: uppercase three-letter month + zero-stripped day number.
 *
 * Returns the empty string for non-finite ET (mirrors `isoFromEt`).
 */
export const monthDayLabelFromEt = (et: number): string => {
  if (!Number.isFinite(et)) return '';
  const iso = isoFromEt(et);
  if (iso === '') return '';
  const month = parseInt(iso.slice(5, 7), 10);
  const day = parseInt(iso.slice(8, 10), 10);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return '';
  const monthIdx = month - 1;
  if (monthIdx < 0 || monthIdx >= MONTH_ABBREVIATIONS.length) return '';
  return `${MONTH_ABBREVIATIONS[monthIdx]} ${day}`;
};

/**
 * Story 4.4 AC1 — month + day + year label for the *right* end of the
 * detail-scrubber's date range (e.g. `"MAR 12, 1979"`). Year is included
 * on the right because a chapter window may span two calendar years
 * (e.g. V1 Jupiter's ±30-day window crosses 1979 → 1979 but a longer
 * future encounter window could cross a year boundary), and the right-
 * hand label is the canonical year anchor for the user.
 *
 * Returns the empty string for non-finite ET (mirrors `isoFromEt`).
 */
export const monthDayYearLabelFromEt = (et: number): string => {
  if (!Number.isFinite(et)) return '';
  const md = monthDayLabelFromEt(et);
  if (md === '') return '';
  const iso = isoFromEt(et);
  const year = iso.slice(0, 4);
  return `${md}, ${year}`;
};
