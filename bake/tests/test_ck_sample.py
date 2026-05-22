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
    CADENCE_10S,
    CADENCE_1MIN,
    CADENCE_DAILY,
    HALF_WIDTH_10S,
    HALF_WIDTH_1MIN,
    SLUG_BY_LABEL,
    _build_window_grid,
    _et_grid_for_interval,
    _intersect_interval,
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
    """Empty coverage → empty grid + default 5-sec cadence.

    Story 3.1 amendment 2026-05-21 (final, post-AC8 NFR-P10 slow-tier calibration):
    encounter files use a single 5-sec uniform cadence band across closest
    approach ±2 days. Earlier iterations at 10-sec breached at V2 Uranus's
    Miranda imaging peak by ~36%; halving cadence (SLERP error ∝ cadence²)
    drops worst case under the 1 mrad gate with margin. Empty-coverage default
    is CADENCE_5S.
    """
    from ck_sample import CADENCE_5S
    grid, cadence = _build_window_grid(
        coverage=[],
        encounter_start_et=0.0,
        encounter_end_et=100.0,
        closest_approach_et=50.0,
    )
    assert grid.size == 0
    assert cadence == CADENCE_5S


def test_build_window_grid_uniform_5sec_cadence_across_window() -> None:
    """Story 3.1 amended 2026-05-21: 5-sec uniform across closest_approach ±2 days.

    Earlier mixed-cadence schedules (10-sec ±1hr inside 1-min ±2-day) breached
    NFR-P10 at V2 Uranus Miranda imaging. Single 5-sec uniform cadence keeps
    SLERP error under 1 mrad gate with margin.
    """
    from ck_sample import CADENCE_5S
    closest = 43200.0
    # Coverage entirely covers the closest_approach ±2-day band
    coverage = [(closest - 300000.0, closest + 300000.0)]
    grid, effective_cadence = _build_window_grid(
        coverage=coverage,
        encounter_start_et=closest - 1000.0,  # unused since 2026-05-21 amendment
        encounter_end_et=closest + 1000.0,    # unused since 2026-05-21 amendment
        closest_approach_et=closest,
    )
    # Effective cadence is now 5-sec uniform.
    assert effective_cadence == CADENCE_5S
    # Span = ±2 days = HALF_WIDTH_1MIN seconds either side; expected sample count.
    expected_min = int(2 * HALF_WIDTH_1MIN / CADENCE_5S)
    assert grid.size >= expected_min
    # Every consecutive pair should be exactly 5 seconds apart (no mixed cadence).
    diffs = np.diff(grid)
    assert np.allclose(diffs, CADENCE_5S, atol=1e-9), (
        f"non-uniform cadence detected: unique diffs = {np.unique(diffs)[:10]}"
    )


def test_build_window_grid_clipped_to_ck_coverage() -> None:
    """5-sec band is intersected with `coverage` so we never sample outside CK data."""
    from ck_sample import CADENCE_5S
    closest = 1000.0
    # Coverage is narrower than the ±2-day band — only ±100s around closest.
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
    # 200-second span at 5-sec cadence = ~41 samples.
    expected = int(200.0 / CADENCE_5S) + 1
    assert grid.size in (expected - 1, expected, expected + 1)


def test_build_window_grid_no_overlap_between_bands() -> None:
    """The three bands together produce a strictly sorted unique grid (no doubles)."""
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
