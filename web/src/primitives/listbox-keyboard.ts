/**
 * APG Listbox keyboard primitive.
 *
 * Implements the keyboard contract from the WAI-ARIA Authoring Practices
 * Guide's Listbox pattern:
 *
 *   https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
 *
 *   ArrowDown   Move roving focus to next option (clamped at last index).
 *   ArrowUp     Move roving focus to previous option (clamped at index 0).
 *   Home        Jump roving focus to index 0.
 *   End         Jump roving focus to last index.
 *   Enter       Activate the focused option.
 *   Space       Activate the focused option (APG-equivalent of Enter).
 *   Escape      Close / dismiss (when the listbox is inside a modal).
 *
 * All handled keys call both `preventDefault()` AND `stopPropagation()`.
 * The stopPropagation is essential: real-browser KeyboardEvents are
 * `composed: true` so they cross open shadow roots, which means a global
 * Space-toggle-play listener at the document level would ALSO fire on
 * APG-required Space-activates-option without the stop. Same defence for
 * Escape vs document-level shortcut layers (e.g. `<v-help-overlay>` close).
 *
 * The primitive is a pure handler factory: it returns a
 * `(e: KeyboardEvent) => void` that the component installs via Lit's
 * `@keydown=${...}` template binding. It contains NO state — the consumer
 * owns the option count, the current focused index, the focus-move side
 * effect, and the activation/close side effects.
 *
 * ## ADR-0025 compliance
 *
 * Per ADR-0025 § "Decision", the primitive belongs at
 * `web/src/primitives/listbox-keyboard.ts` (this file) and components
 * "compose primitives via mixin or delegation — no APG keyboard logic
 * embedded directly in component code." Story 3.0 AC4 path (a) extracts
 * this primitive out of `<v-chapter-index>`'s inline `onListboxKeyDown`
 * so the obligation is satisfied.
 */

/** Options passed to `createListboxKeyboardHandler`. */
export interface ListboxKeyboardOptions {
  /** Read the option count at handle-fire time. */
  getOptionCount: () => number;
  /** Read the currently-focused index at handle-fire time. */
  getFocusedIndex: () => number;
  /**
   * Move roving focus to `index` (the primitive has already clamped it
   * into `[0, optionCount - 1]`). The consumer typically updates a
   * `tabindex=0` attribute on the matching option and calls `.focus()`
   * on it after the next render.
   */
  onMoveFocus: (index: number) => void;
  /** Activate the option at the focused index (Enter / Space). */
  onActivate: () => void;
  /**
   * Optional: handle Escape (typically closes the panel / dismisses the
   * modal). When omitted, Escape is ignored and bubbles to the parent.
   */
  onClose?: () => void;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Build a keydown handler implementing the APG Listbox contract.
 *
 * Returns `(e: KeyboardEvent) => void`. The handler does nothing (and does
 * NOT call preventDefault/stopPropagation) for keys outside the APG
 * contract — the parent keydown listener is free to handle them.
 */
export const createListboxKeyboardHandler = (
  options: ListboxKeyboardOptions,
): ((e: KeyboardEvent) => void) => {
  return (e: KeyboardEvent): void => {
    const handled =
      e.key === 'ArrowDown' ||
      e.key === 'ArrowUp' ||
      e.key === 'Home' ||
      e.key === 'End' ||
      e.key === 'Enter' ||
      e.key === ' ' ||
      e.key === 'Escape';
    if (!handled) return;
    e.preventDefault();
    e.stopPropagation();
    const count = options.getOptionCount();
    if (count === 0 && e.key !== 'Escape') return;
    switch (e.key) {
      case 'ArrowDown':
        options.onMoveFocus(clamp(options.getFocusedIndex() + 1, 0, count - 1));
        break;
      case 'ArrowUp':
        options.onMoveFocus(clamp(options.getFocusedIndex() - 1, 0, count - 1));
        break;
      case 'Home':
        options.onMoveFocus(0);
        break;
      case 'End':
        options.onMoveFocus(count - 1);
        break;
      case 'Enter':
      case ' ':
        options.onActivate();
        break;
      case 'Escape':
        options.onClose?.();
        break;
    }
  };
};
