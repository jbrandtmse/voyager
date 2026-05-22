/**
 * Spacecraft model loader + per-frame position updater.
 *
 * Story 3.3 — REWRITTEN from Story 1.12's single-LOD pattern to a 4-level
 * `THREE.LOD` chain driven by the asset manifest's new `models[]` section
 * (AC4 / `web/src/services/manifest-loader.ts`). The named hierarchy
 * `BUS / SCAN_PLATFORM / HGA` authored by `web/scripts/build_glb.ts` is the
 * contract Stories 3.4 / 3.5 / 5.2 all consume via
 * `scene.getObjectByName('BUS' | 'SCAN_PLATFORM' | 'HGA')`.
 *
 * ADR-0006 compliance:
 *   - Draco decoder REMOVED (was Story 1.15 AC2's emergency stop-gap).
 *   - `MeshoptDecoder` registered against `GLTFLoader` — meshopt-compressed
 *     LODs are the canonical compression per ADR § Decision.
 *   - `KTX2Loader` registered against `GLTFLoader` — KTX2 textures with
 *     Basis Universal supercompression per ADR § Decision step 3. The
 *     Basis transcoder bundle lives at `web/public/basis/`.
 *
 * Per-frame update path (`tick(et)`):
 *   1. Query `EphemerisService.getStateAt(et, -31|-32)` for each spacecraft
 *   2. If `null` (chunk not loaded yet), hold the previous-frame position
 *      and skip the update — no flicker, no jump-to-origin
 *   3. Apply the floating-origin then scene-graph transform per Story 1.5:
 *      the spacecraft's local `position` is set to
 *      `renderVec3FromWorld(worldPos)` — `WorldGroup` carries the recenter
 *
 * V2 pre-launch visibility gate: when `et < V2_LAUNCH_ET`, the V2 model is
 * hidden (`visible = false`) and its position is left unchanged. V1 is
 * similarly hidden before its launch ET.
 *
 * Visual distinction (AC3 from Story 1.12): label sprites — a small canvas-
 * textured `THREE.Sprite` displaying "V1" / "V2" sits next to each spacecraft.
 *
 * Architectural compliance:
 *   - Per-frame DOM/scene mutation is invoked from `RenderEngine.onFrame`
 *     by `first-paint.ts` — this module exposes a plain `tick(et)` callable
 *     and never touches Lit reactivity (architecture line 424).
 *   - The Float64→Float32 cast happens once per spacecraft per frame, via
 *     `renderVec3FromWorld()` from `types/branded.ts`.
 *   - LOD distance thresholds are read from the manifest at construction
 *     time (AC5); the schedule lives in `bake/inputs/voyager-mesh-mapping.json`
 *     and `web/scripts/build_glb.ts`'s `LOD_SCHEDULE` — NOT hardcoded here.
 */

import {
  Group,
  LOD,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
// ADR-0006 § Decision: meshopt-compressed GLBs need MeshoptDecoder. The
// three@0.184 examples ship type declarations for this loader.
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

import type { EphemerisService } from '../services/ephemeris-service';
import type { Manifest, ManifestModel } from '../services/manifest-loader';
import { renderVec3FromWorld } from '../types/branded';
import { V1_LAUNCH_ET, V2_LAUNCH_ET } from '../constants/mission';

/**
 * NAIF body IDs for the two Voyager spacecraft. -31 = V1, -32 = V2.
 */
const V1_NAIF_ID = -31;
const V2_NAIF_ID = -32;

/**
 * Default GLB URL relative to the Vite-served public root. Retained as a
 * test-only fallback for unit tests that don't mount a real manifest, and
 * as the AC5 graceful-degradation path when `manifest.models[]` is empty
 * (the transition window before `just bake-glb` has been run on a fresh
 * clone). Pre-Story-3.3 this was the production URL; post-Story-3.3 the
 * production URLs come from the manifest's `models[0].lods[i].url` chain.
 */
export const DEFAULT_VOYAGER_GLB_URL = '/models/voyager.glb';

/**
 * Path to the Basis Universal transcoder bundle copied from
 * `node_modules/three/examples/jsm/libs/basis/` into `web/public/basis/`
 * so Vite serves them from the static root in both dev and prod.
 * `KTX2Loader.setTranscoderPath` needs a trailing slash.
 */
export const BASIS_TRANSCODER_PATH = '/basis/';

/**
 * Scale applied to the loaded GLB's local transform. The NASA GLB ships at
 * roughly-real-meter scale (~3 m bus + 3.7 m HGA dish + 13 m magnetometer
 * boom). Render-space is in km, so a real-meter mesh would be 1000× too
 * small. We multiply by SPACECRAFT_RENDER_SCALE_KM to bring the body to an
 * exaggerated "cruise-scale visible" size.
 *
 * 0.01 km = 10 m per mesh unit → spacecraft visible from ~AU distances.
 * UX spec §UX-DR33 explicitly authorises a non-real exaggerated render
 * scale for the spacecraft glyph at this story's stage.
 */
export const SPACECRAFT_RENDER_SCALE_KM = 0.01;

/** Pixel size for the V1/V2 sprite label texture. */
const LABEL_CANVAS_SIZE_PX = 128;
/**
 * Render-space height of the label sprite.
 */
const LABEL_SPRITE_SCALE_KM = 0.02;

export interface SpacecraftModelsOptions {
  /**
   * Story 3.3 AC5 — caller-supplied manifest. Production passes the
   * `Manifest` loaded by `ManifestLoader.load()` so the LOD chain is wired
   * up from `manifest.models[0].lods[]`. When absent (tests or transition
   * window), falls back to `DEFAULT_VOYAGER_GLB_URL`.
   */
  manifest?: Manifest;
  /**
   * Override the (single-LOD fallback) GLB URL. Production never sets this;
   * it's a test convenience that bypasses both the manifest and the default.
   */
  modelUrl?: string;
  /**
   * Inject a GLTFLoader-shaped loader for tests. Real callers omit this so
   * the production loader (with MeshoptDecoder + KTX2Loader registered) is
   * constructed.
   */
  loader?: {
    load: (
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (err: unknown) => void,
    ) => void;
  };
  /**
   * Optional WebGLRenderer instance. Required in production for KTX2 texture
   * support: `KTX2Loader.detectSupport(renderer)` reads the GPU's compressed-
   * texture-format support via the renderer's `extensions` / `capabilities`
   * surface and configures the Basis-Universal transcoder accordingly.
   * KTX2Loader throws `"Missing initialization with .detectSupport( renderer )"`
   * on the first KTX2 texture if `detectSupport` was never called — so any
   * production GLB containing KTX2 textures (which our `build_glb.ts`
   * pipeline guarantees per ADR-0006 § Decision step 3) requires this to
   * be wired through.
   *
   * The type is intentionally loose-typed (`unknown`) so the engine's
   * `WebGLRendererLike` shape can flow through without coupling this module
   * to the engine. The cast inside `makeDefaultGLTFLoader` narrows to the
   * full KTX2Loader-expected shape at the call site.
   *
   * Tests omit this; the loader still constructs but a real KTX2 texture
   * load would fail. Synthetic-GLB tests don't trigger that path.
   */
  renderer?: unknown;
}

export interface SpacecraftHandle {
  readonly id: 'voyager-1' | 'voyager-2';
  readonly naifId: number;
  readonly group: Group;
  /**
   * Story 3.3 — the inner `THREE.LOD` instance that wraps the LOD chain
   * for this spacecraft. `null` while the GLB chain is still loading or
   * when the loader fell back to the single-LOD legacy path. Lead-driven
   * Chrome DevTools MCP smoke (AC9 probe 5) reads this to verify
   * `lod.levels.length === 4`.
   */
  lod: LOD | null;
  /** True when the spacecraft has had a real-position update at least once. */
  hasInitialPosition: boolean;
}

export class SpacecraftModels {
  /** Container parented to the engine's WorldGroup. Holds V1 + V2. */
  readonly root: Group;
  private readonly v1: SpacecraftHandle;
  private readonly v2: SpacecraftHandle;
  private gltfLoaded = false;
  private loadPromise: Promise<void> | null = null;
  /**
   * Story 3.3 AC5 — `console.warn` is emitted exactly ONCE on first
   * fall-back. Subsequent `load()` calls with the same empty-manifest
   * condition are silent so the dev console doesn't spam.
   */
  private static fallbackWarnEmitted = false;

  constructor() {
    this.root = new Group();
    this.root.name = 'SpacecraftModels';

    this.v1 = makeSpacecraftHandle('voyager-1', V1_NAIF_ID);
    this.v2 = makeSpacecraftHandle('voyager-2', V2_NAIF_ID);

    this.root.add(this.v1.group);
    this.root.add(this.v2.group);

    // Hide both until the first valid ephemeris update lands.
    this.v1.group.visible = false;
    this.v2.group.visible = false;
  }

  /**
   * Kick off the GLB-chain load. Returns a promise that resolves once both
   * V1 + V2 instances are populated with the LOD chain (or, on AC5
   * fallback, with the single-LOD scene clone).
   *
   * Safe to call multiple times — subsequent calls return the same promise.
   */
  load(options: SpacecraftModelsOptions = {}): Promise<void> {
    if (this.loadPromise !== null) return this.loadPromise;

    const model = this.resolveModelEntry(options);

    if (model === null) {
      const url = options.modelUrl ?? DEFAULT_VOYAGER_GLB_URL;
      const loader = options.loader ?? this.makeDefaultGLTFLoader(options);
      this.loadPromise = this.loadSingleLod(url, loader);
    } else {
      const loader = options.loader ?? this.makeDefaultGLTFLoader(options);
      this.loadPromise = this.loadMultiLod(model, loader);
    }

    return this.loadPromise;
  }

  /** True once the GLB chain has finished loading. */
  get isLoaded(): boolean {
    return this.gltfLoaded;
  }

  getHandle(id: 'voyager-1' | 'voyager-2'): SpacecraftHandle {
    return id === 'voyager-1' ? this.v1 : this.v2;
  }

  /**
   * Per-frame update. Called from `RenderEngine.onFrame` by first-paint.ts.
   * Reads V1+V2 positions from EphemerisService and applies them to the
   * spacecraft scene-graph nodes. Hold-previous on null returns.
   */
  tick(et: number, ephemeris: EphemerisService): void {
    this.updateOne(this.v1, V1_LAUNCH_ET, et, ephemeris);
    this.updateOne(this.v2, V2_LAUNCH_ET, et, ephemeris);
  }

  // === Internals ============================================================

  private resolveModelEntry(options: SpacecraftModelsOptions): ManifestModel | null {
    if (options.modelUrl !== undefined) {
      return null;
    }
    const manifest = options.manifest;
    if (manifest === undefined) {
      return null;
    }
    const models = manifest.models;
    if (models.length === 0) {
      if (!SpacecraftModels.fallbackWarnEmitted) {
        SpacecraftModels.fallbackWarnEmitted = true;
        console.warn(
          '[spacecraft-models] no models in manifest; falling back to single-LOD legacy path. Run `just bake-glb` to regenerate the LOD chain.',
        );
      }
      return null;
    }
    const byId = models.find((m) => m.id === 'voyager');
    return byId ?? models[0];
  }

  private async loadMultiLod(
    model: ManifestModel,
    loader: NonNullable<SpacecraftModelsOptions['loader']>,
  ): Promise<void> {
    // Sort LODs by level so levels[0] is the highest-quality detail.
    const sortedLods = [...model.lods].sort((a, b) => a.level - b.level);

    // Load all LOD GLBs in parallel via the (production or test) loader.
    const sceneLoads = await Promise.all(
      sortedLods.map((lod) =>
        new Promise<GLTF>((resolve, reject) => {
          loader.load(lod.url, resolve, undefined, (err) => reject(err));
        }),
      ),
    );

    // AC3 — wrap each loaded scene in a `THREE.LOD` instance per spacecraft.
    const v1Lod = new LOD();
    const v2Lod = new LOD();
    v1Lod.name = 'voyager-1-lod';
    v2Lod.name = 'voyager-2-lod';

    sortedLods.forEach((lodSpec, idx) => {
      const gltf = sceneLoads[idx];
      // Clone the scene root so V1 and V2 are independent. The clone(true)
      // deep-copies the node graph including BUS/SCAN_PLATFORM/HGA named
      // groups; `getObjectByName` on each clone independently resolves.
      const v1Scene = gltf.scene.clone(true);
      const v2Scene = gltf.scene.clone(true);
      v1Scene.scale.setScalar(SPACECRAFT_RENDER_SCALE_KM);
      v2Scene.scale.setScalar(SPACECRAFT_RENDER_SCALE_KM);
      v1Scene.name = `voyager-1-lod${lodSpec.level}-scene`;
      v2Scene.name = `voyager-2-lod${lodSpec.level}-scene`;

      // LOD threshold rationale (AC3): the manifest's `maxDistanceKm` is the
      // upper bound (in render-space km) at which this LOD level remains
      // active. `THREE.LOD.update(camera)` computes
      // `camera.position.distanceTo(lodObject.position)` in render-space
      // units. Since the world-group is in render-space km (Story 1.5
      // floating-origin), the renderer's distance is in km too — no SCALE
      // multiplication needed.
      // - LOD0: maxDistanceKm = 0.001 → 1 m (touching it)
      // - LOD1: maxDistanceKm = 0.1 → 100 m (close inspection)
      // - LOD2: maxDistanceKm = 1.0 → cruise-scale
      // - LOD3: maxDistanceKm = null → far-field; mapped to Infinity here.
      // `addLevel` requires distance values monotonically increase — the
      // sortedLods order above is the source of truth.
      const distance =
        lodSpec.maxDistanceKm === null
          ? Number.POSITIVE_INFINITY
          : lodSpec.maxDistanceKm;
      v1Lod.addLevel(v1Scene, distance);
      v2Lod.addLevel(v2Scene, distance);
    });

    // Attach the LOD instances to each spacecraft group + record on handle.
    this.v1.group.add(v1Lod);
    this.v2.group.add(v2Lod);
    (this.v1 as { lod: LOD }).lod = v1Lod;
    (this.v2 as { lod: LOD }).lod = v2Lod;

    this.gltfLoaded = true;
  }

  private loadSingleLod(
    url: string,
    loader: NonNullable<SpacecraftModelsOptions['loader']>,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      loader.load(
        url,
        (gltf: GLTF) => {
          const meshV1 = gltf.scene.clone(true);
          const meshV2 = gltf.scene.clone(true);
          meshV1.scale.setScalar(SPACECRAFT_RENDER_SCALE_KM);
          meshV2.scale.setScalar(SPACECRAFT_RENDER_SCALE_KM);
          meshV1.name = 'voyager-1-mesh';
          meshV2.name = 'voyager-2-mesh';
          this.v1.group.add(meshV1);
          this.v2.group.add(meshV2);
          this.gltfLoaded = true;
          resolve();
        },
        undefined,
        (err: unknown) => {
          console.error('[spacecraft-models] GLB load failed:', err);
          reject(err);
        },
      );
    });
  }

  /**
   * Build a `GLTFLoader` pre-wired with `MeshoptDecoder` + `KTX2Loader`
   * per ADR-0006. Replaces the Story 1.15 AC2 DRACOLoader-pre-wire entirely
   * — Draco is gone from the runtime as of this story.
   */
  private makeDefaultGLTFLoader(options: SpacecraftModelsOptions): GLTFLoader {
    const gltf = new GLTFLoader();
    // EXT_meshopt_compression decoder. The wasm-backed `MeshoptDecoder` is
    // imported as a singleton; calling setMeshoptDecoder on each loader
    // instance is a thin pointer assignment.
    gltf.setMeshoptDecoder(MeshoptDecoder);
    // KTX2Loader = basis-universal transcoder bridge. Three.js calls it
    // for textures inside the GLB that declare `image/ktx2` MIME.
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath(BASIS_TRANSCODER_PATH);
    if (options.renderer !== undefined) {
      // KTX2Loader.detectSupport requires a WebGLRenderer; the
      // SpacecraftModelsOptions surface is intentionally loose-typed
      // (`{ capabilities?: unknown }`) so tests can pass through without
      // depending on the full WebGLRenderer shape. The cast is the
      // narrowest possible shape (Three.js types this as `WebGLRenderer`).
      ktx2.detectSupport(options.renderer as Parameters<typeof ktx2.detectSupport>[0]);
    }
    gltf.setKTX2Loader(ktx2);
    return gltf;
  }

  private updateOne(
    handle: SpacecraftHandle,
    launchEt: number,
    et: number,
    ephemeris: EphemerisService,
  ): void {
    // Pre-launch visibility gate (Story 1.12 AC8).
    if (et < launchEt) {
      handle.group.visible = false;
      return;
    }

    const state = ephemeris.getStateAt(et, handle.naifId);
    if (state === null) {
      // Hold previous position (no flicker on chunk-load gaps).
      handle.group.visible = handle.hasInitialPosition;
      return;
    }

    const renderPos = renderVec3FromWorld(state.position);
    handle.group.position.set(renderPos[0], renderPos[1], renderPos[2]);
    handle.group.visible = true;
    handle.hasInitialPosition = true;
  }
}

/**
 * Build a spacecraft container + attach the V1/V2 label sprite. The GLB
 * mesh / LOD chain is attached later by `load()`.
 */
const makeSpacecraftHandle = (
  id: 'voyager-1' | 'voyager-2',
  naifId: number,
): SpacecraftHandle => {
  const group = new Group();
  group.name = id;

  const labelText = id === 'voyager-1' ? 'V1' : 'V2';
  const sprite = makeLabelSprite(labelText);
  sprite.name = `${id}-label`;
  sprite.position.set(0, LABEL_SPRITE_SCALE_KM * 1.2, 0);
  group.add(sprite);

  return { id, naifId, group, lod: null, hasInitialPosition: false };
};

const makeLabelSprite = (text: string): Sprite => {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_CANVAS_SIZE_PX;
  canvas.height = LABEL_CANVAS_SIZE_PX;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const color = readCssVar('--v-color-fg', '#e8eaed');
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 72px "JetBrains Mono", monospace';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({ map: texture, transparent: true });
  const sprite = new Sprite(material);
  sprite.scale.set(LABEL_SPRITE_SCALE_KM, LABEL_SPRITE_SCALE_KM, 1);
  return sprite;
};

const readCssVar = (name: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  const root = document.documentElement;
  if (!root) return fallback;
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
};

// Re-export for downstream wiring (first-paint.ts).
export type SpacecraftModelsRoot = Object3D;

// Test hook — resets the once-only fallback warning state so each test can
// observe the warn-on-first-fallback contract in isolation.
export const __resetFallbackWarnForTests = (): void => {
  (SpacecraftModels as unknown as { fallbackWarnEmitted: boolean }).fallbackWarnEmitted = false;
};
