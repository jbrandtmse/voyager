import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';

/**
 * `<v-hud-chapter-title>` — Story 1.11 stub.
 *
 * Renders an empty `<h2>` during cruise (no chapter active in Epic 1).
 * Story 2.1 wires this up to the real `ChapterDirector`. The slot is
 * kept in the DOM so the HUD layout is stable across the Epic 1 → Epic
 * 2 transition; only the heading text changes.
 *
 * The chapter title heading is intentionally still in the accessibility
 * tree (empty rather than display:none) so AT can advertise the live
 * region as "Chapter title" once content arrives. Aria-live updates
 * fire on chapter change (Story 2.1 owns the wiring).
 */
export class VHudChapterTitle extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        display: block;
        font-family: var(--v-font-sans);
      }

      h2 {
        margin: 0;
        font-size: var(--v-font-size-chapter-title);
        font-weight: 500;
        color: var(--v-color-fg);
        line-height: 1.2;
      }

      /* During cruise the heading carries no text. Reserve the layout
         slot without occupying baseline space so the top-left HUD area
         doesn't reflow when content arrives in Story 2.1. */
      h2:empty {
        min-height: 0;
      }
    `,
  ];

  override render(): TemplateResult {
    return html`<h2 aria-live="polite"></h2>`;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('v-hud-chapter-title')
) {
  customElements.define('v-hud-chapter-title', VHudChapterTitle);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-hud-chapter-title': VHudChapterTitle;
  }
}
