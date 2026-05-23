/**
 * Story 1.13 defense-in-depth — locked architectural contracts for the
 * celestial-bodies + skybox + texture-loader trio.
 *
 * Single-file convention: one big defense test file per story, mirrors
 * `web/tests/spacecraft-defense.test.ts` and `renderer-defense.test.ts`.
 *
 * Contracts under test (per Story 1.13 Task 10 + team-lead Option-C reply):
 *
 *  1. KTX2 deferral marker — no `KTX2Loader` import or symbol use anywhere
 *     in `web/src/`. If Story 4.3 has begun, this defense fails with a
 *     clear "Story 4.3 has begun KTX2 work but Story 1.13 expected
 *     PNG-only" message.
 *  2. `BODY_RADII_KM` is the SOLE source of truth for sphere radii —
 *     no literal radius values in `celestial-bodies.ts`.
 *  3. Per-frame `tick` never constructs SphereGeometry / TextureLoader /
 *     new materials. (Pattern test, mirrors trajectory-no-dispose.)
 *  4. Skybox lives in SkyboxGroup (architectural — verified by inspecting
 *     `main.ts` wiring, see Story 1.5 line 374-376).
 *  5. EphemerisService is called once per body per frame inside `tick` —
 *     no double-query.
 *  6. The Float64→Float32 cast is the only conversion site (cross-cutting
 *     `no-float32-leakage.test.ts` already enforces this, but we add a
 *     focused assertion against celestial-bodies.ts here so a regression
 *     surfaces in the story's own defense file).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

import { CelestialBodies } from '../src/render/celestial-bodies';
import { Skybox } from '../src/render/skybox';
import { worldVec3 } from '../src/types/branded';
import {
  BODY_RADII_KM,
  CELESTIAL_BODY_NAIF_IDS,
  SUN_NAIF_ID,
} from '../src/constants/body-radii';
import type { EphemerisService, State } from '../src/services/ephemeris-service';
import type { WorldVec3 } from '../src/types/branded';

const webRoot = resolve(__dirname, '..');
const srcRoot = resolve(webRoot, 'src');

const walkTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// 1. KTX2 deferral marker — Story 4.3 boundary (LIFTED 2026-05-23).
//
// Story 3.3 (2026-05-21) INTENTIONALLY LIFTED the KTX2 deferral FOR THE
// SPACECRAFT GLB CHAIN per ADR-0006 § Decision step 3.
//
// Story 4.3 (2026-05-23) INTENTIONALLY LIFTS the KTX2 deferral FOR THE
// CELESTIAL TEXTURE PIPELINE per ADR-0006 (4K + 8K KTX2-Basis for the four
// gas giants, 2K KTX2-Basis for the 12 outer-system moons). The
// `texture-loader.ts` service now hosts a KTX2Loader alongside the legacy
// PNG TextureLoader; URL routing keys on the per-tier extension.
//
// The defense is preserved as a SHAPE check: KTX2Loader usage MUST be
// confined to the two architectural landing sites below. New code that
// imports KTX2Loader elsewhere is a HIGH-severity violation (it almost
// certainly means a renderer module is reaching past the canonical loader
// surface to instantiate its own KTX2 path — a pattern this defense
// rejects).
// ---------------------------------------------------------------------------
const KTX2_WHITELIST = new Set<string>([
  // Story 3.3 ADR-0006 landing — KTX2Loader for the Voyager spacecraft GLB.
  'src\\render\\spacecraft-models.ts',
  'src/render/spacecraft-models.ts',
  // Story 4.3 ADR-0006 landing — KTX2Loader for the celestial-body textures.
  'src\\services\\texture-loader.ts',
  'src/services/texture-loader.ts',
]);

describe('Story 4.3 defense — KTX2Loader usage confined to canonical sites', () => {
  it('no KTX2Loader import or executable reference appears in web/src/ outside the canonical whitelist', () => {
    const tsFiles = walkTsFiles(srcRoot);
    const violations: string[] = [];
    const importPattern = /^\s*import.*\bKTX2Loader\b/;
    const usePattern = /\bKTX2Loader\b/;
    for (const file of tsFiles) {
      const rel = relative(webRoot, file);
      // Skip the two canonical landing sites (Story 3.3 + Story 4.3).
      if (KTX2_WHITELIST.has(rel)) continue;
      const contents = readFileSync(file, 'utf-8');
      const lines = contents.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (importPattern.test(line)) {
          violations.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 200)}`);
          return;
        }
        if (usePattern.test(line) && !/`[^`]*KTX2Loader[^`]*`/.test(line)) {
          violations.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 200)}`);
        }
      });
    }
    expect(
      violations,
      'KTX2Loader usage outside the canonical whitelist. Add the file to ' +
        'KTX2_WHITELIST only if the new site is an architecturally justified ' +
        'landing point (and document the rationale in this comment block).\n' +
        `Violations:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('texture-loader.ts retains a legacy TEXTURE_FILE_EXTENSION export', () => {
    // Story 1.13 exported `TEXTURE_FILE_EXTENSION = 'png'` as the single
    // file-extension constant. Story 4.3 introduces a per-tier extension
    // map (`TEXTURE_FILE_EXTENSION_BY_TIER`), but the legacy single export
    // is retained for backward-compatibility (some external consumers
    // hard-coded it). This test pins the legacy export at the original
    // 2k-tier value ('png') so a future story doesn't repurpose it
    // silently — any change would need to come with a coordinated update
    // to the consumers that read it.
    const src = readFileSync(resolve(srcRoot, 'services/texture-loader.ts'), 'utf-8');
    expect(src).toMatch(/TEXTURE_FILE_EXTENSION\s*=\s*'png'/);
  });

  it('per-tier extension map covers 2k → png and 4k/8k → ktx2', () => {
    const src = readFileSync(resolve(srcRoot, 'services/texture-loader.ts'), 'utf-8');
    expect(src).toMatch(/TEXTURE_FILE_EXTENSION_BY_TIER/);
    expect(src).toMatch(/'2k':\s*'png'/);
    expect(src).toMatch(/'4k':\s*'ktx2'/);
    expect(src).toMatch(/'8k':\s*'ktx2'/);
  });
});

// ---------------------------------------------------------------------------
// 2. Body radii are sourced solely from BODY_RADII_KM.
// ---------------------------------------------------------------------------
describe('Story 1.13 defense — single source of truth for body radii', () => {
  it('celestial-bodies.ts does not contain any literal radius value', () => {
    const src = readFileSync(resolve(srcRoot, 'render/celestial-bodies.ts'), 'utf-8');
    // Allowable: BODY_RADII_KM[naifId]. Forbidden: literal radii like 695700,
    // 6371, 1737.4. Scan for any numeric > 1000 that's not inside a comment.
    // The simplest check is the IAU values themselves.
    const forbidden = [695_700, 6_371, 1_737, 69_911, 58_232, 25_362, 24_622, 6_051, 3_389, 2_439];
    for (const v of forbidden) {
      expect(
        src,
        `celestial-bodies.ts contains literal radius ${v} — route through BODY_RADII_KM instead`,
      ).not.toMatch(new RegExp(`\\b${v}\\b`));
    }
  });

  it('every NAIF ID in CELESTIAL_BODY_NAIF_IDS has a defined radius', () => {
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      expect(BODY_RADII_KM[naifId]).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Per-frame hygiene — tick() doesn't construct SphereGeometry / materials.
// ---------------------------------------------------------------------------
describe('Story 1.13 defense — per-frame allocations', () => {
  it('celestial-bodies.ts tick() does not construct SphereGeometry or new materials', () => {
    const src = readFileSync(resolve(srcRoot, 'render/celestial-bodies.ts'), 'utf-8');
    // Locate the body of `tick(`. Crude but enough — split the source after
    // the first occurrence and bound at the next outer `}` at column 2.
    const tickIdx = src.indexOf('tick(');
    expect(tickIdx, 'tick(...) not found in celestial-bodies.ts').toBeGreaterThan(0);
    // Take a generous slice — the source after tick( up to the next closing
    // brace at column 2 (top-level method end).
    const tail = src.slice(tickIdx);
    const endIdx = tail.indexOf('\n  }\n');
    expect(endIdx, 'could not locate end of tick() method body').toBeGreaterThan(0);
    const tickBody = tail.slice(0, endIdx);
    expect(tickBody).not.toMatch(/new\s+SphereGeometry/);
    expect(tickBody).not.toMatch(/new\s+MeshStandardMaterial/);
    expect(tickBody).not.toMatch(/new\s+MeshBasicMaterial/);
    expect(tickBody).not.toMatch(/new\s+Texture/);
  });
});

// ---------------------------------------------------------------------------
// 4. SkyboxGroup compliance.
// ---------------------------------------------------------------------------
describe('Story 1.13 defense — skybox lives in SkyboxGroup', () => {
  it('skybox.ts module documents the SkyboxGroup placement', () => {
    const src = readFileSync(resolve(srcRoot, 'render/skybox.ts'), 'utf-8');
    expect(src).toMatch(/SkyboxGroup/);
  });

  it('main.ts wires the skybox into engine.skyboxGroup (not worldGroup)', () => {
    const src = readFileSync(resolve(srcRoot, 'main.ts'), 'utf-8');
    // Either the skybox is added to engine.skyboxGroup, or skybox is not
    // yet wired (which would surface as missing texture in the visual smoke
    // test — but the architectural contract is "if wired, skyboxGroup").
    if (src.includes('Skybox')) {
      expect(src).toMatch(/skyboxGroup\.add\(.*[Ss]ky/);
      expect(src).not.toMatch(/worldGroup\.add\(.*Skybox/);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. EphemerisService — once per body per frame.
// ---------------------------------------------------------------------------
describe('Story 1.13 defense — EphemerisService is called once per body per frame', () => {
  it('one getPosition call per NAIF ID in tick()', () => {
    let totalCalls = 0;
    const calledFor: number[] = [];
    const positions = new Map<number, WorldVec3>();
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      positions.set(naifId, worldVec3(1, 2, 3));
    }
    const eph = {
      getStateAt(): State | null {
        return null;
      },
      getPosition(_et: number, naifId: number): WorldVec3 | null {
        totalCalls += 1;
        calledFor.push(naifId);
        return positions.get(naifId) ?? null;
      },
      getVelocity() {
        return null;
      },
      isChunkCachedFor() {
        return true;
      },
      prefetchChunkFor() {
        return null;
      },
    } as unknown as EphemerisService;

    const bodies = new CelestialBodies();
    bodies.tick(0, eph);

    // Exactly 10 calls, one per NAIF ID.
    expect(totalCalls).toBe(CELESTIAL_BODY_NAIF_IDS.length);
    expect(new Set(calledFor)).toEqual(new Set(CELESTIAL_BODY_NAIF_IDS));
  });
});

// ---------------------------------------------------------------------------
// 6. Float32 leakage — focused assertion against celestial-bodies + skybox.
// ---------------------------------------------------------------------------
describe('Story 1.13 defense — no `new Float32Array(` in celestial-bodies / skybox / texture-loader', () => {
  const FOCUSED = [
    resolve(srcRoot, 'render/celestial-bodies.ts'),
    resolve(srcRoot, 'render/skybox.ts'),
    resolve(srcRoot, 'services/texture-loader.ts'),
    resolve(srcRoot, 'constants/body-radii.ts'),
    resolve(srcRoot, 'dev/fps-readout.ts'),
  ];

  for (const file of FOCUSED) {
    it(`${relative(webRoot, file)} contains no `, () => {
      const contents = readFileSync(file, 'utf-8');
      expect(contents).not.toMatch(/new\s+Float32Array\s*\(/);
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Sun is special (no texture, MeshBasicMaterial).
// ---------------------------------------------------------------------------
describe('Story 1.13 defense — Sun is synthesized emissive only (no texture I/O)', () => {
  it('CelestialBodies never issues loadBody for the Sun', async () => {
    const bodyLoads: number[] = [];
    const loader = {
      loadBody(naifId: number) {
        bodyLoads.push(naifId);
        return Promise.resolve({} as never);
      },
      loadSkybox() {
        return Promise.resolve({} as never);
      },
      prefetchAll() {
        return Promise.resolve([]);
      },
      isCached() {
        return false;
      },
    };
    new CelestialBodies({ textureLoader: loader as never });
    await Promise.resolve();
    expect(bodyLoads).not.toContain(SUN_NAIF_ID);
    // Every non-Sun body gets a load.
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      if (naifId === SUN_NAIF_ID) continue;
      expect(bodyLoads).toContain(naifId);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Skybox is unlit (MeshBasicMaterial) — the Sun's light must not affect it.
// ---------------------------------------------------------------------------
describe('Story 1.13 defense — skybox is unlit', () => {
  it('Skybox.material is MeshBasicMaterial (not MeshStandardMaterial)', () => {
    const sky = new Skybox();
    // Use a structural check that survives obfuscation: type === 'MeshBasicMaterial'
    expect(sky.material.type).toBe('MeshBasicMaterial');
  });
});
