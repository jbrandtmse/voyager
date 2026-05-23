// @vitest-environment happy-dom
/**
 * Story 4.4 — QA gap-hunt suite for `<v-timeline-scrubber variant="detail">`.
 *
 * The dev's tier (Story 4.4 cycle 1) covered the happy paths thoroughly:
 *   - AC1 visual treatment, AC2 slide-in/out, AC3 mid-drag transition,
 *     AC4 sync, AC5 cadence-aware step at each tier, AC6 highlight band,
 *     AC7 integration against real services.
 *
 * QA's gap-hunt sweep targets the 8 failure modes the dev's coverage did
 * NOT explicitly pin (see the spawn prompt's "QA gap-hunting priorities"
 * list). Each describe block carries the priority number it pins, and the
 * `it` titles call out the specific failure-mode wording so a future
 * reviewer can map the assertion back to the planning artifact.
 *
 * These tests are deliberately strict — they re-assert behaviour the dev
 * tests imply but never directly verify, giving us a defence-in-depth
 * canary if a future refactor breaks the subtle contract (e.g. moving
 * `data-open` and `aria-hidden` writes onto different lines, snapshotting
 * the cadence step at handler construction time, double-throttling URL
 * writes, etc.).
 *
 * File-discoverability: lives under `web/tests/**` per project vitest
 * convention, named `*.test.ts` per the glob. Auto-discovered.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { URLSync } from '../src/services/url-sync';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import {
  MISSION_START_ET,
  MISSION_END_ET,
  URL_WRITEBACK_THROTTLE_MS,
} from '../src/constants/mission';
import { VTimelineScrubber } from '../src/components/v-timeline-scrubber';
import { cadenceAwareStep } from '../src/primitives/cadence-aware-step';

const ONE_HOUR = 3600;
const ONE_DAY = 86_400;
const TWO_DAYS = 2 * ONE_DAY;

// ---------------------------------------------------------------------------
// Test rigs / helpers
// ---------------------------------------------------------------------------

interface DualScrubberRig {
  clock: ClockManager;
  director: ChapterDirector;
  urlSync: URLSync;
  mission: VTimelineScrubber;
  detail: VTimelineScrubber;
}

const mountDualScrubbers = async (
  options: { urlSync?: URLSync } = {},
): Promise<DualScrubberRig> => {
  const clock = new ClockManager();
  const director = new ChapterDirector(ALL_CHAPTERS);
  const urlSync = options.urlSync ?? new URLSync();

  const mission = document.createElement(
    'v-timeline-scrubber',
  ) as VTimelineScrubber;
  mission.variant = 'mission';
  mission.urlSync = urlSync;
  mission.clockManager = clock;
  mission.chapterDirector = director;
  document.body.appendChild(mission);

  const detail = document.createElement(
    'v-timeline-scrubber',
  ) as VTimelineScrubber;
  detail.variant = 'detail';
  detail.urlSync = urlSync;
  detail.clockManager = clock;
  detail.chapterDirector = director;
  document.body.appendChild(detail);

  await mission.updateComplete;
  await detail.updateComplete;

  // Stub bounding rects so etFromClientX maps deterministically.
  const stubRect = (el: HTMLElement, height: number): void => {
    el.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 1000,
        top: 0,
        bottom: height,
        width: 1000,
        height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  };
  stubRect(mission.shadowRoot!.querySelector('.track') as HTMLElement, 12);
  stubRect(detail.shadowRoot!.querySelector('.track') as HTMLElement, 4);

  return { clock, director, urlSync, mission, detail };
};

const teardownRig = (rig: DualScrubberRig): void => {
  rig.mission.remove();
  rig.detail.remove();
  rig.clock.dispose();
};

const makePointerEvent = (
  type: string,
  init: {
    clientX: number;
    clientY?: number;
    pointerType?: string;
    pointerId?: number;
    target?: Element | null;
  },
): Event => {
  const evt = new Event(type, { bubbles: true });
  Object.defineProperty(evt, 'clientX', {
    value: init.clientX,
    configurable: true,
  });
  Object.defineProperty(evt, 'clientY', {
    value: init.clientY ?? 0,
    configurable: true,
  });
  Object.defineProperty(evt, 'pointerType', {
    value: init.pointerType ?? 'mouse',
    configurable: true,
  });
  Object.defineProperty(evt, 'pointerId', {
    value: init.pointerId ?? 1,
    configurable: true,
  });
  if (init.target !== undefined) {
    Object.defineProperty(evt, 'target', { value: init.target, configurable: true });
  }
  return evt;
};

// ---------------------------------------------------------------------------
// QA priority 1 — Cadence-aware step boundary discipline at the edges
// ---------------------------------------------------------------------------

describe('QA priority 1 — cadence-aware-step boundary discipline at edges', () => {
  // The cadence-aware-step.test.ts pins each tier's inclusive boundary.
  // QA's extra cover here exercises *transitions across* the boundaries
  // mid-keyboard-scrub, which is the genuine failure mode (a step computed
  // BEFORE the edge crossing must yield the new tier on the very next
  // keystroke — proving the dev's "rebuild per keystroke" wiring works).
  const v1Jupiter = findChapterBySlug('v1-jupiter')!;

  it('crossing the ±1h edge from inside (10s tier) → outside flips to 1min tier on next keystroke', () => {
    // Position just inside ±1h (smallest tier).
    const justInside = v1Jupiter.anchorEt + ONE_HOUR - 1;
    expect(cadenceAwareStep(justInside, v1Jupiter.anchorEt).stepSmall).toBe(10);
    // Position just outside ±1h.
    const justOutside = v1Jupiter.anchorEt + ONE_HOUR + 1;
    expect(cadenceAwareStep(justOutside, v1Jupiter.anchorEt).stepSmall).toBe(60);
  });

  it('crossing the ±2d edge from inside (1min tier) → outside flips to hourly tier', () => {
    const justInside = v1Jupiter.anchorEt + TWO_DAYS - 1;
    expect(cadenceAwareStep(justInside, v1Jupiter.anchorEt).stepSmall).toBe(60);
    const justOutside = v1Jupiter.anchorEt + TWO_DAYS + 1;
    expect(cadenceAwareStep(justOutside, v1Jupiter.anchorEt).stepSmall).toBe(ONE_HOUR);
  });

  it('keyboard-scrubbing INTO the chapter window from outside recomputes step on next keystroke', async () => {
    // Mount the detail variant with the cursor outside any encounter (so
    // activeDetailChapter is null and we hit the fallback step).
    const rig = await mountDualScrubbers();
    rig.clock.scrubTo(MISSION_START_ET + 365 * ONE_DAY); // cruise
    rig.director.update(MISSION_START_ET + 365 * ONE_DAY);
    await rig.detail.updateComplete;

    // Now teleport the cursor INTO the V1 Jupiter window (this drives the
    // detail variant's subscriber path → activeDetailChapter is set).
    rig.clock.scrubTo(v1Jupiter.anchorEt + 30 * 60); // 30 minutes past anchor
    rig.director.update(v1Jupiter.anchorEt + 30 * 60);
    await rig.detail.updateComplete;

    // Dispatching ArrowRight on the detail thumb now MUST use the 10sec
    // tier (we're inside ±1 hour of the anchor), not the 1-day fallback.
    const thumb = rig.detail.shadowRoot!.querySelector('.thumb')!;
    const before = rig.detail.simEt;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(rig.detail.simEt - before).toBe(10);
    teardownRig(rig);
  });

  it('keystroke at the cursor STRADDLING the ±1h boundary uses the snapshot at firing time', () => {
    // Defense: the helper is pure-position. Picking et = anchor + 1 hour
    // (inclusive boundary) gives 10sec; any further step (10s) lands the
    // cursor at anchor + 3610s which is still in the 10sec tier (3610s <
    // 7200s = 2h). Verify the boundary doesn't quantize away a tier.
    const atBoundary = v1Jupiter.anchorEt + ONE_HOUR;
    expect(cadenceAwareStep(atBoundary, v1Jupiter.anchorEt).stepSmall).toBe(10);
    const afterStep = atBoundary + 10;
    expect(cadenceAwareStep(afterStep, v1Jupiter.anchorEt).stepSmall).toBe(60);
    // ^ Crossing past the boundary on the SAME keystroke moves to the 1min
    // tier — but the keystroke's delta is fixed at firing time. This is
    // the documented contract: the next keystroke picks up the new tier.
  });
});

// ---------------------------------------------------------------------------
// QA priority 2 — Forward/reverse substate symmetric coverage
// ---------------------------------------------------------------------------

describe('QA priority 2 — forward/reverse substate symmetry', () => {
  // The ChapterDirector FSM emits the same `to === 'entering'` event in
  // both directions; the scrubber must discriminate via `from`. We pin all
  // four corners of the substate-pair table:
  //   forward open:   out      → entering   (detail opens)
  //   forward close:  held     → exiting    (detail closes)
  //   reverse open:   passed   → exiting    (detail opens)
  //   reverse close:  held     → entering   (detail closes)
  // The dev tests pin forward open + forward close. QA pins the reverse
  // pair and the rapid-cycling case.
  const v1Jupiter = findChapterBySlug('v1-jupiter')!;

  it('reverse open: passed → exiting flips aria-hidden=false', async () => {
    const rig = await mountDualScrubbers();
    // Drive forward past the V1J window so it ends in `passed`.
    rig.director.update(v1Jupiter.windowEndEt + ONE_DAY);
    rig.clock.scrubTo(v1Jupiter.windowEndEt + ONE_DAY);
    await rig.detail.updateComplete;
    expect(rig.detail.getAttribute('aria-hidden')).toBe('true');
    // Reverse-scrub back INTO the window. The FSM walks
    // passed → exiting → held, and the detail subscriber sees `to ===
    // 'held'` (which opens) — symmetrically equivalent to the forward
    // open path.
    rig.clock.scrubTo(v1Jupiter.anchorEt);
    rig.director.update(v1Jupiter.anchorEt);
    await rig.detail.updateComplete;
    expect(rig.detail.getAttribute('aria-hidden')).toBe('false');
    teardownRig(rig);
  });

  it('reverse close: held → entering flips aria-hidden=true', async () => {
    const rig = await mountDualScrubbers();
    // Forward to held.
    rig.clock.scrubTo(v1Jupiter.anchorEt);
    rig.director.update(v1Jupiter.anchorEt);
    await rig.detail.updateComplete;
    expect(rig.detail.getAttribute('aria-hidden')).toBe('false');
    // Reverse PAST the window start — FSM walks held → entering → out;
    // the scrubber's gate on `to === 'entering' && from === 'held'` is
    // the reverse close path that the dev documents explicitly.
    rig.clock.scrubTo(v1Jupiter.windowStartEt - ONE_DAY);
    rig.director.update(v1Jupiter.windowStartEt - ONE_DAY);
    await rig.detail.updateComplete;
    expect(rig.detail.getAttribute('aria-hidden')).toBe('true');
    teardownRig(rig);
  });

  it('rapid back-and-forth across the window edge — animation not stuck', async () => {
    const rig = await mountDualScrubbers();
    // Oscillate the cursor across the V1J start edge multiple times.
    // After each crossing, the detail aria-hidden must settle into the
    // correct final state for that ET — no "stuck open" or "stuck closed"
    // residue from the previous crossing.
    for (let i = 0; i < 5; i += 1) {
      // Inside the window.
      rig.clock.scrubTo(v1Jupiter.windowStartEt + ONE_HOUR);
      rig.director.update(v1Jupiter.windowStartEt + ONE_HOUR);
      await rig.detail.updateComplete;
      expect(rig.detail.getAttribute('aria-hidden')).toBe('false');
      // Outside the window.
      rig.clock.scrubTo(v1Jupiter.windowStartEt - ONE_HOUR);
      rig.director.update(v1Jupiter.windowStartEt - ONE_HOUR);
      await rig.detail.updateComplete;
      expect(rig.detail.getAttribute('aria-hidden')).toBe('true');
    }
    teardownRig(rig);
  });

  it('forward exit through the window end: held → exiting → passed leaves aria-hidden=true', async () => {
    const rig = await mountDualScrubbers();
    rig.clock.scrubTo(v1Jupiter.anchorEt);
    rig.director.update(v1Jupiter.anchorEt);
    await rig.detail.updateComplete;
    expect(rig.detail.getAttribute('aria-hidden')).toBe('false');
    rig.clock.scrubTo(v1Jupiter.windowEndEt + ONE_DAY);
    rig.director.update(v1Jupiter.windowEndEt + ONE_DAY);
    await rig.detail.updateComplete;
    expect(rig.detail.getAttribute('aria-hidden')).toBe('true');
    expect(rig.detail.hasAttribute('data-open')).toBe(false);
    teardownRig(rig);
  });
});

// ---------------------------------------------------------------------------
// QA priority 3 — Dual-scrubber pointer-capture race
// ---------------------------------------------------------------------------

describe('QA priority 3 — pointer-capture race conditions', () => {
  const v1Jupiter = findChapterBySlug('v1-jupiter')!;

  it('pointerdown on mission scrubber AT the same tick as substate transition does not hijack capture', async () => {
    const rig = await mountDualScrubbers();
    // Position the cursor at the edge of the V1J window (cursor outside).
    rig.clock.scrubTo(v1Jupiter.windowStartEt - 10);
    rig.director.update(v1Jupiter.windowStartEt - 10);
    await rig.mission.updateComplete;
    await rig.detail.updateComplete;
    expect(rig.detail.getAttribute('aria-hidden')).toBe('true');

    const missionTrack = rig.mission.shadowRoot!.querySelector('.track') as HTMLElement;
    const missionThumb = rig.mission.shadowRoot!.querySelector('.thumb') as HTMLElement;

    // Synchronize pointerdown + director.update so they fire in the same
    // tick. The mission scrubber's pointerdown grabs capture; the
    // director.update runs the slide-in side effect. Mission thumb's
    // data-dragging attribute must remain set throughout.
    missionTrack.dispatchEvent(
      makePointerEvent('pointerdown', {
        clientX: 100,
        target: missionThumb,
      }),
    );
    rig.director.update(v1Jupiter.anchorEt);
    await rig.mission.updateComplete;
    await rig.detail.updateComplete;
    expect(missionThumb.hasAttribute('data-dragging')).toBe(true);
    // Release.
    missionTrack.dispatchEvent(makePointerEvent('pointerup', { clientX: 100 }));
    expect(missionThumb.hasAttribute('data-dragging')).toBe(false);
    teardownRig(rig);
  });

  it('simultaneous mouse on mission + touch on detail — each track manages its own drag', async () => {
    const rig = await mountDualScrubbers();
    // Open the detail variant.
    rig.clock.scrubTo(v1Jupiter.anchorEt);
    rig.director.update(v1Jupiter.anchorEt);
    await rig.mission.updateComplete;
    await rig.detail.updateComplete;
    expect(rig.detail.getAttribute('aria-hidden')).toBe('false');

    const missionTrack = rig.mission.shadowRoot!.querySelector('.track') as HTMLElement;
    const missionThumb = rig.mission.shadowRoot!.querySelector('.thumb') as HTMLElement;
    const detailTrack = rig.detail.shadowRoot!.querySelector('.track') as HTMLElement;
    const detailThumb = rig.detail.shadowRoot!.querySelector('.thumb') as HTMLElement;

    // Mouse pointerdown on mission thumb.
    missionTrack.dispatchEvent(
      makePointerEvent('pointerdown', {
        clientX: 200,
        target: missionThumb,
        pointerType: 'mouse',
        pointerId: 1,
      }),
    );
    expect(missionThumb.hasAttribute('data-dragging')).toBe(true);
    // Touch pointerdown on detail thumb with a different pointerId.
    detailTrack.dispatchEvent(
      makePointerEvent('pointerdown', {
        clientX: 500,
        target: detailThumb,
        pointerType: 'touch',
        pointerId: 2,
      }),
    );
    expect(detailThumb.hasAttribute('data-dragging')).toBe(true);
    // Both drags can be in-flight simultaneously — the attachPointerHandlers
    // capture is bound to the DOM element, not the variant.
    expect(missionThumb.hasAttribute('data-dragging')).toBe(true);
    expect(detailThumb.hasAttribute('data-dragging')).toBe(true);

    // Release both.
    missionTrack.dispatchEvent(
      makePointerEvent('pointerup', { clientX: 200, pointerId: 1 }),
    );
    detailTrack.dispatchEvent(
      makePointerEvent('pointerup', { clientX: 500, pointerId: 2 }),
    );
    expect(missionThumb.hasAttribute('data-dragging')).toBe(false);
    expect(detailThumb.hasAttribute('data-dragging')).toBe(false);
    teardownRig(rig);
  });

  it('mid-drag on detail with reverse-scrub through window start does NOT cancel the drag', async () => {
    const rig = await mountDualScrubbers();
    // Start inside the V1J window.
    rig.clock.scrubTo(v1Jupiter.anchorEt);
    rig.director.update(v1Jupiter.anchorEt);
    await rig.detail.updateComplete;
    const detailTrack = rig.detail.shadowRoot!.querySelector('.track') as HTMLElement;
    const detailThumb = rig.detail.shadowRoot!.querySelector('.thumb') as HTMLElement;
    // Begin drag on detail thumb.
    detailTrack.dispatchEvent(
      makePointerEvent('pointerdown', {
        clientX: 100,
        target: detailThumb,
      }),
    );
    expect(detailThumb.hasAttribute('data-dragging')).toBe(true);
    // Mid-drag the director re-enters via the reverse path (close-via-edge).
    rig.director.update(v1Jupiter.windowStartEt - ONE_DAY);
    await rig.detail.updateComplete;
    // Even though the detail variant slides closed in animation, the active
    // drag is still bound to the DOM element — data-dragging persists.
    expect(detailThumb.hasAttribute('data-dragging')).toBe(true);
    detailTrack.dispatchEvent(makePointerEvent('pointerup', { clientX: 100 }));
    expect(detailThumb.hasAttribute('data-dragging')).toBe(false);
    teardownRig(rig);
  });
});

// ---------------------------------------------------------------------------
// QA priority 4 — Shared URLSync throttle coalesce
// ---------------------------------------------------------------------------

describe('QA priority 4 — shared URLSync throttle (one coalesce, not two)', () => {
  const v1Jupiter = findChapterBySlug('v1-jupiter')!;

  let replaceCalls: Array<{ url: string }>;
  let urlSync: URLSync;

  beforeEach(() => {
    vi.useFakeTimers();
    replaceCalls = [];
    // Build a URLSync with an injected window stub so replaceState calls
    // are observable. The two scrubbers will share this single instance.
    const fakeWin = {
      location: { search: '', pathname: '/c/v1-jupiter', hash: '' },
      history: {
        replaceState: (_state: unknown, _title: string, url?: string | null) => {
          replaceCalls.push({ url: String(url ?? '') });
        },
        pushState: () => {},
      },
    };
    urlSync = new URLSync(fakeWin as unknown as ConstructorParameters<typeof URLSync>[0]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mission scrubTo + detail scrubTo within 250 ms produce ONE coalesced write per window', async () => {
    const rig = await mountDualScrubbers({ urlSync });
    // Open the detail variant.
    rig.clock.scrubTo(v1Jupiter.anchorEt);
    rig.director.update(v1Jupiter.anchorEt);
    await rig.detail.updateComplete;
    replaceCalls.length = 0;

    // Drag the mission scrubber — fires writeEtThrottled once.
    const missionTrack = rig.mission.shadowRoot!.querySelector('.track') as HTMLElement;
    const missionThumb = rig.mission.shadowRoot!.querySelector('.thumb') as HTMLElement;
    missionTrack.dispatchEvent(
      makePointerEvent('pointerdown', { clientX: 400, target: missionThumb }),
    );
    // Within the same throttle window (< 250 ms), drag the detail scrubber
    // — must coalesce into the SAME write window (leading-edge write fired
    // by the first call; subsequent calls update pendingEt only).
    const detailTrack = rig.detail.shadowRoot!.querySelector('.track') as HTMLElement;
    const detailThumb = rig.detail.shadowRoot!.querySelector('.thumb') as HTMLElement;
    vi.advanceTimersByTime(100);
    detailTrack.dispatchEvent(
      makePointerEvent('pointerdown', { clientX: 500, target: detailThumb }),
    );
    // After both drags, we expect:
    //   - Exactly ONE leading-edge replaceState write from the mission drag.
    //   - The detail drag's write is pending behind the same throttle timer.
    // The count is 1 BEFORE the window closes.
    expect(replaceCalls.length).toBe(1);
    // Advance to the end of the window — pending detail write fires.
    vi.advanceTimersByTime(URL_WRITEBACK_THROTTLE_MS);
    expect(replaceCalls.length).toBe(2);
    // Release.
    missionTrack.dispatchEvent(makePointerEvent('pointerup', { clientX: 400 }));
    detailTrack.dispatchEvent(makePointerEvent('pointerup', { clientX: 500 }));
    // pointerup fires writeEtImmediate — adds 2 more writes (one per
    // scrubber release). Total: 4 within the test span.
    expect(replaceCalls.length).toBe(4);
    teardownRig(rig);
  });

  it('both scrubbers reference the SAME URLSync instance (not per-variant)', async () => {
    const rig = await mountDualScrubbers({ urlSync });
    expect(rig.mission.urlSync).toBe(urlSync);
    expect(rig.detail.urlSync).toBe(urlSync);
    expect(rig.mission.urlSync).toBe(rig.detail.urlSync);
    teardownRig(rig);
  });
});

// ---------------------------------------------------------------------------
// QA priority 5 — aria-hidden flip synchronicity with [data-open]
// ---------------------------------------------------------------------------

describe('QA priority 5 — aria-hidden flips synchronously with slide-in (not at end of 400 ms)', () => {
  const v1Jupiter = findChapterBySlug('v1-jupiter')!;

  it('aria-hidden flips to "false" in the SAME synchronous tick as [data-open] is added (no 400 ms gap)', async () => {
    const rig = await mountDualScrubbers();
    // Start outside the V1J window.
    rig.clock.scrubTo(MISSION_START_ET);
    rig.director.update(MISSION_START_ET);
    await rig.detail.updateComplete;
    expect(rig.detail.getAttribute('aria-hidden')).toBe('true');
    expect(rig.detail.hasAttribute('data-open')).toBe(false);

    // Drive into the window. The slide-in CSS animates over 400 ms but the
    // aria-hidden attribute + data-open attribute must both flip
    // SYNCHRONOUSLY in the subscriber callback — assertive tech must NOT
    // see 400 ms of inaccessible-but-visible UI.
    rig.director.update(v1Jupiter.anchorEt);
    // Read attributes IMMEDIATELY — no `await` between director.update and
    // the assertion. handleDetailTransition writes both attributes
    // synchronously.
    expect(rig.detail.hasAttribute('data-open')).toBe(true);
    expect(rig.detail.getAttribute('aria-hidden')).toBe('false');
    teardownRig(rig);
  });

  it('aria-hidden flips to "true" SYNCHRONOUSLY on slide-out (not at end of 400 ms)', async () => {
    const rig = await mountDualScrubbers();
    rig.clock.scrubTo(v1Jupiter.anchorEt);
    rig.director.update(v1Jupiter.anchorEt);
    await rig.detail.updateComplete;
    expect(rig.detail.getAttribute('aria-hidden')).toBe('false');
    rig.director.update(v1Jupiter.windowEndEt + ONE_DAY);
    // Synchronous check — no `await`.
    expect(rig.detail.hasAttribute('data-open')).toBe(false);
    expect(rig.detail.getAttribute('aria-hidden')).toBe('true');
    teardownRig(rig);
  });

  it('aria-hidden seeded on mount BEFORE first render (no flash of inaccessible-but-visible)', async () => {
    // Cold-mount a detail scrubber whose director is already inside the
    // V1J window. The host MUST already carry the right aria-hidden value
    // by the time the first render lands.
    const clock = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    director.update(v1Jupiter.anchorEt);
    const detail = document.createElement(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    detail.variant = 'detail';
    detail.clockManager = clock;
    detail.chapterDirector = director;
    document.body.appendChild(detail);
    // Assert BEFORE awaiting updateComplete: connectedCallback runs first
    // and seeds aria-hidden = "false" synchronously.
    expect(detail.getAttribute('aria-hidden')).toBe('false');
    expect(detail.hasAttribute('data-open')).toBe(true);
    await detail.updateComplete;
    expect(detail.getAttribute('aria-hidden')).toBe('false');
    detail.remove();
    clock.dispose();
  });
});

// ---------------------------------------------------------------------------
// QA priority 6 — Mission scrubber highlight band positional alignment
// ---------------------------------------------------------------------------

describe('QA priority 6 — mission highlight band: absent in cruise, present + aligned during V1J', () => {
  const v1Jupiter = findChapterBySlug('v1-jupiter')!;

  it('cruise era: NO highlight band on mission scrubber', async () => {
    const rig = await mountDualScrubbers();
    rig.clock.scrubTo(MISSION_START_ET + 365 * ONE_DAY); // cruise
    rig.director.update(MISSION_START_ET + 365 * ONE_DAY);
    await rig.mission.updateComplete;
    expect(rig.mission.shadowRoot!.querySelector('.highlight-band')).toBeFalsy();
    teardownRig(rig);
  });

  it('V1J held: highlight band present AND positionally aligns with detail extent', async () => {
    const rig = await mountDualScrubbers();
    rig.clock.scrubTo(v1Jupiter.anchorEt);
    rig.director.update(v1Jupiter.anchorEt);
    await rig.mission.updateComplete;
    await rig.detail.updateComplete;
    const band = rig.mission.shadowRoot!.querySelector<HTMLElement>(
      '.highlight-band',
    );
    expect(band).toBeTruthy();

    // The detail scrubber's range is [windowStartEt, windowEndEt]. The
    // mission band's left/right percentages must encode the same window
    // within the mission span. Verify the math.
    const span = MISSION_END_ET - MISSION_START_ET;
    const expectedLeftPct =
      ((v1Jupiter.windowStartEt - MISSION_START_ET) / span) * 100;
    const expectedRightPct =
      (1 - (v1Jupiter.windowEndEt - MISSION_START_ET) / span) * 100;
    const actualLeftPct = parseFloat(band!.style.left);
    const actualRightPct = parseFloat(band!.style.right);
    expect(Math.abs(actualLeftPct - expectedLeftPct)).toBeLessThan(0.001);
    expect(Math.abs(actualRightPct - expectedRightPct)).toBeLessThan(0.001);

    // Detail scrubber's range MUST match the band's extent (window).
    expect(rig.detail.rangeStart).toBe(v1Jupiter.windowStartEt);
    expect(rig.detail.rangeEnd).toBe(v1Jupiter.windowEndEt);
    teardownRig(rig);
  });

  it('exiting V1J: highlight band disappears synchronously with detail scrubber close', async () => {
    const rig = await mountDualScrubbers();
    rig.clock.scrubTo(v1Jupiter.anchorEt);
    rig.director.update(v1Jupiter.anchorEt);
    await rig.mission.updateComplete;
    expect(rig.mission.shadowRoot!.querySelector('.highlight-band')).toBeTruthy();
    rig.clock.scrubTo(v1Jupiter.windowEndEt + ONE_DAY);
    rig.director.update(v1Jupiter.windowEndEt + ONE_DAY);
    await rig.mission.updateComplete;
    expect(rig.mission.shadowRoot!.querySelector('.highlight-band')).toBeFalsy();
    teardownRig(rig);
  });
});

// ---------------------------------------------------------------------------
// QA priority 7 — APG Slider primitive consumption (Rule 9) + lazy step
// ---------------------------------------------------------------------------

describe('QA priority 7 — Rule 9: createSliderKeyboardHandler consumption + lazy cadence step', () => {
  // Project convention: no vi.mock anywhere in the suite. Rule 9 source-
  // grep defense lives below; observable-behaviour defenses prove the
  // primitive is *being* called (any inline re-implementation would
  // diverge from the APG contract under at-the-boundary inputs).

  it('source grep — component imports createSliderKeyboardHandler from primitives', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/components/v-timeline-scrubber.ts'),
      'utf-8',
    );
    expect(src).toMatch(
      /import\s+\{\s*createSliderKeyboardHandler\s*\}\s+from\s+['"]\.\.\/primitives\/slider-keyboard['"]/,
    );
  });

  it('source grep — component does NOT inline-reimplement Home/End/Arrow keyboard logic (Rule 9 HIGH check)', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/components/v-timeline-scrubber.ts'),
      'utf-8',
    );
    // Lift the onKeyDown method body alone — from the arrow-property
    // assignment through to the closing brace of the arrow function (the
    // closing `};` sits at 4-space indent because it's a class member).
    // Any direct `e.key === 'Home'` / `'End'` / `'ArrowLeft'` /
    // `'ArrowRight'` string-literal comparison inside the component is an
    // inline-implementation violation per Rule 9.
    const onKeyDownBlock = src.match(
      /private onKeyDown\s*=\s*\(e:\s*KeyboardEvent\)[\s\S]*?^ {2}\};/m,
    );
    expect(onKeyDownBlock).toBeTruthy();
    const body = onKeyDownBlock?.[0] ?? '';
    // The component DOES branch on `e.key === 'Home'` / 'End' / 'ArrowLeft'
    // / 'ArrowRight' INSIDE the primitive (slider-keyboard.ts), not in the
    // component. Defense: zero such string literals appear inside onKeyDown.
    expect(body).not.toMatch(/e\.key\s*===\s*['"](?:Home|End|ArrowLeft|ArrowRight)['"]/);
    // Sanity: the body MUST call createSliderKeyboardHandler.
    expect(body).toMatch(/createSliderKeyboardHandler\(/);
  });

  it('lazy step recompute — handler is rebuilt per keystroke; tier responds to current cursor', async () => {
    // Construct the detail scrubber, drive cursor to anchor (10s tier),
    // press ArrowRight (10s step), then teleport cursor to anchor + 5d
    // (hourly tier), press ArrowRight (3600s step). The handler MUST NOT
    // snapshot the step at construction — both keystrokes must reflect
    // the current tier.
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const rig = await mountDualScrubbers();
    rig.clock.scrubTo(v1Jupiter.anchorEt);
    rig.director.update(v1Jupiter.anchorEt);
    await rig.detail.updateComplete;
    const thumb = rig.detail.shadowRoot!.querySelector('.thumb')!;

    const before1 = rig.detail.simEt;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(rig.detail.simEt - before1).toBe(10); // 10sec tier

    // Teleport cursor to 3 days past anchor (hourly tier — still inside
    // the Story-4.5 ±5d V1J window so the ArrowRight isn't clamped at the
    // right edge of the detail scrubber's range; >2 days from anchor so
    // the 1min tier doesn't fire). Story 4.4 used 5 days as the teleport
    // target when V1J held a ±30d placeholder window; Story 4.5 narrows
    // the window to ±5d, so 5d-from-anchor lands AT windowEndEt and the
    // ArrowRight gets clamped to zero. 3 days exercises the same tier.
    rig.clock.scrubTo(v1Jupiter.anchorEt + 3 * ONE_DAY);
    rig.director.update(v1Jupiter.anchorEt + 3 * ONE_DAY);
    await rig.detail.updateComplete;
    const before2 = rig.detail.simEt;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(rig.detail.simEt - before2).toBe(ONE_HOUR); // hourly tier
    teardownRig(rig);
  });

  it('lazy step is per-keystroke (successive ArrowRights crossing a tier boundary recompute step at each fire)', async () => {
    // Stand at anchor + 1h - 5 (just inside the 10sec tier). 3 successive
    // ArrowRights MUST recompute the step at EACH fire — the first
    // keystroke uses the 10s tier (cursor is inside ±1h), but the next
    // two keystrokes see a cursor PAST the ±1h boundary and therefore
    // use the 1min tier. Total expected delta: 10 + 60 + 60 = 130 s.
    //
    // The failure mode this test pins is a regression where the
    // component snapshots the cadence step at handler-construction time
    // (e.g. once per chapter change instead of once per keystroke) — in
    // which case the 2nd and 3rd ArrowRights would still be 10s each,
    // giving a delta of +30s. Receiving +130s is the canonical proof
    // that the helper is reconsulted on every keystroke.
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const rig = await mountDualScrubbers();
    const startEt = v1Jupiter.anchorEt + ONE_HOUR - 5;
    rig.clock.scrubTo(startEt);
    rig.director.update(startEt);
    await rig.detail.updateComplete;
    const thumb = rig.detail.shadowRoot!.querySelector('.thumb')!;
    for (let i = 0; i < 3; i += 1) {
      thumb.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    }
    // 10s (inside ±1h) + 60s (past boundary) + 60s (still past) = 130 s.
    expect(rig.detail.simEt - startEt).toBe(130);
    teardownRig(rig);
  });
});

// ---------------------------------------------------------------------------
// QA priority 8 — Rule 10 grep defense: declare + ctor-init only
// ---------------------------------------------------------------------------

describe('QA priority 8 — Rule 10: declare + ctor-init, no class-field initializers on reactive props', () => {
  const src = readFileSync(
    resolve(__dirname, '../src/components/v-timeline-scrubber.ts'),
    'utf-8',
  );

  it('source grep — rangeStart uses `declare rangeStart: number` form (no initializer)', () => {
    // Match a `declare rangeStart: number;` with NO `=` between the name
    // and the semicolon.
    expect(src).toMatch(/declare\s+rangeStart\s*:\s*number\s*;/);
    // Negative: a `rangeStart = ...` class-field initializer at module-level
    // indent (2 spaces, NOT inside a function body or constructor).
    expect(src).not.toMatch(/^\s{2}rangeStart\s*=\s*/m);
  });

  it('source grep — rangeEnd uses `declare rangeEnd: number` form (no initializer)', () => {
    expect(src).toMatch(/declare\s+rangeEnd\s*:\s*number\s*;/);
    expect(src).not.toMatch(/^\s{2}rangeEnd\s*=\s*/m);
  });

  it('source grep — variant uses `declare variant: ScrubberVariant` form (no initializer)', () => {
    expect(src).toMatch(/declare\s+variant\s*:\s*ScrubberVariant\s*;/);
    expect(src).not.toMatch(/^\s{2}variant\s*=\s*['"]mission['"]\s*;/m);
  });

  it('constructor body assigns the reactive properties (this.rangeStart / this.rangeEnd / this.variant)', () => {
    expect(src).toMatch(/this\.variant\s*=\s*['"]mission['"]/);
    expect(src).toMatch(/this\.rangeStart\s*=\s*MISSION_START_ET/);
    expect(src).toMatch(/this\.rangeEnd\s*=\s*MISSION_END_ET/);
  });

  it('static properties registration includes the new reactive props', () => {
    expect(src).toMatch(
      /static\s+(override\s+)?properties\s*=\s*\{[\s\S]*?rangeStart\s*:\s*\{[^}]*type\s*:\s*Number[^}]*attribute\s*:\s*['"]range-start['"][\s\S]*?\}/,
    );
    expect(src).toMatch(
      /static\s+(override\s+)?properties\s*=\s*\{[\s\S]*?rangeEnd\s*:\s*\{[^}]*type\s*:\s*Number[^}]*attribute\s*:\s*['"]range-end['"][\s\S]*?\}/,
    );
  });

  it('runtime defense — instance reactive properties go through Lit-generated accessors (set triggers requestUpdate)', async () => {
    const v1Jupiter = findChapterBySlug('v1-jupiter')!;
    const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    el.variant = 'detail';
    document.body.appendChild(el);
    await el.updateComplete;
    // Writing to rangeStart MUST trigger a Lit re-render (proves the
    // accessor is in place, not a shadowing class field).
    const requestUpdateSpy = vi.spyOn(el, 'requestUpdate');
    el.rangeStart = v1Jupiter.windowStartEt;
    el.rangeEnd = v1Jupiter.windowEndEt;
    expect(requestUpdateSpy).toHaveBeenCalled();
    el.remove();
  });
});
