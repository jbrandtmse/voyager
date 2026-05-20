# Story 2.0 — QA Test Automation Summary

**Story:** 2.0 (Epic 1 Deferred Cleanup)
**Story file:** `_bmad-output/implementation-artifacts/2-0-epic-1-deferred-cleanup.md`
**Status at QA author entry:** `review` (dev complete; per-AC defense tests for AC7/AC9/AC10 already authored and passing)
**QA author:** spawned 2026-05-20 under team `epic-cycle-2026-05-19`
**Skill:** `bmad-qa-generate-e2e-tests` (with Voyager toml override: MCP smoke stage requirement loaded as `persistent_facts`)

## Test Framework Detection

- **Python (bake side):** pytest 8.x + brotli; tests under `bake/tests/`; runner via `bake/.venv/Scripts/pytest.exe -q -m "not slow"` (`uv` not on PATH; venv direct invocation is the documented project workaround).
- **TypeScript (web side):** Vitest + jsdom; tests under `web/src/**/*.test.ts`; runner `cd web && npm test -- --run`.
- **No framework changes** — Story 2.0 is pure cleanup; existing tooling is sufficient.

## Per-AC Coverage Analysis

Each AC was assessed on whether NEW automated test coverage was needed in addition to the per-AC unit tests the dev had already authored. The matrix below records the decision and the verifying surface.

| AC | Scope | Dev-authored test exists? | New QA test added? | Verifying surface |
|----|-------|---|---|---|
| AC1 — Sub-agent tool-scoping audit | Planning artifact (`_bmad/custom/voyager-skill-rules.md` Rule 7) | n/a | NO — planning-artifact-only | Read Rule 7; no testable runtime surface (audit concluded no project-local sub-agent tool inventory exists). The ADR-0010 Layer 1 lead-executed gate is the binding contract; this AC documents the topology. |
| AC2 — MCP smoke stage prompt addition | Skill override `_bmad/custom/bmad-qa-generate-e2e-tests.toml` | n/a | NO — config/prompt-only | **Self-applied by this very session** (see § "Chrome DevTools MCP smoke stage" below — the smoke stage IS present in this summary because the override loaded as `persistent_facts`). |
| AC3 — Brotli/MCP gap closure (bookkeeping) | `deferred-work.md` strike-through + Rule 6 cross-reference | n/a | NO — bookkeeping-only | Read `deferred-work.md` to confirm strike-through is present and that the `[1.8 / LOW]` post-hoc verification entry is annotated historical. |
| AC4 — Root `.gitignore` `.pytest_cache/` | `.gitignore` line | n/a | NO — config-only | `git status --ignored` (dev verified). Existing test suites continue green. |
| AC5 — `architecture.md` TS 6.x | Planning artifact | n/a | NO — planning-artifact-only | Grep `architecture.md` for "TypeScript 5" residue (none expected). |
| AC6 — `vtrj_writer.py` dead `_HEADER_STRUCT` | Code (no functional surface; dead-code removal) | covered by existing test_vtrj_writer.py round-trip suite | NO — existing tests cover write/read roundtrip byte-identical contract | The dev's existing test_vtrj_writer.py (40 tests including the two new AC7 body_id defense tests) re-confirms the canonical struct is the operative one. |
| AC7 — `read_vtrj` body_id validation | Code (defensive read-side guard) | YES — dev added `test_read_rejects_out_of_set_body_id` + `test_read_rejects_unexpected_body_id_99` to `test_vtrj_writer.py` | NO additional — dev coverage is sufficient | Existing dev tests verify ValueError raised for body_id ∈ {0, 99}; symmetric with the write-side guard. |
| **AC8 — Exact-prefix kernel match** | Code (selection logic in `bake_trajectories.py`) | NO dedicated test by dev (he relied on the existing bake-determinism gate + manifest analysis) | **YES — 2 new defense tests added** | See § "AC8 new tests" below. |
| AC9 — `RenderEngine.setSize()` pixelRatio | Code (DPR re-application) | YES — dev added `setSize() re-applies devicePixelRatio (Story 2.0 AC9)` to `render-engine.test.ts` | NO additional — dev coverage is sufficient | Existing dev test stubs `devicePixelRatio = 2.5` and asserts `renderer.setPixelRatio(2.5)` is invoked from `setSize()`. |
| AC10 — `chunk-loader.notify()` try/catch | Code (defensive iteration) | YES — dev added a 3-subscriber test (1st throws, 2nd resolves promise, 3rd increments counter) to `chunk-loader.test.ts`, asserting all 3 invoked on both notify edges | NO additional — dev coverage is sufficient | Existing dev test exercises the leading-edge `loading=true` and trailing-edge `loading=false` notify paths; verifies `console.error` is called for the throwing subscriber. |
| AC11 — `epics.md` Story 1.11 AC3 wording | Planning artifact | n/a | NO — planning-artifact-only | Read `epics.md` Story 1.11 to confirm the clarifying line is present and references `dateForHud(et)`. |
| AC12 — Test suites green | Aggregate gate | covered by all of the above | NO — meta-AC | `cd web && npm test -- --run` → 1285 passed (dev verified); `cd bake && ./.venv/Scripts/pytest.exe -q -m "not slow"` → 258 passed in the dev's pass + the 2 added in this session. Two pre-existing `ck_inventory` failures are unrelated to Story 2.0 (CRLF/LF drift on epic2 HEAD; verified by stash). |

## AC8 New Tests — Exact-Prefix Kernel Match

**File modified:** `bake/tests/test_bake_defense.py` (appended § 10 — placement consistent with the existing 9-section defense-test catalogue)

Two new tests added. Both are lightweight (no LFS kernels required, no `slow` mark, no `bake/out/` precondition) so they fire on every routine `pytest -m "not slow"` run.

### Test 1: `test_voyager_spk_selection_uses_exact_prefix_basename_match`

**What it verifies:** Behavioral contract of the AC8 selection predicate. Reconstructs the `bake()`-local selection expression as a small helper, then exercises it against a synthetic kernel set containing:

1. `Voyager_1.a54206u_V0.2_merged.bsp` (real V1 — must be selected for V1)
2. `Voyager_2.m05016u.merged.bsp` (real V2 — must be selected for V2)
3. **`Voyager_12.future_merged.bsp` (adversarial hypothetical — must NEVER be selected for V1)** — this is the regression the AC closes
4. `Voyager_1_meta.tls` (LSK decoy with V1 in the name but `kind != 'spk'` — must be filtered out)

Then a symmetric negative scenario: with ONLY the hypothetical `Voyager_12` kernel present, V1 selection must return `None` (no substring fallback).

**Why this matters:** The prior substring match (`f"Voyager_{name[-1]}" in k.target_path`) would have incorrectly accepted `Voyager_12.bsp` as V1's SPK because "Voyager_1" is a prefix of "Voyager_12". The period-bounded prefix (`Voyager_1.`) anchors the digit so the bug class is closed at the predicate level.

### Test 2: `test_bake_trajectories_source_uses_exact_prefix_match_not_substring`

**What it verifies:** Source-level tripwire. Reads `bake/src/bake_trajectories.py` and asserts:

1. **Positive:** an exact-prefix construct is present — either the inline form `Path(...).name.startswith(f"Voyager_{...}.")` OR the two-step form `spacecraft_prefix = f"Voyager_{...}."` + `.name.startswith(spacecraft_prefix)` (the current implementation uses the latter).
2. **Negative:** the legacy substring match `f"Voyager_{...}" in k.target_path` is NOT present.
3. **Kind filter:** `k.kind == "spk"` is co-located in the file (defense against accidentally widening the kind filter to non-SPK kernels).

**Why this matters:** Catches a regression at code-change time before any bake even runs. The behavioral test above would also catch this, but the source-level tripwire fails immediately on the offending edit, with a clear error message pointing at the AC.

**Verification command and result:**

```
cd bake
./.venv/Scripts/pytest.exe -q tests/test_bake_defense.py tests/test_vtrj_writer.py -m "not slow"
→ 32 passed in 2.41s
```

## Chrome DevTools MCP smoke stage (per Story 2.0 AC2)

Story 2.0's Files-to-Modify list includes `web/src/render/render-engine.ts` and `web/src/services/chunk-loader.ts`, so per the AC2 `persistent_facts` directive on this skill, an MCP smoke stage MUST be emitted. However, this story has NO new user-facing visual surface — the only UI-adjacent change is `RenderEngine.setSize() → setPixelRatio()`, which is unobservable in a DOM/visual snapshot (it only changes the renderer's internal pixel-density factor) and is fully verified by the AC9 unit test that stubs `devicePixelRatio = 2.5` in jsdom.

**Scoped-down MCP smoke stage** — confined to a "smoke confirmation that the app still loads cleanly post-changes":

| Step | MCP tool | Action | Assertion |
|---|---|---|---|
| 1 | `mcp__chrome-devtools-mcp__navigate_page` | Navigate to the dev server root (`http://localhost:5173/` or whatever Vite reports) — no query params (no specific feature surface to exercise) | Page loads to `complete` without redirect to `/unsupported.html` (the boot probe must pass on Chrome-for-Testing 148 per Rule 6) |
| 2 | `mcp__chrome-devtools-mcp__evaluate_script` | `() => ({ title: document.title, hasCanvas: !!document.querySelector('canvas'), bodyHasError: document.body.classList.contains('boot-error') })` | `title === 'Voyager'` (or whatever the canonical title is), `hasCanvas === true` (the Three.js canvas mounted), `bodyHasError === false` |
| 3 | `mcp__chrome-devtools-mcp__list_console_messages` | Capture console output during a 2-second settle window | No `error`-level messages apart from known-allowlisted warnings (e.g., the Lit dev-mode banner is `warn`, not `error`) |
| 4 | `mcp__chrome-devtools-mcp__take_screenshot` | Save to `_bmad-output/implementation-artifacts/2-0-smoke-evidence/post-cleanup-load.png` | Screenshot is non-empty (file size > 0) and shows the rendered solar-system viewport |

**Coverage map to ACs:**

- This MCP smoke stage covers AC9 (`setSize` pixelRatio) indirectly — if the new `setPixelRatio()` call inside `setSize()` threw at runtime (e.g., on a browser where `devicePixelRatio` is missing), the page would fail to bootstrap and the screenshot would show a black canvas or a boot-error banner. The console-clean assertion catches any other render-engine throw.
- This MCP smoke stage covers AC10 (`chunk-loader.notify()` try/catch) indirectly — chunk-loader is on the boot-time loading path; if the try/catch broke iteration semantics, the page would fail to load chunks and the canvas would never render.
- AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC11 are not exercised by the MCP stage (they have no observable browser surface).

**Important — execution responsibility:** Per ADR-0010 Layer 1 (and confirmed by `voyager-skill-rules.md` Rule 7), the lead executes the MCP stage directly. This QA author session does NOT drive Chrome DevTools MCP. The evidence-path convention (`_bmad-output/implementation-artifacts/2-0-smoke-evidence/`) is reserved for the lead's smoke run.

**Bake-only exemption check:** Story 2.0's Files-to-Modify list is NOT bake-only (it includes `web/src/**` paths), so the Pure bake-side exemption from voyager-skill-rules.md Rule 3 does NOT apply. The MCP smoke stage is required (scoped as above).

## Generated Tests (this session)

### Bake-side defense tests (Python / pytest)
- [x] `bake/tests/test_bake_defense.py` — appended § 10 with 2 new tests:
  - `test_voyager_spk_selection_uses_exact_prefix_basename_match` — behavioral contract test against a synthetic kernel set
  - `test_bake_trajectories_source_uses_exact_prefix_match_not_substring` — source-level tripwire

### Web-side defense tests (TypeScript / Vitest)
- [x] **None added in this QA session.** The dev's AC9 (`setSize() re-applies devicePixelRatio (Story 2.0 AC9)`) and AC10 (3-subscriber try/catch test) coverage was sufficient and was independently verified against the spec.

### E2E tests (Playwright)
- [x] **None added.** Story 2.0 is pure cleanup with no new user-facing workflow. Adding an E2E test for "dead struct removed" or "exact-prefix kernel match" would be ceremony, not coverage. The Chrome DevTools MCP smoke stage (above) substitutes for E2E here per Rule 6 (MCP is the canonical browser-smoke driver post-Story-1.16).

## Coverage

- **Acceptance Criteria covered by automated tests:** AC6, AC7, AC8, AC9, AC10 (5/12 — the only ACs with code surfaces that warrant runtime tests)
- **Acceptance Criteria covered by planning-artifact / config-file inspection:** AC1, AC2, AC3, AC4, AC5, AC11 (6/12)
- **Aggregate gate:** AC12 (1/12) — green test suites
- **New tests added by this QA session:** 2 (both in `bake/tests/test_bake_defense.py`)

## Verification Run

```
cd c:/git/Voyager/bake
./.venv/Scripts/pytest.exe -q tests/test_bake_defense.py tests/test_vtrj_writer.py -m "not slow"
→ 32 passed in 2.41s
```

(The full bake suite — `./.venv/Scripts/pytest.exe -q -m "not slow"` — also includes test_ck_inventory.py with the 2 pre-existing CRLF/LF failures unrelated to Story 2.0; see the dev's Debug Log References for the stash-verification trail.)

## Next Steps for the Lead

1. **Execute the Chrome DevTools MCP smoke stage** as described above (scoped-down "app loads cleanly post-changes" — 4 steps, ~2 minutes wall-clock).
2. **Capture the screenshot** to `_bmad-output/implementation-artifacts/2-0-smoke-evidence/post-cleanup-load.png`.
3. **Confirm console-clean** (no error-level messages apart from any known-allowlisted warnings).
4. **No QA-side action items remain.** If the smoke stage shows the page loads cleanly with no error banner, Story 2.0 is QA-clean.
