import { html, css, type TemplateResult } from 'lit';
import { createFocusTrap, type FocusTrap } from 'focus-trap';

import { BaseElement } from './base-element';

/**
 * `<v-help-overlay>` — top-right "?" toggle that opens a centered modal
 * dialog listing the full keyboard shortcut inventory. Story 2.8.
 *
 * ## Wiring
 *
 * The component is self-contained — it owns its own document-level
 * keydown listener (registered in `connectedCallback`, removed in
 * `disconnectedCallback`). In embed mode the host (first-paint) declines
 * to mount the element at all, so no listener is attached and the
 * `?` + `A` shortcuts naturally become no-ops (mirrors Story 2.5's
 * M / 1–9 contract).
 *
 * ## Keyboard contract
 *
 * Global (registered on `document` from `connectedCallback`, skipped when
 * a text input is focused or a Ctrl/Alt/Meta modifier is held):
 *
 *   ?       Toggle the modal (Shift+/ on US keyboard)
 *   A       Navigate to /about via `window.location.assign('/about')`
 *           (mirrors Story 2.7's footer-link cross-pathname pattern —
 *            no pushState before assign per cr-2-7's HIGH fix)
 *
 * Dialog-local (when open):
 *
 *   Esc     Close the modal and restore focus to the trigger
 *
 * Tab / Shift+Tab are constrained by `focus-trap`. Initial focus on
 * open lands on the bottom-right close button per AC5.
 *
 * ## Reduced motion
 *
 * `:host` styles route every transition through `--v-duration-base`;
 * `global.css` flips that token to `0ms` under
 * `@media (prefers-reduced-motion: reduce)` (Story 1.7 defense). No
 * per-component media query is added here.
 *
 * ## ARIA
 *
 * Toggle: native `<button>` with `aria-label`, `aria-expanded`,
 * `aria-controls="help-overlay-dialog"`. The dialog is
 * `role="dialog" aria-modal="true" aria-labelledby="help-title"` per
 * ADR-0025's WAI-ARIA Dialog (Modal) pattern.
 */
export class VHelpOverlay extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        position: fixed;
        /* BUG-E5-008 (2026-05-24): pushed BELOW the HUD top-right column
           to match v-chapter-index. Help icon was overlapping the HUD
           date row at top: var(--v-edge-margin). The 44px right-offset
           preserves the original "stacked-to-the-left-of-chapter-index"
           horizontal arrangement. */
        top: calc(var(--v-edge-margin) + 116px);
        right: calc(var(--v-edge-margin) + 44px);
        z-index: var(--v-z-modal);
        display: block;
        font-family: var(--v-font-sans);
      }

      /* ─── Toggle button — 32×32, quieter than chapter-index ─── */
      .toggle {
        appearance: none;
        background: transparent;
        color: var(--v-color-fg-quiet);
        border: 1px solid var(--v-color-fg-quiet);
        border-radius: 4px;
        width: 32px;
        height: 32px;
        padding: 0;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: var(--v-font-mono);
        font-size: 16px;
        line-height: 1;
        user-select: none;
      }

      .toggle:hover {
        color: var(--v-color-fg);
        border-color: var(--v-color-accent);
      }

      .toggle:focus-visible {
        outline: 2px solid var(--v-color-focus);
        outline-offset: 2px;
      }

      /* ─── Scrim (overlay backdrop) ─── */
      .scrim {
        position: fixed;
        inset: 0;
        background: var(--v-color-overlay-scrim);
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--v-duration-base) var(--v-ease-out);
        z-index: var(--v-z-overlay);
      }

      :host([data-open]) .scrim {
        opacity: 1;
        pointer-events: auto;
      }

      /* ─── Dialog (centered modal) ─── */
      .dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        width: 480px;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 32px);
        background: var(--v-color-bg-elevated);
        border: 1px solid var(--v-color-fg-quiet);
        border-radius: 6px;
        transform: translate(-50%, -50%) scale(0.96);
        opacity: 0;
        pointer-events: none;
        transition:
          opacity var(--v-duration-base) var(--v-ease-out),
          transform var(--v-duration-base) var(--v-ease-out);
        z-index: var(--v-z-modal);
        display: flex;
        flex-direction: column;
        padding: var(--v-space-6);
        overflow-y: auto;
      }

      :host([data-open]) .dialog {
        opacity: 1;
        pointer-events: auto;
        transform: translate(-50%, -50%) scale(1);
      }

      .dialog-title {
        font-size: var(--v-font-size-body);
        font-weight: 600;
        margin: 0 0 var(--v-space-4);
        color: var(--v-color-fg);
        letter-spacing: 0.02em;
      }

      .section {
        margin: 0 0 var(--v-space-4);
      }

      .section:last-of-type {
        margin-bottom: 0;
      }

      .section-heading {
        font-size: var(--v-font-size-caption);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--v-color-fg-muted);
        margin: 0 0 var(--v-space-2);
        padding-bottom: var(--v-space-1);
        border-bottom: 1px solid var(--v-color-divider);
      }

      .shortcuts {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--v-space-2);
      }

      .shortcut {
        display: flex;
        align-items: baseline;
        gap: var(--v-space-3);
      }

      .shortcut-keys {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
        min-width: 100px;
      }

      kbd {
        display: inline-block;
        font-family: var(--v-font-mono);
        font-size: var(--v-size-hud-mono-sm);
        color: var(--v-color-fg);
        background: transparent;
        border: 1px solid var(--v-color-divider);
        border-radius: 3px;
        padding: 1px 6px;
        line-height: 1.4;
        min-width: 18px;
        text-align: center;
      }

      .shortcut-sep {
        color: var(--v-color-fg-muted);
        font-size: var(--v-font-size-caption);
      }

      .shortcut-desc {
        color: var(--v-color-fg-muted);
        font-size: var(--v-font-size-caption);
        line-height: 1.45;
      }

      .close {
        align-self: flex-end;
        margin-top: var(--v-space-4);
        appearance: none;
        background: transparent;
        color: var(--v-color-fg-muted);
        border: 1px solid var(--v-color-divider);
        border-radius: 4px;
        padding: 6px 14px;
        font-family: var(--v-font-sans);
        font-size: var(--v-font-size-caption);
        cursor: pointer;
      }

      .close:hover {
        color: var(--v-color-fg);
        border-color: var(--v-color-accent);
      }

      .close:focus-visible {
        outline: 2px solid var(--v-color-focus);
        outline-offset: 2px;
      }

      /* prefers-reduced-motion is handled centrally in global.css —
         it sets --v-duration-base to 0ms at :root, which collapses
         every transition in this file (scrim fade, dialog scale) to
         instant. Story 1.7 defense pins that single declaration. Do
         NOT add a per-component override here. Mirrors Story 2.3.
       */
    `,
  ];

  static override properties = {
    open: { type: Boolean, reflect: true, attribute: 'data-open' },
  };

  declare open: boolean;

  /**
   * The target the global keyboard listener is attached to. Defaults to
   * `document`; tests pass a different target to isolate listeners.
   */
  keyboardTarget: Document = document;

  /**
   * Navigation callback for the global `A` shortcut. Defaults to
   * `window.location.assign(url)` — the same cross-pathname pattern as
   * Story 2.7's footer link (cr-2-7's HIGH fix: NO pushState before
   * assign). Tests override this to observe without triggering a real
   * navigation.
   */
  navigate: (url: string) => void = (url) => {
    window.location.assign(url);
  };

  private focusTrap: FocusTrap | null = null;
  private detachGlobalKeys: (() => void) | null = null;
  private triggerWasKeyboard = false;

  constructor() {
    super();
    this.open = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.detachGlobalKeys = installGlobalShortcuts(this, this.keyboardTarget);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.detachGlobalKeys !== null) {
      this.detachGlobalKeys();
      this.detachGlobalKeys = null;
    }
    if (this.open) {
      this.closeDialog({ restoreFocus: false });
    }
  }

  /**
   * Toggle the modal. Public so the global keyboard handler can call it
   * without exposing internal state.
   *
   * `viaKeyboard` records whether the open was initiated via the `?`
   * shortcut. On close the dialog uses this flag to decide whether to
   * return focus to the toggle button (mouse / button click) or leave
   * focus on the body (keyboard-initiated open from elsewhere in the
   * page — restoring to the toggle would be a surprise per AC5).
   */
  togglePanel(viaKeyboard: boolean = false): void {
    if (this.open) this.closeDialog({ restoreFocus: true });
    else this.openDialog(viaKeyboard);
  }

  private openDialog(viaKeyboard: boolean): void {
    if (this.open) return;
    this.triggerWasKeyboard = viaKeyboard;
    this.open = true;
    // The focus-trap needs the dialog DOM to be in the shadow root
    // before it activates, so we defer that one until updateComplete
    // settles. The microtask race guard mirrors cr-2-3's fix: if the
    // dialog has been closed synchronously before the microtask runs,
    // do nothing so the focusTrap reference isn't leaked past the
    // next deactivate() (which short-circuits on null).
    void this.updateComplete.then(() => {
      if (!this.open) return;
      this.activateFocusTrap();
    });
  }

  /**
   * Close the modal. `restoreFocus` controls whether focus returns to
   * the toggle button — true for user-initiated closes (Esc, close
   * button), false for component teardown (disconnectedCallback). If
   * the open was initiated via the `?` keyboard shortcut, focus is left
   * on the body rather than yanked to the toggle button (per AC5).
   */
  private closeDialog(opts: { restoreFocus: boolean }): void {
    if (!this.open) return;
    this.open = false;
    this.deactivateFocusTrap();
    if (opts.restoreFocus && !this.triggerWasKeyboard) {
      // Defer one microtask so the dialog's scale-transition + Lit
      // re-render don't race the focus() call. Belt-and-suspenders
      // path for closes that bypass focus-trap deactivation (e.g. Esc
      // handling when the trap was never activated due to a
      // synchronous open/close sequence in tests).
      void this.updateComplete.then(() => {
        const toggle = this.shadowRoot?.querySelector<HTMLButtonElement>(
          '.toggle',
        );
        toggle?.focus();
      });
    }
    this.triggerWasKeyboard = false;
  }

  private activateFocusTrap(): void {
    const dialog = this.shadowRoot?.querySelector<HTMLElement>('.dialog');
    if (dialog === null || dialog === undefined) return;
    this.focusTrap = createFocusTrap(dialog, {
      escapeDeactivates: false, // Esc handled by us
      clickOutsideDeactivates: false, // scrim click handled by us
      returnFocusOnDeactivate: false, // we restore focus explicitly
      initialFocus: () =>
        this.shadowRoot?.querySelector<HTMLButtonElement>('.close') ?? dialog,
      tabbableOptions: {
        getShadowRoot: true,
        displayCheck: 'none',
      },
    });
    try {
      this.focusTrap.activate();
    } catch {
      // Activation can fail in test environments without layout — the
      // dialog keydown handler keeps the dialog functional regardless.
    }
  }

  private deactivateFocusTrap(): void {
    if (this.focusTrap !== null) {
      try {
        this.focusTrap.deactivate();
      } catch {
        // ignore — same defensive posture as activate()
      }
      this.focusTrap = null;
    }
  }

  private onToggleClick = (): void => {
    this.togglePanel(false);
  };

  private onCloseClick = (): void => {
    this.closeDialog({ restoreFocus: true });
  };

  private onScrimClick = (): void => {
    this.closeDialog({ restoreFocus: true });
  };

  private onDialogKeyDown = (e: KeyboardEvent): void => {
    // Keys we own inside the open dialog. Calling stopPropagation()
    // prevents the bubbled keydown from also reaching document-level
    // shortcut handlers — without this an Esc inside the help modal
    // could also reach other Esc handlers in the page. Mirrors Story
    // 2.3's listbox-keydown defence.
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    this.closeDialog({ restoreFocus: true });
  };

  override render(): TemplateResult {
    const openAttr = this.open ? 'true' : 'false';
    return html`
      <button
        type="button"
        class="toggle"
        aria-label=${this.open ? 'Close keyboard shortcuts help' : 'Open keyboard shortcuts help'}
        aria-expanded=${openAttr}
        aria-controls="help-overlay-dialog"
        @click=${this.onToggleClick}
      >
        ?
      </button>
      <div class="scrim" part="scrim" aria-hidden="true" @click=${this.onScrimClick}></div>
      <div
        class="dialog"
        part="dialog"
        id="help-overlay-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        aria-hidden=${this.open ? 'false' : 'true'}
        @keydown=${this.onDialogKeyDown}
      >
        <h1 class="dialog-title" id="help-title">Keyboard shortcuts</h1>

        <section class="section">
          <h2 class="section-heading">Playback</h2>
          <ul class="shortcuts">
            ${this.renderShortcut([['Space']], 'Play / pause')}
            ${this.renderShortcut([['←'], ['→']], 'Scrub by 1 unit', '/')}
            ${this.renderShortcut(
              [['Shift', '←'], ['Shift', '→']],
              'Scrub by 10',
              '/',
            )}
            ${this.renderShortcut([['Home'], ['End']], 'Mission start / end', '/')}
          </ul>
        </section>

        <section class="section">
          <h2 class="section-heading">Navigation</h2>
          <ul class="shortcuts">
            ${this.renderShortcut([['1'], ['…'], ['9']], 'Jump to chapter N', ' ')}
            ${this.renderShortcut([['M']], 'Open chapter index')}
            ${this.renderShortcut([['A']], 'Open About page')}
          </ul>
        </section>

        <section class="section">
          <h2 class="section-heading">Speed</h2>
          <ul class="shortcuts">
            ${this.renderShortcut([['+'], ['-']], 'Adjust by decade-stop', '/')}
            ${this.renderShortcut(
              [['Shift', '+'], ['Shift', '-']],
              'Adjust by 5%',
              '/',
            )}
          </ul>
        </section>

        <section class="section">
          <h2 class="section-heading">Display</h2>
          <ul class="shortcuts">
            ${this.renderShortcut([['H']], 'Toggle HUD')}
            ${this.renderShortcut([['G']], 'Toggle Golden Record audio')}
            ${/* Story 4.10 BUG-008 fix — R restores the default camera framing
                (Story 4.2 AC3 + AC7 / FR33). The shortcut is implemented in
                `boot/camera-restore-affordance.ts`; this entry makes it
                discoverable per Story 2.8's "full inventory" promise. */ ''}
            ${this.renderShortcut([['R']], 'Restore default camera view')}
            ${this.renderShortcut([['?']], 'Open this help overlay')}
            ${this.renderShortcut([['Esc']], 'Close any overlay')}
          </ul>
        </section>

        <button type="button" class="close" @click=${this.onCloseClick}>
          Close
        </button>
      </div>
    `;
  }

  private renderShortcut(
    chords: Array<string[]>,
    description: string,
    separator: string = '',
  ): TemplateResult {
    return html`
      <li class="shortcut">
        <span class="shortcut-keys">
          ${chords.map((chord, ci) => {
            const sep =
              ci > 0 && separator !== ''
                ? html`<span class="shortcut-sep">${separator}</span>`
                : null;
            return html`
              ${sep}
              ${chord.map((key, ki) => {
                const inner = ki > 0
                  ? html`<span class="shortcut-sep">+</span><kbd>${key}</kbd>`
                  : html`<kbd>${key}</kbd>`;
                return inner;
              })}
            `;
          })}
        </span>
        <span class="shortcut-desc">${description}</span>
      </li>
    `;
  }
}

/**
 * Install the document-level keyboard shortcuts owned by the help
 * overlay:
 *
 *   ?        Toggle the modal (Shift+/ on US keyboard)
 *   A        Navigate to /about via window.location.assign
 *
 * Both shortcuts skip when:
 *   - a text input element has focus (input/textarea/contenteditable),
 *     walking shadow roots so a Lit-hosted `<input>` is detected
 *   - a Ctrl/Alt/Meta modifier is held (Shift IS allowed because `?`
 *     itself is Shift+/ on US layouts — we match by `e.key === '?'`
 *     directly so the Shift hold is implicit)
 *   - `A` is suppressed while the help overlay is open (Esc-to-close
 *     is the expected interaction; sending users to /about mid-dialog
 *     would be a surprise)
 *
 * Exported only for connectedCallback to use; not part of the public
 * surface.
 */
const installGlobalShortcuts = (
  overlay: VHelpOverlay,
  target: Document,
): (() => void) => {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (isTextInputFocused(target)) return;
    if (e.key === '?') {
      e.preventDefault();
      overlay.togglePanel(true);
      return;
    }
    if (e.key === 'a' || e.key === 'A') {
      if (overlay.open) return;
      e.preventDefault();
      overlay.navigate('/about');
    }
  };
  target.addEventListener('keydown', onKeyDown);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
  };
};

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
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
};

const isTextInputFocused = (root: Document): boolean => {
  // Walk through Shadow DOM hosts (mirror of v-chapter-index.ts).
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

if (typeof customElements !== 'undefined' && !customElements.get('v-help-overlay')) {
  customElements.define('v-help-overlay', VHelpOverlay);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-help-overlay': VHelpOverlay;
  }
}
