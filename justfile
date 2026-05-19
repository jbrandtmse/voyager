# Voyager — repo-root justfile (Story 1.4)
#
# Canonical command runner across the bake (Python / uv) and web (TypeScript /
# Vite) halves. All Python invocations use `uv run` to guarantee the right
# interpreter and pinned dependencies (NFR-R4). Each recipe declares its
# `working-directory` explicitly so recipes are single-tool invocations and
# don't depend on the host shell's `&&` chaining (Windows PowerShell 5.1 lacks
# `&&`).
#
# Run `just` (no args) or `just --list` to see this list.

set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

# Default recipe: list available recipes.
default:
    @just --list

# --- Bake half --------------------------------------------------------------

# Bake VTRJ trajectory binaries from pinned kernels (Story 1.4 AC1).
[working-directory("bake")]
bake:
    uv run python -m src.bake_trajectories

# Run the Layer-1 Python validation harness against baked VTRJ files (Story 1.4 AC4).
[working-directory("bake")]
validate:
    uv run python -m src.validate_l1

# Acquire NAIF + PDS Rings kernels (Story 1.3). Idempotent.
[working-directory("bake")]
fetch-kernels:
    uv run python -m src.acquire_kernels

# Verify on-disk kernel SHA-256 pins (Story 1.3). Exits non-zero on drift.
[working-directory("bake")]
verify-kernels:
    uv run python -m src.verify_kernels

# Regenerate the CK coverage inventory (Story 1.3 AC5).
[working-directory("bake")]
ck-inventory:
    uv run python -m src.ck_inventory

# Regenerate the FK frame-ID reference (Story 1.3 AC6).
[working-directory("bake")]
fk-inventory:
    uv run python -m src.fk_inventory

# Regenerate the ADR catalogue index (Story 1.2).
adr-index:
    uv run python scripts/adr-index.py

# Run the bake test suite (fast tests; excludes @pytest.mark.slow).
[working-directory("bake")]
test-bake:
    uv run pytest -m "not slow"

# Run the bake test suite including slow end-to-end tests.
[working-directory("bake")]
test-bake-slow:
    uv run pytest

# Run the web test suite (vitest).
[working-directory("web")]
test-web:
    npm test

# Stub — Story 1.6 owns the real implementation.
copy-bake-to-web:
    @echo "stub: copies bake/out/* into web/public/data/ - implemented in Story 1.6"
