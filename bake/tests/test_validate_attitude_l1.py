"""Story 3.1 AC5 fast-tier tests for the L1 attitude accuracy check.

Exercises the SLERP-vs-quaternion math (`_angle_between_quaternions_mrad`,
`_slerp_at_ets`) and the per-window validation function against synthetic
fixtures that DO NOT need real CK kernels or LFS-pulled bakes.

Slow-tier end-to-end (`@pytest.mark.slow`) coverage lives in
`test_validate_l1.py` via the existing baked-and-validated module-scope
fixture; that fixture is extended below via a separate slow-tier test.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(BAKE_SRC))

from validate_l1 import (  # noqa: E402
    ATTITUDE_RNG_SEED,
    ATTITUDE_SAMPLES_PER_WINDOW,
    MAX_ATTITUDE_ERROR_MRAD,
    AttitudeWindowError,
    _angle_between_quaternions_mrad,
    _is_attitude_body_id,
    _slerp_at_ets,
)


# === _angle_between_quaternions_mrad =======================================


def test_angle_between_identical_quaternions_is_zero() -> None:
    """Identical orientations → 0 mrad."""
    q = np.array([[1.0, 0.0, 0.0, 0.0]])
    err = _angle_between_quaternions_mrad(q, q)
    assert err.shape == (1,)
    assert float(err[0]) == pytest.approx(0.0, abs=1e-12)


def test_angle_between_negated_quaternions_is_zero() -> None:
    """A quaternion and its negation represent the same rotation → 0 mrad.

    The `abs(dot)` in the formula handles the sign ambiguity (q and -q are the
    same orientation). This is the core fact ADR-0024 relies on.
    """
    q = np.array([[0.5, 0.5, 0.5, 0.5]])  # unit quaternion (any rotation)
    err = _angle_between_quaternions_mrad(q, -q)
    assert float(err[0]) == pytest.approx(0.0, abs=1e-12)


def test_angle_between_identity_and_180deg_is_pi_thousand() -> None:
    """Identity vs 180° around x → π * 1000 mrad ≈ 3141.59 mrad."""
    identity = np.array([[1.0, 0.0, 0.0, 0.0]])  # SPICE scalar-first identity
    rot_180_x = np.array([[0.0, 1.0, 0.0, 0.0]])  # 180° around x
    err = _angle_between_quaternions_mrad(identity, rot_180_x)
    assert float(err[0]) == pytest.approx(np.pi * 1000.0, rel=1e-6)


def test_angle_between_handles_n_rows() -> None:
    """Per-row computation works for (N, 4) inputs."""
    q_a = np.array(
        [
            [1.0, 0.0, 0.0, 0.0],  # identity
            [0.5, 0.5, 0.5, 0.5],  # 120° around (1,1,1)
        ]
    )
    err = _angle_between_quaternions_mrad(q_a, q_a)  # identical
    assert err.shape == (2,)
    np.testing.assert_allclose(err, [0.0, 0.0], atol=1e-12)


# === _slerp_at_ets ========================================================


def test_slerp_at_knot_returns_knot_quat() -> None:
    """SLERP at a knot ET returns the knot's quaternion (interpolation identity at knots)."""
    knot_ets = np.array([0.0, 10.0, 20.0])
    # SPICE scalar-first identity quats
    knot_quats = np.array(
        [
            [1.0, 0.0, 0.0, 0.0],
            [0.7071067811865476, 0.7071067811865476, 0.0, 0.0],  # 90° around x
            [0.0, 1.0, 0.0, 0.0],  # 180° around x
        ]
    )
    query_ets = np.array([0.0, 10.0, 20.0])
    out = _slerp_at_ets(knot_ets, knot_quats, query_ets)
    # SLERP at knots returns the knot orientation; verify the angle error vs
    # input is ~0 (within numeric precision, up to global sign).
    err = _angle_between_quaternions_mrad(out, knot_quats)
    np.testing.assert_allclose(err, [0.0, 0.0, 0.0], atol=1e-6)


def test_slerp_returns_nan_for_fewer_than_two_knots() -> None:
    """SciPy Slerp requires K>=2; we return NaNs of correct shape for K<2."""
    knot_ets = np.array([0.0])
    knot_quats = np.array([[1.0, 0.0, 0.0, 0.0]])
    query_ets = np.array([0.5, 1.0])
    out = _slerp_at_ets(knot_ets, knot_quats, query_ets)
    assert out.shape == (2, 4)
    assert np.all(np.isnan(out))


def test_slerp_short_way_consistency_with_walked_quaternions() -> None:
    """Walked (sign-continuous) quats SLERP-interpolate without artifacts.

    Constructs a walked stream of quats rotating uniformly around y from 0° to
    90°, then SLERP-interpolates at midpoints. The angle from identity should
    grow monotonically through the midpoints — no sign-flip jumps.
    """
    # Quaternions rotating around y by 0°, 30°, 60°, 90° — all walked
    # (consecutive dot products positive by construction).
    angles_deg = np.array([0.0, 30.0, 60.0, 90.0])
    angles_rad = np.deg2rad(angles_deg)
    half = angles_rad / 2.0
    knot_quats = np.column_stack(
        [np.cos(half), np.zeros_like(half), np.sin(half), np.zeros_like(half)]
    )
    knot_ets = np.array([0.0, 1.0, 2.0, 3.0])
    # Query at midpoints
    query_ets = np.array([0.5, 1.5, 2.5])
    out = _slerp_at_ets(knot_ets, knot_quats, query_ets)
    identity = np.tile(np.array([1.0, 0.0, 0.0, 0.0]), (3, 1))
    err = _angle_between_quaternions_mrad(out, identity)
    # Expected angles vs identity at the midpoints: 15°, 45°, 75°
    expected = np.deg2rad([15.0, 45.0, 75.0]) * 1000.0
    np.testing.assert_allclose(err, expected, rtol=1e-6)


# === _is_attitude_body_id ===================================================


def test_is_attitude_body_id() -> None:
    """All four CK structure IDs are recognized; trajectory IDs are not."""
    assert _is_attitude_body_id(-31000)
    assert _is_attitude_body_id(-31100)
    assert _is_attitude_body_id(-32000)
    assert _is_attitude_body_id(-32100)
    assert not _is_attitude_body_id(-31)
    assert not _is_attitude_body_id(-32)
    assert not _is_attitude_body_id(10)
    assert not _is_attitude_body_id(0)


# === AttitudeWindowError.passed dataclass property =========================


def _mk_window_err(max_mrad: float) -> AttitudeWindowError:
    return AttitudeWindowError(
        spacecraft_naif_id=-31,
        body_name="Voyager 1",
        struct_id=-31000,
        kind="bus_attitude",
        file_name="x.bin.br",
        et_start=0.0,
        et_end=100.0,
        utc_start="...",
        utc_end="...",
        samples=100,
        max_angle_error_mrad=max_mrad,
        rms_angle_error_mrad=max_mrad * 0.5,
        worst_error_et=50.0,
        worst_error_utc="...",
    )


def test_attitude_window_error_pass_at_threshold() -> None:
    """At the NFR-P10 boundary (max=1.0 mrad), the window passes (≤, not <)."""
    err = _mk_window_err(MAX_ATTITUDE_ERROR_MRAD)
    assert err.passed


def test_attitude_window_error_fail_above_threshold() -> None:
    """Just above 1 mrad → FAIL."""
    err = _mk_window_err(MAX_ATTITUDE_ERROR_MRAD + 1e-6)
    assert not err.passed


# === Deterministic-RNG contract (NFR-R4) ===================================


def test_attitude_rng_seed_is_fixed() -> None:
    """AC5: the seed for random ET sampling is FIXED (NFR-R4 determinism)."""
    rng_a = np.random.default_rng(seed=ATTITUDE_RNG_SEED)
    rng_b = np.random.default_rng(seed=ATTITUDE_RNG_SEED)
    a = rng_a.uniform(0.0, 1.0, size=ATTITUDE_SAMPLES_PER_WINDOW)
    b = rng_b.uniform(0.0, 1.0, size=ATTITUDE_SAMPLES_PER_WINDOW)
    np.testing.assert_array_equal(a, b)


def test_attitude_samples_per_window_is_at_least_100() -> None:
    """K (samples per window) must be at least 100 for statistical confidence."""
    assert ATTITUDE_SAMPLES_PER_WINDOW >= 100


# === Threshold constants pinned at NFR-P10 ================================


def test_max_attitude_error_mrad_pinned_at_1mrad() -> None:
    """NFR-P10: max <= 1 mrad (≤ 0.05°). Source-level tripwire."""
    assert MAX_ATTITUDE_ERROR_MRAD == 1.0
