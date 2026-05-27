// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import { BaseElement } from './base-element';
import { VHud } from './v-hud';
import { VHudDate } from './v-hud-date';
import { VHudDistance } from './v-hud-distance';
import { VHudSpeed } from './v-hud-speed';
import { VHudChapterTitle } from './v-hud-chapter-title';
import { VHudInstruments } from './v-hud-instruments';
import { ClockManager } from '../services/clock-manager';
import { etFromIso } from '../math/et-conversions';
import { KM_PER_AU } from '../math/constants';
import { worldVec3 } from '../types/branded';
import type { WorldVec3 } from '../types/branded';
import type { EphemerisService } from '../services/ephemeris-service';

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

const mount = async (
  clock: ClockManager | null,
  eph: EphemerisService | null = null,
): Promise<VHud> => {
  const el = document.createElement('v-hud') as VHud;
  if (clock !== null) el.clockManager = clock;
  if (eph !== null) el.ephemerisService = eph;
  document.body.appendChild(el);
  await el.updateComplete;
  // Sub-components define their own connected/render cycle.
  if (el.hudDate !== null) await el.hudDate.updateComplete;
  if (el.hudDistance !== null) await el.hudDistance.updateComplete;
  if (el.hudSpeed !== null) await el.hudSpeed.updateComplete;
  return el;
};

describe('Story 1.11 Task 9 — <v-hud> registration + structure', () => {
  it('class extends BaseElement', () => {
    expect(Object.getPrototypeOf(VHud.prototype)).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-hud>', () => {
    expect(customElements.get('v-hud')).toBe(VHud);
  });

  it('renders <aside aria-label="Mission HUD"> as the container', async () => {
    const el = await mount(new ClockManager());
    const aside = el.shadowRoot!.querySelector('aside');
    expect(aside).toBeTruthy();
    expect(aside!.getAttribute('aria-label')).toBe('Mission HUD');
    el.remove();
  });

  it('renders all five sub-components anchored to the four corners', async () => {
    const el = await mount(new ClockManager());
    const root = el.shadowRoot!;
    expect(root.querySelector('.corner.top-left v-hud-chapter-title')).toBeTruthy();
    expect(root.querySelector('.corner.top-right v-hud-date')).toBeTruthy();
    expect(root.querySelector('.corner.top-right v-hud-distance')).toBeTruthy();
    expect(root.querySelector('.corner.bottom-right v-hud-speed')).toBeTruthy();
    expect(root.querySelector('.corner.bottom-left v-hud-instruments')).toBeTruthy();
    el.remove();
  });

  it('sub-component classes are the expected ones', async () => {
    const el = await mount(new ClockManager());
    expect(el.hudDate instanceof VHudDate).toBe(true);
    expect(el.hudDistance instanceof VHudDistance).toBe(true);
    expect(el.hudSpeed instanceof VHudSpeed).toBe(true);
    expect(
      el.shadowRoot!.querySelector('v-hud-chapter-title') instanceof VHudChapterTitle,
    ).toBe(true);
    expect(
      el.shadowRoot!.querySelector('v-hud-instruments') instanceof VHudInstruments,
    ).toBe(true);
    el.remove();
  });
});

describe('Story 1.11 AC1 — corners anchored via --v-edge-margin', () => {
  it('CSS uses position fixed/absolute + var(--v-edge-margin)', () => {
    // Story 6.2 AC7 — corner edges now use the defensive fallback form
    // `var(--v-edge-margin, 16px)` per Epic 5 retro Action item #8 (a
    // missing token must surface as a visible offset, not a silent
    // collapse to 0). The expectations relax accordingly: the token
    // reference must be present (with the 16px fallback), and each
    // edge must be declared.
    const flat = (VHud.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('position: fixed');
    expect(joined).toContain('var(--v-edge-margin');
    expect(joined).toMatch(/top:\s*var\(--v-edge-margin/);
    expect(joined).toMatch(/bottom:\s*var\(--v-edge-margin/);
    expect(joined).toMatch(/left:\s*var\(--v-edge-margin/);
    expect(joined).toMatch(/right:\s*var\(--v-edge-margin/);
  });

  it('lives at the HUD z-index layer', () => {
    const flat = (VHud.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toContain('var(--v-z-hud)');
  });
});

describe('Story 1.11 AC2 — no background fills, text-shadow on text', () => {
  it('no background:/background-color: declarations on any element', () => {
    const flat = (VHud.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    // The compact-toggle uses `background: transparent` which is still a
    // background declaration but renders no fill — allowlist it.
    const stripped = joined.replace(/background:\s*transparent/g, '');
    expect(stripped).not.toMatch(/(?<!text-)background(-color)?\s*:\s*(?!transparent)/);
  });

  it(':host applies the AC2 text-shadow for legibility', () => {
    const flat = (VHud.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(/text-shadow:\s*0\s+0\s+8px\s+rgba\(10,\s*14,\s*20,\s*0\.8\)/);
  });
});

describe('Story 1.11 AC1 — wiring propagation to sub-components', () => {
  it('propagates clockManager to children after render', async () => {
    const clock = new ClockManager();
    const el = await mount(clock);
    expect(el.hudDate!.clockManager).toBe(clock);
    expect(el.hudDistance!.clockManager).toBe(clock);
    expect(el.hudSpeed!.clockManager).toBe(clock);
    el.remove();
  });

  it('propagates ephemerisService to v-hud-distance', async () => {
    const clock = new ClockManager();
    const eph = stubEphemeris(5.2, 4.4);
    const el = await mount(clock, eph);
    expect(el.hudDistance!.ephemerisService).toBe(eph);
    el.remove();
  });
});

describe('Story 1.11 AC6 — container tick(et) forwards to per-frame children', () => {
  it('hud.tick(et) updates the date AND distance value spans together', async () => {
    const clock = new ClockManager();
    clock.scrubTo(etFromIso('1989-08-25T09:23:00Z'));
    const eph = stubEphemeris(40.0, 30.0);
    const el = await mount(clock, eph);

    const newEt = etFromIso('2012-08-25T00:00:00Z');
    el.tick(newEt);

    const timeEl = el.hudDate!.shadowRoot!.querySelector('time')!;
    const v1 = el.hudDistance!.shadowRoot!.querySelector('[data-body="v1"]')!;
    const v2 = el.hudDistance!.shadowRoot!.querySelector('[data-body="v2"]')!;
    expect(timeEl.textContent).toBe('2012-08-25 00:00');
    expect(v1.textContent).toBe('40.0 AU');
    expect(v2.textContent).toBe('30.0 AU');
    el.remove();
  });
});

describe('Story 1.11 AC7 — compaction placeholder uses existing 1023px breakpoint', () => {
  it('CSS uses the Story 1.7 (max-width: 1023px) breakpoint, no new ones', () => {
    const flat = (VHud.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(/@media\s*\(max-width:\s*1023px\)/);
    const allMedia = joined.match(/@media[^{]+\{/g) ?? [];
    for (const q of allMedia) {
      expect(q).toMatch(/max-width:\s*1023px/);
    }
  });

  it('does NOT render a compact-toggle at wide viewports (Story 6.2 owns narrow-only)', async () => {
    // Story 1.11 originally shipped a placeholder "HUD ▾" button visible
    // at all viewports via CSS display: none on wide + flex on narrow.
    // Story 6.2 AC3 replaced the placeholder: the toggle now renders
    // ONLY when narrowViewport is true (the `⋯` button), and the
    // CSS @media block re-shows it via `display: inline-flex`. At wide
    // viewports the button is NOT in the shadow DOM at all — the
    // render branch is gated on `this.narrowViewport`.
    const el = await mount(new ClockManager());
    // happy-dom defaults to 1024×768 — wide-viewport branch.
    const btn = el.shadowRoot!.querySelector('.compact-toggle');
    expect(btn).toBeNull();
    el.remove();
  });

  it('renders the ⋯ toggle at narrow viewports (Story 6.2 AC3)', async () => {
    const el = await mount(new ClockManager());
    el.narrowViewport = true;
    await el.updateComplete;
    const btn = el.shadowRoot!.querySelector('.compact-toggle') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent?.trim()).toBe('⋯');
    expect(btn.getAttribute('aria-label')).toBe('Expand HUD');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    el.remove();
  });
});

describe('Story 1.11 — pointer-events do not block canvas behind transparent regions', () => {
  it(':host carries pointer-events: none', () => {
    const flat = (VHud.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(/:host[^{]*\{[^}]*pointer-events:\s*none/);
  });

  it('.corner regions re-enable pointer-events so the speed-slider stays interactive', () => {
    const flat = (VHud.styles as Array<{ cssText?: string } | undefined>).map(
      (s) => String(s?.cssText ?? ''),
    );
    const joined = flat.join('\n');
    expect(joined).toMatch(/\.corner\s*\{[^}]*pointer-events:\s*auto/);
  });
});
