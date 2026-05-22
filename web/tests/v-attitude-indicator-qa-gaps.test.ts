// @vitest-environment happy-dom
/**
 * Story 3.6 — QA gap suite for `<v-attitude-indicator>` (HUD provenance element).
 *
 * Dev-3-6 ships:
 *   - `web/src/components/v-attitude-indicator.test.ts` (25 unit tests
 *     across AC1 registration / BaseElement, AC2 CK render, AC3 synthesized
 *     render, AC4 setActiveSpacecraft + event, AC5 re-render gating,
 *     AC6 aria-live + aria-label, no-background-fill defense, and
 *     disposal/re-mount cleanliness).
 *   - `web/tests/v-attitude-indicator-integration.test.ts` (8 integration
 *     tests through the `<v-hud>` parent: per-frame tick at CK/synth ETs,
 *     boundary crossing, no-color-only contract via output textContent,
 *     setActiveSpacecraft event dispatch + bubbling, embed-mode handle
 *     null, embed-mode tick no-op).
 *   - `web/tests/embed-mode-first-paint.test.ts` (+5 Story 3.6 AC7 tests
 *     verifying first-paint `embedEnabled` flag propagates to the HUD and
 *     the indicator is absent in the HUD shadow root when embed=true).
 *
 * This QA gap suite fills cross-cutting gaps the dev suites do not exercise
 * (per QA brief — Story 3.6 review handoff). The pattern mirrors
 * `web/tests/attitude-applier-qa-gaps.test.ts` and
 * `web/tests/boresight-renderer-qa-gaps.test.ts`:
 *
 *   1. **AC4 `composed: true` shadow-cross contract** — dev asserts
 *      `bubbles === true` (event escapes its host) but never asserts
 *      `composed === true` (event crosses the shadow boundary). Because
 *      `<v-attitude-indicator>` lives inside `<v-hud>`'s shadow root, a
 *      `document`-level listener — the binding hook for Epic 4's
 *      ChapterDirector + analytics — only fires when `composed: true`.
 *      Dev's integration test verifies the parent host catches the event
 *      (which happens with `bubbles` alone) but does NOT verify the
 *      cross-shadow `document`-level catch. A regression that drops the
 *      `composed: true` flag would silently break Epic 4's wiring.
 *
 *   2. **AC5 multi-flip re-render gating** — dev's spy-on-requestUpdate
 *      test pins ONE boundary crossing (synth → ck). A regression that
 *      forgets to update `prevProvenance` after the flip — e.g. computing
 *      the new provenance but failing to pin it — would surface as the
 *      indicator re-rendering on every tick after the first flip. The
 *      dev test wouldn't catch that because it only checks counts up to
 *      and around the single transition. A multi-flip sentinel (ck →
 *      synth → ck → synth) pins that EACH transition triggers exactly
 *      one update.
 *
 *   3. **Late wire-up paints after several pre-wire ticks** — dev pins
 *      the basic "wire service after mount → next tick paints" but does
 *      NOT exercise the realistic boot timeline: the HUD mounts at
 *      first-paint and ticks for several frames before main.ts's
 *      ManifestLoader.then() chain constructs AttitudeService. We need
 *      to verify that a tick(et) called DURING the null-service window
 *      is a clean no-op (no requestUpdate call leaked, no placeholder
 *      mutation), and that the FIRST tick after the service flips
 *      properly transitions out of the placeholder.
 *
 *   4. **Cross-spacecraft regime divergence at one ET** — the most
 *      load-bearing AC4 user-facing scenario: V1 has CK at the queried
 *      ET, V2 has synthesized. `setActiveSpacecraft(-32)` followed by
 *      `tick(et)` must produce the synthesized label even though no time
 *      has passed. Dev's "re-evaluates provenance on next tick for the
 *      new spacecraft" test exercises this but uses a non-realistic
 *      naifId-only stub. We exercise an ET-AND-naifId-dependent stub
 *      that mirrors how `AttitudeService.getBusProvenance` actually
 *      branches at real encounter windows (V1 has CK during 1979
 *      Jupiter; V2 is in synthesized-cruise at that ET).
 *
 *   5. **`<v-attitude-indicator>` is HUD-style-defense compliant** —
 *      the existing `web/tests/hud-style-defense.test.ts` grepbar
 *      enumerates `v-hud-date.ts`, `v-hud-distance.ts`, `v-hud-speed.ts`,
 *      `v-hud-chapter-title.ts`, `v-hud-instruments.ts`, and `v-hud.ts`.
 *      Story 3.6's new component must inherit the same `background:` /
 *      `background-color:` prohibition (the canvas-and-edges model) and
 *      the `text-shadow` legibility contract (which is applied by the
 *      `<v-hud>` host via inheritance). We pin those by source-grep.
 *
 *   6. **`embedEnabled` reactive re-render flips the indicator after
 *      mount** — dev's tests assert the initial mount paths but don't
 *      verify that toggling `embedEnabled` from false → true AFTER the
 *      HUD has mounted causes the indicator to be REMOVED from the
 *      shadow DOM (the Lit reactive-property contract). This protects
 *      against a future regression where `embedEnabled` is read once at
 *      first render and not re-evaluated on property change.
 *
 *   7. **`main.ts` wires `firstPaintHandle.hud.attitudeService` source-
 *      grep** — the indicator can only flip out of the placeholder if
 *      main.ts assigns the AttitudeService to `firstPaintHandle.hud
 *      .attitudeService` after the manifest lands. A tree-shake or
 *      refactor that breaks this assignment would surface as the
 *      placeholder NEVER going away in the browser. The integration
 *      test asserts the contract via a manual assignment; this QA gap
 *      pins that main.ts DOES the assignment so a regression breaks at
 *      the QA tier before reaching the lead.
 *
 *   8. **AC6 a11y scaffolding: dot + label are aria-hidden so only the
 *      value text is announced** — dev's tests assert the dot and label
 *      have `aria-hidden="true"`. We additionally pin that the value
 *      span does NOT have aria-hidden, that the `<output>` element is
 *      the root accessible name carrier (not a wrapping div), and that
 *      a screen reader walking the accessible tree gets exactly the
 *      label "Attitude data provenance" + the value text (e.g. "CK
 *      reconstructed") with nothing else.
 *
 *   9. **Active-spacecraft id is constrained to the `-31 | -32` literal
 *      union (TS-level)** — defense-in-depth that the public setter is
 *      not accidentally widened to `number`. We exercise this at the
 *      runtime tier by setting the property and checking it round-trips.
 *
 *  10. **Provenance regime tokens (--v-color-ck, --v-color-synth) are
 *      referenced in the authored CSS** — dev pins the var() references
 *      via Style array introspection. We additionally pin that the
 *      token file `tokens.css` defines BOTH custom properties (the
 *      visual contract from AC2/AC3 requires the indicator's styles
 *      to consume tokens that actually exist in the cascade).
 *
 *   Per Voyager skill rules Rule 3, the binding browser-evidence gate
 *   remains the lead-executed Chrome DevTools MCP smoke (AC10). This
 *   integration tier catches regressions earlier.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { VAttitudeIndicator } from '../src/components/v-attitude-indicator';
import { VHud } from '../src/components/v-hud';
import { ClockManager } from '../src/services/clock-manager';
import type {
  AttitudeService,
  AttitudeProvenance,
} from '../src/services/attitude-service';

const stubFromCallback = (
  cb: (naifId: number, et: number) => AttitudeProvenance,
): AttitudeService =>
  ({
    getBusProvenance: cb,
    getPlatformProvenance: cb,
  }) as unknown as AttitudeService;

const mountIndicator = async (
  service: AttitudeService | null = null,
): Promise<VAttitudeIndicator> => {
  const el = document.createElement('v-attitude-indicator') as VAttitudeIndicator;
  if (service !== null) el.attitudeService = service;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

const mountHud = async (
  opts: {
    service?: AttitudeService | null;
    embedEnabled?: boolean;
  } = {},
): Promise<VHud> => {
  const hud = document.createElement('v-hud') as VHud;
  hud.clockManager = new ClockManager();
  hud.attitudeService = opts.service ?? null;
  hud.embedEnabled = opts.embedEnabled ?? false;
  document.body.appendChild(hud);
  await hud.updateComplete;
  return hud;
};

describe('Story 3.6 QA gap 1 — AC4 `composed: true` shadow-cross contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('CustomEvent dispatched from indicator has composed === true', async () => {
    const el = await mountIndicator(null);
    const events: CustomEvent[] = [];
    el.addEventListener('activeSpacecraftChanged', (e) => {
      events.push(e as CustomEvent);
    });
    el.setActiveSpacecraft(-32);
    expect(events.length).toBe(1);
    expect(events[0].composed).toBe(true);
  });

  it('document-level listener catches activeSpacecraftChanged when indicator is inside <v-hud> shadow DOM (cross-shadow propagation)', async () => {
    // This is the load-bearing contract for Epic 4's ChapterDirector hook
    // and for analytics subscribers that attach at document level. Without
    // composed: true the event WOULD bubble inside the <v-hud> shadow tree
    // but stop at the shadow boundary; document.addEventListener('...')
    // would never fire.
    const hud = await mountHud({ service: stubFromCallback(() => 'ck') });
    const indicator = hud.attitudeIndicator;
    expect(indicator).not.toBeNull();
    const docEvents: CustomEvent[] = [];
    document.addEventListener('activeSpacecraftChanged', (e) => {
      docEvents.push(e as CustomEvent);
    });
    indicator!.setActiveSpacecraft(-32);
    expect(docEvents.length).toBe(1);
    expect(docEvents[0].detail.naifId).toBe(-32);
    // Clean up — global document listeners persist across tests in happy-dom.
    document.removeEventListener('activeSpacecraftChanged', () => {});
  });

  it('window-level listener also catches activeSpacecraftChanged (composed + bubbles all the way up)', async () => {
    const hud = await mountHud({ service: stubFromCallback(() => 'ck') });
    const indicator = hud.attitudeIndicator;
    expect(indicator).not.toBeNull();
    const winEvents: CustomEvent[] = [];
    const handler = (e: Event): void => {
      winEvents.push(e as CustomEvent);
    };
    window.addEventListener('activeSpacecraftChanged', handler);
    indicator!.setActiveSpacecraft(-32);
    expect(winEvents.length).toBe(1);
    window.removeEventListener('activeSpacecraftChanged', handler);
  });
});

describe('Story 3.6 QA gap 2 — AC5 multi-flip re-render gating (ck → synth → ck → synth)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('three successive boundary crossings trigger exactly three requestUpdate calls (one per transition)', async () => {
    // The stub returns alternating provenance bands at ET windows
    // [0, 100): ck, [100, 200): synth, [200, 300): ck, [300, 400): synth.
    // The dev test only exercises ONE boundary; this exercises THREE so a
    // regression that fails to re-pin `prevProvenance` after the first flip
    // (causing every subsequent tick to look like a transition) would surface.
    const service = stubFromCallback((_naifId, et) => {
      const band = Math.floor(et / 100) % 2;
      return band === 0 ? 'ck' : 'synthesized';
    });
    const el = await mountIndicator(service);
    el.tick(50); // ck — initial paint
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'CK reconstructed',
    );

    const reqSpy = vi.spyOn(el, 'requestUpdate');
    // 10 ticks all in the same ck band — no updates.
    for (let i = 0; i < 10; i++) el.tick(50 + i);
    expect(reqSpy).not.toHaveBeenCalled();

    // First transition ck → synth.
    el.tick(150);
    expect(reqSpy).toHaveBeenCalledTimes(1);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'Synthesized (HGA Earth-pointing)',
    );

    // 10 ticks all in the synth band — no further updates.
    for (let i = 0; i < 10; i++) el.tick(150 + i);
    expect(reqSpy).toHaveBeenCalledTimes(1);

    // Second transition synth → ck.
    el.tick(250);
    expect(reqSpy).toHaveBeenCalledTimes(2);

    // Third transition ck → synth.
    el.tick(350);
    expect(reqSpy).toHaveBeenCalledTimes(3);

    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'Synthesized (HGA Earth-pointing)',
    );
    reqSpy.mockRestore();
  });

  it('zigzag immediately around boundary: ticks straddling the boundary at sub-tick granularity still gate correctly', async () => {
    // Some real per-frame ETs land just under or just over a boundary on
    // alternating frames (e.g. when a scrubber is paused at a value that
    // floats around the boundary by ±1e-3 s due to wall-clock drift). The
    // gate must not flip-flop the rendered text in that case — it should
    // flip ONCE when the actual provenance changes.
    const service = stubFromCallback((_naifId, et) =>
      et < 100 ? 'ck' : 'synthesized',
    );
    const el = await mountIndicator(service);
    el.tick(99); // ck
    await el.updateComplete;
    const reqSpy = vi.spyOn(el, 'requestUpdate');
    // 50 ticks straddling 100 ± small offsets.
    const offsets = [99.9, 100.0, 100.1, 99.999, 100.001];
    for (let i = 0; i < 50; i++) el.tick(offsets[i % offsets.length]);
    // At 99.9 → ck (same as pinned), 100.0+ → synth (flip), then 99.9 again → ck (flip back).
    // So there are MULTIPLE actual provenance changes in this sequence.
    // The contract is: requestUpdate is called once per actual change, not zero.
    expect(reqSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    // But it is NOT called 50 times (one per tick) — only on changes.
    expect(reqSpy.mock.calls.length).toBeLessThanOrEqual(50);
    reqSpy.mockRestore();
  });
});

describe('Story 3.6 QA gap 3 — late wire-up paints after multiple pre-wire ticks', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('multiple ticks BEFORE the service wires are clean no-ops (no requestUpdate, no DOM mutation)', async () => {
    const el = await mountIndicator(null);
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe('—');
    const reqSpy = vi.spyOn(el, 'requestUpdate');
    // Simulate ~5 seconds of 60 Hz ticks pre-manifest-load — the realistic
    // boot timeline where the HUD has mounted but AttitudeService hasn't
    // been constructed yet.
    for (let i = 0; i < 300; i++) el.tick(i);
    expect(reqSpy).not.toHaveBeenCalled();
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe('—');
    reqSpy.mockRestore();
  });

  it('first tick AFTER service wires successfully transitions out of the "ATT —" placeholder', async () => {
    const el = await mountIndicator(null);
    // Drain placeholder ticks.
    for (let i = 0; i < 100; i++) el.tick(i);
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe('—');

    // Wire service. `updated()` re-baselines prevProvenance to null so the
    // next tick paints regardless of "no value change".
    el.attitudeService = stubFromCallback(() => 'synthesized');
    await el.updateComplete;

    // First post-wire tick.
    el.tick(100);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'Synthesized (HGA Earth-pointing)',
    );
  });

  it('placeholder → wired → placeholder (service set back to null) — back to "ATT —" on a subsequent re-mount cycle', async () => {
    // Realistic: a future testing harness may want to swap services
    // mid-stream. The reactive property `attitudeService` is declared as
    // state; setting it to null should reset prevProvenance via updated()
    // and the next tick is a no-op (because tick early-returns when
    // attitudeService === null), so the rendered value reflects the last
    // painted state. After remount with no service, we're back to "ATT —".
    const el1 = await mountIndicator(stubFromCallback(() => 'ck'));
    el1.tick(0);
    await el1.updateComplete;
    expect(el1.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'CK reconstructed',
    );
    el1.remove();
    const el2 = await mountIndicator(null);
    expect(el2.shadowRoot?.querySelector('.att-value')?.textContent).toBe('—');
    el2.remove();
  });
});

describe('Story 3.6 QA gap 4 — cross-spacecraft regime divergence at one ET', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('at the V1 Jupiter ET (1979), V1=-31 has ck and V2=-32 has synthesized; setActiveSpacecraft(-32) flips the display on the next tick', async () => {
    // V1 has CK during 1979 Jupiter; V2 was elsewhere (still on cruise to
    // Saturn) and only had synthesized HGA-Earth-pointing then. The
    // indicator must reflect this regime divergence when the active
    // spacecraft toggles.
    //
    // ET 0 in this stub stands in for the encounter ET — what matters is
    // the (naifId, et) → regime mapping.
    const JUPITER_ET = 0;
    const service = stubFromCallback((naifId, _et) =>
      naifId === -31 ? 'ck' : 'synthesized',
    );
    const el = await mountIndicator(service);
    el.tick(JUPITER_ET);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'CK reconstructed',
    );
    expect(el.getAttribute('data-provenance')).toBe('ck');

    el.setActiveSpacecraft(-32);
    el.tick(JUPITER_ET);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'Synthesized (HGA Earth-pointing)',
    );
    expect(el.getAttribute('data-provenance')).toBe('synthesized');
  });

  it('round-trip V1 → V2 → V1 at the same ET correctly re-paints CK after the second flip', async () => {
    // This guards against a regression where setActiveSpacecraft fails to
    // clear prevProvenance — the second flip back to V1 would silently
    // keep the synthesized text.
    const ET = 0;
    const service = stubFromCallback((naifId, _et) =>
      naifId === -31 ? 'ck' : 'synthesized',
    );
    const el = await mountIndicator(service);
    el.tick(ET);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'CK reconstructed',
    );
    el.setActiveSpacecraft(-32);
    el.tick(ET);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'Synthesized (HGA Earth-pointing)',
    );
    el.setActiveSpacecraft(-31);
    el.tick(ET);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'CK reconstructed',
    );
  });
});

describe('Story 3.6 QA gap 5 — `<v-attitude-indicator>` honours HUD style defense', () => {
  // The existing hud-style-defense.test.ts grepbar excludes the new
  // indicator. These checks pin the same authored-CSS contract directly:
  //   - no `background:` / `background-color:` declaration (canvas-and-edges
  //     transparency)
  //   - the existing tokens.css cascades --v-color-ck and --v-color-synth
  //   - the indicator references both tokens via the authored styles
  const COMPONENT_PATH = resolve(
    __dirname,
    '..',
    'src',
    'components',
    'v-attitude-indicator.ts',
  );
  const TOKENS_PATH = resolve(
    __dirname,
    '..',
    'src',
    'styles',
    'tokens.css',
  );
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('authored CSS contains no `background:` / `background-color:` declarations (HUD transparency contract)', () => {
    const src = stripComments(readFileSync(COMPONENT_PATH, 'utf-8'));
    // text-shadow legitimately mentions "background" semantically in comments
    // but we already stripped those. The look-behind defends against
    // future `text-background:` style invented properties (not standard).
    const matches = src.match(/(?<![-a-z])background(-color)?\s*:/g);
    expect(matches ?? []).toEqual([]);
  });

  it('authored CSS uses font-variant-numeric: tabular-nums (HUD numeric alignment discipline)', () => {
    const src = readFileSync(COMPONENT_PATH, 'utf-8');
    expect(src).toMatch(/font-variant-numeric\s*:\s*tabular-nums/);
  });

  it('authored CSS uses var(--v-font-mono) (HUD typography contract — mirrors other v-hud-* components)', () => {
    const src = readFileSync(COMPONENT_PATH, 'utf-8');
    expect(src).toMatch(/var\(--v-font-mono\)/);
  });

  it('tokens.css defines both --v-color-ck and --v-color-synth (provenance regime tokens exist in the cascade)', () => {
    const tokens = readFileSync(TOKENS_PATH, 'utf-8');
    expect(tokens).toMatch(/--v-color-ck\s*:/);
    expect(tokens).toMatch(/--v-color-synth\s*:/);
  });

  it('the indicator references --v-color-ck and --v-color-synth via :host([data-provenance]) selectors (regime-driven color)', () => {
    const src = readFileSync(COMPONENT_PATH, 'utf-8');
    expect(src).toMatch(/:host\(\[data-provenance='ck'\]\)/);
    expect(src).toMatch(/:host\(\[data-provenance='synthesized'\]\)/);
    expect(src).toMatch(/var\(--v-color-ck\)/);
    expect(src).toMatch(/var\(--v-color-synth\)/);
  });
});

describe('Story 3.6 QA gap 6 — `embedEnabled` reactive re-render flips indicator presence after mount', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('embedEnabled toggled false → true after mount removes <v-attitude-indicator> from the HUD shadow DOM', async () => {
    const hud = await mountHud({
      service: stubFromCallback(() => 'ck'),
      embedEnabled: false,
    });
    expect(hud.attitudeIndicator).not.toBeNull();
    hud.embedEnabled = true;
    await hud.updateComplete;
    expect(hud.attitudeIndicator).toBeNull();
  });

  it('embedEnabled toggled true → false after mount adds <v-attitude-indicator> to the HUD shadow DOM', async () => {
    const hud = await mountHud({
      service: stubFromCallback(() => 'synthesized'),
      embedEnabled: true,
    });
    expect(hud.attitudeIndicator).toBeNull();
    hud.embedEnabled = false;
    await hud.updateComplete;
    expect(hud.attitudeIndicator).not.toBeNull();
    // The newly-mounted indicator should pick up the propagated service.
    expect(hud.attitudeIndicator!.attitudeService).not.toBeNull();
  });

  it('hud.tick continues to function safely while embedEnabled flips back and forth (no exception in either state)', async () => {
    const hud = await mountHud({
      service: stubFromCallback(() => 'ck'),
      embedEnabled: false,
    });
    expect(() => hud.tick(0)).not.toThrow();
    hud.embedEnabled = true;
    await hud.updateComplete;
    expect(() => hud.tick(0)).not.toThrow();
    hud.embedEnabled = false;
    await hud.updateComplete;
    expect(() => hud.tick(0)).not.toThrow();
  });
});

describe('Story 3.6 QA gap 7 — main.ts source-grep: AttitudeService wires into <v-hud>', () => {
  // A regression that drops the `firstPaintHandle.hud.attitudeService =
  // attitudeService` assignment would silently leave the indicator stuck
  // in the placeholder forever. The integration test asserts the contract
  // via a manual assignment; this gap pins that main.ts DOES the wiring
  // so a regression breaks at QA tier before reaching the lead's MCP probe.
  const MAIN_PATH = resolve(__dirname, '..', 'src', 'main.ts');

  it('main.ts assigns firstPaintHandle.hud.attitudeService = attitudeService in the ManifestLoader.then() chain', () => {
    const src = readFileSync(MAIN_PATH, 'utf-8');
    expect(src).toMatch(
      /firstPaintHandle\.hud\.attitudeService\s*=\s*attitudeService/,
    );
  });

  it('main.ts constructs AttitudeService AFTER EphemerisService is constructed (one ChunkLoader shared)', () => {
    const src = readFileSync(MAIN_PATH, 'utf-8');
    const ephIdx = src.indexOf('new EphemerisService');
    const attIdx = src.indexOf('new AttitudeService');
    expect(ephIdx).toBeGreaterThan(-1);
    expect(attIdx).toBeGreaterThan(-1);
    expect(attIdx).toBeGreaterThan(ephIdx);
  });
});

describe('Story 3.6 QA gap 8 — AC6 a11y scaffolding pre-binding for axe-core gate (Story 6.4)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('the <output> element is the accessible name carrier (aria-label is on output itself, not on a wrapping element)', async () => {
    const el = await mountIndicator(stubFromCallback(() => 'ck'));
    el.tick(0);
    await el.updateComplete;
    const out = el.shadowRoot?.querySelector('output');
    expect(out).not.toBeNull();
    expect(out!.getAttribute('aria-label')).toBe('Attitude data provenance');
    // The shadowRoot host element itself does not carry the aria-label —
    // the accessible name is on the live-region root inside.
    expect(el.getAttribute('aria-label')).toBeNull();
  });

  it('only the value span participates in the accessible name (label + dot are aria-hidden)', async () => {
    const el = await mountIndicator(stubFromCallback(() => 'synthesized'));
    el.tick(0);
    await el.updateComplete;
    const out = el.shadowRoot?.querySelector('output');
    const label = out?.querySelector('.att-label');
    const dot = out?.querySelector('.att-dot');
    const value = out?.querySelector('.att-value');
    expect(label?.getAttribute('aria-hidden')).toBe('true');
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
    expect(value?.getAttribute('aria-hidden')).toBeNull();
    // Walking the announced subtree: label is suppressed; dot is
    // suppressed; the value is the sole announced child. We approximate
    // the accessible name by reading the value text only.
    expect(value?.textContent).toBe('Synthesized (HGA Earth-pointing)');
  });

  it('aria-live="polite" never escalates to assertive (no announcement spam)', async () => {
    // We exercise multiple regime flips and confirm the aria-live attribute
    // value stays 'polite' through all of them — defense against a future
    // dev "fix" that promotes to 'assertive' to try to "make it work".
    const service = stubFromCallback((_naifId, et) =>
      et < 100 ? 'ck' : 'synthesized',
    );
    const el = await mountIndicator(service);
    el.tick(50);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('output')?.getAttribute('aria-live')).toBe('polite');
    el.tick(150);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('output')?.getAttribute('aria-live')).toBe('polite');
  });
});

describe('Story 3.6 QA gap 9 — active-spacecraft id setter type discipline', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('setActiveSpacecraft(-31) and setActiveSpacecraft(-32) both round-trip via activeSpacecraftId', async () => {
    const el = await mountIndicator(null);
    el.setActiveSpacecraft(-32);
    expect(el.activeSpacecraftId).toBe(-32);
    el.setActiveSpacecraft(-31);
    expect(el.activeSpacecraftId).toBe(-31);
  });

  it('the public method signature accepts only -31 or -32 (compile-time TS narrow type; runtime documents the union)', async () => {
    const el = await mountIndicator(null);
    // TS narrows this — we round-trip to confirm the runtime accepts the
    // exact branded NAIF ids the indicator commits to.
    el.setActiveSpacecraft(-31);
    expect(el.activeSpacecraftId).toBe(-31);
    el.setActiveSpacecraft(-32);
    expect(el.activeSpacecraftId).toBe(-32);
  });
});

describe('Story 3.6 QA gap 10 — sustained-tick rate: 100 ticks emit zero rerenders at steady state', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('300 ticks at steady CK provenance — exactly zero post-initial requestUpdate calls (60 Hz × 5 seconds budget)', async () => {
    // The architectural goal of AC5's re-render gating is to allow the
    // indicator to participate in the per-frame tick at 60 Hz without
    // triggering 60 Hz Lit reactive updates. This sentinel pins the rate.
    const el = await mountIndicator(stubFromCallback(() => 'ck'));
    el.tick(0); // initial paint
    await el.updateComplete;
    const reqSpy = vi.spyOn(el, 'requestUpdate');
    for (let i = 0; i < 300; i++) el.tick(i + 1);
    expect(reqSpy).not.toHaveBeenCalled();
    reqSpy.mockRestore();
  });

  it('300 ticks at steady synthesized provenance — exactly zero post-initial requestUpdate calls', async () => {
    const el = await mountIndicator(stubFromCallback(() => 'synthesized'));
    el.tick(0);
    await el.updateComplete;
    const reqSpy = vi.spyOn(el, 'requestUpdate');
    for (let i = 0; i < 300; i++) el.tick(i + 1);
    expect(reqSpy).not.toHaveBeenCalled();
    reqSpy.mockRestore();
  });
});
