// @vitest-environment happy-dom
/**
 * Story 4.12 AC4 — Integration AC (Rule 1).
 *
 * Exercises the full heliocentric system-view cold-load path end-to-end
 * with REAL services (no mocking of the producer-consumer chain per
 * `_bmad/custom/voyager-skill-rules.md` Rule 1):
 *
 *   - Real `URLSync` parsing the `?view=heliocentric&distance=<au>&elevation=<deg>` query.
 *   - Real `ChapterDirector` over `ALL_CHAPTERS`.
 *   - Real `URLRouter` wired against the URLSync + ClockManager + ChapterDirector.
 *   - Real `VoyagerCameraController` against a stub RenderEngine surface
 *     (`ManualCameraHost`) — RenderEngine itself is exercised in the
 *     sibling `voyager-camera-controller-integration.test.ts`; here we
 *     focus on the URL→controller wire.
 *
 * Coverage:
 *   - AC1 + AC2: parsing `/c/v1-saturn?view=heliocentric&distance=12&elevation=30`
 *     produces the documented `{ enabled: true, distanceAu: 12,
 *     elevationDeg: 30 }` shape; calling `applyHeliocentricFraming` lands
 *     the camera at `12 * AU_KM` magnitude.
 *   - AC1: `camera.lookAt` quaternion orients camera at world origin.
 *   - AC1: `manualCameraSuspended === true` makes the call a no-op.
 *   - AC2 reverse case: `/c/v1-jupiter` (no `?view=heliocentric`) — the
 *     URLSync's `parseHeliocentricView()` returns `enabled: false` so the
 *     existing chapter-default cold-load path (Story 4.5) is unaffected.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';

import { URLSync } from '../src/services/url-sync';
import { URLRouter } from '../src/services/url-router';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS, findChapterBySlug } from '../src/chapters/registry';
import {
  VoyagerCameraController,
  type ManualCameraHost,
} from '../src/render/voyager-camera-controller';
import { KM_PER_AU } from '../src/math/constants';
import { worldVec3 } from '../src/types/branded';

/** Build a minimal `ManualCameraHost` stub with capture-style assertions. */
const makeStubEngine = (): ManualCameraHost & {
  flips: boolean[];
} => {
  let active = false;
  const flips: boolean[] = [];
  return {
    setManualCameraActive(value: boolean): void {
      active = value;
      flips.push(value);
    },
    get manualCameraActive(): boolean {
      return active;
    },
    flips,
  };
};

/**
 * Build the full integration stack: real URLSync + ClockManager +
 * ChapterDirector + URLRouter, plus a real VoyagerCameraController
 * attached to a stub RenderEngine.
 */
const buildIntegrationStack = (): {
  urlSync: URLSync;
  clock: ClockManager;
  director: ChapterDirector;
  router: URLRouter;
  controller: VoyagerCameraController;
  camera: PerspectiveCamera;
  engine: ReturnType<typeof makeStubEngine>;
  domElement: HTMLElement;
  cleanup: () => void;
} => {
  const urlSync = new URLSync();
  const initial = urlSync.parseInitialPath();
  const clock = new ClockManager();
  clock.scrubTo(initial.initialEt);
  const director = new ChapterDirector(ALL_CHAPTERS);
  director.update(clock.simTimeEt);
  const router = new URLRouter({
    urlSync,
    clockManager: clock,
    chapterDirector: director,
  }).install();

  const camera = new PerspectiveCamera(50, 1, 1e-6, 1e15);
  const domElement = document.createElement('div');
  document.body.appendChild(domElement);
  const engine = makeStubEngine();
  const controller = new VoyagerCameraController({
    camera,
    domElement,
    renderEngine: engine,
    getActiveTarget: () => null,
    getViewFrameOrigin: () => worldVec3(0, 0, 0),
    reducedMotion: () => true, // instant for deterministic assertions
  });
  controller.attach();

  return {
    urlSync,
    clock,
    director,
    router,
    controller,
    camera,
    engine,
    domElement,
    cleanup: () => {
      controller.detach();
      router.dispose();
      urlSync.dispose();
      clock.dispose();
      director.dispose();
      domElement.remove();
    },
  };
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('Story 4.12 AC4 — heliocentric URL → controller integration', () => {
  it('cold-load /c/v1-saturn?view=heliocentric&distance=12&elevation=30 parses the params + lands the camera at 12 AU magnitude', () => {
    window.history.replaceState(
      null,
      '',
      '/c/v1-saturn?view=heliocentric&distance=12&elevation=30',
    );
    const stack = buildIntegrationStack();
    try {
      const view = stack.urlSync.parseHeliocentricView();
      expect(view.enabled).toBe(true);
      expect(view.distanceAu).toBe(12);
      expect(view.elevationDeg).toBe(30);

      // Path still resolves to the v1-saturn chapter for chapter-active state.
      expect(stack.director.activeChapter?.slug).toBe('v1-saturn');

      // Apply the framing per the production cold-load path in main.ts.
      stack.controller.applyHeliocentricFraming({
        distanceAu: view.distanceAu,
        elevationDeg: view.elevationDeg,
        animated: false,
      });

      const camPosKm = stack.camera.position.length();
      // Within 100 km tolerance per the story's tolerance note.
      expect(Math.abs(camPosKm - 12 * KM_PER_AU)).toBeLessThan(100);
    } finally {
      stack.cleanup();
    }
  });

  it('cold-load /c/v2-neptune?view=heliocentric&distance=35&elevation=-30 — V2N Triton-bend framing', () => {
    window.history.replaceState(
      null,
      '',
      '/c/v2-neptune?view=heliocentric&distance=35&elevation=-30',
    );
    const stack = buildIntegrationStack();
    try {
      const view = stack.urlSync.parseHeliocentricView();
      expect(view.enabled).toBe(true);
      expect(view.distanceAu).toBe(35);
      expect(view.elevationDeg).toBe(-30);

      stack.controller.applyHeliocentricFraming({
        distanceAu: view.distanceAu,
        elevationDeg: view.elevationDeg,
        animated: false,
      });

      const camPosKm = stack.camera.position.length();
      expect(Math.abs(camPosKm - 35 * KM_PER_AU)).toBeLessThan(100);
      // Negative elevation → camera below the ecliptic.
      expect(stack.camera.position.y).toBeLessThan(0);
    } finally {
      stack.cleanup();
    }
  });

  it('camera.lookAt direction points at world origin (Sun)', () => {
    window.history.replaceState(
      null,
      '',
      '/c/v1-saturn?view=heliocentric&distance=12&elevation=30',
    );
    const stack = buildIntegrationStack();
    try {
      const view = stack.urlSync.parseHeliocentricView();
      stack.controller.applyHeliocentricFraming({
        distanceAu: view.distanceAu,
        elevationDeg: view.elevationDeg,
        animated: false,
      });

      // Forward axis = camera-local -Z applied to its world quaternion.
      // It should point from camera position toward the world origin.
      const forward = new Vector3(0, 0, -1).applyQuaternion(
        stack.camera.quaternion,
      );
      const toOrigin = stack.camera.position.clone().negate().normalize();
      expect(forward.dot(toOrigin)).toBeGreaterThan(0.999);
    } finally {
      stack.cleanup();
    }
  });

  it('manualCameraSuspended === true: applyHeliocentricFraming is a no-op (PBD carve-out)', () => {
    window.history.replaceState(
      null,
      '',
      '/c/v1-saturn?view=heliocentric&distance=12&elevation=30',
    );
    const stack = buildIntegrationStack();
    try {
      // User-positioned the camera somewhere arbitrary first.
      stack.camera.position.set(123, 456, 789);
      const before = stack.camera.position.clone();

      stack.controller.manualCameraSuspended = true;
      stack.controller.applyHeliocentricFraming({
        distanceAu: 12,
        elevationDeg: 30,
        animated: false,
      });

      // Camera position unchanged — the PBD carve-out blocked the call.
      expect(stack.camera.position.x).toBe(before.x);
      expect(stack.camera.position.y).toBe(before.y);
      expect(stack.camera.position.z).toBe(before.z);
      // Engine flag never flipped.
      expect(stack.engine.flips.length).toBe(0);
    } finally {
      stack.cleanup();
    }
  });

  it('reverse case: /c/v1-jupiter (no ?view=heliocentric) — view parser returns enabled=false', () => {
    window.history.replaceState(null, '', '/c/v1-jupiter');
    const stack = buildIntegrationStack();
    try {
      const view = stack.urlSync.parseHeliocentricView();
      expect(view.enabled).toBe(false);
      // Defaults still populate for caller convenience.
      expect(view.distanceAu).toBe(10);
      expect(view.elevationDeg).toBe(20);

      // The chapter resolves normally and ChapterDirector activates v1-jupiter.
      const v1Jupiter = findChapterBySlug('v1-jupiter');
      expect(v1Jupiter).not.toBeNull();
      expect(stack.director.activeChapter?.slug).toBe('v1-jupiter');
    } finally {
      stack.cleanup();
    }
  });

  it('homepage `/` route: enabled=false (mode is opt-in via query param only)', () => {
    window.history.replaceState(null, '', '/');
    const stack = buildIntegrationStack();
    try {
      const view = stack.urlSync.parseHeliocentricView();
      expect(view.enabled).toBe(false);
    } finally {
      stack.cleanup();
    }
  });

  it('out-of-range params clamp lenient: /c/v1-saturn?view=heliocentric&distance=-5&elevation=200', () => {
    window.history.replaceState(
      null,
      '',
      '/c/v1-saturn?view=heliocentric&distance=-5&elevation=200',
    );
    const stack = buildIntegrationStack();
    try {
      const view = stack.urlSync.parseHeliocentricView();
      expect(view.enabled).toBe(true);
      // Distance clamped to lower bound (1 AU).
      expect(view.distanceAu).toBe(1);
      // Elevation clamped to upper bound (89°).
      expect(view.elevationDeg).toBe(89);

      stack.controller.applyHeliocentricFraming({
        distanceAu: view.distanceAu,
        elevationDeg: view.elevationDeg,
        animated: false,
      });
      // Camera lands at the clamped 1 AU distance.
      const camPosKm = stack.camera.position.length();
      expect(Math.abs(camPosKm - 1 * KM_PER_AU)).toBeLessThan(100);
    } finally {
      stack.cleanup();
    }
  });
});
