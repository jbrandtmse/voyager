# Voyager BMAD Skill Rules

These rules are loaded as `persistent_facts` by every BMAD skill (`bmad-create-story`, `bmad-code-review`, `bmad-dev-story`, `bmad-qa-generate-e2e-tests`) on activation. They encode project-specific discipline learned from Epic 1's retrospective (2026-05-19) and are the durable home for those decisions — they survive skill upgrades.

## Rule 1 — Integration ACs (applies to `bmad-create-story`)

Every story that introduces a service, module, or shared component **must** include at least one "Integration AC" of the form:

> *Consumer `X` reads from this service/module and produces observable effect `Y`.*

The integration AC must be testable by the consumer's automation tier (unit, integration, E2E, or Chrome DevTools MCP smoke), not by inspecting the introducing module's internal state. The point is to verify the wire-up between modules, not that the new module's state is correct.

A story that introduces a service without naming any consumers must explicitly say so in an "Integration ACs" section ("No consumers in this story; the first consumer will be Story X.Y, which inherits the integration AC."). Silence is not acceptable.

**Why:** Epic 1 shipped a ClockManager (Story 1.10) and a RenderEngine (Story 1.5) that were both individually tested and both individually correct, but were never wired together. Play/pause/speed-multiplier did nothing in a real browser. The unit tests passed; the product was broken. Integration ACs catch this class of bug at the planning stage.

## Rule 2 — Consumed-by linkage (applies to `bmad-create-story`)

Every story that introduces a service must include a `## Consumed-by` section listing the stories that will consume it (by epic-story ID and the consumer's purpose).

Every story that *consumes* a previously-introduced service must list it in its `## Consumes` section, and its Integration ACs must verify the consumer↔service wire-up — not by mocking the service, but by exercising the consumer against a real instance (Vitest integration mode, Playwright, or Chrome DevTools MCP).

**Why:** Same lesson as Rule 1. The "consumed-by" linkage forces both the producer and consumer stories to think about the integration explicitly. If a producer story names no consumers and no future consumer story declares consumption, the integration gap is visible at planning.

## Rule 3 — Manual browser smoke is a per-story exit criterion (applies to `bmad-code-review`)

A code review MUST NOT approve a story whose code touches user-facing browser surfaces (anything under `web/src/`) without evidence of a manual or MCP-driven browser smoke. Acceptable forms of evidence, listed strongest-first:

1. A Chrome DevTools MCP–driven test in the QA tier that navigates the dev server, exercises the feature, and asserts on observable DOM/render state.
2. A Playwright visual or E2E test executed in the story's CI run.
3. A manual browser smoke note in the story's Dev Agent Record citing what was exercised, in which browser, and what was observed.

Reviews must flag missing browser-smoke evidence as a HIGH finding when the story touches `web/src/`. Pure bake-side (`bake/`) stories are exempt.

**Why:** Epic 1's automated tiers (Vitest unit, Vitest integration, Playwright visual, axe-core a11y) collectively passed every story to "done" while the deployed product had four HIGH defects only a real browser session could surface. The test pyramid is necessary but not sufficient for a Three.js + Lit project.

## Rule 4 — Structured completion handshake (applies to `bmad-dev-story`, `bmad-qa-generate-e2e-tests`, `bmad-code-review`)

When invoked as a subagent under the `/epic-cycle` workflow's Agent Teams pattern, the skill MUST end by sending a structured `STATUS: completed` message to the team lead before going idle. The message must include:

- The final story / test / review status (e.g., `review`, `done`, `tests-generated`, `approved`, `changes-requested`).
- A list of files created or modified, relative to repo root.
- Any blocking concerns surfaced during the work (so the lead can decide whether to proceed to the next stage).

The skill MUST NOT exit by simply finishing its last tool call and going silent. The team lead is polling for the structured handshake; a silent exit forces the lead to issue a status-check ping (~10–12% of Epic 1 spawns required this).

If the skill is invoked outside the `/epic-cycle` context (i.e., directly by the user via the `Skill` tool), this rule does not apply — emit the standard human-facing completion summary in those cases.

**Why:** Epic 1 had 4–5 of 42 agent spawns finish their work, write all files, but exit without sending the structured completion message. Each required a manual status-check ping from the lead, breaking the otherwise-automatic pipeline cadence. Making the handshake an explicit skill-prompt obligation closes the loop.

## Rule 5 — NFR tripwire response (applies to `bmad-dev-story`, `bmad-code-review`)

If, during implementation or review, a non-functional requirement is found to be unmeasurable, mathematically impossible, internally contradictory, or otherwise un-implementable as worded, the response is **NOT** to work around it in code comments + `deferred-work.md`. The response is:

1. Halt the story implementation at the affected task.
2. File an amendment to the relevant planning artifact (`prd.md`, `architecture.md`, or `epics.md`) clarifying the NFR — preferably as part of the same change-set as the story.
3. Document the original-vs-amended wording with rationale in the story's Dev Agent Record.
4. Continue the story against the amended NFR.

Planning artifacts are the source of truth. When dev or QA discovers an interpretation tripwire, the artifact is amended in place rather than the truth being scattered across code comments and a side-file.

**Why:** Epic 1 surfaced two NFR tripwires (NFR-P6: "ClockManager mutations ≤ 100µs P99" — unmeasurable on browser wall-clock; NFR-M4: "cycle log human-readable" — conflated with lint-clean). Both were worked around with comments and deferred-work entries. A future contributor reading the PRD has no signal that those NFRs are "as-written" vs. "as-implemented-with-comment." Amending in place keeps planning honest.

## Rule 7 — Sub-agent tool inventory is harness-inherited; the lead is the safeguard (Story 2.0 AC1)

This project does **not** maintain a project-local sub-agent tool inventory. Specifically:

- `.claude/agents/` does NOT exist (and is not used) in this repo.
- The BMAD-skill `customize.toml` files under `.claude/skills/*/customize.toml` and their `_bmad/custom/*.toml` overrides expose only `[workflow]` keys (`activation_steps_prepend`, `activation_steps_append`, `persistent_facts`, `on_complete`). No `tool_inventory`, `allowed_tools`, or `mcp_servers` surface exists on the skill override.
- The team config at `~/.claude/teams/<team-name>/config.json` records `agentType: "general-purpose"` per spawned member with no `tool_inventory` field. Sub-agents inherit the harness's tool inventory wholesale.

**Implication:** The dev / QA / code-reviewer sub-agents spawned under `/epic-cycle` inherit whatever MCP namespaces are mounted on the harness running the spawn. If `mcp__chrome-devtools-mcp__*` is mounted at the harness level it is automatically available to sub-agents; if it is NOT mounted there is no project-local mechanism to add it just for sub-agents.

**Safeguard:** ADR-0010 (`docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md`) Layer 1 — **ADR-Aware Execution** — places ADR-tooled AC verifications on the **lead** (not the sub-agent) for exactly this reason. The lead's tool inventory is the reliable channel for MCP-driven evidence; sub-agent MCP propagation is best-effort and treated as defense-in-depth, not as the primary gate.

**Action if this ever changes:** if a future Claude Code release introduces project-local sub-agent tool scoping (e.g. `.claude/agents/<name>.md` with frontmatter `allowed-tools: [...]`, or a `tool_inventory` field on the BMAD-skill `customize.toml` surface), update this rule with the discovered mechanism and configure `mcp__chrome-devtools-mcp__*` into the dev / QA / code-reviewer allowed-tools surface. Until then, the lead-executed Layer 1 gate is the binding contract.

**Why:** Story 2.0 AC1 / Action Item A1 from the Epic 1 retrospective asked for sub-agent definitions to include `mcp__chrome-devtools-mcp__*`. The audit found no project-local surface to attach the tool to; documenting the topology here makes the safeguard explicit and tells future contributors where the real gate sits.

## Rule 6 — Chrome DevTools MCP is the canonical browser-smoke driver (amended Story 1.16)

When automating a browser smoke (per Rule 3) under Chrome DevTools MCP, no special initScript or shim is needed. Story 1.16 (2026-05-20) replaced the chunk-loader's reliance on `DecompressionStream('br')` (which no production browser supports) with a wasm brotli polyfill, and removed the brotli check from Story 1.8's boot-time capability probe. Chrome-for-Testing 148 — which still lacks `DecompressionStream('br')` — now loads Voyager normally.

**Historical context (do not re-introduce):** prior to Story 1.16, MCP-driven sessions required an `initScript` that stubbed `new DecompressionStream('br')` to fall back to gzip. Post-Story-1.16 smoke evidence (e.g., `1-16-smoke-evidence/`) is taken without this shim. Evidence captured before Story 1.16 (`1-5-ac5-precision-smoke-screens/`, `1-15-smoke-evidence/`) retains references to the shim for historical accuracy.

**Why this rule exists today:** to record that the shim is gone — a future contributor seeing the shim referenced in older code review notes or git history should NOT re-introduce it. The right path is to confirm `brotli-dec-wasm` is configured in `chunk-loader.ts` and that the boot probe does not check brotli (see ADR 0004 § Decompression Strategy + ADR 0010 amendment).
