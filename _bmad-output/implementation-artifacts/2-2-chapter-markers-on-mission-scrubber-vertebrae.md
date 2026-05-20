# Story 2.2: Chapter Markers on Mission Scrubber (Vertebrae)

**Epic:** 2 — Mission Spine
**Status:** done
**Date created:** 2026-05-20
**Source:** `_bmad-output/planning-artifacts/epics.md` § "Story 2.2" (lines 952–988) + `voyager-skill-rules.md` Rules 2, 3

## User Story

As a visitor,
I want to see all 11 chapters as discrete labeled pins along the timeline so that I can perceive the mission's beats at a glance and jump to any of them with one gesture,
So that the timeline-as-spine commitment is visually reinforced and FR4 (partial), FR5, UX-DR34 are operational.

## Consumes

- **Story 2.1 ChapterDirector + ALL_CHAPTERS** — scrubber reads `ALL_CHAPTERS` to place markers and subscribes to ChapterDirector state transitions to update the active-marker treatment.
- **Story 1.9 `<v-timeline-scrubber variant="mission">`** — host component being extended.
- **Story 1.10 ClockManager** — already wired to scrubber; chapter-jump activates `clockManager.scrubTo(et)`.

## Acceptance Criteria

### AC1 — 11 markers rendered along the track

- **GIVEN** `<v-timeline-scrubber variant="mission">` with `ALL_CHAPTERS` from Story 2.1
- **WHEN** the scrubber renders
- **THEN** 11 chapter markers are drawn as 2px-wide × 18px-tall vertical pins positioned along the track at horizontal positions corresponding to each chapter's `anchorEt`
- **AND** the inactive marker uses `--v-color-fg-muted`
- **AND** the marker corresponding to the active chapter (ChapterDirector `held` state) uses `--v-color-accent`
- **AND** each marker has a 2–4 character monospace label above it (V1L, V2L, V1J, V2J, V1S, V2S, V2U, V2N, PBD, V1H, V2H per the spec's `markerLabel` field) in `--v-color-fg-muted` at `--v-size-hud-mono-sm` with `text-transform: uppercase`

### AC2 — Markers are individually keyboard-focusable buttons

- **GIVEN** the markers are in the DOM
- **WHEN** I tab through the document
- **THEN** each marker is individually keyboard-focusable in chronological DOM order
- **AND** each marker has `role="button"` (or wraps a native `<button>`) with `aria-label="<full-chapter-name> — <ISO-8601-anchor-date>"`
- **AND** focused marker renders the global `:focus-visible` ring from Story 1.7 design tokens

### AC3 — Hover tooltip + touchscreen alternative

- **GIVEN** I hover a marker with a pointer
- **WHEN** the hover dwell exceeds 200ms
- **THEN** a quiet tooltip appears showing the full chapter name (e.g., "V2 Neptune") in `--v-color-accent`
- **AND** the tooltip disappears immediately on hover-out
- **AND** on touchscreen (no hover capability per `(hover: hover)` media query — Tier 2 strategy from UX-DR22), marker labels above the pins are always visible (the hover tooltip is suppressed there)

### AC4 — Activation jumps the simulation

- **GIVEN** a marker is activated by pointer click or `Enter` key
- **WHEN** the activation fires
- **THEN** the simulation jumps paused to the chapter's `anchorEt` via `clockManager.scrubTo(anchorEt)`
- **AND** the scrubber emits a CustomEvent `chapter-jump` with `detail = { slug: <chapter-slug>, anchorEt: <et> }` (Story 2.4 will subscribe to this from the URL router)
- **AND** the activated marker becomes the active marker (visually `--v-color-accent`) once ChapterDirector transitions to `held` for that chapter

### AC5 — Active marker tracks ChapterDirector state

- **GIVEN** I am scrubbing the mission timeline
- **WHEN** the current ET crosses a chapter window boundary
- **THEN** the corresponding marker becomes the active marker (`--v-color-accent`) and the previously-active marker reverts to inactive
- **AND** at most one marker is active at any time (the ChapterDirector `held` state guarantees this)
- **AND** if no chapter is currently active (between-chapter ET), no marker has the accent treatment

### AC6 — Test suites green, no regressions

- **GIVEN** all AC1–AC5 changes are merged
- **WHEN** the test suite is exercised
- **THEN** `cd web && npm test -- --run` passes (no failed tests; baseline 1363 pass + new tests)
- **AND** typecheck passes, lint passes (5 pre-existing warnings OK)

## Integration ACs (per voyager-skill-rules.md Rule 2 — consumer side)

### Integration AC7 — Scrubber consumes real ChapterDirector + real ALL_CHAPTERS

- **GIVEN** the dev server is running and Voyager is loaded
- **AND** the scrubber is mounted with a real ChapterDirector (constructed with real ALL_CHAPTERS) and real ClockManager
- **WHEN** the lead-side Chrome DevTools MCP smoke navigates to the app
- **THEN** all 11 chapter markers are visible in the DOM at the correct horizontal positions corresponding to their `anchorEt`s (verify via `evaluate_script` reading marker positions)
- **AND** at boot the marker corresponding to `launch-v2` (active at MISSION_START_ET) has the `--v-color-accent` treatment (visible in the DOM via class assertion or computed style)
- **AND** clicking a different marker (e.g., V1 Jupiter) shifts the active-marker treatment to that marker and the HUD date updates accordingly

## Files to Modify

| File | Action | Reason |
|---|---|---|
| `web/src/components/v-timeline-scrubber.ts` | UPDATE | AC1–AC5: render markers, wire ChapterDirector, hover tooltip, click handlers, CustomEvent emit |
| `web/src/components/v-timeline-scrubber.test.ts` | UPDATE | New tests for marker rendering, ARIA, click activation, ChapterDirector subscription |
| `web/src/main.ts` | UPDATE (small) | Pass ChapterDirector reference to the scrubber via property binding or constructor arg (whichever follows Epic 1 conventions) |

## Tasks / Subtasks

- [x] **T1 (AC1, AC2): Marker rendering**
  - [x] Add `chapterDirector` property to `<v-timeline-scrubber>` (consumer surface)
  - [x] In `render()`, when variant === 'mission', render 11 `<button>` markers (one per spec in ALL_CHAPTERS) positioned via CSS percentage based on `(anchorEt - MISSION_START_ET) / (MISSION_END_ET - MISSION_START_ET)`
  - [x] Apply `--v-color-fg-muted` to inactive markers; `--v-color-accent` to the active marker (determined by ChapterDirector activeChapter)
  - [x] Each marker has `aria-label="<chapter.name> — <ISO date>"` and native `<button>` semantics (role="button" implicit)
  - [x] Labels above the markers use markerLabel field, --v-size-hud-mono-sm, uppercase

- [x] **T2 (AC3): Hover tooltip + touchscreen handling**
  - [x] Add tooltip element appearing on `:hover` after 200ms (CSS transition-delay)
  - [x] Apply `@media (hover: hover)` for the tooltip; on no-hover devices the persistent label above the marker disambiguates (tooltip hidden via `display: none`)
  - [x] Tooltip shows full chapter name in `--v-color-accent`

- [x] **T3 (AC4): Click / Enter activation**
  - [x] On marker click or Enter/Space key, call `clockManager.scrubTo(anchorEt)` (pauses + sets simTimeEt)
  - [x] Emit `chapter-jump` CustomEvent with `{ slug, anchorEt }` detail
  - [x] Focus ring (`:focus-visible`) applies via `box-shadow: 0 0 0 2px var(--v-color-focus)` (Story 1.7 token)

- [x] **T4 (AC5): ChapterDirector subscription**
  - [x] In `connectedCallback`, subscribe to ChapterDirector state transitions
  - [x] On transition, requestUpdate() to re-render with new activeChapter
  - [x] Cleanup subscription in `disconnectedCallback`

- [x] **T5 (AC6): Verification**
  - [x] Updated `v-timeline-scrubber.test.ts` with 27 new tests across 6 describe blocks (AC1 × 6, AC2 × 3, AC3 × 5, AC4 × 6, AC5 × 4, CSS surface × 3) — all 76 scrubber tests pass
  - [x] Full web suite green: 1390 tests pass (1363 baseline + 27 new), typecheck clean, lint matches baseline (5 pre-existing warnings, 0 new)

## Dev Notes

### Architecture / Conventions

- Mirror Story 1.10's ClockManager subscriber pattern: `unsub = chapterDirector.subscribe(handler); ... unsub()`.
- Use property binding from main.ts (`scrubber.chapterDirector = director`) — Lit reactive property pattern (no decorators per the project's no-decorator Lit 3 setup).
- ARIA: do NOT collide with the slider's `role="slider"` on the thumb container. The markers are separate buttons inside the scrubber's shadow DOM. Test that tab order is sensible (slider thumb + 11 markers).
- The scrubber's current shadow CSS defines `--v-color-fg-muted` and `--v-color-accent` via the design-token system from Story 1.7.

### Previous Story Intelligence (Story 2.1)

- ChapterDirector is at `web/src/services/chapter-director.ts`. Constructor takes `ALL_CHAPTERS` (already wired in main.ts). `activeChapter` is a sync getter. `subscribe(cb)` returns unsub function.
- ALL_CHAPTERS is at `web/src/chapters/registry.ts`. Frozen ordered array of 11 specs.
- Slug naming per ADR-0001: `launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`.

### Testing standards

- Unit tests: `web/src/components/v-timeline-scrubber.test.ts` (component already has tests; extend them).
- Defense tests follow `*-defense.test.ts` if needed.
- For Integration AC7, the lead executes Chrome DevTools MCP smoke; no Vitest counterpart needed beyond a static DOM-shape test.

### NFR considerations

- Performance: 11 markers + 11 tooltips is trivial DOM. Per-frame work is unchanged (ChapterDirector subscription only fires on state transitions, not per-frame).
- A11y: keyboard focus order matters; test that tabbing reaches the markers in chronological order.

## References

- Story 2.1 spec + smoke evidence
- `web/src/components/v-timeline-scrubber.ts` (host component)
- `web/src/services/chapter-director.ts` + `web/src/chapters/registry.ts`
- `docs/adr/0001-url-contract-as-public-api.md` (slug contract)
- `docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md` (smoke driver)
- `_bmad/custom/voyager-skill-rules.md` Rules 2, 3

## Dev Agent Record

### Completion Notes (dev-2-2 / epic-cycle-2026-05-20)

**Implementation summary.** All 5 in-story tasks (T1–T5) implemented. Integration AC7 is the lead-executed Chrome DevTools MCP smoke gate (per voyager-skill-rules Rule 3); the consumer wire-up is complete and the DEV debug surface (`window.__voyagerDebug.scrubber`) is published from `main.ts` for the lead to inspect.

**Implementation approach.**

1. **Marker rendering (T1, AC1+AC2).** Extended `<v-timeline-scrubber>`'s render() to map `ALL_CHAPTERS` to native `<button>` markers in the existing `.chapters` slot when `variant === 'mission'`. Native `<button>` was chosen over a wrapped div with `role="button"` because it gives keyboard activation (Enter/Space), `:focus-visible`, and tab-order semantics for free — per ADR-0025 (first-party WAI-ARIA APG patterns, prefer native elements). The slot already had `pointer-events: none`; each marker re-enables it with `pointer-events: auto` so the underlying track click-to-jump still works between markers. Markers position via `left: X%` where X is `(anchorEt - MISSION_START_ET) / (MISSION_END_ET - MISSION_START_ET) * 100`. The active-marker treatment is keyed off a `data-active` boolean attribute (CSS attribute selector `[data-active]`) — this surface is also what the lead's MCP smoke reads via `evaluate_script` for AC7.

2. **Hover tooltip + Tier-2 fallback (T2, AC3).** Pure CSS — a `.chapter-marker-tooltip` child with `opacity: 0` transitions to `opacity: 1` on `:hover` / `:focus-visible` with a `transition-delay: 200ms`. Inside `@media (hover: hover)` the dwell applies; inside `@media (hover: none)` the tooltip is `display: none` and the persistent `.chapter-marker-label` (always rendered above the pin) carries the per-marker disambiguation that UX-DR22 Tier-2 requires.

3. **Click + Enter/Space activation (T3, AC4).** `activateChapter(chapter)` calls `clockManager.scrubTo(anchorEt)` (which pauses the clock as a side effect, identical to keyboard/pointer scrubbing) and emits a bubbling+composed `chapter-jump` CustomEvent with `{ slug, anchorEt }`. Story 2.4's URL router will subscribe to this event. The marker's `pointerdown` handler calls `stopPropagation()` so the track's `attachPointerHandlers` listener never sees the press — without this guard, pressing a marker would also dispatch a scrub-from-click on the track, racing the chapter jump.

4. **ChapterDirector subscription (T4, AC5).** Mirrors the Story 1.10 ClockManager subscriber pattern exactly — `chapterUnsub` is allocated in `connectedCallback`, the `onChapterChange` handler calls `requestUpdate()` (not per-frame; only on state transitions per ChapterDirector's contract), and cleanup happens in `disconnectedCallback`. The subscription is set up only when `chapterDirector !== null` so Story 1.9 tests that don't wire a director are unaffected.

5. **First-paint wire-up (consumer-side integration).** Extended `FirstPaintOptions` with an optional `chapterDirector` field. When supplied, `startFirstPaint` sets `scrubber.chapterDirector = options.chapterDirector` *before* `appendChild`, so the scrubber's `connectedCallback` sees the director and wires its subscription on the same tick the element mounts. This is the canonical Lit-3 pattern for "pre-mount property binding" (no decorators per ADR-0013). `main.ts` passes the shared `chapterDirector` created at line 94 alongside the existing `clockManager`. Same instance, same RAF pump.

6. **DEV debug surface.** `main.ts` now also exposes `window.__voyagerDebug.scrubber` (DEV-only, stripped from production by Vite's `import.meta.env.DEV` constant folding) so the lead's Chrome DevTools MCP smoke can read marker positions and active-marker class state via `evaluate_script`. Mirrors the Story 2.1 pattern.

**Design decisions worth noting.**

- *Markers always render in mission variant, even without a wired ChapterDirector.* The spec says "11 chapter markers are drawn" (AC1), and the inactive treatment is the default — no director simply means no active marker, which is the same observable state as the between-chapter ET case (AC5). This avoids a chicken-and-egg with tests / variants that mount the scrubber for layout-only purposes.
- *Active-marker assertion via `data-active` attribute.* Tests assert `marker.hasAttribute('data-active')` rather than computed style. Computed style requires the `@media (hover: hover)` mocks happy-dom doesn't ship with; the attribute is the same surface the CSS selector reads, so testing it is functionally equivalent and far more robust.
- *Marker `<button>` is a native element, so `role="button"` is implicit.* AC2 says "role='button' (or wraps a native `<button>`)" — we use the native button to inherit Enter+Space activation and the global `:focus-visible` from Story 1.7 tokens without re-implementing them. The aria-label still gives the screen reader the `"<chapter-name> — <ISO-8601-date>"` string. Tests verify `marker.tagName === 'BUTTON'` rather than the role attribute.
- *Pointer-event interception is handled at the marker boundary.* Stopping `pointerdown` propagation at the marker is cleaner than adding "is the target a marker?" branching to the track's `onDown` callback in `attachPointerHandlers` — keeps the track's input contract identical to Story 1.9.
- *No-clockManager fallback path for marker activation.* If a future variant or test constructs the scrubber without a wired clock, marker activation still moves the `simEt` fallback (same shape as the existing `set simEt(value)` fallback path). This isn't called from the live app today, but it keeps the surface symmetric with the rest of the scrubber's clock-optional design.

**Test coverage (27 new tests).**

| Describe | Coverage |
|---|---|
| Story 2.2 AC1 — 11 markers rendered along the track | 6 tests: count, chronological order, per-marker percentage position, label text, active-marker data-attribute, between-chapter ⇒ no active |
| Story 2.2 AC2 — Markers are individually keyboard-focusable buttons | 3 tests: native `<button>` element, aria-label format, DOM order matches anchor order |
| Story 2.2 AC3 — Hover tooltip + touchscreen alternative | 5 tests: tooltip child contains chapter name, CSS 200ms dwell delay, accent color, no-hover hides tooltip, marker label always present (Tier-2) |
| Story 2.2 AC4 — Click / Enter activation | 6 tests: click → scrubTo + pause, chapter-jump CustomEvent payload, Enter, Space, pointerdown does NOT bubble as scrub, fallback path without clock |
| Story 2.2 AC5 — Active marker tracks ChapterDirector state | 4 tests: subscribe/unsub on connect/disconnect, crossing flips active, at-most-one across all 11 anchors, reverse scrubbing |
| Story 2.2 — focus ring + CSS surface | 3 tests: focus-visible box-shadow token, color tokens for active/inactive, marker dimensions (2px × 18px) |

Baseline: 1363 pass. Post-implementation: 1390 pass (+27). Typecheck clean. Lint matches baseline (5 pre-existing warnings, 0 new).

### File List

- `web/src/components/v-timeline-scrubber.ts` (MODIFIED)
- `web/src/components/v-timeline-scrubber.test.ts` (MODIFIED — 27 new tests + 1 stub-test updated to reflect Story 2.2 contract)
- `web/src/main.ts` (MODIFIED — pass `chapterDirector` to `startFirstPaint`, expose DEV debug surface)
- `web/src/boot/first-paint.ts` (MODIFIED — extend `FirstPaintOptions` with optional `chapterDirector`, set on scrubber before append)

### Change Log

- 2026-05-20 — Implemented Story 2.2 (Chapter Markers on Mission Scrubber). 27 new tests; web vitest 1390 pass; typecheck clean; lint baseline preserved.
- 2026-05-20 — Code review (cr-2-2): APPROVE_WITH_CHANGES_RESOLVED. 1 MEDIUM auto-resolved, 2 LOW deferred to `_bmad-output/implementation-artifacts/deferred-work.md`. Verified web vitest 1411 pass, typecheck clean, lint baseline (5 pre-existing warnings) preserved.

### Review Findings (cr-2-2, 2026-05-20)

- [x] [Review][Patch] Removed redundant `title=${chapter.name}` attribute on the marker `<button>` — produced a native OS tooltip overlapping the curated 200ms `--v-color-accent` styled tooltip, violating AC3 ("a quiet tooltip … in `--v-color-accent`") with a competing default-style channel. [v-timeline-scrubber.ts:736] — RESOLVED in-cycle.
- [x] [Review][Defer] `renderChapterMarker` allocates fresh per-marker closures (`onMarkerClick(chapter)`, `onMarkerKeyDown(chapter)`) on every render — 22 listener rebinds per re-render. Not a correctness defect; deferred. [v-timeline-scrubber.ts:559,581] — deferred, pre-existing pattern.
- [x] [Review][Defer] `connectedCallback` subscribes only if `chapterDirector !== null` at mount; post-mount reassignment is silently missed. Current sole producer (first-paint.ts) honours pre-mount binding; QA static-source test pins this. [v-timeline-scrubber.ts:374] — deferred, no in-tree violation.

**ADR compliance summary:** ADR-0001 (frozen slugs flow from registry → CustomEvent payload, verified by registry-resolves-every-payload-slug test); ADR-0013 (zero `@property` / `@customElement` decorators in new code, uses `static properties` + `declare` pattern); ADR-0025 (native `<button>` with implicit role=button, Enter/Space activation via APG keyboard handler, `:focus-visible` via box-shadow token); ADR-0026 (zero `any` types in new code, typecheck clean).

**Verification baseline at review close:** web vitest 1411 pass; typecheck 0 errors; lint 0 errors + 5 pre-existing warnings (unchanged baseline, none in Story 2.2 files).

**Status post-review:** All HIGH + MEDIUM findings resolved in-cycle. The lead-executed Chrome DevTools MCP smoke (Integration AC7) per voyager-skill-rules Rule 7 remains the binding browser-evidence gate — code-side prerequisites (DEV `__voyagerDebug.scrubber` surface, pre-mount director binding, marker DOM contract) are in place and verified by QA's behavioural + static-source tests. → marking story `done`.
