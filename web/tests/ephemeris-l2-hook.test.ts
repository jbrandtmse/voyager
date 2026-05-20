// Story 1.6 AC4 — Layer-2 runtime hook test.
//
// Loads the SpiceyPy-generated reference fixture at
// `bake/out/l2-reference-fixtures.json`, exercises the live EphemerisService
// against the same VTRJ files via a Node-backed fetch shim, and asserts
// max <= 20 km / RMS <= 5 km per body (NFR-P9 thresholds, mirroring the L1
// Python harness from Story 1.4).
//
// This is the "smaller smoke test" sibling of the full per-frame L2 harness
// that Story 3.7 lands. It validates that the web-side runtime interpolator
// (cubic Hermite over Float64 samples, plus the manifest+chunk pipeline)
// reproduces the bake-time accuracy on a sparse, deterministic ET grid.
//
// Skips gracefully if either the fixture JSON or the VTRJ files are absent
// (fresh checkout without a bake run).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { ManifestLoader, __resetCacheForTests } from '../src/services/manifest-loader';
import { ChunkLoader } from '../src/services/chunk-loader';
import { EphemerisService } from '../src/services/ephemeris-service';

const REPO_ROOT = resolve(__dirname, '..', '..');
const BAKE_OUT = resolve(REPO_ROOT, 'bake', 'out');
const MANIFEST_PATH = resolve(BAKE_OUT, 'manifest.json');
const FIXTURES_PATH = resolve(BAKE_OUT, 'l2-reference-fixtures.json');

interface FixtureSample {
  et: number;
  position: [number, number, number];
  velocity: [number, number, number];
}

interface FixtureBody {
  naifId: number;
  name: string;
  samples: FixtureSample[];
}

interface Fixtures {
  schemaVersion: 1;
  generated: string;
  bodies: FixtureBody[];
}

const fixturesAvailable = existsSync(FIXTURES_PATH) && existsSync(MANIFEST_PATH);

// Build a fetch shim that resolves `/data/...` and `data/...` to the on-disk
// VTRJ blob, plus the manifest URL to the on-disk manifest JSON.
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
  // ManifestFile.url is "data/voyager-...bin.br" relative to web/public/.
  // Resolve it to the bake/out copy on disk.
  const fileName = basename(url);
  const blobPath = resolve(BAKE_OUT, fileName);
  if (!existsSync(blobPath)) {
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response;
  }
  const buf = readFileSync(blobPath);
  // Story 1.16 — In production, Vite + Cloudflare serve .bin.br with
  // Content-Encoding: br; the browser HTTP layer auto-decompresses before
  // the chunk-loader sees bytes. Node has no such auto-decompression, so
  // this test shim must do it explicitly to simulate the browser behavior.
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

// Node v22 lacks DecompressionStream('br'); use zlib synchronously.
// (Story 1.16 removed nodeBrotliDecompress — chunk-loader no longer decompresses)

const describeOrSkip = fixturesAvailable ? describe : describe.skip;

describeOrSkip('Story 1.6 AC4 — L2 hook (web-side interpolator vs SpiceyPy reference)', () => {
  it('fixtures file is present and well-formed', () => {
    const stat = statSync(FIXTURES_PATH);
    expect(stat.size).toBeLessThan(2_000_000); // 2 MB safety cap
    const data = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8')) as Fixtures;
    expect(data.schemaVersion).toBe(1);
    expect(data.bodies.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    { naifId: -31, name: 'Voyager 1' },
    { naifId: -32, name: 'Voyager 2' },
  ])(
    '$name interpolated states match SpiceyPy reference within NFR-P9 (max <= 20 km, RMS <= 5 km)',
    async ({ naifId, name }) => {
      __resetCacheForTests();
      const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8')) as Fixtures;
      const body = fixtures.bodies.find((b) => b.naifId === naifId);
      expect(body, `fixture body for NAIF ${naifId} missing`).toBeDefined();
      expect(body!.samples.length).toBeGreaterThan(0);

      const manifest = await ManifestLoader.load('/data/manifest.json', {
        fetchImpl: nodeFetchShim,
      });
      const chunkLoader = new ChunkLoader({
        fetchImpl: nodeFetchShim,
      });
      const svc = new EphemerisService(manifest, chunkLoader);

      // Pre-load every chunk this body's samples will touch.
      const bodyManifest = manifest.bodies.find((b) => b.naifId === naifId)!;
      for (const file of bodyManifest.files) {
        await chunkLoader.load(file);
      }

      let maxErr = 0;
      let sumSq = 0;
      let n = 0;
      for (const sample of body!.samples) {
        const state = svc.getStateAt(sample.et, naifId);
        expect(
          state,
          `EphemerisService.getStateAt returned null at et=${sample.et} for ${name}`,
        ).not.toBeNull();
        const dx = state!.position[0] - sample.position[0];
        const dy = state!.position[1] - sample.position[1];
        const dz = state!.position[2] - sample.position[2];
        const err = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (err > maxErr) maxErr = err;
        sumSq += err * err;
        n += 1;
      }
      const rms = Math.sqrt(sumSq / n);
      console.log(
        `[L2] ${name}: n=${n}, max=${maxErr.toFixed(6)} km, RMS=${rms.toFixed(6)} km`,
      );
      expect(maxErr, `max position error for ${name} = ${maxErr.toFixed(3)} km`).toBeLessThanOrEqual(
        20.0,
      );
      expect(rms, `RMS position error for ${name} = ${rms.toFixed(3)} km`).toBeLessThanOrEqual(5.0);
    },
  );
});

if (!fixturesAvailable) {
  describe.skip(
    'Story 1.6 AC4 — L2 hook (skipped: fixtures not generated)',
    () => {
      it('placeholder', () => {});
    },
  );
}
