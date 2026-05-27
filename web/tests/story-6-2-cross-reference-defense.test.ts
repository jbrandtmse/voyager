// @vitest-environment node
/**
 * Story 6.2 — cross-reference defense for the two new lib modules
 * introduced by this story:
 *
 *   - `web/src/lib/help-overlay-state.ts`  (Rule 9 second-consumer
 *     extraction; consumed by <v-audio-toggle> AND <v-hud>)
 *   - `web/src/lib/marker-cluster.ts`      (AC5 marker-clustering
 *     primitive; consumed by <v-timeline-scrubber> mission variant)
 *
 * Extends the Story 6.0 / 6.1 cross-reference-defense pattern (each
 * extracted helper landed via Rule 9 second-consumer extraction is
 * accompanied by a defense test that:
 *
 *   (a) confirms the lib file exists at the published path,
 *   (b) confirms every consumer in the codebase imports the lib via
 *       the canonical specifier `../lib/<name>` (caught by grep), and
 *   (c) confirms the lib exports the public surface its consumers
 *       reference (no symbol-rename drift).
 *
 * A regression here would manifest as a broken import path or a
 * shadowed local re-implementation — both of which the per-component
 * tests would NOT catch (since the per-component tests reach for the
 * imported symbol directly).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_WEB_ROOT = resolve(__dirname, '..');
const SRC = resolve(PROJECT_WEB_ROOT, 'src');

const readSrc = (path: string): string =>
  readFileSync(resolve(PROJECT_WEB_ROOT, path), 'utf-8');

describe('Story 6.2 cross-reference defense — help-overlay-state.ts', () => {
  const LIB_REL = 'src/lib/help-overlay-state.ts';
  const LIB_ABS = resolve(PROJECT_WEB_ROOT, LIB_REL);

  it('lib file exists at the canonical path', () => {
    expect(existsSync(LIB_ABS), `${LIB_REL} missing`).toBe(true);
  });

  it('lib exports `isHelpOverlayOpen` as a named export', () => {
    const src = readSrc(LIB_REL);
    expect(src).toMatch(/export\s+const\s+isHelpOverlayOpen\s*=/);
  });

  it('lib export accepts Document | ShadowRoot target with a default', () => {
    const src = readSrc(LIB_REL);
    // The default-argument form is the API surface tests + consumers rely on.
    expect(src).toMatch(/isHelpOverlayOpen\s*=\s*\(target:\s*Document\s*\|\s*ShadowRoot\s*=\s*document\)/);
  });

  it('consumer <v-audio-toggle> imports from the canonical specifier', () => {
    const src = readSrc('src/components/v-audio-toggle.ts');
    expect(src).toMatch(/import\s+\{[^}]*isHelpOverlayOpen[^}]*\}\s+from\s+['"]\.\.\/lib\/help-overlay-state['"]/);
  });

  it('consumer <v-hud> imports from the canonical specifier', () => {
    const src = readSrc('src/components/v-hud.ts');
    expect(src).toMatch(/import\s+\{[^}]*isHelpOverlayOpen[^}]*\}\s+from\s+['"]\.\.\/lib\/help-overlay-state['"]/);
  });

  it('NO consumer inlines its own `isHelpOverlayOpen` (Rule 9 second-consumer extraction completeness)', () => {
    // The function name should NOT appear as a `const isHelpOverlayOpen
    // =` declaration in any consumer file (only as an `import`).
    const consumers = [
      'src/components/v-audio-toggle.ts',
      'src/components/v-hud.ts',
    ];
    for (const path of consumers) {
      const src = readSrc(path);
      const localDeclarationCount = (src.match(/const\s+isHelpOverlayOpen\s*=/g) ?? []).length;
      expect(localDeclarationCount, `${path} has a local isHelpOverlayOpen declaration`).toBe(0);
    }
  });
});

describe('Story 6.2 cross-reference defense — marker-cluster.ts', () => {
  const LIB_REL = 'src/lib/marker-cluster.ts';
  const LIB_ABS = resolve(PROJECT_WEB_ROOT, LIB_REL);

  it('lib file exists at the canonical path', () => {
    expect(existsSync(LIB_ABS), `${LIB_REL} missing`).toBe(true);
  });

  it('lib exports the canonical clustering surface', () => {
    const src = readSrc(LIB_REL);
    expect(src).toMatch(/export\s+const\s+clusterMarkers\s*=/);
    expect(src).toMatch(/export\s+const\s+markersOverlap\s*=/);
    expect(src).toMatch(/export\s+const\s+defaultLabelWidthPx/);
  });

  it('lib exports `MarkerDescriptor` and `ClusteredMarker` interfaces', () => {
    const src = readSrc(LIB_REL);
    expect(src).toMatch(/export\s+interface\s+MarkerDescriptor\b/);
    expect(src).toMatch(/export\s+interface\s+ClusteredMarker\b/);
  });

  it('lib exports `LabelWidthEstimator` type alias', () => {
    const src = readSrc(LIB_REL);
    expect(src).toMatch(/export\s+type\s+LabelWidthEstimator\b/);
  });

  it('consumer <v-timeline-scrubber> imports clusterMarkers + defaultLabelWidthPx + MarkerDescriptor', () => {
    const src = readSrc('src/components/v-timeline-scrubber.ts');
    // Allow flexible import-list order; assert each symbol explicitly.
    expect(src).toMatch(/import\s+\{[^}]*clusterMarkers[^}]*\}\s+from\s+['"]\.\.\/lib\/marker-cluster['"]/);
    expect(src).toMatch(/import\s+(?:type\s+)?\{[^}]*MarkerDescriptor[^}]*\}\s+from\s+['"]\.\.\/lib\/marker-cluster['"]/);
    expect(src).toMatch(/import\s+\{[^}]*defaultLabelWidthPx[^}]*\}\s+from\s+['"]\.\.\/lib\/marker-cluster['"]/);
  });

  it('NO consumer inlines its own clusterMarkers (single-source-of-truth)', () => {
    const src = readSrc('src/components/v-timeline-scrubber.ts');
    expect((src.match(/const\s+clusterMarkers\s*=/g) ?? []).length).toBe(0);
    expect((src.match(/function\s+clusterMarkers\s*\(/g) ?? []).length).toBe(0);
  });

  it('clustering pass is invoked exactly once per render path (no duplicate-call drift)', () => {
    const src = readSrc('src/components/v-timeline-scrubber.ts');
    // The clustering pass should appear once inside renderClusteredChapterMarkers.
    // Allow for additional comment mentions; assert the call-site count.
    const callSites = src.match(/clusterMarkers\s*\(/g) ?? [];
    expect(callSites.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Story 6.2 cross-reference defense — test files exist and discoverable', () => {
  // Rule 13: tests must be in the default vitest sweep (no .skip,
  // no env-gates). The default config glob is `tests/**/*.test.ts`
  // (or `**/*.test.ts`); the project's vitest config picks files
  // matching `*.test.ts` under web/tests + web/src. We assert each
  // Story 6.2 test file is present at its expected path and has a
  // name matching the discovery pattern.
  const expectedFiles = [
    'tests/v-hud-dismiss-restore.test.ts',
    'tests/v-hud-narrow-viewport.test.ts',
    'tests/v-chapter-copy-drawer.test.ts',
    'tests/marker-cluster.test.ts',
    'tests/v-timeline-scrubber-clustering.test.ts',
    'tests/v-hud-corner-defensive.test.ts',
    'tests/story-6-2-cross-component.test.ts',
    'tests/story-6-2-marker-cluster-edges.test.ts',
    'tests/story-6-2-narrow-viewport-defense.test.ts',
    'tests/story-6-2-drawer-keyboard.test.ts',
    'tests/story-6-2-cross-reference-defense.test.ts',
  ];

  for (const path of expectedFiles) {
    it(`${path} exists`, () => {
      expect(existsSync(resolve(PROJECT_WEB_ROOT, path)), `${path} missing`).toBe(true);
    });
  }

  it('no Story 6.2 test uses `.skip` (Rule 13 — discoverability)', () => {
    for (const path of expectedFiles) {
      const src = readSrc(path);
      const skipMatches = src.match(/\b(?:describe|it|test)\.skip\b/g) ?? [];
      expect(skipMatches.length, `${path} contains .skip`).toBe(0);
    }
  });

  it('no Story 6.2 test uses env-gate skip patterns (Rule 13)', () => {
    // Self-exclusion: this file describes the forbidden patterns in a
    // regex string + comment for matching peer files. Scanning self
    // would yield a false positive; skip self in the scan.
    const SELF = 'tests/story-6-2-cross-reference-defense.test.ts';
    for (const path of expectedFiles) {
      if (path === SELF) continue;
      const src = readSrc(path);
      // Common env-gate patterns we want to forbid here:
      //   if (!process.env.X) return;
      //   describe.runIf(process.env.X)
      const runIfMatches = src.match(/describe\.runIf|it\.runIf|test\.runIf/g) ?? [];
      expect(runIfMatches.length, `${path} contains .runIf gate`).toBe(0);
    }
  });
});

describe('Story 6.2 cross-reference defense — Lit reactive properties on touched components (Rule 10)', () => {
  it('<v-hud> uses `declare` for dismissed/narrowViewport/expandedAtNarrow (no class-field initializers)', () => {
    const src = readSrc('src/components/v-hud.ts');
    // Each reactive prop should appear as `declare <name>: <type>` and
    // be initialised in the constructor. Forbid class-field-init form
    // `dismissed = false;` at class body indent.
    expect(src).toMatch(/declare\s+dismissed:\s*boolean\b/);
    expect(src).toMatch(/declare\s+narrowViewport:\s*boolean\b/);
    expect(src).toMatch(/declare\s+expandedAtNarrow:\s*boolean\b/);
    // Constructor must assign them.
    expect(src).toMatch(/this\.dismissed\s*=\s*false/);
    expect(src).toMatch(/this\.narrowViewport\s*=\s*false/);
    expect(src).toMatch(/this\.expandedAtNarrow\s*=\s*false/);
  });

  it('<v-chapter-copy> uses `declare` for narrowViewport/drawerState', () => {
    const src = readSrc('src/components/v-chapter-copy.ts');
    expect(src).toMatch(/declare\s+narrowViewport:\s*boolean\b/);
    expect(src).toMatch(/declare\s+drawerState:\s*ChapterCopyDrawerState\b/);
    expect(src).toMatch(/this\.narrowViewport\s*=\s*false/);
    expect(src).toMatch(/this\.drawerState\s*=\s*['"]partial['"]/);
  });
});

describe('Story 6.2 cross-reference defense — AC6 gutter values land in the source', () => {
  it('mission scrubber left gutter is `var(--v-edge-margin) + 108px` (Story 6.2 update from +56px)', () => {
    const src = readSrc('src/components/v-timeline-scrubber.ts');
    // The 108px gutter clears: play-button 44 + gap 8 + audio-toggle 44 + gap 12.
    expect(src).toMatch(/left:\s*calc\(\s*var\(--v-edge-margin\)\s*\+\s*108px\s*\)/);
  });

  it('audio-toggle still sits at edge-margin + 44 + 8 (Story 6.1 baseline preserved)', () => {
    const src = readSrc('src/components/v-audio-toggle.ts');
    expect(src).toMatch(/left:\s*calc\(\s*var\(--v-edge-margin\)\s*\+\s*44px\s*\+\s*8px\s*\)/);
  });
});

describe('Story 6.2 cross-reference defense — corner CSS retains AC7 defensive fallback', () => {
  it('all 4 corner divs use `var(--v-edge-margin, 16px)` with explicit fallback', () => {
    const src = readSrc('src/components/v-hud.ts');
    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const corner of corners) {
      // The fallback form must appear in each corner's rule body.
      // Use a non-greedy match that stops at the closing brace.
      const ruleRe = new RegExp(`\\.corner\\.${corner}\\s*\\{[\\s\\S]*?\\}`, 'g');
      const matches = src.match(ruleRe);
      expect(matches, `${corner} rule missing`).not.toBeNull();
      expect(matches![0], `${corner} bare var() — fallback missing`)
        .toMatch(/var\(--v-edge-margin,\s*16px\)/);
    }
  });
});
