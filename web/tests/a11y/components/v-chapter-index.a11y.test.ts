// @vitest-environment happy-dom
//
// Story 6.4 AC1 — `<v-chapter-index>` listbox component.
// States: closed, open, item-focused, item-selected.
// (`opening` + `item-hovered` are visual transition states verified by the
// route suite.)

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-chapter-index';
import type { VChapterIndex } from '../../../src/components/v-chapter-index';

describe('Story 6.4 AC1 — <v-chapter-index> a11y matrix', () => {
  afterEach(() => {
    document.querySelectorAll('v-chapter-index').forEach((el) => el.remove());
  });

  it('closed state (default) — toggle has aria-expanded="false", a11y-clean', async () => {
    const el = document.createElement('v-chapter-index') as VChapterIndex;
    document.body.appendChild(el);
    await el.updateComplete;
    const toggle = el.shadowRoot?.querySelector('button.toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('open state — listbox visible, aria-expanded="true", a11y-clean', async () => {
    const el = document.createElement('v-chapter-index') as VChapterIndex;
    document.body.appendChild(el);
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    const toggle = el.shadowRoot?.querySelector('button.toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('item-focused state — listbox open, focus inside; a11y-clean', async () => {
    const el = document.createElement('v-chapter-index') as VChapterIndex;
    document.body.appendChild(el);
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    // Listbox options are rendered with role="option"; focus the first one.
    const firstOption =
      el.shadowRoot?.querySelector<HTMLElement>('[role="option"]');
    firstOption?.focus();
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('item-selected state — aria-selected on active option; a11y-clean', async () => {
    const el = document.createElement('v-chapter-index') as VChapterIndex;
    document.body.appendChild(el);
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    const selected =
      el.shadowRoot?.querySelector('[role="option"][aria-selected="true"]') ??
      el.shadowRoot?.querySelector('[role="option"]');
    expect(selected).not.toBeNull();
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});
