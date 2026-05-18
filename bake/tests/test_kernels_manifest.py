"""Story 1.3 manifest tests (AC2 + AC1 verification).

Assert structural and content invariants of `kernels/kernels-manifest.json`:
* valid JSON, schema_version 1, kernel_count matches len(kernels)
* every entry carries the required fields with the right types
* every `target_path` exists on disk and its SHA-256 matches `expected_sha256`
* PDS-attributed entries name the dataset / SETI Institute
* the must-have kernel set (LSK, PCK, DE440, V1/V2 SPK, FK, SCLK, super CKs,
  PDS Rings encounter CKs) is all present per AC1's enumerated list.

These tests do NOT hit the network. They operate exclusively on the on-disk
manifest + kernel files that Task 5 wrote.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "kernels" / "kernels-manifest.json"

REQUIRED_KERNEL_NAMES = {
    "naif0012.tls",
    "pck00011.tpc",
    "de440.bsp",
    "Voyager_1.a54206u_V0.2_merged.bsp",
    "Voyager_2.m05016u.merged.bsp",
    "vg100051.tsc",
    "vg200051.tsc",
    "vg1_v02.tf",
    "vg2_v02.tf",
    "vgr1_super_v2.bc",
    "vgr2_super_v2.bc",
    "vg1_jup_version1_type1_iss_sedr.bc",
    "vg2_jup_version1_type1_iss_sedr.bc",
    "vg1_sat_version1_type1_iss_sedr.bc",
    "vg2_sat_version1_type1_iss_sedr.bc",
    "vg2_ura_version1_type1_iss_sedr.bc",
    "vg2_nep_version1_type1_iss_sedr.bc",
}

VALID_KINDS = {"lsk", "pck", "fk", "sclk", "spk", "ck"}


def _load_manifest() -> dict:
    assert MANIFEST.exists(), f"kernels/kernels-manifest.json not found at {MANIFEST}"
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def test_manifest_is_valid_json() -> None:
    data = _load_manifest()
    assert isinstance(data, dict)


def test_manifest_schema_version_is_1() -> None:
    """AC2: schema_version must be 1 (the schema future stories pin against)."""
    data = _load_manifest()
    assert data["schema_version"] == 1, f"schema_version must be 1, got {data['schema_version']!r}"


def test_manifest_kernel_count_matches_kernels_list() -> None:
    data = _load_manifest()
    assert data["kernel_count"] == len(data["kernels"]), (
        f"kernel_count={data['kernel_count']} but len(kernels)={len(data['kernels'])}"
    )


def test_manifest_generated_field_is_iso8601_utc() -> None:
    data = _load_manifest()
    ts = data["manifest_generated"]
    assert isinstance(ts, str)
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", ts), (
        f"manifest_generated must be ISO-8601 UTC like 2026-05-18T01:00:00Z, got {ts!r}"
    )


@pytest.mark.parametrize("field", ["file", "target_path", "source_url", "expected_sha256", "size_bytes", "kind", "attribution"])
def test_every_entry_has_required_field(field: str) -> None:
    """AC2: every kernel entry must carry the seven required fields."""
    data = _load_manifest()
    for entry in data["kernels"]:
        assert field in entry, f"entry {entry.get('file', '?')!r} missing field {field!r}"
        if field == "size_bytes":
            assert isinstance(entry[field], int) and entry[field] > 0, (
                f"size_bytes for {entry['file']!r} must be a positive int, got {entry[field]!r}"
            )
        elif field == "expected_sha256":
            assert isinstance(entry[field], str) and re.fullmatch(r"[0-9a-f]{64}", entry[field]), (
                f"expected_sha256 for {entry['file']!r} must be 64 hex chars, got {entry[field]!r}"
            )
        else:
            assert isinstance(entry[field], str) and entry[field], (
                f"{field} for {entry['file']!r} must be a non-empty string"
            )


def test_every_entry_kind_is_valid() -> None:
    """AC2: `kind` must be one of the documented enum values."""
    data = _load_manifest()
    for entry in data["kernels"]:
        assert entry["kind"] in VALID_KINDS, (
            f"entry {entry['file']!r} has invalid kind {entry['kind']!r}; "
            f"must be one of {sorted(VALID_KINDS)}"
        )


def test_pds_entries_carry_seti_attribution() -> None:
    """AC2: every PDS-sourced kernel must carry an attribution that names PDS / SETI."""
    data = _load_manifest()
    pds_entries = [e for e in data["kernels"] if "pds-rings.seti.org" in e["source_url"]]
    assert pds_entries, "manifest must contain PDS Rings Node CK entries"
    for entry in pds_entries:
        attr = entry["attribution"].lower()
        assert "pds rings node" in attr or "pds-rings" in attr, (
            f"PDS entry {entry['file']!r} attribution must reference PDS Rings Node: {entry['attribution']!r}"
        )
        assert "seti" in attr, (
            f"PDS entry {entry['file']!r} attribution must reference SETI: {entry['attribution']!r}"
        )


def test_required_kernel_set_is_present_in_manifest() -> None:
    """AC1: the must-have kernels enumerated in the story are all listed."""
    data = _load_manifest()
    files_in_manifest = {e["file"] for e in data["kernels"]}
    missing = REQUIRED_KERNEL_NAMES - files_in_manifest
    assert not missing, f"manifest is missing required kernel(s): {sorted(missing)}"


def test_every_target_path_exists_on_disk() -> None:
    """AC1 + AC3: every manifest entry must have its target file on disk."""
    data = _load_manifest()
    for entry in data["kernels"]:
        path = REPO_ROOT / entry["target_path"]
        assert path.exists(), f"manifest entry {entry['file']!r} target_path missing on disk: {path}"
        actual_size = path.stat().st_size
        assert actual_size == entry["size_bytes"], (
            f"size mismatch for {entry['file']!r}: "
            f"manifest says {entry['size_bytes']}, disk has {actual_size}"
        )


def test_every_on_disk_file_sha256_matches_manifest() -> None:
    """AC3: on-disk SHA-256 must match `expected_sha256` for every kernel."""
    data = _load_manifest()
    for entry in data["kernels"]:
        path = REPO_ROOT / entry["target_path"]
        h = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        actual = h.hexdigest()
        assert actual == entry["expected_sha256"], (
            f"SHA mismatch for {entry['file']!r}:\n"
            f"  manifest: {entry['expected_sha256']}\n"
            f"  disk:     {actual}"
        )


def test_kernels_are_at_flat_paths_under_kernels_dir() -> None:
    """Architecture rule: kernels live directly under `kernels/`, no subdirs."""
    data = _load_manifest()
    for entry in data["kernels"]:
        # target_path is "kernels/<file>" — exactly two components.
        parts = Path(entry["target_path"]).parts
        assert len(parts) == 2 and parts[0] == "kernels", (
            f"kernel {entry['file']!r} target_path must be 'kernels/<file>', got {entry['target_path']!r}"
        )
