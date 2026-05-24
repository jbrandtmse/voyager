import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import {
  INSTRUMENTS_IN_ORDER,
  SPACECRAFT_IN_ORDER,
  isShutOffAt,
  type Instrument,
  type SpacecraftId,
} from '../data/mission-facts';
import type { ClockManager } from '../services/clock-manager';

/**
 * `<v-hud-instruments>` — instrument-shutoff schedule readout (Story 2.9 AC3).
 *
 * Story 1.11 left this as a placeholder; Story 2.9 fills it with two rows in
 * the HUD bottom-left corner:
 *
 *   V1 ISS · UVS · PLS · LECP
 *   V2 ISS · UVS · PLS · LECP
 *
 * As the simulation ET crosses each instrument's historical shutoff date
 * (sourced from `web/src/data/mission-facts.ts`, mirroring `MISSION_FACTS.md`),
 * the corresponding instrument transitions from `--v-color-fg-muted` to
 * `--v-color-fg-quiet` with `text-decoration: line-through`. The bass-note
 * elegy of Voyager's progressive shutoff, made legible.
 *
 * ## Per-frame update path
 *
 * Visible DOM mutates outside the Lit reactivity layer (architecture line
 * 424). The `tick(et)` method is wired to `RenderEngine.onFrame` by `<v-hud>`
 * just like `<v-hud-date>` and `<v-hud-distance>`; each call walks the 8
 * instrument cells (2 spacecraft × 4 instruments) and toggles a `shut-off`
 * class based on the current ET vs the cached per-instrument threshold. The
 * comparison cost is trivial — 8 flat numeric reads per frame.
 *
 * ## No background fills (Story 1.11 AC2 — HUD style defense)
 *
 * The component lives inside `<v-hud>` which provides the HUD text-shadow
 * for legibility. No `background:` / `background-color:` declarations are
 * authored here; the existing `hud-style-defense.test.ts` greps the
 * combined HUD-component CSS and would fail the build if any leaked in.
 */
export class VHudInstruments extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--v-space-1);
        font-family: var(--v-font-mono);
        font-variant-numeric: tabular-nums;
        font-size: var(--v-size-hud-mono-sm);
        color: var(--v-color-fg-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .row {
        display: inline-flex;
        align-items: baseline;
        gap: var(--v-space-2);
      }

      .craft-label {
        color: var(--v-color-fg-quiet);
        min-width: 1.5em;
      }

      .instrument-list {
        display: inline-flex;
        gap: var(--v-space-2);
      }

      .instrument {
        color: var(--v-color-fg-muted);
        transition: color var(--v-duration-base) var(--v-ease-out);
      }

      .instrument.shut-off {
        color: var(--v-color-fg-quiet);
        text-decoration: line-through;
      }

      .sep {
        color: var(--v-color-fg-quiet);
        margin: 0 var(--v-space-1);
      }
    `,
  ];

  /** Wired by `<v-hud>.updated()` (mirrors v-hud-date / v-hud-distance). */
  clockManager: ClockManager | null = null;

  /**
   * Cached cell references so per-frame `tick()` doesn't re-query the
   * shadow root for 8 elements every render frame. Populated on the first
   * `tick()` call after render, invalidated on `requestUpdate()`.
   */
  private cellCache: Map<string, HTMLSpanElement> | null = null;

  override updated(): void {
    // Lit re-rendered the shadow tree — invalidate the cell cache so the
    // next tick re-queries against the fresh DOM.
    this.cellCache = null;
  }

  /**
   * Per-frame visible-DOM update. Called by `<v-hud>.tick(et)` which is
   * itself wired to `RenderEngine.onFrame((et) => hud.tick(et))`. Walks all
   * 8 instrument cells and toggles their `shut-off` class based on whether
   * the cell's instrument has already passed its historical shutoff date
   * at the current simulation ET.
   */
  tick(et: number): void {
    if (!Number.isFinite(et)) return;
    const cells = this.ensureCellCache();
    if (cells === null) return;
    for (const sc of SPACECRAFT_IN_ORDER) {
      for (const inst of INSTRUMENTS_IN_ORDER) {
        const cell = cells.get(`${sc}:${inst}`);
        if (cell === undefined) continue;
        const shutOff = isShutOffAt(sc, inst, et);
        cell.classList.toggle('shut-off', shutOff);
      }
    }
  }

  private ensureCellCache(): Map<string, HTMLSpanElement> | null {
    if (this.cellCache !== null) return this.cellCache;
    const root = this.shadowRoot;
    if (root === null) return null;
    const cells = new Map<string, HTMLSpanElement>();
    for (const sc of SPACECRAFT_IN_ORDER) {
      for (const inst of INSTRUMENTS_IN_ORDER) {
        const el = root.querySelector<HTMLSpanElement>(
          `[data-cell="${sc}:${inst}"]`,
        );
        if (el !== null) cells.set(`${sc}:${inst}`, el);
      }
    }
    this.cellCache = cells;
    return cells;
  }

  /**
   * Compute the initial shut-off state for the very first render so the
   * HUD does not flash all-active before the first `tick()` lands. Pulls
   * the seed ET from the wired ClockManager; if no clock is wired yet, no
   * instruments are marked shut-off (mirrors the v-hud-date "render empty
   * until wiring lands" posture).
   */
  private initialShutOff(sc: SpacecraftId, inst: Instrument): boolean {
    if (this.clockManager === null) return false;
    return isShutOffAt(sc, inst, this.clockManager.simTimeEt);
  }

  private renderRow(sc: SpacecraftId): TemplateResult {
    // Story 6.4 AC1 a11y fix — drop `role="row"`. `role="row"` is only
    // valid inside an explicit `role="grid"` / `role="table"` /
    // `role="treegrid"` ancestor (axe-core `aria-required-parent`
    // critical). The HUD instruments panel is not a grid — it's a
    // labelled inline list. `role="group"` keeps the row-grouped
    // semantics for screen readers without trying to be a grid.
    return html`
      <div class="row" role="group" aria-label="${sc} instrument status">
        <span class="craft-label" aria-hidden="true">${sc}</span>
        <span class="instrument-list">
          ${INSTRUMENTS_IN_ORDER.map((inst, i) => {
            const shutOff = this.initialShutOff(sc, inst);
            return html`${i > 0 ? html`<span class="sep" aria-hidden="true">·</span>` : ''}<span
              class=${shutOff ? 'instrument shut-off' : 'instrument'}
              data-cell="${sc}:${inst}"
              >${inst}</span
            >`;
          })}
        </span>
      </div>
    `;
  }

  override render(): TemplateResult {
    return html`
      ${SPACECRAFT_IN_ORDER.map((sc) => this.renderRow(sc))}
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('v-hud-instruments')
) {
  customElements.define('v-hud-instruments', VHudInstruments);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-hud-instruments': VHudInstruments;
  }
}
