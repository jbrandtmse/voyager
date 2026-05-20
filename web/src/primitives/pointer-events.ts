/**
 * Pointer Events API primitive — unified mouse + touch + pen handling.
 *
 * Architecture line 418 mandates the Pointer Events API as the sole input
 * primitive: no separate `mousemove`/`touchmove`/`touchstart` listeners.
 * This module wraps the API in a single attach/unsubscribe pair and adds
 * the two pieces of plumbing every consumer needs:
 *
 *   1. Automatic `setPointerCapture` on `pointerdown` so subsequent
 *      `pointermove` / `pointerup` events keep arriving even when the
 *      pointer leaves the target's bounding box (essential for scrubber
 *      drag — UX-DR32 + Story 1.9 AC5).
 *   2. Normalized event payload `{ x, y, pointerType, pointerId }` so
 *      callers don't have to deal with `clientX`/`clientY` plus
 *      `pointerType` plumbing every time.
 *
 * Pointer Events are universally supported in modern browsers and in
 * happy-dom for unit testing.
 */

/** Normalized pointer payload exposed to handlers. */
export interface PointerPayload {
  /** Client-space X coordinate (PointerEvent.clientX). */
  x: number;
  /** Client-space Y coordinate (PointerEvent.clientY). */
  y: number;
  /** "mouse" | "touch" | "pen". */
  pointerType: string;
  /** Native pointer ID — useful for multi-touch disambiguation. */
  pointerId: number;
  /** Original event for any caller that needs more (preventDefault, etc.). */
  raw: PointerEvent;
}

/** Optional handlers — pass only the lifecycle phases the caller needs. */
export interface PointerHandlers {
  onDown?: (e: PointerPayload) => void;
  onMove?: (e: PointerPayload) => void;
  onUp?: (e: PointerPayload) => void;
  /** Fires on `pointercancel` (interrupted drag, e.g. system gesture). */
  onCancel?: (e: PointerPayload) => void;
}

const toPayload = (e: PointerEvent): PointerPayload => ({
  x: e.clientX,
  y: e.clientY,
  pointerType: e.pointerType,
  pointerId: e.pointerId,
  raw: e,
});

/** Minimal capture-capable target interface — Element satisfies it. */
interface CaptureTarget {
  setPointerCapture?: (id: number) => void;
  releasePointerCapture?: (id: number) => void;
  hasPointerCapture?: (id: number) => boolean;
}

/**
 * Attach pointer lifecycle handlers to an element.
 *
 * Returns an unsubscribe function that removes every listener. Idempotent —
 * calling the unsubscribe function more than once is a no-op.
 *
 * @example
 *   const off = attachPointerHandlers(thumbEl, {
 *     onDown: (e) => { startDragAt(e.x); },
 *     onMove: (e) => { updateDragTo(e.x); },
 *     onUp:   ()  => { endDrag(); },
 *   });
 *   // Later:
 *   off();
 */
export const attachPointerHandlers = (
  target: EventTarget,
  handlers: PointerHandlers,
): (() => void) => {
  const capturable = target as CaptureTarget;

  const onDown = (ev: Event): void => {
    const e = ev as PointerEvent;
    // setPointerCapture lets drag continue beyond the target's bounding box.
    // happy-dom implements it as a no-op; that's fine — captures only matter
    // in real browsers during user drag.
    if (typeof capturable.setPointerCapture === 'function') {
      try {
        capturable.setPointerCapture(e.pointerId);
      } catch {
        // Some browsers throw if the pointer is already captured by another
        // element. Silent: capture is an optimization, not a correctness
        // requirement for the handler chain.
      }
    }
    handlers.onDown?.(toPayload(e));
  };

  const onMove = (ev: Event): void => {
    handlers.onMove?.(toPayload(ev as PointerEvent));
  };

  const releaseCapture = (id: number): void => {
    if (typeof capturable.releasePointerCapture !== 'function') return;
    try {
      capturable.releasePointerCapture(id);
    } catch {
      // Same rationale as setPointerCapture above.
    }
  };

  const onUp = (ev: Event): void => {
    const e = ev as PointerEvent;
    releaseCapture(e.pointerId);
    handlers.onUp?.(toPayload(e));
  };

  const onCancel = (ev: Event): void => {
    const e = ev as PointerEvent;
    releaseCapture(e.pointerId);
    handlers.onCancel?.(toPayload(e));
  };

  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onCancel);

  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
    target.removeEventListener('pointercancel', onCancel);
  };
};
