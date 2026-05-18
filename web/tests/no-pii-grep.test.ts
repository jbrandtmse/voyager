import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');

const FILES_TO_SCAN = [
  'bake/pyproject.toml',
  'bake/uv.lock',
  'web/package.json',
  'web/package-lock.json',
];

const FORBIDDEN_SUBSTRINGS = [
  'analytics',
  'telemetry',
  'fingerprint',
  'cookie-consent',
  'ga-',
  'gtag',
  'mixpanel',
  'segment',
  'amplitude',
  'hotjar',
  'sentry',
  'datadog',
];

interface DocumentedException {
  file: string;
  pattern: string;
  matchedLineContains: string;
  reason: string;
}

const DOCUMENTED_EXCEPTIONS: DocumentedException[] = [
  {
    file: 'web/package-lock.json',
    pattern: 'gtag',
    matchedLineContains: 'sha512-xJBAbDifo5hpffDBuHl0Y8ywswbiAp/Wi7Y/GtAgSlZyIABppyurxVueOPE8LUQOxdlgi6Zqce7uoEpqNTeiUw',
    reason:
      "SHA512 integrity hash for @types/esrecurse@4.3.1 happens to contain 'GtAg'. This is a cryptographic hash, not a reference to Google Analytics gtag.js.",
  },
  {
    file: 'web/package-lock.json',
    pattern: 'telemetry',
    matchedLineContains: '"@opentelemetry/api"',
    reason:
      "vitest declares @opentelemetry/api as an optional peerDependency. The package is not installed (web/node_modules/@opentelemetry/ does not exist) and vitest is a dev dep — the production browser artifact ships zero OpenTelemetry bytes. Structural assertion below verifies the dep remains optional and is not actually installed.",
  },
];

function isDocumentedException(file: string, pattern: string, line: string): boolean {
  return DOCUMENTED_EXCEPTIONS.some(
    (ex) =>
      ex.file === file &&
      ex.pattern === pattern &&
      line.includes(ex.matchedLineContains),
  );
}

describe('Story 1.1 / AC3 — no-PII / no-analytics grep guard', () => {
  describe.each(FILES_TO_SCAN)('scanning %s', (relativeFile) => {
    const absolutePath = resolve(repoRoot, relativeFile);
    const contents = readFileSync(absolutePath, 'utf-8');
    const lines = contents.split(/\r?\n/);

    it.each(FORBIDDEN_SUBSTRINGS)(
      'has no NEW matches for forbidden substring "%s" beyond documented exceptions',
      (pattern) => {
        const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        const undocumentedMatches: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (regex.test(line) && !isDocumentedException(relativeFile, pattern, line)) {
            undocumentedMatches.push(`${relativeFile}:${i + 1}: ${line.trim().slice(0, 200)}`);
          }
        }

        expect(
          undocumentedMatches,
          `Found ${undocumentedMatches.length} undocumented match(es) for "${pattern}" in ${relativeFile}. ` +
            `If this is a legitimate exception, add it to DOCUMENTED_EXCEPTIONS with rationale (and capture in an ADR). ` +
            `Matches:\n${undocumentedMatches.join('\n')}`,
        ).toEqual([]);
      },
    );
  });

  it('verifies each documented exception actually matches in the current files (no stale exceptions)', () => {
    for (const ex of DOCUMENTED_EXCEPTIONS) {
      const contents = readFileSync(resolve(repoRoot, ex.file), 'utf-8');
      const regex = new RegExp(
        ex.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      const matchingLines = contents
        .split(/\r?\n/)
        .filter((line) => regex.test(line) && line.includes(ex.matchedLineContains));
      expect(
        matchingLines.length,
        `Documented exception is stale (no longer matches): file=${ex.file} pattern=${ex.pattern} marker="${ex.matchedLineContains}". ` +
          `Remove it from DOCUMENTED_EXCEPTIONS.`,
      ).toBeGreaterThan(0);
    }
  });

  it('@opentelemetry/api remains an OPTIONAL peer dep and is not actually installed (defends the documented exception)', () => {
    const lockPath = resolve(repoRoot, 'web/package-lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as {
      packages?: Record<string, { peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }> }>;
    };
    const packages = lock.packages ?? {};

    const installed = Object.keys(packages).filter((key) =>
      key === 'node_modules/@opentelemetry/api' || key.startsWith('node_modules/@opentelemetry/'),
    );
    expect(
      installed,
      `@opentelemetry/* is INSTALLED transitively (${installed.join(', ')}). ` +
        `The documented exception assumes the package is unrealized at install time. ` +
        `If this is intentional, remove the exception, update the README's privacy commitment, and capture an ADR. ` +
        `Otherwise, find which dep pulled it in and replace.`,
    ).toEqual([]);

    const declarers = Object.entries(packages).filter(
      ([, pkg]) => pkg.peerDependencies && '@opentelemetry/api' in pkg.peerDependencies,
    );
    expect(
      declarers.length,
      'Expected at least one package to declare @opentelemetry/api as a peer dependency (e.g., vitest). ' +
        'If no package declares it, the documented exception is stale — remove it.',
    ).toBeGreaterThan(0);

    for (const [pkgKey, pkg] of declarers) {
      const optional = pkg.peerDependenciesMeta?.['@opentelemetry/api']?.optional === true;
      expect(
        optional,
        `${pkgKey} declares @opentelemetry/api as a peerDependency but NOT as optional. ` +
          `This means the dep would be expected at install time, which violates the documented-exception rationale. ` +
          `Either fix the dep, remove this exception, or author an ADR documenting the new posture.`,
      ).toBe(true);
    }
  });
});
