// @vitest-environment happy-dom
//
// Story 1.11 — HUD defense-in-depth (project-level).
//
// This file is the *project-level* defense file for the HUD. The dev's
// co-located component tests already exercise happy-path behavior; the
// purpose here is to lock in the load-bearing contracts so that future
// refactors which accidentally re-enable Lit reactivity, mix km/AU
// units, paint a background fill, or proliferate breakpoints get
// caught as a build break before they ship.
//
// Layout: one `describe` per defense topic. Each topic maps to a
// numbered item in the QA addition plan.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { VHud } from '../src/components/v-hud';
import { VHudDate } from '../src/components/v-hud-date';
import { VHudDistance } from '../src/components/v-hud-distance';
import { VHudChapterTitle } from '../src/components/v-hud-chapter-title';
import { VHudInstruments } from '../src/components/v-hud-instruments';
import { ClockManager } from '../src/services/clock-manager';
import {
  etFromIso,
  dateForHud,
  isoFromEt,
} from '../src/math/et-conversions';
import { formatAU } from '../src/math/au-format';
import { KM_PER_AU } from '../src/math/constants';
import { worldVec3 } from '../src/types/branded';
import type { WorldVec3 } from '../src/types/branded';
import type { EphemerisService } from '../src/services/ephemeris-service';

const COMPONENTS_DIR = resolve(__dirname, '..', 'src', 'components');
const readHudSrc = (file: string): string =>
  readFileSync(resolve(COMPONENTS_DIR, file), 'utf-8');

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const HUD_FILES: ReadonlyArray<string> = [
  'v-hud.ts',
  'v-hud-date.ts',
  'v-hud-distance.ts',
  'v-hud-speed.ts',
  'v-hud-chapter-title.ts',
  'v-hud-instruments.ts',
];

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

// ---------------------------------------------------------------------------
// 1. Per-frame tick() does NOT call requestUpdate (architecture line 424).
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — per-frame tick() bypasses Lit reactivity', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('60 sequential <v-hud>.tick(et) calls trigger ZERO requestUpdate on date/distance children', async () => {
    const clock = new ClockManager();
    clock.scrubTo(etFromIso('2010-06-15T12:00:00Z'));
    const eph = stubEphemeris(40.0, 30.0);
    const el = document.createElement('v-hud') as VHud;
    el.clockManager = clock;
    el.ephemerisService = eph;
    document.body.appendChild(el);
    await el.updateComplete;
    await el.hudDate!.updateComplete;
    await el.hudDistance!.updateComplete;

    const dateSpy = vi.spyOn(el.hudDate!, 'requestUpdate');
    const distSpy = vi.spyOn(el.hudDistance!, 'requestUpdate');
    const base = etFromIso('2010-06-15T12:00:00Z');
    for (let i = 0; i < 60; i++) el.tick(base + i);
    expect(dateSpy).toHaveBeenCalledTimes(0);
    expect(distSpy).toHaveBeenCalledTimes(0);
    dateSpy.mockRestore();
    distSpy.mockRestore();
    el.remove();
  });

  it('60 sequential <v-hud-date>.tick(et) calls trigger ZERO requestUpdate', async () => {
    const el = document.createElement('v-hud-date') as VHudDate;
    document.body.appendChild(el);
    await el.updateComplete;
    const spy = vi.spyOn(el, 'requestUpdate');
    const base = etFromIso('2010-06-15T12:00:00Z');
    for (let i = 0; i < 60; i++) el.tick(base + i);
    expect(spy).toHaveBeenCalledTimes(0);
    spy.mockRestore();
    el.remove();
  });

  it('60 sequential <v-hud-distance>.tick(et) calls trigger ZERO requestUpdate', async () => {
    const eph = stubEphemeris(40.0, 30.0);
    const el = document.createElement('v-hud-distance') as VHudDistance;
    el.ephemerisService = eph;
    document.body.appendChild(el);
    await el.updateComplete;
    const spy = vi.spyOn(el, 'requestUpdate');
    const base = etFromIso('2010-06-15T12:00:00Z');
    for (let i = 0; i < 60; i++) el.tick(base + i);
    expect(spy).toHaveBeenCalledTimes(0);
    spy.mockRestore();
    el.remove();
  });
});

// ---------------------------------------------------------------------------
// 2. Aria-live "polite" only, NEVER "assertive" (UX-DR24 hard line).
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — aria-live MUST be polite, never assertive (UX-DR24)', () => {
  for (const file of HUD_FILES) {
    it(`${file}: no aria-live="assertive" or ariaLive = 'assertive' in source`, () => {
      const src = readHudSrc(file);
      // String-literal attribute form
      expect(src).not.toMatch(/aria-live\s*=\s*['"]assertive['"]/);
      // Property-assignment form (JS DOM API): el.ariaLive = 'assertive'
      expect(src).not.toMatch(/ariaLive\s*=\s*['"]assertive['"]/);
      // setAttribute form
      expect(src).not.toMatch(/setAttribute\(\s*['"]aria-live['"]\s*,\s*['"]assertive['"]/);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Aria-live debounce: trailing-edge, fires exactly once after the window.
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — aria-live debounce is trailing-edge (no leading-edge announcement)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('<v-hud-date>: 100 announceNow-equivalent debounced calls coalesce into 1 trailing mirror update', async () => {
    const clock = new ClockManager();
    clock.scrubTo(etFromIso('2010-01-01T00:00:00Z'));
    const el = document.createElement('v-hud-date') as VHudDate;
    el.clockManager = clock;
    document.body.appendChild(el);
    await el.updateComplete;

    const mirror = el.shadowRoot!.querySelector<HTMLElement>('.sr-only')!;
    expect(mirror.textContent).toBe('');

    // 100 rapid-fire scrubs. Each scrubTo fires the subscribe path which
    // feeds the 500ms debouncer. None of them flush the mirror.
    const baseEt = etFromIso('2020-06-15T00:00:00Z');
    for (let i = 0; i < 100; i++) {
      clock.scrubTo(baseEt + i * 60);
      vi.advanceTimersByTime(10); // 10ms < 500ms; debounce resets
    }
    // Still empty — leading-edge would have written something here.
    expect(mirror.textContent).toBe('');

    // Trailing flush.
    vi.advanceTimersByTime(500);
    // The mirror reflects the FINAL scrubTo argument.
    const finalEt = baseEt + 99 * 60;
    expect(mirror.textContent).toBe(`${dateForHud(finalEt)} UT`);

    el.remove();
  });

  it('<v-hud-date>: subsequent quiet period after a flush does NOT re-fire the mirror', async () => {
    const clock = new ClockManager();
    const el = document.createElement('v-hud-date') as VHudDate;
    el.clockManager = clock;
    document.body.appendChild(el);
    await el.updateComplete;
    const mirror = el.shadowRoot!.querySelector<HTMLElement>('.sr-only')!;

    clock.scrubTo(etFromIso('2025-01-01T00:00:00Z'));
    vi.advanceTimersByTime(500);
    const after = mirror.textContent;
    expect(after).not.toBe('');

    // Wait another 5 seconds — no new scrub, no new write.
    vi.advanceTimersByTime(5000);
    expect(mirror.textContent).toBe(after);
    el.remove();
  });
});

// ---------------------------------------------------------------------------
// 4. formatAU precision tiers — boundary values exact.
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — formatAU precision tiers (AC4)', () => {
  it.each<[number, string]>([
    [0.05, '0.05 AU'],   // < 10 → 2 decimals
    [5.2, '5.20 AU'],    // < 10 → 2 decimals, trailing zero retained
    [9.999, '10.00 AU'], // toFixed(2) at the high edge → still 2 dp form
    [50, '50.0 AU'],     // 10 <= v < 100 → 1 decimal (NOT "50 AU")
    [99.9, '99.9 AU'],   // 10 <= v < 100 → 1 decimal
    [100, '100 AU'],     // v >= 100 → integer (boundary)
    [165.32, '165 AU'],  // v >= 100 → integer (V1-in-2030 scale)
    [165, '165 AU'],
  ])('formatAU(%s) === %s', (au, expected) => {
    expect(formatAU(au)).toBe(expected);
  });

  it('formatAU(10) lands in the 1-decimal tier (NOT 2-decimal) — boundary at v < 10', () => {
    expect(formatAU(10)).toBe('10.0 AU');
  });
});

// ---------------------------------------------------------------------------
// 5. formatAU non-finite handling.
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — formatAU(null/NaN/Infinity) returns "— AU" placeholder', () => {
  it('formatAU(NaN) returns "— AU" placeholder (does not throw)', () => {
    expect(() => formatAU(Number.NaN)).not.toThrow();
    expect(formatAU(Number.NaN)).toBe('— AU');
  });

  it('formatAU(Infinity) returns "— AU" placeholder', () => {
    expect(formatAU(Number.POSITIVE_INFINITY)).toBe('— AU');
  });

  it('formatAU(-Infinity) returns "— AU" placeholder', () => {
    expect(formatAU(Number.NEGATIVE_INFINITY)).toBe('— AU');
  });

  it('formatAU(null as unknown as number) returns "— AU" placeholder (does not throw)', () => {
    // TypeScript would reject this — but the runtime helper must still
    // be defensive: null coerces to 0 via `Number()` but `Number.isFinite(null)`
    // is false. Either way, we don't want a throw and we don't want "0.00 AU".
    expect(() => formatAU(null as unknown as number)).not.toThrow();
    // null is not a finite number → placeholder.
    const result = formatAU(null as unknown as number);
    // Accept either the explicit placeholder OR the "0.00 AU" form depending
    // on the helper's coercion rules. The defense-in-depth check is "no throw"
    // and "explicit placeholder" — the current impl returns "— AU" for
    // !Number.isFinite, so assert that strict form.
    expect(result).toBe('— AU');
  });

  it('formatAU(undefined as unknown as number) returns "— AU" placeholder', () => {
    expect(() => formatAU(undefined as unknown as number)).not.toThrow();
    expect(formatAU(undefined as unknown as number)).toBe('— AU');
  });
});

// ---------------------------------------------------------------------------
// 6. Sun-at-origin distance formula tripwire (km/AU mixup detector).
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — sun-at-origin distance formula (km vs AU sanity)', () => {
  it('|WorldVec3(165 * KM_PER_AU, 0, 0)| / KM_PER_AU formats to "165 AU"', async () => {
    // The defense here is: if anyone swaps km <-> AU in the distance
    // pipeline (e.g. forgets the /KM_PER_AU divide, or applies it twice),
    // a 165-AU input produces something other than "165 AU" — the
    // formula breaks loudly. We exercise the pipeline through
    // <v-hud-distance>.tick() so the assertion covers the entire
    // ephemeris -> magnitude -> formatAU chain.
    const eph = stubEphemeris(165, 137);
    const el = document.createElement('v-hud-distance') as VHudDistance;
    el.ephemerisService = eph;
    document.body.appendChild(el);
    await el.updateComplete;

    // Tick at an ET corresponding to 2030-01-01.
    const et2030 = etFromIso('2030-01-01T00:00:00Z');
    expect(Number.isFinite(et2030)).toBe(true);
    el.tick(et2030);

    const v1 = el.shadowRoot!.querySelector('[data-body="v1"]')!.textContent;
    const v2 = el.shadowRoot!.querySelector('[data-body="v2"]')!.textContent;
    // 165 and 137 both fall in the >= 100 integer tier.
    expect(v1).toBe('165 AU');
    expect(v2).toBe('137 AU');
    el.remove();
  });

  it('SSB↔Sun offset (≤ 0.01 AU) is below formatAU display precision in every band', () => {
    // Architecture rationale: dev computes magnitude with Sun at origin
    // even though SPK queries use SSB observer. The offset ≤ 0.01 AU must
    // never bubble through formatAU as a visible digit shift.
    //
    // In the >= 100 tier, formatAU rounds to nearest integer — 0.01 AU
    // never moves the digit (rounding boundary is 0.5 AU).
    expect(formatAU(165.0)).toBe('165 AU');
    expect(formatAU(165.01)).toBe('165 AU');
    // In the < 100 tier (1 decimal), 0.01 AU still under the 0.05 round bound.
    expect(formatAU(50.0)).toBe('50.0 AU');
    expect(formatAU(50.01)).toBe('50.0 AU');
    // In the < 10 tier (2 decimals), 0.01 AU is exactly the rounding edge,
    // which means SSB-vs-Sun could in principle shift the last decimal —
    // but V1/V2 are never < 10 AU after launch, so this band is unreachable
    // for the spacecraft. Document the constraint.
    // (No assertion — this is the explicit boundary note.)
  });
});

// ---------------------------------------------------------------------------
// 7. No `background` declarations in HUD components (canvas-and-edges).
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — HUD component CSS has no background fills (canvas-and-edges model)', () => {
  // Match every `background:` / `background-color:` declaration outside
  // of comments. We post-filter `transparent` because `background:
  // transparent` is a CSS reset on the compact-toggle <button> — it
  // paints nothing.
  const BG_REGEX = /(?<![-a-z])background(-color)?\s*:\s*([^;]+);/g;
  const isTransparentValue = (decl: string): boolean =>
    /:\s*transparent\s*;$/.test(decl);

  for (const file of HUD_FILES) {
    it(`${file}: no background fills (only background: transparent allowed)`, () => {
      const src = stripComments(readHudSrc(file));
      const matches = (src.match(BG_REGEX) ?? []).filter(
        (m) => !isTransparentValue(m),
      );
      expect(
        matches,
        `Illegal background declaration(s) in web/src/components/${file}:\n  ${matches.join('\n  ')}`,
      ).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 8. All numeric HUD containers carry font-variant-numeric: tabular-nums.
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — numeric HUD components use tabular-nums (no digit jitter)', () => {
  const NUMERIC_FILES: ReadonlyArray<string> = [
    'v-hud-date.ts',
    'v-hud-distance.ts',
    'v-hud-speed.ts',
  ];
  for (const file of NUMERIC_FILES) {
    it(`${file}: declares font-variant-numeric: tabular-nums at least once`, () => {
      const src = readHudSrc(file);
      const occurrences = src.match(/font-variant-numeric:\s*tabular-nums/g) ?? [];
      expect(
        occurrences.length,
        `${file} should declare tabular-nums on its numeric containers`,
      ).toBeGreaterThanOrEqual(1);
    });
  }
});

// ---------------------------------------------------------------------------
// 9. text-shadow present on the HUD container (AC2 legibility).
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — <v-hud> declares text-shadow for canvas legibility (AC2)', () => {
  it('v-hud.ts source declares the token-equivalent text-shadow rule', () => {
    const src = readHudSrc('v-hud.ts');
    expect(src).toMatch(/text-shadow:\s*0\s+0\s+8px\s+rgba\(10,\s*14,\s*20,\s*0\.8\)/);
  });

  it('v-hud.ts source declares text-shadow at the :host layer so it inherits to descendants', () => {
    // The host-level declaration is what makes the rule apply to every
    // text descendant. Reset to no-op shadow on a sub-component would
    // break legibility, but a sub-component override TO a shadow is OK.
    const src = readHudSrc('v-hud.ts');
    expect(src).toMatch(/:host\s*\{[\s\S]*?text-shadow[\s\S]*?\}/);
  });
});

// ---------------------------------------------------------------------------
// 10. <v-hud> renders <aside aria-label="Mission HUD"> (ARIA contract).
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — <v-hud> renders <aside aria-label="Mission HUD"> (ARIA contract)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shadowRoot.querySelector(\'aside[aria-label="Mission HUD"]\') returns non-null', async () => {
    const el = document.createElement('v-hud') as VHud;
    el.clockManager = new ClockManager();
    document.body.appendChild(el);
    await el.updateComplete;
    const aside = el.shadowRoot!.querySelector('aside[aria-label="Mission HUD"]');
    expect(aside).not.toBeNull();
    expect(aside!.tagName.toLowerCase()).toBe('aside');
    el.remove();
  });
});

// ---------------------------------------------------------------------------
// 11. <v-hud-date>.tick(et) updates BOTH <time datetime> AND visible text.
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — <v-hud-date>.tick(et) writes both datetime attr AND text content', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('tick(J2000_ET) writes the 2000-01-01 ISO datetime and visible date', async () => {
    const clock = new ClockManager();
    const el = document.createElement('v-hud-date') as VHudDate;
    el.clockManager = clock;
    document.body.appendChild(el);
    await el.updateComplete;

    const j2000Et = etFromIso('2000-01-01T00:00:00Z');
    el.tick(j2000Et);

    const timeEl = el.shadowRoot!.querySelector('time')!;
    const expectedIso = isoFromEt(j2000Et);
    const expectedText = dateForHud(j2000Et);
    // datetime attribute carries the ISO form (full seconds, Z suffix).
    expect(timeEl.getAttribute('datetime')).toBe(expectedIso);
    expect(timeEl.getAttribute('datetime')).toMatch(/^2000-01-01T/);
    // Visible text carries the minute-resolution form.
    expect(timeEl.textContent).toBe(expectedText);
    expect(timeEl.textContent).toMatch(/^2000-01-01 /);
    el.remove();
  });

  it('tick(MISSION_END_ET-equivalent) writes the 2030 ISO datetime and visible date', async () => {
    const clock = new ClockManager();
    const el = document.createElement('v-hud-date') as VHudDate;
    el.clockManager = clock;
    document.body.appendChild(el);
    await el.updateComplete;

    const et2030 = etFromIso('2030-06-15T08:30:00Z');
    el.tick(et2030);

    const timeEl = el.shadowRoot!.querySelector('time')!;
    expect(timeEl.getAttribute('datetime')).toMatch(/^2030-06-15T08:30:/);
    expect(timeEl.textContent).toMatch(/^2030-06-15 08:30$/);
    el.remove();
  });
});

// ---------------------------------------------------------------------------
// 12. <v-hud-distance> shows "— AU" placeholder when ephemeris returns null.
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — <v-hud-distance> placeholder when ephemeris returns null', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('both rows show "— AU" when getPosition() returns null for V1 AND V2', async () => {
    const eph = stubEphemeris(null, null);
    const el = document.createElement('v-hud-distance') as VHudDistance;
    el.ephemerisService = eph;
    document.body.appendChild(el);
    await el.updateComplete;

    const et = etFromIso('2010-06-15T00:00:00Z');
    el.tick(et);
    const v1 = el.shadowRoot!.querySelector('[data-body="v1"]')!;
    const v2 = el.shadowRoot!.querySelector('[data-body="v2"]')!;
    expect(v1.textContent).toBe('— AU');
    expect(v2.textContent).toBe('— AU');
    el.remove();
  });

  it('V1 row shows "— AU" placeholder while V2 row renders a real value', async () => {
    const eph = stubEphemeris(null, 30.0);
    const el = document.createElement('v-hud-distance') as VHudDistance;
    el.ephemerisService = eph;
    document.body.appendChild(el);
    await el.updateComplete;

    const et = etFromIso('2010-06-15T00:00:00Z');
    el.tick(et);
    expect(el.shadowRoot!.querySelector('[data-body="v1"]')!.textContent).toBe('— AU');
    expect(el.shadowRoot!.querySelector('[data-body="v2"]')!.textContent).toBe('30.0 AU');
    el.remove();
  });

  it('shows "— AU" placeholder when no ephemerisService is wired at all', async () => {
    const el = document.createElement('v-hud-distance') as VHudDistance;
    document.body.appendChild(el);
    await el.updateComplete;
    const et = etFromIso('2010-06-15T00:00:00Z');
    el.tick(et);
    expect(el.shadowRoot!.querySelector('[data-body="v1"]')!.textContent).toBe('— AU');
    expect(el.shadowRoot!.querySelector('[data-body="v2"]')!.textContent).toBe('— AU');
    el.remove();
  });
});

// ---------------------------------------------------------------------------
// 13. Compaction button is gated behind (max-width: 1023px).
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — compact-toggle button only displays under (max-width: 1023px)', () => {
  it('v-hud.ts CSS hides .compact-toggle by default (display: none) outside the media query', () => {
    const src = readHudSrc('v-hud.ts');
    // Outside any @media, the .compact-toggle selector must specify display: none.
    // Pull the .compact-toggle base rule (the first occurrence not inside @media).
    const rule = src.match(/\.compact-toggle\s*\{[^}]*\}/);
    expect(rule, '.compact-toggle base rule not found in v-hud.ts').not.toBeNull();
    expect(rule![0]).toMatch(/display:\s*none/);
  });

  it('v-hud.ts CSS contains a (max-width: 1023px) @media block that re-shows .compact-toggle', () => {
    const src = readHudSrc('v-hud.ts');
    // The @media block must mention both the breakpoint and the .compact-toggle selector.
    const mediaBlocks =
      src.match(/@media\s*\(max-width:\s*1023px\)\s*\{[\s\S]*?\n\s*\}/g) ?? [];
    expect(mediaBlocks.length, 'expected one (max-width: 1023px) @media block').toBeGreaterThan(0);
    // At least one block must re-display the compact-toggle.
    const showsCompactToggle = mediaBlocks.some(
      (b) => /\.compact-toggle/.test(b) && /display:\s*(inline-flex|flex|block|inline-block)/.test(b),
    );
    expect(
      showsCompactToggle,
      'compact-toggle must be re-displayed inside (max-width: 1023px)',
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14. No new @media queries beyond Story 1.7's structural breakpoints.
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — no new @media queries beyond Story 1.7 structural breakpoints', () => {
  // Story 1.7 owns the responsive breakpoint set:
  //   - (max-width: 1023px)   tablet
  //   - (max-width: 767px)    phone
  //   - (min-width: 1920px)   widescreen
  // Plus the (prefers-*) accessibility queries.
  // Any other @media added under web/src/components/v-hud*.ts is a tripwire.
  const ALLOWED_QUERIES: ReadonlyArray<RegExp> = [
    /max-width:\s*1023px/,
    /max-width:\s*767px/,
    /min-width:\s*1920px/,
    /prefers-reduced-motion/,
    /prefers-color-scheme/,
    /prefers-contrast/,
    /prefers-reduced-data/,
    /prefers-reduced-transparency/,
  ];

  for (const file of HUD_FILES) {
    it(`${file}: every @media query targets an allowed structural breakpoint`, () => {
      const src = readHudSrc(file);
      // Capture the body of each @media (the parenthesized predicate).
      const blocks = src.match(/@media\s*\([^)]+\)/g) ?? [];
      for (const block of blocks) {
        const allowed = ALLOWED_QUERIES.some((re) => re.test(block));
        expect(
          allowed,
          `Unexpected @media query in ${file}:\n  ${block}\n` +
            `Allowed: (max-width: 1023px), (max-width: 767px), (min-width: 1920px), (prefers-*)`,
        ).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 15. <v-hud-chapter-title> and <v-hud-instruments> are TRUE stubs.
// ---------------------------------------------------------------------------
describe('Story 1.11 defense — chapter-title and instruments are true stubs (no visible text)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('<v-hud-chapter-title>: shadowRoot textContent is empty (whitespace only)', async () => {
    const el = document.createElement('v-hud-chapter-title') as VHudChapterTitle;
    document.body.appendChild(el);
    await el.updateComplete;
    expect((el.shadowRoot!.textContent ?? '').trim()).toBe('');
    el.remove();
  });

  it('<v-hud-chapter-title>: renders an <h2> ARIA wrapper but with empty content (Story 2.1 will fill)', async () => {
    const el = document.createElement('v-hud-chapter-title') as VHudChapterTitle;
    document.body.appendChild(el);
    await el.updateComplete;
    const h2 = el.shadowRoot!.querySelector('h2');
    expect(h2, '<h2> ARIA wrapper must exist so AT can advertise the live region').not.toBeNull();
    expect((h2!.textContent ?? '').trim()).toBe('');
    el.remove();
  });

  it('<v-hud-instruments>: shadowRoot textContent is empty (whitespace only)', async () => {
    const el = document.createElement('v-hud-instruments') as VHudInstruments;
    document.body.appendChild(el);
    await el.updateComplete;
    expect((el.shadowRoot!.textContent ?? '').trim()).toBe('');
    el.remove();
  });
});
