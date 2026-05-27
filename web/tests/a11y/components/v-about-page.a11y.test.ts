// @vitest-environment happy-dom
//
// Story 6.4 AC1 — `<v-about-page>` editorial route surface.
// States: default. Closes the Story 2.5 deferral (axe-core verification of
// AC5's a11y-compliant HTML — captions, scopes, headings).

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-about-page';

describe('Story 6.4 AC1 — <v-about-page> a11y matrix', () => {
  afterEach(() => {
    document.querySelectorAll('v-about-page').forEach((el) => el.remove());
  });

  it('default state — full editorial layout (h1 + 6 h2 sections + 2 tables) a11y-clean', async () => {
    const el = document.createElement('v-about-page');
    document.body.appendChild(el);
    // <v-about-page> uses Light DOM (createRenderRoot returns `this`) so the
    // updateComplete promise resolves with the rendered DOM at the host.
    const maybeLit = el as unknown as { updateComplete?: Promise<unknown> };
    if (maybeLit.updateComplete) {
      await maybeLit.updateComplete;
    }
    // Verify the canonical structure landed.
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(el.querySelectorAll('h2').length).toBeGreaterThanOrEqual(6);
    expect(el.querySelectorAll('table caption').length).toBeGreaterThanOrEqual(
      2,
    );
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});
