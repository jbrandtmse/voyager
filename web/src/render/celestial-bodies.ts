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
import type { TextureLoaderService, TextureTier } from '../services/texture-loader';
import { renderVec3FromWorld } from '../types/branded';
import {
  BODY_RADII_KM,
  CELESTIAL_BODY_NAIF_IDS,
  MOON_NAIF_IDS_BY_PARENT,
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
 * Story 4.3 — texture-tier ordering used by `upgradePlanetTexture` to
 * enforce monotonic ratcheting (no downgrade). Higher rank = larger
 * texture = more detail.
 */
const TIER_RANK: Readonly<Record<TextureTier, number>> = Object.freeze({
  '2k': 0,
  '4k': 1,
  '8k': 2,
});

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
  // Story 4.3 AC4 — retained so `upgradePlanetTexture(bodyId)` can fire
  // an explicit-tier load on SOI entry. `null` when the constructor was
  // called without a textureLoader (tests, headless harnesses) — the
  // upgrade path is a silent no-op in that case.
  private readonly textureLoader: TextureLoaderService | null;
  // Story 4.3 AC4 — the current resolved tier per body. Starts at `'2k'`
  // (Story 1.13 cruise default) and ratchets upward on
  // `upgradePlanetTexture(bodyId, '8k'|'4k')` calls. We never DOWNGRADE
  // (NFR-C6 "no lazy upgrade later in the session" — symmetric "no lazy
  // de-upgrade" per the story's Out-of-Scope note, so the texture stays
  // at the highest tier loaded for the session).
  private readonly currentTierByNaifId = new Map<number, TextureTier>();
  // Story 4.3 T5 — dynamically managed moon meshes. Keys are moon NAIF
  // IDs (501..504, 606..608, 701..705, 801). Moons are constructed on
  // `MissionPhaseFSM.soiEntered` events for the parent gas giant and
  // removed on `soiExited` (default per AC5; the alternative was
  // LOD3-silhouette retain, which we did not select). The CRUISE-time
  // 10 bodies live in `this.handles` and are NEVER touched by this map.
  private readonly moonHandles = new Map<number, CelestialBodyHandle>();

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

    this.textureLoader = options.textureLoader ?? null;
    if (this.textureLoader !== null) {
      // Fire off the planet+moon texture loads. The Sun has no texture in
      // this story (synthesized emissive). All loads are independent and
      // happen off the hot path.
      for (const handle of this.handles) {
        if (handle.naifId === SUN_NAIF_ID) continue;
        const promise = this.textureLoader.loadBody(handle.naifId);
        if (promise === null) continue;
        // Cruise tier defaults to 2k (`selectTier` returns 2k unconditionally).
        // Track this in the per-body tier map so `upgradePlanetTexture` can
        // skip a redundant call if the target tier is already loaded.
        this.currentTierByNaifId.set(handle.naifId, '2k');
        promise.then(
          (tex: Texture) => applyTextureToHandle(handle, tex),
          (err: unknown) => {
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
   * Story 4.3 AC4 — async-load the higher-tier KTX2 texture for a single
   * planet and atomically swap it into the body's material. Called by
   * `RenderEngine.upgradePlanetTexture(bodyId)`, which in turn is invoked
   * from the SOI-entry subscriber on `MissionPhaseFSM` (the integration
   * AC's chain).
   *
   * Idempotence + monotonicity:
   *
   *   - If the body already has `targetTier` (or a higher tier) loaded,
   *     this is a no-op. Tier ordering: 2k < 4k < 8k.
   *   - If a higher tier was already loaded for this body, the call is
   *     also a no-op (we never DOWNGRADE — per the story's Out-of-Scope
   *     note: "Reverse-scrub texture-tier de-escalation ... out of scope;
   *     the texture stays at the highest tier loaded for the session").
   *
   * Failure modes (all silent per UX-DR32 / NFR-C6):
   *
   *   - Unknown NAIF / no slug → no-op.
   *   - No textureLoader configured (test harness) → no-op.
   *   - Load fails → console.warn, existing texture remains, no retry.
   *   - Material has no `map` slot (e.g. Sun's MeshBasicMaterial) → no-op.
   *
   * Atomic swap discipline (AC4 wording):
   *
   *   On load completion the body's `material.map` is replaced with the
   *   new texture and the OLD texture is disposed on the same tick
   *   (`oldTexture.dispose(); material.map = newTexture;
   *   material.needsUpdate = true`). Three.js's WebGL backend uploads
   *   the new GPU buffer lazily on the next render call, so the swap is
   *   atomic from the application's perspective: at no point does
   *   `mesh.material.map` reference both textures simultaneously, and
   *   the old texture's GPU storage is released before the next frame.
   */
  upgradePlanetTexture(bodyId: number, targetTier: TextureTier = '4k'): void {
    if (this.textureLoader === null) return;
    if (bodyId === SUN_NAIF_ID) return; // Sun has no texture (synthesized emissive).
    const handle = this.handles.find((h) => h.naifId === bodyId);
    if (handle === undefined) return;
    if (!(handle.material instanceof MeshStandardMaterial)) return;
    const current = this.currentTierByNaifId.get(bodyId) ?? '2k';
    if (TIER_RANK[current] >= TIER_RANK[targetTier]) return; // already at or above target
    // Resolve the slug → URL via the loader's body-keyed entry point. We
    // request the target tier explicitly; the loader picks the KTX2 path
    // automatically based on the resolved file extension.
    const promise = this.textureLoader.loadBody(bodyId, { tier: targetTier });
    if (promise === null) return;
    // Tentatively mark the upgrade in flight so a second
    // upgradePlanetTexture call for the same body during the load doesn't
    // kick a duplicate fetch. We commit the final tier only on success.
    this.currentTierByNaifId.set(bodyId, targetTier);
    promise.then(
      (tex: Texture) => {
        // Atomic swap: dispose old, install new, flag for re-upload.
        if (handle.material instanceof MeshStandardMaterial) {
          const oldTex = handle.material.map;
          handle.material.map = tex;
          handle.material.color.set(0xffffff);
          handle.material.needsUpdate = true;
          if (oldTex !== null && oldTex !== tex) {
            oldTex.dispose();
          }
        }
      },
      (err: unknown) => {
        // Revert the in-flight tier marker so a future upgrade attempt
        // can retry. Per UX-DR32 there is no UI hint; per NFR-C6 there is
        // also no automatic retry — the FSM may re-fire the event on a
        // reverse-then-forward scrub, in which case a fresh load attempt
        // proceeds (cache miss because the failure dropped the promise).
        this.currentTierByNaifId.set(bodyId, current);
        console.warn(
          `[celestial-bodies] texture upgrade failed for NAIF ${bodyId} → ${targetTier}:`,
          err,
        );
      },
    );
  }

  /** Test helper: read the current resolved tier for a body. */
  _peekTier(naifId: number): TextureTier | undefined {
    return this.currentTierByNaifId.get(naifId);
  }

  /**
   * Story 4.3 T5 — construct moon meshes for the parent gas giant's
   * satellite system and attach them to the scene-graph. Called on
   * `MissionPhaseFSM.soiEntered` events; idempotent — re-adding an
   * already-present moon is a no-op (the existing handle is preserved).
   *
   * For each moon in `MOON_NAIF_IDS_BY_PARENT[parentNaifId]`:
   *   1. Construct a SphereGeometry at `BODY_RADII_KM[moonNaifId]`.
   *   2. Attach a MeshStandardMaterial with the fallback grey color.
   *   3. Fire the 2K KTX2 texture load via the texture loader (if wired).
   *      Hyperion (NAIF 607) is treated specially — its `BODY_TEXTURE_SLUGS`
   *      entry is absent (`loadBody` returns null synchronously), so the
   *      fallback grey is retained. See `body-radii.ts § MOON_NAIF_IDS_BY_PARENT`
   *      docstring + `MISSION_FACTS.md § Moon physical properties` for the
   *      Hyperion-deferral rationale (no public-domain equirectangular map).
   *   4. Add the mesh to `this.root` so the existing floating-origin
   *      recenter applies to it.
   *
   * The mesh starts hidden until the next `tick(et)` call lands a real
   * position from `EphemerisService.getPosition(et, moonNaifId)`. If the
   * ephemeris service doesn't have moon trajectory chunks loaded (the
   * moon SPK kernels need to be on disk for the bake), the mesh stays
   * hidden — degraded-gracefully behaviour matches the cruise-body
   * "hold-previous on cache miss" pattern.
   */
  addMoonsFor(parentNaifId: number): void {
    const moonIds = MOON_NAIF_IDS_BY_PARENT[parentNaifId];
    if (moonIds === undefined) return;
    for (const moonNaifId of moonIds) {
      if (this.moonHandles.has(moonNaifId)) continue; // already present
      const handle = buildHandle(moonNaifId);
      this.moonHandles.set(moonNaifId, handle);
      this.root.add(handle.mesh);
      // Fire the 2K texture load (if wired). loadBody returns null for
      // bodies without a slug (Hyperion → null → silent skip → grey
      // fallback retained).
      if (this.textureLoader !== null) {
        const promise = this.textureLoader.loadBody(moonNaifId);
        if (promise === null) continue;
        this.currentTierByNaifId.set(moonNaifId, '2k');
        promise.then(
          (tex: Texture) => applyTextureToHandle(handle, tex),
          (err: unknown) => {
            console.warn(
              `[celestial-bodies] moon texture load failed for NAIF ${moonNaifId}:`,
              err,
            );
          },
        );
      }
    }
  }

  /**
   * Story 4.3 T5 — remove moon meshes for the parent gas giant's
   * satellite system from the scene-graph. Called on
   * `MissionPhaseFSM.soiExited` events; idempotent — removing already-
   * absent moons is a no-op.
   *
   * Per AC5 the default behaviour is "removed" (vs "rendered at LOD3
   * silhouette only"). This matches the Three.js memory-pressure
   * discipline used by SpacecraftModels (Story 3.3): meshes that aren't
   * visible aren't kept around. Per-mesh dispose:
   *
   *   - Detach from `this.root`.
   *   - Dispose the geometry (frees the GPU buffer).
   *   - Dispose the texture (if a material map was attached).
   *   - Dispose the material itself.
   *   - Clear the tier-tracker entry so a future re-entry fires a fresh
   *     load (per NFR-C6's no-de-escalation, but: re-entering an SOI
   *     after a session-level disposal is functionally equivalent to
   *     first-entry, not a "de-escalation").
   */
  removeMoonsFor(parentNaifId: number): void {
    const moonIds = MOON_NAIF_IDS_BY_PARENT[parentNaifId];
    if (moonIds === undefined) return;
    for (const moonNaifId of moonIds) {
      const handle = this.moonHandles.get(moonNaifId);
      if (handle === undefined) continue;
      this.moonHandles.delete(moonNaifId);
      this.root.remove(handle.mesh);
      handle.mesh.geometry.dispose();
      if (handle.material instanceof MeshStandardMaterial) {
        const tex = handle.material.map;
        if (tex !== null) tex.dispose();
      }
      handle.material.dispose();
      this.currentTierByNaifId.delete(moonNaifId);
    }
  }

  /** Story 4.3 T5 — true iff the moon mesh for `moonNaifId` is currently in the scene. */
  hasMoon(moonNaifId: number): boolean {
    return this.moonHandles.has(moonNaifId);
  }

  /**
   * Story 4.3 T5 — test helper: read a moon handle for assertions on
   * the mesh / material. Returns undefined for moons not currently in
   * the scene. Mirrors `_peekHandle` for the cruise bodies.
   */
  _peekMoon(moonNaifId: number): CelestialBodyHandle | undefined {
    return this.moonHandles.get(moonNaifId);
  }

  /**
   * Per-frame update. Reads each body's heliocentric position from
   * `EphemerisService` and writes it to the corresponding mesh. Bodies
   * whose chunk hasn't loaded yet hold their previous position (no flicker).
   * The directional light is repositioned to track the Sun each frame.
   *
   * Story 4.3 T5: in addition to the 10 cruise bodies, this loop also
   * ticks any currently-active moon meshes (added via `addMoonsFor`).
   * Moons whose trajectory chunk hasn't loaded stay hidden — the bake-side
   * extension to add the 12 moon NAIF IDs to `bake/src/bake_trajectories.py`
   * is the missing dependency; until that lands, moons remain invisible
   * even though their meshes have been constructed. See the Story 4.3
   * Dev Notes for the bake-pipeline follow-up.
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
    // Story 4.3 T5 — moon meshes (encounter-active subset). Same null-
    // tolerant pattern as the cruise bodies: hide on cache miss. The moon
    // meshes do NOT block the `allHaveData → allInitialised` latch —
    // that's reserved for the cruise body set so the first paint can
    // commit at boot without waiting for any encounter to be active.
    for (const handle of this.moonHandles.values()) {
      const pos = ephemeris.getPosition(et, handle.naifId);
      if (pos === null) {
        handle.mesh.visible = false;
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
