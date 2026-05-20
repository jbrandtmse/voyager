"""VTRJ binary trajectory writer.

The on-disk format is a 40-byte little-endian header followed by a Float64Array
body of `sample_count * 6` doubles (x, y, z, vx, vy, vz per sample) in J2000
ecliptic frame, units kilometres and km/s. The whole file is brotli-compressed
(quality 11, deterministic for identical input).

Format (locked by Story 1.4 AC2 / ADR 0004):

    offset  size  field             type        notes
    ------  ----  ----------------  ----------  -------------------------------------
     0       4    magic             bytes       ASCII "VTRJ"
     4       2    version           u16 LE      = 1
     6       4    body_id           i32 LE      NAIF ID (-31 = V1, -32 = V2)
    10       8    et_start          f64 LE      ephemeris-time start of window
    18       8    et_end            f64 LE      ephemeris-time end of window
    26       4    sample_count      u32 LE      number of samples (state vectors)
    30       8    cadence_seconds   f64 LE      uniform sample cadence
    38       2    reserved          bytes       must be 0x0000

Per-sample body layout: [x, y, z, vx, vy, vz] as 6 consecutive f64 LE values
(no padding); per-sample bytes = 48.
"""

from __future__ import annotations

import hashlib
import struct
from pathlib import Path

import brotli
import numpy as np

MAGIC = b"VTRJ"
VERSION = 1
HEADER_SIZE = 40
BYTES_PER_SAMPLE = 48
# Story 1.13: extended from {-31, -32} to also accept the Sun, the eight
# planet barycenters (NAIF 1..8), and the Moon (NAIF 301). The barycenters
# are used for the planets (lower error from binary moon systems and
# sufficient for visual rendering — see Story 1.13 AC1).
ALLOWED_BODY_IDS = frozenset({-31, -32, 10, 1, 2, 3, 4, 5, 6, 7, 8, 301})
BROTLI_QUALITY = 11  # max, deterministic for identical input

# struct format for the 40-byte header. Little-endian, no padding.
#   4s  : magic               (4 bytes)
#   H   : version u16         (2 bytes)
#   i   : body_id i32         (4 bytes)
#   d   : et_start f64        (8 bytes)
#   d   : et_end f64          (8 bytes)
#   I   : sample_count u32    (4 bytes)
#   d   : cadence_seconds f64 (8 bytes)
#   2s  : reserved            (2 bytes — explicit b"\x00\x00")
# Total: 4 + 2 + 4 + 8 + 8 + 4 + 8 + 2 = 40 bytes
_HEADER_STRUCT = struct.Struct("<4sHiddId2s")
assert _HEADER_STRUCT.size == HEADER_SIZE, (
    f"VTRJ header struct size {_HEADER_STRUCT.size} != {HEADER_SIZE}"
)


def _serialize_header(
    body_id: int,
    et_start: float,
    et_end: float,
    sample_count: int,
    cadence_seconds: float,
) -> bytes:
    return _HEADER_STRUCT.pack(
        MAGIC,
        VERSION,
        int(body_id),
        float(et_start),
        float(et_end),
        int(sample_count),
        float(cadence_seconds),
        b"\x00\x00",
    )


def _validate_inputs(
    body_id: int,
    et_start: float,
    et_end: float,
    cadence_seconds: float,
    samples: np.ndarray,
) -> None:
    if body_id not in ALLOWED_BODY_IDS:
        raise ValueError(
            f"body_id must be one of {sorted(ALLOWED_BODY_IDS)} "
            f"(V1=-31, V2=-32, Sun=10, planet-barycenters 1..8, Moon=301); got {body_id}"
        )
    if not (et_start < et_end):
        raise ValueError(f"et_start ({et_start}) must be strictly less than et_end ({et_end})")
    if cadence_seconds <= 0:
        raise ValueError(f"cadence_seconds must be positive; got {cadence_seconds}")
    if samples.dtype != np.float64:
        raise ValueError(
            f"samples.dtype must be np.float64 (NFR float64 end-to-end); got {samples.dtype}"
        )
    if samples.ndim != 2 or samples.shape[1] != 6:
        raise ValueError(
            f"samples must be shape (N, 6) — [x, y, z, vx, vy, vz] per row; got {samples.shape}"
        )
    if samples.shape[0] == 0:
        raise ValueError("samples must contain at least one row")


def write_vtrj(
    target_path: Path,
    body_id: int,
    et_start: float,
    et_end: float,
    cadence_seconds: float,
    samples: np.ndarray,
) -> str:
    """Serialize a VTRJ trajectory file at `target_path` (atomically) and return its SHA-256.

    Writes header + raw little-endian Float64 body, brotli-compresses the whole
    thing at quality 11, atomic-renames through a `.part` sidecar. Mirror of the
    safe-write pattern in `acquire_kernels.py`: the `.part` file is the only
    thing on disk during the write window; a crash before the rename leaves the
    canonical path untouched.
    """
    _validate_inputs(body_id, et_start, et_end, cadence_seconds, samples)

    sample_count = samples.shape[0]
    header = _serialize_header(body_id, et_start, et_end, sample_count, cadence_seconds)

    # Lock byte order to little-endian regardless of host architecture.
    # `astype('<f8', copy=False)` is a no-op on Intel/AMD (already little-endian),
    # but it guarantees portability if this ever runs on a big-endian host.
    body = np.ascontiguousarray(samples, dtype="<f8").tobytes()

    uncompressed = header + body
    compressed = brotli.compress(
        uncompressed,
        quality=BROTLI_QUALITY,
        mode=brotli.MODE_GENERIC,
    )

    target_path.parent.mkdir(parents=True, exist_ok=True)
    part_path = target_path.with_suffix(target_path.suffix + ".part")
    try:
        part_path.write_bytes(compressed)
        # Verify the .part wrote successfully before promoting.
        if part_path.stat().st_size != len(compressed):
            raise RuntimeError(
                f"VTRJ write incomplete: wrote {part_path.stat().st_size} bytes, expected {len(compressed)}"
            )
        sha = hashlib.sha256(compressed).hexdigest()
        part_path.replace(target_path)
    except Exception:
        # Clean up partial file on any failure (no corrupted .bin.br left behind)
        if part_path.exists():
            try:
                part_path.unlink()
            except OSError:
                pass
        raise
    return sha


def read_vtrj(source_path: Path) -> tuple[dict, np.ndarray]:
    """Read a VTRJ file (decompress, parse header, return body as Nx6 float64 array).

    Public consumer-side helper — primarily for the L1 validator. The future
    runtime (Story 1.6+) reimplements this in TypeScript; this Python version
    is intentionally separate (no shared serialization library) so that the
    same bytes deserialize correctly on both sides.
    """
    compressed = source_path.read_bytes()
    raw = brotli.decompress(compressed)
    if len(raw) < HEADER_SIZE:
        raise ValueError(
            f"VTRJ file too short: {len(raw)} bytes (< {HEADER_SIZE}-byte header)"
        )
    magic, version, body_id, et_start, et_end, sample_count, cadence_seconds, reserved = (
        _HEADER_STRUCT.unpack(raw[:HEADER_SIZE])
    )
    if magic != MAGIC:
        raise ValueError(f"VTRJ magic mismatch: expected {MAGIC!r}, got {magic!r}")
    if version != VERSION:
        raise ValueError(f"VTRJ version mismatch: expected {VERSION}, got {version}")
    if body_id not in ALLOWED_BODY_IDS:
        raise ValueError(
            f"VTRJ body_id must be one of {sorted(ALLOWED_BODY_IDS)} "
            f"(V1=-31, V2=-32, Sun=10, planet-barycenters 1..8, Moon=301); got {body_id}"
        )
    if reserved != b"\x00\x00":
        raise ValueError(f"VTRJ reserved bytes must be 0x0000; got {reserved!r}")
    expected_body_bytes = sample_count * BYTES_PER_SAMPLE
    body_bytes = raw[HEADER_SIZE : HEADER_SIZE + expected_body_bytes]
    if len(body_bytes) != expected_body_bytes:
        raise ValueError(
            f"VTRJ body truncated: have {len(body_bytes)} bytes, expected {expected_body_bytes}"
        )
    samples = np.frombuffer(body_bytes, dtype="<f8").reshape(sample_count, 6).astype(np.float64)
    header_info = {
        "magic": magic,
        "version": int(version),
        "body_id": int(body_id),
        "et_start": float(et_start),
        "et_end": float(et_end),
        "sample_count": int(sample_count),
        "cadence_seconds": float(cadence_seconds),
    }
    return header_info, samples
