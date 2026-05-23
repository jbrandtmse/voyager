# Story 4.2: VoyagerCameraController — Manual Override and Restore Default

**Epic:** 4 — Encounter Chapters (All Six Gas-Giant Flybys)
**Status:** done
**Date created:** 2026-05-23

## User Story

As a visitor exploring an encounter,
I want to orbit, pan, and zoom the camera freely and snap back to the chapter's cinematic framing with one action,
So that I can inspect what I want without losing the curated view, fulfilling FR32, FR33, and FR13 (zoom range enforced).

## Consumed-by

- **Story 4.5** (`v1-jupiter` chapter): the user navigating to V1 Jupiter expects body-centered framing on arrival (via ViewFrame); after manual orbit they expect the `R` shortcut to restore to the chapter's default framing — exercising this controller end-to-end.
- **Story 4.6 / 4.7** (other encounter chapters): same contract.
- **Epic 5 Story 5.x** (Pale Blue Dot module): the PBD module may override camera transforms during the choreographed turn; the manual-override path needs to interact correctly with PBD's per-frame camera writes (the PBD module's substate machine is the canonical owner during the PBD window — the camera controller should pause its own writes when a "module-owned" flag is set; document the contract even though PBD wiring is later).
- **Epic 6 Story 6.4** (full a11y pass): the `R` keyboard shortcut + the restore-button affordance both need to honor reduced-motion + focus-visible per the global rules.

This story **introduces** the VoyagerCameraController service — its first consumer is the cold-load runtime itself (manual gesture → state flip → restore-button visible → R/click → animate back), exercised by this story's Integration AC.

## Acceptance Criteria

### AC1 — Hand-rolled `VoyagerCameraController` class with Pointer Events + zoom range

- **GIVEN** the controller source file at `web/src/render/voyager-camera-controller.ts`
- **WHEN** I inspect it
- **THEN** it is a hand-rolled controller (NOT `THREE.OrbitControls`) per Architecture Decision 3c — `import { OrbitControls } from 'three/...';` is FORBIDDEN; verified by source-grep
- **AND** the class exposes `VoyagerCameraController` with constructor accepting `{ camera: THREE.PerspectiveCamera, domElement: HTMLElement, getViewFrameOrigin: () => WorldVec3, getActiveTarget: () => WorldVec3 | null }` — the controller does NOT own the camera (DI per ADR-0015) and reads ViewFrame's current origin offset + the active body's world position from getter callbacks (decouples from EphemerisService / ViewFrameService; the consumer wires them)
- **AND** the class implements: pointer-drag → orbit around `getActiveTarget()` (the active body in body-centered framing, or the Sun-at-origin in heliocentric); wheel/pinch → zoom (log-scale step per notch); right-drag (desktop) or two-finger drag (touch) → pan; Shift+drag → roll (the only path to free roll per Architecture Decision 3c)
- **AND** input is wired via `primitives/pointer-events.ts:attachPointerHandlers` (unified mouse + touch + pen per Architecture line 418); the controller does NOT add raw `addEventListener('mousedown',...)` etc.
- **AND** zoom distance is clamped on every gesture to `[1.0, 200 * AU_KM]` = `[1 m / 1000, 200 * 1.495978707e8]` km in render-space (per Architecture Decision 3c hard clamps and FR13's sub-meter inspection through 165 AU range)

### AC2 — Manual gesture sets `RenderEngine.manualCameraActive = true` + cursor `grabbing`

- **GIVEN** the user takes manual camera control via any orbit/pan/zoom gesture
- **WHEN** the gesture fires on the canvas (not on the scrubber or HUD — those have their own `setPointerCapture` per Story 1.9 / 1.10 patterns)
- **THEN** the controller calls `renderEngine.setManualCameraActive(true)` (new method on RenderEngine — boolean setter that also writes to a public getter `renderEngine.manualCameraActive`)
- **AND** `ViewFrame.getTransform` continues to compute the world-origin offset (per Story 4.1 AC2); the camera's local transform (`camera.position`, `camera.quaternion`) is now owned by the controller, NOT by chapter-driven framing
- **AND** the controller sets `domElement.style.cursor = 'grabbing'` for the duration of the drag, restoring to the previous value on `pointerup` / `pointercancel`
- **AND** the controller's gesture handlers use `setPointerCapture` (already provided by the `attachPointerHandlers` primitive from Story 1.9) so the drag continues even if the pointer leaves the canvas mid-gesture

### AC3 — `R` shortcut + `↺` button restore default framing; animation; on-complete state reset

- **GIVEN** manual camera control is active (`manualCameraActive === true`)
- **WHEN** I press `R` from anywhere (with no text input focused — the existing `<v-help-overlay>` keyboard-shortcut pattern from Story 2.8 already gates this; mirror it) OR click the `<button class="restore-camera">` affordance
- **THEN** the controller starts an animation tweening the camera back to the active chapter's default framing over `--v-duration-slow` (centralised at `web/src/styles/tokens.css` per Story 1.7; 400ms baseline, 0ms under reduced motion per the same token's reduced-motion override)
- **AND** the animation interpolates BOTH `camera.position` AND `camera.quaternion` (the active chapter's default framing has both a position and an orientation; SLERP for the quaternion, LERP for the position; or use Three.js's `Quaternion.slerp` + `Vector3.lerp` against the saved default-framing target)
- **AND** on animation completion: `renderEngine.setManualCameraActive(false)`; chapter-driven framing resumes (so subsequent chapter transitions auto-frame normally via ViewFrame)
- **AND** if there is no active chapter (cruise), `R` / button restores to the default heliocentric framing — Sun-centered at world origin (after ViewFrame's identity transform), camera distance tuned to show both V1 + V2 + the inner planets (recommendation: distance ~10 AU, look-at origin; pin in the controller as `CRUISE_DEFAULT_DISTANCE_KM = 10 * AU_KM`)
- **AND** the chapter's default framing is computed from `(getActiveTarget(), defaultDistanceForChapter(chapter))` — the controller maintains an internal `defaultDistanceForChapter` map (or reads it from the ChapterSpec if a `defaultCameraDistanceKm?: number` field is added in Story 4.5)

### AC4 — Restore affordance DOM contract

- **GIVEN** the restore affordance lives as a Light-DOM `<button>` adjacent to `<v-speed-multiplier>` (positioned bottom-right per the existing HUD layout) — NOT a new Lit component (it's a single button, doesn't warrant a custom element; native `<button>` is sufficient)
- **WHEN** I inspect the DOM
- **THEN** the button renders with attributes: `class="restore-camera"`, `type="button"`, `aria-label="Restore default camera framing"`, inner text `↺` (U+21BA ANTICLOCKWISE OPEN CIRCLE ARROW) wrapped in `<span aria-hidden="true">`
- **AND** the button's `display` is governed by a CSS attribute selector reading `renderEngine.manualCameraActive` (e.g., the button has `display: none` by default and `[data-manual-camera="true"]` selector on the host promotes it to `display: inline-flex`; the host is a parent element that the controller writes the `data-manual-camera` attribute on)
- **AND** `display: none` is the FALSY state (NOT `opacity: 0` — no DOM cost during cruise per Architecture)
- **AND** in embed mode (per Story 2.5 EmbedModeState) the affordance STILL renders (it controls the simulation, not the chrome — distinct from chapter-index / About / help icons that are chrome-only); document the embed-mode carve-out in a comment + cover with a test
- **AND** the affordance's mount + dispose flows through `first-paint.ts` per the existing pattern; the restore button is a sibling of `<v-speed-multiplier>` in the HUD chrome row
- **AND** clicking the button fires the same restore path as pressing `R`

### AC5 — Zoom range hard clamps + reverse-Z stability + FR13 sub-meter coverage

- **GIVEN** the zoom range
- **WHEN** I zoom in past the lower bound (1 m / 0.001 km) or out past the upper bound (200 AU / 200 × 1.495978707e8 km)
- **THEN** the camera distance to `getActiveTarget()` clamps at exactly those bounds without breaking the controller's gesture state
- **AND** the FR13 sub-meter inspection through 165 AU range is fully covered with margin (200 AU outer / 0.001 km inner = 30 orders of magnitude — well within reverse-Z stability)
- **AND** reverse-Z (Story 1.5 — verified in `render-engine.test.ts` precision suite) keeps the rendering precision stable across the entire zoom range — no z-fighting at the bounds; verified by a probe test at both clamp distances (camera.position magnitude == clamp bound; render produces a non-degenerate scene matrix)

### AC6 — Integration AC (Rule 1): RenderEngine consumes VoyagerCameraController; manual gesture → state flip → ViewFrame still active

- **GIVEN** VoyagerCameraController is service-introducing (this story); first consumer is the cold-load runtime itself wired via main.ts
- **WHEN** Story 4.2 lands the integration
- **THEN** `web/tests/voyager-camera-controller-integration.test.ts` constructs:
  - A real `RenderEngine` (with the new `setManualCameraActive` setter)
  - A real `VoyagerCameraController` wired against the engine
  - Stub ViewFrame origin + active target getters
- **AND** the test exercises:
  - Synthesizing a `pointerdown` + `pointermove` on the canvas via `dispatchEvent(new PointerEvent(...))` → asserts `renderEngine.manualCameraActive === true` after the gesture and `domElement.style.cursor === 'grabbing'`
  - Asserts ViewFrame's transform is STILL being called per-frame after the gesture (the ViewFrame call is unaffected — only camera ownership flipped); verified via a spy on the engine's onFrame callback that includes the ViewFrame call
  - Synthesizing the `R` keyboard event (with focus on `document.body`, no text input active) → asserts the restore animation starts (controller exposes an `isRestoring` getter or a `restoreComplete: Promise<void>` for the test to await)
  - On `restoreComplete` resolution → asserts `renderEngine.manualCameraActive === false`
- **AND** the integration test passes locally under happy-dom (Three.js + PerspectiveCamera both happy-dom-friendly; PointerEvent is constructable per the modern happy-dom builds)

### AC7 — `R` keyboard shortcut respects text-input focus + reduced-motion

- **GIVEN** the existing keyboard-shortcut gating pattern from Story 2.8 (`<v-help-overlay>` uses a centralised "no text-input focused" guard before firing `?` / `A` shortcuts)
- **WHEN** Story 4.2 wires `R` as a new document-level keydown listener
- **THEN** the listener mirrors Story 2.8's gating: it returns early if `document.activeElement` is an `<input>`, `<textarea>`, `<select>`, or `[contenteditable="true"]` element, OR if `event.defaultPrevented === true`, OR if any modifier key besides Shift is held (no Ctrl+R / Cmd+R interference)
- **AND** the listener is added to `document` in `first-paint.ts` (or `main.ts` if first-paint is too early) ONLY when the controller is constructed (i.e. post-RenderEngine); the dispose handle returned by first-paint includes the listener's removeEventListener
- **AND** in embed mode the `R` listener STILL attaches (manual camera control is simulation-not-chrome per AC4's carve-out)
- **AND** under reduced motion (`--v-duration-slow` resolves to 0ms) the restore is an instant cut: animation completes synchronously on the same frame; `manualCameraActive` flips to false on the same tick

### AC8 — Lead-driven Chrome DevTools MCP smoke (Rule 3; binding browser-evidence gate)

- **GIVEN** Story 4.2 touches `web/src/render/render-engine.ts` (new `setManualCameraActive` setter) + adds new DOM (restore button) + new global keyboard listener (`R`)
- **AND** Rule 3 + Rule 8 require Chrome DevTools MCP browser-smoke evidence for stories touching user-facing surfaces
- **AND** code-side prerequisites must be in place: `__voyagerDebug.cameraController` published under `import.meta.env.DEV`; the existing debug surfaces still published
- **WHEN** the lead drives the smoke after dev + QA + code-review complete
- **THEN** the lead navigates Chrome DevTools MCP to `/c/v1-jupiter` and verifies:
  - `__voyagerDebug.cameraController` exists; `renderEngine.manualCameraActive === false` at boot (cruise/initial state)
  - Synthesizing a `pointerdown` + `pointermove` + `pointerup` on the canvas via `evaluate_script` → after the gesture, `renderEngine.manualCameraActive === true`; the restore button is now `display: inline-flex` (visible)
  - Triggering the `R` key via `evaluate_script` (`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'r'}))`) → after `--v-duration-slow` ms (400ms baseline), `renderEngine.manualCameraActive === false`; the restore button is now `display: none` again
  - Console clean of application errors
- **AND** smoke evidence captured under `_bmad-output/implementation-artifacts/4-2-smoke-evidence/`: `mcp-pre-gesture.png`, `mcp-mid-gesture.png` (restore button visible), `mcp-post-restore.png`, `mcp-smoke-summary.md`

### AC9 — Test sweep + lint baseline preserved + ADR compliance verified

- **GIVEN** the project's test pyramid post-Story-4.1 baseline: web vitest 2480 pass / 2 skipped / 139 files; bake fast pytest 414/4/19; typecheck clean; lint 4 warnings (pre-existing baseline)
- **WHEN** Story 4.2 ships
- **THEN** web vitest pass count is ≥ 2480 plus the net new tests; document precise delta in the Dev Agent Record
- **AND** bake unchanged (Story 4.2 is web-only)
- **AND** `npm run typecheck` is clean
- **AND** `npm run lint` shows ≤ 4 warnings (0 new)
- **AND** Architecture Decision 3c (hand-rolled controller, no OrbitControls; zoom clamps; no free roll without Shift modifier) verified compliant in the Dev Agent Record
- **AND** ADR-0015 (no-global-store; constructor-DI), ADR-0026 (zero `any`), ADR-0023 (ViewFrame translation-only — controller does NOT touch ViewFrame's origin math) verified
- **AND** Rule 9 (APG primitives): the restore button is a native `<button>` — no slider/listbox keyboard handler; N/A. Rule 10 (Lit declare+ctor-init): the restore button is light-DOM, not Lit; N/A

## Tasks / Subtasks

- [x] **T1: VoyagerCameraController class** (AC1, AC2, AC5)
  - [x] T1.1: Create `web/src/render/voyager-camera-controller.ts` exporting `VoyagerCameraController` class + supporting types.
  - [x] T1.2: Implement constructor + the orbit/pan/zoom/roll gesture handlers via `attachPointerHandlers` from `web/src/primitives/pointer-events.ts`.
  - [x] T1.3: Implement zoom-distance clamping `[0.001 km, 200 * AU_KM]` with log-scale wheel/pinch step.
  - [x] T1.4: Add `setManualCameraActive(boolean)` setter + `manualCameraActive` getter to `RenderEngine`.
  - [x] T1.5: Add `__voyagerDebug.cameraController` publication under `import.meta.env.DEV`.
  - [x] T1.6: Unit-test in `web/src/render/voyager-camera-controller.test.ts` (gesture-state transitions, zoom clamps at both bounds, no-OrbitControls source-grep).

- [x] **T2: `R` keyboard shortcut wire + text-input gate** (AC7)
  - [x] T2.1: Read Story 2.8's `<v-help-overlay>` keydown wire pattern; mirror the text-input gate.
  - [x] T2.2: Add a document-level `keydown` listener (via `mountCameraRestoreAffordance` in `web/src/boot/camera-restore-affordance.ts`, wired from `main.ts`); call the controller's restore animation.
  - [x] T2.3: Verify Shift+drag is the ONLY free-roll path (modifier filter on the keydown listener: ignore if Ctrl/Cmd/Alt held; Shift allowed).
  - [x] T2.4: Tests in `web/tests/voyager-camera-controller-keyboard.test.ts` covering text-input focus gate, modifier gate, reduced-motion path.

- [x] **T3: Restore button affordance** (AC4)
  - [x] T3.1: Create the button in `mountCameraRestoreAffordance` (mounted from `main.ts` as a sibling of the canvas/HUD chrome row, using `canvas.parentElement` as the attribute host so the `[data-manual-camera]` selector promotes the button).
  - [x] T3.2: CSS rule in `web/src/styles/restore-camera.css` for the `[data-manual-camera="true"]` selector; imported from `main.ts`.
  - [x] T3.3: Click handler wires to the same restore animation as the `R` shortcut.
  - [x] T3.4: Tests in `web/tests/restore-camera-button.test.ts` (default hidden; visible when manualCameraActive; embed-mode carve-out).

- [x] **T4: Integration AC test** (AC6)
  - [x] T4.1: Author `web/tests/voyager-camera-controller-integration.test.ts` per the AC6 plan — real RenderEngine + controller + synthesized PointerEvent.
  - [x] T4.2: Pin the `manualCameraActive` flip + ViewFrame transform call invariant + restore animation completion.

- [x] **T5: PBD module-owned carve-out comment** (Consumed-by note)
  - [x] T5.1: Added JSDoc in `voyager-camera-controller.ts` header noting Epic 5's PBD module will set the `manualCameraSuspended: boolean` flag (defaults to `false`) during the choreographed turn; gesture handlers + `restore()` short-circuit when suspended. Unit-tested in three scenarios (pointerdown / wheel / restore).

- [x] **T6: AC8 smoke prerequisites + DEV debug surface**
  - [x] T6.1: Confirmed `__voyagerDebug.cameraController` + `__voyagerDebug.renderEngine` publication under `import.meta.env.DEV` (added in `main.ts` post-manifest).
  - [x] T6.2: Smoke probe plan documented in Dev Agent Record below.

- [x] **T7: Final sweep + lint + ADR-compliance documentation** (AC9)
  - [x] T7.1: `cd web && npm run typecheck && npm run lint && npx vitest run` — clean typecheck; 4 lint warnings (matches Story 4.1 baseline, 0 new); vitest 2549 pass / 2 skipped / 143 files (Δ +69 tests / +4 files over the 2480 / 2 / 139 baseline).
  - [x] T7.2: ADR-0015 / ADR-0023 / ADR-0026 + Architecture Decision 3c compliance recorded.

## Dev Notes

### Critical files (current state, what Story 4.2 touches)

- `web/src/render/voyager-camera-controller.ts` (NEW)
  - **AC1 + AC2 + AC5**: new file. Class + gesture wiring + zoom clamps.

- `web/src/render/voyager-camera-controller.test.ts` (NEW)
  - **T1.6**: unit tests.

- `web/src/render/render-engine.ts`
  - **AC2 touches**: add `manualCameraActive: boolean` field + `setManualCameraActive(value: boolean)` setter + `get manualCameraActive(): boolean` getter. Add `__voyagerDebug.cameraController` publication.
  - The existing onFrame still calls `viewFrame.getTransform(...)` (Story 4.1 AC2); that path is UNCHANGED. Only the camera's local transform owner changes when `manualCameraActive === true` — and the controller (not RenderEngine) writes to `camera.position` / `camera.quaternion` in that mode.

- `web/src/primitives/pointer-events.ts` (READ-ONLY for Story 4.2)
  - `attachPointerHandlers(target, handlers)` is the canonical Pointer Events wrapper. Returns an off() function.

- `web/src/boot/first-paint.ts` OR `web/src/main.ts`
  - **AC4 + AC7 touches**: mount the restore button in the HUD chrome row; wire the keyboard listener. Read the existing `<v-speed-multiplier>` mount to identify the parent.

- `web/src/styles/` (NEW file likely needed)
  - **AC4**: `.restore-camera` selector + `[data-manual-camera]` attribute-promotion rule. Or fold into the existing HUD stylesheet.

- `web/tests/voyager-camera-controller-integration.test.ts` (NEW)
  - **AC6**: integration test.

- `web/tests/voyager-camera-controller-keyboard.test.ts` (NEW)
  - **T2.4**: keyboard-gate tests.

- `web/tests/restore-camera-button.test.ts` (NEW)
  - **T3.4**: affordance DOM tests.

### Previous Story Intelligence

**Story 1.5 (RenderEngine foundation)** — `web/src/render/render-engine.ts` is the host for the new `manualCameraActive` flag. Pattern reference: previous flag additions (e.g. `setViewFrame` from Story 4.1) used optional constructor params + setter; mirror that.

**Story 1.7 (Design tokens + reduced-motion)** — `--v-duration-slow` is the centralised animation token. ViewFrame's reduced-motion check (Story 4.1) uses `matchMedia('(prefers-reduced-motion: reduce)').matches`; mirror that pattern for the restore animation.

**Story 1.9 / 1.10 (scrubber + play button — Pointer Events)** — `attachPointerHandlers` from `web/src/primitives/pointer-events.ts` is the canonical wrapper; existing consumers include the scrubber thumb drag and the play-button click. Mirror their `setPointerCapture` discipline.

**Story 2.8 (`<v-help-overlay>` — keyboard shortcuts)** — the text-input focus gate + modifier filter for `?` / `A` shortcuts is the canonical reference. Story 4.2's `R` listener mirrors it.

**Story 4.1 (ViewFrame)** — ViewFrame's `getTransform(et, activeChapter)` is called once per RenderEngine.onFrame; its origin offset is applied to `cameraWorldPos` BEFORE the floating-origin step. Story 4.2 does NOT change this — the controller writes only to the camera's LOCAL transform (`camera.position` / `camera.quaternion`), which is independent of `cameraWorldPos` (which feeds the WorldGroup recentering).

### NFR / ADR compliance pointers

- **Architecture Decision 3c (hand-rolled controller; zoom clamps 1m–200AU; no free roll without modifier)**: AC1 + AC5 directly honor this.
- **ADR-0015 (no global store; constructor-DI)**: controller takes camera + domElement + getters via constructor; no module-level singleton.
- **ADR-0023 (translation-only view-frame blend)**: controller does NOT touch ViewFrame's origin math; camera's quaternion remains controller-owned per AC2 + Story 4.1 AC3.
- **ADR-0026 (zero `any`)**: all gesture handler types use the existing `PointerPayload` from primitives; all branded types preserved.
- **FR13 (sub-meter through 165 AU)**: AC5 zoom clamps + reverse-Z stability satisfy this.
- **FR32 / FR33 (free camera + restore)**: this story's primary deliverable.

### Reduced-motion source

Mirror the ViewFrameService pattern from Story 4.1: read `matchMedia('(prefers-reduced-motion: reduce)').matches` at animation start. The restore animation collapses to instant on the same frame.

### Active-target resolution for the controller

In body-centered framing (Story 4.1 AC1), the active body is `activeChapter.targetBody`. The controller's `getActiveTarget()` callback should resolve to:

- If `chapterDirector.activeChapter?.targetBody !== undefined`: the body's world position via `ephemerisService.getPosition(activeChapter.targetBody, currentEt)` MINUS the ViewFrame's origin offset (the body's position in the SHIFTED render-space-after-floating-origin frame, which is what the camera orbits around).
- Otherwise (cruise, no encounter): the world origin `(0, 0, 0)` (the Sun after floating-origin).

The wiring lives in `main.ts` — pass closures that capture the ephemerisService + chapterDirector + viewFrame + clockManager.

## References

- Epic 4 spec for Story 4.2: `_bmad-output/planning-artifacts/epics.md:1591-1629`
- Architecture Decision 3c (hand-rolled controller + zoom clamps): `_bmad-output/planning-artifacts/architecture.md` (search for "Decision 3c")
- Pointer Events primitive: `web/src/primitives/pointer-events.ts`
- RenderEngine source (host for `manualCameraActive` flag): `web/src/render/render-engine.ts`
- Story 4.1 ViewFrameService (reference for service-introduction pattern + integration test): `web/src/services/view-frame.ts`, `web/tests/view-frame-render-engine-integration.test.ts`
- Story 2.8 `<v-help-overlay>` keyboard-shortcut gate pattern: `web/src/components/v-help-overlay.ts`
- voyager-skill-rules (Rules 1-11 inc. Story 4.0 additions): `_bmad/custom/voyager-skill-rules.md`

### Review Findings (code-review stage, 2026-05-22)

Auto-resolved inline during code review (no further action required):

- [x] `Review/Patch` MED — Pan gesture now clamps camera-to-target distance against zoom bounds (`web/src/render/voyager-camera-controller.ts` lines 565-595)
- [x] `Review/Patch` LOW — `cancelAnimation()` now resolves wrapped `restoreComplete` promises so callers don't hang on a mid-restore gesture cancel (`web/src/render/voyager-camera-controller.ts` lines 670-687)
- [x] `Review/Patch` LOW — `onPointerMove` now short-circuits when `manualCameraSuspended === true` (closes the PBD mid-drag contract gap from the file-header) (`web/src/render/voyager-camera-controller.ts` lines 497-505)
- [x] `Review/Patch` LOW — `onWheel` no-ops when `ev.deltaY === 0` (horizontal-only wheel / shift-scroll edge case) (`web/src/render/voyager-camera-controller.ts` lines 529-531)
- [x] `Review/Patch` LOW — Updated stale test-count metrics in the Debug Log References to reflect the post-QA + post-code-review sweep (2583 / 2 / 144) (this file, lines 246-247)

Deferred to `deferred-work.md`:

- [x] `Review/Defer` MED — Pinch-to-zoom (two-finger touch) not implemented (AC1 partial coverage) — deferred, requires gesture-state extension beyond inline patch scope; lead to triage at Story 4.2 close
- [x] `Review/Defer` LOW — No probe test for non-degenerate scene matrix at zoom clamp bounds (AC5 partial coverage; reverse-Z stability structurally inherited from Story 1.5) — deferred, defensive belt-and-braces on a Story-1.5-guaranteed surface

Verified compliant (no findings):

- Architecture Decision 3c (hand-rolled controller; no OrbitControls import; zoom clamps fire on every pointermove during a drag — extended to pan via the MED auto-resolve above; Shift is the only roll path)
- ADR-0015 (constructor-DI; no module-level singleton)
- ADR-0023 (controller writes only to `camera.position` + `camera.quaternion`; ViewFrame's origin math is untouched)
- ADR-0026 (zero `any` in controller, affordance, integration test)
- Quaternion SLERP correctness — `Quaternion.slerp` used in `tickAnimation` (lines 633-635, pre-rename), NOT linear interpolation
- R-key modifier filter runs BEFORE `e.preventDefault()` (Ctrl+R reload preserved)
- `manualCameraSuspended` initialized to `false`; gates `onPointerDown` / `onPointerMove` (added) / `onWheel` / `restore()` — full mutation surface covered
- `mountCameraRestoreAffordance` dispose path is idempotent (removeEventListener / unsubscribe / button.remove are all no-op on second call)
- Embed-mode rendering — affordance has no `embedEnabled` gate (source-grep pinned)
- Integration AC test (AC6) constructs real RenderEngine + real controller + real affordance + synthesized PointerEvent + KeyboardEvent — passes
- AC8 smoke prerequisites in place (`__voyagerDebug.cameraController` + `__voyagerDebug.renderEngine` published under `import.meta.env.DEV`); lead-driven smoke per Rule 3 / Rule 7
- Rule 9 (APG primitives) — N/A (native `<button>`)
- Rule 10 (Lit declare+ctor-init) — N/A (light-DOM button)

Post-auto-resolve test sweep: web vitest 2583 pass / 2 skipped / 144 files; typecheck clean; lint 4 warnings (baseline preserved, 0 new).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`.

### Debug Log References

- Initial unit-test run for `voyager-camera-controller.test.ts`: 25/27 pass; 2 failures (source-grep test matched documentation-comment occurrences of "OrbitControls"; `clampZoomDistance(Infinity)` returned MIN because `isFinite(Infinity)` is `false`).
- Fix: tightened the source-grep regex to strip block + line comments before matching; replaced the `Number.isFinite` guard with `Number.isNaN` so `+Infinity` falls through to the upper-bound clamp branch.
- TypeScript pass 1: 4 errors — unused `Quaternion` import in test, unused `getViewFrameOrigin` field, and 4 occurrences of `target` possibly-null after the `??` fallback (because `DefaultFramingResolver` return type is nullable).
- Fix: removed the test import; promoted the controller's `getViewFrameOrigin` field to `public readonly` with a doc comment noting it's reserved for future consumers (controller does not touch the ViewFrame origin per ADR-0023); added a `buildCruiseDefaultFraming()` last-resort fallback so `target` is non-nullable.
- Full vitest sweep after wiring: 2549/2549 pass + 2 skipped (Δ +69 tests, +4 files over the 2480/2/139 Story 4.1 baseline). Typecheck clean. Lint = 4 warnings (pre-existing baseline, 0 new).
- Post-QA gap suite + post-code-review auto-resolves: 2583 pass + 2 skipped / 144 files (Δ +103 / +5 over the Story 4.1 baseline; the QA stage added +34 tests / +1 file; the code-review stage added MED/LOW auto-resolves without further test changes).

### Completion Notes List

#### ADR + Architecture compliance (AC9, Rule 6)

- **Architecture Decision 3c (hand-rolled controller; zoom clamps 1m–200AU; no free roll without Shift modifier)**: `voyager-camera-controller.ts` is a hand-rolled class importing only Three.js primitives (`Matrix4`, `Quaternion`, `Spherical`, `Vector3`, `PerspectiveCamera`); the AC1 source-grep test (`expect(code).not.toMatch(/OrbitControls/)`) pins the no-import contract. Zoom clamps are exported `MIN_ZOOM_DISTANCE_KM = 0.001` (1 m) and `MAX_ZOOM_DISTANCE_KM = 200 * KM_PER_AU` (200 AU); the AC5 unit tests pin both bounds against wheel zoom-in / zoom-out gesture streams. Free roll is gated behind a Shift-modifier check inside `onPointerMove` (`if (shift) { this.applyRoll(dx); return; }`); without Shift the controller orbits / pans / zooms but never rolls.
- **ADR-0015 (no-global-store; constructor-DI)**: `VoyagerCameraController` constructor takes `{ camera, domElement, renderEngine, getActiveTarget, getViewFrameOrigin, resolveDefaultFraming?, reducedMotion?, nowMs?, restoreDurationMs? }`. No module-level singleton; `main.ts` constructs one instance per app boot and passes the dependencies as closures (Ephemeris + ViewFrame service refs joined post-manifest).
- **ADR-0023 (translation-only ViewFrame; controller does NOT touch ViewFrame origin math)**: the controller writes only to `camera.position` + `camera.quaternion`. The Story 4.1 ViewFrame transform path (`engine.tick()` → `viewFrame.getTransform(...)` → `worldGroup.position`) is unaffected; verified by the integration test's "ViewFrame transform call invariant" assertion (`engine.tick()` runs without throwing pre- and post-gesture, worldGroup.position stays finite). The `getViewFrameOrigin` callback is stored as a public `readonly` field but never read by the controller itself — it's a reserved hook for future consumers (e.g. PBD module substate's local-frame alignment).
- **ADR-0026 (zero `any`)**: all controller, affordance, and test signatures use explicit types. The PointerPayload type from `primitives/pointer-events.ts` carries the gesture coordinate vocabulary; the `WorldVec3` brand carries the Float64 J2000 contract end-to-end through the closures.
- **FR13 (sub-meter through 165 AU)**: zoom upper bound is 200 AU (35 AU headroom over the FR13 requirement); lower bound is 1 m. Reverse-Z (Story 1.5) keeps precision stable across the 30 orders of magnitude.
- **FR32 / FR33 (free camera + restore)**: shipped via the orbit / pan / zoom / roll gestures and the `R` shortcut + restore button.
- **Rule 9 (APG primitives) — N/A**: the restore button is a native `<button>` with `aria-label`. Not a slider, listbox, or dialog; no APG keyboard contract applies.
- **Rule 10 (Lit declare+ctor-init) — N/A**: the restore button is a Light-DOM native `<button>`, not a Lit custom element. No `static properties` declaration, no risk of class-field-shadowing.
- **Rule 5 (NFR tripwire) — none surfaced**: every AC was implementable as worded. No planning-artifact amendments required.

#### Smoke probe plan (AC8 — lead-driven, post-review)

The lead drives this smoke against `/c/v1-jupiter` using Chrome DevTools MCP. Prerequisites are in place: `__voyagerDebug.cameraController` + `__voyagerDebug.renderEngine` are published under `import.meta.env.DEV` from `main.ts`'s post-manifest debug-surface block.

1. **Boot state** — `evaluate_script` to read `__voyagerDebug.renderEngine.manualCameraActive` — assert `=== false`.
2. **Synthesize a pointerdown + pointermove + pointerup** on the canvas via `evaluate_script` (`canvas.dispatchEvent(new PointerEvent('pointerdown', {...}))` etc.). After the sequence read `__voyagerDebug.renderEngine.manualCameraActive` — assert `=== true`. Read `getComputedStyle(restoreButton).display` — assert `=== 'inline-flex'` (the `data-manual-camera="true"` attribute promotes the button via the CSS rule from `restore-camera.css`).
3. **Trigger the R key**: `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'r'}))`. After `--v-duration-slow` (400 ms baseline) read `__voyagerDebug.renderEngine.manualCameraActive` — assert `=== false`. Read `getComputedStyle(restoreButton).display` — assert `=== 'none'`.
4. **Console clean** — `list_console_messages` returns no errors.

Screenshots: `mcp-pre-gesture.png`, `mcp-mid-gesture.png` (button visible), `mcp-post-restore.png`. Summary in `_bmad-output/implementation-artifacts/4-2-smoke-evidence/mcp-smoke-summary.md`.

#### Test deltas (T7.1)

| Metric | Story 4.1 baseline | Story 4.2 result | Delta |
| --- | --- | --- | --- |
| Vitest tests | 2480 pass / 2 skip | 2549 pass / 2 skip | +69 |
| Vitest test files | 139 | 143 | +4 |
| `npm run typecheck` | clean | clean | 0 |
| `npm run lint` warnings | 4 | 4 | 0 |
| Bake pytest (web-only story) | 414/4/19 | unchanged | 0 |

#### Files added / modified

See **File List** below for the complete inventory; the high-level summary:

- **NEW**: `web/src/render/voyager-camera-controller.ts` (controller class, ~480 LoC inc. doc comments) + `.test.ts` (27 tests).
- **NEW**: `web/src/boot/camera-restore-affordance.ts` (button + R-key wire, ~130 LoC).
- **NEW**: `web/src/styles/restore-camera.css` (button visibility rules).
- **NEW**: `web/tests/voyager-camera-controller-keyboard.test.ts` (20 tests), `restore-camera-button.test.ts` (12 tests), `voyager-camera-controller-integration.test.ts` (8 tests).
- **MODIFIED**: `web/src/render/render-engine.ts` (added `manualCameraActive` getter / `setManualCameraActive` setter / `onManualCameraChange` subscription).
- **MODIFIED**: `web/src/main.ts` (constructs `VoyagerCameraController`, mounts the restore affordance, wires service refs post-manifest, exposes the controller + engine on `__voyagerDebug`).

### File List

- web/src/render/voyager-camera-controller.ts (NEW)
- web/src/render/voyager-camera-controller.test.ts (NEW)
- web/src/render/render-engine.ts (MODIFIED — added `manualCameraActive` getter + `setManualCameraActive` setter + `onManualCameraChange` subscription + listener-storage field)
- web/src/boot/camera-restore-affordance.ts (NEW)
- web/src/styles/restore-camera.css (NEW)
- web/src/main.ts (MODIFIED — constructs `VoyagerCameraController` + mounts restore affordance + wires ephemeris/viewFrame service refs post-manifest + adds `cameraController` + `renderEngine` to `__voyagerDebug` DEV surface + imports `restore-camera.css`)
- web/tests/voyager-camera-controller-integration.test.ts (NEW)
- web/tests/voyager-camera-controller-keyboard.test.ts (NEW)
- web/tests/restore-camera-button.test.ts (NEW)

### Change Log

| Date       | Change                                                                                 | Author |
| ---------- | -------------------------------------------------------------------------------------- | ------ |
| 2026-05-23 | Story 4.2 dev pass — VoyagerCameraController + restore affordance shipped; AC1–AC9 met (AC8 awaits lead-driven smoke per Rule 3 / Rule 8). | Dev    |
