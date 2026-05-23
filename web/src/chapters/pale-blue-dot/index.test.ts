/**
 * Story 5.1 AC1 + AC3 + AC6 — PBD module index unit tests.
 *
 * Pins (per AC6 (c)):
 *   - re-exported ChapterSpec default has slug === 'pale-blue-dot'
 *   - anchorEt === Story-2.1 placeholder (1990-02-14T00:00:00Z)
 *   - spacecraft === 'v1'
 *   - copy.lede === 'Pale Blue Dot.'
 *   - copy.body word count in [80, 120]
 *
 * AC3 pins:
 *   - PaleBlueDot class implements ChapterModule (has `spec` getter +
 *     `update(et)` method)
 *   - Module exposes `currentSubstate` accessor + `subscribe` API
 *   - `update(et)` is idempotent (repeated same-ET calls fire no
 *     listeners)
 *   - Listener fires on substate change
 */

import { describe, it, expect, vi } from 'vitest';

import { etFromIso } from '../../math/et-conversions';
import paleBlueDotSpec, {
  PBD_SPEC,
  PaleBlueDot,
  type PbdSubstateListener,
} from './index';
import { PbdSubstate, PBD_ANCHOR_ET } from './substates';

const SECONDS_PER_DAY = 86_400;

describe('Story 5.1 AC1 + AC6(c) — re-exported ChapterSpec default shape', () => {
  it('default export matches PBD_SPEC (named export parity)', () => {
    expect(paleBlueDotSpec).toBe(PBD_SPEC);
  });

  it('slug is "pale-blue-dot" (preserved from Story 2.1 placeholder)', () => {
    expect(paleBlueDotSpec.slug).toBe('pale-blue-dot');
  });

  it('name is "Pale Blue Dot" (preserved from Story 2.1 placeholder)', () => {
    expect(paleBlueDotSpec.name).toBe('Pale Blue Dot');
  });

  it('markerLabel is "PBD" (preserved from Story 2.1 placeholder)', () => {
    expect(paleBlueDotSpec.markerLabel).toBe('PBD');
  });

  it('anchorEt matches the 1990-02-14T00:00:00Z anchor', () => {
    expect(paleBlueDotSpec.anchorEt).toBe(etFromIso('1990-02-14T00:00:00Z'));
  });

  it('windowStartEt is anchor - 1 day (preserved from Story 2.1 placeholder)', () => {
    expect(paleBlueDotSpec.anchorEt - paleBlueDotSpec.windowStartEt).toBeCloseTo(
      SECONDS_PER_DAY,
      6,
    );
  });

  it('windowEndEt is anchor + 1 day (preserved from Story 2.1 placeholder)', () => {
    expect(paleBlueDotSpec.windowEndEt - paleBlueDotSpec.anchorEt).toBeCloseTo(
      SECONDS_PER_DAY,
      6,
    );
  });

  it('spacecraft is "v1" (preserved from Story 2.1 placeholder)', () => {
    expect(paleBlueDotSpec.spacecraft).toBe('v1');
  });

  it('ogDescription is a non-empty string referencing the PBD framing', () => {
    expect(paleBlueDotSpec.ogDescription.length).toBeGreaterThan(0);
    expect(paleBlueDotSpec.ogDescription).toMatch(/Pale Blue Dot/);
  });

  it('copy field is populated with the Story 5.1 editorial prose', () => {
    expect(paleBlueDotSpec.copy).toBeDefined();
    expect(paleBlueDotSpec.copy!.lede).toBe('Pale Blue Dot.');
    const wordCount = paleBlueDotSpec.copy!.body
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThanOrEqual(80);
    expect(wordCount).toBeLessThanOrEqual(120);
  });

  it('defaultFraming is undefined (PBD framing is choreographed per-substate by Story 5.2)', () => {
    expect(paleBlueDotSpec.defaultFraming).toBeUndefined();
  });

  it('targetBody is undefined (PBD stays heliocentric — no body-centered ViewFrame shift)', () => {
    expect(paleBlueDotSpec.targetBody).toBeUndefined();
  });

  it('PBD_SPEC is frozen (mutation throws in strict mode)', () => {
    expect(Object.isFrozen(PBD_SPEC)).toBe(true);
  });
});

describe('Story 5.1 AC3 — PaleBlueDot module class implements ChapterModule', () => {
  it('exposes the spec view (ChapterModule.spec)', () => {
    const m = new PaleBlueDot();
    expect(m.spec).toBe(PBD_SPEC);
  });

  it('exposes update(et) method', () => {
    const m = new PaleBlueDot();
    expect(typeof m.update).toBe('function');
  });

  it('starts in `idle` substate (pre-update default)', () => {
    const m = new PaleBlueDot();
    expect(m.currentSubstate).toBe(PbdSubstate.idle);
  });

  it('update(et) advances substate to match pbdSubstateAt(et)', () => {
    const m = new PaleBlueDot();
    m.update(PBD_ANCHOR_ET);
    expect(m.currentSubstate).toBe(PbdSubstate.turning);
  });

  it('update(et) is idempotent — same ET twice fires no listener on second call', () => {
    const m = new PaleBlueDot();
    const listener = vi.fn() satisfies PbdSubstateListener;
    m.subscribe(listener);

    m.update(PBD_ANCHOR_ET);
    expect(listener).toHaveBeenCalledTimes(1);

    m.update(PBD_ANCHOR_ET);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('listener fires on substate change (idle → turning at anchor ET)', () => {
    const m = new PaleBlueDot();
    const listener = vi.fn() satisfies PbdSubstateListener;
    m.subscribe(listener);

    m.update(PBD_ANCHOR_ET);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(
      PbdSubstate.idle,
      PbdSubstate.turning,
      PBD_ANCHOR_ET,
    );
  });

  it('listener fires on multiple transitions across the cinematic arc', () => {
    const m = new PaleBlueDot();
    const listener = vi.fn();
    m.subscribe(listener);

    // Step through idle → turning → sweeping_venus.
    m.update(PBD_ANCHOR_ET - 1); // idle → idle (no fire; no change)
    expect(listener).toHaveBeenCalledTimes(0);

    m.update(PBD_ANCHOR_ET); // idle → turning
    m.update(PBD_ANCHOR_ET + 30); // turning → sweeping_venus
    m.update(PBD_ANCHOR_ET + 45); // sweeping_venus → sweeping_earth

    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('unsubscribe stops further listener invocations', () => {
    const m = new PaleBlueDot();
    const listener = vi.fn();
    const unsub = m.subscribe(listener);

    m.update(PBD_ANCHOR_ET);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    m.update(PBD_ANCHOR_ET + 30);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('throwing listener does not silence other listeners', () => {
    const m = new PaleBlueDot();
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwing: PbdSubstateListener = () => {
      throw new Error('listener boom');
    };
    const quiet = vi.fn();
    m.subscribe(throwing);
    m.subscribe(quiet);

    m.update(PBD_ANCHOR_ET);
    expect(quiet).toHaveBeenCalledTimes(1);
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it('dispose() detaches all listeners', () => {
    const m = new PaleBlueDot();
    const listener = vi.fn();
    m.subscribe(listener);
    m.dispose();

    m.update(PBD_ANCHOR_ET);
    expect(listener).toHaveBeenCalledTimes(0);
  });

  it('non-finite ET is silently ignored (no listener fire, no state change)', () => {
    const m = new PaleBlueDot();
    const listener = vi.fn();
    m.subscribe(listener);

    m.update(Number.NaN);
    m.update(Number.POSITIVE_INFINITY);
    expect(listener).toHaveBeenCalledTimes(0);
    expect(m.currentSubstate).toBe(PbdSubstate.idle);
  });

  it('inactive-frame safe — update(et) outside PBD window is harmless', () => {
    // ETs well outside the chapter window resolve to `idle` (pre-anchor)
    // or `passed` (post-arc); calling update is safe regardless.
    const m = new PaleBlueDot();
    const listener = vi.fn();
    m.subscribe(listener);

    // 1 year before the anchor.
    m.update(PBD_ANCHOR_ET - 365 * SECONDS_PER_DAY);
    expect(m.currentSubstate).toBe(PbdSubstate.idle);

    // 1 year after the anchor — past the arc.
    m.update(PBD_ANCHOR_ET + 365 * SECONDS_PER_DAY);
    expect(m.currentSubstate).toBe(PbdSubstate.passed);
    // Exactly one transition fired (idle → passed).
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('Story 5.1 AC1 — placeholder spec re-export preserves slug semantics', () => {
  it('importing the placeholder location resolves to the same spec object', async () => {
    // Dynamic import keeps the test cheap (no static parsing required
    // to verify the re-export).
    const mod = await import('../specs/pale-blue-dot');
    expect(mod.default).toBe(PBD_SPEC);
  });
});
