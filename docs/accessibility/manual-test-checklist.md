# Voyager Manual Accessibility Test Checklist

**Authored:** Story 6.4 (2026-05-24) — implements UX-DR36 (manual a11y checklist) + NFR-A1 (WCAG 2.2 AA) + NFR-A6 (photosensitive-epilepsy safety).

This checklist is the binding manual a11y gate for Voyager. It MUST run before every Phase milestone and before any production deploy that changes a user-facing surface. Automated coverage (axe-core component-state + route matrix per Story 6.4 AC1 + AC2) catches the mechanical conformance failures; this checklist catches the cases automation cannot: screen-reader narration quality, color-blindness disambiguation, forced-colors palette overrides, reduced-transparency scrim adaptation, and photosensitive-epilepsy safety.

## When to run

- **Before every Phase milestone** (Epic boundary).
- **Before any production deploy** that changes a HUD surface, chapter copy, control affordance, or animation timing.
- **After any change to a chapter's animation, transition, or fade timing** — re-run the photosensitive-epilepsy audit (AC5) at minimum.

Results are committed to `docs/accessibility/manual-test-runs/<YYYY-MM-DD>.md` per AC4. Any critical or serious finding blocks the next milestone until remediated.

## Cross-references

- **Reduced-motion audit** — [`docs/accessibility/reduced-motion.md`](./reduced-motion.md). The keyboard-only + VoiceOver/NVDA/TalkBack passes below cross-check against this doc.
- **Skill rules** — [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md). This checklist is invoked by Rule 16 (added by Story 6.4 — "Run the manual a11y checklist before each Phase milestone").
- **axe-core baseline** — [`web/tests/a11y/`](../../web/tests/a11y/). Automated tier. Stays in sync with this manual gate.

---

## Test pass schema

Each test pass below carries:

- **Goal** — what the pass verifies.
- **Pre-conditions** — OS / browser / assistive tech versions; mouse disconnected; etc.
- **Steps** — ordered list of operator actions.
- **PASS criteria** — explicit, observable conditions for PASS. Failure to meet any criterion is a FAIL.
- **Evidence to capture** — screenshots / screen-reader output transcripts / DevTools panel screenshots to save alongside the run record.

---

## Pass 1 — Keyboard-only navigation

**Goal:** Every primary user flow is completable with the keyboard alone. WCAG 2.1.1 Keyboard (Level A) + WCAG 2.4.7 Focus Visible (Level AA).

**Pre-conditions:**

- Mouse disconnected (USB unplugged) OR mouse pointer parked off-screen and explicitly NOT used during the run.
- Browser: Chrome stable + Firefox stable + Safari stable. Run the pass once per browser; the PASS criterion is "passes on all three". Tier-3 browsers (mobile) are covered separately by TalkBack.

**Steps + PASS criteria:**

1. **First-paint** — Load `/`. PASS: Title card "Voyager. 1977 to 2030." renders → dissolves → scene appears. After dissolve, the first tab-stop lands on the play button (visible focus ring per `--v-color-focus`).
2. **Play / pause via Space** — Press Space. PASS: clock starts; play button glyph flips to ❚❚; `aria-pressed`/`aria-label` reflects new state. Press Space again. PASS: clock pauses; glyph reverts; labels reflect.
3. **Scrub via Arrow keys** — Tab to the timeline scrubber. Press ArrowRight. PASS: HUD date advances by 1 day; clock pauses if it was playing; visible focus ring is on the slider thumb.
4. **Scrub by 10 — Shift+Arrow** — From the scrubber, press Shift+ArrowRight. PASS: HUD date advances by 10 days.
5. **Mission bounds — Home / End** — From the scrubber, press Home. PASS: date jumps to 1977-08-20. Press End. PASS: date jumps to 2030-12-31.
6. **Speed multiplier** — Tab to the speed slider. Press `+`. PASS: rate jumps to next decade stop (e.g., 1× → 10×). Press `-`. PASS: rate steps back. Press Home / End. PASS: 1× / 1,000,000×.
7. **Chapter index — M shortcut** — Press `M`. PASS: chapter index opens; first chapter is focused; `aria-expanded="true"` on toggle.
8. **Chapter jump — Enter** — In the open index, use ArrowDown to highlight a chapter, press Enter. PASS: index closes; scrubber + HUD jumps to chapter anchor; URL updates to `/c/<slug>`.
9. **Chapter jump — number key** — Press `3`. PASS: jumps to the third chapter (per the listbox's numeric shortcut) without opening the index.
10. **Help overlay — `?` shortcut** — Press `?` (Shift+/ on US keyboards). PASS: help dialog opens; focus lands on the Close button (initial focus per AC5); Tab cycles within the dialog (focus-trap). Press Esc. PASS: dialog closes; focus returns to whatever was focused before opening.
11. **About page — `A` shortcut** — Press `A`. PASS: navigates to `/about`. From the about page, Tab through the page. PASS: every link, every table caption is reachable; focus indicator visible.
12. **Deep-link entry** — Reload `/c/v2-neptune` directly. PASS: page boots into the Neptune chapter; scrubber + HUD reflect the chapter's anchor ET; first tab stop lands on a focusable simulation control (not buried in chrome).
13. **Embed mode** — Load `/?embed=true` (or any chapter URL with the embed query). PASS: chapter-index toggle, help overlay, attribution footer are NOT mounted; the HUD + scrubber + play button + speed multiplier remain keyboard-operable.
14. **HUD dismiss — H shortcut** — Press `H`. PASS: HUD fades to opacity 0; `data-dismissed="true"` on `<v-hud>`; sub-components stop hit-testing pointer events. Press `H` again. PASS: HUD restores.
15. **Audio toggle — G shortcut** — Press `G`. PASS: audio toggle flips; `aria-pressed` reflects new state; speaker icon swaps between 🔇 and 🔊. Press `G` while help overlay is open. PASS: `G` is suppressed (per AC3 of Story 6.1).
16. **Narrow-viewport HUD compaction — `⋯` button** — Resize the browser to < 1024px wide. PASS: HUD compact toggle appears. Tab to it; press Enter. PASS: compacted distance + instruments inline expand; `aria-expanded` reflects.
17. **Chapter-copy drawer — Up/Down arrows at narrow viewport** — At narrow viewport, with a chapter held (the editorial copy panel is visible), focus the drawer. Press ↑ / ↓. PASS: drawer cycles `collapsed` → `partial` → `full` → back.

**Evidence to capture:**

- Screenshot of every visible-focus state during the run (one per major control surface — play button, scrubber, speed multiplier, chapter index, help overlay, audio toggle, drawer).
- One-line note per step recording any unexpected behavior.

---

## Pass 2 — VoiceOver on macOS Safari

**Goal:** Screen reader narrates chapter changes, HUD updates, control affordances, and drawer state transitions.

**Pre-conditions:**

- macOS 14+ with Safari current stable.
- VoiceOver enabled (Cmd+F5).
- Audio output enabled and unmuted.

**Steps + PASS criteria:**

1. **Chapter title announce** — Boot `/`, scrub to a chapter window. PASS: VoiceOver announces the chapter title on transition into `held` state (via the `aria-live` mirror in `<v-hud-chapter-title>`).
2. **HUD updates throttled to scrub-stop** — Scrub the timeline. PASS: VoiceOver does NOT announce per-frame date / distance updates (they're outside the aria-live region — per architecture, HUD readouts mutate DOM directly outside Lit reactivity); when the user releases the scrubber, VoiceOver announces the new ET via the debounced subscriber path.
3. **Help-overlay focus trap** — Press `?`. PASS: VoiceOver announces "Keyboard shortcuts dialog, modal"; Tab and Shift+Tab cycle within the dialog; focus does NOT escape to the simulation surface. Esc returns focus to the help toggle.
4. **Audio toggle aria-pressed** — Tab to the audio toggle. PASS: VoiceOver announces "Turn Golden Record audio on, button, off" (or equivalent). After pressing Space, announces "Turn Golden Record audio off, button, on".
5. **Chapter-copy bottom-sheet drawer state** — At narrow viewport, with chapter copy visible. PASS: VoiceOver announces the drawer's current state when its `aria-expanded` / `data-drawer-state` flips.

**Evidence to capture:** Transcript of VoiceOver narration for steps 1, 3, 4, 5 (text capture from the VoiceOver utility or a screen-recording's audio).

---

## Pass 3 — NVDA on Windows Firefox

**Goal:** Identical narration contract on the Windows + NVDA + Firefox tier.

**Pre-conditions:**

- Windows 10 or 11.
- Firefox current stable.
- NVDA 2024.x or 2025.x.

**Steps:** Run Pass 2 steps 1–5 verbatim against Firefox + NVDA. PASS criteria mirror Pass 2.

**Evidence to capture:** NVDA speech log (NVDA → Tools → Speech Viewer → Save) for steps 1, 3, 4, 5.

---

## Pass 4 — TalkBack on Android Chrome

**Goal:** Tier-3 best-effort mobile screen-reader pass.

**Pre-conditions:**

- Android 13+.
- Chrome current stable.
- TalkBack enabled.
- Use a real device or a current Pixel emulator; the simulator-only browsers are explicitly out-of-scope.

**Steps + PASS criteria:**

1. **Boot + chapter announce** — Open `/`. PASS: title card announces; the held chapter title announces on transition.
2. **Play / pause via swipe + double-tap** — Locate the play button via swipe; double-tap. PASS: clock toggles; the button's `aria-pressed` is announced on the next focus.
3. **Chapter index via swipe** — Locate the chapter-index toggle; double-tap. PASS: panel opens; swipe-through reveals each chapter option in order.

**Evidence:** Screenshots of the TalkBack focus rectangle on each step.

**Note:** TalkBack support is Tier 3 — the Voyager UX is designed for desktop + tablet, and mobile narrow-viewport flows have known density trade-offs. The PASS bar here is "no critical narration omissions"; expected layout density limitations are documented in the per-run record's Findings section.

---

## Pass 5 — Color blindness simulation

**Goal:** No information is conveyed by color alone. WCAG 1.4.1 Use of Color (Level A).

**Pre-conditions:**

- Chrome current stable, DevTools open.
- DevTools → Rendering panel → Emulate vision deficiencies dropdown.

**Steps:** For each simulation (deuteranopia, protanopia, tritanopia, achromatopsia, blurred-vision):

1. Load `/c/v1-jupiter`. PASS: attitude indicator's CK vs synthesized state remains distinguishable (verify dot SHAPE / icon, not just color).
2. Inspect the trajectory lines (past = solid, future = dashed per Story 4.x). PASS: past vs future remains distinguishable (verify DASH PATTERN, not just color).
3. Inspect the chapter-marker dual-cluster labels (Story 6.2 — clustered V2L/V1L, V1J/V2J, etc.). PASS: cluster membership remains readable (verify TEXT and POSITION, not color alone).

**Evidence:** Screenshot of each chapter at each color blindness emulation (5 emulations × 1 anchor chapter minimum). File names: `<date>-evidence/cb-<emulation>-<chapter>.png`.

---

## Pass 6 — Forced-colors mode (Windows high-contrast)

**Goal:** Every interactive element is visible + operable when the system overrides palette to high-contrast (Windows Settings → Accessibility → Contrast themes → Aquatic or Desert or Dusk or Night sky).

**Pre-conditions:**

- Windows 10 or 11.
- Edge or Firefox current stable.
- A high-contrast theme active.

**Steps + PASS criteria:**

1. Boot `/`. PASS: focus rings remain visible (uses `outline` + `CanvasText` colors per UX-DR25).
2. Tab through every primary control. PASS: every control's border / text remains visible against the new system background.
3. Open the help overlay. PASS: dialog scrim adapts (modal scrim becomes opaque system-color rather than translucent black).
4. Open the chapter index. PASS: option list rows remain visible; active option (the chevron) is distinguishable.

**Evidence:** Screenshot of each surface in forced-colors mode (boot, scrubber + HUD, chapter index open, help overlay open, about page).

---

## Pass 7 — `prefers-reduced-transparency: reduce`

**Goal:** Overlay scrims become fully opaque when the user has requested reduced transparency. UX-DR26.

**Pre-conditions:**

- macOS Sonoma 14+ with Settings → Accessibility → Display → Reduce transparency ON, OR
- Chrome DevTools → Rendering → Emulate CSS media feature → `prefers-reduced-transparency: reduce`.

**Steps + PASS criteria:**

1. Open the help overlay. PASS: scrim is fully opaque `#0a0e14` (the `--v-color-overlay-scrim` token's reduced-transparency override per `global.css`).
2. Open the chapter index. PASS: same scrim treatment.
3. Verify the simulation surface itself doesn't change (translucency on HUD text shadows etc. is design-baked; only the modal scrim is in the reduced-transparency contract).

**Evidence:** Two screenshots (help overlay open + chapter index open) at default transparency vs reduced.

---

## Pass 8 — Reduced-motion cross-check

**Goal:** Every surface listed in [`docs/accessibility/reduced-motion.md`](./reduced-motion.md) honors `prefers-reduced-motion: reduce` in actual VoiceOver / NVDA / TalkBack flows — not just via DOM inspection.

**Pre-conditions:**

- macOS Sonoma 14+ with Settings → Accessibility → Display → Reduce motion ON.
- VoiceOver enabled.

**Steps:** For each surface in the audit doc's enumerated list:

1. Trigger the animation.
2. PASS: transition is instant (duration tokens collapsed to 0ms) AND VoiceOver / NVDA narrates the final state at the correct moment (not after a perceived delay).

**Evidence:** Per-surface PASS / FAIL annotation pasted into the per-run record under "Pass 8 — Reduced-motion cross-check".

---

## Pass 9 — Photosensitive-epilepsy audit (NFR-A6)

**Goal:** No surface flashes >3 times per second; no large-area high-contrast strobing at any transition. NFR-A6.

**Method:**

For each animated surface, audit:

1. **`transition-duration`** — values < 333ms create a >3 flashes/sec risk IFF the transition CYCLES (e.g., an opacity toggle that bounces). Voyager animations are predominantly one-shot fades — they enter the target state and stay there. Document each.
2. **Keyframe animations** — `@keyframes` blocks with implicit cycles (`animation-iteration-count: infinite`). Voyager has none currently; verify per-release.
3. **JS-driven cycles** — `setInterval`/`requestAnimationFrame` loops driving opacity / transform changes at < 333ms cadence. Audit each.

**Surfaces to audit:**

| Surface | Animation | Verdict |
|---|---|---|
| Title-card dissolve | `transition: opacity var(--v-duration-slow)` (400ms one-shot, 0ms under reduced-motion) | _document per-run_ |
| Attitude-indicator transition (CK ↔ synthesized) | re-render on provenance flip; no per-frame animation | _document per-run_ |
| Chapter-copy fade | `transition: opacity var(--v-duration-base)` (~200ms one-shot) | _document per-run_ |
| Pale Blue Dot plate composites | one-shot fade-in per plate, sequential over the +60..+90s window | _document per-run_ |
| HUD dismiss fade | `transition: opacity var(--v-duration-base)` (200ms one-shot) | _document per-run_ |
| Marker-cluster label fade | one-shot reveal on cluster build; no cycle | _document per-run_ |
| Audio fade-in/out (visual indicator) | one-shot 🔇 ↔ 🔊 swap; no flashing | _document per-run_ |
| Reduced-motion-final-state captures | every above surface with motion collapsed to 0ms | _document per-run_ |

**PASS criterion (per surface):**

- One-shot animations with `transition-duration` ≥ 333ms (or 0ms under reduced-motion): **PASS**.
- One-shot animations with `transition-duration` < 333ms but no cycle: **PASS** (no flashing).
- Any cycling animation (infinite or finite > 3 cycles) at < 333ms per cycle: **FAIL — REMOVE** (per AC5: "any surface that flashes the screen is REMOVED — no flashing surface ships").

**Evidence:** Verdict table with per-surface PASS / FAIL / N/A entry, pasted into the per-run record.

---

## Sign-off

Each run record at `docs/accessibility/manual-test-runs/<YYYY-MM-DD>.md` ends with a one-line sign-off:

> **Sign-off (YYYY-MM-DD, <operator>):** PASS / CONDITIONAL PASS (deferred items: ...) / FAIL — remediation tracked at ...

A CONDITIONAL PASS is acceptable when explicit deferred items (e.g., a TalkBack pass deferred to a future maintainer with the target device) are documented. A FAIL blocks the next Phase milestone until the linked remediation lands.
