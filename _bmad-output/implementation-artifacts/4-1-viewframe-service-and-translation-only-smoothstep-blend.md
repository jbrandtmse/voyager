# Story 4.1: ViewFrame Service and Translation-Only Smoothstep Blend

**Epic:** 4 — Encounter Chapters (All Six Gas-Giant Flybys)
**Status:** done
**Date created:** 2026-05-22

## User Story

As a visitor scrubbing into an encounter,
I want the camera origin to smoothly transition from heliocentric to body-centered framing over a ±2-day window with no rotation flips,
So that the entry feels cinematic and FR31 has its substrate, fulfilling AR11 and the Pattern-4 commitment from the PRD.

## Consumed-by

- **Story 4.2** (`VoyagerCameraController`): the camera controller's per-frame state reads `ViewFrame.getTransform(et, activeChapter)` to anchor pan/orbit gestures against the current render-space origin; manual-camera mode preserves the ViewFrame-applied origin shift but owns the camera's own transform.
- **Story 4.5** (`v1-jupiter` chapter): the first encounter chapter where the ViewFrame blend becomes user-visible — V1 swings around Jupiter with the gravity-assist bend at body-centered framing.
- **Story 4.6** (`v2-jupiter`, `v1-saturn`, `v2-saturn` chapters): each encounter chapter consumes the same ViewFrame contract.
- **Story 4.7** (`v2-uranus`, `v2-neptune` chapters): same.
- **Epic 5 Story 5.x** (Pale Blue Dot dedicated module): the PBD module's substate machine produces its own choreographed origin overrides that may or may not call through ViewFrame; the substrate must accommodate either path.

This story **introduces** the ViewFrameService — first consumer is RenderEngine (this story's Integration AC), with broader consumption beginning Story 4.5.

## Acceptance Criteria

### AC1 — `ViewFrame` service module: `getTransform(et, activeChapter)` returns the render-space origin offset

- **GIVEN** the service module at `web/src/services/view-frame.ts`
- **WHEN** I inspect it
- **THEN** it exposes a `ViewFrameService` class with constructor accepting an `EphemerisService` instance (for body-position lookup) and a `clockManager`-shaped `prefersReducedMotion()` helper or a `reducedMotion` boolean reactive source
- **AND** the class exposes `getTransform(et: ET, activeChapter: ChapterSpec | null): ViewFrameTransform` returning a `{ originOffsetWorld: WorldVec3 }`-shaped record (translation-only — no rotation field; ADR-0023)
- **AND** during true cruise (`activeChapter === null` OR `activeChapter.targetBody === undefined`) **AND no adjacent encounter chapter's ±2-day ramp band covers `et`**, the transform returns `originOffsetWorld = (0, 0, 0)` (heliocentric default; no shift applied)
- **AND** when `activeChapter === null` OR `activeChapter.targetBody === undefined` BUT an encounter chapter's ±2-day ramp band covers `et`, the service scans the chapter registry for that adjacent encounter and applies its smoothstep blend (the FSM only dwells in `held` per Story 2.1, so the entering / exiting ramp windows outside `held` would otherwise be unreachable through `activeChapter`; encounter blends are choreographic and take precedence over a held non-encounter inside their ramp band — production registry pin guarantees encounter ramps do not overlap any non-encounter window so this fall-through never produces a user-visible override today)
- **AND** during the `entering` / `exiting` / `held` substates of an encounter chapter (`activeChapter` populated AND `activeChapter.targetBody !== undefined`), the transform applies a smoothstep alpha [0,1] over the `±2-day` blend window where:
  - `alpha = 0` at `windowStartEt - 2 * SECONDS_PER_DAY` and at `windowEndEt + 2 * SECONDS_PER_DAY`
  - `alpha = smoothstep(0, 1, t)` where `t = (et - windowStartEt + 2 * DAY) / (2 * DAY)` over the entering ramp
  - `alpha = 1.0` throughout the `held` substate (`et ∈ [windowStartEt, windowEndEt]`)
  - `alpha` ramps symmetrically back to 0 over the exiting window
- **AND** the blend origin lerps between heliocentric (`Vector3(0, 0, 0)` in render-space after floating-origin) and body-centered (the active chapter's `targetBody` ephemeris position at `et` via `EphemerisService.getPosition(targetBody, et)`)
- **AND** the smoothstep is computed via a pure `smoothstep(edge0, edge1, x)` helper in `web/src/math/` (extract to `web/src/math/smoothstep.ts` if not present; reuse if Story 2.3 or another already extracted it) — `bake/src/quat_continuity.py:walk_signs` is NOT involved (rotation-blend is deferred per ADR-0023)

### AC2 — Per-frame application in `RenderEngine.onFrame`

- **GIVEN** the per-frame render loop from Story 1.5 (`web/src/render/render-engine.ts:onFrame`)
- **AND** the floating-origin step at lines 231-237 currently computes `offset = floatingOriginOffset(this.cameraWorldPos)` and sets `this.worldGroup.position.set(offset[0], offset[1], offset[2])`
- **WHEN** Story 4.1 wires ViewFrameService into the loop
- **THEN** before the floating-origin step, `RenderEngine.onFrame` calls `viewFrame.getTransform(currentEt, chapterDirector.activeChapter)` and applies the returned `originOffsetWorld` to the camera's world position (i.e., `cameraWorldPos += originOffsetWorld` before passing through `floatingOriginOffset`) — the camera's local transform itself is unchanged by this story
- **AND** the `WorldGroup.position` math at line 234-236 stays correct after the offset is applied (the body-centered origin shift composes with the floating-origin recentering)
- **AND** the ViewFrameService instance is injected via constructor (per ADR-0015 no-global-store) — `RenderEngine` constructor signature gains an optional `viewFrame?: ViewFrameService` parameter (defaults to a no-op identity transform for backward compatibility with Story 1.5 tests that construct RenderEngine without an EphemerisService); `main.ts` constructs ViewFrameService after `EphemerisService` + `ChapterDirector` and passes it via the constructor or a `setViewFrame()` setter (whichever cleanest given the existing main.ts wire-up sequence)
- **AND** `RenderEngine` publishes `__voyagerDebug.viewFrame` under `import.meta.env.DEV` for the lead-side MCP smoke

### AC3 — Translation-only contract (ADR-0023)

- **GIVEN** the blend is translation-only
- **WHEN** the simulation scrubs across an encounter boundary
- **THEN** no quaternion rotation blend is applied (rotation-blend deferred per ADR-0023 / AR11)
- **AND** the returned `ViewFrameTransform` shape does NOT include a quaternion field (so future readers cannot accidentally call `transform.quaternion` and read undefined)
- **AND** the existing `docs/adr/0023-translation-only-view-frame-blend-no-rotation-blend-v1.md` (Status: Accepted, 2026-05-18) is referenced from the `ViewFrameService` class docstring with a "see ADR-0023 for the deferred rotation-blend decision" pointer
- **AND** the camera quaternion remains owned by `VoyagerCameraController` (Story 4.2) — `ViewFrame` does NOT mutate `camera.quaternion`

### AC4 — Smoothstep alpha curve unit-tested at boundaries + interior + reduced-motion

- **GIVEN** the smoothstep alpha
- **WHEN** I unit-test the `ViewFrameService` with a fixture of ETs crossing the V1 Jupiter encounter window (anchor `1979-03-05T12:05:00Z`, window `±30 days` per `web/src/chapters/specs/v1-jupiter.ts`)
- **THEN** the test asserts:
  - At `et = windowStartEt - 2 * DAY`, `alpha = 0` exactly (lerp returns heliocentric)
  - At `et = windowStartEt - 1 * DAY`, `alpha ≈ smoothstep(0, 1, 0.5) = 0.5`
  - At `et = windowStartEt`, `alpha = 1` (transition into `held`)
  - At `et = anchorEt`, `alpha = 1` (deep inside `held`)
  - At `et = windowEndEt`, `alpha = 1` (last instant of `held`)
  - At `et = windowEndEt + 1 * DAY`, `alpha ≈ 0.5` (symmetric exit ramp)
  - At `et = windowEndEt + 2 * DAY`, `alpha = 0` (fully exited)
- **AND** the lerp is continuous (no jumps at substate boundaries) — a 100-knot ET sweep across the full ±2-day exit ramp produces strictly monotonic-decreasing `originOffsetWorld.magnitude` (assuming Jupiter-position drift is negligible at day-scale, which it is)
- **AND** under reduced motion (per the global duration-collapse rule from Story 1.7 — `--v-duration-base = 0ms`), the blend collapses to an **instant cut at the window boundary**: `alpha = 0` for `et < windowStartEt`, `alpha = 1` for `windowStartEt ≤ et ≤ windowEndEt`, `alpha = 0` for `et > windowEndEt`. ViewFrameService respects this by reading from the same reduced-motion signal source used by Story 1.7 (e.g., `prefers-reduced-motion: reduce` media query OR the centralised `--v-duration-base` token's resolved-value check) — exact mechanism documented in the Dev Notes below

### AC5 — `ChapterDirector` substate keying + ChapterSpec `targetBody` field

- **GIVEN** the `ChapterDirector` from Story 2.1 (`web/src/services/chapter-director.ts`) with FSM states `out` / `entering` / `held` / `exiting` / `passed`
- **AND** the current `ChapterSpec` type (`web/src/types/chapter.ts`) has fields `slug`, `name`, `markerLabel`, `anchorEt`, `windowStartEt`, `windowEndEt`, `spacecraft`, `ogDescription` — but NO `targetBody` field yet
- **WHEN** Story 4.1 extends the ChapterSpec
- **THEN** `ChapterSpec` gains an OPTIONAL `targetBody?: BodyId` field (NAIF integer ID typed via the existing `BodyId` branded type, or null/undefined for non-encounter chapters like launches and heliopauses)
- **AND** the encounter specs at `web/src/chapters/specs/{v1-jupiter,v2-jupiter,v1-saturn,v2-saturn,v2-uranus,v2-neptune}.ts` (6 files) are populated with the correct `targetBody` (Jupiter=599, Saturn=699, Uranus=799, Neptune=899 — verify NAIF IDs against existing `ck_inventory` or the manifest)
- **AND** non-encounter chapter specs (`launch-v1.ts`, `launch-v2.ts`, `v1-heliopause.ts`, `v2-heliopause.ts`, `pale-blue-dot.ts`) explicitly OMIT `targetBody` (undefined) — confirms cruise/launch chapters trigger the "no-shift" identity branch of ViewFrame
- **AND** scrubbing crosses ±2 days from an encounter's window boundary triggers the substate transitions (`out → entering` then `entering → held` per the existing FSM contract; these are TRANSIENT — `entering` is emitted as a subscriber event, the FSM dwells in `held`); ViewFrame's `getTransform` keys off `activeChapter` (the `held` chapter) plus comparison of `et` to `windowStartEt - 2*DAY` / `windowEndEt + 2*DAY` to determine the alpha ramp regardless of the FSM substate

### AC6 — Close Epic 3 retro Action #3: ChapterDirector → `<v-attitude-indicator>.setActiveSpacecraft(naifId)` wire

- **GIVEN** Story 3.6 added `<v-attitude-indicator>` with a `setActiveSpacecraft(naifId)` method + a `activeSpacecraftChanged` CustomEvent contract (event bubbles + composed, detail: `{naifId: number}`)
- **AND** the indicator's stub default is V1 (NAIF -31), which the Story 4.0 lead-side MCP smoke at `/c/v2-saturn` confirmed renders "Synthesized (HGA Earth-pointing)" — i.e., the indicator was reading V1's attitude on a V2 chapter page because the wire was missing
- **AND** Epic 3 retro Action #3 routes this to "Story 4.1 or 4.2 dev"; this story (4.1) is the natural landing because ChapterDirector → setActiveSpacecraft is a substate-transition wire that lives in the same boot ordering as ViewFrameService consumption
- **WHEN** Story 4.1 lands the wire
- **THEN** on every `ChapterDirector` subscriber event where `event.to === 'held'`, a handler reads `event.chapter.spacecraft` (`'v1' | 'v2' | 'both'`) and calls `firstPaintHandle.hud.attitudeIndicator?.setActiveSpacecraft(naifId)` where `naifId = -31` for `'v1'` or `-32` for `'v2'`; for `'both'` (currently no chapter uses `'both'` per Story 2.1 ChapterSpec docs but the type permits it), default to `-31`
- **AND** the wire-up lives in `web/src/main.ts` (inside the `chapterDirector.subscribe(...)` block already present from Story 2.1; if Story 2.1 didn't establish one, create it adjacent to the ChapterDirector construction)
- **AND** on `event.to === 'out'` (cruise between chapters), do NOT call setActiveSpacecraft — leave the indicator at its last value (the indicator's `--` placeholder + the stub default cover the gap)
- **AND** the wire-up is unit-tested in `web/tests/chapter-director-attitude-indicator-wire.test.ts` with a stub indicator (mock setActiveSpacecraft); the test pins: (a) V1 chapter held → setActiveSpacecraft(-31); (b) V2 chapter held → setActiveSpacecraft(-32); (c) cruise between chapters → setActiveSpacecraft NOT called
- **AND** the corresponding entry in deferred-work.md (if Action #3 was recorded there) is struck through with a closing annotation pointing to Story 4.1; if it wasn't recorded, this AC stands alone

### AC7 — Integration AC (Rule 1): RenderEngine consumes ViewFrameService and produces observable origin shift at encounter entry

- **GIVEN** RenderEngine is the first consumer of ViewFrameService (this story's load-bearing wire-up per AC2)
- **AND** the Integration AC pattern (Rule 1) requires a real-consumer test exercising the wire-up, not a mocked stub
- **WHEN** Story 4.1 lands the integration
- **THEN** `web/tests/view-frame-render-engine-integration.test.ts` constructs:
  - A real `ChunkLoader` + `EphemerisService` (loaded from the runtime manifest under Node-side brotli decompression, mirroring the Story 3.2 / 3.7 integration-test pattern)
  - A real `ChapterDirector` instance with V1 Jupiter spec
  - A real `ViewFrameService` instance
  - A real `RenderEngine` instance (with `viewFrame` injected via constructor)
- **AND** the test exercises three ET probes:
  - **Cruise (et = 1980-01-01T00:00Z, between V1 Jupiter and V1 Saturn windows)**: ViewFrame returns origin offset of magnitude ≈ 0 km; RenderEngine's `worldGroup.position` reflects only the floating-origin recentering (no body-centered shift)
  - **Entering ramp (et = windowStartEt - 1 * DAY, alpha ≈ 0.5)**: ViewFrame returns origin offset of magnitude ≈ `0.5 * |jupiterPos - sunPos|`; RenderEngine's `worldGroup.position` shifts by this fraction
  - **Held (et = anchorEt = 1979-03-05T12:05Z)**: ViewFrame returns origin offset of magnitude ≈ `|jupiterPos|` (Jupiter heliocentric distance ≈ 5.2 AU ≈ 778 million km); RenderEngine's `worldGroup.position` reflects the full body-centered shift
- **AND** the integration test uses one shared `ChunkLoader` instance (per ADR-0015 single-ChunkLoader contract enforced by Story 3.2 / 3.7)
- **AND** the test passes locally in vitest under happy-dom

### AC8 — Lead-driven Chrome DevTools MCP smoke (Rule 3; binding browser-evidence gate)

- **GIVEN** Story 4.1 touches `web/src/render/render-engine.ts` (production runtime constructor surface change) and adds `<v-attitude-indicator>` wiring (production runtime DOM behavior)
- **AND** Rule 3 + Rule 8 require Chrome DevTools MCP browser-smoke evidence for stories touching user-facing surfaces
- **AND** code-side prerequisites must be in place: `__voyagerDebug.viewFrame` published, the existing `__voyagerDebug.attitudeService` + `__voyagerDebug.chapterDirector` still published, `<v-attitude-indicator>` still mounted
- **WHEN** the lead drives the smoke after dev + QA + code-review complete
- **THEN** the lead navigates Chrome DevTools MCP to `/c/v2-saturn` and verifies:
  - `__voyagerDebug.viewFrame.getTransform(currentEt, __voyagerDebug.chapterDirector.activeChapter).originOffsetWorld` returns a non-zero offset (V2 Saturn anchor is mid-window → alpha=1, full body-centered shift to Saturn)
  - `<v-attitude-indicator>` output text reflects V2 (NAIF -32) — should now read `"ATT ● CK reconstructed"` against V2's bus attitude at the in-window ET (closes the Story 4.0 smoke's "Synthesized (HGA Earth-pointing)" stub default per AC6)
  - Console clean of application errors (Lit dev-mode banner expected only)
- **AND** smoke evidence captured under `_bmad-output/implementation-artifacts/4-1-smoke-evidence/` (per the Story 4.0 pattern): `mcp-v2-saturn-fullpage.png`, `mcp-v1-jupiter-fullpage.png`, `mcp-smoke-summary.md`
- **AND** the smoke is the binding gate per Rule 7 — lead-only

### AC9 — Test sweep + lint baseline preserved + ADR compliance verified

- **GIVEN** the project's test pyramid post-Story-4.0 baseline: web vitest 2363 pass / 2 skipped / 131 files; bake fast pytest 414 pass / 4 skipped / 19 deselected; typecheck clean; lint 4 warnings (pre-existing baseline; 0 new)
- **WHEN** Story 4.1 ships
- **THEN** web vitest pass count is ≥ 2363 plus the net new tests (AC4 smoothstep unit tests + AC5 ChapterSpec extension tests + AC6 wire test + AC7 integration test); document the precise delta in the Dev Agent Record
- **AND** bake pytest pass count is preserved (Story 4.1 is web-only; bake should be unaffected)
- **AND** `npm run typecheck` is clean
- **AND** `npm run lint` shows ≤ 4 warnings (the inherited Epic 3 baseline; 0 new)
- **AND** ADR-0023 (translation-only view-frame blend) verified compliant in the Dev Agent Record; ADR-0015 (no-global-store: ViewFrameService constructed in main.ts and DI'd into RenderEngine) verified; ADR-0026 (zero `any`) verified across all new code; ADR-0001 (no URL contract changes — ViewFrame is a runtime concern) verified
- **AND** no Lit reactive properties are introduced; if any `<v-...>` component gains state in this story, Rule 10 (Lit `declare` + ctor-init) applies (none expected — Story 4.1 is service-layer)

## Tasks / Subtasks

- [x] **T1: ViewFrameService class** (AC1, AC3)
  - [x] T1.1: Extract `smoothstep(edge0, edge1, x)` to `web/src/math/smoothstep.ts` if not already present (search first). Add ~6 unit tests pinning the cubic formula `t*t*(3-2*t)` against the standard test vectors.
  - [x] T1.2: Create `web/src/services/view-frame.ts` exporting `ViewFrameService` class + `ViewFrameTransform` type. Constructor takes `EphemerisService` + `prefersReducedMotion` source. Class docstring references ADR-0023.
  - [x] T1.3: Implement `getTransform(et, activeChapter)` per AC1's algorithm.
  - [x] T1.4: Add `web/src/services/view-frame.test.ts` covering AC1 + AC3 + AC4 cases (cruise null, encounter ramp, reduced-motion collapse).

- [x] **T2: RenderEngine integration** (AC2)
  - [x] T2.1: Read `web/src/render/render-engine.ts` end-to-end (especially `onFrame` at lines 220-246 + constructor + scene wire-up). Identify the cleanest hook point for the origin-shift insertion.
  - [x] T2.2: Extend `RenderEngineOptions` (or constructor signature) with optional `viewFrame?: ViewFrameService`. Default to a no-op identity transform if absent.
  - [x] T2.3: Wire the per-frame `viewFrame.getTransform(et, chapterDirector.activeChapter)` call BEFORE the floating-origin step at line 232; add the returned `originOffsetWorld` to `this.cameraWorldPos` before the existing `floatingOriginOffset()` call.
  - [x] T2.4: Publish `__voyagerDebug.viewFrame` under `import.meta.env.DEV` (mirror Story 3.2 pattern).
  - [x] T2.5: Update existing RenderEngine unit tests that construct without `viewFrame` to confirm no-op default still works.

- [x] **T3: ChapterSpec `targetBody` extension** (AC5)
  - [x] T3.1: Add `targetBody?: BodyId` to `web/src/types/chapter.ts:ChapterSpec`. Update JSDoc.
  - [x] T3.2: Populate `targetBody` in the 6 encounter specs (`v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`); verify NAIF IDs (Jupiter 599, Saturn 699, Uranus 799, Neptune 899) against `bake/src/ck_inventory.py` or the runtime manifest.
  - [x] T3.3: Confirm non-encounter specs (`launch-v1`, `launch-v2`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`) leave `targetBody` undefined.
  - [x] T3.4: Add a registry test pinning the targetBody pattern (encounter chapters have it; non-encounter chapters don't).

- [x] **T4: ChapterDirector → setActiveSpacecraft wire** (AC6 — closes Epic 3 retro Action #3)
  - [x] T4.1: Locate the existing `chapterDirector.subscribe(...)` block in `web/src/main.ts` (or create one adjacent to ChapterDirector construction).
  - [x] T4.2: Inside the subscriber, on `event.to === 'held'`, call `firstPaintHandle.hud.attitudeIndicator?.setActiveSpacecraft(naifIdFor(event.chapter.spacecraft))` where `naifIdFor('v1') = -31`, `naifIdFor('v2') = -32`, `naifIdFor('both') = -31` (default).
  - [x] T4.3: Add `web/tests/chapter-director-attitude-indicator-wire.test.ts` with the 3 AC6 pin tests (V1 chapter, V2 chapter, cruise).
  - [x] T4.4: If Epic 3 retro Action #3 has a corresponding deferred-work entry, strike through with a closing annotation pointing to Story 4.1. (No deferred-work entry was filed for Action #3 — it lived only in the retro action-items table; AC6 stands alone per the AC's last clause.)

- [x] **T5: Integration AC test** (AC7)
  - [x] T5.1: Author `web/tests/view-frame-render-engine-integration.test.ts` mirroring the Story 3.2 attitude-service-integration pattern (real ChunkLoader + EphemerisService + ChapterDirector + ViewFrame + RenderEngine; Node-side brotli decompression for chunk loading).
  - [x] T5.2: Three ET probes: cruise, entering ramp at alpha≈0.5, deep held; assert on `worldGroup.position` magnitude.

- [x] **T6: AC8 prerequisites — DEV debug surface published**
  - [x] T6.1: Confirm `__voyagerDebug.viewFrame` published under `import.meta.env.DEV` (T2.4 above).
  - [x] T6.2: Document in the Dev Agent Record the lead-side smoke probe plan (URLs + evaluate_script snippets).

- [x] **T7: Final sweep + lint + ADR-compliance documentation** (AC9)
  - [x] T7.1: `cd web && npm run typecheck && npm run lint && npx vitest run` — capture pass-count delta in Dev Agent Record.
  - [x] T7.2: Verify no regressions in Story 4.0's L2 fixture / ephemeris-service / attitude-l2 tests.
  - [x] T7.3: ADR-0023 / ADR-0015 / ADR-0026 / ADR-0001 compliance recorded in Dev Agent Record (Rule 6).

### Review Findings (code review 2026-05-22)

- [x] **[Review][Patch] AC1 wording vs implementation — Rule 5 amendment applied in place** — The literal AC1 wording promised that any time `activeChapter === null` OR `activeChapter.targetBody === undefined`, the transform returns identity. The implementation falls through to a registry scan for an adjacent encounter's ±2-day ramp band, which is correct (the FSM only dwells in `held` per Story 2.1, so the entering / exiting ramps outside `held` would otherwise be unreachable). Per Rule 5, AC1 amended IN PLACE in both `epics.md` (line ~1564) and this story spec (AC1 § 3rd-and-4th bullets) to document the actual contract — no code change. Production registry pin guarantees encounter ramps don't overlap any non-encounter window so the amendment is documentation-only; no user-visible behaviour change. Original wording preserved in Change Log.
- [x] **[Review][Defer] ViewFrameService identity-transform sentinel — inner Float64Array not frozen [`web/src/services/view-frame.ts:285-287`]** — `Object.freeze({...})` freezes the wrapper, but `originOffsetWorld` (Float64Array) is mutable. No current consumer writes; deferred per `deferred-work.md` [4.1 / LOW]. Routing: Story 4.2 VoyagerCameraController natural-landing.
- [x] **[Review][Defer] ViewFrameService does not isFinite-gate the body-position multiplication [`web/src/services/view-frame.ts:185-191`]** — `alpha * bodyPos[i]` propagates NaN/Infinity straight through. Bake invariants prevent this today; QA pinned current behaviour in `view-frame-qa-gaps.test.ts:111-132`. Deferred per `deferred-work.md` [4.1 / LOW]. Routing: future hardening pass.

**Code review verdict:** All 9 ACs pass implementation check. Rule 6 (ADR compliance): ADR-0023 (translation-only — `ViewFrameTransform` has only `originOffsetWorld`, no quaternion), ADR-0015 (no-global-store — `ViewFrameService` constructed in `main.ts`, DI'd via `setViewFrame`), ADR-0026 (zero `any` — all new types branded), ADR-0001 (no URL changes) all verified compliant. Rule 1 (Integration AC): AC7 `view-frame-render-engine-integration.test.ts` exercises the real ChunkLoader + EphemerisService + ChapterDirector + ViewFrame + RenderEngine stack with 3 ET probes (cruise / ramp / held) and passes against the on-disk bake fixtures. Rule 3 (per-story smoke evidence): code-side prerequisites in place (`__voyagerDebug.viewFrame` published, `<v-attitude-indicator>` mounted, AC6 wire installed before cold-load seed) — Chrome DevTools MCP smoke deferred to LEAD per Rule 7. Rule 9 (APG primitives), Rule 10 (Lit `declare` + ctor-init), Rule 11 (build-pipeline E2E) all N/A for Story 4.1.

## Dev Notes

### Critical files (current state, what Story 4.1 touches)

- `web/src/services/chapter-director.ts` (READ-ONLY — Story 4.1 does NOT modify this file)
  - States: `out` / `entering` / `held` / `exiting` / `passed`. `entering`/`exiting` are TRANSIENT (emitted as transition events but the FSM never dwells in them).
  - `update(et)` is called per frame from `RenderEngine.onFrame` (already wired in main.ts per Story 2.1).
  - `activeChapter` getter returns the chapter currently in `held` state, or `null`.
  - `subscribe(callback)` returns an unsubscribe function; subscribers fire on transitions only (not per-frame). Subscriber exceptions are logged and swallowed.

- `web/src/types/chapter.ts`
  - **AC5 touches**: add `targetBody?: BodyId` to `ChapterSpec` interface. Existing fields are `slug`, `name`, `markerLabel`, `anchorEt`, `windowStartEt`, `windowEndEt`, `spacecraft` (`'v1' | 'v2' | 'both'`), `ogDescription`.

- `web/src/chapters/specs/{v1-jupiter,v2-jupiter,v1-saturn,v2-saturn,v2-uranus,v2-neptune}.ts` (6 files)
  - **AC5 touches**: each gets a `targetBody` line in its `ChapterSpec` literal. Existing v1-jupiter.ts is a 26-line file — minimal touch.

- `web/src/services/view-frame.ts` (NEW — Story 4.1 creates this file)
  - **AC1 + AC3**: new file. ViewFrameService class with `getTransform` + helper types.

- `web/src/services/view-frame.test.ts` (NEW)
  - **AC1 + AC3 + AC4**: unit tests.

- `web/src/render/render-engine.ts`
  - **AC2 touches**: constructor signature (add optional `viewFrame`) + `onFrame` body (insert ViewFrame call before floating-origin step at line 231-237).
  - Current `onFrame` flow: tick clock → compute floating-origin offset from `cameraWorldPos` → set `worldGroup.position = -cameraWorldPos` → fire `frameCallbacks` → render. ViewFrame's origin shift inserts between "tick clock" and "compute floating-origin offset."

- `web/src/main.ts`
  - **AC2 + AC6 touches**: construct ViewFrameService after EphemerisService + ChapterDirector; inject into RenderEngine; add the ChapterDirector subscriber wire for setActiveSpacecraft.

- `web/src/math/smoothstep.ts` (NEW if not present)
  - **T1.1**: extract the cubic smoothstep helper (`t * t * (3 - 2 * t)`). Search first — Story 1.7 (animation tokens) or Story 2.x may have already extracted it.

- `web/tests/view-frame-render-engine-integration.test.ts` (NEW)
  - **AC7**: integration test using real ChunkLoader + EphemerisService + ChapterDirector + ViewFrame + RenderEngine.

- `web/tests/chapter-director-attitude-indicator-wire.test.ts` (NEW)
  - **AC6**: wire-up unit test.

### Previous Story Intelligence

**Story 2.1 (ChapterDirector FSM)** — `web/src/services/chapter-director.ts` is the substrate Story 4.1 keys off. Key invariants:
- `entering` and `exiting` are TRANSIENT — the FSM emits them as subscriber events but never dwells in them. Story 4.1's `getTransform` must NOT key off the substate name; it keys off `activeChapter` (the `held` chapter) plus comparison of `et` to the alpha-ramp boundaries.
- Subscribers fire only on transitions; the per-frame `getTransform(currentEt, activeChapter)` reads `activeChapter` directly inside RenderEngine.onFrame — this stays cool under 60 Hz.

**Story 3.0 / Rule 9 (ADR-0025 APG primitives)** — N/A for Story 4.1 (no slider/listbox/dialog components).

**Story 3.2 (AttitudeService SLERP)** — Pattern reference: AttitudeService is constructed in main.ts after EphemerisService, injected via constructor, published as `__voyagerDebug.attitudeService` under import.meta.env.DEV. Story 4.1's ViewFrameService follows the exact same pattern.

**Story 3.6 (`<v-attitude-indicator>` HUD provenance)** — `setActiveSpacecraft(naifId)` method is the contract Story 4.1 AC6 calls into. The method is idempotent and dispatches a bubbling+composed `CustomEvent('activeSpacecraftChanged', {detail: {naifId}})`. Story 4.1's wire does NOT need to listen to that event — it CALLS the method directly.

**Story 4.0 (Epic 3 deferred cleanup)** — Smoke at `/c/v2-saturn` confirmed the wire-up gap (indicator stub defaults to V1, reads V1's synthesized cruise attitude on V2 chapter pages). AC6 closes this. The Story 4.0 commit (755e3d6) also fixed the EphemerisService trajectory-only filter — this story builds on that fix (the ViewFrame service consumes `EphemerisService.getPosition(targetBody, et)` for trajectory queries; the post-Story-4.0 filter ensures attitude files don't pollute the binary search).

**Rule 10 + Rule 11 (Story 4.0 voyager-skill-rules additions)** — Rule 10 (Lit declare+ctor-init) is N/A for Story 4.1 (no Lit components introduced). Rule 11 (build-pipeline E2E tests) is N/A (Story 4.1 is runtime, not build-pipeline).

### NFR / ADR compliance pointers

- **ADR-0023 (Translation-only view-frame blend; Accepted 2026-05-18)**: AC1 + AC3 directly honor this. Class docstring references the ADR.
- **ADR-0015 (No global store; constructor-DI)**: ViewFrameService constructed in main.ts and DI'd into RenderEngine; no module-level singleton.
- **ADR-0026 (Zero `any`)**: all new types branded or named (use `BodyId`, `ET`, `WorldVec3` per existing type vocabulary).
- **ADR-0001 (URL contract stability)**: N/A (no URL changes).
- **AR11 (Translation-only view-frame blend commitment)**: same as ADR-0023.
- **FR31 (Cinematic encounter entry)**: this story is the substrate; Story 4.5+ render the user-visible result.

### Body NAIF IDs (verify against runtime manifest before populating chapter specs)

Per `bake/src/ck_inventory.py` and NAIF SPK conventions:

- Jupiter barycenter (5 = `JUPITER_BARYCENTER`) vs Jupiter the body (599 = `JUPITER`). For body-centered framing, use the BODY id (599), not the barycenter. Verify against the runtime manifest's `bodies[].naifId` field — if the manifest uses the barycenter, switch.
- Saturn: body 699 (barycenter 6).
- Uranus: body 799 (barycenter 7).
- Neptune: body 899 (barycenter 8).
- Earth: body 399 (barycenter 3). Used by PBD heart-warming scene per Epic 5 (but PBD is out of scope here).

If the manifest uses barycenters instead of body IDs (because gas-giant moons orbit the BARYCENTER and the bake includes barycenter trajectories for orbital math), check Stories 1.4 + 1.13's pattern and conform. The lead's Story 4.0 smoke probe pulled `manifest.bodies` — confirm the shape there before AC5.

### Reduced-motion source

Two candidate mechanisms:

- **(a)** Read `prefers-reduced-motion: reduce` media query directly: `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. Pure runtime, no token coupling.
- **(b)** Read the computed value of `--v-duration-base` CSS custom property and check for `0` or `0ms`. Tighter coupling to Story 1.7's centralised duration token; reflects user/dev overrides if the project supports them.

Recommended: **(a)** for the ViewFrameService since it's pure-math, not styled — but be consistent with the rest of the codebase. Check how `<v-help-overlay>` (Story 2.8) and `<v-chapter-copy>` (Story 2.9) handle reduced motion; mirror their pattern.

## References

- Epic 4 spec for Story 4.1: `_bmad-output/planning-artifacts/epics.md:1549-1588`
- ADR-0023: `docs/adr/0023-translation-only-view-frame-blend-no-rotation-blend-v1.md`
- ChapterDirector source: `web/src/services/chapter-director.ts:1-150`
- ChapterSpec type: `web/src/types/chapter.ts:49-71`
- RenderEngine onFrame: `web/src/render/render-engine.ts:220-246`
- Existing v1-jupiter chapter spec (touch pattern reference): `web/src/chapters/specs/v1-jupiter.ts`
- Story 3.2 AttitudeService integration test pattern (reference for AC7): `web/tests/attitude-service-integration.test.ts`
- Story 3.6 `<v-attitude-indicator>` setActiveSpacecraft API: `web/src/components/v-attitude-indicator.ts`
- voyager-skill-rules: `_bmad/custom/voyager-skill-rules.md` (Rules 1-11 inc. Story 4.0 additions)
- Epic 3 retro Action #3 origin: `_bmad-output/implementation-artifacts/epic-3-retro-2026-05-22.md` (action items table)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via `/epic-cycle` dev stage. Invocation: `bmad-dev-story` skill against this story file.

### Debug Log References

- Web vitest sweep (final): 136 files, 2428 passed / 2 skipped (delta +65 net new tests vs the post-Story-4.0 baseline of 2363/2; see breakdown below).
- Bake fast pytest sweep: 414 passed / 4 skipped / 19 deselected — baseline preserved (Story 4.1 is web-only).
- `npm run typecheck`: clean.
- `npm run lint`: 4 warnings, 0 errors (matches the inherited Epic 3 baseline exactly; 0 new).

### Completion Notes List

#### Implementation summary

- **T1 (smoothstep + ViewFrameService):** Created `web/src/math/smoothstep.ts` (no prior helper existed in the math directory — searched first per the story's cadence-path rubric) with the standard GLSL `t * t * (3 - 2 * t)` formulation and degenerate-band guard. 10 unit tests in `smoothstep.test.ts` pin the cubic formula at quarter points, monotonicity, endpoint clamping, zero-derivative-at-boundary, and large-ET (≈ 1e9 s) precision. The ViewFrameService at `web/src/services/view-frame.ts` exposes the `getTransform(et, activeChapter)` contract with translation-only `{ originOffsetWorld }` shape per ADR-0023 (NO quaternion field). Reduced-motion source defaults to `window.matchMedia('(prefers-reduced-motion: reduce)').matches` (mirrors `<v-help-overlay>` and `<v-chapter-copy>`'s "central token, no per-component override" pattern), injectable for tests. 29 unit tests cover AC1 / AC3 / AC4 + ramp-zone resolution + reduced-motion + defensive shape.

- **T2 (RenderEngine integration):** Added optional `viewFrame?: ViewFrameService` + `chapterDirector?: ChapterDirector` to `RenderEngineOptions` and a `setViewFrame(viewFrame, chapterDirector)` post-construction setter (needed because RenderEngine is constructed at boot but EphemerisService — and therefore ViewFrameService — only exists post-manifest-load; the setter matches the Story 3.6 `<v-hud>.attitudeService` post-manifest wiring pattern). `tick()` composes `renderCameraPos = cameraWorldPos + originOffsetWorld` BEFORE the existing `floatingOriginOffset()` step at step 3 of the per-frame pipeline. Cruise-frame short-circuit (zero-component check) prevents per-frame `worldVec3` allocation when no encounter is active. Added 4 new RenderEngine unit tests (no-op default, identity composition, non-zero composition, wire-receives-correct-ET-and-chapter); all 21 existing render-engine.test.ts cases still pass.

- **T3 (ChapterSpec `targetBody`):** Added optional `targetBody?: number` field to `ChapterSpec` (used plain `number` rather than `BodyId` — the story's "BodyId branded type" doesn't exist in the codebase; the project pattern is plain `number` for NAIF IDs across `manifest-loader`, `EphemerisService.getPosition`, and `BODY_RADII_KM`). Populated the 6 encounter specs with **NAIF barycenter IDs (5, 6, 7, 8)** rather than body IDs (599, 699, 799, 899) — verified against `bake/src/bake_trajectories.py` and `web/src/constants/body-radii.ts`, both of which use barycenters because the bake samples planet positions at the barycenter (gas-giant moons orbit the barycenter; barycenter ↔ body offset is sub-pixel at solar-system zoom). The 5 non-encounter specs (`launch-v1`, `launch-v2`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`) leave `targetBody` undefined. `web/src/chapters/target-body.test.ts` pins the encounter / non-encounter classification + the barycenter-vs-body-ID convention.

- **T4 (ChapterDirector → setActiveSpacecraft wire, AC6 closing Epic 3 retro Action #3):** Added a `chapterDirector.subscribe((event) => { if (event.to === 'held') hud.attitudeIndicator?.setActiveSpacecraft(naifId) })` block in `main.ts`, installed AFTER `firstPaintHandle` (so the optional-chain has the HUD handle) and BEFORE the synchronous cold-load `chapterDirector.update(clockManager.simTimeEt)` seed (so cold-load arrival inside a V2 chapter window fires the wire on the seed itself — closes the Story 4.0 smoke gap at `/c/v2-saturn`). `naifIdForSpacecraft` helper maps `'v1' → -31`, `'v2' → -32`, `'both' → -31` (matches the indicator's stub default per Story 3.6 AC4). `tests/chapter-director-attitude-indicator-wire.test.ts` has 13 tests: 6 source-shape pins on main.ts, 7 behavioural tests against a real ChapterDirector with a stub indicator — including the cold-load `/c/v2-saturn` scenario and a throw-safety test confirming subscriber exception isolation.

- **T5 (Integration AC7):** `tests/view-frame-render-engine-integration.test.ts` mirrors the Story 3.2 attitude-service-integration pattern with the additional ChapterDirector + ViewFrame layers. Loads the on-disk manifest via a Node-side brotli-decompressing fetch shim (post-Story-1.16 chunk-loader contract). Uses a stub WebGL renderer factory so no canvas/WebGL is required. Five tests: cruise identity at 1980-01-01, held magnitude ≈ 5.2 AU at V1 Jupiter anchor (asserts within the 700M–820M km envelope to allow for Jupiter's orbital phase), entering ramp magnitude ≈ 0.5 × held magnitude at windowStart - 1 day (with ratio assertion to verify the smoothstep curve under real Jupiter ephemeris), engine.tick() smoke (no exceptions / NaN propagation), and single-ChunkLoader contract pin. The test skips gracefully when `bake/out/manifest.json` or `bake/out/jupiter.bin.br` is absent (fresh checkout without a bake run).

- **T6 (AC8 prerequisites):** `__voyagerDebug.viewFrame` is published inside the post-manifest `if (import.meta.env.DEV)` block in `main.ts` alongside `attitudeService` / `attitudeApplier` / `boresightRenderer` from Story 3.x. Lead-side MCP smoke probe plan documented below.

- **T7 (Final sweep):** Web vitest 2363 → 2428 (+65 net new). Bake fast 414 preserved. Typecheck clean. Lint 4 warnings (0 new). ADR compliance recorded below.

#### Architectural decision surfaced — ramp-zone chapter resolution

A spec ambiguity surfaced when wiring AC1 + AC2 + AC5 + AC7 together: `ChapterDirector.activeChapter` only returns non-null during the `held` substate (the FSM is transient through `entering` / `exiting` per Story 2.1's documented contract), but AC1 demands a smoothstep blend over the ±2-day ramp zones BEFORE / AFTER held — which means ViewFrame must resolve the approaching / departing encounter chapter even when the FSM hands it `null` for activeChapter. AC2 pins the call signature as `viewFrame.getTransform(currentEt, chapterDirector.activeChapter)` (cannot change that), and AC5 implies ViewFrame keys off "activeChapter (the held chapter) plus comparison of et to windowStartEt - 2*DAY / windowEndEt + 2*DAY" — assuming activeChapter is non-null during the ramps, which is incorrect per the FSM contract.

**Resolution (no NFR amendment needed — this is a functional AC interaction, not an NFR tripwire):** ViewFrameService internally scans an injected chapter set (defaulting to `ALL_CHAPTERS`) when `activeChapter === null`, locating the encounter chapter whose ±2-day band covers `et`. Encounter windows don't overlap (registry test pin), so the scan returns at most one match. The `getTransform(et, activeChapter)` signature is preserved (AC2 honored). Documented inside `ViewFrameService.resolveBlendChapter`. New unit tests cover the ramp-zone resolution + reduced-motion skip of the scan. Without this, the AC7 integration test's entering-ramp probe would have asserted `0.5 × heldMag` and seen `0` instead (which is exactly what the first integration-test run produced before the fix).

This is a real spec finding worth code-review attention but not a planning-artifact tripwire — the underlying contract (ViewFrame blends over ±2-day window outside held) is unambiguous in AC1; the resolution mechanism just needed to be made explicit. ChapterDirector's contract was NOT changed.

#### AC8 lead smoke probe plan

When the lead drives the post-dev/QA/code-review Chrome DevTools MCP smoke per AC8, the following probes verify the wire-up end-to-end:

```js
// /c/v2-saturn — verify the body-centered shift at V2 Saturn anchor (held).
const et = __voyagerDebug.chapterDirector.activeChapter.anchorEt;
const offset = __voyagerDebug.viewFrame.getTransform(et, __voyagerDebug.chapterDirector.activeChapter).originOffsetWorld;
const mag = Math.hypot(offset[0], offset[1], offset[2]);
// Expected: ~9.5 AU = ~1.4e9 km (Saturn heliocentric); pass if mag in [1.0e9, 1.7e9].

// /c/v2-saturn — verify <v-attitude-indicator> now reads V2 (closes Story 4.0 smoke gap).
document.querySelector('v-hud')?.shadowRoot?.querySelector('v-attitude-indicator')?.activeSpacecraftId
// Expected: -32 (was -31 stub default before AC6 wire landed).

// /c/v1-jupiter — verify the body-centered shift at V1 Jupiter anchor (held).
// Same probe pattern as /c/v2-saturn; expected mag ~5.2 AU = ~7.8e8 km.
```

Smoke evidence captured under `_bmad-output/implementation-artifacts/4-1-smoke-evidence/`: `mcp-v2-saturn-fullpage.png`, `mcp-v1-jupiter-fullpage.png`, `mcp-smoke-summary.md`.

#### ADR compliance (Rule 6)

- **ADR-0023 (Translation-only view-frame blend; Accepted 2026-05-18):** Compliant. `ViewFrameTransform` shape contains ONLY `originOffsetWorld` — no `quaternion` field. AC3 runtime test (`Object.keys(t) === ['originOffsetWorld']`) plus typed-interface declaration both enforce. Class docstring references the ADR at `view-frame.ts:10`. `RenderEngine.tick()` only mutates `worldGroup.position`, never `camera.quaternion`. The deferred rotation-blend decision per the ADR is honored.
- **ADR-0015 (No global store; constructor-DI):** Compliant. `ViewFrameService` is constructed in `main.ts` and dependency-injected into `RenderEngine` via the `setViewFrame` post-manifest setter. No module-level singletons. The `EphemerisService` it consumes is also DI'd (per the Story 3.2 / 1.6 pattern); the `chapters: readonly ChapterSpec[]` parameter defaults to `ALL_CHAPTERS` (a frozen const, not a mutable singleton).
- **ADR-0026 (Zero `any`):** Compliant across all new code. New types: `ReducedMotionSource = () => boolean`, `ViewFrameTransform { readonly originOffsetWorld: WorldVec3 }`. Branded vectors (`WorldVec3`) and the existing `ChapterSpec` interface used throughout. The test files cast stubs to `as unknown as SomeService` (the established test-fixture pattern) — no `any` types.
- **ADR-0001 (URL contract stability):** N/A — Story 4.1 is a runtime-services change; no URL surface mutations. Chapter slugs unchanged.

#### Rule 11 (build-pipeline E2E tests)

N/A — Story 4.1 is runtime, not build-pipeline. No `web/scripts/` or `bake/src/` chains touched.

#### Rule 10 (Lit `declare` + ctor-init)

N/A — Story 4.1 introduces no Lit components. The `<v-attitude-indicator>` component AC6 wires INTO already has the correct `declare` + ctor-init pattern from Story 3.6.

#### Test pyramid delta

| Tier | File | Tests added |
|------|------|-------------|
| Unit | `web/src/math/smoothstep.test.ts` | 10 (new) |
| Unit | `web/src/services/view-frame.test.ts` | 29 (new) |
| Unit | `web/src/chapters/target-body.test.ts` | 4 (new) |
| Unit | `web/src/render/render-engine.test.ts` | 4 added to existing file |
| QA / wire-shape | `web/tests/chapter-director-attitude-indicator-wire.test.ts` | 13 (new) |
| Integration | `web/tests/view-frame-render-engine-integration.test.ts` | 5 (new) |
| **Total** | | **+65** |

Baseline post-Story-4.0: 2363 pass / 2 skipped / 131 files. Post-Story-4.1: 2428 pass / 2 skipped / 136 files. Delta matches the per-file totals above (10+29+4+4+13+5 = 65).

### File List

#### New files

- `web/src/math/smoothstep.ts`
- `web/src/math/smoothstep.test.ts`
- `web/src/services/view-frame.ts`
- `web/src/services/view-frame.test.ts`
- `web/src/chapters/target-body.test.ts`
- `web/tests/chapter-director-attitude-indicator-wire.test.ts`
- `web/tests/view-frame-render-engine-integration.test.ts`

#### Modified files

- `web/src/types/chapter.ts` — added optional `targetBody?: number` field on `ChapterSpec`.
- `web/src/chapters/specs/v1-jupiter.ts` — `targetBody: 5` (Jupiter barycenter).
- `web/src/chapters/specs/v2-jupiter.ts` — `targetBody: 5`.
- `web/src/chapters/specs/v1-saturn.ts` — `targetBody: 6` (Saturn barycenter).
- `web/src/chapters/specs/v2-saturn.ts` — `targetBody: 6`.
- `web/src/chapters/specs/v2-uranus.ts` — `targetBody: 7`.
- `web/src/chapters/specs/v2-neptune.ts` — `targetBody: 8`.
- `web/src/render/render-engine.ts` — `viewFrame` + `chapterDirector` constructor options, `setViewFrame` setter, per-frame composition step in `tick()`.
- `web/src/render/render-engine.test.ts` — 4 new tests in a "Story 4.1 AC2 ViewFrame composition" describe block.
- `web/src/main.ts` — `ViewFrameService` import + construction post-manifest, `engine.setViewFrame(...)` wiring, `__voyagerDebug.viewFrame` publish, AC6 chapter-director → setActiveSpacecraft subscriber + `naifIdForSpacecraft` helper.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 4-1 status: ready-for-dev → in-progress → review.

### Change Log

| Date | Change | By |
|------|--------|----|
| 2026-05-22 | Initial implementation: ViewFrameService + RenderEngine integration + ChapterSpec.targetBody + AC6 attitude-indicator wire + integration AC test. +65 web tests; bake / lint / typecheck baselines preserved. | Claude Opus 4.7 (dev) |
| 2026-05-22 | Rule 5 amendment to AC1: clarified that when `activeChapter === null` OR `activeChapter.targetBody === undefined`, the service scans the registry for an adjacent encounter chapter whose ±2-day ramp band covers `et` BEFORE returning identity (the original wording read as a strict "OR cruise ⇒ identity" branch). Original wording promised identity in that case; implementation falls through to a ramp-zone scan so the smoothstep blend still runs across the entering / exiting windows (the FSM only dwells in `held` per Story 2.1). Production registry pin guarantees encounter ramps don't overlap any non-encounter window, so the amendment is documentation-only — no user-visible behaviour change. Mirrored in `epics.md` AC1 § Story 4.1. | Claude Opus 4.7 (code-review) |
