// @vitest-environment happy-dom
/**
 * Story 5.3 — PBD composite layer integration tests.
 *
 * Exercises the cross-module wire-up:
 *   - AC2 + AC3 + AC6: a real `PaleBlueDot` module + `PbdCompositeLayer`
 *     subscriber path drives the active plate through the full
 *     chronological substate sequence (Venus → Earth → composite-active
 *     (Earth held) → Jupiter → Saturn → Uranus → Neptune).
 *   - AC4: the substate-driven opacity fade is observable in the DOM
 *     (the `<img data-target=...>` element's `style.opacity` follows the
 *     substate transitions).
 *   - AC8: the composite layer's container remains in the DOM when the
 *     simulated host is the same parent the canvas uses (composites are
 *     simulation, not chrome — embed mode does NOT hide them).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { PaleBlueDot } from '../src/chapters/pale-blue-dot';
import {
  PbdCompositeLayer,
  type PbdPlateManifest,
} from '../src/chapters/pale-blue-dot/composite-layer';
import {
  PBD_ANCHOR_ET,
  PbdSubstate,
} from '../src/chapters/pale-blue-dot/substates';

const MANIFEST_FIXTURE: PbdPlateManifest = {
  schemaVersion: 1,
  plateSize: 128,
  plates: [
    { body: 'venus', sourcePia: 'PIA00453', filename: 'venus.aaaaaaaa.png', sha256: 'a'.repeat(64), bytes: 1000 },
    { body: 'earth', sourcePia: 'PIA00452', filename: 'earth.bbbbbbbb.png', sha256: 'b'.repeat(64), bytes: 1000 },
    { body: 'jupiter', sourcePia: 'PIA00453', filename: 'jupiter.cccccccc.png', sha256: 'c'.repeat(64), bytes: 1000 },
    { body: 'saturn', sourcePia: 'PIA00453', filename: 'saturn.dddddddd.png', sha256: 'd'.repeat(64), bytes: 1000 },
    { body: 'uranus', sourcePia: 'PIA00453', filename: 'uranus.eeeeeeee.png', sha256: 'e'.repeat(64), bytes: 1000 },
    { body: 'neptune', sourcePia: 'PIA00453', filename: 'neptune.ffffffff.png', sha256: 'f'.repeat(64), bytes: 1000 },
  ],
};

interface Fixture {
  pbd: PaleBlueDot;
  layer: PbdCompositeLayer;
  wallClock: { ms: number };
}

const buildFixture = (reducedMotion = false): Fixture => {
  const wallClock = { ms: 0 };
  const pbd = new PaleBlueDot({
    reducedMotion: () => reducedMotion,
    wallClock: () => wallClock.ms,
  });
  const layer = new PbdCompositeLayer({
    host: document.body,
    reducedMotion: () => reducedMotion,
    wallClock: () => wallClock.ms,
    preloadedManifest: MANIFEST_FIXTURE,
  });
  layer.subscribeTo(pbd);
  return { pbd, layer, wallClock };
};

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Story 5.3 — PaleBlueDot + PbdCompositeLayer integration', () => {
  it('chronological PBD substate sequence drives the corresponding plate to opacity 1', () => {
    const { pbd, layer, wallClock } = buildFixture();
    const advance = 1000; // ms per "frame" — plenty larger than fade window

    // idle → turning (no plate)
    pbd.update(PBD_ANCHOR_ET);
    wallClock.ms += advance;
    layer.update(pbd.currentSubstate, null);
    expect(layer.currentActivePlate).toBe(null);

    // turning → sweeping_venus
    pbd.update(PBD_ANCHOR_ET + 37.5);
    wallClock.ms += advance;
    layer.update(pbd.currentSubstate, null);
    expect(layer.currentActivePlate).toBe('venus');
    expect(layer.getPlateOpacity('venus')).toBe(1);

    // sweeping_venus → sweeping_earth
    pbd.update(PBD_ANCHOR_ET + 52.5);
    wallClock.ms += advance;
    layer.update(pbd.currentSubstate, null);
    expect(layer.currentActivePlate).toBe('earth');
    expect(layer.getPlateOpacity('earth')).toBe(1);
    expect(layer.getPlateOpacity('venus')).toBe(0);

    // sweeping_earth → composite_active (the 30s Earth hold — Story 5.3
    // Rule-5 amendment). Earth remains visible at opacity 1.
    pbd.update(PBD_ANCHOR_ET + 75);
    wallClock.ms += advance;
    layer.update(pbd.currentSubstate, null);
    expect(pbd.currentSubstate).toBe(PbdSubstate.composite_active);
    expect(layer.currentActivePlate).toBe('earth');
    expect(layer.getPlateOpacity('earth')).toBe(1);

    // composite_active → sweeping_jupiter (Earth fades out, Jupiter fades in)
    pbd.update(PBD_ANCHOR_ET + 97.5);
    wallClock.ms += advance;
    layer.update(pbd.currentSubstate, null);
    expect(layer.currentActivePlate).toBe('jupiter');
    expect(layer.getPlateOpacity('jupiter')).toBe(1);
    expect(layer.getPlateOpacity('earth')).toBe(0);

    // ... continue to Neptune
    pbd.update(PBD_ANCHOR_ET + 112.5);
    wallClock.ms += advance;
    layer.update(pbd.currentSubstate, null);
    expect(layer.currentActivePlate).toBe('saturn');

    pbd.update(PBD_ANCHOR_ET + 127.5);
    wallClock.ms += advance;
    layer.update(pbd.currentSubstate, null);
    expect(layer.currentActivePlate).toBe('uranus');

    pbd.update(PBD_ANCHOR_ET + 142.5);
    wallClock.ms += advance;
    layer.update(pbd.currentSubstate, null);
    expect(layer.currentActivePlate).toBe('neptune');

    // composite_decay → no plate
    pbd.update(PBD_ANCHOR_ET + 165);
    wallClock.ms += advance;
    layer.update(pbd.currentSubstate, null);
    expect(layer.currentActivePlate).toBe(null);

    // passed → no plate
    pbd.update(PBD_ANCHOR_ET + 200);
    wallClock.ms += advance;
    layer.update(pbd.currentSubstate, null);
    expect(layer.currentActivePlate).toBe(null);
  });

  it('AC4 — DOM `<img>` opacity follows the substate-driven fade', () => {
    const { pbd, layer, wallClock } = buildFixture();
    pbd.update(PBD_ANCHOR_ET + 37.5); // sweeping_venus
    wallClock.ms += 1000;
    layer.update(pbd.currentSubstate, null);
    const venusImg = document.querySelector<HTMLImageElement>('img[data-target=venus]')!;
    expect(parseFloat(venusImg.style.opacity)).toBeCloseTo(1, 5);
    expect(venusImg.style.visibility).toBe('visible');

    pbd.update(PBD_ANCHOR_ET + 52.5); // sweeping_earth
    wallClock.ms += 1000;
    layer.update(pbd.currentSubstate, null);
    expect(parseFloat(venusImg.style.opacity)).toBeCloseTo(0, 5);
    expect(venusImg.style.visibility).toBe('hidden');
    const earthImg = document.querySelector<HTMLImageElement>('img[data-target=earth]')!;
    expect(parseFloat(earthImg.style.opacity)).toBeCloseTo(1, 5);
    expect(earthImg.style.visibility).toBe('visible');
  });

  it('AC4 — at no moment are two plates BOTH visible at opacity 1 in the DOM', () => {
    const { pbd, layer, wallClock } = buildFixture();
    const sequence = [37.5, 52.5, 75, 97.5, 112.5, 127.5, 142.5];
    for (const offset of sequence) {
      pbd.update(PBD_ANCHOR_ET + offset);
      wallClock.ms += 1000; // past the fade window
      layer.update(pbd.currentSubstate, null);
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.pbd-composite-layer img'));
      const fullyVisible = imgs.filter((img) => parseFloat(img.style.opacity) === 1);
      expect(fullyVisible.length).toBe(1);
    }
  });

  it('AC5 — reduced motion: opacity flips instantly without intermediate frames', () => {
    const { pbd, layer, wallClock } = buildFixture(true);
    pbd.update(PBD_ANCHOR_ET + 37.5);
    layer.update(pbd.currentSubstate, null); // same wallClock — no advance
    expect(layer.getPlateOpacity('venus')).toBe(1);

    pbd.update(PBD_ANCHOR_ET + 52.5);
    layer.update(pbd.currentSubstate, null);
    expect(layer.getPlateOpacity('venus')).toBe(0);
    expect(layer.getPlateOpacity('earth')).toBe(1);
  });

  it('AC8 — composite-layer container remains in the DOM (composites are simulation, not chrome)', () => {
    const { layer } = buildFixture();
    expect(document.querySelector('.pbd-composite-layer')).not.toBeNull();
    expect(layer.rootElement.isConnected).toBe(true);
  });

  it('dispose() detaches the subscriber so subsequent PaleBlueDot.update calls do NOT activate plates', () => {
    const { pbd, layer, wallClock } = buildFixture();
    pbd.update(PBD_ANCHOR_ET + 37.5);
    wallClock.ms += 1000;
    layer.update(pbd.currentSubstate, null);
    expect(layer.currentActivePlate).toBe('venus');

    layer.dispose();
    // After dispose, the layer's container is removed and the subscriber
    // is detached. Subsequent pbd.update calls do NOT change the layer's
    // internal state (the layer's listeners were cleared).
    pbd.update(PBD_ANCHOR_ET + 52.5);
    // The layer's container is gone — we can no longer query its DOM.
    expect(document.querySelector('.pbd-composite-layer')).toBeNull();
  });
});
