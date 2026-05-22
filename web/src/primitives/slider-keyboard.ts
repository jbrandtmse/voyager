/**
 * APG Slider keyboard primitive.
 *
 * Implements the keyboard contract from the WAI-ARIA Authoring Practices
 * Guide's Slider pattern:
 *
 *   https://www.w3.org/WAI/ARIA/apg/patterns/slider/
 *
 *   ArrowLeft / ArrowRight   Step the value by ±stepSmall.
 *   Shift+ArrowLeft/Right    Step the value by ±stepLarge.
 *   Home                     Jump to `valueMin`.
 *   End                      Jump to `valueMax`.
 *
 * All five keys preventDefault() so the browser's native scroll-step does
 * not also fire. Up/Down arrows are intentionally NOT handled here — the
 * single-axis Voyager scrubbers use only left/right, and Up/Down on a
 * focused slider in some user-agent layers would scroll the page instead.
 *
 * The primitive is a pure handler factory: it returns a
 * `(e: KeyboardEvent) => void` that the component installs via Lit's
 * `@keydown=${...}` template binding (or `addEventListener` for non-Lit
 * consumers). It contains NO state — the consumer owns the current value,
 * the side effects (`onChange`, `onStart`, `onEnd`), and any URL writeback
 * or play/pause coordination.
 *
 * ## ADR-0025 compliance
 *
 * Per ADR-0025 § "Decision", the primitive belongs at
 * `web/src/primitives/slider-keyboard.ts` (this file) and components
 * "compose primitives via mixin or delegation — no APG keyboard logic
 * embedded directly in component code." Story 3.0 AC4 path (a) extracts
 * this primitive out of `<v-timeline-scrubber>`'s inline `onKeyDown` so
 * the obligation is satisfied. Future slider-style components
 * (`<v-speed-multiplier>` per ADR-0025 line 30) are expected to consume
 * the same primitive.
 */

/** Options passed to `createSliderKeyboardHandler`. */
export interface SliderKeyboardOptions {
  /**
   * Read the current value at handle-fire time. Pulled lazily so the
   * primitive does not snapshot stale state — important for the scrubber
   * where the value is owned by a separately-mutating `ClockManager`.
   */
  getValue: () => number;
  /** Minimum value (Home jumps here). */
  valueMin: number;
  /** Maximum value (End jumps here). */
  valueMax: number;
  /** Small step (ArrowLeft / ArrowRight without modifier). */
  stepSmall: number;
  /** Large step (Shift+ArrowLeft / Shift+ArrowRight). */
  stepLarge: number;
  /** Callback invoked with the next value after clamping to [min, max]. */
  onChange: (next: number) => void;
  /** Optional: notify the consumer that a scrub gesture has begun (debounce hook). */
  onStart?: () => void;
  /** Optional: notify the consumer that a scrub gesture has ended (resume hook). */
  onEnd?: () => void;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Build a keydown handler implementing the APG Slider contract.
 *
 * Returns `(e: KeyboardEvent) => void`. The handler does nothing (and does
 * NOT call preventDefault) for keys outside the APG contract — the parent
 * keydown listener is free to handle them.
 */
export const createSliderKeyboardHandler = (
  options: SliderKeyboardOptions,
): ((e: KeyboardEvent) => void) => {
  return (e: KeyboardEvent): void => {
    let delta = 0;
    let absolute: number | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        delta = e.shiftKey ? -options.stepLarge : -options.stepSmall;
        break;
      case 'ArrowRight':
        delta = e.shiftKey ? options.stepLarge : options.stepSmall;
        break;
      case 'Home':
        absolute = options.valueMin;
        break;
      case 'End':
        absolute = options.valueMax;
        break;
      default:
        return;
    }
    e.preventDefault();
    options.onStart?.();
    const current = options.getValue();
    const next = absolute !== null ? absolute : current + delta;
    options.onChange(clamp(next, options.valueMin, options.valueMax));
    options.onEnd?.();
  };
};
