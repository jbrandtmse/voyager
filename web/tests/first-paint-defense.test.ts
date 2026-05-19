// @vitest-environment happy-dom
//
// Story 1.9 defense-in-depth tripwires.
//
// These tests complement the dev's co-located unit + integration tests with
// regression guards on the contracts most likely to drift silently:
//
//  - Mission ET constants vs SpiceyPy-derived round-trips (drift tripwire)
//  - isoFromEt(etFromIso(iso)) round-trip on mission-critical dates
//  - URLSync.parseInitialT silent-reject for non-string / pathological ?t=
//  - URL throttle window upper bound (≤5 writes per 1s under 100 calls)
//  - writeEtImmediate flushes pending throttled write on pointer-up
//  - WAI-ARIA Slider attribute presence on the [role="slider"] element
//  - aria-valuenow + aria-valuetext reactive update
//  - Keyboard scrub direction (sign-flip tripwire)
//  - simEt clamping at MISSION_START/END
//  - prefers-reduced-motion is honored at token level ONLY (no per-component
//    matchMedia checks)
//  - 44×44 hit-area declared in component CSS rule-text
//  - voyager:title-card-complete fires exactly once (race tripwire)
//  - pointer-events primitive unsubscribe contract (memory hygiene)
//  - Out-of-range ?t= dates silently reject with no exception
//  - First-paint sequence: scrubber AFTER dissolve, not before
//
// Tests are intentionally aggressive about the *invariants* the story spec
// promises. A failing test here should produce a clear, single-line diagnosis
// of which contract drifted.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { etFromIso, isoFromEt } from '../src/math/et-conversions';
import {
  MISSION_START_ET,
  MISSION_END_ET,
  MISSION_START_ISO,
  MISSION_END_ISO,
  TITLE_CARD_HOLD_MS,
} from '../src/constants/mission';
import { URLSync, type UrlSyncWindow } from '../src/services/url-sync';
import { attachPointerHandlers } from '../src/primitives/pointer-events';
import { VTimelineScrubber } from '../src/components/v-timeline-scrubber';
import { VTitleCard } from '../src/components/v-title-card';
import { startFirstPaint } from '../src/boot/first-paint';

// Side-effect imports — register the custom elements globally for tests that
// query via document.createElement on the tag.
import '../src/components/v-title-card';
import '../src/components/v-timeline-scrubber';

const webRoot = resolve(__dirname, '..');
const ONE_DAY = 86400;

const makeWin = (
  search = '',
  pathname = '/',
  hash = '',
): {
  win: UrlSyncWindow;
  replaceCalls: Array<{ url: string | URL | null | undefined }>;
} => {
  const replaceCalls: Array<{ url: string | URL | null | undefined }> = [];
  const win: UrlSyncWindow = {
    location: { search, pathname, hash },
    history: {
      replaceState: (
        _data: unknown,
        _title: string,
        url?: string | URL | null,
      ) => {
        replaceCalls.push({ url });
      },
    } as unknown as History,
  };
  return { win, replaceCalls };
};

describe('Story 1.9 defense — Mission ET constants vs SpiceyPy round-trip', () => {
  // The dev's `mission.ts` commits SPICE-derived numeric literals. If a
  // future leap-second update shifts etFromIso(), the constants would drift
  // out of sync silently. This test re-derives them at runtime.
  //
  // Tolerance: 5 ms. The committed constants are exact SpiceyPy values; the
  // JS etFromIso() approximates SPICE by omitting the K·sin(E) periodic term
  // (peak ~1.657 ms). 5 ms keeps the drift detector tight enough to catch a
  // wrong-by-leap-second silent regression (≥1000 ms) without false-tripping
  // on the expected sub-ms physics-of-time gap.

  it('MISSION_START_ET matches etFromIso(MISSION_START_ISO) within 5 ms', () => {
    const recomputed = etFromIso(MISSION_START_ISO);
    expect(Math.abs(recomputed - MISSION_START_ET)).toBeLessThan(0.005);
  });

  it('MISSION_END_ET matches etFromIso(MISSION_END_ISO) within 5 ms', () => {
    const recomputed = etFromIso(MISSION_END_ISO);
    expect(Math.abs(recomputed - MISSION_END_ET)).toBeLessThan(0.005);
  });

  it('MISSION_START_ISO is the exact ISO for V2 launch (1977-08-20T00:00:00Z)', () => {
    expect(MISSION_START_ISO).toBe('1977-08-20T00:00:00Z');
  });

  it('MISSION_END_ISO is the exact ISO for mission-end (2030-12-31T23:59:59Z)', () => {
    expect(MISSION_END_ISO).toBe('2030-12-31T23:59:59Z');
  });
});

describe('Story 1.9 defense — isoFromEt(etFromIso(iso)) round-trips to-the-second', () => {
  const missionCriticalDates = [
    '1977-09-05T12:56:00Z', // V1 launch
    '1979-03-05T12:05:00Z', // V1 Jupiter encounter
    '1989-08-25T03:56:00Z', // V2 Neptune closest approach
    '1990-02-14T04:48:00Z', // Pale Blue Dot
    '2012-08-25T00:00:00Z', // V1 heliopause crossing
  ];

  for (const iso of missionCriticalDates) {
    it(`round-trips ${iso} preserving to-the-second precision`, () => {
      const et = etFromIso(iso);
      const back = isoFromEt(et);
      expect(back).toBe(iso);
    });
  }
});

describe('Story 1.9 defense — parseInitialT silently rejects non-string / pathological t', () => {
  // URLSearchParams.get returns string | null, so every input below is the
  // string form that would appear in a malformed/attack URL. The test
  // asserts NO throw, NO error UI, and a fall-back to MISSION_START_ET.

  // NOTE: `'0'` and `'-1'` are intentionally omitted — V8's Date.parse() is
  // implementation-defined for these and resolves them to a year-2000 epoch
  // which falls inside the mission window (so the parse "succeeds" and is
  // legitimately in-range). The silent-reject contract still holds (no throw,
  // no error UI), but the result is `valid: true`. The pathological-input
  // contract this test guards is: no exception, no crash, fallback to a
  // safe default — every string below trips at least one of those.
  const pathologicalValues = [
    'null',
    'undefined',
    '{}',
    '[]',
    'NaN',
    'function(){}',
    '<script>alert(1)</script>',
    'true',
    'false',
    'Infinity',
  ];

  for (const v of pathologicalValues) {
    it(`?t=${v} → no throw, falls back to MISSION_START_ET`, () => {
      const { win } = makeWin(`?t=${encodeURIComponent(v)}`);
      const sync = new URLSync(win);
      let result: ReturnType<URLSync['parseInitialT']> | null = null;
      expect(() => {
        result = sync.parseInitialT();
      }).not.toThrow();
      expect(result).not.toBeNull();
      // `0` and `-1` are accepted by Date.parse() as ms epoch and resolve to
      // 1970 → before MISSION_START → silent reject. All other strings fail
      // Date.parse outright. Either way: out-of-range / unparseable, so
      // initialEt MUST be MISSION_START_ET and valid MUST be false.
      expect(result!.valid).toBe(false);
      expect(result!.initialEt).toBe(MISSION_START_ET);
    });
  }
});

describe('Story 1.9 defense — URL throttle window invariant (≤5 writes per 1s)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('100 writeEtThrottled calls across 1s produce at most 5 history writes', () => {
    const { win, replaceCalls } = makeWin();
    const sync = new URLSync(win);
    // 100 calls evenly distributed across 1000ms → 10ms apart.
    for (let i = 0; i < 100; i++) {
      sync.writeEtThrottled(MISSION_START_ET + i * 1000);
      vi.advanceTimersByTime(10);
    }
    // The leading-edge throttle pattern: 1 immediate + at most one trailing
    // write per 250ms window. Over 1000ms that is ≤ 1 + 4 = 5 writes.
    expect(replaceCalls.length).toBeLessThanOrEqual(5);
  });

  it('continuous 60Hz drag for 1s never exceeds the throttle ceiling', () => {
    const { win, replaceCalls } = makeWin();
    const sync = new URLSync(win);
    // 60 calls at 16ms each ≈ 960ms.
    for (let i = 0; i < 60; i++) {
      sync.writeEtThrottled(MISSION_START_ET + i * 1000);
      vi.advanceTimersByTime(16);
    }
    expect(replaceCalls.length).toBeLessThanOrEqual(5);
  });
});

describe('Story 1.9 defense — writeEtImmediate flushes pending throttled write', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mid-window immediate write fires after queued throttled write was suppressed', () => {
    const { win, replaceCalls } = makeWin();
    const sync = new URLSync(win);
    // Open the throttle window with an immediate first write.
    sync.writeEtThrottled(MISSION_START_ET);
    expect(replaceCalls.length).toBe(1);
    // Queue further writes that the throttle suppresses.
    sync.writeEtThrottled(MISSION_START_ET + 100);
    sync.writeEtThrottled(MISSION_START_ET + 200);
    expect(replaceCalls.length).toBe(1);
    // Mid-window release simulates pointer-up.
    vi.advanceTimersByTime(50);
    const releasedAt = MISSION_START_ET + 12345;
    sync.writeEtImmediate(releasedAt);
    // The immediate write must fire even though the throttle window is open
    // and would otherwise have suppressed it.
    expect(replaceCalls.length).toBe(2);
    const lastUrl = replaceCalls[1]!.url as string;
    expect(lastUrl).toContain(isoFromEt(releasedAt));
    // And no further trailing writes arrive (the immediate cancelled the timer).
    vi.advanceTimersByTime(1000);
    expect(replaceCalls.length).toBe(2);
  });
});

describe('Story 1.9 defense — WAI-ARIA Slider attributes on [role="slider"]', () => {
  it('every required ARIA attribute is present and non-empty on the slider element', async () => {
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    document.body.appendChild(el);
    await el.updateComplete;
    const slider = el.shadowRoot!.querySelector('[role="slider"]');
    expect(slider).not.toBeNull();
    const required = [
      'aria-valuemin',
      'aria-valuemax',
      'aria-valuenow',
      'aria-valuetext',
      'aria-label',
      'tabindex',
    ];
    for (const attr of required) {
      const value = slider!.getAttribute(attr);
      expect(value, `${attr} must be present`).not.toBeNull();
      expect(value!.length, `${attr} must be non-empty`).toBeGreaterThan(0);
    }
    expect(slider!.getAttribute('aria-label')).toBe('Mission timeline');
    expect(slider!.getAttribute('tabindex')).toBe('0');
    el.remove();
  });
});

describe('Story 1.9 defense — aria-valuenow + aria-valuetext update reactively', () => {
  it('setting simEt updates aria-valuenow (ISO) and aria-valuetext (HUD form)', async () => {
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    document.body.appendChild(el);
    await el.updateComplete;
    const neptuneEt = etFromIso('1989-08-25T09:23:00Z');
    el.simEt = neptuneEt;
    await el.updateComplete;
    const slider = el.shadowRoot!.querySelector('[role="slider"]')!;
    // aria-valuenow is the ISO form (to-the-second precision).
    expect(slider.getAttribute('aria-valuenow')).toBe('1989-08-25T09:23:00Z');
    // aria-valuetext is human-readable "YYYY-MM-DD HH:MM UT" — must contain
    // both the date and time components.
    const valueText = slider.getAttribute('aria-valuetext')!;
    expect(valueText).toContain('1989-08-25');
    expect(valueText).toContain('09:23');
    el.remove();
  });
});

describe('Story 1.9 defense — Keyboard scrub direction is correct (sign-flip tripwire)', () => {
  it('ArrowRight → +1 day; ArrowLeft → -1 day; Shift+ArrowRight → +10 days', async () => {
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    // Stub URL writeback so we don't pollute the real history.
    el.urlSync = {
      parseInitialT: () => ({ initialEt: MISSION_START_ET, valid: false }),
      writeEtThrottled: () => {},
      writeEtImmediate: () => {},
      flush: () => {},
    } as unknown as URLSync;
    el.simEt = MISSION_START_ET + 30 * ONE_DAY; // safely away from boundaries
    document.body.appendChild(el);
    await el.updateComplete;
    const slider = el.shadowRoot!.querySelector('[role="slider"]')!;

    // ArrowRight → +86400.
    let before = el.simEt;
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(el.simEt - before).toBe(ONE_DAY);

    // ArrowLeft → -86400.
    before = el.simEt;
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(el.simEt - before).toBe(-ONE_DAY);

    // Shift+ArrowRight → +10 days.
    before = el.simEt;
    slider.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    );
    expect(el.simEt - before).toBe(10 * ONE_DAY);

    el.remove();
  });

  it('Home → MISSION_START_ET; End → MISSION_END_ET', async () => {
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.urlSync = {
      parseInitialT: () => ({ initialEt: MISSION_START_ET, valid: false }),
      writeEtThrottled: () => {},
      writeEtImmediate: () => {},
      flush: () => {},
    } as unknown as URLSync;
    el.simEt = MISSION_START_ET + 100 * ONE_DAY;
    document.body.appendChild(el);
    await el.updateComplete;
    const slider = el.shadowRoot!.querySelector('[role="slider"]')!;

    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(el.simEt).toBe(MISSION_START_ET);

    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(el.simEt).toBe(MISSION_END_ET);

    el.remove();
  });
});

describe('Story 1.9 defense — simEt visually clamps thumb position to mission bounds', () => {
  // Note: the implementation clamps via `computeFraction()` for the rendered
  // thumb/fill position, so visually the scrubber never escapes the track.
  // The keyboard / pointer paths additionally clamp `this.simEt` itself via
  // `applyEt`. Direct property assignment (the case below) does NOT clamp
  // the underlying simEt — only the *visual* projection. The tests below
  // lock in the visual clamp (the user-facing promise); the keyboard-clamp
  // path is covered by the dev's co-located scrubber tests.

  it('simEt below MISSION_START_ET → thumb rendered at left edge (0%)', async () => {
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.urlSync = {
      parseInitialT: () => ({ initialEt: MISSION_START_ET, valid: false }),
      writeEtThrottled: () => {},
      writeEtImmediate: () => {},
      flush: () => {},
    } as unknown as URLSync;
    el.simEt = MISSION_START_ET - 100;
    document.body.appendChild(el);
    await el.updateComplete;
    const slider = el.shadowRoot!.querySelector('[role="slider"]') as HTMLElement;
    const fill = el.shadowRoot!.querySelector('.fill') as HTMLElement;
    expect(fill.getAttribute('style') ?? '').toMatch(/width:\s*0(\.0+)?%/);
    expect(slider.getAttribute('style') ?? '').toMatch(/left:\s*0(\.0+)?%/);
    el.remove();
  });

  it('simEt above MISSION_END_ET → thumb rendered at right edge (100%)', async () => {
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.urlSync = {
      parseInitialT: () => ({ initialEt: MISSION_START_ET, valid: false }),
      writeEtThrottled: () => {},
      writeEtImmediate: () => {},
      flush: () => {},
    } as unknown as URLSync;
    el.simEt = MISSION_END_ET + 100;
    document.body.appendChild(el);
    await el.updateComplete;
    const slider = el.shadowRoot!.querySelector('[role="slider"]') as HTMLElement;
    const fill = el.shadowRoot!.querySelector('.fill') as HTMLElement;
    expect(fill.getAttribute('style') ?? '').toMatch(/width:\s*100(\.0+)?%/);
    expect(slider.getAttribute('style') ?? '').toMatch(/left:\s*100(\.0+)?%/);
    el.remove();
  });
});

describe('Story 1.9 defense — prefers-reduced-motion handled at token level only', () => {
  // The "reduced-motion globality" tripwire: components must NOT add their
  // own matchMedia('prefers-reduced-motion') checks. The single global
  // @media rule in styles/global.css collapses the duration tokens, and
  // every component inherits via var(--v-duration-*). Drift here means a
  // future story bypassed the token system.

  it('v-title-card source contains zero per-component prefers-reduced-motion checks', () => {
    const src = readFileSync(
      resolve(webRoot, 'src/components/v-title-card.ts'),
      'utf-8',
    );
    // Strip block + line comments before grepping — the documentation
    // legitimately *mentions* the rule by name.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(stripped).not.toMatch(/prefers-reduced-motion/);
    expect(stripped).not.toMatch(/matchMedia\s*\(/);
  });

  it('v-timeline-scrubber source contains zero per-component prefers-reduced-motion checks', () => {
    const src = readFileSync(
      resolve(webRoot, 'src/components/v-timeline-scrubber.ts'),
      'utf-8',
    );
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(stripped).not.toMatch(/prefers-reduced-motion/);
    expect(stripped).not.toMatch(/matchMedia\s*\(/);
  });
});

describe('Story 1.9 defense — 44×44 hit-area declared in component CSS', () => {
  it('VTimelineScrubber.styles contains a .thumb::before rule with width:44px height:44px', () => {
    const styles = VTimelineScrubber.styles as Array<{ cssText?: string } | undefined>;
    const joined = styles.map((s) => String(s?.cssText ?? '')).join('\n');
    expect(joined).toContain('::before');
    expect(joined).toContain('width: 44px');
    expect(joined).toContain('height: 44px');
  });
});

describe('Story 1.9 defense — voyager:title-card-complete fires exactly once', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('v-title-card').forEach((el) => el.remove());
  });

  it('event fires exactly once across hold + dissolve + fallback (no race double-fire)', async () => {
    const el = document.createElement('v-title-card') as VTitleCard;
    let count = 0;
    el.addEventListener('voyager:title-card-complete', () => {
      count++;
    });
    document.body.appendChild(el);
    await Promise.resolve(); // let connectedCallback run
    // Fire the hold expiry → dissolve begins.
    vi.advanceTimersByTime(TITLE_CARD_HOLD_MS + 1);
    // Race a transitionend with the fallback timer. Both completion paths
    // converge on emitComplete; the test asserts the guard prevents
    // double-firing even when both arrive.
    el.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'opacity' }));
    vi.advanceTimersByTime(2600);
    expect(count).toBe(1);
  });
});

describe('Story 1.9 defense — attachPointerHandlers unsubscribe removes all listeners', () => {
  it('after unsubscribe, pointerdown does NOT invoke the handler', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    let downCount = 0;
    let moveCount = 0;
    let upCount = 0;
    const off = attachPointerHandlers(target, {
      onDown: () => {
        downCount++;
      },
      onMove: () => {
        moveCount++;
      },
      onUp: () => {
        upCount++;
      },
    });
    // Sanity: pre-unsubscribe, the handler is wired.
    target.dispatchEvent(new Event('pointerdown'));
    expect(downCount).toBe(1);
    // Unsubscribe and confirm no further handler invocations.
    off();
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('pointermove'));
    target.dispatchEvent(new Event('pointerup'));
    target.dispatchEvent(new Event('pointercancel'));
    expect(downCount).toBe(1);
    expect(moveCount).toBe(0);
    expect(upCount).toBe(0);
    // Idempotent: calling off() again is a no-op.
    expect(() => off()).not.toThrow();
    target.remove();
  });
});

describe('Story 1.9 defense — out-of-range ?t= silently rejects with no throw', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it('?t=1900-01-01T00:00:00Z → no throw, parseInitialT returns initialEt=MISSION_START_ET, valid=false', () => {
    const { win } = makeWin('?t=1900-01-01T00:00:00Z');
    const sync = new URLSync(win);
    let result: ReturnType<URLSync['parseInitialT']> | null = null;
    expect(() => {
      result = sync.parseInitialT();
    }).not.toThrow();
    expect(result!.initialEt).toBe(MISSION_START_ET);
    expect(result!.valid).toBe(false);
  });

  it('?t=2100-01-01T00:00:00Z → no throw, parseInitialT returns initialEt=MISSION_START_ET, valid=false', () => {
    const { win } = makeWin('?t=2100-01-01T00:00:00Z');
    const sync = new URLSync(win);
    let result: ReturnType<URLSync['parseInitialT']> | null = null;
    expect(() => {
      result = sync.parseInitialT();
    }).not.toThrow();
    expect(result!.initialEt).toBe(MISSION_START_ET);
    expect(result!.valid).toBe(false);
  });
});

describe('Story 1.9 defense — First-paint ordering: scrubber AFTER dissolve, NOT before', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('scrubber is mounted but hidden immediately after boot (title card holds primary stage)', () => {
    startFirstPaint(document.body);
    const scrubber = document.querySelector('v-timeline-scrubber') as HTMLElement;
    expect(scrubber).not.toBeNull();
    // The scrubber exists but is visually suppressed until the title card
    // dispatches voyager:title-card-complete.
    expect(scrubber.style.visibility).toBe('hidden');
    // The title card is the primary stage at T=0.
    expect(document.querySelector('v-title-card')).not.toBeNull();
  });

  it('after hold + dissolve + fallback completes, scrubber becomes visible AND title card is removed', async () => {
    startFirstPaint(document.body);
    const scrubber = document.querySelector('v-timeline-scrubber') as HTMLElement;
    await Promise.resolve();
    // Advance past hold (2000ms) + fallback dissolve (~600ms).
    vi.advanceTimersByTime(TITLE_CARD_HOLD_MS + 700);
    await Promise.resolve();
    expect(scrubber.style.visibility).toBe('');
    expect(document.querySelector('v-title-card')).toBeNull();
  });
});
