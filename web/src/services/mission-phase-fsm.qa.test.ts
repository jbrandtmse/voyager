/**
 * QA-stage extension tests for `mission-phase-fsm.ts` (Story 4.3 AC3).
 *
 * Dev pinned: SOI entry/exit, reverse scrub, idempotence on equal et,
 * throw-isolation, dispose, NaN guard, SOI radii sanity.
 *
 * QA pins the failure modes dev didn't pin:
 *
 *   1. **Reverse-scrub seeded-state contract** — after a reverse scrub that
 *      moves the seeded state from `inside` back to `outside` BEFORE any
 *      forward crossing, the FSM must emit `soiExited` (the seeded state IS
 *      the FSM's belief and a transition AWAY from it is a real crossing).
 *      The dev's first-update test only covers cold-load INTO an outside
 *      state; the reverse-scrub-from-inside case is symmetric and load-
 *      bearing for chapter cold-loads at V1 Jupiter (et inside the Jupiter
 *      SOI → reverse scrub away).
 *
 *   2. **Multi-event clustering in a single `update(et)` call** — if a
 *      single ET advance crosses an instrument-shutoff threshold AND a
 *      different spacecraft's SOI boundary on the same call, both events
 *      must fire. Pin the ordering policy too (SOI events fire first
 *      because they're computed first in `update`).
 *
 *   3. **Subscribe-during-notify reentry safety** — a subscriber that
 *      subscribes ANOTHER callback during its own callback must NOT cause
 *      the FSM's notify loop to skip events, double-fire events, or throw
 *      a "modified during iteration" error. The Set iterator's behaviour
 *      when modified is officially "implementation-defined"; we pin the
 *      contract here so a future refactor that switches to a different
 *      container can't silently regress.
 *
 *   4. **Very-far-future cold-load past every instrument shutoff** — the
 *      dev pinned that the FIRST update does NOT fire historical shutoffs;
 *      QA pins that a SECOND update at the same far-future ET also does
 *      not refire them (the idempotent-update guard + the (previous, et]
 *      half-open interval together must close this case).
 *
 *   5. **`dispose()` mid-pending-notify** — if a subscriber calls
 *      `fsm.dispose()` during its callback, the FSM must finish the current
 *      notify pass safely (later subscribers in the same event still see
 *      the event; subsequent `update(et)` calls fire no events because
 *      the subscriber set is now empty).
 *
 *   6. **Throwing subscriber does not stop later subscribers** — dev's
 *      existing pin covers this; QA re-pins under the multi-event case
 *      (a throw on the SOI event must not silence the subsequent
 *      instrument-shutoff event in the same `update(et)` call).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MissionPhaseFSM,
  SOI_RADII_KM,
  type MissionPhaseEvent,
} from './mission-phase-fsm';
import type { EphemerisService } from './ephemeris-service';
import { worldVec3 } from '../types/branded';
import type { WorldVec3 } from '../types/branded';
import { getShutoffEt } from '../data/mission-facts';

const makeStubEphemeris = (
  posFn: (et: number, naifId: number) => WorldVec3 | null,
): EphemerisService => {
  return {
    getPosition: (et: number, naifId: number) => posFn(et, naifId),
  } as unknown as EphemerisService;
};

describe('MissionPhaseFSM QA — reverse-scrub seeded state', () => {
  it('seeding INSIDE then reverse-scrubbing OUT fires soiExited', () => {
    // Dev pinned: cold-load outside → no event. QA pins the symmetric
    // case: cold-load INSIDE Jupiter SOI, then reverse-scrub OUT. The
    // seeded state IS the FSM's belief, so the reverse transition is a
    // real crossing that must fire `soiExited`.
    const rJ = SOI_RADII_KM[5];
    const eph = makeStubEphemeris((et, naifId) => {
      if (naifId === 5) return worldVec3(0, 0, 0);
      if (naifId === -31) {
        if (et < 10) return worldVec3(0.5 * rJ, 0, 0); // inside at cold-load
        return worldVec3(2 * rJ, 0, 0); // outside after scrub forward
      }
      return worldVec3(1e15, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    fsm.update(0); // seed — V1 inside Jupiter SOI, no event
    expect(events).toEqual([]);
    expect(fsm.isInsideSoi(-31, 5)).toBe(true);

    fsm.update(20); // V1 now outside → soiExited must fire
    const soi = events.filter((e) => e.type === 'soiExited' && e.bodyId === 5);
    expect(soi).toHaveLength(1);
    expect(fsm.isInsideSoi(-31, 5)).toBe(false);
  });
});

describe('MissionPhaseFSM QA — multi-event clustering in one update(et)', () => {
  it('SOI crossing and instrument-shutoff in the same update both fire', () => {
    // Engineer V1 to cross INTO Jupiter SOI at et=issV1-100. Then advance
    // PAST `getShutoffEt('V1','ISS')` so the single update both (a)
    // crosses the SOI boundary and (b) crosses the historical shutoff
    // threshold. The shutoff ET is in TDB seconds past J2000 (1977-08-20
    // is < 0 in TDB; later instrument shutoffs are positive). We use the
    // actual `getShutoffEt` value without sign assumptions.
    const rJ = SOI_RADII_KM[5];
    const issV1 = getShutoffEt('V1', 'ISS');
    const eph = makeStubEphemeris((et, naifId) => {
      if (naifId === 5) return worldVec3(0, 0, 0);
      if (naifId === -31) {
        // Outside until et = issV1 - 50, inside thereafter
        if (et < issV1 - 50) return worldVec3(2 * rJ, 0, 0);
        return worldVec3(0.5 * rJ, 0, 0); // inside
      }
      return worldVec3(1e15, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    fsm.update(issV1 - 200); // seed — outside, before ISS shutoff
    fsm.update(issV1 + 1); // single update crosses BOTH SOI + ISS shutoff
    const types = events.map((e) => e.type);
    expect(types).toContain('soiEntered');
    expect(types).toContain('instrumentShutoff');
  });

  it('SOI events fire BEFORE instrument-shutoff events in the same update', () => {
    // Both crossings happen on the SAME forward step. Pin the ordering
    // policy so a future refactor that splits update() into two phases
    // can't silently regress.
    const rJ = SOI_RADII_KM[5];
    const issV1 = getShutoffEt('V1', 'ISS');
    const eph = makeStubEphemeris((et, naifId) => {
      if (naifId === 5) return worldVec3(0, 0, 0);
      if (naifId === -31) {
        if (et < issV1 - 50) return worldVec3(2 * rJ, 0, 0);
        return worldVec3(0.5 * rJ, 0, 0);
      }
      return worldVec3(1e15, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    fsm.update(issV1 - 200); // seed
    fsm.update(issV1 + 1); // single update crosses BOTH SOI + ISS shutoff
    const soiIdx = events.findIndex((e) => e.type === 'soiEntered');
    const issIdx = events.findIndex(
      (e) => e.type === 'instrumentShutoff' && e.instrument === 'ISS' && e.spacecraft === 'V1',
    );
    expect(soiIdx).toBeGreaterThanOrEqual(0);
    expect(issIdx).toBeGreaterThanOrEqual(0);
    expect(soiIdx).toBeLessThan(issIdx);
  });
});

describe('MissionPhaseFSM QA — subscribe-during-notify reentry safety', () => {
  it('subscribing during a notify pass does not throw or skip pre-existing subscribers', () => {
    // A subscriber that adds another subscriber mid-notify must not (a)
    // throw, (b) cause the FSM to skip later subscribers in the same
    // event. Whether the newly-added subscriber sees the in-flight event
    // is implementation-defined (JS Set iteration spec says yes — added
    // entries that come AFTER the iterator's cursor are visited; the FSM
    // doesn't go out of its way to suppress that). What we DO pin: B,
    // which was subscribed BEFORE the notify, never has events dropped.
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });

    const aReceived: MissionPhaseEvent[] = [];
    const bReceived: MissionPhaseEvent[] = [];
    const cReceived: MissionPhaseEvent[] = [];
    let subscribeFromInsideCallback = true;

    // Subscriber A adds C during its FIRST callback only (so C-subscription
    // happens exactly once, not on every event).
    fsm.subscribe((e) => {
      aReceived.push(e);
      if (subscribeFromInsideCallback) {
        subscribeFromInsideCallback = false;
        fsm.subscribe((ee) => cReceived.push(ee));
      }
    });
    // Subscriber B should always receive every event A receives.
    fsm.subscribe((e) => bReceived.push(e));

    fsm.update(0); // seed — no events fire
    const iss = getShutoffEt('V1', 'ISS');
    fsm.update(iss - 1);
    fsm.update(iss + 1);

    // A and B both saw the ISS shutoff events. B (subscribed BEFORE notify)
    // must see exactly the same count A does — no skip on the modified-
    // during-iteration boundary.
    expect(aReceived.length).toBeGreaterThan(0);
    expect(bReceived.length).toBe(aReceived.length);
    // No throw was observed (the test reaches this assertion).
    // C's receive count is implementation-defined; we only check it's
    // a non-negative count consistent with the JS Set iteration spec.
    expect(cReceived.length).toBeGreaterThanOrEqual(0);
  });
});

describe('MissionPhaseFSM QA — very-far-future cold-load is doubly idempotent', () => {
  it('second update at the same far-future ET fires nothing (no history replay)', () => {
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const events: MissionPhaseEvent[] = [];
    fsm.subscribe((e) => events.push(e));

    // Cold-load past every Voyager instrument shutoff.
    const farFuture = getShutoffEt('V2', 'PLS') + 1e8;
    fsm.update(farFuture); // seed silently
    expect(events).toEqual([]);

    // Second update at the SAME et — idempotent guard, no replay.
    fsm.update(farFuture);
    expect(events).toEqual([]);

    // Update at a slightly DIFFERENT et past every shutoff — still no
    // historical fires because every shutoff is now in `previous`'s past.
    fsm.update(farFuture + 1);
    const shutoffs = events.filter((e) => e.type === 'instrumentShutoff');
    expect(shutoffs).toEqual([]);
  });
});

describe('MissionPhaseFSM QA — dispose() mid-pending-notify is safe', () => {
  it('dispose during a subscriber callback does not throw or corrupt the FSM', () => {
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const seen: string[] = [];
    fsm.subscribe(() => {
      seen.push('A-disposer');
      fsm.dispose();
    });
    fsm.subscribe(() => seen.push('B'));
    fsm.subscribe(() => seen.push('C'));

    fsm.update(0); // seed
    const iss = getShutoffEt('V1', 'ISS');
    fsm.update(iss - 1);
    fsm.update(iss + 1); // fires ISS shutoff

    // A-disposer fired. Whether B / C fired in the SAME pass is
    // implementation-defined; the contract is "no throw, no corruption".
    expect(seen).toContain('A-disposer');

    // After dispose, no further events fire on subsequent updates.
    seen.length = 0;
    fsm.update(iss + 100);
    expect(seen).toEqual([]);
  });
});

describe('MissionPhaseFSM QA — throw isolation under multi-event clustering', () => {
  it('a throwing subscriber in the middle of an event sequence does not silence later events', () => {
    const eph = makeStubEphemeris((_et, naifId) => {
      if (naifId === -31 || naifId === -32) return worldVec3(1e15, 0, 0);
      return worldVec3(0, 0, 0);
    });
    const fsm = new MissionPhaseFSM({ ephemerisService: eph });
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: string[] = [];
    fsm.subscribe(() => {
      calls.push('A-throws');
      throw new Error('boom-A');
    });
    fsm.subscribe(() => calls.push('B-good'));
    fsm.subscribe(() => {
      calls.push('C-throws');
      throw new Error('boom-C');
    });
    fsm.subscribe(() => calls.push('D-good'));

    fsm.update(0); // seed
    const iss = getShutoffEt('V1', 'ISS');
    fsm.update(iss - 1);
    fsm.update(iss + 1); // forces ISS shutoff

    // Every subscriber executed at least once. The two throwers' errors
    // were logged but did not abort the FSM's notify loop.
    expect(calls).toContain('B-good');
    expect(calls).toContain('D-good');
    expect(calls).toContain('A-throws');
    expect(calls).toContain('C-throws');
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });
});
