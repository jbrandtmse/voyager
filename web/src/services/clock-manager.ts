/**
 * ClockManager — Voyager's simulation-time heartbeat (Story 1.10).
 *
 * Owns `simTimeEt` as the single source of truth for time (architecture
 * line 78). Every per-frame consumer reads `clockManager.simTimeEt`
 * directly under `RenderEngine.onFrame(cb)`; this service is intentionally
 * synchronous (architecture line 874 — async boundary belongs to
 * `ChunkLoader`).
 *
 * ## State machine
 *
 *   playing=false ──play()──► playing=true ──pause()──► playing=false
 *                                 │
 *                                 └──scrubTo(et)──► playing=false  (side effect)
 *
 *   tick(dt) advances simTimeEt by  playbackRate × dt / 1000  iff playing.
 *
 * ## Subscriber contract
 *
 * Subscribers fire **only on explicit state-change events** —
 * `play / pause / setRate / scrubTo` — NOT on every `tick(...)` advance.
 * Per-frame consumers (HUD elements) read `clockManager.simTimeEt`
 * directly under the render loop (architecture line 424). The
 * subscribe-vs-direct-read split keeps the Lit reactivity layer cool while
 * the renderer paints at 60 Hz.
 *
 * The auto-cap (FR7) is treated as a state change and *does* fire
 * subscribers — both on entry (we just stalled) and on exit (we just
 * resumed at the user's chosen rate). This lets `<v-speed-multiplier>`
 * render the "—paused (loading)" suffix reactively.
 *
 * ## Scrub semantics
 *
 * `scrubTo(et)` pauses as a deliberate side effect. The user can press
 * Play (or the scrubber's debounce-resume) to restore motion. The
 * "resume 300 ms after the last scrub keystroke" debounce is a UI
 * concern that lives in `<v-timeline-scrubber>`, not here.
 *
 * ## Speed range
 *
 * `[1, 1_000_000]×` per FR3. `setRate` clamps silently for finite values
 * and throws for non-finite (NaN, ±Infinity).
 *
 * ## FR7 — auto speed-cap during chunk loading
 *
 * When a `ChunkLoader` is wired in (`setChunkLoader(loader)`), the
 * service subscribes to the loader's `loading` flag. While
 * `loading === true`, `tick(...)` treats `playbackRate` as 0 and surfaces
 * `autoCapped = true` to subscribers. When the loader completes, the
 * user's previously-chosen `playbackRate` is restored automatically
 * (the value never actually moved; only the auto-cap flag toggles).
 *
 * ## NFR-P6 reinterpretation
 *
 * NFR-P6 specifies "full mission scrub at 1,000,000× in ≤ 60 seconds
 * wall-clock." Read literally with `tick(realDtMs)` driven by `rAF` at
 * ~60 Hz, the mission span (~1.684e9 sim-seconds at 1M×) requires
 * ~1684 seconds of wall-clock real-time, which is mathematically
 * impossible to compress into a 60-second budget without either (a)
 * larger `realDtMs` between ticks or (b) decoupling sim-time advance
 * from render-time pacing. The literal wall-clock budget is a real-
 * renderer L4 perf concern (Story 7.6); this service guarantees only
 * that the *arithmetic* per tick (one mul, one add, one compare, one
 * clamp) stays well under the NFR-P2 50 ms/tick budget. The synthetic
 * `web/src/dev/mission-scrub-perf.ts` harness asserts that arithmetic
 * budget. Future maintainers: do NOT try to make `tick(...)` advance
 * by more than `playbackRate × realDtMs / 1000` per call — the
 * "compress the mission to 60s" semantic must be solved at the
 * render-pacing layer (renderer-driven dtMs scaling), not here.
 */

import { MISSION_START_ET, MISSION_END_ET } from '../constants/mission';

/** Range checked by `setRate`. Mirrors FR3. */
export const MIN_PLAYBACK_RATE = 1;
export const MAX_PLAYBACK_RATE = 1_000_000;

export interface ClockState {
  simTimeEt: number;
  playbackRate: number;
  playing: boolean;
  /**
   * True when `ChunkLoader.loading` was last seen as true and the service
   * is suppressing forward motion until the load completes. Always false
   * when no chunk loader is wired.
   */
  autoCapped: boolean;
}

/** Minimal contract this service needs from `ChunkLoader`. */
export interface ChunkLoaderLike {
  readonly loading: boolean;
  subscribe(cb: (loading: boolean) => void): () => void;
}

const clampEt = (et: number): number => {
  if (et < MISSION_START_ET) return MISSION_START_ET;
  if (et > MISSION_END_ET) return MISSION_END_ET;
  return et;
};

const clampRate = (rate: number): number => {
  if (rate < MIN_PLAYBACK_RATE) return MIN_PLAYBACK_RATE;
  if (rate > MAX_PLAYBACK_RATE) return MAX_PLAYBACK_RATE;
  return rate;
};

export class ClockManager {
  private _simTimeEt: number = MISSION_START_ET;
  private _playbackRate: number = 1;
  private _playing: boolean = false;
  private _autoCapped: boolean = false;

  private readonly subscribers = new Set<(state: ClockState) => void>();

  private chunkLoader: ChunkLoaderLike | null = null;
  private chunkLoaderUnsub: (() => void) | null = null;

  get simTimeEt(): number {
    return this._simTimeEt;
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  get playing(): boolean {
    return this._playing;
  }

  get autoCapped(): boolean {
    return this._autoCapped;
  }

  /**
   * Per-frame advance. `realDtMs` is the wall-clock delta since the last
   * tick, NOT a simulation delta. The simulation delta is
   *   simDt = playbackRate × realDtMs / 1000   (seconds)
   *
   * Advances only when `playing === true` AND not auto-capped. Always
   * clamps the resulting `simTimeEt` to `[MISSION_START_ET, MISSION_END_ET]`.
   *
   * Does NOT fire subscribers — per-frame ET reads are direct. The HUD
   * polls `simTimeEt` under `RenderEngine.onFrame(...)`.
   */
  tick(realDtMs: number): void {
    if (!this._playing) return;
    if (this._autoCapped) return;
    if (!Number.isFinite(realDtMs) || realDtMs <= 0) return;
    const simDtSec = (this._playbackRate * realDtMs) / 1000;
    const next = clampEt(this._simTimeEt + simDtSec);
    this._simTimeEt = next;
  }

  /**
   * Set the playback multiplier in [1, 1_000_000]. Silently clamps for
   * finite values that fall outside the band. Throws `RangeError` on
   * non-finite inputs.
   *
   * Fires subscribers on a true value change.
   */
  setRate(rate: number): void {
    if (!Number.isFinite(rate)) {
      throw new RangeError(`ClockManager.setRate: non-finite rate ${String(rate)}`);
    }
    const next = clampRate(rate);
    if (next === this._playbackRate) return;
    this._playbackRate = next;
    this.notify();
  }

  /** Start advancing on subsequent `tick(...)` calls. No-op if already playing. */
  play(): void {
    if (this._playing) return;
    this._playing = true;
    this.notify();
  }

  /** Stop advancing. No-op if already paused. */
  pause(): void {
    if (!this._playing) return;
    this._playing = false;
    this.notify();
  }

  /**
   * Jump to a specific ET. Clamps to mission window. Pauses as a side
   * effect (AC1). Always fires subscribers so the scrubber + HUD update
   * even if the new ET matches the old (e.g. clamping at an endpoint).
   */
  scrubTo(et: number): void {
    const next = Number.isFinite(et) ? clampEt(et) : this._simTimeEt;
    this._simTimeEt = next;
    this._playing = false;
    this.notify();
  }

  /**
   * Subscribe to state-change events. Fires on play/pause/setRate/scrubTo
   * and on auto-cap entry/exit. Does NOT fire on `tick(...)`-driven
   * ET advances.
   *
   * Returns an unsubscribe function. Idempotent.
   */
  subscribe(cb: (state: ClockState) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /**
   * Wire a `ChunkLoader` for the FR7 auto-cap. Calling with `null` (or
   * calling `dispose()`) detaches the subscription cleanly.
   *
   * Idempotent for the same loader instance; passing a different loader
   * replaces the subscription.
   */
  setChunkLoader(loader: ChunkLoaderLike | null): void {
    if (loader === this.chunkLoader) return;
    if (this.chunkLoaderUnsub !== null) {
      this.chunkLoaderUnsub();
      this.chunkLoaderUnsub = null;
    }
    this.chunkLoader = loader;
    if (loader === null) {
      // Detached → cap clears.
      if (this._autoCapped) {
        this._autoCapped = false;
        this.notify();
      }
      return;
    }
    // Seed from the loader's current state, then subscribe to future flips.
    this.applyAutoCap(loader.loading);
    this.chunkLoaderUnsub = loader.subscribe((loading) => {
      this.applyAutoCap(loading);
    });
  }

  /** Detach the chunk-loader subscription and clear all subscribers. */
  dispose(): void {
    if (this.chunkLoaderUnsub !== null) {
      this.chunkLoaderUnsub();
      this.chunkLoaderUnsub = null;
    }
    this.chunkLoader = null;
    this.subscribers.clear();
  }

  private applyAutoCap(loading: boolean): void {
    if (loading === this._autoCapped) return;
    this._autoCapped = loading;
    this.notify();
  }

  private snapshot(): ClockState {
    return {
      simTimeEt: this._simTimeEt,
      playbackRate: this._playbackRate,
      playing: this._playing,
      autoCapped: this._autoCapped,
    };
  }

  private notify(): void {
    if (this.subscribers.size === 0) return;
    const snap = this.snapshot();
    for (const cb of this.subscribers) cb(snap);
  }
}
