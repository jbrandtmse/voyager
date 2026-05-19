"""End-to-end tests for `bake/src/validate_l1.py` (Story 1.4 AC4).

Slow — requires the real kernels + a full bake. Marked `@pytest.mark.slow`.
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
def baked_and_validated_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Run bake + validate once for the whole module; subsequent tests inspect outputs."""
    if not _kernels_present():
        pytest.skip("LFS kernels not hydrated; run `git lfs pull` then `just fetch-kernels`")
    from bake_trajectories import bake  # noqa: WPS433
    from validate_l1 import validate  # noqa: WPS433

    out_dir = tmp_path_factory.mktemp("bake_validate")
    assert bake(root=REPO_ROOT, out_dir=out_dir) == 0
    assert validate(root=REPO_ROOT, out_dir=out_dir) == 0
    return out_dir


@pytest.mark.slow
def test_validation_report_exists_and_is_well_formed(baked_and_validated_dir: Path) -> None:
    """AC4: validation-report.md is written and contains the expected sections."""
    report = baked_and_validated_dir / "validation-report.md"
    assert report.exists()
    text = report.read_text(encoding="utf-8")
    assert "Layer-1 Validation Report" in text
    assert "NFR-P9" in text
    assert "max <= 20.0 km" in text
    assert "RMS <= 5.0 km" in text
    # Per-segment rows: one per (body, segment). 7 V1 + 11 V2 = 18 rows.
    # We count the Voyager lines in the table.
    table_lines = [ln for ln in text.split("\n") if ln.startswith("| Voyager")]
    assert len(table_lines) == 18, f"expected 18 segment rows, got {len(table_lines)}"


@pytest.mark.slow
def test_all_segments_pass_nfr_p9(baked_and_validated_dir: Path) -> None:
    """AC4: validate exits 0 (all segments inside NFR-P9 thresholds).

    This is the load-bearing acceptance check — if a future kernel update or
    architectural change degrades any segment past the threshold, this test
    fails before the bake is shipped.
    """
    report = baked_and_validated_dir / "validation-report.md"
    text = report.read_text(encoding="utf-8")
    assert "Overall: **PASS**" in text, "validation report does not show PASS"
    # Every Voyager row must end with `| PASS |` (allow either case)
    for line in text.split("\n"):
        if line.startswith("| Voyager"):
            assert "| PASS |" in line, f"segment row not marked PASS: {line}"


@pytest.mark.slow
def test_validate_exits_nonzero_when_a_vtrj_is_corrupted(
    baked_and_validated_dir: Path, tmp_path: Path
) -> None:
    """AC4: synthesized threshold breach -> exit 1 + the failing segment is named.

    We corrupt one V2 segment's samples by adding a 100,000-km offset to every
    position, then re-run validate against the corrupted set. Expected:
    exit 1 and the report mentions the failing segment.
    """
    if not _kernels_present():
        pytest.skip("LFS kernels not hydrated")
    import shutil

    from validate_l1 import validate  # noqa: WPS433
    from vtrj_writer import read_vtrj, write_vtrj  # noqa: WPS433

    # Clone the baked dir to tmp_path, then corrupt one VTRJ
    work = tmp_path / "corrupted"
    shutil.copytree(baked_and_validated_dir, work)
    # Pick the first V2 segment for corruption
    manifest = json.loads((work / "manifest.json").read_text(encoding="utf-8"))
    v2_body = next(b for b in manifest["bodies"] if b["naifId"] == -32)
    v2_first_file = v2_body["files"][0]
    target = work / Path(v2_first_file["url"]).name
    header, samples = read_vtrj(target)
    samples = samples.copy()
    samples[:, 0:3] += 100_000.0  # shift positions by 100,000 km on each axis
    # Recompute SHA + size when we rewrite the file
    new_sha = write_vtrj(
        target_path=target,
        body_id=header["body_id"],
        et_start=header["et_start"],
        et_end=header["et_end"],
        cadence_seconds=header["cadence_seconds"],
        samples=samples,
    )
    # Patch the manifest's sha + sizeBytes so validate doesn't complain about
    # the file-vs-manifest mismatch (validate doesn't currently SHA-check,
    # but be defensive — the corrupted sample data is what matters).
    v2_first_file["sha256"] = new_sha
    v2_first_file["sizeBytes"] = target.stat().st_size
    (work / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    rc = validate(root=REPO_ROOT, out_dir=work)
    assert rc == 1, "validate should exit non-zero when an injected position offset exceeds threshold"

    # The new validation report names V2 seg01 as failing
    text = (work / "validation-report.md").read_text(encoding="utf-8")
    assert "Voyager 2 seg01" in text
    assert "FAIL" in text
