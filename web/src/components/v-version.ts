import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
// Vite resolves `.json` imports to ES modules with a default export
// containing the parsed JSON. Same import shape works under vitest.
import pkg from '../../package.json';

/**
 * `<v-version>` — Voyager build-version badge.
 *
 * Smallest demonstration component shipped by Story 1.7. Renders the
 * version from `web/package.json` in the HUD mono face, intended to be
 * dropped in a corner of dev/debug views.
 *
 * Example:
 *   <v-version></v-version>
 *
 * Future components mirror this file shape: `<v-*>` tag, kebab-case
 * filename matching the tag, extends `BaseElement` for the shared
 * Shadow DOM stylesheet (or `LitElement` directly — both are allowed).
 *
 * We register the element via `customElements.define(...)` (vs Lit's
 * `@customElement` decorator) because Vite/vitest's esbuild transformer
 * does not yet emit the TC39 decorator runtime that Lit's decorators
 * depend on. The behavior of both registration paths is identical.
 */
export class VVersion extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        display: inline-block;
        font-family: var(--v-font-mono);
        font-size: var(--v-font-size-caption);
        color: var(--v-color-fg-quiet);
        letter-spacing: 0.02em;
      }
    `,
  ];

  override render(): TemplateResult {
    return html`Voyager v${pkg.version}`;
  }
}

// Idempotent registration — happy-dom's customElements registry can
// throw on duplicate define() when a test re-imports the module.
if (!customElements.get('v-version')) {
  customElements.define('v-version', VVersion);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-version': VVersion;
  }
}
