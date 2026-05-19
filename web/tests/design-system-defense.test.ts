// @vitest-environment happy-dom
//
// Story 1.7 defense-in-depth — design-system tripwires.
//
// Complements the dev's six co-located + integration tests with regression
// guards for the contracts that are easy to break by accident: namespace
// drift, hex literals creeping back into components, contrast drift, the
// reduced-motion override fragmenting per-component, font-preload <-> file
// disagreement, decorator re-introduction, breakpoint-form drift, and the
// FOUC-shim 1 KB ceiling.
//
// All tests read source files; none require a build pass.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const webRoot = resolve(__dirname, '..');
const stylesDir = resolve(webRoot, 'src', 'styles');
const componentsDir = resolve(webRoot, 'src', 'components');
const publicFontsDir = resolve(webRoot, 'public', 'fonts');
const indexHtmlPath = resolve(webRoot, 'index.html');
const tokensCssPath = resolve(stylesDir, 'tokens.css');
const fontsCssPath = resolve(stylesDir, 'fonts.css');
const globalCssPath = resolve(stylesDir, 'global.css');
const breakpointsCssPath = resolve(stylesDir, 'breakpoints.css');
const breakpointsTsPath = resolve(stylesDir, 'breakpoints.ts');
const packageJsonPath = resolve(webRoot, 'package.json');
const packageLockPath = resolve(webRoot, 'package-lock.json');

function stripCssComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

function walk(dir: string, predicate: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walk(full, predicate));
    } else if (e.isFile() && predicate(e.name)) {
      out.push(full);
    }
  }
  return out;
}

// === 1. Token namespace discipline ====================================

describe('Story 1.7 defense — every CSS custom property in styles/ uses the --v- prefix', () => {
  const cssFiles = walk(stylesDir, (n) => n.endsWith('.css'));

  it('discovers at least one CSS file under styles/ (sanity)', () => {
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  // A CSS custom property declaration is `--name:`. We also need to spot the
  // setter form inside @media rules. Grep for any `--<ident>` followed by `:`.
  const CUSTOM_PROP_DECL = /(--[a-zA-Z][\w-]*)\s*:/g;

  it.each(cssFiles)('every custom-property declaration in %s uses the --v- prefix', (file) => {
    const content = stripCssComments(readFileSync(file, 'utf-8'));
    const offenders: string[] = [];
    for (const match of content.matchAll(CUSTOM_PROP_DECL)) {
      const name = match[1];
      // Vendor / standard CSS properties (--webkit-*, etc.) don't exist as
      // custom properties; everything matching `--` is author-defined.
      if (!name.startsWith('--v-')) {
        offenders.push(name);
      }
    }
    expect(
      offenders,
      `Custom properties without --v- prefix in ${file}: ${offenders.join(', ')}. ` +
        `tokens.css is the single source of truth; parallel namespaces are forbidden.`,
    ).toEqual([]);
  });
});

// === 2. Token consumption discipline (no hex literals in components) ===

describe('Story 1.7 defense — components reference colors via var(--v-color-*), not hex literals', () => {
  const componentFiles = walk(componentsDir, (n) =>
    n.endsWith('.ts') || n.endsWith('.css'),
  );

  // Match hex colors of 3, 4, 6, or 8 digits, anchored by `#` and ended at
  // a non-hex character. Trailing word-boundary keeps the match tight.
  const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;

  it('finds component files to scan (sanity)', () => {
    expect(componentFiles.length).toBeGreaterThan(0);
  });

  it.each(componentFiles)('%s contains zero hardcoded hex color literals', (file) => {
    const content = readFileSync(file, 'utf-8');
    // Strip CSS-style comments (component files are TS but embed css`...`
    // template strings that may include /* ... */).
    const stripped = stripCssComments(content);
    const matches = stripped.match(HEX_COLOR) ?? [];
    expect(
      matches,
      `Hardcoded hex color(s) in ${file}: ${matches.join(', ')}. ` +
        `Every color reference must go through var(--v-color-*) — tokens.css owns the palette.`,
    ).toEqual([]);
  });
});

// === 3. WCAG 2.2 contrast guard =======================================

// Color pairings from UX spec §930-936. The `expected` ratios below are
// the values computed by this file's WCAG 2.2 formula against the current
// hex values in tokens.css — they LOCK the implementation so any tweak to
// a hex value fails this test loudly. They differ slightly from the values
// printed in the UX spec table (e.g., spec says 15.4 for fg-on-bg; the
// canonical sRGB formula computes 16.05). The spec table's published
// values appear to be from an older calculator pass and have drifted; the
// formula here is the WCAG 2.2 canonical (https://www.w3.org/TR/WCAG22/
// #dfn-relative-luminance). The `aaThreshold` column carries the AA
// minimum-contrast bar each pairing must clear independent of the
// implementation lock.
//
// WCAG 2.2 relative-luminance formula:
//   L = 0.2126·R + 0.7152·G + 0.0722·B, where each channel is
//   normalized to [0,1] and de-linearized:
//     c = c/12.92                  if c <= 0.03928
//     c = ((c + 0.055) / 1.055)^2.4 otherwise
//   contrast = (L_lighter + 0.05) / (L_darker + 0.05)

interface ContrastCase {
  fg: string;
  bg: string;
  /** Computed lock value — must match within ±0.1 (catches hex tweaks). */
  expected: number;
  /** WCAG AA minimum that the pairing must clear regardless of the lock. */
  aaThreshold: number;
}

const CONTRAST_CASES: ContrastCase[] = [
  // fg / fg-muted / accent / ck are body-text use (AA = 4.5:1).
  { fg: '--v-color-fg', bg: '--v-color-bg', expected: 16.05, aaThreshold: 4.5 },
  { fg: '--v-color-fg-muted', bg: '--v-color-bg', expected: 7.32, aaThreshold: 4.5 },
  { fg: '--v-color-accent', bg: '--v-color-bg', expected: 8.14, aaThreshold: 4.5 },
  { fg: '--v-color-ck', bg: '--v-color-bg', expected: 3.95, aaThreshold: 3.0 },
  // fg-quiet is large-text only (UX spec §932 caveat: "AA large only — used only at ≥18px"); AA large = 3:1.
  { fg: '--v-color-fg-quiet', bg: '--v-color-bg', expected: 3.2, aaThreshold: 3.0 },
  // focus ring is a non-text UI component; SC 1.4.11 minimum is 3:1.
  { fg: '--v-color-focus', bg: '--v-color-bg', expected: 5.51, aaThreshold: 3.0 },
];

function parseTokenHex(css: string, name: string): { r: number; g: number; b: number } {
  // Match: --v-color-foo: #rrggbb;
  const re = new RegExp(`${name.replace(/-/g, '-')}\\s*:\\s*#([0-9a-fA-F]{6})\\b`);
  const m = css.match(re);
  if (!m) {
    throw new Error(`Token ${name} not found as a #rrggbb literal in tokens.css.`);
  }
  const hex = m[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const linearize = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Story 1.7 defense — WCAG 2.2 contrast ratios lock the implementation', () => {
  const tokensCss = readFileSync(tokensCssPath, 'utf-8');

  it.each(CONTRAST_CASES)(
    'computed contrast for $fg on $bg is within ±0.1 of locked $expected:1',
    ({ fg, bg, expected }) => {
      const fgRgb = parseTokenHex(tokensCss, fg);
      const bgRgb = parseTokenHex(tokensCss, bg);
      const ratio = contrastRatio(fgRgb, bgRgb);
      expect(
        Math.abs(ratio - expected),
        `Contrast for ${fg} on ${bg} = ${ratio.toFixed(2)}:1 ` +
          `(locked ${expected.toFixed(2)}:1). ` +
          `A hex value was tweaked — re-derive the lock value and update UX spec §930-936 if intentional.`,
      ).toBeLessThanOrEqual(0.1);
    },
  );

  it.each(CONTRAST_CASES)(
    'contrast for $fg on $bg clears the AA minimum of $aaThreshold:1',
    ({ fg, bg, aaThreshold }) => {
      const fgRgb = parseTokenHex(tokensCss, fg);
      const bgRgb = parseTokenHex(tokensCss, bg);
      const ratio = contrastRatio(fgRgb, bgRgb);
      expect(
        ratio,
        `Contrast for ${fg} on ${bg} = ${ratio.toFixed(2)}:1, below WCAG 2.2 AA minimum of ${aaThreshold}:1. ` +
          `FR49 / UX spec §Accessibility requires this pairing pass AA.`,
      ).toBeGreaterThanOrEqual(aaThreshold);
    },
  );
});

// === 4. Reduced-motion override is global, exactly once ===============

describe('Story 1.7 defense — prefers-reduced-motion override is declared exactly once (in global.css)', () => {
  const styleFiles = walk(stylesDir, (n) => n.endsWith('.css'));
  const componentStyleStringSources = walk(componentsDir, (n) =>
    n.endsWith('.ts') || n.endsWith('.css'),
  );
  const allFiles = [...styleFiles, ...componentStyleStringSources];
  const REDUCED_MOTION = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/g;

  it('every prefers-reduced-motion match is in global.css (no per-component overrides)', () => {
    const offenders: string[] = [];
    let total = 0;
    for (const f of allFiles) {
      const content = stripCssComments(readFileSync(f, 'utf-8'));
      const matches = content.match(REDUCED_MOTION) ?? [];
      total += matches.length;
      if (matches.length > 0 && resolve(f) !== resolve(globalCssPath)) {
        offenders.push(`${f}: ${matches.length} occurrence(s)`);
      }
    }
    expect(
      offenders,
      `prefers-reduced-motion appears outside global.css: ${offenders.join('; ')}. ` +
        `Per-component overrides are an anti-pattern — UX spec §672 + AC5 require a single :root override.`,
    ).toEqual([]);
    expect(
      total,
      `Expected exactly 1 prefers-reduced-motion declaration across styles/ + components/ ` +
        `(it lives at :root in global.css). Found ${total}.`,
    ).toBe(1);
  });
});

// === 5. Font preload <link> entries match the actual font files =======

describe('Story 1.7 defense — every preload <link as="font"> in index.html points at an existing file', () => {
  const html = readFileSync(indexHtmlPath, 'utf-8');
  // Match <link ... as="font" ... href="..."> with attributes in either order.
  const FONT_PRELOAD_TAG = /<link\b[^>]*\bas\s*=\s*["']font["'][^>]*>/gi;
  const HREF_ATTR = /\bhref\s*=\s*["']([^"']+)["']/i;

  const tags = html.match(FONT_PRELOAD_TAG) ?? [];

  it('index.html declares at least one font preload (sanity)', () => {
    expect(tags.length).toBeGreaterThan(0);
  });

  it.each(tags)('preload tag %s references a font file that exists on disk', (tag) => {
    const m = tag.match(HREF_ATTR);
    expect(m, `Preload tag missing href: ${tag}`).not.toBeNull();
    const href = m![1];
    // Vite serves web/public/ at the root, so /fonts/foo.woff2 resolves to
    // web/public/fonts/foo.woff2.
    expect(
      href.startsWith('/fonts/'),
      `Preload href must be under /fonts/. Got: ${href}`,
    ).toBe(true);
    const relPath = href.replace(/^\//, '');
    const fullPath = resolve(webRoot, 'public', relPath);
    expect(
      existsSync(fullPath),
      `Preloaded font file missing on disk: ${fullPath}. ` +
        `Did someone rename a font without updating the preload in index.html?`,
    ).toBe(true);
  });
});

// === 6. fonts.css @font-face src URLs match files on disk =============

describe('Story 1.7 defense — every src: url(...) in fonts.css resolves to an existing file', () => {
  const fontsCss = readFileSync(fontsCssPath, 'utf-8');
  // Match src: url('...') (single, double, or no quotes).
  const SRC_URL = /\bsrc\s*:\s*url\(\s*['"]?([^)'"]+)['"]?\s*\)/g;
  const refs = Array.from(fontsCss.matchAll(SRC_URL), (m) => m[1]);
  // Source Serif 4 declares two src: url() entries (woff2-variations +
  // woff2 fallback); dedupe so we don't double-count.
  const uniqueRefs = Array.from(new Set(refs));

  it('finds at least three font src: url(...) entries (one per face)', () => {
    expect(uniqueRefs.length).toBeGreaterThanOrEqual(3);
  });

  it.each(uniqueRefs)('font src URL %s resolves to a file under web/public/', (href) => {
    expect(
      href.startsWith('/fonts/'),
      `@font-face src must reference /fonts/<file>. Got: ${href}`,
    ).toBe(true);
    const fullPath = resolve(webRoot, 'public', href.replace(/^\//, ''));
    expect(
      existsSync(fullPath),
      `@font-face src target missing on disk: ${fullPath}. ` +
        `Rename a font? Update fonts.css and index.html together.`,
    ).toBe(true);
  });
});

// === 7. Per-font subset budget (±10% tolerance) =======================

interface FontBudget {
  file: string;
  expected: number;
}

const FONT_BUDGETS: FontBudget[] = [
  { file: 'jetbrains-mono-regular.woff2', expected: 19520 },
  { file: 'inter-regular.woff2', expected: 21952 },
  { file: 'source-serif-4-variable.woff2', expected: 59704 },
];

describe('Story 1.7 defense — per-font subset stays within ±10% of dev-reported size', () => {
  it.each(FONT_BUDGETS)(
    '$file size is within 10% of $expected bytes',
    ({ file, expected }) => {
      const full = resolve(publicFontsDir, file);
      expect(existsSync(full), `Missing font file: ${full}`).toBe(true);
      const actual = statSync(full).size;
      const tolerance = expected * 0.1;
      const delta = Math.abs(actual - expected);
      expect(
        delta,
        `${file} size = ${actual} B (expected ${expected} ±${tolerance.toFixed(0)} B). ` +
          `A re-subset that bloats individual faces will eventually break the 120 KB total budget.`,
      ).toBeLessThanOrEqual(tolerance);
    },
  );
});

// === 8. Inline <style> in index.html stays under 1 KB =================

describe('Story 1.7 defense — inline <style> FOUC shim in index.html is ≤ 1 KB', () => {
  it('inline <style> block byte size ≤ 1024 (AC2 ceiling)', () => {
    const html = readFileSync(indexHtmlPath, 'utf-8');
    const m = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(m, 'No inline <style> block found in index.html').not.toBeNull();
    const inline = m![1];
    const bytes = Buffer.byteLength(inline, 'utf8');
    expect(
      bytes,
      `Inline <style> block = ${bytes} bytes (AC2 budget = 1024). ` +
        `Move non-critical rules to web/src/styles/ — the inline block is the FOUC shim only.`,
    ).toBeLessThanOrEqual(1024);
  });
});

// === 9. BaseElement default styles reference the foundational tokens ==

describe('Story 1.7 defense — BaseElement default Shadow DOM styles wire the foundational tokens', () => {
  it('BaseElement.styles references --v-color-fg AND --v-font-sans (token-inheritance contract)', async () => {
    const { BaseElement } = await import('../src/components/base-element');
    const text = String(
      (BaseElement.styles as { cssText?: string }).cssText ?? '',
    );
    expect(
      text,
      'BaseElement.styles must reference var(--v-color-fg) so Shadow DOM children inherit the foreground color.',
    ).toContain('var(--v-color-fg)');
    expect(
      text,
      'BaseElement.styles must reference var(--v-font-sans) so Shadow DOM children adopt the sans family.',
    ).toContain('var(--v-font-sans)');
  });
});

// === 10. <v-version> renders the actual package.json version ==========

describe('Story 1.7 defense — <v-version> renders the version from package.json', () => {
  it('shadow root text contains the package.json version string', async () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      version: string;
    };
    expect(pkg.version, 'web/package.json missing a "version" field').toBeTypeOf(
      'string',
    );
    // Importing the module registers the element via customElements.define.
    const mod = await import('../src/components/v-version');
    expect(customElements.get('v-version')).toBe(mod.VVersion);
    const el = document.createElement('v-version') as InstanceType<typeof mod.VVersion>;
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.shadowRoot?.textContent ?? '';
    expect(
      text,
      `<v-version> rendered "${text}"; expected to contain "${pkg.version}". ` +
        `Refactor of the package.json import path silently broke the version display?`,
    ).toContain(pkg.version);
    document.body.removeChild(el);
  });
});

// === 11. No Lit decorator usage (esbuild/Vite gap tripwire) ===========

describe('Story 1.7 defense — no @customElement decorator usage (Vite/esbuild gap)', () => {
  const srcFiles = walk(resolve(webRoot, 'src'), (n) => n.endsWith('.ts'));

  it('zero matches for @customElement( across web/src/', () => {
    const offenders: string[] = [];
    for (const f of srcFiles) {
      const content = readFileSync(f, 'utf-8');
      if (/@customElement\s*\(/.test(content)) {
        offenders.push(f);
      }
    }
    expect(
      offenders,
      `Lit @customElement decorator used in: ${offenders.join(', ')}. ` +
        `Vite/vitest's esbuild transformer does not yet emit the TC39 decorator runtime ` +
        `that Lit's decorators require. Register components via customElements.define() instead. ` +
        `Retire this test once the transformer catches up.`,
    ).toEqual([]);
  });
});

// === 12. Source breakpoints use the canonical max-width/min-width form ==

describe('Story 1.7 defense — source breakpoints.css uses max-width/min-width form (not MQL4 width<=)', () => {
  it('breakpoints.css has zero Media Queries Level 4 range-form queries in source', () => {
    const content = stripCssComments(readFileSync(breakpointsCssPath, 'utf-8'));
    // MQL4 range form examples: (width <= 767px), (width < 767px), (767px < width <= 1023px).
    // Detect any <, <=, >, or >= comparator inside an @media (...) clause.
    const MQL4_FORM = /@media\s*\([^)]*(?:<=|>=|<\s|>\s|\s<|\s>)/;
    expect(
      MQL4_FORM.test(content),
      `breakpoints.css uses MQL4 range form. Source must read as ` +
        `\`@media (max-width: 767px)\` etc.; Vite's CSS minifier rewrites to ` +
        `the MQL4 form in dist (that's fine), but source readability matters.`,
    ).toBe(false);
    // Sanity: the three canonical forms are actually present in the source.
    expect(content).toMatch(/@media\s*\(\s*max-width\s*:\s*767px\s*\)/);
    expect(content).toMatch(/@media\s*\(\s*max-width\s*:\s*1023px\s*\)/);
    expect(content).toMatch(/@media\s*\(\s*min-width\s*:\s*1920px\s*\)/);
  });
});

// === 13. breakpoints.ts mirrors breakpoints.css exactly ===============

describe('Story 1.7 defense — breakpoints.ts constants mirror breakpoints.css pixel values', () => {
  it('the three TS constants equal the three CSS pixel widths', async () => {
    const css = stripCssComments(readFileSync(breakpointsCssPath, 'utf-8'));
    // Extract the three pixel values from the CSS source.
    const mobilePx = css.match(/@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)/);
    const tabletPx = css.match(
      /@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)[\s\S]*?@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)/,
    );
    const widePx = css.match(/@media\s*\(\s*min-width\s*:\s*(\d+)px\s*\)/);
    expect(mobilePx, 'mobile @media not found in breakpoints.css').not.toBeNull();
    expect(tabletPx, 'tablet @media not found in breakpoints.css').not.toBeNull();
    expect(widePx, 'wide @media not found in breakpoints.css').not.toBeNull();
    const mobile = parseInt(mobilePx![1], 10);
    const tablet = parseInt(tabletPx![2], 10);
    const wide = parseInt(widePx![1], 10);

    const mod = await import('../src/styles/breakpoints');
    expect(
      mod.BREAKPOINTS.mobile,
      'BREAKPOINTS.mobile must equal the CSS mobile breakpoint',
    ).toBe(mobile);
    expect(
      mod.BREAKPOINTS.tablet,
      'BREAKPOINTS.tablet must equal the CSS tablet breakpoint',
    ).toBe(tablet);
    expect(
      mod.BREAKPOINTS.wide,
      'BREAKPOINTS.wide must equal the CSS wide breakpoint',
    ).toBe(wide);

    // And the matchMedia query strings should literally match the CSS forms.
    expect(mod.BREAKPOINT_QUERIES.mobile).toBe(`(max-width: ${mobile}px)`);
    expect(mod.BREAKPOINT_QUERIES.tablet).toBe(`(max-width: ${tablet}px)`);
    expect(mod.BREAKPOINT_QUERIES.wide).toBe(`(min-width: ${wide}px)`);
  });

  it('tokens.css --v-bp-* values mirror the same pixel widths', async () => {
    const tokens = stripCssComments(readFileSync(tokensCssPath, 'utf-8'));
    const mod = await import('../src/styles/breakpoints');
    expect(tokens).toMatch(
      new RegExp(`--v-bp-mobile\\s*:\\s*${mod.BREAKPOINTS.mobile}px`),
    );
    expect(tokens).toMatch(
      new RegExp(`--v-bp-tablet\\s*:\\s*${mod.BREAKPOINTS.tablet}px`),
    );
    expect(tokens).toMatch(
      new RegExp(`--v-bp-wide\\s*:\\s*${mod.BREAKPOINTS.wide}px`),
    );
  });
});

// === 14. No new no-PII matches in package-lock.json (defense-in-depth) =

describe('Story 1.7 defense — Story 1.1 forbidden-substring grep is still clean against package-lock.json', () => {
  // Mirrors Story 1.1's forbidden-substring set. The dev's Lit + happy-dom
  // additions must not introduce new analytics-adjacent transitive deps.
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

  // Re-declare the Story 1.1 documented exceptions so we don't double-flag
  // them here. If Story 1.1's exception set grows, this test stays correct
  // as long as the markers match.
  const DOCUMENTED_EXCEPTION_MARKERS: { pattern: string; marker: string }[] = [
    {
      pattern: 'gtag',
      marker:
        'sha512-xJBAbDifo5hpffDBuHl0Y8ywswbiAp/Wi7Y/GtAgSlZyIABppyurxVueOPE8LUQOxdlgi6Zqce7uoEpqNTeiUw',
    },
    {
      pattern: 'telemetry',
      marker: '"@opentelemetry/api"',
    },
  ];

  const lock = readFileSync(packageLockPath, 'utf-8');
  const lines = lock.split(/\r?\n/);

  it.each(FORBIDDEN_SUBSTRINGS)(
    'package-lock.json carries no undocumented matches for "%s"',
    (pattern) => {
      const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const undocumented: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!re.test(line)) continue;
        const isDocumented = DOCUMENTED_EXCEPTION_MARKERS.some(
          (ex) => ex.pattern === pattern && line.includes(ex.marker),
        );
        if (!isDocumented) {
          undocumented.push(`${i + 1}: ${line.trim().slice(0, 200)}`);
        }
      }
      expect(
        undocumented,
        `New matches for "${pattern}" in web/package-lock.json after the Lit + happy-dom additions:\n` +
          undocumented.join('\n') +
          `\nIf legitimate, add an entry to no-pii-grep.test.ts DOCUMENTED_EXCEPTIONS and capture an ADR.`,
      ).toEqual([]);
    },
  );
});

// === 15. tokens.css contains no parallel light-theme namespaces =======
// (Belt-and-suspenders for #1: catches not just `--v-` violations but also
//  the specific defaults Vite scaffolds — --text, --bg, --color — that the
//  dev had to delete the scaffold sheet to keep out.)

describe('Story 1.7 defense — Vite scaffold token names are absent from styles/', () => {
  const SCAFFOLD_NAMES = ['--text:', '--bg:', '--color:', '--font-mono:', '--font-sans:'];
  const cssFiles = walk(stylesDir, (n) => n.endsWith('.css'));

  it.each(SCAFFOLD_NAMES)('no Vite scaffold token "%s" appears anywhere in styles/', (name) => {
    const offenders: string[] = [];
    for (const f of cssFiles) {
      const content = stripCssComments(readFileSync(f, 'utf-8'));
      if (content.includes(name)) {
        offenders.push(f);
      }
    }
    expect(
      offenders,
      `Vite scaffold token ${name} found in ${offenders.join(', ')}. ` +
        `tokens.css owns the namespace; the scaffold sheet was deleted for this exact reason.`,
    ).toEqual([]);
  });
});
