/**
 * Unit tests for `AudioPlaybackService` (Story 6.1, T2 Subtask 2.5).
 *
 * Covers:
 *   - Initial state: toggle off, no active slug, not playing.
 *   - `toggle()` / `setOn(...)` flip and notify subscribers.
 *   - `onChapterEnter` / `onChapterExit` mutate active-slug state.
 *   - `onPlayStateChange` propagates simulation pause/play to audio.
 *   - Session-id-gated localStorage persistence: same id preserves,
 *     different id resets, missing/garbage value falls back to off.
 *   - In-memory fallback when localStorage throws on `setItem` /
 *     `getItem`.
 *   - The audio engine receives the right `fadeIn` / `fadeOut` /
 *     `pause` calls in the right order for each state transition.
 *   - Subscriber notify-hardening: a throwing subscriber does NOT
 *     prevent later subscribers from receiving the same event.
 *   - `dispose()` clears subscribers + tears down the engine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AudioPlaybackService,
  GOLDEN_RECORD_CHAPTER_SLUGS,
  isGoldenRecordSlug,
  AUDIO_BY_CHAPTER_SLUG,
  type AudioEngineLike,
  type StorageLike,
  type GoldenRecordSlug,
} from '../src/services/audio-playback-service';

// ---------------------------------------------------------------------
// Test helpers

const makeEngine = (): {
  engine: AudioEngineLike;
  calls: Array<{ method: string; slug: GoldenRecordSlug; url?: string; ms?: number }>;
} => {
  const calls: Array<{ method: string; slug: GoldenRecordSlug; url?: string; ms?: number }> =
    [];
  const engine: AudioEngineLike = {
    prepare(slug, url) {
      calls.push({ method: 'prepare', slug, url });
    },
    fadeIn(slug, ms) {
      calls.push({ method: 'fadeIn', slug, ms });
    },
    fadeOut(slug, ms) {
      calls.push({ method: 'fadeOut', slug, ms });
    },
    pause(slug) {
      calls.push({ method: 'pause', slug });
    },
    resume(slug) {
      calls.push({ method: 'resume', slug });
    },
    dispose() {
      calls.push({ method: 'dispose', slug: 'launch-v1' });
    },
  };
  return { engine, calls };
};

const makeStorage = (initial: Record<string, string> = {}): {
  storage: StorageLike;
  data: Record<string, string>;
} => {
  const data = { ...initial };
  const storage: StorageLike = {
    getItem(key) {
      return data[key] ?? null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
  };
  return { storage, data };
};

const makeThrowingStorage = (): StorageLike => ({
  getItem() {
    throw new Error('storage disabled');
  },
  setItem() {
    throw new Error('storage disabled');
  },
  removeItem() {
    throw new Error('storage disabled');
  },
});

beforeEach(() => {
  // Each test starts fresh — no persistent state.
});

// ---------------------------------------------------------------------
// Constants / utilities

describe('Golden Record constants', () => {
  it('exposes exactly 5 chapter slugs', () => {
    expect(GOLDEN_RECORD_CHAPTER_SLUGS).toHaveLength(5);
    expect([...GOLDEN_RECORD_CHAPTER_SLUGS]).toEqual([
      'launch-v1',
      'launch-v2',
      'pale-blue-dot',
      'v1-heliopause',
      'v2-heliopause',
    ]);
  });

  it('maps each slug to a runtime URL under /audio/golden-record/', () => {
    for (const slug of GOLDEN_RECORD_CHAPTER_SLUGS) {
      const url = AUDIO_BY_CHAPTER_SLUG[slug];
      expect(url).toMatch(/^\/audio\/golden-record\/[^/]+\.m4a$/);
      // Slug must appear in the URL — the filename matches the slug.
      expect(url).toContain(slug);
    }
  });

  it('isGoldenRecordSlug type-guard rejects non-Golden-Record slugs', () => {
    expect(isGoldenRecordSlug('launch-v1')).toBe(true);
    expect(isGoldenRecordSlug('pale-blue-dot')).toBe(true);
    expect(isGoldenRecordSlug('v2-saturn')).toBe(false);
    expect(isGoldenRecordSlug('v1-jupiter')).toBe(false);
    expect(isGoldenRecordSlug('')).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Initial state + toggle

describe('AudioPlaybackService — initial state', () => {
  it('starts with the toggle off, no active slug, not playing', () => {
    const { engine } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    expect(svc.isOn()).toBe(false);
    const state = svc.getState();
    expect(state.on).toBe(false);
    expect(state.activeSlug).toBeNull();
    expect(state.playing).toBe(false);
  });

  it('does not invoke the audio engine on construction', () => {
    const { engine, calls } = makeEngine();
    const { storage } = makeStorage();
    new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    expect(calls).toHaveLength(0);
  });
});

describe('AudioPlaybackService — toggle()', () => {
  it('flips the toggle and notifies subscribers', () => {
    const { engine } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    const received: boolean[] = [];
    svc.subscribe((s) => received.push(s.on));
    svc.toggle();
    expect(svc.isOn()).toBe(true);
    expect(received).toEqual([true]);
    svc.toggle();
    expect(svc.isOn()).toBe(false);
    expect(received).toEqual([true, false]);
  });

  it('setOn(same-value) is a no-op (no notify, no engine call)', () => {
    const { engine, calls } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    const cb = vi.fn();
    svc.subscribe(cb);
    svc.setOn(false); // already false
    expect(cb).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// Chapter enter/exit + engine wiring

describe('AudioPlaybackService — chapter-window activation', () => {
  it('plays nothing when entering a window with toggle off', () => {
    const { engine, calls } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    svc.onChapterEnter('launch-v1');
    // Engine should be prepared but NOT faded in.
    const fadeIns = calls.filter((c) => c.method === 'fadeIn');
    expect(fadeIns).toHaveLength(0);
    expect(svc.getState().playing).toBe(false);
  });

  it('plays the right track when entering a window with toggle on', () => {
    const { engine, calls } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    svc.setOn(true);
    calls.length = 0;
    svc.onChapterEnter('pale-blue-dot');
    const prepareCall = calls.find((c) => c.method === 'prepare');
    expect(prepareCall).toBeDefined();
    expect(prepareCall?.slug).toBe('pale-blue-dot');
    expect(prepareCall?.url).toBe(
      '/audio/golden-record/pale-blue-dot.m4a',
    );
    const fadeInCall = calls.find((c) => c.method === 'fadeIn');
    expect(fadeInCall).toBeDefined();
    expect(fadeInCall?.slug).toBe('pale-blue-dot');
    expect(fadeInCall?.ms).toBe(1500);
    expect(svc.getState().playing).toBe(true);
    expect(svc.getState().activeSlug).toBe('pale-blue-dot');
  });

  it('fades out when leaving the chapter window', () => {
    const { engine, calls } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    svc.setOn(true);
    svc.onChapterEnter('launch-v1');
    calls.length = 0;
    svc.onChapterExit('launch-v1');
    // Service should fade out all slugs once active slug is cleared
    // (the helper iterates all to clean up any residual gain). The one
    // we entered must be present in the fadeOut list.
    const fadeOuts = calls.filter(
      (c) => c.method === 'fadeOut' && c.slug === 'launch-v1',
    );
    expect(fadeOuts).toHaveLength(1);
    expect(fadeOuts[0]?.ms).toBe(1500);
    expect(svc.getState().activeSlug).toBeNull();
    expect(svc.getState().playing).toBe(false);
  });

  it('fades out when toggle flips off mid-window', () => {
    const { engine, calls } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    svc.setOn(true);
    svc.onChapterEnter('v1-heliopause');
    calls.length = 0;
    svc.setOn(false);
    const fadeOuts = calls.filter(
      (c) => c.method === 'fadeOut' && c.slug === 'v1-heliopause',
    );
    expect(fadeOuts).toHaveLength(1);
    expect(svc.getState().playing).toBe(false);
  });

  it('pauses (no fade) when simulation pauses inside a window', () => {
    const { engine, calls } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    svc.setOn(true);
    svc.onChapterEnter('v2-heliopause');
    calls.length = 0;
    svc.onPlayStateChange(false);
    const pauseCalls = calls.filter((c) => c.method === 'pause');
    expect(pauseCalls).toHaveLength(1);
    expect(pauseCalls[0]?.slug).toBe('v2-heliopause');
    // No fade-out on pause — the simulation pause is synchronous.
    const fadeOutCalls = calls.filter((c) => c.method === 'fadeOut');
    expect(fadeOutCalls).toHaveLength(0);
    expect(svc.getState().playing).toBe(false);
  });

  it('resumes via fadeIn when simulation resumes inside a window', () => {
    const { engine, calls } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    svc.setOn(true);
    svc.onChapterEnter('launch-v2');
    svc.onPlayStateChange(false);
    calls.length = 0;
    svc.onPlayStateChange(true);
    const fadeInCalls = calls.filter(
      (c) => c.method === 'fadeIn' && c.slug === 'launch-v2',
    );
    expect(fadeInCalls).toHaveLength(1);
    expect(svc.getState().playing).toBe(true);
  });

  it('outside Golden-Record window: silence is the contract', () => {
    const { engine, calls } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    svc.setOn(true);
    // No chapter entered. No fadeIn should fire.
    const fadeIns = calls.filter((c) => c.method === 'fadeIn');
    expect(fadeIns).toHaveLength(0);
    expect(svc.getState().activeSlug).toBeNull();
    expect(svc.getState().playing).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Session-id-gated localStorage persistence

describe('AudioPlaybackService — persistence', () => {
  it('writes { sessionId, on } to localStorage on toggle', () => {
    const { engine } = makeEngine();
    const { storage, data } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-fresh',
    });
    svc.setOn(true);
    const persisted = JSON.parse(data['voyager.audio-toggle'] ?? '{}');
    expect(persisted).toEqual({ sessionId: 'session-fresh', on: true });
  });

  it('restores toggle state when sessionId matches', () => {
    const { engine } = makeEngine();
    const initial = JSON.stringify({ sessionId: 'session-x', on: true });
    const { storage } = makeStorage({
      'voyager.audio-toggle': initial,
    });
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-x',
    });
    expect(svc.isOn()).toBe(true);
  });

  it('resets toggle to off when sessionId differs', () => {
    const { engine } = makeEngine();
    const initial = JSON.stringify({ sessionId: 'session-old', on: true });
    const { storage } = makeStorage({
      'voyager.audio-toggle': initial,
    });
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-new',
    });
    expect(svc.isOn()).toBe(false);
  });

  it('ignores garbage localStorage values', () => {
    const { engine } = makeEngine();
    const { storage } = makeStorage({
      'voyager.audio-toggle': 'not-json-at-all',
    });
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    expect(svc.isOn()).toBe(false);
  });

  it('ignores well-formed JSON that does not match the expected shape', () => {
    const { engine } = makeEngine();
    const { storage } = makeStorage({
      'voyager.audio-toggle': JSON.stringify({ on: true }), // missing sessionId
    });
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    expect(svc.isOn()).toBe(false);
  });

  it('falls back to in-memory state when storage throws on getItem', () => {
    const { engine } = makeEngine();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage: makeThrowingStorage(),
      generateSessionId: () => 'session-a',
    });
    // Construction must not throw.
    expect(svc.isOn()).toBe(false);
    // Setting on must not throw.
    expect(() => svc.setOn(true)).not.toThrow();
    expect(svc.isOn()).toBe(true);
  });

  it('falls back to in-memory state when storage is null (private mode)', () => {
    const { engine } = makeEngine();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage: null,
      generateSessionId: () => 'session-a',
    });
    expect(svc.isOn()).toBe(false);
    svc.setOn(true);
    expect(svc.isOn()).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Subscriber notify-hardening + dispose

describe('AudioPlaybackService — subscriber lifecycle', () => {
  it('a throwing subscriber does not silence later subscribers', () => {
    const { engine } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    const cb1 = vi.fn(() => {
      throw new Error('subscriber boom');
    });
    const cb2 = vi.fn();
    svc.subscribe(cb1);
    svc.subscribe(cb2);
    // Suppress the expected console.error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    svc.setOn(true);
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('unsubscribe returns a function that stops further notifications', () => {
    const { engine } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    const cb = vi.fn();
    const unsub = svc.subscribe(cb);
    svc.setOn(true);
    unsub();
    svc.setOn(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('dispose() clears subscribers and tears down the engine', () => {
    const { engine, calls } = makeEngine();
    const { storage } = makeStorage();
    const svc = new AudioPlaybackService({
      audioEngine: engine,
      storage,
      generateSessionId: () => 'session-a',
    });
    const cb = vi.fn();
    svc.subscribe(cb);
    svc.dispose();
    svc.setOn(true);
    expect(cb).not.toHaveBeenCalled();
    expect(calls.find((c) => c.method === 'dispose')).toBeDefined();
  });
});
