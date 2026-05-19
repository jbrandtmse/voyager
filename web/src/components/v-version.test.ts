// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BaseElement } from './base-element';
import { VVersion } from './v-version';

// Read package.json via fs to side-step the JSON-import attribute syntax
// (which the test transformer doesn't support consistently across configs).
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf-8'),
) as { version: string };

describe('Story 1.7 AC4 — <v-version> demo component', () => {
  // Importing v-version.ts at the top of this file registers the element
  // via customElements.define(). Lit's @customElement decorator is NOT
  // used — see v-version.ts header for the Vite/esbuild gap rationale.

  it('class extends BaseElement', () => {
    const proto = Object.getPrototypeOf(VVersion.prototype) as object;
    expect(proto).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-version>', () => {
    expect(customElements.get('v-version')).toBe(VVersion);
  });

  it('renders "Voyager v<package.json version>" inside the shadow root', async () => {
    const el = document.createElement('v-version') as VVersion;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot).not.toBeNull();
    const text = el.shadowRoot?.textContent ?? '';
    expect(text).toContain(`Voyager v${pkg.version}`);
    document.body.removeChild(el);
  });

  it('static styles reference the HUD-mono + caption tokens', () => {
    const flat = (VVersion.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('var(--v-font-mono)');
    expect(joined).toContain('var(--v-font-size-caption)');
    expect(joined).toContain('var(--v-color-fg-quiet)');
  });
});
