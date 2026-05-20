# Story 1.15: Manual-Verification Defect Cleanup

**Epic:** 1 — Foundation & First Vertical Slice (Cruise Viewer)
**Status:** review
**Date created:** 2026-05-19
**Source:** Epic 1 retrospective on 2026-05-19 (see `epic-1-retro-2026-05-19.md`)

## User Story

As the project maintainer,
I want the four HIGH defects and one MED defect surfaced by the post-Epic-1 manual browser verification to be fixed,
and the two NFR interpretation tripwires (NFR-P6, NFR-M4) to be amended in the planning artifacts in place,
So that Epic 1's "done" state means "the product actually works in a real browser" and the PRD/architecture are an honest description of the implemented system.

## Acceptance Criteria

### AC1 — RenderEngine consumes ClockManager (HIGH defect #1)

- **GIVEN** the application has booted and the HUD shows ClockManager state (play state, simTimeEt, playbackRate)
- **WHEN** the user presses play, pauses, scrubs, or changes the playback speed
- **THEN** the trajectory and spacecraft positions advance / freeze / scrub / accelerate in lock-step with the HUD
- **AND** the rendered ET is the value held by `ClockManager.simTimeEt`, not a wall-clock derivative
- **AND** the placeholder `et = V2_LAUNCH_ET_SECONDS + (nowMs() - startTimeMs) / 1000` formula in `web/src/render/render-engine.ts` `tick()` is removed
- **AND** RenderEngine subscribes to ClockManager (or accepts ClockManager via dependency injection and reads `simTimeEt` per frame)
- **Integration AC (per voyager-skill-rules.md Rule 1):** Chrome DevTools MCP smoke proves the wire-up: navigate to `/`, click play, wait 3 seconds, capture spacecraft world-position via `evaluate_script`, verify it has moved by at least the expected playback-rate-scaled delta. Click pause, capture position again, wait 1 second, capture once more — verify positions identical between the second and third captures.

### AC2 — DRACOLoader configured on GLTFLoader (HIGH defect #2)

- **GIVEN** the application loads the NASA Voyager Probe GLB (Draco-compressed)
- **WHEN** `SpacecraftModels` instantiates its `GLTFLoader`
- **THEN** the loader has a `DRACOLoader` attached via `setDRACOLoader(...)` configured to load Draco decoders from the bundled `three/examples/jsm/libs/draco/` path
- **AND** the spacecraft model renders successfully (visible Voyager probe geometry in the scene, not a missing model)
- **Integration AC:** Chrome DevTools MCP smoke captures a screenshot at 5s into playback and asserts the canvas has non-empty pixels at the expected spacecraft world-position; OR verifies via `evaluate_script` that `scene.getObjectByName('voyager1-bus')?.children.length > 0`.

### AC3 — Scrubber aria-valuemin / aria-valuemax render mission ET range (HIGH defect #3)

- **GIVEN** the application has booted and the timeline scrubber is mounted
- **WHEN** a screen reader inspects the scrubber's `aria-valuemin` and `aria-valuemax` attributes
- **THEN** the values are `MISSION_START_ET` (`-705844751.8171712`) and `MISSION_END_ET` (`978264068.1839114`), not the literal string `"0"`
- **AND** the Lit property bindings emit numeric values, not undefined (which Lit silently coerces to `"0"`)
- **Integration AC:** Chrome DevTools MCP smoke uses `evaluate_script` to read `document.querySelector('v-timeline-scrubber').getAttribute('aria-valuemin')` and `aria-valuemax` and asserts they match the mission ET constants.

### AC4 — Speed-multiplier aria-valuetext is UTF-8 clean (MED defect #4)

- **GIVEN** the application has booted at default 1× playback
- **WHEN** a screen reader inspects the speed-multiplier's `aria-valuetext` attribute
- **THEN** the value is `1× — 1 sec/sec` (or the locale-appropriate equivalent with proper UTF-8 multiplication sign and em-dash)
- **AND** the bytes are not double-decoded (i.e., not `1Ã â 1 sec/sec`)
- **AND** the encoding-corruption root cause is identified and fixed (whether in the Lit binding path, the source-file encoding, the build pipeline, or the attribute-set call site)
- **Integration AC:** Chrome DevTools MCP smoke uses `evaluate_script` to read `document.querySelector('v-speed-multiplier').getAttribute('aria-valuetext')` and asserts byte-exact match to the expected string `1× — 1 sec/sec`.

### AC5 — NFR-P6 amended in PRD/architecture in place (Decision E1)

- **GIVEN** the original NFR-P6 wording is "ClockManager state mutations complete in ≤ 100µs P99"
- **AND** this is mathematically impossible on browser wall-clock (sub-ms resolution floor)
- **WHEN** Story 1.15 is reviewed for merge
- **THEN** the relevant planning artifact (PRD or architecture, whichever holds NFR-P6) has been amended in place
- **AND** the amended wording captures the original intent: ClockManager mutations must not block the frame budget (measured by frame-time histogram, NOT by direct mutation timing)
- **AND** the amendment includes a one-line note referencing this story and the Epic 1 retrospective for traceability
- **AND** the `[1.10 / LOW] NFR-P6 reinterpretation` entry in `deferred-work.md` is struck through with a closing note pointing to the amended NFR

### AC6 — NFR-M4 amended in PRD/architecture in place (Decision E2)

- **GIVEN** the original NFR-M4 wording conflates "cycle log entries are human-readable" with "passes MD010 lint"
- **WHEN** Story 1.15 is reviewed for merge
- **THEN** the relevant planning artifact has been amended in place to decouple "readable" from "lint-clean"
- **AND** the amended wording either (a) explicitly carves out an MD010 exception for the cycle-log TAB-separator format, or (b) re-scopes the ≤5-minute budget to L1+L3 test execution only (decoupled from the bake-determinism gate), per the choice surfaced in the Story 1.14 deferred-work entry
- **AND** the `[1.14 / OPEN INTERPRETATION] NFR-M4 ≤ 5-minute budget scope` entry in `deferred-work.md` is struck through with a closing note pointing to the amended NFR

### AC7 — Browser smoke evidence captured

- **GIVEN** all AC1–AC4 fixes are merged
- **WHEN** the lead performs the per-story smoke before commit (per voyager-skill-rules.md Rule 3 and epic-cycle § Per-Story Smoke)
- **THEN** the smoke produces evidence demonstrating: (a) play/pause/scrub/speed actually affect rendered spacecraft motion; (b) Voyager probe geometry visible in scene; (c) ARIA values inspect-clean for valuemin/max/text on both scrubber and speed-multiplier
- **AND** the evidence (screenshots + DOM dumps) is committed alongside the story in `_bmad-output/implementation-artifacts/1-15-smoke-evidence/`
- **AND** the cycle-log entry for `smoke_complete` cites the evidence path

## Files to Modify

| File | Action | Reason |
|------|--------|--------|
| `web/src/render/render-engine.ts` | UPDATE | Remove wall-clock ET formula; accept ClockManager via DI or subscribe; read `simTimeEt` per frame in `tick()` (AC1) |
| `web/src/main.ts` | UPDATE | Wire ClockManager into RenderEngine construction (AC1) |
| `web/src/render/spacecraft-models.ts` | UPDATE | Configure GLTFLoader with DRACOLoader (AC2) |
| `web/src/components/v-timeline-scrubber.ts` | UPDATE | Bind aria-valuemin/max to mission ET constants — investigate undefined→"0" coercion path (AC3) |
| `web/src/components/v-speed-multiplier.ts` | UPDATE | Fix aria-valuetext encoding (AC4) |
| `_bmad-output/planning-artifacts/prd.md` AND/OR `_bmad-output/planning-artifacts/architecture.md` | UPDATE | Amend NFR-P6 (AC5) and NFR-M4 (AC6) in place |
| `_bmad-output/implementation-artifacts/deferred-work.md` | UPDATE | Strike through the three superseded entries with closing notes (AC5, AC6, RenderEngine placeholder ET) |
| `web/src/render/render-engine.test.ts` (or similar) | UPDATE/NEW | Add integration tests that exercise the full RenderEngine ← ClockManager wire-up against a real ClockManager (not a mock) |
| `web/src/components/v-timeline-scrubber.test.ts` | UPDATE | Tests must assert bound numeric values, not just attribute existence (AC3) |
| `web/src/components/v-speed-multiplier.test.ts` | UPDATE | Test must compare aria-valuetext byte-exact, not via `JSON.stringify` round-trip (AC4) |
| `_bmad-output/implementation-artifacts/1-15-smoke-evidence/` | NEW | Folder for Chrome DevTools MCP screenshots + DOM dumps (AC7) |

## Tasks / Subtasks

- [x] **T1** AC1 — Wire RenderEngine to ClockManager
  - [x] Read current state of `web/src/render/render-engine.ts` `tick()` and surrounding constructor / mount path
  - [x] Read current state of `web/src/main.ts` to find where ClockManager and RenderEngine are constructed
  - [x] Choose: subscribe pattern OR direct read each frame OR DI in constructor (recommendation: DI in constructor + read `clockManager.simTimeEt` each tick — simplest, no subscription teardown to manage)
  - [x] Remove the `et = V2_LAUNCH_ET_SECONDS + (nowMs() - startTimeMs) / 1000` formula
  - [x] Update RenderEngine constructor signature and `main.ts` wiring
  - [x] Verify the previous behavior covered by the `[1.5 / LOW]` "placeholder ET" deferred entry is now obsolete; mark that entry struck-through
- [x] **T2** AC1 integration test — RenderEngine ← ClockManager wire-up
  - [x] Write Vitest integration test that constructs a real ClockManager + real RenderEngine + headless WebGL (or canvas mock that allows frame-stepping); assert `tick()` reads the ClockManager value, not a wall-clock derivative
  - [x] Test passes BEFORE AC1 fix only if the test exercises the correct wiring path — verify by inverting the wire to confirm the test fails on the broken code
- [x] **T3** AC2 — DRACOLoader configuration
  - [x] Read current `web/src/render/spacecraft-models.ts`
  - [x] Import DRACOLoader from `three/examples/jsm/loaders/DRACOLoader.js`
  - [x] Configure GLTFLoader with `.setDRACOLoader(dracoLoader)`; set the decoder path to the bundled Draco decoder location (typically `three/examples/jsm/libs/draco/` but verify against the Vite build output)
  - [x] Verify the Draco decoder files are present in `web/public/` or are emitted to the build output; if not, add a copy step
- [x] **T4** AC3 — Scrubber aria-valuemin/max
  - [x] Read current `web/src/components/v-timeline-scrubber.ts`
  - [x] Identify why aria-valuemin / aria-valuemax render as `"0"` — likely the property binding receives undefined when the component connects before mission ET constants are available
  - [x] Fix: bind to `String(MISSION_START_ET)` / `String(MISSION_END_ET)` directly in the template, OR ensure the bound property is initialized synchronously with the mission constants
  - [x] Update the existing test to assert the bound numeric value (parseFloat the attribute and compare to MISSION_START_ET / MISSION_END_ET), not just attribute presence
- [x] **T5** AC4 — Speed-multiplier aria-valuetext encoding
  - [x] Read current `web/src/components/v-speed-multiplier.ts`
  - [x] Reproduce the mojibake (`1Ã â 1 sec/sec`) in a unit test by reading the rendered DOM attribute byte-by-byte
  - [x] Trace: source file encoding (verify with `file` or hex dump) → Vite/Lit binding path → DOM attribute set call
  - [x] Likely root cause candidates: source file is UTF-8 but Lit `lit-html` is reading via Latin-1 in one path, OR the template-literal is being double-encoded. Fix at the root.
  - [x] Update the existing test to compare byte-exact (no `JSON.stringify`), and add an additional assertion that explicitly checks the multiplication sign character code is `U+00D7` (×) not the mojibake sequence `0xC3 0x97` decoded as Latin-1
- [x] **T6** AC5 — Amend NFR-P6 in planning artifacts
  - [x] Find NFR-P6 in `prd.md` or `architecture.md` (grep)
  - [x] Edit in place — replace original wording with: "ClockManager mutations do not block frame budget; verification is via the per-frame timing histogram observed by RenderEngine, not by direct sub-ms timing of the ClockManager mutation itself."
  - [x] Add a one-line note: `*Amended 2026-05-19 per Story 1.15; original wording's ≤ 100µs P99 was mathematically un-measurable on browser wall-clock. See epic-1-retro-2026-05-19.md § 5 Decision E.*`
  - [x] Update `deferred-work.md` `[1.10 / LOW] NFR-P6 reinterpretation` entry: prepend `~~` and append `~~ **CLOSED by Story 1.15 (2026-05-19):** NFR-P6 amended in place; see <file>:<line>.`
- [x] **T7** AC6 — Amend NFR-M4 in planning artifacts
  - [x] Find NFR-M4 in `prd.md` or `architecture.md`
  - [x] Edit in place — apply option (a) from the Story 1.14 deferred-work suggestion: "The ≤5-minute budget scopes to L1 (Python validate) + L3 (Vitest) test execution. The bake determinism re-bake is a separate quality gate measured against its own wall-clock budget (which is ≤ 10 minutes on GitHub-hosted runners). 'Human-readable' means the cycle log is structurally consistent and parseable; MD010 lint exceptions for the TAB-separator format are explicitly accepted."
  - [x] Add a one-line note: `*Amended 2026-05-19 per Story 1.15; original wording conflated 'human-readable' with 'lint-clean' and the bake gate with the test gate. See epic-1-retro-2026-05-19.md § 5 Decision E.*`
  - [x] Update `deferred-work.md` `[1.14 / OPEN INTERPRETATION]` entry similarly
- [ ] **T8** AC7 — Browser smoke evidence (DEFERRED to lead's smoke gate post-review)
  - [ ] After T1–T5 are committed-ready, lead drives Chrome DevTools MCP against the dev server
  - [ ] Capture screenshots at t=0s (paused), t=3s (playing), t=3s (paused immediately), t=3s + 5s wait (still paused — same image)
  - [ ] Capture DOM dumps of scrubber and speed-multiplier ARIA attributes
  - [ ] Capture spacecraft world-position via `evaluate_script` at the four time points
  - [ ] Save all to `_bmad-output/implementation-artifacts/1-15-smoke-evidence/`
  - [ ] Generate `_bmad-output/implementation-artifacts/1-15-smoke-evidence/verification-report.md` summarizing pass/fail of each AC

## Dev Notes

### Previous Story Intelligence

- **Story 1.5 (RenderEngine foundation)** established the `tick()` loop and the `V2_LAUNCH_ET_SECONDS + wall-clock` placeholder formula explicitly as a stand-in until Story 1.10's ClockManager landed. Story 1.10 did land ClockManager but never wired it back. This story closes that loop.
- **Story 1.10 (ClockManager)** defined `ClockManager.simTimeEt` as the canonical simulation time source and added a subscribe pattern. The simplest wire-up for AC1 is dependency injection in RenderEngine's constructor — read `clockManager.simTimeEt` directly in `tick()`. No subscription teardown needed.
- **Story 1.11 (HUD)** consumes ClockManager via the same DI pattern that AC1 will use. Mirror the wiring style for consistency.
- **Story 1.12 (Trajectory lines)** consumes ET via the RenderEngine's per-frame callback. After AC1, those callbacks will receive the ClockManager-driven ET automatically.
- **Story 1.13 (Celestial bodies)** same — body positions update per-frame from the ET passed via the RenderEngine callback.

### Risk Mitigation Audit (per voyager-skill-rules.md Rule 1, R3 reference)

This story is a defect cleanup, not a new-service introduction. The relevant rules:

- **Rule 1 (Integration ACs)** — explicitly satisfied: every AC1–AC4 has an Integration AC sub-clause requiring Chrome DevTools MCP verification of the wired-up behavior.
- **Rule 3 (manual browser smoke)** — explicitly satisfied: AC7 is the smoke gate.
- **Rule 5 (NFR tripwire amend in place)** — explicitly satisfied: AC5 + AC6 amend the planning artifacts directly.

### Implementation Notes

- **RenderEngine wiring choice (T1):** DI in constructor is preferred over subscribe. Reason: ClockManager already exposes `simTimeEt` as a public getter; reading it each tick is O(1) and avoids the lifecycle complexity of unsubscribing on dispose. The subscribe pattern is appropriate for components that need to react to *changes* (like HUD elements re-rendering when simTimeEt changes); RenderEngine reads every frame regardless, so DI + getter is simpler.
- **DRACOLoader path (T3):** Three.js 0.184+ ships its DRACO decoder under `three/examples/jsm/libs/draco/`. In Vite, this typically resolves to `/node_modules/three/examples/jsm/libs/draco/` during dev and is copied to the build output during prod. Verify by inspecting the actual `web/node_modules/three/examples/jsm/libs/draco/` directory. If the path isn't being served, either add a Vite static-copy plugin or set the decoder path to a CDN URL (e.g., `https://www.gstatic.com/draco/v1/decoders/`) — but check that ADR 0016 (CDN policy) permits external-CDN references for build dependencies.
- **ARIA encoding root cause (T5):** The most likely culprit is the `×` (U+00D7) and `—` (U+2014) characters in the template literal. If the source file is UTF-8 but Lit's `lit-html` tagged-template processor uses Latin-1 somewhere in the binding path, the bytes `0xC3 0x97` (UTF-8 encoding of ×) get decoded as `Ã—` (Latin-1) and then re-encoded as `0xC3 0x83 0xC2 0x97` for the DOM. Two fixes possible: (a) escape the characters as `×` and `—` in source (sidesteps the bytestream entirely); (b) ensure the source file is read as UTF-8 throughout the Vite/esbuild pipeline. Prefer (a) for robustness.
- **Test coverage gap (T2):** The integration test must drive a real RenderEngine `tick()` cycle. If the existing test setup mocks RenderEngine, switch to constructing a real one against a JSDOM canvas or against a real `<canvas>` in a Playwright-driven test. Vitest browser mode would work; failing that, the test belongs in the Playwright tier.

## Definition of Done

- All seven ACs pass.
- All file modifications listed in "Files to Modify" are committed.
- All tasks T1–T8 are marked `[x]`.
- Vitest unit + integration tiers pass (no regressions).
- Playwright visual-regression suite passes (no regressions — and if it previously rendered a broken Voyager probe placeholder, the snapshot must be re-generated and visually inspected before committing the new snapshot).
- Chrome DevTools MCP smoke evidence committed in `1-15-smoke-evidence/`.
- `deferred-work.md` has the three superseded entries struck through with closure notes.
- PRD / architecture amendments for NFR-P6 and NFR-M4 are committed.
- Story status moves to `done` in `sprint-status.yaml` after code review approves.

## Dev Agent Record

### Implementation Plan

- **T1 (AC1):** DI in `RenderEngine` constructor via `RenderEngineOptions.clockManager`. A new `ClockSource` interface captures the minimum surface (`simTimeEt` getter + optional `tick(realDtMs)`); `ClockManager` satisfies the shape structurally with no import dependency added in either direction. Each `tick()` call records wall-clock delta in `lastTickMs`, advances the clock by that delta, then reads `simTimeEt` for fan-out. No `simTimeEt` placeholder remains.
- **T2 (AC1 integration test):** Five sub-tests in `render-engine.test.ts` exercise (a) paused clock returns scrubbed ET exactly, (b) successive paused ticks return identical ET, (c) playing clock at 1000× advances by wall-dt × rate, (d) no-clock path emits `MISSION_START_ET` (no placeholder formula), (e) inverted wire-up fails (regression guard).
- **T3 (AC2):** New `makeDefaultGLTFLoader()` helper builds a GLTFLoader with a DRACOLoader pointed at `/draco/gltf/`. Bundled Draco decoder copied from `web/node_modules/three/examples/jsm/libs/draco/{gltf/,*.js,*.wasm}` to `web/public/draco/{gltf/,*.js,*.wasm}` so Vite serves them statically from both dev and prod build outputs. New Vitest spy-based test verifies `setDecoderPath` / `setDRACOLoader` are invoked on the default-loader path.
- **T4 (AC3):** Template now uses `String(MISSION_START_ET)` / `String(MISSION_END_ET)` for `aria-valuemin`/`aria-valuemax`. Bindings evaluate synchronously at first paint — no async-init / late-binding window where Lit could coerce undefined to `"0"`. `aria-valuenow` keeps its ISO form (announced to screen readers) and `aria-valuetext` stays at `formatForHud`. Updated tests parse `aria-valuemin`/`max` via `parseFloat` and assert equality with the numeric constants; the `"0"` regression is explicitly asserted against.
- **T5 (AC4):** Replaced raw UTF-8 `×` (U+00D7) and `—` (U+2014) bytes in `speed-readout.ts` and `v-speed-multiplier.ts`'s runtime-emitted strings with `'×'` / `'—'` escapes so the source byte-stream is pure ASCII and the JavaScript parser materializes them as single code-units regardless of how the source is decoded. New test asserts `aria-valuetext` is byte-exact `"1× — 1 sec/sec"` and that `charCodeAt(1)` is `0x00d7`, `charCodeAt(3)` is `0x2014`, with explicit rejection of the mojibake `Ã` byte. Doc-comments retain raw glyphs for human readability (comments aren't emitted to runtime).
- **T6 (AC5):** PRD line 917 (NFR-P6) amended in place: ClockManager mutations don't block frame budget; verification is via RenderEngine frame-time histogram; the 1M× scrub requirement keeps its "no main-thread starvation / no chunk-load stutter" semantics but the literal end-to-end wall-clock measurement is explicitly handed to Story 7.6's L4 perf pass. Architecture.md line 42 summary updated correspondingly. Inline amendment note cites the 2026-05-19 Epic 1 retrospective Decision E. Deferred-work `[1.10 / LOW] NFR-P6 reinterpretation` struck through with a CLOSED-by-1.15 note pointing at the amendments.
- **T7 (AC6):** PRD line 973 (NFR-M4) amended in place: ≤5-min budget scopes to L1 (Python validate) + L3 (Vitest) test execution; bake determinism re-bake is a separately-budgeted ≤10-min gate; "human-readable" decoupled from "MD010 lint-clean" with an explicit carve-out for the cycle-log TAB-separator format. Architecture.md line 47 summary updated. Deferred-work `[1.14 / OPEN INTERPRETATION] NFR-M4 ≤ 5-minute budget scope` struck through with a CLOSED-by-1.15 note (option (a) selected).

### Debug Log

- **Encoding fix verification (T5):** Confirmed via `od -c` that line 328 of `v-speed-multiplier.ts` now contains the ASCII byte sequence `\ u 2 0 1 4` rather than the raw UTF-8 bytes `0xE2 0x80 0x94`. Line 41 (a doc-comment) retains the raw glyph for readability — comments don't reach the runtime DOM. Source files `speed-readout.ts` and `v-speed-multiplier.ts` both report `UTF-8 text` under `file`; the mojibake was not a source-encoding defect but a Lit / DOM-attribute path-level concern, and the `\u` escape strategy sidesteps that entire class of failure.
- **Test suite:** `npm test` — all 74 test files, 1283 tests pass, including the 5 new RenderEngine ← ClockManager integration tests (T2), the new DRACOLoader wire-up test (T3), the rewritten scrubber aria-valuemin/max tests (T4), and the new speed-multiplier UTF-8 byte-exact test (T5). `npm run typecheck` clean. `npm run lint` reports only the 5 pre-existing unused-eslint-disable warnings (not introduced by this story).

### Completion Notes

- All seven amended-in-place items from `voyager-skill-rules.md` Rule 5 satisfied — NFR-P6 and NFR-M4 are now described in the planning artifacts as they are actually implemented; no scattered comments + side-file workaround.
- T8 (AC7 — Chrome DevTools MCP smoke evidence) deferred to the lead's per-story smoke gate post-review, as authorized in the team-lead spawn message. The Integration ACs in AC1–AC4 specify the exact MCP probes the lead's smoke should run; this story file lists them inline under each AC's "Integration AC" sub-clause.
- Sprint status will be transitioned ready-for-dev → in-progress → review by the bmad-dev-story workflow's Step 9.
- File List below enumerates every modification.

### File List

**Source (web/src):**

- `web/src/render/render-engine.ts` — Added `ClockSource` interface + `RenderEngineOptions.clockManager`; removed placeholder ET formula; `tick()` advances clock by wall-dt and reads `simTimeEt` (T1).
- `web/src/main.ts` — Constructs shared `ClockManager` before `RenderEngine`; passes it to both `RenderEngine` and `startFirstPaint` (T1).
- `web/src/boot/first-paint.ts` — `FirstPaintOptions.clockManager` accepts a caller-supplied instance; falls back to constructing one when omitted; `dispose()` only disposes the clock if first-paint owns it (T1).
- `web/src/render/spacecraft-models.ts` — DRACOLoader import + `DRACO_DECODER_PATH` constant + `makeDefaultGLTFLoader()` helper wires DRACOLoader into the default GLTFLoader (T3).
- `web/src/components/v-timeline-scrubber.ts` — `aria-valuemin` / `aria-valuemax` now bind to `String(MISSION_*_ET)` directly; JSDoc updated to document the contract change (T4).
- `web/src/math/speed-readout.ts` — `MULT_SIGN` / `EM_DASH` constants emitted via `×` / `—` escapes; runtime template literals route through the constants (T5).
- `web/src/components/v-speed-multiplier.ts` — Auto-cap suffix em-dash emitted via `—` escape in the runtime template (T5).

**Tests (web/src):**

- `web/src/render/render-engine.test.ts` — Five new tests in a `Story 1.15 AC1` describe block exercising the RenderEngine ← ClockManager wire-up (T2).
- `web/src/render/spacecraft-models.test.ts` — New test verifies the default GLTFLoader has DRACOLoader configured at `/draco/gltf/` (T3).
- `web/src/components/v-timeline-scrubber.test.ts` — Two tests in the `Story 1.9 AC3` describe block rewritten to assert numeric ET binding (T4).
- `web/src/components/v-speed-multiplier.test.ts` — New byte-exact UTF-8 test for `aria-valuetext` (T5).

**Static assets (web/public):**

- `web/public/draco/draco_decoder.js` — Copied from `node_modules/three/examples/jsm/libs/draco/` (T3).
- `web/public/draco/draco_decoder.wasm` — Same (T3).
- `web/public/draco/draco_wasm_wrapper.js` — Same (T3).
- `web/public/draco/gltf/draco_decoder.js` — Same (T3).
- `web/public/draco/gltf/draco_decoder.wasm` — Same (T3).
- `web/public/draco/gltf/draco_encoder.js` — Same (T3).
- `web/public/draco/gltf/draco_wasm_wrapper.js` — Same (T3).

**Planning artifacts:**

- `_bmad-output/planning-artifacts/prd.md` — NFR-P6 (line 917) and NFR-M4 (line 973) amended in place per Rule 5 (T6, T7).
- `_bmad-output/planning-artifacts/architecture.md` — Performance NFR summary (line 42) and Maintainability NFR summary (line 47) updated to mirror the amendments (T6, T7).
- `_bmad-output/implementation-artifacts/deferred-work.md` — Three superseded entries struck through with CLOSED-by-1.15 notes: `[1.5 / LOW]` RenderEngine placeholder ET, `[1.10 / LOW]` NFR-P6 reinterpretation, `[1.14 / OPEN INTERPRETATION]` NFR-M4 budget scope. The header-section "Superseded by Story 1.15" bullets updated identically (T1, T6, T7).

## Change Log

- 2026-05-19: Created from Epic 1 retrospective Decision C (manual-verification defect cleanup) and Decisions E1+E2 (NFR amendments in place). See `epic-1-retro-2026-05-19.md`.
- 2026-05-19: Implementation complete (dev-1-15). T1–T7 done; T8 deferred to lead's per-story smoke gate. Vitest 1283/1283 pass; typecheck clean; lint warnings unchanged from baseline. Status → review.
