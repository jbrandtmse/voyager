import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import {
  FALLBACK_BROWSER_LINKS,
  FALLBACK_HEADLINE,
  FALLBACK_REASON_COPY,
  normalizeFallbackReason,
  type FallbackReason,
} from '../boot/fallback-page-static';

/**
 * `<v-fallback-page>` — Voyager browser-unsupported fallback page.
 *
 * The DESIGN SOURCE for `/unsupported.html`. The Vite plugin in
 * `vite.config.ts` reads the static helpers in `v-fallback-page-static.ts`
 * at build time and emits a fully-static `web/dist/unsupported.html` that
 * works with JS disabled (default `reason=webgl2` variant baked in; a
 * tiny inline script swaps the variant copy when `?reason=` is present).
 *
 * The runtime `<v-fallback-page>` element is not consumed by the main app
 * flow — the boot-time probe (`web/src/boot/feature-detect.ts`) redirects
 * to the pre-rendered static HTML instead. The Lit element exists so the
 * design source is testable, the copy is colocated with the rest of the
 * component library, and the variants can be inspected in isolation.
 *
 * Per ADR 0022: browser-unsupported fallback page is the policy; a
 * degraded simulation is explicitly rejected. See architecture line 950
 * (boot-time error policy) and FR57 / NFR-C7 / UX-DR17.
 *
 * The pure static helpers (`renderFallbackPageHTML`,
 * `renderFallbackPageInlineCSS`, `renderFallbackPageSwapScript`) live in
 * the sibling `v-fallback-page-static.ts` module so `vite.config.ts` can
 * import them without pulling Lit into the Node-side config bundle. This
 * file re-exports them for runtime convenience.
 */
export class VFallbackPage extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        display: block;
        background: var(--v-color-bg);
        color: var(--v-color-fg);
        min-height: 100vh;
        padding: var(--v-edge-margin);
        box-sizing: border-box;
      }

      main {
        max-width: 720px;
        margin: 0 auto;
        padding-top: var(--v-space-16);
      }

      h1 {
        font-family: var(--v-font-sans);
        font-size: var(--v-font-size-chapter-title);
        font-weight: 600;
        line-height: 1.2;
        margin: 0 0 var(--v-space-6) 0;
        color: var(--v-color-fg);
      }

      p {
        font-family: var(--v-font-serif);
        font-size: var(--v-font-size-chapter-copy);
        line-height: 1.55;
        margin: 0 0 var(--v-space-8) 0;
        color: var(--v-color-fg);
      }

      .browsers-intro {
        font-family: var(--v-font-sans);
        font-size: var(--v-font-size-body);
        color: var(--v-color-fg-muted);
        margin-bottom: var(--v-space-3);
      }

      ul {
        list-style: none;
        padding: 0;
        margin: 0;
        font-family: var(--v-font-sans);
        font-size: var(--v-font-size-body);
      }

      li {
        margin-bottom: var(--v-space-2);
        color: var(--v-color-fg-muted);
      }

      a {
        color: var(--v-color-accent);
        text-decoration: underline;
        text-underline-offset: 0.15em;
      }

      a:hover,
      a:focus-visible {
        color: var(--v-color-fg);
      }
    `,
  ];

  static override properties = {
    reason: { type: String, reflect: true },
  };

  declare reason: FallbackReason;

  constructor() {
    super();
    this.reason = 'webgl2';
  }

  override render(): TemplateResult {
    const reason = normalizeFallbackReason(this.reason);
    return html`
      <main>
        <h1>${FALLBACK_HEADLINE}</h1>
        <p>${FALLBACK_REASON_COPY[reason]}</p>
        <p class="browsers-intro">
          Try the latest version of one of these browsers and reload this page:
        </p>
        <ul>
          ${FALLBACK_BROWSER_LINKS.map(
            (b) => html`<li><a href="${b.href}" rel="noopener">${b.hostnameText}</a></li>`,
          )}
        </ul>
      </main>
    `;
  }
}

// Guard the registration so `vite.config.ts` (Node-side) can import the
// type/class for type-only use without crashing on `customElements is not
// defined`. In any browser-side import (including happy-dom under vitest)
// the registration runs normally.
if (typeof customElements !== 'undefined' && !customElements.get('v-fallback-page')) {
  customElements.define('v-fallback-page', VFallbackPage);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-fallback-page': VFallbackPage;
  }
}

// Re-export the static helpers for ergonomic single-import access.
export {
  FALLBACK_HEADLINE,
  FALLBACK_REASON_COPY,
  FALLBACK_BROWSER_LINKS,
  FALLBACK_REASONS,
  normalizeFallbackReason,
  renderFallbackPageHTML,
  renderFallbackPageInlineCSS,
  renderFallbackPageSwapScript,
} from '../boot/fallback-page-static';
export type { FallbackReason, BrowserLink } from '../boot/fallback-page-static';
