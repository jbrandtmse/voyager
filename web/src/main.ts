// Story 1.7 — design-system style chain. tokens.css MUST load first so all
// downstream consumers (fonts.css unicode-ranges, global.css var(--v-*)
// references, component CSS) can resolve the tokens. Order matters.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/global.css';
import './styles/breakpoints.css';

import { GPUCapabilityProbe } from './boot/gpu-capability-probe';
import { getUrlParams } from './boot/url-params';
import { RenderEngine } from './render/render-engine';
import {
  isPrecisionSmokeMode,
  startPrecisionSmoke,
} from './dev/precision-smoke';
import { ManifestLoader, type Manifest } from './services/manifest-loader';
import { ChunkLoader } from './services/chunk-loader';
import { EphemerisService } from './services/ephemeris-service';
import {
  isEphemerisPerfMode,
  startEphemerisPerfHarness,
} from './dev/ephemeris-perf';
import { startFirstPaint } from './boot/first-paint';
import { SpacecraftModels } from './render/spacecraft-models';
import { TrajectoryLines } from './render/trajectory-lines';

const MANIFEST_URL = '/data/manifest.json';

const bootstrap = (): void => {
  const params = getUrlParams();
  const capabilities = GPUCapabilityProbe.run();

  const canvas = ensureCanvas();

  if (isPrecisionSmokeMode(params.devMode)) {
    // Dev-mode precision smoke scene (Story 1.5 AC5). Renders 1 m + 1 cm
    // cubes with a 30 s orbit from 1 m to 165 AU and back to verify
    // reverse-Z + floating-origin precision visually. Does not need the
    // manifest or ephemeris pipeline.
    const handle = startPrecisionSmoke(capabilities, canvas, params.forceLogDepth);
    window.addEventListener('resize', () => {
      sizeCanvasToWindow(canvas);
      handle.engine.setSize(window.innerWidth, window.innerHeight);
    });
    return;
  }

  if (isEphemerisPerfMode(params.perfMode)) {
    // Story 1.6 AC5 — interpolation perf harness. Loads manifest + every
    // V1/V2 chunk and reports median/p95/p99 cost on a 1000-iter sweep.
    void (async () => {
      const manifest = await ManifestLoader.load(MANIFEST_URL);
      const chunkLoader = new ChunkLoader();
      await startEphemerisPerfHarness(manifest, chunkLoader);
    })().catch((err) => {
      console.error('[ephemeris-perf] failed:', err);
      renderCanvasOverlayError(canvas, String(err));
    });
    return;
  }

  // Normal app flow: empty scene. Subsequent stories populate it.
  const engine = new RenderEngine(capabilities, {
    forceLogDepth: params.forceLogDepth,
  });
  engine.init(canvas);
  engine.start();

  // Story 1.9 — first-paint sequence + Story 1.11 HUD wiring:
  //   1. Mount <v-title-card> immediately (no waiting for the manifest)
  //   2. Mount <v-timeline-scrubber>, <v-play-button>, <v-speed-multiplier>
  //      hidden until the card dissolves
  //   3. Mount <v-hud> wired with ClockManager + RenderEngine.onFrame for
  //      per-frame visible-DOM mutation (architecture line 424)
  //   4. Parse ?t= via URLSync — silent reject per NFR-S7
  //   5. Kick off manifest load in parallel; once it lands, wire the
  //      EphemerisService into <v-hud-distance> so V1/V2 readouts show
  //      real values.
  const firstPaintHandle = startFirstPaint(
    canvas.parentElement ?? document.body,
    { renderEngine: engine },
  );

  // Story 1.12 — spacecraft + trajectory rendering. SpacecraftModels is
  // constructed up-front so the scene-graph structure is stable; its GLB
  // load is async and adds the body mesh once it lands. TrajectoryLines
  // construction is deferred until the EphemerisService is available (it
  // samples the polyline at construction).
  const spacecraftModels = new SpacecraftModels();
  engine.worldGroup.add(spacecraftModels.root);
  spacecraftModels.load().catch((err: unknown) => {
    console.error('[main] spacecraft GLB load failed:', err);
  });
  let trajectoryLines: TrajectoryLines | null = null;

  // Story 1.6 AC1 + Task 10: load the manifest at boot. Once loaded, we
  // construct the ChunkLoader + EphemerisService and wire the service into
  // the HUD so the distance readouts come alive. Before the manifest lands
  // the HUD shows "— AU" placeholders (graceful per Story 1.11 AC4).
  ManifestLoader.load(MANIFEST_URL).then(
    async (manifest) => {
      const chunkLoader = new ChunkLoader();
      const ephemerisService = new EphemerisService(manifest, chunkLoader);
      firstPaintHandle.hud.ephemerisService = ephemerisService;

      // Hook spacecraft updates onto the render loop immediately — V1/V2
      // tick() handles chunk-load gaps via hold-previous, so it's safe even
      // before any chunks are cached.
      engine.onFrame((et: number) => {
        spacecraftModels.tick(et, ephemerisService);
        if (trajectoryLines !== null) trajectoryLines.tick(et);
      });

      // Story 1.12 — the trajectory polyline samples at construction time,
      // so the V1 + V2 chunks must be in the ChunkLoader cache BEFORE we
      // construct TrajectoryLines. Without this prefetch, every sample
      // would hit a cache miss and the polyline would be built from zeros
      // (visible as a degenerate dot at the Sun). Spacecraft positions
      // themselves remain correct — they re-query each frame.
      await prefetchSpacecraftChunks(manifest, chunkLoader);

      trajectoryLines = new TrajectoryLines(
        (et, naifId) => ephemerisService.getPosition(et, naifId),
        { width: window.innerWidth, height: window.innerHeight },
      );
      engine.worldGroup.add(trajectoryLines.root);
    },
    (err: unknown) => {
      console.error('[manifest] load failed:', err);
      renderCanvasOverlayError(canvas, String(err));
    },
  );

  window.addEventListener('resize', () => {
    sizeCanvasToWindow(canvas);
    engine.setSize(window.innerWidth, window.innerHeight);
    if (trajectoryLines !== null) {
      trajectoryLines.setResolution(window.innerWidth, window.innerHeight);
    }
  });
};


/**
 * Story 1.12 — eagerly load every V1 + V2 ephemeris chunk so the trajectory
 * polyline's one-shot sampling at construction sees real position data
 * instead of cache-miss `null`s (which would collapse the polyline to a
 * zero-vector dot at the Sun). Errors are logged but don't reject — partial
 * coverage produces a less-smooth polyline (held-previous segments), which
 * is the same degraded-but-functional posture as a runtime chunk-load gap.
 */
const prefetchSpacecraftChunks = async (
  manifest: Manifest,
  chunkLoader: ChunkLoader,
): Promise<void> => {
  const SPACECRAFT_NAIF_IDS = new Set<number>([-31, -32]);
  const loads: Promise<unknown>[] = [];
  for (const body of manifest.bodies) {
    if (!SPACECRAFT_NAIF_IDS.has(body.naifId)) continue;
    for (const file of body.files) {
      loads.push(
        chunkLoader.load(file).catch((err: unknown) => {
          console.warn(
            `[main] trajectory prefetch failed for ${file.url}; polyline will hold previous segment:`,
            err,
          );
        }),
      );
    }
  }
  await Promise.all(loads);
};

const renderCanvasOverlayError = (canvas: HTMLCanvasElement, message: string): void => {
  // Placeholder for Story 1.8's full fallback page. Renders a single overlay
  // div on top of the canvas with the error text.
  const existing = document.querySelector('#voyager-manifest-error');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'voyager-manifest-error';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.right = '0';
  overlay.style.padding = '12px 16px';
  overlay.style.background = 'rgba(160, 0, 0, 0.85)';
  overlay.style.color = '#fff';
  overlay.style.fontFamily = 'system-ui, sans-serif';
  overlay.style.fontSize = '13px';
  overlay.style.zIndex = '99999';
  overlay.textContent = `Voyager data load failed — ${message}`;
  (canvas.parentElement ?? document.body).appendChild(overlay);
};

const ensureCanvas = (): HTMLCanvasElement => {
  const existing = document.querySelector<HTMLCanvasElement>('canvas#voyager-canvas');
  if (existing) {
    sizeCanvasToWindow(existing);
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.id = 'voyager-canvas';
  sizeCanvasToWindow(canvas);

  // Mount the canvas into the existing #app container if present, else body.
  const mount = document.getElementById('app') ?? document.body;
  // Clear placeholder content from the Vite scaffold.
  while (mount.firstChild) {
    mount.removeChild(mount.firstChild);
  }
  mount.appendChild(canvas);
  return canvas;
};

const sizeCanvasToWindow = (canvas: HTMLCanvasElement): void => {
  canvas.style.display = 'block';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
