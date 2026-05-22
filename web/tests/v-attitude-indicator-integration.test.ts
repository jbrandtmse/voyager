// @vitest-environment happy-dom
/**
 * Story 3.6 AC8 — Integration AC: `<v-attitude-indicator>` ↔ AttitudeService
 * wire-up exercised via the `<v-hud>` parent's tick propagation.
 *
 * Mounts `<v-hud>` with a stub AttitudeService that returns 'ck' below a
 * boundary ET and 'synthesized' above, plus a ClockManager and stub
 * EphemerisService (the latter is only required to satisfy the HUD's existing
 * Story 1.11 wire-up). Then:
 *   - Ticks the HUD at an ET inside the CK window → assert the indicator
 *     value text is exactly "CK reconstructed" (cross-checks the no-color-only
 *     contract from AC2 — visible text is the contract, not the color).
 *   - Ticks at an ET inside the synthesized window → "Synthesized (HGA
 *     Earth-pointing)".
 *   - Verifies the `activeSpacecraftChanged` CustomEvent dispatches when
 *     `setActiveSpacecraft(-32)` is called on the indicator (AC4).
 *
 * This mirrors the integration-test pattern from `hud-integration.test.ts`
 * (Story 1.11) — same buildHud factory shape; AttitudeService is a typed
 * stub that returns deterministic provenance per ET threshold.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { VHud } from '../src/components/v-hud';
import type { VAttitudeIndicator } from '../src/components/v-attitude-indicator';
import { ClockManager } from '../src/services/clock-manager';
import { KM_PER_AU } from '../src/math/constants';
import { worldVec3 } from '../src/types/branded';
import type { WorldVec3 } from '../src/types/branded';
import type { EphemerisService } from '../src/services/ephemeris-service';
import type {
  AttitudeService,
  AttitudeProvenance,
} from '../src/services/attitude-service';

const CK_ET = 0;
const SYNTH_ET = 1000;
const BOUNDARY_ET = 500;

const stubEphemeris = (): EphemerisService =>
  ({
    getPosition: (_et: number, naifId: number): WorldVec3 | null => {
      if (naifId === -31) return worldVec3(40 * KM_PER_AU, 0, 0);
      if (naifId === -32) return worldVec3(30 * KM_PER_AU, 0, 0);
      return null;
    },
  }) as unknown as EphemerisService;

const stubAttitudeService = (): AttitudeService =>
  ({
    getBusProvenance: (_naifId: number, et: number): AttitudeProvenance =>
      et < BOUNDARY_ET ? 'ck' : 'synthesized',
    getPlatformProvenance: (_naifId: number, et: number): AttitudeProvenance =>
      et < BOUNDARY_ET ? 'ck' : 'synthesized',
  }) as unknown as AttitudeService;

const mountHud = async (
  embedEnabled = false,
): Promise<{
  hud: VHud;
  indicator: VAttitudeIndicator | null;
  service: AttitudeService;
}> => {
  const clock = new ClockManager();
  const service = stubAttitudeService();
  const eph = stubEphemeris();
  const hud = document.createElement('v-hud') as VHud;
  hud.clockManager = clock;
  hud.ephemerisService = eph;
  hud.attitudeService = service;
  hud.embedEnabled = embedEnabled;
  document.body.appendChild(hud);
  await hud.updateComplete;
  const indicator = hud.attitudeIndicator;
  if (indicator !== null) await indicator.updateComplete;
  return { hud, indicator, service };
};

describe('Story 3.6 AC8 — integration: <v-hud> + <v-attitude-indicator> + stub AttitudeService', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('hud.tick at a CK ET shows "CK reconstructed" in the indicator <output>', async () => {
    const { hud, indicator } = await mountHud();
    expect(indicator).not.toBeNull();
    hud.tick(CK_ET);
    await indicator!.updateComplete;
    const output = indicator!.shadowRoot?.querySelector('output');
    expect(output?.textContent).toContain('CK reconstructed');
    expect(output?.getAttribute('aria-label')).toBe('Attitude data provenance');
  });

  it('hud.tick at a synthesized ET shows "Synthesized (HGA Earth-pointing)"', async () => {
    const { hud, indicator } = await mountHud();
    expect(indicator).not.toBeNull();
    hud.tick(SYNTH_ET);
    await indicator!.updateComplete;
    const output = indicator!.shadowRoot?.querySelector('output');
    expect(output?.textContent).toContain('Synthesized (HGA Earth-pointing)');
  });

  it('crossing the CK/synthesized boundary updates the rendered text within one frame', async () => {
    const { hud, indicator } = await mountHud();
    expect(indicator).not.toBeNull();
    hud.tick(CK_ET);
    await indicator!.updateComplete;
    expect(
      indicator!.shadowRoot?.querySelector('.att-value')?.textContent,
    ).toBe('CK reconstructed');
    // Cross the boundary; one tick must paint the new state on next Lit cycle.
    hud.tick(SYNTH_ET);
    await indicator!.updateComplete;
    expect(
      indicator!.shadowRoot?.querySelector('.att-value')?.textContent,
    ).toBe('Synthesized (HGA Earth-pointing)');
  });

  it('the <output> element textContent matches the no-color-only contract (AC2/AC3 — text is the contract)', async () => {
    // Verify the visible text alone disambiguates the regime — color is
    // reinforcement. We assert exact substring containment to avoid coupling
    // to wrapping whitespace from Lit's template.
    const { hud, indicator } = await mountHud();
    hud.tick(CK_ET);
    await indicator!.updateComplete;
    const ckText = indicator!.shadowRoot
      ?.querySelector('output')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();
    expect(ckText).toBe('ATT ● CK reconstructed');
    hud.tick(SYNTH_ET);
    await indicator!.updateComplete;
    const synthText = indicator!.shadowRoot
      ?.querySelector('output')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();
    expect(synthText).toBe('ATT ● Synthesized (HGA Earth-pointing)');
  });

  it('AC4 — setActiveSpacecraft(-32) dispatches activeSpacecraftChanged with naifId=-32 detail', async () => {
    const { indicator } = await mountHud();
    expect(indicator).not.toBeNull();
    const events: CustomEvent[] = [];
    indicator!.addEventListener('activeSpacecraftChanged', (e) => {
      events.push(e as CustomEvent);
    });
    indicator!.setActiveSpacecraft(-32);
    expect(events.length).toBe(1);
    expect(events[0].detail.naifId).toBe(-32);
  });

  it('AC4 — activeSpacecraftChanged bubbles so a parent listener (Epic 4 hook) catches it', async () => {
    const { hud, indicator } = await mountHud();
    expect(indicator).not.toBeNull();
    const bubbled: CustomEvent[] = [];
    hud.addEventListener('activeSpacecraftChanged', (e) => {
      bubbled.push(e as CustomEvent);
    });
    indicator!.setActiveSpacecraft(-32);
    expect(bubbled.length).toBe(1);
    expect(bubbled[0].detail.naifId).toBe(-32);
  });

  it('hud.attitudeIndicator handle returns null in embed mode (AC7 — indicator not mounted)', async () => {
    const { indicator } = await mountHud(true);
    expect(indicator).toBeNull();
  });

  it('hud.tick in embed mode is a no-op for the indicator (no exception even though indicator is absent)', async () => {
    const { hud } = await mountHud(true);
    expect(() => hud.tick(CK_ET)).not.toThrow();
    expect(() => hud.tick(SYNTH_ET)).not.toThrow();
  });
});
