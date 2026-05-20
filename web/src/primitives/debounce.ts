/**
 * `debounce(fn, ms)` — coalesce rapid calls into a single trailing invocation
 * (Story 1.11 Task 11).
 *
 * Used by the HUD's aria-live mirror to coalesce per-frame scrub events
 * down to one polite announcement after the user stops scrubbing (AC6 —
 * 500ms window). The returned function has the same signature as `fn`
 * and exposes `cancel()` so callers can tear down before the trailing
 * call fires (e.g. on `disconnectedCallback`).
 *
 * Semantics:
 *   - Trailing-only (no leading call). Each invocation resets the timer.
 *   - `cancel()` clears the pending trailing call. Idempotent.
 *   - Uses `setTimeout` / `clearTimeout` so fake timers work in tests.
 *   - Pure: no module-scope state, one timer per debounced fn.
 *
 * The arguments to the *last* invocation are the ones the trailing call
 * receives. Earlier-call arguments are dropped — typical debounce
 * contract.
 */

export interface Debounced<TArgs extends unknown[]> {
  (...args: TArgs): void;
  /** Cancel the pending trailing invocation (if any). */
  cancel(): void;
}

export const debounce = <TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  ms: number,
): Debounced<TArgs> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: TArgs | null = null;

  const debounced = ((...args: TArgs): void => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const a = lastArgs;
      lastArgs = null;
      if (a !== null) fn(...a);
    }, ms);
  }) as Debounced<TArgs>;

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  return debounced;
};
