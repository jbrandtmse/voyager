import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import {
  MISSION_START_ET,
  MISSION_END_ET,
  SCRUB_RESUME_DELAY_MS,
} from '../constants/mission';
import {
  isoFromEt,
  formatForHud,
  monthDayLabelFromEt,
  monthDayYearLabelFromEt,
} from '../math/et-conversions';
import { attachPointerHandlers } from '../primitives/pointer-events';
import { createSliderKeyboardHandler } from '../primitives/slider-keyboard';
import { cadenceAwareStep } from '../primitives/cadence-aware-step';
import {
  clusterMarkers,
  defaultLabelWidthPx,
  type MarkerDescriptor,
} from '../lib/marker-cluster';
import { URLSync } from '../services/url-sync';
import type { ClockManager, ClockState } from '../services/clock-manager';
import type { ChapterDirector } from '../services/chapter-director';
import type { ChapterSpec, ChapterTransitionEvent } from '../types/chapter';
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
 * Story 4.4 AC2 — the encounter-chapter slug regex. The detail variant
 * slides in iff (a) the chapter slug matches this pattern AND (b) the
 * chapter's `targetBody` falls in the gas-giant barycenter set
 * {5, 6, 7, 8}. The dual gate prevents a future "cruise interlude"
 * chapter that happens to enter `held` from accidentally surfacing
 * the detail scrubber.
 */
const ENCOUNTER_SLUG_PATTERN = /^v[12]-(jupiter|saturn|uranus|neptune)$/;
const GAS_GIANT_NAIF_IDS: ReadonlySet<number> = new Set([5, 6, 7, 8]);

const isEncounterChapter = (chapter: ChapterSpec | null): boolean => {
  if (chapter === null) return false;
  if (!ENCOUNTER_SLUG_PATTERN.test(chapter.slug)) return false;
  if (chapter.targetBody === undefined) return false;
  return GAS_GIANT_NAIF_IDS.has(chapter.targetBody);
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
 *   - `aria-valuenow` as the numeric SPICE ET value (ARIA spec requires
 *     numeric; assistive tech announces `aria-valuetext` in preference)
 *   - `aria-valuetext` as the human-readable "YYYY-MM-DD HH:MM UT" form
 *   - `aria-label="Mission timeline"` (mission variant) or
 *     `"<chapter name> encounter timeline"` (detail variant, Story 4.4 AC5)
 *
 * Keyboard (Story 1.9 AC4 — mission variant):
 *   - `←/→`: ±1 day
 *   - `Shift+←/→`: ±10 days
 *   - `Home/End`: jump to MISSION_START/END
 *   - All five suppress the native scroll-step via `preventDefault()`
 *
 * Keyboard (Story 4.4 AC5 — detail variant, cadence-aware):
 *   - `←/→`: ±10s / ±1min / ±1h depending on |et - anchor|
 *   - `Shift+←/→`: ±100s / ±10min / ±10h (10× the small step)
 *   - `Home/End`: jump to chapter window start/end
 *   - Cadence tiers match `bake/src/bake_trajectories.py:CADENCE_BANDS`
 *
 * Touch target (Story 1.9 AC8 / WCAG 2.5.5):
 *   - Visible thumb glyph 14 px (mission) or 10 px (detail)
 *   - Effective hit area ≥ 44 × 44 px via a transparent `::before`
 *     pseudo-element. The visible glyph is NOT enlarged.
 *
 * ## URL writeback
 *
 * Every scrub change pushes through `URLSync.writeEtThrottled(et)`
 * (250 ms coalesce) during continuous interaction. The `pointerup`
 * release path calls `writeEtImmediate(et)` so the final URL reflects
 * the released value. Story 4.4 AC4 — both the mission AND detail
 * scrubbers funnel into the SAME `URLSync` instance, so the 250 ms
 * throttle is shared (not duplicated per variant).
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
 * ## Detail variant (Story 4.4)
 *
 * When `variant === 'detail'`:
 *   - Track is 4 px tall with `rgba(212, 160, 23, 0.18)` background.
 *   - Thumb is a 10 px solid `--v-color-accent` circle (no border ring).
 *   - Range is `[rangeStart, rangeEnd]` (set by the consumer per
 *     active chapter window — `[windowStartEt, windowEndEt]`).
 *   - Slides in / out on ChapterDirector substate transitions
 *     (`entering` / `exiting`), gated by `isEncounterChapter`.
 *   - Date-range labels render at the track ends.
 *   - Keyboard step is cadence-aware via `cadenceAwareStep(et, chapter)`.
 *
 * When the detail variant is mounted but not active (no encounter
 * chapter held), the host is `aria-hidden="true"` and visually
 * hidden via `opacity: 0` + `transform: translateY(...)`. The slide-in
 * transition is `--v-duration-slow` (400 ms ease-out; 0 ms under
 * reduced-motion via the global token).
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
        /* BUG-E5-009 (2026-05-24): shifted left edge RIGHT by play-button
           width (44px) + gap (12px) = 56px so the leftmost chapter-marker
           labels (V1L / V2L) stopped overlapping the play button glyph.
           Story 6.2 AC6 (2026-05-24 follow-up): with v-audio-toggle
           introduced by Story 6.1 sitting between the play button and
           the scrubber (left = edge + 44 + 8 → 44px wide), the gutter
           needs to clear BOTH controls. New left gutter:
             play-button (44) + gap (8) + audio-toggle (44) + gap (12)
             = 108 px.
           The 12-px tail gap matches the original 12 px before the
           audio-toggle was introduced. Both apply to mission AND
           detail variants.

           Right edge shifted LEFT to accommodate the speed-multiplier's
           readout text at high speeds — the readout grows wider than the
           172px slider track when the text is "1,000,000× — 11.57 days/
           sec" (~194px). Originally 184px gutter; bumped to 222px after
           v2-uranus chapter smoke (2026-05-24) showed the detail-scrubber
           right-edge label "JAN 29, 1986" still being obscured by the
           readout's leftmost characters. 222 = 194 (readout) + 12 (gap)
           + 16 (slop for clamp on smaller viewports). */
        left: calc(var(--v-edge-margin) + 108px);
        right: calc(var(--v-edge-margin) + 222px);
        bottom: var(--v-edge-margin);
        z-index: var(--v-z-scrubber);
        display: block;
        user-select: none;
        touch-action: none;
      }

      /* Story 4.4 — the detail variant sits ABOVE the mission scrubber
         with --v-spacing-md vertical separation. We stack it via the
         host bottom offset = mission bottom + mission-height + spacing. */
      :host([variant='detail']) {
        bottom: calc(var(--v-edge-margin) + 18px + var(--v-space-3, 12px));
        opacity: 0;
        transform: translateY(12px);
        transition: opacity var(--v-duration-slow) var(--v-ease-out),
          transform var(--v-duration-slow) var(--v-ease-out);
        pointer-events: none;
      }

      :host([variant='detail'][data-open]) {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      .track {
        position: relative;
        height: 12px;
        background: var(--v-color-divider);
        border-radius: 6px;
        cursor: pointer;
      }

      /* Story 4.4 AC1 — detail-variant track is 4px tall with a low-
         alpha accent background. The fill colour is suppressed because
         the chapter window IS the range; the thumb position alone
         conveys "you are here." */
      :host([variant='detail']) .track {
        height: 4px;
        background: rgba(212, 160, 23, 0.18);
        border-radius: 2px;
      }

      :host([variant='detail']) .fill {
        /* Suppressed on the detail variant — see comment above. */
        display: none;
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

      /* Story 4.4 AC1 — detail-variant thumb is a 10px solid accent
         circle (NO border ring; distinct from mission variant's pin
         glyph). The 44×44 hit area pseudo-element below is preserved. */
      :host([variant='detail']) .thumb {
        width: 10px;
        height: 10px;
        margin-left: -5px;
        margin-top: -5px;
        background: var(--v-color-accent);
        border: 0;
      }

      /* 44×44 hit target via a transparent overlay around the thumb glyph.
         Sized to exceed WCAG 2.5.5 (44px). The pseudo-element absorbs the
         hit test; the visible glyph stays 14px (mission) / 10px (detail). */
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

      /* Story 6.2 AC5 — BUG-E5-009 residual: when two chapter-marker
         labels would overlap (V2L/V1L, V1J/V2J, V1S/V2S, V2N/PBD), the
         clustering pass collapses them into a combined label rendered
         at the midpoint of the two anchors. The pin lines stay at each
         member's own anchor ET so the click target remains precise; only
         the LABEL is moved. We hide the per-member label and render a
         shared label as a sibling node positioned via inline left offset. */
      .chapter-marker[data-clustered-pair] .chapter-marker-label {
        display: none;
      }

      .chapter-cluster-label {
        position: absolute;
        bottom: 100%;
        margin-bottom: 2px;
        font-family: var(--v-font-mono);
        font-size: var(--v-size-hud-mono-sm);
        text-transform: uppercase;
        color: var(--v-color-fg-muted);
        white-space: nowrap;
        pointer-events: none;
        user-select: none;
        transform: translateX(-50%);
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
        /* Story 6.3 — route fade-in through --v-duration-fast (120ms baseline)
           so prefers-reduced-motion collapses it to 0ms via global.css. The
           previous bare 80ms literal bypassed the token and would have
           persisted as an 80ms fade even under reduced-motion. The
           transition-delay literals below are intentional hover-dwell + hide
           timings (UX-DR22), NOT motion durations — they remain bare per the
           reduced-motion audit (docs/accessibility/reduced-motion.md). */
        transition: opacity var(--v-duration-fast) ease;
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

      /* Story 4.4 AC6 — mission scrubber highlight band marking the
         active chapter's [windowStartEt, windowEndEt] extent. Positioned
         via inline style="left:X%; right:Y%" set by render(). The band
         is rendered ABOVE the divider background but BELOW the fill and
         thumb (z-order from track stacking context). */
      .highlight-band {
        position: absolute;
        top: 0;
        bottom: 0;
        background: rgba(212, 160, 23, 0.18);
        border-radius: 3px;
        pointer-events: none;
      }

      /* Story 4.4 AC1 — detail-variant date-range labels at the track
         ends. Uppercase mono in --v-color-accent. The labels render in
         a flex row below the track. */
      .detail-range-labels {
        display: none;
        margin-top: 4px;
        font-family: var(--v-font-mono);
        font-size: var(--v-size-hud-mono-sm);
        text-transform: uppercase;
        color: var(--v-color-accent);
        justify-content: space-between;
        pointer-events: none;
        user-select: none;
      }

      :host([variant='detail']) .detail-range-labels {
        display: flex;
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
    // Story 4.4 AC1 — detail variant range. The mission variant ignores
    // these (it always renders [MISSION_START_ET, MISSION_END_ET]); the
    // detail variant uses them to pixel-map the track + drive the
    // keyboard handler's valueMin / valueMax + cadence-aware-step anchor.
    rangeStart: { type: Number, attribute: 'range-start' },
    rangeEnd: { type: Number, attribute: 'range-end' },
  };

  declare variant: ScrubberVariant;
  // Story 4.4 / Rule 10 — declare-only on the reactive props; ctor-body
  // assignment below. Class-field initializer would silently shadow
  // Lit's generated accessor (lit.dev/msg/class-field-shadowing). The
  // canonical pattern is v-chapter-index.ts:235-262.
  declare rangeStart: number;
  declare rangeEnd: number;

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
   *
   * Story 4.4 — the detail variant ALSO subscribes when this is non-null,
   * for the `entering`/`exiting`/`held`/`passed` transition events that
   * drive the slide-in / slide-out animations.
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

  /**
   * Story 4.4 AC2 — the detail variant is "open" when an encounter
   * chapter is held (or entering/exiting). The CSS `[data-open]`
   * attribute drives the slide-in via opacity/transform transitions;
   * `aria-hidden` flips synchronously so assistive tech sees the same
   * state the user does.
   */
  private detailOpen = false;

  /**
   * Story 4.4 AC5 — the chapter whose anchor is used for the cadence-
   * aware step computation. Updated on `entering`/`held` transitions
   * (encounter chapters only) so the keyboard tier responds to the
   * current encounter; cleared on `exiting`/`passed` so the detail
   * scrubber, if briefly visible during the exit slide, still computes
   * sensible steps from the last-known anchor.
   */
  private activeDetailChapter: ChapterSpec | null = null;

  constructor() {
    super();
    this.variant = 'mission';
    // Story 4.4 / Rule 10 — ctor-body initialization for the reactive
    // properties. The mission variant ignores these; detail-variant
    // consumers reset them on the chapter-window edges.
    this.rangeStart = MISSION_START_ET;
    this.rangeEnd = MISSION_END_ET;
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
      // Story 4.4 — seed the detail-open state from the director's
      // current activeChapter, so a cold-load that lands inside an
      // encounter window immediately presents the detail scrubber
      // (no flash-of-hidden + flash-of-visible cycle).
      this.syncDetailFromDirector(this.chapterDirector);
    }
    // Story 4.4 — sync aria-hidden on mount BEFORE first render so a
    // detail-variant scrubber that is mounted but not yet open is
    // already inaccessible to assistive tech.
    //
    // Story 6.4 AC1 — pair aria-hidden with `inert` so the slider thumb
    // inside the closed detail variant is removed from the tab order
    // too (axe-core `aria-hidden-focus` is a serious violation when
    // aria-hidden contains focusable content).
    if (this.variant === 'detail') {
      this.setAttribute('aria-hidden', this.detailOpen ? 'false' : 'true');
      if (this.detailOpen) {
        this.setAttribute('data-open', '');
        this.removeAttribute('inert');
      } else {
        this.setAttribute('inert', '');
      }
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

  private onChapterChange = (event: ChapterTransitionEvent): void => {
    // Story 2.2 — mission-variant marker re-render on any transition.
    // Story 4.4 AC2 — detail-variant slide-in/out + range update on
    // encounter-chapter entering/exiting transitions, and active-chapter
    // tracking for cadence-aware steps.
    if (this.variant === 'detail') {
      this.handleDetailTransition(event);
    } else {
      // Mission variant cares about every transition for marker repaint
      // AND for the highlight-band repaint (AC6) which tracks the
      // active encounter chapter.
      this.requestUpdate();
    }
  };

  /**
   * Story 4.4 AC2 — seed the detail-variant's open state from a
   * ChapterDirector's current `activeChapter`. Called on connect and on
   * any `held → entering` / `entering → held` transition. The transition
   * subscriber path also updates `rangeStart` / `rangeEnd` BEFORE the
   * slide-in begins (so the user never sees a flash of wrong-range
   * content).
   */
  private syncDetailFromDirector(director: ChapterDirector): void {
    const active = director.activeChapter;
    if (active !== null && isEncounterChapter(active)) {
      this.activeDetailChapter = active;
      this.rangeStart = active.windowStartEt;
      this.rangeEnd = active.windowEndEt;
      this.detailOpen = true;
    } else {
      this.activeDetailChapter = null;
      this.detailOpen = false;
    }
  }

  private handleDetailTransition(event: ChapterTransitionEvent): void {
    if (!isEncounterChapter(event.chapter)) {
      // Non-encounter chapters never gate the detail variant; ignore.
      this.requestUpdate();
      return;
    }
    // The ChapterDirector FSM's transition states have direction-sensitive
    // meanings:
    //   forward scrub: out → entering → held → exiting → passed
    //   reverse scrub: passed → exiting → held → entering → out
    // The `to === 'entering'` event fires in BOTH directions but means
    // "opening" only when the FROM state is `out` (forward) or `held`
    // (reverse coming back from passed isn't the relevant case here).
    // The cleanest gate is: `held` ⇒ open; everything else ⇒ closed-or-
    // pending-close. We mirror the resting-state semantics from
    // `restingStateAtEt(...)` in ChapterDirector — the detail variant is
    // open iff the cursor is inside the window.
    if (event.to === 'held') {
      // Forward `entering→held` OR reverse `exiting→held`. The detail
      // variant is now open with the correct chapter range.
      this.activeDetailChapter = event.chapter;
      this.rangeStart = event.chapter.windowStartEt;
      this.rangeEnd = event.chapter.windowEndEt;
      this.detailOpen = true;
    } else if (event.to === 'entering') {
      // Forward `out → entering` (about to enter held — open synchronously
      // so the slide-in begins now) OR reverse `held → entering` (about
      // to leave the window via the start edge — close).
      if (event.from === 'out') {
        // Forward entry: open and set range BEFORE the slide-in begins.
        this.activeDetailChapter = event.chapter;
        this.rangeStart = event.chapter.windowStartEt;
        this.rangeEnd = event.chapter.windowEndEt;
        this.detailOpen = true;
      } else {
        // Reverse: leaving the window via the start edge. The next
        // transition (`entering → out`) is what brings the chapter
        // fully outside; close on this edge so the slide-out animates
        // simultaneously with the cursor leaving.
        this.detailOpen = false;
      }
    } else if (event.to === 'exiting' || event.to === 'passed' || event.to === 'out') {
      // Slide out — symmetric with the slide-in. We leave the range
      // populated so the in-flight transition pixels don't reflow to
      // the (default) mission window mid-animation. `out` covers the
      // reverse-scrub `entering → out` final step; `exiting` /
      // `passed` cover the forward path.
      this.detailOpen = false;
    }
    // Reflect the new attribute synchronously so the CSS transition
    // can run in this frame (don't wait for render() — the
    // `[data-open]` selector reads the host attribute, not a shadow-
    // DOM child).
    if (this.detailOpen) {
      this.setAttribute('data-open', '');
      this.setAttribute('aria-hidden', 'false');
      this.removeAttribute('inert');
    } else {
      this.removeAttribute('data-open');
      this.setAttribute('aria-hidden', 'true');
      // Story 6.4 AC1 — pair aria-hidden with inert (see connectedCallback).
      this.setAttribute('inert', '');
    }
    this.requestUpdate();
  }

  /**
   * Story 4.4 AC1 — variant-aware track range. For the mission variant
   * the range is the full mission window; for the detail variant it is
   * `[rangeStart, rangeEnd]` set by the chapter-transition subscriber.
   */
  private rangeLow(): number {
    return this.variant === 'detail' ? this.rangeStart : MISSION_START_ET;
  }
  private rangeHigh(): number {
    return this.variant === 'detail' ? this.rangeEnd : MISSION_END_ET;
  }

  private computeFraction(): number {
    const lo = this.rangeLow();
    const hi = this.rangeHigh();
    const span = hi - lo;
    if (span <= 0) return 0;
    // Clamp to the rendered range — outside-range ETs collapse to the
    // nearest end. The detail variant is conditionally rendered only
    // when the cursor is within the chapter window, so this clamp is a
    // safety net for the slide-out interval (where the cursor may have
    // just left the window).
    const et = this.simEt;
    if (et <= lo) return 0;
    if (et >= hi) return 1;
    return (et - lo) / span;
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
    // Story 4.4 AC4 — the detail-variant scrubber still routes ETs
    // through the full mission clamp (NOT clamped to the chapter
    // window) so a user dragging the detail thumb hard against the
    // edge can land outside the window — at which point the
    // ChapterDirector will eventually fire `exiting` and the slide-out
    // animates. We never want the detail variant to *prevent* leaving
    // the chapter; we only want it to be the visual surface inside.
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
   * Voyager-specific value source (simEt), step sizes, range bounds,
   * and the scrub-state side-effects (startScrub / applyEt /
   * scheduleResume).
   *
   * Story 4.4 AC5 (Rule 9) — for the detail variant, `stepSmall` and
   * `stepLarge` are recomputed lazily on every keystroke via the
   * cadence-aware-step helper. The factory snapshots its options at
   * construction time, but we route through wrapper callbacks that
   * read the CURRENT cursor + active chapter at handler-fire time —
   * the factory's `getValue` already supports this lazy pattern; we
   * apply the same discipline to the step sizes by re-creating the
   * handler whenever the active chapter changes (or by reading the
   * step lazily inside `onChange`).
   *
   * For the mission variant, the step sizes are constants (1 day / 10
   * days) per Story 1.9 AC4.
   */
  private onKeyDown = (e: KeyboardEvent): void => {
    // The factory snapshot pattern is fine for the mission variant
    // because its steps are constants. For the detail variant we need
    // a fresh handler per keystroke so the cadence-aware step
    // recomputes against the current cursor position. We rebuild on
    // every call — the construction cost is trivial (a closure over
    // an options bag) and it keeps the cadence-tier discipline lazy
    // per AC5.
    let stepSmall: number;
    let stepLarge: number;
    if (this.variant === 'detail' && this.activeDetailChapter !== null) {
      const tier = cadenceAwareStep(this.simEt, this.activeDetailChapter.anchorEt);
      stepSmall = tier.stepSmall;
      stepLarge = tier.stepLarge;
    } else {
      stepSmall = ONE_DAY_SECONDS;
      stepLarge = TEN_DAYS_SECONDS;
    }
    const handler = createSliderKeyboardHandler({
      getValue: () => this.simEt,
      valueMin: this.rangeLow(),
      valueMax: this.rangeHigh(),
      stepSmall,
      stepLarge,
      onStart: () => this.startScrub(),
      onChange: (next: number) => this.applyEt(next, 'keyboard'),
      onEnd: () => this.scheduleResume(),
    });
    handler(e);
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
    const lo = this.rangeLow();
    const hi = this.rangeHigh();
    return lo + frac * (hi - lo);
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

  /**
   * Story 4.4 AC6 — fractional position of an encounter chapter's
   * `[windowStartEt, windowEndEt]` extent within the mission window.
   * Returns `[leftFrac, rightFrac]` ∈ [0, 1]² suitable for CSS
   * `left: X%; right: Y%` (NOTE: `right` is `1 - rightFrac`).
   */
  private encounterWindowBounds(
    chapter: ChapterSpec,
  ): { leftFrac: number; rightFrac: number } {
    const span = MISSION_END_ET - MISSION_START_ET;
    if (span <= 0) return { leftFrac: 0, rightFrac: 1 };
    const leftFrac = Math.max(
      0,
      Math.min(1, (chapter.windowStartEt - MISSION_START_ET) / span),
    );
    const rightFrac = Math.max(
      0,
      Math.min(1, (chapter.windowEndEt - MISSION_START_ET) / span),
    );
    return { leftFrac, rightFrac };
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
    // requires `aria-valuenow` to be a NUMERIC value (axe-core
    // `aria-valid-attr-value` is critical when an ISO string is
    // supplied) — the human-readable ISO representation goes on
    // `aria-valuetext` which assistive tech announces in preference to
    // the numeric `aria-valuenow`. Story 1.15 AC3 traced the original
    // defect of these rendering as `"0"` from Lit's `undefined` coercion;
    // routing through `String(...)` of the module-level constants
    // preserves synchronous first-paint evaluation. Story 6.4 AC1
    // amended `aria-valuenow` from `isoFromEt(...)` to the raw ET
    // number after axe-core flagged the ISO string as a critical
    // ARIA-value violation.
    //
    // Story 4.4 AC1 + AC5 — the detail variant exposes the chapter
    // window's bounds (not the mission window) and adopts a chapter-
    // aware aria-label.
    const valueMin = String(this.rangeLow());
    const valueMax = String(this.rangeHigh());
    const valueNow = String(this.simEt);
    const valueText = formatForHud(this.simEt);

    let ariaLabel = 'Mission timeline';
    if (this.variant === 'detail') {
      // Story 4.4 AC5 — when an encounter chapter is active, label reads
      // "<Chapter Name> encounter timeline" (e.g. "Voyager 1 — Jupiter
      // encounter timeline"). The fallback for the rare case where the
      // detail variant is rendered without an active chapter MUST NOT
      // produce "Encounter encounter timeline" (BUG-001 latent
      // duplicate — the previous fallback `'Encounter'` composed into
      // "Encounter encounter timeline"). Falling back to the bare
      // "Encounter timeline" matches production smoke evidence for the
      // detail variant and avoids the screen-reader stutter.
      const name = this.activeDetailChapter?.name;
      ariaLabel = name !== undefined ? `${name} encounter timeline` : 'Encounter timeline';
    }

    const activeChapter =
      this.chapterDirector !== null
        ? this.chapterDirector.activeChapter
        : null;
    const activeSlug =
      this.variant === 'mission' && activeChapter !== null
        ? activeChapter.slug
        : null;

    // Story 4.4 AC6 — mission scrubber highlight band rendered when the
    // detail scrubber is open (active chapter is an encounter). The
    // band is positioned via inline style left/right percentages.
    let highlightBand: TemplateResult | null = null;
    if (
      this.variant === 'mission' &&
      activeChapter !== null &&
      isEncounterChapter(activeChapter)
    ) {
      const { leftFrac, rightFrac } = this.encounterWindowBounds(activeChapter);
      const leftPct = `${(leftFrac * 100).toFixed(4)}%`;
      const rightPct = `${((1 - rightFrac) * 100).toFixed(4)}%`;
      highlightBand = html`
        <div
          class="highlight-band"
          part="highlight-band"
          aria-hidden="true"
          style=${`left:${leftPct};right:${rightPct}`}
        ></div>
      `;
    }

    // Story 4.4 AC1 — detail-variant date-range labels at the track
    // ends. Suppressed on the mission variant via CSS (`display: none`).
    let detailRangeLabels: TemplateResult | null = null;
    if (this.variant === 'detail') {
      const leftLabel = monthDayLabelFromEt(this.rangeStart);
      const rightLabel = monthDayYearLabelFromEt(this.rangeEnd);
      detailRangeLabels = html`
        <div class="detail-range-labels" aria-hidden="true">
          <span class="detail-range-label-left">${leftLabel}</span>
          <span class="detail-range-label-right">${rightLabel}</span>
        </div>
      `;
    }

    return html`
      <div class="track" part="track">
        ${highlightBand}
        <div class="fill" style=${`width:${fracPct}`}></div>
        <div class="chapters" part="chapters">
          ${this.variant === 'mission'
            ? this.renderClusteredChapterMarkers(activeSlug)
            : null}
        </div>
        <div
          class="thumb"
          part="thumb"
          role="slider"
          tabindex="0"
          aria-label=${ariaLabel}
          aria-valuemin=${valueMin}
          aria-valuemax=${valueMax}
          aria-valuenow=${valueNow}
          aria-valuetext=${valueText}
          aria-orientation="horizontal"
          style=${`left:${fracPct}`}
          @keydown=${this.onKeyDown}
        ></div>
      </div>
      ${detailRangeLabels}
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
   *
   * Story 6.2 AC5 — when this marker is part of an overlap-collapsed
   * dual cluster, the `pairContext` carries the cluster fraction
   * (midpoint) and the joined label. The marker's pin line still
   * renders at its OWN anchor ET (click precision preserved); the
   * label is suppressed via the `data-clustered-pair` attribute and
   * a sibling `.chapter-cluster-label` element renders the combined
   * "V1L / V2L"-style label at the midpoint (only on the FIRST member
   * to avoid double-rendering).
   */
  private renderChapterMarker(
    chapter: ChapterSpec,
    activeSlug: string | null,
    pairContext: {
      isInPair: boolean;
      isFirstInPair: boolean;
      clusterFraction: number;
      clusterLabel: string;
    } | null = null,
  ): TemplateResult {
    const fracPct = `${(this.chapterFraction(chapter) * 100).toFixed(4)}%`;
    const isoDate = isoFromEt(chapter.anchorEt).slice(0, 10); // YYYY-MM-DD
    const ariaLabel = `${chapter.name} — ${isoDate}`;
    const isActive = chapter.slug === activeSlug;
    const inPair = pairContext?.isInPair === true;
    // Cluster label: render once per pair, anchored at the midpoint via
    // an inline `left:` percentage. The label is a transform-centred
    // span; on the FIRST member's <button> as a child so the focus
    // ring + hover affordance both still reach it, but visually it
    // floats at the pair's midpoint.
    let clusterLabel: TemplateResult | null = null;
    if (
      inPair &&
      pairContext !== null &&
      pairContext.isFirstInPair
    ) {
      // The cluster label is positioned absolutely against the
      // .chapters container (not the marker button), so we compute the
      // OFFSET from THIS marker's anchor to the cluster midpoint.
      const ownFrac = this.chapterFraction(chapter);
      // The label uses translateX(-50%) to centre on its `left` value.
      // We render `left: <delta>%` relative to the button (which has
      // its own translateX(-50%)). Easier: render at the .chapters
      // container level instead. We'll emit the cluster label as a
      // separate sibling node returned alongside the marker — see
      // renderClusteredChapterMarkers below.
      void ownFrac;
      void clusterLabel;
    }
    return html`
      <button
        type="button"
        class="chapter-marker"
        data-slug=${chapter.slug}
        ?data-active=${isActive}
        ?data-clustered-pair=${inPair}
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

  /**
   * Story 6.2 AC5 — measure the track width at render time (via
   * `getBoundingClientRect()`), run the clustering pass over the 11
   * chapter anchors, and emit a mix of single + dual marker nodes.
   *
   * Behaviour at zero-width tracks (happy-dom + early-render frames):
   * `clusterMarkers` returns single-passthrough markers, so the
   * existing 11-marker behaviour is preserved when the layout pixel
   * width is unknown (the clustering pass IS the only consumer of
   * trackWidthPx — without a real width, no overlap can be computed).
   *
   * The cluster label (e.g. "V1L / V2L") is rendered as a sibling
   * `<span class="chapter-cluster-label">` positioned at the cluster
   * midpoint via an inline `left:` percentage. The pin lines stay
   * at each member's own anchor ET so clicking the LEFT pin jumps to
   * the LEFT chapter and the RIGHT pin jumps to the RIGHT chapter —
   * click precision is preserved per the AC's "clickable in two
   * regions" option.
   */
  private renderClusteredChapterMarkers(
    activeSlug: string | null,
  ): TemplateResult[] {
    const track = this.trackEl();
    // happy-dom returns width: 0 for unmeasured elements; that's the
    // implicit signal to skip clustering (no real layout yet).
    const trackWidthPx = track !== null
      ? track.getBoundingClientRect().width
      : 0;
    const descriptors: MarkerDescriptor<ChapterSpec>[] = ALL_CHAPTERS.map(
      (chapter) => ({
        id: chapter.slug,
        label: chapter.markerLabel,
        fraction: this.chapterFraction(chapter),
        data: chapter,
      }),
    );
    const clusters = clusterMarkers(descriptors, trackWidthPx, defaultLabelWidthPx);
    const out: TemplateResult[] = [];
    for (const cluster of clusters) {
      if (cluster.members.length === 1) {
        const chapter = cluster.members[0]!.data;
        out.push(this.renderChapterMarker(chapter, activeSlug));
      } else {
        // Dual cluster — render BOTH pin buttons at their own
        // fractions, then emit a single combined label at the midpoint.
        const [left, right] = cluster.members;
        out.push(
          this.renderChapterMarker(left!.data, activeSlug, {
            isInPair: true,
            isFirstInPair: true,
            clusterFraction: cluster.fraction,
            clusterLabel: cluster.label,
          }),
        );
        out.push(
          this.renderChapterMarker(right!.data, activeSlug, {
            isInPair: true,
            isFirstInPair: false,
            clusterFraction: cluster.fraction,
            clusterLabel: cluster.label,
          }),
        );
        // Combined label, midpoint-anchored. Positioned absolutely
        // inside `.chapters` (which has `inset: 0`), so `left:X%` is
        // measured against the track width.
        const labelPct = `${(cluster.fraction * 100).toFixed(4)}%`;
        out.push(html`
          <span
            class="chapter-cluster-label"
            data-cluster-id=${cluster.id}
            aria-hidden="true"
            style=${`left:${labelPct}`}
            >${cluster.label}</span
          >
        `);
      }
    }
    return out;
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
