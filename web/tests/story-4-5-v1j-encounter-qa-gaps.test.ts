// @vitest-environment happy-dom
/**
 * Story 4.5 — QA gap suite for V1 Jupiter encounter (1979-03-05) chapter
 * with body-centered framing.
 *
 * The dev-authored test suite covers each surface in isolation:
 *   - `web/src/chapters/specs/v1-jupiter.test.ts` (15 tests) — chapter
 *     spec window narrow, copy shape, defaultFraming shape, word-count,
 *     fact mentions.
 *   - `web/src/chapters/chapter-default-framing.test.ts` (6 tests) —
 *     resolver math + null branches.
 *   - `web/src/components/v-chapter-copy.test.ts` — V1J render path +
 *     heliopause regression.
 *   - `web/tests/v1j-encounter-end-to-end.test.ts` (5 tests, Rule 1) —
 *     real-stack integration AC.
 *
 * This QA file fills the cross-cutting gaps the dev suite does not
 * exercise, per the orchestrator's eight priorities:
 *
 *   1. **Chapter copy word-count helper canonical-split defense** — pin
 *      the rule the dev's `body.split(/\s+/).filter(...)` uses, with
 *      boundary inputs (em-dashes, hyphens, possessives, whitespace-only,
 *      exactly 80 / 120 word fixtures).
 *   2. **MISSION_FACTS.md fact-citation defense (regex audit)** — extract
 *      every dated / named identifier in V1J `body` via regex and assert
 *      it appears in `MISSION_FACTS.md`. Defense against future drift
 *      where copy is edited but the citation surface is not.
 *   3. **Heliopause copy regression** — Story 2.9 dispatch still works
 *      for V1H AND V2H after the Story 4.5 `copyForChapter` refactor.
 *   4. **Default-framing resolver fallback path** — chapters with NO
 *      `defaultFraming` field (cruise / launch / heliopause / PBD)
 *      resolve to `null` so the controller falls back to its built-in
 *      cruise default. Covers every non-V1J chapter in `ALL_CHAPTERS`.
 *   5. **Detail-scrubber range auto-derives from chapter spec** — assert
 *      the ranges are NOT hardcoded; they flow through from
 *      `chapter.windowStartEt` / `chapter.windowEndEt`. If a future
 *      Rule-5 amendment widens or narrows the window, the test passes
 *      WITHOUT modification.
 *   6. **`<v-chapter-copy>` V1J render path + clear-on-exit** —
 *      double-cover the held / passed transition with assertions on the
 *      DOM data-active / data-slug attributes (the dev test asserts
 *      displayedSlug; QA asserts the DOM surface too).
 *   7. **VoyagerCameraController reads V1J defaultFraming on restore** —
 *      pin the wire-up: when activeChapter = V1J + active target is
 *      provided, `controller.restore()` writes the camera position to
 *      `target + V1J.defaultFraming.offsetKm`. Defense against a future
 *      refactor that drops the resolver from `main.ts`.
 *   8. **ChapterSpec.copy / defaultFraming optionality at runtime** —
 *      non-encounter chapters do NOT carry these fields. Assert that
 *      `ALL_CHAPTERS.filter(c => c.copy !== undefined)` only includes
 *      V1J after Story 4.5 (V2J / V1S / V2S / V2U / V2N land in Stories
 *      4.6 / 4.7); same for `defaultFraming`. Pinned so the failure
 *      mode "Story 4.6 lands but tests still pass for unpopulated
 *      chapters" surfaces immediately.
 *
 * Discoverability: web vitest's `*.test.ts` glob picks this up
 * automatically; no skip markers used.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, afterEach } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';

import v1Jupiter from '../src/chapters/specs/v1-jupiter';
import {
  resolveChapterDefaultFraming,
} from '../src/chapters/chapter-default-framing';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import { ChapterDirector } from '../src/services/chapter-director';
import { ClockManager } from '../src/services/clock-manager';
import { URLSync } from '../src/services/url-sync';
import { VChapterCopy } from '../src/components/v-chapter-copy';
import { VTimelineScrubber } from '../src/components/v-timeline-scrubber';
import {
  VoyagerCameraController,
  type ManualCameraHost,
} from '../src/render/voyager-camera-controller';
import { worldVec3 } from '../src/types/branded';
import {
  V1_HELIOPAUSE_COPY,
  V2_HELIOPAUSE_COPY,
} from '../src/data/heliopause-copy';

// --------------------------------------------------------------------
// Word-count helper — the dev's V1J spec test uses
//   `body.split(/\s+/).filter((w) => w.length > 0).length`
// as the canonical word-count rule. We pin the rule with a defense
// suite so a future "smarter" helper that, say, splits on em-dashes or
// strips possessives doesn't silently change the band the V1J spec is
// measured against.
// --------------------------------------------------------------------

const countWords = (s: string): number =>
  s.split(/\s+/).filter((w) => w.length > 0).length;

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
// Common mount fixture for `<v-chapter-copy>` + `<v-timeline-scrubber
// variant="detail">` against a real ChapterDirector × ALL_CHAPTERS.
// --------------------------------------------------------------------

const mountQAStack = async (): Promise<{
  director: ChapterDirector;
  chapterCopy: VChapterCopy;
  detailScrubber: VTimelineScrubber;
  clock: ClockManager;
  dispose: () => void;
}> => {
  const director = new ChapterDirector(ALL_CHAPTERS);
  const clock = new ClockManager();
  const urlSync = new URLSync();

  const chapterCopy = document.createElement('v-chapter-copy') as VChapterCopy;
  chapterCopy.chapterDirector = director;
  document.body.appendChild(chapterCopy);

  const detailScrubber = document.createElement(
    'v-timeline-scrubber',
  ) as VTimelineScrubber;
  detailScrubber.variant = 'detail';
  detailScrubber.urlSync = urlSync;
  detailScrubber.clockManager = clock;
  detailScrubber.chapterDirector = director;
  document.body.appendChild(detailScrubber);

  await chapterCopy.updateComplete;
  await detailScrubber.updateComplete;

  const dispose = (): void => {
    chapterCopy.remove();
    detailScrubber.remove();
    clock.dispose();
  };

  return { director, chapterCopy, detailScrubber, clock, dispose };
};

afterEach(() => {
  document.querySelectorAll('v-chapter-copy').forEach((el) => el.remove());
  document
    .querySelectorAll('v-timeline-scrubber')
    .forEach((el) => el.remove());
});

// ====================================================================
// Gap 1 — Chapter copy word-count helper canonical-split defense
// ====================================================================

describe('Story 4.5 QA gap 1 — word-count helper canonical-split rule', () => {
  it('counts a simple two-word string as 2', () => {
    expect(countWords('hello world')).toBe(2);
  });

  it('returns 0 for whitespace-only strings', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('\n\t  ')).toBe(0);
  });

  it('treats hyphenated words ("long-exposure", "forty-eight") as ONE word', () => {
    // The heliopause-copy convention (referenced in v1-jupiter.test.ts)
    // counts hyphenated compounds as single words. V1J's body uses
    // "long-exposure" and "forty-eight"; if the helper started splitting
    // on hyphens those would inflate to two words each, drifting the
    // measured band by 4 words.
    expect(countWords('long-exposure backlit')).toBe(2);
    expect(countWords('forty-eight hours')).toBe(2);
  });

  it('treats possessives ("Io\'s", "Sun\'s") as ONE word', () => {
    // A different "smart" helper might strip the apostrophe + "s" and
    // join with the next word. Pin the simple-split rule.
    expect(countWords("Io's limb")).toBe(2);
    expect(countWords("the Sun's wind")).toBe(3);
  });

  it('splits on em-dashes only when surrounded by whitespace (not embedded)', () => {
    // The helper splits on /\s+/, NOT on punctuation. An em-dash with
    // spaces (" — ") becomes its own token and counts as a "word" of
    // length 1; an embedded "a—b" stays as one token.
    expect(countWords('alpha — beta')).toBe(3); // "alpha", "—", "beta"
    expect(countWords('alpha—beta')).toBe(1); // single token
  });

  it('counts the V1J body (97 expected, must remain inside 80–120)', () => {
    expect(v1Jupiter.copy).toBeDefined();
    const count = countWords(v1Jupiter.copy!.body);
    expect(count).toBeGreaterThanOrEqual(80);
    expect(count).toBeLessThanOrEqual(120);
  });

  it('synthetic exactly-80-word fixture passes the band', () => {
    // 80 distinct "word" tokens.
    const eighty = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ');
    expect(countWords(eighty)).toBe(80);
    // Should sit at the lower band boundary.
    expect(countWords(eighty)).toBeGreaterThanOrEqual(80);
  });

  it('synthetic exactly-120-word fixture passes the band', () => {
    const oneTwenty = Array.from({ length: 120 }, (_, i) => `w${i}`).join(' ');
    expect(countWords(oneTwenty)).toBe(120);
    expect(countWords(oneTwenty)).toBeLessThanOrEqual(120);
  });

  it('79 words is below the band; 121 words is above', () => {
    const seventyNine = Array.from({ length: 79 }, (_, i) => `w${i}`).join(' ');
    expect(countWords(seventyNine)).toBe(79);
    expect(countWords(seventyNine)).toBeLessThan(80);

    const oneTwentyOne = Array.from({ length: 121 }, (_, i) => `w${i}`).join(
      ' ',
    );
    expect(countWords(oneTwentyOne)).toBe(121);
    expect(countWords(oneTwentyOne)).toBeGreaterThan(120);
  });
});

// ====================================================================
// Gap 2 — MISSION_FACTS.md fact-citation defense (regex audit)
// ====================================================================

describe('Story 4.5 QA gap 2 — fact-citation regex audit against MISSION_FACTS.md', () => {
  it('MISSION_FACTS.md is loadable from the repo root', () => {
    expect(MISSION_FACTS_CONTENT.length).toBeGreaterThan(0);
    // The title line is the file's own name; verify the canonical
    // header rather than a hardcoded human-readable title.
    expect(MISSION_FACTS_CONTENT).toContain('# MISSION_FACTS.md');
  });

  it('every "5 March 1979"-style date in V1J copy resolves to MISSION_FACTS.md', () => {
    expect(v1Jupiter.copy).toBeDefined();
    const body = v1Jupiter.copy!.body;
    // Match either "DD Month YYYY" (V1J style) or "YYYY-MM-DD" / "YYYY"
    // ISO fragments. The V1J body uses the natural-language form.
    const naturalDates = body.match(
      /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/g,
    );
    expect(naturalDates).not.toBeNull();
    // At least one natural-language date (5 March 1979) must be cited.
    expect(naturalDates!.length).toBeGreaterThan(0);
    for (const dateStr of naturalDates!) {
      // Convert "5 March 1979" → "1979-03-05" for the ISO check, since
      // MISSION_FACTS.md cites in ISO form. The conversion uses the
      // month index directly.
      const match = dateStr.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
      expect(match).not.toBeNull();
      const day = parseInt(match![1], 10);
      const monthName = match![2];
      const year = match![3];
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];
      const monthIdx = months.indexOf(monthName);
      expect(monthIdx).toBeGreaterThanOrEqual(0);
      const iso = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      expect(
        MISSION_FACTS_CONTENT,
        `V1J copy mentions ${dateStr} but ${iso} is not cited in MISSION_FACTS.md`,
      ).toContain(iso);
    }
  });

  it('the Io-plume frame identifier 0468J1-001 appears in MISSION_FACTS.md', () => {
    expect(v1Jupiter.copy).toBeDefined();
    expect(v1Jupiter.copy!.body).toContain('0468J1-001');
    expect(MISSION_FACTS_CONTENT).toContain('0468J1-001');
  });

  it('Linda Morabito is cited in MISSION_FACTS.md', () => {
    expect(v1Jupiter.copy).toBeDefined();
    expect(v1Jupiter.copy!.body).toContain('Linda Morabito');
    // MISSION_FACTS.md uses both "Linda Morabito" and "L. Morabito"
    // forms; assert at least one of the two is present.
    const lindaCited =
      MISSION_FACTS_CONTENT.includes('Linda Morabito') ||
      MISSION_FACTS_CONTENT.includes('L. Morabito');
    expect(lindaCited).toBe(true);
  });

  it('every named moon in V1J copy appears in the interior-sweep table', () => {
    expect(v1Jupiter.copy).toBeDefined();
    const body = v1Jupiter.copy!.body;
    // The four Galileans plus Amalthea — the body mentions all five.
    for (const moon of [
      'Amalthea',
      'Io',
      'Europa',
      'Ganymede',
      'Callisto',
    ]) {
      expect(body).toContain(moon);
      expect(
        MISSION_FACTS_CONTENT,
        `${moon} is mentioned in V1J copy but not cited in MISSION_FACTS.md`,
      ).toContain(moon);
    }
  });

  it('the closest-approach ISO instant 1979-03-05T12:05:00Z is in MISSION_FACTS.md', () => {
    // Spot-check: even though the V1J body uses "twelve oh five UTC"
    // (informal), the underlying anchor ET is canonical and must be in
    // the facts file.
    expect(MISSION_FACTS_CONTENT).toContain('1979-03-05T12:05:00Z');
  });
});

// ====================================================================
// Gap 3 — Heliopause copy regression after Story 4.5 dispatch refactor
// ====================================================================

describe('Story 4.5 QA gap 3 — heliopause copy regression (Story 2.9 dispatch preserved)', () => {
  it('V1 heliopause copy still renders via the new copyForChapter dispatch', async () => {
    const v1h = findChapterBySlug('v1-heliopause');
    expect(v1h).not.toBeNull();
    const { director, chapterCopy, dispose } = await mountQAStack();
    director.update(v1h!.anchorEt);
    await chapterCopy.updateComplete;

    const lede = chapterCopy.querySelector('.v-chapter-copy-lede');
    expect(lede?.textContent).toBe(V1_HELIOPAUSE_COPY.lede);

    const paragraphs = chapterCopy.querySelectorAll(
      '.v-chapter-copy-paragraph',
    );
    expect(paragraphs.length).toBe(V1_HELIOPAUSE_COPY.paragraphs.length);
    dispose();
  });

  it('V2 heliopause copy still renders via the new copyForChapter dispatch', async () => {
    const v2h = findChapterBySlug('v2-heliopause');
    expect(v2h).not.toBeNull();
    const { director, chapterCopy, dispose } = await mountQAStack();
    director.update(v2h!.anchorEt);
    await chapterCopy.updateComplete;

    const lede = chapterCopy.querySelector('.v-chapter-copy-lede');
    expect(lede?.textContent).toBe(V2_HELIOPAUSE_COPY.lede);
    const paragraphs = chapterCopy.querySelectorAll(
      '.v-chapter-copy-paragraph',
    );
    expect(paragraphs.length).toBe(V2_HELIOPAUSE_COPY.paragraphs.length);
    dispose();
  });

  it('heliopause chapters do NOT carry a ChapterSpec.copy field (heliopause-copy.ts owns them per ADR-0021)', () => {
    const v1h = findChapterBySlug('v1-heliopause');
    const v2h = findChapterBySlug('v2-heliopause');
    expect(v1h!.copy).toBeUndefined();
    expect(v2h!.copy).toBeUndefined();
  });

  it('switching from V1J → V1H clears V1J slug, paints V1H lede (no slug bleed)', async () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    const v1h = findChapterBySlug('v1-heliopause')!;
    const { director, chapterCopy, dispose } = await mountQAStack();

    director.update(v1j.anchorEt);
    await chapterCopy.updateComplete;
    expect(chapterCopy.displayedSlug).toBe('v1-jupiter');

    director.update(v1h.anchorEt);
    await chapterCopy.updateComplete;
    expect(chapterCopy.displayedSlug).toBe('v1-heliopause');
    const lede = chapterCopy.querySelector('.v-chapter-copy-lede');
    expect(lede?.textContent).toBe(V1_HELIOPAUSE_COPY.lede);
    dispose();
  });
});

// ====================================================================
// Gap 4 — Default-framing resolver fallback path (non-V1J chapters)
// ====================================================================

describe('Story 4.5 QA gap 4 — defaultFraming resolver returns null for non-framed chapters', () => {
  it('every chapter except the six gas-giant encounters resolves to null framing (fallback path)', () => {
    // Story 4.5 populated V1J. Story 4.6 populated V2J / V1S / V2S.
    // Story 4.7 closed FR30 by populating V2U / V2N — all six gas-giant
    // encounter chapters now carry framing. Cruise / launch / heliopause
    // / PBD remain on the fallback path.
    const POPULATED_SLUGS = new Set<string>([
      'v1-jupiter',
      'v2-jupiter',
      'v1-saturn',
      'v2-saturn',
      'v2-uranus',
      'v2-neptune',
    ]);
    const target = new Vector3(100, 200, 300);
    for (const chapter of ALL_CHAPTERS) {
      const framing = resolveChapterDefaultFraming(chapter, target);
      if (POPULATED_SLUGS.has(chapter.slug)) {
        expect(framing).not.toBeNull();
      } else {
        expect(
          framing,
          `${chapter.slug} unexpectedly resolved framing; the six gas-giant encounters (${[...POPULATED_SLUGS].join(', ')}) are the populated set after Story 4.7 (FR30 closed)`,
        ).toBeNull();
      }
    }
  });

  it('resolver returns null for a chapter spec that omits defaultFraming even with a valid target', () => {
    const heliopause = findChapterBySlug('v1-heliopause')!;
    expect(heliopause.defaultFraming).toBeUndefined();
    expect(
      resolveChapterDefaultFraming(heliopause, new Vector3(0, 0, 0)),
    ).toBeNull();
  });

  it('reads V1J offsetKm verbatim (camera position = target + offset)', () => {
    const target = new Vector3(0, 0, 0);
    const framing = resolveChapterDefaultFraming(v1Jupiter, target);
    expect(framing).not.toBeNull();
    const [ox, oy, oz] = v1Jupiter.defaultFraming!.offsetKm;
    expect(framing!.position.x).toBeCloseTo(ox, 6);
    expect(framing!.position.y).toBeCloseTo(oy, 6);
    expect(framing!.position.z).toBeCloseTo(oz, 6);
  });
});

// ====================================================================
// Gap 5 — Detail-scrubber range auto-derives from chapter spec (not hardcoded)
// ====================================================================

describe('Story 4.5 QA gap 5 — detail-scrubber range derives from chapter spec', () => {
  it('detail-scrubber rangeStart / rangeEnd match V1J window EXACTLY (derived, not hardcoded)', async () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    const { director, clock, detailScrubber, dispose } = await mountQAStack();

    director.update(v1j.anchorEt);
    clock.scrubTo(v1j.anchorEt);
    await detailScrubber.updateComplete;

    // The assertion deliberately reads from the chapter spec object —
    // NOT from a hardcoded constant. If a future Rule-5 amendment widens
    // or narrows the window, this test passes WITHOUT modification.
    expect(detailScrubber.rangeStart).toBe(v1j.windowStartEt);
    expect(detailScrubber.rangeEnd).toBe(v1j.windowEndEt);
    expect(detailScrubber.getAttribute('aria-hidden')).toBe('false');
    dispose();
  });

  it('span = exactly 10 days (sanity check that the ±5d narrowing landed)', async () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    const { director, clock, detailScrubber, dispose } = await mountQAStack();
    director.update(v1j.anchorEt);
    clock.scrubTo(v1j.anchorEt);
    await detailScrubber.updateComplete;
    const SECONDS_PER_DAY = 86_400;
    expect(detailScrubber.rangeEnd - detailScrubber.rangeStart).toBeCloseTo(
      10 * SECONDS_PER_DAY,
      6,
    );
    dispose();
  });

  it('scrubber hides outside V1J window even though it derives ranges from the active chapter', async () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    const { director, clock, detailScrubber, dispose } = await mountQAStack();
    const cruiseEt = v1j.windowStartEt - 365 * 86_400;
    director.update(cruiseEt);
    clock.scrubTo(cruiseEt);
    await detailScrubber.updateComplete;
    expect(detailScrubber.getAttribute('aria-hidden')).toBe('true');
    dispose();
  });
});

// ====================================================================
// Gap 6 — `<v-chapter-copy>` V1J render path + DOM-attribute defense
// ====================================================================

describe('Story 4.5 QA gap 6 — <v-chapter-copy> DOM attributes on V1J held + cleared', () => {
  it('renders article[data-active="true"][data-slug="v1-jupiter"] on held', async () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    const { director, chapterCopy, dispose } = await mountQAStack();
    director.update(v1j.anchorEt);
    await chapterCopy.updateComplete;

    const article = chapterCopy.querySelector('article.v-chapter-copy');
    expect(article).not.toBeNull();
    expect(article!.getAttribute('data-active')).toBe('true');
    expect(article!.getAttribute('data-slug')).toBe('v1-jupiter');
    expect(article!.getAttribute('aria-live')).toBe('polite');
    dispose();
  });

  it('renders article[data-active="false"][aria-hidden="true"] when V1J exits forward', async () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    const { director, chapterCopy, dispose } = await mountQAStack();
    director.update(v1j.anchorEt);
    await chapterCopy.updateComplete;
    director.update(v1j.windowEndEt + 1);
    await chapterCopy.updateComplete;

    const article = chapterCopy.querySelector('article.v-chapter-copy');
    expect(article).not.toBeNull();
    expect(article!.getAttribute('data-active')).toBe('false');
    expect(article!.getAttribute('aria-hidden')).toBe('true');
    expect(chapterCopy.displayedSlug).toBeNull();
    dispose();
  });

  it('emits exactly ONE <h2> + ONE <p> for the V1J encounter copy block', async () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    const { director, chapterCopy, dispose } = await mountQAStack();
    director.update(v1j.anchorEt);
    await chapterCopy.updateComplete;

    const headings = chapterCopy.querySelectorAll('h2.v-chapter-copy-lede');
    expect(headings.length).toBe(1);
    expect(headings[0].textContent).toBe(v1j.copy!.lede);
    const paragraphs = chapterCopy.querySelectorAll(
      'p.v-chapter-copy-paragraph',
    );
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0].textContent).toBe(v1j.copy!.body);
    dispose();
  });
});

// ====================================================================
// Gap 7 — VoyagerCameraController reads V1J defaultFraming on restore
// ====================================================================

describe('Story 4.5 QA gap 7 — VoyagerCameraController honours chapter defaultFraming on restore', () => {
  const makeManualCameraHost = (): ManualCameraHost & {
    setManualCameraActive(value: boolean): void;
  } => {
    let active = false;
    return {
      setManualCameraActive(value: boolean): void {
        active = value;
      },
      get manualCameraActive(): boolean {
        return active;
      },
    };
  };

  it('restore() with V1J active reads offsetKm from chapter spec, not a controller-internal default', () => {
    // Synthetic Jupiter target (post-floating-origin shifted coordinates).
    const SYNTH_JUPITER = new Vector3(0, 0, 0);
    const camera = new PerspectiveCamera();
    const host = makeManualCameraHost();
    host.setManualCameraActive(true);

    const domElement = document.createElement('div');
    document.body.appendChild(domElement);

    const controller = new VoyagerCameraController({
      camera,
      domElement,
      renderEngine: host,
      getActiveTarget: () =>
        worldVec3(SYNTH_JUPITER.x, SYNTH_JUPITER.y, SYNTH_JUPITER.z),
      getViewFrameOrigin: () => worldVec3(0, 0, 0),
      // The closure that main.ts wires — the QA point is to verify the
      // controller respects whatever the resolver returns. We delegate
      // to the production resolver so the test exercises the SAME code
      // path the runtime uses.
      resolveDefaultFraming: (activeTarget) =>
        resolveChapterDefaultFraming(v1Jupiter, activeTarget),
      reducedMotion: () => true, // instant cut so the assertion is sync
    });

    controller.restore();

    // After restore, camera position should equal target + V1J offsetKm.
    const [ox, oy, oz] = v1Jupiter.defaultFraming!.offsetKm;
    expect(camera.position.x).toBeCloseTo(SYNTH_JUPITER.x + ox, 3);
    expect(camera.position.y).toBeCloseTo(SYNTH_JUPITER.y + oy, 3);
    expect(camera.position.z).toBeCloseTo(SYNTH_JUPITER.z + oz, 3);
    // Manual camera flag flipped back to false post-restore.
    expect(host.manualCameraActive).toBe(false);

    controller.detach();
    domElement.remove();
  });

  it('restore() with a chapter that has NO defaultFraming falls through to controller defaults (no throw)', () => {
    const camera = new PerspectiveCamera();
    const host = makeManualCameraHost();
    host.setManualCameraActive(true);
    const domElement = document.createElement('div');
    document.body.appendChild(domElement);

    // Use the heliopause chapter — no defaultFraming.
    const v1h = findChapterBySlug('v1-heliopause')!;
    const controller = new VoyagerCameraController({
      camera,
      domElement,
      renderEngine: host,
      // No active target available either — cruise default path.
      getActiveTarget: () => null,
      getViewFrameOrigin: () => worldVec3(0, 0, 0),
      resolveDefaultFraming: (activeTarget) =>
        resolveChapterDefaultFraming(v1h, activeTarget),
      reducedMotion: () => true,
    });

    // Must not throw — controller falls back to its built-in cruise default.
    expect(() => controller.restore()).not.toThrow();
    expect(host.manualCameraActive).toBe(false);

    controller.detach();
    domElement.remove();
  });
});

// ====================================================================
// Gap 8 — ChapterSpec.copy / defaultFraming optionality at runtime
// ====================================================================

describe('Story 4.5 QA gap 8 — ChapterSpec.copy / defaultFraming optionality (Story 4.5 + 4.6 + 4.7 populated, FR30 closed)', () => {
  it('exactly SIX chapters carry a ChapterSpec.copy field after Story 4.7 (the six gas-giant encounters)', () => {
    const chaptersWithCopy = ALL_CHAPTERS.filter(
      (c) => c.copy !== undefined,
    );
    expect(chaptersWithCopy.length).toBe(6);
    const slugs = chaptersWithCopy.map((c) => c.slug).sort();
    expect(slugs).toEqual(
      [
        'v1-jupiter',
        'v1-saturn',
        'v2-jupiter',
        'v2-neptune',
        'v2-saturn',
        'v2-uranus',
      ].sort(),
    );
  });

  it('exactly SIX chapters carry a ChapterSpec.defaultFraming field after Story 4.7', () => {
    const chaptersWithFraming = ALL_CHAPTERS.filter(
      (c) => c.defaultFraming !== undefined,
    );
    expect(chaptersWithFraming.length).toBe(6);
    const slugs = chaptersWithFraming.map((c) => c.slug).sort();
    expect(slugs).toEqual(
      [
        'v1-jupiter',
        'v1-saturn',
        'v2-jupiter',
        'v2-neptune',
        'v2-saturn',
        'v2-uranus',
      ].sort(),
    );
  });

  it('cruise / launch / PBD / heliopause chapters leave both fields undefined (gas-giants only after FR30 closure)', () => {
    const slugsExpectedClean = [
      'launch-v1',
      'launch-v2',
      'pale-blue-dot',
      'v1-heliopause',
      'v2-heliopause',
    ];
    for (const slug of slugsExpectedClean) {
      const chapter = findChapterBySlug(slug);
      expect(chapter, `unknown slug ${slug}`).not.toBeNull();
      expect(
        chapter!.copy,
        `${slug} unexpectedly populated copy — FR30 closure is gas-giant-only`,
      ).toBeUndefined();
      expect(
        chapter!.defaultFraming,
        `${slug} unexpectedly populated defaultFraming — FR30 closure is gas-giant-only`,
      ).toBeUndefined();
    }
  });

  it('all chapters that DO carry copy also carry a matching defaultFraming (Story 4.5 pairing invariant)', () => {
    // For Story 4.5, the only chapter populating either field is V1J,
    // and it populates both. As Stories 4.6 / 4.7 land, the encounter
    // pattern is "copy + defaultFraming together" — the lone V1J case
    // pins the invariant.
    for (const chapter of ALL_CHAPTERS) {
      if (chapter.copy !== undefined) {
        expect(
          chapter.defaultFraming,
          `${chapter.slug} carries copy but no defaultFraming — encounter chapters ship both together`,
        ).toBeDefined();
      }
    }
  });

  it('the lede prefix matches the marker label pattern ("V1 Jupiter." ↔ markerLabel "V1J")', () => {
    // Soft invariant: the lede typically begins with the spacecraft +
    // body name in the same order as the markerLabel encodes. Pin it
    // for V1J so a future copy edit that flips to "Jupiter, V1." is
    // caught.
    expect(v1Jupiter.copy!.lede).toBe('V1 Jupiter.');
    expect(v1Jupiter.markerLabel).toBe('V1J');
  });
});
