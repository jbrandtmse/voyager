# Voyager

> 🚀 **Epics 1–4 complete; Epic 5 (Pale Blue Dot) starting.** All six gas-giant encounter chapters are operational end-to-end (V1J / V2J / V1S / V2S / V2U / V2N), the Voyager Golden Record-era attitude is CK-driven through every encounter, and the L4 Playwright visual-regression suite locks 9 pinned scenes. The mission's hero scene — the Pale Blue Dot turn-and-photograph sequence on 1990-02-14 — is the next epic. See [Implementation Status](#implementation-status) for the per-epic shipping summary.

A browser-based, narrative-driven cinematic replay of the **Voyager 1 and Voyager 2** missions — from launch in 1977 through projected interstellar cruise in 2030 — built around a single coherent time axis you can scrub, pause, and zoom from 1× real-time to 1,000,000× (the full 53-year mission in roughly fifty seconds).

The mission is the protagonist, not one entry in a multi-mission catalog. The differentiator lives in one line:

> **See what Voyager saw.**

CK-reconstructed attitude data drives instrument boresights so the spacecraft physically turn, the scan platforms articulate, and the narrow-angle cameras' frustums sweep the targets they actually aimed at during the gas-giant encounters of 1979, 1980, 1986, and 1989, and at the inner solar system on 14 February 1990 — the Pale Blue Dot.

The visual register is *[Apollo in Real Time](https://apolloinrealtime.org)* applied to an unmanned mission for the first time: silent, dignified, time-anchored, generous typography. Reverent but not mournful — awe and wonder with weight.

## Implementation Status

Four epics (Epic 0 foundation + Epics 1–4) have shipped. Epic 5 (Pale Blue Dot) is the next major scope; Epic 6 (polish + accessibility) and Epic 7 (friendly-user testing + L5 E2E) follow. The artifact is currently a fully navigable simulation — open `web/` and start the dev server — for the full mission window (1977-08-20 through 2030-12-31), with all encounter chapters renderable end-to-end.

| Epic | Status | What it shipped |
| --- | --- | --- |
| Epic 1 — Foundation + Cruise Viewer | ✅ done | Floating-origin reverse-Z renderer; SpiceyPy bake pipeline (VTRJ + cubic-Hermite Float64 interpolation); ChunkLoader + EphemerisService; Voyager 1 + 2 spacecraft GLBs with 4-LOD chain; trajectory polylines; mission scrubber + ClockManager + URLSync; HUD shell; CI + Cloudflare Pages deploy. |
| Epic 2 — Chapter Director + HUD | ✅ done | `ChapterDirector` FSM over 11 chapter specs; mission-scrubber chapter pin markers + jump-to-anchor; chapter index modal + keyboard shortcuts; `<v-attitude-indicator>` HUD provenance element; `<v-chapter-copy>` panel; URL deep-link routing (`/c/<slug>` + `?t=<iso>`); pre-rendered OG cards per chapter; embed mode (`?embed=true`); fallback page (Story 1.8 ADR-0022); help-overlay modal; About page. |
| Epic 3 — Attitude Reconstruction | ✅ done | CK-driven bus + scan-platform attitude per spacecraft; NA boresight cone; articulated spacecraft GLB with scan-platform child node; HUD provenance flickers between "CK reconstructed" and "Synthesized (HGA Earth-pointing)" only where CK coverage gaps exist; L2 validation harness asserts JS-side attitude matches SPICE to ≤ 1 mrad. |
| Epic 4 — Encounter Chapters | ✅ done | All six gas-giant encounter chapters (V1J / V2J / V1S / V2S / V2U / V2N) with body-centered framing + hand-written copy; cadence-refined trajectory chunks (hourly ±30d → 1-min ±2d → 10-sec ±1hr around closest approach); 4K KTX2 gas-giant textures + 2K KTX2 moon textures via Story 4.3 Solar System Scope + Steve Albers + Wikimedia procurement; 12 Voyager-encounter moons positionally visible via the Story 4.11 satellite SPK kernels (Hyperion is a documented grey-sphere placeholder — no public-domain equirectangular map exists due to chaotic rotation); MissionPhaseFSM (AR13) tracking SOI crossings + instrument-shutoff timeline; `<v-timeline-scrubber variant="detail">` dual scrubber with cadence-aware keyboard steps; per-chapter `defaultFraming` auto-applied via the `applyDefaultFraming` subscriber + cold-load replay; heliocentric system-view camera mode (Story 4.12) reachable via `?view=heliocentric&distance=<au>&elevation=<deg>`; gravity-assist visual validation document at [`docs/visual-validation/gravity-assists.md`](docs/visual-validation/gravity-assists.md) with 8 captured screenshots; L4 Playwright visual-regression suite (Story 4.9) pins 9 scenes; 8 bugs from the 2026-05-23 manual review triaged + closed (5 fixed, 2 misfiled-with-evidence, 1 already-fixed + hardened). |
| Epic 5 — Pale Blue Dot | ⏳ starting | Dedicated PBD module + internal substates; choreographed spacecraft turn (CK or synthesized per coverage); photo-plate compositing pipeline at historical instants; PBD L4 visual regression. Epic 5's planning artifact cites the Story 4.5 `applyDefaultFraming` pattern as the canonical chapter-activation framing trigger. |
| Epic 6 — Polish | 📋 backlog | A11y axe-core sweep; HUD compaction polish; remaining FR-tail items. |
| Epic 7 — Friendly-User Testing + L5 | 📋 backlog | 5–10 first-time users complete the launch → heliopause journey; L5 Playwright E2E mission-timeline assertion. |

**FR closures achieved through Epic 4:** FR1 (sub-day scrub during encounters), FR4 + FR37 + FR41 (deep-link URL contract), FR8–FR12 (gravity-assist visible + spacecraft model rendering), FR21–FR26 (V1J / V2J / V1S / V2S / V2U / V2N encounter chapters), FR30 (six gas-giant encounters), FR33 (single-action restore-default camera), FR34 (HUD: chapter title, distance, attitude provenance, speed multiplier), FR55 (L4 visual regression operational).

**Test pyramid baseline at Epic 4 close:** web vitest 3088 passed / 8 skipped / 173 files; bake fast-tier pytest 430 / 4 / 24; L4 Playwright 9 scenes / 41-second wall-clock; bake slow-tier (LFS kernels gated) 5+ moon-trajectory E2E tests; typecheck clean; lint baseline preserved (4 warnings, 0 errors).

Per-epic retrospectives are saved alongside the cycle logs under `_bmad-output/implementation-artifacts/epic-N-retro-<date>.md`; see Epic 4's at [`epic-4-retro-2026-05-23.md`](_bmad-output/implementation-artifacts/epic-4-retro-2026-05-23.md) for the working-pattern lessons that carry into Epic 5.

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

## Tech stack

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

Planning + four implementation epics complete; Epic 5 (Pale Blue Dot) is next.

**Planning artifacts (all done):**

- ✅ Product brief + distillate
- ✅ Technical feasibility research
- ✅ Product Requirements Document
- ✅ UX design specification (14-step BMAD workflow complete)
- ✅ Solution architecture document (`_bmad-output/planning-artifacts/architecture.md`)
- ✅ Epics + stories breakdown (`_bmad-output/planning-artifacts/epics.md`)

**Implementation (done + remaining):**

- ✅ **Epic 1 — Foundation + Cruise Viewer.** Floating-origin reverse-Z renderer, bake pipeline, ChunkLoader + EphemerisService, scrubber, HUD shell, deploy.
- ✅ **Epic 2 — Chapter Director + HUD + URL Routing.** 11 chapter specs, `<v-chapter-copy>`, OG cards, embed mode, fallback page, help overlay.
- ✅ **Epic 3 — Attitude Reconstruction.** CK-driven bus + scan-platform attitude, NA boresight cone, `<v-attitude-indicator>` provenance, L2 JS-vs-SPICE validation.
- ✅ **Epic 4 — Encounter Chapters.** All six gas-giant encounters operational; detail scrubber; MissionPhaseFSM; 4K KTX2 + moon textures + meshes; heliocentric camera mode; L4 Playwright visual regression. See [Implementation Status](#implementation-status) for the full per-story summary.
- ⏳ **Epic 5 — Pale Blue Dot.** Dedicated PBD module + substates; choreographed spacecraft turn (CK or synthesized); photo-plate compositing; PBD L4 visual regression. Planning spec at `_bmad-output/planning-artifacts/epics.md` § Epic 5.
- 📋 **Epic 6 — Polish.** A11y axe-core sweep; HUD compaction polish; remaining FR-tail items.
- 📋 **Epic 7 — Friendly-User Testing + L5 E2E.** 5–10 first-time users complete launch → heliopause; L5 Playwright mission-timeline assertion.

**Original PRD implementation phases (kept for historical reference; the Epic 0 → 7 model is what actually shipped):**

| Phase | Original estimate | Mapped to |
| --- | --- | --- |
| Phase 0 — Spike | 1–2 days | Folded into Epic 1's foundation stories |
| Phase 1 — MVP cruise viewer | 1–2 weeks | Epic 1 |
| Phase 2 — Encounters | 2.5–3.5 weeks | Epics 3 + 4 (attitude + encounter chapters) |
| Phase 3 — Polish + Pale Blue Dot + heliopause | 2 weeks | Epic 5 (PBD) + Epic 6 (polish) |
| **+ Portfolio-grade polish** | **+6–12 weeks** | Epic 6 + Epic 7 |

Voyager 1's 50th anniversary is 2027-09-05. That remains **opportunity timing, not a deadline.** The artifact ships when it clears its own bar — see [Definition of Done](#definition-of-done).

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
just bake             # produce VTRJ trajectory + attitude binaries + 4-LOD voyager GLBs + bake/out/manifest.json
just bake-glb         # rebuild only the 4-LOD voyager GLB chain (Story 3.3; requires toktx — see below)
just validate         # run the Layer-1 Python validation harness (NFR-P9)
just adr-index        # regenerate docs/adr/README.md
just test-bake        # fast bake tests (excludes @pytest.mark.slow)
just test-bake-slow   # full bake suite including slow end-to-end tests
just test-web         # web vitest suite
```

The python-direct invocations (e.g. `python bake/src/acquire_kernels.py`) are documented below as **fallbacks** for contributors who don't have `just` installed.

### Build-time tooling prerequisites

All tools listed here are required at **build / development time only** — for running `just bake-glb` (or any recipe that chains into it, like `just bake`). The runtime browser does NOT need any of these; visitors to the deployed site consume the pre-baked content-hashed assets via the static CDN.

| Tool | Required by | Install (Windows / macOS / Linux) | Notes |
| --- | --- | --- | --- |
| `just` | every recipe in the `justfile` | `winget install --id Casey.Just` / `brew install just` / `cargo install just` | Command runner. |
| Python 3.13 + `uv` | bake half (`bake/`) | [Astral uv install docs](https://docs.astral.sh/uv/getting-started/installation/) | `.python-version` pins to 3.13; `uv sync` resolves SpiceyPy 8.1.0 + scipy + numpy. CI installs via `astral-sh/setup-uv@v3` (see the `Bake validation`, `Generate L2 attitude fixture`, and `Web tests` jobs in `.github/workflows/ci.yml`). |
| Node.js (≥ 20) + npm | web half (`web/`) including `just bake-glb` | [nodejs.org](https://nodejs.org/) or `nvm` | Drives Vite + the gltf-transform pipeline. |
| `toktx` ([Khronos KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases)) | `just bake-glb` (Story 3.3 LOD pipeline) | Windows: install the `KTX-Software-<version>-Windows-x64.exe`. macOS: `KTX-Software-<version>-Darwin-*.pkg`. Linux: `apt install ./KTX-Software-<version>-Linux-x86_64.deb` (or your distro's equivalent). | Used to transcode baseColor textures to KTX2 UASTC and AO textures to ETC1S per [ADR 0006](docs/adr/0006-ext-meshopt-compression-over-draco.md). The build script checks for `toktx` on PATH at start; if absent, fails fast with a pointer to this README. CI installs v4.3.2 from the Khronos `.deb` (`install toktx (Khronos KTX-Software v4.3.2)` step in `.github/workflows/ci.yml`). |
| Git LFS | both halves (kernels + spacecraft model) | `git lfs install` once per machine | Pulls binary kernels (`kernels/*`) and the upstream Voyager GLB (`bake/inputs/models/voyager-raw.glb`) on clone. |

<!-- Build-time tooling prerequisites: Verified by Story 4.0 on 2026-05-22 (toktx + uv documented with version pins + explicit CI install references per AC7). -->

**Validation thresholds (NFR-P9, per SPK segment):** `just validate` exits non-zero if any baked VTRJ exceeds `max_position_error_km > 20` or `rms_position_error_km > 5` against a 10x-denser SPICE reference grid. Per-segment chunking is load-bearing here — the Voyager merged SPKs contain segment-boundary discontinuities that no single-VTRJ-per-body bake can satisfy.

## Rendering

The renderer (`web/src/render/render-engine.ts`) uses **Three.js native reverse-Z** (constructor parameter `reversedDepthBuffer: true`, gated on the WebGL2 `EXT_clip_control` extension; see [ADR 0002](docs/adr/0002-floating-origin-reverse-z-over-logarithmic-depth.md), [ADR 0008](docs/adr/0008-threejs-webglrenderer-over-webgpurenderer-v1.md), [ADR 0012](docs/adr/0012-scale-1km-render-space-branded-vector-types.md)). A boot-time `GPUCapabilityProbe` runs offscreen; if reverse-Z is unavailable, the renderer falls back to `logarithmicDepthBuffer: true` and emits one `console.warn`. Render-space units are kilometers (`SCALE = 1`); a `WorldGroup` is recentered on the camera every frame via `WorldGroup.position = -cameraWorldPos`, keeping Float32 precision dense near the camera while Float64 `WorldVec3` values are authoritative upstream. The Float64 → Float32 cast lives in exactly two files (`web/src/types/branded.ts`, `web/src/math/floating-origin.ts`), enforced by `web/tests/no-float32-leakage.test.ts`.

**Dev-mode precision smoke:** navigate to `http://localhost:5173/?dev=precision` after `cd web && npm run dev`. A 1-meter cube at the origin and a 1-cm cube 1 m away orbit-zoom from 1 m to 165 AU and back over 30 seconds; the cubes should remain distinct without jitter or z-fighting at every distance. The full Playwright visual regression at these extreme zoom states is deferred to Story 7.6 (NFR-P8 long-form gate). The `?force-log-depth=1` flag forces the logarithmic-depth fallback path for manual testing.

### Spacecraft + Trajectories

Both Voyager spacecraft are rendered (Story 1.12; FR8, FR9, FR10, UX-DR33). The model is the NASA 3D Resources Voyager Probe (B) GLB, served at `/models/voyager.glb` and loaded once at boot via Three.js `GLTFLoader`. Two scene-graph clones — `voyager-1` and `voyager-2` — are children of the engine's `WorldGroup`. Per frame, `SpacecraftModels.tick(et)` queries `EphemerisService.getStateAt(et, -31|-32)` and applies the resulting `WorldVec3` to each spacecraft's local position; the floating-origin recenter happens at `WorldGroup` (Story 1.5), so the spacecraft transforms remain in J2000 ecliptic kilometers. Null returns from `getStateAt` (chunk not yet loaded) cause the spacecraft to hold its previous-frame position — no flicker, no jump-to-origin. Visual distinction is encoded by a `THREE.Sprite` label tag rendered alongside each spacecraft ("V1" / "V2" in JetBrains Mono) — the FR49-accessible choice that does not rely on color alone.

Each spacecraft also owns two `Line2` trajectory polylines (past + future) drawn with `LineMaterial` from `three/examples/jsm/lines/`. The past line is solid, ~1.5 px screen-space, and uses `var(--v-color-trajectory-past)`; the future line is dashed, ~1.0 px, and uses `var(--v-color-trajectory-future)`. The full polyline is sampled once at construction at ~500 vertices per spacecraft from launch (V1 1977-09-05, V2 1977-08-20) to `MISSION_END_ET` (2030-12-31), and `tick(et)` only updates the split-point between past and future. Per AC6 / NFR-P2, `BufferGeometry.dispose()` is **never** called inside the per-frame path — `web/tests/trajectory-no-dispose.test.ts` is the load-bearing tripwire. Backward scrubbing (non-monotonic `et` jumps) is handled by the same idempotent `tick()` — the past line shrinks rather than grows.

**4-LOD chain via `just bake-glb` (Story 3.3).** The upstream NASA Voyager Probe (B) GLB lives at `bake/inputs/models/voyager-raw.glb` (LFS-tracked); `web/scripts/build_glb.ts` reads it, restructures the flat mesh tree into the named `BUS / SCAN_PLATFORM / HGA` hierarchy per `bake/inputs/voyager-mesh-mapping.json`, transcodes textures to KTX2 via `toktx`, applies `EXT_meshopt_compression` (per [ADR 0006](docs/adr/0006-ext-meshopt-compression-over-draco.md)), and emits 4 content-hashed LOD GLBs (`voyager-lod0.<hash>.glb` … `voyager-lod3.<hash>.glb`) to `web/public/models/`. At runtime, `SpacecraftModels` wraps the four LODs in a `THREE.LOD` per spacecraft with distance thresholds resolved from the manifest's `models[]` section; `MeshoptDecoder` + `KTX2Loader` (Basis Universal transcoder at `web/public/basis/`) are registered on `GLTFLoader`. SHA-256 and acquisition steps in [`THIRD_PARTY.md`](THIRD_PARTY.md) and [`web/public/models/README.md`](web/public/models/README.md).

### First-Paint Sequence

The cold-start experience is a designed sequence (Story 1.9; FR1, FR6, FR42, FR45, UX-DR8, UX-DR28):

1. **Title card** — `<v-title-card>` renders "Voyager. 1977 to 2030." centered in Inter at `var(--v-size-title-card)` against `var(--v-color-bg)`. It holds for **2 seconds** (`TITLE_CARD_HOLD_MS`) — the documented "two beats" — then dissolves over `var(--v-duration-slow)` (400 ms). Under `prefers-reduced-motion: reduce` the dissolve collapses to an instant cut via the global `--v-duration-slow → 0ms` rule in `global.css`.
2. **Scrubber reveal** — when the title card emits `voyager:title-card-complete`, `main.ts` removes it and reveals the `<v-timeline-scrubber variant="mission">` underneath. The scrubber is the primary time control surface, anchored to the viewport bottom with the full mission range **1977-08-20 → 2030-12-31** as the track domain. It implements the [WAI-ARIA APG Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/): `role="slider"`, ISO-8601 `aria-valuemin/max/now`, and an `aria-valuetext` in the human-readable `YYYY-MM-DD HH:MM UT` form. Keyboard controls are `←/→` (±1 day), `Shift+←/→` (±10 days), and `Home/End` (jump to mission start/end). The visible thumb glyph is 14 px but the effective click/tap target is ≥ 44 × 44 px via a transparent `::before` pseudo-element (WCAG 2.5.5).
3. **`?t=` deep-link contract** — `voyager.app/?t=<iso-8601>` (e.g. `/?t=1989-08-25T09:23:00Z`) initializes the simulation paused at that exact instant. **Invalid `?t=`** values (non-ISO, out-of-mission-range, or any parse error) are silently rejected (NFR-S7) — the simulation falls back to `MISSION_START_ET` with no error UI. The address bar always reflects the current simulation timestamp via `history.replaceState` (throttled at 250 ms during continuous scrub; final write on `pointerup`) — `pushState` is intentionally not used so the back button does not pollute with every drag.

The ET ↔ ISO-8601 conversion table (`web/src/math/et-conversions.ts`) embeds the SPICE leap-second table from `kernels/naif0012.tls` and matches `spiceypy.str2et` to within 2 ms across the full mission window (the omitted K·sin(E) periodic correction is below that bound).

## Chapter Director, Encounters, and the Detail Scrubber

The simulation is organised around **11 declarative chapter specs** registered in `web/src/chapters/registry.ts` (`ALL_CHAPTERS`). Each spec is a typed `ChapterSpec` object with `slug`, `name`, `markerLabel`, `anchorEt`, `[windowStartEt, windowEndEt]`, `spacecraft`, `targetBody`, and (per Story 4.5 onward for encounter chapters) optional `copy: { lede, body }` and `defaultFraming: { offsetKm: [x, y, z] }`. The 11 chapters: `launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`.

**`ChapterDirector` (Story 2.1)** is the per-frame FSM. For each chapter, it tracks the substate `out → entering → held → exiting → passed` against the current ET. The `entering` and `exiting` substates are transient — they fire once during a window crossing and immediately settle into `held` (forward enter) or `passed` (forward exit). Reverse-scrub symmetry holds: `passed → exiting → held` on reverse re-entry. Subscribers fire on **transitions only**, never per frame, mirroring the `ClockManager` cool-under-60-Hz contract.

**`<v-chapter-copy>` (Story 2.9 + extended in Story 4.5)** renders the `held` chapter's editorial copy in the right-side panel: serif `--v-size-chapter-copy-lg` lede + serif body in `--v-color-fg-muted` with max-width 32ch. The component subscribes to `ChapterDirector`'s transitions; on `to === 'held'` it renders the chapter's lede + body; on `from === 'held'` it clears. Heliopause copy lives in `web/src/data/heliopause-copy.ts` (Story 2.9 ADR-0021 wire-up); encounter copy lives on the `ChapterSpec.copy` field directly (Story 4.5). The `copyForChapter(chapter)` helper inside the component dispatches between the two paths.

**`<v-timeline-scrubber variant="detail">` (Story 4.4)** is the second scrubber that slides into view above the mission scrubber when an encounter chapter enters `held`. The detail scrubber's `[range-start, range-end]` props auto-bind to the active chapter's `[windowStartEt, windowEndEt]` (±5 days per Stories 4.5 → 4.7). Keyboard step sizes are **cadence-aware** — hourly outside ±2 days of the anchor, 1-minute inside ±2 days, 10-second inside ±1 hour of closest approach — matching the bake's `CADENCE_BANDS` table at `bake/src/bake_trajectories.py`. Both scrubbers share a single `URLSync` instance so the 250 ms `replaceState` throttle coalesces drags across either scrubber. The detail scrubber consumes the APG-Slider keyboard contract via `createSliderKeyboardHandler` from `web/src/primitives/slider-keyboard.ts` (ADR-0025; Rule 9 in `_bmad/custom/voyager-skill-rules.md`).

**Body-centered camera framing (Stories 4.5 → 4.7).** Each encounter chapter spec carries `defaultFraming.offsetKm`; on `to === 'held'`, a subscriber wired in `web/src/main.ts` calls `cameraController.applyDefaultFraming({ animated: true })` which interpolates the camera to the chapter's offset over `--v-duration-slow` (SLERP quaternion + LERP position). The cold-load path replays the same fire ONCE on first paint via `coldLoadReplayDone`. The pattern generalises across all 6 encounter chapters and is the canonical wire-up for any future chapter that wants body-centered framing (Epic 5 PBD reuses it).

**Heliocentric system-view (Story 4.12).** A second public method `cameraController.applyHeliocentricFraming({ distanceAu, elevationDeg, animated })` positions the camera at the specified AU-scale distance from the Sun-at-origin (per Story 1.13), tilted by `elevationDeg` from the ecliptic, looking back at origin. Activated via the URL query `?view=heliocentric&distance=<au>&elevation=<deg>`; defaults to 10 AU + 20° elevation; clamped to `distance ∈ [1, 100]` AU and `elevation ∈ [-89, 89]°`. The two FR11/FR12 dramatic-moment screenshots — V1 Saturn's Titan-slingshot ecliptic exit and V2 Neptune's Triton bend south — were captured via this mode and live at [`docs/visual-validation/gravity-assists.md`](docs/visual-validation/gravity-assists.md).

**Moons.** The 12 Voyager-encounter moons (Io, Europa, Ganymede, Callisto, Titan, Iapetus, Miranda, Ariel, Umbriel, Titania, Oberon, Triton) are added to the scene on `MissionPhaseFSM.soiEntered` events and removed on `soiExited` (Story 4.3 cycle 4). Position chunks come from the satellite SPK kernels procured in Story 4.11 (`jup365.bsp`, `sat441.bsp`, `ura184_part-3.bsp`, `nep097.bsp`). Hyperion (NAIF 607) is a documented grey-sphere placeholder per Story 4.3 cycle 4 — no public-domain equirectangular surface map exists due to the moon's chaotic rotation (USGS confirms no control network). 2K KTX2 textures for the other 12 moons live under `web/public/textures/`; sources mirrored in [`THIRD_PARTY.md`](THIRD_PARTY.md).

**L4 visual regression (Story 4.9).** The Playwright suite at `web/tests/visual/encounters.spec.ts` pins **9 scenes** at 1280×720 in Chromium-for-Testing (locked by the `@playwright/test` package version): V1 launch, V2 launch, V1J, V2J, V1S, V2S, V2U, V2N, and a PBD stub baseline (the real PBD baseline is Story 5-4's deliverable). The `l4-visual-regression` CI job in `.github/workflows/ci.yml` runs the suite after the web build; diff artifacts are uploaded on failure. The full suite runs in ~41 seconds locally — well under the NFR-M4 L4 + L5 budget. Run locally with `npm run test:visual`; refresh baselines via `npm run test:visual:update` (and commit the new baselines in the same PR per Story 4.9 AC4).

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

## Deployment

The artifact ships as a static `web/dist/` bundle served by **Cloudflare Pages** (selected in Story 1.14; rationale in [ADR 0016](docs/adr/0016-cdn-provider-selection-deferred.md)). Every push to `main` runs `.github/workflows/ci.yml`, which lints, typechecks, bakes (with a determinism re-bake + SHA compare per NFR-R4), validates against the L1 harness (NFR-P9), runs the web vitest suite (Layer-3), builds with content-hashed assets, and on green pushes to `main` deploys to Cloudflare Pages. Pull requests get preview deploys automatically via Cloudflare's GitHub integration — no workflow step is needed for previews.

### Required GitHub repo secrets

The deploy job in `.github/workflows/ci.yml` fails on `main` until the project maintainer adds two repo secrets under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value | Where to get it |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | A custom API token scoped to `Account → Cloudflare Pages → Edit` | Cloudflare dashboard → My Profile → API Tokens → Create Custom Token (use the "Cloudflare Pages — Edit" template) |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (a 32-character hex string) | Cloudflare dashboard → Workers & Pages → Overview (right sidebar) |

The Cloudflare Pages project itself must exist before the first deploy. Create it once via the Cloudflare dashboard or `wrangler pages project create voyager`, then the GitHub Action's `projectName: voyager` lookup in the workflow finds it.

### Cache-Control + HTTPS

`web/public/_headers` is checked into Git and read by Cloudflare Pages at deploy time. It pins `/assets/*`, `/data/*`, `/fonts/*`, `/models/*`, and `/textures/*` to `Cache-Control: public, max-age=31536000, immutable` (NFR-R2 — safe because every URL is content-addressed) and HTML to `max-age=3600` so new deploys propagate within an hour. Cloudflare Pages enforces HTTPS-only and TLS 1.2+ (with TLS 1.3 preferred) by default; no separate config is needed (NFR-S1).

### Post-deploy smoke test

After the first green deploy, verify from a clean shell:

```bash
# Replace voyager.app with the actual production hostname configured in Cloudflare Pages.
curl -I https://voyager.app/
```

Expected headers in the response:

- `HTTP/2 200`
- `cache-control: public, max-age=3600`
- `content-type: text/html; charset=utf-8` (or similar)

And for a content-hashed asset (the exact hash will vary per build):

```bash
curl -I https://voyager.app/assets/index-<hash>.js
```

Expected:

- `HTTP/2 200`
- `cache-control: public, max-age=31536000, immutable`

### Rollback

Cloudflare Pages keeps every prior deployment reachable via its per-deploy preview URL indefinitely. To roll the production URL back to a known-good deploy:

```bash
# List recent deployments
wrangler pages deployment list --project-name voyager

# Roll the production alias to a specific prior deployment
wrangler pages deployment rollback <deployment-id> --project-name voyager
```

Or use the **Promote to production** action on any prior deployment in the Cloudflare Pages dashboard. Both paths complete in ≤5 minutes without a rebuild, satisfying NFR-R3.

### Immutable URL contract

Per NFR-R2, prior content-hashed asset URLs remain reachable after a redeploy. Two successive deploys (each with content-hashed `web/dist/assets/*` filenames) leave both bundles' assets resolvable via their respective per-deploy preview URLs. The production URL serves the latest deploy; older hashed asset filenames return 404 on the production URL when their content has been replaced, but accessing them via the older deploy's preview URL keeps the entire bundle resolvable for as long as Cloudflare retains the deploy (effectively forever on the free tier).

To verify the contract after the second deploy: capture an asset URL from deploy A, push a change that triggers deploy B, then `curl -I` the deploy-A asset URL against deploy A's preview hostname.

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
