import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import './v-hud-date';
import './v-hud-distance';
import './v-hud-speed';
import './v-hud-chapter-title';
import './v-hud-instruments';
import './v-attitude-indicator';
import type { VHudDate } from './v-hud-date';
import type { VHudDistance } from './v-hud-distance';
import type { VHudSpeed } from './v-hud-speed';
import type { VHudInstruments } from './v-hud-instruments';
import type { VAttitudeIndicator } from './v-attitude-indicator';
import type { ClockManager } from '../services/clock-manager';
import type { EphemerisService } from '../services/ephemeris-service';
import type { AttitudeService } from '../services/attitude-service';
import type { ChapterDirector } from '../services/chapter-director';
import type { VHudChapterTitle } from './v-hud-chapter-title';
import { isTextInputFocused } from '../lib/text-input-focus';
import { isHelpOverlayOpen } from '../lib/help-overlay-state';

/**
 * Story 6.2 AC3 — sessionStorage key for the user's "expanded HUD at
 * narrow viewport" preference. Surviving across a same-session resize
 * (the user might widen, narrow again) is a UX win; persisting across
 * tabs is out of scope per the AC.
 */
const HUD_EXPANDED_AT_NARROW_KEY = 'voyager.hud-expanded-at-narrow';
const NARROW_MEDIA_QUERY = '(max-width: 1023px)';

/**
 * `<v-hud>` — quiet instrument-panel HUD overlay (Story 1.11 AC1, AC2, AC6, AC7).
 *
 * A single `<aside aria-label="Mission HUD">` anchored to the viewport
 * edges. Sub-components live at the four corners under the canvas-and-
 * edges model:
 *
 *   top-right    `<v-hud-date>` + `<v-hud-distance>` (stacked)
 *   top-left     `<v-hud-chapter-title>` (stub — Epic 2 populates)
 *   bottom-right `<v-hud-speed>`
 *   bottom-left  `<v-hud-instruments>` (stub — Epic 2/6 populates)
 *
 * ## No background fills (AC2)
 *
 * Every HUD text element is transparent over the canvas with a
 * `text-shadow: 0 0 8px rgba(10, 14, 20, 0.8)` so it remains legible
 * over bright canvas areas (sun glare, planet surfaces). The HUD style
 * defense test in `web/tests/hud-style-defense.test.ts` greps the
 * authored CSS for `background:` / `background-color:` declarations and
 * fails the build if any leak in.
 *
 * ## Per-frame mutation
 *
 * Visible DOM updates per frame via the host wiring
 * `engine.onFrame((et) => { date.tick(et); distance.tick(et); })`. The
 * aria-live mirrors of each sub-component update via the debounced
 * `clockManager.subscribe(...)` path and on chapter change (AC6).
 *
 * ## Compaction below 1024px (AC7 — placeholder)
 *
 * Below the existing Story 1.7 tablet breakpoint (`max-width: 1023px`),
 * the `<v-hud-distance>` and `<v-hud-instruments>` sections collapse
 * into a single "HUD ▾" toggle. Story 6.2 owns the final compacted-
 * panel behavior; for Story 1.11 the toggle is wired but the expanded
 * panel content stays inline.
 */
export class VHud extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        position: fixed;
        inset: 0;
        z-index: var(--v-z-hud);
        pointer-events: none;
        /* Global HUD text legibility — applied to every text descendant
           via inheritance. AC2 requires this token-equivalent shadow on
           all HUD text. */
        text-shadow: 0 0 8px rgba(10, 14, 20, 0.8);
        font-family: var(--v-font-mono);
        color: var(--v-color-fg);
        /* Story 6.2 AC1 — dismiss/restore opacity transition. The host
           is opacity 1 by default; data-dismissed='true' flips to 0
           over --v-duration-base (collapses to 0ms under
           prefers-reduced-motion per Story 1.7's token override). */
        opacity: 1;
        transition: opacity var(--v-duration-base) var(--v-ease-out);
      }

      :host([data-dismissed='true']) {
        opacity: 0;
        /* Belt-and-braces against pointer-event leakage during the
           fade-out: the inset corners normally set pointer-events: auto,
           but during the dismissed state we want every child to skip
           the hit-test. */
        pointer-events: none !important;
      }

      :host([data-dismissed='true']) .corner {
        pointer-events: none;
      }

      aside {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .corner {
        position: absolute;
        display: flex;
        flex-direction: column;
        gap: var(--v-space-2);
        pointer-events: auto;
      }

      /* Story 6.2 AC7 — defensive fallback for the corner-positioning
         tokens. Epic 5 retro Action item #8: corners are the load-
         bearing layout pivot; a missing --v-edge-margin token must
         surface as visible-but-offset rendering, NOT a silent
         collapse to top:0 / left:0. Hard-coded 16 px fallback matches
         the token's clamp() floor at narrow viewports. */
      .corner.top-left {
        top: var(--v-edge-margin, 16px);
        left: var(--v-edge-margin, 16px);
        align-items: flex-start;
      }

      .corner.top-right {
        top: var(--v-edge-margin, 16px);
        right: var(--v-edge-margin, 16px);
        align-items: flex-end;
      }

      .corner.bottom-left {
        bottom: var(--v-edge-margin, 16px);
        left: var(--v-edge-margin, 16px);
        align-items: flex-start;
      }

      .corner.bottom-right {
        bottom: var(--v-edge-margin, 16px);
        right: var(--v-edge-margin, 16px);
        align-items: flex-end;
      }

      .compact-toggle {
        appearance: none;
        background: transparent;
        border: 1px solid var(--v-color-divider);
        color: var(--v-color-fg-quiet);
        font-family: var(--v-font-mono);
        font-size: var(--v-size-hud-mono-sm);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: var(--v-space-1) var(--v-space-3);
        border-radius: 4px;
        cursor: pointer;
        display: none;
        line-height: 1;
        min-width: 32px;
        min-height: 32px;
      }

      .compact-toggle:hover {
        color: var(--v-color-fg);
        border-color: var(--v-color-accent);
      }

      .compact-toggle:focus-visible {
        outline: 2px solid var(--v-color-focus);
        outline-offset: 2px;
      }

      /* Story 6.2 AC3 — at narrow viewports (< 1024px), the compact
         toggle button replaces the inline <v-hud-distance> +
         <v-hud-instruments> rendering. The toggle button is rendered
         in the top-right corner area (where the date readout already
         lives). The CSS hides the toggle at wide viewports — the
         narrow-viewport rendering branch in render() is what shows
         it; here we re-enable the display rule under the tablet
         breakpoint. */
      @media (max-width: 1023px) {
        .compact-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      }
    `,
  ];

  static override properties = {
    // Story 3.6 — reflect `embedEnabled` so the conditional render of
    // `<v-attitude-indicator>` re-evaluates when first-paint wires the
    // flag (mirrors the pattern used by `static properties` Lit 3 decls
    // throughout this repo per ADR-0013 — no decorators).
    embedEnabled: { type: Boolean },
    // Story 6.2 AC1 — `dismissed` reflects to the `data-dismissed` host
    // attribute as the literal strings "true" / "false" so the CSS
    // [data-dismissed='true'] selector matches AND tests can probe a
    // distinct visible-vs-dismissed state by reading the attribute. We
    // use a String converter (not Boolean) because the boolean
    // reflect-pattern emits the empty string for true and removes the
    // attribute for false — the story's AC explicitly requires the
    // literal `data-dismissed="true"` and `data-dismissed="false"`
    // forms so the dismissed state is unambiguous when read from the
    // DOM (boolean-reflect ambiguity bites: `getAttribute('data-...')`
    // returning `''` for "true" is a footgun for downstream tooling).
    // Rule 10 — `declare` field + ctor-body init below.
    dismissed: {
      reflect: true,
      attribute: 'data-dismissed',
      converter: {
        fromAttribute: (value: string | null): boolean => value === 'true',
        toAttribute: (value: boolean): string => (value ? 'true' : 'false'),
      },
    },
    // Story 6.2 AC3 — `narrowViewport` is true when matchMedia
    // '(max-width: 1023px)' matches. Re-evaluated on resize listener
    // installed in connectedCallback. Reflected to data-narrow for
    // CSS or test introspection.
    narrowViewport: {
      type: Boolean,
      reflect: true,
      attribute: 'data-narrow',
    },
    // Story 6.2 AC3 — `expandedAtNarrow` toggles the inline rendering
    // of <v-hud-distance> + <v-hud-instruments> when in narrow-
    // viewport mode. Persisted to sessionStorage so the user's
    // preference survives a resize.
    expandedAtNarrow: { type: Boolean },
  };

  /** Wired by the host (first-paint.ts). */
  clockManager: ClockManager | null = null;
  ephemerisService: EphemerisService | null = null;
  /**
   * Story 3.6 — `AttitudeService` is constructed POST-manifest-load (main.ts),
   * AFTER the HUD has mounted. The host (first-paint → main.ts) assigns this
   * once the service is ready; the HUD propagates the reference to the
   * inline `<v-attitude-indicator>` in `updated()`.
   */
  attitudeService: AttitudeService | null = null;
  /**
   * Story 4.10 BUG-006 fix — `ChapterDirector` reference propagated to the
   * inline `<v-hud-chapter-title>` sub-component so its heading populates
   * with the active chapter's name on `held` transitions. Set by the host
   * (`first-paint.ts`) immediately after construction; the HUD propagates
   * it down via `updated()` + the per-tick identity-gated assignment
   * (matching the `attitudeService` / `ephemerisService` patterns).
   */
  chapterDirector: ChapterDirector | null = null;
  /**
   * Story 3.6 AC7 — when true, the inline `<v-attitude-indicator>` is NOT
   * rendered (the chrome-skip discipline from Story 2.5; mirrors
   * `<v-help-overlay>` / `<v-chapter-index>` / `<v-attribution-panel>`
   * conditional mounting in first-paint). The indicator is the only HUD
   * sub-component that participates in the embed chrome split — the date,
   * distance, speed, and instrument readouts are simulation content.
   *
   * Declared via `declare` (no class-field initializer) so the `static
   * properties` reactive-property accessor isn't shadowed (per Lit 3
   * class-field-shadowing rule). Defaulted to `false` in the constructor
   * below so existing test mounts (which never set the flag) preserve the
   * pre-Story-3.6 mounting behavior.
   */
  declare embedEnabled: boolean;
  declare dismissed: boolean;
  declare narrowViewport: boolean;
  declare expandedAtNarrow: boolean;

  /**
   * Story 6.2 AC1 — override-able for tests; the document the global
   * keydown listener attaches to. Mirrors `<v-audio-toggle>`'s pattern.
   */
  keyboardTarget: Document = document;

  /**
   * Story 6.2 AC3 — override-able for tests; the storage backing the
   * `expandedAtNarrow` persistence (sessionStorage by default).
   */
  storage: Storage | null = null;

  private detachGlobalKeys: (() => void) | null = null;
  private mediaQueryList: MediaQueryList | null = null;
  private mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

  constructor() {
    super();
    this.embedEnabled = false;
    this.dismissed = false;
    this.narrowViewport = false;
    this.expandedAtNarrow = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Story 6.2 AC3 — initialise narrow-viewport state from matchMedia
    // synchronously so first render evaluates the right branch. The
    // matchMedia API is broadly available; happy-dom polyfills it
    // (always returns matches:false at default 1024-wide viewport,
    // which is the test-default and matches the wide path).
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.mediaQueryList = window.matchMedia(NARROW_MEDIA_QUERY);
      this.narrowViewport = this.mediaQueryList.matches;
      this.mediaListener = (e: MediaQueryListEvent): void => {
        this.narrowViewport = e.matches;
      };
      // Modern browsers + happy-dom both support addEventListener; some
      // older user-agents only expose the deprecated addListener.
      if (typeof this.mediaQueryList.addEventListener === 'function') {
        this.mediaQueryList.addEventListener('change', this.mediaListener);
      } else if (
        typeof (this.mediaQueryList as unknown as {
          addListener?: (l: (e: MediaQueryListEvent) => void) => void;
        }).addListener === 'function'
      ) {
        (this.mediaQueryList as unknown as {
          addListener: (l: (e: MediaQueryListEvent) => void) => void;
        }).addListener(this.mediaListener);
      }
    }
    // Story 6.2 AC3 — restore the user's "expand HUD at narrow viewport"
    // preference from sessionStorage. The try/catch absorbs the
    // SecurityError that some private-browsing modes throw on
    // sessionStorage access; defaulting to false (collapsed) matches
    // the AC's "expanded state persists across viewport resizes within
    // the same session" — a fresh session starts collapsed.
    try {
      const store = this.storage ??
        (typeof window !== 'undefined' ? window.sessionStorage : null);
      if (store !== null) {
        const value = store.getItem(HUD_EXPANDED_AT_NARROW_KEY);
        if (value === 'true') {
          this.expandedAtNarrow = true;
        }
      }
    } catch {
      // sessionStorage unavailable — fall back to in-memory default.
    }
    // Story 6.2 AC1 — install the global keyboard listener AFTER the
    // initial property setup so first render reflects the correct
    // dismissed/narrow state. We use bubble-phase to keep AC1's
    // contract: HUD's Esc-restore must run AFTER overlay-close
    // handlers (which capture-phase or self-attached at bubble).
    this.detachGlobalKeys = installGlobalShortcut(this, this.keyboardTarget);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.detachGlobalKeys !== null) {
      this.detachGlobalKeys();
      this.detachGlobalKeys = null;
    }
    if (this.mediaQueryList !== null && this.mediaListener !== null) {
      if (typeof this.mediaQueryList.removeEventListener === 'function') {
        this.mediaQueryList.removeEventListener('change', this.mediaListener);
      } else if (
        typeof (this.mediaQueryList as unknown as {
          removeListener?: (l: (e: MediaQueryListEvent) => void) => void;
        }).removeListener === 'function'
      ) {
        (this.mediaQueryList as unknown as {
          removeListener: (l: (e: MediaQueryListEvent) => void) => void;
        }).removeListener(this.mediaListener);
      }
      this.mediaQueryList = null;
      this.mediaListener = null;
    }
  }

  /**
   * Story 6.2 AC1 — public toggle entry used by both the keyboard
   * listener and tests. Flips the dismissed state; the CSS opacity
   * transition + reflected data-dismissed attribute drive the visual
   * + introspection side effects.
   */
  toggleDismissed(): void {
    this.dismissed = !this.dismissed;
  }

  /** Story 6.2 AC1 — explicit restore path (used by Esc-while-dismissed). */
  restoreFromDismissed(): void {
    if (this.dismissed) {
      this.dismissed = false;
    }
  }

  /**
   * Story 6.2 AC3 — toggle the "expanded at narrow viewport" state and
   * persist to sessionStorage. The button click + Space/Enter handler
   * both route through here.
   */
  toggleExpandedAtNarrow(): void {
    this.expandedAtNarrow = !this.expandedAtNarrow;
    try {
      const store = this.storage ??
        (typeof window !== 'undefined' ? window.sessionStorage : null);
      if (store !== null) {
        store.setItem(
          HUD_EXPANDED_AT_NARROW_KEY,
          this.expandedAtNarrow ? 'true' : 'false',
        );
      }
    } catch {
      // sessionStorage unavailable — preference still applies in-
      // memory for the rest of this session; no persistence.
    }
  }

  private onCompactToggleClick = (): void => {
    this.toggleExpandedAtNarrow();
  };

  /** Sub-component handles for direct per-frame tick() invocation. */
  get hudDate(): VHudDate | null {
    return this.shadowRoot?.querySelector<VHudDate>('v-hud-date') ?? null;
  }

  get hudDistance(): VHudDistance | null {
    return this.shadowRoot?.querySelector<VHudDistance>('v-hud-distance') ?? null;
  }

  get hudSpeed(): VHudSpeed | null {
    return this.shadowRoot?.querySelector<VHudSpeed>('v-hud-speed') ?? null;
  }

  get hudInstruments(): VHudInstruments | null {
    return (
      this.shadowRoot?.querySelector<VHudInstruments>('v-hud-instruments') ??
      null
    );
  }

  /** Story 3.6 — sub-component handle for the inline attitude indicator. */
  get attitudeIndicator(): VAttitudeIndicator | null {
    return (
      this.shadowRoot?.querySelector<VAttitudeIndicator>(
        'v-attitude-indicator',
      ) ?? null
    );
  }

  /** Story 4.10 BUG-006 — sub-component handle for the chapter title slot. */
  get hudChapterTitle(): VHudChapterTitle | null {
    return (
      this.shadowRoot?.querySelector<VHudChapterTitle>(
        'v-hud-chapter-title',
      ) ?? null
    );
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    // Propagate wiring down to children after Lit has rendered them.
    const d = this.hudDate;
    if (d !== null) d.clockManager = this.clockManager;
    const dist = this.hudDistance;
    if (dist !== null) {
      dist.clockManager = this.clockManager;
      dist.ephemerisService = this.ephemerisService;
    }
    const sp = this.hudSpeed;
    if (sp !== null) sp.clockManager = this.clockManager;
    // Story 2.9 — `<v-hud-instruments>` needs the clock so its seed render
    // can compute the initial shut-off state without waiting for the first
    // onFrame tick. After the seed, per-frame `tick()` from the host below
    // keeps the strikethrough state in sync.
    const inst = this.hudInstruments;
    if (inst !== null) inst.clockManager = this.clockManager;
    // Story 3.6 — propagate AttitudeService reference so the indicator can
    // call getBusProvenance(activeSpacecraftId, et) on each tick. The service
    // is null until main.ts's ManifestLoader.then() chain constructs it post-
    // manifest-load, at which point the next updated() call wires it through.
    const att = this.attitudeIndicator;
    if (att !== null) att.attitudeService = this.attitudeService;
    // Story 4.10 BUG-006 — propagate ChapterDirector reference so the title
    // slot subscribes to chapter transitions. ChapterDirector exists at
    // boot (constructed in main.ts before first-paint mounts the HUD), so
    // a single `updated()` propagation typically suffices, but the
    // identity-gated per-tick wire in `tick()` defends against the
    // post-render assignment trap (same trap as ephemerisService).
    const title = this.hudChapterTitle;
    if (title !== null) title.chapterDirector = this.chapterDirector;
  }

  /**
   * Per-frame tick — call this from `RenderEngine.onFrame((et) => hud.tick(et))`.
   * Forwards to the per-frame-mutating sub-components. Speed and chapter
   * title don't tick — they update via subscribe / event.
   */
  tick(et: number): void {
    this.hudDate?.tick(et);
    // Story 4.10 BUG-002 fix (2026-05-23) — same trap as Story 3.6's
    // attitudeService propagation: `ephemerisService` is a plain class
    // field (not in `static properties`), so a post-render assignment
    // from `main.ts` does NOT trigger Lit's `updated()`. Without this
    // identity-gated tick-time propagation, the production path (where
    // EphemerisService is constructed AFTER the HUD mounts) leaves
    // `v-hud-distance.ephemerisService` stuck at `null` and every
    // tick's `computeAuString` short-circuits to `"— AU"`. Tests pass
    // because they wire the service before first render; production
    // wires it after.
    const dist = this.hudDistance;
    if (dist !== null) {
      if (dist.ephemerisService !== this.ephemerisService) {
        dist.ephemerisService = this.ephemerisService;
      }
      if (dist.clockManager !== this.clockManager) {
        dist.clockManager = this.clockManager;
      }
      dist.tick(et);
    }
    // Story 2.9 — instrument-shutoff strikethrough state is driven by ET.
    this.hudInstruments?.tick(et);
    // Story 3.6 — propagate the per-frame ET to the inline attitude indicator
    // so it can read AttitudeService.getBusProvenance and gate re-render on
    // actual change (the indicator pins its prev-provenance and only triggers
    // a Lit update when the regime flips, so the 60 Hz call rate is fine).
    //
    // Smoke-time HIGH fix (Story 3.6 smoke): `attitudeService` is a plain
    // class field on `<v-hud>` (not in `static properties`), so assigning to
    // it from `main.ts` post-manifest-load does NOT trigger Lit's `updated()`
    // and the propagation in `updated()` only fires for `embedEnabled`
    // reactive-property changes. Tests passed because they set the service
    // before first render; production sets it after first render, and the
    // indicator stayed stuck on the placeholder. Propagate every tick — the
    // child's reactive-property setter compares identity, so this is a
    // no-op once propagated. Identity-gated to avoid pointless writes once
    // wired.
    const att = this.attitudeIndicator;
    if (att !== null && att.attitudeService !== this.attitudeService) {
      att.attitudeService = this.attitudeService;
    }
    att?.tick(et);
    // Story 4.10 BUG-006 — per-tick identity-gated propagation of the
    // ChapterDirector reference (same trap as ephemerisService /
    // attitudeService: a post-render assignment on a plain class field
    // doesn't trigger Lit's `updated()`). The chapter title's
    // reactive-property setter compares identity, so the assignment is
    // a no-op once wired.
    const title = this.hudChapterTitle;
    if (title !== null && title.chapterDirector !== this.chapterDirector) {
      title.chapterDirector = this.chapterDirector;
    }
  }

  override render(): TemplateResult {
    // Story 6.2 AC3 — narrow-viewport HUD compaction. Below 1024px,
    // <v-hud-distance> and <v-hud-instruments> collapse behind a `⋯`
    // toggle UNLESS the user has expanded them (sessionStorage-
    // persisted). `<v-hud-date>`, `<v-hud-chapter-title>`, and
    // `<v-hud-speed>` remain always-visible — they are the primary
    // readouts.
    const collapseSecondary = this.narrowViewport && !this.expandedAtNarrow;
    const showSecondary = !collapseSecondary;
    const toggleLabel = this.expandedAtNarrow ? 'Collapse HUD' : 'Expand HUD';
    return html`
      <aside aria-label="Mission HUD">
        <div class="corner top-left">
          <v-hud-chapter-title></v-hud-chapter-title>
        </div>
        <div class="corner top-right">
          <v-hud-date></v-hud-date>
          ${this.embedEnabled
            ? null
            : html`<v-attitude-indicator></v-attitude-indicator>`}
          ${showSecondary
            ? html`<v-hud-distance></v-hud-distance>`
            : null}
          ${this.narrowViewport
            ? html`<button
                type="button"
                class="compact-toggle"
                aria-label=${toggleLabel}
                aria-expanded=${this.expandedAtNarrow ? 'true' : 'false'}
                @click=${this.onCompactToggleClick}
              >
                ⋯
              </button>`
            : null}
        </div>
        <div class="corner bottom-left">
          ${showSecondary
            ? html`<v-hud-instruments></v-hud-instruments>`
            : null}
        </div>
        <div class="corner bottom-right">
          <v-hud-speed></v-hud-speed>
        </div>
      </aside>
    `;
  }
}

/**
 * Story 6.2 AC1 — install the document-level keyboard listener owned
 * by `<v-hud>`. Mirrors `<v-audio-toggle>`'s element-owns-its-shortcut
 * pattern (Story 6.1) and `<v-help-overlay>` (Story 2.8). The handler:
 *
 *   - Skips when Ctrl/Alt/Meta is held (the project's modifier-guard
 *     convention).
 *   - Skips when a text input is focused via the shared
 *     isTextInputFocused helper (Shadow-DOM-aware).
 *   - Skips when the help overlay is open (consumes the shared
 *     isHelpOverlayOpen helper extracted by Story 6.2 from Story 6.1).
 *   - Skips when the HUD is in embed mode (the HUD isn't rendered in
 *     embed mode, but defensive guard kept here).
 *
 * Action:
 *
 *   - `h` / `H` toggles `dismissed` — fades the HUD out (or back in).
 *   - `Escape` while dismissed restores the HUD. Esc while visible is
 *     a NO-OP — Esc is reserved for closing overlays per Story 2.8.
 *
 * The listener attaches at BUBBLE phase (default) so overlay-close
 * handlers (which capture-phase or self-attached at bubble) fire
 * FIRST. A user with the help overlay open pressing Esc therefore
 * closes the overlay; pressing Esc again with the HUD still visible
 * is a no-op; pressing H first to dismiss, then Esc, restores.
 */
const installGlobalShortcut = (
  hud: VHud,
  target: Document,
): (() => void) => {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (isTextInputFocused(target)) return;
    // Embed-mode gate — the HUD shouldn't be in the DOM at all in
    // embed mode, but the connectedCallback installs the listener
    // unconditionally so the gate stays here as defense-in-depth.
    if (hud.embedEnabled) return;
    // Help-overlay suppression — Story 6.1's contract carries over.
    if (isHelpOverlayOpen(target)) return;
    if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      hud.toggleDismissed();
      return;
    }
    if (e.key === 'Escape' && hud.dismissed) {
      // Esc-while-dismissed restores the HUD. The check `hud.dismissed`
      // is critical — Esc while VISIBLE must remain a no-op so the
      // user's mental model from Story 2.8 ("Esc closes overlays") is
      // not violated.
      e.preventDefault();
      hud.restoreFromDismissed();
      return;
    }
    // Any other key — let it propagate (Space, digits, etc. are owned
    // by other components).
  };
  target.addEventListener('keydown', onKeyDown);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
  };
};

if (typeof customElements !== 'undefined' && !customElements.get('v-hud')) {
  customElements.define('v-hud', VHud);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-hud': VHud;
  }
}
