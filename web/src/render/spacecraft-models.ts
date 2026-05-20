/**
 * Spacecraft model loader + per-frame position updater (Story 1.12).
 *
 * Loads `web/public/models/voyager.glb` (NASA 3D Resources Voyager Probe (B);
 * see `THIRD_PARTY.md` and `web/public/models/README.md` for attribution),
 * clones the loaded scene into two instances — `voyager-1` and `voyager-2` —
 * and adds them as children of the engine's `WorldGroup` (Story 1.5).
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
 * Visual distinction (AC3): label sprites — a small canvas-textured
 * `THREE.Sprite` displaying "V1" / "V2" sits next to each spacecraft. This is
 * the FR49-accessible choice (not color-only) and survives FR49's contrast
 * checks since the labels render in the design-token foreground color.
 *
 * Architectural compliance:
 *   - Per-frame DOM/scene mutation is invoked from `RenderEngine.onFrame`
 *     by `first-paint.ts` — this module exposes a plain `tick(et)` callable
 *     and never touches Lit reactivity (architecture line 424).
 *   - The Float64→Float32 cast happens once per spacecraft per frame, via
 *     `renderVec3FromWorld()` from `types/branded.ts`. We then call
 *     `Vector3.set(...)` from the Float32 components — no `new Float32Array`
 *     anywhere in this module (no-float32-leakage defense).
 */

import { Group, Sprite, SpriteMaterial, CanvasTexture, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

import type { EphemerisService } from '../services/ephemeris-service';
import { renderVec3FromWorld } from '../types/branded';
import { V1_LAUNCH_ET, V2_LAUNCH_ET } from '../constants/mission';

/**
 * NAIF body IDs for the two Voyager spacecraft. -31 = V1, -32 = V2.
 * Pinned here so the per-frame tick doesn't pull mission.ts's full surface.
 */
const V1_NAIF_ID = -31;
const V2_NAIF_ID = -32;

/**
 * Default GLB URL relative to the Vite-served public root.
 * Override via `SpacecraftModelsOptions.modelUrl` for tests.
 */
export const DEFAULT_VOYAGER_GLB_URL = '/models/voyager.glb';

/**
 * Story 1.15 AC2 — path to the Draco glTF-targeted WASM decoder bundle.
 *
 * Three.js ships its DRACO decoder under `three/examples/jsm/libs/draco/`;
 * the `gltf/` subdir is the smaller WASM-only build recommended for use
 * with GLTFLoader (the parent dir also includes the JS-fallback build).
 * Files are copied into `web/public/draco/gltf/` so Vite serves them from
 * the static root in both dev and prod. `DRACOLoader.setDecoderPath` needs
 * a trailing slash — required by Three.js's URL concatenation logic.
 *
 * @see web/public/draco/gltf/ for the actual served decoder bundle.
 */
export const DRACO_DECODER_PATH = '/draco/gltf/';

/**
 * Scale applied to the loaded GLB's local transform. The NASA GLB ships at
 * roughly-real-meter scale (~3 m bus + 3.7 m HGA dish + 13 m magnetometer
 * boom). Render-space is in km, so a real-meter mesh would be 1000× too
 * small. We multiply by SPACECRAFT_RENDER_SCALE_KM to bring the body to an
 * exaggerated "cruise-scale visible" size — full LOD work and the
 * physically-faithful scaling pipeline is Story 4.3.
 *
 * 0.01 km = 10 m per mesh unit → spacecraft visible from ~AU distances.
 * This is intentionally NOT physically accurate (a real 13 m boom is
 * invisible at 165 AU). UX spec §UX-DR33 explicitly authorises a non-real
 * exaggerated render scale for the spacecraft glyph at this story's stage.
 */
export const SPACECRAFT_RENDER_SCALE_KM = 0.01;

/** Pixel size for the V1/V2 sprite label texture. */
const LABEL_CANVAS_SIZE_PX = 128;
/**
 * Render-space height of the label sprite. Picked to be readable from
 * default cruise zoom without overlapping the body. Tuned by visual
 * inspection; not a load-bearing physics constant.
 */
const LABEL_SPRITE_SCALE_KM = 0.02;

export interface SpacecraftModelsOptions {
  /**
   * Override the GLB URL. Production uses the default
   * `/models/voyager.glb`; tests pass a synthetic blob URL or `null`-loader.
   */
  modelUrl?: string;
  /**
   * Inject a GLTFLoader-shaped loader for tests. Real callers omit this.
   */
  loader?: {
    load: (
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (err: unknown) => void,
    ) => void;
  };
}

export interface SpacecraftHandle {
  readonly id: 'voyager-1' | 'voyager-2';
  readonly naifId: number;
  readonly group: Group;
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
   * Kick off the GLB load. Returns a promise that resolves once both
   * V1 + V2 instances are populated with cloned scene-graph subtrees.
   * Safe to call multiple times — subsequent calls return the same promise.
   *
   * Until the promise resolves, the spacecraft groups exist (so `root` is
   * scene-graph-stable) but only contain the label sprites. The body mesh
   * is appended once the GLB lands.
   */
  load(options: SpacecraftModelsOptions = {}): Promise<void> {
    if (this.loadPromise !== null) return this.loadPromise;

    const url = options.modelUrl ?? DEFAULT_VOYAGER_GLB_URL;
    // Story 1.15 AC2 — the NASA Voyager Probe GLB is Draco-compressed, so
    // GLTFLoader needs a DRACOLoader attached or it fails with
    // "no DRACOLoader instance provided". Configure the decoder path to the
    // bundled WASM build served from /draco/gltf/. Tests inject their own
    // loader (no Draco compression in the synthetic GLTF fixtures), so
    // attach DRACOLoader only to the default-constructed GLTFLoader path.
    const loader = options.loader ?? this.makeDefaultGLTFLoader();

    this.loadPromise = new Promise<void>((resolve, reject) => {
      loader.load(
        url,
        (gltf: GLTF) => {
          // Architecture line 424: the load callback runs off the hot path,
          // so the .clone() cost (one shallow per spacecraft) is amortised.
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
          // eslint-disable-next-line no-console
          console.error('[spacecraft-models] GLB load failed:', err);
          reject(err);
        },
      );
    });

    return this.loadPromise;
  }

  /**
   * Per-frame update. Called from `RenderEngine.onFrame` by first-paint.ts.
   * Reads V1+V2 positions from EphemerisService and applies them to the
   * spacecraft scene-graph nodes. Hold-previous on null returns.
   *
   * The floating-origin recenter happens at the WorldGroup level (Story 1.5):
   * each spacecraft is a child of `root`, which is in turn a child of
   * `WorldGroup`. WorldGroup.position = -cameraWorldPos (km), so setting
   * the spacecraft's local position to `worldPos` (km in J2000 ecliptic)
   * places it at the correct render-space location after WorldGroup applies
   * the recenter.
   */
  tick(et: number, ephemeris: EphemerisService): void {
    this.updateOne(this.v1, V1_LAUNCH_ET, et, ephemeris);
    this.updateOne(this.v2, V2_LAUNCH_ET, et, ephemeris);
  }

  /** True once the GLB has finished loading (both V1 + V2 meshes populated). */
  get isLoaded(): boolean {
    return this.gltfLoaded;
  }

  /**
   * Build a `GLTFLoader` pre-wired with a `DRACOLoader` pointed at the
   * bundled WASM decoder under `/draco/gltf/`. Extracted so tests that
   * want to verify the wire-up can stub it directly, and so a future
   * caller injecting a custom GLTFLoader doesn't pay the DRACOLoader
   * instantiation cost when it's not needed.
   */
  private makeDefaultGLTFLoader(): GLTFLoader {
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_DECODER_PATH);
    const gltf = new GLTFLoader();
    gltf.setDRACOLoader(draco);
    return gltf;
  }

  getHandle(id: 'voyager-1' | 'voyager-2'): SpacecraftHandle {
    return id === 'voyager-1' ? this.v1 : this.v2;
  }

  private updateOne(
    handle: SpacecraftHandle,
    launchEt: number,
    et: number,
    ephemeris: EphemerisService,
  ): void {
    // AC8 — pre-launch visibility gate. Before the spacecraft has launched,
    // it is hidden and its position is not updated. This avoids spurious
    // "at-origin" rendering during the V1 1977-08-20 → 1977-09-05 window
    // when V2 is in flight but V1 hasn't lifted off.
    if (et < launchEt) {
      handle.group.visible = false;
      return;
    }

    const state = ephemeris.getStateAt(et, handle.naifId);
    if (state === null) {
      // Hold previous position (no flicker on chunk-load gaps). Keep the
      // spacecraft visible iff we have at least one prior valid update.
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
 * mesh is attached later by `load()`.
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
  // Offset the label slightly above the spacecraft body so it doesn't
  // overlap the HGA dish.
  sprite.position.set(0, LABEL_SPRITE_SCALE_KM * 1.2, 0);
  group.add(sprite);

  return { id, naifId, group, hasInitialPosition: false };
};

/**
 * Build a CanvasTexture-backed Sprite displaying `text`. The canvas is
 * generated once at construction; the sprite material's resulting texture
 * is shared across the spacecraft's life and never disposed during the
 * per-frame tick (NFR-P2 perf constraint).
 */
const makeLabelSprite = (text: string): Sprite => {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_CANVAS_SIZE_PX;
  canvas.height = LABEL_CANVAS_SIZE_PX;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Foreground from tokens.css — read at construction time. If the doc
    // root isn't available (e.g. SSR / test edge cases), fall back to the
    // token's literal value (#e8eaed) — tests that hit this path verify
    // a sprite exists, not its exact color.
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
