/**
 * Story 5.1 AC4 + AC6 — PBD chapter copy unit tests.
 *
 * Pins (per AC4 + AC6):
 *   (a) lede is exactly "Pale Blue Dot." (with trailing period)
 *   (b) body word count is in [80, 120]
 *   (c) body contains "1990" AND each of Venus / Earth / Jupiter /
 *       Saturn / Uranus / Neptune
 *   (d) body references the turn-back act (matches /turn/i — the canonical
 *       anchor word per AC4 differentiator)
 */

import { describe, it, expect } from 'vitest';

import { PBD_COPY } from './copy';

describe('Story 5.1 AC4 — PBD copy lede pin', () => {
  it('lede is exactly "Pale Blue Dot." with trailing period (V1J pattern)', () => {
    expect(PBD_COPY.lede).toBe('Pale Blue Dot.');
  });
});

describe('Story 5.1 AC4 — PBD copy body word count in [80, 120]', () => {
  it('body prose is between 80 and 120 words inclusive', () => {
    // Same whitespace-split + empty-filter convention as the V1J test.
    // Hyphenated compounds count as a single word.
    const wordCount = PBD_COPY.body
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThanOrEqual(80);
    expect(wordCount).toBeLessThanOrEqual(120);
  });
});

describe('Story 5.1 AC4 — PBD copy mentions the canonical PBD facts', () => {
  it('mentions the 1990 anchor year (date-level sourcing per MISSION_FACTS.md)', () => {
    expect(PBD_COPY.body).toMatch(/1990/);
  });

  it('mentions Venus (target body in the family-portrait sequence)', () => {
    expect(PBD_COPY.body).toMatch(/Venus/);
  });

  it('mentions Earth (the Pale Blue Dot itself)', () => {
    expect(PBD_COPY.body).toMatch(/Earth/);
  });

  it('mentions Jupiter (target body in the family-portrait sequence)', () => {
    expect(PBD_COPY.body).toMatch(/Jupiter/);
  });

  it('mentions Saturn (target body in the family-portrait sequence)', () => {
    expect(PBD_COPY.body).toMatch(/Saturn/);
  });

  it('mentions Uranus (target body in the family-portrait sequence)', () => {
    expect(PBD_COPY.body).toMatch(/Uranus/);
  });

  it('mentions Neptune (target body in the family-portrait sequence)', () => {
    expect(PBD_COPY.body).toMatch(/Neptune/);
  });
});

describe('Story 5.1 AC4 — PBD copy references the turn-back act', () => {
  it('body matches /turn/i (the canonical anchor word per the PRD J1 differentiator)', () => {
    // The PRD J1 differentiator says the user "noticed the camera being
    // aimed at it" — the editorial copy MUST reference the turn-back act.
    // The substring check is intentionally loose so future editorial
    // tuning (e.g. "turning back", "the turn-back maneuver") still passes
    // without re-asserting on a specific phrase.
    expect(PBD_COPY.body).toMatch(/turn/i);
  });
});

describe('Story 5.2 AC6 — PBD copy acknowledges reconstruction posture', () => {
  it('body matches /reconstruct/i (mixed-coverage honesty per the Story 5.2 Rule 5 amendment)', () => {
    // Story 5.2 AC6 (Option B) — the chapter copy carries the
    // mixed-coverage caveat (bus = CK, platform = synthesized aim) since
    // the indicator is intentionally left as-is. The substring check is
    // loose so future tuning ("reconstructs", "reconstruction") still
    // passes.
    expect(PBD_COPY.body).toMatch(/reconstruct/i);
  });
});

describe('Story 5.1 AC4 — PBD copy is frozen', () => {
  it('PBD_COPY is frozen (mutation throws in strict mode)', () => {
    expect(Object.isFrozen(PBD_COPY)).toBe(true);
  });
});
