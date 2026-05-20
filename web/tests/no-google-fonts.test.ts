import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Story 1.7 AC3 + FR50 + ADR 0019 — no third-party font CDN, no
// analytics-adjacent font hosts. Self-hosted .woff2 files under
// web/public/fonts/ are the only legal font source.

const FORBIDDEN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.typekit.net',
  'kit.fontawesome.com',
  'fast.fonts.net',
  'cloud.typography.com',
];

const repoRoot = resolve(__dirname, '..', '..');
const webRoot = resolve(__dirname, '..');

function walkText(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      out.push(...walkText(full, exts));
    } else if (e.isFile() && exts.some((ext) => e.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

describe('Story 1.7 AC3 — no Google Fonts / third-party font CDN', () => {
  const stylesFiles = walkText(
    resolve(webRoot, 'src', 'styles'),
    ['.css', '.ts'],
  );
  const indexHtml = resolve(webRoot, 'index.html');
  const packageJson = resolve(webRoot, 'package.json');
  const packageLock = resolve(webRoot, 'package-lock.json');

  const filesToScan = [...stylesFiles, indexHtml, packageJson, packageLock];

  it.each(FORBIDDEN_HOSTS)('no file references the forbidden host %s', (host) => {
    const offenders: string[] = [];
    for (const f of filesToScan) {
      const text = readFileSync(f, 'utf-8');
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(host)) {
          offenders.push(`${f}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
        }
      }
    }
    expect(
      offenders,
      `Found references to ${host}. Voyager self-hosts fonts only ` +
        `(FR50, ADR 0019). Matches:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('fonts.css references only /fonts/ relative URLs (no http(s):// scheme)', () => {
    const fonts = readFileSync(
      resolve(webRoot, 'src', 'styles', 'fonts.css'),
      'utf-8',
    );
    const httpRefs = fonts.match(/url\(\s*['"]?https?:\/\/[^)]+\)/g) ?? [];
    expect(
      httpRefs,
      `fonts.css must reference only local /fonts/ URLs. Found: ${httpRefs.join(', ')}`,
    ).toEqual([]);
    // Sanity: it does reference at least one /fonts/ path.
    expect(/url\(\s*['"]?\/fonts\//.test(fonts)).toBe(true);
  });

  it('the three self-hosted font files appear in public/fonts/', () => {
    const fontDir = resolve(webRoot, 'public', 'fonts');
    const entries = readdirSync(fontDir).filter((n) => n.endsWith('.woff2'));
    expect(entries).toEqual(
      expect.arrayContaining([
        'jetbrains-mono-regular.woff2',
        'inter-regular.woff2',
        'source-serif-4-variable.woff2',
      ]),
    );
  });

  it('repo root has no @import url(...) referencing a font CDN anywhere in tracked sources', () => {
    // Walk the whole repo (excluding heavy/binary dirs) and check for the
    // forbidden hosts as a final belt-and-suspenders sweep — catches
    // any tracked file outside web/ that might import a font CDN.
    // _bmad-output/ contains planning artifacts + the AC text for this
    // very story (which mentions the forbidden hostnames as things to
    // forbid). Those documents are not shipped to users, so they don't
    // count as font-CDN references in the runtime artifact. Same for
    // top-level docs/.
    const skipDirs = new Set([
      '.git',
      'node_modules',
      'dist',
      'kernels',
      'bake_runtime',
      '__pycache__',
      '.venv',
      '_bmad-output',
      '_bmad',
      'docs',
    ]);
    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (skipDirs.has(e.name)) continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full));
        else if (
          e.isFile() &&
          /\.(css|html|ts|tsx|js|json|md)$/i.test(e.name) &&
          !full.includes('package-lock.json') &&
          !full.includes('no-google-fonts.test.ts')
        ) {
          out.push(full);
        }
      }
      return out;
    }
    const violators: string[] = [];
    for (const f of walk(repoRoot)) {
      const text = readFileSync(f, 'utf-8');
      for (const h of FORBIDDEN_HOSTS) {
        if (text.includes(h)) {
          violators.push(`${f}: ${h}`);
        }
      }
    }
    expect(
      violators,
      `Forbidden font CDN references found in tracked sources:\n${violators.join('\n')}`,
    ).toEqual([]);
  });
});
