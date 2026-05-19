/**
 * Global keyboard shortcuts (Story 1.10 Task 4).
 *
 * Currently owns `Space` → toggle `clockManager.play()/pause()`. Future
 * stories can extend this module with chapter-jump shortcuts (Story 2.3),
 * help-overlay toggle (Story 2.8), etc.
 *
 * ## Text-input guard
 *
 * `Space` MUST type a literal space when the user is editing an input,
 * textarea, or contenteditable element. We check `document.activeElement`'s
 * tagName + `isContentEditable` flag. The guard also walks composed paths
 * for Shadow-DOM-hosted text inputs (e.g. a Lit-rendered `<input>` inside
 * a component); without the walk, focus inside a Shadow root would report
 * the host element rather than the focused input.
 *
 * ## Lifecycle
 *
 * `installKeyboardShortcuts(clockManager)` attaches the listener to
 * `document` and returns an unsubscribe function. Tests should always
 * call the returned unsubscribe to keep the global listener pool clean.
 */

import type { ClockManager } from '../services/clock-manager';

const isTextInputElement = (el: Element | null): boolean => {
  if (el === null) return false;
  if (el instanceof HTMLInputElement) {
    // Skip checkboxes / radios / buttons — those activate on Space and the
    // browser default is the user's intent. Only text-like inputs absorb.
    const type = (el.type ?? 'text').toLowerCase();
    const NON_TEXT_TYPES = new Set([
      'button',
      'checkbox',
      'radio',
      'submit',
      'reset',
      'image',
      'file',
      'range',
      'color',
    ]);
    return !NON_TEXT_TYPES.has(type);
  }
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
};

const findFocusedTextInput = (root: Document): Element | null => {
  // Walk through any Shadow DOM hosts. activeElement on a Shadow host returns
  // the host; recurse into its shadowRoot.activeElement to find the real
  // focused element.
  let active: Element | null = root.activeElement;
  let depth = 0;
  while (active !== null && depth < 8) {
    if (isTextInputElement(active)) return active;
    const shadow = (active as Element & { shadowRoot?: ShadowRoot | null })
      .shadowRoot;
    if (shadow === null || shadow === undefined) return null;
    const inner = shadow.activeElement;
    if (inner === null || inner === active) return null;
    active = inner;
    depth++;
  }
  return null;
};

/** Exported for unit testing. */
export const shouldSkipSpaceShortcut = (root: Document = document): boolean => {
  return findFocusedTextInput(root) !== null;
};

/**
 * Attach the global Space-key toggle. Returns an unsubscribe function.
 *
 * Idempotent at the instance boundary: calling it twice attaches two
 * listeners (caller's responsibility to track). Tests should always
 * release via the returned function.
 */
export const installKeyboardShortcuts = (
  clockManager: ClockManager,
  target: Document = document,
): (() => void) => {
  const onKeyDown = (e: KeyboardEvent): void => {
    // Match Space by key (' ') OR code ('Space'). Both are equivalent on
    // modern browsers; we accept both because happy-dom under tests may
    // surface either.
    if (e.key !== ' ' && e.code !== 'Space') return;
    if (shouldSkipSpaceShortcut(target)) return;
    // Suppress the default page-scroll on Space.
    e.preventDefault();
    if (clockManager.playing) clockManager.pause();
    else clockManager.play();
  };
  target.addEventListener('keydown', onKeyDown);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
  };
};
