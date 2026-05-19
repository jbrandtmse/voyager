/**
 * Milky Way skybox (Story 1.13).
 *
 * Loads the `milky-way-2k.png` equirectangular texture via
 * `TextureLoaderService` and attaches a large inverted sphere (back-side
 * rendering) to the engine's `SkyboxGroup`. The sphere sits at render-space
 * origin and is intentionally NOT recentered by the floating-origin pass
 * (Story 1.5 Architecture lines 374–376) — SkyboxGroup is the special-case
 * scene-graph branch that stays fixed relative to the camera so the
 * background stars do not parallax-track.
 *
 * Why a sphere and not `scene.background`? `scene.background = texture` is
 * the lighter-weight approach for equirectangular skyboxes, but it doesn't
 * respect Three.js scene-graph membership — the background renders before
 * any scene object regardless of group, and we cannot easily inhibit the
 * floating-origin recenter from affecting it (it's a renderer concern, not
 * a scene-graph concern). A `Mesh` with `BackSide` rendering inside
 * `SkyboxGroup` keeps the architectural contract — "skybox lives in
 * SkyboxGroup, not WorldGroup" — clean and inspectable.
 *
 * ## Sphere radius
 *
 * The skybox sphere is sized at `SKYBOX_RADIUS_KM` (≈ FAR_PLANE_KM × 0.95)
 * so it sits just inside the far clip plane. Reverse-Z keeps it visually
 * "at infinity" because the perspective projection compresses any
 * sufficiently-large depth into the same screen-space depth bucket.
 *
 * The sphere is rendered with `side: BackSide` so the camera (which sits
 * at render-space origin) sees the inside surface of the sphere — i.e.
 * the equirectangular texture wrapped around it. The texture's seam runs
 * along the +X meridian by default; no rotation is applied (the Milky Way
 * panorama's galactic-coordinate orientation lands the Galactic Centre
 * near the South Ecliptic Pole, which is the convention).
 *
 * ## Material
 *
 * `MeshBasicMaterial` (unlit) — the skybox emits its own brightness; the
 * directional light from the Sun must not affect it.
 *
 * ## Texture deferral note
 *
 * Story 1.13 ships a PNG-2k skybox; Story 4.3 swaps it to KTX2-ETC1S for
 * a ~4× GPU memory reduction. The call site here is format-agnostic — it
 * receives a `THREE.Texture` from `TextureLoaderService`. See
 * `services/texture-loader.ts` for the KTX2 deferral architectural
 * promise.
 */

import {
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  BackSide,
  type Texture,
} from 'three';

import { FAR_PLANE_KM } from './constants';
import type { TextureLoaderService } from '../services/texture-loader';

/**
 * Skybox sphere radius in render-space km. Sits at 95% of the far clip so
 * the texture is fully visible regardless of depth-buffer mode.
 */
export const SKYBOX_RADIUS_KM = FAR_PLANE_KM * 0.95;

/** Coarser tessellation than the planet spheres — pixels are linear here. */
const SKYBOX_SEGMENTS_WIDTH = 64;
const SKYBOX_SEGMENTS_HEIGHT = 32;

export interface SkyboxOptions {
  /**
   * Texture-loader service. If omitted, the skybox renders as a uniform
   * dark-grey (no panorama) — useful for tests and for the precision-smoke
   * dev mode where the texture is not desired.
   */
  textureLoader?: TextureLoaderService;
}

/**
 * Milky Way skybox sphere. Construct with `new Skybox(opts)` and add the
 * `root` group as a child of `RenderEngine.skyboxGroup`.
 */
export class Skybox {
  /** Container to add to the engine's SkyboxGroup. */
  readonly root: Group;
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;

  constructor(options: SkyboxOptions = {}) {
    this.root = new Group();
    this.root.name = 'Skybox';

    const geometry = new SphereGeometry(
      SKYBOX_RADIUS_KM,
      SKYBOX_SEGMENTS_WIDTH,
      SKYBOX_SEGMENTS_HEIGHT,
    );
    this.material = new MeshBasicMaterial({
      side: BackSide,
      color: 0x1a1a22, // dark cosmic grey pre-texture (fallback)
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = 'SkyboxSphere';
    this.root.add(this.mesh);

    if (options.textureLoader !== undefined) {
      options.textureLoader.loadSkybox().then(
        (tex: Texture) => {
          this.material.map = tex;
          // Reset the fallback colour so the texture isn't multiplied
          // to ~10% brightness.
          this.material.color.setHex(0xffffff);
          this.material.needsUpdate = true;
        },
        (err: unknown) => {
          // eslint-disable-next-line no-console
          console.warn('[skybox] Milky Way texture load failed:', err);
        },
      );
    }
  }

  /** True once the skybox texture has been applied. */
  get hasTexture(): boolean {
    return this.material.map !== null;
  }
}
