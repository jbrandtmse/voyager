# Story 5.2: Choreographed Spacecraft Turn (CK or Synthesized per Coverage)

**Epic:** 5 — Pale Blue Dot (the Hero Scene)
**Status:** review
**Date created:** 2026-05-23
**Source:** `_bmad-output/planning-artifacts/epics.md:1964-2005` (Story 5.2 spec) + `docs/kernels/ckbrief-inventory.md:288-301` (PBD CK coverage statement — bus YES, platform NO) + Story 5.1 module foundation + Story 3.2 AttitudeService API

## User Story

As a visitor at the PBD chapter,
I want to watch V1 physically turn from cruise orientation to the photography-sequence pointing, with the provenance indicator honestly reflecting whether the turn is CK-driven or synthesized,
So that the differentiator's hero moment lands as recognition (not as spectacle) and FR27, FR19 (provenance honest), AR10 are operational.

## Coverage reality (load-bearing for the Rule 5 amendment below)

`docs/kernels/ckbrief-inventory.md` § "Pale Blue Dot (1990-02-14) coverage statement" (lines 288–301) is **explicit on a MIXED coverage state**:

- **Bus CK coverage in `vgr1_super_v2.bc`:** YES (continuous over 1990-02-14)
- **Scan-platform CK coverage in ANY CK file:** **NO** (synthesis required)

The epics.md Story 5.2 spec at line 1977-1981 + 1983-1988 presents this as a binary branch ("CK coverage IS present" XOR "CK coverage is NOT present"). **The actual state is mixed — bus CK + platform synthesis** — which neither branch captures verbatim. This story's ACs reconcile both branches with the mixed reality via a single concrete implementation; per Rule 5, the planning artifact (`epics.md` Story 5.2 lines 1977-2000) gets an inline amendment block recording the mixed-coverage interpretation. The dev agent owns the amendment.

## Acceptance Criteria

### AC1 — CK coverage finding is recorded explicitly in `ckbrief-inventory.md`

- **GIVEN** the existing PBD coverage statement at `docs/kernels/ckbrief-inventory.md:288-301`
- **WHEN** Story 5.2 ships
- **THEN** the doc statement remains as-is — already explicit per the line 298-301 "bus YES, platform NO" finding (verification only; no doc change needed if already explicit)
- **AND** the PBD module's behavior branches on this finding per AC2 / AC3 below

### AC2 — Bus quaternion driven by AttitudeService CK path; no PBD override for the bus

- **GIVEN** `AttitudeService.getBusProvenance(V1_NAIF_ID, et)` returns `'ck'` for the PBD anchor ET (per the coverage statement)
- **AND** `AttitudeService.getBusQuat(V1_NAIF_ID, et)` returns the SLERPed CK-derived bus quaternion across the PBD window
- **WHEN** the PBD `turning` substate is active
- **THEN** the V1 bus quaternion is applied by `AttitudeApplier.tick()` reading `AttitudeService.getBusQuat(-31, et)` — UNCHANGED from the pre-Story-5.2 wire-up
- **AND** the PBD module does NOT override the bus quaternion; the visible turn matches the historical CK record over the PBD window
- **AND** an integration test asserts that during the PBD window, the rendered V1 bus node's quaternion EQUALS the AttitudeService CK-derived quaternion for the same ET (within float ε); the PBD module does NOT mutate the bus pose

### AC3 — Platform quaternion synthesized per-substate by the PBD module (overrides AttitudeService's synthesized fallback)

- **GIVEN** `AttitudeService.getPlatformProvenance(V1_NAIF_ID, et)` returns `'synthesized'` for the PBD anchor ET (no platform CK at 1990-02-14)
- **AND** the default `AttitudeService.synthesizePlatformQuat` composes the synthesized bus quaternion with the platform's FK-derived rest pose (identity) — NOT what PBD wants (PBD wants the platform aimed at each target during its `sweeping_<body>` substate)
- **WHEN** the PBD module is active AND the substate is one of `sweeping_venus / sweeping_earth / sweeping_jupiter / sweeping_saturn / sweeping_uranus / sweeping_neptune`
- **THEN** the PBD module computes the platform quaternion as: the rotation that aligns the NA boresight (from `VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM` = `[0, 0, 1]` in platform frame, per `web/src/services/fk-constants.ts:106`) with the V1→target vector in J2000 — computed from `EphemerisService.getPosition(targetNaifId, et) - EphemerisService.getPosition(V1_NAIF_ID, et)`, normalized
- **AND** the targets are NAIF body IDs: Venus = 2, Earth = 3, Jupiter = 5 (barycenter — matches `targetBody` convention from Story 4.1), Saturn = 6, Uranus = 7, Neptune = 8
- **AND** the PBD module exposes a method `getPlatformQuatOverride(naifId, et): Quaternion | null` that returns the synthesized platform quaternion during the sweeping substates; returns `null` otherwise (so `AttitudeApplier` falls through to `AttitudeService.getPlatformQuat`)
- **AND** the integration mechanism is documented in the Dev Agent Record — two viable paths (dev's choice, per Rule 5 + Path A vs Path B convention from Story 5.1):
  - **Path A (recommended — minimal-extension):** `AttitudeApplier.tick()` checks the PBD module FIRST for a platform-quat override; if non-null, applies it; else falls through to `AttitudeService.getPlatformQuat`. The PBD module exposes a stable reference that the applier consults via a setter wired in `main.ts`.
  - **Path B (full-service-injection):** Extend `AttitudeService` with a registration API (e.g. `registerPlatformOverride(provider)`) that the PBD module registers during its activation. The service composes overrides into its `getPlatformQuat` return value.
- **AND** the override applies only DURING the PBD substates listed above (`turning` substate uses smooth interpolation between the previous and next aim — see AC4); outside those substates, the override returns null

### AC4 — Smooth transition between sweeping substates AND substate-by-substate ease-out (cone orientation)

- **GIVEN** the boresight cone (Story 3.5) is parented to `SCAN_PLATFORM` so the platform quaternion's rotation propagates to the cone
- **AND** the PBD module emits a platform quaternion per `sweeping_<body>` substate (AC3)
- **WHEN** the substate transitions from `sweeping_<body_A>` to `sweeping_<body_B>` (e.g., `sweeping_venus` → `sweeping_earth`)
- **THEN** the platform quaternion is SLERPed between body_A's aim quat and body_B's aim quat over `--v-duration-slow` (defined in `tokens.css` — the dev agent reads the exact value; should be ≥ 250ms based on the convention)
- **AND** the easing curve is `--v-ease-out` (cubic-bezier; defined in `tokens.css`)
- **AND** during the SLERP transition, the chapter substate machine remains in `sweeping_<body_B>` (the transition is a render-side animation, not a separate substate)
- **AND** the `turning` substate (between `idle` and `sweeping_venus`) uses the same SLERP-with-ease-out from the platform's pre-turn rest pose (identity vs bus) to the first target's aim quaternion — the visual is a smooth single sweep from cruise rest to Venus-pointed, with intermediate frames not "jumping"
- **AND** under `prefers-reduced-motion: reduce` (detected via `window.matchMedia('(prefers-reduced-motion: reduce)').matches` — Voyager-canonical pattern at `voyager-camera-controller.ts:351`), every substate transition becomes an instant cut (the quaternion changes between two consecutive frames with no SLERP); the visual is a hard cut between aim quats per substate, no continuous animation

### AC5 — Cinematic time mapping (50× speedup) preserves correct behaviour at all simulation speeds

- **GIVEN** Story 5.1's substate timings are authored as offset seconds from the chapter's anchor ET (180s total cinematic arc at 1× chapter playback)
- **AND** the historical PBD imaging sequence took several real hours (~5 hours by NASA documentation; Sagan 1994); to compress to 180s requires a 100× speedup (180s × 100 = 5 h ≈ 18000 s)
- **AND** the epic spec at line 1991-1992 states "the historical sequence (which took several real hours) is sped 50× by the PBD module's internal time mapping so the full turn + frustum sweep + composites read cinematically in approximately 2 minutes at 1× chapter playback"
- **WHEN** the dev agent implements the time mapping
- **THEN** the actual speedup factor is COMPUTED from the historical sequence duration and Story 5.1's 180s cinematic arc — if Story 5.1's 180s is mapped to the historical "several hours" the factor is ~100× (NOT 50× as the epic spec literally states); per Rule 5 the epic spec gets an inline amendment recording the actual factor as derived from MISSION_FACTS.md timing
- **AND** the PBD module's `update(currentEt)` reads the *simulation ET* directly (the same ET ChapterDirector reads) — the substate ETs from Story 5.1 are offsets from the chapter anchor; the substate at the current simulation ET is determined by the offset from anchor, NOT by wall-clock time, so the time mapping NATURALLY scales with simulation speed (1× / 10× / 100×) without additional logic
- **AND** at 100× simulation speed, the user sees the PBD sequence complete in ~1.8 seconds (still readable as choreography; the SLERP-with-ease-out transitions still apply per-substate-transition)
- **AND** the speed multiplier (`<v-speed-multiplier>`) and detail scrubber (`<v-timeline-scrubber variant="detail">`) remain functional during the PBD window — the user can scrub manually, in which case `pbdSubstateAt(currentEt)` returns the substate corresponding to the manually-scrubbed ET; the PBD module does NOT clamp or override user scrubbing
- **AND** integration tests cover at least three speed regimes: 1×, 10×, 100× — asserting that the substate sequence proceeds correctly (no skipped substates, no double-fired substates) at each speed

### AC6 — Attitude indicator label honestly reflects mixed coverage

- **GIVEN** `<v-attitude-indicator>` currently renders one of three values: `—` (no provenance yet), `CK reconstructed` (bus provenance = `ck`), `Synthesized (HGA Earth-pointing)` (bus provenance = `synthesized`) — per `web/src/components/v-attitude-indicator.ts:243-263`
- **AND** the indicator reads `attitudeService.getBusProvenance(V1_NAIF_ID, et)` — bus only, not platform
- **AND** for PBD: bus provenance = `'ck'` so the indicator currently renders `CK reconstructed` — which is HONEST for the bus (V1's body pose IS from CK)
- **AND** the platform is synthesized PBD-specific, which the indicator does NOT currently expose
- **WHEN** the dev agent decides how to honestly surface the mixed coverage
- **THEN** the indicator label is amended to one of these three options (dev's choice, recorded in Dev Agent Record + the Rule 5 epic-spec amendment):
  - **Option A — extend the indicator with a new variant.** Add a third state to `<v-attitude-indicator>` that the PBD module activates during its window. The new render text is `CK + synthesized scan` or similar. The activation is a public method `setPbdReconstructionActive(true | false)` the PBD module calls on `held` / `exiting` transitions. Rationale: most honest; explicitly names the mixed state.
  - **Option B — keep the indicator as-is.** The indicator shows `CK reconstructed` for PBD because the BUS pose IS CK (which is the user-visible turn of the spacecraft body). The platform synthesis is acknowledged in the chapter copy (Story 5.1 AC4 already requires this — and the canonical copy text contains "At the request of Carl Sagan, the spacecraft turns back"). Rationale: avoids HUD-vs-chapter-copy bloat; the chapter copy is the right venue for the reconstruction caveat.
  - **Option C — switch the indicator to platform provenance during PBD.** The indicator reads PLATFORM provenance during PBD (via `getPlatformProvenance` instead of `getBusProvenance`); this would show `Synthesized (HGA Earth-pointing)` — which is misleading because the synthesis is PBD-specific, NOT HGA Earth-pointing. The label would need a per-window variant. Rationale: rejected for being less truthful than Option A.
- **AND** the chosen option is documented in the Dev Agent Record AND in the epic-spec Rule 5 amendment
- **AND** the existing `v-attitude-indicator.test.ts` tests are amended (Option A) or verified-unchanged (Option B) — if Option A, NEW tests cover the PBD variant rendering + activation
- **AND** Story 5.1's `copy.ts` is verified to acknowledge the reconstruction posture; if it does not explicitly mention "reconstruct" / "synthesize" / "reconstructed-pointing", the dev agent amends the copy AND its word-count test in place (the current copy mentions "turns back" and "narrow-angle camera sweeps" — verify whether that's specific enough)

### AC7 — Scan-platform articulation propagates to the boresight cone

- **GIVEN** Story 3.5's NA boresight cone is parented to the `SCAN_PLATFORM` node (verified in Story 3.5 spec — the cone's transform inherits the platform's quaternion via the Three.js scene graph)
- **AND** AC3 makes the PBD module emit the platform quaternion per substate
- **WHEN** the PBD module's platform quaternion override is active
- **THEN** the cone visually aims at the target body during each `sweeping_<body>` substate (no additional wire-up — the parent-child transform propagates automatically)
- **AND** an integration test asserts that during `sweeping_earth`, the cone's world-space orientation has its `+Z` axis (boresight per FK constants) within 5° of the V1→Earth direction in J2000 (slightly loose tolerance because the SLERP transition may be mid-easement at the test's sampled ET — the test should sample at the substate's PEAK ET when the easing has settled)

### AC8 — Reduced-motion friendly-user testing prep (lines for Story 6.5)

- **GIVEN** the epic spec at line 2002-2005 names the J1 differentiator success criterion (the user "notices the spacecraft physically turning") AND routes friendly-user PBD-specific prompts to Story 6.5
- **WHEN** Story 5.2 ships
- **THEN** the dev agent appends a 1-paragraph note to `_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md` (NEW file) documenting the PBD turn implementation choices that Story 6.5's friendly-user session protocol should probe (bus CK turn visible; platform PBD synthesis explicitly aimed at each target; mixed-provenance honesty)
- **AND** the note is < 200 words; it's a prep input for Story 6.5, NOT a session protocol itself

### AC9 — Integration AC: end-to-end production smoke at PBD playback

- **GIVEN** Story 5.1's AC7 lead Chrome DevTools MCP smoke verified PBD cold-load (substate = `idle`)
- **AND** Story 5.2 adds the choreographed turn behaviour activated by playback
- **WHEN** the lead-driven Chrome DevTools MCP smoke runs against the production build navigating to `http://localhost:4173/c/pale-blue-dot/` AND pressing the play button (or scrubbing forward via the detail scrubber) so the substate advances from `idle` → `turning` → `sweeping_venus`
- **THEN** at each substate, the lead-driven smoke probes (via `evaluate_script` against the DEV-only `__voyagerDebug.paleBlueDot.currentSubstate` accessor — dev REQUIRED to extend it with this in DEV-mode):
  - `currentSubstate === 'turning'` ⇒ platform quaternion override is null (turning is bus-only motion, no per-target aim yet); attitude indicator shows the AC6-chosen label
  - `currentSubstate === 'sweeping_venus'` ⇒ platform quaternion override is non-null AND the scan-platform node's quaternion equals it; attitude indicator shows the AC6-chosen label
  - The transition between substates is smooth (visual; lead inspection via screenshot at substate peak ETs)
- **AND** smoke evidence (screenshots at `turning` peak + `sweeping_venus` peak + `sweeping_earth` peak + console clean) is committed under `_bmad-output/implementation-artifacts/5-2-smoke-evidence/`

### AC10 — Test sweep + lint baseline preserved + ADR compliance verified

- **GIVEN** the project's test pyramid baseline post-Story-5.1 (web vitest ~3189+ pass / typecheck clean / 4 lint warnings)
- **WHEN** Story 5.2 ships
- **THEN** web vitest pass count rises by ≥ AC2+AC3+AC4+AC5+AC6+AC7 unit + integration tests added
- **AND** `cd web && npm run typecheck` is clean
- **AND** `cd web && npm run lint` shows ≤ 4 warnings (the pre-existing baseline; 0 new)
- **AND** ADR-0014 (Hybrid Chapter Definition) compliance verified — the PBD module class continues to implement `ChapterModule`; the override-injection (Path A or B per AC3) is a per-frame method on the module, NOT a global side-effect
- **AND** ADR-0015 (no global store) compliance verified — the platform-quat override is exposed via the PBD module's method (NOT a global singleton)
- **AND** ADR-0023 (translation-only view frame blend, no rotation blend, V1) — NOT IMPACTED by Story 5.2 because the PBD module doesn't change the view-frame; the blend is handled by `ViewFrameService` per ADR-0023 (V1J pattern). PBD's defaultFraming remains undefined per Story 5.1; the camera framing during PBD is the user's responsibility / Story 5.X follow-up — Story 5.2 ONLY changes the spacecraft pose.

## Rule 5 amendments (load-bearing — list the planning-artifact changes the dev agent makes)

The dev agent makes the following inline amendments to planning artifacts per Rule 5:

1. **`_bmad-output/planning-artifacts/epics.md` Story 5.2 lines 1977-2000** — amend the binary "CK present" vs "CK absent" branch wording with a "Mixed coverage at PBD anchor (bus CK + platform synthesis)" block recording the actual ckbrief inventory finding. Original wording preserved; amendment block adds the mixed-coverage interpretation + the dev's choice for AC6 indicator label.
2. **`_bmad-output/planning-artifacts/epics.md` Story 5.2 line 1991-1992** — amend the "50× speedup" wording with the actually-computed speedup factor based on MISSION_FACTS.md historical sequence duration (likely ~100× per AC5's analysis). Original "50×" preserved as historical context; amendment block records the derived factor.
3. **If the dev chooses Option A for AC6 (extend the indicator with a new variant)** — the existing `<v-attitude-indicator>` AC contract in `epics.md` may need a 1-line amendment recording the new variant; the dev agent checks Story 3.6's section in `epics.md` and amends if needed (otherwise the variant is documented only in `v-attitude-indicator.ts` JSDoc).

Each amendment is recorded with original-vs-amended wording in the Dev Agent Record per Rule 5 discipline; the dev agent does NOT use code comments + `deferred-work.md` as a workaround.

## Out of Scope (Defer to Specific Later Stories)

- **Photo-plate compositing during the sweeping substates.** Story 5.3 owns the actual NASA Photojournal plate compositing at each `sweeping_<body>` substate's peak ET.
- **L4 Playwright visual regression at PBD substates.** Story 5.4 owns this. Story 5.2's smoke evidence is single-iteration lead-driven; the per-substate pixel-diff coverage is Story 5.4.
- **Camera framing during PBD.** Story 5.2 changes V1's pose; the camera follows V1 per the existing cruise-default camera. A PBD-specific camera framing that "follows the turn" cinematically is a potential Story 5.X follow-up — NOT in scope for Story 5.2.
- **Audio cue at PBD chapter activation.** Epic 6 Story 6.1 owns the Golden Record audio integration.
- **Friendly-user testing session.** Story 6.5 owns. AC8 here is prep, not the session.

## Tasks / Subtasks

- [x] **T1 — Apply Rule 5 amendments to epics.md (AC2, AC5, optionally AC6)**
  - [x] T1.1: Amend Story 5.2 lines 1977-2000 with the mixed-coverage interpretation. Preserve original wording in an `<!-- Amended by Story 5.2 -->` block.
  - [x] T1.2: Amend Story 5.2 line 1991-1992 with the derived speedup factor. Compute from MISSION_FACTS.md historical sequence duration; document the math.
  - [x] T1.3 (conditional): Option B chosen for AC6 — no Story 3.6 indicator AC contract change needed (binding choice documented in the Story 5.2 amendment block instead).

- [x] **T2 — Implement platform-quat override in the PBD module (AC3)**
  - [x] T2.1: Added `getPlatformQuatOverride(naifId, et): Quaternion | null` method on `PaleBlueDot` class. Returns the synthesized aim quaternion during sweeping substates; null otherwise.
  - [x] T2.2: Implemented the V1→target aim math in new `turn-choreography.ts` — `computePlatformAimQuat()` reads `EphemerisService.getPosition(targetNaifId, et)` and `getPosition(V1_NAIF_ID, et)`, subtracts, normalizes, then rotates the J2000 direction INTO BUS frame via `q_bus.inverse()` before calling `THREE.Quaternion.setFromUnitVectors([0,0,1], dirBus)`. The bus-frame transformation is load-bearing per Dev Notes "CRITICAL".
  - [x] T2.3: Added per-substate-transition SLERP via `TurnChoreography` class. Tracks `prevAimQuat`, `currentAimQuat`, `slerpStartWallMs`; interpolates with `easeOutCubic(elapsed / SLERP_DURATION_MS)` (SLERP_DURATION_MS = 400 mirrors `--v-duration-slow`).
  - [x] T2.4: Reduced-motion path: `ReducedMotionProbe` defaults to `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. When true the SLERP is bypassed and `setActiveSubstate` snaps directly to the new aim.

- [x] **T3 — Wire the override into AttitudeApplier (AC3 Path A — recommended)**
  - [x] T3.1: Added optional `pbdOverrideProvider: PlatformQuatOverrideProvider | null` field on `AttitudeApplier` (interface declared in same file).
  - [x] T3.2: In `AttitudeApplier.applyOne()` at the platform-quat read, the override provider is consulted FIRST; if non-null, the override is applied and `attitudeService.getPlatformQuat` is skipped; else fall through to the service as before.
  - [x] T3.3: Wired the PBD module instance as override provider in `main.ts` post-ManifestLoader (alongside `paleBlueDot.setServices(ephemeris, attitudeService)`).

- [x] **T4 — Implement AC6 attitude indicator choice (one of Options A / B / C)**
  - [x] T4.1: **Option B selected — keep the indicator as-is.** Rationale recorded in the epics.md Rule 5 amendment block (and in the Decisions section below).
  - [x] T4.2: No code change to `<v-attitude-indicator>` (Option B = nothing to change). The bus provenance `'ck'` correctly drives the existing "ATT CK reconstructed" render path.
  - [x] T4.3: No existing-test changes needed; the reconstruction caveat is verified via the new copy test (T5.2).

- [x] **T5 — Verify Story 5.1 copy text for reconstruction acknowledgement (AC6 last clause)**
  - [x] T5.1: Re-read `web/src/chapters/pale-blue-dot/copy.ts`. The original body mentioned "turns back" + "narrow-angle camera sweeps" but did NOT explicitly mention "reconstruct" / "synthesize". Per Option B rationale (the copy is the right venue for the reconstruction caveat), the copy is amended.
  - [x] T5.2: Amended copy.ts body to append "The scan-platform aim shown here is reconstructed from ephemeris constraints; the body turn is from the historical CK." Word count: 118 (within 80-120). Added a new test asserting body matches `/reconstruct/i`.

- [x] **T6 — Tests (AC2/3/4/5/7)**
  - [x] T6.1: 7 unit tests for `computePlatformAimQuat` in `turn-choreography.test.ts` — identity-bus aim, non-identity-bus aim, null ephemeris paths, unit-norm check, zero-direction edge case, PBD_TARGET_NAIF_IDS table.
  - [x] T6.2: 8 unit tests for `TurnChoreography` SLERP behaviour — start state, first-aim snap, mid-transition dot-product brackets, post-window endpoint exact, same-substate no-op, non-sweeping null path, reset(), `getLatestQuat`.
  - [x] T6.3: 2 unit tests for reduced-motion path — injected probe returning true; default probe via happy-dom matchMedia.
  - [x] T6.4: Integration test (AC2) in `tests/pale-blue-dot-turn-integration.test.ts` — during sweeping_earth, BUS node quaternion equals AttitudeService quat exactly.
  - [x] T6.5: Integration tests (AC3 + AC7) — SCAN_PLATFORM quaternion equals the PBD override; boresight world-space +Z within 5° of V1→Earth AND V1→Venus.
  - [x] T6.6: Integration tests at 1× / 10× / 15s (≈100×) ET-step cadences — all 10 substate transitions fire in order; manual-scrub `pbdSubstateAt` resolution at boundary ETs.

- [x] **T7 — DEV-only debug accessor extension (AC9)**
  - [x] T7.1: Extended PaleBlueDot with `currentTargetNaifId` and `currentPlatformOverrideQuat` instance getters. The existing `paleBlueDot` instance was already exposed under `__voyagerDebug.paleBlueDot` by Story 5.1; the new getters are available transparently via the same accessor (`__voyagerDebug.paleBlueDot.currentSubstate`, `.currentTargetNaifId`, `.currentPlatformOverrideQuat`). Comment in `main.ts` updated to document the lead's smoke probe paths.

- [ ] **T8 — Lead Chrome DevTools MCP smoke (AC9)**
  - [ ] T8.1-T8.3: Deferred to the lead per Rule 7 + ADR-0010 (smoke evidence at lead level). Dev work creates the `5-2-smoke-evidence/` directory placeholder; the lead populates it with the production-build screenshots + console-clean evidence after the lead-driven MCP probe.

- [x] **T9 — Friendly-user prep note (AC8)**
  - [x] T9.1: Authored `_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md`. 197 words. Lists the four J1-differentiator probes for Story 6.5: turn-noticed, mixed-coverage-honesty, per-target-recognition, reduced-motion-cut.

- [x] **T10 — Test sweep + lint + ADR compliance (AC10)**
  - [x] T10.1: `npm test` → 180 files, **3247 passed / 10 skipped** (baseline was 3189 — +58 new tests). `npm run typecheck` → clean. `npm run lint` → 4 warnings (baseline preserved; 0 new).
  - [x] T10.2: ADR-0014 / ADR-0015 / ADR-0023 compliance documented in Completion Notes.

## Dev Notes

### Critical context

- **The "binary branch" in the epic spec doesn't match reality.** Bus = CK; platform = synthesis-required. Per Rule 5, the planning artifact gets amended in place. Do NOT silently work around with code comments.
- **Story 5.1 established Path A topology** (subscriber-based wiring in `main.ts`). Story 5.2 extends that topology — same pattern, new wire-up point (`AttitudeApplier` instead of just the substate-update hook).
- **Story 5.1's `PaleBlueDot` class** is the canonical home for the new `getPlatformQuatOverride` method. The module is already a service-introducing class consumed by Story 5.2 (this story), 5.3 (composite layer), and 5.4 (L4 regression). Story 5.2's additions don't introduce a new service.
- **NA boresight FK constants** — `VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM = [0, 0, 1]` per `web/src/services/fk-constants.ts:106`. The aim quaternion is the rotation that brings this vector (in platform frame, post-bus-rotation) into alignment with the J2000 V1→target unit vector. Use `THREE.Quaternion.setFromUnitVectors(from, to)`.
- **CRITICAL: the platform quaternion is RELATIVE TO THE BUS** (per the existing `AttitudeApplier` parent-child convention — `SCAN_PLATFORM` is a child of `BUS` in the GLB hierarchy). The aim quat must be authored in BUS frame, not J2000 frame: the desired direction in BUS frame is the J2000 direction transformed by the INVERSE of the bus CK quaternion. Document this clearly in the PBD module's `getPlatformQuatOverride` JSDoc; the dev agent verifies the math direction against the V1J encounter where CK platform data exists (AttitudeService produces a correct platform quat; the PBD synthesis must match the same frame convention).

### Previous Story Intelligence

- **Story 5.1 Path A subscriber pattern** — `chapterDirector.subscribe((event) => { if (event.chapter.slug === 'pale-blue-dot' && event.to === 'held') ...; if (event.to === 'exiting') ... })`. Story 5.2 piggybacks on the SAME subscriber (or adds a sibling subscriber) — the activate/deactivate semantics match exactly. Don't create a new subscription topology; reuse the existing one.
- **Story 5.1 cinematic arc timings** are offset seconds from anchor ET. Story 5.2 just reads the substate at the current simulation ET — no separate time-mapping engine needed; the speed multiplier scales simulation ET, which naturally scales the substate progression.
- **Story 3.6 `<v-attitude-indicator>` Lit class-field-shadowing trap** (Rule 10). If Story 5.2 adds a new reactive property to `<v-attitude-indicator>` (Option A in AC6), USE `declare` + ctor-init pattern. The component already follows the pattern at `v-attitude-indicator.ts:158`.

### Architecture compliance

- **ADR-0014** — PBD module class extension; no new ADR needed.
- **ADR-0015** — override exposed via PBD module instance method; NOT a global store.
- **ADR-0023** — view-frame translation-only blend; PBD does NOT introduce camera rotation blends (T2.2's aim math is bus-relative quaternion synthesis, NOT camera rotation). The view-frame remains identity for PBD (Story 5.1 leaves `targetBody` undefined on the PBD spec, so `ViewFrameService` returns identity per ADR-0023 § "PBD" — the camera stays at world origin while V1 moves through its turn near-Earth-pointing).
- **ADR-0010** — Chrome DevTools MCP for agent-time browser verification, Playwright for CI-time. Story 5.2's lead smoke is MCP; Story 5.4's L4 regression is Playwright.

### Smoke method selection (Rule 8)

Pure web-side story. Lead-driven Chrome DevTools MCP smoke per Rule 8 + ADR-0010. AC9 codifies the smoke contract.

### Source tree components to touch

- `web/src/chapters/pale-blue-dot/index.ts` (UPDATE — add `getPlatformQuatOverride` + activate/deactivate state)
- `web/src/chapters/pale-blue-dot/turn-choreography.ts` (NEW — extract the per-substate aim math + SLERP if it grows too large for index.ts; dev's choice)
- `web/src/chapters/pale-blue-dot/copy.ts` (POTENTIALLY UPDATE — if AC6 last clause requires copy amendment)
- `web/src/render/attitude-applier.ts` (UPDATE — add override-provider field + override-first check)
- `web/src/main.ts` (UPDATE — wire PBD as override provider on AttitudeApplier)
- `web/src/components/v-attitude-indicator.ts` (CONDITIONAL UPDATE — Option A only)
- `web/src/services/fk-constants.ts` (READ-ONLY — consume the NA boresight constant)
- `_bmad-output/planning-artifacts/epics.md` (UPDATE — Rule 5 amendments to Story 5.2 lines 1977-2000 + 1991-1992)
- `_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md` (NEW)
- `_bmad-output/implementation-artifacts/5-2-smoke-evidence/` (NEW directory)
- Test files: `web/src/chapters/pale-blue-dot/*.test.ts` (extend Story 5.1's existing test files OR add new ones); `web/tests/pale-blue-dot-turn-integration.test.ts` (NEW)

### NFR tripwire watch

- **NFR-P10 (attitude precision ≤ 1 mrad)** — applies to the SLERPed bus quaternion (already validated by Story 3.7's L2 fixture). NOT load-bearing for the synthesized platform aim — the synthesis is for visual cinematics, not for L2 attitude validation. The L2 fixture excludes platform records when no CK is present (per Story 3.1 `_build_window_grid` behaviour). PBD platform synthesis lives outside the L2 envelope.
- **NFR-P5 (full-app bundle ≤ 150 MB)** — Story 5.2 adds < 5 KB of source. Negligible.

### References

- `_bmad-output/planning-artifacts/epics.md:1964-2005` — Story 5.2 spec (Rule 5 amendments target lines 1977-2000 + 1991-1992)
- `docs/kernels/ckbrief-inventory.md:288-301` — PBD coverage statement (bus YES, platform NO)
- `MISSION_FACTS.md:47-57` — PBD imaging-sequence anchor + Story 3.1 ck_sample.py window inclusion
- `web/src/services/attitude-service.ts:182-229` — `getBusProvenance`, `getPlatformProvenance`, `getBusQuat`, `getPlatformQuat`
- `web/src/services/fk-constants.ts:88-107` — HGA + platform + NA boresight constants
- `web/src/render/attitude-applier.ts:86-203` — per-frame applier (the override-first check goes here)
- `web/src/components/v-attitude-indicator.ts:158-263` — reactive provenance property, render branches
- `web/src/chapters/pale-blue-dot/index.ts` — PaleBlueDot class (extension target)
- `web/src/chapters/pale-blue-dot/substates.ts` — `pbdSubstateAt`, `PBD_SUBSTATE_ORDER`
- `web/src/main.ts` Path A subscriber pattern at the new PBD wire-up site (Story 5.1)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m]) via Claude Code on 2026-05-23, executed under the `/epic-cycle` Epic 5 cycle stage = dev.

### Debug Log References

No HALT conditions encountered. Test sweep + lint + typecheck all clean on first full sweep.

Tests added (running `npx vitest run` against new + extended files):

- `web/src/chapters/pale-blue-dot/turn-choreography.test.ts` — 25 tests pass
- `web/src/chapters/pale-blue-dot/index.test.ts` — 12 new Story 5.2 tests (in addition to Story 5.1's 23) — total 35 pass
- `web/src/chapters/pale-blue-dot/copy.test.ts` — 1 new Story 5.2 test (in addition to 10 Story 5.1) — total 11 pass
- `web/src/render/attitude-applier.test.ts` — 4 new Story 5.2 tests (in addition to the existing AC2/3/4/5 ones) — total 21 pass
- `web/tests/pale-blue-dot-turn-integration.test.ts` — 14 integration tests pass

Net delta: +58 tests beyond the Story 5.1 baseline (counted as the diff after `npm test`).

### Completion Notes List

- **Mixed-coverage decision** — implemented per the Rule 5 amendment block in epics.md: bus quaternion CK-driven via AttitudeService (unchanged); platform quaternion synthesized per-substate by PBD module via `getPlatformQuatOverride`. The override is wired through `AttitudeApplier.pbdOverrideProvider` (Path A) — `AttitudeApplier` consults the provider FIRST in `applyOne()`, only falls through to `attitudeService.getPlatformQuat` when the override returns null.
- **AC6 Option B chosen.** Indicator continues to render "ATT CK reconstructed" (bus provenance). The reconstruction caveat lives in the chapter copy (`pale-blue-dot/copy.ts`), which now explicitly says "scan-platform aim shown here is reconstructed from ephemeris constraints; the body turn is from the historical CK." Rationale in the epics.md Rule 5 amendment block + the Decisions section in the closing summary.
- **Math direction (load-bearing).** The aim quaternion is computed in BUS frame: `q_platform_local = setFromUnitVectors([0,0,1], busInverse · v_v1_to_target_j2000)`. This is correct because `SCAN_PLATFORM` is a child of `BUS` in the GLB hierarchy and Three.js composes parent quat then child quat. Verified by the integration test "boresight world +Z within 5° of V1→Earth at sweeping_earth peak" (passes against identity bus quat + non-trivial V1 position).
- **SLERP timeline is wall-clock-based, not ET-based.** The SLERP transitions run on `performance.now()` (default) over 400ms (`--v-duration-slow`). At extreme simulation speeds (100×) the substate may advance past the SLERP window before it completes, in which case the SLERP simply races to the new endpoint — the visual remains smooth and the math remains correct. Documented in `turn-choreography.ts` module header.
- **Reduced motion path.** `ReducedMotionProbe` defaults to `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. When true, `setActiveSubstate` snaps to the new aim with no SLERP. Two unit tests cover this — one with injected probe (deterministic) and one against happy-dom's default matchMedia.
- **AttitudeApplier override-first check is bus-agnostic.** AC2 holds: PBD does NOT touch the bus quaternion. The override only feeds the platform-node code path; the bus-node code path is unchanged. Verified by integration test "bus quaternion equals AttitudeService output exactly during sweeping_earth".
- **ADR-0014 compliance** — PBD remains the dedicated-module surface (per Story 5.1). Story 5.2 extends the same `PaleBlueDot` class with `getPlatformQuatOverride` + service refs; no new ADR needed.
- **ADR-0015 compliance** — override exposed via instance method on `PaleBlueDot`; injected into `AttitudeApplier` via DI assignment in `main.ts`. No global store introduced. The `__voyagerDebug.paleBlueDot` accessor exposes the same instance (DEV-only); it is NOT a global state singleton.
- **ADR-0023 compliance** — PBD does NOT touch the view-frame. The view-frame translation-only blend (V1J / V1S / V2J / V2S / V2U / V2N) remains identity for PBD (Story 5.1 left `targetBody` undefined on PBD_SPEC; that holds in Story 5.2).
- **Rule 10 N/A for this story.** Option B (AC6) means no new reactive property on `<v-attitude-indicator>`; the existing declare-pattern is preserved verbatim.
- **Rule 11 N/A.** No build-pipeline changes.
- **AC9 smoke deferred to lead.** Per task brief + Rule 7. The `5-2-smoke-evidence/` directory exists for the lead's screenshots after the Chrome DevTools MCP probe.

### File List

**New files:**

- `web/src/chapters/pale-blue-dot/turn-choreography.ts` — PBD aim math + SLERP engine (`computePlatformAimQuat`, `TurnChoreography` class, `PBD_TARGET_NAIF_IDS`, `targetNaifIdForSubstate`, `easeOutCubic`, `SLERP_DURATION_MS`).
- `web/src/chapters/pale-blue-dot/turn-choreography.test.ts` — 25 unit tests covering the aim math, SLERP behaviour, reduced-motion path, and DEV-accessor `getLatestQuat`.
- `web/tests/pale-blue-dot-turn-integration.test.ts` — 14 integration tests covering AC2 (bus unchanged), AC3 (override drives platform), AC5 (1× / 10× / 100× speeds), AC7 (boresight within 5° of target), AC9 (DEV accessor wire-up).
- `_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md` — friendly-user prep note (197 words). AC8 deliverable.
- `_bmad-output/implementation-artifacts/5-2-smoke-evidence/` — empty directory; lead populates with AC9 MCP smoke screenshots.

**Modified files:**

- `web/src/chapters/pale-blue-dot/index.ts` — added `setServices`, `getPlatformQuatOverride`, `currentTargetNaifId`, `currentPlatformOverrideQuat`, constructor opts (reducedMotion / wallClock test seams), `computeAimForSubstate` private helper. Updated `update()` to drive the choreography on substate change. Updated `dispose()` to reset choreography.
- `web/src/chapters/pale-blue-dot/index.test.ts` — added 12 tests for `getPlatformQuatOverride` + DEV accessors.
- `web/src/chapters/pale-blue-dot/copy.ts` — appended reconstruction sentence (body now 118 words; AC6 last clause + Option B rationale).
- `web/src/chapters/pale-blue-dot/copy.test.ts` — added `/reconstruct/i` body-match test.
- `web/src/render/attitude-applier.ts` — added `PlatformQuatOverrideProvider` interface + `pbdOverrideProvider` field + override-first check in `applyOne()`.
- `web/src/render/attitude-applier.test.ts` — added 4 tests covering the override-first behaviour (override applied, fall-through on null, no bus override, null-provider baseline).
- `web/src/main.ts` — wired `paleBlueDot.setServices(ephemeris, attitudeService)` and `attitudeApplier.pbdOverrideProvider = paleBlueDot` in the post-ManifestLoader block; updated DEV-accessor comment to document Story 5.2 probe paths.
- `_bmad-output/planning-artifacts/epics.md` — Rule 5 amendment blocks for Story 5.2 (mixed coverage + AC6 Option B; speedup factor recomputation).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 5.2 status `ready-for-dev` → `in-progress` (now → `review`).
- `_bmad-output/implementation-artifacts/5-2-choreographed-spacecraft-turn-ck-or-synthesized-per-coverage.md` — this file (Dev Agent Record + task check-offs + status).

### Rule 5 Amendment Log

**Amendment #1 — Mixed-coverage interpretation + AC6 Option B (epics.md Story 5.2 ACs after line 1988)**

*Original wording (preserved in place; this amendment block was appended after the original):*

The original spec presented PBD coverage as a binary "CK present" vs "CK absent" branch at epics.md:1977-1988:

> "Given CK coverage IS present for the PBD window … the V1 bus and scan-platform quaternions are driven by AttitudeService.getBusQuat/getPlatformQuat (CK-derived) …"
>
> "Given CK coverage is NOT present for the PBD window … the PBD module synthesizes per-target pointing … `<v-attitude-indicator>` shows 'ATT Synthesized (PBD reconstruction)' …"

*Amended interpretation (binding):*

The actual coverage state at the PBD anchor is MIXED per `docs/kernels/ckbrief-inventory.md:288-301`:

- BUS attitude: CK coverage IS present (`vgr1_super_v2.bc` covers 1990-02-14 continuously).
- SCAN PLATFORM: CK coverage IS NOT present (no platform_attitude CK at the PBD anchor; Story 4.0 type-1 path correctly skips PBD platform emission).

The binding implementation:
1. V1 bus quaternion: AttitudeService CK-driven (the "IS present" branch above) — PBD does NOT override the bus pose.
2. V1 platform quaternion: synthesized per-substate by the PBD module during `sweeping_<body>` substates, exposed via `PaleBlueDot.getPlatformQuatOverride()` consumed by `AttitudeApplier` via override-first check (Path A topology).
3. AC6 indicator label: **Option B** — keep the indicator as-is rendering "ATT CK reconstructed" (because the bus provenance IS CK, and the bus pose IS what the user sees the spacecraft body do). Options A and C explicitly rejected in the amendment block.

*Rationale:* Neither binary-branch in the original captured the mixed reality. Per Rule 5 the planning artifact is amended in place rather than the truth being scattered across code comments. Option B avoids HUD-vs-chapter-copy bloat — the chapter copy is the right venue for the reconstruction caveat (which the Story 5.2 copy amendment now lands).

**Amendment #2 — Speedup-factor recomputation (epics.md Story 5.2 AC after line 1995)**

*Original wording (preserved in place):*

> "the historical sequence (which took several real hours) is sped 50× by the PBD module's internal time mapping so the full turn + frustum sweep + composites read cinematically in approximately 2 minutes at 1× chapter playback"

*Amended interpretation (binding):*

The "50×" figure is a literal-as-written number; the actual factor follows from Story 5.1's authored cinematic arc length (180 simulated seconds in `PBD_SUBSTATE_TIMINGS`) and the MISSION_FACTS.md "several hours" historical duration (~5 hours = 18,000 seconds per Sagan 1994 and NASA/JPL "Voyager 1's Pale Blue Dot" narrative). Effective speedup: 18,000s / 180s = **~100×** (NOT 50×).

Implementation consequence: the PBD module does NOT carry a separate "time-mapping" engine. The substate ETs are offsets from the chapter anchor in simulated seconds; the ChapterDirector + ClockManager scale ET by the user's speed multiplier; substate-at-ET resolution naturally scales with playback speed. At 100× the SLERP windows (`--v-duration-slow`, ~400ms wall-clock) may extend past adjacent substates on the wall-clock timeline — acceptable per AC4 ("the choreography stays coherent").

*Rationale:* Per Rule 5, the planning artifact is amended in place. The "50×" wording is preserved as historical context; the binding factor is the COMPUTED ~100×.

**Amendment #3 — N/A.** Option B chosen for AC6 (no new `<v-attitude-indicator>` variant), so no Story 3.6 indicator AC contract change needed. The Option-B choice itself is documented in Amendment #1's block above.

### Change Log

- 2026-05-23 — Story 5.2 dev complete: PBD choreographed turn implemented; bus = CK / platform = synthesized per-substate via override-first check in AttitudeApplier (Path A); 58 new tests added across unit + integration tiers; copy amended with reconstruction caveat; Rule 5 amendments to epics.md inline (mixed-coverage + speedup-factor). Status `ready-for-dev` → `in-progress` → `review`.
- 2026-05-23 — Story 5.2 QA complete: 11 supplemental lifecycle tests added in `web/tests/pale-blue-dot-override-lifecycle.test.ts` (override deactivation on substate exit, chapter-exit semantics, V2 isolation, subscribe idempotency); web vitest 3258 passing / 10 skipped; typecheck clean; lint 4 warnings baseline preserved.
- 2026-05-23 — Story 5.2 code review APPROVED PENDING AC9 lead's MCP smoke (cr-5-2 / epic-cycle-2026-05-23-epic5). Three-layer adversarial sweep (Blind Hunter + Edge Case Hunter + Acceptance Auditor) executed against the diff (10 modified + 7 new files; +602 / -8 lines). All 10 ACs verified at the code/test tier; AC9 deferred to the lead per Rule 7 + ADR-0010. 0 HIGH findings; 1 MED auto-deferred (justified inline); 3 LOWs routed to `deferred-work.md`. Rule 1 (Integration AC AC9 is the override + applier wire-up; real-stack integration tests at `web/tests/pale-blue-dot-turn-integration.test.ts` exercise it). Rule 3 (smoke evidence — AC9 is lead's MCP probe; review approves pending smoke). Rule 5 (NFR tripwire — TWO amendments to `epics.md` verified in place: mixed-coverage interpretation + speedup-factor recomputation; original wording preserved; HTML-comment block format matches Story 4-0 prior amendments). Rule 6 (ADR violations) — ADR-0014 / ADR-0015 / ADR-0023 verified: PBD remains `ChapterModule`; override exposed via instance method (no global store); choreography rotates SCAN_PLATFORM, not view-frame. Rules 7/8/9/10/11 — N/A for this story (no MCP-tooling change; no APG primitive introduction; no Lit reactive property added — Option B; no build-pipeline script).

### Review Findings (cr-5-2 / 2026-05-23)

#### Adversarial review layers executed

1. **Blind Hunter** (diff-only, no project context) — focused on the override-first check structure, math direction in `computePlatformAimQuat`, SLERP state transitions, and copy text editorial integrity.
2. **Edge Case Hunter** (diff + project read access) — focused on stale-aim refresh inside `getPlatformQuatOverride`, bus-quat null timing, reduced-motion probe re-querying behaviour, V2/V1 isolation, dispose semantics, scene-graph ordering in `main.ts` two-onFrame-blocks layout.
3. **Acceptance Auditor** (diff + spec) — mapped each AC against implementation evidence; verified Rule 5 amendment format and the AC6 Option B test pin.

#### Verification matrix

| Spec point | Evidence | Verdict |
|---|---|---|
| **AC1** — ckbrief doc explicit | `docs/kernels/ckbrief-inventory.md:288-301` already explicit (per dev T1); no change required | OK |
| **AC2** — bus = CK; PBD does not override bus | `attitude-applier.ts:223-228` reads `attitudeService.getBusQuat(naifId, et)` unchanged for bus path; integration test `pale-blue-dot-turn-integration.test.ts:142-159` pins bus equality | OK |
| **AC3** — platform override synthesized; bus-frame math; override-first applier check | `turn-choreography.ts:204-213` inverts bus quat (`busThree.clone().invert()`) and applies it to the J2000 direction BEFORE `setFromUnitVectors([0,0,1], dirBus)`; `attitude-applier.ts:238-250` consults `pbdOverrideProvider` FIRST, short-circuits service call when non-null | OK |
| **AC4** — SLERP + reduced-motion instant cut | `turn-choreography.ts:379-391` SLERP-with-ease-out via `easeOutCubic(elapsed / SLERP_DURATION_MS)`; reduced-motion branch at 344-347 bypasses SLERP and clears prevAimQuat | OK |
| **AC5** — 100× speedup; correct at 1× / 10× / 100× | `pale-blue-dot-turn-integration.test.ts:240-340` exercises 1s / 10s / 15s ET-step cadences; substate sequence proceeds correctly | OK |
| **AC6** — Option B (indicator unchanged + copy mentions reconstruction) | `copy.ts:74-76` appends "scan-platform aim shown here is reconstructed from ephemeris constraints…"; `copy.test.ts:76-85` pins `/reconstruct/i`; body word count 118 ∈ [80, 120] | OK |
| **AC7** — cone aim within 5° of V1→target at peak | `pale-blue-dot-turn-integration.test.ts:192-238` asserts angular distance ≤ 5° for `sweeping_earth` + `sweeping_venus` via `bus * platform` world-space composition | OK |
| **AC8** — friendly-user prep < 200 words | `_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md` = 197 words; lists 4 J1-differentiator probes for Story 6.5 | OK |
| **AC9** — DEV accessor + lead's MCP smoke | `index.ts:182-196` exposes `currentTargetNaifId` + `currentPlatformOverrideQuat`; integration test pins accessor behaviour. **Lead's Chrome DevTools MCP smoke is REQUIRED (Rule 3) and is the final approval gate.** Smoke evidence directory placeholder exists at `_bmad-output/implementation-artifacts/5-2-smoke-evidence/`. | Pending lead smoke |
| **AC10** — test sweep + lint + ADR compliance | Web vitest 3258 passing / 10 skipped at QA close; typecheck clean; lint 4 warnings baseline preserved (no new); ADR-0014 / ADR-0015 / ADR-0023 compliance verified inline | OK |

#### Rule 5 amendment verification (load-bearing)

The two amendments in `_bmad-output/planning-artifacts/epics.md` (Story 5.2 section) were verified:

- **Amendment #1 (mixed coverage + AC6 Option B)** — appended after the original "CK present" / "CK absent" binary branch text (which is preserved verbatim). HTML-comment block format matches Story 4-0's prior amendment convention. Documents the bus = CK / platform = synthesized split, the override topology, and explicitly rejects Options A + C with rationale.
- **Amendment #2 (speedup factor recomputation)** — appended after the literal "50×" wording (preserved verbatim). Computes 18,000s / 180s = ~100× from MISSION_FACTS.md "several hours" interpretation (Sagan 1994) and Story 5.1's `PBD_SUBSTATE_TIMINGS` arc length. Documents that ChapterDirector + ClockManager naturally scale ET so no separate time-mapping engine is needed.

Both amendments cite the sources, derive the binding interpretation, and preserve the original wording in place. Rule 5 discipline is satisfied; planning artifact is honest, not papered over.

#### ADR compliance (Rule 6)

- **ADR-0014 (Hybrid Chapter Definition)** — `PaleBlueDot` remains a `ChapterModule` class implementer; Story 5.2 extends it with `setServices` + `getPlatformQuatOverride` + DEV accessors. No new ADR needed.
- **ADR-0015 (no global store)** — override exposed via the `PaleBlueDot` instance method; injected into `AttitudeApplier` via DI assignment in `main.ts:690` (Path A topology); the `__voyagerDebug.paleBlueDot` accessor is DEV-only per `import.meta.env.DEV` guard.
- **ADR-0023 (translation-only view-frame blend)** — Story 5.2 does NOT touch the view-frame. The choreography rotates `SCAN_PLATFORM` (a child of BUS in the GLB hierarchy); the view-frame remains identity for PBD because `PBD_SPEC.defaultFraming` is undefined and `PBD_SPEC.targetBody` is undefined (Story 5.1 left these so PBD stays heliocentric; that holds in Story 5.2). The translation-only blend invariant is untouched.

#### Auto-resolved findings (inline)

(none — no HIGH findings to auto-resolve)

#### Deferred findings (routed to deferred-work.md)

- **[5.2 / MED] `pbdOverrideProvider` is a public mutable field with no single-assignment guard.** Anyone could overwrite it at runtime. The wire-up site (`main.ts:690`) is the canonical injection, but the API allows accidental replacement.
- **[5.2 / LOW] `TurnChoreography.tick()` allocates one fresh `THREE.Quaternion` per frame during a SLERP window.** Consistent with the existing AttitudeService slerp pattern (Story 3.2 § Completion Note 9) — V8 nursery sweep absorbs it. Acceptable for the cinematic-quality use case but worth recording in case zero-allocation tightening surfaces.
- **[5.2 / LOW] Rule 5 amendment #1 in epics.md references the PRE-amendment copy ("already implicit").** The dev's actual Story 5.2 implementation also amended copy.ts to add the explicit "reconstructed from ephemeris constraints" sentence (T5.2). The amendment block is slightly stale relative to the as-shipped copy. Cosmetic; the binding Option-B decision is recorded correctly.
- **[5.2 / LOW] `PaleBlueDot.currentSubstate` accessor is not reset by `dispose()`.** The lifecycle test asserts `currentTargetNaifId` and `currentPlatformOverrideQuat` are null after dispose but `currentSubstate` remains at last value. Cosmetic; production wire-up always calls `update(et)` after dispose-and-reactivate sequences.

#### Approval

**APPROVED PENDING AC9 LEAD SMOKE.** Code-tier review found no HIGH or MED inline-fixable findings. The lead's Chrome DevTools MCP smoke at `/c/pale-blue-dot/` against the DEV build is the binding final gate per Rule 3 + Rule 7 + ADR-0010 — once the lead populates `_bmad-output/implementation-artifacts/5-2-smoke-evidence/` with the four AC9 screenshots + console-clean transcript, the story can transition `review → done`.

