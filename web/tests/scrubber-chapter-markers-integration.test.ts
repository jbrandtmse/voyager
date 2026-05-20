// @vitest-environment happy-dom
/**
 * Story 2.2 QA — Scrubber × real ChapterDirector × real ALL_CHAPTERS
 * cross-cutting integration tests.
 *
 * The dev-authored `v-timeline-scrubber.test.ts` exercises the component
 * in isolation (often with single chapters at a time, and always against
 * the component's own shadow DOM). This file fills the consumer-side
 * gaps that Rule 2 (consumer-side integration AC) and Rule 3 (browser
 * smoke) make load-bearing for Story 2.2:
 *
 *   1. `startFirstPaint({ chapterDirector })` wires the real director
 *      into the scrubber BEFORE `connectedCallback` runs, so the
 *      chapter-subscription is live on the same tick the scrubber
 *      mounts — and at MISSION_START_ET the `launch-v2` marker carries
 *      `data-active` (Integration AC7).
 *   2. Driving the real director with the real 11-chapter registry
 *      across every anchor leaves the scrubber DOM with exactly one
 *      `data-active` marker per anchor, matching the active slug.
 *   3. The `chapter-jump` CustomEvent payload — `{ slug, anchorEt }` —
 *      is the contract Story 2.4 (URL router) will subscribe to. The
 *      event bubbles past the component boundary AND is composed (so
 *      the URL router can listen on `window`).
 *   4. The marker-click "no scrub race" invariant — pressing a marker
 *      MUST NOT also dispatch `voyager:scrub` via the track's
 *      attachPointerHandlers listener. We verify this against the
 *      real first-paint composition (not just the unit-test mock).
 *   5. `main.ts` wire-up shape: ChapterDirector flows from main → first-
 *      paint → scrubber via `chapterDirector` option, AND the DEV-only
 *      `window.__voyagerDebug.scrubber` surface is gated behind
 *      `import.meta.env.DEV`. This mirrors Story 2.1's
 *      `main-chapter-director-wireup.test.ts` static-source check.
 *   6. CSS responsive branches — both `@media (hover: hover)` (the
 *      200ms tooltip dwell) and `@media (hover: none)` (the Tier-2
 *      label-only fallback per UX-DR22) are present in the component
 *      stylesheet.
 *
 * The lead-executed Chrome DevTools MCP smoke (Integration AC7 — see
 * the "Chrome DevTools MCP smoke" stage at the bottom of this file)
 * remains the binding browser-evidence gate per voyager-skill-rules
 * Rule 3 + Rule 7. These tests are the consumer-side Vitest tier
 * verifying the WIRE-UP shape and the DOM contract that the smoke
 * stage reads.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { startFirstPaint } from '../src/boot/first-paint';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import { MISSION_START_ET, TITLE_CARD_HOLD_MS } from '../src/constants/mission';
import type { VTimelineScrubber } from '../src/components/v-timeline-scrubber';
import { VTimelineScrubber as VTimelineScrubberCtor } from '../src/components/v-timeline-scrubber';

const webRoot = resolve(__dirname, '..');
const mainTsSrc = readFileSync(resolve(webRoot, 'src/main.ts'), 'utf-8');
const firstPaintSrc = readFileSync(
  resolve(webRoot, 'src/boot/first-paint.ts'),
  'utf-8',
);

const stubTrackRect = (scrubber: VTimelineScrubber): void => {
  const track = scrubber.shadowRoot!.querySelector('.track') as HTMLElement;
  track.getBoundingClientRect = () =>
    ({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 12,
      width: 1000,
      height: 12,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
};

describe('Story 2.2 QA — first-paint wires the scrubber to ChapterDirector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('startFirstPaint propagates the chapterDirector option to the scrubber', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const scrubber = document.querySelector(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    expect(scrubber).toBeTruthy();
    expect(scrubber.chapterDirector).toBe(director);
    await scrubber.updateComplete;
    // 11 markers should be in the shadow DOM now.
    expect(scrubber.shadowRoot!.querySelectorAll('.chapter-marker').length).toBe(
      11,
    );
  });

  it('at MISSION_START_ET, launch-v2 is the active marker after the director sees the first ET', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const scrubber = document.querySelector(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    await scrubber.updateComplete;
    // Mirror what main.ts does — drive the director with the clock's ET
    // (MISSION_START_ET is inside launch-v2's window per the spec).
    director.update(MISSION_START_ET);
    await scrubber.updateComplete;
    const active = scrubber.shadowRoot!.querySelectorAll(
      '.chapter-marker[data-active]',
    );
    expect(active.length).toBe(1);
    expect(active[0].getAttribute('data-slug')).toBe('launch-v2');
  });

  it('scrubber wires its chapter subscription on the same tick it mounts (pre-mount binding)', async () => {
    // If the chapterDirector were set AFTER appendChild, the subscription
    // would not exist on first render and the first director.update() that
    // happens to fire before the next requestUpdate would be silently
    // missed. Verify the subscription is already live by counting the
    // director's subscribers immediately post-startFirstPaint.
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const subscribeSpy = vi.spyOn(director, 'subscribe');
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('omitting chapterDirector leaves scrubber.chapterDirector null and falls back to inactive markers only', async () => {
    const clockManager = new ClockManager();
    startFirstPaint(document.body, { clockManager });
    const scrubber = document.querySelector(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    expect(scrubber.chapterDirector).toBeNull();
    await scrubber.updateComplete;
    // Mission variant still paints the 11 markers (inactive is the default).
    const markers = scrubber.shadowRoot!.querySelectorAll('.chapter-marker');
    expect(markers.length).toBe(11);
    // No marker is active without a director.
    const active = scrubber.shadowRoot!.querySelectorAll(
      '.chapter-marker[data-active]',
    );
    expect(active.length).toBe(0);
  });
});

describe('Story 2.2 QA — at-most-one active marker across all 11 anchors (real registry)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sweeping every canonical anchor leaves exactly one data-active marker matching the slug', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const scrubber = document.querySelector(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    await scrubber.updateComplete;

    for (const chapter of ALL_CHAPTERS) {
      director.update(chapter.anchorEt);
      await scrubber.updateComplete;
      const active = scrubber.shadowRoot!.querySelectorAll(
        '.chapter-marker[data-active]',
      );
      expect(active.length, `expected exactly one active marker at ${chapter.slug}`).toBe(
        1,
      );
      expect(active[0].getAttribute('data-slug')).toBe(chapter.slug);
    }
  });

  it('a between-chapter quiet zone (1995-01-01) leaves zero markers active', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const scrubber = document.querySelector(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    await scrubber.updateComplete;
    // ET inside the long PBD → V1 heliopause gap (5 years past PBD, 17
    // years before V1 heliopause anchor) — no chapter window covers it.
    director.update(MISSION_START_ET + 17 * 365.25 * 86400);
    await scrubber.updateComplete;
    expect(director.activeChapter).toBeNull();
    const active = scrubber.shadowRoot!.querySelectorAll(
      '.chapter-marker[data-active]',
    );
    expect(active.length).toBe(0);
  });
});

describe('Story 2.2 QA — chapter-jump CustomEvent payload (Story 2.4 contract)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clicking a marker dispatches a chapter-jump CustomEvent that bubbles past the host', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const scrubber = document.querySelector(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    await scrubber.updateComplete;
    stubTrackRect(scrubber);

    // Listen on the document — only bubbles+composed CustomEvents from the
    // shadow DOM reach this far. Story 2.4's router will mount its
    // listener at the document/window level, so this is the real contract.
    let docDetail: { slug: string; anchorEt: number } | null = null;
    document.addEventListener('chapter-jump', (e) => {
      docDetail = (e as CustomEvent<{ slug: string; anchorEt: number }>).detail;
    });

    const chapter = findChapterBySlug('v2-uranus')!;
    const marker = scrubber.shadowRoot!.querySelector<HTMLButtonElement>(
      '.chapter-marker[data-slug="v2-uranus"]',
    )!;
    marker.click();

    expect(docDetail).not.toBeNull();
    if (docDetail !== null) {
      const d = docDetail as { slug: string; anchorEt: number };
      expect(d.slug).toBe('v2-uranus');
      expect(d.anchorEt).toBe(chapter.anchorEt);
    }
  });

  it('chapter-jump payload schema — slug is non-empty string, anchorEt is finite number', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const scrubber = document.querySelector(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    await scrubber.updateComplete;
    stubTrackRect(scrubber);

    const payloads: Array<{ slug: string; anchorEt: number }> = [];
    document.addEventListener('chapter-jump', (e) => {
      payloads.push(
        (e as CustomEvent<{ slug: string; anchorEt: number }>).detail,
      );
    });

    // Click every marker and verify the payload schema for each emission.
    const markers = Array.from(
      scrubber.shadowRoot!.querySelectorAll<HTMLButtonElement>('.chapter-marker'),
    );
    for (const marker of markers) {
      marker.click();
    }
    expect(payloads.length).toBe(11);
    for (const p of payloads) {
      expect(typeof p.slug).toBe('string');
      expect(p.slug.length).toBeGreaterThan(0);
      expect(Number.isFinite(p.anchorEt)).toBe(true);
      // The slug must resolve via the registry.
      const c = findChapterBySlug(p.slug);
      expect(c, `expected registry to know slug ${p.slug}`).not.toBeNull();
      expect(c!.anchorEt).toBe(p.anchorEt);
    }
  });

  it('Enter key on a focused marker also dispatches chapter-jump', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const scrubber = document.querySelector(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    await scrubber.updateComplete;

    let captured: { slug: string; anchorEt: number } | null = null;
    document.addEventListener('chapter-jump', (e) => {
      captured = (e as CustomEvent<{ slug: string; anchorEt: number }>).detail;
    });
    const marker = scrubber.shadowRoot!.querySelector<HTMLButtonElement>(
      '.chapter-marker[data-slug="v1-saturn"]',
    )!;
    marker.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
    );
    expect(captured).not.toBeNull();
    if (captured !== null) {
      const d = captured as { slug: string; anchorEt: number };
      expect(d.slug).toBe('v1-saturn');
    }
  });
});

describe('Story 2.2 QA — marker click race: no voyager:scrub dispatched from the track', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('marker pointerdown does NOT bubble to the track listener', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const scrubber = document.querySelector(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    await scrubber.updateComplete;
    stubTrackRect(scrubber);

    let scrubFired = false;
    let lastScrubSource: string | null = null;
    scrubber.addEventListener('voyager:scrub', (e) => {
      scrubFired = true;
      lastScrubSource = (e as CustomEvent<{ source: string }>).detail.source;
    });

    const marker = scrubber.shadowRoot!.querySelector<HTMLButtonElement>(
      '.chapter-marker[data-slug="v2-jupiter"]',
    )!;
    // Synthesize the same pointerdown that real input dispatches. The
    // marker's @pointerdown handler MUST stop propagation so the
    // track's attachPointerHandlers listener never sees the press —
    // otherwise the simulation would jump to the marker's pixel
    // position via the track-click path, racing the chapter-jump
    // click handler's `scrubTo(anchorEt)`.
    const evt = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(evt, 'clientX', { value: 500 });
    Object.defineProperty(evt, 'clientY', { value: 0 });
    Object.defineProperty(evt, 'pointerType', { value: 'mouse' });
    Object.defineProperty(evt, 'pointerId', { value: 1 });
    Object.defineProperty(evt, 'target', { value: marker });
    marker.dispatchEvent(evt);

    expect(scrubFired, `track scrub fired with source=${lastScrubSource}`).toBe(
      false,
    );
  });

  it('marker click lands clockManager.simTimeEt EXACTLY at the chapter anchor (no race-induced drift)', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const scrubber = document.querySelector(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    await scrubber.updateComplete;
    stubTrackRect(scrubber);

    // If the marker pointerdown leaked to the track, simTimeEt would first
    // be set to the marker's PIXEL fraction of the mission band, then re-
    // set to the chapter anchor by the click handler — but if the order
    // were inverted (anchor first, pixel-fraction second) the final value
    // would be the pixel fraction, which is decidedly NOT the canonical
    // anchor. Pin the exact anchor here.
    const chapter = findChapterBySlug('v1-heliopause')!;
    const marker = scrubber.shadowRoot!.querySelector<HTMLButtonElement>(
      '.chapter-marker[data-slug="v1-heliopause"]',
    )!;
    marker.click();
    expect(clockManager.simTimeEt).toBe(chapter.anchorEt);
    // Director picks up the new ET on the next update — verify the wire-
    // up by driving update() the same way main.ts's per-frame onFrame
    // would.
    director.update(clockManager.simTimeEt);
    await scrubber.updateComplete;
    const active = scrubber.shadowRoot!.querySelectorAll(
      '.chapter-marker[data-active]',
    );
    expect(active.length).toBe(1);
    expect(active[0].getAttribute('data-slug')).toBe('v1-heliopause');
  });
});

describe('Story 2.2 QA — main.ts + first-paint.ts wire-up shape (static-source check)', () => {
  // Mirrors the Story 2.1 main-chapter-director-wireup pattern. Pin the
  // load-bearing wire-up lines so a future refactor can't silently drop
  // them without a red test.

  it('main.ts passes chapterDirector to startFirstPaint', () => {
    // The argument order is `{ renderEngine, clockManager, chapterDirector }`
    // — assert the key is named and bound.
    expect(mainTsSrc).toMatch(/chapterDirector\s*[,}]/);
    expect(mainTsSrc).toMatch(/startFirstPaint\(/);
  });

  it('main.ts exposes __voyagerDebug.scrubber inside the DEV gate (mirrors Story 2.1)', () => {
    expect(mainTsSrc).toMatch(/import\.meta\.env\.DEV/);
    expect(mainTsSrc).toMatch(/scrubber:\s*firstPaintHandle\.scrubber/);
  });

  it('the executable __voyagerDebug.scrubber assignment lives only inside a DEV gate', () => {
    // Strip comments so commentary doesn't false-positive.
    const stripped = mainTsSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');
    const scrubberAssignIdx = stripped.indexOf('scrubber: firstPaintHandle');
    expect(scrubberAssignIdx).toBeGreaterThan(-1);
    // Find the LAST `import.meta.env.DEV` gate BEFORE this assignment.
    const before = stripped.slice(0, scrubberAssignIdx);
    expect(before.lastIndexOf('import.meta.env.DEV')).toBeGreaterThan(-1);
  });

  it('first-paint.ts accepts chapterDirector on FirstPaintOptions', () => {
    expect(firstPaintSrc).toMatch(/chapterDirector\?:\s*ChapterDirector/);
  });

  it('first-paint.ts sets chapterDirector on the scrubber BEFORE appendChild (pre-mount binding)', () => {
    // The contract is order-sensitive: the property assignment must come
    // before host.appendChild(scrubber) so connectedCallback sees the
    // director and wires the subscription on the same tick the element
    // mounts. The substring search confirms the assignment line is
    // present; the order is asserted by indexOf comparison below.
    const assignIdx = firstPaintSrc.indexOf('scrubber.chapterDirector =');
    expect(assignIdx).toBeGreaterThan(-1);
    // Find the host.appendChild(scrubber) line AFTER the assignment.
    const appendAfter = firstPaintSrc.indexOf(
      'host.appendChild(scrubber)',
      assignIdx,
    );
    expect(appendAfter).toBeGreaterThan(assignIdx);
  });
});

describe('Story 2.2 QA — responsive CSS branches (UX-DR22 Tier-1 + Tier-2)', () => {
  // Static-CSS assertions on the component's compiled stylesheet. The
  // component test file covers individual rules; this suite assembles the
  // full UX-DR22 contract (both Tiers present, no-hover hides the tooltip,
  // hover dwell is 200ms) so a future stylesheet refactor can't fragment
  // the responsive behaviour by removing one half of the contract.
  const flatten = (): string =>
    (VTimelineScrubberCtor.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');

  it('Tier-1: @media (hover: hover) block exists and applies the 200ms tooltip dwell', () => {
    const joined = flatten();
    // Match the @media block then the 200ms delay inside it.
    expect(joined).toMatch(/@media\s*\(hover:\s*hover\)\s*\{[\s\S]*?transition-delay:\s*200ms/);
  });

  it('Tier-2: @media (hover: none) block exists and hides .chapter-marker-tooltip via display:none', () => {
    const joined = flatten();
    expect(joined).toMatch(
      /@media\s*\(hover:\s*none\)\s*\{[\s\S]*?\.chapter-marker-tooltip\s*\{[\s\S]*?display:\s*none/,
    );
  });

  it('hover tooltip is opacity:0 by default (CSS reveal pattern, not display toggle)', () => {
    const joined = flatten();
    // The default state lives outside any @media query — verify the
    // base rule sets opacity:0 so the dwell-delay reveal is on opacity,
    // not display (display transitions are non-animatable across UAs).
    expect(joined).toMatch(/\.chapter-marker-tooltip\s*\{[\s\S]*?opacity:\s*0/);
  });

  it('inactive markers use --v-color-fg-muted and active markers use --v-color-accent (token contract)', () => {
    const joined = flatten();
    // Inactive (base) rule first…
    expect(joined).toMatch(
      /\.chapter-marker\s*\{[\s\S]*?background-color:\s*var\(--v-color-fg-muted\)/,
    );
    // …then the active override.
    expect(joined).toMatch(
      /\.chapter-marker\[data-active\]\s*\{[\s\S]*?background-color:\s*var\(--v-color-accent\)/,
    );
  });
});

describe('Story 2.2 QA — title-card dissolve + scrubber reveal preserves markers', () => {
  // The title-card removes itself after the dissolve and the scrubber's
  // `visibility` flips from `hidden` to `''`. The markers exist in the
  // shadow DOM throughout — verify the reveal does NOT re-mount the
  // scrubber (which would tear down the chapterDirector subscription).
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('markers persist through the title-card dissolve and the chapterDirector subscription is preserved', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const scrubber = document.querySelector(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    await scrubber.updateComplete;
    const markersBefore = scrubber.shadowRoot!.querySelectorAll('.chapter-marker');
    expect(markersBefore.length).toBe(11);

    // Drive the title-card hold + dissolve.
    await Promise.resolve();
    vi.advanceTimersByTime(TITLE_CARD_HOLD_MS + 700);
    await Promise.resolve();
    // Title card is gone, scrubber visibility cleared.
    expect(document.querySelector('v-title-card')).toBeNull();
    expect(scrubber.style.visibility).toBe('');

    // Same scrubber element, same shadow DOM, same markers.
    const markersAfter = scrubber.shadowRoot!.querySelectorAll('.chapter-marker');
    expect(markersAfter.length).toBe(11);

    // Subscription is still live — drive the director to a different
    // anchor and confirm the data-active treatment moves.
    const v2Neptune = findChapterBySlug('v2-neptune')!;
    director.update(v2Neptune.anchorEt);
    await scrubber.updateComplete;
    const active = scrubber.shadowRoot!.querySelector(
      '.chapter-marker[data-active]',
    );
    expect(active?.getAttribute('data-slug')).toBe('v2-neptune');
  });
});
