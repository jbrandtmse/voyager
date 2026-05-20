"""Copy `bake/out/manifest.json` + `bake/out/*.bin.br` into `web/public/data/`.

Idempotent (skips files whose destination SHA-256 already matches the source).
Platform-portable: pure Python; the justfile recipe wraps this script so the
behavior is identical on Windows, macOS, and Linux (no `cp -r` / `robocopy`
divergence). Story 1.6 AC6.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def _copy_if_changed(src: Path, dst: Path) -> bool:
    """Copy `src` to `dst` if it doesn't exist or its SHA-256 differs. Returns True on copy."""
    if dst.exists():
        if _sha256(src) == _sha256(dst):
            return False  # already in sync; nothing to do
    dst.parent.mkdir(parents=True, exist_ok=True)
    # Write to a `.part` sidecar and atomic-rename to avoid leaving a half-copied
    # file on disk if the process is interrupted.
    part = dst.with_suffix(dst.suffix + ".part")
    try:
        shutil.copy2(src, part)
        part.replace(dst)
    except Exception:
        if part.exists():
            try:
                part.unlink()
            except OSError:
                pass
        raise
    return True


def copy(
    repo_root: Path | None = None,
    bake_out: Path | None = None,
    web_data: Path | None = None,
) -> int:
    """Copy manifest + VTRJ binaries from bake/out -> web/public/data/. Returns 0 on success."""
    here = Path(__file__).resolve()
    repo = (repo_root or here.parents[1]).resolve()
    src = (bake_out or (repo / "bake" / "out")).resolve()
    dst = (web_data or (repo / "web" / "public" / "data")).resolve()

    manifest_src = src / "manifest.json"
    if not manifest_src.exists():
        print(
            f"[FAIL] {manifest_src} missing -- run `just bake` first",
            file=sys.stderr,
        )
        return 1

    dst.mkdir(parents=True, exist_ok=True)

    copied = 0
    skipped = 0

    # 1) manifest.json
    changed = _copy_if_changed(manifest_src, dst / "manifest.json")
    print(f"[{'COPY' if changed else 'SKIP'}] manifest.json")
    copied += int(changed)
    skipped += int(not changed)

    # 2) *.bin.br
    for src_file in sorted(src.glob("*.bin.br")):
        target = dst / src_file.name
        changed = _copy_if_changed(src_file, target)
        print(f"[{'COPY' if changed else 'SKIP'}] {src_file.name}")
        copied += int(changed)
        skipped += int(not changed)

    print(f"[OK]    {dst}: {copied} copied, {skipped} skipped (already in sync)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Copy bake/out manifest + VTRJ binaries into web/public/data/."
    )
    parser.add_argument("--root", type=Path, default=None, help="Repo root (default: auto)")
    parser.add_argument("--bake-out", type=Path, default=None, help="Source dir (default: <repo>/bake/out)")
    parser.add_argument(
        "--web-data", type=Path, default=None, help="Destination dir (default: <repo>/web/public/data)"
    )
    args = parser.parse_args(argv)
    return copy(repo_root=args.root, bake_out=args.bake_out, web_data=args.web_data)


if __name__ == "__main__":
    sys.exit(main())
