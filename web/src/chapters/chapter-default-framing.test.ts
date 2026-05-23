/**
 * Story 4.5 AC3 — unit tests for the chapter-default-framing resolver.
 */

import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';

import { resolveChapterDefaultFraming } from './chapter-default-framing';
import v1Jupiter from './specs/v1-jupiter';
import v1Heliopause from './specs/v1-heliopause';
import type { ChapterSpec, ChapterDefaultFraming } from '../types/chapter';

describe('Story 4.5 AC3 — resolveChapterDefaultFraming', () => {
  it('returns null for null chapter', () => {
    expect(resolveChapterDefaultFraming(null, new Vector3(0, 0, 0))).toBeNull();
  });

  it('returns null for null active target', () => {
    expect(resolveChapterDefaultFraming(v1Jupiter, null)).toBeNull();
  });

  it('returns null for a chapter without defaultFraming (heliopause)', () => {
    expect(
      resolveChapterDefaultFraming(v1Heliopause, new Vector3(1, 2, 3)),
    ).toBeNull();
  });

  it('returns position = activeTarget + offsetKm for V1J', () => {
    const target = new Vector3(100, 200, 300);
    const framing = resolveChapterDefaultFraming(v1Jupiter, target);
    expect(framing).not.toBeNull();
    const [ox, oy, oz] = v1Jupiter.defaultFraming!.offsetKm;
    expect(framing!.position.x).toBeCloseTo(100 + ox, 6);
    expect(framing!.position.y).toBeCloseTo(200 + oy, 6);
    expect(framing!.position.z).toBeCloseTo(300 + oz, 6);
  });

  it('camera quaternion orients the camera to look at the target (negative-Z toward target)', () => {
    const target = new Vector3(0, 0, 0);
    const framing = resolveChapterDefaultFraming(v1Jupiter, target);
    expect(framing).not.toBeNull();
    // After applying the quaternion to the canonical -Z forward vector,
    // the result should point from the camera position toward the
    // target. Verify by applying the quaternion to (0, 0, -1) and
    // checking the direction matches the unit vector from camera to
    // target.
    const forward = new Vector3(0, 0, -1).applyQuaternion(framing!.quaternion);
    const expected = new Vector3()
      .subVectors(target, framing!.position)
      .normalize();
    expect(forward.x).toBeCloseTo(expected.x, 4);
    expect(forward.y).toBeCloseTo(expected.y, 4);
    expect(forward.z).toBeCloseTo(expected.z, 4);
  });

  it('honours a chapter-provided upWorld override', () => {
    const fakeSpec: ChapterSpec = {
      slug: 'fake-encounter',
      name: 'Fake Encounter',
      markerLabel: 'FX',
      anchorEt: 0,
      windowStartEt: -1,
      windowEndEt: 1,
      spacecraft: 'v1',
      ogDescription: 'fake',
      targetBody: 5,
      defaultFraming: {
        offsetKm: [0, 0, 1_000_000],
        upWorld: [1, 0, 0],
      } satisfies ChapterDefaultFraming,
    };
    const target = new Vector3(0, 0, 0);
    const framing = resolveChapterDefaultFraming(fakeSpec, target);
    expect(framing).not.toBeNull();
    // With up = +X and camera looking from +Z toward origin, the camera
    // local +Y (the "up" the lookAt math reconstructs) should align
    // with world +X. Verify by transforming (0, 1, 0) through the
    // quaternion.
    const localUp = new Vector3(0, 1, 0).applyQuaternion(framing!.quaternion);
    expect(localUp.x).toBeCloseTo(1, 4);
  });
});
