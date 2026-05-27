// @vitest-environment happy-dom
//
// Story 6.4 — QA defense suite.
//
// Five defense-tier blocks layered on top of Story 6.4's dev artifacts.
// Each block guards a discrete regression surface the dev opened during
// the axe-core CI expansion + manual-checklist authorship + Rule 9
// third-consumer extraction. Failures in this file mean a contract the
// Story 6.4 dev relied on has silently regressed.
//
//   1. In-place a11y fix regression defense — the three critical / serious
//      axe-core violations the dev fixed in-place during Story 6.4 must
//      stay fixed. (a) `<v-timeline-scrubber>` `aria-valuenow` numeric,
//      not ISO; (b) `<v-hud-instruments>` MUST NOT carry `role="row"`;
//      (c) any `aria-hidden="true"` element in a Lit shadow tree carrying
//      focusable content must be paired with `inert`.
//   2. Manual a11y checklist + run-record file integrity — the
//      maintainer's binding gate doc structure (9 Passes) must remain
//      present and the 2026-05-24 first-run record must reference it.
//   3. Dialog primitive consumer migration — both `<v-help-overlay>` and
//      `<v-chapter-index>` must import + delegate to `createDialogFocusTrap`
//      (no inline `createFocusTrap` re-instantiation in either).
//   4. Rule 16 + skill-rules.md sequence integrity — Rules 14, 15, 16
//      land in order; Rule 16 names the manual checklist.
//   5. CI workflow file sanity — `.github/workflows/ci.yml` parses
//      structurally; the `l4-a11y-routes` job is wired through `needs:`
//      from `build` into `deploy-cloudflare`.
//
// File path is pinned as the single closure file for Story 6.4 defense.
// File-system reads use `node:fs` per the existing project pattern
// (mirrors `bug-fix-batch-2026-05-23-defense.test.ts`).

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import '../src/components/v-timeline-scrubber';
import '../src/components/v-hud-instruments';
import '../src/components/v-help-overlay';
import '../src/components/v-chapter-index';
import type { VTimelineScrubber } from '../src/components/v-timeline-scrubber';
import type { VHelpOverlay } from '../src/components/v-help-overlay';
import type { VChapterIndex } from '../src/components/v-chapter-index';
import {
  MISSION_START_ET,
  MISSION_END_ET,
} from '../src/constants/mission';

// ─── repo paths (cwd is `web/` under vitest) ─────────────────────────

const REPO_ROOT = resolve(__dirname, '..', '..');
const PATHS = {
  helpOverlay: resolve(REPO_ROOT, 'web/src/components/v-help-overlay.ts'),
  chapterIndex: resolve(REPO_ROOT, 'web/src/components/v-chapter-index.ts'),
  timelineScrubber: resolve(
    REPO_ROOT,
    'web/src/components/v-timeline-scrubber.ts',
  ),
  hudInstruments: resolve(
    REPO_ROOT,
    'web/src/components/v-hud-instruments.ts',
  ),
  dialogPrimitive: resolve(REPO_ROOT, 'web/src/primitives/dialog.ts'),
  checklist: resolve(REPO_ROOT, 'docs/accessibility/manual-test-checklist.md'),
  firstRun: resolve(
    REPO_ROOT,
    'docs/accessibility/manual-test-runs/2026-05-24.md',
  ),
  skillRules: resolve(REPO_ROOT, '_bmad/custom/skill-rules.md'),
  ci: resolve(REPO_ROOT, '.github/workflows/ci.yml'),
};

// ─── stub clock for the scrubber ───────────────────────────────────

function makeStubClock(et: number): unknown {
  let t = et;
  const subs = new Set<() => void>();
  return {
    get simTimeEt(): number {
      return t;
    },
    get playing(): boolean {
      return false;
    },
    get playbackRate(): number {
      return 1;
    },
    play(): void {},
    pause(): void {},
    setRate(_n: number): void {},
    scrubTo(n: number): void {
      t = n;
      subs.forEach((s) => s());
    },
    subscribe(cb: () => void): () => void {
      subs.add(cb);
      return (): void => {
        subs.delete(cb);
      };
    },
  };
}

// ════════════════════════════════════════════════════════════════════
// Block 1 — In-place a11y fix regression defense
// ════════════════════════════════════════════════════════════════════

describe('Story 6.4 defense — Block 1.a — <v-timeline-scrubber> aria-valuenow MUST be numeric (axe-core aria-valid-attr-value)', () => {
  afterEach(() => {
    document
      .querySelectorAll('v-timeline-scrubber')
      .forEach((el) => el.remove());
  });

  const NUMERIC_RE = /^-?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;
  const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

  it('mission variant — aria-valuenow at mission start is a finite numeric string, not an ISO timestamp', async () => {
    const el = document.createElement(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    el.variant = 'mission';
    (el as unknown as { clockManager: unknown }).clockManager =
      makeStubClock(MISSION_START_ET);
    document.body.appendChild(el);
    await el.updateComplete;
    const slider = el.shadowRoot?.querySelector('[role="slider"]');
    const valueNow = slider?.getAttribute('aria-valuenow') ?? '';
    expect(valueNow).not.toBe('');
    expect(valueNow).toMatch(NUMERIC_RE);
    expect(valueNow).not.toMatch(ISO_RE);
    // And the value must be finite (the regression mode was Lit
    // coercing `undefined` to the string "undefined" or "NaN").
    expect(Number.isFinite(Number(valueNow))).toBe(true);
  });

  it('mission variant — aria-valuenow at mission end is a finite numeric string', async () => {
    const el = document.createElement(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    el.variant = 'mission';
    (el as unknown as { clockManager: unknown }).clockManager =
      makeStubClock(MISSION_END_ET);
    document.body.appendChild(el);
    await el.updateComplete;
    const slider = el.shadowRoot?.querySelector('[role="slider"]');
    const valueNow = slider?.getAttribute('aria-valuenow') ?? '';
    expect(valueNow).toMatch(NUMERIC_RE);
    expect(valueNow).not.toMatch(ISO_RE);
    expect(Number.isFinite(Number(valueNow))).toBe(true);
  });

  it('aria-valuetext carries the human-readable ISO form (sister contract to numeric aria-valuenow)', async () => {
    const el = document.createElement(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    el.variant = 'mission';
    (el as unknown as { clockManager: unknown }).clockManager =
      makeStubClock(MISSION_START_ET + 86400 * 365);
    document.body.appendChild(el);
    await el.updateComplete;
    const slider = el.shadowRoot?.querySelector('[role="slider"]');
    const valueText = slider?.getAttribute('aria-valuetext') ?? '';
    // The human-readable form is the YYYY-MM-DD prefix produced by
    // `formatForHud`. The exact format is owned by v-hud-date / formatForHud
    // tests; here we only assert the date-like shape is present and that
    // it is DIFFERENT from aria-valuenow.
    const valueNow = slider?.getAttribute('aria-valuenow') ?? '';
    expect(valueText).not.toBe('');
    expect(valueText).toMatch(/\d{4}/); // contains a 4-digit year
    expect(valueText).not.toBe(valueNow);
  });

  it('source pin — render() does NOT pass an ISO string to aria-valuenow (grep-style guard)', () => {
    const src = readFileSync(PATHS.timelineScrubber, 'utf8');
    // The forbidden pattern is `aria-valuenow=${isoFromEt(...)}` or any
    // direct ISO-producer pipe into aria-valuenow. The current form
    // routes `aria-valuenow=${valueNow}` where `valueNow = String(this.simEt)`.
    // Re-introducing `isoFromEt` into aria-valuenow's value would be the
    // exact regression.
    expect(src).not.toMatch(/aria-valuenow=\$\{[^}]*iso[A-Z]/);
    expect(src).not.toMatch(/aria-valuenow=\$\{[^}]*Iso[a-z]/);
  });
});

describe('Story 6.4 defense — Block 1.b — <v-hud-instruments> MUST NOT carry role="row"', () => {
  afterEach(() => {
    document
      .querySelectorAll('v-hud-instruments')
      .forEach((el) => el.remove());
  });

  it('rendered shadow root contains zero role="row" elements (axe-core aria-required-parent regression guard)', async () => {
    const el = document.createElement('v-hud-instruments');
    document.body.appendChild(el);
    const maybeLit = el as unknown as { updateComplete?: Promise<unknown> };
    if (maybeLit.updateComplete) await maybeLit.updateComplete;
    const rows = el.shadowRoot?.querySelectorAll('[role="row"]');
    expect(rows?.length ?? 0).toBe(0);
  });

  it('rendered shadow root carries role="group" on each row container (the corrected semantics)', async () => {
    const el = document.createElement('v-hud-instruments');
    document.body.appendChild(el);
    const maybeLit = el as unknown as { updateComplete?: Promise<unknown> };
    if (maybeLit.updateComplete) await maybeLit.updateComplete;
    const groups = el.shadowRoot?.querySelectorAll('[role="group"]');
    // Two spacecraft × one row each = two groups.
    expect(groups?.length ?? 0).toBeGreaterThanOrEqual(2);
    // And each group carries an aria-label naming the spacecraft.
    groups?.forEach((g) => {
      const label = g.getAttribute('aria-label');
      expect(label).not.toBeNull();
      expect(label).toMatch(/instrument status/i);
    });
  });

  it('source pin — render() does NOT contain `role="row"` (grep-style guard)', () => {
    const src = readFileSync(PATHS.hudInstruments, 'utf8');
    // Allow `role="row"` to appear inside comments (the file's a11y-fix
    // commentary legitimately quotes the rejected `role="row"` token).
    // Strip both block comments AND line comments before the grep so the
    // regression guard fires only on live code.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(stripped).not.toMatch(/role="row"/);
    expect(stripped).not.toMatch(/role='row'/);
  });
});

describe('Story 6.4 defense — Block 1.c — aria-hidden="true" on focusable shadow content MUST be paired with inert (axe-core aria-hidden-focus)', () => {
  afterEach(() => {
    document.querySelectorAll('v-help-overlay').forEach((el) => el.remove());
    document.querySelectorAll('v-chapter-index').forEach((el) => el.remove());
    document
      .querySelectorAll('v-timeline-scrubber')
      .forEach((el) => el.remove());
  });

  it('<v-help-overlay> closed — dialog has aria-hidden="true" AND inert attribute', async () => {
    const el = document.createElement('v-help-overlay') as VHelpOverlay;
    document.body.appendChild(el);
    await el.updateComplete;
    const dialog = el.shadowRoot?.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-hidden')).toBe('true');
    expect(dialog?.hasAttribute('inert')).toBe(true);
  });

  it('<v-help-overlay> open — aria-hidden flips to "false" AND inert is removed', async () => {
    const el = document.createElement('v-help-overlay') as VHelpOverlay;
    document.body.appendChild(el);
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    const dialog = el.shadowRoot?.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-hidden')).toBe('false');
    expect(dialog?.hasAttribute('inert')).toBe(false);
  });

  it('<v-chapter-index> closed — panel has aria-hidden="true" AND inert attribute', async () => {
    const el = document.createElement('v-chapter-index') as VChapterIndex;
    document.body.appendChild(el);
    await el.updateComplete;
    const panel = el.shadowRoot?.querySelector('.panel');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
    expect(panel?.hasAttribute('inert')).toBe(true);
  });

  it('<v-chapter-index> open — aria-hidden flips to "false" AND inert is removed', async () => {
    const el = document.createElement('v-chapter-index') as VChapterIndex;
    document.body.appendChild(el);
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    const panel = el.shadowRoot?.querySelector('.panel');
    expect(panel?.getAttribute('aria-hidden')).toBe('false');
    expect(panel?.hasAttribute('inert')).toBe(false);
  });

  it('<v-timeline-scrubber variant="detail"> closed — host carries aria-hidden="true" AND inert', async () => {
    const el = document.createElement(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    el.variant = 'detail';
    el.rangeStart = MISSION_START_ET + 86400 * 100;
    el.rangeEnd = MISSION_START_ET + 86400 * 110;
    (el as unknown as { clockManager: unknown }).clockManager =
      makeStubClock(MISSION_START_ET + 86400 * 105);
    document.body.appendChild(el);
    await el.updateComplete;
    // Default detail-variant state is closed; the host element should
    // carry both aria-hidden="true" AND inert (paired per Story 6.4 AC1).
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.hasAttribute('inert')).toBe(true);
  });

  it('source pin — v-help-overlay template binds aria-hidden + inert together', () => {
    const src = readFileSync(PATHS.helpOverlay, 'utf8');
    // The canonical wiring is two adjacent template attributes on the
    // dialog element. Grep for the pattern that ties them together.
    expect(src).toMatch(/aria-hidden=\$\{this\.open \? 'false' : 'true'\}/);
    expect(src).toMatch(/\?inert=\$\{!this\.open\}/);
  });

  it('source pin — v-chapter-index template binds aria-hidden + inert together', () => {
    const src = readFileSync(PATHS.chapterIndex, 'utf8');
    expect(src).toMatch(/aria-hidden=\$\{this\.open \? 'false' : 'true'\}/);
    expect(src).toMatch(/\?inert=\$\{!this\.open\}/);
  });
});

// ════════════════════════════════════════════════════════════════════
// Block 2 — Manual a11y checklist + first-run record file integrity
// ════════════════════════════════════════════════════════════════════

describe('Story 6.4 defense — Block 2 — manual a11y checklist + first-run record integrity (AC3 + AC4)', () => {
  it('docs/accessibility/manual-test-checklist.md exists', () => {
    expect(existsSync(PATHS.checklist)).toBe(true);
  });

  it('docs/accessibility/manual-test-runs/2026-05-24.md exists', () => {
    expect(existsSync(PATHS.firstRun)).toBe(true);
  });

  // The AC3 enumerated 9 Passes. The checklist's section headings must
  // all be present; if a Pass goes missing the contract has regressed.
  const REQUIRED_PASS_HEADINGS = [
    /## Pass 1 — Keyboard-only navigation/,
    /## Pass 2 — VoiceOver on macOS Safari/,
    /## Pass 3 — NVDA on Windows Firefox/,
    /## Pass 4 — TalkBack on Android Chrome/,
    /## Pass 5 — Color blindness simulation/,
    /## Pass 6 — Forced-colors mode/,
    /## Pass 7 — `prefers-reduced-transparency: reduce`/,
    /## Pass 8 — Reduced-motion cross-check/,
    /## Pass 9 — Photosensitive-epilepsy audit \(NFR-A6\)/,
  ];

  it('checklist contains all 9 required Pass headings', () => {
    const src = readFileSync(PATHS.checklist, 'utf8');
    for (const re of REQUIRED_PASS_HEADINGS) {
      expect(src).toMatch(re);
    }
  });

  it('checklist references the reduced-motion audit doc (Story 6.3 cross-link)', () => {
    const src = readFileSync(PATHS.checklist, 'utf8');
    expect(src).toMatch(/reduced-motion\.md/);
  });

  it('checklist explicitly invokes skill-rules.md Rule 16 (gate cadence)', () => {
    const src = readFileSync(PATHS.checklist, 'utf8');
    expect(src).toMatch(/skill-rules\.md/);
    expect(src).toMatch(/Rule 16/);
  });

  it('first-run record references the checklist file', () => {
    const src = readFileSync(PATHS.firstRun, 'utf8');
    expect(src).toMatch(/manual-test-checklist\.md/);
  });

  it('first-run record carries a sign-off line (closure contract per checklist Sign-off section)', () => {
    const src = readFileSync(PATHS.firstRun, 'utf8');
    // Acceptable forms per the checklist: PASS / CONDITIONAL PASS / FAIL.
    expect(src).toMatch(/Sign-off.*\(2026-05-24/);
    expect(src).toMatch(/\b(CONDITIONAL PASS|PASS|FAIL)\b/);
  });
});

// ════════════════════════════════════════════════════════════════════
// Block 3 — Dialog primitive consumer migration
// ════════════════════════════════════════════════════════════════════

describe('Story 6.4 defense — Block 3 — dialog primitive consumer migration (Rule 9 third-consumer extraction)', () => {
  it('primitives/dialog.ts exists', () => {
    expect(existsSync(PATHS.dialogPrimitive)).toBe(true);
  });

  it('primitives/dialog.ts exports createDialogFocusTrap', () => {
    const src = readFileSync(PATHS.dialogPrimitive, 'utf8');
    expect(src).toMatch(/export function createDialogFocusTrap/);
  });

  it('v-help-overlay imports createDialogFocusTrap from the primitive', () => {
    const src = readFileSync(PATHS.helpOverlay, 'utf8');
    // The import path resolves to ../primitives/dialog (from components/).
    expect(src).toMatch(/createDialogFocusTrap/);
    expect(src).toMatch(/from ['"]\.\.\/primitives\/dialog['"]/);
  });

  it('v-help-overlay invokes createDialogFocusTrap() (no inline focus-trap re-instantiation)', () => {
    const src = readFileSync(PATHS.helpOverlay, 'utf8');
    expect(src).toMatch(/createDialogFocusTrap\(/);
    // Inline `createFocusTrap(` calls (from the `focus-trap` library
    // directly) are the regression mode this defense guards.
    expect(src).not.toMatch(/createFocusTrap\(/);
    // And the consumer must NOT import `createFocusTrap` directly.
    expect(src).not.toMatch(/import\s*\{[^}]*createFocusTrap[^}]*\}\s*from\s*['"]focus-trap['"]/);
  });

  it('v-chapter-index imports createDialogFocusTrap from the primitive', () => {
    const src = readFileSync(PATHS.chapterIndex, 'utf8');
    expect(src).toMatch(/createDialogFocusTrap/);
    expect(src).toMatch(/from ['"]\.\.\/primitives\/dialog['"]/);
  });

  it('v-chapter-index invokes createDialogFocusTrap() (no inline focus-trap re-instantiation)', () => {
    const src = readFileSync(PATHS.chapterIndex, 'utf8');
    expect(src).toMatch(/createDialogFocusTrap\(/);
    expect(src).not.toMatch(/createFocusTrap\(/);
    expect(src).not.toMatch(/import\s*\{[^}]*createFocusTrap[^}]*\}\s*from\s*['"]focus-trap['"]/);
  });

  it('only the primitive module imports createFocusTrap from the focus-trap library (the encapsulation invariant)', () => {
    const primitive = readFileSync(PATHS.dialogPrimitive, 'utf8');
    expect(primitive).toMatch(/createFocusTrap/);
    expect(primitive).toMatch(/from ['"]focus-trap['"]/);
    // Consumers must NOT import from `focus-trap` directly (encapsulation).
    for (const consumerPath of [PATHS.helpOverlay, PATHS.chapterIndex]) {
      const src = readFileSync(consumerPath, 'utf8');
      expect(src).not.toMatch(/from ['"]focus-trap['"]/);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// Block 4 — Rule 16 + skill-rules.md sequence integrity
// ════════════════════════════════════════════════════════════════════

describe('Story 6.4 defense — Block 4 — skill-rules.md Rule 14 / 15 / 16 sequence integrity', () => {
  it('skill-rules.md exists', () => {
    expect(existsSync(PATHS.skillRules)).toBe(true);
  });

  it('Rule 14, 15, 16 headings are all present and appear in order', () => {
    const src = readFileSync(PATHS.skillRules, 'utf8');
    const r14 = src.indexOf('## Rule 14');
    const r15 = src.indexOf('## Rule 15');
    const r16 = src.indexOf('## Rule 16');
    expect(r14).toBeGreaterThan(0);
    expect(r15).toBeGreaterThan(r14);
    expect(r16).toBeGreaterThan(r15);
  });

  it('Rule 16 names the manual a11y checklist (cross-reference target)', () => {
    const src = readFileSync(PATHS.skillRules, 'utf8');
    // Slice out the Rule 16 section so the assertion is scoped.
    const r16Start = src.indexOf('## Rule 16');
    // Rule 16 is the last rule today; if a later rule lands we slice to it.
    const r17Start = src.indexOf('## Rule 17', r16Start);
    const r16Section = src.slice(
      r16Start,
      r17Start === -1 ? src.length : r17Start,
    );
    expect(r16Section).toMatch(/manual-test-checklist\.md/);
    expect(r16Section).toMatch(/Phase milestone/i);
  });

  it('Rule 9 mentions the dialog primitive (third-consumer extraction)', () => {
    const src = readFileSync(PATHS.skillRules, 'utf8');
    const r9Start = src.indexOf('## Rule 9');
    const r10Start = src.indexOf('## Rule 10', r9Start);
    const r9Section = src.slice(r9Start, r10Start);
    expect(r9Section).toMatch(/createDialogFocusTrap|primitives\/dialog\.ts/);
  });

  it('Rule 16 is formatted consistently with neighbours (applies-to clause)', () => {
    const src = readFileSync(PATHS.skillRules, 'utf8');
    const r16Start = src.indexOf('## Rule 16');
    const r16Header = src.slice(r16Start, r16Start + 300);
    // All Voyager skill rules carry an "(applies to ...)" clause in the
    // heading line per the project's convention.
    expect(r16Header).toMatch(/\(applies to/);
  });
});

// ════════════════════════════════════════════════════════════════════
// Block 5 — CI workflow file (.github/workflows/ci.yml) sanity
// ════════════════════════════════════════════════════════════════════

describe('Story 6.4 defense — Block 5 — .github/workflows/ci.yml sanity (NFR-M4 budget wiring)', () => {
  it('ci.yml exists', () => {
    expect(existsSync(PATHS.ci)).toBe(true);
  });

  // Structural YAML validation: every non-empty, non-comment line must use
  // spaces (not tabs) and the file must have a single top-level `jobs:` key
  // followed by job definitions at consistent indentation. js-yaml is not
  // a project dependency; we validate structurally rather than parsing.
  it('uses spaces only — no tab indentation', () => {
    const src = readFileSync(PATHS.ci, 'utf8');
    // Tabs anywhere in YAML are a hard syntax error.
    expect(src).not.toMatch(/^\t/m);
    expect(src).not.toMatch(/^ +\t/m);
  });

  it('declares the standard top-level keys (name, on, permissions, jobs)', () => {
    const src = readFileSync(PATHS.ci, 'utf8');
    // Top-level keys begin at column 0.
    expect(src).toMatch(/^name:\s+ci/m);
    expect(src).toMatch(/^on:/m);
    expect(src).toMatch(/^permissions:/m);
    expect(src).toMatch(/^jobs:/m);
  });

  it('defines the l4-a11y-routes job (Story 6.4 AC2 wiring)', () => {
    const src = readFileSync(PATHS.ci, 'utf8');
    expect(src).toMatch(/^ {2}l4-a11y-routes:/m);
    // The job must invoke the npm script the route suite is wired to.
    expect(src).toMatch(/npm run test:a11y/);
  });

  it('l4-a11y-routes depends on build (Playwright route checks require dist)', () => {
    const src = readFileSync(PATHS.ci, 'utf8');
    // Slice the l4-a11y-routes section.
    const jobStart = src.indexOf('l4-a11y-routes:');
    expect(jobStart).toBeGreaterThan(0);
    // The next sibling job is `deploy-cloudflare`; slice between.
    const next = src.indexOf('\n  deploy-cloudflare:', jobStart);
    const block = src.slice(jobStart, next === -1 ? src.length : next);
    expect(block).toMatch(/needs:\s*\[build\]/);
  });

  it('deploy-cloudflare needs the l4-a11y-routes job (the AC8 deploy-gate contract)', () => {
    const src = readFileSync(PATHS.ci, 'utf8');
    const deployStart = src.indexOf('deploy-cloudflare:');
    expect(deployStart).toBeGreaterThan(0);
    const block = src.slice(deployStart, deployStart + 1500);
    // The needs: line for deploy is an inline array.
    const needsMatch = block.match(/needs:\s*\[([^\]]+)\]/);
    expect(needsMatch).not.toBeNull();
    const list = needsMatch?.[1] ?? '';
    expect(list).toMatch(/l4-a11y-routes/);
    // And the sibling visual-regression L4 gate is still wired in.
    expect(list).toMatch(/l4-visual-regression/);
  });

  it('l4-a11y-routes timeout-minutes is within the NFR-M4 L4/L5 budget envelope (≤ 15)', () => {
    const src = readFileSync(PATHS.ci, 'utf8');
    const jobStart = src.indexOf('l4-a11y-routes:');
    const next = src.indexOf('\n  deploy-cloudflare:', jobStart);
    const block = src.slice(jobStart, next === -1 ? src.length : next);
    const match = block.match(/timeout-minutes:\s*(\d+)/);
    expect(match).not.toBeNull();
    const minutes = Number(match?.[1] ?? '0');
    expect(minutes).toBeGreaterThan(0);
    // NFR-M4 caps the L4/L5 stage at 15 minutes total; the a11y route
    // job's timeout is the upper bound for THIS job specifically (it
    // shares the budget with l4-visual-regression).
    expect(minutes).toBeLessThanOrEqual(15);
  });
});
