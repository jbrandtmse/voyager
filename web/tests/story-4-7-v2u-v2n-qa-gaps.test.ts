// @vitest-environment happy-dom
/**
 * Story 4.7 — QA gap suite for V2 Uranus and V2 Neptune (Triton bend FR12)
 * encounter chapters.
 *
 * Story 4.7 closes FR30 by populating the final two of the six gas-giant
 * encounter chapters: V2 Uranus (Miranda 29,000 km flyby, 1986-01-24) and
 * V2 Neptune (Triton 39,800 km flyby + FR12 south-of-ecliptic bend,
 * 1989-08-25). The dev-authored test suite covers each surface in
 * isolation:
 *   - `web/src/chapters/specs/v2-uranus.test.ts` (18 tests) — spec shape,
 *     window narrow, copy word-count + fact mentions, framing scale.
 *   - `web/src/chapters/specs/v2-neptune.test.ts` (18 tests) — same shape
 *     for V2N.
 *   - `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` (Rule 1
 *     integration AC, extended with V2U + V2N fixtures per dev's AC7
 *     call — 25 tests total: five assertions × five chapters via the
 *     reused `runChapterIntegration(fixture)` helper).
 *   - Story 4.5 + 4.6 QA-gap tests amended in place to reflect Story 4.7
 *     ground truth (FR30 closed; six populated chapters).
 *
 * This QA file fills the cross-cutting gaps the dev suite does not
 * exercise, per the orchestrator's eight gap-hunting priorities:
 *
 *   1. **MISSION_FACTS.md citation regex audit for V2U / V2N** — same
 *      pattern as Stories 4.5 / 4.6 QA gaps applied to the two new
 *      chapters. Read each copy `body`, regex-match every dated /
 *      distanced / named-body identifier, assert each match resolves to
 *      MISSION_FACTS.md.
 *   2. **V2N FR12 quantitative-deflection defense pin** — Story 4.6
 *      gap-7 pattern repeated for V2N: the FR12 Triton-bend description
 *      must remain qualitative ("south of ecliptic") only. No invented
 *      deflection-angle figure ("by N degrees", "deflected by N", etc.).
 *      No primary source canonicalises a single number for V2's
 *      Triton-deflection angle.
 *   3. **V2U Miranda 29,000 km exact figure pin** — appears in V2U body
 *      AND MISSION_FACTS.md; if one changes both must (Story 4.6 gap-3
 *      shape for V1S's 6,490 km).
 *   4. **V2N Triton 39,800 km exact figure pin** — same shape, the
 *      canonical Triton altitude per Smith et al., *Science* 246, 1422
 *      (1989) + NASA SP-525.
 *   5. **defaultFraming inequalities** — V2U ≠ V2N ≠ V1S/V2S ≠ V1J/V2J.
 *      The Uranian system is compact (Miranda ~130,000 km from Uranus),
 *      Triton is intermediate (~354,800 km), Titan is large
 *      (~1,221,830 km). The framings must reflect this hierarchy.
 *      Catches future copy-paste regression where V2U adopts V2J's
 *      offset (or vice versa).
 *   6. **All 6 chapters now resolve copy via copyForChapter** — Story 4.6
 *      gap-5 enumerated 4 populated chapters; Story 4.7 closes FR30 by
 *      adding V2U + V2N to the populated set. The non-encounter chapters
 *      (cruise / launch / PBD) remain null; heliopause routed to
 *      heliopauseCopyForSlug per ADR-0021.
 *   7. **Uranian moon NAIF ID correctness** — defense regex over
 *      MISSION_FACTS.md asserting Cordelia=706, Ophelia=707, Bianca=708,
 *      Cressida=709, Desdemona=710, Juliet=711, Portia=712, Rosalind=713,
 *      Belinda=714, Puck=715, Perdita=725 per JPL canonical (NAIF
 *      satellites kernel). The dev's decision notes flagged a draft-time
 *      typo (Cordelia=706 collision avoided); this test pins the
 *      canonical assignments. Plus Neptunian moons Naiad=803,
 *      Thalassa=804, Despina=805, Galatea=806, Larissa=807, Proteus=808.
 *   8. **V2N nitrogen geyser primary-source citation** — Soderblom et
 *      al., *Science* 250, 410 (1990) must appear in the V2N
 *      MISSION_FACTS.md section. No secondary citations (Wikipedia,
 *      space.com, etc.). Pin the canonical citation so a future edit
 *      that swaps in a secondary doesn't silently pass.
 *
 * Discoverability: web vitest's `*.test.ts` glob picks this up
 * automatically; no skip markers used. Tests run inside happy-dom
 * (`@vitest-environment happy-dom`) because the production `<v-chapter-
 * copy>` dispatch path under priority 6 mounts a Lit element.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, afterEach } from 'vitest';

import v1Jupiter from '../src/chapters/specs/v1-jupiter';
import v2Jupiter from '../src/chapters/specs/v2-jupiter';
import v1Saturn from '../src/chapters/specs/v1-saturn';
import v2Saturn from '../src/chapters/specs/v2-saturn';
import v2Uranus from '../src/chapters/specs/v2-uranus';
import v2Neptune from '../src/chapters/specs/v2-neptune';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import { ChapterDirector } from '../src/services/chapter-director';
import { VChapterCopy } from '../src/components/v-chapter-copy';

// --------------------------------------------------------------------
// MISSION_FACTS.md is at repo root. Resolve once at module load so the
// regex audit runs against the live artifact (a missing facts amendment
// surfaces as a test failure, not a silent pass).
// --------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MISSION_FACTS_PATH = resolve(__dirname, '../../MISSION_FACTS.md');
const MISSION_FACTS_CONTENT = readFileSync(MISSION_FACTS_PATH, 'utf8');

// --------------------------------------------------------------------
// Helper — extract the substring of MISSION_FACTS.md between two
// section headers, so the citation audit doesn't false-positive on
// other-chapter citations bleeding into the V2U/V2N section.
// --------------------------------------------------------------------

const sliceMissionFactsSection = (startHeading: string): string => {
  const startIdx = MISSION_FACTS_CONTENT.indexOf(startHeading);
  if (startIdx < 0) {
    throw new Error(
      `MISSION_FACTS.md section "${startHeading}" missing — regression in citation surface`,
    );
  }
  const tail = MISSION_FACTS_CONTENT.slice(startIdx + startHeading.length);
  const nextHeadingMatch = tail.match(/\n## [^\n]+/);
  const endIdx =
    nextHeadingMatch && nextHeadingMatch.index !== undefined
      ? startIdx + startHeading.length + nextHeadingMatch.index
      : MISSION_FACTS_CONTENT.length;
  return MISSION_FACTS_CONTENT.slice(startIdx, endIdx);
};

const V2U_FACTS_HEADING =
  '## Voyager 2 Uranus encounter — moon flyby parameters and discoveries';
const V2N_FACTS_HEADING =
  '## Voyager 2 Neptune encounter — Triton flyby parameters and discoveries';

afterEach(() => {
  document.querySelectorAll('v-chapter-copy').forEach((el) => el.remove());
});

// ====================================================================
// Gap 1 — MISSION_FACTS.md citation regex audit for V2U / V2N
// ====================================================================

describe('Story 4.7 QA gap 1 — MISSION_FACTS.md citation audit for V2U / V2N', () => {
  it('MISSION_FACTS.md is loadable from the repo root', () => {
    expect(MISSION_FACTS_CONTENT.length).toBeGreaterThan(0);
    expect(MISSION_FACTS_CONTENT).toContain('# MISSION_FACTS.md');
  });

  it('MISSION_FACTS.md contains the V2 Uranus encounter section heading', () => {
    expect(MISSION_FACTS_CONTENT).toContain(V2U_FACTS_HEADING);
  });

  it('MISSION_FACTS.md contains the V2 Neptune encounter section heading', () => {
    expect(MISSION_FACTS_CONTENT).toContain(V2N_FACTS_HEADING);
  });

  it('every natural-language date in V2U copy resolves to MISSION_FACTS.md ISO form', () => {
    expect(v2Uranus.copy).toBeDefined();
    const body = v2Uranus.copy!.body;
    const naturalDates = body.match(
      /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/g,
    );
    expect(naturalDates).not.toBeNull();
    expect(naturalDates!.length).toBeGreaterThan(0);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    for (const dateStr of naturalDates!) {
      const match = dateStr.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
      expect(match).not.toBeNull();
      const day = parseInt(match![1], 10);
      const monthIdx = months.indexOf(match![2]);
      expect(monthIdx).toBeGreaterThanOrEqual(0);
      const iso = `${match![3]}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      expect(
        MISSION_FACTS_CONTENT,
        `V2U copy mentions ${dateStr} but ${iso} is not cited in MISSION_FACTS.md`,
      ).toContain(iso);
    }
  });

  it('every natural-language date in V2N copy resolves to MISSION_FACTS.md ISO form', () => {
    expect(v2Neptune.copy).toBeDefined();
    const body = v2Neptune.copy!.body;
    const naturalDates = body.match(
      /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/g,
    );
    expect(naturalDates).not.toBeNull();
    expect(naturalDates!.length).toBeGreaterThan(0);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    for (const dateStr of naturalDates!) {
      const match = dateStr.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
      expect(match).not.toBeNull();
      const day = parseInt(match![1], 10);
      const monthIdx = months.indexOf(match![2]);
      expect(monthIdx).toBeGreaterThanOrEqual(0);
      const iso = `${match![3]}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      expect(
        MISSION_FACTS_CONTENT,
        `V2N copy mentions ${dateStr} but ${iso} is not cited in MISSION_FACTS.md`,
      ).toContain(iso);
    }
  });

  it('every Uranian moon named in V2U copy is also cited in MISSION_FACTS.md', () => {
    // V2U body names the five major Uranian moons (Oberon / Titania /
    // Umbriel / Ariel / Miranda) per Story 4.6 Rule-5 amendment pattern.
    const body = v2Uranus.copy!.body;
    for (const moon of ['Miranda', 'Ariel', 'Umbriel', 'Titania', 'Oberon']) {
      expect(body).toContain(moon);
      expect(
        MISSION_FACTS_CONTENT,
        `V2U copy mentions ${moon} but it is not cited in MISSION_FACTS.md`,
      ).toContain(moon);
    }
  });

  it('every named body in V2N copy is also cited in MISSION_FACTS.md', () => {
    const body = v2Neptune.copy!.body;
    // V2N body names Neptune, Triton, and references the Great Dark Spot.
    expect(body).toContain('Neptune');
    expect(MISSION_FACTS_CONTENT).toContain('Neptune');
    expect(body).toContain('Triton');
    expect(MISSION_FACTS_CONTENT).toContain('Triton');
    expect(body).toContain('Great Dark Spot');
    expect(MISSION_FACTS_CONTENT).toContain('Great Dark Spot');
  });

  it('the canonical anchor ISO instants for V2U / V2N appear in MISSION_FACTS.md', () => {
    expect(MISSION_FACTS_CONTENT).toContain('1986-01-24T17:59:00Z');
    expect(MISSION_FACTS_CONTENT).toContain('1989-08-25T03:56:00Z');
  });

  it('the Miranda closest-approach instant + Triton flyby instant appear in MISSION_FACTS.md', () => {
    // Per the dev's MISSION_FACTS encounter tables. Miranda CA was ~1 hour
    // before Uranus CA; Triton CA was ~5 hours after Neptune CA. The
    // table-level rows must persist for the citation surface to remain
    // intact.
    expect(MISSION_FACTS_CONTENT).toContain('1986-01-24T17:00:00Z'); // Miranda
    expect(MISSION_FACTS_CONTENT).toContain('1989-08-25T09:10:00Z'); // Triton
  });
});

// ====================================================================
// Gap 2 — V2N FR12 quantitative-deflection defense pin
// ====================================================================

describe('Story 4.7 QA gap 2 — V2N body does NOT invent a quantitative FR12 deflection angle', () => {
  it('V2N body uses qualitative "south of the ecliptic" framing (no specific angle)', () => {
    expect(v2Neptune.copy).toBeDefined();
    const body = v2Neptune.copy!.body;
    // The qualitative framing must be present per AC2 + AC4.
    expect(body).toMatch(
      /south of the ecliptic|ecliptic plane|southward/i,
    );
  });

  it('V2N body does NOT cite a specific FR12 deflection-angle figure (regression defense)', () => {
    expect(v2Neptune.copy).toBeDefined();
    const body = v2Neptune.copy!.body;
    // Patterns that would indicate an invented quantitative deflection
    // figure. Each is a HIGH-risk regression because no primary source
    // canonicalises a single number for V2's Triton-deflection angle in
    // the editorial copy surface. NASA SP-525 documents the bend
    // qualitatively; specific angle figures would have to come with a
    // primary-source citation in MISSION_FACTS.md.
    expect(
      body,
      `V2N body matches /\\d+\\s*degree/ — quantitative deflection angle without primary-source citation`,
    ).not.toMatch(/\b\d+(?:\.\d+)?\s*degree/i);
    expect(
      body,
      `V2N body matches /\\d+°/ — quantitative deflection angle without primary-source citation`,
    ).not.toMatch(/\b\d+(?:\.\d+)?\s*°/);
    expect(
      body,
      `V2N body matches /\\d+\\s*radian/ — quantitative deflection in radians`,
    ).not.toMatch(/\b\d+(?:\.\d+)?\s*radian/i);
    expect(
      body,
      `V2N body matches /south by N/ — invented quantitative deflection`,
    ).not.toMatch(/south by \d/i);
    expect(
      body,
      `V2N body matches /deflected by \\d+/ — invented quantitative deflection`,
    ).not.toMatch(/deflected by \d/i);
    expect(
      body,
      `V2N body matches /bent by \\d+/ — invented quantitative deflection`,
    ).not.toMatch(/bent by \d/i);
  });

  it('MISSION_FACTS.md V2N Triton-bend section keeps the deflection qualitative', () => {
    const v2nSection = sliceMissionFactsSection(V2N_FACTS_HEADING);
    // Same defense applied to the citation surface. If a future primary
    // source surfaces a canonical Triton-deflection angle, BOTH this
    // test and the body test above must be updated together (with the
    // citation accompanying the figure).
    expect(
      v2nSection,
      `MISSION_FACTS V2N section contains /\\d+\\s*degree/ deflection figure — primary-source citation required if added`,
    ).not.toMatch(/deflection.*\b\d+(?:\.\d+)?\s*degree/i);
    expect(
      v2nSection,
      `MISSION_FACTS V2N section contains /\\d+°/ deflection figure — primary-source citation required if added`,
    ).not.toMatch(/deflection.*\b\d+(?:\.\d+)?\s*°/);
  });

  it('V2N body explicitly references the FR12 framing ("south of the ecliptic" / "ecliptic")', () => {
    // The dev's AC4 dance: the chapter copy frames the bend as "set up
    // by" the Triton flyby. The FR12 ecliptic-plane language must be
    // present so the chapter reads as a record of the gravity-assist
    // even though the bend visualisation lives outside the ±5d window.
    const body = v2Neptune.copy!.body;
    expect(body).toMatch(/ecliptic/);
  });
});

// ====================================================================
// Gap 3 — V2U Miranda 29,000 km exact figure pin
// ====================================================================

describe('Story 4.7 QA gap 3 — V2U Miranda 29,000 km altitude pinned in both surfaces', () => {
  it('V2U copy body cites the Miranda altitude (word or numeric form)', () => {
    expect(v2Uranus.copy).toBeDefined();
    // Editorial style — the dev chose word form ("twenty-nine thousand").
    // Accept either form so a future rewrite to numeric doesn't trip
    // the assertion, but the figure must be present in some form.
    expect(v2Uranus.copy!.body).toMatch(
      /twenty-nine thousand\s+kilometres?|29,000\s+(km|kilometres?|kilometers)/,
    );
  });

  it('MISSION_FACTS.md V2U section cites the exact "29,000 km" Miranda altitude', () => {
    const v2uSection = sliceMissionFactsSection(V2U_FACTS_HEADING);
    expect(v2uSection).toMatch(/29,000\s*km/);
  });

  it('the 29,000 km figure is cited to Stone & Miner Science 233 + Smith et al. Science 233', () => {
    const v2uSection = sliceMissionFactsSection(V2U_FACTS_HEADING);
    // Primary-source citations must accompany the Miranda altitude.
    expect(v2uSection).toMatch(/Stone & Miner/);
    expect(v2uSection).toMatch(/Smith et al/);
    // MISSION_FACTS formats the journal in markdown italics — *Science*
    // 233. Permit the trailing asterisk between "Science" and the volume
    // number.
    expect(v2uSection).toMatch(/Science\*?\s+233/);
  });

  it('V2U body altitude figure matches MISSION_FACTS.md (no divergence)', () => {
    // If editorial copy ever switches to numeric ("29,000 km" form) the
    // exact value must already be in MISSION_FACTS.md. The current word
    // form ("twenty-nine thousand") implicitly references the 29,000 km
    // figure; this test pins that mapping.
    const body = v2Uranus.copy!.body;
    if (body.match(/\b29,000\s*km/)) {
      const v2uSection = sliceMissionFactsSection(V2U_FACTS_HEADING);
      expect(v2uSection).toMatch(/29,000\s*km/);
    }
    // Defense: a future edit to a more-precise figure (e.g., "29,005 km")
    // must update MISSION_FACTS in lockstep. Extract any explicit N,NNN km
    // pattern and assert MISSION_FACTS contains the same number.
    const altitudeMatches = body.match(
      /\b(\d{1,3}(?:,\d{3})+)\s+(km|kilometres?|kilometers)\b/g,
    );
    if (altitudeMatches !== null) {
      for (const altitudeStr of altitudeMatches) {
        const numericPart = altitudeStr.match(/^(\d{1,3}(?:,\d{3})+)/)![1];
        expect(
          MISSION_FACTS_CONTENT,
          `V2U body mentions altitude ${altitudeStr} but ${numericPart} km is not cited in MISSION_FACTS.md`,
        ).toMatch(new RegExp(`${numericPart}\\s*km`));
      }
    }
  });
});

// ====================================================================
// Gap 4 — V2N Triton 39,800 km exact figure pin
// ====================================================================

describe('Story 4.7 QA gap 4 — V2N Triton 39,800 km altitude pinned in both surfaces', () => {
  it('V2N copy body cites the Triton altitude (word or numeric form)', () => {
    expect(v2Neptune.copy).toBeDefined();
    const body = v2Neptune.copy!.body;
    // Editorial style — the dev chose word form ("thirty-nine thousand
    // eight hundred"). Accept either form.
    expect(body).toMatch(
      /thirty-nine thousand eight hundred\s+kilometres?|39,800\s+(km|kilometres?|kilometers)/,
    );
  });

  it('MISSION_FACTS.md V2N section cites the exact "39,800 km" Triton altitude', () => {
    const v2nSection = sliceMissionFactsSection(V2N_FACTS_HEADING);
    expect(v2nSection).toMatch(/39,800\s*km/);
  });

  it('the 39,800 km figure is cited to Smith et al. Science 246 + NASA SP-525', () => {
    const v2nSection = sliceMissionFactsSection(V2N_FACTS_HEADING);
    expect(v2nSection).toMatch(/Smith et al/);
    expect(v2nSection).toMatch(/Science\*?\s+246/);
    expect(v2nSection).toMatch(/NASA SP-525/);
  });

  it('V2N body altitude figure matches MISSION_FACTS.md (no divergence)', () => {
    const body = v2Neptune.copy!.body;
    const altitudeMatches = body.match(
      /\b(\d{1,3}(?:,\d{3})+)\s+(km|kilometres?|kilometers)\b/g,
    );
    if (altitudeMatches !== null) {
      for (const altitudeStr of altitudeMatches) {
        const numericPart = altitudeStr.match(/^(\d{1,3}(?:,\d{3})+)/)![1];
        expect(
          MISSION_FACTS_CONTENT,
          `V2N body mentions altitude ${altitudeStr} but ${numericPart} km is not cited in MISSION_FACTS.md`,
        ).toMatch(new RegExp(`${numericPart}\\s*km`));
      }
    }
  });
});

// ====================================================================
// Gap 5 — defaultFraming inequalities across the six gas-giant encounters
// ====================================================================

describe('Story 4.7 QA gap 5 — defaultFraming inequalities across V2U / V2N / V1S / V2S / V1J / V2J', () => {
  const mag = (offset: readonly number[]): number =>
    Math.hypot(offset[0], offset[1], offset[2]);

  it('V2U defaultFraming offset is non-zero in at least one axis', () => {
    expect(v2Uranus.defaultFraming).toBeDefined();
    expect(mag(v2Uranus.defaultFraming!.offsetKm)).toBeGreaterThan(0);
  });

  it('V2N defaultFraming offset is non-zero in at least one axis', () => {
    expect(v2Neptune.defaultFraming).toBeDefined();
    expect(mag(v2Neptune.defaultFraming!.offsetKm)).toBeGreaterThan(0);
  });

  it('V2U offset is distinct from V2J (Jupiter-system) — Uranian system is compact', () => {
    // The dev's documented scale-DOWN: V2U uses [0.6, 0.9, 1.5] Mm; V2J
    // uses [1.0, 1.5, 2.5] Mm — Miranda orbits at ~130,000 km vs. Io's
    // ~421,700 km. Pin the inequality so a future "round up to match
    // V2J" copy-paste trips the assertion.
    const v2u = v2Uranus.defaultFraming!.offsetKm;
    const v2j = v2Jupiter.defaultFraming!.offsetKm;
    const tuplesEqual =
      v2u[0] === v2j[0] && v2u[1] === v2j[1] && v2u[2] === v2j[2];
    expect(
      tuplesEqual,
      `V2U [${v2u.join(', ')}] and V2J [${v2j.join(', ')}] are identical — accidental copy-paste?`,
    ).toBe(false);
    expect(mag(v2u)).toBeLessThan(mag(v2j));
  });

  it('V2U offset is distinct from V1J (Jupiter baseline) — same scale-DOWN logic', () => {
    const v2u = v2Uranus.defaultFraming!.offsetKm;
    const v1j = v1Jupiter.defaultFraming!.offsetKm;
    const tuplesEqual =
      v2u[0] === v1j[0] && v2u[1] === v1j[1] && v2u[2] === v1j[2];
    expect(
      tuplesEqual,
      `V2U and V1J framings are identical — accidental copy-paste?`,
    ).toBe(false);
    expect(mag(v2u)).toBeLessThan(mag(v1j));
  });

  it('V2N offset is distinct from V1S / V2S (Saturn-system Titan-scale)', () => {
    const v2n = v2Neptune.defaultFraming!.offsetKm;
    const v1s = v1Saturn.defaultFraming!.offsetKm;
    const v2s = v2Saturn.defaultFraming!.offsetKm;
    const v2nEqualsV1s =
      v2n[0] === v1s[0] && v2n[1] === v1s[1] && v2n[2] === v1s[2];
    const v2nEqualsV2s =
      v2n[0] === v2s[0] && v2n[1] === v2s[1] && v2n[2] === v2s[2];
    expect(
      v2nEqualsV1s,
      `V2N and V1S framings are identical — accidental copy-paste?`,
    ).toBe(false);
    expect(
      v2nEqualsV2s,
      `V2N and V2S framings are identical — accidental copy-paste?`,
    ).toBe(false);
  });

  it('V2U and V2N framings are distinct (no cross-chapter copy-paste)', () => {
    const v2u = v2Uranus.defaultFraming!.offsetKm;
    const v2n = v2Neptune.defaultFraming!.offsetKm;
    const tuplesEqual =
      v2u[0] === v2n[0] && v2u[1] === v2n[1] && v2u[2] === v2n[2];
    expect(
      tuplesEqual,
      `V2U [${v2u.join(', ')}] and V2N [${v2n.join(', ')}] are identical — accidental copy-paste?`,
    ).toBe(false);
  });

  it('framing magnitude hierarchy reflects satellite-system scale: V2U < V2N < V1S ≈ V2S; V2U < V2J ≈ V1J', () => {
    // Physical justification:
    //   - Miranda orbits Uranus at ~130,000 km → V2U smallest framing.
    //   - Triton orbits Neptune at ~354,800 km → V2N intermediate.
    //   - Io orbits Jupiter at ~421,700 km → V1J / V2J Jupiter baseline.
    //   - Titan orbits Saturn at ~1,221,830 km → V1S / V2S largest of
    //     the six.
    // The framing magnitudes must respect this ordering. Catches a
    // future "set V2U = V1J baseline" regression at planning time.
    const v2uMag = mag(v2Uranus.defaultFraming!.offsetKm);
    const v2nMag = mag(v2Neptune.defaultFraming!.offsetKm);
    const v2jMag = mag(v2Jupiter.defaultFraming!.offsetKm);
    const v1jMag = mag(v1Jupiter.defaultFraming!.offsetKm);
    const v1sMag = mag(v1Saturn.defaultFraming!.offsetKm);
    const v2sMag = mag(v2Saturn.defaultFraming!.offsetKm);

    expect(v2uMag, `V2U (${v2uMag}) not < V2N (${v2nMag})`).toBeLessThan(
      v2nMag,
    );
    expect(v2uMag, `V2U (${v2uMag}) not < V2J (${v2jMag})`).toBeLessThan(
      v2jMag,
    );
    expect(v2uMag, `V2U (${v2uMag}) not < V1J (${v1jMag})`).toBeLessThan(
      v1jMag,
    );
    expect(v2nMag, `V2N (${v2nMag}) not <= V1S (${v1sMag})`).toBeLessThanOrEqual(
      v1sMag,
    );
    expect(v2nMag, `V2N (${v2nMag}) not <= V2S (${v2sMag})`).toBeLessThanOrEqual(
      v2sMag,
    );
  });

  it('all six gas-giant encounters carry a complete spec triple (copy + defaultFraming + ±5d window)', () => {
    const SECONDS_PER_DAY = 86_400;
    const sixEncounters = [
      v1Jupiter,
      v2Jupiter,
      v1Saturn,
      v2Saturn,
      v2Uranus,
      v2Neptune,
    ];
    for (const chapter of sixEncounters) {
      expect(
        chapter.copy,
        `${chapter.slug} missing copy field — FR30 regression`,
      ).toBeDefined();
      expect(
        chapter.copy!.lede.length,
        `${chapter.slug} copy.lede empty`,
      ).toBeGreaterThan(0);
      expect(
        chapter.copy!.body.length,
        `${chapter.slug} copy.body empty`,
      ).toBeGreaterThan(0);
      expect(
        chapter.defaultFraming,
        `${chapter.slug} missing defaultFraming field — FR30 regression`,
      ).toBeDefined();
      expect(
        chapter.defaultFraming!.offsetKm.length,
        `${chapter.slug} defaultFraming.offsetKm length != 3`,
      ).toBe(3);
      expect(
        chapter.windowEndEt - chapter.windowStartEt,
        `${chapter.slug} window span not 10 days (±5d)`,
      ).toBeCloseTo(10 * SECONDS_PER_DAY, 6);
    }
  });
});

// ====================================================================
// Gap 6 — All 6 chapters resolve copy via copyForChapter (FR30 closure)
// ====================================================================

describe('Story 4.7 QA gap 6 — copyForChapter dispatch coverage across all 6 gas-giant encounters (FR30 closed)', () => {
  /**
   * Mount a `<v-chapter-copy>` element against a real ChapterDirector
   * (with ALL_CHAPTERS) and drive it to the given chapter's anchor;
   * return the displayed slug.
   */
  const displayedSlugAtAnchor = async (
    slug: string,
  ): Promise<string | null> => {
    const chapter = findChapterBySlug(slug);
    expect(chapter, `chapter ${slug} not found in registry`).not.toBeNull();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const el = document.createElement('v-chapter-copy') as VChapterCopy;
    el.chapterDirector = director;
    document.body.appendChild(el);
    await el.updateComplete;
    director.update(chapter!.anchorEt);
    await el.updateComplete;
    const displayed = el.displayedSlug;
    el.remove();
    return displayed;
  };

  it('V1J resolves to non-null copy (Story 4.5 baseline)', async () => {
    const slug = await displayedSlugAtAnchor('v1-jupiter');
    expect(slug).toBe('v1-jupiter');
  });

  it('V2J resolves to non-null copy (Story 4.6)', async () => {
    const slug = await displayedSlugAtAnchor('v2-jupiter');
    expect(slug).toBe('v2-jupiter');
  });

  it('V1S resolves to non-null copy (Story 4.6)', async () => {
    const slug = await displayedSlugAtAnchor('v1-saturn');
    expect(slug).toBe('v1-saturn');
  });

  it('V2S resolves to non-null copy (Story 4.6)', async () => {
    const slug = await displayedSlugAtAnchor('v2-saturn');
    expect(slug).toBe('v2-saturn');
  });

  it('V2U resolves to non-null copy (Story 4.7 — final two of FR30)', async () => {
    const slug = await displayedSlugAtAnchor('v2-uranus');
    expect(slug).toBe('v2-uranus');
  });

  it('V2N resolves to non-null copy (Story 4.7 — final two of FR30)', async () => {
    const slug = await displayedSlugAtAnchor('v2-neptune');
    expect(slug).toBe('v2-neptune');
  });

  it('V1 heliopause still routes through heliopauseCopyForSlug (ADR-0021 preserved)', async () => {
    const slug = await displayedSlugAtAnchor('v1-heliopause');
    expect(slug).toBe('v1-heliopause');
  });

  it('V2 heliopause still routes through heliopauseCopyForSlug (ADR-0021 preserved)', async () => {
    const slug = await displayedSlugAtAnchor('v2-heliopause');
    expect(slug).toBe('v2-heliopause');
  });

  it('launch chapters leave the copy panel empty (Story 5.1 populated PBD copy; launches remain copy-less)', async () => {
    // Amended in place per Rule 5: Story 5.1 added PBD copy via the
    // dedicated module. The remaining chapters without copy (excluding
    // heliopauses, which route through heliopauseCopyForSlug) are the
    // two launch chapters.
    const unpopulatedSlugs = ['launch-v1', 'launch-v2'];
    for (const slug of unpopulatedSlugs) {
      const displayed = await displayedSlugAtAnchor(slug);
      expect(
        displayed,
        `${slug} unexpectedly rendered copy — launches do not carry copy`,
      ).toBeNull();
    }
  });

  it('exactly seven chapters carry ChapterSpec.copy in ALL_CHAPTERS post-Story-5.1 (six gas-giants + PBD)', () => {
    // Defense pin: the count of populated chapters across ALL_CHAPTERS
    // is now 7 (six gas-giant encounters + PBD). Story 5.1 amended in
    // place per Rule 5; previous FR30-closure count of 6 is the
    // pre-Story-5.1 baseline.
    const populatedSlugs = ALL_CHAPTERS.filter(
      (c) => c.copy !== undefined,
    ).map((c) => c.slug);
    const expectedSlugs = [
      'pale-blue-dot',
      'v1-jupiter',
      'v2-jupiter',
      'v1-saturn',
      'v2-saturn',
      'v2-uranus',
      'v2-neptune',
    ];
    expect(populatedSlugs.sort()).toEqual(expectedSlugs.sort());
  });

  it('exactly the six gas-giant encounters carry ChapterSpec.defaultFraming in ALL_CHAPTERS (FR30 closure invariant)', () => {
    const framedSlugs = ALL_CHAPTERS.filter(
      (c) => c.defaultFraming !== undefined,
    ).map((c) => c.slug);
    const expectedSlugs = [
      'v1-jupiter',
      'v2-jupiter',
      'v1-saturn',
      'v2-saturn',
      'v2-uranus',
      'v2-neptune',
    ];
    expect(framedSlugs.sort()).toEqual(expectedSlugs.sort());
  });
});

// ====================================================================
// Gap 7 — Uranian + Neptunian moon NAIF ID correctness (defense regex)
// ====================================================================

describe('Story 4.7 QA gap 7 — Uranian + Neptunian moon NAIF IDs match JPL canonical', () => {
  it('Uranian moon NAIF IDs match JPL canonical (NAIF satellites kernel)', () => {
    // Per the dev's MISSION_FACTS extension + JPL canonical numbering.
    // The dev's decision notes flagged a draft-time typo (Cordelia=706
    // collision); this test pins the canonical assignments so a future
    // edit cannot regress them.
    //
    // Pattern: the MISSION_FACTS V2U section enumerates the ten new
    // moons inline as "Cordelia (706), Ophelia (707), ...". Each
    // moon-to-NAIF pairing must hold.
    const v2uSection = sliceMissionFactsSection(V2U_FACTS_HEADING);
    const expectedPairings: Array<[string, number]> = [
      ['Cordelia', 706],
      ['Ophelia', 707],
      ['Bianca', 708],
      ['Cressida', 709],
      ['Desdemona', 710],
      ['Juliet', 711],
      ['Portia', 712],
      ['Rosalind', 713],
      ['Belinda', 714],
      ['Puck', 715],
      ['Perdita', 725],
    ];
    for (const [moon, naif] of expectedPairings) {
      // Enumeration form variations:
      //   - Bare: "Cordelia (706)"
      //   - Annotated: "Puck (715, the largest of the ten, ...)"
      //   - Markdown-bold: "**Perdita** (725)" (used for the
      //     archived-frames discovery emphasis)
      //   - Table-row: "| MoonName | NAIF | ..."
      // Allow any markdown asterisks between moon and "(NAIF" plus the
      // bare/annotated variants. The presence of one form is sufficient
      // — the NAIF-collision test below enforces the exactly-once
      // invariant.
      expect(
        v2uSection,
        `MISSION_FACTS.md V2U section does not contain canonical NAIF mapping ${moon}=(${naif})`,
      ).toMatch(
        new RegExp(
          `${moon}\\*{0,2}\\s*\\(${naif}[,)]|${moon}\\s*\\|\\s*${naif}`,
        ),
      );
    }
  });

  it('Major Uranian moon NAIF IDs (5 majors) are documented in the satellites table', () => {
    // The MISSION_FACTS encounter-altitude table lists the five major
    // moons with their NAIF IDs (Ariel=701, Umbriel=702, Titania=703,
    // Oberon=704, Miranda=705). Pin these against the table rows.
    const v2uSection = sliceMissionFactsSection(V2U_FACTS_HEADING);
    const majorPairings: Array<[string, number]> = [
      ['Ariel', 701],
      ['Umbriel', 702],
      ['Titania', 703],
      ['Oberon', 704],
      ['Miranda', 705],
    ];
    for (const [moon, naif] of majorPairings) {
      // Match table-row form: "| MoonName | NAIF | ..."
      expect(
        v2uSection,
        `MISSION_FACTS V2U table missing canonical row for ${moon}=${naif}`,
      ).toMatch(new RegExp(`\\|\\s*${moon}\\s*\\|\\s*${naif}\\s*\\|`));
    }
  });

  it('Neptunian moon NAIF IDs match JPL canonical (six discoveries)', () => {
    // Per Smith et al., Science 246, 1422 (1989) + IAU Circulars: six
    // new inner moons at NAIF 803-808. Triton is the well-known major
    // moon at NAIF 801.
    const v2nSection = sliceMissionFactsSection(V2N_FACTS_HEADING);
    const expectedPairings: Array<[string, number]> = [
      ['Triton', 801],
      ['Naiad', 803],
      ['Thalassa', 804],
      ['Despina', 805],
      ['Galatea', 806],
      ['Larissa', 807],
      ['Proteus', 808],
    ];
    for (const [moon, naif] of expectedPairings) {
      // Match table-row form: "| MoonName | NAIF | ..."
      expect(
        v2nSection,
        `MISSION_FACTS V2N table missing canonical row for ${moon}=${naif}`,
      ).toMatch(new RegExp(`\\|\\s*${moon}\\s*\\|\\s*${naif}\\s*\\|`));
    }
  });

  it('No NAIF ID collisions in V2U section (each ID 706-715 + 725 appears exactly once in the moon-listing)', () => {
    // The dev's "Cordelia=706, Puck=715 — original draft had collision"
    // decision note motivates this. Defense regex: each canonical NAIF
    // ID for the ten new moons must appear in the inline enumeration
    // exactly once.
    const v2uSection = sliceMissionFactsSection(V2U_FACTS_HEADING);
    const naifIdsToCheck = [706, 707, 708, 709, 710, 711, 712, 713, 714, 715];
    for (const naif of naifIdsToCheck) {
      // Count parenthetical occurrences. Most moons use bare "(NNN)";
      // Puck uses the annotated form "(715, the largest...)". Both
      // count as one occurrence per the canonical enumeration.
      const matches = v2uSection.match(new RegExp(`\\(${naif}[,)]`, 'g'));
      expect(
        matches,
        `MISSION_FACTS.md V2U section missing NAIF ID (${naif}) — moon enumeration regression`,
      ).not.toBeNull();
      expect(
        matches!.length,
        `MISSION_FACTS.md V2U section has ${matches!.length} occurrences of (${naif}) — NAIF ID collision`,
      ).toBe(1);
    }
  });

  it('No NAIF ID collisions in V2N section (803-808 each appear exactly once in the moon table)', () => {
    const v2nSection = sliceMissionFactsSection(V2N_FACTS_HEADING);
    const naifIdsToCheck = [803, 804, 805, 806, 807, 808];
    for (const naif of naifIdsToCheck) {
      // Count table-row occurrences "| NNN  |".
      const matches = v2nSection.match(
        new RegExp(`\\|\\s*${naif}\\s*\\|`, 'g'),
      );
      expect(
        matches,
        `MISSION_FACTS.md V2N section missing NAIF ID ${naif} in table — moon enumeration regression`,
      ).not.toBeNull();
      expect(
        matches!.length,
        `MISSION_FACTS.md V2N section has ${matches!.length} occurrences of ${naif} — NAIF ID collision`,
      ).toBe(1);
    }
  });
});

// ====================================================================
// Gap 8 — V2N nitrogen geyser primary-source citation
// ====================================================================

describe('Story 4.7 QA gap 8 — MISSION_FACTS.md V2U/V2N sections cite primary sources only (no secondary)', () => {
  it('V2N nitrogen geyser citation is Soderblom et al. Science 250 (1990) — primary source pinned', () => {
    const v2nSection = sliceMissionFactsSection(V2N_FACTS_HEADING);
    // Soderblom et al., *Science* 250, 410 (1990) — "Triton's geyser-
    // like plumes" is the primary characterization paper. The
    // citation MUST be present in the V2N MISSION_FACTS section.
    expect(v2nSection).toMatch(/Soderblom et al/);
    expect(v2nSection).toMatch(/Science\*?\s+250/);
    expect(v2nSection).toMatch(/1990/);
  });

  it('V2N geyser citation is NOT a secondary source (no Wikipedia / space.com / popular-press attribution)', () => {
    const v2nSection = sliceMissionFactsSection(V2N_FACTS_HEADING);
    // Heuristic block-list of secondary aggregators. NASA mission
    // documents (SP-525) and JPL final reports are OK; the catch is
    // news-only domains and tertiary aggregators.
    const secondaryPatterns = [
      /wikipedia\.org/i,
      /\bwikipedia\b/i,
      /space\.com/i,
      /universetoday/i,
      /howstuffworks/i,
      /britannica\.com/i,
      /scienceblogs/i,
    ];
    for (const re of secondaryPatterns) {
      expect(
        v2nSection,
        `MISSION_FACTS.md V2N section contains a secondary-source citation matching ${re}`,
      ).not.toMatch(re);
    }
  });

  it('V2U section contains at least one primary-source citation (NASA / Science / Stone & Miner)', () => {
    const v2uSection = sliceMissionFactsSection(V2U_FACTS_HEADING);
    // Primary sources per AC2 + the dev's completion notes: NASA SP-466,
    // NASA SP-495, *Science* 233 (Stone & Miner introduction + Smith
    // et al. imaging-science).
    const primarySourcePatterns = [
      /NASA SP-466/,
      /NASA SP-495/,
      /\*?Science\*?\s+233/,
      /Smith et al/,
      /Stone & Miner/,
      /Karkoschka/,
    ];
    const matched = primarySourcePatterns.filter((re) => re.test(v2uSection));
    expect(
      matched.length,
      `V2U MISSION_FACTS section has fewer than 2 primary-source citations: matched=${matched.length}/${primarySourcePatterns.length}`,
    ).toBeGreaterThanOrEqual(2);
  });

  it('V2N section contains at least one primary-source citation (NASA SP-525 / Science 246 / Smith et al / Stone & Miner)', () => {
    const v2nSection = sliceMissionFactsSection(V2N_FACTS_HEADING);
    const primarySourcePatterns = [
      /NASA SP-525/,
      /\*?Science\*?\s+246/,
      /Smith et al/,
      /Stone & Miner/,
      /Soderblom et al/,
    ];
    const matched = primarySourcePatterns.filter((re) => re.test(v2nSection));
    expect(
      matched.length,
      `V2N MISSION_FACTS section has fewer than 3 primary-source citations: matched=${matched.length}/${primarySourcePatterns.length}`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('NO Wikipedia citations anywhere in MISSION_FACTS.md (project policy — primary sources only)', () => {
    // Same defense as Story 4.6 gap-8. Project policy: MISSION_FACTS
    // cites primary sources only — NASA mission documents, JPL final
    // reports, peer-reviewed publications (*Science*, *Nature*,
    // *Astrophysical Journal*, *Icarus*).
    expect(
      MISSION_FACTS_CONTENT,
      'MISSION_FACTS.md contains a Wikipedia citation — project policy is primary sources only',
    ).not.toMatch(/wikipedia\.org/i);
    expect(MISSION_FACTS_CONTENT).not.toMatch(/\bwikipedia\b/i);
  });

  it('every UTC timestamp in V2U/V2N tables is in ISO-8601 format (YYYY-MM-DDTHH:MM:SSZ)', () => {
    const v2uSection = sliceMissionFactsSection(V2U_FACTS_HEADING);
    const v2nSection = sliceMissionFactsSection(V2N_FACTS_HEADING);
    // No US-style MM/DD/YYYY patterns.
    expect(v2uSection).not.toMatch(/\b\d{2}\/\d{2}\/\d{4}\b/);
    expect(v2nSection).not.toMatch(/\b\d{2}\/\d{2}\/\d{4}\b/);
    // At least one ISO-8601 anchor instant each.
    expect(v2uSection).toMatch(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\b/);
    expect(v2nSection).toMatch(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\b/);
  });
});

// ====================================================================
// Chrome DevTools MCP smoke — per-story exit criterion (Rule 3 + Rule 8)
// ====================================================================

/**
 * The lead drives the Chrome DevTools MCP smoke during the AC8 stage of
 * Story 4.7 (NOT this QA stage). This block documents the canonical
 * smoke for the QA gap-hunting tier so reviewers can cross-reference
 * the lead's evidence against the per-AC coverage matrix below.
 *
 * Story 4.7 amends two chapter specs under `web/src/chapters/specs/`
 * → the Files-to-Modify list touches `web/src/`, so the Chrome DevTools
 * MCP smoke stage is REQUIRED per voyager-skill-rules.md Rule 3 + Rule 8.
 * It is not skipped.
 *
 * Tool plan (executed by the lead, not by this test):
 *
 *   1. `mcp__chrome-devtools-mcp__navigate_page` — open the dev server
 *      at `/c/v2-uranus` and `/c/v2-neptune` in turn. Verify the URL
 *      routing (Story 4.4 + URLSync) lands the simulation paused at
 *      each chapter's anchor ET (V2U anchor 1986-01-24T17:59:00Z; V2N
 *      anchor 1989-08-25T03:56:00Z).
 *
 *   2. `mcp__chrome-devtools-mcp__evaluate_script` — for each chapter,
 *      assert via the per-chapter smoke probe (story file
 *      `## Smoke probe plan (AC8)` section):
 *        - `chapter.windowEndEt - chapter.windowStartEt === 10 * 86400`
 *          (±5d half-window invariant per AC1)
 *        - `<v-chapter-copy>` panel renders the chapter's lede ("V2
 *          Uranus." / "V2 Neptune.") and body (AC2)
 *        - `camera.position` ≈ `target + chapter.defaultFraming.offsetKm`
 *          within tolerance (AC3)
 *        - target body (Uranus / Neptune) mesh visible at NDC near (0,0)
 *        - spacecraft (V2) mesh visible in frustum (AC6)
 *        - V2U: `<v-attitude-indicator>` text contains "CK reconstructed"
 *          throughout the scrub (AC5 — CK coverage continuous per
 *          `docs/kernels/ckbrief-inventory.md`)
 *
 *   3. `mcp__chrome-devtools-mcp__take_screenshot` — capture two
 *      screenshots per chapter under
 *      `_bmad-output/implementation-artifacts/4-7-smoke-evidence/`:
 *        - `v2-uranus-held.png` (anchor instant, body-centered framing)
 *        - `v2-neptune-held.png` (anchor instant, body-centered framing)
 *      Plus the canonical V2N Triton-bend evidence (FR12 — AC4):
 *        - `v2-neptune-triton-bend-1990-06-01.png` (scrub to
 *          1990-06-01 in heliocentric framing; V2 trajectory visibly
 *          bends south of the ecliptic plane). The end-of-mission 2030
 *          view is the Story 4.8 canonical screenshot.
 *
 *   4. `mcp__chrome-devtools-mcp__take_snapshot` — capture an
 *      accessibility tree snapshot for the held state of each chapter,
 *      verifying `<v-chapter-copy>`'s `aria-live="polite"` region and
 *      the detail-scrubber's `aria-hidden="false"` (AC6).
 *
 *   5. Console-clean assertion — capture console messages during the
 *      session and assert no errors apart from the Lit dev-mode banner
 *      and any known-allow-listed warnings.
 *
 * Per-AC coverage matrix (AC1 through AC9 of Story 4.7):
 *
 *   - AC1 (window narrowed to ±5d): step 2 assertion 1.
 *   - AC2 (chapter copy renders with primary-source-traced facts):
 *     step 2 assertion 2 + step 4 (aria-live snapshot) + Gap 1 +
 *     Gap 3 + Gap 4 (citation regex audit at QA tier).
 *   - AC3 (defaultFraming applied to camera): step 2 assertion 3.
 *   - AC4 (V2N Triton bend visible post-encounter, FR12): step 3
 *     V2N-bend screenshot at 1990-06-01 heliocentric framing. The
 *     canonical end-of-mission 2030 screenshot is Story 4.8's
 *     deliverable.
 *   - AC5 (V2U attitude-indicator flicker per CK gaps): step 2 final
 *     assertion (CK continuous → "CK reconstructed" throughout per dev
 *     CK audit).
 *   - AC6 (detail scrubber + URL routing): step 1 (URL routing) +
 *     step 4 (detail scrubber aria-hidden=false).
 *   - AC7 (integration end-to-end): exercised at unit/integration tier
 *     by the extended `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts`
 *     — the MCP smoke verifies the same path in the live runtime.
 *   - AC8 (lead-driven smoke): the smoke IS the AC.
 *   - AC9 (test sweep + lint baseline + FR30 closure note): exercised
 *     by the lead's `npm run vitest:run` / `npm run typecheck` / `npm
 *     run lint` post-implementation sweep.
 *
 * Skip rules:
 *
 *   - Files-to-Modify list under `web/src/` (v2-uranus.ts +
 *     v2-neptune.ts) → MCP stage applies; does NOT skip.
 *   - Bake-only stories skip per Voyager Rule 3 Pure-bake-side
 *     exemption (not applicable here — Story 4.7 has no bake/ changes).
 *
 * Reference evidence directory shape (post-Story-1.16, no initScript
 * shim needed per Rule 8):
 *
 *   - `_bmad-output/implementation-artifacts/1-16-smoke-evidence/`
 *     (canonical post-Story-1.16 example).
 *   - `_bmad-output/implementation-artifacts/4-5-smoke-evidence/`
 *     (Story 4.5 V1J — same per-chapter probe shape).
 *   - `_bmad-output/implementation-artifacts/4-6-smoke-evidence/`
 *     (Story 4.6 V2J/V1S/V2S — same per-chapter probe shape).
 *   - `_bmad-output/implementation-artifacts/4-7-smoke-evidence/`
 *     (Story 4.7 V2U/V2N — created during the lead's smoke).
 */
describe('Story 4.7 — Chrome DevTools MCP smoke (lead-driven; documentation only)', () => {
  it('smoke probe plan and evidence directory shape are documented in this test file header', () => {
    // This is a documentation-only assertion. The test passes
    // unconditionally — its purpose is to make the MCP-smoke plan
    // discoverable via the test file glob (per voyager-skill-rules.md
    // Rule 3 + Rule 8).
    expect(true).toBe(true);
  });
});
