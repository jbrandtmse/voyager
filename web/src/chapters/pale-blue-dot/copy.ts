/**
 * Pale Blue Dot chapter copy (Story 5.1 AC4).
 *
 * Hand-written editorial prose for the PBD chapter, consumed by
 * `<v-chapter-copy>` via the spec-carried `copy` resolver path
 * (`v-chapter-copy.ts:41-44`). Mirrors the V1J / V2J / V1S / V2S / V2U /
 * V2N encounter copy convention established in Stories 4.5 / 4.6 / 4.7:
 *
 *   - `lede`: short heading with trailing period (e.g. "V1 Jupiter.")
 *   - `body`: 80–120 word editorial block referencing canonical facts
 *
 * Per ADR-0021 (chapter copy in TS template literals, NOT external
 * Markdown), this file is the canonical surface for the PBD prose.
 * Per Rule 5 (NFR tripwire) every dated / named fact must trace to
 * `MISSION_FACTS.md` or be deferred to a MISSION_FACTS amendment.
 *
 * ## Citations
 *
 * - Anchor date (`1990-02-14`): MISSION_FACTS.md line 51 — NASA/JPL
 *   "Voyager 1's Pale Blue Dot" + Sagan, *Pale Blue Dot* (Random House,
 *   1994). Date-level sourcing.
 * - Imaging targets (Venus, Earth, Jupiter, Saturn, Uranus, Neptune):
 *   NASA/JPL Planetary Photojournal — the family-portrait mosaic of 60
 *   frames spanning six target bodies.
 * - Turn-back-and-photograph act: Sagan, *Pale Blue Dot* Ch. 1 + PRD
 *   J1 differentiator ("user noticed the camera being aimed at it") —
 *   the simulator's hero scene per `epics.md:1951`.
 * - Distance from Earth: NOT cited in MISSION_FACTS.md at sub-AU
 *   precision; this copy block deliberately uses the qualitative
 *   phrasing "beyond Neptune" rather than fabricating a sub-AU figure.
 *   If a future MISSION_FACTS amendment lands the canonical distance
 *   (the published NASA/JPL figure is ~40.5 AU / ~6.05 billion km),
 *   the copy can be amended in place per Rule 5.
 *
 * ## Test pins
 *
 * The unit tests in `./copy.test.ts` pin:
 *   - lede === "Pale Blue Dot." (exact, with trailing period)
 *   - body word count ∈ [80, 120]
 *   - body contains "1990" + each of the six target names
 *   - body contains the substring matching /turn/i (the turn-back
 *     anchor word per AC4 differentiator)
 */

import type { EncounterChapterCopy } from '../../types/chapter';

/**
 * Story 5.1 AC4 — hand-written PBD chapter copy. Frozen so consumer
 * tests can rely on reference equality for the `copy` field on the
 * re-exported `ChapterSpec`.
 *
 * Word count target: 80–120 words. The pinned-prose word counter in
 * `copy.test.ts` splits on whitespace and filters empties; hyphenated
 * compound words count as one (matches the V1J convention).
 *
 * Editorial intent: the prose narrates the act of turning back — the
 * spacecraft, having passed Neptune, swiveling its scan platform to
 * photograph the inner solar system one last time. The hero scene of
 * the simulator. The closing image references the canonical "mote of
 * dust" framing from Sagan without quoting directly.
 */
export const PBD_COPY: EncounterChapterCopy = Object.freeze({
  lede: 'Pale Blue Dot.',
  body:
    'On 14 February 1990, Voyager 1 has crossed beyond Neptune and is ' +
    'leaving the solar system. At the request of Carl Sagan, the ' +
    'spacecraft turns back. Its narrow-angle camera sweeps the inner ' +
    'sky, photographing Venus, Earth, Jupiter, Saturn, Uranus, and ' +
    'Neptune in sequence — the family portrait. In one frame, Earth ' +
    'appears as a single bright pixel suspended in a scattered ' +
    'sunbeam: a pale blue dot. It is the most distant photograph of ' +
    'home ever taken. Six weeks later the cameras are powered down. ' +
    'The mission of imaging is complete; the spacecraft will travel ' +
    'on, silent, into the interstellar dark. The scan-platform aim ' +
    'shown here is reconstructed from ephemeris constraints; the ' +
    'body turn is from the historical CK.',
});
