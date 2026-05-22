// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';

import { createListboxKeyboardHandler } from './listbox-keyboard';

/**
 * APG Listbox keyboard contract tests — independent of any consumer.
 *
 * Verifies Home / End / ArrowUp / ArrowDown / Enter / Space / Escape
 * against the W3C WAI-ARIA APG Listbox pattern
 * (https://www.w3.org/WAI/ARIA/apg/patterns/listbox/).
 */
describe('createListboxKeyboardHandler — APG Listbox contract', () => {
  const setup = (
    overrides: Partial<Parameters<typeof createListboxKeyboardHandler>[0]> = {},
  ) => {
    const onMoveFocus = vi.fn<(index: number) => void>();
    const onActivate = vi.fn<() => void>();
    const onClose = vi.fn<() => void>();
    let count = 11;
    let focused = 5;
    const handler = createListboxKeyboardHandler({
      getOptionCount: () => count,
      getFocusedIndex: () => focused,
      onMoveFocus,
      onActivate,
      onClose,
      ...overrides,
    });
    const fire = (key: string): KeyboardEvent => {
      const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
      // KeyboardEvent stopPropagation isn't actually observable on a synthetic
      // event without a listener chain. Spy on the prototype.
      const stopSpy = vi.spyOn(e, 'stopPropagation');
      handler(e);
      // Attach the spy reference for assertions
      (e as KeyboardEvent & { stopPropagationSpy?: ReturnType<typeof vi.spyOn> }).stopPropagationSpy = stopSpy;
      return e;
    };
    return {
      handler,
      onMoveFocus,
      onActivate,
      onClose,
      fire,
      setCount: (v: number) => {
        count = v;
      },
      setFocused: (i: number) => {
        focused = i;
      },
    };
  };

  it('ArrowDown moves focus forward by 1', () => {
    const { fire, onMoveFocus } = setup();
    fire('ArrowDown');
    expect(onMoveFocus).toHaveBeenCalledWith(6);
  });

  it('ArrowUp moves focus backward by 1', () => {
    const { fire, onMoveFocus } = setup();
    fire('ArrowUp');
    expect(onMoveFocus).toHaveBeenCalledWith(4);
  });

  it('Home jumps to first option (index 0)', () => {
    const { fire, onMoveFocus } = setup();
    fire('Home');
    expect(onMoveFocus).toHaveBeenCalledWith(0);
  });

  it('End jumps to last option (index count - 1)', () => {
    const { fire, onMoveFocus } = setup();
    fire('End');
    expect(onMoveFocus).toHaveBeenCalledWith(10);
  });

  it('Enter activates the focused option', () => {
    const { fire, onActivate } = setup();
    fire('Enter');
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('Space activates the focused option (APG-equivalent of Enter)', () => {
    const { fire, onActivate } = setup();
    fire(' ');
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('Escape calls onClose when provided', () => {
    const { fire, onClose } = setup();
    fire('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape is a no-op when onClose is undefined (does not throw)', () => {
    const onMoveFocus = vi.fn<(index: number) => void>();
    const onActivate = vi.fn<() => void>();
    const handler = createListboxKeyboardHandler({
      getOptionCount: () => 5,
      getFocusedIndex: () => 0,
      onMoveFocus,
      onActivate,
    });
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    expect(() => handler(e)).not.toThrow();
    // Even without onClose, Escape MUST preventDefault + stopPropagation so
    // it doesn't accidentally trigger a parent modal's Escape handler.
    expect(e.defaultPrevented).toBe(true);
  });

  it('ArrowDown clamps at last index (does not overrun)', () => {
    const { fire, onMoveFocus, setFocused } = setup();
    setFocused(10);
    fire('ArrowDown');
    expect(onMoveFocus).toHaveBeenCalledWith(10);
  });

  it('ArrowUp clamps at first index (does not underflow)', () => {
    const { fire, onMoveFocus, setFocused } = setup();
    setFocused(0);
    fire('ArrowUp');
    expect(onMoveFocus).toHaveBeenCalledWith(0);
  });

  it('every handled key calls preventDefault AND stopPropagation', () => {
    const { fire } = setup();
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape']) {
      const e = fire(key);
      expect(e.defaultPrevented, `${key} should preventDefault`).toBe(true);
      const stopSpy = (e as KeyboardEvent & {
        stopPropagationSpy?: ReturnType<typeof vi.spyOn>;
      }).stopPropagationSpy;
      expect(stopSpy, `${key} stopPropagation spy must exist`).toBeDefined();
      expect(stopSpy!.mock.calls.length, `${key} should stopPropagation`).toBeGreaterThan(0);
    }
  });

  it('un-handled keys (Tab, ArrowLeft, ArrowRight, letters) are ignored', () => {
    const { fire, onMoveFocus, onActivate, onClose } = setup();
    for (const key of ['Tab', 'ArrowLeft', 'ArrowRight', 'a', 'PageUp']) {
      const e = fire(key);
      expect(e.defaultPrevented, `${key} must not preventDefault`).toBe(false);
    }
    expect(onMoveFocus).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('zero-option listbox does not move focus or activate', () => {
    const { fire, onMoveFocus, onActivate, setCount } = setup();
    setCount(0);
    fire('ArrowDown');
    fire('Enter');
    expect(onMoveFocus).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('zero-option listbox still honours Escape', () => {
    const { fire, onClose, setCount } = setup();
    setCount(0);
    fire('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reads focusedIndex lazily — sequential presses pick up latest', () => {
    const { fire, onMoveFocus, setFocused } = setup();
    fire('ArrowDown');
    expect(onMoveFocus).toHaveBeenLastCalledWith(6);
    setFocused(8);
    fire('ArrowDown');
    expect(onMoveFocus).toHaveBeenLastCalledWith(9);
  });
});
