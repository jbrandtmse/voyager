"""Tests for `bake/src/generate_l2_fixtures.py` (Story 1.6 AC4).

Validates the L2 reference fixture generator: deterministic ET grid logic, and
end-to-end smoke (slow tier) that the JSON output is well-formed against the
existing bake manifest.
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


def test_sample_ets_for_short_segment_returns_midpoint() -> None:
    from generate_l2_fixtures import _sample_ets  # noqa: WPS433

    et_start = 0.0
    et_end = 60.0  # 1 minute — far shorter than 2 * 1h boundary inset
    ets = _sample_ets(et_start, et_end)
    assert len(ets) == 1
    assert ets[0] == pytest.approx(30.0)


def test_sample_ets_for_long_segment_returns_inset_grid() -> None:
    from generate_l2_fixtures import _sample_ets  # noqa: WPS433

    et_start = 0.0
    et_end = 24 * 3600.0  # 24h
    ets = _sample_ets(et_start, et_end)
    # 22h inner span / 4h step => ~5-6 samples + start anchor.
    assert len(ets) >= 2
    # All samples must be inside [start + 1h, end - 1h]
    for et in ets:
        assert et >= et_start + 3600.0 - 1e-6
        assert et <= et_end - 3600.0 + 1e-6


def test_sample_ets_zero_span_returns_empty() -> None:
    from generate_l2_fixtures import _sample_ets  # noqa: WPS433

    ets = _sample_ets(100.0, 100.0)
    assert ets == []


def test_sample_ets_for_voyager_segment_lengths_is_reasonable() -> None:
    from generate_l2_fixtures import _sample_ets  # noqa: WPS433

    # V1 seg01 from manifest: 241,732 s span (~67h). Expect ~16-17 samples.
    ets = _sample_ets(-704412035.617, -704170303.4066772)
    assert 10 <= len(ets) <= 30
    # V1 seg07 (massive cruise segment): nearly 45 years span. A uniform 4h
    # cadence would produce ~100k samples — caller-blowing for the fixture
    # file. The generator caps at MAX_SAMPLES_PER_SEGMENT (64) to keep the
    # committed JSON inside the size budget; cruise interpolation is coarse
    # (daily bake cadence) so a sparse anchor set is sufficient.
    from generate_l2_fixtures import MAX_SAMPLES_PER_SEGMENT  # noqa: WPS433

    ets_huge = _sample_ets(-441806400.0, 978264000.0)
    assert len(ets_huge) == MAX_SAMPLES_PER_SEGMENT


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


@pytest.mark.slow
def test_generate_writes_well_formed_fixture(tmp_path: Path) -> None:
    """Slow smoke: run generator against the live bake/out/ and verify schema."""
    if not _kernels_present():
        pytest.skip("LFS kernels not hydrated; run `git lfs pull` then `just fetch-kernels`")
    bake_out = REPO_ROOT / "bake" / "out"
    if not (bake_out / "manifest.json").exists():
        pytest.skip("bake/out/manifest.json missing; run `just bake` first")

    # Use a tmp_path to avoid clobbering committed fixture during the test.
    import shutil

    shutil.copy(bake_out / "manifest.json", tmp_path / "manifest.json")

    from generate_l2_fixtures import generate  # noqa: WPS433

    rc = generate(root=REPO_ROOT, out_dir=tmp_path)
    assert rc == 0
    fixture_path = tmp_path / "l2-reference-fixtures.json"
    assert fixture_path.exists()
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    assert payload["schemaVersion"] == 1
    assert "generated" in payload
    assert "bodies" in payload
    # Both V1 and V2 should be present
    naif_ids = sorted(b["naifId"] for b in payload["bodies"])
    assert naif_ids == [-32, -31]
    # Each body should have many samples (sum across all segments)
    for body in payload["bodies"]:
        assert len(body["samples"]) > 50, (
            f"body {body['name']} has only {len(body['samples'])} samples"
        )
        # Sanity: each sample has position + velocity 3-vectors
        for s in body["samples"][:3]:
            assert "et" in s
            assert len(s["position"]) == 3
            assert len(s["velocity"]) == 3
    # File size budget: roughly ~50-300 KB (V1 seg07 + V2 seg11 are huge)
    size_kb = fixture_path.stat().st_size / 1024.0
    assert size_kb < 5_000, f"fixture file is {size_kb:.0f} KB — too large for git"
