// @vitest-environment happy-dom
/**
 * Unit tests for `VoyagerCameraController` (Story 4.2 T1.6).
 *
 * Covers:
 *   - AC1: hand-rolled (no `THREE.OrbitControls`); zoom clamps; pointer wiring
 *   - AC2: manual gesture flips renderEngine.manualCameraActive + cursor
 *   - AC5: zoom clamps at both bounds
 *   - AC7: reduced-motion path (animation collapses to instant)
 *   - PBD carve-out: manualCameraSuspended gates gestures + restore
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';

import {
  VoyagerCameraController,
  MIN_ZOOM_DISTANCE_KM,
  MAX_ZOOM_DISTANCE_KM,
  CRUISE_DEFAULT_DISTANCE_KM,
  clampZoomDistance,
  defaultFramingFallback,
  type ManualCameraHost,
} from './voyager-camera-controller';
import type { WorldVec3 } from '../types/branded';
import { worldVec3 } from '../types/branded';

const makeStubEngine = (): ManualCameraHost & {
  setManualCameraActive: ReturnType<typeof vi.fn>;
} => {
  let active = false;
  const setManualCameraActive = vi.fn((value: boolean) => {
    active = value;
  });
  return {
    setManualCameraActive,
    get manualCameraActive(): boolean {
      return active;
    },
  };
};

const makeController = (overrides: Partial<{
  activeTarget: WorldVec3 | null;
  viewFrameOrigin: WorldVec3;
  reducedMotion: boolean;
  restoreDurationMs: number;
  nowMs: () => number;
}> = {}): {
  controller: VoyagerCameraController;
  engine: ReturnType<typeof makeStubEngine>;
  domElement: HTMLElement;
  camera: PerspectiveCamera;
} => {
  const engine = makeStubEngine();
  const camera = new PerspectiveCamera(50, 1, 1e-6, 1e15);
  const domElement = document.createElement('div');
  document.body.appendChild(domElement);
  const controller = new VoyagerCameraController({
    camera,
    domElement,
    renderEngine: engine,
    getActiveTarget: () => overrides.activeTarget ?? null,
    getViewFrameOrigin: () => overrides.viewFrameOrigin ?? worldVec3(0, 0, 0),
    reducedMotion: () => overrides.reducedMotion ?? false,
    restoreDurationMs: overrides.restoreDurationMs ?? 400,
    nowMs: overrides.nowMs,
  });
  controller.attach();
  return { controller, engine, domElement, camera };
};

const dispatchPointer = (
  el: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: PointerEventInit & { x?: number; y?: number } = {},
): void => {
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? 'mouse',
    button: init.button ?? 0,
    clientX: init.x ?? init.clientX ?? 0,
    clientY: init.y ?? init.clientY ?? 0,
    shiftKey: init.shiftKey ?? false,
  });
  el.dispatchEvent(ev);
};

const dispatchWheel = (el: HTMLElement, deltaY: number): void => {
  const ev = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY,
  });
  el.dispatchEvent(ev);
};

describe('VoyagerCameraController — AC1 hand-rolled (source-grep)', () => {
  it('does NOT import THREE.OrbitControls', () => {
    const src = readFileSync(
      resolve(__dirname, 'voyager-camera-controller.ts'),
      'utf-8',
    );
    // Strip JSDoc / block / line comments so the documentation header is
    // free to discuss OrbitControls in prose without tripping the grep.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/OrbitControls/);
    expect(code).not.toMatch(/from\s+['"]three\/examples\//);
  });

  it('attaches pointer handlers via attachPointerHandlers primitive (no raw addEventListener for mouse/touch)', () => {
    const src = readFileSync(
      resolve(__dirname, 'voyager-camera-controller.ts'),
      'utf-8',
    );
    // The only addEventListener call should be for 'wheel' (the primitive
    // doesn't cover wheel). No mousedown/mouseup/touchstart/touchend.
    expect(src).toMatch(/attachPointerHandlers\(/);
    expect(src).not.toMatch(/addEventListener\(\s*['"]mouse(?:down|up|move)/);
    expect(src).not.toMatch(/addEventListener\(\s*['"]touch/);
  });
});

describe('VoyagerCameraController — AC1+AC5 zoom clamps', () => {
  it('clampZoomDistance enforces lower bound', () => {
    expect(clampZoomDistance(0)).toBe(MIN_ZOOM_DISTANCE_KM);
    expect(clampZoomDistance(0.0001)).toBe(MIN_ZOOM_DISTANCE_KM);
    expect(clampZoomDistance(-100)).toBe(MIN_ZOOM_DISTANCE_KM);
  });

  it('clampZoomDistance enforces upper bound', () => {
    expect(clampZoomDistance(1e30)).toBe(MAX_ZOOM_DISTANCE_KM);
    expect(clampZoomDistance(MAX_ZOOM_DISTANCE_KM + 1)).toBe(
      MAX_ZOOM_DISTANCE_KM,
    );
  });

  it('clampZoomDistance passes through valid values', () => {
    expect(clampZoomDistance(1)).toBe(1);
    expect(clampZoomDistance(1000)).toBe(1000);
  });

  it('clampZoomDistance handles NaN/Infinity defensively', () => {
    expect(clampZoomDistance(Number.NaN)).toBe(MIN_ZOOM_DISTANCE_KM);
    expect(clampZoomDistance(Number.POSITIVE_INFINITY)).toBe(
      MAX_ZOOM_DISTANCE_KM,
    );
  });

  it('upper bound is 200 AU — fully covers FR13 165 AU range', () => {
    // 1 AU = 149_597_870.7 km
    expect(MAX_ZOOM_DISTANCE_KM).toBeGreaterThan(165 * 149_597_870.7);
    expect(MAX_ZOOM_DISTANCE_KM).toBeCloseTo(200 * 149_597_870.7, 3);
  });

  it('lower bound is 1 m = 0.001 km — sub-meter inspection target', () => {
    expect(MIN_ZOOM_DISTANCE_KM).toBe(0.001);
  });

  it('wheel zoom-in cannot push camera distance below MIN', () => {
    const { controller, camera, domElement } = makeController({
      activeTarget: worldVec3(0, 0, 0),
    });
    camera.position.set(0, 0, 0.005); // 5 m above origin
    // Many notches of zoom-in (deltaY < 0) — each step multiplies by 0.9
    for (let i = 0; i < 200; i++) dispatchWheel(domElement, -100);
    const distance = camera.position.length();
    expect(distance).toBeGreaterThanOrEqual(MIN_ZOOM_DISTANCE_KM - 1e-12);
    controller.detach();
  });

  it('wheel zoom-out cannot push camera distance above MAX', () => {
    const { controller, camera, domElement } = makeController({
      activeTarget: worldVec3(0, 0, 0),
    });
    camera.position.set(0, 0, 1e10);
    for (let i = 0; i < 1000; i++) dispatchWheel(domElement, 100);
    const distance = camera.position.length();
    expect(distance).toBeLessThanOrEqual(MAX_ZOOM_DISTANCE_KM + 1e-3);
    controller.detach();
  });
});

describe('VoyagerCameraController — AC2 manual gesture flips state', () => {
  it('pointerdown flips renderEngine.manualCameraActive to true', () => {
    const { controller, engine, domElement } = makeController();
    expect(engine.manualCameraActive).toBe(false);
    dispatchPointer(domElement, 'pointerdown');
    expect(engine.manualCameraActive).toBe(true);
    expect(engine.setManualCameraActive).toHaveBeenCalledWith(true);
    controller.detach();
  });

  it('pointerdown sets cursor to grabbing; pointerup restores', () => {
    const { controller, domElement } = makeController();
    domElement.style.cursor = 'default';
    dispatchPointer(domElement, 'pointerdown');
    expect(domElement.style.cursor).toBe('grabbing');
    dispatchPointer(domElement, 'pointerup');
    expect(domElement.style.cursor).toBe('default');
    controller.detach();
  });

  it('pointercancel restores cursor + clears gesture state', () => {
    const { controller, domElement } = makeController();
    domElement.style.cursor = 'crosshair';
    dispatchPointer(domElement, 'pointerdown');
    const cancel = new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 1,
    });
    domElement.dispatchEvent(cancel);
    expect(domElement.style.cursor).toBe('crosshair');
    controller.detach();
  });

  it('wheel-only gesture (no pointerdown) still flips manualCameraActive', () => {
    // A user with a mouse wheel may zoom without ever dragging.
    const { controller, engine, domElement } = makeController({
      activeTarget: worldVec3(0, 0, 0),
    });
    const { camera } = makeController({ activeTarget: worldVec3(0, 0, 0) });
    camera.position.set(0, 0, 100);
    dispatchWheel(domElement, 50);
    expect(engine.manualCameraActive).toBe(true);
    controller.detach();
  });
});

describe('VoyagerCameraController — AC3 restore animation', () => {
  it('restore() under reduced motion is instant (no animation in flight)', () => {
    const { controller, engine, camera } = makeController({
      activeTarget: null,
      reducedMotion: true,
    });
    // Simulate user manual gesture flipping state to true.
    engine.setManualCameraActive(true);
    camera.position.set(1e6, 0, 0); // arbitrary user-positioned camera
    controller.restore();
    expect(controller.isRestoring).toBe(false);
    expect(engine.manualCameraActive).toBe(false);
    // Position snapped to default framing (cruise: ~10 AU along +Z).
    expect(camera.position.length()).toBeCloseTo(
      CRUISE_DEFAULT_DISTANCE_KM,
      -3,
    );
    controller.detach();
  });

  it('restore() with duration > 0 starts an animation; tickAnimation advances it', () => {
    let now = 0;
    const { controller, engine, camera } = makeController({
      activeTarget: null,
      reducedMotion: false,
      restoreDurationMs: 400,
      nowMs: () => now,
    });
    engine.setManualCameraActive(true);
    camera.position.set(5e6, 0, 0);

    controller.restore();
    expect(controller.isRestoring).toBe(true);
    expect(engine.manualCameraActive).toBe(true); // still active mid-tween

    now = 200; // halfway
    controller.tickAnimation();
    expect(controller.isRestoring).toBe(true);

    now = 400; // complete
    controller.tickAnimation();
    expect(controller.isRestoring).toBe(false);
    expect(engine.manualCameraActive).toBe(false); // flipped on completion
    controller.detach();
  });

  it('restoreComplete promise resolves on animation completion', async () => {
    let now = 0;
    const { controller, engine } = makeController({
      activeTarget: null,
      reducedMotion: false,
      restoreDurationMs: 400,
      nowMs: () => now,
    });
    engine.setManualCameraActive(true);
    controller.restore();
    const completion = controller.restoreComplete;
    now = 400;
    controller.tickAnimation();
    await expect(completion).resolves.toBeUndefined();
    expect(engine.manualCameraActive).toBe(false);
    controller.detach();
  });

  it('restoreComplete resolves immediately when no animation is in flight', async () => {
    const { controller } = makeController();
    await expect(controller.restoreComplete).resolves.toBeUndefined();
    controller.detach();
  });

  it('new gesture during restore cancels the in-flight animation', () => {
    let now = 0;
    const { controller, domElement, camera } = makeController({
      activeTarget: null,
      restoreDurationMs: 400,
      nowMs: () => now,
    });
    camera.position.set(5e6, 0, 0);
    controller.restore();
    expect(controller.isRestoring).toBe(true);
    dispatchPointer(domElement, 'pointerdown');
    expect(controller.isRestoring).toBe(false);
    controller.detach();
  });
});

describe('VoyagerCameraController — PBD module-owned carve-out (T5)', () => {
  it('manualCameraSuspended === true: pointerdown does NOT flip manualCameraActive', () => {
    const { controller, engine, domElement } = makeController();
    controller.manualCameraSuspended = true;
    dispatchPointer(domElement, 'pointerdown');
    expect(engine.manualCameraActive).toBe(false);
    expect(engine.setManualCameraActive).not.toHaveBeenCalled();
    controller.detach();
  });

  it('manualCameraSuspended === true: wheel does NOT flip manualCameraActive', () => {
    const { controller, engine, domElement } = makeController({
      activeTarget: worldVec3(0, 0, 0),
    });
    controller.manualCameraSuspended = true;
    dispatchWheel(domElement, 100);
    expect(engine.manualCameraActive).toBe(false);
    controller.detach();
  });

  it('manualCameraSuspended === true: restore() is a no-op', () => {
    const { controller, engine } = makeController({
      reducedMotion: true,
    });
    engine.setManualCameraActive(true);
    controller.manualCameraSuspended = true;
    controller.restore();
    expect(engine.manualCameraActive).toBe(true);
    controller.detach();
  });
});

describe('VoyagerCameraController — defaultFramingFallback', () => {
  it('cruise (null target): frames Sun-centered at CRUISE_DEFAULT_DISTANCE_KM', () => {
    const framing = defaultFramingFallback(null);
    expect(framing).not.toBeNull();
    expect(framing!.position.length()).toBeCloseTo(
      CRUISE_DEFAULT_DISTANCE_KM,
      -3,
    );
  });

  it('encounter (non-null target): frames target at DEFAULT_ENCOUNTER_DISTANCE_KM', () => {
    const target = new Vector3(1000, 2000, 3000);
    const framing = defaultFramingFallback(target);
    expect(framing).not.toBeNull();
    const camDistance = framing!.position.distanceTo(target);
    // Default encounter distance = 1_000_000 km (clamped within bounds)
    expect(camDistance).toBeGreaterThan(100_000);
    expect(camDistance).toBeLessThan(10_000_000);
  });

  it('framing quaternion orients toward target', () => {
    const target = new Vector3(0, 0, 0);
    const framing = defaultFramingFallback(target);
    expect(framing).not.toBeNull();
    // Apply the quaternion to the camera-forward axis (0, 0, -1); it
    // should point from the framing position toward target.
    const forward = new Vector3(0, 0, -1).applyQuaternion(framing!.quaternion);
    const toTarget = target.clone().sub(framing!.position).normalize();
    expect(forward.dot(toTarget)).toBeGreaterThan(0.99);
  });
});

describe('VoyagerCameraController — attach / detach idempotency', () => {
  it('detach() called twice is safe', () => {
    const { controller } = makeController();
    expect(() => {
      controller.detach();
      controller.detach();
    }).not.toThrow();
  });

  it('attach() after detach() re-wires handlers', () => {
    const { controller, engine, domElement } = makeController();
    controller.detach();
    controller.attach();
    dispatchPointer(domElement, 'pointerdown');
    expect(engine.manualCameraActive).toBe(true);
    controller.detach();
  });
});

let cleanupTargets: HTMLElement[] = [];
beforeEach(() => {
  cleanupTargets = [];
});
afterEach(() => {
  for (const el of cleanupTargets) el.remove();
});
