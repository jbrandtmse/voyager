"""Unit tests for `bake/src/vtrj_writer.py` (Story 1.4 AC2)."""

from __future__ import annotations

import hashlib
import struct
import sys
from pathlib import Path

import numpy as np
import pytest

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(BAKE_SRC))

import vtrj_writer  # noqa: E402
from vtrj_writer import HEADER_SIZE, MAGIC, VERSION, read_vtrj, write_vtrj  # noqa: E402


def _make_samples(n: int, seed: int = 0) -> np.ndarray:
    """Build a deterministic (N, 6) Float64 sample array with sane physical-ish values."""
    rng = np.random.default_rng(seed)
    pos = rng.uniform(-1e9, 1e9, size=(n, 3))
    vel = rng.uniform(-30.0, 30.0, size=(n, 3))
    return np.concatenate([pos, vel], axis=1).astype(np.float64)


def test_header_round_trip(tmp_path: Path) -> None:
    """AC2: writing then reading back the header reproduces every field exactly."""
    samples = _make_samples(100)
    target = tmp_path / "voyager-1-test.bin.br"
    sha = write_vtrj(
        target_path=target,
        body_id=-31,
        et_start=-100.0,
        et_end=100.0,
        cadence_seconds=2.0,
        samples=samples,
    )
    assert isinstance(sha, str) and len(sha) == 64
    header, parsed = read_vtrj(target)
    assert header["magic"] == MAGIC
    assert header["version"] == VERSION
    assert header["body_id"] == -31
    assert header["et_start"] == -100.0
    assert header["et_end"] == 100.0
    assert header["sample_count"] == 100
    assert header["cadence_seconds"] == 2.0
    assert parsed.shape == samples.shape
    assert parsed.dtype == np.float64
    np.testing.assert_array_equal(parsed, samples)


def test_header_struct_layout_is_exactly_40_bytes(tmp_path: Path) -> None:
    """AC2 byte-level: first 40 bytes match the locked offset/size table."""
    samples = _make_samples(8)
    target = tmp_path / "voyager-2-test.bin.br"
    write_vtrj(
        target_path=target,
        body_id=-32,
        et_start=1.0,
        et_end=9.0,
        cadence_seconds=1.0,
        samples=samples,
    )
    # Decompress and parse the first 40 bytes manually
    import brotli

    raw = brotli.decompress(target.read_bytes())
    assert len(raw) >= HEADER_SIZE
    header_bytes = raw[:HEADER_SIZE]
    magic, version, body_id, et_start, et_end, sample_count, cadence, reserved = struct.unpack(
        "<4sHiddId2s", header_bytes
    )
    assert magic == b"VTRJ"
    assert version == 1
    assert body_id == -32
    assert et_start == 1.0
    assert et_end == 9.0
    assert sample_count == 8
    assert cadence == 1.0
    assert reserved == b"\x00\x00"
    # Body must be exactly sample_count * 48 bytes
    assert len(raw) == HEADER_SIZE + 8 * 48


def test_byte_identical_for_same_input(tmp_path: Path) -> None:
    """AC3 (NFR-R4): two writes of the same input produce the same SHA-256."""
    samples = _make_samples(500, seed=42)
    a = tmp_path / "a.bin.br"
    b = tmp_path / "b.bin.br"
    sha_a = write_vtrj(a, body_id=-31, et_start=0.0, et_end=1.0, cadence_seconds=0.002, samples=samples)
    sha_b = write_vtrj(b, body_id=-31, et_start=0.0, et_end=1.0, cadence_seconds=0.002, samples=samples)
    assert sha_a == sha_b
    # And file bytes are identical
    assert hashlib.sha256(a.read_bytes()).hexdigest() == hashlib.sha256(b.read_bytes()).hexdigest()


def test_atomic_write_cleans_up_part_file(tmp_path: Path) -> None:
    """The `.part` sidecar must not remain after a successful write."""
    target = tmp_path / "voyager-1.bin.br"
    write_vtrj(
        target_path=target,
        body_id=-31,
        et_start=0.0,
        et_end=1.0,
        cadence_seconds=0.5,
        samples=_make_samples(3),
    )
    assert target.exists()
    assert not target.with_suffix(target.suffix + ".part").exists()


def test_invalid_body_id_rejected(tmp_path: Path) -> None:
    """AC2: body_id outside {-31, -32} must raise ValueError."""
    target = tmp_path / "x.bin.br"
    with pytest.raises(ValueError, match="body_id"):
        write_vtrj(target, body_id=-99, et_start=0.0, et_end=1.0, cadence_seconds=1.0, samples=_make_samples(2))


def test_invalid_et_window_rejected(tmp_path: Path) -> None:
    """et_end must be strictly greater than et_start."""
    target = tmp_path / "x.bin.br"
    with pytest.raises(ValueError, match="et_start"):
        write_vtrj(target, body_id=-31, et_start=1.0, et_end=1.0, cadence_seconds=1.0, samples=_make_samples(2))


def test_invalid_cadence_rejected(tmp_path: Path) -> None:
    """cadence_seconds must be positive."""
    target = tmp_path / "x.bin.br"
    with pytest.raises(ValueError, match="cadence_seconds"):
        write_vtrj(target, body_id=-31, et_start=0.0, et_end=1.0, cadence_seconds=0.0, samples=_make_samples(2))


def test_invalid_dtype_rejected(tmp_path: Path) -> None:
    """samples.dtype must be np.float64 (NFR float64 end-to-end)."""
    target = tmp_path / "x.bin.br"
    bad = np.zeros((3, 6), dtype=np.float32)
    with pytest.raises(ValueError, match="dtype"):
        write_vtrj(target, body_id=-31, et_start=0.0, et_end=1.0, cadence_seconds=0.5, samples=bad)


def test_invalid_shape_rejected(tmp_path: Path) -> None:
    """samples must be (N, 6) — anything else is rejected."""
    target = tmp_path / "x.bin.br"
    bad = np.zeros((3, 5), dtype=np.float64)
    with pytest.raises(ValueError, match="shape"):
        write_vtrj(target, body_id=-31, et_start=0.0, et_end=1.0, cadence_seconds=0.5, samples=bad)


def test_read_rejects_bad_magic(tmp_path: Path) -> None:
    """read_vtrj must reject a file whose magic header is not 'VTRJ'."""
    import brotli

    bogus = b"XXXX" + b"\x00" * (HEADER_SIZE - 4) + b"\x00" * 48
    target = tmp_path / "bogus.bin.br"
    target.write_bytes(brotli.compress(bogus, quality=11))
    with pytest.raises(ValueError, match="magic"):
        read_vtrj(target)


def test_read_rejects_bad_version(tmp_path: Path) -> None:
    """read_vtrj must reject a file with version != 1."""
    import brotli

    # Header with version = 2
    header = struct.pack("<4sHiddId2s", b"VTRJ", 2, -31, 0.0, 1.0, 1, 1.0, b"\x00\x00")
    body = struct.pack("<6d", 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    target = tmp_path / "v2.bin.br"
    target.write_bytes(brotli.compress(header + body, quality=11))
    with pytest.raises(ValueError, match="version"):
        read_vtrj(target)


def test_read_rejects_out_of_set_body_id(tmp_path: Path) -> None:
    """Story 2.0 AC7: read_vtrj must reject a corrupt VTRJ whose body_id is
    not in ALLOWED_BODY_IDS, restoring write/read symmetry.

    Constructs a deliberately-corrupt VTRJ with body_id = 0 (not in the
    allowed set: {-31, -32, 10, 1..8, 301}) bypassing the write-side
    validator by struct-packing the header directly, then asserts
    `read_vtrj` raises ValueError on read.
    """
    import brotli

    # body_id = 0 — outside ALLOWED_BODY_IDS
    header = struct.pack("<4sHiddId2s", b"VTRJ", 1, 0, 0.0, 1.0, 1, 1.0, b"\x00\x00")
    body = struct.pack("<6d", 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    target = tmp_path / "bad-body-id.bin.br"
    target.write_bytes(brotli.compress(header + body, quality=11))
    with pytest.raises(ValueError, match="body_id"):
        read_vtrj(target)


def test_read_rejects_unexpected_body_id_99(tmp_path: Path) -> None:
    """Story 2.0 AC7: an out-of-set positive body_id (99) is also rejected."""
    import brotli

    header = struct.pack("<4sHiddId2s", b"VTRJ", 1, 99, 0.0, 1.0, 1, 1.0, b"\x00\x00")
    body = struct.pack("<6d", 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    target = tmp_path / "bad-body-id-99.bin.br"
    target.write_bytes(brotli.compress(header + body, quality=11))
    with pytest.raises(ValueError, match="body_id"):
        read_vtrj(target)


# --- Story 3.1 AC1-T1: VTRJ schema extension for quaternion attitude --------


def _make_quats(n: int, seed: int = 0) -> np.ndarray:
    """Build a deterministic (N, 4) Float64 unit-quaternion array (SPICE scalar-first)."""
    rng = np.random.default_rng(seed)
    raw = rng.standard_normal(size=(n, 4))
    norms = np.linalg.norm(raw, axis=1, keepdims=True)
    return (raw / norms).astype(np.float64)


def _make_ets(n: int, et_start: float, et_end: float) -> np.ndarray:
    """Monotonic non-decreasing (N,) ET array spanning [et_start, et_end]."""
    return np.linspace(et_start, et_end, n, dtype=np.float64)


def test_write_read_roundtrip_attitude(tmp_path: Path) -> None:
    """AC1-T1 (Story 3.1 amended 2026-05-21): attitude VTRJ roundtrip — explicit-ET
    body shape (N, 5) = [et, qw, qx, qy, qz] per row, preserved byte-for-byte.

    Writes a (100, 4) Float64 quaternion array + a matching (100,) ETs array
    with body_id=-31000 (V1 bus CK structure ID), reads it back, asserts the
    on-disk body shape is (100, 5) with column 0 = ETs and columns 1-4 = quats.
    """
    samples = _make_quats(100, seed=7)
    ets = _make_ets(100, -100.0, 100.0)
    target = tmp_path / "v1-bus-attitude-test.bin.br"
    sha = write_vtrj(
        target_path=target,
        body_id=-31000,
        et_start=-100.0,
        et_end=100.0,
        cadence_seconds=2.0,
        samples=samples,
        kind="attitude",
        ets=ets,
    )
    assert isinstance(sha, str) and len(sha) == 64
    header, parsed = read_vtrj(target)
    assert header["magic"] == MAGIC
    assert header["version"] == VERSION
    assert header["body_id"] == -31000
    assert header["et_start"] == -100.0
    assert header["et_end"] == 100.0
    assert header["sample_count"] == 100
    assert header["cadence_seconds"] == 2.0
    assert header["kind"] == "attitude"
    assert parsed.shape == (100, 5)
    assert parsed.dtype == np.float64
    # Column 0 is explicit ETs; columns 1-4 are the quaternion [w, x, y, z].
    np.testing.assert_array_equal(parsed[:, 0], ets)
    np.testing.assert_array_equal(parsed[:, 1:5], samples)


def test_attitude_file_size_is_header_plus_5xN_doubles(tmp_path: Path) -> None:
    """AC1-T1 (Story 3.1 amended): uncompressed attitude file size == 40 + N * 40
    (5 doubles per sample: explicit ET + 4-component quaternion).
    """
    import brotli

    samples = _make_quats(50, seed=11)
    ets = _make_ets(50, 0.0, 49.0)
    target = tmp_path / "v2-bus-attitude.bin.br"
    write_vtrj(
        target_path=target,
        body_id=-32000,
        et_start=0.0,
        et_end=49.0,
        cadence_seconds=1.0,
        samples=samples,
        kind="attitude",
        ets=ets,
    )
    raw = brotli.decompress(target.read_bytes())
    assert len(raw) == HEADER_SIZE + 50 * 40


def test_attitude_body_ids_all_supported(tmp_path: Path) -> None:
    """AC1-T1: all four CK structure IDs (-31000, -31100, -32000, -32100) write+read cleanly."""
    samples = _make_quats(8, seed=42)
    ets = _make_ets(8, 0.0, 7.0)
    for body_id in (-31000, -31100, -32000, -32100):
        target = tmp_path / f"attitude-{abs(body_id)}.bin.br"
        write_vtrj(
            target_path=target,
            body_id=body_id,
            et_start=0.0,
            et_end=7.0,
            cadence_seconds=1.0,
            samples=samples,
            kind="attitude",
            ets=ets,
        )
        header, parsed = read_vtrj(target)
        assert header["body_id"] == body_id
        assert header["kind"] == "attitude"
        assert parsed.shape == (8, 5)


def test_attitude_kind_rejects_trajectory_shape(tmp_path: Path) -> None:
    """AC1-T1 guard: kind='attitude' + (N, 6) samples → ValueError on shape."""
    target = tmp_path / "bad.bin.br"
    bad_samples = _make_samples(5)  # (N, 6) — trajectory shape
    with pytest.raises(ValueError, match="shape"):
        write_vtrj(
            target_path=target,
            body_id=-31000,
            et_start=0.0,
            et_end=1.0,
            cadence_seconds=0.2,
            samples=bad_samples,
            kind="attitude",
        )


def test_trajectory_kind_rejects_attitude_shape(tmp_path: Path) -> None:
    """AC1-T1 guard: kind='trajectory' + (N, 4) samples → ValueError on shape."""
    target = tmp_path / "bad.bin.br"
    bad_samples = _make_quats(5)  # (N, 4) — attitude shape
    with pytest.raises(ValueError, match="shape"):
        write_vtrj(
            target_path=target,
            body_id=-31,
            et_start=0.0,
            et_end=1.0,
            cadence_seconds=0.2,
            samples=bad_samples,
            kind="trajectory",
        )


def test_attitude_body_id_with_trajectory_kind_rejected(tmp_path: Path) -> None:
    """AC1-T1 guard: attitude body_id (-31000) + kind='trajectory' → ValueError on kind mismatch."""
    target = tmp_path / "bad.bin.br"
    samples = _make_samples(5)
    with pytest.raises(ValueError, match="kind"):
        write_vtrj(
            target_path=target,
            body_id=-31000,
            et_start=0.0,
            et_end=1.0,
            cadence_seconds=0.2,
            samples=samples,
            kind="trajectory",
        )


def test_trajectory_body_id_with_attitude_kind_rejected(tmp_path: Path) -> None:
    """AC1-T1 guard: trajectory body_id (-31) + kind='attitude' → ValueError on kind mismatch."""
    target = tmp_path / "bad.bin.br"
    samples = _make_quats(5)
    with pytest.raises(ValueError, match="kind"):
        write_vtrj(
            target_path=target,
            body_id=-31,
            et_start=0.0,
            et_end=1.0,
            cadence_seconds=0.2,
            samples=samples,
            kind="attitude",
        )


def test_attitude_invalid_kind_rejected(tmp_path: Path) -> None:
    """AC1-T1 guard: kind='something-else' raises ValueError."""
    target = tmp_path / "bad.bin.br"
    samples = _make_quats(3)
    with pytest.raises(ValueError, match="kind"):
        write_vtrj(
            target_path=target,
            body_id=-31000,
            et_start=0.0,
            et_end=1.0,
            cadence_seconds=0.5,
            samples=samples,
            kind="not-a-kind",  # type: ignore[arg-type]
        )


def test_attitude_determinism_byte_identical_for_same_input(tmp_path: Path) -> None:
    """AC4 (NFR-R4): two attitude writes of the same quats produce identical SHA-256."""
    samples = _make_quats(200, seed=99)
    ets = _make_ets(200, 0.0, 199.0)
    a = tmp_path / "a.bin.br"
    b = tmp_path / "b.bin.br"
    sha_a = write_vtrj(
        target_path=a, body_id=-31000, et_start=0.0, et_end=199.0,
        cadence_seconds=1.0, samples=samples, kind="attitude", ets=ets,
    )
    sha_b = write_vtrj(
        target_path=b, body_id=-31000, et_start=0.0, et_end=199.0,
        cadence_seconds=1.0, samples=samples, kind="attitude", ets=ets,
    )
    assert sha_a == sha_b
    assert hashlib.sha256(a.read_bytes()).hexdigest() == hashlib.sha256(b.read_bytes()).hexdigest()


def test_default_kind_is_trajectory_back_compat(tmp_path: Path) -> None:
    """AC1-T1 back-compat: existing call sites that omit `kind=` still write trajectory."""
    samples = _make_samples(10)
    target = tmp_path / "voyager-1-default.bin.br"
    write_vtrj(
        target_path=target,
        body_id=-31,
        et_start=0.0,
        et_end=9.0,
        cadence_seconds=1.0,
        samples=samples,
        # no kind= specified — must default to "trajectory" so Story 1.4 callers work
    )
    header, parsed = read_vtrj(target)
    assert header["kind"] == "trajectory"
    assert parsed.shape == (10, 6)


# === Story 3.1 AC1-T1 (QA gap-fill): convention + schema documentation =====


def test_vtrj_writer_documents_spice_scalar_first_quaternion_convention() -> None:
    """Story 3.1 schema extension: the on-disk attitude quaternion convention
    must be documented as SPICE scalar-first [w, x, y, z] in vtrj_writer.py.

    Story 3.2 (AttitudeService) will convert to Three.js scalar-LAST
    [x, y, z, w] at decode time. If a future refactor accidentally changes the
    documented convention (or drops the convention statement), the runtime
    decoder's column-permute would no longer match the bake-time storage and
    rotations would be silently wrong (an off-by-one quaternion column shifts
    every render frame's pointing). This source-level tripwire locks the
    contract at code-review time before any runtime divergence ships.
    """
    src = (BAKE_SRC / "vtrj_writer.py").read_text(encoding="utf-8")
    # The convention statement MUST be present in the module docstring.
    assert "SPICE" in src and "scalar-first" in src, (
        "vtrj_writer.py module docstring must document the SPICE scalar-first "
        "convention for attitude quaternions — Story 3.2's decoder relies on this."
    )
    # The literal component ordering [w, x, y, z] (with surrounding context) must
    # also appear so a future reviewer can immediately verify the contract.
    assert "[w, x, y, z]" in src, (
        "vtrj_writer.py must document the literal [w, x, y, z] component ordering "
        "for attitude quaternions (SPICE scalar-first convention)."
    )


def test_ck_sample_documents_spice_scalar_first_quaternion_convention() -> None:
    """Story 3.1 AC1: ck_sample.py (the producer of attitude VTRJs) must also
    document the SPICE scalar-first quaternion convention.

    Two-place documentation discipline — vtrj_writer.py is the schema, but
    ck_sample.py is the call-site that puts the bytes into the format. A
    convention drift in either surface breaks Story 3.2's decode. Per the dev's
    Completion Notes: "documented in two places". This test locks both.
    """
    src = (BAKE_SRC / "ck_sample.py").read_text(encoding="utf-8")
    assert "scalar-first" in src and "[w, x, y, z]" in src, (
        "ck_sample.py must document the SPICE scalar-first [w, x, y, z] "
        "quaternion convention — required for Story 3.2 decoder contract."
    )


def test_story_1_4_byte_fixture_trajectory_decodes_under_extended_schema(tmp_path: Path) -> None:
    """Story 3.1 AC1-T1 backwards-compat: a hand-packed Story-1.4-era trajectory
    VTRJ header (no attitude awareness) must still decode cleanly via the
    Story-3.1-extended read_vtrj.

    The schema extension preserved the 40-byte header layout and discriminates
    kind via the body_id namespace (trajectory IDs {-31, -32, 10, 1..8, 301}
    vs attitude IDs {-31000, -31100, -32000, -32100}). This test verifies the
    discrimination works on a Story-1.4-shape file (a trajectory with body_id
    in the original allowed set) — the kind field on the header_info dict
    should report "trajectory" and the samples should round-trip as (N, 6).

    The fixture is hand-packed via struct (NOT through write_vtrj) so it
    represents the EXACT bytes Story 1.4 would have produced — no Story-3.1
    code paths involved in the construction.
    """
    import brotli

    # Hand-pack a Story-1.4-era VTRJ: trajectory (N=3, body_id=-32 V2).
    # This is the same struct layout that Story 1.4 used before any AC1-T1
    # changes; it must decode through the Story-3.1-extended reader.
    n_samples = 3
    body_id = -32  # V2 trajectory SPK ID (pre-existing allowed)
    et_start = -704_412_035.617
    et_end = -704_170_303.407
    cadence_seconds = 60.0
    # 6-component-per-sample trajectory body: [x, y, z, vx, vy, vz]
    sample_data = [
        1.0e8, 2.0e8, 3.0e8, 10.0, 20.0, 30.0,
        1.1e8, 2.1e8, 3.1e8, 11.0, 21.0, 31.0,
        1.2e8, 2.2e8, 3.2e8, 12.0, 22.0, 32.0,
    ]
    header_bytes = struct.pack(
        "<4sHiddId2s",
        b"VTRJ", 1, body_id, et_start, et_end, n_samples, cadence_seconds, b"\x00\x00",
    )
    body_bytes = struct.pack(f"<{n_samples * 6}d", *sample_data)
    raw = header_bytes + body_bytes
    compressed = brotli.compress(raw, quality=11)
    target = tmp_path / "story-1-4-fixture.bin.br"
    target.write_bytes(compressed)

    # Decode via the Story-3.1-extended read_vtrj
    header, parsed = read_vtrj(target)
    assert header["magic"] == b"VTRJ"
    assert header["version"] == 1
    assert header["body_id"] == body_id
    assert header["et_start"] == et_start
    assert header["et_end"] == et_end
    assert header["sample_count"] == n_samples
    assert header["cadence_seconds"] == cadence_seconds
    # The Story-3.1-extended reader must report kind="trajectory" for a
    # trajectory-namespace body_id.
    assert header["kind"] == "trajectory", (
        f"Story-1.4 byte fixture must decode as kind='trajectory'; got {header['kind']!r}. "
        f"The body_id-based namespace discrimination is broken — Story 3.1's "
        f"schema extension regressed backward compatibility."
    )
    # Shape must remain (N, 6) for trajectory
    assert parsed.shape == (n_samples, 6)
    np.testing.assert_array_equal(
        parsed,
        np.array(sample_data, dtype=np.float64).reshape(n_samples, 6),
    )
