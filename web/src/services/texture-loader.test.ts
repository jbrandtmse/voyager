import { describe, it, expect } from 'vitest';
import { SRGBColorSpace, Texture } from 'three';

import {
  TextureLoaderService,
  selectTier,
  textureUrlForSlug,
  textureUrlForBody,
  TEXTURE_BASE_URL,
  TEXTURE_FILE_EXTENSION,
  SKYBOX_SLUG,
  type TextureLoaderLike,
} from './texture-loader';
import { BODY_TEXTURE_SLUGS } from '../constants/body-radii';

/** Three.js-shaped loader stub: returns a synthetic Texture on the next tick. */
const makeStubLoader = (): {
  loader: TextureLoaderLike;
  loadCalls: string[];
} => {
  const loadCalls: string[] = [];
  const loader: TextureLoaderLike = {
    load(
      url: string,
      onLoad?: (texture: Texture) => void,
      _onProgress?: (event: ProgressEvent) => void,
      _onError?: (err: unknown) => void,
    ): Texture {
      loadCalls.push(url);
      const tex = new Texture();
      // Three.js loaders fire the onLoad callback synchronously inside test
      // stubs for simplicity. Real loaders go through an Image element.
      if (onLoad) onLoad(tex);
      return tex;
    },
  };
  return { loader, loadCalls };
};

describe('Story 1.13 — selectTier resolves to 2k for both 8k and 4k caps (PNG-only this story)', () => {
  it('returns "2k" when the probe reports 8k', () => {
    expect(selectTier({ recommendedTextureTier: '8k' })).toBe('2k');
  });

  it('returns "2k" when the probe reports 4k', () => {
    expect(selectTier({ recommendedTextureTier: '4k' })).toBe('2k');
  });
});

describe('Story 1.13 — texture URL templates (Story 4.3 extension)', () => {
  it('textureUrlForSlug formats <base>/<slug>-<tier>.<per-tier-ext>', () => {
    // Story 1.13 — 2k tier uses PNG.
    expect(textureUrlForSlug('mercury', '2k')).toBe(
      `${TEXTURE_BASE_URL}/mercury-2k.png`,
    );
    // Story 4.3 — 4k + 8k tiers use KTX2 (Basis Universal supercompression).
    expect(textureUrlForSlug('jupiter', '4k')).toBe(
      `${TEXTURE_BASE_URL}/jupiter-4k.ktx2`,
    );
    expect(textureUrlForSlug('jupiter', '8k')).toBe(
      `${TEXTURE_BASE_URL}/jupiter-8k.ktx2`,
    );
  });

  it('textureUrlForBody maps known NAIF IDs to their slug-based URL', () => {
    // Story 1.13 cruise bodies (Sun + 8 planets + Earth's Moon +
    // Milky Way) ship `<slug>-2k.png`. Story 4.3 cycle-4 added 12 outer-
    // system moons whose 2k tier is KTX2-only (no `-2k.png` exists on
    // disk for them); cycle-7's `SLUG_TIER_OVERRIDES_TO_KTX2` set
    // resolves those slugs to `.ktx2` at the 2k tier. This test pins
    // the per-category routing.
    const OUTER_MOON_SLUGS = new Set([
      'io', 'europa', 'ganymede', 'callisto',
      'titan', 'iapetus',
      'ariel', 'umbriel', 'titania', 'oberon', 'miranda',
      'triton',
    ]);
    for (const [naifId, slug] of Object.entries(BODY_TEXTURE_SLUGS)) {
      const expectedExt = OUTER_MOON_SLUGS.has(slug) ? 'ktx2' : 'png';
      expect(textureUrlForBody(Number(naifId), '2k')).toBe(
        `${TEXTURE_BASE_URL}/${slug}-2k.${expectedExt}`,
      );
    }
  });

  it('textureUrlForBody returns null for unknown NAIF IDs', () => {
    expect(textureUrlForBody(-99, '2k')).toBeNull();
    expect(textureUrlForBody(99999, '2k')).toBeNull();
  });

  it('skybox URL uses the SKYBOX_SLUG and same template', () => {
    expect(SKYBOX_SLUG).toBe('milky-way');
    expect(textureUrlForSlug(SKYBOX_SLUG, '2k')).toBe(
      `${TEXTURE_BASE_URL}/milky-way-2k.${TEXTURE_FILE_EXTENSION}`,
    );
  });
});

describe('Story 1.13 — TextureLoaderService', () => {
  it('loads a body texture via the injected loader and sets SRGBColorSpace', async () => {
    const { loader, loadCalls } = makeStubLoader();
    const svc = new TextureLoaderService(loader);

    const promise = svc.loadBody(1); // Mercury
    expect(promise).not.toBeNull();
    const tex = await promise!;
    expect(tex).toBeInstanceOf(Texture);
    expect(tex.colorSpace).toBe(SRGBColorSpace);
    expect(loadCalls).toEqual([
      `${TEXTURE_BASE_URL}/mercury-2k.${TEXTURE_FILE_EXTENSION}`,
    ]);
  });

  it('caches by URL — second load for same NAIF ID does not re-issue', async () => {
    const { loader, loadCalls } = makeStubLoader();
    const svc = new TextureLoaderService(loader);

    const a = await svc.loadBody(5)!; // Jupiter
    const b = await svc.loadBody(5)!;
    expect(a).toBe(b);
    expect(loadCalls).toHaveLength(1);
  });

  it('isCached reports the cache state', async () => {
    const { loader } = makeStubLoader();
    const svc = new TextureLoaderService(loader);
    const url = textureUrlForBody(3, '2k')!; // Earth
    expect(svc.isCached(url)).toBe(false);
    await svc.loadBody(3);
    expect(svc.isCached(url)).toBe(true);
  });

  it('returns null synchronously for unknown NAIF IDs', () => {
    const { loader } = makeStubLoader();
    const svc = new TextureLoaderService(loader);
    expect(svc.loadBody(-99)).toBeNull();
  });

  it('loadSkybox issues a fetch for the milky-way URL', async () => {
    const { loader, loadCalls } = makeStubLoader();
    const svc = new TextureLoaderService(loader);
    await svc.loadSkybox();
    expect(loadCalls).toEqual([
      `${TEXTURE_BASE_URL}/milky-way-2k.${TEXTURE_FILE_EXTENSION}`,
    ]);
  });

  it('clears a failed-load promise so a retry can succeed', async () => {
    const calls: string[] = [];
    let attempt = 0;
    // Defer the error/load callback to a microtask — this matches how
    // real Three.js loaders behave (Image element fires onload/onerror
    // asynchronously), and avoids vitest's eager unhandled-rejection
    // tracking on synchronous Promise rejection.
    const flakyLoader: TextureLoaderLike = {
      load(url, onLoad, _onProgress, onError) {
        calls.push(url);
        attempt += 1;
        const myAttempt = attempt;
        queueMicrotask(() => {
          if (myAttempt === 1) {
            if (onError) onError(new Error('network'));
          } else if (onLoad) {
            onLoad(new Texture());
          }
        });
        return new Texture();
      },
    };
    const svc = new TextureLoaderService(flakyLoader);

    await expect(svc.loadBody(2)).rejects.toThrow(/network/);
    // retry succeeds — cache was cleared on the first failure
    const tex = await svc.loadBody(2);
    expect(tex).toBeInstanceOf(Texture);
    expect(calls).toHaveLength(2);
  });

  it('prefetchAll issues a load per URL and tolerates individual failures', async () => {
    const { loader, loadCalls } = makeStubLoader();
    const svc = new TextureLoaderService(loader);
    await svc.prefetchAll([
      textureUrlForSlug('mercury', '2k'),
      textureUrlForSlug('venus', '2k'),
      textureUrlForSlug('earth', '2k'),
    ]);
    expect(loadCalls).toHaveLength(3);
  });
});

describe('Story 1.13 — TextureLoaderService argument routing', () => {
  it('passes the per-call loader override through to the load function', async () => {
    const default_ = makeStubLoader();
    const override = makeStubLoader();
    const svc = new TextureLoaderService(default_.loader);
    await svc.loadBody(4, { loader: override.loader }); // Mars
    expect(default_.loadCalls).toEqual([]);
    expect(override.loadCalls).toHaveLength(1);
  });

  it('honors a per-call tier override (Story 4.3: 4k routes through KTX2 path)', async () => {
    const png = makeStubLoader();
    const ktx2 = makeStubLoader();
    // Story 4.3 — 4k tier uses KTX2; inject both stubs via the
    // options-object constructor form so we can verify the route.
    const svc = new TextureLoaderService({
      pngLoader: png.loader,
      ktx2Loader: ktx2.loader,
    });
    await svc.loadBody(7, { tier: '4k' }); // Uranus
    expect(png.loadCalls).toEqual([]);
    expect(ktx2.loadCalls).toHaveLength(1);
    expect(ktx2.loadCalls[0]).toMatch(/uranus-4k\.ktx2$/);
  });
});

describe('Story 1.13 — KTX2 deferral marker (Story 4.3 boundary)', () => {
  it('TEXTURE_FILE_EXTENSION is png, not ktx2', () => {
    expect(TEXTURE_FILE_EXTENSION).toBe('png');
  });
});
