/**
 * Cadence-aware keyboard step helper for the encounter detail scrubber
 * (Story 4.4 AC5).
 *
 * The `<v-timeline-scrubber variant="detail">` consumes
 * `createSliderKeyboardHandler` from `web/src/primitives/slider-keyboard.ts`
 * (ADR-0025 / Rule 9 obligation). For the mission variant the step sizes
 * are constants (1 day / 10 days). For the detail variant they are a
 * function of the cursor's position within the encounter window — the
 * user expects finer-grained control as the cursor approaches closest
 * approach.
 *
 * The tiers mirror Story 4.3's bake-side `CADENCE_BANDS` table in
 * `bake/src/bake_trajectories.py:CADENCE_BANDS`:
 *
 *   hourly    ±30 days from anchor    3600 s (1 hour)
 *   1min       ±2 days from anchor      60 s (1 minute)
 *   10sec      ±1 hour from anchor      10 s (10 seconds)
 *
 * If the bake's `CADENCE_BANDS` ever change, this module changes too —
 * single source of truth principle (Rule 5 in spirit).
 *
 * The helper returns BOTH the small and large steps; the large step is
 * the small step × 10 per the APG-Slider Shift+Arrow contract.
 *
 * The helper is intentionally cursor-position-driven (NOT chapter-event
 * driven). The `createSliderKeyboardHandler` factory snapshots its
 * `stepSmall` / `stepLarge` numbers at construction time — to honour
 * AC5's "responds to the current cursor position" clause, the consumer
 * MUST call `cadenceAwareStep(getValue(), activeChapter)` at handler-
 * fire time (e.g. by rebuilding the handler when the chapter changes,
 * or by passing through a getter-driven `getValue` that incorporates
 * the tier in its returned step).
 *
 * Per AC5 Rule 9, the canonical wiring used by the scrubber is to
 * rebuild the handler whenever the active chapter changes; inside a
 * single chapter the tier is recomputed on every keystroke by reading
 * `getValue()` again and comparing against the chapter anchor.
 *
 * Out-of-window cursor positions (`Math.abs(et - chapter.anchorEt) >
 * 30 days`) fall through to the cruise refinement tier (`hourly`).
 */

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;

/**
 * Cadence tiers — exported for tests. The order matters: tighter windows
 * appear first so the lookup picks the most specific match.
 */
export interface CadenceBand {
  /** Maximum |et - anchor| (seconds) at which this band applies. */
  readonly halfWindowSeconds: number;
  /** Small step (single ArrowLeft / ArrowRight) in seconds. */
  readonly stepSmall: number;
  /** Large step (Shift + Arrow) in seconds — always `stepSmall * 10`. */
  readonly stepLarge: number;
}

/**
 * Story 4.4 AC5 — cadence-band table, source-of-truth alignment with
 * `bake/src/bake_trajectories.py:CADENCE_BANDS`. The bake's table omits
 * the large-step column because the bake samples at a single cadence
 * per band; the slider uses 10× as the Shift-multiplier per APG-Slider.
 */
export const CADENCE_BANDS: ReadonlyArray<CadenceBand> = [
  // 10sec: ±1 hour
  {
    halfWindowSeconds: SECONDS_PER_HOUR,
    stepSmall: 10,
    stepLarge: 100,
  },
  // 1min: ±2 days
  {
    halfWindowSeconds: 2 * SECONDS_PER_DAY,
    stepSmall: 60,
    stepLarge: 600,
  },
  // hourly: ±30 days
  {
    halfWindowSeconds: 30 * SECONDS_PER_DAY,
    stepSmall: SECONDS_PER_HOUR,
    stepLarge: SECONDS_PER_HOUR * 10,
  },
];

/** Default fallback when no band matches — cruise refinement (1-hour step). */
const FALLBACK_BAND: CadenceBand = CADENCE_BANDS[CADENCE_BANDS.length - 1];

export interface CadenceAwareStepResult {
  /** Step size for unmodified ArrowLeft / ArrowRight (seconds). */
  readonly stepSmall: number;
  /** Step size for Shift+ArrowLeft / Shift+ArrowRight (seconds). */
  readonly stepLarge: number;
}

/**
 * Compute the small + large keyboard step sizes for the detail scrubber
 * at the given cursor ET and anchor ET.
 *
 * Selection rule: the tightest band whose `halfWindowSeconds` contains
 * `|et - anchorEt|`. Out-of-window cursor positions (no band matches)
 * fall back to the loosest band (hourly).
 *
 * @example
 *   cadenceAwareStep(anchorEt + 30 * 60, anchorEt)        // 30 minutes from anchor
 *     ⇒ { stepSmall: 10, stepLarge: 100 }                  // 10sec tier
 *
 *   cadenceAwareStep(anchorEt + 12 * 3600, anchorEt)      // 12 hours from anchor
 *     ⇒ { stepSmall: 60, stepLarge: 600 }                  // 1min tier
 *
 *   cadenceAwareStep(anchorEt + 10 * 86400, anchorEt)     // 10 days from anchor
 *     ⇒ { stepSmall: 3600, stepLarge: 36000 }              // hourly tier
 */
export const cadenceAwareStep = (
  et: number,
  anchorEt: number,
): CadenceAwareStepResult => {
  if (!Number.isFinite(et) || !Number.isFinite(anchorEt)) {
    return { stepSmall: FALLBACK_BAND.stepSmall, stepLarge: FALLBACK_BAND.stepLarge };
  }
  const dt = Math.abs(et - anchorEt);
  for (const band of CADENCE_BANDS) {
    if (dt <= band.halfWindowSeconds) {
      return { stepSmall: band.stepSmall, stepLarge: band.stepLarge };
    }
  }
  return { stepSmall: FALLBACK_BAND.stepSmall, stepLarge: FALLBACK_BAND.stepLarge };
};
