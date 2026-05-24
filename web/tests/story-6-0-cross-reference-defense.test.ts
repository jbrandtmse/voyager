/**
 * Story 6.0 QA — cross-reference rot defense (process / discipline pins).
 *
 * Story 6.0's load-bearing test is `build-dist-layout.test.ts` (AC1's
 * LAYOUT-asserting production-build regression suite). This sibling spec
 * pins the OTHER deliverables (AC2 dev-doc, AC3 Rule 14, AC4 Rule 15,
 * AC4 T4 Subtask 4.2 forward-coupled-provisional-definitions section)
 * against silent cross-reference rot:
 *
 *   - A future edit that re-numbers `## Rule 14` to `## Rule 13`
 *     (collapse drift) fails here at sub-second vitest feedback rather
 *     than silently breaking the AC6 grep contract.
 *   - A future edit to `CONTRIBUTING.md` § "Visual validation" that
 *     drops the link to `docs/visual-validation/update-snapshot-discipline.md`
 *     (e.g., during a docs reorg that misses the cross-ref) fails here.
 *   - A future deletion of `docs/visual-validation/update-snapshot-discipline.md`
 *     itself fails here (the file is the canonical landing for Story
 *     5.4's `--update-snapshots` discipline; if it moves, the
 *     skill-rules.md Rule 13 cross-reference AND CONTRIBUTING.md anchor
 *     must move with it).
 *   - A future edit that removes the `## Forward-coupled provisional
 *     definitions` section from `deferred-work.md` fails here.
 *
 * The pattern mirrors `web/tests/visual-validation-docs.test.ts`
 * (Story 4.8 AC6 — same defense class: pin cross-references between
 * planning artifacts so docs-drift surfaces in vitest, not at the next
 * lead-driven grep audit).
 *
 * ## Rule 13 (test discoverability)
 *
 * This file lives at `web/tests/story-6-0-cross-reference-defense.test.ts`
 * to participate in the default `npm test` (vitest) sweep — same posture
 * as `visual-validation-docs.test.ts`. No env-gate, no `.skip`, no
 * `xfail`; the assertions run unconditionally against committed text.
 *
 * ## Rule 3 exemption note
 *
 * Story 6.0 is a process / discipline / cleanup story (build-pipeline
 * regression test + dev-doc + skill-rules + retro annotations). Per
 * Rule 3 it is exempt from the per-story Chrome DevTools MCP smoke
 * evidence requirement; the dev's `build-dist-layout.test.ts` is the
 * load-bearing test, and this file is the cheap-feedback companion that
 * pins the OTHER deliverables at vitest cost.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SKILL_RULES = resolve(REPO_ROOT, '_bmad/custom/skill-rules.md');
const UPDATE_SNAPSHOT_DOC = resolve(
  REPO_ROOT,
  'docs/visual-validation/update-snapshot-discipline.md',
);
const CONTRIBUTING = resolve(REPO_ROOT, 'CONTRIBUTING.md');
const DEFERRED_WORK = resolve(
  REPO_ROOT,
  '_bmad-output/implementation-artifacts/deferred-work.md',
);
const STORY_6_0 = resolve(
  REPO_ROOT,
  '_bmad-output/implementation-artifacts/6-0-epic-5-deferred-cleanup.md',
);
const EPIC_5_RETRO = resolve(
  REPO_ROOT,
  '_bmad-output/implementation-artifacts/epic-5-retro-2026-05-24.md',
);

describe('Story 6.0 — AC3 + AC4 skill-rules.md Rule 14 + Rule 15 pins', () => {
  it('skill-rules.md exists', () => {
    expect(
      existsSync(SKILL_RULES),
      `Expected skill-rules.md at ${SKILL_RULES}. Story 6.0 AC3 + AC4 require Rule 14 + Rule 15 to land here.`,
    ).toBe(true);
  });

  it('contains a `## Rule 14 — Spec arithmetic ...` header (AC3)', () => {
    const text = readFileSync(SKILL_RULES, 'utf-8');
    // The header must match the exact slot number; a future edit that
    // re-numbers Rule 14 → Rule 13 (collapse) or Rule 14 → Rule 15
    // (insertion drift) fails here. The `—` and the `applies to`
    // parenthetical match the canonical structure of Rules 8–13.
    const rule14Header =
      /^## Rule 14 — Spec arithmetic must show derivation or cite the source line \(applies to `bmad-create-story`\)/m;
    expect(
      text,
      'Expected `## Rule 14 — Spec arithmetic must show derivation or cite the source line (applies to `bmad-create-story`)` header. Story 6.0 AC3 routed Epic 5 retro Action item #5 here; renumbering or deletion is a HIGH finding.',
    ).toMatch(rule14Header);
  });

  it('contains a `## Rule 15 — Forward-coupled definitions ...` header (AC4)', () => {
    const text = readFileSync(SKILL_RULES, 'utf-8');
    const rule15Header =
      /^## Rule 15 — Forward-coupled definitions in Story-X\.1 foundations are PROVISIONAL until consumed by X\.2 \/ X\.3 \(applies to `bmad-create-story`\)/m;
    expect(
      text,
      'Expected `## Rule 15 — Forward-coupled definitions in Story-X.1 foundations are PROVISIONAL until consumed by X.2 / X.3 (applies to `bmad-create-story`)` header. Story 6.0 AC4 routed Epic 5 retro Action item #6 here; renumbering or deletion is a HIGH finding.',
    ).toMatch(rule15Header);
  });

  it('Rule 14 cites the Story 5.2 50×/100× incident as the load-bearing case', () => {
    // The rule body is REQUIRED to cite the source incident per the
    // canonical rule structure (statement + Why this rule exists today).
    // A future edit that strips the citation makes the rule
    // historically rootless — the rule still exists but the example
    // that justifies it is gone, weakening the discipline.
    const text = readFileSync(SKILL_RULES, 'utf-8');
    expect(
      text,
      'Expected Rule 14 body to cite the Story 5.2 50×/100× spec-arithmetic incident. The incident is the load-bearing example justifying the rule.',
    ).toMatch(/Story 5\.2[\s\S]*?(50×|100×)/);
  });

  it('Rule 15 cites the Story 5.1 / 5.3 `composite_active` incident', () => {
    const text = readFileSync(SKILL_RULES, 'utf-8');
    expect(
      text,
      'Expected Rule 15 body to cite the Story 5.1 / 5.3 `composite_active` forward-coherence incident. The incident is the load-bearing example justifying the rule.',
    ).toMatch(/composite_active/);
    expect(text).toMatch(/Story 5\.1/);
    expect(text).toMatch(/Story 5\.3/);
  });
});

describe('Story 6.0 — AC2 update-snapshot-discipline dev-doc + cross-reference pins', () => {
  it('docs/visual-validation/update-snapshot-discipline.md exists', () => {
    expect(
      existsSync(UPDATE_SNAPSHOT_DOC),
      `Expected dev-doc at ${UPDATE_SNAPSHOT_DOC}. Story 6.0 AC2 requires this artifact.`,
    ).toBe(true);
  });

  it('skill-rules.md cross-references the dev-doc (AC2 / AC6)', () => {
    // AC6 binds the lead's grep verification that "the cross-reference
    // from one of those rules (or from Rule 13) points to
    // docs/visual-validation/update-snapshot-discipline.md". The dev
    // chose Rule 13's body for the cross-reference per Completion Note
    // #5. This test pins the relative path so a future docs reorg that
    // moves the dev-doc must also update this cross-reference (or this
    // test fails loudly).
    const text = readFileSync(SKILL_RULES, 'utf-8');
    expect(
      text,
      'Expected `_bmad/custom/skill-rules.md` to reference `docs/visual-validation/update-snapshot-discipline.md`. Story 6.0 AC2 + AC6 require this cross-reference; a docs reorg that moves the dev-doc must update this anchor.',
    ).toMatch(/docs\/visual-validation\/update-snapshot-discipline\.md/);
  });

  it('CONTRIBUTING.md has a `## Visual validation` section (AC2 / AC6)', () => {
    const text = readFileSync(CONTRIBUTING, 'utf-8');
    expect(
      text,
      'Expected `CONTRIBUTING.md` § "Visual validation" section. Story 6.0 AC2 + AC6 require this section to point external contributors at the dev-doc.',
    ).toMatch(/^## Visual validation/m);
  });

  it('CONTRIBUTING.md § "Visual validation" references the dev-doc (AC2 / AC6)', () => {
    const text = readFileSync(CONTRIBUTING, 'utf-8');
    expect(
      text,
      'Expected `CONTRIBUTING.md` to reference `docs/visual-validation/update-snapshot-discipline.md`. Story 6.0 AC6 grep-binds this cross-reference; a docs reorg that moves the dev-doc must update this anchor.',
    ).toMatch(/docs\/visual-validation\/update-snapshot-discipline\.md/);
  });

  it('update-snapshot-discipline.md covers the four AC2 content areas', () => {
    // AC2 lists four required content areas: (a) when --update-snapshots
    // is appropriate, (b) AC1-cross-check vitest spec pattern, (c)
    // pre-update verification gate, (d) commit-evidence pattern. The
    // doc need not name them in those exact words but it MUST cover
    // each conceptually. Use loose-anchor regexes that survive
    // light editorial changes but catch wholesale section deletions.
    const text = readFileSync(UPDATE_SNAPSHOT_DOC, 'utf-8');
    expect(text, 'Expected dev-doc to discuss when `--update-snapshots` is the right answer').toMatch(/--update-snapshots/);
    expect(text, 'Expected dev-doc to discuss the AC1-cross-check vitest pattern').toMatch(/AC1[- ]cross[- ]check|cross[- ]check vitest|AC1 cross check/i);
    expect(text, 'Expected dev-doc to discuss the pre-update verification gate / checklist').toMatch(/checklist|verification gate|pre[- ]update/i);
    expect(text, 'Expected dev-doc to discuss the commit-evidence pattern').toMatch(/commit[- ]evidence|same (PR|commit)/i);
  });
});

describe('Story 6.0 — AC4 deferred-work.md Forward-coupled provisional definitions section', () => {
  it('deferred-work.md exists', () => {
    expect(existsSync(DEFERRED_WORK)).toBe(true);
  });

  it('contains a `## Forward-coupled provisional definitions` section (AC4 T4 Subtask 4.2)', () => {
    const text = readFileSync(DEFERRED_WORK, 'utf-8');
    expect(
      text,
      'Expected `_bmad-output/implementation-artifacts/deferred-work.md` to contain `## Forward-coupled provisional definitions` section header. Story 6.0 AC4 T4 Subtask 4.2 established this as the canonical landing for future Story-X.1 forward-links per Rule 15.',
    ).toMatch(/^## Forward-coupled provisional definitions/m);
  });

  it('Forward-coupled section is anchored by Story 6.0 + cross-refs Rule 15', () => {
    const text = readFileSync(DEFERRED_WORK, 'utf-8');
    // Sub-bullet under the section header MUST anchor the section to
    // Story 6.0 (provenance) AND cross-reference Rule 15 (the rule that
    // populates this section). Catches a future edit that removes the
    // contextual paragraph or the Rule-15 cross-reference.
    expect(text).toMatch(/Established by Story 6\.0/);
    expect(text).toMatch(/Rule 15/);
  });
});

describe('Story 6.0 — Epic 5 retro action-item closure annotations (AC6 / T5)', () => {
  it('Epic 5 retro file exists', () => {
    expect(existsSync(EPIC_5_RETRO)).toBe(true);
  });

  it('rows 1, 4, 5, 6 carry `Closed by Story 6.0` annotations (T5 Subtask 5.1)', () => {
    // Rule 4 closure annotation pattern: `**Closed by Story 6.0
    // (2026-05-24):** <one-line>`. Story 6.0's AC6 binds this to rows
    // 1, 4, 5, 6. We don't pin to the exact one-line summaries (those
    // can evolve editorially), but we DO pin that the four annotations
    // exist — a future edit that drops an annotation surfaces here.
    const text = readFileSync(EPIC_5_RETRO, 'utf-8');
    const closures = text.match(/\*\*Closed by Story 6\.0 \(2026-05-24\):\*\*/g) ?? [];
    expect(
      closures.length,
      `Expected ≥4 \`**Closed by Story 6.0 (2026-05-24):**\` closure annotations in epic-5-retro-2026-05-24.md (rows 1, 4, 5, 6 per AC6 / T5). Observed ${closures.length}.`,
    ).toBeGreaterThanOrEqual(4);
  });
});

describe('Story 6.0 — Out of Scope triage table integrity (Rule 6 drift guard)', () => {
  it('Story 6.0 spec file exists', () => {
    expect(existsSync(STORY_6_0)).toBe(true);
  });

  it('Story 6.0 § "Out of Scope" cites the routing stories named in deferred-work.md', () => {
    // The story file's § "Out of Scope" enumerates Epic 5 retro action
    // items #2 / #3 / #7 / #8 deferred to specific Story 6.X
    // destinations (6.2, 6.6, 6.5, 6.2-or-6.6 per the story spec). If
    // a future edit re-routes one of these without updating
    // deferred-work.md OR vice versa, the triage table drifts. This
    // test pins the four canonical routings.
    const story = readFileSync(STORY_6_0, 'utf-8');
    // Each of the four deferred Epic-5-retro items should appear with
    // its target story. The story file's bullet style is "DEFER to
    // **Story 6.X**" — match that explicitly.
    expect(story, 'Expected Epic 5 retro Action item #2 routed to Story 6.2').toMatch(/Action item #2[\s\S]*?Story 6\.2/);
    expect(story, 'Expected Epic 5 retro Action item #3 routed to Story 6.6').toMatch(/Action item #3[\s\S]*?Story 6\.6/);
    expect(story, 'Expected Epic 5 retro Action item #7 routed to Story 6.5').toMatch(/Action item #7[\s\S]*?Story 6\.5/);
    expect(story, 'Expected Epic 5 retro Action item #8 routed to Story 6.2 OR Story 6.6').toMatch(/Action item #8[\s\S]*?(Story 6\.2.*Story 6\.6|Story 6\.6.*Story 6\.2)/);
  });
});
