// @vitest-environment happy-dom
/**
 * Story 4.2 QA gap tests — cross-cutting hardening beyond the dev's
 * acceptance coverage. Targets the gap surface listed in the QA stage
 * prompt:
 *
 *   1. Architecture Decision 3c source-grep hardening (no
 *      OrbitControls; no `addEventListener('mousedown'...`; Shift is
 *      the ONLY roll path).
 *   2. Zoom-clamp boundary edge cases (NaN / Infinity / negative
 *      already pinned by dev; this file pins zero + negative-Infinity
 *      + just-below-min + just-above-max for symmetry).
 *   3. `R` keyboard listener gate edge cases not pinned by dev:
 *      - focus on a button (NOT a text input) still fires R
 *      - focus on a select element does NOT fire R (already covered
 *        by dev's text-input gate suite, but pinned here as a "no
 *        regression of the text-input gate's select handling" so a
 *        future contributor removing select from the gate has TWO
 *        tests to break, not one)
 *      - key='R' with Caps Lock (i.e. uppercase letter without Shift)
 *        still fires R
 *      - key='r' (lowercase) fires R (case-insensitive)
 *   4. Embed-mode carve-out for the R keyboard listener (not just the
 *      button): the document-level keydown listener attaches regardless
 *      of embed mode (manual camera is simulation-not-chrome per AC4).
 *   5. Reduced-motion live tracking — mirror Story 4.1's ViewFrame
 *      pattern. The controller must NOT snapshot the reduced-motion
 *      boolean at construction; it must re-read the source callback at
 *      each restore() call so a mid-session matchMedia flip changes
 *      behavior on the next restore.
 *   6. PBD module-owned carve-out: end-to-end through the affordance
 *      (clicking the restore button while suspended must no-op too —
 *      since the button click routes to `controller.restore()` which
 *      already has the guard, this is a pin against a future refactor
 *      that bypasses the guard).
 *   7. Boot-ordering defense — mirror Story 4.1's main-ts-boot-ordering
 *      pattern. Pin in `main.ts`:
 *      - VoyagerCameraController constructed AFTER `engine = new RenderEngine(...)`
 *      - `mountCameraRestoreAffordance(...)` called AFTER controller
 *      - both live inside the simulation surface (after all early returns)
 *      A regression that reorders these would runtime-null-deref.
 *
 * These tests are picked up by the default web vitest sweep (no slow
 * markers; no integration ignore tag) per the project rule.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerspectiveCamera } from 'three';

import {
  VoyagerCameraController,
  MIN_ZOOM_DISTANCE_KM,
  MAX_ZOOM_DISTANCE_KM,
  clampZoomDistance,
  type ManualCameraHost,
} from '../src/render/voyager-camera-controller';
import { mountCameraRestoreAffordance } from '../src/boot/camera-restore-affordance';
import { RenderEngine } from '../src/render/render-engine';
import { worldVec3 } from '../src/types/branded';
import type { GPUCapabilities } from '../src/boot/gpu-capability-probe';

// ----- source-grep fixtures ------------------------------------------

const webRoot = resolve(__dirname, '..');
const controllerSrc = readFileSync(
  resolve(webRoot, 'src/render/voyager-camera-controller.ts'),
  'utf-8',
);
const affordanceSrc = readFileSync(
  resolve(webRoot, 'src/boot/camera-restore-affordance.ts'),
  'utf-8',
);
const mainTsSrc = readFileSync(
  resolve(webRoot, 'src/main.ts'),
  'utf-8',
);

/** Strip JSDoc / block / line comments so source-grep tests aren't fooled
 *  by prose in the documentation header. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const controllerCode = stripComments(controllerSrc);
const affordanceCode = stripComments(affordanceSrc);

// ----- common stack builders -----------------------------------------

const CAPS: GPUCapabilities = {
  supportsReverseZ: true,
  supportsFloatDepth: true,
  recommendedTextureTier: '8k',
};

const makeStubRenderer = () => ({
  setSize() {},
  setPixelRatio() {},
  setAnimationLoop() {},
  render() {},
  dispose() {},
});

interface Stack {
  attributeHost: HTMLElement;
  host: HTMLElement;
  engine: RenderEngine;
  controller: VoyagerCameraController;
  button: HTMLButtonElement;
  dispose: () => void;
  restoreSpy: ReturnType<typeof vi.spyOn>;
}

const buildStack = (opts: { reducedMotion?: () => boolean } = {}): Stack => {
  const attributeHost = document.createElement('div');
  document.body.appendChild(attributeHost);
  const host = document.createElement('div');
  attributeHost.appendChild(host);

  const engine = new RenderEngine(CAPS, {}, () => makeStubRenderer());
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
    reducedMotion: opts.reducedMotion ?? (() => true),
  });
  const restoreSpy = vi.spyOn(controller, 'restore');
  const handle = mountCameraRestoreAffordance({
    host,
    attributeHost,
    controller,
    renderEngine: engine,
  });
  return {
    attributeHost,
    host,
    engine,
    controller,
    button: handle.button,
    restoreSpy,
    dispose: () => {
      handle.dispose();
      engine.dispose();
      attributeHost.remove();
    },
  };
};

let stack: Stack | null = null;
afterEach(() => {
  if (stack !== null) {
    stack.dispose();
    stack = null;
  }
  // Detach any input elements the gate-edge tests appended.
  for (const el of Array.from(document.body.children)) {
    if (el instanceof HTMLInputElement && el.id === 'qa-gap-input') el.remove();
    if (el instanceof HTMLButtonElement && el.id === 'qa-gap-button') el.remove();
  }
});

const dispatchKey = (init: KeyboardEventInit): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.dispatchEvent(ev);
  return ev;
};

// ----------------------------------------------------------------------
// 1) Architecture Decision 3c source-grep hardening
// ----------------------------------------------------------------------

describe('Story 4.2 QA — Architecture Decision 3c source-grep (controller)', () => {
  it('does NOT import OrbitControls (hand-rolled controller contract)', () => {
    expect(controllerCode).not.toMatch(/OrbitControls/);
    expect(controllerCode).not.toMatch(/from\s+['"]three\/examples\//);
    expect(controllerCode).not.toMatch(/three\/addons\/controls\//);
  });

  it('does NOT call addEventListener("mousedown"|"mouseup"|"mousemove") — Pointer Events only', () => {
    // The Pointer Events primitive (attachPointerHandlers) is the canonical
    // input wrapper per Architecture line 418. Raw mouse listeners would
    // bypass setPointerCapture + the unified mouse/touch/pen path.
    expect(controllerCode).not.toMatch(/addEventListener\(\s*['"]mousedown['"]/);
    expect(controllerCode).not.toMatch(/addEventListener\(\s*['"]mouseup['"]/);
    expect(controllerCode).not.toMatch(/addEventListener\(\s*['"]mousemove['"]/);
  });

  it('does NOT call addEventListener("touchstart"|"touchend"|"touchmove")', () => {
    expect(controllerCode).not.toMatch(/addEventListener\(\s*['"]touchstart['"]/);
    expect(controllerCode).not.toMatch(/addEventListener\(\s*['"]touchend['"]/);
    expect(controllerCode).not.toMatch(/addEventListener\(\s*['"]touchmove['"]/);
  });

  it('only raw addEventListener call in the controller is for "wheel" (primitive does not cover wheel)', () => {
    // Collect every addEventListener call and assert each is for 'wheel'.
    // attachPointerHandlers is the OTHER input path; raw addEventListener
    // beyond 'wheel' would signal a bypass of the primitive.
    const matches = controllerCode.match(/addEventListener\(\s*['"]([^'"]+)['"]/g) ?? [];
    for (const m of matches) {
      expect(m).toMatch(/['"]wheel['"]/);
    }
  });

  it('Shift is the ONLY roll path (applyRoll only invoked from the shift branch)', () => {
    // The contract: `if (shift) { this.applyRoll(dx); return; }` is the
    // sole call site of applyRoll() outside its own definition. A future
    // refactor that adds a non-Shift roll trigger (e.g. middle-button drag,
    // or a keyboard arrow) would break Architecture Decision 3c's
    // commitment that roll requires the modifier.
    //
    // We grep for `this.applyRoll(` to distinguish call sites from the
    // private method definition (which has the form `private applyRoll(`
    // or `applyRoll(dx: number): void {`).
    const callSites = controllerCode.match(/this\.applyRoll\s*\(/g) ?? [];
    expect(callSites.length).toBe(1);
    // And the call is preceded by a shift guard (within ~160 chars upstream).
    const callIdx = controllerCode.search(/this\.applyRoll\(/);
    expect(callIdx).toBeGreaterThan(-1);
    const upstream = controllerCode.slice(Math.max(0, callIdx - 160), callIdx);
    expect(upstream).toMatch(/if\s*\(\s*shift\s*\)/);
  });

  it('attachPointerHandlers is the input wiring used in attach()', () => {
    // Positive pin matching the negative ones above: confirm the
    // primitive IS wired, so a deletion of the primitive wiring (and
    // re-introduction of raw listeners) would fail on this assertion
    // in addition to the negative ones.
    expect(controllerCode).toMatch(/attachPointerHandlers\s*\(/);
  });
});

describe('Story 4.2 QA — Architecture Decision 3c source-grep (affordance)', () => {
  it('affordance does NOT add raw addEventListener for mouse/touch input on the canvas', () => {
    // The affordance wires `click` on the button and `keydown` on the
    // document. Those are the only addEventListener calls in the file —
    // no mouse/touch wiring (the controller owns canvas input).
    expect(affordanceCode).not.toMatch(/addEventListener\(\s*['"]mouse/);
    expect(affordanceCode).not.toMatch(/addEventListener\(\s*['"]touch/);
    expect(affordanceCode).not.toMatch(/addEventListener\(\s*['"]pointer/);
  });
});

// ----------------------------------------------------------------------
// 2) Zoom-clamp boundary edge cases — symmetry pin
// ----------------------------------------------------------------------

describe('Story 4.2 QA — clampZoomDistance edge cases (symmetry pin)', () => {
  it('clamps -Infinity to MIN (NaN/negative/zero falls to MIN)', () => {
    expect(clampZoomDistance(Number.NEGATIVE_INFINITY)).toBe(MIN_ZOOM_DISTANCE_KM);
    expect(clampZoomDistance(0)).toBe(MIN_ZOOM_DISTANCE_KM);
    expect(clampZoomDistance(-1)).toBe(MIN_ZOOM_DISTANCE_KM);
    expect(clampZoomDistance(-0.0001)).toBe(MIN_ZOOM_DISTANCE_KM);
  });

  it('exactly MIN_ZOOM_DISTANCE_KM passes through unchanged (lower boundary)', () => {
    expect(clampZoomDistance(MIN_ZOOM_DISTANCE_KM)).toBe(MIN_ZOOM_DISTANCE_KM);
  });

  it('exactly MAX_ZOOM_DISTANCE_KM passes through unchanged (upper boundary)', () => {
    expect(clampZoomDistance(MAX_ZOOM_DISTANCE_KM)).toBe(MAX_ZOOM_DISTANCE_KM);
  });

  it('just-below MIN snaps up; just-above MAX snaps down', () => {
    expect(clampZoomDistance(MIN_ZOOM_DISTANCE_KM - 1e-9)).toBe(MIN_ZOOM_DISTANCE_KM);
    expect(clampZoomDistance(MAX_ZOOM_DISTANCE_KM + 1)).toBe(MAX_ZOOM_DISTANCE_KM);
  });

  it('output is always finite for any finite or infinite input', () => {
    const samples = [
      0,
      -0,
      -1e-9,
      MIN_ZOOM_DISTANCE_KM,
      1,
      MAX_ZOOM_DISTANCE_KM,
      MAX_ZOOM_DISTANCE_KM + 1,
      1e30,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NaN,
    ];
    for (const s of samples) {
      expect(Number.isFinite(clampZoomDistance(s))).toBe(true);
    }
  });
});

// ----------------------------------------------------------------------
// 3) R keyboard listener edge cases the dev didn't pin
// ----------------------------------------------------------------------

describe("Story 4.2 QA — 'R' shortcut edge cases (focus / Caps Lock)", () => {
  beforeEach(() => {
    stack = buildStack();
  });

  it('focus on a button (NOT a text input) still fires R', () => {
    const btn = document.createElement('button');
    btn.id = 'qa-gap-button';
    btn.type = 'button';
    btn.textContent = 'unrelated';
    document.body.appendChild(btn);
    btn.focus();
    dispatchKey({ key: 'r' });
    expect(stack!.restoreSpy).toHaveBeenCalledTimes(1);
  });

  it('focus on a select element does NOT fire R (text-input gate, regression pin)', () => {
    // Dev's existing test pins this; we restate here so a future contributor
    // editing the gate's NON_TEXT_TYPES set has TWO tests breaking, not
    // one. (Select is its own element, not part of NON_TEXT_TYPES — it
    // falls through HTMLSelectElement branch).
    const sel = document.createElement('select');
    document.body.appendChild(sel);
    sel.focus();
    dispatchKey({ key: 'r' });
    expect(stack!.restoreSpy).not.toHaveBeenCalled();
    sel.remove();
  });

  it('uppercase "R" without Shift (e.g. Caps Lock on) still fires R', () => {
    // When Caps Lock is enabled the OS emits key='R' but event.shiftKey is
    // false. The listener accepts both 'r' and 'R' regardless of shiftKey
    // so Caps-Lock-on users aren't blocked.
    dispatchKey({ key: 'R' /* shiftKey false */ });
    expect(stack!.restoreSpy).toHaveBeenCalledTimes(1);
  });

  it('lowercase "r" with Shift held also fires R (Shift is the roll modifier — allowed for R too)', () => {
    // Story 4.2's affordance allows Shift because Shift+drag is the roll
    // path. Pin that the R key listener doesn't accidentally gate Shift.
    dispatchKey({ key: 'r', shiftKey: true });
    expect(stack!.restoreSpy).toHaveBeenCalledTimes(1);
  });

  it('case-insensitive: both "r" and "R" route to the same restore call', () => {
    dispatchKey({ key: 'r' });
    dispatchKey({ key: 'R' });
    expect(stack!.restoreSpy).toHaveBeenCalledTimes(2);
  });

  it('a non-text input button focused inside the affordance also fires R (the restore button itself)', () => {
    // After a manual gesture, the user might tab-focus the restore button.
    // Pressing R while focused on that button should still trigger restore
    // (button is non-text).
    stack!.button.focus();
    dispatchKey({ key: 'r' });
    expect(stack!.restoreSpy).toHaveBeenCalledTimes(1);
  });
});

// ----------------------------------------------------------------------
// 4) Embed-mode carve-out for the R keyboard listener
// ----------------------------------------------------------------------

describe('Story 4.2 QA — embed-mode carve-out: R listener still attaches', () => {
  it('mountCameraRestoreAffordance signature has no embedEnabled gate (mounts unconditionally)', () => {
    // Pin the contract at the module boundary: the function takes no
    // `embedEnabled` flag. AC4 + AC7 commit that the affordance + R
    // listener mount in embed mode too (simulation-not-chrome).
    const sig = mountCameraRestoreAffordance.toString();
    expect(sig).not.toMatch(/embedEnabled/);
    expect(sig).not.toMatch(/embedMode/);
  });

  it('R keydown listener fires restore even when no chrome elements are mounted', () => {
    // Simulate embed mode by NOT mounting any chrome (just the affordance).
    // The R listener should still respond.
    stack = buildStack();
    dispatchKey({ key: 'r' });
    expect(stack.restoreSpy).toHaveBeenCalledTimes(1);
  });

  it('affordance source does not consult any embed-mode flag', () => {
    // Pin in the source: no reference to EmbedModeState or `embedEnabled`
    // in the affordance module — proof that no future contributor can
    // silently add a chrome-skip without revising the AC4/AC7 carve-out.
    expect(affordanceCode).not.toMatch(/EmbedModeState/);
    expect(affordanceCode).not.toMatch(/embedEnabled/);
  });
});

// ----------------------------------------------------------------------
// 5) Reduced-motion live tracking — controller does NOT snapshot at ctor
// ----------------------------------------------------------------------

describe('Story 4.2 QA — reduced-motion is read live (not snapshotted at ctor)', () => {
  it('flipping reducedMotion source between restore() calls changes behavior on the next call', () => {
    // Stateful closure: starts as false (animated), flips to true.
    let reduced = false;
    const reducedMotionSource = (): boolean => reduced;

    const attributeHost = document.createElement('div');
    document.body.appendChild(attributeHost);
    const host = document.createElement('div');
    attributeHost.appendChild(host);
    const engine = new RenderEngine(CAPS, {}, () => makeStubRenderer());
    engine.init({
      clientWidth: 800,
      clientHeight: 600,
      width: 800,
      height: 600,
    } as unknown as HTMLCanvasElement);
    const camera = new PerspectiveCamera(50, 1, 1e-6, 1e15);

    let now = 0;
    const controller = new VoyagerCameraController({
      camera,
      domElement: host,
      renderEngine: engine as unknown as ManualCameraHost,
      getActiveTarget: () => null,
      getViewFrameOrigin: () => worldVec3(0, 0, 0),
      reducedMotion: reducedMotionSource,
      restoreDurationMs: 400,
      nowMs: () => now,
    });

    // First call: reduced=false → animated path → isRestoring=true post-call.
    engine.setManualCameraActive(true);
    controller.restore();
    expect(controller.isRestoring).toBe(true);
    // Cancel the in-flight animation so the second call starts clean.
    // (Triggering another restore() cancels the previous animation.)

    // Flip the live source.
    reduced = true;

    // Second call: reduced=true → instant path → isRestoring=false post-call.
    engine.setManualCameraActive(true);
    controller.restore();
    expect(controller.isRestoring).toBe(false);
    expect(engine.manualCameraActive).toBe(false);

    controller.detach();
    engine.dispose();
    attributeHost.remove();
  });

  it('default reducedMotion source reads window.matchMedia at call time, not ctor time', () => {
    // The default closure (`defaultReducedMotionSource`) calls
    // `window.matchMedia('(prefers-reduced-motion: reduce)').matches` on
    // every invocation. A monkey-patched matchMedia that toggles between
    // calls returns different values per call.
    const original = window.matchMedia;
    let queriedMatches = false;
    // Track call count: the controller must invoke matchMedia AT LEAST
    // once per restore (proves no caching at ctor).
    let callCount = 0;
    (window as Window & { matchMedia: typeof window.matchMedia }).matchMedia =
      ((_query: string) => {
        callCount++;
        return {
          matches: queriedMatches,
          media: _query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        } as unknown as MediaQueryList;
      }) as typeof window.matchMedia;

    try {
      const attributeHost = document.createElement('div');
      document.body.appendChild(attributeHost);
      const host = document.createElement('div');
      attributeHost.appendChild(host);
      const engine = new RenderEngine(CAPS, {}, () => makeStubRenderer());
      engine.init({
        clientWidth: 800,
        clientHeight: 600,
        width: 800,
        height: 600,
      } as unknown as HTMLCanvasElement);
      const camera = new PerspectiveCamera(50, 1, 1e-6, 1e15);
      // NO reducedMotion override — exercise the default source.
      const controller = new VoyagerCameraController({
        camera,
        domElement: host,
        renderEngine: engine as unknown as ManualCameraHost,
        getActiveTarget: () => null,
        getViewFrameOrigin: () => worldVec3(0, 0, 0),
        restoreDurationMs: 400,
        nowMs: () => 0,
      });

      // Ctor must NOT pre-query matchMedia (the default source is invoked
      // at restore time only). Call count after ctor must be 0.
      const callsAfterCtor = callCount;
      expect(callsAfterCtor).toBe(0);

      // First restore — matchMedia called, returns false → animated path.
      queriedMatches = false;
      engine.setManualCameraActive(true);
      controller.restore();
      expect(callCount).toBeGreaterThan(callsAfterCtor);
      expect(controller.isRestoring).toBe(true);

      // Flip matchMedia; new restore call sees the new value.
      queriedMatches = true;
      const callsBeforeSecond = callCount;
      engine.setManualCameraActive(true);
      controller.restore();
      expect(callCount).toBeGreaterThan(callsBeforeSecond);
      expect(controller.isRestoring).toBe(false);
      expect(engine.manualCameraActive).toBe(false);

      controller.detach();
      engine.dispose();
      attributeHost.remove();
    } finally {
      (window as Window & { matchMedia: typeof window.matchMedia }).matchMedia = original;
    }
  });
});

// ----------------------------------------------------------------------
// 6) PBD module-owned carve-out: end-to-end through the affordance
// ----------------------------------------------------------------------

describe('Story 4.2 QA — PBD carve-out: button click + R no-op when suspended', () => {
  beforeEach(() => {
    stack = buildStack();
  });

  it('button click while manualCameraSuspended=true does NOT flip engine flag', () => {
    stack!.engine.setManualCameraActive(true);
    stack!.controller.manualCameraSuspended = true;
    stack!.button.click();
    // restore() was called (the click handler doesn't gate; the controller
    // does), but the engine flag must NOT flip — the controller's restore()
    // guards on manualCameraSuspended.
    expect(stack!.restoreSpy).toHaveBeenCalledTimes(1);
    expect(stack!.engine.manualCameraActive).toBe(true);
  });

  it('R keydown while manualCameraSuspended=true does NOT flip engine flag', () => {
    stack!.engine.setManualCameraActive(true);
    stack!.controller.manualCameraSuspended = true;
    dispatchKey({ key: 'r' });
    expect(stack!.restoreSpy).toHaveBeenCalledTimes(1);
    expect(stack!.engine.manualCameraActive).toBe(true);
  });

  it('un-suspending allows R to resume flipping the flag', () => {
    stack!.engine.setManualCameraActive(true);
    stack!.controller.manualCameraSuspended = true;
    dispatchKey({ key: 'r' });
    expect(stack!.engine.manualCameraActive).toBe(true);

    stack!.controller.manualCameraSuspended = false;
    dispatchKey({ key: 'r' });
    // Under reduced-motion path (buildStack default), restore is instant.
    expect(stack!.engine.manualCameraActive).toBe(false);
  });
});

// ----------------------------------------------------------------------
// 7) Boot-ordering defense — mirror Story 4.1's main-ts-boot-ordering
// ----------------------------------------------------------------------

const indexOfMatch = (re: RegExp): number => {
  const m = mainTsSrc.match(re);
  if (m === null || m.index === undefined) return -1;
  return m.index;
};

describe('Story 4.2 QA — main.ts boot-ordering invariants for the camera controller', () => {
  it('VoyagerCameraController is constructed AFTER the RenderEngine instance', () => {
    // The controller's constructor reads `engine.camera`; a reorder would
    // hit a ReferenceError at boot.
    const engineCtorIdx = indexOfMatch(/const\s+engine\s*=\s*new\s+RenderEngine\(/);
    const controllerCtorIdx = indexOfMatch(/new\s+VoyagerCameraController\(/);
    expect(engineCtorIdx).toBeGreaterThanOrEqual(0);
    expect(controllerCtorIdx).toBeGreaterThanOrEqual(0);
    expect(
      engineCtorIdx,
      'RenderEngine must be constructed before VoyagerCameraController (controller needs engine.camera)',
    ).toBeLessThan(controllerCtorIdx);
  });

  it('mountCameraRestoreAffordance is called AFTER the controller is constructed', () => {
    // The affordance receives the controller as a constructor option;
    // reordering would hit a ReferenceError.
    const controllerCtorIdx = indexOfMatch(/new\s+VoyagerCameraController\(/);
    const affordanceCallIdx = indexOfMatch(/mountCameraRestoreAffordance\(/);
    expect(controllerCtorIdx).toBeGreaterThanOrEqual(0);
    expect(affordanceCallIdx).toBeGreaterThanOrEqual(0);
    expect(
      controllerCtorIdx,
      'controller must be constructed before mountCameraRestoreAffordance reads it',
    ).toBeLessThan(affordanceCallIdx);
  });

  it('controller + affordance live AFTER all bootstrap early returns (simulation surface only)', () => {
    // Precision-smoke / ephemeris-perf / about-route early returns must
    // all appear BEFORE the controller wiring. Otherwise the perf harness
    // or about page would try to wire the controller before the canvas
    // exists.
    const precisionSmokeIdx = indexOfMatch(/isPrecisionSmokeMode\(/);
    const ephemerisPerfIdx = indexOfMatch(/isEphemerisPerfMode\(/);
    const aboutRouteIdx = indexOfMatch(/initialUrlState\.kind\s*===\s*['"]about['"]/);
    const controllerCtorIdx = indexOfMatch(/new\s+VoyagerCameraController\(/);
    expect(controllerCtorIdx).toBeGreaterThanOrEqual(0);
    if (precisionSmokeIdx >= 0) expect(precisionSmokeIdx).toBeLessThan(controllerCtorIdx);
    if (ephemerisPerfIdx >= 0) expect(ephemerisPerfIdx).toBeLessThan(controllerCtorIdx);
    if (aboutRouteIdx >= 0) expect(aboutRouteIdx).toBeLessThan(controllerCtorIdx);
  });

  it('controller.attach() is called (the controller does not auto-attach in ctor)', () => {
    // Pin the explicit attach call so a future refactor that moves the
    // attach into the ctor (and then deletes the call) still has this
    // test breaking to remind that the attach contract changed.
    expect(mainTsSrc).toMatch(/cameraController\.attach\(\)/);
  });

  it('cameraController + renderEngine are published on __voyagerDebug under import.meta.env.DEV', () => {
    // AC8 smoke prerequisite — the lead's MCP smoke reads
    // `__voyagerDebug.cameraController` and `__voyagerDebug.renderEngine`.
    expect(mainTsSrc).toMatch(/cameraController/);
    expect(mainTsSrc).toMatch(/renderEngine:\s*engine/);
    // And the publication lives inside a DEV gate (constant folding will
    // strip in prod builds).
    const debugKeyIdx = indexOfMatch(/cameraController,\s*\n?\s*renderEngine:/);
    // Either ordering — the dev placed cameraController + renderEngine
    // adjacent. If they re-order, this regex won't match but the next
    // check still confirms both keys + the DEV gate exist.
    if (debugKeyIdx >= 0) {
      // Walk backwards from the key to find the nearest `import.meta.env.DEV`.
      const slice = mainTsSrc.slice(0, debugKeyIdx);
      expect(slice).toMatch(/import\.meta\.env\.DEV/);
    } else {
      // Looser fallback: both keys + DEV gate exist somewhere together.
      expect(mainTsSrc).toMatch(/import\.meta\.env\.DEV[\s\S]*cameraController/);
    }
  });

  it('controller closures resolve services via mutable refs (post-manifest service join pattern)', () => {
    // The controller is constructed pre-manifest but its `getActiveTarget`
    // + `getViewFrameOrigin` closures resolve services that join post-
    // manifest. The pattern is `let ephemerisServiceRef ... = null;` plus
    // a closure that null-checks the ref.
    expect(mainTsSrc).toMatch(/ephemerisServiceRef\s*:\s*EphemerisService\s*\|\s*null/);
    expect(mainTsSrc).toMatch(/viewFrameServiceRef\s*:\s*ViewFrameService\s*\|\s*null/);
    expect(mainTsSrc).toMatch(/ephemerisServiceRef\s*=\s*ephemerisService/);
    expect(mainTsSrc).toMatch(/viewFrameServiceRef\s*=\s*viewFrameService/);
  });
});

// ----------------------------------------------------------------------
// 8) Defensive: dispose path tears down the keyboard listener
// ----------------------------------------------------------------------

describe('Story 4.2 QA — dispose stops the global R listener', () => {
  it('dispose() on the affordance handle removes the document-level keydown listener', () => {
    stack = buildStack();
    // Sanity: R works before dispose.
    dispatchKey({ key: 'r' });
    expect(stack.restoreSpy).toHaveBeenCalledTimes(1);
    stack.restoreSpy.mockClear();

    // Dispose the stack's affordance handle DIRECTLY. After dispose the
    // global keydown listener must be removed; pressing R should be a
    // no-op (controller.restore is NOT called). We bypass the buildStack
    // dispose to avoid double-disposing.
    // NOTE: dispose is owned by buildStack; call the underlying dispose,
    //       then null the stack ref so afterEach doesn't double-dispose.
    const stashed = stack;
    stack = null;
    stashed.dispose();
    dispatchKey({ key: 'r' });
    expect(stashed.restoreSpy).not.toHaveBeenCalled();
  });

  it('after dispose, the data-manual-camera subscription is torn down (flip does not promote attribute)', () => {
    // Defensive companion to the keydown-removal pin: dispose also
    // removes the onManualCameraChange subscriber, so a subsequent
    // engine flip doesn't promote the attribute on the disposed host.
    const attributeHost = document.createElement('div');
    document.body.appendChild(attributeHost);
    const host = document.createElement('div');
    attributeHost.appendChild(host);
    const engine = new RenderEngine(CAPS, {}, () => makeStubRenderer());
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
      reducedMotion: () => true,
    });
    const handle = mountCameraRestoreAffordance({
      host,
      attributeHost,
      controller,
      renderEngine: engine,
    });
    handle.dispose();
    // Engine flip after dispose: attribute must NOT appear on the host.
    engine.setManualCameraActive(true);
    expect(attributeHost.hasAttribute('data-manual-camera')).toBe(false);

    controller.detach();
    engine.dispose();
    attributeHost.remove();
  });
});
