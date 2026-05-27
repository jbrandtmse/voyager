/**
 * Shadow-DOM-aware text-input-focus detection (Story 6.1, extracted per
 * Rule 9 primitive-extraction discipline).
 *
 * Walks the `document.activeElement` chain through up to 8 Shadow-DOM
 * hosts and returns `true` if any element in the chain is a focusable
 * text-input surface (text/email/search `<input>`, `<textarea>`, or any
 * element with `contenteditable` set).
 *
 * ## Why
 *
 * Document-level keyboard shortcuts (`?`, `A`, `G`, `M`, digits, …)
 * must skip when a text input is focused so the user can type in the
 * `<input>` without triggering shortcuts. Lit components host their
 * `<input>` elements inside Shadow DOM, so the document's
 * `activeElement` reports the *host* element, not the inner input —
 * a naive `document.activeElement instanceof HTMLInputElement` check
 * misses the case entirely.
 *
 * The walk is bounded at 8 levels to defend against pathological
 * Shadow-DOM nesting (cycles, deep React/Vue/Lit composition chains).
 *
 * ## History
 *
 * Originally inlined at `web/src/components/v-help-overlay.ts:593–608`
 * (Story 2.8) and `web/src/components/v-chapter-index.ts` (Story 2.3).
 * Story 6.1's `<v-audio-toggle>` is the third consumer, so the helper
 * is extracted to a shared module per Rule 9 (the audio-toggle is the
 * second-consumer trigger; the chapter-index inlines a similar walk
 * but with different bounds — its consolidation is deferred to a
 * future story to keep Story 6.1's diff focused).
 *
 * ## Contract
 *
 * - Returns `false` when no element is focused (e.g. `document.body`).
 * - Returns `false` for non-text `<input>` types (button, checkbox,
 *   radio, submit, reset, image, file, range, color) because keyboard
 *   shortcuts should still fire when the user has focused (say) a
 *   radio button.
 * - Returns `true` for `<input>` without `type` (defaults to `text`),
 *   `<input type="text">`, `<input type="email">`, `<input type="search">`,
 *   `<input type="password">`, etc.
 * - Returns `true` for any `<textarea>`.
 * - Returns `true` for any element whose `isContentEditable` getter
 *   reports true (contenteditable subtree).
 */

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
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

const SHADOW_DOM_WALK_LIMIT = 8;

/**
 * Returns `true` if the given element is a focusable text-input surface
 * (text/email/search/password `<input>`, `<textarea>`, or
 * `contenteditable` host).
 */
export const isTextInputElement = (el: Element | null): boolean => {
  if (el === null) return false;
  if (el instanceof HTMLInputElement) {
    const type = (el.type ?? 'text').toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
};

/**
 * Returns `true` if the document's currently-focused element (walking
 * through Shadow-DOM hosts up to `SHADOW_DOM_WALK_LIMIT` levels) is a
 * text-input surface.
 *
 * Use this to gate document-level keyboard shortcuts so they skip while
 * the user is typing — Lit components host their `<input>` elements
 * inside Shadow DOM, so a naive `document.activeElement` check misses
 * the inner input.
 */
export const isTextInputFocused = (root: Document): boolean => {
  let active: Element | null = root.activeElement;
  let depth = 0;
  while (active !== null && depth < SHADOW_DOM_WALK_LIMIT) {
    if (isTextInputElement(active)) return true;
    const shadow = (active as Element & { shadowRoot?: ShadowRoot | null })
      .shadowRoot;
    if (shadow === null || shadow === undefined) return false;
    const inner = shadow.activeElement;
    if (inner === null || inner === active) return false;
    active = inner;
    depth++;
  }
  return false;
};
