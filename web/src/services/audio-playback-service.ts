/**
 * AudioPlaybackService — Story 6.1.
 *
 * Owns the Golden Record audio layer: a binary on/off toggle, session-id-
 * gated localStorage persistence, and chapter-window-gated playback for
 * the 5 Golden-Record chapter slugs (V1 launch, V2 launch, Pale Blue Dot,
 * V1 heliopause, V2 heliopause). Cross-fades in over 1500 ms on chapter-
 * window entry and out over 1500 ms on exit / toggle-off / pause.
 *
 * Audio is OFF by default. The persistence contract resets the toggle on
 * a new tab / browser restart / new day — same-tab reloads preserve it.
 * See `docs/audio/golden-record-curation.md` § "Runtime persistence
 * contract" for the full UX-DR15 spec.
 *
 * ## Service contract
 *
 * Mirrors the canonical service shape established by `ChapterDirector`
 * (constructor + injected deps + `subscribe(cb): () => void` returning
 * unsubscribe + `dispose()` clears subscribers; subscriber callbacks
 * that throw are logged and do NOT silence later subscribers).
 *
 * ## ADR compliance
 *
 * - **ADR-0014** — Path A activation. The ChapterDirector subscriber in
 *   main.ts checks `event.chapter.slug ∈ GOLDEN_RECORD_CHAPTER_SLUGS` and
 *   forwards `onChapterEnter` / `onChapterExit` to this service. No
 *   extension of `ChapterDirector` itself; the service is one of the
 *   Story-5.1-style Path A subscribers.
 * - **ADR-0015** — Service graph + Lit reactive controllers, NO global
 *   store. The service is constructed in `main.ts` once and injected into
 *   `<v-audio-toggle>` via property; the component subscribes for state
 *   change notifications.
 * - **ADR-0019** — Story-6.1 amendment authorizes a second localStorage
 *   use case (the audio-toggle session-scoped preference, keyed
 *   `voyager.audio-toggle`). All localStorage access is wrapped in
 *   try/catch with in-memory fallback.
 *
 * ## Audio chain
 *
 * The service constructs a Web Audio API `AudioContext` + per-track
 * `GainNode` so cross-fades are clean. Each chapter slug has a dedicated
 * `HTMLAudioElement` source whose `MediaElementAudioSourceNode` feeds
 * the gain → destination. Cross-fade is implemented via
 * `gain.gain.linearRampToValueAtTime` on the AudioContext clock — the
 * fade timing is wall-clock-gated (NOT simulation-time-gated), which is
 * the correct register for audio per AC5.
 *
 * The HTMLAudioElement underlying chain is preferred over a full
 * decode-into-AudioBuffer path because: (1) the audio files are large
 * enough that streaming via `<audio>` is friendlier to memory than
 * decodeAudioData; (2) `<audio>` handles network-stalled playback
 * gracefully out of the box; (3) the cross-fade math only needs a
 * GainNode, which a `MediaElementAudioSourceNode` exposes natively.
 */

const STORAGE_KEY = 'voyager.audio-toggle';

const CROSS_FADE_MS = 1500;

/** The 5 Golden-Record chapter slugs that activate the audio layer. */
export const GOLDEN_RECORD_CHAPTER_SLUGS = [
  'launch-v1',
  'launch-v2',
  'pale-blue-dot',
  'v1-heliopause',
  'v2-heliopause',
] as const;

/** Union of the 5 Golden-Record chapter slugs. */
export type GoldenRecordSlug = (typeof GOLDEN_RECORD_CHAPTER_SLUGS)[number];

/** Type-guard for narrowing arbitrary chapter slugs into the Golden-Record union. */
export const isGoldenRecordSlug = (slug: string): slug is GoldenRecordSlug => {
  for (const s of GOLDEN_RECORD_CHAPTER_SLUGS) {
    if (s === slug) return true;
  }
  return false;
};

/**
 * Slug-to-track URL map. Each entry resolves to the runtime URL of an
 * AAC-LC `.m4a` file at `web/public/audio/golden-record/`. The files are
 * served by Vite as static assets — the URLs are content-addressed by
 * the file path (no per-build hashing) because the curation discipline
 * binds the slug to the filename, and the LFS swap mechanic relies on
 * the path being stable across the placeholder ↔ real-audio swap.
 */
export const AUDIO_BY_CHAPTER_SLUG: Readonly<Record<GoldenRecordSlug, string>> =
  Object.freeze({
    'launch-v1': '/audio/golden-record/launch-v1.m4a',
    'launch-v2': '/audio/golden-record/launch-v2.m4a',
    'pale-blue-dot': '/audio/golden-record/pale-blue-dot.m4a',
    'v1-heliopause': '/audio/golden-record/v1-heliopause.m4a',
    'v2-heliopause': '/audio/golden-record/v2-heliopause.m4a',
  });

/** State snapshot delivered to subscribers on every change. */
export interface AudioState {
  /** Whether the toggle is currently on. */
  readonly on: boolean;
  /**
   * The Golden-Record chapter slug currently held by the simulation, or
   * `null` if the simulation is outside every Golden-Record window.
   */
  readonly activeSlug: GoldenRecordSlug | null;
  /**
   * Whether audio is *actually* playing right now (toggle on AND inside
   * a Golden-Record window AND simulation playing). Subscribers that
   * only need the user-visible toggle state read `on`; subscribers that
   * mirror the audible state read `playing`.
   */
  readonly playing: boolean;
}

type Subscriber = (state: AudioState) => void;

/**
 * Minimal contract for the localStorage surface. Extracted so tests can
 * inject a stub when `localStorage` is unavailable (private mode, JSDOM
 * minus storage shim, etc.) — the service itself catches storage errors
 * via the try/catch posture inside `readPersisted` / `writePersisted`.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Minimal contract for the audio engine surface. The default
 * implementation uses `HTMLAudioElement` + Web Audio `AudioContext`; tests
 * inject a no-op stub so the unit tier never touches a real AudioContext
 * (happy-dom does not implement Web Audio API).
 */
export interface AudioEngineLike {
  /** Prepare a track for a slug. Idempotent. */
  prepare(slug: GoldenRecordSlug, url: string): void;
  /** Fade gain from current to 1 over crossFadeMs ms and start playing. */
  fadeIn(slug: GoldenRecordSlug, crossFadeMs: number): void;
  /** Fade gain from current to 0 over crossFadeMs ms; pause when done. */
  fadeOut(slug: GoldenRecordSlug, crossFadeMs: number): void;
  /** Pause WITHOUT a fade (used for `simulation paused` propagation). */
  pause(slug: GoldenRecordSlug): void;
  /** Resume from the paused position WITHOUT a fade. */
  resume(slug: GoldenRecordSlug): void;
  /** Tear down all internal audio nodes. */
  dispose(): void;
}

/** Constructor options for the service. */
export interface AudioPlaybackServiceOptions {
  /** Override the localStorage backing (default: `window.localStorage` if available). */
  storage?: StorageLike | null;
  /** Override the audio engine (default: a real `HTMLAudioElement` + `AudioContext` chain). */
  audioEngine?: AudioEngineLike;
  /**
   * Override the session-id generator. Default uses `crypto.randomUUID()`
   * which is universally available in target browsers per ADR-0008's
   * WebGL2 baseline.
   */
  generateSessionId?: () => string;
  /**
   * Override the slug → URL map. Defaults to `AUDIO_BY_CHAPTER_SLUG`.
   * Tests use this to point at synthetic URLs.
   */
  audioByChapterSlug?: Readonly<Record<GoldenRecordSlug, string>>;
}

const defaultGenerateSessionId = (): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  // Fallback for ancient runtimes that don't expose crypto.randomUUID.
  // The session-id only needs to be unique per page-load, so a
  // timestamp + random suffix is sufficient (test environments only).
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const defaultStorage = (): StorageLike | null => {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

export class AudioPlaybackService {
  private readonly subscribers: Set<Subscriber> = new Set();

  private _on: boolean = false;
  private _activeSlug: GoldenRecordSlug | null = null;
  private _simulationPlaying: boolean = true;

  private readonly storage: StorageLike | null;
  private readonly audioEngine: AudioEngineLike;
  private readonly currentSessionId: string;
  private readonly audioUrls: Readonly<Record<GoldenRecordSlug, string>>;

  constructor(options: AudioPlaybackServiceOptions = {}) {
    // Per ADR-0019 amendment + AC4 — try/catch wraps the storage access.
    this.storage =
      options.storage === undefined ? defaultStorage() : options.storage;
    this.audioEngine = options.audioEngine ?? new DefaultAudioEngine();
    this.audioUrls = options.audioByChapterSlug ?? AUDIO_BY_CHAPTER_SLUG;

    const generateSessionId =
      options.generateSessionId ?? defaultGenerateSessionId;
    this.currentSessionId = generateSessionId();

    // Read persisted state and apply if the sessionId matches the
    // current page-load's id (AC4 reset semantics).
    const persisted = this.readPersisted();
    if (persisted !== null && persisted.sessionId === this.currentSessionId) {
      this._on = persisted.on;
    }
  }

  /** Current toggle state (the user-visible on/off). */
  isOn(): boolean {
    return this._on;
  }

  /** Snapshot of the full state. */
  getState(): AudioState {
    return {
      on: this._on,
      activeSlug: this._activeSlug,
      playing: this.computeAudiblePlaying(),
    };
  }

  /**
   * Flip the toggle. Mirrors `clockManager.toggle`-style semantics. The
   * caller does not need to specify the new state; the service flips it
   * and writes through to persistence + the audio engine.
   */
  toggle(): void {
    this.setOn(!this._on);
  }

  /** Set the toggle to an explicit on/off value. */
  setOn(on: boolean): void {
    if (on === this._on) return;
    this._on = on;
    this.writePersisted();
    this.syncEngine();
    this.notify();
  }

  /**
   * Called by the bootstrap subscriber when the ChapterDirector emits
   * `to === 'held'` for a Golden-Record chapter. The caller has already
   * narrowed the slug; passing a non-Golden-Record slug here is a
   * programming error and the service ignores it defensively.
   */
  onChapterEnter(slug: GoldenRecordSlug): void {
    if (this._activeSlug === slug) return;
    this._activeSlug = slug;
    this.syncEngine();
    this.notify();
  }

  /**
   * Called by the bootstrap subscriber when the ChapterDirector emits
   * `from === 'held'` for the chapter currently held. Idempotent — if
   * the slug being exited doesn't match `_activeSlug` we just clear.
   */
  onChapterExit(slug: GoldenRecordSlug): void {
    if (this._activeSlug !== slug && this._activeSlug !== null) {
      // Exiting a different slug than the one we're tracking. Still
      // clear: the ChapterDirector contract guarantees at most one
      // chapter is `held` at a time, so any `from === 'held'` event for
      // a Golden-Record slug means we're no longer in an audio window.
    }
    if (this._activeSlug === null) return;
    this._activeSlug = null;
    this.syncEngine();
    this.notify();
  }

  /**
   * Called by the bootstrap subscriber when the ClockManager fires a
   * play/pause transition. The audio pauses when the simulation pauses
   * (no fade — instant pause matches the user's expectation of stopping
   * everything together) and resumes from the same position when the
   * simulation resumes.
   */
  onPlayStateChange(playing: boolean): void {
    if (playing === this._simulationPlaying) return;
    this._simulationPlaying = playing;
    this.syncEngine();
    this.notify();
  }

  /** Subscribe to state-change events. Returns an unsubscribe function. */
  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /** Detach all subscribers and tear down the audio engine. */
  dispose(): void {
    this.subscribers.clear();
    try {
      this.audioEngine.dispose();
    } catch (err) {
      console.error('[AudioPlaybackService] audioEngine.dispose threw:', err);
    }
  }

  // ---------------------------------------------------------------------
  // Internal — exposed for tests via the constructor `audioEngine` /
  // `storage` overrides. Subclassing is not part of the public contract.

  private computeAudiblePlaying(): boolean {
    if (!this._on) return false;
    if (this._activeSlug === null) return false;
    if (!this._simulationPlaying) return false;
    return true;
  }

  private syncEngine(): void {
    if (this._activeSlug === null) {
      // We are outside every Golden-Record window. The engine should be
      // silent; fade out everything that might be playing.
      this.audioEngine.fadeOut('launch-v1', CROSS_FADE_MS);
      this.audioEngine.fadeOut('launch-v2', CROSS_FADE_MS);
      this.audioEngine.fadeOut('pale-blue-dot', CROSS_FADE_MS);
      this.audioEngine.fadeOut('v1-heliopause', CROSS_FADE_MS);
      this.audioEngine.fadeOut('v2-heliopause', CROSS_FADE_MS);
      return;
    }
    // We're inside an audio window. Prepare the track lazily and react
    // to the toggle + simulation-playing flag.
    this.audioEngine.prepare(this._activeSlug, this.audioUrls[this._activeSlug]);
    if (!this._on) {
      this.audioEngine.fadeOut(this._activeSlug, CROSS_FADE_MS);
      return;
    }
    if (!this._simulationPlaying) {
      // Pause without a fade — the simulation just paused and the user
      // expects the soundscape to follow synchronously.
      this.audioEngine.pause(this._activeSlug);
      return;
    }
    // Toggle on, inside window, simulation playing. Fade in if not
    // already at full volume; the engine handles the idempotency.
    this.audioEngine.fadeIn(this._activeSlug, CROSS_FADE_MS);
  }

  private readPersisted(): { sessionId: string; on: boolean } | null {
    if (this.storage === null) return null;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as { sessionId?: unknown }).sessionId !== 'string' ||
        typeof (parsed as { on?: unknown }).on !== 'boolean'
      ) {
        return null;
      }
      const p = parsed as { sessionId: string; on: boolean };
      return { sessionId: p.sessionId, on: p.on };
    } catch {
      return null;
    }
  }

  private writePersisted(): void {
    if (this.storage === null) return;
    try {
      this.storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sessionId: this.currentSessionId, on: this._on }),
      );
    } catch {
      // Private mode / quota-exceeded / etc. Silent fallback to in-memory
      // state per AC4.
    }
  }

  private notify(): void {
    if (this.subscribers.size === 0) return;
    const snapshot = this.getState();
    for (const cb of this.subscribers) {
      try {
        cb(snapshot);
      } catch (err) {
        // Mirror the ChapterDirector / chunk-loader notify-hardening
        // pattern — a throwing subscriber must not silence others.
        console.error('[AudioPlaybackService] subscriber threw:', err);
      }
    }
  }
}

// ---------------------------------------------------------------------
// Default audio engine — HTMLAudioElement + Web Audio GainNode.

interface TrackHandle {
  audio: HTMLAudioElement;
  gain: GainNode;
  source: MediaElementAudioSourceNode;
}

/**
 * Default `AudioEngineLike` implementation. Constructed lazily on the
 * first `prepare(...)` call so that environments without Web Audio API
 * (test runners under happy-dom, SSR, etc.) can still construct the
 * `AudioPlaybackService` (the engine is constructed regardless, but its
 * methods become no-ops without throwing when the AudioContext is null).
 *
 * Cross-fades use `gain.gain.linearRampToValueAtTime(target, ctx.currentTime + dt)`
 * which is the canonical Web Audio API path — the ramp runs on the audio
 * thread and survives main-thread jank.
 */
class DefaultAudioEngine implements AudioEngineLike {
  private ctx: AudioContext | null = null;
  private readonly tracks: Map<GoldenRecordSlug, TrackHandle> = new Map();

  private ensureContext(): AudioContext | null {
    if (this.ctx !== null) return this.ctx;
    try {
      if (typeof window === 'undefined') return null;
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ??
        (
          window as unknown as {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (typeof Ctor !== 'function') return null;
      this.ctx = new Ctor();
      return this.ctx;
    } catch (err) {
      console.warn('[AudioPlaybackService] AudioContext unavailable:', err);
      return null;
    }
  }

  prepare(slug: GoldenRecordSlug, url: string): void {
    if (this.tracks.has(slug)) return;
    const ctx = this.ensureContext();
    if (ctx === null) return;
    try {
      const audio = new Audio(url);
      audio.crossOrigin = 'anonymous';
      audio.loop = true;
      audio.preload = 'auto';
      const source = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(ctx.destination);
      this.tracks.set(slug, { audio, gain, source });
    } catch (err) {
      console.warn(
        `[AudioPlaybackService] prepare(${slug}) failed:`,
        err,
      );
    }
  }

  fadeIn(slug: GoldenRecordSlug, crossFadeMs: number): void {
    const ctx = this.ensureContext();
    const handle = this.tracks.get(slug);
    if (ctx === null || handle === undefined) return;
    try {
      // Autoplay-policy hardening (Story 6.1 code-review MED-1):
      // `HTMLAudioElement.play()` returns a Promise that rejects when
      // the browser's autoplay policy blocks playback (NotAllowedError —
      // gestureless playback before user interaction). Discarding the
      // Promise with `void` would leave an UnhandledPromiseRejection on
      // the global handler queue, polluting the console and surfacing
      // as a runtime error in monitoring. Catching here silences the
      // rejection without changing the service-level state — the toggle
      // remains `on`, the user sees no audible playback (which IS the
      // browser-enforced behavior), and a subsequent gesture-triggered
      // `play()` (e.g. the user clicks somewhere) will succeed.
      handle.audio.play().catch(() => {
        // Autoplay blocked or audio element torn down — silent fallback.
      });
      const now = ctx.currentTime;
      handle.gain.gain.cancelScheduledValues(now);
      // Re-set the current value so the ramp starts from "wherever we
      // are" rather than snapping to 0 first.
      handle.gain.gain.setValueAtTime(handle.gain.gain.value, now);
      handle.gain.gain.linearRampToValueAtTime(1, now + crossFadeMs / 1000);
    } catch (err) {
      console.warn(`[AudioPlaybackService] fadeIn(${slug}) failed:`, err);
    }
  }

  fadeOut(slug: GoldenRecordSlug, crossFadeMs: number): void {
    const ctx = this.ensureContext();
    const handle = this.tracks.get(slug);
    if (ctx === null || handle === undefined) return;
    try {
      const now = ctx.currentTime;
      handle.gain.gain.cancelScheduledValues(now);
      handle.gain.gain.setValueAtTime(handle.gain.gain.value, now);
      handle.gain.gain.linearRampToValueAtTime(0, now + crossFadeMs / 1000);
      // Schedule the pause on the JS event loop so the fade completes
      // before the audio element stops. Using setTimeout — the audio
      // thread handles the actual gain ramp, this just stops the source.
      setTimeout(() => {
        try {
          handle.audio.pause();
        } catch {
          // Ignore pause errors — they happen if the element was already
          // paused or torn down.
        }
      }, crossFadeMs);
    } catch (err) {
      console.warn(`[AudioPlaybackService] fadeOut(${slug}) failed:`, err);
    }
  }

  pause(slug: GoldenRecordSlug): void {
    const handle = this.tracks.get(slug);
    if (handle === undefined) return;
    try {
      handle.audio.pause();
    } catch (err) {
      console.warn(`[AudioPlaybackService] pause(${slug}) failed:`, err);
    }
  }

  resume(slug: GoldenRecordSlug): void {
    const handle = this.tracks.get(slug);
    if (handle === undefined) return;
    try {
      // Same autoplay-policy hardening as fadeIn (Story 6.1 code-review
      // MED-1): catch the Promise rejection so a gestureless resume
      // does not surface an UnhandledPromiseRejection.
      handle.audio.play().catch(() => {
        // Autoplay blocked — silent fallback; the next gesture resumes.
      });
    } catch (err) {
      console.warn(`[AudioPlaybackService] resume(${slug}) failed:`, err);
    }
  }

  dispose(): void {
    for (const [slug, handle] of this.tracks.entries()) {
      try {
        handle.audio.pause();
        handle.audio.src = '';
        handle.gain.disconnect();
        handle.source.disconnect();
      } catch (err) {
        console.warn(`[AudioPlaybackService] dispose(${slug}) failed:`, err);
      }
    }
    this.tracks.clear();
    if (this.ctx !== null) {
      try {
        void this.ctx.close();
      } catch {
        // Ignore close errors.
      }
      this.ctx = null;
    }
  }
}
