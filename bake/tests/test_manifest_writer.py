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


# --- Story 3.1 AC3: provenance field for attitude entries ------------------


def _attitude_bodies() -> list[BodyEntry]:
    """Mixed body record: V1 has both trajectory + attitude entries."""
    return [
        BodyEntry(
            naifId=-31,
            name="Voyager 1",
            files=[
                FileEntry(
                    timeRangeEt=(0.0, 100.0),
                    cadenceSec=60.0,
                    kind="trajectory",
                    url="data/voyager-1-seg01-X-Y.bin.br",
                    sha256="a" * 64,
                    sizeBytes=1024,
                    # provenance defaults to None — trajectory entries don't emit it
                ),
                FileEntry(
                    timeRangeEt=(200.0, 300.0),
                    cadenceSec=60.0,
                    kind="bus_attitude",
                    url="data/v1-bus-attitude-jupiter.bin.br",
                    sha256="b" * 64,
                    sizeBytes=2048,
                    provenance="ck",
                ),
                FileEntry(
                    timeRangeEt=(200.0, 300.0),
                    cadenceSec=10.0,
                    kind="platform_attitude",
                    url="data/v1-platform-attitude-jupiter.bin.br",
                    sha256="c" * 64,
                    sizeBytes=3072,
                    provenance="ck",
                ),
            ],
        )
    ]


def test_emit_manifest_with_attitude_files(tmp_path: Path) -> None:
    """AC3: attitude entries carry `provenance: "ck"`; trajectory entries do NOT.

    Verifies the on-disk JSON has `provenance` only on the attitude rows and
    that the field value is exactly the literal "ck". Round-trip parity with
    Story 1.4 manifest tests: trajectory rows preserve their pre-Story-3.1
    shape (no new key surface).
    """
    out = tmp_path / "manifest.json"
    emit_manifest(_attitude_bodies(), _sample_kernels(), out, tmp_path)
    doc = load_manifest(out)
    files = doc["bodies"][0]["files"]
    assert len(files) == 3

    # Sort by kind so test is order-independent
    by_kind = {fe["kind"]: fe for fe in files}
    assert "trajectory" in by_kind and "bus_attitude" in by_kind and "platform_attitude" in by_kind

    # Trajectory: NO provenance key
    traj = by_kind["trajectory"]
    assert "provenance" not in traj, (
        "trajectory entries must NOT emit `provenance` (forward-compat with Story 1.4)"
    )

    # Attitude: provenance == "ck"
    for kind in ("bus_attitude", "platform_attitude"):
        entry = by_kind[kind]
        assert entry["provenance"] == "ck", (
            f"{kind}: expected provenance='ck', got {entry.get('provenance')!r}"
        )


def test_trajectory_only_manifest_has_no_provenance_keys(tmp_path: Path) -> None:
    """AC3 byte-stability: a trajectory-only manifest produces the same JSON
    structure pre- and post-Story-3.1.

    Story 1.4's existing tests pin the trajectory FileEntry shape; this is the
    explicit "no surprises" guard ensuring `provenance` doesn't leak into
    trajectory rows even by accident.
    """
    out = tmp_path / "manifest.json"
    emit_manifest(_sample_bodies(), _sample_kernels(), out, tmp_path)
    doc = load_manifest(out)
    for body in doc["bodies"]:
        for fe in body["files"]:
            assert "provenance" not in fe, (
                f"{fe['url']}: trajectory entry leaked `provenance` key — "
                f"breaks Story 1.4 byte-stability"
            )


def test_provenance_field_serialization_round_trips(tmp_path: Path) -> None:
    """AC3: an attitude FileEntry's provenance survives JSON round-trip verbatim."""
    bodies = _attitude_bodies()
    out = tmp_path / "manifest.json"
    emit_manifest(bodies, _sample_kernels(), out, tmp_path)
    raw_text = out.read_text(encoding="utf-8")
    # The literal pair `"provenance": "ck"` must appear in the JSON text
    assert '"provenance": "ck"' in raw_text, (
        f"expected literal `\"provenance\": \"ck\"` in manifest JSON; got:\n{raw_text}"
    )


def test_attitude_files_preserve_sorted_keys(tmp_path: Path) -> None:
    """AC3 (NFR-R4): with the new `provenance` key, sort_keys=True still applies.

    The serializer must place `provenance` alphabetically between `kind` and
    `sha256` — JSON keys at every level remain sorted.
    """
    out = tmp_path / "manifest.json"
    emit_manifest(_attitude_bodies(), _sample_kernels(), out, tmp_path)
    text = out.read_text(encoding="utf-8")
    reloaded = json.loads(text)
    canonical = json.dumps(reloaded, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    assert text == canonical, "manifest JSON keys are not in sorted order"
