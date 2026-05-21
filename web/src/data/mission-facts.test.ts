import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  INSTRUMENT_SHUTOFF_DATES,
  LAUNCH_DATES,
  ENCOUNTER_DATES,
  HELIOPAUSE_DATES,
  INSTRUMENTS_IN_ORDER,
  PBD_DATE,
  SPACECRAFT_IN_ORDER,
  isShutOffAt,
  getShutoffEt,
} from './mission-facts';
import { etFromIso } from '../math/et-conversions';

// Story 2.9 R4-style parity test: every UTC date string in mission-facts.ts
// MUST appear verbatim in MISSION_FACTS.md. Failures here mean someone edited
// one surface and forgot the other — the canonical-source contract is broken.
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const MISSION_FACTS_PATH = resolve(REPO_ROOT, 'MISSION_FACTS.md');

const stripTime = (iso: string): string => iso.slice(0, 10);

describe('Story 2.9 AC2 — MISSION_FACTS.md parity', () => {
  const doc = readFileSync(MISSION_FACTS_PATH, 'utf8');

  it('MISSION_FACTS.md exists at repo root', () => {
    expect(doc.length).toBeGreaterThan(0);
  });

  it('launch dates appear verbatim in MISSION_FACTS.md', () => {
    expect(doc).toContain(LAUNCH_DATES.V1);
    expect(doc).toContain(LAUNCH_DATES.V2);
  });

  it('encounter closest-approach instants appear verbatim in MISSION_FACTS.md', () => {
    for (const enc of ENCOUNTER_DATES) {
      expect(doc).toContain(enc.utc);
    }
  });

  it('heliopause crossing dates (date-level) appear in MISSION_FACTS.md', () => {
    // Heliopause is date-level sourcing — the doc renders these as
    // `2012-08-25` / `2018-11-05` without the T00:00:00Z component.
    expect(doc).toContain(stripTime(HELIOPAUSE_DATES.V1));
    expect(doc).toContain(stripTime(HELIOPAUSE_DATES.V2));
  });

  it('instrument shutoff dates appear in MISSION_FACTS.md (date-level)', () => {
    for (const sc of SPACECRAFT_IN_ORDER) {
      for (const inst of INSTRUMENTS_IN_ORDER) {
        const dateOnly = stripTime(INSTRUMENT_SHUTOFF_DATES[sc][inst]);
        expect(doc).toContain(dateOnly);
      }
    }
  });

  it('all four tracked instruments are mentioned in the doc', () => {
    for (const inst of INSTRUMENTS_IN_ORDER) {
      expect(doc).toContain(inst);
    }
  });

  it('the doc declares ADR-0021 as the chapter-copy authoring contract', () => {
    expect(doc).toContain('ADR-0021');
  });

  // Story 3.1 AC7 (QA gap-fill): PBD_DATE was added to mission-facts.ts by
  // Story 3.1 as part of the closest-approach-anchor source-of-truth work.
  // The pre-Story-3.1 parity test loop didn't reach it because PBD_DATE is a
  // standalone exported constant (not in ENCOUNTER_DATES). This test closes
  // the parity gap so a future edit that "fixes" PBD_DATE without updating
  // MISSION_FACTS.md fails immediately (voyager-skill-rules.md Rule 5).
  it('Pale Blue Dot date (PBD_DATE) appears verbatim in MISSION_FACTS.md', () => {
    expect(doc).toContain(PBD_DATE);
  });
});

describe('Story 2.9 AC2 — instrument-shutoff lookup API', () => {
  it('exposes four instruments in canonical order', () => {
    expect([...INSTRUMENTS_IN_ORDER]).toEqual(['ISS', 'UVS', 'PLS', 'LECP']);
  });

  it('exposes V1 then V2 as the spacecraft order', () => {
    expect([...SPACECRAFT_IN_ORDER]).toEqual(['V1', 'V2']);
  });

  it('getShutoffEt returns a finite ET matching the ISO string', () => {
    for (const sc of SPACECRAFT_IN_ORDER) {
      for (const inst of INSTRUMENTS_IN_ORDER) {
        const et = getShutoffEt(sc, inst);
        expect(Number.isFinite(et)).toBe(true);
        expect(et).toBe(etFromIso(INSTRUMENT_SHUTOFF_DATES[sc][inst]));
      }
    }
  });

  it('isShutOffAt is false before the shutoff ET, true at-and-after', () => {
    const et = getShutoffEt('V1', 'PLS');
    expect(isShutOffAt('V1', 'PLS', et - 1)).toBe(false);
    expect(isShutOffAt('V1', 'PLS', et)).toBe(true);
    expect(isShutOffAt('V1', 'PLS', et + 1)).toBe(true);
  });

  it('V1 PLS shut off before V2 PLS (V1 failed early, V2 was the last operating plasma)', () => {
    expect(getShutoffEt('V1', 'PLS')).toBeLessThan(getShutoffEt('V2', 'PLS'));
  });

  it('LAUNCH_DATES values are frozen', () => {
    expect(Object.isFrozen(LAUNCH_DATES)).toBe(true);
  });

  it('HELIOPAUSE_DATES values are frozen', () => {
    expect(Object.isFrozen(HELIOPAUSE_DATES)).toBe(true);
  });

  it('INSTRUMENT_SHUTOFF_DATES root + nested records are frozen', () => {
    expect(Object.isFrozen(INSTRUMENT_SHUTOFF_DATES)).toBe(true);
    expect(Object.isFrozen(INSTRUMENT_SHUTOFF_DATES.V1)).toBe(true);
    expect(Object.isFrozen(INSTRUMENT_SHUTOFF_DATES.V2)).toBe(true);
  });
});

describe('Story 2.9 AC2 — cross-spec consistency', () => {
  // The chapter specs at web/src/chapters/specs/*.ts pin the same launch
  // dates / encounter instants / heliopause anchors as MISSION_FACTS.md;
  // the parity test above verifies the doc-side, this block verifies the
  // ts-mirror side matches the canonical anchors the FSM operates on.

  it('V1 launch instant matches launch-v1 chapter anchor', async () => {
    const launchV1 = (await import('../chapters/specs/launch-v1')).default;
    expect(launchV1.anchorEt).toBe(etFromIso(LAUNCH_DATES.V1));
  });

  it('V2 launch instant matches launch-v2 chapter anchor', async () => {
    const launchV2 = (await import('../chapters/specs/launch-v2')).default;
    expect(launchV2.anchorEt).toBe(etFromIso(LAUNCH_DATES.V2));
  });

  it('V1 heliopause anchor matches HELIOPAUSE_DATES.V1', async () => {
    const v1h = (await import('../chapters/specs/v1-heliopause')).default;
    expect(v1h.anchorEt).toBe(etFromIso(HELIOPAUSE_DATES.V1));
  });

  it('V2 heliopause anchor matches HELIOPAUSE_DATES.V2', async () => {
    const v2h = (await import('../chapters/specs/v2-heliopause')).default;
    expect(v2h.anchorEt).toBe(etFromIso(HELIOPAUSE_DATES.V2));
  });

  it('every encounter date has a corresponding chapter anchor', async () => {
    const { ALL_CHAPTERS } = await import('../chapters/registry');
    for (const enc of ENCOUNTER_DATES) {
      const expectedEt = etFromIso(enc.utc);
      const match = ALL_CHAPTERS.find((c) => c.anchorEt === expectedEt);
      expect(
        match,
        `encounter ${enc.spacecraft} ${enc.body} (${enc.utc}) should map to a chapter`,
      ).toBeDefined();
    }
  });
});
