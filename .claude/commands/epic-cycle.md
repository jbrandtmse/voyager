---
description: Run the BMAD Method epic development cycle for one or more epics using Agent Teams
---

You are executing the BMAD Method development implementation cycle for one or more epics, using Claude Code Agent Teams. Stories run sequentially by default; independent stories within the same epic may be processed as a parallel batch — see "Smart Parallelism" below.

**Epic range:** $ARGUMENTS (e.g., `1-3` for Epics 1 through 3, `2` for a single epic). If empty, prompt the user for the range before proceeding.

## Pre-flight Runtime Check

Verify that `SendMessage`, `TeamCreate`, and `TeamDelete` tools are available in this session. These are deferred tools; if they are not in your active tool set, load them by calling `ToolSearch` with query `"select:SendMessage,TeamCreate,TeamDelete"` before first use.

If any cannot be loaded, halt immediately with: "Agent Teams is not enabled. Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `~/.claude/settings.json` (or `.claude/settings.json` for project-local scope), fully exit and relaunch Claude Code (v2.1.32 or later), then re-run /epic-cycle."

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

Each task should be executed in Agent Teams using the **spawn-on-demand** pattern.

Automatically resolve all HIGH and MED severity issues found during code review using your best judgment and BMAD guidance.

Stories are documented/updated consistently with each Skill's instructions.

The BMAD method skills (`/bmad-create-story`, `/bmad-dev-story`, `/bmad-qa-generate-e2e-tests`, `/bmad-code-review`) must be used. Don't skip steps other than the YOLO-mode aspect. **`/bmad-retrospective` is the one skill that MUST be run in interactive mode** — its elicitation must reach the user.

## Permission Mode (Critical)

**All agents must be spawned with `mode: "bypassPermissions"`** — YOLO mode. Agents should not prompt for file edits, bash commands, or tool permissions; without this, the pipeline stalls on every file write waiting for human approval.

**`/bmad-retrospective` is the one step whose elicitation must reach the user.** When the **lead** invokes the skill directly via the `Skill` tool (not via a spawned agent), the skill's `AskUserQuestion` calls route to the user. `bypassPermissions` does NOT auto-answer `AskUserQuestion` — that tool always elicits the human. Spawned subagents cannot reliably surface their elicitation, so this skill is lead-only.

## Skill Tool Invocation (Critical)

All BMAD skills must be invoked via the **`Skill` tool**, not interpreted inline. Agent prompts must explicitly state: "use the `Skill` tool to invoke /bmad-dev-story" (or the relevant skill). Without this directive, agents may try to execute skill logic themselves.

## Spawn-on-Demand Coordination (Critical)

**Do NOT create, update, or read tasks via the task list system** (`TaskCreate`, `TaskUpdate`, `TaskList`). `TeamCreate` automatically provisions an empty TaskList directory — that's unavoidable but harmless **as long as nothing is ever written to it**. Agents poll TaskList on every wake-up and will self-schedule from any non-empty list regardless of prompt instructions, `blockedBy` constraints, or task ownership. Prompt text cannot override this; keeping the list empty is what prevents self-scheduling.

The lead tracks pipeline state directly from the epic story list and coordinates agents via **spawn-on-demand**.

### Team Lifecycle (Required)

Before the lead can spawn named teammates, a team must exist. At the end of the workflow run, the team should be deleted to avoid accumulating state under `~/.claude/teams/`.

**Once per workflow run, before the first agent spawn:**

```text
TeamCreate({
  team_name: "epic-cycle-<epoch-or-date>",   // e.g. "epic-cycle-2026-05-20"
  agent_type: "team-lead",
  description: "Epic Development Cycle: Epics <range> for project <name>"
})
```

Use a unique `team_name` per workflow run (date- or epoch-stamped) so multiple runs don't collide. The lead is implicitly the team-lead; teammates are joined via the `Agent` tool's `team_name` and `name` parameters during spawn.

**Once per workflow run, after the last epic's retrospective (or skip) completes:**

```text
// Confirm no teammates are still alive (all stories' shutdown handshakes are complete).
TeamDelete()  // operates on the current session's team context; takes no team_name arg
```

`TeamDelete` will fail if any teammate is still active — make sure every spawned agent has been shut down via the documented sequence first.

### Task-in-Prompt Pattern (Required)

Embed the task directly in the agent's spawn prompt rather than using `SendMessage` after spawning. `SendMessage` delivery at spawn time is unreliable — agents sometimes go idle without picking up messages. There is no fallback; Task-in-Prompt is the only spawn pattern.

For each pipeline step, the lead:

1. **Spawns** a fresh agent via the `Agent` tool with:
   - `team_name: <the team created in Team Lifecycle>` (required — joins the agent to the team so `SendMessage` can reach it by name)
   - `name: <unique-per-story>` (e.g., `dev-2-3`, `qa-2-3`, `cr-2-3` — never generic names like `developer`)
   - `mode: "bypassPermissions"`
   - `prompt: <full task embedded in the spawn prompt>`
2. **Waits** for the completion message (or triggers Agent Silence Recovery — see below).
3. **Shuts down** the agent via `SendMessage({to: "<agent-name>", message: {type: "shutdown_request"}})`. No `summary` field is needed for structured messages; it IS required for plain-text messages (clarification responses).
4. **Waits for shutdown approval** — the agent responds with `shutdown_response: approve=true`. Do NOT spawn the next agent with the same name until that arrives.

This eliminates self-scheduling: terminated agents can't poll TaskList.

### Pipeline Flow

```
Lead calls TeamCreate({...})  // once per workflow run
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
    Lead records spawn_at=<UTC> and model=<id> at the moment of each Agent spawn; emits both as metadata on the corresponding *_complete entry (see Workflow Telemetry)
    Lead spawns developer → captures completion (or runs silence recovery) → shuts down → waits for approval
    Lead executes ADR-tooled AC verifications (lead-side, sequential per AC); logs adr_verifications_complete
    Lead spawns qa-test-author → captures completion → shuts down → waits for approval
    Lead spawns code-reviewer → captures completion → shuts down → waits for approval
    Lead performs per-story smoke (lead-side); logs smoke_complete
    Lead commits + pushes (submodules first if applicable)
    Lead logs committed; next story or next batch

  Lead pauses: "Would you like to run a retrospective?" → if yes, execute /bmad-retrospective via Skill tool
  Lead logs epic complete; next epic

Lead calls TeamDelete()  // once per workflow run, after all teammates shut down
```

### Smart Parallelism (Opt-In Per Batch)

When two or more stories within the same epic touch **disjoint files** and have **all prerequisites already committed**, the lead may run them as a **parallel batch** to reduce wall-clock time. Parallelism is opt-in per batch — when in doubt, run sequentially.

**What stays sequential (no exceptions):**

- Story-file creation (`/bmad-create-story` runs in the lead, one at a time).
- Commits and pushes (one story at a time; no two git ops interleave).
- Sprint planning, retrospective review, Story X.0 creation, per-epic retrospective.
- ADR-tooled AC verifications.
- Per-story smoke.

**What runs in parallel:** for a batch of N independent stories, the lead spawns N independent (dev → qa → code-review) pipelines concurrently. Each chain is internally sequential with shutdown-before-respawn; only the chains run alongside one another.

**Independence test (all three must hold):**

1. **Disjoint files** — no two stories modify the same file. Determined by reading story specs' ACs and Previous Story Intelligence; uncertainty disqualifies.
2. **Same epic** — parallelism doesn't cross epic boundaries.
3. **All prerequisites already committed** — every story a batch member references as a prerequisite must already be at `committed` stage in the cycle log.

If any fail, run sequentially.

**Batch flow:**

```
Lead identifies parallel batch [S_a, S_b, S_c] meeting all three criteria
Lead executes /bmad-create-story for S_a, then S_b, then S_c (sequentially — pipeline gate stays)
Lead spawns dev-{epic}-a, dev-{epic}-b, dev-{epic}-c concurrently
Lead waits for ALL dev completions, captures three file lists, shuts down all three devs
Lead executes ADR-tooled verifications for S_a then S_b then S_c sequentially
Lead spawns qa-{epic}-a, qa-{epic}-b, qa-{epic}-c concurrently
Lead waits for ALL qa completions, captures three test file lists, shuts down all three qas
Lead spawns cr-{epic}-a, cr-{epic}-b, cr-{epic}-c concurrently
Lead waits for ALL code-review completions, shuts down all three reviewers
Lead performs per-story smoke for S_a then S_b then S_c sequentially
Lead commits + pushes S_a, S_b, S_c in story order (sequentially)
Lead logs all three completions; next story or next batch
```

The **batch barrier** — the lead waits for all N agents of the same stage before moving to the next stage — is mandatory. A code-reviewer running against partial output of a still-active developer is meaningless.

**Conservative default:** if you cannot quickly and confidently identify a parallel batch, default to sequential. Parallelism is an optimization, not a requirement.

**Resume policy for interrupted batches:** on restart, inspect the cycle log and `sprint-status.yaml`:

1. For each story in the batch, find the latest completed stage from the cycle log.
2. The earliest incomplete stage across the batch is the resume point.
3. Re-spawn ONLY the agents needed for stories that haven't yet reached the resume stage.
4. If resume state is ambiguous, fall back to sequential resume — process remaining stories one at a time until the next natural batch boundary.

Sequential resume is always safe. When in doubt, resume sequentially.

**Write-ahead rule (prevents resume-time duplicate work):** the lead must write the cycle log entry for a completed stage **before** taking the next action that depends on that completion. If a crash happens after an agent completes but before the log is written, on resume the lead re-spawns the agent for that stage. This is fine for dev/qa stages (idempotent) but **NOT acceptable for the commit stage** (would produce a duplicate commit). For `committed`: write the log entry immediately after `git push` returns success. If crashed between push success and log write, on resume inspect `git log --oneline` against expected story files; if a matching commit exists, write the missing log entry and proceed — do NOT re-run the commit.

### Per-Story Smoke (Critical Gate)

After a story's code review completes (and any HIGH/MED findings are resolved) and before the lead commits, the lead must perform a **per-story smoke** — a direct exercise of the story's deliverable in its target runtime. **Mandatory**; only the *method* varies by project type. The smoke is performed by the **lead**, not by a spawned agent, because the lead reliably has access to project runtime tooling (MCP servers, dev server, CLI, deployment environment) while subagents may not.

**Method selection — match the deliverable's runtime:**

- **UI / browser-deployed projects** — Drive the dev server (or a deployed build) via a browser-automation MCP. Navigate to the affected surface, exercise the feature, assert on observable DOM / render state / console output. For graphics projects: screenshots verifying actual visual change frame-over-frame.
- **CLI / library projects** — Invoke the CLI command or call the public test method against a real runtime. Assert on stdout / stderr / return code / produced files.
- **Service / API projects** — Issue a real HTTP request against the local server (or staging) and assert on status code + response body + side-effect surface.
- **Other** — Whatever exercise mirrors how the deliverable will be used in production. Minimum bar: "the lead actually invoked the new code path against a real runtime, and observed the expected outcome via an out-of-band channel."

The smoke is NOT a substitute for automated test tiers; it's the final check that the wired-up system, end to end, produces the user-observable outcome the story promises. Automated tests verify components in their tested boundary; the smoke verifies that the boundary is wired up to reality.

**Mechanics:**

1. After `cr_complete` (with HIGH/MED resolved), determine the smoke method from the story's File List + ACs.
2. Execute the smoke directly, capturing evidence (screenshots, stdout, response body).
3. If the smoke fails, do NOT commit. Either (a) surface to the user for guidance, or (b) create a follow-up dev pass to fix and re-smoke. Failed smoke is a HIGH-severity finding that must clear before commit — never deferrable.
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

The skill customization for `/bmad-create-story` should refuse to mark a service-introducing story `ready-for-dev` without an integration AC (Rule 1 in the project's skill-rules file). This workflow gate is defense-in-depth.

### Context Handoff Between Stages (Critical)

The **story file path** is the canonical context anchor, passed forward to every downstream agent.

1. **Story creation → Developer**: lead passes the story file path to the developer.
2. **Developer → QA**: developer's completion includes all files created/modified (full paths). Lead passes both the story file path AND the developer's file list to QA.
3. **QA → Code reviewer**: QA's completion includes all test files created/modified. Lead passes story file path + developer's files + QA's tests to the code reviewer.
4. **Code reviewer → Commit**: lead uses the union of file lists from dev + QA to stage files for commit.

Without explicit handoff, downstream agents lack the information to do their job.

### ADR-Aware Execution (Required)

Projects with an Accepted-Decisions registry (typically `docs/adr/`) commit to specific tooling, methodology, and architectural patterns. An AC satisfied by the wrong tool stack is equivalent to a HIGH-severity defect — it violates an Accepted ADR.

**Layer 1 — Lead-executed ADR-tooling gate (between `dev_complete` and `qa_spawn`).**

After the developer's shutdown is approved and before the QA agent is spawned, the lead inspects the story's ACs for any that map to ADR-committed agent-time tooling (visual / precision verification, performance profiling, audits, etc.). For each matched AC, the lead drives the verification using its own tool inventory — typically the project's MCP servers.

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

### Shutdown-Before-Respawn Sequencing (Critical)

After sending `SendMessage(type: "shutdown_request")`, **wait for the shutdown approval message** before spawning the next agent. Agent shutdown is asynchronous — an idle notification may arrive before the shutdown approval. Spawning a new agent with the same name before the old one terminates causes a name collision.

Pattern: `Lead sends shutdown_request → may receive idle notification → receives shutdown_approved → safe to spawn next agent`.

### Agent Silence Recovery (Required)

A non-trivial fraction of spawned agents — empirically ~10–12% — complete their work to disk but fail to send the structured `STATUS: completed` envelope before going idle. The lead must NOT block the pipeline waiting for a message that won't arrive. The lead recovers by reconstructing the completion data from on-disk evidence.

**Detection — when to trigger silence recovery:**

Trigger when ALL three hold:

1. The spawned agent reports idle / not-running (via any team status check), AND
2. No completion message (`STATUS: completed` or `STATUS: clarification_needed`) has been received, AND
3. The lead observes via `git status --short` that files have been written matching the story's expected `Files to Modify` table.

**When to check:** initiate a silence check at the *later* of (a) 5 minutes after the agent's spawn time, and (b) the moment the lead observes the agent reports idle. The 5-minute floor exists because some stories legitimately take minutes; checking too early false-positives.

If condition (3) does NOT hold — the agent went idle WITHOUT writing files — it's a different failure mode (stuck, errored, didn't start). Surface to the user; do NOT attempt silent-completion recovery on an agent that produced no output.

**Recovery protocol (lead-side, mandatory):**

The protocol follows the write-ahead rule: record the completion in the cycle log BEFORE taking the next action. If recovery crashes mid-flight, the silence event is already on disk and the next session resumes correctly.

1. **Reconstruct the file list from disk** — `git status --short`; collect modified + new files matching the story's `Files to Modify` table. Routing depends on which stage went silent:
   - **Dev silence** → `FILES_MODIFIED` (all changed files matching the story's expected file list).
   - **QA silence** → `TESTS_ADDED` (filter to the project's test-file naming convention — `*.test.ts`, `test_*.py`, `*_test.go`, `*Spec.scala`, files under `tests/` or `spec/`, etc. — plus files matching the story's `Tests / Subtasks` paths).
   - **Code-reviewer silence** → typically no new source files (cr modifies the story file's `Review Findings` section); if files DID change, they are cr's auto-resolved HIGH/MED fixes — capture them.
2. **Append the cycle-log entry IMMEDIATELY with hygiene metadata** — write the stage's completion record now, before verification or shutdown. Include `hygiene_issue=<agent>_silent_lead_reconstructed_from_file_evidence` (or similar) so silence is visible in the next retrospective. This is the write-ahead checkpoint.
3. **Run the verification the silent agent should have run** — invoke the project's test suite plus type/lint/build checks. The exact commands vary; consult the project's task runner (`justfile`, `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, `go.mod` + Makefile, README quick-start, or the project's BMAD build-rules file under `_bmad/custom/`).
   - **Dev silence** → run full project test suite + whatever type/lint/build checks the dev normally does.
   - **QA silence** → run the same suite; additionally confirm the new test files identified in step 1 actually execute (not excluded by an ignore file, not skipped by a tag/marker, not in an opt-in bucket the default suite skips).
   - **Code-reviewer silence** → read the story's `Review Findings` section if populated; if not, the lead reads the diff and runs the code-review skill directly via `Skill` (lead-driven; same pattern as `/bmad-retrospective`).
   - On verification failure, surface to the user — do NOT silently absorb a regression.
4. **Shutdown the silent agent** — `SendMessage shutdown_request` typically works even on an idle agent. If shutdown also fails after a reasonable timeout (5 minutes default), the lead has two recovery paths:
   - **(a) Version the next spawn's name** — for the next stage at the same story, use a versioned name (e.g., `qa-2-3-v2` instead of `qa-2-3`) to avoid colliding with the still-alive silent agent. Log the rename via cycle-log metadata on the next stage's completion entry: `predecessor_hang=<original-name> renamed_to=<versioned-name>`.
   - **(b) Surface to the user** for guidance. This is the right path when silence has happened 3+ times consecutively in the run.

**Do NOT do these things during silence recovery:**

- Do NOT block the pipeline indefinitely waiting for a message that won't arrive. Move forward on file evidence.
- Do NOT skip the verification. The lead must actually run the agent's verification step, not just trust the file list.
- Do NOT silently absorb the silence event. It MUST appear in the cycle log so the retro can address it.
- Do NOT use silence recovery as a substitute for properly-wired skill customizations. If silence happens 3+ times consecutively, pause and inform the user — the project's skill customization likely needs review (specifically: confirm the structured-completion handshake is in `on_complete`, NOT `persistent_facts` and NOT `activation_steps_append`).

### Agent Prompt Requirements

**Placement is load-bearing:** the structured-completion block below MUST be the FINAL text in every spawn prompt, after any skill-specific instructions the lead prepends. Some BMAD skills end with their own closing instructions that can override prompt-level guidance; placing the completion block last in the prompt itself ensures it is the last thing the agent reads before invoking the skill. This is defense-in-depth — the long-term fix is at the skill customization level (`on_complete` in `_bmad/custom/<skill>.toml`), but spawn-prompt placement is the workflow-level safety net.

Each agent's spawn prompt must include:

```
**CRITICAL — Single-Task Agent (Task-in-Prompt Mode):**

Your task is fully described in the prompt you have just received. Begin work IMMEDIATELY — do NOT wait for any SendMessage **at spawn time** to deliver your task; none will arrive. The Task-in-Prompt pattern delivers your task in the spawn prompt itself.

(SendMessage IS used later in two cases: the lead may SendMessage a response to a clarification request you initiate — see Clarification protocol below — and the lead will SendMessage a shutdown request at the end. Both arrive AFTER you've started work, never at spawn.)

- Execute the workflow using the `Skill` tool to invoke the specified BMAD skill.
- When done, send EXACTLY ONE completion message to the lead in the structured format below. Send NOTHING else (no progress updates, no chatter).
- After sending the completion message, STOP completely.
- Do NOT call TaskList; do NOT look for more work.
- Approve any shutdown request immediately.
- Do NOT use TaskList, TaskCreate, or TaskUpdate.

**Completion message format (mandatory, parseable):**

​```
STATUS: completed
STORY_ID: <epic.story, e.g., 2.3>
FILES_MODIFIED:
- <full path 1>
- <full path 2>
(or "(none)")
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

Within each agent, only pause to ask a question if:

- The acceptance criteria or requirements are ambiguous.
- There are multiple reasonable design options and user preference matters.
- Proceeding would risk breaking important constraints (security, compliance, performance, interoperability).

## Handling Clarifications

When an agent needs clarification, it sends a message to the lead instead of a completion message. The lead:

1. **Does NOT shut down the agent** — it's waiting for a response.
2. Surfaces the agent's question to the user (with Story ID + relevant context).
3. Waits for the user's answer.
4. Relays the answer back via `SendMessage({to: "<agent-name>", summary: "<5–10 word UI preview>", message: "<user's answer as plain text>"})`. The `summary` parameter is required for plain-text messages.
5. Waits for the agent's completion message.
6. Proceeds with normal shutdown only after the completion message arrives.

**Key distinction:** A clarification message is NOT a completion message. The structured `STATUS:` field disambiguates — `STATUS: completed` vs `STATUS: clarification_needed`.

**In a parallel batch:** if one agent sends `STATUS: clarification_needed` while others are running, the lead surfaces the question to the user *without halting other agents*. Others continue toward their own completion (or clarification) messages. The clarifying agent stays alive (no shutdown) until the user answers and the lead relays. The batch barrier waits for ALL agents — including the clarifying one — to send `STATUS: completed` before advancing.

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
- Valid stages, in order: `story_created`, `dev_complete`, `adr_verifications_complete` (optional, between `dev_complete` and `qa_complete`; one line per story regardless of AC count), `qa_complete`, `cr_complete`, `smoke_complete` (mandatory, between `cr_complete` and `committed`), `committed`, `epic_summary` (optional, once per epic after the last committed entry — see Workflow Telemetry).

**Standardized telemetry metadata (record on every `*_complete` entry):**

- `spawn_at=<UTC>` — when the lead invoked `Agent` for this stage (omit on lead-driven stages like `smoke_complete` where there's no spawn). Duration = entry timestamp minus `spawn_at`.
- `model=<id>` — which model the agent ran. Examples: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`. For lead-driven stages, record the lead's model.
- `cycle_iteration=N` — defaults to 1; increment when the lead re-spawns this stage after a downstream stage rejected the work (e.g., smoke failed and a follow-up dev pass was needed).

**Stage-specific telemetry metadata (record when the data is available):**

- `dev_complete`: `loc_added=N loc_removed=N files=N clarifications=N nfr_tripwires=N adr_violations_surfaced=N` — story complexity (LOC) + mid-flight signal counts.
- `qa_complete`: `tests_added=N first_run_failures=N clarifications=N` — `first_run_failures` is bugs the new tests caught against existing code (defects the dev shipped that the new tests immediately surfaced).
- `cr_complete`: `resolved=N deferred=N dismissed=N high=N med=N low=N clarifications=N` — `high/med/low` is the severity distribution of all findings (resolved + deferred + dismissed).
- `smoke_complete`: `method=<browser|cli|api|other> result=pass|fail iterations=N defects_caught=N evidence=<path>` — `defects_caught` is the count of bugs only the runtime exercise surfaced (lesson-8 catches).
- `committed`: `sha=<short-hash> submodules=<paths-or-empty>` — already standard.

**Cost telemetry (record when available — often only the lead can see it):**

- `input_tokens=N output_tokens=N cost_usd=X.XX` on any `*_complete` entry where the lead can extract the figures from the spawning channel. Many environments don't expose this; if not available, omit and the rollup falls back to wall-clock as the cost proxy.

**Example** (TABs shown as `→` for visibility; actual file contains literal tabs):

```
2026-05-18T14:23:11Z→Story 1.5→story_created→path=_bmad-output/implementation-artifacts/story-1.5.md spec_tokens=4820
2026-05-18T14:24:02Z→Story 1.5→dev_complete→spawn_at=2026-05-18T14:23:30Z model=claude-opus-4-7 files=src/render/render-engine.ts,src/types/branded.ts loc_added=412 loc_removed=18 clarifications=1 nfr_tripwires=0 cycle_iteration=1
2026-05-18T14:25:00Z→Story 1.5→adr_verifications_complete→tool=chrome_devtools_mcp ac=ac5 result=pass model=claude-opus-4-7
2026-05-18T14:29:47Z→Story 1.5→qa_complete→spawn_at=2026-05-18T14:25:30Z model=claude-sonnet-4-6 tests=tests/render/render-engine.test.ts tests_added=14 first_run_failures=2 clarifications=0
2026-05-18T14:33:18Z→Story 1.5→cr_complete→spawn_at=2026-05-18T14:30:15Z model=claude-opus-4-7 resolved=2 deferred=0 dismissed=0 high=1 med=1 low=0 clarifications=0
2026-05-18T14:34:00Z→Story 1.5→smoke_complete→method=browser result=pass iterations=1 defects_caught=0 evidence=path/to/screens/ model=claude-opus-4-7
2026-05-18T14:34:30Z→Story 1.5→committed→sha=abc1234 submodules=
```

Reading the example: dev ran on Opus (32s spawn-to-complete, 412 LOC, 1 clarification, 0 NFR tripwires); QA ran on Sonnet (~4m, 14 tests added, 2 dev-side defects caught at first run); cr ran on Opus (~3m, 2 findings resolved — 1 HIGH 1 MED); smoke clean. Across an epic this gives you per-stage duration by model, bug-catch rates by stage, and aggregate cost-vs-quality signal.

**Parsing rule:** split each line on TAB into exactly 4 fields; split the metadata field on whitespace into key=value tokens; split each value on `,` for lists. Unambiguous regardless of how many key=value pairs or list items.

On restart, scan the cycle log for the highest-stage entry per story to compute the resume point.

## Workflow Telemetry

The cycle log is the project's primary telemetry surface. The standardized metadata (Cycle Log Format § "Standardized telemetry metadata") plus the stage-specific keys make per-stage cost, quality, and model attribution computable without instrumenting anything beyond the existing lead-side writes.

**What the metadata enables:**

- **Per-stage duration by model.** `entry.timestamp − entry.spawn_at` grouped by `entry.model` tells you how long Opus dev-stages take vs Sonnet dev-stages, etc.
- **Bug rate by upstream model.** `cr_complete.high + cr_complete.med` per story, grouped by `dev_complete.model`, tells you how many real defects the dev stage shipped — higher counts = lower-quality dev work — per model.
- **Rework rate by model.** Count of `cycle_iteration > 1` entries grouped by model. Strong models should re-cycle less.
- **Test-pyramid leak rate.** `smoke_complete.defects_caught > 0` events — these are bugs that passed unit + integration + cr but failed in the runtime. Aggregated per model, this is the "stronger model catches more class-of-bug at review time" signal.
- **NFR-tripwire surfacing rate.** `dev_complete.nfr_tripwires` grouped by model — stronger models should catch more spec-level contradictions before silently working around them.

**`epic_summary` entry (one per epic, optional).**

After the last `committed` entry in an epic, the lead may write an aggregate summary:

```
<UTC> TAB Epic <N> TAB epic_summary TAB stories=N wall_clock_hours=X.X total_high=N total_med=N total_low=N total_smoke_defects=N rework_events=N opus_stage_count=N sonnet_stage_count=N haiku_stage_count=N input_tokens_total=N output_tokens_total=N cost_usd=X.XX
```

The summary is derivable from the per-stage entries above, so it's a convenience artifact, not a source of truth. A rollup script (which the project should add at `scripts/cycle-log-stats.<lang>` or equivalent — outside this workflow's scope) can compute `epic_summary` retroactively from any subset of cycle logs.

**Cross-project comparability.**

The cycle log format is stable and project-agnostic. Across multiple projects using `/epic-cycle`, the same parser produces apples-to-apples comparisons: dev wall-clock by model, bug rate by model, cost per committed story by model. This is the data shape that lets a team justify (or refute) the use of stronger models.

**What's deliberately NOT instrumented at the workflow level:**

- Individual agent prompt token counts (those are skill-level / harness-level concerns).
- Internal skill performance (the skill's own time-to-first-step, etc.).
- Test-coverage deltas per story (computable from git diffs by a separate tool).

These can be added later via dedicated tooling without disturbing the cycle-log schema.

## Anti-Patterns (Do NOT Use)

- **TaskCreate/TaskList/TaskUpdate** — Agents poll TaskList on every wake-up and grab tasks regardless of `blockedBy`, prompt instructions, or task ownership. Prompt text cannot override this; keeping the list empty is what prevents self-scheduling.
- **Persistent agents between tasks** — Idle agents self-schedule. Always shut down after each task.
- **`blockedBy` constraints** — The task system does NOT enforce them. Agents work out of order.
- **Self-scheduling prompts ("Do NOT call TaskList")** — Unreliable; agents have built-in polling that overrides prompt instructions. The TaskList must be empty, period.
- **Story-creator agent** — A story-creator agent races ahead to create story files for future stories, enabling other agents to self-schedule. The lead must create story files directly.
- **Inline skill execution** — Agents interpreting skill logic themselves instead of invoking via the `Skill` tool. Always specify `Skill` tool usage explicitly in prompts.
- **Missing context handoff** — Not passing file lists between stages; code reviewers can't review effectively without knowing which files changed.
- **Parent-before-submodule push** — Pushing the parent repo before submodule commits are pushed leaves broken submodule pointers on the remote. Always submodules-first.
- **Generic agent names** (`developer`, `qa`, `code-reviewer`) — Causes stale shutdown requests to be picked up by new agents. Always use unique names like `dev-2-3`, `cr-2-3`.
- **Spawn-then-message pattern** — Agents sometimes go idle without picking up SendMessage dispatches. Task-in-Prompt is the only reliable spawn pattern.
- **Normalizing known test failures** — Carrying forward "4 pre-existing failures, unrelated" across an epic erodes baseline reliability. Fix or formally defer in deferred-work.md immediately.
- **Deferred findings only in story files** — Without centralized tracking in `deferred-work.md`, deferred items are invisible at the next epic's Story X.0 triage.
- **Reading only from `epics.md`** — `sprint-status.yaml` may contain additional stories (cleanup, hotfixes). Build the story list from both sources.
- **Skipping retrospective review before epic start** — Without explicitly reading the previous retro and triaging deferred items, accumulation goes silent.
- **Parallelizing without verifying disjoint files** — Two agents writing the same file produce non-deterministic state and corrupt the commit.
- **Unstructured completion messages** — Free-form completion text is unparseable, especially under parallel execution. Use the literal `STATUS: completed | STORY_ID | FILES_MODIFIED | TESTS_ADDED | DECISIONS | ISSUES_ENCOUNTERED` envelope.
- **Deferring ADR-mandated agent-time verification without surfacing it** — Saying "I can't do X from this environment" for work an Accepted ADR commits to specific tooling. The lead executes ADR-tooled verifications directly because MCP propagation to subagents is unreliable.
- **Treating ADR violations as LOW deferrable findings** — An implementation that violates an Accepted ADR is HIGH severity. Code-reviewer customization must enforce this (Rule 6 in the project's skill-rules file).
- **Skipping the per-story smoke** — Test pyramid passing while the deployed product is broken (because wiring between independently-correct modules was never verified end-to-end) is a recurring failure. Failed smoke is HIGH, never deferrable.
- **Smoke executed by a spawned subagent** — Subagents may not have reliable access to runtime tooling. The smoke is lead-side, same reason ADR-tooled verifications and `/bmad-retrospective` are lead-side.
- **Blocking the pipeline indefinitely on a silent agent** — Silent agents (~10–12% empirically) may have completed work to disk but failed to send the structured envelope. Reconstruct completion data from `git status --short` + the story's `Files to Modify` table; append cycle log with `hygiene_issue=<agent>_silent_lead_reconstructed_from_file_evidence`.
- **Service-introducing story spawned without an Integration AC** — A producer + consumer can both ship green with the wiring between them never built. The lead validates integration-AC presence at `/bmad-create-story` and pauses for the user if absent.
- **Injecting the structured-completion handshake via `persistent_facts` or `activation_steps_append` in BMAD customization** — `persistent_facts` is informational (loaded as static context throughout the workflow); the skill body's natural ending can finish without acting on it. `activation_steps_append` runs AFTER greet but BEFORE the main work begins — wrong stage for completion behavior. Use `on_complete` in `_bmad/custom/<skill>.toml` instead — it fires when the workflow reaches its terminal stage, after the main output has been delivered. Symptom: silence events keep happening even though the customization contains the instruction; check whether it's in `persistent_facts` (broken — informational only), `activation_steps_append` (broken — wrong stage), or `on_complete` (works — final-stage behavior). Verify by reading the base `customize.toml` for the skill — the comment above `on_complete` will identify the specific completion-stage step it hooks into.

## Lessons Learned

Carry-forward wisdom from prior project runs.

1. **Detailed story specs enable autonomous development** — "Previous Story Intelligence" sections eliminate agent guessing.
2. **Never normalize known failures** — fix or formally defer immediately.
3. **Autonomous pipelines need explicit reinforcement** — skills may have mechanisms that aren't triggered without explicit mention in orchestrator prompts.
4. **Mock-based testing is sufficient for foundation epics** — document infrastructure constraints in story dev notes.
5. **Story X.0 cleanup pattern (MANDATORY)** — deferred work from epic N gets a tracked cleanup story at the start of epic N+1. Triage every action item and deferred finding — include, defer with rationale, or drop. Story X.0 is created even if all items are deferred, to document the triage decision.
6. **Pipeline must support resume** — on restart, read `sprint-status.yaml` and the cycle log to compute the resume point. Per-story resume granularity is at the stage level. Skip completed stages; re-spawn only agents needed for the first incomplete stage.
7. **ADR-aware execution (lead-executed gate)** — the lead drives ADR-tooled AC verifications directly because subagent MCP/tool propagation is unreliable. Code reviewers treat ADR violations as HIGH, not LOW deferrable.
8. **The test pyramid is necessary but not sufficient — the per-story smoke is the bridge from "tests pass" to "the product works"** — every automated tier can pass while the deployed product is broken because the wiring between independently-correct modules was never end-to-end verified. Failed smoke is HIGH-severity, never deferrable.
9. **Integration ACs catch the wiring gap that unit ACs miss** — when a story introduces a service, the ACs must specify "consumer X reads from this service and produces observable effect Y." Without an integration AC, producer + consumer can both ship green while the wire-up between them was never built. The story-creation skill should refuse to mark a service-introducing story `ready-for-dev` without one; the code reviewer should refuse to approve without evidence the integration is exercised.
10. **NFR tripwires amend planning artifacts in place** — when an NFR is found unmeasurable, mathematically impossible, or internally contradictory, the response is NOT to add a code comment + a `deferred-work.md` entry. Amend the PRD/architecture/epics in place; verify against the amended NFR. Otherwise planning artifacts and deployed code diverge silently.
11. **Agent completion-message silence is a recurring failure mode; the lead must have a file-evidence recovery protocol** — ~10–12% of agent spawns complete their work to disk but never send the `STATUS: completed` envelope. The lead must NOT block waiting; reconstruct from `git status --short` + the story's `Files to Modify` table, run the verification the agent should have run, and record the silence in the cycle log via `hygiene_issue=<agent>_silent_lead_reconstructed_from_file_evidence`. The long-term fix is at the BMAD skill-customization level: structured-completion must be injected via `on_complete` (NOT `persistent_facts`, which is informational and doesn't fire a behavior; NOT `activation_steps_append`, which fires at setup time before the work).

