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

1. **Lead** verifies a working tree is clean across the parent repo and every submodule listed in `.gitmodules`; halts on dirty state (see "Source Control Branching" below).
2. **Lead** verifies (or, with user authorization, creates) the feature branch `feature/{TICKET}_{Description}` in the parent repo and every submodule where work will take place — per Rule SC-1 in "Source Control Branching" below.
3. **Lead** verifies (or creates) the epic branch `epic{N}` off the feature branch in every repo where work will take place — per Rule SC-2.
4. **Lead** executes `/bmad-sprint-planning` directly (ensures `sprint-status.yaml` is current).
5. If a previous epic's retrospective or `deferred-work.md` has unresolved items, **Lead** reviews them, triages, and creates Story X.0 via `/bmad-create-story` (see "Retrospective Review & Story X.0 Creation" below).

**Per Story (executed once per story in the epic):**

1. **Lead** executes `/bmad-create-story` directly (no agent — prevents race-ahead).
2. Agent: `/bmad-dev-story`.
3. **Lead** executes any ADR-tooled AC verifications (see ADR-Aware Execution).
4. Agent: `/bmad-qa-generate-e2e-tests`.
5. Agent: `/bmad-code-review`.
6. **Lead** performs per-story smoke (see Per-Story Smoke).
7. **Lead** commits and pushes — **only to the epic branch** in every affected repo, never to main/master/develop (Rule SC-3 + SC-6).

**End of Epic (executed once per epic after all stories):**

1. **Lead** pauses and asks user: "Would you like to run a retrospective?" If yes, execute `/bmad-retrospective` **in interactive mode** — the skill's elicitation must reach the user.
2. **Lead** pauses and asks user: "Merge `epic{N}` into `feature/{TICKET}_{Description}` and delete the epic branch (local + remote)?" — per Rule SC-4. If yes, performs the merge + delete in each affected repo (submodules first, parent last; mirrors the per-story Submodule Commit Order). If another epic was running in parallel and already merged to feature, the `git pull origin feature/...` step picks up that work before this merge — see Rule SC-8 for parallel-epic mechanics.

## Execution Guidelines

Each pipeline-stage task is delegated via the `Agent` tool. The lead invokes lead-side skills (sprint planning, story creation, retrospective) directly via the `Skill` tool. If a stage-agent's return is missing the closing-summary sections, the lead extracts the file list from `git status --short` against the story's `Files to Modify` table — this is normal extraction (the v3 reliable path), not a recovery from silence.

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
  Lead verifies clean working tree (parent + every submodule); halts on dirty state

  # Resume-mode detection (see Resume Semantics)
  For each affected repo, lead determines mode by cross-referencing:
    - cycle-log-epic-{N}.md existence + entries
    - sprint-status.yaml story states for this epic
    - epic{N} branch presence locally and on remote
  Modes per repo: FRESH | RESUME | REMOTE_ONLY | LOCAL_ONLY | AMBIGUOUS | INTEGRITY_ERROR
    INTEGRITY_ERROR or AMBIGUOUS → halt and surface to user
    LOCAL_ONLY                   → halt and ask user (remote deletion intentional?)
    REMOTE_ONLY                  → `git fetch origin && git checkout epic{N}`; then RESUME
    RESUME                       → run Cross-stage integrity checks; on pass, set resume point
    FRESH                        → fall through to SC-1 / SC-2 below

  # SC-1 / SC-2 — only when (or where) FRESH
  For each repo in FRESH mode:
    Lead verifies feature branch `feature/{TICKET}_{Description}` exists
      If missing → STOP and ask user: should it be created, what TICKET + Description, and which root (origin/develop / origin/main / origin/master)?
      On user authorization → validate name; branch off the user-specified root; push to remote; logs feature_branch_created
    Lead verifies epic branch `epic{N}` exists
      If missing → branch off the feature branch (deterministic from epic number); push to remote; logs epic_branch_created
  Lead checks every affected repo out to epic{N}; logs epic_branch_checked_out

  Lead executes /bmad-sprint-planning via Skill tool; logs sprint_planning_complete
  If Epic N-1 retrospective exists OR deferred-work.md has unresolved items, AND no prior retro_review_* entry for this epic:
    Lead reads both sources, triages, creates Story X.0 via /bmad-create-story; logs retro_review_complete
  Else if no prior retro_review_* entry:
    Lead logs retro_review_skipped reason=no_predecessor_no_deferred_work
  Else:
    (resume case — gate already passed in a prior session; skip)

  For each story (or batch — see Smart Parallelism) including X.0, starting from the resume point computed above:
    Lead asserts current branch == epic{N} in every affected repo (defense for Rule SC-3 + SC-6); halts on mismatch
    Lead executes /bmad-create-story directly (pipeline gate, including Integration AC validation)
    Lead captures story file path
    Lead records spawn_at=<UTC> and model=<id> at the moment of each Agent call

    Lead invokes Agent for /bmad-dev-story → reads return for ## Files Modified → logs dev_complete
    Lead executes ADR-tooled AC verifications (lead-side, sequential per AC); logs adr_verifications_complete
    Lead invokes Agent for /bmad-qa-generate-e2e-tests → reads return for ## Tests Added → logs qa_complete
    Lead invokes Agent for /bmad-code-review → reads return → logs cr_complete
    Lead performs per-story smoke (lead-side); logs smoke_complete
    Lead asserts current branch == epic{N} (defense before commit); commits + pushes ONLY to epic{N} (submodules first if applicable)
    Lead logs committed; next story or next batch

  Lead pauses: "Would you like to run a retrospective?" → if yes, execute /bmad-retrospective via Skill tool
  Lead pauses: "Merge epic{N} → feature branch and delete epic{N} (local + remote)?" → if yes:
    For each affected repo, submodules-first then parent:
      checkout feature branch; pull latest; merge --no-ff epic{N}; push feature branch; delete epic{N} local + remote
    Logs epic_merged_to_feature
  Else:
    Lead logs epic_merge_skipped reason=<short>
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

### Source Control Branching (Critical Gates)

These gates fire **at the very start of each epic**, before sprint planning or any story work. They apply uniformly to the parent repo and every submodule listed in `.gitmodules`. If the project is multi-repo (separate repositories under one umbrella rather than git submodules), the user must enumerate the affected repos up-front — the rules apply to each.

**Precondition — clean working tree.** Before evaluating any branching rule, the lead runs `git status --short` against the parent repo and every submodule and halts with a clear message if any are dirty. Switching branches with uncommitted work can corrupt state; this guard is non-negotiable.

#### Rule SC-1 — Feature branch verification (epic-start gate)

At the beginning of each epic, the lead checks for a feature branch in every affected repo. The branch name follows the project's configured pattern (see "Tracker format flexibility" below); the default is `feature/{TICKET}_{Description}` where `{TICKET}` is an external tracker ID and `{Description}` is a kebab-case or snake-case summary.

- **If the feature branch exists locally** (or on the remote, fetch-discoverable): check it out and verify it's up to date with its remote. Continue.
- **If the feature branch does NOT exist:** **STOP** and ask the user:
  1. Should the feature branch be created?
  2. What is the exact TICKET (e.g., `PROJ-1234` for JIRA, `ENG-45` for Linear, `42` for GitHub Issues, `SPIKE` / `EXPLORE` / `REFACTOR` for ticketless work — validated against the project's `ticket_format` regex)?
  3. What is the exact Description (e.g., `attitude-reconstruction`)?
  4. Which root does it branch from? Default precedence: `origin/develop` (preferred if it exists) → `origin/main` → `origin/master`. The lead surfaces the candidates the repo actually has and asks the user to confirm.

  On user authorization: validate the resulting branch name against the configured `feature_pattern`, validate `{TICKET}` against `ticket_format`, then run `git fetch origin && git checkout -b <validated-name> origin/{root} && git push -u origin <validated-name>` (per affected repo). Log `feature_branch_created` in the cycle log.

The feature branch lifecycle ENDS where? Merging the feature branch into `develop` / `main` is **out of scope** for `/epic-cycle` — that's a PR-review / code-owner workflow performed by humans. `/epic-cycle` creates and merges INTO the feature branch only.

##### Tracker format flexibility (per-project configuration)

The default branch-naming convention assumes a JIRA-style tracker — but real projects use JIRA, Linear, GitHub Issues, Azure DevOps, or no tracker at all. The lead reads the project's branch-naming config from the **first** of these locations to exist:

1. `_bmad/custom/branch-naming.yaml` (project-specific override; preferred)
2. A `## Branch naming` section in the project's CLAUDE.md (inline config)
3. The default, embedded in this rule (used when neither override is present)

**Config schema:**

```yaml
# _bmad/custom/branch-naming.yaml
feature_pattern: "feature/{TICKET}_{Description}"  # template with {TICKET} and {Description} placeholders
ticket_format: "^([A-Z]+-\\d+|SPIKE|EXPLORE|REFACTOR)$"  # regex; tracker IDs OR named exceptions
ticket_required: true   # if false, {TICKET} placeholder may be empty / omitted
description_format: "^[a-z][a-z0-9-]{2,60}$"  # kebab-case, 3-60 chars, starts with letter
separator: "_"          # between TICKET and Description in the template
```

**Defaults if no config is found:**

| Field | Default value |
| --- | --- |
| `feature_pattern` | `feature/{TICKET}_{Description}` |
| `ticket_format` | `^[A-Z]+-\d+$` (JIRA/Linear-style) |
| `ticket_required` | `true` |
| `description_format` | `^[a-z][a-z0-9-]{2,60}$` |
| `separator` | `_` |

**Validation flow at SC-1 user prompt:**

1. Lead asks user for `{TICKET}` and `{Description}` (showing an example derived from the configured pattern).
2. Lead validates each against the configured regex.
3. If invalid: surface the mismatch (e.g., "Input `my widget` doesn't match `description_format` `^[a-z][a-z0-9-]{2,60}$` — spaces aren't allowed; use `my-widget`"). Offer: (a) re-enter, (b) override and use as-is (logs a warning), (c) update the project config.
4. If valid: render the branch name from `feature_pattern` and confirm with the user before creating.

**Ticketless work (spikes, exploration, refactors).** The default `ticket_format` regex above explicitly allows `SPIKE`, `EXPLORE`, and `REFACTOR` as named exceptions so a quick exploratory branch like `feature/SPIKE_audio-latency-probe` validates cleanly. Projects can broaden or narrow this list in `branch-naming.yaml`.

**Branch-name safety.** Regardless of the configured patterns, the lead refuses any branch name that contains spaces, shell metacharacters (`*`, `?`, `[`, `]`, `;`, `&`, `|`, `<`, `>`, `$`, `` ` ``, newline), or git-reserved sequences (`..`, `@{`, leading `-`, trailing `.`). These are non-negotiable safety guards, independent of the project config.

#### Rule SC-2 — Epic branch verification (epic-start gate)

After the feature branch is in place, the lead checks for an epic branch named `epic{N}` (where `{N}` is the current epic number — `epic1`, `epic2`, `epic3`, etc.) in every affected repo.

- **If `epic{N}` exists locally** (or on the remote): check it out. Continue.
- **If `epic{N}` does NOT exist:** create it deterministically off the feature branch — no user prompt needed; the name is fully derived from the epic number. `git checkout feature/{TICKET}_{Description} && git pull && git checkout -b epic{N} && git push -u origin epic{N}` (per affected repo). Log `epic_branch_created`.

**Resume semantics:** mid-epic resume should find `epic{N}` already in place. If the lead is resuming an epic that has prior `committed` entries in the cycle log but `epic{N}` is missing from the local tree AND the remote, that is a workspace-integrity error — halt and surface to the user. Do NOT silently re-create the branch in that case, since it would orphan prior commits.

#### Rule SC-3 — Commits go ONLY to the epic branch

Every commit produced during the epic cycle — story commits, hotfix commits, retrospective document commits — lands on the `epic{N}` branch in the affected repo. The lead asserts `git branch --show-current == "epic{N}"` immediately before every `git commit` invocation and halts on mismatch. This applies to submodules too (each submodule's HEAD must be on its own `epic{N}` before the parent's `git add <submodule-path>` step).

The per-story push frequency is "after every story's commit lands on `epic{N}`," which means `epic{N}` is the working remote until end-of-epic.

#### Rule SC-4 — End-of-epic merge gate (user decision point)

After the retrospective gate (whether the user opted in or not), the lead pauses and asks:

> "Epic {N} is complete. Merge `epic{N}` into `feature/{TICKET}_{Description}` and delete the epic branch (local + remote) in every affected repo?"

If **yes**, the lead executes the merge — **submodules-first, then the parent** (mirrors per-story Submodule Commit Order to avoid broken pointers on the feature branch's remote):

For each affected repo, ordered submodules-first:

1. `git checkout feature/{TICKET}_{Description}`
2. `git pull origin feature/{TICKET}_{Description}` (in case it moved while the epic was in flight)
3. `git merge --no-ff epic{N} -m "Merge epic{N}: <one-line summary>"` (preserves the epic branch's commit graph as a visible group)
4. `git push origin feature/{TICKET}_{Description}`
5. `git branch -d epic{N}` (local — refuses if not fully merged, which is the safety we want)
6. `git push origin --delete epic{N}` (remote)

If submodules are involved, the parent's merge step (3) brings in submodule pointer updates that already exist on `epic{N}` from the per-story commits (the per-story flow committed each submodule first, then bumped the parent's pointer). Because the submodules' own feature branches were merged in the preceding pass, those pointers now resolve cleanly on the submodules' remotes. Verify with `git submodule status` before the final parent push.

If **no**, the lead logs `epic_merge_skipped` and leaves `epic{N}` intact. The branches remain for later out-of-band merging or for a continuation session.

#### Rule SC-5 — Epic re-open recreates the epic branch

If an epic is re-opened (e.g., the next epic's retrospective surfaces work that belongs on the prior epic, or the user explicitly reopens), the `epic{N}` branch must be recreated. Recreation policy:

- If the prior `epic{N}` was merged into feature and deleted: branch a NEW `epic{N}` off the current feature-branch HEAD. This picks up any feature-branch progress made in the interim.
- If the prior `epic{N}` was never merged and still exists: check it out as-is; do not branch a parallel epic{N}.

In either case, log `epic_branch_reopened reason=<short>` in the cycle log.

#### Rule SC-6 — NEVER commit directly to `main`, `master`, or `develop`

The lead refuses any commit (story, retrospective, hotfix, anything) when the current branch is `main`, `master`, or `develop` in any affected repo. This is an absolute defensive default — the workflow itself never originates such a commit. If the user explicitly directs a direct-to-trunk commit (e.g., emergency hotfix outside the epic cycle), that is OUT of scope for `/epic-cycle` and the user performs it manually.

This pairs naturally with GitHub/GitLab branch protection on `main`/`master`/`develop`; the local-side rule is defense-in-depth.

#### Rule SC-7 — If unsure where to commit, STOP and ask

Branching state can drift across sessions (someone renamed a branch upstream, the project switched from `main` to `master` mid-flight, a submodule's parent branch isn't what's expected). If at any point the lead cannot confidently identify the right branch to commit to — including, but not limited to, finding multiple feature branches with similar names, finding the epic branch missing mid-resume, finding the parent branch ambiguous between `develop` and `main` — **STOP** and ask the user. Do not guess; the cost of a wrong commit is far higher than the cost of a clarification round.

#### Rule SC-8 — Parallel epics on the same feature branch

Multiple `/epic-cycle` runs may execute concurrently against the same feature branch — typically when different agents are driving Epic A and Epic B at the same time. The git mechanics:

**Per-agent isolation: one working tree per agent.** Git only allows one HEAD per working directory, so concurrent agents on different epic branches require either:

- `git worktree add <path> epic{N}` — the recommended mechanism. Each agent operates in its own worktree (`/path/to/repo-epic4`, `/path/to/repo-epic5`), sharing the same `.git` object store. Branches, commits, and pushes are independent per worktree. Cleanup: `git worktree remove <path>` after the epic merges and the branch is deleted.
- Separate full clones — heavier but simpler.

A single working directory running two agents on different epic branches is **not** supported — it would require constant branch-switching with no way to keep the agents' file-state consistent.

**Branch creation under parallelism (Rule SC-2 extension).** Each agent runs Rule SC-2 independently. The `epic{N}` branch is created off `feature/{TICKET}_{Description}`'s **current HEAD at the moment that agent starts the epic**. Two consequences:

1. If Epic A and Epic B start near-simultaneously, both `epic4` and `epic5` branch off the same feature commit. No conflict expected at merge time unless they touched overlapping files.
2. If Epic A is already in flight (its `epic4` exists) and Epic B starts later, AND something landed on feature in between (e.g., a hotfix, or Epic A already merged), `epic5` is created off a NEWER feature HEAD than `epic4` was. The two epics' branch points differ. This is fine — the `--no-ff` merge at Rule SC-4 handles three-way reconciliation.

**Per-story commits under parallelism (Rule SC-3).** Each agent's per-story commits land on its own `epic{N}` branch. Independent branches, independent remotes — no git-level race condition. Each agent's pre-commit branch assertion (`git branch --show-current == "epic{N}"`) is per-agent and per-worktree.

**Merge serialization (Rule SC-4 extension).** The actual `git push` to feature is a single-writer point on the remote, so the SC-4 merge gate must serialize across agents. Two cases:

1. **Coordinated:** Both agents reach Rule SC-4 (end-of-epic merge prompt) at different wall-clock times. Each agent's SC-4 sequence starts with `git pull origin feature/{TICKET}_{Description}` — if Epic A already merged its work to feature, Epic B's pull picks that up before Epic B's own merge runs. Standard three-way merge from there.
2. **Near-simultaneous:** If two agents' merge prompts surface to the user at the same time, the user picks the order. The second agent re-pulls feature after the first lands, then merges. Do NOT attempt to push without re-pulling — a stale-pointer push will be rejected by the remote anyway (`git push` requires fast-forward to the remote tip).

**Conflict handling at merge time.** If `git merge --no-ff epic{N}` into feature produces conflicts (either against another epic's already-merged work, against a hotfix on feature, or against any other commits that landed since `epic{N}` was branched), the lead **STOPs** and surfaces the conflict to the user. Auto-resolution is forbidden — git's heuristic conflict markers can silently drop intentional changes. The user resolves the conflict in the working tree, then signals the lead to continue (`git add <resolved> && git commit && git push`).

Submodules are independent under this rule too: each submodule's `epic{N}` merges into its own feature branch sequentially, and conflicts there require user resolution per-submodule before the parent's submodule pointer is bumped.

**Out-of-scope coordination:** if Epic A and Epic B's planning artifacts overlap (both stories' ACs touch the same files), that's a sprint-planning conflict the user must resolve before running them in parallel — not something `/epic-cycle` can sense or prevent. The rule of thumb: if two epics' Files to Modify tables overlap by more than ~20%, run them sequentially.

#### Sub-repository vs submodule terminology

"Submodule" = a git submodule (`.gitmodules` registers it; `git -C <path>` operates on it as a child repo). "Sub-repository" = a non-submodule child repo under one umbrella (some projects keep `web/` and `bake/` as separate repos under one orchestrating directory). Rules SC-1 through SC-7 apply to both. The lead must know up-front which model the project uses; if ambiguous, this is itself a Rule SC-7 STOP-and-ask trigger.

### Resume Semantics (Critical)

`/epic-cycle` is designed to be resumable. A session may stop mid-epic — by interrupt, by context exhaustion, by the user explicitly pausing, or by a clarification gate that waits across days — and a later session must pick up exactly where the prior one left off without re-doing work and without skipping work.

#### Resume-mode detection (epic-start)

When `/epic-cycle` is invoked for an epic, the lead determines its mode before running SC-1 / SC-2:

1. Read `_bmad-output/implementation-artifacts/cycle-log-epic-{N}.md`.
2. Read `_bmad-output/implementation-artifacts/sprint-status.yaml` for this epic's stories.
3. For each affected repo, check whether `epic{N}` exists locally and on the remote.

Cross-reference yields one of these modes:

| Cycle log | `epic{N}` local | `epic{N}` remote | Mode | Action |
| --- | --- | --- | --- | --- |
| Missing / empty | Missing | Missing | **FRESH** | Run SC-1, SC-2, create the branch. |
| Missing / empty | Exists | Exists | **AMBIGUOUS** | Halt; ask the user whether to (a) adopt the existing branch and start writing the cycle log against it (any commits already on the branch are accepted as-is and not retroactively logged), (b) start a new epic under a different `N`, or (c) inspect manually and decide. |
| Has entries | Exists | Exists | **RESUME** | Compute the resume point from the log (below). |
| Has entries | Missing | Exists | **REMOTE_ONLY** | `git fetch origin && git checkout epic{N}` then RESUME. |
| Has entries | Exists | Missing | **LOCAL_ONLY** | Halt; ask the user whether the remote branch was deleted (push local up, or abandon). |
| Has entries | Missing | Missing | **INTEGRITY_ERROR** | Halt loudly. The log claims prior work that the branches no longer carry. Surface to the user. |

The detection runs **per affected repo** (parent + submodules). Different repos may legitimately be in different modes — e.g., the parent is RESUME (already has prior commits) while a submodule is FRESH (no work landed in it yet for this epic). That's fine; handle each independently.

#### Resume-point computation (within-epic)

For a repo in RESUME mode, the resume point is the earliest stage of the earliest story that hasn't reached its terminal stage. The terminal stage is `committed` for normal stories.

Algorithm:

1. Read the cycle log line-by-line. Each line is TAB-separated as documented in "Cycle Log Format (enables resume)".
2. Bucket entries by story ID. Within each bucket, the highest-stage entry is the story's current resume anchor.
3. The earliest story whose anchor is **not** `committed` is the resume point. The next pipeline stage after the anchor is where work resumes.
4. If a story has a `<stage>_clarification_requested` entry without a subsequent `<stage>_complete`, the resume point is "answer the clarification + re-spawn that stage's agent." The lead surfaces the question to the user before spawning anything.
5. For parallel batches, compute per-story anchors first, then identify the earliest stage across the batch — that's where the batch resumes. Re-spawn only the agents for stories that haven't yet reached that stage.

#### Cross-stage integrity checks (executed before any further work)

Before resuming any stage, the lead runs these checks on the affected repo's `epic{N}` HEAD:

1. **Cycle log `committed sha=X` must be reachable on `epic{N}`.** For every `committed` entry, verify `git -C <repo> merge-base --is-ancestor X epic{N}`. If false, the local branch has drifted from what the log claims (force-push, history rewrite, hard reset). Halt.
2. **Local and remote `epic{N}` HEADs match.** `git rev-parse epic{N}` == `git rev-parse origin/epic{N}` (post-fetch). If they differ in a non-fast-forward way, halt. If local is strictly ahead, log a `resume_local_ahead` advisory and push. If local is strictly behind, fetch + fast-forward.
3. **`sprint-status.yaml` story status agrees with the cycle log.** A story marked `done` in YAML with no `committed` entry in the log, OR a `committed` entry with the story still marked `backlog`, is a divergence — surface to the user.
4. **Submodule pointer consistency.** If `epic{N}` on the parent recorded a submodule pointer at commit `S`, the submodule's `epic{N}` must contain `S`. Mismatches surface as INTEGRITY_ERROR per the table above.

#### Resume-mode interactions with parallel epics (Rule SC-8)

If Epic A is being resumed and Epic B was running in parallel and merged to feature while Epic A was sleeping, the resume check is unchanged for Epic A — Epic A's `epic{N}` is unaffected by what happened to feature. The three-way reconciliation happens at Epic A's eventual SC-4 merge.

If Epic A is being resumed and its own `epic{N}` was force-pushed by another contributor during the pause (e.g., someone rebased the branch from a different worktree), Check 1 fails and the lead halts. Force-pushes mid-epic are not silently recoverable.

#### Resume across the Story X.0 / retro-review gate

The retro-review gate (Story X.0 creation) fires once per epic. Detect via the cycle log:

- Has `retro_review_complete` or `retro_review_skipped` entry → already done, skip.
- No such entry → run the gate.

If the gate ran but Story X.0 creation was interrupted (the gate entry is present but Story X.0 has no `story_created` entry), treat Story X.0 as the first incomplete story and resume there.

#### Resume across the Sprint Planning gate

Sprint planning is idempotent — `sprint-status.yaml` is regenerated each run. Always re-run on resume, even if a prior `sprint_planning_complete` entry exists; the skill is a no-op when the YAML is already current. The cycle log is append-only, so the new entry coexists with the prior one — the highest-timestamp entry is the authoritative "current" record.

#### Workspace-integrity errors are not auto-recoverable

The INTEGRITY_ERROR row in the detection table above (and the cross-stage check failures) **must halt**. Auto-recovery paths like "the branches must have been pruned; recreate them" lose work. The user is the only entity that can authorize a recovery action, because only the user knows whether the missing state was intentional (cleanup) or accidental (mistake).

When halting on an integrity error, the lead surfaces:

1. What the log says happened (story IDs, stages, recorded shas).
2. What the workspace shows (branches present/missing, HEAD shas).
3. The specific check that failed.
4. Options for the user (re-create from log, abandon log, inspect manually).

Never guess.

#### Resume vs starting a new epic (epic boundary)

If the cycle log for epic N is missing but the cycle log for epic N-1 exists and shows the N-1 epic completed, that's a normal **FRESH** start for epic N. SC-1 / SC-2 fire to create the new branch. The retro-review gate fires to triage epic N-1's deferred items into Story N.0.

If the cycle log for epic N is present with entries AND the cycle log for epic N+1 is also present with entries, two epics are in flight (parallel per Rule SC-8). Both must be resumed independently in their respective worktrees.

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

This workflow gate is the binding enforcement. (v3 retired `on_complete` hooks from the BMAD `.toml` customizations — the project's skill-rules file documents Rule 1 as a guideline; this `/bmad-create-story` gate is what actually halts when the rule is violated.)

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

## Submodule / Sub-Repository Commit Order (Critical, if Applicable)

**Applies to projects with git submodules OR sub-repositories** (separate child repos under one umbrella). Skip this section if neither applies (single-repo project).

When stories modify files in child-repo directories:

1. **Commit and push inside each affected child first** (`git -C <child-path> add ... && git -C <child-path> commit && git -C <child-path> push`). For git submodules, this also produces an updated submodule pointer the parent will reference.
2. **Then commit and push in the parent repo.** For git submodules, the parent stages both parent files AND the updated submodule pointer (`git add <submodule-path>`). For sub-repositories, the parent's commit references the children only at the workflow level (no submodule pointer to update) — but the children should still be pushed first so any cross-child dependencies are visible on their remotes.

If the parent is pushed with a submodule pointer that doesn't exist on the submodule's remote, other developers get checkout failures. Always submodules-first.

After each story, run `git -C <child-path> status --short` for every affected child (those listed in `.gitmodules`, plus any sub-repos the project enumerates) to determine which (if any) have changes.

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
- Two entry kinds share the same TAB-separated shape, distinguished by the second field:
  - **Story-level entries**: second field is `Story <id>` (e.g., `Story 3.3`). The vast majority of log entries.
  - **Epic-level entries**: second field is `Epic <N>` (e.g., `Epic 3`). Used for events that aren't tied to a single story — branch lifecycle and the optional epic summary.
- **Valid story-level stages, in order:** `story_created`, `dev_complete`, `adr_verifications_complete` (optional, between `dev_complete` and `qa_complete`; one line per story regardless of AC count), `qa_complete`, `cr_complete`, `smoke_complete` (mandatory, between `cr_complete` and `committed`), `committed`. Clarification events use `<stage>_clarification_requested` and are followed by the eventual `<stage>_complete` on re-spawn.
- **Valid epic-level stages** (Source Control + workflow lifecycle):
  - `feature_branch_created` — Rule SC-1 created the feature branch in one or more repos. Metadata: `repos=<paths>` (comma-separated) `ticket=<id>` `description=<desc>` `root=<origin/branch>`.
  - `epic_branch_created` — Rule SC-2 created `epic{N}` in one or more repos. Metadata: `repos=<paths>` `from=<feature-branch-sha>`.
  - `epic_branch_checked_out` — Lead checked out `epic{N}` at epic start (resume or after creation). Metadata: `repos=<paths>` `head=<sha>`.
  - `epic_branch_reopened` — Rule SC-5 recreated `epic{N}` after a prior merge. Metadata: `reason=<short>` `from=<feature-branch-sha>`.
  - `sprint_planning_complete` — Sprint-planning gate done. Metadata: optional model/duration.
  - `retro_review_complete` or `retro_review_skipped` — Retro-review + Story X.0 gate done. Metadata: `source_retro=<path-or-empty>` `included=<count>` `deferred=<count>` `dropped=<count>` for complete; `reason=<short>` for skipped.
  - `resume_local_ahead` — Resume integrity check 2 found local `epic{N}` ahead of remote; lead pushed. Metadata: `repo=<path>` `pushed_shas=<count>`.
  - `epic_merge_skipped` — User declined the Rule SC-4 merge prompt. Metadata: `reason=<short>`.
  - `epic_merged_to_feature` — Rule SC-4 merge completed. Metadata: `repos=<paths>` `feature_sha=<sha>` `merge_sha=<sha>` `submodules=<paths-or-empty>`.
  - `epic_summary` (optional, once per epic after the last `committed` entry) — see Workflow Telemetry.

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
2026-05-18T13:55:02Z→Epic 1→feature_branch_created→repos=. ticket=PROJ-1234 description=initial-foundation root=origin/main
2026-05-18T13:55:10Z→Epic 1→epic_branch_created→repos=. from=a1b2c3d
2026-05-18T13:55:11Z→Epic 1→epic_branch_checked_out→repos=. head=a1b2c3d
2026-05-18T13:56:00Z→Epic 1→sprint_planning_complete→model=claude-opus-4-7
2026-05-18T13:56:30Z→Epic 1→retro_review_skipped→reason=no_predecessor_no_deferred_work
2026-05-18T14:23:11Z→Story 1.5→story_created→path=_bmad-output/implementation-artifacts/story-1.5.md spec_tokens=4820
2026-05-18T14:24:02Z→Story 1.5→dev_complete→spawn_at=2026-05-18T14:23:30Z model=claude-opus-4-7 files=src/render/render-engine.ts,src/types/branded.ts loc_added=412 loc_removed=18 clarifications=1 nfr_tripwires=0 cycle_iteration=1 closing_sections_present=true
2026-05-18T14:25:00Z→Story 1.5→adr_verifications_complete→tool=chrome_devtools_mcp ac=ac5 result=pass model=claude-opus-4-7
2026-05-18T14:29:47Z→Story 1.5→qa_complete→spawn_at=2026-05-18T14:25:30Z model=claude-sonnet-4-6 tests=tests/render/render-engine.test.ts tests_added=14 first_run_failures=2 clarifications=0 closing_sections_present=true
2026-05-18T14:33:18Z→Story 1.5→cr_complete→spawn_at=2026-05-18T14:30:15Z model=claude-opus-4-7 resolved=2 deferred=0 dismissed=0 high=1 med=1 low=0 clarifications=0 closing_sections_present=true
2026-05-18T14:34:00Z→Story 1.5→smoke_complete→method=browser result=pass iterations=1 defects_caught=0 evidence=path/to/screens/ model=claude-opus-4-7
2026-05-18T14:34:30Z→Story 1.5→committed→sha=abc1234 submodules=
2026-05-18T18:02:11Z→Epic 1→epic_merged_to_feature→repos=. feature_sha=def5678 merge_sha=fed8765 submodules=
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
- **Committing directly to `main`, `master`, or `develop`** — Rule SC-6 forbids this absolutely from within `/epic-cycle`. Story commits, retrospective document commits, hotfixes — every commit produced by the workflow lands on `epic{N}` and reaches the protected trunks only through the explicit Rule SC-4 merge gate (epic → feature) followed by an out-of-band PR (feature → develop/main).
- **Creating the feature branch silently** — Rule SC-1 mandates STOPping and asking the user for the TICKET, Description, and branch root when the feature branch is missing. Picking defaults silently is how `feature/undefined_undefined` ends up on remotes.
- **Skipping the Source Control Branching gates on a "resume" assumption** — Mid-epic resume should find the branches already in place. If they're missing, that's a workspace-integrity error per Rule SC-2's resume semantics — halt and surface, do not silently re-create. Silent recreation orphans prior commits.
- **Forgetting that submodules need their own `epic{N}`** — Rule SC-2 applies per repo. The parent's `epic{N}` is not authoritative for the submodules; each submodule has its own. The pre-commit branch assertion (Rule SC-3) covers each affected repo independently.
- **Running parallel epics in a single working directory** — Git only allows one HEAD per working tree. Parallel agents must use `git worktree add` (recommended) or separate clones, per Rule SC-8. Attempting parallelism in one working directory ends in constant branch-switches that corrupt each agent's file state.
- **Auto-resolving merge conflicts at the SC-4 gate** — Three-way-merge conflicts at end-of-epic (whether from a parallel epic, a hotfix, or any drift on feature) must always be surfaced to the user. Git's auto-resolution heuristics can silently drop intentional changes. Per Rule SC-8.

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

7. **The slash command contains every section:** open `.claude/commands/epic-cycle.md` and confirm presence of: Pre-flight Runtime Check, Task Sequence, Permission Mode, Skill Tool Invocation, Agent Invocation Pattern (with Spawn Prompt Skeleton, Stage-specific rule blocks, Clarification protocol, Pipeline Flow, Smart Parallelism, Per-Story Smoke, Retrospective Review & Story X.0 Creation, **Source Control Branching** (with Rules SC-1 through SC-8 and the Tracker format flexibility subsection), **Resume Semantics**, Sprint Planning Per Epic, Retrospective Per Epic, Lead Creates Story Files, Context Handoff Between Stages, ADR-Aware Execution), When to Pause, Handling Clarifications, Submodule / Sub-Repository Commit Order, Completion Logging, **Workflow Telemetry**, Anti-Patterns, Lessons Learned.

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
