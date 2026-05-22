/**
 * Story 3.4 — Per-frame attitude application for V1 + V2 spacecraft.
 *
 * Reads `Quaternion | null` results from `AttitudeService.getBusQuat` and
 * `getPlatformQuat` for each spacecraft each frame and writes them into the
 * BUS / SCAN_PLATFORM `Object3D.quaternion` instances inside the loaded LOD
 * subtree. The applier is the FIRST per-frame consumer of both Story 3.2's
 * AttitudeService and Story 3.3's named hierarchy — the wire-up is the
 * load-bearing contract per voyager-skill-rules Rule 1 (Integration AC8).
 *
 * Zero-allocation contract (AC3, NFR-P2 / NFR-R5):
 *   - `Quaternion.copy(q)` writes into the EXISTING `Object3D.quaternion`
 *     instance — we never replace the node's quaternion reference. The
 *     returned `Quaternion` from AttitudeService is consumed and dropped
 *     each frame; V8's nursery sweep handles that garbage cheaply.
 *   - `getObjectByName('BUS' | 'SCAN_PLATFORM')` traversal happens at MOST
 *     once per spacecraft per LOD-level transition; the resolved
 *     `Object3D` references are cached in `PerSpacecraftCache`.
 *
 * LOD-swap re-resolution (AC5):
 *   - `THREE.LOD` swaps which child is visible based on camera distance
 *     during `renderer.render`. Each LOD level has its OWN BUS /
 *     SCAN_PLATFORM / HGA named subtree (Story 3.3 AC1). When the active
 *     level changes, cached references point at a DETACHED subtree.
 *   - Detection strategy (per AC5 path (b)): each tick, read
 *     `handle.lod.getCurrentLevel()` and compare to the cached level. On
 *     mismatch, invalidate the cached `busNode` + `platformNode` and
 *     re-resolve via `getObjectByName`. The check is one integer compare
 *     per tick per spacecraft — cheaper than monkey-patching `LOD.update`.
 *
 * Null hold-previous (AC2 clause 3):
 *   - When AttitudeService returns `null` (CK chunk not yet loaded, OR
 *     synthesized path EphemerisService not yet ready), the applier LEAVES
 *     the node's `quaternion` unchanged. Mirrors Story 1.12's
 *     spacecraft-position hold-previous-on-null contract — no flicker.
 *
 * Visibility gate (AC2 last clause):
 *   - When `handle.group.visible === false` (pre-launch ET or chunk-load
 *     gap), the applier SKIPS the spacecraft entirely. No work is done for
 *     an invisible spacecraft.
 *
 * Architecture pillars:
 *   - ADR-0008 (Three.js WebGLRenderer): per-frame mutation runs OUTSIDE
 *     Lit reactivity per architecture line 424. AttitudeApplier is a plain
 *     TS class with a `tick(et, ...)` method.
 *   - ADR-0015 (no global store): instance is constructed in `main.ts`'s
 *     ManifestLoader.then() callback and used directly inside the
 *     `engine.onFrame` callback closure.
 *   - ADR-0026 (TS 6.x strict, zero `any`): all public surface strictly
 *     typed; the branded `Quaternion` from AttitudeService flows into
 *     `Three.Quaternion.copy(branded)` via structural typing.
 */

import type { Object3D } from 'three';

import type { AttitudeService } from '../services/attitude-service';
import type { SpacecraftModels, SpacecraftHandle } from './spacecraft-models';

/**
 * NAIF SPK IDs for V1 and V2. Sourced here rather than imported from
 * `services/fk-constants.ts` so this module has no dependency on the FK
 * constants surface; the values are the same canonical -31 / -32.
 * `fk-constants.test.ts` asserts the FK module values match these literals
 * via the shared `V1_NAIF_ID` / `V2_NAIF_ID` exports.
 */
const V1_NAIF_ID = -31;
const V2_NAIF_ID = -32;

/**
 * Per-spacecraft cache. Keeps the resolved BUS + SCAN_PLATFORM Object3D
 * references AND the LOD level they were resolved against; on a level
 * change we invalidate and re-resolve.
 */
interface PerSpacecraftCache {
  busNode: Object3D | null;
  platformNode: Object3D | null;
  cachedLodLevel: number | null;
}

const createEmptyCache = (): PerSpacecraftCache => ({
  busNode: null,
  platformNode: null,
  cachedLodLevel: null,
});

export class AttitudeApplier {
  private readonly v1Cache: PerSpacecraftCache = createEmptyCache();
  private readonly v2Cache: PerSpacecraftCache = createEmptyCache();

  /**
   * Per-frame tick. Queries AttitudeService for V1 + V2's bus + platform
   * quaternions at `et` and copies them onto the cached BUS + SCAN_PLATFORM
   * Object3D nodes. Hold-previous on null returns; skip on
   * `handle.group.visible === false`; re-resolve cached nodes on LOD-level
   * change.
   */
  tick(
    et: number,
    attitudeService: AttitudeService,
    spacecraftModels: SpacecraftModels,
  ): void {
    this.applyOne(
      et,
      attitudeService,
      spacecraftModels.getHandle('voyager-1'),
      V1_NAIF_ID,
      this.v1Cache,
    );
    this.applyOne(
      et,
      attitudeService,
      spacecraftModels.getHandle('voyager-2'),
      V2_NAIF_ID,
      this.v2Cache,
    );
  }

  /**
   * Test-only — reset both caches so unit tests can observe the
   * first-tick-resolution contract in isolation.
   */
  __resetCachesForTests(): void {
    this.v1Cache.busNode = null;
    this.v1Cache.platformNode = null;
    this.v1Cache.cachedLodLevel = null;
    this.v2Cache.busNode = null;
    this.v2Cache.platformNode = null;
    this.v2Cache.cachedLodLevel = null;
  }

  private applyOne(
    et: number,
    attitudeService: AttitudeService,
    handle: SpacecraftHandle,
    naifId: number,
    cache: PerSpacecraftCache,
  ): void {
    // AC2 last clause — skip invisible spacecraft entirely. No
    // getObjectByName, no AttitudeService call. The visibility gate is
    // load-bearing because SpacecraftModels.tick sets `visible = false`
    // on pre-launch ETs AND on chunk-load gaps (hasInitialPosition=false).
    if (!handle.group.visible) {
      return;
    }

    // AC5 — LOD-swap re-resolution. `handle.lod` is null in the legacy
    // single-LOD fallback path (Story 3.3 AC5 graceful degradation when
    // the manifest has no models[]); in that case there's nothing to
    // compare against and the cache holds across all ticks.
    const currentLevel = handle.lod !== null ? handle.lod.getCurrentLevel() : null;
    if (currentLevel !== cache.cachedLodLevel) {
      cache.busNode = null;
      cache.platformNode = null;
      cache.cachedLodLevel = currentLevel;
    }

    // First-tick (or post-LOD-swap) resolution. When `handle.lod` is
    // non-null we MUST resolve against the active LOD level's subtree
    // (`handle.lod.levels[currentLevel].object`) — `getObjectByName` on
    // `handle.group` would otherwise walk into ALL LOD levels (each of
    // which has its own BUS / SCAN_PLATFORM children) and return the
    // first match in traversal order, which may not be the visible
    // level's node. The legacy single-LOD fallback path (lod === null)
    // can safely walk `handle.group`.
    //
    // The null fallback (`?? null`) shields against missing-name
    // scenarios (a malformed GLB lacking BUS or SCAN_PLATFORM); a null
    // cache value persists across ticks until the next LOD swap, at
    // which point we'll retry. No spam, no throws.
    if (cache.busNode === null || cache.platformNode === null) {
      const searchRoot =
        handle.lod !== null && currentLevel !== null && currentLevel >= 0
          ? handle.lod.levels[currentLevel]?.object ?? handle.group
          : handle.group;
      if (cache.busNode === null) {
        cache.busNode = searchRoot.getObjectByName('BUS') ?? null;
      }
      if (cache.platformNode === null) {
        cache.platformNode = searchRoot.getObjectByName('SCAN_PLATFORM') ?? null;
      }
    }

    // Apply bus quaternion. AttitudeService returns a fresh branded
    // Quaternion per call (Story 3.2 § Completion Note 9 — slerpQuaternions
    // allocates a Three.js Quaternion that we read once and drop). The
    // `copy(...)` writes into the EXISTING `cache.busNode.quaternion`
    // instance — zero retained allocation per AC3.
    if (cache.busNode !== null) {
      const busQuat = attitudeService.getBusQuat(naifId, et);
      if (busQuat !== null) {
        cache.busNode.quaternion.copy(busQuat);
      }
      // null → hold previous (AC2 clause 3). No-op.
    }

    if (cache.platformNode !== null) {
      const platformQuat = attitudeService.getPlatformQuat(naifId, et);
      if (platformQuat !== null) {
        cache.platformNode.quaternion.copy(platformQuat);
      }
    }
  }
}
