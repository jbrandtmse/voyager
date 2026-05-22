// @vitest-environment happy-dom
/**
 * Story 3.6 — `<v-attitude-indicator>` HUD provenance element unit tests.
 *
 * Covers AC1 (Lit registration / BaseElement), AC2 (CK render), AC3
 * (synthesized render), AC4 (active-spacecraft stub + event dispatch),
 * AC5 (re-render gating on actual provenance change), AC6 (aria-live +
 * aria-label + axe-friendly structure).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { BaseElement } from './base-element';
import { VAttitudeIndicator } from './v-attitude-indicator';
import type {
  AttitudeService,
  AttitudeProvenance,
} from '../services/attitude-service';

interface StubServiceOptions {
  /** Constant provenance returned regardless of et. */
  constant?: AttitudeProvenance;
  /**
   * Threshold ET. When `et < boundaryEt` returns `before`; otherwise `after`.
   * Mirrors the CK/synthesized boundary structure AttitudeService produces
   * at real encounter windows.
   */
  boundaryEt?: number;
  before?: AttitudeProvenance;
  after?: AttitudeProvenance;
  /** Optional override for the platform provenance result (unused in 3.6). */
  platform?: AttitudeProvenance;
}

const stubAttitudeService = (opts: StubServiceOptions = {}): AttitudeService => {
  const platform = opts.platform ?? 'ck';
  return {
    getBusProvenance: (_naifId: number, et: number): AttitudeProvenance => {
      if (opts.constant !== undefined) return opts.constant;
      if (
        opts.boundaryEt !== undefined &&
        opts.before !== undefined &&
        opts.after !== undefined
      ) {
        return et < opts.boundaryEt ? opts.before : opts.after;
      }
      return 'synthesized';
    },
    getPlatformProvenance: (): AttitudeProvenance => platform,
  } as unknown as AttitudeService;
};

const mount = async (
  service: AttitudeService | null = null,
): Promise<VAttitudeIndicator> => {
  const el = document.createElement('v-attitude-indicator') as VAttitudeIndicator;
  if (service !== null) el.attitudeService = service;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

describe('Story 3.6 AC1 — <v-attitude-indicator> registration + base class', () => {
  it('class extends BaseElement', () => {
    expect(Object.getPrototypeOf(VAttitudeIndicator.prototype)).toBe(
      BaseElement.prototype,
    );
  });

  it('is registered as the custom element <v-attitude-indicator>', () => {
    expect(customElements.get('v-attitude-indicator')).toBe(VAttitudeIndicator);
  });

  it('defaults activeSpacecraftId to -31 (V1) per AC4 stub contract', () => {
    const el = new VAttitudeIndicator();
    expect(el.activeSpacecraftId).toBe(-31);
  });

  it('renders the "ATT —" placeholder when AttitudeService is not yet wired', async () => {
    const el = await mount(null);
    const out = el.shadowRoot?.querySelector('output');
    expect(out).not.toBeNull();
    expect(out?.getAttribute('aria-label')).toBe('Attitude data provenance');
    const value = out?.querySelector('.att-value');
    expect(value?.textContent).toBe('—');
    el.remove();
  });
});

describe('Story 3.6 AC2 — CK regime renders "CK reconstructed"', () => {
  it('tick at CK ET renders value "CK reconstructed"', async () => {
    const service = stubAttitudeService({ constant: 'ck' });
    const el = await mount(service);
    el.tick(0);
    await el.updateComplete;
    const value = el.shadowRoot?.querySelector('.att-value');
    expect(value?.textContent).toBe('CK reconstructed');
    el.remove();
  });

  it('CK regime reflects data-provenance="ck" on the host attribute (drives CSS color)', async () => {
    const service = stubAttitudeService({ constant: 'ck' });
    const el = await mount(service);
    el.tick(0);
    await el.updateComplete;
    expect(el.getAttribute('data-provenance')).toBe('ck');
    el.remove();
  });

  it('CK render contains the ATT label and a dot character', async () => {
    const service = stubAttitudeService({ constant: 'ck' });
    const el = await mount(service);
    el.tick(0);
    await el.updateComplete;
    const out = el.shadowRoot?.querySelector('output');
    const label = out?.querySelector('.att-label');
    const dot = out?.querySelector('.att-dot');
    expect(label?.textContent).toBe('ATT');
    expect(dot?.textContent).toBe('●');
    el.remove();
  });

  it('exposes color tokens --v-color-ck / --v-color-synth in styles', () => {
    const flat = (
      VAttitudeIndicator.styles as Array<{ cssText?: string } | undefined>
    ).map((s) => String(s?.cssText ?? ''));
    const joined = flat.join('\n');
    expect(joined).toContain('var(--v-color-ck)');
    expect(joined).toContain('var(--v-color-synth)');
  });
});

describe('Story 3.6 AC3 — synthesized regime renders "Synthesized (HGA Earth-pointing)"', () => {
  it('tick at synthesized ET renders the full synthesized label', async () => {
    const service = stubAttitudeService({ constant: 'synthesized' });
    const el = await mount(service);
    el.tick(0);
    await el.updateComplete;
    const value = el.shadowRoot?.querySelector('.att-value');
    expect(value?.textContent).toBe('Synthesized (HGA Earth-pointing)');
    el.remove();
  });

  it('synthesized regime reflects data-provenance="synthesized" on the host', async () => {
    const service = stubAttitudeService({ constant: 'synthesized' });
    const el = await mount(service);
    el.tick(0);
    await el.updateComplete;
    expect(el.getAttribute('data-provenance')).toBe('synthesized');
    el.remove();
  });

  it('the value text is the primary signal — does not encode regime in color-only', async () => {
    // The text content alone must disambiguate CK from synthesized
    // (AC2 + AC3 + FR49 — text is primary signal, color is reinforcement).
    const ckService = stubAttitudeService({ constant: 'ck' });
    const synthService = stubAttitudeService({ constant: 'synthesized' });
    const ckEl = await mount(ckService);
    ckEl.tick(0);
    await ckEl.updateComplete;
    const synthEl = await mount(synthService);
    synthEl.tick(0);
    await synthEl.updateComplete;
    const ckText = ckEl.shadowRoot?.querySelector('.att-value')?.textContent;
    const synthText = synthEl.shadowRoot?.querySelector('.att-value')?.textContent;
    expect(ckText).not.toEqual(synthText);
    expect(ckText).toContain('CK');
    expect(synthText).toContain('Synthesized');
    ckEl.remove();
    synthEl.remove();
  });
});

describe('Story 3.6 AC4 — active spacecraft stub + setActiveSpacecraft event', () => {
  it('default activeSpacecraftId is -31 (V1) — the chronological lead', async () => {
    const el = await mount(null);
    expect(el.activeSpacecraftId).toBe(-31);
    el.remove();
  });

  it('setActiveSpacecraft(-32) updates the active id and dispatches activeSpacecraftChanged', async () => {
    const el = await mount(null);
    const events: CustomEvent[] = [];
    el.addEventListener('activeSpacecraftChanged', (e) => {
      events.push(e as CustomEvent);
    });
    el.setActiveSpacecraft(-32);
    expect(el.activeSpacecraftId).toBe(-32);
    expect(events.length).toBe(1);
    expect(events[0].detail.naifId).toBe(-32);
    expect(events[0].bubbles).toBe(true);
    el.remove();
  });

  it('setActiveSpacecraft is idempotent — no event when the value does not change', async () => {
    const el = await mount(null);
    const events: CustomEvent[] = [];
    el.addEventListener('activeSpacecraftChanged', (e) => {
      events.push(e as CustomEvent);
    });
    el.setActiveSpacecraft(-31); // already -31
    expect(events.length).toBe(0);
    el.remove();
  });

  it('setActiveSpacecraft re-evaluates provenance on next tick for the new spacecraft', async () => {
    // The stub returns CK for V1, synthesized for V2 (via per-call inspection
    // of the naifId argument). Tick → CK → setActive(-32) → tick → synth.
    const service: AttitudeService = {
      getBusProvenance: (naifId: number, _et: number): AttitudeProvenance =>
        naifId === -31 ? 'ck' : 'synthesized',
      getPlatformProvenance: (): AttitudeProvenance => 'ck',
    } as unknown as AttitudeService;
    const el = await mount(service);
    el.tick(0);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'CK reconstructed',
    );
    el.setActiveSpacecraft(-32);
    el.tick(0);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'Synthesized (HGA Earth-pointing)',
    );
    el.remove();
  });
});

describe('Story 3.6 AC5 — per-frame tick gates re-render on actual provenance change', () => {
  it('100 ticks at stable CK provenance triggers <= 1 requestUpdate beyond initial render', async () => {
    const service = stubAttitudeService({ constant: 'ck' });
    const el = await mount(service);
    // First tick may trigger one update (from undefined → 'ck'). Spy AFTER
    // that so we measure only steady-state requestUpdate calls.
    el.tick(0);
    await el.updateComplete;
    const reqSpy = vi.spyOn(el, 'requestUpdate');
    for (let i = 0; i < 100; i++) el.tick(i);
    expect(reqSpy).not.toHaveBeenCalled();
    reqSpy.mockRestore();
    el.remove();
  });

  it('crossing a provenance boundary triggers exactly one requestUpdate at the transition', async () => {
    const service = stubAttitudeService({
      boundaryEt: 100,
      before: 'synthesized',
      after: 'ck',
    });
    const el = await mount(service);
    // Initial render path — let the placeholder land.
    el.tick(0);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'Synthesized (HGA Earth-pointing)',
    );
    const reqSpy = vi.spyOn(el, 'requestUpdate');
    // 50 ticks all on the synthesized side — no updates.
    for (let i = 0; i < 50; i++) el.tick(50 + i * 0.5); // 50..74.5
    expect(reqSpy).not.toHaveBeenCalled();
    // Cross the boundary once.
    el.tick(150);
    expect(reqSpy).toHaveBeenCalledTimes(1);
    // 50 more ticks all on the CK side — no further updates.
    for (let i = 0; i < 50; i++) el.tick(200 + i);
    expect(reqSpy).toHaveBeenCalledTimes(1);
    reqSpy.mockRestore();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'CK reconstructed',
    );
    el.remove();
  });

  it('tick is a no-op when attitudeService is null (pre-manifest-load state)', async () => {
    const el = await mount(null);
    const reqSpy = vi.spyOn(el, 'requestUpdate');
    for (let i = 0; i < 60; i++) el.tick(i);
    expect(reqSpy).not.toHaveBeenCalled();
    // Placeholder is still rendered.
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe('—');
    reqSpy.mockRestore();
    el.remove();
  });
});

describe('Story 3.6 AC6 — accessibility: aria-live polite + aria-label', () => {
  it('<output> has aria-label="Attitude data provenance"', async () => {
    const el = await mount(null);
    const out = el.shadowRoot?.querySelector('output');
    expect(out?.getAttribute('aria-label')).toBe('Attitude data provenance');
    el.remove();
  });

  it('<output> has aria-live="polite" (never assertive)', async () => {
    const el = await mount(null);
    const out = el.shadowRoot?.querySelector('output');
    expect(out?.getAttribute('aria-live')).toBe('polite');
    expect(out?.getAttribute('aria-live')).not.toBe('assertive');
    el.remove();
  });

  it('the dot and label are aria-hidden so the value text is the sole announced content', async () => {
    const service = stubAttitudeService({ constant: 'ck' });
    const el = await mount(service);
    el.tick(0);
    await el.updateComplete;
    const out = el.shadowRoot?.querySelector('output');
    expect(out?.querySelector('.att-label')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(out?.querySelector('.att-dot')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(
      out?.querySelector('.att-value')?.getAttribute('aria-hidden'),
    ).toBeNull();
    el.remove();
  });

  it('transition uses --v-duration-base (color shift only, reduced-motion-friendly via central token)', () => {
    const flat = (
      VAttitudeIndicator.styles as Array<{ cssText?: string } | undefined>
    ).map((s) => String(s?.cssText ?? ''));
    const joined = flat.join('\n');
    expect(joined).toMatch(/transition:\s*color\s+var\(--v-duration-base\)/);
  });
});

describe('Story 3.6 AC2 — no background fill (HUD style defense)', () => {
  it(':host has no background declaration', () => {
    const flat = (
      VAttitudeIndicator.styles as Array<{ cssText?: string } | undefined>
    ).map((s) => String(s?.cssText ?? ''));
    const joined = flat.join('\n');
    // BaseElement section is included; the HUD-defense regex from existing
    // sub-components rejects any direct `background:` / `background-color:`
    // declaration. text-shadow is fine — exclude with the lookbehind.
    expect(joined).not.toMatch(/(?<!text-)background(-color)?\s*:/);
  });
});

describe('Story 3.6 — disposal and re-mount cleanliness', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('removing and re-creating the element does not throw and resets state', async () => {
    const el1 = await mount(null);
    el1.remove();
    const el2 = await mount(null);
    expect(el2.activeSpacecraftId).toBe(-31);
    expect(el2.provenance).toBeUndefined();
    el2.remove();
  });

  it('wiring an attitudeService after mount triggers the next tick to paint', async () => {
    const el = await mount(null);
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe('—');
    const service = stubAttitudeService({ constant: 'ck' });
    el.attitudeService = service;
    await el.updateComplete;
    el.tick(0);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.att-value')?.textContent).toBe(
      'CK reconstructed',
    );
    el.remove();
  });
});
