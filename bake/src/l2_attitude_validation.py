"""Layer-2 attitude fixture generator (Story 3.7).

The bake-tier L1 validator at ``bake/src/validate_l1.py`` checks that the
**baked** quaternion knots (SciPy SLERP between them) agree with SpiceyPy
``ckgp`` to within NFR-P10's 1 mrad budget. That covers the offline pipeline.

This module is the **runtime-tier L2 mirror**: it emits a JSON fixture of
``(spacecraftId, et, ckWindow, ground_truth_bus_quat, ground_truth_platform_quat)``
records sampled inside every CK coverage window. The fixture is consumed by
the Vitest test ``web/tests/attitude-l2-fixture.test.ts`` which runs the
**JavaScript** ``AttitudeService`` against the same ETs and asserts the
angular difference between the JS quaternion and the SPICE ground truth is
``≤ 1 mrad`` per NFR-P10.

Pipeline:

    just bake-attitude            # produces VTRJ binaries at bake/out/*.bin.br
    just copy-bake-to-web         # mirrors them under web/public/data/
    just l2-attitude-fixture      # this script — emits bake/out/l2-attitude-fixture.json
    cp bake/out/l2-attitude-fixture.json web/public/data/l2-attitude-fixture.json
    cd web && npm test -- attitude-l2

Locally the lead may not have ``uv``/SpiceyPy installed. In that case the
script cannot run; the Vitest test detects the missing fixture and
``describe.skipIf(!fixturePresent)`` the entire suite, keeping the rest of
the suite green. The full ≥500-samples-per-window gate runs in CI.

Determinism contract (NFR-R4):
- Fixed RNG seed (``RNG_SEED = 42``), same as L1.
- Per-window draws via ``random.Random(seed)`` instance (no global state).
- Records sorted by ``(spacecraftId, et)`` ascending before write.
- ``json.dumps`` with ``sort_keys=True`` + ``indent=2`` for diff stability.
- No host-clock reads; ``ENCOUNTERS`` iterated in declaration order.

Quaternion convention:
- SpiceyPy ``m2q`` (and ``ckgp`` after ``m2q``) returns SPICE scalar-first
  ``[w, x, y, z]``.
- The fixture stores **scalar-last** ``[x, y, z, w]`` to match the JS
  ``AttitudeService`` post-decode convention (Story 3.2 § AC2 SPICE→Three.js
  permute happens once at decode time).
- The runtime test compares via ``|dot(q_js, q_truth)|`` (absolute value of
  the 4-component dot product), which is sign-flip-tolerant — ``q`` and
  ``-q`` represent the same rotation (ADR-0024 sign-flip walk pre-bake is
  applied at the BAKE side; the L2 comparison must remain tolerant in case
  the JS SLERP's walked path returns a sign-flipped-but-equivalent answer).

Regeneration trigger (Story 7.x kernel-drift-report hook):
- Any change to ``vgr1_super_v2.bc``, ``vgr2_super_v2.bc``, the FK frame
  kernels, or the SCLK kernels invalidates the fixture and requires
  regeneration. The drift-report tool will surface the kernel SHA changes;
  this script must be re-run as part of that workflow.

Inputs (read at runtime via the project's existing ``_kernel_io`` module):
- ``kernels/kernels-manifest.json`` — kernel paths + SHA pins.
- The LSK / SCLK / FK / CK kernels themselves (via ``furnsh`` chain).

Outputs:
- ``bake/out/l2-attitude-fixture.json`` — JSON array of records.

AC4 size cap: ≤ 2 MB committed. If exceeded, the script halves the per-window
sample count and re-emits (single retry; surfaced via stdout). Beyond a single
halving the script exits non-zero so CI can surface the regression rather than
silently shrinking the fixture below a useful sample density.

Canonical invocation::

    just l2-attitude-fixture
    # fallback (from `bake/`):
    uv run python -m src.l2_attitude_validation
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _kernel_io import load_manifest as load_kernel_manifest  # type: ignore[import-not-found]
    from _kernel_io import repo_root
    from ck_inventory import (  # noqa: E402
        ENCOUNTERS,
        V1_BUS,
        V1_SCAN_PLATFORM,
        V2_BODY,
        V2_BUS,
        V2_SCAN_PLATFORM,
        V1_BODY,
    )
else:
    from ._kernel_io import load_manifest as load_kernel_manifest
    from ._kernel_io import repo_root
    from .ck_inventory import (
        ENCOUNTERS,
        V1_BUS,
        V1_SCAN_PLATFORM,
        V2_BODY,
        V2_BUS,
        V2_SCAN_PLATFORM,
        V1_BODY,
    )

# Hand-mapped slug per ENCOUNTERS entry — must match ``ck_sample.SLUG_BY_LABEL``
# exactly so the fixture's ``ckWindow`` field aligns with the runtime
# manifest's per-encounter attitude file slug. Duplicated here rather than
# imported because ``ck_sample`` is bake-side and we keep this module's
# imports minimal to avoid spiceypy import-side-effects during unit testing.
SLUG_BY_LABEL: dict[str, str] = {
    "V1 Jupiter encounter (1979-03 closest approach 03-05)": "v1-jupiter",
    "V1 Saturn encounter (1980-11 closest approach 11-12)": "v1-saturn",
    "V1 Pale Blue Dot (1990-02-14 family portrait)": "pale-blue-dot",
    "V2 Jupiter encounter (1979-07 closest approach 07-09)": "v2-jupiter",
    "V2 Saturn encounter (1981-08 closest approach 08-25)": "v2-saturn",
    "V2 Uranus encounter (1986-01 closest approach 01-24)": "v2-uranus",
    "V2 Neptune encounter (1989-08 closest approach 08-25)": "v2-neptune",
}

# Per-window sample count. AC1 requires ≥ 500 pairs per spacecraft per CK
# coverage window. We start at 500 and halve once if the resulting JSON
# exceeds the AC4 2 MB cap; a single halving still satisfies the 250-floor
# documented as "at least 100 per window" in AC3's runtime-budget tradeoff.
DEFAULT_SAMPLES_PER_WINDOW = 500
MIN_SAMPLES_PER_WINDOW = 100  # AC3 budget tradeoff floor

# Fixed RNG seed — same as the L1 validator's ``ATTITUDE_RNG_SEED`` so the
# two layers are conceptually pinned together. Per-window draws use
# ``random.Random(seed + window_index)`` so the global state stays untouched
# and re-runs are deterministic even when window order is invariant.
RNG_SEED = 42

# Size cap per AC4. JSON-serialized fixture must be ≤ this on disk before
# compression. Larger than this triggers the halve-and-retry path.
MAX_FIXTURE_BYTES = 2 * 1024 * 1024  # 2 MB

# Reference frame for ``pxform`` / ``ckgp`` queries. J2000 matches the runtime
# AttitudeService's reference frame.
REFERENCE_FRAME = "J2000"

# Output paths.
DEFAULT_OUTPUT_NAME = "l2-attitude-fixture.json"

MAX_CKCOV_INTERVALS = 100000


@dataclass(frozen=True)
class L2Record:
    """One sample record in the emitted fixture.

    Fields are ordered to match the JSON layout (alphabetical by JSON key
    when ``json.dumps(sort_keys=True)`` is used — that ordering is reflected
    in the in-memory dataclass for clarity, but determinism comes from the
    dump options, not field order).
    """

    spacecraftId: int  # -31 or -32 (SPK SC ID; same value AttitudeService consumes)
    et: float  # Ephemeris time (TDB seconds past J2000), one of the ``DEFAULT_SAMPLES_PER_WINDOW`` draws
    ckWindow: str  # Chapter slug — e.g., "v1-jupiter"
    ground_truth_bus_quat: tuple[float, float, float, float]  # scalar-last [x, y, z, w]
    ground_truth_platform_quat: tuple[float, float, float, float]  # scalar-last [x, y, z, w]

    def to_jsonable(self) -> dict:
        return {
            "spacecraftId": self.spacecraftId,
            "et": self.et,
            "ckWindow": self.ckWindow,
            "ground_truth_bus_quat": list(self.ground_truth_bus_quat),
            "ground_truth_platform_quat": list(self.ground_truth_platform_quat),
        }


def _spice_scalar_first_to_three_scalar_last(
    q_spice: Iterable[float],
) -> tuple[float, float, float, float]:
    """Convert SPICE scalar-first ``[w, x, y, z]`` to Three.js scalar-last ``[x, y, z, w]``.

    Mirrors the AttitudeService decode-time permute (Story 3.2 § AC2). The
    fixture stores Three.js convention so the Vitest assertion path consumes
    ``q.x / q.y / q.z / q.w`` directly without a second permute.
    """
    q = list(q_spice)
    if len(q) != 4:
        raise ValueError(f"expected 4-component quaternion, got len={len(q)}")
    w, x, y, z = q
    return (float(x), float(y), float(z), float(w))


def _spacecraft_naif_for_struct(struct_id: int) -> int:
    """SPK SC ID for a given CK structure ID.

    Both V1 bus (-31000) and V1 scan platform (-31100) roll up to SPK ID -31;
    V2 equivalents roll up to -32. Mirrors ``ck_sample._spacecraft_tag``'s
    semantics but returns the integer SPK ID consumed by AttitudeService.

    Uses ``-(abs(struct_id) // 1000)`` truncate-toward-zero to handle the
    negative-flooring trap (see ck_sample.sample_window_with_mask comment).
    """
    return -(abs(struct_id) // 1000)


def _frame_name_for_bus(spacecraft_naif: int) -> str:
    """SPICE bus frame name string used in ``pxform`` calls.

    Voyager FK kernels (``kernels/vg{1,2}_v02.tf``) define the bus frames as
    ``VG1_SC_BUS`` and ``VG2_SC_BUS``. They are CK-driven (TK frames bound to
    the CK structure ID via the FK chain), so ``pxform(VG{n}_SC_BUS, J2000, et)``
    returns the same rotation that ``ckgp(struct_id, et)`` does for the bus
    structure — but goes through the FK chain rather than reading the CK
    directly. We use ``pxform`` for the bus per AC1's spec; the runtime
    AttitudeService consumes the CK-derived knots, but the L2 comparison
    target is the FK-anchored bus pointing.
    """
    if spacecraft_naif == V1_BODY:
        return "VG1_SC_BUS"
    if spacecraft_naif == V2_BODY:
        return "VG2_SC_BUS"
    raise ValueError(f"unknown spacecraft NAIF SPK ID: {spacecraft_naif}")


def _ckcov_windows(ck_path: Path, struct_id: int) -> list[tuple[float, float]]:
    """Return ``[(et_start, et_end), ...]`` coverage intervals for ``struct_id`` in ``ck_path``.

    Returns an empty list when the CK has no coverage for the structure ID.
    Mirrors ``ck_sample._ckcov_windows``.
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
    """Return the intersection of ``[a, b]`` with each coverage interval, dropping empties."""
    a, b = band
    out: list[tuple[float, float]] = []
    for cov_a, cov_b in coverage:
        lo = max(a, cov_a)
        hi = min(b, cov_b)
        if lo < hi:
            out.append((lo, hi))
    return out


def _intersect_two_coverages(
    a: list[tuple[float, float]],
    b: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    """Return the intersection of two interval lists.

    Used to compute ``(bus_coverage ∩ platform_coverage)`` — the band of
    ETs where both ckgp queries are guaranteed to succeed.

    Both inputs are assumed merged (no internal overlaps) and sorted; the
    output is also merged + sorted.
    """
    out: list[tuple[float, float]] = []
    i = 0
    j = 0
    while i < len(a) and j < len(b):
        lo = max(a[i][0], b[j][0])
        hi = min(a[i][1], b[j][1])
        if lo < hi:
            out.append((lo, hi))
        # Advance the interval that ends first.
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return out


def _merge_intervals(intervals: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Sort + merge overlapping intervals. Same logic as ``ck_sample.bake_attitude``."""
    if not intervals:
        return []
    intervals = sorted(intervals)
    merged: list[tuple[float, float]] = []
    for lo, hi in intervals:
        if merged and lo <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], hi))
        else:
            merged.append((lo, hi))
    return merged


def _sample_uniform_in_intervals(
    intervals: list[tuple[float, float]],
    n: int,
    rng: random.Random,
) -> list[float]:
    """Draw ``n`` ETs uniformly across the union of ``intervals``.

    The union is treated as a single 1-D measure: pick a uniform random length
    inside the total interval span, then map it onto the appropriate
    sub-interval. This ensures each ET inside the union is drawn with equal
    probability density (i.e., longer windows get proportionally more
    samples), which matches AC1's "uniformly at random within each window's
    coverage" wording when "window" is the merged-coverage union.

    Determinism: uses ``rng.random()`` (a passed-in ``random.Random`` instance),
    NOT the module-level ``random``, so the caller controls the seed exactly.
    """
    if not intervals or n <= 0:
        return []
    spans = [hi - lo for lo, hi in intervals]
    total = sum(spans)
    if total <= 0:
        return []

    out: list[float] = []
    for _ in range(n):
        u = rng.random() * total
        # Find the interval that contains the cumulative position `u`.
        cumulative = 0.0
        for (lo, hi), span in zip(intervals, spans):
            if u <= cumulative + span:
                # Position within this interval: u - cumulative.
                out.append(lo + (u - cumulative))
                break
            cumulative += span
        else:
            # Numerical edge case: u exactly hit the last cumulative — clamp.
            lo, hi = intervals[-1]
            out.append(hi)
    return out


def _bus_quat_at(spacecraft_naif: int, et: float) -> tuple[float, float, float, float]:
    """SpiceyPy ``pxform`` → ``m2q`` → permute → Three.js scalar-last quat.

    Direction matters: ``pxform(REF, BODY, et)`` (J2000 → VG1_SC_BUS) gives
    the C-matrix that transforms vectors from the reference frame to the
    body frame — the SAME direction that ``ckgp(struct_id, et)`` returns
    (per NAIF documentation: ckgp returns "the transformation matrix from
    the C-matrix's reference frame to the spacecraft frame at the given
    time"). The runtime AttitudeService consumes the bake's
    ``ck_sample.sample_window_pointing_only`` outputs which call
    ``ckgp(struct_id, ..., REFERENCE_FRAME='J2000')`` directly — so the L2
    ground truth must use the same direction. AC1 wrote
    ``pxform(VG{n}_SC_BUS, J2000, et)`` (frame order swapped), which gives
    the INVERSE transformation — wrong direction by 180° on most axes,
    surfacing as a ~3 rad angular-error failure of NFR-P10 (caught by
    the local AC8 smoke 2026-05-22 — see Story 3.7 Dev Agent Record for
    the diagnosis).

    The amended convention is ``pxform(REFERENCE_FRAME, body_frame, et)`` —
    AC1's wording is reconciled with the runtime convention; the L1
    validator at ``bake/src/validate_l1.py`` uses ckgp directly so it
    didn't surface this defect at the bake tier.
    """
    import spiceypy as spice

    frame = _frame_name_for_bus(spacecraft_naif)
    # Note frame ordering: REFERENCE_FRAME -> body_frame matches ckgp's
    # transformation direction. See block comment above for the diagnosis.
    cmat = spice.pxform(REFERENCE_FRAME, frame, float(et))
    q_spice = spice.m2q(cmat)  # scalar-first [w, x, y, z]
    return _spice_scalar_first_to_three_scalar_last(q_spice)


def _platform_quat_at(
    struct_id: int, et: float
) -> tuple[float, float, float, float] | None:
    """SpiceyPy ``ckgp`` → ``m2q`` → permute → Three.js scalar-last quat.

    Returns ``None`` when ``ckgp`` fails (e.g., a draw landed exactly on a
    coverage seam). The caller skips that record. We use ``ckgp`` (rather
    than ``pxform``) for the scan platform per AC1, because the platform CK
    is the canonical attitude source and the FK doesn't anchor a TK frame on
    the scan platform for V1 PBD-style sparse coverage.
    """
    import spiceypy as spice

    sc_id = _spacecraft_naif_for_struct(struct_id)
    sclkdp = spice.sce2c(sc_id, float(et))
    try:
        cmat, _clkout = spice.ckgp(struct_id, sclkdp, 0.0, REFERENCE_FRAME)
    except spice.utils.exceptions.SpiceyError:
        return None
    q_spice = spice.m2q(cmat)
    return _spice_scalar_first_to_three_scalar_last(q_spice)


def _bus_struct_for_spacecraft(spacecraft_naif: int) -> int:
    if spacecraft_naif == V1_BODY:
        return V1_BUS
    if spacecraft_naif == V2_BODY:
        return V2_BUS
    raise ValueError(f"unknown spacecraft NAIF: {spacecraft_naif}")


def _platform_struct_for_spacecraft(spacecraft_naif: int) -> int:
    if spacecraft_naif == V1_BODY:
        return V1_SCAN_PLATFORM
    if spacecraft_naif == V2_BODY:
        return V2_SCAN_PLATFORM
    raise ValueError(f"unknown spacecraft NAIF: {spacecraft_naif}")


def _furnish_kernels(repo: Path) -> None:
    """Furnish LSK / SCLK / FK / CK + the PCK that ``pxform`` chains can need.

    Mirrors ``validate_l1._furnish_kernels_with_ck`` (LSK + SCLK + FK + CK)
    plus PCK so the J2000 frame chain is fully resolved. Story 3.0 AC2 keeps
    the trajectory L1 pass narrow; for L2 we need the bus FK frame chain
    plus all CK coverage, so we include the full set required for ``pxform``
    on the bus frame.
    """
    import spiceypy as spice

    manifest_path = repo / "kernels" / "kernels-manifest.json"
    _, entries = load_kernel_manifest(manifest_path)
    priority = {"lsk": 0, "pck": 1, "sclk": 2, "fk": 3, "ck": 4}
    needed = [k for k in entries if k.kind in priority]
    needed.sort(key=lambda k: (priority[k.kind], k.file))
    for k in needed:
        target = (repo / k.target_path).resolve()
        if not target.exists():
            raise FileNotFoundError(
                f"kernel missing on disk: {target} -- run `just fetch-kernels` first"
            )
        spice.furnsh(str(target))


def _ck_paths_by_kind(repo: Path) -> list[Path]:
    """Resolve all CK kernel paths from the manifest."""
    manifest_path = repo / "kernels" / "kernels-manifest.json"
    _, entries = load_kernel_manifest(manifest_path)
    return [
        (repo / k.target_path).resolve()
        for k in sorted(entries, key=lambda k: k.file)
        if k.kind == "ck"
    ]


def _parse_utc(utc: str) -> str:
    """Strip the trailing 'Z' for SpiceyPy ``utc2et``."""
    return utc.rstrip("Z")


def generate_fixture_records(
    repo: Path,
    samples_per_window: int,
    rng_seed: int = RNG_SEED,
) -> list[L2Record]:
    """Generate per-(spacecraft, window) records.

    Walks ENCOUNTERS in declaration order. For each (encounter, spacecraft)
    tuple:
      1. Aggregate CK coverage across all CK kernels for the bus structure.
      2. Intersect coverage with closest-approach ± 2 days (the encounter
         band ``ck_sample.bake_attitude`` actually emits VTRJ samples for).
         This keeps the L2 sample distribution aligned with the runtime
         AttitudeService's CK chunk extents — sampling outside that band
         would land us in the synthesized regime, which is NOT the path we
         want to gate (per AC1 + Story 3.2 § AC5).
      3. Draw ``samples_per_window`` uniform ETs from the merged coverage.
      4. For each ET, compute ground-truth bus + platform quaternions and
         append a record. Skip records where either quaternion is None
         (e.g., the platform CK has a seam at that exact ET) — this is rare
         in practice but the loop tolerates it without spuriously failing.
    """
    import spiceypy as spice

    ck_paths = _ck_paths_by_kind(repo)
    if not ck_paths:
        raise RuntimeError("no CK kernels in kernels-manifest.json")

    # HALF_WIDTH_2DAY mirrors ck_sample.HALF_WIDTH_1MIN — the actual sample
    # band the bake emits for. We deliberately do NOT use the broader
    # encounter ±2-month window because the runtime AttitudeService's CK
    # files only cover closest-approach ± 2 days.
    HALF_WIDTH_2DAY = 172800.0  # seconds (matches ck_sample.HALF_WIDTH_1MIN)

    records: list[L2Record] = []

    # Per-window RNG: ``random.Random(seed + idx)`` keeps the global RNG
    # state untouched AND makes each window's draws independent of every
    # other window. If a future window is added or removed, only its draws
    # change — the others remain byte-stable.
    for window_idx, (label, t_start_utc, t_end_utc, scan_id, bus_id, closest_approach_utc) in enumerate(ENCOUNTERS):
        slug = SLUG_BY_LABEL.get(label)
        if slug is None:
            print(f"[WARN]   unknown label {label!r}; skipping", file=sys.stderr)
            continue

        closest_approach_et = spice.utc2et(_parse_utc(closest_approach_utc))
        band = (
            closest_approach_et - HALF_WIDTH_2DAY,
            closest_approach_et + HALF_WIDTH_2DAY,
        )

        for spacecraft_naif, struct_bus, struct_platform in (
            (V1_BODY, V1_BUS, V1_SCAN_PLATFORM),
            (V2_BODY, V2_BUS, V2_SCAN_PLATFORM),
        ):
            # ENCOUNTERS' bus_id is per-spacecraft already; skip mismatched
            # pairings (e.g., V1's V2 row).
            if (spacecraft_naif == V1_BODY and bus_id != V1_BUS) or (
                spacecraft_naif == V2_BODY and bus_id != V2_BUS
            ):
                continue

            # The PDS Rings Node ISS SEDR scan-platform CKs are TYPE-1
            # (discrete pointing records, one per image shutter event;
            # tens of thousands of zero-duration ckcov intervals per
            # encounter). The V1/V2 super CKs (bus) are continuous (type-3
            # or type-6). Per AC1's `ckgp(..., tol=0, ...)` wording, the
            # ground-truth platform query succeeds ONLY at the exact ETs
            # where the type-1 CK has a record.
            #
            # Sampling strategy (forced by the AC1 tol=0 constraint):
            #   - Read the platform CK's coverage as a discrete set of
            #     knot ETs (`a == b` per type-1 interval shape).
            #   - Filter those knots to the encounter's CA ± 2-day band.
            #   - Draw `samples_per_window` knots uniformly at random
            #     from the in-band set (or all of them if the set is
            #     smaller). Each chosen ET is by construction a tol=0
            #     match against the platform CK; the bus pxform query
            #     succeeds for any ET inside bus coverage, which the
            #     platform-coverage union is a strict subset of for
            #     encounter windows.
            #
            # "uniformly at random within each window's [et_start, et_end]"
            # (AC1) is interpreted as "uniformly at random from the
            # in-window CK record ETs" — the strictest tol=0 interpretation.
            # The alternative (uniform on the continuous band with a
            # non-zero ckgp tolerance) was rejected because AC1 pins tol=0.
            #
            # Windows with NO platform coverage (V1 PBD per
            # ckbrief-inventory.md) cannot emit L2 platform records —
            # excluded from the L2 fixture.
            platform_coverage: list[tuple[float, float]] = []
            for ck_path in ck_paths:
                platform_coverage.extend(_ckcov_windows(ck_path, struct_platform))
            platform_coverage = _merge_intervals(platform_coverage)

            if not platform_coverage:
                print(
                    f"[SKIP]   {slug} sc={spacecraft_naif}: no platform CK "
                    f"coverage (e.g., V1 PBD) -- cannot gate platform fidelity, "
                    f"window excluded from L2 fixture"
                )
                continue

            # Extract platform-CK knot ETs (start == end for type-1 records).
            # For each interval treat the start as the knot ET; this matches
            # what `sample_window_pointing_only(struct_platform, ...)` queries
            # against in `ck_sample.py`.
            platform_knot_ets = [a for (a, b) in platform_coverage]
            # Filter to the CA ± 2-day encounter band.
            in_band_knots = [
                et for et in platform_knot_ets if band[0] <= et <= band[1]
            ]
            if not in_band_knots:
                print(
                    f"[SKIP]   {slug} sc={spacecraft_naif}: no platform CK "
                    f"records in CA+/-2d band"
                )
                continue

            # Independent RNG per (window, spacecraft) — additive seed offset
            # keeps the draws decorrelated and re-runs deterministic.
            rng = random.Random(rng_seed + window_idx * 2 + (0 if spacecraft_naif == V1_BODY else 1))
            if len(in_band_knots) <= samples_per_window:
                # Window has fewer knots than the requested sample count;
                # keep all of them (rare for the dense PDS Rings CKs but
                # handled defensively).
                chosen_ets = sorted(in_band_knots)
            else:
                chosen_ets = sorted(rng.sample(in_band_knots, k=samples_per_window))

            n_kept = 0
            n_dropped_bus = 0
            n_dropped_platform = 0
            for et in chosen_ets:
                bus_quat = _bus_quat_at(spacecraft_naif, et)
                platform_quat = _platform_quat_at(struct_platform, et)
                if platform_quat is None:
                    # Should never happen — every chosen ET is a tol=0
                    # match by construction. Defensive count for telemetry.
                    n_dropped_platform += 1
                    continue
                if bus_quat is None:
                    n_dropped_bus += 1
                    continue
                records.append(
                    L2Record(
                        spacecraftId=spacecraft_naif,
                        et=float(et),
                        ckWindow=slug,
                        ground_truth_bus_quat=bus_quat,
                        ground_truth_platform_quat=platform_quat,
                    )
                )
                n_kept += 1

            print(
                f"[OK]     {slug} sc={spacecraft_naif}: kept {n_kept} / "
                f"{len(chosen_ets)} (in-band knots={len(in_band_knots)}; "
                f"dropped {n_dropped_bus} bus-gap + "
                f"{n_dropped_platform} platform-gap)"
            )

    # Sort the entire emission by (spacecraftId, et) ascending for byte-stable
    # JSON output. AC1 explicitly calls this out.
    records.sort(key=lambda r: (r.spacecraftId, r.et))
    return records


def write_fixture(records: list[L2Record], out_path: Path) -> int:
    """Serialize ``records`` to ``out_path`` and return the on-disk byte size.

    Uses ``json.dumps(sort_keys=True, indent=2)`` for diff stability. The
    fixture is plain JSON (not brotli-compressed) so the Vitest test can
    consume it via ``JSON.parse`` without a decompressor on the test path.
    """
    payload = [r.to_jsonable() for r in records]
    text = json.dumps(payload, sort_keys=True, indent=2) + "\n"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8", newline="\n")
    return out_path.stat().st_size


def generate(
    root: Path | None = None,
    out_dir: Path | None = None,
    samples_per_window: int = DEFAULT_SAMPLES_PER_WINDOW,
) -> int:
    """Run the L2 fixture generator. Returns process exit code.

    Honors the AC4 2-MB size cap with a single halve-and-retry. Beyond a
    single halving the script exits non-zero — a fixture below
    ``MIN_SAMPLES_PER_WINDOW`` is no longer a meaningful gate, and a runaway
    JSON size points at a real correctness defect (e.g., something started
    serializing the manifest into each record) that we want to surface.
    """
    try:
        import spiceypy as spice  # noqa: F401  (imported for kclear in finally)
    except ImportError as exc:
        print(f"[FAIL] spiceypy not importable: {exc}", file=sys.stderr)
        return 1

    repo = (root or repo_root()).resolve()
    out = (out_dir or (repo / "bake" / "out")).resolve()
    out_path = out / DEFAULT_OUTPUT_NAME

    spice.kclear()
    try:
        _furnish_kernels(repo)

        records = generate_fixture_records(repo, samples_per_window)
        if not records:
            print(
                "[FAIL] no L2 records generated — every window dropped",
                file=sys.stderr,
            )
            return 1

        size_bytes = write_fixture(records, out_path)
        print(
            f"[OK]     {out_path}: {len(records)} records, {size_bytes:,} bytes "
            f"({size_bytes / 1024 / 1024:.2f} MB, cap {MAX_FIXTURE_BYTES / 1024 / 1024:.0f} MB)"
        )

        if size_bytes > MAX_FIXTURE_BYTES:
            halved = max(samples_per_window // 2, MIN_SAMPLES_PER_WINDOW)
            if halved < samples_per_window:
                print(
                    f"[WARN]   size cap exceeded; halving samples_per_window "
                    f"{samples_per_window} -> {halved} and re-emitting once"
                )
                records = generate_fixture_records(repo, halved)
                size_bytes = write_fixture(records, out_path)
                print(
                    f"[OK]     {out_path} (halved): {len(records)} records, "
                    f"{size_bytes:,} bytes"
                )
                if size_bytes > MAX_FIXTURE_BYTES:
                    print(
                        f"[FAIL] size cap still exceeded after halve "
                        f"({size_bytes:,} > {MAX_FIXTURE_BYTES:,}); "
                        f"escalate (ADR-0011 Git LFS routing or sample-count "
                        f"renegotiation)",
                        file=sys.stderr,
                    )
                    return 1
            else:
                print(
                    f"[FAIL] size cap exceeded but cannot halve below floor "
                    f"({samples_per_window} <= {MIN_SAMPLES_PER_WINDOW})",
                    file=sys.stderr,
                )
                return 1

        return 0
    finally:
        spice.kclear()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate the L2 JS-vs-SPICE attitude fixture (Story 3.7)."
    )
    parser.add_argument("--root", type=Path, default=None, help="Repo root (default: auto)")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="bake output dir (default: <repo>/bake/out)",
    )
    parser.add_argument(
        "--samples-per-window",
        type=int,
        default=DEFAULT_SAMPLES_PER_WINDOW,
        help=f"Per-(window, spacecraft) sample count (default: {DEFAULT_SAMPLES_PER_WINDOW})",
    )
    args = parser.parse_args(argv)
    return generate(
        root=args.root,
        out_dir=args.out_dir,
        samples_per_window=args.samples_per_window,
    )


if __name__ == "__main__":
    sys.exit(main())
