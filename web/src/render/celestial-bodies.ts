/**
 * Celestial body meshes — Sun, eight planets, Earth's Moon (Story 1.13).
 *
 * Builds a `THREE.Mesh` sphere per body at construction time and parents all
 * 10 spheres + one shared `DirectionalLight` (positioned at the Sun's
 * heliocentric origin each frame) under a single `root` `Group`. Per-frame
 * `tick(et)` queries `EphemerisService.getPosition(et, naifId)` for each
 * body and writes the position to `mesh.position`, relying on the engine's
 * floating-origin recenter at the WorldGroup level (Story 1.5 pattern).
 *
 * ## Materials
 *
 * - **Sun**: `MeshBasicMaterial` with `color: 0xffe0a0` (warm-white solar
 *   tone). Unlit by design — the Sun emits light, it does not receive it.
 *   No texture is loaded for the Sun in this story (Story 1.13 dev-decision:
 *   synthesized emissive). A `DirectionalLight` is parented to the Sun mesh
 *   so the planets receive realistic radiometry.
 * - **Planets + Moon**: `MeshStandardMaterial` with `map = <texture>`, no
 *   roughness map (uniform 0.9 roughness — these are diffuse planet
 *   surfaces, not metallic), no normal map. Texture is loaded asynchronously
 *   via `TextureLoaderService`; the material's `map` is set once the
 *   promise resolves, then `needsUpdate = true` fires a GPU re-upload. The
 *   sphere is visible (with a fallback grey colour) before the texture
 *   lands so a slow connection doesn't black-hole the body.
 *
 * ## Float32 leakage
 *
 * The Float64→Float32 cast happens via `renderVec3FromWorld()` in
 * `types/branded.ts` — the only allowed cast site. From this module's
 * perspective every coordinate stays in JS-number (Float64) until it
 * crosses the cast.
 *
 * ## Sphere geometry caching
 *
 * Each body owns one `SphereGeometry`, constructed at `CelestialBodies`
 * construction time and never re-created during `tick`. The defense test
 * `celestial-bodies-defense.test.ts` asserts no `SphereGeometry` is
 * constructed inside `tick()` (zero allocs on the hot path).
 */

import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  DirectionalLight,
  Color,
  type Texture,
} from 'three';

import type { EphemerisService } from '../services/ephemeris-service';
import type { TextureLoaderService } from '../services/texture-loader';
import { renderVec3FromWorld } from '../types/branded';
import {
  BODY_RADII_KM,
  CELESTIAL_BODY_NAIF_IDS,
  SUN_NAIF_ID,
} from '../constants/body-radii';

/** Geometry tessellation. 64×32 is the sweet spot for cruise-zoom visuals. */
const SPHERE_SEGMENTS_WIDTH = 64;
const SPHERE_SEGMENTS_HEIGHT = 32;

/** Color for the Sun's synthesized emissive material (warm solar yellow). */
const SUN_COLOR = 0xffe0a0;

/** Fallback grey for planets whose texture hasn't loaded yet. */
const PLANET_FALLBACK_COLOR = 0x808080;

/**
 * Per-frame directional light intensity. Story 1.13 doesn't yet model
 * inverse-square falloff (deferred to Story 4.3 — physically based shading);
 * a single mid-strength directional light positioned at the Sun gives
 * "lit hemisphere visible" for all eight planets without per-distance
 * tuning.
 */
const SUN_LIGHT_INTENSITY = 2.0;

/**
 * Distance from the Sun at which the directional light's `target` sits.
 * Three.js DirectionalLights compute direction = `position - target`, so
 * positioning the target at the world origin makes the light point from
 * the Sun outward. We re-target to (0,0,0) each frame after applying the
 * Sun's render-space position.
 */
const LIGHT_TARGET_WORLD_ORIGIN: readonly [number, number, number] = [0, 0, 0];

export interface CelestialBodiesOptions {
  /**
   * Texture-loader service shared with the skybox. If omitted, no textures
   * load — planets render with the fallback grey. Used by tests to skip
   * texture I/O.
   */
  textureLoader?: TextureLoaderService;
}

interface CelestialBodyHandle {
  readonly naifId: number;
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial | MeshStandardMaterial;
}

export class CelestialBodies {
  /** Container parented to the engine's WorldGroup. */
  readonly root: Group;
  /** Directional light parented to the Sun mesh; illuminates the planets. */
  readonly sunLight: DirectionalLight;

  private readonly handles: ReadonlyArray<CelestialBodyHandle>;
  private readonly sunHandle: CelestialBodyHandle;
  /** True once every body has had at least one valid position update. */
  private allInitialised = false;

  constructor(options: CelestialBodiesOptions = {}) {
    this.root = new Group();
    this.root.name = 'CelestialBodies';

    const handles: CelestialBodyHandle[] = [];
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      const handle = buildHandle(naifId);
      handles.push(handle);
      this.root.add(handle.mesh);
    }
    this.handles = handles;
    this.sunHandle = handles.find((h) => h.naifId === SUN_NAIF_ID)!;

    this.sunLight = new DirectionalLight(0xffffff, SUN_LIGHT_INTENSITY);
    this.sunLight.name = 'SunDirectionalLight';
    this.sunLight.target.position.set(...LIGHT_TARGET_WORLD_ORIGIN);
    // The light's `target` is a free Object3D that Three.js does not
    // automatically add to the scene — we must add it ourselves so its
    // matrix is updated and the light's direction is correct.
    this.root.add(this.sunLight);
    this.root.add(this.sunLight.target);

    if (options.textureLoader !== undefined) {
      // Fire off the planet+moon texture loads. The Sun has no texture in
      // this story (synthesized emissive). All loads are independent and
      // happen off the hot path.
      for (const handle of this.handles) {
        if (handle.naifId === SUN_NAIF_ID) continue;
        const promise = options.textureLoader.loadBody(handle.naifId);
        if (promise === null) continue;
        promise.then(
          (tex: Texture) => applyTextureToHandle(handle, tex),
          (err: unknown) => {
            // eslint-disable-next-line no-console
            console.warn(
              `[celestial-bodies] texture load failed for NAIF ${handle.naifId}:`,
              err,
            );
          },
        );
      }
    }
  }

  /**
   * Per-frame update. Reads each body's heliocentric position from
   * `EphemerisService` and writes it to the corresponding mesh. Bodies
   * whose chunk hasn't loaded yet hold their previous position (no flicker).
   * The directional light is repositioned to track the Sun each frame.
   */
  tick(et: number, ephemeris: EphemerisService): void {
    let allHaveData = true;
    for (const handle of this.handles) {
      const pos = ephemeris.getPosition(et, handle.naifId);
      if (pos === null) {
        allHaveData = false;
        handle.mesh.visible = this.allInitialised;
        continue;
      }
      const r = renderVec3FromWorld(pos);
      handle.mesh.position.set(r[0], r[1], r[2]);
      handle.mesh.visible = true;
    }

    // Mirror the Sun's position into the directional light so it points
    // outward from the Sun toward the world origin (where the planets
    // cluster, on the scale of one rendered unit). Three.js computes the
    // light's direction as `position - target`; with target at (0,0,0)
    // the light points from the Sun toward the origin, which for
    // heliocentric scenes is "into the inner solar system" — that's
    // exactly what we want.
    const sunPos = this.sunHandle.mesh.position;
    this.sunLight.position.set(sunPos.x, sunPos.y, sunPos.z);

    if (allHaveData) this.allInitialised = true;
  }

  /** Test helper — expose a handle by NAIF ID for assertion. */
  _peekHandle(naifId: number): CelestialBodyHandle | undefined {
    return this.handles.find((h) => h.naifId === naifId);
  }

  /** True once every body has had at least one ephemeris update. */
  get allHaveInitialPosition(): boolean {
    return this.allInitialised;
  }
}

const buildHandle = (naifId: number): CelestialBodyHandle => {
  const radius = BODY_RADII_KM[naifId];
  if (radius === undefined) {
    throw new Error(`[celestial-bodies] no radius for NAIF ${naifId}`);
  }
  const geometry = new SphereGeometry(
    radius,
    SPHERE_SEGMENTS_WIDTH,
    SPHERE_SEGMENTS_HEIGHT,
  );
  let material: MeshBasicMaterial | MeshStandardMaterial;
  if (naifId === SUN_NAIF_ID) {
    // The Sun is unlit and luminous — MeshBasicMaterial bypasses the
    // lighting pipeline entirely so the Sun stays bright regardless of
    // where the directional light points. The "emissive" name is
    // architecture-canonical (Story 1.13 dev-decision shape #2: solid
    // emissive yellow), implemented here as `color` on the unlit
    // material because MeshBasicMaterial has no `emissive` slot.
    material = new MeshBasicMaterial({ color: new Color(SUN_COLOR) });
  } else {
    material = new MeshStandardMaterial({
      color: new Color(PLANET_FALLBACK_COLOR),
      roughness: 0.9,
      metalness: 0.0,
    });
  }
  const mesh = new Mesh(geometry, material);
  mesh.name = `celestial-${naifId}`;
  // Bodies start hidden until the first ephemeris tick lands a real
  // position; otherwise they'd render at the world origin one frame.
  mesh.visible = false;
  return { naifId, mesh, material };
};

const applyTextureToHandle = (handle: CelestialBodyHandle, texture: Texture): void => {
  if (handle.material instanceof MeshStandardMaterial) {
    handle.material.map = texture;
    // Replace the fallback grey tint with white so the texture isn't
    // multiplied to half-brightness.
    handle.material.color.set(0xffffff);
    handle.material.needsUpdate = true;
  }
  // The Sun's MeshBasicMaterial gets no texture (Story 1.13 dev-decision).
};
