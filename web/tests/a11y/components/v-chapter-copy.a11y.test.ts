// @vitest-environment happy-dom
//
// Story 6.4 AC1 — `<v-chapter-copy>` text-card panel.
// States: visible, hidden, narrow-viewport-drawer-collapsed,
// narrow-viewport-drawer-partial, narrow-viewport-drawer-full.

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-chapter-copy';
import type { VChapterCopy } from '../../../src/components/v-chapter-copy';

describe('Story 6.4 AC1 — <v-chapter-copy> a11y matrix', () => {
  afterEach(() => {
    document.querySelectorAll('v-chapter-copy').forEach((el) => el.remove());
  });

  it('hidden / empty state (no chapter held) — a11y-clean', async () => {
    const el = document.createElement('v-chapter-copy') as VChapterCopy;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('narrow-viewport-drawer-collapsed state — a11y-clean', async () => {
    const el = document.createElement('v-chapter-copy') as VChapterCopy;
    document.body.appendChild(el);
    await el.updateComplete;
    el.narrowViewport = true;
    el.drawerState = 'collapsed';
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('narrow-viewport-drawer-partial state — a11y-clean', async () => {
    const el = document.createElement('v-chapter-copy') as VChapterCopy;
    document.body.appendChild(el);
    await el.updateComplete;
    el.narrowViewport = true;
    el.drawerState = 'partial';
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('narrow-viewport-drawer-full state — a11y-clean', async () => {
    const el = document.createElement('v-chapter-copy') as VChapterCopy;
    document.body.appendChild(el);
    await el.updateComplete;
    el.narrowViewport = true;
    el.drawerState = 'full';
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});
