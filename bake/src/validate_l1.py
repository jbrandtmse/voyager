"""Layer-1 Python validation harness for the trajectory + attitude bakes.

**Trajectory (Story 1.4):** for each trajectory VTRJ in the manifest, samples
a dense SPICE reference grid (≥10× denser than the segment's bake cadence),
interpolates via `scipy.interpolate.CubicHermiteSpline` over each Cartesian
axis using positions + velocities, computes max + RMS Euclidean position error
in km. Asserts NFR-P9 thresholds per segment::

    max position error <= 20 km
    RMS position error <= 5 km

**Attitude (Story 3.1 AC5):** for each attitude VTRJ in the manifest, samples
``K`` random in-bounds ETs from a seeded RNG, interpolates the baked quaternion
stream via `scipy.spatial.transform.Slerp`, queries SpiceyPy `ckgp` at the
same ETs for the SPICE-canonical orientation, computes the rotation-angle
delta between the two quaternions. Asserts NFR-P10::

    max angle error <= 1.0 mrad (≤ 0.05°)

The L1 attitude check is the **bake-tier** defense (offline SciPy vs offline
SpiceyPy). Story 3.7's L2 validator is the **runtime-tier** defense
(real-browser Three.js SLERP vs offline SpiceyPy via CI fixture). These are
different layers per ADR-0010 Layer-1 / Layer-2 distinction.

Writes a markdown summary to `bake/out/validation-report.md` with one row per
(body, segment) for trajectories and one row per (body, window) for attitudes.
Exits non-zero if any row breaches its threshold.

Canonical invocation::

    just validate
    # fallback (from `bake/`):
    uv run python -m src.validate_l1
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.interpolate import CubicHermiteSpline
from scipy.spatial.transform import Rotation, Slerp

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _kernel_io import load_manifest as load_kernel_manifest  # type: ignore[import-not-found]
    from _kernel_io import repo_root
    from ck_inventory import V1_BUS, V1_SCAN_PLATFORM, V2_BUS, V2_SCAN_PLATFORM  # noqa: E402
    from manifest_writer import load_manifest as load_bake_manifest  # noqa: E402
    from vtrj_writer import read_vtrj  # noqa: E402
else:
    from ._kernel_io import load_manifest as load_kernel_manifest
    from ._kernel_io import repo_root
    from .ck_inventory import V1_BUS, V1_SCAN_PLATFORM, V2_BUS, V2_SCAN_PLATFORM
    from .manifest_writer import load_manifest as load_bake_manifest
    from .vtrj_writer import read_vtrj

MAX_POS_ERROR_KM = 20.0  # NFR-P9
RMS_POS_ERROR_KM = 5.0  # NFR-P9

# Story 3.1 AC5: NFR-P10 — attitude max angle error ≤ 1 mrad (≤ 0.05°).
MAX_ATTITUDE_ERROR_MRAD = 1.0

# K = 100 random in-bounds ETs per attitude window (AC5 T6.2). Fixed seed for
# determinism (NFR-R4 + AC5 wording — "the seed for random ET sampling is
# FIXED so the validation report is deterministic").
ATTITUDE_SAMPLES_PER_WINDOW = 100
ATTITUDE_RNG_SEED = 42

# Reference grid density: at least 10x denser than the segment's bake cadence.
# We use a multiplier rather than a fixed cadence because per-segment bake
# cadences range from 60s (encounters) to 86400s (cruise).
REFERENCE_DENSITY_MULTIPLIER = 10

# Map an attitude file's body_id (CK structure ID) back to its SPICE SC ID.
# -31000 / -31100 → -31; -32000 / -32100 → -32. Used to map between attitude
# VTRJ headers and the per-spacecraft furnish chain. Defined here rather than
# importing from ck_inventory because validate_l1's furnish ordering is
# different (Story 3.0 AC2 explicitly excludes ck kernels from the L1
# trajectory furnish — the attitude check below re-furnishes them).
_CK_STRUCTURE_IDS = frozenset({V1_BUS, V1_SCAN_PLATFORM, V2_BUS, V2_SCAN_PLATFORM})


def _is_attitude_body_id(body_id: int) -> bool:
    return body_id in _CK_STRUCTURE_IDS


@dataclass(frozen=True)
class SegmentError:
    """Per-segment validation result."""

    naif_id: int
    body_name: str
    segment_index: int  # 1-based
    file_name: str
    et_start: float
    et_end: float
    utc_start: str
    utc_end: str
    bake_cadence_sec: float
    reference_cadence_sec: float
    sample_count_bake: int
    sample_count_reference: int
    max_error_km: float
    rms_error_km: float
    worst_error_et: float
    worst_error_utc: str

    @property
    def passed(self) -> bool:
        return self.max_error_km <= MAX_POS_ERROR_KM and self.rms_error_km <= RMS_POS_ERROR_KM


@dataclass(frozen=True)
class AttitudeWindowError:
    """Per-(body, attitude-window) validation result (Story 3.1 AC5, NFR-P10).

    The window is identified by the VTRJ file name + the CK structure ID
    (body_id in the header). `samples` is the K random in-bounds ETs the
    validator sampled at.
    """

    spacecraft_naif_id: int  # -31 / -32 (parent SPK ID)
    body_name: str  # "Voyager 1" / "Voyager 2"
    struct_id: int  # CK structure ID from VTRJ header (-31000 / -31100 / -32000 / -32100)
    kind: str  # "bus_attitude" / "platform_attitude" (from manifest entry)
    file_name: str
    et_start: float
    et_end: float
    utc_start: str
    utc_end: str
    samples: int
    max_angle_error_mrad: float
    rms_angle_error_mrad: float
    worst_error_et: float
    worst_error_utc: str

    @property
    def passed(self) -> bool:
        return self.max_angle_error_mrad <= MAX_ATTITUDE_ERROR_MRAD


def _furnish_kernels(repo: Path) -> None:
    """Re-furnish the kernel set the L1 trajectory validator needs.

    Story 3.0 AC2: `ck` kernels are NOT furnished here. The L1 trajectory
    validator queries `spkgeo` for trajectory consistency; `ck` (attitude)
    kernels are unused by that path. Story 3.1 AC5 adds an attitude pass
    that DOES need ck kernels — `_furnish_kernels_with_ck` below handles that
    extension. Both functions share the kinds-narrowing matching
    `bake_trajectories.py`.
    """
    import spiceypy as spice

    manifest_path = repo / "kernels" / "kernels-manifest.json"
    _, entries = load_kernel_manifest(manifest_path)
    priority = {"lsk": 0, "pck": 1, "fk": 2, "sclk": 3, "spk": 4}
    needed = [k for k in entries if k.kind in priority]
    needed.sort(key=lambda k: (priority[k.kind], k.file))
    for k in needed:
        target = (repo / k.target_path).resolve()
        if not target.exists():
            raise FileNotFoundError(
                f"kernel missing on disk: {target} -- run `just fetch-kernels` first"
            )
        spice.furnsh(str(target))


def _furnish_kernels_with_ck(repo: Path) -> None:
    """Furnish LSK / SCLK / FK / CK for the attitude L1 validator (Story 3.1 AC5).

    This is a SUPERSET of `_furnish_kernels` (no PCK/SPK — attitude validation
    only needs the CK frame chain), so the two are called separately by the
    validate() pipeline. The trajectory pass furnishes one set; we clear and
    re-furnish for the attitude pass. The cost is bounded (tens of MB) and the
    layer separation matches Story 3.0 AC2's discipline.
    """
    import spiceypy as spice

    manifest_path = repo / "kernels" / "kernels-manifest.json"
    _, entries = load_kernel_manifest(manifest_path)
    priority = {"lsk": 0, "sclk": 1, "fk": 2, "ck": 3}
    needed = [k for k in entries if k.kind in priority]
    needed.sort(key=lambda k: (priority[k.kind], k.file))
    for k in needed:
        target = (repo / k.target_path).resolve()
        if not target.exists():
            raise FileNotFoundError(
                f"kernel missing on disk: {target} -- run `just fetch-kernels` first"
            )
        spice.furnsh(str(target))


def _interpolate_segment(
    et_bake: np.ndarray, samples: np.ndarray, et_reference: np.ndarray
) -> np.ndarray:
    """CubicHermiteSpline over each axis using positions + velocities."""
    positions = samples[:, 0:3]
    velocities = samples[:, 3:6]
    out = np.empty((et_reference.size, 3), dtype=np.float64)
    for axis in range(3):
        spline = CubicHermiteSpline(
            x=et_bake,
            y=positions[:, axis],
            dydx=velocities[:, axis],
            extrapolate=False,
        )
        out[:, axis] = spline(et_reference)
    return out


def _reference_states(naif_id: int, et_grid: np.ndarray) -> np.ndarray:
    """Query `spkgeo` at every ET in `et_grid`; return (N, 3) reference positions in km."""
    import spiceypy as spice

    out = np.empty((et_grid.size, 3), dtype=np.float64)
    for i, et in enumerate(et_grid):
        state, _ = spice.spkgeo(targ=naif_id, et=float(et), ref="ECLIPJ2000", obs=0)
        out[i] = state[0:3]
    return out


def _validate_segment(
    naif_id: int,
    body_name: str,
    segment_index: int,
    file_name: str,
    vtrj_path: Path,
    bake_cadence_sec: float,
) -> SegmentError:
    """Run reference-vs-interpolated comparison for one segment."""
    import spiceypy as spice

    header, samples = read_vtrj(vtrj_path)
    if header["body_id"] != naif_id:
        raise ValueError(
            f"body_id mismatch in {file_name}: manifest says {naif_id}, header says {header['body_id']}"
        )
    sample_count_bake = int(header["sample_count"])
    et_start = float(header["et_start"])
    et_end = float(header["et_end"])

    # Bake ET grid mirrors the linspace used at bake time (exact endpoints).
    et_bake = np.linspace(et_start, et_end, sample_count_bake, dtype=np.float64)

    # Reference grid: 10x denser than bake. We sample strictly inside the
    # segment (avoid the boundary ETs themselves, where spkgeo may return the
    # adjacent segment's discontinuous value). The bake also inset its
    # endpoint samples by `boundary_inset`; mirror that here.
    n_ref = (sample_count_bake - 1) * REFERENCE_DENSITY_MULTIPLIER + 1
    span = et_end - et_start
    boundary_inset = min(0.01, span * 1e-9)
    et_ref = np.linspace(
        et_start + boundary_inset, et_end - boundary_inset, n_ref, dtype=np.float64
    )
    reference_cadence_sec = (et_end - et_start) / (n_ref - 1)

    interpolated = _interpolate_segment(et_bake, samples, et_ref)
    reference = _reference_states(naif_id, et_ref)

    diff = interpolated - reference
    errors = np.linalg.norm(diff, axis=1)
    max_idx = int(np.argmax(errors))
    max_error_km = float(errors[max_idx])
    rms_error_km = float(np.sqrt(np.mean(errors**2)))
    worst_et = float(et_ref[max_idx])
    worst_utc = spice.et2utc(worst_et, "ISOC", 0)

    return SegmentError(
        naif_id=naif_id,
        body_name=body_name,
        segment_index=segment_index,
        file_name=file_name,
        et_start=et_start,
        et_end=et_end,
        utc_start=spice.et2utc(et_start, "ISOC", 0),
        utc_end=spice.et2utc(et_end, "ISOC", 0),
        bake_cadence_sec=bake_cadence_sec,
        reference_cadence_sec=reference_cadence_sec,
        sample_count_bake=sample_count_bake,
        sample_count_reference=int(et_ref.size),
        max_error_km=max_error_km,
        rms_error_km=rms_error_km,
        worst_error_et=worst_et,
        worst_error_utc=worst_utc,
    )


def _ckgp_quaternions_at_ets(
    struct_id: int, ets: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Query SpiceyPy `ckgp` at every ET, returning (quaternions, kept_mask).

    Returns ``(samples, kept_mask)`` where ``samples`` is ``(K, 4)`` float64
    in SPICE scalar-first convention ``[w, x, y, z]`` and ``kept_mask`` is the
    boolean mask of grid indices where `ckgp` returned found=True. Caller uses
    the mask to derive matching ETs for the SciPy SLERP comparison.
    """
    import spiceypy as spice

    if ets.size == 0:
        return np.zeros((0, 4), dtype=np.float64), np.zeros(0, dtype=bool)

    n = int(ets.size)
    out = np.empty((n, 4), dtype=np.float64)
    mask = np.zeros(n, dtype=bool)
    # Truncate-toward-zero, not Python's floor-division (which would route
    # -31100 to SC=-32 due to negative-flooring). Magnitude-divide-then-resign
    # gives -31 for both -31000 and -31100, -32 for both -32000 and -32100.
    sc_id = -(abs(struct_id) // 1000)
    for i in range(n):
        et = float(ets[i])
        sclkdp = spice.sce2c(sc_id, et)
        # SpiceyPy 8.1.0 with found_check=True (default): ckgp returns
        # (cmat, clkout) on success and raises SpiceyError on not-found.
        try:
            cmat, _clkout = spice.ckgp(struct_id, sclkdp, 0.0, "J2000")
        except spice.utils.exceptions.SpiceyError:
            continue
        q = spice.m2q(cmat)  # SPICE scalar-first [w, x, y, z]
        out[i] = q
        mask[i] = True
    return out[mask], mask


def _angle_between_quaternions_mrad(q_a: np.ndarray, q_b: np.ndarray) -> np.ndarray:
    """Per-row rotation-angle (in milliradians) between two quaternion arrays.

    Both inputs are ``(N, 4)`` unit quaternions in any consistent convention
    (SPICE scalar-first or scalar-last — the dot-product magnitude is
    convention-independent). Returns ``(N,)`` float64 in mrad.

    Formula: ``theta = 2 * arccos(|dot(q_a, q_b)|)``; the absolute value handles
    the sign ambiguity (``-q`` represents the same rotation as ``q``), so the
    result is the *short-way* angle between the two orientations.
    """
    dots = np.clip(np.abs(np.sum(q_a * q_b, axis=1)), 0.0, 1.0)
    theta_rad = 2.0 * np.arccos(dots)
    return theta_rad * 1000.0  # rad → mrad


def _slerp_at_ets(
    knot_ets: np.ndarray, knot_quats_spice: np.ndarray, query_ets: np.ndarray
) -> np.ndarray:
    """SciPy SLERP interpolant at `query_ets`, returning SPICE-convention quaternions.

    `knot_quats_spice` is ``(K, 4)`` in SPICE scalar-first convention. SciPy's
    `Rotation.from_quat` consumes scalar-LAST, so we permute here. The output
    is permuted back to scalar-first for downstream `_angle_between_quaternions`
    comparison.
    """
    if knot_ets.size < 2:
        # SciPy Slerp needs at least 2 knots; for K<2 return NaNs of right shape.
        return np.full((query_ets.size, 4), np.nan, dtype=np.float64)

    # SPICE → scalar-last for scipy
    knot_quats_xyzw = np.column_stack(
        [knot_quats_spice[:, 1], knot_quats_spice[:, 2], knot_quats_spice[:, 3], knot_quats_spice[:, 0]]
    )
    rot_knots = Rotation.from_quat(knot_quats_xyzw)
    slerp = Slerp(knot_ets, rot_knots)
    rot_query = slerp(query_ets)
    out_xyzw = rot_query.as_quat()
    # scalar-last → SPICE scalar-first
    out_spice = np.column_stack(
        [out_xyzw[:, 3], out_xyzw[:, 0], out_xyzw[:, 1], out_xyzw[:, 2]]
    )
    return out_spice


def _validate_attitude_window(
    spacecraft_naif_id: int,
    body_name: str,
    kind: str,
    file_name: str,
    vtrj_path: Path,
) -> AttitudeWindowError:
    """Run SLERP-vs-ckgp accuracy comparison for one attitude VTRJ (AC5)."""
    import spiceypy as spice

    header, body = read_vtrj(vtrj_path)
    assert header["kind"] == "attitude", (
        f"{file_name}: expected attitude VTRJ, header kind={header['kind']!r}"
    )
    struct_id = int(header["body_id"])
    et_start = float(header["et_start"])
    et_end = float(header["et_end"])

    # ADR-0004 § Body Layout per Kind (Story 3.1 amendment 2026-05-21): attitude
    # VTRJs store (N, 5) rows = [et, qw, qx, qy, qz] per sample. Column 0 is the
    # explicit per-sample ET; columns 1-4 are the SPICE scalar-first quaternion.
    # The variable-cadence schedule is preserved inline so SLERP knot positions
    # are mathematically exact (no linspace approximation).
    knot_ets = body[:, 0].astype(np.float64)
    samples = body[:, 1:5].astype(np.float64)

    # K random in-bounds ETs from seeded RNG (AC5 determinism contract).
    rng = np.random.default_rng(seed=ATTITUDE_RNG_SEED)
    # Avoid the exact endpoints so SciPy Slerp's interior contract holds and
    # ckgp doesn't return the boundary sample's discontinuous value.
    boundary_inset = max(1e-6, (et_end - et_start) * 1e-9)
    query_ets = rng.uniform(
        et_start + boundary_inset, et_end - boundary_inset, size=ATTITUDE_SAMPLES_PER_WINDOW
    )
    query_ets.sort()  # sorted for deterministic-output ordering

    # SciPy SLERP at the query ETs (from the baked walked knots).
    q_slerp_spice = _slerp_at_ets(knot_ets, samples, query_ets)

    # SpiceyPy ckgp at the same ETs.
    q_ckgp_spice, kept_mask = _ckgp_quaternions_at_ets(struct_id, query_ets)

    # Only compare where ckgp succeeded.
    if not np.any(kept_mask):
        # All ckgp queries failed — no usable comparison samples. Mark as a
        # failing window with NaN errors so the validator surfaces it.
        utc_a = spice.et2utc(et_start, "ISOC", 0)
        utc_b = spice.et2utc(et_end, "ISOC", 0)
        return AttitudeWindowError(
            spacecraft_naif_id=spacecraft_naif_id,
            body_name=body_name,
            struct_id=struct_id,
            kind=kind,
            file_name=file_name,
            et_start=et_start,
            et_end=et_end,
            utc_start=utc_a,
            utc_end=utc_b,
            samples=0,
            max_angle_error_mrad=float("nan"),
            rms_angle_error_mrad=float("nan"),
            worst_error_et=et_start,
            worst_error_utc=utc_a,
        )

    q_slerp_kept = q_slerp_spice[kept_mask]
    query_ets_kept = query_ets[kept_mask]
    errors_mrad = _angle_between_quaternions_mrad(q_slerp_kept, q_ckgp_spice)
    max_idx = int(np.argmax(errors_mrad))
    max_error_mrad = float(errors_mrad[max_idx])
    rms_error_mrad = float(np.sqrt(np.mean(errors_mrad**2)))
    worst_et = float(query_ets_kept[max_idx])

    return AttitudeWindowError(
        spacecraft_naif_id=spacecraft_naif_id,
        body_name=body_name,
        struct_id=struct_id,
        kind=kind,
        file_name=file_name,
        et_start=et_start,
        et_end=et_end,
        utc_start=spice.et2utc(et_start, "ISOC", 0),
        utc_end=spice.et2utc(et_end, "ISOC", 0),
        samples=int(np.sum(kept_mask)),
        max_angle_error_mrad=max_error_mrad,
        rms_angle_error_mrad=rms_error_mrad,
        worst_error_et=worst_et,
        worst_error_utc=spice.et2utc(worst_et, "ISOC", 0),
    )


def _render_report(
    results: list[SegmentError],
    attitude_results: list[AttitudeWindowError],
    report_path: Path,
) -> None:
    """Write `bake/out/validation-report.md` with trajectory + attitude sections."""
    lines: list[str] = []
    lines.append("# Layer-1 Validation Report (Per-Segment)")
    lines.append("")
    lines.append(
        "Reference: SpiceyPy `spkgeo` on a per-segment dense grid (10x denser than each "
        "segment's bake cadence). Interpolant: `scipy.interpolate.CubicHermiteSpline` "
        "over each Cartesian axis using positions + velocities from the VTRJ bake. "
        "Errors are Euclidean position deltas in km."
    )
    lines.append("")
    lines.append(
        "Per-segment chunking is the architectural answer to SPK segment-boundary "
        "discontinuities in the merged Voyager kernels: a single Cubic Hermite spline "
        "cannot bridge the 2-million-km position jumps that the merged SPKs contain at "
        "stitch points. See story 1.4 Dev Agent Record for the diagnostic."
    )
    lines.append("")
    lines.append(
        f"**Thresholds (NFR-P9, per segment):** max <= {MAX_POS_ERROR_KM:.1f} km, "
        f"RMS <= {RMS_POS_ERROR_KM:.1f} km"
    )
    lines.append("")
    lines.append(
        "| Body | Seg | UTC range | Bake cadence (s) | Bake samples | Ref samples | "
        "Max err (km) | RMS err (km) | Worst-error UTC | Pass |"
    )
    lines.append(
        "|------|-----|-----------|------------------|--------------|-------------|"
        "--------------|--------------|-----------------|------|"
    )
    for r in results:
        verdict = "PASS" if r.passed else "FAIL"
        lines.append(
            f"| {r.body_name} | {r.segment_index:02d} | {r.utc_start} -> {r.utc_end} | "
            f"{r.bake_cadence_sec:.1f} | {r.sample_count_bake} | {r.sample_count_reference} | "
            f"{r.max_error_km:.6f} | {r.rms_error_km:.6f} | {r.worst_error_utc} | {verdict} |"
        )
    lines.append("")
    lines.append("## Trajectory summary")
    lines.append("")
    traj_overall = all(r.passed for r in results)
    n_pass = sum(1 for r in results if r.passed)
    lines.append(
        f"Trajectory: **{'PASS' if traj_overall else 'FAIL'}** "
        f"({n_pass}/{len(results)} segments)"
    )
    if not traj_overall:
        lines.append("")
        lines.append("Failing segments:")
        for r in results:
            if not r.passed:
                lines.append(
                    f"- {r.body_name} seg{r.segment_index:02d}: "
                    f"max={r.max_error_km:.3f} km, RMS={r.rms_error_km:.3f} km"
                )

    # === Story 3.1 AC5: Attitude accuracy section =========================
    lines.append("")
    lines.append("## Attitude accuracy (Story 3.1 AC5, NFR-P10)")
    lines.append("")
    lines.append(
        "Reference: SpiceyPy `ckgp` at K random in-bounds ETs per attitude window. "
        "Interpolant: `scipy.spatial.transform.Slerp` over the baked walked-quaternion "
        "knots reconstructed via `np.linspace(et_start, et_end, N)`. Per-sample error "
        "is the short-way rotation angle between the SLERP and `ckgp` quaternions "
        "in milliradians. K = "
        f"{ATTITUDE_SAMPLES_PER_WINDOW}, RNG seed = {ATTITUDE_RNG_SEED} (NFR-R4 "
        "deterministic report)."
    )
    lines.append("")
    lines.append(
        f"**Threshold (NFR-P10):** max angle error <= {MAX_ATTITUDE_ERROR_MRAD:.1f} mrad "
        f"(<= {MAX_ATTITUDE_ERROR_MRAD * 0.0573:.4f}°)."
    )
    lines.append("")
    lines.append(
        "_The L1 attitude check is the bake-tier defense (offline SciPy vs offline "
        "SpiceyPy). Story 3.7's L2 JS-vs-SPICE validator is the runtime-tier defense "
        "— different layers per ADR-0010._"
    )
    lines.append("")
    if attitude_results:
        lines.append(
            "| Body | Window | UTC range | Samples | Max err (mrad) | RMS err (mrad) | "
            "Worst-error UTC | Pass |"
        )
        lines.append(
            "|------|--------|-----------|---------|----------------|----------------|"
            "-----------------|------|"
        )
        for a in attitude_results:
            verdict = "PASS" if a.passed else "FAIL"
            # Window label: derive from kind + struct_id for readability.
            window_label = f"{a.kind} (struct {a.struct_id})"
            lines.append(
                f"| {a.body_name} | {window_label} | {a.utc_start} -> {a.utc_end} | "
                f"{a.samples} | {a.max_angle_error_mrad:.6f} | "
                f"{a.rms_angle_error_mrad:.6f} | {a.worst_error_utc} | {verdict} |"
            )
        lines.append("")
        attitude_overall = all(a.passed for a in attitude_results)
        n_att_pass = sum(1 for a in attitude_results if a.passed)
        lines.append("## Attitude summary")
        lines.append("")
        lines.append(
            f"Attitude: **{'PASS' if attitude_overall else 'FAIL'}** "
            f"({n_att_pass}/{len(attitude_results)} windows)"
        )
        if not attitude_overall:
            lines.append("")
            lines.append("Failing windows:")
            for a in attitude_results:
                if not a.passed:
                    lines.append(
                        f"- {a.body_name} {a.kind} (struct {a.struct_id}): "
                        f"max={a.max_angle_error_mrad:.4f} mrad, "
                        f"RMS={a.rms_angle_error_mrad:.4f} mrad"
                    )
    else:
        lines.append("_No attitude VTRJ files found in manifest._")

    lines.append("")
    lines.append("## Overall summary")
    lines.append("")
    overall_pass = all(r.passed for r in results) and all(
        a.passed for a in attitude_results
    )
    lines.append(f"Overall: **{'PASS' if overall_pass else 'FAIL'}**")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def validate(
    root: Path | None = None,
    out_dir: Path | None = None,
) -> int:
    """Run the L1 harness. Returns 0 if all segments pass, 1 otherwise."""
    try:
        import spiceypy as spice
    except ImportError as exc:
        print(f"[FAIL] spiceypy not importable: {exc}", file=sys.stderr)
        return 1

    repo = (root or repo_root()).resolve()
    out = (out_dir or (repo / "bake" / "out")).resolve()
    bake_manifest_path = out / "manifest.json"
    if not bake_manifest_path.exists():
        print(
            f"[FAIL] bake manifest missing: {bake_manifest_path} -- run `just bake` first",
            file=sys.stderr,
        )
        return 1

    bake_manifest = load_bake_manifest(bake_manifest_path)

    spice.kclear()
    try:
        # === Pass 1: trajectory validation (Story 1.4 baseline) ============
        _furnish_kernels(repo)

        results: list[SegmentError] = []
        attitude_files_to_check: list[tuple[int, str, str, Path]] = []
        for body in bake_manifest["bodies"]:
            naif_id = int(body["naifId"])
            body_name = body["name"]
            seg_idx = 0
            for file_entry in body["files"]:
                kind = str(file_entry.get("kind", "trajectory"))
                vtrj_path = (out / Path(file_entry["url"]).name).resolve()
                if not vtrj_path.exists():
                    print(f"[FAIL] VTRJ missing: {vtrj_path}", file=sys.stderr)
                    return 1
                if kind == "trajectory":
                    seg_idx += 1
                    bake_cadence = float(file_entry["cadenceSec"])
                    print(f"[VAL]    {body_name} seg{seg_idx:02d} ({vtrj_path.name}) ...")
                    seg_err = _validate_segment(
                        naif_id=naif_id,
                        body_name=body_name,
                        segment_index=seg_idx,
                        file_name=vtrj_path.name,
                        vtrj_path=vtrj_path,
                        bake_cadence_sec=bake_cadence,
                    )
                    results.append(seg_err)
                    marker = "OK" if seg_err.passed else "FAIL"
                    print(
                        f"         [{marker}] max={seg_err.max_error_km:.6f} km  "
                        f"rms={seg_err.rms_error_km:.6f} km  worst@{seg_err.worst_error_utc}"
                    )
                elif kind in ("bus_attitude", "platform_attitude"):
                    # Defer to pass 2 (requires CK furnish chain).
                    attitude_files_to_check.append(
                        (naif_id, body_name, kind, vtrj_path)
                    )
                # Other kinds (e.g., "chapter") are out of scope for this story.

        # === Pass 2: attitude validation (Story 3.1 AC5) ===================
        attitude_results: list[AttitudeWindowError] = []
        if attitude_files_to_check:
            # Re-furnish with CK kernels for the attitude pass. Story 3.0 AC2
            # kept ck out of the trajectory pass; we add them now for the
            # attitude pass only.
            spice.kclear()
            _furnish_kernels_with_ck(repo)
            for naif_id, body_name, kind, vtrj_path in attitude_files_to_check:
                print(f"[VAL]    {body_name} {kind} ({vtrj_path.name}) ...")
                a_err = _validate_attitude_window(
                    spacecraft_naif_id=naif_id,
                    body_name=body_name,
                    kind=kind,
                    file_name=vtrj_path.name,
                    vtrj_path=vtrj_path,
                )
                attitude_results.append(a_err)
                marker = "OK" if a_err.passed else "FAIL"
                print(
                    f"         [{marker}] max={a_err.max_angle_error_mrad:.6f} mrad  "
                    f"rms={a_err.rms_angle_error_mrad:.6f} mrad  worst@{a_err.worst_error_utc}"
                )

        report_path = out / "validation-report.md"
        _render_report(results, attitude_results, report_path)
        print(f"[OK]     {report_path}")

        failed = [r for r in results if not r.passed]
        failed_attitude = [a for a in attitude_results if not a.passed]
        if failed:
            print(
                f"\n[FAIL]   {len(failed)} trajectory segment(s) breached NFR-P9 thresholds:",
                file=sys.stderr,
            )
            for r in failed:
                if r.max_error_km > MAX_POS_ERROR_KM:
                    print(
                        f"         {r.body_name} seg{r.segment_index:02d}: "
                        f"max_pos_error_km = {r.max_error_km:.3f} > threshold {MAX_POS_ERROR_KM}",
                        file=sys.stderr,
                    )
                if r.rms_error_km > RMS_POS_ERROR_KM:
                    print(
                        f"         {r.body_name} seg{r.segment_index:02d}: "
                        f"rms_pos_error_km = {r.rms_error_km:.3f} > threshold {RMS_POS_ERROR_KM}",
                        file=sys.stderr,
                    )
        if failed_attitude:
            print(
                f"\n[FAIL]   {len(failed_attitude)} attitude window(s) breached NFR-P10:",
                file=sys.stderr,
            )
            for a in failed_attitude:
                print(
                    f"         {a.body_name} {a.kind} (struct {a.struct_id}): "
                    f"max_angle_error_mrad = {a.max_angle_error_mrad:.4f} > "
                    f"threshold {MAX_ATTITUDE_ERROR_MRAD}",
                    file=sys.stderr,
                )
        if failed or failed_attitude:
            return 1
        return 0
    finally:
        spice.kclear()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the L1 per-segment validation harness.")
    parser.add_argument("--root", type=Path, default=None, help="Repo root (default: auto)")
    parser.add_argument(
        "--out-dir", type=Path, default=None, help="bake output dir (default: <repo>/bake/out)"
    )
    args = parser.parse_args(argv)
    return validate(root=args.root, out_dir=args.out_dir)


if __name__ == "__main__":
    sys.exit(main())
