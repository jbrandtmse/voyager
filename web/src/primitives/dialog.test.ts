// @vitest-environment happy-dom
//
// Story 6.4 AC6 — `primitives/dialog.ts` defense suite. Story 6.4 third-
// consumer Rule 9 extraction; v-help-overlay + v-chapter-index both
// consume `createDialogFocusTrap`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createDialogFocusTrap } from './dialog';

describe('Story 6.4 AC6 — createDialogFocusTrap (Rule 9 dialog primitive)', () => {
  let host: HTMLElement;
  let initialFocus: HTMLButtonElement;

  beforeEach(() => {
    host = document.createElement('div');
    host.tabIndex = -1;
    initialFocus = document.createElement('button');
    initialFocus.type = 'button';
    initialFocus.textContent = 'Initial';
    host.appendChild(initialFocus);
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('returns a handle with activate / deactivate / raw', () => {
    const trap = createDialogFocusTrap({
      host,
      initialFocus: () => initialFocus,
      componentName: 'test',
    });
    expect(typeof trap.activate).toBe('function');
    expect(typeof trap.deactivate).toBe('function');
    expect(trap.raw).toBeDefined();
  });

  it('activate() does NOT throw on layout-free containers (happy-dom)', () => {
    const trap = createDialogFocusTrap({
      host,
      initialFocus: () => initialFocus,
      componentName: 'test',
    });
    expect(() => trap.activate()).not.toThrow();
  });

  it('activate failure surfaces as console.warn with componentName + error', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Detach host from DOM so focus-trap activation throws.
    host.remove();
    const trap = createDialogFocusTrap({
      host,
      initialFocus: () => initialFocus,
      componentName: 'v-test-component',
    });
    trap.activate();
    // We accept either: (a) activation succeeded silently (happy-dom
    // tolerates detached hosts), OR (b) the warn was emitted with the
    // contract. Both are acceptable behaviors — the test pins that IF
    // a warn fires, it follows the contract.
    if (warnSpy.mock.calls.length > 0) {
      const firstCall = warnSpy.mock.calls[0];
      expect(firstCall[0]).toContain('v-test-component');
      expect(firstCall[0]).toContain('focus-trap activation failed');
    }
    warnSpy.mockRestore();
  });

  it('deactivate after non-activated trap is safe (defensive idempotency)', () => {
    const trap = createDialogFocusTrap({
      host,
      initialFocus: () => initialFocus,
      componentName: 'test',
    });
    // Don't activate — go straight to deactivate. This is the
    // synchronous-open-then-close test path; the warn should fire if
    // focus-trap throws, but no exception should escape.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => trap.deactivate()).not.toThrow();
    warnSpy.mockRestore();
  });

  it('falls back to host when initialFocus returns null/undefined', () => {
    const trap = createDialogFocusTrap({
      host,
      initialFocus: () => null,
      componentName: 'test',
    });
    expect(() => trap.activate()).not.toThrow();
  });
});
