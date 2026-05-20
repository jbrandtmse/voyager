// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';

import { createSliderKeyboardHandler } from './slider-keyboard';

/**
 * APG Slider keyboard contract tests — independent of any consumer.
 *
 * Verifies Home / End / Arrows / Shift+Arrows against the W3C WAI-ARIA
 * APG Slider pattern (https://www.w3.org/WAI/ARIA/apg/patterns/slider/).
 */
describe('createSliderKeyboardHandler — APG Slider contract', () => {
  const setup = (
    overrides: Partial<Parameters<typeof createSliderKeyboardHandler>[0]> = {},
  ) => {
    const onChange = vi.fn<(next: number) => void>();
    const onStart = vi.fn<() => void>();
    const onEnd = vi.fn<() => void>();
    let value = 50;
    const handler = createSliderKeyboardHandler({
      getValue: () => value,
      valueMin: 0,
      valueMax: 100,
      stepSmall: 1,
      stepLarge: 10,
      onChange,
      onStart,
      onEnd,
      ...overrides,
    });
    const fire = (key: string, opts: { shiftKey?: boolean } = {}): KeyboardEvent => {
      const e = new KeyboardEvent('keydown', { key, ...opts, cancelable: true });
      handler(e);
      return e;
    };
    return {
      handler,
      onChange,
      onStart,
      onEnd,
      fire,
      setValue: (v: number) => {
        value = v;
      },
    };
  };

  it('ArrowRight advances by stepSmall', () => {
    const { fire, onChange } = setup();
    fire('ArrowRight');
    expect(onChange).toHaveBeenCalledWith(51);
  });

  it('ArrowLeft retreats by stepSmall', () => {
    const { fire, onChange } = setup();
    fire('ArrowLeft');
    expect(onChange).toHaveBeenCalledWith(49);
  });

  it('Shift+ArrowRight advances by stepLarge', () => {
    const { fire, onChange } = setup();
    fire('ArrowRight', { shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it('Shift+ArrowLeft retreats by stepLarge', () => {
    const { fire, onChange } = setup();
    fire('ArrowLeft', { shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(40);
  });

  it('Home jumps to valueMin', () => {
    const { fire, onChange } = setup();
    fire('Home');
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('End jumps to valueMax', () => {
    const { fire, onChange } = setup();
    fire('End');
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('clamps below valueMin (Shift+ArrowLeft near min)', () => {
    const { fire, onChange, setValue } = setup();
    setValue(2);
    fire('ArrowLeft', { shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('clamps above valueMax (Shift+ArrowRight near max)', () => {
    const { fire, onChange, setValue } = setup();
    setValue(98);
    fire('ArrowRight', { shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('preventDefault is called on every handled key', () => {
    const { fire } = setup();
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      const e = fire(key);
      expect(e.defaultPrevented, `${key} should preventDefault`).toBe(true);
    }
  });

  it('un-handled keys (e.g. PageUp / Tab / ArrowUp) are ignored and do not preventDefault', () => {
    const { fire, onChange, onStart, onEnd } = setup();
    for (const key of ['PageUp', 'PageDown', 'Tab', 'ArrowUp', 'ArrowDown', 'Enter', ' ']) {
      const e = fire(key);
      expect(e.defaultPrevented, `${key} must not preventDefault`).toBe(false);
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('onStart fires before onChange; onEnd after', () => {
    const order: string[] = [];
    const { fire } = setup({
      onStart: () => order.push('start'),
      onChange: () => order.push('change'),
      onEnd: () => order.push('end'),
    });
    fire('ArrowRight');
    expect(order).toEqual(['start', 'change', 'end']);
  });

  it('onStart / onEnd are optional (no throw when undefined)', () => {
    const onChange = vi.fn<(next: number) => void>();
    const handler = createSliderKeyboardHandler({
      getValue: () => 50,
      valueMin: 0,
      valueMax: 100,
      stepSmall: 1,
      stepLarge: 10,
      onChange,
    });
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    expect(() => handler(e)).not.toThrow();
    expect(onChange).toHaveBeenCalledWith(51);
  });

  it('reads value lazily — multiple presses pick up latest value', () => {
    const { fire, onChange, setValue } = setup();
    fire('ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith(51);
    setValue(75);
    fire('ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith(76);
  });
});
