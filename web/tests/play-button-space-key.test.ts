// @vitest-environment happy-dom
//
// Story 1.10 Task 10 — integration test for the global Space-key toggle
// across various active-element states (nothing focused, button focused,
// input focused, textarea focused, contenteditable focused).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { installKeyboardShortcuts } from '../src/boot/keyboard-shortcuts';
import { ClockManager } from '../src/services/clock-manager';
import '../src/components/v-play-button';
import type { VPlayButton } from '../src/components/v-play-button';

describe('Story 1.10 — Space-key integration across activeElement states', () => {
  let off: (() => void) | null = null;
  let clock: ClockManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    clock = new ClockManager();
    off = installKeyboardShortcuts(clock);
  });

  afterEach(() => {
    if (off !== null) off();
    off = null;
    document.body.innerHTML = '';
  });

  it('Space with no element focused toggles the clock', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(clock.playing).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(clock.playing).toBe(false);
  });

  it('Space when an <input type="text"> is focused does NOT toggle', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(clock.playing).toBe(false);
  });

  it('Space when an <input type="email"> is focused does NOT toggle (text-like input)', () => {
    const input = document.createElement('input');
    input.type = 'email';
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(clock.playing).toBe(false);
  });

  it('Space when a <textarea> is focused does NOT toggle', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(clock.playing).toBe(false);
  });

  it('Space when a contenteditable div is focused does NOT toggle', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.tabIndex = 0;
    document.body.appendChild(div);
    div.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(clock.playing).toBe(false);
  });

  it('Space when a <button> is focused DOES toggle (button is not a text input)', () => {
    const btn = document.createElement('button');
    btn.textContent = 'unrelated';
    document.body.appendChild(btn);
    btn.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(clock.playing).toBe(true);
  });

  it('Space integrates with <v-play-button>: button reflects the new playing state', async () => {
    const playBtn = document.createElement('v-play-button') as VPlayButton;
    playBtn.clockManager = clock;
    document.body.appendChild(playBtn);
    await playBtn.updateComplete;
    expect(playBtn.shadowRoot!.querySelector('button')!.getAttribute('aria-label')).toBe('Play');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await playBtn.updateComplete;
    expect(clock.playing).toBe(true);
    expect(playBtn.shadowRoot!.querySelector('button')!.getAttribute('aria-label')).toBe('Pause');
  });
});
