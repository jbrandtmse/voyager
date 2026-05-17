# Voyager

> 🚧 **Planning phase.** This repository contains planning artifacts only — product brief, PRD, technical research, UX design specification. No source code yet. The implementation phase begins after the solution architecture document is complete.

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
| Runtime | TypeScript 5.x strict | Float64 native; modern ecosystem |
| 3D | Three.js (r170+) WebGLRenderer with reverse-Z depth | Sub-mm precision at AU scales |
| Bundler | Vite | Standard 2026 default |
| UI components | Vanilla TypeScript + Web Components (Lit 3+) | Zero framework runtime cost; aligns with long-lived canvas lifecycle |
| Styling | Vanilla CSS with custom-property tokens | Shadow-DOM-scoped; no Tailwind, no CSS-in-JS |
| A11y primitives | Hand-rolled WAI-ARIA APG patterns + `focus-trap`/`tabbable` (≤5 KB) | Bespoke visual register; no third-party UI library |
| Build-time data | Python 3.13 + SpiceyPy 8.1.0 + scipy + numpy | NAIF SPICE kernel extraction; cubic Hermite trajectory baking |
| Trajectory format | Custom 40-byte VTRJ header + Float64Array binary, brotli-compressed | ~3–5 bytes/scalar on wire; zero parse cost |
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
