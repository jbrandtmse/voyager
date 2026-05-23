/**
 * MissionPhaseFSM tests (Story 4.3 AC3).
 *
 * Stub EphemerisService — the FSM only reads `getPosition(et, naifId)`;
 * we hand-build a function that returns deterministic positions placing
 * the spacecraft inside / outside any chosen gas giant's SOI at chosen
 * ETs. No real chunks, no manifest.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MissionPhaseFSM,
  SOI_RADII_KM,
  type MissionPhaseEvent,
} from './mission-phase-fsm';
import type { EphemerisService } from './ephemeris-service';
import type { WorldVec3 } from '../types/branded';
import { worldVec3 } from '../types/branded';
import { getShutoffEt } from '../data/mission-facts';

// === Stub EphemerisService ===========================================

/**
 * Build a stub EphemerisService.
 *
 * @param posFn callback returning the position for (et, naifId), or null
 *              if the chunk should be considered missing for that ET/body
 */
const makeStubEphemeris = (
  posFn: (et: number, naifId: number) => WorldVec3 | null,
): EphemerisService => {
  return {
    getPosition: (et: number, naifId: number) => posFn(et, naifId),
  } as unknown as EphemerisService;
};

// === SOI crossing tests ==============================================

describe('MissionPhaseFSM — SOI crossings', () => {
  it('does NOT fire an event on the first update (seeds state silently)', () => {
    // Place spacecraft outside every gas giant's SOI:
    //   spacecraft at (1e15, 0, 0); gas giants near origin.
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    fsm.update(0);
    expect(events).toEqual([]);
    // State is seeded to 'outside' for every (sc, gg) pair.
    expect(fsm.getSoiState(-31, 5)).toBe('outside');
  });

  it('fires soiEntered when V1 crosses INTO Jupiter SOI', () => {
    // Distance V1 → Jupiter:
    //   t=0  : 2 * R_SOI(Jupiter) (outside)
    //   t=10 : 0.5 * R_SOI(Jupiter) (inside)
    const rJ = SOI_RADII_KM[5];
    const eph = makeStubEphemeris((et, naifId) => {
      if (naifId === 5) return worldVec3(0, 0, 0); // Jupiter at origin
      if (naifId === -31) {
        // V1 closes in along +X axis
        return et < 10 ? worldVec3(2 * rJ, 0, 0) : worldVec3(0.5 * rJ, 0, 0);
      }
      return worldVec3(1e15, 0, 0); // V2 and others — way outside
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    fsm.update(0); // seed — no events
    expect(events).toEqual([]);
    fsm.update(10); // crossing fires
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({
      type: 'soiEntered',
      spacecraft: -31,
      bodyId: 5,
      et: 10,
    });
  });

  it('fires soiExited symmetrically on reverse scrub', () => {
    const rJ = SOI_RADII_KM[5];
    // Time-varying V1 position:
    //   t=0   : 2 * R outside
    //   t=10  : 0.5 * R inside
    //   t=20  : 2 * R outside again
    const eph = makeStubEphemeris((et, naifId) => {
      if (naifId === 5) return worldVec3(0, 0, 0);
      if (naifId === -31) {
        if (et < 10) return worldVec3(2 * rJ, 0, 0);
        if (et < 20) return worldVec3(0.5 * rJ, 0, 0);
        return worldVec3(2 * rJ, 0, 0);
      }
      return worldVec3(1e15, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    fsm.update(0); // seed
    fsm.update(10); // entered
    fsm.update(20); // exited
    const types = events.map((e) => e.type);
    expect(types).toEqual(['soiEntered', 'soiExited']);
    expect(events[1]).toMatchObject({
      type: 'soiExited',
      spacecraft: -31,
      bodyId: 5,
    });
  });

  it('does NOT double-fire on consecutive update(et) calls with the same et', () => {
    const rJ = SOI_RADII_KM[5];
    const eph = makeStubEphemeris((et, naifId) => {
      if (naifId === 5) return worldVec3(0, 0, 0);
      if (naifId === -31) {
        return et < 10 ? worldVec3(2 * rJ, 0, 0) : worldVec3(0.5 * rJ, 0, 0);
      }
      return worldVec3(1e15, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    fsm.update(0);
    fsm.update(10);
    fsm.update(10); // duplicate — no second event
    fsm.update(10);
    const entered = events.filter((e) => e.type === 'soiEntered');
    expect(entered.length).toBe(1);
  });

  it('skips a (sc, gg) pair quietly when EphemerisService returns null (chunk missing)', () => {
    // V1 position null (chunk missing) — no events for V1.
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31) return null;
      if (naifId === 5) return worldVec3(0, 0, 0);
      return worldVec3(1e15, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    fsm.update(0);
    fsm.update(100);
    // No V1 events; V2 stays 'outside' so no events from it either.
    expect(events).toEqual([]);
    expect(fsm.getSoiState(-31, 5)).toBe('unknown');
  });
});

// === Instrument-shutoff tests ========================================

describe('MissionPhaseFSM — instrument shutoffs', () => {
  it('fires instrumentShutoff exactly once when et crosses a shutoff date', () => {
    // Spacecraft FAR from every gas giant (gas giants near origin).
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    const issV1ShutoffEt = getShutoffEt('V1', 'ISS');
    // First update seeds previous — historical events DO NOT fire here.
    fsm.update(issV1ShutoffEt - 1000);
    expect(events).toEqual([]);
    // Scrub past the V1 ISS shutoff date.
    fsm.update(issV1ShutoffEt + 1000);
    const shutoffEvents = events.filter((e) => e.type === 'instrumentShutoff');
    expect(shutoffEvents.length).toBe(1);
    expect(shutoffEvents[0]).toMatchObject({
      type: 'instrumentShutoff',
      spacecraft: 'V1',
      instrument: 'ISS',
      et: issV1ShutoffEt,
    });
  });

  it('does NOT fire historical shutoffs on the FIRST update (cold-load)', () => {
    // Spacecraft FAR from every gas giant (gas giants near origin).
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    // Cold-load into 2026 — every Voyager instrument shutoff is already
    // historical. The FSM must not re-fire all 8 of them.
    fsm.update(getShutoffEt('V2', 'PLS') + 1e7);
    const shutoffEvents = events.filter((e) => e.type === 'instrumentShutoff');
    expect(shutoffEvents).toEqual([]);
  });

  it('fires reverse-scrub events in reverse-chronological order', () => {
    // Spacecraft FAR from every gas giant (gas giants near origin).
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    // Seed at a future ET well past every shutoff.
    fsm.update(2e9);
    // Reverse-scrub to the past — every shutoff crosses again, in reverse.
    fsm.update(0);
    const shutoffEvents = events.filter(
      (e): e is Extract<MissionPhaseEvent, { type: 'instrumentShutoff' }> =>
        e.type === 'instrumentShutoff',
    );
    expect(shutoffEvents.length).toBeGreaterThan(0);
    for (let i = 1; i < shutoffEvents.length; i++) {
      expect(shutoffEvents[i].et).toBeLessThanOrEqual(
        shutoffEvents[i - 1].et,
      );
    }
  });

  it('forward scrub fires shutoffs in chronological order', () => {
    // Spacecraft FAR from every gas giant (gas giants near origin).
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    // Seed at mission start (before any shutoff).
    fsm.update(0);
    // Forward-scrub past every shutoff.
    fsm.update(2e9);
    const shutoffEvents = events.filter(
      (e): e is Extract<MissionPhaseEvent, { type: 'instrumentShutoff' }> =>
        e.type === 'instrumentShutoff',
    );
    expect(shutoffEvents.length).toBeGreaterThan(0);
    for (let i = 1; i < shutoffEvents.length; i++) {
      expect(shutoffEvents[i].et).toBeGreaterThanOrEqual(
        shutoffEvents[i - 1].et,
      );
    }
  });
});

// === Subscriber contract =============================================

describe('MissionPhaseFSM — subscriber contract', () => {
  it('a throwing subscriber does not silence other subscribers', () => {
    // Spacecraft FAR from every gas giant (gas giants near origin).
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const calls: string[] = [];
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    fsm.subscribe(() => {
      calls.push('throwing');
      throw new Error('boom');
    });
    fsm.subscribe(() => {
      calls.push('good');
    });

    fsm.update(0); // seed — no events fire even if subscribers exist
    expect(calls).toEqual([]);
    // Force a shutoff event.
    const issV1 = getShutoffEt('V1', 'ISS');
    fsm.update(issV1 - 1);
    fsm.update(issV1 + 1);
    expect(calls).toContain('good');
    expect(calls).toContain('throwing');
    consoleErr.mockRestore();
  });

  it('unsubscribe stops further notifications', () => {
    // Spacecraft FAR from every gas giant (gas giants near origin).
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    const unsub = fsm.subscribe((e) => events.push(e));
    fsm.update(0); // seed
    const issV1 = getShutoffEt('V1', 'ISS');
    unsub();
    fsm.update(issV1 + 1000);
    expect(events).toEqual([]);
  });

  it('dispose detaches all subscribers', () => {
    // Spacecraft FAR from every gas giant (gas giants near origin).
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));
    fsm.subscribe((e) => events.push(e));
    fsm.update(0);
    fsm.dispose();
    fsm.update(getShutoffEt('V1', 'ISS') + 1000);
    expect(events).toEqual([]);
  });

  it('ignores non-finite et values', () => {
    // Spacecraft FAR from every gas giant (gas giants near origin).
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));
    fsm.update(NaN);
    fsm.update(Infinity);
    fsm.update(-Infinity);
    expect(events).toEqual([]);
  });
});

// === SOI radii sanity ================================================

describe('MissionPhaseFSM — SOI radii constants', () => {
  it('Neptune SOI is largest (most distant from Sun → largest Hill sphere)', () => {
    expect(SOI_RADII_KM[8]).toBeGreaterThan(SOI_RADII_KM[5]);
    expect(SOI_RADII_KM[8]).toBeGreaterThan(SOI_RADII_KM[6]);
    expect(SOI_RADII_KM[8]).toBeGreaterThan(SOI_RADII_KM[7]);
  });

  it('all gas-giant SOI radii are sub-AU (well inside the inner solar system)', () => {
    const ONE_AU_KM = 1.496e8;
    for (const r of Object.values(SOI_RADII_KM)) {
      expect(r).toBeLessThan(ONE_AU_KM);
      expect(r).toBeGreaterThan(1e7); // tens of millions of km
    }
  });
});
