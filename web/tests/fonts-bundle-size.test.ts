import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Story 1.7 AC3 — measured combined .woff2 size on disk after `npm run
// build` must be ≤ 120 KB. The test gates itself on a built `dist/`
// containing at least one .woff2 so unit-only runs (no build) don't fail.

const webRoot = resolve(__dirname, '..');
const distRoot = resolve(webRoot, 'dist');

const BUDGET_BYTES = 120 * 1024;

function findWoff2(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...findWoff2(full));
    else if (e.isFile() && e.name.endsWith('.woff2')) out.push(full);
  }
  return out;
}

const distHasFonts = findWoff2(distRoot).length > 0;

describe('Story 1.7 AC3 — built font bundle is ≤ 120 KB combined', () => {
  // The post-build assertion: gate on dist/ containing at least one woff2
  // so a stale dist/ (built before this story) doesn't fail this suite.
  it.skipIf(!distHasFonts)(
    '`npm run build` populates dist/ and total .woff2 size ≤ 120 KB',
    () => {
      const fonts = findWoff2(distRoot);
      expect(
        fonts.length,
        `Expected at least 3 .woff2 files in dist/. Found: ${fonts.length}. ` +
          `Did the build copy public/fonts/ to dist/?`,
      ).toBeGreaterThanOrEqual(3);

      const totalSize = fonts.reduce((acc, f) => acc + statSync(f).size, 0);
      const sizeKb = totalSize / 1024;
      expect(
        totalSize,
        `Combined .woff2 size = ${sizeKb.toFixed(1)} KB ` +
          `(budget = ${(BUDGET_BYTES / 1024).toFixed(0)} KB). ` +
          `Re-run scripts/font-subset.py with tighter subset, or trim layout features.`,
      ).toBeLessThanOrEqual(BUDGET_BYTES);
    },
  );

  // Always-on companion: the source files at public/fonts/ are also under
  // the same budget. This is what the build copies, so they should match.
  it('source files at public/fonts/ total ≤ 120 KB', () => {
    const fonts = findWoff2(resolve(webRoot, 'public', 'fonts'));
    expect(
      fonts.length,
      `Expected at least 3 .woff2 files in web/public/fonts/. Found: ${fonts.length}.`,
    ).toBeGreaterThanOrEqual(3);

    const totalSize = fonts.reduce((acc, f) => acc + statSync(f).size, 0);
    const sizeKb = totalSize / 1024;
    expect(
      totalSize,
      `web/public/fonts/ total = ${sizeKb.toFixed(1)} KB (budget = ${BUDGET_BYTES / 1024} KB). ` +
        `Re-run scripts/font-subset.py with a tighter subset.`,
    ).toBeLessThanOrEqual(BUDGET_BYTES);
  });

  it('each individual font face has the expected name (no stray faces)', () => {
    const fontDir = resolve(webRoot, 'public', 'fonts');
    const names = readdirSync(fontDir)
      .filter((n) => n.endsWith('.woff2'))
      .sort();
    expect(names).toEqual(
      [
        'inter-regular.woff2',
        'jetbrains-mono-regular.woff2',
        'source-serif-4-variable.woff2',
      ].sort(),
    );
  });
});
