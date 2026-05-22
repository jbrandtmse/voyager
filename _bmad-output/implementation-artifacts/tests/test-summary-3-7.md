# Test Automation Summary — Story 3.7 (L2 JS-vs-SPICE Attitude Consistency Validation in CI)

**QA agent:** qa-3-7 (Opus 4.7) under `/epic-cycle 3`
**Story file:** `_bmad-output/implementation-artifacts/3-7-l2-js-vs-spice-attitude-consistency-validation-in-ci.md`
**Story status going in:** review (dev-3-7 committed Tasks T1–T5)
**Baseline going in:**
- web vitest: 2322 pass / 4 skipped / 128 files (dev-3-7 +0 net new RUN tests; +3 net new SKIPPED tests inside the L2 describe block when fixture absent locally); typecheck clean; lint baseline preserved (4 pre-existing warnings)
- bake fast pytest: 377 pass / 4 skipped / 19 deselected / **3 pre-existing failures** (test_adr_catalogue × 2 from Story 3.5 ADR-0028; test_ci_defense × 1 from Story 3.3 build-glb job); +35 net new tests from dev-3-7 (31 in `test_l2_attitude_validation.py` + 4 additional helpers)

**Baseline going out:**
- web vitest: **2340 pass / 5 skipped / 129 files** (+18 net new PASSED tests + 1 net new SKIPPED test from `tests/attitude-l2-fixture-qa-gaps.test.ts`); typecheck clean; lint baseline preserved
- bake fast pytest: **390 pass / 4 skipped / 19 deselected / 3 pre-existing failures (unchanged)** (+13 net new tests from `tests/test_l2_attitude_validation_qa_gaps.py`)

## Chrome DevTools MCP smoke stage — EXEMPT (CI-tier story)

Story 3.7's Files-to-Modify list contains:

| Path | Layer |
|---|---|
| `bake/src/l2_attitude_validation.py` | NEW (bake-side) |
| `bake/tests/test_l2_attitude_validation.py` | NEW (bake-side) |
| `web/tests/attitude-l2-fixture.test.ts` | NEW (web-side test only) |
| `docs/kernels/README.md` | NEW (docs) |
| `.github/workflows/ci.yml` | UPDATED (CI) |
| `justfile` | UPDATED (build tooling) |

**No `web/src/` path is touched.** Per `voyager-skill-rules.md` Rule 3 + the QA test-tier policy persistent fact:

> "If the story's Files-to-Modify list is bake-only (`bake/**`) with no `web/src/` paths, the MCP stage is correctly skipped (this matches the Pure bake-side exemption in voyager-skill-rules.md Rule 3). Note the exemption explicitly in the summary so reviewers know it was considered."

Story 3.7 is the "CI-tier mirror" of the Story 3.1 L1 bake-tier validator — a Python fixture generator + a Vitest CI gate + a CI workflow step. It introduces NO user-facing surface: no Lit components, no HUD changes, no main.ts wiring, no boot-path code. The lead's AC8 smoke (the per-story exit criterion) is defined by Story 3.7 itself as a **non-browser smoke** — verifying the local skip-path produces zero false failures:

> "Story 3.7 does NOT touch any user-facing web surface — it adds a CI-tier validator + a vitest test + a Python script. The 'smoke' for this story is the lead's local execution of the assertion path against a small hand-authored micro-fixture..." (AC8)

The dev's AC8 evidence is already captured:
- `_bmad-output/implementation-artifacts/3-7-smoke-evidence/local-skip-output.txt` — canonical skip-path output (1 file skipped / 3 tests skipped; the rest of the suite stays green)
- `_bmad-output/implementation-artifacts/3-7-smoke-evidence/local-real-data-output.txt` — lead's lucky-local-venv full-fixture run (3000 records / 1.10 MB / V2 Saturn 3.6 mrad finding)
- `_bmad-output/implementation-artifacts/3-7-smoke-evidence/sample-fixture-3000-records.json` — committed evidence of the CI artifact shape

QA-tier extension of the smoke: the new `tests/attitude-l2-fixture-qa-gaps.test.ts` adds structural-validation tests that load the committed smoke-evidence and assert schema + unit-norm 1e-12 — locking in the smoke artifact's byte-shape as a CI-tier defense.

**The MCP browser-smoke surface is NOT in scope for Story 3.7.** Future Epic 3 stories that wire the L2 gate into the user-facing visual surface (none currently exist; the gate is mechanical CI-only) would re-enable the MCP stage. Recorded here so a reviewer searching for the missing MCP section understands it was deliberately exempt per the rule's bake-only carve-out, extended to bake+web-tests-only stories that touch no `web/src/`.

## QA gap test files

### `web/tests/attitude-l2-fixture-qa-gaps.test.ts` (NEW)

18 PASS + 1 SKIPPED. Cross-cutting integration coverage for the Vitest L2 gate:

| # | Test | Gap addressed |
|---|---|---|
| 1 | `existsSync returns false when fixture is absent — the canonical local path` | AC7 skip-path foundation pin — existsSync probe never throws on a non-existent path |
| 2 | `describe.skipIf is a function on vitest describe — harness contract` | Vitest API drift defense — a future renamed/dropped `skipIf` surfaces here, not as silent gate-disable |
| 3 | `truncated JSON throws — the test fails LOUDLY, not silently skips (CI artifact corruption)` | **QA brief Gap #2** — malformed fixture must surface loudly, not silently skip |
| 4 | `non-JSON content throws — encoding corruption or wrong-file copy` | Same — covers binary/encoded data accidentally landing at the fixture path |
| 5 | `valid JSON but not an array throws with a descriptive message` | Wrap-in-object regression — covers a refactor that wraps records in `{records: [...]}` |
| 6 | `empty-array JSON parses (but represents zero records — downstream surfaces this)` | Boundary doc test — confirms zero records → assertion-tier failure, NOT JSON-parse crash |
| 7 | `committed smoke-evidence fixture exists on disk` | **QA brief Gap #3** — smoke artifact presence pin |
| 8 | `committed smoke-evidence fixture parses as a JSON array` | Same — JSON validity of the committed evidence |
| 9 | `every record has the L2Record schema fields with correct types` | Same — full schema cross-tier validation (3000 records iterated) |
| 10 | `every quaternion is unit-norm within 1e-12 — SpiceyPy m2q invariant pin` | **QA brief Gap #3** — 1e-12 unit-norm assertion on every emitted quaternion |
| 11 | `smoke-evidence fixture is sorted by (spacecraftId, et) ascending — determinism pin` | AC1 determinism contract cross-tier defense |
| 12 | `smoke-evidence fixture size is under the AC4 2 MB cap` | **QA brief Gap #4** — AC4 size cap enforcement on the committed evidence |
| 13 | `identity quaternion against itself yields zero angular error (NFR-P10 baseline)` | AC2 diagnostic helper baseline pin |
| 14 | `sign-flipped quaternion yields zero angular error — \|dot\| tolerance (ADR-0024)` | ADR-0024 sign-flip-walk contract |
| 15 | `\|dot\| clamp at 1.0 guards against acos NaN at exact equality` | AC2 float-overshoot clamp |
| 16 | `90-degree rotation yields pi/2 angular error — round-trip sanity` | Helper-correctness sanity |
| 17 | `1 mrad gate floor — a perturbation just below tolerance does not trip` | NFR-P10 gate calibration (below) |
| 18 | `1 mrad gate ceiling — a perturbation just above tolerance trips` | NFR-P10 gate calibration (above) |
| (skip) | Sanity probe: `describe.skipIf(true)` block at module top level | Verifies skip-as-collected-skipped semantic (1 SKIPPED test exposed in the report) |

### `bake/tests/test_l2_attitude_validation_qa_gaps.py` (NEW)

13 PASS. Cross-cutting integration coverage for the Python fixture generator:

| # | Test | Gap addressed |
|---|---|---|
| 1 | `test_write_fixture_roundtrip_small_scale` | **QA brief Gap #1** — end-to-end write → reload → schema validation roundtrip |
| 2 | `test_write_fixture_json_is_sorted_keys` | AC1 determinism — `json.dumps(sort_keys=True)` byte-stable contract |
| 3 | `test_write_fixture_uses_lf_line_endings` | AC1 determinism — LF (not CRLF) line endings; cross-platform byte-stability |
| 4 | `test_write_fixture_byte_stable_across_two_writes` | NFR-R4 — two writes of identical records produce identical bytes |
| 5 | `test_max_fixture_bytes_is_2mb_pin` | **QA brief Gap #4** — re-asserted AC4 size cap constant |
| 6 | `test_min_samples_floor_blocks_runaway_halving` | AC4 halving floor — degenerate halve-forever defense |
| 7 | `test_size_cap_predicate_under_2mb_no_halve` | AC4 — small fixtures (100 records) don't trigger halve path |
| 8 | `test_smoke_evidence_fixture_under_size_cap` | AC4 cross-tier — committed 3000-record evidence is under cap |
| 9 | `test_permute_preserves_unit_norm_on_random_inputs` | SPICE→Three.js permute invariant on 1000 random unit quaternions |
| 10 | `test_smoke_evidence_quaternions_unit_norm_1e_12` | **QA brief Gap #3** cross-tier — smoke evidence unit-norm 1e-12 from Python side |
| 11 | `test_generate_fixture_records_empty_coverage_emits_no_records` | **QA brief Gap #1** — end-to-end happy path with empty mock coverage |
| 12 | `test_generate_fixture_records_with_synthetic_coverage` | **QA brief Gap #1** — full generate path with mocked SpiceyPy (pxform, ckgp, m2q, sce2c, utc2et, ckcov, wncard, wnfetd) |
| 13 | `test_generate_fixture_records_full_writeout_roundtrip` | **QA brief Gap #1** — full pipeline: generate (mocked) → write → reload → assert |

## Test sweep — final baseline

| Suite | Before (post-dev) | After (post-QA) | Net |
|---|---|---|---|
| Web vitest | 2322 pass / 4 skipped / 128 files | **2340 pass / 5 skipped / 129 files** | +18 pass, +1 skipped, +1 file |
| Bake pytest fast | 377 pass / 4 skipped / 3 fail (pre-existing) | **390 pass / 4 skipped / 3 fail (pre-existing)** | +13 pass, 3 pre-existing failures unchanged |

## Pre-existing failures — confirmed NOT caused by Story 3.7

Per QA brief: dev's claim verified via `git stash -u && pytest`. The 3 pre-existing failures all reproduce on the stashed (pre-Story-3.7) baseline:

| Test | Origin Story | Failure mode |
|---|---|---|
| `test_adr_catalogue.py::test_catalogue_has_expected_adr_files` | Story 3.5 | ADR-0028 numbering vs filename divergence |
| `test_adr_catalogue_defense.py::test_adr_filename_and_h1_title_are_in_sync[0028-narrow-angle-only-wide-angle-deferred-v11.md]` | Story 3.5 | ADR-0028 H1 vs filename mismatch |
| `test_ci_defense.py::test_no_job_uses_ubuntu_latest_or_other_runner` | Story 3.3 | `build-glb` job not in `EXPECTED_JOBS` |

QA verification: stashed working tree shows `342 pass / 3 fail`; post-Story-3.7 + QA gaps shows `390 pass / 3 fail` — same 3 failures, +48 net new passing tests (35 dev + 13 QA gaps). NOT QA's job to fix these in this story; surface them as deferred-work candidates for follow-up cleanup.

## Cross-cutting findings (Rule 5 NFR tripwire — load-bearing)

The dev's Issue #1 stands: **V2 Saturn peak-slew bus error = 3.6 mrad worst > 1 mrad gate**. The QA gap tests do not modify the gate; the assertion `worst.angularError <= TOLERANCE_RAD` (1e-3) stays load-bearing. Story 3.7's gate WILL fire RED on first push (per dev's Rule 5 NFR-tripwire response decision: ship the gate AS-DESIGNED, surface the upstream Story 3.1 cadence defect via the gate firing). This is the canonical Rule 5 outcome.

QA tier observation: the gate's TYPE-of-failure visibility is well-served by the `worst-case L2 attitude error exceeds NFR-P10 1 mrad` assertion message format — it explicitly emits `(kind, spacecraftId, et, ckWindow, angularError_rad, angularError_mrad)`. A reviewer reading the failing CI log will immediately see `kind=bus spacecraftId=-32 et=-579086636.4 ckWindow=v2-saturn angularError=3.6029e-03 rad (3.6029 mrad)` and trace directly to the upstream Story 3.1 cadence amendment.

The dev's Issue #2 (Story 3.1's `_build_window_grid` doesn't emit platform_attitude VTRJs for type-1 PDS Rings CKs) is similarly load-bearing — the Vitest test's `[L2] platform records: compared=X synthesized-skip=Y` diagnostic ensures the platform gate becomes visible the day Story 3.1 is amended. QA confirms the diagnostic logging is wired and will surface on the CI log.

## Files Modified
- (none — QA author no changes to dev's files)

## Tests Added
- C:\git\Voyager\web\tests\attitude-l2-fixture-qa-gaps.test.ts (18 tests + 1 sanity-skip)
- C:\git\Voyager\bake\tests\test_l2_attitude_validation_qa_gaps.py (13 tests)
- C:\git\Voyager\_bmad-output\implementation-artifacts\tests\test-summary-3-7.md (this file)

## Decisions
- MCP smoke stage exempt — Story 3.7 touches no `web/src/`; AC8 explicitly scopes the smoke as a non-browser local skip-path verification. Recorded explicitly per persistent-facts policy.
- Smoke-evidence structural validation duplicated across both tiers (Python pytest + TS vitest) — the same `sample-fixture-3000-records.json` artifact is validated from both sides so a schema drift on either side surfaces.
- Vitest harness contract pinned (`describe.skipIf` is a function) — guards against a future vitest upgrade dropping the API and silently disabling the L2 gate.

## Issues Encountered
- Initial vitest test attempted to nest `describe` inside an `it` body (vitest disallows this); reworked to a top-level `describe.skipIf(true)` sanity probe that exposes a single SKIPPED test in the report — the run output now shows `18 passed | 1 skipped` which is the intended shape.
- Initial pytest sort-keys assertion used `min()` over `find()` results (which returns -1 for not-found, breaking the assertion logic); reworked to iterate position pairs in strict ascending order — fixed inline.
