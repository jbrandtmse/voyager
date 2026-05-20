import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import { attachPointerHandlers } from '../primitives/pointer-events';
import { formatSpeedReadout } from '../math/speed-readout';
import {
  MIN_PLAYBACK_RATE,
  MAX_PLAYBACK_RATE,
} from '../services/clock-manager';
import type { ClockManager, ClockState } from '../services/clock-manager';

/**
 * `<v-speed-multiplier>` — log-scale playback speed slider.
 *
 * Position `p ∈ [0, 1]` maps logarithmically to a playback rate in
 * `[1, 1_000_000]` via:
 *
 *   rate = 10^(p × 6)        p = log10(rate) / 6
 *
 * The thumb snaps to decade boundaries (1, 10, 100, 1k, 10k, 100k, 1M)
 * when the pointer is within a ±5% position-tolerance band of any decade.
 * Outside the band the slider is continuous and smooth.
 *
 * ## Keyboard (AC5)
 *
 *   `+` / `=` (no shift) → next decade
 *   `-`                  → previous decade
 *   `Shift+=` / `Shift+-`→ ±5% position adjustment (smooth, no snap)
 *   `Home`               → 1×
 *   `End`                → 1,000,000×
 *
 * ## ARIA
 *
 * `role="slider"`, `aria-valuemin/max` = `0/6` (log10 scale),
 * `aria-valuenow` = log10(rate), `aria-valuetext` = human-readable
 * "{N}× — {duration/sec}".
 *
 * ## Auto-cap signal
 *
 * If `clockManager.autoCapped === true`, the readout appends
 * "—paused (loading)". The rate value itself doesn't change; only the
 * UI affordance.
 */
export class VSpeedMultiplier extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        position: fixed;
        right: var(--v-edge-margin);
        bottom: var(--v-edge-margin);
        z-index: var(--v-z-scrubber);
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        user-select: none;
        touch-action: none;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .label {
        font-family: var(--v-font-mono);
        font-size: var(--v-font-size-caption);
        color: var(--v-color-fg-quiet);
      }

      .track {
        position: relative;
        width: 120px;
        height: 12px;
        background: var(--v-color-divider);
        border-radius: 6px;
        cursor: pointer;
      }

      .fill {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        background: var(--v-color-accent);
        border-radius: 6px 0 0 6px;
        pointer-events: none;
      }

      .thumb {
        position: absolute;
        top: 50%;
        width: 14px;
        height: 14px;
        margin-left: -7px;
        margin-top: -7px;
        background: var(--v-color-fg);
        border: 2px solid var(--v-color-bg);
        border-radius: 50%;
        box-sizing: content-box;
        cursor: grab;
        outline: none;
      }

      .thumb[data-dragging] {
        cursor: grabbing;
      }

      .thumb::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 44px;
        height: 44px;
        transform: translate(-50%, -50%);
        background: transparent;
        pointer-events: auto;
        border-radius: 50%;
      }

      .thumb:focus-visible {
        box-shadow: 0 0 0 2px var(--v-color-focus);
      }

      .readout {
        font-family: var(--v-font-mono);
        font-size: var(--v-font-size-caption);
        color: var(--v-color-fg-quiet);
        text-align: right;
      }
    `,
  ];

  /** Required wiring. */
  clockManager: ClockManager | null = null;

  /**
   * Position-space snap tolerance. 5% of the full [0,1] position range —
   * matches AC4. Lowered/raised in tests to verify the boundary.
   */
  snapTolerance: number = 0.05;

  private clockUnsub: (() => void) | null = null;
  private detachPointer: (() => void) | null = null;
  private isDragging = false;

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
    if (this.detachPointer !== null) {
      this.detachPointer();
      this.detachPointer = null;
    }
  }

  private onClockChange = (_state: ClockState): void => {
    this.requestUpdate();
  };

  private currentRate(): number {
    return this.clockManager !== null ? this.clockManager.playbackRate : 1;
  }

  private isAutoCapped(): boolean {
    return this.clockManager !== null && this.clockManager.autoCapped;
  }

  private positionFromRate(rate: number): number {
    if (rate <= MIN_PLAYBACK_RATE) return 0;
    if (rate >= MAX_PLAYBACK_RATE) return 1;
    return Math.log10(rate) / 6;
  }

  private rateFromPosition(pos: number): number {
    if (pos <= 0) return MIN_PLAYBACK_RATE;
    if (pos >= 1) return MAX_PLAYBACK_RATE;
    return Math.pow(10, pos * 6);
  }

  /** Decade boundaries in position space, derived once and cached. */
  private static readonly DECADE_POSITIONS: ReadonlyArray<number> = [
    0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1,
  ];

  /**
   * Apply decade-snap if `pos` lands within `snapTolerance` of any decade
   * boundary. Returns the snapped position; if no decade is within range,
   * returns the input unchanged.
   */
  private snapPosition(pos: number): number {
    let best = pos;
    let bestDist = this.snapTolerance;
    for (const dp of VSpeedMultiplier.DECADE_POSITIONS) {
      const d = Math.abs(pos - dp);
      if (d < bestDist) {
        bestDist = d;
        best = dp;
      }
    }
    return best;
  }

  private trackEl(): HTMLElement | null {
    return this.shadowRoot?.querySelector<HTMLElement>('.track') ?? null;
  }

  private positionFromClientX(clientX: number): number {
    const track = this.trackEl();
    if (track === null) return this.positionFromRate(this.currentRate());
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return this.positionFromRate(this.currentRate());
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  private setRateClamped(rate: number): void {
    if (this.clockManager === null) return;
    const clamped = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
    this.clockManager.setRate(clamped);
  }

  private stepDecade(direction: 1 | -1): void {
    const current = this.currentRate();
    const currentLog = Math.log10(current);
    // Round to nearest decade then ±1.
    const nearest = Math.round(currentLog);
    let next = nearest + direction;
    next = Math.max(0, Math.min(6, next));
    this.setRateClamped(Math.pow(10, next));
  }

  private stepPosition(delta: number): void {
    const current = this.currentRate();
    const pos = this.positionFromRate(current);
    const next = Math.max(0, Math.min(1, pos + delta));
    this.setRateClamped(this.rateFromPosition(next));
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case '+':
      case '=':
        e.preventDefault();
        if (e.shiftKey) this.stepPosition(0.05);
        else this.stepDecade(1);
        return;
      case '-':
      case '_':
        e.preventDefault();
        if (e.shiftKey) this.stepPosition(-0.05);
        else this.stepDecade(-1);
        return;
      case 'Home':
        e.preventDefault();
        this.setRateClamped(MIN_PLAYBACK_RATE);
        return;
      case 'End':
        e.preventDefault();
        this.setRateClamped(MAX_PLAYBACK_RATE);
        return;
      default:
        return;
    }
  };

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    const track = this.trackEl();
    const thumb = this.shadowRoot?.querySelector<HTMLElement>('.thumb');
    if (track !== null && this.detachPointer === null) {
      this.detachPointer = attachPointerHandlers(track, {
        onDown: ({ x, raw }) => {
          const targetIsThumb =
            raw.target instanceof Element && raw.target.classList.contains('thumb');
          this.isDragging = targetIsThumb;
          if (targetIsThumb) thumb?.setAttribute('data-dragging', '');
          const rawPos = this.positionFromClientX(x);
          const pos = this.snapPosition(rawPos);
          this.setRateClamped(this.rateFromPosition(pos));
          raw.preventDefault?.();
        },
        onMove: ({ x }) => {
          if (!this.isDragging) return;
          const rawPos = this.positionFromClientX(x);
          const pos = this.snapPosition(rawPos);
          this.setRateClamped(this.rateFromPosition(pos));
        },
        onUp: () => {
          if (this.isDragging) {
            this.isDragging = false;
            thumb?.removeAttribute('data-dragging');
          }
        },
        onCancel: () => {
          if (this.isDragging) {
            this.isDragging = false;
            thumb?.removeAttribute('data-dragging');
          }
        },
      });
    }
  }

  override render(): TemplateResult {
    const rate = this.currentRate();
    const pos = this.positionFromRate(rate);
    const fracPct = `${(pos * 100).toFixed(4)}%`;
    const ariaValueNow = (Math.log10(rate)).toFixed(6);
    const baseReadout = formatSpeedReadout(rate);
    // Story 1.15 AC4 — emit `—` (em-dash, U+2014) via `\u` escape so the
    // composed readout string is free of raw non-ASCII bytes. The Lit
    // template literal that wraps this string preserves the escape as a
    // single code unit, eliminating the UTF-8↔Latin-1 mis-decoding path
    // that produced `1Ã â 1 sec/sec` in the post-Epic-1 smoke.
    const readout = this.isAutoCapped()
      ? `${baseReadout} \u2014paused (loading)`
      : baseReadout;
    const ariaValueText = readout;
    return html`
      <div class="row">
        <span class="label">1×</span>
        <div class="track" part="track">
          <div class="fill" style=${`width:${fracPct}`}></div>
          <div
            class="thumb"
            part="thumb"
            role="slider"
            tabindex="0"
            aria-label="Playback speed"
            aria-valuemin="0"
            aria-valuemax="6"
            aria-valuenow=${ariaValueNow}
            aria-valuetext=${ariaValueText}
            aria-orientation="horizontal"
            style=${`left:${fracPct}`}
            @keydown=${this.onKeyDown}
          ></div>
        </div>
        <span class="label">1M×</span>
      </div>
      <div class="readout" part="readout">${readout}</div>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('v-speed-multiplier')
) {
  customElements.define('v-speed-multiplier', VSpeedMultiplier);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-speed-multiplier': VSpeedMultiplier;
  }
}
