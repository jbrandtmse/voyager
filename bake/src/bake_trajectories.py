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
import json
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

# --- Story 4.3 — per-encounter cadence-refined chunks ----------------------
#
# Story 4.3 AC1 extends the per-SPK-segment trajectory bake with ADDITIONAL
# per-encounter cadence-refined chunks for each of the six historical gas-
# giant flybys. The baseline daily-cadence per-segment chunks are PRESERVED
# (they cover cruise); the new chunks layer hourly / 1-minute / 10-second
# cadence bands tightly around each closest-approach instant. EphemerisService
# picks the finest-cadence file that covers a queried ET via its existing
# binary-search-on-(start, end) lookup (no service-side changes needed for
# tier selection — the runtime simply prefers narrower-window chunks).
#
# Per-encounter cadence schedule (Rule 5 amendment lives here per Story 4.0's
# precedent — if NFR-P9 is breached at any encounter we amend THIS table in
# place, not in a code comment + deferred-work entry):
#
#   Hourly   across closest_approach ± 30 days  (one file per encounter)
#   1-minute across closest_approach ± 2 days   (one file per encounter)
#   10-second across closest_approach ± 1 hour  (one file per encounter)
#
# Chunks overlap by one sample at boundaries (the last sample of the wider
# chunk equals the first sample of the next narrower chunk's left edge — the
# overlap is the inclusive endpoint, see `_emit_cadence_band_chunks` below).
#
# Encounter table mirrors `web/src/data/mission-facts.ts ENCOUNTER_DATES`.
# UTC strings are converted to ET (TDB seconds past J2000) lazily at bake
# time via spice.str2et so this module remains stdlib-only at import time.
#
# Filename format: `<slug>-enc-<encounter-tag>-<cadence-tag>.bin.br`
#   slug         := "voyager-1" | "voyager-2"
#   encounter-tag:= "jupiter" | "saturn" | "uranus" | "neptune"
#   cadence-tag  := "hourly" | "1min" | "10sec"
#
# Per-spacecraft × per-body uniqueness: V1 visits Jupiter + Saturn; V2 visits
# all four. The bake skips encounters where the spacecraft doesn't appear.
@dataclass(frozen=True)
class EncounterAnchor:
    """A historical gas-giant flyby closest-approach anchor."""

    spacecraft: str  # "voyager-1" | "voyager-2"
    body: str        # "jupiter" | "saturn" | "uranus" | "neptune"
    utc: str         # ISO-8601 UTC, mirrors mission-facts.ts ENCOUNTER_DATES

ENCOUNTERS: list[EncounterAnchor] = [
    EncounterAnchor("voyager-1", "jupiter", "1979-03-05T12:05:00Z"),
    EncounterAnchor("voyager-2", "jupiter", "1979-07-09T22:29:00Z"),
    EncounterAnchor("voyager-1", "saturn", "1980-11-12T23:46:00Z"),
    EncounterAnchor("voyager-2", "saturn", "1981-08-26T00:00:00Z"),
    EncounterAnchor("voyager-2", "uranus", "1986-01-24T17:59:00Z"),
    EncounterAnchor("voyager-2", "neptune", "1989-08-25T03:56:00Z"),
]

# Cadence bands keyed by tag. (half_window_seconds, cadence_seconds).
# half_window_seconds is the ± window around closest approach.
#
# Docstring-history-extension discipline (Rule 5 / Story 4.0 V2 Saturn
# precedent): if any encounter's cadence proves insufficient against NFR-P9
# (max ≤ 20 km position error), AMEND THIS TABLE IN PLACE — do not bury the
# fix in a code comment. The mathematical floor for hourly cadence at gas-
# giant flyby distances is well below 20 km per L1 validation; the bands
# below are sized to give ~30× margin.
CADENCE_BANDS: list[tuple[str, float, float]] = [
    # (cadence_tag, half_window_seconds, cadence_seconds)
    ("hourly", 30 * 86400.0, 3600.0),  # ±30 days, hourly
    ("1min", 2 * 86400.0, 60.0),       # ±2 days, 1-minute
    ("10sec", 3600.0, 10.0),           # ±1 hour, 10-second
]

ENCOUNTER_BODY_TO_BARYCENTER_ID: dict[str, int] = {
    # Encounter "body" → planet-barycenter NAIF ID. The barycenter is what
    # the encounter cadence-band file's `body_id` field uses; the spacecraft
    # body (-31/-32) is what the file SAMPLES (the spacecraft's heliocentric
    # state vector, per existing _sample_segment contract). The body field
    # in the filename references the encounter target for human readability.
    "jupiter": 5,
    "saturn": 6,
    "uranus": 7,
    "neptune": 8,
}

ENCOUNTER_SPACECRAFT_TO_NAIF: dict[str, int] = {
    "voyager-1": -31,
    "voyager-2": -32,
}

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

# Story 4.3 T5 — outer-system moons. Loaded lazily by the runtime
# `CelestialBodies.addMoonsFor(parentNaifId)` path on SOI-entry events
# from `MissionPhaseFSM`. The bake emits ONE VTRJ per moon at daily
# cadence (same DE440-continuous shape as `CELESTIAL_BODIES`) IF the
# moon's satellite-system SPK kernel is furnished. The standard NAIF
# satellite ephemerides are:
#
#   - `jup365.bsp` / `jup310.bsp` etc. — Galilean moons (501..504)
#   - `sat427.bsp` / `sat441.bsp` — Saturn moons (606, 607, 608)
#   - `ura111.bsp` — Uranian moons (701..705)
#   - `nep097.bsp` — Triton (801)
#
# **Procurement note:** as of Story 4.3 these satellite SPKs are NOT in
# `kernels/` — the bake gracefully skips moons whose `spice.spkgeo` raises
# `SpiceyError` (target body not in furnished kernels). The texture mesh
# is constructed by the runtime regardless; absent moons render as
# "no position" (mesh hidden via the cache-miss `null` path). A follow-up
# story can ADD the satellite SPKs to `kernels/kernels-manifest.json` +
# the `kernels/` LFS-tracked directory, after which a re-bake populates
# the moon trajectories automatically.
#
# Hyperion (607) is INCLUDED here because its trajectory bake IS feasible
# (sat427 / sat441 provide its ephemeris). The texture is the missing
# piece — see `MISSION_FACTS.md § Moon physical properties` for the
# chaotic-rotation rationale that prevents an equirectangular map.
MOON_BODIES: list[tuple[int, str, str]] = [
    (501, "Io", "io"),
    (502, "Europa", "europa"),
    (503, "Ganymede", "ganymede"),
    (504, "Callisto", "callisto"),
    (606, "Titan", "titan"),
    (607, "Hyperion", "hyperion"),
    (608, "Iapetus", "iapetus"),
    (701, "Ariel", "ariel"),
    (702, "Umbriel", "umbriel"),
    (703, "Titania", "titania"),
    (704, "Oberon", "oberon"),
    (705, "Miranda", "miranda"),
    (801, "Triton", "triton"),
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


def _sample_encounter_band(
    naif_id: int, et_start: float, et_end: float, cadence_seconds: float
) -> tuple[np.ndarray, np.ndarray, float]:
    """Sample a spacecraft trajectory at fixed cadence across the band window.

    Story 4.3 AC1 — used for the per-encounter cadence-band chunks (hourly /
    1-min / 10-second). Same SPICE query shape as `_sample_segment` and
    `_sample_celestial_body`: observer=SSB, ECLIPJ2000, km/s. Returns
    (et_grid, samples, actual_cadence) where the grid begins at exactly
    et_start and the actual_cadence is `(et_end - et_start) / (N-1)`.

    The sample count is `floor(span / cadence) + 1` to honour the requested
    cadence exactly (modulo end-clamping). The same micro-boundary inset
    applied by `_sample_segment` is NOT applied here: encounter bands sit
    well inside the merged-SPK segments (no stitch points to dodge), and
    `spice.spkgeo` returns a single deterministic state at any ET inside a
    DAF segment.

    Story 4.3 AC1 — boundary-overlap-by-one-sample guarantee: the runtime
    selects the finest-cadence file that contains a queried ET. The wider-
    cadence chunk's ET range covers the narrower-cadence chunk's range
    entirely, so the overlap is the entire narrower window (not just the
    endpoint). The runtime's `findSegmentFile` binary-search picks the
    narrowest start (latest start ≤ et) which naturally picks the narrower
    band when both cover an ET.
    """
    import spiceypy as spice

    span = et_end - et_start
    if span <= 0:
        raise ValueError(f"encounter band window must be positive; got {span}")
    n_samples = max(2, int(np.floor(span / cadence_seconds)) + 1)
    et_grid = np.linspace(et_start, et_end, n_samples, dtype=np.float64)
    actual_cadence = (et_end - et_start) / (n_samples - 1)

    out = np.empty((n_samples, 6), dtype=np.float64)
    for i, et in enumerate(et_grid):
        state, _light_time = spice.spkgeo(targ=naif_id, et=float(et), ref="ECLIPJ2000", obs=0)
        out[i] = state
    return et_grid, out, actual_cadence


def _build_encounter_band_records(
    encounters: list[EncounterAnchor],
    bands: list[tuple[str, float, float]],
    spice_module,  # noqa: ANN001 — spiceypy module, kept untyped for stdlib-import-time hygiene
) -> list[tuple[EncounterAnchor, str, int, float, float, float]]:
    """Pre-compute the (encounter, band, spacecraft NAIF, et_start, et_end, cadence)
    tuples that the bake will materialise. Pulled out as a pure helper so the
    test in `test_bake_trajectories_cadence.py` can introspect the plan
    without executing the bake.

    `spice_module` is injected so the unit test can stub out str2et; in
    production the real spiceypy module is passed by the caller.
    """
    out: list[tuple[EncounterAnchor, str, int, float, float, float]] = []
    for enc in encounters:
        anchor_et = float(spice_module.str2et(enc.utc))
        sc_naif = ENCOUNTER_SPACECRAFT_TO_NAIF[enc.spacecraft]
        for tag, half_window, cadence in bands:
            band_start = anchor_et - half_window
            band_end = anchor_et + half_window
            out.append((enc, tag, sc_naif, band_start, band_end, cadence))
    return out


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
            # Exact-prefix kernel match on basename: a hypothetical
            # `Voyager_12.bsp` must NOT match V1's lookup. The merged Voyager
            # SPKs are named `Voyager_1.<...>.bsp` and `Voyager_2.<...>.bsp`,
            # so the period after the spacecraft digit is the natural
            # boundary.
            spacecraft_prefix = f"Voyager_{name[-1]}."
            spk_kernel = next(
                (
                    k
                    for k in kernel_entries
                    if k.kind == "spk"
                    and Path(k.target_path).name.startswith(spacecraft_prefix)
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

            # Story 4.3 AC1 — per-encounter cadence-refined chunks for THIS
            # spacecraft. We append them to the same body's `files` array so
            # the runtime EphemerisService (which indexes per-body, per-kind)
            # picks them up automatically. Each band file's body_id remains
            # the spacecraft NAIF (-31/-32); the encounter target appears in
            # the filename for human readability and the band range narrows
            # the binary-search lookup naturally.
            sc_encounters = [e for e in ENCOUNTERS if e.spacecraft == slug]
            if sc_encounters:
                plan = _build_encounter_band_records(sc_encounters, CADENCE_BANDS, spice)
                for enc, tag, sc_naif, band_start, band_end, cadence in plan:
                    assert sc_naif == naif_id
                    _et_grid, samples, actual_cadence = _sample_encounter_band(
                        naif_id, band_start, band_end, cadence
                    )
                    n = samples.shape[0]
                    file_name = f"{slug}-enc-{enc.body}-{tag}.bin.br"
                    target = out / file_name
                    sha = write_vtrj(
                        target_path=target,
                        body_id=naif_id,
                        et_start=band_start,
                        et_end=band_end,
                        cadence_seconds=actual_cadence,
                        samples=samples,
                    )
                    size_bytes = target.stat().st_size
                    utc_a = spice.et2utc(band_start, "ISOC", 0)
                    utc_b = spice.et2utc(band_end, "ISOC", 0)
                    print(
                        f"[OK]     enc {enc.body:8s} {tag:6s} {utc_a} -> {utc_b}  "
                        f"n={n}  cadence={actual_cadence:.1f}s  "
                        f"{size_bytes:,} bytes  sha={sha[:12]}..."
                    )
                    file_records.append(
                        FileEntry(
                            timeRangeEt=(band_start, band_end),
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

        # Story 4.3 T5 — outer-system moons. Same DE440-continuous-shape
        # one-VTRJ-per-body pattern as CELESTIAL_BODIES, but the bake
        # gracefully SKIPS moons whose satellite-system SPK kernel isn't
        # furnished. The runtime `CelestialBodies.addMoonsFor(...)` path
        # handles missing moon trajectories via the same `null → hide`
        # cache-miss path as cruise bodies: the moon mesh constructs OK
        # but stays hidden until its trajectory chunk lands.
        for naif_id, name, slug in MOON_BODIES:
            try:
                # Probe the moon's ephemeris with a single spkgeo at the
                # mission midpoint. If the satellite SPK is not furnished,
                # SpiceyError fires here and we skip the moon cleanly.
                mission_mid = 0.5 * (CELESTIAL_ET_START + CELESTIAL_ET_END)
                spice.spkgeo(targ=naif_id, et=mission_mid, ref="ECLIPJ2000", obs=0)
            except spice.utils.exceptions.SpiceyError:
                print(
                    f"[SKIP]   moon {slug:10s} (NAIF {naif_id}) — "
                    "satellite-system SPK not furnished; "
                    "add to kernels/kernels-manifest.json + re-bake"
                )
                continue
            cadence = CELESTIAL_DEFAULT_CADENCE_SECONDS
            _et_grid, samples, actual_cadence = _sample_celestial_body(
                naif_id,
                CELESTIAL_ET_START,
                CELESTIAL_ET_END,
                cadence,
            )
            n = samples.shape[0]
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
        # Story 3.3 AC4 — merge the models manifest fragment when present.
        # `bake_trajectories.py` runs FIRST in the `just bake` chain; the
        # subsequent `ck_sample.py` invocation re-emits the manifest and also
        # picks up the fragment. We merge here too so a standalone
        # `just bake-trajectories` after `just bake-glb` still produces a
        # fully-populated manifest (the trajectory-only state at the head of
        # the chain).
        models_fragment_path = out / "models-manifest-fragment.json"
        models_arg: list | None = None
        if models_fragment_path.exists():
            try:
                fragment = json.loads(models_fragment_path.read_text(encoding="utf-8"))
                models_arg = fragment.get("models")
                if models_arg is not None and not isinstance(models_arg, list):
                    print(
                        f"[WARN]   {models_fragment_path}: 'models' must be a list, ignoring."
                    )
                    models_arg = None
            except json.JSONDecodeError as exc:
                print(f"[WARN]   {models_fragment_path}: invalid JSON ({exc}); skipping merge.")
                models_arg = None
        emit_manifest(
            bodies=body_records,
            kernels=manifest_kernels,
            output_path=manifest_path,
            repo_root=repo,
            models=models_arg,
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
