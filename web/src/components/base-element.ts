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
 * ## Implications of the universal-reset rule (Story 6.4 closure of [1.7/LOW])
 *
 * `web/src/styles/global.css` applies a universal reset that zeros
 * `margin` and `padding` on every element (including `*::before` /
 * `*::after`). This reset matches the Story 1.7 AC5 "minimal CSS reset"
 * mandate and is intentional — UA defaults for `<button>`, `<input>`,
 * list bullets, and semantic elements are silently stripped repo-wide.
 *
 * Lit components are largely insulated from this because the universal
 * selector does not cross Shadow DOM boundaries: a `BaseElement`
 * subclass's `:host` shadow root retains its own styling scope. BUT —
 * any element rendered into the Light DOM (e.g. \`<v-about-page>\` and
 * \`<v-attribution-panel>\` per ADR-0013's Light-DOM idiom for editorial
 * surfaces) WILL inherit the universal reset and must re-add any UA
 * defaults it cares about via its companion stylesheet (\`about.css\`
 * does this for the about page's headings, paragraphs, tables, lists).
 *
 * If a future component renders a form element into the Light DOM and
 * relies on the UA's default button / input padding, it MUST opt into
 * a "form-element reset" companion stylesheet that restores the
 * appropriate UA-equivalent padding + border. No such component exists
 * in Voyager today — all controls (\`<v-play-button>\`, \`<v-audio-toggle>\`,
 * \`<v-help-overlay>\` toggle, \`<v-chapter-index>\` toggle) live inside
 * Shadow DOM and are unaffected. This JSDoc block documents the contract
 * so the next contributor doesn't re-discover the trap.
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
