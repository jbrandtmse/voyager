import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Color,
} from 'three';

import { RenderEngine } from '../render/render-engine';
import type { GPUCapabilities } from '../boot/gpu-capability-probe';
import { worldVec3 } from '../types/branded';
import { KM_PER_AU } from '../math/constants';

// Dev-mode precision smoke scene (AC5). Loads only when ?dev=precision is in
// the URL. Builds a 1-meter cube at the world origin and a 1-cm cube at 1 m
// offset, then orbits the camera from 1 m to 165 AU and back over 30 seconds.
//
// TODO: Story 7.6 — full Playwright visual regression at extreme zoom states
// (NFR-P8 long-form gate, deferred per story 1.5 AC5).

const METER_KM = 1e-3;
const CENTIMETER_KM = 1e-5;

// Camera distance schedule. Linearly interpolated in log-km space to make the
// motion visually smooth across the 8-decade zoom range without spending the
// whole 30 s near one end.
const MIN_DISTANCE_KM = 1e-3; // 1 m
const MAX_DISTANCE_KM = 165 * KM_PER_AU;
const LOOP_SECONDS = 30;

export interface PrecisionSmokeHandle {
  engine: RenderEngine;
  dispose: () => void;
}

export const isPrecisionSmokeMode = (devMode: string | null): boolean =>
  devMode === 'precision';

export const startPrecisionSmoke = (
  capabilities: GPUCapabilities,
  canvas: HTMLCanvasElement,
  forceLogDepth = false,
): PrecisionSmokeHandle => {
  const engine = new RenderEngine(capabilities, { forceLogDepth });
  engine.init(canvas);

  // 1-meter cube at world origin, bright white.
  const bigCube = new Mesh(
    new BoxGeometry(METER_KM, METER_KM, METER_KM),
    new MeshBasicMaterial({ color: new Color(0xffffff), wireframe: false }),
  );
  engine.worldGroup.add(bigCube);

  // 1-cm cube positioned 1 m away (along +x), highlighted in cyan.
  const smallCube = new Mesh(
    new BoxGeometry(CENTIMETER_KM, CENTIMETER_KM, CENTIMETER_KM),
    new MeshBasicMaterial({ color: new Color(0x00ffff), wireframe: false }),
  );
  smallCube.position.set(METER_KM, 0, 0);
  engine.worldGroup.add(smallCube);

  const startMs = nowMs();

  engine.onFrame(() => {
    const elapsedSec = ((nowMs() - startMs) / 1000) % LOOP_SECONDS;
    const distance = computeOrbitDistance(elapsedSec);
    engine.setCameraPosition(worldVec3(distance, 0, 0));
    // Camera sits at render-space origin (floating-origin recenter); the
    // cubes are in WorldGroup which has been translated to -cameraWorldPos,
    // so in render-space the big cube is at (-distance, 0, 0). Aim the
    // camera down the -X axis so the cubes are in frame.
    engine.camera.lookAt(-1, 0, 0);
  });

  engine.start();

  return {
    engine,
    dispose: () => engine.dispose(),
  };
};

// Triangle-wave distance ramp in log-space: 0 → 1 → 0 over LOOP_SECONDS,
// mapped log-linearly between MIN_DISTANCE_KM and MAX_DISTANCE_KM.
const computeOrbitDistance = (elapsedSec: number): number => {
  const phase = elapsedSec / LOOP_SECONDS; // [0, 1)
  const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2; // [0, 1] triangle
  const logMin = Math.log10(MIN_DISTANCE_KM);
  const logMax = Math.log10(MAX_DISTANCE_KM);
  const logD = logMin + triangle * (logMax - logMin);
  return Math.pow(10, logD);
};

const nowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

// Exported for test coverage of the orbit math without spinning a real engine.
export const __test = { computeOrbitDistance };
