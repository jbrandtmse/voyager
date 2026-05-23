// @vitest-environment happy-dom
//
// Story 4.10 — Defense file for the 8-bug sweep filed during the
// 2026-05-23 manual completed-story walkthrough.
//
// One `describe` per bug, in the order BUG-001 .. BUG-008. Each block:
//   - For STILL_ACTIVE bugs (BUG-002, BUG-003, BUG-006, BUG-008):
//     a test that fails BEFORE the fix and passes AFTER. Specific enough
//     that a future regression of the exact bug fails this test, not a
//     generic "feature works."
//   - For ALREADY_FIXED bugs (BUG-001, BUG-004): a smoke that pins the
//     fixed contract so it can't silently regress.
//   - For MISFILED bugs (BUG-005, BUG-007): a contract-pin verifying the
//     CANONICAL `/c/<slug>` URL shape (per ADR-0001 + docs/url-contract.md).
//
// File path is pinned by the story's AC4 — the existence of this single
// file represents the closure batch; a future story re-introducing any
// of these bugs fails this single file.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { VHud } from '../src/components/v-hud';
import { VHudDistance } from '../src/components/v-hud-distance';
import { VHudChapterTitle } from '../src/components/v-hud-chapter-title';
import { VHelpOverlay } from '../src/components/v-help-overlay';
import { VTimelineScrubber } from '../src/components/v-timeline-scrubber';
import { VSpeedMultiplier } from '../src/components/v-speed-multiplier';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { etFromIso } from '../src/math/et-conversions';
import { KM_PER_AU } from '../src/math/constants';
import { worldVec3 } from '../src/types/branded';
import type { WorldVec3 } from '../src/types/branded';
import type { EphemerisService } from '../src/services/ephemeris-service';
import type { ChapterSpec } from '../src/types/chapter';
import {
  defaultFramingFallback,
  CRUISE_DEFAULT_DISTANCE_KM,
} from '../src/render/voyager-camera-controller';
import { Vector3 } from 'three';

// ─── Helpers ────────────────────────────────────────────────────────

const stubEphemeris = (
  v1Au: number | null,
  v2Au: number | null,
): EphemerisService =>
  ({
    getPosition: (_et: number, naifId: number): WorldVec3 | null => {
      if (naifId === -31)
        return v1Au === null ? null : worldVec3(v1Au * KM_PER_AU, 0, 0);
      if (naifId === -32)
        return v2Au === null ? null : worldVec3(v2Au * KM_PER_AU, 0, 0);
      return null;
    },
  }) as unknown as EphemerisService;

const makeChapter = (overrides: Partial<ChapterSpec>): ChapterSpec =>
  ({
    slug: 'v1-jupiter',
    name: 'Voyager 1 — Jupiter',
    markerLabel: 'V1J',
    anchorEt: -657244449.816,
    windowStartEt: -657417249.816,
    windowEndEt: -657071649.816,
    spacecraft: 1,
    ogDescription: 'Voyager 1 Jupiter encounter',
    // `targetBody` (Jupiter barycenter = 5) is required for the scrubber's
    // `isEncounterChapter()` gate (slug pattern + targetBody in the
    // gas-giant set). Without it the detail-variant treats the chapter as
    // non-encounter and `activeDetailChapter` stays null.
    targetBody: 5,
    ...overrides,
  }) as ChapterSpec;

const flushUpdates = async (...elements: ReadonlyArray<HTMLElement>): Promise<void> => {
  for (const el of elements) {
    const anyEl = el as HTMLElement & { updateComplete?: Promise<unknown> };
    if (anyEl.updateComplete !== undefined) {
      await anyEl.updateComplete;
    }
  }
};

const readSrc = (relPath: string): string =>
  readFileSync(resolve(__dirname, '..', relPath), 'utf-8');

// ─── BUG-001 — detail scrubber aria-label (ALREADY_FIXED by Story 4.4) ─────

describe('BUG-001 defense — detail scrubber aria-label has no duplicate "encounter"', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (typeof customElements !== 'undefined' && !customElements.get('v-timeline-scrubber')) {
      customElements.define('v-timeline-scrubber', VTimelineScrubber);
    }
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('detail variant aria-label with an active encounter chapter uses the name ONCE (no "Encounter encounter timeline" duplicate)', async () => {
    const clock = new ClockManager();
    const chapter = makeChapter({});
    clock.scrubTo(chapter.anchorEt);
    const director = new ChapterDirector([chapter]);
    director.update(chapter.anchorEt); // held

    const scrubber = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    scrubber.variant = 'detail';
    scrubber.clockManager = clock;
    scrubber.chapterDirector = director;
    document.body.appendChild(scrubber);
    await flushUpdates(scrubber);

    const slider = scrubber.shadowRoot?.querySelector<HTMLElement>('[role="slider"]');
    const label = slider?.getAttribute('aria-label') ?? '';

    // Whatever the label is, the word "encounter" MUST NOT appear twice in a row.
    expect(label.toLowerCase()).not.toMatch(/encounter\s+encounter/);
    // And it MUST contain the chapter name once.
    expect(label).toContain(chapter.name);
  });

  it('detail variant fallback (no active chapter) emits "Encounter timeline" — never the duplicated "Encounter encounter timeline"', async () => {
    const clock = new ClockManager();
    clock.scrubTo(0);
    const scrubber = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
    scrubber.variant = 'detail';
    scrubber.clockManager = clock;
    // Intentionally NO chapterDirector — exercises the latent fallback
    // path that previously yielded "Encounter encounter timeline".
    document.body.appendChild(scrubber);
    await flushUpdates(scrubber);

    const slider = scrubber.shadowRoot?.querySelector<HTMLElement>('[role="slider"]');
    const label = slider?.getAttribute('aria-label') ?? '';

    expect(label.toLowerCase()).not.toMatch(/encounter\s+encounter/);
    expect(label).toBe('Encounter timeline');
  });
});

// ─── BUG-002 — HUD distance wired to EphemerisService (STILL_ACTIVE → FIXED) ─

describe('BUG-002 defense — <v-hud-distance> renders numeric AU when EphemerisService is set post-mount', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('post-mount EphemerisService assignment on <v-hud> propagates to child via tick() so distance is numeric not "— AU"', async () => {
    const clock = new ClockManager();
    clock.scrubTo(etFromIso('1980-01-01T00:00:00Z'));

    const hud = document.createElement('v-hud') as VHud;
    hud.clockManager = clock;
    document.body.appendChild(hud);
    await flushUpdates(hud);

    // Mirror the production path: EphemerisService is assigned AFTER the HUD
    // has mounted (post-manifest-load). Before the BUG-002 fix this never
    // propagated to the child because `updated()` only fires for reactive-
    // property changes and `ephemerisService` is a plain class field.
    hud.ephemerisService = stubEphemeris(6.6, 5.7);

    // Drive one tick — this is the path that fixes the bug.
    hud.tick(clock.simTimeEt);
    await flushUpdates(hud);

    const child = hud.shadowRoot?.querySelector('v-hud-distance') as VHudDistance;
    expect(child).not.toBeNull();
    // The child should now have the service reference.
    expect(child.ephemerisService).not.toBeNull();

    const values = Array.from(
      child.shadowRoot?.querySelectorAll<HTMLElement>('.value') ?? [],
    ).map((el) => el.textContent ?? '');
    expect(values).toHaveLength(2);
    // Both rows must render numeric AU (NOT "— AU").
    expect(values[0]).toMatch(/\d/);
    expect(values[1]).toMatch(/\d/);
    expect(values[0]).not.toBe('— AU');
    expect(values[1]).not.toBe('— AU');
  });
});

// ─── BUG-003 — cruise camera fallback (STILL_ACTIVE → FIXED) ─────

describe('BUG-003 defense — cruise default framing returns a non-zero heliocentric vantage', () => {
  it('defaultFramingFallback with null activeTarget returns a camera position ~10 AU from origin (cruise default)', () => {
    const framing = defaultFramingFallback(null);
    expect(framing).not.toBeNull();
    const pos = framing!.position;
    const magnitudeKm = Math.hypot(pos.x, pos.y, pos.z);
    // The fallback uses CRUISE_DEFAULT_DISTANCE_KM (10 AU) — pin the value
    // so a future refactor that accidentally returns the origin (0,0,0)
    // fails this test, not the smoke.
    expect(magnitudeKm).toBeGreaterThan(0);
    expect(magnitudeKm).toBeCloseTo(CRUISE_DEFAULT_DISTANCE_KM, -3);
    expect(magnitudeKm / KM_PER_AU).toBeCloseTo(10, 1);
  });

  it('main.ts cold-load replay calls applyDefaultFraming even when activeChapter is null (BUG-003 grep)', () => {
    // The fix lives in main.ts as a branch that fires `applyDefaultFraming`
    // when initialActiveChapter === null. Grep the source so a future
    // refactor that drops the cruise branch fails this defense test.
    const src = readSrc('src/main.ts');
    // The fix block contains a comment marker AND must call
    // applyDefaultFraming inside an `initialActiveChapter === null` branch.
    expect(src).toContain('BUG-003');
    // Branch shape: when initialActiveChapter is null, applyDefaultFraming
    // is still invoked. A grep that pairs the null check with the call.
    expect(src).toMatch(
      /initialActiveChapter\s*===\s*null[\s\S]*?applyDefaultFraming\(\{\s*animated:\s*false\s*\}\)/,
    );
  });
});

// ─── BUG-004 — speed-multiplier aria-valuetext mojibake (ALREADY_FIXED) ─────

describe('BUG-004 defense — speed-multiplier aria-valuetext is clean Unicode (no mojibake)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (typeof customElements !== 'undefined' && !customElements.get('v-speed-multiplier')) {
      customElements.define('v-speed-multiplier', VSpeedMultiplier);
    }
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('aria-valuetext at the default speed contains clean × (U+00D7) and — (U+2014), never the mojibake byte sequence', async () => {
    const clock = new ClockManager();
    clock.scrubTo(etFromIso('1977-08-20T00:00:00Z'));

    const slider = document.createElement('v-speed-multiplier') as VSpeedMultiplier;
    slider.clockManager = clock;
    document.body.appendChild(slider);
    await flushUpdates(slider);

    const role = slider.shadowRoot?.querySelector<HTMLElement>('[role="slider"]');
    const valuetext = role?.getAttribute('aria-valuetext') ?? '';

    // Must include the genuine multiplication sign (U+00D7) and em-dash
    // (U+2014) — pin both code points exactly.
    expect(valuetext).toMatch(/×/);
    expect(valuetext).toMatch(/—/);
    // The mojibake pattern was "1Ã â 1 sec/sec" (Ã = U+00C3, â = U+00E2).
    // Either of those characters in the visible-output context is the
    // bug; pin against both individually.
    expect(valuetext).not.toMatch(/Ã/);
    expect(valuetext).not.toMatch(/â/);
  });
});

// ─── BUG-005 — chapter slug URL contract (MISFILED) ─────

describe('BUG-005 defense — canonical chapter URL contract is `/c/<slug>` not `/<slug>`', () => {
  it('docs/url-contract.md pins `/c/<chapter-slug>` as the canonical chapter route shape', () => {
    const src = readFileSync(resolve(__dirname, '..', '..', 'docs', 'url-contract.md'), 'utf-8');
    // The canonical contract has the `/c/<slug>` shape; if a future PR
    // accidentally switches the docs to bare `/<slug>` (the BUG-005
    // premise), this defense fails.
    expect(src).toMatch(/\/c\/<chapter-slug>/);
    // Negative: bare slug-only example shape MUST NOT appear as a row
    // labelled "Chapter route" in the route shapes table.
    expect(src).not.toMatch(/^\s*\|\s*`\/<chapter-slug>`\s*\|/m);
  });

  it('url-sync CHAPTER_PATH_PATTERN matches `/c/<slug>` but not bare `/<slug>`', () => {
    const src = readSrc('src/services/url-sync.ts');
    // The pattern is `/^\/c\/([^/?#]+)\/?$/` — pin it.
    expect(src).toMatch(/\/\^\\\/c\\\/\(\[\^\/\?#\]\+\)\\\/\?\$\//);
  });
});

// ─── BUG-006 — HUD chapter title wired to ChapterDirector (STILL_ACTIVE → FIXED) ─

describe('BUG-006 defense — <v-hud-chapter-title> renders chapter name when a chapter is active', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('post-mount director assignment + held chapter populates the <h2> with chapter.name (not empty)', async () => {
    const chapter = makeChapter({});
    const director = new ChapterDirector([chapter]);
    // Drive a single update at the chapter's anchor to fire the
    // out → entering → held cascade for this chapter.
    director.update(chapter.anchorEt);

    const hud = document.createElement('v-hud') as VHud;
    document.body.appendChild(hud);
    await flushUpdates(hud);

    // Mirror the production path: assign director AFTER mount + tick.
    hud.chapterDirector = director;
    hud.tick(chapter.anchorEt);
    await flushUpdates(hud);

    const title = hud.shadowRoot?.querySelector('v-hud-chapter-title') as VHudChapterTitle;
    expect(title).not.toBeNull();
    // The director reference must propagate.
    expect(title.chapterDirector).toBe(director);
    // Seed from active chapter must have populated the name.
    expect(title.displayedName).toBe(chapter.name);
    expect(title.displayedSlug).toBe(chapter.slug);

    const h2 = title.shadowRoot?.querySelector('h2');
    expect(h2?.textContent ?? '').toBe(chapter.name);
    // h2 must NOT be empty — the original bug rendered `<h2></h2>`.
    expect((h2?.textContent ?? '').length).toBeGreaterThan(0);
  });

  it('<v-hud-chapter-title> clears the heading when the chapter exits held (from === held transition)', async () => {
    const chapter = makeChapter({
      windowStartEt: -1000,
      windowEndEt: 1000,
      anchorEt: 0,
    });
    const director = new ChapterDirector([chapter]);
    director.update(0); // entering → held
    const title = document.createElement('v-hud-chapter-title') as VHudChapterTitle;
    title.chapterDirector = director;
    document.body.appendChild(title);
    await flushUpdates(title);
    expect(title.displayedName).toBe(chapter.name);

    // Now scrub past the window to fire held → exiting → passed.
    director.update(2000);
    await flushUpdates(title);
    expect(title.displayedName).toBe('');
    expect(title.displayedSlug).toBeNull();
  });
});

// ─── BUG-007 — About page URL format (MISFILED) ─────

describe('BUG-007 defense — About page documents the canonical `/c/<slug>?embed=true` URL', () => {
  it('v-about-page references the `/c/<slug>` form in any embed-related copy', () => {
    const src = readSrc('src/components/v-about-page.ts');
    // The About page documents `/c/<slug>?embed=true` — pin the prefix so
    // a future PR that accidentally drops the `/c/` prefix (matching the
    // BUG-007 premise) regresses this test.
    expect(src).toMatch(/\/c\/[a-z0-9-]+\?embed=true/);
    // Negative: no bare-slug embed example should appear as a documented URL.
    // We allow the literal sequence `<chapter-slug>` only after `/c/`.
    expect(src).not.toMatch(/[^\/c]\/v[12]-[a-z]+\?embed=true/);
  });
});

// ─── BUG-008 — help overlay R-key entry (STILL_ACTIVE → FIXED) ─────

describe('BUG-008 defense — help overlay documents the R-key restore-default-camera shortcut', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (typeof customElements !== 'undefined' && !customElements.get('v-help-overlay')) {
      customElements.define('v-help-overlay', VHelpOverlay);
    }
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opened help overlay renders an `R` kbd entry under the Display section paired with restore/default text', async () => {
    const overlay = document.createElement('v-help-overlay') as VHelpOverlay;
    document.body.appendChild(overlay);
    await flushUpdates(overlay);
    overlay.togglePanel(false);
    await flushUpdates(overlay);

    const root = overlay.shadowRoot!;
    // Find an `R` kbd element.
    const rKbd = Array.from(root.querySelectorAll('kbd')).find(
      (k) => (k.textContent ?? '').trim() === 'R',
    );
    expect(rKbd).toBeDefined();

    // The `R` entry must sit inside a list item whose description
    // mentions "Restore" / "default" / "camera" so the affordance
    // discovery is unambiguous.
    const li = rKbd!.closest('.shortcut');
    expect(li).not.toBeNull();
    const desc = li!.querySelector('.shortcut-desc')?.textContent ?? '';
    expect(desc.toLowerCase()).toMatch(/restore|default|camera/);

    // The entry must also live under the Display section (or Navigation —
    // story leaves room for either). Walk up to the parent section and
    // check the heading.
    const section = li!.closest('.section');
    const heading = section?.querySelector('.section-heading')?.textContent ?? '';
    expect(['Display', 'Navigation']).toContain(heading);
  });
});
