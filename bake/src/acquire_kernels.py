"""Acquire NAIF + PDS Rings Node SPICE kernels and verify SHA-256 pins.

Canonical command (per Story 1.3 AC1):
    python bake/src/acquire_kernels.py

Behavior:
* Reads `kernels/kernels-manifest.json` relative to the repo root.
* For each entry: if `target_path` exists and SHA-256 matches `expected_sha256`,
  prints `[OK]` and skips. Otherwise downloads from `source_url` via stdlib
  `urllib.request` (no new deps per Story 1.3 Dev Notes), retries up to 3 times
  with exponential backoff on network errors, writes to `target_path`, then
  verifies SHA-256.
* Exit codes: 0 success, 1 verification failure, 2 network error.

`--generate-manifest` (one-time helper):
  Walks `kernels/` and rewrites `kernels-manifest.json` `expected_sha256` /
  `size_bytes` / `kernel_count` / `manifest_generated` fields based on
  on-disk files. Useful after the first real fetch when SHAs are unknown.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from _kernel_io import KernelEntry, load_manifest, repo_root, sha256_file

MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2.0
USER_AGENT = "voyager-bake/1.3 (+https://github.com/jbrandtmse/voyager)"


def _download(url: str, dest: Path, timeout: float = 60.0) -> Path:
    """Download `url` to a sibling `.part` file. Returns the `.part` Path.

    Caller is responsible for verifying the downloaded bytes (SHA-256) before
    atomic-renaming the `.part` file into place. We deliberately do NOT
    rename here — a hostile MITM-planted body must never appear at the
    canonical `target_path` even momentarily.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp, tmp.open("wb") as out:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
    return tmp


def _fetch_with_retry(entry: KernelEntry, dest: Path) -> Path:
    """Fetch with retries on transient network errors. Returns the `.part` path."""
    last_err: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return _download(entry.source_url, dest)
        except urllib.error.HTTPError as exc:
            # Do NOT retry permanent HTTP errors (4xx/5xx with no transient
            # signal). 408 / 429 / 5xx-but-not-501 are retryable; everything
            # else (401/403/404/410) is a permanent failure — fail fast.
            transient_codes = {408, 425, 429, 500, 502, 503, 504}
            if exc.code not in transient_codes:
                raise RuntimeError(
                    f"HTTP {exc.code} {exc.reason} for {entry.source_url}; not retrying"
                ) from exc
            last_err = exc
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last_err = exc
        if attempt < MAX_RETRIES:
            sleep_for = BACKOFF_BASE_SECONDS ** attempt
            print(
                f"  retry {attempt}/{MAX_RETRIES} for {entry.file} "
                f"after {type(last_err).__name__}: {last_err} (sleep {sleep_for:.1f}s)"
            )
            time.sleep(sleep_for)
    raise RuntimeError(f"Network error after {MAX_RETRIES} attempts: {last_err}") from last_err


def acquire(manifest_path: Path, root: Path) -> int:
    """Acquire all kernels listed in the manifest. Returns exit code."""
    if not manifest_path.exists():
        print(f"[FAIL] manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    _, entries = load_manifest(manifest_path)

    ok_count = 0
    fetched_count = 0
    failed_count = 0
    network_error = False

    for entry in entries:
        target = (root / entry.target_path).resolve()
        bootstrap = not entry.expected_sha256  # empty SHA -> bootstrap mode
        if target.exists() and not bootstrap and sha256_file(target) == entry.expected_sha256:
            print(f"[OK]     {entry.file} ({target.stat().st_size} bytes)")
            ok_count += 1
            continue
        if target.exists() and bootstrap:
            # In bootstrap mode, accept any existing file; SHA will be populated
            # later via --generate-manifest.
            print(f"[OK]     {entry.file} ({target.stat().st_size} bytes) [bootstrap, SHA not yet pinned]")
            ok_count += 1
            continue

        # Need to fetch (missing or hash mismatch)
        try:
            print(f"[FETCH]  {entry.file} <- {entry.source_url}")
            part_path = _fetch_with_retry(entry, target)
        except RuntimeError as exc:
            print(f"[FAIL]   {entry.file}: {exc}", file=sys.stderr)
            failed_count += 1
            network_error = True
            continue
        except Exception as exc:  # noqa: BLE001 — surface unexpected fetch failures
            print(f"[FAIL]   {entry.file}: {type(exc).__name__}: {exc}", file=sys.stderr)
            failed_count += 1
            continue

        # Verify the .part file BEFORE atomic-renaming into the canonical path.
        # A hostile MITM-planted body must never appear at `target_path` even
        # momentarily; mismatched bytes are deleted, not promoted.
        if bootstrap:
            # No SHA to verify against. Atomic-rename into place; caller must
            # follow up with --generate-manifest to pin the SHAs.
            part_path.replace(target)
            print(f"[FETCH]  {entry.file} ({target.stat().st_size} bytes) [bootstrap, SHA not yet pinned]")
            fetched_count += 1
            continue

        actual = sha256_file(part_path)
        if actual != entry.expected_sha256:
            try:
                part_path.unlink()
            except OSError:
                pass
            print(
                f"[FAIL]   {entry.file}: SHA-256 mismatch (rejected; .part deleted)\n"
                f"         expected {entry.expected_sha256}\n"
                f"         actual   {actual}",
                file=sys.stderr,
            )
            failed_count += 1
            continue

        part_path.replace(target)
        print(f"[FETCH]  {entry.file} ({target.stat().st_size} bytes) verified")
        fetched_count += 1

    total = len(entries)
    print(f"\n{ok_count} ok, {fetched_count} fetched, {failed_count} failed (of {total})")

    if failed_count == 0:
        return 0
    return 2 if network_error else 1


def generate_manifest(manifest_path: Path, root: Path) -> int:
    """Walk on-disk `kernels/` and update manifest SHAs / sizes / counts.

    Preserves `source_url`, `kind`, `attribution`, and entry order. Kernels
    listed in the manifest but missing on disk are skipped (with a warning);
    unknown on-disk files are not added (manifest is the source of truth).
    """
    if not manifest_path.exists():
        print(f"[FAIL] manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    updated = 0
    missing = 0
    for entry in data["kernels"]:
        target = (root / entry["target_path"]).resolve()
        if not target.exists():
            print(f"  missing on disk (skipped): {entry['file']}")
            missing += 1
            continue
        entry["expected_sha256"] = sha256_file(target)
        entry["size_bytes"] = target.stat().st_size
        updated += 1

    data["kernel_count"] = len(data["kernels"])
    data["manifest_generated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    manifest_path.write_text(
        json.dumps(data, indent=2, sort_keys=False, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"manifest updated: {updated} entries, {missing} missing on disk")
    return 0 if missing == 0 else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Acquire NAIF + PDS Rings kernels.")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="Path to kernels-manifest.json (default: <repo>/kernels/kernels-manifest.json)",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=None,
        help="Repo root (default: auto-detected)",
    )
    parser.add_argument(
        "--generate-manifest",
        action="store_true",
        help="Recompute SHA-256 / size_bytes from on-disk kernels and rewrite manifest.",
    )
    args = parser.parse_args(argv)

    root = (args.root or repo_root()).resolve()
    manifest_path = (args.manifest or (root / "kernels" / "kernels-manifest.json")).resolve()

    if args.generate_manifest:
        return generate_manifest(manifest_path, root)
    return acquire(manifest_path, root)


if __name__ == "__main__":
    # Allow `python bake/src/acquire_kernels.py` from repo root by ensuring
    # this directory is on sys.path for the _kernel_io import.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.exit(main())
