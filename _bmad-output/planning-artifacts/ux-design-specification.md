---
stepsCompleted: [1, 2]
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-Voyager.md
  - _bmad-output/planning-artifacts/product-brief-Voyager-distillate.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/research/initial-research.md
  - _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md
---

# UX Design Specification — Voyager

**Author:** Developer
**Date:** 2026-05-16

---

## Executive Summary

### Project Vision

Voyager is a browser-based, narrative-driven cinematic replay of the Voyager 1 and Voyager 2 missions (1977–2030), built around a single coherent time axis the user can scrub, pause, and zoom from 1× real-time to 1,000,000×. The product treats the mission as the protagonist — not as one entry in a multi-mission planetarium catalog. The lede feature is **"see what Voyager saw"**: CK-reconstructed attitude data drives instrument boresights so the spacecraft physically turns, the scan platform articulates, and the narrow-angle camera's frustum sweeps the targets it actually aimed at in 1979, 1980, 1986, 1989, and 1990.

The visual register is *Apollo in Real Time* applied to an unmanned mission for the first time — silent, dignified, time-anchored, generous typography. The artifact is a portfolio piece; success is recognizable quality, not engagement metrics. The Definition of Done — "linkable next to *Apollo in Real Time*, NYT long-scroll science features, and FWA Three.js winners without an apology" — is the launch gate, not the 2027-09-05 anniversary date. Voyager 1's 50th anniversary is opportunity timing; the artifact ships when it's ready, not before.

**The design hero is the Pale Blue Dot reconstruction (1990-02-14)** — the spacecraft physically turns toward the inner solar system, the narrow-angle camera frustum sweeps Venus → Earth → Jupiter → Saturn → Uranus → Neptune, and original NASA photo plates composite into the scene at the corresponding instants. Every other design decision serves this scene's emotional integrity.

### Target Users

**Primary (design persona): Maya, 34, space-curious adult.** A composite north-star user — Brooklyn software designer; watched *For All Mankind* through twice; owns *Pale Blue Dot* and Ann Druyan's *Cosmos*; follows planetary scientists on Bluesky; reads long-form science features in *The Atlantic* and *Quanta*. Knows Voyager left the solar system; could not tell you what happened between Cape Canaveral and the heliopause. **Wants to be moved, not informed.** Two journey modes: first-time happy path (J1 — opening from a Hacker News link) and depth-seeking return visit (J2 — finding the Triton flyby moment to share).

**Secondary: Marcus, 47, AP Physics teacher.** Public high school in Columbus, OH. Uses a school-managed Chromebook over HDMI to a classroom smartboard. Needs no-install, no-account, bookmarkable per-chapter URLs as lesson plan assets. Plays the V2 Jupiter flyby twice at different speeds to make gravity assist legible. **The 1280×720 floor + URL-as-assignment pattern serves Marcus directly.**

**Tertiary: Dr. Hanno Reinhardt, 56, museum curator.** Vienna planetary science wing; planning 2027 anniversary programming. Needs four kiosks running deep-linked URLs in `?embed=true` chrome-less mode (Pale Blue Dot, V2 Triton, V1 Titan slingshot, V2 Neptune approach). Touchscreen scrubber must work. Attribution and licensing must be discoverable. **The embed surface is the seam that lets institutional adoption happen without bespoke work.**

**Operational: solo developer/maintainer (2028+).** Approves kernel-update PRs from a phone on a train. The artifact survives without continuous engineering attention because the bake → drift report → CI flow is well-trodden.

### Key Design Challenges

1. **The differentiator is invisible if not designed loudly enough.** If Maya doesn't *notice* the spacecraft physically turning during her first encounter, "see what Voyager saw" failed and the product reads as a NASA Eyes clone. UI affordances must announce the attitude reconstruction through behavior — articulated platform visible, boresight cone prominent, camera framing that puts the act of *aiming* at the center of the frame — without breaking the AiRT register through over-labeling.

2. **One scrubber, six orders of magnitude.** The timeline must feel good at 1× (real-time, near-stationary), at 1e6× (full mission scrubs in ~50s), and at the automatic cadence transitions in between (daily cruise → 1-hour approach → 1-minute flyby → 10-second closest-approach). The cadence gear-shifts happen *inside* the chapter automatically; the user should feel cinematic pacing, not loading buffers.

3. **Scientific honesty as visual register, not as caveats.** CK-vs-synthesized labeling, past-solid/future-dashed trajectory styling, methodology surface — non-negotiable per the PRD. The challenge is integrating these into the typographic register so they read as instrument-panel honesty, not as legal footnotes.

4. **Chapter copy that supports without lecturing.** The simulation is the protagonist. Copy is restrained, hand-written per chapter (not templated), in a typographic register Maya pauses on and reads. Marcus needs it to be projector-legible; Hanno needs it to read at kiosk-arm distance. One typographic system serves all three.

5. **Three distinct audiences, one chrome.** Maya's evening laptop scroll, Marcus's classroom projector, Hanno's museum kiosks. The `?embed=true` mode is the seam — every other UX decision must serve all three audiences without compromise. No "classroom mode" toggle. No museum mode. One artifact.

6. **Touch + pointer parity for the timeline scrubber.** The primary control surface must work for mouse hover (Maya), trackpad gesture (Maya's MacBook), touch (Hanno's kiosks, optional tablet), and keyboard (Marcus's accessibility floor, screen-reader-adjacent users). The scrubber's "physical feel" survives all four input modes.

### Design Opportunities

1. **Reframe time controls as cinematic affordances.** The scrubber as a film strip. Chapter markers as vertebrae along the timeline. Speed multiplier as a tactile, audibly-acceleration-implied slider — not a dropdown buried under a gear icon. "This is a cinema you scrub through," not "this is a tool with a time setting." Every existing competitor treats time as a setting; making it the spine is a positioning lever.

2. **Make the URL a first-class share affordance.** Every moment of awe is a copyable second. Pre-rendered OG cards convert the artifact into a vector of communication, not just a destination. Maya's J1 resolution ("she copies the URL — it has the timestamp baked in — and sends it to her sister") is design-able: the address bar reflects the current second at all times; share is implicit, not modal.

3. **The HUD as a quiet scientific instrument panel.** Monospace simulation dates, AU distances with significant-figures precision, instrument-shutoff status as a small typographic legend that updates as ISS / UVS / PLS / LECP go offline across the decades. Not gamified UI. Part of the AiRT register, not separate from it.

4. **The Pale Blue Dot scene as a designed event.** The spacecraft turn is choreographed, not procedurally interpolated. The frustum sweep is timed to Maya pausing for thirty seconds. The NASA photo plates composite in at the historically-correct instants with a typographic register that matches the chapter copy. This is the scene every other decision serves.

5. **Restraint as a design move.** No lens flares. No invented sound effects. No orbital-mechanics-violating maneuvers for drama. The Golden Record audio off by default. The chapter copy short. The HUD dismissable. The product is allowed to be beautiful, not allowed to be fictional — and the *restraint* is the signal that this is the work of someone who respects the mission.

---

<!-- UX design content will be appended sequentially through collaborative workflow steps -->
