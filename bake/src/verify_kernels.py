"""Verify NAIF + PDS Rings Node kernels against `kernels/kernels-manifest.json`.

Canonical command (per Story 1.3 AC3):
    python bake/src/verify_kernels.py

Behavior:
* Reads the manifest; for each entry asserts the target file exists and its
  SHA-256 matches `expected_sha256`.
* Collects ALL errors (missing + mismatch) before exiting.
* Exit codes: 0 on full match; non-zero (1) on any failure.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _kernel_io import load_manifest, repo_root, sha256_file


def verify(manifest_path: Path, root: Path) -> int:
    if not manifest_path.exists():
        print(f"[FAIL] manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    _, entries = load_manifest(manifest_path)
    errors: list[str] = []

    for entry in entries:
        target = (root / entry.target_path).resolve()
        if not target.exists():
            errors.append(f"MISSING: {entry.target_path}")
            continue
        actual = sha256_file(target)
        if actual != entry.expected_sha256:
            errors.append(
                f"MISMATCH: {entry.target_path}\n"
                f"  expected {entry.expected_sha256}\n"
                f"  actual   {actual}"
            )

    if errors:
        for line in errors:
            print(line, file=sys.stderr)
        print(f"\n{len(errors)} verification error(s) of {len(entries)} kernels", file=sys.stderr)
        return 1

    print(f"OK: {len(entries)} kernels verified")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify NAIF + PDS Rings kernels.")
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
    args = parser.parse_args(argv)

    root = (args.root or repo_root()).resolve()
    manifest_path = (args.manifest or (root / "kernels" / "kernels-manifest.json")).resolve()
    return verify(manifest_path, root)


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.exit(main())
