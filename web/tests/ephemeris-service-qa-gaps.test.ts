// @vitest-environment happy-dom
/**
 * Story 4.0 QA gap — `EphemerisService` trajectory-only filter contract.
 *
 * Story 4.0 AC9 Note 4 surfaced a production runtime bug in
 * `web/src/services/ephemeris-service.ts`: the constructor indexed ALL
 * `body.files` entries (including `bus_attitude` + `platform_attitude`),
 * causing `findSegmentFile`'s binary search to pick an attitude file
 * whose start ET was closer-to-but-not-covering a queried ET — returning
 * null when a trajectory segment WAS the correct match. The fix filters
 * `body.files` to `kind === 'trajectory'` before indexing.
 *
 * The dev's `web/tests/ephemeris-defense.test.ts` adds 3 defense tests
 * for the trajectory-only filter (post-fix). Those cover the spacecraft
 * NAIF-id case (V1 / V2 carrying mixed file kinds).
 *
 * This QA gap suite fills cross-cutting gaps the dev defense suite does
 * NOT exercise (per QA brief — Story 4.0 review handoff):
 *
 *   1. **Non-spacecraft bodies (celestial NAIFs 1..8, 10, 301) with
 *      trajectory-only entries are NOT silently dropped** by the filter.
 *      The Earth-Moon barycenter, Sun, Moon, etc. all carry exactly one
 *      trajectory entry per body in the manifest — a refactor that
 *      tightened the filter (e.g., `f.kind === 'trajectory' &&
 *      f.url.includes('voyager-')`) would silently drop them. This test
 *      pins that the filter accepts trajectory entries regardless of the
 *      naifId or url shape.
 *
 *   2. **Empty trajectory file list (a body with ONLY attitude entries)
 *      doesn't crash** at construction. If a future bake started emitting
 *      a body-record that has bus_attitude + platform_attitude but no
 *      trajectory (e.g., a metadata-only body), the constructor must
 *      handle the empty filtered-list case gracefully (return null from
 *      `getStateAt` rather than throwing on the empty `starts` array).
 *
 *   3. **Mixed-kind body queries with the correct kind succeed**: a body
 *      with all three kinds (V1 / V2 post-Story-4.0) successfully
 *      returns trajectory state, with the binary search NEVER selecting
 *      an attitude file's start-ET as the segment.
 *
 *   4. **Multiple trajectory files per body are sorted by start-ET**
 *      after filtering — the post-filter `slice().sort(...)` call MUST
 *      preserve the sort invariant even when the input mixes kinds in
 *      arbitrary order (a future refactor that bypassed the sort would
 *      silently break the binary search).
 *
 *   5. **Attitude file URL never appears in any `prefetchChunkFor` /
 *      `isChunkCachedFor` lookup result** for spacecraft NAIFs. These
 *      methods route through `findSegmentFile` — same filter applies.
 *
 * Rule 7 — these tests run in the standard vitest collection (no MCP
 * required); they exercise the production EphemerisService constructor
 * directly with hand-built manifests so the filter contract is pinned
 * independently of the on-disk manifest's current shape.
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { EphemerisService } from '../src/services/ephemeris-service';
import type { Manifest, ManifestFile } from '../src/services/manifest-loader';
import type { ChunkLoader, LoadedChunk } from '../src/services/chunk-loader';

// =============================================================================
// Helpers — build a minimal Manifest + LoadedChunk + fake ChunkLoader
// =============================================================================

const makeTrajectoryFile = (url: string, etStart: number, etEnd: number, cadence: number): ManifestFile => ({
  url,
  sha256: 'a'.repeat(64),
  decompressedSha256: 'a'.repeat(64),
  sizeBytes: 100,
  timeRangeEt: [etStart, etEnd],
  cadenceSec: cadence,
  kind: 'trajectory',
});

const makeBusAttitudeFile = (url: string, etStart: number, etEnd: number, cadence: number): ManifestFile => ({
  url,
  sha256: 'b'.repeat(64),
  decompressedSha256: 'b'.repeat(64),
  sizeBytes: 200,
  timeRangeEt: [etStart, etEnd],
  cadenceSec: cadence,
  kind: 'bus_attitude',
  provenance: 'ck',
});

const makePlatformAttitudeFile = (url: string, etStart: number, etEnd: number, cadence: number): ManifestFile => ({
  url,
  sha256: 'c'.repeat(64),
  decompressedSha256: 'c'.repeat(64),
  sizeBytes: 300,
  timeRangeEt: [etStart, etEnd],
  cadenceSec: cadence,
  kind: 'platform_attitude',
  provenance: 'ck',
});

const makeChunk = (params: {
  bodyId: number;
  etStart: number;
  cadence: number;
  sampleCount: number;
  origin: [number, number, number];
  slope: [number, number, number];
}): LoadedChunk => {
  const samples = new Float64Array(params.sampleCount * 6);
  for (let i = 0; i < params.sampleCount; i++) {
    const dt = i * params.cadence;
    samples[i * 6 + 0] = params.origin[0] + params.slope[0] * dt;
    samples[i * 6 + 1] = params.origin[1] + params.slope[1] * dt;
    samples[i * 6 + 2] = params.origin[2] + params.slope[2] * dt;
    samples[i * 6 + 3] = params.slope[0];
    samples[i * 6 + 4] = params.slope[1];
    samples[i * 6 + 5] = params.slope[2];
  }
  return {
    header: {
      magic: 'VTRJ',
      version: 1,
      bodyId: params.bodyId,
      etStart: params.etStart,
      etEnd: params.etStart + (params.sampleCount - 1) * params.cadence,
      sampleCount: params.sampleCount,
      cadenceSeconds: params.cadence,
    },
    samples,
  };
};

const makeFakeChunkLoader = (cache: Map<string, LoadedChunk>): ChunkLoader =>
  ({
    peek: (url: string) => cache.get(url),
    load: vi.fn(async (file: ManifestFile) => {
      const cached = cache.get(file.url);
      if (cached) return cached;
      throw new Error(`no chunk for ${file.url}`);
    }),
    subscribe: () => () => {},
    get loading() {
      return false;
    },
  }) as unknown as ChunkLoader;

const baseManifestFields = {
  schemaVersion: 1 as const,
  bakeCommit: 'test',
  bakeTimestamp: '2026-05-22T00:00:00Z',
  kernels: [] as Manifest['kernels'],
  chapters: [] as Manifest['chapters'],
  validationTolerances: { maxPositionErrorKm: 20, rmsPositionErrorKm: 5 },
  models: [] as Manifest['models'],
};

// =============================================================================
// 1. Non-spacecraft bodies with trajectory-only entries are accepted
// =============================================================================

describe('Story 4.0 QA gap — trajectory-only filter accepts non-spacecraft bodies', () => {
  it('a celestial body (Sun, NAIF 10) with one trajectory file is indexed and queryable', () => {
    const sunChunk = makeChunk({
      bodyId: 10,
      etStart: -705_000_000,
      cadence: 86400,
      sampleCount: 100,
      origin: [0, 0, 0],
      slope: [0.001, 0, 0],
    });
    const manifest: Manifest = {
      ...baseManifestFields,
      bodies: [
        {
          naifId: 10,
          name: 'Sun',
          files: [
            makeTrajectoryFile(
              'data/sun.bin.br',
              sunChunk.header.etStart,
              sunChunk.header.etEnd,
              sunChunk.header.cadenceSeconds,
            ),
          ],
        },
      ],
    };
    const loader = makeFakeChunkLoader(new Map([['data/sun.bin.br', sunChunk]]));
    const svc = new EphemerisService(manifest, loader);
    // A query inside the Sun's trajectory window returns non-null.
    const state = svc.getStateAt(sunChunk.header.etStart + 1000, 10);
    expect(state, 'Sun state at queried ET must be non-null (filter must accept naifId=10)')
      .not.toBeNull();
  });

  it('all 10 celestial NAIFs (Sun + 8 barycenters + Moon) accept trajectory queries', () => {
    // Build a manifest mimicking the production shape: each celestial body
    // has exactly one trajectory entry spanning the same long window.
    const celestialIds = [10, 1, 2, 3, 4, 5, 6, 7, 8, 301];
    const etStart = -705_000_000;
    const etEnd = 978_000_000;
    const cadence = 86400;
    const chunks = new Map<string, LoadedChunk>();
    const bodies: Manifest['bodies'] = celestialIds.map((nid) => {
      const url = `data/celestial-${nid}.bin.br`;
      chunks.set(
        url,
        makeChunk({
          bodyId: nid,
          etStart,
          cadence,
          sampleCount: 10,
          origin: [nid, 0, 0],
          slope: [0, 0, 0],
        }),
      );
      return {
        naifId: nid,
        name: `body ${nid}`,
        files: [makeTrajectoryFile(url, etStart, etStart + 9 * cadence, cadence)],
      };
    });
    const manifest: Manifest = { ...baseManifestFields, bodies };
    const loader = makeFakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);
    for (const nid of celestialIds) {
      const state = svc.getStateAt(etStart + 100, nid);
      expect(state, `celestial NAIF ${nid} must produce non-null state after filter`)
        .not.toBeNull();
      // And the returned position carries the NAIF-id-as-origin marker we set.
      expect(state!.position[0], `celestial NAIF ${nid} origin marker`).toBe(nid);
    }
  });
});

// =============================================================================
// 2. Body with ONLY attitude entries (no trajectory) doesn't crash construction
// =============================================================================

describe('Story 4.0 QA gap — body with no trajectory entries is handled gracefully', () => {
  it('constructor does not throw when a body has only attitude entries', () => {
    const manifest: Manifest = {
      ...baseManifestFields,
      bodies: [
        {
          naifId: -31,
          name: 'Voyager 1',
          files: [
            // ONLY attitude entries, no trajectory.
            makeBusAttitudeFile('data/v1_bus_attitude.v1-jupiter.bin.br', 100, 200, 1),
            makePlatformAttitudeFile('data/v1_platform_attitude.v1-jupiter.bin.br', 100, 200, 1),
          ],
        },
      ],
    };
    const loader = makeFakeChunkLoader(new Map());
    // The constructor must NOT throw — even though the post-filter list is empty.
    expect(() => new EphemerisService(manifest, loader)).not.toThrow();
  });

  it('getStateAt returns null for a body whose only entries are attitude', () => {
    const manifest: Manifest = {
      ...baseManifestFields,
      bodies: [
        {
          naifId: -31,
          name: 'Voyager 1',
          files: [
            makeBusAttitudeFile('data/v1_bus_attitude.v1-jupiter.bin.br', 100, 200, 1),
          ],
        },
      ],
    };
    const loader = makeFakeChunkLoader(new Map());
    const svc = new EphemerisService(manifest, loader);
    // A query inside the attitude file's ET window returns null because
    // ephemeris-service correctly skipped the attitude entry — there's no
    // trajectory to interpolate.
    expect(svc.getStateAt(150, -31)).toBeNull();
  });
});

// =============================================================================
// 3. Mixed-kind body: trajectory queries succeed; attitude entries are never selected
// =============================================================================

describe('Story 4.0 QA gap — mixed-kind body: filter never picks attitude as segment', () => {
  it('a body with trajectory + bus_attitude + platform_attitude returns the trajectory chunk', () => {
    // Setup: a spacecraft body with one trajectory chunk covering [0, 1000]
    // AND a bus_attitude chunk INSIDE that range [200, 800], AND a
    // platform_attitude chunk [300, 700]. The attitude entries have NARROWER
    // ranges starting LATER than the trajectory's start; pre-fix, the
    // binary search would prefer the attitude entry whose start ET is
    // closer to a mid-range query — returning null because the attitude
    // chunk isn't a trajectory chunk and `interpolateFromChunk` would
    // read garbage from a wrong-kind chunk.
    const trajectoryChunk = makeChunk({
      bodyId: -31,
      etStart: 0,
      cadence: 100,
      sampleCount: 11,
      origin: [1000, 2000, 3000],
      slope: [1, 1, 1],
    });
    const manifest: Manifest = {
      ...baseManifestFields,
      bodies: [
        {
          naifId: -31,
          name: 'Voyager 1',
          files: [
            makeTrajectoryFile('data/v1-trajectory.bin.br', 0, 1000, 100),
            makeBusAttitudeFile('data/v1_bus_attitude.v1-jupiter.bin.br', 200, 800, 1),
            makePlatformAttitudeFile('data/v1_platform_attitude.v1-jupiter.bin.br', 300, 700, 1),
          ],
        },
      ],
    };
    const cache = new Map<string, LoadedChunk>([
      ['data/v1-trajectory.bin.br', trajectoryChunk],
    ]);
    const loader = makeFakeChunkLoader(cache);
    const svc = new EphemerisService(manifest, loader);
    // Query at ET=500 — inside ALL three chunks' ET ranges. The filter must
    // route this to the trajectory chunk; if it picked the bus_attitude
    // chunk (start ET 200, closer to 500 than the trajectory's start ET 0),
    // the result would be null (no cached chunk for the attitude URL) or
    // a wrong-shape interpolation.
    const state = svc.getStateAt(500, -31);
    expect(state, 'trajectory query must succeed despite bus/platform attitude entries').not.toBeNull();
    // And the values must derive from the trajectory chunk (not from a
    // wrong-kind interpolation).
    expect(state!.position[0]).toBe(1000 + 500 * 1);
    expect(state!.position[1]).toBe(2000 + 500 * 1);
    expect(state!.position[2]).toBe(3000 + 500 * 1);
  });

  it('attitude file URL is never returned by isChunkCachedFor', () => {
    // Sanity: `isChunkCachedFor` routes through `findSegmentFile`. After
    // the filter, the attitude entry must never participate in segment
    // selection. Cache the attitude URL anyway; verify the routing still
    // resolves to the trajectory.
    const trajectoryChunk = makeChunk({
      bodyId: -31,
      etStart: 0,
      cadence: 100,
      sampleCount: 11,
      origin: [0, 0, 0],
      slope: [1, 0, 0],
    });
    const attitudeChunkBus = makeChunk({
      bodyId: -31,
      etStart: 200,
      cadence: 1,
      sampleCount: 601,
      origin: [9999, 9999, 9999],
      slope: [0, 0, 0],
    });
    const cache = new Map<string, LoadedChunk>([
      ['data/v1-trajectory.bin.br', trajectoryChunk],
      ['data/v1_bus_attitude.v1-jupiter.bin.br', attitudeChunkBus],
    ]);
    const manifest: Manifest = {
      ...baseManifestFields,
      bodies: [
        {
          naifId: -31,
          name: 'Voyager 1',
          files: [
            makeTrajectoryFile('data/v1-trajectory.bin.br', 0, 1000, 100),
            makeBusAttitudeFile('data/v1_bus_attitude.v1-jupiter.bin.br', 200, 800, 1),
          ],
        },
      ],
    };
    const loader = makeFakeChunkLoader(cache);
    const svc = new EphemerisService(manifest, loader);
    // isChunkCachedFor(500, -31) must return true because the TRAJECTORY
    // chunk is cached. If it picked the attitude file's URL instead, it
    // would still report true (also cached), but for the wrong reason.
    // The proof is the value: getStateAt must return the trajectory's
    // origin marker (0, 0, 0) NOT the attitude's (9999, 9999, 9999).
    expect(svc.isChunkCachedFor(500, -31)).toBe(true);
    const state = svc.getStateAt(500, -31);
    expect(state).not.toBeNull();
    // Position is from trajectory (origin [0,0,0] + slope[1,0,0]*500 = [500,0,0]),
    // NOT from the attitude chunk's [9999, 9999, 9999] origin.
    expect(state!.position[0]).toBe(500);
    expect(state!.position[1]).toBe(0);
    expect(state!.position[2]).toBe(0);
  });
});

// =============================================================================
// 4. Multiple trajectory files per body are sorted after filtering
// =============================================================================

describe('Story 4.0 QA gap — sort invariant survives the filter step', () => {
  it('trajectory files declared in REVERSE order interleaved with attitude are sorted ascending', () => {
    // Construct a body whose declaration order is INTENTIONALLY reversed
    // and interleaved with attitude entries. The filter step preserves
    // body-declaration order; the explicit `slice().sort(...)` after
    // filtering must restore the ascending-by-start-ET invariant.
    const chunks = new Map<string, LoadedChunk>();
    const buildSeg = (idx: number, etStart: number) => {
      const url = `data/seg-${idx}.bin.br`;
      chunks.set(
        url,
        makeChunk({
          bodyId: -32,
          etStart,
          cadence: 100,
          sampleCount: 11,
          origin: [idx, 0, 0],
          slope: [0, 0, 0],
        }),
      );
      return makeTrajectoryFile(url, etStart, etStart + 1000, 100);
    };
    const manifest: Manifest = {
      ...baseManifestFields,
      bodies: [
        {
          naifId: -32,
          name: 'Voyager 2',
          files: [
            // Reverse + interleaved declaration order:
            buildSeg(3, 3000),
            makeBusAttitudeFile('data/v2_bus_attitude.v2-jupiter.bin.br', 100, 900, 1),
            buildSeg(1, 1000),
            makePlatformAttitudeFile('data/v2_platform_attitude.v2-jupiter.bin.br', 200, 800, 1),
            buildSeg(2, 2000),
            buildSeg(0, 0),
          ],
        },
      ],
    };
    const loader = makeFakeChunkLoader(chunks);
    const svc = new EphemerisService(manifest, loader);
    // Query each segment's midpoint: each must return the chunk that owns
    // the queried ET (verified via the origin-marker = seg-index).
    expect(svc.getStateAt(500, -32)!.position[0]).toBe(0);
    expect(svc.getStateAt(1500, -32)!.position[0]).toBe(1);
    expect(svc.getStateAt(2500, -32)!.position[0]).toBe(2);
    expect(svc.getStateAt(3500, -32)!.position[0]).toBe(3);
  });
});

// =============================================================================
// 5. Production manifest sanity (when present): every spacecraft body has
//    trajectory files AND filter routing works end-to-end via the real manifest
// =============================================================================

describe('Story 4.0 QA gap — production manifest body composition (sanity)', () => {
  const REPO_ROOT = resolve(__dirname, '..', '..');
  const MANIFEST_PATH = resolve(REPO_ROOT, 'web', 'public', 'data', 'manifest.json');

  it('every spacecraft body has at least one trajectory file (post-Story-4.0 sanity)', () => {
    if (!existsSync(MANIFEST_PATH)) {
      return; // Skip gracefully — fresh checkout without bake.
    }
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;
    for (const body of manifest.bodies) {
      if (body.naifId !== -31 && body.naifId !== -32) continue;
      const traj = body.files.filter((f) => f.kind === 'trajectory');
      expect(
        traj.length,
        `spacecraft NAIF ${body.naifId} must have at least one trajectory entry — ` +
          `Story 4.0's ephemeris-service filter would silently route trajectory ` +
          `queries to null otherwise`,
      ).toBeGreaterThan(0);
    }
  });

  it('every celestial body (NAIF 1..8, 10, 301) has exactly one trajectory file', () => {
    if (!existsSync(MANIFEST_PATH)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;
    const celestialIds = [10, 1, 2, 3, 4, 5, 6, 7, 8, 301];
    for (const id of celestialIds) {
      const body = manifest.bodies.find((b) => b.naifId === id);
      expect(body, `celestial NAIF ${id} missing from manifest`).toBeDefined();
      const traj = body!.files.filter((f) => f.kind === 'trajectory');
      expect(
        traj.length,
        `celestial NAIF ${id} must have exactly one trajectory entry`,
      ).toBe(1);
      // And no attitude entries on celestial bodies — only spacecraft carry CK.
      const attitude = body!.files.filter(
        (f) => f.kind === 'bus_attitude' || f.kind === 'platform_attitude',
      );
      expect(attitude.length, `celestial NAIF ${id} must not carry attitude entries`).toBe(0);
    }
  });
});
