// @vitest-environment happy-dom
//
// Story 6.4 AC1 — `<v-help-overlay>` modal dialog.
// States: closed, open, item-focused. `opening` + `closing` are visual
// transition states verified by the route suite.

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-help-overlay';
import type { VHelpOverlay } from '../../../src/components/v-help-overlay';

describe('Story 6.4 AC1 — <v-help-overlay> a11y matrix', () => {
  afterEach(() => {
    document.querySelectorAll('v-help-overlay').forEach((el) => el.remove());
  });

  it('closed state (default) — toggle has aria-expanded="false", a11y-clean', async () => {
    const el = document.createElement('v-help-overlay') as VHelpOverlay;
    document.body.appendChild(el);
    await el.updateComplete;
    const toggle = el.shadowRoot?.querySelector('button.toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-label')).toBeTruthy();
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('open state — dialog visible with role/aria-modal/aria-labelledby; a11y-clean', async () => {
    const el = document.createElement('v-help-overlay') as VHelpOverlay;
    document.body.appendChild(el);
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    const dialog = el.shadowRoot?.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('item-focused state — close button focused inside open dialog; a11y-clean', async () => {
    const el = document.createElement('v-help-overlay') as VHelpOverlay;
    document.body.appendChild(el);
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    const closeBtn = el.shadowRoot?.querySelector<HTMLElement>('button.close');
    closeBtn?.focus();
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});
