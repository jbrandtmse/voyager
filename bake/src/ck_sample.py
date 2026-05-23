"""CK quaternion sampling + per-window attitude VTRJ emission (Story 3.1 AC1).

Reads each ENCOUNTERS entry from `ck_inventory.py`, samples bus and scan-platform
quaternions via SpiceyPy `ckgp` across a deterministic ET grid covering the
documented CK windows, applies the sign-flip walk (ADR-0024 / quat_continuity),
and emits VTRJ attitude binaries via `vtrj_writer.write_vtrj(kind="attitude", ...)`.

Cadence schedule (Story 4.0 amendment 2026-05-22; supersedes the 2026-05-21
uniform 5-sec schedule which itself superseded the original AC1 mixed schedule
— see ``_build_window_grid`` docstring for the full empirical history):

- **1-second inner band:** closest_approach_et ± 4 hours (HALF_WIDTH_1S) —
  catches fast-slew active-imaging sequences (V2 Saturn / V2 Uranus / etc.)
  without breaching NFR-P10. Initial Story 4.0 attempt used ±1 hour; raised
  to ±4 hours when AC8 integration smoke surfaced V2 Saturn at CA + 2.59
  hours still breaching the 1 mrad gate at 3.3 mrad.
- **5-second outer band:** closest_approach_et ± 2 days (HALF_WIDTH_1MIN),
  masked to exclude the inner ±4hr band. Adequate for the lower slew rates
  outside active imaging.

Precedence: inner > outer. The grid is built by generating each band's
grid points, then subtracting the inner band from the outer before generating
the outer-band grid. The result is a non-overlapping sorted ET sequence.

**Type-1 CK shape (platform_attitude path):** PDS Rings ISS SEDR scan-platform
CKs are type-1 (one record per ISS shutter event; zero-duration intervals
from ``ckcov``). For those, ``bake_attitude`` detects the type-1 shape via
``_is_type1_coverage`` and uses ``_extract_knot_ets_in_band`` to harvest the
discrete knot ETs directly, bypassing the continuous-cadence grid. The
resulting VTRJ stores explicit per-sample ETs (ADR-0004 § Body Layout per
Kind column-0 ET storage). Story 4.0 AC2 added this path; pre-Story-4.0
the platform-attitude VTRJs were silently skipped via the
"[SKIP] empty ET grid" path, causing the runtime to fall back to the
synthesized HGA-Earth-pointing path for the scan platform.

Quaternion convention: SpiceyPy `ckgp` returns SPICE-format quaternions
(scalar-first ``[w, x, y, z]``; ``q = cos(θ/2) + sin(θ/2) · (x·i + y·j + z·k)``).
This module stores VTRJ binaries in the same scalar-first convention. The
runtime decoder (Story 3.2 `AttitudeService`) converts to Three.js scalar-last
``[x, y, z, w]`` at decode time — that conversion is OUT of scope for this
story.

Window slug derivation: the slug for each ENCOUNTERS entry is hand-mapped to
match the chapter-registry slug convention from
`web/src/chapters/registry.ts` (v1-jupiter, v1-saturn, pale-blue-dot,
v2-jupiter, v2-saturn, v2-uranus, v2-neptune). Story 3.2's AttitudeService
will use the same slug to look up chapter-window attitude files.

Determinism (NFR-R4): no host-clock reads, no `random`, ENCOUNTERS is iterated
in declaration order (preserved by Python list semantics), `np.linspace`
endpoint-fixing is exact, brotli quality 11 (locked by vtrj_writer).

Canonical invocation::

    just bake-attitude
    # local fallback (if uv not on PATH):
    bake/.venv/Scripts/python.exe -m bake.src.ck_sample
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Allow direct script invocation AND `python -m bake.src.ck_sample` /
# `python -m src.ck_sample` (from `bake/`).
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _kernel_io import load_manifest, repo_root  # type: ignore[import-not-found]
    from ck_inventory import ENCOUNTERS, V1_BUS, V1_SCAN_PLATFORM, V2_BUS, V2_SCAN_PLATFORM  # noqa: E402
    from manifest_writer import BodyEntry, FileEntry, KernelRef, emit_manifest  # noqa: E402
    from quat_continuity import walk_signs  # noqa: E402
    from vtrj_writer import write_vtrj  # noqa: E402
else:
    from ._kernel_io import load_manifest, repo_root
    from .ck_inventory import ENCOUNTERS, V1_BUS, V1_SCAN_PLATFORM, V2_BUS, V2_SCAN_PLATFORM
    from .manifest_writer import BodyEntry, FileEntry, KernelRef, emit_manifest
    from .quat_continuity import walk_signs
    from .vtrj_writer import write_vtrj


# Cadence bands per AC1
CADENCE_1S = 1.0  # Story 4.0 amendment 2026-05-22: inner cadence around CA (path (c)).
CADENCE_5S = 5.0  # Story 3.1 amended 2026-05-21: outer band (±2 days) cadence.
CADENCE_10S = 10.0  # Retained for unit-test callers; not used in production bake.
CADENCE_1MIN = 60.0  # Retained as module constant for downstream compatibility.
CADENCE_DAILY = 86400.0  # Retained as module constant; not used by the attitude bake.

# Half-widths (seconds) for each band
HALF_WIDTH_10S = 3600.0  # ±1 hour around closest approach (legacy alias)
HALF_WIDTH_1S = 14400.0  # Story 4.0 amendment: 1-sec inner band ±4 hours around CA (initial ±1hr was inadequate for V2 Saturn active imaging at CA + ~2.6 hours)
HALF_WIDTH_1MIN = 172800.0  # ±2 days around encounter window

# Reference frame for ckgp queries. J2000 is the canonical CK reference frame
# per the Voyager CK files (verified by the FK chain in vg1_v02.tf / vg2_v02.tf).
CK_REFERENCE_FRAME = "J2000"

MAX_CKCOV_INTERVALS = 100000

# Hand-mapped slug per ENCOUNTERS entry — matches the chapter-registry slugs
# from web/src/chapters/registry.ts so Story 3.2's AttitudeService can resolve
# the per-chapter attitude file via the same slug the URLRouter uses.
#
# The key is the ENCOUNTERS row's `label` (1:1 with the row); the value is the
# canonical chapter slug. The story file proposed `v1-pbd` for the PBD entry;
# we use `pale-blue-dot` instead to match the chapter registry verbatim.
SLUG_BY_LABEL: dict[str, str] = {
    "V1 Jupiter encounter (1979-03 closest approach 03-05)": "v1-jupiter",
    "V1 Saturn encounter (1980-11 closest approach 11-12)": "v1-saturn",
    "V1 Pale Blue Dot (1990-02-14 family portrait)": "pale-blue-dot",
    "V2 Jupiter encounter (1979-07 closest approach 07-09)": "v2-jupiter",
    "V2 Saturn encounter (1981-08 closest approach 08-25)": "v2-saturn",
    "V2 Uranus encounter (1986-01 closest approach 01-24)": "v2-uranus",
    "V2 Neptune encounter (1989-08 closest approach 08-25)": "v2-neptune",
}


@dataclass(frozen=True)
class WindowSample:
    """A single attitude VTRJ emission record."""

    slug: str
    spacecraft: str  # "v1" | "v2"
    kind: str  # "bus_attitude" | "platform_attitude"
    struct_id: int  # CK structure ID (-31000, -31100, -32000, -32100)
    et_start: float
    et_end: float
    cadence_seconds: float
    file_path: Path
    url: str
    sha256: str
    sample_count: int


def _ckcov_windows(ck_path: Path, struct_id: int) -> list[tuple[float, float]]:
    """Return [(et_start, et_end), ...] coverage intervals for `struct_id` in `ck_path`.

    Returns an empty list when the CK has no coverage for the structure ID.
    """
    import spiceypy as spice

    cover = spice.support_types.SPICEDOUBLE_CELL(MAX_CKCOV_INTERVALS)
    try:
        spice.ckcov(str(ck_path), struct_id, False, "INTERVAL", 0.0, "TDB", cover)
    except spice.utils.exceptions.SpiceyError:
        return []
    n = spice.wncard(cover)
    out: list[tuple[float, float]] = []
    for i in range(n):
        a, b = spice.wnfetd(cover, i)
        out.append((float(a), float(b)))
    return out


def _intersect_interval(
    band: tuple[float, float], coverage: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    """Return the intersection of [a, b] with each coverage interval, dropping empties.

    Note: this strict ``lo < hi`` filter intentionally drops zero-duration
    intervals (``a == b``) — those are the canonical shape of type-1 CK records
    (one per ISS shutter event for the platform structures ``-31100`` /
    ``-32100``). Type-1 CK handling is now routed through
    ``_extract_knot_ets_in_band`` below, which returns the discrete knot ETs
    AS-IS rather than discarding them. The platform path in ``bake_attitude``
    detects type-1 coverage shape and uses the discrete-knot path; the bus
    path (continuous type-3 / type-6 coverage) continues to use this
    intersector + the cadence-grid path unchanged.
    """
    a, b = band
    out: list[tuple[float, float]] = []
    for cov_a, cov_b in coverage:
        lo = max(a, cov_a)
        hi = min(b, cov_b)
        if lo < hi:
            out.append((lo, hi))
    return out


def _is_type1_coverage(coverage: list[tuple[float, float]]) -> bool:
    """Heuristic: detect type-1 (discrete pointing) CK coverage shape.

    Type-1 CK records (one per ISS shutter event) appear as zero-duration
    intervals ``(t, t)`` from ``ckcov``. Detection: at least one interval where
    ``a == b`` (strict equality on float64 — ``ckcov`` reports the SCLK tick
    boundary at full precision so the equality is exact).

    Story 4.0 AC2 (path (a) — amend `_build_window_grid` to treat type-1
    zero-duration intervals as discrete knot ETs).
    """
    return any(a == b for a, b in coverage)


def _extract_knot_ets_in_band(
    coverage: list[tuple[float, float]],
    band: tuple[float, float],
) -> np.ndarray:
    """Return the sorted, deduped ET knots (interval starts) inside ``band``.

    For type-1 CK coverage where every interval is zero-duration ``(t, t)``,
    each interval start IS a discrete knot ET — the SCLK tick at which the
    ISS shutter event fired. This helper extracts those knot ETs, filters to
    the encounter ±2-day band, and returns them as a float64 ndarray sorted
    + deduped (``np.unique`` is sufficient since coverage is finite).

    Story 4.0 AC2 path (a): emit a ``platform_attitude`` VTRJ with explicit
    per-sample ETs for type-1 CKs (ADR-0004 § Body Layout per Kind column-0
    ET storage — Story 3.1 amendment 2026-05-21).
    """
    band_lo, band_hi = band
    knots = [
        float(a) for a, _b in coverage if band_lo <= a <= band_hi
    ]
    if not knots:
        return np.array([], dtype=np.float64)
    return np.unique(np.asarray(knots, dtype=np.float64))


def _subtract_ranges(
    base: list[tuple[float, float]], holes: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    """Subtract every hole range from each base interval; return the surviving intervals.

    Used to enforce cadence-band precedence: the daily band is `base`, holes
    are the 1-minute and 10-second bands (which take precedence and must NOT
    be double-sampled).
    """
    if not holes:
        return list(base)
    result: list[tuple[float, float]] = []
    for lo, hi in base:
        # Walk holes in time order
        sorted_holes = sorted(holes)
        current_lo = lo
        for h_lo, h_hi in sorted_holes:
            if h_hi <= current_lo or h_lo >= hi:
                continue  # hole outside [lo, hi]
            if h_lo > current_lo:
                result.append((current_lo, min(h_lo, hi)))
            current_lo = max(current_lo, h_hi)
            if current_lo >= hi:
                break
        if current_lo < hi:
            result.append((current_lo, hi))
    return [(a, b) for a, b in result if b > a]


def _et_grid_for_interval(
    et_start: float, et_end: float, cadence_seconds: float
) -> np.ndarray:
    """Build an inclusive ET grid covering [et_start, et_end] at `cadence_seconds`.

    Uses ``np.linspace`` with the count derived from ``ceil(span/cadence)+1``
    so the final grid point lies at-or-just-past ``et_end``; final endpoint is
    then clamped to ``et_end`` exactly. Deterministic for identical inputs.
    """
    span = et_end - et_start
    if span <= 0:
        return np.array([], dtype=np.float64)
    # Number of samples is ceil(span / cadence) + 1 so consecutive samples are
    # never more than `cadence` apart and the final sample lands exactly on
    # et_end (clamped below).
    n = int(np.ceil(span / cadence_seconds)) + 1
    if n < 2:
        n = 2
    grid = np.linspace(et_start, et_end, n, dtype=np.float64)
    return grid


def _build_window_grid(
    coverage: list[tuple[float, float]],
    encounter_start_et: float,
    encounter_end_et: float,
    closest_approach_et: float,
) -> tuple[np.ndarray, float]:
    """Compose the per-encounter ET grid from two cadence bands within the encounter window.

    Returns ``(grid, effective_cadence_seconds)`` where ``effective_cadence`` is
    the FINEST cadence used to build the grid (``CADENCE_1S`` when the inner
    ±4hr CA band contributes samples, ``CADENCE_5S`` otherwise). The VTRJ
    header ``cadence_seconds`` stores this finest cadence as **informational
    only** (ADR-0004 § Body Layout per Kind, Story 3.1 amendment 2026-05-21) —
    the on-disk body carries explicit per-sample ETs in column 0, so the
    runtime decoder does NOT use the header cadence for knot reconstruction.

    Cadence schedule (Story 4.0 amended 2026-05-22 — variable cadence around
    CA; supersedes the Story 3.1 amendment 2026-05-21 uniform 5-sec schedule
    which itself superseded the original AC1 mixed schedule):

        - **1-sec inner band:** closest_approach_et ± 4 hours (HALF_WIDTH_1S).
          Catches the fast-slew imaging sequences (V2 Saturn active imaging,
          V2 Uranus Miranda imaging, etc.) without breaching NFR-P10. Initial
          Story 4.0 attempt used ±1 hour; raised to ±4 hours when AC8
          integration smoke surfaced V2 Saturn at CA + 2.59 hours still
          breaching the 1 mrad gate at 3.3 mrad (5-sec outer band).
        - **5-sec outer band:** closest_approach_et ± 2 days (HALF_WIDTH_1MIN),
          masked to exclude the 1-sec band so consecutive samples are never
          duplicated. Adequate for the lower slew rates outside the active-
          imaging band.

    Precedence: inner > outer. The grid is built by generating each band's
    grid points, then subtracting the inner band's range from the outer band
    via ``_subtract_ranges`` before generating the outer-band grid. The result
    is a non-overlapping sorted ET sequence.

    Empirical history (real-CK slow-tier iterations 2026-05-21 / 2026-05-22):
        - Original AC1 mixed schedule (10-sec ±1hr inside 1-min ±2-day):
          breached NFR-P10 at V2 Uranus (-4hr) by 32.6 mrad — outer band's
          1-min cadence too coarse for active Miranda imaging.
        - 10-sec uniform across ±2 days (Story 3.1 first slow-tier
          calibration 2026-05-21): dropped worst case from 32.6 → 1.36 mrad.
          6 of 7 windows passed. Only V2 Uranus -4hr (Miranda imaging peak)
          still over the 1.0 mrad gate.
        - 5-sec uniform across ±2 days (Story 3.1 amendment 2026-05-21):
          dropped V2 Uranus to ~0.34 mrad, comfortably under NFR-P10.
          **But:** Story 3.7's L2 fixture (2026-05-22 lead-driven smoke
          surfaced via the L2 gate) found **V2 Saturn active imaging is
          faster than V2 Uranus** — at ET ~-579086636 (V2 Saturn CA + a few
          hours), neighboring 5-sec knots have pairwise angular delta = 5.8
          mrad; SLERP mid-interval gives 3.6 mrad — 3.6× over NFR-P10.
          V2 Saturn was not in the Story 3.1 calibration set (cadence was
          tuned only for V2 Uranus, the previously-known worst case).
        - **Variable cadence (current — Story 4.0 amendment 2026-05-22):**
          1-sec inside ±4hr CA (HALF_WIDTH_1S, widened from initial ±1hr
          when AC8 smoke surfaced V2 Saturn at CA+2.6hr — see ``HALF_WIDTH_1S``
          constant declaration above), 5-sec elsewhere. 1-sec inner band
          gives ~25× SLERP-error reduction inside the active-imaging window
          (error scales as cadence² × angular acceleration); 5-sec outer band
          preserves the Story 3.1 V2-Uranus-margin elsewhere. Path (c) from
          the deferred-work item — preserves the original AC1 mixed-schedule
          intent + the variable-cadence schema (already supported per
          ADR-0004 § Body Layout per Kind explicit-ET amendment).

    Storage cost (Story 4.0 amendment, post-±4hr-widening):
        - 1-sec ±4hr CA = 28,800 samples per encounter
        - 5-sec across 4 days minus 8hr inner = (86400×4 - 28800)/5 = 63,360
        - Total: ~92k samples per encounter file × 40 bytes ≈ 3.7 MB
          uncompressed per file × 14 files ≈ 52 MB uncompressed.
        - Brotli q11 typically compresses VTRJ to ~15-25% → ~8-13 MB
          first-paint, well within NFR-P4 (≤35 MB) / NFR-P5 (≤150 MB).
        - AC8 integration smoke verified the actual brotli-compressed total
          to be ~14 MB for all 13 attitude files (bus + platform).

    Path (c) preserves the spirit of AC1's original mixed-schedule design
    (per voyager-skill-rules.md Rule 5 — planning artifacts amended in place
    rather than worked around). The epics.md AC1 wording is amended in
    parallel with this docstring as part of the Story 4.0 change-set.

    The ``encounter_start_et`` / ``encounter_end_et`` parameters are retained
    in the signature for caller-context discoverability but are NOT consumed
    by the band construction. The 2-month encounter-label window is used only
    for ``ckbrief-inventory.md`` markdown emission, not the attitude bake grid.

    **Cruise-period exclusion:** encounter files contain ONLY samples within
    closest_approach ± 2 days — no daily-cadence cruise samples. NFR-P10 is
    "in encounter windows" per PRD; cruise periods use synthesized HGA
    attitude (AttitudeService, Story 3.2), not baked CK data.

    **V2 Saturn — load-bearing surfacing case for Story 4.0:** Story 3.7's L2
    fixture surfaced V2 Saturn (CA 1981-08-25) at 3.6 mrad against NFR-P10's
    1 mrad gate when this function ran at uniform 5-sec cadence. The 1-sec
    inner-band addition closes that gate. See `_bmad-output/implementation-
    artifacts/3-7-smoke-evidence/local-real-data-output.txt` for the failing
    knot's ET (-579086636.4) and the Story 4.0 closure smoke under
    `_bmad-output/implementation-artifacts/4-0-smoke-evidence/`.
    """
    if not coverage:
        return np.array([], dtype=np.float64), CADENCE_1S

    del encounter_start_et, encounter_end_et  # explicitly unused; see docstring

    inner_band = (
        closest_approach_et - HALF_WIDTH_1S,
        closest_approach_et + HALF_WIDTH_1S,
    )
    outer_band = (
        closest_approach_et - HALF_WIDTH_1MIN,
        closest_approach_et + HALF_WIDTH_1MIN,
    )

    # Inner: 1-sec across ±4hr CA (HALF_WIDTH_1S), clipped to coverage.
    inner_clipped = _intersect_interval(inner_band, coverage)
    inner_grids: list[np.ndarray] = []
    for lo, hi in inner_clipped:
        inner_grids.append(_et_grid_for_interval(lo, hi, CADENCE_1S))

    # Outer: 5-sec across ±2 days, clipped to coverage MINUS the inner band
    # (so we don't double-sample the inner ±4hr at both cadences).
    outer_clipped = _intersect_interval(outer_band, coverage)
    outer_minus_inner = _subtract_ranges(outer_clipped, [inner_band])
    outer_grids: list[np.ndarray] = []
    for lo, hi in outer_minus_inner:
        outer_grids.append(_et_grid_for_interval(lo, hi, CADENCE_5S))

    all_grids = inner_grids + outer_grids
    if not all_grids:
        # Coverage exists but lies entirely outside ±2 days of CA — no samples.
        # Cadence label is the finest *would-have-been* cadence (1-sec) for
        # diagnostic consistency; the empty-grid signal is the caller's gate.
        return np.array([], dtype=np.float64), CADENCE_1S

    combined = np.unique(np.concatenate(all_grids))  # sorted + de-duplicated
    # Effective cadence = finest band that contributed samples.
    effective_cadence = CADENCE_1S if inner_grids else CADENCE_5S
    return combined, effective_cadence


def sample_window(
    struct_id: int,
    et_grid: np.ndarray,
) -> np.ndarray:
    """Sample CK quaternions at each ET in `et_grid` via SpiceyPy `ckgp`.

    Furnishing of the LSK/SCLK/FK/CK kernels MUST happen before calling this
    function (the caller furnishes once per bake; see `bake_attitude`).

    Parameters
    ----------
    struct_id : int
        The 5-digit CK structure ID (-31000 V1 bus / -31100 V1 scan platform /
        -32000 V2 bus / -32100 V2 scan platform).
    et_grid : np.ndarray
        ``(N,)`` float64 ephemeris-time grid (TDB seconds past J2000).

    Returns
    -------
    np.ndarray
        ``(N, 4)`` float64 quaternion array in SPICE scalar-first convention
        ``[w, x, y, z]``. Samples where `ckgp` fails (`found=False`) are
        skipped — the returned shape is ``(K, 4)`` with ``K <= N``; the
        corresponding ET grid is also filtered by the caller using the same
        mask via `sample_window_with_mask` below.
    """
    samples, _kept_mask = sample_window_with_mask(struct_id, et_grid)
    return samples


def sample_window_with_mask(
    struct_id: int,
    et_grid: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Sample CK quaternions at each ET, returning (samples, kept_mask).

    Same as `sample_window` but also returns a boolean mask indicating which
    grid points had successful `ckgp` reads. The caller uses the mask to
    derive the matching `et_grid` for header / round-trip semantics.
    """
    import spiceypy as spice

    if et_grid.size == 0:
        return np.zeros((0, 4), dtype=np.float64), np.zeros(0, dtype=bool)

    n = int(et_grid.size)
    out = np.empty((n, 4), dtype=np.float64)
    mask = np.zeros(n, dtype=bool)
    # SC ID derivation: `struct_id // 1000` is WRONG because Python's floor
    # division on negatives floors toward negative infinity (-31100 // 1000
    # = -32, not -31). Use `-(abs(struct_id) // 1000)` to truncate-toward-zero
    # so the magnitude-divide-then-resign gives -31 for both -31000 and -31100,
    # and -32 for both -32000 and -32100.
    sc_id = -(abs(struct_id) // 1000)
    for i in range(n):
        et = float(et_grid[i])
        sclkdp = spice.sce2c(sc_id, et)
        # SpiceyPy 8.1.0 with found_check=True (default): ckgpav returns
        # (cmat, av, clkout) on success and raises SpiceyError on not-found.
        try:
            cmat, _av, _clkout = spice.ckgpav(struct_id, sclkdp, 0.0, CK_REFERENCE_FRAME)
        except spice.utils.exceptions.SpiceyError:
            continue
        # cmat is a 3x3 rotation matrix; convert to quaternion via m2q.
        # SPICE quaternion convention: scalar-first [w, x, y, z].
        q = spice.m2q(cmat)
        out[i] = q
        mask[i] = True

    kept = out[mask]
    return kept, mask


def sample_window_pointing_only(
    struct_id: int,
    et_grid: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Pointing-only variant: uses `ckgp` (pointing) instead of `ckgpav` (pointing+av).

    `ckgp` is appropriate when only the rotation matrix is needed (no angular
    velocity). The Voyager bake uses pure quaternion sampling so `ckgp` is
    sufficient. Returns ``(samples, kept_mask)`` like `sample_window_with_mask`.
    """
    import spiceypy as spice

    if et_grid.size == 0:
        return np.zeros((0, 4), dtype=np.float64), np.zeros(0, dtype=bool)

    n = int(et_grid.size)
    out = np.empty((n, 4), dtype=np.float64)
    mask = np.zeros(n, dtype=bool)
    # Truncate-toward-zero (see comment in sample_window_with_mask).
    sc_id = -(abs(struct_id) // 1000)
    for i in range(n):
        et = float(et_grid[i])
        sclkdp = spice.sce2c(sc_id, et)
        # SpiceyPy 8.1.0 with found_check=True (default): ckgp returns
        # (cmat, clkout) on success and raises SpiceyError on not-found.
        try:
            cmat, _clkout = spice.ckgp(struct_id, sclkdp, 0.0, CK_REFERENCE_FRAME)
        except spice.utils.exceptions.SpiceyError:
            continue
        q = spice.m2q(cmat)
        out[i] = q
        mask[i] = True

    kept = out[mask]
    return kept, mask


def _parse_utc(utc: str) -> str:
    """Strip the trailing 'Z' for SpiceyPy `utc2et` consumption (NAIF accepts both)."""
    return utc.rstrip("Z")


def _spacecraft_tag(struct_id: int) -> str:
    """`"v1"` for V1 structures, `"v2"` for V2."""
    return "v1" if struct_id in (V1_BUS, V1_SCAN_PLATFORM) else "v2"


def _kind_label(struct_id: int) -> str:
    """`"bus_attitude"` for bus IDs, `"platform_attitude"` for scan platform."""
    if struct_id in (V1_BUS, V2_BUS):
        return "bus_attitude"
    if struct_id in (V1_SCAN_PLATFORM, V2_SCAN_PLATFORM):
        return "platform_attitude"
    raise ValueError(f"unknown struct_id for kind label: {struct_id}")


def _kind_short(struct_id: int) -> str:
    """`"bus"` / `"platform"` for filename slugs."""
    return "bus" if struct_id in (V1_BUS, V2_BUS) else "platform"


def bake_attitude(
    root: Path | None = None,
    out_dir: Path | None = None,
) -> int:
    """Execute the attitude bake. Returns process exit code (0 success, non-zero on failure).

    For each ENCOUNTERS row × (bus_id, scan_id), this function:
    1. Walks `ckcov` over each CK kernel to find the structure's coverage windows.
    2. Builds the ET grid (Story 4.0 amendment 2026-05-22): 1-sec inside
       closest-approach ±4 hours (HALF_WIDTH_1S — widened from initial ±1hr
       per AC8 smoke surfacing V2 Saturn at CA+2.6hr), 5-sec across
       closest-approach ±2 days (with the inner band masked out).
       For type-1 platform CKs (PDS Rings ISS
       SEDR — zero-duration intervals per shutter event), uses the discrete
       knot ETs in the ±2-day band directly (AC2 path (a)).
    3. Samples quaternions via SpiceyPy `ckgp` + `m2q` at every grid ET.
    4. Applies `quat_continuity.walk_signs` to remove sign-flip discontinuities.
    5. Writes the walked quaternions via `vtrj_writer.write_vtrj(kind="attitude")`.
    6. Emits one VTRJ per (encounter, kind) tuple; skips emission when ckcov
       returns no coverage for that (CK, struct_id) tuple OR when the encounter
       ±2-day band has no coverage overlap.
    7. Updates / writes `bake/out/manifest.json` so attitude entries appear
       alongside trajectory entries (the trajectory entries are preserved if
       the manifest already exists from a prior `just bake` run; see
       `_load_existing_bodies`).
    """
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

    by_kind: dict[str, list] = {}
    for k in kernel_entries:
        by_kind.setdefault(k.kind, []).append(k)
    ck_entries = sorted(by_kind.get("ck", []), key=lambda k: k.file)
    if not ck_entries:
        print(
            "[FAIL] no CK kernels in kernels-manifest.json; cannot bake attitude",
            file=sys.stderr,
        )
        return 1

    spice.kclear()
    try:
        # Furnish LSK / SCLK / FK / CK in dependency order.
        for kind in ("lsk", "sclk", "fk", "ck"):
            for k in sorted(by_kind.get(kind, []), key=lambda k: k.file):
                target = (repo / k.target_path).resolve()
                if not target.exists():
                    raise FileNotFoundError(
                        f"kernel missing on disk: {target} -- run `just fetch-kernels` first"
                    )
                spice.furnsh(str(target))

        emissions: list[WindowSample] = []

        # Pre-resolve the V1 / V2 SPK IDs for the body-level naifId in the manifest.
        # Bus and scan platform both roll up to the parent spacecraft (-31 / -32).
        for label, t_start_utc, t_end_utc, scan_id, bus_id, closest_approach_utc in ENCOUNTERS:
            slug = SLUG_BY_LABEL.get(label)
            if slug is None:
                print(f"[WARN]   unknown label {label!r}; skipping", file=sys.stderr)
                continue

            encounter_start_et = spice.utc2et(_parse_utc(t_start_utc))
            encounter_end_et = spice.utc2et(_parse_utc(t_end_utc))
            closest_approach_et = spice.utc2et(_parse_utc(closest_approach_utc))

            for struct_id in (bus_id, scan_id):
                # Aggregate coverage across ALL CK kernels for this structure ID.
                coverage: list[tuple[float, float]] = []
                for ck_entry in ck_entries:
                    ck_path = (repo / ck_entry.target_path).resolve()
                    coverage.extend(_ckcov_windows(ck_path, struct_id))
                if not coverage:
                    # Per AC1: NO emission for windows without coverage
                    print(
                        f"[SKIP]   {slug} struct_id={struct_id}: no CK coverage; "
                        f"file not emitted"
                    )
                    continue

                # Sort + merge overlapping coverage so the band intersection is
                # well-defined (e.g., two CKs covering the same encounter would
                # otherwise double-count).
                coverage.sort()
                merged: list[tuple[float, float]] = []
                for c_lo, c_hi in coverage:
                    if merged and c_lo <= merged[-1][1]:
                        merged[-1] = (merged[-1][0], max(merged[-1][1], c_hi))
                    else:
                        merged.append((c_lo, c_hi))

                # Story 4.0 AC2 (path (a)): type-1 platform CKs report
                # zero-duration `(t, t)` intervals (one per ISS shutter event).
                # `_intersect_interval` (and therefore `_build_window_grid`)
                # strictly filter `lo < hi`, so the type-1 platform coverage
                # union appears empty → no `platform_attitude` VTRJ is emitted
                # → the runtime falls back to the synthesized HGA-Earth-pointing
                # path for the scan platform → Story 3.7's L2 platform gate is
                # inactive.
                #
                # Handling: detect the type-1 shape (any zero-duration interval)
                # and extract the discrete knot ETs in the encounter ±2-day
                # band as-is. The ET grid then contains exactly the SCLK ticks
                # at which the CK has a record; the explicit-ET VTRJ schema
                # (ADR-0004 § Body Layout per Kind column-0 ET storage)
                # consumes them directly via the `ets=` parameter of
                # `vtrj_writer.write_vtrj`. The cadence header in this case is
                # informational only (no fixed cadence — type-1 records are
                # event-timed).
                if _is_type1_coverage(merged):
                    band_2day = (
                        closest_approach_et - HALF_WIDTH_1MIN,
                        closest_approach_et + HALF_WIDTH_1MIN,
                    )
                    grid = _extract_knot_ets_in_band(merged, band_2day)
                    # Effective cadence for the header: the median inter-knot
                    # gap is a meaningful diagnostic, but for byte-stability +
                    # determinism we report a fixed convention — CADENCE_1S
                    # since type-1 records are event-rate (typically much
                    # finer than 1 sec during active imaging).
                    effective_cadence = CADENCE_1S
                else:
                    grid, effective_cadence = _build_window_grid(
                        coverage=merged,
                        encounter_start_et=encounter_start_et,
                        encounter_end_et=encounter_end_et,
                        closest_approach_et=closest_approach_et,
                    )

                if grid.size == 0:
                    print(
                        f"[SKIP]   {slug} struct_id={struct_id}: empty ET grid "
                        f"(coverage outside encounter band)"
                    )
                    continue

                samples, kept_mask = sample_window_pointing_only(struct_id, grid)
                if samples.shape[0] == 0:
                    print(
                        f"[SKIP]   {slug} struct_id={struct_id}: ckgp returned no "
                        f"successful reads"
                    )
                    continue
                kept_grid = grid[kept_mask]

                walked = walk_signs(samples)

                # File naming: <v1|v2>_<bus|platform>_attitude.<slug>.bin.br
                sc_tag = _spacecraft_tag(struct_id)
                kind_tag = _kind_short(struct_id)
                file_name = f"{sc_tag}_{kind_tag}_attitude.{slug}.bin.br"
                target_path = out / file_name

                et_start = float(kept_grid[0])
                et_end = float(kept_grid[-1])
                # Cadence for the VTRJ header — INFORMATIONAL ONLY for attitude
                # (ADR-0004 § Body Layout per Kind, Story 3.1 amendment 2026-05-21).
                # The variable-cadence schedule (Story 4.0 amendment 2026-05-22 —
                # 1-sec ±4hr CA (HALF_WIDTH_1S), 5-sec ±2-day; type-1 platform CKs use discrete
                # event-rate knots per AC2) is preserved inline by the per-sample
                # ETs stored in column 0 of the on-disk body. The runtime decoder
                # reads explicit ETs as SLERP knots; this `cadence_seconds` value
                # is the finest cadence band that contributed to the file, useful
                # for diagnostics but never used for knot reconstruction.
                cadence_for_header = effective_cadence

                sha = write_vtrj(
                    target_path=target_path,
                    body_id=struct_id,
                    et_start=et_start,
                    et_end=et_end,
                    cadence_seconds=cadence_for_header,
                    samples=walked,
                    kind="attitude",
                    ets=kept_grid.astype(np.float64),
                )

                emissions.append(
                    WindowSample(
                        slug=slug,
                        spacecraft=sc_tag,
                        kind=_kind_label(struct_id),
                        struct_id=struct_id,
                        et_start=et_start,
                        et_end=et_end,
                        cadence_seconds=cadence_for_header,
                        file_path=target_path,
                        url=f"data/{file_name}",
                        sha256=sha,
                        sample_count=int(walked.shape[0]),
                    )
                )
                print(
                    f"[OK]     {sc_tag} {kind_tag} {slug:15s} struct={struct_id}  "
                    f"n={walked.shape[0]}  span={et_end - et_start:.1f}s  "
                    f"cadence={cadence_for_header:.0f}s  sha={sha[:12]}..."
                )

        # Assemble manifest. The manifest combines existing trajectory entries
        # (if `manifest.json` exists from a previous `just bake` run) with the
        # new attitude entries grouped under the same naifId.
        body_records = _assemble_body_records(repo, out, emissions, kernel_entries)
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
        # Story 3.3 AC4 — merge the models manifest fragment emitted by
        # `web/scripts/build_glb.ts` (via `just bake-glb`) when present. The
        # fragment lives at `bake/out/models-manifest-fragment.json`. When the
        # fragment is absent (e.g., contributor hasn't run `just bake-glb`
        # yet), the manifest omits the `models` field entirely so the
        # pre-Story-3.3 manifest shape is byte-stable.
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
        n_attitude_files = len(emissions)
        print(
            f"[OK]     {manifest_path}  ({n_attitude_files} attitude files emitted; "
            f"{len(body_records)} bodies in manifest)"
        )
        return 0
    finally:
        spice.kclear()


def _assemble_body_records(
    repo: Path,
    out_dir: Path,
    emissions: list[WindowSample],
    kernel_entries: list,
) -> list[BodyEntry]:
    """Combine pre-existing trajectory entries (from prior `just bake`) with new attitude
    entries. If `manifest.json` doesn't exist, builds the attitude-only manifest.

    The trajectory entries are read from the existing on-disk manifest verbatim
    (the L1 validator depends on their `naifId` / `name` / `files` shape). This
    function does NOT re-run the trajectory bake.
    """
    from collections import defaultdict

    import json as _json

    manifest_path = out_dir / "manifest.json"
    pre_existing_files_by_naif: dict[int, list[FileEntry]] = defaultdict(list)
    pre_existing_names: dict[int, str] = {}

    if manifest_path.exists():
        doc = _json.loads(manifest_path.read_text(encoding="utf-8"))
        for body in doc.get("bodies", []):
            naif_id = int(body["naifId"])
            pre_existing_names[naif_id] = body["name"]
            for fe in body["files"]:
                # Preserve ALL pre-existing file entries (trajectory + any prior attitude).
                # We will dedupe by url below when adding new attitude entries.
                pre_existing_files_by_naif[naif_id].append(
                    FileEntry(
                        timeRangeEt=(
                            float(fe["timeRangeEt"][0]),
                            float(fe["timeRangeEt"][1]),
                        ),
                        cadenceSec=float(fe["cadenceSec"]),
                        kind=str(fe["kind"]),
                        url=str(fe["url"]),
                        sha256=str(fe["sha256"]),
                        sizeBytes=int(fe["sizeBytes"]),
                        provenance=(
                            str(fe["provenance"]) if "provenance" in fe and fe["provenance"] else None
                        ),
                    )
                )

    # Build naifId map for attitude entries: bus / scan-platform roll up to
    # the parent spacecraft SPK ID (-31 / -32).
    def _spacecraft_naif_for_struct(struct_id: int) -> int:
        return -31 if struct_id in (V1_BUS, V1_SCAN_PLATFORM) else -32

    def _spacecraft_name(naif: int) -> str:
        return "Voyager 1" if naif == -31 else "Voyager 2"

    # Group emissions by spacecraft NAIF
    new_by_naif: dict[int, list[FileEntry]] = defaultdict(list)
    for em in emissions:
        naif = _spacecraft_naif_for_struct(em.struct_id)
        size_bytes = em.file_path.stat().st_size
        new_by_naif[naif].append(
            FileEntry(
                timeRangeEt=(em.et_start, em.et_end),
                cadenceSec=em.cadence_seconds,
                kind=em.kind,
                url=em.url,
                sha256=em.sha256,
                sizeBytes=int(size_bytes),
                provenance="ck",
            )
        )

    # Merge: pre-existing files (deduped by URL with new) + new entries.
    all_naif_ids = set(pre_existing_files_by_naif.keys()) | set(new_by_naif.keys())
    # Stable sort: voyagers (-32, -31 — numerically ascending) first, then
    # celestial bodies (1..10, 301). The (group, nid) ordering keeps spacecraft
    # entries grouped at the top of `bodies[]` regardless of how many planets
    # exist, and is deterministic across re-bakes.
    sorted_naif = sorted(
        all_naif_ids,
        key=lambda nid: (0 if nid in (-31, -32) else 1, nid),
    )

    bodies: list[BodyEntry] = []
    for naif in sorted_naif:
        # Combine, deduping by URL (a re-bake replaces the entry).
        new_urls = {fe.url for fe in new_by_naif.get(naif, [])}
        kept_pre_existing = [
            fe for fe in pre_existing_files_by_naif.get(naif, []) if fe.url not in new_urls
        ]
        files = kept_pre_existing + new_by_naif.get(naif, [])
        # Sort files by (kind, et_start) for deterministic output.
        files.sort(key=lambda fe: (fe.kind, fe.timeRangeEt[0]))
        name = pre_existing_names.get(naif) or _spacecraft_name(naif)
        bodies.append(BodyEntry(naifId=naif, name=name, files=files))
    return bodies


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Bake Voyager attitude VTRJ files (per-encounter; ADR-0024)."
    )
    parser.add_argument("--root", type=Path, default=None, help="Repo root (default: auto)")
    parser.add_argument(
        "--out-dir", type=Path, default=None, help="Output directory (default: <repo>/bake/out)"
    )
    args = parser.parse_args(argv)
    return bake_attitude(root=args.root, out_dir=args.out_dir)


if __name__ == "__main__":
    sys.exit(main())
