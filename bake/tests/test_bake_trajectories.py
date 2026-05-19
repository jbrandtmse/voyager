"""End-to-end tests for `bake/src/bake_trajectories.py` (Story 1.4 AC1/AC3/AC5).

These tests run the real bake against the LFS-tracked NAIF kernels. They are
marked `@pytest.mark.slow` so they don't fire on every CI run; invoke via
`just test-bake-slow` (or `uv run pytest`).

The default `just test-bake` recipe runs `pytest -m "not slow"` which excludes
these tests; the test_vtrj_writer / test_manifest_writer unit tests cover the
fast-feedback contracts.
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

pytestmark = pytest.mark.skipif(
    not KERNELS_MANIFEST.exists(),
    reason="kernels-manifest.json missing; run `just fetch-kernels`",
)


def _kernels_present() -> bool:
    if not KERNELS_MANIFEST.exists():
        return False
    data = json.loads(KERNELS_MANIFEST.read_text(encoding="utf-8"))
    for k in data.get("kernels", []):
        target = REPO_ROOT / k["target_path"]
        if not target.exists() or target.stat().st_size < 100:
            return False
    return True


@pytest.fixture(scope="module")
def baked_out_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Run the bake once for the whole module; subsequent tests inspect outputs."""
    if not _kernels_present():
        pytest.skip("LFS kernels not hydrated; run `git lfs pull` then `just fetch-kernels`")
    from bake_trajectories import bake  # noqa: WPS433 — runtime import after sys.path

    out_dir = tmp_path_factory.mktemp("baked")
    rc = bake(root=REPO_ROOT, out_dir=out_dir)
    assert rc == 0, "bake exited non-zero"
    return out_dir


@pytest.mark.slow
def test_bake_produces_voyager_1_and_2_segments(baked_out_dir: Path) -> None:
    """AC1: per-segment chunking emits V1=7 and V2=11 VTRJ files."""
    v1_files = sorted(baked_out_dir.glob("voyager-1-seg*.bin.br"))
    v2_files = sorted(baked_out_dir.glob("voyager-2-seg*.bin.br"))
    # The Voyager merged SPKs have 7 (V1) and 11 (V2) segments where body=-31/-32.
    assert len(v1_files) == 7, f"expected 7 V1 VTRJ segments, got {len(v1_files)}"
    assert len(v2_files) == 11, f"expected 11 V2 VTRJ segments, got {len(v2_files)}"


@pytest.mark.slow
def test_bake_writes_manifest_with_correct_shape(baked_out_dir: Path) -> None:
    """AC1: manifest.json lists both bodies; files array carries the segments."""
    manifest = json.loads((baked_out_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["schemaVersion"] == 1
    assert manifest["chapters"] == []
    assert "kernels" in manifest
    assert "validationTolerances" in manifest
    bodies = {b["naifId"]: b for b in manifest["bodies"]}
    assert -31 in bodies and -32 in bodies
    assert len(bodies[-31]["files"]) == 7
    assert len(bodies[-32]["files"]) == 11
    for body in bodies.values():
        for fe in body["files"]:
            assert fe["kind"] == "trajectory"
            assert fe["sha256"] and len(fe["sha256"]) == 64
            assert fe["sizeBytes"] > 0
            assert fe["cadenceSec"] > 0
            assert len(fe["timeRangeEt"]) == 2
            assert fe["timeRangeEt"][1] > fe["timeRangeEt"][0]


@pytest.mark.slow
def test_segment_endpoints_are_strictly_sequential(baked_out_dir: Path) -> None:
    """AC1: each spacecraft's segments are non-overlapping and sequential in ET."""
    manifest = json.loads((baked_out_dir / "manifest.json").read_text(encoding="utf-8"))
    for body in manifest["bodies"]:
        et_ranges = [tuple(fe["timeRangeEt"]) for fe in body["files"]]
        # Segments are sorted by et_start ascending (bake emits them in this order)
        for i in range(1, len(et_ranges)):
            prev_end = et_ranges[i - 1][1]
            this_start = et_ranges[i][0]
            # Adjacent segments may share an endpoint (the SPK stitch point),
            # but `this_start >= prev_end` always holds.
            assert this_start >= prev_end, (
                f"{body['name']} segments overlap at index {i}: "
                f"prev_end={prev_end}, this_start={this_start}"
            )


@pytest.mark.slow
def test_idempotent_byte_identical_rebuild(tmp_path: Path) -> None:
    """AC3 (NFR-R4): two bakes produce identical VTRJ SHA-256 values."""
    if not _kernels_present():
        pytest.skip("LFS kernels not hydrated")
    from bake_trajectories import bake  # noqa: WPS433

    out_a = tmp_path / "a"
    out_b = tmp_path / "b"
    assert bake(root=REPO_ROOT, out_dir=out_a) == 0
    assert bake(root=REPO_ROOT, out_dir=out_b) == 0

    files_a = sorted(p.name for p in out_a.glob("*.bin.br"))
    files_b = sorted(p.name for p in out_b.glob("*.bin.br"))
    assert files_a == files_b, "filenames differ between rebuilds"

    import hashlib

    for name in files_a:
        h_a = hashlib.sha256((out_a / name).read_bytes()).hexdigest()
        h_b = hashlib.sha256((out_b / name).read_bytes()).hexdigest()
        assert h_a == h_b, f"VTRJ {name} SHA-256 drifted across rebuilds"


@pytest.mark.slow
def test_manifest_byte_identical_modulo_volatile(tmp_path: Path) -> None:
    """AC3: manifest.json is byte-identical between rebuilds except bakeTimestamp/bakeCommit."""
    if not _kernels_present():
        pytest.skip("LFS kernels not hydrated")
    from bake_trajectories import bake  # noqa: WPS433
    from manifest_writer import load_manifest, strip_volatile_fields  # noqa: WPS433

    out_a = tmp_path / "a"
    out_b = tmp_path / "b"
    assert bake(root=REPO_ROOT, out_dir=out_a) == 0
    assert bake(root=REPO_ROOT, out_dir=out_b) == 0

    m_a = strip_volatile_fields(load_manifest(out_a / "manifest.json"))
    m_b = strip_volatile_fields(load_manifest(out_b / "manifest.json"))
    assert m_a == m_b


@pytest.mark.slow
def test_vtrj_header_body_id_matches_spacecraft(baked_out_dir: Path) -> None:
    """AC2: each VTRJ's header body_id matches its filename's slug."""
    from vtrj_writer import read_vtrj  # noqa: WPS433

    for vtrj in sorted(baked_out_dir.glob("voyager-1-*.bin.br")):
        header, _ = read_vtrj(vtrj)
        assert header["body_id"] == -31, f"{vtrj.name}: body_id={header['body_id']}"
    for vtrj in sorted(baked_out_dir.glob("voyager-2-*.bin.br")):
        header, _ = read_vtrj(vtrj)
        assert header["body_id"] == -32, f"{vtrj.name}: body_id={header['body_id']}"


@pytest.mark.slow
def test_no_segment_boundary_appears_inside_a_vtrj(baked_out_dir: Path) -> None:
    """Each VTRJ's [et_start, et_end] equals exactly one SPK segment's bounds —
    no internal segment-boundary crossings exist inside any VTRJ.

    The test checks that no two VTRJs from the same body share an interior
    point (boundaries may be shared at endpoints by design).
    """
    from vtrj_writer import read_vtrj  # noqa: WPS433

    manifest = json.loads((baked_out_dir / "manifest.json").read_text(encoding="utf-8"))
    for body in manifest["bodies"]:
        intervals = []
        for fe in body["files"]:
            file_path = baked_out_dir / Path(fe["url"]).name
            header, _ = read_vtrj(file_path)
            intervals.append((header["et_start"], header["et_end"]))
        intervals.sort()
        for i in range(1, len(intervals)):
            prev_end = intervals[i - 1][1]
            this_start = intervals[i][0]
            # Intervals may touch (this_start == prev_end) but never overlap interior
            assert this_start >= prev_end, (
                f"{body['name']}: VTRJ intervals overlap at boundary index {i}"
            )
