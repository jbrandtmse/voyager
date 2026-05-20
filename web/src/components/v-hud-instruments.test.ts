// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';

import { BaseElement } from './base-element';
import { VHudInstruments } from './v-hud-instruments';
import {
  INSTRUMENT_SHUTOFF_DATES,
  getShutoffEt,
} from '../data/mission-facts';
import { etFromIso } from '../math/et-conversions';
import { ClockManager } from '../services/clock-manager';

const mount = async (
  opts: { wireClock?: boolean; clockEt?: number } = {},
): Promise<{ el: VHudInstruments; clock: ClockManager | null }> => {
  const el = document.createElement('v-hud-instruments') as VHudInstruments;
  let clock: ClockManager | null = null;
  if (opts.wireClock ?? true) {
    clock = new ClockManager();
    if (opts.clockEt !== undefined) clock.scrubTo(opts.clockEt);
    el.clockManager = clock;
  }
  document.body.appendChild(el);
  await el.updateComplete;
  return { el, clock };
};

afterEach(() => {
  document.querySelectorAll('v-hud-instruments').forEach((el) => el.remove());
});

describe('Story 2.9 AC3 — <v-hud-instruments> registration + structure', () => {
  it('class extends BaseElement', () => {
    expect(Object.getPrototypeOf(VHudInstruments.prototype)).toBe(
      BaseElement.prototype,
    );
  });

  it('is registered as the custom element <v-hud-instruments>', () => {
    expect(customElements.get('v-hud-instruments')).toBe(VHudInstruments);
  });

  it('renders two rows (V1 + V2)', async () => {
    const { el } = await mount();
    const rows = el.shadowRoot!.querySelectorAll('.row');
    expect(rows.length).toBe(2);
    el.remove();
  });

  it('row 1 is V1, row 2 is V2', async () => {
    const { el } = await mount();
    const rows = el.shadowRoot!.querySelectorAll<HTMLElement>('.row');
    expect(rows[0]?.querySelector('.craft-label')?.textContent).toBe('V1');
    expect(rows[1]?.querySelector('.craft-label')?.textContent).toBe('V2');
    el.remove();
  });

  it('each row contains four instrument cells in ISS · UVS · PLS · LECP order', async () => {
    const { el } = await mount();
    const rows = el.shadowRoot!.querySelectorAll<HTMLElement>('.row');
    for (const row of Array.from(rows)) {
      const cells = row.querySelectorAll<HTMLElement>('.instrument');
      expect(cells.length).toBe(4);
      const labels = Array.from(cells).map((c) => c.textContent?.trim() ?? '');
      expect(labels).toEqual(['ISS', 'UVS', 'PLS', 'LECP']);
    }
    el.remove();
  });

  it('each instrument cell has a data-cell="<SC>:<INST>" attribute', async () => {
    const { el } = await mount();
    const cells = el.shadowRoot!.querySelectorAll<HTMLElement>('.instrument');
    const attrs = Array.from(cells).map((c) => c.getAttribute('data-cell'));
    expect(attrs).toEqual([
      'V1:ISS',
      'V1:UVS',
      'V1:PLS',
      'V1:LECP',
      'V2:ISS',
      'V2:UVS',
      'V2:PLS',
      'V2:LECP',
    ]);
    el.remove();
  });
});

describe('Story 2.9 AC3 — instrument-shutoff state transitions', () => {
  it('all instruments are active at mission-start ET (1977 — pre-shutoff)', async () => {
    // Use MISSION_START_ET indirectly by scrubbing to a date earlier than
    // every shutoff. 1977 is correct: every shutoff is 1980-04-01 or later.
    const { el } = await mount({ clockEt: etFromIso('1977-09-05T12:56:00Z') });
    const cells = el.shadowRoot!.querySelectorAll<HTMLElement>('.instrument');
    for (const cell of Array.from(cells)) {
      expect(cell.classList.contains('shut-off')).toBe(false);
    }
    el.remove();
  });

  it('V1 PLS strikes through at exactly its shutoff ET (1980-04-01)', async () => {
    const { el } = await mount({ clockEt: etFromIso('1977-09-05T00:00:00Z') });
    const cell = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-cell="V1:PLS"]',
    )!;
    expect(cell.classList.contains('shut-off')).toBe(false);

    // Cross the threshold via tick().
    el.tick(getShutoffEt('V1', 'PLS'));
    expect(cell.classList.contains('shut-off')).toBe(true);

    // Step back ahead of the threshold — should clear.
    el.tick(getShutoffEt('V1', 'PLS') - 1);
    expect(cell.classList.contains('shut-off')).toBe(false);
    el.remove();
  });

  it('post-2010s ET (2020-01-01) shows V1 ISS + V1 PLS + V1 UVS struck through', async () => {
    const { el } = await mount({ clockEt: etFromIso('2020-01-01T00:00:00Z') });
    const v1Iss = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-cell="V1:ISS"]',
    )!;
    const v1Pls = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-cell="V1:PLS"]',
    )!;
    const v1Uvs = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-cell="V1:UVS"]',
    )!;
    expect(v1Iss.classList.contains('shut-off')).toBe(true);
    expect(v1Pls.classList.contains('shut-off')).toBe(true);
    expect(v1Uvs.classList.contains('shut-off')).toBe(true);
    el.remove();
  });

  it('post-2010s ET (2020-01-01) shows V2 PLS NOT struck through (still active)', async () => {
    const { el } = await mount({ clockEt: etFromIso('2020-01-01T00:00:00Z') });
    const v2Pls = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-cell="V2:PLS"]',
    )!;
    expect(v2Pls.classList.contains('shut-off')).toBe(false);
    el.remove();
  });

  it('post-2025 ET shows V2 PLS struck through (post-2024-10-01)', async () => {
    const { el } = await mount({ clockEt: etFromIso('2025-01-01T00:00:00Z') });
    const v2Pls = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-cell="V2:PLS"]',
    )!;
    expect(v2Pls.classList.contains('shut-off')).toBe(true);
    el.remove();
  });

  it('tick() with non-finite ET is a no-op (defensive)', async () => {
    const { el } = await mount({ clockEt: etFromIso('1977-09-05T00:00:00Z') });
    el.tick(Number.NaN);
    el.tick(Number.POSITIVE_INFINITY);
    const cell = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-cell="V1:PLS"]',
    )!;
    expect(cell.classList.contains('shut-off')).toBe(false);
    el.remove();
  });

  it('tick() with no wired clock + cold ET still mutates DOM', async () => {
    const { el } = await mount({ wireClock: false });
    el.tick(etFromIso('2020-01-01T00:00:00Z'));
    const v1Iss = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-cell="V1:ISS"]',
    )!;
    expect(v1Iss.classList.contains('shut-off')).toBe(true);
    el.remove();
  });
});

describe('Story 2.9 AC3 — instrument shut-off CSS', () => {
  const flat = (
    VHudInstruments.styles as Array<{ cssText?: string } | undefined>
  )
    .map((s) => String(s?.cssText ?? ''))
    .join('\n');

  it('shut-off cells use line-through text-decoration', () => {
    expect(flat).toMatch(/\.shut-off[^}]*text-decoration:\s*line-through/);
  });

  it('shut-off cells use --v-color-fg-quiet (quiet over muted)', () => {
    expect(flat).toMatch(/\.shut-off[^}]*color:\s*var\(--v-color-fg-quiet\)/);
  });

  it('active instrument cells use --v-color-fg-muted', () => {
    // Base .instrument selector colour
    expect(flat).toMatch(/\.instrument\s*\{[^}]*color:\s*var\(--v-color-fg-muted\)/);
  });

  it('transition uses --v-duration-base (reduced-motion-honoring via tokens)', () => {
    expect(flat).toMatch(/transition:[^;]*var\(--v-duration-base\)/);
  });
});

describe('Story 2.9 AC3 — HUD style defense', () => {
  it('no background declarations in component CSS', () => {
    const flat = (
      VHudInstruments.styles as Array<{ cssText?: string } | undefined>
    )
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    // Match `background:` or `background-color:` declarations only (not
    // `text-decoration: line-through` or other -through suffixes).
    expect(flat).not.toMatch(/(?<!text-)background(-color)?\s*:/);
  });
});

describe('Story 2.9 AC3 — initial render matches wired clock', () => {
  it('seed render reflects the wired clock ET (no flash of all-active)', async () => {
    // Mount with a post-2010s ET; the FIRST render should already show
    // V1 ISS struck through, BEFORE any tick() call. This guards against
    // the bug where the HUD flashes "all instruments active" between Lit
    // first-render and the first onFrame tick.
    const { el } = await mount({ clockEt: etFromIso('2020-01-01T00:00:00Z') });
    const v1Iss = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-cell="V1:ISS"]',
    )!;
    expect(v1Iss.classList.contains('shut-off')).toBe(true);
    el.remove();
  });
});

describe('Story 2.9 — mission-facts shutoff threshold cross-reference', () => {
  it('every cached shutoff ET round-trips from its ISO date string', () => {
    for (const sc of ['V1', 'V2'] as const) {
      for (const inst of ['ISS', 'UVS', 'PLS', 'LECP'] as const) {
        expect(getShutoffEt(sc, inst)).toBe(
          etFromIso(INSTRUMENT_SHUTOFF_DATES[sc][inst]),
        );
      }
    }
  });
});
