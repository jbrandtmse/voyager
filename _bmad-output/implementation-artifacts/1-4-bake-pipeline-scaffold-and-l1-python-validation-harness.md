# Story 1.4: Bake Pipeline Scaffold and L1 Python Validation Harness

Status: done

## Story

As the project maintainer,
I want a deterministic Python bake step that produces VTRJ binary trajectory files from pinned kernels plus a Layer-1 validation harness that gates accuracy,
so that subsequent web stories consume real interpolated data, the byte-identical-rebuild guarantee (NFR-R4) holds, and FR51 / FR55 (L1) are operational.

## Acceptance Criteria

**AC1 — `just bake` produces VTRJ trajectory binaries + manifest:**
- **Given** kernels are present and SHA-verified (Story 1.3),
- **When** the developer runs `just bake` from the repo root,
- **Then** `bake/out/manifest.json` is generated listing both Voyager spacecraft with **one VTRJ per SPK segment per spacecraft** (V1: 7 segments, V2: 11 segments — totalling 18 VTRJ files) covering the mission window 1977-08-20 → 2030-12-31,
- **And** each VTRJ file is at `bake/out/<body-slug>-seg<NN>-<int_et_start>-<int_et_end>.bin.br` (e.g., `bake/out/voyager-1-seg01--704412036--704170304.bin.br`), brotli-compressed,
- **And** each VTRJ file conforms to the format: 40-byte little-endian header followed by a Float64Array body of `sample_count × 6` doubles (x, y, z, vx, vy, vz per sample, units in km and km/s, J2000 ecliptic frame),
- **And** the manifest's `bodies[].files[]` array references each segment file by `url`, `sha256`, `sizeBytes`, `timeRangeEt`, `cadenceSec`, `kind: "trajectory"`,
- **And** the manifest top-level fields match the schema in architecture.md Decision 1b: `schemaVersion: 1`, `bakeCommit` (git SHA at bake time), `bakeTimestamp` (ISO-8601 UTC).
- **Note (amendment from dev):** The original AC1 wording said "one VTRJ file each" per spacecraft. During implementation, dev discovered that the pinned NAIF Voyager merged SPKs contain segment-boundary position discontinuities (V1 has a 2,103,302 km jump at 1985-12-31T23:59:05 between segments — verified via sub-second `spkgeo` probing) that no single-VTRJ-per-body Cubic Hermite spline can bridge. Team-lead approved Option B: per-segment VTRJ chunking, activating Decision 1b's `files[]` array. The architecture's `files` array was specifically designed to support this (cf. architecture.md lines 263-289), so this is an activation, not a schema change.

**AC2 — VTRJ header structure is precise and self-describing:**
- **Given** a VTRJ binary,
- **When** the first 40 bytes are inspected,
- **Then** the header layout is exactly:
  ```
  offset  size  field             type        notes
  ------  ----  ----------------  ----------  -------------------------------------
   0       4    magic             bytes       ASCII "VTRJ"
   4       2    version           u16 LE      = 1
   6       4    body_id           i32 LE      NAIF ID (-31 = V1, -32 = V2)
  10       8    et_start          f64 LE      ephemeris-time start of window
  18       8    et_end            f64 LE      ephemeris-time end of window
  26       4    sample_count      u32 LE      number of samples (state vectors)
  30       8    cadence_seconds   f64 LE      uniform sample cadence
  38       2    reserved          bytes       must be 0x0000
  ```
- **And** any file with an unexpected `magic` or `version != 1` causes the bake to fail at write time and the runtime loader (future Story 1.6) to reject it.
- **And** the runtime body layout per sample is exactly `[x, y, z, vx, vy, vz]` as 6 consecutive f64 LE values (no padding); the implied per-sample bytes-size is 48.

**AC3 — Byte-identical rebuilds (NFR-R4):**
- **Given** the bake has produced VTRJ outputs,
- **When** `just bake` is run a second time on an unchanged kernel set,
- **Then** every VTRJ output file's SHA-256 is unchanged between runs,
- **And** `bake/out/manifest.json` is byte-identical between runs *except for* `bakeTimestamp` (and `bakeCommit` if HEAD changed). The dev should structure the manifest emission such that the `bakeTimestamp` field is the last-written field or otherwise easy to canonicalize when testing determinism. Tests must compare manifests with `bakeTimestamp` (and `bakeCommit`) stripped to assert byte-identicality.

**AC4 — `just validate` runs the L1 harness and gates accuracy:**
- **Given** the bake has produced VTRJ outputs,
- **When** the developer runs `just validate` from the repo root,
- **Then** the L1 Python harness:
  1. Samples both spacecraft on a dense SPICE reference grid via SpiceyPy `spkgeo` / `spkpos` (cadence: at least 10× denser than the bake — e.g., 6-hour grid against daily bake)
  2. For each reference sample, interpolates the corresponding VTRJ data via `scipy.interpolate.CubicHermiteSpline` over both position and velocity
  3. Computes per-body **max position error** (worst single-sample 3D Euclidean distance, in km) and **RMS position error** (root-mean-square over all samples, in km)
  4. Writes a markdown report to `bake/out/validation-report.md` with per-body max + RMS, sample count, reference cadence, bake cadence, and a pass/fail summary
- **And** the harness asserts `max_pos_error_km ≤ 20` and `rms_pos_error_km ≤ 5` for both V1 and V2 across the full 1977–2030 window (NFR-P9),
- **And** the harness exits non-zero (exit code 1) if either threshold is exceeded for either spacecraft, printing which spacecraft/threshold failed.

**AC5 — Module organization matches architecture.md:**
- **Given** the bake pipeline,
- **When** `bake/src/` is inspected,
- **Then** the trajectory bake code is split into these architecture-named modules:
  - `bake/src/bake_trajectories.py` — orchestration: reads kernels, calls SpiceyPy on an ET grid for each body, calls VTRJ writer, emits per-body file
  - `bake/src/vtrj_writer.py` — VTRJ format: takes (body_id, et_start, et_end, samples) and writes a `.bin.br` (brotli wrapper around the raw little-endian body)
  - `bake/src/validate_l1.py` — L1 harness: reads VTRJ outputs, samples SPICE reference, interpolates, computes errors, writes report, gates thresholds
  - `bake/src/manifest_writer.py` — emits `bake/out/manifest.json` per the Decision 1b schema
- **Note:** The epic-level AC3 (epics.md line 517) listed module names as `sample.py`, `binary_writer.py`, `bake.py`, `validation.py` — these names DIVERGE from the architecture document's canonical names (`bake_trajectories.py`, `vtrj_writer.py`, `bake.py`, `validate_l1.py`, `manifest_writer.py`). **The architecture-canonical names win** because they are consistent throughout the architecture doc, anchor source-tree references in repo-layout sections, and are cited by ADR 0011 and Decision 1b. If the dev sees the epic-summary names referenced elsewhere, point to this Dev Note as the resolution.
- **And** each module has a corresponding `pytest` unit test in `bake/tests/`.

**AC6 — `justfile` introduced with `bake`, `validate`, and supporting recipes:**
- **Given** Story 1.4 owns the justfile introduction (Story 1.2's ADR work referenced `python scripts/adr-index.py` as a placeholder for `just adr-index`; Story 1.3 used `python bake/src/acquire_kernels.py` as a placeholder for `just fetch-kernels`),
- **When** `c:\git\Voyager\justfile` is inspected,
- **Then** the justfile defines at least these recipes (additional are fine):
  - `bake` — runs the trajectory bake (`uv run python -m bake.src.bake_trajectories` or equivalent)
  - `validate` — runs the L1 harness (`uv run python -m bake.src.validate_l1`)
  - `fetch-kernels` — wraps Story 1.3's `python bake/src/acquire_kernels.py`
  - `verify-kernels` — wraps Story 1.3's `python bake/src/verify_kernels.py`
  - `adr-index` — wraps Story 1.2's `python scripts/adr-index.py`
  - `test-bake` — runs `uv run pytest` from `bake/`
  - `test-web` — runs `npm test` from `web/`
- **And** `just --list` produces a clean list of all recipes (no parse errors)
- **And** the README's "Kernels" section + ADR section are updated to reference the just-based commands as canonical (with the python-direct invocations as fallback for contributors who don't have `just` installed)

**AC7 — `just copy-bake-to-web` exists but is a no-op stub (Story 1.6 owns the real impl):**
- **Given** the bake pipeline,
- **When** `just copy-bake-to-web` is invoked,
- **Then** the recipe exists in the justfile (so subsequent stories don't need to reorganize), but it can be a stub that prints "stub: copies bake/out/* into web/public/data/ — implemented in Story 1.6" and exits 0. **Do not implement the actual copy in this story** — Story 1.6 owns the asset manifest loader on the web side and is the natural home for this orchestration step.

## Tasks / Subtasks

- [x] **Task 1 — Confirm `just` is installed on the dev environment**
  - [x] Check `just --version` works. If not installed: surface as `clarification_needed`. `just` is a Cargo-based command runner; the user may install via `winget install --id Casey.Just --accept-source-agreements --accept-package-agreements` or `cargo install just`.
  - [x] Do NOT auto-install `just`. Like `uv` in Story 1.1, this is a one-time user-level install decision.

- [x] **Task 2 — Author `bake/src/bake_trajectories.py`** (AC: #1, #2, #3)
  - [x] CLI entry: `python -m bake.src.bake_trajectories` (or equivalent direct path invocation) — **Implemented as `python -m src.bake_trajectories` from `bake/`** (equivalent path; `bake.src.X` requires a `bake/__init__.py` which doesn't exist and would change the package layout).
  - [x] Reads kernel set from `kernels/` using Story 1.3's manifest as the source of truth (load via `bake.src._kernel_io.load_manifest`)
  - [x] Uses SpiceyPy: `spiceypy.furnsh()` on LSK first, then PCK, then FK, then SCLK, then SPK; query state vectors via `spkgeo`. **Per-segment chunking active:** each spacecraft's SPK segments (V1: 7, V2: 11) are enumerated via DAF iteration (`dafopr`/`dafbfs`/`daffna`), and one VTRJ is emitted per segment with cadence chosen by `clamp(span/8192, 60, 86400)`.
  - [x] For each spacecraft (V1 = -31, V2 = -32):
    - Compute the ET array from `et_start` to `et_end` at the configured cadence (per-segment cadence — adaptive)
    - Call SpiceyPy for each ET: state = `spkgeo(target=body_id, et=et, ref='ECLIPJ2000', obs=0)` — observer 0 = SSB (solar system barycenter). Endpoint epochs inset by 10 ms to land inside the segment, not on the boundary.
    - Stack the 6 doubles into a Float64Array
    - Pass to `vtrj_writer.write_vtrj()` with the right header values
  - [x] After all bodies, call `manifest_writer.emit_manifest(bodies)` to produce `bake/out/manifest.json`
  - [x] Determinism: SpiceyPy + scipy are deterministic given identical kernel inputs; ensure no floating-point operations introduce variance (use `numpy.float64` end-to-end; do not convert to/from `float32`). **Two-run SHA-256 comparison verified.**

- [x] **Task 3 — Author `bake/src/vtrj_writer.py`** (AC: #2)
  - [x] Function signature: `write_vtrj(target_path, body_id, et_start, et_end, cadence_seconds, samples) -> str` (returns the SHA-256 hex of the file written).
  - [x] Build the 40-byte header per the AC2 layout. Use Python's `struct` module with little-endian format specifiers.
  - [x] Validate inputs: `samples.shape == (sample_count, 6)`; `samples.dtype == np.float64`; `body_id` in {-31, -32}; `et_start < et_end`; `cadence_seconds > 0`.
  - [x] Serialize: header + `samples.astype('<f8', copy=False).tobytes()` (explicit little-endian lock).
  - [x] Compress with `brotli` quality 11, MODE_GENERIC (deterministic for identical input).
  - [x] **Decision: added `brotli` to `bake/pyproject.toml`** via `uv add brotli` (resolved to brotli 1.2.0). No-PII grep test verified still passing.
  - [x] Atomic write: write to `<target>.part`, then rename to `<target>`. Mirrors Story 1.3's `acquire_kernels.py` safe-write pattern.
  - [x] Determinism verified: same input -> same SHA-256 across multiple writes (asserted in `test_vtrj_writer.py`).

- [x] **Task 4 — Author `bake/src/manifest_writer.py`** (AC: #1)
  - [x] Function signature: `emit_manifest(bodies, kernels, output_path, repo_root, bake_timestamp=None) -> dict`. (Returns the dict written; explicit `bake_timestamp` parameter for determinism tests.)
  - [x] `BodyEntry`, `FileEntry`, `KernelRef` are frozen dataclasses matching Decision 1b shape.
  - [x] Manifest output JSON shape matches architecture.md Decision 1b exactly.
  - [x] `bakeCommit` derived from `git rev-parse HEAD` (subprocess; `"unknown"` on failure).
  - [x] Deterministic JSON serialization: `json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False)`. Verified byte-identical across two-run rebuild modulo `bakeTimestamp` + `bakeCommit`.
  - [x] `schemaVersion` locked at 1.

- [x] **Task 5 — Author `bake/src/validate_l1.py`** (AC: #4)
  - [x] CLI entry: `python -m src.validate_l1` (from `bake/`); wrapped by `just validate`.
  - [x] Reads VTRJ outputs from `bake/out/` and the bake manifest.
  - [x] **Per-segment validation:** for each VTRJ in the manifest, builds a reference grid 10x denser than the segment's bake cadence inside `[et_start + inset, et_end - inset]`, interpolates via `CubicHermiteSpline(et_bake, pos[:,k], vel[:,k])` per axis, computes max + RMS Euclidean error.
  - [x] Writes `bake/out/validation-report.md` with one row per (body, segment): UTC range, bake cadence, sample counts, max + RMS, worst-error UTC, pass/fail.
  - [x] Exit code 0 only if every segment passes both NFR-P9 thresholds; otherwise 1 with the failing segments named to stderr.
  - [x] Determinism verified: deterministic bake -> deterministic VTRJ samples -> deterministic spkgeo reference -> deterministic errors -> deterministic report.

- [x] **Task 6 — Introduce `justfile` at the repo root** (AC: #6, #7)
  - [x] Created `c:\git\Voyager\justfile` with all required recipes plus the stub `copy-bake-to-web`.
  - [x] Used `just` syntax with `[working-directory(...)]` attribute (just 1.32+) so recipes are single-tool invocations — no shell `&&` chaining needed (Windows PowerShell 5.1 lacks `&&`).
  - [x] `default` recipe prints `just --list`.
  - [x] README "Development" section added (appended; existing prose preserved).

- [x] **Task 7 — Add `brotli` dependency** (AC: #2)
  - [x] `uv add brotli` -> `brotli==1.2.0` pinned in `bake/pyproject.toml` and `bake/uv.lock`.
  - [x] No-PII grep test (`web/tests/no-pii-grep.test.ts`) re-run -> green (89/89 vitest tests pass).

- [x] **Task 8 — Update `.gitignore` to exclude `bake/out/`**
  - [x] Verified Story 1.1's `.gitignore` already includes `bake/out/` (line 9). No change needed.
  - [x] The L1 validation report is under `bake/out/validation-report.md` and inherits the same ignore rule.

- [x] **Task 9 — Tests**
  - [x] `bake/tests/test_vtrj_writer.py` (11 tests): header round-trip, byte-level header struct, byte-identical determinism, atomic-write cleanup, invalid body_id / et window / cadence / dtype / shape rejection, read_vtrj rejects bad magic and bad version.
  - [x] `bake/tests/test_manifest_writer.py` (9 tests): schemaVersion pinned at 1, top-level keys match Decision 1b, validationTolerances pinned, chapters initially empty, multi-file-per-body array support, sorted-key serialization, determinism modulo volatile fields, strip_volatile_fields contract, bakeCommit shape.
  - [x] `bake/tests/test_bake_trajectories.py` (7 tests, `@pytest.mark.slow`): produces V1=7 + V2=11 segments, manifest shape correct, segments strictly sequential, idempotent byte-identical rebuild, manifest byte-identical modulo volatile fields, VTRJ header body_id matches filename slug, no segment-boundary interior crossings. Skips if kernels not LFS-hydrated.
  - [x] `bake/tests/test_validate_l1.py` (3 tests, `@pytest.mark.slow`): report exists + well-formed with 18 segment rows, all segments PASS NFR-P9, threshold violation synthesis exits 1 + names failing segment.
  - [x] `pyproject.toml` `[tool.pytest.ini_options].markers` registers the `slow` marker so `pytest -m "not slow"` runs cleanly with no UnknownMark warnings.

- [x] **Task 10 — README updates**
  - [x] Added "Development" section documenting all `just` recipes (above the "Kernels" section).
  - [x] Kernels section reworked to show `just`-commands as canonical, `python ...` as fallback.
  - [x] ADR section updated to reference `just adr-index` as canonical.
  - [x] NFR-P9 thresholds documented in the Development section.

## Dev Notes

### Architectural Compliance — load-bearing constraints

- **VTRJ binary format is locked.** Architecture line 67, 250, 295, ADR 0004 — JSON / Protobuf / Arrow / Parquet are explicitly rejected. The 40-byte header layout in AC2 is the canonical structure.
- **Cubic Hermite over position + velocity is locked.** Architecture line 308, ADR 0003 — Cubic Hermite (not Catmull-Rom, not B-spline). Both position AND velocity are needed at each sample (Hermite requires both); SpiceyPy `spkgeo` returns both in one call.
- **Float64 end-to-end on the bake side.** Architecture line 976: no `Float32Array` for trajectory/attitude data on the world-space side. Convert at the explicit render boundary (Story 1.5+).
- **Byte-identical rebuild (NFR-R4).** Decision 1d — pinned Python patch version + exact SpiceyPy + committed uv.lock + linux/amd64 CSPICE platform. The bake script must not introduce wall-clock-time dependence, random seeds, or environmental variance.
- **`bake/out/` is `.gitignored`.** Story 1.1 set this; verify it's still there. The bake output is regenerable from kernels; the verification of byte-identicality is itself part of the CI gate.
- **Brotli compression.** Architecture line 67, 250 — brotli for transport (`.bin.br`). This story introduces the dependency.
- **Sun observer for SPICE queries: 0 (SSB).** Architecture's render-space uses heliocentric, but the ephemeris-time level uses SSB (solar system barycenter) as the canonical reference; the renderer transforms to whatever frame the camera demands.
- **J2000 ecliptic frame for trajectories.** SpiceyPy `spkgeo(... ref='ECLIPJ2000' ...)`. This frame is what the renderer ultimately consumes.

### NAIF body IDs (re-confirmed)

- V1 = -31, V2 = -32 (SPK body IDs; do NOT confuse with the CK structure IDs -31000/-32000 that Story 1.3's `ck_inventory.py` uses — those are for attitude kernels)
- Sun = 10, SSB = 0
- Planets: Mercury barycenter = 1, Venus barycenter = 2, Earth-Moon barycenter = 3 (with Earth = 399, Moon = 301), Mars = 4, Jupiter barycenter = 5, Saturn barycenter = 6, Uranus barycenter = 7, Neptune barycenter = 8, Pluto = 9
- For Voyager trajectory baking, we only need V1 and V2 as targets; future Story 1.13 will add the planets

### Project Structure Notes

- New module files live at `bake/src/bake_trajectories.py`, `bake/src/vtrj_writer.py`, `bake/src/manifest_writer.py`, `bake/src/validate_l1.py`
- Existing under `bake/src/`: `__init__.py`, `_kernel_io.py`, `acquire_kernels.py`, `verify_kernels.py`, `ck_inventory.py`, `fk_inventory.py` (Story 1.3)
- New `justfile` lands at the repo root
- New tests live at `bake/tests/test_vtrj_writer.py`, `bake/tests/test_manifest_writer.py`, `bake/tests/test_bake_trajectories.py`, `bake/tests/test_validate_l1.py`
- `bake/out/` is `.gitignored`; nothing under it is committed
- README at the repo root gets a Development section (append)

### Module Naming — Epic vs Architecture

The epic-level AC3 (epics.md line 517) said `sample.py`, `binary_writer.py`, `bake.py`, `validation.py`. The architecture document is consistent on `bake_trajectories.py`, `vtrj_writer.py`, `manifest_writer.py`, `validate_l1.py`. **Use the architecture-canonical names** — they are more specific, used throughout the architecture doc, and anchor source-tree references in repo-layout sections.

### File-Structure Requirements

- All bake modules MUST live under `bake/src/` (not `bake/`, not `bake/scripts/`)
- VTRJ outputs MUST land in `bake/out/` (not in `web/public/data/` — Story 1.6 owns the bake→web copy step)
- The `justfile` MUST be at the repo root (not under `bake/` or `web/`)

### Testing Requirements

- `bake/tests/test_vtrj_writer.py`, `test_manifest_writer.py` are unit tests, fast (<1 s)
- `bake/tests/test_bake_trajectories.py`, `test_validate_l1.py` are end-to-end against the real kernels — slow (~10-60 seconds combined). Mark with `@pytest.mark.slow` and exclude from default `uv run pytest`. Add a `just test-bake-slow` recipe that runs them, and document.
- The existing baseline (191 passed + 2 skipped after Story 1.3) must remain green
- Total expected after Story 1.4: ~210 passed + 2 skipped + slow tests run separately

### Latest Tech Information

- **brotli 1.x** (latest stable Python binding to Google's brotli). Pure compression; no network or telemetry.
- **scipy.interpolate.CubicHermiteSpline:** stable since scipy 0.18 (2016). API: `CubicHermiteSpline(x, y, dydx, axis=0, extrapolate=None)`. Vectorized; very fast.
- **SpiceyPy `spkgeo(target, et, ref, obs)`:** returns `(state, lt)` where state is 6 elements (position + velocity). Use `state, _ = spkgeo(...)` to discard the light-time return.
- **`just`:** Cargo-based command runner, syntax similar to Make but cleaner. Latest version 1.x. Installed via `cargo install just` or `winget install --id Casey.Just`.

### Previous Story Intelligence

**Story 1.1 (414db52):** monorepo scaffolded; SpiceyPy 8.1.0 in `bake/.venv`; `.gitignore` already covers `bake/out/` and `bake/.venv/`; pytest live.
**Story 1.2 (2b1385c):** ADR catalogue. ADR 0003 (Cubic Hermite), ADR 0004 (VTRJ binary), ADR 0027 (EOL normalization). `scripts/adr-index.py` regenerator pattern (which the justfile's `adr-index` recipe wraps).
**Story 1.3 (7f850fe):** 17 NAIF + PDS kernels at `kernels/`; `kernels-manifest.json` is the kernel truth source. `bake/src/_kernel_io.py` exposes `load_manifest()` and SHA helpers. `bake/src/acquire_kernels.py`, `verify_kernels.py`, `ck_inventory.py`, `fk_inventory.py` already exist. Story 1.3's pattern of writing to `.part` then atomic rename is the canonical safe-write pattern; mirror it in `vtrj_writer.py`.

**5 LOW deferred items** in `_bmad-output/implementation-artifacts/deferred-work.md`. None block this story.

### Git Intelligence

Recent commits:
- `7f850fe Story 1.3: Acquire and hash-pin NAIF + PDS Rings Voyager kernels`
- `2b1385c Story 1.2: Author Phase 0 ADR catalogue (28 entries) + index + tests`
- `414db52 Story 1.1: Initialize monorepo with web (Vite vanilla-ts) and bake (uv) halves`

Branch: `epic1`. Last LFS push: 188 MB. LFS health is fine.

### Project Context Reference

- Epic: `_bmad-output/planning-artifacts/epics.md` §Story 1.4 (lines 495–518)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` §Decision 1a–1e (lines 255–296), §Decision 1b manifest schema (lines 263–289), §Module Naming (lines 1067–1072), §FR9/FR51/FR55, §NFR-R4, §NFR-P9
- Technical research: cubic Hermite math and VTRJ format rationale
- Existing ADRs: 0003 (Cubic Hermite), 0004 (VTRJ binary), 0007 (SpiceyPy)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision 1b] — manifest schema
- [Source: _bmad-output/planning-artifacts/architecture.md#Repository Layout] — `bake/src/` module names (lines 1067–1072)
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-R4] — byte-identical rebuild
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-P9] — 20 km max / 5 km RMS thresholds
- [Source: _bmad-output/planning-artifacts/prd.md#FR51] — reproducible bake
- [Source: _bmad-output/planning-artifacts/prd.md#FR55] — 6-layer validation harness
- [Source: docs/adr/0003-cubic-hermite-over-catmull-rom-for-trajectories.md]
- [Source: docs/adr/0004-custom-vtrj-binary-over-json-protobuf-arrow-parquet.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — model id `claude-opus-4-7[1m]`.

### Debug Log References

- **Task 1 — `just` not installed (clarification):** Surfaced to team-lead; user approved `winget install --id Casey.Just --accept-source-agreements --accept-package-agreements` -> `just 1.51.0` installed.
- **Initial bake `ModuleNotFoundError: bake`:** `python -m bake.src.X` requires `bake/__init__.py` which doesn't exist; the `bake/` directory is a uv project root, not a Python package. Resolved by invoking `uv run python -m src.X` from inside `bake/` (justfile uses `[working-directory("bake")]`).
- **Initial unicode encoding errors:** Windows cp1252 stdout cannot encode `→`, `…`, `≤`, `×` in `print()` calls. Replaced with ASCII equivalents in module sources; `≤` is only used in the markdown report (file-write uses UTF-8, safe).
- **NFR-P9 BLOCKER discovery (load-bearing):** The pinned Voyager merged SPKs (`Voyager_1.a54206u_V0.2_merged.bsp`, `Voyager_2.m05016u.merged.bsp`) contain SPICE-segment-boundary position discontinuities up to ~2,103,302 km. Verified via sub-second `spkgeo` probing across the V1 boundary at et=-441806400 (1985-12-31T23:59:05): position jumps from `(-2031241726, -2599812506, 1897045915)` at `dt=-1s` to `(-2031606027, -2597729688, 1897862259)` at `dt=0s`. Velocity is continuous, so this is SPK-internal segment stitching variance (different Chebyshev coefficients), not a propagation artifact. A single Cubic Hermite spline cannot bridge these jumps. Surfaced to team-lead; user approved Option B (per-segment VTRJ chunking).
- **First per-segment bake `SpiceSPKINSUFFDATA`:** The original segment enumerator used `spklef` + `spkuef`, which unloads the SPK from the kernel pool after iteration; subsequent `spkgeo` calls then fail. Fixed by switching to `dafopr` (read-only DAF open) + `dafcls` (close handle), which doesn't touch the kernel-pool registration.
- **Boundary-discontinuity contamination in baked samples:** Even after per-segment chunking, the first/last samples of each segment landed *at* the boundary epoch where SPICE may return the adjacent segment's discontinuous value. Fixed with a `boundary_inset = min(0.01, span*1e-9)` (10 ms or 1e-9 of span, whichever is smaller) applied to both endpoints. Mirrored the inset in `validate_l1.py`'s reference grid construction.
- **Initial per-segment validation: 2 segments still exceeded max threshold** (V2 seg08=37.9 km, seg09=24.8 km). Cause: cadence policy of 4096 samples/segment was insufficient for high-curvature cruise after Uranus / pre-Neptune approach. Bumped `TARGET_SAMPLES_PER_SEGMENT` from 4096 to 8192 — all 18 segments now PASS with max ≤ 10.4 km, RMS ≤ 0.08 km.

### Completion Notes List

- **Per-segment VTRJ chunking is the architectural answer.** V1 has 7 SPK segments where body=-31 (not the 8 team-lead estimated — the 8 boundary count includes shared endpoints; segment count is `boundaries - 1`). V2 has 11 such segments (not the 10 estimated, for the same reason). Total: 18 VTRJ files per bake.
- **Architecture-canonical module names locked in:** `bake_trajectories.py`, `vtrj_writer.py`, `manifest_writer.py`, `validate_l1.py` (not the epic-summary names `sample.py` / `binary_writer.py` / `bake.py` / `validation.py`).
- **Adaptive per-segment cadence:** `cadence = clamp(span / 8192, 60s, 86400s)`. Long cruise segments hit the 86400 s ceiling (= daily, matching the architecture nominal); short encounter segments fall well below daily so cubic-Hermite interpolation through high-curvature flyby geometry stays inside NFR-P9. The chosen cadence is recorded in each VTRJ's header and in the manifest's `cadenceSec` field — Story 1.6's renderer consumes the per-segment cadence rather than assuming a global value.
- **Final NFR-P9 numbers (per segment, all PASS):**
  - V1 seg01 (1977-09-05 -> 09-08, Earth-centered): max=0.010 km, rms=0.000 km
  - V1 seg02 (1977-09-08 -> 1979-01-14, cruise): max=2.759 km, rms=0.020 km
  - V1 seg03 (1979-01-14 -> 04-24, Jupiter): max=0.202 km, rms=0.002 km
  - V1 seg04 (1979-04-24 -> 1980-10-06, cruise): max=0.234 km, rms=0.002 km
  - V1 seg05 (1980-10-06 -> 12-20, Saturn): max=1.367 km, rms=0.011 km
  - V1 seg06 (1980-12-20 -> 1985-12-31, cruise): max=0.215 km, rms=0.002 km
  - V1 seg07 (1985-12-31 -> 2030-12-31, post-Saturn cruise): max=1.408 km, rms=0.007 km
  - V2 seg01 (1977-08-20 -> 08-23, Earth-centered): max=0.011 km, rms=0.000 km
  - V2 seg02 (1977-08-23 -> 1979-05-03, cruise): max=2.151 km, rms=0.015 km
  - V2 seg03 (1979-05-03 -> 09-15, Jupiter): max=0.194 km, rms=0.002 km
  - V2 seg04 (1979-09-15 -> 1981-07-04, cruise): max=0.194 km, rms=0.002 km
  - V2 seg05 (1981-07-04 -> 10-17, Saturn): max=0.287 km, rms=0.006 km
  - V2 seg06 (1981-10-17 -> 1986-01-04, cruise): max=1.517 km, rms=0.007 km
  - V2 seg07 (1986-01-04 -> 02-14, Uranus): max=0.069 km, rms=0.001 km
  - V2 seg08 (1986-02-14 -> 1989-08-02, cruise): max=10.387 km, rms=0.081 km
  - V2 seg09 (1989-08-02 -> 09-16, Neptune approach): max=2.022 km, rms=0.025 km
  - V2 seg10 (1989-09-16 -> 09-30, Neptune): max=0.020 km, rms=0.000 km
  - V2 seg11 (1989-09-30 -> 2030-12-31, post-Neptune cruise): max=0.366 km, rms=0.003 km
  - **Worst max: 10.387 km (V2 seg08), worst RMS: 0.081 km (V2 seg08). Both well inside NFR-P9 (20 km / 5 km).**
- **NFR-R4 byte-identical determinism verified** by running `just bake` twice back-to-back and confirming every VTRJ SHA-256 matches; manifest is byte-identical modulo `bakeTimestamp` and `bakeCommit`.
- **Test counts:** bake fast suite = 211 passed + 2 skipped (was 191 passed + 2 skipped baseline; +20 new tests across `test_vtrj_writer.py` and `test_manifest_writer.py`). Bake full suite (incl. slow) = 221 passed + 2 skipped (10 new `@pytest.mark.slow` tests across `test_bake_trajectories.py` and `test_validate_l1.py`). Web vitest = 89/89.
- **Why `python -m src.X` not `python -m bake.src.X`:** the repo has no `bake/__init__.py` (would change Story 1.1's package layout). Story spec said "or equivalent direct path invocation" — `python -m src.X` from `bake/` is equivalent and respects the existing structure.

### File List

**New files:**

- `bake/src/bake_trajectories.py` — orchestration, per-segment chunking, adaptive cadence
- `bake/src/vtrj_writer.py` — VTRJ format encoder/decoder, atomic brotli writes
- `bake/src/manifest_writer.py` — Decision 1b manifest emission, deterministic JSON
- `bake/src/validate_l1.py` — Layer-1 per-segment validation harness
- `bake/tests/test_vtrj_writer.py` — 11 unit tests
- `bake/tests/test_manifest_writer.py` — 9 unit tests
- `bake/tests/test_bake_trajectories.py` — 7 slow end-to-end tests
- `bake/tests/test_validate_l1.py` — 3 slow end-to-end tests
- `justfile` — repo-root `just` recipes (12 recipes)

**Modified files:**

- `bake/pyproject.toml` — added `brotli>=1.2.0` runtime dep; added `[tool.pytest.ini_options].markers` for `slow`
- `bake/uv.lock` — locked brotli 1.2.0 + wheels for all platforms
- `README.md` — new "Development" section; Kernels and ADR sections updated to show `just`-commands as canonical
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status moved ready-for-dev -> in-progress -> review
- `_bmad-output/implementation-artifacts/1-4-bake-pipeline-scaffold-and-l1-python-validation-harness.md` — AC1 amended for per-segment chunking; task checkboxes flipped; Dev Agent Record filled.

**Generated artifacts (`bake/out/`, gitignored — not part of commit):**

- `bake/out/voyager-1-seg01..seg07-*.bin.br` — 7 V1 segment VTRJs
- `bake/out/voyager-2-seg01..seg11-*.bin.br` — 11 V2 segment VTRJs
- `bake/out/manifest.json` — Decision 1b bake manifest
- `bake/out/validation-report.md` — L1 validation report

### Change Log

- 2026-05-18: Story 1.4 implementation complete.
  - Per-segment VTRJ chunking activated (architecture decision after NFR-P9 blocker discovery; team-lead approved Option B).
  - AC1 amended in this file to reflect the per-segment behavior (V1: 7 segments, V2: 11 segments; 18 VTRJ files total).
  - Adaptive cadence policy: `clamp(span / 8192, 60s, 86400s)` per segment.
  - All 18 segments pass NFR-P9 (max ≤ 10.4 km, RMS ≤ 0.08 km).
  - NFR-R4 byte-identical determinism verified across rebuilds.
  - 30 new tests added (20 fast + 10 slow); web vitest unchanged at 89/89.
- 2026-05-18: Code review (cr-1-4) — 1 MED resolved, 9 LOW deferred, 0 dismissed.
  - **MED [resolved]:** `manifest.json` `kernels[]` entries were missing the `source_url` field documented in architecture Decision 1b (line 271). Fixed by adding `source_url` to `KernelRef` dataclass, the `_kernel_ref_to_dict` emitter, the `bake_trajectories.py` wire-up, and `test_manifest_writer.py` / `test_bake_defense.py` fixtures. Added `test_kernels_carry_source_url` to lock the contract. Manifest regenerated; all 17 kernels now carry `source_url`. Tests: 228 fast + 10 slow = 238 passed + 2 skipped (was 227 + 10 = 237 before the new test).
  - **9 LOW [deferred]:** code hygiene (duplicate `_HEADER_STRUCT` definition), asymmetric body-id validation in `read_vtrj`, in-memory vs. file SHA divergence from Story 1.3's pattern, validator over-furnishes CK kernels, fragile SPK kernel selection by substring, silent `_git_head_sha` timeout fallback, no UTC enforcement on caller-supplied `bake_timestamp`, sub-ULP `boundary_inset` for hypothetical sub-second segments, `test_segments_do_not_overlap` pre-sorts, `ck-inventory`/`fk-inventory` recipes not in `REQUIRED_RECIPES`. All appended to `_bmad-output/implementation-artifacts/deferred-work.md`.
