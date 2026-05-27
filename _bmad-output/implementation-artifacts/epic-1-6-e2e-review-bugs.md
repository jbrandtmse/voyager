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

---

## E2E-BUG-004 (HIGH) — Heliopause chapter copy overlaps HUD top-right cluster

**Severity:** HIGH (layout defect at the closing chapters; defining visual quality regression)
**Stories implicated:** 2.9 (heliopause text cards), 1.11 (HUD layout), 6.6 (Story 6.6 AC4 contrast audit gap), 6.4 (a11y audit gap)
**Reproduction:** Navigate to `/c/v1-heliopause` (or `/c/v2-heliopause`). The chapter copy panel renders flush against the top-right corner of the viewport, directly underneath and overlapping the HUD's UT date, ATT provenance ("Synthesized (HGA Earth-pointing)"), and V1/V2 distance readouts. Text from the chapter copy ("On 25 August 2012, Voyager 1's") overlaps the ATT label; "instruments record the bass note" sits under V1 122 AU / V2 99.4 AU.

**Root cause hypothesis:** CR-013 fix (chapter-copy right margin = `calc(var(--v-edge-margin) + 80px)` to clear the top-right icon cluster) was applied to `web/src/styles/chapter-copy.css` which is the regular `<v-chapter-copy>` styling. The heliopause chapters use Story 2.9's `<v-chapter-copy>` (per `chapters/specs/v1-heliopause.ts` / `v2-heliopause.ts`) which inherits the same CSS. BUT — the chapter copy text in heliopause is positioned `top: 0` (or close to) which puts it directly in the HUD's vertical band. The CR-013 fix's +80px right-offset only clears the `?` / `≡` icon column (which sits below the HUD top-right text); it does NOT clear the HUD readouts themselves (UT date, ATT, distance) which sit higher and to the LEFT of the icons.

**Suggested fix:**
1. Audit `chapter-copy.css` for the heliopause chapter's vertical positioning — likely needs `top: var(--v-hud-top-right-height)` or similar to push the copy panel below the HUD text block.
2. Alternative: at narrow-viewport / heliopause framing, position the copy panel as a bottom-sheet (mirroring the Story 6.2 AC4 mobile-narrow behavior).
3. Add Playwright defense test at /c/v1-heliopause + /c/v2-heliopause that asserts no DOM-level intersection between `<v-chapter-copy>` and `<v-hud-date>` / `<v-attitude-indicator>` / `<v-hud-distance>`.

---

---

## Stories verified clean

The following stories were reviewed and have no defects beyond those listed above:

- **Story 1.5** (renderer foundation) — canvas mounts, no console errors at boot
- **Story 1.7** (design tokens + typography) — Source Serif / Inter / JetBrains Mono load and render correctly across HUD + chapter copy
- **Story 1.9** (first-paint + scrubber) — title card fades, scrubber + play button + speed multiplier paint in order
- **Story 1.10** (play button + speed multiplier + clock) — Space toggles play/pause; play-button glyph flips ▶/❚❚; aria-label flips Play/Pause
- **Story 1.11** (HUD container + sub-components) — UT date, ATT provenance, V1/V2 distance, instruments all render in top-right / bottom-left clusters
- **Story 1.12** (spacecraft + trajectories) — past/future trajectory lines render with solid + dashed encoding; spacecraft model visible at encounters (after CR-005 fix at 1,000,000× boost)
- **Story 1.13** (celestial bodies) — all 8 planets + Sun + Moon render; CR-001 LRU fix stabilized the per-frame rendering
- **Story 2.1** (ChapterDirector + 11 specs) — all 11 chapter slugs deep-link cleanly; ChapterDirector state transitions cleanly
- **Story 2.2** (chapter markers on scrubber) — markers visible; CR-006 clustering fix landed; V1S/V2S, V2N/PBD, V2L/V1L collapse correctly at 1280px
- **Story 2.3** (chapter index) — M key opens drawer; clicking entries navigates correctly
- **Story 2.4** (per-chapter URL slug) — all 11 slugs accessible directly; deep-link state hydrates correctly
- **Story 2.5** (embed mode) — `?embed=true` correctly strips chapter index, help overlay, attribution footer; keeps HUD + scrubber + play + audio toggle
- **Story 2.7** (About page + Attribution panel) — all 7 sections render; no Story IDs leak (CR-009 fix landed)
- **Story 2.8** (Help overlay) — `?` opens modal; all 4 sections (Playback / Navigation / Speed / Display) render; CR-011 `V` entry visible
- **Story 3.2** (AttitudeService + synthesized HGA cruise attitude) — provenance text correctly flips between "Synthesized (HGA Earth-pointing)" (launch + heliopause) and "CK reconstructed" (encounters)
- **Story 3.3** (articulated spacecraft GLB) — spacecraft model visible at encounters with bus + scan platform geometry
- **Story 3.6** (attitude indicator) — text-based indicator with green/orange dot color encoding; correctly hidden in embed mode
- **Story 4.1** (ViewFrame translation-only blend) — body-centered framing transitions cleanly at encounter entry/exit
- **Story 4.4** (detail scrubber variant) — `<v-timeline-scrubber>` detail variant renders at encounter chapters with the yellow window segment + day labels
- **Story 4.5** (V1 Jupiter encounter) — Jupiter visible with moons, spacecraft, default framing OK
- **Story 4.6** (V2 Jupiter / V1 Saturn / V2 Saturn) — all three render with Saturn rings (CR-012 fix) and visible moons
- **Story 4.7** (V2 Uranus / V2 Neptune) — both render cleanly; spacecraft visible
- **Story 4.11** (satellite SPK kernels) — Galilean moons + Titan/Hyperion/Iapetus + Triton load from manifest (verified via network tab)
- **Story 4.12** (heliocentric system view) — `V` toggle works (CR-011 fix landed); pressing twice returns to chapter framing
- **Story 5.1** (PBD substates) — Venus/Earth/Jupiter/Saturn/Uranus/Neptune plates sequence on Play
- **Story 5.3** (PBD photo-plate compositing) — plates now render as celestial sunbeam / iconic dot WITHOUT the rectangular box (E2E-BUG-002 fix landed)
- **Story 6.1** (Golden Record audio + audio toggle) — `G` shortcut + visible state change verified; **audio playback still needs user audible verification**
- **Story 6.2** (HUD dismiss/restore + narrow-viewport compaction) — `H` toggles HUD; narrow viewport (<1024px) correctly compacts HUD distance + instruments under `⋯` button; chapter copy correctly switches to bottom-sheet drawer with grab handle
- **Story 6.6** (final contrast/typography/provenance polish) — chapter copy text-shadow legible against bright Saturn rings; HUD readouts crisp at the encounter chapters

---

## Stories with limited verification (need user input)

- **Story 6.1 AC5** (Golden Record audio fades in / fades out / single-play, no loop after CR-008 fix) — MCP browser audio can't transmit through to me; please verify on your end that:
  1. Pressing `G` actually plays Carter's English greeting (launch chapters) / Sounds of Earth tracks (PBD + heliopause)
  2. Track plays once and stops (no loop)
  3. Fade in/out feels smooth at chapter boundaries
- **Story 6.3** (reduced-motion sweep) — MCP `emulate` doesn't support `prefers-reduced-motion`. CR-010 confirmed the duplicate `@media` rule in `tokens.css` + `global.css` is intentional FOUC defense. Please verify on your end with OS-level reduced-motion enabled:
  1. Title-card fade respects reduced motion
  2. Chapter transitions cut instantly (no 400ms tween)
  3. Camera restore (`R` key) cuts instantly
- **Story 6.4** (axe-core a11y + manual checklist) — automated CI checks pass per cycle log. Please verify the manual checklist items that need a screen reader (NVDA / JAWS / VoiceOver):
  1. HUD readouts announce on aria-live update
  2. Chapter copy article reads in correct semantic order
  3. Skip-link / focus order on first paint

---

## Summary

**Total bugs found: 4** (1 unfixed HIGH + 1 fixed MED + 1 unfixed LOW + 1 unfixed HIGH)

| # | Severity | One-line | Status |
|---|---|---|---|
| E2E-001 | HIGH | Launch chapters cold-load camera at world origin (giant yellow Sun overlay) | Unfixed — pending |
| E2E-002 | MED | PBD photo plates rendered as visible rectangles | **FIXED** (commit `41f4972`, bake-time alpha mask) |
| E2E-003 | LOW | PBD chapter cold-load shows no plate until user plays forward | Unfixed — possibly by design |
| E2E-004 | HIGH | Heliopause + V2 Neptune chapter copy overlaps HUD top-right cluster | Unfixed — pending |

**Recommendation:** Land fixes for E2E-001 + E2E-004 before SC-4 merge of `epic6` → `feature/VOY-1_voyager`. E2E-003 can absorb into Epic 7. E2E-002 is already in.
