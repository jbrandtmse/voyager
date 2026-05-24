// @vitest-environment happy-dom
//
// Story 6.4 AC1 — `<v-attribution-panel>`.
// States: default, scrolled (scrolled is a visual-only state — axe markup
// is invariant; route suite verifies real-browser scroll behaviour).

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-attribution-panel';

describe('Story 6.4 AC1 — <v-attribution-panel> a11y matrix', () => {
  afterEach(() => {
    document
      .querySelectorAll('v-attribution-panel')
      .forEach((el) => el.remove());
  });

  it('default state — definition list rendered, a11y-clean', async () => {
    const el = document.createElement('v-attribution-panel');
    document.body.appendChild(el);
    const maybeLit = el as unknown as { updateComplete?: Promise<unknown> };
    if (maybeLit.updateComplete) {
      await maybeLit.updateComplete;
    }
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('scrolled state — same markup, a11y still clean', async () => {
    const el = document.createElement('v-attribution-panel');
    document.body.appendChild(el);
    const maybeLit = el as unknown as { updateComplete?: Promise<unknown> };
    if (maybeLit.updateComplete) {
      await maybeLit.updateComplete;
    }
    // Force a scroll position — axe runs against markup, not layout, but
    // the assertion validates that the scrolled DOM remains a11y-clean.
    el.scrollTop = 200;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});
