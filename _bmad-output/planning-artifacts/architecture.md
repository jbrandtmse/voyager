---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-05-17'
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-Voyager.md
  - _bmad-output/planning-artifacts/product-brief-Voyager-distillate.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/research/initial-research.md
  - _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md
workflowType: 'architecture'
project_name: 'Voyager'
user_name: 'Developer'
date: '2026-05-17'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (58 total, across 7 clusters):**

The PRD defines 58 functional requirements organized by capability cluster:

- **Timeline & Playback Controls (FR1–FR7):** Scrub, play/pause, 1× to 1e6× speed, chapter jump, scrubber chapter markers, mission-bounds shortcuts, auto speed-cap during chunk load.
- **Spacecraft & Trajectory Rendering (FR8–FR14):** Both Voyagers visible, past/future trajectory rendering with semantic styling, gravity-assist physics legible, Triton south-of-ecliptic arc, sub-meter ↔ 165 AU zoom without jitter, SPICE-derived celestial body positions.
- **Attitude & Instrument Visualization (FR15–FR20):** CK-driven body + scan-platform orientation, articulated platform during encounters, NA boresight cone, synthesized Earth-pointing HGA during cruise, persistent CK-vs-synthesized indicator, quaternion sign-flip-stable interpolation.
- **Encounter & Chapter Scenes (FR21–FR30):** Six encounter scenes (V1/V2 Jupiter, V1/V2 Saturn, V2 Uranus, V2 Neptune), choreographed Pale Blue Dot with NASA photo-plate composite, heliopause text cards, per-chapter copy.
- **Camera, View System & HUD (FR31–FR36):** Smooth heliocentric ↔ body-centered blends, manual orbit/pan/zoom with single-action restore, HUD with date/distance/chapter/speed, instrument-shutoff status reflected over decades, HUD dismissable.
- **Sharing, Embedding & URL System (FR37–FR42):** Per-chapter + per-timestamp deep-links, pre-rendered OG cards, `?embed=true` chrome-less mode, URL contract stability across releases, address bar always live.
- **Audio, Accessibility & Methodology (FR43–FR50):** Toggleable Golden Record audio (off by default), keyboard parity for all primary controls, reduced-motion honored, About/Methodology page, full attribution surface, WCAG 2.2 AA, zero PII collection.
- **Build, Validation & Deployment Operations (FR51–FR58):** Reproducible kernel-driven bake, SHA-256 kernel manifest, drift-report flow with 5 km acceptance threshold, 6-layer validation harness as CI gates, static CDN deploy with immutable filenames, friendly browser-unsupported fallback, rollback by prior-version redeploy.

**Non-Functional Requirements (46 total, across 7 quality attributes):**

- **Performance (10 NFRs):** 60 FPS at 1280×720+ on mid-range laptop (NFR-P1); P95 ≤16.7 ms, P99 ≤22 ms (NFR-P2); ≤3s TTI on broadband (NFR-P3); first-paint ≤35 MB / full bundle ≤150 MB compressed (NFR-P4/P5); ClockManager mutations don't block frame budget (verified via RenderEngine frame-time histogram, not direct sub-ms ClockManager timing); 1e6× scrub honors per-frame pacing without main-thread starvation (NFR-P6, amended 2026-05-19 per Story 1.15); ≤1 ms/frame trajectory interpolation for 12 bodies (NFR-P7); zero z-fighting / zero jitter at any zoom (NFR-P8); ≤20 km / ≤5 km RMS trajectory accuracy (NFR-P9); ≤1 mrad attitude accuracy in CK windows (NFR-P10).
- **Reliability (5 NFRs):** ≥99.9% CDN availability (NFR-R1); content-hashed immutable asset durability (NFR-R2); ≤5 min rollback (NFR-R3); byte-identical bake determinism (NFR-R4); ≤5% frame-rate drift over 30-min sessions (NFR-R5).
- **Security (9 NFRs):** TLS 1.2+ (NFR-S1); strict CSP (NFR-S2); SRI for any external JS (NFR-S3); kernel + asset hash-pinning (NFR-S4/S5); CI dep advisory checks (NFR-S6); strict-typed URL parameter parsing (NFR-S7); zero PII / no tracking (NFR-S8); no cross-origin runtime fetches (NFR-S9).
- **Accessibility (8 NFRs):** WCAG 2.2 AA conformance (NFR-A1); 4.5:1 body / 3:1 large contrast (NFR-A2); full keyboard reachability (NFR-A3); visible focus indication (NFR-A4); `prefers-reduced-motion` honored (NFR-A5); no photosensitive-epilepsy hazards (NFR-A6); semantic markup (NFR-A7); screen-reader floor for non-canvas surfaces (NFR-A8).
- **Compatibility (7 NFRs):** Tier 1 desktop Chrome/Firefox/Safari, Tier 2 tablet, Tier 3 phone (NFR-C1–C3); boot-time feature detection (NFR-C4); reverse-Z → logarithmic depth fallback (NFR-C5); 8k → 4k texture fallback (NFR-C6); unsupported-browser fallback page rather than degraded render (NFR-C7).
- **Maintainability (6 NFRs):** ADR per rejected technical idea (NFR-M1); 30-min kernel-update operational flow (NFR-M2); mission-fact provenance via `MISSION_FACTS.md` (NFR-M3); fast-tier CI test execution (L1 Python validate + L3 Vitest) ≤5 min, slow-tier (L4 Playwright visual + L5 E2E) ≤15 min, bake-determinism re-bake is a separately-budgeted ≤10-min quality gate (NFR-M4, amended 2026-05-19 per Story 1.15); build-manifest observability (NFR-M5); no accumulating tech debt (NFR-M6).
- **Scalability (1 NFR):** Solved architecturally by static-CDN delivery (NFR-Sc1).

### Scale & Complexity

- **Project type:** Web app — client-rendered single-page application, no server, no API, no database, no session state. URL + client memory is the entire state surface.
- **Primary domain:** Scientific visualization (aerospace-adjacent). The aerospace-software concerns (DO-178C, ITAR/EAR, safety-of-life, real-time control) explicitly do **not** apply per PRD §Domain-Specific Requirements; inherited concerns are validation, accuracy, reproducibility, provenance.
- **Complexity level:** **Medium overall**, with a sharp technical-precision spike at the core. High technical sophistication (sub-mm precision at AU scales, floating-origin, reverse-Z, cubic Hermite over position+velocity, SLERP over CK quaternions, custom binary trajectory format). Low regulatory/compliance burden (all data is NASA public-domain or attribution-only).
- **Team:** Solo developer; portfolio piece; ~3–5 month realistic calendar at portfolio polish.
- **Estimated architectural components:** ~14 runtime services + ~6 build-pipeline stages + 11 chapter scenes + 1 hero PBD scene + 6-layer validation harness.
- **External runtime dependencies:** **None.** All ephemeris and attitude data baked at build time.
- **External build-time dependencies:** NAIF SPICE kernels, USGS Astrogeology textures, Björn Jónsson planetary maps, NASA 3D Resources Voyager model, NASA Photojournal images, Voyager Golden Record audio.

### Technical Constraints & Dependencies

The PRD and technical research have pre-decided a substantial fraction of normally-open architectural territory. These enter the architecture work as inputs, not as decisions:

- **Runtime stack:** TypeScript 5.x strict + Three.js (≥r170, reverse-Z) + Vite. Client-only; no backend.
- **Build stack:** Python 3.13 + SpiceyPy 8.1.0 + scipy + numpy. uv for Python deps; Ruff for lint/format. gltf-transform + toktx + Blender (headless) for asset pipeline.
- **Hosting:** Static CDN — Cloudflare Pages or Vercel free tier (provider TBD).
- **Storage formats at runtime:** Custom 40-byte-header VTRJ binary (raw little-endian Float64Array), brotli-compressed. JSON/CSV/MessagePack/Protobuf/Arrow/Parquet at runtime all explicitly rejected.
- **Numerical methods:** Cubic Hermite over position+velocity for trajectories; SLERP for quaternions (Catmull-Rom rejected).
- **Depth precision:** Reverse-Z on WebGLRenderer; logarithmic depth as GPU fallback. WebGPURenderer deferred until it supports reverse-Z.
- **Coordinate patterns:** Single canonical heliocentric J2000 Float64 frame; per-frame `ViewFrame.getTransform(et)`; floating-origin recenter via `WorldGroup.position = -cameraWorldPos / SCALE`; smoothstep blend over ±2 days at encounter boundaries.
- **State patterns:** Decoupled `ClockManager` as the single source of `simTimeEt`; mission-phase FSM is time-driven, not event-driven; branded `WorldVec3` (Float64) vs `RenderVec3` (Float32) types make the precision-loss boundary explicit.
- **Build-time precompute is the path:** All ephemeris and attitude data baked from NAIF kernels at build time. No JPL Horizons API at runtime. No CSPICE-in-WebAssembly (jsSpice is dormant).
- **Validation harness:** 6 layers; L1–L5 are v1 launch gates, L6 (performance regression) is v1.1.
- **ADRs are mandatory** for every entry in the technical research's "Rejected Technical Ideas" inventory (NFR-M1).

### Cross-Cutting Concerns Identified

1. **Time as singular truth.** `ClockManager.simTimeEt` is the per-frame heartbeat. Every consumer (`EphemerisService`, `AttitudeService`, `ViewFrame`, `MissionPhaseFSM`, `HUDPresenter`, `URLSync`, `AudioLayer`, `ChapterDirector`, `ChunkLoader`) reads it once per frame. A single source of drift would corrupt the entire frame.
2. **Float64 ↔ Float32 precision boundary.** Branded vector types propagate the precision-loss point through `EphemerisService` → floating-origin recenter → Three.js scene graph. R5 (silent Float32 jitter under zoom) is the project's most insidious technical risk; the type-system makes the cast explicit.
3. **CK-vs-synthesized provenance.** One piece of provenance information emitted by `AttitudeService` per quaternion sample; consumed by `HUDPresenter` (indicator), chapter copy, and About page. Single state, four UI surfaces.
4. **URL ↔ simulation state.** Bidirectional binding: deep-link boot loads a paused simulation at the URL timestamp; live scrubbing updates the URL (debounced). FR41 elevates the URL scheme to a versioned public-API contract that must remain stable across releases.
5. **Asset chunking + prefetch.** `ChunkLoader` couples to `ClockManager` (auto speed-cap during load — FR7) and `ViewFrame` (chunk schedule keyed to encounter windows). The asset manifest is the contract between the Python bake and the TypeScript runtime.
6. **6-layer validation gates as deploy contract.** L1 Python → L2 JS-vs-SPICE → L3 TS unit → L4 visual regression → L5 E2E timeline. Any failure blocks deploy (FR55). Job topology must let slow layers (L4/L5) run in parallel with fast layers to honor the 5/15-minute CI budgets (NFR-M4).
7. **Reduced-motion + WCAG.** `prefers-reduced-motion: reduce` flips every camera transition, scrubber animation, and speed-multiplier ramp to instant cuts. One global setting; many local consumers.
8. **Embed mode (`?embed=true`).** Hides every chrome element (logo, share, chapter-index, About link, footer) without disabling the simulation. Architectural choice: a single boolean propagated via store/context, or per-component conditional rendering — one seam.
9. **GPU capability fallback.** Boot-time probe selects reverse-Z vs logarithmic depth (NFR-C5) and 8k vs 4k texture tier (NFR-C6). This is a pre-bootstrap decision that parameterizes both the renderer configuration and the asset loader.

## Starter Template Evaluation

### Primary Technology Domain

Browser-only single-page application (TypeScript + Three.js + Vite) paired with a Python build-time bake project (SpiceyPy + scipy + numpy + custom binary writer). No backend, no API, no database. Static-CDN delivery.

The PRD has pre-decided the load-bearing stack (Three.js, Vite, TypeScript strict, SpiceyPy, uv, Ruff, Vitest, Playwright, gltf-transform, toktx, Blender headless). The starter question therefore collapses to: which minimal scaffold do we initialize each half from, and how do we organize the two halves in a single repository?

### Starter Options Considered

| Option | Verdict |
| --- | --- |
| **`npm create vite@latest -- --template vanilla-ts`** | **Selected for web side.** Smallest defensible baseline; Vite HMR + TypeScript wired correctly; zero framework opinionation. Keeps the React-vs-vanilla HUD question (flagged open in the brief) deferrable without preempting it. |
| `npm create vite@latest -- --template react-ts` | Rejected for v1. The HUD/UI surface is small and dominated by canvas; React adds bundle tax (≈40 KB gzipped) without buying a feature any user-facing FR requires. Re-evaluate if HUD complexity grows during downstream scoping. |
| Three.js community starters (`three-vite`, various `three-ts-template` repos) | Rejected. None are canonically maintained; all bundle opinions (controls, post-processing) we have specific PRD-locked decisions about. Net negative vs vanilla Vite + targeted Three.js addition. |
| Astro / 11ty SSG | Rejected. The product is one large SPA canvas with per-route static HTML shells (for OG cards). Vite's native multi-page input mode delivers per-chapter HTML shells without the SSG framework footprint. |
| Custom from scratch (no `npm create`) | Rejected. Vite vanilla-ts already gives total control with one command. |
| **`uv init voyager-bake`** | **Selected for bake side.** uv handles deterministic dependency locking (NFR-R4 byte-identical bake), Python 3.13 pinning, and `pyproject.toml` setup. No bake-side starter ecosystem exists for SPICE work; the layout follows the asset pipeline directly. |

### Selected Starter: Vite `vanilla-ts` (web) + `uv init` (bake) in a single repository

**Rationale for Selection:**

- Smallest defensible baselines on both halves; no opinions imported that we'd immediately rip out.
- Defers the React-vs-vanilla decision (brief: "open question") until HUD scoping forces a real answer. Vanilla TypeScript DOM + a templating helper (e.g., `lit-html` or hand-rolled tagged-template literals) is likely sufficient for the HUD surface; React/Preact can layer in later via a one-file addition if needed.
- Monorepo (single git repo with `web/` and `bake/` top-level directories) keeps the asset-manifest contract between Python bake and TypeScript runtime co-located, supports the L2 JS-vs-SPICE validation harness at-a-commit, and lets a single CI workflow express the `bake → bundle → test → deploy` DAG.
- No Nx / Turborepo / Lerna — two directories sharing a repo root with a top-level `Makefile` or `justfile` for orchestration is sufficient.

**Initialization Commands:**

```bash
# Repository layout
mkdir voyager && cd voyager
git init

# Web side
npm create vite@latest web -- --template vanilla-ts
cd web
npm install three @types/three                    # core renderer
npm install -D vitest @vitest/coverage-v8          # L3 TS unit tests
npm install -D @playwright/test                    # L4 visual regression + L5 E2E
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier
cd ..

# Bake side
uv init bake --python 3.13
cd bake
uv add spiceypy scipy numpy
uv add --dev ruff pytest pytest-cov
cd ..

# Top-level orchestration (justfile shown; Makefile equivalent works)
# touch justfile
```

**Top-level repository structure:**

```text
voyager/
├── README.md
├── justfile                          # orchestration: just bake, just dev, just test, just deploy
├── .github/workflows/                # CI: bake → bundle → fast tests → slow tests → deploy
├── docs/
│   └── adr/                          # NFR-M1: ADR per rejected technical idea
├── kernels/
│   ├── kernels-manifest.json         # SHA-256 hash-pinned NAIF kernel inventory
│   └── (SPK/CK/PCK/LSK/FK files)     # via Git LFS or .gitignored + fetched in CI
├── bake/                             # Python build-time precompute
│   ├── pyproject.toml
│   ├── src/
│   │   ├── bake_trajectories.py
│   │   ├── bake_attitude.py
│   │   ├── vtrj_writer.py
│   │   └── validate_l1.py            # L1 Python interpolation validation
│   ├── tests/
│   └── out/                          # generated; .gitignored
│       ├── manifest.json
│       └── *.bin.br
└── web/                              # TypeScript SPA
    ├── package.json
    ├── vite.config.ts                # multi-page input for per-chapter HTML shells
    ├── public/                       # static assets served as-is
    ├── src/
    │   ├── main.ts                   # boot
    │   ├── services/                 # ClockManager, EphemerisService, AttitudeService, ViewFrame, ...
    │   ├── scenes/                   # chapter scenes (including PBD hero)
    │   ├── render/                   # Three.js renderer setup, floating-origin, reverse-Z
    │   ├── ui/                       # HUD, chapter copy panel, scrubber, chapter index
    │   ├── url/                      # URL ↔ state sync, embed-mode parsing
    │   └── assets/                   # references to baked binaries via import.meta.glob
    ├── tests/                        # L3 Vitest unit tests
    └── e2e/                          # L4 + L5 Playwright tests
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**

- TypeScript 5.x strict mode (Vite default `tsconfig.json` with `strict: true`)
- Python 3.13 (pinned via `uv` and `.python-version`)
- ESM modules throughout the web side (Vite default)

**Build Tooling:**

- Vite for the web side; multi-page input mode for per-chapter HTML shells (FR39 OG cards)
- uv for Python deps; deterministic lockfile (`uv.lock`) supports NFR-R4 byte-identical bake reproducibility
- gltf-transform + toktx + Blender headless layered onto the bake pipeline (not part of the initial scaffold; added in Phase 0)

**Testing Framework:**

- Vitest for L3 (TS unit tests; Hermite math, time conversions, blend weights, manifest parsing)
- Playwright for L4 (visual regression at 6 encounter scenes + launch + PBD) and L5 (E2E mission-timeline assertion)
- pytest for the bake side and L1 Python validation harness
- L2 (JS-vs-SPICE consistency) implemented as a Vitest suite that loads Python-baked fixed-seed reference samples — no separate framework needed

**Code Organization:**

- Service-oriented module structure under `web/src/services/` (`ClockManager`, `EphemerisService`, `AttitudeService`, `ViewFrame`, `MissionPhaseFSM`, `ChapterDirector`, `ChunkLoader`, `URLSync`, etc.) — boundaries to be detailed in Step 4
- Scene-per-chapter under `web/src/scenes/`; PBD scene gets its own dedicated module given hero-status
- Three.js renderer / floating-origin / reverse-Z setup isolated under `web/src/render/`
- ADR catalogue under `docs/adr/` — one ADR per rejected technical idea per NFR-M1

**Development Experience:**

- `just dev` (or `make dev`) — runs Vite dev server (HMR) against pre-baked development assets
- `just bake` — runs the Python bake; produces `bake/out/manifest.json` + binaries consumed by Vite
- `just test` — fast tier (L1 + L2 + L3) in ≤5 minutes per NFR-M4
- `just test-slow` — slow tier (L4 + L5) in ≤15 minutes per NFR-M4
- `just deploy` — static CDN deploy via Cloudflare Pages or Vercel CLI on green CI

**Note:** Project initialization using these commands should be the first implementation story.

## Core Architectural Decisions — Batch 1: Rendering + Data Core

### Cross-Cutting Commitment: Automated Asset Acquisition

**All external assets — without exception — are acquired by tooling, never manually.** NAIF SPICE kernels, NASA 3D Resources Voyager models, USGS Astrogeology textures, Björn Jónsson planetary maps, NASA Photojournal images for the Pale Blue Dot composite, and the Voyager Golden Record audio are each fetched, SHA-verified, and placed by an idempotent script that reads a declarative asset manifest. If any source requires scraping (e.g., HTML pages that link to image assets), we build the scraper; manual download-and-commit is forbidden as a workflow.

**Why this matters architecturally:**

- **Hands-off maintenance** is a load-bearing project commitment (per Developer directive). The artifact must survive multi-year maintenance without continuous developer attention; manual asset retrieval is the single highest-friction operation that can erode that.
- **Reproducibility** (NFR-R4 byte-identical bake; NFR-M3 mission-fact provenance) requires every asset to enter the project through a SHA-verified channel.
- **Kernel-update flow** (FR53, NFR-M2 ≤30-minute operational flow) is a PR that updates expected SHAs in the manifest; CI runs `just acquire`, drift report runs, merge produces a new bake. No download-by-hand step.
- **Onboarding a contributor (or future-self after a long break)** is reduced to `git clone && just bootstrap` — `bootstrap` runs `acquire` then `bake` then `dev`.

**Tooling commitment (detailed in Batch 3 Category 9):**

- `bake/src/acquire_kernels.py` — NAIF SPK + CK + PCK + LSK + FK; supplementary CKs from PDS Rings Node
- `bake/src/acquire_models.py` — NASA 3D Resources Voyager model; Blender-headless OBJ→GLB conversion in the same step
- `bake/src/acquire_textures.py` — USGS Astrogeology + Björn Jónsson maps; KTX2 encoding (toktx) in the same step
- `bake/src/acquire_photojournal.py` — NASA Photojournal images for PBD composite
- `bake/src/acquire_audio.py` — Voyager Golden Record from NASA archive
- `bake/src/acquire_all.py` — orchestrator; runs all of the above; idempotent (no-ops if SHA-matched files already present)
- Top-level command: `just acquire` (or `make acquire`)

All scripts share a common pattern: read a per-class manifest entry (`{url, expected_sha256, target_path, derived_assets[]}`), fetch with retry/cache, verify SHA, place file, generate derived assets, fail loudly on any mismatch.

### Category 1 — Build-Time Data Pipeline

**Pre-decided (PRD/research, recorded for traceability):**

- Python 3.13 + SpiceyPy 8.1.0 + scipy.CubicHermiteSpline + numpy
- Custom VTRJ binary (40-byte header + raw little-endian Float64Array body), brotli-compressed for transport
- Chunking: per-decade trajectory files at daily cadence; per-encounter higher-cadence overlays (1-hour at ±30 days from CA, 1-minute at ±2 days, 10-second at ±1 hour)
- Hash-pinned NAIF kernel manifest (SHA-256)
- Byte-identical bake determinism (NFR-R4)

**Decision 1a — Kernel acquisition strategy: Git LFS for storage, automated tool for population.**

- Kernels (SPK, CK, PCK, LSK, FK) live under `kernels/` and are tracked by Git LFS.
- The `acquire_kernels.py` tool reads `kernels/kernels-manifest.json` (URL + SHA-256 per kernel) and fetches from NAIF / PDS Rings Node, verifies SHA, places under `kernels/`. Idempotent.
- A fresh clone runs `git lfs pull` and gets every kernel bit-exact. CI runs `just acquire` to verify that the LFS-tracked files SHA-match the manifest before bake.
- A kernel update is a PR that updates one expected SHA in the manifest, runs `acquire`, runs `drift_report.py`, attaches the report; merge produces a new bake.
- Rationale: combines LFS's bit-exact reproducibility-from-clone with the Developer directive's "no manual asset retrieval ever."

**Decision 1b — Asset manifest schema:** JSON at `bake/out/manifest.json` (generated by bake), copied to `web/public/manifest.json` for runtime fetch.

```text
{
  "schemaVersion": 1,
  "bakeCommit": "<git sha>",
  "bakeTimestamp": "<ISO-8601 UTC>",
  "kernels": [
    {"file": "vgr1_super_v2.bc", "sha256": "...", "source_url": "https://naif.jpl.nasa.gov/..."}
  ],
  "bodies": [
    {
      "naifId": -31,
      "name": "Voyager 1",
      "files": [
        {"timeRangeEt": [...], "cadenceSec": 86400, "kind": "trajectory", "url": "v1_1977-1987.bin.br", "sha256": "...", "sizeBytes": ...}
      ]
    }
  ],
  "chapters": [
    {"id": "v1-jupiter", "anchorEt": ..., "windowEtStart": ..., "windowEtEnd": ..., "ogCardUrl": "og/v1-jupiter.png"}
  ],
  "validationTolerances": {"maxPositionErrorKm": ..., "rmsPositionErrorKm": ...}
}
```

Runtime refuses to load unknown major schemaVersion; minor version bumps are additive and backward-compatible. ADR-required for any schema version change.

**Decision 1c — Drift report tool:** `bake/src/drift_report.py`. Inputs: prior baseline manifest + new bake manifest. Samples each body at a deterministic ET grid; computes max + RMS position drift per body and overall. Output: markdown report attached to PR. Threshold: `max_drift_km ≤ 5` (FR54).

**Decision 1d — Bake determinism verification (NFR-R4):** CI runs the bake twice on identical inputs and asserts that all output binary SHAs match. Pins: Python patch version in `.python-version`; SpiceyPy `==8.1.0` (exact); `uv.lock` committed; CI runs only on linux/amd64 (matches the CSPICE wheel platform).

**Decision 1e — Chunking strategy:** per technical research's cadence table; one VTRJ file per `(body × time-window × kind)` tuple where kind ∈ {`trajectory`, `bus_attitude`, `platform_attitude`}. Manifest's `bodies[].files` array indexes them by time range.

### Category 2 — Runtime Service Decomposition

Service-graph architecture (not Redux/MobX/store). The system is a per-frame data pipeline more like a game engine than a CRUD UI; explicit dependency injection + a tiny observable seam beats indirection from a global store.

**Twelve services + two boot-immutable globals + four UI presenters:**

| Service / Object | Owns | Reads from |
| --- | --- | --- |
| `ClockManager` | `simTimeEt`, `playbackRate`, `playing/paused`; `tick(realDt)`, `setRate(x)`, `scrubTo(et)`. Single source of truth for time. | — (leaf) |
| `MissionPhaseFSM` | Pure function `phaseAt(et) → MissionPhase` over a hardcoded phase table. | ClockManager |
| `ChunkLoader` | Network fetch + LRU cache for VTRJ binaries; `loadChunkFor(et, kind, bodyId) → typed-array view`; emits `loading: boolean`. | — (leaf; manifest at boot) |
| `EphemerisService` | `getStateAt(et, bodyId) → {position: WorldVec3, velocity: WorldVec3}`; cubic Hermite interpolation. | ChunkLoader |
| `AttitudeService` | `getAttitudeAt(et, spacecraftId) → {busQuat, platformQuat, provenance: 'CK' \| 'synthesized'}`; SLERP + HGA-Earth synthesis fallback. | ChunkLoader, EphemerisService |
| `ViewFrame` | `getTransform(et) → Matrix4`; smoothstep blend heliocentric ↔ body-centered over ±2 days. | ChapterDirector, EphemerisService |
| `ChapterDirector` | Chapter table; current-chapter state; PBD choreography; Golden Record cue dispatch. | ClockManager, MissionPhaseFSM |
| `RenderEngine` | Three.js renderer, scene, camera; per-frame pipeline; floating-origin recenter on `WorldGroup`. | all data services + ViewFrame + GPUCapabilityProbe |
| `BoresightRenderer` | NA-camera frustum cone geometry; orientation from AttitudeService. | AttitudeService, RenderEngine |
| `GPUCapabilityProbe` | Boot-time singleton; selects reverse-Z vs logarithmic depth (NFR-C5); 8k vs 4k texture tier (NFR-C6). | renderer capabilities at boot |
| `URLSync` | Bidirectional URL ↔ ClockManager bridge; boot deep-link parse; debounced writeback (~250 ms). | ClockManager, ChapterDirector |
| `AudioLayer` | Golden Record diegetic audio; cue-gated; user toggle (session-scoped localStorage). | ChapterDirector |
| `EmbedModeState` (global) | `{ embed: boolean }` from URL `?embed=true` at boot. Immutable. | — |
| `AccessibilityState` (global) | `{ reducedMotion: boolean }` from `prefers-reduced-motion`. Immutable for session. | — |
| `HUDPresenter` | DOM HUD overlay (date, distance, chapter title, speed, instrument-shutoff legend, CK/synth provenance). | ClockManager, EphemerisService, ChapterDirector, AttitudeService, MissionPhaseFSM, EmbedModeState |
| `ScrubberPresenter` | DOM timeline scrubber + chapter markers; pointer/touch/keyboard input → ClockManager. | ClockManager, ChapterDirector, EmbedModeState, AccessibilityState |
| `ChapterCopyPresenter` | DOM chapter-copy panel. | ChapterDirector, EmbedModeState |
| `ChapterIndexPresenter` | DOM chapter-index modal/affordance. | ChapterDirector, EmbedModeState |

**Dependency graph (no cycles):**

```text
                ClockManager ◄────────── URLSync (writeback, debounced)
                     │                   ↑
                     ▼                   │ (boot deep-link scrub)
        MissionPhaseFSM ─► ChapterDirector ─► AudioLayer
                                  │
                                  ▼
                              ViewFrame
                                  │
                                  ▼
ChunkLoader ─► EphemerisService ─► RenderEngine ◄─ GPUCapabilityProbe
            └► AttitudeService ──┤   │
                                 │   ▼
                                 └► BoresightRenderer

UI presenters subscribe to observables from ClockManager + ChapterDirector +
AttitudeService + MissionPhaseFSM, and read-flat from EmbedModeState + AccessibilityState.
```

**Communication patterns:**

- **Direct method calls** with constructor-injected dependencies. No service locator, no DI container.
- **Observable subscriptions** via a tiny event-emitter (or `@preact/signals-core` if the Batch-2 UI framework decision picks signals).
- **No event bus.** **No reactive framework** (RxJS, MobX). **No global store** (Redux, Zustand, Jotai).

**State ownership doctrine:** Every piece of state has exactly one owner. URL is _derived_ from ClockManager + ChapterDirector (via URLSync); never authoritative. ChunkLoader's loading flag is the sole input to ClockManager's auto speed-cap behavior (FR7).

### Category 3 — Rendering Substrate

**Pre-decided:** Three.js WebGLRenderer with reverse-Z (≥r170); floating-origin via `WorldGroup.position = -cameraWorldPos / SCALE`; far plane ≥165 AU; 4 spacecraft LODs; planet textures 4k with lazy 8k upgrade on SOI entry; KTX2 UASTC for hero textures, ETC1S for planets/skybox; `EXT_meshopt_compression` for GLB.

**Decision 3a — Render-space scale and precision layering: SCALE = 1 (km in render-space), with branded type layering.**

- `WorldVec3` (Float64, km) — authoritative; emitted by `EphemerisService.getStateAt`.
- `RenderVec3` (Float32, km) — post-floating-origin-recenter; passed to Three.js scene graph.
- `MeshLocalVec3` (Float32, meters) — vertex-local within a model (e.g., Voyager spacecraft mesh).
- Cast points are explicit at the type-system level; R5 mitigation is the type-system itself.
- Camera near = 1e-6 km (1 mm), far = 1.65e10 km (≥165 AU). Reverse-Z float depth handles depth across the range.
- Sub-mm precision is achieved _near the camera_, which is _near the spacecraft_; F32 precision at the origin (~1.2e-7 km = 0.12 mm) clears the bar.

**Decision 3b — Reverse-Z config:** Three.js native reverse-Z API (≥r170). Float depth buffer. Boot-time `GPUCapabilityProbe` runs a small reverse-Z test pattern; on detected failure flips to `logarithmicDepthBuffer: true`. ADR documents the probe heuristic and the failure threshold.

**Decision 3c — Camera:** `PerspectiveCamera`, default FOV 50°. Custom `VoyagerCameraController` (not `OrbitControls`): zoom range 1 m to 200 AU; no free roll without explicit modifier; single-action "restore default framing" (FR33). Manual override (FR32) sets `RenderEngine.manualCameraActive = true`, which suspends ViewFrame-driven framing until restore is requested.

**Decision 3d — LOD strategy:** Three.js `LOD` object on each spacecraft (4 levels; thresholds tuned during Phase 1). Planet 4k → 8k swap triggered by `MissionPhaseFSM` SOI entry, via `RenderEngine.upgradePlanetTexture(bodyId)` (async load then atomic material swap). Skybox 2k Milky Way ETC1S, permanent. Moon textures 2k, loaded on encounter window entry.

**Decision 3e — Scene graph topology:**

- `Scene` (root)
  - `WorldGroup` — floating-origin recentered each frame; holds Sun, planets, moons, spacecraft, trajectory lines, boresight cones
  - `SkyboxGroup` — camera-following, NOT floating-origin; holds Milky Way skybox
  - `OverlayGroup` — reserved for in-world overlays (currently unused)
- DOM HUD/UI/scrubber/chapter copy live in regular DOM layered over the canvas via CSS; never WebGL.

**Decision 3f — Trajectory line rendering:** `Line2` + `LineMaterial` (from `three/examples/jsm/lines/`); supports thick lines, dashed patterns, screen-space width. Per spacecraft: one past-line (solid) + one future-line (dashed). Geometry updated incrementally — past line grows, future shrinks — to avoid per-frame full rebuild.

**Decision 3g — Boresight cone:** Wireframe `ConeGeometry` parented to the spacecraft model's `SCAN_PLATFORM` node; orientation = `AttitudeService.platformQuat × camera-FK-fixed-rotation` (FK rotation from `vg1_v02.tf` / `vg2_v02.tf` frame kernels, hardcoded after Phase 0 inspection). NA half-angle = 0.21°. Visual register: thin, low-saturation, semi-transparent — present but never competing with the canvas. ADR documents the FK frame IDs and rotation values.

## Core Architectural Decisions — Batch 2: UX Surface

### Category 4 — Chapter & Scene System

**Eleven chapters, two patterns.** The 10 ordinary chapters share a single declarative shape; the Pale Blue Dot is fundamentally different (scripted ~7-day choreographed turn-and-sweep with photo-plate compositing at scripted instants) and gets a dedicated module.

**Decision 4a — Chapter definition format: hybrid (declarative spec for 10, dedicated module for PBD).**

- 10 chapters: each exported from `web/src/chapters/<chapter-id>.ts` as a typed `ChapterSpec` object — shape: `{ id, anchorEt, windowEt: [start, end], copy, viewFrameTarget, audioCue?, ogCardKey }`.
- PBD: `web/src/scenes/pale-blue-dot/PaleBlueDotScene.ts` is its own class implementing a shared `ChapterModule` interface. It owns the turn choreography keyframes, the per-target photo-plate composite timing table (Venus → Earth → Jupiter → Saturn → Uranus → Neptune), and the chapter copy.
- Both register through the same `ChapterDirector.register(spec | module)` so downstream consumers (chapter index, scrubber markers, OG card pipeline) treat them uniformly.

**Decision 4b — Scene lifecycle.** Per-chapter states: `out` → `entering` → `held` → `exiting` → `passed`, driven by `ChapterDirector.update(et)` once per frame. Enter/exit substates own the smoothstep view-frame blend (±2 days). PBD extends with internal substates for its choreography (`turning`, `sweeping_<body>`, `composite_active`, `composite_decay`).

**Decision 4c — View-frame blend mechanics.** Translation-only blend (no quaternion rotation blend in v1, per technical research). `ViewFrame.getTransform(et)` returns the J2000 → render-space transform; during cruise, identity-shifted-by-camera; during encounter ±2 days, smoothstep alpha [0,1] between heliocentric and body-centered origin. ADR documents the deferred rotation-blend question (revisit only if Jupiter's tilt feels off in playtesting).

**Decision 4d — Chapter copy authorship.** Hand-written prose lives in TypeScript string literals (backtick template literals) inside each chapter spec. Type-checked, version-controlled, single-source-of-truth. Markdown subset rendered by `<v-chapter-copy>` Web Component: italics + line breaks only; no images, no links (those go to the About page).

**Decision 4e — Mission-phase FSM vs chapter system: two separate concerns.**

- `MissionPhaseFSM` is coarse-grained, time-driven enum (`PRE_LAUNCH`, `CRUISE`, `JUPITER_ENCOUNTER`, `SATURN_ENCOUNTER`, `URANUS_ENCOUNTER`, `NEPTUNE_ENCOUNTER`, `INTERSTELLAR`) — governs SOI texture upgrades, instrument-shutoff legend in HUD, active boresight rendering. Not user-facing.
- `ChapterDirector` is finer-grained, story-driven — governs ViewFrame target, copy panel, chapter index, deep-linkable URLs, OG card keys. Eleven named chapters mapping onto subsets of FSM phases.
- They share the same `simTimeEt` input but produce different outputs. No coupling between them beyond reading the clock.

### Category 5 — UI/HUD Framework: Lit 3+ with Web Components

**Per UX design specification (§Implementation Approach, §Design System Components).** This decision is inherited from the UX spec's reasoned framework analysis; ADR records the rejection of React, Preact, Svelte, and the React-coupled headless a11y libraries.

**Decided here:**

- **Framework: Lit 3+** (~6 KB gzipped). Provides `@property` and `@state` reactive decorators, `html` template tag with efficient updates. Components extend `LitElement`.
- **Styling: vanilla CSS + CSS custom properties** as the design-token primitive (per UX spec §Design Tokens). Scoped via Shadow DOM stylesheets per component. No Tailwind, no CSS-in-JS, no preprocessors beyond PostCSS for autoprefixing.
- **Encapsulation:** Custom Elements + Shadow DOM where encapsulation pays off; Light DOM where chapter-copy content needs to inherit global typographic styles.
- **A11y primitives:** Hand-rolled WAI-ARIA APG patterns (slider for scrubber, listbox for chapter index, dialog for help overlay/About), plus `focus-trap` (~3 KB) and `tabbable` (~2 KB). Total third-party UI surface ≤5 KB.
- **Pointer/touch/keyboard:** Pointer Events API; single `primitives/pointer-events.ts` unifies mouse + touch + pen.

**Reactivity bridge to the service graph (supersedes the Category 2 note that mentioned `@preact/signals-core`):**

- **Inside components:** Lit's `@property`/`@state` decorators handle local reactivity.
- **Bridge from services to components:** Services expose `subscribe(callback)` APIs; components subscribe in `connectedCallback`, unsubscribe in `disconnectedCallback`. A `ServiceController<T>` (Lit Reactive Controller pattern) standardizes the wire-up so each component doesn't reimplement subscribe/unsubscribe boilerplate.
- **For 60-FPS HUD updates (date/distance counters):** Bypass Lit reactivity entirely. Register a per-frame callback with `RenderEngine.onFrame((et) => { this.dateEl.textContent = formatDate(et) })` and mutate DOM directly. Lit's reactive-property re-render path is for state that changes at human cadence (chapter title, instrument-shutoff legend toggles per-decade, CK/synth indicator transitions, embed-mode visibility).
- **No global store. No signals library. No event bus.** Service `subscribe` + Lit `@property` is the whole reactivity story.

**Components inventory (Web Components, kebab-cased custom-element names). Source-of-truth names match the UX Design Specification (UX-DR8–UX-DR19); the epics document references these names verbatim:**

- `<v-timeline-scrubber>` — timeline + chapter markers, primary control surface; configured by `variant="mission"` or `variant="detail"` attribute (UX-DR8, UX-DR31)
- `<v-hud>` — container that anchors its sub-components to viewport edges per the canvas-and-edges model (UX-DR9, UX-DR29)
  - `<v-hud-date>` — simulation date in UT (mono, tabular-nums)
  - `<v-hud-distance>` — per-spacecraft AU readout
  - `<v-hud-chapter-title>` — current chapter title (sans caps; fades on chapter change)
  - `<v-hud-speed>` — speed multiplier + human-friendly elapsed-time description
  - `<v-hud-instruments>` — per-spacecraft ISS · UVS · PLS · LECP legend with strikethrough on shutoff
- `<v-attitude-indicator>` — quiet provenance indicator (CK reconstructed vs Synthesized HGA Earth-pointing); rendered inline within `<v-hud>` (UX-DR10)
- `<v-chapter-copy>` — side-anchored editorial panel for chapter prose (UX-DR11)
- `<v-play-button>` — play/pause toggle button (UX-DR12)
- `<v-chapter-index>` — chapter index modal/listbox (UX-DR13)
- `<v-speed-multiplier>` — log-scale speed slider 1× to 1,000,000× (UX-DR14)
- `<v-audio-toggle>` — Golden Record on/off control (UX-DR15)
- `<v-help-overlay>` — keyboard shortcut help modal (`?` opens) (UX-DR16)
- `<v-fallback-page>` — browser-unsupported fallback (static; pre-rendered to inline HTML in `index.html` and `/unsupported.html`) (UX-DR17)
- `<v-about-page>` — About / methodology page at `/about` (UX-DR18)
- `<v-attribution-panel>` — `<dl>` of third-party source → license/usage statement; embedded within `<v-about-page>` and linked from a small footer "Attributions" link on the homepage (UX-DR19)

### Category 6 — URL + State Contract

**Decision 6a — Timestamp parameter format.** ISO-8601 UTC: `?t=1989-08-25T09:23:00Z`. Most human-readable; matches every NASA mission-events document; internal conversion to ET via a single well-tested function. Reject seconds-since-J2000 TDB (opaque); reject dual-encoding (over-engineered).

**Decision 6b — URL writeback strategy.**

- During scrub or time advance: `history.replaceState` (no history entry), debounced 250 ms.
- On chapter boundaries (entering or jumping to a new chapter): `history.pushState` so browser back-button navigates between chapters.
- ADR documents the boundary-detection rule.

**Decision 6c — Embed mode mechanics.** `?embed=true` is a strict-boolean parse — only literal `true` counts; any other value = false (per NFR-S7 strict-typed URL parameter parsing). `EmbedModeState` is read at boot and is immutable for the session. Every chrome Web Component reads it via constructor injection. ADR enumerates the full chrome-element list: site logo, share button, footer, chapter-index button, About link, methodology link, plus any future v1.1 toolbar/menu items.

**Decision 6d — OG card generation pipeline: Playwright headless against built site.**

- Reuses the L4 visual-regression Playwright harness already required for testing.
- A dedicated spec file `e2e/og-cards.spec.ts` navigates to each chapter URL with a deterministic `?ogCard=true` flag (which fixes the simulation at chapter anchor ET, hides chrome, applies any canonical-frame staging) and screenshots at 1200×630 to `web/public/og/<chapter-id>.png`.
- CI step runs after `vite build` and before `playwright test`, so the L4 spec then validates the live site against the same canonical frames used in OG cards (single source of truth).
- The `og/` directory is included in the deployed bundle; static `<meta property="og:image">` tags in each chapter's pre-rendered HTML shell reference it.
- **Agent-time complement: Chrome-DevTools MCP.** Playwright is the CI-time tool (unattended, deterministic, gated). Chrome-DevTools MCP is the agent-time tool (Claude Code sessions, interactive visual + perf work). They are complementary, not competing — the MCP cannot run in GitHub Actions, and Playwright is overkill for interactive dev. Detailed split documented in Batch 3 Category 8 (Observability & error posture).

**Decision 6e — URL contract versioning.** Chapter IDs frozen as of v1: `launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`. New chapter IDs in v1.1+ are additive; existing IDs are immutable. Parameter names (`t`, `embed`) and semantics are immutable across releases. Any breaking change requires a major URL-version bump and a CDN-level redirect map. ADR `0001-url-contract.md` records this as a public API.

**Decision 6f — Boot-time deep-link parse.**

- `URLSync.parseAtBoot()` returns `{chapterId?, et?, embed}`.
- If `chapterId` present: `ChapterDirector.setActive(chapterId)` → `ClockManager.scrubTo(anchorEt)` (unless `?t` overrides with a timestamp within the chapter window).
- If `?t` present alone: `ClockManager.scrubTo(parsedEt)`.
- If neither: `ClockManager.scrubTo(simStart = V2 launch 1977-08-20T13:29Z)`.
- All boot-time scrubs leave the simulation **paused** (per UX design spec — user explicitly clicks play when ready).
- ISO-8601 parse failures → fall back to chapter anchor (if chapterId valid) or simStart; never throw; never blank-screen.

**Decision 6g — Browser-unsupported fallback page.** A 1-KB inline pre-bootstrap script in `index.html` (runs before main bundle loads) probes for WebGL2, WebAssembly, and Brotli decoding. If any missing: `window.location.replace('/unsupported.html')` — a static page (FR57, NFR-C7) rendered at build time from the `<v-fallback-page>` Lit template into static HTML + inline CSS, no runtime JS execution required for the fallback to render. If all present: dynamic-imports the main bundle. ADR records probe details.

## Core Architectural Decisions — Batch 3: Operational Substrate

### Category 7 — CI/CD Topology

**Architectural shape:** GitHub Actions for the entire build pipeline; CDN purely for hosting. Decoupling build from hosting gives LFS-native checkout, deterministic build environment, and one workflow regardless of CDN provider choice.

**Decision 7a — CI runner: GitHub Actions, `ubuntu-22.04`.** Native Git LFS support; 2,000 free min/mo for private repos (3,000 with Pro), unlimited for public; deterministic build image; matches the linux/amd64 platform pinning for CSPICE wheel reproducibility (NFR-R4).

**Decision 7b — CDN hosting provider: deferred to Phase 0.** Both Cloudflare Pages and Vercel meet every requirement. Architecture is provider-agnostic — the build artifact is a static `web/dist/` directory deployable to either via a single `wrangler pages deploy` or `vercel deploy --prod` command. ADR `0016-cdn-provider-selection.md` will be authored during Phase 0 once concrete deployment trade-offs (LFS bandwidth costs for the bake-side; rollback UX during actual operational test; bandwidth tier headroom) can be measured rather than guessed.

**Decision 7c — CI job graph (single workflow, sequential by data dependency):**

```text
on: [push to main, pull_request]
job: validate-build-deploy (ubuntu-22.04)
  1.  Checkout (with LFS)
  2.  Setup Python 3.13 + uv          (cached)
  3.  Setup Node 22 + npm             (cached)
  4.  uv sync                         (Python deps from lockfile)
  5.  npm ci                          (Node deps from lockfile)
  6.  just verify-acquired            (SHA-verify LFS-tracked assets vs manifest)
  7.  just lint                       (ruff + eslint + prettier; fail-fast)
  8.  just bake                       (Python bake → VTRJ binaries + manifest)
  9.  just bake-determinism           (NFR-R4: re-bake; verify byte-identical)
  10. just test-fast                  (L1 + L2 + L3; ≤5 min budget per NFR-M4)
  11. just build                      (vite build → web/dist/)
  12. just og-cards                   (Playwright → web/dist/og/*.png)
  13. just test-slow                  (L4 + L5; ≤15 min budget per NFR-M4)
  14. just build-manifest             (NFR-M5: emit build-manifest.json artifact)
  15. just deploy                     (only on main branch; CDN provider CLI)
```

**Decision 7d — Drift report flow (FR53, NFR-M2 ≤30 min total).** Path-filtered workflow on PRs that modify `kernels/kernels-manifest.json`: runs `just drift-report --baseline=$BASE_SHA --current=HEAD` and posts a markdown comment with `max_drift_km` and `rms_drift_km` per body. CI auto-fails if `max_drift_km > 5` (FR54).

**Decision 7e — Deploy gates (FR55, FR56, FR58).**

- Deploys only from `main` branch
- Deploys only after every prior CI step is green
- Rollback (NFR-R3 ≤5 min): `just rollback <deployment-id>` invokes the CDN provider's rollback API; previous deployment becomes active; no rebuild

**Decision 7f — Caching strategy.** All built assets use content-hashed immutable filenames (`voyager-lod0.{hash}.glb`, `v1_1977-1987.{hash}.bin.br`). `Cache-Control: public, max-age=31536000, immutable`. HTML and entry-point JS use 1-hour TTL so deploys propagate quickly. Configured via `_headers` (Cloudflare) or `vercel.json` `headers:` block (Vercel).

### Category 8 — Observability & Error Posture

**Decision 8a — Analytics: zero, hard commitment.** No analytics, no cookies, no pixel tracking, no third-party scripts of any kind (FR50, NFR-S8). Trade-off recorded in ADR: lose usage visibility; gain zero PII surface, no consent banner, no GDPR/CCPA/COPPA work.

**Decision 8b — Error capture: localStorage-only.**

- `window.onerror` and `window.onunhandledrejection` handlers write to `localStorage.voyagerErrors`
- Capped at last 10 errors (FIFO); each entry `{timestamp, message, stack, url, userAgent}`
- A `/debug` route renders the log as readable text and provides a "copy to clipboard" button
- Bug reports: user pastes their localStorage error log
- Zero external dependency; zero PII surface; ~50 lines of code; survives the no-server commitment

**Decision 8c — Build-manifest observability (NFR-M5).** Every CI build emits `build-manifest.json` as a workflow artifact:

```text
{
  "buildCommit": "<sha>",
  "buildTimestamp": "<ISO-8601>",
  "assetSizes": {
    "firstPaintTotalCompressed": ...,
    "fullBundleTotalCompressed": ...,
    "byCategory": {"trajectories": ..., "attitudes": ..., "models": ..., "textures": ..., "audio": ..., "js": ..., "html": ...}
  },
  "kernelManifestSha256": "<sha of kernels-manifest.json>",
  "validationTolerances": {"maxPositionErrorKm": ..., "rmsPositionErrorKm": ...},
  "frameBudget": {"p50Ms": ..., "p95Ms": ..., "p99Ms": ...},
  "ciDurationSeconds": {"bake": ..., "testFast": ..., "build": ..., "testSlow": ..., "ogCards": ...}
}
```

Build manifests are git-trackable; PR diffs surface regressions in any reported value.

**Decision 8d — Dev `/perf` route (NFR-P7, NFR-P2 measurement).** Separate Vite entry point that loads the simulation in a measurement harness:

- Per-frame: trajectory interpolation cost, floating-origin recenter cost, draw call count, GPU rasterize duration (via `WebGL_disjoint_timer_query_webgl2` where supported)
- Output: live console + downloadable JSON dump
- Disallowed via `robots.txt`
- No production link to it from any chrome surface
- Primary consumers: Chrome-DevTools MCP during agent-time work; manual dev during interactive iteration

**Decision 8e — Chrome-DevTools MCP as canonical agent-time tool.** ADR `0010-mcp-vs-playwright.md` records the split:

| Context | Tool | Use cases |
| --- | --- | --- |
| **CI-time (unattended, deterministic)** | Playwright | OG card generation; L4 visual regression at 6 encounter scenes + launch + PBD; L5 E2E mission-timeline assertion |
| **Agent-time (Claude Code session, interactive)** | Chrome-DevTools MCP | Phase 0 reverse-Z precision spike; PBD scene visual iteration; performance profiling (NFR-P2 P95/P99); Lighthouse TTI audits (NFR-P3); WebGL state inspection during precision debugging; chunk-prefetch network inspection (NFR-P6); console error spot-checks during dev |

The MCP is the right tool when an AI agent is in the loop. Playwright is the right tool when CI is in the loop. Both are committed; neither replaces the other.

### Category 9 — Asset Pipeline & Licensing

Detailed expansion of the Batch-1 cross-cutting commitment to automated asset acquisition.

**Per-class acquisition tools:**

| Tool | Asset class | Sources | Verification | Derived assets |
| --- | --- | --- | --- | --- |
| `acquire_kernels.py` | NAIF SPK + CK + PCK + LSK + FK | NAIF FTP, PDS Rings Node | SHA-256 | (raw — no derivation) |
| `acquire_models.py` | Voyager 3D model | NASA 3D Resources OBJ/3DS | SHA-256 | Blender headless OBJ → clean GLB → gltf-transform `EXT_meshopt_compression` → toktx KTX2 texture re-encoding → LOD-tier outputs (`lod0.glb`, `lod1.glb`, `lod2.glb`, `impostor.glb`) |
| `acquire_textures.py` | Planet + moon textures | USGS Astrogeology, Björn Jónsson | SHA-256 | toktx → KTX2 UASTC (hero) / ETC1S (planets, skybox); per-body 4k and 8k variants |
| `acquire_photojournal.py` | NASA Photojournal images for PBD composite | photojournal.jpl.nasa.gov | SHA-256 | (raw PNG/JPG — compositing happens at render-time in the PBD scene) |
| `acquire_audio.py` | Voyager Golden Record audio | NASA archive | SHA-256 | ffmpeg → Ogg/Opus at target bitrate; ~30 MB compressed (NFR-P5) |
| `acquire_all.py` | Orchestrator | (delegates) | n/a | n/a |

**Common per-tool pattern:**

1. Read asset manifest entry: `{ source_url, expected_sha256, target_path, derived_assets: [...] }`
2. Check target path; if exists and SHA matches expected → no-op
3. Fetch with retry (3 attempts, exponential backoff)
4. Verify SHA-256 → fail loudly on mismatch (NFR-S5)
5. Place file in target path (LFS-tracked)
6. For each derived asset: run derivation tool (Blender headless, gltf-transform, toktx, ffmpeg) and verify derived SHA against expected
7. Emit machine-parseable JSON log line per asset

**Asset manifest schema (`assets/assets-manifest.json`, schemaVersion 1):**

```text
{
  "schemaVersion": 1,
  "kernels": [
    {"source_url": "...", "expected_sha256": "...", "target_path": "kernels/vgr1_super_v2.bc"}
  ],
  "models": [
    {"source_url": "...", "expected_sha256": "...", "target_path": "bake/inputs/voyager-raw.obj",
     "derived_assets": [
       {"tool": "blender-headless", "script": "scripts/clean-glb.py",
        "target_path": "bake/inputs/voyager-clean.glb", "expected_sha256": "..."},
       {"tool": "gltf-transform", "args": ["meshopt"],
        "target_path": "web/public/models/voyager-lod0.{hash}.glb", "expected_sha256": "..."}
     ]}
  ],
  "textures": [...],
  "photojournal": [...],
  "audio": [...]
}
```

**THIRD_PARTY.md content & UI binding (FR48, Domain-Specific Requirements):**

- `THIRD_PARTY.md` documents every asset class: source URL, license terms, attribution text, in-app appearance location
- Build-time script compiles `THIRD_PARTY.md` to `web/public/third-party.json` for runtime consumption
- `<v-about-page>` Web Component (with embedded `<v-attribution-panel>`) renders the JSON in the About page
- CI verifies `THIRD_PARTY.md` exists and is non-empty (Domain Requirements §Data Provenance & Attribution)
- Sources catalogued: NAIF, PDS Rings Node + Mitch Gordan (QMW SEDR), USGS Astrogeology, Björn Jónsson (attribution-required), NASA 3D Resources, NASA Planetary Photojournal, Voyager Golden Record

**Operational kernel-update flow end-to-end (FR53, NFR-M2 ≤30 min):**

1. NAIF publishes new kernel → developer or scheduled bot PR updates `kernels-manifest.json` `expected_sha256`
2. CI auto-runs: `just acquire-kernels` → `just bake` → `just drift-report --baseline=main --current=HEAD` (markdown comment to PR) → `just test-fast` → `just build` → `just og-cards` → `just test-slow`
3. Developer reviews drift report on phone if necessary
4. If `max_drift_km ≤ 5`, approve and merge
5. Merge to `main` triggers `just deploy`
6. New content-hashed asset filenames take over; immutable cache headers preserve old URLs

### Category 10 — ADR Catalogue Policy

**Decision 10a — Format: MADR (Markdown Architectural Decision Records).** Industry-standard; minimal sections: status / context / decision / consequences / alternatives. Template at `docs/adr/0000-template.md`.

**Decision 10b — Storage:** `docs/adr/NNNN-kebab-case-title.md` where `NNNN` is a 4-digit zero-padded sequence number.

**Decision 10c — Index:** `docs/adr/README.md`, auto-generated by `just adr-index` which scans the directory and produces a table-of-contents.

**Decision 10d — When an ADR is required:**

- Every entry in the technical research's "Rejected Technical Ideas" inventory (NFR-M1)
- Every "open question" decision made in this architecture workflow with real alternatives
- Every infrastructure or CDN-level decision
- Every change to the URL contract or other versioned public-API surface
- New ADRs added during implementation when a substantive trade-off is made
- ADRs are immutable once accepted; updates produce a _new_ ADR that supersedes the prior (status field: Proposed / Accepted / Deprecated / Superseded-by-NNNN)

**Decision 10e — Initial ADR catalogue (authored as Phase 0 work, before substantive code):**

| # | Title | Source |
| --- | --- | --- |
| 0001 | URL Contract as Public API | Decision 6e |
| 0002 | Floating-Origin + Reverse-Z over Logarithmic Depth | Tech research |
| 0003 | Cubic Hermite over Catmull-Rom for Trajectories | Tech research (R4) |
| 0004 | Custom VTRJ Binary over JSON / Protobuf / Arrow / Parquet | Tech research |
| 0005 | Build-Time SpiceyPy Bake over jsSpice-in-WebAssembly | Tech research (R9) |
| 0006 | EXT_meshopt_compression over Draco | Tech research |
| 0007 | SpiceyPy over astroquery.jplhorizons | Tech research |
| 0008 | Three.js WebGLRenderer over WebGPURenderer for v1 | Tech research |
| 0009 | No Web Workers for Trajectory Interpolation | Tech research |
| 0010 | Chrome-DevTools MCP for Agent-Time + Playwright for CI-Time | Decision 6d, 8e |
| 0011 | Git LFS for Kernel Storage + Auto-Acquisition Tool for Population | Decision 1a |
| 0012 | SCALE=1 km in Render-Space with Branded Vector Types | Decision 3a |
| 0013 | Lit 3+ Web Components over React / Preact / Svelte | UX spec + Decision 5 |
| 0014 | Hybrid Chapter Definition (Spec for 10, Module for PBD) | Decision 4a |
| 0015 | Service Graph + Lit Reactive Controllers (No Global Store) | Decision 2 |
| 0016 | CDN Provider Selection (deferred decision; authored in Phase 0) | Decision 7b |
| 0017 | GitHub Actions for Build + CDN for Hosting | Decision 7a |
| 0018 | OG Card Generation via Playwright Against Built Site | Decision 6d |
| 0019 | Zero Analytics; localStorage-Only Error Capture | Decision 8a, 8b |
| 0020 | MADR Format for ADRs; `docs/adr/` Location | This decision |
| 0021 | Chapter Copy in TS Template Literals (Not External MD Files) | Decision 4d |
| 0022 | Browser-Unsupported Fallback Page (Not Degraded Render) | Decision 6g |
| 0023 | Translation-Only View-Frame Blend (No Rotation Blend in v1) | Decision 4c |
| 0024 | Pre-Bake Quaternion Sign-Flip Walk | Tech research (R14) |
| 0025 | First-Party WAI-ARIA APG Patterns over Radix / Headless UI | UX spec |

## Implementation Patterns & Consistency Rules

The standard CRUD/API conflict points (database naming, REST endpoints, response wrappers) don't apply — there's no DB, no API, no REST. The real conflict points where AI agents (and even one agent across different parts of the codebase) could diverge are: type system, service shape, Web Component conventions, coordinate/unit conventions, time naming, file/test layout, asset URL shape, error/logging discipline.

### Naming Patterns

**Web Component element names: `<v-*>` prefix, kebab-case.**

- Locked: `<v-timeline-scrubber>`, `<v-hud>` (with sub-components `<v-hud-date>`, `<v-hud-distance>`, `<v-hud-chapter-title>`, `<v-hud-speed>`, `<v-hud-instruments>`), `<v-attitude-indicator>`, `<v-chapter-copy>`, `<v-play-button>`, `<v-chapter-index>`, `<v-speed-multiplier>`, `<v-audio-toggle>`, `<v-help-overlay>`, `<v-fallback-page>`, `<v-about-page>`, `<v-attribution-panel>`
- Class names: `VTimelineScrubber`, `VHud`, `VHudDate`, `VAttitudeIndicator`, etc. (PascalCase mirror of the element name, dropping the dashes)
- File names: `web/src/ui/v-timeline-scrubber.ts` (kebab-case; matches element name)

**Service class names: `<Noun>Manager` for owners of mutable state; `<Noun>Service` for pure stateless queries; `<Noun>Renderer` for rendering subsystems.**

- `ClockManager`, `ChapterDirector`, `ChunkLoader` (owners of mutable state)
- `EphemerisService`, `AttitudeService` (stateless queries — pure functions of `et`)
- `RenderEngine`, `BoresightRenderer` (rendering)
- File names: `web/src/services/clock-manager.ts` (kebab-case)

**Time variable naming: locked to one term per concept.**

- `et`: ephemeris time, seconds since J2000 TDB, Float64. Internal canonical time. Branded type `Et`.
- `iso`: ISO-8601 UTC string for human-facing or URL contexts. Branded type `IsoTimestamp`.
- `realDt`: real-world delta-t between frames, milliseconds, Float64.
- Forbidden: `tdb`, `timestamp`, `simTime`, `currentTime`, bare `t` outside math derivations.

**Coordinate frame: J2000 always.** Right-handed; X = vernal equinox, Z = ecliptic north. No other frame is permitted in `WorldVec3`. Per-encounter frames are render-space transforms, not world-space conventions.

**Unit naming: explicit in type, never in variable name.**

- `WorldVec3` = Float64 km. `RenderVec3` = Float32 km (post-recenter). `MeshLocalVec3` = Float32 meters.
- A `position: WorldVec3` is unambiguously F64 km. Forbidden: `positionKm`, `positionMeters`, `position_km`.
- AU appears only in HUD display formatting; never in math.

**Angle naming: radians internally; degrees only in UI presentation.** Type aliases `Radians = number`, `Degrees = number`. Quaternion convention: scalar-last `(x, y, z, w)` matching Three.js.

**NAIF body IDs: locked integer constants in `web/src/constants/body-ids.ts`.** Magic numbers in bake or runtime code are an ADR-violation; always reference the constant.

**Chapter IDs: locked as listed in Decision 6e.** New chapter IDs require an ADR update.

**Asset URL shape:**

- Content-hashed (cache-immutable): `{basename}.{hash}.{ext}` for trajectory/attitude binaries, models, textures
- Stable (not hashed): `og/{chapter-id}.png` — referenced by static `<meta>` tags that survive cache; deploy uses atomic blob replacement
- All asset URLs resolved through the manifest, never hardcoded

### Structure Patterns

**Test location:**

- TS unit tests (L3): co-located, `web/src/services/clock-manager.test.ts` next to `clock-manager.ts`
- Python tests (L1): centralized, `bake/tests/test_<module>.py` mirroring `bake/src/`
- Playwright (L4, L5, OG cards): centralized, `web/e2e/*.spec.ts`

**Web Component file structure: single file per component.** Class, styles, template all in one `.ts` file via Lit's `static styles = css\`...\`` and `render(): TemplateResult` patterns.

**Service file structure: one service per file.** No `utils.ts` dumping ground. Shared math goes in `web/src/math/` as single-purpose files (`hermite.ts`, `slerp.ts`, `floating-origin.ts`).

**Directory layout:**

```text
web/src/
├── main.ts                       # boot sequence
├── boot/
│   ├── gpu-capability-probe.ts
│   ├── feature-detect.ts         # WebGL2, WASM, Brotli probes
│   ├── error-capture.ts          # localStorage error handler
│   └── url-sync.ts
├── services/
│   ├── clock-manager.ts
│   ├── mission-phase-fsm.ts
│   ├── chunk-loader.ts
│   ├── ephemeris-service.ts
│   ├── attitude-service.ts
│   ├── view-frame.ts
│   ├── chapter-director.ts
│   └── audio-layer.ts
├── render/
│   ├── render-engine.ts
│   ├── boresight-renderer.ts
│   ├── voyager-camera-controller.ts
│   ├── trajectory-lines.ts
│   └── floating-origin.ts
├── ui/
│   ├── v-timeline-scrubber.ts
│   ├── v-hud.ts
│   ├── v-hud-date.ts
│   ├── v-hud-distance.ts
│   ├── v-hud-chapter-title.ts
│   ├── v-hud-speed.ts
│   ├── v-hud-instruments.ts
│   ├── v-attitude-indicator.ts
│   ├── v-chapter-copy.ts
│   ├── v-play-button.ts
│   ├── v-chapter-index.ts
│   ├── v-speed-multiplier.ts
│   ├── v-audio-toggle.ts
│   ├── v-help-overlay.ts
│   ├── v-fallback-page.ts
│   ├── v-about-page.ts
│   ├── v-attribution-panel.ts
│   ├── service-controller.ts     # Lit Reactive Controller bridge
│   ├── markdown-mini.ts          # tiny markdown subset → TemplateResult
│   └── primitives/
│       ├── pointer-events.ts
│       └── focus-trap-wrapper.ts
├── chapters/                     # 10 declarative chapter specs
│   ├── launch-v1.ts
│   ├── launch-v2.ts
│   ├── v1-jupiter.ts
│   ├── v2-jupiter.ts
│   ├── v1-saturn.ts
│   ├── v2-saturn.ts
│   ├── v2-uranus.ts
│   ├── v2-neptune.ts
│   ├── v1-heliopause.ts
│   └── v2-heliopause.ts
├── scenes/
│   └── pale-blue-dot/
│       ├── pale-blue-dot-scene.ts
│       ├── turn-choreography.ts
│       └── photo-plate-composite.ts
├── math/
│   ├── hermite.ts
│   ├── slerp.ts
│   ├── floating-origin.ts
│   ├── et-conversions.ts
│   └── world-vec3.ts             # branded-type constructors
├── types/
│   ├── branded.ts                # WorldVec3, RenderVec3, MeshLocalVec3, Et, NaifBodyId, ChapterId, IsoTimestamp
│   ├── manifest.ts               # AssetManifest schema types
│   └── chapter.ts                # ChapterSpec, ChapterModule interfaces
├── constants/
│   ├── body-ids.ts
│   ├── mission-facts.ts          # pinned timestamps, distances, instrument shutoffs
│   └── chrome-elements.ts        # embed-mode element list
└── url/
    └── url-codec.ts              # parse + serialize URL state
```

### Type System Patterns

**Branded types are mandatory at all precision-critical boundaries.**

```ts
// web/src/types/branded.ts
declare const __brand: unique symbol;

export type WorldVec3 = readonly [number, number, number] & { readonly [__brand]: 'WorldVec3' };
export type RenderVec3 = readonly [number, number, number] & { readonly [__brand]: 'RenderVec3' };
export type MeshLocalVec3 = readonly [number, number, number] & { readonly [__brand]: 'MeshLocalVec3' };
export type Et = number & { readonly [__brand]: 'Et' };
export type IsoTimestamp = string & { readonly [__brand]: 'IsoTimestamp' };
export type NaifBodyId = number & { readonly [__brand]: 'NaifBodyId' };
export type ChapterId = string & { readonly [__brand]: 'ChapterId' };
```

**Vectors are immutable.** Tuple types prevent Three.js `Vector3.copy()` mutation patterns from leaking into world-space math. Three.js's `Vector3` is permitted strictly within the render layer at one explicit conversion seam.

**Quaternions:** type alias `Quaternion = readonly [number, number, number, number]` (x, y, z, w scalar-last). Converted to `THREE.Quaternion` at the render boundary.

### Service Patterns

**Class shape — every service follows this:**

```ts
export class ClockManager {
  private listeners = new Set<(et: Et) => void>();
  private simTimeEt: Et;
  private rate: number;
  private playing: boolean;

  constructor(deps: {} = {}) {
    // Constructor takes a single `deps` object for DI; explicit and refactor-friendly.
  }

  tick(realDt: number): void { /* ... */ }
  setRate(x: number): void { /* ... */ }
  scrubTo(et: Et): void { /* ... */ }

  subscribe(listener: (et: Et) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
```

**Subscribe API: locked signature** — `subscribe(cb): () => void` returning an unsubscribe function. Forbidden patterns: custom event-emitter classes; `addEventListener('change', ...)` on services.

**Service singletons created in `main.ts`** via constructor injection. No service-locator, no DI container.

**Async boundary: only `ChunkLoader` returns promises.** Every other service is synchronous-per-frame. If a chunk is missing, the service returns nearest-available data and `ChunkLoader` emits `loading: true` (consumed by `ClockManager` for auto speed-cap).

**Pure-function services emit no side effects beyond logging.** `EphemerisService.getStateAt` is referentially transparent for any `et` within a loaded chunk; never logs in the hot path; never throws (returns last-known and signals loader).

### Web Component Patterns (Lit 3+)

```ts
import {LitElement, html, css} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {ServiceController} from './service-controller.js';

@customElement('v-timeline-scrubber')
export class VTimelineScrubber extends LitElement {
  static styles = css`
    :host { display: block; /* design tokens via CSS vars */ }
  `;

  @property({type: Boolean, attribute: 'embed-mode'}) embedMode = false;
  @state() private currentEt: Et = et(0);
  @state() private currentChapter: ChapterId | null = null;

  private clockCtrl = new ServiceController(this, clockManager, (et) => { this.currentEt = et; });
  private chapterCtrl = new ServiceController(this, chapterDirector, (c) => { this.currentChapter = c; });

  render() {
    return html`
      <div role="slider" aria-valuemin="..." aria-valuemax="..." aria-valuenow="${this.currentEt}">
        ...
      </div>
    `;
  }
}
```

**Property rules:**

- `@property({type: ...})` for HTML-attribute-reflected reactive properties (kebab-case attribute, camelCase property)
- `@state` for internal reactive state (no HTML attribute)
- No public class methods beyond Lit lifecycle and event handlers

**Lifecycle rules:**

- `connectedCallback()` super then create `ServiceController`s
- `disconnectedCallback()` super (Lit ReactiveControllers auto-tear-down)
- Forbidden: subscribing to services anywhere outside `ServiceController` instances

**Style rules:**

- All styles in `static styles = css\`...\`` — Shadow DOM scoped
- CSS custom properties are the only cross-component styling vector — `var(--v-color-*)`, `var(--v-font-*)`, `var(--v-space-*)`
- Forbidden: global stylesheets beyond the design-token layer; CSS-in-JS; Tailwind

**Component-to-component communication: via services or typed DOM custom events; never direct DOM-querying.** Custom event names are kebab-case (e.g., `chapter-select`); payloads typed via TS.

### Format Patterns

**Date/time formatting:**

- Internal: `Et` (Float64 seconds since J2000 TDB)
- URL/storage: `IsoTimestamp` (ISO-8601 UTC)
- HUD display: monospace tabular `1989-08-25 09:23 UT`
- Single conversion module: `web/src/math/et-conversions.ts` exposes `etFromIso(iso)`, `isoFromEt(et)`, `formatForHud(et)`. No other module performs time conversion.

**Distance formatting (HUD):**

- < 1 km: meters with 1 decimal (`123.4 m`)
- 1 km to 1 AU: km with no decimal for ≥1000, 1 decimal for <1000 (`456 km`, `78.9 km`)
- ≥ 1 AU: AU with 2 decimals for <1000 (`12.34 AU`), no decimals for ≥1000 (`12345 AU`)
- Single utility `formatDistanceForHud(km: number): string`

**Speed multiplier formatting:** `1×`, `10×`, `100×`, `1000×`, `1e6×` (UX spec).

**Chapter copy markdown subset:** italics (`_word_`) + line breaks (blank line = paragraph). No other markdown. Rendered by `<v-chapter-copy>` via `web/src/ui/markdown-mini.ts`.

### Error / Logging Patterns

**Boot-time errors (unsupported browser, missing manifest):** redirect to `/unsupported.html`. Never a degraded simulation (NFR-C7).

**Runtime errors:** `window.onerror` + `window.onunhandledrejection` handlers in `boot/error-capture.ts` write to `localStorage.voyagerErrors` (FIFO cap 10).

**Per-frame errors (inside render loop): never throw, never block.** R5 mitigation — silent degradation preferred over crash. Catch, log to localStorage, return last-known-good data. `getStateAt` etc. return nearest-cached and emit `degraded: true` rather than throw.

**Logging:**

- `console.log/info/debug` forbidden in production; behind `DEBUG` compile-time constant stripped by Vite
- `console.warn/error` allowed for genuinely unexpected states
- Bake-time Python: structured JSON to stdout, one record per line, machine-parseable

### Forbidden Patterns

Bright-line "never" rules:

- **No live network fetches at runtime beyond manifest-resolved URLs.** No analytics, no Sentry, no third-party scripts, no Google Fonts (self-host all fonts).
- **No mutation of branded vector instances** after creation. They are `readonly` tuples.
- **No magic numbers for NAIF body IDs, mission timestamps, chapter window edges.** Reference `constants/body-ids.ts`, `constants/mission-facts.ts`, `chapters/*.ts`.
- **No global state beyond declared services + `EmbedModeState` + `AccessibilityState`.** No `window.voyager = ...` patches.
- **No React, Preact, Vue, Svelte, RxJS, MobX, Redux, Zustand, Jotai, lodash, ramda, immer.** ESLint blocks the imports.
- **No CSS-in-JS, no Tailwind, no `styled-components`, no `emotion`.** UX spec-locked.
- **No `console.log` in production** (DEBUG-stripped).
- **No `document.querySelector` across Web Component boundaries.** Each component sealed; communication via services or typed custom events.
- **No URL state encoding beyond `chapterId`, `t`, `embed`.** URL is intent, not state.
- **No `eval`, no `new Function(...)`** (CSP-locked).
- **No `Float32Array` for trajectory/attitude data on the world-space side.** Use `Float64Array` for VTRJ; convert at the explicit render boundary.

### Enforcement

Patterns are enforced by tooling where possible:

- ESLint config blocks forbidden imports (React, Preact, Redux, etc.) and forbidden globals (`console.log` outside DEBUG, `window` patches)
- Prettier formats consistently
- TypeScript strict mode + branded types prevent precision-boundary mistakes at compile time
- ADR `0025-pattern-enforcement.md` enumerates which patterns are tool-enforced vs convention-enforced
- Pattern violations discovered during implementation: open an issue, fix the violation; if the pattern itself is wrong, write a new ADR superseding the prior decision

## Project Structure & Boundaries

### Structural Commitment: Bake → Web Copy via Explicit Step

Bake writes to `bake/out/`; a `just copy-bake-to-web` step copies the deliverables into `web/public/data/` before `vite build`. Web reads `data/manifest.json` at runtime relative to its own `public/` path. Rejected alternative: bake writes directly to `web/public/data/` — couples bake to web's directory layout; makes bake harder to invoke standalone or to split into a separate repo later if scope demands.

### Complete Project Directory Structure

```text
voyager/
├── README.md
├── LICENSE                              # code license (MIT recommended); assets carry their own
├── THIRD_PARTY.md                       # asset attribution surface (FR48)
├── MISSION_FACTS.md                     # pinned mission timestamps + distances (NFR-M3)
├── justfile                             # orchestration: just bootstrap | acquire | bake | dev | test | build | og-cards | deploy
├── .gitignore
├── .gitattributes                       # LFS patterns: kernels/**, bake/inputs/**, og/*.png
├── .editorconfig
├── .python-version                      # pinned 3.13.x
│
├── .github/
│   └── workflows/
│       ├── ci.yml                       # main CI (Decision 7c)
│       └── kernel-drift.yml             # path-filtered drift report (Decision 7d)
│
├── docs/
│   ├── adr/                             # MADR ADR catalogue (NFR-M1)
│   │   ├── 0000-template.md
│   │   ├── 0001-url-contract.md
│   │   ├── 0002-floating-origin-reverse-z.md
│   │   ├── 0003-cubic-hermite-over-catmull-rom.md
│   │   ├── 0004-vtrj-binary-format.md
│   │   ├── 0005-build-time-spiceypy-bake.md
│   │   ├── 0006-meshopt-over-draco.md
│   │   ├── 0007-spiceypy-over-jplhorizons.md
│   │   ├── 0008-webglrenderer-over-webgpu.md
│   │   ├── 0009-no-web-workers.md
│   │   ├── 0010-mcp-vs-playwright.md
│   │   ├── 0011-git-lfs-plus-acquisition-tool.md
│   │   ├── 0012-scale-and-branded-vectors.md
│   │   ├── 0013-lit-web-components.md
│   │   ├── 0014-hybrid-chapter-definition.md
│   │   ├── 0015-service-graph-no-store.md
│   │   ├── 0016-cdn-provider-selection.md       # authored in Phase 0
│   │   ├── 0017-github-actions-plus-cdn.md
│   │   ├── 0018-og-cards-via-playwright.md
│   │   ├── 0019-zero-analytics-localstorage-errors.md
│   │   ├── 0020-madr-format.md
│   │   ├── 0021-chapter-copy-in-ts-literals.md
│   │   ├── 0022-unsupported-fallback-page.md
│   │   ├── 0023-translation-only-blend.md
│   │   ├── 0024-pre-bake-quat-sign-flip.md
│   │   ├── 0025-pattern-enforcement.md
│   │   └── README.md                    # auto-generated by `just adr-index`
│   └── operational/
│       ├── kernel-update-flow.md        # FR53, NFR-M2 step-by-step
│       ├── deploy-flow.md
│       └── rollback-flow.md
│
├── kernels/                             # LFS-tracked NAIF kernels
│   ├── kernels-manifest.json            # SHA-256 hash-pinned manifest (FR52)
│   ├── frame-ids.md                     # FK frame catalogue (Phase 0 output)
│   └── (SPK/CK/PCK/LSK/FK files via LFS)
│
├── assets/
│   └── assets-manifest.json             # non-kernel asset manifest (models, textures, photojournal, audio)
│
├── bake/                                # Python build-time precompute
│   ├── pyproject.toml
│   ├── uv.lock                          # NFR-R4 byte-identical determinism
│   ├── ruff.toml
│   ├── src/
│   │   ├── __init__.py
│   │   ├── acquire_kernels.py           # automated; SHA-verifies vs kernels-manifest
│   │   ├── acquire_models.py            # NASA 3D Resources; Blender headless OBJ→GLB
│   │   ├── acquire_textures.py          # USGS + Björn Jónsson; toktx KTX2
│   │   ├── acquire_photojournal.py      # NASA Photojournal for PBD composite
│   │   ├── acquire_audio.py             # Voyager Golden Record; ffmpeg → Ogg/Opus
│   │   ├── acquire_all.py               # orchestrator
│   │   ├── bake_trajectories.py         # SPICE → VTRJ binary
│   │   ├── bake_attitude.py             # CK → VTRJ binary + HGA synthesis
│   │   ├── vtrj_writer.py               # custom 40-byte-header binary format
│   │   ├── drift_report.py              # FR53/54
│   │   ├── validate_l1.py               # L1 Python interpolation validation harness
│   │   └── manifest_writer.py           # emits bake/out/manifest.json
│   ├── tests/                           # L1 + Python unit tests
│   │   ├── test_vtrj_writer.py
│   │   ├── test_hermite_validation.py   # L1: SciPy vs SpiceyPy reference
│   │   ├── test_drift_report.py
│   │   └── test_acquisition_tools.py
│   ├── inputs/                          # LFS-tracked raw inputs landing zone
│   │   ├── models/                      # Voyager OBJ from NASA 3D Resources
│   │   ├── textures/                    # USGS + Björn Jónsson source images
│   │   ├── photojournal/                # NASA Photojournal raws
│   │   └── audio/                       # Golden Record source
│   └── out/                             # .gitignored; CI-only build artifact
│       ├── manifest.json
│       └── *.bin.br                     # VTRJ trajectory + attitude binaries
│
└── web/                                 # TypeScript SPA
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    ├── vite.config.ts                   # multi-page input for per-chapter HTML shells
    ├── playwright.config.ts
    ├── vitest.config.ts
    ├── .eslintrc.cjs                    # forbidden-import + no-console rules
    ├── .prettierrc.json
    ├── index.html                       # SPA entry shell + inline pre-bootstrap probe
    ├── unsupported.html                 # static fallback page (FR57)
    ├── perf.html                        # /perf route (robots-disallowed)
    │
    ├── public/                          # static, Vite-served as-is
    │   ├── robots.txt                   # disallow /perf, /debug
    │   ├── sitemap.xml                  # chapter URLs + /about
    │   ├── og/                          # per-chapter OG card PNGs (1200×630)
    │   │   ├── launch-v1.png
    │   │   ├── launch-v2.png
    │   │   ├── v1-jupiter.png
    │   │   └── ... (11 total)
    │   ├── data/                        # copied from bake/out before vite build
    │   │   ├── manifest.json
    │   │   ├── third-party.json
    │   │   ├── trajectories/*.bin.br
    │   │   └── attitudes/*.bin.br
    │   ├── models/                      # content-hashed GLB outputs (LOD tiers)
    │   ├── textures/                    # content-hashed KTX2 outputs
    │   ├── audio/                       # Ogg/Opus Golden Record tracks
    │   ├── photojournal/                # NASA images for PBD composite
    │   └── fonts/                       # self-hosted typography
    │
    ├── src/                             # detailed in Step 5 patterns
    │   ├── main.ts                      # boot sequence
    │   ├── boot/
    │   │   ├── gpu-capability-probe.ts
    │   │   ├── feature-detect.ts
    │   │   ├── error-capture.ts
    │   │   ├── embed-mode-state.ts
    │   │   ├── accessibility-state.ts
    │   │   └── url-sync.ts
    │   ├── services/
    │   │   ├── clock-manager.ts (+ .test.ts)
    │   │   ├── mission-phase-fsm.ts (+ .test.ts)
    │   │   ├── chunk-loader.ts (+ .test.ts)
    │   │   ├── ephemeris-service.ts (+ .test.ts)
    │   │   ├── attitude-service.ts (+ .test.ts)
    │   │   ├── view-frame.ts (+ .test.ts)
    │   │   ├── chapter-director.ts (+ .test.ts)
    │   │   └── audio-layer.ts (+ .test.ts)
    │   ├── render/
    │   │   ├── render-engine.ts
    │   │   ├── boresight-renderer.ts
    │   │   ├── voyager-camera-controller.ts
    │   │   ├── trajectory-lines.ts
    │   │   └── floating-origin.ts
    │   ├── ui/
    │   │   ├── v-timeline-scrubber.ts
    │   │   ├── v-hud.ts
    │   │   ├── v-hud-date.ts
    │   │   ├── v-hud-distance.ts
    │   │   ├── v-hud-chapter-title.ts
    │   │   ├── v-hud-speed.ts
    │   │   ├── v-hud-instruments.ts
    │   │   ├── v-attitude-indicator.ts
    │   │   ├── v-chapter-copy.ts
    │   │   ├── v-play-button.ts
    │   │   ├── v-chapter-index.ts
    │   │   ├── v-speed-multiplier.ts
    │   │   ├── v-audio-toggle.ts
    │   │   ├── v-help-overlay.ts
    │   │   ├── v-fallback-page.ts
    │   │   ├── v-about-page.ts
    │   │   ├── v-attribution-panel.ts
    │   │   ├── service-controller.ts
    │   │   ├── markdown-mini.ts
    │   │   ├── design-tokens.css        # CSS custom properties only
    │   │   └── primitives/
    │   │       ├── pointer-events.ts
    │   │       └── focus-trap-wrapper.ts
    │   ├── chapters/                    # 10 declarative chapter specs
    │   │   ├── launch-v1.ts
    │   │   ├── launch-v2.ts
    │   │   ├── v1-jupiter.ts
    │   │   ├── v2-jupiter.ts
    │   │   ├── v1-saturn.ts
    │   │   ├── v2-saturn.ts
    │   │   ├── v2-uranus.ts
    │   │   ├── v2-neptune.ts
    │   │   ├── v1-heliopause.ts
    │   │   └── v2-heliopause.ts
    │   ├── scenes/
    │   │   └── pale-blue-dot/
    │   │       ├── pale-blue-dot-scene.ts
    │   │       ├── turn-choreography.ts
    │   │       └── photo-plate-composite.ts
    │   ├── math/
    │   │   ├── hermite.ts (+ .test.ts)
    │   │   ├── slerp.ts (+ .test.ts)
    │   │   ├── floating-origin.ts (+ .test.ts)
    │   │   ├── et-conversions.ts (+ .test.ts)
    │   │   └── world-vec3.ts
    │   ├── types/
    │   │   ├── branded.ts
    │   │   ├── manifest.ts
    │   │   └── chapter.ts
    │   ├── constants/
    │   │   ├── body-ids.ts
    │   │   ├── mission-facts.ts
    │   │   └── chrome-elements.ts
    │   └── url/
    │       └── url-codec.ts (+ .test.ts)
    │
    ├── e2e/                             # L4 + L5 + OG cards
    │   ├── visual-regression.spec.ts    # L4: 6 encounters + launch + PBD
    │   ├── timeline-e2e.spec.ts         # L5: fast-forward 1977→2030 assertions
    │   └── og-cards.spec.ts             # Decision 6d
    │
    └── dist/                            # .gitignored; vite build output
```

### Architectural Boundaries

**Bake ↔ Web boundary.**

- Bake produces `bake/out/manifest.json` (versioned schema) and `bake/out/*.bin.br` (trajectory + attitude binaries).
- `just copy-bake-to-web` copies these into `web/public/data/` before `vite build`.
- Vite's content-hashing applies to the binaries during build, producing immutable cache-friendly filenames in `web/dist/`.
- Web runtime fetches `data/manifest.json` and reads body/chapter/cadence entries from there. The manifest is the only contract.

**Service ↔ Service boundary.**

- Communication: direct method calls via constructor-injected dependencies.
- Observable surface: `subscribe(callback) → unsubscribe` for `ClockManager`, `ChapterDirector`, `AttitudeService` (provenance changes), `MissionPhaseFSM` (phase transitions), `ChunkLoader` (loading state).
- Async boundary: only `ChunkLoader` returns promises. Everything else is synchronous-per-frame.

**Service ↔ UI Component boundary.**

- Components subscribe to services via `ServiceController` instances (Lit Reactive Controller pattern), set up in `connectedCallback`, torn down in `disconnectedCallback`.
- 60-FPS HUD updates (date/distance) bypass Lit reactivity entirely and mutate DOM directly under `RenderEngine.onFrame((et) => { ... })`.
- Components never call services directly outside Controllers.

**Web Component ↔ Web Component boundary.**

- Communication: through services (shared state), or via typed DOM custom events for transient signals (e.g., `<v-chapter-index>` dispatching `chapter-select`).
- Never direct DOM-querying across Shadow DOM boundaries.

**URL ↔ Simulation State boundary.**

- URL is derived from `ClockManager` + `ChapterDirector` state (via `URLSync` writeback).
- URL is intent, never authoritative state. Parsing happens once at boot.
- Strict-typed parsing of `t` (ISO-8601) and `embed` (literal `true` only) per NFR-S7.

**Asset acquisition ↔ Bake boundary.**

- `acquire_*` tools place raw inputs into `bake/inputs/<class>/` (LFS-tracked) and emit derived outputs into `web/public/<class>/`.
- Bake reads kernels from `kernels/` via SpiceyPy's path mechanism (separate from `bake/inputs/`).
- Bake produces `bake/out/manifest.json` referencing the asset-pipeline outputs by content hash.

### Requirements → Structure Mapping

| FR Cluster | Primary location(s) |
| --- | --- |
| Timeline & Playback (FR1–FR7) | `web/src/services/clock-manager.ts`, `web/src/ui/v-timeline-scrubber.ts`, `web/src/ui/v-play-button.ts`, `web/src/ui/v-speed-multiplier.ts` |
| Spacecraft & Trajectory Rendering (FR8–FR14) | `web/src/services/ephemeris-service.ts`, `web/src/render/{render-engine, trajectory-lines, floating-origin}.ts`, `bake/src/bake_trajectories.py` |
| Attitude & Instrument Visualization (FR15–FR20) | `web/src/services/attitude-service.ts`, `web/src/render/boresight-renderer.ts`, `web/src/ui/v-attitude-indicator.ts`, `bake/src/bake_attitude.py` |
| Encounter & Chapter Scenes (FR21–FR30) | `web/src/chapters/*.ts`, `web/src/scenes/pale-blue-dot/`, `web/src/services/{chapter-director, view-frame}.ts`, `web/src/ui/v-chapter-copy.ts` |
| Camera, View System & HUD (FR31–FR36) | `web/src/render/voyager-camera-controller.ts`, `web/src/services/view-frame.ts`, `web/src/ui/v-hud.ts` |
| Sharing, Embedding & URL System (FR37–FR42) | `web/src/boot/url-sync.ts`, `web/src/url/url-codec.ts`, `web/src/boot/embed-mode-state.ts`, `web/e2e/og-cards.spec.ts`, `web/vite.config.ts` (multi-page input for per-chapter HTML shells) |
| Audio, Accessibility & Methodology (FR43–FR50) | `web/src/services/audio-layer.ts`, `web/src/ui/v-audio-toggle.ts`, `web/src/boot/accessibility-state.ts`, `web/src/ui/v-about-page.ts`, `web/src/ui/v-attribution-panel.ts`, `THIRD_PARTY.md`, `web/public/data/third-party.json` |
| Build, Validation & Deployment (FR51–FR58) | `bake/src/*`, `bake/tests/*` (L1), `web/src/services/*.test.ts` (L2 + L3), `web/e2e/*.spec.ts` (L4 + L5), `kernels/kernels-manifest.json`, `bake/src/drift_report.py`, `.github/workflows/ci.yml`, `justfile` |

### Cross-Cutting Concern → Structure Mapping

| Cross-Cutting Concern | Location(s) |
| --- | --- |
| Time as singular truth | `web/src/services/clock-manager.ts` (owner); every per-frame consumer reads from it |
| Float64↔Float32 boundary | `web/src/types/branded.ts` (definitions); `web/src/math/floating-origin.ts` (cast point); `web/src/math/world-vec3.ts` (constructors) |
| CK-vs-synthesized provenance | `web/src/services/attitude-service.ts` (emitter); `web/src/ui/v-attitude-indicator.ts` (display, embedded in `v-hud`) |
| URL ↔ simulation state | `web/src/boot/url-sync.ts`, `web/src/url/url-codec.ts` |
| Asset chunking + prefetch | `web/src/services/chunk-loader.ts`; couples to `clock-manager.ts` (speed cap) and `view-frame.ts` (chunk windows) |
| 6-layer validation harness | L1: `bake/src/validate_l1.py`; L2: `web/src/**/*.test.ts` (JS-vs-SPICE samples); L3: `web/src/**/*.test.ts` (TS unit); L4: `web/e2e/visual-regression.spec.ts`; L5: `web/e2e/timeline-e2e.spec.ts` |
| Reduced-motion + WCAG | `web/src/boot/accessibility-state.ts` (global flag); every camera transition / scrubber animation / speed-ramp consumer reads it |
| Embed mode | `web/src/boot/embed-mode-state.ts` (global flag); every chrome Web Component reads it via attribute binding |
| GPU capability fallback | `web/src/boot/gpu-capability-probe.ts`; parameterizes `web/src/render/render-engine.ts` config |
| Automated asset acquisition | `bake/src/acquire_*.py` (six tools); `assets/assets-manifest.json` (truth source); `kernels/kernels-manifest.json` (kernel truth source) |

### Development Workflow Integration

**Bootstrap (first clone or fresh checkout):**

```bash
git clone --recursive ... && cd voyager
git lfs pull                  # fetches LFS-tracked kernels + raw asset inputs
just bootstrap                # runs: uv sync; npm ci; just verify-acquired
```

**Dev loop:**

```bash
just acquire                  # idempotent; no-op if SHA-matched
just bake                     # produces bake/out/manifest.json + binaries
just copy-bake-to-web         # bake/out → web/public/data/
just dev                      # vite dev server with HMR
```

**Test loop:**

```bash
just test-fast                # L1 (pytest) + L2 + L3 (vitest)  ≤5 min
just build                    # vite build → web/dist/
just og-cards                 # Playwright → web/public/og/*.png
just test-slow                # L4 + L5 (Playwright)            ≤15 min
```

**Deploy (only from main, only after green CI):**

```bash
just deploy                   # wrangler pages deploy (or vercel deploy --prod)
just rollback <deployment-id> # NFR-R3 ≤5 min
```

**Kernel update operational flow (NFR-M2 ≤30 min):**

1. NAIF publishes new kernel
2. PR updates `kernels/kernels-manifest.json` `expected_sha256`
3. CI runs `just acquire-kernels` + `just bake` + `just drift-report`
4. Drift report comment attaches to PR
5. Reviewer approves on phone if `max_drift_km ≤ 5`
6. Merge to main triggers `just deploy`

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All technology choices interoperate cleanly. TypeScript 5.x + Three.js ≥r170 + Vite + Lit 3+ have first-class mutual support. Python 3.13 + SpiceyPy 8.1.0 (released 2026-04-05) + uv + Ruff are version-aligned. Playwright + Vite-built `dist/` is the standard headless-browser pattern. GitHub Actions + Git LFS have native integration. Cloudflare Pages and Vercel both accept static `dist/` artifacts via their CLIs.

**Pattern Consistency:** No contradictions detected. Branded types + service-graph + DI + Lit Reactive Controllers + no-global-store + `<v-*>` Web Component prefix all reinforce each other. The 60-FPS DOM-mutation bypass for hot HUD elements is the one architectural concession to performance over uniformity; it is explicit and documented, not implicit.

**Structure Alignment:** The directory tree supports every named service, Web Component, chapter spec, render module, ADR, and CI workflow. Architectural boundaries (bake ↔ web, service ↔ UI, URL ↔ state, asset acquisition ↔ bake) are mapped to specific directory layouts and explicit copy/serialize steps.

### Requirements Coverage Validation ✅

**Functional Requirements (58/58 covered):** Every FR maps to a specific service, render module, Web Component, chapter spec, bake script, or CI workflow per the "Requirements → Structure Mapping" table. Cross-cutting FRs (FR19 CK/synth indicator, FR41 URL stability, FR45 keyboard parity, FR46 reduced motion, FR49 contrast/color-encoding, FR50 zero data collection) are mapped to single-owner cross-cutting concerns and the components that consume them.

**Non-Functional Requirements (46/46 addressed):**

- Performance (10 NFRs): floating-origin + reverse-Z + branded types address precision; LOD + chunking + speed cap address performance; Layer-1 validation harness gates accuracy; `/perf` route measures.
- Reliability (5 NFRs): CDN SLA inheritance, content-hashed immutable assets, single-command rollback, byte-identical bake determinism via pinned deps + CI check, 30-min session integrity via Web Component lifecycle hygiene.
- Security (9 NFRs): TLS + CSP + SRI + hash-pinning + dep advisory checks + strict URL parameter parsing + zero PII collection + zero cross-origin runtime fetches.
- Accessibility (8 NFRs): WCAG 2.2 AA enforced by design tokens + axe-core CI + WAI-ARIA APG patterns + keyboard parity + reduced motion + photosensitive-epilepsy safeguards + semantic markup + screen-reader floor.
- Compatibility (7 NFRs): browser tier matrix + boot-time feature detection + reverse-Z → log-depth GPU fallback + 8k → 4k texture fallback + static `unsupported.html` for older browsers.
- Maintainability (6 NFRs): ADR catalogue + 30-min kernel-update flow + `MISSION_FACTS.md` provenance + CI test-time budgets (5 min fast / 15 min slow) + `build-manifest.json` observability + anti-tech-debt discipline.
- Scalability (1 NFR): solved architecturally by static-CDN delivery.

### Implementation Readiness Validation ✅

**Decision Completeness:** All critical decisions documented with versions, alternatives, and rationale. 25-entry ADR catalogue scheduled as Phase 0 work. One genuinely deferred decision (CDN provider) explicitly recorded as "ADR 0016 authored in Phase 0" rather than left ambiguous.

**Structure Completeness:** Complete directory tree with all files and directories. Every service, Web Component, chapter, render module, and bake script has a specific path. The `web/src/` layout has 60+ files defined.

**Pattern Completeness:** Naming, structure, format, communication, and error/logging patterns all locked. Forbidden-pattern list is enforceable via ESLint rules + TypeScript strict mode + branded types.

### Gaps Addressed in Validation

The following gaps were found during validation and resolved inline. These resolutions supersede the corresponding parts of earlier sections:

**Gap 1 — Browser-unsupported fallback runtime-JS concern.** Resolution: the fallback page is authored as a `<v-fallback-page>` Lit template (UX-DR17, Story 1.8) but **rendered at build time** into static HTML with inline CSS — the deployed `unsupported.html` has no runtime JS dependency. If a user fails feature detection because their browser is too old, the static HTML still renders. The `web/src/ui/v-fallback-page.ts` source file remains in the structure tree as a build-time artifact; the deployed page is plain static HTML.

**Gap 2 — Design tokens CSS loading mechanism unspecified.** Resolution: `web/src/ui/design-tokens.css` is loaded via `<link rel="stylesheet" href="/design-tokens.css">` in `index.html`, `unsupported.html`, and `perf.html`. CSS custom properties (CSS variables) inherit through Shadow DOM boundaries, so every `<v-*>` Web Component reads `var(--v-color-*)`, `var(--v-font-*)`, `var(--v-space-*)` from its Shadow DOM scope without needing to re-import the tokens. Vite copies the file to `web/dist/design-tokens.{hash}.css` with cache headers on build.

**Gap 3 — L2 (JS-vs-SPICE consistency) fixture data flow unspecified.** Resolution: `bake/src/manifest_writer.py` emits `bake/out/fixtures/l2-samples.json` containing fixed-seed deterministic samples — randomly-chosen ETs across the mission span plus SPICE-true positions and quaternions at each. The fixture file is included in the bake→web copy step into `web/public/data/fixtures/`. The Vitest L2 suite (`web/src/services/ephemeris-service.test.ts`, `attitude-service.test.ts`) loads the fixture, runs the TS interpolation at each ET, and asserts agreement within NFR-P9 (≤20 km / ≤5 km RMS) and NFR-P10 (≤1 mrad) tolerances. The seed is committed; regeneration is deterministic.

### Architecture Completeness Checklist

#### Requirements Analysis

- [x] Project context thoroughly analyzed (Step 2: 58 FRs across 7 clusters, 46 NFRs across 7 quality attributes, 9 cross-cutting concerns)
- [x] Scale and complexity assessed (medium overall with high technical-precision spike; solo developer; ~14 services + 8 Web Components + 11 chapters)
- [x] Technical constraints identified (TypeScript + Three.js + Vite + SpiceyPy + Lit + Git LFS + GitHub Actions, all version-pinned)
- [x] Cross-cutting concerns mapped (Time-as-truth, Float64↔Float32, CK provenance, URL↔state, chunk prefetch, validation gates, reduced motion, embed mode, GPU fallback, automated asset acquisition)

#### Architectural Decisions

- [x] Critical decisions documented with versions (Batch 1, 2, 3 of Step 4)
- [x] Technology stack fully specified (Step 3 + Step 4)
- [x] Integration patterns defined (service graph, ServiceController bridge, manifest contract, URL codec)
- [x] Performance considerations addressed (floating-origin, reverse-Z, LOD, chunking, speed cap, branded types, `/perf` route)

#### Implementation Patterns

- [x] Naming conventions established (Step 5: `<v-*>`, `<Noun>Manager/Service/Renderer`, `et`/`iso`/`realDt`)
- [x] Structure patterns defined (co-located TS tests; centralized Python tests; single file per Web Component)
- [x] Communication patterns specified (subscribe API; ServiceController; typed custom events; never cross-Shadow-DOM querying)
- [x] Process patterns documented (boot errors → fallback; runtime errors → localStorage; per-frame errors → silent degradation)

#### Project Structure

- [x] Complete directory structure defined (Step 6; 60+ files with specific paths)
- [x] Component boundaries established (Step 6 boundaries section)
- [x] Integration points mapped (bake → web copy step; manifest contract; service → UI Controller bridge)
- [x] Requirements to structure mapping complete (FR cluster → directory table; cross-cutting concern → location table)

### Architecture Readiness Assessment

**Overall Status:** **READY FOR IMPLEMENTATION**

All 16 checklist items confirmed. No critical gaps. The three important gaps found during validation were resolved inline (unsupported-fallback HTML, design-tokens loading, L2 fixture flow). The one deferred decision (CDN provider) is explicitly scheduled as ADR-0016 in Phase 0 and does not block implementation — both Cloudflare Pages and Vercel accept the same `dist/` artifact via their respective CLIs.

**Confidence Level:** **High.**

The architecture rests on a substantial pre-research base — the technical feasibility research (~44K tokens of validated technology evaluation), the PRD (which pre-decided most of the load-bearing technology choices), and the UX design specification (which independently arrived at the same Web Components + vanilla CSS + Lit conclusion). This architecture is a synthesis of three rigorous upstream documents, not a fresh set of guesses.

**Key Strengths:**

- **Service-graph design fits the problem shape.** A 47-year mission replay is fundamentally a per-frame data pipeline, not a CRUD app. The architecture's shape (services + observables + Lit Reactive Controllers) matches that reality rather than imposing a SaaS template.
- **R5 (Float32 jitter) mitigation is type-system-deep.** Branded `WorldVec3` / `RenderVec3` / `MeshLocalVec3` make the precision-loss boundary explicit at the type-system level rather than relying on convention.
- **Asset-acquisition automation is a load-bearing commitment.** The "no manual download ever" principle threads through every asset class with concrete tooling (`acquire_kernels.py` through `acquire_audio.py`); it converts hands-off maintenance from a hope to a structural property.
- **Zero-server architecture.** No backend means no on-call rotation, no SLA, no operational dependency that erodes over years. The artifact survives the developer leaving.
- **6-layer validation harness with concrete CI budgets.** L1 Python validation against SPICE reference; L2 JS-vs-SPICE consistency via deterministic fixtures; L3 TS unit; L4 Playwright visual regression; L5 Playwright E2E mission timeline. Every layer has a specific file, a specific budget, and a CI gate.
- **ADR-first discipline.** 25-entry opening catalogue captures every decision-with-alternatives this workflow surfaced, plus every "rejected technical idea" from the technical research. Future-self (and future agents) can audit not just what was chosen but what was rejected and why.
- **Chrome-DevTools MCP + Playwright split formalized.** Agent-time vs CI-time tooling is documented as complementary rather than competing.

**Areas for Future Enhancement:**

- v1.1 features architected-for but not shipped: curated image plates, wide-angle boresight, broader PDS image archive, engineering/science data layers, Documentary/Cinematic toggle, mobile polish, multi-language localization.
- Phase 0 spike-specific deliverables (precision sanity check, Voyager 3D model articulation inspection, NAIF + PDS Rings Node CK inventory via `ckbrief`).
- Layer-6 (performance regression in CI) deferred to v1.1.
- The architecture is generalizable (the `EphemerisService` / `AttitudeService` / chapter-driven FSM interfaces would host any SPICE-kernel-backed historical mission), but mission extension is explicitly out of the v1 product story per the brief.

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented in this document.
- Use implementation patterns from §"Implementation Patterns & Consistency Rules" consistently.
- Respect project structure and boundaries from §"Project Structure & Boundaries."
- Reference ADRs in `docs/adr/` for decision rationale and alternatives.
- When new substantive trade-offs are made during implementation, author a new ADR rather than mutating an existing decision in code.
- For agent-time visual or performance work, use Chrome-DevTools MCP (`take_screenshot`, `evaluate_script`, `performance_start_trace`, `lighthouse_audit`); CI-time work uses Playwright.

**First Implementation Priority — Phase 0 Spike:**

```bash
# 1. Initialize the monorepo per Step 3 starter commands
mkdir voyager && cd voyager
git init
npm create vite@latest web -- --template vanilla-ts
uv init bake --python 3.13

# 2. Author the initial ADR catalogue (25 ADRs from the opening list)
mkdir -p docs/adr
# Author 0001-url-contract.md through 0025-pattern-enforcement.md

# 3. Phase 0 precision spike
# Set up Three.js WebGLRenderer with reverse-Z; render a 1 cm cube at the
# spacecraft and verify no z-fighting against a 165 AU far plane.
# Validate with Chrome-DevTools MCP visual inspection + a Playwright spec.

# 4. Phase 0 SpiceyPy spike
# Bake a small slice of V1's 1979 Jupiter approach trajectory; run
# bake/src/validate_l1.py to confirm Hermite interpolation matches SPICE
# within NFR-P9 tolerances (≤20 km / ≤5 km RMS).

# 5. Phase 0 asset inventory
# Run ckbrief inventory against vgr1_super_v2.bc and vgr2_super_v2.bc to
# determine PBD CK coverage (open question per technical research).
# Inspect NASA Voyager 3D model in Blender to confirm scan platform is
# separable (R12 mitigation).

# 6. Decide CDN provider (ADR 0016) based on Phase 0 deploy test.
```

After Phase 0 success criteria are met, Phase 1 (MVP cruise viewer) begins per the technical research's phased roadmap.
