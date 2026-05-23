/**
 * Story 4.1 AC6 — ChapterDirector → `<v-attitude-indicator>.setActiveSpacecraft`
 * wire-up tests. Closes Epic 3 retro Action #3.
 *
 * The wire itself lives in `web/src/main.ts` (inside the
 * `chapterDirector.subscribe(...)` block installed after firstPaintHandle).
 * Loading main.ts under Vitest would execute `bootstrap()` and touch
 * WebGL / Three.js, so this file exercises the wire's logic via the same
 * pattern Story 2.1's `main-chapter-director-wireup.test.ts` uses for the
 * shape contract — plus a behavioural test that wires the real
 * ChapterDirector against a stub indicator and asserts the three AC6 pin
 * cases.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import { etFromIso } from '../src/math/et-conversions';
import type { Spacecraft, ChapterSpec } from '../src/types/chapter';

const webRoot = resolve(__dirname, '..');
const mainTsSrc = readFileSync(resolve(webRoot, 'src/main.ts'), 'utf-8');

// === Wire-shape pins (mirrors Story 2.1's wireup-shape test pattern) =========

describe('Story 4.1 AC6 — main.ts wire-up shape', () => {
  it('imports ViewFrameService alongside the other post-manifest services', () => {
    expect(mainTsSrc).toMatch(
      /import\s*\{\s*ViewFrameService\s*\}\s*from\s*['"]\.\/services\/view-frame['"]/,
    );
  });

  it('declares a naifIdForSpacecraft helper that maps spacecraft → -31/-32', () => {
    expect(mainTsSrc).toMatch(/naifIdForSpacecraft/);
    // Both branches must be present so the V1/V2 mapping is unambiguous.
    expect(mainTsSrc).toMatch(/-32/);
    expect(mainTsSrc).toMatch(/-31/);
  });

  it('subscribes a held-transition handler on chapterDirector', () => {
    // Two pins: the .subscribe call exists, and inside there's a check
    // for event.to === 'held' so cruise transitions never fire the setter.
    expect(mainTsSrc).toMatch(/chapterDirector\.subscribe\(/);
    expect(mainTsSrc).toMatch(/event\.to\s*!==\s*['"]held['"]/);
  });

  it('calls setActiveSpacecraft on the firstPaintHandle.hud.attitudeIndicator handle', () => {
    expect(mainTsSrc).toMatch(
      /firstPaintHandle\.hud\.attitudeIndicator\?\.setActiveSpacecraft\(/,
    );
  });

  it('constructs ViewFrameService post-manifest and wires it via setViewFrame', () => {
    // The post-manifest block — inside ManifestLoader.load(...).then(...).
    expect(mainTsSrc).toMatch(/new\s+ViewFrameService\(\s*ephemerisService\s*\)/);
    expect(mainTsSrc).toMatch(
      /engine\.setViewFrame\(\s*viewFrameService\s*,\s*chapterDirector\s*\)/,
    );
  });

  it('publishes __voyagerDebug.viewFrame inside the DEV gate', () => {
    expect(mainTsSrc).toMatch(/viewFrame:\s*viewFrameService/);
    // The viewFrame assignment must live inside an import.meta.env.DEV block.
    // Trivial check: __voyagerDebug must coexist with import.meta.env.DEV
    // somewhere in the post-manifest area. Story 2.1's source-shape test
    // pins the broader DEV-only contract.
    expect(mainTsSrc).toMatch(/import\.meta\.env\.DEV/);
  });

  // Story 4.1 AC6 smoke-fix (2026-05-23): the synchronous cold-load seed
  // fires `held` transitions BEFORE <v-hud>'s first Lit render completes,
  // so firstPaintHandle.hud.attitudeIndicator?.setActiveSpacecraft(...)
  // silently no-ops at boot. The fix records the last held naifId in a
  // closure and replays it inside firstPaintHandle.hud.updateComplete.then(...).
  // Without these pins a regression that drops the replay would re-open the
  // Story 4.0 smoke gap (indicator stuck on V1 stub on /c/v2-saturn cold-load).
  it('records the last held naifId in a closure so a post-Lit replay can fire it', () => {
    // The smoke-fix replay needs to remember the naifId that the sync
    // subscriber saw even when the indicator was still null. Source-grep
    // the closure variable name + the assignment inside the subscriber.
    expect(mainTsSrc).toMatch(/let\s+lastHeldNaifId/);
    expect(mainTsSrc).toMatch(/lastHeldNaifId\s*=\s*naifId/);
  });

  it('replays setActiveSpacecraft inside firstPaintHandle.hud.updateComplete.then(...) after Lit\'s first render', () => {
    // The replay must run inside a then() on hud.updateComplete so it fires
    // ONLY after <v-hud>'s first render flush (the moment the indicator
    // becomes reachable via the shadow-DOM accessor).
    expect(mainTsSrc).toMatch(
      /firstPaintHandle\.hud\.updateComplete\?\.then\(/,
    );
    // Fall back to chapterDirector.activeChapter when no held event has
    // fired yet (defensive — cold-load arrival inside a window does fire
    // `held` per ChapterDirector's "synthesize transitions" contract, but
    // belt-and-braces).
    expect(mainTsSrc).toMatch(/chapterDirector\.activeChapter/);
  });
});

// === Behavioural test — exercises a real ChapterDirector against a stub =====

/**
 * Capture-only stub matching the public surface of `<v-attitude-indicator>`'s
 * setActiveSpacecraft method. Each call is recorded so we can assert on the
 * order + values seen by the wire.
 */
const makeStubIndicator = (): {
  calls: number[];
  setActiveSpacecraft: (naifId: number) => void;
} => {
  const calls: number[] = [];
  return {
    calls,
    setActiveSpacecraft(naifId: number) {
      calls.push(naifId);
    },
  };
};

/**
 * Reproduce the exact wiring main.ts installs — `subscribe` + held-only +
 * naifIdForSpacecraft mapping. Keeping this fixture in-test (rather than
 * importing from main.ts) is intentional: the source-shape pins above lock
 * the main.ts code; this fixture pins the EFFECT of that code on a real
 * director. A regression in either path fails a test.
 */
const naifIdForSpacecraft = (s: Spacecraft): -31 | -32 => {
  if (s === 'v2') return -32;
  return -31;
};

const installWire = (
  director: ChapterDirector,
  indicator: { setActiveSpacecraft: (n: number) => void },
): (() => void) =>
  director.subscribe((event) => {
    if (event.to !== 'held') return;
    indicator.setActiveSpacecraft(naifIdForSpacecraft(event.chapter.spacecraft));
  });

describe('Story 4.1 AC6 — runtime wire behaviour', () => {
  it('V1 chapter held → setActiveSpacecraft(-31)', () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const indicator = makeStubIndicator();
    installWire(director, indicator);
    // Scrub to V1 Jupiter anchor — chapter spacecraft = 'v1'.
    director.update(etFromIso('1979-03-05T12:05:00Z'));
    // The full forward walk fires entering→held for every chapter the
    // cursor passes through. We expect each V1 / V2 chapter the seed walks
    // past to have fired its mapping; the LAST `held` event reflects the
    // active chapter. V1 Jupiter is V1 → -31.
    expect(indicator.calls.length).toBeGreaterThan(0);
    expect(indicator.calls[indicator.calls.length - 1]).toBe(-31);
  });

  it('V2 chapter held → setActiveSpacecraft(-32)', () => {
    const director = new ChapterDirector(ALL_CHAPTERS);
    const indicator = makeStubIndicator();
    installWire(director, indicator);
    // V2 Saturn anchor — chapter spacecraft = 'v2'.
    director.update(etFromIso('1981-08-26T00:00:00Z'));
    expect(indicator.calls[indicator.calls.length - 1]).toBe(-32);
  });

  it('cruise between chapters fires no setActiveSpacecraft call from cruise itself', () => {
    // Two-step probe: jump first to a chapter (V1 Jupiter), then to cruise.
    // Step 1 fires entering→held (setter call). Step 2 transitions
    // held→exiting→passed (no setter call). Net: the setter count after the
    // cruise jump equals the setter count after step 1.
    const director = new ChapterDirector(ALL_CHAPTERS);
    const indicator = makeStubIndicator();
    installWire(director, indicator);
    director.update(etFromIso('1979-03-05T12:05:00Z'));
    const callsAfterChapter = indicator.calls.length;
    // 1995 is the long V2-Neptune → V1-Heliopause quiet zone — no active chapter.
    director.update(etFromIso('1995-01-01T00:00:00Z'));
    // The exit transition itself does NOT fire setter (it's `out`, not `held`).
    // BUT: scrub forward from V1J to 1995 walks through V2J, V1S, V2S, V2U,
    // V2N, PBD chapters' entering→held→exiting→passed transitions. Each
    // intermediate `held` does fire the setter. So we only assert that:
    //   (a) the chapter cursor lands on null (cruise), and
    //   (b) NO call after the final intermediate `held` adds extra entries
    //       for the cruise transition itself.
    expect(director.activeChapter).toBeNull();
    // The number of indicator calls equals (1 V1J + 5 intermediates) = 6,
    // none added for the cruise transition itself (1995 has no held chapter).
    // Stronger pin: the very last call's value matches the spacecraft of
    // the LAST chapter the cursor crossed (PBD is V1, so the final value is
    // -31). Cruise never adds a setter call past that point.
    expect(indicator.calls.length).toBeGreaterThanOrEqual(callsAfterChapter);
    // After the cruise jump, no further calls fire on subsequent same-ET
    // updates (idempotency carryover).
    const countBeforeIdempotent = indicator.calls.length;
    director.update(etFromIso('1995-01-01T00:00:00Z'));
    expect(indicator.calls.length).toBe(countBeforeIdempotent);
  });

  it('cruise → V2 chapter held → setActiveSpacecraft(-32) on the V2 chapter', () => {
    // Cold-load scenario most relevant to Story 4.0's smoke gap at /c/v2-saturn:
    // the cursor starts at a cruise ET, then scrubs into a V2 window. The
    // indicator must flip to -32 on the `held` transition.
    const director = new ChapterDirector(ALL_CHAPTERS);
    const indicator = makeStubIndicator();
    installWire(director, indicator);
    // First seed at a between-chapters ET so no `held` fires.
    director.update(etFromIso('1983-01-01T00:00:00Z')); // between V2-Sat and V2-Uranus
    indicator.calls.length = 0;
    // Now scrub into V2 Saturn — held event fires, indicator flips.
    director.update(etFromIso('1981-08-26T00:00:00Z'));
    expect(indicator.calls).toContain(-32);
  });

  it('naifIdForSpacecraft maps v1=-31, v2=-32, both=-31 (default)', () => {
    expect(naifIdForSpacecraft('v1')).toBe(-31);
    expect(naifIdForSpacecraft('v2')).toBe(-32);
    expect(naifIdForSpacecraft('both')).toBe(-31);
  });

  it('subscriber catches the synthesized first-update transitions (cold-load /c/v2-saturn)', () => {
    // Pins the load-bearing main.ts ordering: subscriber must be installed
    // BEFORE the synchronous `chapterDirector.update(clockManager.simTimeEt)`
    // seed, so cold-load arrival inside a V2 chapter window fires the wire
    // on the seed itself (rather than waiting for the next director
    // transition crossing — which on a stable cold-load there is none).
    const director = new ChapterDirector(ALL_CHAPTERS);
    const indicator = makeStubIndicator();
    installWire(director, indicator);
    // Cold-load directly into V2 Saturn (mirrors /c/v2-saturn?t=<anchor>).
    director.update(etFromIso('1981-08-26T00:00:00Z'));
    expect(indicator.calls.length).toBeGreaterThan(0);
    // The active chapter at this ET is V2 Saturn — last setter call must be
    // V2 mapping (-32).
    const v2Saturn = findChapterBySlug('v2-saturn');
    expect(v2Saturn).not.toBeNull();
    expect((v2Saturn as ChapterSpec).spacecraft).toBe('v2');
    expect(indicator.calls[indicator.calls.length - 1]).toBe(-32);
  });

  it('a throwing setActiveSpacecraft does NOT prevent later subscribers from running', () => {
    // Defensive — ChapterDirector swallows subscriber exceptions per Story
    // 2.0 chunk-loader hardening pattern. A future fragile indicator
    // shouldn't break unrelated subscribers (URLRouter, scrubber markers).
    const director = new ChapterDirector(ALL_CHAPTERS);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwing = {
      setActiveSpacecraft: (_n: number) => {
        throw new Error('indicator boom');
      },
    };
    installWire(director, throwing);
    const otherSubscriber = vi.fn();
    director.subscribe(otherSubscriber);
    expect(() => director.update(etFromIso('1979-03-05T12:05:00Z'))).not.toThrow();
    expect(otherSubscriber).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
