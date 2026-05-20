import { html, css, type TemplateResult } from 'lit';
import { createFocusTrap, type FocusTrap } from 'focus-trap';

import { BaseElement } from './base-element';
import { ALL_CHAPTERS } from '../chapters/registry';
import { isoFromEt } from '../math/et-conversions';
import { createListboxKeyboardHandler } from '../primitives/listbox-keyboard';
import type { ClockManager } from '../services/clock-manager';
import type { ChapterDirector } from '../services/chapter-director';
import type { ChapterSpec } from '../types/chapter';

/**
 * `<v-chapter-index>` — top-right hamburger toggle that opens a slide-in
 * listbox of all 11 mission chapters. Story 2.3.
 *
 * ## Wiring
 *
 * The component is wired with a `clockManager` (Story 1.10) and a
 * `chapterDirector` (Story 2.1). The director's `activeChapter` drives the
 * `aria-current` annotation on the option matching the held chapter; the
 * clock receives `scrubTo(anchorEt)` calls when the user activates an
 * option (via click, Enter, or a global `1`–`9` digit shortcut).
 *
 * Every activation also dispatches a bubbling+composed `chapter-jump`
 * CustomEvent — the same shape Story 2.2's scrubber markers emit:
 *
 *   new CustomEvent('chapter-jump', {
 *     detail: { slug, anchorEt },
 *     bubbles: true,
 *     composed: true,
 *   })
 *
 * Story 2.4's URL router will listen at the document level and write the
 * slug to the URL on receipt, from either source.
 *
 * ## Keyboard contract
 *
 * Global (registered on `document` from `connectedCallback`, skipped when
 * a text input is focused or a Ctrl/Alt/Meta modifier is held):
 *
 *   M       Toggle the panel
 *   1..9    Activate chapter at index N-1 of ALL_CHAPTERS (chronological)
 *           (chapters 10/11 are reachable only via the index or markers)
 *
 * Panel-local (when open):
 *
 *   ↑/↓     Move roving focus to previous/next option
 *   Home    First option
 *   End     Last option
 *   Enter   Activate focused option (scrubTo + chapter-jump + close)
 *   Esc     Close without activation
 *
 * Tab/Shift+Tab are constrained by a `focus-trap` (UX-DR16). On close,
 * focus is restored to the toggle button.
 *
 * ## Reduced motion
 *
 * `@media (prefers-reduced-motion: reduce)` collapses the 200ms slide-in
 * and scrim fade to instant transitions (CSS-only).
 *
 * ## ARIA
 *
 * Toggle: native `<button>` with `aria-label`, `aria-expanded`,
 * `aria-controls="chapter-index-panel"`. The panel is `role="listbox"`
 * with `aria-label="Mission chapters"`; each chapter is a `<div
 * role="option">` with a roving `tabindex` (`0` on the focused option,
 * `-1` elsewhere). The held chapter additionally carries
 * `aria-selected="true"` + `aria-current="true"`. WAI-ARIA APG Listbox
 * pattern per ADR-0025.
 */
export class VChapterIndex extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        position: fixed;
        top: var(--v-edge-margin);
        right: var(--v-edge-margin);
        z-index: var(--v-z-modal);
        display: block;
        font-family: var(--v-font-sans);
      }

      /* ─── Toggle button — 32×32 hamburger ─── */
      .toggle {
        appearance: none;
        background: transparent;
        color: var(--v-color-fg);
        border: 1px solid var(--v-color-divider);
        border-radius: 4px;
        width: 32px;
        height: 32px;
        padding: 0;
        cursor: pointer;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        user-select: none;
      }

      .toggle:hover,
      .toggle:hover .bar {
        border-color: var(--v-color-accent);
      }

      .toggle:hover .bar {
        background: var(--v-color-accent);
      }

      .toggle:focus-visible {
        outline: 2px solid var(--v-color-focus);
        outline-offset: 2px;
      }

      .bar {
        display: block;
        width: 18px;
        height: 2px;
        background: var(--v-color-fg);
        border-radius: 1px;
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

      /* ─── Panel (slide-in from right edge) ─── */
      .panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: clamp(280px, 28vw, 380px);
        background: var(--v-color-bg);
        border-left: 1px solid var(--v-color-divider);
        transform: translateX(100%);
        transition: transform var(--v-duration-base) var(--v-ease-out);
        z-index: var(--v-z-modal);
        display: flex;
        flex-direction: column;
        padding: var(--v-space-6) 0;
      }

      :host([data-open]) .panel {
        transform: translateX(0);
      }

      .panel-heading {
        font-size: var(--v-font-size-caption);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--v-color-fg-muted);
        padding: 0 var(--v-space-6) var(--v-space-3);
        border-bottom: 1px solid var(--v-color-divider);
      }

      .listbox {
        list-style: none;
        padding: var(--v-space-2) 0;
        margin: 0;
        display: block;
        outline: none;
        overflow-y: auto;
      }

      .option {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--v-space-4);
        padding: var(--v-space-3) var(--v-space-6);
        cursor: pointer;
        color: var(--v-color-fg);
        outline: none;
        position: relative;
      }

      .option:hover {
        background: var(--v-color-divider);
      }

      .option:focus-visible {
        outline: 2px solid var(--v-color-focus);
        outline-offset: -2px;
      }

      .option[aria-current='true'] {
        color: var(--v-color-accent);
      }

      .option-prefix {
        display: inline-block;
        width: 1ch;
        margin-right: var(--v-space-1);
        color: var(--v-color-accent);
      }

      .option-name {
        font-family: var(--v-font-sans);
        font-size: var(--v-font-size-body);
        line-height: 1.2;
        flex: 1;
      }

      .option-date {
        font-family: var(--v-font-mono);
        font-size: var(--v-size-hud-mono-sm);
        color: var(--v-color-fg-muted);
        white-space: nowrap;
      }

      /* prefers-reduced-motion is handled centrally in global.css —
         it sets --v-duration-base to 0ms at :root, which collapses
         every transition in this file (panel slide, scrim fade) to
         instant. UX spec §672 / Story 1.7 defense pins that single
         declaration. Do NOT add a per-component override here.
       */
    `,
  ];

  static override properties = {
    open: { type: Boolean, reflect: true, attribute: 'data-open' },
  };

  declare open: boolean;

  /** Required wiring — set externally before mount. */
  clockManager: ClockManager | null = null;

  /** Required wiring — set externally before mount. */
  chapterDirector: ChapterDirector | null = null;

  /**
   * The target the global keyboard listener is attached to. Defaults to
   * `document`; tests pass a different target to isolate listeners.
   */
  keyboardTarget: Document = document;

  private chapterUnsub: (() => void) | null = null;
  private focusTrap: FocusTrap | null = null;
  private focusedIndex = 0;
  private detachGlobalKeys: (() => void) | null = null;
  private detachClickOutside: (() => void) | null = null;

  constructor() {
    super();
    this.open = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.chapterDirector !== null && this.chapterUnsub === null) {
      this.chapterUnsub = this.chapterDirector.subscribe(this.onChapterChange);
    }
    this.detachGlobalKeys = installGlobalShortcuts(this, this.keyboardTarget);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.chapterUnsub !== null) {
      this.chapterUnsub();
      this.chapterUnsub = null;
    }
    if (this.detachGlobalKeys !== null) {
      this.detachGlobalKeys();
      this.detachGlobalKeys = null;
    }
    if (this.open) {
      this.closePanel({ restoreFocus: false });
    }
  }

  private onChapterChange = (): void => {
    this.requestUpdate();
  };

  /**
   * Toggle the panel. Public so the global keyboard handler can call it
   * without exposing internal state.
   */
  togglePanel(): void {
    if (this.open) this.closePanel({ restoreFocus: true });
    else this.openPanel();
  }

  private openPanel(): void {
    if (this.open) return;
    // Seed the roving-focus index from the currently-active chapter so
    // the panel opens with the user's "you are here" highlighted. Falls
    // back to 0 if no chapter is held (between windows).
    const activeSlug = this.chapterDirector?.activeChapter?.slug ?? null;
    if (activeSlug !== null) {
      const i = ALL_CHAPTERS.findIndex((c) => c.slug === activeSlug);
      if (i >= 0) this.focusedIndex = i;
    } else {
      this.focusedIndex = 0;
    }
    this.open = true;
    // The click-outside listener is registered synchronously so a
    // pointerdown dispatched immediately after `togglePanel()` returns
    // (no render await) still closes the panel. The focus-trap needs
    // the panel DOM to be in the shadow root before it activates, so
    // we defer that one until updateComplete settles.
    this.installClickOutside();
    void this.updateComplete.then(() => {
      // Guard against a synchronous open→close racing the deferred
      // activation: if the panel is no longer open by the time this
      // microtask runs, do nothing. Activating a trap on a closed
      // panel leaks `this.focusTrap` past the next deactivateFocusTrap()
      // call because that method short-circuits on null.
      if (!this.open) return;
      this.activateFocusTrap();
    });
  }

  /**
   * Close the panel. `restoreFocus` controls whether focus returns to
   * the toggle button — true for user-initiated closes (Esc, click-out,
   * selection), false for component teardown (disconnectedCallback).
   */
  private closePanel(opts: { restoreFocus: boolean }): void {
    if (!this.open) return;
    this.open = false;
    this.deactivateFocusTrap();
    this.uninstallClickOutside();
    if (opts.restoreFocus) {
      // Defer one microtask so the panel's transform-transition + Lit
      // re-render don't race the focus() call. focus-trap's
      // returnFocusOnDeactivate handles the same scenario for most
      // cases; this explicit call is the belt-and-suspenders path for
      // closes that bypass deactivation (e.g. global Escape handling
      // when the trap was never activated due to a synchronous open/
      // close sequence in tests).
      void this.updateComplete.then(() => {
        const toggle = this.shadowRoot?.querySelector<HTMLButtonElement>(
          '.toggle',
        );
        toggle?.focus();
      });
    }
  }

  private activateFocusTrap(): void {
    const panel = this.shadowRoot?.querySelector<HTMLElement>('.panel');
    if (panel === null || panel === undefined) return;
    // focus-trap walks the panel's subtree for tabbable nodes. Because
    // the panel lives in our shadow root we ask tabbable to descend
    // into shadow roots (the panel itself is one). Tabbable also needs
    // displayCheck disabled in jsdom/happy-dom where layout is empty —
    // the test env reports zero-area elements as non-tabbable otherwise.
    this.focusTrap = createFocusTrap(panel, {
      escapeDeactivates: false, // Esc is handled by us so we can emit our own contract
      clickOutsideDeactivates: false, // we listen at document level instead
      returnFocusOnDeactivate: false, // we restore focus explicitly
      initialFocus: () => this.optionElementAt(this.focusedIndex) ?? panel,
      tabbableOptions: {
        getShadowRoot: true,
        displayCheck: 'none',
      },
    });
    try {
      this.focusTrap.activate();
    } catch {
      // Activation can fail in test environments without layout — the
      // listbox keyboard handler keeps the panel functional regardless.
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

  /**
   * Document-level pointerdown listener — close the panel when the user
   * clicks anywhere outside the panel (the toggle and panel both live
   * in this host's shadow tree, so a composedPath check identifies
   * "outside" cleanly).
   */
  private installClickOutside(): void {
    if (this.detachClickOutside !== null) return;
    const onPointerDown = (e: Event): void => {
      const path = (e as Event & { composedPath?: () => EventTarget[] }).composedPath?.() ?? [];
      const insideHost = path.includes(this);
      if (!insideHost) {
        this.closePanel({ restoreFocus: true });
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    this.detachClickOutside = () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }

  private uninstallClickOutside(): void {
    if (this.detachClickOutside !== null) {
      this.detachClickOutside();
      this.detachClickOutside = null;
    }
  }

  /**
   * Activate the chapter at index `i` — used by both the in-panel Enter
   * activation and the global `1`–`9` digit shortcuts. Routes through
   * `clockManager.scrubTo(anchorEt)` (which pauses) and emits the
   * canonical `chapter-jump` CustomEvent so Story 2.4's URL router can
   * subscribe once at document level for both sources.
   *
   * Closes the panel as a side effect when it was open (the digit path
   * may fire while the panel is closed, in which case there is nothing
   * to close).
   */
  activateChapterAtIndex(i: number): void {
    if (i < 0 || i >= ALL_CHAPTERS.length) return;
    const chapter = ALL_CHAPTERS[i];
    if (chapter === undefined) return;
    if (this.clockManager !== null) {
      this.clockManager.scrubTo(chapter.anchorEt);
    }
    this.dispatchEvent(
      new CustomEvent('chapter-jump', {
        bubbles: true,
        composed: true,
        detail: { slug: chapter.slug, anchorEt: chapter.anchorEt },
      }),
    );
    if (this.open) {
      this.closePanel({ restoreFocus: true });
    }
  }

  private onToggleClick = (): void => {
    this.togglePanel();
  };

  /**
   * APG Listbox keyboard contract — delegated to
   * `primitives/listbox-keyboard.ts` per ADR-0025 (Story 3.0 AC4 path (a)).
   * The primitive owns the Home/End/Arrows/Enter/Space/Escape contract +
   * the preventDefault/stopPropagation defence against the global Space-
   * toggle-play listener; this component supplies the option count
   * (`ALL_CHAPTERS.length`), the focused-index source, and the move-focus /
   * activate / close side-effects.
   */
  private onListboxKeyDown = createListboxKeyboardHandler({
    getOptionCount: () => ALL_CHAPTERS.length,
    getFocusedIndex: () => this.focusedIndex,
    onMoveFocus: (index: number) => this.moveFocus(index),
    onActivate: () => this.activateChapterAtIndex(this.focusedIndex),
    onClose: () => this.closePanel({ restoreFocus: true }),
  });

  private moveFocus(nextIndex: number): void {
    const len = ALL_CHAPTERS.length;
    if (len === 0) return;
    const clamped =
      nextIndex < 0 ? 0 : nextIndex >= len ? len - 1 : nextIndex;
    this.focusedIndex = clamped;
    // Re-render so the roving tabindex updates, then move focus into the
    // option DOM. Doing the focus() AFTER the next paint ensures the
    // tabindex=0 attribute is in place when we focus.
    this.requestUpdate();
    void this.updateComplete.then(() => {
      this.optionElementAt(this.focusedIndex)?.focus();
    });
  }

  private optionElementAt(i: number): HTMLElement | null {
    const opts = this.shadowRoot?.querySelectorAll<HTMLElement>('.option');
    if (opts === undefined || opts === null) return null;
    return opts[i] ?? null;
  }

  private onOptionClick(i: number): (e: Event) => void {
    return (e: Event): void => {
      e.stopPropagation();
      this.focusedIndex = i;
      this.activateChapterAtIndex(i);
    };
  }

  override render(): TemplateResult {
    const activeSlug = this.chapterDirector?.activeChapter?.slug ?? null;
    const openAttr = this.open ? 'true' : 'false';
    return html`
      <button
        type="button"
        class="toggle"
        aria-label=${this.open ? 'Close chapter index' : 'Open chapter index'}
        aria-expanded=${openAttr}
        aria-controls="chapter-index-panel"
        @click=${this.onToggleClick}
      >
        <span class="bar" aria-hidden="true"></span>
        <span class="bar" aria-hidden="true"></span>
        <span class="bar" aria-hidden="true"></span>
      </button>
      <div class="scrim" part="scrim" aria-hidden="true"></div>
      <div class="panel" part="panel" aria-hidden=${this.open ? 'false' : 'true'}>
        <div class="panel-heading" id="chapter-index-heading">Chapters</div>
        <div
          class="listbox"
          role="listbox"
          id="chapter-index-panel"
          aria-label="Mission chapters"
          aria-labelledby="chapter-index-heading"
          @keydown=${this.onListboxKeyDown}
        >
          ${ALL_CHAPTERS.map((chapter, i) =>
            this.renderOption(chapter, i, activeSlug),
          )}
        </div>
      </div>
    `;
  }

  private renderOption(
    chapter: ChapterSpec,
    i: number,
    activeSlug: string | null,
  ): TemplateResult {
    const isActive = chapter.slug === activeSlug;
    const isFocused = i === this.focusedIndex;
    const isoDate = isoFromEt(chapter.anchorEt).slice(0, 10);
    const tabindex = isFocused ? '0' : '-1';
    return html`
      <div
        class="option"
        role="option"
        data-slug=${chapter.slug}
        aria-selected=${isActive ? 'true' : 'false'}
        aria-current=${isActive ? 'true' : 'false'}
        tabindex=${tabindex}
        @click=${this.onOptionClick(i)}
      >
        <span class="option-prefix" aria-hidden="true">${isActive ? '▸' : ''}</span>
        <span class="option-name">${chapter.name}</span>
        <span class="option-date">${isoDate}</span>
      </div>
    `;
  }
}

/**
 * Install the document-level keyboard shortcuts owned by the chapter index:
 *
 *   M        Toggle the panel
 *   1..9     Activate chapter at index N-1 (chronological)
 *
 * Both shortcuts skip when:
 *   - a text input element has focus (input/textarea/contenteditable),
 *     walking shadow roots so a Lit-hosted `<input>` is detected
 *   - a Ctrl, Alt, or Meta modifier is held (Shift is allowed — Shift+1
 *     happens to type '!' but the conditional on `e.key` filters
 *     non-digit characters cleanly)
 *
 * Exported only for the panel's connectedCallback to use; not part of
 * the public surface.
 */
const installGlobalShortcuts = (
  index: VChapterIndex,
  target: Document,
): (() => void) => {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (isTextInputFocused(target)) return;
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      index.togglePanel();
      return;
    }
    // `1`–`9` (NOT `0`): activate chapter at index N-1. Use the literal
    // key, not e.code, so number-pad and main-row digits both work and
    // foreign keyboard layouts that produce '!' on Shift+1 don't trip.
    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const n = Number.parseInt(e.key, 10);
      index.activateChapterAtIndex(n - 1);
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
  // Walk through Shadow DOM hosts (mirror of boot/keyboard-shortcuts.ts).
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

if (typeof customElements !== 'undefined' && !customElements.get('v-chapter-index')) {
  customElements.define('v-chapter-index', VChapterIndex);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-chapter-index': VChapterIndex;
  }
}
