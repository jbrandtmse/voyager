import { describe, it, expect } from 'vitest';

import {
  V1_HELIOPAUSE_COPY,
  V2_HELIOPAUSE_COPY,
  heliopauseCopyForSlug,
} from './heliopause-copy';

const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter((w) => w.length > 0).length;

describe('Story 2.9 AC1 — heliopause copy structure', () => {
  it('V1 copy has the expected lede', () => {
    expect(V1_HELIOPAUSE_COPY.lede).toBe('V1 heliopause.');
  });

  it('V2 copy has the expected lede', () => {
    expect(V2_HELIOPAUSE_COPY.lede).toBe('V2 heliopause.');
  });

  it('V1 copy has one or more body paragraphs', () => {
    expect(V1_HELIOPAUSE_COPY.paragraphs.length).toBeGreaterThanOrEqual(1);
  });

  it('V2 copy has one or more body paragraphs', () => {
    expect(V2_HELIOPAUSE_COPY.paragraphs.length).toBeGreaterThanOrEqual(1);
  });

  it('V1 body is between 80 and 200 words (≈80–120 target with slack)', () => {
    const total = V1_HELIOPAUSE_COPY.paragraphs.reduce(
      (n, p) => n + countWords(p),
      0,
    );
    expect(total).toBeGreaterThanOrEqual(80);
    expect(total).toBeLessThanOrEqual(200);
  });

  it('V2 body is between 80 and 200 words', () => {
    const total = V2_HELIOPAUSE_COPY.paragraphs.reduce(
      (n, p) => n + countWords(p),
      0,
    );
    expect(total).toBeGreaterThanOrEqual(80);
    expect(total).toBeLessThanOrEqual(200);
  });

  it('V1 copy mentions the heliopause crossing date in editorial form', () => {
    const joined = V1_HELIOPAUSE_COPY.paragraphs.join(' ');
    expect(joined).toContain('25 August 2012');
  });

  it('V2 copy mentions the heliopause crossing date in editorial form', () => {
    const joined = V2_HELIOPAUSE_COPY.paragraphs.join(' ');
    expect(joined).toContain('5 November 2018');
  });

  it('V1 copy mentions cosmic-ray + plasma signatures (per AC1 requirement)', () => {
    const joined = V1_HELIOPAUSE_COPY.paragraphs.join(' ').toLowerCase();
    expect(joined).toMatch(/cosmic[- ]ray/);
    // Either "solar wind drops" / "plasma" — AC1 calls for "solar-wind drop"
    // or equivalent plasma-density signature.
    expect(joined).toMatch(/(solar wind|plasma)/);
  });

  it('V2 copy mentions plasma + magnetic-field signatures', () => {
    const joined = V2_HELIOPAUSE_COPY.paragraphs.join(' ').toLowerCase();
    expect(joined).toMatch(/plasma|solar wind/);
    expect(joined).toMatch(/magnetic field|cosmic[- ]ray/);
  });

  it('paragraphs arrays are frozen', () => {
    expect(Object.isFrozen(V1_HELIOPAUSE_COPY)).toBe(true);
    expect(Object.isFrozen(V1_HELIOPAUSE_COPY.paragraphs)).toBe(true);
    expect(Object.isFrozen(V2_HELIOPAUSE_COPY)).toBe(true);
    expect(Object.isFrozen(V2_HELIOPAUSE_COPY.paragraphs)).toBe(true);
  });
});

describe('Story 2.9 AC1 — heliopauseCopyForSlug lookup', () => {
  it('returns V1 copy for v1-heliopause slug', () => {
    expect(heliopauseCopyForSlug('v1-heliopause')).toBe(V1_HELIOPAUSE_COPY);
  });

  it('returns V2 copy for v2-heliopause slug', () => {
    expect(heliopauseCopyForSlug('v2-heliopause')).toBe(V2_HELIOPAUSE_COPY);
  });

  it('returns null for any other chapter slug', () => {
    expect(heliopauseCopyForSlug('launch-v1')).toBeNull();
    expect(heliopauseCopyForSlug('v1-jupiter')).toBeNull();
    expect(heliopauseCopyForSlug('pale-blue-dot')).toBeNull();
    expect(heliopauseCopyForSlug('')).toBeNull();
    expect(heliopauseCopyForSlug('unknown')).toBeNull();
  });
});
