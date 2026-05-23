/**
 * Camera-restore affordance — mounts the `<button class="restore-camera">`
 * adjacent to `<v-speed-multiplier>` in the HUD chrome row, and installs
 * the global `R` keyboard shortcut. Both surfaces route to the same
 * `VoyagerCameraController.restore()` call (Story 4.2 AC3 + AC4 + AC7).
 *
 * ## DOM contract (AC4)
 *
 * The button is a Light-DOM `<button>` (NOT a Lit custom element — a single
 * native button doesn't warrant the wrapper):
 *
 *   <button class="restore-camera"
 *           type="button"
 *           aria-label="Restore default camera framing"
 *   >
 *     <span aria-hidden="true">↺</span>
 *   </button>
 *
 * Visibility is governed by a CSS attribute selector reading the host's
 * `data-manual-camera` attribute: `display: none` by default,
 * `display: inline-flex` when `[data-manual-camera="true"]` is on the host.
 * The host element is supplied by the caller (typically `canvas.parentElement`
 * or `document.body`); the affordance writes `data-manual-camera` to it
 * via a `RenderEngine.onManualCameraChange` subscription.
 *
 * Embed mode (Story 2.5): the affordance STILL mounts. This is the
 * "simulation-not-chrome" carve-out — manual camera control is
 * simulation content (the visitor inspecting the encounter), distinct
 * from the chapter-index / about / help icons which are pure chrome.
 *
 * ## Keyboard contract (AC7)
 *
 * The `R` document-level keydown listener mirrors Story 2.8's
 * `<v-help-overlay>` text-input gate:
 *   - returns early if `document.activeElement` is a text input
 *     (input/textarea/select/contenteditable), walking shadow roots
 *   - returns early if Ctrl/Cmd/Alt modifiers are held (so Ctrl+R reload
 *     still works); Shift is allowed (Shift+drag is the roll modifier per
 *     Architecture Decision 3c)
 *   - returns early if `event.defaultPrevented === true`
 *
 * Like the button, the keyboard listener attaches in embed mode too.
 */

import type { VoyagerCameraController } from '../render/voyager-camera-controller';
import type { RenderEngine } from '../render/render-engine';

const isTextInputElement = (el: Element | null): boolean => {
  if (el === null) return false;
  if (el instanceof HTMLInputElement) {
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
  if (el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
};

/**
 * Walk through any Shadow DOM hosts to find the actually-focused element.
 * `document.activeElement` on a Shadow-DOM host returns the host element
 * itself; we recurse into `shadowRoot.activeElement` to detect a Lit-
 * hosted text input. Mirrors `<v-help-overlay>`'s `isTextInputFocused`.
 */
const isTextInputFocused = (root: Document): boolean => {
  let active: Element | null = root.activeElement;
  let depth = 0;
  while (active !== null && depth < 8) {
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

export interface CameraRestoreAffordanceOptions {
  /** The parent element the button is appended to (mounts as sibling of speed-multiplier). */
  host: HTMLElement;
  /** Element that receives the `data-manual-camera` attribute promotion. */
  attributeHost: HTMLElement;
  /** Controller whose `restore()` method is called on R / click. */
  controller: VoyagerCameraController;
  /** Engine whose `manualCameraActive` flag the affordance subscribes to. */
  renderEngine: RenderEngine;
  /** Optional: keyboard target (defaults to `document`). Tests inject. */
  keyboardTarget?: Document;
}

export interface CameraRestoreAffordanceHandle {
  /** The mounted button element. */
  button: HTMLButtonElement;
  /** Disposes all listeners + removes the button from the DOM. */
  dispose: () => void;
}

/**
 * Mount the restore button + install the global R shortcut. Returns a
 * handle that the caller (`first-paint.ts`) folds into its dispose path.
 */
export const mountCameraRestoreAffordance = (
  options: CameraRestoreAffordanceOptions,
): CameraRestoreAffordanceHandle => {
  const { host, attributeHost, controller, renderEngine } = options;
  const keyboardTarget = options.keyboardTarget ?? document;

  // Build the button (Light DOM — no Lit, no shadow root).
  const button = document.createElement('button');
  button.className = 'restore-camera';
  button.type = 'button';
  button.setAttribute('aria-label', 'Restore default camera framing');
  const glyph = document.createElement('span');
  glyph.setAttribute('aria-hidden', 'true');
  // U+21BA ANTICLOCKWISE OPEN CIRCLE ARROW.
  glyph.textContent = '↺';
  button.appendChild(glyph);
  host.appendChild(button);

  const onClick = (): void => {
    controller.restore();
  };
  button.addEventListener('click', onClick);

  // Subscribe to manual-camera flag transitions; promote / demote the
  // host's `data-manual-camera` attribute. Initial value reflects the
  // engine's current state (false at boot).
  const applyAttr = (active: boolean): void => {
    if (active) {
      attributeHost.setAttribute('data-manual-camera', 'true');
    } else {
      attributeHost.removeAttribute('data-manual-camera');
    }
  };
  applyAttr(renderEngine.manualCameraActive);
  const unsubscribe = renderEngine.onManualCameraChange(applyAttr);

  // Global R keyboard shortcut — mirror Story 2.8 text-input gate.
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    // Allow Shift (it's the roll modifier per Architecture Decision 3c)
    // but block Ctrl / Cmd / Alt so Ctrl+R reload + other browser
    // shortcuts still work.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'r' && e.key !== 'R') return;
    if (isTextInputFocused(keyboardTarget)) return;
    e.preventDefault();
    controller.restore();
  };
  keyboardTarget.addEventListener('keydown', onKeyDown);

  const dispose = (): void => {
    button.removeEventListener('click', onClick);
    keyboardTarget.removeEventListener('keydown', onKeyDown);
    unsubscribe();
    if (button.isConnected) button.remove();
  };

  return { button, dispose };
};
