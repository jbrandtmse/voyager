# Story 1.3: Acquire and Hash-Pin NAIF and PDS Kernels

Status: done

## Story

As the project maintainer,
I want a reproducible kernel acquisition flow that populates `kernels/` from NAIF and PDS Rings Node and pins every kernel by SHA-256,
so that the build is deterministic (FR52, NFR-S4), kernel updates can be reviewed via drift report (Epic 7 prereq), and the CK coverage inventory is documented for Epic 3 scoping.

## Acceptance Criteria

**AC1 — `kernels/` is populated from a clean state via a single command:**
- **Given** an empty `kernels/` directory (or one missing one or more pinned files),
- **When** the developer runs `python bake/src/acquire_kernels.py` from the repo root (the canonical command for this story — a `just fetch-kernels` wrapper is documented but not added to the justfile, since Story 1.4 owns justfile introduction),
- **Then** every kernel listed in `kernels/kernels-manifest.json` is fetched from its `source_url`, its SHA-256 verified against `expected_sha256`, and placed at `target_path`,
- **And** the script is idempotent — re-running with all files already SHA-matched produces zero downloads and exits 0,
- **And** at minimum the following kernels are present after a clean fetch (exact filenames + URLs in the manifest):
  - **Generic kernels:** `de440.bsp` (planetary ephemeris), `naif0012.tls` (LSK), `pck00011.tpc` (PCK) — from `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/`
  - **Voyager SPK:** the merged Voyager 1 and Voyager 2 trajectory SPK files (filenames vary; identify via `https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/`)
  - **Voyager CK:** `vgr1_super_v2.bc`, `vgr2_super_v2.bc` from `https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/ck/`
  - **Voyager FK:** `vg1_v02.tf`, `vg2_v02.tf` from `https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/fk/`
  - **Voyager SCLK:** the V1 and V2 spacecraft-clock kernels (highest-numbered version available, e.g. `vg100007.tsc` / `vg200007.tsc`) from `https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/sclk/`
  - **PDS Rings Node supplementary CKs:** the Voyager Jupiter / Saturn / Uranus / Neptune encounter CK products from `https://pds-rings.seti.org/voyager/` (browse to identify exact paths; if PDS Rings Node has reorganized URLs since 2026-05-16, surface as a clarification)

**AC2 — Manifest contains complete SHA-256 + source-URL + attribution metadata:**
- **Given** the kernel set is populated,
- **When** `kernels/kernels-manifest.json` is inspected,
- **Then** every kernel has `file`, `target_path`, `source_url`, `expected_sha256`, `size_bytes` fields,
- **And** every kernel sourced from PDS Rings Node carries an `attribution` field with the PDS dataset ID and a one-line credit string,
- **And** the manifest's top-level fields include `schema_version: 1`, `manifest_generated: <ISO-8601 UTC>`, and a `kernel_count` integer.

**AC3 — Verification script catches tampering and exits non-zero on mismatch:**
- **Given** the kernel set is populated and matches the manifest,
- **When** the developer runs `python bake/src/verify_kernels.py` from the repo root,
- **Then** the script recomputes SHA-256 of every on-disk kernel, asserts equality with `expected_sha256`, and exits 0 on full match,
- **And** if any kernel byte is modified (test: write a single byte to a copy of one kernel) and verification is re-run, the script exits non-zero, prints the offending filename, and lists the expected vs. computed SHA in the failure output,
- **And** if any kernel listed in the manifest is missing from `kernels/`, the script exits non-zero with a "missing kernel" error naming the file.

**AC4 — All kernels are Git LFS-tracked:**
- **Given** the kernels are committed,
- **When** `git -C c:/git/Voyager lfs ls-files` is run,
- **Then** every NAIF kernel under `kernels/` appears in the LFS-tracked list,
- **And** `git -C c:/git/Voyager check-attr filter -- kernels/<sample-kernel>` reports `filter: lfs` for each tracked extension (LFS rules established in Story 1.1's `.gitattributes` cover `*.bsp *.bc *.tf *.tsc *.tls *.pck`).
- **Note:** if `git lfs` is not installed locally, surface as a clarification — the user's environment may need `git lfs install` first.

**AC5 — `ckbrief` inventory is written to `docs/kernels/ckbrief-inventory.md`:**
- **Given** the CK kernels are present,
- **When** `ckbrief vgr1_super_v2.bc vgr2_super_v2.bc <each-pds-supplement>` is run from the `kernels/` directory (with `naif0012.tls` and the SCLK kernels furnished via SpiceyPy or via the CSPICE `furnsh` mechanism),
- **Then** the raw ckbrief output is captured and committed to `docs/kernels/ckbrief-inventory.md`, with prose annotations identifying:
  - Per spacecraft, every CK coverage window
  - Which mission encounter windows (V1 Jupiter, V1 Saturn, V2 Jupiter, V2 Saturn, V2 Uranus, V2 Neptune) are covered vs. uncovered
  - **Explicit statement** of whether the 1990-02-14 Pale Blue Dot window has CK coverage in `vgr1_super_v2.bc` (this is the Epic 5 scoping input)
  - Coverage gaps that the synthesized HGA attitude must fill (Epic 3 scoping input — driven by FR18)
- **And** the file's header documents how the inventory was generated (command + date + ckbrief version) for reproducibility.

**AC6 — FK frame IDs are extracted and documented in `kernels/frame-ids.md`:**
- **Given** the FK kernels `vg1_v02.tf` and `vg2_v02.tf` are present,
- **When** the FK files are read,
- **Then** `kernels/frame-ids.md` is written documenting the frame IDs for V1 bus, V1 scan platform, V1 NA camera, V1 HGA, and the same for V2 — these will become the load-bearing constants for Story 1.5+ rendering and Story 3.2 HGA-Earth synthesis (per technical research line 1531: "Phase 0 action: inventory the frame IDs from the FK kernel and document them in `kernels/frame-ids.md`").

## Tasks / Subtasks

- [x] **Task 1 — Verify Git LFS is installed and initialized** (AC: #4)
  - [x] Check `git lfs version` works in PowerShell / bash. If not installed: surface as `clarification_needed` (dev should not auto-install LFS without user consent — it's a system-level tool with platform-specific installers)
  - [x] If installed but not initialized for this repo, run `git lfs install` (operates on the user's git config; safe to re-run)
  - [x] Confirm the Story 1.1 `.gitattributes` LFS patterns (`*.bsp`, `*.bc`, `*.tf`, `*.tsc`, `*.tls`, `*.pck`) are active by running `git check-attr filter -- kernels/example.bsp` and seeing `filter: lfs`

- [x] **Task 2 — Author `bake/src/acquire_kernels.py`** (AC: #1)
  - [x] Place the script at `c:\git\Voyager\bake\src\acquire_kernels.py` (the `src/` subdirectory under `bake/` is the architecture-canonical location; create if it doesn't exist — Story 1.1's uv scaffold put `main.py` directly in `bake/`, not in `bake/src/`, so this may be the first file under `bake/src/`)
  - [x] Reads `kernels/kernels-manifest.json` (relative to repo root)
  - [x] For each entry: if `target_path` exists and computed SHA-256 matches `expected_sha256`, skip. Otherwise, fetch via HTTPS (urllib or requests — use whatever is already in the bake deps; do NOT add a new dependency without ADR), verify SHA, write to `target_path`. On mismatch, raise and exit non-zero.
  - [x] Print one line per kernel: `[OK]` / `[FETCH]` / `[FAIL]` with the filename and size. Final summary: `<N> ok, <M> fetched, <K> failed`.
  - [x] Exit codes: 0 on full success, 1 on any verification failure, 2 on network errors (retry up to 3 times with exponential backoff before giving up).
  - [x] The script must be deterministic in its log output for a fully-populated cache (re-running on a clean cache produces byte-identical `[OK]` lines per kernel, in manifest-declared order) so an `assert_idempotent` test is feasible.

- [x] **Task 3 — Author `bake/src/verify_kernels.py`** (AC: #3)
  - [x] Place the script at `c:\git\Voyager\bake\src\verify_kernels.py`
  - [x] Reads `kernels/kernels-manifest.json`
  - [x] For each entry: assert `target_path` exists, compute SHA-256, assert equality with `expected_sha256`
  - [x] On missing file: exit non-zero with `MISSING: <target_path>` and continue checking remaining files (collect all errors before exiting)
  - [x] On hash mismatch: exit non-zero with `MISMATCH: <target_path>` + expected SHA + actual SHA
  - [x] On full match: exit 0 with `OK: <N> kernels verified`
  - [x] Shares the SHA-256 helper with `acquire_kernels.py` — extract into `bake/src/_kernel_io.py` (private module) for shared use

- [x] **Task 4 — Author `kernels/kernels-manifest.json`** (AC: #1, #2)
  - [x] Manifest schema (literal JSON keys; this is the schema future stories depend on):
    ```json
    {
      "schema_version": 1,
      "manifest_generated": "2026-05-18T00:00:00Z",
      "kernel_count": <N>,
      "kernels": [
        {
          "file": "naif0012.tls",
          "target_path": "kernels/naif0012.tls",
          "source_url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls",
          "expected_sha256": "<sha256 hex>",
          "size_bytes": <int>,
          "kind": "lsk",
          "attribution": "NAIF (JPL/NASA)"
        }
        // ... one entry per kernel
      ]
    }
    ```
  - [x] Populate `expected_sha256` and `size_bytes` for every kernel **after** download by running a helper script (e.g., `python -c "import hashlib, pathlib; [print(p.name, hashlib.sha256(p.read_bytes()).hexdigest(), p.stat().st_size) for p in sorted(pathlib.Path('kernels').iterdir()) if p.is_file()]"`) or by running `acquire_kernels.py --generate-manifest` (a one-time flag the dev may add)
  - [x] `kind` enum: `lsk`, `pck`, `fk`, `sclk`, `spk`, `ck`
  - [x] PDS Rings Node entries carry `attribution: "PDS Rings Node (SETI Institute) — <dataset ID>"`

- [x] **Task 5 — Fetch every required kernel** (AC: #1, #4)
  - [x] Run `python bake/src/acquire_kernels.py` to do the actual downloads (this populates `kernels/` with real files)
  - [x] Stage and commit kernels via Git LFS (verify via `git lfs ls-files` afterward)
  - [x] **WARNING:** Estimated bundle size 100-200 MB. The user has confirmed they want full execution. The dev should NOT pause for size confirmation but SHOULD log a one-line size summary at the end of the manifest generation step.
  - [x] If any kernel fetch fails persistently (network unreachable, NAIF FTP outage, URL 404), surface as `clarification_needed` listing the failing kernels — do NOT proceed with a partial manifest.

- [x] **Task 6 — Acquire `ckbrief` and run inventory** (AC: #5)
  - [x] `ckbrief` is part of the NAIF Toolkit utilities package, not pip-installable. Acquisition options:
    1. Download the platform-specific NAIF Toolkit from `https://naif.jpl.nasa.gov/naif/toolkit_C.html` and use the bundled `ckbrief.exe` (Windows) or `ckbrief` (linux/macOS) binary
    2. Use the SpiceyPy Python bindings to write an equivalent inventory script (`bake/src/ck_inventory.py`) that produces the same coverage windows via `spiceypy.ckcov` and friends
  - [x] **Preferred path:** option 2 (SpiceyPy-based inventory script). Reasons: avoids checking a platform-specific binary into the repo or requiring contributors to download the NAIF Toolkit; uses the existing SpiceyPy 8.1.0 dep; produces deterministic output reproducible in CI.
  - [x] Implement `bake/src/ck_inventory.py` that:
    - Calls `spiceypy.furnsh()` on LSK + SCLK + CK kernels in order (LSK first per CSPICE convention)
    - For each CK kernel, calls `ckcov` against each spacecraft ID (V1 = -31, V2 = -32) to enumerate coverage intervals
    - Converts each interval from ET to UTC (ISO-8601) for human readability
    - Writes a markdown document to `docs/kernels/ckbrief-inventory.md` with: header (date, command, ckbrief/SpiceyPy version), per-spacecraft coverage tables, per-encounter-window coverage assertions (V1 Jupiter, V1 Saturn, V2 Jupiter, V2 Saturn, V2 Uranus, V2 Neptune, PBD)
  - [x] If the dev prefers option 1 (binary `ckbrief`) for fidelity to the original Story spec, surface as a clarification — the SpiceyPy-equivalent path is preferred but not mandatory.
  - [x] Run the inventory script and commit `docs/kernels/ckbrief-inventory.md`

- [x] **Task 7 — FK frame inventory at `kernels/frame-ids.md`** (AC: #6)
  - [x] Read `vg1_v02.tf` and `vg2_v02.tf` (plain-text NAIF FK files; each one defines `FRAME_<NAME> = <ID>` blocks for the spacecraft bus, scan platform, NA camera, HGA, and others)
  - [x] Extract every `FRAME_NAME` ↔ frame ID pair plus the parent-frame relationships and rotations
  - [x] Write `kernels/frame-ids.md` documenting: V1 bus, V1 scan platform, V1 NA camera, V1 HGA — frame name + ID + parent frame + the rotation row defining the orientation. Same for V2.
  - [x] Cross-reference: technical-research line 1531 motivates this; architecture line 382 cites it; Story 3.6 will hardcode some of these as TypeScript constants. Treat this file as the canonical pre-bake reference.

- [x] **Task 8 — Tests**
  - [x] `bake/tests/test_kernels_manifest.py`:
    - Manifest is valid JSON
    - Schema version is 1
    - Every kernel entry has all required fields (`file`, `target_path`, `source_url`, `expected_sha256`, `size_bytes`, `kind`, `attribution`)
    - Every `target_path` exists on disk
    - Every on-disk file's SHA-256 matches the manifest entry (this is essentially the `verify_kernels.py` script re-invoked from the test)
    - `kernel_count` matches `len(kernels)`
  - [x] `bake/tests/test_acquire_kernels.py`:
    - Idempotency: running `acquire_kernels.py` twice in sequence produces no FETCH log lines on the second run (all OK)
    - Tamper detection: write a single byte to a copy of one kernel, run `verify_kernels.py`, assert exit code != 0 (use `pytest.tmp_path` to copy a kernel — do NOT modify the real one)
    - Missing-file detection: rename a kernel out of the way temporarily (`tmp_path`-aware), assert verify exits non-zero with the missing-file message, restore
  - [x] `bake/tests/test_ck_inventory.py`:
    - The inventory script produces the expected markdown structure (header + per-spacecraft tables + per-encounter-window section)
    - The PBD assertion line (1990-02-14 coverage) is present in some form
    - Inventory is regeneratable byte-identical on a second run (determinism)
  - [x] Run all three new test files and confirm pass

- [x] **Task 9 — Documentation touch-ups**
  - [x] Update `README.md` at the repo root: add a "Kernels" section after "Repository Layout" describing the kernel acquisition flow (`python bake/src/acquire_kernels.py` and `python bake/src/verify_kernels.py`), the LFS-tracked storage, and the `docs/kernels/ckbrief-inventory.md` reference. Story 1.4 will add the `just fetch-kernels` / `just verify-kernels` recipes later; document the Python invocation as canonical for now.
  - [x] If the kernel acquisition takes >5 minutes total, document the expected wall-clock time in the README so future contributors know what to expect.

## Dev Notes

### Architectural Compliance — load-bearing constraints

- **No manual asset retrieval, ever.** Architecture §Cross-Cutting Commitment: "All external assets — without exception — are acquired by tooling, never manually." Every kernel must be fetched by `acquire_kernels.py`; manual downloads + commits are forbidden.
- **SHA-256 verification is mandatory.** FR52: "System verifies SHA-256 hashes of every kernel against a manifest at build time and fails the build on any mismatch." `verify_kernels.py` is the enforcement mechanism.
- **Git LFS for storage.** Decision 1a / ADR 0011. LFS rules are already in place in `.gitattributes` (Story 1.1). Story 1.3 just lands the actual files under those rules.
- **Idempotent acquisition.** Architecture line 224: "idempotent (no-ops if SHA-matched files already present)". Re-running `acquire_kernels.py` on a populated cache MUST produce zero downloads.
- **No new Python dependencies without an ADR.** Use `urllib.request` (stdlib) for HTTPS fetches; if redirects/retries get gnarly, `requests` may be acceptable but discuss in an ADR. Avoid adding `httpx` or other deps for one-shot downloads.
- **NAIF body IDs:** V1 = -31, V2 = -32. Architecture line 274 and 719. Locked in `web/src/constants/body-ids.ts` eventually; for this story, use them inline in `ck_inventory.py`.
- **`bake/out/` is `.gitignored`.** Story 1.1's `.gitignore` covers it. Don't write anything user-facing under `bake/out/` from this story.

### Architectural Decisions (existing) that directly govern this story

- **ADR 0011 — Git LFS Kernel Storage + Auto-Acquisition Tool.** Already authored in Story 1.2. Read it before writing the script.
- **ADR 0027 — Line-Ending Normalization Policy.** Authored in Story 1.2 as `* text=auto eol=lf`. Note that LFS-tracked binary kernel files already have `-text` (via the LFS filter rules) which correctly overrides text-mode normalization. No conflict.
- **Decision 1c (drift report tool).** Architecture line 291. `drift_report.py` lands in Epic 7 (Story 7.1), not this story. But the manifest schema this story produces is what `drift_report.py` will compare against later — keep the schema disciplined.

### Project Structure Notes

- New script files land at `bake/src/acquire_kernels.py`, `bake/src/verify_kernels.py`, `bake/src/_kernel_io.py` (shared SHA helper), `bake/src/ck_inventory.py`
- The `bake/src/` directory does NOT exist yet (Story 1.1's `uv init` placed `main.py` directly under `bake/`, not under `bake/src/`). Create it.
- New documentation lands at `docs/kernels/ckbrief-inventory.md` and `kernels/frame-ids.md`
- New manifest lands at `kernels/kernels-manifest.json`
- Tests land at `bake/tests/test_kernels_manifest.py`, `bake/tests/test_acquire_kernels.py`, `bake/tests/test_ck_inventory.py`
- README at the repo root gets a "Kernels" section (append, don't replace)

### File-Structure Requirements

- Kernels MUST live directly under `kernels/` (no subdirectories like `kernels/ck/`, `kernels/spk/`). Architecture's repository layout (lines 152–154, 1047–1052) is flat.
- Scripts MUST be at `bake/src/` (not `bake/scripts/` or `bake/tools/`). Architecture line 158 shows `bake/src/bake_trajectories.py` etc.
- The inventory document MUST be at `docs/kernels/ckbrief-inventory.md` (create the `docs/kernels/` subdirectory).

### Testing Requirements

- All three new test files must pass under `cd bake && uv run pytest`
- Existing tests (Story 1.1 scaffold + Story 1.2 ADR catalogue = 133 passing) must remain green
- The acquisition test must NOT hit the network — use a fixture-based or mock-based approach for the HTTPS fetch path. The real acquisition is verified by running the script manually in Task 5; tests focus on idempotency, tamper detection, and missing-file handling against a known local fixture.

### Latest Tech Information

- **NAIF FTP:** publicly accessible at `https://naif.jpl.nasa.gov/pub/naif/`. No authentication; standard HTTPS GET. The site is well-mirrored and stable.
- **PDS Rings Node:** `https://pds-rings.seti.org/voyager/`. Some browsing required to find the supplementary CK product paths — the dev may need to traverse a few directory listings. If the site has been reorganized since the architecture was authored (2026-05-16), surface as clarification.
- **NAIF Toolkit version:** the bundled `ckbrief` is part of CSPICE N0067 (matches SpiceyPy 8.1.0's wrapped toolkit). For this story, prefer the SpiceyPy-based equivalent script (Task 6) over the binary.
- **Git LFS quota note:** the user has confirmed full execution. If the push hits the LFS storage limit, surface as a clarification with the exact failure message — do NOT silently truncate the manifest.

### Previous Story Intelligence

**Story 1.1 (committed 414db52):** monorepo scaffolded; `.gitattributes` has the LFS patterns; SpiceyPy 8.1.0 is installed in `bake/.venv` via `uv sync`; pytest harness is live.

**Story 1.2 (committed 2b1385c):** 28 ADRs in `docs/adr/`, including ADR 0011 (Git LFS) and ADR 0019 (zero analytics). The `* text=auto eol=lf` policy in `.gitattributes` is in place. Coverage: web vitest 89/89; bake pytest 133 passed + 2 skipped.

**Deferred from prior stories:** 5 LOW items remain in `_bmad-output/implementation-artifacts/deferred-work.md`. None block this story.

### Git Intelligence

Most recent commit: `2b1385c Story 1.2: Author Phase 0 ADR catalogue (28 entries) + index + tests`. Branch: `epic1`. Remote: `origin` (https://github.com/jbrandtmse/voyager.git). LFS support on GitHub: enabled by default; storage quota is 1 GB free.

### Project Context Reference

- Epic: `_bmad-output/planning-artifacts/epics.md` §Story 1.3 (lines 471–491)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` §Decision 1a (lines 255–261), §Asset Acquisition Tools (lines 579–595), §Repository Layout (lines 1004–1097)
- Technical research: `_bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md` (lines 840 — minimal kernel list; lines 1253, 1346–1377, 1531, 1558, 1599 — CK inventory + PBD coverage uncertainty; line 1531 — FK frame-IDs documentation requirement)
- PRD: `_bmad-output/planning-artifacts/prd.md` §FR52 (SHA-256 verification), §FR53–FR54 (drift report — for future story context)
- Existing ADRs: `docs/adr/0011-git-lfs-kernel-storage-auto-acquisition-tool.md` (the load-bearing decision for this story)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3] — Story foundation, ACs
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision 1a] — Git LFS + auto-acquisition rationale
- [Source: _bmad-output/planning-artifacts/architecture.md#Asset Acquisition Tools] — `acquire_kernels.py` placement and pattern (lines 579–595)
- [Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Available CK data] — kernel inventory + PBD coverage uncertainty (lines 1346–1377)
- [Source: _bmad-output/planning-artifacts/prd.md#FR52] — SHA-256 verification mandate
- [Source: docs/adr/0011-git-lfs-kernel-storage-auto-acquisition-tool.md] — operational decision record

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Claude Code dev agent, epic-cycle-2026-05-18)

### Debug Log References

- Initial bootstrap: empty-SHA manifest -> `acquire_kernels.py` fetches all 17 kernels (bootstrap mode) -> `acquire_kernels.py --generate-manifest` rewrites SHAs from disk -> `verify_kernels.py` exits 0 with `OK: 17 kernels verified`. Idempotency confirmed on second `acquire_kernels.py` run (17 ok, 0 fetched).
- CK structure-ID gotcha: `vgr{1,2}_super_v2.bc` use 5-digit `-31000` / `-32000` bus IDs (not the 2-digit `-31` / `-32` SPK body IDs). PDS Rings supplementary CKs use `-31100` / `-32100` scan-platform IDs. Documented in `docs/kernels/ckbrief-inventory.md` and `kernels/frame-ids.md`.
- SCLK version selection: the NAIF Voyager SCLK directory contains `vg100051.tsc` / `vg200051.tsc` as the highest-numbered SCLK kernels (the story example mentioned `vg100007` but the real current version on the server is `51`).
- `.gitattributes` adjustment: Story 1.1 listed `*.pck` for LFS but the canonical generic PCK file is `pck00011.tpc` (text-PCK extension). Added `*.tpc` to the LFS pattern list and re-staged. Updated `test_scaffold.py` to assert the new pattern is present.
- CK inventory output is byte-identical on regeneration (test `test_inventory_regeneration_is_byte_identical` passes). PDS Rings ISS-SEDR CKs are discontinuous Type-1 (one interval per image shutter event), so the inventory summarizes them (first/last 5 + total count) instead of dumping every row.

### Completion Notes List

- All six ACs satisfied:
  - **AC1:** `python bake/src/acquire_kernels.py` populates `kernels/` from a clean state, is idempotent on re-run, and produces the must-have kernel set (17 kernels listed below).
  - **AC2:** Manifest has `schema_version: 1`, ISO-8601 `manifest_generated`, `kernel_count: 17`, and every entry carries `file` / `target_path` / `source_url` / `expected_sha256` (64 hex) / `size_bytes` / `kind` / `attribution`. PDS Rings entries carry `"PDS Rings Node (SETI Institute) — …"` attribution as required.
  - **AC3:** `verify_kernels.py` exits 0 on full match; exits non-zero with `MISSING:` / `MISMATCH:` (plus expected + actual SHA) on tamper or missing kernel. Tests assert both.
  - **AC4:** All 17 NAIF kernels appear in `git lfs ls-files`; `git check-attr filter -- kernels/<sample>` reports `filter: lfs` for each extension. `.gitattributes` patched with `*.tpc` to cover the text-PCK file (extension `.tpc`, not `.pck`).
  - **AC5:** `docs/kernels/ckbrief-inventory.md` documents every CK coverage window per spacecraft / per structure, with explicit per-encounter cross-check (V1 Jupiter / V1 Saturn / V1 PBD / V2 Jupiter / V2 Saturn / V2 Uranus / V2 Neptune). PBD statement: V1 super CK provides continuous **bus-level** coverage at 1990-02-14, but **no CK** provides scan-platform coverage — Epic 5 / Story 5.2 will synthesize the family-portrait turn. Synthesis-gaps section documents the FR18 / Story 3.2 HGA-Earth scope.
  - **AC6:** `kernels/frame-ids.md` documents every V1 + V2 frame name ↔ ID pair plus parent / TKFRAME rotations. Reproducibly regenerated via `python bake/src/fk_inventory.py`.
- 17 kernels acquired (total bundle ~187 MB): 3 generic (LSK, PCK, DE440) + 2 Voyager merged SPK + 2 SCLK + 2 FK + 2 NAIF super CK + 6 PDS Rings Node ISS-SEDR scan-platform CKs (V1/V2 Jupiter, V1/V2 Saturn, V2 Uranus, V2 Neptune).
- DE440 dominates at ~115 MB; everything else combined is ~72 MB. README notes a 1–5 minute wall-clock expectation for a residential link.
- Final test suite: bake `172 passed, 2 skipped` (133 baseline + 39 new); web `89/89` unchanged.

### File List

**New files (production):**

- `bake/src/__init__.py`
- `bake/src/_kernel_io.py`
- `bake/src/acquire_kernels.py`
- `bake/src/verify_kernels.py`
- `bake/src/ck_inventory.py`
- `bake/src/fk_inventory.py`
- `kernels/kernels-manifest.json`
- `kernels/frame-ids.md`
- `kernels/naif0012.tls`
- `kernels/pck00011.tpc`
- `kernels/de440.bsp`
- `kernels/Voyager_1.a54206u_V0.2_merged.bsp`
- `kernels/Voyager_2.m05016u.merged.bsp`
- `kernels/vg100051.tsc`
- `kernels/vg200051.tsc`
- `kernels/vg1_v02.tf`
- `kernels/vg2_v02.tf`
- `kernels/vgr1_super_v2.bc`
- `kernels/vgr2_super_v2.bc`
- `kernels/vg1_jup_version1_type1_iss_sedr.bc`
- `kernels/vg2_jup_version1_type1_iss_sedr.bc`
- `kernels/vg1_sat_version1_type1_iss_sedr.bc`
- `kernels/vg2_sat_version1_type1_iss_sedr.bc`
- `kernels/vg2_ura_version1_type1_iss_sedr.bc`
- `kernels/vg2_nep_version1_type1_iss_sedr.bc`
- `docs/kernels/ckbrief-inventory.md`

**New files (tests):**

- `bake/tests/test_kernels_manifest.py` (17 cases including 7 parametrized)
- `bake/tests/test_acquire_kernels.py` (7 cases)
- `bake/tests/test_ck_inventory.py` (15 cases including 7 parametrized)

**Modified files:**

- `.gitattributes` (added `*.tpc` to LFS pattern list)
- `.gitignore` (added `bake/src/**/__pycache__/`)
- `README.md` (added "Kernels" section after "Repository Layout"; updated `.gitattributes` reference)
- `bake/tests/test_scaffold.py` (extended `.gitattributes` assertion to include `*.tpc`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (1.3 marked review)

### Change Log

- 2026-05-18: Story 1.3 implemented — kernels/ populated from NAIF + PDS Rings Node (17 kernels, ~187 MB), SHA-256-pinned in `kernels/kernels-manifest.json`, LFS-tracked; `acquire_kernels.py` / `verify_kernels.py` / `ck_inventory.py` / `fk_inventory.py` authored; `docs/kernels/ckbrief-inventory.md` and `kernels/frame-ids.md` generated; 39 new pytest cases pass; baseline regression (web 89/89, bake 133 baseline) preserved.
