/**
 * ChapterDirector — per-frame chapter FSM (Story 2.1).
 *
 * Owns the lifecycle of every chapter in `ALL_CHAPTERS` relative to the
 * current simulation ET. Driven by `update(et)` once per render frame from
 * `RenderEngine.onFrame`. No coupling to ClockManager — the director is
 * pure data, and the consumer wires the ET source. This keeps the service
 * trivially unit-testable without instantiating a real clock.
 *
 * ## State machine
 *
 * For each chapter:
 *
 *   out ──(et enters window)──► entering ──► held
 *   held ──(et exits window) ──► exiting  ──► passed
 *
 * `entering` and `exiting` are TRANSIENT states — the FSM emits them as
 * subscriber events but never dwells there between update() calls. After
 * a window crossing the chapter settles into `held` (forward enter) or
 * `passed` (forward exit). Reverse scrubbing traverses symmetrically:
 *
 *   passed ──(et re-enters window)──► exiting  ──► held
 *   held   ──(et leaves at start)  ──► entering ──► out
 *
 * Per forward (or reverse) pass through a chapter, exactly 4 transitions
 * fire: out→entering, entering→held, held→exiting, exiting→passed. AC5
 * unit tests pin this contract.
 *
 * ## Subscriber contract
 *
 * Subscribers fire ONLY on state transitions (mirroring ClockManager's
 * Story 1.10 pattern), NOT per frame. Per-frame consumers (e.g. HUD
 * highlighting the active chapter) should read `activeChapter` directly
 * inside their own RenderEngine.onFrame callback — that path stays cool
 * under 60 Hz rendering.
 *
 * Subscriber callbacks that throw do NOT prevent later subscribers from
 * receiving the same event (Story 2.0 chunk-loader notify-hardening
 * pattern). Exceptions are logged and swallowed.
 *
 * ## Rapid-scrub semantics
 *
 * `update(et)` is event-driven on ET crossings, NOT time-delta-driven.
 * A single `update()` call may legitimately cross many chapter windows
 * at once (timeline scrub from launch to heliopause) — all intermediate
 * transitions fire in chronological order, none are dropped.
 *
 * ## Idempotency
 *
 * Two consecutive `update(et)` calls with the same `et` produce no
 * subscriber events on the second call (AC5).
 *
 * ## Initial state
 *
 * Before the first `update()` call, every chapter is in state `out` and
 * `activeChapter` is `null`. The first `update(et)` synthesizes the
 * transitions needed to walk each chapter from `out` to its correct
 * resting state for that ET (e.g., loading at PBD's anchor fires
 * `out→entering→held` for PBD and `out→entering→held→exiting→passed`
 * for every chapter whose window ends before PBD's anchor).
 */

import type {
  ChapterSpec,
  ChapterState,
  ChapterTransitionEvent,
} from '../types/chapter';

type Subscriber = (event: ChapterTransitionEvent) => void;

export class ChapterDirector {
  private readonly chapters: readonly ChapterSpec[];
  private readonly states: Map<string, ChapterState> = new Map();
  private readonly subscribers: Set<Subscriber> = new Set();
  private lastEt: number | null = null;

  constructor(chapters: readonly ChapterSpec[]) {
    this.chapters = chapters;
    for (const c of chapters) {
      this.states.set(c.slug, 'out');
    }
  }

  /**
   * Per-frame advance. Compares the new `et` against each chapter's
   * window bounds and emits the transitions implied by any crossings
   * since the previous `et`.
   *
   * Idempotent: calling twice with the same value fires no subscribers
   * on the second call.
   */
  update(et: number): void {
    if (!Number.isFinite(et)) return;
    if (this.lastEt === et) return;

    const previous = this.lastEt;
    this.lastEt = et;

    // First call ever: synthesize the transitions implied by going from
    // "no ET observed yet" to `et`. We model the "no observation" cursor
    // as -Infinity so every chapter starting in `out` gets the correct
    // forward-traversal transitions.
    const from = previous ?? Number.NEGATIVE_INFINITY;
    this.advance(from, et);
  }

  /**
   * The chapter currently in `held` state, or `null` if `et` is between
   * chapter windows. At most one chapter is ever `held` because windows
   * do not overlap (AC2 / registry test).
   */
  get activeChapter(): ChapterSpec | null {
    for (const c of this.chapters) {
      if (this.states.get(c.slug) === 'held') return c;
    }
    return null;
  }

  /**
   * Fine-grained state query. Defaults to `'out'` for unknown slugs so
   * callers don't have to null-check (an unknown slug behaves the same
   * as a chapter the cursor hasn't reached yet).
   */
  getState(slug: string): ChapterState {
    return this.states.get(slug) ?? 'out';
  }

  /**
   * Subscribe to state-transition events. Returns an unsubscribe function.
   * Subscribers fire only on transitions, never per-frame.
   *
   * Idempotent: subscribing the same callback twice is a no-op
   * (Set-deduplication).
   */
  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /** Detach all subscribers. */
  dispose(): void {
    this.subscribers.clear();
  }

  /**
   * Walk every chapter from its current state to the resting state
   * implied by `to`, emitting all intermediate transitions in
   * chronological order. The order between chapters is determined by
   * the chronological direction of the crossings:
   *
   *   forward (to > from): chapters fire in ascending anchor order
   *   reverse (to < from): chapters fire in descending anchor order
   */
  private advance(from: number, to: number): void {
    const forward = to > from;
    const ordered = forward ? this.chapters : [...this.chapters].reverse();
    for (const chapter of ordered) {
      this.transitionChapter(chapter, from, to, forward);
    }
  }

  private transitionChapter(
    chapter: ChapterSpec,
    from: number,
    to: number,
    forward: boolean,
  ): void {
    const current = this.states.get(chapter.slug) ?? 'out';
    const target = restingStateAtEt(chapter, to);
    if (current === target) return;

    // Walk one step at a time so every intermediate transition fires.
    // The step direction depends on whether we're moving toward later
    // states (out→entering→held→exiting→passed) or earlier states.
    let step = current;
    const targetIsLater = ORDER[target] > ORDER[current];
    while (step !== target) {
      const next = targetIsLater
        ? STATE_FORWARD[step]
        : STATE_BACKWARD[step];
      if (next === step) break; // safety — should not happen
      const event: ChapterTransitionEvent = {
        chapter,
        from: step,
        to: next,
        // The transition's `et` carries the new cursor — useful for
        // consumers that want to log "we transitioned at et=X".
        et: to,
      };
      this.states.set(chapter.slug, next);
      this.notify(event);
      step = next;
    }
    // `from` is unused here but kept in the signature so the algorithm
    // is clearly et-driven (not delta-driven). `forward` is similarly
    // available for symmetric debug logging if needed.
    void from;
    void forward;
  }

  private notify(event: ChapterTransitionEvent): void {
    if (this.subscribers.size === 0) return;
    for (const cb of this.subscribers) {
      try {
        cb(event);
      } catch (err) {
        // Defensive: a throwing subscriber must not silence others.
        // Mirrors the Story 2.0 chunk-loader notify-hardening pattern.
        console.error('[ChapterDirector] subscriber threw:', err);
      }
    }
  }
}

const ORDER: Readonly<Record<ChapterState, number>> = {
  out: 0,
  entering: 1,
  held: 2,
  exiting: 3,
  passed: 4,
};

const STATE_FORWARD: Readonly<Record<ChapterState, ChapterState>> = {
  out: 'entering',
  entering: 'held',
  held: 'exiting',
  exiting: 'passed',
  passed: 'passed',
};

const STATE_BACKWARD: Readonly<Record<ChapterState, ChapterState>> = {
  out: 'out',
  entering: 'out',
  held: 'entering',
  exiting: 'held',
  passed: 'exiting',
};

/**
 * The chapter's resting state for an ET cursor:
 *
 *   et < windowStartEt  ⇒ out
 *   et ∈ [start, end]   ⇒ held
 *   et > windowEndEt    ⇒ passed
 *
 * `entering` and `exiting` are transient — they exist only as transition
 * events and are never a resting state.
 */
const restingStateAtEt = (chapter: ChapterSpec, et: number): ChapterState => {
  if (et < chapter.windowStartEt) return 'out';
  if (et > chapter.windowEndEt) return 'passed';
  return 'held';
};
