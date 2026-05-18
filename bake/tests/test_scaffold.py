"""Story 1.1 scaffold tests for the bake half.

These tests assert the static configuration produced by Story 1.1's AC2:
- spiceypy is pinned at exactly 8.1.0 (NFR-R4 byte-identical bake)
- scipy, numpy are declared as runtime deps
- ruff, pytest, pytest-cov are declared as dev deps
- CSPICE toolkit is importable and reports a non-empty version

The CSPICE-toolkit test is skipped (not failed) when spiceypy cannot be
imported, so the suite remains green in environments where the .venv has
not been hydrated (e.g. a fresh clone before `uv sync`).
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
BAKE_DIR = REPO_ROOT / "bake"
PYPROJECT = BAKE_DIR / "pyproject.toml"


def _load_pyproject() -> dict:
    with PYPROJECT.open("rb") as f:
        return tomllib.load(f)


def test_spiceypy_is_pinned_exactly_at_8_1_0() -> None:
    """AC2: spiceypy must use `==` (not `>=` or `~=`) at version 8.1.0.

    Per architecture Decision 1d / NFR-R4, byte-identical bake reproducibility
    requires an exact pin.
    """
    pyproject = _load_pyproject()
    deps: list[str] = pyproject["project"]["dependencies"]
    spice_entries = [d for d in deps if d.lower().startswith("spiceypy")]
    assert len(spice_entries) == 1, f"Expected exactly one spiceypy entry, got: {spice_entries}"
    entry = spice_entries[0]
    assert re.fullmatch(r"spiceypy\s*==\s*8\.1\.0", entry), (
        f"spiceypy must be pinned with `==8.1.0` exactly (not >=, ~=, or any range). Got: {entry!r}"
    )


@pytest.mark.parametrize("dep_name", ["scipy", "numpy"])
def test_runtime_dep_declared(dep_name: str) -> None:
    """AC2: scipy and numpy must be declared as runtime deps."""
    pyproject = _load_pyproject()
    deps: list[str] = pyproject["project"]["dependencies"]
    names = [re.split(r"[<>=~!]", d, maxsplit=1)[0].strip().lower() for d in deps]
    assert dep_name in names, f"Runtime dep `{dep_name}` missing from pyproject.toml. Got: {names}"


@pytest.mark.parametrize("dep_name", ["ruff", "pytest", "pytest-cov"])
def test_dev_dep_declared(dep_name: str) -> None:
    """AC2: ruff, pytest, pytest-cov must be declared as dev deps."""
    pyproject = _load_pyproject()
    dev_deps: list[str] = pyproject.get("dependency-groups", {}).get("dev", [])
    names = [re.split(r"[<>=~!]", d, maxsplit=1)[0].strip().lower() for d in dev_deps]
    assert dep_name in names, f"Dev dep `{dep_name}` missing from pyproject.toml. Got: {names}"


def test_python_version_pin_present() -> None:
    """AC2: requires-python pins 3.13."""
    pyproject = _load_pyproject()
    requires = pyproject["project"]["requires-python"]
    assert "3.13" in requires, f"requires-python should reference 3.13. Got: {requires!r}"


def test_repo_root_python_version_file_pins_3_13() -> None:
    """AC2: the repo-root .python-version file is canonical and pins 3.13."""
    pv_file = REPO_ROOT / ".python-version"
    assert pv_file.exists(), f".python-version not found at {pv_file}"
    assert pv_file.read_text().strip() == "3.13", (
        f"Root .python-version must contain exactly `3.13`. Got: {pv_file.read_text()!r}"
    )


def test_uv_lock_is_committed() -> None:
    """AC2: bake/uv.lock must be present (load-bearing for NFR-R4 determinism)."""
    lock = BAKE_DIR / "uv.lock"
    assert lock.exists(), f"bake/uv.lock missing — required for deterministic bakes (NFR-R4)"
    assert lock.stat().st_size > 0, "bake/uv.lock is empty"


def test_gitattributes_declares_naif_lfs_patterns() -> None:
    """AC2: .gitattributes must declare the NAIF kernel extensions as LFS-tracked.

    Story 1.1 declared six; Story 1.3 added `.tpc` (the actual extension on
    text PCK kernels we ship — Story 1.1's list said `.pck` but the generic
    PCK file is `pck00011.tpc`).
    """
    gitattrs = REPO_ROOT / ".gitattributes"
    assert gitattrs.exists(), f".gitattributes not found at {gitattrs}"
    contents = gitattrs.read_text()
    for ext in ("*.bsp", "*.bc", "*.tf", "*.tsc", "*.tls", "*.pck", "*.tpc"):
        # Each NAIF extension must be declared with LFS filter.
        pattern = re.compile(
            rf"^\s*{re.escape(ext)}\s+.*filter=lfs",
            re.MULTILINE,
        )
        assert pattern.search(contents), (
            f"NAIF extension {ext} not declared as LFS-tracked in .gitattributes"
        )


def test_spiceypy_imports_and_reports_toolkit_version() -> None:
    """AC1: SpiceyPy must be importable and tkvrsn('TOOLKIT') must return a non-empty string.

    Skipped (not failed) if spiceypy is not available in the test environment —
    this allows the test suite to remain green on systems where the .venv has
    not been hydrated. CI runs inside `uv run` so this test will execute there.
    """
    try:
        import spiceypy  # noqa: WPS433 — runtime import is intentional
    except ImportError:
        pytest.skip("spiceypy not importable — run via `uv run pytest` to hydrate the venv")

    version = spiceypy.tkvrsn("TOOLKIT")
    assert isinstance(version, str), f"tkvrsn('TOOLKIT') must return str, got {type(version)}"
    assert version.strip(), "tkvrsn('TOOLKIT') returned an empty/whitespace string"
    # SpiceyPy 8.1.0 wraps CSPICE N0067 per the architecture; assert prefix loosely.
    assert "CSPICE" in version.upper() or "N00" in version.upper(), (
        f"Expected CSPICE toolkit version string, got: {version!r}"
    )


def test_spiceypy_installed_version_matches_pin() -> None:
    """AC2 sanity check: the importable spiceypy must report version 8.1.0.

    Skipped if spiceypy is not installed in the test environment.
    """
    try:
        import spiceypy  # noqa: WPS433
    except ImportError:
        pytest.skip("spiceypy not importable — run via `uv run pytest`")

    installed = getattr(spiceypy, "__version__", None)
    if installed is None:
        # Fall back to importlib.metadata for environments where __version__ is absent.
        from importlib.metadata import version as pkg_version

        installed = pkg_version("spiceypy")
    assert installed == "8.1.0", (
        f"Installed spiceypy must be exactly 8.1.0 (NFR-R4). Got: {installed!r}"
    )
