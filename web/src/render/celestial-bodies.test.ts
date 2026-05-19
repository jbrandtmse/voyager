import { describe, it, expect } from 'vitest';
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
