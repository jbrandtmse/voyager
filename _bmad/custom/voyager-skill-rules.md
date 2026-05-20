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

## Rule 6 — Chrome DevTools MCP is the canonical browser-smoke driver

When automating a browser smoke (per Rule 3) under Chrome DevTools MCP, agents must be aware of the Chrome-for-Testing 148 brotli gap: `new DecompressionStream('br')` throws. Story 1.8's boot-time capability probe redirects MCP-driven sessions to `/unsupported.html?reason=brotli`. The canonical workaround is to inject an `initScript` that stubs the brotli decompression stream to fall back to gzip (acceptable for smoke-test traffic).

This is tracked in `deferred-work.md` under the "Story 1.8 LOW" entry and will be resolved structurally in Story 2.0. Until then, the `initScript` shim is the documented standard.

**Why:** Without this workaround, every MCP-driven verification of a post-probe surface fails before reaching the app code.
