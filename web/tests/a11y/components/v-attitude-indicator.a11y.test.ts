// @vitest-environment happy-dom
//
// Story 6.4 AC1 — `<v-attitude-indicator>`.
// States: CK-derived, synthesized, transition mid-state.

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-attitude-indicator';
import type { VAttitudeIndicator } from '../../../src/components/v-attitude-indicator';

describe('Story 6.4 AC1 — <v-attitude-indicator> a11y matrix', () => {
  afterEach(() => {
    document
      .querySelectorAll('v-attitude-indicator')
      .forEach((el) => el.remove());
  });

  it('placeholder state (no service wired) — a11y-clean', async () => {
    const el = document.createElement(
      'v-attitude-indicator',
    ) as VAttitudeIndicator;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('CK-derived state — provenance label has accessible name', async () => {
    const el = document.createElement(
      'v-attitude-indicator',
    ) as VAttitudeIndicator;
    document.body.appendChild(el);
    await el.updateComplete;
    // Set provenance reactive prop directly to exercise the CK render branch.
    (el as unknown as { provenance: { regime: string } }).provenance = {
      regime: 'ck',
    };
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('synthesized state — provenance label has accessible name', async () => {
    const el = document.createElement(
      'v-attitude-indicator',
    ) as VAttitudeIndicator;
    document.body.appendChild(el);
    await el.updateComplete;
    (el as unknown as { provenance: { regime: string } }).provenance = {
      regime: 'synthesized',
    };
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('transition mid-state (CK → synthesized) — a11y-clean across the flip', async () => {
    const el = document.createElement(
      'v-attitude-indicator',
    ) as VAttitudeIndicator;
    document.body.appendChild(el);
    await el.updateComplete;
    (el as unknown as { provenance: { regime: string } }).provenance = {
      regime: 'ck',
    };
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
    (el as unknown as { provenance: { regime: string } }).provenance = {
      regime: 'synthesized',
    };
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});
