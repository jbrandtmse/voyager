"""VTRJ binary trajectory writer.

The on-disk format is a 40-byte little-endian header followed by a Float64Array
body. The whole file is brotli-compressed (quality 11, deterministic for
identical input).

Format (locked by Story 1.4 AC2 / ADR 0004):

    offset  size  field             type        notes
    ------  ----  ----------------  ----------  -------------------------------------
     0       4    magic             bytes       ASCII "VTRJ"
     4       2    version           u16 LE      = 1
     6       4    body_id           i32 LE      NAIF SPK ID (trajectory) OR CK structure ID (attitude)
    10       8    et_start          f64 LE      ephemeris-time start of window
    18       8    et_end            f64 LE      ephemeris-time end of window
    26       4    sample_count      u32 LE      number of samples (state vectors or quaternions)
    30       8    cadence_seconds   f64 LE      uniform sample cadence
    38       2    reserved          bytes       must be 0x0000

Per-sample body layout (trajectory kind):
    [x, y, z, vx, vy, vz] as 6 consecutive f64 LE values; per-sample bytes = 48.
    Time is **implicit**: sample ``i`` lies at ET ``et_start + i × cadence_seconds``.
    The ``cadence_seconds`` header field is the exact uniform step.

Story 3.1 schema extension (ADR-0004 § Body Layout per Kind, amended 2026-05-21):
the same 40-byte header serializes a quaternion attitude stream when
``kind == "attitude"``. The discrimination is body_id-based:

    body_id ∈ TRAJECTORY_BODY_IDS = {-31, -32, 10, 1..8, 301}  →  kind = "trajectory"
    body_id ∈ ATTITUDE_BODY_IDS   = {-31000, -31100, -32000, -32100}  →  kind = "attitude"

Per-sample body layout (attitude kind):
    [et, qw, qx, qy, qz] as 5 consecutive f64 LE values; per-sample bytes = 40.
    Time is **explicit** (first column) — the mission's variable-cadence schedule
    (10-sec near closest approach, 1-min through encounter, daily during cruise)
    is faithfully preserved as the actual bake-time ETs, so SLERP knot positions
    are mathematically exact. The runtime decoder reads column 0 as the knot ET
    and columns 1-4 as the SPICE scalar-first quaternion ``[w, x, y, z]``
    (``q = cos(θ/2) + sin(θ/2)·(x·i + y·j + z·k)``). Story 3.2 AttitudeService
    converts to Three.js / WebGL scalar-last ``[x, y, z, w]`` at decode time.

For attitude, the header ``cadence_seconds`` field is **informational only**
(the finest cadence band that contributed to the file — useful for diagnostic
emission but never used for knot reconstruction). For trajectory, it remains the
exact uniform step.

The CK structure IDs (-31000 V1 bus, -31100 V1 scan platform, -32000 V2 bus,
-32100 V2 scan platform) are the 5-digit SPICE CK frame structure IDs; the
2-digit NAIF SPK IDs (-31, -32) remain reserved for trajectory state vectors.
The two ID spaces are disjoint by construction, so the body_id field is a safe
discriminator.
"""

from __future__ import annotations

import hashlib
import struct
from pathlib import Path
from typing import Literal

import brotli
import numpy as np

MAGIC = b"VTRJ"
VERSION = 1
HEADER_SIZE = 40

# Story 1.13: trajectory body IDs are NAIF SPK IDs — Voyagers, Sun, eight
# planet barycenters (NAIF 1..8), Moon (NAIF 301).
TRAJECTORY_BODY_IDS = frozenset({-31, -32, 10, 1, 2, 3, 4, 5, 6, 7, 8, 301})

# Story 3.1: attitude body IDs are the 5-digit SPICE CK frame structure IDs.
# (V1 bus / V1 scan platform / V2 bus / V2 scan platform — the NA-camera IDs
# -31101, -32101 are NOT baked in this story; ckbrief-inventory.md confirms no
# usable NA-camera coverage in vgr*_super_v2.bc.)
ATTITUDE_BODY_IDS = frozenset({-31000, -31100, -32000, -32100})

ALLOWED_BODY_IDS = TRAJECTORY_BODY_IDS | ATTITUDE_BODY_IDS

# Per-sample byte width depends on kind: 6 doubles for trajectory (implicit time),
# 5 doubles for attitude (explicit time as column 0 + scalar-first quaternion).
BYTES_PER_SAMPLE_BY_KIND: dict[str, int] = {
    "trajectory": 48,  # 6 * 8 bytes — [x, y, z, vx, vy, vz]
    "attitude": 40,  # 5 * 8 bytes — [et, qw, qx, qy, qz]
}
COMPONENTS_PER_SAMPLE_BY_KIND: dict[str, int] = {
    "trajectory": 6,
    "attitude": 5,
}
# Quaternion-only column count for the attitude caller-facing API (the writer
# accepts a separate ``ets`` array + an (N,4) quaternion array and interleaves
# them into the on-disk (N,5) body).
QUATERNION_COMPONENTS = 4
# Story 1.4 baseline compatibility: a single ``BYTES_PER_SAMPLE`` constant
# remains exported at the trajectory value so existing call sites and tests
# that read the module-level name continue to work unchanged.
BYTES_PER_SAMPLE = BYTES_PER_SAMPLE_BY_KIND["trajectory"]

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


def _kind_for_body_id(body_id: int) -> Literal["trajectory", "attitude"]:
    """Infer the on-disk kind from a body_id (the two ID sets are disjoint)."""
    if body_id in TRAJECTORY_BODY_IDS:
        return "trajectory"
    if body_id in ATTITUDE_BODY_IDS:
        return "attitude"
    raise ValueError(
        f"body_id {body_id} not in TRAJECTORY_BODY_IDS or ATTITUDE_BODY_IDS"
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
    kind: Literal["trajectory", "attitude"],
    ets: np.ndarray | None,
) -> None:
    if body_id not in ALLOWED_BODY_IDS:
        raise ValueError(
            f"body_id must be one of {sorted(ALLOWED_BODY_IDS)} "
            f"(trajectory: V1=-31, V2=-32, Sun=10, planet-barycenters 1..8, Moon=301; "
            f"attitude: V1-bus=-31000, V1-scan=-31100, V2-bus=-32000, V2-scan=-32100); "
            f"got {body_id}"
        )
    if kind not in BYTES_PER_SAMPLE_BY_KIND:
        raise ValueError(
            f"kind must be 'trajectory' or 'attitude'; got {kind!r}"
        )
    inferred = _kind_for_body_id(body_id)
    if kind != inferred:
        raise ValueError(
            f"kind mismatch: body_id {body_id} is a {inferred} ID but kind={kind!r}"
        )
    if not (et_start < et_end):
        raise ValueError(f"et_start ({et_start}) must be strictly less than et_end ({et_end})")
    if cadence_seconds <= 0:
        raise ValueError(f"cadence_seconds must be positive; got {cadence_seconds}")
    if samples.dtype != np.float64:
        raise ValueError(
            f"samples.dtype must be np.float64 (NFR float64 end-to-end); got {samples.dtype}"
        )
    if samples.shape[0] == 0:
        raise ValueError("samples must contain at least one row")

    if kind == "trajectory":
        if samples.ndim != 2 or samples.shape[1] != 6:
            raise ValueError(
                f"trajectory samples must be shape (N, 6) — [x, y, z, vx, vy, vz] per row; "
                f"got {samples.shape}"
            )
        if ets is not None:
            raise ValueError(
                "trajectory writes use implicit ETs (et_start + i * cadence_seconds); "
                "do not pass an `ets` array for kind='trajectory'"
            )
        return

    # kind == "attitude": the caller supplies a (N,4) quaternion array AND a
    # (N,) ets array. The writer interleaves them into the on-disk (N,5) body.
    if samples.ndim != 2 or samples.shape[1] != QUATERNION_COMPONENTS:
        raise ValueError(
            f"attitude samples must be shape (N, {QUATERNION_COMPONENTS}) — "
            f"[w, x, y, z] (SPICE scalar-first quaternion) per row; got {samples.shape}"
        )
    if ets is None:
        raise ValueError(
            "attitude writes require an explicit per-sample `ets` array (the mission's "
            "variable-cadence schedule is preserved inline); pass an (N,) numpy array"
        )
    if ets.dtype != np.float64:
        raise ValueError(
            f"ets.dtype must be np.float64; got {ets.dtype}"
        )
    if ets.ndim != 1 or ets.shape[0] != samples.shape[0]:
        raise ValueError(
            f"ets must be shape ({samples.shape[0]},) to match samples; got {ets.shape}"
        )
    # ETs must lie within [et_start, et_end] and be in monotonic non-decreasing
    # order (SLERP requires sorted knots; duplicate ETs are pathological but the
    # validator catches them at SciPy Slerp construction time, so we don't reject
    # equal-ET pairs here).
    if ets[0] < et_start or ets[-1] > et_end:
        raise ValueError(
            f"ets out of range: first={ets[0]} last={ets[-1]} window=[{et_start}, {et_end}]"
        )
    if not np.all(np.diff(ets) >= 0.0):
        raise ValueError("attitude ets must be monotonically non-decreasing")


def write_vtrj(
    target_path: Path,
    body_id: int,
    et_start: float,
    et_end: float,
    cadence_seconds: float,
    samples: np.ndarray,
    kind: Literal["trajectory", "attitude"] = "trajectory",
    ets: np.ndarray | None = None,
) -> str:
    """Serialize a VTRJ file at `target_path` (atomically) and return its SHA-256.

    For trajectory streams (default), ``samples`` is ``(N, 6)`` Float64
    ``[x, y, z, vx, vy, vz]`` in J2000 ecliptic frame, km/s. Time is implicit;
    do not pass ``ets``.

    For attitude streams (Story 3.1; ``kind="attitude"``), ``samples`` is
    ``(N, 4)`` Float64 ``[w, x, y, z]`` SPICE scalar-first quaternions, AND
    ``ets`` is an ``(N,)`` Float64 array of the bake-time ETs for each sample.
    The writer interleaves them into an on-disk ``(N, 5)`` body of
    ``[et, qw, qx, qy, qz]`` per sample so the runtime decoder reconstructs
    SLERP knot positions exactly (no linspace approximation).

    Writes header + raw little-endian Float64 body, brotli-compresses the whole
    thing at quality 11, atomic-renames through a `.part` sidecar.
    """
    _validate_inputs(body_id, et_start, et_end, cadence_seconds, samples, kind, ets)

    sample_count = samples.shape[0]
    header = _serialize_header(body_id, et_start, et_end, sample_count, cadence_seconds)

    if kind == "trajectory":
        body_array = samples
    else:
        # Interleave ETs (col 0) + quaternion components (cols 1-4) into (N, 5).
        assert ets is not None  # _validate_inputs ensures this
        body_array = np.empty((sample_count, 5), dtype=np.float64)
        body_array[:, 0] = ets
        body_array[:, 1:5] = samples

    # Lock byte order to little-endian regardless of host architecture.
    body = np.ascontiguousarray(body_array, dtype="<f8").tobytes()

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
    """Read a VTRJ file (decompress, parse header, return body as numpy array).

    Returns ``(header_info, samples)``. ``header_info["kind"]`` is "trajectory"
    or "attitude" — inferred from the body_id. ``samples.shape`` is ``(N, 6)``
    for trajectory or ``(N, 4)`` for attitude.

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
            f"(trajectory: V1=-31, V2=-32, Sun=10, planet-barycenters 1..8, Moon=301; "
            f"attitude: V1-bus=-31000, V1-scan=-31100, V2-bus=-32000, V2-scan=-32100); "
            f"got {body_id}"
        )
    if reserved != b"\x00\x00":
        raise ValueError(f"VTRJ reserved bytes must be 0x0000; got {reserved!r}")
    kind = _kind_for_body_id(int(body_id))
    components = COMPONENTS_PER_SAMPLE_BY_KIND[kind]
    bytes_per_sample = BYTES_PER_SAMPLE_BY_KIND[kind]
    expected_body_bytes = sample_count * bytes_per_sample
    body_bytes = raw[HEADER_SIZE : HEADER_SIZE + expected_body_bytes]
    if len(body_bytes) != expected_body_bytes:
        raise ValueError(
            f"VTRJ body truncated: have {len(body_bytes)} bytes, expected {expected_body_bytes}"
        )
    samples = (
        np.frombuffer(body_bytes, dtype="<f8")
        .reshape(sample_count, components)
        .astype(np.float64)
    )
    header_info = {
        "magic": magic,
        "version": int(version),
        "body_id": int(body_id),
        "et_start": float(et_start),
        "et_end": float(et_end),
        "sample_count": int(sample_count),
        "cadence_seconds": float(cadence_seconds),
        "kind": kind,
    }
    return header_info, samples
