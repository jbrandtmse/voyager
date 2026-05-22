/**
 * Story 3.5 — Narrow-angle camera boresight cone renderer.
 *
 * Constructs and parents ONE wireframe cone per spacecraft to the active LOD's
 * `SCAN_PLATFORM` named node. The cone's local `+Z` axis is aligned with the
 * NA-camera boresight `VG{1,2}_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM` from
 * `services/fk-constants.ts` (which is `[0,0,1]` because the VG{1,2}_ISSNA
 * TKFRAME is identity-relative-to-platform per the kernel — see Story 3.2
 * derivation). Three.js scene-graph parenting propagates the platform's
 * per-frame quaternion (written by `AttitudeApplier`) onto the cone every
 * frame automatically — no per-frame quaternion compose runs here.
 *
 * Architecture & ADR compliance:
 *   - ADR-0008 (Three.js WebGLRenderer): native ConeGeometry + EdgesGeometry +
 *     LineSegments + LineBasicMaterial. No custom shader.
 *   - ADR-0015 (no global store): instance is constructor-DI'd from `main.ts`
 *     and ticked from the existing `engine.onFrame` callback.
 *   - ADR-0026 (TS 6.x strict, zero `any`): all surfaces strictly typed.
 *   - Architecture line 382 (Decision 3g): wireframe cone parented to
 *     `SCAN_PLATFORM`; NA half-angle = 0.21°; thin, low-saturation,
 *     semi-transparent.
 *
 * Wide-angle camera (ISSWA, -31102 / -32102) is intentionally OUT OF SCOPE for
 * v1 per ADR-0028 (this story's ADR). Only the NA boresight cone renders.
 *
 * Lifecycle:
 *   - `attach(spacecraftModels)` — constructs the geometry, material, and
 *     LineSegments mesh ONCE per spacecraft. Called from `main.ts` once the
 *     `spacecraftModels.load(...)` promise resolves (the LOD chain MUST be
 *     populated before SCAN_PLATFORM can be resolved).
 *   - `tick(spacecraftModels)` — per-frame LOD-swap re-parenting only. The
 *     platform quaternion itself is applied by `AttitudeApplier`; this method
 *     does NOT touch quaternions.
 *   - `dispose()` — module-teardown only (engine teardown). NEVER called in
 *     the per-frame path.
 *
 * AC3 memory hygiene: EXACTLY 2 cone meshes exist in the scene graph total
 * (one per spacecraft), regardless of how many LOD levels are loaded. The
 * mesh is re-parented across LOD swaps, not re-created.
 */

import {
  ConeGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Color,
  type Object3D,
} from 'three';

import type { SpacecraftModels, SpacecraftHandle } from './spacecraft-models';

/**
 * NA camera half-angle in degrees. Per architecture line 382 + PRD: the NA
 * camera FOV is 0.42° × 0.42°, so the half-angle is 0.21°. The cone's base
 * radius is `length * tan(halfAngleRadians)`.
 */
export const NA_CAMERA_HALF_ANGLE_DEG = 0.21;

/**
 * Cone length in render-space units (km — Story 1.5 floating-origin contract).
 *
 * 0.001 km = 1 m. Rationale (per AC2 + story Dev Notes):
 *   - SpacecraftModels' SPACECRAFT_RENDER_SCALE_KM = 0.01 (10 m per mesh unit)
 *     means the rendered spacecraft body is on the order of 0.01–0.05 km.
 *   - A 1000 km cone (the epic's suggestion) would dwarf the spacecraft at
 *     cruise zoom and obscure the body. 0.001 km is approximately the same
 *     scale as the spacecraft body — visible without occluding it.
 *   - The cone IS attached to SCAN_PLATFORM and inherits its scale chain
 *     (SCAN_PLATFORM is a child of the LOD scene which is scaled by
 *     SPACECRAFT_RENDER_SCALE_KM at the LOD-scene root level). The actual
 *     world-space length is therefore `CONE_LENGTH_KM * SPACECRAFT_RENDER_SCALE_KM`
 *     = 0.001 × 0.01 = 1e-5 km = 1 cm in world km. Visible at zoom levels
 *     where the spacecraft body fills more than a few pixels — exactly the
 *     band where the cone's pointing direction reads as meaningful.
 *
 * If a future story wants a long-cruise "where-it-points" cone visible from
 * AU distances, that's a separate variant (likely a thin Line from platform
 * origin extending to infinity along boresight); the v1 cone is for
 * near-cruise + encounter inspection.
 */
export const CONE_LENGTH_KM = 0.001;

/**
 * `ConeGeometry` parameter — number of segments around the base circle.
 * 16 is smooth enough for a wireframe edge to read as circular without
 * geometry waste. heightSegments=1 because EdgesGeometry only renders the
 * silhouette + base; intermediate height rings add no visible edges.
 */
const CONE_RADIAL_SEGMENTS = 16;
const CONE_HEIGHT_SEGMENTS = 1;

/**
 * Material opacity per AC2 — semi-transparent (the cone must NOT paint
 * opaque; the spacecraft body behind it must be visible).
 */
const CONE_OPACITY = 0.5;

/**
 * Fallback hex color if `--v-color-accent` is unset (no document context, or
 * tokens not loaded). The Story 1.7 design-system token is the canonical
 * value; this fallback only fires in test environments where the stylesheet
 * isn't in the DOM.
 */
const FALLBACK_ACCENT_COLOR = '#5fa3ff';

/**
 * Read a CSS variable from `:root`. Mirror of Story 1.12's pattern in
 * `spacecraft-models.ts:readCssVar`. Returns the trimmed value, or the
 * `fallback` when the variable is unset or the document is not available
 * (e.g. in happy-dom tests that don't load the tokens stylesheet).
 */
const readCssVar = (name: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  const root = document.documentElement;
  if (root === null) return fallback;
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
};

/**
 * Per-spacecraft cone state. The geometry / material instances are retained
 * here so `dispose()` can clean them up at teardown; the `lastPlatform`
 * reference is the LOD-swap re-parenting key.
 */
interface PerSpacecraftCone {
  cone: LineSegments;
  coneGeometrySource: ConeGeometry;
  edgesGeometry: EdgesGeometry;
  material: LineBasicMaterial;
  lastPlatform: Object3D | null;
  lastLodLevel: number | null;
}

export class BoresightRenderer {
  private v1: PerSpacecraftCone | null = null;
  private v2: PerSpacecraftCone | null = null;
  private attached = false;

  /**
   * Construct ONE cone mesh per spacecraft and parent it to that spacecraft's
   * active SCAN_PLATFORM node. Must be called AFTER
   * `spacecraftModels.load(...)` has resolved (otherwise the named hierarchy
   * is not present and `getObjectByName` returns undefined).
   *
   * Idempotent on the second call — subsequent invocations are a no-op (the
   * cone already exists). Tests that exercise re-attach must call `dispose()`
   * first.
   */
  attach(spacecraftModels: SpacecraftModels): void {
    if (this.attached) return;

    this.v1 = this.buildCone(spacecraftModels.getHandle('voyager-1'));
    this.v2 = this.buildCone(spacecraftModels.getHandle('voyager-2'));
    this.attached = true;
  }

  /**
   * Per-frame tick. Checks whether the LOD level has changed for each
   * spacecraft; on mismatch, re-parents the existing cone mesh from the old
   * SCAN_PLATFORM to the new level's SCAN_PLATFORM. The cone mesh INSTANCE
   * survives the swap (AC3 memory hygiene).
   *
   * Quaternion propagation is handled by Three.js scene-graph parenting:
   * `AttitudeApplier.tick()` (which runs immediately before this in
   * `engine.onFrame`) writes `SCAN_PLATFORM.quaternion`; the cone's
   * `matrixWorld` reflects that rotation on the next render's
   * `scene.updateMatrixWorld(true)` traversal.
   */
  tick(spacecraftModels: SpacecraftModels): void {
    if (!this.attached) return;
    if (this.v1 !== null) {
      this.maybeReparent(this.v1, spacecraftModels.getHandle('voyager-1'));
    }
    if (this.v2 !== null) {
      this.maybeReparent(this.v2, spacecraftModels.getHandle('voyager-2'));
    }
  }

  /**
   * Module-teardown: dispose geometries + material. Never call inside the
   * per-frame path.
   */
  dispose(): void {
    const disposeOne = (cone: PerSpacecraftCone | null): void => {
      if (cone === null) return;
      const parent = cone.cone.parent;
      if (parent !== null) parent.remove(cone.cone);
      cone.coneGeometrySource.dispose();
      cone.edgesGeometry.dispose();
      cone.material.dispose();
    };
    disposeOne(this.v1);
    disposeOne(this.v2);
    this.v1 = null;
    this.v2 = null;
    this.attached = false;
  }

  /**
   * Test-only — true if `attach()` has been called and not yet disposed.
   */
  __isAttached(): boolean {
    return this.attached;
  }

  /**
   * Test-only — retrieve the cone mesh for a spacecraft. Returns null when
   * `attach()` has not run.
   */
  __getCone(id: 'voyager-1' | 'voyager-2'): LineSegments | null {
    const state = id === 'voyager-1' ? this.v1 : this.v2;
    return state?.cone ?? null;
  }

  // === Internals ============================================================

  /**
   * Construct one spacecraft's boresight cone. Geometry, material, and mesh
   * are created ONCE here and never re-created — even across LOD swaps.
   */
  private buildCone(handle: SpacecraftHandle): PerSpacecraftCone {
    // AC2 — cone geometry. `ConeGeometry(radius, height, radialSegments,
    // heightSegments)`. Three.js's default cone orients along +Y; we need
    // the apex pointing along -Z and base extending to +Z so the "boresight
    // direction" (from platform origin outward) lies along local +Z (matches
    // `VG{1,2}_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM = [0, 0, 1]`).
    //
    // The default ConeGeometry has its apex at +Y and base at -Y; we want
    // apex at platform origin and base at +Z·length. The geometry transform
    // sequence:
    //   1. translateY(-length/2) so the apex is at the origin (not at +Y/2)
    //   2. rotateX(-90°) so the +Y axis maps to +Z (base sweeps from origin
    //      out along +Z)
    //
    // After these two operations the cone's apex is at (0,0,0) and the base
    // disk is at z = +length, centered on the +Z axis — exactly what we want
    // for a boresight cone whose apex sits at the platform origin (the
    // VG{1,2}_ISSNA TKFRAME is identity-relative-to-platform, so the camera's
    // entrance pupil is at the same point as the platform pivot).
    const halfAngleRad = MathUtils.degToRad(NA_CAMERA_HALF_ANGLE_DEG);
    // CRITICAL: build the cone at a UNIT scale (length=1, radius=tan(half))
    // and scale it down to CONE_LENGTH_KM via the LineSegments mesh's
    // `scale` after construction. Building directly at radius=3.7e-6 km
    // makes the lateral triangle normals numerically indistinguishable, and
    // EdgesGeometry's threshold pass (computing normals from cross products
    // of edge vectors) drops every face-to-face edge, producing an empty
    // line set.
    const unitRadius = Math.tan(halfAngleRad);
    const unitLength = 1.0;
    // openEnded=false — keep the base cap so EdgesGeometry has the
    // base-cap-vs-lateral edge angle (~90° at the rim circle) to detect.
    // With unitRadius ≈ 0.00366 and unitLength = 1, the lateral facets
    // are still narrow but well above float epsilon — EdgesGeometry now
    // emits the silhouette + base ring.
    const coneGeometry = new ConeGeometry(
      unitRadius,
      unitLength,
      CONE_RADIAL_SEGMENTS,
      CONE_HEIGHT_SEGMENTS,
      false,
    );
    coneGeometry.translate(0, -unitLength / 2, 0);
    coneGeometry.rotateX(-Math.PI / 2);

    // AC2 — wrap in EdgesGeometry so only the silhouette + base circle render
    // as line segments (not the filled cone surface). Tighter threshold
    // (0.1°) so narrow lateral facets still emit silhouette lines on the
    // far-side; the cap-vs-lateral rim edges are always picked up.
    const edges = new EdgesGeometry(coneGeometry, 0.1);

    // AC2 — material: thin, semi-transparent, --v-color-accent.
    const accentHex = readCssVar('--v-color-accent', FALLBACK_ACCENT_COLOR);
    const material = new LineBasicMaterial({
      color: new Color(accentHex),
      transparent: true,
      opacity: CONE_OPACITY,
    });

    const cone = new LineSegments(edges, material);
    cone.name = `${handle.id}-na-boresight-cone`;
    // Apply the world-space scale from unit geometry → CONE_LENGTH_KM. The
    // cone's local transform stays simple (just a uniform scale); the
    // platform's quaternion still propagates via the parent chain.
    cone.scale.setScalar(CONE_LENGTH_KM);
    // Beyond the scale, we never directly mutate position / quaternion on
    // the cone mesh — those flow from the SCAN_PLATFORM parent.

    // Parent to the spacecraft's active SCAN_PLATFORM. The resolution
    // strategy here MUST mirror Story 3.4's AttitudeApplier AC5 LOD-aware
    // resolution pattern: when handle.lod !== null we resolve against the
    // active LOD level's subtree, NOT against handle.group (which would
    // depth-first-walk into ALL LOD levels and return the first match).
    const platform = resolveScanPlatform(handle);
    let lastLodLevel: number | null = null;
    if (platform !== null) {
      platform.add(cone);
      lastLodLevel = handle.lod !== null ? handle.lod.getCurrentLevel() : null;
    }
    // If platform === null (malformed GLB without SCAN_PLATFORM, or pre-load
    // attach), the cone is constructed but un-parented; the next tick() will
    // attempt to resolve again via maybeReparent's "lastPlatform === null"
    // path.

    return {
      cone,
      coneGeometrySource: coneGeometry,
      edgesGeometry: edges,
      material,
      lastPlatform: platform,
      lastLodLevel,
    };
  }

  /**
   * Per-frame LOD-swap check. Reads the spacecraft's current LOD level; on
   * mismatch with the cached level (or when the cached platform reference
   * was null), resolves the new SCAN_PLATFORM and re-parents the cone.
   *
   * The level-equality fast path is one integer compare per spacecraft per
   * tick — cheaper than walking `getObjectByName` every frame.
   */
  private maybeReparent(state: PerSpacecraftCone, handle: SpacecraftHandle): void {
    const currentLevel =
      handle.lod !== null ? handle.lod.getCurrentLevel() : null;

    if (currentLevel === state.lastLodLevel && state.lastPlatform !== null) {
      // No-op — level unchanged, still parented to the right platform.
      return;
    }

    const nextPlatform = resolveScanPlatform(handle);
    if (nextPlatform === null) {
      // SCAN_PLATFORM missing on the current LOD level. Hold previous —
      // the cone stays on its old parent (or stays un-parented if attach
      // never resolved one). Mirrors the AttitudeApplier "null cache
      // persists" pattern.
      state.lastLodLevel = currentLevel;
      return;
    }

    if (state.lastPlatform !== nextPlatform) {
      // Re-parent: remove from old, add to new. Three.js's `add` handles
      // the remove-from-prior-parent step internally, but doing it
      // explicitly is more legible.
      if (state.lastPlatform !== null) {
        state.lastPlatform.remove(state.cone);
      }
      nextPlatform.add(state.cone);
      state.lastPlatform = nextPlatform;
    }
    state.lastLodLevel = currentLevel;
  }
}

/**
 * Resolve a spacecraft's active SCAN_PLATFORM node. Uses the LOD-aware
 * resolution pattern Story 3.4's AttitudeApplier established (see attitude-
 * applier.ts § "First-tick (or post-LOD-swap) resolution"): when
 * `handle.lod !== null && currentLevel >= 0`, search against
 * `handle.lod.levels[currentLevel].object` — NOT `handle.group` — because
 * `getObjectByName` on `handle.group` walks into ALL LOD levels (each of
 * which has its own SCAN_PLATFORM child) and returns the first match in
 * traversal order, which may not be the visible level's node.
 *
 * The legacy single-LOD fallback (handle.lod === null, Story 3.3 AC5
 * graceful degradation) safely walks `handle.group`.
 *
 * Returns null on a malformed GLB lacking the named node — the cone stays
 * un-parented and the renderer holds the previous resolution.
 */
const resolveScanPlatform = (handle: SpacecraftHandle): Object3D | null => {
  if (handle.lod !== null) {
    const level = handle.lod.getCurrentLevel();
    if (level >= 0) {
      const scene = handle.lod.levels[level]?.object;
      if (scene !== undefined) {
        return scene.getObjectByName('SCAN_PLATFORM') ?? null;
      }
    }
  }
  return handle.group.getObjectByName('SCAN_PLATFORM') ?? null;
};
