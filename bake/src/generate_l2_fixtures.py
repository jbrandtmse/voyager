"""Generate L2 reference fixtures for the web-side EphemerisService test.

Reads the bake manifest, then for each body samples a deterministic 4-hour ET
grid across each segment (start + 1h to end - 1h, to stay inside the spline's
valid domain — mirrors the boundary inset of `bake_trajectories.py`). For each
ET, calls SpiceyPy `spkgeo` to capture the true state vector, and emits
`bake/out/l2-reference-fixtures.json` for the web vitest to load.

This is the smaller "smoke test" sibling of the full per-frame L2 harness that
lands in Story 3.7. Sample sparsely — target file size ~50-100 KB max.

Canonical invocation:
    just generate-l2-fixtures
    # fallback (from `bake/`):
    uv run python -m src.generate_l2_fixtures
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _kernel_io import load_manifest as load_kernel_manifest  # type: ignore[import-not-found]
    from _kernel_io import repo_root
    from manifest_writer import load_manifest as load_bake_manifest  # noqa: E402
else:
    from ._kernel_io import load_manifest as load_kernel_manifest
    from ._kernel_io import repo_root
    from .manifest_writer import load_manifest as load_bake_manifest

# Sample cadence for the reference grid (seconds). 4-hour spacing keeps the
# fixture compact on encounter-scale segments while still exercising each
# segment at multiple interior points.
SAMPLE_CADENCE_SECONDS = 4 * 3600.0  # 4 h
# Stay 1 h inside the segment boundary at both ends.
BOUNDARY_INSET_SECONDS = 3600.0
# Minimum samples per segment (covers segments shorter than ~8 h).
MIN_SAMPLES_PER_SEGMENT = 2
# Per-segment sample cap. The Voyager cruise segments span decades; a uniform
# 4 h cadence would emit ~100k samples per cruise segment, blowing the fixture
# size budget (~50-100 KB) by ~3 orders of magnitude. When the cadence would
# produce more than MAX_SAMPLES_PER_SEGMENT, we widen the cadence (still
# deterministic linspace) to hit exactly this count. Cruise interpolation is
# coarse anyway (daily cadence in the bake), so 64 sparse anchors per segment
# still exercise the per-axis Hermite math at many positions across the run.
MAX_SAMPLES_PER_SEGMENT = 16
SCHEMA_VERSION = 1


def _furnish_kernels(repo: Path) -> None:
    """Furnish the same kernel set the bake used."""
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


def _sample_ets(et_start: float, et_end: float) -> list[float]:
    """Pick a deterministic ET grid inside [et_start, et_end] with boundary inset.

    Returns 0 samples for segments shorter than 2 hours (after inset).
    """
    span = et_end - et_start
    if span <= 2 * BOUNDARY_INSET_SECONDS:
        # Segment too short to inset; sample a single midpoint if at all possible.
        if span <= 0:
            return []
        return [et_start + span / 2.0]
    inner_start = et_start + BOUNDARY_INSET_SECONDS
    inner_end = et_end - BOUNDARY_INSET_SECONDS
    inner_span = inner_end - inner_start
    raw = int(inner_span / SAMPLE_CADENCE_SECONDS) + 1
    n = max(MIN_SAMPLES_PER_SEGMENT, min(MAX_SAMPLES_PER_SEGMENT, raw))
    if n == 1:
        return [inner_start + inner_span / 2.0]
    step = inner_span / (n - 1)
    return [inner_start + i * step for i in range(n)]


def generate(
    root: Path | None = None,
    out_dir: Path | None = None,
) -> int:
    """Write `bake/out/l2-reference-fixtures.json`. Returns 0 on success."""
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
        bodies_out: list[dict] = []
        total_samples = 0
        for body in bake_manifest["bodies"]:
            naif_id = int(body["naifId"])
            name = body["name"]
            samples_out: list[dict] = []
            for file_entry in body["files"]:
                et_start = float(file_entry["timeRangeEt"][0])
                et_end = float(file_entry["timeRangeEt"][1])
                ets = _sample_ets(et_start, et_end)
                for et in ets:
                    state, _ = spice.spkgeo(targ=naif_id, et=et, ref="ECLIPJ2000", obs=0)
                    samples_out.append(
                        {
                            "et": float(et),
                            "position": [float(state[0]), float(state[1]), float(state[2])],
                            "velocity": [float(state[3]), float(state[4]), float(state[5])],
                        }
                    )
            print(f"[GEN]    {name} (NAIF {naif_id}): {len(samples_out)} samples")
            total_samples += len(samples_out)
            bodies_out.append({"naifId": naif_id, "name": name, "samples": samples_out})

        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        fixtures = {
            "schemaVersion": SCHEMA_VERSION,
            "generated": ts,
            "bodies": bodies_out,
        }
        target = out / "l2-reference-fixtures.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(fixtures, indent=2, sort_keys=True) + "\n"
        part = target.with_suffix(target.suffix + ".part")
        part.write_text(payload, encoding="utf-8", newline="\n")
        part.replace(target)
        size_kb = target.stat().st_size / 1024.0
        print(f"[OK]     {target}  ({total_samples} samples, {size_kb:.1f} KB)")
        return 0
    finally:
        spice.kclear()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate L2 reference fixtures (sparse SpiceyPy ground truth)."
    )
    parser.add_argument("--root", type=Path, default=None, help="Repo root (default: auto)")
    parser.add_argument(
        "--out-dir", type=Path, default=None, help="bake output dir (default: <repo>/bake/out)"
    )
    args = parser.parse_args(argv)
    return generate(root=args.root, out_dir=args.out_dir)


if __name__ == "__main__":
    sys.exit(main())
