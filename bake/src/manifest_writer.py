"""Bake manifest emitter (`bake/out/manifest.json`).

Schema is locked to Decision 1b (architecture.md lines 263–289). Output JSON is
deterministic modulo `bakeTimestamp` and `bakeCommit`: sorted keys, 2-space
indent, no trailing whitespace, UTF-8, no BOM. Story 1.4 pins `schemaVersion = 1`;
future stories bump on additive schema changes.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
VALIDATION_TOLERANCES: dict[str, float] = {
    "maxPositionErrorKm": 20.0,
    "rmsPositionErrorKm": 5.0,
}


@dataclass(frozen=True)
class FileEntry:
    """Per-file entry inside a body's `files` array. Mirrors Decision 1b."""

    timeRangeEt: tuple[float, float]
    cadenceSec: float
    kind: str  # "trajectory" for Story 1.4; "attitude" / "chapter" in later stories
    url: str  # path relative to web/public/data/ once Story 1.6 copies bakes into place
    sha256: str
    sizeBytes: int


@dataclass(frozen=True)
class BodyEntry:
    """Per-spacecraft body record. `naifId` is the NAIF SPK target ID."""

    naifId: int
    name: str
    files: list[FileEntry]


@dataclass(frozen=True)
class KernelRef:
    """Lean reference to a kernel used at bake time (subset of kernels-manifest.json)."""

    file: str
    sha256: str
    kind: str
    source_url: str


def _git_head_sha(repo_root: Path) -> str:
    """Return `git rev-parse HEAD` or `"unknown"` if git unavailable."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo_root),
            check=True,
            capture_output=True,
            text=True,
            timeout=10.0,
        )
        return result.stdout.strip() or "unknown"
    except (subprocess.CalledProcessError, FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return "unknown"


def _file_entry_to_dict(fe: FileEntry) -> dict[str, Any]:
    return {
        "cadenceSec": float(fe.cadenceSec),
        "kind": fe.kind,
        "sha256": fe.sha256,
        "sizeBytes": int(fe.sizeBytes),
        "timeRangeEt": [float(fe.timeRangeEt[0]), float(fe.timeRangeEt[1])],
        "url": fe.url,
    }


def _body_entry_to_dict(be: BodyEntry) -> dict[str, Any]:
    return {
        "files": [_file_entry_to_dict(f) for f in be.files],
        "naifId": int(be.naifId),
        "name": be.name,
    }


def _kernel_ref_to_dict(kr: KernelRef) -> dict[str, Any]:
    return {
        "file": kr.file,
        "kind": kr.kind,
        "sha256": kr.sha256,
        "source_url": kr.source_url,
    }


def emit_manifest(
    bodies: list[BodyEntry],
    kernels: list[KernelRef],
    output_path: Path,
    repo_root: Path,
    bake_timestamp: datetime | None = None,
) -> dict[str, Any]:
    """Write `bake/out/manifest.json` per Decision 1b. Returns the dict written.

    `bake_timestamp` defaults to `datetime.now(UTC)` — pass an explicit value
    in tests if you need determinism on that single field.
    """
    ts = bake_timestamp or datetime.now(timezone.utc)
    manifest: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "bakeCommit": _git_head_sha(repo_root),
        "bakeTimestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "kernels": [_kernel_ref_to_dict(k) for k in kernels],
        "bodies": [_body_entry_to_dict(b) for b in bodies],
        "chapters": [],  # populated in Story 2.1
        "validationTolerances": dict(VALIDATION_TOLERANCES),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    part = output_path.with_suffix(output_path.suffix + ".part")
    try:
        part.write_text(payload, encoding="utf-8", newline="\n")
        part.replace(output_path)
    except Exception:
        if part.exists():
            try:
                part.unlink()
            except OSError:
                pass
        raise
    return manifest


def load_manifest(path: Path) -> dict[str, Any]:
    """Read and parse `bake/out/manifest.json` (or any compatible Decision 1b doc)."""
    return json.loads(path.read_text(encoding="utf-8"))


def strip_volatile_fields(manifest: dict[str, Any]) -> dict[str, Any]:
    """Return a copy with `bakeTimestamp` and `bakeCommit` removed (for determinism tests)."""
    return {k: v for k, v in manifest.items() if k not in ("bakeTimestamp", "bakeCommit")}
