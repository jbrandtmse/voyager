/**
 * Story 4.8 — Gravity-Assist Trajectory Visual Validation (Integration AC per
 * Rule 1 / AC6).
 *
 * This defense test asserts the validation document (`docs/visual-validation/
 * gravity-assists.md`) references real artifacts:
 *
 *   1. The document itself exists at the canonical path.
 *   2. The MISSION_FACTS.md section headers cited inline actually exist in the
 *      live MISSION_FACTS.md content (regex audit per AC6).
 *   3. Each of the six per-encounter screenshots (+ V1S/V2N post-encounter
 *      pair) referenced inline exists on disk.
 *
 * The third assertion is guarded behind the `VISUAL_VALIDATION_FULL=1`
 * environment flag because the screenshots are captured by the lead via
 * Chrome DevTools MCP AFTER the dev's scaffolding pass — they may not exist
 * yet at scaffold-time. The lead enables the full-assertion sweep with
 * `VISUAL_VALIDATION_FULL=1 npm run test` after capturing the screenshots,
 * in the same change-set as Story 4.8 ships.
 *
 * The split-describe pattern (always-on + post-capture-gated) was chosen
 * over `it.skipIf(...)` to keep the gating obvious in the test output: the
 * "post-capture" describe block is silently skipped at scaffold-time, then
 * runs normally once screenshots land.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');
const DOC_PATH = resolve(repoRoot, 'docs/visual-validation/gravity-assists.md');
const MISSION_FACTS_PATH = resolve(repoRoot, 'MISSION_FACTS.md');
const SCREENSHOTS_DIR = resolve(repoRoot, 'docs/visual-validation/screenshots');

/**
 * Story 4.12 follow-up to Story 4.8 (2026-05-23): the V1S + V2N
 * post-encounter heliocentric system-view screenshots are now REQUIRED
 * (un-deferred from the Story-4.8 Rule 5 amendment). Story 4.12 landed
 * the heliocentric camera mode via the URL query parameter
 * `?view=heliocentric&distance=<au>&elevation=<deg>`; the lead's smoke
 * captured the two post-encounter frames alongside the six body-centered
 * closest-approach frames. The deferral markers in
 * `docs/visual-validation/gravity-assists.md` were replaced in-place with
 * the heliocentric screenshot embeds + commentary.
 */
const EXPECTED_SCREENSHOTS = [
  'v1-jupiter.png',
  'v2-jupiter.png',
  'v1-saturn.png',
  'v1-saturn-post-encounter.png',
  'v2-saturn.png',
  'v2-uranus.png',
  'v2-neptune.png',
  'v2-neptune-post-encounter.png',
] as const;

const FULL_MODE = process.env.VISUAL_VALIDATION_FULL === '1';

describe('Story 4.8 / AC6 — visual-validation doc references real artifacts', () => {
  describe('always-on (scaffold-time + post-capture)', () => {
    it('docs/visual-validation/gravity-assists.md exists', () => {
      expect(
        existsSync(DOC_PATH),
        `Expected validation document at ${DOC_PATH}. Story 4.8 AC2 + AC8 require this artifact.`,
      ).toBe(true);
    });

    it('document references the eight required encounter screenshots inline (six body-centered + two post-encounter heliocentric)', () => {
      const doc = readFileSync(DOC_PATH, 'utf-8');
      // Six per-encounter body-centered closest-approach screenshots PLUS
      // the two Story-4.12-landed post-encounter heliocentric frames
      // (V1S Titan-slingshot ecliptic-exit + V2N Triton-bend FR12).
      const requiredCorePngs = [
        'screenshots/v1-jupiter.png',
        'screenshots/v2-jupiter.png',
        'screenshots/v1-saturn.png',
        'screenshots/v1-saturn-post-encounter.png',
        'screenshots/v2-saturn.png',
        'screenshots/v2-uranus.png',
        'screenshots/v2-neptune.png',
        'screenshots/v2-neptune-post-encounter.png',
      ];
      for (const png of requiredCorePngs) {
        expect(
          doc.includes(png),
          `Expected document to reference ${png}. Story 4.8 AC2 + AC8 + Story 4.12 AC3 require all eight per-encounter screenshots embedded inline.`,
        ).toBe(true);
      }
    });

    it('document records the Story 4.12 follow-up that closed the V1S + V2N post-encounter deferral', () => {
      const doc = readFileSync(DOC_PATH, 'utf-8');
      // The Story 4.8 Rule 5 amendment originally deferred the V1S + V2N
      // post-encounter heliocentric frames to a future heliocentric-camera-
      // mode story. Story 4.12 landed that mode and captured the two frames.
      // The doc body MUST acknowledge the follow-up (not the deferral) so a
      // future contributor reading the document sees the historical arc.
      expect(
        doc.includes('Story 4.12 follow-up'),
        'Expected the doc to reference the Story 4.12 follow-up that landed the heliocentric camera mode + closed the V1S + V2N post-encounter deferral.',
      ).toBe(true);
      expect(
        doc.includes('?view=heliocentric'),
        'Expected the doc to name the URL query parameter (?view=heliocentric) used to capture the post-encounter frames — discoverability for future contributors refreshing the screenshots.',
      ).toBe(true);
      // Sanity: the old "Post-encounter bend visualization deferred"
      // marker MUST be gone (replaced in-place with the screenshot embed).
      expect(
        doc.includes('Post-encounter bend visualization deferred'),
        'Expected the Story 4.8 deferral marker to be REMOVED (replaced by the Story 4.12 follow-up embeds). If this assertion fails, the dev forgot to delete the deferral text.',
      ).toBe(false);
    });

    it('each cited MISSION_FACTS.md section header exists in the live MISSION_FACTS.md (AC2 / AC6)', () => {
      const doc = readFileSync(DOC_PATH, 'utf-8');
      const factsRaw = readFileSync(MISSION_FACTS_PATH, 'utf-8');

      // Extract every `[MISSION_FACTS.md § <section-name>]` reference marker
      // from the document. The closing `]` is the terminator; the `§` symbol
      // is the separator between the file and the section header text. A
      // single bracket may chain multiple sections via `; §` — split those
      // into separate cited entries. Multi-line wrapping (commentary
      // paragraphs span lines) is normalised by collapsing whitespace runs.
      const referencePattern = /MISSION_FACTS\.md\s*§\s*([^\]]+?)\]/g;
      const cited = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = referencePattern.exec(doc)) !== null) {
        const raw = match[1];
        // Split chained citations: `Section A; § Section B` → ["Section A", "Section B"].
        const parts = raw.split(/;\s*§\s*/);
        for (const part of parts) {
          const normalised = part.replace(/\s+/g, ' ').trim();
          if (normalised) cited.add(normalised);
        }
      }

      expect(
        cited.size,
        'Expected at least one MISSION_FACTS.md § <section> reference marker in the document. ' +
          'Story 4.8 AC2 + AC6 require commentary citations to trace to MISSION_FACTS.md sections.',
      ).toBeGreaterThan(0);

      // Build the live section-header set (## / ### lines) from MISSION_FACTS.md.
      const headerLines = factsRaw
        .split(/\r?\n/)
        .filter((line) => /^#{2,3}\s+/.test(line))
        .map((line) => line.replace(/^#{2,3}\s+/, '').trim());
      const headers = new Set(headerLines);

      const missing: string[] = [];
      for (const citedHeader of cited) {
        if (!headers.has(citedHeader)) {
          missing.push(citedHeader);
        }
      }

      expect(
        missing,
        `Documented citations reference MISSION_FACTS.md sections that do not exist: ${missing.join(' | ')}. ` +
          `Either fix the citation, update MISSION_FACTS.md, or amend per Rule 5 (planning-artifact in-place update).`,
      ).toEqual([]);
    });

    it('document includes an Update protocol section (AC4)', () => {
      const doc = readFileSync(DOC_PATH, 'utf-8');
      expect(
        doc.includes('## Update protocol'),
        'Story 4.8 AC4 requires a living-artifact "Update protocol" section describing how to refresh a screenshot + commentary.',
      ).toBe(true);
    });

    it('screenshots directory exists (even if empty at scaffold-time)', () => {
      // The `.gitkeep` placeholder ensures the directory lands in the
      // commit even when screenshots haven't been captured yet.
      expect(
        existsSync(SCREENSHOTS_DIR),
        `Expected screenshots directory at ${SCREENSHOTS_DIR}. The scaffolding pass committed a .gitkeep placeholder; the lead's screenshot-capture pass replaces it with PNGs.`,
      ).toBe(true);
    });
  });

  // The post-capture block runs only when the lead has captured the screenshots
  // (signalled via VISUAL_VALIDATION_FULL=1). Default test runs skip it so the
  // sweep passes during the dev's scaffolding pass.
  describe.skipIf(!FULL_MODE)('post-capture (VISUAL_VALIDATION_FULL=1)', () => {
    it.each(EXPECTED_SCREENSHOTS)(
      'screenshot %s exists at the cited path (AC1 / AC8)',
      (filename) => {
        const path = resolve(SCREENSHOTS_DIR, filename);
        expect(
          existsSync(path),
          `Expected screenshot at ${path}. ` +
            `Story 4.8 AC1 + AC7 + AC8 require all per-encounter screenshots committed alongside the validation document. ` +
            `Re-run the lead's screenshot-capture smoke if this file is missing.`,
        ).toBe(true);
      },
    );
  });
});
