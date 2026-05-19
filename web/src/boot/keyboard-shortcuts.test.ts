// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  installKeyboardShortcuts,
  shouldSkipSpaceShortcut,
} from './keyboard-shortcuts';
import { ClockManager } from '../services/clock-manager';

describe('Story 1.10 AC3 Task 4 — global Space toggle', () => {
  let off: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    if (off !== null) off();
    off = null;
    document.body.innerHTML = '';
  });

  it('Space (key=" ") on document toggles play/pause', () => {
    const clock = new ClockManager();
    off = installKeyboardShortcuts(clock);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(clock.playing).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(clock.playing).toBe(false);
  });

  it('Space (code="Space") on document toggles play/pause', () => {
    const clock = new ClockManager();
    off = installKeyboardShortcuts(clock);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(clock.playing).toBe(true);
  });

  it('preventDefault is called to suppress page scroll', () => {
    const clock = new ClockManager();
    off = installKeyboardShortcuts(clock);
    const evt = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('ignores non-Space keys', () => {
    const clock = new ClockManager();
    off = installKeyboardShortcuts(clock);
    const evt = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    document.dispatchEvent(evt);
    expect(clock.playing).toBe(false);
    expect(evt.defaultPrevented).toBe(false);
  });
});

describe('Story 1.10 AC3 Task 4 — text input guard (Space types a character)', () => {
  let off: (() => void) | null = null;
  afterEach(() => {
    if (off !== null) off();
    off = null;
    document.body.innerHTML = '';
  });

  it('skips when an <input type="text"> is focused', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    const clock = new ClockManager();
    off = installKeyboardShortcuts(clock);
    const evt = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(evt);
    expect(clock.playing).toBe(false);
    expect(evt.defaultPrevented).toBe(false);
  });

  it('skips when a <textarea> is focused', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    const clock = new ClockManager();
    off = installKeyboardShortcuts(clock);
    const evt = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(evt);
    expect(clock.playing).toBe(false);
    expect(evt.defaultPrevented).toBe(false);
  });

  it('skips when a contenteditable element is focused', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.tabIndex = 0;
    document.body.appendChild(div);
    div.focus();
    const clock = new ClockManager();
    off = installKeyboardShortcuts(clock);
    const evt = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(evt);
    expect(clock.playing).toBe(false);
    expect(evt.defaultPrevented).toBe(false);
  });

  it('does NOT skip when a non-text input (checkbox) has focus', () => {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    document.body.appendChild(cb);
    cb.focus();
    const clock = new ClockManager();
    off = installKeyboardShortcuts(clock);
    const evt = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(evt);
    // Checkboxes activate on Space natively, but the toggle isn't suppressed.
    // The actual native checkbox toggle happens via the browser default; our
    // global handler runs alongside. We accept the click on the toggle path.
    expect(clock.playing).toBe(true);
  });

  it('shouldSkipSpaceShortcut returns true for focused input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    expect(shouldSkipSpaceShortcut()).toBe(true);
  });

  it('shouldSkipSpaceShortcut returns false when body has focus', () => {
    expect(shouldSkipSpaceShortcut()).toBe(false);
  });
});

describe('Story 1.10 AC3 Task 4 — unsubscribe', () => {
  it('unsubscribe stops the handler from firing', () => {
    const clock = new ClockManager();
    const off = installKeyboardShortcuts(clock);
    off();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(clock.playing).toBe(false);
  });
});
