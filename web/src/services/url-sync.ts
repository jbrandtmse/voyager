/**
 * `URLSync` — bidirectional bridge between simulation state and the URL.
 *
 * Architecture line 315 describes the full URLSync service which handles:
 *   1. `?t=<iso>` time-anchor (Story 1.9)
 *   2. Per-chapter URL slug navigation (Story 2.4)
 *
 * ## Key contracts
 *
 * - `parseInitialT()` reads `?t=` at boot and returns either the parsed ET
 *   or `MISSION_START_ET` with `valid: false` on any parse error or
 *   out-of-range value. NFR-S7: never surfaces an error to the user.
 *
 * - `parseInitialPath()` reads `/c/<slug>` at boot and returns the matched
 *   `ChapterSpec` plus a derived initialEt. Unknown slugs trigger a
 *   `console.warn` + redirect to `/` via `replaceState`; falls back to
 *   `parseInitialT()` semantics for the homepage route.
 *
 * - **Story 2.5 — embed=true preservation.** When the URLSync is
 *   constructed with `{ embedEnabled: true }` (boot-time captured from
 *   `?embed=true`), every URL writeback (chapter pushState, chapter
 *   replaceState, home replaceState, throttled `?t=`, immediate `?t=`,
 *   unknown-slug redirect) appends `&embed=true` so kiosks deep-linking
 *   with the parameter see it survive a back-then-forward sequence and
 *   any director-driven boundary crossing. Strict-boolean parse owned
 *   by `embed-mode-state.ts`.
 *
 * - `writeEtThrottled(et)` updates `?t=` via `history.replaceState`
 *   (UX spec line 687, no browser history pollution). Coalesces calls
 *   within `URL_WRITEBACK_THROTTLE_MS` (250 ms) so a continuous drag emits
 *   at most one history write per throttle window. The path component
 *   `/c/<slug>` is preserved during free scrubbing within a chapter (AC4).
 *
 * - `writeEtImmediate(et)` bypasses the throttle. Called on `pointerup`
 *   release so the final URL always reflects the released timestamp.
 *
 * - `writeChapterPushState(slug, anchorEt)` adds a navigable history
 *   entry for user-driven chapter activations (marker click, listbox
 *   Enter, digit shortcut) — Story 2.4 AC3.
 *
 * - `writeChapterReplaceState(slug, et)` updates the path without history
 *   pollution for director-driven boundary crossings during free scrub
 *   (Story 2.4 AC5).
 *
 * - `writeHomeReplaceState(et)` reverts the path to `/` + `?t=` when ET
 *   falls between chapter windows (cruise period — Story 2.4 AC5).
 *
 * - `installPopstateHandler(cb)` registers the browser back/forward
 *   handler which re-parses the URL and routes the result to the caller
 *   (Story 2.4 AC8c).
 *
 * - `flush()` is a test/teardown hook that fires any pending throttled
 *   write immediately and cancels the timer.
 *
 * ## Why a class, not free functions
 *
 * The throttle timer + popstate subscription are mutable state. Wrapping
 * them in a class keeps the lifetime tied to an instance (one per app
 * boot).
 */

import { etFromIso, isoFromEt } from '../math/et-conversions';
import {
  MISSION_START_ET,
  MISSION_END_ET,
  URL_WRITEBACK_THROTTLE_MS,
} from '../constants/mission';
import type { ChapterSpec } from '../types/chapter';
import { findChapterBySlug } from '../chapters/registry';

export interface ParseInitialTResult {
  /** Parsed ET if the URL was valid; otherwise `MISSION_START_ET`. */
  initialEt: number;
  /** False on missing / malformed / out-of-range `?t=`. */
  valid: boolean;
}

/**
 * Result of parsing the boot-time URL path + query together. Encodes the
 * three legal initial states:
 *
 *   - `/` (or `/?t=<iso>`) — `chapter === null`; `initialEt` is either the
 *     parsed ?t= or `MISSION_START_ET`.
 *   - `/c/<known-slug>` (optional `?t=`) — `chapter` is the resolved
 *     `ChapterSpec`; `initialEt` is the parsed ?t= or the chapter's
 *     `anchorEt` if ?t= was missing.
 *   - `/c/<unknown-slug>` — the constructor `replaceState`-rewrites the
 *     URL to `/` and the parse falls through to the homepage branch.
 *     A `console.warn` is emitted per NFR-S7. `chapter === null`.
 *
 * `tInRange` distinguishes "no ?t= given (fell back to anchor / start)"
 * from "?t= given AND in range". Out-of-range ?t= values are STILL
 * accepted on chapter routes per AC2 ("the simulation STILL initializes
 * at the requested ET") — ChapterDirector recomputes activeChapter on
 * the next frame.
 */
export interface ParseInitialPathResult {
  chapter: ChapterSpec | null;
  initialEt: number;
  /** Whether ?t= was present AND parseable as a finite ISO value. */
  hadValidT: boolean;
}

/**
 * Minimal window-shape the class needs. Injecting this (vs reading the
 * global `window`) lets tests substitute a fake `location` / `history`
 * without polluting jsdom's globals.
 *
 * Story 2.4 extends the shape with `pushState`, `popstate` listener
 * registration (`addEventListener` / `removeEventListener`), and an
 * optional `console.warn` for the unknown-slug silent-reject path.
 */
export interface UrlSyncWindow {
  location: { search: string; pathname: string; hash: string };
  history: {
    replaceState: History['replaceState'];
    pushState?: History['pushState'];
  };
  addEventListener?: (
    type: 'popstate',
    listener: (e: PopStateEvent) => void,
  ) => void;
  removeEventListener?: (
    type: 'popstate',
    listener: (e: PopStateEvent) => void,
  ) => void;
}

/**
 * `popstate` callback shape. Receives the URL state after the navigation
 * has applied (browser back/forward). The handler is the caller's hook
 * to drive ClockManager.scrubTo + observe ChapterDirector transitions.
 *
 * `chapter` is `null` for the homepage form (`/?t=...`). `initialEt`
 * defaults to the chapter's anchorEt (chapter route) or
 * `MISSION_START_ET` (homepage) when `?t=` is absent.
 */
export type PopstateCallback = (state: ParseInitialPathResult) => void;

/** Slug match for `/c/<slug>` paths. */
const CHAPTER_PATH_PATTERN = /^\/c\/([^/?#]+)\/?$/;

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

/**
 * Story 2.5 — boot-time options for URLSync. `embedEnabled`, when set
 * to `true`, causes every writeback to append `&embed=true` so kiosks
 * deep-linking with `?embed=true` see the parameter survive across
 * chapter pushState, free-scrub replaceState, director boundary
 * crossings, and unknown-slug redirects. The flag is captured at boot
 * from the URL and never mutated (matches `EmbedModeState`'s
 * immutability contract — the kiosk's parent shell decides at
 * navigation time).
 */
export interface UrlSyncOptions {
  win?: UrlSyncWindow;
  /**
   * Story 2.5 — when true, every URL writeback appends `&embed=true`.
   * Wire from `EmbedModeState.fromSearch(location.search).enabled` at
   * boot. Defaults to false.
   */
  embedEnabled?: boolean;
}

export class URLSync {
  private readonly win: UrlSyncWindow;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEt: number | null = null;
  /**
   * The path component to use for `?t=` writes. Updated when the chapter
   * route changes; defaults to whatever the URL had at construction time.
   * Storing this as a field (instead of re-reading `location.pathname`
   * each write) lets us atomically update the path + query together via
   * a single replaceState call when the chapter changes.
   */
  private currentPath: string;
  /**
   * Pending popstate handler (one per URLSync instance). Stored so
   * `dispose()` can detach it from the window.
   */
  private popstateListener: ((e: PopStateEvent) => void) | null = null;
  /**
   * Story 2.5 — boot-captured embed flag. When true, every writeback URL
   * appends `&embed=true`. Immutable for the URLSync's lifetime.
   */
  private readonly embedEnabled: boolean;

  /**
   * Backwards-compatible constructor: callers may pass either a
   * `UrlSyncWindow` directly (Story 1.9 / 2.4 sites) or a
   * `UrlSyncOptions` object (Story 2.5 — to carry the `embedEnabled`
   * flag).
   */
  constructor(
    arg: UrlSyncWindow | UrlSyncOptions = window as unknown as UrlSyncWindow,
  ) {
    const isOptions =
      // UrlSyncWindow always exposes `location` + `history`. Treat any
      // object that has those as the window form; otherwise interpret as
      // options. UrlSyncOptions may also include `win`, but never both
      // shapes' fields at once in normal usage.
      arg !== null &&
      typeof arg === 'object' &&
      !('location' in arg);
    const opts: UrlSyncOptions = isOptions ? (arg as UrlSyncOptions) : {};
    const win = isOptions
      ? (opts.win ?? (window as unknown as UrlSyncWindow))
      : (arg as UrlSyncWindow);
    this.win = win;
    this.currentPath = this.win.location.pathname;
    this.embedEnabled = opts.embedEnabled === true;
  }

  /**
   * Story 2.5 — append `&embed=true` (or `?embed=true` if no other
   * query is present) to a URL path-with-optional-query when embed mode
   * is enabled. No-op when `embedEnabled === false`.
   *
   * The input may already contain a `?...` query string (e.g.
   * `/c/v2-neptune?t=1989-08-25T09:23:00Z`) or be query-less
   * (e.g. `/`). Hash fragments (`#...`) are preserved at the end if
   * the caller embeds them in the input.
   */
  private appendEmbed(url: string): string {
    if (!this.embedEnabled) return url;
    // Split off any hash so we can re-append it after the embed param.
    const hashIdx = url.indexOf('#');
    const hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
    const noHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    const sep = noHash.includes('?') ? '&' : '?';
    return `${noHash}${sep}embed=true${hash}`;
  }

  /**
   * Variant of `appendEmbed` for URLs that may ALREADY contain
   * `embed=true` (e.g. the unknown-slug redirect path which forwards the
   * raw `location.search`). Avoids producing `?embed=true&embed=true`.
   */
  private appendEmbedIfMissing(url: string): string {
    if (!this.embedEnabled) return url;
    const hashIdx = url.indexOf('#');
    const noHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    const queryIdx = noHash.indexOf('?');
    if (queryIdx >= 0) {
      const query = noHash.slice(queryIdx + 1);
      const params = new URLSearchParams(query);
      if (params.get('embed') === 'true') return url;
    }
    return this.appendEmbed(url);
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
   * Read the full URL (path + query) at boot and resolve to a chapter +
   * initial ET. Drives the `/c/<slug>` route shape per Story 2.4 AC1+AC2.
   *
   * Semantics:
   *   - Path `/` (or anything not matching `/c/<slug>`) → `chapter: null`;
   *     `initialEt` comes from `parseInitialT()`.
   *   - Path `/c/<known-slug>` → `chapter` set, `initialEt` = parsed ?t=
   *     (if any finite ISO, even out-of-range — per AC2 "the simulation
   *     STILL initializes at the requested ET") or the chapter's anchorEt.
   *   - Path `/c/<unknown-slug>` → emits a console.warn, replaceStates the
   *     URL to `/`, then falls through to the homepage branch.
   *
   * NFR-S7 contract: any malformed input silently falls back to safe
   * defaults; no error UI surfaces.
   */
  parseInitialPath(): ParseInitialPathResult {
    const match = CHAPTER_PATH_PATTERN.exec(this.win.location.pathname);
    if (match === null) {
      // Homepage / other paths — defer to ?t= for the initial ET.
      const t = this.parseInitialT();
      return { chapter: null, initialEt: t.initialEt, hadValidT: t.valid };
    }
    const slug = match[1] ?? '';
    const chapter = findChapterBySlug(slug);
    if (chapter === null) {
      // Unknown slug — silent reject per NFR-S7. Rewrite the URL to '/'
      // (preserving ?t= so the user's intended timestamp survives if
      // they navigated `/c/typo?t=<valid-iso>`).
      console.warn(
        `[URLSync] Unknown chapter slug "${slug}" — redirecting to homepage`,
      );
      const search = this.win.location.search;
      // Story 2.5 — the user's ?embed=true intent survives the redirect.
      // The URL we construct from the raw `location.search` already
      // contains embed=true if it was on the source URL, so we don't
      // need to re-append it here; we DO need to re-append when the
      // embed param was implicit (the URLSync's boot-time captured
      // embed flag) but the source URL stripped it via canonicalization.
      // Most kiosks carry embed=true through `location.search`, so the
      // typical path passes through cleanly.
      const baseUrl = `/${search}${this.win.location.hash}`;
      this.win.history.replaceState(null, '', this.appendEmbedIfMissing(baseUrl));
      this.currentPath = '/';
      const t = this.parseInitialT();
      return { chapter: null, initialEt: t.initialEt, hadValidT: t.valid };
    }
    // Known chapter slug. Adopt the path for future ?t= writes.
    this.currentPath = `/c/${chapter.slug}`;
    const params = new URLSearchParams(this.win.location.search);
    const rawT = params.get('t');
    if (rawT === null || rawT === '') {
      return { chapter, initialEt: chapter.anchorEt, hadValidT: false };
    }
    const et = etFromIso(rawT);
    if (Number.isNaN(et)) {
      // Malformed ?t= on a chapter route → fall back to anchorEt per AC2.
      return { chapter, initialEt: chapter.anchorEt, hadValidT: false };
    }
    // AC2 explicitly accepts out-of-window ETs on chapter routes — the
    // user requested that timestamp, ChapterDirector recomputes
    // activeChapter on the next frame.
    return { chapter, initialEt: et, hadValidT: true };
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
    const url = this.appendEmbed(
      `${this.currentPath}?t=${iso}${this.win.location.hash}`,
    );
    this.win.history.replaceState(null, '', url);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Story 2.4 — chapter-slug writeback + popstate routing
  // ─────────────────────────────────────────────────────────────────────

  /**
   * User-driven chapter activation (marker click, listbox Enter, digit
   * shortcut) → push a NEW history entry so the browser back button
   * returns to the prior route. AC3.
   *
   * Cancels any pending throttled `?t=` write so the next history entry
   * starts from the new path cleanly. Also updates `currentPath` so
   * subsequent `?t=` writes target the new chapter route.
   */
  writeChapterPushState(slug: string, anchorEt: number): void {
    if (slug === '') return; // Defensive — should never happen.
    // Drop any pending throttled write — its target path may be stale.
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingEt = null;
    const iso = isoFromEt(anchorEt);
    const isoSegment = iso === '' ? '' : `?t=${iso}`;
    const url = this.appendEmbed(
      `/c/${slug}${isoSegment}${this.win.location.hash}`,
    );
    this.currentPath = `/c/${slug}`;
    const push = this.win.history.pushState;
    if (typeof push === 'function') {
      push.call(this.win.history, null, '', url);
    } else {
      // Test stubs that don't model pushState fall back to replaceState;
      // production browsers always provide pushState.
      this.win.history.replaceState(null, '', url);
    }
  }

  /**
   * Director-driven chapter boundary crossing during free scrub — update
   * the path WITHOUT polluting browser history. AC5.
   *
   * Identical visible URL change to `writeChapterPushState` but the user
   * cannot back-button to the prior path; mid-scrub crossings are not
   * navigation events.
   */
  writeChapterReplaceState(slug: string, et: number): void {
    if (slug === '') return;
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingEt = null;
    const iso = isoFromEt(et);
    const isoSegment = iso === '' ? '' : `?t=${iso}`;
    const url = this.appendEmbed(
      `/c/${slug}${isoSegment}${this.win.location.hash}`,
    );
    this.currentPath = `/c/${slug}`;
    this.win.history.replaceState(null, '', url);
  }

  /**
   * The simulation ET has crossed into a cruise period outside any
   * chapter window — revert the path to `/` + `?t=`. AC5.
   *
   * `replaceState` (not `pushState`): the user did not navigate; the
   * director observed an ET boundary.
   */
  writeHomeReplaceState(et: number): void {
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingEt = null;
    const iso = isoFromEt(et);
    const isoSegment = iso === '' ? '' : `?t=${iso}`;
    const url = this.appendEmbed(`/${isoSegment}${this.win.location.hash}`);
    this.currentPath = '/';
    this.win.history.replaceState(null, '', url);
  }

  /**
   * Subscribe to browser back/forward navigations. The supplied callback
   * receives the re-parsed URL state — the caller drives
   * `clockManager.scrubTo(...)` and lets `ChapterDirector.update(et)`
   * settle on the next frame.
   *
   * Returns an unsubscribe function. AC8c.
   *
   * Idempotent for the same URLSync instance: a second call replaces
   * the previous listener.
   */
  installPopstateHandler(cb: PopstateCallback): () => void {
    this.detachPopstate();
    const listener = (_e: PopStateEvent): void => {
      // Re-parse the URL after the navigation has applied. We re-run
      // parseInitialPath so unknown slugs (e.g. forward to a removed
      // page) still hit the silent-reject path.
      this.currentPath = this.win.location.pathname;
      const result = this.parseInitialPath();
      try {
        cb(result);
      } catch (err) {
        // A throwing handler must not poison subsequent navigations.
        console.error('[URLSync] popstate handler threw:', err);
      }
    };
    this.popstateListener = listener;
    if (typeof this.win.addEventListener === 'function') {
      this.win.addEventListener('popstate', listener);
    }
    return () => {
      this.detachPopstate();
    };
  }

  private detachPopstate(): void {
    if (this.popstateListener === null) return;
    if (typeof this.win.removeEventListener === 'function') {
      this.win.removeEventListener('popstate', this.popstateListener);
    }
    this.popstateListener = null;
  }

  /** Test / teardown hook: detach popstate and flush any pending write. */
  dispose(): void {
    this.detachPopstate();
    this.flush();
  }
}
