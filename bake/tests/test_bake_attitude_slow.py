"""Story 3.1 slow-tier end-to-end tests for the attitude bake.

Runs the actual `ck_sample.bake_attitude` against the LFS-pulled CK kernels.
Gated on kernel presence per Story 1.4's pattern: if `kernels/vgr1_super_v2.bc`
or `vgr2_super_v2.bc` is missing, tests skip with a clear marker.

Covers:
- AC1: attitude VTRJs are emitted with the expected naming convention.
- AC4: re-bake twice → byte-identical SHA-256 across all attitude files.
- AC5 + AC8: integration AC — the L1 validator successfully reads bake output
  and reports NFR-P10 PASS per window.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(BAKE_SRC))

REPO_ROOT = Path(__file__).resolve().parents[2]
KERNELS_MANIFEST = REPO_ROOT / "kernels" / "kernels-manifest.json"


def _ck_kernels_present() -> bool:
    """True iff the LFS-tracked Voyager CK kernels are hydrated on disk."""
    if not KERNELS_MANIFEST.exists():
        return False
    data = json.loads(KERNELS_MANIFEST.read_text(encoding="utf-8"))
    ck_paths = [
        REPO_ROOT / k["target_path"]
        for k in data.get("kernels", [])
        if k.get("kind") == "ck"
    ]
    if not ck_paths:
        return False
    for p in ck_paths:
        if not p.exists() or p.stat().st_size < 1000:
            return False
    return True


pytestmark = pytest.mark.skipif(
    not _ck_kernels_present(),
    reason="LFS-tracked CK kernels missing on disk — run `git lfs pull && just fetch-kernels`",
)


@pytest.fixture(scope="module")
def attitude_bake_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Run the attitude bake once for the whole module; subsequent tests inspect outputs."""
    from ck_sample import bake_attitude  # noqa: WPS433

    out_dir = tmp_path_factory.mktemp("attitude_bake")
    # We need to first build a placeholder manifest.json with the trajectory
    # entries so ck_sample's _assemble_body_records sees them; for the slow
    # tier we run a real trajectory bake first.
    from bake_trajectories import bake  # noqa: WPS433

    rc_traj = bake(root=REPO_ROOT, out_dir=out_dir)
    assert rc_traj == 0, "trajectory bake failed (prerequisite for attitude bake)"
    rc = bake_attitude(root=REPO_ROOT, out_dir=out_dir)
    assert rc == 0, "attitude bake failed"
    return out_dir


@pytest.mark.slow
def test_attitude_files_emitted(attitude_bake_dir: Path) -> None:
    """AC1: at least one attitude VTRJ is produced for V1 and V2 buses.

    The exact count depends on CK coverage in the LFS-pulled kernels, but the
    V1 bus + V2 bus encounter VTRJs should always be present (Voyager
    super_v2.bc CKs have full bus coverage by design).
    """
    attitude_files = sorted(attitude_bake_dir.glob("*_attitude.*.bin.br"))
    assert attitude_files, "no attitude VTRJs emitted"
    # At least one V1 bus + one V2 bus file
    v1_bus = [p for p in attitude_files if p.name.startswith("v1_bus_attitude.")]
    v2_bus = [p for p in attitude_files if p.name.startswith("v2_bus_attitude.")]
    assert v1_bus, f"no V1 bus attitude files; got {[p.name for p in attitude_files]}"
    assert v2_bus, f"no V2 bus attitude files; got {[p.name for p in attitude_files]}"


@pytest.mark.slow
def test_attitude_manifest_provenance_ck(attitude_bake_dir: Path) -> None:
    """AC3: every attitude entry in the manifest carries provenance="ck"."""
    manifest = json.loads((attitude_bake_dir / "manifest.json").read_text(encoding="utf-8"))
    saw_attitude = False
    for body in manifest["bodies"]:
        for fe in body["files"]:
            if fe["kind"] in ("bus_attitude", "platform_attitude"):
                saw_attitude = True
                assert fe.get("provenance") == "ck", (
                    f"{fe['url']}: attitude entry missing provenance='ck'; got {fe.get('provenance')!r}"
                )
    assert saw_attitude, "manifest has no attitude entries"


@pytest.mark.slow
def test_attitude_bake_determinism(
    attitude_bake_dir: Path, tmp_path_factory: pytest.TempPathFactory
) -> None:
    """AC4 / NFR-R4: re-running `bake_attitude` yields byte-identical SHA-256 for every file."""
    import hashlib

    from bake_trajectories import bake  # noqa: WPS433
    from ck_sample import bake_attitude  # noqa: WPS433

    # Bake into a fresh dir (same trajectory + attitude chain).
    out_b = tmp_path_factory.mktemp("attitude_bake_rerun")
    rc_traj = bake(root=REPO_ROOT, out_dir=out_b)
    assert rc_traj == 0
    rc = bake_attitude(root=REPO_ROOT, out_dir=out_b)
    assert rc == 0

    # Compare SHAs of every attitude file
    a_files = {p.name: p for p in attitude_bake_dir.glob("*_attitude.*.bin.br")}
    b_files = {p.name: p for p in out_b.glob("*_attitude.*.bin.br")}
    assert set(a_files.keys()) == set(b_files.keys()), (
        f"attitude file set differs between bakes; "
        f"a={sorted(a_files)} b={sorted(b_files)}"
    )
    for name in sorted(a_files):
        sha_a = hashlib.sha256(a_files[name].read_bytes()).hexdigest()
        sha_b = hashlib.sha256(b_files[name].read_bytes()).hexdigest()
        assert sha_a == sha_b, (
            f"{name}: byte-determinism broken — sha_a={sha_a[:12]}... "
            f"vs sha_b={sha_b[:12]}..."
        )


@pytest.mark.slow
def test_l1_validator_reads_attitude_bake_and_passes_nfr_p10(
    attitude_bake_dir: Path,
) -> None:
    """AC5 + AC8 Integration AC: L1 validator end-to-end consumes Story 3.1's
    bake output and reports NFR-P10 PASS per window.

    This is the Rule 1 service-introducing-story integration check — the
    producer (`ck_sample.py`) emits VTRJs + extends the manifest; the consumer
    (`validate_l1.py`) reads them, reconstructs the quaternion stream via
    SciPy SLERP, queries SpiceyPy `ckgp` at the same ETs, and asserts max
    angle error ≤ 1 mrad per window. The pass/fail signal travels through the
    wired pipeline.
    """
    from validate_l1 import validate  # noqa: WPS433

    rc = validate(root=REPO_ROOT, out_dir=attitude_bake_dir)
    assert rc == 0, "L1 validator failed against attitude bake (NFR-P10 or NFR-P9 breach)"
    report = (attitude_bake_dir / "validation-report.md").read_text(encoding="utf-8")
    # Attitude section is present and reports PASS for all windows
    assert "Attitude accuracy" in report
    assert "Attitude: **PASS**" in report
    # Overall PASS
    assert "Overall: **PASS**" in report


@pytest.mark.slow
def test_attitude_quaternions_are_sign_continuous(attitude_bake_dir: Path) -> None:
    """ADR-0024 § Obligations: walked output has dot(q[i], q[i+1]) >= 0 for every pair.

    Reads each attitude VTRJ produced by the bake, decompresses + parses, and
    asserts `is_sign_continuous(samples)` per ADR-0024's downstream-story
    obligation. The walk runs at bake time, so the sign-continuity property
    is locked into the on-disk bytes.
    """
    from quat_continuity import is_sign_continuous  # noqa: WPS433
    from vtrj_writer import read_vtrj  # noqa: WPS433

    files = sorted(attitude_bake_dir.glob("*_attitude.*.bin.br"))
    assert files, "no attitude VTRJs to check"
    for path in files:
        header, body = read_vtrj(path)
        assert header["kind"] == "attitude"
        # ADR-0004 § Body Layout per Kind (Story 3.1 amended 2026-05-21):
        # attitude body is (N, 5) = [et, qw, qx, qy, qz]. Strip column 0
        # (explicit ETs) to recover the (N, 4) quaternion array.
        quats = body[:, 1:5]
        assert is_sign_continuous(quats), (
            f"{path.name}: sign-continuity broken — walk_signs failed to apply"
        )
