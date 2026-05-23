// @vitest-environment node
/**
 * Story 4.3 AC6 — invisible-loading defense (UX-DR32).
 *
 * The user-facing UX discipline: while scrubbing through an encounter at any
 * speed (1× through 10000×), NO spinner, NO progress bar, NO "loading…"
 * text appears anywhere in the UI. The ONLY user-visible loading signal
 * permitted is the speed multiplier auto-capping to 0 when a chunk is not
 * ready (Story 1.10's existing contract + Story 4.3 AC2's `boundaryStalled`
 * signal), which renders as the suffix `"—paused (loading)"` on the
 * speed-multiplier readout.
 *
 * This defense source-greps `web/src/` for the regex
 * `/loading|spinner|progress|please wait/i` inside DOM-emitting code
 * (Lit `html\`...\`` template literals + Light-DOM `innerHTML` assignments)
 * and FAILS if any match is found outside the documented allow-list. The
 * allow-list itself is the contract surface — every entry must be
 * justified inline and documented.
 *
 * What this test does NOT cover:
 *   - Comments and JSDoc — these don't render in the DOM. We strip them
 *     before scanning.
 *   - Test files (`*.test.ts`) — tests legitimately use the regex words to
 *     assert ON the rendered DOM. They're scoped out by filename.
 *   - Dev-only readouts (`src/dev/`) — these are gated behind
 *     `import.meta.env.DEV` and never reach the production bundle.
 *
 * Why this lives as a source-grep (not a runtime DOM scrape):
 *   - The defense triggers at TEST time, not at runtime. A spinner that
 *     only appears for one frame on a specific browser/zoom combo would
 *     escape a happy-path DOM scrape; the source-grep catches it at the
 *     code level where the template literal lives.
 *   - The regex covers the keywords UX-DR32 forbids by name. New
 *     prohibition keywords would extend `FORBIDDEN_PATTERN` here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Walk `dir` recursively, returning every `.ts` file path EXCEPT `.test.ts`
 * files. Mirrors the helper defined per-test in the other defense files
 * (celestial-bodies-defense.test.ts, renderer-defense.test.ts) — kept
 * file-local to avoid a shared module the linter would flag as unused if
 * any future defense doesn't import it.
 */
const walkTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
};

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const WEB_ROOT = resolve(__dirname, '..');
const SRC_ROOT = resolve(WEB_ROOT, 'src');

/**
 * UX-DR32 keywords. Match is case-insensitive (e.g. `Loading`, `LOADING`).
 * The regex is checked against EACH line of source after stripping
 * comments and string-literal contents that DON'T live inside a DOM-
 * emitting context (Lit `html\`...\`` or `innerHTML =`).
 */
const FORBIDDEN_PATTERN = /loading|spinner|progress|please wait/i;

/**
 * Documented allow-list — every entry is the legitimate use of one of the
 * forbidden keywords IN A DOM-EMITTING CONTEXT. Adding a new entry
 * requires an inline justification + a citation back to the AC / Story
 * that authorized it.
 *
 * Format: `<rel-path>` — that file is exempted globally. We chose the
 * file-level allow-list rather than line-level because the legitimate
 * uses (the `"—paused (loading)"` suffix) appear in known files and a
 * file-level grant makes the contract easier to read.
 */
const ALLOW_LIST: ReadonlySet<string> = new Set([
  // Story 1.10 (Story 4.3 AC2 amend) — speed multiplier auto-cap signal.
  // The string `"—paused (loading)"` is the only user-visible loading
  // indicator UX-DR32 permits; it appears on the speed-multiplier
  // component's readout when the clock is auto-capped to 0 because a
  // chunk is missing from cache.
  'src/components/v-speed-multiplier.ts',
  'src\\components\\v-speed-multiplier.ts',
  // Story 1.11 HUD speed read-out mirrors the same auto-cap suffix in the
  // top-right HUD position (the cruise readout). Same UX-DR32 carve-out.
  'src/components/v-hud-speed.ts',
  'src\\components\\v-hud-speed.ts',
]);

/**
 * Strip `// ...` and `/* ... *\/` comments + JSDoc blocks from a TS source
 * string before grepping. This is intentionally conservative — we keep
 * string-literal contents intact (so the speed-multiplier's
 * `"—paused (loading)"` literal IS visible to the grep, which is correct
 * because the allow-list is the contract for that specific file).
 *
 * We DO strip block JSDoc comments because they often contain prose that
 * uses keywords like "progress" / "loading" benignly.
 */
const stripComments = (src: string): string => {
  let out = '';
  let i = 0;
  while (i < src.length) {
    // Block comment / JSDoc.
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) break;
      // Preserve newlines so line numbers stay accurate.
      const block = src.slice(i, end + 2);
      for (const ch of block) {
        if (ch === '\n') out += '\n';
        else out += ' ';
      }
      i = end + 2;
      continue;
    }
    // Line comment.
    if (src[i] === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i + 2);
      if (end < 0) {
        // Last line in file.
        break;
      }
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
};

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Extract every DOM-emitting string region from `src` — defined per AC6 as:
 *   (a) Contents of Lit `html\`...\`` tagged template literals.
 *   (b) String literals on the RHS of `.innerHTML = ...` assignments.
 *
 * Returns an array of `{ line, text }` entries — `line` is 1-based and
 * points at the first line of the region; `text` is the raw region body.
 *
 * Important: comments are stripped BEFORE this scan, so a block-quoted
 * "we don't want a spinner here" docstring doesn't false-positive.
 */
const extractDomEmittingRegions = (src: string): Array<{ line: number; text: string }> => {
  const regions: Array<{ line: number; text: string }> = [];
  // (a) Lit `html\`...\`` template literals — match `html` (case-sensitive,
  //     word-boundary) immediately followed by a backtick. We capture the
  //     entire template body up to the closing backtick. The match is
  //     intentionally non-greedy so multiple separate `html\`...\`` blocks
  //     in the same file are each captured.
  //
  //     Note: this matches NEITHER `html\`...\${...}...\`` interpolations
  //     correctly (we treat the whole literal as one region — interpolation
  //     placeholders are part of the region body) NOR nested html`` (rare
  //     in Lit; Lit's pattern is one outer template per render method).
  //     This is the same trade-off the celestial-bodies-defense test makes.
  const htmlRe = /\bhtml`([\s\S]*?)`/g;
  let m: RegExpExecArray | null;
  while ((m = htmlRe.exec(src)) !== null) {
    const before = src.slice(0, m.index);
    const line = (before.match(/\n/g)?.length ?? 0) + 1;
    regions.push({ line, text: m[1] });
  }
  // (b) `.innerHTML = "..."` or `.innerHTML = '...'`. The string-literal
  //     body is the region. Both single and double quotes accepted; we
  //     don't try to parse template literals here because the canonical
  //     pattern is plain string assignment.
  const innerHtmlRe = /\.innerHTML\s*=\s*(["'])((?:\\.|(?!\1).)*)\1/g;
  while ((m = innerHtmlRe.exec(src)) !== null) {
    const before = src.slice(0, m.index);
    const line = (before.match(/\n/g)?.length ?? 0) + 1;
    regions.push({ line, text: m[2] });
  }
  return regions;
};

const scanForViolations = (): Violation[] => {
  const violations: Violation[] = [];
  for (const file of walkTsFiles(SRC_ROOT)) {
    const rel = relative(WEB_ROOT, file);
    // Skip test files — they assert ON the regex words by design.
    if (rel.endsWith('.test.ts')) continue;
    // Skip dev-only paths (gated behind `import.meta.env.DEV`).
    if (rel.includes(`${'src'}${'/'}${'dev'}${'/'}`) || rel.includes(`${'src'}${'\\'}${'dev'}${'\\'}`)) continue;
    // Skip allow-listed files (documented UX-DR32 carve-outs).
    if (ALLOW_LIST.has(rel)) continue;

    const raw = readFileSync(file, 'utf-8');
    const stripped = stripComments(raw);
    const regions = extractDomEmittingRegions(stripped);
    for (const region of regions) {
      // Walk per-line inside the region so the reported line number is
      // useful for navigation.
      const lines = region.text.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (FORBIDDEN_PATTERN.test(line)) {
          violations.push({
            file: rel,
            line: region.line + idx,
            text: line.trim().slice(0, 200),
          });
        }
      });
    }
  }
  return violations;
};

describe('Story 4.3 AC6 — invisible-loading defense (UX-DR32)', () => {
  it('no `loading|spinner|progress|please wait` keywords in DOM-emitting code outside the allow-list', () => {
    const violations = scanForViolations();
    expect(
      violations,
      'Story 4.3 AC6 / UX-DR32 forbids visible "loading" / "spinner" / ' +
        '"progress" / "please wait" text in the runtime UI outside the ' +
        'documented allow-list. If the new use is a legitimate UX-DR32 ' +
        'carve-out, ADD the file to `ALLOW_LIST` in this defense test ' +
        'with an inline justification + AC citation. Otherwise revert the ' +
        `change.\n\nViolations:\n${violations.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join('\n')}`,
    ).toEqual([]);
  });

  it('allow-list is non-empty (sanity check)', () => {
    // If a future refactor accidentally lifts the speed-multiplier suffix
    // out of v-speed-multiplier.ts, the allow-list would become a no-op
    // entry but the regex would still match somewhere — this guard
    // catches the case where the allow-list was emptied accidentally.
    expect(ALLOW_LIST.size).toBeGreaterThan(0);
  });

  it('allow-list contains the speed-multiplier carve-out (UX-DR32 — Story 1.10 / 4.3 AC2)', () => {
    // The "—paused (loading)" suffix is the canonical UX-DR32 carve-out.
    // Pin both POSIX + Windows path separators to make the test portable.
    const posixHit = ALLOW_LIST.has('src/components/v-speed-multiplier.ts');
    const winHit = ALLOW_LIST.has('src\\components\\v-speed-multiplier.ts');
    expect(posixHit || winHit).toBe(true);
  });
});
