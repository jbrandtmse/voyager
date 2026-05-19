/**
 * Voyager responsive breakpoints — JS-side constants.
 *
 * Mirrors the three structural breakpoints declared in breakpoints.css and
 * the --v-bp-* tokens in tokens.css. Use these in TS when wiring up
 * `window.matchMedia(...)` listeners.
 *
 * UX spec §Responsive Breakpoint Strategy; NFR-C3.
 */

export const BREAKPOINTS = {
  /** Phones (Tier 3): width <= 767 px. */
  mobile: 767,
  /** Tablets (Tier 2): width <= 1023 px. */
  tablet: 1023,
  /** Large desktop / wide (Tier 0): width >= 1920 px. */
  wide: 1920,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** Build the matchMedia query string that pairs with a structural tier. */
export const BREAKPOINT_QUERIES: Readonly<Record<BreakpointName, string>> = {
  mobile: `(max-width: ${BREAKPOINTS.mobile}px)`,
  tablet: `(max-width: ${BREAKPOINTS.tablet}px)`,
  wide: `(min-width: ${BREAKPOINTS.wide}px)`,
};
