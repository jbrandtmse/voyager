// @vitest-environment happy-dom
/**
 * Story 4.5 AC7 — V1J encounter end-to-end integration test.
 *
 * Per Rule 1 (Integration AC) Story 4.5 amends two consumers (the
 * `<v-chapter-copy>` slug lookup + the V1J chapter spec window) and
 * introduces a third-party data shape (`ChapterSpec.copy` +
 * `ChapterSpec.defaultFraming`). This file is the consumer-side
 * verification that the lookup, window narrowing, detail-scrubber
 * range binding, and ViewFrame body-centered offset all wire together
 * under a real ChapterDirector + real ViewFrame + real ALL_CHAPTERS
 * stack.
 *
 * The test sequence per AC7:
 *
 *   1. Construct a real ChapterDirector over `ALL_CHAPTERS`, a real
 *      `<v-chapter-copy>` wired to it, a real
 *      `<v-timeline-scrubber variant="detail">` wired to it, and a real
 *      `ViewFrameService` (with a stub ephemeris so we don't load
 *      brotli-compressed chunks for what is fundamentally a wiring
 *      test).
 *   2. Walk the director out → entering → held → exiting → passed for
 *      V1J via ET update() calls.
 *   3. Assert `<v-chapter-copy>` renders the V1J lede + body.
 *   4. Assert the detail-scrubber `aria-hidden="false"` and that its
 *      `rangeStart` / `rangeEnd` match the ±5d window.
 *   5. Assert `ViewFrame.getTransform(et, active).originOffsetWorld`
 *      is non-zero with magnitude matching the stub Jupiter position
 *      (the body-centered shift landed).
 *   6. Walk past windowEndEt → assert the copy panel cleared and the
 *      detail scrubber `aria-hidden="true"`.
 *
 * The test uses a stub EphemerisService for the ViewFrame because we
 * are verifying the WIRE-UP (chapter spec → director → ViewFrame →
 * `<v-chapter-copy>` → `<v-timeline-scrubber>`), not the bake's
 * heliocentric Jupiter position numerics — Story 4.1 AC7 already
 * exercises the latter end-to-end against the on-disk manifest.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerspectiveCamera } from 'three';

import { ChapterDirector } from '../src/services/chapter-director';
import { ViewFrameService } from '../src/services/view-frame';
import type { EphemerisService } from '../src/services/ephemeris-service';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import { worldVec3, type WorldVec3 } from '../src/types/branded';
import { VChapterCopy } from '../src/components/v-chapter-copy';
import { VTimelineScrubber } from '../src/components/v-timeline-scrubber';
import { ClockManager } from '../src/services/clock-manager';
import { URLSync } from '../src/services/url-sync';
import {
  VoyagerCameraController,
  type ManualCameraHost,
} from '../src/render/voyager-camera-controller';
import { resolveChapterDefaultFraming } from '../src/chapters/chapter-default-framing';

const JUPITER_NAIF_ID = 5;
const SECONDS_PER_DAY = 86_400;
// Synthetic Jupiter heliocentric position (km) — magnitude only matters
// for the ViewFrame offset assertion. Real Jupiter is ~5.2 AU = ~778
// million km; we use a synthetic ~5e8 km vector to keep the math simple.
const SYNTHETIC_JUPITER_POS_KM: WorldVec3 = worldVec3(5e8, 0, 0);

/**
 * Stub EphemerisService that returns the synthetic Jupiter position for
 * NAIF 5 (Jupiter barycenter) and null for everything else. Mirrors the
 * `EphemerisService` shape consumed by `ViewFrameService.getTransform`.
 */
const makeStubEphemeris = (): Pick<EphemerisService, 'getPosition'> => ({
  getPosition: (_et: number, naifId: number): WorldVec3 | null => {
    if (naifId === JUPITER_NAIF_ID) return SYNTHETIC_JUPITER_POS_KM;
    return null;
  },
});

interface IntegrationRig {
  director: ChapterDirector;
  viewFrame: ViewFrameService;
  chapterCopy: VChapterCopy;
  detailScrubber: VTimelineScrubber;
  clock: ClockManager;
  dispose: () => void;
}

const mountRig = async (): Promise<IntegrationRig> => {
  const director = new ChapterDirector(ALL_CHAPTERS);
  const ephemerisStub = makeStubEphemeris() as EphemerisService;
  // Force reduced-motion off so the ramp-zone path is exercised — Story
  // 4.5 AC3's reduced-motion gate is covered by ViewFrameService's own
  // unit tests; here we want the ±2-day blend zone live so we can poke
  // at the held alpha = 1 inside the V1J window.
  const viewFrame = new ViewFrameService(ephemerisStub, () => false);
  const clock = new ClockManager();
  const urlSync = new URLSync();

  const chapterCopy = document.createElement('v-chapter-copy') as VChapterCopy;
  chapterCopy.chapterDirector = director;
  document.body.appendChild(chapterCopy);

  const detailScrubber = document.createElement(
    'v-timeline-scrubber',
  ) as VTimelineScrubber;
  detailScrubber.variant = 'detail';
  detailScrubber.urlSync = urlSync;
  detailScrubber.clockManager = clock;
  detailScrubber.chapterDirector = director;
  document.body.appendChild(detailScrubber);

  await chapterCopy.updateComplete;
  await detailScrubber.updateComplete;

  const dispose = (): void => {
    chapterCopy.remove();
    detailScrubber.remove();
    clock.dispose();
  };

  return { director, viewFrame, chapterCopy, detailScrubber, clock, dispose };
};

describe('Story 4.5 AC7 — V1J encounter end-to-end (chapter-director × view-frame × chapter-copy × detail-scrubber)', () => {
  let rig: IntegrationRig;

  beforeEach(async () => {
    rig = await mountRig();
  });

  afterEach(() => {
    rig.dispose();
  });

  it('V1J chapter spec carries the ±5d window AND copy + defaultFraming fields', () => {
    const v1j = findChapterBySlug('v1-jupiter');
    expect(v1j).not.toBeNull();
    expect(v1j!.windowEndEt - v1j!.windowStartEt).toBeCloseTo(
      10 * SECONDS_PER_DAY,
      6,
    );
    expect(v1j!.copy).toBeDefined();
    expect(v1j!.copy!.lede).toBe('V1 Jupiter.');
    expect(v1j!.defaultFraming).toBeDefined();
    expect(v1j!.targetBody).toBe(JUPITER_NAIF_ID);
  });

  it('out → entering → held: copy panel renders V1J lede + body; detail scrubber un-hides', async () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    // Start in cruise (well before V1J entering ramp).
    const cruiseEt = v1j.windowStartEt - 30 * SECONDS_PER_DAY;
    rig.director.update(cruiseEt);
    rig.clock.scrubTo(cruiseEt);
    await rig.chapterCopy.updateComplete;
    await rig.detailScrubber.updateComplete;
    expect(rig.chapterCopy.displayedSlug).toBeNull();
    expect(rig.detailScrubber.getAttribute('aria-hidden')).toBe('true');

    // Walk to V1J anchor — director transitions out → entering → held.
    rig.director.update(v1j.anchorEt);
    rig.clock.scrubTo(v1j.anchorEt);
    await rig.chapterCopy.updateComplete;
    await rig.detailScrubber.updateComplete;

    expect(rig.director.activeChapter?.slug).toBe('v1-jupiter');
    expect(rig.chapterCopy.displayedSlug).toBe('v1-jupiter');

    // DOM contains the V1J lede ("V1 Jupiter.") — the AC7 binding assert.
    const lede = rig.chapterCopy.querySelector('.v-chapter-copy-lede');
    expect(lede?.textContent).toBe('V1 Jupiter.');
    expect(rig.chapterCopy.textContent).toContain('V1 Jupiter.');

    // Encounter body is rendered as a single paragraph.
    const paragraphs = rig.chapterCopy.querySelectorAll('.v-chapter-copy-paragraph');
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0].textContent).toBe(v1j.copy!.body);

    // Detail scrubber un-hidden + range matches V1J ±5d window.
    expect(rig.detailScrubber.getAttribute('aria-hidden')).toBe('false');
    expect(rig.detailScrubber.rangeStart).toBe(v1j.windowStartEt);
    expect(rig.detailScrubber.rangeEnd).toBe(v1j.windowEndEt);
  });

  it('held — ViewFrame.getTransform returns Jupiter-centered offset (origin shifted)', () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    rig.director.update(v1j.anchorEt);
    const transform = rig.viewFrame.getTransform(
      v1j.anchorEt,
      rig.director.activeChapter,
    );
    // Held window → alpha = 1, so the offset equals the body's
    // heliocentric position exactly.
    expect(transform.originOffsetWorld[0]).toBeCloseTo(
      SYNTHETIC_JUPITER_POS_KM[0],
      3,
    );
    expect(transform.originOffsetWorld[1]).toBeCloseTo(
      SYNTHETIC_JUPITER_POS_KM[1],
      3,
    );
    expect(transform.originOffsetWorld[2]).toBeCloseTo(
      SYNTHETIC_JUPITER_POS_KM[2],
      3,
    );
    const offsetMag = Math.hypot(
      transform.originOffsetWorld[0],
      transform.originOffsetWorld[1],
      transform.originOffsetWorld[2],
    );
    expect(offsetMag).toBeGreaterThan(0);
  });

  it('held → exiting → passed: copy panel clears; detail scrubber re-hides', async () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    // Forward-scrub through the held window first.
    rig.director.update(v1j.anchorEt);
    rig.clock.scrubTo(v1j.anchorEt);
    await rig.chapterCopy.updateComplete;
    await rig.detailScrubber.updateComplete;
    expect(rig.chapterCopy.displayedSlug).toBe('v1-jupiter');

    // Walk past windowEndEt.
    const exitEt = v1j.windowEndEt + 1;
    rig.director.update(exitEt);
    rig.clock.scrubTo(exitEt);
    await rig.chapterCopy.updateComplete;
    await rig.detailScrubber.updateComplete;

    expect(rig.chapterCopy.displayedSlug).toBeNull();
    const article = rig.chapterCopy.querySelector('article.v-chapter-copy');
    expect(article?.getAttribute('data-active')).toBe('false');
    expect(rig.detailScrubber.getAttribute('aria-hidden')).toBe('true');
  });

  it('after exit, ViewFrame falls back to identity (cruise) offset', () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    // Walk far past the exit ramp (windowEndEt + 2 days is still in the
    // ramp band; +10 days is firmly in cruise).
    const cruiseEt = v1j.windowEndEt + 10 * SECONDS_PER_DAY;
    rig.director.update(cruiseEt);
    const transform = rig.viewFrame.getTransform(
      cruiseEt,
      rig.director.activeChapter,
    );
    const offsetMag = Math.hypot(
      transform.originOffsetWorld[0],
      transform.originOffsetWorld[1],
      transform.originOffsetWorld[2],
    );
    expect(offsetMag).toBe(0);
  });
});

/**
 * Story 4.5 AC3 (smoke cycle-2 fix) — camera auto-framing on chapter
 * `held` transition.
 *
 * The cycle-1 smoke surfaced that the `resolveDefaultFraming` closure
 * was registered but never CALLED on chapter activation — the R-key
 * restore path worked, but a chapter entering `held` didn't trigger
 * the framing. The cycle-2 fix adds a public
 * `VoyagerCameraController.applyDefaultFraming({animated})` entry
 * point and wires a `ChapterDirector` subscriber in `main.ts` to fire
 * it on `to === 'held'` for chapters with `defaultFraming`. This block
 * pins that wire-up via a real controller against a stub
 * `ManualCameraHost` + stub target source.
 */
describe('Story 4.5 AC3 — applyDefaultFraming wires the controller to chapter-default framing', () => {
  const makeStubEngine = (): ManualCameraHost & {
    setManualCameraActive: ReturnType<typeof vi.fn>;
  } => {
    let active = false;
    const setManualCameraActive = vi.fn((value: boolean) => {
      active = value;
    });
    return {
      setManualCameraActive,
      get manualCameraActive(): boolean {
        return active;
      },
    };
  };

  const SYNTHETIC_TARGET_KM: WorldVec3 = worldVec3(1e6, 2e6, 3e6);

  const makeController = (): {
    controller: VoyagerCameraController;
    camera: PerspectiveCamera;
    engine: ReturnType<typeof makeStubEngine>;
    director: ChapterDirector;
  } => {
    const engine = makeStubEngine();
    const camera = new PerspectiveCamera(50, 1, 1e-6, 1e15);
    const domElement = document.createElement('div');
    document.body.appendChild(domElement);
    const director = new ChapterDirector(ALL_CHAPTERS);
    const controller = new VoyagerCameraController({
      camera,
      domElement,
      renderEngine: engine,
      getActiveTarget: () => SYNTHETIC_TARGET_KM,
      getViewFrameOrigin: () => worldVec3(0, 0, 0),
      resolveDefaultFraming: (activeTarget) =>
        resolveChapterDefaultFraming(director.activeChapter, activeTarget),
      reducedMotion: () => false,
      restoreDurationMs: 0, // collapse animations to instant for assertions
    });
    return { controller, camera, engine, director };
  };

  it('applyDefaultFraming({ animated: false }) snaps camera to chapter offset for V1J', () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    const { controller, camera, engine, director } = makeController();

    // Drive director into V1J held so the resolver picks up the V1J spec.
    director.update(v1j.anchorEt);
    expect(director.activeChapter?.slug).toBe('v1-jupiter');

    // Camera starts at origin (cold-load state).
    expect(camera.position.x).toBe(0);
    expect(camera.position.y).toBe(0);
    expect(camera.position.z).toBe(0);

    controller.applyDefaultFraming({ animated: false });

    // Camera lands at target + offsetKm (defaultFraming math from
    // chapter-default-framing.ts).
    const [ox, oy, oz] = v1j.defaultFraming!.offsetKm;
    expect(camera.position.x).toBeCloseTo(SYNTHETIC_TARGET_KM[0] + ox, 1);
    expect(camera.position.y).toBeCloseTo(SYNTHETIC_TARGET_KM[1] + oy, 1);
    expect(camera.position.z).toBeCloseTo(SYNTHETIC_TARGET_KM[2] + oz, 1);

    // Camera is in chapter-controlled state, not user-manual state.
    expect(engine.manualCameraActive).toBe(false);
  });

  it('applyDefaultFraming({ animated: true }) tweens to chapter offset for V1J (with restoreDurationMs=0 collapses to instant)', () => {
    // restoreDurationMs is 0 in our stub controller, so the animated
    // path collapses to instant per the reduced-motion / zero-duration
    // branch. The smoke gate is that camera lands at the right spot.
    const v1j = findChapterBySlug('v1-jupiter')!;
    const { controller, camera, director } = makeController();
    director.update(v1j.anchorEt);

    controller.applyDefaultFraming({ animated: true });

    const [ox, oy, oz] = v1j.defaultFraming!.offsetKm;
    expect(camera.position.x).toBeCloseTo(SYNTHETIC_TARGET_KM[0] + ox, 1);
    expect(camera.position.y).toBeCloseTo(SYNTHETIC_TARGET_KM[1] + oy, 1);
    expect(camera.position.z).toBeCloseTo(SYNTHETIC_TARGET_KM[2] + oz, 1);
  });

  it('applyDefaultFraming is a no-op when manualCameraSuspended (PBD carve-out)', () => {
    const v1j = findChapterBySlug('v1-jupiter')!;
    const { controller, camera, director } = makeController();
    director.update(v1j.anchorEt);
    controller.manualCameraSuspended = true;

    controller.applyDefaultFraming({ animated: false });

    // Camera stayed at origin — the suspension prevented the framing.
    expect(camera.position.x).toBe(0);
    expect(camera.position.y).toBe(0);
    expect(camera.position.z).toBe(0);
  });

  it('applyDefaultFraming for a chapter without defaultFraming still produces a deterministic result (falls back to defaultFramingFallback)', () => {
    // Sanity defense — a chapter spec without `defaultFraming` should
    // not throw. The controller's fallback (defaultFramingFallback)
    // takes over and frames the active target at the built-in
    // encounter distance. This pins the contract that
    // `applyDefaultFraming` is safe to call regardless of the
    // chapter's `defaultFraming` presence.
    const v1h = findChapterBySlug('v1-heliopause')!;
    expect(v1h.defaultFraming).toBeUndefined();
    const { controller, camera, director } = makeController();
    director.update(v1h.anchorEt);

    expect(() => controller.applyDefaultFraming({ animated: false })).not.toThrow();
    // The fallback framing is non-zero (positions camera offset from
    // the active target at the built-in DEFAULT_ENCOUNTER_DISTANCE_KM).
    const cameraMagnitude = camera.position.length();
    expect(cameraMagnitude).toBeGreaterThan(0);
  });

  it('restore() delegates to applyDefaultFraming (Story 4.2 backwards-compat)', () => {
    // Regression-pin: the public restore() entrypoint still works for
    // R-key + button click path. Tests the delegation didn't break the
    // Story 4.2 surface.
    const v1j = findChapterBySlug('v1-jupiter')!;
    const { controller, camera, engine, director } = makeController();
    director.update(v1j.anchorEt);
    // Simulate a manual gesture having flipped the flag.
    engine.setManualCameraActive(true);
    expect(engine.manualCameraActive).toBe(true);

    controller.restore();

    // Manual flag flipped back to false.
    expect(engine.manualCameraActive).toBe(false);
    // Camera landed at chapter framing.
    const [ox, oy, oz] = v1j.defaultFraming!.offsetKm;
    expect(camera.position.x).toBeCloseTo(SYNTHETIC_TARGET_KM[0] + ox, 1);
    expect(camera.position.y).toBeCloseTo(SYNTHETIC_TARGET_KM[1] + oy, 1);
    expect(camera.position.z).toBeCloseTo(SYNTHETIC_TARGET_KM[2] + oz, 1);
  });
});
