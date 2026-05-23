/**
 * QA-stage extension tests for `celestial-bodies.ts` Story 4.3 T5
 * (moon add/remove + upgrade path).
 *
 * Dev pinned: addMoonsFor per system, idempotent re-add, removeMoonsFor
 * geometry+material dispose, round-trip add→remove→re-add reconstructs,
 * unknown parent silent no-op, Hyperion grey placeholder skip.
 *
 * QA pins the failure modes dev didn't pin:
 *
 *   1. **Texture-dispose on moon removal** — the dev test verifies geometry
 *      + material dispose. The story spec also requires the attached
 *      TEXTURE be disposed (per the `removeMoonsFor` docstring: "Dispose
 *      the texture (if a material map was attached)"). Pin this with a
 *      mock-spy on `Texture.dispose()`.
 *
 *   2. **Concurrent SOI events for DIFFERENT bodies in the same frame** —
 *      `addMoonsFor(5)` then immediately `addMoonsFor(6)` (V1J approach
 *      followed by an FSM-driven Saturn-system fire in the same per-frame
 *      pump) must produce BOTH systems' moons in scene without interference.
 *      Same for two `removeMoonsFor` calls in sequence.
 *
 *   3. **Round-trip add → remove → re-add allocates FRESH GPU buffers** —
 *      the dev test asserts the handle is fresh (`io2 !== io1`). QA pins
 *      the stronger contract: the fresh handle's mesh.geometry is a
 *      DIFFERENT SphereGeometry instance (proves no GPU-buffer leak by
 *      retaining the old handle's geometry on re-add).
 *
 *   4. **Idempotent upgrade after texture load completion** — the dev's
 *      idempotency tests fire upgrade calls BEFORE the load resolves.
 *      QA pins: a SECOND upgrade call AFTER the first one's texture has
 *      already swapped into the material is still a no-op (the
 *      `currentTierByNaifId` check holds across the async boundary).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MeshStandardMaterial,
  Texture,
  SphereGeometry,
} from 'three';

import { CelestialBodies } from './celestial-bodies';
import { BODY_TEXTURE_SLUGS } from '../constants/body-radii';
import type { TextureLoaderService } from '../services/texture-loader';

const makeTrackingLoader = (): {
  service: TextureLoaderService;
  resolveAll: (tex: Texture) => void;
  calls: number;
} => {
  let calls = 0;
  const pending: Array<(t: Texture) => void> = [];
  const service = {
    loadBody(naifId: number) {
      if (BODY_TEXTURE_SLUGS[naifId] === undefined) return null;
      calls += 1;
      return new Promise<Texture>((resolve) => {
        pending.push(resolve);
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
    resolveAll: (tex: Texture) => {
      const list = pending.slice();
      pending.length = 0;
      for (const r of list) r(tex);
    },
    get calls() {
      return calls;
    },
  } as never;
};

describe('CelestialBodies QA — moon texture dispose on removeMoonsFor', () => {
  it('disposes the attached Texture (not just geometry+material) when the moon is removed', async () => {
    const tracker = makeTrackingLoader();
    const bodies = new CelestialBodies({ textureLoader: tracker.service });
    // Drain cruise-tier loads (planets + Moon).
    tracker.resolveAll(new Texture());
    await Promise.resolve();
    await Promise.resolve();

    bodies.addMoonsFor(5); // Jupiter system: Io / Europa / Ganymede / Callisto
    // Resolve the moon texture loads with a distinct, spy-able texture.
    const moonTex = new Texture();
    const texDispose = vi.spyOn(moonTex, 'dispose');
    tracker.resolveAll(moonTex);
    await Promise.resolve();
    await Promise.resolve();

    // Confirm the texture landed on Io's material.
    const io = bodies._peekMoon(501)!;
    if (io.material instanceof MeshStandardMaterial) {
      expect(io.material.map).toBe(moonTex);
    }

    // Now remove — the texture's `dispose()` MUST be invoked.
    bodies.removeMoonsFor(5);
    expect(texDispose).toHaveBeenCalled();
  });
});

describe('CelestialBodies QA — concurrent add/remove across multiple systems', () => {
  it('addMoonsFor(5) then addMoonsFor(6) installs both systems independently', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(5);
    bodies.addMoonsFor(6);
    // Galilean (Jupiter)
    expect(bodies.hasMoon(501)).toBe(true);
    expect(bodies.hasMoon(504)).toBe(true);
    // Saturn (Titan / Hyperion / Iapetus)
    expect(bodies.hasMoon(606)).toBe(true);
    expect(bodies.hasMoon(607)).toBe(true);
    expect(bodies.hasMoon(608)).toBe(true);
  });

  it('removeMoonsFor(5) does NOT affect Saturn-system moons added in the same frame', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(5);
    bodies.addMoonsFor(6);
    bodies.removeMoonsFor(5);
    // Saturn moons untouched.
    expect(bodies.hasMoon(606)).toBe(true);
    expect(bodies.hasMoon(607)).toBe(true);
    // Jupiter moons gone.
    expect(bodies.hasMoon(501)).toBe(false);
    expect(bodies.hasMoon(504)).toBe(false);
  });
});

describe('CelestialBodies QA — round-trip re-add allocates a fresh SphereGeometry', () => {
  it('add → remove → re-add yields a NEW SphereGeometry instance (no GPU-buffer leak)', () => {
    const bodies = new CelestialBodies();
    bodies.addMoonsFor(5);
    const geomBefore = bodies._peekMoon(501)!.mesh.geometry as SphereGeometry;
    bodies.removeMoonsFor(5);
    bodies.addMoonsFor(5);
    const geomAfter = bodies._peekMoon(501)!.mesh.geometry as SphereGeometry;
    expect(geomAfter).toBeInstanceOf(SphereGeometry);
    // Fresh instance — proves the re-add did not retain a reference to
    // the disposed-geometry handle.
    expect(geomAfter).not.toBe(geomBefore);
  });
});

describe('CelestialBodies QA — upgrade idempotency across the async boundary', () => {
  it('a second upgrade(5, "4k") AFTER the first texture has already loaded is a no-op', async () => {
    const tracker = makeTrackingLoader();
    const bodies = new CelestialBodies({ textureLoader: tracker.service });
    // Drain cruise-tier loads.
    tracker.resolveAll(new Texture());
    await Promise.resolve();
    await Promise.resolve();
    const callsAfterCruise = tracker.calls;

    bodies.upgradePlanetTexture(5, '4k');
    expect(tracker.calls).toBe(callsAfterCruise + 1); // upgrade load fired

    // Resolve the upgrade load — the texture is now installed and the
    // tier ratchet is at '4k'.
    const upgradeTex = new Texture();
    tracker.resolveAll(upgradeTex);
    await Promise.resolve();
    await Promise.resolve();
    expect(bodies._peekTier(5)).toBe('4k');

    // SECOND upgrade(5, '4k') after the swap — must NOT fire a new load.
    bodies.upgradePlanetTexture(5, '4k');
    expect(tracker.calls).toBe(callsAfterCruise + 1); // still just the one upgrade
    // Downgrade request is also a no-op.
    bodies.upgradePlanetTexture(5, '2k');
    expect(tracker.calls).toBe(callsAfterCruise + 1);
  });
});
