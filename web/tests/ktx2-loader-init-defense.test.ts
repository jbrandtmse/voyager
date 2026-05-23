// @vitest-environment happy-dom
/**
 * Story 4.3 cycle-6 — KTX2Loader init defense (smoke-driven).
 *
 * Cycle-5 lead-driven Chrome DevTools MCP smoke caught a defect that
 * passed through the cycle-1..5 vitest + integration tiers cleanly:
 * `TextureLoaderService` was constructed with no arguments in
 * `web/src/main.ts`, hitting the no-renderer constructor branch which
 * skipped the canonical Three.js boilerplate call
 * `KTX2Loader.detectSupport(renderer)`. The runtime symptom was:
 *
 *   [warn] [celestial-bodies] texture upgrade failed for NAIF 5 → 4k:
 *     Error: THREE.KTX2Loader: Missing initialization with
 *     `.detectSupport( renderer )`.
 *   [warn] [celestial-bodies] moon texture load failed for NAIF 501..504:
 *     [object Event]
 *
 * Both AC4's gas-giant upgrade AND AC5's moon-mesh texture loads
 * failed. The 16 KTX2 outputs on disk sat untouched (zero `.ktx2`
 * requests in the network log).
 *
 * Root cause: Three.js's `KTX2Loader` requires a one-time
 * `.detectSupport(renderer)` call before any `.load()` calls. The
 * detection queries the WebGLRenderer for compressed-texture-format
 * support (UASTC LDR, BC7, ETC, etc.) so the loader knows which
 * Basis Universal transcode target to use. Without it, every KTX2
 * `.load()` rejects with the message above.
 *
 * This pattern of defect — "boilerplate init you forgot" — is
 * catastrophic in prod but invisible to test tiers because the tests
 * mock the loader (a mock `loadBody` that records `naifId` doesn't
 * exercise the real KTX2Loader → detectSupport path). This file
 * closes the test-pyramid gap by spying on
 * `KTX2Loader.prototype.detectSupport` and asserting:
 *
 *   1. `detectSupport` IS called when `TextureLoaderService` is
 *      constructed with a renderer (production path).
 *   2. `detectSupport` is called EXACTLY ONCE per constructed loader.
 *   3. `detectSupport` is called with the renderer the caller passed.
 *   4. `detectSupport` is called BEFORE any `loadBody()` invocation.
 *   5. `detectSupport` is NOT called when no renderer is supplied
 *      (the cycle-6 default-construct path remains a no-op for tests).
 *
 * The "called before loadBody" assertion is the load-bearing one — the
 * cycle-5 defect was effectively "loadBody was called before
 * detectSupport (because detectSupport was never called)". Pinning the
 * ordering AT CONSTRUCTION TIME (not at load time) closes the contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

import { TextureLoaderService } from '../src/services/texture-loader';

// === Minimal renderer-shape stub ====================================

/**
 * Build the minimum renderer-shaped object that
 * `KTX2Loader.detectSupport(renderer)` reads. Three.js's
 * `detectSupport` queries `renderer.extensions.has(name)` for ASTC /
 * ETC / DXT / BPTC / PVRTC compressed-texture extensions (returning
 * false for "not supported"), and `renderer.capabilities.isWebGL2`
 * for the WebGL2 flag. Returning `false` for every `.has()` call
 * makes the loader report "no compressed texture support found",
 * which is what a low-end / headless WebGL context would surface.
 * For THIS test we're not exercising decode, just the init contract.
 */
const makeMinRenderer = (): {
  extensions: {
    has: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  capabilities: { isWebGL2: boolean; maxAnisotropy: number };
} => ({
  extensions: {
    has: vi.fn(() => false),
    get: vi.fn(() => null),
  },
  capabilities: { isWebGL2: true, maxAnisotropy: 1 },
});

// === Tests ==========================================================

describe('Story 4.3 cycle-6 — KTX2Loader.detectSupport(renderer) is called at TextureLoaderService construction', () => {
  let detectSupportSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy at the PROTOTYPE level so every freshly-constructed
    // KTX2Loader inside the service uses the spied method.
    detectSupportSpy = vi.spyOn(KTX2Loader.prototype, 'detectSupport');
  });

  afterEach(() => {
    detectSupportSpy.mockRestore();
  });

  it('IS called when TextureLoaderService is constructed with { renderer }', () => {
    const renderer = makeMinRenderer();
    new TextureLoaderService({ renderer });
    expect(detectSupportSpy).toHaveBeenCalled();
  });

  it('is called EXACTLY ONCE per constructed TextureLoaderService instance', () => {
    const renderer = makeMinRenderer();
    new TextureLoaderService({ renderer });
    expect(detectSupportSpy).toHaveBeenCalledTimes(1);
  });

  it('is called with the renderer the caller passed', () => {
    const renderer = makeMinRenderer();
    new TextureLoaderService({ renderer });
    expect(detectSupportSpy).toHaveBeenCalledWith(renderer);
  });

  it('is called BEFORE any loadBody() invocation (the cycle-5 ordering defect)', async () => {
    // Track call order via a single event log. We can't spy on `load`
    // at the KTX2Loader prototype because the production code wraps it
    // in `adaptKtx2Loader`; instead we exercise the contract through a
    // stub ktx2Loader that records its own load call, and assert that
    // detectSupport happened FIRST.
    const events: string[] = [];
    detectSupportSpy.mockImplementation(() => {
      events.push('detectSupport');
      return undefined as unknown as KTX2Loader;
    });
    const stubKtx2: import('../src/services/texture-loader').TextureLoaderLike = {
      load(_url, onLoad) {
        events.push('ktx2Loader.load');
        // Resolve synchronously with a fake texture so the load
        // promise doesn't dangle.
        if (onLoad !== undefined) {
          onLoad({} as unknown as import('three').Texture);
        }
        return {} as unknown as import('three').Texture;
      },
    };
    // Construct the service with BOTH the renderer (which triggers
    // detectSupport on the default-constructed loader) AND a stub
    // ktx2Loader. The stub takes precedence as the loader actually
    // used; detectSupport is NOT called because the default-construct
    // branch is bypassed when ktx2Loader is supplied.
    //
    // To exercise the ordering contract we instead use the path where
    // ONLY renderer is passed — service constructs its own KTX2Loader
    // and calls detectSupport, then routes loads through it.
    //
    // Since we can't easily intercept the real load without standing
    // up Basis WASM, we verify the order via a SEPARATE construct
    // + load pair using a captured event log: detectSupport fires
    // inside the constructor, before any subsequent service method
    // could possibly run.
    const renderer = makeMinRenderer();
    const svc = new TextureLoaderService({
      renderer,
      ktx2Loader: stubKtx2,
    });
    // detectSupport should NOT have fired (stub-loader path bypasses
    // the default-construct branch). Verify this — the test for the
    // renderer-only path is the per-test above.
    expect(events).toEqual([]); // stub-loader path
    await svc.loadBySlug('jupiter', '4k', { loader: stubKtx2 });
    expect(events).toEqual(['ktx2Loader.load']);

    // Now exercise the renderer-only path with the same event log.
    events.length = 0;
    new TextureLoaderService({ renderer });
    expect(events).toEqual(['detectSupport']);
  });

  it('is NOT called when no renderer is supplied (test/default-construct path)', () => {
    new TextureLoaderService(); // no args — Story-1.13 default-construct
    expect(detectSupportSpy).not.toHaveBeenCalled();
  });

  it('is NOT called when a custom ktx2Loader stub is supplied (test-injection path)', () => {
    const stubKtx2: import('../src/services/texture-loader').TextureLoaderLike = {
      load: vi.fn(),
    };
    new TextureLoaderService({ ktx2Loader: stubKtx2 });
    // Stub overrides the default KTX2Loader entirely; detectSupport
    // is not reachable on the stub object, and the service does NOT
    // try to call it on the stub.
    expect(detectSupportSpy).not.toHaveBeenCalled();
  });
});

describe('Story 4.3 cycle-6 — main.ts wire-up: TextureLoaderService receives a non-null renderer', () => {
  // Source-grep defense. Mirrors the boresight-renderer-qa-gaps.test.ts
  // pattern: scan main.ts for the canonical wire-up shape so a future
  // refactor that drops the renderer arg fails this test rather than
  // silently re-introducing the cycle-5 defect at runtime.
  it('main.ts constructs TextureLoaderService with a renderer (or `undefined` for legacy fallback)', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const mainTs = await readFile(
      resolve(__dirname, '..', 'src', 'main.ts'),
      'utf-8',
    );
    // Expect:
    //   const textureLoader = new TextureLoaderService(
    //     rendererForTextures !== null ? { renderer: rendererForTextures } : undefined,
    //   );
    expect(mainTs).toMatch(/new TextureLoaderService\(/);
    expect(mainTs).toMatch(/renderer:\s*rendererForTextures/);
    expect(mainTs).toMatch(/engine\.getRenderer\(\)/);
  });
});

// === Story 4.3 cycle-7 — single-loader discipline + moon-path coverage ====

/**
 * Cycle-6 fixed `detectSupport(renderer)` for the gas-giant upgrade path.
 * Cycle-7 smoke iter-3 surfaced the real moon-failure root cause: cycle-3's
 * `TEXTURE_FILE_EXTENSION_BY_TIER` map said `2k -> png`, but the outer-
 * system moon procurement (cycle-4) shipped 2k as KTX2 only. The URL
 * builder resolved `io-2k.png` (no such file -> 404), and the load went
 * through the PNG TextureLoader (because `tier === '2k'` routed there)
 * producing the `[object Event]` error. Cycle-7 fix: per-slug override
 * `SLUG_TIER_OVERRIDES_TO_KTX2` forces the 12 outer-moon slugs to route
 * to `.ktx2` at the 2k tier; the internal `load()` method now routes by
 * URL extension (the authoritative signal), not by tier.
 *
 * Also pins the single-loader discipline the lead's cycle-7 smoke noted
 * ("Multiple active KTX2 loaders" Three.js advisory warning).
 */

interface TextureLoaderLikeForTest {
  load: ReturnType<typeof vi.fn>;
}

describe('Story 4.3 cycle-7 — single-loader discipline', () => {
  it('TextureLoaderService instantiates AT MOST ONE KTX2Loader per construction', () => {
    // We can't easily intercept the `new KTX2Loader()` constructor
    // without replacing the export, so instead we count via the
    // detectSupport spy proxy: every KTX2Loader instance constructed in
    // the production path also calls detectSupport (when a renderer is
    // supplied). One detectSupport call ≡ one KTX2Loader instance.
    const detectSupportSpy = vi.spyOn(KTX2Loader.prototype, 'detectSupport');
    const renderer = {
      extensions: { has: vi.fn(() => false), get: vi.fn(() => null) },
      capabilities: { isWebGL2: true, maxAnisotropy: 1 },
    };
    new TextureLoaderService({ renderer });
    expect(detectSupportSpy).toHaveBeenCalledTimes(1);
    detectSupportSpy.mockRestore();
  });

  it('two separate TextureLoaderService instances each construct their own KTX2Loader (NOT shared)', () => {
    // Documents the SHAPE — TextureLoaderService is a per-instance
    // owner of its KTX2Loader. If the application accidentally
    // constructs the service twice, you get TWO loaders (which
    // triggers Three.js's "Multiple active KTX2 loaders" warning).
    // The main.ts wire-up constructs the service exactly once; this
    // test pins the shape so a refactor that re-constructs the service
    // accidentally surfaces in the smoke-evidence warning rather than
    // silently fragmenting GPU texture state.
    const detectSupportSpy = vi.spyOn(KTX2Loader.prototype, 'detectSupport');
    const renderer = {
      extensions: { has: vi.fn(() => false), get: vi.fn(() => null) },
      capabilities: { isWebGL2: true, maxAnisotropy: 1 },
    };
    new TextureLoaderService({ renderer });
    new TextureLoaderService({ renderer });
    expect(detectSupportSpy).toHaveBeenCalledTimes(2); // one per service
    detectSupportSpy.mockRestore();
  });

  it('main.ts constructs TextureLoaderService EXACTLY ONCE (defense against multi-instance regression)', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const mainTs = await readFile(
      resolve(__dirname, '..', 'src', 'main.ts'),
      'utf-8',
    );
    // Strip block + line comments so the count reflects executable
    // code, not commentary that might mention the constructor.
    const stripComments = (src: string): string => {
      let out = '';
      let i = 0;
      while (i < src.length) {
        if (src[i] === '/' && src[i + 1] === '*') {
          const end = src.indexOf('*/', i + 2);
          if (end < 0) break;
          i = end + 2;
          continue;
        }
        if (src[i] === '/' && src[i + 1] === '/') {
          const end = src.indexOf('\n', i + 2);
          if (end < 0) break;
          i = end;
          continue;
        }
        out += src[i];
        i++;
      }
      return out;
    };
    const stripped = stripComments(mainTs);
    const matches = stripped.match(/new TextureLoaderService\(/g);
    expect(matches?.length ?? 0).toBe(1);
  });
});

describe('Story 4.3 cycle-7 — moon-path KTX2 routing (cycle-3 tier-ext map regression closure)', () => {
  it('a moon slug at the 2k tier routes through the KTX2 loader (NOT PNG)', () => {
    // Cycle-3 map: `2k -> png`. Cycle-7 override:
    // `SLUG_TIER_OVERRIDES_TO_KTX2.has('io') -> ktx2`. Service routes
    // by URL extension; pin both the URL shape and the loader-selection.
    const pngStub: TextureLoaderLikeForTest = { load: vi.fn() };
    const ktx2Stub: TextureLoaderLikeForTest = { load: vi.fn() };
    const svc = new TextureLoaderService({
      pngLoader: pngStub as unknown as Parameters<typeof TextureLoaderService>[0] extends infer T ? T : never,
      ktx2Loader: ktx2Stub as unknown as import('../src/services/texture-loader').TextureLoaderLike,
    } as unknown as ConstructorParameters<typeof TextureLoaderService>[0]);
    void svc.loadBody(501, { tier: '2k' }); // Io at 2k
    expect(ktx2Stub.load).toHaveBeenCalledTimes(1);
    expect(pngStub.load).not.toHaveBeenCalled();
    const ktx2Url = ktx2Stub.load.mock.calls[0]?.[0];
    expect(ktx2Url).toBe('/textures/io-2k.ktx2');
  });

  it("Earth's Moon (cruise-body Story 1.13) still routes through the PNG loader at the 2k tier", () => {
    // The cycle-7 override is per-slug for the 12 outer moons ONLY.
    // Story 1.13's cruise moon (NAIF 301, slug `'moon'`) is unchanged.
    const pngStub: TextureLoaderLikeForTest = { load: vi.fn() };
    const ktx2Stub: TextureLoaderLikeForTest = { load: vi.fn() };
    const svc = new TextureLoaderService({
      pngLoader: pngStub as unknown as import('../src/services/texture-loader').TextureLoaderLike,
      ktx2Loader: ktx2Stub as unknown as import('../src/services/texture-loader').TextureLoaderLike,
    });
    void svc.loadBody(301, { tier: '2k' }); // Earth's Moon at 2k
    expect(pngStub.load).toHaveBeenCalledTimes(1);
    expect(ktx2Stub.load).not.toHaveBeenCalled();
    const pngUrl = pngStub.load.mock.calls[0]?.[0];
    expect(pngUrl).toBe('/textures/moon-2k.png');
  });

  it('all 12 outer-moon slugs route to ktx2 at the 2k tier', () => {
    // Full coverage of the SLUG_TIER_OVERRIDES_TO_KTX2 set so a future
    // refactor that drops a slug (or adds one that doesn't actually
    // have a KTX2 file on disk) breaks this test.
    const OUTER_MOON_NAIFS_TO_SLUGS: ReadonlyArray<[number, string]> = [
      [501, 'io'], [502, 'europa'], [503, 'ganymede'], [504, 'callisto'],
      [606, 'titan'], [608, 'iapetus'],
      [701, 'ariel'], [702, 'umbriel'], [703, 'titania'], [704, 'oberon'],
      [705, 'miranda'], [801, 'triton'],
    ];
    for (const [naifId, slug] of OUTER_MOON_NAIFS_TO_SLUGS) {
      const pngStub: TextureLoaderLikeForTest = { load: vi.fn() };
      const ktx2Stub: TextureLoaderLikeForTest = { load: vi.fn() };
      const svc = new TextureLoaderService({
        pngLoader: pngStub as unknown as import('../src/services/texture-loader').TextureLoaderLike,
        ktx2Loader: ktx2Stub as unknown as import('../src/services/texture-loader').TextureLoaderLike,
      });
      void svc.loadBody(naifId, { tier: '2k' });
      expect(
        ktx2Stub.load,
        `moon NAIF ${naifId} (${slug}) should route to ktx2 at 2k tier`,
      ).toHaveBeenCalledTimes(1);
      expect(pngStub.load).not.toHaveBeenCalled();
      const url = ktx2Stub.load.mock.calls[0]?.[0];
      expect(url).toBe(`/textures/${slug}-2k.ktx2`);
    }
  });

  it('Hyperion (NAIF 607) returns null synchronously (no slug, grey placeholder) — never reaches the URL builder', () => {
    const pngStub: TextureLoaderLikeForTest = { load: vi.fn() };
    const ktx2Stub: TextureLoaderLikeForTest = { load: vi.fn() };
    const svc = new TextureLoaderService({
      pngLoader: pngStub as unknown as import('../src/services/texture-loader').TextureLoaderLike,
      ktx2Loader: ktx2Stub as unknown as import('../src/services/texture-loader').TextureLoaderLike,
    });
    const result = svc.loadBody(607); // Hyperion
    expect(result).toBeNull();
    expect(pngStub.load).not.toHaveBeenCalled();
    expect(ktx2Stub.load).not.toHaveBeenCalled();
  });
});
