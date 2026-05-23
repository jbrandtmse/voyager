---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
releaseMode: single-release
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-Voyager.md
  - _bmad-output/planning-artifacts/product-brief-Voyager-distillate.md
  - _bmad-output/planning-artifacts/research/initial-research.md
  - _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md
documentCounts:
  briefs: 2
  research: 2
  brainstorming: 0
  projectDocs: 0
workflowType: 'prd'
classification:
  projectType: web_app
  domain: scientific
  domainSecondary: aerospace
  complexity: medium
  projectContext: greenfield
---

# Product Requirements Document - Voyager

**Author:** Developer
**Date:** 2026-05-16

## Executive Summary

**Voyager** is a browser-based, narrative-driven cinematic replay of the Voyager 1 and Voyager 2 missions, from launch in 1977 through projected interstellar cruise in 2030. The entire mission unfolds along a single coherent time axis the user can scrub, pause, and zoom, at speeds from 1× real-time to 1e6× (full mission in ~50 seconds). The product is a static web artifact — no servers, no accounts, no installs — served from a global CDN with near-zero recurring cost.

The mission is treated as the protagonist, not as one entry in a multi-mission catalog. Trajectories derive from NASA NAIF SPK kernels via SpiceyPy; spacecraft attitude derives from CK kernels (sub-milliradian during encounter windows) with synthesized Earth-pointing cruise attitude clearly UI-labeled. The Pale Blue Dot reconstruction (1990-02-14) physically turns the spacecraft and sweeps the narrow-angle camera frustum across the inner solar system, compositing original NASA photo plates at the corresponding instants. Heliopause crossings (2012, 2018) appear as marked timeline cards.

**Primary user (design persona, not validated market segment):** the space-curious adult — someone who watched *For All Mankind*, owns *Pale Blue Dot*, reads long-form essays on planetary science. Secondary audiences (science educators) and tertiary audiences (museum and planetarium curators, especially around Voyager 1's 50th anniversary on 2027-09-05) are designed-with-in-mind but explicitly not gated.

**Problem being solved:** No existing product treats the Voyager mission as a cinematic, time-anchored, browser-accessible narrative. NASA Eyes on the Solar System treats Voyager as one mission of 150 in a generic sandbox. OpenSpace requires a desktop install and a planetarium-grade learning curve. Solar System Scope renders Voyager as a labeled dot. JPL's own Voyager site is static infographics. The gap is consistent and unfilled: a Voyager-exclusive, browser-first, narrative-anchored experience where the mission itself is the protagonist.

**Success is recognizable quality, not engagement metrics.** The Definition of Done is "linkable next to *Apollo in Real Time*, NYT long-scroll science features, and FWA Site of the Day Three.js winners without an apology," validated through 5–10 friendly first-time-user qualitative tests before launch. Trajectory accuracy is gated by a 6-layer validation harness (max position error ≤20 km, RMS ≤5 km vs. SPICE ground truth). Performance gate: 60 FPS on a mid-range laptop at 1280×720+.

### What Makes This Special

**Attitude is a first-class feature — the lede, not a footnote.** Every competing product treats spacecraft as positions on paths. Voyager renders what each probe was *looking at* — CK-reconstructed quaternions drive the narrow-angle camera's boresight cone, the scan platform articulates during flybys, the slow turn to take the Family Portrait happens onscreen. The tagline writes itself: **see what Voyager saw.** No current product delivers this.

**Mission-as-protagonist.** Voyager is not a feature of a planetarium; the planetarium is a feature of Voyager. Every design decision — chapter copy, camera choreography, timeline scaffolding, asset budget, typography — coheres around one mission's story. Multi-mission products structurally cannot make this commitment.

**Time as the spine of the experience.** The timeline scrubber is the primary control, not a buried setting. Chapter markers anchor the mission's natural beats (launch, Jupiter, Saturn, Uranus, Neptune, Pale Blue Dot, heliopause). Every chapter and every timestamp is a deep-linkable URL with pre-rendered Open Graph cards — sharing a timestamp shares a scene.

**Browser-first with portfolio-grade craft.** The visual register is *Apollo in Real Time*: silent, dignified, time-anchored, generous typography — applied to an unmanned mission for the first time. The bar is FWA / Awwwards / NYT long-scroll science features, not classroom edutech.

**Why now.** Voyager 1's 50th anniversary is 2027-09-05; NASA/JPL has been operationally pacing the spacecraft toward that date (2026 instrument shutoffs, thruster swaps framed as "making the 50th"). Cultural temperature is rising and elegiac. The technical substrate matured in 2025–2026: Three.js reverse-Z, SpiceyPy 8.1.0, live NAIF CK inventory for both probes. The anniversary is **opportunity timing, not a deadline** — the Definition of Done is the gate, not the date.

## Project Classification

| Dimension | Value | Notes |
| --- | --- | --- |
| **Project Type** | `web_app` | TypeScript + Three.js SPA, Vite-bundled, static CDN delivery (Cloudflare Pages or Vercel free tier). Desktop browser primary target (1280×720+); tablet functional; mobile polish deferred to v1.1. |
| **Domain** | `scientific` (aerospace-adjacent) | Scientific visualization of an aerospace mission. Domain concerns that apply: validation methodology, accuracy metrics, reproducibility, performance, computational resources. Domain concerns that do **not** apply: DO-178C, ITAR, FDA, HIPAA, PCI, safety-of-life. |
| **Complexity** | `medium` | **High** technical sophistication (sub-mm precision at AU scales, floating-origin, reverse-Z, cubic Hermite over position+velocity, SLERP over CK quaternions, custom binary trajectory format, asset pipeline). **Low** regulatory/compliance burden — NASA SPICE data is public domain; Björn Jónsson texture work is attribution-only. |
| **Project Context** | `greenfield` | No existing source code or product docs; only planning artifacts (product brief + distillate, initial research, technical feasibility research). The PRD defines v1 from scratch. |
| **Project Story** | Polished one-off about Voyager | Architecture is generalizable (`EphemerisService` / `AttitudeService` over a chapter-driven FSM) but mission extension is **explicitly not** part of the product story or success metrics. Whether the work seeds further missions is a decision made later, on the merits. |

## Success Criteria

### User Success

- **Primary success moment.** A first-time visitor with no priors hits play, scrubs from 1977 to the heliopause crossing, and comes away with a felt sense of the mission's arc — what happened, when, in what order, at what scale. This is the qualitative gate; the "aha!" is the realization that the cruise between Jupiter and Saturn took 18 months and that Voyager 2 spent another 8 years getting to Neptune. Validated through **5–10 friendly first-time-user sessions** before public launch.
- **Differentiator-validated moment.** The user reaches the Pale Blue Dot chapter (1990-02-14) or the Io flyby and observes the spacecraft *physically turn to look at* the target — not a cut, not a label, the act itself. If users do not notice the attitude reconstruction, the differentiator failed and the product is indistinguishable from NASA Eyes. The qualitative test must explicitly probe this.
- **Discoverability of depth.** A user who wants to dig deeper finds chapter copy, timestamps, and deep-linkable URLs at every moment of interest. Shareability is part of the user-success surface — a user sharing a Triton-flyby URL with a friend is a successful outcome.
- **Accessibility floor.** Keyboard navigation works for primary controls (play/pause, scrub, chapter jump). Reduced-motion preference disables the most aggressive camera transitions. Color is not the sole encoder of any chart, HUD element, or chapter marker. WCAG 2.2 AA color contrast on all text.

### Business Success

The brief is explicit: **success is recognizable quality, not engagement metrics**. Concretely:

- **Definition of Done — named references.** The finished v1 is linkable next to any of these without an apology:
  - [Apollo in Real Time](https://apolloinrealtime.org)
  - NYT long-scroll science features (Snow Fall, Cassini retrospective)
  - FWA Site of the Day winners in the Three.js / WebGL category
- **Distribution / signal of success.** Public launch posts to Hacker News, r/space, r/NASA, collectSPACE, Twitter/X. Inbound from NASA/JPL, the Planetary Society, or museums is treated as **bonus, not goal**. If the artifact earns institutional amplification through quality alone, that confirms the bet.
- **Anniversary opportunity.** Voyager 1's 50th anniversary (2027-09-05) is opportunity timing, not a deadline. A Q1–Q2 2027 launch positions the artifact ahead of the press cycle. A miss does not invalidate the project — the artifact stands on its own.
- **Cost discipline.** True recurring cost stays under ~$15/year (domain + CDN free tier). Build cost is the developer's own time; no third-party spend, no licensed assets, no SaaS dependencies.
- **Metrics tracked but not optimized for.** Shares, time-on-site, mentions from space-media accounts. Useful as signal that the artifact landed; treated as bonus, not as the goal.

### Technical Success

- **Trajectory accuracy.** Interpolated spacecraft position matches SPICE-derived ground truth within **max position error ≤20 km, RMS ≤5 km** across the full 1977–2030 mission window. (SPICE Voyager ephemerides themselves are only known to ~1–10 km; sub-meter precision is overkill.) Gated by **Layer-1 Python validation harness** (SpiceyPy + scipy.CubicHermiteSpline + numpy).
- **Attitude accuracy in encounter windows.** Spacecraft and scan-platform quaternions interpolated from CK kernels match the source within **≤0.05° (≤1 milliradian, ≤100 NA-pixel error)**. Synthesized Earth-pointing HGA cruise attitude is clearly UI-labeled as synthesized — not silently substituted for CK data. **Implementation note (Story 3.1, 2026-05-21):** the mission's variable-cadence schedule (10-sec near closest approach, 1-min through encounter, daily during CK-covered cruise) is stored inline as one VTRJ file per (spacecraft × kind × encounter) via explicit per-sample ETs in the body (`[et, qw, qx, qy, qz]` per sample). This keeps the SLERP knot positions mathematically exact — a uniform-cadence-with-linspace-reconstruction storage path would introduce up-to-π-radian SLERP error at the worst case where dense and sparse bands mix. See ADR 0004 § Body Layout per Kind for the canonical format contract.
- **Rendering performance.** Sustained **60 FPS on a mid-range laptop at 1280×720+** across all chapter scenes. P95 frame time ≤16.7 ms; P99 ≤22 ms. No frame >50 ms.
- **Precision under zoom.** Pixel-stable rendering from a sub-meter inspection of the Voyager spacecraft out to the heliopause (~165 AU far plane), validated by reverse-Z depth on Three.js WebGLRenderer. Zero z-fighting visible at any zoom level.
- **First-paint budget.** First interactive frame within **≤25–35 MB compressed** initial download on a typical broadband connection. Full asset complement (including Golden Record audio) stays under **150 MB compressed**.
- **Time-warp robustness.** Speed control from 1× to 1e6×. At 1e6× the full mission scrubs in ~50 seconds without main-thread starvation; chunk prefetch (last 10% of current chunk triggers next-chunk load) prevents stutter; speed caps automatically while loading.
- **Validation harness (6 layers).** Layers 1–5 are v1-launch gates (Python interpolation validation; JS-vs-SPICE consistency; TS numerical unit tests; Playwright visual regression at 6 encounter scenes + launch + PBD; Playwright E2E timeline assertion). Layer 6 (performance regression in CI) is v1.1.
- **Kernel integrity.** All NAIF kernels SHA-256 hash-pinned in `kernels/kernels-manifest.json`. CI verifies hashes. Kernel upgrade flow produces an explicit drift report; acceptance threshold `max_drift_km ≤ 5`.
- **Browser support.** Latest two stable versions of Chrome, Firefox, and Safari on desktop. WebGL2 + WebAssembly + Brotli decoding required (universal in 2026).

### Measurable Outcomes

| Outcome | Target | Measurement Method | Gate |
| --- | --- | --- | --- |
| Trajectory accuracy | Max error ≤20 km; RMS ≤5 km vs SPICE ground truth | Layer-1 Python validation harness (SpiceyPy + scipy.CubicHermiteSpline) | v1 launch |
| Attitude accuracy | ≤1 milliradian during CK-covered encounter windows | Layer-2 JS-vs-SPICE consistency on CK intervals | v1 launch |
| Frame rate | 60 FPS sustained; P95 ≤16.7 ms / frame | Performance API harness on `/perf` route, manual on mid-range laptop | v1 launch |
| First-paint payload | ≤25–35 MB compressed | CI asset-size check + Lighthouse | v1 launch |
| Full asset bundle | ≤150 MB compressed (with Golden Record) | CI asset-size check | v1 launch |
| Visual regression | 0 unintended diffs at 6 pinned encounter moments + launch + PBD | Playwright screenshot diff in CI | v1 launch |
| E2E mission timeline | 1× → 1e6× full-mission scrub passes event-sequence assertions | Playwright E2E test in CI | v1 launch |
| Definition-of-Done qualitative | 5–10 first-time users complete launch→heliopause and articulate the mission's story | Friendly-user testing sessions, structured exit interview | v1 launch |
| Reference parity | Linkable next to AiRT / NYT long-scrolls / FWA Three.js winners without apology | Solo-dev self-assessment + 2–3 trusted external reviewers | v1 launch |
| Kernel integrity | All NAIF kernels SHA-256 hash-pinned; CI verifies; drift report on update accepts only if `max_drift_km ≤ 5` | `kernels/kernels-manifest.json` + CI step | v1 launch |
| Cost discipline | Recurring spend ≤ $15/year (domain + CDN free tier) | Quarterly self-review | Ongoing |
| Layer-6 performance regression in CI | P95/P99 frame time tracked in CI with thresholds | Custom Performance API + CI baseline | v1.1 |

## Product Scope

### MVP — Minimum Viable Product (= the full v1)

The brief commits to the full v1 scope as the minimum we plan and deliver. There is no smaller "prove-the-concept" carve-out; the artifact must be the full mission to clear the recognizable-quality bar. The cut order documented under Risks later in the PRD is the *calendar-risk backout plan*, not a planned scope tier.

**Spacecraft & trajectory coverage:**

- **Both Voyager 1 and Voyager 2**, full trajectories from launch through 2030
- Per-decade trajectory binaries at daily cadence (cruise); 1-hour cadence on approach/departure (±30 days from closest approach); 1-minute cadence during flyby (±2 days); 10-second cadence at closest approach (±1 hour). Cadence is preliminary; tuned via Layer-1 Python validation to meet the ≤20 km / ≤5 km tolerances.

**Encounter coverage — all four gas giants:**

| Encounter | Spacecraft | Closest Approach Date (UT) | Key Moonlets / Hero Beats |
| --- | --- | --- | --- |
| Jupiter | Voyager 1 | 1979-03-05 12:05 | Io volcano discovery; Amalthea, Europa, Ganymede, Callisto over 48 hours; ring discovery |
| Jupiter | Voyager 2 | 1979-07-09 22:29 | Callisto, Ganymede, Europa, Io sequence (Story 4.6 Rule-5 amendment — V2 did not make a close Amalthea pass; the original draft of this row read "...Europa, Amalthea sequence" but per NASA SP-439 Appendix A the V2 inbound sweep was the four Galilean moons, with Amalthea a V1-only close encounter) |
| Saturn | Voyager 1 | 1980-11-12 23:46 | Titan close flyby at 6,490 km — the slingshot that ends V1's planetary tour |
| Saturn | Voyager 2 | 1981-08-26 | Iapetus, Hyperion, Titan flybys |
| Uranus | Voyager 2 | 1986-01-24 | Miranda flyby at 29,000 km + Ariel/Umbriel/Titania/Oberon; 11 new moons discovered |
| Neptune | Voyager 2 | 1989-08-25 | Triton flyby at 39,800 km that bends V2's trajectory sharply south of the ecliptic |

**Attitude reconstruction (the differentiator):**

- **CK-reconstructed attitude** during encounter windows for both spacecraft (~1 milliradian accuracy). Sourced from NAIF `vgr1_super_v2.bc` and `vgr2_super_v2.bc` consolidated CK files, supplemented by PDS Rings Node CK products per Phase 0 `ckbrief` inventory.
- **Articulated scan platform** during encounters — the platform turns and the narrow-angle camera's boresight cone sweeps real targets (Io's volcanoes during V1 Jupiter; Titan during V1 Saturn; Triton during V2 Neptune).
- **Synthesized Earth-pointing HGA cruise attitude** for periods outside CK coverage. **UI clearly labels synthesized vs CK-derived attitude** at all times — synthesized data is never silently substituted.
- Quaternion sign-flip walk pre-bakes CK data to prevent SLERP artifacts at knots.

**Pale Blue Dot reconstruction (1990-02-14):**

- The spacecraft physically turns; the narrow-angle camera frustum sweeps Venus → Earth → Jupiter → Saturn → Uranus → Neptune in the historical sequence.
- Original NASA photo plates composite into the scene at the corresponding instants.
- If `vgr1_super_v2.bc` does not cover the PBD window (uncertain — Phase 0 `ckbrief` inventory determines), the chapter is reconstructed by synthesizing "point camera at Earth + each target body" from SPK + known FK constraints, with UI labeling reflecting the synthesis.

**Heliopause crossings:**

- V1 (2012-08-25, ~121 AU) and V2 (2018-11-05, ~119 AU) appear as marked timeline cards with text callouts (cosmic-ray spike, solar-wind drop). Necessarily textual — the heliopause is a plasma boundary with no visual signature.

**Timeline & controls:**

- Timeline scrubber as the **primary control surface**, with chapter markers anchoring mission beats: Launch (V1, V2), all six encounters, Pale Blue Dot, both heliopause crossings.
- Speed control from **1× through 1e6×** (1e6× scrubs the full mission in ~50 seconds). Speed caps automatically while chunks are loading; neighbor-chunk prefetch fires in the last 10% of the current chunk to prevent stutter.
- Pause / play / scrub-to-timestamp; deep-link any timestamp via URL.

**Camera & view-frame system:**

- **Blended view-frame transitions** during encounters — smoothstep over ±2 days slides the view origin from heliocentric to body-centered and back. Translation-only blend (no rotation), revisit only if Jupiter's tilt feels off.
- Default camera follows the action with cinematic framing; user can take direct control via orbit / zoom / pan.
- **Floating-origin** rendering — single `WorldGroup` whose position equals `-cameraWorldPos / SCALE` per frame, sweeping all children into camera-relative space.
- **Reverse-Z depth buffer** on Three.js WebGLRenderer for sub-mm precision at 10 m with the far plane at 165 AU.

**Instrument boresight visualization (NA camera only in v1):**

- Narrow-angle camera frustum cone (FOV 0.42° × 0.42°, half-angle 0.21°), driven by CK quaternion data during encounters.
- Wide-angle deferred to v1.1.

**HUD overlay:**

- Simulation date (UT)
- Distance from Sun (AU)
- Current chapter title
- Speed multiplier
- Instrument shutoff schedule reflected across both spacecraft (ISS, UVS, PLS, LECP)

**Deep-linking & sharing:**

- Every chapter and every timestamp produces a shareable URL.
- Pre-rendered Open Graph cards per chapter for social-share previews.
- URL scheme is part of the public API contract; v1.1 changes to URL shape must remain backward-compatible.

**Voyager Golden Record audio layer:**

- Toggleable diegetic audio, **off by default**.
- NASA public-domain source (~90 min total, ~30 MB compressed).
- Gently audible at chapter markers (launch, Pale Blue Dot, heliopause crossings). Distinct from spoken narration (which is deferred to v1.1+).

**Browser support:**

- Latest two stable versions of Chrome, Firefox, Safari on desktop at 1280×720+.
- WebGL2, WebAssembly, Brotli decoding required (universal in 2026).
- Tablet: functional (no commitment to polished UI).
- Phones: not optimized.

**Validation harness (6 layers, layers 1–5 in v1):**

- L1 Python interpolation validation vs dense SPICE reference (SpiceyPy + scipy.CubicHermiteSpline + numpy)
- L2 JS-vs-SPICE consistency (fixed-seed samples, Python bake → Vitest)
- L3 TS numerical unit tests (Hermite, time conversions, blend weights, manifest parsing)
- L4 Playwright visual regression at 6 pinned encounter moments + launch + PBD
- L5 Playwright E2E fast-forward 1977 → 2030 asserting event sequence
- L6 (Performance regression harness in CI) — v1.1

### Growth Features (Post-MVP) — v1.1

These are the brief's explicit deferrals. v1 architects for them but does not ship them.

- **Curated 20–40 hand-picked Voyager image plates** anchored to capture timestamps (curation, copy, and Björn Jónsson rights audit are the dominant work, not engineering)
- **Wide-angle camera boresight cone** (NA-only in v1; FOV 3.17° × 3.17°)
- **Broader PDS image archive** as scrubbable thumbnails along the timeline
- **Engineering / science data layers** — DSN contact windows; magnetometer plot overlays on the cruise/heliopause sections
- **Documentary / Cinematic mode toggle** — explicit accuracy-vs-storytelling transparency in the UI
- **Mobile / tablet polish** — works on tablet functionally in v1; phone optimization deferred entirely
- **Multi-language localization** — architected for in v1, not shipped
- **Layer-6 performance regression harness** in CI

### Vision (Future) — beyond v1.1

- **Spoken narration / voiceover** layer (distinct from the Golden Record audio)
- **Dedicated classroom mode** with hardened adoption gates (no install, no account, smartboard projection, low-density chapter copy alternative)
- **Live "where is Voyager now" telemetry overlay** (v1 ships a static last-known-position end-card stand-in; DSN-live integration is best-effort and explicitly out)
- **Additional missions** — Pioneer 10, Cassini, New Horizons, or any historical mission with SPICE kernels. The `EphemerisService` / `AttitudeService` / chapter-driven FSM architecture **permits this**, but mission extension is **explicitly not part of the product story**. The artifact stands alone, justified by Voyager alone. Whether the work seeds further missions is a separate product decision made later, on the merits.
- **Plasma roll maneuvers and non-imaging attitude events**
- **VR / WebXR mode**

## User Journeys

### Journey 1 — Maya, the space-curious adult (primary user, happy path)

**Persona.** Maya, 34, software designer in Brooklyn. Watched *For All Mankind* through twice. Owns *Pale Blue Dot* and Ann Druyan's *Cosmos*. Follows Phil Plait and Emily Lakdawalla on Bluesky. Reads long-form science features in *The Atlantic* and *Quanta*. Knows Voyager left the solar system; could not tell you what happened between Cape Canaveral and the heliopause.

**Opening Scene.** A Hacker News submission with the title "See what Voyager saw — a 50-year mission, in your browser" reaches the front page. Maya is on her couch with a laptop on a Thursday evening, idly scrolling. The HN thumbnail is a still frame of Voyager 1 turning back toward the inner solar system on 1990-02-14, narrow-angle camera frustum sweeping. She clicks.

**Rising Action.** The page loads in under three seconds on her home Wi-Fi. A title card holds for two beats — "Voyager. 1977 to 2030." — then dissolves into a wide shot of Cape Canaveral on 1977-09-05, Voyager 1 on the launch pad. The timeline scrubber sits at the bottom of the screen; chapter markers appear along it like vertebrae. There is no chrome, no modal asking her to sign up, no cookie banner she has to dismiss. She hits play. Time begins to move, slowly at first, then she nudges the speed multiplier and the camera follows Voyager 1 out past the asteroid belt. The HUD shows "1977-12-15 — overtakes Voyager 2" as the spacecraft icons pass each other.

**Climax.** She scrubs forward to 1979-03-05. The camera transitions from heliocentric view to a Jupiter-centered frame. The scan platform on Voyager 1's model turns — visibly turns — and the narrow-angle camera's cone aims at Io. She pauses. She didn't know the cameras could move. She zooms in and the model holds together at sub-meter scale. She unpauses; the cone sweeps from Io to Europa to Ganymede to Callisto in 48 simulated hours. She scrubs forward eleven years to 1990-02-14. The spacecraft turns back toward the inner solar system. The camera frustum sweeps Venus, Earth, Jupiter, Saturn, Uranus, Neptune — and at each one the original NASA photo plate composites into the scene. She has seen the Pale Blue Dot photo a hundred times. She has never seen the camera being aimed at it. She sits with that for thirty seconds.

**Resolution.** She copies the URL — it has the timestamp baked in — and sends it to her sister, who is a planetary scientist. The message is just the link and "look at this." She closes her laptop with a different felt sense of what those forty years actually were. The next morning her sister has texted back: "yes. exactly."

**Capabilities revealed.**

- First-paint asset bundle ≤35 MB compressed (loads on a normal connection in ≤3s)
- Title-card / opening-frame sequence with restrained typography
- Timeline scrubber as the primary control surface; chapter markers visible as discrete pins
- No account, no modal, no cookie banner, no install
- Speed multiplier control with smooth ramp from 1× to 1e6×
- Camera blended transition between heliocentric and body-centered frames (Pattern 4 in the technical research)
- Articulated scan-platform model with CK-driven narrow-angle camera boresight cone
- Sub-meter floating-origin precision under zoom (reverse-Z)
- Pale Blue Dot reconstruction with NASA photo-plate composite
- Deep-linkable URL with timestamp encoded; works when copy-pasted into messaging apps

### Journey 2 — Maya returns, depth-seeking (primary user, edge case)

**Persona.** Same Maya, three weeks later.

**Opening Scene.** Maya is preparing a tab for a friend's birthday dinner conversation — she's going to share the Triton flyby moment because it bent Voyager 2 sharply south of the ecliptic in a way she found hauntingly elegant. She opens her bookmarked URL but realizes she just bookmarked the homepage; she needs to find her way back to the specific moment.

**Rising Action.** She clicks the chapter index — visible as a small icon top-right. The chapters are listed: Launch (V1 / V2), V1 Jupiter, V2 Jupiter, V1 Saturn, V2 Saturn, V2 Uranus, V2 Neptune, Pale Blue Dot, V1 Heliopause, V2 Heliopause. She clicks "V2 Neptune." The simulation jumps to 1989-08-25; the camera transitions, the chapter copy appears in restrained typography to the left of the frame: "Triton flyby, 39,800 km. Gravity grabs the spacecraft and bends its trajectory sharply south of the ecliptic — Voyager 2 will never again cross the plane of the planets." She scrubs the timeline a few minutes forward to the exact instant Triton's gravity engages, and the spacecraft's path arcs visibly below the ecliptic plane. She copies the URL. It now contains both the chapter ID and the precise timestamp: `voyager.app/c/v2-neptune?t=1989-08-25T09:23Z`.

**Climax.** She pastes the link into the group chat. Open Graph card preview renders: the actual frame she was looking at, with the chapter title and timestamp. Her friends see the arc-of-trajectory image *before* they click. Two of them click.

**Resolution.** The link works for them. They land on the exact moment. The artifact has become a way of communicating about a specific historical second — not just "look at this site" but "look at *this*."

**Capabilities revealed.**

- Chapter index navigation surface
- Per-chapter URL scheme that is human-readable and stable
- Per-timestamp URL parameter, robust to deep-link from anywhere in the timeline
- Per-chapter Open Graph card pre-rendering (image + title + timestamp)
- Restrained typography for chapter copy that doesn't pull focus from the simulation
- Resumable simulation state — when a URL with a timestamp loads, the simulation initializes paused at that instant, not at launch
- Trajectory rendering that correctly shows the post-Triton ecliptic-plane bend (validation: Layer-1 Python harness against SPICE)

### Journey 3 — Marcus, the high school physics teacher (secondary user)

**Persona.** Marcus, 47, teaches AP Physics at a public high school in Columbus, Ohio. Tomorrow's lesson is on gravity assists. He has a textbook diagram and a YouTube clip that he's used for six years; he wants something better.

**Opening Scene.** It's Sunday night. Marcus is at his kitchen table prepping. He has the artifact open on his Chromebook (work device). He needs to know two things by the end of the hour: can he project this on the smartboard tomorrow, and can he show a gravity assist in a way that makes the physics legible without forty minutes of setup?

**Rising Action.** He scrubs to V2's 1979-07-09 Jupiter flyby. The camera enters the Jupiter-centered frame. The spacecraft's path curves around Jupiter — visibly accelerating into the inner system, visibly redirecting outward. The HUD shows distance from the Sun and the speed multiplier. He pauses at the bend and zooms in. The trajectory line is dashed before the spacecraft's current position and solid behind it. He pauses and rewinds. He plays at 100× and the gravity-assist bend becomes a single comprehensible motion in three seconds. He tries it on the smartboard projector connected over HDMI — the 1280×720 floor renders cleanly at projector resolution. There is no signup, no app to install on the school-managed Chromebook fleet.

**Climax.** Tomorrow's lesson works. He cues up the V2 Jupiter URL on his projector, plays the flyby twice — once at real-time, once at 1000× — and a student says "wait, so the planet is *pulling it* and *throwing it*?" Marcus has the deep-link bookmarked in the lesson plan. He didn't have to assign anything; the URL is the assignment.

**Resolution.** He bookmarks two more URLs for the next unit on the outer planets: V2 Uranus and V2 Neptune. He emails the homepage link to his department chair. He didn't validate as part of any classroom-product market — he just used the artifact because it worked.

**Capabilities revealed.**

- 1280×720 desktop floor renders cleanly on classroom projectors and managed Chromebooks
- No install / no account / no signup — works through institutionally-managed browsers
- Per-chapter URLs are robust bookmarks for lesson plans
- HUD legibility at projector distance (font sizing, contrast)
- Pause / scrub / variable speed control accessible via the timeline UI without keyboard shortcuts
- Trajectory line styling distinguishes past (solid) vs future (dashed) clearly — validates the gravity-assist physics visually

### Journey 4 — Dr. Hanno Reinhardt, museum curator (tertiary user)

**Persona.** Hanno, 56, curator of the planetary science wing at a science museum in Vienna. He's planning programming around Voyager 1's 50th anniversary in September 2027. He wants a free, browser-accessible Voyager companion that can be QR-coded onto an exhibit placard and embedded as an iframe in the museum's existing kiosk software.

**Opening Scene.** It's mid-2027. Hanno has a budget that does not include software development. He has 4 kiosks, an exhibit hall, and 7 months until the anniversary. He's been pointed at the artifact by a colleague at COSI in Columbus (whose Immersive Voyager VR exhibit launched in March 2026).

**Rising Action.** He opens the homepage on a desktop browser. He navigates to the about page (or however the artifact exposes attribution and embed information). He sees that the artifact is licensed permissively for non-commercial embedding, attribution clear. He sees that there is a `?embed=true` URL parameter that hides the chrome (logo, share button, footer) for kiosk display, and that any chapter URL can carry that parameter. He tests it: opens `voyager.app/c/pale-blue-dot?t=1990-02-14T00:00Z&embed=true` in a borderless browser window — the chrome is gone; only the simulation remains. He projects it on a kiosk. It works.

**Climax.** Six weeks later, four kiosks in the new "Grand Tour" exhibit are running deep-linked URLs of the artifact: Pale Blue Dot, V2 Triton, V1 Titan slingshot, V2 Neptune approach. Visitors scrub the timelines with the kiosks' touchscreen browsers. There is QR-code signage that links them to the standalone artifact for at-home exploration.

**Resolution.** Hanno emails the artifact author with thanks and an offer to credit. The author accepts the credit and declines payment. The artifact has earned institutional embedding through quality alone — exactly the outcome the brief predicted.

**Capabilities revealed.**

- `?embed=true` (or equivalent) URL parameter for chrome-less rendering in iframe/kiosk contexts
- All deep-linkable URLs respect the embed parameter
- Touchscreen-friendly timeline scrubber (functional on tablet, by extension on kiosk touch hardware)
- Attribution / licensing surface easily discoverable from the homepage
- Stable URL contract so museum signage doesn't break across releases
- No telemetry / no analytics requiring kiosk-side cookie banners (zero-data-collection posture)

### Journey 5 — The developer/maintainer, mid-2028 (operational journey)

**Persona.** The solo developer who shipped v1. The artifact has been live for fourteen months. NAIF has published an updated `vgr1_super_v2.bc` CK kernel that includes additional encounter-window coverage.

**Opening Scene.** A GitHub bot opens a dependency-style PR titled "Kernel update: vgr1_super_v2.bc — new SHA-256." The developer is on a train. They open the PR on their phone.

**Rising Action.** CI is running. The kernel update flow is well-trodden: the bot fetches the new kernel from NAIF, runs `ckbrief` to inventory coverage changes, runs the Layer-1 Python validation harness across the full mission, computes `max_drift_km` and `rms_drift_km` against the prior bake, and posts a drift report to the PR. The report says: `max_drift_km: 1.3, rms_drift_km: 0.3, coverage_delta: +14 days encounter window around 1980-Saturn`. Drift is well under the acceptance threshold of 5 km.

**Climax.** The developer approves the PR from their phone. CI rebakes the trajectory and attitude binaries, regenerates the asset manifest with new content-hashed filenames, runs Layer-2/3/4/5 tests (JS-vs-SPICE consistency, TS unit tests, Playwright visual regression at all 6 encounter scenes + launch + PBD, Playwright E2E mission-timeline assertion), and on green, auto-deploys to the CDN. Old asset filenames remain cached (immutable cache headers); new filenames take over. Zero user-visible disruption. The artifact is now using slightly more accurate Saturn-encounter attitude data; no chapter copy needed to change.

**Resolution.** The developer puts their phone down. The maintenance burden of this artifact is approaching zero — the substrate they built holds up. They open their actual job's Slack.

**Capabilities revealed.**

- Hash-pinned kernel manifest with SHA-256 verification in CI
- Automated kernel-drift report (max + RMS drift vs prior bake) on any kernel-update PR
- Acceptance threshold gating (`max_drift_km ≤ 5`) enforced by CI
- Layer-1 Python validation harness runnable on demand against new kernels
- Layers 2/3/4/5 tests runnable as a single CI gate, blocking on any failure
- Content-hashed immutable asset filenames with `Cache-Control: public, max-age=31536000, immutable`
- Static CDN deploy pipeline triggered on green CI (Cloudflare Pages or Vercel)
- No data migration / no backend / no database — kernel updates are deploy-and-done

### Journey Requirements Summary

The five journeys reveal capabilities clustered into the following capability areas — each maps to one or more functional requirements that will be enumerated in **Step 6 (Functional Requirements)**.

| Capability Area | Source Journey(s) | Notes |
| --- | --- | --- |
| **First-paint experience** | J1, J3, J4 | Sub-3s load on broadband; no chrome blockers; title-card sequence |
| **Timeline scrubber** | J1, J2, J3 | Primary control surface; chapter markers; speed control 1×–1e6× |
| **Chapter navigation** | J2 | Chapter index; per-chapter URLs; per-timestamp URLs |
| **Deep-linkable URL scheme** | J2, J3, J4 | Stable URL contract; pre-rendered OG cards; embed-mode parameter |
| **Camera & view-frame system** | J1, J3 | Heliocentric ↔ body-centered transitions; floating-origin; reverse-Z |
| **Attitude rendering** | J1 | Articulated scan platform; NA boresight cone driven by CK quaternions |
| **Pale Blue Dot scene** | J1 | Spacecraft turn + frustum sweep + NASA photo-plate composite |
| **Trajectory visualization** | J1, J2, J3 | Past-solid / future-dashed; gravity-assist bend visually correct |
| **HUD overlay** | J1, J3 | Date, distance-from-Sun, chapter title, speed multiplier — projector-legible |
| **Embed mode for institutions** | J4 | `?embed=true` chrome-less render; touchscreen-friendly scrubber |
| **Attribution & licensing surface** | J4 | Discoverable from homepage; NASA + Björn Jónsson attributions |
| **Zero-data-collection posture** | J4 | No analytics requiring cookie banners; no telemetry |
| **Build / bake pipeline** | J5 | SpiceyPy build-time precompute → custom binary → CDN |
| **Kernel update flow** | J5 | SHA-256 hash-pinning; drift report; acceptance threshold gating |
| **6-layer validation harness** | J5 | L1–L5 as CI gates in v1; L6 in v1.1 |
| **Static CDN deploy** | J5 | Content-hashed immutable filenames; Cloudflare Pages or Vercel |

## Domain-Specific Requirements

This is a **scientific visualization** product in the *aerospace-adjacent* space — a cinematic replay of a historical mission, not a navigation tool, not a research instrument. Many of the "aerospace" domain concerns from the BMAD classification catalog (DO-178C, ITAR, flight-software certification) **do not apply**. The concerns that do apply are inherited from `scientific`: validation methodology, accuracy, reproducibility, and intellectual honesty about what the artifact is and isn't.

This section captures only **domain concerns not already covered** under Success Criteria → Technical Success. For trajectory/attitude accuracy targets, validation harness details, and rendering precision, see that section.

### Data Provenance & Attribution

Every dataset and asset in the artifact carries explicit provenance. The artifact must surface this without burying it.

- **NAIF SPICE kernels** (trajectory SPK, attitude CK, planetary constants PCK, leap seconds LSK, frame topology FK) — sourced from `https://naif.jpl.nasa.gov/pub/naif/VOYAGER/`. NASA public domain. No attribution legally required; attribution included for traceability.
- **Supplementary CK products** from the PDS Rings Node at SETI (`https://pds-rings.seti.org/voyager/spice/ck.html`) — public domain, attribution to PDS Rings Node and (where relevant) Mitch Gordan (QMW SEDR work).
- **NASA 3D Resources** Voyager spacecraft model — public domain. Attribution included.
- **Planet textures** sourced from USGS Astrogeology Science Center (public domain, attribution) and **Björn Jónsson's planetary maps** (independent processing of Voyager-era plates — **attribution required**, license terms audited per asset).
- **Voyager Golden Record** audio source — NASA public domain (the Record is bolted to both spacecraft and is part of the mission's published record). Specific track selections audited for any encoded performance rights that might encumber distribution.
- **NASA Planetary Photojournal images** used in the Pale Blue Dot composite — public domain, attribution included.

A `THIRD_PARTY.md` (or in-app About panel) lists every source, every license, and every attribution requirement. Updated when assets change; CI verifies the file exists and is non-empty.

### Reproducibility of the Build

The artifact's scientific defensibility depends on a deterministic, auditable build process.

- **Hash-pinned kernels.** Every NAIF kernel SHA-256 hash-pinned in `kernels/kernels-manifest.json`. CI verifies hashes on every build. Hash mismatch fails the build.
- **Kernel upgrade flow.** A kernel update is a pull request that updates the manifest, triggers a re-bake, and produces a **drift report** (max position drift, RMS drift, coverage delta vs prior bake). Acceptance threshold: `max_drift_km ≤ 5`. Drift report attached to the PR for human review.
- **Bake reproducibility.** The Python bake step (SpiceyPy + custom binary writer) is deterministic given pinned kernels. Same kernels, same code, same compiler/interpreter version produce byte-identical trajectory and attitude binaries. CI verifies this via a check-the-checksum step.
- **Build-toolchain pinning.** `uv` for Python dependency locking; `npm`/`pnpm` lockfile for the TypeScript build. Specific Python version (3.13) and SpiceyPy version (8.1.0+) pinned. Three.js version pinned in lockfile.
- **Source-of-truth trail.** Every chapter's pinned timestamps, every encounter window, every flyby distance is sourced from primary mission documentation cited inline in code comments or a `MISSION_FACTS.md` reference. No values invented or rounded silently.

### Scientific Honesty Surface (UI commitments)

The artifact occupies a deliberate position between "documentary" and "interactive sandbox." This requires the UI to be honest about what's data vs synthesis vs cinematic license.

- **CK-derived attitude is labeled as such.** During encounter windows where real CK kernel data drives spacecraft and scan-platform orientation, the HUD displays a small indicator (e.g., `attitude: CK reconstructed`). The indicator is non-intrusive but discoverable.
- **Synthesized cruise attitude is labeled as synthesized.** Outside CK coverage windows, the Earth-pointing HGA attitude is computed from SPK + the known FK boresight constraint. The HUD indicator changes to `attitude: synthesized (HGA Earth-pointing)`.
- **Pale Blue Dot reconstruction labeling.** If `vgr1_super_v2.bc` covers 1990-02-14 (TBD via Phase 0 `ckbrief` inventory), the scene uses CK data and labels accordingly. If not, the scene synthesizes per-target pointing and labels accordingly. The chapter copy acknowledges the reconstruction posture either way.
- **Trajectory line styling carries semantic weight.** Past trajectory: solid. Future trajectory: dashed. This is not decoration — it reflects that *all* trajectory data is interpolation between samples, but past samples are observed/refined and future samples (post-2026, depending on kernel currency) are predicted.
- **Heliopause chapters are necessarily textual.** The heliopause is a plasma boundary with no visual signature. The chapter cards explicitly state this rather than fabricating a visual transition. Cosmic-ray spike and solar-wind drop are described, not drawn as effects.
- **Visual register matches the data quality.** Cinematic camera choreography is restrained — no lens flares, no orbital-mechanics-violating maneuvers, no invented sound effects. The artifact is allowed to be *beautiful*, not allowed to be *fictional*.
- **About / methodology page.** Discoverable from the homepage; explains the SPICE source, the CK-vs-synthesis distinction, the validation tolerances (≤20 km / ≤1 mrad), and links to the underlying technical research for any reader who wants to verify.

### Export Controls & Sensitivity Posture

This is a relevant *negative* requirement worth stating explicitly so downstream reviewers don't waste time on it.

- **No ITAR / EAR-controlled material.** The artifact uses only **published, historical, public-domain** NASA mission data. SPICE kernels for Voyager are unrestricted public release. The spacecraft 3D models are NASA public-release. No current-mission telemetry, no live navigation data, no classified or controlled material.
- **No defense or current-operations applications.** The artifact is historical retrospective; it does not produce ephemeris-grade output suitable for actual mission planning, does not interface with any active spacecraft, and is not represented as a navigation tool.
- **No personally identifiable data collection.** The artifact has no accounts, no analytics, no telemetry, no cookies (beyond purely-functional ones if any are unavoidable). No GDPR / CCPA / COPPA / FERPA surface area.
- **Static asset distribution.** Cloudflare Pages / Vercel free-tier hosting; no server-side processing of user input.

### Aerospace-Adjacent Concerns That Do NOT Apply (documented for clarity)

Listed so a reader from an aerospace-software background doesn't waste energy looking for these:

- **DO-178C software certification** — not applicable. This is visualization, not flight software.
- **ITAR / EAR** — not applicable (see above).
- **Functional safety / safety-of-life** — not applicable. Failure modes are visual glitches or wrong text, not loss of life or mission.
- **Real-time control loops / hard determinism** — not applicable. 60 FPS is a *user-experience* target, not a *control-system* hard real-time requirement.
- **Mission ops integration** — not applicable. The artifact does not connect to DSN, does not pull live telemetry, does not interface with JPL systems. (A v1.1+ "where is Voyager now" telemetry overlay is explicitly listed in Vision/Future and would be best-effort if ever attempted.)

### Risk Mitigations (Domain-Specific)

The full risk register (R1–R14) is enumerated in the technical research; risk content in this PRD is distributed across this section (domain-specific), **Innovation & Novel Patterns → Risk Mitigation**, and **Project Scoping → Risk Mitigation Strategy**. The *domain-specific* subset:

| Risk ID | Risk | Domain-specific mitigation |
| --- | --- | --- |
| R1 | NASA kernel updates silently shift positions | SHA-256 hash-pinning + drift report flow (see Reproducibility section) |
| R3 | 3rd-party asset licensing (Björn Jónsson textures, USGS, etc.) | `THIRD_PARTY.md` audit + per-asset attribution; CI check that the file exists |
| R11 | CK coverage gap surprises (V2 Uranus/Neptune, PBD window) | Phase 0 `ckbrief` inventory against NAIF + PDS Rings Node before encounter scenes are scoped |
| (new) | Misrepresentation as scientific instrument | Methodology / About page; explicit UI labeling of CK vs synthesized; chapter copy avoids overclaiming |
| (new) | Asset attribution drift over time | CI verification of `THIRD_PARTY.md` non-empty; quarterly manual audit during kernel-update flow |

## Innovation & Novel Patterns

This is a craft-driven, well-executed application of mature ingredients — not a research breakthrough. The novelty lives in **product positioning and commitments**, not in inventing new technology. Documenting that honestly here is more useful than overclaiming.

### Detected Innovation Areas

**1. "See what Voyager saw" — attitude-driven instrument visualization in a public browser product.**

To our knowledge, **no existing public product** drives instrument boresights from CK kernel data for a historical mission. NASA Eyes on the Solar System renders Voyager as a position on a path; OpenSpace requires a desktop install and shows attitude only in pre-scripted dome films; Solar System Scope renders Voyager as a labeled dot. The novel claim is not "we can interpolate CK quaternions" (anyone with SpiceyPy can) — it's "we made instrument-boresight visualization the *lede* of a public, browser-accessible, scrubbable experience." This is a packaging and positioning innovation, executed against existing technology.

**2. *Apollo in Real Time* applied to an unmanned mission.**

*Apollo in Real Time* (Ben Feist's work) is the gold standard for "mission as scrubbable, time-anchored, browser-accessible experience." It exists for Apollo. **It does not exist for any unmanned mission.** Treating Voyager as the protagonist of a single-mission scrubbable experience — instead of as one entry in a multi-mission planetarium catalog — is the positioning move. The unmanned exploration era has never had this register applied to it.

**3. Single-mission commitment as a design philosophy.**

Multi-mission products (NASA Eyes, OpenSpace, Solar System Scope, Celestia) structurally cannot make this commitment: a chapter copy that talks only about Voyager would feel partisan in a 150-mission product. By committing to one mission, the artifact earns coherence across chapter copy, camera choreography, asset budget, typography, and pacing — coherence that's invisible feature-by-feature but cumulative as quality.

**4. Build-time precompute → custom binary → static CDN architecture.**

The pattern is not new; the discipline of *committing* to it is. Many existing mission-visualization products got the architecture wrong: live JPL Horizons API calls at runtime (rate-limited, not designed for interactive viz); JSON or CSV trajectory storage (10–40 ms parse cost wasted at scale); CSPICE-in-WebAssembly attempts (jsSpice is dormant, weeks of effort for no runtime benefit). The artifact's commitment to **SpiceyPy bake → custom 40-byte VTRJ header + Float64Array binary + brotli → CDN free tier** is an architectural decision-set with the precision to be teachable: every piece is justified against an alternative that was actively considered and rejected (see technical research's "Rejected Technical Ideas" inventory). The novelty is the architectural discipline, not any single piece.

**5. Reverse-Z depth + floating-origin in Three.js WebGLRenderer for AU-scale precision.**

Three.js added reverse-Z support relatively recently (current as of 2025–26 — see [official demo](https://threejs.org/examples/webgl_reversed_depth_buffer.html)). The artifact applies it to astronomical-scale rendering: sub-millimeter precision at 10 m with the far plane at 165 AU, no z-fighting, no jitter, no early-Z penalty. The Three.js community has demonstrated reverse-Z; this artifact may be among the first public products to combine reverse-Z with floating-origin for a 47-year historical mission at AU scales.

### Market Context & Competitive Landscape

The brief's competitive landscape analysis (carried in full there) reduces to:

| Product | Strength | Why it doesn't fill the gap |
| --- | --- | --- |
| **NASA Eyes on the Solar System** | Most direct competitor; browser-based, has Voyager 1 & 2, time slider 1949–2049 | Voyager is 1 of 150 missions; experience is a sandbox with sidebar text; attitude data is shallow; multi-mission diluted focus |
| **OpenSpace** | Highest scientific fidelity; full SPICE integration; CK attitude support | Desktop install required; power-user UI; built for planetariums and pre-scripted dome films; no browser path |
| **Solar System Scope / Solar System 3D** | Browser, mobile-friendly, classroom-positioned | Voyager content is a labeled dot moving along a path |
| **Celestia / Universe Sandbox / SpaceEngine** | Physics sandboxes with broad celestial coverage | Sandboxes, not mission replays; Voyager is incidental |
| **JPL's Voyager site** | Beautiful elegiac visual register | Static infographics; no interactivity; "where are they now" counter only |
| **Apollo in Real Time** | The reference; gold standard for "mission as scrubbable time" | Exists only for Apollo manned missions |
| **COSI Immersive Voyager VR** (March 2026) | High-fidelity VR exhibit; institutional reach | VR-only; museum installation; not browser-accessible to the general public |
| **I, Voyager** (Godot-based, open source) | Strong amateur foundation; web export exists | No attitude data; community-tier polish; no narrative scaffold |

**The gap is consistent and unfilled.** A Voyager-exclusive, browser-first, narrative-anchored experience where the mission itself is the protagonist and the attitude data is the lead feature — does not exist as of this PRD's date.

### Validation Approach

Each innovation area has a validation path that's already wired into Success Criteria — listed here for explicit traceability:

**For "see what Voyager saw" as the lede:**

- 5–10 friendly first-time-user qualitative test sessions **explicitly probe whether users notice attitude reconstruction** (does the user observe the spacecraft "looking at" something, or do they just see a path?). If the differentiator is invisible to first-time users, the lede failed and the chapter copy / UI affordances need a redesign before public launch.
- This is the highest-stakes validation in the project. It is a launch gate.

**For *Apollo in Real Time*-class register:**

- "Linkable next to AiRT / NYT long-scrolls / FWA Three.js winners without an apology" is the Definition of Done. Validated by solo-dev self-assessment + 2–3 trusted external reviewers.
- Reference-parity test is qualitative but operable: if the artifact would look out of place adjacent to AiRT, it isn't done yet.

**For single-mission commitment:**

- Validated by the fact that no PR throughout development adds support for any other mission. The architecture remains generalizable (the `EphemerisService` / `AttitudeService` interfaces don't *prevent* extension), but the product story holds the line. This is a discipline test, not a technical test.

**For build-time precompute architecture:**

- 6-layer validation harness (L1–L5 in v1): L1 verifies interpolation accuracy vs dense SPICE reference (Python); L2 verifies JS-vs-SPICE consistency across the Python/Node boundary; L3 covers TS numerical unit tests; L4 visual regression at pinned moments; L5 E2E full-mission timeline assertion.
- Performance budget: first-paint ≤25–35 MB compressed, full bundle ≤150 MB, 60 FPS sustained P95 ≤16.7 ms.
- If any of these miss in CI, the architecture isn't paying off and the decision-set is re-examined.

**For reverse-Z + floating-origin precision:**

- Zero z-fighting visible at any zoom level (manual + Layer-4 Playwright visual regression at extreme zoom states — sub-meter inspection of Voyager body and 165 AU panoramic view).
- Branded types `WorldVec3` (Float64) vs `RenderVec3` (Float32) prevent the floating-origin math from silently introducing Float32 jitter (R5 mitigation).

### Risk Mitigation — Innovation-Specific

Risks where innovation could fail in a project-killing way:

| Risk ID | Risk | Innovation-relevant mitigation |
| --- | --- | --- |
| **R8** (the #1 most-likely killer per the brief) | **Solo-dev scope creep — "let me add Pioneer 10 too."** Innovation lives in commitment to one mission; the moment scope expands to a second mission, the positioning innovation dies. | Pre-declared cut order (see Project Scoping → Cut Order); architecture-permits-but-product-story-forbids posture on mission extension; the brief is explicit about this and the PRD inherits the discipline |
| **R11** | CK coverage gaps in V2 Uranus / V2 Neptune / Pale Blue Dot windows could leave the "see what Voyager saw" feature shallow precisely where the most iconic moments are | Phase 0 `ckbrief` inventory against NAIF + PDS Rings Node before encounter scenes are scoped; fallback synthesis path with explicit UI labeling |
| **R12** | NASA Voyager 3D model may be monolithic (no articulated scan platform) — the attitude differentiator depends on the model having a separable scan platform node | Phase 0 Blender inspection; half-day Blender split if monolithic |
| **R14** | Quaternion sign-flip artifacts at CK knots produce visible glitches in articulation — undermines the very feature the artifact is leading with | Pre-bake walk that flips when `dot(q_prev, q_curr) < 0`; visual regression catches any drift |
| (new) | Differentiator is invisible — users don't notice attitude is reconstructed; product reads as a NASA Eyes clone | The 5–10 friendly-user qualitative test is the gate; chapter copy explicitly draws attention to attitude (without lecturing); UI affordances (boresight cone, articulated platform) are visually prominent during encounters |
| (new) | Architectural-discipline drift over time (someone adds a JSON fallback, a live API call, a non-precomputed asset) | Architectural Decision Records (ADRs) for every "rejected technical ideas" entry from the technical research; CI checks that runtime code does not import network-API client libraries |

**Fallback if a specific innovation fails:**

- If the attitude differentiator is **technically infeasible** for some encounter (e.g., V2 Uranus CK coverage missing entirely and synthesis is unconvincing), that encounter degrades to a labeled timeline card without articulated boresight — the brief's cut-order escalation pattern. The product still ships.
- If reverse-Z proves unstable on some specific GPU family, the fallback is `logarithmicDepthBuffer: true` on Three.js WebGLRenderer (the 2024 standard before reverse-Z landed) — works, just less precise. Single-line change.
- If the first-paint budget cannot hold, planet textures degrade from KTX2 UASTC to ETC1S (already the lower tier of the asset pipeline), and 8k upgrades become opt-in rather than lazy-loaded.

## Web App Specific Requirements

### Project-Type Overview

Voyager is a **client-rendered single-page application** built on TypeScript + Three.js, bundled by Vite, and deployed as static assets to a global CDN. The application's runtime has **no server-side dependencies**: no API, no authentication, no database, no session state. All trajectory and attitude data is precomputed at build time and shipped as immutable binary assets. All user state (current timestamp, current chapter, playback state) lives in the URL and in client memory.

The deployment model is intentional: shipping as static assets to Cloudflare Pages or Vercel free tier puts the marginal cost of every additional user at effectively zero, removes a class of operational concerns (no uptime monitoring, no SLA, no on-call rotation), and lets the artifact survive without ongoing developer attention.

### SPA vs MPA Decision

**Decision: Single-Page Application** with client-side routing via the browser's `pushState` history API.

**Rationale:**

- The 3D canvas must persist across chapter changes — chapter navigation is *camera and view-frame transitions inside an already-running simulation*, not page navigations. Tearing down and rebuilding the WebGL context on each chapter would be operationally absurd and visually disruptive.
- Deep-linkable URLs are handled at boot: on initial load, the URL is parsed, the simulation initializes paused at the corresponding timestamp, and the camera is placed in the correct view-frame. No round-trip to a server is required.
- The static-CDN deploy model requires that *every* URL serve the same `index.html` (with the URL parsed client-side); this is straightforward to configure on Cloudflare Pages (`_redirects` file) and Vercel (`rewrites` config).

**Routing surface:**

| URL pattern | Behavior |
| --- | --- |
| `/` | Homepage; opens at simulation start (1977-08-20, V2 launch) or at a featured chapter |
| `/c/{chapter-id}` | Opens paused at the chapter's anchor timestamp |
| `/c/{chapter-id}?t={iso-8601}` | Opens paused at the specified timestamp (must fall within the chapter's window) |
| `?embed=true` (suffix on any URL) | Renders chrome-less for iframe / kiosk embedding |
| `/about` | Methodology, attribution, source links |
| `/perf` (dev-only, robots-disallowed) | Performance regression harness route |

Chapter IDs are human-readable and stable: `launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`.

### Browser Matrix

| Browser | Version target | Status | Notes |
| --- | --- | --- | --- |
| **Chrome (desktop)** | Latest 2 stable | **Tier 1** — primary dev/test target | Best WebGL2 driver path; cleanest dev tools |
| **Firefox (desktop)** | Latest 2 stable | **Tier 1** | Visual regression runs here in CI alongside Chrome |
| **Safari (desktop, macOS)** | Latest 2 stable | **Tier 1** | Required; Safari WebGL2 fully capable as of 2026 |
| **Chrome / Safari (tablet)** | Latest 2 stable | **Tier 2** — functional, not polished | Touch scrubber works; UI not phone-optimized |
| **Mobile Chrome / Safari** | Latest 2 stable | **Tier 3** — best-effort | Works at degraded asset tier; not a v1 commitment |
| **Edge (Chromium-based)** | Latest 2 stable | **Tier 1 by inheritance** from Chrome | Not separately tested |
| **Older browsers** | Pre-WebGL2, IE, legacy | **Unsupported** | Graceful "your browser does not support the artifact" landing page |

**Required platform capabilities (boot-time feature detection, with friendly degradation if missing):**

- WebGL2 (`getContext('webgl2')` must return non-null)
- `EXT_color_buffer_float` and depth-buffer support sufficient for reverse-Z (fallback to logarithmic depth if reverse-Z is unstable on a given GPU)
- WebAssembly (universal in 2026) — also gates the chunk loader's brotli decompression via a wasm polyfill (`brotli-dec-wasm`), per Story 1.16. *Amended 2026-05-20: previously this list included "Brotli decoding" as a separate capability; that was wrong — brotli was never standardized into the JS Compression Streams API (`DecompressionStream('br')` throws in all production browsers). Story 1.16 switched to a wasm polyfill which works wherever WebAssembly works. See `_bmad-output/implementation-artifacts/epic-1-retro-2026-05-19.md` § 3a.*
- `requestAnimationFrame` (universal)
- `pushState` / History API (universal)
- ResizeObserver (universal in 2026)
- `<canvas>` and `WebGLRenderingContext` cleanup paths to prevent memory leaks on chapter transitions

**If a required capability is missing:** the artifact shows a single-frame fallback page explaining the requirement and linking to up-to-date browser downloads. No partial / degraded simulation experience — that would mislead about what the artifact is.

### Responsive Design

**Floor commitment:** 1280×720 desktop browsers, fully polished.

**Breakpoint strategy:**

| Viewport range | Tier | Treatment |
| --- | --- | --- |
| `≥1920×1080` | Optimal | Designed-against; default proportions for chapter copy, HUD, scrubber |
| `1280×720` to `1919×1079` | Required | Layout proportions hold; HUD compacts gracefully; chapter copy panel narrows |
| `1024×768` (laptop / tablet landscape) | Functional | Scrubber and HUD work; chapter copy collapsible; some UI elements stack |
| `768×1024` (tablet portrait) | Functional | Touch-friendly scrubber; chapter copy in modal/drawer; not polished |
| `<768px` (phone) | Best-effort | Renders; usable; explicitly not v1-polished |

**HUD and chapter-copy layout:**

- HUD elements anchor to viewport edges (top-right for date/distance; top-left for chapter title; bottom for scrubber) and use CSS `clamp()` for size, not media-query stepping where smooth scaling suffices.
- Chapter copy panel uses CSS Grid for layout; collapses to a bottom-sheet on narrow viewports.
- The 3D canvas itself fills the viewport at all sizes; aspect ratio is responsive (orthographic / perspective FOV adjustments minimal).

**Touch interaction (tablet, kiosk):**

- Scrubber accepts pointer events (mouse + touch) via the Pointer Events API.
- Pinch-to-zoom on the canvas controls camera zoom (Tier 2 functional, not polished).
- No native iOS/Android gesture conflicts (e.g., scrubber drags do not trigger pull-to-refresh).

### SEO Strategy

The artifact is a portfolio piece, not a content-marketing surface. Heavy SEO investment is misallocated effort. The **minimum competent SEO posture** is:

- **Per-page `<title>` and `<meta name="description">`** rendered server-side (or pre-rendered at build) for each chapter URL. Examples:
  - `/` → `Voyager — A 50-year mission, in your browser.`
  - `/c/pale-blue-dot` → `Voyager — Pale Blue Dot (1990-02-14). The moment the spacecraft turned around.`
- **Open Graph and Twitter Card meta tags** per chapter URL with pre-rendered preview images (1200×630 PNG) generated at build time. Includes `og:image`, `og:title`, `og:description`, `og:url`, `twitter:card=summary_large_image`.
- **Static `index.html` per route** — Vite's build configuration generates an HTML shell for each chapter URL with chapter-specific meta tags inline, so social-share crawlers see the correct preview without executing JavaScript.
- **`sitemap.xml`** listing every chapter URL plus `/about`.
- **`robots.txt`** allowing all crawlers; disallowing `/perf` and any internal dev routes.
- **Structured data (JSON-LD)** with `CreativeWork` schema describing the artifact. Optional; do if cheap, skip if blocking.
- **No SSR for content.** The artifact's "content" is a 3D simulation — search engines and social crawlers consume the pre-rendered HTML shell and OG card; the simulation is for humans.

**Out of SEO scope:** keyword optimization, content-marketing blog, backlink strategy, schema markup beyond the basics. The artifact's discoverability path is the soft launch (HN, r/space, r/NASA, Twitter/X, collectSPACE) and word of mouth.

### Real-Time Behavior

**Rendering real-time: yes.** 60 FPS sustained; P95 frame time ≤16.7 ms. See Technical Success for the full performance budget.

**Network real-time: no.** No WebSockets, no Server-Sent Events, no live data feeds, no telemetry pings. The artifact is fully self-contained after the asset bundle loads. This is a deliberate architectural commitment — adding any live-data feature breaks the static-CDN deploy model and introduces an operational dependency that doesn't pay for itself.

**Asset streaming.** Trajectory and attitude binaries are chunked (per-decade trajectory files; per-encounter higher-cadence overlays) and prefetched in the last 10% of the current chunk. This is browser-cached, not real-time — the streaming behavior is bounded and predictable.

### Accessibility Approach

**Target: WCAG 2.2 AA.** Not a regulatory requirement (no Section 508, no ADA litigation exposure for a portfolio site) but the right floor for a portfolio piece that aspires to institutional embedding (J4, the museum curator journey). Measurable, testable accessibility requirements are enumerated under **Non-Functional Requirements → Accessibility**; this section describes the qualitative commitments and approach.

**Concrete commitments:**

- **Color contrast.** All text on background (HUD, chapter copy, scrubber labels, About page) meets WCAG 2.2 AA contrast ratios (4.5:1 for body text; 3:1 for large text and graphical UI components). Validated by automated check (axe-core) in CI plus manual review.
- **Color is not the sole encoder.** Chapter markers on the scrubber use shape + position + label, not just color. Past/future trajectory styling uses line-style (solid/dashed) + color, not color alone.
- **Keyboard navigation.** All primary controls keyboard-accessible:
  - `Space` — play/pause
  - `←` / `→` — scrub 1 unit (configurable scale)
  - `Shift+←` / `Shift+→` — scrub 10 units
  - `Home` — jump to mission start
  - `End` — jump to mission end (post-heliopause card)
  - `1`–`9` — jump to chapter N
  - `?` — show keyboard shortcut help overlay
- **Focus management.** Visible focus ring on all interactive elements. Focus order follows visual order. Focus restored sensibly when modals (chapter index, help overlay, About) close.
- **Reduced motion.** `prefers-reduced-motion: reduce` disables the most aggressive camera transitions:
  - Chapter-transition camera blends become instant cuts
  - Scrubber smooth-scroll becomes instant jumps
  - Speed multiplier ramp becomes instant
  - The simulation still plays at 60 FPS — only *additional* motion is reduced
- **Screen reader floor.** The artifact is fundamentally visual — there is no claim that a screen-reader user gets equivalent experience. However:
  - Page `<title>` updates on chapter change announce the chapter via screen reader
  - Primary controls have proper ARIA labels (`aria-label="Play"` etc.)
  - Chapter index is a semantically marked-up `<nav>` with `<button>` elements
  - About page is fully accessible text content
- **Captions / transcripts (Golden Record audio):** When Golden Record audio is enabled, a transcript / track list is available in the About page. The audio is diegetic, not narrative — it does not carry information that needs captioning, but the source-content disclosure belongs in About anyway.
- **No flashing content.** No strobing effects, no rapid-flash transitions that risk photosensitive epilepsy triggers.

### Performance Targets

Cross-referenced to **Success Criteria → Technical Success** for the canonical performance budget. Summary for the project-type section:

- 60 FPS sustained; P95 ≤16.7 ms; P99 ≤22 ms; no frame >50 ms
- First-paint bundle ≤25–35 MB compressed
- Full asset bundle ≤150 MB compressed (with Golden Record)
- Sub-3-second time-to-interactive on broadband
- Sub-mm rendering precision under zoom (reverse-Z + floating-origin)
- Time-warp at 1e6× scrubs full mission in ~50s without main-thread starvation

### Technical Architecture Considerations

**Frame topology of the rendering pipeline (per technical research):**

1. `ClockManager.tick()` produces `simTimeEt` from real Δt × user rate
2. `EphemerisService.getStateAt(et)` returns position + velocity for spacecraft and planetary bodies (cubic Hermite interpolation over baked SPK)
3. `AttitudeService.getQuaternionAt(et)` returns spacecraft and scan-platform quaternions (SLERP over baked CK; synthesized fallback outside CK windows)
4. `ViewFrame.getTransform(et)` computes the J2000-to-render-space transform for the current chapter / encounter blend
5. `WorldGroup.position` updates to `-cameraWorldPos / SCALE` (floating-origin recenter)
6. Three.js renders one frame at reverse-Z depth on the WebGLRenderer

**Decoupled simulation clock** governs all of the above; user-facing controls (play/pause/scrub/speed) interact only with `ClockManager`.

**Mission-phase FSM** (PRE_LAUNCH → CRUISE → JUPITER_ENCOUNTER → … → INTERSTELLAR) is *time-driven*, not event-driven; FSM state derives from `simTimeEt`. Governs active view-frame, default camera anchor, and which instruments are "active" for HUD purposes.

**Type-distinguishing branded vector types** (`WorldVec3` = Float64; `RenderVec3` = Float32) make the cast from astronomical-scale to render-scale explicit at the type-system level, mitigating R5 (Float32 jitter from a subtle bug in floating-origin math).

### Implementation Considerations

- **Build pipeline ordering.** Python bake (SpiceyPy → VTRJ binaries) runs first and produces a manifest. TypeScript build (Vite) consumes the manifest and bundles. Assets (textures, GLB models) processed by gltf-transform / toktx run independently and produce content-hashed outputs. CI runs bake → bundle → tests in a strict topological order.
- **Asset cache headers.** All asset URLs use content-hashed filenames (e.g., `voyager-lod0.{hash}.glb`). `Cache-Control: public, max-age=31536000, immutable`. HTML and entry-point JS use shorter TTLs.
- **No web workers in v1.** The technical research demonstrated that trajectory interpolation is sub-millisecond per frame; structured-clone cost across the worker boundary dominates. Workers are not used in v1. If profiling later shows a need, the interface is the swap seam.
- **No service worker / PWA in v1.** Adds complexity (offline support, update lifecycle, manifest, install prompt) without clear payoff for a portfolio piece. Architected-against; not shipped.
- **Bundle size discipline.** Vite production build with tree-shaking; manual chunking of Three.js subsystems where the default is suboptimal. Bundle analyzer reports run in CI; thresholds enforced on JS bundle (≤400 KB compressed).

### Skipped Concerns (per CSV `skip_sections`)

- **Native features** — not applicable. The artifact is browser-only; no native iOS/Android/desktop wrapper.
- **CLI commands** — not applicable to runtime. The *build* pipeline has a CLI (Python bake scripts, gltf-transform, toktx), but that's developer-facing tooling, not part of the product surface.

## Project Scoping

### Strategy & Philosophy

**MVP archetype: Experience MVP.** The success criterion is *experiential* — "a first-time user scrubs from launch to heliopause and comes away with the mission's story" — not problem-solving, platform-foundation, or revenue. The product's whole purpose is to produce a felt sense of the Voyager mission. A user who reaches the Pale Blue Dot chapter and pauses for thirty seconds *is* the success criterion. There is no "minimum problem-solving feature" to carve out smaller than the experience itself, because a partial experience fails to produce the feeling that justifies the artifact.

This is why the user has rejected an internal MVP/Growth split inside v1: **the experience IS the minimum viable product**, and the experience requires all six gas-giant encounters, both Voyagers, the Pale Blue Dot reconstruction, and the heliopause cards. Anything less is not v0.5 — it's something else entirely.

#### Resource Requirements

| Resource | Commitment | Source |
| --- | --- | --- |
| Engineering effort | ~6–9 weeks of *engineering substrate* | Technical research's phased roadmap |
| Polish effort | Additional ~6–12 weeks of *portfolio-quality polish* across six encounter scenes | Reviewer's honest estimate (the "hard 20%") |
| **Total realistic elapsed calendar** | **~3–5 months** for solo developer at portfolio polish | Brief's own estimate |
| Team size | **1 (solo developer)** | Author commitment |
| External dependencies | None at runtime; NAIF + USGS + Björn Jónsson at build-time | Domain Requirements section |
| Recurring cost | ≤ ~$15/year (domain + CDN free tier) | Brief |
| Build-time cost | Developer time only | Brief |

### Complete Feature Set (v1 — single release)

The full feature inventory is enumerated in **Product Scope → MVP — Minimum Viable Product (= the full v1)**. This section consolidates the must-have / nice-to-have analysis *within* v1 to characterize the cut order honestly: not as a planned scope partition, but as a pre-declared backout sequence if calendar pressure forces a real choice.

**Core User Journeys Supported in v1:**

All five journeys (J1–J5) — primary happy path, primary depth-seeking, secondary educator, tertiary museum curator, and operational developer/maintainer.

**Must-Have Capabilities (all of v1 is committed-must-have):**

The user has explicitly stated that the full v1 is the floor. Therefore, every item in Product Scope → MVP is a v1 must-have:

- Both Voyager 1 and Voyager 2, full trajectories 1977 → 2030
- All four gas-giant encounters with full CK-derived attitude articulation (V1 Jupiter, V2 Jupiter, V1 Saturn, V2 Saturn, V2 Uranus, V2 Neptune)
- Synthesized Earth-pointing HGA cruise attitude with explicit UI labeling
- Pale Blue Dot reconstruction
- Heliopause crossing chapter cards (V1 + V2)
- Timeline scrubber with chapter markers and 1× → 1e6× speed control
- Blended view-frame transitions during encounters
- Floating-origin + reverse-Z rendering substrate
- Narrow-angle camera boresight cone visualization
- HUD overlay (date, distance, chapter, speed, instrument-shutoff status)
- Deep-linkable URL scheme with pre-rendered OG cards
- Voyager Golden Record toggleable audio layer
- iframe-embed mode (`?embed=true`)
- WCAG 2.2 AA accessibility floor
- 6-layer validation harness (L1–L5)
- Hash-pinned kernel manifest with drift-report CI flow
- Static CDN deployment with content-hashed immutable assets

**Nice-to-Have-Within-v1 Capabilities (none):**

Per author commitment, v1 has **no "nice-to-have" partition**. Everything listed under v1 is must-have. The cut order below is a *backout sequence*, not a nice-to-have ranking.

**Deferred to v1.1 (explicitly NOT in v1 single-release):**

See **Product Scope → Growth Features (Post-MVP) — v1.1** for the enumerated list. These are a *separate future release*, not "later phase" within the v1 release.

### Cut Order (Calendar-Risk Backout Plan, NOT a Scope Partition)

The brief pre-declares an explicit cut order in case solo-developer calendar pressure forces real scope cuts during execution. **This is risk mitigation, not a planned partition.** The intent is: ship the full v1; the cut order exists only to convert "what gets dropped under pressure?" from an abstract anxiety into a managed decision sequence. The order proceeds least-essential to most-essential:

| Cut # | What gets dropped | Result |
| --- | --- | --- |
| **0 (baseline)** | Nothing — the full v1 ships | Target outcome |
| **1** | V2 Uranus (1986) + V2 Neptune (1989) full encounter scenes → demote to labeled timeline cards | V1 + V2 ship with Jupiter and Saturn encounters; Uranus/Neptune become richer cards |
| **2** | Voyager 2 entirely → V1-only ships; V2 becomes v1.1 "Completing the Tour" timed for the 2027 anniversary press cycle | V1 alone is a coherent product (Jupiter + Saturn + PBD + heliopause) |
| **3** | Saturn encounters for both spacecraft → only Jupiter is the hero encounter | Single-encounter v1; PBD + heliopause carry the rest of the experience |
| **4** | Instrument boresight visualization degrades from articulated cone to static cone | Differentiator weakens but the artifact still ships |

**Invocation discipline:** if cut #1 becomes necessary, the developer commits to the cut as a *single decision* and does not revisit. Re-litigating the cut order mid-execution is itself a scope-creep failure mode.

### Risk Mitigation Strategy

The full risk register (R1–R14) is enumerated in the technical research; PRD-specific additions appear inline in **Domain-Specific Requirements → Risk Mitigations** and **Innovation & Novel Patterns → Risk Mitigation**. For scoping purposes, the three risk categories that most directly threaten the v1-shipping commitment are:

**Technical risks (focus on the high-impact subset):**

- **R8 (most-likely killer): Solo-dev scope creep.** The brief identifies this as the #1 most-likely project killer. Mitigations: pre-declared cut order (above); explicit "polished one-off about Voyager" framing in product story; architecture-permits-but-product-forbids posture on mission extension; ADRs for every "rejected technical ideas" entry from the technical research.
- **R5 (silent-failure danger): Float32 jitter from a subtle bug in floating-origin math.** Most insidious technical risk because it can pass through tests but produce visible degradation under zoom. Mitigation: branded vector types (`WorldVec3` Float64 vs `RenderVec3` Float32) make the precision-loss point explicit at the type level; Layer-4 visual regression at extreme zoom captures regressions.
- **R11 (uncertainty risk): CK coverage gaps in V2 Uranus / V2 Neptune / Pale Blue Dot windows.** These are also the most iconic moments. Mitigation: Phase 0 `ckbrief` inventory against NAIF + PDS Rings Node *before* encounter scenes are scoped; fallback synthesis path with explicit UI labeling preserves shippability even with gaps.
- **R12 (binary-success risk): NASA Voyager 3D model may be monolithic.** The differentiator depends on a separable scan platform node. Mitigation: Phase 0 Blender inspection; half-day Blender split if monolithic; documented in `ASSETS.md`.

**Market risks (modest because success criteria are not market-driven):**

- **Primary persona is unvalidated as a market segment.** The "space-curious adult who wants to be moved" is a *design persona*, not a market segment with measured demand. Mitigation: success criteria are *recognizable quality* and *qualitative-user-test pass*, not market metrics. If the artifact is recognizable-quality and zero users come, the artifact still cleared its own bar. Soft-launch distribution path (HN, r/space, r/NASA, collectSPACE, Twitter/X) gives reasonable visibility without institutional outreach burden.
- **Anniversary timing slippage.** The 2027-09-05 Voyager 1 50th anniversary is opportunity timing, not a deadline. A miss does not invalidate the project — it just removes a press-cycle tailwind. Mitigation: Definition of Done is the launch gate, not the date. Cut order exists to preserve a quality bar even under calendar pressure.
- **The differentiator is invisible to first-time users.** If users don't *notice* the attitude reconstruction, the product reads as a NASA Eyes clone. Mitigation: 5–10 friendly-user qualitative test specifically probes this; chapter copy draws attention to attitude without lecturing; UI affordances (articulated platform, boresight cone) are prominent during encounters.

**Resource risks (acute because this is a solo project):**

- **Solo-developer burnout / time displacement.** The dominant cost of this project is the developer's own time. Real risk: the developer's other commitments grow, and the project drags from 3–5 months into 12–18 months, by which point momentum is lost and the anniversary window is past. Mitigation: pre-declared cut order converts "drop scope or drop project" into a managed decision; phased implementation roadmap (Phase 0 spike → Phase 1 MVP cruise viewer → Phase 2 encounters → Phase 3 polish) gives natural commit points where progress is visible and shippable.
- **Engineering substrate is the easy half.** The technical research is explicit that 6–9 weeks gets the substrate, but portfolio-quality polish across six distinct encounter scenes is the larger calendar (an additional 6–12 weeks per the reviewer's honest estimate). Mitigation: the brief and PRD have absorbed this honesty; the calendar is realistically scoped to 3–5 months total; Phase 3 (polish) is explicitly named and budgeted, not assumed.
- **Single point of knowledge.** The developer is the sole repository of project context. Mitigation: comprehensive PRD, technical research, distillate, and ADRs make the project independently re-comprehensible if the developer steps away and returns.

### Out-of-Scope Discipline

Items the user has **explicitly excluded from v1** (mirrored from Product Scope; reiterated here as a discipline anchor):

- Plasma roll maneuvers and other non-imaging attitude events
- Live "where is Voyager now" telemetry overlay
- Documentary/Cinematic mode toggle
- Curated 20–40 Voyager image plates
- Engineering / science data layers
- Spoken narration / voiceover
- Wide-angle camera boresight
- VR / WebXR mode
- Pioneer 10, New Horizons, or any other spacecraft
- Multi-language localization
- Dedicated classroom mode
- Mobile / tablet polish (functional only)
- Pre-launch institutional outreach pass

**No reopening these without an explicit scope-change decision documented in the PRD.** This discipline is the most important countermeasure to R8.

## Functional Requirements

This section is THE CAPABILITY CONTRACT. Each FR states WHAT capability the product must have, not HOW it is implemented. Performance targets, technology choices, and UI specifics live in Non-Functional Requirements, Technical Architecture, and downstream design work respectively. Any capability not listed here will not exist in v1.

### Timeline & Playback Controls

- **FR1.** User can scrub the simulation to any point in time between 1977-08-20 (V2 launch) and 2030-12-31 (end of projected trajectory window).
- **FR2.** User can play, pause, and resume the simulation.
- **FR3.** User can set simulation playback speed across the range 1× real-time to 1,000,000× real-time.
- **FR4.** User can jump directly to any of the mission's eleven named chapters (V1 launch, V2 launch, V1 Jupiter, V2 Jupiter, V1 Saturn, V2 Saturn, V2 Uranus, V2 Neptune, Pale Blue Dot, V1 heliopause, V2 heliopause).
- **FR5.** User can see chapter markers positioned along the timeline scrubber at the correct historical timestamps.
- **FR6.** User can return to mission start or mission end with a single action.
- **FR7.** System auto-adjusts playback speed downward when asset chunks are still loading, preventing main-thread starvation; restores the user's chosen speed once loading completes.

### Spacecraft & Trajectory Rendering

- **FR8.** User can see Voyager 1 and Voyager 2 as distinct, identifiable spacecraft throughout the simulation.
- **FR9.** User can see each spacecraft's full historical trajectory from launch through the current simulation timestamp.
- **FR10.** User can see each spacecraft's future trajectory from the current simulation timestamp through 2030, visually distinguished from the historical (past) trajectory.
- **FR11.** User can see the gravity-assist trajectory bends at each gas-giant encounter rendered with sufficient accuracy that the physical mechanism (the planet pulling and redirecting the spacecraft) is visually apparent.
- **FR12.** User can see Voyager 2's post-Neptune trajectory bend sharply south of the ecliptic plane (the Triton flyby effect).
- **FR13.** User can zoom from a system-scale view (heliopause distance, ~165 AU) down to a sub-meter inspection of either spacecraft without visual instability (jitter, z-fighting, or flickering).
- **FR14.** User can see celestial bodies (Sun, planets, key moons) rendered at correct positions for the current simulation timestamp using SPICE-derived ephemerides.

### Attitude & Instrument Visualization

- **FR15.** User can see each spacecraft's body and scan-platform orientation reconstructed from CK kernel data during encounter windows.
- **FR16.** User can see the scan platform physically articulate during encounters as the historical instrument pointing changes.
- **FR17.** User can see a narrow-angle camera boresight cone driven by the reconstructed attitude data, showing what the instrument was pointed at moment-to-moment.
- **FR18.** User can see synthesized Earth-pointing high-gain-antenna attitude during cruise periods where CK kernel data is unavailable.
- **FR19.** User can see, at all times, a clear UI indicator distinguishing CK-derived attitude from synthesized attitude.
- **FR20.** System does not render attitude as smoothly interpolated through quaternion sign-flip discontinuities — articulation must remain visually stable across CK sample boundaries.

### Encounter & Chapter Scenes

- **FR21.** User can experience the V1 Jupiter encounter (1979-03-05) with body-centered camera framing and CK-driven instrument articulation.
- **FR22.** User can experience the V2 Jupiter encounter (1979-07-09) with body-centered camera framing and CK-driven instrument articulation.
- **FR23.** User can experience the V1 Saturn encounter (1980-11-12), including the Titan close flyby that slingshots V1 out of the ecliptic.
- **FR24.** User can experience the V2 Saturn encounter (1981-08-26), including Iapetus, Hyperion, and Titan flybys.
- **FR25.** User can experience the V2 Uranus encounter (1986-01-24), including the Miranda close flyby.
- **FR26.** User can experience the V2 Neptune encounter (1989-08-25), including the Triton flyby that bends the trajectory south of the ecliptic.
- **FR27.** User can experience the Pale Blue Dot chapter (1990-02-14), during which V1 physically turns toward the inner solar system and the narrow-angle camera frustum sweeps Venus, Earth, Jupiter, Saturn, Uranus, and Neptune in their historical sequence.
- **FR28.** User can see original NASA photo plates composite into the Pale Blue Dot scene at the corresponding instants of capture.
- **FR29.** User can see chapter cards marking V1's heliopause crossing (2012-08-25) and V2's heliopause crossing (2018-11-05) with explanatory text describing the cosmic-ray and solar-wind signatures.
- **FR30.** User can see chapter-specific copy displayed alongside the simulation explaining what is happening in the current chapter.

### Camera, View System & HUD

- **FR31.** User can see the camera smoothly transition between heliocentric (solar-system-scale) and body-centered (planet-scale) view frames as the simulation enters and exits encounter windows.
- **FR32.** User can manually orbit, pan, and zoom the camera at any time, overriding the default camera framing.
- **FR33.** User can return to default camera framing with a single action after manual camera control.
- **FR34.** User can see a HUD overlay displaying the current simulation date in UT, the active spacecraft's distance from the Sun in AU, the current chapter title, and the current speed multiplier.
- **FR35.** User can see, in the HUD, which scientific instruments are currently active versus shut off for each spacecraft, reflecting the historical instrument shutoff schedule (ISS, UVS, PLS, LECP).
- **FR36.** User can dismiss or restore the HUD overlay (e.g., for unobstructed viewing or screenshot capture).

### Sharing, Embedding & URL System

- **FR37.** User can share a URL that links to any specific chapter, and recipients opening that URL land at the chapter's anchor timestamp.
- **FR38.** User can share a URL that encodes a specific timestamp, and recipients opening that URL land paused at that exact moment.
- **FR39.** User can preview the destination scene of any chapter URL via a pre-rendered Open Graph card when the link is pasted into messaging apps, social platforms, or other Open-Graph-aware contexts.
- **FR40.** Curator can append `?embed=true` (or equivalent) to any URL to render the artifact chrome-less for iframe embedding or kiosk display.
- **FR41.** System preserves URL contract stability across releases so that chapter URLs created by curators or shared by users remain valid as the product evolves.
- **FR42.** User can copy the current URL to share at any moment without explicit "share this" affordances getting in the way (URL is always current in the browser's address bar).

### Audio, Accessibility & Methodology Surface

- **FR43.** User can toggle the Voyager Golden Record audio layer on or off; it is off by default.
- **FR44.** User can hear Golden Record audio gently activate at chapter markers (launch, Pale Blue Dot, heliopause crossings) when the audio layer is enabled.
- **FR45.** User can operate all primary controls (play/pause, scrub, chapter jump, speed change, audio toggle) via keyboard alone.
- **FR46.** User can experience reduced-motion mode when their browser's `prefers-reduced-motion` setting is set to reduce; camera transitions become instant cuts and scrubber animation becomes instantaneous, while the simulation itself continues to play.
- **FR47.** User can navigate to an About / Methodology page that explains the SPICE data sources, the CK-vs-synthesis distinction, the validation tolerances, and links to underlying technical documentation.
- **FR48.** User can find attribution for every third-party data source and asset (NAIF, PDS Rings Node, USGS, Björn Jónsson, NASA 3D Resources, NASA Photojournal) in a discoverable location.
- **FR49.** System renders all interface text at WCAG 2.2 AA color-contrast ratios and does not encode any meaning by color alone (chapter markers, trajectory styling, HUD indicators use shape, position, or pattern in addition to color).
- **FR50.** System does not collect personally identifiable data, set tracking cookies, or include third-party analytics that would require user consent banners.

### Build, Validation & Deployment Operations

- **FR51.** Maintainer can rebuild the entire trajectory and attitude binary asset set from pinned NAIF kernels via a documented build pipeline.
- **FR52.** System verifies SHA-256 hashes of every kernel against a manifest at build time and fails the build on any mismatch.
- **FR53.** Maintainer can trigger a kernel-drift report comparing the current kernel set against the prior pinned baseline, producing a max-position-drift and RMS-drift summary plus a coverage delta.
- **FR54.** System rejects a kernel update if max position drift exceeds the configured acceptance threshold (default: 5 km).
- **FR55.** Maintainer can run the 6-layer validation harness (L1 Python interpolation validation; L2 JS-vs-SPICE consistency; L3 TypeScript unit tests; L4 Playwright visual regression; L5 Playwright E2E mission-timeline assertion) as CI gates blocking on any failure.
- **FR56.** System deploys the static artifact bundle to a global CDN with content-hashed immutable asset filenames and long-lived cache headers on green CI.
- **FR57.** System falls back to a friendly browser-unsupported page when the visitor's browser lacks WebGL2, WebAssembly, or other required platform capabilities, rather than attempting to render a degraded simulation.
- **FR58.** Maintainer can roll back a deployment by redeploying a prior content-hashed bundle via the CDN provider's standard deployment surface.

## Non-Functional Requirements

NFRs define the quality attributes the system must satisfy. They are testable, measurable, and tied to a validation surface where possible. Categories not listed (Integration, Localization) do not apply to v1.

### Performance

- **NFR-P1.** Sustained rendering frame rate: 60 FPS at 1280×720+, measured on a mid-range laptop (defined as: 2024-or-newer integrated GPU; Intel Iris Xe, AMD Radeon Graphics, Apple M-series base, or equivalent).
- **NFR-P2.** Frame-time distribution: P95 ≤ 16.7 ms/frame; P99 ≤ 22 ms/frame; no individual frame > 50 ms during any chapter scene (excluding the first three frames after load, which are excluded as steady-state warm-up).
- **NFR-P3.** Time-to-interactive: ≤ 3 seconds on a 25 Mbps broadband connection from cold cache, measured by Lighthouse on the homepage URL.
- **NFR-P4.** First-paint asset bundle size: ≤ 35 MB compressed (Brotli).
- **NFR-P5.** Full asset bundle size (including Golden Record audio, all 8k texture upgrades, all trajectory and attitude chunks): ≤ 150 MB compressed (Brotli).
- **NFR-P6.** Time-warp resilience: ClockManager mutations do not block frame budget; verification is via the per-frame timing histogram observed by RenderEngine, not by direct sub-ms timing of the ClockManager mutation itself. At 1,000,000× playback rate the simulation must scrub the full 1977–2030 mission without main-thread starvation or chunk-load stutter; chunk prefetch must begin no later than the last 10% of the currently-playing chunk. The wall-clock end-to-end scrub time is bounded by the renderer's per-frame pacing (Story 7.6 L4 perf pass owns the actual end-to-end measurement against an explicit wall-clock target). *Amended 2026-05-19 per Story 1.15; original wording's ≤ 60 second / ≤ 100µs P99 framing was mathematically un-measurable on browser wall-clock at the ClockManager layer. See epic-1-retro-2026-05-19.md § 5 Decision E.*
- **NFR-P7.** Trajectory interpolation cost: ≤ 1 ms per frame for 12 bodies (2 spacecraft + Sun + 8 planets + 1 moon) using cubic Hermite. Measured by `/perf` route harness.
- **NFR-P8.** Rendering precision: zero z-fighting and zero positional jitter visible at any zoom level between sub-meter spacecraft inspection and 165 AU far-plane view. Validated by Playwright visual regression at extreme zoom states.
- **NFR-P9.** Trajectory accuracy: max position error ≤ 20 km, RMS error ≤ 5 km, vs dense SPICE reference across the full 1977–2030 mission window. Gated by Layer-1 Python validation harness.
- **NFR-P10.** Attitude accuracy: ≤ 1 milliradian (≤ 0.05°, ≤ 100 NA-pixel error) vs source CK quaternions during encounter windows. Gated by Layer-2 JS-vs-SPICE consistency tests.

### Reliability / Availability

- **NFR-R1.** Deployment availability: target ≥ 99.9% measured monthly. (This is set by the CDN provider's SLA — Cloudflare Pages and Vercel both publish this floor — and is therefore not an engineering responsibility beyond choosing a provider that meets it.)
- **NFR-R2.** Asset durability: all asset URLs are content-hashed and immutable. A given asset URL must continue to resolve indefinitely after the deployment that produced it; rolling forward never invalidates a previously-deployed asset URL within the same CDN account.
- **NFR-R3.** Recovery time from a bad deploy: ≤ 5 minutes from rollback trigger to prior-version visitor service, executed via the CDN provider's standard rollback surface (no custom tooling required).
- **NFR-R4.** Build determinism: given identical pinned kernels and identical source-code commit, the Python bake step produces byte-identical trajectory and attitude binary outputs. CI verifies this on every PR via a check-the-checksum step.
- **NFR-R5.** Browser session integrity: a sustained user session of ≥ 30 minutes does not accumulate WebGL resource leaks that degrade frame rate by more than 5%. Validated by manual long-running session test in v1; automated by Layer-6 performance regression harness in v1.1.

### Security

- **NFR-S1.** Transport: all assets and HTML served over HTTPS (TLS 1.2+, with TLS 1.3 preferred). HTTP requests redirect to HTTPS. Enforced by CDN provider configuration.
- **NFR-S2.** Content Security Policy: a strict CSP header restricts script sources to `'self'` plus any explicitly-allowed asset CDN; disallows `eval` and inline scripts (with hashes for any genuinely needed inline boot script); disallows mixed content.
- **NFR-S3.** Subresource Integrity (SRI): any third-party JavaScript loaded from external CDNs (none planned in v1, but if any are added) must carry SRI hashes.
- **NFR-S4.** Kernel integrity: every NAIF kernel SHA-256 verified at build time against the pinned manifest; mismatch fails the build. Documented in FR52.
- **NFR-S5.** Asset supply-chain integrity: all third-party assets (3D models, textures, audio) hash-pinned at build time. Asset-hash mismatch fails the build.
- **NFR-S6.** Dependency supply chain: `npm audit` / `pnpm audit` and `uv` (Python) advisory checks run on every CI build; high-severity advisories block deploy until remediated.
- **NFR-S7.** No execution of untrusted user-supplied input: the URL parameters the artifact accepts (`?t=`, `?embed=`) are parsed as strict typed values (ISO-8601 datetime, boolean) with rejection of malformed input — no string substitution into DOM, no template evaluation.
- **NFR-S8.** Privacy posture: no PII collection, no tracking cookies, no third-party analytics, no fingerprinting libraries. Documented in FR50; codified by absence of any analytics library in the dependency manifest.
- **NFR-S9.** Subresource isolation: the artifact does not load any cross-origin resources at runtime that aren't from the artifact's own CDN domain or an explicitly-allowed pinned source.

### Scalability

- **NFR-Sc1.** The artifact scales to arbitrary concurrent visitor counts at constant per-visitor cost because all delivery is via static CDN with no origin-side computation. No additional NFRs apply — scalability is solved architecturally and does not need feature-level treatment.

### Accessibility

- **NFR-A1.** WCAG 2.2 AA conformance for all interface text and interactive controls. Validated by axe-core automated checks in CI plus manual review.
- **NFR-A2.** Color-contrast ratios: ≥ 4.5:1 for body text; ≥ 3:1 for large text and graphical UI components (chapter markers, scrubber elements, HUD indicators). Documented in FR49.
- **NFR-A3.** Keyboard reachability: every interactive control (play/pause, scrub, chapter jump, speed, audio toggle, manual camera, HUD toggle, About link) is operable via keyboard alone. Tab order follows visual reading order. Documented in FR45.
- **NFR-A4.** Visible focus indication: all keyboard-focusable elements have a focus indicator with ≥ 3:1 contrast against the background, persisting until focus moves.
- **NFR-A5.** Reduced-motion support: when `prefers-reduced-motion: reduce` is set, camera transitions become instant cuts, scrubber animation becomes instantaneous, and speed-multiplier ramps become instant. The simulation playback itself continues. Documented in FR46.
- **NFR-A6.** No photosensitive-epilepsy hazards: no content flashes more than 3 times per second; no large-area high-contrast strobing transitions.
- **NFR-A7.** Semantic markup: navigation surfaces (chapter index, primary controls, About link) use semantic HTML (`<nav>`, `<button>`, headings in hierarchical order) and ARIA labels where the visual affordance has no equivalent semantic element.
- **NFR-A8.** Screen-reader floor: the artifact is fundamentally visual and does not claim equivalent screen-reader experience, but page `<title>` updates announce chapter changes; primary controls expose `aria-label` and `aria-pressed`/`aria-expanded` state where applicable; the About page is fully accessible as text content.

### Compatibility

- **NFR-C1.** Browser support (Tier 1, fully polished): latest two stable versions of Chrome, Firefox, and Safari on desktop. Edge inherits from Chrome.
- **NFR-C2.** Browser support (Tier 2, functional but not polished): latest two stable versions of Chrome and Safari on tablet (iPadOS, ChromeOS).
- **NFR-C3.** Browser support (Tier 3, best-effort): latest two stable versions of mobile Chrome and Safari on phone.
- **NFR-C4.** Required platform capabilities (boot-time feature-detected, with fallback page if missing): WebGL2, WebAssembly (also gates the chunk loader's wasm brotli polyfill — see Story 1.16), `requestAnimationFrame`, History API, ResizeObserver. *Amended 2026-05-20 per Story 1.16: original wording listed "Brotli decoding" as a separately-probed capability assuming `DecompressionStream('br')` would land in browsers; it never did. Brotli decompression is now provided by `brotli-dec-wasm` and is therefore covered by the WebAssembly check.*
- **NFR-C5.** GPU capability fallback: if reverse-Z depth is unstable on the visitor's GPU (detected at boot), the artifact falls back to logarithmic depth buffer transparently. No user-visible action required.
- **NFR-C6.** Texture-tier fallback: if device GPU memory is insufficient for 8k planet textures (detected at boot), the artifact falls back to 4k textures and does not lazy-upgrade. No user-visible action required.
- **NFR-C7.** Older / unsupported browsers: the artifact does not render a partial or degraded simulation; it renders a single-frame fallback page explaining the browser requirement. Documented in FR57.

### Maintainability

- **NFR-M1.** Code documentation: every architectural decision documented in the technical research's "Rejected Technical Ideas" inventory has a corresponding Architectural Decision Record (ADR) in the repository explaining the rationale and the rejected alternatives.
- **NFR-M2.** Kernel-update operational flow: a maintainer can complete a kernel update (new manifest, drift report review, CI run, deploy) in under 30 minutes of attention time, with the bot-driven flow described in Journey 5.
- **NFR-M3.** Mission-fact provenance: every pinned timestamp, encounter date, closest-approach distance, and instrument-shutoff date is traceable to a primary mission documentation source via inline code comments or a `MISSION_FACTS.md` reference. No values invented or silently rounded.
- **NFR-M4.** Test execution time: the ≤5-minute budget scopes to L1 (Python validate) + L3 (Vitest) test execution. The bake determinism re-bake is a separate quality gate measured against its own wall-clock budget (which is ≤ 10 minutes on GitHub-hosted runners). "Human-readable" cycle logs means the cycle log is structurally consistent and parseable; MD010 lint exceptions for the TAB-separator format are explicitly accepted. The L4+L5 suite (Playwright visual regression + E2E timeline) completes in ≤ 15 minutes. *Amended 2026-05-19 per Story 1.15; original wording conflated 'human-readable' with 'lint-clean' and the bake gate with the test gate. See epic-1-retro-2026-05-19.md § 5 Decision E.*
- **NFR-M5.** Build pipeline observability: every CI build produces a build manifest (asset sizes, kernel hashes, validation tolerances, frame-budget summary) attached to the PR or build record. Regressions in any reported value are surfaced in the PR diff.
- **NFR-M6.** No accumulating tech debt during multi-year maintenance: dependency advisory checks (NFR-S6), drift report flow (FR53/FR54), and ADR discipline (NFR-M1) collectively make the artifact maintainable without a continuous engineering rotation.
