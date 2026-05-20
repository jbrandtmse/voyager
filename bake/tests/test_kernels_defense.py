"""Story 1.3 kernels defense-in-depth tests.

Complementary to ``test_kernels_manifest.py`` / ``test_acquire_kernels.py`` /
``test_ck_inventory.py`` (the dev's structural / behavioral suite). These
tests lock in properties that are *implied* by the architecture and the
story acceptance criteria but not directly asserted by the dev's baseline:

1. **Manifest URL hygiene** — every ``source_url`` is HTTPS-only and points
   at one of the two authorized upstream hosts (``naif.jpl.nasa.gov`` or
   ``pds-rings.seti.org``). Architecture §Asset Acquisition Tools.
2. **schema_version forward-compat** — the runtime loader refuses an unknown
   major schema. Architecture line 289 ("Runtime refuses to load unknown
   major schemaVersion.").
3. **kind enum tightness** — the union of ``kind`` values used in the
   manifest equals the documented enum, no smuggled-in values.
4. **PDS attribution completeness** — every PDS-sourced entry's
   attribution contains both ``PDS Rings Node`` and ``SETI Institute``
   (FR48 manifest-level attribution check).
5. **SHA helper hardening** — ``sha256_file`` raises on missing paths,
   correctly hashes 0-byte input, and correctly hashes input larger than
   the read buffer.
6. **frame-ids.md V1↔V2 parity** — every frame subsystem present for V1 is
   present for V2 and vice versa.
7. **CK inventory PBD load-bearing assertion** — the inventory contains the
   PBD date, a coverage statement, and the scan-platform distinction.
8. **manifest no-secrets check** — manifest contains no API keys, local
   filesystem paths, or credential-shaped strings.

Pytest-only; no network, no real kernel I/O beyond small synthetic
fixtures. Story 1.3 ships zero UI — Playwright/E2E was declined; pytest
is the correct framework for these assertions (Story scope is files +
scripts + a manifest under ``kernels/``).
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = REPO_ROOT / "kernels" / "kernels-manifest.json"
FRAME_IDS_PATH = REPO_ROOT / "kernels" / "frame-ids.md"
INVENTORY_PATH = REPO_ROOT / "docs" / "kernels" / "ckbrief-inventory.md"
BAKE_SRC = REPO_ROOT / "bake" / "src"

# Make `_kernel_io` importable without affecting other test modules.
if str(BAKE_SRC) not in sys.path:
    sys.path.insert(0, str(BAKE_SRC))

import _kernel_io  # noqa: E402

DOCUMENTED_KINDS = {"lsk", "pck", "fk", "sclk", "spk", "ck"}
AUTHORIZED_HOSTS = {"naif.jpl.nasa.gov", "pds-rings.seti.org"}


def _load_manifest_dict() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# 1. Manifest URL hygiene
# ---------------------------------------------------------------------------


def test_every_source_url_uses_https() -> None:
    """Architecture §Asset Acquisition Tools: HTTPS-only fetches."""
    data = _load_manifest_dict()
    for entry in data["kernels"]:
        url = entry["source_url"]
        scheme = urlparse(url).scheme
        assert scheme == "https", (
            f"kernel {entry['file']!r} has non-HTTPS source_url scheme {scheme!r}: {url!r}"
        )
        assert "ftp://" not in url, f"kernel {entry['file']!r} source_url contains ftp://: {url!r}"
        assert not url.startswith("http://"), (
            f"kernel {entry['file']!r} source_url starts with http:// (must be https://): {url!r}"
        )


def test_every_source_url_points_to_an_authorized_host() -> None:
    """Architecture §Asset Acquisition Tools: only NAIF (JPL) and PDS Rings (SETI)."""
    data = _load_manifest_dict()
    for entry in data["kernels"]:
        host = urlparse(entry["source_url"]).hostname or ""
        assert host in AUTHORIZED_HOSTS, (
            f"kernel {entry['file']!r} sourced from unauthorized host {host!r}; "
            f"allowed hosts are {sorted(AUTHORIZED_HOSTS)}"
        )


# ---------------------------------------------------------------------------
# 2. Schema-version forward compatibility
# ---------------------------------------------------------------------------


def test_loader_rejects_unknown_schema_version(tmp_path: Path) -> None:
    """Architecture line 289: runtime refuses to load unknown major schemaVersion.

    Build a manifest claiming ``schema_version: 99`` and assert the loader
    raises rather than silently loading and trusting fields it doesn't
    understand.
    """
    bad = {
        "schema_version": 99,
        "manifest_generated": "2026-05-18T01:00:00Z",
        "kernel_count": 0,
        "kernels": [],
    }
    p = tmp_path / "bad-manifest.json"
    p.write_text(json.dumps(bad), encoding="utf-8")

    with pytest.raises((ValueError, KeyError, AssertionError, RuntimeError)) as exc:
        _kernel_io.load_manifest(p)
    # The exception message should mention the unsupported version, so the
    # error is actionable for whoever introduces a future schema bump.
    assert "99" in str(exc.value) or "schema" in str(exc.value).lower(), (
        f"loader raised but error did not mention schema or version: {exc.value!r}"
    )


def test_loader_accepts_documented_schema_version(tmp_path: Path) -> None:
    """Positive control for the guard above: schema_version 1 still loads."""
    good = {
        "schema_version": 1,
        "manifest_generated": "2026-05-18T01:00:00Z",
        "kernel_count": 0,
        "kernels": [],
    }
    p = tmp_path / "good-manifest.json"
    p.write_text(json.dumps(good), encoding="utf-8")
    data, entries = _kernel_io.load_manifest(p)
    assert data["schema_version"] == 1
    assert entries == []


# ---------------------------------------------------------------------------
# 3. kind enum tightness
# ---------------------------------------------------------------------------


def test_manifest_kind_values_are_subset_of_documented_enum() -> None:
    """Architecture Task 4 schema lists exactly {lsk, pck, fk, sclk, spk, ck}.

    Any other value (``text``, ``bin``, ``other``, ``misc``) would indicate
    schema drift. This is stricter than the per-entry parametrized test
    in ``test_kernels_manifest.py`` because it asserts on the *set union*
    so a typo on a single entry surfaces immediately.
    """
    data = _load_manifest_dict()
    seen_kinds = {entry["kind"] for entry in data["kernels"]}
    illegal = seen_kinds - DOCUMENTED_KINDS
    assert not illegal, (
        f"manifest contains undocumented kind value(s) {sorted(illegal)}; "
        f"allowed enum is {sorted(DOCUMENTED_KINDS)}"
    )


# ---------------------------------------------------------------------------
# 4. PDS attribution completeness (FR48)
# ---------------------------------------------------------------------------


def test_pds_sourced_entries_carry_full_attribution_string() -> None:
    """FR48 attribution-completeness at the manifest level: every PDS Rings
    kernel must explicitly name both ``PDS Rings Node`` and ``SETI Institute``.
    The dev's baseline test only checks ``pds rings node`` (lower-cased) and
    ``seti`` substring. This test pins the actual phrases.
    """
    data = _load_manifest_dict()
    pds_entries = [e for e in data["kernels"] if "pds-rings.seti.org" in e["source_url"]]
    assert pds_entries, "expected at least one PDS Rings Node CK entry"
    for entry in pds_entries:
        attr = entry["attribution"]
        assert attr, f"PDS entry {entry['file']!r} has empty attribution"
        assert "PDS Rings Node" in attr, (
            f"PDS entry {entry['file']!r} attribution missing 'PDS Rings Node': {attr!r}"
        )
        assert "SETI Institute" in attr, (
            f"PDS entry {entry['file']!r} attribution missing 'SETI Institute': {attr!r}"
        )


# ---------------------------------------------------------------------------
# 5. SHA helper hardening (`bake/src/_kernel_io.py`)
# ---------------------------------------------------------------------------


def test_sha256_file_raises_on_nonexistent_path(tmp_path: Path) -> None:
    """Helper must raise (not silently return a garbage / empty hash) when
    the path does not exist. Without this, a missing kernel could be
    "verified" against the manifest's empty-input SHA.
    """
    missing = tmp_path / "does-not-exist.bin"
    with pytest.raises(FileNotFoundError):
        _kernel_io.sha256_file(missing)


def test_sha256_file_handles_zero_byte_file(tmp_path: Path) -> None:
    """0-byte file hashes to the canonical SHA-256 of the empty input."""
    empty = tmp_path / "empty.bin"
    empty.write_bytes(b"")
    expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    assert _kernel_io.sha256_file(empty) == expected


def test_sha256_file_handles_file_larger_than_read_buffer(tmp_path: Path) -> None:
    """The streaming helper must produce the correct hash for files larger
    than ``CHUNK_SIZE`` (1 MiB). Uses a 1 MB null-byte payload — small enough
    to keep the test cheap, large enough to span at least one chunk boundary.
    """
    payload = b"\x00" * 1_000_000  # 1,000,000 bytes < 1 MiB chunk to stay quick
    expected = hashlib.sha256(payload).hexdigest()

    # Also test a payload that crosses the chunk boundary to exercise the
    # multi-chunk read path explicitly.
    big_payload = b"\x00" * (_kernel_io.CHUNK_SIZE + 4096)
    expected_big = hashlib.sha256(big_payload).hexdigest()

    small = tmp_path / "1mb.bin"
    small.write_bytes(payload)
    assert _kernel_io.sha256_file(small) == expected

    big = tmp_path / "over-chunk.bin"
    big.write_bytes(big_payload)
    assert _kernel_io.sha256_file(big) == expected_big


# ---------------------------------------------------------------------------
# 6. frame-ids.md V1↔V2 parity
# ---------------------------------------------------------------------------


# Frame subsystem labels that should appear for both V1 and V2 per
# architecture §3g + the dev's own generated file. We match on the
# subsystem keyword (case-insensitive) to remain robust to formatting
# tweaks while still detecting a wholesale dropped subsystem.
FRAME_SUBSYSTEMS = [
    ("SC_BUS", r"SC[_ ]BUS|spacecraft bus"),
    ("SCAN_PLATFORM", r"SCAN[_ \-]PLATFORM|scan[_ \-]platform"),
    ("ISSNA", r"ISSNA|NA camera"),
    ("HGA", r"HGA"),
]


@pytest.mark.parametrize("label,pattern", FRAME_SUBSYSTEMS, ids=[s[0] for s in FRAME_SUBSYSTEMS])
def test_frame_ids_md_documents_subsystem_for_both_spacecraft(label: str, pattern: str) -> None:
    """Each frame subsystem must appear in both a V1 context and a V2 context.

    Implementation: split the doc at the V2 section header ('Voyager 2'); the
    pattern must match in the V1 section *and* in the V2 section.
    """
    assert FRAME_IDS_PATH.exists(), f"frame-ids.md not found at {FRAME_IDS_PATH}"
    text = FRAME_IDS_PATH.read_text(encoding="utf-8")

    # Split into V1 and V2 halves. We anchor on "Voyager 2" as the section
    # boundary (the dev's generated doc uses '## Voyager 1' and '## Voyager 2').
    split_match = re.search(r"##\s+Voyager\s*2\b", text)
    assert split_match, "frame-ids.md must contain a 'Voyager 2' section header"
    v1_half = text[: split_match.start()]
    v2_half = text[split_match.start() :]

    rx = re.compile(pattern, re.IGNORECASE)
    assert rx.search(v1_half), (
        f"frame subsystem {label!r} (pattern {pattern!r}) missing from V1 section of frame-ids.md"
    )
    assert rx.search(v2_half), (
        f"frame subsystem {label!r} (pattern {pattern!r}) missing from V2 section of frame-ids.md"
    )


def test_frame_ids_md_v1_id_pattern_and_v2_id_pattern_present() -> None:
    """V1 IDs follow ``-31xxx`` and V2 IDs follow ``-32xxx`` (architecture
    convention). Both ID families must appear so a future regeneration that
    drops one spacecraft fails loudly.
    """
    text = FRAME_IDS_PATH.read_text(encoding="utf-8")
    v1_ids = re.findall(r"-31\d{3}\b", text)
    v2_ids = re.findall(r"-32\d{3}\b", text)
    assert v1_ids, "frame-ids.md must contain V1 frame IDs in the -31xxx family"
    assert v2_ids, "frame-ids.md must contain V2 frame IDs in the -32xxx family"


# ---------------------------------------------------------------------------
# 7. CK inventory PBD load-bearing assertion (Epic 5 input)
# ---------------------------------------------------------------------------


def test_ckbrief_inventory_contains_pbd_date() -> None:
    """The 1990-02-14 Pale Blue Dot date is the explicit AC5 callout and the
    load-bearing Epic 5 scoping input. A regeneration that drops this date
    silently must fail the test.
    """
    assert INVENTORY_PATH.exists(), f"ckbrief-inventory.md not found at {INVENTORY_PATH}"
    text = INVENTORY_PATH.read_text(encoding="utf-8")
    assert "1990-02-14" in text, "ckbrief-inventory.md must explicitly mention 1990-02-14 (PBD)"


def test_ckbrief_inventory_contains_coverage_statement() -> None:
    """Around the PBD callout the inventory must contain a coverage statement
    using one of the documented keywords (``covers``, ``coverage``, ``gap``,
    ``synthesize``). Without this, the file becomes a coverage *table* with
    no readable claim about Epic 5 scoping.
    """
    text = INVENTORY_PATH.read_text(encoding="utf-8").lower()
    keywords = ["covers", "coverage", "covered", "does not cover", "gap", "synthesize", "synthesis"]
    hits = [kw for kw in keywords if kw in text]
    assert hits, (
        f"ckbrief-inventory.md must contain at least one coverage keyword "
        f"from {keywords}; none found"
    )


def test_ckbrief_inventory_distinguishes_scan_platform_from_bus() -> None:
    """Load-bearing distinction for AC5: the inventory must call out the
    scan-platform vs. bus difference so the PBD synthesis scope is unambiguous.
    """
    text = INVENTORY_PATH.read_text(encoding="utf-8").lower()
    has_scan_platform = ("scan platform" in text) or ("scan-platform" in text) or ("scan_platform" in text)
    assert has_scan_platform, (
        "ckbrief-inventory.md must mention 'scan platform' (or 'scan-platform') — "
        "the load-bearing distinction between bus-level CK coverage and "
        "scan-platform coverage at the PBD date"
    )
    assert "bus" in text, "ckbrief-inventory.md must also discuss 'bus' coverage for contrast"


# ---------------------------------------------------------------------------
# 8. Manifest no-secrets check
# ---------------------------------------------------------------------------


def test_manifest_contains_no_secrets_or_local_paths() -> None:
    """A public manifest of public-source URLs must not leak API keys,
    auth headers, local filesystem paths, or credential-shaped strings.

    Search the raw manifest text (not the parsed dict) so a stray field
    or comment-like artefact would still surface.
    """
    raw = MANIFEST_PATH.read_text(encoding="utf-8")
    raw_lower = raw.lower()

    forbidden_substrings = [
        # Credential-shaped tokens
        "api_key",
        "apikey",
        "api-key",
        "secret_key",
        "access_token",
        "bearer ",
        "authorization:",
        "password",
        "x-api-key",
        # Local-filesystem leakage
        "c:\\",
        "c:/",
        "/home/",
        "/users/",
        "file://",
    ]
    leaks = [s for s in forbidden_substrings if s in raw_lower]
    assert not leaks, (
        f"kernels-manifest.json contains forbidden substring(s) {leaks!r}; "
        "manifest must be a pure public-URL artifact with no credentials or local paths"
    )


def test_manifest_keys_are_only_documented_keys() -> None:
    """Defense against schema creep: only the documented top-level and entry
    keys should appear. Extra keys (e.g. a stray ``token`` or ``private``
    field) would surface here.
    """
    data = _load_manifest_dict()
    allowed_top = {"schema_version", "manifest_generated", "kernel_count", "kernels"}
    extra_top = set(data.keys()) - allowed_top
    assert not extra_top, (
        f"manifest has undocumented top-level keys {sorted(extra_top)}; "
        f"allowed keys are {sorted(allowed_top)}"
    )

    allowed_entry = {
        "file",
        "target_path",
        "source_url",
        "expected_sha256",
        "size_bytes",
        "kind",
        "attribution",
    }
    for entry in data["kernels"]:
        extra = set(entry.keys()) - allowed_entry
        assert not extra, (
            f"manifest entry {entry.get('file', '?')!r} has undocumented key(s) "
            f"{sorted(extra)}; allowed keys are {sorted(allowed_entry)}"
        )
