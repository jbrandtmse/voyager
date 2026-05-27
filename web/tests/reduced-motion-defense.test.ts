// @vitest-environment node
//
// Story 6.3 — reduced-motion defense tests (FR46 / NFR-A5 / UX-DR6).
//
// Three independent gates:
//
//   1. tokens.css declares --v-duration-* tokens at :root AND global.css
//      contains the single @media (prefers-reduced-motion: reduce) override
//      that zeroes them. This is the implementation contract per Story 1.7;
//      this test pins it doesn't drift.
//
//   2. No bare-millisecond-literal transition / animation declarations exist
//      in web/src/ outside the documented exception list. Bypasses surface
//      here BEFORE shipping.
//
//   3. The audit document at docs/accessibility/reduced-motion.md references
//      every Story ID listed in Story 6.3 AC1. If a contributor adds a new
//      animated surface without updating the audit, this test fails with a
//      clear diagnostic pointing at the missing row.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');
const webRoot = resolve(__dirname, '..');
const srcDir = resolve(webRoot, 'src');
const stylesDir = resolve(srcDir, 'styles');
const tokensCssPath = resolve(stylesDir, 'tokens.css');
const globalCssPath = resolve(stylesDir, 'global.css');
const auditDocPath = resolve(repoRoot, 'docs', 'accessibility', 'reduced-motion.md');

function stripCssComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

function walkFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// === 1. Token + override gate =========================================

describe('Story 6.3 defense — --v-duration-* token + reduced-motion override contract', () => {
  it('tokens.css declares --v-duration-fast, --v-duration-base, --v-duration-slow at :root', () => {
    const css = stripCssComments(readFileSync(tokensCssPath, 'utf-8'));
    // Match the :root rule and then check for each token name inside the
    // matched block. The block test guards against the tokens drifting
    // out of :root into a media query or component scope.
    const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/);
    expect(rootBlock, 'tokens.css must contain a :root block').not.toBeNull();
    const block = rootBlock![1];
    expect(block).toMatch(/--v-duration-fast\s*:\s*\d+(?:ms|s)/);
    expect(block).toMatch(/--v-duration-base\s*:\s*\d+(?:ms|s)/);
    expect(block).toMatch(/--v-duration-slow\s*:\s*\d+(?:ms|s)/);
  });

  it('global.css contains a single @media (prefers-reduced-motion: reduce) override that zeroes every --v-duration-* token at :root', () => {
    const css = stripCssComments(readFileSync(globalCssPath, 'utf-8'));
    // Match the media block at :root.
    const mediaBlock = css.match(
      /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[\s\S]*?:root\s*\{([\s\S]*?)\}/,
    );
    expect(
      mediaBlock,
      'global.css must contain @media (prefers-reduced-motion: reduce) { :root { ... } }',
    ).not.toBeNull();
    const overrides = mediaBlock![1];
    expect(overrides).toMatch(/--v-duration-fast\s*:\s*0(?:ms)?/);
    expect(overrides).toMatch(/--v-duration-base\s*:\s*0(?:ms)?/);
    expect(overrides).toMatch(/--v-duration-slow\s*:\s*0(?:ms)?/);
  });
});

// === 2. Bare-millisecond bypass detection ============================

describe('Story 6.3 defense — no bare-millisecond transition/animation duration literals in web/src/', () => {
  // Files we scan: all CSS files under styles/ + all TS files under src/
  // (component templates carry their styles inside `css\`\`` tagged templates,
  // so a regex grep over .ts surfaces them too).
  const cssFiles = walkFiles(srcDir, (n) => n.endsWith('.css'));
  const tsFiles = walkFiles(srcDir, (n) =>
    n.endsWith('.ts') && !n.endsWith('.test.ts'),
  );
  const allFiles = [...cssFiles, ...tsFiles];

  // Match `transition:` or `animation:` declarations whose duration is a
  // bare millisecond literal — i.e. NOT a var(--v-duration-*) reference.
  // Two-phase check:
  //   - Find every `transition:` or `animation:` declaration value (up to
  //     the next ; or close brace).
  //   - For each match, check whether the value contains a `\d+ms` or
  //     `\d+s` literal AND does NOT also contain `var(--v-duration-`.
  //
  // We also skip `transition-delay:` / `animation-delay:` declarations —
  // these are intentional UX timings (UX-DR22 tooltip dwell), NOT motion
  // durations. The reduced-motion contract reduces DURATIONS, not delays.
  const TRANSITION_OR_ANIMATION = /(^|[\s;{])(transition|animation)\s*:\s*([^;}]+)[;}]/g;
  const BARE_DURATION = /(?<![-\w])\d+\s*ms\b|(?<![-\w.])\d+(?:\.\d+)?\s*s\b/;
  const VAR_DURATION = /var\(\s*--v-duration-/;

  // Documented exception list. Each entry MUST cite the rationale + the
  // audit doc row (per § 6 of docs/accessibility/reduced-motion.md).
  // Empty list means we passed Story 6.3's "fix every bypass" gate.
  const EXCEPTIONS: ReadonlyArray<{ filePathRel: string; rationale: string }> = Object.freeze([
    // (No CSS exceptions today — Story 6.3 routed the chapter-marker tooltip
    // through --v-duration-fast. Any future exception MUST be added here
    // AND documented in docs/accessibility/reduced-motion.md.)
  ]);

  it('finds zero bare-millisecond transition/animation duration literals (or matches the exception list)', () => {
    const findings: string[] = [];
    for (const file of allFiles) {
      const content = stripCssComments(readFileSync(file, 'utf-8'));
      let match: RegExpExecArray | null;
      const re = new RegExp(TRANSITION_OR_ANIMATION.source, 'g');
      while ((match = re.exec(content)) !== null) {
        const value = match[3];
        // Skip if this is a transition-delay/animation-delay declaration
        // (we matched `transition:` or `animation:`, not the delay form,
        // so this is defense-in-depth — the regex above already excludes
        // them via the `transition:` boundary).
        const hasBareDuration = BARE_DURATION.test(value);
        const hasVarDuration = VAR_DURATION.test(value);
        if (hasBareDuration && !hasVarDuration) {
          const relPath = relative(webRoot, file).replace(/\\/g, '/');
          // Check the exception list.
          const isExcepted = EXCEPTIONS.some((e) => e.filePathRel === relPath);
          if (!isExcepted) {
            findings.push(
              `${relPath}: ${match[2]}: ${value.trim().slice(0, 80)}`,
            );
          }
        }
      }
    }
    expect(
      findings,
      `Bare-millisecond transition/animation duration literals found in web/src/. ` +
        `Each declaration must use var(--v-duration-*) so prefers-reduced-motion ` +
        `collapses it to 0ms via global.css. See docs/accessibility/reduced-motion.md ` +
        `for the contract. Findings:\n  ${findings.join('\n  ')}`,
    ).toEqual([]);
  });
});

// === 3. Audit doc references every Story listed in AC1 ===============

describe('Story 6.3 defense — audit doc at docs/accessibility/reduced-motion.md references every Story AC1 names', () => {
  // The set of Story IDs the audit AC1 enumerates. If this list grows in a
  // future story (e.g. Epic 7 adds a new animated surface), append to it
  // AND add a row to docs/accessibility/reduced-motion.md.
  const REQUIRED_STORY_IDS: ReadonlyArray<string> = Object.freeze([
    '1.9',  // <v-title-card> dissolve
    '2.1',  // ChapterDirector state-transition events
    '2.3',  // <v-chapter-index> slide-in/out
    '2.7',  // about-page mount transitions
    '2.8',  // <v-help-overlay> open/close
    '2.9',  // <v-chapter-copy> fade
    '3.6',  // <v-attitude-indicator> colour transition
    '4.1',  // ViewFrameService smoothstep
    '4.2',  // VoyagerCameraController manual override
    '4.4',  // <v-timeline-scrubber> detail variant
    '4.5',  // chapter-copy fade refinement (per-encounter — same component as 2.9)
    '4.12', // heliocentric system-view transition
    '5.1',  // PBD substate timing
    '5.2',  // PBD turn choreography (TurnChoreography)
    '5.3',  // PBD photo-plate composite fades (PbdCompositeLayer)
    '6.1',  // Golden Record audio fade (documented exception)
    '6.2',  // <v-hud> dismiss + drawer
  ]);

  it('audit doc references every Story ID enumerated by AC1', () => {
    const doc = readFileSync(auditDocPath, 'utf-8');
    const missing: string[] = [];
    for (const id of REQUIRED_STORY_IDS) {
      // Story IDs appear as " 1.9 " or "Story 1.9" or "5.2," — match the
      // bare ID with word boundary tolerance to non-word chars around it.
      const re = new RegExp(`(^|[^\\d])${id.replace('.', '\\.')}(?=[^\\d]|$)`);
      if (!re.test(doc)) {
        missing.push(id);
      }
    }
    expect(
      missing,
      `Story IDs enumerated by Story 6.3 AC1 are MISSING from the audit doc ` +
        `at docs/accessibility/reduced-motion.md: ${missing.join(', ')}. ` +
        `Every animated surface MUST have a row; see § 2 of the audit doc.`,
    ).toEqual([]);
  });

  it('audit doc names both documented exceptions (simulation playback + Golden Record audio)', () => {
    const doc = readFileSync(auditDocPath, 'utf-8');
    expect(doc).toMatch(/[Ss]imulation playback/);
    expect(doc).toMatch(/Golden Record/);
  });

  it('audit doc cites the single-source-of-truth implementation contract', () => {
    const doc = readFileSync(auditDocPath, 'utf-8');
    expect(doc).toMatch(/--v-duration-base/);
    expect(doc).toMatch(/--v-duration-fast/);
    expect(doc).toMatch(/--v-duration-slow/);
    expect(doc).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(doc).toMatch(/tokens\.css/);
    expect(doc).toMatch(/global\.css/);
  });
});

// === 4. Sanity: walkFiles discovered the expected directories =========

describe('Story 6.3 defense — sanity gates', () => {
  it('discovers at least one CSS file under web/src/styles/', () => {
    const cssFiles = walkFiles(stylesDir, (n) => n.endsWith('.css'));
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  it('audit doc exists and is non-empty', () => {
    const stats = statSync(auditDocPath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(2000); // sanity: it's a real doc
  });
});

// === 5. Audit-doc integrity (QA defense extension — Story 6.3, 2026-05-24) =

/*
 * Extension to the dev's three primary gates above. The dev's § 3 gate
 * (audit-doc references every Story ID) catches missing rows but does
 * NOT catch the inverse class of drift: a row that names a file:line
 * citation pointing at a file that no longer exists (or whose cited line
 * no longer contains the asserted animation declaration). § 5 below
 * pins:
 *
 *   (a) Every file:line citation in the surface-inventory table (§ 2 of
 *       the audit doc) resolves to a file that exists under
 *       web/src/, web/src/styles/, or web/src/chapters/.
 *
 *   (b) The bypass-fix citation in § 6 of the audit doc names the
 *       Story 6.3 fix at v-timeline-scrubber.ts:398 and that line's
 *       neighbourhood currently uses var(--v-duration-fast) (proving
 *       the bypass fix has not silently regressed).
 *
 *   (c) The audit doc's "JS-side animation pattern reference" (§ 5)
 *       names the four canonical files; each must exist AND each must
 *       define one of the documented `ReducedMotion*` types (so a
 *       refactor that renames the type surfaces here).
 *
 *   (d) No NEW bare-millisecond literals creep into web/src/ — the
 *       dev's § 2 gate ALREADY covers the broad bare-literal sweep
 *       (transition: / animation: with a numeric duration outside
 *       var(--v-duration-*)). This § 5 (d) sub-gate adds a tighter
 *       grep specifically for the `transition: opacity <N>ms` and
 *       `transition: transform <N>ms` two-property patterns that
 *       were the most common bypass shape in the Epic 1–6 codebase.
 *       Together with the dev's § 2 these form belt-and-braces.
 */

import { existsSync } from 'node:fs';

describe('Story 6.3 QA defense — audit-doc integrity', () => {
  const auditDoc = readFileSync(auditDocPath, 'utf-8');

  /**
   * Extracts every `file:line` style citation from the audit doc that
   * starts with `web/src/`. The audit doc's table format is
   * `\`web/src/path/to/file.ts:NN[,-NN]\`` inside markdown code spans;
   * the regex below tolerates both single-line and `NN-NN` /
   * `NN, NN, NN` shapes by extracting the path up to the first colon
   * then validating the path exists. Line number is captured for the
   * primary citation but its specific contents are not asserted here
   * (line drift via insertion-above is non-load-bearing for the doc's
   * integrity — the FILE existing is the binding signal; story files
   * routinely reference earlier line numbers as content shifts).
   */
  const PATH_LINE_RE = /`(web\/src\/[\w./-]+\.(?:ts|css))(?::(\d+(?:[,\s-]+\d+)*))?`/g;
  const auditCitations: { path: string; line: string | null }[] = [];
  {
    let m: RegExpExecArray | null;
    const re = new RegExp(PATH_LINE_RE.source, 'g');
    while ((m = re.exec(auditDoc)) !== null) {
      auditCitations.push({ path: m[1], line: m[2] ?? null });
    }
  }

  // (a) Every cited path must exist under repoRoot. The audit's anchor
  // points to the codebase, not to documentation — so this gate is the
  // file-existence sanity check.
  it('§ 2 surface inventory — every cited file path resolves to an existing file', () => {
    expect(
      auditCitations.length,
      'audit doc must reference at least one file:line citation',
    ).toBeGreaterThan(5);
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const c of auditCitations) {
      if (seen.has(c.path)) continue;
      seen.add(c.path);
      const full = resolve(repoRoot, c.path);
      if (!existsSync(full)) {
        missing.push(c.path);
      }
    }
    expect(
      missing,
      `audit doc cites files that do not exist:\n  ${missing.join('\n  ')}\n` +
        `Update docs/accessibility/reduced-motion.md when files are moved/renamed.`,
    ).toEqual([]);
  });

  // (b) The bypass-fix citation in § 6 names v-timeline-scrubber.ts and
  // the file currently uses var(--v-duration-fast) in the tooltip rule.
  // The dev claimed line :398 in Story 6.3's File List; line numbers
  // drift with intervening edits, so we verify by content not position.
  it('§ 6 bypass fix — v-timeline-scrubber tooltip uses var(--v-duration-fast)', () => {
    const scrubberPath = resolve(
      repoRoot,
      'web/src/components/v-timeline-scrubber.ts',
    );
    expect(existsSync(scrubberPath)).toBe(true);
    const src = readFileSync(scrubberPath, 'utf-8');
    // Tooltip rule body must contain the canonical `var(--v-duration-fast)`
    // transition; if a future refactor reverts it to a bare literal,
    // both this gate AND the bare-literal sweep (§ 2 above) would fire.
    expect(
      src,
      'v-timeline-scrubber.ts must use var(--v-duration-fast) for the chapter-marker tooltip fade (Story 6.3 bypass fix)',
    ).toMatch(/transition:\s*opacity\s+var\(\s*--v-duration-fast/);
    // The audit doc § 6 explicitly names the bypass fix citation by file.
    expect(auditDoc).toMatch(/v-timeline-scrubber\.ts/);
    expect(auditDoc).toMatch(/var\(--v-duration-fast\)/);
  });

  // (c) The audit doc's "JS-side animation pattern reference" (§ 5)
  // names four canonical files. Each must exist + each must define a
  // ReducedMotion* type (Probe or Source). A refactor that renames the
  // type or moves the definition would fire here.
  it('§ 5 JS-side pattern — four canonical files exist and each defines a ReducedMotion* type', () => {
    const canonical = [
      {
        path: 'web/src/chapters/pale-blue-dot/turn-choreography.ts',
        typeRegex: /ReducedMotionProbe/,
      },
      {
        path: 'web/src/chapters/pale-blue-dot/composite-layer.ts',
        typeRegex: /ReducedMotion(?:Probe|Source)/,
      },
      {
        path: 'web/src/services/view-frame.ts',
        typeRegex: /ReducedMotion(?:Source|Probe)/,
      },
      {
        path: 'web/src/render/voyager-camera-controller.ts',
        typeRegex: /ReducedMotion(?:Source|Probe)/,
      },
    ];
    const failures: string[] = [];
    for (const { path, typeRegex } of canonical) {
      const full = resolve(repoRoot, path);
      if (!existsSync(full)) {
        failures.push(`${path}: file missing`);
        continue;
      }
      const src = readFileSync(full, 'utf-8');
      if (!typeRegex.test(src)) {
        failures.push(
          `${path}: no ${typeRegex.source} type reference found`,
        );
      }
    }
    expect(
      failures,
      `Story 6.3 audit doc § 5 names these as canonical JS-side reduced-motion ` +
        `pattern carriers, but the integrity check failed for:\n  ${failures.join('\n  ')}`,
    ).toEqual([]);
  });

  // (d) Belt-and-braces specific to the two property shapes that were
  // the most common bypass form in the Epic 1–6 codebase. The dev's
  // § 2 already runs the broad sweep; this gate adds a paranoid
  // double-check that no `transition: opacity <N>ms` or
  // `transition: transform <N>ms` two-property literal slips through.
  // Together they form the full bare-literal defense.
  it('no bare-literal transition: opacity / transform <N>ms two-property declarations slip past the broad sweep', () => {
    const cssFiles = walkFiles(srcDir, (n) => n.endsWith('.css'));
    const tsFiles = walkFiles(srcDir, (n) =>
      n.endsWith('.ts') && !n.endsWith('.test.ts'),
    );
    // Match `transition: <property> <bare ms> [ease|cubic|linear|...]` where
    // <property> is opacity or transform. The bare-ms portion is matched
    // OUTSIDE a var(--...) reference. The regex permits an optional `ease`
    // / cubic-bezier / linear easing token after the duration.
    const TWO_PROPERTY_BARE = /transition\s*:\s*(opacity|transform)\s+\d+\s*(?:ms|s)\b/g;
    const findings: string[] = [];
    for (const f of [...cssFiles, ...tsFiles]) {
      const content = stripCssComments(readFileSync(f, 'utf-8'));
      let mm: RegExpExecArray | null;
      const re = new RegExp(TWO_PROPERTY_BARE.source, 'g');
      while ((mm = re.exec(content)) !== null) {
        // Skip if this match overlaps a var(--v-duration-*) — defensive
        // against unusual formatting.
        const segment = content.slice(Math.max(0, mm.index - 40), mm.index + 80);
        if (/var\(\s*--v-duration-/.test(segment)) continue;
        const rel = relative(webRoot, f).replace(/\\/g, '/');
        findings.push(`${rel}: ${mm[0].slice(0, 80)}`);
      }
    }
    expect(
      findings,
      `Bare-literal \`transition: opacity|transform <N>ms\` declarations ` +
        `found in web/src/. Each must use var(--v-duration-*) so the reduced-motion ` +
        `override applies. See docs/accessibility/reduced-motion.md § 6.\nFindings:\n  ${findings.join(
          '\n  ',
        )}`,
    ).toEqual([]);
  });
});
