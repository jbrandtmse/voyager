/**
 * mission-facts.ts — runtime mirror of `MISSION_FACTS.md` (NFR-M3).
 *
 * `MISSION_FACTS.md` is the human-readable source-of-truth with citation
 * provenance. This module is the runtime data the simulation consumes. A
 * parity test (`mission-facts.test.ts`) reads MISSION_FACTS.md and asserts
 * that every UTC date string in this module appears verbatim in the doc —
 * the R4 mitigation against drift between the citation surface and the
 * runtime constants.
 *
 * Module shape: pure constants + the per-instrument ET cache below. No DOM
 * dependencies — callable from any execution context (Node tests, browser,
 * worker).
 */

import { etFromIso } from '../math/et-conversions';

/** The four instruments tracked by `<v-hud-instruments>` (Story 2.9 AC3). */
export type Instrument = 'ISS' | 'UVS' | 'PLS' | 'LECP';

/** The two spacecraft tracked by the instrument-shutoff HUD readout. */
export type SpacecraftId = 'V1' | 'V2';

export const INSTRUMENTS_IN_ORDER: readonly Instrument[] = Object.freeze([
  'ISS',
  'UVS',
  'PLS',
  'LECP',
]);

export const SPACECRAFT_IN_ORDER: readonly SpacecraftId[] = Object.freeze([
  'V1',
  'V2',
]);

/**
 * Per-spacecraft, per-instrument shutoff UTC date strings (ISO-8601, midnight
 * UTC). The corresponding ET threshold is computed lazily via `etFromIso`
 * below — the strings here are the canonical source so the parity test can
 * grep MISSION_FACTS.md for them verbatim.
 *
 * Strings are intentionally midnight UTC for every entry. See MISSION_FACTS.md
 * for sourcing rationale (some entries are calendar-month public-record dates
 * with no published sub-day instant).
 */
export const INSTRUMENT_SHUTOFF_DATES: Readonly<
  Record<SpacecraftId, Readonly<Record<Instrument, string>>>
> = Object.freeze({
  V1: Object.freeze({
    ISS: '1990-04-14T00:00:00Z',
    UVS: '2016-04-19T00:00:00Z',
    PLS: '1980-04-01T00:00:00Z',
    LECP: '2025-09-30T00:00:00Z',
  }),
  V2: Object.freeze({
    ISS: '1990-01-01T00:00:00Z',
    UVS: '1998-01-01T00:00:00Z',
    PLS: '2024-10-01T00:00:00Z',
    LECP: '2026-09-30T00:00:00Z',
  }),
});

/** Spacecraft launch UTC instants (cross-checked against chapter-specs). */
export const LAUNCH_DATES: Readonly<Record<SpacecraftId, string>> = Object.freeze({
  V1: '1977-09-05T12:56:00Z',
  V2: '1977-08-20T14:29:00Z',
});

/** Closest-approach UTC instants for the six planetary encounters. */
export const ENCOUNTER_DATES: ReadonlyArray<{
  readonly spacecraft: SpacecraftId;
  readonly body: 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune';
  readonly utc: string;
}> = Object.freeze([
  { spacecraft: 'V1', body: 'Jupiter', utc: '1979-03-05T12:05:00Z' },
  { spacecraft: 'V2', body: 'Jupiter', utc: '1979-07-09T22:29:00Z' },
  { spacecraft: 'V1', body: 'Saturn', utc: '1980-11-12T23:46:00Z' },
  { spacecraft: 'V2', body: 'Saturn', utc: '1981-08-26T00:00:00Z' },
  { spacecraft: 'V2', body: 'Uranus', utc: '1986-01-24T17:59:00Z' },
  { spacecraft: 'V2', body: 'Neptune', utc: '1989-08-25T03:56:00Z' },
]);

/** Heliopause crossing UTC dates (midnight per published calendar date). */
export const HELIOPAUSE_DATES: Readonly<Record<SpacecraftId, string>> = Object.freeze({
  V1: '2012-08-25T00:00:00Z',
  V2: '2018-11-05T00:00:00Z',
});

/**
 * Pale Blue Dot family-portrait imaging-sequence anchor (Voyager 1 only).
 * Date-level sourcing: the imaging sequence spans several hours; the canonical
 * anchor is midnight UTC. Story 3.1 uses this as the closest-approach equivalent
 * for the PBD encounter window's 10-second-cadence attitude bake.
 */
export const PBD_DATE: string = '1990-02-14T00:00:00Z';

/**
 * Pre-computed ET thresholds for the instrument-shutoff schedule. Built once
 * at module load so the HUD's per-frame comparison is a flat numeric lookup
 * rather than re-parsing the ISO strings every tick. AC3 — the 8 comparisons
 * (4 instruments × 2 spacecraft) run on every HUD tick; perf budget is
 * trivial but the cache keeps things tidy.
 */
const SHUTOFF_ET_CACHE: Readonly<
  Record<SpacecraftId, Readonly<Record<Instrument, number>>>
> = Object.freeze({
  V1: Object.freeze({
    ISS: etFromIso(INSTRUMENT_SHUTOFF_DATES.V1.ISS),
    UVS: etFromIso(INSTRUMENT_SHUTOFF_DATES.V1.UVS),
    PLS: etFromIso(INSTRUMENT_SHUTOFF_DATES.V1.PLS),
    LECP: etFromIso(INSTRUMENT_SHUTOFF_DATES.V1.LECP),
  }),
  V2: Object.freeze({
    ISS: etFromIso(INSTRUMENT_SHUTOFF_DATES.V2.ISS),
    UVS: etFromIso(INSTRUMENT_SHUTOFF_DATES.V2.UVS),
    PLS: etFromIso(INSTRUMENT_SHUTOFF_DATES.V2.PLS),
    LECP: etFromIso(INSTRUMENT_SHUTOFF_DATES.V2.LECP),
  }),
});

/**
 * Return the ET threshold at which the instrument transitions from active to
 * shut-off. The HUD compares the current simulation ET against this value:
 * `simEt >= getShutoffEt(spacecraft, instrument)` ⇒ render with strikethrough.
 */
export const getShutoffEt = (
  spacecraft: SpacecraftId,
  instrument: Instrument,
): number => SHUTOFF_ET_CACHE[spacecraft][instrument];

/**
 * True iff the instrument has been shut off at the given simulation ET.
 * Inclusive at the boundary: at exactly the shutoff instant, the instrument
 * is considered shut off (visible transition fires on that frame).
 */
export const isShutOffAt = (
  spacecraft: SpacecraftId,
  instrument: Instrument,
  simEt: number,
): boolean => simEt >= getShutoffEt(spacecraft, instrument);
