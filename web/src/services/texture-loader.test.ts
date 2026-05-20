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

describe('Story 1.13 — texture URL templates', () => {
  it('textureUrlForSlug formats <base>/<slug>-<tier>.<ext>', () => {
    expect(textureUrlForSlug('mercury', '2k')).toBe(
      `${TEXTURE_BASE_URL}/mercury-2k.${TEXTURE_FILE_EXTENSION}`,
    );
    expect(textureUrlForSlug('jupiter', '4k')).toBe(
      `${TEXTURE_BASE_URL}/jupiter-4k.${TEXTURE_FILE_EXTENSION}`,
    );
  });

  it('textureUrlForBody maps known NAIF IDs to their slug-based URL', () => {
    for (const [naifId, slug] of Object.entries(BODY_TEXTURE_SLUGS)) {
      expect(textureUrlForBody(Number(naifId), '2k')).toBe(
        `${TEXTURE_BASE_URL}/${slug}-2k.${TEXTURE_FILE_EXTENSION}`,
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

  it('honors a per-call tier override', async () => {
    const { loader, loadCalls } = makeStubLoader();
    const svc = new TextureLoaderService(loader);
    // Story 1.13 only ships 2k, but the API supports 4k — used as a
    // forward-looking hook for Story 4.3 callers.
    await svc.loadBody(7, { tier: '4k' }); // Uranus
    expect(loadCalls[0]).toMatch(/uranus-4k\.png$/);
  });
});

describe('Story 1.13 — KTX2 deferral marker (Story 4.3 boundary)', () => {
  it('TEXTURE_FILE_EXTENSION is png, not ktx2', () => {
    expect(TEXTURE_FILE_EXTENSION).toBe('png');
  });
});
