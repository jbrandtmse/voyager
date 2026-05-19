"""Story 1.4 bake-pipeline defense-in-depth tests.

Complementary to the dev's `test_vtrj_writer.py`, `test_manifest_writer.py`,
`test_bake_trajectories.py`, and `test_validate_l1.py`. These tests lock in
properties that are *implied* by the architecture and Story 1.4 acceptance
criteria but not directly asserted by the dev's baseline:

1. **Manifest schemaVersion always emits as 1** — write-side guard for the
   future runtime reject-unknown-major behavior (architecture.md line 289).
2. **VTRJ structural integrity (8 facets)** — magic bytes are exactly
   ``b'VTRJ'`` (case-sensitive), version is exactly 1 (u16 LE), reserved is
   ``0x0000``, body_id in {-31, -32}, sample_count > 0, cadence_seconds in
   [60, 86400], et_start < et_end, file-size sanity (40 + N*48 uncompressed).
3. **Per-segment time-range non-overlap** — `bodies[].files[]` in
   ``bake/out/manifest.json`` walks strictly forward in ET; touching
   endpoints are allowed (10 ms inset at bake time).
4. **No segment-boundary samples crossing** — every VTRJ sample's ET (derived
   from header `et_start + i * cadence_seconds`) lies in
   ``[et_start, et_end]`` inclusive. Off-by-one tripwire.
5. **justfile recipe contract** — `just --list` exposes the locked recipe
   list (bake, validate, fetch-kernels, verify-kernels, adr-index, test-bake,
   test-web, copy-bake-to-web). Skips if `just` is not installed.
6. **`copy-bake-to-web` is genuinely a stub (AC7)** — recipe must print the
   stub marker; locks the semantics so a future story can't accidentally
   activate it.
7. **Brotli quality is locked at 11 (NFR-R4 byte-identical-rebuild)** — a
   future refactor changing the level would break determinism; this test
   catches it via source-string inspection.
8. **No analytics in `bake/uv.lock` after the brotli add** — runs the same
   forbidden-substring list as ``web/tests/no-pii-grep.test.ts`` directly
   against ``bake/uv.lock``. Defensive duplicate of the vitest assertion.
9. **NFR-P9 thresholds locked at 20 km / 5 km in validate_l1.py** — source
   inspection tripwire against silent threshold loosening.

Decline Playwright/E2E: Story 1.4 ships no UI; pytest is correct.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import struct
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import brotli
import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
BAKE_SRC = REPO_ROOT / "bake" / "src"
BAKE_OUT = REPO_ROOT / "bake" / "out"
JUSTFILE = REPO_ROOT / "justfile"
VALIDATE_L1_SOURCE = BAKE_SRC / "validate_l1.py"
VTRJ_WRITER_SOURCE = BAKE_SRC / "vtrj_writer.py"
BAKE_UV_LOCK = REPO_ROOT / "bake" / "uv.lock"

if str(BAKE_SRC) not in sys.path:
    sys.path.insert(0, str(BAKE_SRC))

from manifest_writer import (  # noqa: E402
    BodyEntry,
    FileEntry,
    KernelRef,
    emit_manifest,
    load_manifest,
)

# --- VTRJ format constants (locked by AC2) ---------------------------------

VTRJ_MAGIC = b"VTRJ"
VTRJ_VERSION = 1
VTRJ_HEADER_SIZE = 40
VTRJ_BYTES_PER_SAMPLE = 48
VTRJ_HEADER_STRUCT = struct.Struct("<4sHiddId2s")
ALLOWED_BODY_IDS = {-31, -32}
MIN_CADENCE_SECONDS = 60.0
MAX_CADENCE_SECONDS = 86400.0


def _baked_vtrjs() -> list[Path]:
    """Return the list of baked VTRJ files in bake/out (empty if bake never ran)."""
    if not BAKE_OUT.exists():
        return []
    return sorted(BAKE_OUT.glob("voyager-*-seg*.bin.br"))


def _baked_manifest() -> dict | None:
    p = BAKE_OUT / "manifest.json"
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def _find_just() -> str | None:
    """Locate the `just` executable.

    Checks ``shutil.which`` first; falls back to the winget Links shim that
    ``winget install Casey.Just`` drops on Windows (which is sometimes not
    picked up by a fresh subshell's PATH until the user signs out).
    """
    found = shutil.which("just")
    if found:
        return found
    candidates: list[Path] = []
    if os.name == "nt":
        local_app = os.environ.get("LOCALAPPDATA")
        if local_app:
            candidates.append(Path(local_app) / "Microsoft" / "WinGet" / "Links" / "just.exe")
    for c in candidates:
        if c.exists():
            return str(c)
    return None


# --- 1. Manifest schemaVersion emission guard ------------------------------


def test_manifest_emits_schema_version_literal_1(tmp_path: Path) -> None:
    """Architecture line 289: schemaVersion is the runtime gate for forward-compat.

    Story 1.4 only owns the emission side. We assert the literal integer 1 is
    written into the manifest — not 'v1', not '1.0', not 1.0, the int 1.
    Story 1.6's reader will assert the receive-side reject behavior.
    """
    bodies = [
        BodyEntry(
            naifId=-31,
            name="Voyager 1",
            files=[
                FileEntry(
                    timeRangeEt=(0.0, 1.0),
                    cadenceSec=60.0,
                    kind="trajectory",
                    url="data/x.bin.br",
                    sha256="0" * 64,
                    sizeBytes=128,
                )
            ],
        )
    ]
    kernels = [
        KernelRef(
            file="naif0012.tls",
            sha256="1" * 64,
            kind="lsk",
            source_url="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls",
        )
    ]
    out = tmp_path / "manifest.json"
    fixed_ts = datetime(2026, 5, 18, 0, 0, 0, tzinfo=timezone.utc)
    emit_manifest(bodies, kernels, out, tmp_path, bake_timestamp=fixed_ts)

    doc = load_manifest(out)
    assert "schemaVersion" in doc, "schemaVersion missing — top-level field is mandatory"
    sv = doc["schemaVersion"]
    assert sv == 1, f"schemaVersion must be int 1; got {sv!r}"
    assert isinstance(sv, int) and not isinstance(sv, bool), (
        f"schemaVersion must be a plain int (not bool / str / float); got {type(sv).__name__}"
    )

    # And literal in the raw JSON text (no implicit float coercion).
    text = out.read_text(encoding="utf-8")
    assert re.search(r'"schemaVersion"\s*:\s*1\b', text), (
        "schemaVersion must serialize as the integer literal 1, not '1' or 1.0"
    )


# --- 2. VTRJ structural integrity defense (8 facets) -----------------------


def _decompress_and_parse(vtrj_path: Path) -> tuple[tuple, bytes]:
    """Decompress a baked VTRJ and unpack its 40-byte header. Returns (header_tuple, body_bytes)."""
    raw = brotli.decompress(vtrj_path.read_bytes())
    assert len(raw) >= VTRJ_HEADER_SIZE, f"{vtrj_path.name}: file shorter than 40-byte header"
    header = VTRJ_HEADER_STRUCT.unpack(raw[:VTRJ_HEADER_SIZE])
    body = raw[VTRJ_HEADER_SIZE:]
    return header, body


@pytest.mark.skipif(not _baked_vtrjs(), reason="bake/out/ empty; run `just bake` first")
def test_vtrj_magic_bytes_exact() -> None:
    """Magic is exactly b'VTRJ' (4 ASCII bytes; case-sensitive)."""
    for vtrj in _baked_vtrjs():
        header, _ = _decompress_and_parse(vtrj)
        magic = header[0]
        assert magic == VTRJ_MAGIC, f"{vtrj.name}: magic={magic!r}, expected {VTRJ_MAGIC!r}"
        # Case-sensitivity guard: rule out b'vtrj' (lowercase) and b'VTR\0'
        assert magic != b"vtrj", f"{vtrj.name}: magic is lowercase (case mismatch)"
        assert magic != b"VTR\x00", f"{vtrj.name}: magic is null-terminated"
        assert len(magic) == 4 and all(0x20 <= b <= 0x7E for b in magic), (
            f"{vtrj.name}: magic must be 4 printable-ASCII bytes; got {magic!r}"
        )


@pytest.mark.skipif(not _baked_vtrjs(), reason="bake/out/ empty; run `just bake` first")
def test_vtrj_version_exact() -> None:
    """Version is exactly 1 (u16 LE); never 0, never 2."""
    for vtrj in _baked_vtrjs():
        header, _ = _decompress_and_parse(vtrj)
        version = header[1]
        assert version == VTRJ_VERSION, f"{vtrj.name}: version={version}, expected {VTRJ_VERSION}"
        assert version != 0, f"{vtrj.name}: version=0 not allowed"
        assert version != 2, f"{vtrj.name}: version=2 leaked through (Story 1.4 locks 1)"


@pytest.mark.skipif(not _baked_vtrjs(), reason="bake/out/ empty; run `just bake` first")
def test_vtrj_reserved_bytes_zero() -> None:
    """Reserved bytes (offset 38–39) are exactly 0x0000."""
    for vtrj in _baked_vtrjs():
        header, _ = _decompress_and_parse(vtrj)
        reserved = header[7]
        assert reserved == b"\x00\x00", f"{vtrj.name}: reserved={reserved!r}, expected b'\\x00\\x00'"


@pytest.mark.skipif(not _baked_vtrjs(), reason="bake/out/ empty; run `just bake` first")
def test_vtrj_body_id_in_allowed_set() -> None:
    """body_id is one of {-31, -32}; no other NAIF IDs leak through in Story 1.4."""
    for vtrj in _baked_vtrjs():
        header, _ = _decompress_and_parse(vtrj)
        body_id = header[2]
        assert body_id in ALLOWED_BODY_IDS, (
            f"{vtrj.name}: body_id={body_id} not in {sorted(ALLOWED_BODY_IDS)}"
        )
        # Cross-check: filename slug must match body_id
        if body_id == -31:
            assert vtrj.name.startswith("voyager-1-"), (
                f"{vtrj.name}: header body_id=-31 but filename does not start 'voyager-1-'"
            )
        elif body_id == -32:
            assert vtrj.name.startswith("voyager-2-"), (
                f"{vtrj.name}: header body_id=-32 but filename does not start 'voyager-2-'"
            )


@pytest.mark.skipif(not _baked_vtrjs(), reason="bake/out/ empty; run `just bake` first")
def test_vtrj_sample_count_positive() -> None:
    """sample_count > 0 (no zero-sample VTRJs)."""
    for vtrj in _baked_vtrjs():
        header, _ = _decompress_and_parse(vtrj)
        sample_count = header[5]
        assert sample_count > 0, f"{vtrj.name}: sample_count={sample_count}, must be > 0"
        # Realistic lower bound: dev's cadence policy + segment span yields at least 2.
        assert sample_count >= 2, f"{vtrj.name}: sample_count={sample_count} too small for Hermite"


@pytest.mark.skipif(not _baked_vtrjs(), reason="bake/out/ empty; run `just bake` first")
def test_vtrj_cadence_in_clamp_range() -> None:
    """cadence_seconds in [60, 86400] per the dev's clamp(span/8192, 60, 86400) policy."""
    for vtrj in _baked_vtrjs():
        header, _ = _decompress_and_parse(vtrj)
        cadence = header[6]
        assert MIN_CADENCE_SECONDS <= cadence <= MAX_CADENCE_SECONDS, (
            f"{vtrj.name}: cadence_seconds={cadence} outside clamp "
            f"[{MIN_CADENCE_SECONDS}, {MAX_CADENCE_SECONDS}]"
        )


@pytest.mark.skipif(not _baked_vtrjs(), reason="bake/out/ empty; run `just bake` first")
def test_vtrj_et_window_strictly_ordered() -> None:
    """et_start < et_end (no zero-duration or negative-duration segments)."""
    for vtrj in _baked_vtrjs():
        header, _ = _decompress_and_parse(vtrj)
        et_start, et_end = header[3], header[4]
        assert et_start < et_end, (
            f"{vtrj.name}: et_start={et_start} not strictly less than et_end={et_end}"
        )


@pytest.mark.skipif(not _baked_vtrjs(), reason="bake/out/ empty; run `just bake` first")
def test_vtrj_file_size_sanity() -> None:
    """Uncompressed size == 40 + sample_count * 48 (header + Float64Array body)."""
    for vtrj in _baked_vtrjs():
        raw = brotli.decompress(vtrj.read_bytes())
        header = VTRJ_HEADER_STRUCT.unpack(raw[:VTRJ_HEADER_SIZE])
        sample_count = header[5]
        expected = VTRJ_HEADER_SIZE + sample_count * VTRJ_BYTES_PER_SAMPLE
        assert len(raw) == expected, (
            f"{vtrj.name}: decompressed size={len(raw)} bytes, expected "
            f"40 + {sample_count} * 48 = {expected}"
        )


# --- 3. Per-segment time-range non-overlap ---------------------------------


@pytest.mark.skipif(_baked_manifest() is None, reason="bake/out/manifest.json missing")
def test_segments_do_not_overlap() -> None:
    """For each body in the manifest, consecutive segments' time_range_et ranges
    are non-overlapping. Touching endpoints (seg_n.end == seg_{n+1}.start) are
    allowed — dev clamped with a 10 ms inset so interior samples are safe.
    """
    manifest = _baked_manifest()
    assert manifest is not None
    for body in manifest["bodies"]:
        files = body["files"]
        # Sort by et_start so the check is robust to manifest ordering.
        ranges = sorted([tuple(fe["timeRangeEt"]) for fe in files])
        for i in range(1, len(ranges)):
            prev_start, prev_end = ranges[i - 1]
            this_start, this_end = ranges[i]
            assert this_start >= prev_end, (
                f"{body['name']}: segment {i} overlaps previous — "
                f"prev=[{prev_start}, {prev_end}], this=[{this_start}, {this_end}]"
            )


# --- 4. No segment-boundary samples crossing -------------------------------


@pytest.mark.skipif(not _baked_vtrjs(), reason="bake/out/ empty; run `just bake` first")
def test_no_sample_falls_outside_its_segment() -> None:
    """For each VTRJ, every sample's ET (reconstructed from
    ``et_start + i * cadence_seconds``) lies in ``[et_start, et_end]`` inclusive.

    The bake uses ``np.linspace(et_start, et_end, N)`` so the *true* cadence is
    ``(et_end - et_start) / (N - 1)``, which is what gets written to the
    header. We rebuild that grid here and assert the bounds.
    """
    for vtrj in _baked_vtrjs():
        header, _ = _decompress_and_parse(vtrj)
        et_start = header[3]
        et_end = header[4]
        sample_count = header[5]
        cadence = header[6]

        # Reconstruct exactly as the bake does.
        reconstructed = np.linspace(et_start, et_end, sample_count, dtype=np.float64)
        assert reconstructed[0] == et_start, (
            f"{vtrj.name}: reconstructed[0]={reconstructed[0]} != et_start={et_start}"
        )
        assert reconstructed[-1] == et_end, (
            f"{vtrj.name}: reconstructed[-1]={reconstructed[-1]} != et_end={et_end}"
        )
        # All samples (inclusive) within window.
        assert np.all(reconstructed >= et_start), (
            f"{vtrj.name}: at least one reconstructed sample falls below et_start"
        )
        assert np.all(reconstructed <= et_end), (
            f"{vtrj.name}: at least one reconstructed sample falls above et_end"
        )
        # Cadence consistency: stored cadence equals (et_end - et_start) / (N - 1)
        # to within 1 ulp. Off-by-one in sampling-loop indexing would break this.
        expected_cadence = (et_end - et_start) / (sample_count - 1)
        assert cadence == pytest.approx(expected_cadence, rel=1e-12, abs=1e-9), (
            f"{vtrj.name}: header cadence={cadence} disagrees with "
            f"(et_end - et_start) / (N - 1) = {expected_cadence}"
        )


# --- 5. justfile recipe contract -------------------------------------------

REQUIRED_RECIPES = {
    "bake",
    "validate",
    "fetch-kernels",
    "verify-kernels",
    "adr-index",
    "test-bake",
    "test-web",
    "copy-bake-to-web",
    "generate-l2-fixtures",
}


def test_just_list_exposes_required_recipes() -> None:
    """`just --list --justfile <repo>/justfile` includes the locked recipe set.

    If `just` is not on PATH (and not at the winget Links fallback), skip —
    this is the same convention as the dev's e2e tests with respect to LFS
    kernels: environment-dependent, gracefully degrades.
    """
    just_exe = _find_just()
    if just_exe is None:
        pytest.skip("`just` not found on PATH or in winget Links — install via `winget install Casey.Just`")
    result = subprocess.run(
        [just_exe, "--list", "--justfile", str(JUSTFILE)],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, (
        f"`just --list` exited {result.returncode}; stderr:\n{result.stderr}"
    )
    listed = result.stdout
    missing = sorted(name for name in REQUIRED_RECIPES if name not in listed)
    assert not missing, (
        f"justfile is missing required recipes: {missing}\n"
        f"--- `just --list` output ---\n{listed}"
    )


# --- 6. `copy-bake-to-web` invokes the script and is idempotent (Story 1.6 AC6) ---


def test_copy_bake_to_web_invokes_python_script() -> None:
    """`just copy-bake-to-web` must invoke scripts/copy_bake_to_web.py.

    Story 1.4 left this recipe as a stub; Story 1.6 activated it. Locks the
    new contract so the recipe stays wired to the Python script (platform-
    portable; no `cp -r` / `robocopy` divergence between OSes).
    """
    just_exe = _find_just()
    if just_exe is None:
        pytest.skip("`just` not found on PATH or in winget Links — install via `winget install Casey.Just`")
    # Confirm the recipe text references the Python script (don't actually
    # invoke it — that requires `uv` and a live bake/out/). The recipe must
    # mention `copy_bake_to_web.py` so the contract is text-locked.
    text = JUSTFILE.read_text(encoding="utf-8")
    assert "scripts/copy_bake_to_web.py" in text, (
        "`copy-bake-to-web` recipe must invoke scripts/copy_bake_to_web.py"
    )
    # Stub markers must be gone — guards against accidental regression.
    assert "stub" not in text.lower().split("copy-bake-to-web")[1].split("\n", 4)[1].lower(), (
        "`copy-bake-to-web` recipe still references 'stub' near its body — Story 1.6 removed the stub."
    )


def test_copy_bake_to_web_script_exists_and_is_idempotent() -> None:
    """`scripts/copy_bake_to_web.py` exists and re-running copies nothing new."""
    script = REPO_ROOT /"scripts" / "copy_bake_to_web.py"
    assert script.exists(), f"Story 1.6 expects {script} to exist"
    # Idempotence check: run the script twice against a tmp_path and assert
    # the second run is a no-op (everything reports SKIP).
    bake_out = REPO_ROOT /"bake" / "out"
    if not (bake_out / "manifest.json").exists():
        pytest.skip("bake/out/manifest.json missing; run `just bake` first")
    import tempfile

    venv_python = REPO_ROOT /"bake" / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists():
        # POSIX layout fallback
        venv_python = REPO_ROOT /"bake" / ".venv" / "bin" / "python"
    if not venv_python.exists():
        pytest.skip("bake/.venv python not present; cannot exercise the idempotence path")
    with tempfile.TemporaryDirectory() as tmp:
        result1 = subprocess.run(
            [str(venv_python), str(script), "--web-data", tmp],
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert result1.returncode == 0, f"first run failed:\n{result1.stderr}"
        result2 = subprocess.run(
            [str(venv_python), str(script), "--web-data", tmp],
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert result2.returncode == 0, f"second run failed:\n{result2.stderr}"
        # On the second run, no file should be a COPY action — only SKIPs.
        for line in result2.stdout.split("\n"):
            if line.startswith("[COPY]"):
                raise AssertionError(
                    f"second run was not idempotent — COPY happened: {line}\n"
                    f"stdout:\n{result2.stdout}"
                )


# --- 7. Brotli quality is locked at 11 (NFR-R4) ---------------------------


def test_brotli_quality_is_pinned_at_11() -> None:
    """vtrj_writer.py must serialize with brotli quality=11 (max, deterministic).

    Source-level tripwire: if a future refactor changes the quality level,
    NFR-R4 byte-identical-rebuild breaks (different quality -> different
    compressed bytes for identical input). This test catches the regression
    at code-change time, before a rebuild even runs.
    """
    src = VTRJ_WRITER_SOURCE.read_text(encoding="utf-8")
    # The dev wrote `BROTLI_QUALITY = 11` and passes `quality=BROTLI_QUALITY`.
    # We assert both: the constant binding AND the call-site usage are
    # consistent and resolve to 11.
    assert re.search(r"^BROTLI_QUALITY\s*=\s*11\b", src, re.MULTILINE), (
        f"{VTRJ_WRITER_SOURCE} must bind BROTLI_QUALITY = 11 at module scope"
    )
    assert "quality=BROTLI_QUALITY" in src or "quality=11" in src, (
        f"{VTRJ_WRITER_SOURCE}: brotli.compress() must be invoked with quality=BROTLI_QUALITY "
        f"(or the literal 11) — anything else breaks NFR-R4"
    )


# --- 8. No-analytics grep against bake/uv.lock (post-brotli-add) ---------

# Mirrors web/tests/no-pii-grep.test.ts so the bake side has a redundant
# tripwire. The web vitest already covers the same lockfile, but a bake-side
# pytest assertion catches regressions when the web test suite is skipped
# (e.g., during a pure Python session).
FORBIDDEN_PII_SUBSTRINGS = (
    "analytics",
    "telemetry",
    "fingerprint",
    "cookie-consent",
    "ga-",
    "gtag",
    "mixpanel",
    "segment",
    "amplitude",
    "hotjar",
    "sentry",
    "datadog",
)


def test_bake_uv_lock_has_no_analytics_strings_after_brotli_add() -> None:
    """`brotli` was added to bake deps in Story 1.4. No-PII grep must still pass."""
    assert BAKE_UV_LOCK.exists(), f"bake/uv.lock missing at {BAKE_UV_LOCK}"
    contents = BAKE_UV_LOCK.read_text(encoding="utf-8")
    hits: dict[str, list[str]] = {}
    for needle in FORBIDDEN_PII_SUBSTRINGS:
        # Case-insensitive scan matches the web vitest behavior.
        pattern = re.compile(re.escape(needle), re.IGNORECASE)
        matched: list[str] = []
        for lineno, line in enumerate(contents.splitlines(), start=1):
            if pattern.search(line):
                matched.append(f"{lineno}: {line.strip()[:200]}")
        if matched:
            hits[needle] = matched
    assert not hits, (
        "bake/uv.lock contains forbidden analytics/telemetry strings after brotli add:\n"
        + "\n".join(
            f"  [{needle}] -> " + "; ".join(lines) for needle, lines in hits.items()
        )
        + "\nIf this is a legitimate exception, document it in web/tests/no-pii-grep.test.ts "
        "DOCUMENTED_EXCEPTIONS and capture an ADR."
    )


# --- 9. NFR-P9 thresholds locked at 20 / 5 in validate_l1.py --------------


def test_validate_l1_thresholds_pinned_at_nfr_p9() -> None:
    """Architecture NFR-P9: max <= 20 km, RMS <= 5 km. Source-level tripwire.

    If anyone silently loosens the thresholds (e.g., to accommodate a future
    regression), this test fails before the bake even runs. Defense-in-depth.
    """
    src = VALIDATE_L1_SOURCE.read_text(encoding="utf-8")
    # We don't just match the bare number `20` because that also appears in
    # offsets / array sizes / SHA-256 hash widths. Anchor on the actual
    # threshold constants the dev wrote.
    assert re.search(r"^MAX_POS_ERROR_KM\s*=\s*20(?:\.0)?\b", src, re.MULTILINE), (
        f"{VALIDATE_L1_SOURCE}: MAX_POS_ERROR_KM must be the NFR-P9 literal 20 (km)"
    )
    assert re.search(r"^RMS_POS_ERROR_KM\s*=\s*5(?:\.0)?\b", src, re.MULTILINE), (
        f"{VALIDATE_L1_SOURCE}: RMS_POS_ERROR_KM must be the NFR-P9 literal 5 (km)"
    )
    # Also lock that the literal numbers 20 and 5 (with km context) appear —
    # belt-and-braces if the dev refactors the constant names later.
    assert "20" in src and "5" in src, (
        f"{VALIDATE_L1_SOURCE}: expected NFR-P9 literals 20 and 5 to be visible"
    )
