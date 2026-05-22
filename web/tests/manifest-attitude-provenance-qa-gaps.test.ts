// @vitest-environment happy-dom
/**
 * Story 4.0 QA gap — manifest `provenance: "ck"` field on every attitude entry.
 *
 * Story 3.1 AC3 added the optional `provenance: "ck"` field to attitude
 * entries in `web/public/data/manifest.json`. The runtime AttitudeService
 * branches on this field to decide whether to route a query through the
 * CK SLERP path vs. the synthesized HGA-Earth-pointing fallback. A
 * regression that silently dropped the field (e.g., a refactor in
 * `bake/src/ck_sample.py:_assemble_body_records` that forgot to pass
 * `provenance="ck"` to the `FileEntry`) would route ALL attitude queries
 * to the synthesized path — invisible to the bus-quaternion L2 NFR-P10
 * gate (which uses `getBusQuat`, not `getProvenance`), but visible to the
 * Story 4.0 AC3 platform-comparison regression assertion.
 *
 * Story 4.0 AC2 NEW context — type-1 platform CK entries:
 *   Before Story 4.0, only `bus_attitude` entries existed and carried
 *   `provenance: "ck"`. Story 4.0 AC2 added `platform_attitude` entries
 *   (one per encounter with scan-platform CK coverage — 6 total across
 *   V1+V2). The provenance contract MUST extend to those too; the QA
 *   brief calls this out as the load-bearing manifest-schema defense gap.
 *
 * The dev's `web/tests/ephemeris-defense.test.ts` (test "Runtime
 * manifest.json lockfile contract") pins the per-spacecraft file count
 * (V1: 7 trajectory + 3 bus_attitude + 2 platform_attitude = 12; V2: 11
 * + 4 + 4 = 19) but does NOT explicitly assert the provenance field on
 * each attitude entry. The Zod schema `manifest-loader.ts` declares
 * `provenance: z.enum(['ck']).optional()` — an attitude entry MISSING
 * the field would parse cleanly. The defense lives at the per-row pin.
 *
 * This QA gap suite fills that contract:
 *
 *   1. Every `bus_attitude` entry carries `provenance: "ck"`.
 *   2. Every `platform_attitude` entry carries `provenance: "ck"`
 *      (Story 4.0 AC2 EXTENSION — was 0 entries pre-Story-4.0).
 *   3. NO `trajectory` entry carries `provenance: "ck"` (the field is
 *      attitude-only — a regression that mistakenly applied it to
 *      trajectory entries would suggest a copy-paste defect in
 *      `_assemble_body_records`).
 *   4. The Zod schema accepts a manifest with attitude entries that
 *      DO have `provenance: "ck"` (positive parse case).
 *   5. The Zod schema accepts a manifest with attitude entries that
 *      OMIT the field (backwards-compat with pre-Story-3.1 fixtures).
 *   6. The Zod schema REJECTS a manifest where an attitude entry's
 *      `provenance` is anything other than `"ck"` (closed enum guard).
 *   7. **NFR-P10 indirect pin**: when the field is absent on
 *      platform_attitude, AttitudeService falls back to synthesized —
 *      pin this routing contract via the manifest field, since the
 *      Story 4.0 AC3 regression gate fires on exactly this scenario.
 *
 * Rule 7 — runs in the standard vitest collection (no MCP); exercises
 * both the on-disk manifest (when present) AND the Zod schema in
 * isolation so the contract holds regardless of bake state.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ManifestLoader,
  ManifestValidationError,
  __resetCacheForTests,
  type Manifest,
} from '../src/services/manifest-loader';

const REPO_ROOT = resolve(__dirname, '..', '..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'web', 'public', 'data', 'manifest.json');

// Build a minimal valid manifest with a single trajectory file, parameterized
// over the file list. Used by the Zod schema tests to inject specific shapes.
const buildManifestWithFiles = (files: Array<Record<string, unknown>>): Record<string, unknown> => ({
  schemaVersion: 1,
  bakeCommit: 'qa-gap-test',
  bakeTimestamp: '2026-05-22T00:00:00Z',
  kernels: [],
  bodies: [
    {
      naifId: -31,
      name: 'Voyager 1',
      files,
    },
  ],
  chapters: [],
  validationTolerances: { maxPositionErrorKm: 20, rmsPositionErrorKm: 5 },
  models: [],
});

const jsonFetchOk = (body: unknown): typeof fetch =>
  (async () =>
    ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => body,
    }) as unknown as Response) as typeof fetch;

// =============================================================================
// 1-3. On-disk manifest: every attitude entry has provenance: "ck"
// =============================================================================

describe('Story 4.0 QA gap — runtime manifest attitude provenance contract', () => {
  it('on-disk manifest.json exists (sanity)', () => {
    expect(
      existsSync(MANIFEST_PATH),
      `${MANIFEST_PATH} missing — run the bake + copy-bake-to-web first`,
    ).toBe(true);
  });

  it('every bus_attitude entry has provenance: "ck"', () => {
    if (!existsSync(MANIFEST_PATH)) return;
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;
    const offenders: string[] = [];
    for (const body of manifest.bodies) {
      for (const file of body.files) {
        if (file.kind !== 'bus_attitude') continue;
        if (file.provenance !== 'ck') {
          offenders.push(
            `${file.url}: provenance=${JSON.stringify(file.provenance)} (expected "ck")`,
          );
        }
      }
    }
    expect(
      offenders,
      `bus_attitude entries missing or wrong provenance — Story 3.1 AC3 ` +
        `regression in bake/src/ck_sample.py:_assemble_body_records:\n  ` +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('every platform_attitude entry has provenance: "ck" (Story 4.0 AC2 EXTENSION)', () => {
    if (!existsSync(MANIFEST_PATH)) return;
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;
    const offenders: string[] = [];
    let platformCount = 0;
    for (const body of manifest.bodies) {
      for (const file of body.files) {
        if (file.kind !== 'platform_attitude') continue;
        platformCount += 1;
        if (file.provenance !== 'ck') {
          offenders.push(
            `${file.url}: provenance=${JSON.stringify(file.provenance)} (expected "ck")`,
          );
        }
      }
    }
    // Story 4.0 AC2: type-1 platform-VTRJ emission produces exactly 6
    // platform_attitude entries (V1: 2, V2: 4 — V1 PBD has no platform CK
    // coverage). A regression that dropped the emission would surface
    // here as platformCount < 6.
    expect(
      platformCount,
      'expected exactly 6 platform_attitude entries (Story 4.0 AC2 emission); ' +
        'a lower count indicates AC2 type-1 branch regression',
    ).toBe(6);
    expect(
      offenders,
      `platform_attitude entries missing or wrong provenance — Story 4.0 AC2 ` +
        `extension regression in bake/src/ck_sample.py:_assemble_body_records:\n  ` +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('NO trajectory entry carries provenance: "ck" (provenance is attitude-only)', () => {
    if (!existsSync(MANIFEST_PATH)) return;
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;
    const offenders: string[] = [];
    for (const body of manifest.bodies) {
      for (const file of body.files) {
        if (file.kind !== 'trajectory') continue;
        if (file.provenance !== undefined) {
          offenders.push(
            `${file.url}: trajectory entry has provenance=${JSON.stringify(file.provenance)} ` +
              `(must be undefined — provenance is attitude-only)`,
          );
        }
      }
    }
    expect(
      offenders,
      `trajectory entries have stray provenance field — suggests copy-paste ` +
        `defect in _assemble_body_records:\n  ` +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('exact attitude provenance count matches expected total (V1: 5, V2: 8, grand total: 13)', () => {
    if (!existsSync(MANIFEST_PATH)) return;
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;
    let v1Count = 0;
    let v2Count = 0;
    for (const body of manifest.bodies) {
      const attitudeCount = body.files.filter(
        (f) => (f.kind === 'bus_attitude' || f.kind === 'platform_attitude') &&
          f.provenance === 'ck',
      ).length;
      if (body.naifId === -31) v1Count = attitudeCount;
      if (body.naifId === -32) v2Count = attitudeCount;
    }
    // V1: 3 bus_attitude (V1J, V1S, PBD) + 2 platform_attitude (V1J, V1S) = 5.
    expect(v1Count, 'V1 attitude entries with provenance="ck"').toBe(5);
    // V2: 4 bus_attitude + 4 platform_attitude = 8.
    expect(v2Count, 'V2 attitude entries with provenance="ck"').toBe(8);
  });
});

// =============================================================================
// 4-6. Zod schema accepts/rejects per the provenance enum
// =============================================================================

describe('Story 4.0 QA gap — Zod schema provenance enum guards', () => {
  it('accepts a manifest with attitude entries that DO have provenance: "ck"', async () => {
    __resetCacheForTests();
    const doc = buildManifestWithFiles([
      {
        url: 'data/v1.bin.br',
        sha256: 'a'.repeat(64),
        decompressedSha256: 'a'.repeat(64),
        sizeBytes: 100,
        timeRangeEt: [0, 60],
        cadenceSec: 60,
        kind: 'trajectory',
      },
      {
        url: 'data/v1_bus_attitude.v1-jupiter.bin.br',
        sha256: 'b'.repeat(64),
        decompressedSha256: 'b'.repeat(64),
        sizeBytes: 200,
        timeRangeEt: [10, 50],
        cadenceSec: 1,
        kind: 'bus_attitude',
        provenance: 'ck',
      },
      {
        url: 'data/v1_platform_attitude.v1-jupiter.bin.br',
        sha256: 'c'.repeat(64),
        decompressedSha256: 'c'.repeat(64),
        sizeBytes: 300,
        timeRangeEt: [10, 50],
        cadenceSec: 1,
        kind: 'platform_attitude',
        provenance: 'ck',
      },
    ]);
    await expect(
      ManifestLoader.load('test://provenance-ck-positive', { fetchImpl: jsonFetchOk(doc) }),
    ).resolves.toBeDefined();
    __resetCacheForTests();
  });

  it('accepts a manifest with attitude entries that OMIT provenance (backwards-compat)', async () => {
    __resetCacheForTests();
    const doc = buildManifestWithFiles([
      {
        url: 'data/v1.bin.br',
        sha256: 'a'.repeat(64),
        decompressedSha256: 'a'.repeat(64),
        sizeBytes: 100,
        timeRangeEt: [0, 60],
        cadenceSec: 60,
        kind: 'trajectory',
      },
      {
        url: 'data/v1_bus_attitude.v1-jupiter.bin.br',
        sha256: 'b'.repeat(64),
        decompressedSha256: 'b'.repeat(64),
        sizeBytes: 200,
        timeRangeEt: [10, 50],
        cadenceSec: 1,
        kind: 'bus_attitude',
        // provenance OMITTED — older manifests pre-Story-3.1 don't carry it.
      },
    ]);
    await expect(
      ManifestLoader.load('test://provenance-omitted', { fetchImpl: jsonFetchOk(doc) }),
    ).resolves.toBeDefined();
    __resetCacheForTests();
  });

  it('REJECTS a manifest with provenance: "synthesized" on an attitude entry', async () => {
    // The Zod enum is closed at `"ck"` (the only valid value today). A
    // future bake regression that mis-tagged a synthesized payload as
    // CK-derived (or vice versa) would be rejected by the schema.
    __resetCacheForTests();
    const doc = buildManifestWithFiles([
      {
        url: 'data/v1_bus_attitude.v1-jupiter.bin.br',
        sha256: 'b'.repeat(64),
        decompressedSha256: 'b'.repeat(64),
        sizeBytes: 200,
        timeRangeEt: [10, 50],
        cadenceSec: 1,
        kind: 'bus_attitude',
        provenance: 'synthesized', // NOT in the closed enum.
      },
    ]);
    await expect(
      ManifestLoader.load('test://provenance-bad-value', { fetchImpl: jsonFetchOk(doc) }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
    __resetCacheForTests();
  });

  it('REJECTS a manifest with provenance: null on an attitude entry', async () => {
    __resetCacheForTests();
    const doc = buildManifestWithFiles([
      {
        url: 'data/v1_bus_attitude.v1-jupiter.bin.br',
        sha256: 'b'.repeat(64),
        decompressedSha256: 'b'.repeat(64),
        sizeBytes: 200,
        timeRangeEt: [10, 50],
        cadenceSec: 1,
        kind: 'bus_attitude',
        provenance: null,
      },
    ]);
    await expect(
      ManifestLoader.load('test://provenance-null', { fetchImpl: jsonFetchOk(doc) }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
    __resetCacheForTests();
  });

  it('REJECTS a manifest with provenance: numeric on an attitude entry', async () => {
    __resetCacheForTests();
    const doc = buildManifestWithFiles([
      {
        url: 'data/v1_bus_attitude.v1-jupiter.bin.br',
        sha256: 'b'.repeat(64),
        decompressedSha256: 'b'.repeat(64),
        sizeBytes: 200,
        timeRangeEt: [10, 50],
        cadenceSec: 1,
        kind: 'bus_attitude',
        provenance: 1,
      },
    ]);
    await expect(
      ManifestLoader.load('test://provenance-numeric', { fetchImpl: jsonFetchOk(doc) }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
    __resetCacheForTests();
  });
});

// =============================================================================
// 7. Round-trip pin: real manifest parses through the production Zod path
//    and preserves the provenance field on every attitude entry
// =============================================================================

describe('Story 4.0 QA gap — production-manifest round-trip preserves provenance', () => {
  it('production manifest passes the production Zod parser AND every attitude entry retains provenance: "ck"', async () => {
    if (!existsSync(MANIFEST_PATH)) {
      return; // Skip when manifest is absent (fresh checkout).
    }
    __resetCacheForTests();
    const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const manifest = await ManifestLoader.load('test://prod-manifest-roundtrip', {
      fetchImpl: jsonFetchOk(raw),
    });
    __resetCacheForTests();

    // Iterate the parsed Manifest object (NOT the raw JSON) — this is what
    // the AttitudeService runtime sees. If the Zod parser stripped the
    // optional field, the runtime branch on `provenance === 'ck'` would
    // silently fall through to the synthesized path.
    for (const body of manifest.bodies) {
      for (const file of body.files) {
        if (file.kind === 'bus_attitude' || file.kind === 'platform_attitude') {
          expect(
            file.provenance,
            `${file.url}: provenance field stripped during Zod parse — ` +
              `AttitudeService would silently route to synthesized fallback`,
          ).toBe('ck');
        }
      }
    }
  });
});
