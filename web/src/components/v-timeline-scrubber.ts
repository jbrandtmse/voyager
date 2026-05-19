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
import type { ClockManager, ClockState } from '../services/clock-manager';

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
 * The thumb tracks `clockManager.simTimeEt` and is the primary control
 * surface for time scrubbing (UX-DR8).
 *
 * ## Story 1.10 — ClockManager consumer
 *
 * Story 1.9 owned a local `simEt` placeholder. Story 1.10 introduced
 * `ClockManager` as the single source of truth for simulation time. The
 * scrubber subscribes to the clock in `connectedCallback`, reads
 * `clockManager.simTimeEt` for rendering, and routes every scrub action
 * through `clockManager.scrubTo(et)` (which pauses as a deliberate side
 * effect). For test back-compat the `simEt` property is preserved as a
 * proxy: writing to it calls `scrubTo`; reading it returns the clock's
 * current ET (or `MISSION_START_ET` when no clock is wired). The
 * `wasPlayingBeforeScrub` resume-after-300ms debounce is a UI keyboard
 * concern and stays in the scrubber.
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
    // simEt and isPlaying are kept as Lit-reactive proxies so test code that
    // writes `el.simEt = X` continues to work; the canonical storage moved
    // to the wired `ClockManager`. See get/set definitions below.
    simEt: { type: Number, reflect: false },
    isPlaying: { type: Boolean, reflect: false },
  };

  declare variant: ScrubberVariant;

  /**
   * Story 1.10 source-of-truth. When non-null, the scrubber subscribes to
   * the clock in `connectedCallback`, reads `clockManager.simTimeEt` for
   * rendering, and routes every scrub through `scrubTo(et)`. When null
   * the scrubber falls back to local state — only used by older Story 1.9
   * tests that haven't been migrated to inject a mock clock.
   */
  clockManager: ClockManager | null = null;

  // Fallback simEt storage used only when no clockManager is wired. Story
  // 1.9 tests that drive the scrubber directly still rely on this.
  private _simEtFallback: number = MISSION_START_ET;

  get simEt(): number {
    if (this.clockManager !== null) return this.clockManager.simTimeEt;
    return this._simEtFallback;
  }
  set simEt(value: number) {
    const clamped = clampEt(value);
    if (this.clockManager !== null) {
      // Proxy to scrubTo. ClockManager also pauses on scrub — same contract
      // as direct scrubber input. Idempotent on no-change.
      if (clamped !== this.clockManager.simTimeEt) {
        this.clockManager.scrubTo(clamped);
      }
      return;
    }
    if (clamped === this._simEtFallback) return;
    const old = this._simEtFallback;
    this._simEtFallback = clamped;
    this.requestUpdate('simEt', old);
  }

  // isPlaying mirrors clockManager.playing when wired; otherwise local. The
  // Story 1.9 tests set it directly to seed the resume-on-scrub behavior.
  private _isPlayingFallback: boolean = false;
  get isPlaying(): boolean {
    if (this.clockManager !== null) return this.clockManager.playing;
    return this._isPlayingFallback;
  }
  set isPlaying(value: boolean) {
    if (this.clockManager !== null) {
      if (value === this.clockManager.playing) return;
      if (value) this.clockManager.play();
      else this.clockManager.pause();
      return;
    }
    if (value === this._isPlayingFallback) return;
    const old = this._isPlayingFallback;
    this._isPlayingFallback = value;
    this.requestUpdate('isPlaying', old);
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
  private clockUnsub: (() => void) | null = null;

  constructor() {
    super();
    this.variant = 'mission';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.urlSync === null && typeof window !== 'undefined') {
      this.urlSync = new URLSync();
    }
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
    if (this.resumeTimer !== null) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    if (this.detachPointer !== null) {
      this.detachPointer();
      this.detachPointer = null;
    }
  }

  private onClockChange = (_state: ClockState): void => {
    // Subscribe fires on play/pause/setRate/scrubTo/autoCap. tick()-driven
    // per-frame advances are read directly by render(); they don't fire
    // here, which is correct — we don't want 60 Hz Lit reactivity.
    this.requestUpdate();
  };

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
    // Capture the pre-scrub playing state. With ClockManager, scrubTo() will
    // pause as its own side effect; without one, mutate the fallback to
    // preserve the Story 1.9 keyboard pause semantics.
    if (this.clockManager !== null) {
      this.wasPlayingBeforeScrub = this.clockManager.playing;
      // No need to manually pause — scrubTo() will.
    } else {
      this.wasPlayingBeforeScrub = this._isPlayingFallback;
      if (this._isPlayingFallback) {
        this._isPlayingFallback = false;
        this.requestUpdate('isPlaying', true);
      }
    }
  }

  private scheduleResume(): void {
    if (this.resumeTimer !== null) {
      clearTimeout(this.resumeTimer);
    }
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      if (!this.wasPlayingBeforeScrub) return;
      if (this.clockManager !== null) {
        this.clockManager.play();
      } else if (!this._isPlayingFallback) {
        this._isPlayingFallback = true;
        this.requestUpdate('isPlaying', false);
      }
    }, SCRUB_RESUME_DELAY_MS);
  }

  private applyEt(newEt: number, source: ScrubSource): void {
    const clamped = clampEt(newEt);
    if (this.clockManager !== null) {
      // Route through scrubTo (which also pauses). Subscriber fires →
      // requestUpdate → re-render with new ET.
      this.clockManager.scrubTo(clamped);
    } else {
      if (clamped !== this._simEtFallback) {
        const old = this._simEtFallback;
        this._simEtFallback = clamped;
        this.requestUpdate('simEt', old);
      }
    }
    this.emitScrub(source);
    const writeEt = clamped;
    if (source === 'pointer' && !this.isDragging) {
      // Track-click (jump-to-here). The release path didn't drag, so we
      // bypass the throttle.
      this.urlSync?.writeEtImmediate(writeEt);
    } else {
      this.urlSync?.writeEtThrottled(writeEt);
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
