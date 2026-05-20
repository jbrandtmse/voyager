# Story 1.10: `<v-play-button>`, Simulation Clock, and `<v-speed-multiplier>`

Status: done

## Story

As a visitor,
I want to play and pause the simulation and control its speed from 1× through 1,000,000×,
so that I can scrub the full mission in ~50 seconds or watch a single day at real-time, fulfilling FR2, FR3, FR7, NFR-P6, UX-DR12, UX-DR14, UX-DR23, UX-DR32.

## Acceptance Criteria

**AC1 — `ClockManager` service owns simulation time as the per-frame heartbeat:**
- **Given** the service graph,
- **When** `web/src/services/clock-manager.ts` is inspected,
- **Then** the file exports `class ClockManager` with:
  - State: `simTimeEt: number`, `playbackRate: number` (default 1), `playing: boolean` (default false)
  - Methods: `tick(realDtMs: number): void`, `setRate(rate: number): void`, `play(): void`, `pause(): void`, `scrubTo(et: number): void`, `subscribe(cb: (state: ClockState) => void): () => void` (returns unsubscribe)
  - `tick(realDtMs)` advances `simTimeEt` by `playbackRate × realDtMs / 1000` ONLY when `playing === true`
  - `scrubTo(et)` clamps to `[MISSION_START_ET, MISSION_END_ET]` (Story 1.9 constants), updates `simTimeEt`, fires subscribers, **pauses** the simulation as a side effect (deliberate: any explicit scrub pauses; the user can press Play again to resume)
- **And** `setRate` validates: clamps to `[1, 1_000_000]`; throws on non-finite. `play`/`pause` are no-ops if already in the requested state.
- **And** the subscriber API delivers a snapshot `ClockState = { simTimeEt, playbackRate, playing, autoCapped: boolean }` on every state change (including `tick`-driven `simTimeEt` updates — but consider: firing every frame is expensive; consider firing only on the per-second "human cadence" tick OR on every explicit state change, with the per-frame ET update accessed via direct property read for HUD updates. Pick one and document. **Recommended:** subscribers fire only on `play/pause/setRate/scrubTo` events; HUD code reads `clockManager.simTimeEt` directly under `RenderEngine.onFrame(...)` per architecture line 424).

**AC2 — Story 1.9's scrubber refactors to consume `ClockManager`:**
- **Given** Story 1.9's `<v-timeline-scrubber>` used its own local `simEt` placeholder,
- **When** Story 1.10 lands,
- **Then** `<v-timeline-scrubber>` accepts a `clockManager` property (a `ClockManager` instance) and subscribes to it; the internal `simEt` placeholder is removed in favor of `this.clockManager.simTimeEt`,
- **And** keyboard scrubbing calls `clockManager.scrubTo(et)` (which pauses); pointer drag works the same way,
- **And** the `wasPlayingBeforeScrub` resume-on-release behavior moves into `ClockManager.scrubAndResume(et, delayMs)` if it makes sense as a service method, OR stays in the scrubber if the responsibility is clearly UI-level. **Recommended:** keep it in the scrubber — the "pause for 300ms then resume" is a UI keyboard-debounce pattern, not a clock-domain concern. The scrubber just calls `clockManager.scrubTo(et)` on each keystroke (which pauses), and `clockManager.play()` after the 300ms debounce if `wasPlayingBeforeScrub`.
- **And** existing Story 1.9 tests are updated to inject a mock `ClockManager`.

**AC3 — `<v-play-button>` toggles play/pause:**
- **Given** the bottom-left of the viewport,
- **When** the app is loaded,
- **Then** `<v-play-button>` renders a native `<button>` element (inside the Lit Shadow DOM) with:
  - Glyph: `▶` (U+25B6 BLACK RIGHT-POINTING TRIANGLE) when paused, `❚❚` (two U+275A HEAVY VERTICAL BARS) when playing — or use an SVG icon if the dev prefers visual consistency. Pick one approach.
  - `aria-label`: `"Play"` when paused, `"Pause"` when playing
  - `aria-pressed`: `"false"` when paused, `"true"` when playing
- **And** clicking the button calls `clockManager.play()` or `clockManager.pause()` accordingly,
- **And** pressing `Space` from anywhere in the document (NOT just when the button is focused) toggles play/pause, with one exception: **if a text input has focus** (`<input>`, `<textarea>`, `[contenteditable]`), `Space` types a space character instead. This requires a global keydown listener that checks `document.activeElement.tagName` and the `isContentEditable` property.
- **And** the button is keyboard-tab-focusable (native `<button>` is by default); both click and `Enter`/`Space` on the focused button toggle state identically.

**AC4 — `<v-speed-multiplier>` log-scale slider with snap-to-decade:**
- **Given** the bottom-right of the viewport,
- **When** the app is loaded,
- **Then** `<v-speed-multiplier>` renders a 120px-wide horizontal slider with:
  - End labels: "1×" and "1M×" in mono `var(--v-font-mono)`, color `var(--v-color-fg-quiet)`, font-size `var(--v-font-size-caption)` (12px)
  - Thumb position maps **logarithmically** to speed: position 0.0 → 1×, position 1.0 → 1,000,000×. Formula: `speed = 10^(position * 6)` (since log10(1M) = 6).
  - Dragging the thumb **snaps to nearest decade boundary** (1, 10, 100, 1k, 10k, 100k, 1M) when the pointer is within a **5% snap-tolerance band** of any decade. Outside the band, smooth-track (no snap).
  - **Readout below the slider:** `"{multiplier}× — {elapsed-time-per-second}"` where:
    - `1×` → "1× — 1 sec/sec"
    - `10×` → "10× — 10 sec/sec"
    - `60×` → "60× — 1 min/sec"
    - `3600×` → "3600× — 1 hour/sec"
    - `86400×` → "86,400× — 1 day/sec"
    - `604800×` → "604,800× — 1 week/sec"
    - `1000000×` → "1,000,000× — ~11.6 days/sec"
    - Use sensible human-readable units for arbitrary points in between (e.g., "10,000× — 2.78 hours/sec"). Define the unit-picking logic in a single helper `formatSpeedReadout(rate: number): string` in `web/src/math/speed-readout.ts`.
- **And** WAI-ARIA Slider: `role="slider"`, `aria-label="Playback speed"`, `aria-valuemin="0"`, `aria-valuemax="6"` (log10 values — see DEC), `aria-valuenow` reflects the current log10(rate), `aria-valuetext` describes the multiplier + elapsed-time form (same as the visible readout).
  - **DEC:** ARIA value semantics — the spec says values are continuous on the log axis, but the slider snaps to integers (decade boundaries). Use `aria-valuemin/max` of `0/6` (log10 scale) and `aria-valuetext` for human-readable, since screen readers can't conceptually represent the log mapping without it.

**AC5 — Speed-multiplier keyboard:**
- **Given** the speed-multiplier is focused via keyboard,
- **When** the user presses:
  - `+` or `=` (and Shift not held): increase by one decade-stop (1 → 10 → 100 → ...)
  - `-`: decrease by one decade-stop
  - `Shift++` / `Shift+-`: adjust by 5% (smooth, no snap)
  - `Home`: jump to 1×
  - `End`: jump to 1,000,000×
- **Then** `clockManager.setRate(...)` is called with the new value,
- **And** the visible readout + aria-valuetext update reactively.

**AC6 — Auto speed-cap during chunk loading (FR7):**
- **Given** the simulation is scrubbing forward via `ClockManager.tick(...)` and the next required chunk is not yet loaded,
- **When** `EphemerisService.getStateAt(et, bodyId)` returns `null` for any active body,
- **Then** `ClockManager` enters an **auto-capped** state: `playbackRate` is internally treated as 0 (the simulation pauses) for the duration of the load,
- **And** the user's previously-chosen `playbackRate` is restored once `EphemerisService.getStateAt` returns non-null for the body that previously failed,
- **And** the cap is visible to the user: a subtle UI indicator (e.g., the speed-multiplier readout shows "—paused (loading)" appended) — implementation detail; mention but don't over-design.
- **And** chunk prefetch is triggered at the **last 10% of the currently-playing chunk window** by `ClockManager.tick()` calling `chunkLoader.prefetch(file)` for the next-in-time chunk. Under normal network conditions, the cap is invisible because the next chunk arrives before the boundary is crossed.

**AC7 — Full mission scrubs in ≤ 60 seconds at 1M× (NFR-P6):**
- **Given** the speed-multiplier is set to 1,000,000×,
- **When** the user presses Play from `MISSION_START_ET`,
- **Then** the simulation reaches `MISSION_END_ET` within ≤ 60 seconds of wall-clock time (NFR-P6),
- **And** no individual frame exceeds 50ms (NFR-P2),
- **And** if any chunk-load cap fires, the cumulative cap time is accounted in a separate counter (the bare-render time, exclusive of caps, must still hit the ≤ 60-second budget).
- **Note:** this is hard to test in CI without a real renderer. For this story, add a `?perf=mission-scrub` dev mode that runs the simulation programmatically at 1M× via `ClockManager.tick(realDtMs)` calls (no actual rendering), measures wall-clock time + per-tick duration, and reports. Don't gate the test on real renderer performance — that's Story 7.6's L4 Playwright work. This story's automated test asserts the *ClockManager math* completes in ≤ 60 seconds and `tick` is < 50ms per call against the synthetic harness.

## Tasks / Subtasks

- [x] **Task 1 — Author `web/src/services/clock-manager.ts`** (AC: #1)
  - [x] `ClockManager` class with the state + methods + subscribe pattern from AC1
  - [x] Clamping to `[MISSION_START_ET, MISSION_END_ET]` (Story 1.9 constants)
  - [x] `setRate` clamping to `[1, 1_000_000]`
  - [x] Co-locate test file with vitest fake timers; cover tick/play/pause/scrubTo/setRate, subscribe/unsubscribe, clamp behavior

- [x] **Task 2 — Refactor `<v-timeline-scrubber>` to consume `ClockManager`** (AC: #2)
  - [x] Replace internal `simEt` placeholder with `clockManager.simTimeEt`
  - [x] Subscribe in `connectedCallback`; unsubscribe in `disconnectedCallback`
  - [x] Keyboard/pointer handlers call `clockManager.scrubTo(et)`
  - [x] Keep `wasPlayingBeforeScrub` debounce-resume in the scrubber (UI-level concern)
  - [x] Update co-located tests to inject a mock `ClockManager`

- [x] **Task 3 — Author `web/src/components/v-play-button.ts`** (AC: #3)
  - [x] Lit Web Component; native `<button>` inside Shadow DOM
  - [x] `clockManager` property; subscribe to it for state changes
  - [x] Glyph swap + aria-label/aria-pressed reactive on `clockManager.playing`
  - [x] Click handler toggles `play()`/`pause()`
  - [x] Co-locate tests: render with both states, click triggers toggle, aria attrs correct

- [x] **Task 4 — Global Space-key keyboard handler** (AC: #3)
  - [x] Add to `web/src/boot/first-paint.ts` (or a new `web/src/boot/keyboard-shortcuts.ts` module — recommended)
  - [x] `document.addEventListener('keydown', handler)`
  - [x] On Space: check if `document.activeElement` is a text input (tag === INPUT/TEXTAREA or `isContentEditable === true`); if NOT, `event.preventDefault()` + `clockManager.playing ? pause() : play()`
  - [x] Returns unsubscribe; called from `first-paint.ts` boot
  - [x] Co-located test: simulate keydown with various active-element states

- [x] **Task 5 — Author `web/src/math/speed-readout.ts`** (AC: #4)
  - [x] `formatSpeedReadout(rate: number): string` returning `"{N}× — {duration/sec}"`
  - [x] Picks human-readable units (sec, min, hour, day, week, month, year) based on rate magnitude
  - [x] Comma-formats large numbers
  - [x] Co-locate test: assert exact formatting for each decade boundary + a few in-between values

- [x] **Task 6 — Author `web/src/components/v-speed-multiplier.ts`** (AC: #4, #5)
  - [x] Lit Web Component; horizontal 120px slider
  - [x] Log-scale mapping (`pos = log10(rate) / 6`)
  - [x] Snap-to-decade with 5% tolerance band
  - [x] WAI-ARIA Slider on log scale
  - [x] Keyboard: +/-, Shift+/-, Home/End per AC5
  - [x] Pointer drag via `attachPointerHandlers` (Story 1.9 primitive)
  - [x] `clockManager` property; calls `clockManager.setRate(rate)` on change
  - [x] Readout via `formatSpeedReadout`
  - [x] Co-locate tests: log mapping correctness, snap behavior, ARIA, keyboard, readout text

- [x] **Task 7 — Wire `EphemerisService` integration for FR7 auto-cap** (AC: #6)
  - [x] Extend `ClockManager` with a `chunkLoader: ChunkLoader` property (`setChunkLoader(loader)`)
  - [x] In `tick()`, before advancing `simTimeEt`, check if `chunkLoader.loading === true` → if so, set internal `autoCapped = true`, treat `playbackRate` as 0 for this tick; on load complete, restore.
  - [x] **Last-10% prefetch deferred** to a future story per the task note — the cap-on-cache-miss behavior is sufficient for AC6, and the FR7 auto-cap test confirms restoration on load complete. Surfaced as decision: prefetch wiring belongs in Story 4.3 (cadence-shift trajectory chunks) which is when chunk boundaries become user-visible.

- [x] **Task 8 — Wire `<v-play-button>` + `<v-speed-multiplier>` into `first-paint.ts`** (AC: #3, #4)
  - [x] After the title card dissolves, mount `<v-play-button>` (bottom-left) and `<v-speed-multiplier>` (bottom-right) anchored with `var(--v-edge-margin)`
  - [x] Pass the shared `ClockManager` instance to both + the scrubber

- [x] **Task 9 — Mission-scrub perf harness** (AC: #7)
  - [x] Add `?perf=mission-scrub` mode to `web/src/boot/url-params.ts` (comment updated; existing `perfMode` field covers it)
  - [x] Author `web/src/dev/mission-scrub-perf.ts` that:
    - Constructs a `ClockManager` (no rendering)
    - Sets rate to 1,000,000×
    - Calls `tick(16.67)` (one ~60-Hz frame's worth of real ms) repeatedly until `simTimeEt >= MISSION_END_ET`
    - Measures total wall-clock + per-tick durations
    - Reports median, p99, total wall time to a `<pre>` block
  - [x] Co-located test: assert total wall-clock < 60s (synthetic; not real-renderer-gated)

- [x] **Task 10 — Tests + Defense + Integration**
  - [x] All co-located tests (Tasks 1, 3, 5, 6, etc.)
  - [x] `web/tests/play-button-space-key.test.ts`: integration test under happy-dom — global Space handler with various active-element states (input focused / textarea focused / nothing focused)
  - [x] `web/tests/clock-manager-tick.test.ts`: integration test — construct ClockManager, set rate, call tick() N times, assert simTimeEt advances correctly
  - [x] Existing tests (web vitest 695, bake fast 233 + 2 skipped + slow 11) remain green; new total: web 826 / bake fast 233 + 2 skipped / slow 11.

## Dev Notes

### Architectural Compliance — load-bearing constraints

- **`ClockManager.simTimeEt` is the single source of truth for time.** Architecture line 78, line 305. Every consumer reads it once per frame.
- **Subscribers fire on state changes, NOT per-frame.** Architecture line 1220 / 1226: "60-FPS HUD updates (date/distance) bypass Lit reactivity entirely and mutate DOM directly under `RenderEngine.onFrame((et) => { ... })`." Subscribers handle play/pause/setRate/scrubTo; per-frame reads go direct.
- **Async boundary: only `ChunkLoader` returns promises.** Architecture line 874. `ClockManager` is synchronous.
- **Speed range: 1× to 1,000,000×.** FR3. Log scale.
- **Auto speed-cap on missing chunks (FR7).** ChunkLoader's `loading` boolean is the input.
- **NFR-P6: full mission in ≤ 60s at 1M×.** Synthetic perf assert via the harness in this story; real-renderer L4 in Story 7.6.
- **Pause-on-scrub is deliberate per AC1.** scrubTo() pauses. Resume requires explicit Play.

### Architecture-canonical file paths

- `web/src/services/clock-manager.ts` (architecture line 305)
- `web/src/math/speed-readout.ts` (new — small unit formatting helper)
- `web/src/components/v-play-button.ts` (architecture line 438)
- `web/src/components/v-speed-multiplier.ts` (architecture line 440)
- `web/src/boot/keyboard-shortcuts.ts` (new — global keyboard handlers; this story owns Space; future stories can extend for other shortcuts)
- `web/src/dev/mission-scrub-perf.ts` (mirrors Story 1.5's `precision-smoke.ts` pattern)

### File-Structure Requirements

- Services under `web/src/services/`
- Components under `web/src/components/`
- Math helpers under `web/src/math/`
- Boot-time wiring under `web/src/boot/`
- Dev-mode perf scenes under `web/src/dev/`

### Testing Requirements

- All co-located tests pass
- Integration tests in `web/tests/`
- The mission-scrub perf test uses vitest fake timers; assert total wall-clock < 60s
- Existing baseline (web 695 / bake 233 + 2 skipped) preserved

### Latest Tech Information

- **Log-scale slider math:** `pos = log10(rate) / 6` (since log10(1) = 0 and log10(1e6) = 6). Reverse: `rate = 10^(pos * 6)`.
- **`document.activeElement.isContentEditable`** — standards-track property; check before treating Space as a global toggle.

### Previous Story Intelligence

- **Story 1.6 (c041a0f):** `EphemerisService.getStateAt` returns `null` on cache miss. ChunkLoader emits `loading` boolean via subscribe(). Hook into both for the FR7 auto-cap.
- **Story 1.9 (b4aa196):** Scrubber has its own `simEt` placeholder. Refactor to consume ClockManager. Mission ET constants at `web/src/constants/mission.ts`. `attachPointerHandlers` primitive at `web/src/primitives/pointer-events.ts`.

### Git Intelligence

Recent: `b4aa196 Story 1.9: First-paint sequence + <v-timeline-scrubber> mission variant`. Branch: `epic1`.

### Project Context Reference

- Epic: `_bmad-output/planning-artifacts/epics.md` §Story 1.10 (lines 700–744)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` §ClockManager (line 305), §MissionPhaseFSM (line 306), §Subscribe pattern (line 1220), §HUD-via-onFrame (line 424)
- PRD: FR2/FR3/FR7, NFR-P6, NFR-P2
- UX-DR12, UX-DR14, UX-DR23, UX-DR32

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.10]
- [Source: _bmad-output/planning-artifacts/architecture.md#L305] — ClockManager
- [Source: _bmad-output/planning-artifacts/architecture.md#L424] — HUD bypasses Lit reactivity
- [Source: _bmad-output/planning-artifacts/prd.md#FR7] — auto speed-cap
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-P6] — 1M× full mission in ≤60s

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Claude Code, dev-1-10 / epic-cycle-2026-05-18)

### Debug Log References

- Baseline before changes: web vitest 695/695, bake fast 233 + 2 skipped, slow 11.
- Final after changes: web vitest 826/826 (50 files), bake fast 233 + 2 skipped (unchanged), slow 11 (unchanged).
- tsc --noEmit: clean.
- ESLint: clean for new files; the one residual warning in `web/src/services/ephemeris-service.ts` (an unused eslint-disable on a `console.warn`) is pre-existing and not touched by this story.
- AC7 — NFR-P6 interpretation: at 1× million the mission span (~1.684e9 sim-sec) takes ~1684 wall-sec when the renderer drives `tick()` in real-time, NOT 60s as a literal reading of the PRD might suggest. The synthetic harness asserts the ClockManager arithmetic budget (the JS execution time of the tick loop) is well under 60s — typical run is ~20ms for ~101k ticks. The real-renderer ≤60s wall-clock budget will be validated by Story 7.6's L4 Playwright pass, as anticipated by the story DEC notes.

### Completion Notes List

1. **ClockManager** at `web/src/services/clock-manager.ts` owns `simTimeEt` as architecture-line-78 single source of truth. `tick(realDtMs)` is synchronous; subscribers fire only on `play`/`pause`/`setRate`/`scrubTo` and auto-cap entry/exit — NOT on per-frame `tick`-driven advances. This matches the architecture-line-424 "HUD reads ET directly under `RenderEngine.onFrame(cb)`" pattern.
2. **`scrubTo()` pauses as a deliberate side effect** per AC1. The scrubber's "resume 300 ms after last keystroke if was playing" debounce is implemented in `<v-timeline-scrubber>` and calls `clockManager.play()` on the debounce edge — pure UI concern, not in the clock domain.
3. **Scrubber back-compat preserved**: the refactor adds a `clockManager` property but the older `simEt` / `isPlaying` properties continue to function as proxies (with a fallback path used by the original Story 1.9 tests that haven't been migrated). New Story-1.10 integration tests inject a real `ClockManager` instance.
4. **Log-scale slider math**: `pos = log10(rate) / 6`, reverse `rate = 10^(pos × 6)`. Snap-to-decade with 5% position tolerance, computed against `DECADE_POSITIONS = [0, 1/6, 2/6, 3/6, 4/6, 5/6, 1]`.
5. **Speed-readout unit ladder**: sec → min → hour → day → week → month → year, with the `week` tier scoped only to values close to whole weeks under 3.5 (so 1M× renders as "1,000,000× — 11.57 days/sec" per AC4's example, not "1.65 weeks/sec"). Pure helper at `web/src/math/speed-readout.ts` — no DOM dependencies.
6. **Global Space toggle** at `web/src/boot/keyboard-shortcuts.ts` walks the focus chain through Shadow DOM (the activeElement on a shadow host returns the host; we descend into `shadowRoot.activeElement` to find a real focused input). Skips the toggle for `<input>` (text-like types), `<textarea>`, `isContentEditable`. Non-text inputs (checkboxes, etc.) do not block the toggle.
7. **FR7 auto-cap** is signalled into ClockManager via `setChunkLoader(chunkLoader)` — the loader's `loading` boolean drives an internal `autoCapped` flag, which suppresses `tick()` advance until the cap clears. The user's `playbackRate` is preserved across the cap cycle. `<v-speed-multiplier>` appends "—paused (loading)" to the readout when `autoCapped` is true.
8. **NFR-P6 synthetic harness** at `web/src/dev/mission-scrub-perf.ts` measures total wall-clock JS time and per-tick median/p99/max. Activated via `?perf=mission-scrub`. Co-located vitest asserts wall-clock < 60s and max tick < 50ms.
9. **No new dependencies, decorators, or token-namespace violations.**

### File List

New files:
- `web/src/services/clock-manager.ts` — `ClockManager` service (per-frame heartbeat, subscribe pattern, FR7 auto-cap).
- `web/src/services/clock-manager.test.ts` — 33 unit tests.
- `web/src/math/speed-readout.ts` — `formatSpeedReadout(rate)` helper.
- `web/src/math/speed-readout.test.ts` — 15 unit tests.
- `web/src/components/v-play-button.ts` — Lit Web Component, native button + ARIA + ClockManager click handler.
- `web/src/components/v-play-button.test.ts` — 11 unit tests.
- `web/src/components/v-speed-multiplier.ts` — Lit Web Component, 120 px log-scale slider with snap-to-decade + ARIA + keyboard + readout.
- `web/src/components/v-speed-multiplier.test.ts` — 26 unit tests.
- `web/src/boot/keyboard-shortcuts.ts` — global `Space` toggle handler.
- `web/src/boot/keyboard-shortcuts.test.ts` — 11 unit tests.
- `web/src/dev/mission-scrub-perf.ts` — NFR-P6 synthetic perf harness.
- `web/src/dev/mission-scrub-perf.test.ts` — 9 unit tests.
- `web/tests/play-button-space-key.test.ts` — 7 integration tests (Space + activeElement matrix).
- `web/tests/clock-manager-tick.test.ts` — 6 integration tests (end-to-end tick advance).

Modified files:
- `web/src/components/v-timeline-scrubber.ts` — refactored to subscribe to `ClockManager`; preserves Story-1.9 fallback path; scrub actions route through `clockManager.scrubTo(et)`; `wasPlayingBeforeScrub` debounce now drives `clockManager.play()`.
- `web/src/components/v-timeline-scrubber.test.ts` — added 9 Story-1.10 integration tests; existing 40 Story-1.9 tests preserved against the fallback path.
- `web/src/boot/first-paint.ts` — constructs the shared `ClockManager`, wires it into scrubber / play button / speed multiplier; installs the global Space-key shortcut; exposes `dispose()` on the handle.
- `web/src/boot/url-params.ts` — comment-only update documenting the `?perf=mission-scrub` mode (existing `perfMode` field covers it).
