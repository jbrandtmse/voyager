"""One-off helper for Story 1.16.

For each file entry in the runtime manifest, decompress the .bin.br
brotli payload and compute SHA-256 of the decompressed body. Write the
result back into the manifest as a new field `decompressedSha256`
alongside the existing `sha256` (which stays as SHA-on-compressed for
bake-side determinism gating per NFR-R4).

Runtime chunk-loader (Story 1.16) reads `decompressedSha256` because
Vite + Cloudflare serve .bin.br with `Content-Encoding: br`, so the
browser HTTP layer transparently decompresses and `fetch().arrayBuffer()`
returns the decompressed bytes. The runtime never sees the compressed
bytes, so the original `sha256` can't be verified at the client.

Usage (from project root):
    python3 bake/scripts/add_decompressed_sha.py

Input:  web/public/data/manifest.json
Output: web/public/data/manifest.json (modified in place)
"""

from __future__ import annotations

import brotli
import hashlib
import json
import sys
from pathlib import Path


def add_decompressed_shas(manifest_path: Path, data_dir: Path) -> None:
    manifest = json.loads(manifest_path.read_text())
    total = 0
    updated = 0
    skipped_no_change = 0
    for body in manifest.get("bodies", []):
        for f in body.get("files", []):
            total += 1
            url = f["url"]
            # url is like "data/voyager-1-seg01--....bin.br"
            local = data_dir / Path(url).name
            if not local.exists():
                print(f"  SKIP: {url} not found at {local}", file=sys.stderr)
                continue
            compressed = local.read_bytes()
            decompressed = brotli.decompress(compressed)
            new_sha = hashlib.sha256(decompressed).hexdigest()
            existing = f.get("decompressedSha256")
            if existing == new_sha:
                skipped_no_change += 1
            else:
                f["decompressedSha256"] = new_sha
                updated += 1
                print(
                    f"  {Path(url).name}: "
                    f"compressed_sha={f['sha256'][:12]}... "
                    f"decompressed_sha={new_sha[:12]}... "
                    f"decompressed_size={len(decompressed)}"
                )
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(
        f"\nDone. Files processed: {total}. "
        f"Updated: {updated}. Unchanged: {skipped_no_change}.",
        file=sys.stderr,
    )


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    manifest_path = repo_root / "web" / "public" / "data" / "manifest.json"
    data_dir = repo_root / "web" / "public" / "data"
    if not manifest_path.exists():
        print(f"manifest not found at {manifest_path}", file=sys.stderr)
        return 1
    add_decompressed_shas(manifest_path, data_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
