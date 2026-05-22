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

## Rule 10 — Lit reactive properties use `declare` + ctor-init (Story 3.6 lesson, 2026-05-22)

All Lit reactive properties declared via `static properties = { ... }` MUST be backed by a `declare <name>: <type>` field (NO initializer) and initialized in the **constructor body** — NOT by a class-field initializer.

**Canonical pattern citation:** `web/src/components/v-chapter-index.ts:235-262` (the pattern Story 3.6 ultimately matched after the trap surfaced).

```ts
// CORRECT (per Rule 10):
class MyEl extends LitElement {
  static properties = { foo: { type: String } };
  declare foo: string;  // no initializer here
  constructor() {
    super();
    this.foo = '';      // initialize in the ctor body
  }
}

// WRONG (silent reactive-accessor shadowing — runtime warning at
// lit.dev/msg/class-field-shadowing):
class MyEl extends LitElement {
  static properties = { foo: { type: String } };
  foo = '';  // class-field initializer SHADOWS Lit's generated accessor
}
```

**Why:** Lit's `static properties` codegen generates reactive accessors on the class. Class-field initializers run AFTER the accessor installation, so the initializer redefines the field as a plain own property, silently shadowing the accessor — `@property`-style reactivity is lost and the runtime emits a `class-field-shadowing` warning. The `declare` form tells TypeScript the property exists at the type level without emitting a class-field initializer; the ctor-body assignment goes through the reactive accessor.

**Enforcement:** `bmad-code-review` treats class-field-initialized Lit reactive properties as a HIGH finding (sibling of Rule 9's APG-primitive-inline-implementation HIGH). The check is grep-able: any `static properties =` declaration followed by an own-class-field initializer for the same name in the same class body is the violation.

**Why this rule exists today:** Story 3.6 (`<v-attitude-indicator>` HUD provenance element) burned ~half a day on this trap. The initial implementation used class-field initializers (`provenance = undefined`, `activeSpacecraftId = -31`, `attitudeService = null`) which silently shadowed Lit's reactive accessors generated by `static properties` → 19 of 25 unit tests failed on first run. Within the same story, the same trap was re-applied to `<v-hud>.embedEnabled` before the lesson sank in. Epic 4 (Story 4.4 `<v-timeline-scrubber variant="detail">`) and Epic 5 (PBD overlay components, `<v-attribution-panel>` variants) will introduce more Lit components; codifying the pattern here prevents re-discovery.

## Rule 11 — Build-pipeline scripts need end-to-end runtime tests (Story 3.3 lesson, 2026-05-22)

Any build script under `web/scripts/` or `bake/src/` that chains multiple library calls or shells out to external binaries (toktx, sharp, ffmpeg, gltf-transform, MeshoptEncoder, etc.) MUST have at least one end-to-end test that runs the full pipeline against a small real input fixture and asserts on the produced output bytes / file metadata. Unit tests on individual functions are necessary but not sufficient.

The E2E test MAY be a slow-tier test (`@slow` marker, `slow-tier` pytest marker, env-var-gated, or LFS-asset-presence-gated) so it does not burden the default test sweep. The point is that it exists and runs in CI against the production pipeline — not that it runs on every developer's local `pytest` invocation.

**Applies to:**

- `web/scripts/build_glb.ts` and successor pipelines (4K → 8K KTX2 emission in Story 4.3, etc.).
- `bake/src/ck_sample.py` / `bake/src/bake_trajectories.py` / `bake/src/l2_attitude_validation.py` and any future bake module that chains multiple SpiceyPy / numpy / scipy operations.
- Any script that emits a file consumed by production runtime (manifest, VTRJ, GLB, KTX2, brotli-compressed payload).

**Enforcement:** `bmad-code-review` treats a build-pipeline PR that lacks an E2E test as:

- MED when the script touches a multi-binary chain but the unit tier covers the boundary contracts.
- HIGH when the script ships an output artifact that production runtime consumes (e.g., a new manifest field, a new VTRJ kind, a new KTX2 transcode chain) AND no E2E test exercises the chain.

**Why this rule exists today:** Story 3.3 (`web/scripts/build_glb.ts` — articulated spacecraft GLB pipeline) had 22 unit tests that ALL passed without the full pipeline ever running. The lead's per-story smoke ran `npm run build-glb` end-to-end and surfaced two HIGH defects only the full chain could catch:

1. `writeTexturesAsKtx2()` handed WebP bytes to `toktx` — `toktx` has no WebP decoder; the call silently produced corrupt KTX2 output.
2. `EXTMeshoptCompression` writer threw on missing `MeshoptEncoder` in the NodeIO registry — the unit-tier piece tests mocked the registry.

Neither defect was visible in the piece tests; both surfaced immediately when the full pipeline ran. Epic 4 Story 4.3 (Cadence-Shift Trajectory Chunks + 4K → 8K Texture Upgrade) extends the build pipeline further; the unit-vs-E2E discipline established by Story 3.3 needs to carry forward.
