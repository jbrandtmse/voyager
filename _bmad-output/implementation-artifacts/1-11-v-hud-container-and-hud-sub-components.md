# Story 1.11: `<v-hud>` Container and HUD Sub-Components

Status: done

## Story

As a visitor,
I want a quiet instrument-panel HUD displaying the current simulation date, per-spacecraft distance from Sun, and current speed multiplier,
so that I always know where I am in time and space without the UI competing with the canvas, fulfilling FR34, NFR-A7, NFR-A8, UX-DR9, UX-DR24, UX-DR29.

## Acceptance Criteria

**AC1 — `<v-hud>` container anchors sub-components to viewport edges:**
- **Given** the app is rendered,
- **When** `<v-hud>` is inspected in the DOM,
- **Then** it is a single Lit Web Component rendering an `<aside aria-label="Mission HUD">` container,
- **And** it anchors its sub-components to viewport corners per the canvas-and-edges model:
  - **Top-right:** `<v-hud-date>` (current sim date) + `<v-hud-distance>` (per-spacecraft AU readout) — stacked
  - **Top-left:** `<v-hud-chapter-title>` (rendered empty during cruise — empty `<h2>` or omit content; the slot is reserved for Story 2.x)
  - **Bottom-right (adjacent to the speed-multiplier slider from Story 1.10):** `<v-hud-speed>` (multiplier + elapsed-time readout)
  - **Bottom-left:** `<v-hud-instruments>` (placeholder; Epic 2 / Epic 6 populate with ISS/UVS/PLS/LECP shutoff legend)
- **And** sub-components are positioned via `position: fixed` (or `position: absolute` within a fixed container) at `var(--v-edge-margin)` from the respective edges.

**AC2 — No background fill; text-shadow for legibility:**
- **Given** every HUD element,
- **When** the rendered CSS is inspected,
- **Then** no HUD element has a `background-color` or `background` declaration (transparent over the canvas),
- **And** every HUD text element carries `text-shadow: 0 0 8px rgba(10, 14, 20, 0.8)` (or token-equivalent: `var(--v-color-bg)` at 80% via rgba) for legibility over bright canvas areas (sun glare, planet surfaces).

**AC3 — `<v-hud-date>` renders the simulation date in JetBrains Mono with tabular-nums:**
- **Given** `<v-hud-date>`,
- **When** the simulation `simTimeEt` updates (via `ClockManager.onFrame` from Story 1.10's `RenderEngine.onFrame` bridge),
- **Then** the value renders inside `<time datetime="YYYY-MM-DDTHH:MM:SSZ">YYYY-MM-DD HH:MM</time>`,
- **And** the value uses `var(--v-font-mono)` (JetBrains Mono) with `font-variant-numeric: tabular-nums` so digits do not jitter as they change,
- **And** the value uses `var(--v-color-fg)` at `var(--v-font-size-hud)` (14px from Story 1.7's token; if a more specific `--v-size-hud-mono` token doesn't exist, add it as `clamp(13px, 1vw, 16px)`),
- **And** the label "UT" precedes the value in `var(--v-color-fg-quiet)`, uppercase, `letter-spacing: 0.06em`, at a slightly smaller `--v-size-hud-mono-sm` token (clamp(11px, 0.85vw, 13px); add if missing),
- **And** the date string is computed via `formatForHud(et)` from Story 1.9's `web/src/math/et-conversions.ts` (the existing module — extend it if `formatForHud` doesn't already exist in this exact form).

**AC4 — `<v-hud-distance>` renders V1 and V2 distance from Sun in AU:**
- **Given** `<v-hud-distance>`,
- **When** the simulation timestamp updates,
- **Then** two rows render:
  - Row 1: `"V1"` label (mono, fg-quiet, uppercase) + distance from Sun in AU (e.g., `"165.32 AU"` for V1 in 2030)
  - Row 2: `"V2"` label + V2 distance from Sun
- **And** distance is computed via `kmToAU(|EphemerisService.getPosition(et, naifId)|)` (Pythagorean magnitude of the WorldVec3 from Sun-centered origin),
- **And** **the Sun's position** in the world frame is at origin (0, 0, 0) — V1 and V2 positions are already heliocentric since the bake's SPK queries use observer 0 (SSB) and we treat that as effectively-heliocentric for this story (the offset between SSB and heliocentric is ≤ ~0.01 AU and below distance-display precision),
- **And** each value uses **2–3 significant figures** for human readability: "5.20 AU" (Jupiter scale), "121 AU" (interstellar scale). The formatter rule: if `value < 10`, show `.XX` (2 decimals); if `value < 100`, show `.X` (1 decimal); if `value ≥ 100`, show integer. Implement as a helper `formatAU(au: number): string` in `web/src/math/au-format.ts`.
- **And** tabular-nums mono is used so the digits don't jitter as values tick.

**AC5 — `<v-hud-speed>` mirrors the speed-multiplier slider readout:**
- **Given** `<v-hud-speed>`,
- **When** the speed multiplier changes (via the `<v-speed-multiplier>` from Story 1.10),
- **Then** the readout displays via `formatSpeedReadout(rate)` from Story 1.10's `web/src/math/speed-readout.ts` (e.g., "10,000× — 1 min/sec"),
- **And** the rendering uses `var(--v-font-mono)` with tabular-nums,
- **And** the component subscribes to `clockManager` for `setRate` events (the readout updates on rate change, NOT per-frame),
- **And** **note:** Story 1.10's `<v-speed-multiplier>` ALREADY renders a readout below the slider. `<v-hud-speed>` is a SEPARATE component for the HUD region — they MAY render identical text (acceptable redundancy for the HUD model) OR `<v-hud-speed>` may be omitted if the speed-multiplier readout serves the HUD role too. **Recommended:** keep both — the speed-multiplier readout is adjacent to the slider for direct feedback during interaction; `<v-hud-speed>` is in the HUD region for "what speed are we at, in absolute terms" — they're conceptually distinct even if visually identical.

**AC6 — Live-region updates fire on scrub-stop and chapter change, NOT per-frame:**
- **Given** the HUD region semantics,
- **When** the DOM is inspected with screen-reader tooling (or axe-core / aria-live tests),
- **Then** `<v-hud>` renders an `<aside aria-label="Mission HUD">`,
- **And** each sub-component's value is inside a live region with `aria-live="polite"`,
- **And** **live-region updates fire only on scrub-stop (debounced 500ms after the last scrub event) and on chapter change — NOT on every per-frame value change.** This is the load-bearing accessibility constraint (UX-DR24): screen readers would be overwhelmed by 60 FPS announcements.
- **And** `aria-live="assertive"` is NOT used anywhere in v1.
- **Implementation:** the visible DOM (the `<time>` and `<span>` value containers) updates per-frame via direct DOM mutation under `RenderEngine.onFrame` — that's the architecture-line-424 pattern. SEPARATELY, an `aria-live="polite"` mirror node updates only on scrub-stop + chapter change. The mirror node is visually hidden (CSS `position: absolute; clip: rect(0,0,0,0); ...`) but reachable by assistive tech.

**AC7 — Compaction below 1024px width (placeholder):**
- **Given** narrower viewports,
- **When** the viewport is < 1024px wide,
- **Then** the HUD compacts:
  - `<v-hud-distance>` and `<v-hud-instruments>` collapse into a single "expand HUD" affordance (e.g., a tap-target button labeled "HUD ▾" that toggles the full panel)
- **And** for this story, the compaction is a PLACEHOLDER — the responsive trigger and an empty "expand HUD" button are wired, but the actual collapsed-state behavior is deferred to Epic 6 (Story 6.2 owns the final HUD compaction polish). Document the deferral in code comments + the dev-completion notes.
- **And** use the existing `@media (max-width: 1023px)` breakpoint from Story 1.7's `breakpoints.css` — DO NOT introduce new media queries.

## Tasks / Subtasks

- [ ] **Task 1 — Author `web/src/math/au-format.ts`** (AC: #4)
  - [ ] `formatAU(au: number): string` per AC4 rules
  - [ ] Co-locate `web/src/math/au-format.test.ts` with assertions on 0.05 AU, 5.2 AU, 50 AU, 165.32 AU, etc.

- [ ] **Task 2 — Extend Story 1.9's `web/src/math/et-conversions.ts` with `formatForHud(et)`** if missing (AC: #3)
  - [ ] If `formatForHud` already exists from Story 1.9, verify it returns "YYYY-MM-DD HH:MM" UTC — and the ISO accessor returns "YYYY-MM-DDTHH:MM:SSZ" for the `datetime` attribute
  - [ ] If missing, add it and extend the existing test file

- [ ] **Task 3 — Add typography size tokens if missing** (AC: #3)
  - [ ] Check `web/src/styles/tokens.css` for `--v-size-hud-mono` and `--v-size-hud-mono-sm`
  - [ ] If absent, add: `--v-size-hud-mono: clamp(13px, 1vw, 16px)`, `--v-size-hud-mono-sm: clamp(11px, 0.85vw, 13px)`
  - [ ] Update `web/tests/styles-tokens.test.ts` to assert these tokens exist

- [ ] **Task 4 — Author `web/src/components/v-hud-date.ts`** (AC: #3, #6)
  - [ ] Lit Web Component
  - [ ] Props: `clockManager` (subscribes for `play/pause/scrubTo` events to update the aria-live mirror); registers a per-frame callback via `clockManager` or external wiring to update the visible `<time>` element directly
  - [ ] Renders `<time datetime="..."><span>YYYY-MM-DD HH:MM</span></time>` plus the "UT" prefix label
  - [ ] **Per-frame DOM mutation:** the dev should expose a method `tick(et: number)` on the component that mutates the `<time>` textContent + `datetime` attribute directly (no Lit reactive update). The wiring in `first-paint.ts` / `main.ts` calls `engine.onFrame((et) => v-hud-date.tick(et))`.
  - [ ] **Aria-live mirror:** a separate visually-hidden `<span aria-live="polite">` that updates on scrub-stop + chapter change (debounced 500ms)
  - [ ] Co-locate test: assert per-frame `tick(et)` updates the visible DOM; assert the aria-live mirror updates on scrub-stop debounce

- [ ] **Task 5 — Author `web/src/components/v-hud-distance.ts`** (AC: #4, #6)
  - [ ] Lit; renders two rows ("V1" + AU, "V2" + AU)
  - [ ] Props: `clockManager`, `ephemerisService`
  - [ ] Per-frame `tick(et)` mutates the AU values directly
  - [ ] Distance computed: `formatAU(kmToAU(magnitude(ephemerisService.getPosition(et, -31))))` for V1, same for V2 (-32)
  - [ ] Handles `null` from `getPosition`: shows "—" placeholder
  - [ ] Aria-live mirror per AC6
  - [ ] Co-locate test

- [ ] **Task 6 — Author `web/src/components/v-hud-speed.ts`** (AC: #5, #6)
  - [ ] Lit; subscribes to `clockManager` setRate events (not per-frame)
  - [ ] Renders via `formatSpeedReadout(clockManager.playbackRate)` from Story 1.10
  - [ ] Aria-live "polite" updates on setRate
  - [ ] Co-locate test

- [ ] **Task 7 — Author `web/src/components/v-hud-chapter-title.ts`** (AC: #1)
  - [ ] Lit; renders empty `<h2></h2>` during cruise (no chapter active in Epic 1)
  - [ ] Props: `chapterDirector` (a placeholder; Epic 2 owns the real `ChapterDirector`)
  - [ ] For this story, the component is a stub that renders nothing. Future Story 2.1 wires it up.
  - [ ] Co-locate test asserting the stub renders empty content

- [ ] **Task 8 — Author `web/src/components/v-hud-instruments.ts`** (AC: #1)
  - [ ] Lit; renders nothing visible in this story
  - [ ] Stub component. Story 2.9 (or wherever instrument shutoff lands) fills it.
  - [ ] Co-locate test asserting the stub renders empty content

- [ ] **Task 9 — Author `web/src/components/v-hud.ts`** (AC: #1, #2, #6)
  - [ ] Container Lit component; renders `<aside aria-label="Mission HUD">`
  - [ ] Anchors sub-components to viewport corners via CSS (`position: fixed` with `top`/`right`/`bottom`/`left` + `var(--v-edge-margin)`)
  - [ ] Slots / nested elements for the five sub-components
  - [ ] Global `text-shadow` applied to all HUD text descendants via CSS
  - [ ] No `background` declarations on any element
  - [ ] Co-locate test asserting structure + ARIA + style discipline

- [ ] **Task 10 — Wire HUD into `first-paint.ts`** (AC: #1)
  - [ ] After the title card dissolves, mount `<v-hud>` with its sub-components configured against the shared `ClockManager` + `EphemerisService` (Story 1.6) + `RenderEngine` (Story 1.5)
  - [ ] `engine.onFrame((et) => { vHudDate.tick(et); vHudDistance.tick(et); })` — visible DOM updates per frame
  - [ ] `clockManager.subscribe((state) => { /* trigger debounced aria-live updates */ })` — aria-live updates on state change

- [ ] **Task 11 — Aria-live debounce helper**
  - [ ] Author `web/src/math/debounce.ts` (or under `web/src/primitives/` — pick a location) — small `debounce(fn, ms)` helper for the 500ms aria-live debounce
  - [ ] Co-locate test
  - [ ] Reuse for: scrubber's resume-debounce (currently inline in v-timeline-scrubber); update if straightforward, otherwise defer the consolidation

- [ ] **Task 12 — Tests + integration**
  - [ ] Co-located tests per task
  - [ ] `web/tests/hud-integration.test.ts`: mount the full HUD, simulate per-frame ticks, assert visible DOM updates per frame and aria-live mirror updates only on scrub-stop / chapter change
  - [ ] `web/tests/hud-style-defense.test.ts`: defense — no `background` in any HUD component CSS; `text-shadow` present on all text elements; tabular-nums on all numeric values

## Dev Notes

### Architectural Compliance — load-bearing constraints

- **Per-frame HUD updates bypass Lit reactivity** (architecture line 424, 1226). Direct DOM mutation under `RenderEngine.onFrame` is the pattern.
- **Aria-live polite, NOT assertive** (UX-DR24). Updates fire only on scrub-stop + chapter change.
- **No background fills on HUD** (UX spec — canvas-and-edges model).
- **JetBrains Mono with tabular-nums** for all numeric HUD values.
- **No 60-FPS aria-live storms.** The architecture and UX spec are explicit about this.

### Architecture-canonical file paths

- `web/src/components/v-hud.ts` + sub-components (architecture line 430–436)
- `web/src/math/au-format.ts` (new)
- `web/src/math/debounce.ts` (new — or `web/src/primitives/`)

### Testing Requirements

- Co-located unit tests for every component
- Integration tests in `web/tests/`
- Baseline (web vitest 862, bake fast 233 + 2 skipped + slow 11) must remain green
- Expected after this story: 900-950 vitest tests

### Previous Story Intelligence

- **Story 1.5:** `RenderEngine.onFrame(cb)` is the per-frame hook
- **Story 1.6:** `EphemerisService.getPosition(et, bodyId): WorldVec3 | null` (NAIF IDs -31 V1, -32 V2)
- **Story 1.7:** Lit 3.3.3, design tokens, `BaseElement`
- **Story 1.9:** `formatForHud` likely exists at `web/src/math/et-conversions.ts` (verify)
- **Story 1.10:** `ClockManager.subscribe` fires on state change; `formatSpeedReadout` at `web/src/math/speed-readout.ts`

### Git Intelligence

Recent: `f467b2b Story 1.10: ClockManager + <v-play-button> + <v-speed-multiplier>`. Branch: `epic1`.

### Project Context Reference

- Epic: `_bmad-output/planning-artifacts/epics.md` §Story 1.11 (lines 748–787)
- Architecture: §line 424 (HUD via onFrame), §HUD components (lines 430–436), §line 1220 (subscribe pattern)
- UX spec: HUD content + tabular-nums + no-background-fill + aria-live polite
- PRD: FR34 (HUD overlay), NFR-A7 (semantic markup), NFR-A8 (screen-reader floor), UX-DR9, UX-DR24, UX-DR29

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.11]
- [Source: _bmad-output/planning-artifacts/architecture.md#L424] — HUD bypasses Lit reactivity
- [Source: _bmad-output/planning-artifacts/prd.md#FR34] — HUD overlay contents
- [Source: docs/adr/0019-zero-analytics-localstorage-only-error-capture.md] (no per-frame aria-live storms = no leak of user behavior signal)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- Initial test run: 4 failures, 993 pass. Root causes:
  1. `<v-hud>` propagates `clockManager` to children in its `updated()` callback,
     which runs *after* each child's `connectedCallback` — so the children
     subscribed with `clockManager === null` (i.e. never). Resolved by converting
     `clockManager` on `<v-hud-date>`, `<v-hud-distance>`, and `<v-hud-speed>` to
     a get/set accessor that re-subscribes when the property is mutated post-
     connection.
  2. Style-defense regex tripped on the rationale text inside JSDoc — added
     a `stripComments` pass and post-hoc filter for `background: transparent`
     (the compact-toggle's <button> reset, which paints nothing).
  3. Integration "aria-live everywhere polite" test queried the wrong shadow
     root — the mirrors live inside each sub-component's shadow root, not the
     `<v-hud>` parent's. Fixed by walking each sub-component's `.shadowRoot`.

- Final run: 997/997 web vitest pass; `tsc --noEmit` clean.

### Completion Notes List

- **Per-frame mutation pattern (architecture line 424):** each HUD component
  with per-frame data exposes a public `tick(et)` method that mutates DOM
  directly via `shadowRoot.querySelector(...).textContent = …`. Calls to
  `tick()` deliberately do not touch Lit's reactive layer — verified by
  spying on `requestUpdate` in the test suite (60 sequential ticks → 0
  invocations).

- **Aria-live debounce structure:** the 500ms trailing-edge debounce uses the
  new `web/src/primitives/debounce.ts` helper. `<v-hud-date>` and
  `<v-hud-distance>` subscribe to `clockManager`; each subscribe-callback
  feeds its debounced flusher. An `announceNow(et)` method bypasses the
  debounce for the future Story 2.1 chapter-change wiring.

- **`<v-hud-speed>` vs `<v-speed-multiplier>` redundancy:** I kept both as
  conceptually distinct components per the story's recommendation —
  `<v-speed-multiplier>` is interaction-adjacent, `<v-hud-speed>` lives in
  the HUD region. They render visually identical text (acceptable per AC5
  note). `<v-hud-speed>` deliberately does NOT expose a `tick(et)` method;
  rate changes are explicit user actions, not 60 Hz data, so the Lit
  reactive `requestUpdate` path is the correct one.

- **Sun-at-origin distance:** `<v-hud-distance>` computes `√(x²+y²+z²) /
  KM_PER_AU` directly on the heliocentric-equivalent `WorldVec3` from the
  ephemeris. The SSB↔Sun offset (≤ 0.01 AU) is below `formatAU`'s
  display precision in every band.

- **Wiring propagation:** `<v-hud>` propagates `clockManager` +
  `ephemerisService` to its children inside `updated()`. The children
  expose `clockManager` as a get/set accessor so that mutating the
  property after `connectedCallback` resubscribes cleanly. Without this,
  children would silently fail to receive subscribe-events.

- **HUD compaction (AC7):** the `<button class="compact-toggle">` is wired
  but the collapsed-panel behavior is deferred to Story 6.2 per the
  story's explicit instruction. The compact-toggle appears only below
  the existing Story 1.7 `(max-width: 1023px)` breakpoint — no new media
  queries authored.

- **Tokens added:** `--v-size-hud-mono` (clamp 13/16) + `--v-size-hud-mono-sm`
  (clamp 11/13). Asserted by the existing `styles-tokens.test.ts`.

- **`dateForHud` helper:** the story called for the value to be
  `"YYYY-MM-DD HH:MM"` with "UT" as a separate label, but Story 1.9's
  `formatForHud` returns the value + " UT" inline. I added a separate
  `dateForHud(et)` in `et-conversions.ts` to preserve the Story 1.9
  contract for the scrubber's `aria-valuetext` while exposing the
  bare-value form to `<v-hud-date>`.

- **HUD pointer-events:** `<v-hud>` sets `pointer-events: none` at `:host`
  and re-enables it on `.corner` regions so the underlying canvas (Story
  1.5 + future scenes) receives drag / pan events through the transparent
  gaps between the four corner stacks.

- **`<v-speed-multiplier>` and `<v-play-button>` placement:** both still
  live in the bottom corners (Story 1.10). `<v-hud-speed>` joins them in
  the bottom-right corner; the speed slider sits below it. No overlap —
  the HUD `<aside>` sits at z-index 10 while `<v-speed-multiplier>` /
  `<v-play-button>` already sit at the scrubber layer (z-index 20).

### File List

- web/src/styles/tokens.css (modified — added `--v-size-hud-mono` + `--v-size-hud-mono-sm`)
- web/tests/styles-tokens.test.ts (modified — asserts new tokens)
- web/src/math/au-format.ts (new)
- web/src/math/au-format.test.ts (new)
- web/src/math/et-conversions.ts (modified — added `dateForHud`)
- web/src/math/et-conversions.test.ts (modified — covers `dateForHud`)
- web/src/primitives/debounce.ts (new)
- web/src/primitives/debounce.test.ts (new)
- web/src/components/v-hud.ts (new)
- web/src/components/v-hud.test.ts (new)
- web/src/components/v-hud-date.ts (new)
- web/src/components/v-hud-date.test.ts (new)
- web/src/components/v-hud-distance.ts (new)
- web/src/components/v-hud-distance.test.ts (new)
- web/src/components/v-hud-speed.ts (new)
- web/src/components/v-hud-speed.test.ts (new)
- web/src/components/v-hud-chapter-title.ts (new)
- web/src/components/v-hud-chapter-title.test.ts (new)
- web/src/components/v-hud-instruments.ts (new)
- web/src/components/v-hud-instruments.test.ts (new)
- web/tests/hud-integration.test.ts (new)
- web/tests/hud-style-defense.test.ts (new)
- web/src/boot/first-paint.ts (modified — mounts `<v-hud>`, accepts `renderEngine` + `ephemerisService` options)
- web/src/main.ts (modified — passes `renderEngine` at boot, wires `EphemerisService` to the HUD once the manifest lands)
