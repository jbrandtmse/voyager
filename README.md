# Voyager

> 🚧 **Implementation phase — Epic 1 in progress.** Planning artifacts (product brief, PRD, technical research, UX design specification, architecture) are complete. The monorepo scaffold is in place: `web/` (TypeScript + Vite vanilla-ts) and `bake/` (Python 3.13 + uv + SpiceyPy 8.1.0). See [Repository Layout](#repository-layout) for the smoke-test sequence.

A browser-based, narrative-driven cinematic replay of the **Voyager 1 and Voyager 2** missions — from launch in 1977 through projected interstellar cruise in 2030 — built around a single coherent time axis you can scrub, pause, and zoom from 1× real-time to 1,000,000× (the full 53-year mission in roughly fifty seconds).

The mission is the protagonist, not one entry in a multi-mission catalog. The differentiator lives in one line:

> **See what Voyager saw.**

CK-reconstructed attitude data drives instrument boresights so the spacecraft physically turn, the scan platforms articulate, and the narrow-angle cameras' frustums sweep the targets they actually aimed at during the gas-giant encounters of 1979, 1980, 1986, and 1989, and at the inner solar system on 14 February 1990 — the Pale Blue Dot.

The visual register is *[Apollo in Real Time](https://apolloinrealtime.org)* applied to an unmanned mission for the first time: silent, dignified, time-anchored, generous typography. Reverent but not mournful — awe and wonder with weight.

## What we're building (in scope for v1)

- **Both Voyager 1 and Voyager 2**, full trajectories from launch through 2030
- **All four gas-giant encounters** — V1 Jupiter (1979), V2 Jupiter (1979), V1 Saturn (1980), V2 Saturn (1981), V2 Uranus (1986), V2 Neptune (1989)
- **CK-reconstructed spacecraft attitude** during encounter windows (~1 milliradian accuracy from NAIF/PDS Rings Node CK kernels); synthesized Earth-pointing high-gain-antenna attitude during cruise (UI-labeled as synthesized, never silently substituted)
- **Pale Blue Dot reconstruction** (1990-02-14) — the spacecraft physically turns; the narrow-angle camera frustum sweeps Venus → Earth → Jupiter → Saturn → Uranus → Neptune in the historical sequence; original NASA photo plates composite into the scene at the corresponding instants
- **Heliopause crossings** as marked timeline cards (V1 2012-08-25, V2 2018-11-05) — necessarily textual; the heliopause is a plasma boundary with no visual signature
- **Timeline scrubber** as the primary control surface, with chapter markers anchoring mission beats; speed range 1× through 1,000,000× with smooth ramping
- **Camera blended view-frame transitions** during encounters (heliocentric ↔ body-centered, ±2 days from closest approach)
- **HUD overlay** — simulation date in UT, distance from Sun in AU, current chapter title, speed multiplier, instrument-shutoff status (ISS / UVS / PLS / LECP)
- **Deep-linkable URL scheme** — every chapter and every timestamp is a shareable URL with pre-rendered Open Graph card; `?embed=true` parameter for chrome-less iframe / kiosk display
- **Voyager Golden Record** as a toggleable diegetic audio layer (off by default; gently audible at launch, Pale Blue Dot, and heliopause chapter markers)
- **Desktop browsers** at 1280×720+ (Chrome, Firefox, Safari, latest two stable versions); tablet functional; phone best-effort
- **WCAG 2.2 AA** accessibility floor; full keyboard operability; reduced-motion respected

## What's deferred to v1.1+ (out of v1 scope)

Curated 20–40 hand-picked image plates · wide-angle camera boresight · broader PDS image archive · DSN contact-window overlays · documentary/cinematic mode toggle · spoken narration · VR/WebXR · multi-language localization · dedicated classroom mode · mobile/tablet polish · Pioneer 10 or any other spacecraft

## Tech stack (planned)

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | TypeScript 6.x strict ([ADR 0026](docs/adr/0026-typescript-6-ratification-over-5x.md)) | Float64 native; modern ecosystem |
| 3D | Three.js (r170+) WebGLRenderer with reverse-Z depth | Sub-mm precision at AU scales |
| Bundler | Vite | Standard 2026 default |
| UI components | Vanilla TypeScript + Web Components (Lit 3+) | Zero framework runtime cost; aligns with long-lived canvas lifecycle |
| Styling | Vanilla CSS with custom-property tokens | Shadow-DOM-scoped; no Tailwind, no CSS-in-JS |
| A11y primitives | Hand-rolled WAI-ARIA APG patterns + `focus-trap`/`tabbable` (≤5 KB) | Bespoke visual register; no third-party UI library |
| Build-time data | Python 3.13 + SpiceyPy 8.1.0 + scipy + numpy | NAIF SPICE kernel extraction; cubic Hermite trajectory baking |
| Trajectory format | Custom 40-byte VTRJ header + Float64Array binary, brotli-compressed | ~3–5 bytes/scalar on wire; zero parse cost |
| Manifest validation | Zod 4 (runtime schema validator) | Fail-fast on malformed `manifest.json` at boot |
| Hosting | Cloudflare Pages or Vercel (free tier) | Static CDN; ≤$15/year recurring cost |
| Testing | Vitest + Playwright + axe-core; 6-layer validation harness | L1 Python interpolation vs SPICE → L5 E2E mission-timeline assertion |

## Planning documents

All planning artifacts live under `_bmad-output/planning-artifacts/`:

| Document | What it covers |
| --- | --- |
| [Product brief](_bmad-output/planning-artifacts/product-brief-Voyager.md) | Vision, audience, problem, solution, success criteria, opportunity window |
| [Product brief distillate](_bmad-output/planning-artifacts/product-brief-Voyager-distillate.md) | Dense LLM-optimized version of the brief; mission timeline; technology stack; risk register |
| [PRD](_bmad-output/planning-artifacts/prd.md) | Full Product Requirements Document — 58 functional requirements, NFRs, scope, five user journeys, project classification |
| [UX design specification](_bmad-output/planning-artifacts/ux-design-specification.md) | Complete UX spec — visual foundation, 15-component inventory, user journey flows, accessibility strategy |
| [UX design directions](_bmad-output/planning-artifacts/ux-design-directions.html) | Interactive HTML showcase of four explored visual directions; locked direction is **B (AiRT Canonical) with Direction A's labeled-pin scrubber** |
| [Initial research](_bmad-output/planning-artifacts/research/initial-research.md) | Foundation research — mission timeline, simulation architecture inputs |
| [Technical feasibility research](_bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md) | Deep technical research — kernels, frame topology, rendering precision, asset pipeline, performance budget |

## Roadmap

Planning is well advanced; implementation has not started.

**Done:**

- ✅ Product brief + distillate
- ✅ Technical feasibility research
- ✅ Product Requirements Document
- ✅ UX design specification (14-step BMAD workflow complete)

**Next:**

- ⏳ Solution architecture document (`/bmad-create-architecture`) — translate PRD + UX spec into technical architecture covering SPICE bake pipeline, Three.js scene graph, validation harness wiring, deploy topology
- ⏳ Epics + stories (`/bmad-create-epics-and-stories`) — break the spec into implementable units against the PRD's Phase 0 → 1 → 2 → 3 sequence

**Implementation phases (per PRD):**

| Phase | Duration | Deliverable |
| --- | --- | --- |
| Phase 0 — Spike | 1–2 days | SpiceyPy + Three.js precision sanity check |
| Phase 1 — MVP cruise viewer | 1–2 weeks | V1 + planets, daily cadence, no encounters, deployable |
| Phase 2 — Encounters | 2.5–3.5 weeks | V2 added, blended view frames, real textures, CK boresights, all six encounters |
| Phase 3 — Polish + Pale Blue Dot + heliopause | 2 weeks | HUD complete, Pale Blue Dot, Golden Record audio, accessibility pass |
| **Engineering substrate** | **~6–9 weeks** | |
| **+ Portfolio-grade polish** | **+6–12 weeks** | |
| **= Realistic total** | **~3–5 months** | "Linkable next to *Apollo in Real Time*, NYT long-scroll science features, and FWA Site of the Day Three.js winners without an apology" |

## Definition of Done

Per the PRD, success is **recognizable quality, not engagement metrics**. The launch gate is:

- **Reference parity.** Linkable next to [*Apollo in Real Time*](https://apolloinrealtime.org), NYT long-scroll science features (Snow Fall, the Cassini retrospective), and [FWA Site of the Day](https://thefwa.com) winners in the Three.js/WebGL category — without apology.
- **Qualitative gate.** 5–10 friendly first-time users complete launch → heliopause and articulate the mission's story; the differentiator-validation moment (the scan platform visibly turning during the first encounter) is explicitly probed.
- **Numerical gates.** Trajectory matches SPICE to ≤20 km max / ≤5 km RMS; attitude matches CK kernels to ≤1 milliradian within encounter windows; sustained 60 FPS on a mid-range laptop at 1280×720+.

Voyager 1's 50th anniversary is 2027-09-05. That is **opportunity timing, not a deadline.** The artifact ships when it clears its own bar.

## Design System

The visual register is locked in [Direction B (AiRT Canonical)](_bmad-output/planning-artifacts/ux-design-directions.html). Implementation lives across four CSS files under `web/src/styles/` plus a TS sibling for matchMedia constants:

| File | Role |
| --- | --- |
| `tokens.css` | **Single source of truth** for design tokens at `:root` (`--v-*` prefix). Colors, typography families + size scale, spacing (4-px discrete + `clamp()` edge margin), motion durations/easings, z-index, breakpoint values. Component CSS consumes via `var(--v-*)` — never redefines. |
| `fonts.css` | `@font-face` declarations for the three self-hosted faces (JetBrains Mono Regular, Inter Regular, Source Serif 4 variable). `font-display: swap`; latin + extended-latin punctuation `unicode-range`. |
| `global.css` | Minimal reset, document defaults, global `:focus-visible` outline, and the `prefers-reduced-motion` / `prefers-reduced-transparency` token overrides at `:root`. |
| `breakpoints.css` | The **only** three structural breakpoints allowed in the codebase: `max-width: 767px` (mobile), `max-width: 1023px` (tablet), `min-width: 1920px` (wide). Everything else uses `clamp()`. |
| `breakpoints.ts` | TS-side constants + matchMedia query strings that mirror the CSS. |

### Typography — self-hosted, OFL, ≤ 120 KB

No Google Fonts CDN. No analytics-adjacent font host. All three faces are subsetted to latin + extended-latin punctuation via `scripts/font-subset.py` (a one-off `fonttools pyftsubset` invocation; not a runtime dep). The resulting `.woff2` files are LFS-tracked under `web/public/fonts/`, preloaded from `web/index.html`, and total **≤ 120 KB compressed**. Attribution + OFL compliance in [`THIRD_PARTY.md`](THIRD_PARTY.md).

### Reduced motion is global

`prefers-reduced-motion: reduce` collapses every motion-duration token (`--v-duration-fast`/`-base`/`-slow`) to `0ms` at `:root`. Components consume the variables and inherit the override automatically — there is no per-component opt-in.

### Lit 3+ Web Components

UI components extend [`BaseElement`](web/src/components/base-element.ts) (or `LitElement` directly — both are explicitly allowed). The minimal `<v-version>` component at `web/src/components/v-version.ts` demonstrates the file shape: kebab-case filename matches the custom-element tag, Shadow DOM-scoped CSS via Lit's `static styles`, tokens consumed via `var(--v-*)`.

## Browser Compatibility

Voyager requires **WebGL 2**, **WebAssembly**, and **modern brotli decoding** (`DecompressionStream('br')`) — the three together gate the simulation. Per [ADR 0022](docs/adr/0022-browser-unsupported-fallback-page-not-degraded-render.md), a boot-time capability probe (Story 1.8) checks each capability *before* the main bundle loads; any missing capability redirects to a static `/unsupported.html` page rather than attempting a degraded render.

The probe:

- Runs as a ≤ 1 KB inline `<script>` at the top of `<head>` in `web/index.html` — placed before any external script tag.
- Probes in the order **WebGL2 → WebAssembly → brotli**. The first failing capability becomes the `?reason=<webgl2|wasm|brotli>` URL parameter on the fallback page.
- On full success, dynamic-imports the main bundle. The bundle never loads on an unsupported browser.

The fallback page is generated at build time from the [`<v-fallback-page>`](web/src/components/v-fallback-page.ts) Lit component. The Vite plugin in [`web/vite.config.ts`](web/vite.config.ts) pre-renders `web/dist/unsupported.html` with the default `?reason=webgl2` variant baked in, inlines the page's CSS (tokens + `@font-face` declarations matching the main app), and inlines a tiny swap script that handles the `?reason` query parameter. The page works fully with JavaScript disabled — the `?reason` swap is progressive enhancement only.

Supported browser baseline: Chrome 120+, Firefox 126+, Safari 17.5+ (the `DecompressionStream('br')` floor).

## Attribution and data provenance

The artifact uses only published, historical, public-domain NASA mission data and supplementary public-domain or attribution-required third-party assets:

- **Trajectory + attitude:** [NAIF SPICE kernels](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/) (NASA public domain); supplementary CK products from the [PDS Rings Node at SETI](https://pds-rings.seti.org/voyager/spice/ck.html)
- **Spacecraft model:** NASA 3D Resources (public domain)
- **Planet textures:** USGS Astrogeology (public domain); Björn Jónsson planetary maps (attribution required; per-asset license audit at build time)
- **Audio:** Voyager Golden Record (NASA public domain)
- **Photo composites:** NASA Planetary Photojournal (public domain) for the Pale Blue Dot reconstruction

No ITAR / EAR-controlled material. No PII collection. No tracking, no cookies, no analytics. The artifact is a historical retrospective, not a navigation tool.

## License

License terms to be finalized before public launch. Currently: no license file means **all rights reserved** by default. Planning artifacts are provided for reference; the source code, once written, will carry an explicit license (likely MIT or similar permissive for the source, with NASA and Björn Jónsson attributions enumerated in a `THIRD_PARTY.md` for assets).

## Contributing

The project is currently a solo build. Contributions are not being accepted during the v1 implementation phase. After launch, the architecture (`EphemerisService` / `AttitudeService` over a chapter-driven FSM) is generalizable enough to host other historical missions — but extension beyond Voyager is explicitly **not** part of the v1 product story.

## Repository Layout

The repository is a single Git repo with two top-level halves. Each half is independently buildable from inside its own directory — there is no root-level workspace `package.json`, no `apps/`, no `packages/`, no Nx, no Turborepo, no pnpm workspaces. This was a deliberate architecture choice (see `_bmad-output/planning-artifacts/architecture.md` §143–§180).

| Half | Tech | Purpose |
| --- | --- | --- |
| `web/` | TypeScript 6.x strict + Vite (vanilla-ts) + Three.js ≥ r170 | Browser-only SPA — the cinematic replay surface, served as a static CDN bundle. No backend, no API, no database. |
| `bake/` | Python 3.13 + uv + SpiceyPy 8.1.0 (exact) + scipy + numpy | Build-time precompute — extracts NAIF SPICE kernel data into a custom binary trajectory + attitude format consumed by `web/`. Runs in CI, never at runtime in the browser. |

Root-level files: `.python-version` pins Python to `3.13` (uv resolves the patch version); `.gitattributes` declares Git LFS patterns for NAIF kernel formats (`*.bsp`, `*.bc`, `*.tf`, `*.tsc`, `*.tls`, `*.pck`) — all 17 kernels under `kernels/` are LFS-tracked from their first commit (Story 1.3); `.gitignore` excludes `web/node_modules/`, `web/dist/`, `bake/.venv/`, `bake/__pycache__/`, and `bake/out/`. See [Kernels](#kernels) below for the acquisition flow.

### Cold-clone smoke test

After cloning, verify both halves boot from a clean checkout:

```bash
# Web half — Vite dev server serves the blank vanilla-ts page on http://localhost:5173
cd web
npm install
npm run dev

# Bake half — SpiceyPy 8.1.0 wraps CSPICE N0067; the tkvrsn call confirms the toolkit loads
cd bake
uv sync
uv run python -c "import spiceypy; print(spiceypy.tkvrsn('TOOLKIT'))"
```

The bake-half smoke command should print `CSPICE_N0067`. The web-half dev server should serve a blank Vite vanilla-ts page on `http://localhost:5173`. This sequence is documented but not yet enforced via CI — Story 1.14 owns the baseline CI pipeline.

## Development

Most workflows are scripted as `just` recipes at the repo root (`justfile`). Install `just` once via `winget install --id Casey.Just` (Windows) or `cargo install just` / your package manager (Linux/macOS), then:

```bash
just                  # list available recipes
just fetch-kernels    # acquire/verify NAIF + PDS kernels (Story 1.3)
just verify-kernels   # SHA-256 audit of the on-disk kernels
just bake             # produce VTRJ trajectory binaries + bake/out/manifest.json
just validate         # run the Layer-1 Python validation harness (NFR-P9)
just adr-index        # regenerate docs/adr/README.md
just test-bake        # fast bake tests (excludes @pytest.mark.slow)
just test-bake-slow   # full bake suite including slow end-to-end tests
just test-web         # web vitest suite
```

The python-direct invocations (e.g. `python bake/src/acquire_kernels.py`) are documented below as **fallbacks** for contributors who don't have `just` installed.

**Validation thresholds (NFR-P9, per SPK segment):** `just validate` exits non-zero if any baked VTRJ exceeds `max_position_error_km > 20` or `rms_position_error_km > 5` against a 10x-denser SPICE reference grid. Per-segment chunking is load-bearing here — the Voyager merged SPKs contain segment-boundary discontinuities that no single-VTRJ-per-body bake can satisfy.

## Rendering

The renderer (`web/src/render/render-engine.ts`) uses **Three.js native reverse-Z** (constructor parameter `reversedDepthBuffer: true`, gated on the WebGL2 `EXT_clip_control` extension; see [ADR 0002](docs/adr/0002-floating-origin-reverse-z-over-logarithmic-depth.md), [ADR 0008](docs/adr/0008-threejs-webglrenderer-over-webgpurenderer-v1.md), [ADR 0012](docs/adr/0012-scale-1km-render-space-branded-vector-types.md)). A boot-time `GPUCapabilityProbe` runs offscreen; if reverse-Z is unavailable, the renderer falls back to `logarithmicDepthBuffer: true` and emits one `console.warn`. Render-space units are kilometers (`SCALE = 1`); a `WorldGroup` is recentered on the camera every frame via `WorldGroup.position = -cameraWorldPos`, keeping Float32 precision dense near the camera while Float64 `WorldVec3` values are authoritative upstream. The Float64 → Float32 cast lives in exactly two files (`web/src/types/branded.ts`, `web/src/math/floating-origin.ts`), enforced by `web/tests/no-float32-leakage.test.ts`.

**Dev-mode precision smoke:** navigate to `http://localhost:5173/?dev=precision` after `cd web && npm run dev`. A 1-meter cube at the origin and a 1-cm cube 1 m away orbit-zoom from 1 m to 165 AU and back over 30 seconds; the cubes should remain distinct without jitter or z-fighting at every distance. The full Playwright visual regression at these extreme zoom states is deferred to Story 7.6 (NFR-P8 long-form gate). The `?force-log-depth=1` flag forces the logarithmic-depth fallback path for manual testing.

### Spacecraft + Trajectories

Both Voyager spacecraft are rendered (Story 1.12; FR8, FR9, FR10, UX-DR33). The model is the NASA 3D Resources Voyager Probe (B) GLB, served at `/models/voyager.glb` and loaded once at boot via Three.js `GLTFLoader`. Two scene-graph clones — `voyager-1` and `voyager-2` — are children of the engine's `WorldGroup`. Per frame, `SpacecraftModels.tick(et)` queries `EphemerisService.getStateAt(et, -31|-32)` and applies the resulting `WorldVec3` to each spacecraft's local position; the floating-origin recenter happens at `WorldGroup` (Story 1.5), so the spacecraft transforms remain in J2000 ecliptic kilometers. Null returns from `getStateAt` (chunk not yet loaded) cause the spacecraft to hold its previous-frame position — no flicker, no jump-to-origin. Visual distinction is encoded by a `THREE.Sprite` label tag rendered alongside each spacecraft ("V1" / "V2" in JetBrains Mono) — the FR49-accessible choice that does not rely on color alone.

Each spacecraft also owns two `Line2` trajectory polylines (past + future) drawn with `LineMaterial` from `three/examples/jsm/lines/`. The past line is solid, ~1.5 px screen-space, and uses `var(--v-color-trajectory-past)`; the future line is dashed, ~1.0 px, and uses `var(--v-color-trajectory-future)`. The full polyline is sampled once at construction at ~500 vertices per spacecraft from launch (V1 1977-09-05, V2 1977-08-20) to `MISSION_END_ET` (2030-12-31), and `tick(et)` only updates the split-point between past and future. Per AC6 / NFR-P2, `BufferGeometry.dispose()` is **never** called inside the per-frame path — `web/tests/trajectory-no-dispose.test.ts` is the load-bearing tripwire. Backward scrubbing (non-monotonic `et` jumps) is handled by the same idempotent `tick()` — the past line shrinks rather than grows.

`web/public/models/voyager.glb` is LFS-tracked via the `*.glb` line in `.gitattributes`; SHA-256 and acquisition steps in [`THIRD_PARTY.md`](THIRD_PARTY.md) and [`web/public/models/README.md`](web/public/models/README.md). Full 4-level LOD chain via `acquire_models.py` is deferred to Story 4.3.

### First-Paint Sequence

The cold-start experience is a designed sequence (Story 1.9; FR1, FR6, FR42, FR45, UX-DR8, UX-DR28):

1. **Title card** — `<v-title-card>` renders "Voyager. 1977 to 2030." centered in Inter at `var(--v-size-title-card)` against `var(--v-color-bg)`. It holds for **2 seconds** (`TITLE_CARD_HOLD_MS`) — the documented "two beats" — then dissolves over `var(--v-duration-slow)` (400 ms). Under `prefers-reduced-motion: reduce` the dissolve collapses to an instant cut via the global `--v-duration-slow → 0ms` rule in `global.css`.
2. **Scrubber reveal** — when the title card emits `voyager:title-card-complete`, `main.ts` removes it and reveals the `<v-timeline-scrubber variant="mission">` underneath. The scrubber is the primary time control surface, anchored to the viewport bottom with the full mission range **1977-08-20 → 2030-12-31** as the track domain. It implements the [WAI-ARIA APG Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/): `role="slider"`, ISO-8601 `aria-valuemin/max/now`, and an `aria-valuetext` in the human-readable `YYYY-MM-DD HH:MM UT` form. Keyboard controls are `←/→` (±1 day), `Shift+←/→` (±10 days), and `Home/End` (jump to mission start/end). The visible thumb glyph is 14 px but the effective click/tap target is ≥ 44 × 44 px via a transparent `::before` pseudo-element (WCAG 2.5.5).
3. **`?t=` deep-link contract** — `voyager.app/?t=<iso-8601>` (e.g. `/?t=1989-08-25T09:23:00Z`) initializes the simulation paused at that exact instant. **Invalid `?t=`** values (non-ISO, out-of-mission-range, or any parse error) are silently rejected (NFR-S7) — the simulation falls back to `MISSION_START_ET` with no error UI. The address bar always reflects the current simulation timestamp via `history.replaceState` (throttled at 250 ms during continuous scrub; final write on `pointerup`) — `pushState` is intentionally not used so the back button does not pollute with every drag.

The ET ↔ ISO-8601 conversion table (`web/src/math/et-conversions.ts`) embeds the SPICE leap-second table from `kernels/naif0012.tls` and matches `spiceypy.str2et` to within 2 ms across the full mission window (the omitted K·sin(E) periodic correction is below that bound).

## Data Flow

Trajectory data flows from the offline bake to the runtime over a deterministic, hash-pinned pipeline (Story 1.4 + 1.6):

```text
bake/out/*.bin.br + manifest.json     (Story 1.4 — offline bake)
        │
        │  `just copy-bake-to-web` (Story 1.6 AC6)
        ▼
web/public/data/manifest.json + *.bin.br   (runtime assets, served statically)
        │
        │  ManifestLoader.load('/data/manifest.json')   — Zod schema check at boot
        ▼
ChunkLoader.load(file)   — fetch + DecompressionStream('br') + SHA-256 verify
        │                  + LRU cache (capacity 12; per architecture line 874
        │                    `loading` is observable via .subscribe())
        ▼
EphemerisService.getStateAt(et, bodyId)    — cubic Hermite over Float64 samples
        │                                     returns WorldVec3 | null (never throws)
        ▼
render-engine / scene consumer (next stories)
```

`manifest.json` is the runtime contract (architecture Decision 1b) — schema is locked at `schemaVersion: 1`. `bake/out/manifest.json` is regenerable; `web/public/data/manifest.json` is committed because the runtime needs it at boot. The brotli `*.bin.br` chunks are .gitignored on both sides (regenerable from kernels via `just bake && just copy-bake-to-web`).

**Dev-mode ephemeris perf:** navigate to `http://localhost:5173/?perf=ephemeris` after `cd web && npm run dev`. The harness loads every V1 + V2 chunk and reports median / p95 / p99 `EphemerisService.getStateAt` cost over 1000 iterations per body. NFR-P7 targets 1 ms median for 12 bodies; the 2-body Story 1.6 gate is 0.2 ms. The full 12-body re-measurement lives in Story 1.13.

## Kernels

The simulation is driven by 17 NAIF / PDS Rings Node SPICE kernels (~187 MB total: ~115 MB DE440 planetary ephemeris + ~51 MB Voyager super CKs + ~6 MB encounter CKs + the rest LSK/PCK/FK/SCLK/SPK). All kernels live directly under `kernels/`, are SHA-256-pinned in `kernels/kernels-manifest.json`, and are Git LFS-tracked (rules in `.gitattributes`, established by Story 1.1).

**Acquire from a clean clone (canonical):**

```bash
git lfs install
cd bake && uv sync && cd ..
just fetch-kernels
```

Fallback (no `just`):

```bash
python bake/src/acquire_kernels.py
```

This reads `kernels/kernels-manifest.json`, downloads any missing or mismatched kernels from their `source_url`, verifies SHA-256, and exits 0 on full success. It is idempotent — re-running on a fully populated cache fetches nothing. Expected wall-clock time on a residential link is 1–5 minutes (DE440 dominates at ~115 MB; PDS Rings Node CKs are small).

**Verify the pinned cache:** `just verify-kernels` (fallback: `python bake/src/verify_kernels.py`). Exits 0 on full match (prints `OK: 17 kernels verified`). Exits non-zero with `MISSING:` / `MISMATCH:` lines on any drift.

**Bake VTRJ trajectory binaries:** `just bake` (fallback: `cd bake && uv run python -m src.bake_trajectories`). Produces one VTRJ per SPK segment per spacecraft under `bake/out/`, plus `bake/out/manifest.json` matching the Decision 1b schema. Byte-identical across runs (NFR-R4).

**Validate the bake (Layer-1 harness):** `just validate` (fallback: `cd bake && uv run python -m src.validate_l1`). Writes `bake/out/validation-report.md` and exits non-zero if any segment breaches NFR-P9.

**Inspect CK coverage windows:** `just ck-inventory` (fallback: `python bake/src/ck_inventory.py`). This SpiceyPy-driven inventory (Story 1.3 AC5) records every CK coverage window per spacecraft + per structure (bus / scan platform / NA camera), then performs a per-encounter cross-check identifying which CKs cover the V1 Jupiter, V1 Saturn, V1 Pale Blue Dot, V2 Jupiter, V2 Saturn, V2 Uranus, and V2 Neptune windows. The PBD window has bus-level coverage but no scan-platform CK; Epic 5 will synthesize the family-portrait turn-and-image attitude.

**Inspect FK frame IDs:** `just fk-inventory` (fallback: `python bake/src/fk_inventory.py`). `kernels/frame-ids.md` documents every V1 / V2 frame name ↔ ID pair, parent frame, and rotation row from the FK kernels — the load-bearing reference for rendering and HGA-Earth synthesis in later stories.

## Architectural Decision Records (ADRs)

All substantive architectural decisions are recorded as MADR ADRs under [`docs/adr/`](docs/adr/). The catalogue is indexed in [`docs/adr/README.md`](docs/adr/README.md), regenerated by `just adr-index` (fallback: `python scripts/adr-index.py`). New ADRs use the template at [`docs/adr/0000-template.md`](docs/adr/0000-template.md); format and policy are defined in [ADR 0020](docs/adr/0020-madr-format-for-adrs-docs-adr-location.md).

## Privacy Commitment — No PII, No Analytics, No Tracking Cookies

This artifact does not collect, store, transmit, or process any personally identifiable information. There is no backend, no API, no database, no user account, no login. The entire experience is a static-CDN-delivered single-page application that runs locally in the visitor's browser.

Concretely, and as a hard architectural commitment:

- **No third-party analytics.** No Google Analytics, no Mixpanel, no Segment, no Amplitude, no Hotjar, no Plausible, no Fathom, no Matomo, no GA4 / `gtag.js`, no Sentry, no DataDog RUM, no New Relic browser agent. None.
- **No tracking pixels, beacons, or fingerprinting.** No invisible 1×1 images, no `<noscript>` tracking fallbacks, no canvas/font/WebGL fingerprinting (the WebGL context is used exclusively for rendering the simulation, not for fingerprint extraction), no Sec-CH-UA client hint scraping, no `navigator.userAgent` profiling sent anywhere.
- **No cookies — therefore no consent banner.** The artifact sets zero cookies of any kind: no functional cookies, no preference cookies, no session cookies, no third-party cookies. Because nothing is being collected, GDPR / CCPA / ePrivacy / UK GDPR consent banners are not required and will not be added. URL state (chapter, timestamp, speed multiplier, `?embed=true`) is stored in the URL itself and is shareable — it is not a tracking identifier.
- **No localStorage / sessionStorage / IndexedDB for tracking.** Browser storage may be used purely for technical caching of trajectory binaries (where the cache key is the kernel content hash, not a user identifier) and never for behavior tracking.
- **No external script loads from analytics or ad networks.** Content Security Policy will be configured to block analytics/tracker origins by default. Third-party origins are limited to: the static CDN serving the bundle, public-domain NASA asset mirrors (where used), and optionally a public-domain font CDN if locally-bundled fonts are deemed insufficient.

This commitment is enforced *by absence*: the `bake/pyproject.toml`, `bake/uv.lock`, `web/package.json`, and `web/package-lock.json` are grepped (case-insensitive) for `analytics`, `telemetry`, `fingerprint`, `cookie-consent`, `ga-`, `gtag`, `mixpanel`, `segment`, `amplitude`, `hotjar`, `sentry`, and `datadog` — zero matches is the passing condition. This is codified as FR50 in the PRD and as NFR-S8 (the "absence-proof" posture) in the architecture document.

Voyager is a historical retrospective of an unmanned space mission. The visitor is here to watch the mission, not to be measured.
