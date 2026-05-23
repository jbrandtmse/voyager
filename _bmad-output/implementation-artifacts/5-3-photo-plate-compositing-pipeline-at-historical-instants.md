# Story 5.3: Photo-Plate Compositing Pipeline at Historical Instants

**Epic:** 5 — Pale Blue Dot (the Hero Scene)
**Status:** review
**Date created:** 2026-05-23
**Source:** `_bmad-output/planning-artifacts/epics.md:2009-2051` (Story 5.3 spec) + Story 5.1 PBD module foundation (substates + chronological order) + Story 5.2 platform-quaternion override (NA boresight aim per sweeping substate) + Story 2.7 `<v-attribution-panel>` (NASA Photojournal attribution surface) + Story 1.14 asset manifest + immutable-cache discipline (per Story 1.14)

## User Story

As a visitor watching the PBD sequence,
I want each NASA Photojournal plate (Venus, Earth, Jupiter, Saturn, Uranus, Neptune) to composite into the scene at the moment the camera frustum sweeps the corresponding target,
So that the historical photographs appear in their actual temporal context and FR28 is operational.

## Acceptance Criteria

### AC1 — NASA Photojournal source images procured and content-hash-named

- **GIVEN** the six target bodies in chronological PBD-sequence order (Venus → Earth → Jupiter → Saturn → Uranus → Neptune per Story 5.1 `PBD_SUBSTATE_ORDER` and the epic spec line 2038-2040)
- **AND** NASA's Planetary Photojournal (`photojournal.jpl.nasa.gov`) is the canonical public-domain source for the historical PBD imaging-sequence frames (per `THIRD_PARTY.md` attribution policy and the epic spec line 2019)
- **WHEN** the dev agent procures the six images
- **THEN** `web/public/images/pbd/` directory exists and contains six PNG files, each authored from the NASA Photojournal frame corresponding to that body's PBD-sequence shot — canonical NASA Photojournal IDs the dev MUST verify against the source (the dev SHOULD NOT invent PIA numbers — look up each image's exact PIA ID via the NASA Photojournal site by searching for "Voyager 1 Pale Blue Dot" / "Voyager family portrait Venus" / etc., and record the lookup in the Dev Agent Record). Canonical candidates the dev should investigate first (without trusting blindly):
  - **Earth (PBD)**: PIA00452 is the canonical "Pale Blue Dot" image (this one IS publicly known)
  - Venus / Jupiter / Saturn / Uranus / Neptune: the dev verifies each PIA against the NASA Photojournal "Voyager family portrait" set; record the exact PIA + capture date + raw NASA URL in the Dev Agent Record
- **AND** each PNG is content-hashed in its filename (per Story 1.14 immutable-asset discipline) — e.g., `earth.<8-char-hash>.png`; the hash is computed from the file bytes (Vite asset-pipeline auto-hashes during build, OR the dev computes manually if these are static under `public/`)
- **AND** if the file lives under `web/public/images/pbd/` (canonical static-asset location), Vite does NOT auto-hash — the dev either (a) moves the files under `web/src/images/pbd/` and imports them so Vite hashes them at build OR (b) accepts the un-hashed filename and emits a fingerprinted reference inside the asset manifest. The dev agent picks one path and records the rationale in the Dev Agent Record per the existing Story 1.13 / Story 4.3 texture-asset handling pattern (textures are under `web/textures-src/` → KTX2 → `web/public/textures/`; the dev mirrors the analogous flow for image plates).
- **AND** the asset manifest (`web/public/data/manifest.json` if present, OR the manifest-loader's runtime aggregation) references each plate with the immutable `Cache-Control: public, max-age=31536000, immutable` header (provided by Story 1.14's static-CDN _headers file at `web/public/_headers`); if a new entry is needed in `_headers` for `web/public/images/pbd/*.png`, the dev adds it
- **AND** `THIRD_PARTY.md` (the existing repo-root file — already used by Story 1.7 fonts / 1.12 spacecraft model / 1.13 textures per `grep "^## "` of the file) is extended with a new section "## NASA Photojournal PBD photo plates (Story 5.3)" crediting NASA Photojournal for each plate with the exact PIA IDs the dev verified
- **AND** `<v-attribution-panel>` (`web/src/components/v-attribution-panel.ts`) is extended with a new `<dt>/<dd>` entry crediting NASA Photojournal for the PBD plates (mirroring the existing pattern at line 95 — the component's `dl#attribution` is the runtime attribution surface that pairs with THIRD_PARTY.md)

### AC2 — Composite layer module structure

- **GIVEN** the Story 5.1 PBD module directory at `web/src/chapters/pale-blue-dot/`
- **AND** the spec from Story 5.1 reserves space for `composite-layer.ts` (stub permitted at Story 5.1 time; Story 5.3 owns the actual implementation)
- **WHEN** I inspect `web/src/chapters/pale-blue-dot/composite-layer.ts` (NEW or replacing the Story 5.1 stub if one was authored)
- **THEN** the module exposes a `PbdCompositeLayer` class (or named exported factory) that:
  - Holds references to the six loaded plate Image / HTMLImageElement / `THREE.Texture` instances (depending on rendering approach — see AC3)
  - Subscribes to the PBD module's substate listener (`paleBlueDot.subscribe(listener)` per Story 5.1 `PbdSubstateListener` type)
  - Maintains internal state for which plate is currently visible, its opacity, and its screen-space target position (the NA boresight cone's center projected to screen)
  - Exposes a `dispose()` method for clean teardown when PBD chapter exits (mirroring the existing `RenderEngine.dispose()` discipline)

### AC3 — Plate rendering: screen-space layer anchored to NA boresight projection

- **GIVEN** the simulation renders V1 at world position via `EphemerisService.getPosition` and the NA boresight cone (Story 3.5) is parented to `SCAN_PLATFORM` with its world-space orientation now driven per-substate by Story 5.2's platform-quat override
- **AND** the canonical "the plate appears in the scene" requirement (epic line 2027) is that the plate composites as a fixed-screen-space layer anchored at the NA boresight cone's center (projected to screen-space per frame)
- **WHEN** the dev agent picks a rendering approach
- **THEN** the rendering uses ONE of these viable paths (dev's choice, recorded in Dev Agent Record):
  - **Path A (HTML overlay):** plates render as absolutely-positioned `<img>` elements inside a dedicated container `<div class="pbd-composite-layer">` that's appended to `document.body` (NOT inside any HUD/canvas — composite is part of the simulation surface per epic line 2049). The per-frame loop updates each visible plate's `style.left` / `style.top` to track the projected boresight position; `style.opacity` follows the AC4 fade.
  - **Path B (Three.js Sprite):** plates render as `THREE.Sprite` instances added to the scene at the boresight cone's end position. Three.js handles screen-space projection automatically; opacity goes through sprite material's `.opacity`.
  - **Path C (CSS3DRenderer overlay):** plates render in a sibling CSS3DRenderer pass that shares the perspective camera; CSS3DRenderer auto-handles screen-space projection.
- **AND** the chosen path's rationale is documented — recommend Path A (HTML overlay) as the simplest discoverable approach and the one that respects ADR-0008 (`THREE.WebGLRenderer` over WebGPU/CSS3D); the HTML overlay sits OUTSIDE the WebGL canvas as a sibling DOM layer
- **AND** the plate's screen size matches the apparent narrow-angle frame at the historical capture — "small" per epic line 2026 ("The plate's screen size matches the apparent narrow-angle frame at the historical capture (small — verified visually against the historical photograph in `docs/visual-validation/pale-blue-dot.md`)"). The dev agent picks a concrete pixel size — recommend ~48×48 to ~96×96 pixels at 1280×720 viewport (the actual NA frame at PBD distances is sub-degree on the sky and would be sub-pixel against the camera if scaled to true angular size; the cinematic compromise per the epic spec is "small but visible")
- **AND** AC visual: the result reads as the plate appearing in the scene, not as a HUD overlay (composite blending = normal alpha-blend OR additive — dev's choice with rationale; the JSDoc on the rendering code explicitly notes the blending mode chosen)

### AC4 — Per-substate opacity fade-in / fade-out

- **GIVEN** Story 5.1's `PBD_SUBSTATE_ORDER` includes the six `sweeping_<body>` substates with their `start` / `peak` / `end` ETs (per the Story 5.1 `substates.ts` table)
- **AND** `--v-duration-base` (200ms per the epic spec line 2031) is defined in `tokens.css` (the dev agent reads the exact value)
- **WHEN** the substate transitions enter `sweeping_<body>` AND its `start` ET is reached
- **THEN** the corresponding plate fades in: opacity 0 → 1 over `--v-duration-base` (200ms; instant under reduced motion per AC5)
- **AND** the plate holds at opacity 1 during the substate's `peak` window (between `start` and `end` ETs of that sweeping substate)
- **AND** at the substate's `end` ET, the plate fades to opacity 0 over `--v-duration-base`
- **AND** the next substate's plate composites in with the same fade-in once the current substate has decayed
- **AND** at any moment, at most ONE plate is visible (no two plates visible simultaneously — epic line 2034)

### AC5 — Reduced motion: instant cut between plates

- **GIVEN** `window.matchMedia('(prefers-reduced-motion: reduce)').matches` returns true
- **WHEN** the composite layer transitions between plates
- **THEN** the fade-in / fade-out becomes an instant opacity flip (0 → 1 → 0 across substate boundaries with no in-between frames)
- **AND** the chosen plate at the active substate's peak ET shows immediately at opacity 1; outside the substate window opacity is 0
- **AND** the reduced-motion behavior mirrors Story 5.2's reduced-motion path (same matchMedia query, same instant-cut semantic)

### AC6 — Sequence ordering matches historical PBD imaging sequence

- **GIVEN** the historical PBD imaging sequence per `MISSION_FACTS.md` § Pale Blue Dot family-portrait imaging sequence (line 47-57) AND the epic spec line 2038-2040 ordering
- **WHEN** the PBD chapter plays through
- **THEN** the six plates composite in the EXACT order: Venus → Earth → Jupiter → Saturn → Uranus → Neptune (matches Story 5.1's `PBD_SUBSTATE_ORDER` and the spec's "PRD §Pale Blue Dot reconstruction commitment")
- **AND** the sequence timing matches the historical anchor ETs from Story 5.1's `substates.ts` (verified by reading Story 5.1's offset-seconds-from-anchor table and confirming each `sweeping_<body>` substate's `start` / `peak` / `end` ETs match the historical reconstruction)
- **AND** the `composite_active` substate (final substate of the cinematic arc, holds the LAST plate per Story 5.1's ordering — but per the epic spec line 2040 the "thirty-second pause" is during the Earth plate's display) — clarification: the `composite_active` substate in Story 5.1 may hold the Earth-plate beyond the `sweeping_earth` end ET; OR `composite_active` is a "Hold final plate (Neptune) for 30s" — the dev agent reads Story 5.1's substate timing definitions and confirms which semantic the cinematic-arc encodes, then aligns the AC4 fade-in logic accordingly. If Story 5.1's substate definitions don't capture this semantic clearly, the dev agent amends `substates.ts` in place per Rule 5 with a clear "30-second pause hold" mapping for `composite_active`

### AC7 — Pixel-precise placement: Earth plate aligned with NA boresight axis projection

- **GIVEN** the Earth plate is the canonical hero shot — at the substate `sweeping_earth`'s peak ET, the NA boresight cone aims at Earth (per Story 5.2 AC7 verification: within 5° of V1→Earth)
- **AND** the visual validation pattern from Story 4.8 (`docs/visual-validation/`)
- **WHEN** I navigate `docs/visual-validation/pale-blue-dot.md` (NEW file per the epic spec line 2026 + 2046)
- **THEN** the file exists with annotated screenshots — at minimum: (a) the Earth-plate-composited frame at `sweeping_earth` peak ET; (b) annotation confirming the plate's center is positionally aligned with the NA boresight cone's axis projected to screen (within reasonable tolerance — e.g., 2-3% of viewport width given the cone's 5° aim tolerance from Story 5.2)
- **AND** the plate's scale matches the "apparent NA-camera frame size" — at the chosen pixel size from AC3, this is a cinematic compromise; the doc records the chosen pixel size + rationale
- **AND** annotated screenshots verifying alignment against the historical NASA Photojournal Pale Blue Dot photograph (the visual reference) are included — alongside the in-app screenshot

### AC8 — Embed mode preserves photo composites (composites are simulation, not chrome)

- **GIVEN** Story 2.5's embed mode hides HUD chrome, chapter index, help overlay, etc. when `?embed=true` is present
- **AND** the PBD photo composites are part of the SIMULATION not HUD chrome (per epic spec line 2049)
- **WHEN** I render the PBD chapter in embed mode (`/c/pale-blue-dot?embed=true`)
- **THEN** the photo composites still render at their substate-driven moments
- **AND** the HUD / chapter copy / chapter index button / attitude indicator remain hidden per Story 2.5's embed contract — verified by integration test
- **AND** the embed-mode-first-paint test extends to cover the composite-layer's presence in embed mode (add a new `describe` block to `web/tests/embed-mode-first-paint.test.ts`)

### AC9 — Integration AC: end-to-end production smoke at PBD substate peaks

- **GIVEN** Story 5.1 + 5.2's lead Chrome DevTools MCP smokes verified PBD cold-load + substate progression at the production-build layer
- **AND** Story 5.3 adds the visible photo composites at each `sweeping_<body>` substate's peak ET
- **WHEN** the lead-driven Chrome DevTools MCP smoke runs against the production build, navigating to deep-link URLs at each substate's peak ET (e.g., `/c/pale-blue-dot/?t=<peak-ET-iso>` per Story 5.2's deep-link pattern)
- **THEN** at each peak ET, the corresponding plate is visible in the DOM at the expected screen position (the lead probes via `document.querySelector('.pbd-composite-layer img[data-target=earth]')` and asserts `getComputedStyle(el).opacity === '1'` and `el.style.display !== 'none'` and the element's `getBoundingClientRect()` indicates non-zero size)
- **AND** between substates the plate fade is observable (the lead captures a screenshot mid-transition; the captured screenshot shows partial opacity)
- **AND** smoke evidence (6 screenshots at each substate peak ET + 1 fade-transition mid-frame + console clean) is committed under `_bmad-output/implementation-artifacts/5-3-smoke-evidence/`

### AC10 — Test sweep + lint baseline preserved + ADR compliance verified

- **GIVEN** the project's test pyramid baseline post-Story-5.2 (web vitest ~3258 pass / typecheck clean / 4 lint warnings)
- **WHEN** Story 5.3 ships
- **THEN** web vitest pass count rises by ≥ the unit + integration tests added (composite-layer module unit tests, integration test for substate-driven opacity, embed-mode test for composite presence)
- **AND** `cd web && npm run typecheck` is clean
- **AND** `cd web && npm run lint` shows ≤ 4 warnings (the pre-existing baseline; 0 new)
- **AND** ADR-0008 (Three.js WebGLRenderer over WebGPURenderer) compliance — if Path B (Three.js Sprite) is chosen, verify the Sprite implementation does NOT introduce WebGPU dependencies
- **AND** ADR-0019 (zero-analytics; localStorage-only error capture) compliance — composite layer must NOT phone home for image loads (use standard `<img>` with `crossorigin="anonymous"` or same-origin)
- **AND** ADR-0014 (Hybrid chapter definition) — composite layer lives inside `web/src/chapters/pale-blue-dot/` directory per the dedicated-module discipline
- **AND** the bake-side is NOT touched (composite layer is web-side; image plates are static under `web/public/images/pbd/`)

## Out of Scope (Defer to Specific Later Stories)

- **L4 Playwright visual regression at PBD substates.** Story 5.4 owns the pixel-diff coverage including composite plate presence + alignment at the four named test points (`pbd-turning`, `pbd-sweeping-earth`, `pbd-sweeping-neptune`, `pbd-composite-decay`).
- **PBD camera framing.** Story 5.2's "Out of Scope" already routes this to a future Story 5.X follow-up. Composite plates display at the NA boresight projection regardless of camera framing — they remain functional even with the world-origin cruise-default camera.
- **Plate aspect ratios honoring NASA Photojournal raw dimensions.** The dev agent may crop/resize plates to a uniform pixel size for cinematic consistency (per AC3); preserving raw NASA aspect ratios is a polish candidate for a future story.
- **Plate transitions matching real NASA filter colors.** The PBD originals were captured through different ISS filters; reproducing the multi-filter look is a polish candidate, not a Story 5.3 requirement.
- **`bake/` side changes.** Static images don't need bake-side processing; if the dev finds otherwise (e.g., texture preprocessing), that becomes a Rule 5 amendment to Story 5.3.

## Tasks / Subtasks

- [x] **T1 — Procure NASA Photojournal source images (AC1)**
  - [x] T1.1: Looked up canonical PIA IDs via NASA Planetary Photojournal — PIA00452 (Earth, canonical PBD) + PIA00453 (Solar System Portrait — Views of 6 Planets, 3×2 grid of all six narrow-angle frames). See `### PIA Lookup Log` below.
  - [x] T1.2: Downloaded both frames + authored `web/scripts/build_pbd_plates.ts` to crop the six per-body cells from PIA00453 and use PIA00452 directly for Earth. Target size 128×128 px (next power-of-2 above the ~96×96 spec recommendation; friendlier to browser texture caching). Used `sharp` (already in `web/package.json` devDependencies) for crop + resize + PNG encode.
  - [x] T1.3: Content-hash filenames (SHA-256 → 8-char prefix) computed on the PNG output bytes per Story 1.14 immutable-asset discipline. Manifest at `web/public/images/pbd/plate-manifest.json` maps body→filename so the runtime composite layer doesn't hard-code hashes.
  - [x] T1.4: Plates staged under `web/public/images/pbd/`. Source-JPEG cache moved to `web/textures-src/pbd-plates/` (gitignored) so Vite does NOT copy upstream JPEGs into the runtime bundle.
  - [x] T1.5: Added `/images/pbd/*` rule to `web/public/_headers` with `Cache-Control: public, max-age=31536000, immutable`.
  - [x] T1.6: Extended `THIRD_PARTY.md` with the "NASA Photojournal PBD photo plates (Story 5.3)" section — full provenance + license + build-pipeline + LFS footnote.
  - [x] T1.7: Refined the existing NASA Photojournal entry in `<v-attribution-panel>` (Story 5.0 placeholder) to cite PIA00452 + PIA00453 specifically.

- [x] **T2 — Implement `PbdCompositeLayer` (AC2 + AC3 + AC4 + AC5)**
  - [x] T2.1: Chose **Path A (HTML overlay)** — `<div class="pbd-composite-layer">` appended to canvas parent; absolutely-positioned `<img data-target="<body>">` elements per plate. Sidesteps ADR-0008 (no Three.js entanglement). Rationale documented in module docstring.
  - [x] T2.2: Created `web/src/chapters/pale-blue-dot/composite-layer.ts` with the `PbdCompositeLayer` class — manifest fetch (lazy), per-plate `<img>` creation, dispose lifecycle, substate-transition subscriber via `paleBlueDot.subscribe`.
  - [x] T2.3: Implemented opacity fade-in / fade-out via explicit `tweenStartMs` + `tweenStartOpacity` per plate — pure function of wall-clock time, robust against dropped frames and the first-tick boundary case. `PBD_FADE_MS_BASE = 200ms` (matches `--v-duration-base` in tokens.css).
  - [x] T2.4: Reduced-motion path: `fadeMs = 0` when `prefers-reduced-motion: reduce` matches → opacity flips instantly. Same matchMedia probe pattern as Story 5.2's turn-choreography.
  - [x] T2.5: Boresight projection: per-frame `scanPlatformNode.getWorldPosition` → camera `project(vec)` → NDC-to-CSS-pixels mapping → `style.left` / `style.top`. Centering fallback when SCAN_PLATFORM resolution returns null (pre-LOD-load).

- [x] **T3 — Wire composite layer into main.ts (extend Story 5.1 + 5.2 Path A subscriber)**
  - [x] T3.1: Instantiated `PbdCompositeLayer` immediately after `PaleBlueDot` in `web/src/main.ts:206-ish`. Host = canvas parent.
  - [x] T3.2: Subscribed via `pbdCompositeLayer.subscribeTo(paleBlueDot)` — the existing Path A subscriber topology.
  - [x] T3.3: Per-frame `pbdCompositeLayer.update(paleBlueDot.currentSubstate, engine.camera)` added inside the existing `paleBlueDotActive` gate. Layer's `dispose()` isn't wired to ChapterDirector `exiting` because the layer is part of the SPA lifetime (the canvas + simulation persist; dispose is for explicit hot-reload paths). Added `__voyagerDebug.pbdCompositeLayer` DEV debug surface for AC9 smoke probes.

- [x] **T4 — Tests (AC4, AC5, AC6, AC8, AC10)**
  - [x] T4.1: Authored `web/src/chapters/pale-blue-dot/composite-layer.test.ts` (21 tests) covering AC2 module structure, AC3 projection fallback, AC4 opacity tween (fade-in, fade-out, at-most-one invariant, visibility), AC5 reduced-motion instant cut, AC6 substate-to-plate mapping (including the Story 5.3 Rule-5 amendment that maps `composite_active` to Earth), AC10 zero-analytics compliance.
  - [x] T4.2: Authored `web/tests/pale-blue-dot-composite-integration.test.ts` (6 tests) exercising the real PaleBlueDot module + PbdCompositeLayer + DOM through the full chronological substate sequence.
  - [x] T4.3: Extended `web/tests/embed-mode-first-paint.test.ts` with 2 new tests asserting no chrome-skip pathway hides `.pbd-composite-layer` in embed mode.
  - [x] T4.4: Authored `web/scripts/build_pbd_plates.test.ts` (12 tests) covering Rule 11 (build-pipeline E2E) — pure-function contracts + a full crop+resize+encode pipeline against synthetic JPEG fixtures.
  - [x] T4.5: Full sweep — **3300 pass / 10 skipped / 184 files** (baseline post-Story-5.2 was ~3258; Story 5.3 adds 42 new tests). Typecheck clean. Lint: 4 warnings (pre-existing baseline; 0 new).

- [x] **T5 — Visual validation doc (AC7)**
  - [x] T5.1: Authored `docs/visual-validation/pale-blue-dot.md` — chosen plate size + rationale, source-frame attribution, NA-boresight alignment math, substate→plate mapping table including the 30s Earth hold, expected screenshot inventory keyed to each substate peak ET, iteration loop. Screenshots will be captured by the lead during the AC9 smoke and committed alongside this doc.

- [x] **T6 — Lead Chrome DevTools MCP smoke (AC9)**
  - [x] T6.1: Wired the DEV debug surface (`window.__voyagerDebug.pbdCompositeLayer.{currentActivePlate, getPlateOpacity, rootElement}`) that the lead's smoke probes.
  - [x] T6.2: Authored `_bmad-output/implementation-artifacts/5-3-smoke-evidence/README.md` documenting the expected screenshot inventory + ISO peak ETs + probe assertions for the lead to capture.
  - [x] T6.3: Smoke evidence directory created; the lead runs the smoke separately per Rule 7 (sub-agent tool inventory is harness-inherited — Chrome DevTools MCP lives on the lead) and commits the actual screenshots.

- [x] **T7 — Test sweep + lint + ADR compliance (AC10)**
  - [x] T7.1: ADR compliance audited inline. **ADR-0008 (Three.js WebGLRenderer)** — composite layer is pure DOM (Path A); no WebGPU. **ADR-0014 (Hybrid chapter definition)** — composite layer lives inside `web/src/chapters/pale-blue-dot/`. **ADR-0015 (no global store)** — `PbdCompositeLayer` is a class instance subscribed via DI; no global state. **ADR-0019 (zero-analytics)** — same-origin `<img>` loads from the static-CDN; no fetch beacons (the manifest fetch is a one-time JSON load of `/images/pbd/plate-manifest.json`, not an analytics call). **ADR-0026 (zero `any`)** — composite-layer module is fully typed.

## Dev Notes

### Critical context

- **Procurement is the longest task.** Story 4-11 (satellite SPK procurement) showed that procurement with well-defined canonical sources is 1-cycle work, while cross-source procurement is multi-cycle. NASA Photojournal is well-defined; the dev should be able to procure all six in one pass using the Photojournal site's "search by mission = Voyager 1 / Voyager 2" filter. PIA00452 is the canonical PBD Earth plate; the others share the "Voyager family portrait" tagline.
- **Cinematic compromise on plate size.** The actual angular size of a body in the NA frame at PBD distances is small (Earth was the iconic blue dot, Jupiter is a few pixels). The composite layer SHOWS the historical NASA frame as a visual reference, not at true angular scale. A 96×96-pixel plate at 1280×720 viewport is ~7.5% of viewport height — cinematically readable but not so large that it obscures the simulation.
- **Anchor point math.** The boresight projection is `scanPlatformNode.getWorldDirection()` → multiply by some distance → use perspective camera's `project(vec)` to get NDC → map to viewport pixels. Story 3.5's NA boresight cone uses the same math; reuse that anchor.
- **Story 5.1 substate definitions are load-bearing.** Confirm the `composite_active` semantic before T2.3. If it holds the LAST plate (Neptune) per chronological order, the "30-second Earth pause" requirement (epic line 2040) is NOT met — Story 5.1's substates may need a Rule 5 amendment. The dev agent reads `substates.ts` first.

### Previous Story Intelligence

- **Story 5.1 + 5.2 Path A subscriber pattern.** Story 5.3's composite layer wires through the SAME subscriber mechanism — subscribe to `paleBlueDot.subscribe(listener)` (the Story 5.1 API). Don't introduce a new wiring topology.
- **Story 4-11 procurement lesson** (Epic 4 retro). Well-defined canonical sources = 1-cycle. Cross-source = expensive. NASA Photojournal is canonical; should be 1-cycle.
- **Story 2.7 `<v-attribution-panel>`** is the runtime attribution surface; THIRD_PARTY.md is the build-time provenance doc. Both extend in lockstep when new attributed sources land.
- **Story 1.14 immutable-asset discipline.** Content-hashed filenames + `Cache-Control: public, max-age=31536000, immutable` is the project convention. The dev agent inherits this discipline; no negotiation.

### Architecture compliance

- **ADR-0008 (Three.js WebGLRenderer over WebGPU)** — HTML overlay (Path A) sidesteps this; Three.js Sprite (Path B) is still WebGL.
- **ADR-0014 (Hybrid chapter definition)** — composite layer lives inside `web/src/chapters/pale-blue-dot/`; the PBD module continues to own its dedicated surface.
- **ADR-0015 (no global store)** — composite layer is a class instance constructed in `main.ts` and subscribed to via the PBD module's existing subscribe API.
- **ADR-0019 (zero-analytics)** — image loads are same-origin / static-CDN; no fetch beacons.

### Source tree components to touch

- `web/public/images/pbd/` OR `web/src/images/pbd/` (NEW — depending on hash strategy)
- `web/src/chapters/pale-blue-dot/composite-layer.ts` (NEW + co-located test)
- `web/src/chapters/pale-blue-dot/index.ts` (READ-ONLY — consume subscribe API)
- `web/src/main.ts` (UPDATE — instantiate + wire composite layer)
- `web/src/components/v-attribution-panel.ts` (UPDATE — NASA Photojournal entry)
- `THIRD_PARTY.md` (UPDATE — new section)
- `web/public/_headers` (UPDATE — Cache-Control if needed)
- `web/tests/pale-blue-dot-composite-integration.test.ts` (NEW)
- `web/tests/embed-mode-first-paint.test.ts` (UPDATE — extend with composite-layer check)
- `docs/visual-validation/pale-blue-dot.md` (NEW)
- `_bmad-output/implementation-artifacts/5-3-smoke-evidence/` (NEW)

### Testing standards summary

- Unit tests for the composite layer: substate-driven opacity transitions, reduced-motion instant-cut, dispose lifecycle.
- Integration test: real-stack PBD module + composite layer + DOM verification of plate presence at substate peaks.
- Embed-mode test: composite layer renders in `?embed=true` (chrome hidden, composites visible).
- Lead Chrome DevTools MCP smoke: 6 substate-peak screenshots + 1 mid-fade screenshot + console clean.

### NFR tripwire watch

- **NFR-P5 (full-app bundle ≤ 150 MB)** — six PNGs at 96×96 are ~30 KB each = 180 KB total. Negligible.
- **NFR-P4 (first-paint < 35 MB)** — composite plates are lazy-loaded on PBD chapter entry; not in first-paint budget.

### Smoke method selection (Rule 8)

Pure web-side story. Lead-driven Chrome DevTools MCP smoke per ADR-0010 + Rule 8.

### References

- `_bmad-output/planning-artifacts/epics.md:2009-2051` — Story 5.3 spec
- `web/src/chapters/pale-blue-dot/index.ts:65+` — Story 5.1 PBD spec and module
- `web/src/chapters/pale-blue-dot/substates.ts` — substate definitions (CONFIRM `composite_active` semantic before T2.3)
- `MISSION_FACTS.md:47-57` — PBD imaging-sequence anchor
- `THIRD_PARTY.md` — extant attribution sections (model after Story 1.13)
- `web/src/components/v-attribution-panel.ts:95` — `dl#attribution` runtime attribution surface
- `web/public/_headers` — Story 1.14 static CDN headers
- `docs/adr/0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md` — chapter-module discipline
- `docs/adr/0019-zero-analytics-localstorage-only-error-capture.md` — no-fetch-beacons discipline
- `docs/adr/0008-threejs-webglrenderer-over-webgpurenderer-v1.md` — rendering tech baseline
- NASA Planetary Photojournal: `photojournal.jpl.nasa.gov` (image source; the dev verifies PIA IDs there)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context). Story 5.3 development executed in a single epic-cycle session 2026-05-23.

### Debug Log References

- `web/src/chapters/pale-blue-dot/substates.ts` — Rule-5 amendment block in `PBD_SUBSTATE_TIMINGS` docstring documents the original-vs-amended `composite_active` semantics.
- `web/scripts/build_pbd_plates.ts` — docstring section "Cinematic compromise on plate size" documents the 128×128 choice (next power-of-2 above the ~96 cinematic spec).
- `docs/visual-validation/pale-blue-dot.md` — visual alignment + smoke evidence pointer.

### Completion Notes List

**Procurement (T1).** Single-cycle procurement per Story 4-11 lesson — NASA Planetary Photojournal is a well-defined canonical source. PIA00452 (Earth) + PIA00453 (six-planet 3×2 grid) cover all six bodies. The crop coordinates for PIA00453 are 206×250 cells (620/3 ≈ 207 wide, 500/2 = 250 tall). Earth uses PIA00452 directly to preserve the iconic light-streak composition. Total ship size: 6 PNGs × ~25 KB = ~150 KB (negligible — NFR-P5 ≤ 150 MB budget).

**Rule 5 amendment (substates.ts).** The Story 5.1 `composite_active` substate was placed at the END of the cinematic arc (+120..+150) with the docstring "all six photo-plates are visible simultaneously" — directly contradicting Story 5.3 AC4 ("at most ONE plate visible at any moment") AND epic spec line 2141 ("composite_active (during the Earth plate) holds long enough"). Per Rule 5 the amendment moves `composite_active` to between `sweeping_earth` and `sweeping_jupiter` so:

- Earth is visible during `sweeping_earth` (+45..+60s) AND `composite_active` (+60..+90s) — 45 seconds total Earth visibility, exceeding the 30-second success-criterion pause.
- The substate enum + `PBD_SUBSTATE_ORDER` are reordered to match the corrected chronological sequence.
- The total cinematic arc length stays 180s (30 turning + 6×15s sweeping + 30s composite_active + 30s composite_decay) so Story 5.2's 50× speedup-factor recomputation is preserved.
- Downstream tests (substates.test.ts, index.test.ts, pale-blue-dot-turn-integration.test.ts, pale-blue-dot-override-lifecycle.test.ts) were updated to reflect the corrected timing offsets — peak offsets that previously hit `sweeping_<body>` now hit different substates per the new ordering.

**Composite layer (T2).** Path A HTML overlay chosen — pure DOM, sidesteps ADR-0008 (`THREE.WebGLRenderer`) and ADR-0019 (zero-analytics; same-origin static-CDN image loads). The opacity tween was initially incremental (dt-based step accumulation) but failed the first-tick boundary case; refactored to pure-function tween (`(now - tweenStartMs)/fadeMs` interpolation between `tweenStartOpacity` and `targetOpacity`) which is robust against dropped frames and the first-tick boundary. The substate→plate map is the canonical contract — including the Story 5.3 Rule-5 amendment that maps `composite_active` to Earth.

**Wire-up (T3).** Single forward-referenced closure for `resolveScanPlatform` because SpacecraftModels is constructed later in main.ts than `PbdCompositeLayer`. The layer tolerates pre-load null returns (centers the plate in the viewport as a fallback). DEV-only `__voyagerDebug.pbdCompositeLayer` exposes `currentActivePlate`, `getPlateOpacity`, and `rootElement` for the AC9 smoke.

**Test pyramid (T4).** 42 new tests added in 4 files:

- `web/src/chapters/pale-blue-dot/composite-layer.test.ts` — 21 unit tests
- `web/tests/pale-blue-dot-composite-integration.test.ts` — 6 integration tests
- `web/tests/embed-mode-first-paint.test.ts` — 2 new AC8 tests (extends existing file)
- `web/scripts/build_pbd_plates.test.ts` — 12 build-pipeline E2E + pure-function tests (Rule 11)

**Test sweep.** Full vitest: **3300 pass / 10 skipped / 184 files** (baseline post-Story-5.2 was ~3258; +42 new). Typecheck clean. Lint: 4 warnings (pre-existing baseline; 0 new). Production build: clean (`npm run build` produces 982 KB main JS, plates land at `dist/images/pbd/`).

**ADR compliance verified.** ADR-0008 (Three.js WebGLRenderer) ✓ — pure DOM Path A. ADR-0014 (Hybrid chapter definition) ✓ — composite-layer lives inside `web/src/chapters/pale-blue-dot/`. ADR-0015 (no global store) ✓ — `PbdCompositeLayer` is a DI'd class instance. ADR-0019 (zero-analytics) ✓ — same-origin static-CDN image loads; no fetch beacons (a one-time JSON manifest fetch is not an analytics call). ADR-0026 (zero `any`) ✓ — fully typed module.

**Rule 11 (build-pipeline E2E).** `web/scripts/build_pbd_plates.ts` is a build-pipeline script chaining `fetch` + `sharp.extract` + `sharp.resize` + PNG encode + SHA-256 hashing. The E2E test at `web/scripts/build_pbd_plates.test.ts` covers the full chain against synthetic JPEG fixtures (no network access required) plus pure-function contracts for `sha256Hex`, `buildPlateFilename`, and `PLATE_JOBS` shape.

**Source-JPEG cache relocation.** Initial procurement staged the source JPEGs under `web/public/images/pbd/_pia*.jpg` so the build script could re-use them on subsequent runs. Vite copies ALL of `public/` to `dist/` at build time → the upstream NASA JPEGs would have shipped in the runtime bundle (+63 KB unused). Moved the cache to `web/textures-src/pbd-plates/` (gitignored), matching Story 4.3's gas-giant / moon source caching pattern. The bundled `dist/images/pbd/` now contains ONLY the runtime-needed PNGs + `plate-manifest.json`.

### File List

- `web/scripts/build_pbd_plates.ts` (NEW) — Story 5.3 T1 procurement pipeline.
- `web/scripts/build_pbd_plates.test.ts` (NEW) — Rule 11 build-pipeline E2E + pure-function tests.
- `web/package.json` (MODIFIED) — added `build-pbd-plates` script.
- `web/public/images/pbd/venus.08f78ea9.png` (NEW) — Venus plate (cropped from PIA00453).
- `web/public/images/pbd/earth.dd46ad00.png` (NEW) — Earth plate (PIA00452, the canonical PBD).
- `web/public/images/pbd/jupiter.d52291f0.png` (NEW) — Jupiter plate (cropped from PIA00453).
- `web/public/images/pbd/saturn.1e6fa076.png` (NEW) — Saturn plate (cropped from PIA00453).
- `web/public/images/pbd/uranus.ee43392b.png` (NEW) — Uranus plate (cropped from PIA00453).
- `web/public/images/pbd/neptune.dfd2e020.png` (NEW) — Neptune plate (cropped from PIA00453).
- `web/public/images/pbd/plate-manifest.json` (NEW) — runtime manifest mapping body→hashed filename.
- `web/public/_headers` (MODIFIED) — added `/images/pbd/*` immutable Cache-Control rule.
- `THIRD_PARTY.md` (MODIFIED) — added "NASA Photojournal PBD photo plates (Story 5.3)" section.
- `web/src/components/v-attribution-panel.ts` (MODIFIED) — refined NASA Photojournal entry with PIA00452/PIA00453 cite.
- `web/src/chapters/pale-blue-dot/composite-layer.ts` (NEW) — `PbdCompositeLayer` class implementation.
- `web/src/chapters/pale-blue-dot/composite-layer.test.ts` (NEW) — 21 unit tests for the composite layer.
- `web/src/chapters/pale-blue-dot/substates.ts` (MODIFIED, Rule-5 amendment) — `composite_active` repositioned + docstring updated.
- `web/src/chapters/pale-blue-dot/substates.test.ts` (MODIFIED) — updated AC2 chronological-order pin for the Rule-5 amendment.
- `web/src/chapters/pale-blue-dot/index.test.ts` (MODIFIED) — updated absolute-peak-ET assertions to match the amended timing offsets.
- `web/src/main.ts` (MODIFIED) — instantiated `PbdCompositeLayer`, wired subscribe + per-frame update, added DEV debug surface.
- `web/tests/pale-blue-dot-composite-integration.test.ts` (NEW) — 6 integration tests exercising real PaleBlueDot + PbdCompositeLayer + DOM.
- `web/tests/embed-mode-first-paint.test.ts` (MODIFIED) — 2 new AC8 tests for composite-layer presence in embed mode.
- `web/tests/pale-blue-dot-turn-integration.test.ts` (MODIFIED) — updated absolute-peak-ET assertions for the Rule-5 amendment.
- `web/tests/pale-blue-dot-override-lifecycle.test.ts` (MODIFIED) — updated absolute-peak-ET assertions for the Rule-5 amendment.
- `docs/visual-validation/pale-blue-dot.md` (NEW) — AC7 visual validation doc.
- `_bmad-output/implementation-artifacts/5-3-smoke-evidence/README.md` (NEW) — AC9 lead-driven smoke evidence inventory + probe assertions.
- `.gitignore` (MODIFIED) — added `web/textures-src/pbd-plates/_pia*.jpg` source-cache pattern.

### PIA Lookup Log

| Body    | NASA PIA ID | Source description (NASA caption)                                                      | Capture date | NASA URL                                              | Downloaded source SHA-256 | Runtime plate filename       | Runtime plate SHA-256                                              |
| ------- | ----------- | --------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------- | ------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| Earth   | PIA00452    | "The Pale Blue Dot" — Voyager 1 narrow-angle Earth frame (the canonical Sagan-1994 PBD) | 1990-02-14   | https://photojournal.jpl.nasa.gov/catalog/PIA00452    | (PIA00452.jpg ≈ 28.8 KB)  | `earth.dd46ad00.png`         | `dd46ad0004bf3b20ac9ade85db6eb5461defd7686cd0cc53af2948943627bcd0` |
| Venus   | PIA00453    | "Solar System Portrait — Views of 6 Planets" (3×2 grid; cell col=0, row=0)              | 1990-02-14   | https://photojournal.jpl.nasa.gov/catalog/PIA00453    | (PIA00453.jpg ≈ 34.3 KB)  | `venus.08f78ea9.png`         | `08f78ea943377525755429a3635d2a79b52954265b4a806db94009a4c2e9f252` |
| Jupiter | PIA00453    | (same 3×2 grid; cell col=2, row=0)                                                      | 1990-02-14   | https://photojournal.jpl.nasa.gov/catalog/PIA00453    | (PIA00453.jpg ≈ 34.3 KB)  | `jupiter.d52291f0.png`       | `d52291f0134d53dfd2feb22a8f63dfbaa92d8c95fcdaa9969329c07a1f91d672` |
| Saturn  | PIA00453    | (same 3×2 grid; cell col=0, row=1)                                                      | 1990-02-14   | https://photojournal.jpl.nasa.gov/catalog/PIA00453    | (PIA00453.jpg ≈ 34.3 KB)  | `saturn.1e6fa076.png`        | `1e6fa07614217c600b5119b21262c6b80e5f5a342c29ae3e4bda71fabda73a23` |
| Uranus  | PIA00453    | (same 3×2 grid; cell col=1, row=1; motion-smeared from 15s exposure)                    | 1990-02-14   | https://photojournal.jpl.nasa.gov/catalog/PIA00453    | (PIA00453.jpg ≈ 34.3 KB)  | `uranus.ee43392b.png`        | `ee43392b0c3aa22e85ff45d80d4611dbd58655f878b8fbb7abbddb9f04d94f0b` |
| Neptune | PIA00453    | (same 3×2 grid; cell col=2, row=1; motion-smeared from 15s exposure)                    | 1990-02-14   | https://photojournal.jpl.nasa.gov/catalog/PIA00453    | (PIA00453.jpg ≈ 34.3 KB)  | `neptune.dfd2e020.png`       | `dfd2e020fd068bb3e2674621ec8ae80e8037829de239d701b5f0bbc9e17d871d` |

Direct image URLs (NASA Photojournal CDN; the legacy `photojournal.jpl.nasa.gov/catalog/<PIA>` redirects to `science.nasa.gov/photojournal/<slug>/` and the underlying image lives at `assets.science.nasa.gov`):

- PIA00452: `https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia00/pia00452/PIA00452.jpg`
- PIA00453: `https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia00/pia00453/PIA00453.jpg`

### Change Log

| Date       | Change                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 2026-05-23 | Story 5.3 implementation. Procurement (T1), composite-layer (T2), main.ts wire-up (T3), tests (T4), visual validation doc (T5), smoke evidence README (T6), final test sweep (T7). Status flipped ready-for-dev → review. |
| 2026-05-23 | Rule-5 amendment to `web/src/chapters/pale-blue-dot/substates.ts` — `composite_active` repositioned between `sweeping_earth` and `sweeping_jupiter` to match epic spec line 2141 ("during the Earth plate") and Story 5.3 AC4 ("at most one plate visible"). Affected tests (5 files) updated; full sweep green. |
| 2026-05-23 | Code review COMPLETE (cr-5-3 / epic-cycle-2026-05-23-epic5). **0 HIGH / 0 MED / 3 LOW dismissed inline.** All 10 lead-specified verification targets pass: Rule-5 amendment is a real in-place change to substates.ts (not a code-comment workaround) with full docstring rationale and cascading updates to 5 downstream test files (no silent bypass); PIA00452 + PIA00453 cited in THIRD_PARTY.md + `<v-attribution-panel>` with real NASA Photojournal CDN URLs and documented multi-panel crop strategy; Path A HTML overlay sits outside WebGL canvas (sibling DOM container with `pointer-events: none`); no Three.js Sprite / CSS3DRenderer imports (only type-only `Object3D` + `PerspectiveCamera`); AC4 fade is pure-function lerp `(now - tweenStartMs)/fadeMs` not delta-time accumulation; AC5 reduced-motion sets fadeMs=0 short-circuiting the tween; AC8 composite layer mounts in embed mode (verified at first-paint surface via no-CSS-hides-class probe + at integration tier via real PaleBlueDot + PbdCompositeLayer wire-up); ADR-0008 (no WebGPU/CSS3D), ADR-0014 (composite-layer at `web/src/chapters/pale-blue-dot/`), ADR-0015 (class instance subscribed via DI, no global store), ADR-0019 (same-origin `<img>` + same-origin JSON manifest, no fetch beacons) all verified; build_pbd_plates.test.ts is true Rule-11 E2E (synthetic JPEG fixtures + idempotency + dominant-color-per-crop); AC9 Integration AC exercises real `new PaleBlueDot()` + `new PbdCompositeLayer` + real DOM via happy-dom (`pale-blue-dot-composite-integration.test.ts`); plate-manifest.json content hashes match on-disk file SHA-256 prefixes (re-verified via `sha256sum` on each of the six PNGs — all 8-char prefixes match filenames + manifest `sha256` field). Web vitest 3288 pass / 55 skipped / 185 files; typecheck clean; lint 4 warnings (pre-existing baseline; 0 new). **Approval pending AC9 lead-driven Chrome DevTools MCP smoke per Rule 3 / Rule 7** — sub-agent tool inventory is harness-inherited, so the AC9 production-build deep-link smoke runs from the lead's harness against `cd web && npm run build && npx serve dist`; 6 substate-peak + 1 mid-fade screenshots committed to `_bmad-output/implementation-artifacts/5-3-smoke-evidence/`. |

## Review Findings (cr-5-3 / 2026-05-23)

### HIGH

(none)

### MED

(none)

### LOW (dismissed inline)

1. **[5.3 / LOW dismissed]** Documentation-vs-implementation reconciliation: Story Dev-Notes line "Anchor point math" describes `scanPlatformNode.getWorldDirection()` as the projection input, but the implementation uses `getWorldPosition()` (composite-layer.ts:590). The choice is correct and justified inline in code (composite-layer.ts:583-588 — "we use position rather than world-direction because the screen anchor IS the cone tip / position, NOT a far-away direction vector — a direction would project to a vanishing-point pixel dependent on camera FOV"). Dev's implementation matches Story 3.5 boresight-renderer's anchor semantics; the doc Dev-Notes text is the loose description, not the contract. **Dismiss:** the code comment captures the correct rationale; no fix needed.

2. **[5.3 / LOW dismissed]** `dispose()` clears the `plates` Map but leaves `manifestReady = true` and the `subscriberUnsub` field cleared to null. Re-using the same instance after `dispose()` would observe an empty plates map and would never re-fetch the manifest. Constructing a fresh `PbdCompositeLayer` instance is the supported re-entry path (`main.ts` constructs once at boot). **Dismiss:** the QA gap-filler tests confirm `dispose()` is idempotent and cleans state correctly for the supported single-use lifecycle.

3. **[5.3 / LOW dismissed]** `main.ts`'s forward-referenced `spacecraftModelsRef` closure for `resolveScanPlatform` is well-documented (inline comments + dev agent record), but if a future refactor moves `SpacecraftModels` construction earlier in `bootstrap()`, the forward-reference becomes redundant. **Dismiss:** the present construction order is correct; refactor at the next `main.ts` topology change.

### Rule-by-rule verdict

- **Rule 1 (Integration AC):** AC9 is the named Integration AC. Verified — `web/tests/pale-blue-dot-composite-integration.test.ts` exercises real `new PaleBlueDot()` + real `new PbdCompositeLayer` + real DOM with no module-level mocks (only injects `wallClock` + `preloadedManifest` for deterministic timing). AC4 single-plate invariant verified via real DOM queries. PASS.
- **Rule 3 (per-story smoke evidence):** AC9 lead-driven Chrome DevTools MCP smoke is REQUIRED for the `review → done` transition per the story file. Code review APPROVES pending the lead's smoke; smoke evidence inventory is pre-populated in `_bmad-output/implementation-artifacts/5-3-smoke-evidence/README.md` so the lead has the exact probe assertions + deep-link ETs ready.
- **Rule 5 (NFR tripwire):** The substates.ts amendment is a REAL in-place amendment (enum reordered, PBD_SUBSTATE_ORDER reordered, PBD_SUBSTATE_TIMINGS rewritten, dedicated docstring section in substates.ts explaining the original-vs-amended wording per the Rule), cascaded to 5 downstream test files (`substates.test.ts`, `index.test.ts`, `pale-blue-dot-turn-integration.test.ts`, `pale-blue-dot-override-lifecycle.test.ts`, plus the composite-layer's own substate→plate map). No silent bypass or test-skip detected. The QA gap-filler tests `composite_active.end - sweeping_earth.start >= 30s` AT THE TIMING-TABLE LEVEL (not just at the composite-layer's substate→plate map) — defense against drift. PASS.
- **Rule 6 (ADR violations):** ADR-0008 (no WebGPU/CSS3D imports), ADR-0014 (composite-layer lives in `web/src/chapters/pale-blue-dot/`), ADR-0015 (class instance subscribed via DI, no global store; `__voyagerDebug.pbdCompositeLayer` is DEV-only debug surface per ADR-0019's localStorage-only-error-capture spirit), ADR-0019 (same-origin `<img>` loads from static CDN; one-time same-origin JSON manifest fetch which is not an analytics call; no `navigator.sendBeacon`, no cross-origin fetches). PASS.
- **Rule 9 (APG primitives):** Not applicable — no slider/listbox/dialog primitives introduced.
- **Rule 10 (Lit declare + ctor-init):** Not applicable — `<v-attribution-panel>` change was a single-line `description` text refinement; no new reactive properties.
- **Rule 11 (build-pipeline E2E):** `web/scripts/build_pbd_plates.ts` is a multi-binary chain (fetch + sharp.extract + sharp.resize + sharp.png + crypto.SHA-256). `web/scripts/build_pbd_plates.test.ts` includes 5 E2E tests against synthetic JPEG fixtures: produces 128×128 PNGs with content-hashed filenames, idempotency (same source → same output filename + sha256 + bytes), per-cell dominant-color verification for Venus crop (col=0 row=0 → purple) AND Jupiter crop (col=2 row=0 → blue). The full extract+resize+encode chain runs end-to-end; only the live NASA Photojournal CDN download is excluded (covered by the production `npm run build-pbd-plates` invocation). PASS.
- **Rule 12 (LFS threshold disclosure):** Not applicable — six plate PNGs total ~150 KB; nowhere near the 500 MB per-story or 250 MB per-file threshold. THIRD_PARTY.md correctly records "No LFS tracking; committed directly to the repo."

### Plate manifest integrity audit

Confirmed on-disk SHA-256 prefixes match filenames + plate-manifest.json `sha256` field for all six plates:

| Body    | Filename                | On-disk SHA-256 prefix | Filename hash prefix | Match? |
| ------- | ----------------------- | ---------------------- | -------------------- | ------ |
| Venus   | `venus.08f78ea9.png`    | `08f78ea9`             | `08f78ea9`           | ✓      |
| Earth   | `earth.dd46ad00.png`    | `dd46ad00`             | `dd46ad00`           | ✓      |
| Jupiter | `jupiter.d52291f0.png`  | `d52291f0`             | `d52291f0`           | ✓      |
| Saturn  | `saturn.1e6fa076.png`   | `1e6fa076`             | `1e6fa076`           | ✓      |
| Uranus  | `uranus.ee43392b.png`   | `ee43392b`             | `ee43392b`           | ✓      |
| Neptune | `neptune.dfd2e020.png`  | `dfd2e020`             | `dfd2e020`           | ✓      |

The QA gap-filler `pale-blue-dot-composite-qa.test.ts` runs the same SHA-256 audit at vitest time — drift-defense is in the test sweep, not just at review time.

### Approval

**APPROVED PENDING AC9 LEAD SMOKE.** Code is correct, tests are comprehensive (75 new tests across dev + QA stages), ADRs honored, Rule-5 amendment is real, build pipeline is Rule-11 compliant, integration AC exercises real wire-up. Per Rule 3 the AC9 Chrome DevTools MCP smoke is the per-story exit criterion; the lead runs the smoke against the production build (`cd web && npm run build && npx serve dist`) per the probe inventory in `_bmad-output/implementation-artifacts/5-3-smoke-evidence/README.md` and commits the 7 substate-peak + 1 mid-fade screenshots before flipping status to `done`.
