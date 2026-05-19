import './style.css';

import { GPUCapabilityProbe } from './boot/gpu-capability-probe';
import { getUrlParams } from './boot/url-params';
import { RenderEngine } from './render/render-engine';
import {
  isPrecisionSmokeMode,
  startPrecisionSmoke,
} from './dev/precision-smoke';
import { ManifestLoader } from './services/manifest-loader';
import { ChunkLoader } from './services/chunk-loader';
import {
  isEphemerisPerfMode,
  startEphemerisPerfHarness,
} from './dev/ephemeris-perf';

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

  // Story 1.6 AC1 + Task 10: load the manifest at boot. ChunkLoader and
  // EphemerisService aren't wired into the (empty) scene yet — the
  // cruise-viewer scene in Story 1.10+ consumes them. We load the manifest
  // early so a malformed bake surfaces a friendly error before users see a
  // blank screen.
  ManifestLoader.load(MANIFEST_URL).then(
    (_manifest) => {
      // ChunkLoader is constructed but not yet referenced; held for the
      // future scene wiring. We don't store it on a global because the
      // empty scene doesn't use it; future story refactors the wiring.
      void new ChunkLoader();
    },
    (err: unknown) => {
      console.error('[manifest] load failed:', err);
      renderCanvasOverlayError(canvas, String(err));
    },
  );

  window.addEventListener('resize', () => {
    sizeCanvasToWindow(canvas);
    engine.setSize(window.innerWidth, window.innerHeight);
  });
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
