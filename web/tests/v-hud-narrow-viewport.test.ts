// @vitest-environment happy-dom
/**
 * Story 6.2 AC3 — `<v-hud>` narrow-viewport HUD compaction.
 *
 * Below 1024 px, `<v-hud-distance>` and `<v-hud-instruments>` collapse
 * behind a `⋯` toggle button (top-right corner area). The primary
 * always-visible readouts (`<v-hud-date>`, `<v-hud-chapter-title>`,
 * `<v-hud-speed>`) remain inline regardless of viewport.
 *
 * The toggle:
 *   - Is a native <button> (keyboard-tab-focusable).
 *   - aria-label is "Expand HUD" when collapsed, "Collapse HUD" when
 *     expanded; aria-expanded reflects state.
 *   - Click or Space/Enter toggles the expanded state.
 *   - Expanded state persists across re-evaluations via sessionStorage
 *     (key 'voyager.hud-expanded-at-narrow').
 *
 * Tests use the `narrowViewport` reactive property directly (and the
 * matchMedia API at mount time) since happy-dom's window dimensions
 * are fixed at 1024×768 by default and don't synthesize the (max-
 * width: 1023px) match.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/components/v-hud';
import { VHud } from '../src/components/v-hud';

const SS_KEY = 'voyager.hud-expanded-at-narrow';

const clearSessionStorage = (): void => {
  try {
    window.sessionStorage.clear();
  } catch {
    // ignore
  }
};

const mountHud = async (): Promise<VHud> => {
  const el = document.createElement('v-hud') as VHud;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

beforeEach(() => {
  document.body.innerHTML = '';
  clearSessionStorage();
});

afterEach(() => {
  document.body.innerHTML = '';
  clearSessionStorage();
});

describe('<v-hud> narrow-viewport AC3 — wide viewport (default ≥ 1024)', () => {
  it('renders all 5 sub-components inline; no ⋯ button visible', async () => {
    const el = await mountHud();
    // Wide-viewport default: distance + instruments are rendered.
    expect(el.shadowRoot!.querySelector('v-hud-distance')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-instruments')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-date')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-chapter-title')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-speed')).not.toBeNull();
    // Compact toggle does NOT render at wide viewports.
    expect(el.shadowRoot!.querySelector('.compact-toggle')).toBeNull();
  });
});

describe('<v-hud> narrow-viewport AC3 — narrowViewport=true behavior', () => {
  it('when narrowViewport flips true, <v-hud-distance> and <v-hud-instruments> collapse', async () => {
    const el = await mountHud();
    el.narrowViewport = true;
    await el.updateComplete;
    // Secondary readouts are hidden (default collapsed state).
    expect(el.shadowRoot!.querySelector('v-hud-distance')).toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-instruments')).toBeNull();
    // Primary readouts remain.
    expect(el.shadowRoot!.querySelector('v-hud-date')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-chapter-title')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-speed')).not.toBeNull();
    // ⋯ toggle button is rendered.
    const toggle = el.shadowRoot!.querySelector(
      '.compact-toggle',
    ) as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-label')).toBe('Expand HUD');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent?.trim()).toBe('⋯'); // U+22EF horizontal ellipsis
  });

  it('clicking the ⋯ button expands the HUD (shows distance + instruments)', async () => {
    const el = await mountHud();
    el.narrowViewport = true;
    await el.updateComplete;
    const toggle = el.shadowRoot!.querySelector(
      '.compact-toggle',
    ) as HTMLButtonElement;
    toggle.click();
    await el.updateComplete;
    expect(el.expandedAtNarrow).toBe(true);
    expect(el.shadowRoot!.querySelector('v-hud-distance')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-instruments')).not.toBeNull();
    // Toggle button still present, aria reflects expanded state.
    const toggleAfter = el.shadowRoot!.querySelector(
      '.compact-toggle',
    ) as HTMLButtonElement;
    expect(toggleAfter.getAttribute('aria-label')).toBe('Collapse HUD');
    expect(toggleAfter.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking again collapses', async () => {
    const el = await mountHud();
    el.narrowViewport = true;
    el.expandedAtNarrow = true;
    await el.updateComplete;
    const toggle = el.shadowRoot!.querySelector(
      '.compact-toggle',
    ) as HTMLButtonElement;
    toggle.click();
    await el.updateComplete;
    expect(el.expandedAtNarrow).toBe(false);
    expect(el.shadowRoot!.querySelector('v-hud-distance')).toBeNull();
  });
});

describe('<v-hud> AC3 — sessionStorage persistence', () => {
  it('expandedAtNarrow state persists to sessionStorage on toggle', async () => {
    const el = await mountHud();
    el.narrowViewport = true;
    await el.updateComplete;
    const toggle = el.shadowRoot!.querySelector(
      '.compact-toggle',
    ) as HTMLButtonElement;
    toggle.click();
    await el.updateComplete;
    expect(window.sessionStorage.getItem(SS_KEY)).toBe('true');
    toggle.click();
    await el.updateComplete;
    expect(window.sessionStorage.getItem(SS_KEY)).toBe('false');
  });

  it('mount restores expandedAtNarrow=true from sessionStorage', async () => {
    window.sessionStorage.setItem(SS_KEY, 'true');
    const el = await mountHud();
    expect(el.expandedAtNarrow).toBe(true);
  });

  it('mount with empty sessionStorage defaults to collapsed', async () => {
    const el = await mountHud();
    expect(el.expandedAtNarrow).toBe(false);
  });
});

describe('<v-hud> AC3 — primary readouts always visible', () => {
  it('<v-hud-date>, <v-hud-chapter-title>, <v-hud-speed> render at narrow viewports regardless of expand state', async () => {
    const el = await mountHud();
    // Narrow, collapsed.
    el.narrowViewport = true;
    el.expandedAtNarrow = false;
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('v-hud-date')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-chapter-title')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-speed')).not.toBeNull();

    // Narrow, expanded.
    el.expandedAtNarrow = true;
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('v-hud-date')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-chapter-title')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-speed')).not.toBeNull();
  });
});

describe('<v-hud> AC3 — narrowViewport flips back: respects user preference', () => {
  it('toggling expandedAtNarrow=true then crossing back to wide hides the toggle button (no toggle UI at wide)', async () => {
    const el = await mountHud();
    el.narrowViewport = true;
    await el.updateComplete;
    el.expandedAtNarrow = true;
    await el.updateComplete;
    // Back to wide.
    el.narrowViewport = false;
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.compact-toggle')).toBeNull();
    // The expanded preference is preserved in property + storage —
    // re-crossing to narrow re-shows secondary readouts immediately.
    el.narrowViewport = true;
    await el.updateComplete;
    expect(el.expandedAtNarrow).toBe(true);
    expect(el.shadowRoot!.querySelector('v-hud-distance')).not.toBeNull();
  });
});

describe('<v-hud> AC3 — reflected data-narrow attribute', () => {
  it('narrowViewport=true reflects to data-narrow on host element', async () => {
    const el = await mountHud();
    el.narrowViewport = true;
    await el.updateComplete;
    expect(el.hasAttribute('data-narrow')).toBe(true);
  });

  it('narrowViewport=false removes data-narrow', async () => {
    const el = await mountHud();
    el.narrowViewport = true;
    await el.updateComplete;
    el.narrowViewport = false;
    await el.updateComplete;
    expect(el.hasAttribute('data-narrow')).toBe(false);
  });
});
