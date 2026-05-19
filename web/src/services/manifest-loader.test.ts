import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  ManifestLoader,
  ManifestValidationError,
  __resetCacheForTests,
  type Manifest,
} from './manifest-loader';

// Hand-crafted minimal valid manifest. SHA strings are 64 hex chars.
const SHA = 'a'.repeat(64);

const validManifest = {
  schemaVersion: 1,
  bakeCommit: '7f850febaa40f2dc4443ef1f539a0f93c5ea539b',
  bakeTimestamp: '2026-05-19T00:04:39Z',
  kernels: [
    {
      file: 'naif0012.tls',
      kind: 'lsk',
      sha256: SHA,
      source_url: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls',
    },
  ],
  bodies: [
    {
      naifId: -31,
      name: 'Voyager 1',
      files: [
        {
          cadenceSec: 60.0,
          kind: 'trajectory',
          sha256: SHA,
          sizeBytes: 132171,
          timeRangeEt: [-704412035.617, -704170303.4],
          url: 'data/voyager-1-seg01.bin.br',
        },
      ],
    },
  ],
  chapters: [],
  validationTolerances: {
    maxPositionErrorKm: 20.0,
    rmsPositionErrorKm: 5.0,
  },
};

const mockResponse = (body: unknown, ok = true, status = 200): Response => ({
  ok,
  status,
  statusText: ok ? 'OK' : 'Error',
  json: async () => body,
}) as unknown as Response;

beforeEach(() => {
  __resetCacheForTests();
});

describe('ManifestLoader.load — happy path', () => {
  it('fetches and parses a valid manifest', async () => {
    const fetchImpl = vi.fn(async () => mockResponse(validManifest));
    const manifest = await ManifestLoader.load('/data/manifest.json', { fetchImpl });
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.bodies).toHaveLength(1);
    expect(manifest.bodies[0].naifId).toBe(-31);
    expect(manifest.bodies[0].files[0].sha256).toBe(SHA);
    expect(manifest.validationTolerances.maxPositionErrorKm).toBe(20.0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns the cached promise on a second call with the same URL', async () => {
    const fetchImpl = vi.fn(async () => mockResponse(validManifest));
    const a = ManifestLoader.load('/data/manifest.json', { fetchImpl });
    const b = ManifestLoader.load('/data/manifest.json', { fetchImpl });
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('parses the live bake/out/manifest.json (real fixture)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const path = resolve(__dirname, '..', '..', '..', 'bake', 'out', 'manifest.json');
    const text = readFileSync(path, 'utf-8');
    const json = JSON.parse(text);
    const fetchImpl = vi.fn(async () => mockResponse(json));
    const manifest: Manifest = await ManifestLoader.load(
      '/data/manifest.json',
      { fetchImpl },
    );
    // V1 has 7 segments, V2 has 11 = 18 total
    const total = manifest.bodies.reduce((acc, b) => acc + b.files.length, 0);
    expect(total).toBe(18);
    expect(manifest.bodies.map((b) => b.naifId).sort((a, b) => a - b)).toEqual([-32, -31]);
  });
});

describe('ManifestLoader.load — schema rejection', () => {
  it('rejects when schemaVersion is the wrong literal', async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({ ...validManifest, schemaVersion: 2 }),
    );
    await expect(
      ManifestLoader.load('/v2.json', { fetchImpl }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
  });

  it('rejects when a required field is missing (bodies)', async () => {
    const { bodies: _omitted, ...rest } = validManifest;
    const fetchImpl = vi.fn(async () => mockResponse(rest));
    await expect(
      ManifestLoader.load('/missing-bodies.json', { fetchImpl }),
    ).rejects.toThrow(/bodies/);
  });

  it('rejects when sha256 is not 64 hex chars', async () => {
    const broken = JSON.parse(JSON.stringify(validManifest));
    broken.bodies[0].files[0].sha256 = 'tooshort';
    const fetchImpl = vi.fn(async () => mockResponse(broken));
    await expect(
      ManifestLoader.load('/bad-sha.json', { fetchImpl }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
  });

  it('rejects when a number field is the wrong type', async () => {
    const broken = JSON.parse(JSON.stringify(validManifest));
    broken.bodies[0].files[0].sizeBytes = 'not-a-number';
    const fetchImpl = vi.fn(async () => mockResponse(broken));
    await expect(
      ManifestLoader.load('/bad-size.json', { fetchImpl }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
  });

  it('reports the offending JSON path in the error message', async () => {
    const broken = JSON.parse(JSON.stringify(validManifest));
    broken.bodies[0].files[0].sha256 = 'tooshort';
    const fetchImpl = vi.fn(async () => mockResponse(broken));
    try {
      await ManifestLoader.load('/path-report.json', { fetchImpl });
      throw new Error('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestValidationError);
      const e = err as ManifestValidationError;
      expect(e.message).toMatch(/bodies/);
      expect(e.message).toMatch(/files/);
      expect(e.message).toMatch(/sha256/);
    }
  });

  it('rejects when HTTP returns non-2xx', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({}, false, 404));
    await expect(
      ManifestLoader.load('/missing.json', { fetchImpl }),
    ).rejects.toThrow(/404/);
  });

  it('does not poison the cache on rejection (retry works)', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return mockResponse({}, false, 503);
      return mockResponse(validManifest);
    });
    await expect(
      ManifestLoader.load('/retry.json', { fetchImpl }),
    ).rejects.toThrow();
    const manifest = await ManifestLoader.load('/retry.json', { fetchImpl });
    expect(manifest.schemaVersion).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
