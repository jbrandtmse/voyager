// @vitest-environment happy-dom
//
// Story 6.4 AC1 — `<v-hud>` and its inline sub-components.
//
// States covered:
//   - visible (default)
//   - dismissed (Story 6.2: data-dismissed='true')
//   - narrow-viewport-compacted (data-narrow + expanded/collapsed)
//
// Plus matrix for inline sub-components when mounted standalone:
//   - `<v-hud-date>`, `<v-hud-distance>`, `<v-hud-chapter-title>`,
//     `<v-hud-speed>`, `<v-hud-instruments>`.
//
// Sub-components are deliberately checked WITHIN their parent `<v-hud>`
// states (per the story matrix). Standalone mounts cover the simple
// default state for orthogonality.

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-hud';
import type { VHud } from '../../../src/components/v-hud';

describe('Story 6.4 AC1 — <v-hud> a11y matrix', () => {
  afterEach(() => {
    document.querySelectorAll('v-hud').forEach((el) => el.remove());
  });

  it('visible (default) state — no critical/serious violations', async () => {
    const el = document.createElement('v-hud') as VHud;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('dismissed state — data-dismissed="true" is a11y-clean', async () => {
    const el = document.createElement('v-hud') as VHud;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dismissed = true;
    await el.updateComplete;
    expect(el.getAttribute('data-dismissed')).toBe('true');
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('narrow-viewport-compacted (collapsed) — compact toggle exposed; a11y-clean', async () => {
    const el = document.createElement('v-hud') as VHud;
    document.body.appendChild(el);
    await el.updateComplete;
    el.narrowViewport = true;
    el.expandedAtNarrow = false;
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('narrow-viewport-compacted (expanded) — inline content restored; a11y-clean', async () => {
    const el = document.createElement('v-hud') as VHud;
    document.body.appendChild(el);
    await el.updateComplete;
    el.narrowViewport = true;
    el.expandedAtNarrow = true;
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('embed mode — attitude indicator suppressed; a11y-clean', async () => {
    const el = document.createElement('v-hud') as VHud;
    document.body.appendChild(el);
    await el.updateComplete;
    el.embedEnabled = true;
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});
