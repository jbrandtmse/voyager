/**
 * Story 2.1 QA — main.ts wire-up shape for the ChapterDirector.
 *
 * Loading `main.ts` directly under Vitest would execute `bootstrap()` and
 * touch the DOM/Three.js stack. Instead we verify the wire-up by reading
 * the source as text — the same static-source-check pattern used by the
 * Story 1.13 celestial-defense-extended.test.ts (`engine.skyboxGroup.add`).
 *
 * Rationale: Story 2.1 Integration AC8 hinges on three discrete wire-up
 * lines that must remain present in main.ts:
 *
 *   1. `new ChapterDirector(ALL_CHAPTERS)` — director constructed with
 *      the canonical registry, NOT a parallel list.
 *   2. `engine.onFrame((et: number) => chapterDirector.update(et))` — the
 *      per-frame fan-out from Story 1.15's RenderEngine.
 *   3. `if (import.meta.env.DEV)` guard around `__voyagerDebug.chapterDirector`
 *      so the Chrome DevTools MCP smoke can `evaluate_script` against it
 *      in DEV builds — and so the surface is stripped from production.
 *
 * If any of these regress (e.g. a future refactor drops the DEV guard or
 * swaps `ALL_CHAPTERS` for a hand-rolled list) the static-source check
 * fails immediately, well before the lead's MCP smoke would catch it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webRoot = resolve(__dirname, '..');
const mainTsSrc = readFileSync(resolve(webRoot, 'src/main.ts'), 'utf-8');

describe('Story 2.1 QA — main.ts ChapterDirector wire-up shape', () => {
  it('imports ChapterDirector from the services module', () => {
    expect(mainTsSrc).toMatch(
      /import\s*\{\s*ChapterDirector\s*\}\s*from\s*['"]\.\/services\/chapter-director['"]/,
    );
  });

  it('imports ALL_CHAPTERS from the registry module', () => {
    expect(mainTsSrc).toMatch(
      /import\s*\{\s*ALL_CHAPTERS\s*\}\s*from\s*['"]\.\/chapters\/registry['"]/,
    );
  });

  it('constructs ChapterDirector with the canonical ALL_CHAPTERS registry', () => {
    // AC4 contract — no parallel lists allowed. A future refactor that
    // hand-rolls a subset of chapters here defeats the single-source-of-
    // truth invariant.
    expect(mainTsSrc).toMatch(/new\s+ChapterDirector\(\s*ALL_CHAPTERS\s*\)/);
  });

  it('registers chapterDirector.update on engine.onFrame (Story 1.15 fan-out)', () => {
    // The exact arrow-function shape may evolve, but the substring
    // `chapterDirector.update(et)` inside an `engine.onFrame(` call is
    // the load-bearing contract.
    expect(mainTsSrc).toMatch(/engine\.onFrame\(/);
    expect(mainTsSrc).toMatch(/chapterDirector\.update\(\s*et\s*\)/);
  });

  it('exposes __voyagerDebug.chapterDirector only when import.meta.env.DEV', () => {
    // Integration AC8 — DEV-only debug surface. The Vite constant-fold
    // strips the body from production bundles.
    expect(mainTsSrc).toMatch(/if\s*\(\s*import\.meta\.env\.DEV\s*\)/);
    expect(mainTsSrc).toMatch(/__voyagerDebug/);
    // The wired property must be `chapterDirector` (else the lead's
    // `window.__voyagerDebug.chapterDirector.activeChapter` read fails).
    expect(mainTsSrc).toMatch(/chapterDirector/);
  });

  it('the executable __voyagerDebug assignment lives inside the DEV gate', () => {
    // Sanity: confirm the LHS write `__voyagerDebug = …` only appears
    // inside the DEV-guarded block. Comments may mention `__voyagerDebug`
    // earlier in the file, but the only assignment must follow the
    // `if (import.meta.env.DEV)` gate. A leak (e.g. unconditional
    // `window.__voyagerDebug = …`) would publish the debug surface to
    // production bundles.
    const stripped = mainTsSrc
      .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
      .replace(/(^|\s)\/\/.*$/gm, '$1'); // strip line comments
    const devGateIdx = stripped.indexOf('import.meta.env.DEV');
    const assignMatch = stripped.match(/__voyagerDebug\s*=/);
    expect(devGateIdx).toBeGreaterThan(-1);
    expect(assignMatch, 'expected an executable __voyagerDebug assignment').not.toBeNull();
    const assignIdx = stripped.indexOf(assignMatch![0]);
    expect(devGateIdx).toBeLessThan(assignIdx);
  });
});
