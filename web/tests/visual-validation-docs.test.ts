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
 * Rule 5 amendment (Story 4.8 AC1 scope reduction, 2026-05-23): the original
 * eight-screenshot deliverable (six encounter frames + V1S/V2N post-encounter
 * frames) was scoped down to six encounter frames only. The post-encounter
 * heliocentric system-view frames require a camera mode that the current
 * production app doesn't expose; deferred to a future heliocentric-camera-mode
 * story. The doc reflects this in its scope-note + per-section deferral
 * markers.
 */
const EXPECTED_SCREENSHOTS = [
  'v1-jupiter.png',
  'v2-jupiter.png',
  'v1-saturn.png',
  'v2-saturn.png',
  'v2-uranus.png',
  'v2-neptune.png',
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

    it('document references the six required encounter screenshots inline', () => {
      const doc = readFileSync(DOC_PATH, 'utf-8');
      // Every per-encounter section embeds a `![alt](screenshots/<slug>.png)` reference.
      const requiredCorePngs = [
        'screenshots/v1-jupiter.png',
        'screenshots/v2-jupiter.png',
        'screenshots/v1-saturn.png',
        'screenshots/v2-saturn.png',
        'screenshots/v2-uranus.png',
        'screenshots/v2-neptune.png',
      ];
      for (const png of requiredCorePngs) {
        expect(
          doc.includes(png),
          `Expected document to reference ${png}. Story 4.8 AC2 + AC8 require all six per-encounter screenshots embedded inline.`,
        ).toBe(true);
      }
    });

    it('document documents the V1S + V2N post-encounter deferral (Rule 5 amendment to AC1)', () => {
      const doc = readFileSync(DOC_PATH, 'utf-8');
      // Original AC1 / AC7 required two post-encounter screenshots (V1S Titan
      // slingshot ecliptic-exit; V2N Triton-bend FR12). The current production
      // app doesn't expose a heliocentric system-view camera mode so the
      // canonical bend visualisations are deferred to a future story. The
      // document MUST acknowledge this deferral inline so a future contributor
      // doesn't mistake the missing frames for an oversight.
      expect(
        doc.includes('Post-encounter bend visualization deferred'),
        'Expected per-section deferral marker for the V1S + V2N post-encounter frames. The Rule 5 amendment to AC1 lives in the doc body; the test pins the marker so future regressions surface.',
      ).toBe(true);
      expect(
        doc.includes('heliocentric-camera-mode story'),
        'Expected the deferral marker to name the follow-up work (a future heliocentric-camera-mode story).',
      ).toBe(true);
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
