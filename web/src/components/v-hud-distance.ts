import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import { formatAU } from '../math/au-format';
import { KM_PER_AU } from '../math/constants';
import { debounce, type Debounced } from '../primitives/debounce';
import type { ClockManager, ClockState } from '../services/clock-manager';
import type { EphemerisService } from '../services/ephemeris-service';
import type { WorldVec3 } from '../types/branded';

/** NAIF body identifiers for Voyager 1 / Voyager 2 (spacecraft, negative). */
const NAIF_V1 = -31;
const NAIF_V2 = -32;

/**
 * Compute |position| → AU. We treat the bake's heliocentric origin as the
 * Sun position (0,0,0). Per Story 1.11 AC4 the offset between SSB and the
 * Sun is ≤ ~0.01 AU which is below the display precision of `formatAU`.
 */
const positionMagnitudeAu = (p: WorldVec3): number => {
  const x = p[0];
  const y = p[1];
  const z = p[2];
  return Math.sqrt(x * x + y * y + z * z) / KM_PER_AU;
};

/**
 * `<v-hud-distance>` — per-spacecraft distance from Sun (Story 1.11 AC4).
 *
 * Two rows: "V1 — 165 AU" and "V2 — 138 AU". Distance is computed from
 * the ephemeris's heliocentric position vector (Sun at origin).
 *
 * Visible DOM updates per-frame via `tick(et)` direct mutation. Aria-live
 * mirror updates only via the debounced clock-subscribe path (AC6).
 *
 * When `EphemerisService.getPosition` returns null (chunk not yet
 * cached), the row shows "—" so the layout doesn't reflow as data
 * streams in.
 */
export class VHudDistance extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-family: var(--v-font-mono);
        font-variant-numeric: tabular-nums;
      }

      .row {
        display: inline-flex;
        align-items: baseline;
        gap: var(--v-space-2);
      }

      .label {
        color: var(--v-color-fg-quiet);
        font-size: var(--v-size-hud-mono-sm);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        min-width: 2ch;
      }

      .value {
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

  ephemerisService: EphemerisService | null = null;
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

  /** Force-flush the aria-live mirror (e.g. on chapter change). */
  announceNow(et: number): void {
    if (this.debouncedAriaUpdate !== null) this.debouncedAriaUpdate.cancel();
    this.applyAriaMirror(et);
  }

  private computeAuString(et: number, naifId: number): string {
    const eph = this.ephemerisService;
    if (eph === null) return '— AU';
    const pos = eph.getPosition(et, naifId);
    if (pos === null) return '— AU';
    return formatAU(positionMagnitudeAu(pos));
  }

  private applyAriaMirror(et: number): void {
    const mirror = this.shadowRoot?.querySelector<HTMLElement>('.sr-only');
    if (mirror === null || mirror === undefined) return;
    const v1 = this.computeAuString(et, NAIF_V1);
    const v2 = this.computeAuString(et, NAIF_V2);
    mirror.textContent = `Voyager 1 ${v1}, Voyager 2 ${v2}`;
  }

  /**
   * Per-frame DOM mutation (architecture line 424). Writes the V1 / V2
   * AU readouts directly to the rendered spans, bypassing Lit reactivity.
   */
  tick(et: number): void {
    const v1El = this.shadowRoot?.querySelector<HTMLElement>('[data-body="v1"]');
    const v2El = this.shadowRoot?.querySelector<HTMLElement>('[data-body="v2"]');
    if (v1El !== null && v1El !== undefined) {
      const text = this.computeAuString(et, NAIF_V1);
      if (v1El.textContent !== text) v1El.textContent = text;
    }
    if (v2El !== null && v2El !== undefined) {
      const text = this.computeAuString(et, NAIF_V2);
      if (v2El.textContent !== text) v2El.textContent = text;
    }
  }

  override render(): TemplateResult {
    const initialEt =
      this._clockManager !== null ? this._clockManager.simTimeEt : Number.NaN;
    const initialV1 = Number.isFinite(initialEt)
      ? this.computeAuString(initialEt, NAIF_V1)
      : '— AU';
    const initialV2 = Number.isFinite(initialEt)
      ? this.computeAuString(initialEt, NAIF_V2)
      : '— AU';
    return html`
      <div class="row">
        <span class="label" aria-hidden="true">V1</span>
        <span class="value" data-body="v1">${initialV1}</span>
      </div>
      <div class="row">
        <span class="label" aria-hidden="true">V2</span>
        <span class="value" data-body="v2">${initialV2}</span>
      </div>
      <span class="sr-only" aria-live="polite"></span>
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('v-hud-distance')) {
  customElements.define('v-hud-distance', VHudDistance);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-hud-distance': VHudDistance;
  }
}
