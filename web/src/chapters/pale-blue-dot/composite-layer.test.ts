// @vitest-environment happy-dom
/**
 * Story 5.3 — `PbdCompositeLayer` unit tests.
 *
 * Covers AC2 (module structure), AC3 (rendering anchored to boresight),
 * AC4 (substate-driven opacity fade), AC5 (reduced-motion instant cut),
 * AC6 (sequence ordering), AC10 (ADR compliance — DOM-only, no fetch
 * beacons).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { PaleBlueDot } from './index';
import {
  PBD_FADE_MS_BASE,
  PBD_PLATE_SIZE_CSS,
  PBD_SUBSTATE_TO_PLATE,
  PbdCompositeLayer,
  plateForSubstate,
  type PbdPlateManifest,
} from './composite-layer';
import { PBD_ANCHOR_ET, PbdSubstate } from './substates';

// === Test fixtures ==========================================================

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

interface FixtureLayerOpts {
  reducedMotion?: boolean;
  wallClock?: () => number;
}

const buildLayer = (opts: FixtureLayerOpts = {}): PbdCompositeLayer =>
  new PbdCompositeLayer({
    host: document.body,
    reducedMotion: () => opts.reducedMotion ?? false,
    wallClock: opts.wallClock ?? (() => 0),
    preloadedManifest: MANIFEST_FIXTURE,
  });

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

// === AC2 — module structure ================================================

describe('Story 5.3 AC2 — PbdCompositeLayer module structure', () => {
  it('appends a `.pbd-composite-layer` container to the host', () => {
    const layer = buildLayer();
    const root = document.querySelector('.pbd-composite-layer');
    expect(root).not.toBeNull();
    expect(layer.rootElement).toBe(root);
  });

  it('creates six `<img data-target="<body>">` elements when the manifest installs', () => {
    buildLayer();
    const bodies = ['venus', 'earth', 'jupiter', 'saturn', 'uranus', 'neptune'];
    for (const body of bodies) {
      const img = document.querySelector(`img[data-target=${body}]`);
      expect(img, `missing img for ${body}`).not.toBeNull();
      expect(img?.getAttribute('alt')).toContain(body);
    }
  });

  it('all plates start at opacity 0 (no plate visible at construction)', () => {
    const layer = buildLayer();
    for (const body of ['venus', 'earth', 'jupiter', 'saturn', 'uranus', 'neptune'] as const) {
      expect(layer.getPlateOpacity(body)).toBe(0);
    }
    expect(layer.currentActivePlate).toBe(null);
  });

  it('dispose() removes the container from the DOM and clears state', () => {
    const layer = buildLayer();
    expect(document.querySelector('.pbd-composite-layer')).not.toBeNull();
    layer.dispose();
    expect(document.querySelector('.pbd-composite-layer')).toBeNull();
    expect(layer.currentActivePlate).toBe(null);
  });

  it('plate <img> elements use the configured plate base URL', () => {
    new PbdCompositeLayer({
      host: document.body,
      reducedMotion: () => false,
      wallClock: () => 0,
      plateBaseUrl: '/custom/base/',
      preloadedManifest: MANIFEST_FIXTURE,
    });
    const earth = document.querySelector<HTMLImageElement>('img[data-target=earth]');
    expect(earth?.src).toContain('/custom/base/earth.bbbbbbbb.png');
  });
});

// === AC4 — opacity fade ======================================================

describe('Story 5.3 AC4 — per-substate opacity fade-in / fade-out', () => {
  it('plate fades from 0→1 over PBD_FADE_MS_BASE ms when its substate becomes active', () => {
    let wallClock = 0;
    const layer = buildLayer({ wallClock: () => wallClock });

    // Subscriber-style transition: entering sweeping_venus sets target=1 for Venus.
    layer.setActiveSubstateForTest(PbdSubstate.sweeping_venus);
    expect(layer.currentActivePlate).toBe('venus');

    // First tick at t=0 establishes the wall-clock baseline; opacity still 0.
    layer.update(PbdSubstate.sweeping_venus, null);
    expect(layer.getPlateOpacity('venus')).toBe(0);

    // Advance by half the fade duration — opacity should be ~0.5.
    wallClock = PBD_FADE_MS_BASE / 2;
    layer.update(PbdSubstate.sweeping_venus, null);
    expect(layer.getPlateOpacity('venus')).toBeCloseTo(0.5, 2);

    // Advance to full duration — opacity reaches 1.
    wallClock = PBD_FADE_MS_BASE;
    layer.update(PbdSubstate.sweeping_venus, null);
    expect(layer.getPlateOpacity('venus')).toBe(1);

    // Subsequent ticks don't overshoot.
    wallClock = PBD_FADE_MS_BASE * 2;
    layer.update(PbdSubstate.sweeping_venus, null);
    expect(layer.getPlateOpacity('venus')).toBe(1);
  });

  it('outgoing plate fades 1→0 when the next substate activates', () => {
    let wallClock = 0;
    const layer = buildLayer({ wallClock: () => wallClock });

    // Sweep through to fully-faded-in Venus.
    layer.setActiveSubstateForTest(PbdSubstate.sweeping_venus);
    layer.update(PbdSubstate.sweeping_venus, null);
    wallClock = PBD_FADE_MS_BASE;
    layer.update(PbdSubstate.sweeping_venus, null);
    expect(layer.getPlateOpacity('venus')).toBe(1);

    // Transition to Earth — Venus targets 0, Earth targets 1.
    layer.setActiveSubstateForTest(PbdSubstate.sweeping_earth);
    expect(layer.currentActivePlate).toBe('earth');

    wallClock = PBD_FADE_MS_BASE + PBD_FADE_MS_BASE / 2;
    layer.update(PbdSubstate.sweeping_earth, null);
    expect(layer.getPlateOpacity('venus')).toBeCloseTo(0.5, 2);
    expect(layer.getPlateOpacity('earth')).toBeCloseTo(0.5, 2);

    wallClock = PBD_FADE_MS_BASE + PBD_FADE_MS_BASE;
    layer.update(PbdSubstate.sweeping_earth, null);
    expect(layer.getPlateOpacity('venus')).toBe(0);
    expect(layer.getPlateOpacity('earth')).toBe(1);
  });

  it('at most ONE plate at full opacity at any moment (AC4 invariant — once tween completes)', () => {
    let wallClock = 0;
    const layer = buildLayer({ wallClock: () => wallClock });
    const allBodies = ['venus', 'earth', 'jupiter', 'saturn', 'uranus', 'neptune'] as const;

    // Step through each sweeping substate plus composite_active; after
    // each step's fade completes, exactly one plate is at full opacity.
    const sequence: PbdSubstate[] = [
      PbdSubstate.sweeping_venus,
      PbdSubstate.sweeping_earth,
      PbdSubstate.composite_active, // Earth held
      PbdSubstate.sweeping_jupiter,
      PbdSubstate.sweeping_saturn,
      PbdSubstate.sweeping_uranus,
      PbdSubstate.sweeping_neptune,
    ];
    for (const sub of sequence) {
      layer.setActiveSubstateForTest(sub);
      // Advance the clock past one fade window so both incoming + outgoing
      // tweens complete.
      wallClock += PBD_FADE_MS_BASE * 2;
      layer.update(sub, null);
      // Count plates at full opacity.
      const visible = allBodies.filter((b) => layer.getPlateOpacity(b) === 1);
      expect(visible.length).toBe(1);
    }
  });

  it('plate <img> visibility flips to "hidden" once opacity reaches 0 (defensive against embed-mode stale display)', () => {
    let wallClock = 0;
    const layer = buildLayer({ wallClock: () => wallClock });
    layer.setActiveSubstateForTest(PbdSubstate.sweeping_venus);
    wallClock = PBD_FADE_MS_BASE;
    layer.update(PbdSubstate.sweeping_venus, null);
    layer.setActiveSubstateForTest(PbdSubstate.sweeping_earth);
    wallClock += PBD_FADE_MS_BASE * 2;
    layer.update(PbdSubstate.sweeping_earth, null);
    const venusImg = document.querySelector<HTMLImageElement>('img[data-target=venus]')!;
    expect(venusImg.style.visibility).toBe('hidden');
    const earthImg = document.querySelector<HTMLImageElement>('img[data-target=earth]')!;
    expect(earthImg.style.visibility).toBe('visible');
  });
});

// === AC5 — reduced motion ====================================================

describe('Story 5.3 AC5 — reduced motion: instant cut between plates', () => {
  it('opacity flips 0→1 instantly when reduced-motion is on', () => {
    let wallClock = 0;
    const layer = buildLayer({ reducedMotion: true, wallClock: () => wallClock });
    layer.setActiveSubstateForTest(PbdSubstate.sweeping_earth);
    // No wall-clock advance — same tick the substate transitions, the
    // opacity should already be 1.
    layer.update(PbdSubstate.sweeping_earth, null);
    expect(layer.getPlateOpacity('earth')).toBe(1);
  });

  it('opacity flips 1→0 instantly on outgoing substate when reduced-motion is on', () => {
    let wallClock = 0;
    const layer = buildLayer({ reducedMotion: true, wallClock: () => wallClock });
    layer.setActiveSubstateForTest(PbdSubstate.sweeping_earth);
    layer.update(PbdSubstate.sweeping_earth, null);
    expect(layer.getPlateOpacity('earth')).toBe(1);

    layer.setActiveSubstateForTest(PbdSubstate.sweeping_jupiter);
    layer.update(PbdSubstate.sweeping_jupiter, null);
    expect(layer.getPlateOpacity('earth')).toBe(0);
    expect(layer.getPlateOpacity('jupiter')).toBe(1);
  });
});

// === AC6 — sequence ordering ================================================

describe('Story 5.3 AC6 — sequence ordering matches historical PBD imaging', () => {
  it('PBD_SUBSTATE_TO_PLATE maps sweeping_<body> to the canonical body', () => {
    expect(plateForSubstate(PbdSubstate.sweeping_venus)).toBe('venus');
    expect(plateForSubstate(PbdSubstate.sweeping_earth)).toBe('earth');
    expect(plateForSubstate(PbdSubstate.sweeping_jupiter)).toBe('jupiter');
    expect(plateForSubstate(PbdSubstate.sweeping_saturn)).toBe('saturn');
    expect(plateForSubstate(PbdSubstate.sweeping_uranus)).toBe('uranus');
    expect(plateForSubstate(PbdSubstate.sweeping_neptune)).toBe('neptune');
  });

  it('composite_active maps to Earth (Story 5.3 Rule-5 amendment — Earth-plate hold)', () => {
    expect(plateForSubstate(PbdSubstate.composite_active)).toBe('earth');
    expect(PBD_SUBSTATE_TO_PLATE[PbdSubstate.composite_active]).toBe('earth');
  });

  it('idle / turning / composite_decay / passed have no plate visible', () => {
    expect(plateForSubstate(PbdSubstate.idle)).toBe(null);
    expect(plateForSubstate(PbdSubstate.turning)).toBe(null);
    expect(plateForSubstate(PbdSubstate.composite_decay)).toBe(null);
    expect(plateForSubstate(PbdSubstate.passed)).toBe(null);
  });

  it('Earth plate stays visible across sweeping_earth → composite_active transition (the 30s hold)', () => {
    let wallClock = 0;
    const layer = buildLayer({ wallClock: () => wallClock });
    layer.setActiveSubstateForTest(PbdSubstate.sweeping_earth);
    wallClock = PBD_FADE_MS_BASE;
    layer.update(PbdSubstate.sweeping_earth, null);
    expect(layer.getPlateOpacity('earth')).toBe(1);
    expect(layer.currentActivePlate).toBe('earth');

    layer.setActiveSubstateForTest(PbdSubstate.composite_active);
    // No tween motion needed — both substates target Earth at opacity 1.
    wallClock += 10;
    layer.update(PbdSubstate.composite_active, null);
    expect(layer.getPlateOpacity('earth')).toBe(1);
    expect(layer.currentActivePlate).toBe('earth');
  });
});

// === AC2 + AC4 wire-up: subscriber path ====================================

describe('Story 5.3 AC2 + AC4 — composite layer subscribes via PaleBlueDot.subscribe', () => {
  it('layer activates the corresponding plate when PaleBlueDot.update fires a substate transition', () => {
    const pbd = new PaleBlueDot();
    const layer = buildLayer();
    layer.subscribeTo(pbd);

    pbd.update(PBD_ANCHOR_ET); // idle → turning (no plate)
    expect(layer.currentActivePlate).toBe(null);

    pbd.update(PBD_ANCHOR_ET + 37.5); // → sweeping_venus
    expect(layer.currentActivePlate).toBe('venus');

    pbd.update(PBD_ANCHOR_ET + 52.5); // → sweeping_earth
    expect(layer.currentActivePlate).toBe('earth');

    pbd.update(PBD_ANCHOR_ET + 75); // → composite_active (Earth held)
    expect(layer.currentActivePlate).toBe('earth');

    pbd.update(PBD_ANCHOR_ET + 97.5); // → sweeping_jupiter
    expect(layer.currentActivePlate).toBe('jupiter');

    pbd.update(PBD_ANCHOR_ET + 165); // → composite_decay (no plate)
    expect(layer.currentActivePlate).toBe(null);
  });

  it('repeated subscribeTo on the same PaleBlueDot is idempotent (detaches previous wire)', () => {
    const pbd = new PaleBlueDot();
    const layer = buildLayer();
    layer.subscribeTo(pbd);
    layer.subscribeTo(pbd);  // second call — detaches first, attaches new

    // Substate transition should still only fire one composite-layer
    // update — verified indirectly by checking active plate consistency.
    pbd.update(PBD_ANCHOR_ET + 37.5);
    expect(layer.currentActivePlate).toBe('venus');
  });
});

// === AC3 — projection fallback ===============================================

describe('Story 5.3 AC3 — boresight projection (Path A HTML overlay)', () => {
  it('centers the plate in viewport when no SCAN_PLATFORM node resolves yet', () => {
    let wallClock = 0;
    const layer = new PbdCompositeLayer({
      host: document.body,
      reducedMotion: () => false,
      wallClock: () => wallClock,
      preloadedManifest: MANIFEST_FIXTURE,
      resolveScanPlatform: () => null, // pre-load
    });
    layer.setActiveSubstateForTest(PbdSubstate.sweeping_earth);
    // The projection branch calls centerPlateInViewport even with null
    // camera (which we provide here). The plate's left/top must be set.
    layer.update(PbdSubstate.sweeping_earth, null);
    const earth = document.querySelector<HTMLImageElement>('img[data-target=earth]')!;
    // happy-dom defaults clientWidth/clientHeight to 0, so the plate
    // centers at -PLATE_SIZE/2 (= -64). The key assertion: left/top are
    // numeric strings (i.e. projection ran), not the initial empty
    // string.
    expect(earth.style.left).toMatch(/-?\d+px/);
    expect(earth.style.top).toMatch(/-?\d+px/);
  });
});

// === AC10 — ADR compliance (zero-analytics: no fetch beacons) ===============

describe('Story 5.3 AC10 — ADR-0019 zero-analytics compliance', () => {
  it('does NOT issue any fetch beacons during construction (only the manifest URL when activated)', () => {
    const fetchCalls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((url: RequestInfo | URL): Promise<Response> => {
      fetchCalls.push(typeof url === 'string' ? url : url.toString());
      return Promise.reject(new Error('no fetch in test'));
    }) as typeof fetch;
    try {
      // Construct with a preloaded manifest — no fetch should fire at all.
      const layer = buildLayer();
      expect(fetchCalls).toEqual([]);
      layer.dispose();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// === Constants pinned for downstream consumers ==============================

describe('Story 5.3 — PBD_FADE_MS_BASE matches --v-duration-base (200ms)', () => {
  it('PBD_FADE_MS_BASE is 200', () => {
    expect(PBD_FADE_MS_BASE).toBe(200);
  });

  it('PBD_PLATE_SIZE_CSS is 128 (matches plate-manifest plateSize)', () => {
    expect(PBD_PLATE_SIZE_CSS).toBe(128);
  });
});
