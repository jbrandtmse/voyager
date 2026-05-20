// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { startFirstPaint } from '../src/boot/first-paint';

/**
 * Story 3.0 AC6 — `startFirstPaint().dispose()` removes ALL mounted elements
 * from the host DOM. The pre-Story-3.0 implementation detached the keyboard
 * listener and frame callback but left the custom elements in place, so a
 * caller invoking `dispose()` then re-running `startFirstPaint()` would
 * accumulate stale elements.
 *
 * The mounted element set grew across Stories 1.11 (v-hud), 2.3
 * (v-chapter-index), 2.5 (skip-mount in embed mode), 2.8 (v-help-overlay),
 * and 2.9 (v-chapter-copy) — the 1.10-era deferral wording named only four
 * elements. This test covers all of them and BOTH embed-mode (no
 * chapterIndex / helpOverlay) and non-embed-mode.
 */
describe('Story 3.0 AC6 — first-paint dispose() removes all mounted elements', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  const NON_EMBED_TAGS = [
    'v-title-card',
    'v-timeline-scrubber',
    'v-play-button',
    'v-speed-multiplier',
    'v-hud',
    'v-chapter-index',
    'v-help-overlay',
  ] as const;

  const EMBED_TAGS = [
    // chapterIndex + helpOverlay are NOT mounted in embed mode (Story 2.5 / 2.8)
    'v-title-card',
    'v-timeline-scrubber',
    'v-play-button',
    'v-speed-multiplier',
    'v-hud',
  ] as const;

  const countAll = (tags: readonly string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const tag of tags) {
      out[tag] = document.querySelectorAll(tag).length;
    }
    return out;
  };

  describe('non-embed mode', () => {
    it('after startFirstPaint(), DOM contains exactly one set of mounted elements', () => {
      startFirstPaint(document.body);
      const counts = countAll(NON_EMBED_TAGS);
      for (const tag of NON_EMBED_TAGS) {
        expect(counts[tag], `expected exactly one <${tag}>`).toBe(1);
      }
    });

    it('after startFirstPaint() then dispose(), DOM contains zero mounted elements', () => {
      const handle = startFirstPaint(document.body);
      handle.dispose();
      const counts = countAll(NON_EMBED_TAGS);
      for (const tag of NON_EMBED_TAGS) {
        expect(counts[tag], `expected zero <${tag}> after dispose`).toBe(0);
      }
    });

    it('after startFirstPaint() → dispose() → startFirstPaint(), DOM contains exactly one set (no accumulation)', () => {
      const handle1 = startFirstPaint(document.body);
      handle1.dispose();
      startFirstPaint(document.body);
      const counts = countAll(NON_EMBED_TAGS);
      for (const tag of NON_EMBED_TAGS) {
        expect(counts[tag], `expected exactly one <${tag}> after re-start`).toBe(1);
      }
    });

    it('dispose() is safe after the title-card has already auto-removed (isConnected guard)', async () => {
      const handle = startFirstPaint(document.body);
      // Manually remove the title-card to simulate the onComplete-driven path
      // where it has already detached itself before dispose() runs.
      handle.titleCard.remove();
      expect(document.querySelectorAll('v-title-card').length).toBe(0);
      // dispose() must not throw and must still clean up the other elements.
      expect(() => handle.dispose()).not.toThrow();
      for (const tag of NON_EMBED_TAGS) {
        expect(document.querySelectorAll(tag).length).toBe(0);
      }
    });
  });

  describe('embed mode (chapterIndex + helpOverlay absent)', () => {
    it('after startFirstPaint({embedEnabled:true}), only the embed-content elements mount', () => {
      startFirstPaint(document.body, { embedEnabled: true });
      // The embed-content elements are present.
      for (const tag of EMBED_TAGS) {
        expect(document.querySelectorAll(tag).length, `expected one <${tag}> in embed`).toBe(1);
      }
      // The chrome elements are absent.
      expect(document.querySelectorAll('v-chapter-index').length).toBe(0);
      expect(document.querySelectorAll('v-help-overlay').length).toBe(0);
    });

    it('after startFirstPaint({embedEnabled:true}) then dispose(), DOM contains zero mounted elements', () => {
      const handle = startFirstPaint(document.body, { embedEnabled: true });
      handle.dispose();
      for (const tag of EMBED_TAGS) {
        expect(document.querySelectorAll(tag).length).toBe(0);
      }
      expect(document.querySelectorAll('v-chapter-index').length).toBe(0);
      expect(document.querySelectorAll('v-help-overlay').length).toBe(0);
    });

    it('after embed startFirstPaint() → dispose() → embed startFirstPaint(), exactly one set (no accumulation)', () => {
      const handle1 = startFirstPaint(document.body, { embedEnabled: true });
      handle1.dispose();
      startFirstPaint(document.body, { embedEnabled: true });
      for (const tag of EMBED_TAGS) {
        expect(document.querySelectorAll(tag).length, `expected one <${tag}> after re-start`).toBe(1);
      }
      expect(document.querySelectorAll('v-chapter-index').length).toBe(0);
      expect(document.querySelectorAll('v-help-overlay').length).toBe(0);
    });

    it('embed dispose() handles null chapterIndex / helpOverlay without throwing', () => {
      const handle = startFirstPaint(document.body, { embedEnabled: true });
      expect(handle.chapterIndex).toBeNull();
      expect(handle.helpOverlay).toBeNull();
      expect(() => handle.dispose()).not.toThrow();
    });
  });

  describe('cross-mode regression — boot → embed switch (no stale leftovers)', () => {
    it('non-embed boot → dispose → embed boot leaves no chapterIndex / helpOverlay from the first boot', () => {
      const handle1 = startFirstPaint(document.body);
      // The first boot DID mount the chrome elements.
      expect(document.querySelectorAll('v-chapter-index').length).toBe(1);
      expect(document.querySelectorAll('v-help-overlay').length).toBe(1);
      handle1.dispose();
      // dispose must remove them so the subsequent embed boot doesn't inherit them.
      expect(document.querySelectorAll('v-chapter-index').length).toBe(0);
      expect(document.querySelectorAll('v-help-overlay').length).toBe(0);
      startFirstPaint(document.body, { embedEnabled: true });
      expect(document.querySelectorAll('v-chapter-index').length).toBe(0);
      expect(document.querySelectorAll('v-help-overlay').length).toBe(0);
    });
  });
});
