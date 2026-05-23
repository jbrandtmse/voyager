// @vitest-environment happy-dom
/**
 * Story 4.6 AC7 — V2J / V1S / V2S encounter end-to-end integration test.
 *
 * Per Rule 1 (Integration AC) Story 4.6 amends three chapter specs and
 * extends `MISSION_FACTS.md` with primary-source citations. This file is
 * the consumer-side verification that the lookup, window narrowing,
 * detail-scrubber range binding, chapter-copy rendering, and chapter-
 * default-framing wire-up all hold for each of the three new encounters
 * under a real ChapterDirector + real ViewFrame + real ALL_CHAPTERS
 * stack.
 *
 * One describe block per chapter (V2J, V1S, V2S). Each block walks the
 * director out → entering → held → exiting → passed and asserts at
 * `held`:
 *
 *   - chapter spec window is ±5 days (10-day span)
 *   - `<v-chapter-copy>` renders the chapter's lede on `held`
 *   - detail scrubber `aria-hidden="false"`; rangeStart/rangeEnd match
 *     window
 *   - `ViewFrame.getTransform(anchorEt, active)` returns a non-zero
 *     body-centered offset matching the stub heliocentric position
 *   - camera position lands at `target + defaultFraming.offsetKm` when
 *     `applyDefaultFraming({animated:false})` is invoked
 *
 * The test uses stub ephemeris (each chapter's target body has a
 * synthetic heliocentric position) — Story 4.1 AC7 already exercises
 * real bake numerics end-to-end.
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
const SATURN_NAIF_ID = 6;
const SECONDS_PER_DAY = 86_400;

// Synthetic heliocentric positions (km). Real Jupiter is ~5.2 AU
// (~778 million km); Saturn is ~9.5 AU (~1.43 billion km). Synthetic
// magnitudes preserve relative ordering without invoking the real bake.
const SYNTHETIC_JUPITER_POS_KM: WorldVec3 = worldVec3(7.78e8, 0, 0);
const SYNTHETIC_SATURN_POS_KM: WorldVec3 = worldVec3(0, 1.43e9, 0);

/**
 * Stub EphemerisService that returns the synthetic position for Jupiter
 * (NAIF 5) and Saturn (NAIF 6), and null for everything else.
 */
const makeStubEphemeris = (): Pick<EphemerisService, 'getPosition'> => ({
  getPosition: (_et: number, naifId: number): WorldVec3 | null => {
    if (naifId === JUPITER_NAIF_ID) return SYNTHETIC_JUPITER_POS_KM;
    if (naifId === SATURN_NAIF_ID) return SYNTHETIC_SATURN_POS_KM;
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

/**
 * Stub camera host + factory for the applyDefaultFraming assertions.
 * Mirrors the V1J end-to-end test's controller fixture.
 */
const SYNTHETIC_TARGET_KM: WorldVec3 = worldVec3(1e6, 2e6, 3e6);

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

const makeController = (
  director: ChapterDirector,
): {
  controller: VoyagerCameraController;
  camera: PerspectiveCamera;
  engine: ReturnType<typeof makeStubEngine>;
} => {
  const engine = makeStubEngine();
  const camera = new PerspectiveCamera(50, 1, 1e-6, 1e15);
  const domElement = document.createElement('div');
  document.body.appendChild(domElement);
  const controller = new VoyagerCameraController({
    camera,
    domElement,
    renderEngine: engine,
    getActiveTarget: () => SYNTHETIC_TARGET_KM,
    getViewFrameOrigin: () => worldVec3(0, 0, 0),
    resolveDefaultFraming: (activeTarget) =>
      resolveChapterDefaultFraming(director.activeChapter, activeTarget),
    reducedMotion: () => false,
    restoreDurationMs: 0,
  });
  return { controller, camera, engine };
};

/**
 * Per-chapter integration assertions — extracted into a helper so the
 * three describe blocks share a common shape without duplicating ~80
 * lines of setup.
 */
interface ChapterFixture {
  slug: string;
  lede: string;
  targetBody: number;
  syntheticTargetPos: WorldVec3;
}

const v2jFixture: ChapterFixture = {
  slug: 'v2-jupiter',
  lede: 'V2 Jupiter.',
  targetBody: JUPITER_NAIF_ID,
  syntheticTargetPos: SYNTHETIC_JUPITER_POS_KM,
};

const v1sFixture: ChapterFixture = {
  slug: 'v1-saturn',
  lede: 'V1 Saturn.',
  targetBody: SATURN_NAIF_ID,
  syntheticTargetPos: SYNTHETIC_SATURN_POS_KM,
};

const v2sFixture: ChapterFixture = {
  slug: 'v2-saturn',
  lede: 'V2 Saturn.',
  targetBody: SATURN_NAIF_ID,
  syntheticTargetPos: SYNTHETIC_SATURN_POS_KM,
};

const runChapterIntegration = (fixture: ChapterFixture): void => {
  describe(`Story 4.6 AC7 — ${fixture.slug} encounter end-to-end`, () => {
    let rig: IntegrationRig;

    beforeEach(async () => {
      rig = await mountRig();
    });

    afterEach(() => {
      rig.dispose();
    });

    it(`${fixture.slug} chapter spec carries the ±5d window + copy + defaultFraming fields`, () => {
      const chapter = findChapterBySlug(fixture.slug);
      expect(chapter).not.toBeNull();
      expect(chapter!.windowEndEt - chapter!.windowStartEt).toBeCloseTo(
        10 * SECONDS_PER_DAY,
        6,
      );
      expect(chapter!.copy).toBeDefined();
      expect(chapter!.copy!.lede).toBe(fixture.lede);
      expect(chapter!.defaultFraming).toBeDefined();
      expect(chapter!.targetBody).toBe(fixture.targetBody);
    });

    it(`${fixture.slug} out → entering → held: copy panel renders lede; detail scrubber un-hides`, async () => {
      const chapter = findChapterBySlug(fixture.slug)!;
      // Start in cruise (well before ramp).
      const cruiseEt = chapter.windowStartEt - 30 * SECONDS_PER_DAY;
      rig.director.update(cruiseEt);
      rig.clock.scrubTo(cruiseEt);
      await rig.chapterCopy.updateComplete;
      await rig.detailScrubber.updateComplete;
      expect(rig.chapterCopy.displayedSlug).toBeNull();
      expect(rig.detailScrubber.getAttribute('aria-hidden')).toBe('true');

      // Walk to anchor.
      rig.director.update(chapter.anchorEt);
      rig.clock.scrubTo(chapter.anchorEt);
      await rig.chapterCopy.updateComplete;
      await rig.detailScrubber.updateComplete;

      expect(rig.director.activeChapter?.slug).toBe(fixture.slug);
      expect(rig.chapterCopy.displayedSlug).toBe(fixture.slug);

      const lede = rig.chapterCopy.querySelector('.v-chapter-copy-lede');
      expect(lede?.textContent).toBe(fixture.lede);

      const paragraphs = rig.chapterCopy.querySelectorAll(
        '.v-chapter-copy-paragraph',
      );
      expect(paragraphs.length).toBe(1);
      expect(paragraphs[0].textContent).toBe(chapter.copy!.body);

      expect(rig.detailScrubber.getAttribute('aria-hidden')).toBe('false');
      expect(rig.detailScrubber.rangeStart).toBe(chapter.windowStartEt);
      expect(rig.detailScrubber.rangeEnd).toBe(chapter.windowEndEt);
    });

    it(`${fixture.slug} held — ViewFrame.getTransform returns body-centered offset`, () => {
      const chapter = findChapterBySlug(fixture.slug)!;
      rig.director.update(chapter.anchorEt);
      const transform = rig.viewFrame.getTransform(
        chapter.anchorEt,
        rig.director.activeChapter,
      );
      // Held window → alpha = 1, so the offset equals the body's
      // heliocentric position exactly.
      expect(transform.originOffsetWorld[0]).toBeCloseTo(
        fixture.syntheticTargetPos[0],
        3,
      );
      expect(transform.originOffsetWorld[1]).toBeCloseTo(
        fixture.syntheticTargetPos[1],
        3,
      );
      expect(transform.originOffsetWorld[2]).toBeCloseTo(
        fixture.syntheticTargetPos[2],
        3,
      );
      const offsetMag = Math.hypot(
        transform.originOffsetWorld[0],
        transform.originOffsetWorld[1],
        transform.originOffsetWorld[2],
      );
      expect(offsetMag).toBeGreaterThan(0);
    });

    it(`${fixture.slug} held → exiting → passed: copy panel clears; detail scrubber re-hides`, async () => {
      const chapter = findChapterBySlug(fixture.slug)!;
      rig.director.update(chapter.anchorEt);
      rig.clock.scrubTo(chapter.anchorEt);
      await rig.chapterCopy.updateComplete;
      await rig.detailScrubber.updateComplete;
      expect(rig.chapterCopy.displayedSlug).toBe(fixture.slug);

      const exitEt = chapter.windowEndEt + 1;
      rig.director.update(exitEt);
      rig.clock.scrubTo(exitEt);
      await rig.chapterCopy.updateComplete;
      await rig.detailScrubber.updateComplete;

      expect(rig.chapterCopy.displayedSlug).toBeNull();
      const article = rig.chapterCopy.querySelector('article.v-chapter-copy');
      expect(article?.getAttribute('data-active')).toBe('false');
      expect(rig.detailScrubber.getAttribute('aria-hidden')).toBe('true');
    });

    it(`${fixture.slug} applyDefaultFraming({animated:false}) snaps camera to chapter offset`, () => {
      const chapter = findChapterBySlug(fixture.slug)!;
      const { controller, camera, engine } = makeController(rig.director);

      rig.director.update(chapter.anchorEt);
      expect(rig.director.activeChapter?.slug).toBe(fixture.slug);

      controller.applyDefaultFraming({ animated: false });

      const [ox, oy, oz] = chapter.defaultFraming!.offsetKm;
      expect(camera.position.x).toBeCloseTo(SYNTHETIC_TARGET_KM[0] + ox, 1);
      expect(camera.position.y).toBeCloseTo(SYNTHETIC_TARGET_KM[1] + oy, 1);
      expect(camera.position.z).toBeCloseTo(SYNTHETIC_TARGET_KM[2] + oz, 1);

      expect(engine.manualCameraActive).toBe(false);
    });
  });
};

runChapterIntegration(v2jFixture);
runChapterIntegration(v1sFixture);
runChapterIntegration(v2sFixture);
