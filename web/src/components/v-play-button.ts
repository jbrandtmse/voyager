import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import type { ClockManager, ClockState } from '../services/clock-manager';

/**
 * `<v-play-button>` — bottom-left play/pause toggle for the simulation.
 *
 * Subscribes to a wired `ClockManager` and reflects its `playing` state.
 * Click toggles via `clockManager.play()` / `clockManager.pause()`. The
 * global `Space`-key toggle is owned by `boot/keyboard-shortcuts.ts` —
 * this component handles only the focus-scoped activation (`Enter` and
 * `Space` on the focused button — native button behavior).
 *
 * ## Glyph
 *
 * Pure unicode glyphs (no SVG) — keeps the bundle thin and works in the
 * shadow DOM without external asset deps:
 *   - paused:  ▶ (U+25B6 BLACK RIGHT-POINTING TRIANGLE)
 *   - playing: ❚❚ (two U+275A HEAVY VERTICAL BAR)
 *
 * ## ARIA
 *
 * Native `<button>` already exposes role=button and Enter/Space activation.
 * We only set `aria-label` and `aria-pressed` reactively. Tab focus is
 * automatic.
 *
 * ## Subscriber pattern
 *
 * The button reads `clockManager.playing` from the subscriber snapshot
 * via `requestUpdate()`. No per-frame work — only fires on play/pause/
 * setRate/scrubTo (architecture line 1220).
 */
export class VPlayButton extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        position: fixed;
        left: var(--v-edge-margin);
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
        font-size: 16px;
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

  /** Required wiring. Set externally before mount. */
  clockManager: ClockManager | null = null;

  private clockUnsub: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.clockManager !== null && this.clockUnsub === null) {
      this.clockUnsub = this.clockManager.subscribe(this.onClockChange);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.clockUnsub !== null) {
      this.clockUnsub();
      this.clockUnsub = null;
    }
  }

  private onClockChange = (_state: ClockState): void => {
    this.requestUpdate();
  };

  private onClick = (): void => {
    const cm = this.clockManager;
    if (cm === null) return;
    if (cm.playing) cm.pause();
    else cm.play();
  };

  override render(): TemplateResult {
    const playing = this.clockManager !== null ? this.clockManager.playing : false;
    const label = playing ? 'Pause' : 'Play';
    const pressed = playing ? 'true' : 'false';
    // Two heavy vertical bars vs. the standard play triangle. Wrapped in
    // `.glyph` so future SVG upgrades can swap without touching the button.
    const glyph = playing ? '❚❚' : '▶';
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

if (typeof customElements !== 'undefined' && !customElements.get('v-play-button')) {
  customElements.define('v-play-button', VPlayButton);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-play-button': VPlayButton;
  }
}
