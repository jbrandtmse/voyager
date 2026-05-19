# Story 1.9: Designed First-Paint Sequence and `<v-timeline-scrubber>` Mission Variant

Status: done

## Story

As a first-time visitor,
I want to see a held title card that dissolves into the launch frame and a physical, draggable timeline scrubber as the primary control surface,
so that the AiRT-class register is established in the first three seconds and time becomes the spine of the experience, fulfilling FR1, FR6, FR42, FR45 (scrub keys), UX-DR8, UX-DR20 (slider keyboard + pointer-events), UX-DR22, UX-DR28, UX-DR32.

## Acceptance Criteria

**AC1 — Title card holds 2 beats then dissolves into the scene:**
- **Given** a visitor lands on `/` on cold cache,
- **When** the first paint occurs,
- **Then** a title card "Voyager. 1977 to 2030." is rendered centered in Inter at `var(--v-size-title-card)` against `var(--v-color-bg)` (the typography size token from UX spec line 986: `clamp(36px, 4.0vw, 56px)`),
- **And** the card holds for **~2 seconds** (two "beats" — pick 2000ms exactly as the canonical value; document it as a constant `TITLE_CARD_HOLD_MS`) then dissolves over `var(--v-duration-slow)` (400ms) into the heliocentric scene initialized at **ET corresponding to 1977-09-05 00:00 UT** (the launch-adjacent frame from UX spec line 74),
- **And** no modal, cookie banner, signup prompt, or animated logo appears at any point,
- **And** when `prefers-reduced-motion: reduce` is active, the dissolve becomes an instant cut (hold for 2000ms, then jump). The `--v-duration-slow` token already collapses to 0ms via Story 1.7's global rule, so the dissolve becomes a no-op transition; the title card just disappears and the scene appears.

**AC2 — `<v-timeline-scrubber variant="mission">` is the primary control surface:**
- **Given** the scene is active (after the dissolve),
- **When** the DOM is inspected,
- **Then** a single `<v-timeline-scrubber variant="mission">` element is rendered anchored to the viewport bottom with `var(--v-edge-margin)` padding (the clamp(16px, 3vw, 64px) value from Story 1.7),
- **And** the scrubber's track spans **1977-08-20** (V2 launch, ET ≈ -704412036.0) → **2030-12-31** (mission-end, ET ≈ 978307200.0). Use the exact ET endpoints from `bake/src/_kernel_io.py`'s constants where they exist, or compute via SpiceyPy in a one-off offline derivation and hardcode them as `MISSION_START_ET = -704412036.0` and `MISSION_END_ET = 978307200.0` constants in a `web/src/constants/mission.ts` module.
- **And** the thumb position tracks the current simulation ET via a `simEt` reactive property,
- **And** the visual treatment matches the UX spec §Components Table line 1197: track height 12px, progress fill `var(--v-color-accent)`, thumb 14px solid `var(--v-color-fg)` with 2px `var(--v-color-bg)` ring border. **Chapter markers (vertebrae) are NOT in this story** — Story 2.2 introduces them. The scrubber's `chapters` slot/property is left as a no-op stub.

**AC3 — WAI-ARIA Slider semantics:**
- **Given** the `<v-timeline-scrubber>` element,
- **When** assistive tech inspects it,
- **Then** the component:
  - Sets `role="slider"` on the interactive element (the thumb's container — typically a `<div tabindex="0">` inside the Shadow DOM)
  - Sets `aria-valuemin` to `MISSION_START_ET` formatted as ISO-8601 UTC (e.g., `"1977-08-20T00:00:00Z"`)
  - Sets `aria-valuemax` to `MISSION_END_ET` formatted similarly
  - Sets `aria-valuenow` reactively to the current `simEt` formatted as ISO-8601 UTC
  - Sets `aria-valuetext` to a human-readable form: `"YYYY-MM-DD HH:MM UT"` (e.g., `"1989-08-25 09:23 UT"`)
  - Sets `aria-label="Mission timeline"`
- **And** ET ↔ ISO-8601 conversion lives in a single canonical module `web/src/math/et-conversions.ts` (per architecture line 935 — `etFromIso(iso)`, `isoFromEt(et)`, `formatForHud(et)`; this story creates the module if it doesn't exist yet, with the conversions implemented to-the-second precision. Future stories add millisecond precision if needed).

**AC4 — Keyboard scrubbing:**
- **Given** the scrubber is focused via keyboard,
- **When** the user presses:
  - `←` or `→`: scrub by 1 day (86400 seconds in ET) — direction determined by the key
  - `Shift+←` or `Shift+→`: scrub by 10 days
  - `Home`: jump to `MISSION_START_ET`
  - `End`: jump to `MISSION_END_ET`
- **Then** the simulation ET updates accordingly, the thumb visually advances, and the URL `?t=` parameter is updated (per AC5),
- **And** the simulation **pauses on the first scrub keystroke** and **resumes 300ms after the last keystroke** *if it was playing before the first keystroke*. This requires a debounced "playing state" memory: capture `wasPlayingBeforeScrub: boolean` on first keystroke, restore on debounce-fire.
- **Note:** Story 1.9 has no `ClockManager` yet (that's Story 1.10). For this story, the scrubber maintains its own placeholder ET state internally; the playing/paused dimension is a local boolean. Story 1.10 will refactor to consume `ClockManager.simTimeEt` instead.

**AC5 — Pointer input via `pointer-events.ts` primitives:**
- **Given** the scrubber accepts pointer input,
- **When** the user clicks on the track (NOT the thumb),
- **Then** the simulation jumps **paused** to the clicked timestamp,
- **And** clicking-and-dragging the thumb:
  - Sets pointer capture (`setPointerCapture` on the thumb element)
  - Changes cursor to `grab` (idle) / `grabbing` (dragging) via CSS `:hover` / `[data-dragging] cursor`
  - Pauses the simulation implicitly (the `wasPlayingBeforeScrub` pattern from AC4)
  - Updates the thumb position at ≤16ms per frame (debounced or per-pointer-move)
  - On `pointerup` release: simulation resumes at the previously-set speed
- **And** the pointer events are dispatched through `web/src/primitives/pointer-events.ts` (a new file unifying mouse + touch + pen — architecture line 418 names this module). The primitive exposes `attachPointerHandlers(target, { onDown, onMove, onUp })` returning an unsubscribe function.

**AC6 — URL `?t=` parameter via throttled `replaceState`:**
- **Given** the scrubber drags,
- **When** the timestamp changes,
- **Then** the URL's `?t=` parameter is updated via `history.replaceState(null, '', '?t=' + isoFromEt(simEt))`, **throttled at 250ms** during continuous drag (i.e., at most one `replaceState` call per 250ms window),
- **And** a final `replaceState` fires unconditionally on `pointerup` release,
- **And** the address bar always reflects the current simulation timestamp without polluting browser history (`replaceState`, NOT `pushState`),
- **And** the throttled writeback is implemented in `web/src/services/url-sync.ts` (new module — placeholder for the full `URLSync` service described at architecture line 315; this story implements the `?t=` half, and Story 2.4 will extend it with per-chapter URL slug navigation).

**AC7 — Boot-time `?t=` parsing:**
- **Given** a visitor opens `voyager.app/?t=1989-08-25T09:23:00Z`,
- **When** the app boots,
- **Then** the simulation initializes **paused** at that exact instant,
- **And** an **invalid `?t=` value** (non-ISO-8601, out-of-range against `[MISSION_START_ET, MISSION_END_ET]`, or any parse error) is **silently rejected** and the simulation initializes at `MISSION_START_ET` with no error UI (NFR-S7 — never error-screen the user for a malformed URL).

**AC8 — 44×44px effective hit area on the thumb:**
- **Given** the scrubber thumb's visible glyph is 14px diameter,
- **When** the interactive bounding box is measured,
- **Then** the effective click/tap target is **≥ 44×44px** even though the visible glyph is smaller (UX-DR22, WCAG 2.5.5 touch target),
- **And** this is achieved via a transparent `::before` or `::after` pseudo-element on the thumb that extends the hit area, NOT by enlarging the visible thumb glyph. (The `pointer-events: auto` on the pseudo + `pointer-events: none` on a transparent wrapper layered above the rest of the track for hit-test priority is the standard trick.)

## Tasks / Subtasks

- [x] **Task 1 — Author `web/src/math/et-conversions.ts`** (AC: #3)
  - [x] Functions: `etFromIso(iso: string): number`, `isoFromEt(et: number): string`, `formatForHud(et: number): string` (human-readable "YYYY-MM-DD HH:MM UT").
  - [x] ET is seconds past J2000 (the SpiceyPy convention). J2000 epoch is 2000-01-01T11:58:55.816 UTC. Compute via `(epochSeconds - J2000_EPOCH_SECONDS)` math; verify against SpiceyPy's `str2et`/`et2utc` round-trips on a few known dates (1977-08-20, 1989-08-25, 1990-02-14, 2012-08-25).
  - [x] **To-the-second precision is required.** Millisecond precision is NOT required for this story; the UX shows date+hour+minute granularity. A few ms of jitter at sub-second is OK.
  - [x] Co-locate `web/src/math/et-conversions.test.ts`: round-trip ET ↔ ISO for several mission-critical dates; assert epoch is correct.

- [x] **Task 2 — Author `web/src/constants/mission.ts`** (AC: #2, #4)
  - [x] Export `MISSION_START_ET: number` (1977-08-20T00:00:00Z) and `MISSION_END_ET: number` (2030-12-31T23:59:59Z).
  - [x] Export `MISSION_START_ISO`, `MISSION_END_ISO` (strings).
  - [x] Compute the ETs from the ISO strings via `etFromIso` (Task 1), then commit the computed numbers as literal constants (so the module has no runtime dependency on Task 1's import — pure constants).
  - [x] Also export `TITLE_CARD_HOLD_MS = 2000`, `URL_WRITEBACK_THROTTLE_MS = 250`, `SCRUB_RESUME_DELAY_MS = 300`.
  - [x] Co-locate a test that re-computes the ETs from the ISOs and asserts they match the committed constants (so future epoch changes can't drift the constants silently).

- [x] **Task 3 — Author `web/src/primitives/pointer-events.ts`** (AC: #5)
  - [x] Exports `attachPointerHandlers(target, handlers): () => void` (returns unsubscribe).
  - [x] Internally wraps the Pointer Events API (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`).
  - [x] Handles `setPointerCapture`/`releasePointerCapture` automatically on down/up.
  - [x] Normalizes mouse / touch / pen via a unified `{ x, y, pointerType }` event payload.
  - [x] Co-locate tests under happy-dom: simulate `pointerdown` + `pointermove` + `pointerup`, assert handler invocations + order + payload shape.

- [x] **Task 4 — Author `web/src/services/url-sync.ts`** (AC: #6, #7)
  - [x] Class `URLSync` with:
    - `static parseInitialT(): { initialEt: number, valid: boolean }` — reads `location.search` at boot, parses `?t=`, validates against `[MISSION_START_ET, MISSION_END_ET]`. On invalid: returns `{ initialEt: MISSION_START_ET, valid: false }`.
    - `writeEtThrottled(et: number): void` — debounced `history.replaceState` at 250ms (use the `URL_WRITEBACK_THROTTLE_MS` constant). Internally: `setTimeout` + cancel pattern.
    - `writeEtImmediate(et: number): void` — bypass throttle (used on `pointerup` release).
  - [x] **Architecture note:** the full `URLSync` per architecture line 315 also handles chapter slug navigation. This story implements ONLY the `?t=` half; the slug half is deferred to Story 2.4.
  - [x] Co-locate tests: parse various `?t=` URLs (valid, invalid, missing, out-of-range); verify `replaceState` is called with the right URL; verify throttle behavior.

- [x] **Task 5 — Author `web/src/components/v-title-card.ts`** (AC: #1)
  - [x] Lit Web Component `<v-title-card>` rendering "Voyager. 1977 to 2030." centered, full viewport.
  - [x] Typography: `font-family: var(--v-font-sans)` (Inter), `font-size: var(--v-size-title-card)`.
  - [x] Holds for `TITLE_CARD_HOLD_MS` (2000), then triggers a CSS opacity transition over `var(--v-duration-slow)` (400ms; collapses to 0ms under reduced motion via Story 1.7's global rule).
  - [x] Emits a `voyager:title-card-complete` custom event when the dissolve finishes. The main app listens for this and triggers the heliocentric-scene init.
  - [x] Registers via `customElements.define()` per Story 1.7's pattern.
  - [x] Co-locate tests: assert the card renders the correct text, holds for ~2000ms (use fake timers), dispatches the completion event.

- [x] **Task 6 — Author `web/src/components/v-timeline-scrubber.ts`** (AC: #2, #3, #4, #5, #8)
  - [x] Lit Web Component `<v-timeline-scrubber>` with attributes: `variant: 'mission' | 'detail'` (only `mission` is implemented this story; `detail` is Story 4.4), `simEt: number` (reactive property).
  - [x] Internal state: `wasPlayingBeforeScrub: boolean`, `isDragging: boolean`, `isScrubbingViaKeyboard: boolean`, debounce-resume timer.
  - [x] Render: a `<div role="slider" tabindex="0" aria-*=…>` containing track + thumb. Track is a 100%-wide horizontal bar at the bottom of the viewport. Thumb is a 14px circle whose `left` position = `((simEt - MISSION_START_ET) / (MISSION_END_ET - MISSION_START_ET)) * 100%`.
  - [x] Hit-area extension on thumb via a transparent `::before` pseudo-element sized 44×44px (per AC8).
  - [x] Keyboard handling per AC4. `event.preventDefault()` on the arrows / Home / End to prevent native scroll.
  - [x] Pointer handling per AC5 via `attachPointerHandlers` (Task 3).
  - [x] URL writeback per AC6 via `URLSync` (Task 4).
  - [x] Emits `voyager:scrub` custom event with `{ et, source: 'keyboard' | 'pointer' }` on every scrub change.
  - [x] Co-locate tests under happy-dom: assert ARIA attributes, keyboard input updates `simEt`, pointer-click jumps `simEt`, debounce-resume timer, 44×44 hit area (asserted via computed style or DOM measurement).

- [x] **Task 7 — Wire `main.ts` for the first-paint sequence** (AC: #1, #7)
  - [x] On boot:
    1. Render `<v-title-card>` immediately (no waiting for the manifest)
    2. In parallel: `ManifestLoader.load()` from Story 1.6; once resolved, construct `RenderEngine` (Story 1.5) and the scene
    3. Read `URLSync.parseInitialT()` to determine the initial ET. Pass it to the scrubber as `simEt={initialEt}`. If `valid=false`, simulation starts at `MISSION_START_ET` (silent reject per AC7).
    4. When the title card emits `voyager:title-card-complete`: remove it from the DOM (or set `display: none`), reveal the scene
  - [x] The scene during this story is a placeholder — Story 1.5's RenderEngine + an empty scene is fine. Story 1.12/1.13 add the spacecraft and celestial bodies.
  - [x] **Don't pre-load the precision-smoke or ephemeris-perf dev modes** at boot — those are gated by `?dev=` / `?perf=`.

- [x] **Task 8 — Add the scrubber + title card to `index.html` body**
  - [x] The title card and scrubber are dynamically created by `main.ts` — no static markup needed in `index.html`. The existing body content (canvas, etc.) remains.

- [x] **Task 9 — Tests (defense + integration)**
  - [x] Co-located component tests (Tasks 5, 6)
  - [x] Co-located service tests (Tasks 1, 3, 4)
  - [x] Co-located constants test (Task 2 — ET ↔ ISO round-trip on the mission endpoints)
  - [x] `web/tests/first-paint-sequence.test.ts`: integration test under happy-dom — boot the app, wait for the title card to dissolve (use fake timers), assert the scrubber is now present
  - [x] `web/tests/url-t-parameter.test.ts`: end-to-end ?t= boot test — set `window.location` to various URLs, assert the resulting `simEt` matches the parsed time

- [x] **Task 10 — README updates**
  - [x] Add a brief "First-Paint Sequence" subsection under the existing "Rendering" section documenting the title card → dissolve → scene sequence and the `?t=` deep-link contract.

## Dev Notes

### Architectural Compliance — load-bearing constraints

- **Title card holds two beats then dissolves.** UX spec line 74, line 660; FR1; UX-DR28.
- **Reduced-motion → instant cut.** Story 1.7's global `prefers-reduced-motion` rule already collapses `--v-duration-slow` to 0ms; the dissolve becomes a no-op transition automatically. No per-component code change.
- **`<v-timeline-scrubber>` is always at the bottom.** UX spec line 741: "Always visible, full 1977 → 2030 horizontal extent, anchored to the bottom of the viewport. Chapter markers (vertebrae) along it. This is the spine."
- **WAI-ARIA Slider per UX-DR22.** First-party ARIA patterns per ADR 0025 — no Radix / Headless UI.
- **Pointer Events API only.** Architecture line 418. No `mousemove`/`touchmove` separately; `pointermove` unifies both.
- **URL `?t=` via `replaceState`, NOT `pushState`.** UX spec line 687: "without polluting browser history."
- **NFR-S7: silent reject invalid URLs.** No error UI for malformed `?t=`.
- **No `ClockManager` yet.** Story 1.10 owns the canonical `ClockManager`. This story uses the scrubber's local `simEt` reactive prop as a placeholder; Story 1.10 refactors to consume `ClockManager.simTimeEt`.
- **No chapter markers yet.** Story 2.2 owns chapter markers (vertebrae). This story leaves a `chapters` slot/prop as a no-op stub.

### Architecture-canonical file paths

- `web/src/math/et-conversions.ts` (architecture line 935)
- `web/src/constants/mission.ts` (new)
- `web/src/primitives/pointer-events.ts` (architecture line 418)
- `web/src/services/url-sync.ts` (architecture line 315, partial impl)
- `web/src/components/v-title-card.ts` (new — not in architecture explicitly but the natural home for the first-paint title)
- `web/src/components/v-timeline-scrubber.ts` (architecture line 686, 781)
- `web/src/main.ts` (existing — extended for first-paint sequence)
- `web/tests/first-paint-sequence.test.ts`, `web/tests/url-t-parameter.test.ts` (new integration tests)

### File-Structure Requirements

- Components under `web/src/components/`
- Services under `web/src/services/`
- Primitives under `web/src/primitives/` (NEW directory — first primitive lands in this story)
- Constants under `web/src/constants/` (NEW directory — first constants module lands in this story)
- Math under `web/src/math/` (existing from Story 1.5)

### Testing Requirements

- Vitest unit tests for every module, co-located with the module under test
- Integration tests in `web/tests/` for the first-paint sequence + URL boot parsing
- happy-dom is sufficient for ARIA/keyboard/pointer simulation (no need for a real browser)
- The dissolve timing test must use vitest fake timers (`vi.useFakeTimers()`) — don't rely on real `setTimeout`
- All existing tests (web vitest 514, bake fast 233 + 2 skipped + slow 11) must remain green
- Expected after this story: ~580–620 web vitest tests

### Latest Tech Information

- **Pointer Events API** — universally supported in modern browsers. `setPointerCapture` lets the thumb keep receiving move events even when the pointer leaves the thumb's bounds (essential for drag).
- **`history.replaceState`** — standards-track, universally supported. No browser history pollution.
- **WAI-ARIA APG Slider pattern** — https://www.w3.org/WAI/ARIA/apg/patterns/slider/ — the canonical reference. Key requirements: `role="slider"`, `aria-valuemin/max/now`, `aria-valuetext` for human-readable, focusable thumb.
- **WCAG 2.5.5 Target Size (Enhanced)** — 44×44 CSS pixels minimum for touch targets. WCAG 2.5.8 (Minimum) is 24×24 but we're going AAA-class on touch.

### Previous Story Intelligence

- **Story 1.5 (fc378fa):** `RenderEngine.onFrame(callback)` is the per-frame hook. This story doesn't need to call into it yet (scrubber updates ARIA / style, not the canvas) — but Story 1.10 will wire them.
- **Story 1.6 (c041a0f):** `ManifestLoader.load()` is awaited at boot. The first-paint sequence kicks off the title card BEFORE the manifest resolves; the scene reveal waits for both the title card complete AND the manifest.
- **Story 1.7 (85fc2ce):** Lit 3.3.3, `BaseElement`, all design tokens. The `--v-size-title-card` token is `clamp(36px, 4.0vw, 56px)` per UX spec line 986 — confirm it's in `tokens.css` and add if missing.
- **Story 1.8 (24c7d7e):** boot-time probe + fallback page. The probe gates the load before this story's first-paint sequence runs. No interaction needed.

### Git Intelligence

Recent commits on `epic1`:
- `24c7d7e Story 1.8: <v-fallback-page> + boot-time capability probe`
- `85fc2ce Story 1.7: Design tokens, Lit 3 scaffold, and self-hosted typography`
- `c041a0f Story 1.6: Asset manifest loader + EphemerisService`

Branch: `epic1`. LFS at ~188 MB + 99 KB fonts.

### Project Context Reference

- Epic: `_bmad-output/planning-artifacts/epics.md` §Story 1.9 (lines 649–697)
- UX spec: `_bmad-output/planning-artifacts/ux-design-specification.md` §First-Paint (line 74), §Components Table (line 1197), §`--v-size-title-card` (line 986)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` §Decision 2 service graph, §line 418 (Pointer Events), §line 935 (et-conversions location), §line 315 (URLSync description)
- PRD: FR1 (scrub any point), FR6 (return to start/end), FR42 (URL always current), FR45 (keyboard scrub keys)
- UX-DR8 (scrubber as primary control), UX-DR22 (44×44 hit area), UX-DR28 (designed first three seconds), UX-DR32 (slider keyboard + pointer-events), NFR-S7 (silent reject on bad URL)
- ADRs: 0001 (URL contract as public API), 0025 (first-party WAI-ARIA APG patterns), 0015 (service graph, no global store)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9]
- [Source: _bmad-output/planning-artifacts/architecture.md#L418] — Pointer Events API primitive
- [Source: _bmad-output/planning-artifacts/architecture.md#L935] — et-conversions module
- [Source: _bmad-output/planning-artifacts/architecture.md#L315] — URLSync service
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#L74] — Cold-start moment
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#L986] — `--v-size-title-card` token
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-S7] — silent URL reject
- [Source: docs/adr/0001-url-contract-as-public-api.md]
- [Source: docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`

### Debug Log References

- ET conversion algorithm validated against SpiceyPy 8.1.0 + naif0012.tls reference values for 8 mission-critical dates; max delta 1.5 ms (the omitted K·sin(E) periodic correction, peak ~1.657 ms).
- Mission endpoints `MISSION_START_ET = -705844751.8171712` (1977-08-20T00:00:00Z) and `MISSION_END_ET = 978264068.1839114` (2030-12-31T23:59:59Z) derived from `spiceypy.str2et(...)` with the kernel furnshed. These are the canonical SPICE values; the previous approximate constants documented in the story (-704412036 / 978307200) were placeholders.
- Throttle rate test in `url-sync.test.ts` initially failed at "≤4 history writes per second" — the leading-edge throttle was producing trailing writes inside the current window. Fixed by chaining the trailing-write timer so it opens a *new* window rather than closing the current one. Result: strict ≤1 per 250ms window even under continuous 60Hz pointermove load.
- `isoFromEt(MISSION_END_ET)` initially truncated to `2030-12-31T23:59:58Z` (drift from the K·sin(E) omission); fixed by switching from `Math.floor(ms)` to `Math.round(ms / 1000) * 1000` so round-trip lands on the wall-clock second.
- Boundary range check in `URLSync.parseInitialT` needed ±1 second slack — without it, `?t=` carrying the formatted `MISSION_END_ISO` reparses to a value slightly outside the strict `[start, end]` range due to the same K·sin(E) approximation.
- `main.ts` triggered a WebGL context error when imported by `tests/first-paint-sequence.test.ts` (auto-bootstrap on import). Refactored `startFirstPaint` into a dedicated `web/src/boot/first-paint.ts` module so the integration tests can exercise the first-paint flow without booting the renderer.
- happy-dom does not synthesize the global `PointerEvent` class consistently; tests construct plain `Event` instances with `clientX`/`clientY`/`pointerType`/`pointerId` defined via `Object.defineProperty`. The pointer-events primitive treats events as duck-typed so the production code is unchanged.

### Completion Notes List

- 7 new source modules created (`math/et-conversions.ts`, `constants/mission.ts`, `primitives/pointer-events.ts`, `services/url-sync.ts`, `components/v-title-card.ts`, `components/v-timeline-scrubber.ts`, `boot/first-paint.ts`). 1 module extended (`main.ts`). 1 token added to `styles/tokens.css` (`--v-size-title-card`).
- New `web/src/primitives/` and `web/src/constants/` directories established (first occupants of each per the architecture's directory plan).
- 144 new vitest cases added across 9 test files; total web suite up from 514 → 658 tests, all passing. Bake fast suite unchanged at 233+2 skipped.
- All 8 acceptance criteria implemented and covered:
  - **AC1** (title card hold + dissolve + reduced-motion + no banners): `v-title-card.test.ts` + `first-paint-sequence.test.ts`.
  - **AC2** (mission-variant scrubber + track domain + visual treatment + chapters stub): `v-timeline-scrubber.test.ts` Structure, Thumb-position, Chapters-stub blocks.
  - **AC3** (WAI-ARIA Slider with ISO/HUD value formatting): `v-timeline-scrubber.test.ts` ARIA block.
  - **AC4** (keyboard scrubbing + pause-on-scrub debounced resume): `v-timeline-scrubber.test.ts` Keyboard + Pause-on-scrub blocks.
  - **AC5** (Pointer Events API with capture + drag): `v-timeline-scrubber.test.ts` Pointer block + `pointer-events.test.ts`.
  - **AC6** (URL `?t=` throttled `replaceState`): `url-sync.test.ts` (19 cases) + scrubber AC6 block.
  - **AC7** (boot-time `?t=` parsing + silent reject NFR-S7): `url-t-parameter.test.ts` (11 cases) + `url-sync.test.ts` parseInitialT block.
  - **AC8** (44×44 hit area via `::before` pseudo): `v-timeline-scrubber.test.ts` AC8 block (CSS-rule-text assertion since happy-dom does not implement pseudo-element layout).
- Story 1.10 will refactor the scrubber to consume `ClockManager.simTimeEt`; the placeholder `simEt` + `isPlaying` reactive props are intentionally local-state only for now.
- Story 2.2 will populate the `.chapters` slot with vertebrae markers; the slot is rendered empty here as a no-op stub.
- TypeScript strict-mode compile clean (`npx tsc --noEmit` reports 0 errors). ESLint clean (0 errors, 1 pre-existing warning in `ephemeris-service.ts`).

### File List

New files:

- `web/src/math/et-conversions.ts` + `web/src/math/et-conversions.test.ts`
- `web/src/constants/mission.ts` + `web/src/constants/mission.test.ts`
- `web/src/primitives/pointer-events.ts` + `web/src/primitives/pointer-events.test.ts`
- `web/src/services/url-sync.ts` + `web/src/services/url-sync.test.ts`
- `web/src/components/v-title-card.ts` + `web/src/components/v-title-card.test.ts`
- `web/src/components/v-timeline-scrubber.ts` + `web/src/components/v-timeline-scrubber.test.ts`
- `web/src/boot/first-paint.ts`
- `web/tests/first-paint-sequence.test.ts`
- `web/tests/url-t-parameter.test.ts`

Modified files:

- `web/src/main.ts` — wired `startFirstPaint(canvas.parentElement ?? document.body)` into the normal-flow bootstrap.
- `web/src/styles/tokens.css` — added `--v-size-title-card: clamp(36px, 4vw, 56px)` token.
- `README.md` — added "First-Paint Sequence" subsection under "Rendering".
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-9` set to `in-progress` then `review`.

### Change Log

| Date       | Author    | Summary                                                                                                                                                            |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-18 | dev-1-9   | Story 1.9 first implementation: title card, mission-variant scrubber, ET conversions, pointer-events primitive, URLSync `?t=` parsing, first-paint integration. 144 new tests; total suite 658 / 658. |
| 2026-05-18 | cr-1-9    | Code review pass. All 8 ACs verified. MED resolved in-place: added `get/set simEt` accessor pair in `v-timeline-scrubber.ts` so direct property writes (Story 1.10 ClockManager subscription, test code) clamp to `[MISSION_START_ET, MISSION_END_ET]` rather than relying on the user-input paths alone. Visual fallback via `computeFraction` retained as the second line of defense (the QA defense test for OOB writes still passes). Tests: web 695/695, bake fast 233 + 2 skipped, bake slow 11/11, tsc clean. Story → done. |
