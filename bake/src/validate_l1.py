"""Layer-1 Python validation harness for the trajectory bake (per-segment).

For each VTRJ file in the bake manifest, samples a dense SPICE reference grid
inside that segment's time range (at least 10x denser than the segment's bake
cadence), interpolates via `scipy.interpolate.CubicHermiteSpline` over each
Cartesian axis using positions + velocities from the bake, and computes max +
RMS Euclidean position error in km. Asserts NFR-P9 thresholds **per segment**:

    max position error <= 20 km
    RMS position error <= 5 km

Writes a markdown summary to `bake/out/validation-report.md` with one row per
(body, segment), and exits non-zero if any segment breaches either threshold.

Canonical invocation:
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

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _kernel_io import load_manifest as load_kernel_manifest  # type: ignore[import-not-found]
    from _kernel_io import repo_root
    from manifest_writer import load_manifest as load_bake_manifest  # noqa: E402
    from vtrj_writer import read_vtrj  # noqa: E402
else:
    from ._kernel_io import load_manifest as load_kernel_manifest
    from ._kernel_io import repo_root
    from .manifest_writer import load_manifest as load_bake_manifest
    from .vtrj_writer import read_vtrj

MAX_POS_ERROR_KM = 20.0  # NFR-P9
RMS_POS_ERROR_KM = 5.0  # NFR-P9

# Reference grid density: at least 10x denser than the segment's bake cadence.
# We use a multiplier rather than a fixed cadence because per-segment bake
# cadences range from 60s (encounters) to 86400s (cruise).
REFERENCE_DENSITY_MULTIPLIER = 10


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


def _furnish_kernels(repo: Path) -> None:
    """Re-furnish the same kernel set the bake used."""
    import spiceypy as spice

    manifest_path = repo / "kernels" / "kernels-manifest.json"
    _, entries = load_kernel_manifest(manifest_path)
    priority = {"lsk": 0, "pck": 1, "fk": 2, "sclk": 3, "spk": 4, "ck": 5}
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


def _render_report(results: list[SegmentError], report_path: Path) -> None:
    """Write `bake/out/validation-report.md` with one row per (body, segment)."""
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
    lines.append("## Summary")
    lines.append("")
    overall = all(r.passed for r in results)
    n_pass = sum(1 for r in results if r.passed)
    lines.append(f"Overall: **{'PASS' if overall else 'FAIL'}** ({n_pass}/{len(results)} segments)")
    if not overall:
        lines.append("")
        lines.append("Failing segments:")
        for r in results:
            if not r.passed:
                lines.append(
                    f"- {r.body_name} seg{r.segment_index:02d}: "
                    f"max={r.max_error_km:.3f} km, RMS={r.rms_error_km:.3f} km"
                )
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
        _furnish_kernels(repo)

        results: list[SegmentError] = []
        for body in bake_manifest["bodies"]:
            naif_id = int(body["naifId"])
            body_name = body["name"]
            for seg_idx, file_entry in enumerate(body["files"], start=1):
                vtrj_path = (out / Path(file_entry["url"]).name).resolve()
                if not vtrj_path.exists():
                    print(f"[FAIL] VTRJ missing: {vtrj_path}", file=sys.stderr)
                    return 1
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

        report_path = out / "validation-report.md"
        _render_report(results, report_path)
        print(f"[OK]     {report_path}")

        failed = [r for r in results if not r.passed]
        if failed:
            print(f"\n[FAIL]   {len(failed)} segment(s) breached NFR-P9 thresholds:", file=sys.stderr)
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
