// Defense test — guards the load-bearing HUD style discipline.
// Reads the authored component source for each <v-hud-*> and asserts:
//   - no `background:` / `background-color:` declarations leak in
//     (the canvas-and-edges model requires transparent HUD over the canvas)
//   - `text-shadow` is applied to the container for legibility (AC2)
//   - `font-variant-numeric: tabular-nums` is present in every component
//     that renders a numeric value (AC3, AC4, AC5)
//   - `var(--v-font-mono)` is used for numeric readouts
//
// We grep the source files rather than reading getComputedStyle()
// because happy-dom does not apply CSS layout — the contract is the
// *authored* CSS text, which is what visual regression catches.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const COMPONENTS_DIR = resolve(__dirname, '..', 'src', 'components');
const readSrc = (file: string): string =>
  readFileSync(resolve(COMPONENTS_DIR, file), 'utf-8');

/**
 * Strip JS block + line comments before grepping, so JSDoc that
 * legitimately *mentions* `background:` (in the rationale) does not
 * trip the defense.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const HUD_SOURCES: ReadonlyArray<{ file: string; rendersNumbers: boolean }> = [
  { file: 'v-hud.ts', rendersNumbers: false },
  { file: 'v-hud-date.ts', rendersNumbers: true },
  { file: 'v-hud-distance.ts', rendersNumbers: true },
  { file: 'v-hud-speed.ts', rendersNumbers: true },
  { file: 'v-hud-chapter-title.ts', rendersNumbers: false },
  { file: 'v-hud-instruments.ts', rendersNumbers: false },
];

// Match every `background:` / `background-color:` declaration outside
// of comments. We filter `transparent` post-hoc — the compact-toggle
// uses `background: transparent` as a CSS reset on a native <button>,
// which paints nothing (it's the contractual zero, not a fill).
const BG_REGEX = /(?<![-a-z])background(-color)?\s*:\s*([^;]+);/g;
const isTransparentValue = (decl: string): boolean =>
  /:\s*transparent\s*;$/.test(decl);

describe('Story 1.11 Task 12 — HUD style defense: no background fills', () => {
  for (const { file } of HUD_SOURCES) {
    it(`${file}: contains no background:/background-color: declarations (except transparent)`, () => {
      const src = stripComments(readSrc(file));
      const matches = (src.match(BG_REGEX) ?? []).filter(
        (m) => !isTransparentValue(m),
      );
      expect(
        matches,
        `Found illegal background declaration in ${file}:\n${matches.join('\n')}\n` +
          `The HUD must be transparent over the canvas (UX spec — canvas-and-edges).`,
      ).toEqual([]);
    });
  }
});

describe('Story 1.11 AC2 — text-shadow legibility on the container', () => {
  it('v-hud.ts declares the token-equivalent text-shadow on :host', () => {
    const src = readSrc('v-hud.ts');
    expect(src).toMatch(/text-shadow:\s*0\s+0\s+8px\s+rgba\(10,\s*14,\s*20,\s*0\.8\)/);
  });
});

describe('Story 1.11 AC3/AC4/AC5 — JetBrains Mono + tabular-nums on numeric readouts', () => {
  for (const { file, rendersNumbers } of HUD_SOURCES) {
    if (!rendersNumbers) continue;
    it(`${file}: declares var(--v-font-mono)`, () => {
      const src = readSrc(file);
      expect(src).toContain('var(--v-font-mono)');
    });

    it(`${file}: declares font-variant-numeric: tabular-nums`, () => {
      const src = readSrc(file);
      expect(src).toMatch(/font-variant-numeric:\s*tabular-nums/);
    });
  }
});

describe('Story 1.11 AC6 — aria-live "polite" never "assertive"', () => {
  for (const { file } of HUD_SOURCES) {
    it(`${file}: contains no aria-live="assertive"`, () => {
      const src = readSrc(file);
      expect(src).not.toMatch(/aria-live\s*=\s*['"]assertive['"]/);
    });
  }
});

describe('Story 1.11 AC7 — uses only the existing 1023px breakpoint', () => {
  it('v-hud.ts uses (max-width: 1023px) and introduces no new media queries', () => {
    const src = readSrc('v-hud.ts');
    const media = src.match(/@media[^{]+\{/g) ?? [];
    for (const m of media) {
      expect(m).toMatch(/max-width:\s*1023px/);
    }
  });

  it('no HUD sub-component introduces its own @media query', () => {
    for (const { file } of HUD_SOURCES) {
      if (file === 'v-hud.ts') continue;
      const src = readSrc(file);
      expect(src).not.toMatch(/@media\b/);
    }
  });
});
