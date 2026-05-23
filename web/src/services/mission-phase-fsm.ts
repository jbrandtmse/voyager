/**
 * MissionPhaseFSM — per-frame mission-phase state machine (Story 4.3 AC3).
 *
 * Tracks two classes of state crossings as the simulation ET advances:
 *
 *   1. **Spacecraft↔gas-giant SOI entry/exit** — for each of the four gas
 *      giants (Jupiter, Saturn, Uranus, Neptune), the FSM watches each
 *      spacecraft's distance to the gas giant against the gas giant's
 *      sphere-of-influence radius. Crossings INTO the SOI fire
 *      `soiEntered({bodyId, spacecraft, et})`; crossings OUT fire
 *      `soiExited(...)`. Symmetric on reverse scrub.
 *
 *   2. **Instrument-shutoff schedule** — at each historical instrument-
 *      shutoff date (Story 2.9's `INSTRUMENT_SHUTOFF_DATES`), the FSM
 *      fires `instrumentShutoff({instrument, spacecraft, et})`. The
 *      FSM is the canonical source for this event; Story 2.9's HUD now
 *      becomes a downstream consumer.
 *
 * ## Architecture role (AR13)
 *
 * MissionPhaseFSM is intentionally SEPARATE from ChapterDirector
 * (Story 2.1). ChapterDirector owns the editorial chapter lifecycle
 * (driven by a chapter spec registry); MissionPhaseFSM owns the
 * historically-grounded mission phase events (SOI, instrument shutoff)
 * — events that have nothing to do with whether a chapter is currently
 * `held`. The two FSMs run in parallel and may fire interleaved events;
 * downstream consumers subscribe to whichever they need.
 *
 * ## Subscriber contract (mirrors ChapterDirector — Story 2.1 AC5)
 *
 * - Subscribers fire ONLY on state transitions, NEVER per frame.
 * - Two consecutive `update(et)` calls with the SAME et are idempotent
 *   (no transitions fire on the second).
 * - A throwing subscriber is logged and swallowed (Story 2.0 chunk-
 *   loader notify-hardening pattern).
 * - Forward scrub fires events in chronological order; reverse scrub
 *   fires them in reverse-chronological order.
 *
 * ## SOI radii
 *
 * The sphere-of-influence radius of a body B orbiting a primary P is
 * approximately `r_SOI ≈ a_B × (m_B / m_P)^(2/5)` (Laplace's two-body
 * approximation). The values below mirror standard astrodynamics
 * references — see Curtis, *Orbital Mechanics for Engineering Students*
 * (3rd ed., 2014, Table A.2) and JPL solar-system fact sheets
 * (`https://nssdc.gsfc.nasa.gov/planetary/factsheet/`). They are
 * deliberately rounded — a sub-percent error on the SOI radius shifts
 * the event ET by hours at gas-giant scrub velocities, which is well
 * inside the "feels like the right time to upgrade the texture"
 * tolerance the FSM serves.
 */

import type { EphemerisService } from './ephemeris-service';
import {
  INSTRUMENTS_IN_ORDER,
  SPACECRAFT_IN_ORDER,
  getShutoffEt,
  type Instrument,
  type SpacecraftId,
} from '../data/mission-facts';

/**
 * Gas-giant NAIF SPK barycenter IDs the FSM watches for SOI crossings.
 * Encoded as the literal IDs so the type narrows for switch statements.
 */
export type GasGiantNaifId = 5 | 6 | 7 | 8;

/** Voyager spacecraft NAIF SPK IDs the FSM tracks per-spacecraft. */
export type SpacecraftNaifId = -31 | -32;

export const GAS_GIANT_NAIF_IDS: readonly GasGiantNaifId[] = Object.freeze([
  5, 6, 7, 8,
]);

export const SPACECRAFT_NAIF_IDS: readonly SpacecraftNaifId[] = Object.freeze([
  -31, -32,
]);

/**
 * Sphere-of-influence radii in kilometres, keyed by NAIF SPK
 * barycenter ID. The values come from Curtis 2014 Table A.2 and
 * JPL fact sheets (cited in the module docstring). Treat as data,
 * not magic numbers — `MISSION_FACTS.md` carries the same citation.
 *
 * Jupiter   (NAIF 5):  4.82e7 km  (~0.322 AU)
 * Saturn    (NAIF 6):  5.48e7 km  (~0.366 AU)
 * Uranus    (NAIF 7):  5.18e7 km  (~0.346 AU)
 * Neptune   (NAIF 8):  8.66e7 km  (~0.579 AU)
 */
export const SOI_RADII_KM: Readonly<Record<GasGiantNaifId, number>> = Object.freeze({
  5: 4.82e7, // Jupiter
  6: 5.48e7, // Saturn
  7: 5.18e7, // Uranus
  8: 8.66e7, // Neptune
});

/** Per-event type emitted by the FSM. */
export type MissionPhaseEvent =
  | {
      readonly type: 'soiEntered';
      readonly spacecraft: SpacecraftNaifId;
      readonly bodyId: GasGiantNaifId;
      readonly et: number;
    }
  | {
      readonly type: 'soiExited';
      readonly spacecraft: SpacecraftNaifId;
      readonly bodyId: GasGiantNaifId;
      readonly et: number;
    }
  | {
      readonly type: 'instrumentShutoff';
      readonly spacecraft: SpacecraftId;
      readonly instrument: Instrument;
      readonly et: number;
    };

type Subscriber = (event: MissionPhaseEvent) => void;

/** Internal SOI state per (spacecraft, gas giant) pair. */
type SoiState = 'inside' | 'outside' | 'unknown';

/** Compute squared 3-D distance between two world positions. */
const distSq = (
  a: ReadonlyArray<number> | Float64Array,
  b: ReadonlyArray<number> | Float64Array,
): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};

export class MissionPhaseFSM {
  private readonly ephemeris: EphemerisService;
  private readonly subscribers = new Set<Subscriber>();
  // SOI tracking: per (spacecraft, gas-giant) state.
  // Key is `${spacecraftNaif}:${gasGiantNaif}`.
  private readonly soiStates = new Map<string, SoiState>();
  private lastEt: number | null = null;

  constructor(deps: { ephemerisService: EphemerisService }) {
    this.ephemeris = deps.ephemerisService;
    for (const sc of SPACECRAFT_NAIF_IDS) {
      for (const gg of GAS_GIANT_NAIF_IDS) {
        this.soiStates.set(`${sc}:${gg}`, 'unknown');
      }
    }
  }

  /**
   * Per-frame advance. Pull spacecraft + gas-giant positions from the
   * EphemerisService at `et`, compare against each SOI radius, and emit
   * any state-crossing events. Also emits instrument-shutoff events for
   * any threshold crossed between the previous `et` and this `et`.
   *
   * Idempotent on consecutive equal `et` values (mirrors Story 2.1's
   * ChapterDirector contract).
   */
  update(et: number): void {
    if (!Number.isFinite(et)) return;
    if (this.lastEt === et) return;

    const previous = this.lastEt;
    this.lastEt = et;

    // ----- SOI crossings -------------------------------------------------
    // Compute distance per (spacecraft, gas-giant); compare against radius.
    // If the chunk for either body hasn't loaded yet, EphemerisService
    // returns null — we skip that pair this frame (no transition fires).
    // The first frame where both chunks resolve seeds the state to
    // inside/outside; subsequent frames detect crossings.
    for (const sc of SPACECRAFT_NAIF_IDS) {
      const scPos = this.ephemeris.getPosition(et, sc);
      if (scPos === null) continue;
      for (const gg of GAS_GIANT_NAIF_IDS) {
        const ggPos = this.ephemeris.getPosition(et, gg);
        if (ggPos === null) continue;
        const r2 = distSq(scPos, ggPos);
        const radius = SOI_RADII_KM[gg];
        const radius2 = radius * radius;
        const key = `${sc}:${gg}`;
        const prev = this.soiStates.get(key) ?? 'unknown';
        const current: SoiState = r2 <= radius2 ? 'inside' : 'outside';
        if (prev === 'unknown') {
          // First observation seeds the state silently — we do not emit
          // an event for "we now know we were inside/outside all along."
          // This mirrors ChapterDirector's "first update synthesizes
          // transitions from `out` to resting state" — but for SOI the
          // synthesized event is the wrong contract (cold-load inside a
          // SOI is a "we're holding" state, not a "we just crossed" event).
          this.soiStates.set(key, current);
          continue;
        }
        if (prev === current) continue;
        // Real transition.
        this.soiStates.set(key, current);
        const eventType = current === 'inside' ? 'soiEntered' : 'soiExited';
        this.notify({
          type: eventType,
          spacecraft: sc,
          bodyId: gg,
          et,
        } as MissionPhaseEvent);
      }
    }

    // ----- Instrument-shutoff crossings ---------------------------------
    // Fire one `instrumentShutoff` event per (spacecraft, instrument) pair
    // whose shutoff ET is bracketed by (previous, et]. On the FIRST update
    // (previous === null) we DO NOT fire historical events — the cold-load
    // assumption is "I'm joining the simulation at et; instruments that
    // have already shut off should be PRESUMED off, not re-fired as
    // events." This matches the HUD's strikethrough rendering already
    // honouring `et >= shutoffEt` without needing an event.
    if (previous !== null && previous !== et) {
      // Collect crossings, then fire in chronological order (forward) or
      // reverse-chronological (reverse scrub).
      const forward = et > previous;
      const lo = Math.min(previous, et);
      const hi = Math.max(previous, et);
      const crossings: Array<{
        spacecraft: SpacecraftId;
        instrument: Instrument;
        et: number;
      }> = [];
      for (const sc of SPACECRAFT_IN_ORDER) {
        for (const ins of INSTRUMENTS_IN_ORDER) {
          const shutoffEt = getShutoffEt(sc, ins);
          // Half-open interval (lo, hi] so a crossing exactly at the
          // shutoff instant fires once on the forward pass and once on
          // the reverse pass — same single-shot semantics for any
          // discrete crossing.
          if (shutoffEt > lo && shutoffEt <= hi) {
            crossings.push({ spacecraft: sc, instrument: ins, et: shutoffEt });
          }
        }
      }
      crossings.sort((a, b) =>
        forward ? a.et - b.et : b.et - a.et,
      );
      for (const c of crossings) {
        this.notify({
          type: 'instrumentShutoff',
          spacecraft: c.spacecraft,
          instrument: c.instrument,
          et: c.et,
        });
      }
    }
  }

  /**
   * Subscribe to mission-phase transitions. Returns an unsubscribe
   * function. Subscribers fire only on transitions, never per frame.
   *
   * Idempotent: subscribing the same callback twice is a no-op (Set
   * deduplication).
   */
  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /** Detach all subscribers. */
  dispose(): void {
    this.subscribers.clear();
  }

  /**
   * Test / smoke introspection: snapshot the current (spacecraft × body)
   * SOI states. Returns a plain dict for ergonomics in the lead's
   * Chrome DevTools MCP probe (AC8 reads `__voyagerDebug.missionPhaseFSM`).
   */
  getSoiState(spacecraft: SpacecraftNaifId, bodyId: GasGiantNaifId): SoiState {
    return this.soiStates.get(`${spacecraft}:${bodyId}`) ?? 'unknown';
  }

  /** True iff the spacecraft is currently inside the gas giant's SOI. */
  isInsideSoi(spacecraft: SpacecraftNaifId, bodyId: GasGiantNaifId): boolean {
    return this.getSoiState(spacecraft, bodyId) === 'inside';
  }

  private notify(event: MissionPhaseEvent): void {
    if (this.subscribers.size === 0) return;
    for (const cb of this.subscribers) {
      try {
        cb(event);
      } catch (err) {
        // Mirrors Story 2.0 chunk-loader + Story 2.1 ChapterDirector
        // notify-hardening pattern — a throwing subscriber must not
        // silence other subscribers.
        console.error('[MissionPhaseFSM] subscriber threw:', err);
      }
    }
  }
}

