// @vitest-environment happy-dom
//
// Story 6.4 AC1 — axe-core component-state matrix for `<v-title-card>`.
//
// States covered (per the story's required matrix):
//   - visible (mounted, pre-dissolve)
//   - dissolving (data-dissolving attribute set)
//   - dismissed (post-removal — implicit; no element to check)
//
// Pattern: each state mounts the component, awaits Lit's `updateComplete`,
// runs axe against the host element, and asserts no `critical` / `serious`
// violations.

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-title-card';
import type { VTitleCard } from '../../../src/components/v-title-card';

describe('Story 6.4 AC1 — <v-title-card> a11y matrix', () => {
  afterEach(() => {
    document.querySelectorAll('v-title-card').forEach((el) => el.remove());
  });

  it('visible state — no critical/serious violations', async () => {
    const el = document.createElement('v-title-card') as VTitleCard;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
    // Disconnect so the held setTimeout doesn't leak past the test.
    el.remove();
  });

  it('dissolving state — data-dissolving attribute set; still a11y-clean', async () => {
    const el = document.createElement('v-title-card') as VTitleCard;
    document.body.appendChild(el);
    await el.updateComplete;
    el.setAttribute('data-dissolving', '');
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
    el.remove();
  });

  it('dismissed state — element removed; document body has no orphan a11y violations', async () => {
    const el = document.createElement('v-title-card') as VTitleCard;
    document.body.appendChild(el);
    await el.updateComplete;
    el.remove();
    // After removal, document.body is clean — there's nothing to check on
    // the component itself. Verify the document body has no critical/serious
    // a11y issues left behind (e.g., orphaned aria-live regions, etc.).
    expect(await runAxe(document.body)).toMatchObject(NO_VIOLATIONS);
  });
});
