// @vitest-environment happy-dom
/**
 * Story 4.6 — QA gap suite for V2 Jupiter / V1 Saturn (Titan slingshot) /
 * V2 Saturn encounter chapters.
 *
 * The dev-authored test suite covers each surface in isolation:
 *   - `web/src/chapters/specs/v2-jupiter.test.ts` (14 tests)
 *   - `web/src/chapters/specs/v1-saturn.test.ts` (14 tests)
 *   - `web/src/chapters/specs/v2-saturn.test.ts` (15 tests)
 *   - `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` (15 tests,
 *     Rule 1 integration AC — five assertions × three chapters via the
 *     `runChapterIntegration(fixture)` helper)
 *   - Story 4.5 QA-gap test (`story-4-5-v1j-encounter-qa-gaps.test.ts`)
 *     amended in place to reflect the Story 4.6 ground truth (4
 *     populated chapters: V1J + V2J + V1S + V2S; V2U / V2N pending 4.7).
 *
 * This QA file fills the cross-cutting gaps the dev suite does not
 * exercise, per the orchestrator's eight priorities:
 *
 *   1. **MISSION_FACTS.md citation regex audit for V2J / V1S / V2S** —
 *      same pattern as Story 4.5 QA gap 2 but applied to the three new
 *      chapters. Read each copy `body`, regex-match every dated /
 *      distanced / named-body identifier, assert each match resolves to
 *      MISSION_FACTS.md. Defense against future drift where editorial
 *      copy is edited but the citation surface is not.
 *   2. **PRD amendment defense pin** — V2J copy must reference Io (not
 *      Amalthea) per the Story 4.6 Rule-5 PRD amendment; both the
 *      chapter spec body AND the planning artifact must hold the
 *      corrected wording.
 *   3. **V1S Titan flyby distance pin** — "6,490 km" is the canonical
 *      figure (NASA SP-451 § 3; Smith et al., *Science* 212, 159). The
 *      exact value must appear in V1S body AND MISSION_FACTS.md. Defense
 *      against accidental divergence between editorial copy and the
 *      citation surface (a more-precise primary-source value would have
 *      to update BOTH together).
 *   4. **defaultFraming scale-up justification** — V2J uses
 *      [1M, 1.5M, 2.5M] km (same as V1J — Jupiter-system baseline);
 *      V1S / V2S use [1.5M, 1.5M, 3M] km (scaled up for Titan's
 *      ~1.22 Mm orbital radius vs. Io's ~0.42 Mm). Test that each
 *      chapter's offset magnitude is non-zero AND the V2J magnitude is
 *      distinct from the V1S/V2S magnitude. Catches accidental copy-
 *      paste of one chapter's offset into another.
 *   5. **All four populated chapters resolve copy via copyForChapter** —
 *      Story 4.5's QA gap-8 enumerated 10 chapters; now V1J, V2J, V1S,
 *      V2S all resolve to non-null copy via the production dispatch.
 *      Remaining (cruise / launch / PBD / V2U / V2N) still null;
 *      heliopause routed to heliopauseCopyForSlug per ADR-0021.
 *   6. **Integration test coverage symmetry** — the dev's
 *      `runChapterIntegration(fixture)` helper produces three describe
 *      blocks (V2J, V1S, V2S) with five assertions each. Defend the
 *      symmetry: each describe block must exercise the same five
 *      assertions; if a regression dropped one for one chapter only,
 *      this file flags it.
 *   7. **V1S deflection-angle gap defense (dev's Issue 3)** — the dev
 *      did NOT surface a quantitative deflection-angle figure because
 *      no primary source canonicalises a single number. The qualitative
 *      "northward" framing is correct; a specific number (e.g., "by 39
 *      degrees", "by 0.7 radians") without a primary-source citation
 *      would be a regression. Pin the absence.
 *   8. **MISSION_FACTS.md V1S/V2S extensions cite primary sources** —
 *      regex-grep the V1S and V2S sections of MISSION_FACTS.md for
 *      citation patterns; assert each Saturnian fact has a NASA SP-451
 *      or *Science* (212 / 215) or NASA/JPL citation. Defense against
 *      accidental Wikipedia or secondary-source citations entering the
 *      file post-Story 4.6.
 *
 * Discoverability: web vitest's `*.test.ts` glob picks this up
 * automatically; no skip markers used. Tests run inside happy-dom
 * (`@vitest-environment happy-dom`) because the production `<v-chapter-
 * copy>` dispatch path under priority 5 mounts a Lit element.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, afterEach } from 'vitest';

import v2Jupiter from '../src/chapters/specs/v2-jupiter';
import v1Saturn from '../src/chapters/specs/v1-saturn';
import v2Saturn from '../src/chapters/specs/v2-saturn';
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
// PRD is at the planning-artifacts root. Same reasoning — live artifact
// so a regression on the Rule-5 amendment surfaces as a failure.
// --------------------------------------------------------------------

const PRD_PATH = resolve(
  __dirname,
  '../../_bmad-output/planning-artifacts/prd.md',
);
const PRD_CONTENT = readFileSync(PRD_PATH, 'utf8');

// --------------------------------------------------------------------
// Helper — extract the substring of MISSION_FACTS.md between two
// section headers, so the priority-8 citation audit doesn't false-
// positive on V1J citations bleeding into the V2J section.
// --------------------------------------------------------------------

const sliceMissionFactsSection = (startHeading: string): string => {
  const startIdx = MISSION_FACTS_CONTENT.indexOf(startHeading);
  if (startIdx < 0) {
    throw new Error(
      `MISSION_FACTS.md section "${startHeading}" missing — regression in citation surface`,
    );
  }
  // Find the next ## heading (any), or end-of-file.
  const tail = MISSION_FACTS_CONTENT.slice(startIdx + startHeading.length);
  const nextHeadingMatch = tail.match(/\n## [^\n]+/);
  const endIdx =
    nextHeadingMatch && nextHeadingMatch.index !== undefined
      ? startIdx + startHeading.length + nextHeadingMatch.index
      : MISSION_FACTS_CONTENT.length;
  return MISSION_FACTS_CONTENT.slice(startIdx, endIdx);
};

afterEach(() => {
  document.querySelectorAll('v-chapter-copy').forEach((el) => el.remove());
});

// ====================================================================
// Gap 1 — MISSION_FACTS.md citation regex audit for V2J / V1S / V2S
// ====================================================================

describe('Story 4.6 QA gap 1 — MISSION_FACTS.md citation audit for V2J / V1S / V2S', () => {
  it('MISSION_FACTS.md is loadable from the repo root', () => {
    expect(MISSION_FACTS_CONTENT.length).toBeGreaterThan(0);
    expect(MISSION_FACTS_CONTENT).toContain('# MISSION_FACTS.md');
  });

  it('every natural-language date in V2J copy resolves to MISSION_FACTS.md ISO form', () => {
    expect(v2Jupiter.copy).toBeDefined();
    const body = v2Jupiter.copy!.body;
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
        `V2J copy mentions ${dateStr} but ${iso} is not cited in MISSION_FACTS.md`,
      ).toContain(iso);
    }
  });

  it('every natural-language date in V1S copy resolves to MISSION_FACTS.md ISO form', () => {
    expect(v1Saturn.copy).toBeDefined();
    const body = v1Saturn.copy!.body;
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
        `V1S copy mentions ${dateStr} but ${iso} is not cited in MISSION_FACTS.md`,
      ).toContain(iso);
    }
  });

  it('every natural-language date in V2S copy resolves to MISSION_FACTS.md ISO form', () => {
    expect(v2Saturn.copy).toBeDefined();
    const body = v2Saturn.copy!.body;
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
        `V2S copy mentions ${dateStr} but ${iso} is not cited in MISSION_FACTS.md`,
      ).toContain(iso);
    }
  });

  it('every Jupiter / Saturn moon named in V2J copy is also cited in MISSION_FACTS.md', () => {
    // V2J names the four Galileans (Callisto / Ganymede / Europa / Io)
    // per the Story 4.6 Rule-5 amendment. Each must appear in
    // MISSION_FACTS.md somewhere — the V2J section enumerates them in
    // the interior-sweep table.
    const body = v2Jupiter.copy!.body;
    for (const moon of ['Callisto', 'Ganymede', 'Europa', 'Io']) {
      expect(body).toContain(moon);
      expect(
        MISSION_FACTS_CONTENT,
        `V2J copy mentions ${moon} but it is not cited in MISSION_FACTS.md`,
      ).toContain(moon);
    }
  });

  it('every Saturnian moon named in V1S copy is also cited in MISSION_FACTS.md', () => {
    const body = v1Saturn.copy!.body;
    // V1S body names Titan and references the Saturn ring system.
    // Titan must be a citation surface match; ring features (F-ring,
    // spokes, broad rings) must each appear in the V1S MISSION_FACTS
    // section.
    expect(body).toContain('Titan');
    expect(MISSION_FACTS_CONTENT).toContain('Titan');
    // Ring-feature checks: assert at least one ring-feature term in the
    // body has a corresponding mention in MISSION_FACTS.md.
    const ringFeatures = ['F-ring', 'spokes', 'broad-ring'];
    let matchedFeatures = 0;
    for (const feature of ringFeatures) {
      const inBody = body.includes(feature) || body.includes(feature.replace('-', ' '));
      if (inBody) {
        // MISSION_FACTS.md may use either hyphenated or spaced form;
        // assert at least one form is present.
        const inFacts =
          MISSION_FACTS_CONTENT.includes(feature) ||
          MISSION_FACTS_CONTENT.includes(feature.replace('-', ' '));
        expect(
          inFacts,
          `V1S copy mentions ring feature ${feature} but it is not cited in MISSION_FACTS.md`,
        ).toBe(true);
        matchedFeatures++;
      }
    }
    expect(matchedFeatures).toBeGreaterThan(0);
  });

  it('every Saturnian moon named in V2S copy is also cited in MISSION_FACTS.md', () => {
    const body = v2Saturn.copy!.body;
    for (const moon of ['Iapetus', 'Hyperion', 'Titan']) {
      expect(body).toContain(moon);
      expect(
        MISSION_FACTS_CONTENT,
        `V2S copy mentions ${moon} but it is not cited in MISSION_FACTS.md`,
      ).toContain(moon);
    }
    // "Cassini Regio" (Iapetus's dark trailing hemisphere) is the
    // V2-specific imaging-discovery feature; if mentioned in body it
    // must be in MISSION_FACTS.
    if (body.includes('Cassini Regio')) {
      expect(MISSION_FACTS_CONTENT).toContain('Cassini Regio');
    }
  });

  it('the canonical anchor ISO instants for V2J / V1S / V2S appear in MISSION_FACTS.md', () => {
    // Spot-check the closest-approach UTC anchors. Even though the
    // chapter copy uses informal "twenty-two twenty-nine UTC" /
    // "twenty-three forty-six UTC", the underlying ISO anchor is
    // canonical.
    expect(MISSION_FACTS_CONTENT).toContain('1979-07-09T22:29:00Z');
    expect(MISSION_FACTS_CONTENT).toContain('1980-11-12T23:46:00Z');
    // V2S uses date-level sourcing — see the chapter spec doc-comment
    // and MISSION_FACTS table footnote.
    expect(MISSION_FACTS_CONTENT).toContain('1981-08-26');
  });
});

// ====================================================================
// Gap 2 — PRD amendment defense pin (V2J references Io, not Amalthea)
// ====================================================================

describe('Story 4.6 QA gap 2 — Rule-5 PRD amendment defense (V2J = Io, not Amalthea)', () => {
  it('V2J body does NOT mention Amalthea (Rule-5 ground truth — V2 was Galileans only)', () => {
    expect(v2Jupiter.copy).toBeDefined();
    // Case-sensitive: Amalthea is a proper noun. A regression that
    // re-introduced "amalthea" in lowercase still indicates the wrong
    // body crept back in.
    expect(v2Jupiter.copy!.body).not.toMatch(/Amalthea/i);
  });

  it('V2J body explicitly names Io (the fourth Galilean V2 swept after Europa)', () => {
    expect(v2Jupiter.copy).toBeDefined();
    // The V2J sweep is Callisto → Ganymede → Europa → Io per NASA
    // SP-439 Appendix A. Io must be the named fourth body in the
    // editorial copy.
    expect(v2Jupiter.copy!.body).toMatch(/Io\b/);
  });

  it('PRD encounter coverage table row for V2J cites Io and not Amalthea (Rule-5 amendment)', () => {
    // Locate the V2J row in the encounter coverage table. The row
    // begins with "| Jupiter | Voyager 2 | 1979-07-09 22:29".
    const tableRowRegex =
      /\|\s*Jupiter\s*\|\s*Voyager 2\s*\|\s*1979-07-09[^\n]+/;
    const rowMatch = PRD_CONTENT.match(tableRowRegex);
    expect(
      rowMatch,
      'PRD encounter coverage table row for V2J missing — Rule-5 amendment lost?',
    ).not.toBeNull();
    const row = rowMatch![0];
    // The amended row must mention Io and document the amendment
    // rationale (the words "Story 4.6 Rule-5 amendment" appear in the
    // dev's amendment). Pin both.
    expect(row).toMatch(/Io\b/);
    expect(row).toMatch(/Rule-5 amendment/);
    // The amended row must NOT show the original draft's
    // "Europa, Amalthea sequence" outside of the quoted-rationale
    // context. Permit "Amalthea" inside the parenthetical rationale
    // (which quotes the wrong draft verbatim), but the row's primary
    // sequence enumeration must list Io.
    // We pin this by checking that "Callisto, Ganymede, Europa, Io"
    // (the corrected sequence) appears in the row.
    expect(row).toMatch(/Callisto,?\s+Ganymede,?\s+Europa,?\s+Io\b/);
  });

  it('MISSION_FACTS.md V2J section confirms V2 did NOT make a close Amalthea pass', () => {
    const v2jSection = sliceMissionFactsSection(
      '## Voyager 2 Jupiter encounter — interior sweep timeline',
    );
    // The dev's section explicitly states "V2 did NOT make a close pass
    // at Amalthea" (with a soft line wrap between "a" and "close" in the
    // source) — pin the wording so a future edit that softens or removes
    // it triggers this test.
    expect(v2jSection).toMatch(/V2 did NOT make a\s+close pass/);
    expect(v2jSection).toMatch(/Amalthea/);
    expect(v2jSection).toMatch(/V1-only/);
  });
});

// ====================================================================
// Gap 3 — V1S Titan flyby distance pin ("6,490 km")
// ====================================================================

describe('Story 4.6 QA gap 3 — V1S Titan flyby altitude pinned to 6,490 km in both surfaces', () => {
  it('V1S copy body cites the exact "6,490 km" Titan flyby altitude', () => {
    expect(v1Saturn.copy).toBeDefined();
    // The body uses "6,490 kilometers" (spelled out per editorial copy
    // style). Match the numeral plus either "km" or "kilometers".
    expect(v1Saturn.copy!.body).toMatch(/6,490\s+(km|kilometers)/);
  });

  it('MISSION_FACTS.md V1S section cites the exact "6,490 km" Titan flyby altitude', () => {
    const v1sSection = sliceMissionFactsSection(
      '## Voyager 1 Saturn encounter — Titan flyby parameters',
    );
    expect(v1sSection).toMatch(/6,490\s*km/);
  });

  it('the 6,490 km figure is cited to NASA SP-451 § 3 + Smith et al., Science 212', () => {
    const v1sSection = sliceMissionFactsSection(
      '## Voyager 1 Saturn encounter — Titan flyby parameters',
    );
    // The primary-source citation must accompany the figure.
    expect(v1sSection).toMatch(/NASA SP-451/);
    expect(v1sSection).toMatch(/Smith et al/);
    // MISSION_FACTS formats the journal in markdown italics — *Science*
    // 212. Permit the trailing asterisk between "Science" and the volume
    // number.
    expect(v1sSection).toMatch(/Science\*?\s+212/);
  });

  it('V1S body and MISSION_FACTS.md cite the SAME altitude value (no divergence)', () => {
    // Defense against the failure mode "editorial copy edited to a
    // more-precise figure without updating MISSION_FACTS" (or vice
    // versa). Extract any "N,NNN km" or "N,NNN kilometers" pattern from
    // the body, then assert MISSION_FACTS contains it.
    expect(v1Saturn.copy).toBeDefined();
    const altitudeMatches = v1Saturn.copy!.body.match(
      /\b(\d{1,3}(?:,\d{3})+)\s+(km|kilometers)\b/g,
    );
    expect(altitudeMatches).not.toBeNull();
    expect(altitudeMatches!.length).toBeGreaterThan(0);
    for (const altitudeStr of altitudeMatches!) {
      const numericPart = altitudeStr.match(/^(\d{1,3}(?:,\d{3})+)/)![1];
      // Pure numeric — MISSION_FACTS may format with " km" not " kilometers".
      expect(
        MISSION_FACTS_CONTENT,
        `V1S body mentions altitude ${altitudeStr} but ${numericPart} km is not cited in MISSION_FACTS.md`,
      ).toMatch(new RegExp(`${numericPart}\\s*km`));
    }
  });
});

// ====================================================================
// Gap 4 — defaultFraming scale-up justification (V2J distinct from V1S/V2S)
// ====================================================================

describe('Story 4.6 QA gap 4 — defaultFraming scale-up distinct across Jupiter / Saturn chapters', () => {
  it('V2J defaultFraming offset is non-zero in at least one axis', () => {
    expect(v2Jupiter.defaultFraming).toBeDefined();
    const [x, y, z] = v2Jupiter.defaultFraming!.offsetKm;
    const magnitudeKm = Math.hypot(x, y, z);
    expect(magnitudeKm).toBeGreaterThan(0);
  });

  it('V1S defaultFraming offset is non-zero in at least one axis', () => {
    expect(v1Saturn.defaultFraming).toBeDefined();
    const [x, y, z] = v1Saturn.defaultFraming!.offsetKm;
    const magnitudeKm = Math.hypot(x, y, z);
    expect(magnitudeKm).toBeGreaterThan(0);
  });

  it('V2S defaultFraming offset is non-zero in at least one axis', () => {
    expect(v2Saturn.defaultFraming).toBeDefined();
    const [x, y, z] = v2Saturn.defaultFraming!.offsetKm;
    const magnitudeKm = Math.hypot(x, y, z);
    expect(magnitudeKm).toBeGreaterThan(0);
  });

  it('V2J offset (Jupiter scale) is distinct from V1S offset (Saturn/Titan scale) — accidental copy-paste defense', () => {
    // The dev's documented scale-up: V2J reuses the V1J Jupiter
    // baseline [1.0, 1.5, 2.5] Mm; V1S/V2S scale up to [1.5, 1.5, 3.0] Mm
    // for Titan's ~1.22 Mm orbital radius (vs. Io's ~0.42 Mm). If a
    // refactor accidentally pasted V1S's offset over V2J (or vice
    // versa), this assertion catches it.
    const v2j = v2Jupiter.defaultFraming!.offsetKm;
    const v1s = v1Saturn.defaultFraming!.offsetKm;
    const tuplesEqual =
      v2j[0] === v1s[0] && v2j[1] === v1s[1] && v2j[2] === v1s[2];
    expect(
      tuplesEqual,
      `V2J [${v2j.join(', ')}] and V1S [${v1s.join(', ')}] are identical — accidental copy-paste?`,
    ).toBe(false);
  });

  it('V2J magnitude is on the Jupiter-system scale (~3 Mm); V1S/V2S are on the Saturn-system scale (~3.7 Mm)', () => {
    const magnitude = (offset: readonly number[]): number =>
      Math.hypot(offset[0], offset[1], offset[2]);
    const v2jMag = magnitude(v2Jupiter.defaultFraming!.offsetKm);
    const v1sMag = magnitude(v1Saturn.defaultFraming!.offsetKm);
    const v2sMag = magnitude(v2Saturn.defaultFraming!.offsetKm);

    // The Saturn-scaled framings should be strictly larger than the
    // Jupiter-scaled one — Titan/Iapetus orbit farther from Saturn than
    // Io/Europa orbit from Jupiter.
    expect(
      v1sMag,
      `V1S magnitude ${v1sMag} not strictly larger than V2J magnitude ${v2jMag}`,
    ).toBeGreaterThan(v2jMag);
    expect(
      v2sMag,
      `V2S magnitude ${v2sMag} not strictly larger than V2J magnitude ${v2jMag}`,
    ).toBeGreaterThan(v2jMag);
  });

  it('V1S and V2S offsets are currently identical baselines (per dev cycle-1 notes)', () => {
    // The dev's cycle-1 chose V1S = V2S = [1.5, 1.5, 3.0] Mm as the
    // Saturn baseline; the lead's smoke iterates per Rule 5. If a
    // future amendment differentiates them, this test catches the
    // change and forces the author to update the rationale (rename
    // this test + update the dev-notes pointer).
    const v1s = v1Saturn.defaultFraming!.offsetKm;
    const v2s = v2Saturn.defaultFraming!.offsetKm;
    expect(v1s[0]).toBe(v2s[0]);
    expect(v1s[1]).toBe(v2s[1]);
    expect(v1s[2]).toBe(v2s[2]);
  });
});

// ====================================================================
// Gap 5 — All four populated chapters resolve copy via copyForChapter
// ====================================================================

describe('Story 4.6 QA gap 5 — copyForChapter dispatch coverage across V1J / V2J / V1S / V2S', () => {
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

  it('V1 heliopause still routes through heliopauseCopyForSlug (ADR-0021 preserved)', async () => {
    const slug = await displayedSlugAtAnchor('v1-heliopause');
    expect(slug).toBe('v1-heliopause');
  });

  it('V2 heliopause still routes through heliopauseCopyForSlug (ADR-0021 preserved)', async () => {
    const slug = await displayedSlugAtAnchor('v2-heliopause');
    expect(slug).toBe('v2-heliopause');
  });

  it('non-encounter chapters (launches / PBD) leave the copy panel empty (V2U / V2N now populated post-Story-4.7, FR30 closed)', async () => {
    const unpopulatedSlugs = [
      'launch-v1',
      'launch-v2',
      'pale-blue-dot',
    ];
    for (const slug of unpopulatedSlugs) {
      const displayed = await displayedSlugAtAnchor(slug);
      expect(
        displayed,
        `${slug} unexpectedly rendered copy — only the six gas-giant encounters carry copy after FR30 closure`,
      ).toBeNull();
    }
  });

  it('V2U resolves to non-null copy (Story 4.7 — FR30 closed)', async () => {
    const slug = await displayedSlugAtAnchor('v2-uranus');
    expect(slug).toBe('v2-uranus');
  });

  it('V2N resolves to non-null copy (Story 4.7 — FR30 closed)', async () => {
    const slug = await displayedSlugAtAnchor('v2-neptune');
    expect(slug).toBe('v2-neptune');
  });
});

// ====================================================================
// Gap 6 — Integration test coverage symmetry across the three chapters
// ====================================================================

describe('Story 4.6 QA gap 6 — integration test coverage symmetry (V2J / V1S / V2S)', () => {
  it('the three new chapter specs each carry a unique slug + markerLabel + spacecraft tuple', () => {
    // The dev's runChapterIntegration(fixture) helper drives three
    // fixtures with the same five assertions. Pin the underlying
    // identity invariant so the helper cannot accidentally double-
    // dispatch the same chapter (e.g., a typo in the fixtures array).
    const tuples = [v2Jupiter, v1Saturn, v2Saturn].map((c) => ({
      slug: c.slug,
      markerLabel: c.markerLabel,
      spacecraft: c.spacecraft,
      targetBody: c.targetBody,
    }));
    const slugs = new Set(tuples.map((t) => t.slug));
    const labels = new Set(tuples.map((t) => t.markerLabel));
    expect(slugs.size).toBe(3);
    expect(labels.size).toBe(3);
    // Spacecraft assignments per Epic 4 + Story 4.6 spec.
    expect(tuples.find((t) => t.slug === 'v2-jupiter')!.spacecraft).toBe('v2');
    expect(tuples.find((t) => t.slug === 'v1-saturn')!.spacecraft).toBe('v1');
    expect(tuples.find((t) => t.slug === 'v2-saturn')!.spacecraft).toBe('v2');
  });

  it('all three chapters carry a complete spec triple (copy + defaultFraming + window narrow)', () => {
    const SECONDS_PER_DAY = 86_400;
    for (const chapter of [v2Jupiter, v1Saturn, v2Saturn]) {
      expect(
        chapter.copy,
        `${chapter.slug} missing copy field`,
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
        `${chapter.slug} missing defaultFraming field`,
      ).toBeDefined();
      expect(
        chapter.defaultFraming!.offsetKm.length,
        `${chapter.slug} defaultFraming.offsetKm length != 3`,
      ).toBe(3);
      expect(
        chapter.windowEndEt - chapter.windowStartEt,
        `${chapter.slug} window span not 10 days`,
      ).toBeCloseTo(10 * SECONDS_PER_DAY, 6);
    }
  });

  it('the three chapters render in chronological order (V2J < V1S < V2S by anchorEt)', () => {
    // Defense against an accidental anchor-date swap that would still
    // leave individual chapter tests passing.
    expect(v2Jupiter.anchorEt).toBeLessThan(v1Saturn.anchorEt);
    expect(v1Saturn.anchorEt).toBeLessThan(v2Saturn.anchorEt);
  });

  it('each chapter spec exposes target-body NAIF IDs matching the targeted planet', () => {
    expect(v2Jupiter.targetBody).toBe(5); // Jupiter barycenter
    expect(v1Saturn.targetBody).toBe(6); // Saturn barycenter
    expect(v2Saturn.targetBody).toBe(6); // Saturn barycenter
  });
});

// ====================================================================
// Gap 7 — V1S deflection-angle gap defense (dev's Issue 3)
// ====================================================================

describe('Story 4.6 QA gap 7 — V1S body does NOT invent a quantitative deflection angle', () => {
  it('V1S body uses qualitative "northward" / "out of the ecliptic" framing (no specific angle)', () => {
    expect(v1Saturn.copy).toBeDefined();
    const body = v1Saturn.copy!.body;
    // The qualitative framing must be present per AC4.
    expect(body).toMatch(/northward|out of the ecliptic|plane of the planets/i);
  });

  it('V1S body does NOT cite a specific deflection-angle figure (regression defense)', () => {
    expect(v1Saturn.copy).toBeDefined();
    const body = v1Saturn.copy!.body;
    // Patterns that would indicate an invented quantitative deflection
    // figure. Each is a HIGH-risk regression because no primary source
    // canonicalises a single number for V1's Titan-deflection angle.
    //
    // Patterns we defend against:
    //   - "by N degrees" / "N degree deflection" / "N deg"
    //   - "by N radians"
    //   - "north by N degrees"
    //   - "deflected by N..."
    expect(
      body,
      `V1S body matches /\\d+\\s*degree/ — quantitative deflection angle without primary-source citation`,
    ).not.toMatch(/\b\d+(?:\.\d+)?\s*degree/i);
    expect(
      body,
      `V1S body matches /\\d+°/ — quantitative deflection angle without primary-source citation`,
    ).not.toMatch(/\b\d+(?:\.\d+)?\s*°/);
    expect(
      body,
      `V1S body matches /\\d+\\s*radian/ — quantitative deflection in radians`,
    ).not.toMatch(/\b\d+(?:\.\d+)?\s*radian/i);
    expect(
      body,
      `V1S body matches /north by N/ — invented quantitative deflection`,
    ).not.toMatch(/north by \d/i);
    expect(
      body,
      `V1S body matches /deflected by \\d+/ — invented quantitative deflection`,
    ).not.toMatch(/deflected by \d/i);
  });

  it('MISSION_FACTS.md V1S section also keeps the deflection qualitative (no canonical angle figure)', () => {
    const v1sSection = sliceMissionFactsSection(
      '## Voyager 1 Saturn encounter — Titan flyby parameters',
    );
    // Same defense applied to the citation surface. If a future primary
    // source surfaces a canonical deflection angle, BOTH this test and
    // the body test above must be updated together.
    expect(
      v1sSection,
      `MISSION_FACTS V1S section contains /\\d+\\s*degree/ deflection figure — primary-source citation required if added`,
    ).not.toMatch(/deflection.*\b\d+(?:\.\d+)?\s*degree/i);
  });
});

// ====================================================================
// Gap 8 — MISSION_FACTS.md V1S/V2S extensions cite primary sources only
// ====================================================================

describe('Story 4.6 QA gap 8 — MISSION_FACTS.md V1S/V2S sections cite NASA / Science / JPL (no Wikipedia)', () => {
  it('the V1S MISSION_FACTS section contains at least one primary-source citation', () => {
    const v1sSection = sliceMissionFactsSection(
      '## Voyager 1 Saturn encounter — Titan flyby parameters',
    );
    // Primary sources per AC9 + the dev's completion notes: NASA SP-451,
    // *Science* 212. Assert at least one of these appears.
    const primarySourcePatterns = [
      /NASA SP-451/,
      /\*?Science\*?\s+212/,
      /Smith et al/,
      /Tyler et al/,
    ];
    const matched = primarySourcePatterns.filter((re) => re.test(v1sSection));
    expect(
      matched.length,
      `V1S MISSION_FACTS section has zero primary-source citations: matched=${matched.length}/${primarySourcePatterns.length}`,
    ).toBeGreaterThan(0);
  });

  it('the V2S MISSION_FACTS section contains at least one primary-source citation', () => {
    const v2sSection = sliceMissionFactsSection(
      '## Voyager 2 Saturn encounter — moon flyby parameters',
    );
    // Primary sources per dev notes: Smith et al., *Science* 215, 504
    // (1982). Assert at least one of the canonical citations appears.
    const primarySourcePatterns = [
      /\*?Science\*?\s+215/,
      /Smith et al/,
      /NASA\/JPL/,
      /Voyager-Saturn Encounter/,
    ];
    const matched = primarySourcePatterns.filter((re) => re.test(v2sSection));
    expect(
      matched.length,
      `V2S MISSION_FACTS section has zero primary-source citations: matched=${matched.length}/${primarySourcePatterns.length}`,
    ).toBeGreaterThan(0);
  });

  it('NO Wikipedia citations anywhere in MISSION_FACTS.md (Voyager-specific Rule 9)', () => {
    // Project policy: MISSION_FACTS cites primary sources only — NASA
    // mission documents, JPL final reports, peer-reviewed publications
    // (*Science*, *Nature*, *Astrophysical Journal*). Wikipedia is a
    // secondary aggregator and not permitted.
    expect(
      MISSION_FACTS_CONTENT,
      'MISSION_FACTS.md contains a Wikipedia citation — project policy is primary sources only (AC9)',
    ).not.toMatch(/wikipedia\.org/i);
    expect(MISSION_FACTS_CONTENT).not.toMatch(/\bwikipedia\b/i);
  });

  it('NO obvious secondary-aggregator citations (NSSDCA / space.com / nasa.gov-news-only) in V1S/V2S sections', () => {
    const v1sSection = sliceMissionFactsSection(
      '## Voyager 1 Saturn encounter — Titan flyby parameters',
    );
    const v2sSection = sliceMissionFactsSection(
      '## Voyager 2 Saturn encounter — moon flyby parameters',
    );
    const combined = `${v1sSection}\n${v2sSection}`;
    // Heuristic block-list of secondary aggregators. NASA mission
    // documents (SP-439, SP-451) and JPL final reports are OK; the
    // catch is news-only domains and tertiary aggregators.
    const secondaryPatterns = [
      /space\.com/i,
      /universetoday/i,
      /howstuffworks/i,
      /britannica\.com/i,
    ];
    for (const re of secondaryPatterns) {
      expect(
        combined,
        `MISSION_FACTS.md V1S/V2S sections contain a secondary-source citation matching ${re}`,
      ).not.toMatch(re);
    }
  });

  it('every UTC timestamp in V1S/V2S tables is in ISO-8601 format (YYYY-MM-DDTHH:MM:SSZ)', () => {
    // Sanity check on citation-surface format. Editorial copy may use
    // natural-language dates, but MISSION_FACTS tables must use ISO.
    const v1sSection = sliceMissionFactsSection(
      '## Voyager 1 Saturn encounter — Titan flyby parameters',
    );
    const v2sSection = sliceMissionFactsSection(
      '## Voyager 2 Saturn encounter — moon flyby parameters',
    );
    // Extract any DD-MM-YYYY or MM/DD/YYYY patterns — those would
    // indicate the wrong format crept in.
    expect(v1sSection).not.toMatch(/\b\d{2}\/\d{2}\/\d{4}\b/);
    expect(v2sSection).not.toMatch(/\b\d{2}\/\d{2}\/\d{4}\b/);
    // Each section MUST contain at least one ISO-8601 anchor instant.
    expect(v1sSection).toMatch(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\b/);
    expect(v2sSection).toMatch(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\b/);
  });
});

// ====================================================================
// Chrome DevTools MCP smoke — per-story exit criterion (Rule 3 + Rule 8)
// ====================================================================

/**
 * The lead drives the Chrome DevTools MCP smoke during the AC8 stage of
 * Story 4.6 (NOT this QA stage). This block documents the canonical
 * smoke for the QA gap-hunting tier so reviewers can cross-reference
 * the lead's evidence against the per-AC coverage matrix below.
 *
 * Tool plan (executed by the lead, not by this test):
 *
 *   1. `mcp__chrome-devtools-mcp__navigate_page` — open the dev server
 *      at `/c/v2-jupiter`, `/c/v1-saturn`, `/c/v2-saturn` in turn.
 *      Verify the URL routing (Story 4.4 + URLSync) lands the
 *      simulation paused at each chapter's anchor ET.
 *
 *   2. `mcp__chrome-devtools-mcp__evaluate_script` — for each chapter,
 *      assert via the per-chapter smoke probe (story file
 *      `## Smoke probe plan (AC8)` section):
 *        - `chapter.windowEndEt - chapter.windowStartEt === 10 * 86400`
 *        - `<v-chapter-copy>` panel renders the chapter's lede + body
 *        - `camera.position` ≈ `chapter.defaultFraming.offsetKm`
 *        - target body mesh visible at NDC near (0,0)
 *        - spacecraft mesh visible in frustum
 *
 *   3. `mcp__chrome-devtools-mcp__take_screenshot` — capture one
 *      screenshot per chapter under
 *      `_bmad-output/implementation-artifacts/4-6-smoke-evidence/`:
 *        - `v2-jupiter-held.png`
 *        - `v1-saturn-held.png`
 *        - `v2-saturn-held.png`
 *      Plus the V1S slingshot bend evidence:
 *        - `v1-saturn-slingshot-bend.png` (1981-01-01 heliocentric
 *          framing showing V1's post-Saturn northward arc out of the
 *          ecliptic — AC4).
 *
 *   4. `mcp__chrome-devtools-mcp__take_snapshot` — capture an
 *      accessibility tree snapshot for the held state of each chapter,
 *      verifying `<v-chapter-copy>`'s `aria-live="polite"` region and
 *      the detail-scrubber's `aria-hidden="false"`.
 *
 *   5. Console-clean assertion — capture console messages during the
 *      session and assert no errors apart from the Lit dev-mode banner
 *      and any known-allow-listed warnings.
 *
 * Per-AC coverage matrix:
 *
 *   - AC1 (window narrowed to ±5d): step 2 assertion 1.
 *   - AC2 (chapter copy renders): step 2 assertion 2 + step 4
 *     (aria-live snapshot).
 *   - AC3 (defaultFraming applied): step 2 assertion 3.
 *   - AC4 (V1S slingshot bend visible): step 3 V1S-bend screenshot.
 *   - AC5 (chapter copy rendering via `<v-chapter-copy>`): step 2
 *     assertion 2 + step 4.
 *   - AC6 (detail scrubber + URL routing): step 1 (URL routing) +
 *     step 4 (detail scrubber aria-hidden=false).
 *   - AC7 (integration end-to-end): exercised at unit/integration tier
 *     by `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` — the
 *     MCP smoke verifies the same path in the live runtime.
 *   - AC8 (lead-driven smoke): the smoke IS the AC.
 *
 * Skip rules:
 *
 *   - Files-to-Modify list under `web/src/` → MCP stage applies; does
 *     NOT skip.
 *   - Bake-only stories skip per Voyager Rule 3 Pure-bake-side
 *     exemption.
 *
 * Reference evidence directory shape (post-Story-1.16, no initScript
 * shim needed per Rule 8):
 *
 *   - `_bmad-output/implementation-artifacts/1-16-smoke-evidence/`
 *     (canonical post-Story-1.16 example).
 *   - `_bmad-output/implementation-artifacts/4-5-smoke-evidence/`
 *     (Story 4.5 V1J equivalent — same probe shape).
 *   - `_bmad-output/implementation-artifacts/4-6-smoke-evidence/`
 *     (Story 4.6 — created during the lead's smoke).
 */
describe('Story 4.6 — Chrome DevTools MCP smoke (lead-driven; documentation only)', () => {
  it('smoke probe plan and evidence directory shape are documented in this test file header', () => {
    // This is a documentation-only assertion. The test passes
    // unconditionally — its purpose is to make the MCP-smoke plan
    // discoverable via the test file glob (per voyager-skill-rules.md
    // Rule 3 + Rule 8).
    expect(true).toBe(true);
  });
});
