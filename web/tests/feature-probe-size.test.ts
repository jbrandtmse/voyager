import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// Story 1.8 AC1 — the inline boot-time probe in `dist/index.html` must be
// ≤ 1 KB minified. This test gates itself on a built dist/index.html so a
// unit-only run (no build) doesn't fail.

const webRoot = resolve(__dirname, '..');
const distIndex = resolve(webRoot, 'dist', 'index.html');
const distHasBuild = existsSync(distIndex);

const BUDGET_BYTES = 1024;

describe('Story 1.8 AC1 — inline probe size budget', () => {
  it.skipIf(!distHasBuild)(
    'dist/index.html inline probe <script> body is ≤ 1 KB minified',
    () => {
      const html = readFileSync(distIndex, 'utf8');
      // Extract the FIRST inline <script>...</script> in <head>. The Vite
      // plugin emits exactly one such script (the probe). Any other
      // scripts in the build go in <body> as module preload links.
      const m = html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/);
      expect(m, 'Expected an inline <script> in dist/index.html').toBeTruthy();
      const body = m![1];
      const bodySize = Buffer.byteLength(body, 'utf8');
      expect(
        bodySize,
        `Inline probe body is ${bodySize} bytes; budget = ${BUDGET_BYTES}. ` +
          `Trim PROBE_BODY in feature-detect.ts.`,
      ).toBeLessThanOrEqual(BUDGET_BYTES);
    },
  );

  it.skipIf(!distHasBuild)(
    'inline probe references all three capabilities + the /unsupported.html target',
    () => {
      const html = readFileSync(distIndex, 'utf8');
      const m = html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/);
      const body = m![1];
      expect(body).toContain('WebGL2RenderingContext');
      expect(body).toContain('WebAssembly');
      expect(body).toContain("DecompressionStream('br')");
      expect(body).toContain('/unsupported.html?reason=');
    },
  );

  it.skipIf(!distHasBuild)(
    'inline probe dynamic-imports a hashed asset URL (not /src/main.ts)',
    () => {
      const html = readFileSync(distIndex, 'utf8');
      const m = html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/);
      const body = m![1];
      // In a prod build the probe must call `import('/assets/main-XXXX.js')`
      // with a hashed filename — never `/src/main.ts` (which is the dev
      // path and would 404 in prod).
      expect(body).toMatch(/import\('\/assets\/main-[A-Za-z0-9_-]+\.js'\)/);
      expect(body).not.toContain("'/src/main.ts'");
    },
  );

  it.skipIf(!distHasBuild)(
    'dist/index.html has NO static <script type="module" src="/src/main.ts">',
    () => {
      const html = readFileSync(distIndex, 'utf8');
      // The static module tag would defeat the probe (the bundle would
      // load regardless of probe outcome). The spec forbids it explicitly.
      expect(html).not.toMatch(/<script\s[^>]*src=["'][^"']*\/src\/main\.ts/);
    },
  );

  it.skipIf(!distHasBuild)(
    'dist/index.html exists and is non-trivial in size',
    () => {
      expect(statSync(distIndex).size).toBeGreaterThan(500);
    },
  );
});
