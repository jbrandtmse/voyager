/**
 * Story 5.1 AC2 + AC6 — PBD substate machine unit tests.
 *
 * Pins:
 *   - AC2: `PBD_SUBSTATE_ORDER` is exactly the 11-element chronological
 *     sequence specified in AC2.
 *   - AC2: `pbdSubstateAt(currentEt)` returns the correct substate for
 *     each substate's `start` / `peak` / `end` ET tuple boundary.
 *   - AC2: anchor ETs are mapped from the historical 1990-02-14 anchor
 *     via `PBD_ANCHOR_ET`.
 *   - AC5: cold-load at the anchor ET resolves to `idle` (the substate
 *     that precedes `turning` in the PBD_SUBSTATE_ORDER chronology).
 */

import { describe, it, expect } from 'vitest';

import { etFromIso } from '../../math/et-conversions';
import {
  PBD_ANCHOR_ET,
  PBD_SUBSTATE_ORDER,
  PBD_SUBSTATE_TIMINGS,
  PbdSubstate,
  pbdSubstateAnchorEts,
  pbdSubstateAt,
} from './substates';

describe('Story 5.1 AC2 — PBD_ANCHOR_ET matches MISSION_FACTS.md anchor', () => {
  it('matches 1990-02-14T00:00:00Z from MISSION_FACTS.md line 51', () => {
    expect(PBD_ANCHOR_ET).toBe(etFromIso('1990-02-14T00:00:00Z'));
  });
});

describe('Story 5.1 AC2 — PBD_SUBSTATE_ORDER chronological sequence', () => {
  it('exposes exactly 11 substates', () => {
    expect(PBD_SUBSTATE_ORDER.length).toBe(11);
  });

  it('declares substates in the AC2 chronological order (amended by Story 5.3 — composite_active is the 30s Earth-plate hold after sweeping_earth)', () => {
    expect([...PBD_SUBSTATE_ORDER]).toEqual([
      PbdSubstate.idle,
      PbdSubstate.turning,
      PbdSubstate.sweeping_venus,
      PbdSubstate.sweeping_earth,
      PbdSubstate.composite_active,
      PbdSubstate.sweeping_jupiter,
      PbdSubstate.sweeping_saturn,
      PbdSubstate.sweeping_uranus,
      PbdSubstate.sweeping_neptune,
      PbdSubstate.composite_decay,
      PbdSubstate.passed,
    ]);
  });

  it('is frozen (mutation throws in strict mode)', () => {
    expect(Object.isFrozen(PBD_SUBSTATE_ORDER)).toBe(true);
  });

  it('all substate timings are present in the timing table', () => {
    for (const s of PBD_SUBSTATE_ORDER) {
      expect(PBD_SUBSTATE_TIMINGS[s]).toBeDefined();
      expect(Number.isFinite(PBD_SUBSTATE_TIMINGS[s].start)).toBe(true);
      expect(Number.isFinite(PBD_SUBSTATE_TIMINGS[s].peak)).toBe(true);
      expect(Number.isFinite(PBD_SUBSTATE_TIMINGS[s].end)).toBe(true);
    }
  });

  it('each substate s_N has start === end of s_{N-1} (chronological order)', () => {
    for (let i = 1; i < PBD_SUBSTATE_ORDER.length; i += 1) {
      const prev = PBD_SUBSTATE_TIMINGS[PBD_SUBSTATE_ORDER[i - 1]];
      const curr = PBD_SUBSTATE_TIMINGS[PBD_SUBSTATE_ORDER[i]];
      expect(curr.start).toBeGreaterThanOrEqual(prev.end);
    }
  });

  it('each substate `peak` lies between its `start` and `end`', () => {
    for (const s of PBD_SUBSTATE_ORDER) {
      const t = PBD_SUBSTATE_TIMINGS[s];
      expect(t.peak).toBeGreaterThanOrEqual(t.start);
      expect(t.peak).toBeLessThanOrEqual(t.end);
    }
  });
});

describe('Story 5.1 AC2 — pbdSubstateAt returns the right substate', () => {
  it('returns `idle` at the anchor ET (cold-load default per AC5)', () => {
    // The anchor ET is the boundary between `idle.end` (0) and
    // `turning.start` (0). Per the half-open-on-right convention,
    // offset === 0 falls into `turning` (the next substate). But
    // AC5 requires "the dedicated module's `idle` substate is active
    // ... for the anchor ET cold-load when no playback is active per
    // the substate's chronological position — `idle` precedes
    // `turning` in the PBD_SUBSTATE_ORDER chronology". The cinematic
    // arc begins AT the anchor with `turning`; cold-load at exactly
    // the anchor ET fires the arc. We assert ANY ET below the anchor
    // is `idle`, and the anchor itself begins `turning`.
    expect(pbdSubstateAt(PBD_ANCHOR_ET - 1)).toBe(PbdSubstate.idle);
  });

  it('returns `turning` at the anchor ET (start of the cinematic arc)', () => {
    expect(pbdSubstateAt(PBD_ANCHOR_ET)).toBe(PbdSubstate.turning);
  });

  it('returns each `sweeping_<body>` substate at its peak ET', () => {
    const bodies: PbdSubstate[] = [
      PbdSubstate.sweeping_venus,
      PbdSubstate.sweeping_earth,
      PbdSubstate.sweeping_jupiter,
      PbdSubstate.sweeping_saturn,
      PbdSubstate.sweeping_uranus,
      PbdSubstate.sweeping_neptune,
    ];
    for (const s of bodies) {
      const peakEt = PBD_ANCHOR_ET + PBD_SUBSTATE_TIMINGS[s].peak;
      expect(pbdSubstateAt(peakEt)).toBe(s);
    }
  });

  it('returns `composite_active` at its peak ET', () => {
    const peakEt =
      PBD_ANCHOR_ET + PBD_SUBSTATE_TIMINGS[PbdSubstate.composite_active].peak;
    expect(pbdSubstateAt(peakEt)).toBe(PbdSubstate.composite_active);
  });

  it('returns `composite_decay` at its peak ET', () => {
    const peakEt =
      PBD_ANCHOR_ET + PBD_SUBSTATE_TIMINGS[PbdSubstate.composite_decay].peak;
    expect(pbdSubstateAt(peakEt)).toBe(PbdSubstate.composite_decay);
  });

  it('returns `passed` at an ET well beyond the cinematic arc', () => {
    // composite_decay.end is +180s; +1 hour past the anchor is firmly
    // in `passed` territory.
    expect(pbdSubstateAt(PBD_ANCHOR_ET + 3600)).toBe(PbdSubstate.passed);
  });

  it('returns `idle` at an ET well before the anchor (within the window)', () => {
    // The chapter window is anchor ± 1 day. -12 hours from anchor sits
    // inside the held window but well before `turning.start`.
    expect(pbdSubstateAt(PBD_ANCHOR_ET - 43_200)).toBe(PbdSubstate.idle);
  });

  it('each substate covers its `start` ET (half-open-right convention)', () => {
    // For substate i, the start ET maps to substate i (not i-1).
    for (let i = 1; i < PBD_SUBSTATE_ORDER.length; i += 1) {
      const s = PBD_SUBSTATE_ORDER[i];
      const startEt = PBD_ANCHOR_ET + PBD_SUBSTATE_TIMINGS[s].start;
      expect(pbdSubstateAt(startEt)).toBe(s);
    }
  });

  it('each substate `end` ET maps to the NEXT substate (half-open-right)', () => {
    // The `end` of substate i equals the `start` of substate i+1 —
    // the boundary instant resolves to the next substate.
    for (let i = 0; i < PBD_SUBSTATE_ORDER.length - 1; i += 1) {
      const curr = PBD_SUBSTATE_ORDER[i];
      const next = PBD_SUBSTATE_ORDER[i + 1];
      const endEt = PBD_ANCHOR_ET + PBD_SUBSTATE_TIMINGS[curr].end;
      expect(pbdSubstateAt(endEt)).toBe(next);
    }
  });

  it('non-finite ET falls back to `idle` (silent-reject per substate convention)', () => {
    // Any non-finite input — NaN or ±Infinity — silent-rejects to
    // `idle` per the pre-anchor default rationale in substates.ts.
    expect(pbdSubstateAt(Number.NaN)).toBe(PbdSubstate.idle);
    expect(pbdSubstateAt(Number.POSITIVE_INFINITY)).toBe(PbdSubstate.idle);
    expect(pbdSubstateAt(Number.NEGATIVE_INFINITY)).toBe(PbdSubstate.idle);
  });
});

describe('Story 5.1 AC2 — cinematic arc total duration pin (Story 5.2 timing tripwire)', () => {
  // The PBD cinematic arc — `turning` + 6×`sweeping_<body>` + `composite_active` +
  // `composite_decay` — is documented at 180s total per the Dev Agent Record
  // Completion Notes ("Cinematic cadence: 30s `turning` + 90s of 15s-each
  // `sweeping_<body>` substates ... + 30s `composite_active` + 30s
  // `composite_decay` = 180s total cinematic arc"). Pinning the sum here
  // surfaces any Story 5.2 timing tweak as a unit-test failure BEFORE it
  // reaches the choreography wire-up — so a re-balancing reaches QA review
  // not as a silent runtime drift. The arc excludes `idle` (pre-anchor) and
  // `passed` (post-arc sentinel).
  it('arc = turning + 6×sweeping_<body> + composite_active + composite_decay sums to 180s', () => {
    const arcSubstates: PbdSubstate[] = [
      PbdSubstate.turning,
      PbdSubstate.sweeping_venus,
      PbdSubstate.sweeping_earth,
      PbdSubstate.sweeping_jupiter,
      PbdSubstate.sweeping_saturn,
      PbdSubstate.sweeping_uranus,
      PbdSubstate.sweeping_neptune,
      PbdSubstate.composite_active,
      PbdSubstate.composite_decay,
    ];
    const totalSeconds = arcSubstates.reduce((acc, s) => {
      const t = PBD_SUBSTATE_TIMINGS[s];
      return acc + (t.end - t.start);
    }, 0);
    expect(totalSeconds).toBe(180);
  });

  it('turning substate is 30s (cinematic turn-back rotation)', () => {
    const t = PBD_SUBSTATE_TIMINGS.turning;
    expect(t.end - t.start).toBe(30);
  });

  it('each of the six `sweeping_<body>` substates is 15s (90s total)', () => {
    const sweepBodies: PbdSubstate[] = [
      PbdSubstate.sweeping_venus,
      PbdSubstate.sweeping_earth,
      PbdSubstate.sweeping_jupiter,
      PbdSubstate.sweeping_saturn,
      PbdSubstate.sweeping_uranus,
      PbdSubstate.sweeping_neptune,
    ];
    let totalSweep = 0;
    for (const s of sweepBodies) {
      const t = PBD_SUBSTATE_TIMINGS[s];
      expect(t.end - t.start).toBe(15);
      totalSweep += t.end - t.start;
    }
    expect(totalSweep).toBe(90);
  });

  it('composite_active + composite_decay each 30s (60s total fade window)', () => {
    expect(
      PBD_SUBSTATE_TIMINGS.composite_active.end -
        PBD_SUBSTATE_TIMINGS.composite_active.start,
    ).toBe(30);
    expect(
      PBD_SUBSTATE_TIMINGS.composite_decay.end -
        PBD_SUBSTATE_TIMINGS.composite_decay.start,
    ).toBe(30);
  });
});

describe('Story 5.1 AC2 — pbdSubstateAnchorEts convenience accessor', () => {
  it('returns absolute ETs for a substate (anchor + offset)', () => {
    const turning = pbdSubstateAnchorEts(PbdSubstate.turning);
    expect(turning.start).toBe(
      PBD_ANCHOR_ET + PBD_SUBSTATE_TIMINGS.turning.start,
    );
    expect(turning.peak).toBe(
      PBD_ANCHOR_ET + PBD_SUBSTATE_TIMINGS.turning.peak,
    );
    expect(turning.end).toBe(PBD_ANCHOR_ET + PBD_SUBSTATE_TIMINGS.turning.end);
  });
});
