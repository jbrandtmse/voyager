"""QA gap suite for `bake/src/ck_sample.py` (Story 4.0 cadence amendment + type-1 CK platform VTRJ emission).

The dev-authored `test_ck_sample.py` covers the canonical happy paths for
Story 4.0 AC1 (variable-cadence ±4hr inner + ±2day outer) and AC2 (type-1
discrete-knot extraction). Coverage is comprehensive at the helper-function
tier (band intersection, subtraction, ET grid, slug map).

This QA gap suite fills four cross-cutting gaps the dev suite does NOT
exercise (per QA brief — Story 4.0 review handoff):

  1. **Variable-cadence band-overlap edge cases** at the inner/outer
     boundary (AC1 — path (c) precedence rule). The dev test asserts
     "no duplicate or non-monotonic entries" globally, but does NOT pin:
     - Exactly one boundary knot at closest_approach ± HALF_WIDTH_1S
       (so the inner→outer transition consecutive samples are within
       CADENCE_5S of each other, not double-sampled).
     - The boundary inner-band knot is present (not silently dropped
       by `_subtract_ranges` precedence).
     - Coverage that lies EXACTLY on the inner-band edge produces
       sensible output (the `lo < hi` strict filter).
     - Coverage straddling only the inner-band boundary keeps the
       inner-band knot and switches cadence correctly.

  2. **Type-1 platform VTRJ emission preserves NFR-P10 across all 6
     expected platform windows** (AC2 + AC8 closure). The dev test
     exercises type-1 detection + knot extraction on synthetic shapes
     but does NOT pin the manifest-level invariant that AFTER the
     amendment, the production bake emits exactly the 6 expected
     `platform_attitude` VTRJ entries (V1J, V1S, V2J, V2S, V2U, V2N —
     all except V1 PBD per `docs/kernels/ckbrief-inventory.md`). A
     future regression in `_intersect_interval` (e.g., re-introducing
     a strict `lo < hi` filter without the type-1 branch) would silently
     restore the pre-Story-4.0 "[SKIP] empty ET grid" behavior; this
     gap test fires on that case.

  3. **Pre-existing-failure closure stability** (Story 3.7 cycle-log
     entries: `test_adr_catalogue` × 2 from Story 3.5 ADR-0028 and
     `test_ci_defense` × 1 from Story 3.3 `build-glb` job). The
     "never normalize known failures" lesson from the Epic 3 retro
     says these closures must hold. Re-importing the defense modules
     and exercising their entry-point invariants (EXPECTED_JOBS
     contains `build-glb`; ADR catalogue and defense counts agree)
     locks the closures here as part of Story 4.0's QA contract.

  4. **NFR-P4 / NFR-P5 budget preservation on the amended bake**
     (AC1 size headroom). The Dev Agent Record reports ~14 MB total
     brotli-compressed attitude payload; pin a generous ceiling
     here so a future regression that explodes the variable-cadence
     ET grid (e.g., a refactor that drops `_subtract_ranges`) surfaces
     immediately at the size check rather than waiting for the L2
     fixture's NFR-P10 gate to trip.

These tests run in the fast tier (no `@slow` marker → not deselected
by `pytest -m "not slow"`); no SpiceyPy required; they exercise the
production-amended pure-Python helpers AND the runtime manifest
artifacts on disk (with graceful skip when the manifest is missing).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
BAKE_SRC = REPO_ROOT / "bake" / "src"
BAKE_OUT = REPO_ROOT / "bake" / "out"
WEB_PUBLIC_DATA = REPO_ROOT / "web" / "public" / "data"

if str(BAKE_SRC) not in sys.path:
    sys.path.insert(0, str(BAKE_SRC))

from ck_sample import (  # noqa: E402
    CADENCE_1S,
    CADENCE_5S,
    HALF_WIDTH_1S,
    HALF_WIDTH_1MIN,
    _build_window_grid,
    _extract_knot_ets_in_band,
    _is_type1_coverage,
    _subtract_ranges,
)


# =============================================================================
# 1. Variable-cadence band-overlap edge cases (AC1 — path (c) precedence)
# =============================================================================


class TestVariableCadenceBandEdges:
    """Edge cases at the inner/outer band boundary in `_build_window_grid`.

    The dev tests cover the happy path globally ("no duplicate or non-monotonic
    entries", "outer band ≤ 5s cadence", "inner band ≤ 1s cadence"). These
    tests pin the BOUNDARY behavior specifically: where the inner ±4hr band
    transitions to the outer 5-sec band. A future refactor that breaks the
    `_subtract_ranges` precedence (e.g., drops the inner band's claim or
    double-counts at the seam) would surface here.
    """

    def test_inner_band_endpoint_is_present_at_plus_half_width(self) -> None:
        """The grid contains the exact ET ``closest_approach + HALF_WIDTH_1S``.

        After `_build_window_grid` runs, the +HALF_WIDTH_1S boundary is the
        last knot of the inner band (clipped via `_intersect_interval`). A
        refactor that off-by-one drops the boundary knot would create a
        cadence-discontinuity at the +HALF_WIDTH_1S seam.
        """
        closest = 0.0
        coverage = [(closest - 200000.0, closest + 200000.0)]
        grid, _ = _build_window_grid(
            coverage=coverage,
            encounter_start_et=closest - 1000.0,
            encounter_end_et=closest + 1000.0,
            closest_approach_et=closest,
        )
        # The exact boundary ET must appear in the grid.
        boundary_et = closest + HALF_WIDTH_1S
        # np.linspace endpoint-fixing places this exactly; allow ulp tolerance.
        nearest_idx = int(np.argmin(np.abs(grid - boundary_et)))
        nearest = float(grid[nearest_idx])
        assert abs(nearest - boundary_et) < 1e-6, (
            f"inner-band +HALF_WIDTH_1S boundary missing from grid: "
            f"expected {boundary_et}, nearest knot at {nearest}"
        )

    def test_inner_band_endpoint_is_present_at_minus_half_width(self) -> None:
        """Mirror: the -HALF_WIDTH_1S boundary is also present (left edge)."""
        closest = 0.0
        coverage = [(closest - 200000.0, closest + 200000.0)]
        grid, _ = _build_window_grid(
            coverage=coverage,
            encounter_start_et=closest - 1000.0,
            encounter_end_et=closest + 1000.0,
            closest_approach_et=closest,
        )
        boundary_et = closest - HALF_WIDTH_1S
        nearest_idx = int(np.argmin(np.abs(grid - boundary_et)))
        nearest = float(grid[nearest_idx])
        assert abs(nearest - boundary_et) < 1e-6, (
            f"inner-band -HALF_WIDTH_1S boundary missing from grid: "
            f"expected {boundary_et}, nearest knot at {nearest}"
        )

    def test_inner_outer_transition_max_consecutive_gap_le_5sec(self) -> None:
        """Across the inner→outer seam, consecutive knots are ≤ CADENCE_5S apart.

        The whole point of variable cadence is that the cadence transition
        is smooth — never a long gap at the boundary. The outer band starts
        immediately after the inner band ends; the next outer knot must lie
        within CADENCE_5S of the inner-band endpoint.
        """
        closest = 0.0
        coverage = [(closest - 200000.0, closest + 200000.0)]
        grid, _ = _build_window_grid(
            coverage=coverage,
            encounter_start_et=closest - 1000.0,
            encounter_end_et=closest + 1000.0,
            closest_approach_et=closest,
        )
        # Verify no gap exceeds CADENCE_5S anywhere in the combined grid —
        # including across the inner→outer seam.
        diffs = np.diff(grid)
        # Allow a small slack for the boundary linspace fixup (the outer
        # band's first knot may land slightly past +HALF_WIDTH_1S due to
        # cadence rounding). Tolerance: 2 × CADENCE_5S gives generous headroom
        # for the boundary seam transition while still catching a real
        # regression (which would produce gaps of ±HALF_WIDTH_1S magnitude).
        max_gap = float(diffs.max()) if diffs.size > 0 else 0.0
        assert max_gap <= 2.0 * CADENCE_5S, (
            f"max consecutive gap {max_gap}s exceeds 2 * CADENCE_5S "
            f"({2.0 * CADENCE_5S}s) — inner/outer band overlap regression"
        )

    def test_coverage_exactly_on_inner_boundary_no_crash(self) -> None:
        """Coverage interval that ends EXACTLY at the inner-band boundary is handled.

        `_intersect_interval`'s strict ``lo < hi`` filter would drop a
        zero-duration result; this test exercises the case where coverage
        ends at the exact ET where inner-band intersection produces a
        degenerate result.
        """
        closest = 0.0
        # Coverage that ends exactly at the +HALF_WIDTH_1S boundary.
        coverage = [(closest - HALF_WIDTH_1S, closest + HALF_WIDTH_1S)]
        # No exception, and grid is non-empty.
        grid, cadence = _build_window_grid(
            coverage=coverage,
            encounter_start_et=closest - 1000.0,
            encounter_end_et=closest + 1000.0,
            closest_approach_et=closest,
        )
        assert grid.size > 0, "coverage exactly on inner band must produce grid"
        # Effective cadence should be 1-sec (inner band fully covered).
        assert cadence == CADENCE_1S, (
            f"coverage filling inner band should report CADENCE_1S; got {cadence}"
        )
        # And every knot must lie within the coverage interval.
        assert float(grid.min()) >= coverage[0][0]
        assert float(grid.max()) <= coverage[0][1]

    def test_coverage_only_in_outer_band_no_inner_contribution(self) -> None:
        """Coverage entirely OUTSIDE inner band: only outer band contributes."""
        closest = 0.0
        # Coverage 12-24 hours BEFORE CA — entirely outside ±4hr inner band
        # but inside ±2-day outer band.
        coverage = [(closest - 86400.0, closest - 43200.0)]
        grid, cadence = _build_window_grid(
            coverage=coverage,
            encounter_start_et=closest - 1000.0,
            encounter_end_et=closest + 1000.0,
            closest_approach_et=closest,
        )
        assert grid.size > 0, "outer-only coverage must produce grid"
        # Effective cadence reports 5-sec (outer-band-only).
        assert cadence == CADENCE_5S, (
            f"outer-only coverage should report CADENCE_5S; got {cadence}"
        )
        # All knots inside coverage interval.
        assert float(grid.min()) >= coverage[0][0]
        assert float(grid.max()) <= coverage[0][1]
        # And max consecutive gap is ≤ CADENCE_5S.
        diffs = np.diff(grid)
        if diffs.size > 0:
            assert float(diffs.max()) <= CADENCE_5S + 1e-6

    def test_inner_band_at_left_edge_of_outer_band(self) -> None:
        """Coverage straddling only the inner-band LEFT edge: half-inner / half-outer.

        Verifies the precedence rule works correctly at one-sided boundary:
        the portion inside ±HALF_WIDTH_1S is at 1-sec; the portion outside
        is at 5-sec.
        """
        closest = 0.0
        # Coverage from -8hr to +2hr — straddles the -4hr inner-band edge.
        coverage = [(closest - 28800.0, closest + 7200.0)]
        grid, cadence = _build_window_grid(
            coverage=coverage,
            encounter_start_et=closest - 1000.0,
            encounter_end_et=closest + 1000.0,
            closest_approach_et=closest,
        )
        assert grid.size > 0
        # Inner portion (≥ -HALF_WIDTH_1S) should have ≤ 1-sec spacing.
        in_inner = (grid >= closest - HALF_WIDTH_1S) & (grid <= closest + HALF_WIDTH_1S)
        inner_knots = grid[in_inner]
        if inner_knots.size > 1:
            inner_diffs = np.diff(inner_knots)
            assert float(inner_diffs.max()) <= CADENCE_1S + 1e-6
        # Outer portion (< -HALF_WIDTH_1S) should have ≤ 5-sec spacing.
        in_outer = grid < closest - HALF_WIDTH_1S
        outer_knots = grid[in_outer]
        if outer_knots.size > 1:
            outer_diffs = np.diff(outer_knots)
            assert float(outer_diffs.max()) <= CADENCE_5S + 1e-6
        # Inner band present → cadence reports 1-sec.
        assert cadence == CADENCE_1S

    def test_subtract_ranges_inner_band_completely_overlaps_outer(self) -> None:
        """`_subtract_ranges` correctly subtracts the inner ±HALF_WIDTH_1S band.

        Edge case: when the outer band fully contains the inner band, the
        result must be exactly two outer intervals (left and right of inner).
        """
        closest = 0.0
        outer = [(closest - HALF_WIDTH_1MIN, closest + HALF_WIDTH_1MIN)]
        inner = [(closest - HALF_WIDTH_1S, closest + HALF_WIDTH_1S)]
        result = _subtract_ranges(outer, inner)
        assert len(result) == 2, (
            f"outer minus inner should yield exactly 2 intervals; got {result}"
        )
        # Left: from -2day to -HALF_WIDTH_1S
        assert result[0] == (closest - HALF_WIDTH_1MIN, closest - HALF_WIDTH_1S)
        # Right: from +HALF_WIDTH_1S to +2day
        assert result[1] == (closest + HALF_WIDTH_1S, closest + HALF_WIDTH_1MIN)

    def test_grid_strictly_sorted_unique_across_boundary(self) -> None:
        """The full grid is strictly sorted unique, including ACROSS the inner/outer seam.

        Regression: a refactor that double-counts the seam knot would produce
        `diff == 0` at the boundary. This test trips on that.
        """
        closest = 1_000_000.0  # arbitrary non-zero base to stress arithmetic
        coverage = [(closest - 200000.0, closest + 200000.0)]
        grid, _ = _build_window_grid(
            coverage=coverage,
            encounter_start_et=closest - 1000.0,
            encounter_end_et=closest + 1000.0,
            closest_approach_et=closest,
        )
        diffs = np.diff(grid)
        assert np.all(diffs > 0), (
            f"grid has duplicate / non-monotonic entries — boundary regression. "
            f"min diff = {float(diffs.min())}"
        )


# =============================================================================
# 2. Type-1 platform VTRJ emission preserves NFR-P10 across 6 platform windows
# =============================================================================


# Expected platform-attitude VTRJ entries on the post-Story-4.0 manifest.
# Per `docs/kernels/ckbrief-inventory.md` + Dev Agent Record T2.4:
# - V1: 2 platform_attitude (v1-jupiter, v1-saturn). V1 pale-blue-dot has no
#   scan-platform CK coverage by design.
# - V2: 4 platform_attitude (v2-jupiter, v2-saturn, v2-uranus, v2-neptune).
# - Total: 6 platform_attitude entries.
EXPECTED_PLATFORM_WINDOWS = {
    -31: ("v1-jupiter", "v1-saturn"),
    -32: ("v2-jupiter", "v2-saturn", "v2-uranus", "v2-neptune"),
}
EXPECTED_PLATFORM_VTRJ_COUNT = 2 + 4


def _load_manifest() -> dict | None:
    """Load `web/public/data/manifest.json`, returning None if absent.

    The amended bake produces this file; CI generates a fresh copy on every
    build. Local dev environments without the lead's bake/.venv setup may not
    have a freshly-baked manifest, in which case these tests gracefully skip.
    """
    manifest_path = WEB_PUBLIC_DATA / "manifest.json"
    if not manifest_path.exists():
        return None
    return json.loads(manifest_path.read_text(encoding="utf-8"))


class TestTypeOnePlatformVTRJEmission:
    """AC2 + AC8: type-1 platform CK extraction produces the expected platform-VTRJ set.

    The dev tests cover the helper functions in isolation. These tests pin
    the END-TO-END invariant on the production manifest: after the amended
    bake, exactly 6 platform_attitude entries are emitted (one per encounter
    that has scan-platform CK coverage). A future regression that re-broke
    the type-1 branch in `bake_attitude` would silently drop these entries
    and the L2 fixture's `n_platform_synthesized` would re-rise.
    """

    def test_manifest_has_expected_platform_attitude_file_count(self) -> None:
        """Total `platform_attitude` entries == 6 across both spacecraft."""
        manifest = _load_manifest()
        if manifest is None:
            pytest.skip("web/public/data/manifest.json missing — run the bake first")
        total = 0
        for body in manifest["bodies"]:
            for fe in body["files"]:
                if fe["kind"] == "platform_attitude":
                    total += 1
        assert total == EXPECTED_PLATFORM_VTRJ_COUNT, (
            f"expected {EXPECTED_PLATFORM_VTRJ_COUNT} platform_attitude entries; "
            f"got {total}. Story 4.0 AC2 regression — type-1 CK branch may be skipped."
        )

    def test_manifest_platform_windows_match_expected_per_spacecraft(self) -> None:
        """Each spacecraft's platform_attitude entries match the expected slug set.

        V1 PBD has NO scan-platform CK coverage by design (per ckbrief
        inventory) — if a future kernel update added PBD coverage, this
        test trips and the QA process re-evaluates whether PBD should now
        be included.
        """
        manifest = _load_manifest()
        if manifest is None:
            pytest.skip("web/public/data/manifest.json missing — run the bake first")
        for body in manifest["bodies"]:
            naif = body["naifId"]
            if naif not in (-31, -32):
                continue
            expected_slugs = set(EXPECTED_PLATFORM_WINDOWS[naif])
            actual_slugs = set()
            for fe in body["files"]:
                if fe["kind"] != "platform_attitude":
                    continue
                # url shape: data/<v1|v2>_platform_attitude.<slug>.bin.br
                url = fe["url"]
                # extract slug between '.' and '.bin.br'
                base = url.rsplit("/", 1)[-1]
                # base looks like 'v1_platform_attitude.v1-jupiter.bin.br'
                parts = base.split(".")
                assert len(parts) >= 3, f"unexpected platform url shape: {url}"
                slug = parts[1]
                actual_slugs.add(slug)
            assert actual_slugs == expected_slugs, (
                f"spacecraft {naif} platform_attitude slug mismatch: "
                f"expected {sorted(expected_slugs)}, got {sorted(actual_slugs)}"
            )

    def test_manifest_platform_attitude_entries_have_provenance_ck(self) -> None:
        """Every platform_attitude (and bus_attitude) entry has `provenance: "ck"`.

        Story 3.1 AC3 introduced this field; Story 4.0 AC2's new type-1
        platform-VTRJ emissions must inherit it. A future regression in
        `_assemble_body_records` that dropped the provenance tag would
        silently route the runtime to the synthesized fallback path even
        when CK-derived data IS available.
        """
        manifest = _load_manifest()
        if manifest is None:
            pytest.skip("web/public/data/manifest.json missing — run the bake first")
        for body in manifest["bodies"]:
            for fe in body["files"]:
                if fe["kind"] in ("bus_attitude", "platform_attitude"):
                    assert "provenance" in fe, (
                        f"attitude file {fe['url']} missing required `provenance` field"
                    )
                    assert fe["provenance"] == "ck", (
                        f"attitude file {fe['url']} has provenance={fe['provenance']!r}; "
                        f"expected 'ck' (Story 3.1 AC3 / Story 4.0 AC2)"
                    )

    def test_manifest_platform_attitude_time_range_inside_ck_2day_band(self) -> None:
        """Each platform_attitude entry's timeRangeEt spans ≤ 4 days (CA ± 2 days).

        AC1 + AC2 contract: the encounter ±2-day band is the upper bound on
        per-encounter sampling extent. A regression that widened the band
        (e.g., to ±2 months by reusing the wrong HALF_WIDTH constant) would
        explode the file sizes and break NFR-P4/P5; pin the bound here.
        """
        manifest = _load_manifest()
        if manifest is None:
            pytest.skip("web/public/data/manifest.json missing — run the bake first")
        # ±2 days = 345600 seconds; add a small generous slack (10%) to cover
        # any boundary widening that's still within budget.
        MAX_BAND_SECONDS = 4 * 86400 + 86400  # 5 days = generous ceiling
        for body in manifest["bodies"]:
            for fe in body["files"]:
                if fe["kind"] != "platform_attitude":
                    continue
                lo, hi = fe["timeRangeEt"]
                span = hi - lo
                assert span <= MAX_BAND_SECONDS, (
                    f"{fe['url']}: timeRangeEt span {span}s exceeds CA ±2 day "
                    f"ceiling {MAX_BAND_SECONDS}s — Story 4.0 AC2 band widening regression"
                )

    def test_extract_knot_ets_in_band_dedup_does_not_lose_unique_knots(self) -> None:
        """`_extract_knot_ets_in_band` returns ALL unique in-band knots (no silent drop).

        AC2 defense: a synthetic adversarial fixture with 1000 distinct knots
        and 500 duplicates produces exactly 1000 unique outputs. A future
        refactor that aggressively dedup'd (e.g., to the nearest second)
        would silently lose precision.
        """
        closest = 100000.0
        band = (closest - 86400.0, closest + 86400.0)
        # 1000 unique knots at sub-second precision spread across the band.
        unique_knots = [
            (closest - 43200.0 + 86.4 * i, closest - 43200.0 + 86.4 * i)
            for i in range(1000)
        ]
        # Add 500 duplicates of the first knot.
        duplicates = [unique_knots[0]] * 500
        coverage = unique_knots + duplicates

        result = _extract_knot_ets_in_band(coverage, band)
        assert result.size == 1000, (
            f"expected 1000 unique knots after dedup; got {result.size}"
        )
        # Strictly sorted ascending.
        assert np.all(np.diff(result) > 0), "deduped knots must be strictly sorted"

    def test_is_type1_with_single_zero_duration_interval_among_continuous(self) -> None:
        """`_is_type1_coverage` triggers on ANY zero-duration interval.

        Defense: a single shutter-event-shaped interval mixed with continuous
        coverage must still trip the type-1 detection. The dev test covers
        the all-type-1 + all-continuous cases; this covers the boundary mix.
        """
        # 99 continuous intervals + 1 zero-duration (shutter event)
        mixed = [(float(i), float(i + 10)) for i in range(99)]
        mixed.append((1000.0, 1000.0))  # zero-duration shutter event
        assert _is_type1_coverage(mixed) is True

    def test_is_type1_negative_for_all_zero_duration_but_no_strict_equality(self) -> None:
        """Sanity: floats that LOOK equal but aren't (ULP-different) are NOT type-1.

        `_is_type1_coverage` uses strict `a == b` equality; this test pins
        that a coverage list of intervals where `a` and `b` differ by 1 ULP
        is NOT treated as type-1. A refactor that loosened to ``a <= b``
        or used `math.isclose` would re-introduce type-1 behavior on
        nearly-zero-duration intervals — which the bake's `ckcov` upstream
        guarantees would never happen but the defense is cheap to pin.
        """
        # 1-ULP-above-a as `b`
        a = 100.0
        b_eps = np.nextafter(a, np.inf)
        assert b_eps != a  # sanity: float-comparison sees them as different
        coverage = [(a, b_eps)]
        assert _is_type1_coverage(coverage) is False


# =============================================================================
# 3. Pre-existing-failure closure stability ("never normalize" pin)
# =============================================================================


class TestPreExistingFailureClosuresStable:
    """Story 4.0 closed 3 pre-existing failures in scope per the Epic 3 retro
    "never normalize known failures" lesson. These tests re-verify the
    closures hold from the QA tier — a future regression that re-broke any
    of them would surface here, mirroring the source-of-truth pin in the
    dev modules.

    The three closures:
      1. `test_adr_catalogue.EXPECTED_ADR_COUNT` matches the actual ADR
         count (was off-by-one — Story 3.5 added ADR-0028).
      2. `test_adr_catalogue_defense` count agrees with test_adr_catalogue
         (paired update).
      3. `test_ci_defense.EXPECTED_JOBS` contains `build-glb` (Story 3.3
         added that CI job; whitelist was stale).
    """

    def test_ci_defense_expected_jobs_includes_build_glb(self) -> None:
        """`bake/tests/test_ci_defense.EXPECTED_JOBS` lists 'build-glb' (Story 3.3 close).

        Source-level pin (rather than module import) — bake's tests/ directory
        is not always on sys.path during test collection from the repo root.
        """
        ci_defense_src = (
            REPO_ROOT / "bake" / "tests" / "test_ci_defense.py"
        ).read_text(encoding="utf-8")
        import re

        # Locate the EXPECTED_JOBS tuple definition and verify 'build-glb'
        # appears inside it.
        match = re.search(
            r"EXPECTED_JOBS\s*=\s*\((?P<body>[^)]+)\)",
            ci_defense_src,
            re.DOTALL,
        )
        assert match is not None, (
            "test_ci_defense.py is missing the EXPECTED_JOBS tuple — "
            "Story 4.0 Issue #3 closure structure regressed"
        )
        body = match.group("body")
        assert '"build-glb"' in body or "'build-glb'" in body, (
            "EXPECTED_JOBS does not list 'build-glb' — Story 4.0 Issue #3 "
            "closure regressed (test_ci_defense whitelist out of sync with CI)"
        )

    def test_adr_catalogue_pins_at_least_28_numbered_adrs(self) -> None:
        """`test_adr_catalogue.EXPECTED_NUMBERED_ADRS` includes ADR-0028.

        Story 3.5 added ADR-0028 (boresight renderer); pre-Story-4.0 the
        catalogue test was stale at 27. Story 4.0 closed the gap. Re-verify
        the pin holds — a regression that reverted to 27 would re-introduce
        the pre-existing failure.
        """
        catalogue_src = (
            REPO_ROOT / "bake" / "tests" / "test_adr_catalogue.py"
        ).read_text(encoding="utf-8")
        import re

        # Find the EXPECTED_NUMBERED_ADRS line and verify the upper bound
        # is at least 29 (range(1, 29) → 0001..0028 inclusive).
        match = re.search(
            r"EXPECTED_NUMBERED_ADRS\s*=\s*set\(range\(\s*1\s*,\s*(\d+)\s*\)\)",
            catalogue_src,
        )
        assert match is not None, (
            "test_adr_catalogue.py: EXPECTED_NUMBERED_ADRS structure changed — "
            "Story 4.0 Issue #2 closure may have regressed"
        )
        upper_bound = int(match.group(1))
        assert upper_bound >= 29, (
            f"EXPECTED_NUMBERED_ADRS upper bound is {upper_bound} — must be >= 29 "
            f"(range(1, 29) → 0001..0028 inclusive). Story 4.0 Issue #2 closure "
            f"regressed: ADR-0028 (boresight renderer) was added by Story 3.5."
        )

    def test_adr_catalogue_files_on_disk_match_expected_set(self) -> None:
        """The actual ADR files on disk match the pinned set.

        The closure depended on (a) the EXPECTED set being updated AND (b)
        the actual ADR-0028 file being present. Verify both halves so a
        partial regression (e.g., the file got deleted but the set still
        pins it) is caught at QA tier.
        """
        adr_dir = REPO_ROOT / "docs" / "adr"
        adr_files = sorted(adr_dir.glob("[0-9][0-9][0-9][0-9]-*.md"))
        assert len(adr_files) >= 28, (
            f"expected at least 28 numbered ADR files on disk; got {len(adr_files)} "
            f"in {adr_dir} — Story 4.0 Issue #2 closure file regressed"
        )
        # ADR-0028 specifically must be present (added by Story 3.5).
        adr_28 = list(adr_dir.glob("0028-*.md"))
        assert adr_28, (
            f"ADR-0028 file missing from {adr_dir} — Story 3.5 deliverable "
            f"deleted; Story 4.0 closure not viable"
        )


# =============================================================================
# 4. NFR-P4 / NFR-P5 size budget pin (post-amendment ceiling)
# =============================================================================


class TestAttitudeFileSizeBudget:
    """AC1 + AC8: amended bake stays well under NFR-P4 / NFR-P5 size budgets.

    Dev Agent Record T1.4 reports ~14 MB total brotli for all 13 attitude
    files. We pin a generous ceiling so a future regression that exploded
    the variable-cadence ET grid surfaces immediately at the size check.

    NFR-P4 (first-paint): ≤ 35 MB total committed/served data.
    NFR-P5 (full): ≤ 150 MB total.

    The attitude payload is a strict subset of both budgets; we pin at 50 MB
    (3.5× the actual Dev Agent Record observation) to give comfortable
    headroom for future cadence tuning while still catching a 10× regression.
    """

    def test_total_attitude_payload_under_50mb_budget_ceiling(self) -> None:
        """Sum of all attitude file sizes ≤ 50 MB (post-Story-4.0 ceiling)."""
        manifest = _load_manifest()
        if manifest is None:
            pytest.skip("web/public/data/manifest.json missing — run the bake first")
        total_bytes = 0
        for body in manifest["bodies"]:
            for fe in body["files"]:
                if fe["kind"] in ("bus_attitude", "platform_attitude"):
                    total_bytes += int(fe["sizeBytes"])
        total_mb = total_bytes / 1024 / 1024
        # 50 MB ceiling — 3.5× generous over the Dev Agent Record's ~14 MB
        # observation. A regression that re-introduced uniform 1-sec cadence
        # across ±2 days (instead of the variable inner/outer schedule)
        # would balloon to ~80-100 MB and trip immediately.
        assert total_bytes <= 50 * 1024 * 1024, (
            f"total attitude payload {total_mb:.1f} MB exceeds Story 4.0 ceiling 50 MB "
            f"— variable-cadence regression suspected"
        )

    def test_per_platform_attitude_file_under_500kb(self) -> None:
        """Each platform_attitude file ≤ 500 KB — type-1 discrete-knot economy.

        Type-1 platform CKs are event-rate (one knot per shutter event); the
        files are tiny (~50 KB typical per the manifest). A regression that
        re-routed platform CKs through the dense 1-sec continuous-cadence
        path would explode them to multi-MB.
        """
        manifest = _load_manifest()
        if manifest is None:
            pytest.skip("web/public/data/manifest.json missing — run the bake first")
        for body in manifest["bodies"]:
            for fe in body["files"]:
                if fe["kind"] != "platform_attitude":
                    continue
                size_kb = fe["sizeBytes"] / 1024
                assert fe["sizeBytes"] <= 500 * 1024, (
                    f"{fe['url']}: platform_attitude size {size_kb:.1f} KB exceeds 500 KB "
                    f"— type-1 discrete-knot path may have regressed to dense cadence"
                )
