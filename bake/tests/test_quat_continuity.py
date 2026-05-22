"""Unit tests for `bake/src/quat_continuity.py` (Story 3.1 AC2, ADR-0024)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(BAKE_SRC))

from quat_continuity import is_sign_continuous, walk_signs  # noqa: E402


def _normalized(arr: np.ndarray) -> np.ndarray:
    """Row-wise L2-normalize so every row is a unit quaternion."""
    return (arr / np.linalg.norm(arr, axis=1, keepdims=True)).astype(np.float64)


def _make_continuous(n: int, seed: int = 0) -> np.ndarray:
    """Build an (N, 4) unit-quaternion sequence that is *already* sign-continuous.

    Generates random quaternions, normalizes them, then forward-walks them so
    every consecutive pair has dot >= 0 by construction. The result is what a
    well-behaved CK extraction would look like AFTER walk_signs.
    """
    rng = np.random.default_rng(seed)
    raw = _normalized(rng.standard_normal(size=(n, 4)))
    # Forward-walk to a continuous representation
    for i in range(1, n):
        if float(np.dot(raw[i - 1], raw[i])) < 0.0:
            raw[i] = -raw[i]
    return raw


# === AC2: synthetic adversarial walk-back ===================================


def test_alternating_sign_flip_walked_back_to_continuous() -> None:
    """AC2 core: every other sample sign-flipped → walked back to continuous."""
    continuous = _make_continuous(50, seed=7)
    # Adversarial input: flip odd-index samples
    adversarial = continuous.copy()
    adversarial[1::2] = -adversarial[1::2]
    walked = walk_signs(adversarial)
    # Result must be sign-continuous
    assert is_sign_continuous(walked)
    # Pairwise dots all >= 0
    dots = np.sum(walked[:-1] * walked[1:], axis=1)
    assert np.all(dots >= 0.0)


def test_alternating_walked_result_matches_original_continuous() -> None:
    """A stream `q[0], -q[1], q[2], -q[3], ...` is walked into the original q[].

    Sanity check: a perfectly-alternating adversarial input should be walked
    back to the input that generated it modulo possible global sign — every
    sample is recovered to the same orientation as the originating continuous
    stream.
    """
    continuous = _make_continuous(20, seed=13)
    adversarial = continuous.copy()
    adversarial[1::2] = -adversarial[1::2]
    walked = walk_signs(adversarial)
    # Each walked sample equals the original (up to a global sign of the whole
    # stream — the walk doesn't add a global sign, so equality is exact).
    np.testing.assert_array_equal(walked, continuous)


# === AC2: continuous input passes through unchanged =========================


def test_continuous_input_unchanged() -> None:
    """AC2: an already-continuous input is returned unchanged."""
    continuous = _make_continuous(30, seed=99)
    walked = walk_signs(continuous)
    np.testing.assert_array_equal(walked, continuous)


def test_walk_signs_returns_copy_not_view() -> None:
    """Walk must NOT mutate the caller's input array (defensive copy contract)."""
    continuous = _make_continuous(10, seed=3)
    snapshot = continuous.copy()
    _ = walk_signs(continuous)
    np.testing.assert_array_equal(continuous, snapshot)


# === AC2: edge cases (empty + single-element) ==============================


def test_empty_input_returned_unchanged() -> None:
    """AC2 edge: empty (0, 4) array returned as-is (no out-of-bounds index)."""
    empty = np.zeros((0, 4), dtype=np.float64)
    walked = walk_signs(empty)
    assert walked.shape == (0, 4)
    assert walked.dtype == np.float64


def test_single_element_input_returned_unchanged() -> None:
    """AC2 edge: single-element (1, 4) array returned as-is (no pairs to walk)."""
    single = _normalized(np.array([[1.0, 2.0, 3.0, 4.0]]))
    walked = walk_signs(single)
    assert walked.shape == (1, 4)
    np.testing.assert_array_equal(walked, single)


# === AC2: orthogonal tie-break ==============================================


def test_orthogonal_pair_dot_zero_not_flipped() -> None:
    """AC2 edge: an exactly-zero dot product (orthogonal quaternions) → not flipped.

    ADR-0024 § Decision pseudocode uses strict `< 0`, so dot == 0 is the
    boundary case and the documented tie-break is *no flip*. This test pins
    that contract — a future refactor flipping on dot ≤ 0 would shift many
    180°-rotation samples and is caught here.
    """
    # Construct two unit quaternions with exactly-zero dot product:
    # [1, 0, 0, 0] and [0, 1, 0, 0]. Both are valid SPICE-convention rotations
    # ([1,0,0,0] = identity; [0,1,0,0] = 180° around x).
    orthogonal = np.array(
        [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
        ],
        dtype=np.float64,
    )
    assert float(np.dot(orthogonal[0], orthogonal[1])) == 0.0
    walked = walk_signs(orthogonal)
    # No flip on the second sample (dot == 0, not < 0)
    np.testing.assert_array_equal(walked, orthogonal)


# === Defense: input validation =============================================


def test_walk_signs_rejects_wrong_shape() -> None:
    """Wrong shape (N, 6 or N, 3 or 1-D) → ValueError."""
    with pytest.raises(ValueError, match=r"shape"):
        walk_signs(np.zeros((5, 6), dtype=np.float64))
    with pytest.raises(ValueError, match=r"shape"):
        walk_signs(np.zeros((5,), dtype=np.float64))


def test_walk_signs_rejects_wrong_dtype() -> None:
    """Wrong dtype (float32 / int) → ValueError."""
    with pytest.raises(ValueError, match=r"dtype"):
        walk_signs(np.zeros((5, 4), dtype=np.float32))


# === Determinism (NFR-R4) ==================================================


def test_walk_signs_is_deterministic_on_repeated_calls() -> None:
    """Same input → exactly same output, twice."""
    rng = np.random.default_rng(seed=42)
    raw = _normalized(rng.standard_normal(size=(100, 4)))
    out_a = walk_signs(raw)
    out_b = walk_signs(raw)
    np.testing.assert_array_equal(out_a, out_b)


# === is_sign_continuous helper =============================================


def test_is_sign_continuous_true_for_walked_output() -> None:
    """The walked output is always sign-continuous (post-condition)."""
    raw = _normalized(np.random.default_rng(123).standard_normal((50, 4)))
    walked = walk_signs(raw)
    assert is_sign_continuous(walked)


def test_is_sign_continuous_false_for_adversarial() -> None:
    """An adversarial sign-flipped input is detected as discontinuous."""
    continuous = _make_continuous(20, seed=5)
    adversarial = continuous.copy()
    adversarial[1::2] = -adversarial[1::2]
    assert not is_sign_continuous(adversarial)


def test_is_sign_continuous_true_for_empty_and_single() -> None:
    """Empty + single-element streams are vacuously sign-continuous."""
    assert is_sign_continuous(np.zeros((0, 4), dtype=np.float64))
    assert is_sign_continuous(np.array([[1.0, 0.0, 0.0, 0.0]]))
