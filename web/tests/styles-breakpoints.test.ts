import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Story 1.7 AC6 — exactly three structural breakpoints across the
// styles directory. Any other adaptive sizing must use clamp(), not
// media queries. The only acceptable "@media" entries beyond the three
// structural breakpoints are accessibility queries (prefers-*).

const stylesDir = resolve(__dirname, '..', 'src', 'styles');

/** Remove /* ... *\/ comments. Substring matching of "@media" inside a
 *  doc comment would otherwise inflate the breakpoint count. */
function stripCssComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

function walkCss(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walkCss(full));
    } else if (e.isFile() && e.name.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

const STRUCTURAL_BREAKPOINTS = [
  /@media\s*\(\s*max-width\s*:\s*767px\s*\)/,
  /@media\s*\(\s*max-width\s*:\s*1023px\s*\)/,
  /@media\s*\(\s*min-width\s*:\s*1920px\s*\)/,
];

const ALL_MEDIA_PATTERN = /@media\s*\([^)]+\)/g;

describe('Story 1.7 AC6 — exactly three structural breakpoints', () => {
  const cssFiles = walkCss(stylesDir);

  it('has at least one CSS file in styles/ (sanity check)', () => {
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  it.each(STRUCTURAL_BREAKPOINTS.map((p) => [p.source]))(
    'declares the structural breakpoint matching %s',
    (sourceStr) => {
      const re = new RegExp(sourceStr);
      const present = cssFiles.some((f) =>
        re.test(stripCssComments(readFileSync(f, 'utf-8'))),
      );
      expect(
        present,
        `Structural breakpoint /${sourceStr}/ not found in any file under ` +
          `web/src/styles/. The breakpoint must be present (see breakpoints.css).`,
      ).toBe(true);
    },
  );

  it('@media queries in styles/ are EITHER one of the three structural breakpoints OR prefers-* (accessibility)', () => {
    const offenders: string[] = [];
    for (const file of cssFiles) {
      const content = stripCssComments(readFileSync(file, 'utf-8'));
      const matches = content.match(ALL_MEDIA_PATTERN) ?? [];
      for (const m of matches) {
        const isStructural = STRUCTURAL_BREAKPOINTS.some((p) => p.test(m));
        const isPrefersStar = /\(\s*prefers-[a-z-]+/.test(m);
        if (!isStructural && !isPrefersStar) {
          offenders.push(`${file}: ${m}`);
        }
      }
    }
    expect(
      offenders,
      `Found @media queries outside the three structural breakpoints + prefers-* set: ` +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('total non-prefers @media count equals exactly 3 (no duplicates either)', () => {
    let count = 0;
    for (const file of cssFiles) {
      const content = stripCssComments(readFileSync(file, 'utf-8'));
      const matches = content.match(ALL_MEDIA_PATTERN) ?? [];
      for (const m of matches) {
        if (!/\(\s*prefers-/.test(m)) {
          count += 1;
        }
      }
    }
    expect(count).toBe(3);
  });
});

// === breakpoints.ts mirrors the CSS values ===========================

describe('Story 1.7 AC6 — breakpoints.ts mirrors the CSS values', () => {
  it('exports the three breakpoint constants', async () => {
    const mod = (await import('../src/styles/breakpoints')) as typeof import('../src/styles/breakpoints');
    expect(mod.BREAKPOINTS.mobile).toBe(767);
    expect(mod.BREAKPOINTS.tablet).toBe(1023);
    expect(mod.BREAKPOINTS.wide).toBe(1920);
  });

  it('exports matchMedia query strings that pair with the structural set', async () => {
    const mod = (await import('../src/styles/breakpoints')) as typeof import('../src/styles/breakpoints');
    expect(mod.BREAKPOINT_QUERIES.mobile).toBe('(max-width: 767px)');
    expect(mod.BREAKPOINT_QUERIES.tablet).toBe('(max-width: 1023px)');
    expect(mod.BREAKPOINT_QUERIES.wide).toBe('(min-width: 1920px)');
  });
});

// We also assert that the wider styles + index.html only carry these
// breakpoints — defense against accidentally adding a 4th breakpoint
// elsewhere later. Just spot-check the styles dir again with an exact
// pixel-count of `(max-width|min-width).*px` matches.
const SIZE_MEDIA_PATTERN = /@media\s*\([^)]*(?:max-width|min-width)[^)]*\d+px[^)]*\)/g;

describe('Story 1.7 AC6 — defense: no additional pixel-based @media in styles/', () => {
  it('total pixel-based @media count across web/src/styles/ equals 3', () => {
    let n = 0;
    for (const f of walkCss(stylesDir)) {
      const m = stripCssComments(readFileSync(f, 'utf-8')).match(SIZE_MEDIA_PATTERN) ?? [];
      n += m.length;
    }
    expect(n).toBe(3);
  });
});

// And in index.html nothing pixel-based slipped into the inline <style>.
describe('Story 1.7 AC6 — no pixel-based @media slipped into index.html inline <style>', () => {
  it('index.html inline <style> contains zero pixel-based @media queries', () => {
    const html = readFileSync(
      resolve(__dirname, '..', 'index.html'),
      'utf-8',
    );
    const matches = html.match(SIZE_MEDIA_PATTERN) ?? [];
    expect(
      matches,
      `Pixel-based @media query found inline in index.html: ` +
        matches.join(', ') +
        ` — keep breakpoints in web/src/styles/, not the FOUC shim.`,
    ).toEqual([]);
    // Sanity that we did read the right file.
    expect(statSync(resolve(__dirname, '..', 'index.html')).size).toBeGreaterThan(0);
  });
});
