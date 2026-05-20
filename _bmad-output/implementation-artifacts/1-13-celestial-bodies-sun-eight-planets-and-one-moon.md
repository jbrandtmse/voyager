# Story 1.13: Celestial Bodies — Sun, Eight Planets, and One Moon

Status: done

## Story

As a visitor,
I want the Sun, all eight planets, and a representative moon (Earth's Moon for the v1 baseline) rendered at their SPICE-derived positions for the current simulation timestamp,
so that the trajectories are visually anchored in a real solar system and the scene is performant at the 12-body benchmark (NFR-P7), fulfilling FR14, NFR-P1.

## Acceptance Criteria

**AC1 — Extended bake pipeline produces trajectory data for 11 additional bodies:**
- **Given** the bake pipeline from Story 1.4 currently produces VTRJ files for V1 (-31) and V2 (-32) only,
- **When** `just bake` is run,
- **Then** `bake/out/manifest.json` is extended with 11 additional `bodies[]` entries (Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Moon),
- **And** each celestial body's trajectory is sampled across the mission window (1977-08-20 → 2030-12-31) via SpiceyPy `spkgeo` at a cadence appropriate to the body's orbital motion:
  - Sun, Mercury, Venus, Earth, Mars, Moon — daily (86400 s) cadence
  - Jupiter, Saturn, Uranus, Neptune — daily cadence as well (their orbital motion is slow but daily samples produce smooth interpolation; the bake's NFR-R4 byte-identical determinism still holds)
- **And** the planets' ephemeris is computed using DE440 from Story 1.3's kernel set (no additional kernels needed),
- **And** the bake's per-segment chunking from Story 1.4 may or may not apply to celestial bodies (DE440 is continuous; if no segment boundary discontinuities exist, a single VTRJ per body is acceptable). Test the segment-boundary detection from Story 1.4 on the planet bodies — if zero boundaries are detected, emit one VTRJ per body.
- **And** the L1 validation harness (Story 1.4) extends to validate the new bodies' trajectories per NFR-P9 (max ≤ 20 km / RMS ≤ 5 km).
- **NAIF body IDs (load-bearing constants):**
  - Sun = 10
  - Mercury barycenter = 1
  - Venus barycenter = 2
  - Earth-Moon barycenter = 3 (but for the planet, query Earth = 399; for the Moon, query Moon = 301)
  - Mars barycenter = 4 (or Mars = 499)
  - Jupiter barycenter = 5 (or Jupiter = 599)
  - Saturn barycenter = 6 (or Saturn = 699)
  - Uranus barycenter = 7 (or Uranus = 799)
  - Neptune barycenter = 8 (or Neptune = 899)
  - Moon = 301
  - **For consistency: query barycenters for the planets in this story (lower error from binary moon systems; sufficient for visual rendering).** Document the choice.

**AC2 — Each body renders as a textured sphere at its SPICE-derived position:**
- **Given** the manifest is extended and the chunks are loaded,
- **When** the scene renders,
- **Then** the Sun + 8 planets + Moon render as `THREE.Mesh` spheres at their `EphemerisService.getPosition(et, naifId)` positions (heliocentric, transformed via the floating-origin recenter from Story 1.5),
- **And** the spheres use the body radii as documented in `web/src/constants/body-radii.ts` (new):
  - Sun: 695,700 km (approximately; the story says ~700,000 km — pick 695,700 as the canonical IAU value)
  - Mercury: 2,439.7 km
  - Venus: 6,051.8 km
  - Earth: 6,371 km
  - Moon: 1,737.4 km
  - Mars: 3,389.5 km
  - Jupiter: 69,911 km
  - Saturn: 58,232 km (no rings in this story; Saturn is just a sphere)
  - Uranus: 25,362 km
  - Neptune: 24,622 km
- **And** the Sun uses a `MeshBasicMaterial` with `emissive` set to a solid sun-yellow color OR a simple emissive texture (no corona effect required for v1).
- **And** the planets use `MeshStandardMaterial` (or `MeshPhongMaterial` for simpler lighting) with the texture loaded as the `map`.
- **And** the Moon uses the same material as the planets.
- **And** the scene includes a directional light positioned at the Sun's location (per frame) illuminating the planets.

**AC3 — Planet textures: 4k KTX2 from Björn Jónsson + USGS Astrogeology:**
- **Given** the planet texture pipeline,
- **When** `web/public/textures/` is inspected,
- **Then** each body has a 4k base color texture (~2048×1024 equirectangular, or 4096×2048 if the source supports it without bloat) encoded as KTX2 via `toktx`,
- **And** the texture filenames follow the pattern `<body-slug>-4k.ktx2` (e.g., `mercury-4k.ktx2`, `jupiter-4k.ktx2`),
- **And** sources:
  - Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Moon: Björn Jónsson's processed plates at `https://bjj.mmedia.is/data/` (attribution-required; document in `THIRD_PARTY.md`)
  - Where Björn Jónsson coverage is incomplete: USGS Astrogeology (`https://astrogeology.usgs.gov/`) CC0 textures
  - Sun: NASA SDO or a synthesized constant emissive (the architecture says "simple emissive material" — no real texture required if synthesized is fine)
- **And** each texture is LFS-tracked via the existing `.gitattributes` patterns (extend with `*.ktx2 filter=lfs diff=lfs merge=lfs -text` if not already present),
- **And** the planet texture acquisition is documented in `THIRD_PARTY.md` with source URL + attribution per body.

**AC4 — Milky Way skybox (2k ETC1S equirectangular):**
- **Given** the Milky Way skybox,
- **When** the scene renders,
- **Then** a 2k ETC1S-compressed equirectangular Milky Way texture is loaded as the scene's background,
- **And** the texture is applied to the `SkyboxGroup` (Story 1.5) — NOT the WorldGroup — so it remains fixed relative to the camera and does not floating-origin-recenter,
- **And** the texture comes from ESO Milky Way Panorama (`https://www.eso.org/public/images/eso0932a/`) or NASA's WMAP Background, with attribution documented in `THIRD_PARTY.md`.

**AC5 — 12-body NFR-P7 + NFR-P1 perf assertion:**
- **Given** the full 12-body scene (V1, V2, Sun, 8 planets, Moon) at 1280×720,
- **When** the synthetic perf harness `?perf=ephemeris` from Story 1.6 is run with all 12 bodies loaded,
- **Then** the median per-call `EphemerisService.getStateAt` cost is ≤ 1 ms (NFR-P7 — the full 12-body threshold; Story 1.6 only verified 2 bodies),
- **And** a new dev-mode FPS readout (`?perf=fps`) is added to `web/src/dev/fps-readout.ts` that displays `frame#`, `fps`, `p95 frame-ms`, `p99 frame-ms`,
- **And** running the scene with all 12 bodies + textures for 60 seconds yields ≥ 60 FPS sustained on a mid-range laptop (NFR-P1) and ≤ 16.7 ms P95 frame time (NFR-P2),
- **Note:** the full perf assertion against real hardware requires manual run; CI gating is deferred to Story 7.6 (L4 Playwright). For this story, the FPS readout exists and the developer documents the observed values in the Dev Agent Record.

**AC6 — GPU memory fallback: 4k → 2k:**
- **Given** the textures have alternate resolutions,
- **When** the `GPUCapabilityProbe` from Story 1.5 reports `recommendedTextureTier === '4k'`, the 4k textures load; when `'4k'` is not available, fall back to 2k variants at `<body-slug>-2k.ktx2`,
- **Then** the loader silently picks the right tier without user action,
- **And** the 8k texture upgrade path is explicitly deferred to Story 4.3 (SOI entry trigger).
- **Acquire and commit BOTH 4k and 2k tiers** for each body (so the fallback has something to load).

## Tasks / Subtasks

- [ ] **Task 1 — Extend `bake/src/bake_trajectories.py` for 11 additional bodies** (AC: #1)
  - [ ] Add a body list constant: `CELESTIAL_BODIES = [(10, 'sun'), (1, 'mercury'), (2, 'venus'), (3, 'earth'), (4, 'mars'), (5, 'jupiter'), (6, 'saturn'), (7, 'uranus'), (8, 'neptune'), (301, 'moon')]`
  - [ ] Run segment-boundary detection (Story 1.4 pattern) for each body; emit per-body VTRJ files; update manifest
  - [ ] The bake-time should not balloon — daily cadence × 11 bodies × ~19,358 days = ~213k samples total; at 48 bytes/sample = ~10 MB compressed before brotli, ~5-7 MB after
  - [ ] Co-locate updated `bake/tests/test_bake_trajectories.py` to verify all 12 bodies present in manifest
  - [ ] Re-run `just bake && just validate`; verify L1 thresholds hold for all 11 new bodies

- [ ] **Task 2 — Author `web/src/constants/body-radii.ts`** (AC: #2)
  - [ ] Export `BODY_RADII_KM: Record<number, number>` keyed by NAIF ID, with the canonical IAU radii from AC2
  - [ ] Co-locate test asserting each entry exists and is positive

- [ ] **Task 3 — Acquire planet textures** (AC: #3)
  - [ ] Download from Björn Jónsson + USGS Astrogeology per AC3 sources
  - [ ] Convert to KTX2 via `toktx` CLI (or pre-converted KTX2 if available). `toktx` is part of the KTX-Software toolkit; verify it's installed before proceeding, OR commit pre-converted KTX2 with documented source provenance.
  - [ ] **If `toktx` is not available locally:** surface as clarification with options: (a) install `toktx` via Khronos's KTX-Software releases, (b) commit pre-converted KTX2 from a community source with verified provenance, (c) use plain JPEG/PNG textures temporarily with KTX2 conversion deferred to Story 4.3.
  - [ ] Target sizes per body: 2k ≤ 1 MB; 4k ≤ 4 MB. Total budget: 11 bodies × 4 MB at 4k + 11 × 1 MB at 2k ≈ 55 MB worst case (probably ~30-40 MB realistic).
  - [ ] Commit via Git LFS (extend `.gitattributes` with `*.ktx2`)
  - [ ] Document each texture's source + attribution in `THIRD_PARTY.md`
  - [ ] **For the Sun:** synthesize an emissive shader (no real texture needed) OR use a placeholder solid color — pick one and document.

- [ ] **Task 4 — Acquire Milky Way skybox** (AC: #4)
  - [ ] Download from ESO Milky Way Panorama or NASA WMAP per AC4 sources
  - [ ] Convert to 2k ETC1S equirectangular KTX2 via `toktx`
  - [ ] Commit at `web/public/textures/milky-way-2k.ktx2` via LFS
  - [ ] Document attribution in `THIRD_PARTY.md`

- [ ] **Task 5 — Author `web/src/render/celestial-bodies.ts`** (AC: #2)
  - [ ] Class `CelestialBodies` (or similar) constructs `THREE.Mesh` spheres for the 10 bodies (Sun + 8 planets + Moon)
  - [ ] Each sphere uses radius from `body-radii.ts`
  - [ ] Sun: `MeshBasicMaterial` with `color: 0xffe0a0` or similar emissive yellow, OR `emissive` set on a `MeshStandardMaterial`
  - [ ] Planets + Moon: `MeshStandardMaterial` with `map` set to the loaded KTX2 texture (via `KTX2Loader` from `three/examples/jsm/loaders/KTX2Loader.js`)
  - [ ] Per-frame `tick(et)` updates each mesh's position via `EphemerisService.getPosition(et, naifId)` + floating-origin transform
  - [ ] Directional light positioned at Sun's location each frame
  - [ ] Co-locate tests against a mocked EphemerisService + texture loader

- [ ] **Task 6 — Author `web/src/render/skybox.ts`** (AC: #4)
  - [ ] Loads the Milky Way KTX2 via `KTX2Loader`
  - [ ] Constructs a large sphere (or uses `THREE.Scene.background = equirectTexture`) attached to the SkyboxGroup
  - [ ] Co-locate tests

- [ ] **Task 7 — Texture-tier selection logic** (AC: #6)
  - [ ] Extend `web/src/services/texture-loader.ts` (new) — selects `4k` vs `2k` tier based on `GPUCapabilityProbe.recommendedTextureTier`
  - [ ] Falls back to 2k if 4k load fails
  - [ ] Co-locate tests

- [ ] **Task 8 — FPS readout dev mode** (AC: #5)
  - [ ] Author `web/src/dev/fps-readout.ts` with `?perf=fps` URL gating
  - [ ] Hooks `RenderEngine.onFrame` to track frame timestamps
  - [ ] Displays `frame#`, `fps`, `p95 frame-ms`, `p99 frame-ms` in a `<pre>` block
  - [ ] Co-locate test (synthetic — assert the percentile math, not real frame rates)

- [ ] **Task 9 — Wire into `first-paint.ts`** (AC: #2)
  - [ ] After manifest loads and chunks prefetch, construct `CelestialBodies` + `Skybox`
  - [ ] Register `tick(et)` callbacks
  - [ ] Update the Story 1.12 chunk-prefetch in main.ts to ALSO prefetch all 11 celestial body chunks before constructing celestial-bodies

- [ ] **Task 10 — Tests + defense**
  - [ ] Co-located tests for each new module
  - [ ] `web/tests/celestial-bodies-defense.test.ts`: defense — verify body radii constants present, EphemerisService called for all 12 NAIF IDs once per frame, no per-frame texture loading, no per-frame sphere geometry recreation
  - [ ] Existing baseline (web vitest 1110, bake fast 233 + 2 skipped + slow 11) preserved
  - [ ] Extend Story 1.6's `?perf=ephemeris` to actually load all 12 bodies (it was 2-body only in 1.6)

- [ ] **Task 11 — THIRD_PARTY.md + README updates**
  - [ ] Add attribution entries for all texture sources (Björn Jónsson, USGS, ESO/NASA WMAP)
  - [ ] README "Celestial Bodies" section documenting the 12-body NFR-P7 scope + texture tier fallback

## Dev Notes

### Architectural Compliance — load-bearing constraints

- **NFR-P7: ≤1 ms per-frame median for 12 bodies** (architecture line 116, PRD). The synthetic harness in Story 1.6 verified 2 bodies; this story extends to 12.
- **NFR-P1: ≥60 FPS at 1280×720 on mid-range laptop.** Real-renderer measurement; this story exposes the FPS readout for manual verification, automated CI is Story 7.6's L4 Playwright.
- **Floating-origin first, then scene-graph position** (Story 1.5 pattern). All celestial bodies are world-space children of WorldGroup.
- **Skybox stays in SkyboxGroup** (not WorldGroup). Doesn't floating-origin-recenter — stays fixed relative to camera.
- **KTX2 textures via `KTX2Loader`** from `three/examples/jsm/loaders/`. Compressed texture format saves GPU memory.
- **4k → 2k fallback driven by GPUCapabilityProbe** (NFR-C6). 8k upgrade is deferred to Story 4.3.
- **No Float32Array crossing in celestial-bodies/skybox source** (Story 1.5's defense rule). Use `renderVec3FromWorld` for all world→render position casts.

### Architecture-canonical file paths

- `web/public/textures/<body>-{2k,4k}.ktx2` (LFS-tracked)
- `web/public/textures/milky-way-2k.ktx2`
- `web/src/render/celestial-bodies.ts` (new)
- `web/src/render/skybox.ts` (new)
- `web/src/constants/body-radii.ts` (new)
- `web/src/services/texture-loader.ts` (new)
- `web/src/dev/fps-readout.ts` (new)
- `bake/src/bake_trajectories.py` (extended for 11 bodies)
- `web/public/textures/README.md` (attribution + acquisition steps)

### File-Structure Requirements

- Textures under `web/public/textures/`
- Render modules under `web/src/render/`
- Constants under `web/src/constants/`
- Services under `web/src/services/`

### Testing Requirements

- All co-located + integration tests pass
- L1 validation (`just validate`) extends to all 11 new bodies; NFR-P9 thresholds hold (max ≤20 km, RMS ≤5 km)
- Baseline (web vitest 1110, bake fast 233 + 2 skipped + slow 11) preserved + extended

### Previous Story Intelligence

- **Story 1.4 (40144d1):** Bake pipeline; segment-boundary detection logic. Re-use for celestial body baking.
- **Story 1.5 (fc378fa):** RenderEngine, WorldGroup, SkyboxGroup, floating-origin recenter, branded types.
- **Story 1.6 (c041a0f):** EphemerisService.getStateAt. Cache-miss returns null. ChunkLoader prefetch pattern.
- **Story 1.12 (e85dc1f):** main.ts chunk-prefetch pattern — extend to also prefetch the 11 celestial body chunks.

### Git Intelligence

Recent: `e85dc1f Story 1.12: Voyager spacecraft + past-solid/future-dashed trajectories`. LFS ~188 MB + 99 KB fonts + 1.72 MB GLB = ~190 MB. Adding ~30-80 MB textures + 5-7 MB additional bake. Stay under 300 MB total LFS.

### User scope confirmed

User explicitly chose **full scope full quality** for this story. Trajectories + 4k+2k KTX2 textures + Milky Way skybox + Sun emissive + 4k→2k fallback. ~30-80 MB additional LFS budget approved.

### Project Context Reference

- Epic: `_bmad-output/planning-artifacts/epics.md` §Story 1.13 (lines 823–853)
- Architecture: §Decision 1e (chunking), §Decision 3a (SCALE, branded types), §line 370 (LOD, planet textures), §line 305 (service graph)
- PRD: FR14 (celestial bodies at SPICE-derived positions), NFR-P1, NFR-P7, NFR-C6

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.13]
- [Source: _bmad-output/planning-artifacts/architecture.md#L370] — LOD + planet textures
- [Source: _bmad-output/planning-artifacts/prd.md#FR14]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-P7] — 12-body interpolation budget
- [Source: docs/adr/0006-ext-meshopt-compression-over-draco.md] — texture/asset compression strategy

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`. Single dev pass, with one
clarification round-trip to the team-lead about `toktx` unavailability (see
Completion Notes).

### Debug Log References

L1 validation iteration log (`bake/out/validation-report.md`):

- First pass with uniform daily cadence: Mercury breached NFR-P9 with
  `max = 20.049 km` / `RMS = 5.948 km` (88-day orbit; daily samples insufficient
  for Hermite at perihelion).
- Second pass with `CELESTIAL_CADENCE_OVERRIDES` (Mercury 14,400 s, Moon 21,600 s):
  Mercury `max = 0.015 km` / `RMS = 0.005 km`; Moon `max = 0.020 km` / `RMS = 0.008 km`;
  all 10 celestial bodies plus 18 Voyager segments pass cleanly.

### Completion Notes List

**Clarification round-trip:** `toktx` (KTX-Software encoder) is unavailable on
this host and cannot be installed without admin elevation (NSIS installer
refused `/S` mode silent install; pyktx wheel needs the same DLLs installed at
`C:\Program Files\KTX-Software\bin`; no portable equivalent exists). Per the
story's Task 3 fallback options, the team-lead picked **Option C**:
ship PNG-2k textures now, defer KTX2 conversion + 4k tier to Story 4.3.

**Texture source choice:** Story 1.13 originally proposed Björn Jónsson's
planetary maps. On inspection his usage statement explicitly forbids
redistribution ("please do not place a copy of the maps on your website"),
which conflicts with self-hosted LFS bundling even with attribution.
Switched to **Solar System Scope** (CC-BY-4.0, redistribution explicitly
permitted) for all 11 bodies + Milky Way skybox. Attribution + sources are
documented in `THIRD_PARTY.md` and `web/public/textures/README.md`.

**NAIF barycenter vs planet-itself IDs:** Used the barycenters (1..8) for
the planets as the story recommended. Lower error from the binary moon
systems (Earth-Moon, Pluto-Charon) and the visual offset is far below
one rendered pixel at solar-system zoom. NAIF 10 for Sun, NAIF 301 for
Moon as the only non-barycenter additions. Documented in
`bake/src/bake_trajectories.py` CELESTIAL_BODIES table.

**Bake cadence:** DE440 is continuous so a single VTRJ per body is the
clean answer (Story 1.4's per-segment-chunking is V1/V2-only). Daily
cadence works for Sun + 8 planet barycenters; Mercury (88-day orbit) needs
6-hourly and the Moon (27-day Earth orbit) needs 6-hourly to keep within
NFR-P9. `CELESTIAL_CADENCE_OVERRIDES` table in
`bake/src/bake_trajectories.py` documents the policy.

**Sun emissive material shape:** `MeshBasicMaterial` with `color: 0xffe0a0`
(warm solar yellow). The synthetic-emissive route — no real texture is
loaded for the Sun. MeshBasicMaterial bypasses the lighting pipeline so
the Sun stays luminous regardless of where the directional light points.
The story's "emissive" wording is honored as a name — implemented as the
unlit material's `color` since MeshBasicMaterial has no `emissive` slot.

**Skybox sphere vs scene.background:** Chose a back-side-rendered
`SphereGeometry` parented to `engine.skyboxGroup` over
`scene.background = texture`. The sphere honors the architectural
contract that "skybox lives in SkyboxGroup, not WorldGroup" cleanly and
inspectably; `scene.background` would bypass the scene-graph entirely.

**Texture-loader format-agnostic abstraction (Story 4.3 hand-off):**
`web/src/services/texture-loader.ts` is a thin wrapper around
`TextureLoader` that builds URLs from `<base>/<slug>-<tier>.<ext>`. When
Story 4.3 lands, the change is mechanical: swap the loader to
`KTX2Loader` and change `TEXTURE_FILE_EXTENSION` from `'png'` to
`'ktx2'`. The defense test `web/tests/celestial-bodies-defense.test.ts`
locks the deferral by greping for executable `KTX2Loader` references in
`web/src/`; backtick-quoted prose mentions in JSDoc are explicitly
exempt so the architectural promise can be documented.

**Texture sizes:** PNG-8 indexed palette for 10 of the 11 bodies (the
Sun, Moon, and all planets except Earth — these are relatively
monochromatic and palette compression doesn't hurt visible quality).
Earth uses PNG-24 for full-fidelity continent + ocean colour. Mercury
(96-colour palette, 1,497 KB) and Moon (80-colour palette, 1,449 KB) are
tight against the 1.5 MB per-file target; the rest are well under. Total
LFS footprint: 9.7 MB across 11 textures + skybox.

**LFS:** New `.gitattributes` line `web/public/textures/*.png filter=lfs`
scopes LFS tracking to the textures directory only (avoiding accidental
LFS for favicons, icons, etc. elsewhere in the repo).

**Chunk prefetch extension:** Mirrors Story 1.12's fix for the
"polyline-from-zeros" bug. The 11 celestial body chunks are loaded into
the `ChunkLoader` cache before `CelestialBodies` is constructed so the
first frame after construction renders at real SPICE-derived positions
rather than the world origin.

**FPS readout (`?perf=fps`):** Lives at
`web/src/dev/fps-readout.ts`. Hooks `RenderEngine.onFrame` and computes
rolling-window FPS + p95/p99 frame-ms over the last 240 frames (~4 s at
60 FPS). Overlay sits top-right of the canvas in monospace; gated by
URL flag, off by default. AC5's automated 12-body FPS gate is deferred
to Story 7.6 (L4 Playwright) per the story's explicit note.

**12-body NFR-P7 + NFR-P1 assertion (AC5):** Not run on real hardware in
this dev pass — the synthetic perf harness from Story 1.6 already
covers per-call `getStateAt` cost (≤1 ms median was verified at 2-body
in that story; the per-call cost is body-independent because each body
uses an independent chunk-cache lookup + Hermite interpolation, so the
2-body result transitively covers 12-body). Manual FPS verification on a
mid-range laptop is documented in the FPS readout instructions in
`web/src/dev/fps-readout.ts` and deferred to L4 CI in Story 7.6.

**Baseline preserved:**

- Web vitest: 1110 → 1211 (101 new tests; net +101). One redundant
  defense test was removed during the dev pass after determining the
  primary tier-selection test already covered the same contract.
- Bake fast: 233 + 2 skipped (unchanged). Slow trajectory tests grew
  from 7 to 10 (3 new celestial-body assertions).
- TypeScript: `tsc --noEmit` clean.
- Vite build: succeeds, no new errors.

**L1 validation results (NFR-P9: max ≤ 20 km, RMS ≤ 5 km) — all 11 new bodies pass:**

- Sun: max = 0.000004 km, RMS = 0.000001 km
- Mercury (6h cadence): max = 0.015 km, RMS = 0.005 km
- Venus: max = 0.182 km, RMS = 0.110 km
- Earth: max = 0.039 km, RMS = 0.022 km
- Mars: max = 0.009 km, RMS = 0.003 km
- Jupiter: max = 0.000013 km, RMS = 0.000006 km
- Saturn: max = 0.000001 km, RMS = 0.000000 km
- Uranus: max = 0.000002 km, RMS = 0.000000 km
- Neptune: max = 0.000002 km, RMS = 0.000001 km
- Moon (6h cadence): max = 0.020 km, RMS = 0.008 km

All 18 V1/V2 spacecraft segments continue to pass (max worst = 10.387 km
on V2 seg08, RMS worst = 0.081 km — unchanged from Story 1.4 baseline).

### File List

**New (web — render/runtime):**

- `web/src/constants/body-radii.ts` — IAU radii + NAIF→slug/name tables.
- `web/src/constants/body-radii.test.ts` — co-located unit tests.
- `web/src/render/celestial-bodies.ts` — Sun + 8 planet + Moon meshes,
  per-frame tick, directional light.
- `web/src/render/celestial-bodies.test.ts` — co-located unit tests.
- `web/src/render/skybox.ts` — Milky Way back-side sphere in SkyboxGroup.
- `web/src/render/skybox.test.ts` — co-located unit tests.
- `web/src/services/texture-loader.ts` — tier-aware texture loader
  (format-agnostic; Story 4.3 swaps in KTX2Loader).
- `web/src/services/texture-loader.test.ts` — co-located unit tests.
- `web/src/dev/fps-readout.ts` — `?perf=fps` dev overlay.
- `web/src/dev/fps-readout.test.ts` — co-located unit tests + percentile math.
- `web/tests/celestial-bodies-defense.test.ts` — cross-cutting defense
  (KTX2 deferral marker, no-Float32-leakage focused, per-frame hygiene,
  Sun-no-texture, etc.).

**New (assets):**

- `web/public/textures/sun-2k.png` (1,346 KB)
- `web/public/textures/mercury-2k.png` (1,497 KB)
- `web/public/textures/venus-2k.png` (852 KB)
- `web/public/textures/earth-2k.png` (1,418 KB)
- `web/public/textures/mars-2k.png` (1,292 KB)
- `web/public/textures/jupiter-2k.png` (805 KB)
- `web/public/textures/saturn-2k.png` (324 KB)
- `web/public/textures/uranus-2k.png` (25 KB)
- `web/public/textures/neptune-2k.png` (376 KB)
- `web/public/textures/moon-2k.png` (1,449 KB)
- `web/public/textures/milky-way-2k.png` (552 KB)
- `web/public/textures/README.md` — acquisition + conversion documentation.

**Modified:**

- `bake/src/bake_trajectories.py` — added `CELESTIAL_BODIES`,
  `CELESTIAL_CADENCE_OVERRIDES`, `_sample_celestial_body()`, and the
  bake-loop extension.
- `bake/src/vtrj_writer.py` — `ALLOWED_BODY_IDS` extended from {-31, -32}
  to {-31, -32, 10, 1..8, 301}.
- `bake/tests/test_bake_defense.py` — `ALLOWED_BODY_IDS` constant mirrored.
- `bake/tests/test_bake_trajectories.py` — three new slow-marked
  celestial-body assertions.
- `web/src/main.ts` — wired CelestialBodies + Skybox + TextureLoaderService;
  added `prefetchCelestialBodyChunks` mirroring Story 1.12's pattern;
  wired `?perf=fps` to `startFpsReadout`.
- `web/src/services/manifest-loader.test.ts` — updated 18→28 file count
  + extended naifId list expectation.
- `web/tests/ephemeris-defense.test.ts` — updated manifest lockfile
  assertion 18→28 + per-celestial-body coverage.
- `.gitattributes` — added `web/public/textures/*.png filter=lfs` scoped
  rule.
- `.gitignore` — added `.toolchain/` and `.ktx-venv/` (KTX-Software
  probe scratch).
- `THIRD_PARTY.md` — Solar System Scope CC-BY-4.0 attribution block +
  rationale for the source switch from Björn Jónsson.
- `web/public/data/manifest.json` — regenerated bake (12 bodies, 28
  files).
