/**
 * URLRouter — Story 2.4 wiring between URL, ChapterDirector,
 * ClockManager, and the `chapter-jump` CustomEvent.
 *
 * The URL contract is described in `docs/url-contract.md`; this module is
 * its runtime enforcer. It does NOT own the address bar (URLSync does);
 * it observes the system and decides which URLSync write API to call.
 *
 * ## Three writeback paths
 *
 * 1. **User-driven chapter activation** (marker click, listbox Enter,
 *    digit shortcut) — captured via the document-level `chapter-jump`
 *    CustomEvent subscription. Calls
 *    `urlSync.writeChapterPushState(slug, anchorEt)` so the browser back
 *    button returns to the prior route. AC3.
 *
 * 2. **Director-driven boundary crossing** during free scrub — captured
 *    via the `ChapterDirector.subscribe` callback on `entering→held`
 *    transitions where the new slug differs from the current path. Calls
 *    `urlSync.writeChapterReplaceState(slug, et)` so the path follows the
 *    scrubber without history pollution. AC5.
 *
 * 3. **Exit-to-cruise** when ET leaves all chapter windows — also
 *    detected from `ChapterDirector.subscribe` (the `held→exiting`
 *    transition that doesn't immediately re-enter another chapter).
 *    Calls `urlSync.writeHomeReplaceState(et)`. AC5.
 *
 * ## chapter-jump vs ChapterDirector races
 *
 * A user click on a marker fires `chapter-jump` AND
 * `clockManager.scrubTo(anchorEt)`. The scrub may then drive
 * `ChapterDirector.update(...)` to emit a `held` transition for the same
 * chapter. To avoid the click producing a pushState immediately followed
 * by a replaceState that just overwrites the same URL, the router
 * suppresses the next director-driven write for `slug` if the same slug
 * just produced a pushState. The suppression resets on the next director
 * transition that targets a DIFFERENT slug, so subsequent free scrubs
 * trigger replaceState correctly.
 *
 * ## popstate
 *
 * Back/forward presses are routed through `URLSync.installPopstateHandler`.
 * The router replays the parsed URL into `ClockManager.scrubTo(et)`;
 * ChapterDirector observes the new ET on its next per-frame update and
 * fires its own `held` transitions naturally. To prevent that follow-on
 * transition from writing the URL AGAIN (which would push the user's
 * back-button target back forward), the router also suppresses the next
 * director-driven write that matches the popstate-target slug. AC8c.
 *
 * ## Dispose
 *
 * `dispose()` detaches all listeners and the director subscription so the
 * router can be torn down cleanly in tests.
 */

import type { URLSync, ParseInitialPathResult } from './url-sync';
import type { ClockManager } from './clock-manager';
import type { ChapterDirector } from './chapter-director';
import type { ChapterTransitionEvent } from '../types/chapter';

export interface ChapterJumpDetail {
  slug: string;
  anchorEt: number;
}

export interface UrlRouterOptions {
  urlSync: URLSync;
  clockManager: ClockManager;
  chapterDirector: ChapterDirector;
  /**
   * The document the router listens on for the `chapter-jump` CustomEvent
   * (bubbles+composed; reaches the document from any nested shadow root).
   * Defaults to `document`; tests inject a fake.
   */
  doc?: Document;
}

export class URLRouter {
  private readonly urlSync: URLSync;
  private readonly clockManager: ClockManager;
  private readonly chapterDirector: ChapterDirector;
  private readonly doc: Document;

  private detachChapterJump: (() => void) | null = null;
  private detachDirector: (() => void) | null = null;
  private detachPopstate: (() => void) | null = null;

  /**
   * Slug of the chapter whose URL was just written via pushState (user
   * jump) — the next director transition into the SAME slug must NOT
   * trigger a replaceState. Cleared once a different slug, the home
   * route, or a non-`held` target slug shows up in a director event.
   */
  private suppressNextDirectorWriteForSlug: string | null = null;
  /**
   * popstate→clock.scrubTo→next-frame director.update may resolve to a
   * different chapter (or to none) than the popstate URL implied —
   * specifically the back-to-`/` case where MISSION_START_ET falls inside
   * a chapter window, and the AC2 "out-of-window ?t= on chapter route"
   * case where the resolved chapter differs from the URL's slug. In both,
   * the director write would overwrite the user's back-target. This
   * sentinel suppresses the very next director-driven settle regardless
   * of resolved slug; it is one-shot.
   */
  private suppressNextDirectorWriteAny: boolean = false;
  /**
   * `director.update(et)` may fire many transitions in a single call —
   * one chapter's enter, a previous chapter's exit, etc. Per-transition
   * URL writes would race with each other; we batch by deferring the
   * decision to a microtask and reading activeChapter at the END of
   * the wave. This flag prevents stacking multiple deferred decisions.
   */
  private pendingWaveSettle: boolean = false;

  constructor(opts: UrlRouterOptions) {
    this.urlSync = opts.urlSync;
    this.clockManager = opts.clockManager;
    this.chapterDirector = opts.chapterDirector;
    this.doc = opts.doc ?? document;
  }

  /** Wire up all three listeners. Returns `this` for fluent boot. */
  install(): this {
    this.installChapterJumpListener();
    this.installDirectorSubscription();
    this.installPopstateListener();
    return this;
  }

  private installChapterJumpListener(): void {
    const handler = (ev: Event): void => {
      const ce = ev as CustomEvent<ChapterJumpDetail>;
      const detail = ce.detail;
      if (
        detail === undefined ||
        detail === null ||
        typeof detail.slug !== 'string' ||
        !Number.isFinite(detail.anchorEt)
      ) {
        return;
      }
      this.urlSync.writeChapterPushState(detail.slug, detail.anchorEt);
      // Director will fire a `held` transition for this slug on the next
      // frame as a side effect of `scrubTo(anchorEt)`. Suppress the
      // duplicate URL write.
      this.suppressNextDirectorWriteForSlug = detail.slug;
    };
    this.doc.addEventListener('chapter-jump', handler);
    this.detachChapterJump = () => {
      this.doc.removeEventListener('chapter-jump', handler);
    };
  }

  private installDirectorSubscription(): void {
    this.detachDirector = this.chapterDirector.subscribe(
      (event: ChapterTransitionEvent) => {
        this.handleDirectorTransition(event);
      },
    );
  }

  private installPopstateListener(): void {
    this.detachPopstate = this.urlSync.installPopstateHandler(
      (state: ParseInitialPathResult) => {
        this.handlePopstate(state);
      },
    );
  }

  /**
   * Translate a director transition into a URL writeback decision.
   *
   * ChapterDirector.update(et) walks chapters one-at-a-time through every
   * intermediate state (per Story 2.1 contract: out → entering → held →
   * exiting → passed). A rapid scrub from launch to a late chapter will
   * therefore fire `entering→held` for EVERY chapter on the way through,
   * even though only the final chapter's resting state is actually
   * `held`.
   *
   * Per-transition URL writes would emit one for every walked chapter.
   * Instead, we BATCH: any transition queues a microtask to "settle the
   * wave"; the settle reads `director.activeChapter` (which reflects the
   * resting state) and writes the URL exactly once per `update(et)` call.
   *
   * Suppression handshake (chapter-jump → director):
   *   When a user clicks a marker, we pushState immediately AND
   *   `suppressNextDirectorWriteForSlug = slug`. The follow-on director
   *   transition for that slug is consumed by the suppression flag in
   *   the settle step — preventing a redundant replaceState that would
   *   just rewrite the same URL.
   */
  private handleDirectorTransition(event: ChapterTransitionEvent): void {
    // Only `held` and `passed` transitions matter for URL writeback;
    // the in-between `entering` and `exiting` are pure intermediates.
    if (!(event.to === 'held' || event.to === 'passed')) return;
    this.scheduleWaveSettle(event.et);
  }

  private scheduleWaveSettle(et: number): void {
    if (this.pendingWaveSettle) return;
    this.pendingWaveSettle = true;
    queueMicrotask(() => {
      this.pendingWaveSettle = false;
      this.settleWave(et);
    });
  }

  private settleWave(et: number): void {
    // Generic one-shot suppression — set by popstate (where the next
    // director-driven write must not overwrite the user's back-target,
    // regardless of which chapter the director resolves to).
    if (this.suppressNextDirectorWriteAny) {
      this.suppressNextDirectorWriteAny = false;
      this.suppressNextDirectorWriteForSlug = null;
      return;
    }
    const active = this.chapterDirector.activeChapter;
    if (active !== null) {
      // A chapter is held. Either suppress (if just-jumped slug) or
      // write its slug as the new path.
      if (this.suppressNextDirectorWriteForSlug === active.slug) {
        this.suppressNextDirectorWriteForSlug = null;
        return;
      }
      this.suppressNextDirectorWriteForSlug = null;
      this.urlSync.writeChapterReplaceState(active.slug, et);
      return;
    }
    // No chapter held — cruise period. Revert to '/'.
    this.suppressNextDirectorWriteForSlug = null;
    this.urlSync.writeHomeReplaceState(et);
  }

  private handlePopstate(state: ParseInitialPathResult): void {
    // Apply the parsed ET. scrubTo pauses the clock as a side effect —
    // matching the cold-load deep-link contract. Director observes the
    // new ET on its next frame and fires the matching `held` transition.
    this.clockManager.scrubTo(state.initialEt);
    // The follow-on director transition would otherwise replaceState
    // ANOTHER URL on top of the user's back-target — overwriting it.
    // Two cases to cover:
    //   1. Chapter route popstate (state.chapter !== null) — director
    //      will resolve the same chapter; suppress that slug.
    //   2. Home route popstate (state.chapter === null) — director may
    //      resolve a DIFFERENT chapter (e.g., MISSION_START_ET falls
    //      inside launch-v2's window), or it may resolve null (cruise).
    //      Either way we must not overwrite the `/` back-target on the
    //      next frame, so suppress the next settle entirely.
    // Both cases set the generic one-shot sentinel so the next settle
    // is consumed and the URL the user navigated to stays intact.
    this.suppressNextDirectorWriteAny = true;
    this.suppressNextDirectorWriteForSlug = null;
  }

  /** Detach all listeners + subscriptions. Idempotent. */
  dispose(): void {
    if (this.detachChapterJump !== null) {
      this.detachChapterJump();
      this.detachChapterJump = null;
    }
    if (this.detachDirector !== null) {
      this.detachDirector();
      this.detachDirector = null;
    }
    if (this.detachPopstate !== null) {
      this.detachPopstate();
      this.detachPopstate = null;
    }
    this.suppressNextDirectorWriteForSlug = null;
    this.suppressNextDirectorWriteAny = false;
  }
}
