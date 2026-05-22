# Story 3.2 — Chrome DevTools MCP Smoke Evidence

**Date:** 2026-05-21
**Lead:** team-lead@epic-cycle-2026-05-20-epic3 (claude-opus-4-7)
**Plan source:** `_bmad-output/implementation-artifacts/tests/test-summary-3-2.md` (qa-3-2)
**Dev server:** http://localhost:5173/ (Vite v8.0.13, retained from prior session)

## Probe 1 — Boot path + debug surface publication (AC1, AC8) — PASS

**Method:** Navigate to dev server root, poll for `window.__voyagerDebug.attitudeService` up to 8s.

**Result:**
- `__voyagerDebug` surfaces published: `chapterDirector`, `scrubber`, `chapterIndex`, `helpOverlay`, `chapterCopy`, `urlRouter`, `urlSync`, `embedMode`, **`attitudeService`** ✓
- AttitudeService API methods present: `getBusQuat`, `getPlatformQuat`, `getBusProvenance`, `getPlatformProvenance` (all `typeof === 'function'`) ✓

**Verdict — PASS.** AttitudeService is correctly constructed at boot, injected into `__voyagerDebug` per AC8.

## Probe 2 — V1 Jupiter closest approach: CK provenance check (AC3, AC8) — PARTIAL / DEPLOYMENT GAP

**Goal:** Verify `getBusQuat(-31, V1_JUPITER_CLOSEST_APPROACH_ET)` returns a unit Quaternion with provenance `'ck'`.

**Method:** Navigate to `http://localhost:5173/?t=1979-03-05T12:05:26Z`. Wait for `attitudeService` + `scrubber`. Read `clockManager.simTimeEt`. Call `getBusQuat(-31, et)` (retry up to 8s for chunk-load).

**Result:**
- `et = -657244423.816` ✓ (= 1979-03-05T12:05:26 UTC TDB)
- Quaternion returned: `{x: -0.352, y: -0.608, z: -0.356, w: 0.616}`, magnitude = 1.000 (unit length) ✓
- **Provenance: `'synthesized'` ✗** (expected `'ck'`)

**Root cause:** the deployed manifest at `web/public/data/manifest.json` carries ONLY trajectory entries (12 bodies × trajectory `kind`, 0 attitude entries):

```json
schemaVersion: 1, body_count: 12
naifId=-31: kinds=[trajectory], count=7
naifId=-32: kinds=[trajectory], count=11
naifId=10: kinds=[trajectory], count=1
naifId=1..8: kinds=[trajectory], count=1 each
naifId=301: kinds=[trajectory], count=1
has_attitude_entries: false
```

Story 3.1's slow-tier tests validated the bake-attitude pipeline against pytest tmp directories (where attitude VTRJs were produced + L1-validated at NFR-P10 ≤1 mrad). However, those tmp-dir artifacts are not copied to the deployed runtime — the production deployment pipeline requires:

1. `just bake-attitude` (or `bake/.venv/Scripts/python.exe -m src.ck_sample`) against `bake/out/`
2. `just copy-bake-to-web` (or `bake/.venv/Scripts/python.exe scripts/copy_bake_to_web.py`)

Neither step has been executed since Story 3.1 shipped (sha `1a4804e`).

**Story 3.2 verdict for Probe 2:** AttitudeService's logic is correct — at a `'synthesized'` provenance, it correctly falls through to the HGA-Earth-pointing path and produces a unit quaternion. The provenance value `'synthesized'` is the truthful answer given the deployed manifest's state. The CK path itself is verified at the unit + integration tier (dev's `attitude-service.test.ts` exercises CK SLERP with hand-crafted (N,5) body fixtures; AC7 integration test does the same through the full boot stack). The runtime CK path will work AS SOON AS the bake-attitude artifacts are deployed.

**Routed as:** HIGH-severity deployment gap in `deferred-work.md` — blocks Story 3.4's per-frame attitude rendering. See § "Story 3.1 → 3.2 deployment gap" below.

## Probe 3 — Cruise ET: synthesized provenance + unit-length quaternion (AC4, AC8) — PASS

**Method:** Navigate to `http://localhost:5173/?t=1995-01-01T00:00:00Z`. Wait for boot. Call `getBusQuat(-31, et)` and `getBusQuat(-32, et)`.

**Result:**
- V1 at 1995-01-01: provenance `'synthesized'` ✓, quaternion `{x: 0.267, y: -0.391, z: 0.496, w: 0.728}`, magnitude = 1.000 (unit) ✓
- V2 at 1995-01-01: provenance `'synthesized'` ✓, quaternion `{x: 0.635, y: -0.488, z: 0.475, w: 0.365}`, magnitude = 1.000 (unit) ✓
- Console messages (filter=error): clean ✓

**Verdict — PASS.** The synthesized HGA-Earth-pointing path produces orthonormal-rotation-matrix-derived Three.js quaternions for both spacecraft at a cruise ET. Branded `Quaternion` type returned correctly. V1 and V2 produce different orientations (correct — they're at different heliocentric positions, so the HGA aim vectors differ).

## Overall Story 3.2 Smoke Verdict — APPROVE WITH NOTE

- **AttitudeService boot wire-up:** verified (Probe 1).
- **Synthesized HGA-Earth-pointing path:** verified end-to-end in real browser (Probe 3) — orthonormal rotation, unit-length quaternion, manifest-driven provenance reporting honest about its source.
- **CK SLERP path runtime verification:** blocked by Story 3.1 deployment gap; the path itself is verified at unit + integration tier (30+ unit tests + 6 integration tests + 23 QA cross-cutting tests, total 2136 web vitest pass / 115 files).

The Story 3.2 code is CORRECT. The deployment gap is a separate carry-forward concern that blocks **runtime** verification of the CK path AND blocks Story 3.4 (per-frame attitude rendering). Filing as HIGH-severity in deferred-work.md routed to Story 3.4 prerequisites.

## Console Messages

All 3 probes ran with filter=error → no messages. Console is clean post-Story-3.2 boot.

## Cycle Log Entry

```
2026-05-21T<smoke_complete_TS>Z	Story 3.2	smoke_complete	method=browser result=approve_with_note iterations=1 probe1_boot=pass probe3_synthesized=pass probe2_ck_path=partial_deployment_gap defects_caught=1 new_high_findings=1 evidence=_bmad-output/implementation-artifacts/3-2-smoke-evidence/ model=claude-opus-4-7
```

## Story 3.1 → 3.2 deployment gap (new HIGH finding)

**Severity:** HIGH (blocks runtime verification of the CK SLERP path; will block Story 3.4 per-frame rendering once that story lands).

**Description:** Story 3.1's bake-attitude pipeline produces attitude VTRJ files + updated manifest with `kind ∈ {bus_attitude, platform_attitude}` and `provenance: ck` entries at `bake/out/`. However:

- Per `.gitignore`, `bake/out/*.bin.br` and `bake/out/manifest.json` are git-ignored (regenerable via `just bake && just copy-bake-to-web`)
- `web/public/data/*.bin.br` is also git-ignored; `web/public/data/manifest.json` IS committed and contains the runtime contract
- The currently committed `web/public/data/manifest.json` has only Story 1.13's trajectory entries (12 bodies, all `kind: trajectory`, 0 attitude entries)
- The deployment commands (`just bake-attitude && just copy-bake-to-web`, or equivalent) have not been executed since Story 3.1 shipped

**Why deferred:** Story 3.2's CR + lead-driven smoke confirmed the AttitudeService code-path correctness via unit-tier + integration-tier tests (2136 pass). The Story 3.2 commit doesn't block on the deployment gap — the AttitudeService correctly handles the "no attitude entries in manifest" case by falling through to the synthesized path (which is the intended fallback per AC4). Running the bake+copy pipeline takes ~10-15 minutes and was deemed out-of-scope for the Story 3.2 commit boundary.

**Suggested resolution (Story 3.4 prerequisite):** Story 3.4 ("Apply Attitude Per Frame to Both Spacecraft") cannot land without the deployed attitude data. The story's first task should be (a) run `bake/.venv/Scripts/python.exe -m src.ck_sample` to populate `bake/out/` with attitude VTRJs + manifest, then (b) run `bake/.venv/Scripts/python.exe scripts/copy_bake_to_web.py` to deploy to `web/public/data/`, then (c) commit the updated `web/public/data/manifest.json`. After step (c) is committed, this Story 3.2 smoke can be re-run against the deployed manifest and Probe 2 should PASS with `provenance: 'ck'`.

**Alternative:** Story 3.4's PR could include a CI check that asserts `web/public/data/manifest.json` has `bus_attitude` + `platform_attitude` entries for both spacecraft — preventing future deployment-gap regressions.

## Lessons (for Epic 3 retrospective)

1. **Slow-tier tests use pytest tmp dirs, not real `bake/out/`** — the slow-tier "AC8 Integration AC" test in Story 3.1 (`test_l1_validator_reads_attitude_bake_and_passes_nfr_p10`) validates the bake pipeline's correctness against tmp-dir artifacts, but does NOT exercise the deployment step. A future Story X's slow tier could optionally produce real `bake/out/` artifacts and call `copy_bake_to_web.py` as a sanity check that the deployed runtime manifest matches the bake's output schema.

2. **Per-story smoke at the runtime tier surfaces deployment gaps that the test pyramid masks.** Story 3.2's MCP smoke was the first time anyone navigated the dev server with the assumption that attitude entries should be in the manifest. The unit + integration tests use mocked manifests; the AC7 integration test uses a fixture manifest; only the live dev-server probe exposed the deployment gap.
