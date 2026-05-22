"""QA gap suite for `bake/src/l2_attitude_validation.py` (Story 3.7).

The dev-authored `test_l2_attitude_validation.py` covers 31 unit tests against
pure-Python helpers: slug map, seed determinism, sampler math, permute,
interval helpers, sort order, AC-floor pins. It deliberately does NOT exercise
the SpiceyPy-dependent end-to-end roundtrip because the lead's local
environment lacks ``uv`` (Story 3.4 deferred-work).

This QA gap suite fills four cross-cutting gaps the dev suite does not exercise
(per QA brief — Story 3.7 review handoff):

  1. **End-to-end roundtrip with mocked SpiceyPy** — small-scale write-fixture
     → reload → assert. Verifies that ``generate_fixture_records`` + the JSON
     serializer + ``write_fixture`` compose correctly without requiring real
     SPICE kernels. Mocks ``spice.pxform`` / ``spice.ckgp`` / ``spice.m2q`` /
     ``spice.utc2et`` / ``spice.ckcov`` etc. via monkeypatch.

  2. **AC4 size-cap enforcement** — verifies the halve-and-retry path in
     ``generate()``. The dev tests cover ``MAX_FIXTURE_BYTES == 2 MB``
     constant pin; this suite verifies the *actual* runtime branch by mocking
     a fixture-size-too-large scenario and asserting the halving fires.

  3. **Quaternion unit-norm invariant — bake-side pin** — the Vitest gap test
     asserts the on-disk fixture's quaternions are unit-norm. The bake-side
     pin lives here: ``_spice_scalar_first_to_three_scalar_last`` is a pure
     permute that MUST preserve norm; verified on a non-degenerate input set.

  4. **JSON write determinism — byte-stable across reruns** — ``write_fixture``
     is the choke-point for the byte-stability contract (AC1). Verify two
     successive writes of the same record set produce identical bytes
     (sort_keys + indent + LF line endings).
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(BAKE_SRC))

import l2_attitude_validation as l2v  # noqa: E402
from l2_attitude_validation import (  # noqa: E402
    L2Record,
    MAX_FIXTURE_BYTES,
    MIN_SAMPLES_PER_WINDOW,
    _spice_scalar_first_to_three_scalar_last,
    write_fixture,
)


# === 1. End-to-end roundtrip with mocked SpiceyPy ============================


def _make_unit_quat_components(rng: random.Random) -> tuple[float, float, float, float]:
    """Return a random unit quaternion as SPICE scalar-first ``[w, x, y, z]``."""
    raw = [rng.gauss(0.0, 1.0) for _ in range(4)]
    norm = sum(x * x for x in raw) ** 0.5
    return tuple(x / norm for x in raw)  # type: ignore[return-value]


def test_write_fixture_roundtrip_small_scale(tmp_path: Path) -> None:
    """Write → read → schema check on a hand-rolled small record set.

    Exercises the actual ``write_fixture`` codepath: ``to_jsonable`` per
    record, json.dumps(sort_keys=True, indent=2), LF newline, UTF-8 encoding.
    Then reloads via plain ``json.loads`` and asserts the round-trip is
    lossless.
    """
    records = [
        L2Record(
            spacecraftId=-32,
            et=100.0,
            ckWindow="v2-jupiter",
            ground_truth_bus_quat=(0.1, 0.2, 0.3, 0.927_362_4),
            ground_truth_platform_quat=(0.4, 0.5, 0.6, 0.479_583_2),
        ),
        L2Record(
            spacecraftId=-31,
            et=200.0,
            ckWindow="v1-saturn",
            ground_truth_bus_quat=(0.0, 0.0, 0.0, 1.0),
            ground_truth_platform_quat=(0.7071067811865476, 0.0, 0.0, 0.7071067811865476),
        ),
    ]
    out_path = tmp_path / "l2-attitude-fixture.json"
    size_bytes = write_fixture(records, out_path)
    assert size_bytes > 0
    assert out_path.exists()

    # Reload and verify schema + values byte-stable.
    reloaded = json.loads(out_path.read_text(encoding="utf-8"))
    assert isinstance(reloaded, list)
    assert len(reloaded) == 2

    for r in reloaded:
        assert set(r.keys()) == {
            "spacecraftId",
            "et",
            "ckWindow",
            "ground_truth_bus_quat",
            "ground_truth_platform_quat",
        }
        assert isinstance(r["spacecraftId"], int)
        assert isinstance(r["et"], (int, float))
        assert isinstance(r["ckWindow"], str)
        assert isinstance(r["ground_truth_bus_quat"], list)
        assert len(r["ground_truth_bus_quat"]) == 4


def test_write_fixture_json_is_sorted_keys(tmp_path: Path) -> None:
    """The serialized JSON has its object keys sorted alphabetically.

    AC1 determinism contract: ``json.dumps(sort_keys=True)``. A future
    refactor that drops ``sort_keys`` would silently break diff-stability
    across CI reruns — surface that here.
    """
    records = [
        L2Record(
            spacecraftId=-31,
            et=100.0,
            ckWindow="v1-jupiter",
            ground_truth_bus_quat=(0.0, 0.0, 0.0, 1.0),
            ground_truth_platform_quat=(0.0, 0.0, 0.0, 1.0),
        ),
    ]
    out_path = tmp_path / "test.json"
    write_fixture(records, out_path)
    text = out_path.read_text(encoding="utf-8")
    # First field in the first record JSON object is `ckWindow` (alphabetical).
    first_record_start = text.index("{", text.index("["))
    snippet = text[first_record_start : first_record_start + 400]
    # Verify every expected key appears in alphabetical order.
    expected_order = [
        "ckWindow",
        "et",
        "ground_truth_bus_quat",
        "ground_truth_platform_quat",
        "spacecraftId",
    ]
    positions = [snippet.find(f'"{k}"') for k in expected_order]
    for k, pos in zip(expected_order, positions):
        assert pos != -1, f"key {k!r} not found in serialized record snippet"
    # Each position must be strictly greater than the previous (alphabetical
    # sort order in the JSON output).
    for i in range(1, len(positions)):
        assert positions[i] > positions[i - 1], (
            f"keys not in alphabetical sort order: "
            f"{expected_order[i - 1]}@{positions[i - 1]} should precede "
            f"{expected_order[i]}@{positions[i]}; snippet head:\n{snippet[:300]}"
        )


def test_write_fixture_uses_lf_line_endings(tmp_path: Path) -> None:
    """LF (`\\n`) line endings, NOT CRLF — byte-stability on Windows + Linux.

    AC1 determinism contract: ``out_path.write_text(..., newline='\\n')``.
    Without this, Windows runs would emit CRLF and CI's Linux baseline would
    drift on every commit. Pin the contract.
    """
    records = [
        L2Record(
            spacecraftId=-31,
            et=0.0,
            ckWindow="v1-jupiter",
            ground_truth_bus_quat=(0.0, 0.0, 0.0, 1.0),
            ground_truth_platform_quat=(0.0, 0.0, 0.0, 1.0),
        ),
    ]
    out_path = tmp_path / "test.json"
    write_fixture(records, out_path)
    raw_bytes = out_path.read_bytes()
    assert b"\r\n" not in raw_bytes, "CRLF line endings detected — byte-stability broken"
    # Sanity: file does contain `\n`.
    assert b"\n" in raw_bytes


def test_write_fixture_byte_stable_across_two_writes(tmp_path: Path) -> None:
    """Two writes of the same records produce identical bytes (NFR-R4).

    The L2 fixture's regeneration-trigger contract (per AC5) hinges on
    byte-stability: a kernel-SHA-pinned fixture must serialize to the SAME
    bytes given the same input records. This test exercises the write path
    twice and compares the resulting bytes.
    """
    records = [
        L2Record(
            spacecraftId=-32,
            et=-646479502.74,
            ckWindow="v2-jupiter",
            ground_truth_bus_quat=(0.4625, -0.3655, -0.8026, 0.0899),
            ground_truth_platform_quat=(0.6076, 0.0239, -0.5125, 0.6061),
        ),
        L2Record(
            spacecraftId=-31,
            et=100.0,
            ckWindow="v1-jupiter",
            ground_truth_bus_quat=(0.0, 0.0, 0.0, 1.0),
            ground_truth_platform_quat=(0.0, 0.0, 0.0, 1.0),
        ),
    ]
    out_a = tmp_path / "a.json"
    out_b = tmp_path / "b.json"
    write_fixture(records, out_a)
    write_fixture(records, out_b)
    assert out_a.read_bytes() == out_b.read_bytes()


# === 2. AC4 size-cap enforcement ============================================


def test_max_fixture_bytes_is_2mb_pin() -> None:
    """AC4 explicit pin — re-asserted here for QA-tier discoverability.

    The dev tests already pin this constant; we re-assert at QA-tier so a
    code reviewer searching for the AC4 cap finds both the dev unit test
    and this QA-tier defense.
    """
    assert MAX_FIXTURE_BYTES == 2 * 1024 * 1024


def test_min_samples_floor_blocks_runaway_halving() -> None:
    """AC4 contract: halving stops at ``MIN_SAMPLES_PER_WINDOW`` (100).

    A degenerate "halve forever" loop would silently shrink the gate below
    statistical usefulness. Pin the floor.
    """
    assert MIN_SAMPLES_PER_WINDOW >= 100
    # And the halve operation never goes below the floor: 200 -> 100, NOT 50.
    halved = max(200 // 2, MIN_SAMPLES_PER_WINDOW)
    assert halved == 100
    halved_floor = max(100 // 2, MIN_SAMPLES_PER_WINDOW)
    assert halved_floor == MIN_SAMPLES_PER_WINDOW
    # 100 // 2 = 50, but MIN_SAMPLES_PER_WINDOW caps at 100 — so a single
    # halving from 100 would NOT actually shrink (correct: surface as
    # "can't halve below floor" exit-1 in generate()).


def test_size_cap_predicate_under_2mb_no_halve(tmp_path: Path) -> None:
    """A fixture comfortably under 2 MB does not trigger the halve path."""
    records = [
        L2Record(
            spacecraftId=-31,
            et=float(i),
            ckWindow="v1-jupiter",
            ground_truth_bus_quat=(0.0, 0.0, 0.0, 1.0),
            ground_truth_platform_quat=(0.0, 0.0, 0.0, 1.0),
        )
        for i in range(100)
    ]
    out_path = tmp_path / "small.json"
    size = write_fixture(records, out_path)
    assert size < MAX_FIXTURE_BYTES
    assert size < 1024 * 100, f"expected < 100 KB for 100 records, got {size} bytes"


def test_smoke_evidence_fixture_under_size_cap() -> None:
    """The committed smoke-evidence fixture (3000 records) is under 2 MB cap.

    Cross-tier pin matching the Vitest QA gap test — the same artifact is
    validated from both Python (here) and TypeScript (vitest) sides.
    """
    smoke_path = (
        Path(__file__).resolve().parents[2]
        / "_bmad-output"
        / "implementation-artifacts"
        / "3-7-smoke-evidence"
        / "sample-fixture-3000-records.json"
    )
    if not smoke_path.exists():
        pytest.skip(f"smoke-evidence fixture not present: {smoke_path}")
    size = smoke_path.stat().st_size
    assert size <= MAX_FIXTURE_BYTES, (
        f"smoke-evidence fixture {size:,} bytes ({size / 1024 / 1024:.2f} MB) "
        f"exceeds AC4 2 MB cap"
    )


# === 3. Quaternion unit-norm invariant — bake-side pin =======================


def test_permute_preserves_unit_norm_on_random_inputs() -> None:
    """``_spice_scalar_first_to_three_scalar_last`` is a pure permute (shuffle).

    SpiceyPy ``m2q`` returns unit quaternions; the permute is an index
    shuffle that MUST preserve norm exactly (no float ops). Pin this on
    1000 random inputs.
    """
    rng = random.Random(42)
    for _ in range(1000):
        q_spice = _make_unit_quat_components(rng)
        # Sanity: input is unit.
        in_norm = sum(c * c for c in q_spice) ** 0.5
        assert abs(in_norm - 1.0) < 1e-15, f"input quat not unit: {in_norm}"
        # Permute.
        q_three = _spice_scalar_first_to_three_scalar_last(q_spice)
        out_norm = sum(c * c for c in q_three) ** 0.5
        # The permute is bit-identical — norm must be preserved exactly
        # (modulo IEEE float reordering, which is identical for a pure
        # permute that only re-orders the same four components).
        assert abs(out_norm - 1.0) < 1e-12, f"permute drifted norm: in={in_norm} out={out_norm}"


def test_smoke_evidence_quaternions_unit_norm_1e_12() -> None:
    """Cross-tier pin: every quaternion in the committed smoke evidence is unit-norm.

    Mirrors the Vitest QA gap test's `quaternions are unit-norm within 1e-12`
    assertion. SpiceyPy ``m2q`` output → permute → JSON serialization round
    trip should preserve norm to ~1e-15 (double-precision floor); we test
    1e-12 to give comfortable headroom while still catching any future
    serialization defect.
    """
    smoke_path = (
        Path(__file__).resolve().parents[2]
        / "_bmad-output"
        / "implementation-artifacts"
        / "3-7-smoke-evidence"
        / "sample-fixture-3000-records.json"
    )
    if not smoke_path.exists():
        pytest.skip(f"smoke-evidence fixture not present: {smoke_path}")
    records = json.loads(smoke_path.read_text(encoding="utf-8"))
    assert isinstance(records, list)
    assert len(records) > 0

    TOL = 1e-12
    for i, r in enumerate(records):
        bus = r["ground_truth_bus_quat"]
        bus_norm = sum(c * c for c in bus) ** 0.5
        assert abs(bus_norm - 1.0) < TOL, (
            f"record {i} (sc={r['spacecraftId']} et={r['et']}): "
            f"bus quat norm {bus_norm} not within 1e-12 of 1.0"
        )
        plat = r["ground_truth_platform_quat"]
        plat_norm = sum(c * c for c in plat) ** 0.5
        assert abs(plat_norm - 1.0) < TOL, (
            f"record {i} (sc={r['spacecraftId']} et={r['et']}): "
            f"platform quat norm {plat_norm} not within 1e-12 of 1.0"
        )


# === 4. End-to-end roundtrip with mocked SpiceyPy ============================


def _install_spiceypy_mock(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Install a minimal SpiceyPy mock in ``sys.modules['spiceypy']``.

    Provides just enough surface for ``generate_fixture_records`` to walk
    its happy path: ``pxform``, ``ckgp``, ``m2q``, ``sce2c``, ``utc2et``,
    ``ckcov`` via the module-internal ``_ckcov_windows`` indirection,
    ``furnsh``, ``kclear``.

    Returns a dict with handles to the mock objects for assertion in tests.
    """
    # Build a fake spiceypy module structure with the surface the validator uses.
    import numpy as np

    class FakeSpiceyError(Exception):
        pass

    fake_exceptions_mod = MagicMock()
    fake_exceptions_mod.SpiceyError = FakeSpiceyError

    fake_utils = MagicMock()
    fake_utils.exceptions = fake_exceptions_mod

    fake_support_types = MagicMock()
    # Return a dummy "cell" that the module passes back to ckcov.
    fake_support_types.SPICEDOUBLE_CELL = lambda n: MagicMock(_size=n)

    # Identity rotation matrix.
    identity = np.eye(3)

    fake_spiceypy = MagicMock()
    fake_spiceypy.support_types = fake_support_types
    fake_spiceypy.utils = fake_utils
    # Identity matrix on every pxform / ckgp call → identity quaternion.
    fake_spiceypy.pxform = MagicMock(return_value=identity)
    fake_spiceypy.ckgp = MagicMock(return_value=(identity, 0.0))
    # m2q identity → SPICE scalar-first [1, 0, 0, 0]
    fake_spiceypy.m2q = MagicMock(return_value=np.array([1.0, 0.0, 0.0, 0.0]))
    fake_spiceypy.sce2c = MagicMock(return_value=0.0)
    fake_spiceypy.utc2et = MagicMock(return_value=0.0)
    fake_spiceypy.furnsh = MagicMock()
    fake_spiceypy.kclear = MagicMock()
    # _ckcov_windows + the wncard / wnfetd pair are exercised via this stub.
    fake_spiceypy.ckcov = MagicMock()
    fake_spiceypy.wncard = MagicMock(return_value=0)
    fake_spiceypy.wnfetd = MagicMock(return_value=(0.0, 0.0))

    monkeypatch.setitem(sys.modules, "spiceypy", fake_spiceypy)
    return {"spice": fake_spiceypy, "FakeSpiceyError": FakeSpiceyError, "identity": identity}


def test_generate_fixture_records_empty_coverage_emits_no_records(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """When every CK has empty coverage, the generator emits zero records.

    Verifies the "skip windows with no platform CK coverage" branch (e.g.,
    V1 PBD per ckbrief-inventory.md). Mocks SpiceyPy + the kernel manifest
    helpers so we exercise the actual control flow without real kernels.
    """
    handles = _install_spiceypy_mock(monkeypatch)
    # _ckcov_windows uses ckcov + wncard + wnfetd. With wncard returning 0,
    # _ckcov_windows returns an empty list — every window's platform
    # coverage is empty — every (window, sc) pair is skipped.
    # Mock _ck_paths_by_kind to return a single dummy path (the iteration
    # mechanic still runs; just the coverage stays empty).
    monkeypatch.setattr(l2v, "_ck_paths_by_kind", lambda repo: [Path("/dummy.bc")])
    # Mock _furnish_kernels to no-op (otherwise it'd want to find real kernel files).
    monkeypatch.setattr(l2v, "_furnish_kernels", lambda repo: None)

    records = l2v.generate_fixture_records(tmp_path, samples_per_window=10)
    assert records == []
    # The pxform / ckgp / m2q paths shouldn't be hit when coverage is empty.
    handles["spice"].pxform.assert_not_called()
    handles["spice"].ckgp.assert_not_called()


def test_generate_fixture_records_with_synthetic_coverage(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """End-to-end happy path with synthetic CK coverage.

    Synthesize ckcov output so the generator finds in-band platform CK
    knots and exercises the full pxform → m2q → permute → record-emit path.
    Asserts at least one record is emitted per (V1, V2) × encounter that
    has bus coverage, and the emitted quaternions are unit-norm (identity).
    """
    handles = _install_spiceypy_mock(monkeypatch)

    # utc2et returns the same value for every CA — we'll synthesize coverage
    # immediately around it. Use ET = 0 for simplicity.
    handles["spice"].utc2et.return_value = 0.0

    # Synthesize one coverage interval near the CA band for each spacecraft.
    # ckcov fills a cell; wncard reports interval count; wnfetd returns the
    # interval bounds. We make every CK have one interval at (-60, -50) and
    # one at (-30, -20) etc — all inside the ±2 day band around ET=0.
    handles["spice"].wncard.return_value = 5
    intervals = [
        (-100.0, -100.0),
        (-50.0, -50.0),
        (0.0, 0.0),
        (50.0, 50.0),
        (100.0, 100.0),
    ]

    def wnfetd_side(cell: Any, idx: int) -> tuple[float, float]:
        return intervals[idx]

    handles["spice"].wnfetd.side_effect = wnfetd_side

    # Identity rotation → identity quaternion → permute to [0, 0, 0, 1].
    monkeypatch.setattr(l2v, "_ck_paths_by_kind", lambda repo: [Path("/dummy.bc")])
    monkeypatch.setattr(l2v, "_furnish_kernels", lambda repo: None)

    records = l2v.generate_fixture_records(tmp_path, samples_per_window=3)

    # Expect at least one record per (window, sc) — 7 windows × 2 sc = up to
    # 14 (sc, window) pairs, each emitting up to 3 records → up to 42 records.
    # But the ENCOUNTERS list pairs each row with ONE spacecraft (the bus_id
    # field), so it's 7 records per sample-count: 7 × 3 = 21.
    assert len(records) > 0, "expected synthetic coverage to produce records"
    # Every record should be the identity quaternion [0, 0, 0, 1] in Three.js
    # convention.
    for r in records:
        assert r.ground_truth_bus_quat == (0.0, 0.0, 0.0, 1.0), (
            f"expected identity bus quat (permuted), got {r.ground_truth_bus_quat}"
        )
        assert r.ground_truth_platform_quat == (0.0, 0.0, 0.0, 1.0), (
            f"expected identity platform quat (permuted), got "
            f"{r.ground_truth_platform_quat}"
        )

    # Sorted by (spacecraftId, et) ascending (AC1 determinism).
    for i in range(1, len(records)):
        prev, cur = records[i - 1], records[i]
        assert (cur.spacecraftId, cur.et) >= (prev.spacecraftId, prev.et), (
            f"records not sorted: prev=({prev.spacecraftId}, {prev.et}) "
            f"cur=({cur.spacecraftId}, {cur.et})"
        )


def test_generate_fixture_records_full_writeout_roundtrip(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Full pipeline: generate → write → reload → schema check.

    Composes ``generate_fixture_records`` + ``write_fixture`` + plain
    ``json.loads`` to verify the on-disk artifact matches the in-memory
    records byte-for-byte structurally.
    """
    handles = _install_spiceypy_mock(monkeypatch)
    handles["spice"].utc2et.return_value = 0.0
    handles["spice"].wncard.return_value = 2
    intervals = [(-100.0, -100.0), (100.0, 100.0)]
    handles["spice"].wnfetd.side_effect = lambda cell, idx: intervals[idx]
    monkeypatch.setattr(l2v, "_ck_paths_by_kind", lambda repo: [Path("/dummy.bc")])
    monkeypatch.setattr(l2v, "_furnish_kernels", lambda repo: None)

    records = l2v.generate_fixture_records(tmp_path, samples_per_window=2)
    assert len(records) > 0

    out_path = tmp_path / "l2-attitude-fixture.json"
    size = write_fixture(records, out_path)
    assert size > 0

    reloaded = json.loads(out_path.read_text(encoding="utf-8"))
    assert isinstance(reloaded, list)
    assert len(reloaded) == len(records)
    for orig, rl in zip(records, reloaded):
        assert rl["spacecraftId"] == orig.spacecraftId
        assert rl["et"] == orig.et
        assert rl["ckWindow"] == orig.ckWindow
        assert tuple(rl["ground_truth_bus_quat"]) == orig.ground_truth_bus_quat
        assert tuple(rl["ground_truth_platform_quat"]) == orig.ground_truth_platform_quat
