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
    """Per-file entry inside a body's `files` array. Mirrors Decision 1b.

    Story 3.1 AC3: `provenance` is an OPTIONAL field (default None) marking the
    source of attitude data — currently `"ck"` for samples extracted from
    SPICE CK kernels via `ck_sample.py`. Future stories may introduce other
    provenance markers (e.g. `"synthesized"` for the cruise HGA-Earth pointing
    Story 3.2 owns). For trajectory entries, provenance remains None so the
    pre-Story-3.1 manifest serialization is byte-identical (no new key emitted
    when the value is None — see `_file_entry_to_dict`).

    schemaVersion remains 1: the runtime ManifestSchema in `manifest-loader.ts`
    uses Zod v4 z.object() which silently strips unknown keys by default
    (verified against Zod 4.4.3 in web/node_modules), so this extension is
    forward-compatible with the existing loader. Story 3.2 will add the
    provenance field to the loader's schema when it consumes attitude entries.
    """

    timeRangeEt: tuple[float, float]
    cadenceSec: float
    kind: str  # "trajectory" | "bus_attitude" | "platform_attitude" | "chapter"
    url: str  # path relative to web/public/data/ once Story 1.6 copies bakes into place
    sha256: str
    sizeBytes: int
    provenance: str | None = None  # Story 3.1 AC3: "ck" for attitude entries; None for trajectory


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
    out: dict[str, Any] = {
        "cadenceSec": float(fe.cadenceSec),
        "kind": fe.kind,
        "sha256": fe.sha256,
        "sizeBytes": int(fe.sizeBytes),
        "timeRangeEt": [float(fe.timeRangeEt[0]), float(fe.timeRangeEt[1])],
        "url": fe.url,
    }
    # Story 3.1 AC3: emit `provenance` ONLY when non-None so existing trajectory
    # manifest entries stay byte-identical on disk (forward-compat for Story 1.4
    # baseline tests + the runtime manifest-loader Zod schema).
    if fe.provenance is not None:
        out["provenance"] = str(fe.provenance)
    return out


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


def _validate_models_fragment(models: list[dict[str, Any]]) -> None:
    """Story 3.3 AC4 — defensive schema check before merging the models fragment.

    The TS-side `web/scripts/build_glb.ts` emits a manifest fragment matching
    the runtime Zod schema in `web/src/services/manifest-loader.ts`. We assert
    the same shape here so a malformed fragment fails the bake rather than
    surfacing as a Zod validation error at runtime (which would block first
    paint on every contributor's machine after a bad `just bake-glb`). The
    checks are deliberately conservative — we only validate the AC4 contract
    that the runtime Zod schema mirrors; future additive fields pass through.
    """
    if not isinstance(models, list):
        raise ValueError(f"models fragment must be a list, got {type(models).__name__}")
    for i, m in enumerate(models):
        if not isinstance(m, dict):
            raise ValueError(f"models[{i}] must be a dict, got {type(m).__name__}")
        if "id" not in m or not isinstance(m["id"], str) or not m["id"]:
            raise ValueError(f"models[{i}].id must be a non-empty string")
        lods = m.get("lods")
        if not isinstance(lods, list) or len(lods) < 1:
            raise ValueError(f"models[{i}].lods must be a non-empty list")
        for j, lod in enumerate(lods):
            if not isinstance(lod, dict):
                raise ValueError(f"models[{i}].lods[{j}] must be a dict")
            level = lod.get("level")
            if not isinstance(level, int) or level < 0 or level > 3:
                raise ValueError(f"models[{i}].lods[{j}].level must be int 0..3")
            sha = lod.get("sha256")
            if (
                not isinstance(sha, str)
                or len(sha) != 64
                or not all(c in "0123456789abcdef" for c in sha)
            ):
                raise ValueError(f"models[{i}].lods[{j}].sha256 must be 64-char lowercase hex")
            sz = lod.get("sizeBytes")
            if not isinstance(sz, int) or sz <= 0:
                raise ValueError(f"models[{i}].lods[{j}].sizeBytes must be positive int")
            mdk = lod.get("maxDistanceKm")
            if mdk is not None and (not isinstance(mdk, (int, float)) or mdk <= 0):
                raise ValueError(
                    f"models[{i}].lods[{j}].maxDistanceKm must be positive number or null"
                )
            if not isinstance(lod.get("url"), str) or not lod["url"]:
                raise ValueError(f"models[{i}].lods[{j}].url must be a non-empty string")
        pivot = m.get("pivotMeters")
        if (
            not isinstance(pivot, list)
            or len(pivot) != 3
            or not all(isinstance(v, (int, float)) for v in pivot)
        ):
            raise ValueError(f"models[{i}].pivotMeters must be a 3-tuple of numbers")
        s = m.get("scaleToKm")
        if not isinstance(s, (int, float)) or s <= 0:
            raise ValueError(f"models[{i}].scaleToKm must be a positive number")


def emit_manifest(
    bodies: list[BodyEntry],
    kernels: list[KernelRef],
    output_path: Path,
    repo_root: Path,
    bake_timestamp: datetime | None = None,
    models: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Write `bake/out/manifest.json` per Decision 1b. Returns the dict written.

    `bake_timestamp` defaults to `datetime.now(UTC)` — pass an explicit value
    in tests if you need determinism on that single field.

    Story 3.3 AC4: `models` is an OPTIONAL list of model fragments (id + lods
    + pivotMeters + scaleToKm) emitted by `web/scripts/build_glb.ts` into
    `bake/out/models-manifest-fragment.json`. When `None`, the `models` key is
    OMITTED from the manifest entirely (so the no-bake state stays byte-stable
    against the pre-Story-3.3 manifest). When non-None, the fragment is
    validated against the AC4 contract and merged verbatim.
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
    # Story 3.3 AC4: emit `models` only when provided. Validate before merge.
    if models is not None:
        _validate_models_fragment(models)
        manifest["models"] = models
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
