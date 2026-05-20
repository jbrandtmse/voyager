"""Trajectory bake orchestrator (per-SPK-segment chunking).

Reads the Story 1.3 kernel manifest, furnishes the kernels in dependency order
(LSK -> PCK -> FK -> SCLK -> SPK), enumerates each Voyager spacecraft's SPK
segments via DAF iteration, and emits one VTRJ per segment per body. Per-body
all-segments-merged trajectories cannot be a single Cubic Hermite spline
because the Voyager merged SPKs contain segment-boundary position
discontinuities (see story Dev Agent Record). Per-segment chunking is the
architecturally clean answer (Decision 1b's manifest already supports an array
of files per body).

Canonical invocation (Story 1.4 AC1):
    just bake
    # fallback if just is not installed (from `bake/`):
    uv run python -m src.bake_trajectories
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Allow direct script invocation (`python bake/src/bake_trajectories.py`) and
# `python -m src.bake_trajectories` (from `bake/`).
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _kernel_io import KernelEntry, load_manifest, repo_root  # type: ignore[import-not-found]
    from manifest_writer import BodyEntry, FileEntry, KernelRef, emit_manifest  # noqa: E402
    from vtrj_writer import write_vtrj  # noqa: E402
else:
    from ._kernel_io import KernelEntry, load_manifest, repo_root
    from .manifest_writer import BodyEntry, FileEntry, KernelRef, emit_manifest
    from .vtrj_writer import write_vtrj

# Cadence policy per segment: choose `cadence = clamp(span / target, MIN, MAX)`.
# Long cruise segments end up at MAX_CADENCE_SECONDS (= daily) which matches
# the architecture's nominal cadence. Short encounter segments (a few days)
# end up nearer MIN_CADENCE_SECONDS, which is what's needed to keep
# cubic-Hermite interpolation error inside NFR-P9 (max <= 20 km / RMS <= 5 km)
# through rapidly-curving flyby geometry.
TARGET_SAMPLES_PER_SEGMENT = 8192
MIN_CADENCE_SECONDS = 60.0  # 1 minute (lower bound on encounter cadence)
MAX_CADENCE_SECONDS = 86400.0  # daily (upper bound = nominal cruise cadence)

# NAIF SPK body IDs (not CK structure IDs)
BODIES: list[tuple[int, str, str]] = [
    # (naif_id, name, file slug used for bake/out/<slug>-segNN-...bin.br)
    (-31, "Voyager 1", "voyager-1"),
    (-32, "Voyager 2", "voyager-2"),
]

# Story 1.13 — Sun, eight planet barycenters, Moon. DE440 is continuous over
# the mission window, so each celestial body emits ONE VTRJ at daily cadence
# (single segment). The barycenters (1..8) are used for the planets rather
# than the planet-itself IDs (199, 299, 399, 499, 599, 699, 799, 899): on the
# binary moon systems (Earth-Moon, Pluto-Charon) the barycenter is closer to
# a clean two-body inertial path than the planet centre, and the visual
# distance from the planet centre to the planet-Moon barycenter is far below
# one rendered pixel at solar-system zoom. The Moon (NAIF 301) is queried
# separately, so its ~4,670-km wobble around Earth's centre is preserved.
# See Story 1.13 AC1 for the locked NAIF table.
CELESTIAL_BODIES: list[tuple[int, str, str]] = [
    # (naif_id, name, file slug used for bake/out/<slug>.bin.br)
    (10, "Sun", "sun"),
    (1, "Mercury barycenter", "mercury"),
    (2, "Venus barycenter", "venus"),
    (3, "Earth-Moon barycenter", "earth"),
    (4, "Mars barycenter", "mars"),
    (5, "Jupiter barycenter", "jupiter"),
    (6, "Saturn barycenter", "saturn"),
    (7, "Uranus barycenter", "uranus"),
    (8, "Neptune barycenter", "neptune"),
    (301, "Moon", "moon"),
]

# Per-body bake cadence for celestial bodies (Story 1.13 AC1). DE440 is
# continuous, so a single VTRJ per body is the architecturally clean answer;
# but Mercury's 88-day orbit and the Moon's 27-day orbit are fast enough
# that daily cadence breaches the NFR-P9 thresholds (max ≤ 20 km / RMS ≤ 5
# km) — verified by the L1 validation harness. Slower bodies (Sun, gas
# giants, ice giants) are comfortably inside the thresholds at daily
# cadence (Jupiter/Saturn/Uranus/Neptune all <0.001 km max).
#
# Keys are NAIF IDs. Bodies not in this map default to
# `CELESTIAL_DEFAULT_CADENCE_SECONDS`.
CELESTIAL_DEFAULT_CADENCE_SECONDS = 86400.0  # daily
CELESTIAL_CADENCE_OVERRIDES: dict[int, float] = {
    1: 14400.0,    # Mercury barycenter — 6 hourly (88-day orbit, fast inner planet)
    301: 21600.0,  # Moon — 6 hourly (27-day Earth orbit, ~1 km/s relative to Earth)
}

# Mission window for celestial bodies, in ET (TDB s past J2000). These mirror
# `web/src/constants/mission.ts` MISSION_START_ET and MISSION_END_ET — the
# same SPICE-derived values, restated as plain literals so this module stays
# stdlib-only at module-import time. A defense test in
# `bake/tests/test_bake_trajectories.py` re-derives them via str2et and
# asserts they match within 5 ms.
CELESTIAL_ET_START = -705844751.8171712  # 1977-08-20T00:00:00 UTC
CELESTIAL_ET_END = 978264068.1839114  # 2030-12-31T23:59:59 UTC

# Kernel furnish order: LSK first (time conversions), then PCK / FK / SCLK / SPK
_FURNISH_PRIORITY: dict[str, int] = {
    "lsk": 0,
    "pck": 1,
    "fk": 2,
    "sclk": 3,
    "spk": 4,
    "ck": 5,
}


@dataclass(frozen=True)
class SpkSegment:
    """One DAF segment in an SPK file, filtered to a single target body."""

    body: int
    et_start: float
    et_end: float
    center: int
    frame: int
    spk_file: str  # relative-to-repo path

    @property
    def span_seconds(self) -> float:
        return self.et_end - self.et_start


def _furnish_kernels(kernels: list[KernelEntry], root: Path, kinds: tuple[str, ...]) -> list[Path]:
    """Furnish the listed kinds in dependency order and return the loaded paths."""
    import spiceypy as spice

    filtered = [k for k in kernels if k.kind in kinds]
    ordered = sorted(filtered, key=lambda k: (_FURNISH_PRIORITY[k.kind], k.file))
    loaded: list[Path] = []
    for k in ordered:
        path = (root / k.target_path).resolve()
        if not path.exists():
            raise FileNotFoundError(
                f"kernel missing on disk: {path} -- run `just fetch-kernels` first"
            )
        spice.furnsh(str(path))
        loaded.append(path)
    return loaded


def _enumerate_segments(spk_path: Path, body: int, repo: Path) -> list[SpkSegment]:
    """Iterate the DAF segments inside `spk_path`, returning only those for `body`.

    The returned list is sorted by `et_start` ascending and de-duplicated on
    identical (et_start, et_end, center) tuples.
    """
    import spiceypy as spice

    # Open the DAF directly via dafopr (read-only) for segment iteration. This
    # does NOT add the SPK to the loaded kernel pool, so it does not interfere
    # with spkgeo calls. (spklef would load it; spkuef would unload, but the
    # caller relies on a separate furnsh having loaded the same SPK for spkgeo.)
    handle = spice.dafopr(str(spk_path))
    try:
        spice.dafbfs(handle)
        found = spice.daffna()
        segs: list[SpkSegment] = []
        rel = str(spk_path.resolve().relative_to(repo)).replace("\\", "/")
        while found:
            summary = spice.dafgs(125)
            dc, ic = spice.dafus(summary, 2, 6)
            seg_body = int(ic[0])
            if seg_body == body:
                segs.append(
                    SpkSegment(
                        body=seg_body,
                        et_start=float(dc[0]),
                        et_end=float(dc[1]),
                        center=int(ic[1]),
                        frame=int(ic[2]),
                        spk_file=rel,
                    )
                )
            found = spice.daffna()
    finally:
        spice.dafcls(handle)

    segs.sort(key=lambda s: (s.et_start, s.et_end))
    seen: set[tuple[float, float, int]] = set()
    unique: list[SpkSegment] = []
    for s in segs:
        key = (s.et_start, s.et_end, s.center)
        if key not in seen:
            seen.add(key)
            unique.append(s)
    return unique


def _segment_cadence(span_seconds: float) -> float:
    """Choose a uniform sample cadence for a segment of `span_seconds` length.

    Deterministic given `span_seconds`. Returns cadence in seconds.
    """
    if span_seconds <= 0:
        raise ValueError(f"segment span must be positive; got {span_seconds}")
    raw = span_seconds / TARGET_SAMPLES_PER_SEGMENT
    return max(MIN_CADENCE_SECONDS, min(MAX_CADENCE_SECONDS, raw))


def _sample_segment(
    naif_id: int, et_start: float, et_end: float, cadence_seconds: float
) -> tuple[np.ndarray, np.ndarray, float]:
    """Sample a segment at near-uniform cadence with exact endpoints.

    Returns (et_grid, samples, actual_cadence). Endpoint ETs are exactly
    et_start and et_end. `actual_cadence` = (et_end - et_start) / (N - 1).

    samples shape is (N, 6) Float64 [x, y, z, vx, vy, vz] in ECLIPJ2000,
    units km and km/s, observer = SSB (NAIF 0).
    """
    import spiceypy as spice

    span = et_end - et_start
    n_samples = max(2, int(np.floor(span / cadence_seconds)) + 1)
    et_grid = np.linspace(et_start, et_end, n_samples, dtype=np.float64)
    actual_cadence = (et_end - et_start) / (n_samples - 1)

    # Inset the boundary ETs slightly so spkgeo always returns the *interior*
    # of this segment, not the adjacent segment's value (which differs by up
    # to ~2,000,000 km at some merged-SPK stitch points). The inset is small
    # relative to cadence so Cubic Hermite reconstruction at the boundary is
    # still tight.
    boundary_inset = min(0.01, span * 1e-9)  # 10 ms or 1e-9 of the span, whichever is smaller
    et_query = et_grid.copy()
    et_query[0] = et_start + boundary_inset
    et_query[-1] = et_end - boundary_inset

    out = np.empty((n_samples, 6), dtype=np.float64)
    for i, et in enumerate(et_query):
        state, _light_time = spice.spkgeo(targ=naif_id, et=float(et), ref="ECLIPJ2000", obs=0)
        out[i] = state
    return et_grid, out, actual_cadence


def _sample_celestial_body(
    naif_id: int, et_start: float, et_end: float, cadence_seconds: float
) -> tuple[np.ndarray, np.ndarray, float]:
    """Sample a celestial body's heliocentric state at uniform daily cadence.

    Story 1.13 AC1: identical SPICE query shape to `_sample_segment`
    (observer=SSB, ECLIPJ2000, km/s), but DE440 is continuous over the
    mission window so no per-segment chunking is needed and no endpoint
    boundary inset is applied (there are no SPK stitch points to avoid).

    Returns (et_grid, samples, actual_cadence).
    """
    import spiceypy as spice

    span = et_end - et_start
    if span <= 0:
        raise ValueError(f"celestial body window must be positive; got {span}")
    n_samples = max(2, int(np.floor(span / cadence_seconds)) + 1)
    et_grid = np.linspace(et_start, et_end, n_samples, dtype=np.float64)
    actual_cadence = (et_end - et_start) / (n_samples - 1)

    out = np.empty((n_samples, 6), dtype=np.float64)
    for i, et in enumerate(et_grid):
        state, _light_time = spice.spkgeo(targ=naif_id, et=float(et), ref="ECLIPJ2000", obs=0)
        out[i] = state
    return et_grid, out, actual_cadence


def bake(
    root: Path | None = None,
    out_dir: Path | None = None,
) -> int:
    """Execute the bake. Returns process exit code (0 success, non-zero on failure)."""
    try:
        import spiceypy as spice
    except ImportError as exc:
        print(f"[FAIL] spiceypy not importable: {exc}", file=sys.stderr)
        return 1

    repo = (root or repo_root()).resolve()
    out = (out_dir or (repo / "bake" / "out")).resolve()
    manifest_in_path = repo / "kernels" / "kernels-manifest.json"
    if not manifest_in_path.exists():
        print(f"[FAIL] kernels manifest missing: {manifest_in_path}", file=sys.stderr)
        return 1

    _, kernel_entries = load_manifest(manifest_in_path)

    spice.kclear()
    try:
        _furnish_kernels(kernel_entries, repo, kinds=("lsk", "pck", "fk", "sclk", "spk"))

        body_records: list[BodyEntry] = []
        total_segments = 0
        for naif_id, name, slug in BODIES:
            spk_kernel = next(
                (
                    k
                    for k in kernel_entries
                    if k.kind == "spk" and f"Voyager_{name[-1]}" in k.target_path
                ),
                None,
            )
            if spk_kernel is None:
                print(f"[FAIL] no Voyager SPK kernel found for {name}", file=sys.stderr)
                return 1
            spk_path = (repo / spk_kernel.target_path).resolve()
            segments = _enumerate_segments(spk_path, naif_id, repo)
            print(f"[BAKE]   {name} (NAIF {naif_id}): {len(segments)} SPK segments")
            total_segments += len(segments)

            file_records: list[FileEntry] = []
            for seg_idx, seg in enumerate(segments, start=1):
                cadence = _segment_cadence(seg.span_seconds)
                _et_grid, samples, actual_cadence = _sample_segment(
                    naif_id, seg.et_start, seg.et_end, cadence
                )
                n = samples.shape[0]
                # Deterministic filename: <slug>-segNN-<int_et_start>-<int_et_end>.bin.br
                # Truncating to int(floor(...)) keeps the filename stable across
                # platforms and avoids float-format variance.
                start_tag = f"{int(np.floor(seg.et_start))}"
                end_tag = f"{int(np.floor(seg.et_end))}"
                file_name = f"{slug}-seg{seg_idx:02d}-{start_tag}-{end_tag}.bin.br"
                target = out / file_name
                sha = write_vtrj(
                    target_path=target,
                    body_id=naif_id,
                    et_start=seg.et_start,
                    et_end=seg.et_end,
                    cadence_seconds=actual_cadence,
                    samples=samples,
                )
                size_bytes = target.stat().st_size
                utc_a = spice.et2utc(seg.et_start, "ISOC", 0)
                utc_b = spice.et2utc(seg.et_end, "ISOC", 0)
                print(
                    f"[OK]     seg{seg_idx:02d}  {utc_a} -> {utc_b}  "
                    f"center={seg.center}  n={n}  cadence={actual_cadence:.1f}s  "
                    f"{size_bytes:,} bytes  sha={sha[:12]}..."
                )
                file_records.append(
                    FileEntry(
                        timeRangeEt=(seg.et_start, seg.et_end),
                        cadenceSec=actual_cadence,
                        kind="trajectory",
                        url=f"data/{file_name}",
                        sha256=sha,
                        sizeBytes=size_bytes,
                    )
                )

            body_records.append(BodyEntry(naifId=naif_id, name=name, files=file_records))

        # Story 1.13 — Sun + 8 planet barycenters + Moon, one VTRJ per body
        # over the full mission window. DE440 is continuous; no segment-
        # boundary detection is required (verified by the L1 harness finding
        # zero per-segment discontinuities for these bodies). Cadence is
        # per-body — see CELESTIAL_CADENCE_OVERRIDES.
        for naif_id, name, slug in CELESTIAL_BODIES:
            cadence = CELESTIAL_CADENCE_OVERRIDES.get(
                naif_id, CELESTIAL_DEFAULT_CADENCE_SECONDS
            )
            _et_grid, samples, actual_cadence = _sample_celestial_body(
                naif_id,
                CELESTIAL_ET_START,
                CELESTIAL_ET_END,
                cadence,
            )
            n = samples.shape[0]
            # Single-segment naming convention: `<slug>.bin.br`. No segNN
            # suffix because there is no per-segment chunking here.
            file_name = f"{slug}.bin.br"
            target = out / file_name
            sha = write_vtrj(
                target_path=target,
                body_id=naif_id,
                et_start=CELESTIAL_ET_START,
                et_end=CELESTIAL_ET_END,
                cadence_seconds=actual_cadence,
                samples=samples,
            )
            size_bytes = target.stat().st_size
            utc_a = spice.et2utc(CELESTIAL_ET_START, "ISOC", 0)
            utc_b = spice.et2utc(CELESTIAL_ET_END, "ISOC", 0)
            print(
                f"[OK]     {slug:10s} {utc_a} -> {utc_b}  "
                f"n={n}  cadence={actual_cadence:.1f}s  "
                f"{size_bytes:,} bytes  sha={sha[:12]}..."
            )
            body_records.append(
                BodyEntry(
                    naifId=naif_id,
                    name=name,
                    files=[
                        FileEntry(
                            timeRangeEt=(CELESTIAL_ET_START, CELESTIAL_ET_END),
                            cadenceSec=actual_cadence,
                            kind="trajectory",
                            url=f"data/{file_name}",
                            sha256=sha,
                            sizeBytes=size_bytes,
                        )
                    ],
                )
            )

        manifest_kernels = [
            KernelRef(
                file=k.file,
                sha256=k.expected_sha256,
                kind=k.kind,
                source_url=k.source_url,
            )
            for k in kernel_entries
        ]
        manifest_path = out / "manifest.json"
        emit_manifest(
            bodies=body_records,
            kernels=manifest_kernels,
            output_path=manifest_path,
            repo_root=repo,
        )
        total_vtrjs = total_segments + len(CELESTIAL_BODIES)
        total_bodies = len(BODIES) + len(CELESTIAL_BODIES)
        print(
            f"[OK]     {manifest_path}  ({total_vtrjs} VTRJs across "
            f"{total_bodies} bodies)"
        )
        return 0
    finally:
        spice.kclear()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bake Voyager trajectory VTRJ files (per-segment).")
    parser.add_argument("--root", type=Path, default=None, help="Repo root (default: auto)")
    parser.add_argument(
        "--out-dir", type=Path, default=None, help="Output directory (default: <repo>/bake/out)"
    )
    args = parser.parse_args(argv)
    return bake(root=args.root, out_dir=args.out_dir)


if __name__ == "__main__":
    sys.exit(main())
