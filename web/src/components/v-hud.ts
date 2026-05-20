import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import './v-hud-date';
import './v-hud-distance';
import './v-hud-speed';
import './v-hud-chapter-title';
import './v-hud-instruments';
import type { VHudDate } from './v-hud-date';
import type { VHudDistance } from './v-hud-distance';
import type { VHudSpeed } from './v-hud-speed';
import type { VHudInstruments } from './v-hud-instruments';
import type { ClockManager } from '../services/clock-manager';
import type { EphemerisService } from '../services/ephemeris-service';

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

      .corner.top-left {
        top: var(--v-edge-margin);
        left: var(--v-edge-margin);
        align-items: flex-start;
      }

      .corner.top-right {
        top: var(--v-edge-margin);
        right: var(--v-edge-margin);
        align-items: flex-end;
      }

      .corner.bottom-left {
        bottom: var(--v-edge-margin);
        left: var(--v-edge-margin);
        align-items: flex-start;
      }

      .corner.bottom-right {
        bottom: var(--v-edge-margin);
        right: var(--v-edge-margin);
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
      }

      .compact-toggle:focus-visible {
        outline: 2px solid var(--v-color-focus);
        outline-offset: 2px;
      }

      /* AC7 — use Story 1.7's existing tablet breakpoint. Story 6.2 fills
         out the collapsed panel behavior; for Story 1.11 the toggle is
         wired but content stays visible. */
      @media (max-width: 1023px) {
        .compact-toggle {
          display: inline-flex;
        }
      }
    `,
  ];

  /** Wired by the host (first-paint.ts). */
  clockManager: ClockManager | null = null;
  ephemerisService: EphemerisService | null = null;

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
  }

  /**
   * Per-frame tick — call this from `RenderEngine.onFrame((et) => hud.tick(et))`.
   * Forwards to the per-frame-mutating sub-components. Speed and chapter
   * title don't tick — they update via subscribe / event.
   */
  tick(et: number): void {
    this.hudDate?.tick(et);
    this.hudDistance?.tick(et);
    // Story 2.9 — instrument-shutoff strikethrough state is driven by ET.
    this.hudInstruments?.tick(et);
  }

  override render(): TemplateResult {
    return html`
      <aside aria-label="Mission HUD">
        <div class="corner top-left">
          <v-hud-chapter-title></v-hud-chapter-title>
        </div>
        <div class="corner top-right">
          <v-hud-date></v-hud-date>
          <v-hud-distance></v-hud-distance>
        </div>
        <div class="corner bottom-left">
          <v-hud-instruments></v-hud-instruments>
        </div>
        <div class="corner bottom-right">
          <v-hud-speed></v-hud-speed>
          <button
            type="button"
            class="compact-toggle"
            aria-label="Expand HUD"
            aria-expanded="false"
          >
            HUD ▾
          </button>
        </div>
      </aside>
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('v-hud')) {
  customElements.define('v-hud', VHud);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-hud': VHud;
  }
}
