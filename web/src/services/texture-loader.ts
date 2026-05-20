/**
 * Texture tier-selection + load service (Story 1.13).
 *
 * Thin wrapper around `THREE.TextureLoader` that resolves a body-slug + a
 * GPU-capability tier hint to a URL of the form
 * `web/public/textures/<slug>-<tier>.png` and returns the loaded Three.js
 * `Texture` object.
 *
 * ## Format note — PNG today, KTX2 deferred to Story 4.3
 *
 * Story 1.13 ships PNG-2k textures because `toktx` was not available in this
 * environment and the team-lead opted (Story 1.13 dev-decision log) for
 * Option C of Task 3: PNG-2k now, KTX2 conversion + 4k tier deferred to
 * Story 4.3 (SOI entry, which already needs 8k textures and the full
 * encoder toolchain).
 *
 * **Architectural promise:** this module's public surface
 * (`loadBodyTexture`, `loadSkyboxTexture`) is intentionally
 * format-agnostic. When Story 4.3 swaps in KTX2, the change is:
 *
 *   1. Import `KTX2Loader` from `three/examples/jsm/loaders/KTX2Loader.js`
 *   2. Replace the `TextureLoader` field with a `KTX2Loader`
 *   3. Change the URL template's `.png` extension to `.ktx2`
 *
 * That's it. No call-site changes; the renderer (`celestial-bodies.ts`,
 * `skybox.ts`) receives a plain `THREE.Texture` either way and assigns it
 * to `material.map` / `scene.background` identically.
 *
 * The defense test `web/tests/celestial-bodies-defense.test.ts` asserts the
 * KTX2 deferral is still intact: it greps for `KTX2Loader` in `web/src/`
 * and fails if any reference appears (meaning Story 4.3 has started
 * landing changes that this story's environment cannot yet support).
 *
 * ## Tier selection
 *
 * `GPUCapabilityProbe.recommendedTextureTier` returns `'8k' | '4k'`. Story
 * 1.13 only ships the 2k tier; both `'8k'` and `'4k'` fall through to 2k
 * with a documented "Story 4.3" comment in `selectTier`. This keeps the
 * GPU-tier wiring exercised end-to-end so Story 4.3's enablement is a
 * single-flag flip.
 */

import { TextureLoader, type Texture, SRGBColorSpace } from 'three';

import { BODY_TEXTURE_SLUGS } from '../constants/body-radii';
import type { GPUCapabilities } from '../boot/gpu-capability-probe';

/** Texture tier suffix used in the on-disk filename. */
export type TextureTier = '2k' | '4k';

/** Directory under `web/public/` where textures live. */
export const TEXTURE_BASE_URL = '/textures';

/** File extension used by this story's textures. Story 4.3 swaps to `.ktx2`. */
export const TEXTURE_FILE_EXTENSION = 'png';

/**
 * The Milky Way skybox slug — `<slug>-<tier>.png` lives next to the body
 * textures. Equirectangular projection, applied as `scene.background`.
 */
export const SKYBOX_SLUG = 'milky-way';

/**
 * Resolve the on-disk tier for a given GPU-capability hint.
 *
 * Story 1.13 only ships the 2k tier — both `'8k'` and `'4k'` fall through to
 * 2k (with a sentinel `from4k` flag the caller could log). When Story 4.3
 * ships 4k + 8k tiers, this function returns the matching tier directly.
 */
export const selectTier = (caps: Pick<GPUCapabilities, 'recommendedTextureTier'>): TextureTier => {
  // Story 4.3 will populate the '4k' (and '8k') tiers and remove this
  // fall-through. Until then, every device receives the 2k tier.
  void caps;
  return '2k';
};

/** Build the URL for a body-slug + tier. Format: `<base>/<slug>-<tier>.<ext>`. */
export const textureUrlForSlug = (slug: string, tier: TextureTier): string =>
  `${TEXTURE_BASE_URL}/${slug}-${tier}.${TEXTURE_FILE_EXTENSION}`;

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
 * Service that resolves + loads body / skybox textures. One instance is
 * shared across the celestial-bodies and skybox modules; it caches loaded
 * textures by URL so a backward time-scrub doesn't re-fetch.
 */
export class TextureLoaderService {
  private readonly loader: TextureLoaderLike;
  private readonly cache = new Map<string, Promise<Texture>>();

  constructor(loader: TextureLoaderLike = new TextureLoader()) {
    this.loader = loader;
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
    return this.load(url, options.loader);
  }

  /** Load the Milky Way skybox texture at the resolved tier. */
  loadSkybox(options: TextureLoadOptions = {}): Promise<Texture> {
    const tier = options.tier ?? selectTier({ recommendedTextureTier: '4k' });
    const url = textureUrlForSlug(SKYBOX_SLUG, tier);
    return this.load(url, options.loader);
  }

  /** Pre-warm the cache for a list of URLs without awaiting completion. */
  prefetchAll(urls: readonly string[]): Promise<unknown[]> {
    return Promise.all(urls.map((url) => this.load(url).catch((err: unknown) => err)));
  }

  /** True if `url` is already cached or in flight. */
  isCached(url: string): boolean {
    return this.cache.has(url);
  }

  private load(url: string, override?: TextureLoaderLike): Promise<Texture> {
    const cached = this.cache.get(url);
    if (cached !== undefined) return cached;
    const loader = override ?? this.loader;
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
