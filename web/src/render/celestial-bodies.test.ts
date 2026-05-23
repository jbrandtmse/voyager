import { describe, it, expect, vi } from 'vitest';
import {
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  DirectionalLight,
  Texture,
} from 'three';

import { CelestialBodies } from './celestial-bodies';
import type { EphemerisService } from '../services/ephemeris-service';
import {
  CELESTIAL_BODY_NAIF_IDS,
  BODY_RADII_KM,
  BODY_TEXTURE_SLUGS,
  SUN_NAIF_ID,
} from '../constants/body-radii';
import { worldVec3 } from '../types/branded';
import type { State } from '../services/ephemeris-service';
import type { WorldVec3 } from '../types/branded';
import type { TextureLoaderService } from '../services/texture-loader';

/** Fake ephemeris service: returns deterministic positions keyed by NAIF ID. */
const makeFakeEphemeris = (
  positions: Map<number, WorldVec3>,
): EphemerisService =>
  ({
    getStateAt(_et: number, naifId: number): State | null {
      const pos = positions.get(naifId);
      if (!pos) return null;
      return { position: pos, velocity: worldVec3(0, 0, 0) };
    },
    getPosition(_et: number, naifId: number): WorldVec3 | null {
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
  }) as unknown as EphemerisService;

const makeFakeTextureLoader = (): {
  service: TextureLoaderService;
  bodyLoads: number[];
  skyboxLoads: number;
} => {
  const bodyLoads: number[] = [];
  let skyboxLoads = 0;
  const service = {
    loadBody(naifId: number) {
      bodyLoads.push(naifId);
      return Promise.resolve(new Texture());
    },
    loadSkybox() {
      skyboxLoads += 1;
      return Promise.resolve(new Texture());
    },
    prefetchAll() {
      return Promise.resolve([]);
    },
    isCached() {
      return false;
    },
  } as unknown as TextureLoaderService;
  return {
    service,
    bodyLoads,
    get skyboxLoads() {
      return skyboxLoads;
    },
  } as never;
};

describe('Story 1.13 — CelestialBodies construction', () => {
  it('constructs one Mesh per NAIF ID + one DirectionalLight + light target', () => {
    const bodies = new CelestialBodies();
    const meshCount = bodies.root.children.filter((c) => c instanceof Mesh).length;
    expect(meshCount).toBe(CELESTIAL_BODY_NAIF_IDS.length);
    const lights = bodies.root.children.filter((c) => c instanceof DirectionalLight);
    expect(lights).toHaveLength(1);
    expect(bodies.sunLight).toBeInstanceOf(DirectionalLight);
  });

  it('each mesh uses the radius from BODY_RADII_KM', () => {
    const bodies = new CelestialBodies();
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      const handle = bodies._peekHandle(naifId)!;
      expect(handle).toBeDefined();
      const geom = handle.mesh.geometry as SphereGeometry;
      expect(geom.parameters.radius).toBe(BODY_RADII_KM[naifId]);
    }
  });

  it('the Sun uses MeshBasicMaterial (unlit), planets+moon use MeshStandardMaterial', () => {
    const bodies = new CelestialBodies();
    const sun = bodies._peekHandle(SUN_NAIF_ID)!;
    expect(sun.material).toBeInstanceOf(MeshBasicMaterial);
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      if (naifId === SUN_NAIF_ID) continue;
      const handle = bodies._peekHandle(naifId)!;
      expect(handle.material).toBeInstanceOf(MeshStandardMaterial);
    }
  });

  it('all bodies start hidden (visible=false) until first ephemeris update', () => {
    const bodies = new CelestialBodies();
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      expect(bodies._peekHandle(naifId)!.mesh.visible).toBe(false);
    }
  });

  it('does not throw when constructed without a textureLoader (textures optional)', () => {
    expect(() => new CelestialBodies()).not.toThrow();
  });
});

describe('Story 1.13 — CelestialBodies.tick reads ephemeris for every body', () => {
  it('writes the body position to mesh.position for every NAIF ID', () => {
    const positions = new Map<number, WorldVec3>();
    let i = 1;
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      positions.set(naifId, worldVec3(i * 100, i * 200, i * 300));
      i += 1;
    }
    const eph = makeFakeEphemeris(positions);
    const bodies = new CelestialBodies();
    bodies.tick(0, eph);

    i = 1;
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      const handle = bodies._peekHandle(naifId)!;
      expect(handle.mesh.position.x).toBeCloseTo(i * 100, 3);
      expect(handle.mesh.position.y).toBeCloseTo(i * 200, 3);
      expect(handle.mesh.position.z).toBeCloseTo(i * 300, 3);
      expect(handle.mesh.visible).toBe(true);
      i += 1;
    }
  });

  it('held-previous on null position (no flicker on chunk-load gap)', () => {
    const positions = new Map<number, WorldVec3>();
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      positions.set(naifId, worldVec3(10, 20, 30));
    }
    const eph = makeFakeEphemeris(positions);
    const bodies = new CelestialBodies();
    bodies.tick(0, eph);
    expect(bodies.allHaveInitialPosition).toBe(true);

    // Simulate chunk eviction for Mercury — null return.
    positions.delete(1);
    bodies.tick(1, eph);

    const mercury = bodies._peekHandle(1)!;
    // Mesh stays at previous position (10, 20, 30); still visible because
    // we have an initial position.
    expect(mercury.mesh.position.x).toBe(10);
    expect(mercury.mesh.visible).toBe(true);
  });

  it('hides bodies before any initial position update', () => {
    const positions = new Map<number, WorldVec3>();
    // Only Sun has data.
    positions.set(SUN_NAIF_ID, worldVec3(0, 0, 0));
    const eph = makeFakeEphemeris(positions);
    const bodies = new CelestialBodies();
    bodies.tick(0, eph);

    // Sun is visible, Mercury is hidden (no prior position).
    expect(bodies._peekHandle(SUN_NAIF_ID)!.mesh.visible).toBe(true);
    expect(bodies._peekHandle(1)!.mesh.visible).toBe(false);
    // allHaveInitialPosition is false because not every body got a position.
    expect(bodies.allHaveInitialPosition).toBe(false);
  });

  it('the directional light tracks the Sun position each frame', () => {
    const positions = new Map<number, WorldVec3>();
    positions.set(SUN_NAIF_ID, worldVec3(1000, 2000, 3000));
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      if (naifId !== SUN_NAIF_ID) positions.set(naifId, worldVec3(0, 0, 0));
    }
    const eph = makeFakeEphemeris(positions);
    const bodies = new CelestialBodies();
    bodies.tick(0, eph);
    expect(bodies.sunLight.position.x).toBe(1000);
    expect(bodies.sunLight.position.y).toBe(2000);
    expect(bodies.sunLight.position.z).toBe(3000);

    // Move the sun.
    positions.set(SUN_NAIF_ID, worldVec3(-500, 0, 0));
    bodies.tick(1, eph);
    expect(bodies.sunLight.position.x).toBe(-500);
    expect(bodies.sunLight.position.y).toBe(0);
  });
});

describe('Story 1.13 — CelestialBodies texture loading', () => {
  it('triggers a loadBody call per non-Sun body when a TextureLoader is supplied', async () => {
    const fake = makeFakeTextureLoader();
    new CelestialBodies({ textureLoader: fake.service });
    // Flush microtasks for the load promises.
    await Promise.resolve();
    // 10 bodies − Sun = 9 loads.
    expect(new Set(fake.bodyLoads)).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 301]),
    );
    expect(fake.bodyLoads).toHaveLength(9);
  });

  it('applies the loaded texture to the planet material map', async () => {
    const fake = makeFakeTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: fake.service });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const mercury = bodies._peekHandle(1)!;
    expect((mercury.material as MeshStandardMaterial).map).toBeInstanceOf(
      Texture,
    );
  });

  it('the Sun never has a texture loaded (synthesized emissive only)', async () => {
    const fake = makeFakeTextureLoader();
    new CelestialBodies({ textureLoader: fake.service });
    await Promise.resolve();
    expect(fake.bodyLoads).not.toContain(SUN_NAIF_ID);
  });
});

describe('Story 1.13 — CelestialBodies.tick perf hygiene', () => {
  it('does not construct a new SphereGeometry inside tick (no per-frame allocs)', () => {
    const positions = new Map<number, WorldVec3>();
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      positions.set(naifId, worldVec3(1, 2, 3));
    }
    const eph = makeFakeEphemeris(positions);
    const bodies = new CelestialBodies();

    // Snapshot geometry references before tick.
    const before = new Map<number, SphereGeometry>();
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      before.set(naifId, bodies._peekHandle(naifId)!.mesh.geometry as SphereGeometry);
    }

    for (let i = 0; i < 60; i++) bodies.tick(i, eph);

    // Same geometry references — no re-construction.
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      expect(bodies._peekHandle(naifId)!.mesh.geometry).toBe(before.get(naifId));
    }
  });
});

// === Story 4.3 AC4 — upgradePlanetTexture ============================

/**
 * Build a fake TextureLoaderService that records per-call
 * `loadBody(naifId, options)` arguments and returns deterministic
 * Texture promises. Lets the upgrade tests assert which tier was
 * requested without standing up a real Three loader.
 */
const makeUpgradeTrackingLoader = (): {
  service: TextureLoaderService;
  calls: Array<{ naifId: number; tier?: string }>;
  resolveAll: (tex: Texture) => void;
  rejectAll: (err: unknown) => void;
} => {
  const calls: Array<{ naifId: number; tier?: string }> = [];
  const pending: Array<{ resolve: (t: Texture) => void; reject: (e: unknown) => void }> = [];
  const service = {
    loadBody(naifId: number, options?: { tier?: string }) {
      // Mirror the real `TextureLoaderService.loadBody` null-slug
      // short-circuit (Story 1.13): bodies without a BODY_TEXTURE_SLUGS
      // entry return null synchronously and `calls` is NOT recorded for
      // them. Story 4.3 T5 — Hyperion (NAIF 607) is INTENTIONALLY absent
      // from BODY_TEXTURE_SLUGS so its loadBody returns null (grey
      // placeholder).
      if (BODY_TEXTURE_SLUGS[naifId] === undefined) return null;
      calls.push({ naifId, tier: options?.tier });
      return new Promise<Texture>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    },
    loadSkybox() {
      return Promise.resolve(new Texture());
    },
    prefetchAll() {
      return Promise.resolve([]);
    },
    isCached() {
      return false;
    },
  } as unknown as TextureLoaderService;
  return {
    service,
    calls,
    resolveAll: (tex: Texture) => {
      for (const p of pending) p.resolve(tex);
      pending.length = 0;
    },
    rejectAll: (err: unknown) => {
      for (const p of pending) p.reject(err);
      pending.length = 0;
    },
  };
};

describe('Story 4.3 AC4 — CelestialBodies.upgradePlanetTexture', () => {
  it('issues a loadBody(bodyId, {tier:"4k"}) call on upgrade (Rule-5 amend default tier)', () => {
    const tracker = makeUpgradeTrackingLoader();
    const bodies = new CelestialBodies({ textureLoader: tracker.service });
    // Boot calls happen for each non-Sun body at the cruise '2k' tier.
    const initialCalls = tracker.calls.length;
    bodies.upgradePlanetTexture(5); // Jupiter → 4k by default (source cap)
    const upgradeCalls = tracker.calls.slice(initialCalls);
    expect(upgradeCalls).toHaveLength(1);
    expect(upgradeCalls[0]).toEqual({ naifId: 5, tier: '4k' });
  });

  it('atomic-swaps material.map on load completion', async () => {
    const tracker = makeUpgradeTrackingLoader();
    const bodies = new CelestialBodies({ textureLoader: tracker.service });
    const jupiter = bodies._peekHandle(5)!;
    // The cruise-tier load resolves immediately; we hand it a different
    // texture so the swap is observable.
    const cruiseTex = new Texture();
    cruiseTex.name = 'cruise-2k';
    const upgradeTex = new Texture();
    upgradeTex.name = 'upgrade-4k';
    tracker.resolveAll(cruiseTex); // resolve the initial loads
    await Promise.resolve();
    await Promise.resolve();
    // Now upgrade.
    bodies.upgradePlanetTexture(5, '4k');
    tracker.resolveAll(upgradeTex);
    await Promise.resolve();
    await Promise.resolve();
    if (jupiter.material instanceof MeshStandardMaterial) {
      expect(jupiter.material.map).toBe(upgradeTex);
    }
  });

  it('is idempotent: a second upgrade to the same-or-lower tier is a no-op', () => {
    const tracker = makeUpgradeTrackingLoader();
    const bodies = new CelestialBodies({ textureLoader: tracker.service });
    const initialCalls = tracker.calls.length;
    bodies.upgradePlanetTexture(5, '4k');
    bodies.upgradePlanetTexture(5, '4k'); // same tier — no-op
    bodies.upgradePlanetTexture(5, '2k'); // lower tier — no-op
    const upgradeCalls = tracker.calls.slice(initialCalls);
    expect(upgradeCalls).toHaveLength(1);
  });

  it('higher-tier request after lower-tier upgrade DOES fire a new load', () => {
    const tracker = makeUpgradeTrackingLoader();
    const bodies = new CelestialBodies({ textureLoader: tracker.service });
    const initialCalls = tracker.calls.length;
    bodies.upgradePlanetTexture(5, '4k');
    // The runtime currently lacks an 8K asset (Rule-5 amend), but the tier
    // ratchet still accepts the upward request — it's a no-op-at-build-time
    // when no source exists. Test pins the in-memory contract.
    bodies.upgradePlanetTexture(5, '8k');
    const upgradeCalls = tracker.calls.slice(initialCalls);
    expect(upgradeCalls).toHaveLength(2);
    expect(upgradeCalls[0]).toEqual({ naifId: 5, tier: '4k' });
    expect(upgradeCalls[1]).toEqual({ naifId: 5, tier: '8k' });
  });

  it('Sun is silently skipped (no texture in this story)', () => {
    const tracker = makeUpgradeTrackingLoader();
    const bodies = new CelestialBodies({ textureLoader: tracker.service });
    const initialCalls = tracker.calls.length;
    bodies.upgradePlanetTexture(SUN_NAIF_ID, '4k');
    expect(tracker.calls.slice(initialCalls)).toEqual([]);
  });

  it('unknown NAIF ID is a silent no-op', () => {
    const tracker = makeUpgradeTrackingLoader();
    const bodies = new CelestialBodies({ textureLoader: tracker.service });
    const initialCalls = tracker.calls.length;
    bodies.upgradePlanetTexture(99999, '4k');
    expect(tracker.calls.slice(initialCalls)).toEqual([]);
  });

  it('no textureLoader configured → silent no-op', () => {
    const bodies = new CelestialBodies();
    expect(() => bodies.upgradePlanetTexture(5, '4k')).not.toThrow();
  });

  it('reverts in-flight tier marker on load failure (allows retry)', async () => {
    const tracker = makeUpgradeTrackingLoader();
    const bodies = new CelestialBodies({ textureLoader: tracker.service });
    // Resolve cruise tier first.
    tracker.resolveAll(new Texture());
    await Promise.resolve();
    await Promise.resolve();
    expect(bodies._peekTier(5)).toBe('2k');
    bodies.upgradePlanetTexture(5, '4k');
    expect(bodies._peekTier(5)).toBe('4k'); // tentative
    // Suppress the expected console.warn from the failed upgrade so the
    // vitest summary stays clean.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    tracker.rejectAll(new Error('network'));
    await Promise.resolve();
    await Promise.resolve();
    expect(bodies._peekTier(5)).toBe('2k'); // reverted
    warn.mockRestore();
  });
});

// === Story 4.3 T5 — addMoonsFor / removeMoonsFor =====================

describe('Story 4.3 T5 — CelestialBodies.addMoonsFor / removeMoonsFor', () => {
  it('addMoonsFor(5) constructs Io / Europa / Ganymede / Callisto meshes', () => {
    const bodies = new CelestialBodies();
    expect(bodies.hasMoon(501)).toBe(false);
    bodies.addMoonsFor(5);
    expect(bodies.hasMoon(501)).toBe(true);
    expect(bodies.hasMoon(502)).toBe(true);
    expect(bodies.hasMoon(503)).toBe(true);
    expect(bodies.hasMoon(504)).toBe(true);
    // Saturn / Uranus / Neptune moons NOT added by the Jupiter SOI entry.
    expect(bodies.hasMoon(606)).toBe(false);
    expect(bodies.hasMoon(801)).toBe(false);
  });

  it('addMoonsFor(6) constructs Titan / Hyperion / Iapetus meshes (Hyperion included for placeholder)', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(6);
    expect(bodies.hasMoon(606)).toBe(true);
    expect(bodies.hasMoon(607)).toBe(true); // Hyperion — grey placeholder
    expect(bodies.hasMoon(608)).toBe(true);
  });

  it('addMoonsFor(7) constructs all 5 major Uranian moons', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(7);
    expect(bodies.hasMoon(701)).toBe(true); // Ariel
    expect(bodies.hasMoon(702)).toBe(true); // Umbriel
    expect(bodies.hasMoon(703)).toBe(true); // Titania
    expect(bodies.hasMoon(704)).toBe(true); // Oberon
    expect(bodies.hasMoon(705)).toBe(true); // Miranda
  });

  it('addMoonsFor(8) constructs Triton only', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(8);
    expect(bodies.hasMoon(801)).toBe(true);
    // No other moons added by the Neptune SOI entry.
    expect(bodies.hasMoon(501)).toBe(false);
    expect(bodies.hasMoon(606)).toBe(false);
    expect(bodies.hasMoon(701)).toBe(false);
  });

  it('addMoonsFor is idempotent — re-adding the same parent is a no-op', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(5);
    const io1 = bodies._peekMoon(501);
    bodies.addMoonsFor(5);
    const io2 = bodies._peekMoon(501);
    expect(io1).toBe(io2); // same handle, not re-constructed
  });

  it('addMoonsFor with unknown parent is a silent no-op', () => {
    const bodies = new CelestialBodies();
    expect(() => bodies.addMoonsFor(999)).not.toThrow();
    expect(bodies.hasMoon(501)).toBe(false);
  });

  it('removeMoonsFor(5) removes Galilean moons from the scene', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(5);
    expect(bodies.hasMoon(501)).toBe(true);
    bodies.removeMoonsFor(5);
    expect(bodies.hasMoon(501)).toBe(false);
    expect(bodies.hasMoon(502)).toBe(false);
    expect(bodies.hasMoon(503)).toBe(false);
    expect(bodies.hasMoon(504)).toBe(false);
  });

  it('removeMoonsFor disposes the mesh geometry + material to free GPU memory', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(5);
    const ioHandle = bodies._peekMoon(501)!;
    const geometry = ioHandle.mesh.geometry;
    const material = ioHandle.material;
    const geomDispose = vi.spyOn(geometry, 'dispose');
    const matDispose = vi.spyOn(material, 'dispose');
    bodies.removeMoonsFor(5);
    expect(geomDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();
    geomDispose.mockRestore();
    matDispose.mockRestore();
  });

  it('removeMoonsFor is idempotent — removing absent moons is a no-op', () => {
    const bodies = new CelestialBodies();
    expect(() => bodies.removeMoonsFor(5)).not.toThrow();
    expect(bodies.hasMoon(501)).toBe(false);
  });

  it('round-trip: add → remove → re-add reconstructs the moon meshes', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(5);
    const io1 = bodies._peekMoon(501);
    bodies.removeMoonsFor(5);
    expect(bodies.hasMoon(501)).toBe(false);
    bodies.addMoonsFor(5);
    const io2 = bodies._peekMoon(501);
    expect(io2).toBeDefined();
    expect(io2).not.toBe(io1); // freshly constructed handle, not the disposed one
  });

  it('Hyperion mesh constructs successfully even though it has no texture slug', () => {
    const tracker = makeUpgradeTrackingLoader();
    const bodies = new CelestialBodies({ textureLoader: tracker.service });
    const initialCalls = tracker.calls.length;
    bodies.addMoonsFor(6);
    expect(bodies.hasMoon(607)).toBe(true);
    // The texture loader was called for Titan + Iapetus (which HAVE slugs)
    // but NOT for Hyperion (607 has no slug → loadBody returns null).
    const moonCalls = tracker.calls.slice(initialCalls);
    const naifsCalled = moonCalls.map((c) => c.naifId).sort();
    expect(naifsCalled).toEqual([606, 608]); // Titan + Iapetus only, Hyperion absent
  });

  it('moon meshes are added to root group (scene-graph parent)', () => {
    const bodies = new CelestialBodies();
    const childCountBefore = bodies.root.children.length;
    bodies.addMoonsFor(5);
    const childCountAfter = bodies.root.children.length;
    expect(childCountAfter - childCountBefore).toBe(4); // 4 Galilean moons
    bodies.removeMoonsFor(5);
    expect(bodies.root.children.length).toBe(childCountBefore);
  });
});

// === Story 4.3 T5 — moon tick positions ==============================

describe('Story 4.3 T5 — moon positions update on tick when ephemeris has the data', () => {
  it('a moon at a known position renders at that position after tick', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(5);
    const positions = new Map<number, WorldVec3>();
    positions.set(501, worldVec3(1e6, 2e6, 3e6)); // Io
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      positions.set(naifId, worldVec3(0, 0, 0));
    }
    const eph = makeFakeEphemeris(positions);
    bodies.tick(0, eph);
    const io = bodies._peekMoon(501)!;
    expect(io.mesh.visible).toBe(true);
    // Render-space converts via Float64→Float32; the cast is allowed to
    // lose precision but the order of magnitude should be preserved.
    expect(Math.abs(io.mesh.position.x - 1e6)).toBeLessThan(1);
    expect(Math.abs(io.mesh.position.y - 2e6)).toBeLessThan(1);
    expect(Math.abs(io.mesh.position.z - 3e6)).toBeLessThan(1);
  });

  it('a moon whose ephemeris returns null stays hidden (graceful degradation)', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(5);
    const positions = new Map<number, WorldVec3>();
    // Cruise bodies get positions; moons do NOT — simulates the case
    // where moon trajectory chunks aren't yet on disk (the bake-side
    // procurement gap).
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      positions.set(naifId, worldVec3(0, 0, 0));
    }
    const eph = makeFakeEphemeris(positions);
    bodies.tick(0, eph);
    const io = bodies._peekMoon(501)!;
    expect(io.mesh.visible).toBe(false);
  });

  it('cruise-body allInitialised does NOT depend on moon ephemeris availability', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(5); // moons added but no ephemeris for them
    const positions = new Map<number, WorldVec3>();
    for (const naifId of CELESTIAL_BODY_NAIF_IDS) {
      positions.set(naifId, worldVec3(0, 0, 0));
    }
    const eph = makeFakeEphemeris(positions);
    bodies.tick(0, eph);
    expect(bodies.allHaveInitialPosition).toBe(true); // moons absent, cruise present → latch OK
  });
});
