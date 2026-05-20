import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import { TITLE_CARD_HOLD_MS } from '../constants/mission';

/**
 * `<v-title-card>` — Voyager first-paint title card.
 *
 * Renders the held title "Voyager. 1977 to 2030." centered in the
 * viewport in Inter at `var(--v-size-title-card)`. Holds for
 * `TITLE_CARD_HOLD_MS` (2000 ms — two beats per Story 1.9 AC1) and then
 * dissolves over `var(--v-duration-slow)` (400 ms) before emitting a
 * `voyager:title-card-complete` event. The host listener (main.ts) then
 * removes the card and reveals the scene.
 *
 * Reduced motion: Story 1.7's global `:root` rule collapses
 * `--v-duration-slow` to 0 ms when `prefers-reduced-motion: reduce` is
 * active. The dissolve becomes a no-op transition automatically — the
 * card just disappears and the scene appears. No per-component code path
 * needed.
 *
 * The card emits a `voyager:title-card-complete` custom event (bubbling,
 * composed) when:
 *   - The dissolve transition completes (normal path), OR
 *   - The reduced-motion fast-cut fires (collapsed transition completes
 *     immediately), OR
 *   - A fallback `setTimeout` fires `TITLE_CARD_HOLD_MS + dissolve` later
 *     (defends against missed `transitionend` events when the host
 *     environment skips CSS transitions altogether — happy-dom).
 *
 * Registered via `customElements.define()` (Story 1.7 pattern; no
 * @customElement decorator — Vite/esbuild does not yet emit the TC39
 * decorator runtime).
 */
export class VTitleCard extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--v-color-bg);
        color: var(--v-color-fg);
        z-index: var(--v-z-overlay);
        opacity: 1;
        transition: opacity var(--v-duration-slow) var(--v-ease-in-out);
      }

      :host([data-dissolving]) {
        opacity: 0;
      }

      .title {
        font-family: var(--v-font-sans);
        font-size: var(--v-size-title-card);
        font-weight: 400;
        letter-spacing: -0.01em;
        line-height: 1.1;
        text-align: center;
        /* Aligned with --v-color-fg — no separate token needed. */
      }
    `,
  ];

  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private completed = false;

  override connectedCallback(): void {
    super.connectedCallback();
    this.completed = false;
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      this.startDissolve();
    }, TITLE_CARD_HOLD_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private startDissolve(): void {
    // Attribute change triggers the CSS opacity transition on :host.
    this.setAttribute('data-dissolving', '');
    // Two completion paths: transitionend, OR a fallback timer ~1.5x the
    // dissolve duration. Whichever fires first wins (the other is a no-op).
    this.addEventListener('transitionend', this.handleTransitionEnd, { once: true });
    // Read the resolved duration token at runtime so the fallback timer
    // honours the actual computed motion timing (including reduced motion
    // collapse → 0 ms).
    const slowMs = this.resolveDurationSlowMs();
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      this.emitComplete();
    }, Math.max(0, Math.round(slowMs * 1.5)) + 1);
  }

  private handleTransitionEnd = (e: Event): void => {
    // Multiple properties could fire transitionend (e.g. a child transition).
    // Filter to opacity to be safe.
    const te = e as TransitionEvent;
    if (te.propertyName !== 'opacity' && te.propertyName !== undefined) return;
    this.emitComplete();
  };

  private emitComplete(): void {
    if (this.completed) return;
    this.completed = true;
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    this.dispatchEvent(
      new CustomEvent('voyager:title-card-complete', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private resolveDurationSlowMs(): number {
    // getComputedStyle returns the resolved CSS variable (e.g. "400ms").
    // Reading from :host requires reading from the host element itself.
    const raw = getComputedStyle(this).getPropertyValue('--v-duration-slow').trim();
    if (raw.endsWith('ms')) return parseFloat(raw);
    if (raw.endsWith('s')) return parseFloat(raw) * 1000;
    // Fallback to the documented default value if the token is somehow not
    // resolvable (test envs without :root computed CSS).
    return 400;
  }

  override render(): TemplateResult {
    return html`<span class="title">Voyager. 1977 to 2030.</span>`;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('v-title-card')) {
  customElements.define('v-title-card', VTitleCard);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-title-card': VTitleCard;
  }
}
