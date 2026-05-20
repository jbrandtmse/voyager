# Voyager BMAD Skill Rules

These rules are loaded as `persistent_facts` by every BMAD skill (`bmad-create-story`, `bmad-code-review`, `bmad-dev-story`, `bmad-qa-generate-e2e-tests`) on activation. They encode project-specific discipline learned from epic retrospectives and are the durable home for those decisions — they survive skill upgrades.

## Rule 1 — Integration ACs (applies to `bmad-create-story`)

Every story that introduces a service, module, or shared component **must** include at least one "Integration AC" of the form:

> *Consumer `X` reads from this service/module and produces observable effect `Y`.*

The integration AC must be testable by the consumer's automation tier (unit, integration, E2E, browser-MCP smoke, API smoke, etc.), not by inspecting the introducing module's internal state. The point is to verify the wire-up between modules, not that the new module's state is correct in isolation.

A story that introduces a service without naming any consumers must explicitly say so in an "Integration ACs" section ("No consumers in this story; the first consumer will be Story X.Y, which inherits the integration AC."). Silence is not acceptable.

**Why:** A prior project's Epic 1 shipped two services that were both individually tested and both individually correct, but were never wired together. Unit tests passed; the product was broken. Integration ACs catch this class of bug at the planning stage.

## Rule 2 — Consumed-by linkage (applies to `bmad-create-story`)

Every story that introduces a service must include a `## Consumed-by` section listing the stories that will consume it (by epic-story ID and the consumer's purpose).

Every story that *consumes* a previously-introduced service must list it in its `## Consumes` section, and its Integration ACs must verify the consumer↔service wire-up — not by mocking the service, but by exercising the consumer against a real instance.

**Why:** Same lesson as Rule 1. The `Consumed-by` linkage forces both the producer and consumer stories to think about the integration explicitly. If a producer story names no consumers and no future consumer story declares consumption, the integration gap is visible at planning time.

## Rule 3 — Per-story smoke evidence is a per-story exit criterion (applies to `bmad-code-review`)

A code review MUST NOT approve a story whose code touches a user-facing surface without evidence of a per-story smoke executed in the target runtime. The form of evidence depends on the deliverable:

- **UI / browser-deployed stories** — a browser-MCP-driven test (or Playwright in CI) navigating the dev server, exercising the feature, and asserting on observable DOM/render state. A manual browser-smoke note in the Dev Agent Record citing what was exercised is acceptable when automated tooling isn't yet wired up.
- **CLI / library stories** — actual invocation of the new CLI command or library entrypoint against a real runtime, with stdout/stderr/exit-code/produced-file assertions.
- **Service / API stories** — a real HTTP request against the local server (or staging), asserting on status code, response body, and any side-effect surface.

Pure non-user-facing stories (build pipeline, internal tooling, refactors) are exempt; note the exemption explicitly in the review.

Reviews must flag missing smoke evidence as a HIGH finding when the story touches a user-facing surface.

**Why:** A prior project's automated tiers (unit + integration + visual + a11y) collectively passed every story to "done" while the deployed product had four HIGH defects only a real runtime session could surface. The test pyramid is necessary but not sufficient.

## Rule 4 — Structured completion handshake (applies to `bmad-dev-story`, `bmad-qa-generate-e2e-tests`, `bmad-code-review`, and `bmad-create-story`)

When invoked as a subagent under the `/epic-cycle` workflow's Agent Teams pattern, the skill MUST end by sending EXACTLY ONE structured message to the team lead before going idle:

```
STATUS: completed
STORY_ID: <epic.story, e.g., 2.3>
FILES_MODIFIED:
- <full path 1>
- <full path 2>
(or "(none)" if no files modified)
TESTS_ADDED:
- <full path 1>
(or "(none)")
DECISIONS:
- <one-line decision summary>
(or "(none)")
ISSUES_ENCOUNTERED:
- <one-line summary of issue and how resolved>
(or "(none)")
```

Use the literal section headers; preserve the order. After sending this message, STOP completely — do not call `TaskList`, do not look for more work, approve any shutdown request immediately.

If the skill encounters ambiguous requirements or needs user input, send EXACTLY ONE clarification message instead and STOP:

```
STATUS: clarification_needed
STORY_ID: <epic.story>
QUESTION:
<one paragraph stating the question and its context>
```

If the skill is invoked outside the `/epic-cycle` context (i.e., directly by the user via the `Skill` tool), this rule does not apply — emit a normal human-facing completion summary instead. The marker for "subagent under /epic-cycle" is the literal phrase "Single-Task Agent (Task-in-Prompt Mode)" in the spawn prompt.

**Why:** Empirically, ~10–12% of agent spawns in prior projects finished their work, wrote all files, but exited without sending the structured completion message. Each required a manual status-check ping from the lead, breaking the otherwise-automatic pipeline cadence. Making the handshake an explicit skill-prompt obligation via `on_complete` closes the loop — that field fires when the workflow reaches its terminal stage, after the main output has been delivered. Earlier attempts via `persistent_facts` did NOT close the loop (facts are informational, not behavioral — the skill body's natural ending can finish without acting on them), and `activation_steps_append` would not close it either (those steps run at setup time, before the work begins).

## Rule 5 — NFR tripwire response (applies to `bmad-dev-story`, `bmad-code-review`)

If, during implementation or review, a non-functional requirement is found to be unmeasurable, mathematically impossible, internally contradictory, or otherwise un-implementable as worded, the response is **NOT** to work around it in code comments + `deferred-work.md`. The response is:

1. Halt the story implementation at the affected task.
2. File an amendment to the relevant planning artifact (`prd.md`, `architecture.md`, or `epics.md`) clarifying the NFR — preferably as part of the same change-set as the story.
3. Document the original-vs-amended wording with rationale in the story's Dev Agent Record.
4. Continue the story against the amended NFR.

**Why:** Planning artifacts are the source of truth. When dev or QA discovers an interpretation tripwire, the artifact is amended in place rather than the truth being scattered across code comments and a side-file. A future contributor reading the PRD must not have to guess which NFRs are "as-written" vs. "as-implemented-with-comment."

Voyager-specific incident: Epic 1 surfaced two NFR tripwires (NFR-P6: "ClockManager mutations ≤ 100µs P99" — unmeasurable on browser wall-clock; NFR-M4: "cycle log human-readable" — conflated with lint-clean). Both were worked around with comments and deferred-work entries. Amending in place keeps planning honest.

## Rule 6 — ADR violations are HIGH severity (applies to `bmad-code-review`)

An AC implementation that violates an Accepted ADR — uses the wrong tool stack for the work, ships the wrong architectural pattern, contradicts a committed methodology — is a **HIGH-severity** finding because it breaks a committed decision, not an ordinary LOW deferrable.

Code review must:

1. Cross-check each AC in the story against the project's ADR registry (typically `docs/adr/`).
2. For every AC whose implementation choice is constrained by an Accepted ADR, verify the implementation matches the ADR's commitment.
3. File any mismatch as HIGH. Auto-resolve inline if possible; otherwise pause for the lead.

**Why:** A prior project's Story 1.5 AC5 (a "Phase 0 reverse-Z precision spike") was deferred to "manual run" when ADR 0010 explicitly committed Chrome DevTools MCP for that exact use case at agent-time. Neither the dev agent nor the code reviewer surfaced the ADR violation. Treating ADR violations as ordinary deferrables lets committed decisions silently rot.

## Rule 7 — Sub-agent tool inventory is harness-inherited (applies to all skills)

This project does **not** maintain a project-local sub-agent tool inventory. Sub-agents spawned under `/epic-cycle` inherit whatever MCP namespaces and tools are mounted on the harness running the lead. If a specific MCP (e.g., Chrome DevTools MCP) is mounted at the harness level it is automatically available to sub-agents; if it is NOT mounted there is no project-local mechanism to add it just for sub-agents.

Specifically for Voyager:

- `.claude/agents/` does NOT exist (and is not used) in this repo.
- The BMAD-skill `customize.toml` files under `.claude/skills/*/customize.toml` and their `_bmad/custom/*.toml` overrides expose only `[workflow]` keys (`activation_steps_prepend`, `activation_steps_append`, `persistent_facts`, `on_complete`). No `tool_inventory`, `allowed_tools`, or `mcp_servers` surface exists on the skill override.
- The team config at `~/.claude/teams/<team-name>/config.json` records `agentType: "general-purpose"` per spawned member with no `tool_inventory` field. Sub-agents inherit the harness's tool inventory wholesale.

**Implication:** ADR-tooled AC verifications (e.g., browser-MCP smokes that an Accepted ADR commits to) are placed on the **lead** (not the sub-agent) for exactly this reason. The lead's tool inventory is the reliable channel; sub-agent MCP propagation is best-effort and treated as defense-in-depth, not as the primary gate.

**Action if this ever changes:** if a future Claude Code release introduces project-local sub-agent tool scoping (e.g. `.claude/agents/<name>.md` with frontmatter `allowed-tools: [...]`, or a `tool_inventory` field on the BMAD-skill `customize.toml` surface), update this rule with the discovered mechanism and configure the relevant MCPs (notably `mcp__chrome-devtools-mcp__*`) into the dev / QA / code-reviewer allowed-tools surface. Until then, the lead-executed gate is the binding contract.

## Project-specific rules (add below as retros surface them)

## Rule 8 — Chrome DevTools MCP is the canonical browser-smoke driver (amended Story 1.16)

When automating a browser smoke (per Rule 3) under Chrome DevTools MCP, no special initScript or shim is needed. Story 1.16 (2026-05-20) replaced the chunk-loader's reliance on `DecompressionStream('br')` (which no production browser supports) with a wasm brotli polyfill, and removed the brotli check from Story 1.8's boot-time capability probe. Chrome-for-Testing 148 — which still lacks `DecompressionStream('br')` — now loads Voyager normally.

**Historical context (do not re-introduce):** prior to Story 1.16, MCP-driven sessions required an `initScript` that stubbed `new DecompressionStream('br')` to fall back to gzip. Post-Story-1.16 smoke evidence (e.g., `1-16-smoke-evidence/`) is taken without this shim. Evidence captured before Story 1.16 (`1-5-ac5-precision-smoke-screens/`, `1-15-smoke-evidence/`) retains references to the shim for historical accuracy.

**Why this rule exists today:** to record that the shim is gone — a future contributor seeing the shim referenced in older code review notes or git history should NOT re-introduce it. The right path is to confirm `brotli-dec-wasm` is configured in `chunk-loader.ts` and that the boot probe does not check brotli (see ADR 0004 § Decompression Strategy + ADR 0010 amendment).

## Rule 9 — ADR-0025 APG primitives are extracted (Story 3.0 AC4 path (a), 2026-05-20)

The Slider and Listbox primitives committed by ADR-0025 are now landed at `web/src/primitives/slider-keyboard.ts` and `web/src/primitives/listbox-keyboard.ts`. Story 3.0 AC4 closed the ADR-0025 baseline drift by choosing path (a) — extract — over path (b) — amend the ADR. Both `<v-timeline-scrubber>` and `<v-chapter-index>` now delegate their APG keyboard contracts to these primitives via `createSliderKeyboardHandler({...})` and `createListboxKeyboardHandler({...})` handler factories.

**Obligations on future stories that introduce APG-keyboard-handling components:**

- A new slider component (e.g. `<v-speed-multiplier>` per ADR-0025 line 30) MUST consume `createSliderKeyboardHandler` — no inline Home/End/Arrows logic in component code.
- A new listbox component MUST consume `createListboxKeyboardHandler`.
- A new dialog component (e.g. `<v-help-overlay>` already uses focus-trap inline; an extraction of `primitives/dialog.ts` is a Story 6.4 candidate per the deferred-work `[2.8 / LOW]` entry).
- Code review treats inline re-implementation of an extracted APG contract as a HIGH finding per Rule 6.

**Why this rule exists today:** ADR-0025's "Obligations on downstream stories" clause — "Components compose primitives via mixin or delegation — no APG keyboard logic embedded directly in component code" — was silently violated by Stories 2.2 and 2.3 (both shipped inline implementations). Story 3.0 path (a) honoured the ADR as-written rather than amending the clause to permit inline-until-second-consumer. Future drift is prevented by this rule plus the primitives' presence in the dependency graph.
