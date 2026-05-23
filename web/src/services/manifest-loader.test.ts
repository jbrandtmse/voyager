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
    // Story 1.13 extended the body set: 7 V1 segments + 11 V2 + 10
    // celestial single-files = 28 trajectory files.
    // Story 3.1 added attitude entries (bus_attitude × spacecraft × window,
    // platform_attitude × spacecraft × window for windows with CK platform
    // coverage). Story 4.0 AC2 fixed the type-1 platform-VTRJ gap so the
    // platform count rises to 6 (V1 PBD remains skipped — no platform CK).
    // Story 4.3 added 18 encounter cadence-band trajectory entries (6
    // encounters × 3 cadence bands attached to spacecraft body files).
    // Story 4.11 added 13 outer-system moon trajectory entries.
    // Total Story-4.11-post: 28 + 7 + 6 + 18 + 13 = 72 files across 25 bodies.
    const total = manifest.bodies.reduce((acc, b) => acc + b.files.length, 0);
    expect(total).toBe(72);
    expect(manifest.bodies.map((b) => b.naifId).sort((a, b) => a - b)).toEqual([
      -32, -31, 1, 2, 3, 4, 5, 6, 7, 8, 10, 301,
      501, 502, 503, 504, 606, 607, 608, 701, 702, 703, 704, 705, 801,
    ]);
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

// Story 3.1 AC3 (QA gap-fill): forward-compat for the new `provenance` field
// added to attitude FileEntry by the bake. Zod 4 z.object() silently strips
// unknown keys by default; schemaVersion remains 1. This block locks that
// contract so a future schema-tightening (e.g. .strict()) breaks loudly here.
describe('Story 3.1 AC3 — manifest forward-compat with provenance field', () => {
  it('accepts a manifest containing attitude entries with provenance="ck"', async () => {
    const withAttitude = {
      ...validManifest,
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
              // no provenance — trajectory entries omit the key (forward-compat)
            },
            {
              cadenceSec: 10.0,
              kind: 'bus_attitude',
              sha256: SHA,
              sizeBytes: 2048,
              timeRangeEt: [0.0, 100.0],
              url: 'data/v1-bus-attitude-v1-jupiter.bin.br',
              provenance: 'ck',  // Story 3.1 AC3 new field
            },
            {
              cadenceSec: 10.0,
              kind: 'platform_attitude',
              sha256: SHA,
              sizeBytes: 3072,
              timeRangeEt: [0.0, 100.0],
              url: 'data/v1-platform-attitude-v1-jupiter.bin.br',
              provenance: 'ck',
            },
          ],
        },
      ],
    };
    const fetchImpl = vi.fn(async () => mockResponse(withAttitude));
    const manifest = await ManifestLoader.load('/with-attitude.json', { fetchImpl });
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.bodies[0].files).toHaveLength(3);
    // Zod 4 z.object() default-strips unknown keys — the loader does not
    // reject, and downstream consumers Story 3.2 will add the field to the
    // schema explicitly when AttitudeService starts using it.
    const kinds = manifest.bodies[0].files.map((f) => f.kind).sort();
    expect(kinds).toEqual(['bus_attitude', 'platform_attitude', 'trajectory']);
  });

  it('still accepts a trajectory-only manifest (no provenance keys anywhere)', async () => {
    // Story 1.4 byte-stability mirror: a manifest with no provenance fields
    // anywhere must still parse cleanly. This is the no-op forward-compat
    // direction — adding the field surface didn't break callers that omit it.
    const fetchImpl = vi.fn(async () => mockResponse(validManifest));
    const manifest = await ManifestLoader.load('/no-provenance.json', { fetchImpl });
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.bodies[0].files[0].kind).toBe('trajectory');
  });
});

// === Story 3.3 AC4 — models[] schema extension ==========================

describe('Story 3.3 AC4 — manifest.models[] schema', () => {
  it('parses a manifest with no `models` field (back-compat with pre-Story-3.3)', async () => {
    // The valid manifest above has no `models` field. The Zod schema's
    // .default([]) means parsing succeeds with `manifest.models === []`.
    const fetchImpl = vi.fn(async () => mockResponse(validManifest));
    const manifest: Manifest = await ManifestLoader.load('/no-models.json', { fetchImpl });
    expect(manifest.models).toEqual([]);
  });

  it('parses a well-formed manifest with one 4-LOD model entry', async () => {
    const withModels = {
      ...validManifest,
      models: [
        {
          id: 'voyager',
          lods: [
            {
              level: 0,
              url: '/models/voyager-lod0.aaaaaaaa.glb',
              sha256: 'a'.repeat(64),
              sizeBytes: 1024,
              maxDistanceKm: 0.001,
            },
            {
              level: 1,
              url: '/models/voyager-lod1.bbbbbbbb.glb',
              sha256: 'b'.repeat(64),
              sizeBytes: 512,
              maxDistanceKm: 0.1,
            },
            {
              level: 2,
              url: '/models/voyager-lod2.cccccccc.glb',
              sha256: 'c'.repeat(64),
              sizeBytes: 256,
              maxDistanceKm: 1.0,
            },
            {
              level: 3,
              url: '/models/voyager-lod3.dddddddd.glb',
              sha256: 'd'.repeat(64),
              sizeBytes: 128,
              maxDistanceKm: null,
            },
          ],
          pivotMeters: [0, 0, 0],
          scaleToKm: 0.001,
        },
      ],
    };
    const fetchImpl = vi.fn(async () => mockResponse(withModels));
    const manifest = await ManifestLoader.load('/with-models.json', { fetchImpl });
    expect(manifest.models).toHaveLength(1);
    const model = manifest.models[0];
    expect(model.id).toBe('voyager');
    expect(model.lods).toHaveLength(4);
    expect(model.lods[3].maxDistanceKm).toBeNull();
    expect(model.pivotMeters).toEqual([0, 0, 0]);
    expect(model.scaleToKm).toBe(0.001);
  });

  it('rejects a malformed model entry (sha256 wrong length) with ManifestValidationError', async () => {
    const malformed = {
      ...validManifest,
      models: [
        {
          id: 'voyager',
          lods: [
            {
              level: 0,
              url: '/models/voyager-lod0.aaaaaaaa.glb',
              sha256: 'too-short',
              sizeBytes: 1024,
              maxDistanceKm: 0.001,
            },
          ],
          pivotMeters: [0, 0, 0],
          scaleToKm: 0.001,
        },
      ],
    };
    const fetchImpl = vi.fn(async () => mockResponse(malformed));
    await expect(
      ManifestLoader.load('/malformed-models.json', { fetchImpl }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
  });

  it('rejects a model entry with a non-positive maxDistanceKm', async () => {
    const malformed = {
      ...validManifest,
      models: [
        {
          id: 'voyager',
          lods: [
            {
              level: 0,
              url: '/models/voyager-lod0.aaaaaaaa.glb',
              sha256: 'a'.repeat(64),
              sizeBytes: 1024,
              maxDistanceKm: -1,
            },
          ],
          pivotMeters: [0, 0, 0],
          scaleToKm: 0.001,
        },
      ],
    };
    const fetchImpl = vi.fn(async () => mockResponse(malformed));
    await expect(
      ManifestLoader.load('/bad-distance.json', { fetchImpl }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
  });

  it('rejects a model entry whose lods array is empty', async () => {
    const malformed = {
      ...validManifest,
      models: [
        {
          id: 'voyager',
          lods: [],
          pivotMeters: [0, 0, 0],
          scaleToKm: 0.001,
        },
      ],
    };
    const fetchImpl = vi.fn(async () => mockResponse(malformed));
    await expect(
      ManifestLoader.load('/empty-lods.json', { fetchImpl }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
  });
});
