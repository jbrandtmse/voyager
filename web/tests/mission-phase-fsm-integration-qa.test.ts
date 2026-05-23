// @vitest-environment happy-dom
/**
 * QA-stage extension tests for Story 4.3 AC7 (Integration AC, Rule 1):
 *   MissionPhaseFSM → RenderEngine.upgradePlanetTexture → TextureLoaderService.
 *
 * Dev pinned: cold SOI entry → upgrade → atomic swap chain; reverse-scrub
 * symmetry with NFR-C6 tier non-de-escalation; GPU-memory gate skips
 * upgrade when `adequateForEightK = false`.
 *
 * QA pins:
 *
 *   1. **pendingCount > 0 backpressure** — if `RenderEngine.upgradePlanetTexture`
 *      is fired a SECOND time for the same body BEFORE the first load
 *      resolves, the second call must be a no-op (the in-flight tier
 *      marker in `CelestialBodies.currentTierByNaifId` should prevent a
 *      duplicate `loadBody` fetch). Pin this so a future refactor that
 *      removes the in-flight guard doesn't silently regress.
 *
 *   2. **Reverse-then-re-enter SOI symmetry across mid-upgrade timing.**
 *      The dev's reverse-scrub test asserts idempotence at the tier level.
 *      QA adds the harder case: enter SOI → upgrade starts but DOES NOT
 *      yet resolve → reverse-scrub OUT → re-enter SOI → THEN the original
 *      load resolves. The tier should remain at `'4k'`; the resolved
 *      texture should land on `jupiterMesh.material.map` exactly once.
 *
 *   3. **GPU-memory gate consistency across multiple subscribers** — if
 *      TWO subscribers both subscribe to `soiEntered` (e.g. main.ts's
 *      texture-upgrade + a hypothetical future moon-cruise subscriber),
 *      the gate at one subscriber must NOT short-circuit the other. Pin
 *      the contract that subscribers are independent: a gated-skip in
 *      subscriber A doesn't prevent subscriber B from running.
 */

import { describe, it, expect } from 'vitest';
import { Texture, MeshStandardMaterial } from 'three';

import { MissionPhaseFSM, SOI_RADII_KM } from '../src/services/mission-phase-fsm';
import type { MissionPhaseEvent } from '../src/services/mission-phase-fsm';
import { RenderEngine } from '../src/render/render-engine';
import { CelestialBodies } from '../src/render/celestial-bodies';
import type { EphemerisService } from '../src/services/ephemeris-service';
import type { TextureLoaderService } from '../src/services/texture-loader';
import type { GPUCapabilities } from '../src/boot/gpu-capability-probe';
import { BODY_TEXTURE_SLUGS } from '../src/constants/body-radii';
import type { WorldVec3 } from '../src/types/branded';
import { worldVec3 } from '../src/types/branded';

const makeStubEphemeris = (): EphemerisService => {
  const rJupiter = SOI_RADII_KM[5];
  return {
    getPosition(et: number, naifId: number): WorldVec3 | null {
      if (naifId === 5) return worldVec3(0, 0, 0);
      if (naifId === -31) {
        if (et < 10) return worldVec3(2 * rJupiter, 0, 0);
        if (et < 20) return worldVec3(0.5 * rJupiter, 0, 0);
        if (et < 30) return worldVec3(2 * rJupiter, 0, 0);
        return worldVec3(0.5 * rJupiter, 0, 0);
      }
      return worldVec3(1e15, 0, 0);
    },
  } as unknown as EphemerisService;
};

interface RecordedCall {
  readonly naifId: number;
  readonly tier?: string;
}
interface StubTextureLoader {
  service: TextureLoaderService;
  calls: RecordedCall[];
  resolveAll(tex: Texture): void;
  resolveNext(tex: Texture): void;
  pendingCount(): number;
}

const makeStubTextureLoader = (): StubTextureLoader => {
  const calls: RecordedCall[] = [];
  const pending: Array<(t: Texture) => void> = [];
  const service = {
    loadBody(naifId: number, options?: { tier?: string }): Promise<Texture> | null {
      if (BODY_TEXTURE_SLUGS[naifId] === undefined) return null;
      calls.push({ naifId, tier: options?.tier });
      return new Promise<Texture>((resolve) => {
        pending.push(resolve);
      });
    },
    loadSkybox(): Promise<Texture> {
      return Promise.resolve(new Texture());
    },
    prefetchAll(): Promise<unknown[]> {
      return Promise.resolve([]);
    },
    isCached(): boolean {
      return false;
    },
  } as unknown as TextureLoaderService;
  return {
    service,
    calls,
    resolveAll: (tex: Texture) => {
      const all = pending.slice();
      pending.length = 0;
      for (const r of all) r(tex);
    },
    resolveNext: (tex: Texture) => {
      const next = pending.shift();
      if (next) next(tex);
    },
    pendingCount: () => pending.length,
  };
};

const FAKE_CAPS: GPUCapabilities = {
  supportsReverseZ: true,
  supportsFloatDepth: true,
  recommendedTextureTier: '8k',
  adequateForEightK: true,
};

describe('Story 4.3 AC7 QA — pendingCount backpressure', () => {
  it('second upgradePlanetTexture(5) call BEFORE first load resolves is a no-op', async () => {
    const eph = makeStubEphemeris();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });
    // Drain cruise-tier loads.
    loaderStub.resolveAll(new Texture());
    await Promise.resolve();
    await Promise.resolve();
    const baseline = loaderStub.calls.length;

    const engine = new RenderEngine(FAKE_CAPS, {});
    engine.setCelestialBodies(bodies);

    // First upgrade — kicks a load.
    engine.upgradePlanetTexture(5);
    const afterFirst = loaderStub.calls.length;
    expect(afterFirst).toBe(baseline + 1);

    // Second upgrade for the SAME body, same tier, BEFORE the first
    // resolved — must NOT issue a duplicate load.
    engine.upgradePlanetTexture(5);
    expect(loaderStub.calls.length).toBe(afterFirst);

    // Resolve the in-flight load — atomic swap fires.
    const tex = new Texture();
    loaderStub.resolveAll(tex);
    await Promise.resolve();
    await Promise.resolve();
    const jup = bodies._peekHandle(5)!;
    if (jup.material instanceof MeshStandardMaterial) {
      expect(jup.material.map).toBe(tex);
    }

    // FSM is decoration here — using only the engine direct surface keeps
    // the test scoped to the backpressure contract.
    fsm.dispose();
  });
});

describe('Story 4.3 AC7 QA — reverse + re-enter while upgrade mid-flight', () => {
  it('reverse-scrub then re-enter while in-flight does not double-load nor lose the atomic swap', async () => {
    const eph = makeStubEphemeris();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });
    loaderStub.resolveAll(new Texture());
    await Promise.resolve();
    const baseline = loaderStub.calls.length;

    const engine = new RenderEngine(FAKE_CAPS, {});
    engine.setCelestialBodies(bodies);

    let entered = 0;
    fsm.subscribe((event: MissionPhaseEvent) => {
      if (event.type === 'soiEntered' && event.bodyId === 5) {
        entered += 1;
        engine.upgradePlanetTexture(event.bodyId);
      }
    });

    fsm.update(0); // seed (outside)
    fsm.update(10); // enter — upgrade fires, mid-flight
    expect(entered).toBe(1);
    expect(loaderStub.calls.length).toBe(baseline + 1);

    fsm.update(20); // exit (no tier de-escalation per Out-of-Scope)
    fsm.update(40); // re-enter Jupiter SOI — tier already '4k', so no new load
    expect(entered).toBe(2);
    expect(loaderStub.calls.length).toBe(baseline + 1); // STILL only one load

    // NOW resolve the in-flight load — texture lands.
    const upgradeTex = new Texture();
    loaderStub.resolveAll(upgradeTex);
    await Promise.resolve();
    await Promise.resolve();
    const jup = bodies._peekHandle(5)!;
    if (jup.material instanceof MeshStandardMaterial) {
      expect(jup.material.map).toBe(upgradeTex);
    }
    expect(bodies._peekTier(5)).toBe('4k');
  });
});

describe('Story 4.3 AC7 QA — multi-subscriber independence under gate-closed', () => {
  it('a gated-skip in subscriber A does not prevent subscriber B from running', () => {
    const eph = makeStubEphemeris();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });

    const lowMemCaps: GPUCapabilities = {
      supportsReverseZ: false,
      supportsFloatDepth: false,
      recommendedTextureTier: '4k',
      adequateForEightK: false,
    };
    const engine = new RenderEngine(lowMemCaps, {});
    engine.setCelestialBodies(bodies);

    // Subscriber A — gated-skip on low-mem; only fires upgrade if gate open.
    let aRan = 0;
    fsm.subscribe((event: MissionPhaseEvent) => {
      if (event.type !== 'soiEntered') return;
      aRan += 1;
      const caps = engine.getCapabilities();
      if (!caps.adequateForEightK) return; // gate closed
      engine.upgradePlanetTexture(event.bodyId);
    });

    // Subscriber B — unconditional; adds moon meshes regardless of GPU caps.
    let bRan = 0;
    fsm.subscribe((event: MissionPhaseEvent) => {
      if (event.type !== 'soiEntered') return;
      bRan += 1;
      bodies.addMoonsFor(event.bodyId);
    });

    fsm.update(0); // seed
    fsm.update(10); // enter Jupiter SOI

    expect(aRan).toBe(1); // A ran, but gated-skipped
    expect(bRan).toBe(1); // B ran AND added moons
    expect(bodies.hasMoon(501)).toBe(true); // Io present
    expect(loaderStub.calls.find((c) => c.naifId === 5 && c.tier === '4k')).toBeUndefined();
  });
});
