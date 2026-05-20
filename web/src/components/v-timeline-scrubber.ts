import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import {
  MISSION_START_ET,
  MISSION_END_ET,
  SCRUB_RESUME_DELAY_MS,
} from '../constants/mission';
import { isoFromEt, formatForHud } from '../math/et-conversions';
import { attachPointerHandlers } from '../primitives/pointer-events';
import { createSliderKeyboardHandler } from '../primitives/slider-keyboard';
import { URLSync } from '../services/url-sync';
import type { ClockManager, ClockState } from '../services/clock-manager';
import type { ChapterDirector } from '../services/chapter-director';
import type { ChapterSpec } from '../types/chapter';
import { ALL_CHAPTERS } from '../chapters/registry';

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
 *   - `aria-valuemin/max` as numeric SPICE ET values (Story 1.15 AC3 —
 *     fixed defect where these rendered as `"0"` via Lit's undefined
 *     coercion; the bindings now route through `String(MISSION_*_ET)`
 *     directly so the template evaluates synchronously at first paint)
 *   - `aria-valuenow` as an ISO-8601 UTC string (assistive-tech announces
 *     it to the user)
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
 * ## Chapter markers (Story 2.2)
 *
 * When `variant === 'mission'` and a `ChapterDirector` is wired via the
 * `chapterDirector` property, the scrubber paints 11 vertical pin markers
 * across the track — one per `ChapterSpec` in `ALL_CHAPTERS`. Each marker
 * is a `<button>` (so it's individually focusable and Enter-activatable);
 * the marker for the director's `activeChapter` paints with
 * `--v-color-accent`, the others with `--v-color-fg-muted`. Markers are
 * positioned via CSS percentage based on
 * `(anchorEt - MISSION_START_ET) / (MISSION_END_ET - MISSION_START_ET)`
 * so the same render function works whether the dev server, CI, or a
 * Chrome DevTools MCP smoke is driving the page.
 *
 * The scrubber subscribes to the director in `connectedCallback` and
 * re-renders on every transition event (ChapterDirector fires only on
 * state changes, not per frame — same cool-under-60Hz contract as
 * ClockManager). Clicking or Enter-pressing a marker calls
 * `clockManager.scrubTo(anchorEt)` AND emits a bubbling `chapter-jump`
 * CustomEvent (`{ slug, anchorEt }`) which Story 2.4's URL router will
 * subscribe to.
 *
 * Hover dwell tooltip is CSS-only with a 200ms transition-delay; on
 * touch devices (`@media (hover: none)`) the marker labels show
 * persistently as the Tier-2 alternative (UX-DR22).
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
        /* Markers individually accept pointer events; the container does not
           absorb them, so the underlying track click-to-jump still works
           where there is no marker. */
        pointer-events: none;
      }

      .chapter-marker {
        /* Reset native <button> chrome — markers are visual pins, not
           gradient buttons. */
        appearance: none;
        background: transparent;
        border: 0;
        padding: 0;
        position: absolute;
        top: 50%;
        /* Position via inline style="left:X%". Translate -50% so the
           anchor falls on the visual center of the pin. */
        transform: translate(-50%, -50%);
        width: 2px;
        height: 18px;
        background-color: var(--v-color-fg-muted);
        cursor: pointer;
        pointer-events: auto;
        outline: none;
      }

      .chapter-marker[data-active] {
        background-color: var(--v-color-accent);
      }

      /* WCAG 2.4.7 — focus indicator routes through the global token
         (Story 1.7). The pin itself is only 2px wide so the ring is
         applied as a box-shadow rather than an outline (which would
         clip on a 2px element). */
      .chapter-marker:focus-visible {
        box-shadow: 0 0 0 2px var(--v-color-focus);
      }

      .chapter-marker-label {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 2px;
        font-family: var(--v-font-mono);
        font-size: var(--v-size-hud-mono-sm);
        text-transform: uppercase;
        color: var(--v-color-fg-muted);
        white-space: nowrap;
        pointer-events: none;
        user-select: none;
      }

      .chapter-marker-tooltip {
        position: absolute;
        bottom: calc(100% + 18px);
        left: 50%;
        transform: translateX(-50%);
        padding: 2px 6px;
        font-family: var(--v-font-mono);
        font-size: var(--v-size-hud-mono-sm);
        color: var(--v-color-accent);
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 80ms ease;
        transition-delay: 0ms;
      }

      /* UX-DR22 Tier-1: pointer with hover capability — show tooltip
         after 200ms dwell, hide immediately on hover-out. */
      @media (hover: hover) {
        .chapter-marker:hover .chapter-marker-tooltip,
        .chapter-marker:focus-visible .chapter-marker-tooltip {
          opacity: 1;
          transition-delay: 200ms;
        }
      }

      /* UX-DR22 Tier-2: no hover capability (touch) — the persistent
         label above the pin already disambiguates each chapter, so the
         hover tooltip is suppressed. */
      @media (hover: none) {
        .chapter-marker-tooltip {
          display: none;
        }
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

  /**
   * Story 2.2 source-of-truth for chapter activation. When non-null and
   * `variant === 'mission'`, the scrubber paints 11 chapter markers and
   * highlights the one matching `chapterDirector.activeChapter`. The
   * director is constructed in `main.ts` from `ALL_CHAPTERS` and shared
   * with the same per-frame ET pump that drives the clock.
   */
  chapterDirector: ChapterDirector | null = null;

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
  private chapterUnsub: (() => void) | null = null;

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
    if (this.chapterDirector !== null && this.chapterUnsub === null) {
      this.chapterUnsub = this.chapterDirector.subscribe(this.onChapterChange);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.clockUnsub !== null) {
      this.clockUnsub();
      this.clockUnsub = null;
    }
    if (this.chapterUnsub !== null) {
      this.chapterUnsub();
      this.chapterUnsub = null;
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

  private onChapterChange = (): void => {
    // ChapterDirector fires on state transitions (out↔entering↔held↔exiting↔
    // passed), NOT per frame. Each transition is a candidate active-marker
    // change so we requestUpdate(); the render() reads activeChapter
    // synchronously.
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

  /**
   * APG Slider keyboard contract — delegated to `primitives/slider-keyboard.ts`
   * per ADR-0025 (Story 3.0 AC4 path (a)). The primitive handles the
   * Home/End/Arrows/Shift+Arrows pattern; this component supplies the
   * Voyager-specific value source (simEt), step sizes (1 day / 10 days),
   * mission window bounds, and the scrub-state side-effects (startScrub /
   * applyEt / scheduleResume).
   */
  private onKeyDown = createSliderKeyboardHandler({
    getValue: () => this.simEt,
    valueMin: MISSION_START_ET,
    valueMax: MISSION_END_ET,
    stepSmall: ONE_DAY_SECONDS,
    stepLarge: TEN_DAYS_SECONDS,
    onStart: () => this.startScrub(),
    onChange: (next: number) => this.applyEt(next, 'keyboard'),
    onEnd: () => this.scheduleResume(),
  });

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

  /**
   * Activate a chapter marker (click or Enter). Jumps the simulation paused
   * to the chapter's `anchorEt` via `clockManager.scrubTo(et)` and emits a
   * bubbling/composed `chapter-jump` CustomEvent. Story 2.4's URL router
   * subscribes to the event to update the URL slug. AC4.
   */
  private activateChapter = (chapter: ChapterSpec): void => {
    if (this.clockManager !== null) {
      this.clockManager.scrubTo(chapter.anchorEt);
    } else {
      // Fallback path for tests that wire markers without a clock — still
      // honour the visual scrub semantics so the marker remains usable.
      const clamped = clampEt(chapter.anchorEt);
      if (clamped !== this._simEtFallback) {
        const old = this._simEtFallback;
        this._simEtFallback = clamped;
        this.requestUpdate('simEt', old);
      }
    }
    this.dispatchEvent(
      new CustomEvent('chapter-jump', {
        bubbles: true,
        composed: true,
        detail: { slug: chapter.slug, anchorEt: chapter.anchorEt },
      }),
    );
  };

  private onMarkerClick(chapter: ChapterSpec): (e: Event) => void {
    return (e: Event): void => {
      // The track also listens for pointerdown via attachPointerHandlers
      // and would otherwise also dispatch a scrub-from-click. Stop it
      // here so the click is unambiguously a chapter jump.
      e.stopPropagation();
      this.activateChapter(chapter);
    };
  }

  /**
   * Marker pointerdown handler — stops the event before it bubbles to
   * the track's `attachPointerHandlers` listener. Without this, pressing
   * a marker would ALSO scrub the simulation to the marker's pixel
   * position via the track-click path, racing the click handler's
   * `scrubTo(anchorEt)`. We want chapter activation to be unambiguous:
   * the click handler is the single source of the jump.
   */
  private onMarkerPointerDown = (e: Event): void => {
    e.stopPropagation();
  };

  private onMarkerKeyDown(chapter: ChapterSpec): (e: KeyboardEvent) => void {
    return (e: KeyboardEvent): void => {
      // Enter and Space activate per WAI-ARIA APG button pattern (Story 1.7
      // / ADR-0025). Arrow keys are intentionally NOT handled here — they
      // remain owned by the slider thumb so the keyboard tab-then-arrow
      // contract from Story 1.9 AC4 stays intact.
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.activateChapter(chapter);
      }
    };
  }

  /**
   * Fractional position of a chapter's anchor along the mission window.
   * Returns a value in [0, 1] suitable for CSS `left: X%`. Anchors
   * outside the mission window (none of the 11 chapters today, but kept
   * as a safety net) clamp to the bounds rather than overflow the track.
   */
  private chapterFraction(chapter: ChapterSpec): number {
    const span = MISSION_END_ET - MISSION_START_ET;
    if (span <= 0) return 0;
    const raw = (chapter.anchorEt - MISSION_START_ET) / span;
    if (raw < 0) return 0;
    if (raw > 1) return 1;
    return raw;
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
    // Story 1.15 AC3 — `aria-valuemin` / `aria-valuemax` carry the numeric
    // SPICE ET range, not ISO-8601 strings. The WAI-ARIA Slider pattern
    // permits any string and the manual browser smoke surfaced a defect
    // where the bound values rendered as the literal `"0"` (Lit silently
    // coerces `undefined` to the string `"0"` on numeric attributes). We
    // route through `String(...)` of the module-level constants so the
    // template evaluates synchronously at first paint — no async-init or
    // late-binding window where the values could be undefined. ISO
    // representations of the current position and value-text remain on
    // `aria-valuenow` / `aria-valuetext` because that's what screen
    // readers announce to the user.
    const valueMin = String(MISSION_START_ET);
    const valueMax = String(MISSION_END_ET);
    const valueNow = isoFromEt(this.simEt);
    const valueText = formatForHud(this.simEt);
    const activeSlug =
      this.variant === 'mission' && this.chapterDirector !== null
        ? this.chapterDirector.activeChapter?.slug ?? null
        : null;
    return html`
      <div class="track" part="track">
        <div class="fill" style=${`width:${fracPct}`}></div>
        <div class="chapters" part="chapters">
          ${this.variant === 'mission'
            ? ALL_CHAPTERS.map((chapter) =>
                this.renderChapterMarker(chapter, activeSlug),
              )
            : null}
        </div>
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

  /**
   * Render a single chapter marker (vertebra) — a focusable `<button>`
   * with the chapter label above, the chapter name as the ARIA label,
   * and a hover-dwell tooltip that reveals the full name (suppressed
   * via CSS on touch devices per UX-DR22 Tier-2).
   *
   * The marker is `--v-color-accent` when its slug matches the
   * director's active chapter, otherwise `--v-color-fg-muted`. The
   * `data-active` boolean attribute drives the colour selector AND is
   * the contract surface the lead's Chrome DevTools MCP smoke
   * (Integration AC7) reads to confirm the active marker.
   */
  private renderChapterMarker(
    chapter: ChapterSpec,
    activeSlug: string | null,
  ): TemplateResult {
    const fracPct = `${(this.chapterFraction(chapter) * 100).toFixed(4)}%`;
    const isoDate = isoFromEt(chapter.anchorEt).slice(0, 10); // YYYY-MM-DD
    const ariaLabel = `${chapter.name} — ${isoDate}`;
    const isActive = chapter.slug === activeSlug;
    return html`
      <button
        type="button"
        class="chapter-marker"
        data-slug=${chapter.slug}
        ?data-active=${isActive}
        aria-label=${ariaLabel}
        style=${`left:${fracPct}`}
        @pointerdown=${this.onMarkerPointerDown}
        @click=${this.onMarkerClick(chapter)}
        @keydown=${this.onMarkerKeyDown(chapter)}
      >
        <span class="chapter-marker-label" aria-hidden="true"
          >${chapter.markerLabel}</span
        >
        <span class="chapter-marker-tooltip" role="tooltip" aria-hidden="true"
          >${chapter.name}</span
        >
      </button>
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
