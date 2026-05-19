/**
 * `formatAU(au)` — human-readable HUD distance string (Story 1.11 AC4).
 *
 * Output: `"<value> AU"`. The decimal precision shrinks as the magnitude
 * grows so the readout fits in the HUD column without jitter as values
 * tick under per-frame mutation:
 *
 *   value < 10   → 2 decimals  ("5.20 AU", "0.05 AU")
 *   value < 100  → 1 decimal   ("50.3 AU")
 *   value ≥ 100  → integer     ("165 AU", "121 AU")
 *
 * Negative inputs (V1/V2 cannot have them, but the helper is pure) format
 * via their magnitude — a leading `-` is preserved. Non-finite inputs
 * return an em-dash placeholder so the HUD reads "— AU" without throwing.
 *
 * The module is pure / DOM-free; callers may use it from any context.
 */

const EM_DASH = '—';

export const formatAU = (au: number): string => {
  if (!Number.isFinite(au)) return `${EM_DASH} AU`;
  const sign = au < 0 ? '-' : '';
  const v = Math.abs(au);
  let numStr: string;
  if (v < 10) {
    numStr = v.toFixed(2);
  } else if (v < 100) {
    numStr = v.toFixed(1);
  } else {
    numStr = Math.round(v).toString();
  }
  return `${sign}${numStr} AU`;
};
