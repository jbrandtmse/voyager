import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import { isTextInputFocused } from '../lib/text-input-focus';
import type { AudioPlaybackService } from '../services/audio-playback-service';

/**
 * `<v-audio-toggle>` — Story 6.1 / FR43 / UX-DR15.
 *
 * Small native `<button>` adjacent to `<v-play-button>` at the bottom-
 * left of the simulation surface. Toggles the Golden Record audio layer
 * on/off. Reflects `audioService.isOn()` via `aria-pressed`.
 *
 * ## Glyph choice (Dev Notes record)
 *
 * Uses Unicode glyphs (no inline SVG): U+1F507 (🔇) for the off state
 * and U+1F50A (🔊) for the on state. The choice mirrors
 * `<v-play-button>`'s Unicode-only convention (▶ / ❚❚) — keeps the
 * bundle thin and works inside Shadow DOM without any external asset
 * deps. The glyphs are large enough at the 44×44 button size to read
 * cleanly on every target browser; SVG would be a marginal sharpness
 * win not worth the bundle bytes.
 *
 * ## Keyboard shortcut
 *
 * Owns a document-level `G` shortcut (registered in
 * `connectedCallback`, removed in `disconnectedCallback`). Mirrors
 * `<v-help-overlay>`'s `?` / `A` ownership pattern (Story 2.8). The
 * shortcut skips when:
 *   - any of Ctrl / Alt / Meta is held (Shift is benign — letter keys
 *     don't need Shift suppression);
 *   - a text input is focused via the shared `isTextInputFocused`
 *     helper (Shadow-DOM-aware; see `web/src/lib/text-input-focus.ts`);
 *   - the `<v-help-overlay>` modal is open — AC3 mandates suppression
 *     ("when the `<v-help-overlay>` modal is open, the `G` shortcut is
 *     suppressed"). The check probes the `<v-help-overlay>`'s reflected
 *     `data-open` attribute via a document query (the overlay reflects
 *     its `open` reactive property to `data-open` per its `static
 *     properties` declaration). Mirrors the `<v-help-overlay>`'s own
 *     `A`-shortcut suppression (`if (overlay.open) return;`) at
 *     `v-help-overlay.ts:560-563`. Resolves the spec-vs-impl divergence
 *     surfaced in Story 6.1 code review.
 *
 * ## Rule 10 (Lit reactive properties — `declare` + ctor-init)
 *
 * `audioOn` is declared via `static properties` + `declare` (no
 * class-field initializer) and initialized in the constructor body.
 * Class-field initializers shadow Lit's generated reactive accessor;
 * the `declare` form does not.
 *
 * ## Embed-mode posture (AC2)
 *
 * The toggle is content not chrome — it controls the simulation. It
 * mounts in BOTH normal mode AND embed mode (the chrome-skip
 * discipline in `first-paint.ts` does not apply here).
 */
export class VAudioToggle extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        position: fixed;
        /* Sit to the right of the play button (which is at
         * left: var(--v-edge-margin)). Spacing matches the
         * <v-speed-multiplier> pattern (one button-width + small
         * gutter to the right of <v-play-button>). */
        left: calc(var(--v-edge-margin) + 44px + 8px);
        bottom: var(--v-edge-margin);
        z-index: var(--v-z-scrubber);
        display: inline-block;
      }

      button {
        appearance: none;
        background: var(--v-color-bg);
        color: var(--v-color-fg);
        border: 1px solid var(--v-color-divider);
        border-radius: 4px;
        width: 44px;
        height: 44px;
        font-family: var(--v-font-mono);
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        user-select: none;
      }

      button:hover {
        border-color: var(--v-color-fg-muted);
      }

      button:focus-visible {
        outline: 2px solid var(--v-color-focus);
        outline-offset: 2px;
      }

      .glyph {
        display: inline-block;
        line-height: 1;
      }
    `,
  ];

  /**
   * Rule 10 — reactive property declared without a class-field
   * initializer. Initialized in the constructor body so Lit's
   * generated accessor is not shadowed.
   */
  static override properties = {
    audioOn: { type: Boolean },
  };

  declare audioOn: boolean;

  /**
   * Injected service. Set externally before mount by the bootstrap
   * (`main.ts` constructs the service and `first-paint.ts` assigns it
   * to the toggle's property).
   */
  audioService: AudioPlaybackService | null = null;

  private serviceUnsub: (() => void) | null = null;
  private detachGlobalKeys: (() => void) | null = null;

  /** Override-able for tests — the document the keydown listener attaches to. */
  keyboardTarget: Document = document;

  constructor() {
    super();
    this.audioOn = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Subscribe to the service so we reflect external state changes
    // (e.g. the service auto-toggling on a chapter-window enter, or
    // the persistence layer restoring a same-session value).
    if (this.audioService !== null && this.serviceUnsub === null) {
      this.audioOn = this.audioService.isOn();
      this.serviceUnsub = this.audioService.subscribe((state) => {
        if (this.audioOn !== state.on) {
          this.audioOn = state.on;
        }
      });
    }
    this.detachGlobalKeys = installGlobalShortcut(this, this.keyboardTarget);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.serviceUnsub !== null) {
      this.serviceUnsub();
      this.serviceUnsub = null;
    }
    if (this.detachGlobalKeys !== null) {
      this.detachGlobalKeys();
      this.detachGlobalKeys = null;
    }
  }

  /** Public API for the keyboard listener and click handler. */
  toggleAudio(): void {
    if (this.audioService === null) {
      // No service wired — flip local state for visual feedback only.
      this.audioOn = !this.audioOn;
      return;
    }
    this.audioService.toggle();
    // Subscribe-and-mirror also fires, but updating eagerly here keeps
    // the aria-pressed reflect snappy without waiting for the subscriber
    // callback to round-trip.
    this.audioOn = this.audioService.isOn();
  }

  private onClick = (): void => {
    this.toggleAudio();
  };

  override render(): TemplateResult {
    const pressed = this.audioOn ? 'true' : 'false';
    const label = this.audioOn
      ? 'Turn Golden Record audio off'
      : 'Turn Golden Record audio on';
    const glyph = this.audioOn ? '\u{1F50A}' : '\u{1F507}';
    return html`
      <button
        type="button"
        aria-label=${label}
        aria-pressed=${pressed}
        @click=${this.onClick}
      >
        <span class="glyph">${glyph}</span>
      </button>
    `;
  }
}

/**
 * Document-level `G` shortcut owned by `<v-audio-toggle>`. Mirrors the
 * `<v-help-overlay>` pattern: install on connectedCallback, remove on
 * disconnectedCallback. The element-owns-its-shortcut contract is the
 * canonical alternative to a boot-time global (`web/src/boot/keyboard-
 * shortcuts.ts`, which is reserved for shortcuts that always exist
 * regardless of which components are mounted).
 *
 * Exported only via this closure so the connectedCallback path can use
 * it; not part of the public surface.
 */
const installGlobalShortcut = (
  toggle: VAudioToggle,
  target: Document,
): (() => void) => {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (isTextInputFocused(target)) return;
    if (e.key !== 'g' && e.key !== 'G') return;
    // AC3 — suppress G when the <v-help-overlay> modal is open. The
    // overlay reflects its `open` reactive property as the `data-open`
    // attribute (per `static properties = { open: { ..., reflect: true,
    // attribute: 'data-open' } }` in v-help-overlay.ts), so a document
    // query for `[data-open]` on the element is the cheapest correct
    // probe — no cross-component reference required.
    if (isHelpOverlayOpen(target)) return;
    e.preventDefault();
    toggle.toggleAudio();
  };
  target.addEventListener('keydown', onKeyDown);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
  };
};

/**
 * AC3 helper — returns true if a `<v-help-overlay>` is currently open.
 *
 * The overlay reflects its `open` reactive property to the `data-open`
 * attribute on the host element (see `v-help-overlay.ts` `static
 * properties`). When the overlay is closed the attribute is absent;
 * when open the attribute is present (the boolean reflect emits the
 * empty string or `"true"`, both of which match the CSS selector
 * `[data-open]`).
 *
 * Returns false when no `<v-help-overlay>` is in the DOM (e.g. embed
 * mode skips the overlay mount — Story 2.8 / Story 2.5).
 */
const isHelpOverlayOpen = (target: Document): boolean => {
  const overlay = target.querySelector('v-help-overlay');
  if (overlay === null) return false;
  return overlay.hasAttribute('data-open');
};

if (typeof customElements !== 'undefined' && !customElements.get('v-audio-toggle')) {
  customElements.define('v-audio-toggle', VAudioToggle);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-audio-toggle': VAudioToggle;
  }
}
