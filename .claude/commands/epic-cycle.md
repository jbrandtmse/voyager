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

Each pipeline-stage task is delegated via the `Agent` tool. The lead invokes lead-side skills (sprint planning, story creation, retrospective, and code review during silent-extraction fallback) directly via the `Skill` tool.

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
   - `subagent_type: "general-purpose"` (the default; specialized types may be used if the project has one configured).
   - `mode: "bypassPermissions"`.
   - `description: <3-5 word task description>`.
   - `prompt: <full task embedded in the spawn prompt — see Spawn Prompt Skeleton below>`.
2. **Reads** the returned message for the closing-summary sections (`## Files Modified`, `## Tests Added`, `## Decisions`, `## Issues Encountered`).
3. **Falls back** to `git status --short` filtered against the story's `Files to Modify` table if the closing sections are missing or incomplete. This is normal extraction, not a hygiene event.
4. **Records** the stage in the cycle log (see Completion Logging).
5. **Proceeds** to the next stage. There is no shutdown step.

### Spawn Prompt Skeleton

Because v3 has no BMAD `on_complete` hooks, the spawn prompt itself is the single source of truth for what the agent must do. Every Agent spawn prompt must include these elements, in this order:

1. The literal phrase `**Epic Cycle Stage: <stage-name> for Story <id>**` (e.g., "Epic Cycle Stage: dev for Story 3.3"). This is a marker so the agent (and a human reading the transcript later) can tell this run is under `/epic-cycle` rather than a direct user invocation.
2. The story file path (captured by the lead at story creation).
3. The list of files modified by upstream stages (for QA: dev's `## Files Modified`; for code review: dev's + QA's combined list).
4. The project's ADR registry path: `docs/adr/`.
5. The directive: `Use the Skill tool to invoke /<bmad-skill-name>.`
6. The stage-specific rule block from the section below.
7. The closing-summary directive — the agent must end its final message with the markdown sections per Rule 4 in `_bmad/custom/voyager-skill-rules.md`. The rule block already includes the section template, so this is covered.
8. Skill-specific context (story-only for dev; story + file list for QA; story + dev files + QA files for code review).

### Stage-specific rule blocks (copy into spawn prompts)

Each stage's spawn prompt includes the rule block from the matching subsection below. These blocks replace what v2's BMAD `on_complete` hooks were doing — same content, delivered as part of the spawn prompt instead.

**Dev spawn — append this block:**

```text
Rules for this stage (from _bmad/custom/voyager-skill-rules.md):

- Rule 5 (NFR tripwire response): if any task encounters an NFR that is
  unmeasurable, mathematically impossible, or internally contradictory, halt
  at that task, file an amendment to the relevant planning artifact (prd.md /
  architecture.md / epics.md), document the original-vs-amended wording in the
  Dev Agent Record, then continue against the amended NFR. Do NOT work around
  with code comments + deferred-work.md.
- Rule 6 (ADRs): consult the ADR registry above for any architectural or
  methodology decisions referenced in this story's ACs and Dev Notes. Match
  the implementation to the ADR's commitments.
- Rule 9 (APG primitives): a new slider component MUST consume
  `createSliderKeyboardHandler`; a new listbox component MUST consume
  `createListboxKeyboardHandler`. Inline re-implementation of an extracted
  APG contract is a HIGH-severity violation. See web/src/primitives/.

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
Rules for this stage (from _bmad/custom/voyager-skill-rules.md):

- Test discoverability: the test files you generate MUST be discoverable
  by the project's default test suite. Confirm they (a) follow the
  project's test-file naming convention (web vitest: `*.test.ts`; bake
  pytest: `test_*.py`), (b) are NOT excluded by an ignore file, and (c)
  are NOT tagged in a way that opts them out of the default run (slow /
  integration / @skip markers, etc.). New tests that exist on disk but
  never run are not progress.
- Rule 3 + Rule 8 + the Chrome DevTools MCP smoke-stage policy in the
  bmad-qa-generate-e2e-tests.toml persistent_facts: when the story
  touches web/src/, the test-summary output must include a dedicated
  "Chrome DevTools MCP smoke" section in addition to the standard
  Vitest unit / integration sections.

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
Rules for this stage (from _bmad/custom/voyager-skill-rules.md):

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
- Rule 9 (APG primitives): inline re-implementation of slider or listbox
  keyboard logic in a component is a HIGH finding — components must consume
  `createSliderKeyboardHandler` / `createListboxKeyboardHandler` from
  web/src/primitives/.

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

Rules for this stage (from _bmad/custom/voyager-skill-rules.md):

- Rule 5 (NFR tripwire response): ...
- Rule 6 (ADRs): ...
- Rule 9 (APG primitives): ...

End your final assistant message with the following markdown sections...
[remainder of dev rule block]
```

### Clarification protocol

If the agent encounters ambiguous requirements, the spawn prompt above directs it to end its final message with a `## Clarification Needed` section instead of the closing summary. The lead reads that section, surfaces the question to the user, then re-spawns the agent with the clarification appended to the story file or prompt context.

A clarification-needed return is NOT logged as `<stage>_complete` — log it as `<stage>_clarification_requested` with the question hash or a short summary, and log `<stage>_complete` only after the re-spawn succeeds.

### Pipeline Flow

```
Lead resolves project ADR registry path (docs/adr/) — persisted for every spawn prompt and per-story Layer-1 gate

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

**Mechanism:** multiple `Agent` tool calls in a single assistant message run concurrently. To dispatch a parallel batch, the lead emits one assistant message containing N `Agent` calls (one per story at the current stage) and waits for the tool-results message that resolves all of them together.

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

**Method selection for Voyager:**

- **Web/browser stories** (any `web/src/` change) — Drive the dev server via Chrome DevTools MCP. Navigate to the affected surface, exercise the feature, assert on observable DOM / render state / console output. See Rule 8 in voyager-skill-rules.md (Chrome DevTools MCP is the canonical browser-smoke driver; no shim needed post-Story 1.16).
- **Bake/CLI stories** (any `bake/` change with no web touch) — Invoke the relevant `just bake-*` recipe and inspect the produced files / stdout. Bake-only stories may be exempt from MCP smoke per Rule 3 — note the exemption explicitly.
- **Mixed stories** — Smoke both surfaces.

The smoke is NOT a substitute for automated test tiers; it's the final check that the wired-up system, end to end, produces the user-observable outcome the story promises.

**Mechanics:**

1. After `cr_complete` (with HIGH/MED resolved), determine the smoke method from the story's File List + ACs.
2. Execute the smoke directly, capturing evidence (screenshots, stdout, response body) into `_bmad-output/implementation-artifacts/<story-id>-smoke-evidence/`.
3. If the smoke fails, do NOT commit. Either (a) surface to the user for guidance, or (b) re-spawn the dev agent for a follow-up pass to fix and re-smoke. Failed smoke is a HIGH-severity finding that must clear before commit — never deferrable.
4. On success, append a cycle-log entry: `<UTC> TAB Story <id> TAB smoke_complete TAB method=<browser|cli|api|other> result=pass iterations=<N> defects_caught=<N> evidence=<path-or-summary> model=<lead-model>`. The `iterations` value is 1 for a smoke that passed on the first run; bump for each follow-up dev pass triggered by smoke failure. The `defects_caught` value is the count of bugs the smoke surfaced that the prior automated tiers passed — load-bearing telemetry for the "test pyramid is necessary but not sufficient" lesson.
5. Proceed to commit.

Single-threaded across a parallel batch — smoke each story in story order.

### Retrospective Review & Story X.0 Creation (Critical Gate)

After sprint planning and before building the story list, review the previous epic's retrospective and create a cleanup story. **Mandatory** — it closes the feedback loop between retrospectives and sprint planning.

1. **Calculate previous epic number** — if processing Epic N, look for Epic N-1's retrospective.
2. **Search for the retrospective file** — convention: `_bmad-output/implementation-artifacts/epic-{N-1}-retro-*.md`. If multiple matches exist, select latest by mtime, tie-break by lexicographic filename. Log which file was selected.
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

**Integration AC validation (lead-side, also a gate).** Before spawning the dev agent, read the story file's ACs and ask: does this story introduce a service, module, or component that later stories will consume? Indicators: a new file under `web/src/services/` or similar; a new exported class / factory / module; a `## Consumed-by` field naming downstream stories; an AC describing a public surface other stories will call against.

If yes — the story is **service-introducing** — it MUST contain at least one **Integration AC** of the form "consumer X reads from this service and produces observable effect Y." If absent, pause for the user:

> "Story <id> introduces <service-name>. No Integration AC found. Re-run `/bmad-create-story` to populate `## Integration ACs`, OR proceed without (with the consequence that producer-consumer wire-up defects can ship green)?"

If NOT service-introducing (pure refactor, doc-only, internal cleanup, defect-fix), this check finds no work; proceed.

### Context Handoff Between Stages (Critical)

The **story file path** is the canonical context anchor, passed forward to every downstream agent. File lists flow through the closing-summary sections in each agent's return value.

1. **Story creation → Developer**: lead passes the story file path to the developer.
2. **Developer → QA**: lead reads `## Files Modified` from dev's return and passes both the story file path AND the file list to QA.
3. **QA → Code reviewer**: lead reads `## Tests Added` from QA's return and passes story file path + dev's files + QA's tests to the code reviewer.
4. **Code reviewer → Commit**: lead uses the union of file lists from dev + QA to stage files for commit.

If a return value is missing the closing sections, fall back to `git status --short` filtered against the story's `Files to Modify` table. Do not block waiting for the agent.

### ADR-Aware Execution (Required)

Voyager's ADR registry is `docs/adr/`. ADRs commit to specific tooling, methodology, and architectural patterns. An AC satisfied by the wrong tool stack is equivalent to a HIGH-severity defect — it violates an Accepted ADR.

**Layer 1 — Lead-executed ADR-tooling gate (between `dev_complete` and `qa_spawn`).**

After dev returns and before QA is spawned, the lead inspects the story's ACs for any that map to ADR-committed agent-time tooling (visual / precision verification, performance profiling, audits, etc.). For each matched AC, the lead drives the verification using its own tool inventory — Chrome DevTools MCP for browser verification (ADR 0010 + Rule 8), etc.

This gate exists because **MCP tool inventories may not propagate reliably to spawned subagents**. The lead always has the MCP servers at the session level. Relocating ADR-mandated verification to the lead guarantees access without depending on subagent inheritance.

**Mechanics:**

1. Lead reads the story file (path captured at `story_created`).
2. For each AC, consult `docs/adr/`. If any Accepted ADR commits to a specific tool stack for the work the AC describes, the AC is "ADR-tooled."
3. Lead drives each ADR-tooled AC verification using the relevant MCP / tool, recording pass/fail + evidence paths.
4. Lead appends one cycle-log entry per story: `<UTC> TAB Story <id> TAB adr_verifications_complete TAB <metadata>` where metadata is whitespace-separated `key=value` pairs covering each verified AC.
5. On failure, surface to the user before spawning QA (the QA stage assumes the implementation is functionally correct).
6. Pass verification results (pass/fail + evidence pointers) to the code reviewer's spawn-prompt context.
7. If no ADR-tooled ACs exist, emit a single `adr_verifications_complete result=none_required` entry and proceed.

**Layer 2 — ADR registry path in every spawn prompt.**

`Project ADR registry: docs/adr/` is included in every agent spawn prompt as factual context. Agents must consult ADRs for architectural and methodology decisions referenced in their story's ACs and Dev Notes. The code reviewer specifically must verify implementations match Accepted ADR commitments — violations are HIGH severity, not LOW deferrable (Rule 6).

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

**Applies only to projects with git submodules.** Voyager currently has no submodules — this section is informational for future state.

When stories modify files in submodule directories:

1. **Commit and push inside each affected submodule first** (`git -C <submodule-path> add ... && git -C <submodule-path> commit && git -C <submodule-path> push`).
2. **Then commit and push in the parent repo**, staging both parent files AND the updated submodule pointers (`git add <submodule-path>`).

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
- Valid stages, in order: `story_created`, `dev_complete`, `adr_verifications_complete` (optional, between `dev_complete` and `qa_complete`; one line per story regardless of AC count), `qa_complete`, `cr_complete`, `smoke_complete` (mandatory, between `cr_complete` and `committed`), `committed`, `epic_summary` (optional, once per epic after the last committed entry). Clarification events use `<stage>_clarification_requested` and are followed by the eventual `<stage>_complete` on re-spawn.

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
- **Treating ADR violations as LOW deferrable findings** — An implementation that violates an Accepted ADR is HIGH severity. Code-reviewer customization must enforce this (Rule 6).
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
12. **Keep agent-behavior instructions in one place.** v2 split runtime agent behavior between the workflow's spawn prompts and four BMAD `.toml` `on_complete` hooks. When behavior changes, both surfaces have to stay in sync — and `on_complete` blocks are easy to forget about. v3 puts all runtime behavior in the spawn-prompt skeleton (this slash command) and keeps the `.toml` files minimal. Single source of truth.
