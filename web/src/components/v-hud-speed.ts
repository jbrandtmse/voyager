import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import { formatSpeedReadout } from '../math/speed-readout';
import type { ClockManager, ClockState } from '../services/clock-manager';

/**
 * `<v-hud-speed>` — HUD-region speed-multiplier readout (Story 1.11 AC5).
 *
 * Renders `formatSpeedReadout(clockManager.playbackRate)`. Subscribes to
 * `clockManager` for setRate / play / pause events — this component does
 * NOT update per-frame (the playback rate doesn't change unless the user
 * acts on it).
 *
 * ## Redundancy with `<v-speed-multiplier>`
 *
 * Story 1.10's `<v-speed-multiplier>` already renders a readout below
 * the slider. `<v-hud-speed>` is intentionally separate — it lives in
 * the HUD region for the "what speed are we at, in absolute terms"
 * question, where `<v-speed-multiplier>`'s readout is adjacent to the
 * control surface for direct feedback during interaction. They MAY
 * render identical text; that's an acceptable cost of the HUD model.
 *
 * ## Aria-live
 *
 * The wrapping `<output aria-live="polite">` announces rate changes to
 * AT. Unlike `<v-hud-date>` and `<v-hud-distance>`, this component does
 * not debounce — rate changes are explicit user actions, not 60 Hz
 * data streams.
 */
export class VHudSpeed extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        display: inline-flex;
        align-items: baseline;
        gap: var(--v-space-2);
        font-family: var(--v-font-mono);
        font-variant-numeric: tabular-nums;
      }

      .label {
        color: var(--v-color-fg-quiet);
        font-size: var(--v-size-hud-mono-sm);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      output {
        color: var(--v-color-fg);
        font-size: var(--v-size-hud-mono);
        font-variant-numeric: tabular-nums;
        font-family: var(--v-font-mono);
      }
    `,
  ];

  private _clockManager: ClockManager | null = null;
  private clockUnsub: (() => void) | null = null;

  get clockManager(): ClockManager | null {
    return this._clockManager;
  }
  set clockManager(value: ClockManager | null) {
    if (value === this._clockManager) return;
    if (this.clockUnsub !== null) {
      this.clockUnsub();
      this.clockUnsub = null;
    }
    this._clockManager = value;
    if (this.isConnected && value !== null) {
      this.clockUnsub = value.subscribe(this.onClockChange);
    }
    this.requestUpdate();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this._clockManager !== null && this.clockUnsub === null) {
      this.clockUnsub = this._clockManager.subscribe(this.onClockChange);
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

  private currentReadout(): string {
    if (this._clockManager === null) return formatSpeedReadout(1);
    const base = formatSpeedReadout(this._clockManager.playbackRate);
    return this._clockManager.autoCapped ? `${base} —paused (loading)` : base;
  }

  override render(): TemplateResult {
    return html`
      <span class="label" aria-hidden="true">Speed</span>
      <output aria-live="polite" aria-label="Playback speed">
        ${this.currentReadout()}
      </output>
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('v-hud-speed')) {
  customElements.define('v-hud-speed', VHudSpeed);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-hud-speed': VHudSpeed;
  }
}
