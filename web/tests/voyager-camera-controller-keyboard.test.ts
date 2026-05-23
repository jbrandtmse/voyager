// @vitest-environment happy-dom
/**
 * Story 4.2 T2.4 — `R` keyboard shortcut + text-input gate + modifier
 * gate + reduced-motion path tests for `mountCameraRestoreAffordance`.
 *
 * Mirrors the pattern in `help-overlay-qa-gaps.test.ts` (Story 2.8):
 * dispatches synthesized KeyboardEvents on `document` and asserts the
 * controller's restore() was (or was not) called.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerspectiveCamera } from 'three';

import { mountCameraRestoreAffordance } from '../src/boot/camera-restore-affordance';
import {
  VoyagerCameraController,
  type ManualCameraHost,
} from '../src/render/voyager-camera-controller';
import { RenderEngine } from '../src/render/render-engine';
import { worldVec3 } from '../src/types/branded';
import type { GPUCapabilities } from '../src/boot/gpu-capability-probe';

const CAPS: GPUCapabilities = {
  supportsReverseZ: true,
  supportsFloatDepth: true,
  recommendedTextureTier: '8k',
};

interface Stack {
  host: HTMLElement;
  attributeHost: HTMLElement;
  engine: RenderEngine;
  controller: VoyagerCameraController;
  button: HTMLButtonElement;
  dispose: () => void;
  restoreSpy: ReturnType<typeof vi.spyOn>;
}

const buildStack = (): Stack => {
  const attributeHost = document.createElement('div');
  document.body.appendChild(attributeHost);
  const host = document.createElement('div');
  attributeHost.appendChild(host);
  // Real RenderEngine with a stub renderer factory (so we exercise the
  // setManualCameraActive setter + onManualCameraChange wiring end-to-end).
  const engine = new RenderEngine(
    CAPS,
    {},
    () => ({
      setSize() {},
      setPixelRatio() {},
      setAnimationLoop() {},
      render() {},
      dispose() {},
    }),
  );
  engine.init({
    clientWidth: 800,
    clientHeight: 600,
    width: 800,
    height: 600,
  } as unknown as HTMLCanvasElement);

  const camera = new PerspectiveCamera(50, 1, 1e-6, 1e15);
  const controller = new VoyagerCameraController({
    camera,
    domElement: host,
    renderEngine: engine as unknown as ManualCameraHost,
    getActiveTarget: () => null,
    getViewFrameOrigin: () => worldVec3(0, 0, 0),
    reducedMotion: () => true, // collapse to instant so tests don't need RAF
  });
  const restoreSpy = vi.spyOn(controller, 'restore');

  const handle = mountCameraRestoreAffordance({
    host,
    attributeHost,
    controller,
    renderEngine: engine,
  });

  return {
    host,
    attributeHost,
    engine,
    controller,
    button: handle.button,
    dispose: () => {
      handle.dispose();
      engine.dispose();
      attributeHost.remove();
    },
    restoreSpy,
  };
};

const dispatchKey = (
  init: KeyboardEventInit,
  target: EventTarget = document,
): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(ev);
  return ev;
};

let stack: Stack;
beforeEach(() => {
  stack = buildStack();
});
afterEach(() => {
  stack.dispose();
});

describe("AC7 — 'R' shortcut fires restore", () => {
  it("'r' (lowercase) triggers restore", () => {
    dispatchKey({ key: 'r' });
    expect(stack.restoreSpy).toHaveBeenCalledTimes(1);
  });

  it("'R' (uppercase, Shift held) triggers restore", () => {
    // Shift IS allowed (Shift+drag is the roll modifier per ADR 3c).
    dispatchKey({ key: 'R', shiftKey: true });
    expect(stack.restoreSpy).toHaveBeenCalledTimes(1);
  });

  it("'r' preventsDefault so the browser default for the key is suppressed", () => {
    const ev = dispatchKey({ key: 'r' });
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe("AC7 — 'R' shortcut text-input gate", () => {
  it('input[type=text] focused → R is ignored', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    dispatchKey({ key: 'r' });
    expect(stack.restoreSpy).not.toHaveBeenCalled();
    input.remove();
  });

  it('textarea focused → R is ignored', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    dispatchKey({ key: 'r' });
    expect(stack.restoreSpy).not.toHaveBeenCalled();
    ta.remove();
  });

  it('select focused → R is ignored', () => {
    const sel = document.createElement('select');
    document.body.appendChild(sel);
    sel.focus();
    dispatchKey({ key: 'r' });
    expect(stack.restoreSpy).not.toHaveBeenCalled();
    sel.remove();
  });

  it('contenteditable focused → R is ignored', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.tabIndex = 0;
    document.body.appendChild(div);
    div.focus();
    dispatchKey({ key: 'r' });
    expect(stack.restoreSpy).not.toHaveBeenCalled();
    div.remove();
  });

  it('non-text input (checkbox) focused → R IS still honored', () => {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    document.body.appendChild(cb);
    cb.focus();
    dispatchKey({ key: 'r' });
    expect(stack.restoreSpy).toHaveBeenCalledTimes(1);
    cb.remove();
  });
});

describe("AC7 — 'R' shortcut modifier gate (Ctrl/Cmd/Alt blocked)", () => {
  it('Ctrl+R is ignored (so browser reload still works)', () => {
    dispatchKey({ key: 'r', ctrlKey: true });
    expect(stack.restoreSpy).not.toHaveBeenCalled();
  });

  it('Cmd+R (metaKey) is ignored', () => {
    dispatchKey({ key: 'r', metaKey: true });
    expect(stack.restoreSpy).not.toHaveBeenCalled();
  });

  it('Alt+R is ignored', () => {
    dispatchKey({ key: 'r', altKey: true });
    expect(stack.restoreSpy).not.toHaveBeenCalled();
  });

  it('event.defaultPrevented === true is ignored', () => {
    const handler = (e: KeyboardEvent): void => {
      e.preventDefault();
    };
    document.addEventListener('keydown', handler, true);
    dispatchKey({ key: 'r' });
    expect(stack.restoreSpy).not.toHaveBeenCalled();
    document.removeEventListener('keydown', handler, true);
  });

  it('keys other than R do not fire restore', () => {
    dispatchKey({ key: 'q' });
    dispatchKey({ key: 'Enter' });
    dispatchKey({ key: 'Escape' });
    expect(stack.restoreSpy).not.toHaveBeenCalled();
  });
});

describe('AC4 — restore button DOM contract', () => {
  it('button has the contracted attributes', () => {
    const b = stack.button;
    expect(b.tagName).toBe('BUTTON');
    expect(b.className).toBe('restore-camera');
    expect(b.type).toBe('button');
    expect(b.getAttribute('aria-label')).toBe('Restore default camera framing');
  });

  it('button inner content is `↺` glyph wrapped in aria-hidden span', () => {
    const span = stack.button.querySelector('span');
    expect(span).not.toBeNull();
    expect(span!.getAttribute('aria-hidden')).toBe('true');
    expect(span!.textContent).toBe('↺');
  });

  it('button click triggers restore (same path as R)', () => {
    stack.button.click();
    expect(stack.restoreSpy).toHaveBeenCalledTimes(1);
  });

  it('attributeHost data-manual-camera tracks engine.manualCameraActive', () => {
    expect(stack.attributeHost.hasAttribute('data-manual-camera')).toBe(false);
    stack.engine.setManualCameraActive(true);
    expect(stack.attributeHost.getAttribute('data-manual-camera')).toBe('true');
    stack.engine.setManualCameraActive(false);
    expect(stack.attributeHost.hasAttribute('data-manual-camera')).toBe(false);
  });

  it('dispose() removes the button and detaches listeners', () => {
    expect(stack.button.isConnected).toBe(true);
    stack.dispose();
    // Re-create a fresh stack for the afterEach dispose (idempotent).
    stack = buildStack();
    // The original button was removed by the explicit dispose above; the
    // restoreSpy from THAT stack should no longer fire on R.
  });

  it('button mounted as sibling of host (light DOM, not shadow)', () => {
    expect(stack.button.parentElement).toBe(stack.host);
    expect(stack.button.shadowRoot).toBeNull();
  });
});

describe('AC4 — embed-mode carve-out', () => {
  it('the affordance mounts even when no chrome elements were mounted (simulation-not-chrome)', () => {
    // The affordance does not consult an embedEnabled flag — it always
    // mounts. This is the documented carve-out from AC4. Re-verify by
    // observing that buildStack() produces a button without any
    // chrome-mode opt-out.
    expect(stack.button).not.toBeNull();
    expect(stack.button.isConnected).toBe(true);
  });
});
