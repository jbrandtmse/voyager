# Epic 1–6 End-to-End Review Bug Report

**Date:** 2026-05-26
**Reviewer:** lead (Claude Opus 4.7) via Chrome DevTools MCP
**Branch:** `epic6` HEAD `317d380` (post-cross-review-fixes commit)
**Build:** production via `npm run build` → `web/dist/`
**Preview server:** `npx vite preview --port 4173`
**Test viewport:** 1280×720
**Methodology:** Systematic walk-through of every visually/audibly testable story across Epics 1–6, reading the story `.md` ACs and testing each chapter URL + key interactive features (HUD, scrubber, play button, audio toggle, help overlay, chapter index, keyboard shortcuts).

---

## E2E-BUG-001 (HIGH) — Launch chapters cold-load camera at world origin (= inside the Sun)

**Severity:** HIGH (defining visual quality regression at the very first thing users see)
**Stories implicated:** 2.1 (ChapterDirector + 11 chapter specs), 4.2 (VoyagerCameraController), 4.5 (encounter cold-load), 4.12 (heliocentric view)
**Reproduction:** Navigate to `/` (home) or `/c/launch-v1` or `/c/launch-v2`. Canvas shows a HUGE featureless yellow region filling the bottom-right ~30% of the screen.

**Evidence:**
- At `/c/launch-v1` cold-load, the huge yellow region dominates the canvas
- Pressing `V` toggles to heliocentric view (camera at 10 AU on +Z) — the Sun shrinks to a tiny dot, trajectory arcs become visible
- Pressing `V` again toggles back, and the "back" view also shows a small Sun (not the cold-load state)

**Root cause:** `web/src/main.ts` cold-load camera replay logic only handles three branches:
1. `heliocentricView.enabled` → `applyHeliocentricFraming`
2. `initialActiveChapter === null` (cruise) → `applyDefaultFraming`
3. `initialActiveChapter.defaultFraming !== undefined` (encounters) → `applyDefaultFraming`

Launch chapters (`launch-v1`, `launch-v2`) have a chapter spec WITHOUT `defaultFraming` and WITHOUT `targetBody`. They fall through all three branches. The camera stays at the engine default position `(0, 0, 0)` (world origin = Sun barycenter). The Sun (696,000 km radius) at zero distance fills the entire canvas as a featureless yellow disc.

**Suggested fix:** In `main.ts` cold-load block, change the condition from:
```ts
} else if (initialActiveChapter.defaultFraming !== undefined) {
```
to:
```ts
} else {
  // Launch / non-encounter chapter with no explicit defaultFraming —
  // resolver chain falls through to cruise-default (heliocentric 10 AU).
```
So launch chapters also call `applyDefaultFraming`, which will resolve via `defaultFramingFallback` to the cruise default (Sun-centered ~10 AU on +Z).

**Test gap:** L4 Playwright suite captures launch chapter screenshots but baseline-vs-self diff passes because the baseline was captured with the broken state. Same false-greening as the Epic 5 BUG-E5-007 + cross-review BUG-CR-003 — a re-baseline against a known-good frame would catch this.

---

---

## E2E-BUG-002 (MED) — PBD photo plates render as visible rectangular boxes against starfield

**Severity:** MED (visual polish at the hero PBD scene)
**Stories implicated:** 5.3 (photo-plate compositing pipeline)
**Reproduction:** Navigate to `/c/pale-blue-dot`, press Space to play, and wait for the substate sequence to fire the Venus/Earth/Jupiter/Saturn/Uranus/Neptune plates. Each plate renders as a visible square against the surrounding starfield.

**User feedback (2026-05-26):** "Pale blue dot looks like a box."

**Root cause:** The NASA Planetary Photojournal source plates (PIA00452, PIA00453) are NOT pre-masked to pure-black borders. They retain visible sensor noise + film-grain coloration around the iconic content. With the prior `mixBlendMode: 'normal'` setting (chosen to avoid oversaturating the iconic Earth pixel), the dark-but-not-black plate borders rendered as a hard rectangle over the starfield. Per-pixel inspection of `/images/pbd/venus.08f78ea9.png` shows ~30–50 brightness values throughout the "background" area with clear blue/purple coloration — never pure black.

**Fix applied (commit pending):** `web/src/chapters/pale-blue-dot/composite-layer.ts`:
1. Switched `mixBlendMode` from `'normal'` to `'lighten'` — for each pixel, the compositor picks the brighter of (plate, starfield). Where the plate is darker than the starfield (most of the Earth plate), the starfield shows through unchanged.
2. Added a `mask-image: radial-gradient(circle, black 0%, black 55%, transparent 95%)` to fade plate corners to alpha 0. The rectangular outline disappears; what remains is a soft-edged circular patch.

**Current state:** Plate edges are no longer hard rectangles; the visible composite reads as a soft-edged patch. However, the sensor-noise coloration in the plate's "background" area is still visible (since `lighten` only suppresses pixels darker than the starfield). May still read as "a colored circle" to some viewers.

**Remaining option if user-confirmation rejects current state:** pre-process source plates at bake time to alpha-mask pixels below a luminance threshold (in `web/scripts/build_pbd_plates.ts`), so the plate carries true transparency and the iconic content sits cleanly on the starfield.

---

## E2E-BUG-003 (LOW) — PBD chapter cold-load shows no photo plate at /c/pale-blue-dot

**Severity:** LOW (UX/discoverability)
**Stories implicated:** 5.1 (PBD substates)
**Reproduction:** Navigate directly to `/c/pale-blue-dot`. The chapter copy references "a single bright pixel suspended in a scattered sunbeam" but no plate is visible until the user presses Play and waits.

**Status:** May be by design (the substates animate over time as the simulation plays). However the cold-load gap between "narrative references iconic image" and "no image is shown" feels broken on first visit.

**Suggested fix:** On cold-load to `/c/pale-blue-dot` (no `?t=` parameter), seed the URL to land directly at the composite_active substate peak ET so the iconic Earth plate is the first thing the user sees. Press Play would then advance through the substate decay + cleanup.

---

(More bugs will be appended as the walkthrough continues.)
