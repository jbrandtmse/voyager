import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import { dateForHud, isoFromEt } from '../math/et-conversions';
import { debounce, type Debounced } from '../primitives/debounce';
import type { ClockManager, ClockState } from '../services/clock-manager';

/**
 * `<v-hud-date>` — simulation date readout (Story 1.11 AC3, AC6).
 *
 * Renders the current simulation date as `YYYY-MM-DD HH:MM` UTC inside a
 * `<time datetime="...">` element, with a quiet "UT" label rendered ahead
 * of the value. Uses `var(--v-font-mono)` (JetBrains Mono) with
 * `font-variant-numeric: tabular-nums` so digits do not jitter as the
 * value ticks.
 *
 * ## Per-frame update path (architecture line 424)
 *
 * Visible DOM mutates **outside the Lit reactivity layer**. The
 * `tick(et)` method is wired to `RenderEngine.onFrame(et => el.tick(et))`
 * by the host; each call mutates the rendered `<time>` element's
 * `textContent` and `datetime` attribute directly. This bypasses Lit's
 * `requestUpdate` / scheduler entirely so we don't pay the reconciler
 * cost at 60 Hz.
 *
 * ## Aria-live polite mirror (UX-DR24)
 *
 * A SEPARATE visually-hidden `<span aria-live="polite">` mirrors the
 * value, but its updates are debounced (500ms after the last
 * scrub event) and additionally fire on chapter change. Screen readers
 * would be overwhelmed by 60 Hz announcements — the mirror exists so
 * scrub-stop and chapter-change events still surface to AT.
 *
 * The mirror is fed via `clockManager.subscribe(state => …)` — subscribe
 * fires on play/pause/scrubTo/setRate (Story 1.10), which we treat
 * as "a meaningful time change occurred". The 500ms debounce squashes
 * the per-keystroke scrub burst into one trailing announcement.
 */
export class VHudDate extends BaseElement {
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

      time {
        color: var(--v-color-fg);
        font-size: var(--v-size-hud-mono);
        font-variant-numeric: tabular-nums;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ];

  /** Aria-live debounce window. 500ms per AC6. */
  ariaLiveDebounceMs = 500;

  private _clockManager: ClockManager | null = null;
  private clockUnsub: (() => void) | null = null;
  private debouncedAriaUpdate: Debounced<[number]> | null = null;

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
    if (this.debouncedAriaUpdate !== null) {
      this.debouncedAriaUpdate.cancel();
      this.debouncedAriaUpdate = null;
    }
  }

  private ensureDebouncer(): Debounced<[number]> {
    if (this.debouncedAriaUpdate === null) {
      this.debouncedAriaUpdate = debounce<[number]>(
        (et: number) => this.applyAriaMirror(et),
        this.ariaLiveDebounceMs,
      );
    }
    return this.debouncedAriaUpdate;
  }

  private onClockChange = (state: ClockState): void => {
    this.ensureDebouncer()(state.simTimeEt);
  };

  /**
   * Force-flush the aria-live mirror to a specific ET (Story 1.11 AC6 —
   * chapter change). Bypasses the debounce window.
   */
  announceNow(et: number): void {
    if (this.debouncedAriaUpdate !== null) this.debouncedAriaUpdate.cancel();
    this.applyAriaMirror(et);
  }

  private applyAriaMirror(et: number): void {
    const mirror = this.shadowRoot?.querySelector<HTMLElement>('.sr-only');
    if (mirror === null || mirror === undefined) return;
    const text = dateForHud(et);
    mirror.textContent = text === '' ? '' : `${text} UT`;
  }

  /**
   * Per-frame visible-DOM update. Called by `RenderEngine.onFrame((et) => …)`.
   * Mutates the `<time>` element's textContent + `datetime` attribute
   * directly — does NOT go through Lit's reactivity.
   */
  tick(et: number): void {
    const timeEl = this.shadowRoot?.querySelector<HTMLTimeElement>('time');
    if (timeEl === null || timeEl === undefined) return;
    const dateText = dateForHud(et);
    const iso = isoFromEt(et);
    if (timeEl.textContent !== dateText) {
      timeEl.textContent = dateText;
    }
    if (iso !== '' && timeEl.getAttribute('datetime') !== iso) {
      timeEl.setAttribute('datetime', iso);
    }
  }

  override render(): TemplateResult {
    // Seed the visible content from the wired clock so we don't flash an
    // empty value before the first onFrame() tick lands.
    const initialEt =
      this._clockManager !== null ? this._clockManager.simTimeEt : Number.NaN;
    const initialText = dateForHud(initialEt);
    const initialIso = isoFromEt(initialEt);
    return html`
      <span class="label" aria-hidden="true">UT</span>
      <time datetime=${initialIso}>${initialText}</time>
      <span class="sr-only" aria-live="polite"></span>
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('v-hud-date')) {
  customElements.define('v-hud-date', VHudDate);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-hud-date': VHudDate;
  }
}
