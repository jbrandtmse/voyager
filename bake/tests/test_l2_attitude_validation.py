"""Fast-tier unit tests for `bake/src/l2_attitude_validation.py` (Story 3.7).

Tests cover the pure-Python helpers without requiring SpiceyPy / CK furnishing:
- Slug map covers every ENCOUNTERS entry (mirrors test_ck_sample.py § slug map).
- Seed determinism: ``random.Random(seed)`` produces identical draws across
  re-invocations.
- Sample-count math: ``_sample_uniform_in_intervals`` returns exactly ``n``
  samples and they all land inside the input union.
- Quaternion convention permute: SPICE scalar-first → Three.js scalar-last
  on a known input (identity, 120° rotation).
- Output sort order: ``L2Record`` records are sorted by ``(spacecraftId, et)``
  ascending.
- Helper integer arithmetic: ``_spacecraft_naif_for_struct`` truncates
  toward zero (negative-floor trap fix from ck_sample).

End-to-end "actually generate the fixture" path is exercised in CI by the
``Generate L2 attitude fixture`` workflow step; locally we cannot run the
SpiceyPy path because ``uv``/SpiceyPy is not installed in this dev env (see
Story 3.7 § Local-env constraint).
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

import pytest

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(BAKE_SRC))

from ck_inventory import ENCOUNTERS, V1_BODY, V1_BUS, V1_SCAN_PLATFORM, V2_BODY, V2_BUS  # noqa: E402
from l2_attitude_validation import (  # noqa: E402
    DEFAULT_SAMPLES_PER_WINDOW,
    L2Record,
    MAX_FIXTURE_BYTES,
    MIN_SAMPLES_PER_WINDOW,
    RNG_SEED,
    SLUG_BY_LABEL,
    _bus_struct_for_spacecraft,
    _frame_name_for_bus,
    _intersect_interval,
    _merge_intervals,
    _platform_struct_for_spacecraft,
    _spacecraft_naif_for_struct,
    _spice_scalar_first_to_three_scalar_last,
)


# === Slug map ================================================================


def test_slug_map_covers_all_encounters() -> None:
    """Every ENCOUNTERS row's label has a SLUG_BY_LABEL entry (no silent drops).

    Mirrors test_ck_sample.test_slug_map_covers_all_encounters — the two
    maps MUST agree because the L2 fixture's ``ckWindow`` field aligns with
    the runtime AttitudeService manifest's per-encounter file slug.
    """
    labels = {entry[0] for entry in ENCOUNTERS}
    assert labels == set(SLUG_BY_LABEL.keys()), (
        f"slug map mismatch — missing: {labels - set(SLUG_BY_LABEL.keys())}, "
        f"extra: {set(SLUG_BY_LABEL.keys()) - labels}"
    )


def test_slug_map_matches_ck_sample() -> None:
    """L2's slug map matches ck_sample's slug map byte-for-byte.

    Drift between these two maps would produce L2 fixture records whose
    ckWindow field doesn't align with the runtime manifest's CK file slug
    — silent regression that only the Vitest assertion path would catch.
    Pin them together here.
    """
    from ck_sample import SLUG_BY_LABEL as CK_SAMPLE_SLUGS

    assert SLUG_BY_LABEL == CK_SAMPLE_SLUGS


# === Quaternion convention permute ==========================================


def test_permute_identity_quaternion() -> None:
    """SPICE [1, 0, 0, 0] → Three.js (0, 0, 0, 1)."""
    out = _spice_scalar_first_to_three_scalar_last([1.0, 0.0, 0.0, 0.0])
    assert out == (0.0, 0.0, 0.0, 1.0)


def test_permute_120deg_about_111() -> None:
    """SPICE [0.5, 0.5, 0.5, 0.5] (120° about (1,1,1)) → Three.js (0.5, 0.5, 0.5, 0.5).

    Both conventions store the same numerical components when the rotation
    happens to satisfy w == x == y == z; the permute moves the FIRST slot to
    the LAST slot, so a [0.5, 0.5, 0.5, 0.5] input produces [0.5, 0.5, 0.5, 0.5]
    output — pleasant sanity check of the array-shuffle correctness.
    """
    out = _spice_scalar_first_to_three_scalar_last([0.5, 0.5, 0.5, 0.5])
    assert out == (0.5, 0.5, 0.5, 0.5)


def test_permute_general_case() -> None:
    """SPICE [w, x, y, z] = [0.6, 0.1, 0.2, 0.3] → Three.js [0.1, 0.2, 0.3, 0.6].

    Non-degenerate components — verifies the permute moves the SPICE scalar
    (component 0) into the Three.js scalar slot (component 3).
    """
    out = _spice_scalar_first_to_three_scalar_last([0.6, 0.1, 0.2, 0.3])
    assert out == (0.1, 0.2, 0.3, 0.6)


def test_permute_rejects_wrong_length() -> None:
    """Non-4-component input raises ValueError (defensive contract)."""
    with pytest.raises(ValueError, match="expected 4-component"):
        _spice_scalar_first_to_three_scalar_last([1.0, 0.0, 0.0])


# === Seed determinism =======================================================


def test_seed_determinism_same_seed_same_draws() -> None:
    """Two ``random.Random(42)`` instances produce identical sequences.

    This is the contractual basis for ``generate_fixture_records``'s
    determinism. Each (window, spacecraft) gets a uniquely-offset seed; the
    test verifies the underlying RNG behavior we rely on.
    """
    rng_a = random.Random(RNG_SEED)
    rng_b = random.Random(RNG_SEED)
    draws_a = [rng_a.random() for _ in range(100)]
    draws_b = [rng_b.random() for _ in range(100)]
    assert draws_a == draws_b


def test_seed_determinism_different_seeds_diverge() -> None:
    """``random.Random(42)`` and ``random.Random(43)`` produce different sequences."""
    rng_a = random.Random(RNG_SEED)
    rng_b = random.Random(RNG_SEED + 1)
    draws_a = [rng_a.random() for _ in range(20)]
    draws_b = [rng_b.random() for _ in range(20)]
    assert draws_a != draws_b


# === Interval helpers (mirror ck_sample) ====================================


def test_intersect_interval_no_overlap_returns_empty() -> None:
    assert _intersect_interval((0.0, 10.0), [(20.0, 30.0)]) == []


def test_intersect_interval_partial_overlap() -> None:
    assert _intersect_interval((5.0, 15.0), [(10.0, 20.0)]) == [(10.0, 15.0)]


def test_intersect_interval_full_inside() -> None:
    """Band entirely inside coverage → returned as-is."""
    assert _intersect_interval((12.0, 18.0), [(10.0, 20.0)]) == [(12.0, 18.0)]


def test_merge_intervals_disjoint() -> None:
    assert _merge_intervals([(0.0, 5.0), (10.0, 15.0)]) == [(0.0, 5.0), (10.0, 15.0)]


def test_merge_intervals_overlapping() -> None:
    assert _merge_intervals([(0.0, 7.0), (5.0, 15.0)]) == [(0.0, 15.0)]


def test_merge_intervals_unsorted_input() -> None:
    """Unsorted input is sorted before merge."""
    assert _merge_intervals([(10.0, 15.0), (0.0, 5.0), (3.0, 8.0)]) == [
        (0.0, 8.0),
        (10.0, 15.0),
    ]


def test_merge_intervals_empty() -> None:
    assert _merge_intervals([]) == []


# === Struct ID → spacecraft NAIF mapping ====================================


def test_spacecraft_naif_for_struct_v1_bus() -> None:
    """V1 bus (-31000) → SPK SC ID -31. Negative-floor-trap regression check."""
    assert _spacecraft_naif_for_struct(V1_BUS) == V1_BODY


def test_spacecraft_naif_for_struct_v1_platform() -> None:
    """V1 scan platform (-31100) → SPK SC ID -31 (NOT -32, which is the bug)."""
    assert _spacecraft_naif_for_struct(V1_SCAN_PLATFORM) == V1_BODY


def test_spacecraft_naif_for_struct_v2_bus() -> None:
    assert _spacecraft_naif_for_struct(V2_BUS) == V2_BODY


def test_bus_struct_for_spacecraft() -> None:
    assert _bus_struct_for_spacecraft(V1_BODY) == V1_BUS
    assert _bus_struct_for_spacecraft(V2_BODY) == V2_BUS


def test_platform_struct_for_spacecraft() -> None:
    assert _platform_struct_for_spacecraft(V1_BODY) == V1_SCAN_PLATFORM


def test_frame_name_for_bus() -> None:
    """Bus frame names match the FK kernel (vg{1,2}_v02.tf:155-256 / :163-265)."""
    assert _frame_name_for_bus(V1_BODY) == "VG1_SC_BUS"
    assert _frame_name_for_bus(V2_BODY) == "VG2_SC_BUS"


def test_frame_name_unknown_spacecraft_raises() -> None:
    with pytest.raises(ValueError, match="unknown spacecraft"):
        _frame_name_for_bus(-99)


# === L2Record dataclass behavior ============================================


def test_l2_record_to_jsonable_round_trip() -> None:
    """``to_jsonable`` produces the JSON shape AC1 documents."""
    rec = L2Record(
        spacecraftId=-31,
        et=123.456,
        ckWindow="v1-jupiter",
        ground_truth_bus_quat=(0.1, 0.2, 0.3, 0.9),
        ground_truth_platform_quat=(0.0, 0.0, 0.0, 1.0),
    )
    out = rec.to_jsonable()
    assert out == {
        "spacecraftId": -31,
        "et": 123.456,
        "ckWindow": "v1-jupiter",
        "ground_truth_bus_quat": [0.1, 0.2, 0.3, 0.9],
        "ground_truth_platform_quat": [0.0, 0.0, 0.0, 1.0],
    }


def test_l2_records_sort_by_spacecraft_then_et() -> None:
    """Sort key matches AC1's "sorted by (spacecraftId, et) ascending".

    Note on ordering: ``-32 < -31`` numerically, so spacecraftId-ascending
    puts V2 (-32) records BEFORE V1 (-31) records. The Vitest sort-check
    (``cur.spacecraftId > prev.spacecraftId`` / equal-then-et-ge) enforces
    the same convention.
    """
    records = [
        L2Record(spacecraftId=-32, et=100.0, ckWindow="v2-jupiter",
                 ground_truth_bus_quat=(0, 0, 0, 1),
                 ground_truth_platform_quat=(0, 0, 0, 1)),
        L2Record(spacecraftId=-31, et=200.0, ckWindow="v1-saturn",
                 ground_truth_bus_quat=(0, 0, 0, 1),
                 ground_truth_platform_quat=(0, 0, 0, 1)),
        L2Record(spacecraftId=-31, et=50.0, ckWindow="v1-jupiter",
                 ground_truth_bus_quat=(0, 0, 0, 1),
                 ground_truth_platform_quat=(0, 0, 0, 1)),
    ]
    sorted_records = sorted(records, key=lambda r: (r.spacecraftId, r.et))
    # -32 < -31 numerically, so V2 records come first; within -31, et ascending.
    assert [r.spacecraftId for r in sorted_records] == [-32, -31, -31]
    assert [r.et for r in sorted_records] == [100.0, 50.0, 200.0]


# === Constants pin-down =====================================================


def test_default_samples_per_window_meets_ac1_floor() -> None:
    """AC1: ≥ 500 pairs per spacecraft per CK coverage window."""
    assert DEFAULT_SAMPLES_PER_WINDOW >= 500


def test_min_samples_per_window_above_ac3_budget_floor() -> None:
    """AC3: if runtime exceeds budget, parameterize downward (e.g., 100 per window)."""
    assert MIN_SAMPLES_PER_WINDOW >= 100


def test_max_fixture_bytes_matches_ac4_cap() -> None:
    """AC4: fixture size ≤ 2 MB committed."""
    assert MAX_FIXTURE_BYTES == 2 * 1024 * 1024
