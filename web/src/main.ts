// Story 1.7 — design-system style chain. tokens.css MUST load first so all
// downstream consumers (fonts.css unicode-ranges, global.css var(--v-*)
// references, component CSS) can resolve the tokens. Order matters.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/global.css';
import './styles/breakpoints.css';
// Story 2.7 — editorial layout for the /about route surface + homepage
// footer link. The stylesheet stays in the chain even for the simulation
// surface because the homepage footer ("Attributions" link) uses its
// `.v-app-footer` rules.
import './styles/about.css';
// Story 2.9 — editorial side-panel typography for `<v-chapter-copy>` (Light
// DOM, so tokens cascade directly). Loaded unconditionally because the
// component is part of the simulation surface, not chrome.
import './styles/chapter-copy.css';
// Story 4.2 — restore-camera affordance stylesheet. The button is a Light-
// DOM native `<button>` (no Lit shadow root); CSS lives outside the
// component graph and is loaded here so the `[data-manual-camera="true"]`
// attribute selector resolves regardless of which boot path mounted the
// button.
import './styles/restore-camera.css';

import { GPUCapabilityProbe } from './boot/gpu-capability-probe';
import { getUrlParams } from './boot/url-params';
import { ClockManager } from './services/clock-manager';
import { ChapterDirector } from './services/chapter-director';
import { URLSync } from './services/url-sync';
import { URLRouter } from './services/url-router';
import { EmbedModeState } from './services/embed-mode-state';
import { ALL_CHAPTERS } from './chapters/registry';
import { PaleBlueDot } from './chapters/pale-blue-dot';
import { RenderEngine } from './render/render-engine';
import { VoyagerCameraController } from './render/voyager-camera-controller';
import { mountCameraRestoreAffordance } from './boot/camera-restore-affordance';
import { resolveChapterDefaultFraming } from './chapters/chapter-default-framing';
import { worldVec3, type WorldVec3 } from './types/branded';
import {
  isPrecisionSmokeMode,
  startPrecisionSmoke,
} from './dev/precision-smoke';
import { ManifestLoader, type Manifest } from './services/manifest-loader';
import { ChunkLoader } from './services/chunk-loader';
import { EphemerisService } from './services/ephemeris-service';
import { AttitudeService } from './services/attitude-service';
import { ViewFrameService } from './services/view-frame';
import {
  MissionPhaseFSM,
  type MissionPhaseEvent,
  SPACECRAFT_NAIF_IDS,
  GAS_GIANT_NAIF_IDS,
} from './services/mission-phase-fsm';
import {
  isEphemerisPerfMode,
  startEphemerisPerfHarness,
} from './dev/ephemeris-perf';
import { startFirstPaint, mountAttributionsFooter } from './boot/first-paint';
import './components/v-about-page';
import { SpacecraftModels } from './render/spacecraft-models';
import { AttitudeApplier } from './render/attitude-applier';
import { BoresightRenderer } from './render/boresight-renderer';
import { TrajectoryLines } from './render/trajectory-lines';
import { CelestialBodies } from './render/celestial-bodies';
import { Skybox } from './render/skybox';
import { TextureLoaderService } from './services/texture-loader';
import {
  isFpsReadoutMode,
  startFpsReadout,
} from './dev/fps-readout';
import { CELESTIAL_BODY_NAIF_IDS } from './constants/body-radii';
import type { Spacecraft } from './types/chapter';

const MANIFEST_URL = '/data/manifest.json';

/**
 * Story 4.1 AC6 — map a chapter's `spacecraft` field to the NAIF SPK ID
 * the `<v-attitude-indicator>` consumes via `setActiveSpacecraft`. The
 * `'both'` case isn't used by any current chapter spec (Story 2.1 didn't
 * ship one) but the type allows it; we default to V1 (-31) to match the
 * indicator's stub default (Story 3.6 AC4) so the UI remains stable if
 * a future chapter declares 'both'.
 */
const naifIdForSpacecraft = (s: Spacecraft): -31 | -32 => {
  if (s === 'v2') return -32;
  return -31; // 'v1' or 'both'
};

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

  // Story 1.15 AC1 — construct the shared ClockManager up front so it can
  // drive RenderEngine's per-frame ET (replacing the wall-clock placeholder)
  // AND be wired into the scrubber / play button / speed multiplier / HUD
  // via startFirstPaint below. RenderEngine.tick() advances the clock by
  // the wall-clock delta between ticks; the HUD + scene-graph consumers
  // read `clockManager.simTimeEt` from RenderEngine.onFrame callbacks.
  const clockManager = new ClockManager();

  // Story 2.5 — strict-boolean parse of `?embed=true` at boot. The flag
  // is session-immutable (no public setter on EmbedModeState) and gates
  // first-paint's conditional `appendChild` calls for chrome elements
  // (chapter-index toggle today; about / methodology / help in future
  // stories). It is also carried by URLSync so every writeback preserves
  // `&embed=true` (AC4). Strict equality against the literal lowercase
  // `"true"` rejects `1`, `yes`, `TRUE`, `on`, empty, etc. per NFR-S7.
  const embedMode = EmbedModeState.fromSearch(window.location.search);

  // Story 2.4 — parse the full URL (path + query) before any subsystem
  // wires up. `parseInitialPath()` covers both shapes:
  //   - `/` (or `/?t=<iso>`)          → chapter = null
  //   - `/c/<known-slug>?t=<iso>`     → chapter resolved + ET parsed
  //   - `/c/<unknown-slug>...`        → console.warn + replaceState('/')
  //                                     → falls through to the homepage branch
  // The resulting `initialEt` is what we seed ClockManager with via
  // scrubTo (which clamps + pauses uniformly). first-paint reuses this
  // URLSync instance (no second `?t=` parse) so the chapter path is
  // preserved through the scrubber's first writeback.
  //
  // Story 2.5 — pass `embedEnabled` so every writeback preserves
  // `&embed=true`. The flag is captured here once from the URL; even if
  // the user mutates `?embed` in the address bar later, the URLSync's
  // captured state is fixed (mirrors EmbedModeState's immutability).
  const urlSync = new URLSync({ embedEnabled: embedMode.enabled });
  const initialUrlState = urlSync.parseInitialPath();
  clockManager.scrubTo(initialUrlState.initialEt);

  // Story 2.7 — `/about` route. When cold-loading the about page we mount
  // ONLY `<v-about-page>` (no canvas, HUD, scrubber, chapter index). On
  // popstate from / or /c/<slug> into /about (or the reverse) we trigger a
  // full reload — the simplest correct way to flip between the two
  // top-level surfaces without leaking simulation state. The reload is
  // handled by a route-change listener installed below the simulation
  // bootstrap path so the listener wiring stays close to URLRouter.
  if (initialUrlState.kind === 'about') {
    mountAboutSurface();
    // Install a tiny popstate handler so back/forward across the about ↔
    // simulation boundary force a reload (matching the cold-load contract
    // for either surface). URLSync.installPopstateHandler is also wired
    // here so `&embed=true` preservation and slug parsing stay consistent.
    urlSync.installPopstateHandler((state) => {
      if (state.kind !== 'about') {
        window.location.reload();
      }
    });
    return;
  }

  const engine = new RenderEngine(capabilities, {
    forceLogDepth: params.forceLogDepth,
    clockManager,
  });
  engine.init(canvas);
  engine.start();

  // Story 2.1 — ChapterDirector FSM. Constructed with the frozen
  // ALL_CHAPTERS registry and driven by the same per-frame ET that
  // every other onFrame consumer reads. The director itself does NOT
  // hold a ClockManager reference (it's pure data); the wire-up is
  // entirely the onFrame callback below, which is the established
  // Story 1.15 pattern for ET fan-out.
  const chapterDirector = new ChapterDirector(ALL_CHAPTERS);

  // Story 5.1 AC3 — Pale Blue Dot dedicated module per ADR-0014.
  // Path A integration topology: the ChapterDirector itself remains
  // unchanged (no `register(spec | module)` overload — that would be
  // Path B); instead we wire a subscriber here that flips an activation
  // flag on `held` enter / `exiting` exit, and the per-frame block
  // below conditionally calls `paleBlueDot.update(et)` only while
  // active. Outside the PBD window the module's per-frame work is
  // zero — the simulation behaves identically to pre-Story-5.1 baseline.
  //
  // The choice of Path A (over Path B's director extension) is
  // documented in `docs/adr/0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md`
  // (Story 5.1 amendment block) per AC3's "either way, the choice is
  // recorded" obligation.
  const paleBlueDot = new PaleBlueDot();
  let paleBlueDotActive = false;
  chapterDirector.subscribe((event) => {
    if (event.chapter.slug !== 'pale-blue-dot') return;
    if (event.to === 'held') {
      paleBlueDotActive = true;
    } else if (event.from === 'held') {
      // Leaving the held window in either direction (exiting forward
      // or entering reverse). Deactivate to keep the per-frame work
      // zero outside the PBD window.
      paleBlueDotActive = false;
    }
  });

  engine.onFrame((et: number) => {
    chapterDirector.update(et);
    // Story 5.1 AC3 — drive the PBD module only while it's active
    // (the director's `held` window for `pale-blue-dot`). The module
    // is itself inactive-frame safe, but gating here keeps the
    // pre-Story-5.1 baseline identical at every non-PBD frame.
    if (paleBlueDotActive) {
      paleBlueDot.update(et);
    }
  });

  // Integration AC8 (Story 2.1) — DEV-only debug surface so the lead's
  // Chrome DevTools MCP smoke can read `window.__voyagerDebug.chapterDirector`
  // and assert on the active chapter at a scrubbed ET. Stripped from
  // production builds by Vite's `import.meta.env.DEV` constant folding.
  //
  // Story 5.1 AC7 — extended with `paleBlueDot` so the lead's PBD smoke
  // can probe `__voyagerDebug.paleBlueDot.currentSubstate` to verify
  // `idle` on cold-load at the PBD anchor ET.
  //
  // Story 5.2 AC9 — the same module instance also exposes
  // `currentTargetNaifId` (NAIF SPK ID for the active sweeping substate's
  // target body — null outside sweeping substates) and
  // `currentPlatformOverrideQuat` (the most recent SLERP-interpolated aim
  // quaternion in BUS frame — null outside sweeping substates) via plain
  // instance getters. The lead's PBD smoke probes:
  //   __voyagerDebug.paleBlueDot.currentSubstate            -> string
  //   __voyagerDebug.paleBlueDot.currentTargetNaifId        -> number | null
  //   __voyagerDebug.paleBlueDot.currentPlatformOverrideQuat -> Quaternion | null
  // to verify the AC9 substate / override / target wire-up.
  if (import.meta.env.DEV) {
    const w = window as unknown as { __voyagerDebug?: Record<string, unknown> };
    w.__voyagerDebug = {
      ...(w.__voyagerDebug ?? {}),
      chapterDirector,
      paleBlueDot,
    };
  }

  // Story 1.13 AC5 — FPS readout dev-mode (?perf=fps). Attached to the
  // engine immediately so the very first ticks are recorded. The overlay
  // is unobtrusive (top-right, monospace, 4 lines) and disposed via the
  // returned handle on hot-reload (not currently wired but available).
  if (isFpsReadoutMode(params.perfMode)) {
    startFpsReadout(engine);
  }

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
  //
  // Story 2.2 — the shared ChapterDirector is also passed here so the
  // scrubber's mission-variant paints chapter markers (vertebrae) and
  // highlights the active chapter as the simulation ET crosses each
  // chapter window. The director is already driven from `engine.onFrame`
  // above; first-paint sets it on the scrubber BEFORE connectedCallback
  // runs so the marker-subscription wires in cleanly.
  const firstPaintHandle = startFirstPaint(
    canvas.parentElement ?? document.body,
    {
      renderEngine: engine,
      clockManager,
      chapterDirector,
      urlSync,
      // Story 2.5 — skip mounting `<v-chapter-index>` (and future
      // chrome elements) when embed mode is enabled. AC2.
      embedEnabled: embedMode.enabled,
    },
  );

  // Story 4.1 AC6 — close Epic 3 retro Action #3: route ChapterDirector
  // `held` transitions to `<v-attitude-indicator>.setActiveSpacecraft(naifId)`
  // so the inline HUD indicator reads the right spacecraft's bus attitude
  // on V2 chapter pages (previously stuck on the V1 stub default per the
  // Story 4.0 smoke gap at /c/v2-saturn). The Story 3.6 indicator default
  // is V1 (-31); we only flip to -32 when a V2 chapter holds. On cruise
  // (`event.to === 'out'`) we intentionally do NOT call the setter — the
  // indicator's last-known regime stays painted (avoids a placeholder
  // flicker between chapters).
  //
  // Installed AFTER firstPaintHandle so the optional-chain has the HUD
  // handle available, and BEFORE the synchronous cold-load seed below so
  // a cold-load arriving inside a V2 chapter window (e.g. /c/v2-saturn)
  // fires the wire on the seed itself rather than waiting for the first
  // ChapterDirector transition crossing — the indicator paints the right
  // spacecraft on the first frame.
  // The subscriber records the last spacecraft seen on a `held` transition
  // even if the indicator isn't yet mounted (Lit's first render is
  // microtask-async after the host's connectedCallback). After Lit's first
  // render flush below we replay the last value so cold-load arrival inside
  // a V2 chapter window paints correctly on the first user-visible frame.
  let lastHeldNaifId: -31 | -32 | null = null;
  chapterDirector.subscribe((event) => {
    if (event.to !== 'held') return;
    const naifId = naifIdForSpacecraft(event.chapter.spacecraft);
    lastHeldNaifId = naifId;
    firstPaintHandle.hud.attitudeIndicator?.setActiveSpacecraft(naifId);
  });

  // Story 2.4 — seed the ChapterDirector FSM synchronously to the cold-load
  // ET BEFORE the URLRouter subscribes. `engine.onFrame((et) => director.update(et))`
  // above only REGISTERS the per-frame callback; the first invocation
  // happens on the next RAF tick which is async. If URLRouter subscribed
  // before this seed, the first director.update would fire `entering→held`
  // transitions that the router would translate into a redundant
  // replaceState write (worst case: cold-load `/` morphs to
  // `/c/launch-v2` because MISSION_START_ET falls inside launch-v2's
  // window). Seeding here matches what the integration tests model and
  // honors the URL contract that cold-load arrival is the canonical
  // state — not a transition the router needs to mirror.
  chapterDirector.update(clockManager.simTimeEt);

  // Story 4.1 AC6 (smoke fix 2026-05-23): the sync seed above fires `held`
  // transitions, but `firstPaintHandle.hud.attitudeIndicator` is still null
  // at that moment because <v-hud>'s Lit render runs microtask-async after
  // connectedCallback. The subscriber's optional-chain therefore no-ops.
  // After <v-hud>'s first render completes the indicator is reachable —
  // replay the last held naifId (or fall back to the current activeChapter)
  // so /c/v2-saturn cold-loads paint the V2 indicator instead of the V1
  // stub default. The lead-driven Chrome DevTools MCP smoke (Story 4.1 AC8
  // verified the absence of this replay was the load-bearing bug closing
  // Epic 3 retro Action #3 required).
  void firstPaintHandle.hud.updateComplete?.then(() => {
    const naifId =
      lastHeldNaifId ??
      (chapterDirector.activeChapter
        ? naifIdForSpacecraft(chapterDirector.activeChapter.spacecraft)
        : null);
    if (naifId !== null) {
      firstPaintHandle.hud.attitudeIndicator?.setActiveSpacecraft(naifId);
    }
  });

  // Story 2.4 — install the URL router AFTER first-paint so document-level
  // `chapter-jump` listeners are attached before the scrubber + chapter
  // index begin dispatching them. The router subscribes to chapter-jump
  // (user-driven pushState), ChapterDirector transitions (director-driven
  // replaceState on boundary crossings), and popstate (browser
  // back/forward).
  const urlRouter = new URLRouter({
    urlSync,
    clockManager,
    chapterDirector,
    initialRouteKind: initialUrlState.kind,
  }).install();

  // Story 2.7 AC4 — homepage footer "Attributions" link. Skipped in embed
  // mode (extends the Story 2.5 chrome-skip pattern). Clicking the link
  // pushState-navigates to /about#attribution + triggers a full reload to
  // swap the surface (simulation → about page); navigating via popstate
  // is handled by the URLRouter route-change listener below. The footer
  // host is the same parent the canvas lives in so it shares the embed-
  // mode chrome-skip discipline.
  const footerHost = canvas.parentElement ?? document.body;
  mountAttributionsFooter(footerHost, embedMode.enabled, (url) => {
    // Surface flip from simulation → about. `location.assign(url)` against
    // a cross-pathname target ('/' or '/c/<slug>' → '/about#attribution')
    // forces a fresh document load, which is the contract the about
    // surface boots under. We intentionally do NOT pushState first —
    // pushing the target URL first would make `location.assign` a
    // same-document hash navigation that never reloads, leaving the
    // simulation surface mounted under the new URL.
    window.location.assign(url);
  });

  // Story 2.7 — when the user navigates back/forward across the
  // /about ↔ simulation boundary, the router emits a route-change event;
  // we trigger a full reload to mount the appropriate surface.
  urlRouter.onRouteChange((_from, to) => {
    if (to === 'about') {
      window.location.reload();
    }
  });

  // Story 4.2 — VoyagerCameraController + restore affordance.
  //
  // The controller is constructed here (post-firstPaint so the canvas
  // parent + speed-multiplier are mounted), but its `getActiveTarget`
  // and `getViewFrameOrigin` closures reference services that join
  // post-manifest. We track those services through mutable refs and the
  // closures null-check; before the manifest lands the controller treats
  // every gesture as cruise (Sun-at-origin pivot) which is the correct
  // behavior anyway (the chapter director is also empty pre-manifest).
  //
  // The restore affordance mounts adjacent to `<v-speed-multiplier>` (the
  // canvas's parent hosts both). `attributeHost` is the same parent so
  // the `[data-manual-camera="true"]` CSS selector promotes the button
  // when the controller flips the engine's manual-camera flag.
  let ephemerisServiceRef: EphemerisService | null = null;
  let viewFrameServiceRef: ViewFrameService | null = null;
  const cameraController = new VoyagerCameraController({
    camera: engine.camera,
    domElement: canvas,
    renderEngine: engine,
    getActiveTarget: (): WorldVec3 | null => {
      const active = chapterDirector.activeChapter;
      if (active === null) return null;
      if (active.targetBody === undefined) return null;
      if (ephemerisServiceRef === null) return null;
      const bodyPos = ephemerisServiceRef.getPosition(
        clockManager.simTimeEt,
        active.targetBody,
      );
      if (bodyPos === null) return null;
      // The controller orbits in the shifted-render-space frame (post-
      // floating-origin); subtract the ViewFrame origin offset so the
      // pivot tracks the body in the same frame the camera lives in.
      const off =
        viewFrameServiceRef !== null
          ? viewFrameServiceRef.getTransform(
              clockManager.simTimeEt,
              active,
            ).originOffsetWorld
          : null;
      if (off === null) return bodyPos;
      return worldVec3(
        bodyPos[0] - off[0],
        bodyPos[1] - off[1],
        bodyPos[2] - off[2],
      );
    },
    getViewFrameOrigin: (): WorldVec3 => {
      if (viewFrameServiceRef === null) {
        return worldVec3(0, 0, 0);
      }
      return viewFrameServiceRef.getTransform(
        clockManager.simTimeEt,
        chapterDirector.activeChapter,
      ).originOffsetWorld;
    },
    // Story 4.5 AC3 — chapter-driven default framing. Reads the active
    // chapter's `defaultFraming` field via the pure helper at
    // `chapters/chapter-default-framing.ts`; null result falls back to
    // the controller's built-in encounter / cruise defaults.
    resolveDefaultFraming: (activeTarget) =>
      resolveChapterDefaultFraming(chapterDirector.activeChapter, activeTarget),
  });
  cameraController.attach();

  const restoreAffordance = mountCameraRestoreAffordance({
    host: canvas.parentElement ?? document.body,
    attributeHost: canvas.parentElement ?? document.body,
    controller: cameraController,
    renderEngine: engine,
  });
  // Reference the dispose handle so the linter doesn't flag the unused
  // local; the SPA lifetime is the document, so we never explicitly
  // dispose (the page unload tears everything down).
  void restoreAffordance;

  // Story 4.5 AC3 (smoke cycle-2 fix 2026-05-23): auto-trigger the
  // chapter-default framing on `to === 'held'` transitions for chapters
  // carrying `defaultFraming`. Without this subscriber the resolver IS
  // registered but never CALLED — the camera stays at (0, 0, 0) (world
  // origin, embedded inside Jupiter post-floating-origin).
  //
  // Gate on services being ready: the framing math reads
  // `getActiveTarget()` which needs `ephemerisServiceRef` +
  // `viewFrameServiceRef` to be live. Before the manifest resolves
  // those refs are null and `getActiveTarget()` returns null — at
  // which point the controller's fallback would snap to cruise-default
  // (Sun-centered ~10 AU), which is worse than doing nothing. The
  // sibling cold-load replay below fires after the manifest lands.
  //
  // Animated path (rather than instant) for runtime transitions —
  // matches the R-key restore semantics + Story 4.1's smoothstep
  // ViewFrame blend on chapter entry. Cold-load path uses instant
  // because the camera starts at world origin.
  //
  // Suppress immediately AFTER a user gesture flipped manualCameraActive
  // to true — the user explicitly took control; we don't override.
  chapterDirector.subscribe((event) => {
    if (event.to !== 'held') return;
    if (event.chapter.defaultFraming === undefined) return;
    if (ephemerisServiceRef === null) return;
    if (viewFrameServiceRef === null) return;
    if (engine.manualCameraActive) return;
    cameraController.applyDefaultFraming({ animated: true });
  });

  // Story 2.2 — DEV-only debug surface mirroring Story 2.1's pattern so
  // the lead's Chrome DevTools MCP smoke can read
  // `window.__voyagerDebug.scrubber` and assert on marker DOM state.
  // Story 2.3 extends the same surface with `chapterIndex` so the
  // lead-driven Chrome DevTools MCP smoke (Integration AC8) can open
  // the panel, exercise keyboard nav + global digits, and inspect
  // option / ARIA state.
  if (import.meta.env.DEV) {
    const w = window as unknown as { __voyagerDebug?: Record<string, unknown> };
    w.__voyagerDebug = {
      ...(w.__voyagerDebug ?? {}),
      scrubber: firstPaintHandle.scrubber,
      // Story 4.4 AC8 — expose both scrubber instances (mission + detail)
      // as an array so the lead's Chrome DevTools MCP smoke can introspect
      // both at once. The detail-variant entry is null in test mounts
      // that didn't wire a ChapterDirector; production always has both.
      timelineScrubbers: [
        firstPaintHandle.scrubber,
        firstPaintHandle.detailScrubber,
      ].filter((s): s is NonNullable<typeof s> => s !== null),
      // Story 2.5 — null in embed mode (chapter-index is not mounted).
      // The MCP smoke must tolerate the missing key by checking embedMode
      // directly when verifying AC2.
      chapterIndex: firstPaintHandle.chapterIndex,
      // Story 2.8 — same null-in-embed-mode contract for the help
      // overlay. Lead Chrome DevTools MCP smoke checks AC1 (icon
      // present non-embed) + AC2/AC6 (?/A no-ops in embed) via this
      // handle plus the document-level keydown shortcut path.
      helpOverlay: firstPaintHandle.helpOverlay,
      // Story 2.9 — chapter-copy panel is editorial content (mounted in
      // both default and embed modes). Null only when no director was
      // wired (defensive — the simulation surface always wires one).
      // Lead MCP smoke uses this to assert AC1 on cold-load of
      // /c/v1-heliopause + /c/v2-heliopause.
      chapterCopy: firstPaintHandle.chapterCopy,
      urlRouter,
      urlSync,
      // Story 2.5 — expose the boot-time embed flag so the lead-driven
      // MCP smoke can assert AC1 (`enabled === true` for `?embed=true`).
      embedMode,
      // Story 4.2 AC8 — expose the VoyagerCameraController + RenderEngine
      // for the lead's Chrome DevTools MCP smoke (probe
      // `__voyagerDebug.cameraController.restore()` and
      // `__voyagerDebug.renderEngine.manualCameraActive`).
      cameraController,
      renderEngine: engine,
    };
  }

  // Story 1.12 / Story 3.3 — spacecraft + trajectory rendering.
  // SpacecraftModels is constructed up-front so the scene-graph structure is
  // stable; its GLB load is async and adds the body LOD chain (4 LODs per
  // AC3) once it lands. The load is kicked off AFTER the manifest resolves
  // (below) so the manifest-driven LOD URLs flow through. Until then the
  // spacecraft group exists but contains only the label sprite.
  // TrajectoryLines construction is deferred until the EphemerisService is
  // available (it samples the polyline at construction).
  const spacecraftModels = new SpacecraftModels();
  engine.worldGroup.add(spacecraftModels.root);

  // Story 3.3 AC9 — DEV debug surface for the lead-driven Chrome DevTools MCP
  // smoke. Exposes the SpacecraftModels instance so the smoke probe can
  // resolve `__voyagerDebug.spacecraftModels.getHandle('voyager-1').{group,lod}`.
  // Stripped from production builds by Vite's `import.meta.env.DEV` constant
  // folding.
  if (import.meta.env.DEV) {
    const w = window as unknown as { __voyagerDebug?: Record<string, unknown> };
    w.__voyagerDebug = {
      ...(w.__voyagerDebug ?? {}),
      spacecraftModels,
    };
  }
  let trajectoryLines: TrajectoryLines | null = null;

  // Story 1.13 — celestial bodies + Milky Way skybox. Constructed before
  // the manifest lands so the scene graph is structurally stable; their
  // tick callbacks are wired once the EphemerisService is available. The
  // skybox loads its texture asynchronously and attaches to the
  // SkyboxGroup (NOT worldGroup) so it doesn't floating-origin-recenter
  // (Story 1.5 architectural contract — Architecture lines 374–376).
  // Story 4.3 cycle-6 — wire the WebGLRenderer into the TextureLoaderService
  // constructor so its internal `KTX2Loader` calls `detectSupport(renderer)`
  // during initialization. Without this, the loader doesn't know which
  // Basis Universal transcode target the GPU supports and refuses to decode
  // KTX2 textures at runtime with:
  //   `THREE.KTX2Loader: Missing initialization with `.detectSupport(renderer)`.`
  // The renderer is already initialized at this point (`engine.init(canvas)`
  // ran at line ~180); `engine.getRenderer()` returns the live instance.
  // This is the canonical Three.js KTX2 init pattern (same as Story 3.3's
  // SpacecraftModels GLB pipeline, which wires the renderer via
  // `KTX2Loader.detectSupport` in the GLTFLoader registration path).
  const rendererForTextures = engine.getRenderer();
  const textureLoader = new TextureLoaderService(
    rendererForTextures !== null ? { renderer: rendererForTextures } : undefined,
  );
  const skybox = new Skybox({ textureLoader });
  engine.skyboxGroup.add(skybox.root);
  let celestialBodies: CelestialBodies | null = null;
  // Story 4.3 AC3 — MissionPhaseFSM is constructed post-manifest (inside the
  // manifest-resolves block below); the per-frame onFrame closure captures
  // this binding so the FSM update can fire inside the existing canonical
  // onFrame body (preserving Story 3.4 / 3.5 ordering defenses).
  let missionPhaseFSMRef: MissionPhaseFSM | null = null;
  // Story 4.3 cycle-5 — cold-load SOI-state replay gate. The FSM's
  // `first update seeds silently` contract (AC3) is correct for a
  // "crossing INTO an SOI" observer — synthesizing a fake `soiEntered`
  // event on cold-load would corrupt the contract for downstream consumers
  // that genuinely need "did I just cross?" semantics. But AC4 + AC5
  // BOTH need the gas-giant texture upgrade + moon meshes on cold-load
  // when the spacecraft is ALREADY inside an SOI (e.g. opening
  // `/c/v1-jupiter` lands the simulation at V1's Jupiter encounter ET,
  // which is inside Jupiter's SOI). Resolution per Rule 5 (the
  // contradiction was discovered by the lead's MCP smoke at cycle-4):
  // add a one-shot "cold-load replay" that queries `getSoiState` for
  // every (spacecraft × gas-giant) pair AFTER the first FSM update and
  // calls the SAME consumer code path the `soiEntered` subscriber
  // calls. Gated by `coldLoadReplayDone` so it runs exactly once;
  // wired in via the forward-referenced `coldLoadReplayRef` so the
  // per-frame block (above, line ~625) can fire it after the first
  // FSM update completes.
  let coldLoadReplayDone = false;
  let coldLoadReplayRef: (() => void) | null = null;

  // Story 1.6 AC1 + Task 10: load the manifest at boot. Once loaded, we
  // construct the ChunkLoader + EphemerisService and wire the service into
  // the HUD so the distance readouts come alive. Before the manifest lands
  // the HUD shows "— AU" placeholders (graceful per Story 1.11 AC4).
  ManifestLoader.load(MANIFEST_URL).then(
    async (manifest) => {
      const chunkLoader = new ChunkLoader();
      const ephemerisService = new EphemerisService(manifest, chunkLoader);
      // Story 3.2 — AttitudeService is constructed AFTER EphemerisService so
      // the synthesized HGA-Earth-pointing cruise path can query both
      // spacecraft and Earth positions through the injected EphemerisService.
      // Shares the SAME ChunkLoader instance (one cache, one decoder).
      const attitudeService = new AttitudeService(
        manifest,
        chunkLoader,
        ephemerisService,
      );
      // Story 4.1 AC2 — ViewFrameService is constructed AFTER EphemerisService
      // (which it injects per ADR-0015 no-global-store) and wired into the
      // pre-existing RenderEngine via the setViewFrame post-construction
      // setter. The setter contract exists because RenderEngine is
      // constructed at boot (before the manifest lands); ViewFrame can only
      // exist after EphemerisService, so it joins post-manifest. The blend
      // is translation-only per ADR-0023; reduced-motion source defaults to
      // the central `prefers-reduced-motion: reduce` media query.
      const viewFrameService = new ViewFrameService(ephemerisService);
      engine.setViewFrame(viewFrameService, chapterDirector);
      // Story 4.2 — promote the camera-controller closures to the live
      // services now that they exist. The controller's closures read
      // these refs on every gesture, so a simple ref assignment is all
      // that's needed — no re-construction.
      ephemerisServiceRef = ephemerisService;
      viewFrameServiceRef = viewFrameService;
      firstPaintHandle.hud.ephemerisService = ephemerisService;
      // Story 3.6 — wire AttitudeService into <v-hud> so the inline
      // <v-attitude-indicator> can read getBusProvenance(activeSpacecraftId, et)
      // on each tick. The HUD's `updated()` lifecycle hook propagates this
      // reference down to the indicator sub-component.
      firstPaintHandle.hud.attitudeService = attitudeService;

      // Story 3.4 — AttitudeApplier is constructed AFTER AttitudeService so
      // the per-frame `tick(et, attitudeService, spacecraftModels)` callback
      // (registered below in the engine.onFrame block) has both
      // dependencies resolved. The applier holds no global state per
      // ADR-0015; it is dependency-injected at the call site.
      const attitudeApplier = new AttitudeApplier();

      // Story 5.2 AC3 (Path A) — wire the PaleBlueDot module as the
      // platform-quat override provider on the AttitudeApplier. During
      // the PBD `sweeping_<body>` substates the module's
      // `getPlatformQuatOverride(-31, et)` returns the synthesized aim
      // quaternion; outside those substates it returns null and the
      // applier falls through to `attitudeService.getPlatformQuat`.
      //
      // The PaleBlueDot module also needs DI references to EphemerisService
      // and AttitudeService so its choreography can compute the V1→target
      // aim vectors and read the CK-derived bus quaternion. These are
      // injected post-construction (the module is constructed at boot,
      // before the manifest lands — services land here).
      paleBlueDot.setServices(ephemerisService, attitudeService);
      attitudeApplier.pbdOverrideProvider = paleBlueDot;

      // Story 3.5 — BoresightRenderer constructs ONE wireframe NA-camera
      // cone per spacecraft and parents it to the active LOD's
      // SCAN_PLATFORM node. The cone inherits the per-frame platform
      // rotation via scene-graph parenting (no per-frame quaternion
      // compose). attach() must run AFTER spacecraftModels.load() resolves
      // so the LOD chain is populated; tick() runs in engine.onFrame AFTER
      // attitudeApplier.tick() so the LOD-swap check sees the same level
      // the applier resolved against.
      const boresightRenderer = new BoresightRenderer();

      // Story 3.2 AC8 + Story 3.4 AC8 + Story 3.5 AC8 + Story 4.1 AC8
      // — dev-only debug surface for the lead's Chrome DevTools MCP smoke.
      // Exposed alongside the existing Story 2.x surfaces under
      // `window.__voyagerDebug.*`. Stripped from production builds by
      // Vite's `import.meta.env.DEV` constant folding.
      if (import.meta.env.DEV) {
        const w = window as unknown as { __voyagerDebug?: Record<string, unknown> };
        w.__voyagerDebug = {
          ...(w.__voyagerDebug ?? {}),
          attitudeService,
          attitudeApplier,
          boresightRenderer,
          // Story 4.1 AC8 — ViewFrameService handle. The lead's smoke at
          // /c/v2-saturn probes
          // `__voyagerDebug.viewFrame.getTransform(currentEt, __voyagerDebug.chapterDirector.activeChapter).originOffsetWorld`
          // to confirm AC1+AC2 wire-up end-to-end at the in-window ET.
          viewFrame: viewFrameService,
        };
      }

      // Story 3.3 — kick off the spacecraft LOD-chain load with the manifest
      // now that it's resolved. The load is fire-and-forget; per-frame
      // tick() handles the load-pending state via hold-previous + visible
      // gates so we can register the tick callback below before the load
      // promise resolves.
      //
      // ADR-0006 § Decision step 3 — pass the WebGLRenderer so the
      // `KTX2Loader` registered inside SpacecraftModels can call
      // `detectSupport(renderer)` and choose a GPU-compatible transcode
      // format for the Basis-Universal-encoded textures. Without this the
      // loader throws a "Missing initialization with `detectSupport`"
      // error on the first KTX2 texture inside the LOD GLBs.
      const renderer = engine.getRenderer();
      spacecraftModels
        .load({ manifest, renderer: renderer ?? undefined })
        .then(() => {
          // Story 3.5 T2.2 — attach the boresight cone once the LOD chain
          // has populated SCAN_PLATFORM. Pre-load attach would resolve a
          // null platform and the cone would stay un-parented until the
          // first LOD-swap tick rescued it. Attaching post-load is the
          // cleanest contract.
          boresightRenderer.attach(spacecraftModels);
        })
        .catch((err: unknown) => {
          console.error('[main] spacecraft GLB chain load failed:', err);
        });

      // Hook spacecraft + celestial-body updates onto the render loop
      // immediately. All three modules handle null returns via
      // hold-previous semantics, so it's safe to register the tick before
      // any chunks land.
      //
      // Story 3.4 AC1 — `attitudeApplier.tick(...)` runs BETWEEN the
      // spacecraft position update (which sets handle.group.position +
      // handle.group.visible) and the downstream trajectory / celestial
      // body updates. This ordering is load-bearing:
      //   - spacecraftModels.tick must run first so the visibility gate
      //     (handle.group.visible) is up-to-date before the applier reads
      //     it (AC2 last clause).
      //   - Story 3.5 — `boresightRenderer.tick(...)` runs AFTER the
      //     applier so its LOD-swap check sees the same level the applier
      //     just resolved against. The cone's world rotation is propagated
      //     by Three.js scene-graph parenting (cone is a child of
      //     SCAN_PLATFORM whose quaternion the applier just wrote).
      engine.onFrame((et: number) => {
        spacecraftModels.tick(et, ephemerisService);
        attitudeApplier.tick(et, attitudeService, spacecraftModels);
        boresightRenderer.tick(spacecraftModels);
        if (trajectoryLines !== null) trajectoryLines.tick(et);
        if (celestialBodies !== null) celestialBodies.tick(et, ephemerisService);
        // Story 4.3 AC3 — MissionPhaseFSM advances each frame. The FSM is
        // declared further down the boot sequence; we forward-reference it
        // via the closure-captured `missionPhaseFSMRef`. The wire is in
        // this block (not a separate per-frame registration) so the
        // existing boresight-renderer / attitude-applier ordering defense
        // continues to match the canonical block.
        if (missionPhaseFSMRef !== null) missionPhaseFSMRef.update(et);
        // Story 4.3 cycle-5 — cold-load SOI-state replay (one-shot,
        // forward-referenced via `coldLoadReplayRef`). Fires AFTER the
        // first FSM `update(et)` lands, so the silent-seed has already
        // populated `getSoiState`. The replay closure itself enforces
        // the `coldLoadReplayDone` once-only gate — calling it on every
        // subsequent frame is a cheap boolean compare.
        if (coldLoadReplayRef !== null) coldLoadReplayRef();
      });

      // Story 1.12 + Story 1.13 — the trajectory polyline samples at
      // construction time, so V1 + V2 chunks must be in the ChunkLoader
      // cache BEFORE we construct TrajectoryLines. Without this prefetch,
      // every sample would hit a cache miss and the polyline would be
      // built from zeros (visible as a degenerate dot at the Sun).
      //
      // Story 1.13 extends the prefetch to ALSO cover the 11 celestial
      // body chunks before constructing CelestialBodies. Although the
      // celestial bodies are not pre-sampled at construction (they tick
      // per-frame), the architectural fix for the "polyline-from-zeros"
      // bug applies equally — we want the first frame to render the
      // bodies at their real positions, not at the origin.
      await prefetchSpacecraftChunks(manifest, chunkLoader);
      await prefetchCelestialBodyChunks(manifest, chunkLoader);

      // Story 4.5 AC3 cold-load framing replay (smoke cycle-2 fix
      // 2026-05-23). Mirror of the Story 4.3 cold-load SOI replay
      // pattern: on cold-load arrival into an encounter chapter (e.g.
      // /c/v1-jupiter), the ChapterDirector sync seed (above, line
      // ~282) fired `held` BEFORE the camera-controller existed AND
      // before `ephemerisServiceRef` was promoted to the live service.
      // The runtime subscriber installed alongside the controller
      // therefore early-returns on the first held event (services
      // null-gated). This one-shot replay fires AFTER the celestial-
      // body chunks are in cache (so `ephemerisService.getPosition` for
      // Jupiter resolves synchronously), the controller's resolver path
      // succeeds, and the camera lands at the chapter's
      // `defaultFraming` position instead of staying at world origin
      // (i.e., embedded inside Jupiter post-floating-origin).
      //
      // Instant (not animated) on cold-load: the camera starts at
      // (0, 0, 0); a 400ms tween from origin to a 3-Mm-out framing
      // would be a jarring pull-back. The reduced-motion path takes
      // the same instant branch — symmetric.
      //
      // Suppression: if the user has somehow already flipped the
      // manual-camera flag (e.g. a gesture fired during the manifest
      // load), respect that and don't override.
      //
      // Story 4.10 BUG-003 fix (2026-05-23): also fire the cold-load
      // replay when NO chapter is active (cruise period — e.g.
      // `/?t=1980-01-01T00:00:00Z`). Without this branch the camera
      // stays at (0, 0, 0) (world origin = Sun barycenter) and the
      // viewport shows only the Milky Way skybox; the visible promise
      // of "visitor sees both Voyagers along their heliocentric
      // trajectories" (FR31) is broken on every non-encounter
      // timestamp. The controller's built-in `defaultFramingFallback`
      // resolves to the cruise default (Sun-centered ~10 AU on +Z
      // looking at origin) when `getActiveTarget()` returns null —
      // which it does in cruise — so we just call
      // `applyDefaultFraming` and let the existing cascade handle it.
      const initialActiveChapter = chapterDirector.activeChapter;
      // Story 4.12 AC2 — `?view=heliocentric` overrides the chapter-default
      // body-centered framing on cold-load. The URL parameter is read once
      // at boot from the URLSync; subsequent navigations honour the chapter's
      // own body-centered framing unless the URL is re-loaded with the
      // parameter still present.
      const heliocentricView = urlSync.parseHeliocentricView();
      if (!engine.manualCameraActive) {
        if (heliocentricView.enabled) {
          // Story 4.12 cold-load — frame the Sun-at-origin system view
          // regardless of which chapter (if any) is currently active. The
          // instant path matches the body-centered cold-load branches
          // below: cameras start at world origin; a 400ms tween from
          // origin would be a jarring pull-back.
          cameraController.applyHeliocentricFraming({
            distanceAu: heliocentricView.distanceAu,
            elevationDeg: heliocentricView.elevationDeg,
            animated: false,
          });
        } else if (initialActiveChapter === null) {
          // Cruise cold-load (BUG-003): no active chapter; controller's
          // cruise-default fallback frames the heliocentric system.
          cameraController.applyDefaultFraming({ animated: false });
        } else if (initialActiveChapter.defaultFraming !== undefined) {
          // Encounter cold-load: chapter carries explicit defaultFraming.
          cameraController.applyDefaultFraming({ animated: false });
        }
      }

      trajectoryLines = new TrajectoryLines(
        (et, naifId) => ephemerisService.getPosition(et, naifId),
        { width: window.innerWidth, height: window.innerHeight },
      );
      engine.worldGroup.add(trajectoryLines.root);

      // Story 1.13 — construct CelestialBodies AFTER the celestial chunks
      // are in cache so the first tick after this point renders at real
      // SPICE-derived positions. The texture loads run in parallel and
      // attach to material maps as they land (planets are visible with
      // a fallback grey tint before then).
      celestialBodies = new CelestialBodies({ textureLoader });
      engine.worldGroup.add(celestialBodies.root);

      // Story 4.3 AC4 — wire CelestialBodies into the engine so the
      // `RenderEngine.upgradePlanetTexture(bodyId)` pass-through has a
      // concrete handle to delegate to. The setter mirrors
      // `setViewFrame(...)` for the same reason: RenderEngine is
      // constructed before the manifest lands, but CelestialBodies needs
      // the post-manifest chunks.
      engine.setCelestialBodies(celestialBodies);

      // Story 4.3 AC3 + AC7 — construct MissionPhaseFSM and wire the
      // SOI-entry subscriber that promotes gas-giant textures to the 4K
      // tier on encounter entry. Per Rule 1 (integration AC) this is the
      // production wiring path that the integration test
      // (`web/tests/mission-phase-fsm-upgrade-texture-integration.test.ts`)
      // exercises with stubs. The FSM's per-frame `update(et)` runs inside
      // the canonical Story-3.4 per-frame block above (see the
      // `missionPhaseFSMRef` forward-reference declaration earlier); we
      // just assign the binding here.
      const missionPhaseFSM = new MissionPhaseFSM({ ephemerisService });
      missionPhaseFSMRef = missionPhaseFSM;
      // Story 4.3 cycle-5 — extracted into a named helper so the cold-
      // load replay (see `onSoiEnter` invocation in the per-frame block
      // above) calls the EXACT same downstream code path the subscriber
      // does. Guarantees parity between "crossing INTO an SOI at
      // runtime" and "discovered to be inside an SOI on cold-load".
      const onSoiEnter = (bodyId: number): void => {
        // Story 4.3 T5 — construct moon meshes for the parent gas
        // giant's satellite system on encounter entry. The add path is
        // idempotent (re-adding a present moon is a no-op).
        if (celestialBodies !== null) {
          celestialBodies.addMoonsFor(bodyId);
        }
        // Story 4.3 AC4 — NFR-C6 gate: silently skip the upgrade when
        // the device's GPU memory is below the 1 GB heuristic. On
        // low-end devices the cruise 2K PNG remains the active texture;
        // the user sees no UI hint per UX-DR32.
        const caps = engine.getCapabilities();
        if (!caps.adequateForEightK) return;
        // Default tier is `'4k'` per the Story-4.3 Rule-5 amendment
        // (gas-giant source data caps at 4K; see GAS_GIANT_JOBS
        // docstring in web/scripts/build_textures.ts).
        engine.upgradePlanetTexture(bodyId);
      };
      const onSoiExit = (bodyId: number): void => {
        // Story 4.3 T5 — remove moon meshes for the parent gas giant
        // on encounter exit. AC5 default: remove (vs LOD3-silhouette
        // retain). The texture tier on the gas giant itself does NOT
        // de-escalate (Out-of-Scope per the story — "the texture stays
        // at the highest tier loaded for the session").
        if (celestialBodies !== null) {
          celestialBodies.removeMoonsFor(bodyId);
        }
      };
      missionPhaseFSM.subscribe((event: MissionPhaseEvent) => {
        if (event.type === 'soiEntered') {
          onSoiEnter(event.bodyId);
          return;
        }
        if (event.type === 'soiExited') {
          onSoiExit(event.bodyId);
          return;
        }
      });
      // Story 4.3 cycle-5 — cold-load SOI-state replay. The FSM's
      // first-update silent-seed (AC3) means that opening a URL like
      // `/c/v1-jupiter` (which lands ET at V1's Jupiter encounter, INSIDE
      // Jupiter's SOI) seeds the FSM state to 'inside' WITHOUT firing a
      // `soiEntered` event. Without this replay, the cold-load Jupiter
      // texture stays at 2K and the Galilean moons never appear. The
      // replay runs once AFTER the first `update(et)` lands (so the
      // silent-seed has happened), iterates every (spacecraft × gas
      // giant) pair the FSM tracks, and calls `onSoiEnter(bodyId)` for
      // every pair currently inside an SOI. Re-firing `onSoiEnter`
      // later via the regular `soiEntered` event path is safe:
      // `addMoonsFor` is idempotent (per-mesh existence check) and
      // `upgradePlanetTexture` is monotonic at the tier ratchet (per
      // Story 4.3 cycle-3 decisions).
      coldLoadReplayRef = (): void => {
        if (coldLoadReplayDone) return;
        coldLoadReplayDone = true;
        for (const sc of SPACECRAFT_NAIF_IDS) {
          for (const gg of GAS_GIANT_NAIF_IDS) {
            if (missionPhaseFSM.isInsideSoi(sc, gg)) {
              onSoiEnter(gg);
            }
          }
        }
      };

      // Story 4.3 AC8 — DEV-only debug surface for the lead's Chrome
      // DevTools MCP smoke. Mirrors the Story-2.1 chapterDirector +
      // Story-4.2 cameraController patterns: write to
      // `window.__voyagerDebug.missionPhaseFSM`, which the lead's smoke
      // probe reads via `evaluate_script`. Production builds strip this
      // block via Vite's `import.meta.env.DEV` constant folding.
      if (import.meta.env.DEV) {
        const w = window as unknown as { __voyagerDebug?: Record<string, unknown> };
        w.__voyagerDebug = { ...(w.__voyagerDebug ?? {}), missionPhaseFSM };
      }
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

/**
 * Story 1.13 — eagerly load each of the 11 celestial-body chunks so the
 * first frame after `CelestialBodies` construction renders at real SPICE
 * positions, not the world origin. Mirror of Story 1.12's
 * polyline-from-zeros fix applied to the planet/Sun/Moon meshes.
 *
 * Each celestial body is a single VTRJ at daily cadence covering the
 * full mission window — one load per body, 10 total chunks. Errors are
 * logged but never thrown: a missing chunk degrades to the body holding
 * its previous position (or staying hidden on the very first frame),
 * which is the same posture as a runtime chunk-load gap.
 */
const prefetchCelestialBodyChunks = async (
  manifest: Manifest,
  chunkLoader: ChunkLoader,
): Promise<void> => {
  const naifSet = new Set<number>(CELESTIAL_BODY_NAIF_IDS);
  const loads: Promise<unknown>[] = [];
  for (const body of manifest.bodies) {
    if (!naifSet.has(body.naifId)) continue;
    for (const file of body.files) {
      loads.push(
        chunkLoader.load(file).catch((err: unknown) => {
          console.warn(
            `[main] celestial-body prefetch failed for ${file.url}; body will be hidden until chunk lands:`,
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

/**
 * Story 2.7 — mount the `/about` editorial surface as the sole content of
 * the #app root. The simulation surface (canvas + HUD + scrubber + chapter
 * index) is intentionally NOT mounted; per AC1 the about page is its own
 * top-level surface. The page anchors at `#attribution` via browser-native
 * fragment scrolling once the dl in `<v-attribution-panel>` is in the DOM.
 */
const mountAboutSurface = (): void => {
  const mount = document.getElementById('app') ?? document.body;
  while (mount.firstChild) {
    mount.removeChild(mount.firstChild);
  }
  // Reset the page-level styling away from the canvas-friendly
  // overflow/100vh that the simulation surface assumes. The about page is
  // a normal document with natural scroll behaviour.
  document.body.style.overflow = 'auto';
  const about = document.createElement('v-about-page');
  mount.appendChild(about);
  // If the URL carried a hash (e.g. /about#attribution), browser-native
  // fragment scrolling needs the anchor to exist in the DOM by the time
  // it tries to scroll. The Lit element renders synchronously enough for
  // most cases, but we force a hash re-evaluation after the next tick so
  // the deep-link from the homepage footer lands on the attribution panel
  // even if the initial parse fired before the dl was attached.
  if (window.location.hash !== '') {
    const hash = window.location.hash;
    void Promise.resolve().then(() => {
      const target = document.querySelector(hash);
      if (target !== null) {
        target.scrollIntoView({ block: 'start' });
      }
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
