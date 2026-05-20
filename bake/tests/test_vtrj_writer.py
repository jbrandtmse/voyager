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
