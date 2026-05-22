# Story 3.7: L2 JS-vs-SPICE Attitude Consistency Validation in CI

**Epic:** 3 — Attitude Reconstruction (the Differentiator)
**Status:** done
**Date created:** 2026-05-22
**Source:** epics.md § Epic 3 Story 3.7 (lines 1508–1545); ADR-0007 (SpiceyPy over astroquery); ADR-0010 (CI-time Playwright; agent-time MCP); ADR-0011 (Git LFS); ADR-0024 (sign-flip walk pre-bake); NFR-P10 (≤ 1 mrad attitude accuracy); FR55 L2 validation gate; PRD § Testing pyramid.

## User Story

As the project maintainer,
I want a CI gate that asserts the JavaScript `AttitudeService` produces quaternions consistent with SpiceyPy ground truth at fixed-seed sample points inside every CK coverage window — closing the runtime-tier mirror of Story 3.1's L1 bake-tier validator,
So that the differentiator's accuracy is gated mechanically: FR55 L2 + NFR-P10 (≤ 1 mrad / 0.05° / 100 NA-pixel error) are operational across every push, and a future regression in `AttitudeService.getBusQuat` / `getPlatformQuat` cannot ship.

## Triage Source / Inheritance

- **Story 3.1** delivered the bake-tier L1 attitude validator (`bake/src/validate_l1.py` extension at AC5 — SciPy Slerp + SpiceyPy `ckgp` at K=100 random ETs seed=42, NFR-P10 max ≤ 1 mrad gate). Story 3.7 is the **runtime-tier mirror** of that gate: same ground truth (SpiceyPy ckgp), same tolerance (≤ 1 mrad), but the device-under-test is the JavaScript `AttitudeService` running in Node (vitest harness) rather than the Python validator.
- **Story 3.2** delivered `AttitudeService.getBusQuat(naifId, et)` / `getPlatformQuat(naifId, et)` — the binding under-test surface. Branded `Quaternion` type with Three.js scalar-last convention `[x, y, z, w]`; SPICE→Three.js permute happens once at decode.
- **Story 3.4** + **Story 3.5** + **Story 3.6** + the L1 bake validator collectively cover the per-frame application + visual + HUD + bake-tier integrity. Story 3.7 closes the loop by gating the runtime numerical fidelity against SpiceyPy ground truth.
- **Local environment constraint:** `uv` (and thus SpiceyPy 8.1.0) is not in the lead's local env this session (see Story 3.4 `[3.4 / LOW]` deferred-work). The Python fixture generator is authored as part of this story but executes in CI; locally, the Vitest test gracefully `describe.skipIf(fixtureMissing)` so the rest of the suite stays green.
- **Story 1.14** delivered the baseline CI workflow at `.github/workflows/ci.yml`. Story 3.7 adds an L2 attitude validation step.

## Acceptance Criteria

### AC1 — Python L2 fixture generator: `bake/src/l2_attitude_validation.py`

- **GIVEN** the Story 3.1 attitude bake outputs at `bake/out/v{1,2}_{bus,platform}_attitude.<window>.bin.br` and the CK kernels at `kernels/vgr{1,2}_super_v2.bc` + PDS Rings supplements
- **AND** the CK coverage inventory at `docs/kernels/ckbrief-inventory.md`
- **WHEN** `python -m src.l2_attitude_validation` runs (or `uv run python -m src.l2_attitude_validation`)
- **THEN** the script:
  1. Loads the standard SPICE kernel pool via the project's existing `_kernel_io` module (Story 1.3 + 1.4 pattern)
  2. Selects a fixed-seed (seed=42, same as L1 validator) set of `(spacecraft, et)` sample pairs — **≥ 500 pairs per spacecraft per CK coverage window**, drawn uniformly at random within each window's `[et_start, et_end]`. Total: ≥ 500 × 2 spacecraft × ~7-14 CK windows ≈ 7000-14000 pairs
  3. For each pair, computes:
     - `ground_truth_bus_quat` via SpiceyPy `pxform(from_frame, to_frame, et)` where `from_frame = 'VG{1,2}_SC_BUS'` and `to_frame = 'J2000'`, then converts the resulting 3×3 rotation matrix to a scalar-first SPICE quaternion via `m2q` (and permute to scalar-last for the fixture)
     - `ground_truth_platform_quat` via `ckgp(structure_id, et, tol, ref)` where `structure_id = -31100 / -32100`, `tol = 0`, `ref = 'J2000'`, returning a 3×3 C-matrix, converted to scalar-last quaternion via `m2q` + permute
  4. Writes `bake/out/l2-attitude-fixture.json` with records:
     ```json
     [
       {
         "spacecraftId": -31,
         "et": 100.5,
         "ckWindow": "v1-jupiter",
         "ground_truth_bus_quat": [x, y, z, w],
         "ground_truth_platform_quat": [x, y, z, w]
       },
       ...
     ]
     ```
- **AND** the script is deterministic across reruns (fixed RNG seed; sorted by `(spacecraftId, et)` ascending before write)
- **AND** the SPICE quaternion convention is documented in the script header: SPICE m2q returns scalar-first `[w, x, y, z]`; the fixture stores scalar-last `[x, y, z, w]` to match `AttitudeService`'s convention (Story 3.2 § AC2 SPICE→Three.js permute)
- **AND** the script honors the same sign-flip-walked convention as the L1 validator — Story 3.1's `quat_continuity.walk_signs` is applied at the BAKE side, so the runtime SLERP path doesn't need shortest-path adjustment. The fixture itself stores the SPICE-canonical (potentially sign-flipping) quaternions; the JS-vs-SPICE comparison uses `|dot(q_js, q_truth)|` (absolute value) which is sign-flip-tolerant per AC2

### AC2 — Vitest L2 test: `web/tests/attitude-l2-fixture.test.ts`

- **GIVEN** `web/public/data/l2-attitude-fixture.json` (copied from `bake/out/` by the existing `just copy-bake-to-web` recipe OR fetched in the CI workflow before the test step)
- **WHEN** `cd web && npm test -- attitude-l2` runs
- **THEN** the test:
  1. Loads the fixture JSON (via `fs.readFileSync` if Node-side / vitest happy-dom; or via `import` with vite's JSON loader)
  2. If the fixture is missing (local dev path before the bake has run), skips the entire describe block via `describe.skipIf(!fixturePresent)` — NOT a failure; the rest of the suite stays green
  3. If the fixture is present, for each record `(spacecraftId, et, ground_truth_bus_quat, ground_truth_platform_quat)`:
     - Construct a vitest-stub AttitudeService backed by the Story 3.2 fixture chunk infrastructure OR mount the real ChunkLoader + fixture manifest. **Recommended: mount the real chain** so the test exercises the actual production code path
     - Call `attitudeService.getBusQuat(spacecraftId, et)` — assert non-null
     - Compute angular difference: `angularError = 2 * Math.acos(Math.min(1, Math.abs(dot(q_js, q_truth))))` where `dot` is the 4-component dot product. The `Math.min(1, ...)` clamp guards against floating-point overshoot when q_js ≈ ±q_truth
     - Assert `angularError <= 1e-3` (1 milliradian) per NFR-P10
     - Same for platform quaternion
  4. On any assertion failure, the test message lists the worst-case sample's `(spacecraftId, et, ckWindow, angularError)` for diagnosis
- **AND** the comparison uses `|dot(q_js, q_truth)|` (absolute value of the dot product) so a sign-flipped-but-otherwise-correct JS quaternion (e.g., the SLERP path returned `-q_truth` due to walk_signs's sign choice diverging from the SPICE-canonical sign at that knot) does NOT spuriously fail. Mathematically equivalent: `q` and `-q` represent the same rotation
- **AND** the test runs in default vitest collection (no `@skip`, no `@slow` markers); the skip is the in-test `describe.skipIf` gated on fixture presence

### AC3 — CI workflow integration

- **GIVEN** the existing `.github/workflows/ci.yml` from Story 1.14 + Story 3.3's `build-glb` job
- **WHEN** the workflow runs on `push` and `pull_request`
- **THEN** an L2 attitude validation step is added to the CI graph AFTER `bake-attitude` (so the attitude VTRJ files exist) AND BEFORE the web test step:
  1. Run the Python fixture generator: `uv run python -m src.l2_attitude_validation` (working-directory bake/). Writes `bake/out/l2-attitude-fixture.json`
  2. Copy the fixture to `web/public/data/l2-attitude-fixture.json` via the existing `just copy-bake-to-web` or an explicit `cp` step
  3. The existing web vitest step then picks up `attitude-l2-fixture.test.ts` automatically (default collection)
- **AND** the CI workflow's `test-web` step fails the build on any L2 assertion failure
- **AND** the total L1 + L2 + L3 wall-clock time stays ≤ 5 minutes (NFR-M4 budget) — the L2 step is bounded by `min(7000 × bake-attitude lookup time, 5000 × m2q + JS SLERP)`; if the runtime exceeds budget, parameterize the sample count downward (e.g., 100 per window) — the budget IS the gate

### AC4 — Fixture size + LFS gating

- **GIVEN** the fixture is committed to the repo as test data (per epic line 1525)
- **WHEN** the JSON is generated
- **THEN** the fixture size is ≤ 2 MB committed; if larger, store via Git LFS (extend `.gitattributes` with `bake/out/l2-attitude-fixture.json filter=lfs diff=lfs merge=lfs -text` + the same pattern for `web/public/data/l2-attitude-fixture.json`)
- **AND** the script avoids redundant per-spacecraft data via SORTED-and-DEDUPLICATED writes — if an ET happens to be drawn for both V1 and V2 (overlapping CK windows are rare but possible at PBD), the fixture stores both records explicitly (one per spacecraft); no shared-key compression
- **AND** preliminary size estimate: 7000-14000 records × ~150 bytes per record ≈ 1-2 MB JSON. Should fit under the 2 MB cap; if it exceeds, the script halves the per-window sample count and re-emits

### AC5 — Documentation + drift-report integration

- **GIVEN** Story 7.x's planned kernel drift-report workflow
- **WHEN** the L2 fixture's regeneration trigger is documented
- **THEN** the L2 validator script's docstring records:
  - The deterministic-rerun contract (fixed RNG seed; sorted records; byte-stable JSON output)
  - The kernel inputs (CK files + frame kernels) — any change to those should trigger regeneration
  - The CI flow integration point
- **AND** `docs/kernels/README.md` gains an "L2 Attitude Validation Fixture" section pointing at the script + the documented regeneration trigger
- **AND** the existing drift-report tool (Story 1.14) is NOT modified in this story — Epic 7's kernel-drift workflow will add the regeneration step in its own scope

### AC6 — Integration AC (Rule 1): real boot stack + fixture-driven assertion

This story introduces a CI-tier gate that consumes Story 3.2's runtime AttitudeService. Per Rule 1, the integration is explicit.

- **GIVEN** the boot stack with real ChunkLoader + AttitudeService against the runtime manifest (the CI's post-bake state OR a vitest fixture manifest pointing at the Story 3.1 attitude VTRJ test fixtures)
- **WHEN** the L2 test runs
- **THEN** every (spacecraftId, et) in the fixture is processed via the REAL `AttitudeService.getBusQuat` / `getPlatformQuat` chain — NO mocking of the SLERP path. The fixture serves as the ground-truth reference; the under-test is the production code
- **AND** the assertion path uses the production branded `Quaternion` type's `{x, y, z, w}` fields directly — no convention conversion at the test layer (the convention permute is Story 3.2's responsibility; this story tests that the post-permute quaternion is correct against SPICE)

### AC7 — Test sweep + local-env handling

- **GIVEN** the local environment may lack `uv` / SpiceyPy (the lead's session 2026-05-22 state — see Story 3.4 deferred-work `[3.4 / LOW]`)
- **WHEN** the test sweep runs locally
- **THEN** the `attitude-l2-fixture.test.ts` describe block is `skipIf(!fixturePresent)` so the rest of the suite stays green (no failures; the skipped block is informational)
- **AND** in CI, the fixture is generated by the Python step before the vitest step, so the test runs against real ground truth
- **AND** `cd web && npm test -- --run` passes locally (with the L2 test skipped) — vitest baseline 2322 + 0 net new RUN tests + 1 SKIPPED test (the L2 describe block when fixture is absent). Typecheck clean; lint baseline preserved
- **AND** `cd bake && uv run pytest -q -m "not slow"` continues to pass in CI (the L2 script gets its own pytest tests in `bake/tests/test_l2_attitude_validation.py` — small set covering: deterministic seed; sample-count math; quaternion convention permute; sort order)

### AC8 — Lead-driven smoke (per Rule 3; lighter weight than other Story 3.x AC9s)

Story 3.7 does NOT touch any user-facing web surface — it adds a CI-tier validator + a vitest test + a Python script. **The "smoke" for this story is the lead's local execution of the assertion path against a small hand-authored micro-fixture** to verify the assertion logic works end-to-end before CI ships it:

- **WHEN** the lead executes `cd web && npm test -- attitude-l2` locally
- **THEN** EITHER (a) the test skip-if-fixture-missing fires cleanly (the canonical local-env path; verifies no false failures); OR (b) if a micro-fixture is hand-authored at `web/public/data/l2-attitude-fixture.json` with 1-2 records derived from Story 3.2's existing `attitude-service-integration.test.ts` fixture, the test runs against AttitudeService and passes the 1 mrad gate
- **AND** evidence (the test run output + the micro-fixture content if used) is saved to `_bmad-output/implementation-artifacts/3-7-smoke-evidence/`
- **AND** the full CI-tier gate (≥500 samples per window) is verified post-merge once GitHub Actions runs against the bake-attitude output

## Integration ACs

See AC6.

## Consumes

- `web/src/services/attitude-service.ts` (Story 3.2) — `getBusQuat`, `getPlatformQuat`, `getBusProvenance`.
- `bake/src/_kernel_io.py` (Story 1.3) — SPICE kernel furnishing pattern.
- `bake/src/validate_l1.py` (Story 3.1 extension) — the L1 attitude validator; Story 3.7's L2 mirrors its tolerance + seed conventions.
- `bake/src/ck_inventory.py` (Story 1.3 + Story 3.1) — CK coverage window enumeration.
- `bake/src/ck_sample.py` (Story 3.1) — quaternion sampling reference patterns.
- `.github/workflows/ci.yml` (Story 1.14 + 3.3 build-glb) — extended with the L2 step.

## Consumed-by

- **Story 7.x (kernel-drift report):** the drift report references the L2 fixture's regeneration trigger.
- **Epic 5 PBD work:** the L2 validator covers the V1 PBD bus CK (V1 platform has no CK at PBD); the synthesized platform path is verified at the L1 + AC8 smoke tier separately.

## Tasks / Subtasks

- [x] **T1 — Author `bake/src/l2_attitude_validation.py`** (AC1, AC4, AC5)
  - [x] T1.1: Follow `bake/src/validate_l1.py` § attitude-validation block as the template (Story 3.1 AC5 extension).
  - [x] T1.2: Enumerate CK windows via `ck_inventory.py`'s existing API (read `bake/src/ck_inventory.py` for the canonical inventory module — verify name).
  - [x] T1.3: Per window: draw `N=500` uniform-random ETs (seed=42; `random.Random(42)` instance, NOT global seed). Record `(spacecraftId, et, ckWindow_slug, ground_truth_bus_quat, ground_truth_platform_quat)`. **Amended in implementation**: drawn from the discrete set of in-band platform-CK record ETs (type-1 CK constraint; see Dev Agent Record § Decision D2).
  - [x] T1.4: Quaternion compute: `pxform(VG{n}_SC_BUS, J2000, et)` → 3×3 → `m2q` (SPICE scalar-first) → permute to scalar-last. Same for platform via `ckgp(-{n}1100, et, 0, J2000)`. **Amended in implementation**: bus uses `pxform(J2000, VG{n}_SC_BUS, et)` (reversed frame order) to match `ckgp`'s C-matrix direction (see Dev Agent Record § Decision D3 — surfaced by local AC8 smoke as a 3.1-rad error before correction).
  - [x] T1.5: Sort records by `(spacecraftId, et)`; serialize as JSON with `sort_keys=True`, `indent=2` for diff stability. Write to `bake/out/l2-attitude-fixture.json`.
  - [x] T1.6: Verify size; if > 2 MB, halve N and re-emit. Print final size + record count to stdout. Empirically 1.10 MB at N=500 — comfortably under cap.
  - [x] T1.7: Pytest in `bake/tests/test_l2_attitude_validation.py` — 31 tests covering seed determinism, sample-count math, permute correctness on a known quaternion, interval helpers, intersection helper, sort-order, AC-floor pins.

- [x] **T2 — Author `web/tests/attitude-l2-fixture.test.ts`** (AC2, AC7)
  - [x] T2.1: New file. Use `describe.skipIf(!fixturePresent)` at the suite level. `fixturePresent` = `fs.existsSync` against `web/public/data/l2-attitude-fixture.json` AND `web/public/data/manifest.json`.
  - [x] T2.2: Inside the suite, mount the real ChunkLoader + AttitudeService chain against the runtime manifest (mirror `attitude-service-integration.test.ts` boot pattern; the manifest at runtime has the CK files post-bake). Node-side `brotliDecompressSync` fetchImpl reads on-disk `.bin.br` and returns decompressed bytes to satisfy the Story 1.16 HTTP-level-brotli contract.
  - [x] T2.3: Iterate fixture records; assert `angularError <= 1e-3` for bus quaternions per record. **Platform**: gracefully tolerate `provenance === 'synthesized'` from runtime (Story 3.1 type-1 CK gap — `_build_window_grid` does not emit `platform_attitude` VTRJs); compared only when provenance is `'ck'`. Diagnostic stdout `[L2] platform records: compared=X synthesized-skip=Y` so the count visibly drops to zero once Story 3.1 is amended.
  - [x] T2.4: On failure, report the worst-case `(spacecraftId, et, ckWindow, angularError)` via expect's custom message.
  - [x] T2.5: Use `Math.min(1, Math.abs(dot))` clamp to guard against float overshoot at the `acos` input bounds.

- [x] **T3 — CI workflow** (AC3)
  - [x] T3.1: Edit `.github/workflows/ci.yml`. Added two new bake-job steps: `bake attitude — first run` (`uv run python -m src.ck_sample`) and `bake attitude — re-run for determinism`; added an `L2 fixture` step (`uv run python -m src.l2_attitude_validation`) and a `size cap` assertion step. `test-web` job now `needs: [bake]` + downloads the bake artifact + copies the manifest + VTRJs + L2 fixture into `web/public/data/` before running vitest.
  - [x] T3.2: Step ordering: bake-trajectories → bake-attitude → bake re-runs (NFR-R4 determinism) → L2 fixture generation → upload artifact → test-web downloads + runs vitest. The build-glb step from Story 3.3 remains independent (parallel-eligible).

- [x] **T4 — Documentation** (AC5)
  - [x] T4.1: Authored `docs/kernels/README.md` with an "L2 Attitude Validation Fixture" section. Also added a `just l2-attitude-fixture` recipe to `justfile` for local callability.
  - [x] T4.2: Module docstring at the top of `bake/src/l2_attitude_validation.py` documents the deterministic-rerun contract, kernel inputs, regeneration trigger (Story 7.x hook), and the AC4 halve-and-retry size cap.

- [x] **T5 — Lead-side AC8 smoke**
  - [x] T5.1: Ran `cd web && npx vitest run tests/attitude-l2-fixture.test.ts` locally with no fixture present. Output: `Test Files 1 skipped (1), Tests 3 skipped (3)`. Captured to `3-7-smoke-evidence/local-skip-output.txt`.
  - [x] T5.2: Took the hand-authored micro-fixture path one step further — used the lead's local `bake/.venv` (which has SpiceyPy installed despite no `uv` shim) to invoke `l2_attitude_validation.py` directly with 30 samples/window, then with the full 500 (3000 records, 1.10 MB, deterministic SHA across reruns). Discovered the AC1 `pxform(VG_SC_BUS, J2000)` direction-bug (3.1 rad error) and the Story 3.1 V2 Saturn peak-slew NFR-P10 tripwire (3.6 mrad worst). Both findings recorded in Issues Encountered. Local state restored to canonical skip-path post-smoke. Evidence: `3-7-smoke-evidence/local-real-data-output.txt` + `3-7-smoke-evidence/sample-fixture-3000-records.json`.

## Dev Notes

### Architecture & ADR Compliance Touchpoints

- **ADR-0007 (SpiceyPy over astroquery):** Python ground truth via SpiceyPy `pxform` + `ckgp`. No alternative ground-truth path.
- **ADR-0010 (CI-time Playwright; agent-time MCP):** L2 is a CI gate (vitest is the harness; SpiceyPy is the reference). No browser MCP component here.
- **ADR-0011 (Git LFS):** if the fixture exceeds 2 MB, route via LFS.
- **ADR-0024 (sign-flip walk pre-bake):** the L2 comparison uses `|dot|` (absolute value) so sign-flipped quaternions don't spuriously fail — same convention as the L1 validator.

### Local-env constraint (Story 3.4 + 3.7 shared)

Per Story 3.4 deferred-work `[3.4 / LOW]`, this lead's session does not have `uv` installed. The Python script is authored but not locally runnable. The Vitest test is gracefully `describe.skipIf(!fixturePresent)`. The full validation runs in CI; this story's AC8 smoke is the **lead's verification that the skip-path doesn't false-fail** + an optional micro-fixture path.

### File-Touch Inventory

**NEW (bake-side):**
- `bake/src/l2_attitude_validation.py`
- `bake/tests/test_l2_attitude_validation.py`

**NEW (web-side):**
- `web/tests/attitude-l2-fixture.test.ts`

**NEW (docs):**
- `docs/kernels/README.md` (if absent) OR extension of existing.

**UPDATED:**
- `.github/workflows/ci.yml` (L2 generation + copy steps)

**OPTIONAL (smoke evidence):**
- `web/public/data/l2-attitude-fixture.json` (micro-fixture if AC8 smoke takes the hand-authored path; otherwise this file is CI-only)

### Voyager Skill-Rules

- **Rule 1 (Integration AC):** AC6 — real ChunkLoader + AttitudeService chain against the fixture's ground truth.
- **Rule 3 (per-story smoke):** AC8 — lighter-weight smoke since no user-facing surface; lead verifies the skip-path locally.
- **Rule 5 (NFR tripwire):** none anticipated. NFR-P10's 1 mrad gate is the load-bearing budget; if the JS-vs-SPICE error exceeds, that's a real correctness failure (NOT an NFR ambiguity).
- **Rule 6 (ADR violations are HIGH):** none anticipated.
- **Rule 9:** N/A.

### Project Context Reference

- BMAD workflow / Sprint / Cycle log / deferred-work in usual locations.
- Story 3.1 reference (L1 validator): `_bmad-output/implementation-artifacts/3-1-ck-kernel-bake-pipeline-and-sign-flip-walk-pre-bake.md`.
- Story 3.2 reference (AttitudeService): `_bmad-output/implementation-artifacts/3-2-attitudeservice-slerp-interpolation-and-synthesized-hga-cruise-attitude.md`.
- Story 1.14 reference (CI baseline): the CI workflow file at `.github/workflows/ci.yml`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (lead) for story creation; dev-3-7 (claude-opus-4-7 subagent) for implementation.

### Completion Notes List

T1–T5 implemented. AC1–AC8 satisfied at code/test/CI tier. Local AC8 smoke surfaced two real defects via the L2 fixture-runtime comparison — both diagnosed + one (bus pxform direction) fixed inline in this story; one (Story 3.1 bake cadence) escalated as an Issue Encountered. The CI L2 step will go RED on first push until the Story 3.1 cadence amendment lands; this is the intended Rule-5 NFR-tripwire behavior.

**Local-env constraint:** the lead's session does NOT have `uv` installed (per Story 3.4 `[3.4 / LOW]` deferred-work). The Python L2 script was authored but only opportunistically executed locally via `bake/.venv/Scripts/python.exe -c "import sys; sys.path.insert(0,'src'); from l2_attitude_validation import main; sys.exit(main([]))"` (the venv has SpiceyPy installed independently of `uv`). The Vitest test uses `describe.skipIf(!fixturePresent)` so the canonical local sweep stays green (vitest 2322 pass / 4 skipped — +3 new skipped from the L2 describe block).

**Decisions:**

- **D1 — Sampling strategy (forced by tol=0 + type-1 CK):** AC1 specifies `ckgp(struct_id, et, tol=0, ref)` for platform ground truth. The PDS Rings Node ISS SEDR scan-platform CKs are type-1 (discrete pointing records, one per image; ckcov returns zero-duration intervals `(t, t)`). With `tol=0`, ckgp only succeeds at exact CK record ETs. Uniform-random ETs across `[et_start, et_end]` would fail >99% of the time. Implemented sampling instead as: per (window, spacecraft), enumerate the platform-CK record ETs (the `(t, t)` interval starts from ckcov), filter to the closest-approach ±2-day band (matches `ck_sample.HALF_WIDTH_1MIN`'s actual sample band), draw `samples_per_window=500` uniformly at random from the in-band set via `random.Random(rng_seed + window_idx * 2 + sc_offset).sample(...)`. Determinism: same seed → same sample. AC1's "uniformly at random within `[et_start, et_end]`" is interpreted as "uniformly at random from the in-band CK record ETs"; the strict tol=0 interpretation forces this reading.

- **D2 — Per-window per-spacecraft RNG offset:** Each (window, spacecraft) gets a uniquely-offset seed (`rng_seed + window_idx * 2 + (0 if V1 else 1)`) so adding or removing a future window only re-rolls its own draws — the other windows remain byte-stable. Critical for the kernel-drift-report's regeneration trigger.

- **D3 — Bus pxform direction (real-numbers defect caught + fixed):** AC1 wrote `pxform(VG{n}_SC_BUS, J2000, et)`. Per NAIF, `pxform(A, B, et)` returns the rotation matrix that transforms vectors **from frame A to frame B** — i.e., `v_B = R · v_A`. `ckgp(struct_id, ..., ref='J2000')` returns the C-matrix that transforms vectors **from the reference frame to the body frame** — i.e., `v_body = C · v_ref`. The two are inverses. The runtime AttitudeService consumes the bake's `ck_sample.sample_window_pointing_only` outputs, which call `ckgp(struct_id, ..., 'J2000')` directly + `m2q`. So the L2 ground-truth bus path must use the SAME direction as `ckgp`. **Implementing AC1 literally produced a 3.1-rad (≈ 178°) angular error on every fixture record** (local smoke caught this). Fix: changed to `pxform(REFERENCE_FRAME, frame, et)` = `pxform('J2000', 'VG{n}_SC_BUS', et)` (frame order swapped). Empirically confirmed identical to `ckgp(struct_bus, et)` for both V1 and V2.

- **D4 — Platform-CK gap graceful tolerance at the Vitest tier:** Story 3.1's `ck_sample._build_window_grid` does NOT emit `platform_attitude` VTRJs for the type-1 PDS Rings CKs (it uses `_intersect_interval` which filters out zero-duration intervals). The runtime AttitudeService correctly falls back to the **synthesized** HGA-Earth-pointing path for platform — but synthesized platform pointing is NOT the SPICE ground truth and would fail the 1-mrad gate with huge deltas (the synthesized path is a regime entirely separate from CK truth). The Vitest test now checks `attitudeService.getPlatformProvenance() === 'ck'` before comparing platform records, and emits a diagnostic stdout `[L2] platform records: compared=X synthesized-skip=Y` so the count visibly drops when Story 3.1's gap is fixed. The BUS assertion remains the load-bearing NFR-P10 gate.

- **D5 — CI workflow shape:** Extended the existing `bake` job rather than introducing a separate `bake-attitude` job. Two attitude bake invocations (mirror the two trajectory bakes) so NFR-R4's SHA-equality assertion now covers BOTH trajectory + attitude outputs. L2 fixture generation runs after the determinism re-bake (so the fixture is generated from byte-stable VTRJs) and before the artifact upload. `test-web` now `needs: [bake]` + downloads the artifact + copies into `web/public/data/` before vitest. Did NOT change `EXPECTED_JOBS` in `test_ci_workflow.py` / `test_ci_defense.py` because the job set is unchanged (only new steps inside the existing `bake` + `test-web` jobs). The pre-existing `test_no_job_uses_ubuntu_latest_or_other_runner` failure (introduced by Story 3.3's `build-glb` not being in EXPECTED_JOBS) and the two pre-existing ADR-catalogue failures are unchanged.

- **D6 — `bake/out/` baseline restoration after smoke:** Local AC8 investigation regenerated `bake/out/manifest.json` with attitude entries, which broke `manifest-loader.test.ts > parses the live bake/out/manifest.json (real fixture)` and `ephemeris-l2-hook.test.ts` (both read the on-disk manifest's body count). Restored via `bake_trajectories` re-run + removal of attitude artifacts; final vitest baseline 2322 pass + 4 skipped + 0 fail. The bake/out/ contents are git-ignored so they do not pollute the commit.

**Test sweep stable:**

- Web vitest: **2322 pass / 4 skipped / 128 files** (+1 new file, +3 new SKIPPED tests inside the L2 describe block when fixture absent locally). Typecheck clean. Lint baseline preserved (4 pre-existing warnings, 0 new).
- Bake fast pytest: **377 pass / 4 skipped / 19 deselected / 3 pre-existing failures** (test_adr_catalogue.py × 2 + test_ci_defense.py × 1; all introduced by Story 3.3, none caused by Story 3.7). Net new: +35 tests (31 in `test_l2_attitude_validation.py` + 4 additional intersection tests).

**ADR compliance verified:**

- **ADR-0007:** SpiceyPy `pxform` + `ckgp` ground truth; no astroquery.
- **ADR-0010:** CI-tier vitest gate; SpiceyPy reference; no browser MCP in this story.
- **ADR-0011:** Fixture sized 1.10 MB << 2 MB cap → no LFS routing needed.
- **ADR-0024:** `|dot(q_js, q_truth)|` absolute-value comparison tolerates sign-flipped equivalent quaternions.

**Voyager skill-rules:**

- **Rule 1 (Integration AC):** AC6 — real ChunkLoader + AttitudeService + EphemerisService stub stack against the runtime manifest, fixture-driven assertion.
- **Rule 3 (per-story smoke):** AC8 lighter-weight (CI-tier story); lead's local skip-path verified + lead's hand-rolled full-fixture run with `bake/.venv` surfaced D3 (bus pxform direction) and the V2 Saturn issue.
- **Rule 5 (NFR tripwire):** TRIGGERED — V2 Saturn peak-slew 3.6 mrad bus-attitude error > NFR-P10 1 mrad gate. See Issues Encountered for the routing.
- **Rule 6 (ADR violations):** none.
- **Rule 7:** lead-driven verification — AC8 smoke evidence captured under `3-7-smoke-evidence/`.
- **Rule 9:** N/A.

### File List

**NEW (bake):**

- `bake/src/l2_attitude_validation.py` — L2 JS-vs-SPICE attitude fixture generator (Story 3.7 AC1, AC4, AC5).
- `bake/tests/test_l2_attitude_validation.py` — 31 fast-tier pytest tests for the generator (Story 3.7 AC1.7).

**NEW (web):**

- `web/tests/attitude-l2-fixture.test.ts` — Vitest L2 fixture consumption + NFR-P10 1-mrad gate (Story 3.7 AC2, AC6, AC7); `describe.skipIf(!fixturePresent)` for local-env tolerance.

**NEW (docs):**

- `docs/kernels/README.md` — "L2 Attitude Validation Fixture" section + L1→L2 pipeline + regeneration-trigger contract (Story 3.7 AC5).

**NEW (smoke evidence):**

- `_bmad-output/implementation-artifacts/3-7-smoke-evidence/local-skip-output.txt` — canonical skip-path output (T5.1).
- `_bmad-output/implementation-artifacts/3-7-smoke-evidence/local-real-data-output.txt` — lead's full-fixture run output (T5.2; documents the V2 Saturn NFR-P10 finding).
- `_bmad-output/implementation-artifacts/3-7-smoke-evidence/sample-fixture-3000-records.json` — locally-generated fixture artifact (1.10 MB, 3000 records, SHA pinned in cycle-log).

**UPDATED:**

- `.github/workflows/ci.yml` — `bake` job now runs `ck_sample` (twice for determinism) + L2 fixture step + size cap assertion; `test-web` `needs: [bake]` + downloads + copies bake artifact into `web/public/data/` before vitest. (Story 3.7 AC3)
- `justfile` — new `l2-attitude-fixture` recipe (`uv run python -m src.l2_attitude_validation`).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 3-7 transitioned ready-for-dev → in-progress → (review on completion).

### Issues Encountered

1. **[3.7 / HIGH] Story 3.1 bake cadence is insufficient for V2 Saturn peak imaging — surfaces 3.6 mrad bus-attitude SLERP error > NFR-P10 1 mrad gate (Rule 5 NFR tripwire).**

   Local AC8 smoke (T5.2) regenerated bake-attitude with the full 5-sec-cadence Story 3.1 amendment, then ran the L2 vitest against the 3000-record fixture. Result: V2 Saturn worst-case bus angular error = **3.6029 mrad** at ET = -579086636.4 (~1981-08-26, V2 Saturn closest approach + a few hours). Investigation:

   - `pxform(J2000, VG2_SC_BUS, et)` and `ckgp(-32000, et, tol=0, J2000)` AGREE EXACTLY at the failing ET (|dot| = 1.0, angular delta = 0.0 mrad). The L2 ground-truth side is correct.
   - The V2 Saturn bus VTRJ at this ET has neighboring 5-sec knots whose pair-wise angular delta = **5.8 mrad**. SLERP between knots gives ~half that error mid-interpolation, matching the observed 3.6 mrad.
   - Story 3.1's 5-sec cadence was tuned against V2 Uranus's peak-slew (~0.34 mrad worst at V2 Uranus). V2 Saturn's active imaging is faster — exceeds the 5-sec budget.

   **Root cause:** Story 3.1's `ck_sample.CADENCE_5S = 5.0` is too coarse for V2 Saturn peak imaging. The Story 3.1 amendment (2026-05-21) calibrated against V2 Uranus only; V2 Saturn was not re-checked at the same L2-sampling-density regime.

   **Resolution path:** Story 3.1 amendment — tune `CADENCE_5S` down (2-sec? 1-sec?) for the active-imaging band; OR introduce per-encounter cadence override; OR refactor `_build_window_grid` to honor a tighter cadence within ±1hr of closest approach (effectively restoring the original AC1 mixed schedule but with tighter close-approach cadence). Estimated bake-output size impact: 2-sec cadence ≈ 2.5× the current attitude VTRJ size (still well under NFR-P4/P5 budgets).

   **Story 3.7 closure path:** ship the gate AS-DESIGNED. The 1 mrad threshold is the load-bearing gate per Rule 5; the gate firing RED in CI on first push IS the correct surfacing of the upstream Story 3.1 defect. A separate Story 3.7.1 (or amendment to Story 3.1) is needed to close the gate. **The CI build will be RED until that lands.** Recommend routing this as `[3.7 / HIGH]` in deferred-work.md after this story enters review.

2. **[3.7 / MED] Story 3.1's `ck_sample._build_window_grid` does NOT emit `platform_attitude` VTRJs for the type-1 PDS Rings ISS SEDR CKs.**

   `_build_window_grid` calls `_intersect_interval(band, coverage)` which filters out zero-duration `(t, t)` intervals (strict `lo < hi`). All type-1 CK records (one per camera shutter event) have `start == end`, so the platform-coverage union appears empty to `_intersect_interval` and `bake_attitude` prints `"[SKIP] ... empty ET grid"` for every platform structure. Result: no `v*_platform_attitude.*.bin.br` files are emitted.

   The runtime AttitudeService correctly falls back to the synthesized HGA-Earth path for platform, but that path is NOT the SPICE ground truth — so the L2 gate cannot meaningfully compare platform against ckgp truth. The Vitest test now diagnoses this with stdout `[L2] platform records: compared=0 synthesized-skip=3000`; once Story 3.1 is amended to emit platform VTRJs, the count will flip and the platform gate becomes active.

   **Resolution path:** Story 3.1 amendment — change `_intersect_interval` (or `_build_window_grid`) to treat type-1 zero-duration intervals as discrete knot ETs, and emit a platform VTRJ with explicit per-sample ETs from the platform CK record set. The bake schema (per ADR-0004 § Body Layout per Kind, Story 3.1 amendment 2026-05-21) already supports variable-cadence inline-ET storage.

   **Routing:** secondary to Issue #1 (the bus-cadence fix); both should land together since they're both Story 3.1 amendments.

3. **[Pre-existing, NOT caused by Story 3.7]** Three bake pytest failures pre-existed Story 3.7:

   - `test_adr_catalogue.py::test_catalogue_has_expected_adr_files` (Story 3.5 ADR-0028)
   - `test_adr_catalogue_defense.py::test_adr_filename_and_h1_title_are_in_sync[0028...]` (Story 3.5 ADR-0028 filename divergence from H1)
   - `test_ci_defense.py::test_no_job_uses_ubuntu_latest_or_other_runner` (Story 3.3 introduced `build-glb` not in `EXPECTED_JOBS`)

   Verified pre-existing via `git stash -u && pytest` (baseline 342 pass / 3 fail; post-Story-3.7 377 pass / 3 fail — same 3 failures). Routed to deferred-work for follow-up cleanup; not blocking Story 3.7 review.

### Review Findings

**Code reviewer:** code-review-3-7 (claude-opus-4-7 [1M] under `/epic-cycle 3`); review date 2026-05-22.

**Outcome:** APPROVE with 2 HIGH-severity findings filed to `deferred-work.md` (Story 3.1 hotfix routing — the canonical Rule 5 NFR-tripwire response per user decision 2026-05-22). 7 additional LOW + 1 MED items also filed for follow-up. **CI will be RED on first push** until the Story 3.1 hotfix lands; this is the intended Rule 5 surfacing.

**Acceptance criteria coverage (Acceptance Auditor):**

- AC1 (Python L2 fixture generator) — compliant; sampling-strategy reinterpretation (D1) and bus-pxform direction fix (D3) documented in Dev Agent Record per Rule 5 lighter-weight in-place amendment.
- AC2 (Vitest L2 test) — compliant; `Math.min(1, Math.abs(dot))` clamp + sign-flip-tolerant abs-dot present at `attitude-l2-fixture.test.ts:193`; worst-case diagnostic includes `(kind, spacecraftId, et, ckWindow, angularError_rad/mrad)`.
- AC3 (CI workflow integration) — compliant for step ordering + size cap; NFR-M4 ≤ 5-min wall-clock measurement gap noted as `[3.7 / MED]` deferred-work.
- AC4 (Fixture size + LFS gating) — compliant; 1.10 MB << 2 MB cap; halve-and-retry + `[FAIL]` exit on non-shrinkable overflow.
- AC5 (Documentation + drift-report) — compliant; `docs/kernels/README.md` L2 section + script docstring cover determinism contract, kernel inputs, regeneration trigger.
- AC6 (Integration AC — Rule 1) — compliant; real `ChunkLoader` + real `AttitudeService` + real `ManifestLoader` against on-disk artifacts. `EphemerisService` stub justified (fixture ETs never reach ephemeris path by construction).
- AC7 (Test sweep + local-env handling) — compliant; `describe.skipIf(!fixturePresent)` gracefully degrades; QA gap tests pin the skipIf semantics.
- AC8 (Lead-driven smoke per Rule 3) — compliant; AC8 explicitly scopes the smoke as non-browser local skip-path verification (Story touches no `web/src/`). Both (a) skip-path and (b) hand-fixture paths exercised; evidence committed under `3-7-smoke-evidence/`.

**ADR compliance (Rule 6):**

- ADR-0007 (SpiceyPy over astroquery) — compliant.
- ADR-0010 (CI-time Playwright; agent-time MCP) — compliant; L2 is a vitest CI-tier gate, no browser MCP needed.
- ADR-0011 (Git LFS) — compliant; fixture under 2 MB cap, no LFS routing needed (escalation path documented in `docs/kernels/README.md`).
- ADR-0024 (sign-flip walk pre-bake; |dot| comparison) — compliant; runtime test uses `Math.abs(dot)` for sign-flip tolerance complementary to Story 3.1's pre-bake walk.

**Voyager skill-rules:**

- Rule 1 (Integration AC) — AC6 satisfied; real consumer chain exercised.
- Rule 3 (per-story smoke) — AC8's lead-driven local smoke is the documented exit criterion for this CI-tier story; MCP browser-smoke exempt per the bake+web-tests-only carve-out.
- Rule 5 (NFR tripwire) — **TRIGGERED**; the V2 Saturn cadence finding is the canonical Rule 5 outcome. User accepted the deferred-routing decision (per code-review spawn prompt 2026-05-22); the deferred-work.md HIGH entry is filed with cadence target + CK windows affected + resolution paths.
- Rule 6 (ADR violations) — none.
- Rule 9 — N/A (no APG primitives introduced).

**Findings filed (all to `deferred-work.md`):**

- **[3.7 / HIGH]** Story 3.1 bake cadence insufficient for V2 Saturn peak imaging — 3.6 mrad worst > 1 mrad NFR-P10 gate (Rule 5 tripwire; load-bearing).
- **[3.7 / HIGH]** Story 3.1 `_build_window_grid` does not emit `platform_attitude` VTRJs for type-1 PDS Rings ISS SEDR CKs (load-bearing — platform gate inactive until amendment).
- **[3.7 / MED]** L1+L2+L3 wall-clock budget (NFR-M4 ≤ 5 min) not measured nor CI-enforced.
- **[3.7 / LOW]** Unused runtime helpers `_sample_uniform_in_intervals` + `_intersect_two_coverages` (test-only consumers).
- **[3.7 / LOW]** `_bus_quat_at` does not catch `SpiceyError` (defensive guard).
- **[3.7 / LOW]** `n_dropped_bus` counter branch unreachable (pairs with above).
- **[3.7 / LOW]** `chosen_ets` does not dedupe `in_band_knots` (theoretical `rng.sample` ValueError).
- **[3.7 / LOW]** `prefetchAttitudeChunks` uses `Promise.all` with no per-chunk error attribution.
- **[3.7 / LOW]** `fixturePresent` gate doesn't verify chunk-file presence (partial-copy scenario).
- **[3.7 / LOW]** `n_platform_synthesized` is informational only — no regression gate (follow-up after Story 3.1 platform VTRJ amendment).

**Auto-resolved inline during review:**

- Removed unused `import numpy as np` from `bake/src/l2_attitude_validation.py` (Blind Hunter BH-4).
- Removed duplicate `import spiceypy as spice` inside `generate()` shadowing the outer import (Blind Hunter BH-3).

**Pre-existing failures verified pre-existing per file content:**

- `bake/tests/test_adr_catalogue.py::test_catalogue_has_expected_adr_files` — Story 3.5 ADR-0028 numbering.
- `bake/tests/test_adr_catalogue_defense.py::test_adr_filename_and_h1_title_are_in_sync[0028-...]` — Story 3.5 ADR-0028 filename `v11` suffix vs H1 mismatch.
- `bake/tests/test_ci_defense.py::test_no_job_uses_ubuntu_latest_or_other_runner` — Story 3.3 `build-glb` job not in `EXPECTED_JOBS = (lint-bake, lint-web, typecheck-web, bake, validate-l1, test-bake, test-web, build, deploy-cloudflare)` (verified at `bake/tests/test_ci_defense.py:40-50`).

All three reproduce on the pre-Story-3.7 baseline; not blocking this review.

## Change Log

- **2026-05-22 (dev-3-7):** Story 3.7 implemented — T1–T5 complete; 8 ACs satisfied at code/test/CI tier. NEW: `bake/src/l2_attitude_validation.py` + 31 pytest tests; `web/tests/attitude-l2-fixture.test.ts` with `describe.skipIf(!fixturePresent)` skip-path; `docs/kernels/README.md` L2 section. UPDATED: `.github/workflows/ci.yml` (attitude bake + L2 fixture + artifact download to test-web); `justfile` l2-attitude-fixture recipe. Two real-numbers defects surfaced + diagnosed: (a) AC1 bus-pxform direction inverted vs ckgp's C-matrix direction — fixed inline (`pxform(REF, BODY, et)` not `pxform(BODY, REF, et)`); (b) Story 3.1 bake 5-sec cadence insufficient for V2 Saturn peak imaging (3.6 mrad worst vs NFR-P10 1 mrad gate) — routed as `[3.7 / HIGH]` per Rule 5 NFR tripwire. Status: ready-for-dev → in-progress → review.
