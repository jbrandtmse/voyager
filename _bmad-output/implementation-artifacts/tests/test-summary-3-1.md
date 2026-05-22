# Test Automation Summary — Story 3.1 (CK Kernel Bake Pipeline and Sign-Flip Walk Pre-Bake)

**QA agent:** qa-3-1 (Opus 4.7) under `/epic-cycle 3`
**Story file:** `_bmad-output/implementation-artifacts/3-1-ck-kernel-bake-pipeline-and-sign-flip-walk-pre-bake.md`
**Story status going in:** review (dev-3-1 finished; lead reconstructed file evidence from `git status --short`)
**Baseline going in:** bake fast 333 pass / 3 skipped / 19 deselected; web vitest 2062 pass; typecheck + lint clean
**Baseline going out:** bake fast 337 pass / 3 skipped / 19 deselected; web vitest 2065 pass; typecheck clean; lint baseline preserved (5 pre-existing warnings, 0 new)

## Chrome DevTools MCP smoke stage

**EXEMPT** — Story 3.1 is bake-only (pure build-pipeline; no user-facing browser surfaces touched). Per voyager-skill-rules.md Rule 3 § "Pure non-user-facing stories (build pipeline, internal tooling, refactors) are exempt; note the exemption explicitly in the review." The only `web/src/` file touched is `web/src/data/mission-facts.ts` — a TS data-mirror with no rendering and no browser surface. The Rule 3 obligation targets browser-deployed UI surfaces; a TS constant module is not such a surface. The new parity check for `PBD_DATE` runs as a Vitest unit test (web side) and the new bake-side parity check runs as a pytest test — both via the existing automated tiers, not via MCP.

## Coverage gap analysis vs dev's tests

Dev-3-1's tests already provide deep coverage of every AC (+67 net new fast-tier tests + 5 slow-tier). Gaps identified and filled:

| Gap | AC | Why dev missed it | Resolution |
|---|---|---|---|
| **Bake-side parity:** ENCOUNTERS closest_approach_utc must appear verbatim in MISSION_FACTS.md | AC7 | Dev added `test_encounters_have_valid_closest_approach_utc` (parseability) and `test_encounters_closest_approach_utc_falls_inside_window` (semantic sanity), but neither cross-checks against the canonical citation surface. The Web-side parity test loops `ENCOUNTER_DATES`, not bake-side `ENCOUNTERS`. | New: `test_encounters_closest_approach_utcs_appear_in_mission_facts_md` in `bake/tests/test_ck_inventory_bus_id.py` |
| **Web-side parity:** PBD_DATE constant added to mission-facts.ts must appear in MISSION_FACTS.md | AC7 / T3.8 | Dev's `mission-facts.test.ts` parity loop covers `LAUNCH_DATES`, `ENCOUNTER_DATES`, `HELIOPAUSE_DATES`, `INSTRUMENT_SHUTOFF_DATES` — but **NOT** the new standalone `PBD_DATE` constant (added at `mission-facts.ts:95`). Drift between `PBD_DATE` and MISSION_FACTS.md was undetected. | New: PBD_DATE assertion appended to the Story 2.9 AC2 parity `describe` block in `web/src/data/mission-facts.test.ts` |
| **Source-level convention tripwire:** SPICE scalar-first `[w, x, y, z]` quaternion ordering | AC1-T1 (schema), Story 3.2 contract | Dev documented the convention in two docstrings (`vtrj_writer.py` + `ck_sample.py`) but no test asserts the docstring statements remain present. A future refactor that "cleans up" the docstring could silently invert the contract. Story 3.2 (AttitudeService) will perform a column-permute relying on this exact storage order. | Two new tests in `bake/tests/test_vtrj_writer.py`: `test_vtrj_writer_documents_spice_scalar_first_quaternion_convention` + `test_ck_sample_documents_spice_scalar_first_quaternion_convention` |
| **VTRJ Story-1.4 byte fixture decodes under extended schema** | AC1-T1 backwards-compat | Dev's `test_default_kind_is_trajectory_back_compat` writes via the extended `write_vtrj` with kind defaulted; it doesn't test that **hand-packed bytes** identical to a Story-1.4-era trajectory file still decode through the Story-3.1-extended `read_vtrj`. This is the actual on-disk-stability contract. | New: `test_story_1_4_byte_fixture_trajectory_decodes_under_extended_schema` in `bake/tests/test_vtrj_writer.py` (hand-packs via `struct` to bypass `write_vtrj`) |
| **Manifest forward-compat with provenance** | AC3 | Dev verified Zod 4.4.3 `z.object()` default-strips unknowns by reading the source; no runtime test confirms the contract on a real attitude-shaped manifest passed through `ManifestLoader.load`. A future schema-tightening (`.strict()`) on `FileSchema` would break attitude loading silently — no test would catch it. | Two new tests in `web/src/services/manifest-loader.test.ts` under `Story 3.1 AC3 — manifest forward-compat with provenance field` block |

## Generated Tests

### Bake-side (pytest, fast tier — `not slow` marker)

| File | Test | AC | Discoverability |
|---|---|---|---|
| `bake/tests/test_ck_inventory_bus_id.py` | `test_encounters_closest_approach_utcs_appear_in_mission_facts_md` | AC7 | Default `pytest` collection; no special marker → runs in fast tier |
| `bake/tests/test_vtrj_writer.py` | `test_vtrj_writer_documents_spice_scalar_first_quaternion_convention` | AC1-T1 | Default collection |
| `bake/tests/test_vtrj_writer.py` | `test_ck_sample_documents_spice_scalar_first_quaternion_convention` | AC1-T1 | Default collection |
| `bake/tests/test_vtrj_writer.py` | `test_story_1_4_byte_fixture_trajectory_decodes_under_extended_schema` | AC1-T1 (BC) | Default collection |

### Web-side (vitest)

| File | Test | AC | Discoverability |
|---|---|---|---|
| `web/src/data/mission-facts.test.ts` | "Pale Blue Dot date (PBD_DATE) appears verbatim in MISSION_FACTS.md" | AC7 / T3.8 | Default Vitest collection (no `.skip`, no markers) |
| `web/src/services/manifest-loader.test.ts` | "accepts a manifest containing attitude entries with provenance=\"ck\"" | AC3 | Default Vitest collection |
| `web/src/services/manifest-loader.test.ts` | "still accepts a trajectory-only manifest (no provenance keys anywhere)" | AC3 | Default Vitest collection |

## Coverage

- **AC1 (CK sampling + per-window VTRJ output):** Dev's 22 fast-tier tests in `test_ck_sample.py` + slow-tier `test_attitude_files_emitted`. QA adds no further gap-fill here.
- **AC1-T1 (VTRJ schema extension):** Dev's 9 new tests in `test_vtrj_writer.py`. **+3 QA tests**: convention tripwire × 2 + Story-1.4 byte fixture.
- **AC2 (Quaternion sign-flip walk, ADR-0024):** Dev's 13 tests in `test_quat_continuity.py` exhaustively cover the algorithm + edge cases + determinism. QA finds no gap.
- **AC3 (Manifest provenance):** Dev's 4 new tests in `test_manifest_writer.py`. **+2 QA tests** in `manifest-loader.test.ts` for the runtime-loader forward-compat.
- **AC4 (Bake determinism):** Dev's fast-tier surrogate (`test_attitude_walk_plus_write_is_byte_deterministic`) + slow-tier `test_attitude_bake_determinism`. QA finds no gap.
- **AC5 (L1 validator extension):** Dev's 13 fast-tier tests in `test_validate_attitude_l1.py` + slow-tier `test_l1_validator_reads_attitude_bake_and_passes_nfr_p10`. QA finds no gap.
- **AC6 (justfile + REQUIRED_RECIPES):** Dev's REQUIRED_RECIPES extension in `test_bake_defense.py`. QA finds no gap.
- **AC7 (Closest-approach anchors):** Dev's 2 new tests in `test_ck_inventory_bus_id.py`. **+1 QA test** for MISSION_FACTS.md cross-half parity. **+1 web QA test** for `PBD_DATE` parity.
- **AC8 (Integration AC, Rule 1):** Dev's `test_l1_validator_reads_attitude_bake_and_passes_nfr_p10` IS the Integration AC. Verified slow-tier-gated on LFS kernel presence; correctly exercises the producer→consumer wire-up. QA finds no gap.
- **AC9 (Test sweep green):** Confirmed bake fast 337 pass, web vitest 2065 pass, typecheck + lint clean.

## Discoverability check (per skill `on_complete` hook)

All 7 new tests run in the default suite. Verified:

- `bake/tests/test_*.py` — discovered by `cd bake && uv run pytest -q -m "not slow"` (no special markers excluding default-run; default-marker assumption matches `test_ck_inventory_bus_id.py` + `test_vtrj_writer.py` baseline files).
- `web/src/**/*.test.ts` — discovered by `cd web && npm test -- --run` (no `.skip`, no custom file patterns excluding them).

Confirmation runs (from this QA session):
- `cd bake && .venv/Scripts/pytest.exe -q -m "not slow"` → **337 passed, 3 skipped, 19 deselected** in 39.54s (+4 net new from 333 baseline).
- `cd web && npm test -- --run` → **111 test files, 2065 tests passed** in 28.15s (+3 net new from 2062 baseline).
- `cd web && npm run typecheck` → clean.
- `cd web && npm run lint` → baseline preserved (5 pre-existing warnings, 0 new).

## Voyager skill-rules compliance summary

- **Rule 1 (Integration ACs):** Verified — AC8 IS the Integration AC; dev's `test_l1_validator_reads_attitude_bake_and_passes_nfr_p10` honours it. The QA work does not modify this — it adds cross-half parity defense around it.
- **Rule 3 (per-story smoke):** **EXEMPT** — bake-only story; pure build-pipeline; no user-facing browser surfaces touched. (Note: web/src/data/mission-facts.ts is a TS data-mirror without UI rendering, not a browser surface.)
- **Rule 4 (structured completion):** Sent to team-lead at completion.
- **Rule 5 (NFR tripwire response):** Not triggered by QA work. Dev followed Rule 5 for the PBD MISSION_FACTS.md amendment.
- **Rule 6 (ADR violations are HIGH):** Story 3.1 IS the implementation of ADR-0024; not a violation. QA's convention tripwire tests harden the ADR-0024 sign-walk + ADR-0004 VTRJ schema contracts.

## Next Steps

- Run the slow-tier (`uv run pytest -q -m "slow"`) once LFS kernels are hydrated, to verify the AC8 Integration AC end-to-end against real CK bytes.
- Hand off to code review (`bmad-code-review` skill) — story-3-1 sprint status: review → (next) → done after CR approve.
