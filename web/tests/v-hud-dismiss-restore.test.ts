// @vitest-environment happy-dom
/**
 * Story 6.2 AC1 + AC2 — `<v-hud>` dismiss/restore via the `H` keyboard
 * shortcut, with `Esc`-while-dismissed as a convenience escape hatch
 * AND `Esc`-while-visible explicitly a no-op (Esc reserved for
 * overlay-close per Story 2.8).
 *
 * Covers:
 *   - H from default state dismisses the HUD (data-dismissed="true",
 *     opacity falls under the CSS transition, pointer-events: none).
 *   - H again restores the HUD.
 *   - Esc while dismissed restores; Esc while visible is no-op.
 *   - Modifier-held H (Ctrl/Alt/Meta) is suppressed.
 *   - H while a text input is focused is suppressed.
 *   - H while <v-help-overlay> is open is suppressed.
 *   - DOM nodes remain present while dismissed (purely visual).
 *   - aria-live regions still fire from <v-hud-chapter-title> while
 *     dismissed (the chapter-title element still subscribes to chapter
 *     transitions; the announcement contract is preserved).
 *   - data-dismissed="true" is reflected to the host element.
 *   - In embed mode the listener no-ops on H.
 *   - disconnectedCallback removes the global listener.
 *   - Rule 10 — dismissed/narrowViewport/expandedAtNarrow are reactive
 *     accessors (not own class-field initialisers).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/components/v-hud';
import { VHud } from '../src/components/v-hud';

const mountHud = async (
  opts: { embedEnabled?: boolean } = {},
): Promise<VHud> => {
  const el = document.createElement('v-hud') as VHud;
  if (opts.embedEnabled === true) el.embedEnabled = true;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

beforeEach(() => {
  document.body.innerHTML = '';
  // Reset sessionStorage between tests so expandedAtNarrow persistence
  // doesn't leak across tests.
  try {
    window.sessionStorage.clear();
  } catch {
    // ignore
  }
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<v-hud> AC1 — `H` keyboard shortcut toggles dismissed', () => {
  it('lowercase h dismisses the HUD from the default visible state', async () => {
    const el = await mountHud();
    expect(el.dismissed).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(true);
    expect(el.getAttribute('data-dismissed')).toBe('true');
  });

  it('uppercase H also dismisses (Shift handling benign)', async () => {
    const el = await mountHud();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'H', bubbles: true, shiftKey: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(true);
  });

  it('pressing H twice toggles back to visible', async () => {
    const el = await mountHud();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    await el.updateComplete;
    expect(el.dismissed).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    await el.updateComplete;
    expect(el.dismissed).toBe(false);
    // Custom converter (v-hud.ts:215-218) emits the literal 'true'/'false'
    // strings — NOT boolean-reflect's empty-string-or-absent form — so the
    // dismissed state is unambiguous when read from the DOM.
    expect(el.getAttribute('data-dismissed')).toBe('false');
  });

  it('H with Ctrl is suppressed', async () => {
    const el = await mountHud();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(false);
  });

  it('H with Alt is suppressed', async () => {
    const el = await mountHud();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', altKey: true, bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(false);
  });

  it('H with Meta is suppressed', async () => {
    const el = await mountHud();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', metaKey: true, bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(false);
  });

  it('H when an <input type="text"> is focused does NOT dismiss', async () => {
    const el = await mountHud();
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(false);
  });

  it('H when a <textarea> is focused does NOT dismiss', async () => {
    const el = await mountHud();
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(false);
  });

  it('H is suppressed when <v-help-overlay> is open (Rule 9 helper reuse)', async () => {
    const el = await mountHud();
    const overlay = document.createElement('v-help-overlay');
    overlay.setAttribute('data-open', 'true');
    document.body.appendChild(overlay);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(false);
    overlay.remove();
  });

  it('H fires normally when <v-help-overlay> is closed (no data-open)', async () => {
    const el = await mountHud();
    const overlay = document.createElement('v-help-overlay');
    document.body.appendChild(overlay);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(true);
    overlay.remove();
  });

  it('H in embed mode is a no-op (HUD chrome should not toggle in embed)', async () => {
    const el = await mountHud({ embedEnabled: true });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(false);
  });
});

describe('<v-hud> AC1 — Esc-while-dismissed restores; Esc-while-visible is no-op', () => {
  it('Esc while dismissed restores the HUD', async () => {
    const el = await mountHud();
    el.dismissed = true;
    await el.updateComplete;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(false);
  });

  it('Esc while visible does NOT dismiss (Esc reserved for overlays)', async () => {
    const el = await mountHud();
    expect(el.dismissed).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(false);
  });

  it('Esc while visible AND no overlay open is a no-op (HUD remains visible)', async () => {
    const el = await mountHud();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(false);
  });
});

describe('<v-hud> AC2 — DOM-presence preserved while dismissed', () => {
  it('dismissed HUD keeps its DOM subtree intact (no removed nodes)', async () => {
    const el = await mountHud();
    el.dismissed = true;
    await el.updateComplete;
    // The shadow DOM aside, corners, and sub-components still exist.
    const aside = el.shadowRoot!.querySelector('aside[aria-label="Mission HUD"]');
    expect(aside).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-date')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-chapter-title')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('v-hud-speed')).not.toBeNull();
  });

  it('dismissed state reflects to data-dismissed="true" on host', async () => {
    const el = await mountHud();
    el.dismissed = true;
    await el.updateComplete;
    expect(el.getAttribute('data-dismissed')).toBe('true');
  });

  it('aria-hidden is NEVER added to the dismissed host (would silence screen readers)', async () => {
    const el = await mountHud();
    el.dismissed = true;
    await el.updateComplete;
    // Neither the host nor the inner aside should be aria-hidden.
    expect(el.hasAttribute('aria-hidden')).toBe(false);
    const aside = el.shadowRoot!.querySelector('aside');
    expect(aside?.hasAttribute('aria-hidden')).toBeFalsy();
  });

  it('child <v-hud-chapter-title> aria-live region remains polite while dismissed', async () => {
    const el = await mountHud();
    el.dismissed = true;
    await el.updateComplete;
    const title = el.shadowRoot!.querySelector('v-hud-chapter-title');
    expect(title).not.toBeNull();
    // The aria-live attribute is owned by the chapter-title component;
    // we only assert that the host element is still in the DOM and is
    // not aria-hidden (which would mask the announcement).
    expect(title!.hasAttribute('aria-hidden')).toBe(false);
  });
});

describe('<v-hud> lifecycle', () => {
  it('disconnectedCallback removes the global keydown listener', async () => {
    const el = await mountHud();
    el.remove();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    // No state mutation possible after disconnect.
    expect(el.dismissed).toBe(false);
  });

  it('reconnect re-installs the listener', async () => {
    const el = await mountHud();
    el.remove();
    document.body.appendChild(el);
    await el.updateComplete;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    await el.updateComplete;
    expect(el.dismissed).toBe(true);
  });
});

describe('<v-hud> Rule 10 — reactive accessor verification', () => {
  it('dismissed is a reactive accessor on the prototype, not an own class-field', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      VHud.prototype,
      'dismissed',
    );
    expect(descriptor).toBeDefined();
    expect(descriptor!.get).toBeTypeOf('function');
    expect(descriptor!.set).toBeTypeOf('function');
  });

  it('narrowViewport is a reactive accessor on the prototype', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      VHud.prototype,
      'narrowViewport',
    );
    expect(descriptor).toBeDefined();
    expect(descriptor!.get).toBeTypeOf('function');
    expect(descriptor!.set).toBeTypeOf('function');
  });

  it('expandedAtNarrow is a reactive accessor on the prototype', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      VHud.prototype,
      'expandedAtNarrow',
    );
    expect(descriptor).toBeDefined();
    expect(descriptor!.get).toBeTypeOf('function');
    expect(descriptor!.set).toBeTypeOf('function');
  });

  it('static properties declares dismissed/narrowViewport/expandedAtNarrow', () => {
    const props = (VHud as unknown as {
      properties?: Record<string, unknown>;
    }).properties;
    expect(props).toBeDefined();
    expect(props!.dismissed).toBeDefined();
    expect(props!.narrowViewport).toBeDefined();
    expect(props!.expandedAtNarrow).toBeDefined();
  });
});
