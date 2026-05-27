/**
 * Shared helper — returns true if a `<v-help-overlay>` is currently open
 * (Story 6.2, Rule 9 second-consumer extraction).
 *
 * The overlay reflects its `open` reactive property to the `data-open`
 * attribute on the host element (see `v-help-overlay.ts` `static
 * properties`):
 *
 *   open: { type: Boolean, reflect: true, attribute: 'data-open' }
 *
 * When the overlay is closed the attribute is absent; when open it is
 * present (the boolean reflect emits the empty string or `"true"`, both
 * of which match the CSS selector `[data-open]`).
 *
 * ## History
 *
 * Originally inlined in `v-audio-toggle.ts` by Story 6.1's code review
 * HIGH-1 resolution (the G shortcut needed to suppress while help is
 * open). Story 6.2 is the second consumer (`<v-hud>` needs the same
 * suppression for the `H` shortcut). Per Rule 9 second-consumer
 * extraction, the helper is hoisted to a shared module rather than
 * duplicated.
 *
 * ## Behaviour
 *
 * Returns `false` when no `<v-help-overlay>` is in the DOM (e.g. embed
 * mode skips the overlay mount per Story 2.5). Embed-mode callers
 * therefore see "help cannot be open" as the natural answer.
 */
export const isHelpOverlayOpen = (target: Document | ShadowRoot = document): boolean => {
  const overlay = target.querySelector('v-help-overlay');
  if (overlay === null) return false;
  return overlay.hasAttribute('data-open');
};
