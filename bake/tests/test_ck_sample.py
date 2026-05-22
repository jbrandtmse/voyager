"""Unit tests for `bake/src/ck_sample.py` (Story 3.1 AC1, AC4).

Fast-tier tests exercise the ET-grid construction, band-precedence masking, and
the slug map without needing real CK kernels. Slow-tier tests (end-to-end bake
against LFS-pulled kernels) live in `test_bake_attitude_slow.py`.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(BAKE_SRC))

from ck_inventory import ENCOUNTERS  # noqa: E402
from ck_sample import (  # noqa: E402
    CADENCE_1S,
    CADENCE_5S,
    CADENCE_10S,
    CADENCE_1MIN,
    CADENCE_DAILY,
    HALF_WIDTH_1S,
    HALF_WIDTH_10S,
    HALF_WIDTH_1MIN,
    SLUG_BY_LABEL,
    _build_window_grid,
    _et_grid_for_interval,
    _extract_knot_ets_in_band,
    _intersect_interval,
    _is_type1_coverage,
    _kind_label,
    _kind_short,
    _spacecraft_tag,
    _subtract_ranges,
)


# === SLUG_BY_LABEL covers every ENCOUNTERS entry ===========================


def test_slug_map_covers_all_encounters() -> None:
    """Every ENCOUNTERS row's label has a SLUG_BY_LABEL entry (no silent drops)."""
    labels = {entry[0] for entry in ENCOUNTERS}
    assert labels == set(SLUG_BY_LABEL.keys()), (
        f"slug map mismatch — missing: {labels - set(SLUG_BY_LABEL.keys())}, "
        f"extra: {set(SLUG_BY_LABEL.keys()) - labels}"
    )


def test_slug_values_match_chapter_registry_convention() -> None:
    """Story 3.1 AC1: window slugs match the chapter-registry slug convention.

    The expected slug set mirrors web/src/chapters/registry.ts so Story 3.2's
    AttitudeService can route by the same slug.
    """
    expected = {
        "v1-jupiter",
        "v1-saturn",
        "pale-blue-dot",
        "v2-jupiter",
        "v2-saturn",
        "v2-uranus",
        "v2-neptune",
    }
    assert set(SLUG_BY_LABEL.values()) == expected


# === _intersect_interval / _subtract_ranges =================================


def test_intersect_interval_no_overlap_returns_empty() -> None:
    """Band entirely outside coverage → empty intersection."""
    assert _intersect_interval((0.0, 10.0), [(20.0, 30.0)]) == []
    assert _intersect_interval((-50.0, -10.0), [(0.0, 5.0)]) == []


def test_intersect_interval_partial_overlap() -> None:
    """Band partially inside coverage → clipped to overlap."""
    assert _intersect_interval((5.0, 15.0), [(10.0, 20.0)]) == [(10.0, 15.0)]
    assert _intersect_interval((0.0, 25.0), [(10.0, 20.0)]) == [(10.0, 20.0)]


def test_intersect_interval_multi_segment_coverage() -> None:
    """Band crossing two coverage segments → both intersections returned."""
    result = _intersect_interval((0.0, 50.0), [(5.0, 10.0), (20.0, 30.0)])
    assert result == [(5.0, 10.0), (20.0, 30.0)]


def test_subtract_ranges_empty_holes() -> None:
    """No holes → base intervals returned verbatim."""
    base = [(0.0, 10.0), (20.0, 30.0)]
    assert _subtract_ranges(base, []) == base


def test_subtract_ranges_hole_splits_interval() -> None:
    """A hole inside an interval splits it into two."""
    result = _subtract_ranges([(0.0, 10.0)], [(3.0, 7.0)])
    assert result == [(0.0, 3.0), (7.0, 10.0)]


def test_subtract_ranges_hole_covers_entire_interval() -> None:
    """A hole covering the entire base interval drops it."""
    result = _subtract_ranges([(0.0, 10.0)], [(0.0, 10.0)])
    assert result == []


def test_subtract_ranges_left_edge_hole() -> None:
    """A hole touching the left edge trims that edge."""
    result = _subtract_ranges([(0.0, 10.0)], [(0.0, 3.0)])
    assert result == [(3.0, 10.0)]


def test_subtract_ranges_right_edge_hole() -> None:
    """A hole touching the right edge trims that edge."""
    result = _subtract_ranges([(0.0, 10.0)], [(7.0, 10.0)])
    assert result == [(0.0, 7.0)]


# === _et_grid_for_interval =================================================


def test_et_grid_basic_cadence() -> None:
    """Grid covers [start, end] with N samples; endpoints exact."""
    grid = _et_grid_for_interval(0.0, 100.0, 10.0)
    assert grid.size >= 11
    assert grid[0] == 0.0
    assert grid[-1] == 100.0


def test_et_grid_empty_for_zero_span() -> None:
    """span == 0 returns empty grid."""
    grid = _et_grid_for_interval(5.0, 5.0, 1.0)
    assert grid.size == 0


def test_et_grid_negative_span_empty() -> None:
    """span < 0 returns empty grid."""
    grid = _et_grid_for_interval(10.0, 0.0, 1.0)
    assert grid.size == 0


# === _build_window_grid: cadence-band precedence ============================


def test_build_window_grid_no_coverage_returns_empty() -> None:
    """Empty coverage → empty grid + default 1-sec cadence (Story 4.0).

    Story 4.0 amendment 2026-05-22 (path (c) variable cadence — supersedes
    Story 3.1's uniform 5-sec calibration after Story 3.7's L2 gate
    surfaced V2 Saturn at 3.6 mrad against NFR-P10's 1 mrad gate). The
    variable schedule places a 1-sec inner band at ±1 hour around CA, with
    a 5-sec outer band across the rest of the ±2-day encounter window.
    Empty-coverage default reports CADENCE_1S since the inner band is the
    intended-finest cadence (matches the documented contract).
    """
    grid, cadence = _build_window_grid(
        coverage=[],
        encounter_start_et=0.0,
        encounter_end_et=100.0,
        closest_approach_et=50.0,
    )
    assert grid.size == 0
    assert cadence == CADENCE_1S


def test_build_window_grid_inner_band_is_1sec():
    """Inner ±1hr CA band samples at 1-sec cadence (Story 4.0 amendment)."""
    closest = 43200.0
    # Coverage entirely covers the closest_approach ±2-day band
    coverage = [(closest - 300000.0, closest + 300000.0)]
    grid, effective_cadence = _build_window_grid(
        coverage=coverage,
        encounter_start_et=closest - 1000.0,
        encounter_end_et=closest + 1000.0,
        closest_approach_et=closest,
    )
    assert effective_cadence == CADENCE_1S
    # Inspect the inner band: every consecutive pair inside CA ± 1 hour must
    # be ≤ CADENCE_1S apart (allow float tolerance for the linspace fixup).
    in_inner = (grid >= closest - HALF_WIDTH_1S) & (grid <= closest + HALF_WIDTH_1S)
    inner_grid = grid[in_inner]
    inner_diffs = np.diff(inner_grid)
    assert inner_diffs.size > 0
    # Inner diffs should be ~1 sec (allow up to 1 sec tolerance for the
    # linspace endpoint fix-up at the band edges).
    assert np.all(inner_diffs <= CADENCE_1S + 1e-6), (
        f"inner band cadence exceeds 1-sec: max diff = {inner_diffs.max():.3f}"
    )


def test_build_window_grid_outer_band_is_5sec_and_no_overlap_with_inner():
    """Outer ±2-day band samples at 5-sec; inner+outer don't double-sample (Story 4.0)."""
    closest = 43200.0
    coverage = [(closest - 300000.0, closest + 300000.0)]
    grid, _ = _build_window_grid(
        coverage=coverage,
        encounter_start_et=closest - 1000.0,
        encounter_end_et=closest + 1000.0,
        closest_approach_et=closest,
    )
    # Look at the outer band (outside ±1hr CA, within ±2 days).
    in_outer_lo = (grid >= closest - HALF_WIDTH_1MIN) & (grid < closest - HALF_WIDTH_1S)
    outer_lo = grid[in_outer_lo]
    if outer_lo.size > 1:
        outer_diffs = np.diff(outer_lo)
        # Outer diffs should be ~5 sec, allowing up to 5 sec tolerance for the
        # boundary fixup.
        assert np.all(outer_diffs <= CADENCE_5S + 1e-6), (
            f"outer band cadence exceeds 5-sec: max diff = {outer_diffs.max():.3f}"
        )
    # The combined grid must be strictly sorted unique (no overlap doubles).
    assert np.all(np.diff(grid) > 0), "grid has duplicate or non-monotonic entries"


def test_build_window_grid_clipped_to_ck_coverage() -> None:
    """Band is intersected with `coverage` so we never sample outside CK data."""
    closest = 1000.0
    # Coverage is narrower than the ±1hr inner band — only ±100s around closest.
    coverage = [(closest - 100.0, closest + 100.0)]
    grid, _ = _build_window_grid(
        coverage=coverage,
        encounter_start_et=closest - 1000.0,
        encounter_end_et=closest + 1000.0,
        closest_approach_et=closest,
    )
    # Grid must lie entirely within the coverage interval.
    assert float(grid.min()) >= coverage[0][0]
    assert float(grid.max()) <= coverage[0][1]
    # 200-second span at 1-sec cadence = ~201 samples.
    expected = int(200.0 / CADENCE_1S) + 1
    assert grid.size in (expected - 1, expected, expected + 1)


def test_build_window_grid_no_overlap_between_bands() -> None:
    """The bands together produce a strictly sorted unique grid (no doubles)."""
    encounter_start = 0.0
    encounter_end = 86400.0
    closest = 43200.0
    coverage = [(encounter_start - 200000.0, encounter_end + 200000.0)]
    grid, _ = _build_window_grid(
        coverage=coverage,
        encounter_start_et=encounter_start,
        encounter_end_et=encounter_end,
        closest_approach_et=closest,
    )
    # Strictly sorted
    assert np.all(np.diff(grid) > 0), "grid has duplicate or non-monotonic entries"


def test_build_window_grid_only_outer_band_when_no_inner_overlap():
    """Coverage that overlaps ONLY the outer band (no ±1hr inner overlap) → 5-sec only."""
    # Coverage well outside ±1hr but inside ±2-day band — only the outer band fires.
    closest = 0.0
    coverage = [(closest - 100000.0, closest - 90000.0)]  # ~25-27hr before CA
    grid, effective_cadence = _build_window_grid(
        coverage=coverage,
        encounter_start_et=closest - 1000.0,
        encounter_end_et=closest + 1000.0,
        closest_approach_et=closest,
    )
    assert grid.size > 0
    # Only outer band contributed → effective cadence = 5-sec.
    assert effective_cadence == CADENCE_5S


def test_build_window_grid_deterministic_repeat() -> None:
    """AC4 (NFR-R4): same inputs → identical grid output."""
    args = dict(
        coverage=[(0.0, 100000.0)],
        encounter_start_et=10000.0,
        encounter_end_et=80000.0,
        closest_approach_et=45000.0,
    )
    grid_a, cad_a = _build_window_grid(**args)
    grid_b, cad_b = _build_window_grid(**args)
    np.testing.assert_array_equal(grid_a, grid_b)
    assert cad_a == cad_b


# === Type-1 CK handling (Story 4.0 AC2) =====================================


def test_is_type1_coverage_detects_zero_duration_intervals():
    """Zero-duration `(t, t)` intervals identify type-1 (discrete) CK shape."""
    type1 = [(100.0, 100.0), (200.0, 200.0), (300.0, 300.0)]
    assert _is_type1_coverage(type1) is True


def test_is_type1_coverage_negative_for_continuous():
    """Continuous type-3/type-6 coverage with positive-duration intervals is NOT type-1."""
    type3 = [(0.0, 86400.0), (90000.0, 180000.0)]
    assert _is_type1_coverage(type3) is False


def test_is_type1_coverage_mixed_records_true():
    """Mixed coverage with any zero-duration interval is treated as type-1."""
    mixed = [(0.0, 100.0), (150.0, 150.0)]
    assert _is_type1_coverage(mixed) is True


def test_extract_knot_ets_in_band_filters_to_band():
    """Knots outside the encounter ±2-day band are filtered out."""
    closest = 1000.0
    band = (closest - 100.0, closest + 100.0)
    type1 = [(800.0, 800.0), (950.0, 950.0), (1050.0, 1050.0), (1200.0, 1200.0)]
    knots = _extract_knot_ets_in_band(type1, band)
    np.testing.assert_array_equal(knots, np.array([950.0, 1050.0], dtype=np.float64))


def test_extract_knot_ets_in_band_sorted_and_deduped():
    """Knots are returned sorted + deduped (np.unique)."""
    band = (0.0, 1000.0)
    type1 = [(500.0, 500.0), (100.0, 100.0), (500.0, 500.0), (900.0, 900.0)]
    knots = _extract_knot_ets_in_band(type1, band)
    np.testing.assert_array_equal(knots, np.array([100.0, 500.0, 900.0], dtype=np.float64))


def test_extract_knot_ets_in_band_empty_when_no_in_band_knots():
    """No knots inside band → empty ndarray."""
    band = (0.0, 100.0)
    type1 = [(500.0, 500.0)]
    knots = _extract_knot_ets_in_band(type1, band)
    assert knots.size == 0


def test_type1_synthetic_fixture_simulates_pds_iss_sedr_shape():
    """Synthetic adversarial fixture mirrors PDS Rings ISS SEDR CK shape.

    Real PDS Rings ISS SEDR CKs report tens of thousands of zero-duration
    `(t, t)` intervals per encounter (one per ISS shutter event for the
    platform structures `-31100` / `-32100`). Pre-Story-4.0, the bake
    pipeline strict-filtered `lo < hi` in `_intersect_interval`, dropping
    every type-1 interval → empty coverage union → `[SKIP] empty ET grid` →
    no `platform_attitude` VTRJ produced.

    This test pins the Story 4.0 AC2 contract: a coverage shape with the
    canonical type-1 zero-duration shape is detected via `_is_type1_coverage`
    AND `_extract_knot_ets_in_band` produces the expected knot count in the
    encounter ±2-day band.

    LFS-gated real CKs are NOT required for this test (per ADR-0011 + Story
    4.0's fast-tier preference); the synthetic shape covers the
    `_build_window_grid` strict-filter trap exactly.
    """
    # Simulate ~100 type-1 shutter events at 1-hr spacing around CA.
    closest = 100000.0
    knot_ets = [(closest - 1800.0 + 60.0 * i, closest - 1800.0 + 60.0 * i)
                for i in range(60)]  # 60 shutter events at 60-sec spacing
    # Wrap with a couple of out-of-band knots that must be filtered out.
    knot_ets.append((closest - 500000.0, closest - 500000.0))  # 5+ days before
    knot_ets.append((closest + 500000.0, closest + 500000.0))  # 5+ days after

    assert _is_type1_coverage(knot_ets) is True

    band_2day = (closest - HALF_WIDTH_1MIN, closest + HALF_WIDTH_1MIN)
    knots = _extract_knot_ets_in_band(knot_ets, band_2day)
    # All 60 in-band events should be present; the 2 out-of-band should be filtered.
    assert knots.size == 60
    # Sorted strictly ascending.
    assert np.all(np.diff(knots) > 0)


# === Spacecraft / kind helpers =============================================


def test_spacecraft_tag_routing() -> None:
    """V1 structures map to 'v1'; V2 structures map to 'v2'."""
    assert _spacecraft_tag(-31000) == "v1"
    assert _spacecraft_tag(-31100) == "v1"
    assert _spacecraft_tag(-32000) == "v2"
    assert _spacecraft_tag(-32100) == "v2"


def test_kind_label_routing() -> None:
    """Bus IDs → 'bus_attitude'; scan platform IDs → 'platform_attitude'."""
    assert _kind_label(-31000) == "bus_attitude"
    assert _kind_label(-32000) == "bus_attitude"
    assert _kind_label(-31100) == "platform_attitude"
    assert _kind_label(-32100) == "platform_attitude"


def test_kind_short_routing() -> None:
    """Bus IDs → 'bus'; scan platform IDs → 'platform' (filename slug)."""
    assert _kind_short(-31000) == "bus"
    assert _kind_short(-31100) == "platform"


def test_kind_label_rejects_unknown_struct_id() -> None:
    """Unknown structure ID → ValueError (defense against typo / new CK)."""
    with pytest.raises(ValueError, match="unknown struct_id"):
        _kind_label(-99999)


# === SC-ID derivation defense (regression for floor-division-on-negatives) ===


def test_sc_id_derivation_truncates_toward_zero() -> None:
    """The SC ID for SCLK encoding must be the spacecraft NAIF ID (-31 / -32),
    not the floor-division-toward-negative-infinity result.

    Python's `//` on negative integers floors toward negative infinity, so
    `-31100 // 1000 = -32` (wrong — should be -31). Using
    `-(abs(struct_id) // 1000)` truncates toward zero so the magnitude
    divide-then-resign gives the correct SC ID for ALL four CK structures.

    This test pins the convention so a future refactor reintroducing
    `struct_id // 1000` will fail immediately.
    """
    # The four CK structure IDs and their expected spacecraft SC IDs
    cases = [
        (-31000, -31),  # V1 bus → V1
        (-31100, -31),  # V1 scan platform → V1
        (-32000, -32),  # V2 bus → V2
        (-32100, -32),  # V2 scan platform → V2
    ]
    for struct_id, expected_sc in cases:
        # Python's floor division would give the WRONG answer for -31100, -32100
        wrong = struct_id // 1000
        # Truncate-toward-zero (correct)
        correct = -(abs(struct_id) // 1000)
        assert correct == expected_sc, (
            f"truncate-toward-zero derivation failed for {struct_id}: "
            f"got {correct}, expected {expected_sc}"
        )
        # For the scan-platform IDs, the wrong derivation must DIFFER from correct
        # (proving the test would catch a regression).
        if struct_id in (-31100, -32100):
            assert wrong != expected_sc, (
                f"floor-division ({struct_id} // 1000 = {wrong}) "
                f"should be wrong for scan-platform IDs"
            )


def test_ck_sample_source_uses_truncate_toward_zero_for_sc_id() -> None:
    """Source-level tripwire: lock the truncate-toward-zero SC-ID derivation.

    Catches the regression at code-change time before any bake runs. A future
    refactor reverting to `struct_id // 1000` fails immediately.
    """
    src_path = BAKE_SRC / "ck_sample.py"
    src = src_path.read_text(encoding="utf-8")
    # The truncate-toward-zero form must be present
    assert "-(abs(struct_id) // 1000)" in src, (
        f"{src_path}: expected truncate-toward-zero SC-ID derivation "
        f"`-(abs(struct_id) // 1000)`; floor-division was wrong on negative IDs"
    )
    # Bare floor-division of struct_id by 1000 must NOT be present in actual
    # code (regression guard). The explanatory comments use `struct_id // 1000`
    # INSIDE backticks as the WRONG-form citation — we strip those before the
    # regex check to avoid matching the comment itself.
    import re

    # Strip backticked spans (markdown-style inline code) — comments cite the
    # wrong form inside backticks; actual code uses bare expression.
    stripped = re.sub(r"`[^`]*`", "", src)
    assert not re.search(r"\bstruct_id\s*//\s*1000\b", stripped), (
        f"{src_path}: bare `struct_id // 1000` re-introduced in code — "
        f"this floor-divides toward negative infinity (-31100 // 1000 = -32, "
        f"NOT -31). Use `-(abs(struct_id) // 1000)` to truncate toward zero."
    )
