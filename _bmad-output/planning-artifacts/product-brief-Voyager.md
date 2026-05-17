---
title: "Product Brief: Voyager"
status: "complete"
created: "2026-05-16"
updated: "2026-05-16"
inputs:
  - _bmad-output/planning-artifacts/research/initial-research.md
  - _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md
---

# Product Brief: Voyager — A Browser-Based Mission Replay

## Executive Summary

**Voyager** is a browser-based, narrative-driven simulator that lets anyone watch the entire Voyager 1 and 2 mission unfold, from Cape Canaveral in 1977 to interstellar space in 2030 and beyond. It is a 50-year story told in 3D, anchored to a single coherent time axis you can scrub, pause, and zoom — closer in spirit to *Apollo in Real Time* than to a planetarium sandbox. Where every existing competitor shows you where Voyager went, **this one shows you what Voyager was looking at**: SPICE-derived trajectories combined with CK-reconstructed attitude data drive instrument boresights that aim, articulate, and turn the way they actually did during each encounter. The Pale Blue Dot scrolls into being as the spacecraft physically turns back toward the inner solar system, the narrow-angle camera's frustum sweeping past Venus, Earth, Jupiter, Saturn, Uranus, and Neptune — the act itself, recreated.

The mission has never had this product. NASA's Eyes on the Solar System treats Voyager as one of 150 missions in a generic browser. OpenSpace owns the planetarium dome but stays on the desktop. JPL's own Voyager site is static infographics. No one has built the **definitive Voyager-as-cinema** experience — the one where the gravity assist around Jupiter is a scene, not a screenshot. As JPL operationally paces the spacecraft toward Voyager 1's 50th anniversary on September 5, 2027, the cultural temperature around the mission is rising and elegiac. This is the moment to build it.

The technical research is complete and validated; near-zero operating cost (CDN free tier). The full-v1 scope (both Voyagers, all four gas-giant encounters, attitude reconstruction, Pale Blue Dot, heliopause) is intentionally ambitious. The engineering substrate is achievable in 6–9 weeks; portfolio-quality polish across six distinct encounter scenes is a separate and meaningfully longer calendar. A realistic total elapsed time for a solo dev to deliver this scope at the stated quality bar is **3–5 months**, not 6–9 weeks. The single largest project risk is scope creep, not technical risk. What remains is disciplined execution and a pre-declared cut order if the calendar slips.

## The Problem

Voyager is the most consequential robotic mission in human history, and most people — even technically literate, space-curious people — could not tell you what happened between Cape Canaveral and the heliopause. They know the Pale Blue Dot photo. They know "Voyager left the solar system." They have no felt sense of the 12 years between Jupiter and Neptune, no intuition for what a gravity assist looks like at 60,000 km/h, no idea that Voyager 2's trajectory bent sharply south of the ecliptic after Neptune because of how Triton's gravity grabbed it.

The existing tools to fix this all fail in at least one dimension:

- **NASA Eyes on the Solar System** is the closest direct competitor — it has the trajectory, it has the time slider, it works in a browser. But Voyager is one of 150 missions, the experience is a sandbox with sidebar text, and the attitude data (where Voyager was *looking*) is shallow. It is a tool, not a story.
- **OpenSpace** has the scientific fidelity but only runs on a desktop, has a power-user UI, and is built for planetariums showing pre-scripted dome films — not for someone sitting at home wanting to *understand*.
- **Solar System Scope** and **Solar System 3D** are mobile-friendly and classroom-positioned, but their Voyager content is little more than a labeled dot moving along a path.
- **Celestia, Universe Sandbox, SpaceEngine** are physics sandboxes, not mission replays.
- **JPL's own Voyager site** is a beautiful elegy made of static panels and a "where are they now" counter.

The gap is consistent: **nobody has built a Voyager-exclusive, browser-based, narrative-anchored experience where the mission itself is the protagonist.**

## The Solution

A web app you can open on any modern browser, hit play, and watch the Voyager mission unfold from launch to interstellar space — at any speed from real-time to a billion times faster — with the camera following the action and the spacecraft turning to point its instruments at the things it was actually looking at when it was looking at them. The timeline scrubber is the main control. Chapter markers anchor the mission's natural story beats: launch, Jupiter encounter, Saturn encounter, Uranus, Neptune, Pale Blue Dot, heliopause crossings. During cruise the spacecraft holds its high-gain antenna toward Earth; during a flyby the scan platform articulates and the narrow-angle camera's field of view sweeps Io, then Europa, then Jupiter itself.

Built on validated 2026 technology: TypeScript and Three.js in the browser, pre-computed SPICE trajectories and CK attitude data baked at build-time into compressed binary assets, served from a global CDN. No servers, no accounts, no installs. The full technical research is documented in [technical-voyager-simulation-feasibility-research-2026-05-16.md](research/technical-voyager-simulation-feasibility-research-2026-05-16.md); the implementation roadmap is concrete and de-risked.

## What Makes This Different

**Attitude is a first-class feature — the lede, not a footnote.** Every competitor product treats spacecraft as positions on paths. We show what Voyager was *looking at* — the narrow-angle camera's boresight cone aimed at Io's volcanoes, the scan platform articulating during the Titan flyby, the slow turn back toward the inner solar system in February 1990 to take the Family Portrait. CK kernel data from NAIF and the PDS Rings Node provides reconstructed attitude during encounter windows (where the cinematic moments live) at sub-milliradian accuracy; cruise attitude is synthesized from the high-gain antenna's known Earth-pointing constraint, and the UI clearly indicates which is which. This single feature accounts for most of the emotional weight of the experience, and no current product delivers it. The tagline writes itself: **see what Voyager saw.**

**Voyager is the protagonist, not a feature.** Every existing alternative treats Voyager as one entry in a mission catalog. We build the entire experience around the spacecraft and their journey. That focus shows in every design decision — the chapter structure, the camera choreography, the copy, the depth of the historical milestones.

**Time is the primary navigation axis.** Most space sims treat time as a setting buried in a panel. We treat it the way *Apollo in Real Time* treats mission elapsed time: as the spine of the entire experience. You can scrub from 1977 to 2030 in seconds, zoom into 1979-03-05 to watch a Jupiter flyby unfold in minutes, then zoom out to see Voyager 1 cross the heliopause 33 years later. Every chapter moment is a deep-linkable URL; sharing a single timestamp shares an entire scene.

**Browser-first, with the polish stack of a finished artifact.** Concretely: hand-written chapter copy (not templated), a timeline scrubber that feels physical, choreographed chapter transitions, intentional typography and layout, consistent visual language across encounters, and asset delivery tuned to load fast on a mid-range laptop. We beat NASA Eyes on focus. We beat OpenSpace on accessibility (no install, no account, no learning curve). We beat Solar System Scope on depth. The bar is the visual register of *Apollo in Real Time* — silent, dignified, time-anchored — applied to an unmanned mission for the first time.

## Who This Serves

**Primary (design persona): the space-curious adult who wants to be moved.** A composite north-star user — someone who watched *For All Mankind*, has *Pale Blue Dot* on a shelf, follows planetary scientists on social media, and reads long-form essays about NASA missions. The persona is not validated as a market segment; it's the user we design *for*. The implied real audience overlaps with the existing *Apollo in Real Time* readership, the Planetary Society membership, the r/space and collectSPACE communities, and the Three.js / FWA portfolio-craft community.

**Secondary: science educators and their students.** Middle-school through undergraduate teachers looking for something that explains gravity assists or interstellar boundaries better than a textbook diagram. We design with classroom adoption gates in mind — no install, no account, works on a Chromebook, low enough copy density to project on a smartboard — but we do not commit to those gates as v1 requirements. If teachers find it and use it, that is a win. If they need a dedicated classroom mode later, that is a v1.1 conversation.

**Tertiary: museum and planetarium curators.** The COSI Immersive Voyager VR exhibit (March 2026) and the inevitable 2027 anniversary programming create real institutional demand for a free, browser-accessible Voyager companion that can be QR-coded onto an exhibit placard or embedded as an iframe. Designing a chrome-less embed mode costs almost nothing if planned from day one; this audience is a high-leverage path to NASA/JPL acknowledgment.

**All three audiences share the same need:** a way to understand what actually happened, in a way that feels true to the mission's scale and significance. The tone is awe and wonder with weight — the *visual* register of *Apollo in Real Time* (silent, dignified, time-anchored, generous typography) applied to the unmanned exploration era for the first time.

## Success Criteria

This is a portfolio piece. Success is **recognizable quality**, not engagement metrics. To keep that operable rather than aspirational, the project commits to an explicit Definition of Done before launch:

- **The piece looks and feels finished** measured against three named references: [Apollo in Real Time](https://apolloinrealtime.org), the *NYT* long-scroll science features (e.g., "Snow Fall," the Cassini retrospective), and FWA Site of the Day winners in the Three.js/WebGL category. A finished v1 should be linkable next to any of these without an apology.
- **The mission is accurately represented.** Trajectory interpolation matches SPICE-derived ground truth within a tolerance that is invisible at the project's zoom levels — a 6-layer validation harness measures and gates this (see the technical research's testing strategy). Attitude data matches reconstructed CK kernels within encounter windows; cruise attitude is synthesized from the Earth-pointing HGA constraint and labelled as such in the UI. The chapter timeline matches verified mission events.
- **It works smoothly in any modern browser** at 60 FPS on a mid-range laptop. Mobile / tablet support is a stretch goal, not a requirement; the brief commits to a "desktop browser, 1280×720 minimum" floor and treats mobile polish as v1.1.
- **A first-time visitor with no priors can scrub from launch to heliopause and come away with the mission's story.** This is the qualitative test that matters most, validated by 5–10 friendly first-time users before public launch.

**Distribution plan (soft launch):** Public launch posts to Hacker News, r/space, r/NASA, collectSPACE, and Twitter/X with deep-linked screenshots of the Pale Blue Dot, Titan slingshot, and Triton-arc moments. No pre-launch institutional outreach pass for v1 — the work speaks for itself, and any inbound from NASA/JPL/the Planetary Society/museums is a bonus, not a designed-for outcome. If the artifact earns institutional amplification through quality alone, that confirms the bet.

Secondary signals worth tracking but not optimizing for: shares, time-on-site, mentions from space-media accounts. If the 2027 anniversary press cycle picks it up, that is a bonus, not the goal.

**True cost:** ~$0–15/year in CDN/domain. The dominant cost is the developer's own time — the only resource that actually matters for a portfolio piece. The brief is honest that the engineering substrate (6–9 weeks) is the smaller half of the work; portfolio-quality polish across the full-v1 scope is the larger half.

## Scope

**In scope for v1:**

- Voyager 1 and Voyager 2, full trajectories from launch through 2030
- All four gas-giant encounters: Jupiter (V1 1979, V2 1979), Saturn (V1 1980, V2 1981), Uranus (V2 1986), Neptune (V2 1989)
- Spacecraft attitude reconstruction during encounter windows (CK kernels, ~milliradian accuracy) and clearly-labeled synthesized Earth-pointing cruise attitude
- Pale Blue Dot reconstruction (1990-02-14) — the spacecraft physically turns; the narrow-angle camera frustum sweeps Venus → Earth → Jupiter → Saturn → Uranus → Neptune in sequence; original NASA photo plates composite in at the corresponding instants
- Heliopause crossings (V1 2012, V2 2018) as marked timeline cards (necessarily textual — the heliopause is a plasma boundary with no visual signature)
- Timeline scrubber with chapter markers; speed control from 1× to 1e6× (1e6× scrubs the entire mission in ~50 seconds)
- Camera that follows the action with blended view-frame transitions during encounters
- Instrument boresight visualization (narrow-angle camera; wide-angle deferred to v1.1)
- HUD overlay: simulation date, distance from Sun, current chapter title, speed multiplier
- Deep-linkable URL scheme: every chapter and every timestamp is a shareable URL with pre-rendered Open Graph card
- **Voyager Golden Record as a diegetic audio layer** (toggleable, off by default). The Record is literally bolted to both spacecraft, is NASA-public-domain, and gently audible at chapter markers (launch, Pale Blue Dot, heliopause) is the single highest-leverage emotional amplifier available. ~30 MB additional asset
- Desktop browsers as the primary target (Chrome, Firefox, Safari at 1280×720+)

**Explicitly out of scope for v1:**

- Plasma roll maneuvers and other non-imaging attitude events
- Live "where is Voyager now" telemetry overlay (a static "last known position" end-card stands in)
- Documentary/Cinematic mode toggle
- Curated Voyager image-plate overlay (20–40 hand-picked images anchored to capture timestamps) — deferred to v1.1
- Engineering and science data layers (DSN contact windows, magnetometer plots, broad PDS image archive) — deferred to v1.1 alongside the curated image plates
- Spoken narration / voiceover (the Golden Record is distinct from narration)
- VR / WebXR mode
- Pioneer 10, New Horizons, or any other spacecraft
- Multi-language localization (architected for, not shipped)
- A dedicated classroom mode (designed with adoption gates in mind, but not committed)
- Mobile / tablet polish (works on desktop; functional on tablet; not optimized for phones — v1.1 if signal warrants)
- Pre-launch institutional outreach pass (Planetary Society, NASA Voyager team, museums) — the artifact speaks for itself

**Cut order if calendar slips** (declared explicitly to make scope-control real, not aspirational):

1. First to cut: Voyager 2's Uranus (1986) and Neptune (1989) encounters → demote to labeled timeline cards. The Jupiter and Saturn encounters carry most of the cultural recognition.
2. Second: Voyager 2 entirely → ship V1-only; V2 + Uranus + Neptune become a v1.1 "completing the tour" drop timed for the 2027 anniversary press cycle.
3. Third: Saturn encounters for both spacecraft → keep Jupiter as the hero encounter only.
4. Fourth: instrument boresight visualization → static cone, no per-target articulation.

These are the levers, in order, if polish overruns the calendar. Declaring them up front converts "scope creep" from an abstract risk into a managed sequence of falls-back to a still-shippable artifact.

## Vision

If v1 lands, the natural extensions are layered data depth (engineering view, science view, a curated 20–40 image highlight reel anchored to their capture timestamps, and eventually the broader PDS image-plate archive as scrubable thumbnails along the timeline), spoken narration as a toggleable layer, a Documentary/Cinematic mode toggle for explicit accuracy-vs-storytelling transparency, mobile/tablet polish, and a dedicated classroom mode that hardens the adoption gates into commitments.

The brief deliberately scopes this as a **polished one-off about Voyager**, not the first installment of a broader mission-replay archive. The architecture is designed to be generalizable — `EphemerisService.getStateAt(et)` and an `AttitudeService` over a chapter-driven FSM could in principle host Pioneer 10, Cassini, New Horizons, or any historical mission with SPICE kernels — but extending the archive is explicitly **not part of the product story**. v1 stands alone, justified by the Voyager mission alone, and whether the work seeds further missions is a separate decision made later, on the merits.

## Opportunity Window

Voyager 1's 50th anniversary is September 5, 2027. NASA/JPL has been pacing the spacecraft toward that date — the 2026 instrument shutoffs and thruster swaps are operationally framed as "making the 50th." The press cycle will be substantial: documentaries, retrospectives, museum installations (COSI's Immersive Voyager VR opened March 16, 2026, and is unlikely to be the last).

The anniversary is **opportunity timing, not a deadline**. If the project ships in time to catch the wave, great. If it ships after, the artifact still stands on its own. The brief commits to the Definition of Done (named references + the 5–10-friendly-user qualitative test) as the gate, not the date. Given the realistic 3–5 month timeline for the full-v1 scope at portfolio polish, starting in earnest in mid-to-late 2026 puts a Q1–Q2 2027 launch in reach — but the brief explicitly will not let the date force a quality compromise.
