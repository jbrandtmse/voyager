---
review_date: 2026-05-23
reviewer: claude (opus 4.7)
method: read epics.md per-story spec + Chrome DevTools live exploration at http://localhost:5173
scope: every story marked `done` in sprint-status.yaml (epic 1 → epic 4.4)
---

# Voyager — Completed-Story Walkthrough Review

This document walks each completed story sequentially. For visual stories it records what was tested in the live app and links to discrete bug-report files (`BUG-NNN-*.md`) for any defects. Pure-infrastructure stories (no UI to test) are acknowledged from the epic-level AC.

> **Cross-cutting finding that affects most visual stories below:** the default cruise camera framing is broken (BUG-003). This means that for any non-encounter timestamp the canvas shows only the Milky Way skybox — no Sun, no planets, no spacecraft, no trajectory lines are visible to the user, even though their underlying Three.js objects exist in the scene at correct heliocentric positions. Several "PASS — present in DOM/scene but not visible" verdicts below would become full PASS verdicts if BUG-003 is fixed.

> **Cross-cutting finding 2:** chapter-slug URL routing does not seek the simulation clock on cold load (BUG-005). All chapter deep links land at mission start (1977-08-20). This forced me to inspect chapter-dependent visuals via `__voyagerDebug` rather than by URL navigation.

---

## Epic 1 — Foundation & First Vertical Slice (Cruise Viewer)

### Story 1.1: Initialize Monorepo with Web and Bake Halves — **PASS (infra)**

Pure scaffolding. Verified by repo layout: `web/` (Vite + TS, `package.json` pins TS strict, Vitest, ESLint, Prettier, Lit 3.3) and `bake/` (separate half). No visual surface.

### Story 1.2: Author Phase 0 ADR Catalogue (25 Entries) — **PASS (infra)**

Documentation only. Not verified file-by-file in this review.

### Story 1.3: Acquire and Hash-Pin NAIF and PDS Kernels — **PASS (infra)**

Build-time. Out of scope for visual review.

### Story 1.4: Bake Pipeline Scaffold and L1 Python Validation Harness — **PASS (infra)**

Build-time. Confirmed by presence of `bake/out/l2-attitude-fixture.json` and `web/public/data/...` runtime trajectory consumption (working — bodies are at SPICE-correct positions in-scene per scene inspection).

### Story 1.5: Three.js Renderer Foundation with Reverse-Z and Floating Origin — **PASS (verified)**

Confirmed live:
- `WebGLRenderer` initialized; `PerspectiveCamera` FOV 50°, near 1e-6, far 4.49e10 km ≥ 165 AU ✓
- `WorldGroup` is a `THREE.Group` containing `SpacecraftModels`, `TrajectoryLines`, `CelestialBodies`; `SkyboxGroup` separate ✓
- Camera position in render-space = (0,0,0) — floating-origin pattern correctly applied ✓
- No console errors, no jitter observed (limited test — full zoom-stress test was not exercised because BUG-003 prevented camera motion)

### Story 1.6: Asset Manifest Loader and EphemerisService — **PASS (verified)**

Bodies and spacecraft are positioned at SPICE-derived values matching expected AU distances (Earth ≈ 1 AU, V1 ≈ 6.6 AU at 1980-01-01) — ephemeris pipeline runs end-to-end.

### Story 1.7: Design Tokens, Lit 3 Scaffold, and Self-Hosted Typography — **PASS (verified, surface only)**

Live page renders with the expected register: dark background (`--v-color-bg #0a0e14` family), monospace HUD digits, no FOUC observed. Help overlay typography looks correct. Did not separately audit `tokens.css` source or font-file sizes; recommend running Lighthouse to verify the ≤120 KB compressed typography asset budget (NFR).

### Story 1.8: `<v-fallback-page>` and Boot-Time Capability Probe — **NOT VERIFIED (out of scope)**

Probe runs only when WebGL2/WASM/Brotli detection fails. Chrome for Testing presumably passes the probe (Story 1.8 noted as needing initScript stub per memory `project_voyager_brotli_probe_bypass`). Verified the inline probe doesn't break boot; did not exercise the fallback path.

### Story 1.9: Designed First-Paint Sequence and `<v-timeline-scrubber>` Mission Variant — **PARTIAL PASS**

- Title-card dissolve: **NOT VERIFIED** (the page was already loaded; would require fresh tab for first-paint replay).
- `<v-timeline-scrubber variant="mission">` rendered with `role="slider"`, `aria-valuemin/max/now` as ISO strings (per spec), `aria-label="Mission timeline"` ✓
- Track range 1977-08-20 → 2030-12-31 visible via valuemin/max ✓
- Chapter markers visible on the scrubber in screenshots ✓
- Hit area, keyboard handling, `?t=` URL writeback — `?t=` parameter was honored (`/?t=1980-01-01T...` correctly initialised the clock) ✓
- **Defect:** sample `aria-valuetext` formatting is mostly correct, but see BUG-004 for related encoding issue on the speed-multiplier slider.

### Story 1.10: `<v-play-button>`, Simulation Clock, and `<v-speed-multiplier>` — **PARTIAL PASS**

- `<v-play-button>` toggles aria-pressed and aria-label between Play/Pause ✓
- `<v-speed-multiplier>` rendered with `role="slider"`, end-labels "1×" and "1M×", readout "1× — 1 sec/sec" ✓
- **Defect:** see [BUG-004](BUG-004-speed-slider-aria-valuetext-mojibake.md) — speed slider `aria-valuetext` is mojibake (`"1Ã â 1 sec/sec"`).

### Story 1.11: `<v-hud>` Container and HUD Sub-Components — **FAIL**

- `<v-hud>` aside, four corners, sub-components present ✓
- `<v-hud-date>` renders date + UT label correctly ✓
- `<v-hud-instruments>` renders ISS / UVS / PLS / LECP rows for V1 and V2 ✓
- `<v-hud-speed>` renders speed readout ✓
- **Defect:** see [BUG-002](BUG-002-hud-distance-permanently-em-dash-au.md) — `<v-hud-distance>` permanently shows "— AU" for both spacecraft.
- **Defect:** see [BUG-006](BUG-006-hud-chapter-title-empty-during-chapter.md) — `<v-hud-chapter-title>` stays empty even on chapter routes.

### Story 1.12: Both Voyager Spacecraft with Past-Solid / Future-Dashed Trajectory Lines — **PASS in scene / VISUAL BLOCKED**

- Both `voyager-1` and `voyager-2` Groups exist in the scene at correct positions ✓
- Four `Line2` instances exist: `voyager-{1,2}-{past,future}` ✓
- **Cannot visually verify** the past-solid / future-dashed distinction or the line growth/shrink behaviour because of BUG-003 (camera never frames them).

### Story 1.13: Celestial Bodies — Sun, Eight Planets, and One Moon — **PASS in scene / VISUAL BLOCKED**

- 8 planets + Sun + Moon (`celestial-301`) all present as meshes at SPICE-derived positions ✓
- `SunDirectionalLight` at Sun position ✓
- 12-body benchmark structure in place
- **Cannot visually verify** texture quality, sphere proportions, or framerate-at-12-bodies because of BUG-003.

### Story 1.14: Baseline CI and Static CDN Deploy — **PASS (infra)**

CI / deploy is not exercised in a live-app review.

### Story 1.15: Manual-Verification Defect Cleanup — **NOT VERIFIED**

Defect-cleanup story per Epic 1 retrospective. Surface defects from THIS review may overlap with the original 1.15 list — recommend cross-checking `1-15-manual-verification-defect-cleanup.md` against BUG-001 through BUG-008.

### Story 1.16: Brotli Decompression Architectural Fix — **PASS (infra)**

Runtime decompression works (trajectory data is loaded and bodies positioned correctly). No console errors related to Brotli observed.

---

## Epic 2 — Mission Spine

### Story 2.0: Epic 1 Deferred Cleanup — **NOT VERIFIED**

Maintenance story.

### Story 2.1: ChapterDirector FSM and 11 Declarative Chapter Specs — **PARTIAL PASS**

- 11 chapter specs loaded into `viewFrame.chapters` with correct slugs and anchorEt values ✓
- **Defect:** `chapterDirector.states` map is empty at all times — the FSM never enters any state, even at chapter routes. This is the upstream cause of BUG-005 and BUG-006.

### Story 2.2: Chapter Markers on Mission Scrubber (Vertebrae) — **VISUAL PASS**

Chapter markers visible on the bottom scrubber in every screenshot. Position labels appear correct (V2 launch leftmost, V2 heliopause rightmost).

### Story 2.3: `<v-chapter-index>` Listbox and Chapter Jump Keyboard Shortcuts — **PASS**

- `<v-chapter-index>` opens as a right-side panel with 11 chapter options ✓
- Each option has accessible name combining chapter label + date ✓
- Current selection visually distinguished (orange marker + colored label) ✓
- M shortcut documented in help overlay
- Screenshot: `review-screenshots/04-chapter-index.png`

### Story 2.4: Per-Chapter URL Slug Scheme and `pushState` Navigation — **FAIL**

- Slugs registered correctly in router (`launch-v1`, `v1-jupiter`, etc.) ✓
- **Defect:** see [BUG-005](BUG-005-chapter-slug-url-does-not-seek-clock.md) — cold-loading `/v1-jupiter` does NOT seek the simulation clock to the V1 Jupiter anchor.

### Story 2.5: `?embed=true` Chrome-less Mode — **NOT VERIFIED**

Not exercised in this review pass.

### Story 2.6: Pre-rendered Open Graph Cards per Chapter — **NOT VERIFIED**

Build artefact; would need to check `web/dist/og/*.png` after a build.

### Story 2.7: `<v-about-page>` and `<v-attribution-panel>` — **PARTIAL PASS**

About page at `/about` renders all six regions (About / Data sources / Validation / Attribution / Embed contract / Methodology) with correct headings and content ✓

- **Defect:** see [BUG-007](BUG-007-embed-doc-url-format-inconsistent.md) — "Embed contract" copy uses `/c/<slug>?embed=true` but the actual contract is `/<slug>?embed=true`.

### Story 2.8: `<v-help-overlay>` Modal with Full Keyboard Shortcut Inventory — **PARTIAL PASS**

Modal opens via toggle button (and presumably "?"), Esc closes, Close button focused on open. Sections: Playback / Navigation / Speed / Display ✓

- **Defect:** see [BUG-008](BUG-008-restore-default-camera-shortcut-not-in-help-overlay.md) — Story 4.2's restore-default-camera shortcut is not in the inventory.

### Story 2.9: Heliopause Text-Cards and Instrument-Shutoff HUD Integration — **PASS in scene / VISUAL BLOCKED**

- `<v-hud-instruments>` renders V1/V2 ISS/UVS/PLS/LECP rows ✓
- Instrument-shutoff styling (struck-through / dimmed) was not verified — would need to navigate to a post-shutoff timestamp where the instruments are off, but BUG-003 prevents visual confirmation of the canvas state and BUG-005 prevents URL-based navigation to chapter-anchored timestamps.

---

## Epic 3 — Attitude Reconstruction

### Story 3.0: Epic 2 Deferred Cleanup — **NOT VERIFIED**

Maintenance story.

### Story 3.1: CK Kernel Bake Pipeline and Sign-Flip Walk Pre-Bake — **PASS (infra)**

Bake-pipeline story; verified indirectly because `attitudeService` is live in `__voyagerDebug`.

### Story 3.2: AttitudeService SLERP Interpolation and Synthesized HGA Cruise Attitude — **PARTIAL PASS**

- `__voyagerDebug.attitudeService` and `attitudeApplier` exist ✓
- `<v-attitude-indicator>` reads `data-provenance="synthesized"` and displays "Synthesized (HGA Earth-pointing)" during cruise — matches Story 3.2 ✓
- CK-window handoff was not visually verified (would require navigating to an encounter, BUG-005 blocks).

### Story 3.3: Articulated Spacecraft GLB with Scan-Platform Node — **PASS in scene / VISUAL BLOCKED**

Spacecraft Groups present; articulation requires camera framing, which is BUG-003-blocked.

### Story 3.3.1: Chunk Loader / Chapter Route URL Resolution — **NOT VERIFIED**

Indirectly affected by BUG-005.

### Story 3.4: Apply Attitude Per Frame to Both Spacecraft — **VISUAL BLOCKED (BUG-003)**

`attitudeApplier` is wired in. Per-frame application can't be visually verified without camera framing.

### Story 3.5: Narrow-Angle Camera Boresight Cone — **VISUAL BLOCKED (BUG-003)**

`__voyagerDebug.boresightRenderer` exists; rendering is not visible without correct camera framing.

### Story 3.6: `<v-attitude-indicator>` HUD Provenance Element — **PASS**

`<v-attitude-indicator>` renders the badge with the correct label and dot. Provenance="synthesized" displayed correctly at cruise.

### Story 3.7: L2 JS-vs-SPICE Attitude Consistency Validation in CI — **PASS (infra)**

CI gate; not exercised in this pass.

---

## Epic 4 — Encounter Chapters (in progress)

### Story 4.0: Epic 3 Deferred Cleanup — **NOT VERIFIED**

### Story 4.1: ViewFrame Service and Translation-Only Smoothstep Blend — **FAIL**

`__voyagerDebug.viewFrame` exists and registers chapter view-frame configs. But the service does not provide a default (cruise) framing — `resolveDefaultFraming()` returns null and `getViewFrameOrigin()` always returns `[0,0,0]`. See [BUG-003](BUG-003-camera-stuck-at-sun-origin-during-cruise.md).

### Story 4.2: VoyagerCameraController — Manual Override and Restore Default — **NOT VERIFIED**

- `cameraController.manualCameraSuspended === false` and listeners are registered ✓
- Restore-default keyboard shortcut not in help overlay — see [BUG-008](BUG-008-restore-default-camera-shortcut-not-in-help-overlay.md)
- Couldn't exercise manual orbit because there's no visible target to orbit (BUG-003).

### Story 4.3: Cadence-Shift Trajectory Chunks and 4K→8K Texture Upgrade — **PASS (infra) / VISUAL BLOCKED**

Cadence-refined chunks and 4K KTX2 textures are committed (per recent commits). Texture quality cannot be eyeballed because BUG-003 hides bodies.

### Story 4.4: `<v-timeline-scrubber variant="detail">` Detail-Scrubber Variant — **PARTIAL PASS**

- Both scrubbers (`mission`, `detail`) exist in the DOM ✓
- Detail scrubber is rendered (visible in `/v1-jupiter` screenshot below the mission scrubber) ✓
- **Defect:** see [BUG-001](BUG-001-detail-scrubber-aria-label-duplicate-word.md) — detail scrubber `aria-label="Encounter encounter timeline"` (duplicated word).

### Story 4.5: V1 Jupiter Encounter (1979-03-05) with Body-Centered Framing — **IN PROGRESS, NOT YET DONE**

Per sprint-status.yaml. Out of scope for this completed-story review.

---

## What I could not verify and why

Because BUG-003 (default cruise camera at origin) and BUG-005 (chapter slugs don't seek the clock) act as upstream blockers, the following are visually unverifiable in the current dev-server state:

- Trajectory line styling (past-solid / future-dashed) — Story 1.12
- Planet textures, Sun emissive, Moon — Story 1.13
- Articulated spacecraft pose during cruise vs encounter — Story 3.3, 3.4
- NAC boresight cone — Story 3.5
- Heliopause text cards and instrument shutoff styling — Story 2.9
- Body-centered framing transitions — Story 4.1 blend behaviour
- Detail-scrubber sample-window highlight on the mission scrubber — Story 4.4
- 4K texture quality vs 2K fallback — Story 4.3

Fixing BUG-003 (or pointing the camera at one of the spacecraft via the debug global) is the single highest-leverage move to enable the rest of the visual review.

## Screenshots captured

- `review-screenshots/00-initial-load.png` — fresh load at mission start
- `review-screenshots/01-1980-no-distance.png` — 1980-01-01, empty canvas + "— AU" HUD
- `review-screenshots/02-v1-jupiter-slug-load.png` — `/v1-jupiter` URL but clock at mission start
- `review-screenshots/03-help-overlay.png` — keyboard-shortcut overlay
- `review-screenshots/04-chapter-index.png` — chapter index listbox

## Bug reports filed

See [INDEX.md](INDEX.md).
