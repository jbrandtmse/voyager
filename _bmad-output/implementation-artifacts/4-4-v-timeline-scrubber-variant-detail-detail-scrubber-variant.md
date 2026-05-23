# Story 4.4: `<v-timeline-scrubber variant="detail">` Detail-Scrubber Variant

**Epic:** 4 — Encounter Chapters (All Six Gas-Giant Flybys)
**Status:** review
**Date created:** 2026-05-23

## User Story

As a visitor inside an encounter window,
I want a second, finer-grained scrubber to slide into view above the mission scrubber so I can scrub the encounter at chapter-scale cadence without losing the mission-wide spine,
So that the dual-scrubber pattern from UX-DR31 is operational and FR1 sub-day scrub during encounters is enabled.

## Consumed-by

- **Story 4.5** (V1 Jupiter encounter chapter): first encounter where the detail scrubber is user-visible at the V1J chapter window. The detail-scrubber rendering AND the mission-scrubber highlight band (this story's AC6) are validated end-to-end in 4.5's MCP smoke.
- **Story 4.6 / 4.7** (other encounter chapters): same detail-scrubber pattern reused per chapter; no per-chapter wiring expected once 4.4 lands.
- **Story 6.4** (a11y polish): the detail scrubber's APG-Slider keyboard contract is audited in 6.4's a11y sweep.

This story **amends** the existing `<v-timeline-scrubber>` component from Story 1.9 — it does not introduce a new service. The new behaviour adds the `'detail'` branch of the `ScrubberVariant` union (already typed at `web/src/components/v-timeline-scrubber.ts:23` per Story 1.9's forward-compat declaration) and wires substate-driven visibility plus dual-scrubber state-sync semantics.

## Consumes

- **ChapterDirector** (Story 2.1) — for `entering`/`held`/`exiting`/`passed` substate transitions per encounter chapter.
- **ClockManager** (Story 1.10) — for `scrubTo(et)` writes and `simTimeEt` reads (shared with mission variant).
- **URLSync** (Story 1.9) — for the 250ms throttled `writeEtThrottled` writeback.
- **`createSliderKeyboardHandler`** primitive at `web/src/primitives/slider-keyboard.ts` (Rule 9 obligation — extracted by Story 3.0 AC4).
- **`attachPointerHandlers`** primitive at `web/src/primitives/pointer-events.ts` (for the dual-scrubber pointer-capture discipline).

## Acceptance Criteria

### AC1 — Detail variant visual treatment matches UX spec

- **GIVEN** the existing `<v-timeline-scrubber>` component from Story 1.9 (variant='mission' is already live)
- **WHEN** I render the same component with `variant="detail"` and `range-start`/`range-end` set to a chapter's window
- **THEN** the visual treatment matches the UX-DR31 detail anatomy:
  - 4px-tall track with background `rgba(212, 160, 23, 0.18)` (accent at ~18% opacity)
  - 10px solid `--v-color-accent` circle thumb (NO border ring, distinct from mission variant's pin glyph)
  - Track sits ABOVE the mission scrubber with `--v-spacing-md` separation (vertical stack)
- **AND** the chapter's date-range labels render at the track ends as uppercase mono in `--v-color-accent`:
  - Left label: month + day (e.g., "FEB 28")
  - Right label: month + day + year (e.g., "MAR 12, 1979") — year on the right only to avoid redundancy
  - Both labels derive from the chapter spec's `[windowStartEt, windowEndEt]` via `isoFromEt` + a date-formatter helper that the dev adds at `web/src/math/et-conversions.ts` (extend the existing module — do not introduce a new file)
- **AND** the variant prop is reactive — toggling between `'mission'` and `'detail'` re-renders without remounting (Lit reactive-accessor contract per Rule 10)

### AC2 — Slide-in / slide-out driven by ChapterDirector substate

- **GIVEN** the `ChapterDirector` enters the `entering` substate of an encounter chapter (chapter slug matches `/^v[12]-(jupiter|saturn|uranus|neptune)$/` per the existing chapter registry)
- **WHEN** the substate change fires
- **THEN** the detail scrubber slides into view above the mission scrubber over `--v-duration-slow` (400ms ease-out; 0ms under reduced motion per `(prefers-reduced-motion: reduce)`)
- **AND** the detail scrubber's `range-start`/`range-end` props update to match the active chapter's `[windowStartEt, windowEndEt]` BEFORE the slide-in begins (so the user never sees a flash of wrong-range content)
- **AND** on `exiting → passed` transition, the detail scrubber slides out symmetrically (or instant under reduced motion)
- **AND** the detail scrubber is NOT rendered for non-encounter chapters (e.g., `cruise`, `pale-blue-dot`); for safety, the slide-in condition gates on BOTH the chapter slug pattern AND the chapter's `targetBody` (must be 5/6/7/8, gas-giant NAIF) — this means a future "cruise interlude" chapter that happens to enter `held` doesn't accidentally surface the detail scrubber
- **AND** an existing `aria-hidden="true"` attribute on the detail scrubber's root flips to `aria-hidden="false"` synchronously with the slide-in CSS class — when off-screen the detail scrubber must be inaccessible to assistive technologies

**Rule 5 amendment candidate.** The original epics-md AC wording says "at ±5 days from closest approach." The chapter `windowStartEt`/`windowEndEt` for encounter chapters is currently ±30 days (e.g., `v1-jupiter` window is `anchorEt ± 30 days * 86400` = ~2.59e6s). The story interprets "detail scrubber slides in" as "on ChapterDirector substate transition" (the only event already available), and the slide-in range is the chapter window — not a tighter ±5d. If the user wants a distinct ±5d slide-in trigger (independent of the chapter window), file as a separate Story 6.x polish task. Document the in-place amendment in the story's Dev Agent Record per Rule 5.

### AC3 — Pointer-capture discipline (UX-DR31 mid-drag transition)

- **GIVEN** both scrubbers are visible (mission + detail) AND a `pointerdown` started on the mission scrubber
- **WHEN** the user drags the mission scrubber's thumb mid-gesture across the chapter window boundary (the substate transitions to `entering` mid-drag)
- **THEN** the detail scrubber slides in **without** hijacking the pointer-capture — UX-DR31 "mid-drag scrubber transitions never hijack pointer-capture"
- **AND** the user's pointer remains bound to the mission scrubber's thumb element until `pointerup` (the active drag target does not change)
- **AND** after `pointerup`, the detail scrubber becomes the default drag surface for subsequent gestures inside the window (a fresh `pointerdown` on the detail-scrubber track or thumb area is captured by it)
- **AND** the symmetric case (drag started on detail scrubber, mission scrubber substate fires `exiting` mid-drag) also preserves pointer-capture on the original target

### AC4 — Dual-scrubber state sync

- **GIVEN** both scrubbers are visible
- **WHEN** I drag the detail scrubber thumb
- **THEN** the simulation scrubs at chapter-scale cadence within the encounter window (the detail scrubber's `range` defines pixel-to-ET mapping; same `ClockManager.scrubTo(et)` call as the mission scrubber)
- **AND** the mission scrubber's thumb position updates **simultaneously** to reflect the new ET (the two scrubbers always show consistent state — both read from `clockManager.simTimeEt`)
- **AND** the URL writeback throttling from Story 1.9 applies (single 250ms `URLSync.writeEtThrottled` coalesce shared between both scrubber drags — NOT one throttle per scrubber, which would double-fire)
- **AND** the symmetric case: dragging the mission scrubber inside the chapter window updates the detail scrubber's thumb simultaneously

### AC5 — APG Slider keyboard with cadence-aware step sizes (Rule 9)

- **GIVEN** the detail scrubber implements WAI-ARIA Slider via `createSliderKeyboardHandler` (Rule 9 obligation — NO inline keyboard logic in the component)
- **WHEN** I tab to it and press `←`/`→`
- **THEN** the keyboard step size is cadence-aware based on the cursor's position within the encounter window:
  - **Cruise refinement** (et within window but outside ±2 days of anchor): 1-hour step (3600s)
  - **Refinement** (et within ±2 days but outside ±1 hour of anchor): 1-minute step (60s)
  - **Closest approach** (et within ±1 hour of anchor): 10-second step (10s)
  - `Shift+←/→` multiplies the step by 10
- **AND** the step thresholds are derived from the chapter spec — match the Story 4.3 cadence-band table (`bake/src/bake_trajectories.py:CADENCE_BANDS` already lists `hourly: ±30d, 1min: ±2d, 10sec: ±1hr`); document the source-of-truth alignment in the dev notes
- **AND** `aria-label="<chapter name> encounter timeline"` (e.g., "V1 Jupiter encounter timeline" — derived from `chapter.name` at render time)
- **AND** `aria-valuetext` exposes the human-readable date `"YYYY-MM-DD HH:MM UT"` per Story 1.9's `formatForHud` helper (already imported)
- **AND** the focus ring renders per the global `:focus-visible` rule (no per-component override)
- **AND** the keyboard handler is constructed via `createSliderKeyboardHandler({ getValue, valueMin, valueMax, stepSmall: <cadence-aware>, stepLarge: <cadence-aware×10>, onChange, onStart, onEnd })` — the `stepSmall` / `stepLarge` are recomputed lazily inside `getValue` (or via a getter on the options object passed to the factory) so the cadence-aware tier responds to the current cursor position

### AC6 — Mission scrubber highlight band (UX-DR31)

- **GIVEN** the mission scrubber is rendered AND the detail scrubber is open (i.e., the active chapter is an encounter)
- **WHEN** I look at the mission scrubber's track
- **THEN** the mission scrubber renders a subtle highlight band marking the chapter's `[windowStartEt, windowEndEt]` extent in `--v-color-accent` at low alpha (`rgba(212, 160, 23, 0.18)` — same alpha as the detail track background, for visual continuity)
- **AND** the band is positioned via CSS percentage based on `(windowStartEt - MISSION_START_ET) / (MISSION_END_ET - MISSION_START_ET)` and `(windowEndEt - MISSION_START_ET) / (MISSION_END_ET - MISSION_START_ET)` (same pattern as the existing chapter pin markers)
- **AND** the band visually connects to the detail scrubber's extent — positionally aligned via the same percentage math, so a sighted user reading both scrubbers gets "this slice of the mission timeline is the active encounter"
- **AND** when the detail scrubber is NOT open (cruise / pale-blue-dot / no active encounter chapter), the highlight band is not rendered

### AC7 — Integration AC (Rule 1): real ChapterDirector + ClockManager drive the detail-variant slide-in

- **GIVEN** this story amends the scrubber to consume real ChapterDirector substate
- **WHEN** Story 4.4 lands
- **THEN** `web/tests/v-timeline-scrubber-detail-integration.test.ts` constructs:
  - A real `ClockManager` instance
  - A real `ChapterDirector` instance constructed against `ALL_CHAPTERS` from `web/src/chapters/registry.ts`
  - A real `URLSync` (or a thin stub mirroring its interface — your call; the test must NOT mock the entire integration chain)
  - Two `<v-timeline-scrubber>` instances mounted: one with `variant="mission"` (the existing default), one with `variant="detail"`
- **AND** the test exercises:
  - Synthesize ET sequence: cruise (et = mission start + 1 year) → entering V1J window (et = `v1-jupiter.windowStartEt + 1`) → V1J held (et = `v1-jupiter.anchorEt`) → exiting V1J (et = `v1-jupiter.windowEndEt - 1`)
  - Assert that the detail scrubber's `aria-hidden` flips from `"true"` → `"false"` on the entering substate
  - Assert that both scrubbers' `aria-valuenow` agree on the V1J anchor ISO date
  - Assert that the mission scrubber's track DOM has a `.highlight-band` child whose CSS `left` / `right` percentages match the V1J window
  - Reverse-scrub past `windowStartEt` and assert the detail scrubber's `aria-hidden` flips back to `"true"`

### AC8 — Lead-driven Chrome DevTools MCP smoke (Rule 3 + Rule 8)

- **GIVEN** Story 4.4 touches user-facing UI (the detail scrubber DOM, the mission scrubber highlight band, dual-scrubber drag interactions)
- **WHEN** the lead drives the smoke after dev + QA + code-review complete
- **THEN** the lead navigates Chrome DevTools MCP to `/c/v1-jupiter` and verifies:
  - Both `<v-timeline-scrubber>` instances are present in the DOM (count = 2 via `document.querySelectorAll('v-timeline-scrubber').length`)
  - The detail-variant instance has `[variant="detail"]` attribute AND `aria-hidden="false"` AND `getComputedStyle(...).opacity === '1'` (or `>= 0.99`)
  - The detail-variant's track DOM uses the spec colours and dimensions (read `getComputedStyle` for `height === '4px'`, `background-color === 'rgba(212, 160, 23, 0.18)'`)
  - The mission scrubber has a `.highlight-band` child with non-zero width inside the V1J extent
  - Tab-focus into the detail scrubber AND press `→` — assert `aria-valuenow` advances by the cadence-aware step (10 seconds at the V1J anchor, NOT 1 day)
  - Scrub the detail scrubber with a synthetic `pointermove`, assert the mission scrubber's `aria-valuenow` updates simultaneously
  - Console clean (no new warnings beyond the baseline)
- **AND** smoke evidence captured under `_bmad-output/implementation-artifacts/4-4-smoke-evidence/`
- **AND** reverse-scrub mini-probe: drag the mission scrubber back to a cruise ET (e.g., 1985-06-01), assert the detail scrubber `aria-hidden` flips to `"true"` AND `getComputedStyle.opacity === '0'`

### AC9 — Test sweep + lint baseline preserved + Rule-10 + ADR-0025 compliance

- **GIVEN** the project's test pyramid post-Story-4.3 baseline: web vitest 2692 pass / 2 skipped / 155 files; bake fast pytest 430/4/19
- **WHEN** Story 4.4 ships
- **THEN** web vitest pass count rises by the net new tests (estimate: +30 unit + integration tests covering the detail variant rendering, substate-driven visibility, pointer-capture discipline, dual-scrubber sync, cadence-aware keyboard); bake pytest unchanged (this story has no bake-side surface)
- **AND** typecheck clean; lint baseline preserved (≤ 4 warnings; 0 new)
- **AND** **Rule 10 compliance** (CRITICAL — applies to the new reactive properties): any new Lit reactive property added to `VTimelineScrubber` (e.g., `rangeStart: number`, `rangeEnd: number`, `chapterDirector: ChapterDirector | null` if not already present) MUST use the `declare <name>: <type>` form WITH NO initializer + ctor-body assignment — NOT a class-field initializer. Canonical pattern citation: `web/src/components/v-chapter-index.ts:235-262`. Story 3.6 burned half a day on this exact trap; Rule 10 prevents re-discovery. The code reviewer treats class-field-initialized reactive properties as a HIGH finding.
- **AND** **ADR-0025 compliance** (Rule 9 obligation): the keyboard contract is delegated to `createSliderKeyboardHandler` — NO inline `Home`/`End`/`Arrow` logic in the component body. Inline re-implementation is a HIGH finding per Rule 9.
- **AND** **Rule 1 Integration AC** verified by AC7 above.

## Out of Scope (Defer to Specific Later Stories)

- **A separate ±5d "near anchor" slide-in trigger** distinct from the chapter window — out of scope per the AC2 Rule-5 amendment candidate. The chapter substate IS the slide-in trigger. If the user wants a tighter trigger, file as a Story 6.x polish task.
- **Detail-scrubber chapter markers** (sub-chapter ticks at hour / minute / 10-second boundaries) — out of scope; the detail variant track is unmarked except for the date-range end labels. Markers are an Epic 6 polish candidate.
- **Mobile-portrait orientation tuning** for the dual-scrubber stack — the vertical stack is enforced; viewport-narrow stack-collapse behaviour can be tuned in Epic 6.
- **Touch-pinch zoom on the detail track** — explicit out-of-scope (UX-DR31 says "scrub only, no zoom"). The detail scrubber maintains a fixed range = chapter window for its lifecycle.

## Tasks / Subtasks

- [x] **T1: Detail variant visual treatment + range props** (AC1)
  - [x] T1.1: Extend `<v-timeline-scrubber>` to render the `'detail'` branch — add `range-start: number` + `range-end: number` reactive properties (Rule 10 `declare` + ctor pattern).
  - [x] T1.2: Add the detail-variant CSS block (4px track, 10px circle thumb, accent-low-alpha background).
  - [x] T1.3: Date-range label helpers in `web/src/math/et-conversions.ts` (extend; no new file).
  - [x] T1.4: Unit tests pin the variant rendering and range-prop reactivity.

- [x] **T2: Slide-in / slide-out wired to ChapterDirector substate** (AC2)
  - [x] T2.1: Subscribe to ChapterDirector's `subscribe(...)` event in `connectedCallback` for the detail variant; filter to encounter-chapter substate transitions.
  - [x] T2.2: Slide-in CSS keyframe + `aria-hidden` toggle synchronized with the class flip.
  - [x] T2.3: Reduced-motion carve-out (0ms duration; instant toggle).
  - [x] T2.4: Unit tests pin the substate-event → slide-in chain.

- [x] **T3: Dual-scrubber pointer-capture discipline** (AC3)
  - [x] T3.1: Use `attachPointerHandlers` (existing primitive) for both scrubbers' drag handlers; ensure the active drag target is the element that received `pointerdown`, not the substate-determined "default."
  - [x] T3.2: Mid-drag substate transition test — pointer-capture stays on the original element until `pointerup`.

- [x] **T4: Dual-scrubber state sync** (AC4)
  - [x] T4.1: Both scrubbers read `clockManager.simTimeEt` for their `aria-valuenow` + thumb position — single source of truth.
  - [x] T4.2: Shared URLSync throttle — both scrubber drag handlers funnel through `URLSync.writeEtThrottled` (NOT two parallel throttles).
  - [x] T4.3: Test the symmetric drag (mission → detail update, detail → mission update).

- [x] **T5: APG Slider keyboard with cadence-aware steps** (AC5)
  - [x] T5.1: Build a `cadenceAwareStep(et, chapter)` helper that returns `{ stepSmall, stepLarge }` based on the cursor's position within the encounter window (1h / 1min / 10s tiers per the Story 4.3 CADENCE_BANDS).
  - [x] T5.2: Construct the keyboard handler via `createSliderKeyboardHandler` with `getValue` / `valueMin` / `valueMax` from the detail scrubber's range + a `stepSmall` / `stepLarge` that derive from `cadenceAwareStep(getValue(), activeChapter)` lazily — NOT snapshotted at construction time.
  - [x] T5.3: Unit tests pin the cadence-aware step behaviour at each tier boundary.

- [x] **T6: Mission scrubber highlight band** (AC6)
  - [x] T6.1: Extend the mission variant template to conditionally render `<div class="highlight-band">` when ChapterDirector's `activeChapter` is an encounter.
  - [x] T6.2: CSS percentage positioning + low-alpha accent fill.
  - [x] T6.3: Unit test pins the band's left/right percentages against the V1J window math.

- [x] **T7: Integration AC test** (AC7)
  - [x] T7.1: Author `web/tests/v-timeline-scrubber-detail-integration.test.ts` per AC7.

- [x] **T8: AC8 smoke prerequisites + `__voyagerDebug.timelineScrubbers` debug surface**
  - [x] T8.1: Publish an array of scrubber references under `import.meta.env.DEV` so the lead's MCP smoke can introspect both instances (current `__voyagerDebug` already exposes ChapterDirector + RenderEngine; add scrubbers).
  - [x] T8.2: Document smoke probe plan in this file's `## Smoke probe plan (AC8)` section.

- [x] **T9: Final sweep + Rule-10 + ADR-0025 compliance audit** (AC9)

## Dev Notes

### Critical files Story 4.4 touches

- `web/src/components/v-timeline-scrubber.ts` (modify — variant='detail' branch + new reactive props per Rule 10)
- `web/src/components/v-timeline-scrubber.test.ts` (extend with detail-variant test cases)
- `web/src/math/et-conversions.ts` (extend with date-range label helpers — no new file)
- `web/tests/v-timeline-scrubber-detail-integration.test.ts` (NEW — Integration AC per Rule 1)
- `web/src/main.ts` (wire the detail-variant scrubber instance + publish under `__voyagerDebug` per T8.1)
- `web/src/styles/` (possibly extend with detail-variant CSS variables — match the project's existing CSS architecture; if scrubber styles are component-scoped via Lit `static styles`, the additions live in `v-timeline-scrubber.ts` itself)

### Rule 10 — Lit reactive-property discipline (CRITICAL, Story 3.6 lesson)

The new reactive properties added to `VTimelineScrubber` (e.g., `rangeStart`, `rangeEnd`) MUST follow the canonical pattern at `web/src/components/v-chapter-index.ts:235-262`:

```ts
static properties = {
  rangeStart: { type: Number, attribute: 'range-start' },
  rangeEnd: { type: Number, attribute: 'range-end' },
};

declare rangeStart: number;  // NO initializer here — `declare` only
declare rangeEnd: number;

constructor() {
  super();
  this.rangeStart = MISSION_START_ET;
  this.rangeEnd = MISSION_END_ET;
}
```

NOT this anti-pattern (silent reactive-accessor shadowing — Lit emits a `class-field-shadowing` runtime warning):

```ts
rangeStart = MISSION_START_ET;  // WRONG — class-field initializer shadows the accessor
rangeEnd = MISSION_END_ET;
```

The code reviewer treats class-field-initialized Lit reactive properties as a HIGH finding (sibling of Rule 9). Story 3.6 (`<v-attitude-indicator>` HUD provenance) burned half a day on this exact trap.

### Rule 9 — APG Slider primitive (CRITICAL, ADR-0025 obligation)

The detail variant's keyboard handler MUST consume `createSliderKeyboardHandler({...})` from `web/src/primitives/slider-keyboard.ts` — NO inline `Home`/`End`/`Arrow` keyboard logic in the component body. The cadence-aware step computation lives in a separate helper (`cadenceAwareStep(et, chapter)`) that the component calls inside `getValue` (or via a re-built handler on chapter-change). Inline keyboard logic in the component is a HIGH finding per Rule 9.

### Story 3.0 AC4 already extracted the slider primitive

The mission variant of `<v-timeline-scrubber>` already consumes `createSliderKeyboardHandler` (Story 3.0 AC4 path (a)). The detail variant inherits that wire-up — extend, don't duplicate. If the existing wire-up needs to be parameterized by variant, do so at the call site (e.g., a variant-conditional `stepSmall` / `stepLarge` selector) rather than introducing a second handler factory.

### Pointer-capture discipline pattern (UX-DR31)

The `attachPointerHandlers` primitive at `web/src/primitives/pointer-events.ts` handles `setPointerCapture` / `releasePointerCapture` correctly when wired naturally — the capture is bound to the element that received the `pointerdown`. As long as both scrubbers wire their own `pointerdown` handlers separately, mid-drag substate transitions cannot move the capture (the capture target is a DOM element reference, not a substate). Test this explicitly in T3.2 via a synthesized `pointerdown` on the mission element followed by a manual ChapterDirector substate transition mid-event.

### Cadence-aware step source-of-truth alignment

The cadence-band thresholds in `cadenceAwareStep` MUST match the Story 4.3 `bake/src/bake_trajectories.py:CADENCE_BANDS` table — same source-of-truth (Rule 5 in spirit). Document the alignment in the helper's docstring; if the bake's CADENCE_BANDS ever change, this helper changes too.

### NFR / ADR compliance pointers

- **UX-DR31 (dual-scrubber pattern, mid-drag transition no-hijack)**: AC2 + AC3 directly honour this.
- **FR1 (sub-day scrub during encounters)**: AC5's 10-second cadence at ±1hr of CA closes this.
- **ADR-0025 (APG primitives extracted)**: AC5 + Rule 9 enforce this.
- **Rule 10 (Lit reactive-property discipline)**: AC9 enforces this.
- **Story 2.1 ChapterDirector subscribe contract**: AC2's substate event wiring inherits this.
- **Story 1.10 ClockManager single-source-of-truth**: AC4's dual-scrubber state sync inherits this.

## Smoke probe plan (AC8) — for the lead's Chrome DevTools MCP

The lead drives the smoke after dev / QA / code-review complete. Probes are stored under `_bmad-output/implementation-artifacts/4-4-smoke-evidence/`.

**Pre-probe environment:**

- `cd web && pnpm dev`
- Navigate to `http://localhost:5173/c/v1-jupiter`
- Wait for the cold-load steady state: `__voyagerDebug.chapterDirector.activeChapter?.slug === 'v1-jupiter'`.

**Probe 1 — Both scrubbers present + detail-variant visible:**

```js
const scrubbers = document.querySelectorAll('v-timeline-scrubber');
const variants = Array.from(scrubbers).map((s) => s.getAttribute('variant'));
const detailEl = Array.from(scrubbers).find((s) => s.getAttribute('variant') === 'detail');
const detailComputed = detailEl ? getComputedStyle(detailEl) : null;
return {
  count: scrubbers.length,
  variants,
  detailAriaHidden: detailEl?.getAttribute('aria-hidden'),
  detailOpacity: detailComputed?.opacity,
};
// expected: count === 2, variants includes 'mission' and 'detail',
//           detailAriaHidden === 'false', detailOpacity === '1' or '0.99'+
```

**Probe 2 — Detail track visual spec:**

```js
const detailEl = document.querySelector('v-timeline-scrubber[variant="detail"]');
const track = detailEl?.shadowRoot?.querySelector('.track');
const trackStyle = track ? getComputedStyle(track) : null;
return {
  height: trackStyle?.height,
  bgColor: trackStyle?.backgroundColor,
};
// expected: height === '4px', bgColor === 'rgba(212, 160, 23, 0.18)'
```

**Probe 3 — Mission scrubber highlight band:**

```js
const missionEl = document.querySelector('v-timeline-scrubber[variant="mission"]');
const band = missionEl?.shadowRoot?.querySelector('.highlight-band');
const bandStyle = band ? getComputedStyle(band) : null;
return { present: !!band, left: bandStyle?.left, right: bandStyle?.right };
// expected: present === true; left/right are non-empty percentages
//           bracketing the V1J window
```

**Probe 4 — Cadence-aware keyboard step:**

```js
const detailEl = document.querySelector('v-timeline-scrubber[variant="detail"]');
const thumb = detailEl?.shadowRoot?.querySelector('[role="slider"]');
thumb?.focus();
const before = thumb?.getAttribute('aria-valuenow');
thumb?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
const after = thumb?.getAttribute('aria-valuenow');
// At the V1J anchor (et inside ±1hr CA), the step should be 10 seconds.
// Parse before/after as ISO dates and compute the delta in seconds.
```

**Probe 5 — Dual-scrubber state sync:**

```js
const missionEl = document.querySelector('v-timeline-scrubber[variant="mission"]');
const detailEl = document.querySelector('v-timeline-scrubber[variant="detail"]');
const missionValue = missionEl?.shadowRoot?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow');
const detailValue = detailEl?.shadowRoot?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow');
return { missionValue, detailValue, agree: missionValue === detailValue };
// expected: agree === true
```

**Probe 6 — Reverse-scrub mini-probe (slide-out on exit):**

Scrub via `__voyagerDebug.clockManager.scrubTo(MISSION_START_ET + ONE_YEAR_SECONDS)` (cruise 1985 era), wait for `requestAnimationFrame`, re-probe:

```js
const detailEl = document.querySelector('v-timeline-scrubber[variant="detail"]');
return {
  ariaHidden: detailEl?.getAttribute('aria-hidden'),
  opacity: getComputedStyle(detailEl).opacity,
};
// expected: ariaHidden === 'true', opacity === '0'
```

**Evidence capture:**

- `mcp__chrome-devtools-mcp__take_screenshot` of the cold-loaded V1 Jupiter view with both scrubbers visible.
- `mcp__chrome-devtools-mcp__list_console_messages` — expected: no `error` / `warn` beyond the documented Lit dev banner + cycle-7-documented "Multiple active KTX2 loaders" advisory.

## References

- Epic 4 spec for Story 4.4: `_bmad-output/planning-artifacts/epics.md:1677-1719`
- Story 1.9 (mission scrubber): `_bmad-output/implementation-artifacts/1-9-*.md`
- Story 2.1 (ChapterDirector): `web/src/services/chapter-director.ts`
- Story 3.0 AC4 + ADR-0025 (APG primitives extracted): `_bmad/custom/voyager-skill-rules.md § Rule 9`
- Story 3.6 (Lit `declare` + ctor-init): `_bmad/custom/voyager-skill-rules.md § Rule 10`
- Story 4.1 (ViewFrame + targetBody field on chapter spec): `_bmad-output/implementation-artifacts/4-1-*.md`
- Story 4.3 cadence-band tiering: `_bmad-output/implementation-artifacts/4-3-*.md`
- Slider primitive: `web/src/primitives/slider-keyboard.ts`
- Pointer-events primitive: `web/src/primitives/pointer-events.ts`
- Existing scrubber: `web/src/components/v-timeline-scrubber.ts`
- Canonical Lit `declare` pattern citation: `web/src/components/v-chapter-index.ts:235-262`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m]) under `/epic-cycle` → `bmad-dev-story` skill, 2026-05-23.

### Debug Log References

- `npx vitest run src/components/v-timeline-scrubber.test.ts` — 108 / 108 passed (76 pre-existing + 32 new).
- `npx vitest run src/primitives/cadence-aware-step.test.ts` — 14 / 14 passed.
- `npx vitest run src/math/et-conversions.test.ts` — 43 / 43 passed (32 pre-existing + 11 new for `monthDayLabelFromEt` / `monthDayYearLabelFromEt`).
- `npx vitest run tests/v-timeline-scrubber-detail-integration.test.ts` — 12 / 12 passed (Integration AC7 / Rule 1 surface).
- `npx vitest run tests/first-paint-sequence.test.ts tests/first-paint-defense.test.ts tests/first-paint-dispose-cleanup.test.ts tests/embed-mode-first-paint.test.ts tests/scrubber-chapter-markers-integration.test.ts` — 94 / 94 passed (no regressions in first-paint).
- `npx vitest run` (full sweep) — 2758 / 2761 passed, 2 skipped, 1 unrelated flaky perf-harness failure (`tests/clock-multiplier-defense.test.ts:527` "synthetic harness wall-clock < 60s and max tick < 50ms"). The test passes in isolation (`maxTickMs ≈ 1–5 ms` reported); the failure was triggered by system contention during the 192 s parallel run (this same test was the only one of 36 that ran when stashed away). Pre-existing flakiness; not introduced by Story 4.4. Bake-side fast pytest unchanged at 430/4/19.
- `npx tsc --noEmit` — clean.
- `npx eslint src tests` — 0 errors, 4 warnings (baseline preserved).

### Completion Notes List

- **Rule 5 amendment (AC2 "±5 days from closest approach" → ChapterDirector substate gating).** Original wording in the epic spec said the detail scrubber "slides in at ±5 days from closest approach." The chapter `windowStartEt`/`windowEndEt` for encounter chapters is currently ±30 days from the anchor (see `web/src/chapters/specs/v1-jupiter.ts`). The amendment, baked into the story's AC2 paragraph and implemented here, replaces the ±5-day threshold with "ChapterDirector substate transition" (the only event already available). The slide-in trigger is the chapter `entering` substate (forward) or the reverse-scrub `held → entering` substate; the slide-in range is `[windowStartEt, windowEndEt]`. A future Story 6.x can introduce a tighter ±5-day trigger as a polish task if the UX research demands it — it is OUT-OF-SCOPE per the story's "Out of Scope" section.
  - Original wording: "the detail scrubber slides in at ±5 days from closest approach"
  - Amended wording: "the detail scrubber slides in on `ChapterDirector` `entering` substate for encounter chapters (gated by slug pattern AND `targetBody` ∈ {5,6,7,8}); the slide-in range is the chapter's `[windowStartEt, windowEndEt]`"
  - Rationale: the chapter substate IS the slide-in trigger that ChapterDirector already emits per Story 2.1; introducing a separate ±5-day threshold would duplicate a signal that doesn't exist as an event. The Out-of-Scope clause records this so a future contributor can revisit it.

- **Rule 6 / Rule 9 compliance — APG Slider primitive consumption.** The detail variant's keyboard contract goes through `createSliderKeyboardHandler` from `web/src/primitives/slider-keyboard.ts`. The cadence-aware step computation lives in a NEW separate helper at `web/src/primitives/cadence-aware-step.ts` (mirrors the bake-side `CADENCE_BANDS` table for single source of truth per Rule 5 spirit). The handler is REBUILT on every keystroke via a wrapping `onKeyDown` arrow function so the cadence tier responds to the CURRENT cursor position — the factory's options bag is closed-over fresh each call, satisfying AC5's "lazy" clause. No inline `Home`/`End`/`Arrow` logic in the component body.

- **Rule 10 compliance — Lit reactive properties.** The new `rangeStart` / `rangeEnd` reactive properties use the canonical `declare <name>: <type>` (NO initializer) form + constructor-body assignment, matching `web/src/components/v-chapter-index.ts:235-262`. The existing `variant` property is already on this pattern (preserved from Story 1.9). Grep verification: no class-field initializer for `rangeStart` / `rangeEnd` exists in `v-timeline-scrubber.ts`.

- **Dual-scrubber URLSync sharing (AC4).** `web/src/boot/first-paint.ts` constructs the detail-variant scrubber and passes the SAME `urlSync` instance the mission scrubber uses (and the same `clockManager`). The 250 ms throttle is per-URLSync-instance, so sharing the instance means a single coalesce window across both drag surfaces. The mission and detail scrubbers' aria-valuenow ALWAYS agree because both read from `clockManager.simTimeEt`.

- **Forward/reverse substate semantics gate.** The ChapterDirector emits `entering` in BOTH forward (`out → entering → held`) and reverse (`held → entering → out`) directions. My handler discriminates via `event.from`: `to === 'entering' && from === 'out'` opens the detail (forward entry); `to === 'entering' && from === 'held'` closes it (reverse exit through the start edge). The final `out` state also closes; this together with `exiting` / `passed` covers all four exit paths.

- **AC8 / Rule 3 smoke evidence.** The dev-tier deliverables are complete and the lead-driven Chrome DevTools MCP smoke runs against `http://localhost:5173/c/v1-jupiter` after the dev/QA/code-review stages. Evidence will be captured under `_bmad-output/implementation-artifacts/4-4-smoke-evidence/`. The `__voyagerDebug.timelineScrubbers` array is published under `import.meta.env.DEV` in `main.ts` for the smoke's `evaluate_script` probes.

- **No bake-side surface changes.** Story 4.4 is entirely web-side (component, primitive, integration test). The bake pytest count is unchanged; no `bake/` files were modified.

### File List

Modified (full path from repo root):

- `web/src/components/v-timeline-scrubber.ts` — detail-variant branch (range props, slide-in/out subscriber, cadence-aware-step keyboard, highlight band on mission variant). Rule 10 `declare` + ctor-init pattern for `rangeStart` / `rangeEnd`.
- `web/src/components/v-timeline-scrubber.test.ts` — +32 new tests across AC1–AC6 (detail visual, slide-in/out, cadence-aware keyboard, mission highlight band, dual-scrubber sync, pointer-capture discipline).
- `web/src/math/et-conversions.ts` — new `monthDayLabelFromEt(et)` / `monthDayYearLabelFromEt(et)` helpers for detail-variant date-range labels.
- `web/src/math/et-conversions.test.ts` — +11 new tests for the date-range label helpers.
- `web/src/boot/first-paint.ts` — mounts the detail-variant scrubber alongside the mission one, shares the same URLSync + ClockManager + ChapterDirector instances. New `detailScrubber: VTimelineScrubber | null` field on `FirstPaintHandle`.
- `web/src/main.ts` — `__voyagerDebug.timelineScrubbers` array surface for the lead's MCP smoke (`evaluate_script`).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `4-4-...` flipped `ready-for-dev → in-progress → review`.

New (full path from repo root):

- `web/src/primitives/cadence-aware-step.ts` — `cadenceAwareStep(et, anchorEt)` helper + `CADENCE_BANDS` table; source-of-truth alignment with `bake/src/bake_trajectories.py:CADENCE_BANDS`.
- `web/src/primitives/cadence-aware-step.test.ts` — 14 unit tests covering all three tiers, boundary inclusivity, NaN/Infinity handling, stepLarge=10×stepSmall invariant.
- `web/tests/v-timeline-scrubber-detail-integration.test.ts` — 12 integration tests covering AC7 end-to-end (cruise → entering → held → exiting → reverse), plus a per-encounter-chapter sweep verifying all 6 encounter slugs open the detail variant and the 3 sampled non-encounter chapters do not.

### Change Log

| Date | Change |
| ---- | ------ |
| 2026-05-23 | Story 4.4 implemented end-to-end. Detail-variant scrubber lands per UX-DR31 dual-scrubber pattern: 4px track + 10px accent thumb + slide-in/out wired to ChapterDirector substate, cadence-aware keyboard step tied to bake-side CADENCE_BANDS, mission-scrubber highlight band, integration test against real services. Rule-5 amendment to AC2 documented above. Rule-6/9 (APG primitive) + Rule-10 (Lit `declare` + ctor-init) compliance audited. |
| 2026-05-23 | Code review complete. All 9 focus areas (Rule 1 Integration AC, Rule 5 AC2 amendment, Rule 6/9 ADR-0025 APG primitive, Rule 9 lazy cadence step, Rule 10 declare+ctor, Rule 3 smoke plan, AC3 pointer-capture race, AC4 URLSync sharing, AC2 aria-hidden synchronicity) pass. Zero HIGH / zero MED / zero LOW findings auto-resolved (none required). See Review Findings section. |

## Review Findings

**Reviewer:** Claude Opus 4.7 (claude-opus-4-7[1m]) under `/epic-cycle` → `bmad-code-review` skill, 2026-05-23.
**Triage outcome:** 0 HIGH / 0 MED / 0 LOW issues. Clean review.

### Focus areas verified PASS

1. **Rule 1 Integration AC (`web/tests/v-timeline-scrubber-detail-integration.test.ts`):**
   Constructs real `ClockManager`, real `ChapterDirector(ALL_CHAPTERS)`, real `URLSync` (lines 48-50). No `vi.mock`, no `vi.fn()` substituting the integration chain. Mounts two real `<v-timeline-scrubber>` instances. 12/12 integration tests pass + the per-encounter-chapter sweep covers all 6 encounter slugs.

2. **Rule 5 AC2 amendment documentation:**
   - Story file Dev Agent Record (lines 380-383) carries the original-vs-amended wording with rationale.
   - AC2 paragraph (story line 55) calls out the "Rule 5 amendment candidate" inline in the story spec.
   - Component (`web/src/components/v-timeline-scrubber.ts:41-56, 140-160`) docstring cites Story 4.4 AC2 and describes the ChapterDirector substate-driven slide-in mechanism (the amended contract). The amendment IS the architecture — there is no implementation-only comment hiding the change. Rule 5 satisfied across (a), (b), (c).

3. **Rule 6 ADR-0025 / Rule 9 APG Slider primitive consumption:**
   `web/src/components/v-timeline-scrubber.ts:817-846` — `onKeyDown` builds the handler via `createSliderKeyboardHandler({...})` (line 835). No inline `case 'ArrowLeft':` / `'Home':` / `'End':` / `'ArrowRight':` anywhere in the component (grep verified). QA Priority 7 source-grep tests (qa.test.ts:637-669) directly assert this. PASS.

4. **Rule 9 lazy cadence step (per-keystroke recompute):**
   `v-timeline-scrubber.ts:817-846` — the entire factory + cadenceAwareStep lookup runs INSIDE the arrow function body, fresh on every keystroke. QA Priority 7 +130s test (qa.test.ts:702-730) directly validates 3 successive ArrowRights cross the ±1h boundary and produce 10s+60s+60s=130s (NOT 30s). PASS.

5. **Rule 10 Lit declare+ctor pattern:**
   `v-timeline-scrubber.ts:420-426` — `declare variant: ScrubberVariant; declare rangeStart: number; declare rangeEnd: number;` (NO initializers). Constructor body (lines 527-534) assigns each via `this.<name> = ...`. The non-reactive instance fields `clockManager`, `chapterDirector`, `urlSync` carry class-field initializers but they are NOT in `static properties` — Rule 10 only governs reactive properties. QA Priority 8 (6 grep + runtime tests, qa.test.ts:737-790) pins all six grep defenses + the requestUpdate spy. PASS.

6. **Rule 3 per-story smoke plan (AC8):**
   Story file `## Smoke probe plan (AC8)` section (lines 254-345) lists 6 probes + the QA test summary contributes 4 additional refinements (Probes 7-10). The lead drives the Chrome DevTools MCP smoke AFTER code review per the epic-cycle policy. Plan exists, evidence collection deferred to the lead's smoke stage. PASS.

7. **Pointer-capture race (AC3):**
   `v-timeline-scrubber.ts:971` — uses `attachPointerHandlers(track, {...})` primitive (the canonical pattern that handles setPointerCapture/releasePointerCapture against the DOM element receiving pointerdown). `handleDetailTransition` (lines 626-687) writes attributes + `requestUpdate()` only — no pointer-capture calls on the sibling scrubber. QA Priority 3 (3 tests, qa.test.ts:309-417) validates this. PASS.

8. **Dual-scrubber URLSync throttle sharing (AC4):**
   `web/src/boot/first-paint.ts:184, 202, 224` — both `scrubber.urlSync = urlSync` and `detailScrubber.urlSync = urlSync` resolve to the same instance. QA Priority 4 (qa.test.ts:491-497) directly asserts `mission.urlSync === detail.urlSync`. The throttle is per-URLSync-instance, so sharing the instance means single coalesce. PASS.

9. **aria-hidden synchronicity (AC2):**
   `v-timeline-scrubber.ts:679-685` — `setAttribute('data-open', '')` and `setAttribute('aria-hidden', 'false')` happen in the same synchronous block of `handleDetailTransition`. `connectedCallback` (lines 555-560) seeds the attribute BEFORE first render. QA Priority 5 (3 tests, qa.test.ts:504-565) asserts both flips happen synchronously (no `await` between director.update and the assertion). PASS.

### Edge case sweep observations (NOT defects, recorded for context)

- **Reverse-scrub `passed → exiting → held` synchronous walk** — when the user reverse-scrubs from past-V1J back into the V1J held window, ChapterDirector's `transitionChapter` (chapter-director.ts:179-195) walks the substate chain step-by-step IN A SINGLE `update()` CALL, firing each event synchronously. The detail variant's subscriber sees `to: 'exiting'` (sets `detailOpen = false`) immediately followed by `to: 'held'` (sets `detailOpen = true`) — final attribute write is `aria-hidden = 'false'`. No visible flicker because both writes occur before Lit's microtask flush. QA Priority 2 reverse-open test (qa.test.ts:231-247) validates.

- **`onKeyDown` factory rebuild every keystroke** — the handler factory is rebuilt on every keystroke (lines 835-844) even for the mission variant whose steps are constants. This is intentional per the docstring (lines 818-824): the construction cost is trivial (one closure allocation), and the uniform code path avoids a branch on variant inside the keystroke handler. NOT a defect.

- **Detail-variant range preserved across close** — on reverse close (`held → entering`, line 660-666), the handler sets `detailOpen = false` but DOES NOT reset `activeDetailChapter` / `rangeStart` / `rangeEnd`. This is intentional (comment lines 668-669) so the slide-out animation doesn't reflow the date-range labels to the default mission window mid-transition. NOT a defect.

### Test baseline preservation (AC9)

- Web vitest: Story 4.4 surface (5 files, 206 tests) all pass on re-run during code review.
- Typecheck: clean (re-verified).
- Lint baseline: 4 warnings, 0 errors (per QA summary; not re-run during review since no code changes were made).
