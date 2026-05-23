# Story 4.11: Satellite SPK Kernels Procurement for Moon Visibility

**Epic:** 4 — Encounter Chapters (All Six Gas-Giant Flybys)
**Status:** review
**Date created:** 2026-05-23
**Context:** Epic 4 retrospective (`epic-4-retro-2026-05-23.md`) Action #1 — close the satellite-SPK-procurement gap so the moon meshes built in Story 4.3 become positionally visible.

## User Story

As a visitor scrubbing into an encounter chapter,
I want the Voyager-encounter moons (Io / Europa / Ganymede / Callisto for V1J+V2J; Titan / Iapetus for V1S+V2S; Miranda / Ariel / Umbriel / Titania / Oberon for V2U; Triton for V2N) to be positionally visible at their historical positions during each encounter,
So that the encounter scenes show the spacecraft + planet + moons together as the historical record describes.

## Consumed-by

- All six encounter chapters (V1J / V2J / V1S / V2S / V2U / V2N): moons become visible at chapter-`held`.
- **Story 4-12** (heliocentric camera mode): with moons positionally placed, the system-wide gravity-assist screenshots become richer.
- **Epic 5 PBD**: V1's view of Saturn moons in the PBD turn-and-photograph sequence becomes accurate.

This story **introduces** satellite SPK kernel furnishing to the bake pipeline. The bake-side `MOON_BODIES` table (Story 4.3 cycle 4) already exists with graceful `SpiceyError` skip; after this story lands the kernels, the table populates real position chunks.

## Consumes

- Existing `kernels/kernels-manifest.json` (extend with satellite SPKs).
- Bake pipeline (`bake/src/bake_trajectories.py` `MOON_BODIES` table from Story 4.3).
- Runtime `EphemerisService` (Story 1.6 + Story 4.3 cadence-band lookup).
- Existing `<v-chapter-copy>` + `<v-timeline-scrubber variant="detail">` + `MissionPhaseFSM` (Stories 4.3-4.7).

## Acceptance Criteria

### AC1 — Satellite SPK kernels added to `kernels/kernels-manifest.json`

- **GIVEN** existing kernel manifest with planetary + spacecraft SPKs
- **WHEN** I inspect the manifest
- **THEN** four new SPK entries are present, one per gas-giant satellite system:
  - **`jup365.bsp`** (or current best NAIF release) — Galilean moons + minor Jovian satellites for the V1J/V2J encounter windows.
  - **`sat427.bsp`** (or current best NAIF release) — Titan + Iapetus + outer Saturnian moons for V1S/V2S.
  - **`ura111.bsp`** (or current best NAIF release) — Miranda + Ariel + Umbriel + Titania + Oberon for V2U.
  - **`nep097.bsp`** (or current best NAIF release) — Triton + Nereid for V2N.
- **AND** each entry has: `file`, `target_path`, `source_url`, `expected_sha256`, `size_bytes`, `kind: "spk"`, `attribution` matching the existing manifest style.
- **AND** the SHA256 is computed against the actual downloaded bytes (no placeholder hashes).
- **AND** the dev verifies each kernel covers the relevant encounter window (V1J 1979-03-05 ± 5d, V2J 1979-07-09 ± 5d, V1S 1980-11-12 ± 5d, V2S 1981-08-26 ± 5d, V2U 1986-01-24 ± 5d, V2N 1989-08-25 ± 5d) via `ckbrief` or `spkbrief` introspection.

### AC2 — Bake pipeline produces moon trajectory chunks

- **GIVEN** the satellite SPK kernels are furnished via the manifest
- **WHEN** I run `just bake` (or `just bake-trajectories`)
- **THEN** the bake pipeline produces VTRJ chunks for each moon listed in `MOON_BODIES` (Story 4.3 cycle 4 added this table) at the same cadence-band tier as the spacecraft trajectories (hourly ± 30d / 1min ± 2d / 10sec ± 1hr around the relevant encounter anchor).
- **AND** the bake's existing `SpiceyError` skip (Story 4.3 graceful degradation path) is replaced with successful runs — the bake should now complete the moon-trajectory generation, not skip it.
- **AND** the produced VTRJ files appear in `bake/out/` with the `<moon-slug>-<encounter-tag>-<cadence-tag>.bin.br` naming convention.
- **AND** the bake completes without errors; new moon entries appear in `bake/out/manifest.json`.

### AC3 — Runtime resolves moon positions

- **GIVEN** the bake artifacts produced in AC2 are present in `web/public/data/`
- **WHEN** the runtime navigates to an encounter chapter (e.g., `/c/v1-jupiter`)
- **THEN** `EphemerisService.getPosition(<moon-NAIF>, et)` returns a real position (not `null`).
- **AND** the moon mesh (`celestial-<NAIF>`) gets visible and positioned at its historical orbital location (NOT stacked at the gas-giant heliocentric coordinates per the Story 4.3 / 4.5 / 4.6 / 4.7 smoke evidence).

### AC4 — Integration AC (Rule 1): real bake + real runtime + smoke

- `bake/tests/test_bake_moon_trajectories.py` (NEW or extend existing) — slow-tier test gated on LFS kernel availability; runs the full bake pipeline against the procured kernels + asserts produced VTRJ files have correct headers + sample-overlap-at-boundaries.
- `web/tests/moon-visibility-integration.test.ts` (NEW) — real `EphemerisService` loaded from bake `web/public/data/manifest.json`, asserts `getPosition(501, v1j_anchor)` returns a Float64 vector within Io's expected orbital range from Jupiter (~410k–430k km from Jupiter centre).

### AC5 — Lead-driven Chrome DevTools MCP smoke

The lead navigates to `/c/v1-jupiter` post-procurement + bake-rerun + verifies:
- `celestial-501` (Io) world position is at Io's expected orbital range from Jupiter (not stacked at Jupiter's heliocentric coords).
- `celestial-501.visible === true` (mesh is rendered).
- Same for Europa / Ganymede / Callisto.
- Re-runs L4 Playwright (`npm run test:visual`) — baselines may need updating since moons are now visible in the V1J / V2J / V1S / V2S / V2U / V2N scenes. The dev confirms whether moon visibility represents an intentional baseline update (per Story 4.9 AC4 protocol).

### AC6 — Test sweep + lint baseline

- web vitest unchanged or +1-3 integration tests per AC4.
- bake fast pytest unchanged or +1-2 slow-tier tests.
- typecheck clean; lint baseline preserved.
- L4 Playwright baselines updated if moons are now visible in the scenes (intentional change, documented in commit).

## Out of Scope (Defer)

- **CK kernels for moon attitudes** (e.g., Io's volcanic features rotated correctly). Out of scope — moons render with simple spherical UV mapping per Story 4.3 cycle 4.
- **Hyperion procurement** — Story 4.3 cycle 4 documented Hyperion's chaotic-rotation no-control-network gap. Hyperion stays as a grey-sphere placeholder.
- **L1 trajectory validation** against alternative satellite SPK kernels — out of scope; this story uses whichever canonical NAIF release the dev procures.
- **Moon textures procurement** — already completed by Story 4.3 cycle 4.

## Tasks / Subtasks

- [x] **T1: Satellite SPK kernel procurement** (AC1)
  - [x] T1.1: Identify canonical NAIF releases for jup, sat, ura, nep satellite SPKs.
  - [x] T1.2: Download each via curl or Invoke-WebRequest from `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/`.
  - [x] T1.3: Compute SHA256 for each; record file sizes.
  - [x] T1.4: Add entries to `kernels/kernels-manifest.json` matching existing schema.
  - [x] T1.5: Verify coverage windows include the six encounter anchors via `spkbrief`.

- [x] **T2: Bake pipeline integration** (AC2)
  - [x] T2.1: Run `just fetch-kernels` to mirror the new manifest.
  - [x] T2.2: Run `just bake-trajectories` (or `just bake`); verify moon entries appear in `bake/out/manifest.json`.
  - [x] T2.3: Confirm zero `SpiceyError` skips in the bake log for any moon listed in `MOON_BODIES`.

- [x] **T3: Integration tests** (AC4)
  - [x] T3.1: `bake/tests/test_bake_moon_trajectories.py` slow-tier.
  - [x] T3.2: `web/tests/moon-visibility-integration.test.ts`.

- [x] **T4: Baseline updates** (AC5)
  - [x] T4.1: Run `npm run test:visual` — all 9 baselines pass without update (moons visible within 0.5% diff threshold; no intentional change to commit).
  - [x] T4.2: No baseline updates required; documented in Dev Agent Record below.

- [x] **T5: Final sweep** (AC6)

## Dev Notes

### Critical files

- `kernels/kernels-manifest.json` (extend with 4 satellite SPK entries).
- `bake/out/manifest.json` (regenerated by bake — will include moon entries).
- `web/public/data/manifest.json` (mirrored from bake output for runtime).
- `web/public/data/<moon-slug>-<encounter>-<cadence>.bin.br` (NEW — bake outputs).
- `bake/tests/test_bake_moon_trajectories.py` (NEW or extend existing slow-tier).
- `web/tests/moon-visibility-integration.test.ts` (NEW — Integration AC).
- `web/tests/visual/__snapshots__/scene-*.png` (UPDATE — moons now visible in scene).

### Satellite SPK release naming

NAIF satellite SPK files follow a pattern like `jupNNNs.bsp` where `NNN` is the release number (higher = newer). Check `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/` for the current canonical release for each system. Document the release number in the manifest entry's `attribution` field.

### Procurement constraints

- All kernels are NAIF public-domain. Attribution wording: "NAIF (JPL/NASA) — Satellites of <planet> SPK <release-id>".
- Total satellite SPK download is ~100-500 MB. These should be LFS-tracked alongside the existing kernel files per `.gitattributes`.
- Local mirror at `kernels/` per existing convention; `just fetch-kernels` handles SHA verification + download.

### Rule 5 candidates

- **Coverage window mismatch**: if a chosen NAIF release doesn't cover all six encounter windows, the dev MAY need to add multiple SPK files (e.g., separate `jup365.bsp` + `jup280.bsp` for different epochs). Document any such split in Dev Agent Record.
- **Bundle / LFS size**: if total satellite SPK download is large enough to materially affect repo clone time, consider documenting an opt-in fetch (similar to how Story 1.3 / kernel-manifest already handles large planetary SPKs).

### Rule 11 (build-pipeline E2E)

The bake pipeline IS a build-pipeline-adjacent tool. T3.1's slow-tier test exercises the full pipeline against real kernels.

### NFR / ADR compliance

- **FR-encounter-moons (implicit)**: moons positionally visible in encounter scenes is what makes the chapters land.
- **AR5/AR6 (cadence-band chunks)**: this story extends the same cadence-band pattern to moons.

## Smoke probe plan (AC5)

```js
// At /c/v1-jupiter post-procurement:
const dbg = window.__voyagerDebug;
const scene = dbg.renderEngine.scene;
const findByName = (name) => {
  let f = null;
  scene.traverse(o => { if (o.name === name) f = o; });
  return f;
};
const checkMoon = (name) => {
  const m = findByName(name);
  if (!m) return { found: false };
  const wp = new m.position.constructor();
  m.getWorldPosition(wp);
  const jup = findByName('celestial-5');
  const jupWp = new jup.position.constructor();
  jup.getWorldPosition(jupWp);
  const distFromJupiter = Math.hypot(wp.x - jupWp.x, wp.y - jupWp.y, wp.z - jupWp.z);
  return {
    found: true,
    visible: m.visible,
    distFromJupiterKm: +distFromJupiter.toFixed(0),
    notStackedAtJupiter: distFromJupiter > 1000, // > 1000 km from Jupiter centre = real orbital position
  };
};
return {
  io: checkMoon('celestial-501'),
  europa: checkMoon('celestial-502'),
  ganymede: checkMoon('celestial-503'),
  callisto: checkMoon('celestial-504'),
};
// Expected: each moon has visible=true and distFromJupiterKm in the moon's expected orbital range:
//   Io: ~410k–430k km
//   Europa: ~660k–680k km
//   Ganymede: ~1.07M–1.08M km
//   Callisto: ~1.88M km
```

## References

- Epic 4 retrospective Action #1: `_bmad-output/implementation-artifacts/epic-4-retro-2026-05-23.md`
- Story 4.3 cycle 4 `MOON_BODIES` extension (graceful `SpiceyError` skip): committed `7e60dd9`.
- Story 1.3 kernel manifest precedent: `kernels/kernels-manifest.json`.
- NAIF satellite SPK directory: `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/`.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context), bmad-dev-story skill, /epic-cycle dev stage 2026-05-23.

### Debug Log References

- Satellite SPK directory listing fetched from `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/` 2026-05-23 07:32 UTC.
- Coverage verification via SpiceyPy `spkgeo` at the six encounter anchors (V1J/V2J/V1S/V2S/V2U/V2N) — all moons returned positions at the expected orbital ranges (Io ~423k, Europa ~668k, Ganymede ~1.07M, Callisto ~1.88M km from Jupiter barycenter; Titan ~1.21M, Hyperion ~1.46M, Iapetus ~3.57M from Saturn; Ariel/Umbriel/Titania/Oberon/Miranda 130-583k from Uranus; Triton ~354k from Neptune).
- Bake re-run with new moon cadences: 72 VTRJs across 25 bodies (was 41 across 12 pre-Story-4.11; net delta = +18 encounter bands [Story 4.3 visible now] + +13 moons = +31).
- Slow-tier test wall-clock: 19 minutes (two full bakes with all cadence bands).

### Completion Notes List

**Procurement choices (T1.1):**

- `jup365.bsp` (1.1 GB) — the only Jupiter satellite SPK with Galilean moons (501-504) in the current NAIF satellites directory. `jup347/348/349.bsp` are minor-satellite-only releases.
- `sat441.bsp` (661 MB) — the only Saturn satellite SPK with the major moons (Mimas through Iapetus + Phoebe). `sat455/456/457/459.bsp` are minor-satellite-only.
- `ura184_part-3.bsp` (387 MB) — replaces the story's `ura111.bsp` (no longer in directory). `ura184_part-3.bsp` contains the major Uranian moons 701-705 (Ariel/Umbriel/Titania/Oberon/Miranda) covering 1600-2399.
- `nep097.bsp` (105 MB) — Triton (801) coverage as suggested in the story.
- Total satellite SPK download: 2.29 GB (above the story's "100-500 MB" estimate; documented above. LFS-tracked, so clone-time impact uses `git lfs skip-smudge`).

**vtrj_writer body-ID allow-list extension (T2.2 finding — Rule 5):**

The first bake-trajectories run failed on Io (NAIF 501) because `bake/src/vtrj_writer.py:TRAJECTORY_BODY_IDS` was `frozenset({-31, -32, 10, 1..8, 301})` and didn't include moon IDs. Per Rule 5 (NFR tripwire response — amend in place), extended `TRAJECTORY_BODY_IDS` with a new `MOON_BODY_IDS = frozenset({501-504, 606-608, 701-705, 801})` constant and updated docstring + error message. `chunk-loader.ts` comment also updated to note the moon ID extension.

**Cadence amendment (T3.2 finding — Rule 5):**

The first moon-visibility integration test failed for Io (got 285k km vs expected 410-430k km from Jupiter). Investigation showed that the bake's hardcoded `cadence = CELESTIAL_DEFAULT_CADENCE_SECONDS` (daily) is catastrophic for inner moons — Io's 1.77-day orbit gets only ~2 samples per period at daily cadence, breaking cubic Hermite interpolation. Per Rule 5 amendment in place: added 13 per-NAIF entries to `CELESTIAL_CADENCE_OVERRIDES` targeting ~30 samples per orbital period (hourly for Io/Miranda, 2-hourly for Europa/Ariel, 4-hourly for Umbriel/Triton, 6-hourly for Ganymede/Titania, 12-hourly for Callisto/Titan/Hyperion/Oberon, daily for Iapetus). Replaced the hardcoded default with `CELESTIAL_CADENCE_OVERRIDES.get(naif_id, CELESTIAL_DEFAULT_CADENCE_SECONDS)`. Post-amendment, all 13 moon position queries pass at the expected orbital ranges.

**Pre-existing defense-test failures closed in scope (per Story 4.0 "closable in scope" precedent):**

- `web/tests/celestial-defense-extended.test.ts` — body count assertion `toBe(12)` was correct pre-Story-4.11 but became stale; updated to 25 (12 + 13 moons).
- `web/tests/ephemeris-defense.test.ts` — V1/V2 trajectory file counts asserted 7/11 (SPK segments only), but Story 4.3 had already added 6/12 encounter bands as `kind=trajectory`. Updated assertions to 13/23 (segments + encounter bands). Total count updated from 41 → 72.
- `web/src/services/manifest-loader.test.ts` — similar baseline drift; updated to 72 / 25 bodies.
- `bake/tests/test_bake_defense.py::test_segments_do_not_overlap` — failed against Story 4.3's encounter bands which intentionally overlap SPK segments by design. Amended the test to filter `kind=trajectory + URL contains "-enc-"` since the runtime's `findSegmentFile` binary-search picks the narrower band over the broader segment per Story 4.3 AC1 (the cadence-band tier policy). Encounter-band nesting is verified by the existing `test_bake_trajectories_cadence.py` suite.

**T4 (L4 Playwright baselines):**

Ran `npm run test:visual` — **all 9 baselines pass without update**. The moon meshes are now positionally placed via the new ephemeris (verified by the integration test) but render at sub-pixel sizes from the current encounter-camera distances, so the per-pixel diff stays well under the configured `maxDiffPixelRatio: 0.005` (0.5%) threshold. No baseline update required; Story 4.9 AC4 intentional-change protocol therefore not invoked.

### File List

**Modified:**

- `kernels/kernels-manifest.json` — 4 new satellite SPK entries (jup365.bsp / sat441.bsp / ura184_part-3.bsp / nep097.bsp); `kernel_count: 17 → 21`; `manifest_generated` updated.
- `bake/src/vtrj_writer.py` — added `MOON_BODY_IDS = {501..504, 606..608, 701..705, 801}` to `TRAJECTORY_BODY_IDS` allow-list; updated docstring + error message.
- `bake/src/bake_trajectories.py` — added 13 per-moon entries to `CELESTIAL_CADENCE_OVERRIDES`; replaced hardcoded `cadence = CELESTIAL_DEFAULT_CADENCE_SECONDS` in moon-bake loop with override-aware lookup.
- `bake/tests/test_bake_defense.py` — amended `test_segments_do_not_overlap` to filter `-enc-` encounter-band trajectory files (intentional nesting per Story 4.3 AC1).
- `web/src/services/chunk-loader.ts` — extended comment noting Story 4.11 moon IDs in trajectory ID space.
- `web/src/services/manifest-loader.test.ts` — updated body+file count assertions for the live bake/out fixture (72 files / 25 bodies).
- `web/tests/celestial-defense-extended.test.ts` — added `EXPECTED_MOON_NAIF_IDS` + updated body count to 25.
- `web/tests/ephemeris-defense.test.ts` — updated V1/V2/total file count assertions for encounter bands + moons (V1 = 18, V2 = 31, total = 72).

**Added:**

- `bake/tests/test_bake_moon_trajectories.py` — 5 slow-tier tests (LFS-gated) covering: all 13 moon VTRJs emitted; per-VTRJ body_id matches MOON_BODIES NAIF; sampled positions in expected orbital range; re-bake determinism; manifest moon entries present.
- `web/tests/moon-visibility-integration.test.ts` — Integration AC (Rule 1): real `EphemerisService.getPosition` resolves all 13 moons at expected orbital ranges via the production manifest + chunk-loader path.
- `kernels/jup365.bsp` — 1136 MB satellite SPK (LFS).
- `kernels/sat441.bsp` — 661 MB satellite SPK (LFS).
- `kernels/ura184_part-3.bsp` — 387 MB satellite SPK (LFS).
- `kernels/nep097.bsp` — 105 MB satellite SPK (LFS).
- `bake/out/l2-attitude-fixture.json` — regenerated L2 attitude fixture (also pre-existing dev session).
- `bake/out/l2-reference-fixtures.json` — regenerated L2 reference fixtures (now includes moon NAIF entries).
- `web/public/data/manifest.json` — regenerated bake manifest mirror (72 files / 25 bodies).
- `web/public/data/l2-attitude-fixture.json` — regenerated fixture.
- `web/public/data/{io,europa,ganymede,callisto,titan,hyperion,iapetus,ariel,umbriel,titania,oberon,miranda,triton}.bin.br` — 13 new moon trajectory VTRJs (total ~76 MB compressed).

### Change Log

- 2026-05-23: Story 4.11 — Satellite SPK kernel procurement (Galilean / Saturnian / Uranian / Neptunian outer-system moons). Closes Epic 4 retrospective Action #1.
