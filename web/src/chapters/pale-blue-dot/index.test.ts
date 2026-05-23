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

describe('Story 5.2 AC3 — PaleBlueDot.getPlatformQuatOverride', () => {
  // Build the module with deterministic wall-clock + reduced-motion-off so
  // the SLERP timeline is independent of real time.
  const buildModule = (): PaleBlueDot => {
    let wallClockMs = 1000;
    const mod = new PaleBlueDot({
      reducedMotion: () => false,
      wallClock: () => wallClockMs,
    });
    // Stub services. Ephemeris returns V1 + Earth + Venus + Neptune
    // canned positions; AttitudeService returns identity bus quat.
    const ephem = {
      getPosition: (_et: number, bodyId: number): Float64Array | null => {
        if (bodyId === -31) return new Float64Array([1e9, 0, 0]);     // V1
        if (bodyId === 2) return new Float64Array([1.5e8, 0, 0]);     // Venus
        if (bodyId === 3) return new Float64Array([0, 0, 0]);         // Earth (origin)
        if (bodyId === 5) return new Float64Array([1e9, 5e8, 0]);     // Jupiter
        if (bodyId === 6) return new Float64Array([1e9, -5e8, 0]);    // Saturn
        if (bodyId === 7) return new Float64Array([2e9, 0, 0]);       // Uranus
        if (bodyId === 8) return new Float64Array([3e9, 0, 0]);       // Neptune
        return null;
      },
    } as unknown as Parameters<typeof mod.setServices>[0];
    const attitude = {
      getBusQuat: (_naif: number, _et: number) => ({ x: 0, y: 0, z: 0, w: 1 }),
    } as unknown as Parameters<typeof mod.setServices>[1];
    mod.setServices(ephem, attitude);
    return mod;
  };

  it('returns null for V2 (-32) — PBD only acts on V1', () => {
    const m = buildModule();
    m.update(PBD_ANCHOR_ET + 30); // sweeping_venus
    expect(m.getPlatformQuatOverride(-32, PBD_ANCHOR_ET + 30)).toBe(null);
  });

  it('returns null before any update() (no active substate)', () => {
    const m = buildModule();
    expect(m.getPlatformQuatOverride(-31, PBD_ANCHOR_ET)).toBe(null);
  });

  it('returns null during the idle substate', () => {
    const m = buildModule();
    m.update(PBD_ANCHOR_ET - 1); // idle
    expect(m.getPlatformQuatOverride(-31, PBD_ANCHOR_ET - 1)).toBe(null);
  });

  it('returns null during the turning substate (bus-only motion, no per-target aim yet)', () => {
    const m = buildModule();
    m.update(PBD_ANCHOR_ET + 15); // turning peak
    expect(m.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 15)).toBe(null);
  });

  it('returns null during composite_active / composite_decay / passed substates', () => {
    const m = buildModule();
    // composite_active peak — repositioned to +75s by Story 5.3 Rule-5
    // amendment (now the Earth-plate hold AFTER sweeping_earth).
    m.update(PBD_ANCHOR_ET + 75); // composite_active peak (amended)
    expect(m.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 75)).toBe(null);

    m.update(PBD_ANCHOR_ET + 165); // composite_decay peak
    expect(m.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 165)).toBe(null);

    m.update(PBD_ANCHOR_ET + 200); // passed
    expect(m.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 200)).toBe(null);
  });

  it('returns a non-null quaternion during sweeping_venus', () => {
    const m = buildModule();
    m.update(PBD_ANCHOR_ET + 37.5); // sweeping_venus peak
    const q = m.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 37.5);
    expect(q).not.toBe(null);
    const norm = Math.sqrt(q!.x * q!.x + q!.y * q!.y + q!.z * q!.z + q!.w * q!.w);
    expect(norm).toBeCloseTo(1, 6);
  });

  it('returns a non-null quaternion during each of the six sweeping substates', () => {
    const m = buildModule();
    // Peak offsets after Story 5.3 Rule-5 amendment:
    //   sweeping_venus    = 37.5
    //   sweeping_earth    = 52.5
    //   sweeping_jupiter  = 97.5
    //   sweeping_saturn   = 112.5
    //   sweeping_uranus   = 127.5
    //   sweeping_neptune  = 142.5
    const peaks = [37.5, 52.5, 97.5, 112.5, 127.5, 142.5];
    for (const peak of peaks) {
      m.update(PBD_ANCHOR_ET + peak);
      const q = m.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + peak);
      expect(q).not.toBe(null);
    }
  });

  it('updates currentTargetNaifId in sync with the substate', () => {
    const m = buildModule();
    m.update(PBD_ANCHOR_ET + 30); // enter sweeping_venus
    expect(m.currentTargetNaifId).toBe(2);

    m.update(PBD_ANCHOR_ET + 45); // sweeping_earth
    expect(m.currentTargetNaifId).toBe(3);

    // Story 5.3 Rule-5 amendment: sweeping_saturn now starts at +105.
    m.update(PBD_ANCHOR_ET + 105); // sweeping_saturn
    expect(m.currentTargetNaifId).toBe(6);

    m.update(PBD_ANCHOR_ET + 200); // passed
    expect(m.currentTargetNaifId).toBe(null);
  });

  it('exposes currentPlatformOverrideQuat for the DEV accessor', () => {
    const m = buildModule();
    m.update(PBD_ANCHOR_ET + 37.5);
    // Trigger a tick by calling the override (which calls choreography.tick).
    const out = m.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 37.5);
    expect(out).not.toBe(null);
    const dev = m.currentPlatformOverrideQuat;
    expect(dev).not.toBe(null);
    expect(dev!.x).toBeCloseTo(out!.x, 12);
    expect(dev!.w).toBeCloseTo(out!.w, 12);
  });

  it('returns null if services are not wired (boot-time before manifest)', () => {
    const m = new PaleBlueDot({
      reducedMotion: () => false,
      wallClock: () => 1000,
    });
    // No setServices() call — services remain null.
    m.update(PBD_ANCHOR_ET + 37.5);
    expect(m.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 37.5)).toBe(null);
  });

  it('dispose() resets choreography (subsequent override calls return null)', () => {
    const m = buildModule();
    m.update(PBD_ANCHOR_ET + 37.5);
    expect(m.getPlatformQuatOverride(-31, PBD_ANCHOR_ET + 37.5)).not.toBe(null);

    m.dispose();
    expect(m.currentTargetNaifId).toBe(null);
    // After dispose, the choreography is reset; the module's currentSubstate
    // remains the last value but the override (which reads choreography
    // state) returns null.
    expect(m.currentPlatformOverrideQuat).toBe(null);
  });
});
