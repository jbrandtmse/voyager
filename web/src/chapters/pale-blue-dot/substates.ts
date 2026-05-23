/**
 * Pale Blue Dot internal substate machine (Story 5.1 AC2).
 *
 * The PBD chapter has an internal timeline that runs INSIDE the outer
 * ChapterDirector's `held` state — Voyager 1 turns back, sweeps across
 * the family-portrait targets, and the photo-plate composites fade in
 * and out. Per ADR-0014 this is the dedicated-module surface that
 * justifies PBD's hybrid treatment; the substate enum + ordering map +
 * anchor ETs live here so Story 5.2 (turn choreography) and Story 5.3
 * (photo-plate compositing) can iterate the substates in chronological
 * order without re-declaring the timeline.
 *
 * ## Anchor ETs vs cinematic cadence
 *
 * The historical PBD imaging sequence on 1990-02-14 executed across
 * several hours (the multi-frame mosaic, not a single instant). Per
 * MISSION_FACTS.md the canonical anchor is the midnight UTC instant —
 * date-level sourcing — because no published NASA/JPL surface gives a
 * sub-hour precision for the imaging sequence as a whole.
 *
 * The simulator does NOT replay the multi-hour sequence in real time
 * (it would be unwatchable). Story 5.2's pacing spec maps the entire
 * "turn → sweep → composite" arc to a ~2-minute cinematic cadence at
 * 1× simulation speed. The substate anchor ETs declared here are
 * authored as OFFSET SECONDS FROM THE CHAPTER'S ANCHOR ET (1990-02-14
 * 00:00:00 UTC) so Story 5.2's time-scaling formula can rescale the
 * entire timeline at runtime without rewriting absolute ETs.
 *
 * ## Source citations
 *
 * The historical imaging sequence: NASA/JPL "Voyager 1's Pale Blue Dot"
 * (Planetary Photojournal), Sagan, *Pale Blue Dot* (Random House, 1994
 * — Chapter 1 narrates the turn-back-and-photograph act); MISSION_FACTS.md
 * § Pale Blue Dot family-portrait imaging sequence (line 51) for the
 * date-level anchor ET.
 *
 * The chronological imaging sequence (Venus → Earth → Jupiter → Saturn
 * → Uranus → Neptune) is documented in NASA/JPL's release of the family
 * portrait mosaic; the exact frame order is irrelevant to the substate
 * ordering since the sweep is choreographed inside the cinematic cadence.
 *
 * ## Module shape
 *
 * Pure functions + frozen data — no Lit / DOM / runtime dependencies.
 * Callable from any execution context (Node tests, browser, worker).
 * Per ADR-0015 the substate is queryable via the pure `pbdSubstateAt`
 * function; the `PaleBlueDot` module class wraps this for the runtime
 * subscriber path.
 */

import { etFromIso } from '../../math/et-conversions';

/**
 * Story 5.1 AC2 — chronological substate enum for the PBD internal
 * timeline. Declared in chronological order so `Object.values(...)`
 * preserves the ordering (TypeScript guarantees this for string-valued
 * enums + frozen arrays).
 *
 * `idle` — pre-turn state. Active at the anchor ET cold-load when
 *   playback is paused.
 * `turning` — the spacecraft rotates to aim its scan platform back
 *   toward the inner solar system. Story 5.2 owns the choreography.
 * `sweeping_<body>` — the scan platform sweeps across the named target;
 *   Story 5.3 fades the photo-plate composite in at the peak ET.
 * `composite_active` — the 30-second "thirty-second pause" success-criterion
 *   hold AFTER the Earth narrow-angle frame fades in. The Earth plate is
 *   visible throughout this substate; the scan platform is at rest at the
 *   Earth aim quaternion from the preceding `sweeping_earth` substate.
 *   Per Story 5.3 AC4 at most ONE plate is visible at any moment — during
 *   `composite_active` that one is Earth (the PBD). After this hold the
 *   sweep continues with Jupiter → Saturn → Uranus → Neptune.
 *   Amended in place by Story 5.3 dev (Rule 5) to match the epic spec
 *   line 2141 ("composite_active (during the Earth plate) holds long
 *   enough at 1× chapter playback for the thirty-second pause success
 *   criterion to be possible"). Original Story 5.1 wording had this
 *   substate at the END of the arc holding all six plates simultaneously
 *   — directly contradicting Story 5.3 AC4. See "Story 5.3 Rule-5
 *   amendment" docstring section in this file's `PBD_SUBSTATE_TIMINGS`.
 * `composite_decay` — the final plate fades out; the chapter is winding
 *   down toward `passed`.
 * `passed` — the internal timeline is complete; the outer ChapterDirector
 *   will fire `held → exiting → passed` when ET crosses windowEndEt.
 */
export const PbdSubstate = Object.freeze({
  idle: 'idle',
  turning: 'turning',
  sweeping_venus: 'sweeping_venus',
  sweeping_earth: 'sweeping_earth',
  composite_active: 'composite_active',
  sweeping_jupiter: 'sweeping_jupiter',
  sweeping_saturn: 'sweeping_saturn',
  sweeping_uranus: 'sweeping_uranus',
  sweeping_neptune: 'sweeping_neptune',
  composite_decay: 'composite_decay',
  passed: 'passed',
} as const);

export type PbdSubstate = (typeof PbdSubstate)[keyof typeof PbdSubstate];

/**
 * Story 5.1 AC2 — exported chronological ordering of all 11 substates.
 * Consumed by Story 5.2 (turn choreography) and Story 5.3 (composite
 * layer) so they iterate the timeline in order without re-declaring.
 *
 * Frozen — accidental mutation throws in strict mode.
 */
export const PBD_SUBSTATE_ORDER: readonly PbdSubstate[] = Object.freeze([
  PbdSubstate.idle,
  PbdSubstate.turning,
  PbdSubstate.sweeping_venus,
  PbdSubstate.sweeping_earth,
  // Story 5.3 Rule-5 amendment: composite_active is the 30-second hold
  // DURING the Earth-plate display window — not a terminal "all six
  // plates visible" state. See PBD_SUBSTATE_TIMINGS docstring below.
  PbdSubstate.composite_active,
  PbdSubstate.sweeping_jupiter,
  PbdSubstate.sweeping_saturn,
  PbdSubstate.sweeping_uranus,
  PbdSubstate.sweeping_neptune,
  PbdSubstate.composite_decay,
  PbdSubstate.passed,
]);

/**
 * Story 5.1 AC2 — the canonical PBD anchor ET. Sourced from
 * MISSION_FACTS.md § Pale Blue Dot family-portrait imaging sequence
 * (line 51 — `1990-02-14T00:00:00Z`, NASA/JPL "Voyager 1's Pale Blue
 * Dot" + Sagan 1994). Date-level sourcing per the canonical anchor.
 */
export const PBD_ANCHOR_ET = etFromIso('1990-02-14T00:00:00Z');

/**
 * Anchor ET tuple for a single substate. All three values are OFFSET
 * SECONDS FROM `PBD_ANCHOR_ET` — Story 5.2 will scale these at runtime
 * to map the cinematic cadence to a slower / faster playback rate.
 *
 *   start — the substate becomes active at `anchorEt + start`
 *   peak  — the choreographed moment within the substate (e.g. the
 *           imaging instant for a `sweeping_<body>` substate; the
 *           Story 5.3 composite layer fades in at peak)
 *   end   — the substate exits at `anchorEt + end`
 */
export interface PbdSubstateTimingOffset {
  readonly start: number;
  readonly peak: number;
  readonly end: number;
}

/**
 * Story 5.1 AC2 — substate timing table. Offsets are SECONDS RELATIVE
 * TO `PBD_ANCHOR_ET` (1990-02-14T00:00:00Z); negative values fall
 * before the anchor, positive after.
 *
 * The cinematic cadence (per Story 5.2's pacing spec) maps the entire
 * "turn → sweep → composite" arc to ~2 minutes at 1× simulation speed.
 * Substate timings are evenly distributed across that band; the exact
 * peaks chosen here are placeholder for Story 5.2 to tune against the
 * choreographed turn quaternion emission cadence.
 *
 * Sequence rationale (chronological imaging order Venus → Earth →
 * Jupiter → Saturn → Uranus → Neptune, with the Earth-plate pause hold
 * inserted between Earth and Jupiter per the Story 5.3 Rule-5 amendment):
 *
 *   - `idle`             starts at the window's lower bound (-1 day from
 *                        anchor) and ends at the anchor ET — the chapter
 *                        enters its choreographed arc at the anchor.
 *   - `turning`          anchor + [0, +30s] — 30 seconds of cinematic
 *                        turn-back rotation.
 *   - `sweeping_venus`   +30s..+45s — Venus plate fades in at peak.
 *   - `sweeping_earth`   +45s..+60s — Earth plate (the Pale Blue Dot)
 *                        fades in at peak. THIS is the hero shot.
 *   - `composite_active` +60s..+90s — 30-SECOND HOLD of the Earth plate.
 *                        This is the success-criterion "thirty-second
 *                        pause" (per epic spec line 2141 and PRD §Pale
 *                        Blue Dot). Earth remains visible at opacity 1
 *                        throughout this substate.
 *   - `sweeping_jupiter` +90s..+105s — Earth plate fades out, Jupiter
 *                        plate fades in at peak.
 *   - `sweeping_saturn`  +105s..+120s
 *   - `sweeping_uranus`  +120s..+135s
 *   - `sweeping_neptune` +135s..+150s
 *   - `composite_decay`  +150s..+180s — final plate (Neptune) fades out.
 *   - `passed`           +180s and onward — internal timeline complete;
 *                        chapter will exit on windowEndEt (+1 day).
 *
 * Each `peak` is the substate's midpoint. Story 5.2 may tune these
 * per-substate (the turn-back has a fast initial yaw + slow settle the
 * literal midpoint won't represent); the placeholder midpoint is
 * deterministic and a valid Rule-5-compliant first cut.
 *
 * ## Story 5.3 Rule-5 amendment (2026-05-23)
 *
 * The original Story 5.1 wording placed `composite_active` AT THE END
 * of the arc (+120s..+150s) with the docstring "all six photo-plates
 * are visible simultaneously". Story 5.3 AC4 directly contradicts that
 * — "at any moment, at most ONE plate is visible" — and Story 5.3 AC6
 * cited epic line 2141 ("composite_active (during the Earth plate)
 * holds long enough at 1× chapter playback for the thirty-second pause
 * success criterion to be possible").
 *
 * Per Rule 5 (NFR tripwire response in `_bmad/custom/voyager-skill-rules.md`)
 * this file is amended in place rather than papering over with code
 * comments in the composite layer. The amendment:
 *
 *   1. `composite_active` is repositioned in chronological order to
 *      sit BETWEEN `sweeping_earth` (Earth plate fade-in) and
 *      `sweeping_jupiter` (Earth fades out, Jupiter fades in).
 *   2. The Earth plate is visible during BOTH `sweeping_earth` and
 *      `composite_active` (15s sweep-in + 30s hold = 45s of Earth
 *      visibility — exceeds the 30-second success-criterion pause).
 *   3. The total cinematic arc length stays 180s (30 turning + 6×15s
 *      sweeping + 30s composite_active + 30s composite_decay) so
 *      Story 5.2's 50× speedup-factor recomputation (epics.md
 *      line 2062-2070) is preserved without re-derivation.
 *   4. `targetNaifIdForSubstate(composite_active)` still returns null
 *      — the choreography engine does not actively re-aim during the
 *      hold (the scan platform stays at its sweeping_earth aim). The
 *      composite layer (Story 5.3) holds the Earth plate visible by
 *      keeping its own substate→plate map sticky across
 *      sweeping_earth + composite_active.
 */
export const PBD_SUBSTATE_TIMINGS: Readonly<
  Record<PbdSubstate, PbdSubstateTimingOffset>
> = Object.freeze({
  idle: Object.freeze({ start: -86_400, peak: -43_200, end: 0 }),
  turning: Object.freeze({ start: 0, peak: 15, end: 30 }),
  sweeping_venus: Object.freeze({ start: 30, peak: 37.5, end: 45 }),
  sweeping_earth: Object.freeze({ start: 45, peak: 52.5, end: 60 }),
  // Story 5.3 Rule-5 amendment — 30-second Earth-plate hold (the
  // "thirty-second pause" success criterion).
  composite_active: Object.freeze({ start: 60, peak: 75, end: 90 }),
  sweeping_jupiter: Object.freeze({ start: 90, peak: 97.5, end: 105 }),
  sweeping_saturn: Object.freeze({ start: 105, peak: 112.5, end: 120 }),
  sweeping_uranus: Object.freeze({ start: 120, peak: 127.5, end: 135 }),
  sweeping_neptune: Object.freeze({ start: 135, peak: 142.5, end: 150 }),
  composite_decay: Object.freeze({ start: 150, peak: 165, end: 180 }),
  passed: Object.freeze({ start: 180, peak: 180, end: 86_400 }),
});

/**
 * Story 5.1 AC2 — pure function returning the active substate for a
 * given ET.
 *
 * The classification is window-based: each substate occupies
 * `[anchorEt + timing.start, anchorEt + timing.end]`. Boundary instants
 * resolve to the EARLIER substate in chronological order (i.e. the
 * `end` of substate N == the `start` of substate N+1 returns substate
 * N+1 — half-open intervals on the right). The two exceptions:
 *
 *   - ET strictly before `idle.start` returns `idle` (the outer FSM
 *     is responsible for the `out` → `entering` → `held` boundary; if
 *     the caller is asking for a substate, the chapter is held).
 *   - ET strictly after `passed.end` returns `passed` (mirror).
 *
 * Deterministic for the same input. Does NOT touch global state.
 *
 * @param currentEt — SPICE ET (TDB seconds past J2000) at which to
 *                    evaluate the substate.
 * @returns the active `PbdSubstate` at `currentEt`.
 */
export const pbdSubstateAt = (currentEt: number): PbdSubstate => {
  if (!Number.isFinite(currentEt)) {
    // Mirror the ChapterDirector convention: non-finite ETs are a
    // silent-reject. Fall back to `idle` since the cold-load default
    // is `idle` per AC5.
    return PbdSubstate.idle;
  }
  const offset = currentEt - PBD_ANCHOR_ET;
  // Walk in chronological order. The first substate whose `[start, end)`
  // contains the offset is the active one. `passed.end` is the upper
  // sentinel (1 day after anchor — matches the chapter window).
  for (let i = 0; i < PBD_SUBSTATE_ORDER.length; i += 1) {
    const substate = PBD_SUBSTATE_ORDER[i];
    const timing = PBD_SUBSTATE_TIMINGS[substate];
    if (offset < timing.start) {
      // Offset is before this substate's start — the previous substate
      // (or `idle` if i === 0) is active.
      return i === 0 ? PbdSubstate.idle : PBD_SUBSTATE_ORDER[i - 1];
    }
    if (offset >= timing.start && offset < timing.end) {
      return substate;
    }
  }
  // Past the entire timeline — `passed`.
  return PbdSubstate.passed;
};

/**
 * Story 5.1 AC2 — absolute (TDB-seconds-past-J2000) `start` / `peak`
 * / `end` ET tuple for a substate. Convenience accessor for consumers
 * that don't want to re-add `PBD_ANCHOR_ET` themselves.
 */
export const pbdSubstateAnchorEts = (
  substate: PbdSubstate,
): { start: number; peak: number; end: number } => {
  const timing = PBD_SUBSTATE_TIMINGS[substate];
  return {
    start: PBD_ANCHOR_ET + timing.start,
    peak: PBD_ANCHOR_ET + timing.peak,
    end: PBD_ANCHOR_ET + timing.end,
  };
};
