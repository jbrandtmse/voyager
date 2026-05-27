# Epic 6 Cross-Review Bug Report

**Date:** 2026-05-25
**Reviewer:** lead (Claude Opus 4.7) via Chrome DevTools MCP
**Branch:** `epic6` HEAD `11f6114` (post-retrospective commit, pre-SC-4-merge)
**Build:** production via `npm run build` → `web/dist/`
**Preview server:** `npx vite preview --port 4173`
**Test viewport:** 1280×720
**Methodology:** Manual + MCP-driven verification across Epic 1–6 stories. User-driven visual capture pinpointed defects that automated DOM/canvas inspection failed to surface (race conditions, transient render states).

---

## Headline

The Epic 6 retrospective declared all 7 stories as "complete" with a 3875 vitest pass and 4-warning lint baseline. A cross-review of the deployed production build at `epic6` HEAD reveals **7 substantive defects across the full mission lifecycle**, including a previously-missed photosensitive-epilepsy-class flicker in the HUD distance readouts. Several defects span multiple stories' contracts (Story 1.11 HUD, Story 1.12 trajectories, Story 1.13 planet textures, Story 3.5 boresight cone, Story 4.1 ViewFrame, Story 6.1 audio toggle layout, Story 6.2 marker clustering + gutter, Story 6.4 a11y audit, Story 6.6 contrast audit).

**Recommendation:** Treat this as Epic 5-class cross-review surfacing (parallel to BUG-E5-007 et al.). Resolve before SC-4 merge of `epic6` → `feature/VOY-1_voyager`. Several of these defects would have been caught by the friendly-user qualitative testing (Story 6.5 Probe #5 unprompted attitude perception) — they materially defeat the differentiator-perception launch gate per the PRD.

---

## BUG-CR-001 (HIGH) — HUD distance readouts flicker between numeric and placeholder at ~4 Hz

**Severity:** HIGH (photosensitive-epilepsy class + visual quality + NFR-A6 audit gap)
**Stories implicated:** 1.11 (HUD), 6.4 (NFR-A6 audit), 6.5 (friendly-user differentiator probe)
**Reproduction:** Navigate to `/c/v1-jupiter` (any encounter chapter); the `<v-hud-distance>` V1 + V2 rows oscillate between `"5.28 AU"` / `"4.78 AU"` and `"— AU"` placeholders at sub-second cadence with the simulation paused.

**Evidence (DOM query over 6s at 250ms intervals):**

| Time (ms) | V1 | V2 |
|---|---|---|
| 0    | 5.28 AU | — AU |
| 250  | — AU   | — AU |
| 500  | 5.28 AU | — AU |
| 750  | — AU   | 4.78 AU |
| 1000 | 5.28 AU | 4.78 AU |
| 1250 | — AU   | — AU |
| 1500 | 5.28 AU | 4.78 AU |
| 1750 | — AU   | — AU |
| 2000 | 5.28 AU | — AU |
| …    | (continues alternating) | |

24/24 samples in 6 seconds: only **2 samples (8%)** had BOTH spacecraft showing real values; the rest oscillate. Date readout (`1979-03-05 12:05`) stays stable — clock is paused.

**Root cause hypothesis:** Race condition between the two spacecraft's distance computations and the DOM render cycle. The HUD-tick subscriber appears to be invalidating + re-fetching distance per-frame; one of the two ephemeris lookups frequently returns null/NaN before the chunk is fully ready, falling back to the em-dash placeholder. Next tick the values may populate but the OTHER spacecraft loses; net effect is ~4 Hz alternation.

**NFR-A6 implication:** ~4 Hz text flicker on a primary HUD readout is at the photosensitive-epilepsy threshold (WCAG 2.2 SC 2.3.1: no content flashes more than 3 times per second). Story 6.4 AC5 audit called NFR-A6 a PASS via static analysis (zero `@keyframes`, zero `setInterval`). **The static analysis missed this defect class entirely** — race-condition-driven re-renders aren't keyframes or timers but produce identical visual symptoms.

**This may also be the root of the user-reported "Sun flashing on screen with a horizontal line flashing"** observation — the HUD distance row right next to the chapter title position would visually register as "something near the top is flashing".

**Suggested fix:**
1. Short-term: Cache last-known-good distance per body; only fall back to `"— AU"` after N consecutive null reads (N ≥ 5).
2. Proper fix: Make the HUD-tick subscribe to ChunkLoader's `onChunkReady` for the relevant Voyager trajectory chunks; only compute distance after both V1 + V2 trajectory chunks at the current ET are confirmed cached. Remove the per-frame em-dash fallback for steady-state.
3. **Add NFR-A6 expanded audit to Story 6.4 manual a11y checklist:** runtime DOM-mutation observer for HUD elements; flag any element whose text content changes > 3 times/sec.

---

## BUG-CR-002 (HIGH) — Play button + Audio toggle + Scrubber overlap `<v-hud-instruments>` labels

**Severity:** HIGH (Story 6.6 AC4 contrast audit failure + Story 6.2 AC6 gutter fix incomplete)
**Stories implicated:** 1.11 (HUD), 6.1 (audio toggle), 6.2 (AC6 gutter fix), 6.6 (AC4 contrast)
**Reproduction:** Any chapter view at 1280×720 viewport. Visible in bottom-left strip of every screenshot.

**Pixel-precise overlap data (verified via `getBoundingClientRect`):**

| Element | Left | Right | Top | Bottom |
|---|---|---|---|---|
| HUD `<v-hud-instruments>` (V1 row) | 38 | 251 | 644 | 661 |
| HUD `<v-hud-instruments>` (V2 row) | 38 | 251 | 665 | 682 |
| Individual labels (ISS / UVS / PLS / LECP) | 63–251 | varies | 644–682 | varies |
| Play button | 38 | 82 | 638 | 682 |
| Audio toggle | 90 | 134 | 638 | 682 |
| Mission scrubber | 146 | 1020 | 670 | 682 |
| Detail scrubber | 146 | 1020 | 627 | 652 |

**Three distinct overlaps:**
1. Play button (38–82) covers V1+V2 row's "V1"/"V2" craft label (38–55) + "ISS" instrument (63–85)
2. Audio toggle (90–134) covers "·UVS·" separator + UVS label (97–138)
3. Mission scrubber's first 105 px (146–251) at y=670–682 cuts through V2 row's "·PLS·LECP" labels (150–251) at y=665–682

**Root cause:** Story 6.2 AC6 fix added a +108 px gutter to the **scrubber's** `left` CSS to clear the play button (44 px) + audio toggle (44 px) + gaps. But:
- `<v-hud-instruments>` itself was never given a left gutter — still renders at `left: var(--v-edge-margin)` (38 px)
- The scrubber gutter only clears the play+audio buttons themselves; it does NOT clear the instrument-labels row that runs full-width to x=251

**Verification gap:** Story 6.6's contrast-audit doc explicitly says "every text+background pair passes WCAG 2.2 AA". It did NOT audit the overlap state (text covered by interactive button = effectively 0 contrast). The audit assumed a clean separation between text and interactive controls.

**Suggested fix:**
- Path A (CSS-only, minimum-touch): add `padding-left: 108px` to the `<v-hud-instruments>` host so labels start at x=146 (after the button column). Affects the V1/V2 row layout and shifts labels right.
- Path B (preferred, structural): restructure the bottom HUD chrome into an explicit flex/grid: `[v-play-button] [v-audio-toggle] [v-hud-instruments] [v-timeline-scrubber] [v-speed-multiplier]` as siblings, not fixed-positioned overlays. This eliminates the class of overlap defect entirely.

---

## BUG-CR-003 (HIGH) — Jupiter (and likely other planets) rendering as featureless solid yellow disc

**Severity:** HIGH (visual quality / mission credibility)
**Stories implicated:** 1.13 (celestial bodies), 4.3 (4K/8K texture upgrade)
**Reproduction:** Navigate to `/c/v1-jupiter`; let camera frame settle on Jupiter close-approach. The planet renders as a plain pale-yellow sphere with no cloud bands, no Great Red Spot, no surface texture. (Initial wide view shows Jupiter as small dot, possibly textured; the texture failure manifests on close approach.)

**Confirmed via user's screenshot:** Giant pale-yellow disc occupies ~40% of canvas at V1 Jupiter encounter; no bands, no spot. Same featureless yellow as Sun rendering at launch chapters — suggests either (a) Jupiter's KTX2 texture failing to bind silently, (b) wrong texture path resolving to Sun fallback, or (c) `GPUCapabilityProbe.adequateForEightK` heuristic returning a false-fail path that selects an unimplemented fallback.

**Likely cause based on Story 4.3 history:**
- Story 4.3 introduced 4K → 8K KTX2 textures with `GPUCapabilityProbe.adequateForEightK` (`MAX_TEXTURE_SIZE >= 16384` heuristic)
- The deferred-work entry `[4.3 / LOW]` at `deferred-work.md:779` flagged this heuristic as fragile
- If the heuristic is returning the wrong tier OR the KTX2 fetch is silently 404'ing in production, the Three.js material falls back to its base color (yellow per Jupiter's basic config)

**Test gap:** Story 4.3 + Story 4.9 + Story 6.3 L4 Playwright suites have baselines at multiple chapters including V1 Jupiter. The L4 baselines apparently capture the broken state — so pixel-diff-vs-self is clean. This is the same class of false-green that BUG-E5-007 exploited.

**Suggested fix:**
1. Check console + network log for the actual Jupiter KTX2 fetch — confirm 200 vs 404.
2. Verify `GPUCapabilityProbe.adequateForEightK` returns expected value on this GPU.
3. Add a defense test: at /c/v1-jupiter, after camera framing settles, sample the Jupiter planet sphere center pixel — if all three channels are within 5% of pure pale-yellow (`#F0DCAA` or similar), the texture failed to bind and the test should FAIL. Similar for other gas giants.

---

## BUG-CR-004 (MED) — Thin trajectory line flickers per-frame at deep zoom

**Severity:** MED (potential NFR-A6 photosensitive concern + visual quality)
**Stories implicated:** 1.5 (floating-origin), 1.12 (past-solid/future-dashed trajectories)
**Reproduction:** /c/v1-jupiter at encounter close-up. A thin nearly-horizontal line crosses the canvas left half (~y=420) passing behind the planet.

**User observation:** "Sun flashing on the screen with what looks a nearly horizontal line also flashing."

**Likely cause:** At ~5.2 AU from solar origin with body-centered camera framing, trajectory line vertices are in km-scale render space with floating-origin recentering each frame. Sub-pixel reposition + thin-line rasterization without MSAA can flicker on/off per frame at the GPU level. The flicker is GPU/driver dependent (not reproducible in SwiftShader headless rendering, but present on user's GPU).

**Cross-reference with BUG-CR-001:** The "flashing" observation may be partially or fully explained by BUG-CR-001 (HUD distance flickering at 4Hz). However the trajectory line flicker is a separate concern that would manifest visually even after BUG-CR-001 is fixed.

**Suggested fix:**
1. Snap floating-origin offsets to integer pixels for line geometry (preserves sub-pixel accuracy for spheres + spacecraft but stabilizes lines).
2. Or enable MSAA on the line layer's framebuffer.
3. Or thicken trajectory lines slightly so sub-pixel sampling absorbs jitter.

---

## BUG-CR-005 (HIGH) — No spacecraft / scan platform / narrow-angle boresight cone visible at V1 Jupiter encounter

**Severity:** HIGH (Epic 3 differentiator + Story 6.5 launch-gate probe blocker)
**Stories implicated:** 1.12 (spacecraft GLB), 3.3 (articulated GLB), 3.4 (per-frame attitude), 3.5 (NAC boresight cone), 3.6 (attitude indicator)
**Reproduction:** /c/v1-jupiter at encounter close-up. No identifiable Voyager spacecraft, scan platform, or camera frustum cone visible anywhere on canvas.

**Critical context — Story 6.5 Probe #5 (the launch gate):**
> "UNPROMPTED ATTITUDE PROBE — THIS IS THE LAUNCH GATE per the PRD ('anything you noticed about the spacecraft itself?'). Success: user mentions ANY of: the spacecraft turning, the scan platform articulating, the camera/instrument pointing changes, the attitude-indicator CK/synth distinction. Failure: user only notices the spacecraft's position."

If the spacecraft itself is not visually rendered (or invisible behind the giant Jupiter sphere), users cannot mention "the spacecraft turning" — Probe #5 is **automatically failed** before sessions even start. The differentiator-perception launch gate per the PRD cannot be met.

**Possible causes:**
1. Spacecraft occluded by oversized Jupiter sphere (BUG-CR-003 cascade)
2. Spacecraft rendering at wrong scale (Story 4.3 cadence-shift regression?)
3. Spacecraft GLB failed to load — would surface in console
4. Camera framing has spacecraft outside frustum

**Diagnostic next step:** open the page, navigate to /c/v1-jupiter, scrub to closest approach, inspect Three.js scene graph for spacecraft mesh visibility + position; check console for GLB load errors.

---

## BUG-CR-006 (HIGH) — Chapter marker clustering algorithm not firing on mission scrubber

**Severity:** HIGH (Story 6.2 AC5 explicit fix; Epic 5 retro Action item #2)
**Stories implicated:** 2.2 (chapter markers), 6.2 AC5 (clustering algorithm)
**Reproduction:** Any chapter view. Bottom scrubber strip shows chapter marker labels colliding.

**Visible label collisions (from user's screenshot at /c/v1-jupiter):**
- `V12S` — V1S (1980-11-12) + V2S (1981-08-26) labels smashed into one string
- `V2PBD` — V2N (1989-08-25) + PBD (1990-02-14) labels smashed into one string
- `V2L V1L` — V2L (1977-08-20) + V1L (1977-09-05) crammed close together

**Expected per Story 6.2 AC5:** "Mission scrubber renders dual-markers at intra-decade chapter clusters; no label overlap; clickable for both chapters." The known clusters V2L/V1L, V1J/V2J, V1S/V2S, V2N/PBD should each collapse into a single dual-marker like "V1S / V2S" with both anchor positions clickable.

**Test gap:** Story 6.2 added `marker-cluster.test.ts` (22 tests) + `v-timeline-scrubber-clustering.test.ts` (7 tests), all passing. The lib is being unit-tested in isolation but the wire-up to the actual scrubber render path at production mission-scrubber width (1280px viewport) is NOT being exercised. OR the threshold for "overlap" is too tight and is letting V1S+V2S squeak by as non-overlapping when their labels actually do collide.

**Suggested fix:**
1. Investigate the scrubber's render-path wire-up of `marker-cluster.ts`; verify the function is called with the actual rendered widths.
2. Tighten the overlap threshold (likely the label-width estimator under-counts kerning).
3. Add a Playwright defense test that mounts the production mission-scrubber at 1280×720 and asserts visually distinct labels at the 4 known clusters.

---

## BUG-CR-007 (MED) — Chapter copy text contrast inadequate over bright Jupiter sphere (Story 6.6 AC4 verification gap)

**Severity:** MED (Story 6.6 AC4 audit gap; visual polish)
**Stories implicated:** 6.6 AC4 (text-shadow legibility on bright canvas)
**Reproduction:** /c/v1-jupiter at encounter close-up. Chapter copy text overlays the bright Jupiter sphere; contrast materially reduced.

**Note:** This is **cascading from BUG-CR-003**. Once Jupiter renders at correct scale + texture, the chapter copy + planet won't overlap as severely. However, the Story 6.6 AC4 audit's promise to verify "Sun close-up, planet close-ups, the Saturn rings" was not actually fulfilled for this scenario — either because the audit assumed a different (correct) Jupiter rendering, or because the audit doc was written by reading code paths instead of by capturing actual screenshots at the listed scenes.

**Recommendation:** Once BUG-CR-003 is fixed, RE-RUN Story 6.6 AC4's contrast audit with actual production screenshots at the listed bright-backdrop scenes (Sun close-up, V1 Saturn rings, etc.). Update `docs/accessibility/contrast-audit-launch-week.md` with real before/after data.

---

## Cross-cutting observations

### L4 Playwright baselines have been false-greening regressions

Stories 4.9, 5.4, and 6.3 all added L4 Playwright baselines that were captured WITH the BUG-CR-003 broken Jupiter texture, BUG-CR-006 marker clustering failure, and BUG-CR-001 distance flicker present. Pixel-diff-vs-self runs clean. This is exactly the failure mode BUG-E5-007 exploited in Epic 5.

**Recommendation:** Before the Story 6.6 AC9 step (b) L4 baseline re-capture, FIRST fix BUG-CR-003 / 001 / 006. Re-capturing baselines under the broken state perpetuates the regression. Story 7.0 should own this sequencing.

### Story 6.4 axe-core a11y gate did NOT catch BUG-CR-001's photosensitive concern

Story 6.4 AC5 audited NFR-A6 via static analysis: "zero `@keyframes`, zero `setInterval` in components". This audit type fundamentally cannot detect race-condition-driven flicker. The audit's verdict of PASS is technically correct but operationally misleading.

**Recommendation:** Add a runtime audit to the manual a11y checklist: with the simulation paused at each Golden-Record / encounter chapter window, observe each HUD readout for 5 seconds and confirm no text element changes content more than once per second. If any does, file as photosensitive-epilepsy concern.

### Story 6.5's friendly-user launch gate is blocked by BUG-CR-001, 003, 005

Probe #5 (unprompted attitude perception at V1 Jupiter) and Probe #6 (PBD unprompted reconstruction) cannot reasonably succeed when:
- The spacecraft is not visible (BUG-CR-005)
- The planet rendering is broken (BUG-CR-003)
- The HUD readouts are flickering (BUG-CR-001 — distracts attention from the spacecraft)

**Recommendation:** Block the friendly-user session execution (Story 6.5 out-of-band gate) until BUG-CR-001 / 003 / 005 are resolved. Running sessions in this state would waste recruitment effort.

---

## Suggested triage priority order

1. **BUG-CR-001** (HUD distance flicker) — fixes the photosensitive-epilepsy concern + user's visible "flashing" report
2. **BUG-CR-003** (Jupiter texture / scale) — fixes the most visible visual quality defect
3. **BUG-CR-005** (no spacecraft visible) — likely cascades from BUG-CR-003 or related; needed before friendly-user sessions
4. **BUG-CR-002** (bottom-left chrome overlap) — fixes the layout defect at launch viewport
5. **BUG-CR-006** (marker clustering) — fixes the Epic 5 retro Action item #2 regression
6. **BUG-CR-004** (trajectory line flicker) — fix once GPU-tier defense is verifiable
7. **BUG-CR-007** (chapter-copy contrast) — likely auto-resolves after BUG-CR-003

---

## Out-of-scope (NOT bugs in epic6 HEAD, but worth noting)

- The MCP-driven testing workflow itself surfaced none of these on its own — required user-driven visual capture to reveal. Future Epic 7 cross-browser + real-device matrix work (Story 7.7) is the natural landing for systematizing this kind of cross-cutting visual verification.

---

## Phase 2–10 Findings (appended after maintainer authorized continued testing)

### Phase 2 — Keyboard shortcuts (Stories 1.10, 2.8, 6.1 AC3, 6.2 AC1)

✅ **All keyboard shortcuts work cleanly.**

- `?` opens help overlay (Story 2.8) — dialog renders with all sections (Playback / Navigation / Speed / Display) and full keyboard inventory
- `Esc` closes overlay (Story 2.8 contract)
- `G` toggles audio (Story 6.1) — `aria-pressed` flips, `aria-label` swaps between "Turn Golden Record audio on" / "off", glyph swaps 🔇 / 🔊
- `H` dismisses HUD (Story 6.2 AC1) — `data-dismissed="true"`, `opacity: 0`, `pointer-events: none`
- `H` again restores HUD — `data-dismissed="false"`, `opacity: 1`
- `Space` play/pause (Story 1.10) — play-button glyph swaps ▶ / ❚❚, `aria-label` flips "Play" / "Pause"

User-verified independently: audio playback works (Story 6.1 AC5).

### Phase 3 — Chapter navigation (Stories 2.1, 2.2, 2.3, 2.4)

✅ All 11 chapter URL deep-links navigate successfully and load chapter copy + HUD chrome after ~5s wait.

🟡 **Observation:** Scene render after deep-link navigation takes ~5s to fully load. The first-paint title-card ("Voyager. 1977 to 2030.") shows during this transition window. Acceptable but worth noting — a too-short `wait_for` resolves before the scene loads, which is what initially caused me to misread BUG-CR-009 (now retracted).

### Phase 4 — Encounter scenes (Stories 3.x, 4.5–4.7, 4.10)

🔴 **BUG-CR-003 confirmed at BOTH Jupiter encounters** (V1 + V2): giant featureless yellow disc covering ~40% of canvas.

🟡 **Saturn (V1+V2), Uranus (V2), Neptune (V2):** Render at smaller scales — planets visible as small dots, no giant-disc rendering. **However Saturn's rings are NOT visible at the V1/V2 Saturn encounters** — Saturn renders as a featureless small dot. Per Story 4.6 + 4.7, Saturn's rings should be a load-bearing feature of the encounter visualization (chapter copy explicitly references "first high-resolution photometry of the broad rings, the braided F-ring, and a new feature — radial 'spokes'"). **This is a NEW finding — let's call it BUG-CR-012 (MED): Saturn rings not visible at V1/V2 Saturn encounters.**

🔴 **BUG-CR-005 (no spacecraft) confirmed across ALL encounter chapters:** V1+V2 Jupiter, V1+V2 Saturn, V2 Uranus, V2 Neptune. None show identifiable Voyager spacecraft, scan platform, or narrow-angle boresight cone. The differentiator-perception launch gate is structurally blocked.

### Phase 5 — PBD chapter (Stories 5.1, 5.2, 5.3)

🔴 **BUG-CR-003 cascades to PBD chapter** — large featureless **pale-blue disc** dominates center-left of canvas (likely Earth at close-up substate `sweeping_earth`, OR Story 5.3's photo-plate composite failing to bind and falling back to material color). No Earth-like cloud/continent features, no scattered-sunbeam (the iconic PBD plate). **This means the texture-binding defect class affects multiple inner-system planets, not just Jupiter** — it's a broader BUG-CR-003 than originally scoped.

🔴 **Story 5.3 photo-plate compositing** appears either broken OR not visible in the substate being rendered. The PBD chapter is supposed to display NASA Photojournal plates (PIA00452 Earth canonical + PIA00453 six-panel grid) compositing in at substate peaks. Plates not visible in current screenshot.

### Phase 6 — About page + Attribution (Stories 2.7, 6.1, 5.3)

✅ About page structurally clean:
- All 5 sections present (About / Data sources / Validation / Attribution / Embed contract / Methodology)
- Golden Record audio entry correctly cites all 5 NASA-source tracks (English + Arabic greetings; Wind/Surf, Life Signs/Pulsar, Music of the Spheres)
- Embed contract section lists all 11 chapter slugs in URL contract

🟡 **BUG-CR-009 (LOW): About-page user-facing copy exposes internal Story IDs.** Examples: "Audio surface (wired in Story 6.1)" in the Data sources table, and "Cropped per body and composited at each substate peak in the Pale Blue Dot scene (Story 5.3)" in the Attribution section. These references are development artifacts; should be polished out before public ship.

### Phase 7 — Embed mode (Story 2.5)

✅ Embed-mode chrome stripping works per Story 2.5 contract:
- HUD ✓ present
- Audio toggle ✓ present (Story 6.1 AC2 — survives embed-mode chrome stripping correctly)
- Play button ✓
- Scrubber ✓
- Speed multiplier ✓
- Chapter index ✗ absent (correctly stripped)
- Help overlay ✗ absent (correctly stripped)
- Attribution footer ✗ absent (correctly stripped)

🔴 **BUG-CR-002 still visible in embed mode** — same instrument-label overlap defect. Confirms BUG-CR-002 is a base HUD layout issue, not embed-specific.

### Phase 8 — Narrow-viewport HUD compaction (Story 6.2 AC3/AC4)

✅ Compaction triggers correctly at 800×720 viewport (<1024px breakpoint per UX-DR30):
- `<v-hud-distance>` removed from DOM (collapsed under `⋯` button)
- `<v-hud-instruments>` removed from DOM (same)
- `Expand HUD` button present with `aria-label="Expand HUD"` and `aria-expanded="false"`
- `<v-chapter-copy>` renders as bottom-sheet drawer with grab-handle (per Story 6.2 AC4)

🔴 **BUG-CR-006 (marker clustering) is WORSE at narrow viewport** — visible labels `V2L V12S V1H V2H` show V1S+V2S still smashed as `V12S`. At narrower width clustering matters more, but the algorithm is not firing.

### Phase 9 — Reduced-motion preference (Story 6.3)

✅ `@media (prefers-reduced-motion: reduce)` CSS rules are present in the loaded stylesheets and target `--v-duration-*` tokens. The mechanism per Story 6.3 AC1 is structurally in place.

🟡 **BUG-CR-010 (LOW): Two duplicate `@media (prefers-reduced-motion: reduce)` rules.** One uses `0ms`, the other uses `0s`. Functionally equivalent but Story 6.3 AC1 explicitly promised "a single `@media (prefers-reduced-motion: reduce) { :root { ... } }` block — the single source of truth." The audit doc at `docs/accessibility/reduced-motion.md` contradicts the actual implementation showing TWO rules. Likely Story 1.7 (`tokens.css`) declares one and Story 6.3 (audit doc + or `global.css`) declares another. Minor cleanup needed.

### Phase 10 — Heliocentric system view (Story 4.12)

🔴 **BUG-CR-011 (MED): Story 4.12 has no discoverable user-facing affordance.** The help overlay (`?`) lists Playback / Navigation / Speed / Display shortcuts but **no entry for system view, heliocentric mode, or camera-mode toggle.** No button matching `helio|system|view` pattern anywhere in the DOM. About-page Embed contract lists chapter slugs but no heliocentric URL parameter pattern. Per Epic 4 retro, Story 4.12 shipped as "heliocentric system-view camera mode + Epic 5 prep" — but the user-facing surface is absent or undiscoverable.

**Possible scenarios:**
- The mode triggers automatically at certain chapter transitions and is never user-toggleable (would be a defensible design decision but should be documented)
- The mode exists in code but the UI affordance was deferred and never landed
- The mode is gated behind a debug flag (DEV-only via `__voyagerDebug`)

Need maintainer triage to determine intent.

### BUG-CR-008 (LOW–MED) — Golden Record audio repeats within chapter window

User-reported during interactive testing: "The audio seemed to repeat, but it was working."

**Behavior:** When entering a Golden-Record chapter window (launch / PBD / heliopause), the audio track plays correctly. If the track finishes while the simulation is still in the same chapter window, the audio loops/repeats.

**Spec ambiguity:** Story 6.1 AC5 specifies "the audio fades in over 1500ms" and "fades out cleanly when scrubbing backward across a chapter marker" — but does NOT explicitly specify single-play vs loop behavior. Looping within window may be intentional (continuous bass-note elegy) OR unintentional (HTMLAudioElement.loop=true left enabled).

**Suggested triage:** Decide spec intent. If single-play: set `audio.loop = false` and let silence cover the rest of the chapter window. If loop: document in `docs/audio/golden-record-curation.md` as intentional.

### BUG-CR-012 (MED, NEW) — Saturn rings not visible at V1/V2 Saturn encounters

**Reproduction:** Navigate to `/c/v1-saturn` or `/c/v2-saturn`, wait for scene to load. Saturn renders as a small featureless dot with no visible rings.

**Why this matters:** Saturn's rings are the iconic feature of the planet. The V1 + V2 Saturn chapter copies both extensively reference the ring system as a primary observation target ("first high-resolution photometry of the broad rings, the braided F-ring, and a new feature — radial 'spokes'"). A Saturn encounter visualization without visible rings undercuts the chapter narrative.

**Possible causes:** (a) Saturn rings GLB / texture not loading, (b) ring geometry shipped but hidden by render-order/depth issue, (c) camera framing too distant at the encounter ET to resolve the rings visually.

**Cross-reference with BUG-CR-005:** If the spacecraft + ring system are both missing, the V1+V2 Saturn chapters fail their entire visual contract.

---

## Updated bug count

**Total bugs cataloged: 12** (originally 7, +5 from Phase 2–10 sweep)

| # | Severity | One-line | Stories implicated |
|---|---|---|---|
| CR-001 | HIGH | HUD distance flickers ~4 Hz between numeric + `— AU` (photosensitive class, NFR-A6 audit missed) | 1.11, 6.4 |
| CR-002 | HIGH | Bottom-left Play/Audio/Scrubber overlap `<v-hud-instruments>` labels | 1.11, 6.1, 6.2 |
| CR-003 | HIGH | Jupiter + Earth + ?other inner planets render as giant featureless colored discs (texture-binding class defect) | 1.13, 4.3, 5.3 |
| CR-004 | MED | Trajectory line flickers per-frame at deep zoom (floating-origin sub-pixel jitter) | 1.5, 1.12 |
| CR-005 | HIGH | Spacecraft + scan platform + boresight cone NOT visible across ALL encounter chapters (Story 6.5 launch-gate blocker) | 1.12, 3.3, 3.4, 3.5 |
| CR-006 | HIGH | Marker clustering not firing — `V12S` + `V2PBD` smashed labels (Epic 5 retro Action #2 regression) | 2.2, 6.2 AC5 |
| CR-007 | MED | Chapter copy contrast inadequate over bright Jupiter (Story 6.6 AC4 audit gap; cascades from CR-003) | 6.6 AC4 |
| CR-008 | LOW–MED | Golden Record audio repeats/loops within chapter window (spec ambiguity) | 6.1 AC5 |
| CR-009 | LOW | About-page user-facing copy exposes internal Story IDs ("wired in Story 6.1", "(Story 5.3)") | 2.7, polish |
| CR-010 | LOW | Two duplicate `@media (prefers-reduced-motion: reduce)` rules contradicts Story 6.3 AC1 single-source-of-truth claim | 1.7, 6.3 AC1 |
| CR-011 | MED | Story 4.12 heliocentric system-view has no discoverable user-facing affordance (no shortcut, no button, no URL pattern) | 4.12 |
| CR-012 | MED | Saturn rings not visible at V1/V2 Saturn encounters (chapter narrative contract failure) | 1.13, 4.3, 4.6, 4.7 |

---

## Final triage recommendation

**Block SC-4 merge until at least these 4 are resolved (or explicitly accepted-as-known-defect):**

1. **CR-001** — HUD distance flicker (4 Hz photosensitive risk + main HUD readout defective)
2. **CR-003** — Giant featureless inner planets (defining visual quality issue)
3. **CR-005** — Spacecraft not visible at encounters (Story 6.5 launch-gate blocker)
4. **CR-006** — Marker clustering not firing (Epic 5 retro Action #2 regression)

The remaining 8 are MED/LOW polish that can absorb into Epic 7 Story 7.0 or a focused follow-up patch on `epic6` before merge.

**Most critical insight from this cross-review:** the Story 6.6 retrospective declared all 7 stories complete and tests green (3875 vitest pass). The actual user-facing surface has 12 defects ranging from photosensitive-epilepsy concerns to mission-narrative-breaking visual gaps. **The L4 Playwright suite's false-greening** (BUG-E5-007-class failure mode) appears to be the root structural cause — baselines capture broken state, pixel-diff-vs-self passes clean. Until L4 baselines are recaptured against KNOWN-GOOD render output (not the current state), this class of defect will continue to slip past automated gates.

