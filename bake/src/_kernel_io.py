"""Shared helpers for kernel acquisition + verification.

Internal to the bake package. Public surface: `acquire_kernels.py` and
`verify_kernels.py` import from here. Kept stdlib-only (per Story 1.3 Dev Notes:
"No new Python dependencies without an ADR").
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

CHUNK_SIZE = 1 << 20  # 1 MiB read chunks

SUPPORTED_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class KernelEntry:
    file: str
    target_path: str
    source_url: str
    expected_sha256: str
    size_bytes: int
    kind: str
    attribution: str


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(CHUNK_SIZE), b""):
            h.update(chunk)
    return h.hexdigest()


def load_manifest(manifest_path: Path) -> tuple[dict, list[KernelEntry]]:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    schema = data.get("schema_version")
    if schema != SUPPORTED_SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported manifest schema_version {schema!r}; "
            f"this runtime supports schema_version {SUPPORTED_SCHEMA_VERSION}. "
            f"(Architecture commitment: runtime refuses to load unknown major schemaVersion.)"
        )
    entries = [
        KernelEntry(
            file=k["file"],
            target_path=k["target_path"],
            source_url=k["source_url"],
            expected_sha256=k["expected_sha256"],
            size_bytes=int(k["size_bytes"]),
            kind=k["kind"],
            attribution=k["attribution"],
        )
        for k in data["kernels"]
    ]
    return data, entries


def repo_root(start: Path | None = None) -> Path:
    """Locate the repo root by walking up from `start` (or this file) until a
    `.git` directory or a `kernels-manifest.json` is found.
    """
    cur = (start or Path(__file__)).resolve()
    for parent in [cur, *cur.parents]:
        if (parent / ".git").exists() or (parent / "kernels" / "kernels-manifest.json").exists():
            return parent
    return cur.parents[-1]
