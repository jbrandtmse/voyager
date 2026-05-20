# Epic Development Cycle Slash Command

## Pre-flight: Agent Teams must be enabled

**Requires Claude Code v2.1.32 or later.**

**Before doing anything else, verify that the Claude Code Agent Teams feature is enabled in this session.**

Agent Teams is experimental and **disabled by default** in Claude Code at this writing. This entire workflow depends on it — the lead spawns named agents and coordinates them via `SendMessage`, which only works when the flag is on. Reference: <https://code.claude.com/docs/en/agent-teams>.

### Step 1 — Check whether it's already enabled

Confirm that the `Agent` tool accepts a `name:` parameter and that tools like `SendMessage`, `TeamCreate`, and `TeamDelete` are available in this session. If they are, Agent Teams is already on — skip to "Proceed" below.

If those tools are missing, **stop immediately**. Do not attempt to run the workflow with single-agent fallbacks; the design assumes named, addressable teammates.

### Step 2 — Enable Agent Teams

The flag must be set **before** Claude Code launches. The current session cannot turn it on mid-run. The user has two options:

**Option A (recommended) — let Claude Code do it for you.** Tell Claude Code:

> "Use the `update-config` skill to set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `settings.json`."

Claude Code will edit `~/.claude/settings.json` (or the project-local `.claude/settings.json`) to add:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

**Option B — edit `settings.json` manually.** Open `~/.claude/settings.json` (or `.claude/settings.json` for project-only scope) and add the `env` block above. Save the file.

### Step 3 — Restart Claude Code

After the flag is written, **fully exit and relaunch Claude Code**. Environment variables are read at startup; the running session will not see the change.

### Step 4 — Re-run this prompt

Once relaunched, re-run this prompt from the top. The pre-flight check should now pass and the workflow can proceed.

### Proceed

If Agent Teams is confirmed enabled in this session, continue with the workflow below.

---

Develop a slash command that executes the BMAD Method development implementation cycle, using Agent Teams, across all stories in an Epic (or a range of Epics). Stories run sequentially by default; independent stories within the same epic may be processed as a parallel batch — see "Smart Parallelism" below. The task sequence is:

**Per Epic (setup, executed once per epic before any stories):**
1. **Lead** executes `/bmad-sprint-planning` directly (ensures sprint-status.yaml is current).
2. If a previous epic's retrospective or `deferred-work.md` has unresolved items, **Lead** reviews them, triages, and creates Story X.0 via `/bmad-create-story` (see "Retrospective Review & Story X.0 Creation" below).

**Per Story (executed once per story in the epic):**
1. **Lead** executes `/bmad-create-story` directly (no agent — prevents race-ahead).
2. Agent: `/bmad-dev-story`.
3. Agent: `/bmad-qa-generate-e2e-tests` (once the story is developed by the previous agent).
4. Agent: `/bmad-code-review` (once dev and QA tests are complete).
5. **Lead**: commit and push to git.

**End of Epic (executed once per epic after all stories):**
1. **Lead** pauses and asks user: "Would you like to run a retrospective?" If yes, execute `/bmad-retrospective` **in interactive mode, not YOLO** — the skill must actually ask its questions and wait for real user answers; auto-answering them produces a worthless artifact. (`bypassPermissions` for tool calls is fine; what matters is the skill's elicitation flow reaches the user.)

Create a slash command file at `.claude/commands/epic-cycle.md` that is **self-contained** — it must embed the workflow inline and must not reference this document. After the file is created, this design document (`epic-cycle-teams.md`) can be deleted. See "Slash Command File" below for the construction recipe.

## Slash Command File

The slash command file **must be self-contained**. The lead reading this document is responsible for constructing the slash command body by embedding the workflow inline, NOT by linking to this document. After validation (see below), this document can be deleted without affecting `/epic-cycle`.

Create `.claude/commands/epic-cycle.md` at the project root with frontmatter plus a body constructed per the recipe below.

### Frontmatter (verbatim)

```markdown
---
description: Run the BMAD Method epic development cycle for one or more epics using Agent Teams
---
```

### Body construction recipe

The body is built by copying sections of THIS document into the slash command file, with three adjustments to convert design-doc content into a runnable workflow.

**Adjustment 1 — Replace the opening.** Drop the "Develop a slash command that executes..." line from this document (it's an instruction TO Claude-as-doc-reader, not part of the workflow). Replace with this executor-directed opening as the first content in the body:

```markdown
You are executing the BMAD Method development implementation cycle for one or more epics, using Claude Code Agent Teams. Stories run sequentially by default; independent stories within the same epic may be processed as a parallel batch — see "Smart Parallelism" below.

**Epic range:** $ARGUMENTS (e.g., `1-3` for Epics 1 through 3, `2` for a single epic). If empty, prompt the user for the range before proceeding.
```

**Adjustment 2 — Replace the four-step Pre-flight section with a condensed runtime check.** The four-step Pre-flight in this document is user-facing setup ("how to enable Agent Teams"). The slash command body only needs a runtime tool-availability check. Use this:

```markdown
## Pre-flight Runtime Check

Verify that `SendMessage`, `TeamCreate`, and `TeamDelete` tools are available in this session. These are deferred tools; if they are not in your active tool set, load them by calling `ToolSearch` with query `"select:SendMessage,TeamCreate,TeamDelete"` before first use.

If any of these tools cannot be loaded (Agent Teams flag is disabled in this Claude Code installation), halt immediately with:

> "Agent Teams is not enabled. Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `~/.claude/settings.json` (or `.claude/settings.json` for project-local scope), fully exit and relaunch Claude Code (v2.1.32 or later), then re-run /epic-cycle."

Requires Claude Code v2.1.32 or later.
```

**Adjustment 3 — Include all remaining workflow content verbatim**, in this exact order:

- The three task-sequence numbered lists (Per Epic / Per Story / End of Epic — the same three lists that appear in this document right after the "Develop a slash command..." line)
- `## Execution Guidelines`
- `## Permission Mode (Critical)`
- `## Skill Tool Invocation (Critical)`
- `## Spawn-on-Demand Coordination (Critical)` with every subsection in order:
  - `### Team Lifecycle (Required)`
  - `### Task-in-Prompt Pattern (Required)`
  - `### Pipeline Flow`
  - `### Smart Parallelism (Opt-In Per Batch)`
  - `### Per-Story Smoke (Critical Gate)`
  - `### Retrospective Review & Story X.0 Creation (Critical Gate)`
  - `### Sprint Planning Per Epic (Critical Gate)`
  - `### Retrospective Per Epic (User Decision Point)`
  - `### Lead Creates Story Files (Critical Gate)`
  - `### Context Handoff Between Stages (Critical)`
  - `### ADR-Aware Execution (Required)`
  - `### Shutdown-Before-Respawn Sequencing (Critical)`
  - `### Agent Silence Recovery (Required)`
  - `### Agent Prompt Requirements`
- `## When to Pause`
- `## Handling Clarifications`
- `## Submodule Commit Order (Critical, if Applicable)`
- `## Completion Logging` (including the `### Cycle Log Format (enables resume)` subsection)
- `## Anti-Patterns (Do NOT Use)`
- `## Lessons Learned (Accumulated From Prior Project Runs)`

**Sections from this document that are EXCLUDED from the slash command body** (they are scaffolding for creating the slash command, not workflow content):

- The original `## Pre-flight: Agent Teams must be enabled` section and its four sub-steps (Adjustment 2 replaces them with the condensed runtime check)
- The "Develop a slash command that executes..." opening paragraph (Adjustment 1 replaces it)
- The "Create a slash command file at..." line that precedes this Slash Command File section
- This entire `## Slash Command File` section (these are the build instructions, not part of the workflow)

### Validation (mandatory before considering the slash command file complete)

1. Run `grep "epic-cycle-teams.md" .claude/commands/epic-cycle.md`. The result must be **zero matches**. Any match means the body still references this design document and is NOT self-contained — fix and re-validate.
2. Confirm the file contains: frontmatter; the executor-directed opening from Adjustment 1; the Pre-flight Runtime Check from Adjustment 2; and every section listed in Adjustment 3.
3. Optionally: with the slash command file in place, delete `epic-cycle-teams.md` and verify `/epic-cycle` would still function (it relies only on its own body).

### After Creating the Slash Command

Once the slash command file is constructed and validated, **stop**. Do not proceed to execute the epic-development workflow in the same session that created the slash command. The user will invoke `/epic-cycle <range>` in a fresh session to run the workflow.

### Invocation

`/epic-cycle 1-3` (or whatever range you want), or `/epic-cycle` to be prompted. `$ARGUMENTS` in the body is replaced by whatever the user typed after the slash-command name.

## Execution Guidelines

**IMPORTANT:** Each task should be executed in Agent Teams using the **spawn-on-demand** pattern.

Automatically resolve all high and medium severity issues found during code review using your best judgment and BMAD guidance.

Stories are to be documented/updated consistently with the instructions in each Skill.

**IMPORTANT:** The BMAD method skills must be used /bmad-create-story, /bmad-dev-story, /bmad-qa-generate-e2e-tests, /bmad-code-review. Don't skip any steps other than the fact that we are doing this in YOLO mode. **The one exception is `/bmad-retrospective`, which MUST be run in interactive mode — its elicitation prompts have to reach the user and get real answers. (Permission mode is unrelated; `bypassPermissions` for tool calls is still fine.) See "Retrospective Per Epic" below.**

## Permission Mode (Critical)

**All agents must be spawned with `mode: "bypassPermissions"`** — this is YOLO mode. Agents should not prompt for file edits, bash commands, or tool permissions. Without this, the pipeline stalls on every file write waiting for human approval.

**`/bmad-retrospective` is the one step whose elicitation prompts must reach the user.** The mechanism: when the **lead** invokes the skill itself via the `Skill` tool (not via a spawned agent), the skill's `AskUserQuestion` calls route directly to the user. `bypassPermissions` does NOT auto-answer `AskUserQuestion` — that tool always elicits the human. Spawned agents are subagents and cannot reliably surface their elicitation to the user, so this skill must be executed by the lead directly. See "Retrospective Per Epic" below.

## Skill Tool Invocation (Critical)

All BMAD skills (`/bmad-create-story`, `/bmad-dev-story`, `/bmad-qa-generate-e2e-tests`, `/bmad-code-review`) must be invoked via the **`Skill` tool**, not interpreted inline. Agent prompts must explicitly state: "use the `Skill` tool to invoke /bmad-dev-story". Without this directive, agents may attempt to execute the skill logic themselves rather than delegating to the skill definition.

## Spawn-on-Demand Coordination (Critical)

**Do NOT create, update, or read tasks via the task list system** (`TaskCreate`, `TaskUpdate`, `TaskList`). Note that `TeamCreate` automatically provisions an empty TaskList directory alongside the team — that's unavoidable but harmless **as long as no tasks are ever written to it**. Agents poll TaskList on every wake-up and will self-schedule from any non-empty list regardless of prompt instructions, `blockedBy` constraints, or task ownership; keeping the list empty is what prevents self-scheduling. This behavior cannot be overridden by prompt text alone.

Instead, the lead tracks pipeline state directly from the epic story list and coordinates agents via **spawn-on-demand**.

### Team Lifecycle (Required)

Agent Teams is a stateful subsystem. Before the lead can spawn any named teammate, a team must exist; at the end of the workflow run, the team should be deleted to avoid accumulating state under `~/.claude/teams/`.

**Once per workflow run (not per epic), before the first agent spawn:**

```text
TeamCreate({
  team_name: "epic-cycle-<epoch-or-date>",   // e.g. "epic-cycle-2026-05-18"
  agent_type: "team-lead",
  description: "Epic Development Cycle: Epics <range> for project <name>"
})
```

Use a unique `team_name` per workflow run (date-stamped or epoch-stamped) so multiple runs don't collide. The lead is implicitly the team-lead; teammates are joined via the `Agent` tool's `team_name` and `name` parameters during spawn.

**Once per workflow run, after the last epic's retrospective (or skip) completes:**

```text
// Confirm no teammates are still alive (all stories' shutdown handshakes are complete).
TeamDelete()  // operates on the current session's team context; takes no team_name arg
```

`TeamDelete` will fail if any teammate is still active — make sure every spawned agent has been shut down via the documented shutdown-before-respawn sequence before calling it.

### Task-in-Prompt Pattern (Required)

Embed the task directly in the agent's spawn prompt rather than using SendMessage after spawning. SendMessage delivery is unreliable — agents sometimes go idle without picking up messages — so this is the required pattern; there is no fallback. See the Anti-Patterns list for the explicitly-forbidden alternatives.

For each pipeline step, the lead:

1. **Spawns** a fresh agent via the `Agent` tool with:
   - `team_name: <the team created in Team Lifecycle>` (required — joins the agent to the team so SendMessage can reach it by name)
   - `name: <unique-per-story>` (see step 2)
   - `mode: "bypassPermissions"`
   - `prompt: <full task embedded in the spawn prompt>` (Task-in-Prompt; no SendMessage at spawn time)
2. **Uses unique names** per story: `dev-{epic}-{story}`, `qa-{epic}-{story}`, and `cr-{epic}-{story}` (e.g., `dev-2-3`, `qa-2-3`, `cr-2-3`) — never reuse generic names like `developer`, `qa`, or `code-reviewer`
3. **Waits** for the completion message
4. **Shuts down** the agent via `SendMessage({to: "<agent-name>", message: {type: "shutdown_request"}})` (structured message; no `summary` needed for structured messages — `summary` is required only when the message is a plain string)
5. **Waits for shutdown approval** — the agent responds with `shutdown_response: approve=true`; do NOT spawn the next agent with the same name until that response arrives (prevents name collisions)

This completely eliminates self-scheduling — terminated agents can't poll TaskList.

### Pipeline Flow

```
Lead calls TeamCreate({team_name: "epic-cycle-<date>", agent_type: "team-lead", description: "..."})  // once per workflow run
Lead resolves project ADR registry path (typically docs/adr/) — persisted for every spawn prompt and per-story Layer-1 gate; see ADR-Aware Execution

For each epic in range:
  Lead executes /bmad-sprint-planning via Skill tool (ensures sprint-status.yaml is current)
  Lead logs sprint planning completion
  If Epic N-1 retrospective exists OR deferred-work.md has unresolved items:
    Lead reads both sources (retrospective if present, deferred-work.md if present)
    Lead triages all action items and deferred findings
    Lead creates Story X.0 via /bmad-create-story (even if all items deferred — documents triage)
    Lead logs retrospective review completion
  Else (both sources empty/absent):
    Lead logs "no triage source found — skipping Story X.0 review"

  For each story (or batch of independent stories — see Smart Parallelism) in order (including X.0):
    Lead executes /bmad-create-story skill directly via Skill tool (pipeline gate) — sequentially for every story, even within a parallel batch
    Lead captures story file path from skill output
    Lead spawns developer → dispatches with story file path → waits for completion (captures file list) → shuts down → waits for shutdown approval
    Lead executes ADR-tooled AC verifications via project's MCP servers (lead-side, sequential per AC); logs adr_verifications_complete (see ADR-Aware Execution)
    Lead spawns qa-test-author → dispatches with file list from developer → waits for completion (captures test file list) → shuts down → waits for shutdown approval
    Lead spawns code-reviewer → dispatches with combined file list (dev files + QA test files) → waits for completion → shuts down → waits for shutdown approval
    Lead performs per-story smoke (mandatory, method varies by project type — see Per-Story Smoke); logs smoke_complete
    Lead does feat commit + push (submodules first if applicable, then parent — see Submodule Commit Order)
    Lead logs completion → next story (or next batch)

  Lead pauses: "Would you like to run a retrospective?" → if yes, execute /bmad-retrospective via Skill tool — lead runs the skill itself so its AskUserQuestion calls reach the user (do not spawn an agent for this)
  Lead logs epic completion → next epic

Lead calls TeamDelete()  // once per workflow run, after all spawned agents have been shut down
```

### Smart Parallelism (Opt-In Per Batch)

When the lead can confirm that two or more stories within the same epic touch **disjoint files** and have **all prerequisites already committed**, the lead may run them as a **parallel batch** to reduce wall-clock time. Parallelism is opt-in per batch — when in doubt, run sequentially. The full eligibility test is below ("Independence test").

**What stays sequential (no exceptions):**

- **Story-file creation** — `/bmad-create-story` runs in the lead, one story at a time, for every story in the batch *before* any agent is spawned. This preserves the pipeline-gate discipline that prevents agents from racing ahead.
- **Commits and pushes** — git operations are serialized one story at a time. In sequential mode the commit fires immediately after each story's `smoke_complete`. In parallel-batch mode commits fire after the batch's smoke-barrier releases — the lead then commits each batch member in story order, one at a time. Either way, no two git operations interleave; this avoids merge conflicts and keeps the cycle log readable.
- **Sprint planning, retrospective review, Story X.0 creation, and per-epic retrospective** — all single-threaded.
- **ADR-tooled AC verifications (Layer 1 of ADR-Aware Execution)** — single-threaded per story even within a parallel batch. The lead drives the project's MCP servers (Chrome DevTools MCP, etc.) sequentially across batch members to avoid context-channel collisions.
- **Per-story smoke** — single-threaded per story even within a parallel batch. The smoke method (browser, CLI invocation, API call, etc.) varies per project; whichever method the project uses, the lead runs it for one story at a time across batch members.

**What runs in parallel:**

For a batch of N independent stories, the lead spawns **N independent (dev → qa → code-review) pipelines** concurrently. Each pipeline is a sequential chain of three agents with unique names per story (`dev-{epic}-{story}`, `qa-{epic}-{story}`, `cr-{epic}-{story}`). Within each chain, agents still run sequentially with shutdown-before-respawn — only the chains themselves run alongside one another.

**Independence test (all three must hold):**

A set of stories is eligible to run as a parallel batch only if:

1. **Disjoint files** — no two stories in the batch will modify the same file. The lead determines this by reading the story specs' acceptance criteria and Previous Story Intelligence sections; if any uncertainty, the batch is not parallelizable.
2. **Same epic** — parallelism does not cross epic boundaries (sprint planning, Story X.0, and retrospective are per-epic single-threaded gates).
3. **All prerequisites already committed** — for each story in the candidate batch, every story it references as a prerequisite (in the story spec's `Previous Story Intelligence`, `Dependencies`, or equivalent section) must already be at `committed` stage in the cycle log. This catches both within-batch and outside-batch dependencies: a story cannot be parallelized with its own prerequisite (the prerequisite isn't committed yet), and a story whose external prerequisite is still in-flight is also ineligible. Foundation stories (those many later stories cite as prerequisites) end up sequential at the start of an epic naturally — no special "foundation" flag needed.

If any of these fail, run those stories sequentially.

**Batch flow:**

```
Lead identifies parallel batch [S_a, S_b, S_c] meeting all three independence criteria
Lead executes /bmad-create-story for S_a, then S_b, then S_c (sequentially — pipeline gate stays)
Lead spawns dev-{epic}-a, dev-{epic}-b, dev-{epic}-c concurrently with task-in-prompt
Lead waits for ALL dev completions (captures three file lists), then shuts down all three devs
Lead executes ADR-tooled AC verifications for S_a, then S_b, then S_c sequentially (lead-side, not parallelized); logs adr_verifications_complete per story
Lead spawns qa-{epic}-a, qa-{epic}-b, qa-{epic}-c concurrently with respective file lists
Lead waits for ALL qa completions (captures three test file lists), then shuts down all three qas
Lead spawns cr-{epic}-a, cr-{epic}-b, cr-{epic}-c concurrently with combined file lists
Lead waits for ALL code-review completions, then shuts down all three reviewers
Lead performs per-story smoke for S_a, then S_b, then S_c sequentially (lead-side, not parallelized — see Per-Story Smoke); logs smoke_complete per story
Lead commits + pushes S_a, then S_b, then S_c (sequentially — submodules first per story if applicable)
Lead logs all three completions → next story or next batch
```

The **batch barrier** — the lead waits for all N agents of the same stage before moving to the next stage — is mandatory. Do not let one story's code-reviewer start while another story's developer is still running; the file-list handoff would be corrupted, and a code-reviewer running against partial output of a still-active developer is meaningless.

**Conservative default:** If the lead cannot quickly and confidently identify a parallel batch, default to sequential execution. The discipline of the rest of the workflow depends on predictable single-threaded progress; parallelism is an optimization, not a requirement.

**Resume policy for interrupted batches:** If a parallel batch is interrupted mid-flight (process killed, session crashed, network failure), the lead resumes by inspecting the cycle log (see Completion Logging § Cycle Log Format) and `sprint-status.yaml`:

1. For each story in the batch, determine the latest completed stage from the cycle log: `story_created` / `dev_complete` / `qa_complete` / `cr_complete` / `committed`.
2. Identify the **earliest incomplete stage across the batch** — this is the resume point.
3. Re-spawn ONLY the agents needed for stories that haven't yet reached the resume stage. Stories already past the resume stage skip this stage and wait at the next batch barrier.
4. **Fallback (always safe):** if the resume state is ambiguous, fall back to sequential resume — process the batch's remaining stories one at a time in story order until the next natural batch boundary.

Sequential resume is always safe; parallel resume is an optimization. When in doubt, resume sequentially.

**Write-ahead rule (prevents resume-time duplicate work):** The lead must write the cycle log entry for a completed stage **before** taking the next action that depends on that completion. Concretely:

1. Agent sends `STATUS: completed` → lead receives.
2. Lead appends the cycle log entry for that stage via the `Write` (or `Edit`) tool. The Write tool returns only after the file has been committed to the OS; no additional flush primitive is available to or required from the lead.
3. *Only then* does the lead initiate the shutdown handshake, spawn the next stage's agent, or perform a git commit.

If a crash occurs after step 1 but before step 2, the agent is dead (process gone), the work is on disk, but the cycle log doesn't reflect the completion — on resume the lead re-spawns the agent for that stage. This is acceptable for dev/qa stages (idempotent re-implementation against the same story spec) but **NOT acceptable for the commit stage** (would produce a duplicate commit). For the `committed` stage specifically: write the log entry immediately after `git push` returns success, before any other action. If the crash happens between `git push` success and log write, on resume the lead inspects `git log --oneline` against the expected story files; if a matching commit exists, the lead writes the missing log entry and proceeds. Do NOT re-run the commit.

### Per-Story Smoke (Critical Gate)

After a story's code review completes (and any HIGH/MED findings are resolved) and before the lead commits the story, the lead must perform a **per-story smoke** — a direct exercise of the story's deliverable in its target runtime. The smoke step is **mandatory**; only the *method* varies by project type. The smoke is performed by the **lead**, not by a spawned agent, for the same reason ADR-tooled verifications are lead-side: the lead reliably has access to the project's runtime tooling (MCP servers, dev server, CLI, deployment environment), while subagents may not.

**Method selection — pick the smoke method that matches the deliverable's runtime:**

- **UI / browser-deployed projects** — Drive the dev server (or a deployed build) via a browser-automation MCP (e.g., Chrome DevTools MCP). Navigate to the affected surface, exercise the feature the story adds or modifies, and assert on observable DOM / render state / console output. For 3D / graphics projects, this includes screenshotting and verifying actual visual change frame-over-frame.
- **CLI / library projects** — Invoke the CLI command, or call the public test method, against a real runtime. Assert on stdout / stderr / return code / produced files. A library-only deliverable still needs a smoke: write a one-off call site exercising the new public surface and verify the result.
- **Service / API projects** — Issue a real `curl` / HTTP request against the local server (or staging) and assert on status code + response body. Side effects (DB writes, queue publishes, etc.) should be verified by inspecting the side-effect surface, not just the response.
- **Other** — Whatever exercise mirrors how the deliverable will be used in production. The minimum bar is "the lead actually invoked the new code path against a real runtime, and observed the expected outcome via an out-of-band channel."

The smoke is NOT a substitute for the automated test tiers (unit, integration, E2E); it is a final check that the wired-up system, end to end, produces the user-observable outcome the story promises. Automated tests verify components in their tested boundary; the smoke verifies that the boundary is wired up to reality.

Mechanics:

1. After `cr_complete` (with all HIGH/MED findings resolved), the lead determines the appropriate smoke method for the story based on what the story touched (the story's File List and ACs make this routine — UI files imply browser smoke, CLI files imply CLI invocation, etc.).
2. The lead executes the smoke directly, capturing evidence (screenshots, stdout, response body, etc.).
3. If the smoke fails, the lead does NOT commit. The lead either (a) surfaces the failure to the user for guidance, or (b) creates a follow-up dev pass to fix the defect, then re-runs the smoke. Failed smoke cannot be deferred to a later story — it is a HIGH-severity finding that must clear before commit.
4. On success, the lead appends a cycle-log entry: `<UTC> TAB Story <id> TAB smoke_complete TAB method=<browser|cli|api|other> result=pass evidence=<path-or-summary>`.
5. Lead proceeds to commit.

The smoke step is single-threaded across a parallel batch (see Smart Parallelism § What stays sequential). The lead smokes each story in story order before any commits in the batch begin.

This gate was elevated to mandatory after a project's Epic 1 ship-readiness review found four HIGH-severity defects (broken core feature, missing decoder configuration, ARIA mojibake, ARIA value-bound rendering) that every automated tier had passed; only a real browser session surfaced them. The test pyramid is necessary but not sufficient; the smoke step is the bridge from "tests pass" to "the product works."

### Retrospective Review & Story X.0 Creation (Critical Gate)

After sprint planning and before building the story list, the lead must review the previous epic's retrospective and create a cleanup story. **This step is mandatory** — it closes the feedback loop between retrospectives and sprint planning, ensuring deferred items are systematically triaged rather than silently dropped.

1. **Calculate previous epic number** — if processing Epic N, look for Epic N-1's retrospective.
2. **Search for the retrospective file**: the convention used here is `_bmad-output/implementation-artifacts/epic-{N-1}-retro-*.md`. Before relying on this pattern, verify it matches what your project's `/bmad-retrospective` skill actually writes — check the skill's SKILL.md, output template, or inspect a known-good retro file from a prior epic. If multiple matches exist (re-runs), select the latest by file modification time; tie-break by lexicographic filename so explicit version suffixes (`-v2`, `-final`) win over earlier matches. Log which file was selected.
3. **If a retrospective exists**, read it and extract:
   - All **action items** (with status: completed, in-progress, not addressed)
   - All **deferred review findings** from that epic's stories
   - Any **preparation tasks** recommended for the current epic
4. **Also read `_bmad-output/implementation-artifacts/deferred-work.md`** (if it exists) to collect any centralized deferred items not yet resolved.
5. **Triage every item** into one of three categories:
   - **Include in Story X.0** — items relevant to the current epic's codebase or blocking quality
   - **Explicitly defer with rationale** — items not relevant yet (e.g., belongs to a future epic)
   - **Drop** — items already resolved or no longer applicable
6. **Create Story X.0 in two steps** (the `Skill` tool's `args` parameter is a single string and cannot carry a multi-line triage body):
   - **Step 6a (skill invocation):** Invoke `/bmad-create-story` via the `Skill` tool with `args` set to a brief title string, e.g., `"Story {N}.0: Epic {N-1} Deferred Cleanup"`. Capture the resulting story file path from the skill's output.
   - **Step 6b (body editing):** Append the full triage table to the created story file via the `Edit` or `Write` tool. Table format: one row per item with columns `Item` | `Source` (retro or `deferred-work.md`) | `Triage Decision` (include / defer with rationale / drop). Include a header section noting which Epic N-1 the triage covers and the date.

   If ALL items are triaged as defer/drop, still create the X.0 story to document the decision.
7. **Skip Story X.0 ONLY if both sources are empty.** If no previous retrospective exists (e.g., Epic 1, or retro was skipped) AND `deferred-work.md` is missing or contains no unresolved items: log that no triage source was found and skip Story X.0 creation. If a retrospective is missing but `deferred-work.md` has unresolved items, do NOT skip — still execute the triage (step 5) and create Story X.0 (step 6) using only the `deferred-work.md` source. Orphaning unresolved items because the retro is absent is itself the failure mode that made this gate mandatory.
8. Log the retrospective review and Story X.0 creation in the cycle log.

This gate was elevated from optional to mandatory after a prior project's mid-run retrospective revealed that skipping Story X.0 caused deferred items to silently accumulate across multiple epics with no triage.

### Sprint Planning Per Epic (Critical Gate)

Before processing any stories for an epic, the lead must run sprint planning:

1. Execute `/bmad-sprint-planning` directly via the `Skill` tool (NOT via an agent).
2. This ensures `sprint-status.yaml` (conventionally located at `_bmad-output/implementation-artifacts/sprint-status.yaml` — verify your project's actual path from the sprint-planning skill's SKILL.md or output) is current, all stories are tracked, and any status mismatches are caught.
3. If sprint planning surfaces a blocking issue, pause and inform the user before proceeding. A **blocking issue** is any one of: a story listed in `epics.md` but missing from `sprint-status.yaml` (or vice versa); a status mismatch where the same story shows different statuses in the two sources; a schema-validation error in `sprint-status.yaml`; or any case where the skill's own output explicitly flags an inconsistency for human review. Routine updates (newly-discovered stories appended, previously-completed stories marked done) are not blocking — they reflect normal progress and the lead proceeds.
4. Log sprint planning completion in the cycle log.

This is a pipeline gate — stories should not be processed until sprint planning confirms the epic's story list is accurate.

### Retrospective Per Epic (User Decision Point)

After all stories in an epic are complete, the lead must pause for the user:

1. Announce epic completion and ask: "Epic X is complete. Would you like to run a retrospective before moving to the next epic? (yes/no)"
2. **Wait for the user's response.** Do NOT proceed automatically.
3. If **yes**: Execute `/bmad-retrospective` directly via the `Skill` tool, **in interactive mode**. Wait for completion before continuing.
4. If **no**: Log that the retrospective was skipped. Continue to the next epic.

**Elicitation must reach the user.** The retrospective is a human-in-the-loop step — it asks the user to reflect on what went well, what went poorly, and which deferred items to carry forward. The mechanism that delivers questions to the user is `AskUserQuestion`, which always elicits the human regardless of `bypassPermissions`. The constraint: the **lead** must execute the skill, not a spawned agent.

Concretely:
- The lead invokes `/bmad-retrospective` itself via the `Skill` tool — do NOT spawn an agent for it. Spawned agents cannot reliably surface `AskUserQuestion` to the user.
- When the skill issues an `AskUserQuestion` call, it will appear to the user directly; wait for the user's actual answer and let the skill continue.

Retrospectives surface deferred work, process improvements, and preparation tasks for the next epic. They also update `deferred-work.md` and may create cleanup stories (Story X.0 pattern).

### Lead Creates Story Files (Critical Gate)

The lead executes `/bmad-create-story` directly via the `Skill` tool — NOT via an agent. This is a deliberate pipeline gate that prevents agents from racing ahead. **Capture the story file path** from the skill output to pass to the developer agent.

**Integration AC validation (lead-side, also a gate).** Before the lead spawns the dev agent for a story, the lead reads the story file's ACs and asks: does this story introduce a service, module, or component that later stories (in this or any future epic) will consume? Indicators include: a new file under `services/` or `lib/`; a new exported class / factory / module; a `## Consumed-by` field naming downstream stories; or any AC describing a public surface other stories will call against.

If yes — the story is **service-introducing** — it MUST contain at least one **Integration AC** of the form: "consumer X reads from this service / module / component and produces observable effect Y." If a `## Consumed-by` field is also present, even better — it names every downstream story that will hold the consumer's mirror-side integration AC.

If the story is service-introducing AND lacks an integration AC, the lead pauses for the user before spawning the dev agent:

> "Story <id> introduces <service-name>. No Integration AC found in its ACs. Re-run `/bmad-create-story` to populate `## Integration ACs`, OR proceed without (with the consequence that producer-consumer wire-up defects can ship green)?"

Get the user's decision. Do not proceed silently.

If the story is NOT service-introducing (pure refactor, doc-only, internal cleanup, defect-fix, etc.), this gate is a one-line check that finds no work to do; the lead proceeds to spawn dev as normal.

This gate exists because a prior project's Epic 1 shipped four HIGH-severity defects whose common signature was: a producer story shipped green with the service correct in isolation, and every consumer story shipped green with the consumer behavior mocked; nothing in the test pyramid exercised the wire-up between them. An integration AC on the producer ("RenderEngine reads `simTimeEt` from ClockManager and the rendered ET matches") forces both sides to be wired before either ships; the Per-Story Smoke (lead-side) verifies the wiring in the real runtime. The integration AC is the planning-time catch; the smoke is the last-mile catch. See Lesson 9.

The `/bmad-create-story` skill should ideally refuse to mark a service-introducing story `ready-for-dev` without at least one integration AC (a skill-level enforcement). This workflow gate is defense-in-depth for cases where the skill check fails or the project's skill is older than the integration-AC amendment.

### Context Handoff Between Stages (Critical)

Each pipeline stage produces output that downstream stages need:

The **story file path** is the canonical context anchor and is passed forward to every downstream agent — without it, QA cannot derive acceptance criteria and the code reviewer cannot verify that the implementation met the story's goals.

1. **Story creation → Developer**: The lead passes the **story file path** from `/bmad-create-story` output to the developer agent.
2. **Developer → QA test author**: The developer's completion message must include **all files created/modified with full paths**. The lead passes BOTH the original story file path (so the QA agent can read acceptance criteria) AND the developer's file list to the QA agent.
3. **QA test author → Code reviewer**: The QA agent's completion message must include **all test files created/modified with full paths**. The lead passes the story file path, the developer's file list, AND the QA agent's test file list to the code reviewer (so it can verify all three: acceptance-criteria coverage, implementation correctness, and test adequacy).
4. **Code reviewer → Commit**: The lead uses the union of file lists from the developer and QA agents to stage the correct files for commit. (The story file path itself is also committed if `/bmad-create-story` produced or modified it.)

Without explicit context handoff, downstream agents lack the information to do their job effectively.

### ADR-Aware Execution (Required)

Projects with an Accepted-Decisions registry (typically `docs/adr/` for ADRs, but verify your project's actual path) commit to specific tooling, methodology, and architectural patterns that constrain HOW agents do their work, not just WHAT they produce. An AC satisfied by the wrong tool stack is equivalent to a HIGH-severity defect — it violates an Accepted ADR.

Two-layer enforcement:

**Layer 1 — Lead-executed ADR-tooling gate (between `dev_complete` and `qa_spawn`).**

After the developer's shutdown is approved and before the qa agent is spawned, the lead inspects the story's ACs for any that map to ADR-committed agent-time tooling (visual / precision verification, performance profiling, Lighthouse audits, WebGL state inspection, etc.). For each matched AC, the lead drives the verification itself using its own tool inventory — typically the project's MCP servers (Chrome DevTools MCP, etc., per the relevant ADR).

This gate exists because **MCP tool inventories may not propagate reliably to spawned subagents** — a dev agent reporting "I cannot drive a real WebGL canvas from this environment" may be literally true at its spawn time even when the lead has the MCP fully connected. The lead always has the MCP servers at the session level; relocating the ADR-mandated verification to the lead guarantees access without depending on subagent inheritance. This is the same pattern that locates `/bmad-retrospective` in the lead (because `AskUserQuestion` requires the lead's UI context).

Mechanics:

1. Lead reads the story file (the same path captured at `story_created`).
2. For each AC, lead consults the project's ADR registry (path resolved once per workflow run — see top of Pipeline Flow). If any Accepted ADR commits to a specific tool stack for the work the AC describes, the AC is "ADR-tooled."
3. Lead drives each ADR-tooled AC verification: navigate via `mcp__chrome-devtools-mcp__navigate_page` (or equivalent for the relevant tool), capture screenshots / console / network / perf trace as the ADR or AC requires, record pass/fail + evidence paths.
4. Lead appends one cycle-log entry per story: `<UTC> TAB Story <id> TAB adr_verifications_complete TAB <metadata>` where `<metadata>` is whitespace-separated `key=value` pairs covering each verified AC (e.g., `tool=chrome_devtools_mcp ac=ac5 result=pass evidence=path/to/screens/`). One log line per story regardless of AC count; multi-AC verifications collapse into multi-valued metadata fields per the existing cycle-log grammar.
5. On any failure, the lead surfaces it to the user before spawning qa (the qa stage assumes the implementation is functionally correct; a failed ADR-tooled verification means it isn't).
6. The verification results (pass/fail + evidence pointers) are included in the code reviewer's spawn-prompt context.
7. If the story has zero ADR-tooled ACs (the common case for non-visual stories), this gate is a one-line check that finds no work; lead emits a single `adr_verifications_complete result=none_required` entry and proceeds.

**Layer 2 — Project ADR registry path in every spawn prompt.**

The lead resolves the project's ADR registry path once at the start of the workflow run (after Team Lifecycle setup, before the first sprint planning step) and persists it for the run. The lead includes this path as factual context in every agent spawn prompt (e.g., `Project ADR registry: docs/adr/`). Agents are not required to consult ADRs for tooling decisions (Layer 1 absorbs that responsibility) but they MUST consult them for architectural and methodology decisions referenced in their story's ACs and Dev Notes.

The code reviewer specifically must verify that implementations match the architectural / methodology commitments in Accepted ADRs. An implementation that violates an Accepted ADR is a **HIGH-severity finding**, not a deferrable LOW. The code-reviewer spawn prompt must include an explicit instruction to this effect.

This gate was elevated to mandatory after a prior project's Story 1.5 AC5 (a "Phase 0 reverse-Z precision spike") was deferred to "manual run" when ADR 0010 explicitly committed Chrome DevTools MCP for that exact use case at agent-time. Neither the dev agent nor the code reviewer surfaced the ADR violation; the gap was caught only when a human read the story file and the ADR together.

### Shutdown-Before-Respawn Sequencing (Critical)

After sending `SendMessage(type: "shutdown_request")`, **wait for the shutdown approval message** before spawning the next agent. Agent shutdown is asynchronous — an idle notification may arrive before the shutdown approval. If you spawn a new agent with the same name (e.g., `developer`) before the old one terminates, you get a name collision.

Pattern:
```
Lead sends shutdown_request → may receive idle notification → receives shutdown_approved → safe to spawn next agent
```

### Agent Silence Recovery (Required)

A non-trivial fraction of spawned agents — empirically ~10–12% in real workflow runs — complete their work to disk but fail to send the structured `STATUS: completed` envelope before going idle. The Task-in-Prompt Pattern documents that SendMessage delivery is unreliable; the converse is also true: completion-message delivery from an agent back to the lead is unreliable. When silence happens the lead must NOT block the pipeline waiting for a message that won't arrive. The lead recovers by reconstructing the completion data from on-disk evidence.

**Detection — when to trigger silence recovery:**

Trigger silence recovery when ALL of these hold:

1. The spawned agent reports idle / not-running (via any team status check the lead can run), AND
2. No completion message (`STATUS: completed` or `STATUS: clarification_needed`) has been received for this spawn, AND
3. The lead observes via filesystem inspection (e.g., `git status --short`) that files have been written matching the story's expected file list — so the agent really did do the work, it just didn't announce it.

**When to check:** the lead initiates a silence check at the *later* of (a) 5 minutes after the agent's spawn time, and (b) the moment the lead observes the agent reports idle via team status. Without a timer the lead can wait indefinitely for a message that won't arrive; with one, silence becomes a bounded-time event. The 5-minute floor exists because some stories (dev with large file lists, QA generating many tests) legitimately take minutes; checking too early would false-positive. If the agent is still active at the 5-minute mark, defer the check until it goes idle.

If condition (3) does NOT hold — i.e., the agent went idle WITHOUT writing files — then this is a *different* failure mode (agent stuck, agent errored, agent didn't start). For that case the lead surfaces to the user; do NOT attempt silent-completion recovery on an agent that produced no output.

**Recovery protocol (lead-side, mandatory when silence is detected):**

The protocol follows the same write-ahead rule as the normal pipeline: record the completion in the cycle log BEFORE taking the next action that depends on it. If recovery itself crashes mid-flight, the cycle log already shows the silence event so the next session resumes correctly instead of re-running the silent stage.

1. **Reconstruct the file list** — `git status --short` from repo root; collect modified + new files that match the story spec's `Files to Modify` table. These are the effective `FILES_MODIFIED`. For QA silence, filter to test files (`*.test.ts`, `test_*.py`, etc.) plus files matching the story's `Tests / Subtasks` paths.
2. **Append the cycle-log entry IMMEDIATELY with hygiene metadata** — write the stage's completion record now, before verification or shutdown. Include a `hygiene_issue=<agent>_silent_lead_reconstructed_from_file_evidence` (or similar) metadata key so the silence is visible in the next retrospective. This step is the write-ahead checkpoint — if anything below crashes, the cycle log still shows the silent stage was reached, and the next session resumes from the right point instead of re-running the silent agent.
3. **Run the verification the agent should have run** — for dev silence: `npm test` / `pytest` / project equivalent + typecheck. For QA silence: same, with focus on new test files. For cr silence: read the story's `Review Findings` section if the agent populated it; if not, the lead reads the diff and runs the code-review skill itself directly via the `Skill` tool (lead-driven; same pattern as `/bmad-retrospective`). On verification failure, surface to the user — do NOT silently absorb a verification regression.
4. **Shutdown the silent agent** — `SendMessage shutdown_request` typically works even on an idle agent; the shutdown handshake succeeds even though the completion message never arrived. If shutdown ALSO fails after a reasonable timeout (5 minutes is a sensible default), the lead has two recovery paths:
   - **(a) Version the next spawn's name** — for the next stage at the same story, use a versioned name (e.g., `qa-2-3-v2` instead of `qa-2-3`) to avoid colliding with the still-alive silent agent. Log the rename via cycle-log metadata on the next stage's completion entry: `predecessor_hang=<original-name> renamed_to=<versioned-name>`.
   - **(b) Surface to the user** for guidance. This is the right path when silence has happened 3+ times consecutively in the run — the pattern is bad enough that the user should see it before more spawns burn time. Option (a) is a per-incident workaround; option (b) is the right response to a persistent pattern.

**Do NOT do these things during silence recovery:**

- Do NOT block the pipeline indefinitely waiting for a completion message that won't arrive. Move forward on file evidence.
- Do NOT skip the verification — the lead must actually run the agent's verification step, not just trust the file list. The file list is the *input* to the verification, not a substitute for it.
- Do NOT silently absorb the silence event — it MUST appear in the cycle log so the retrospective can quantify and address it.
- Do NOT use silence recovery as a substitute for properly-wired agent prompts. If silence happens repeatedly across multiple spawns in the same workflow run (say, 3+ in a row), pause and inform the user — the BMAD skill prompts likely need a `STATUS: completed` reinforcement update before continuing.

**Long-term fix is at the skill level, not the workflow level.** The BMAD skill prompts (`/bmad-dev-story`, `/bmad-qa-generate-e2e-tests`, `/bmad-code-review`) should terminate with explicit instructions to send the structured completion message before going idle.

**For BMAD customization specifically:** the completion instruction must be injected via **`activation_steps_append`** in `_bmad/custom/<skill>.toml`, NOT via `persistent_facts`. Persistent facts can be silently overridden by the skill's own natural ending — the spawned agent finishes the skill body without ever hitting the persistent-fact content as a runtime step. `activation_steps_append` adds the instruction as the literal last step of the skill's execution sequence, after every step the skill body itself defines, so the agent actually runs the completion-message step before going idle. If a project's BMAD setup has the structured-completion guidance in `persistent_facts`, expect silence events to persist regardless of how forcefully the spawn prompt repeats the instruction; move the guidance to `activation_steps_append` to actually close the gap.

This subsection is not a permanent feature of `/epic-cycle` — it is a survivability measure for the current state of the BMAD skill ecosystem, and can be retired once skill-level reinforcement is confirmed reliable across consecutive epics.

### Agent Prompt Requirements

**Placement is load-bearing:** the structured-completion block below MUST be the FINAL text in every spawn prompt, after any skill-specific instructions the lead prepends. Some BMAD skills end with their own closing instructions that can override prompt-level guidance injected as `persistent_facts`; placing the completion block last in the prompt itself ensures it is the last thing the agent reads before invoking the skill. This is defense-in-depth — the long-term fix is at the skill level (see Agent Silence Recovery § Long-term fix for the BMAD `activation_steps_append` pattern), but spawn-prompt placement is the workflow-level safety net that works even when the skill-side fix is missing or wrong.

Each agent's spawn prompt must include:

```
**CRITICAL — Single-Task Agent (Task-in-Prompt Mode):**

Your task is fully described in the prompt you have just received. Begin work IMMEDIATELY — do NOT wait for any SendMessage **at spawn time** to deliver your task; none will arrive. The Task-in-Prompt pattern delivers your task in the spawn prompt itself.

(SendMessage IS used later in two cases: the lead may SendMessage a response to a clarification request you initiate — see Clarification protocol below — and the lead will SendMessage a shutdown request at the end. Both of those arrive AFTER you've started work, never at spawn.)

- Execute the workflow using the `Skill` tool to invoke the specified BMAD skill.
- When done, send EXACTLY ONE completion message to the lead in the structured format below. Send NOTHING else (no progress updates, no chatter).
- After sending the completion message, STOP completely.
- Do NOT call TaskList, do NOT look for more work.
- Approve any shutdown request immediately.
- Do NOT use TaskList, TaskCreate, or TaskUpdate.

**Completion message format (mandatory, parseable):**

The completion message must be a single message containing exactly this structure (use literal section headers; preserve order):

​```
STATUS: completed
STORY_ID: <epic.story, e.g., 2.3>
FILES_MODIFIED:
- <full path 1>
- <full path 2>
(or a single line: "(none)" if no files were modified)
TESTS_ADDED:
- <full path 1>
(or "(none)")
DECISIONS:
- <one-line decision summary>
(or "(none)")
ISSUES_ENCOUNTERED:
- <one-line summary of issue and how resolved>
(or "(none)")
​```

**Clarification protocol (use INSTEAD of the completion message when blocked):**

If you encounter ambiguous requirements or need user input, send EXACTLY ONE message in this format and STOP:

​```
STATUS: clarification_needed
STORY_ID: <epic.story>
QUESTION:
<one paragraph stating the question and its context>
​```

Do NOT proceed on guesses. Do NOT send a completion message until the lead has answered the clarification (via SendMessage) AND you have completed the remaining work. After the clarification arrives, resume and eventually send the structured completion message above.
```

## When to Pause

Within each agent in the Agent Team, only pause to ask me a question if:

- The acceptance criteria or requirements are ambiguous
- There are multiple reasonable design options and my preference matters
- Proceeding would risk breaking important constraints (security, compliance, performance, interoperability)

## Handling Clarifications

When an agent needs clarification, it sends a message to the lead instead of a completion message. The lead must handle this correctly:

1. **Do NOT shut down the agent** — it is waiting for a response, not finished.
2. Surface the agent's question to the user in the main conversation, including the Story ID and relevant context.
3. Wait for the user's answer.
4. Relay the user's answer back to the agent via `SendMessage({to: "<agent-name>", summary: "<5–10 word UI preview>", message: "<the user's answer as plain text, framed as a hard constraint>"})`. The `summary` parameter is required for plain-text messages (it's the preview shown in the UI); only structured messages like `shutdown_request` omit it.
5. The agent resumes its workflow and eventually sends a completion message.
6. Proceed with normal shutdown only after receiving the completion message.

**Key distinction:** A clarification message is NOT a completion message. The lead must differentiate between "I'm done, here are the results" and "I have a question, please advise." The structured `STATUS:` field in the message envelope makes this unambiguous — `STATUS: completed` vs `STATUS: clarification_needed`.

**In a parallel batch:** If one agent in a batch sends `STATUS: clarification_needed` while others are still running, the lead surfaces the question to the user *without halting the other agents*. Other agents continue toward their own completion (or clarification) messages, and the lead collects them as they arrive. The clarification-bearing agent stays alive (no shutdown) until the user answers and the lead relays the response via SendMessage; the agent then resumes and eventually sends its completion message. The batch barrier waits for **all** agents — including the clarifying one — to send `STATUS: completed` before the lead advances to the next stage. If the user takes a long time to answer, the other agents simply finish first and idle until the barrier releases.

## Submodule Commit Order (Critical, if Applicable)

**Applies only to projects that use git submodules.** Skip this section if `.gitmodules` is absent or empty in your project root. The example paths used here (`<submodule-path>`) are placeholders — substitute each submodule path from your project's `.gitmodules`.

When stories modify files in submodule directories, the commit and push sequence matters:

1. **Commit and push inside each affected submodule first** (`git -C <submodule-path> add ... && git -C <submodule-path> commit && git -C <submodule-path> push`)
2. **Then commit and push in the parent repo**, staging both parent-repo files and the updated submodule pointers (`git add <submodule-path>`)

If the parent repo is pushed with a submodule pointer that doesn't exist on the submodule's remote, other developers will get checkout failures. Always submodules-first.

After each story, the lead should run `git -C <submodule-path> status --short` for every submodule path listed in `.gitmodules` to determine which (if any) have changes.

## Completion Logging

At the completion of each story, write a brief log entry summarizing:

- Story ID/name
- Files touched
- Key design decisions
- Any issues auto-resolved vs. those that required my input

### Cycle Log Format (enables resume)

In addition to the per-story summary, the lead writes a per-**stage** log entry as each stage completes. Per-stage granularity is what makes resume possible — both for sequential interruption and for parallel-batch interruption (see Smart Parallelism § Resume Policy).

Cycle log file: `_bmad-output/implementation-artifacts/cycle-log-epic-{N}.md` (append-only).

**Format (TAB-separated, exactly five fields):**

```
<UTC-timestamp> TAB Story <id> TAB <stage> TAB <metadata>
```

- Fields are separated by a single literal TAB character (`\t`), not by runs of spaces.
- The **metadata** field is whitespace-separated `key=value` pairs. Values are comma-separated lists when multi-valued; values must NOT contain spaces or tabs (percent-encode if needed). Keys are lowercase snake_case.
- Valid stages, in order: `story_created`, `dev_complete`, `adr_verifications_complete` (optional, between `dev_complete` and `qa_complete` — see ADR-Aware Execution; one line per story regardless of AC count), `qa_complete`, `cr_complete`, `smoke_complete` (mandatory, between `cr_complete` and `committed` — see Per-Story Smoke), `committed`.

**Example** (TABs shown as `→` for visibility; the actual file contains literal tabs):

```
2026-05-18T14:23:11Z→Story 1.5→story_created→path=_bmad-output/planning-artifacts/story-1.5.md
2026-05-18T14:24:02Z→Story 1.5→dev_complete→files=src/render/render-engine.ts,src/types/branded.ts
2026-05-18T14:29:47Z→Story 1.5→qa_complete→tests=tests/render/render-engine.test.ts
2026-05-18T14:33:18Z→Story 1.5→cr_complete→resolved=2 deferred=0
2026-05-18T14:34:05Z→Story 1.5→committed→sha=abc1234 submodules=
```

**Parsing rule:** split each line on TAB into exactly 4 fields; split the metadata field on whitespace into key=value tokens; split each value on `,` for lists. This grammar is unambiguous regardless of how many key=value pairs the metadata holds or how many items a value list contains.

On restart, the lead scans the cycle log for the highest-stage entry per story to compute the resume point.

## Anti-Patterns (Do NOT Use)

These patterns were tested and failed due to agent self-scheduling behavior:

- **TaskCreate/TaskList/TaskUpdate** — Agents poll TaskList on every wake-up and grab tasks regardless of `blockedBy`, prompt instructions, or task ownership
- **Persistent agents between tasks** — Idle agents self-schedule. Always shut down after each task
- **`blockedBy` constraints** — The task system does NOT enforce `blockedBy`. Agents work out of order
- **Lead-owned task parking** — Assigning tasks to "team-lead" is unreliable; agents still find and grab tasks
- **Self-scheduling prompts** — "Do NOT call TaskList" is unreliable; agents have built-in polling behavior that overrides prompt instructions
- **Story-creator agent** — A story-creator agent races ahead to create story files for future stories, enabling other agents to self-schedule. The lead must create story files directly as a pipeline gate
- **Spawning without permission mode** — Without `mode: "bypassPermissions"`, agents prompt for every file edit and bash command, stalling the pipeline
- **Spawning before shutdown confirms** — Reusing an agent name before the previous agent's shutdown is confirmed causes name collisions
- **Inline skill execution** — Agents interpreting skill logic themselves instead of invoking via the `Skill` tool; always specify `Skill` tool usage explicitly in prompts
- **Missing context handoff** — Not passing file lists between stages; code reviewers can't review effectively without knowing which files changed
- **Parent-before-submodule push** — Pushing the parent repo before submodule commits are pushed leaves broken submodule pointers on the remote; always commit and push submodules first
- **Generic agent names** — Using `developer` and `code-reviewer` across stories causes stale shutdown requests to be picked up by new agents. Always use unique names like `dev-2-3`, `cr-2-3`
- **Spawn-then-message pattern** — Agents sometimes go idle without picking up SendMessage dispatches. Task-in-prompt pattern (embedding the task in the spawn prompt) is more reliable
- **Normalizing known test failures** — Carrying forward "4 pre-existing failures, unrelated" across an entire epic erodes baseline reliability. Fix or formally defer in deferred-work.md immediately
- **Deferred findings only in story files** — Without centralized tracking in deferred-work.md, deferred items are invisible. Code reviewer prompts must explicitly require logging to deferred-work.md
- **Reading only from epics.md** — Sprint-status.yaml may contain additional stories (cleanup stories from retrospectives, hotfixes). Build story list from both sources
- **Skipping retrospective review before epic start** — Without explicitly reading the previous retro and triaging deferred items, action items and deferred findings silently accumulate. The retrospective review + Story X.0 creation step is mandatory even if the previous epic had no HIGH-severity items
- **Parallelizing stories without verifying disjoint files** — Stories that touch overlapping files cannot run as a parallel batch. The lead must verify file-set disjointness from the story specs before assembling a batch; on any uncertainty, run sequentially. Two agents writing to the same file produce non-deterministic state and corrupt the commit
- **Skipping the batch barrier** — In parallel mode, the lead must wait for ALL N agents at the current stage to send `STATUS: completed` (clarifications keep the agent alive but do not break the barrier) before spawning the next stage. Starting the next stage with partial completion data routes wrong file lists to wrong agents and produces incoherent reviews
- **Parallel batches that cross epic boundaries** — Sprint planning, Story X.0 creation, and per-epic retrospective are single-threaded per-epic gates. Parallelism is confined to within-epic story batches; never assemble a parallel batch from stories in different epics
- **Parallelizing a story whose prerequisites are still in-flight** — Independence-test condition 3 (Smart Parallelism § Independence test) requires every prerequisite to be at `committed` stage before a story enters a parallel batch. Including a story in a batch alongside any of its uncommitted prerequisites creates a hidden ordering bug — the dependent may run before its prerequisite lands. Foundation stories (those many later stories cite as prerequisites) are caught by this rule naturally; they end up sequential at the start of an epic without needing a special "foundation" label
- **Unstructured completion messages** — Free-form completion text is unparseable, especially under parallel execution where the lead must route three concurrent file lists to three downstream agents. Every completion message must use the literal `STATUS: completed | STORY_ID | FILES_MODIFIED | TESTS_ADDED | DECISIONS | ISSUES_ENCOUNTERED` envelope from Agent Prompt Requirements
- **Telling agents to "wait for SendMessage"** — The Task-in-Prompt pattern delivers the task in the spawn prompt; no SendMessage will arrive. Agent prompts that include "wait for the lead to message you" cause the agent to hang. The agent prompt template must instruct the agent to begin work immediately on spawn
- **Spawning before `TeamCreate`** — Named teammates cannot exist outside a team. If the lead spawns an `Agent` with a `name` before `TeamCreate` has run, the spawn either fails or produces an agent that isn't reachable via `SendMessage` by name. Always call `TeamCreate` first (see Team Lifecycle § Required)
- **Spawning teammates without `team_name`** — The `Agent` tool needs both `team_name` (which team to join) and `name` (the unique teammate name) to attach the spawned agent to the existing team. Omitting `team_name` produces a standalone subagent that the lead cannot address via `SendMessage`
- **Leaving teams undeleted across runs** — `TeamCreate` writes persistent state under `~/.claude/teams/{team-name}/` (and `~/.claude/tasks/{team-name}/`). Without `TeamDelete` at the end of each workflow run, those directories accumulate forever. Always call `TeamDelete` after the last epic completes (and after every teammate has been shut down)
- **Omitting `summary` on plain-text `SendMessage` calls** — The `SendMessage` API requires `summary` (5–10 word UI preview) whenever `message` is a plain string. Structured messages like `{type: "shutdown_request"}` don't need `summary`. Forgetting `summary` on a clarification response causes the message to fail validation
- **Deferring ADR-mandated agent-time verification without surfacing it** — Saying "I can't do X from this environment" or "deferred to manual run" for work the project's ADRs commit to specific agent-time tooling. Real example: a Story 1.5 AC5 reverse-Z precision spike was deferred to "manual run" when ADR 0010 explicitly committed Chrome DevTools MCP for that exact use case at agent-time. The fix: the lead executes ADR-tooled AC verifications directly (Layer 1 in ADR-Aware Execution), because MCP tool inventories may not propagate reliably to subagents. The dev agent is no longer responsible for this kind of verification
- **Treating ADR violations as LOW deferrable findings** — An AC implementation that violates an Accepted ADR is a **HIGH-severity** finding because it breaks a committed architectural / methodology decision. Code-reviewer spawn prompts must explicitly include this rule; otherwise reviewers tend to file ADR-violation findings as ordinary LOW deferrables and the violation silently ships
- **Skipping the per-story smoke** — Committing a story whose code touches a user-facing surface without exercising that surface in its target runtime. The test pyramid (unit + integration + E2E) is necessary but not sufficient; every tier can pass while the deployed product is broken because the wiring between components was never end-to-end verified. The per-story smoke is non-optional even when CI is green; failed smoke means HIGH-severity, not deferrable. See Per-Story Smoke § Critical Gate
- **Smoke executed by a spawned subagent instead of the lead** — Spawned subagents may not have reliable access to the project's runtime tooling (MCP servers, dev server, CLI environment). The smoke step is lead-side for the same reason ADR-tooled verifications and `/bmad-retrospective` are lead-side: the lead reliably has the tools the smoke needs
- **Blocking the pipeline indefinitely on a silent agent** — When an agent's completion message doesn't arrive, the lead must NOT wait forever for it. Silent agents (~10–12% empirically) may have completed all their work to disk and simply failed to send the structured envelope. The lead reconstructs the completion data from `git status --short` + the story spec's `Files to Modify` table, runs the verification the agent should have run, and appends a cycle-log entry with `hygiene_issue=<agent>_silent_lead_reconstructed_from_file_evidence`. See Agent Silence Recovery § Required
- **Service-introducing story spawned without an Integration AC** — A story that introduces a service, module, or component that downstream stories will consume MUST contain at least one Integration AC ("consumer X reads from this service and produces observable effect Y") before the lead spawns the dev agent. Without this, the producer and every consumer can ship green with the wiring between them never built — a prior Epic 1's four HIGH defects all shared this exact signature. The lead validates integration-AC presence at the `/bmad-create-story` gate and pauses for the user if absent. See Lead Creates Story Files § Integration AC validation
- **Injecting the structured-completion instruction via `persistent_facts` in BMAD customization** — the BMAD skill's natural ending can override `persistent_facts` content, so the spawned agent finishes the skill body without ever hitting the completion-message step as a runtime instruction. Use `activation_steps_append` in `_bmad/custom/<skill>.toml` instead — it adds the instruction as the literal final step in the skill's execution sequence, after every step the skill body itself defines. Symptom: silence events keep happening even though the workflow's spawn prompts include the completion block and the skill customization contains the instruction; check whether the customization is `persistent_facts` (broken) or `activation_steps_append` (works). See Agent Silence Recovery § Long-term fix

## Lessons Learned (Accumulated From Prior Project Runs)

These lessons were earned on prior projects' epic-cycle runs and are carried forward into every new project's run of this workflow as starting wisdom. As this workflow runs against a new project, new lessons surfaced by that project's own retrospectives should be appended here.

1. **Detailed story specs enable autonomous development** — "Previous Story Intelligence" sections eliminate agent guessing
2. **Never normalize known failures** — fix or formally defer immediately
3. **Autonomous pipelines need explicit reinforcement** — skills may have mechanisms that aren't triggered without explicit mention in orchestrator prompts
4. **Mock-based testing is sufficient for foundation epics** — document infrastructure constraints in story dev notes
5. **Story X.0 cleanup pattern (MANDATORY)** — deferred work from epic N gets a tracked cleanup story at the start of epic N+1. The lead MUST review the previous retrospective and triage ALL action items and deferred findings — include, defer with rationale, or drop. Story X.0 is created even if all items are deferred, to document the triage decision. Elevated from optional to mandatory after a prior project's mid-run retrospective revealed that skipping X.0 caused deferred items to silently accumulate across epics.
6. **Pipeline must support resume** — on restart, the lead reads `sprint-status.yaml` and the cycle log (see Completion Logging § Cycle Log Format) to compute the resume point. Per-story resume granularity is at the stage level: `story_created` / `dev_complete` / `qa_complete` / `cr_complete` / `committed`. The lead skips completed stages and re-spawns only the agents needed for the first incomplete stage. For parallel batches, see Smart Parallelism § Resume Policy.
7. **ADR-aware execution (lead-executed gate)** — projects with an Accepted-Decisions registry commit the workflow to specific tooling for specific kinds of work. The lead must drive ADR-tooled AC verifications directly (between `dev_complete` and `qa_complete`), because subagent MCP / tool propagation is unreliable. Code reviewers must treat ADR violations as HIGH severity, not LOW deferrable. This lesson was earned on a prior project's Story 1.5 / ADR 0010 mismatch (a Phase 0 reverse-Z precision spike committed to Chrome DevTools MCP, deferred by the dev agent to "manual run" because it lacked MCP access at spawn time).
8. **The test pyramid is necessary but not sufficient — the per-story smoke is the bridge from "tests pass" to "the product works"** — every automated tier (unit, integration, E2E, visual regression, a11y) can pass while the deployed product is broken because the wiring between independently-correct modules was never end-to-end verified. The lead must perform a per-story smoke (browser MCP for UI, CLI invocation for libraries, real `curl` for services, etc.) between code review and commit. Failed smoke is HIGH-severity, never deferrable. This lesson was earned on a project whose Epic 1 ship-readiness review found four HIGH defects (broken core feature, missing decoder configuration, ARIA mojibake, ARIA value-bound rendering) — every one passed all four automated tiers; all four were instantly obvious in a real browser. See Per-Story Smoke § Critical Gate.
9. **Integration ACs catch the wiring gap that unit ACs miss** — when a story introduces a service, the ACs must specify not only "the service is correct in isolation" but also "consumer X reads from the service and produces observable effect Y." Without an integration AC, a producer story and its consumer stories can both ship green while the wire-up between them was never built. The story-creation skill should refuse to mark a service-introducing story `ready-for-dev` without at least one integration AC, and the code-review skill should refuse to approve such a story without evidence the integration is exercised. (Same root cause as Lesson 8; the smoke step is the last-mile catch and the integration AC is the planning-time catch.)
10. **NFR tripwires amend planning artifacts in place** — when a dev or QA pass discovers an NFR is unmeasurable, mathematically impossible, or internally contradictory, the response is NOT to add a code comment + a `deferred-work.md` entry and continue. The PRD/architecture/epics files are amended in place to clarify the NFR's real intent; the dev/QA work then verifies against the amended NFR. Otherwise the planning artifacts and the deployed code diverge silently — a future contributor reading the PRD will not know which NFRs are "as-written" vs. "as-implemented-with-comment." This lesson was earned on a project whose NFR-P6 ("ClockManager mutations ≤ 100µs P99") was mathematically impossible on browser wall-clock and NFR-M4 ("cycle log human-readable") was conflated with lint-clean; both were worked around in comments and the deferred-work file instead of being amended at source.
11. **Agent completion-message silence is a recurring failure mode; the lead must have a file-evidence recovery protocol** — empirically ~10–12% of agent spawns complete their work to disk but never send the `STATUS: completed` envelope before going idle. The lead must NOT block the pipeline waiting for a message that won't arrive. The lead recovers by reconstructing the completion from `git status --short` + the story spec's `Files to Modify` table, running the verification the agent should have run, and recording the silence in the cycle log via `hygiene_issue=<agent>_silent_lead_reconstructed_from_file_evidence`. The long-term fix is at the BMAD skill-prompt level (each skill should terminate with an explicit `STATUS: completed` instruction) but workflow-level survivability requires the recovery protocol regardless. If silence happens 3+ times consecutively in a run, pause and inform the user — the skill prompts likely need an update before continuing. See Agent Silence Recovery § Required.
