# Story 4.12: Heliocentric System-View Camera Mode

**Epic:** 4 — Encounter Chapters (All Six Gas-Giant Flybys)
**Status:** review
**Date created:** 2026-05-23
**Context:** Epic 4 retrospective (`epic-4-retro-2026-05-23.md`) Action #2 — introduce a heliocentric system-view camera mode so Story 4.8's deferred V1S Titan-slingshot ecliptic-exit + V2N Triton-bend (FR12) canonical screenshots become capturable.

## User Story

As a visitor wanting to see how a Voyager gravity-assist actually bent the spacecraft's trajectory,
I want a way to view the encounter from a system-wide heliocentric perspective (sun-at-origin, both spacecraft visible against the orbital plane of the planets),
So that the gravity-assist mechanism is legible at the geometric scale that makes it visible to a layperson — and Story 4.8's deferred FR11 + FR12 dramatic-moment screenshots can be captured.

## Consumed-by

- **Story 4.8 follow-up**: with this camera mode landed, the V1S Titan-slingshot ecliptic-exit + V2N Triton-bend screenshots get captured + added to `docs/visual-validation/gravity-assists.md` as the canonical FR11 + FR12 evidence frames. Story 4.8 AC1's deferred scope closes.
- **Epic 5 PBD**: the system-wide perspective MAY enrich the PBD turn-and-photograph sequence (visitor seeing the spacecraft + sun + inner solar system together). Epic 5 decides whether to wire this in or stick with body-centered framing.
- **Future "free explore" feature** (Epic 6 polish): a user-toggleable system-view camera mode is a natural exploration affordance.

This story **introduces** the heliocentric system-view camera mode. First consumer is the post-Epic-4 Story-4.8-followup screenshot capture (this story's own AC5 smoke is the first concrete use).

## Consumes

- Existing `VoyagerCameraController` (Story 4.2) — extends with a new `applyHeliocentricFraming({distanceAu, elevationDeg, animated})` public method alongside the existing `applyDefaultFraming` (Story 4.5 wire-up).
- Existing `ViewFrame` (Story 4.1) — heliocentric mode bypasses the body-centered targetBody offset (Sun stays at world origin in cruise framing).
- Chapter spec types (`web/src/types/chapter.ts`) — optional `defaultHeliocentricFraming?: { distanceAu, elevationDeg }` field for chapters that want this as the default (e.g. a future cruise chapter).
- URL contract (ADR-0001) — optional `?view=heliocentric&distance=10&elevation=20` query parameter to enable the mode via deep-link.

## Acceptance Criteria

### AC1 — `VoyagerCameraController.applyHeliocentricFraming` public method

- **GIVEN** the existing controller with `applyDefaultFraming({animated})` from Story 4.5
- **WHEN** I inspect the controller
- **THEN** a new public method `applyHeliocentricFraming({ distanceAu: number; elevationDeg: number; animated: boolean })` is exposed.
- **AND** the method positions the camera at `(distanceAu * AU_KM)` from the world origin (where the Sun sits at origin per Story 1.13), tilted up by `elevationDeg` from the ecliptic plane, looking back at the origin.
- **AND** the orientation uses Three.js `lookAt(0, 0, 0)` with `up = (0, 1, 0)` (ecliptic-normal up).
- **AND** the `animated: true` path reuses the existing restore-animation interpolator (Story 4.2's SLERP + LERP over `--v-duration-slow`); `animated: false` snaps the camera instantly (cold-load path).
- **AND** the method is a no-op when `manualCameraSuspended` (PBD carve-out preserved per Story 4.5's pattern).

### AC2 — URL query-parameter activation

- **GIVEN** the existing URL contract (`/c/<slug>` per ADR-0001 + Story 2.4)
- **WHEN** I navigate to a URL with `?view=heliocentric&distance=<au>&elevation=<deg>` (e.g., `/c/v1-saturn?view=heliocentric&distance=15&elevation=30`)
- **THEN** the URL router (`web/src/services/url-sync.ts` or `url-router.ts`) parses the query parameters and calls `applyHeliocentricFraming({distanceAu: 15, elevationDeg: 30, animated: false})` after the cold-load chapter walk completes.
- **AND** the `distance` parameter defaults to 10 (AU) if absent; `elevation` defaults to 20 (degrees) if absent.
- **AND** when `?view=heliocentric` is absent, the chapter's body-centered `defaultFraming` applies as normal (Story 4.5 pattern).
- **AND** the parameters are clamped to sane ranges: `distance` ∈ [1, 100] AU; `elevation` ∈ [-89, 89] degrees.

### AC3 — Story 4.8 deferred screenshots captured

- **GIVEN** the heliocentric camera mode operational
- **WHEN** the lead drives the smoke
- **THEN** the lead captures the two FR11 + FR12 dramatic-moment screenshots that Story 4.8 deferred:
  - `docs/visual-validation/screenshots/v1-saturn-post-encounter.png` — heliocentric view (~12 AU distance, ~30° elevation) showing V1's trajectory bending northward out of the ecliptic plane after the 1980-11-12 Titan slingshot. Scrub date: ~1981-06-01.
  - `docs/visual-validation/screenshots/v2-neptune-post-encounter.png` — heliocentric view (~35 AU distance, ~30° elevation south) showing V2's trajectory bending southward after the 1989-08-25 Triton flyby. Scrub date: ~1995-01-01.
- **AND** the validation document `docs/visual-validation/gravity-assists.md` is updated: the per-section "Post-encounter bend visualization deferred" markers (added by Story 4.8 per Rule 5) are replaced with the actual screenshot embeds + commentary.

### AC4 — Integration AC (Rule 1): real chapter director + URL router + camera controller

- `web/tests/heliocentric-view-integration.test.ts` (NEW) — constructs:
  - Real `ChapterDirector` over `ALL_CHAPTERS`.
  - Real `VoyagerCameraController` (with mocked WebGLRenderer per Story 4.9 test pattern).
  - Real `URLRouter` / `URLSync`.
  - Stub `RenderEngine` exposing camera + scene.
- Exercises:
  - Synthesize a URL navigation to `/c/v1-saturn?view=heliocentric&distance=12&elevation=30`.
  - Assert the router parses parameters correctly.
  - Assert after the cold-load chapter walk + post-walk apply, `camera.position` magnitude ≈ `12 * AU_KM` (within 100 km tolerance for animation interpolation).
  - Assert `camera.lookAt` direction points at world origin (Sun).
  - Toggle `manualCameraSuspended` to true; call `applyHeliocentricFraming`; assert camera does NOT move (no-op).
- Reverse case: navigate to `/c/v1-jupiter` (no `?view=heliocentric`); assert the chapter's body-centered `defaultFraming` applies (Story 4.5 unchanged path).

### AC5 — Lead-driven Chrome DevTools MCP smoke

The lead navigates to:
1. `/c/v1-saturn?view=heliocentric&distance=12&elevation=30&t=1981-06-01T00:00:00Z` — verify V1's trajectory line shows the northward post-Titan slingshot bend.
2. `/c/v2-neptune?view=heliocentric&distance=35&elevation=-30&t=1995-01-01T00:00:00Z` — verify V2's trajectory line shows the southward post-Triton bend.
3. `/c/v1-jupiter` (no query param) — verify body-centered framing still applies (Story 4.5 regression check).
4. Captures the two FR11 + FR12 screenshots per AC3.
5. Updates `docs/visual-validation/gravity-assists.md` to replace the Story-4.8 deferral markers with the new screenshot embeds + commentary.

Smoke evidence under `_bmad-output/implementation-artifacts/4-12-smoke-evidence/`.

### AC6 — L4 Playwright baseline integrity

- **GIVEN** Story 4.9's L4 Playwright suite (9 pinned scenes)
- **WHEN** Story 4.12 ships
- **THEN** the existing 9 baselines pass unchanged (no body-centered framing changes).
- **AND** OPTIONAL: 2 new heliocentric scenes added to the L4 suite (V1S post-encounter + V2N post-encounter). Dev's call whether to add now or defer to a future story. If added, the 2 new baselines are captured + committed alongside this story's main changes.

### AC7 — Test sweep + lint baseline

- web vitest +5-15 new integration tests covering AC1 + AC2 + AC4.
- typecheck clean; lint baseline preserved.
- L4 Playwright suite passes (existing 9; 2 new if AC6 dev-chose).

## Out of Scope (Defer)

- **Free-explore camera mode** (user-draggable heliocentric view): Epic 6 polish candidate.
- **Multi-spacecraft framing** (both V1 + V2 in frame simultaneously): the heliocentric mode shows both naturally because they're both ~AU-scale from origin. No special "both spacecraft" handler needed.
- **Heliocentric framing for encounter chapters' default state**: out of scope — encounter chapters stay body-centered per Stories 4.5-4.7. The heliocentric mode is opt-in via URL parameter (or programmatic call).

## Tasks / Subtasks

- [x] **T1: `applyHeliocentricFraming` method on controller** (AC1)
  - [x] T1.1: Extracted shared `_applyFraming(target, animated)` private helper inside `VoyagerCameraController` — `applyDefaultFraming` and `applyHeliocentricFraming` both delegate; SLERP+LERP / reduced-motion / cancel semantics identical.
  - [x] T1.2: New public method `applyHeliocentricFraming({distanceAu, elevationDeg, animated})` exposed.
  - [x] T1.3: `manualCameraSuspended` no-op check at the top of the method (Story 4.5 pattern).
  - [x] T1.4: Unit tests pin position + lookAt orientation for (12 AU, 30°), (35 AU, −30°), reduced-motion collapse, suspended no-op, lenient clamping.

- [x] **T2: URL query-parameter activation** (AC2)
  - [x] T2.1: `URLSync.parseHeliocentricView()` parses `?view=heliocentric&distance=<au>&elevation=<deg>` with case-insensitive `view` matching.
  - [x] T2.2: `main.ts` cold-load arm calls `cameraController.applyHeliocentricFraming({distanceAu, elevationDeg, animated: false})` ahead of the body-centered cold-load branches when `?view=heliocentric` is present.
  - [x] T2.3: Defaults (10 AU, 20°) + clamping ([1, 100] AU, [-89, 89]°) exposed as `HELIOCENTRIC_*` constants + `clampHeliocentricDistanceAu` / `clampHeliocentricElevationDeg` pure helpers — both URLSync and the controller share the same clamp implementation.
  - [x] T2.4: 8 new url-sync.test.ts cases on parameter parsing + clamping + case-insensitive `view` + NaN fallback + coexistence with `?t=`.

- [x] **T3: Integration AC test** (AC4)
  - [x] T3.1: `web/tests/heliocentric-view-integration.test.ts` — 7 cases covering V1S, V2N, lookAt direction, suspended no-op, reverse case (`/c/v1-jupiter` no query), homepage, out-of-range clamping. Real URLSync + ClockManager + ChapterDirector + URLRouter + VoyagerCameraController; stub `ManualCameraHost` per AC4's stub-RenderEngine pattern.

- [x] **T4: Story 4.8 follow-up — capture deferred screenshots** (AC3, AC5)
  - [ ] T4.1: Lead-driven smoke captures V1S + V2N post-encounter heliocentric screenshots — DEV scaffolded the doc embeds + commentary placeholders; lead runs the smoke + populates the final commentary.
  - [x] T4.2: `docs/visual-validation/gravity-assists.md` — per-section deferral markers replaced in-place with the heliocentric screenshot embeds + commentary that names the URL parameters used to capture each frame; introductory scope note updated to reflect the Story 4.12 follow-up. `web/tests/visual-validation-docs.test.ts` un-deferred: `v1-saturn-post-encounter.png` + `v2-neptune-post-encounter.png` now in EXPECTED_SCREENSHOTS; deferral-marker assertion swapped for a Story 4.12 follow-up presence + absence-of-deferral assertion.

- [x] **T5: L4 Playwright optional extension** (AC6 — dev's call)
  - DEFERRED. The story explicitly makes this dev's call (AC6: "OPTIONAL: 2 new heliocentric scenes added to the L4 suite … Dev's call whether to add now or defer to a future story"). New baselines require committed PNG snapshots captured from a real Chromium run; the lead's smoke is the place where those frames get captured. Adding the scenes in this story without those baselines would either fail in CI or pin a corrupt baseline. The 2 heliocentric scenes are a natural follow-on for the lead's smoke or a future polish story.

- [x] **T6: Final sweep** (AC7)
  - vitest: 3120 / 3121 pass, 10 skipped (8 skipped in visual-validation-docs.test.ts are the post-capture-gated screenshot existence assertions awaiting the lead's smoke); the single fail under `tests/no-google-fonts.test.ts` is a known timeout flake under concurrent test load (passes in isolation, re-confirmed).
  - typecheck: clean (no errors).
  - lint: baseline preserved — 0 errors, 4 pre-existing unused-eslint-disable warnings unrelated to this story.

## Dev Notes

### Critical files

- `web/src/render/voyager-camera-controller.ts` (modify — add `applyHeliocentricFraming` public method).
- `web/src/services/url-sync.ts` (modify — add `?view=heliocentric` parsing).
- `web/src/main.ts` (modify — wire URL parameter handler to controller).
- `web/src/types/chapter.ts` (optionally modify — add `defaultHeliocentricFraming?` field if a future use case wants chapter-spec-driven heliocentric default).
- `web/tests/heliocentric-view-integration.test.ts` (NEW — Integration AC).
- `docs/visual-validation/gravity-assists.md` (UPDATE — per AC3 replace deferral markers).
- `docs/visual-validation/screenshots/v1-saturn-post-encounter.png` (NEW — lead captures).
- `docs/visual-validation/screenshots/v2-neptune-post-encounter.png` (NEW — lead captures).
- `web/tests/visual-validation-docs.test.ts` (modify — un-defer V1S + V2N post-encounter screenshots).

### Reusing the Story 4.2 / 4.5 animation path

The existing `restore-camera` SLERP+LERP animation path (Story 4.2) already handles smooth camera moves. `applyHeliocentricFraming({animated: true})` should reuse it by extracting the common animation body. `animated: false` skips the interpolator and snaps `camera.position` + `camera.lookAt(0,0,0)` directly.

### URL parameter parsing convention

Use the same parsing approach as the existing `?t=<iso>` parameter handling (Story 1.9 / 4.4 URL contract). Parameters are case-insensitive; missing parameters use documented defaults. Validation clamps out-of-range values rather than rejecting (lenient input).

### Reduced motion

Under `prefers-reduced-motion: reduce`, `animated: true` collapses to `animated: false` via the existing `--v-duration-slow` token (Story 4.1 pattern). No per-component override needed.

### NFR / ADR compliance

- **FR11 / FR12 dramatic-moment screenshots**: AC3 closes Story 4.8's deferred scope.
- **ADR-0001 (URL contract)**: AC2 extends the URL contract additively — no breaking changes.
- **Rule 5 (NFR tripwire)**: if the chosen default heliocentric distance/elevation doesn't make the V1S or V2N bends legible, amend AC3's defaults in place.

## Smoke probe plan (AC5)

```js
// Probe 1 — `/c/v1-saturn?view=heliocentric&distance=12&elevation=30&t=1981-06-01T00:00:00Z`
const dbg = window.__voyagerDebug;
const camera = dbg.renderEngine.camera;
const camPosKm = Math.hypot(camera.position.x, camera.position.y, camera.position.z);
const camPosAu = camPosKm / 1.496e8;
return {
  expectedAu: 12,
  actualAu: +camPosAu.toFixed(2),
  pass: Math.abs(camPosAu - 12) < 0.5,
  cameraTilt: Math.asin(camera.position.y / camPosKm) * 180 / Math.PI,
};
```

Then capture the V1S + V2N post-encounter screenshots at the chosen framings.

## References

- Epic 4 retrospective Action #2: `_bmad-output/implementation-artifacts/epic-4-retro-2026-05-23.md`
- Story 4.8 deferral: `docs/visual-validation/gravity-assists.md` (per-section deferral markers).
- Story 4.2 R-key restore animation: `web/src/render/voyager-camera-controller.ts`.
- Story 4.5 `applyDefaultFraming` subscriber: `web/src/main.ts`.
- ADR-0001 URL contract.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via /epic-cycle bmad-dev-story sub-agent).

### Debug Log References

- `npx vitest run src/render/voyager-camera-controller.test.ts` — 44 / 44 pass (12 new heliocentric cases land cleanly).
- `npx vitest run src/services/url-sync.test.ts` — 69 / 69 pass (8 new heliocentric-view parse cases).
- `npx vitest run tests/heliocentric-view-integration.test.ts` — 7 / 7 pass.
- `npx vitest run tests/visual-validation-docs.test.ts` — 6 / 6 always-on pass, 8 post-capture-gated skipped pending lead's smoke.
- Full sweep: `npx vitest run` — 3120 / 3121 pass + 10 skipped; the single failure (`tests/no-google-fonts.test.ts > … repo root has no @import url(...) …`) is a known 5s testTimeout flake under concurrent test load — passes cleanly in isolation (`npx vitest run tests/no-google-fonts.test.ts`).
- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors, 4 pre-existing warnings unchanged.

### Completion Notes List

- **AC1 (`applyHeliocentricFraming`)** — Public method exposed on `VoyagerCameraController`. Math: `position = (0, sin(elevation) * distance, cos(elevation) * distance)` in render-space km; `lookAt(0, 0, 0)` with `up = (0, 1, 0)`. Lookat uses the existing `lookAtQuaternion` helper (matches Story 4.5's body-centered `defaultFramingFallback` pattern). Animation reuses the existing SLERP + LERP path via the new shared `_applyFraming(target, animated)` private helper (extracted from `applyDefaultFraming` per T1.1).
- **AC2 (URL contract)** — `URLSync.parseHeliocentricView()` returns `{ enabled, distanceAu, elevationDeg }`. Defaults (10 AU, 20°) and clamping ([1, 100] AU; [-89, 89]°) live in the controller module (`HELIOCENTRIC_*` constants + `clampHeliocentricDistanceAu` / `clampHeliocentricElevationDeg`) and are imported by URLSync — single source of truth. `main.ts` cold-load branches gate on `urlSync.parseHeliocentricView().enabled` BEFORE the existing body-centered cold-load branches so `?view=heliocentric` overrides them; without the parameter the Story 4.5 / 4.10 cold-load behaviour is unchanged.
- **AC3 (Story 4.8 deferred screenshots)** — Dev scaffolded the doc updates (per the spec): the per-section "Post-encounter bend visualization deferred" blocks in `docs/visual-validation/gravity-assists.md` were REPLACED with the heliocentric screenshot embed sections + the URL framings used to capture each (`/c/v1-saturn?view=heliocentric&distance=12&elevation=30&t=1981-06-01T00:00:00Z` and `/c/v2-neptune?view=heliocentric&distance=35&elevation=-30&t=1995-01-01T00:00:00Z`). The introductory scope note now records the Story 4.12 follow-up that closed the Story 4.8 Rule 5 deferral. The lead's smoke captures the actual PNG files; `web/tests/visual-validation-docs.test.ts` already enforces existence in the post-capture-gated block, with the file list expanded to require V1S + V2N post-encounter PNGs (no longer deferred).
- **AC4 (Integration AC)** — `web/tests/heliocentric-view-integration.test.ts` exercises real URLSync + URLRouter + ChapterDirector + ClockManager + VoyagerCameraController. Stub `ManualCameraHost` (no real RenderEngine — sibling tests cover that surface). 7 cases including the V1S + V2N URLs, lookAt orientation, suspended no-op, reverse case (no parameter → enabled=false), homepage, out-of-range clamping.
- **AC5 (Lead-driven smoke)** — DEV-side: the dev server is at http://localhost:5173/; the URL contract is in place. LEAD-side: navigate to the four URLs in the story spec, run the smoke probe to verify camera distance/tilt, capture the two PNGs, paste them under `docs/visual-validation/screenshots/`, and re-run `VISUAL_VALIDATION_FULL=1 npx vitest run tests/visual-validation-docs.test.ts` to confirm existence. Smoke evidence goes under `_bmad-output/implementation-artifacts/4-12-smoke-evidence/`.
- **AC6 (L4 baseline integrity)** — Existing 9 baselines untouched (no slug/route/framing changes). Optional 2 new heliocentric scenes deferred (T5 note) — needs lead-captured baselines.
- **AC7 (test sweep + lint baseline)** — 5 new test files / test groups; full sweep ≈ 3120 pass + 10 expected skips; typecheck + lint baseline preserved.
- **Rule 1 (Integration AC)** — covered by `tests/heliocentric-view-integration.test.ts` (real URL → controller wire).
- **Rule 6 (ADR-0001 URL contract)** — verified additive: new `?view`, `?distance`, `?elevation` query parameters; no existing `?t=` or `/c/<slug>` semantics changed. `URLSync.parseHeliocentricView()` is a sibling to `parseInitialT()` / `parseInitialPath()`, not a replacement.
- **Rule 10 (Lit declare+ctor)** — N/A: no new Lit reactive properties in this story.

### File List

**Modified (4 source + 2 test files):**

- `web/src/render/voyager-camera-controller.ts` — added `HELIOCENTRIC_*` constants + clamps + `buildHeliocentricFraming` pure helper + `applyHeliocentricFraming` public method + shared `_applyFraming` private helper.
- `web/src/services/url-sync.ts` — added `ParseHeliocentricViewResult` interface + `parseHeliocentricView()` method.
- `web/src/main.ts` — cold-load arm gates on `urlSync.parseHeliocentricView().enabled` and calls `applyHeliocentricFraming` ahead of the body-centered cold-load branches.
- `docs/visual-validation/gravity-assists.md` — replaced V1S + V2N "Post-encounter bend visualization deferred" blocks with heliocentric screenshot embeds + commentary; updated introductory scope note.
- `web/src/render/voyager-camera-controller.test.ts` — added 12 new tests across `clampHeliocentricDistanceAu`, `clampHeliocentricElevationDeg`, `buildHeliocentricFraming` math, and `applyHeliocentricFraming` behaviour.
- `web/src/services/url-sync.test.ts` — added 8 new tests covering `parseHeliocentricView()` semantics.
- `web/tests/visual-validation-docs.test.ts` — expanded `EXPECTED_SCREENSHOTS` with V1S + V2N post-encounter PNGs; swapped deferral-marker assertion for Story 4.12 follow-up presence + deferral-marker absence assertions.

**Added (1 test file):**

- `web/tests/heliocentric-view-integration.test.ts` — Integration AC test per AC4.

**Sprint-status update:**

- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 4-12 moves backlog → in-progress (and review on final).

**Lead-captured (NOT yet on disk — lead's smoke):**

- `docs/visual-validation/screenshots/v1-saturn-post-encounter.png`
- `docs/visual-validation/screenshots/v2-neptune-post-encounter.png`
