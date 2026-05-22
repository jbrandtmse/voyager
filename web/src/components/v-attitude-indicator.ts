import { html, css, type TemplateResult, type PropertyValues } from 'lit';

import { BaseElement } from './base-element';
import type {
  AttitudeService,
  AttitudeProvenance,
} from '../services/attitude-service';

/**
 * `<v-attitude-indicator>` — quiet HUD provenance label (Story 3.6 AC1–AC6).
 *
 * Renders a single-line `<output>` element inline with `<v-hud-date>` in the
 * HUD's top-right region. Two visible states:
 *
 *   - CK regime         "● CK reconstructed"        — `--v-color-ck`
 *   - synthesized regime "● Synthesized (HGA Earth-pointing)" — `--v-color-synth`
 *
 * A discreet "ATT" label in `--v-color-fg-quiet` prefixes the value so the
 * dot/text colour is reinforcement, not the sole signal (FR49 / UX-DR
 * no-color-only encoding).
 *
 * ## Per-frame tick + re-render gating (AC5)
 *
 * `<v-hud>` forwards each `engine.onFrame((et) => hud.tick(et))` invocation
 * to this component's `tick(et)`. The tick reads
 * `attitudeService.getBusProvenance(activeSpacecraftId, et)` and gates Lit's
 * reactive update cycle on actual change — we pin the prev-value in a
 * private field and only mutate the reactive `provenance` property when it
 * differs. A stable provenance over 100 frames triggers ≤ 1 re-render (the
 * initial mount); a regime boundary crossing triggers exactly one
 * additional re-render at the transition.
 *
 * This is a DIFFERENT pattern from `<v-hud-date>` / `<v-hud-distance>` which
 * mutate visible DOM directly outside Lit reactivity. Those components have
 * per-frame text changes (date ticks every second; AU formatting changes
 * every few seconds). This indicator changes value at most once or twice
 * per ET-window crossing (and never during a single chapter once mounted),
 * so the Lit reactive path is correct and cheap.
 *
 * ## Aria-live polite (AC6 / UX-DR no-color-only)
 *
 * The `<output>` element carries `aria-live="polite"` so screen readers
 * announce the provenance text on the next natural pause when it flips.
 * Because re-renders are gated on actual provenance change (AC5), no
 * per-frame announcements leak through — the aria-live mirror only updates
 * on the transition itself.
 *
 * ## Active spacecraft selection — stub default V1 (AC4)
 *
 * Defaults to V1 (NAIF -31) at boot. Public `setActiveSpacecraft(naifId)`
 * lets a future Epic 4 ChapterDirector flip the indicator to V2 during a
 * view-frame change. The setter dispatches a bubbling
 * `CustomEvent('activeSpacecraftChanged', { detail: { naifId } })` so
 * Epic 4 / analytics / tests can subscribe via standard DOM listeners.
 * Story 3.6 does NOT wire ChapterDirector → indicator — that's Epic 4's
 * responsibility; the event-emitter pattern is the wiring contract this
 * story commits to.
 *
 * ## AttitudeService construction-order tolerance (AC1 + AC5)
 *
 * `<v-hud>` is mounted at first-paint (BEFORE the manifest lands), but
 * AttitudeService is constructed POST-ManifestLoader in `main.ts`. The
 * `attitudeService` reactive property may therefore be `null` for the
 * first several frames. The component handles this by rendering a quiet
 * placeholder ("ATT —") until the service is wired, and `tick(et)` is a
 * no-op while `attitudeService === null`.
 */
type ActiveSpacecraftId = -31 | -32;

export class VAttitudeIndicator extends BaseElement {
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

      output {
        display: inline-flex;
        align-items: baseline;
        gap: var(--v-space-2);
        /* <output> ships UA default styles for color/font — explicitly inherit
           so token cascade controls the visual. */
        color: inherit;
        font: inherit;
      }

      .att-label {
        color: var(--v-color-fg-quiet);
        font-size: var(--v-size-hud-mono-sm);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .att-dot {
        font-size: var(--v-size-hud-mono);
        line-height: 1;
        /* The dot inherits its color from the .att-value sibling via shared
           class state below — see :host([data-provenance]) rules. */
        transition: color var(--v-duration-base) ease;
      }

      .att-value {
        font-size: var(--v-size-hud-mono);
        transition: color var(--v-duration-base) ease;
      }

      /* CK regime — muted forest-green dot + value. */
      :host([data-provenance='ck']) .att-dot,
      :host([data-provenance='ck']) .att-value {
        color: var(--v-color-ck);
      }

      /* Synthesized regime — warm gold dot + value. */
      :host([data-provenance='synthesized']) .att-dot,
      :host([data-provenance='synthesized']) .att-value {
        color: var(--v-color-synth);
      }

      /* Pre-service (placeholder) — quiet fg until AttitudeService wires. */
      :host(:not([data-provenance])) .att-dot,
      :host(:not([data-provenance])) .att-value {
        color: var(--v-color-fg-quiet);
      }
    `,
  ];

  /**
   * Lit 3 reactive property declarations via the project's
   * `static properties = { ... }` pattern per ADR-0013 (no decorators).
   *
   * Both `provenance` and `activeSpacecraftId` are state — they MUST be
   * declared so that mutations trigger a re-render via the reactive
   * pipeline. `attitudeService` is also state-like (wire-up may flip from
   * null to non-null after the manifest lands; the rendered placeholder
   * must clear when that happens).
   *
   * `data-provenance` is also reflected to the host attribute so the
   * `:host([data-provenance='ck'])` / `:host([data-provenance='synthesized'])`
   * style selectors above pick up the regime without per-instance style.
   */
  static override properties = {
    provenance: { type: String, reflect: true, attribute: 'data-provenance' },
    activeSpacecraftId: { type: Number },
    attitudeService: { state: true },
  };

  /**
   * Reactive properties — declared via `declare` (no class-field initializer)
   * because class-field initializers shadow Lit's accessor and silently break
   * reactivity (see lit.dev/msg/class-field-shadowing). Initial values are
   * assigned in the constructor instead.
   */
  declare provenance: AttitudeProvenance | undefined;
  declare activeSpacecraftId: ActiveSpacecraftId;
  declare attitudeService: AttitudeService | null;

  /**
   * Pinned previous provenance — used to gate re-render on actual change
   * (AC5). `null` sentinel means "no successful tick yet"; once the first
   * tick lands this becomes 'ck' or 'synthesized' and we only request a Lit
   * update when the new tick produces a different value.
   */
  private prevProvenance: AttitudeProvenance | null = null;

  constructor() {
    super();
    // Story 3.6 AC4 — default active spacecraft is V1 (NAIF -31), the
    // chronological lead. Epic 4 flips this via setActiveSpacecraft.
    this.activeSpacecraftId = -31;
    this.provenance = undefined;
    this.attitudeService = null;
  }

  /**
   * Per-frame tick — wired by `<v-hud>`'s tick propagation. Reads bus
   * provenance for the active spacecraft at the current ET; gates re-render
   * on change (AC5).
   *
   * No-ops if AttitudeService is not yet wired (the manifest may not have
   * landed when the HUD first mounts). The placeholder ("ATT —") stays
   * rendered until the service arrives.
   */
  tick(et: number): void {
    if (this.attitudeService === null) return;
    const next = this.attitudeService.getBusProvenance(
      this.activeSpacecraftId,
      et,
    );
    if (next === this.prevProvenance) return;
    this.prevProvenance = next;
    this.provenance = next;
  }

  /**
   * Active-spacecraft setter — public API the future Epic 4 ChapterDirector
   * calls when a chapter transition flips the viewframe from V1 → V2.
   * Re-evaluates provenance on the next tick (we don't call tick directly
   * here because we'd need the current ET which the caller hasn't provided;
   * the next engine.onFrame propagation will resolve to the new regime).
   *
   * Dispatches a bubbling `CustomEvent('activeSpacecraftChanged')` so
   * subscribers (analytics, tests) can react via standard DOM listeners.
   */
  setActiveSpacecraft(naifId: ActiveSpacecraftId): void {
    if (this.activeSpacecraftId === naifId) return;
    this.activeSpacecraftId = naifId;
    // Force the next tick to re-evaluate by clearing the pinned previous
    // value — otherwise a same-provenance regime on the new spacecraft
    // would short-circuit and leave the rendered text stale.
    this.prevProvenance = null;
    this.dispatchEvent(
      new CustomEvent('activeSpacecraftChanged', {
        detail: { naifId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * When AttitudeService is wired (manifest landed), clear the pinned
   * previous provenance so the next tick re-renders out of the placeholder.
   * Without this, a service wire-up that happens between two ticks with
   * identical provenance would still short-circuit on the second tick
   * because `prevProvenance` remained `null`-but-still-equal to a
   * subsequent `null` read (we no longer read `null` — but defensively
   * reset to make the intent obvious).
   */
  override updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has('attitudeService')) {
      // Re-baseline so a wire-up flip can paint immediately on next tick.
      this.prevProvenance = null;
    }
  }

  override render(): TemplateResult {
    if (this.provenance === undefined) {
      return html`
        <output aria-label="Attitude data provenance" aria-live="polite">
          <span class="att-label" aria-hidden="true">ATT</span>
          <span class="att-dot" aria-hidden="true">●</span>
          <span class="att-value">—</span>
        </output>
      `;
    }
    const valueText =
      this.provenance === 'ck'
        ? 'CK reconstructed'
        : 'Synthesized (HGA Earth-pointing)';
    return html`
      <output aria-label="Attitude data provenance" aria-live="polite">
        <span class="att-label" aria-hidden="true">ATT</span>
        <span class="att-dot" aria-hidden="true">●</span>
        <span class="att-value">${valueText}</span>
      </output>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('v-attitude-indicator')
) {
  customElements.define('v-attitude-indicator', VAttitudeIndicator);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-attitude-indicator': VAttitudeIndicator;
  }
}
