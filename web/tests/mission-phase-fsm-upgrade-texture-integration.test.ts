// @vitest-environment happy-dom
/**
 * Story 4.3 AC7 — Integration AC (Rule 1):
 *   MissionPhaseFSM ↔ RenderEngine.upgradePlanetTexture ↔ TextureLoaderService.
 *
 * MissionPhaseFSM is service-introducing in this story; RenderEngine.
 * upgradePlanetTexture is its first consumer. Per Rule 1 the integration
 * AC asserts the chain end-to-end against the real production classes
 * (no per-step mocking other than the TextureLoaderService stub that
 * records calls without performing network I/O).
 *
 * Chain under test:
 *
 *   1. Synthesize an ET sequence: cruise → INSIDE Jupiter SOI → cruise again.
 *   2. A stub EphemerisService returns positions that put V1 OUTSIDE the
 *      Jupiter SOI at et=0, INSIDE at et=10, OUTSIDE at et=20. (Real
 *      EphemerisService isn't loaded with chunks here — the FSM only
 *      calls `getPosition`, which the stub satisfies.)
 *   3. A real MissionPhaseFSM is constructed with the stub ephemeris.
 *   4. A real RenderEngine is constructed with a real CelestialBodies and
 *      a stub TextureLoaderService that records each `loadBody` call.
 *   5. The FSM's `soiEntered` event is subscribed to a wiring that calls
 *      `RenderEngine.upgradePlanetTexture(event.bodyId)`.
 *   6. The test ticks the FSM through the sequence and asserts:
 *        (a) exactly one `soiEntered({bodyId: 5})` event is emitted
 *        (b) `RenderEngine.upgradePlanetTexture(5)` is called exactly once
 *        (c) the stub TextureLoaderService records exactly one call with
 *            `naifId=5, tier='4k'` (the Rule-5-amended default tier per
 *            AC4 — see GAS_GIANT_JOBS docstring in build_textures.ts for
 *            the source-data-cap rationale)
 *        (d) the atomic-swap path runs: after the stub texture resolves,
 *            `jupiterMesh.material.map === newTexture` on the same tick.
 *
 * Reverse-scrub sub-test:
 *   - The FSM emits `soiExited` symmetrically on the reverse pass; this
 *     test does NOT trigger a tier de-escalation (story's Out-of-Scope:
 *     "Reverse-scrub texture-tier de-escalation ... out of scope; the
 *     texture stays at the highest tier loaded for the session"), but
 *     the assertion still pins that the EXIT event fires.
 */

import { describe, it, expect } from 'vitest';
import { Texture, MeshStandardMaterial } from 'three';

import {
  MissionPhaseFSM,
  SOI_RADII_KM,
  SPACECRAFT_NAIF_IDS,
  GAS_GIANT_NAIF_IDS,
} from '../src/services/mission-phase-fsm';
import type { MissionPhaseEvent } from '../src/services/mission-phase-fsm';
import { RenderEngine } from '../src/render/render-engine';
import { CelestialBodies } from '../src/render/celestial-bodies';
import type { EphemerisService } from '../src/services/ephemeris-service';
import type { TextureLoaderService } from '../src/services/texture-loader';
import type { GPUCapabilities } from '../src/boot/gpu-capability-probe';
import { BODY_TEXTURE_SLUGS } from '../src/constants/body-radii';
import type { WorldVec3 } from '../src/types/branded';
import { worldVec3 } from '../src/types/branded';

// === Stub builders ==========================================================

/**
 * Stub EphemerisService — only `getPosition` is exercised by the FSM.
 * Returns engineered positions that put V1 OUTSIDE Jupiter SOI at et < 10
 * and INSIDE at 10 ≤ et < 20 (and OUTSIDE again at et ≥ 20). V2 and
 * everything else stays far outside any SOI.
 */
const makeStubEphemeris = (): EphemerisService => {
  const rJupiter = SOI_RADII_KM[5];
  return {
    getPosition(et: number, naifId: number): WorldVec3 | null {
      if (naifId === 5) return worldVec3(0, 0, 0); // Jupiter at origin
      if (naifId === -31) {
        // V1 — outside, inside, outside.
        if (et < 10) return worldVec3(2 * rJupiter, 0, 0);
        if (et < 20) return worldVec3(0.5 * rJupiter, 0, 0);
        return worldVec3(2 * rJupiter, 0, 0);
      }
      // V2 and the other gas giants — far outside.
      return worldVec3(1e15, 0, 0);
    },
  } as unknown as EphemerisService;
};

/** Record-on-call stub TextureLoaderService. */
interface RecordedCall {
  readonly naifId: number;
  readonly tier?: string;
}

interface StubTextureLoader {
  service: TextureLoaderService;
  calls: RecordedCall[];
  /** Resolve every pending loadBody promise with the supplied texture. */
  resolveAll(tex: Texture): void;
}

const makeStubTextureLoader = (): StubTextureLoader => {
  const calls: RecordedCall[] = [];
  const pending: Array<(t: Texture) => void> = [];
  const service = {
    loadBody(naifId: number, options?: { tier?: string }): Promise<Texture> | null {
      // Mirror `TextureLoaderService.loadBody` null-slug short-circuit
      // (Story 1.13). Hyperion (NAIF 607) is intentionally absent from
      // BODY_TEXTURE_SLUGS so this stub also returns null for it.
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
      for (const r of pending) r(tex);
      pending.length = 0;
    },
  };
};

/** Minimum GPUCapabilities surface RenderEngine + tests need. */
const FAKE_CAPS: GPUCapabilities = {
  supportsReverseZ: true,
  supportsFloatDepth: true,
  recommendedTextureTier: '8k',
  adequateForEightK: true,
};

// === Tests ==================================================================

describe('Story 4.3 AC7 — MissionPhaseFSM → RenderEngine.upgradePlanetTexture integration', () => {
  it('SOI entry triggers upgradePlanetTexture → loadBody → atomic swap', async () => {
    // 1. Build the chain.
    const eph = makeStubEphemeris();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });
    // Drain the initial cruise-tier loads (one per non-Sun body) so the
    // recorded calls reflect ONLY the upgrade chain.
    loaderStub.resolveAll(new Texture());
    await Promise.resolve();
    await Promise.resolve();
    const initialCalls = loaderStub.calls.length;

    // RenderEngine wired with the same caps that the cruise-tier choose.
    // (We don't init() — the integration test doesn't render to a real
    // canvas; we exercise the wire-up surface only.)
    const engine = new RenderEngine(FAKE_CAPS, {});
    engine.setCelestialBodies(bodies);

    // 2. Wire the FSM → engine subscriber.
    let upgradeCalls = 0;
    const unsub = fsm.subscribe((event: MissionPhaseEvent) => {
      if (event.type === 'soiEntered' && event.bodyId === 5) {
        upgradeCalls += 1;
        engine.upgradePlanetTexture(event.bodyId);
      }
    });

    // 3. Tick the FSM through cruise → inside → outside.
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));
    fsm.update(0); // seed — no events
    fsm.update(10); // entered — fires soiEntered({bodyId: 5})
    fsm.update(20); // exited — fires soiExited

    // 4. Assertions.
    const entered = events.filter((e) => e.type === 'soiEntered');
    const exited = events.filter((e) => e.type === 'soiExited');
    expect(entered).toHaveLength(1);
    expect(entered[0]).toMatchObject({ type: 'soiEntered', bodyId: 5, spacecraft: -31 });
    expect(exited).toHaveLength(1);

    expect(upgradeCalls).toBe(1);
    const upgradeOnlyCalls = loaderStub.calls.slice(initialCalls);
    expect(upgradeOnlyCalls).toHaveLength(1);
    expect(upgradeOnlyCalls[0]).toMatchObject({ naifId: 5, tier: '4k' });

    // 5. Atomic swap — resolve the texture and assert the material.map is
    //    the new texture on the same tick.
    const upgradeTex = new Texture();
    upgradeTex.name = 'integration-upgrade-tex';
    loaderStub.resolveAll(upgradeTex);
    await Promise.resolve();
    await Promise.resolve();
    const jupiter = bodies._peekHandle(5)!;
    expect(jupiter.material).toBeInstanceOf(MeshStandardMaterial);
    if (jupiter.material instanceof MeshStandardMaterial) {
      expect(jupiter.material.map).toBe(upgradeTex);
    }

    unsub();
  });

  it('reverse scrub fires soiExited symmetrically; tier does NOT de-escalate (NFR-C6)', () => {
    // Out-of-Scope reminder (story spec): "Reverse-scrub texture-tier de-
    // escalation (going BACK from 8K to 4K when leaving SOI) — out of
    // scope; the texture stays at the highest tier loaded for the
    // session." This test pins that semantics.
    const eph = makeStubEphemeris();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });
    loaderStub.resolveAll(new Texture()); // drain cruise tier loads
    const initialCalls = loaderStub.calls.length;

    const engine = new RenderEngine(FAKE_CAPS, {});
    engine.setCelestialBodies(bodies);

    fsm.subscribe((event: MissionPhaseEvent) => {
      if (event.type === 'soiEntered') {
        engine.upgradePlanetTexture(event.bodyId);
      }
      // Intentionally: no `if (event.type === 'soiExited')` handler — the
      // story is explicit that exits do NOT de-escalate the tier.
    });

    fsm.update(0); // seed (outside)
    fsm.update(10); // entered → upgrade fires
    fsm.update(20); // exited → no de-escalation
    fsm.update(10); // re-enter — IDEMPOTENT: tier already at 4k, no second load
    fsm.update(0); // exit again — still no de-escalation

    const upgradeCalls = loaderStub.calls.slice(initialCalls);
    // The upgrade fires on each forward soiEntered crossing, but
    // CelestialBodies.upgradePlanetTexture is itself idempotent at the
    // tier level (won't issue a fresh loadBody if the body is already at
    // the target tier). So we expect exactly ONE recorded call across
    // all the back-and-forth transitions.
    expect(upgradeCalls).toHaveLength(1);
    expect(upgradeCalls[0]).toMatchObject({ naifId: 5, tier: '4k' });
  });

  it('GPU memory gate (NFR-C6): adequateForEightK=false → 4k stays the highest tier the wiring requests', () => {
    // The runtime gate lives at the SUBSCRIBER (main.ts), not inside
    // upgradePlanetTexture itself — see RenderEngine.upgradePlanetTexture
    // docstring. This test pins the gating CONTRACT: a subscriber that
    // checks `engine.getCapabilities().adequateForEightK` SKIPS the
    // upgrade call entirely when the gate is closed.
    const eph = makeStubEphemeris();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });
    loaderStub.resolveAll(new Texture()); // drain cruise tier loads
    const initialCalls = loaderStub.calls.length;

    // Low-memory caps — adequateForEightK = false.
    const lowMemCaps: GPUCapabilities = {
      supportsReverseZ: false,
      supportsFloatDepth: false,
      recommendedTextureTier: '4k',
      adequateForEightK: false,
    };
    const engine = new RenderEngine(lowMemCaps, {});
    engine.setCelestialBodies(bodies);

    fsm.subscribe((event: MissionPhaseEvent) => {
      if (event.type === 'soiEntered') {
        // The canonical gate: respect adequateForEightK at the call site.
        // For Story 4.3 we ship 4K only; an upstream low-memory device
        // would skip even the 4K upgrade (the gate is conservative — if
        // we can't host the higher tier, we don't promote at all). The
        // capability surface is what closes the gate.
        const caps = engine.getCapabilities();
        if (!caps.adequateForEightK) return; // gate closed
        engine.upgradePlanetTexture(event.bodyId);
      }
    });

    fsm.update(0);
    fsm.update(10); // entered, but gate closed → no upgrade call
    fsm.update(20);

    expect(loaderStub.calls.slice(initialCalls)).toHaveLength(0);
  });
});

// === Story 4.3 T5 — moon add/remove on SOI events ====================

describe('Story 4.3 T5 — moon meshes added on SOI entry, removed on SOI exit', () => {
  it('soiEntered for Jupiter triggers addMoonsFor(5) → 4 Galilean moons in scene', () => {
    const eph = makeStubEphemeris();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });
    loaderStub.resolveAll(new Texture()); // drain cruise loads

    fsm.subscribe((event: MissionPhaseEvent) => {
      if (event.type === 'soiEntered') bodies.addMoonsFor(event.bodyId);
      else if (event.type === 'soiExited') bodies.removeMoonsFor(event.bodyId);
    });

    fsm.update(0); // seed (outside)
    expect(bodies.hasMoon(501)).toBe(false);
    fsm.update(10); // enter Jupiter SOI
    expect(bodies.hasMoon(501)).toBe(true); // Io
    expect(bodies.hasMoon(502)).toBe(true); // Europa
    expect(bodies.hasMoon(503)).toBe(true); // Ganymede
    expect(bodies.hasMoon(504)).toBe(true); // Callisto
  });

  it('soiExited removes the moon meshes from the scene (AC5 default — removed not LOD3-retain)', () => {
    const eph = makeStubEphemeris();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });
    loaderStub.resolveAll(new Texture());

    fsm.subscribe((event: MissionPhaseEvent) => {
      if (event.type === 'soiEntered') bodies.addMoonsFor(event.bodyId);
      else if (event.type === 'soiExited') bodies.removeMoonsFor(event.bodyId);
    });

    fsm.update(0); // seed
    fsm.update(10); // enter — moons added
    expect(bodies.hasMoon(501)).toBe(true);
    fsm.update(20); // exit — moons removed
    expect(bodies.hasMoon(501)).toBe(false);
    expect(bodies.hasMoon(504)).toBe(false);
  });

  it('moon-texture loads fire alongside the gas-giant upgrade on Jupiter SOI entry', () => {
    const eph = makeStubEphemeris();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });
    loaderStub.resolveAll(new Texture()); // drain cruise loads
    const initialCalls = loaderStub.calls.length;

    const engine = new RenderEngine(FAKE_CAPS, {});
    engine.setCelestialBodies(bodies);

    fsm.subscribe((event: MissionPhaseEvent) => {
      if (event.type === 'soiEntered') {
        bodies.addMoonsFor(event.bodyId);
        engine.upgradePlanetTexture(event.bodyId);
      }
    });

    fsm.update(0);
    fsm.update(10); // enter Jupiter SOI

    const moonCalls = loaderStub.calls.slice(initialCalls);
    const naifsCalled = moonCalls.map((c) => c.naifId).sort((a, b) => a - b);
    // Expected: Jupiter (5) upgrade + Io / Europa / Ganymede / Callisto
    // (501..504) cruise-tier loads. NO Hyperion (607) because that's a
    // Saturn moon, not Jupiter, and the addMoonsFor(5) call only touches
    // the Jupiter system.
    expect(naifsCalled).toEqual([5, 501, 502, 503, 504]);
  });
});

// === Story 4.3 cycle-5 — cold-load inside SOI scenario ===============

/**
 * Stub ephemeris where V1 is INSIDE Jupiter's SOI at every ET — the
 * cold-load case from the lead's MCP smoke (opening `/c/v1-jupiter`).
 * Every other body gets a distinct far position so no spurious
 * co-location triggers a false "inside" calculation.
 */
const makeColdLoadInsideJupiterEphemeris = (): EphemerisService => {
  const rJupiter = SOI_RADII_KM[5];
  return {
    getPosition(_et: number, naifId: number): WorldVec3 | null {
      if (naifId === 5) return worldVec3(0, 0, 0); // Jupiter at origin
      if (naifId === -31) return worldVec3(0.5 * rJupiter, 0, 0); // V1 inside
      if (naifId === 6) return worldVec3(1e15, 0, 0); // Saturn far
      if (naifId === 7) return worldVec3(2e15, 0, 0); // Uranus far
      if (naifId === 8) return worldVec3(3e15, 0, 0); // Neptune far
      if (naifId === -32) return worldVec3(4e15, 0, 0); // V2 far
      return worldVec3(5e15, 0, 0);
    },
  } as unknown as EphemerisService;
};

describe('Story 4.3 cycle-5 — cold-load inside Jupiter SOI fires upgrade + moons (distinct from "crossing INTO SOI")', () => {
  it('inline replay simulating main.ts wire-up: V1 cold-loaded inside Jupiter triggers upgrade + moon adds', () => {
    // The CRITICAL distinction from the cycle-3 "soiEntered" tests:
    // here, the first FSM update lands at an ET where V1 is ALREADY
    // inside Jupiter's SOI. AC3's silent-seed contract means NO
    // soiEntered event fires. The cold-load replay must pick up the
    // slack and call the SAME consumer code path.
    const eph = makeColdLoadInsideJupiterEphemeris();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });
    // Drain cruise loads so the recorded `loaderStub.calls` reflects
    // only post-cold-load activity.
    loaderStub.resolveAll(new Texture());
    const initialCalls = loaderStub.calls.length;

    const engine = new RenderEngine(FAKE_CAPS, {});
    engine.setCelestialBodies(bodies);

    // Mirror main.ts's `onSoiEnter` extraction + replay closure.
    const onSoiEnter = (bodyId: number): void => {
      bodies.addMoonsFor(bodyId);
      if (!engine.getCapabilities().adequateForEightK) return;
      engine.upgradePlanetTexture(bodyId);
    };
    const soiEnteredEvents: number[] = [];
    fsm.subscribe((event: MissionPhaseEvent) => {
      if (event.type === 'soiEntered') {
        soiEnteredEvents.push(event.bodyId);
        onSoiEnter(event.bodyId);
      }
    });
    let coldLoadReplayDone = false;
    const replay = (): void => {
      if (coldLoadReplayDone) return;
      coldLoadReplayDone = true;
      for (const sc of SPACECRAFT_NAIF_IDS) {
        for (const gg of GAS_GIANT_NAIF_IDS) {
          if (fsm.isInsideSoi(sc, gg)) onSoiEnter(gg);
        }
      }
    };

    // First FSM update lands at the cold-load ET — silently seeds
    // V1↔Jupiter to 'inside'. NO soiEntered fires per AC3.
    fsm.update(1_000_000);
    expect(soiEnteredEvents).toEqual([]); // pin the silent-seed contract

    // Cold-load replay closes the gap.
    replay();

    // Now upgradePlanetTexture(5) + addMoonsFor(5) have been called.
    expect(bodies.hasMoon(501)).toBe(true); // Io
    expect(bodies.hasMoon(502)).toBe(true); // Europa
    expect(bodies.hasMoon(503)).toBe(true); // Ganymede
    expect(bodies.hasMoon(504)).toBe(true); // Callisto

    const upgradeCalls = loaderStub.calls.slice(initialCalls);
    // Expect: Jupiter (5) upgrade + 4 Galilean moon cruise-tier loads.
    const naifsCalled = upgradeCalls.map((c) => c.naifId).sort((a, b) => a - b);
    expect(naifsCalled).toEqual([5, 501, 502, 503, 504]);
    // Verify the gas-giant upgrade tier is '4k' (the cycle-3 Rule-5
    // amend default).
    const jupiterCall = upgradeCalls.find((c) => c.naifId === 5);
    expect(jupiterCall?.tier).toBe('4k');
  });

  it('replay does NOT re-fire on subsequent FSM updates (coldLoadReplayDone gate)', () => {
    const eph = makeColdLoadInsideJupiterEphemeris();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });
    loaderStub.resolveAll(new Texture());
    const initialCalls = loaderStub.calls.length;

    const engine = new RenderEngine(FAKE_CAPS, {});
    engine.setCelestialBodies(bodies);

    let coldLoadReplayDone = false;
    const onSoiEnter = (bodyId: number): void => {
      bodies.addMoonsFor(bodyId);
      engine.upgradePlanetTexture(bodyId);
    };
    const replay = (): void => {
      if (coldLoadReplayDone) return;
      coldLoadReplayDone = true;
      for (const sc of SPACECRAFT_NAIF_IDS) {
        for (const gg of GAS_GIANT_NAIF_IDS) {
          if (fsm.isInsideSoi(sc, gg)) onSoiEnter(gg);
        }
      }
    };

    fsm.update(1_000_000);
    replay();
    const callsAfterFirstReplay = loaderStub.calls.length - initialCalls;

    // Simulate 5 more frames of FSM updates — each would trigger the
    // replay if the gate weren't in place. We expect zero additional
    // consumer calls.
    for (let i = 1; i <= 5; i++) {
      fsm.update(1_000_000 + i);
      replay();
    }
    const callsAfterMoreReplays = loaderStub.calls.length - initialCalls;
    expect(callsAfterMoreReplays).toBe(callsAfterFirstReplay);
  });

  it('cold-load OUTSIDE every SOI (cruise URL) fires no replay calls', () => {
    // Stub: every spacecraft far from every gas giant — at distinct
    // positions so co-location bugs don't trigger false "inside" hits.
    const eph = {
      getPosition: (_et: number, naifId: number): WorldVec3 | null => {
        if (naifId === -31) return worldVec3(1e15, 0, 0);
        if (naifId === -32) return worldVec3(2e15, 0, 0);
        if (naifId === 5) return worldVec3(3e15, 0, 0);
        if (naifId === 6) return worldVec3(4e15, 0, 0);
        if (naifId === 7) return worldVec3(5e15, 0, 0);
        if (naifId === 8) return worldVec3(6e15, 0, 0);
        return worldVec3(0, 0, 0);
      },
    } as unknown as EphemerisService;
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const loaderStub = makeStubTextureLoader();
    const bodies = new CelestialBodies({ textureLoader: loaderStub.service });
    loaderStub.resolveAll(new Texture());
    const initialCalls = loaderStub.calls.length;

    const engine = new RenderEngine(FAKE_CAPS, {});
    engine.setCelestialBodies(bodies);

    let coldLoadReplayDone = false;
    const onSoiEnter = (bodyId: number): void => {
      bodies.addMoonsFor(bodyId);
      engine.upgradePlanetTexture(bodyId);
    };
    const replay = (): void => {
      if (coldLoadReplayDone) return;
      coldLoadReplayDone = true;
      for (const sc of SPACECRAFT_NAIF_IDS) {
        for (const gg of GAS_GIANT_NAIF_IDS) {
          if (fsm.isInsideSoi(sc, gg)) onSoiEnter(gg);
        }
      }
    };
    fsm.update(0);
    replay();
    expect(loaderStub.calls.slice(initialCalls)).toEqual([]);
    expect(bodies.hasMoon(501)).toBe(false);
  });
});
