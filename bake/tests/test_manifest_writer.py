"""Unit tests for `bake/src/manifest_writer.py` (Story 1.4 AC1)."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(BAKE_SRC))

from manifest_writer import (  # noqa: E402
    SCHEMA_VERSION,
    VALIDATION_TOLERANCES,
    BodyEntry,
    FileEntry,
    KernelRef,
    emit_manifest,
    load_manifest,
    strip_volatile_fields,
)


def _sample_bodies() -> list[BodyEntry]:
    return [
        BodyEntry(
            naifId=-31,
            name="Voyager 1",
            files=[
                FileEntry(
                    timeRangeEt=(-704412035.617, -704170303.407),
                    cadenceSec=60.0,
                    kind="trajectory",
                    url="data/voyager-1-seg01-X-Y.bin.br",
                    sha256="a" * 64,
                    sizeBytes=132171,
                ),
                FileEntry(
                    timeRangeEt=(-704170303.407, -661550936.264),
                    cadenceSec=5202.6,
                    kind="trajectory",
                    url="data/voyager-1-seg02-X-Y.bin.br",
                    sha256="b" * 64,
                    sizeBytes=339689,
                ),
            ],
        )
    ]


def _sample_kernels() -> list[KernelRef]:
    return [
        KernelRef(
            file="naif0012.tls",
            sha256="11" * 32,
            kind="lsk",
            source_url="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls",
        ),
        KernelRef(
            file="de440.bsp",
            sha256="22" * 32,
            kind="spk",
            source_url="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp",
        ),
    ]


def test_schema_version_pinned_to_1(tmp_path: Path) -> None:
    """AC1: schemaVersion = 1 in this story."""
    out = tmp_path / "manifest.json"
    emit_manifest(_sample_bodies(), _sample_kernels(), out, tmp_path)
    doc = load_manifest(out)
    assert doc["schemaVersion"] == SCHEMA_VERSION == 1


def test_top_level_keys_match_decision_1b(tmp_path: Path) -> None:
    """AC1: top-level fields exactly match Decision 1b schema."""
    out = tmp_path / "manifest.json"
    emit_manifest(_sample_bodies(), _sample_kernels(), out, tmp_path)
    doc = load_manifest(out)
    expected_keys = {
        "schemaVersion",
        "bakeCommit",
        "bakeTimestamp",
        "kernels",
        "bodies",
        "chapters",
        "validationTolerances",
    }
    assert set(doc.keys()) == expected_keys


def test_validation_tolerances_pinned(tmp_path: Path) -> None:
    """validationTolerances exposes the NFR-P9 thresholds."""
    out = tmp_path / "manifest.json"
    emit_manifest(_sample_bodies(), _sample_kernels(), out, tmp_path)
    doc = load_manifest(out)
    assert doc["validationTolerances"] == VALIDATION_TOLERANCES
    assert doc["validationTolerances"]["maxPositionErrorKm"] == 20.0
    assert doc["validationTolerances"]["rmsPositionErrorKm"] == 5.0


def test_chapters_initially_empty(tmp_path: Path) -> None:
    """Story 1.4 leaves `chapters` empty; Story 2.1 populates."""
    out = tmp_path / "manifest.json"
    emit_manifest(_sample_bodies(), _sample_kernels(), out, tmp_path)
    doc = load_manifest(out)
    assert doc["chapters"] == []


def test_bodies_array_supports_multiple_files_per_body(tmp_path: Path) -> None:
    """Decision 1b: bodies[].files is an array; per-segment VTRJ chunking activates this."""
    out = tmp_path / "manifest.json"
    emit_manifest(_sample_bodies(), _sample_kernels(), out, tmp_path)
    doc = load_manifest(out)
    assert len(doc["bodies"]) == 1
    assert len(doc["bodies"][0]["files"]) == 2
    for fe in doc["bodies"][0]["files"]:
        assert fe["kind"] == "trajectory"
        assert "timeRangeEt" in fe
        assert "cadenceSec" in fe
        assert "sha256" in fe
        assert "sizeBytes" in fe
        assert "url" in fe


def test_sorted_keys_deterministic_serialization(tmp_path: Path) -> None:
    """AC3 (NFR-R4): JSON keys are alphabetically sorted at every level."""
    out = tmp_path / "manifest.json"
    emit_manifest(_sample_bodies(), _sample_kernels(), out, tmp_path)
    text = out.read_text(encoding="utf-8")
    # Reload via json + re-dump with sort_keys=True must equal the file contents
    reloaded = json.loads(text)
    canonical = json.dumps(reloaded, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    assert text == canonical


def test_determinism_modulo_timestamp_and_commit(tmp_path: Path) -> None:
    """AC3: two emits of the same data are byte-identical except for the volatile fields."""
    out_a = tmp_path / "a.json"
    out_b = tmp_path / "b.json"
    fixed_ts = datetime(2026, 5, 18, 12, 0, 0, tzinfo=timezone.utc)
    emit_manifest(_sample_bodies(), _sample_kernels(), out_a, tmp_path, bake_timestamp=fixed_ts)
    emit_manifest(_sample_bodies(), _sample_kernels(), out_b, tmp_path, bake_timestamp=fixed_ts)
    # With a fixed timestamp and identical repo (no git in tmp_path => "unknown" commit),
    # the two files should be byte-identical.
    assert out_a.read_bytes() == out_b.read_bytes()


def test_strip_volatile_fields_removes_only_volatile(tmp_path: Path) -> None:
    """`strip_volatile_fields` drops bakeTimestamp + bakeCommit only."""
    out = tmp_path / "manifest.json"
    emit_manifest(_sample_bodies(), _sample_kernels(), out, tmp_path)
    doc = load_manifest(out)
    stripped = strip_volatile_fields(doc)
    assert "bakeTimestamp" not in stripped
    assert "bakeCommit" not in stripped
    assert "schemaVersion" in stripped
    assert "bodies" in stripped


def test_kernels_carry_source_url(tmp_path: Path) -> None:
    """Decision 1b: each kernels[] entry must include file, sha256, source_url."""
    out = tmp_path / "manifest.json"
    emit_manifest(_sample_bodies(), _sample_kernels(), out, tmp_path)
    doc = load_manifest(out)
    assert len(doc["kernels"]) == 2
    for ke in doc["kernels"]:
        assert "file" in ke and ke["file"]
        assert "sha256" in ke and len(ke["sha256"]) == 64
        assert "kind" in ke
        assert "source_url" in ke and ke["source_url"].startswith("https://")


def test_bake_commit_present_or_unknown(tmp_path: Path) -> None:
    """bakeCommit is either a 40-char hex string or the literal `"unknown"`."""
    out = tmp_path / "manifest.json"
    emit_manifest(_sample_bodies(), _sample_kernels(), out, tmp_path)
    doc = load_manifest(out)
    commit = doc["bakeCommit"]
    assert isinstance(commit, str) and commit
    if commit != "unknown":
        assert len(commit) == 40
        int(commit, 16)  # parses as hex
