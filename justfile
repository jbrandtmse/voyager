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
# Story 3.1 AC6: `bake` chains into `bake-attitude` so `just bake` produces
# BOTH trajectory AND attitude VTRJ binaries.
# Story 3.3 AC2: `bake` ALSO chains into `bake-glb` so the spacecraft GLB
# LOD chain is regenerated as part of the full bake. The order matters
# only via the manifest fragment: `bake-glb` writes
# `bake/out/models-manifest-fragment.json`, which `bake-attitude` reads
# when emitting the master manifest (so the `models[]` section is
# populated). `bake-glb` runs FIRST in the chain so its fragment is on
# disk by the time `ck_sample.py` runs.
[working-directory("bake")]
bake: bake-glb bake-attitude

# Bake the trajectory half only (Story 1.4 baseline; rarely needed standalone).
[working-directory("bake")]
bake-trajectories:
    uv run python -m src.bake_trajectories

# Bake VTRJ attitude binaries from CK kernels (Story 3.1 AC6, ADR-0024).
# Depends on `bake-trajectories` so the trajectory manifest exists before
# `ck_sample.py` extends it with attitude entries.
[working-directory("bake")]
bake-attitude: bake-trajectories
    uv run python -m src.ck_sample

# Story 3.3 AC2 — bake the Voyager spacecraft GLB LOD chain.
# Runs `web/scripts/build_glb.ts` (gltf-transform + meshopt + toktx KTX2)
# which reads `bake/inputs/models/voyager-raw.glb` + the mesh-mapping JSON,
# produces 4 content-hashed LOD GLBs at `web/public/models/`, and emits
# `bake/out/models-manifest-fragment.json` (consumed by `bake-attitude` /
# `bake-trajectories` to merge into the master manifest's `models[]`).
# REQUIRES `toktx` (Khronos KTX-Software) on PATH — see
# `web/public/models/README.md` § Prerequisites.
[working-directory("web")]
bake-glb:
    npm run build-glb

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

# Copy `bake/out/manifest.json` + `bake/out/*.bin.br` into `web/public/data/`.
# Idempotent — re-running with unchanged inputs produces no diff. Story 1.6 AC6.
copy-bake-to-web:
    uv run python scripts/copy_bake_to_web.py

# Generate L2 reference fixtures (sparse SpiceyPy ground truth) for the
# web-side EphemerisService AC4 hook test. Story 1.6 AC4.
[working-directory("bake")]
generate-l2-fixtures:
    uv run python -m src.generate_l2_fixtures
