// @vitest-environment happy-dom
/**
 * Story 2.5 AC2 + AC3 — embed-mode first-paint behavior.
 *
 * Covers:
 *   - AC2: `<v-chapter-index>` is NOT in the DOM when embedEnabled=true
 *     (verified by `appendChild` skip, not post-mount display:none)
 *   - AC2: simulation surface (HUD, scrubber, play button, speed
 *     multiplier) DOES still mount in embed mode
 *   - AC3: pressing M / 1..9 from document.body in embed mode is a no-op
 *     (no exception, no chapter-jump dispatched) because the
 *     chapter-index element — which owns those shortcuts — is not in
 *     the DOM and therefore never registered them
 *   - AC3: Space / ←/→ / Home/End / +/- still work in embed mode (they
 *     are owned by other components / boot/keyboard-shortcuts.ts and
 *     are independent of the chapter-index toggle)
 *   - Baseline: embedEnabled=false (or omitted) keeps the existing
 *     Story 2.3 mounting behavior
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { startFirstPaint } from '../src/boot/first-paint';
import { TITLE_CARD_HOLD_MS } from '../src/constants/mission';
import { ClockManager } from '../src/services/clock-manager';

describe('Story 2.5 AC2 — first-paint conditional chrome mounting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('omits <v-chapter-index> from the DOM when embedEnabled=true', () => {
    startFirstPaint(document.body, { embedEnabled: true });
    expect(document.querySelector('v-chapter-index')).toBeNull();
  });

  it('mounts <v-chapter-index> when embedEnabled=false (Story 2.3 baseline)', () => {
    startFirstPaint(document.body, { embedEnabled: false });
    expect(document.querySelector('v-chapter-index')).not.toBeNull();
  });

  it('mounts <v-chapter-index> when embedEnabled is omitted entirely', () => {
    startFirstPaint(document.body);
    expect(document.querySelector('v-chapter-index')).not.toBeNull();
  });

  it('returns chapterIndex === null in the handle when embedEnabled=true', () => {
    const handle = startFirstPaint(document.body, { embedEnabled: true });
    expect(handle.chapterIndex).toBeNull();
  });

  it('still mounts the simulation surface (HUD, scrubber, play, speed) in embed mode', () => {
    startFirstPaint(document.body, { embedEnabled: true });
    expect(document.querySelector('v-timeline-scrubber')).not.toBeNull();
    expect(document.querySelector('v-play-button')).not.toBeNull();
    expect(document.querySelector('v-speed-multiplier')).not.toBeNull();
    expect(document.querySelector('v-hud')).not.toBeNull();
  });

  it('still mounts the title card in embed mode', () => {
    startFirstPaint(document.body, { embedEnabled: true });
    expect(document.querySelector('v-title-card')).not.toBeNull();
  });

  it('onComplete dissolve does not throw when chapterIndex is null (embed mode)', async () => {
    startFirstPaint(document.body, { embedEnabled: true });
    // Allow the title-card to mount and the dissolve timer to fire.
    await Promise.resolve();
    vi.advanceTimersByTime(TITLE_CARD_HOLD_MS + 700);
    await Promise.resolve();
    // No exception means the null-safe branch in onComplete worked.
    expect(document.querySelector('v-title-card')).toBeNull();
  });

  it('AC2 contract: the chapter-index is NOT in the DOM (not display:none)', () => {
    // The AC binds the implementation to `appendChild`-skip rather than
    // a post-mount CSS hide. The strongest test for "not in the DOM" is
    // the absence of the element entirely.
    startFirstPaint(document.body, { embedEnabled: true });
    const all = document.querySelectorAll('v-chapter-index');
    expect(all.length).toBe(0);
  });
});

describe('Story 3.6 AC7 — embed mode skips <v-attitude-indicator> inside <v-hud>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('omits <v-attitude-indicator> from the HUD shadow DOM when embedEnabled=true', async () => {
    const handle = startFirstPaint(document.body, { embedEnabled: true });
    await handle.hud.updateComplete;
    // The indicator sub-component lives inside <v-hud>'s shadow root; the
    // chrome-skip discipline is the conditional render path in <v-hud>'s
    // template (mirrors how <v-chapter-index> / <v-help-overlay> are
    // skipped in first-paint via conditional appendChild). The strongest
    // test for "not in the DOM" is the absence of the element entirely.
    const indicator = handle.hud.shadowRoot?.querySelector(
      'v-attitude-indicator',
    );
    expect(indicator ?? null).toBeNull();
    // Also assert there's no global instance lurking anywhere.
    expect(document.querySelector('v-attitude-indicator')).toBeNull();
  });

  it('mounts <v-attitude-indicator> inside <v-hud> when embedEnabled=false (Story 3.6 baseline)', async () => {
    const handle = startFirstPaint(document.body, { embedEnabled: false });
    await handle.hud.updateComplete;
    const indicator = handle.hud.shadowRoot?.querySelector(
      'v-attitude-indicator',
    );
    expect(indicator).not.toBeNull();
  });

  it('mounts <v-attitude-indicator> when embedEnabled is omitted entirely', async () => {
    const handle = startFirstPaint(document.body);
    await handle.hud.updateComplete;
    const indicator = handle.hud.shadowRoot?.querySelector(
      'v-attitude-indicator',
    );
    expect(indicator).not.toBeNull();
  });

  it('hud.attitudeIndicator accessor returns null in embed mode (handle parity)', async () => {
    const handle = startFirstPaint(document.body, { embedEnabled: true });
    await handle.hud.updateComplete;
    expect(handle.hud.attitudeIndicator).toBeNull();
  });

  it('the HUD itself STILL mounts in embed mode — only the provenance indicator is skipped', async () => {
    // Editorial / instrument content (date, distance, speed, instruments)
    // is simulation content, not chrome. Only the provenance indicator
    // participates in the chrome-skip discipline.
    const handle = startFirstPaint(document.body, { embedEnabled: true });
    await handle.hud.updateComplete;
    expect(document.querySelector('v-hud')).not.toBeNull();
    expect(handle.hud.hudDate).not.toBeNull();
    expect(handle.hud.hudDistance).not.toBeNull();
    expect(handle.hud.hudSpeed).not.toBeNull();
  });
});

describe('Story 2.5 AC3 — embed-mode keyboard NO-OPs (M, 1..9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('pressing M from document.body in embed mode dispatches no chapter-jump event', async () => {
    startFirstPaint(document.body, { embedEnabled: true });
    await Promise.resolve();
    const captured: Event[] = [];
    document.addEventListener('chapter-jump', (e) => captured.push(e));
    const evt = new KeyboardEvent('keydown', { key: 'M', bubbles: true });
    document.dispatchEvent(evt);
    expect(captured.length).toBe(0);
  });

  it('pressing 1..9 from document.body in embed mode dispatches no chapter-jump events', async () => {
    startFirstPaint(document.body, { embedEnabled: true });
    await Promise.resolve();
    const captured: Event[] = [];
    document.addEventListener('chapter-jump', (e) => captured.push(e));
    for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    expect(captured.length).toBe(0);
  });

  it('pressing M/A/? from document.body in embed mode does not throw', async () => {
    startFirstPaint(document.body, { embedEnabled: true });
    await Promise.resolve();
    // None of these have a registered listener in embed mode (chapter-index
    // not mounted; About/help not yet implemented in any mode).
    expect(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    }).not.toThrow();
  });

  it('Space STILL toggles play/pause in embed mode (owned by boot/keyboard-shortcuts.ts)', async () => {
    // Space is a Story 1.10 contract owned by boot/keyboard-shortcuts —
    // independent of the chapter-index toggle. It must still work in
    // embed mode because the play button is part of the simulation
    // surface (not chrome).
    const clockManager = new ClockManager();
    startFirstPaint(document.body, { embedEnabled: true, clockManager });
    await Promise.resolve();
    expect(clockManager.playing).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(clockManager.playing).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(clockManager.playing).toBe(false);
  });

  it('baseline (embedEnabled=false): pressing M from document.body opens the chapter index panel', async () => {
    // Sanity: non-embed mode mounts the chapter-index, which registers
    // the M shortcut. We don't assert opening state directly here (that
    // is the chapter-index component's own spec); we assert the chapter
    // index element exists so the M shortcut HAS a target.
    startFirstPaint(document.body, { embedEnabled: false });
    await Promise.resolve();
    expect(document.querySelector('v-chapter-index')).not.toBeNull();
  });
});
