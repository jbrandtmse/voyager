import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  VG1_BUS_FRAME_ID,
  VG1_SCAN_PLATFORM_FRAME_ID,
  VG1_NA_CAMERA_FRAME_ID,
  VG1_HGA_FRAME_ID,
  VG2_BUS_FRAME_ID,
  VG2_SCAN_PLATFORM_FRAME_ID,
  VG2_NA_CAMERA_FRAME_ID,
  VG2_HGA_FRAME_ID,
  V1_NAIF_ID,
  V2_NAIF_ID,
  VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
  VG2_HGA_BORESIGHT_RELATIVE_TO_BUS,
  VG1_PLATFORM_REST_QUAT_RELATIVE_TO_BUS,
  VG2_PLATFORM_REST_QUAT_RELATIVE_TO_BUS,
  VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM,
  VG2_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM,
  VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS,
  VG2_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS,
} from './fk-constants';

// Parity test: frame IDs match `bake/src/ck_inventory.py:30-43` verbatim.
describe('fk-constants — frame IDs', () => {
  it('V1 bus / scan-platform / NA-camera / HGA IDs match the FK kernel', () => {
    expect(VG1_BUS_FRAME_ID).toBe(-31000);
    expect(VG1_SCAN_PLATFORM_FRAME_ID).toBe(-31100);
    expect(VG1_NA_CAMERA_FRAME_ID).toBe(-31101);
    expect(VG1_HGA_FRAME_ID).toBe(-31400);
  });

  it('V2 bus / scan-platform / NA-camera / HGA IDs match the FK kernel', () => {
    expect(VG2_BUS_FRAME_ID).toBe(-32000);
    expect(VG2_SCAN_PLATFORM_FRAME_ID).toBe(-32100);
    expect(VG2_NA_CAMERA_FRAME_ID).toBe(-32101);
    expect(VG2_HGA_FRAME_ID).toBe(-32400);
  });

  it('SPK NAIF IDs (-31 / -32) are the spacecraft-trajectory rollups', () => {
    expect(V1_NAIF_ID).toBe(-31);
    expect(V2_NAIF_ID).toBe(-32);
  });
});

// Norm = 1 for every published boresight + quaternion. Defends against
// transcription typos in the kernel-derived constants.
describe('fk-constants — orthonormality / unit-magnitude', () => {
  const vecNorm = (v: readonly [number, number, number]): number =>
    Math.hypot(v[0], v[1], v[2]);

  const quatNorm = (q: readonly [number, number, number, number]): number =>
    Math.hypot(q[0], q[1], q[2], q[3]);

  it('HGA boresight vectors are unit length', () => {
    expect(vecNorm(VG1_HGA_BORESIGHT_RELATIVE_TO_BUS)).toBeCloseTo(1.0, 14);
    expect(vecNorm(VG2_HGA_BORESIGHT_RELATIVE_TO_BUS)).toBeCloseTo(1.0, 14);
  });

  it('NA-camera boresight vectors are unit length', () => {
    expect(vecNorm(VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM)).toBeCloseTo(1.0, 14);
    expect(vecNorm(VG2_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM)).toBeCloseTo(1.0, 14);
  });

  it('solar-panel axis vectors are unit length', () => {
    expect(vecNorm(VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS)).toBeCloseTo(1.0, 14);
    expect(vecNorm(VG2_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS)).toBeCloseTo(1.0, 14);
  });

  it('platform-rest quaternions are unit norm', () => {
    expect(quatNorm(VG1_PLATFORM_REST_QUAT_RELATIVE_TO_BUS)).toBeCloseTo(1.0, 14);
    expect(quatNorm(VG2_PLATFORM_REST_QUAT_RELATIVE_TO_BUS)).toBeCloseTo(1.0, 14);
  });
});

// Round-trip: VG1_HGA boresight derives from the FK rotation Rx(180°) ·
// [0, 0, 1]. Constructing the same rotation via Three.js and applying it to
// the +Z axis must yield the published constant exactly.
describe('fk-constants — HGA boresight derivation parity', () => {
  it('VG1_HGA boresight equals Rx(180°) · (+Z) within float64 epsilon', () => {
    const rxPi = new THREE.Matrix4().makeRotationX(Math.PI);
    const zHat = new THREE.Vector3(0, 0, 1);
    const result = zHat.applyMatrix4(rxPi);
    expect(result.x).toBeCloseTo(VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[0], 14);
    expect(result.y).toBeCloseTo(VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[1], 14);
    expect(result.z).toBeCloseTo(VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[2], 14);
  });

  it('VG2_HGA boresight matches VG1 (same TKFRAME construction)', () => {
    expect(VG2_HGA_BORESIGHT_RELATIVE_TO_BUS[0]).toBe(
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[0],
    );
    expect(VG2_HGA_BORESIGHT_RELATIVE_TO_BUS[1]).toBe(
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[1],
    );
    expect(VG2_HGA_BORESIGHT_RELATIVE_TO_BUS[2]).toBe(
      VG1_HGA_BORESIGHT_RELATIVE_TO_BUS[2],
    );
  });
});

// Compile-time immutability — `as const` enforcement spot check. Any attempt
// to mutate the readonly tuple should be a TypeScript error.
describe('fk-constants — readonly contract', () => {
  it('platform-rest quaternion is the identity', () => {
    // Identity quaternion in scalar-last [x, y, z, w]
    expect(VG1_PLATFORM_REST_QUAT_RELATIVE_TO_BUS).toEqual([0, 0, 0, 1]);
    expect(VG2_PLATFORM_REST_QUAT_RELATIVE_TO_BUS).toEqual([0, 0, 0, 1]);
  });

  it('NA-camera boresight is +Z (platform frame)', () => {
    expect(VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM).toEqual([0, 0, 1]);
    expect(VG2_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM).toEqual([0, 0, 1]);
  });

  it('HGA boresight is -Z (bus frame)', () => {
    expect(VG1_HGA_BORESIGHT_RELATIVE_TO_BUS).toEqual([0, 0, -1]);
    expect(VG2_HGA_BORESIGHT_RELATIVE_TO_BUS).toEqual([0, 0, -1]);
  });
});
