/**
 * `formatSpeedReadout(rate)` — produce the visible speed-multiplier label
 * for `<v-speed-multiplier>` (Story 1.10 AC4).
 *
 * Output: `"{N}× — {duration/sec}"` where the duration term picks the
 * largest sensible unit so 1 second of wall-clock at the given rate reads
 * as a human-scale interval.
 *
 * ## Unit ladder
 *
 *   rate  →  sim-time advanced per 1 wall-sec  →  formatted duration
 *   ----   ---------------------------------     ------------------
 *      1   1 sec                                 "1 sec/sec"
 *     60   60 sec  → 1 min                       "1 min/sec"
 *   3600   3600 sec → 1 hour                     "1 hour/sec"
 *  86400   86400 sec → 1 day                     "1 day/sec"
 * 604800   604800 sec → 1 week                   "1 week/sec"
 *
 * Between decade-decimal boundaries the rate is reported in the larger
 * unit with one decimal place (e.g. 10000× → "2.78 hours/sec",
 * 1000000× → "~11.6 days/sec"). Numbers are comma-grouped per locale.
 *
 * The function is pure and side-effect-free; it does NOT depend on the
 * current locale, only `Intl.NumberFormat('en-US')` for thousands
 * separators. This keeps the rendered readout deterministic for tests
 * and for visual regression diffing.
 */

const SECONDS_PER_MIN = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_WEEK = 604_800;
const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY; // Julian year for consistency with ET math.
const SECONDS_PER_MONTH = SECONDS_PER_YEAR / 12;

const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Format the multiplier prefix as a comma-grouped integer with trailing ×. */
const formatMultiplier = (rate: number): string => {
  return `${numberFmt.format(Math.round(rate))}×`;
};

interface UnitPick {
  /** Numeric value in the chosen unit. */
  value: number;
  /** Singular unit label. Plural is `value === 1` else `${unit}s`. */
  unit: 'sec' | 'min' | 'hour' | 'day' | 'week' | 'month' | 'year';
}

const pickUnit = (totalSeconds: number): UnitPick => {
  // Prefer the largest unit whose value is ≥ 1 to keep the readout compact.
  // Boundaries align with the decade-test examples in AC4.
  //
  // Special case: the `week` unit is used ONLY when the value lands close to
  // a small whole number of weeks (1–3.5). Above that, defer to `day` until
  // the month boundary so 1M× reads "~11.6 days/sec" per AC4 rather than
  // "1.65 weeks/sec". Per the story's example table the week label is for
  // round 1× values; off-boundary multiples drop back to days.
  if (totalSeconds < SECONDS_PER_MIN) return { value: totalSeconds, unit: 'sec' };
  if (totalSeconds < SECONDS_PER_HOUR) {
    return { value: totalSeconds / SECONDS_PER_MIN, unit: 'min' };
  }
  if (totalSeconds < SECONDS_PER_DAY) {
    return { value: totalSeconds / SECONDS_PER_HOUR, unit: 'hour' };
  }
  if (totalSeconds < SECONDS_PER_MONTH) {
    const weeks = totalSeconds / SECONDS_PER_WEEK;
    const wholeWeek = Math.abs(weeks - Math.round(weeks)) < 0.01 && weeks <= 3.5;
    if (wholeWeek && weeks >= 1) {
      return { value: weeks, unit: 'week' };
    }
    return { value: totalSeconds / SECONDS_PER_DAY, unit: 'day' };
  }
  if (totalSeconds < SECONDS_PER_YEAR) {
    return { value: totalSeconds / SECONDS_PER_MONTH, unit: 'month' };
  }
  return { value: totalSeconds / SECONDS_PER_YEAR, unit: 'year' };
};

const formatUnit = (pick: UnitPick): string => {
  // Integer rates that fall exactly on a unit boundary render whole-number
  // form ("1 hour/sec"); off-boundary rates render with up to two decimal
  // places, stripping trailing zeros ("2.78 hours/sec", "5.6 secs/sec").
  // The 0.01 tolerance treats sub-percent drift as a whole number — guards
  // floating-point error on 60×, 3600×, etc.
  const isWhole = Math.abs(pick.value - Math.round(pick.value)) < 0.01;
  let numberStr: string;
  if (isWhole) {
    numberStr = numberFmt.format(Math.round(pick.value));
  } else {
    // Up to 2 decimals; trim trailing zeros via parseFloat round-trip.
    numberStr = parseFloat(pick.value.toFixed(2)).toString();
  }
  const plural =
    Math.round(pick.value) === 1 && isWhole ? pick.unit : `${pick.unit}s`;
  return `${numberStr} ${plural}/sec`;
};

/**
 * Format the visible readout for a playback rate.
 *
 * @example
 *   formatSpeedReadout(1)        // "1× — 1 sec/sec"
 *   formatSpeedReadout(60)       // "60× — 1 min/sec"
 *   formatSpeedReadout(3600)     // "3,600× — 1 hour/sec"
 *   formatSpeedReadout(86400)    // "86,400× — 1 day/sec"
 *   formatSpeedReadout(604800)   // "604,800× — 1 week/sec"
 *   formatSpeedReadout(1_000_000)// "1,000,000× — 11.57 days/sec"
 */
export const formatSpeedReadout = (rate: number): string => {
  if (!Number.isFinite(rate) || rate <= 0) {
    return '0× — paused';
  }
  const mult = formatMultiplier(rate);
  // 1 wall-second of real time advances `rate` sim-seconds at the chosen rate.
  const pick = pickUnit(rate);
  return `${mult} — ${formatUnit(pick)}`;
};
