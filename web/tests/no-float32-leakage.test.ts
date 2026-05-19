import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

// AC3 defense test: the Float64 → Float32 cast is allowed to be constructed
// in exactly two places: types/branded.ts (the boundary type module) and
// math/floating-origin.ts (the per-frame recenter). Any other appearance of
// `new Float32Array(` under web/src/ is a leak and breaks the precision
// contract.
//
// The grep is intentionally syntactic — it scans literal text. Comments,
// strings, and type annotations are all considered. That's by design: we
// want even commented-out usages to be intentional and reviewed.

const webRoot = resolve(__dirname, '..');
const srcRoot = resolve(webRoot, 'src');

const ALLOWED_FILES = new Set<string>([
  resolve(srcRoot, 'types/branded.ts'),
  resolve(srcRoot, 'math/floating-origin.ts'),
]);

const FORBIDDEN_PATTERN = /new\s+Float32Array\s*\(/;

const walkTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
};

describe('AC3 defense — no `new Float32Array(...)` outside the boundary modules', () => {
  it('grep web/src/ for forbidden Float32Array constructors', () => {
    const tsFiles = walkTsFiles(srcRoot);
    const violations: string[] = [];

    for (const file of tsFiles) {
      const normalized = resolve(file);
      if (ALLOWED_FILES.has(normalized)) continue;
      const contents = readFileSync(file, 'utf-8');
      const lines = contents.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (FORBIDDEN_PATTERN.test(line)) {
          violations.push(
            `${relative(webRoot, file)}:${idx + 1}: ${line.trim().slice(0, 200)}`,
          );
        }
      });
    }

    expect(
      violations,
      `Forbidden Float32Array constructor outside allow-listed modules. ` +
        `Only types/branded.ts and math/floating-origin.ts may build a RenderVec3 / Float32Array directly. ` +
        `Route through renderVec3FromWorld() or renderVec3(). Violations:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('allow-listed files do contain at least one Float32Array constructor (otherwise the rule is misnamed)', () => {
    for (const allowed of ALLOWED_FILES) {
      const contents = readFileSync(allowed, 'utf-8');
      expect(
        FORBIDDEN_PATTERN.test(contents),
        `Allow-listed file ${relative(webRoot, allowed)} does not contain a Float32Array constructor; ` +
          `the allow-list is stale. Either remove it from ALLOWED_FILES or restore the cast.`,
      ).toBe(true);
    }
  });
});
