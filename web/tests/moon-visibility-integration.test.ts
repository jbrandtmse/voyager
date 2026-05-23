// Story 4.11 — Integration AC (Rule 1): real EphemerisService loads the
// post-bake moon manifest entries and resolves a moon's position to a
// Float64 vector within the expected orbital range from its parent planet's
// barycenter.
//
// This closes the moon procurement story's wire-up: the producer (bake
// + satellite SPKs) emits trajectory chunks; the consumer (EphemerisService
// via `getPosition`) reads them through the live ManifestLoader + ChunkLoader
// path. Mocking either side would silently bypass exactly the integration
// that Story 4.11 set out to verify.
//
// Skips gracefully if the bake output isn't present locally (fresh checkout
// without `just bake`), mirroring the ephemeris-l2-hook fixture-presence
// gate.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { ManifestLoader, __resetCacheForTests } from '../src/services/manifest-loader';
import { ChunkLoader } from '../src/services/chunk-loader';
import { EphemerisService } from '../src/services/ephemeris-service';

const REPO_ROOT = resolve(__dirname, '..', '..');
const PUBLIC_DATA = resolve(REPO_ROOT, 'web', 'public', 'data');
const MANIFEST_PATH = resolve(PUBLIC_DATA, 'manifest.json');

const moonSlugs = [
  'io',
  'europa',
  'ganymede',
  'callisto',
  'titan',
  'hyperion',
  'iapetus',
  'ariel',
  'umbriel',
  'titania',
  'oberon',
  'miranda',
  'triton',
] as const;

const moonsAvailable =
  existsSync(MANIFEST_PATH) &&
  moonSlugs.every((slug) => existsSync(resolve(PUBLIC_DATA, `${slug}.bin.br`)));

// Build a Node fetch shim that resolves manifest + data files from
// web/public/data — same shape as ephemeris-l2-hook's shim.
const nodeFetchShim: typeof fetch = async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.endsWith('manifest.json')) {
    const json = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => json,
    } as unknown as Response;
  }
  const fileName = basename(url);
  const blobPath = resolve(PUBLIC_DATA, fileName);
  if (!existsSync(blobPath)) {
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response;
  }
  const buf = readFileSync(blobPath);
  // Vite/Cloudflare serve .bin.br with Content-Encoding: br in production;
  // Node has no auto-decompression so decompress explicitly to simulate the
  // browser-side HTTP layer behaviour (see Story 1.16 / chunk-loader.ts).
  let bytes: Buffer = buf;
  if (url.endsWith('.bin.br')) {
    bytes = brotliDecompressSync(buf);
  }
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => ab,
  } as unknown as Response;
};

// Per-encounter anchor ET in TDB seconds past J2000 (the same anchors baked
// into bake/src/bake_trajectories.py ENCOUNTERS). Pre-computed here so this
// test doesn't pull SpiceyPy at runtime — the ETs are constants of nature.
// Verified at the bake-side T1.5 introspection run.
const ENCOUNTER_ANCHORS = {
  v1j: -657244449.8, // 1979-03-05T12:05:00 UTC
  v2j: -646320609.8, // 1979-07-09T22:29:00
  v1s: -603807188.8, // 1980-11-12T23:46:00
  v2s: -579095947.8, // 1981-08-26T00:00:00
  v2u: -439754404.8, // 1986-01-24T17:59:00
  v2n: -326707383.8, // 1989-08-25T03:56:00
} as const;

// Per-moon (encounter, naif, expected orbital-range bounds in km from its
// parent's barycenter). Bounds verified against the T1.5 introspection run
// in `bake/tests/test_bake_moon_trajectories.py:EXPECTED_ORBITAL_RANGE_KM`.
interface MoonExpectation {
  slug: string;
  naif: number;
  parentNaif: number;
  encounter: keyof typeof ENCOUNTER_ANCHORS;
  rangeKmLo: number;
  rangeKmHi: number;
}

const MOON_EXPECTATIONS: readonly MoonExpectation[] = [
  // Galileans at V1J anchor
  { slug: 'io', naif: 501, parentNaif: 5, encounter: 'v1j', rangeKmLo: 350_000, rangeKmHi: 500_000 },
  {
    slug: 'europa',
    naif: 502,
    parentNaif: 5,
    encounter: 'v1j',
    rangeKmLo: 600_000,
    rangeKmHi: 730_000,
  },
  {
    slug: 'ganymede',
    naif: 503,
    parentNaif: 5,
    encounter: 'v1j',
    rangeKmLo: 1_000_000,
    rangeKmHi: 1_150_000,
  },
  {
    slug: 'callisto',
    naif: 504,
    parentNaif: 5,
    encounter: 'v1j',
    rangeKmLo: 1_700_000,
    rangeKmHi: 2_000_000,
  },
  // Saturn at V1S anchor
  {
    slug: 'titan',
    naif: 606,
    parentNaif: 6,
    encounter: 'v1s',
    rangeKmLo: 1_100_000,
    rangeKmHi: 1_300_000,
  },
  {
    slug: 'hyperion',
    naif: 607,
    parentNaif: 6,
    encounter: 'v1s',
    rangeKmLo: 1_300_000,
    rangeKmHi: 1_600_000,
  },
  {
    slug: 'iapetus',
    naif: 608,
    parentNaif: 6,
    encounter: 'v1s',
    rangeKmLo: 3_300_000,
    rangeKmHi: 3_800_000,
  },
  // Uranus at V2U anchor
  {
    slug: 'ariel',
    naif: 701,
    parentNaif: 7,
    encounter: 'v2u',
    rangeKmLo: 150_000,
    rangeKmHi: 230_000,
  },
  {
    slug: 'umbriel',
    naif: 702,
    parentNaif: 7,
    encounter: 'v2u',
    rangeKmLo: 220_000,
    rangeKmHi: 310_000,
  },
  {
    slug: 'titania',
    naif: 703,
    parentNaif: 7,
    encounter: 'v2u',
    rangeKmLo: 380_000,
    rangeKmHi: 490_000,
  },
  {
    slug: 'oberon',
    naif: 704,
    parentNaif: 7,
    encounter: 'v2u',
    rangeKmLo: 530_000,
    rangeKmHi: 640_000,
  },
  {
    slug: 'miranda',
    naif: 705,
    parentNaif: 7,
    encounter: 'v2u',
    rangeKmLo: 100_000,
    rangeKmHi: 160_000,
  },
  // Neptune at V2N anchor
  {
    slug: 'triton',
    naif: 801,
    parentNaif: 8,
    encounter: 'v2n',
    rangeKmLo: 290_000,
    rangeKmHi: 410_000,
  },
];

const describeOrSkip = moonsAvailable ? describe : describe.skip;

describeOrSkip('Story 4.11 — moon visibility integration (real bake + real service)', () => {
  it.each(MOON_EXPECTATIONS)(
    '$slug (NAIF $naif) resolves at $encounter anchor to a position $rangeKmLo–$rangeKmHi km from parent barycenter $parentNaif',
    async ({ slug, naif, parentNaif, encounter, rangeKmLo, rangeKmHi }) => {
      __resetCacheForTests();

      const manifest = await ManifestLoader.load('/data/manifest.json', {
        fetchImpl: nodeFetchShim,
      });

      const moonBody = manifest.bodies.find((b) => b.naifId === naif);
      expect(
        moonBody,
        `moon NAIF ${naif} (${slug}) missing from manifest — bake produced ${manifest.bodies.length} bodies`,
      ).toBeDefined();
      const parentBody = manifest.bodies.find((b) => b.naifId === parentNaif);
      expect(
        parentBody,
        `parent barycenter NAIF ${parentNaif} missing from manifest`,
      ).toBeDefined();

      // Size the LRU to fit the largest body's file count (mirroring the
      // ephemeris-l2-hook pattern — manifests with attitude entries can
      // exceed the production DEFAULT_LRU_CAPACITY of 12).
      const maxBodyFiles = Math.max(
        ...manifest.bodies.map((b) => b.files.length),
      );
      const testLruCapacity = Math.max(32, maxBodyFiles + 4);
      const chunkLoader = new ChunkLoader({
        capacity: testLruCapacity,
        fetchImpl: nodeFetchShim,
      });
      const svc = new EphemerisService(manifest, chunkLoader);

      // Pre-load every chunk this body + parent will touch (same warmup
      // pattern as ephemeris-l2-hook).
      for (const file of moonBody!.files) {
        if (file.kind === 'trajectory') {
          await chunkLoader.load(file);
        }
      }
      for (const file of parentBody!.files) {
        if (file.kind === 'trajectory') {
          await chunkLoader.load(file);
        }
      }

      const anchorEt = ENCOUNTER_ANCHORS[encounter];

      const moonPos = svc.getPosition(anchorEt, naif);
      expect(
        moonPos,
        `EphemerisService.getPosition returned null for ${slug} (NAIF ${naif}) at ${encounter} anchor — moon trajectory chunk did not resolve`,
      ).not.toBeNull();

      const parentPos = svc.getPosition(anchorEt, parentNaif);
      expect(
        parentPos,
        `EphemerisService.getPosition returned null for parent NAIF ${parentNaif} at ${encounter} anchor`,
      ).not.toBeNull();

      // AC4 — Float64 vector, not stacked at parent's heliocentric coords.
      // The moon's heliocentric position should land at orbital range from
      // the parent barycenter.
      const dx = moonPos![0] - parentPos![0];
      const dy = moonPos![1] - parentPos![1];
      const dz = moonPos![2] - parentPos![2];
      const distanceKm = Math.sqrt(dx * dx + dy * dy + dz * dz);

      expect(
        distanceKm,
        `${slug} (NAIF ${naif}): distance from parent barycenter ${parentNaif} = ${distanceKm.toFixed(0)} km, expected [${rangeKmLo}, ${rangeKmHi}] km — the moon may be incorrectly stacked at heliocentric coords (the pre-Story-4.11 graceful-skip behaviour)`,
      ).toBeGreaterThanOrEqual(rangeKmLo);
      expect(
        distanceKm,
        `${slug} (NAIF ${naif}): distance from parent barycenter ${parentNaif} = ${distanceKm.toFixed(0)} km, expected [${rangeKmLo}, ${rangeKmHi}] km`,
      ).toBeLessThanOrEqual(rangeKmHi);

      // AC4 — confirm Float64 typed-array return shape (the WorldVec3
      // brand). A naive number[] would still pass the distance assertion
      // but would silently drop precision below NFR-P9.
      expect(
        moonPos instanceof Float64Array,
        `${slug} position is not a Float64Array — WorldVec3 brand contract violated`,
      ).toBe(true);
    },
  );
});

if (!moonsAvailable) {
  describe.skip(
    'Story 4.11 moon integration (skipped: bake artifacts not present in web/public/data)',
    () => {
      it('placeholder', () => {});
    },
  );
}
