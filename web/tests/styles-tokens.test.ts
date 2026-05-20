import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Story 1.7 AC1 — tokens.css is the single source of truth. Parse the
// file as text and assert every token name from the AC1 enumeration is
// present. Literal substring matches catch typos like `--v-color-fb`.

const tokensCss = readFileSync(
  resolve(__dirname, '..', 'src', 'styles', 'tokens.css'),
  'utf-8',
);

const REQUIRED_TOKEN_NAMES = [
  // Colors
  '--v-color-bg',
  '--v-color-fg',
  '--v-color-fg-muted',
  '--v-color-fg-quiet',
  '--v-color-accent',
  '--v-color-accent-quiet',
  '--v-color-trajectory-past',
  '--v-color-trajectory-future',
  '--v-color-ck',
  '--v-color-synth',
  '--v-color-focus',
  '--v-color-overlay-scrim',
  '--v-color-divider',
  // Typography families
  '--v-font-mono',
  '--v-font-sans',
  '--v-font-serif',
  // Typography size scale
  '--v-font-size-body',
  '--v-font-size-hud',
  '--v-size-hud-mono',
  '--v-size-hud-mono-sm',
  '--v-font-size-chapter-title',
  '--v-font-size-chapter-copy',
  '--v-font-size-caption',
  // Spacing
  '--v-space-1',
  '--v-space-2',
  '--v-space-3',
  '--v-space-4',
  '--v-space-6',
  '--v-space-8',
  '--v-space-12',
  '--v-space-16',
  '--v-edge-margin',
  // Motion
  '--v-duration-fast',
  '--v-duration-base',
  '--v-duration-slow',
  '--v-ease-out',
  '--v-ease-in-out',
  // Z-index
  '--v-z-canvas',
  '--v-z-hud',
  '--v-z-scrubber',
  '--v-z-overlay',
  '--v-z-modal',
  '--v-z-tooltip',
];

// Exact color values from AC1 must round-trip. Substring match on the
// "<token>:<value>" form is tight enough to catch swapped channels.
const EXACT_COLOR_VALUES: Record<string, string> = {
  '--v-color-bg': '#0a0e14',
  '--v-color-fg': '#e8eaed',
  '--v-color-fg-muted': '#9aa0a6',
  '--v-color-fg-quiet': '#5f6368',
  '--v-color-accent': '#d4a017',
  '--v-color-accent-quiet': '#8a6a0e',
  '--v-color-trajectory-past': '#e8eaed',
  '--v-color-trajectory-future': '#5f6368',
  '--v-color-ck': '#4a7c4e',
  '--v-color-synth': '#d4a017',
  '--v-color-focus': '#6b8cae',
  '--v-color-divider': '#1f2530',
};

describe('Story 1.7 AC1 — tokens.css contains required token names', () => {
  it.each(REQUIRED_TOKEN_NAMES)('declares %s', (name) => {
    expect(
      tokensCss,
      `Token "${name}" missing from web/src/styles/tokens.css. ` +
        `All design tokens MUST be defined at :root per AC1.`,
    ).toContain(name);
  });

  it('declares tokens inside a :root { ... } block', () => {
    expect(tokensCss).toMatch(/:root\s*\{/);
  });

  it.each(Object.entries(EXACT_COLOR_VALUES))(
    'color token %s carries the exact AC1 value %s',
    (token, value) => {
      // Match "  --v-color-bg: #0a0e14;" with whitespace tolerance.
      const re = new RegExp(`${token.replace(/[-]/g, '-')}\\s*:\\s*${value.replace(/#/g, '#')}\\s*;`);
      expect(
        re.test(tokensCss),
        `Token ${token} must resolve to exactly ${value}. ` +
          `The full file is the canonical source — UX spec §Design Tokens.`,
      ).toBe(true);
    },
  );

  it('declares --v-color-overlay-scrim as a semi-transparent rgba', () => {
    expect(tokensCss).toMatch(
      /--v-color-overlay-scrim\s*:\s*rgba\s*\(\s*10\s*,\s*14\s*,\s*20\s*,\s*0\.85\s*\)/,
    );
  });

  it('declares all three duration tokens with ms units', () => {
    expect(tokensCss).toMatch(/--v-duration-fast\s*:\s*120ms/);
    expect(tokensCss).toMatch(/--v-duration-base\s*:\s*200ms/);
    expect(tokensCss).toMatch(/--v-duration-slow\s*:\s*400ms/);
  });

  it('declares the six z-index levels with the documented integer values', () => {
    expect(tokensCss).toMatch(/--v-z-canvas\s*:\s*0\b/);
    expect(tokensCss).toMatch(/--v-z-hud\s*:\s*10\b/);
    expect(tokensCss).toMatch(/--v-z-scrubber\s*:\s*20\b/);
    expect(tokensCss).toMatch(/--v-z-overlay\s*:\s*30\b/);
    expect(tokensCss).toMatch(/--v-z-modal\s*:\s*40\b/);
    expect(tokensCss).toMatch(/--v-z-tooltip\s*:\s*50\b/);
  });

  it('self-hosted primaries appear in the font-family declarations', () => {
    expect(tokensCss).toMatch(/--v-font-mono\s*:\s*'JetBrains Mono'/);
    expect(tokensCss).toMatch(/--v-font-sans\s*:\s*'Inter'/);
    expect(tokensCss).toMatch(/--v-font-serif\s*:\s*'Source Serif 4'/);
  });

  it('--v-font-size-body uses clamp() with a 16 px floor', () => {
    expect(tokensCss).toMatch(/--v-font-size-body\s*:\s*clamp\(\s*16px/);
  });

  it('--v-edge-margin uses clamp() with viewport units', () => {
    expect(tokensCss).toMatch(/--v-edge-margin\s*:\s*clamp\([^)]*vw/);
  });
});
