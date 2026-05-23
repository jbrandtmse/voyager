/**
 * chapter-default-framing.ts — pure helper that resolves a chapter's
 * `defaultFraming` field into a `DefaultFramingTarget` for the
 * `VoyagerCameraController` restore animation (Story 4.5 AC3).
 *
 * The camera controller's `resolveDefaultFraming` closure (wired in
 * `main.ts`) delegates here: when the active chapter declares a
 * `defaultFraming` and an active body target is available, this helper
 * builds the `{ position, quaternion }` pair the restore tween hands to
 * the camera; otherwise it returns `null` and the controller falls back
 * to its built-in encounter / cruise defaults.
 *
 * The helper is intentionally pure (no Three.js scene-graph or DOM
 * dependency beyond `THREE.Vector3` + `THREE.Quaternion`) so unit tests
 * can pin the math without standing up the full controller. Story 4.6 /
 * 4.7 will populate `defaultFraming` on the remaining encounter chapters
 * and reuse this helper unchanged.
 */

import { Matrix4, Quaternion, Vector3 } from 'three';

import type { ChapterSpec } from '../types/chapter';
import type { DefaultFramingTarget } from '../render/voyager-camera-controller';

/**
 * Resolve the camera framing target for a chapter at the moment of
 * restore. Returns:
 *
 * - `null` when the chapter has no `defaultFraming` field (cruise /
 *   launch / heliopause / PBD / non-tuned encounters) or when the
 *   active body target is unresolvable (the chapter targets a body but
 *   the ephemeris chunk hasn't loaded yet).
 * - `{ position, quaternion }` framing the active target with the
 *   chapter's authored offset and (optional) up vector.
 *
 * The camera position is computed as `activeTarget + offsetKm`; the
 * camera looks at `activeTarget` with `upWorld` (or `[0, 1, 0]` if the
 * chapter didn't override it) as the world-up axis. Result vectors are
 * fresh allocations — the caller mutates the camera with `.copy()`.
 */
export const resolveChapterDefaultFraming = (
  chapter: ChapterSpec | null,
  activeTarget: Vector3 | null,
): DefaultFramingTarget | null => {
  if (chapter === null) return null;
  if (chapter.defaultFraming === undefined) return null;
  if (activeTarget === null) return null;

  const offset = chapter.defaultFraming.offsetKm;
  const upArr = chapter.defaultFraming.upWorld ?? [0, 1, 0];

  const position = new Vector3(
    activeTarget.x + offset[0],
    activeTarget.y + offset[1],
    activeTarget.z + offset[2],
  );
  const up = new Vector3(upArr[0], upArr[1], upArr[2]);
  const quaternion = lookAtQuaternion(position, activeTarget, up);
  return { position, quaternion };
};

/**
 * Compute a quaternion that orients a camera at `eye` to look at
 * `target` with `up` as the world-up axis. Mirrors the basis math
 * `THREE.Camera.lookAt` uses internally; kept here as a pure function
 * so the helper has no scene-graph dependency.
 */
const lookAtQuaternion = (
  eye: Vector3,
  target: Vector3,
  up: Vector3,
): Quaternion => {
  // Build a look-at basis: z = (eye - target).normalize (right-handed,
  // camera looks down -Z); x = (up × z).normalize; y = z × x. Same
  // convention the camera controller's defaultFramingFallback uses.
  const z = new Vector3().subVectors(eye, target).normalize();
  if (z.lengthSq() === 0) z.set(0, 0, 1);
  const x = new Vector3().crossVectors(up, z).normalize();
  if (x.lengthSq() === 0) {
    z.x += 1e-4;
    x.crossVectors(up, z).normalize();
  }
  const y = new Vector3().crossVectors(z, x);
  const matrix = new Matrix4();
  matrix.makeBasis(x, y, z);
  const q = new Quaternion();
  q.setFromRotationMatrix(matrix);
  return q;
};
