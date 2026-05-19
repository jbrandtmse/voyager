import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import {
  MISSION_START_ET,
  MISSION_END_ET,
  SCRUB_RESUME_DELAY_MS,
} from '../constants/mission';
import { isoFromEt, formatForHud } from '../math/et-conversions';
import { attachPointerHandlers } from '../primitives/pointer-events';
import { URLSync } from '../services/url-sync';

const ONE_DAY_SECONDS = 86400;
const TEN_DAYS_SECONDS = 10 * ONE_DAY_SECONDS;

/** Variant tags. `'mission'` is the only variant Story 1.9 implements; */
/** `'detail'` is a Story 4.4 deliverable. */
export type ScrubberVariant = 'mission' | 'detail';

/** Source of the scrub event, exposed on `voyager:scrub` detail. */
export type ScrubSource = 'keyboard' | 'pointer';

const clampEt = (et: number): number => {
  if (et < MISSION_START_ET) return MISSION_START_ET;
  if (et > MISSION_END_ET) return MISSION_END_ET;
  return et;
};

/**
 * `<v-timeline-scrubber>` — the spine of the Voyager experience.
 *
 * The mission-variant is anchored to the viewport bottom with a track
 * spanning V2 launch (1977-08-20) → projected mission end (2030-12-31).
 * The thumb tracks `simEt` and is the primary control surface for time
 * scrubbing (UX-DR8).
 *
 * ## Story 1.9 placeholder
 *
 * No `ClockManager` exists yet (Story 1.10 introduces it). For now the
 * scrubber owns its own `simEt` reactive prop and the
 * `wasPlayingBeforeScrub`/`isPlaying` state. Story 1.10 will refactor
 * this to consume `ClockManager.simTimeEt` and let the clock be the
 * source-of-truth.
 *
 * ## Accessibility
 *
 * WAI-ARIA Slider (https://www.w3.org/WAI/ARIA/apg/patterns/slider/):
 *   - `role="slider"` on the thumb-container `<div tabindex="0">`
 *   - `aria-valuemin/max/now` as ISO-8601 UTC strings
 *   - `aria-valuetext` as the human-readable "YYYY-MM-DD HH:MM UT" form
 *   - `aria-label="Mission timeline"`
 *
 * Keyboard (Story 1.9 AC4):
 *   - `←/→`: ±1 day
 *   - `Shift+←/→`: ±10 days
 *   - `Home/End`: jump to MISSION_START/END
 *   - All five suppress the native scroll-step via `preventDefault()`
 *
 * Touch target (Story 1.9 AC8 / WCAG 2.5.5):
 *   - Visible thumb glyph 14 px
 *   - Effective hit area ≥ 44 × 44 px via a transparent `::before`
 *     pseudo-element. The visible glyph is NOT enlarged.
 *
 * ## URL writeback
 *
 * Every scrub change pushes through `URLSync.writeEtThrottled(et)`
 * (250 ms coalesce) during continuous interaction. The `pointerup`
 * release path calls `writeEtImmediate(et)` so the final URL reflects
 * the released value.
 *
 * ## Chapter markers
 *
 * Story 2.2 owns chapter markers (vertebrae). The `chapters` slot is
 * left as a no-op stub so future stories can drop in markers without
 * a breaking change.
 */
export class VTimelineScrubber extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        position: fixed;
        left: var(--v-edge-margin);
        right: var(--v-edge-margin);
        bottom: var(--v-edge-margin);
        z-index: var(--v-z-scrubber);
        display: block;
        user-select: none;
        touch-action: none;
      }

      .track {
        position: relative;
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

      /* 44×44 hit target via a transparent overlay around the thumb glyph.
         Sized to exceed WCAG 2.5.5 (44px). The pseudo-element absorbs the
         hit test; the visible glyph stays 14px. */
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

      .chapters {
        position: absolute;
        inset: 0;
        pointer-events: none;
        /* Story 2.2 will paint chapter markers (vertebrae) into this slot. */
      }
    `,
  ];

  static override properties = {
    variant: { type: String, reflect: true },
    simEt: { type: Number, reflect: false },
    isPlaying: { type: Boolean, reflect: false },
  };

  declare variant: ScrubberVariant;
  declare isPlaying: boolean;

  private _simEt: number = MISSION_START_ET;

  // Clamp at the property boundary so external writers (Story 1.10's
  // ClockManager subscription, tests, direct attribute hydration) cannot push
  // simEt outside [MISSION_START_ET, MISSION_END_ET]. The keyboard and
  // pointer paths already clamp via applyEt; this is the defensive third
  // line for everyone else.
  get simEt(): number {
    return this._simEt;
  }
  set simEt(value: number) {
    const clamped = clampEt(value);
    if (clamped === this._simEt) return;
    const old = this._simEt;
    this._simEt = clamped;
    this.requestUpdate('simEt', old);
  }

  /**
   * URL writeback delegate. Defaulted to a real `URLSync` reading the
   * global `window`. Tests pass a stub.
   */
  urlSync: URLSync | null = null;

  private wasPlayingBeforeScrub = false;
  private isDragging = false;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private detachPointer: (() => void) | null = null;

  constructor() {
    super();
    this.variant = 'mission';
    this.simEt = MISSION_START_ET;
    this.isPlaying = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.urlSync === null && typeof window !== 'undefined') {
      this.urlSync = new URLSync();
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.resumeTimer !== null) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    if (this.detachPointer !== null) {
      this.detachPointer();
      this.detachPointer = null;
    }
  }

  private computeFraction(): number {
    const span = MISSION_END_ET - MISSION_START_ET;
    if (span <= 0) return 0;
    return (clampEt(this.simEt) - MISSION_START_ET) / span;
  }

  private emitScrub(source: ScrubSource): void {
    this.dispatchEvent(
      new CustomEvent('voyager:scrub', {
        bubbles: true,
        composed: true,
        detail: { et: this.simEt, source },
      }),
    );
  }

  private startScrub(): void {
    if (this.resumeTimer !== null) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
      // We were already scrubbing — preserve the existing wasPlayingBeforeScrub.
      return;
    }
    this.wasPlayingBeforeScrub = this.isPlaying;
    this.isPlaying = false;
  }

  private scheduleResume(): void {
    if (this.resumeTimer !== null) {
      clearTimeout(this.resumeTimer);
    }
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      if (this.wasPlayingBeforeScrub) {
        this.isPlaying = true;
      }
    }, SCRUB_RESUME_DELAY_MS);
  }

  private applyEt(newEt: number, source: ScrubSource): void {
    this.simEt = clampEt(newEt);
    this.emitScrub(source);
    if (source === 'pointer' && !this.isDragging) {
      // Track-click (jump-to-here). The release path didn't drag, so we
      // bypass the throttle.
      this.urlSync?.writeEtImmediate(this.simEt);
    } else {
      this.urlSync?.writeEtThrottled(this.simEt);
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    let delta = 0;
    let absolute: number | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        delta = e.shiftKey ? -TEN_DAYS_SECONDS : -ONE_DAY_SECONDS;
        break;
      case 'ArrowRight':
        delta = e.shiftKey ? TEN_DAYS_SECONDS : ONE_DAY_SECONDS;
        break;
      case 'Home':
        absolute = MISSION_START_ET;
        break;
      case 'End':
        absolute = MISSION_END_ET;
        break;
      default:
        return;
    }
    e.preventDefault();
    this.startScrub();
    const next = absolute !== null ? absolute : this.simEt + delta;
    this.applyEt(next, 'keyboard');
    this.scheduleResume();
  };

  private trackEl(): HTMLElement | null {
    return this.shadowRoot?.querySelector<HTMLElement>('.track') ?? null;
  }

  private etFromClientX(clientX: number): number {
    const track = this.trackEl();
    if (track === null) return this.simEt;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return this.simEt;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return MISSION_START_ET + frac * (MISSION_END_ET - MISSION_START_ET);
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    const track = this.trackEl();
    const thumb = this.shadowRoot?.querySelector<HTMLElement>('.thumb');
    if (track !== null && this.detachPointer === null) {
      // Attach once. The same primitive handles both track-click and
      // thumb-drag because the thumb's 44×44 pseudo overlays the track.
      this.detachPointer = attachPointerHandlers(track, {
        onDown: ({ x, raw, pointerType }) => {
          // Begin a drag when the press starts on the thumb's hit area;
          // otherwise treat as a track-click (jump to that timestamp).
          const targetIsThumb =
            raw.target instanceof Element && raw.target.classList.contains('thumb');
          this.isDragging = targetIsThumb;
          if (targetIsThumb) {
            thumb?.setAttribute('data-dragging', '');
          }
          this.startScrub();
          this.applyEt(this.etFromClientX(x), 'pointer');
          // Suppress text-selection / scroll on touch.
          raw.preventDefault?.();
          // touch/pen drags need pointer-type fall-back; pointerType is read
          // off the payload but currently unused — left as a hook for the
          // detail variant in Story 4.4.
          void pointerType;
        },
        onMove: ({ x }) => {
          if (!this.isDragging) return;
          this.applyEt(this.etFromClientX(x), 'pointer');
        },
        onUp: () => {
          if (this.isDragging) {
            this.isDragging = false;
            thumb?.removeAttribute('data-dragging');
            // pointerup release → final URL writeback is unconditional.
            this.urlSync?.writeEtImmediate(this.simEt);
          }
          this.scheduleResume();
        },
        onCancel: () => {
          if (this.isDragging) {
            this.isDragging = false;
            thumb?.removeAttribute('data-dragging');
          }
          this.scheduleResume();
        },
      });
    }
  }

  override render(): TemplateResult {
    const fracPct = `${(this.computeFraction() * 100).toFixed(4)}%`;
    const valueMin = isoFromEt(MISSION_START_ET);
    const valueMax = isoFromEt(MISSION_END_ET);
    const valueNow = isoFromEt(this.simEt);
    const valueText = formatForHud(this.simEt);
    return html`
      <div class="track" part="track">
        <div class="fill" style=${`width:${fracPct}`}></div>
        <div class="chapters" part="chapters"></div>
        <div
          class="thumb"
          part="thumb"
          role="slider"
          tabindex="0"
          aria-label="Mission timeline"
          aria-valuemin=${valueMin}
          aria-valuemax=${valueMax}
          aria-valuenow=${valueNow}
          aria-valuetext=${valueText}
          aria-orientation="horizontal"
          style=${`left:${fracPct}`}
          @keydown=${this.onKeyDown}
        ></div>
      </div>
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('v-timeline-scrubber')) {
  customElements.define('v-timeline-scrubber', VTimelineScrubber);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-timeline-scrubber': VTimelineScrubber;
  }
}
