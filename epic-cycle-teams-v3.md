# Epic Development Cycle Workflow — v3

This document is a self-contained recreation kit for the `/epic-cycle` workflow. Run it after a fresh BMAD reinstall (which clears the project's `_bmad/custom/` directory) to regenerate every artifact the workflow needs.

What v3 produces:

- **5 BMAD skill customizations** under `_bmad/custom/` — the rules registry + four `.toml` files, one per BMAD skill the workflow invokes.
- **1 slash command** at `.claude/commands/epic-cycle.md` — the runtime workflow body, fully self-contained.

## Why v3 (and what changed from v2)

v2 was built on Claude Code's experimental **Agent Teams** feature: `TeamCreate` provisioned a stateful team, named teammates were spawned via `Agent({team_name, name, ...})` and addressed back via `SendMessage`, with a structured `STATUS: completed` envelope serving as the completion signal. To get teammates to actually send that envelope, v2 wired the instruction into each BMAD skill's `on_complete` hook (the right TOML field, after a long evolution that ruled out `persistent_facts` and `activation_steps_append`).

That design lost to reality. In real workflow runs, every dev/qa/cr stage in an epic typically carries `hygiene_issue=<agent>_silent_lead_reconstructed_from_file_evidence` — meaning the spawn finished its work but never delivered the envelope. The "10–12% empirical silence rate" v2 was designed to absorb climbed toward 100% on long-running stages. The lead's fallback recovery (reconstruct file list from `git status --short`, write cycle log with a hygiene marker, run the verification manually) ran on every story, defeating the whole point of having an envelope.

The diagnosis is straightforward: SendMessage delivery between named teammates is the unreliable mechanism. v2 already acknowledged that SendMessage at spawn time is unreliable enough to forbid the spawn-then-message pattern — then turned around and required SendMessage from agent back to lead at completion. Same channel, same reliability profile. The recovery path was always the real path; the envelope was decoration.

**v3 abandons Agent Teams entirely.** Each pipeline stage is a plain `Agent` tool call. The Agent tool returns the agent's final message as the tool result — that is the completion signal. No `TeamCreate`, no `SendMessage`, no shutdown handshake, no name collisions, no Task-in-Prompt block, no silence-recovery protocol. Parallelism still works because multiple `Agent` tool calls in a single assistant message run concurrently.

**v3 also retires the `on_complete` hooks in the BMAD customizations.** v2 used `on_complete` for two purposes: (a) firing the SendMessage envelope, and (b) running verification gates (NFR-tripwire check, test-discoverability check, ADR/deferred-work rules, Integration AC presence). With the envelope gone, the only remaining purpose was the verification gates — but those instructions can live just as effectively in the workflow's spawn prompt, where they're inspectable and adjustable without touching BMAD's customization layer. The TOML customizations in v3 are therefore minimal: each `.toml` loads only the project's `persistent_facts` (rule registry); no `on_complete` array. This makes the upgrade path clean — uninstall the v2 on_complete blocks, leave the persistent_facts, and the workflow's spawn prompt becomes the single source of truth for runtime agent behavior.

What gets cut entirely:

- The Agent Teams pre-flight check (no flag dependency)
- `TeamCreate` / `TeamDelete` lifecycle
- Task-in-Prompt Pattern (the prompt is just the prompt now)
- Shutdown-Before-Respawn Sequencing (no team membership = no name collisions = no shutdown handshake)
- Agent Silence Recovery (`Agent` tool returns the result message; if it errors, the lead handles a tool error, not a missing message)
- The `STATUS: completed` structured envelope (the closing-summary content now lives as markdown sections inside the agent's natural final message — same content, delivered via the same channel as any other tool result)
- The "Single-Task Agent (Task-in-Prompt Mode)" marker phrase
- BMAD `on_complete` hooks (verification gates and closing-summary instructions move to the spawn prompt)

What stays load-bearing:

- The project's `<project>-skill-rules.md` rule registry, loaded by each skill via `persistent_facts`. The rules are visible to the agent throughout the run.
- The workflow's spawn-prompt skeleton (in the slash command) explicitly restates the rules each stage must follow and instructs the agent to end its final message with closing-summary sections.
- The lead parses those sections from the Agent tool's return, falling back to `git status --short` if a section is missing — normal extraction, not a hygiene event.

---

## Pre-flight Runtime Check

v3 needs only the standard `Agent` tool. No experimental flag required.

If a project's harness exposes `Agent` as a deferred tool, load its schema via `ToolSearch` with `"select:Agent"` before first use. If `Agent` is not available at all, this workflow cannot run — surface to the user.

`TeamCreate`, `SendMessage`, and `TeamDelete` are NOT used by v3. If they happen to be loaded for unrelated reasons, ignore them.

---

## Construction overview

Once `Agent` is available, the reader (a Claude Code session executing this doc) does the following in order:

1. Pick the project's short name (e.g., `voyager`, `loanapp`, `engine`). Substitute it for every `<project>` placeholder below.
2. Create the BMAD customization files in Part 1, in order — the rules file first, then each `.toml`.
3. Create the slash command in Part 2 by writing the verbatim body to `.claude/commands/epic-cycle.md`.
4. Run the validation checks in Part 3.
5. (Optional) Delete this v3 design doc — the slash command + customizations are now standalone.

---

## Part 1: BMAD skill customizations

The `/epic-cycle` workflow has gates that depend on each invoked BMAD skill behaving a certain way: ending with a structured closing summary, enforcing integration ACs at story-creation time, treating ADR violations as HIGH severity, pausing on NFR tripwires, and so on. These customization files are what make those "shoulds" into "actually."

**Schema reminder (carried over from v2).** BMAD's `[workflow]` customization surface has four fields:

- `activation_steps_prepend` / `activation_steps_append` — run at setup time, before main work.
- `persistent_facts` — static context, loaded throughout. Informational, not behavioral. Right place for rule definitions; visible to the agent the whole way through the run.
- `on_complete` — fires when the workflow reaches its terminal stage, after the main output has been delivered.

v3 uses only `persistent_facts` — and only to load the project's rule registry. The verification gates and closing-summary instructions that v2 put in `on_complete` move to the workflow's spawn prompt instead (see "Agent Invocation Pattern" in Part 2). This keeps all runtime agent behavior in one inspectable place — the slash command — rather than split between the slash command and four `.toml` files. The `.toml` files in v3 are therefore minimal: each loads the rules file and nothing else.

### File 1 — `_bmad/custom/<project>-skill-rules.md`

The cross-cutting rule registry. Loaded by every skill via `persistent_facts`.

```markdown
# <Project> BMAD Skill Rules

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

## Rule 4 — Closing summary in the final message (applies to `bmad-dev-story`, `bmad-qa-generate-e2e-tests`, `bmad-code-review`, `bmad-create-story`)

When invoked under the `/epic-cycle` workflow, the skill MUST end its final assistant message with the following markdown sections, in this order. The lead reads the `Agent` tool's return value and parses these sections for the next stage's context handoff.

```markdown
## Files Modified
- <full path from repo root>
- <full path from repo root>
(or "(none)")

## Tests Added
- <full path from repo root>
(or "(none)")

## Decisions
- <one-line summary of any non-obvious choice>
(or "(none)")

## Issues Encountered
- <one-line summary of an issue and how it was resolved or surfaced>
(or "(none)")
```

The closing summary is part of the agent's normal output — not a separate envelope, not delivered via any side channel. After writing it, the agent's run terminates naturally; the `Agent` tool returns the final message to the lead. If the agent forgets the sections, the lead reconstructs the file list from `git status --short` against the story's `Files to Modify` table; this is normal extraction, not a hygiene event.

If the skill cannot make confident progress for ANY reason — ambiguous ACs, a missing prerequisite, a choice between reasonable options where the user's preference matters, an environment or dependency failure that blocks the work, or any case where proceeding risks breaking a stated constraint (security, performance, correctness, ADR commitment) — the agent halts BEFORE the closing summary and ends its final message with a `## Clarification Needed` section instead. The section states the question, what was tried, and what specifically is blocking, in one paragraph. The lead surfaces it to the user, then re-spawns the agent with the clarification baked into the next spawn's prompt. Do not guess; do not soldier on.

If the skill is invoked outside the `/epic-cycle` context (i.e., directly by the user via the `Skill` tool), this rule does not apply — emit a normal human-facing completion summary instead.

**Enforcement note (v3):** the closing-summary instruction is re-stated in every `/epic-cycle` spawn prompt — that's where it's actually enforced at runtime. This rule is the canonical definition of the expected format; the workflow's spawn-prompt skeleton points at it. There is no BMAD `on_complete` hook driving this anymore.

**Why:** v2 used Agent Teams + `SendMessage` to deliver a `STATUS: completed` envelope, with a BMAD `on_complete` hook telling the agent to send that envelope and stop. In practice the SendMessage channel was unreliable enough that the lead's fallback recovery ran on essentially every spawn — defeating the envelope's purpose. v3 uses the `Agent` tool's natural return value as the completion signal; the closing-summary sections live inside that return value, with the same content as the v2 envelope but delivered through the channel that already works.

## Rule 5 — NFR tripwire response (applies to `bmad-dev-story`, `bmad-code-review`)

If, during implementation or review, a non-functional requirement is found to be unmeasurable, mathematically impossible, internally contradictory, or otherwise un-implementable as worded, the response is **NOT** to work around it in code comments + `deferred-work.md`. The response is:

1. Halt the story implementation at the affected task.
2. File an amendment to the relevant planning artifact (`prd.md`, `architecture.md`, or `epics.md`) clarifying the NFR — preferably as part of the same change-set as the story.
3. Document the original-vs-amended wording with rationale in the story's Dev Agent Record.
4. Continue the story against the amended NFR.

**Why:** Planning artifacts are the source of truth. When dev or QA discovers an interpretation tripwire, the artifact is amended in place rather than the truth being scattered across code comments and a side-file. A future contributor reading the PRD must not have to guess which NFRs are "as-written" vs. "as-implemented-with-comment."

## Rule 6 — ADR violations are HIGH severity (applies to `bmad-code-review`)

An AC implementation that violates an Accepted ADR — uses the wrong tool stack for the work, ships the wrong architectural pattern, contradicts a committed methodology — is a **HIGH-severity** finding because it breaks a committed decision, not an ordinary LOW deferrable.

Code review must:

1. Cross-check each AC in the story against the project's ADR registry (typically `docs/adr/`).
2. For every AC whose implementation choice is constrained by an Accepted ADR, verify the implementation matches the ADR's commitment.
3. File any mismatch as HIGH. Auto-resolve inline if possible; otherwise pause for the lead.

**Why:** A prior project's Story 1.5 AC5 was deferred to "manual run" when ADR 0010 explicitly committed Chrome DevTools MCP for that exact use case at agent-time. Treating ADR violations as ordinary deferrables lets committed decisions silently rot.

## Rule 7 — Sub-agent tool inventory is harness-inherited (applies to all skills)

This project does **not** maintain a project-local sub-agent tool inventory. Sub-agents spawned by `/epic-cycle` inherit whatever MCP namespaces and tools are mounted on the harness running the lead. If a specific MCP (e.g., Chrome DevTools MCP) is mounted at the harness level it is automatically available to sub-agents; if it is NOT mounted there is no project-local mechanism to add it just for sub-agents.

**Implication:** ADR-tooled AC verifications (e.g., browser-MCP smokes that an Accepted ADR commits to) are placed on the **lead** (not the sub-agent) for exactly this reason. The lead's tool inventory is the reliable channel; sub-agent MCP propagation is best-effort and treated as defense-in-depth, not as the primary gate.

**Action if this ever changes:** if a future Claude Code release introduces project-local sub-agent tool scoping, update this rule with the discovered mechanism and configure the relevant MCPs into the dev / QA / code-reviewer allowed-tools surface. Until then, the lead-executed gate is the binding contract.

## Project-specific rules (add below as retros surface them)

> Add additional rules here as your project's retrospectives identify durable patterns. Number them sequentially after Rule 7. Each rule should state what it applies to (which skill or skills), describe the obligation, and explain *why* with a concrete prior incident.
```

All four `.toml` files have the same minimal shape: they load the project's rule registry via `persistent_facts` and nothing else. No `on_complete` hooks. Verification gates and closing-summary instructions are owned by the workflow's spawn-prompt skeleton (see Part 2 § "Agent Invocation Pattern"), not by these `.toml` files.

### File 2 — `_bmad/custom/bmad-create-story.toml`

```toml
# Project override for bmad-create-story.
# Loads <project>-skill-rules.md so the rule registry is visible to the
# agent throughout the skill's run. No on_complete hook: the /epic-cycle
# workflow's spawn-prompt skeleton restates the relevant rules and the
# closing-summary requirement at runtime — that's the single source of
# truth for agent behavior under this workflow.

[workflow]

persistent_facts = [
  "file:{project-root}/_bmad/custom/<project>-skill-rules.md",
]
```

### File 3 — `_bmad/custom/bmad-dev-story.toml`

```toml
# Project override for bmad-dev-story.
# Loads <project>-skill-rules.md so Rule 5 (NFR tripwire response) and the
# other shared rules are visible mid-flow. No on_complete hook: the
# /epic-cycle workflow's spawn-prompt skeleton enforces the verification
# gates and closing-summary requirement.

[workflow]

persistent_facts = [
  "file:{project-root}/_bmad/custom/<project>-skill-rules.md",
]
```

### File 4 — `_bmad/custom/bmad-qa-generate-e2e-tests.toml`

```toml
# Project override for bmad-qa-generate-e2e-tests.
# Loads <project>-skill-rules.md as informational context. No on_complete
# hook: the /epic-cycle workflow's spawn-prompt skeleton handles the
# test-discoverability check and closing-summary requirement.

[workflow]

persistent_facts = [
  "file:{project-root}/_bmad/custom/<project>-skill-rules.md",
]
```

### File 5 — `_bmad/custom/bmad-code-review.toml`

```toml
# Project override for bmad-code-review.
# Loads <project>-skill-rules.md so Rule 1 (Integration ACs), Rule 3
# (smoke evidence), Rule 5 (NFR tripwires), and Rule 6 (ADR violations)
# are visible to the reviewer throughout. No on_complete hook: the
# /epic-cycle workflow's spawn-prompt skeleton restates these checks
# and the closing-summary requirement at runtime.

[workflow]

persistent_facts = [
  "file:{project-root}/_bmad/custom/<project>-skill-rules.md",
]
```

### Upgrading from v2

If the project currently has v2 `.toml` files with `on_complete = [...]` arrays, the upgrade is straightforward: delete the `on_complete` block from each `.toml` and leave `persistent_facts` in place. No other change to BMAD customization is needed. The `<project>-skill-rules.md` rule registry stays where it is.

```text
# v2 -> v3 upgrade (per .toml file)
[workflow]
persistent_facts = [...]   # KEEP this
on_complete = [...]        # DELETE this block entirely
```

---

## Part 2: Slash command — `.claude/commands/epic-cycle.md`

Write everything between the `BEGIN .claude/commands/epic-cycle.md` and `END .claude/commands/epic-cycle.md` markers below to that file path, verbatim, including the frontmatter. **Overwrite any existing file at that path** — the BMAD reinstall only clears `_bmad/custom/`, so the previous version of the slash command will still be there and must be replaced.

```text
=== BEGIN .claude/commands/epic-cycle.md ===
```

---
description: Run the BMAD Method epic development cycle for one or more epics
---

You are executing the BMAD Method development implementation cycle for one or more epics. Stories run sequentially by default; independent stories within the same epic may be processed as a parallel batch — see "Smart Parallelism" below.

**Epic range:** $ARGUMENTS (e.g., `1-3` for Epics 1 through 3, `2` for a single epic). If empty, prompt the user for the range before proceeding.

## Pre-flight Runtime Check

This workflow uses the standard `Agent` tool to spawn pipeline-stage subagents and the `Skill` tool for lead-side skill invocations. No experimental flag is required.

If `Agent` is a deferred tool in this harness, load its schema via `ToolSearch` with `"select:Agent"` before first use. If `Agent` is unavailable entirely, halt and surface to the user.

`TeamCreate`, `SendMessage`, and `TeamDelete` are NOT used by this workflow.

## Task Sequence

**Per Epic (setup, executed once per epic before any stories):**
1. **Lead** executes `/bmad-sprint-planning` directly (ensures `sprint-status.yaml` is current).
2. If a previous epic's retrospective or `deferred-work.md` has unresolved items, **Lead** reviews them, triages, and creates Story X.0 via `/bmad-create-story` (see "Retrospective Review & Story X.0 Creation" below).

**Per Story (executed once per story in the epic):**
1. **Lead** executes `/bmad-create-story` directly (no agent — prevents race-ahead).
2. Agent: `/bmad-dev-story`.
3. **Lead** executes any ADR-tooled AC verifications (see ADR-Aware Execution).
4. Agent: `/bmad-qa-generate-e2e-tests`.
5. Agent: `/bmad-code-review`.
6. **Lead** performs per-story smoke (see Per-Story Smoke).
7. **Lead** commits and pushes to git.

**End of Epic (executed once per epic after all stories):**
1. **Lead** pauses and asks user: "Would you like to run a retrospective?" If yes, execute `/bmad-retrospective` **in interactive mode** — the skill's elicitation must reach the user.

## Execution Guidelines

Each pipeline-stage task is delegated via the `Agent` tool. The lead invokes lead-side skills (sprint planning, story creation, retrospective, code review during silent-extraction fallback) directly via the `Skill` tool.

Automatically resolve all HIGH and MED severity issues found during code review using your best judgment and BMAD guidance.

Stories are documented/updated consistently with each Skill's instructions.

The BMAD method skills (`/bmad-create-story`, `/bmad-dev-story`, `/bmad-qa-generate-e2e-tests`, `/bmad-code-review`) must be used. Don't skip steps. **`/bmad-retrospective` is the one skill that MUST be run in interactive mode** — its elicitation must reach the user.

## Permission Mode (Critical)

**All Agent tool calls must include `mode: "bypassPermissions"`** — YOLO mode. Without it the spawned subagent prompts for every file edit and bash command and the pipeline stalls.

**`/bmad-retrospective` is the one step whose elicitation must reach the user.** When the **lead** invokes the skill directly via the `Skill` tool (not via a spawned subagent), the skill's `AskUserQuestion` calls route to the user. `bypassPermissions` does NOT auto-answer `AskUserQuestion` — that tool always elicits the human. Spawned subagents cannot reliably surface their elicitation, so this skill is lead-only.

## Skill Tool Invocation (Critical)

All BMAD skills must be invoked via the **`Skill` tool**, not interpreted inline. Agent spawn prompts must explicitly state: "use the `Skill` tool to invoke /bmad-dev-story" (or the relevant skill). Without this directive, agents may try to execute skill logic themselves.

## Agent Invocation Pattern (Required)

Each pipeline-stage subagent is a single `Agent` tool call. The `Agent` tool returns the agent's final assistant message as its result — that return value is the completion signal. No separate envelope, no SendMessage, no team membership, no shutdown handshake.

For each pipeline stage, the lead:

1. **Spawns** the subagent via `Agent` with:
   - `subagent_type: "general-purpose"` (the default works fine; pick a specialized type only if the project has one configured)
   - `mode: "bypassPermissions"`
   - `description: <3-5 word task description>`
   - `prompt: <full task embedded in the spawn prompt — see Spawn Prompt Skeleton below>`
2. **Reads** the returned message for the closing-summary sections (`## Files Modified`, `## Tests Added`, `## Decisions`, `## Issues Encountered`).
3. **Falls back** to `git status --short` filtered against the story's `Files to Modify` table if the closing sections are missing or incomplete. This is normal extraction, not a hygiene event.
4. **Records** the stage in the cycle log (see Completion Logging).
5. **Proceeds** to the next stage. There is no shutdown step.

### Spawn Prompt Skeleton

Because v3 has no BMAD `on_complete` hooks, the spawn prompt itself is the single source of truth for what the agent must do. Every Agent spawn prompt must include these elements, in this order:

1. The literal phrase `**Epic Cycle Stage: <stage-name> for Story <id>**` (e.g., "Epic Cycle Stage: dev for Story 3.3"). This is a marker so the agent (and a human reading the transcript later) can tell this run is under `/epic-cycle` rather than a direct user invocation.
2. The story file path (captured by the lead at story creation).
3. The list of files modified by upstream stages (for QA: dev's `## Files Modified`; for code review: dev's + QA's combined list).
4. The project's ADR registry path (typically `docs/adr/`) as factual context.
5. The directive: `Use the Skill tool to invoke /<bmad-skill-name>.`
6. The stage-specific verification rules the agent must follow mid-flow and confirm before closing (see "Stage-specific rule blocks" below).
7. The closing-summary directive — the agent must end its final message with the markdown sections per Rule 4 in the project skill rules. Quote the section names inline so the agent has them at hand.
8. Skill-specific context (story-only for dev; story + file list for QA; story + dev files + QA files for code review).

### Stage-specific rule blocks (copy into spawn prompts)

Each stage's spawn prompt includes the rule block from the matching subsection below. These blocks replace what v2's BMAD `on_complete` hooks were doing — same content, delivered as part of the spawn prompt instead.

**Dev spawn — append this block:**

```text
Rules for this stage (from <project>-skill-rules.md):

- Rule 5 (NFR tripwire response): if any task encounters an NFR that is
  unmeasurable, mathematically impossible, or internally contradictory, halt
  at that task, file an amendment to the relevant planning artifact (prd.md /
  architecture.md / epics.md), document the original-vs-amended wording in the
  Dev Agent Record, then continue against the amended NFR. Do NOT work around
  with code comments + deferred-work.md.
- Rule 6 (ADRs): consult the ADR registry above for any architectural or
  methodology decisions referenced in this story's ACs and Dev Notes. Match
  the implementation to the ADR's commitments.

End your final assistant message with the following markdown sections, in
this order (Rule 4):

## Files Modified
- <full path from repo root>
(or "(none)")

## Decisions
- <one-line summary of non-obvious choice>
(or "(none)")

## Issues Encountered
- <one-line summary of issue surfaced or resolved>
(or "(none)")

If you cannot make confident progress for ANY reason — ambiguous ACs,
a missing prerequisite (story references data/code/context that isn't
present), a choice between reasonable options where the user's preference
matters, an environment or dependency failure that blocks the work, OR any
case where proceeding risks breaking a stated constraint (security,
performance, correctness, ADR commitment) — STOP and end your final
message with a "## Clarification Needed" section instead of the closing
summary. State the question, what you tried, and what specifically is
blocking you, in one paragraph. Do not guess; do not soldier on.
```

**QA spawn — append this block:**

```text
Rules for this stage (from <project>-skill-rules.md):

- Test discoverability: the test files you generate MUST be discoverable
  by the project's default test suite. Confirm they (a) follow the
  project's test-file naming convention, (b) are NOT excluded by an
  ignore file, and (c) are NOT tagged in a way that opts them out of the
  default run (slow / integration / @skip markers, etc.). New tests
  that exist on disk but never run are not progress.

End your final assistant message with the following markdown sections, in
this order (Rule 4):

## Tests Added
- <full path from repo root>
(or "(none)")

## Decisions
- <one-line summary of non-obvious test-design choice>
(or "(none)")

## Issues Encountered
- <one-line summary of issue surfaced or resolved>
(or "(none)")

If you cannot make confident progress for ANY reason — ambiguous ACs,
a missing prerequisite, a choice between reasonable options where the
user's preference matters, an environment or dependency failure, OR any
case where proceeding risks breaking a stated constraint (security,
performance, correctness, ADR commitment) — STOP and end your final
message with a "## Clarification Needed" section instead of the closing
summary. State the question, what you tried, and what is blocking, in
one paragraph. Do not guess; do not soldier on.
```

**Code-review spawn — append this block:**

```text
Rules for this stage (from <project>-skill-rules.md):

- Rule 3 (per-story smoke evidence): if this story touches a user-facing
  surface and you approve it without evidence of a smoke in the target
  runtime, that is a HIGH finding. File it.
- Rule 5 (NFR tripwire response): if the implementation worked around an
  unmeasurable NFR with code comments + deferred-work.md instead of amending
  the planning artifact, that is a HIGH finding. File it.
- Rule 6 (ADR violations are HIGH): for each AC whose implementation choice
  is constrained by an Accepted ADR, verify the implementation matches the
  ADR's commitment. Mismatch = HIGH severity, NOT a LOW deferrable.
- Rule 1 (Integration ACs): if this is a service-introducing story and no
  Integration AC is present in the story file's ACs, that is a HIGH finding.

All deferred items (any item not auto-resolved) MUST be added to
_bmad-output/implementation-artifacts/deferred-work.md with the originating
story ID, severity, issue summary, deferral rationale, and suggested
resolution. Story file alone is insufficient — centralized tracking is
what makes deferred items visible at the next epic's Story X.0 triage.

Auto-resolve HIGH and MED findings inline where reasonable; document the
fix in the story file's Review Findings section.

End your final assistant message with the following markdown sections, in
this order (Rule 4):

## Decisions
- resolved/deferred/dismissed counts + any HIGH fix names
(or "(none)")

## Issues Encountered
- <one-line summary of anything unusual (NFR tripwire, ADR violation, etc.)>
(or "(none)")

If you cannot make confident progress for ANY reason — ambiguous ACs,
a missing prerequisite, a choice between reasonable options where the
user's preference matters, an environment or dependency failure, OR any
case where proceeding risks breaking a stated constraint (security,
performance, correctness, ADR commitment) — STOP and end your final
message with a "## Clarification Needed" section instead of the closing
summary. State the question, what you tried, and what is blocking, in
one paragraph. Do not guess; do not soldier on.
```

**Story-creation note:** `/bmad-create-story` is lead-invoked (not via Agent), so it does not need a spawn prompt. The lead validates Integration AC presence inline after the skill returns (see "Lead Creates Story Files" below).

### Example dev spawn prompt (full)

```text
**Epic Cycle Stage: dev for Story 3.3**

Story file: _bmad-output/implementation-artifacts/3-3-articulated-spacecraft-glb-with-scan-platform-node.md
Project ADR registry: docs/adr/

Use the Skill tool to invoke /bmad-dev-story against the story file above.

Rules for this stage (from <project>-skill-rules.md):

- Rule 5 (NFR tripwire response): ...
- Rule 6 (ADRs): ...

End your final assistant message with the following markdown sections...
[remainder of dev rule block]
```

### Clarification protocol

If the agent encounters ambiguous requirements, the spawn prompt above directs it to end its final message with a `## Clarification Needed` section instead of the closing summary. The lead reads that section, surfaces the question to the user, then re-spawns the agent with the clarification appended to the story file or prompt context.

A clarification-needed return is NOT logged as `<stage>_complete` — log it as `<stage>_clarification_requested` with the question hash or a short summary, and log `<stage>_complete` only after the re-spawn succeeds.

### Pipeline Flow

```
Lead resolves project ADR registry path (typically docs/adr/) — persisted for every spawn prompt and per-story Layer-1 gate

For each epic in range:
  Lead executes /bmad-sprint-planning via Skill tool; logs sprint_planning_complete
  If Epic N-1 retrospective exists OR deferred-work.md has unresolved items:
    Lead reads both sources, triages, creates Story X.0 via /bmad-create-story; logs retro_review_complete
  Else:
    Lead logs retro_review_skipped reason=no_predecessor_no_deferred_work

  For each story (or batch — see Smart Parallelism) including X.0:
    Lead executes /bmad-create-story directly (pipeline gate, including Integration AC validation)
    Lead captures story file path
    Lead records spawn_at=<UTC> and model=<id> at the moment of each Agent call

    Lead invokes Agent for /bmad-dev-story → reads return for ## Files Modified → logs dev_complete
    Lead executes ADR-tooled AC verifications (lead-side, sequential per AC); logs adr_verifications_complete
    Lead invokes Agent for /bmad-qa-generate-e2e-tests → reads return for ## Tests Added → logs qa_complete
    Lead invokes Agent for /bmad-code-review → reads return → logs cr_complete
    Lead performs per-story smoke (lead-side); logs smoke_complete
    Lead commits + pushes (submodules first if applicable)
    Lead logs committed; next story or next batch

  Lead pauses: "Would you like to run a retrospective?" → if yes, execute /bmad-retrospective via Skill tool
  Lead logs epic complete; next epic
```

### Smart Parallelism (Opt-In Per Batch)

When two or more stories within the same epic touch **disjoint files** and have **all prerequisites already committed**, the lead may run them as a **parallel batch** to reduce wall-clock time. Parallelism is opt-in per batch — when in doubt, run sequentially.

**Mechanism in v3:** multiple `Agent` tool calls in a single assistant message run concurrently. To dispatch a parallel batch, the lead emits one assistant message containing N `Agent` calls (one per story at the current stage) and waits for the tool-results message that resolves all of them together.

**What stays sequential (no exceptions):**

- Story-file creation (`/bmad-create-story` runs in the lead, one at a time).
- Commits and pushes (one story at a time; no two git ops interleave).
- Sprint planning, retrospective review, Story X.0 creation, per-epic retrospective.
- ADR-tooled AC verifications.
- Per-story smoke.

**What runs in parallel:** for a batch of N independent stories, the lead dispatches N independent (dev → qa → code-review) pipelines concurrently. Each chain is internally sequential — only the chains themselves run alongside one another.

**Independence test (all three must hold):**

1. **Disjoint files** — no two stories modify the same file. Determined by reading story specs' ACs and Previous Story Intelligence; uncertainty disqualifies.
2. **Same epic** — parallelism doesn't cross epic boundaries.
3. **All prerequisites already committed** — every story a batch member references as a prerequisite must already be at `committed` stage in the cycle log.

If any fail, run sequentially.

**Batch flow:**

```
Lead identifies parallel batch [S_a, S_b, S_c] meeting all three criteria
Lead executes /bmad-create-story for S_a, then S_b, then S_c (sequentially — pipeline gate stays)
Lead dispatches three concurrent Agent calls for dev-stage (single assistant message, three tool uses)
Lead waits for all three tool results, parses ## Files Modified from each return
Lead executes ADR-tooled verifications for S_a then S_b then S_c sequentially
Lead dispatches three concurrent Agent calls for qa-stage
Lead waits for all three returns, parses ## Tests Added
Lead dispatches three concurrent Agent calls for code-review stage
Lead waits for all three returns
Lead performs per-story smoke for S_a then S_b then S_c sequentially
Lead commits + pushes S_a, S_b, S_c in story order (sequentially)
Lead logs all three completions; next story or next batch
```

The **batch barrier** — the lead waits for all N agents of the same stage before moving to the next stage — is automatic in v3 because all N `Agent` tool uses in one message resolve together as a single tool-results message.

**Conservative default:** if you cannot quickly and confidently identify a parallel batch, default to sequential. Parallelism is an optimization, not a requirement.

**Resume policy for interrupted batches:** on restart, inspect the cycle log and `sprint-status.yaml`:

1. For each story in the batch, find the latest completed stage from the cycle log.
2. The earliest incomplete stage across the batch is the resume point.
3. Re-spawn ONLY the agents needed for stories that haven't yet reached the resume stage.
4. If resume state is ambiguous, fall back to sequential resume — process remaining stories one at a time until the next natural batch boundary.

Sequential resume is always safe. When in doubt, resume sequentially.

**Write-ahead rule:** the lead must write the cycle log entry for a completed stage **before** taking the next action that depends on that completion. If a crash happens after an agent returns but before the log is written, on resume the lead re-spawns the agent for that stage. This is fine for dev/qa stages (idempotent) but **NOT acceptable for the commit stage** (would produce a duplicate commit). For `committed`: write the log entry immediately after `git push` returns success. If crashed between push success and log write, on resume inspect `git log --oneline` against expected story files; if a matching commit exists, write the missing log entry and proceed — do NOT re-run the commit.

### Per-Story Smoke (Critical Gate)

After a story's code review completes (and any HIGH/MED findings are resolved) and before the lead commits, the lead must perform a **per-story smoke** — a direct exercise of the story's deliverable in its target runtime. **Mandatory**; only the *method* varies by project type. The smoke is performed by the **lead**, not by a spawned agent, because the lead reliably has access to project runtime tooling (MCP servers, dev server, CLI, deployment environment) while subagents may not.

**Method selection — match the deliverable's runtime:**

- **UI / browser-deployed projects** — Drive the dev server (or a deployed build) via a browser-automation MCP. Navigate to the affected surface, exercise the feature, assert on observable DOM / render state / console output. For graphics projects: screenshots verifying actual visual change frame-over-frame.
- **CLI / library projects** — Invoke the CLI command or call the public test method against a real runtime. Assert on stdout / stderr / return code / produced files.
- **Service / API projects** — Issue a real HTTP request against the local server (or staging) and assert on status code + response body + side-effect surface.
- **Other** — Whatever exercise mirrors how the deliverable will be used in production. Minimum bar: "the lead actually invoked the new code path against a real runtime, and observed the expected outcome via an out-of-band channel."

The smoke is NOT a substitute for automated test tiers; it's the final check that the wired-up system, end to end, produces the user-observable outcome the story promises.

**Mechanics:**

1. After `cr_complete` (with HIGH/MED resolved), determine the smoke method from the story's File List + ACs.
2. Execute the smoke directly, capturing evidence (screenshots, stdout, response body).
3. If the smoke fails, do NOT commit. Either (a) surface to the user for guidance, or (b) re-spawn the dev agent for a follow-up pass to fix and re-smoke. Failed smoke is a HIGH-severity finding that must clear before commit — never deferrable.
4. On success, append a cycle-log entry: `<UTC> TAB Story <id> TAB smoke_complete TAB method=<browser|cli|api|other> result=pass iterations=<N> defects_caught=<N> evidence=<path-or-summary> model=<lead-model>`. The `iterations` value is 1 for a smoke that passed on the first run; bump for each follow-up dev pass triggered by smoke failure. The `defects_caught` value is the count of bugs the smoke surfaced that the prior automated tiers passed — this is the load-bearing telemetry for the "test pyramid is necessary but not sufficient" lesson.
5. Proceed to commit.

Single-threaded across a parallel batch — smoke each story in story order.

### Retrospective Review & Story X.0 Creation (Critical Gate)

After sprint planning and before building the story list, review the previous epic's retrospective and create a cleanup story. **Mandatory** — it closes the feedback loop between retrospectives and sprint planning.

1. **Calculate previous epic number** — if processing Epic N, look for Epic N-1's retrospective.
2. **Search for the retrospective file** — convention: `_bmad-output/implementation-artifacts/epic-{N-1}-retro-*.md`. Verify against your project's `/bmad-retrospective` skill's output path; if multiple matches exist, select latest by mtime, tie-break by lexicographic filename. Log which file was selected.
3. **If a retrospective exists**, extract: all action items (with status: completed / in-progress / not addressed), all deferred review findings, preparation tasks for the current epic.
4. **Also read `_bmad-output/implementation-artifacts/deferred-work.md`** (if it exists) for centralized deferred items.
5. **Triage every item** into: include in Story X.0; defer with rationale; drop.
6. **Create Story X.0 in two steps** (the `Skill` tool's `args` parameter is a single string and cannot carry a multi-line triage body):
   - **Step 6a:** Invoke `/bmad-create-story` via `Skill` with `args` = brief title, e.g., `"Story {N}.0: Epic {N-1} Deferred Cleanup"`. Capture the resulting story file path.
   - **Step 6b:** Append the full triage table to the created story file via `Edit` or `Write`. Format: one row per item with columns `Item | Source (retro or deferred-work.md) | Triage Decision`. Include a header noting which Epic N-1 the triage covers + the date.
7. **Skip Story X.0 ONLY if both sources are empty.** If no previous retro AND no deferred-work entries: log skip, proceed. If retro is missing but deferred-work has items, do NOT skip — still execute steps 5–6 from the deferred-work source.
8. Log the retrospective review and Story X.0 creation in the cycle log.

### Sprint Planning Per Epic (Critical Gate)

Before processing any stories for an epic:

1. Execute `/bmad-sprint-planning` directly via the `Skill` tool (NOT via an agent).
2. This ensures `sprint-status.yaml` is current, all stories are tracked, and status mismatches are caught.
3. If sprint planning surfaces a blocking issue (story listed in `epics.md` missing from `sprint-status.yaml` or vice versa; status mismatch between sources; schema-validation error; or any explicit inconsistency flagged by the skill), pause and inform the user before proceeding.
4. Log sprint planning completion.

### Retrospective Per Epic (User Decision Point)

After all stories in an epic complete:

1. Announce epic completion and ask: "Epic X is complete. Would you like to run a retrospective before moving to the next epic? (yes/no)"
2. **Wait for the user's response.**
3. If **yes**: Execute `/bmad-retrospective` directly via the `Skill` tool, **in interactive mode**.
4. If **no**: Log that the retrospective was skipped. Continue.

**Elicitation must reach the user.** `AskUserQuestion` always elicits the human regardless of `bypassPermissions`. The **lead** must execute the skill — do NOT spawn an agent for it.

### Lead Creates Story Files (Critical Gate)

The lead executes `/bmad-create-story` directly via the `Skill` tool — NOT via an agent. This is a deliberate pipeline gate that prevents agents from racing ahead. **Capture the story file path** from the skill output to pass to the developer agent.

**Integration AC validation (lead-side, also a gate).** Before spawning the dev agent, read the story file's ACs and ask: does this story introduce a service, module, or component that later stories will consume? Indicators: a new file under `services/` or `lib/`; a new exported class / factory / module; a `## Consumed-by` field naming downstream stories; an AC describing a public surface other stories will call against.

If yes — the story is **service-introducing** — it MUST contain at least one **Integration AC** of the form "consumer X reads from this service and produces observable effect Y." If absent, pause for the user:

> "Story <id> introduces <service-name>. No Integration AC found. Re-run `/bmad-create-story` to populate `## Integration ACs`, OR proceed without (with the consequence that producer-consumer wire-up defects can ship green)?"

If NOT service-introducing (pure refactor, doc-only, internal cleanup, defect-fix), this check finds no work; proceed.

The skill customization for `/bmad-create-story` enforces Rule 1 in `on_complete`. This workflow gate is defense-in-depth.

### Context Handoff Between Stages (Critical)

The **story file path** is the canonical context anchor, passed forward to every downstream agent. File lists flow through the closing-summary sections in each agent's return value.

1. **Story creation → Developer**: lead passes the story file path to the developer.
2. **Developer → QA**: lead reads `## Files Modified` from dev's return and passes both the story file path AND the file list to QA.
3. **QA → Code reviewer**: lead reads `## Tests Added` from QA's return and passes story file path + dev's files + QA's tests to the code reviewer.
4. **Code reviewer → Commit**: lead uses the union of file lists from dev + QA to stage files for commit.

If a return value is missing the closing sections, fall back to `git status --short` filtered against the story's `Files to Modify` table. Do not block waiting for the agent.

### ADR-Aware Execution (Required)

Projects with an Accepted-Decisions registry (typically `docs/adr/`) commit to specific tooling, methodology, and architectural patterns. An AC satisfied by the wrong tool stack is equivalent to a HIGH-severity defect — it violates an Accepted ADR.

**Layer 1 — Lead-executed ADR-tooling gate (between `dev_complete` and `qa_spawn`).**

After dev returns and before QA is spawned, the lead inspects the story's ACs for any that map to ADR-committed agent-time tooling (visual / precision verification, performance profiling, audits, etc.). For each matched AC, the lead drives the verification using its own tool inventory — typically the project's MCP servers.

This gate exists because **MCP tool inventories may not propagate reliably to spawned subagents**. The lead always has the MCP servers at the session level. Relocating ADR-mandated verification to the lead guarantees access without depending on subagent inheritance.

**Mechanics:**

1. Lead reads the story file (path captured at `story_created`).
2. For each AC, consult the project's ADR registry. If any Accepted ADR commits to a specific tool stack for the work the AC describes, the AC is "ADR-tooled."
3. Lead drives each ADR-tooled AC verification using the relevant MCP / tool, recording pass/fail + evidence paths.
4. Lead appends one cycle-log entry per story: `<UTC> TAB Story <id> TAB adr_verifications_complete TAB <metadata>` where metadata is whitespace-separated `key=value` pairs covering each verified AC.
5. On failure, surface to the user before spawning QA (the QA stage assumes the implementation is functionally correct).
6. Pass verification results (pass/fail + evidence pointers) to the code reviewer's spawn-prompt context.
7. If no ADR-tooled ACs exist, emit a single `adr_verifications_complete result=none_required` entry and proceed.

**Layer 2 — Project ADR registry path in every spawn prompt.**

The lead resolves the ADR registry path once at workflow start and includes it in every agent spawn prompt as factual context (e.g., `Project ADR registry: docs/adr/`). Agents must consult ADRs for architectural and methodology decisions referenced in their story's ACs and Dev Notes. The code reviewer specifically must verify implementations match Accepted ADR commitments — violations are HIGH severity, not LOW deferrable (Rule 6 in the project's skill-rules file).

## When to Pause

Within each agent, halt and surface a clarification (via the `## Clarification Needed` section described in the Agent Invocation Pattern) if ANY of these hold:

- The acceptance criteria or requirements are ambiguous.
- A prerequisite is missing — the story file references data, code, or context that isn't present.
- There are multiple reasonable design options and the user's preference matters.
- An environment or dependency failure blocks the work — a tool unavailable, a service down, a fixture missing, a kernel/asset that should be in place but isn't.
- Proceeding would risk breaking a stated constraint — security, compliance, performance, correctness, or an ADR commitment.

Do not guess; do not soldier on. The lead can answer the question in one round and re-spawn the agent with the answer baked into the next prompt. A short pause beats a wrong implementation that has to be unwound later.

## Handling Clarifications

When an agent returns with a `## Clarification Needed` section instead of the closing summary:

1. The lead reads the question from the returned message.
2. The lead surfaces the question to the user (with Story ID + relevant context).
3. The lead waits for the user's answer.
4. The lead re-spawns the same stage's agent with the clarification baked into the prompt (or written into the story file's Dev Notes).
5. The lead logs `<stage>_clarification_requested` before the re-spawn, and `<stage>_complete` after the re-spawn returns successfully.

**Key distinction:** A clarification-needed return is not a completion — the closing-summary sections won't be present. The lead detects the `## Clarification Needed` heading and routes accordingly.

**In a parallel batch:** if one agent in the batch returns with `## Clarification Needed` while others return cleanly, the lead surfaces the question and re-spawns *only that story's* agent. The other stories advance to the next stage normally; the clarified story rejoins the batch at the next barrier when its re-spawn returns.

## Submodule Commit Order (Critical, if Applicable)

**Applies only to projects with git submodules.** Skip this section if `.gitmodules` is absent or empty.

When stories modify files in submodule directories:

1. **Commit and push inside each affected submodule first** (`git -C <submodule-path> add ... && git -C <submodule-path> commit && git -C <submodule-path> push`).
2. **Then commit and push in the parent repo**, staging both parent files AND the updated submodule pointers (`git add <submodule-path>`).

If the parent is pushed with a submodule pointer that doesn't exist on the submodule's remote, other developers get checkout failures. Always submodules-first.

After each story, run `git -C <submodule-path> status --short` for every submodule listed in `.gitmodules` to determine which (if any) have changes.

## Completion Logging

At the completion of each story, write a brief log entry summarizing: story ID/name, files touched, key design decisions, any issues auto-resolved vs. those that required user input.

### Cycle Log Format (enables resume)

In addition to the per-story summary, write a per-**stage** log entry as each stage completes. Per-stage granularity makes resume possible — both for sequential interruption and parallel-batch interruption.

Cycle log file: `_bmad-output/implementation-artifacts/cycle-log-epic-{N}.md` (append-only).

**Format (TAB-separated, exactly four fields):**

```
<UTC-timestamp> TAB Story <id> TAB <stage> TAB <metadata>
```

- Fields separated by a single literal TAB character (`\t`), not runs of spaces.
- The **metadata** field is whitespace-separated `key=value` pairs. Values are comma-separated lists when multi-valued; values must NOT contain spaces or tabs (percent-encode if needed). Keys are lowercase snake_case.
- Valid stages, in order: `story_created`, `dev_complete`, `adr_verifications_complete` (optional, between `dev_complete` and `qa_complete`; one line per story regardless of AC count), `qa_complete`, `cr_complete`, `smoke_complete` (mandatory, between `cr_complete` and `committed`), `committed`, `epic_summary` (optional, once per epic after the last committed entry — see Workflow Telemetry). Clarification events use `<stage>_clarification_requested` and are followed by the eventual `<stage>_complete` on re-spawn.

**Standardized telemetry metadata (record on every `*_complete` entry):**

- `spawn_at=<UTC>` — when the lead invoked `Agent` for this stage (omit on lead-driven stages where there's no spawn). Duration = entry timestamp minus `spawn_at`.
- `model=<id>` — which model the agent ran. Examples: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`. For lead-driven stages, record the lead's model.
- `cycle_iteration=N` — defaults to 1; increment when the lead re-spawns this stage after a downstream stage rejected the work (e.g., smoke failed and a follow-up dev pass was needed) or after a clarification re-spawn.

**Stage-specific telemetry metadata (record when the data is available):**

- `dev_complete`: `loc_added=N loc_removed=N files=N clarifications=N nfr_tripwires=N adr_violations_surfaced=N closing_sections_present=true|false` — story complexity + signal counts. `closing_sections_present=false` records that the lead had to reconstruct file list from `git status --short`; this is normal and not a hygiene event.
- `qa_complete`: `tests_added=N first_run_failures=N clarifications=N closing_sections_present=true|false`.
- `cr_complete`: `resolved=N deferred=N dismissed=N high=N med=N low=N clarifications=N closing_sections_present=true|false`.
- `smoke_complete`: `method=<browser|cli|api|other> result=pass|fail iterations=N defects_caught=N evidence=<path>`.
- `committed`: `sha=<short-hash> submodules=<paths-or-empty>`.

**Cost telemetry (record when available — often only the lead can see it):**

- `input_tokens=N output_tokens=N cost_usd=X.XX` on any `*_complete` entry where the lead can extract the figures from the Agent tool's return metadata. If not available, omit.

**Example** (TABs shown as `→` for visibility; actual file contains literal tabs):

```
2026-05-18T14:23:11Z→Story 1.5→story_created→path=_bmad-output/implementation-artifacts/story-1.5.md spec_tokens=4820
2026-05-18T14:24:02Z→Story 1.5→dev_complete→spawn_at=2026-05-18T14:23:30Z model=claude-opus-4-7 files=src/render/render-engine.ts,src/types/branded.ts loc_added=412 loc_removed=18 clarifications=1 nfr_tripwires=0 cycle_iteration=1 closing_sections_present=true
2026-05-18T14:25:00Z→Story 1.5→adr_verifications_complete→tool=chrome_devtools_mcp ac=ac5 result=pass model=claude-opus-4-7
2026-05-18T14:29:47Z→Story 1.5→qa_complete→spawn_at=2026-05-18T14:25:30Z model=claude-sonnet-4-6 tests=tests/render/render-engine.test.ts tests_added=14 first_run_failures=2 clarifications=0 closing_sections_present=true
2026-05-18T14:33:18Z→Story 1.5→cr_complete→spawn_at=2026-05-18T14:30:15Z model=claude-opus-4-7 resolved=2 deferred=0 dismissed=0 high=1 med=1 low=0 clarifications=0 closing_sections_present=true
2026-05-18T14:34:00Z→Story 1.5→smoke_complete→method=browser result=pass iterations=1 defects_caught=0 evidence=path/to/screens/ model=claude-opus-4-7
2026-05-18T14:34:30Z→Story 1.5→committed→sha=abc1234 submodules=
```

**Parsing rule:** split each line on TAB into exactly 4 fields; split the metadata field on whitespace into key=value tokens; split each value on `,` for lists.

On restart, scan the cycle log for the highest-stage entry per story to compute the resume point.

## Workflow Telemetry

The cycle log is the project's primary telemetry surface. The standardized metadata plus the stage-specific keys make per-stage cost, quality, and model attribution computable without instrumenting anything beyond the existing lead-side writes.

**What the metadata enables:**

- **Per-stage duration by model.** `entry.timestamp − entry.spawn_at` grouped by `entry.model`.
- **Bug rate by upstream model.** `cr_complete.high + cr_complete.med` per story, grouped by `dev_complete.model`.
- **Rework rate by model.** Count of `cycle_iteration > 1` entries grouped by model.
- **Test-pyramid leak rate.** `smoke_complete.defects_caught > 0` events.
- **NFR-tripwire surfacing rate.** `dev_complete.nfr_tripwires` grouped by model.
- **Closing-section reliability.** `closing_sections_present=false` rate grouped by model — measures how often the lead has to reconstruct the file list from `git status`.

**`epic_summary` entry (one per epic, optional).**

After the last `committed` entry in an epic, the lead may write an aggregate summary:

```
<UTC> TAB Epic <N> TAB epic_summary TAB stories=N wall_clock_hours=X.X total_high=N total_med=N total_low=N total_smoke_defects=N rework_events=N opus_stage_count=N sonnet_stage_count=N haiku_stage_count=N input_tokens_total=N output_tokens_total=N cost_usd=X.XX
```

The summary is derivable from the per-stage entries above, so it's a convenience artifact, not a source of truth.

**Cross-project comparability.** The cycle log format is stable and project-agnostic. Across multiple projects using `/epic-cycle`, the same parser produces apples-to-apples comparisons.

## Anti-Patterns (Do NOT Use)

- **Agent Teams (`TeamCreate` / `SendMessage` / `TeamDelete`)** — v3 abandoned this pattern after real workflow runs observed silence-rates climbing toward 100% on the SendMessage envelope. Use plain `Agent` tool calls.
- **TaskCreate/TaskList/TaskUpdate** — Subagents poll TaskList on every wake-up and grab tasks regardless of `blockedBy`, prompt instructions, or task ownership. v3 doesn't need the task system; ignore it entirely.
- **Story-creator agent** — A story-creator agent races ahead to create story files for future stories. The lead must create story files directly.
- **Inline skill execution** — Agents interpreting skill logic themselves instead of invoking via the `Skill` tool. Always specify `Skill` tool usage explicitly in prompts.
- **Missing context handoff** — Not passing file lists between stages; code reviewers can't review effectively without knowing which files changed.
- **Parent-before-submodule push** — Pushing the parent repo before submodule commits are pushed leaves broken submodule pointers on the remote. Always submodules-first.
- **Normalizing known test failures** — Carrying forward "4 pre-existing failures, unrelated" across an epic erodes baseline reliability. Fix or formally defer in deferred-work.md immediately.
- **Deferred findings only in story files** — Without centralized tracking in `deferred-work.md`, deferred items are invisible at the next epic's Story X.0 triage.
- **Reading only from `epics.md`** — `sprint-status.yaml` may contain additional stories (cleanup, hotfixes). Build the story list from both sources.
- **Skipping retrospective review before epic start** — Without explicitly reading the previous retro and triaging deferred items, accumulation goes silent.
- **Parallelizing without verifying disjoint files** — Two agents writing the same file produce non-deterministic state and corrupt the commit.
- **Deferring ADR-mandated agent-time verification without surfacing it** — Saying "I can't do X from this environment" for work an Accepted ADR commits to specific tooling. The lead executes ADR-tooled verifications directly because MCP propagation to subagents is unreliable.
- **Treating ADR violations as LOW deferrable findings** — An implementation that violates an Accepted ADR is HIGH severity. Code-reviewer customization must enforce this (Rule 6 in the project's skill-rules file).
- **Skipping the per-story smoke** — Test pyramid passing while the deployed product is broken (because wiring between independently-correct modules was never verified end-to-end) is a recurring failure. Failed smoke is HIGH, never deferrable.
- **Smoke executed by a spawned subagent** — Subagents may not have reliable access to runtime tooling. The smoke is lead-side, same reason ADR-tooled verifications and `/bmad-retrospective` are lead-side.
- **Service-introducing story spawned without an Integration AC** — A producer + consumer can both ship green with the wiring between them never built. The lead validates integration-AC presence at `/bmad-create-story` and pauses for the user if absent.
- **Carrying v2's BMAD `on_complete` hooks forward** — v2's `on_complete` arrays were load-bearing only because they fired the SendMessage envelope. With the envelope gone, those arrays just duplicate what the spawn prompt already says. Leaving them in place creates two sources of truth for agent behavior. Delete the `on_complete` blocks from each `.toml`; leave `persistent_facts`.
- **Blocking the pipeline waiting for a "completion message" from the Agent tool** — The Agent tool returns once when the subagent's run ends. There is no separate envelope. Read the returned message directly.

## Lessons Learned

Carry-forward wisdom from prior project runs.

1. **Detailed story specs enable autonomous development** — "Previous Story Intelligence" sections eliminate agent guessing.
2. **Never normalize known failures** — fix or formally defer immediately.
3. **Autonomous pipelines need explicit reinforcement** — skills may have mechanisms that aren't triggered without explicit mention in orchestrator prompts.
4. **Mock-based testing is sufficient for foundation epics** — document infrastructure constraints in story dev notes.
5. **Story X.0 cleanup pattern (MANDATORY)** — deferred work from epic N gets a tracked cleanup story at the start of epic N+1.
6. **Pipeline must support resume** — on restart, read `sprint-status.yaml` and the cycle log to compute the resume point.
7. **ADR-aware execution (lead-executed gate)** — the lead drives ADR-tooled AC verifications directly because subagent MCP/tool propagation is unreliable.
8. **The test pyramid is necessary but not sufficient — the per-story smoke is the bridge from "tests pass" to "the product works."**
9. **Integration ACs catch the wiring gap that unit ACs miss.**
10. **NFR tripwires amend planning artifacts in place** — when an NFR is found unmeasurable, mathematically impossible, or internally contradictory, the response is NOT to add a code comment + a `deferred-work.md` entry. Amend the PRD/architecture/epics in place.
11. **Inter-agent message channels are the unreliable part of multi-agent workflows; the Agent tool's natural return value is the reliable part.** Real workflow runs observed silence-rates climbing toward 100% on v2's SendMessage envelope despite the BMAD `on_complete` hook being correctly placed. The fix is to stop using the message channel: deliver the completion-summary content inside the agent's final message (which the Agent tool returns to the lead as its tool result), parse it from there, and fall back to `git status --short` if a section is missing. This is structurally equivalent to v2's "silence recovery protocol" being the primary path — but renamed from "recovery" to "normal extraction" because there is no separate envelope to be silent about.
12. **Keep agent-behavior instructions in one place.** v2 split runtime agent behavior between the workflow's spawn prompts and four BMAD `.toml` `on_complete` hooks. When behavior changes, both surfaces have to stay in sync — and `on_complete` blocks are easy to forget about. v3 puts all runtime behavior in the spawn-prompt skeleton (in the slash command) and keeps the `.toml` files minimal. Single source of truth.

```text
=== END .claude/commands/epic-cycle.md ===
```

---

## Part 3: Validation

After writing all files, run these checks:

1. **Slash command is self-contained:**
   ```
   grep "epic-cycle-teams" .claude/commands/epic-cycle.md
   ```
   Result must be **zero matches**. If any matches, the slash command body references the design doc; fix and re-validate.

2. **Slash command does NOT reference Agent Teams:**
   ```
   grep -E "TeamCreate|TeamDelete|SendMessage|team_name|shutdown_request|shutdown_response" .claude/commands/epic-cycle.md
   ```
   Result must be **zero matches**. The only acceptable mention is in the Anti-Patterns section explicitly forbidding Agent Teams.

3. **All five customization files exist:**
   ```
   ls _bmad/custom/
   ```
   Expected entries: `<project>-skill-rules.md`, `bmad-create-story.toml`, `bmad-dev-story.toml`, `bmad-qa-generate-e2e-tests.toml`, `bmad-code-review.toml`.

4. **No `.toml` carries an `on_complete` hook:**
   ```
   grep -l "on_complete" _bmad/custom/bmad-*.toml
   ```
   Expected: **zero matches**. v3 retired `on_complete` — verification gates and closing-summary instructions live in the workflow's spawn-prompt skeleton, not in the `.toml` files. If any match, the v2 hooks weren't cleaned up during the upgrade; delete the `on_complete` block from each affected file.

5. **No `.toml` references the v2 STATUS envelope or SendMessage:**
   ```
   grep -E "STATUS: completed|STATUS: clarification_needed|SendMessage|shutdown_request" _bmad/custom/bmad-*.toml
   ```
   Result must be **zero matches**. The v3 customizations emit closing-summary markdown sections in the agent's final message; no separate envelope.

6. **Each `.toml` still loads the rules registry via `persistent_facts`:**
   ```
   grep -c "persistent_facts" _bmad/custom/bmad-*.toml
   ```
   Expected: each of the four `.toml` files reports `1` (one `persistent_facts` declaration). If any reports `0`, the rules registry isn't wired into that skill.

7. **The slash command contains every section:** open `.claude/commands/epic-cycle.md` and confirm presence of: Pre-flight Runtime Check, Task Sequence, Permission Mode, Skill Tool Invocation, Agent Invocation Pattern (with Spawn Prompt Skeleton, Stage-specific rule blocks, Clarification protocol, Pipeline Flow, Smart Parallelism, Per-Story Smoke, Retrospective Review & Story X.0 Creation, Sprint Planning Per Epic, Retrospective Per Epic, Lead Creates Story Files, Context Handoff Between Stages, ADR-Aware Execution), When to Pause, Handling Clarifications, Submodule Commit Order, Completion Logging, **Workflow Telemetry**, Anti-Patterns, Lessons Learned.

8. **Telemetry metadata is documented:**
   ```
   grep -c "spawn_at" .claude/commands/epic-cycle.md
   grep -c "model=" .claude/commands/epic-cycle.md
   grep -c "closing_sections_present" .claude/commands/epic-cycle.md
   ```
   First two must return ≥ 3 matches; third must return ≥ 2 matches (the new v3 telemetry key for closing-summary extraction reliability).

## Part 4: After construction

Once all validation checks pass, the workflow is ready to use. **Keep `epic-cycle-teams.md` (v1), `epic-cycle-teams-v2.md`, and `epic-cycle-teams-v3.md` (this file) in the project root** as the historical design record. They're useful as reference when retrospectives surface gaps that need workflow-level fixes, and as the canonical authoring source if you ever need to regenerate the customizations or the slash command again. The slash command and customizations under `_bmad/custom/` are self-contained at runtime, but the design docs are the authoring trail showing how the workflow evolved away from the Agent Teams dependency.

The next epic's retrospective should explicitly evaluate whether v3's natural-return pattern eliminates the silence problem, and whether the new `closing_sections_present` telemetry key reveals any pattern (e.g., longer stories more likely to drop the closing summary, certain models more reliable than others). If `closing_sections_present=false` rate climbs above ~20%, consider adding a one-paragraph re-emphasis of the closing-summary requirement to the spawn-prompt skeleton — but do not reintroduce a separate message channel.
