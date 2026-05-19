// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { attachPointerHandlers } from './pointer-events';

// happy-dom does not synthesize PointerEvent classes consistently across
// versions, so we construct minimal stand-ins. The primitive only reads
// `clientX`, `clientY`, `pointerType`, and `pointerId` off the event, and
// listeners are dispatched via `dispatchEvent(new Event(...))` with extra
// properties set on the event instance.
const makePointerEvent = (
  type: string,
  init: { clientX: number; clientY: number; pointerType?: string; pointerId?: number },
): Event => {
  const evt = new Event(type, { bubbles: true });
  Object.defineProperty(evt, 'clientX', { value: init.clientX, configurable: true });
  Object.defineProperty(evt, 'clientY', { value: init.clientY, configurable: true });
  Object.defineProperty(evt, 'pointerType', {
    value: init.pointerType ?? 'mouse',
    configurable: true,
  });
  Object.defineProperty(evt, 'pointerId', {
    value: init.pointerId ?? 1,
    configurable: true,
  });
  return evt;
};

describe('Story 1.9 Task 3 — pointer-events primitive', () => {
  let host: HTMLDivElement;
  let captureCalls: number[];
  let releaseCalls: number[];

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    captureCalls = [];
    releaseCalls = [];
    // Stub setPointerCapture / releasePointerCapture which happy-dom may
    // not implement; we want to assert they're called.
    (host as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = (
      id: number,
    ) => {
      captureCalls.push(id);
    };
    (host as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = (
      id: number,
    ) => {
      releaseCalls.push(id);
    };
  });

  afterEach(() => {
    host.remove();
  });

  it('invokes onDown / onMove / onUp in the natural order', () => {
    const order: string[] = [];
    attachPointerHandlers(host, {
      onDown: () => order.push('down'),
      onMove: () => order.push('move'),
      onUp: () => order.push('up'),
    });
    host.dispatchEvent(makePointerEvent('pointerdown', { clientX: 10, clientY: 20 }));
    host.dispatchEvent(makePointerEvent('pointermove', { clientX: 30, clientY: 40 }));
    host.dispatchEvent(makePointerEvent('pointerup', { clientX: 30, clientY: 40 }));
    expect(order).toEqual(['down', 'move', 'up']);
  });

  it('normalizes the payload as { x, y, pointerType, pointerId, raw }', () => {
    const seen: { x: number; y: number; pointerType: string; pointerId: number }[] = [];
    attachPointerHandlers(host, {
      onDown: ({ x, y, pointerType, pointerId }) => {
        seen.push({ x, y, pointerType, pointerId });
      },
    });
    host.dispatchEvent(
      makePointerEvent('pointerdown', {
        clientX: 123,
        clientY: 456,
        pointerType: 'touch',
        pointerId: 7,
      }),
    );
    expect(seen).toEqual([{ x: 123, y: 456, pointerType: 'touch', pointerId: 7 }]);
  });

  it('exposes the raw PointerEvent on payload.raw', () => {
    const raws: Event[] = [];
    attachPointerHandlers(host, { onDown: ({ raw }) => raws.push(raw) });
    const ev = makePointerEvent('pointerdown', { clientX: 0, clientY: 0 });
    host.dispatchEvent(ev);
    expect(raws[0]).toBe(ev);
  });

  it('calls setPointerCapture on pointerdown with the pointer id', () => {
    attachPointerHandlers(host, {});
    host.dispatchEvent(makePointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 42 }));
    expect(captureCalls).toEqual([42]);
  });

  it('calls releasePointerCapture on pointerup with the pointer id', () => {
    attachPointerHandlers(host, {});
    host.dispatchEvent(makePointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 42 }));
    host.dispatchEvent(makePointerEvent('pointerup', { clientX: 0, clientY: 0, pointerId: 42 }));
    expect(releaseCalls).toEqual([42]);
  });

  it('invokes onCancel and releases capture on pointercancel', () => {
    const cancelled: number[] = [];
    attachPointerHandlers(host, { onCancel: ({ pointerId }) => cancelled.push(pointerId) });
    host.dispatchEvent(makePointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 9 }));
    host.dispatchEvent(makePointerEvent('pointercancel', { clientX: 0, clientY: 0, pointerId: 9 }));
    expect(cancelled).toEqual([9]);
    expect(releaseCalls).toEqual([9]);
  });

  it('returns an unsubscribe function that detaches every listener', () => {
    const seen: string[] = [];
    const off = attachPointerHandlers(host, {
      onDown: () => seen.push('d'),
      onMove: () => seen.push('m'),
      onUp: () => seen.push('u'),
    });
    off();
    host.dispatchEvent(makePointerEvent('pointerdown', { clientX: 0, clientY: 0 }));
    host.dispatchEvent(makePointerEvent('pointermove', { clientX: 0, clientY: 0 }));
    host.dispatchEvent(makePointerEvent('pointerup', { clientX: 0, clientY: 0 }));
    expect(seen).toEqual([]);
  });

  it('unsubscribe is idempotent', () => {
    const off = attachPointerHandlers(host, {});
    off();
    expect(() => off()).not.toThrow();
  });

  it('survives a setPointerCapture exception (InvalidPointerId etc.)', () => {
    (host as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = () => {
      throw new Error('InvalidPointerId');
    };
    const onDown = vi.fn();
    attachPointerHandlers(host, { onDown });
    expect(() =>
      host.dispatchEvent(makePointerEvent('pointerdown', { clientX: 0, clientY: 0 })),
    ).not.toThrow();
    expect(onDown).toHaveBeenCalledTimes(1);
  });

  it('handlers are optional (no listener wired when omitted)', () => {
    attachPointerHandlers(host, {});
    // Just verify dispatch doesn't crash.
    expect(() => {
      host.dispatchEvent(makePointerEvent('pointermove', { clientX: 0, clientY: 0 }));
    }).not.toThrow();
  });
});
