import { LitElement, css, type CSSResultGroup } from 'lit';

/**
 * Voyager base Web Component.
 *
 * Provides a Shadow DOM-scoped stylesheet that adopts the global design
 * tokens (defined at `:root` in `web/src/styles/tokens.css`). CSS custom
 * properties inherit through Shadow DOM by default, so components written
 * against `var(--v-*)` work without any per-component setup.
 *
 * ## Contract
 *
 * `BaseElement` is OPTIONAL infrastructure. Per architecture Decision 5 /
 * Story 1.7 AC4, components MAY extend `BaseElement` for the shared
 * `:host` reset, or MAY extend `LitElement` directly when they have
 * different baseline styling needs. Both patterns are explicitly allowed.
 *
 * The base styles set the default text color + font-family for the
 * shadow root. Subclasses concatenate their own `styles` array; Lit
 * merges static `styles` declarations down the prototype chain when the
 * pattern `static styles = [BaseElement.styles, css\`...\`]` is used.
 *
 * @example
 *   class VFoo extends BaseElement {
 *     static styles = [BaseElement.styles, css`:host { padding: 8px; }`];
 *     render() { return html`<p>hello</p>`; }
 *   }
 */
export class BaseElement extends LitElement {
  static override styles: CSSResultGroup = css`
    :host {
      color: var(--v-color-fg);
      font-family: var(--v-font-sans);
      font-size: var(--v-font-size-body);
      line-height: 1.55;
      box-sizing: border-box;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }

    *:focus-visible {
      outline: 2px solid var(--v-color-focus);
      outline-offset: 2px;
    }
  `;
}
