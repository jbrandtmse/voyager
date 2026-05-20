import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';

/**
 * `<v-hud-instruments>` — Story 1.11 stub.
 *
 * Renders nothing visible during cruise. Story 2.9 (or wherever the ISS
 * / UVS / PLS / LECP instrument-shutoff legend lands) populates this
 * region. Kept as an empty Lit element so the HUD layout reserves the
 * bottom-left slot.
 */
export class VHudInstruments extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        display: block;
      }
    `,
  ];

  override render(): TemplateResult {
    return html``;
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
