// @vitest-environment happy-dom
//
// Story 6.4 AC1 — `<v-audio-toggle>` (Story 6.1).
// States: off, on, focused. Hover is visual-only — covered by the
// route-level Playwright suite.

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-audio-toggle';
import type { VAudioToggle } from '../../../src/components/v-audio-toggle';

describe('Story 6.4 AC1 — <v-audio-toggle> a11y matrix', () => {
  afterEach(() => {
    document.querySelectorAll('v-audio-toggle').forEach((el) => el.remove());
  });

  it('off state — aria-pressed="false", aria-label present, a11y-clean', async () => {
    const el = document.createElement('v-audio-toggle') as VAudioToggle;
    document.body.appendChild(el);
    await el.updateComplete;
    const button = el.shadowRoot?.querySelector('button');
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    expect(button?.getAttribute('aria-label')).toMatch(/audio on/i);
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('on state — aria-pressed="true", aria-label flips, a11y-clean', async () => {
    const el = document.createElement('v-audio-toggle') as VAudioToggle;
    document.body.appendChild(el);
    await el.updateComplete;
    el.audioOn = true;
    await el.updateComplete;
    const button = el.shadowRoot?.querySelector('button');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.getAttribute('aria-label')).toMatch(/audio off/i);
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('focused state — button retains a11y-clean markup', async () => {
    const el = document.createElement('v-audio-toggle') as VAudioToggle;
    document.body.appendChild(el);
    await el.updateComplete;
    el.shadowRoot?.querySelector('button')?.focus();
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});
