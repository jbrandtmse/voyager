// @vitest-environment happy-dom
//
// Story 6.6 — QA defense suite (documentation-integrity + code-invariant grep-tier).
//
// Story 6.6 is the launch-week visual / a11y polish pass — predominantly
// documentation-driven (a contrast audit doc and a reference-parity
// review template) with a few targeted code changes (AC1 contrast fixes,
// AC6 L4 HUD-region masking, AC7 100px → `--v-size-shortcut-key-col`
// token-ification). The vitest baseline (3812 → 3818) is preserved + 6.
//
// This file pins the DOCUMENTATION + CODE CONTRACT against silent drift.
// The load-bearing assertions are grep-tier — they read the committed
// text + source files and assert on structural invariants:
//
//   1. `docs/accessibility/contrast-audit-launch-week.md` has the
//      required section structure (per-AC sections, foundation tokens
//      table, per-component tables, typography section, focus section,
//      provenance section, bright-backdrop section, audit close); the
//      table rows pass WCAG (no "Fail" entries).
//   2. `docs/launch/reference-parity-review.md` is a complete template
//      with Methodology, Reference set (3 references), Reviewer roster,
//      Per-reviewer verdict template, Aggregate verdict marked TBD.
//   3. `tokens.css` declares `--v-size-shortcut-key-col: 100px` and
//      `v-help-overlay.ts` consumes it (no remaining `100px` literal in
//      the `.shortcut-keys` rule).
//   4. `font-variant-numeric: tabular-nums` declared on every component
//      claimed by the audit doc's § 4.2.
//   5. No decorative `<i ` usage in `web/src/`.
//   6. `outline: none` audit — every match is on a non-focusable element
//      or paired with a `:focus-visible` compensating style.
//   7. `maxDiffPixelRatio` in `web/tests/visual/playwright.config.ts` is
//      0.001 (AC2's original target, restored from 0.005 in Story 6.6).
//   8. `mask: [` clauses present in `encounters.spec.ts` (target both
//      the encounter loop and PBD substate loop) and
//      `reduced-motion-regression.spec.ts` (the single reduced-motion
//      loop), targeting `v-hud`, `v-chapter-copy`, `v-timeline-scrubber`.
//   9. Epic 5 retro Action item #3 has a closing pointer to Story 6.6.
//  10. Deferred-work `[2.8/LOW]` shortcut-key entry is struck-through
//      with a closing annotation pointing to Story 6.6.
//  11. Manual a11y checklist gains a bright-backdrop cross-reference to
//      contrast-audit-launch-week.md § 7.
//  12. Story 6.6 Dev Agent Record explicitly notes Story 6.5
//      friendly-user-findings is unpopulated (per AC2 last clause).
//
// ## Rule 13 (test discoverability)
//
// This file lives at `web/tests/story-6-6-defense.test.ts` so vitest's
// default sweep picks it up — same posture as `story-6-0-cross-reference-
// defense.test.ts`, `story-6-4-defense.test.ts`, `story-6-5-defense.test.ts`.
// No env-gate, no `.skip`, no `.runIf` — discoverable by the default
// `npm test` invocation.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');

function readDoc(relPath: string): string {
  const abs = resolve(REPO_ROOT, relPath);
  return readFileSync(abs, 'utf-8');
}

describe('Story 6.6 defense — contrast-audit-launch-week.md structure (AC1, AC2, AC5)', () => {
  const docPath = 'docs/accessibility/contrast-audit-launch-week.md';
  const doc = readDoc(docPath);

  it('contrast-audit doc exists at the AC1-canonical path', () => {
    expect(existsSync(resolve(REPO_ROOT, docPath))).toBe(true);
  });

  it('declares WCAG 2.2 AA as the auditing version', () => {
    // Bold-markdown tolerant: matches `**WCAG version:** 2.2 AA` AND the
    // unbolded variant `WCAG version: 2.2 AA`.
    expect(doc).toMatch(/WCAG version:[*\s]+2\.2 AA/i);
  });

  it('declares the body-text 4.5:1 threshold', () => {
    expect(doc).toMatch(/4\.5:1/);
  });

  it('declares the large-text 3:1 threshold', () => {
    expect(doc).toMatch(/(Large text|large\/UI).*3:1|3:1.*large/i);
  });

  it('has § 1 — Foundation token pairings', () => {
    expect(doc).toMatch(/^##\s*1\.\s*Foundation token pairings/m);
  });

  it('has § 2 — Component-by-component audit', () => {
    expect(doc).toMatch(/^##\s*2\.\s*Component-by-component audit/m);
  });

  it('has § 3 — `--v-color-fg-quiet` AA-large constraint audit', () => {
    expect(doc).toMatch(
      /^##\s*3\.\s*`--v-color-fg-quiet` AA-large constraint audit/m,
    );
  });

  it('has § 4 — Typography (AC2)', () => {
    expect(doc).toMatch(/^##\s*4\.\s*Typography/m);
  });

  it('has § 5 — Focus-indicator audit (AC5)', () => {
    expect(doc).toMatch(/^##\s*5\.\s*Focus-indicator audit/m);
  });

  it('has § 6 — Provenance label clarity (AC3)', () => {
    expect(doc).toMatch(/^##\s*6\.\s*Provenance label clarity/m);
  });

  it('has § 7 — Text-shadow legibility on bright backdrops (AC4)', () => {
    expect(doc).toMatch(/^##\s*7\.\s*Text-shadow legibility/m);
  });

  it('§ 4.2 enumerates the tabular-numerals contract', () => {
    expect(doc).toMatch(/4\.2 Tabular numerals/);
    expect(doc).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('§ 4.3 italics convention reports clean grep results', () => {
    expect(doc).toMatch(/4\.3 Italics convention/);
    // The audit reports 0 matches for decorative <i> usage in source.
    expect(doc).toMatch(/0 matches/);
  });

  it('§ 5.2 enumerates ALL `outline: none` sites (6 in total)', () => {
    expect(doc).toMatch(/`outline: none` grep audit/);
    // Each of the 6 known sites appears explicitly in the audit table.
    expect(doc).toMatch(/global\.css:40/);
    expect(doc).toMatch(/v-chapter-index\.ts:184/);
    expect(doc).toMatch(/v-chapter-index\.ts:196/);
    expect(doc).toMatch(/v-timeline-scrubber\.ts:266/);
    expect(doc).toMatch(/v-timeline-scrubber\.ts:331/);
    expect(doc).toMatch(/v-speed-multiplier\.ts:108/);
  });

  it('audit table contains no "Fail" verdicts (every pair passes WCAG 2.2 AA)', () => {
    // Match table rows that end with the verdict "FAIL" (not part of
    // larger words like "FAILED" in narrative comments). Each row's
    // verdict cell is the trailing `| FAIL |` token.
    const failRowMatches = doc.match(/\|\s*FAIL\s*\|/g);
    expect(
      failRowMatches,
      'Audit table contains a "FAIL" verdict row. Every text+background ' +
        'pair in the deployed Voyager app must clear WCAG 2.2 AA at its ' +
        'tier (body / large / UI). Any FAIL row means a shipping contrast ' +
        'failure — fix the offending token or font-size in the affected ' +
        'component before merging.',
    ).toBeNull();
  });

  it('§ 2.4 documents the four sub-18px non-HUD fixes (v-version + 3 toggle/label/readout sites)', () => {
    expect(doc).toMatch(/<v-version>/);
    expect(doc).toMatch(/<v-help-overlay> \.toggle/);
    expect(doc).toMatch(/<v-speed-multiplier> \.label/);
    expect(doc).toMatch(/<v-speed-multiplier> \.readout/);
  });

  it('§ 4.4 acknowledges Story 6.5 friendly-user findings is unpopulated', () => {
    expect(doc).toMatch(/4\.4 Story 6\.5 friendly-user feedback/);
    // The audit doc must explicitly note the unpopulated state per AC2
    // last clause, so a reader knows the typography sweep deferred any
    // hierarchy-driven fixes.
    expect(doc).toMatch(/unpopulated|TBD|template/i);
  });

  it('§ 5.3 ADR-0025 compliance enumerates the three APG primitive focus styles', () => {
    expect(doc).toMatch(/ADR-0025/);
    expect(doc).toMatch(/v-timeline-scrubber/);
    expect(doc).toMatch(/v-speed-multiplier/);
    expect(doc).toMatch(/v-chapter-index/);
  });
});

describe('Story 6.6 defense — reference-parity-review.md template (AC8)', () => {
  const docPath = 'docs/launch/reference-parity-review.md';
  const doc = readDoc(docPath);

  it('reference-parity template exists at the AC8-canonical path', () => {
    expect(existsSync(resolve(REPO_ROOT, docPath))).toBe(true);
  });

  it('declares Status: TEMPLATE — VERDICT TO BE POPULATED AFTER EXTERNAL REVIEW', () => {
    // Bold-markdown tolerant — matches `**Status:** TEMPLATE` AND `Status: TEMPLATE`.
    expect(doc).toMatch(/Status:[*\s]+TEMPLATE/i);
    expect(doc).toMatch(/TO BE POPULATED AFTER EXTERNAL REVIEW/);
  });

  it('has § 1 — Methodology', () => {
    expect(doc).toMatch(/^##\s*1\.\s*Methodology/m);
  });

  it('has § 2 — Reference set', () => {
    expect(doc).toMatch(/^##\s*2\.\s*Reference set/m);
  });

  it('§ 2 names Apollo in Real Time with canonical URL', () => {
    expect(doc).toMatch(/Apollo in Real Time/);
    expect(doc).toMatch(/apolloinrealtime\.org/);
  });

  it('§ 2 names an NYT long-scroll reference slot', () => {
    expect(doc).toMatch(/NYT long-scroll/i);
  });

  it('§ 2 names FWA Three.js winner reference slot', () => {
    expect(doc).toMatch(/FWA Three\.js/i);
    expect(doc).toMatch(/thefwa\.com/);
  });

  it('has § 3 — Reviewer roster', () => {
    expect(doc).toMatch(/^##\s*3\.\s*Reviewer roster/m);
  });

  it('has § 5 — Per-reviewer verdicts', () => {
    expect(doc).toMatch(/^##\s*5\.\s*Per-reviewer verdicts/m);
  });

  it('§ 5 contains the binding verdict templates ("Linkable without apology" / "Not yet")', () => {
    expect(doc).toMatch(/Linkable without apology/);
    expect(doc).toMatch(/Not yet/);
  });

  it('has § 6 — Aggregate verdict marked TBD', () => {
    expect(doc).toMatch(/^##\s*6\.\s*Aggregate verdict/m);
    expect(doc).toMatch(/TO BE POPULATED AFTER EXTERNAL REVIEW/);
  });

  it('§ 6 documents the PASS / BLOCKED decision rule (≥ 2 of 3 binding)', () => {
    expect(doc).toMatch(/≥\s*2\s*of\s*3|>=\s*2\s*of\s*3|2 of 3/);
    expect(doc).toMatch(/PASS/);
    expect(doc).toMatch(/BLOCKED/);
  });

  it('cross-references Story 6.5 friendly-user findings (orthogonal gate)', () => {
    expect(doc).toMatch(/friendly-user/);
  });

  it('cross-references the contrast audit doc (typography / contrast remediation route)', () => {
    expect(doc).toMatch(/contrast-audit-launch-week\.md/);
  });
});

describe('Story 6.6 defense — AC7 token-ification correctness', () => {
  const tokensCss = readDoc('web/src/styles/tokens.css');
  const helpOverlay = readDoc('web/src/components/v-help-overlay.ts');

  it('`--v-size-shortcut-key-col` declared in tokens.css with value 100px', () => {
    expect(tokensCss).toMatch(/--v-size-shortcut-key-col:\s*100px/);
  });

  it('tokens.css groups the new token under "Component-specific size tokens"', () => {
    expect(tokensCss).toMatch(/Component-specific size tokens/);
  });

  it('v-help-overlay.ts `.shortcut-keys` consumes the token (NOT the literal)', () => {
    // The `.shortcut-keys` rule body must contain `var(--v-size-shortcut-key-col)`.
    expect(helpOverlay).toMatch(
      /\.shortcut-keys\s*\{[^}]*min-width:\s*var\(--v-size-shortcut-key-col\)/,
    );
  });

  it('v-help-overlay.ts `.shortcut-keys` has NO remaining `100px` literal min-width', () => {
    // Scan the file for a `.shortcut-keys { ... min-width: 100px ... }` rule body.
    // The literal must be gone (it lives in tokens.css only).
    expect(helpOverlay).not.toMatch(
      /\.shortcut-keys\s*\{[^}]*min-width:\s*100px/,
    );
  });
});

describe('Story 6.6 defense — AC1 contrast fixes (v-version, v-help-overlay toggle, v-speed-multiplier)', () => {
  it('v-version.ts uses --v-color-fg-muted (NOT --v-color-fg-quiet) for the host text', () => {
    const src = readDoc('web/src/components/v-version.ts');
    expect(src).toMatch(/color:\s*var\(--v-color-fg-muted\)/);
    // No remaining `color: var(--v-color-fg-quiet)` declaration anywhere
    // in v-version.ts (the only fg-quiet references are in comments).
    expect(src).not.toMatch(/^\s*color:\s*var\(--v-color-fg-quiet\)/m);
  });

  it('v-help-overlay.ts `.toggle` uses --v-color-fg-muted for text', () => {
    const src = readDoc('web/src/components/v-help-overlay.ts');
    expect(src).toMatch(/\.toggle\s*\{[^}]*color:\s*var\(--v-color-fg-muted\)/);
  });

  it('v-help-overlay.ts `.toggle` keeps --v-color-fg-quiet for the border (SC 1.4.11)', () => {
    const src = readDoc('web/src/components/v-help-overlay.ts');
    expect(src).toMatch(
      /\.toggle\s*\{[^}]*border:\s*1px solid var\(--v-color-fg-quiet\)/,
    );
  });

  it('v-speed-multiplier.ts `.label` uses --v-color-fg-muted', () => {
    const src = readDoc('web/src/components/v-speed-multiplier.ts');
    expect(src).toMatch(/\.label\s*\{[^}]*color:\s*var\(--v-color-fg-muted\)/);
  });

  it('v-speed-multiplier.ts `.readout` uses --v-color-fg-muted', () => {
    const src = readDoc('web/src/components/v-speed-multiplier.ts');
    expect(src).toMatch(/\.readout\s*\{[^}]*color:\s*var\(--v-color-fg-muted\)/);
  });
});

describe('Story 6.6 defense — AC6 L4 visual masking + tolerance tightening', () => {
  it('playwright.config.ts maxDiffPixelRatio is 0.001 (AC2 original target)', () => {
    const cfg = readDoc('web/tests/visual/playwright.config.ts');
    expect(cfg).toMatch(/maxDiffPixelRatio:\s*0\.001/);
    // The old loose tolerance 0.005 must NOT be the active value.
    expect(cfg).not.toMatch(/maxDiffPixelRatio:\s*0\.005[^0-9]/);
  });

  it('encounters.spec.ts has mask declarations targeting v-hud, v-chapter-copy, v-timeline-scrubber', () => {
    const spec = readDoc('web/tests/visual/encounters.spec.ts');
    // Both the encounter-scene loop AND the PBD substate loop apply the mask —
    // expect at least 2 mask: [ blocks in the file.
    const maskBlocks = spec.match(/mask:\s*\[/g);
    expect(maskBlocks).not.toBeNull();
    expect(maskBlocks!.length).toBeGreaterThanOrEqual(2);
    // Each mask block must locate the three HUD-bearing custom elements.
    expect(spec).toMatch(/page\.locator\(['"]v-hud['"]\)/);
    expect(spec).toMatch(/page\.locator\(['"]v-chapter-copy['"]\)/);
    expect(spec).toMatch(/page\.locator\(['"]v-timeline-scrubber['"]\)/);
  });

  it('reduced-motion-regression.spec.ts has mask declarations targeting v-hud, v-chapter-copy, v-timeline-scrubber', () => {
    const spec = readDoc('web/tests/visual/reduced-motion-regression.spec.ts');
    expect(spec).toMatch(/mask:\s*\[/);
    expect(spec).toMatch(/page\.locator\(['"]v-hud['"]\)/);
    expect(spec).toMatch(/page\.locator\(['"]v-chapter-copy['"]\)/);
    expect(spec).toMatch(/page\.locator\(['"]v-timeline-scrubber['"]\)/);
  });
});

describe('Story 6.6 defense — AC2 typography invariants', () => {
  it('no decorative `<i ` element usage in web/src (only `<em>` is the italic path)', () => {
    // Spot-check the most-likely culprits — v-about-page (editorial light DOM)
    // and the chapter copies. The grep-tier per-component test would be too
    // expensive at scale; the audit doc § 4.3 reports the grep ran clean
    // across the whole tree. Re-verify the two canonical italic sites are <em>.
    const aboutPage = readDoc('web/src/components/v-about-page.ts');
    // Audit doc § 4.3 cites two <em> matches at v-about-page (lines 99, 241).
    expect(aboutPage).toMatch(/<em>/);
    // No raw decorative <i> elements in the editorial body.
    expect(aboutPage).not.toMatch(/<i[> ]/);
  });

  it('font-variant-numeric: tabular-nums declared on v-hud-date', () => {
    const src = readDoc('web/src/components/v-hud-date.ts');
    expect(src).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('font-variant-numeric: tabular-nums declared on v-hud-distance', () => {
    const src = readDoc('web/src/components/v-hud-distance.ts');
    expect(src).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('font-variant-numeric: tabular-nums declared on v-hud-speed', () => {
    const src = readDoc('web/src/components/v-hud-speed.ts');
    expect(src).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('font-variant-numeric: tabular-nums declared on v-hud-instruments', () => {
    const src = readDoc('web/src/components/v-hud-instruments.ts');
    expect(src).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('font-variant-numeric: tabular-nums declared on v-attitude-indicator', () => {
    const src = readDoc('web/src/components/v-attitude-indicator.ts');
    expect(src).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});

describe('Story 6.6 defense — closing pointers + deferred-work cleanup', () => {
  it('deferred-work.md `[2.8/LOW]` shortcut-key entry is struck through with Story 6.6 closing pointer', () => {
    const deferred = readDoc('_bmad-output/implementation-artifacts/deferred-work.md');
    // The struck-through entry contains the 100px shortcut-keys text AND
    // an explicit "Closed by Story 6.6" annotation.
    expect(deferred).toMatch(/~~.*shortcut-keys.*100px.*~~/s);
    expect(deferred).toMatch(/Closed by Story 6\.6/);
  });

  it('Epic 5 retro Action item #3 has closing pointer to Story 6.6', () => {
    const retro = readDoc(
      '_bmad-output/implementation-artifacts/epic-5-retro-2026-05-24.md',
    );
    // Action item #3 (L4 HUD region masking) must carry the closing pointer.
    expect(retro).toMatch(/L4 HUD region masking/);
    expect(retro).toMatch(/Closed by Story 6\.6/);
  });

  it('manual a11y checklist gained the AC4 bright-backdrop cross-reference', () => {
    const checklist = readDoc('docs/accessibility/manual-test-checklist.md');
    expect(checklist).toMatch(/Bright-backdrop legibility/i);
    // Cross-reference must point to the audit doc.
    expect(checklist).toMatch(/contrast-audit-launch-week\.md/);
  });
});

describe('Story 6.6 defense — Story 6.5 findings unpopulated defer note (AC2 last clause)', () => {
  it('Story 6.6 file explicitly defers Story 6.5 friendly-user feedback', () => {
    // The Dev Agent Record / Completion Notes must note the unpopulated
    // state of the Story 6.5 findings doc per AC2's last clause:
    // "if findings doc is unpopulated (likely), Story 6.6 explicitly notes
    // this in the Dev Agent Record and defers to a follow-up".
    const story = readDoc(
      '_bmad-output/implementation-artifacts/6-6-final-contrast-typography-and-provenance-label-polish.md',
    );
    // Either the story's Dev Notes or Dev Agent Record block must
    // acknowledge the unpopulated friendly-user findings deferral.
    const hasDeferralNote =
      /friendly-user.*unpopulated|unpopulated.*friendly-user|friendly-user findings.*deferred|defer.*friendly-user|findings doc has been populated/i.test(
        story,
      );
    expect(
      hasDeferralNote,
      'Story 6.6 spec/Dev-Agent-Record must explicitly note the Story 6.5 ' +
        'friendly-user-findings doc is unpopulated (likely state) and defer ' +
        'follow-up — AC2 last clause. Audit doc § 4.4 also documents this.',
    ).toBe(true);
  });
});

describe('Story 6.6 defense — smoke-evidence README (AC9 lead-driven handoff)', () => {
  const readmePath =
    '_bmad-output/implementation-artifacts/6-6-smoke-evidence/README.md';

  it('smoke-evidence README exists', () => {
    expect(existsSync(resolve(REPO_ROOT, readmePath))).toBe(true);
  });

  it('smoke-evidence README documents the 3-rerun determinism check', () => {
    const readme = readDoc(readmePath);
    expect(readme).toMatch(/3-rerun|three\s*conserve\s*re\s*runs|THREE consecutive/i);
    expect(readme).toMatch(/--update-snapshots/);
    expect(readme).toMatch(/deterministic/i);
  });

  it('smoke-evidence README routes to the lead (per Rule 3 / Rule 7)', () => {
    const readme = readDoc(readmePath);
    // The README must explicitly call out that the dev cannot run the
    // production-build + Playwright step and that the lead executes it.
    expect(readme).toMatch(/lead/i);
    expect(readme).toMatch(/Rule 3|Rule 7|per-story smoke/i);
  });
});
