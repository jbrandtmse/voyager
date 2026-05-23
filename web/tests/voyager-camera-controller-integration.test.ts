// @vitest-environment happy-dom
/**
 * Story 4.2 AC6 — Integration AC: real RenderEngine + real
 * VoyagerCameraController + restore affordance + synthesized PointerEvent
 * and KeyboardEvent.
 *
 * The pattern mirrors `view-frame-render-engine-integration.test.ts`
 * (Story 4.1 AC7): real engine with a stub renderer factory + real
 * controller + stub closures for ViewFrame origin + active target.
 *
 * Assertions:
 *   - Synthesized `pointerdown` + `pointermove` on the canvas → asserts
 *     `renderEngine.manualCameraActive === true` + cursor === 'grabbing'.
 *   - The engine's per-frame ViewFrame transform call is STILL exercised
 *     after the gesture (camera ownership flipped; ViewFrame origin
 *     math unaffected per ADR-0023).
 *   - Synthesized `R` keydown with focus on document.body → asserts the
 *     restore animation starts (controller.isRestoring === true).
 *   - On `restoreComplete` resolution → asserts
 *     `renderEngine.manualCameraActive === false`.
 */

import { describe, it, expect, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';

import { RenderEngine, type WebGLRendererLike } from '../src/render/render-engine';
import {
  VoyagerCameraController,
  type ManualCameraHost,
} from '../src/render/voyager-camera-controller';
import { mountCameraRestoreAffordance } from '../src/boot/camera-restore-affordance';
import { ViewFrameService } from '../src/services/view-frame';
import type { EphemerisService } from '../src/services/ephemeris-service';
import { worldVec3, type WorldVec3 } from '../src/types/branded';
import type { GPUCapabilities } from '../src/boot/gpu-capability-probe';

const CAPS: GPUCapabilities = {
  supportsReverseZ: true,
  supportsFloatDepth: true,
  recommendedTextureTier: '8k',
};

const makeStubRenderer = (): WebGLRendererLike => ({
  setSize() {},
  setPixelRatio() {},
  setAnimationLoop() {},
  render(_scene: Scene, _camera: PerspectiveCamera) {},
  dispose() {},
});

const makeCanvas = (): HTMLCanvasElement =>
  ({
    clientWidth: 800,
    clientHeight: 600,
    width: 800,
    height: 600,
    style: {},
    dispatchEvent(_e: Event): boolean {
      return true;
    },
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as HTMLCanvasElement;

/**
 * Build the full integration stack: real RenderEngine, real
 * VoyagerCameraController, real restore affordance, stub ephemeris that
 * returns a fixed Jupiter-like position, real ViewFrameService.
 */
const buildIntegrationStack = (): {
  engine: RenderEngine;
  controller: VoyagerCameraController;
  canvas: HTMLElement;
  attributeHost: HTMLElement;
  button: HTMLButtonElement;
  cleanup: () => void;
} => {
  // The pointer + keyboard tests need DOM-attached elements so events
  // bubble correctly. We use real div elements as the canvas-equivalent
  // (the controller only needs setPointerCapture/style.cursor surface,
  // not real WebGL).
  const attributeHost = document.createElement('div');
  attributeHost.id = 'int-attribute-host';
  document.body.appendChild(attributeHost);
  const canvasLike = document.createElement('div');
  canvasLike.id = 'int-canvas';
  attributeHost.appendChild(canvasLike);

  const engine = new RenderEngine(CAPS, {}, () => makeStubRenderer());
  engine.init(makeCanvas());

  // Stub EphemerisService returning a fixed Jupiter heliocentric position
  // (~5.2 AU; the exact value doesn't matter for the integration assertions).
  const JUP_POS: WorldVec3 = worldVec3(7.78e8, 0, 0); // ~5.2 AU in km
  const ephemerisStub: Pick<EphemerisService, 'getPosition'> = {
    getPosition(_et: number, _naifId: number): WorldVec3 | null {
      return JUP_POS;
    },
  };

  const viewFrame = new ViewFrameService(
    ephemerisStub as EphemerisService,
    () => false,
  );

  const controller = new VoyagerCameraController({
    camera: engine.camera,
    domElement: canvasLike,
    renderEngine: engine as unknown as ManualCameraHost,
    getActiveTarget: () => JUP_POS, // pivot around Jupiter
    getViewFrameOrigin: () => viewFrame.getTransform(0, null).originOffsetWorld,
    reducedMotion: () => true, // collapse animation to instant for deterministic await
  });
  controller.attach();

  const affordance = mountCameraRestoreAffordance({
    host: canvasLike,
    attributeHost,
    controller,
    renderEngine: engine,
  });

  return {
    engine,
    controller,
    canvas: canvasLike,
    attributeHost,
    button: affordance.button,
    cleanup: () => {
      affordance.dispose();
      controller.detach();
      engine.dispose();
      attributeHost.remove();
    },
  };
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
  });
  el.dispatchEvent(ev);
};

describe('AC6 — RenderEngine + VoyagerCameraController integration', () => {
  it('synthesized pointerdown on the canvas flips manualCameraActive', () => {
    const stack = buildIntegrationStack();
    expect(stack.engine.manualCameraActive).toBe(false);
    dispatchPointer(stack.canvas, 'pointerdown', { x: 100, y: 100 });
    expect(stack.engine.manualCameraActive).toBe(true);
    stack.cleanup();
  });

  it('cursor === "grabbing" during the drag; restored on pointerup', () => {
    const stack = buildIntegrationStack();
    dispatchPointer(stack.canvas, 'pointerdown', { x: 100, y: 100 });
    expect(stack.canvas.style.cursor).toBe('grabbing');
    dispatchPointer(stack.canvas, 'pointerup', { x: 100, y: 100 });
    expect(stack.canvas.style.cursor).not.toBe('grabbing');
    stack.cleanup();
  });

  it('manual gesture does NOT prevent the engine tick path from advancing the ViewFrame origin', () => {
    // ViewFrame's per-frame transform call is unaffected — the controller
    // owns only the camera's LOCAL transform per ADR-0023. We verify by
    // ticking the engine once before and once after the gesture and
    // confirming the engine's worldGroup.position math still runs (the
    // engine doesn't throw + position is finite).
    const stack = buildIntegrationStack();
    expect(() => stack.engine.tick()).not.toThrow();
    dispatchPointer(stack.canvas, 'pointerdown', { x: 0, y: 0 });
    dispatchPointer(stack.canvas, 'pointermove', { x: 10, y: 10 });
    expect(() => stack.engine.tick()).not.toThrow();
    expect(Number.isFinite(stack.engine.worldGroup.position.x)).toBe(true);
    expect(Number.isFinite(stack.engine.worldGroup.position.y)).toBe(true);
    expect(Number.isFinite(stack.engine.worldGroup.position.z)).toBe(true);
    stack.cleanup();
  });

  it('R key with focus on document.body triggers restore; on completion manualCameraActive=false', async () => {
    const stack = buildIntegrationStack();
    // Manually flip the state (simulate prior gesture) so restore has
    // something to undo. reducedMotion()=true means restore is instant.
    stack.engine.setManualCameraActive(true);
    expect(stack.engine.manualCameraActive).toBe(true);
    // Ensure no text input is focused.
    (document.activeElement as HTMLElement | null)?.blur?.();
    // Dispatch R; the affordance listener calls controller.restore().
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }),
    );
    // Under reduced motion (set in buildIntegrationStack) the animation
    // collapses to instant; the flag is already false on the same tick.
    await stack.controller.restoreComplete;
    expect(stack.engine.manualCameraActive).toBe(false);
    stack.cleanup();
  });

  it('restore via R + animated path: isRestoring true mid-tween, false after completion', async () => {
    // Re-construct the stack with reducedMotion=false + driven nowMs so
    // the animation runs but we can step it deterministically. We don't
    // use buildIntegrationStack's reducedMotion=true here — re-build.
    let now = 0;
    const attributeHost = document.createElement('div');
    document.body.appendChild(attributeHost);
    const canvasLike = document.createElement('div');
    attributeHost.appendChild(canvasLike);
    const engine = new RenderEngine(CAPS, {}, () => makeStubRenderer());
    engine.init(makeCanvas());
    const controller = new VoyagerCameraController({
      camera: engine.camera,
      domElement: canvasLike,
      renderEngine: engine as unknown as ManualCameraHost,
      getActiveTarget: () => null,
      getViewFrameOrigin: () => worldVec3(0, 0, 0),
      reducedMotion: () => false,
      restoreDurationMs: 400,
      nowMs: () => now,
    });
    controller.attach();
    const affordance = mountCameraRestoreAffordance({
      host: canvasLike,
      attributeHost,
      controller,
      renderEngine: engine,
    });

    engine.setManualCameraActive(true);
    expect(engine.manualCameraActive).toBe(true);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'r', bubbles: true }),
    );

    // Animation in flight; flag is still active.
    expect(controller.isRestoring).toBe(true);
    expect(engine.manualCameraActive).toBe(true);

    now = 200;
    controller.tickAnimation();
    expect(controller.isRestoring).toBe(true);

    now = 400;
    controller.tickAnimation();
    expect(controller.isRestoring).toBe(false);
    expect(engine.manualCameraActive).toBe(false);

    affordance.dispose();
    controller.detach();
    engine.dispose();
    attributeHost.remove();
  });

  it('data-manual-camera attribute promotion tracks the engine flag end-to-end', () => {
    const stack = buildIntegrationStack();
    expect(stack.attributeHost.hasAttribute('data-manual-camera')).toBe(false);
    dispatchPointer(stack.canvas, 'pointerdown');
    expect(stack.attributeHost.getAttribute('data-manual-camera')).toBe('true');
    // R key → restore (instant under reduced motion).
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'r', bubbles: true }),
    );
    expect(stack.attributeHost.hasAttribute('data-manual-camera')).toBe(false);
    stack.cleanup();
  });

  it('restore button click flips manualCameraActive false (same path as R)', () => {
    const stack = buildIntegrationStack();
    stack.engine.setManualCameraActive(true);
    expect(stack.engine.manualCameraActive).toBe(true);
    stack.button.click();
    expect(stack.engine.manualCameraActive).toBe(false);
    stack.cleanup();
  });

  it('integration also exercises a frame-callback fan-out without crashing', () => {
    // Mirrors the Story 4.1 integration test's pin: the engine's tick()
    // path runs through frame callbacks even with the controller active.
    const stack = buildIntegrationStack();
    const cb = vi.fn();
    stack.engine.onFrame(cb);
    stack.engine.tick();
    dispatchPointer(stack.canvas, 'pointerdown');
    stack.engine.tick();
    expect(cb).toHaveBeenCalledTimes(2);
    stack.cleanup();
  });
});
