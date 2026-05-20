"""Story 1.3 acquire/verify script tests (AC1 idempotency + AC3 tamper / missing).

These tests EXERCISE the local scripts without hitting the network. Each test
constructs a fake repo layout (manifest + tiny fixture kernels) inside
`tmp_path`, then runs the acquire / verify scripts against that fake repo via
`--root` + `--manifest` overrides.

Three coverage areas required by Task 8:
1. **Idempotency** — running `acquire_kernels.py` twice in a row against a
   populated, SHA-matched fixture produces zero `[FETCH]` lines on the second
   run.
2. **Tamper detection** — modifying a single byte of one kernel and re-running
   `verify_kernels.py` exits non-zero and prints the offending filename + SHAs.
3. **Missing-file detection** — renaming a kernel out of the way (so the
   manifest references a non-existent target) makes `verify_kernels.py` exit
   non-zero with a `MISSING:` error naming the file.

The real production-network fetch path is exercised by the developer running
`python bake/src/acquire_kernels.py` manually in Task 5 — not in these tests.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Iterable

import pytest

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
ACQUIRE = BAKE_SRC / "acquire_kernels.py"
VERIFY = BAKE_SRC / "verify_kernels.py"


def _sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _make_fixture_repo(
    tmp_path: Path,
    files: Iterable[tuple[str, bytes]],
) -> Path:
    """Create a fake `kernels/` + manifest under tmp_path. Returns repo root.

    `files` is an iterable of (filename, content) tuples. Each is written under
    `kernels/<filename>` and recorded in the manifest with a matching SHA.
    """
    root = tmp_path / "fakerepo"
    (root / "kernels").mkdir(parents=True)
    # Mark this as a "repo" so `repo_root()` halts here when walking upward.
    (root / ".git").mkdir()

    entries = []
    for name, content in files:
        path = root / "kernels" / name
        path.write_bytes(content)
        entries.append(
            {
                "file": name,
                "target_path": f"kernels/{name}",
                "source_url": "https://example.invalid/" + name,  # never hit
                "expected_sha256": _sha256(content),
                "size_bytes": len(content),
                "kind": "lsk",
                "attribution": "Test fixture (no real kernel)",
            }
        )

    manifest = {
        "schema_version": 1,
        "manifest_generated": "2026-05-18T01:00:00Z",
        "kernel_count": len(entries),
        "kernels": entries,
    }
    (root / "kernels" / "kernels-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    return root


def _run_script(script: Path, *args: str, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(script), *args],
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )


def test_acquire_is_idempotent_on_populated_cache(tmp_path: Path) -> None:
    """AC1: re-running on a fully SHA-matched cache produces zero FETCH lines."""
    root = _make_fixture_repo(
        tmp_path,
        [
            ("alpha.tls", b"alpha content for testing"),
            ("beta.tls", b"beta content for testing"),
        ],
    )

    res1 = _run_script(ACQUIRE, "--root", str(root), "--manifest", str(root / "kernels" / "kernels-manifest.json"))
    assert res1.returncode == 0, f"first acquire failed: {res1.stderr or res1.stdout}"
    assert "[FETCH]" not in res1.stdout, f"first run on populated cache should not fetch:\n{res1.stdout}"

    res2 = _run_script(ACQUIRE, "--root", str(root), "--manifest", str(root / "kernels" / "kernels-manifest.json"))
    assert res2.returncode == 0
    assert "[FETCH]" not in res2.stdout, f"second run must be a pure no-op:\n{res2.stdout}"
    assert res1.stdout == res2.stdout, (
        "deterministic log requirement (Task 2): identical input -> identical output\n"
        f"first:\n{res1.stdout}\nsecond:\n{res2.stdout}"
    )


def test_verify_exits_zero_when_all_kernels_match(tmp_path: Path) -> None:
    """AC3 happy path: verify exits 0 + 'OK:' on full match."""
    root = _make_fixture_repo(tmp_path, [("k.tls", b"kernel content")])
    res = _run_script(VERIFY, "--root", str(root), "--manifest", str(root / "kernels" / "kernels-manifest.json"))
    assert res.returncode == 0, f"verify failed: {res.stderr}"
    assert "OK: 1 kernels verified" in res.stdout


def test_verify_detects_tampered_file(tmp_path: Path) -> None:
    """AC3 negative: flipping a byte in one kernel makes verify exit non-zero
    and print MISMATCH + expected + actual SHA + offending filename.

    Tampers a COPY only — does not modify the canonical fixture.
    """
    root = _make_fixture_repo(
        tmp_path,
        [
            ("alpha.tls", b"alpha content"),
            ("beta.tls", b"beta content"),
        ],
    )

    # Tamper beta in place (this fixture repo is throwaway).
    target = root / "kernels" / "beta.tls"
    target.write_bytes(b"beta content TAMPERED")

    res = _run_script(VERIFY, "--root", str(root), "--manifest", str(root / "kernels" / "kernels-manifest.json"))
    assert res.returncode != 0, "verify must exit non-zero on tamper"
    assert "MISMATCH" in res.stderr, f"verify must report MISMATCH:\n{res.stderr}"
    assert "beta.tls" in res.stderr, "verify must name the offending file"
    # Both expected and actual SHAs should appear in the output (per Task 3).
    assert "expected" in res.stderr.lower()
    assert "actual" in res.stderr.lower()


def test_verify_detects_missing_file(tmp_path: Path) -> None:
    """AC3 negative: deleting a manifested kernel makes verify exit non-zero
    with a MISSING: <target_path> error naming the file.
    """
    root = _make_fixture_repo(
        tmp_path,
        [
            ("alpha.tls", b"alpha"),
            ("beta.tls", b"beta"),
        ],
    )
    (root / "kernels" / "beta.tls").unlink()

    res = _run_script(VERIFY, "--root", str(root), "--manifest", str(root / "kernels" / "kernels-manifest.json"))
    assert res.returncode != 0
    assert "MISSING" in res.stderr
    assert "beta.tls" in res.stderr


def test_verify_collects_all_errors_before_exiting(tmp_path: Path) -> None:
    """AC3 — Task 3 spec: collect all errors before exiting (not fail-fast)."""
    root = _make_fixture_repo(
        tmp_path,
        [
            ("alpha.tls", b"alpha"),
            ("beta.tls", b"beta"),
            ("gamma.tls", b"gamma"),
        ],
    )
    # Two failures: alpha missing, gamma tampered
    (root / "kernels" / "alpha.tls").unlink()
    (root / "kernels" / "gamma.tls").write_bytes(b"gamma-tampered")

    res = _run_script(VERIFY, "--root", str(root), "--manifest", str(root / "kernels" / "kernels-manifest.json"))
    assert res.returncode != 0
    # Both errors should be in the output, not just the first.
    assert "alpha.tls" in res.stderr
    assert "gamma.tls" in res.stderr
    assert "MISSING" in res.stderr
    assert "MISMATCH" in res.stderr


def test_acquire_bootstrap_mode_accepts_existing_file_with_empty_sha(tmp_path: Path) -> None:
    """When `expected_sha256` is empty (bootstrap), acquire accepts whatever is
    on disk without raising — required for the Task 5 first-fetch workflow.
    """
    root = tmp_path / "boot"
    (root / "kernels").mkdir(parents=True)
    (root / ".git").mkdir()
    (root / "kernels" / "x.tls").write_bytes(b"some content")
    manifest = {
        "schema_version": 1,
        "manifest_generated": "2026-05-18T01:00:00Z",
        "kernel_count": 1,
        "kernels": [
            {
                "file": "x.tls",
                "target_path": "kernels/x.tls",
                "source_url": "https://example.invalid/x.tls",
                "expected_sha256": "",  # bootstrap
                "size_bytes": 0,
                "kind": "lsk",
                "attribution": "test",
            }
        ],
    }
    (root / "kernels" / "kernels-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    res = _run_script(ACQUIRE, "--root", str(root), "--manifest", str(root / "kernels" / "kernels-manifest.json"))
    assert res.returncode == 0, f"bootstrap acquire must succeed: {res.stderr}\n{res.stdout}"
    assert "bootstrap" in res.stdout.lower()


def test_generate_manifest_populates_sha_and_size(tmp_path: Path) -> None:
    """`acquire --generate-manifest` walks disk and rewrites the manifest with
    accurate SHA + size for every present file (Task 4 helper).
    """
    root = tmp_path / "gen"
    (root / "kernels").mkdir(parents=True)
    (root / ".git").mkdir()
    content = b"alpha content for generation test"
    (root / "kernels" / "alpha.tls").write_bytes(content)
    manifest = {
        "schema_version": 1,
        "manifest_generated": "2026-05-18T01:00:00Z",
        "kernel_count": 1,
        "kernels": [
            {
                "file": "alpha.tls",
                "target_path": "kernels/alpha.tls",
                "source_url": "https://example.invalid/alpha.tls",
                "expected_sha256": "",
                "size_bytes": 0,
                "kind": "lsk",
                "attribution": "test",
            }
        ],
    }
    manifest_path = root / "kernels" / "kernels-manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    res = _run_script(
        ACQUIRE,
        "--root",
        str(root),
        "--manifest",
        str(manifest_path),
        "--generate-manifest",
    )
    assert res.returncode == 0, f"generate-manifest must succeed: {res.stderr}"
    updated = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert updated["kernels"][0]["expected_sha256"] == _sha256(content)
    assert updated["kernels"][0]["size_bytes"] == len(content)
    assert updated["kernel_count"] == 1
