# Story 4.0: Epic 3 Deferred Cleanup

**Epic:** 4 — Encounter Chapters (All Six Gas-Giant Flybys)
**Status:** review
**Date created:** 2026-05-22
**Source:** Epic 3 retrospective (`epic-3-retro-2026-05-22.md`) + `deferred-work.md` open Epic 3 items + the canonical Rule 5 NFR-tripwire response routed through `/epic-cycle`'s Story X.0 gate

## User Story

As the project maintainer,
I want Epic 3's CI-RED gating cleanup landed before any Epic 4 story dev begins — specifically the Story 3.1 cadence-amendment hotfix that closes the V2 Saturn 3.6 mrad NFR-P10 breach (Action #1 in the Epic 3 retro) and the type-1 PDS Rings ISS SEDR CK platform_attitude VTRJ gap (Action #2), plus the two voyager-skill-rules amendments the Epic 3 retro identified (Action #5 Lit `declare`-plus-ctor-init pattern; Action #6 build-pipeline scripts need end-to-end runtime tests), plus the cadence-adjacent Story 3.7 LOW follow-ups that pair naturally with the hotfix file edits while the file is open,
So that Epic 4 Story 4.1 can kick off against a green CI build, the L2 platform-attitude gate is active for the first time, the next Lit-component story (Story 4.4 detail-scrubber variant) doesn't re-discover the class-field-shadowing trap, and Story 4.3's build-pipeline expansion (cadence-shift trajectory chunks + 4K/8K KTX2 texture upgrade) starts against a code-review rule block that has already learned the Story 3.3 lesson.

## Triage Source

The full triage table covering every Epic 3 retro action item + every open deferred-work item from Story 3.x lives in § "Triage Table" below. Items are sorted into:

- **INCLUDE** — addressed by this story (becomes an AC); the corresponding `deferred-work.md` entry is struck through with a closing annotation pointing to Story 4.0 as part of completion.
- **DEFER** — carries forward per each item's existing routing target (Story 4.1/4.2 ChapterDirector wire, Story 4.3 LOD3-budget pass + build_glb dep declaration, Story 4.5 V1 Jupiter encounter for the post-CI-bake visual smoke, Story 7.x CI-hardening); no Story 4.0 work.
- **CLOSED-VERIFY** — items already implicitly closed by post-Epic-3 commits; this story strikes them through with a closing annotation pointing at the originating shipped story.
- **DROP** — explicitly rejected with rationale (none expected this cycle).

The triage table is the contract: every open Epic 3 item in `deferred-work.md` (as of `2026-05-22`) is accounted for. Items not in the table = drift; surface as a HIGH finding at code-review time per Rule 6 (Triage table integrity).

## Acceptance Criteria

### AC1 — Story 3.1 cadence amendment closes V2 Saturn NFR-P10 (`[3.7 / HIGH]` #1; Action #1 of Epic 3 retro — CI-RED gating)

- **GIVEN** Story 3.7's L2 fixture surfaces a worst-case bus angular error of **3.6029 mrad** at ET `-579086636.4` (V2 Saturn closest approach + several hours) — 3.6× over the NFR-P10 ≤ 1 mrad gate
- **AND** the root cause is `bake/src/ck_sample.py:73 CADENCE_5S = 5.0` (calibrated against V2 Uranus peak slew only); V2 Saturn active imaging is faster (knot-to-knot delta = 5.8 mrad over 5 sec), so 5-sec SLERP halves to ~3 mrad mid-interval — empirically matches the 3.6 mrad observation
- **AND** the canonical Rule 5 response is to amend `epics.md` Story 3.1 AC1 in place (NOT to relax NFR-P10, which option (d) in the deferred-work item explicitly REJECTED per user decision 2026-05-22)
- **WHEN** Story 4.0 lands the amendment
- **THEN** `bake/src/ck_sample.py` is amended so that the worst-case bus angular error across all encounter windows (V1J, V2J, V1S, V2S, V2U, V2N, V1 PBD) is ≤ 1 mrad against `pxform(J2000, VG{n}_SC_BUS, et)` ground truth, including the V2 Saturn ET `-579086636.4` failing knot
- **AND** the implementation chooses one of the three viable paths from the deferred-work item — (a) uniform tighter cadence (e.g., `CADENCE_5S = 2.0` or `1.0`), (b) `ENCOUNTER_CADENCE_OVERRIDE` keyed by slug, or (c) variable cadence around CA (1-sec inside ±1 hr CA, 5-sec elsewhere) — with the chosen path's rationale recorded in the docstring of the amended function (`_build_window_grid`) and in the Dev Agent Record (path (c) is the recommended starting point per the deferred-work entry; (a) is the fast-hotfix path if (c) proves complex)
- **AND** `epics.md` Story 3.1 AC1 (line ~1281) and `bake/src/ck_sample.py:_build_window_grid` docstring are both amended in place to reflect the chosen cadence schedule — the original V2-Uranus-only calibration text is preserved as historical context, and the amendment block names V2 Saturn as the load-bearing surfacing case
- **AND** `bake/out/` attitude VTRJ sizes remain within NFR-P4 (≤ 35 MB first paint) and NFR-P5 (≤ 150 MB full) budgets (the deferred-work item estimates path (a)/(c) at 2.5–5× current size, still well under budget)
- **AND** the `[3.7 / HIGH]` #1 V2 Saturn cadence entry in `deferred-work.md` is struck through with a closing annotation pointing to Story 4.0

### AC2 — Story 3.1 `_build_window_grid` emits `platform_attitude` VTRJs for type-1 PDS Rings ISS SEDR CKs (`[3.7 / HIGH]` #2; Action #2 of Epic 3 retro)

- **GIVEN** `bake/src/ck_sample.py:_intersect_interval` strictly filters `lo < hi` (line 152), dropping zero-duration `(t, t)` intervals — the canonical shape of type-1 CK records (one per ISS shutter event for the platform structures `-31100` / `-32100`)
- **AND** the platform coverage union therefore appears empty → `bake_attitude` emits `"[SKIP] ... empty ET grid"` for every platform structure → no `v*_platform_attitude.*.bin.br` files are produced
- **AND** the L2 platform-comparison gate in `web/tests/attitude-l2-fixture.test.ts:272-302` is therefore inactive — every fixture record routes to `n_platform_synthesized` (`compared=0, synthesized-skip=3000` in the lead's local AC8 smoke output)
- **AND** the runtime AttitudeService correctly falls back to the synthesized HGA-Earth-pointing path per Story 3.2 § AC4, but that path is NOT the SPICE ground truth
- **WHEN** Story 4.0 lands the amendment
- **THEN** type-1 zero-duration intervals are treated as discrete knot ETs in `_build_window_grid` (or `_intersect_interval`) and a `platform_attitude` VTRJ with explicit per-sample ETs (column-0 ET storage already supported per ADR-0004 § Body Layout per Kind, Story 3.1 amendment 2026-05-21) is emitted for at least the V2 Saturn window
- **AND** the implementation chooses one of the two paths from the deferred-work item — (a) amend `_build_window_grid` (or `_intersect_interval`) directly, or (b) add a fallback that polls the type-1 CK record set via `ckgp(struct_id, et, tol=0, ref)` at each knot ET and writes the resulting `(et, quat)` pairs as explicit-ET VTRJ rows — with the chosen path documented in the Dev Agent Record
- **AND** `bake/tests/test_ck_sample.py` gains a new test covering the type-1 zero-duration-interval case using a synthetic adversarial fixture (real PDS Rings ISS SEDR CKs are LFS-gated; the test must run in the fast-tier `bake/tests/` directory without spiceypy if possible, or in the slow-tier `bake/tests/test_bake_attitude_slow.py` if a real `ckgp` call is unavoidable)
- **AND** Story 3.7's L2 vitest diagnostic `[L2] platform records: compared=<N>, synthesized-skip=<M>` shows `compared > 0` and `synthesized-skip = 0` for V2 Saturn after the amendment lands
- **AND** the `[3.7 / HIGH]` #2 type-1 CK platform VTRJ gap entry in `deferred-work.md` is struck through with a closing annotation pointing to Story 4.0

### AC3 — L2 fixture regression gate activates the platform comparison (`[3.7 / LOW]` `n_platform_synthesized` regression-gate follow-up)

- **GIVEN** AC2 above lands the platform VTRJs, `n_platform_synthesized` should drop to zero and `n_platform_compared` should rise to match the fixture's platform record count
- **AND** a future regression in Story 3.1 that re-broke platform VTRJ emission would silently slip past Story 3.7's L2 gate (the bus assertion would still pass; platform would silently revert to `n_platform_synthesized > 0`)
- **WHEN** Story 4.0 hardens the L2 fixture
- **THEN** `web/tests/attitude-l2-fixture.test.ts` adds `expect(n_platform_synthesized).toBe(0)` (or `expect(n_platform_compared).toBeGreaterThan(0)`) as a one-line regression assertion guarded by the same `describe.skipIf(!fixturePresent)` block, so the gate stays green when the fixture is absent locally but fires on any platform-VTRJ regression in CI
- **AND** the corresponding `[3.7 / LOW]` `n_platform_synthesized` informational-only entry in `deferred-work.md` is struck through with a closing annotation pointing to Story 4.0

### AC4 — Story 3.7 cadence-adjacent code-review LOW follow-ups closed inline (`[3.7 / LOW]` dead-helpers + `_bus_quat_at` guard + `chosen_ets` dedup)

- **GIVEN** the Story 3.7 code review filed seven LOW deferred items in `_bmad-output/implementation-artifacts/deferred-work.md` lines 584–631, several of which live in files Story 4.0 is already touching for AC1/AC2 (`bake/src/l2_attitude_validation.py` and `bake/src/ck_sample.py`)
- **WHEN** Story 4.0 closes the cadence-adjacent ones while the files are open
- **THEN** four LOW items are resolved inline:
  - `bake/src/l2_attitude_validation.py` drops the unused runtime helpers `_sample_uniform_in_intervals` (lines ~303-342) and `_intersect_two_coverages` (lines ~261-286) and their `bake/tests/test_l2_attitude_validation.py` unit tests (Decision D1 pivoted to `random.Random.sample` on a discrete knot set, leaving these helpers unused; recommendation (a) from the deferred-work item)
  - `bake/src/l2_attitude_validation.py:_bus_quat_at` (lines ~345-375) gains a `try / except SpiceyError: return None` guard mirroring `_platform_quat_at`'s pattern; the caller increments `n_dropped_bus` on `None` — closes both the `_bus_quat_at` SpiceyError-guard LOW and the `n_dropped_bus` unreachable-branch LOW as a paired fix
  - `bake/src/l2_attitude_validation.py` line ~588 `in_band_knots = sorted(set(...))` defends `rng.sample(in_band_knots, k=samples_per_window)` against duplicate-knot ETs that future kernel dedup steps might produce — closes the `chosen_ets` dedup LOW
- **AND** the four corresponding `deferred-work.md` entries are struck through with a closing annotation pointing to Story 4.0
- **AND** `cd bake && uv run pytest -q` passes (drop the unused helpers' tests as part of the same change; do NOT leave orphan test definitions referencing deleted functions)

### AC5 — voyager-skill-rules Rule 10 codifies Lit `declare` + ctor-init pattern (Action #5 of Epic 3 retro)

- **GIVEN** Story 3.6's `<v-attitude-indicator>` development burned ~half a day on a Lit class-field-shadowing trap: initial implementation used class-field initializers (`provenance = undefined`, `activeSpacecraftId = -31`, `attitudeService = null`) which silently shadow Lit's reactive accessors generated by `static properties` (lit.dev/msg/class-field-shadowing) → 19 of 25 unit tests failed on first run
- **AND** the same trap was applied to `<v-hud>.embedEnabled` in the same story
- **AND** Epic 4 introduces at least one new Lit component (Story 4.4 `<v-timeline-scrubber variant="detail">`; the variant adds reactive props on the scrubber's host) and Story 5.x will introduce more (`<v-attribution-panel>` variants, PBD overlay components)
- **WHEN** Story 4.0 amends `_bmad/custom/voyager-skill-rules.md`
- **THEN** a new **Rule 10 — Lit reactive properties use `declare` + ctor-init (Story 3.6 lesson, 2026-05-22)** is appended after the existing Rule 9, stating:
  - All Lit reactive properties declared via `static properties = { ... }` MUST be backed by `declare <name>: <type>` (no initializer) and initialized in the constructor body — NOT by class-field initializers
  - Pattern citation: `web/src/components/v-chapter-index.ts:235-262` (the canonical pattern Story 3.6 ultimately matched)
  - Why: Lit's `static properties` codegen generates reactive accessors after class-field initializers run, so class-field initializers silently shadow the accessors — runtime warning at lit.dev/msg/class-field-shadowing
  - Enforcement: `bmad-code-review` treats class-field-initialized Lit reactive properties as a HIGH finding (sibling of Rule 9's APG-primitive-inline-implementation HIGH)
- **AND** the rule's "Why" block cites the Story 3.6 incident (19/25 first-run failures + `<v-hud>.embedEnabled` repeat-occurrence in the same story) as the load-bearing motivation

### AC6 — voyager-skill-rules Rule 11 codifies build-pipeline E2E runtime tests (Action #6 of Epic 3 retro)

- **GIVEN** Story 3.3's `web/scripts/build_glb.ts` had 22 unit tests that passed without the full pipeline ever running; the lead's per-story smoke ran `npm run build-glb` end-to-end and surfaced two HIGH defects — (a) `writeTexturesAsKtx2()` handed WebP bytes to toktx which has no WebP decoder, and (b) `EXTMeshoptCompression` writer threw on missing `MeshoptEncoder` in NodeIO registry — that the unit-tier piece tests had no way to catch
- **AND** Epic 4 Story 4.3 (Cadence-Shift Trajectory Chunks + 4k→8k Texture Upgrade) will extend the build pipeline further (per-encounter cadence-refined chunks + 8K KTX2 emission for the gas giants); the unit-vs-E2E discipline established by Story 3.3 needs to carry forward
- **WHEN** Story 4.0 amends `_bmad/custom/voyager-skill-rules.md`
- **THEN** a new **Rule 11 — Build-pipeline scripts need end-to-end runtime tests (Story 3.3 lesson, 2026-05-22)** is appended after Rule 10, stating:
  - Any build script under `web/scripts/` or `bake/src/` that chains multiple library calls or shells out to external binaries (toktx, sharp, ffmpeg, gltf-transform, MeshoptEncoder, etc.) MUST have at least one end-to-end test that runs the full pipeline against a small real input fixture and asserts on the produced output bytes / file metadata — unit tests on individual functions are necessary but not sufficient
  - The E2E test may be a slow-tier (`@slow` / `slow-tier` marker) test gated by an environment variable or LFS-asset presence so it doesn't burden the default test sweep
  - Code review (`bmad-code-review`) treats a build-pipeline script PR that lacks an end-to-end test as a MED finding when the script touches a multi-binary chain, HIGH when the script ships an output artifact that production runtime consumes
- **AND** the rule's "Why" block cites Story 3.3 specifically — the two HIGH defects only surfaced when the lead ran `npm run build-glb` end-to-end despite 22 unit tests passing — as the load-bearing motivation

### AC7 — toktx + uv install paths verified in repo-root README (Action #7 of Epic 3 retro)

- **GIVEN** Story 3.3 documented the toktx + Khronos KTX-Software install steps in repo-root `README.md` § "Build-time tooling prerequisites" as the user manually accepted a Windows UAC prompt during the smoke gate
- **AND** Story 3.7 also added `uv` as a bake-time prereq when CK kernels need re-baking locally
- **AND** Action #7 of the Epic 3 retro is "verify only" — extend with the CI install verification step
- **WHEN** Story 4.0 verifies the prerequisite documentation
- **THEN** `README.md` § "Build-time tooling prerequisites" is read and confirmed to list both toktx (Khronos KTX-Software, version-pinned per Story 3.3) and uv (Astral, version-pinned per Story 1.4 / Story 3.7)
- **AND** if either is missing or under-documented, the section is amended in place — including the CI install verification reference (`.github/workflows/ci.yml` job step name(s) that install each tool, so future contributors can grep)
- **AND** a one-line "Verified by Story 4.0 on 2026-05-22" note is appended to the section's bottom (or to a `<!-- -->` HTML comment if user prefers it invisible — defer to existing README style)

### AC8 — Integration AC: Story 3.7 L2 fixture passes against amended bake outputs (load-bearing closure of AC1 + AC2 + AC3)

- **GIVEN** ACs 1, 2, and 3 collectively re-shape the bake-output and L2-test contracts
- **AND** the binding gate is that the Story 3.7 L2 vitest fixture (`web/tests/attitude-l2-fixture.test.ts`) passes against the amended bake outputs — bus angular error ≤ 1 mrad across all sampled records (closing AC1) AND `n_platform_synthesized === 0` for at least the V2 Saturn window (closing AC2 + AC3) AND no fixture-skip-path regressions
- **WHEN** Story 4.0 closes the cycle
- **THEN** the lead's local L2 smoke run (re-bake → re-generate fixture → run `web/tests/attitude-l2-fixture.test.ts` against the new fixture) produces:
  - 3000-record fixture: bus diagnostic shows `worst-case angularError < 1.0e-3 rad` across all encounter windows including V2 Saturn (was 3.6e-3 rad pre-amendment)
  - Platform diagnostic: `[L2] platform records: compared=N, synthesized-skip=0` for V2 Saturn (was `compared=0, synthesized-skip=3000` pre-amendment)
  - The vitest `expect(n_platform_synthesized).toBe(0)` from AC3 passes
- **AND** the smoke evidence is committed under `_bmad-output/implementation-artifacts/4-0-smoke-evidence/` matching the Story 3.7 pattern: `bake-rerun-output.txt`, `l2-fixture-post-amendment.json` (sample, not full), `vitest-l2-fixture-output.txt`
- **AND** CI on the post-Story-4.0 commit is GREEN (the canonical Rule 5 surfacing closure: CI was RED on Epic 3 merge because the L2 gate was load-bearingly intact; CI is green again after the upstream Story 3.1 amendment lands)

### AC9 — Test sweep + lint baseline preserved + ADR compliance verified

- **GIVEN** the project's test pyramid (web vitest 2340 / bake pytest ~390 / typecheck clean / 4 lint warnings) is the inherited Epic 3 baseline
- **WHEN** Story 4.0 ships
- **THEN** web vitest pass count is ≥ 2341 (one new test in AC3 — the regression assertion; existing tests do not regress)
- **AND** bake pytest pass count is preserved or rises (AC2 adds a type-1 CK test; AC4 drops 8 dead-helper tests as part of removing the helpers — net should be ≤ +5 or so depending on path choice; document precise delta in Dev Agent Record)
- **AND** `npm run typecheck` is clean
- **AND** `npm run lint` shows ≤ 4 warnings (the pre-existing baseline; 0 new)
- **AND** the three pre-existing failures noted in Story 3.7's cycle-log entry (`test_adr_catalogue` × 2 from Story 3.5 ADR-0028, `test_ci_defense` × 1 from Story 3.3 build-glb job not in EXPECTED_JOBS) — re-evaluate whether they're now close-able; document the call in the Dev Agent Record (do NOT silently normalize per the Epic 3 retro's "never normalize known failures" lesson)
- **AND** ADR-0004 (§ Body Layout per Kind, explicit-ET VTRJ rows), ADR-0010 (bake-tier L1 / runtime-tier L2 split), ADR-0011 (LFS kernel storage), and ADR-0024 (sign-flip walk pre-bake) compliance is verified in the Dev Agent Record (Rule 6)

## Out of Scope (Defer to Specific Later Stories)

The following Epic 3 retro action items + deferred-work LOW items are NOT in Story 4.0 — each is routed to its natural landing per the triage table:

- **Action #3** (Wire ChapterDirector → `<v-attitude-indicator>.setActiveSpacecraft` per the `activeSpacecraftChanged` CustomEvent contract) → Story 4.1 or 4.2 dev (the ChapterDirector substate transitions and the ViewframeService landing are the natural place to wire the consumer hook).
- **Action #4** (`[3.4 / LOW]` Post-CI-bake visual smoke at V1 Jupiter — verify cone aims at Io + scan platform articulates per CK SLERP) → Story 4.5 lead-driven smoke (V1 Jupiter encounter is when the CK-articulation visual evidence is naturally exercised).
- **Action #8** (`[3.3 / LOW]` LOD3 size budget breach — 1032 KB vs ≤ 100 KB target) → Story 4.3 polish pass (the cadence-shift + texture-upgrade story is where the asset pipeline tuning naturally sits; gltf-transform `simplify` `error` param tuning or explicit silhouette mesh authoring lands there).
- **`[3.3 / LOW]`** `web/scripts/build_glb.ts` lacks a CI WebP→PNG transcode dependency declaration → Story 4.3 (same locus as Action #8; AC6's new Rule 11 makes the gap visible at code-review time so it doesn't slip past Story 4.3).
- **`[3.5 / LOW]`** `BoresightRenderer.dispose()` unit test spies on `EdgesGeometry.dispose` only, not `ConeGeometry.dispose` → Epic 7 polish (test-quality finding; no production behavior implication).
- **`[3.5 / LOW]`** `readCssVar` → `new Color(accentHex)` doesn't defend against malformed CSS variable value → Epic 7 polish (production tokens are in-repo + lint-clean; defensive only).
- **`[3.7 / MED]`** L1 + L2 + L3 wall-clock budget (NFR-M4 ≤ 5 min) not measured nor CI-enforced → Story 7.x CI-hardening pass (Story 4.0 may push CI timing measurably because AC1's cadence change increases bake size 2.5-5×; the measurement infrastructure is the right scope for Story 7.x, not Story 4.0).
- **`[3.7 / LOW]`** `prefetchAttitudeChunks` per-chunk error attribution → Story 7.x CI-hardening or Epic 7 polish (diagnostic quality only; CI never produces partial artifacts).
- **`[3.7 / LOW]`** `fixturePresent` gate doesn't verify chunk-file presence → Story 7.x CI-hardening (partial-copy scenario is rare in CI; the actual `chunkLoader.load` failure surfaces at runtime).

## Consumed-by

Story 4.0 introduces no new services. It amends two existing services (`bake/src/ck_sample.py`, `bake/src/l2_attitude_validation.py`), one runtime test (`web/tests/attitude-l2-fixture.test.ts`), one planning artifact (`_bmad-output/planning-artifacts/epics.md` Story 3.1 AC1), one repo-root doc (`README.md` § Build-time tooling prerequisites), and the project's skill-rules surface (`_bmad/custom/voyager-skill-rules.md`).

The downstream consumers of the amendments are all of Epic 4 (any encounter that exercises the platform-attitude SPICE ground truth), Epic 5 (PBD's choreographed turn validation), Story 4.4 (next Lit-component story benefits from Rule 10), and Story 4.3 (build-pipeline expansion benefits from Rule 11).

## Tasks / Subtasks

- [x] **T1: Story 3.1 cadence amendment** (AC1)
  - [x] T1.1: Decide cadence path (a/b/c) — chose **path (c) variable cadence around CA**. Rationale: AC2 already requires explicit-ET VTRJ schema for type-1 platform CKs, so the schema cost is paid either way; path (c) preserves Story 3.1 AC1's original mixed-schedule design intent + gives best NFR-P10 headroom with smallest size growth. Initial implementation used ±1 hour inner band; AC8 smoke surfaced V2 Saturn at CA + 2.59 hours still breaching the gate → widened to ±4 hours.
  - [x] T1.2: Amended `bake/src/ck_sample.py` — added `CADENCE_1S = 1.0` and `HALF_WIDTH_1S = 14400.0` (4 hours); `_build_window_grid` now generates inner (1-sec, ±4hr) + outer (5-sec, ±2day minus inner via `_subtract_ranges`) bands and concatenates via `np.unique`. All pre-existing constants (`CADENCE_5S`, `CADENCE_10S`, `CADENCE_1MIN`, `CADENCE_DAILY`) preserved.
  - [x] T1.3: `_build_window_grid` docstring extended with the variable-cadence schedule + the V2 Saturn surfacing case + the ±1hr → ±4hr widening rationale + updated storage cost paragraph; the Story 3.1 amendment 2026-05-21 V2-Uranus-only calibration is preserved as historical context.
  - [x] T1.4: Re-baked locally via `bake/.venv/Scripts/python.exe -m src.ck_sample` (lead's venv with SpiceyPy 8.1.0 installed). 13 attitude files produced; total brotli-compressed ~14 MB — well within NFR-P4 (≤35 MB) / NFR-P5 (≤150 MB) budgets.
  - [x] T1.5: Amended `_bmad-output/planning-artifacts/epics.md` Story 3.1 AC1 in place per Rule 5; 2026-05-21 amendment text preserved as historical context; 2026-05-22 (Story 4.0 hotfix) amendment block added naming V2 Saturn + the ±4hr widening.
  - [x] T1.6: Struck through `[3.7 / HIGH]` V2 Saturn cadence entry in `deferred-work.md` with closing annotation pointing to Story 4.0.

- [x] **T2: Type-1 CK platform_attitude VTRJ emission** (AC2)
  - [x] T2.1: Chose **path (a) — amend `_build_window_grid` / `_intersect_interval`** over (b) ckgp polling. Path (a) is cleaner — bypasses `_build_window_grid` for type-1 shapes via a detector + extractor + an inline branch in `bake_attitude`, avoids a second code path for `ckgp` polling, reuses `sample_window_pointing_only` which is already correct.
  - [x] T2.2: Added `_is_type1_coverage(coverage)` + `_extract_knot_ets_in_band(coverage, band)` helpers to `bake/src/ck_sample.py`. `bake_attitude` branches on `_is_type1_coverage(merged)` for platform structures and uses `_extract_knot_ets_in_band` to harvest discrete knot ETs as the ET grid. The existing `vtrj_writer.write_vtrj(..., ets=...)` explicit-ET schema (ADR-0004 § Body Layout per Kind column-0 ET storage) consumes the irregular grid directly.
  - [x] T2.3: Added 7 fast-tier tests to `bake/tests/test_ck_sample.py` covering `_is_type1_coverage` detection (positive + negative + mixed cases), `_extract_knot_ets_in_band` filtering + sorting + dedup + empty cases, AND a synthetic-fixture test (`test_type1_synthetic_fixture_simulates_pds_iss_sedr_shape`) that pins the AC2 contract using 60 shutter-event-shaped knots without requiring LFS-gated real CKs per ADR-0011.
  - [x] T2.4: Re-baked locally and confirmed `v*_platform_attitude.*.bin.br` emitted for all 6 platform windows (V1J, V1S, V2J, V2S, V2U, V2N); V1 PBD correctly skipped per `docs/kernels/ckbrief-inventory.md` (no scan-platform CK coverage).
  - [x] T2.5: Struck through `[3.7 / HIGH]` type-1 CK platform VTRJ gap entry in `deferred-work.md`.

- [x] **T3: L2 fixture regression gate activation** (AC3)
  - [x] T3.1: Re-generated L2 fixture via `bake/.venv/Scripts/python.exe -m src.l2_attitude_validation` → 3000 records, 1.10 MB (within 2 MB cap).
  - [x] T3.2: Added `expect(n_platform_synthesized).toBe(0)` AND `expect(n_platform_compared).toBeGreaterThan(0)` to `web/tests/attitude-l2-fixture.test.ts` inside the existing `describe.skipIf(!fixturePresent)` block; updated the `[L2] platform records` diagnostic log to reference Story 4.0 AC3 as the regression gate.
  - [x] T3.3: Ran vitest with the new fixture → all 3 assertions pass; diagnostic shows `compared=3000, synthesized-skip=0` (was `compared=0, synthesized-skip=3000` pre-amendment).
  - [x] T3.4: Struck through `[3.7 / LOW]` `n_platform_synthesized` informational-only entry in `deferred-work.md`.

- [x] **T4: Story 3.7 LOW follow-ups bundled with the cadence-adjacent edits** (AC4)
  - [x] T4.1: Dropped `_sample_uniform_in_intervals` + `_intersect_two_coverages` from `bake/src/l2_attitude_validation.py` (~80 LOC + their docstrings + the corresponding 8 unit tests from `bake/tests/test_l2_attitude_validation.py`).
  - [x] T4.2: Added `try / except SpiceyError: return None` guard to `_bus_quat_at`, changed return type to `tuple[float, float, float, float] | None`, and updated the docstring to record the Story 4.0 AC4 amendment. The caller's `if bus_quat is None: n_dropped_bus += 1; continue` branch is now live (was dead before).
  - [x] T4.3: Added `in_band_knots = sorted({et for et in platform_knot_ets if band[0] <= et <= band[1]})` defensive dedup (set-comprehension + sorted) before the `rng.sample` call. Production behavior unchanged today; hardens against future kernel-pipeline dedup steps.
  - [x] T4.4: Struck through the four corresponding `deferred-work.md` entries (`_sample_uniform_in_intervals`/`_intersect_two_coverages` unused helpers; `_bus_quat_at` SpiceyError guard; `n_dropped_bus` unreachable branch; `chosen_ets` dedup).

- [x] **T5: voyager-skill-rules Rule 10 — Lit `declare` + ctor-init** (AC5)
  - [x] T5.1: Appended Rule 10 to `_bmad/custom/voyager-skill-rules.md` after Rule 9. Structure mirrors Rule 9: rule statement (no class-field initializers on Lit reactive properties; use `declare` + ctor-init); applies-to context (Epic 4 + Epic 5 introduce more Lit components); CORRECT vs WRONG code examples; enforcement (HIGH at code-review time, sibling of Rule 9); incident citation (Story 3.6 19/25 first-run failures + `<v-hud>.embedEnabled` repeat occurrence).
  - [x] T5.2: Cited `web/src/components/v-chapter-index.ts:235-262` as the canonical pattern. Cited lit.dev/msg/class-field-shadowing for the runtime warning.

- [x] **T6: voyager-skill-rules Rule 11 — Build-pipeline E2E runtime tests** (AC6)
  - [x] T6.1: Appended Rule 11 to `_bmad/custom/voyager-skill-rules.md` after Rule 10. Structure mirrors Rules 9/10: applies-to scope (build scripts under `web/scripts/` or `bake/src/` that chain multiple libraries / shell out to external binaries); enforcement (MED for missing E2E with unit coverage, HIGH when the script ships a production-runtime artifact); slow-tier acceptable.
  - [x] T6.2: Cited Story 3.3 as the load-bearing incident: 22 unit tests passed; lead's per-story smoke ran `npm run build-glb` end-to-end and surfaced (a) WebP→toktx no-decoder defect + (b) MeshoptEncoder registry defect — both invisible at the unit tier.

- [x] **T7: README verification** (AC7)
  - [x] T7.1: Read repo-root `README.md` § "Build-time tooling prerequisites" (lines 208-218).
  - [x] T7.2: Verified both toktx (Khronos KTX-Software, v4.3.2 pin) and uv (Astral, `.python-version` pin) are listed with install instructions per OS + the bake-glb workflow.
  - [x] T7.3: Extended the uv row's "Notes" cell with explicit CI install reference (`astral-sh/setup-uv@v3` step name); extended the toktx row's "Notes" cell with explicit CI step name (`install toktx (Khronos KTX-Software v4.3.2)`); appended an HTML comment "Verified by Story 4.0 on 2026-05-22 (toktx + uv documented with version pins + explicit CI install references per AC7)".

- [x] **T8: Integration AC — L2 fixture passes against amended bake** (AC8)
  - [x] T8.1: Bundled T1–T4 changes; ran full re-bake (`bake/.venv/Scripts/python.exe -m src.ck_sample`) → 13 attitude files; ran L2 fixture regen (`bake/.venv/Scripts/python.exe -m src.l2_attitude_validation`) → 3000 records / 1.10 MB; ran `bake/.venv/Scripts/python.exe scripts/copy_bake_to_web.py` + manual JSON copy → web/public/data populated; ran `npx vitest run tests/attitude-l2-fixture.test.ts` → ALL 3 TESTS PASS (NFR-P10 gate + sort-order + unit-norm).
  - [x] T8.2: Smoke evidence captured under `_bmad-output/implementation-artifacts/4-0-smoke-evidence/`: `bake-rerun-output.txt` (full ck_sample.py output for all 13 attitude files), `l2-fixture-post-amendment.json` (sample: first 10 + last 5 of 3000 records), `vitest-l2-fixture-output.txt` (full vitest run with `compared=3000, synthesized-skip=0`), `worst-case-by-window.txt` (per-window worst-case bus + platform angular errors).
  - [x] T8.3: Worst-case bus angular error verified at **0.749 mrad** (was 3.6 mrad pre-amendment), comfortably under the 1 mrad NFR-P10 gate at the previously-failing V2 Saturn ET (-579086636.401438, CA+2.59hr). All other windows ≤ 0.158 mrad. Platform records all compared (n_platform_synthesized=0).

- [x] **T9: Final sweep + lint + ADR-compliance documentation** (AC9)
  - [x] T9.1: web: `npm run typecheck` clean; `npm run lint` 4 warnings (baseline preserved); `npx vitest run` → **2343 pass / 2 skipped / 129 files** (≥ 2341 gate satisfied). Updated 3 ephemeris/manifest tests + 1 production runtime fix in `web/src/services/ephemeris-service.ts` (constructor now filters `body.files` to `kind === 'trajectory'` before indexing — bug surfaced by AC8 smoke that the binary-search picked attitude files for trajectory queries inside encounter windows).
  - [x] T9.2: bake: `bake/.venv/Scripts/python.exe -m pytest -q -m "not slow"` → **394 pass / 4 skipped / 19 deselected** (+4 from 390 baseline: T2 added 7 type-1 tests; T4 dropped 8 helper tests; AC9 re-evaluation **closed all 3 pre-existing failures** per the "closable in scope" call documented in the Issues Encountered section below — never normalized).
  - [x] T9.3: ADR-0004 (§ Body Layout per Kind explicit-ET VTRJ rows used for variable-cadence inner band + type-1 platform VTRJs); ADR-0010 (bake-tier L1 / runtime-tier L2 split preserved); ADR-0011 (LFS kernel storage — type-1 synthetic test runs without LFS); ADR-0024 (sign-flip walk pre-bake preserved via existing `walk_signs` call). All four ADRs verified compliant in the implementation.

## Dev Notes

### Critical files (current state, what Story 4.0 touches)

- `bake/src/ck_sample.py`
  - **AC1 touches**: `CADENCE_5S` (line 73), `_build_window_grid` (line 208), the docstring around lines 224–258 documenting the empirical history. Preserve the docstring's empirical-history block — extend it with the V2 Saturn finding rather than replacing.
  - **AC2 touches**: `_intersect_interval` (line 143) — the `if lo < hi` strict filter is the load-bearing trap; either change to `lo <= hi` with a downstream-consumer check OR introduce a separate path for type-1 CKs that preserves the zero-duration knots. Read the full `sample_window` caller (lines 279+) before deciding.

- `bake/src/l2_attitude_validation.py`
  - **AC4 touches**: `_sample_uniform_in_intervals` (lines ~303-342, drop), `_intersect_two_coverages` (lines ~261-286, drop), `_bus_quat_at` (lines ~345-375, add SpiceyError guard), line ~588 (`in_band_knots = sorted(set(...))`).

- `web/tests/attitude-l2-fixture.test.ts`
  - **AC3 touches**: add the regression assertion inside the existing `describe.skipIf(!fixturePresent)` block. The current diagnostic emission is at lines 317–322 (platform records compared/synthesized-skip log).

- `_bmad-output/planning-artifacts/epics.md`
  - **AC1 amendment**: Story 3.1 AC1 at line ~1281. Pattern to follow: the existing "Amended 2026-05-21 (Story 3.1 slow-tier calibration): ..." block. Add a parallel "Amended 2026-05-22 (Story 4.0 hotfix): ..." block immediately after; preserve the 2026-05-21 amendment text as historical context.

- `_bmad/custom/voyager-skill-rules.md`
  - **AC5 + AC6**: append Rule 10 (Lit `declare` + ctor-init) and Rule 11 (build-pipeline E2E tests) after the existing Rule 9. Follow the structure of Rule 9 (heading → applies-to context → obligations → why with incident citation).

- `README.md` (repo root)
  - **AC7**: verify § "Build-time tooling prerequisites" lists toktx + uv + CI install reference. Amend if missing.

### Previous Story Intelligence

**Story 3.0 (Epic 2 deferred cleanup)** — the canonical template for Story X.0:
- Pattern: triage table at end + INCLUDE/DEFER/CLOSED-VERIFY/DROP buckets + closing-annotation strikethroughs in `deferred-work.md`.
- Mistake to avoid: Story 3.0's `<v-attitude-indicator>` predecessor (the `<v-hud-instruments>` placeholder fill from Story 2.9 → Story 3.6) showed that Lit class-field initializers shadow `static properties` accessors silently — AC5 above codifies the fix.

**Story 3.1 (CK kernel bake pipeline)** — origin of the cadence amendment AC1 closes:
- The 5-sec uniform calibration in Story 3.1 was empirically tuned against V2 Uranus peak slew (`docs/kernels/ckbrief-inventory.md` shows V2 Uranus Miranda imaging at ~4 hr pre-CA is the V2 Uranus worst case). V2 Saturn was not in the calibration set.
- The `_build_window_grid` docstring lines 224–258 records the empirical history; AC1's amendment extends it.

**Story 3.6 (`<v-attitude-indicator>` HUD provenance element)** — the load-bearing incident for AC5:
- The dev-stage notes in `sprint-status.yaml:50` (the `2026-05-22: 3-6 set to review ...` block) document the class-field-shadowing trap and the resolution pattern (`declare` + ctor-init mirroring `v-chapter-index.ts:235-262`).

**Story 3.7 (L2 JS-vs-SPICE attitude consistency)** — surfaced AC1, AC2, AC3, AC4:
- The lead's local smoke evidence at `_bmad-output/implementation-artifacts/3-7-smoke-evidence/local-real-data-output.txt` shows the V2 Saturn 3.6 mrad finding + the `compared=0, synthesized-skip=3000` platform finding.
- The Vitest L2 fixture (`web/tests/attitude-l2-fixture.test.ts:317-322`) is the canonical diagnostic surface; AC3 hardens it.

### Cadence-path decision rubric (AC1 T1.1)

The deferred-work item recommends (c) variable cadence around CA as the "cleanest" path; (a) uniform tighter is the "fast hotfix." The lead's call at T1.1:

- **Pick (a) `CADENCE_5S = 1.0`** (or `2.0`) if you want the smallest diff against the existing code path and the bake-output size growth (≤ 5×) is acceptable. Estimated 30 minutes implementation.
- **Pick (c) variable cadence (1-sec inside ±1 hr CA, 5-sec elsewhere)** if you want to preserve the spirit of Story 3.1 AC1's original mixed-schedule design and minimize bake-output growth. Requires the explicit-ET VTRJ schema path (already supported per ADR-0004 § Body Layout per Kind) and additional `_build_window_grid` complexity. Estimated 90 minutes implementation.
- **Pick (b) `ENCOUNTER_CADENCE_OVERRIDE` keyed by slug** if you want the surgical minimum (only V2 Saturn changes), at the cost of carrying an override-dict that diverges from the other encounters' calibration. Estimated 45 minutes implementation. Lower preference — the override pattern obscures the "calibrated for slow X but failing for fast Y" lesson.

The recommendation in this story's text is (c) → (a) → (b); the developer agent has discretion to pick (a) for fastest CI-green if (c) proves complex during T1.2.

### NFR / ADR compliance pointers

- **NFR-P10 (≤ 1 mrad attitude error)**: AC1 directly closes this.
- **NFR-P4 / P5 (size budgets)**: AC1 must verify post-amendment sizes; the deferred-work item estimates 2.5–5× growth, still well under budget.
- **NFR-M4 (≤ 5 min CI wall-clock)**: AC1 may push CI timing measurably; the `[3.7 / MED]` budget-measurement gap is explicitly DEFERRED out-of-scope to Story 7.x.
- **ADR-0004 § Body Layout per Kind** — Story 3.1 amendment 2026-05-21 already blessed explicit-ET VTRJ rows; AC2's emit-platform-VTRJ work uses this column-0 ET storage.
- **ADR-0010 (bake-tier L1 / runtime-tier L2 split)** — AC3's regression assertion lives on the L2 side (vitest), correctly per the ADR.
- **ADR-0011 (LFS kernel storage)** — AC2's type-1 CK test should use synthetic adversarial fixtures, NOT real LFS-gated PDS Rings ISS SEDR CKs, for fast-tier execution.
- **ADR-0024 (sign-flip walk pre-bake)** — preserved by both AC1 (cadence-only change, no quaternion direction change) and AC2 (new per-knot quaternion samples still flow through `walk_signs`).

## References

- Epic 3 retrospective: `_bmad-output/implementation-artifacts/epic-3-retro-2026-05-22.md` (Action items 1, 2, 5, 6, 7)
- Deferred work: `_bmad-output/implementation-artifacts/deferred-work.md` lines 510-631 (Story 3.7 HIGH × 2, MED × 1, LOW × 7)
- Story 3.7 dev evidence: `_bmad-output/implementation-artifacts/3-7-smoke-evidence/local-real-data-output.txt`
- Story 3.7 cycle log: `_bmad-output/implementation-artifacts/cycle-log-epic-3.md` (the `3-7 set to review ...` entry in `sprint-status.yaml:48` mirrors it)
- voyager-skill-rules: `_bmad/custom/voyager-skill-rules.md` (Rules 1-9 currently; AC5/AC6 append Rules 10-11)
- Epics planning artifact (Story 3.1 AC1 amendment target): `_bmad-output/planning-artifacts/epics.md:1270-1305`
- Bake source: `bake/src/ck_sample.py:73-276` (cadence + window-grid), `bake/src/l2_attitude_validation.py` lines ~261-630 (LOW-cleanup targets)
- L2 fixture test: `web/tests/attitude-l2-fixture.test.ts:272-322` (platform comparison block + diagnostic emission)
- Lit canonical pattern reference: `web/src/components/v-chapter-index.ts:235-262`

## Triage Table — Epic 3 retro action items + Epic 3 deferred-work items (2026-05-22)

| Item | Source | Triage Decision | Routing |
|---|---|---|---|
| Action #1: Story 3.1 cadence-amendment hotfix (V2 Saturn 3.6 mrad) | Epic 3 retro | **INCLUDE** | AC1 (T1) |
| Action #2: Story 3.1 type-1 CK platform_attitude VTRJ gap | Epic 3 retro | **INCLUDE** | AC2 (T2) |
| Action #3: Wire ChapterDirector → `<v-attitude-indicator>.setActiveSpacecraft` | Epic 3 retro | **DEFER** | Epic 4 Story 4.1 or 4.2 dev |
| Action #4: Post-CI-bake visual smoke at V1 Jupiter (CK articulation) | Epic 3 retro / `[3.4 / LOW]` | **DEFER** | Epic 4 Story 4.5 lead smoke |
| Action #5: Encode Lit `declare` + ctor-init pattern in voyager-skill-rules.md | Epic 3 retro | **INCLUDE** | AC5 (T5) |
| Action #6: Add build-pipeline E2E runtime tests guideline | Epic 3 retro | **INCLUDE** | AC6 (T6) |
| Action #7: Verify toktx + uv install paths in README | Epic 3 retro | **INCLUDE** | AC7 (T7) |
| Action #8: `[3.3 / LOW]` LOD3 size budget breach (1032 KB vs ≤100 KB) | Epic 3 retro / `[3.3 / LOW]` | **DEFER** | Epic 4 Story 4.3 polish pass |
| `[3.7 / HIGH]` V2 Saturn cadence | deferred-work.md L512 | **INCLUDE** | AC1 (same as Action #1) |
| `[3.7 / HIGH]` Type-1 CK platform_attitude VTRJ gap | deferred-work.md L551 | **INCLUDE** | AC2 (same as Action #2) |
| `[3.7 / MED]` L1+L2+L3 wall-clock NFR-M4 not measured | deferred-work.md L576 | **DEFER** | Story 7.x CI-hardening |
| `[3.7 / LOW]` Unused `_sample_uniform_in_intervals` + `_intersect_two_coverages` | deferred-work.md L584 | **INCLUDE** | AC4 (T4.1) |
| `[3.7 / LOW]` `_bus_quat_at` SpiceyError guard | deferred-work.md L591 | **INCLUDE** | AC4 (T4.2) |
| `[3.7 / LOW]` `n_dropped_bus` unreachable branch | deferred-work.md L598 | **INCLUDE** | AC4 (T4.2, paired with above) |
| `[3.7 / LOW]` `chosen_ets` dedup | deferred-work.md L605 | **INCLUDE** | AC4 (T4.3) |
| `[3.7 / LOW]` `prefetchAttitudeChunks` per-chunk error attribution | deferred-work.md L612 | **DEFER** | Story 7.x or Epic 7 polish |
| `[3.7 / LOW]` `fixturePresent` chunk-presence check | deferred-work.md L619 | **DEFER** | Story 7.x CI-hardening |
| `[3.7 / LOW]` `n_platform_synthesized` regression gate (follow-up) | deferred-work.md L626 | **INCLUDE** | AC3 (T3) |
| `[3.4 / LOW]` CK-window articulation visual smoke gated on bake-attitude | deferred-work.md L447 | **DEFER** | Epic 4 Story 4.5 (paired with Action #4) |
| `[3.3 / LOW]` LOD3 size budget breach | deferred-work.md L476 | **DEFER** | Epic 4 Story 4.3 (paired with Action #8) |
| `[3.3 / LOW]` `build_glb.ts` lacks CI WebP→PNG transcode dep declaration | deferred-work.md L487 | **DEFER** | Epic 4 Story 4.3 |
| `[3.5 / LOW]` `BoresightRenderer.dispose()` unit test spy gap | deferred-work.md L496 | **DEFER** | Epic 7 polish |
| `[3.5 / LOW]` `readCssVar` malformed-value defense | deferred-work.md L503 | **DEFER** | Epic 7 polish |

**Triage integrity check:** every Epic 3 retro action item (1-8) and every open Epic 3 deferred-work item (lines 414-631 covering Stories 3.1, 3.2, 3.3, 3.4, 3.5, 3.7) is accounted for. Items not in this table = drift; Rule 6 HIGH at code-review time.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context) — spawned via `/epic-cycle` Agent tool 2026-05-22T20:55Z, completed ~48 min later.

### Debug Log References

- AC1 cadence-path decision: `bake/src/ck_sample.py:_build_window_grid` docstring (amended block) records the empirical-history extension covering the V2 Saturn surfacing case and the inner-band widening from ±1hr to ±4hr.
- AC2 type-1 detection logic: `bake/src/ck_sample.py:_is_type1_coverage` + `_extract_knot_ets_in_band` (new helpers); branched at `bake_attitude` for platform structures.
- AC4 cleanup audit-trail: `_bmad-output/implementation-artifacts/deferred-work.md` strikethroughs for `[3.7 / LOW]` × 5 + `[3.7 / HIGH]` × 2 (AC1 + AC2 closures).
- AC8 smoke evidence: `_bmad-output/implementation-artifacts/4-0-smoke-evidence/{bake-rerun-output.txt, l2-fixture-post-amendment.json, vitest-l2-fixture-output.txt, worst-case-by-window.txt}`.

### Completion Notes List

1. **Cadence path (c) was the correct call** — AC2 already requires the explicit-ET VTRJ schema for type-1 platform CKs, so the schema cost is paid once and amortizes across both ACs. Initial ±1hr inner band proved insufficient (V2 Saturn at CA+2.59hr still breached the 1 mrad gate); widened to ±4hr to give NFR-P10 headroom. Final worst-case bus angular error: **0.749 mrad** at V2 Saturn (was 3.6029 mrad pre-amendment — 4.8× improvement). All other windows ≤ 0.158 mrad.
2. **Platform comparison gate now active** for the first time — all 6 platform windows emit VTRJs (V1J, V1S, V2J, V2S, V2U, V2N); V1 PBD correctly skipped per `docs/kernels/ckbrief-inventory.md` (no scan-platform CK coverage there — synthesized HGA-pointing fallback per Story 3.2 § AC4). L2 fixture: `compared=3000, synthesized-skip=0` (was 0/3000 pre-amendment).
3. **Pre-existing failures re-evaluated + ALL CLOSED in scope** per the "never normalize" rule from Epic 3 retro: `test_adr_catalogue` × 2 (Story 3.5 ADR-0028 row addition was already in the catalogue but pre-Story-4.0 the defense test had a stale ADR-count constant); `test_ci_defense` × 1 (Story 3.3 `build-glb` job was missing from `EXPECTED_JOBS` whitelist). Documented in Issues Encountered below.
4. **AC9 surprise — production runtime bug surfaced by AC8 smoke**: `web/src/services/ephemeris-service.ts` constructor was indexing ALL body.files entries including attitude files; binary-search inside encounter windows picked attitude files for trajectory queries. Bug pre-dates Story 4.0 but only became symptomatic when Story 3.1's amended bake started emitting platform VTRJs (Story 3.7's L2 fixture never exercised this code path). Fixed in same commit per Rule 5 (the production bug is a load-bearing implication of AC8's amendment, not a separate scope).
5. **Rule 10 + Rule 11 appended to voyager-skill-rules.md** with the same structure as Rules 1-9 (rule statement → applies-to → enforcement → why with incident citation). Both rules cite Story 3.6 (class-field shadowing) and Story 3.3 (build-pipeline E2E gap) as the load-bearing motivation.
6. **AC2's 7 fast-tier tests use synthetic adversarial fixtures** (zero-duration `(t, t)` intervals simulating PDS Rings ISS SEDR shutter events) per ADR-0011 (LFS-gated real CKs stay out of fast-tier).

### Issues Encountered

1. **V2 Saturn ±1hr inner band still breached the gate at CA+2.59hr** (worst-case 1.7 mrad with ±1hr inner band). Diagnosis: V2 Saturn's CK coverage extends ~3.5hr post-CA with active imaging; the ±1hr inner band missed the late-imaging knots. Resolution: widened `HALF_WIDTH_1S` to 4 hours (14400s). Re-ran → 0.749 mrad worst-case at CA+2.59hr. Final size impact remains within NFR-P4/P5.
2. **Pre-existing `test_adr_catalogue` failures (Story 3.5 ADR-0028 defense)**: the test counted ADRs against a hard-coded 28 vs 29 mismatch — Story 3.5 had updated the README index correctly but not the defense test's `EXPECTED_ADR_COUNT`. One-line fix; no behavioral change. Closed in scope per "never normalize" lesson.
3. **Pre-existing `test_ci_defense` failure (Story 3.3 build-glb job)**: `EXPECTED_JOBS` whitelist in `bake/tests/test_ci_defense.py` didn't include `build-glb` (Story 3.3's new CI job). One-line fix. Closed in scope per "never normalize" lesson.
4. **AC8 smoke surfaced a `web/src/services/ephemeris-service.ts` regression** that all 4 automated tiers passed because no test exercised an attitude-VTRJ-bearing manifest entry against ephemeris-service's body-file index. Fixed inline per Note 4 above; added 3 defense tests pinning the trajectory-only filter contract.

### File List

**Bake (Python — the cadence amendment + type-1 platform VTRJ emission):**
- `bake/src/ck_sample.py` — AC1 cadence amendment (path (c) variable-cadence inner ±4hr / outer ±2day bands) + AC2 type-1 detection helpers (`_is_type1_coverage`, `_extract_knot_ets_in_band`) + branched platform path in `bake_attitude`
- `bake/src/l2_attitude_validation.py` — AC4 cleanup (drop `_sample_uniform_in_intervals` + `_intersect_two_coverages` helpers; `_bus_quat_at` SpiceyError guard + `n_dropped_bus` branch activation; `chosen_ets` defensive dedup)
- `bake/tests/test_ck_sample.py` — AC2 7 new fast-tier tests covering type-1 detection + knot extraction + synthetic-fixture contract (no LFS dependency)
- `bake/tests/test_l2_attitude_validation.py` — AC4 dropped 8 unit tests for the deleted helpers
- `bake/tests/test_adr_catalogue.py` — Issue #2 close (pre-existing): EXPECTED_ADR_COUNT 28 → 29 to reflect Story 3.5's ADR-0028 addition
- `bake/tests/test_adr_catalogue_defense.py` — Issue #2 paired defense update
- `bake/tests/test_bake_defense.py` — incidental: bake-attitude / bake-trajectories recipe assertions updated for the amended cadence schedule
- `bake/tests/test_ci_defense.py` — Issue #3 close: EXPECTED_JOBS whitelist extended with `build-glb`

**Web (L2 regression gate + production runtime fix surfaced by smoke):**
- `web/tests/attitude-l2-fixture.test.ts` — AC3 regression assertions (`expect(n_platform_synthesized).toBe(0)` + `expect(n_platform_compared).toBeGreaterThan(0)`) inside existing skip-path guard
- `web/src/services/ephemeris-service.ts` — AC9 Note 4 fix: constructor filters `body.files` to `kind === 'trajectory'` before indexing
- `web/src/services/manifest-loader.test.ts` — fixture updates for amended manifest shape
- `web/tests/ephemeris-defense.test.ts` — 3 new defense tests pinning trajectory-only filter contract
- `web/tests/ephemeris-l2-hook.test.ts` — incidental adjustment for the new ephemeris-service body-file filter
- `web/public/data/manifest.json` — regenerated from the amended bake (lead's local re-bake output)
- `web/public/data/l2-attitude-fixture.json` — regenerated 3000-record fixture (untracked; copied from `bake/out/l2-attitude-fixture.json`)

**Planning + rules + docs:**
- `_bmad-output/planning-artifacts/epics.md` — AC1 amendment to Story 3.1 AC1 (2026-05-22 (Story 4.0 hotfix) block preserving 2026-05-21 historical context)
- `_bmad/custom/voyager-skill-rules.md` — AC5 Rule 10 (Lit `declare` + ctor-init) + AC6 Rule 11 (build-pipeline E2E runtime tests)
- `README.md` — AC7 extended toktx + uv "Notes" cells with explicit CI step references + Story 4.0 verification HTML comment

**Sprint + audit-trail:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story 4.0 status transitions (ready-for-dev → in-progress → review)
- `_bmad-output/implementation-artifacts/deferred-work.md` — 7 strikethroughs (AC1 + AC2 HIGHs + AC3 + AC4 × 4 LOWs) with closing annotations pointing to Story 4.0
- `_bmad-output/implementation-artifacts/4-0-epic-3-deferred-cleanup.md` — this file (Status promoted ready-for-dev → review)
- `_bmad-output/implementation-artifacts/cycle-log-epic-4.md` — dev_complete entry

**Smoke evidence (AC8 / Rule 3):**
- `_bmad-output/implementation-artifacts/4-0-smoke-evidence/bake-rerun-output.txt`
- `_bmad-output/implementation-artifacts/4-0-smoke-evidence/l2-fixture-post-amendment.json`
- `_bmad-output/implementation-artifacts/4-0-smoke-evidence/vitest-l2-fixture-output.txt`
- `_bmad-output/implementation-artifacts/4-0-smoke-evidence/worst-case-by-window.txt`

**Local-only artifacts (not committed):**
- `bake/out/l2-attitude-fixture.json` — bake-side mirror of the L2 fixture; CI generates this from a clean re-bake

## Review Findings (Code Review — 2026-05-22)

Reviewer: claude-opus-4-7 (1M context) via `/bmad-code-review` under `/epic-cycle` stage.
Diff scope: branch `epic4` uncommitted changes — 19 modified files + 3 new QA-gap test files + 4 smoke-evidence files. 881 insertions / 397 deletions.

**Verdict: APPROVED with 1 HIGH auto-resolved inline + 4 LOWs deferred (none load-bearing on Epic 4 kickoff).**

### Verified gates

- **Test sweeps re-run by reviewer:**
  - web vitest: **2363 pass / 2 skipped** (Dev Agent Record claim 2343; +20 from the 2 new QA-gap files). Matches QA brief.
  - bake pytest fast-tier: **414 pass / 4 skipped / 19 deselected** (Dev Agent Record claim 394; +20 from the new `test_ck_sample_qa_gaps.py` file). Matches QA brief.
  - web typecheck: clean (zero output).
  - web lint: **4 warnings, 0 errors** — baseline preserved per AC9.
- **Rule 5 (NFR tripwire):** AC1's `epics.md` Story 3.1 AC1 amendment is in place; 2026-05-21 historical context preserved; 2026-05-22 (Story 4.0 hotfix) block names V2 Saturn as the load-bearing surfacing case. VERIFIED.
- **Rule 6 (ADRs):** ADR-0004 (Body Layout per Kind — explicit-ET column-0 storage honored for variable-cadence + type-1 paths), ADR-0010 (L2 regression gate lives on vitest side), ADR-0011 (type-1 fast-tier test uses synthetic adversarial fixture, no LFS), ADR-0024 (`walk_signs` preserved). No Accepted-ADR violations.
- **Rule 1 (Integration AC):** AC8 evidence chain complete — `4-0-smoke-evidence/worst-case-by-window.txt` shows worst-case bus angular error 0.7486 mrad at V2 Saturn CA+2.59hr (was 3.6 mrad pre-amendment, 4.8× improvement); `vitest-l2-fixture-output.txt` shows `compared=3000, synthesized-skip=0` and 3/3 tests pass.
- **Rule 3 / Rule 7 (per-story smoke evidence):** Story 4.0 touches `web/src/services/ephemeris-service.ts` (production runtime constructor). Code-side prerequisites present (dev server navigable URL, observable canvas/HUD surface). PASS-with-deferral-to-lead — the lead's Chrome DevTools MCP smoke runs immediately after this approval per Rule 7.
- **Triage table integrity (Story 4.0 self-imposed):** all 8 open Epic 3 deferred-work entries (post-strikethrough) appear in the triage table. No drift.
- **Production runtime fix (`ephemeris-service.ts` `kind === 'trajectory'` filter):** CORRECT. The constructor's `findSegmentFile` already guards `sortedFiles.length === 0`, so the empty-trajectory-list case is handled. Other `body.files` iterators in the codebase reviewed: `main.ts` prefetch (intentionally loads attitude chunks too), `attitude-service.ts` (already kind-filtered independently), `dev/ephemeris-perf.ts` (DEV-only, not production). The 3 new defense tests + 12 QA gap tests collectively pin the contract: per-spacecraft file count (V1=12, V2=19, total 41), per-kind split, celestial bodies unaffected, mixed-kind body trajectory query routes to trajectory file, no-trajectory-body construction doesn't throw.
- **Pre-existing failure closures (Issue #2 + #3):** verified NOT silently suppressed — `test_adr_catalogue.EXPECTED_NUMBERED_ADRS` was raised from `range(1, 28)` to `range(1, 29)` to reflect Story 3.5's ADR-0028 file actually present on disk (verified — `docs/adr/0028-narrow-angle-only-wide-angle-deferred-v11.md` exists). `test_adr_catalogue_defense.KNOWN_FILENAME_TITLE_DIVERGENCES` got the paired ADR-0028 entry documenting the "narrow" → "NA" filename-vs-title divergence. `test_ci_defense.EXPECTED_JOBS` extended with `"build-glb"` (Story 3.3's CI job). All three closures are load-bearing reflections of real state, not normalization.

### HIGH (1) — auto-resolved inline

- **[BH-1 / HIGH] Documentation drift between `HALF_WIDTH_1S` constant and 7 docstring/comment lines in `bake/src/ck_sample.py`** — `HALF_WIDTH_1S = 14400.0` (= ±4 hours) is correct, but the module docstring (line 12), `_build_window_grid` docstring (lines 285, 329), inner-band inline comment (line 386), double-sampling-comment (line 393), `bake_attitude` docstring (line 556), and VTRJ-header cadence comment (line 717) still said "±1hr" / "1 hour" / "1-sec inside ±1hr CA". AC1 explicitly requires "the chosen path's rationale recorded in the docstring of the amended function (`_build_window_grid`)" — the canonical-schedule lines contradicting the implementation is a Rule 6 / AC1 violation since a future contributor reading the docstring would believe the inner band is 1 hour and not understand why V2 Saturn at CA+2.6hr is covered. **Resolution:** all 7 lines amended to say "±4 hours" / "±4hr" with cross-references to the `HALF_WIDTH_1S` constant declaration (which already documents the ±1hr → ±4hr widening rationale). Genuinely-historical references (e.g., "Initial Story 4.0 attempt used ±1 hour; raised to ±4 hours") preserved as audit trail. 53 ck_sample tests re-run after the docstring fix — all pass. Files: `bake/src/ck_sample.py`.

### MED — none

### LOW (4) — deferred (not load-bearing on Epic 4 kickoff)

- **[EC-1 / LOW]** `_extract_knot_ets_in_band` boundary tests don't pin exact `band_lo == knot` / `band_hi == knot` cases. The inclusive `band_lo <= a <= band_hi` filter is correct (a knot exactly at the band edge should count), but the dev tests cover 950/1050 inside `(900, 1100)` — neither boundary is tested at strict equality. Coverage-only LOW; no production bug.
- **[BH-5b / LOW]** `web/src/dev/ephemeris-perf.ts:98-103` iterates ALL `body.files` (including attitude entries) and uses `body.files[0].timeRangeEt[0]` / `body.files[length-1].timeRangeEt[1]` for ET-span computation. Post-Story-4.0 mixed-kind body shapes, the first entry on V1/V2 may be an attitude file, so the perf harness's ET sampler reports the wrong span. DEV-only harness, not production; no AC impact.
- **[AA-1 / LOW]** ADR-0004 § Body Layout per Kind cadence example still cites "10-sec near closest approach, 1-min through encounter, daily during CK-covered cruise — the mission cadence schedule" — pre-Story-3.1 numbers. Both Story 3.1 (5-sec uniform) and Story 4.0 (1-sec/5-sec variable) diverged from those numbers without amending the ADR. The ADR's structural commitment (explicit-ET column-0 storage, `cadence_seconds` informational only) IS honored by Story 4.0 — so NO Rule 6 HIGH — but the descriptive example numbers are triply-stale. Suggested amend at a future story (paired with Story 7.x kernel-drift report or the next bake-tier story that re-visits cadence).
- **[EC-8 / LOW]** Production `DEFAULT_LRU_CAPACITY = 12` (`web/src/services/chunk-loader.ts:208`) is less than V2's 19 files post-Story-4.0. Already covered by existing `[3.2 / LOW]` deferred-work entry (`AttitudeService.decodedByUrl` LRU mismatch) — that entry references 14 files, which is now stale; the reality is 19 files for V2. No new entry needed; the existing entry's resolution path (lockstep eviction or drop-cache) still applies. Routed to Epic 6 perf-pass per the existing entry's routing.

### Findings auto-resolved inline (HIGH)

- **BH-1** (cadence docstring drift): 7 docstring/comment lines amended in `bake/src/ck_sample.py` to match the actual `HALF_WIDTH_1S = 14400.0` (±4hr) value; 53 ck_sample fast-tier tests re-pass.
