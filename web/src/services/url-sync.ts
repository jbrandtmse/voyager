/**
 * `URLSync` — bidirectional bridge between simulation state and the URL.
 *
 * Architecture line 315 describes the full URLSync service which handles:
 *   1. `?t=<iso>` time-anchor (Story 1.9 — this partial implementation)
 *   2. Per-chapter URL slug navigation (Story 2.4 — not yet implemented)
 *
 * This story implements (1) only. The slug half stays as a TODO for Story
 * 2.4; the class layout is designed so it can graft on without breaking
 * the `?t=` API.
 *
 * ## Key contracts
 *
 * - `parseInitialT()` reads `?t=` at boot and returns either the parsed ET
 *   or `MISSION_START_ET` with `valid: false` on any parse error or
 *   out-of-range value. NFR-S7: never surfaces an error to the user.
 *
 * - `writeEtThrottled(et)` updates the address bar via
 *   `history.replaceState` (NOT `pushState` — UX spec line 687, no browser
 *   history pollution). Coalesces calls within `URL_WRITEBACK_THROTTLE_MS`
 *   (250 ms) so a continuous drag emits at most one history write per
 *   throttle window.
 *
 * - `writeEtImmediate(et)` bypasses the throttle. Called on `pointerup`
 *   release so the final URL always reflects the released timestamp.
 *
 * - `flush()` is a test/teardown hook that fires any pending throttled
 *   write immediately and cancels the timer.
 *
 * ## Why a class, not free functions
 *
 * The throttle timer is mutable state. Wrapping it in a class keeps the
 * timer lifetime tied to an instance (one per app boot) and avoids the
 * module-level mutable-state smell.
 */

import { etFromIso, isoFromEt } from '../math/et-conversions';
import {
  MISSION_START_ET,
  MISSION_END_ET,
  URL_WRITEBACK_THROTTLE_MS,
} from '../constants/mission';

export interface ParseInitialTResult {
  /** Parsed ET if the URL was valid; otherwise `MISSION_START_ET`. */
  initialEt: number;
  /** False on missing / malformed / out-of-range `?t=`. */
  valid: boolean;
}

/**
 * Minimal window-shape the class needs. Injecting this (vs reading the
 * global `window`) lets tests substitute a fake `location` / `history`
 * without polluting jsdom's globals.
 */
export interface UrlSyncWindow {
  location: { search: string; pathname: string; hash: string };
  history: { replaceState: History['replaceState'] };
}

// Allow a 1-second slack on both ends. The mission ET endpoints are
// SpiceyPy-derived to TDB sub-second precision; a user URL like
// `?t=2030-12-31T23:59:59Z` parses to an ET slightly past MISSION_END_ET
// because we drop SPICE's K·sin(E) correction (peak ~1.657 ms). Without
// the slack the right boundary appears out-of-range. One second of slack
// is well within the to-the-second precision the story asks for.
const RANGE_SLACK_S = 1;
const isInRange = (et: number): boolean =>
  Number.isFinite(et) &&
  et >= MISSION_START_ET - RANGE_SLACK_S &&
  et <= MISSION_END_ET + RANGE_SLACK_S;

export class URLSync {
  private readonly win: UrlSyncWindow;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEt: number | null = null;

  constructor(win: UrlSyncWindow = window as unknown as UrlSyncWindow) {
    this.win = win;
  }

  /**
   * Read `?t=<iso>` from the current URL and resolve to an ET.
   *
   * Silent-reject contract (NFR-S7 / Story 1.9 AC7):
   *   - No `?t=` at all → returns `{ initialEt: MISSION_START_ET, valid: false }`.
   *     (The "valid: false" here means "the URL had no constraint", which is
   *     a perfectly normal cold-start state; callers can ignore it.)
   *   - `?t=` present but not parseable → returns
   *     `{ initialEt: MISSION_START_ET, valid: false }`. No error UI.
   *   - `?t=` present and parseable but outside `[MISSION_START_ET,
   *     MISSION_END_ET]` → same silent reject.
   */
  parseInitialT(): ParseInitialTResult {
    const params = new URLSearchParams(this.win.location.search);
    const raw = params.get('t');
    if (raw === null || raw === '') {
      return { initialEt: MISSION_START_ET, valid: false };
    }
    const et = etFromIso(raw);
    if (Number.isNaN(et)) {
      return { initialEt: MISSION_START_ET, valid: false };
    }
    if (!isInRange(et)) {
      return { initialEt: MISSION_START_ET, valid: false };
    }
    return { initialEt: et, valid: true };
  }

  /**
   * Throttle `replaceState` writes to at most one per
   * `URL_WRITEBACK_THROTTLE_MS` window (Story 1.9 AC6).
   *
   * Leading-edge semantics: the first call writes immediately and starts
   * the timer; subsequent calls within the window only update the most-
   * recent pending ET. On timer expiry, if a different ET is pending and
   * differs from the last-written value, write it and start a fresh
   * window. The trailing write counts toward the next window, never the
   * current one — so we never exceed one write per window.
   *
   * The `pointerup` release path uses `writeEtImmediate` to bypass this,
   * which guarantees the final URL reflects the released timestamp.
   */
  writeEtThrottled(et: number): void {
    if (this.throttleTimer === null) {
      this.writeNow(et);
      this.startThrottleWindow();
    } else {
      this.pendingEt = et;
    }
  }

  private startThrottleWindow(): void {
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      if (this.pendingEt !== null) {
        const flushTo = this.pendingEt;
        this.pendingEt = null;
        this.writeNow(flushTo);
        // The trailing write opens a fresh window — so a still-dragging
        // user sees ≤1 write per 250 ms over the whole drag.
        this.startThrottleWindow();
      }
    }, URL_WRITEBACK_THROTTLE_MS);
  }

  /**
   * Force-flush ET to the URL immediately, bypassing the throttle. Used
   * on `pointerup` release so the final URL always reflects the released
   * timestamp.
   *
   * Side effects: cancels any pending throttle timer.
   */
  writeEtImmediate(et: number): void {
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingEt = null;
    this.writeNow(et);
  }

  /**
   * Test / teardown hook: synchronously fire any pending write and reset
   * the throttle. No-op when nothing is pending.
   */
  flush(): void {
    if (this.throttleTimer === null) return;
    clearTimeout(this.throttleTimer);
    this.throttleTimer = null;
    if (this.pendingEt !== null) {
      const flushTo = this.pendingEt;
      this.pendingEt = null;
      this.writeNow(flushTo);
    }
  }

  private writeNow(et: number): void {
    const iso = isoFromEt(et);
    if (iso === '') return; // NaN/Infinity guard.
    const url = `${this.win.location.pathname}?t=${iso}${this.win.location.hash}`;
    this.win.history.replaceState(null, '', url);
  }
}
