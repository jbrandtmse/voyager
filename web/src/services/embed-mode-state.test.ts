// @vitest-environment happy-dom
/**
 * Story 2.5 AC1 — EmbedModeState strict-boolean parse + immutability.
 *
 * NFR-S7 explicitly requires `?embed=true` literal lowercase `true` only.
 * Any other value (including `1`, `yes`, `TRUE`, `on`, empty, missing)
 * silently resolves to `enabled: false`.
 */
import { describe, it, expect } from 'vitest';

import { parseEmbedParam, EmbedModeState } from './embed-mode-state';

describe('Story 2.5 AC1 — parseEmbedParam strict-boolean', () => {
  it('returns true for the literal "?embed=true"', () => {
    expect(parseEmbedParam('?embed=true')).toBe(true);
  });

  it('returns true when ?embed=true coexists with other params', () => {
    expect(parseEmbedParam('?t=1989-08-25T09:23:00Z&embed=true')).toBe(true);
    expect(parseEmbedParam('?embed=true&t=1989-08-25T09:23:00Z')).toBe(true);
  });

  it('rejects uppercase `TRUE`', () => {
    expect(parseEmbedParam('?embed=TRUE')).toBe(false);
  });

  it('rejects title-case `True`', () => {
    expect(parseEmbedParam('?embed=True')).toBe(false);
  });

  it('rejects numeric `1`', () => {
    expect(parseEmbedParam('?embed=1')).toBe(false);
  });

  it('rejects `yes`', () => {
    expect(parseEmbedParam('?embed=yes')).toBe(false);
  });

  it('rejects `on`', () => {
    expect(parseEmbedParam('?embed=on')).toBe(false);
  });

  it('rejects the empty value `?embed=`', () => {
    expect(parseEmbedParam('?embed=')).toBe(false);
  });

  it('rejects a missing `embed` param', () => {
    expect(parseEmbedParam('')).toBe(false);
    expect(parseEmbedParam('?t=1989-08-25T09:23:00Z')).toBe(false);
  });

  it('rejects leading/trailing whitespace around true', () => {
    expect(parseEmbedParam('?embed= true')).toBe(false);
    expect(parseEmbedParam('?embed=true ')).toBe(false);
  });

  it('rejects `false` (and any other arbitrary string)', () => {
    expect(parseEmbedParam('?embed=false')).toBe(false);
    expect(parseEmbedParam('?embed=foo')).toBe(false);
  });
});

describe('Story 2.5 AC1 — EmbedModeState immutability', () => {
  it('exposes enabled via a read-only getter', () => {
    const state = new EmbedModeState(true);
    expect(state.enabled).toBe(true);
  });

  it('has no public setter for enabled (immutable session state)', () => {
    const state = new EmbedModeState(true);
    // Trying to assign should not change the value. In strict-mode TS,
    // assigning to a getter-only property is a compile error; at runtime
    // we verify the value is unchanged.
    const before = state.enabled;
    try {
      (state as unknown as { enabled: boolean }).enabled = !before;
    } catch {
      // Some engines throw in strict mode on a getter-only assignment;
      // others silently no-op. Either is acceptable — what we pin is
      // that the visible value does not change.
    }
    expect(state.enabled).toBe(before);
  });

  it('fromSearch builds an instance with enabled === parseEmbedParam(search)', () => {
    expect(EmbedModeState.fromSearch('?embed=true').enabled).toBe(true);
    expect(EmbedModeState.fromSearch('?embed=1').enabled).toBe(false);
    expect(EmbedModeState.fromSearch('').enabled).toBe(false);
  });
});
