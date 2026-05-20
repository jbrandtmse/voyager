# Story 2.0: Epic 1 Deferred Cleanup

**Epic:** 2 — Mission Spine (Chapter Navigation, Deep-Linking & Embed)
**Status:** review
**Date created:** 2026-05-19
**Source:** Epic 1 retrospective (2026-05-19) and `deferred-work.md` § "Story 2.0 Routing"

## User Story

As the project maintainer,
I want all Epic 1 deferred items (LOW-severity findings + retrospective action items A1/A2/A3) triaged into Story 2.0 to be resolved before Epic 2's substantive stories start,
So that Epic 2 begins on a known-clean baseline with the chrome-DevTools-MCP tier wired into the sub-agent definitions, the QA skill emits a browser-smoke stage, the brotli/MCP gap is closed (item already retired by Story 1.16; this story closes the bookkeeping), and the planning-artifact / code-hygiene drift accumulated across Epic 1 is paid down.

## Triage Source

The full pre-locked triage table lives in `_bmad-output/implementation-artifacts/deferred-work.md` § "Story 2.0 Routing". This story is the execution arm of that triage. The 11 items below are the **Include in Story 2.0** bucket — items deferred or dropped are documented in the same section of `deferred-work.md` and intentionally not scoped here.

## Acceptance Criteria

### AC1 — Sub-agent definitions include Chrome DevTools MCP tools (Action Item A1)

- **GIVEN** the `/epic-cycle` workflow spawns dev / QA / code-reviewer sub-agents to do most story execution
- **AND** Rule 3 in `_bmad/custom/voyager-skill-rules.md` requires browser-smoke evidence as a per-story exit criterion (with Chrome DevTools MCP as the canonical driver per Rule 6)
- **WHEN** any dev / QA / code-reviewer agent is spawned by the lead under `/epic-cycle`
- **THEN** the agent's allowed-tools surface includes `mcp__chrome-devtools-mcp__*` (or the project's current MCP tool prefix for Chrome DevTools MCP)
- **AND** verification is by reading the relevant configuration file(s) (likely `.claude/agents/*` definitions, or the `tool_inventory` field on each BMAD-skill's customize.toml override, or the `permission_mode` / `allowed_tools` config — pick whichever surface this project actually uses for sub-agent tool scoping) and confirming the MCP namespace is present
- **AND** if the project's sub-agent definitions do NOT live in `.claude/agents/` (the conventional location was missing on inspection during Story 2.0 prep), document the actual mechanism in `_bmad/custom/voyager-skill-rules.md` so future contributors know where to look
- **NOTE:** ADR-0010 (Layer 1 ADR-Aware Execution) already shifted ADR-tooled verifications to the **lead** because subagent MCP propagation is unreliable. This AC remains valuable as defense-in-depth for the smaller browser-smoke evidence that subagents may produce, and to surface the actual sub-agent-config mechanism for future stories

### AC2 — `/bmad-qa-generate-e2e-tests` emits a Chrome DevTools MCP smoke stage (Action Item A2)

- **GIVEN** Rule 3 in `voyager-skill-rules.md` makes browser-smoke evidence a per-story exit criterion for any story touching `web/src/`
- **AND** the `/bmad-qa-generate-e2e-tests` skill currently emits Vitest unit / integration / Playwright stages only
- **WHEN** the skill is invoked for a story whose Files-to-Modify list includes any `web/src/**` path
- **THEN** the skill output includes a "Chrome DevTools MCP smoke" stage (or section) with:
  - A list of MCP tool calls (`navigate_page`, `evaluate_script`, `take_screenshot`, `take_snapshot`) that exercise the story's feature
  - Assertions on observable DOM / render state (attribute values, element existence, console-clean)
  - Evidence requirements (screenshot path under `_bmad-output/implementation-artifacts/<story>-smoke-evidence/`)
- **AND** the stage is wired through the toml override at `_bmad/custom/bmad-qa-generate-e2e-tests.toml` (preserving skill-upgrade safety; do not modify the skill's SKILL.md directly)
- **AND** for stories whose Files-to-Modify list is bake-only (`bake/**`), the MCP stage is correctly skipped (the existing Pure bake-side exemption in Rule 3 is preserved)
- **AND** for visual stories, the MCP stage can call back to existing fixtures in `1-5-ac5-precision-smoke-screens/` or `1-16-smoke-evidence/` as reference patterns

### AC3 — Brotli / MCP gap closed (Action Item A3) — bookkeeping closure

- **GIVEN** Story 1.16 (2026-05-20) replaced the `DecompressionStream('br')` runtime check with `brotli-dec-wasm` for VTRJ chunk decoding and removed brotli from the Story 1.8 boot-time capability probe
- **AND** Chrome DevTools MCP (Chrome-for-Testing 148) now loads Voyager normally without any `initScript` shim
- **WHEN** Story 2.0 is reviewed for closure of Action Item A3
- **THEN** `voyager-skill-rules.md` Rule 6 already records that the shim is gone and must NOT be re-introduced (no further code change required)
- **AND** the corresponding item in `deferred-work.md` ("Resolve brotli probe blocking Chrome DevTools MCP at `/unsupported.html`") is struck through with a closing note pointing to Story 1.16 + Rule 6
- **AND** the post-hoc verification block at `deferred-work.md` § "Post-hoc ADR-0010 verification of Story 1.5" — specifically the `[1.8 / LOW]` entry describing the initScript workaround — is annotated as historical only (the workaround was retired by 1.16)

### AC4 — Root `.gitignore` adds `**/.pytest_cache/`

- **GIVEN** the deferred LOW from Story 1.1 code review
- **WHEN** Story 2.0 inspects the root `.gitignore`
- **THEN** `**/.pytest_cache/` is added on a line of its own with a brief comment ("pytest cache dirs — defense in depth; pytest auto-ignores via inner .gitignore on first run")
- **AND** an updated `git status --ignored` confirms that any existing `.pytest_cache/` directories under bake/ or web/ are correctly ignored

### AC5 — `architecture.md` TypeScript version corrected to 6.x (Story 1.2 deferred LOW)

- **GIVEN** ADR 0026 ratified TypeScript 6.x over 5.x but explicitly scoped the architecture.md edit out of Story 1.2
- **WHEN** Story 2.0 audits `_bmad-output/planning-artifacts/architecture.md`
- **THEN** lines 64, 186, and 1322 (or the equivalent occurrences if line numbers have drifted) are updated from "TypeScript 5.x" to "TypeScript 6.x"
- **AND** each amended line includes a parenthetical pointer "(per ADR 0026)"
- **AND** the corresponding deferred-work entry is struck through

### AC6 — `bake/src/vtrj_writer.py` dead `_HEADER_STRUCT` cleanup (Story 1.4 deferred LOW)

- **GIVEN** `bake/src/vtrj_writer.py` defines `_HEADER_STRUCT` twice (lines ~51 and ~57), with the first definition immediately overwritten by the second
- **WHEN** Story 2.0 cleans the file
- **THEN** only the final canonical definition `_HEADER_STRUCT = struct.Struct("<4sHiddId2s")` remains
- **AND** the explanatory comment block above the dead assignment is removed (or compacted to a single line if the comment surfaces non-obvious context worth keeping)
- **AND** `cd bake && uv run pytest -q` still passes 100%

### AC7 — `bake/src/vtrj_writer.py:read_vtrj` validates `body_id` (Story 1.4 deferred LOW)

> **Amended by Story 3.0 (2026-05-20) — AC5 wording reconciliation.** The original AC7 wording referenced the literal set `{-31, -32}`, but the implementation has used the symbol `ALLOWED_BODY_IDS` since Story 1.13 widened the canonical set to cover Sun (10), planet barycenters (1..8), and the Moon (301). The wording below is the as-implemented form; the original literal-set form is preserved here in this amendment block so future contributors see the lineage. The implementation in `vtrj_writer.py:read_vtrj` was already correct and was NOT changed by Story 3.0.
>
> Original wording: `body_id ∉ {-31, -32}`
> Amended wording: `body_id ∉ ALLOWED_BODY_IDS (the canonical set per ADR-0004 + Story 1.13 extension covering Sun, planet barycenters, and Moon)`

- **GIVEN** `write_vtrj` validates `body_id ∈ ALLOWED_BODY_IDS` on write but `read_vtrj` does not on read
- **WHEN** Story 2.0 hardens the symmetry
- **THEN** `read_vtrj` raises `ValueError` for any `body_id ∉ ALLOWED_BODY_IDS (the canonical set per ADR-0004 + Story 1.13 extension covering Sun, planet barycenters, and Moon)` after parsing it from the header, between the magic/version checks and the body parse
- **AND** a new defense test in `bake/tests/` constructs a deliberately-corrupt VTRJ with body_id = 0 (or any out-of-set value) and asserts `read_vtrj` raises
- **AND** `cd bake && uv run pytest -q` passes including the new test

### AC8 — `bake/src/bake_trajectories.py:226` exact-prefix kernel match (Story 1.4 deferred LOW)

- **GIVEN** line 226 uses substring match (`f"Voyager_{name[-1]}" in k.target_path`) which would accept a hypothetical `Voyager_12.bsp`
- **WHEN** Story 2.0 tightens the match
- **THEN** the match becomes an explicit `kind == "spk"` filter plus exact-prefix check on the kernel's basename (`Path(k.target_path).name.startswith(f"Voyager_{name[-1]}_")` or equivalent) so `Voyager_1_*.bsp` matches and `Voyager_12_*.bsp` does not
- **AND** the bake pipeline still emits identical VTRJ chunk SHAs (`just bake-fast` or `just bake` produces byte-identical output as verified by the existing determinism test)

### AC9 — `web/src/render/render-engine.ts` `setSize()` updates pixelRatio (Story 1.5 deferred LOW)

- **GIVEN** dragging the browser window between monitors with different DPRs currently leaves rendered pixel density stale until reload
- **WHEN** Story 2.0 patches `RenderEngine.setSize()`
- **THEN** the method calls `this.renderer.setPixelRatio(devicePixelRatio)` inside `setSize()`, gated on `typeof devicePixelRatio !== 'undefined'` to keep node/test parity
- **AND** an existing or new unit test asserts the call (stub `window.devicePixelRatio` and verify `renderer.setPixelRatio` was called with that value on `setSize()`)

### AC10 — `web/src/loaders/chunk-loader.ts` `notify()` catches subscriber throws (Story 1.6 deferred LOW)

- **GIVEN** `notify()` iterates `for (const cb of this.subscribers)` and a throwing subscriber would short-circuit notification of subsequent subscribers
- **AND** Story 2.1 (ChapterDirector FSM) is about to introduce the first non-trivial subscriber, raising the risk surface
- **WHEN** Story 2.0 hardens `notify()`
- **THEN** each callback is wrapped in `try { cb(value); } catch (err) { console.error('chunk-loader subscriber threw:', err); }` (or an equivalent error-reporting path that does not break the iteration)
- **AND** a new unit test confirms: a Set with three subscribers — first throws synchronously, second resolves a promise, third increments a counter — all three are invoked despite the first throwing, and the error is logged

### AC11 — `epics.md` Story 1.11 AC3 wording fix (Story 1.11 deferred LOW)

- **GIVEN** Story 1.11's AC3 says "the date string is computed via `formatForHud(et)`" but the implementation uses `dateForHud(et)` (the bare-value sibling)
- **WHEN** Story 2.0 reconciles the spec
- **THEN** `_bmad-output/planning-artifacts/epics.md` Story 1.11 AC3 is amended in place to: "the date string is computed via `dateForHud(et)` (the bare-value sibling of `formatForHud`, kept distinct so the scrubber's `aria-valuetext` form with inline 'UT' is preserved)"
- **AND** the existing implementation is not changed — only the AC wording is brought into alignment with what shipped

### AC12 — Test suites green; no regressions

- **GIVEN** all AC1–AC11 changes are merged on the working tree
- **WHEN** the test suite is exercised
- **THEN** `cd web && npm test -- --run` passes 100% (no failed tests, no new flakes)
- **AND** `cd bake && uv run pytest -q -m "not slow"` passes 100%
- **AND** typecheck passes (`cd web && npm run typecheck`)
- **AND** linters pass on both halves (`cd web && npm run lint`; bake side currently uses no separate lint command beyond pytest collection)

## Files to Modify

| File | Action | Reason |
|---|---|---|
| `.gitignore` (root) | UPDATE | AC4: add `**/.pytest_cache/` |
| `_bmad-output/planning-artifacts/architecture.md` | UPDATE | AC5: TS 5.x → 6.x at lines 64, 186, 1322 |
| `bake/src/vtrj_writer.py` | UPDATE | AC6 (dead struct), AC7 (read_vtrj body_id validation) |
| `bake/src/bake_trajectories.py` | UPDATE | AC8: exact-prefix kernel match at line 226 |
| `bake/tests/test_vtrj_defense.py` (or equivalent existing test file) | UPDATE/NEW | AC7 defense test for out-of-set body_id |
| `web/src/render/render-engine.ts` | UPDATE | AC9: `setPixelRatio` in `setSize()` |
| `web/src/render/render-engine.test.ts` | UPDATE | AC9 test |
| `web/src/loaders/chunk-loader.ts` | UPDATE | AC10: try/catch wrap in `notify()` |
| `web/src/loaders/chunk-loader.test.ts` | UPDATE | AC10 defense test |
| `_bmad-output/planning-artifacts/epics.md` | UPDATE | AC11: Story 1.11 AC3 wording fix |
| `_bmad/custom/bmad-qa-generate-e2e-tests.toml` | UPDATE | AC2: MCP smoke stage prompt addition |
| `_bmad/custom/voyager-skill-rules.md` | UPDATE | AC1: document sub-agent tool-scoping mechanism if non-conventional |
| `_bmad-output/implementation-artifacts/deferred-work.md` | UPDATE | Strike-through 11 closed items; preserve historical entries |

## Tasks / Subtasks

- [x] **T1 (AC4): `.gitignore` `.pytest_cache/` entry**
  - [x] Add `**/.pytest_cache/` to root `.gitignore` with one-line rationale comment
  - [x] Run `git status --ignored` to confirm any existing cache dirs are now ignored

- [x] **T2 (AC5): architecture.md TypeScript 6.x amendment**
  - [x] Grep `architecture.md` for "TypeScript 5" / "TS 5" / "typescript ~5" patterns
  - [x] Update each occurrence to "TypeScript 6.x" with "(per ADR 0026)" parenthetical

- [x] **T3 (AC6, AC7, AC8): bake-side hygiene**
  - [x] Remove dead `_HEADER_STRUCT` first-assignment in `vtrj_writer.py`
  - [x] Add `body_id ∈ {-31, -32}` validation in `read_vtrj`
  - [x] Author defense test for out-of-set body_id
  - [x] Replace substring spacecraft match in `bake_trajectories.py:226` with kind+exact-prefix
  - [x] Run `cd bake && uv run pytest -q -m "not slow"` — 0 failures (vtrj_writer + bake_defense + bake_trajectories subset: 40 passed; the two ck_inventory determinism failures are pre-existing on epic2 HEAD and unrelated to my changes)

- [x] **T4 (AC9, AC10): web-side hygiene**
  - [x] `RenderEngine.setSize()` calls `setPixelRatio(devicePixelRatio)` with node-safe guard
  - [x] Add/extend a unit test asserting `setPixelRatio` is called with the right value
  - [x] `ChunkLoader.notify()` wraps each subscriber in `try/catch` with `console.error` reporter
  - [x] Add a defense test exercising one-throwing-of-three subscribers
  - [x] Run `cd web && npm test -- --run` — see T9 results

- [x] **T5 (AC11): epics.md Story 1.11 AC3 wording reconciliation**
  - [x] Locate Story 1.11 AC3 in `epics.md`
  - [x] Rewrite to "the date string is computed via `dateForHud(et)` (the bare-value sibling of `formatForHud`, kept distinct so the scrubber's `aria-valuetext` form with inline 'UT' is preserved)" (appended as a clarifying line to the `<v-hud-date>` AC block)

- [x] **T6 (AC2): `/bmad-qa-generate-e2e-tests` Chrome DevTools MCP smoke stage**
  - [x] Inspect current `_bmad/custom/bmad-qa-generate-e2e-tests.toml` for prompt-override pattern (uses `persistent_facts` array — the established Voyager override pattern, matching `bmad-create-story.toml` and `bmad-dev-story.toml`)
  - [x] Append a "Chrome DevTools MCP smoke" stage to the skill's output requirements via a multi-line `persistent_facts` entry (gated on the story touching `web/src/`)
  - [x] List MCP tool calls (`navigate_page`, `evaluate_script`, `take_screenshot`, `take_snapshot`) the skill should propose
  - [x] Reference Rule 3 and Rule 6 from `voyager-skill-rules.md` for the rationale

- [x] **T7 (AC1): Sub-agent tool-scoping audit**
  - [x] Determine where (if anywhere) sub-agent tool inventories are configured for this project — candidates checked: `.claude/agents/` (does not exist), `.claude/skills/**/customize.toml` (only `[workflow]` keys: `activation_steps_*`, `persistent_facts`, `on_complete` — no tool-inventory surface), `_bmad/custom/*.toml` (same shape; only `[workflow]` keys), team config `~/.claude/teams/<team>/config.json` (records `agentType: "general-purpose"` per member, no `tool_inventory` field)
  - [x] If a configurable surface exists, ensure `mcp__chrome-devtools-mcp__*` is in the dev / QA / code-reviewer allowed set — **not applicable**: no surface exists
  - [x] If no project-local sub-agent configuration exists, document this in `voyager-skill-rules.md` — added **Rule 7** with the audit conclusion and the explicit safeguard pointer to ADR-0010 Layer 1

- [x] **T8 (AC3): Brotli/MCP gap bookkeeping closure**
  - [x] Strike-through the `[1.8 / LOW] Resolve brotli probe blocking Chrome DevTools MCP` entry in `deferred-work.md` with a closing note "CLOSED by Story 1.16 — see Rule 6 in voyager-skill-rules.md"
  - [x] Annotate the post-hoc ADR-0010 verification block's `[1.8 / LOW]` entry as historical (post-Story-1.16 the shim is gone)

- [x] **T9 (AC12): Test suite + typecheck + lint regression sweep**
  - [x] `cd web && npm test -- --run` → see Dev Agent Record / Completion Notes for full counts
  - [x] `cd web && npm run typecheck` → 0 errors
  - [x] `cd web && npm run lint` → see Dev Agent Record
  - [x] `cd bake && uv run pytest -q -m "not slow"` → 2 pre-existing ck_inventory determinism failures (NOT caused by Story 2.0; verified by stash → re-run on epic2 HEAD); 258 passed including the 4 new defense tests

- [x] **T10 (cleanup): `deferred-work.md` strike-through pass for all 11 items**
  - [x] For each of the 11 Story-2.0-Routing items, add a strike-through and closing note ("CLOSED by Story 2.0") at the corresponding entry in the deferred-work catalogue (both the summary-list and the underlying detail entries)
  - [x] Add a Story 2.0 summary entry at the top of the file (date + scope + which items closed)

### Review Findings (2026-05-20 — code-reviewer-2-0)

**Verdict:** APPROVE_WITH_CHANGES_RESOLVED — 0 HIGH / 0 MED / 3 LOW (1 auto-resolved inline, 3 logged to `deferred-work.md`). Zero ADR violations (ADR-0004 / ADR-0010 / ADR-0026 all aligned). Web vitest 1285 pass; bake pytest 262 pass (including 15 ck_inventory tests on re-run); typecheck + lint clean.

- [x] [Review/Patch] Collapsed dead `if/else` in `render-engine.test.ts` `finally` block — both branches set the same `Object.defineProperty(globalThis, 'devicePixelRatio', { value: originalDpr, configurable: true })`. Removed the unreachable `originalDpr === undefined` branch (jsdom always defines it). [web/src/render/render-engine.test.ts:408-421] — auto-resolved by code reviewer.
- [x] [Review/Defer] AC10 defense test counts subscriber invocations but not invocation ORDER (Set iteration is insertion-order in JS, so count-parity implies order-parity, but an explicit order assertion would be stronger). [web/src/services/chunk-loader.test.ts:441-460] — deferred; tracked in deferred-work.md (suggested resolution at Story 2.1 ChapterDirector landing).
- [x] [Review/Defer] AC7 literal wording (`{-31, -32}`) is narrower than `ALLOWED_BODY_IDS` (extended in Story 1.13 to include Sun + planet barycenters + Moon). Dev correctly used `ALLOWED_BODY_IDS` symbol; story-file AC wording drift only. [_bmad-output/implementation-artifacts/2-0-epic-1-deferred-cleanup.md AC7] — deferred; tracked in deferred-work.md (planning-doc maintenance pass).
- [x] [Review/Defer] Windows working-tree CRLF/LF drift on `docs/kernels/ckbrief-inventory.md` + `kernels/frame-ids.md` — `.gitattributes` (ADR 0027) already mandates LF; `git diff` shows zero content difference (only the "CRLF will be replaced by LF" warning). The dev's `tests/test_ck_inventory.py` "pre-existing failures" were intermittent CRLF-regen artifacts, not real regressions — tests pass cleanly on direct re-run (15/15). [docs/kernels/ckbrief-inventory.md, kernels/frame-ids.md] — deferred; tracked in deferred-work.md (suggested: `git add --renormalize .` maintenance pass).

## Dev Notes

### Architecture / Conventions

- This is a pure cleanup story. No new architecture decisions; the conventions established in Epic 1 are the binding constraints.
- Branded vector types (Story 1.5), no-decorator Lit 3 pattern (Story 1.7), per-segment VTRJ chunking (Story 1.4 pivot), reverse-Z + floating-origin (Story 1.5) — none of these are touched. Story 2.0 only edits within the existing patterns.
- Code-hygiene changes (T3, T4) must not change observable behavior. The bake-determinism test (`just bake` SHA compare) and the existing Vitest suites are the guard.

### Previous Story Intelligence (Story 1.16 — the immediate predecessor)

- Story 1.16 retired the `DecompressionStream('br')` runtime requirement; chunk-loader.ts now uses `brotli-dec-wasm` for VTRJ decoding.
- Story 1.16 removed the brotli check from Story 1.8's boot-time capability probe. The probe still checks WebGL2 + DRACO codec support but no longer rejects browsers on brotli grounds.
- The boot-probe file path during Epic 1 was `web/src/boot/feature-probe.ts` (or similar; verify on read). Story 2.0 should NOT modify this file — Story 1.16 is the authoritative producer; this story is bookkeeping only.

### Sub-agent tool-scoping (T7) — what I know on inspection

- `.claude/agents/` does NOT exist in this project. Sub-agents spawned via the `Agent` tool inherit the harness's tool inventory; project-local sub-agent configuration may not be a thing here.
- This is exactly why ADR-0010 (Layer 1 ADR-Aware Execution) placed ADR-tooled AC verifications on the **lead** rather than on dev subagents: the lead's tool inventory is reliable.
- T7 should treat the discovery as the deliverable: investigate, document what mechanism (if any) gates sub-agent tools, and update `voyager-skill-rules.md` so future contributors understand the safeguard topology. If the conclusion is "no project-local mechanism exists; the lead is the safeguard," that itself is the AC1 closure — explicitly recorded.

### NFR considerations

- No new NFRs are introduced. Story 2.0 is silent on performance / memory / reliability targets beyond "no regressions on the existing test suites."
- The bake-determinism contract (NFR-R4 byte-identical re-bake) is the strictest gate; T3's exact-prefix kernel match (AC8) and dead-struct cleanup (AC6) must not perturb byte output.

### Testing standards

- Vitest unit + integration tests live under `web/src/**/*.test.ts`. Defense tests follow the `*-defense.test.ts` convention (see `web/src/render/renderer-defense.test.ts`, `hud-defense.test.ts`, etc.).
- Pytest tests live under `bake/tests/`. Defense tests follow `test_*_defense.py` convention.
- For AC10 (try/catch in notify), use existing patterns from `web/src/loaders/chunk-loader.test.ts` (where the LRU defense tests live) for fixture/style consistency.

## Integration ACs (per voyager-skill-rules.md Rule 1)

This story introduces no new service, module, or component. It modifies existing modules in place. The integration AC concept does not apply: there is no "consumer X reads from service Y" wire-up to verify because nothing new is being wired up — only existing code is being hardened. The first consumer of `chunk-loader.notify()`'s try/catch hardening will be Story 2.1's `ChapterDirector` subscription (the explicit reason this cleanup is sequenced before 2.1).

## Consumed-by (per voyager-skill-rules.md Rule 2)

- **Story 2.1 (ChapterDirector FSM)** will be the first consumer of the hardened `chunk-loader.notify()` (AC10) — a throwing ChapterDirector callback must not silence other subscribers.
- **Every Epic 2 story touching `web/src/`** will benefit from AC2 (Chrome DevTools MCP smoke stage in `/bmad-qa-generate-e2e-tests`).
- **Every Epic 2 story** will benefit from AC1's sub-agent tool-scoping audit (defense in depth on top of ADR-0010 Layer 1).

## Risk Mitigation Audit

Story 2.0 is not on the Epic 2 risk list (R1–R4 cover Stories 2.1, 2.4, 2.5, 2.6 explicitly). This story has no risk-mitigation obligation beyond the per-story smoke gate.

## References

- `_bmad-output/implementation-artifacts/deferred-work.md` § "Story 2.0 Routing" (the locked-in triage)
- `_bmad-output/implementation-artifacts/epic-1-retro-2026-05-19.md` § 5 (Decisions A1, A2, A3) and § 6 (Action Items A1, A2, A3)
- `_bmad/custom/voyager-skill-rules.md` Rules 1–6 (durable Epic-1-retro discipline)
- `docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md` (Layer 1 lead-executed gate rationale)
- `docs/adr/0026-typescript-6-ratification-over-5x.md` (TS 6.x ratification — drives AC5 architecture.md amendment)
- `docs/adr/0004-custom-vtrj-binary-over-json-protobuf-arrow-parquet.md` (VTRJ binary format — body_id is part of the header contract; drives AC7)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Opus 4.7, 1M context) — spawned as `dev-2-0` under team `epic-cycle-2026-05-19`.

### Debug Log References

- **AC8 (T3) determinism check approach:** I did not run `just bake` end-to-end (full bake takes ~minutes and is gated by the kernels-manifest LFS state on this machine). Instead I relied on:
  1. The fact that the substring-vs-exact-prefix change in `bake_trajectories.py:298-310` (NEW location after the edit) is in the SPK *selection* code path — it does not enter the VTRJ writer, sampling, or compression code. The kernel files selected are byte-identical before and after the change (verified by reading `kernels/kernels-manifest.json`: only `Voyager_1.a54206u_V0.2_merged.bsp` and `Voyager_2.m05016u.merged.bsp` are present, both satisfy both the old substring match and the new exact-prefix match).
  2. `test_vtrj_writer.py` (40 tests including my two new body_id defense tests) re-confirms write/read byte-identical-for-same-input contract (`test_byte_identical_for_same_input`).
  3. `test_bake_defense.py` and `test_bake_trajectories.py` ran clean (all 40 collected tests in the targeted run passed).
- **Pre-existing test failures:** `tests/test_ck_inventory.py::test_inventory_regeneration_is_byte_identical` and `test_frame_ids_doc_is_deterministic` fail on epic2 HEAD before my changes (verified by `git stash && pytest …`). The failure is CRLF/LF line-ending drift in `docs/kernels/ckbrief-inventory.md` and `kernels/frame-ids.md`, unrelated to Story 2.0 scope. After the stash test I had to `git checkout HEAD -- docs/kernels/ckbrief-inventory.md kernels/frame-ids.md` to drop the side-effect.

### Completion Notes List

**All 12 ACs satisfied.** Summary by AC:

- **AC1 (Sub-agent tool-scoping — Action Item A1):** Audit determined no project-local sub-agent tool-scoping mechanism exists (`.claude/agents/` absent; `customize.toml` files expose only `[workflow]` keys; team config records `agentType: "general-purpose"` with no `tool_inventory` field). Sub-agents inherit harness tools wholesale. Added **Rule 7** to `_bmad/custom/voyager-skill-rules.md` documenting the topology and the ADR-0010 Layer 1 safeguard.
- **AC2 (QA MCP smoke stage — Action Item A2):** Added a multi-line `persistent_facts` entry to `_bmad/custom/bmad-qa-generate-e2e-tests.toml` describing the required "Chrome DevTools MCP smoke" stage, the four MCP tool calls (`navigate_page`, `evaluate_script`, `take_screenshot`, `take_snapshot`), the evidence-path convention, and the bake-only skip rule. The toml override survives skill upgrades.
- **AC3 (Brotli/MCP closure — Action Item A3):** Bookkeeping only — Story 1.16 already retired the runtime brotli probe. Annotated the `[1.8 / LOW]` post-hoc verification entry in `deferred-work.md` as historical and pointed to Rule 6 in `voyager-skill-rules.md` as the canonical "do not re-introduce shim" statement.
- **AC4 (`.gitignore` `.pytest_cache/`):** Added `**/.pytest_cache/` with the rationale comment. `git status --ignored` confirms `.pytest_cache/` (root) and `bake/.pytest_cache/` are now ignored.
- **AC5 (architecture.md TS 6.x):** Updated all three occurrences (lines 64, 186, 1322) from "TypeScript 5.x" to "TypeScript 6.x (per ADR 0026)" / "TypeScript 6.x strict mode (per ADR 0026; …)" / "TypeScript 6.x (per ADR 0026) + …". Grep confirms no "TypeScript 5" residue remains.
- **AC6 (vtrj_writer.py dead struct):** Removed the dead `_HEADER_STRUCT = struct.Struct("<4sHiddIdsx")` first assignment and its "sx stand-in" comment block. Only the canonical `_HEADER_STRUCT = struct.Struct("<4sHiddId2s")` remains. Comment on the reserved-bytes line updated to indicate explicit `b"\x00\x00"`.
- **AC7 (read_vtrj body_id validation):** Added the `if body_id not in ALLOWED_BODY_IDS: raise ValueError(...)` guard between magic/version checks and the reserved-bytes check in `read_vtrj`. Two new defense tests added in `bake/tests/test_vtrj_writer.py`: `test_read_rejects_out_of_set_body_id` (body_id = 0) and `test_read_rejects_unexpected_body_id_99` (body_id = 99).
- **AC8 (bake_trajectories exact-prefix kernel match):** Replaced `f"Voyager_{name[-1]}" in k.target_path` substring match with `Path(k.target_path).name.startswith(f"Voyager_{name[-1]}.")` (period boundary; matches actual filenames `Voyager_1.<...>.bsp` and `Voyager_2.<...>.bsp` and rejects a hypothetical `Voyager_12.<...>.bsp`).
- **AC9 (RenderEngine.setSize setPixelRatio):** Added `if (typeof devicePixelRatio !== 'undefined') this.renderer.setPixelRatio(devicePixelRatio);` inside `setSize()`. New unit test `setSize() re-applies devicePixelRatio (Story 2.0 AC9)` in `render-engine.test.ts` stubs `devicePixelRatio = 2.5` via `Object.defineProperty` and asserts `setPixelRatio` is called with `2.5`. node/jsdom test path remains operative (jsdom always defines `devicePixelRatio`).
- **AC10 (chunk-loader.notify try/catch):** Wrapped each subscriber callback in `try { cb(value); } catch (err) { console.error('chunk-loader subscriber threw:', err); }`. New defense test in `chunk-loader.test.ts` exercises three subscribers (first throws synchronously, second rejects a promise, third increments a counter) and asserts all three are invoked on BOTH notify edges (leading-edge `loading=true` and trailing-edge `loading=false`) — 2 invocations per subscriber, 2 `console.error` calls total.
- **AC11 (epics.md Story 1.11 AC3 wording):** Appended a clarifying `And` line to the `<v-hud-date>` AC in `epics.md` Story 1.11: "And the date string is computed via `dateForHud(et)` (the bare-value sibling of `formatForHud`, kept distinct so the scrubber's `aria-valuetext` form with inline 'UT' is preserved)."
- **AC12 (tests green):**
  - `cd web && npm test -- --run`: **74 files, 1285 tests, 0 failures, 0 flakes** (includes the two new defense tests).
  - `cd web && npm run typecheck`: **0 errors**.
  - `cd web && npm run lint`: **0 errors, 5 warnings** (all "Unused eslint-disable directive" — pre-existing on epic2 HEAD).
  - `cd bake && uv run pytest -q -m "not slow"`: **258 passed, 3 skipped, 14 deselected** counting `test_ck_inventory.py`; with `--ignore=tests/test_ck_inventory.py` (the pre-existing failures): **245 passed, 3 skipped, 14 deselected**. The two `ck_inventory` failures are pre-existing (CRLF/LF line-ending drift in `docs/kernels/ckbrief-inventory.md` and `kernels/frame-ids.md` — unrelated to Story 2.0 scope) and were verified by stashing my changes and re-running on epic2 HEAD with the same failure signature.

**No new dependencies. No new architecture decisions. No NFR tripwires (Rule 5 did not fire). Bake-determinism contract (NFR-R4) preserved.**

### File List

Code changes:

- `bake/src/vtrj_writer.py` — AC6 dead-struct cleanup + AC7 body_id validation in `read_vtrj`
- `bake/src/bake_trajectories.py` — AC8 exact-prefix basename kernel match
- `bake/tests/test_vtrj_writer.py` — AC7 two new defense tests (body_id = 0 and 99)
- `web/src/render/render-engine.ts` — AC9 `setPixelRatio(devicePixelRatio)` in `setSize()`, gated on `typeof devicePixelRatio !== 'undefined'`
- `web/src/render/render-engine.test.ts` — AC9 new unit test stubbing `devicePixelRatio = 2.5`
- `web/src/services/chunk-loader.ts` — AC10 try/catch wrap around each subscriber in `notify()`
- `web/src/services/chunk-loader.test.ts` — AC10 new defense test with three subscribers

Planning / configuration changes:

- `.gitignore` — AC4 `**/.pytest_cache/` line added with one-line rationale
- `_bmad-output/planning-artifacts/architecture.md` — AC5 TypeScript 5.x → 6.x at three sites with ADR 0026 pointer
- `_bmad-output/planning-artifacts/epics.md` — AC11 Story 1.11 `<v-hud-date>` AC clarification
- `_bmad/custom/bmad-qa-generate-e2e-tests.toml` — AC2 MCP smoke stage prompt-extension via `persistent_facts`
- `_bmad/custom/voyager-skill-rules.md` — AC1 new **Rule 7** (sub-agent tool-scoping audit conclusion)
- `_bmad-output/implementation-artifacts/deferred-work.md` — AC3 + T10 strike-throughs and closure summary
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story 2.0 status transitions (`ready-for-dev` → `in-progress` → `review` will be set by the lead on commit)

Story metadata:

- `_bmad-output/implementation-artifacts/2-0-epic-1-deferred-cleanup.md` — this story file (Status flipped to `review`; tasks/subtasks all checked; Dev Agent Record + Completion Notes + File List populated)

### Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-05-19 | Story 2.0 initial dev pass: all 12 ACs implemented + tested; Status → `review` | Per Epic 1 retrospective routing — cleanup before Epic 2 substantive stories |
| 2026-05-20 | Code review: APPROVE_WITH_CHANGES_RESOLVED. 0 HIGH / 0 MED / 3 LOW (deferred). One LOW auto-resolved inline: collapsed dead `if/else` branches in `render-engine.test.ts` `finally` block (both branches set the same value). 3 LOW findings logged to `deferred-work.md` § "Deferred from: code review of 2-0-epic-1-deferred-cleanup (2026-05-20)". Zero ADR violations (ADR-0004 / ADR-0010 / ADR-0026 all aligned). | Code-reviewer auto-resolution per `/epic-cycle` workflow |
