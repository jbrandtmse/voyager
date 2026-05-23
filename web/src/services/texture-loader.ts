/**
 * Texture tier-selection + load service (Story 1.13 — extended for Story 4.3).
 *
 * Thin wrapper around `THREE.TextureLoader` that resolves a body-slug + a
 * GPU-capability tier hint to a URL of the form
 * `web/public/textures/<slug>-<tier>.<ext>` and returns the loaded Three.js
 * `Texture` object.
 *
 * ## Story 1.13 vs Story 4.3 — file extension + tier coverage
 *
 * Story 1.13 shipped PNG-2k textures for the 8 planets + Sun + Earth's Moon
 * + Milky Way under `web/public/textures/`. Story 4.3 adds:
 *
 *   - 4K + 8K KTX2-Basis textures for the 4 gas giants (`jupiter`, `saturn`,
 *     `uranus`, `neptune`).
 *   - 2K KTX2-Basis textures for 12 outer-system moons (Io, Europa,
 *     Ganymede, Callisto, Titan, Iapetus, Hyperion, Miranda, Ariel,
 *     Umbriel, Titania, Oberon, Triton).
 *
 * The original PNG-2k files remain on disk for the cruise / low-end-GPU
 * fallback; per-tier KTX2 layers stack atop them. The `loadBody` /
 * `loadSkybox` surfaces are unchanged; only `selectTier` / the per-tier
 * extension lookup have grown.
 *
 * ## Tier selection
 *
 * `GPUCapabilityProbe.recommendedTextureTier` returns `'8k' | '4k'`. The
 * runtime cruise default is `'2k'` (Story 1.13's safe-fallback);
 * `RenderEngine.upgradePlanetTexture(bodyId)` (Story 4.3 AC4) issues a
 * `loadBody(..., { tier: '8k' })` explicit call on SOI entry. The GPU
 * memory gate (`GPUCapabilities.adequateForEightK`) is consulted by the
 * RenderEngine before calling `upgradePlanetTexture` — the texture loader
 * itself does not enforce the gate; it simply resolves whatever tier the
 * caller asked for.
 */

import { TextureLoader, type Texture, SRGBColorSpace } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

import { BODY_TEXTURE_SLUGS } from '../constants/body-radii';
import type { GPUCapabilities } from '../boot/gpu-capability-probe';

/**
 * Path to the Basis Universal transcoder bundle (same path Story 3.3 wired
 * for the GLB-embedded KTX2 textures). The bundle lives at
 * `node_modules/three/examples/jsm/libs/basis/` and is copied to
 * `web/public/basis/` so Vite serves it from the static root in both dev
 * and prod. The trailing slash is required by KTX2Loader.setTranscoderPath.
 */
export const BASIS_TRANSCODER_PATH = '/basis/';

/**
 * Texture tier suffix used in the on-disk filename. `2k` is the Story-1.13
 * cruise default (PNG fallback). `4k` + `8k` are the Story-4.3 KTX2 tiers
 * that the per-encounter upgrade (`RenderEngine.upgradePlanetTexture`)
 * promotes the gas giants into.
 */
export type TextureTier = '2k' | '4k' | '8k';

/** Directory under `web/public/` where textures live. */
export const TEXTURE_BASE_URL = '/textures';

/**
 * File extension per tier — DEFAULT mapping. Story 1.13 ships PNGs only at
 * the 2k tier; Story 4.3 adds KTX2-Basis at 4k + 8k tiers. Lookup is
 * per-tier so the same service hosts both formats without a call-site
 * bifurcation. Per-slug overrides via `SLUG_TIER_OVERRIDES_TO_KTX2`
 * (declared below) for outer-system moons whose 2k tier was procured as
 * KTX2-only (Story 4.3 cycle-4) — no `-2k.png` source exists for them on
 * disk, so the URL builder MUST resolve to `-2k.ktx2`.
 */
export const TEXTURE_FILE_EXTENSION_BY_TIER: Readonly<Record<TextureTier, string>> = Object.freeze({
  '2k': 'png',
  '4k': 'ktx2',
  '8k': 'ktx2',
});

/**
 * Story 1.13 legacy export — the 2k tier's extension. Story 4.3 keeps this
 * exported for backward compatibility with consumers that hard-coded `png`,
 * but new call sites should use `TEXTURE_FILE_EXTENSION_BY_TIER[tier]`.
 */
export const TEXTURE_FILE_EXTENSION = 'png';

/**
 * Story 4.3 cycle-7 — per-slug override forcing the 2k tier to route to a
 * `.ktx2` file rather than the default `.png`. Required because the
 * outer-system moons (procured in Story 4.3 cycle-4) ship at the 2k tier
 * as KTX2 ONLY — no `<slug>-2k.png` source exists on disk for them. Without
 * this override, `loadBody(501, /* default 2k *\/)` resolves to
 * `/textures/io-2k.png` which 404s, and the runtime falls into the PNG
 * TextureLoader's "[object Event]" error path. The lead's MCP smoke iter-3
 * caught this defect after cycle-6 fixed the upstream KTX2Loader init.
 *
 * Slugs in this set route their 2k tier through `'ktx2'` instead of `'png'`;
 * the 4k/8k tiers are unchanged (they're already `'ktx2'` for everyone).
 *
 * Story 1.13's cruise textures (Sun, 8 planets, Earth's Moon, Milky Way)
 * remain on PNG-2k — they have `<slug>-2k.png` source files on disk and
 * the cruise boot path expects PNG.
 *
 * The 12 outer moons enumerated in `web/src/constants/body-radii.ts §
 * MOON_NAIF_IDS_BY_PARENT` (NAIF 501..504, 606..608, 701..705, 801) all
 * appear here as their slug-string equivalents. Hyperion (NAIF 607) has
 * no slug in `BODY_TEXTURE_SLUGS` (grey-placeholder per cycle-4 Rule-5
 * amendment), so it doesn't need an entry — `loadBody(607)` returns null
 * synchronously before reaching the URL builder.
 */
export const SLUG_TIER_OVERRIDES_TO_KTX2: ReadonlySet<string> = new Set([
  // Galilean moons (V1J + V2J)
  'io', 'europa', 'ganymede', 'callisto',
  // Saturn moons (V1S + V2S)
  'titan', 'iapetus',
  // Uranus moons (V2U)
  'ariel', 'umbriel', 'titania', 'oberon', 'miranda',
  // Neptune moon (V2N)
  'triton',
]);

/**
 * Resolve the file extension for a `(slug, tier)` pair. Consults
 * `SLUG_TIER_OVERRIDES_TO_KTX2` first — slugs in that set force `'ktx2'`
 * at the 2k tier (outer-system moons that ship KTX2-only); all other
 * lookups fall through to `TEXTURE_FILE_EXTENSION_BY_TIER[tier]`.
 */
export const extensionForSlugTier = (slug: string, tier: TextureTier): string => {
  if (tier === '2k' && SLUG_TIER_OVERRIDES_TO_KTX2.has(slug)) {
    return 'ktx2';
  }
  return TEXTURE_FILE_EXTENSION_BY_TIER[tier];
};

/**
 * The Milky Way skybox slug — `<slug>-<tier>.png` lives next to the body
 * textures. Equirectangular projection, applied as `scene.background`.
 */
export const SKYBOX_SLUG = 'milky-way';

/**
 * Resolve the cruise-default tier for a given GPU-capability hint.
 *
 * Story 1.13 cruise default is `'2k'` (the PNG fallback every device can
 * host). Story 4.3 keeps the cruise default at `'2k'` and lets the
 * per-encounter upgrade path (`RenderEngine.upgradePlanetTexture`)
 * explicitly request `'8k'` on SOI entry — see ADR-0006 for the
 * rationale (8K KTX2 layers are too heavy to pre-load all eight planets
 * at boot; the cruise tier stays cheap and the gas giants upgrade lazily
 * on encounter entry).
 *
 * The GPU capability hint is consumed by `RenderEngine.upgradePlanetTexture`
 * via the `adequateForEightK` field — not by this function. Keeping the
 * cruise default at `'2k'` here means a low-end GPU (no 8K capacity)
 * silently stays on the 2K tier through every encounter, honouring
 * NFR-C6 ("silent skip if GPU memory insufficient").
 */
export const selectTier = (caps: Pick<GPUCapabilities, 'recommendedTextureTier'>): TextureTier => {
  void caps;
  return '2k';
};

/**
 * Build the URL for a body-slug + tier. Format: `<base>/<slug>-<tier>.<ext>`.
 * Extension resolved by `extensionForSlugTier` so the cycle-7 outer-moon
 * KTX2-at-2k override is honoured automatically.
 */
export const textureUrlForSlug = (slug: string, tier: TextureTier): string =>
  `${TEXTURE_BASE_URL}/${slug}-${tier}.${extensionForSlugTier(slug, tier)}`;

/** Build the URL for a NAIF-ID body at the resolved tier. */
export const textureUrlForBody = (naifId: number, tier: TextureTier): string | null => {
  const slug = BODY_TEXTURE_SLUGS[naifId];
  if (slug === undefined) return null;
  return textureUrlForSlug(slug, tier);
};

/**
 * Minimal three-shaped loader surface (so tests can inject a stub).
 */
export interface TextureLoaderLike {
  load(
    url: string,
    onLoad?: (texture: Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void,
  ): Texture;
}

export interface TextureLoadOptions {
  /** Override the GPU-capability tier (default: '2k' via `selectTier`). */
  tier?: TextureTier;
  /** Inject a Three-loader for tests. */
  loader?: TextureLoaderLike;
}

/**
 * Constructor options for TextureLoaderService.
 *
 * Story 4.3: `renderer` is the WebGLRenderer required by `KTX2Loader.detectSupport`.
 * The Story 3.3 GLB pipeline already initializes a KTX2Loader for the
 * spacecraft-bus GLB; this service constructs its own KTX2Loader instance
 * for standalone planet/moon textures (the loaders cannot be shared because
 * the GLB pipeline registers KTX2Loader against GLTFLoader, which routes
 * KTX2 textures inside GLB files — standalone `.ktx2` URLs go through this
 * service's loader directly).
 */
export interface TextureLoaderServiceOptions {
  /** PNG loader (defaults to a new THREE.TextureLoader). */
  pngLoader?: TextureLoaderLike;
  /** KTX2 loader (defaults to a new KTX2Loader; `renderer` must be supplied for prod use). */
  ktx2Loader?: TextureLoaderLike;
  /**
   * WebGLRenderer-shaped object for `KTX2Loader.detectSupport(renderer)`.
   * Required in production for KTX2 texture support; tests injecting a
   * stub `ktx2Loader` via the option above may omit this.
   *
   * Typed as `unknown` (mirror of `web/src/render/spacecraft-models.ts §
   * SpacecraftModelsOptions.renderer`) so callers that hold the loose
   * `WebGLRendererLike` type the RenderEngine exposes (`engine.getRenderer()`)
   * can pass through without re-typing. The narrowest possible cast lives
   * at the `detectSupport` call site (one line below this constant).
   */
  renderer?: unknown;
}

/**
 * Service that resolves + loads body / skybox textures. One instance is
 * shared across the celestial-bodies and skybox modules; it caches loaded
 * textures by URL so a backward time-scrub doesn't re-fetch.
 *
 * Story 4.3 extension: the service now hosts BOTH a PNG `TextureLoader`
 * (Story 1.13 cruise tier) and a KTX2Loader (Story 4.3 4K + 8K tiers).
 * The `.png` / `.ktx2` extension on the resolved URL routes the load to
 * the right loader.
 */
export class TextureLoaderService {
  private readonly pngLoader: TextureLoaderLike;
  private readonly ktx2Loader: TextureLoaderLike;
  private readonly cache = new Map<string, Promise<Texture>>();

  constructor(loaderOrOptions?: TextureLoaderLike | TextureLoaderServiceOptions) {
    // Backward-compatibility shim: the Story 1.13 constructor took a single
    // positional `TextureLoaderLike` (the PNG loader). New callers pass an
    // options object; old callers (and tests pre-Story-4.3) pass a single
    // loader instance.
    if (loaderOrOptions === undefined) {
      this.pngLoader = new TextureLoader();
      const ktx2 = new KTX2Loader();
      ktx2.setTranscoderPath(BASIS_TRANSCODER_PATH);
      // No renderer available in the default-construct path —
      // detectSupport() is not called. Production callers MUST use the
      // options-object form with `renderer` so KTX2 textures actually
      // transcode. The default form is only safe for PNG-only test paths.
      this.ktx2Loader = adaptKtx2Loader(ktx2);
    } else if (isTextureLoaderLike(loaderOrOptions)) {
      this.pngLoader = loaderOrOptions;
      // No KTX2 support when constructed via the legacy single-loader form;
      // the ktx2Loader is a no-op stub that synthesizes a tiny rejection so
      // accidental KTX2 lookups fail loudly. Tests that exercise the KTX2
      // path must pass the options-object form with `ktx2Loader: ...`.
      this.ktx2Loader = makeRejectingLoader('KTX2 loader not configured');
    } else {
      this.pngLoader = loaderOrOptions.pngLoader ?? new TextureLoader();
      if (loaderOrOptions.ktx2Loader !== undefined) {
        this.ktx2Loader = loaderOrOptions.ktx2Loader;
      } else {
        const ktx2 = new KTX2Loader();
        ktx2.setTranscoderPath(BASIS_TRANSCODER_PATH);
        if (loaderOrOptions.renderer !== undefined) {
          // Story 4.3 cycle-6 — `.detectSupport(renderer)` is REQUIRED
          // before any KTX2 `.load()` call. Without it the loader
          // doesn't know which Basis Universal transcode target the
          // GPU supports and throws `"Missing initialization with
          // .detectSupport(renderer)"` on the first decode. Same cast
          // pattern as Story 3.3's `spacecraft-models.ts` (the renderer
          // is typed `unknown` on the options surface so callers can
          // pass through the engine's loose `WebGLRendererLike`).
          ktx2.detectSupport(
            loaderOrOptions.renderer as Parameters<typeof ktx2.detectSupport>[0],
          );
        }
        // KTX2Loader's `load` signature returns CompressedTexture instead of
        // the base Texture, so we adapt it via a thin shim. The runtime
        // behaviour is identical (CompressedTexture extends Texture); only
        // the static return type differs.
        this.ktx2Loader = adaptKtx2Loader(ktx2);
      }
    }
  }

  /**
   * Resolve the URL for `(naifId, tier)` and return a cached or fresh
   * Three.js `Texture`. Sets `colorSpace = SRGBColorSpace` so the texture
   * is gamma-correct when sampled by `MeshStandardMaterial`.
   *
   * Returns `null` synchronously if the NAIF ID is unknown (no slug). On
   * load failure the returned promise rejects.
   */
  loadBody(naifId: number, options: TextureLoadOptions = {}): Promise<Texture> | null {
    const tier = options.tier ?? selectTier({ recommendedTextureTier: '4k' });
    const url = textureUrlForBody(naifId, tier);
    if (url === null) return null;
    return this.load(url, tier, options.loader);
  }

  /** Load the Milky Way skybox texture at the resolved tier. */
  loadSkybox(options: TextureLoadOptions = {}): Promise<Texture> {
    const tier = options.tier ?? selectTier({ recommendedTextureTier: '4k' });
    const url = textureUrlForSlug(SKYBOX_SLUG, tier);
    return this.load(url, tier, options.loader);
  }

  /**
   * Story 4.3 AC4 — direct slug-tier load entry point. Used by
   * `RenderEngine.upgradePlanetTexture(bodyId)` (which resolves the NAIF →
   * slug + tier mapping) and by moon-mesh loading (Story 4.3 T5, which
   * uses slug-keyed lookups for the 12 moons whose NAIF entries are added
   * to `body-radii.ts`).
   */
  loadBySlug(slug: string, tier: TextureTier, options: { loader?: TextureLoaderLike } = {}): Promise<Texture> {
    const url = textureUrlForSlug(slug, tier);
    return this.load(url, tier, options.loader);
  }

  /** Pre-warm the cache for a list of URLs without awaiting completion. */
  prefetchAll(urls: readonly string[]): Promise<unknown[]> {
    return Promise.all(urls.map((url) => this.loadByUrl(url).catch((err: unknown) => err)));
  }

  /** True if `url` is already cached or in flight. */
  isCached(url: string): boolean {
    return this.cache.has(url);
  }

  /**
   * Internal: load `url` by inferring the right loader from the file
   * extension. Used by `prefetchAll` which only has URLs (no tier hint).
   */
  private loadByUrl(url: string): Promise<Texture> {
    const tier: TextureTier = url.endsWith('.ktx2') ? '4k' : '2k';
    return this.load(url, tier);
  }

  private load(url: string, tier: TextureTier, override?: TextureLoaderLike): Promise<Texture> {
    const cached = this.cache.get(url);
    if (cached !== undefined) return cached;
    // Story 4.3 cycle-7 — route to the PNG or KTX2 loader based on the
    // RESOLVED URL'S FILE EXTENSION rather than the default tier→ext
    // map. The cycle-3 design assumed `tier === '2k'` always meant PNG;
    // cycle-4's outer-moon procurement (Io / Europa / ... / Triton)
    // ships KTX2-only at the 2k tier, which the cycle-7
    // `SLUG_TIER_OVERRIDES_TO_KTX2` set captures. By the time we reach
    // here, `textureUrlForSlug` has already resolved the correct
    // extension via `extensionForSlugTier(slug, tier)` — so the URL
    // itself is the authoritative signal. `tier` is preserved as an
    // argument only for callers that pre-date this contract (still
    // works because `extensionForSlugTier` honours the override at URL
    // build time).
    const isKtx2 = url.endsWith('.ktx2');
    const defaultLoader = isKtx2 ? this.ktx2Loader : this.pngLoader;
    const loader = override ?? defaultLoader;
    void tier; // retained in the signature for future caller-tier
               // diagnostics; URL extension is the routing key.
    const promise = new Promise<Texture>((resolve, reject) => {
      loader.load(
        url,
        (texture: Texture) => {
          texture.colorSpace = SRGBColorSpace;
          resolve(texture);
        },
        undefined,
        (err: unknown) => {
          // Drop the failed promise from cache so a retry can succeed
          // (e.g. transient network failure on the prefetch path).
          this.cache.delete(url);
          reject(err);
        },
      );
    });
    this.cache.set(url, promise);
    return promise;
  }
}

const isTextureLoaderLike = (x: unknown): x is TextureLoaderLike =>
  typeof x === 'object'
  && x !== null
  && typeof (x as { load?: unknown }).load === 'function';

const makeRejectingLoader = (msg: string): TextureLoaderLike => ({
  load(_url, _onLoad, _onProgress, onError) {
    if (onError !== undefined) onError(new Error(msg));
    return {} as Texture;
  },
});

/**
 * Adapter — KTX2Loader's `load` returns CompressedTexture (subclass of
 * Texture). Wrap it in a TextureLoaderLike-shaped object so the service's
 * routing layer sees a uniform interface across PNG and KTX2 paths.
 */
const adaptKtx2Loader = (ktx2: KTX2Loader): TextureLoaderLike => ({
  load(url, onLoad, onProgress, onError) {
    return ktx2.load(
      url,
      // The cast is sound — CompressedTexture extends Texture; the
      // service's resolve callback expects the base type.
      (tex) => (onLoad !== undefined ? onLoad(tex as unknown as Texture) : undefined),
      onProgress,
      onError,
    ) as unknown as Texture;
  },
});
