// @vitest-environment happy-dom
/**
 * Story 4.3 cycle-5 — cold-load SOI-state replay (defect-driven test).
 *
 * Discovered by the lead's Chrome DevTools MCP smoke at cycle-4: opening
 * `/c/v1-jupiter` lands the simulation at V1's Jupiter encounter ET,
 * which is INSIDE Jupiter's SOI. MissionPhaseFSM's AC3 silent-seed
 * contract (first `update(et)` seeds state without firing events)
 * combined with AC4/AC5's transitions-only consumers
 * (`upgradePlanetTexture` + `addMoonsFor` fire ONLY on `soiEntered`
 * events) produced a story-internal contradiction: cold-load inside an
 * SOI delivered zero downstream effect. Jupiter stayed at 2K PNG, the
 * Galilean moons never appeared, the network log captured zero KTX2
 * requests.
 *
 * Fix shape — a separate cold-load replay path that:
 *   (a) Runs AFTER the first FSM `update(et)` (so silent-seed has fired).
 *   (b) Iterates every `(spacecraft × gas-giant)` pair the FSM tracks.
 *   (c) For any pair where `fsm.isInsideSoi(sc, gg)` returns true,
 *       calls the SAME downstream consumer code path the `soiEntered`
 *       subscriber calls (extracted to `onSoiEnter` in main.ts).
 *   (d) Runs EXACTLY ONCE — gated by `coldLoadReplayDone` boolean.
 *
 * This file pins the replay's CONTRACT against a stub FSM and stub
 * consumers. The actual main.ts wiring is exercised in the integration
 * AC test (`mission-phase-fsm-upgrade-texture-integration.test.ts`),
 * which extends with a cold-load-inside-SOI scenario.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MissionPhaseFSM,
  SOI_RADII_KM,
  SPACECRAFT_NAIF_IDS,
  GAS_GIANT_NAIF_IDS,
} from '../src/services/mission-phase-fsm';
import type { EphemerisService } from '../src/services/ephemeris-service';
import type { WorldVec3 } from '../src/types/branded';
import { worldVec3 } from '../src/types/branded';

// === Stub ephemeris that places V1 INSIDE Jupiter SOI ================

/**
 * Build a stub ephemeris where V1 (-31) is fixed INSIDE Jupiter's SOI
 * (NAIF 5) at every ET. All other spacecraft and gas-giants are placed
 * far apart from each other AND from each other. This simulates the V1
 * Jupiter encounter cold-load scenario. Important: each non-Jupiter
 * gas-giant gets a DIFFERENT far-away position so V2 (which is also
 * placed far away) isn't accidentally co-located with Saturn / Uranus /
 * Neptune (which would register as "inside" all three).
 */
const makeColdLoadInsideJupiterEph = (): EphemerisService => {
  const rJupiter = SOI_RADII_KM[5];
  return {
    getPosition(_et: number, naifId: number): WorldVec3 | null {
      if (naifId === 5) return worldVec3(0, 0, 0); // Jupiter at origin
      if (naifId === -31) return worldVec3(0.5 * rJupiter, 0, 0); // V1 inside
      // Each "far" body at a unique offset so no two co-locate.
      if (naifId === 6) return worldVec3(1e15, 0, 0); // Saturn
      if (naifId === 7) return worldVec3(2e15, 0, 0); // Uranus
      if (naifId === 8) return worldVec3(3e15, 0, 0); // Neptune
      if (naifId === -32) return worldVec3(4e15, 0, 0); // V2
      return worldVec3(5e15, 0, 0);
    },
  } as unknown as EphemerisService;
};

// === Replay implementation under test ================================

/**
 * Pure-function snapshot of the main.ts cold-load replay logic.
 *
 * Iterates `SPACECRAFT_NAIF_IDS × GAS_GIANT_NAIF_IDS`, calls
 * `fsm.isInsideSoi(sc, gg)` for each pair, fires `onSoiEnter(gg)` for
 * every "inside" pair, and toggles the gate boolean to prevent re-fire.
 *
 * In production main.ts this lives inline (closure-captured); the test
 * pins its contract as a standalone function with the same shape so the
 * production wiring is verifiable.
 */
const makeColdLoadReplay = (
  fsm: MissionPhaseFSM,
  onSoiEnter: (bodyId: number) => void,
): { replay: () => void; isDone: () => boolean } => {
  let done = false;
  return {
    replay: () => {
      if (done) return;
      done = true;
      for (const sc of SPACECRAFT_NAIF_IDS) {
        for (const gg of GAS_GIANT_NAIF_IDS) {
          if (fsm.isInsideSoi(sc, gg)) {
            onSoiEnter(gg);
          }
        }
      }
    },
    isDone: () => done,
  };
};

// === Tests ===========================================================

describe('Story 4.3 cycle-5 — cold-load SOI-state replay', () => {
  it('fires onSoiEnter(5) when V1 is seeded INSIDE Jupiter SOI at cold-load', () => {
    const eph = makeColdLoadInsideJupiterEph();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const calls: number[] = [];
    const onSoiEnter = (bodyId: number): void => {
      calls.push(bodyId);
    };
    const { replay } = makeColdLoadReplay(fsm, onSoiEnter);

    // First FSM update at the encounter ET — silently seeds 'inside'
    // for the (V1, Jupiter) pair. NO event fires per the AC3 contract.
    fsm.update(1_000_000); // V1 Jupiter encounter ET (approximate; the
                            // stub doesn't depend on the exact value).
    // Cold-load replay queries getSoiState and fires onSoiEnter for
    // every pair that's already 'inside'.
    replay();

    expect(calls).toEqual([5]); // exactly one call, for Jupiter
  });

  it('runs EXACTLY ONCE — second call to replay() is a no-op (gate)', () => {
    const eph = makeColdLoadInsideJupiterEph();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const calls: number[] = [];
    const onSoiEnter = (bodyId: number): void => {
      calls.push(bodyId);
    };
    const { replay, isDone } = makeColdLoadReplay(fsm, onSoiEnter);

    fsm.update(1_000_000);
    replay();
    expect(isDone()).toBe(true);
    expect(calls).toEqual([5]);

    // Second + third call → gated, no further onSoiEnter fires.
    replay();
    replay();
    expect(calls).toEqual([5]);
  });

  it('fires nothing when no spacecraft is inside any SOI (cruise cold-load)', () => {
    // Stub places every spacecraft far from every gas giant — the
    // cruise cold-load case (e.g. opening `/` at MISSION_START_ET).
    // Spacecraft + gas-giants get DISTINCT positions so the "outside"
    // calculation is unambiguous (no two bodies co-located).
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
    const calls: number[] = [];
    const { replay } = makeColdLoadReplay(fsm, (bodyId) => calls.push(bodyId));
    fsm.update(0);
    replay();
    expect(calls).toEqual([]);
  });

  it('handles BOTH spacecraft inside the same SOI without double-firing onSoiEnter (per-body, not per-pair)', () => {
    // Synthetic edge case: BOTH V1 + V2 simultaneously inside Jupiter SOI.
    // The cold-load replay iterates pairs (sc × gg), so without
    // dedup it would call onSoiEnter(5) twice. Verify the design:
    // onSoiEnter IS called twice (once per spacecraft-in-pair).
    // Downstream consumers (CelestialBodies.addMoonsFor +
    // RenderEngine.upgradePlanetTexture) are idempotent at the per-body
    // tier-ratchet / per-mesh-existence-check level, so the duplicate
    // call is safe; this test pins the SHAPE (not deduplication, which
    // the consumers handle).
    const rJ = SOI_RADII_KM[5];
    const eph = {
      getPosition: (_et: number, naifId: number): WorldVec3 | null => {
        if (naifId === 5) return worldVec3(0, 0, 0);
        if (naifId === -31) return worldVec3(0.5 * rJ, 0, 0);
        if (naifId === -32) return worldVec3(0.4 * rJ, 0, 0);
        // Each non-Jupiter gas giant at a unique far position to avoid
        // accidental co-location with another body.
        if (naifId === 6) return worldVec3(1e15, 0, 0);
        if (naifId === 7) return worldVec3(2e15, 0, 0);
        if (naifId === 8) return worldVec3(3e15, 0, 0);
        return worldVec3(4e15, 0, 0);
      },
    } as unknown as EphemerisService;
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const calls: number[] = [];
    const { replay } = makeColdLoadReplay(fsm, (bodyId) => calls.push(bodyId));
    fsm.update(1_000_000);
    replay();
    // Both V1 and V2 are "inside Jupiter SOI" so both pairs fire
    // onSoiEnter(5). Downstream consumers absorb the double-call via
    // idempotence — this is documented in the replay's docstring and
    // verified by the integration test.
    expect(calls).toEqual([5, 5]);
  });

  it('fires for the correct gas giant when V2 is inside Saturn SOI (not Jupiter)', () => {
    const rSaturn = SOI_RADII_KM[6];
    const eph = {
      getPosition: (_et: number, naifId: number): WorldVec3 | null => {
        if (naifId === 6) return worldVec3(0, 0, 0); // Saturn at origin
        if (naifId === -32) return worldVec3(0.5 * rSaturn, 0, 0); // V2 inside
        // V1 + other gas giants at unique far positions.
        if (naifId === -31) return worldVec3(1e15, 0, 0);
        if (naifId === 5) return worldVec3(2e15, 0, 0);
        if (naifId === 7) return worldVec3(3e15, 0, 0);
        if (naifId === 8) return worldVec3(4e15, 0, 0);
        return worldVec3(5e15, 0, 0);
      },
    } as unknown as EphemerisService;
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const calls: number[] = [];
    const { replay } = makeColdLoadReplay(fsm, (bodyId) => calls.push(bodyId));
    fsm.update(1_000_000);
    replay();
    expect(calls).toEqual([6]);
  });

  it('iterates the FSM-tracked pair set — every gas giant gets a chance to fire', () => {
    // The replay walks SPACECRAFT_NAIF_IDS × GAS_GIANT_NAIF_IDS.
    // Construct an ephemeris that places V1 inside Jupiter AND V2
    // inside Saturn simultaneously (impossible historically but the
    // test pins the iteration shape). Each "far" body gets a unique
    // position so co-location bugs don't trigger spurious "inside" hits.
    const rJ = SOI_RADII_KM[5];
    const rS = SOI_RADII_KM[6];
    const eph = {
      getPosition: (_et: number, naifId: number): WorldVec3 | null => {
        if (naifId === 5) return worldVec3(-1e9, 0, 0); // Jupiter
        if (naifId === 6) return worldVec3(1e9, 0, 0); // Saturn
        if (naifId === 7) return worldVec3(3e15, 0, 0); // Uranus (far)
        if (naifId === 8) return worldVec3(4e15, 0, 0); // Neptune (far)
        if (naifId === -31) return worldVec3(-1e9 + 0.5 * rJ, 0, 0); // V1 inside J
        if (naifId === -32) return worldVec3(1e9 + 0.5 * rS, 0, 0); // V2 inside S
        return worldVec3(5e15, 0, 0);
      },
    } as unknown as EphemerisService;
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const calls: number[] = [];
    const { replay } = makeColdLoadReplay(fsm, (bodyId) => calls.push(bodyId));
    fsm.update(1_000_000);
    replay();
    // V1 inside Jupiter → 5; V2 inside Saturn → 6.
    // Order is determined by the iteration order in the replay:
    // SPACECRAFT first (V1 then V2), GAS_GIANT inner. V1 visits all 4
    // gas giants (only Jupiter matches) then V2 (only Saturn matches).
    expect(calls).toEqual([5, 6]);
  });
});

describe('Story 4.3 cycle-5 — replay does not fire onSoiEnter before first fsm.update()', () => {
  it('without an FSM update the state is "unknown" → replay fires nothing', () => {
    const eph = makeColdLoadInsideJupiterEph();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const calls: number[] = [];
    const { replay } = makeColdLoadReplay(fsm, (bodyId) => calls.push(bodyId));
    // Do NOT call fsm.update — leave state at the initial 'unknown'.
    replay();
    // 'unknown' is neither 'inside' nor 'outside'; isInsideSoi returns
    // false for 'unknown', so nothing fires.
    expect(calls).toEqual([]);
  });
});

describe('Story 4.3 cycle-5 — replay closure does not interfere with subsequent FSM events', () => {
  it('the subscriber still fires soiEntered on subsequent transitions', () => {
    const rJ = SOI_RADII_KM[5];
    // Time-varying V1 position: cold-load OUTSIDE, then crosses INTO
    // Jupiter SOI on update(10). Other bodies get distinct far
    // positions so accidental co-location doesn't trigger false
    // "inside" calculations.
    const eph = {
      getPosition: (et: number, naifId: number): WorldVec3 | null => {
        if (naifId === 5) return worldVec3(0, 0, 0); // Jupiter
        if (naifId === 6) return worldVec3(1e15, 0, 0); // Saturn far
        if (naifId === 7) return worldVec3(2e15, 0, 0); // Uranus far
        if (naifId === 8) return worldVec3(3e15, 0, 0); // Neptune far
        if (naifId === -32) return worldVec3(4e15, 0, 0); // V2 far
        if (naifId === -31) {
          if (et < 10) return worldVec3(2 * rJ, 0, 0); // V1 outside J
          return worldVec3(0.5 * rJ, 0, 0); // V1 inside J
        }
        return worldVec3(5e15, 0, 0);
      },
    } as unknown as EphemerisService;
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const onSoiEnterCalls: number[] = [];
    fsm.subscribe((event) => {
      if (event.type === 'soiEntered') onSoiEnterCalls.push(event.bodyId);
    });

    const replayCalls: number[] = [];
    const { replay } = makeColdLoadReplay(fsm, (bodyId) =>
      replayCalls.push(bodyId),
    );

    // Cold-load: V1 is outside Jupiter at et=0 (silent-seed 'outside').
    fsm.update(0);
    replay();
    expect(replayCalls).toEqual([]); // nothing inside → no replay fires
    expect(onSoiEnterCalls).toEqual([]); // silent seed → no event

    // V1 crosses INTO Jupiter SOI at et=10. The subscriber's
    // soiEntered handler fires; the replay gate is already closed, so
    // it does NOT fire again.
    fsm.update(10);
    expect(onSoiEnterCalls).toEqual([5]); // subscriber fires
    expect(replayCalls).toEqual([]); // replay still empty (cold-load already done)
  });

  it('vi spy: the replay function is a no-op after first invocation', () => {
    const eph = makeColdLoadInsideJupiterEph();
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const onSoiEnter = vi.fn();
    const { replay } = makeColdLoadReplay(fsm, onSoiEnter);
    fsm.update(1_000_000);

    replay();
    expect(onSoiEnter).toHaveBeenCalledTimes(1);
    expect(onSoiEnter).toHaveBeenCalledWith(5);

    // Second + third + fourth invocations are no-ops.
    replay();
    replay();
    replay();
    expect(onSoiEnter).toHaveBeenCalledTimes(1);
  });
});
