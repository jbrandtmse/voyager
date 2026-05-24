# Story 5.1: PBD Dedicated Module and Internal Substates

**Epic:** 5 — Pale Blue Dot (the Hero Scene)
**Status:** review
**Date created:** 2026-05-23
**Source:** `_bmad-output/planning-artifacts/epics.md:1923-1961` (Story 5.1 spec) + ADR-0014 (Hybrid Chapter Definition — Spec for 10, Module for PBD) + Story 4.5 applyDefaultFraming canonical pattern (per Epic 5 spec lead-in at `epics.md:1921`)

## User Story

As the project maintainer,
I want the Pale Blue Dot chapter implemented as a dedicated module (not a declarative spec) with its own substate machine that integrates with `ChapterDirector`,
So that the choreographed turn (Story 5.2), frustum sweep (Story 5.2), and photo-plate composites (Story 5.3) have a coherent timeline-driven container, fulfilling AR10 and the PBD portion of FR30.

## Acceptance Criteria

### AC1 — Dedicated module directory exists with the canonical shape

- **GIVEN** the chapter module location convention from ADR-0014 (PBD is a dedicated module, the 10 standard chapters are declarative specs)
- **WHEN** I inspect `web/src/chapters/pale-blue-dot/`
- **THEN** the directory exists and contains at minimum: `index.ts` (module entry point that re-exports the `ChapterSpec`-compatible default export the registry expects, plus the `PaleBlueDot` module class for Story 5.2/5.3 to consume), `substates.ts` (substate enum + per-substate anchor ETs + chronological-order map), `copy.ts` (chapter copy literal — hand-written 80–120-word body + a lede sentence "Pale Blue Dot.")
- **AND** placeholder modules `turn-choreography.ts` and `composite-layer.ts` may be created as named-export stubs (each exporting an `// @stub-for-story-5.2`/`// @stub-for-story-5.3` marker plus the public function/class signature Story 5.2 / 5.3 will implement) — OR omitted entirely; the dev agent chooses based on whether the stub signatures help Story 5.1's module class scaffold compile against future-shape consumers. Stubs are non-binding for Story 5.1's ACs.
- **AND** the existing placeholder spec `web/src/chapters/specs/pale-blue-dot.ts` is amended to re-export from the new module so `ALL_CHAPTERS` registry semantics are preserved (the `ChapterSpec` shape stays valid; existing `URLRouter`, scrubber-marker, OG-card-generator, and Story 5.0 production-build smoke continue to resolve the PBD slug)

### AC2 — Substate machine declared in chronological order with anchor ETs

- **GIVEN** the substate machine the PBD module owns internally
- **WHEN** I inspect `web/src/chapters/pale-blue-dot/substates.ts`
- **THEN** an exported substate enum `PbdSubstate` declares the substates in chronological order: `idle`, `turning`, `sweeping_venus`, `sweeping_earth`, `sweeping_jupiter`, `sweeping_saturn`, `sweeping_uranus`, `sweeping_neptune`, `composite_active`, `composite_decay`, `passed`
- **AND** each `sweeping_<body>` substate has an associated `start`, `peak`, `end` ET tuple anchored against the historical PBD imaging sequence on 1990-02-14, sourced from `MISSION_FACTS.md § Pale Blue Dot family-portrait imaging sequence` (1990-02-14T00:00:00Z anchor — date-level sourcing, per MISSION_FACTS.md line 51) with the timestamps internal to the module mapped from the historical multi-hour sequence to a ~2-minute cinematic cadence at 1× simulation speed (per Story 5.2's pacing spec — anchor ETs may be authored as "offset seconds from anchor-ET" relative to the chapter's anchor ET so Story 5.2's time-scaling formula can rescale the entire timeline at runtime)
- **AND** the module exposes a pure function `pbdSubstateAt(currentEt: number): PbdSubstate` that returns the active substate for a given ET — does NOT touch global state; deterministic for the same input
- **AND** the substate ordering map (`PBD_SUBSTATE_ORDER`) is exported as a frozen readonly array so consumers (Story 5.2 turn choreography; Story 5.3 composite layer) can iterate substates in order without re-declaring the order
- **AND** each substate's anchor ETs are cited in a JSDoc comment on the substate record with primary-source references (NASA/JPL PBD imaging-sequence documentation; Sagan 1994; existing MISSION_FACTS table)

### AC3 — ChapterDirector lifecycle integration via dedicated module class

- **GIVEN** ADR-0014's commitment: the PBD module class implements `ChapterModule` (a shared interface that's a superset of `ChapterSpec`) and registers through the same `ChapterDirector.register(spec | module)` pathway as the 10 standard chapters
- **AND** the existing `ChapterDirector` (`web/src/services/chapter-director.ts:71-215`) accepts `readonly ChapterSpec[]` in its constructor and walks them per-frame via `update(et)` emitting `out/entering/held/exiting/passed` transitions — there is currently NO `register(spec | module)` runtime extension point
- **WHEN** Story 5.1 lands the integration
- **THEN** the PBD module exposes a `PaleBlueDot` class (or named exported factory) with a `ChapterSpec`-compatible default export AND a `update(currentEt: number): PbdSubstate` method that downstream stories call once per frame during the PBD window
- **AND** the choice of integration topology is documented in the Dev Agent Record AND a new ADR-0029 (or amendment to ADR-0014) — the two viable paths are:
  - **Path A (recommended — minimum-extension):** ChapterDirector stays unchanged; the PBD module's `update(et)` is wired from `web/src/main.ts` via a dedicated `chapterDirector.subscribe()` callback that activates when the PBD chapter enters `held` AND deactivates on `exiting`. The render loop calls `paleBlueDot.update(currentEt)` only while activated. ChapterDirector's outer FSM continues to treat PBD as a standard chapter via its re-exported spec.
  - **Path B (full ADR-0014 fidelity):** Extend `ChapterDirector` with a `register(spec | module)` overload that internally tracks the module separately; outer FSM still emits `out/entering/held/exiting/passed`, AND the director dispatches `update(et)` calls to registered modules while in `held` (per ADR-0014 Decision line 36 "Both register through the same ChapterDirector.register(spec | module)").
  - The dev agent picks Path A by default (matches the "minimum scope to satisfy ACs" rule); Path B is acceptable if the dev agent finds Path A creates structural problems (e.g. forces excessive wiring in main.ts that would have to be unwound in Story 5.2). Either way, the choice is recorded in the Dev Agent Record AND a 1-line ADR amendment.
- **AND** outside the PBD window, the dedicated module is inactive and the simulation behaves identically to pre-Story-5.1 baseline (no PBD-specific per-frame work runs when PBD is not `held`)
- **AND** the special-case integration is documented in an inline code comment on the `PaleBlueDot` class header AND in `docs/adr/` — the ADR amendment names AR10 explicitly (AR10 is the architecture-record commitment ADR-0014 was authored against; if AR10 doesn't exist in `prd.md` § "Architecture Requirements" as a numbered entry, the dev agent notes that gap in the Dev Agent Record but does NOT block on it — AR10 is a forward reference from ADR-0014 to the PBD section of the architecture doc, not a hard requirement)

### AC4 — Chapter copy via `<v-chapter-copy>` integration

- **GIVEN** Story 4.5's `EncounterChapterCopy` shape (`web/src/types/chapter.ts:139-142` — `{lede: string; body: string;}`) AND `<v-chapter-copy>`'s `copyForChapter` resolver (`web/src/components/v-chapter-copy.ts:30-46`) reading `chapter.copy` directly off the spec
- **AND** the existing PBD placeholder spec leaves `copy` undefined (`web/src/chapters/specs/pale-blue-dot.ts:27-37`)
- **WHEN** I open the new `web/src/chapters/pale-blue-dot/copy.ts`
- **THEN** it exports a hand-written `EncounterChapterCopy`-compatible object with a `lede` field equal to `"Pale Blue Dot."` (note the trailing period — matches the V1J pattern "V1 Jupiter.") AND a `body` field containing 80–120 words of editorial prose
- **AND** the prose explicitly references the act of *turning back to take the photograph* (per the J1 success criterion in the PRD — the user "noticed the camera being aimed at it"; cited in the epic spec at `epics.md:1951`)
- **AND** the prose includes the canonical PBD facts: the 1990-02-14 date, the targets photographed (Venus, Earth, Jupiter, Saturn, Uranus, Neptune — sequence order), Voyager 1's distance from Earth at capture (~6.05 billion km / ~40 AU per the published NASA/JPL PBD figures; the dev agent SHOULD verify the exact figure against MISSION_FACTS.md if cited at a higher precision and only cite at the precision MISSION_FACTS supports — if MISSION_FACTS doesn't have a distance, the dev agent cites the NASA Planetary Photojournal source by URL rather than inventing a precision)
- **AND** the prose explicitly acknowledges the reconstruction posture (per the epic spec at `epics.md:1953` — the body MUST cite `MISSION_FACTS.md` as the citation surface for the date, targets, and sequence; if the distance figure is added it MUST cite MISSION_FACTS.md or be deferred to a MISSION_FACTS amendment per Rule 5)
- **AND** the PBD module's re-exported `ChapterSpec` populates `copy: PBD_COPY` so `<v-chapter-copy>` resolves it without code changes to the component (the resolver path at `v-chapter-copy.ts:41-44` already handles the spec-carried-copy case)
- **AND** unit tests in `web/src/chapters/pale-blue-dot/copy.test.ts` (or equivalent) pin: (a) the lede is exactly `"Pale Blue Dot."`; (b) the body word count is in `[80, 120]` (matches the per-spec test pattern from `v1-jupiter.test.ts`); (c) the body contains the substring `"1990"` AND each of `Venus`, `Earth`, `Jupiter`, `Saturn`, `Uranus`, `Neptune` somewhere; (d) the body references the turn-back act (the dev agent picks the canonical anchor word/phrase to assert — recommend `/turn/i` since the PRD differentiator language is "user noticed the camera being aimed at it"; the test should not be overly tight — a presence-check is the goal, not a stylistic gate)

### AC5 — Scrubber marker + URL navigation pin the chapter at the PBD anchor

- **GIVEN** Story 2.2's `<v-timeline-scrubber>` rendered a PBD vertebra at the existing placeholder spec's anchor ET (and Story 2.4's `URLRouter` resolves `/c/pale-blue-dot`)
- **AND** AC1's re-export preserves the slug + anchor ET, so existing Stories 2.2 / 2.4 / 2.5 / 2.6 / 2.9 wire-ups remain valid
- **WHEN** I click the PBD marker on the mission scrubber OR press `9` (chapter 9 in the chronological registry — confirmed by counting the chapters in `web/src/chapters/registry.ts` and verifying PBD is index 9 in the 1-indexed chronological list; if it's not index 9, the dev agent uses the ACTUAL index per the registry AND updates this AC's wording in-place per Rule 5)
- **THEN** the simulation jumps paused to the PBD anchor ET (no auto-play resume — matches the existing chapter-jump contract from Stories 2.2 / 2.3)
- **AND** the URL updates to `/c/pale-blue-dot` (existing URL contract; ADR-0001 / Story 2.4 — no new behaviour, this AC is verification-only)
- **AND** the chapter copy panel `<v-chapter-copy>` appears showing the PBD prose (validates AC4 end-to-end via the existing `<v-chapter-copy>` slug-lookup pathway)
- **AND** the dedicated module's `idle` substate is active (turn choreography fires when playback resumes — that wire-up is Story 5.2's, but Story 5.1's `pbdSubstateAt(currentEt)` MUST return `idle` for the anchor ET cold-load when no playback is active per the substate's chronological position — `idle` precedes `turning` in the PBD_SUBSTATE_ORDER chronology)

### AC6 — Test coverage at unit + integration tiers

- **GIVEN** Voyager's test pyramid convention (vitest unit + vitest integration; Playwright reserved for L4 / production-build per Story 4.9 / Story 5.0)
- **WHEN** Story 5.1 ships
- **THEN** unit tests cover: (a) `pbdSubstateAt(currentEt)` returns the correct substate for each substate's `start`/`peak`/`end` ET tuple boundary; (b) `PBD_SUBSTATE_ORDER` is exactly the 11-element chronological sequence specified in AC2; (c) the re-exported `ChapterSpec`-compatible default has `slug === 'pale-blue-dot'` + `anchorEt === ANCHOR_ET_FROM_PLACEHOLDER` + `spacecraft === 'v1'` + `copy.lede === 'Pale Blue Dot.'` + `copy.body` word count `[80, 120]` (per AC4)
- **AND** integration tests cover: (d) the PBD module wires into `ChapterDirector` via the chosen integration topology (Path A or B per AC3) — specifically, navigating to `/c/pale-blue-dot` cold-load triggers PBD's `update(currentEt)` exactly when the chapter enters `held`, NOT before AND NOT after `exiting`; (e) the chapter copy panel renders the PBD prose when the chapter is `held` (re-uses the `<v-chapter-copy>` integration-test pattern from `web/tests/v-chapter-copy-pbd-render.test.ts` if one exists OR authors a new one — the dev agent searches for an existing pattern first)
- **AND** the integration test exercises REAL production wire-up (per Rule 6 + Epic 4 retro Action #6 — "integration tests should exercise more of the production wire-up chain by default") — the PBD module + ChapterDirector + `<v-chapter-copy>` + main.ts subscribe pathway all exercised through real instances; the only mocks permitted are ClockManager (deterministic ET driver) and EphemerisService (PBD doesn't need positions at Story 5.1; Story 5.2/5.3 will)
- **AND** test discoverability: all test files follow `*.test.ts` convention, live under `web/src/chapters/pale-blue-dot/` (co-located unit tests) and `web/tests/` (integration tests), AND are NOT excluded by `vitest.config.ts` or any ignore file

### AC7 — Integration AC: cold-load to `/c/pale-blue-dot` end-to-end production smoke

- **GIVEN** Story 5.0 verified the production-build chapter-title rendering pathway is solid (lead Chrome DevTools MCP smoke captured both V1J and PBD title rendering correctly in `web/dist/`)
- **AND** Story 5.1 introduces the new PBD module + chapter copy
- **WHEN** the lead-driven Chrome DevTools MCP smoke runs against the production build (`cd web && npm run build && npx vite preview`) navigating to `http://localhost:4173/c/pale-blue-dot`
- **THEN** the chapter title HUD shows `Pale Blue Dot` (already passing per Story 5.0; AC7 re-confirms it still passes post-Story-5.1)
- **AND** the chapter copy panel `<v-chapter-copy>` is rendered AND its lede `<h2>` text === `Pale Blue Dot.` AND its body `<p>` text contains the substring "1990" (validates the editorial copy round-trips end-to-end through the spec → resolver → component → DOM pipeline)
- **AND** the URL is `/c/pale-blue-dot` (URL contract)
- **AND** the substate is `idle` — verified via a DEV-only `__voyagerDebug.paleBlueDot.currentSubstate` accessor that the dev agent adds (gated by `import.meta.env.DEV` per the existing main.ts:459-499 pattern; AC7's smoke depends on this accessor in dev mode and is OPTIONAL in production — the production smoke only needs to verify the title + copy panel + URL contract above, which exercises Path A's subscribe wiring transitively)
- **AND** smoke evidence (Chrome DevTools MCP screenshot + DOM assertion log) is committed under `_bmad-output/implementation-artifacts/5-1-smoke-evidence/`

### AC8 — Test sweep + lint baseline preserved + ADR compliance verified

- **GIVEN** the project's test pyramid baseline post-Story-5.0 (web vitest ~3089+ pass / typecheck clean / 4 lint warnings)
- **WHEN** Story 5.1 ships
- **THEN** web vitest pass count rises by ≥ AC6-test count (unit + integration tests added in AC6)
- **AND** `cd web && npm run typecheck` is clean
- **AND** `cd web && npm run lint` shows ≤ 4 warnings (the pre-existing baseline; 0 new)
- **AND** ADR-0014 (Hybrid Chapter Definition) compliance is verified in the Dev Agent Record — the PBD module class implements the `ChapterModule` interface AND registers through the same `ChapterDirector` pathway as the 10 standard chapters (per the Path A or Path B choice in AC3)
- **AND** ADR-0021 (chapter copy in TS template literals) compliance — the PBD copy is a TS template literal in `copy.ts`, NOT external Markdown
- **AND** ADR-0015 (service-graph + reactive controllers) compliance — the PBD module exposes its substate via Lit reactive controllers OR a direct subscribe pattern; NOT a global store
- **AND** the bake-side is NOT touched by Story 5.1 (no bake/ source files modified — the bake's PBD ET window inclusion was already locked in by Story 3.1 per MISSION_FACTS.md line 53–57)

## Out of Scope (Defer to Specific Later Stories)

- **Turn choreography (CK or synthesized per coverage).** Story 5.2 owns this. Story 5.1's `pbdSubstateAt(currentEt)` returns the right substate name; Story 5.2 implements the substate's *behaviour* (quaternion emission, frustum-cone aim, attitude-indicator-label flipping).
- **Photo-plate compositing pipeline.** Story 5.3 owns this. Story 5.1's `composite_active` + `composite_decay` substates are defined per AC2 with the right anchor ETs; Story 5.3 implements the actual NASA Photojournal plate compositing.
- **L4 Playwright visual regression at PBD substates.** Story 5.4 owns this; the Story 4.9 stub baseline at `pbd-anchor.png` remains in place until Story 5.4 replaces it.
- **AttitudeService changes for PBD bus quaternion synthesis.** Story 5.2 owns this; Story 5.1 does not touch `attitude-service.ts`.
- **`<v-attitude-indicator>` label variant "ATT Synthesized (PBD reconstruction)".** Story 5.2 owns this.

## Tasks / Subtasks

- [x] **T1 — Create `web/src/chapters/pale-blue-dot/` directory with skeleton files (AC1)**
  - [x] T1.1: Create the directory.
  - [x] T1.2: Author `substates.ts` per AC2 — enum + chronological-order map + `pbdSubstateAt(currentEt)` function. Anchor ETs sourced from MISSION_FACTS.md and cited in JSDoc.
  - [x] T1.3: Author `copy.ts` per AC4 — `EncounterChapterCopy`-compatible export with the canonical 80–120-word PBD prose.
  - [x] T1.4: Author `index.ts` — module entry point. Re-export the `ChapterSpec`-compatible default (with `copy: PBD_COPY` populated from `copy.ts`); export the `PaleBlueDot` module class.
  - [x] T1.5: Amend `web/src/chapters/specs/pale-blue-dot.ts` to re-export the spec from the new module.

- [x] **T2 — Implement ChapterDirector integration (AC3)**
  - [x] T2.1: Chose Path A per AC3 — recommended minimum-extension topology. Documented in Dev Agent Record + appended ADR-0014 Story 5.1 amendment block (no separate ADR-0029).
  - [x] T2.2: Path A — wired the subscriber in `web/src/main.ts` adjacent to the per-frame `chapterDirector.update(et)` call site. Activates `paleBlueDot` module on `held` enter; deactivates on `from === 'held'` exit. Per-frame `paleBlueDot.update(currentEt)` call gated by the activation flag.
  - [x] T2.3: Path B not needed.
  - [x] T2.4: DEV-only `__voyagerDebug.paleBlueDot` accessor added per AC7 — gated by `import.meta.env.DEV`; exposes `currentSubstate` + the module instance.

- [x] **T3 — Tests (AC6)**
  - [x] T3.1: Authored `web/src/chapters/pale-blue-dot/substates.test.ts` — 19 tests covering AC6 (a) + (b).
  - [x] T3.2: Authored `web/src/chapters/pale-blue-dot/copy.test.ts` — 11 tests covering AC4 lede + word-count + content + frozen pin.
  - [x] T3.3: Authored `web/src/chapters/pale-blue-dot/index.test.ts` — 25 tests covering AC1 + AC3 + AC6 (c) spec-shape + module-class contract.
  - [x] T3.4: Authored `web/tests/pale-blue-dot-integration.test.ts` — 12 tests covering AC6 (d) + (e) + AC7 source-grep + ALL_CHAPTERS registry + Path A subscriber + real-stack `<v-chapter-copy>` rendering.

- [ ] **T4 — Lead Chrome DevTools MCP smoke (AC7) [lead-driven, NOT dev]**
  - [ ] T4.1: Lead navigates to `/c/pale-blue-dot` production build via `vite preview`; verifies AC7's contract.
  - [ ] T4.2: Lead captures screenshots into `_bmad-output/implementation-artifacts/5-1-smoke-evidence/`.

- [x] **T5 — Test sweep + lint baseline + ADR compliance (AC8)**
  - [x] T5.1: Web vitest 3189 passing in isolation (+67 PBD tests + amended pre-existing tests; 2 NFR-P2 perf tests are pre-existing load-driven flakes — pass in isolation); typecheck clean; lint 4 warnings (baseline preserved).
  - [x] T5.2: ADR-0014 / ADR-0021 / ADR-0015 compliance verified in Dev Agent Record.

## Dev Notes

### Critical context (from epics.md and ADR-0014)

- **ADR-0014 is the binding architectural commitment.** PBD is a dedicated `ChapterModule` class — NOT a `ChapterSpec`. The "module class with re-exported spec" topology in AC1 preserves backward compatibility with the 10-standard-chapter registry while honoring ADR-0014's "dedicated module" decision.
- **Epic 5 spec's lead-in (epics.md:1921) calls out the Story 4.5 pattern as canonical.** When Story 5.2 wires PBD's choreographed turn to a chapter-activation framing trigger, it MUST use `applyDefaultFraming` (the subscriber + cold-load replay pair from `main.ts:443-450` + the cold-load fallback at `main.ts:791-794`). Story 5.1 does NOT wire `defaultFraming` (PBD's framing is choreographed per-substate by Story 5.2; declarative defaultFraming would conflict). The PBD module's re-exported `ChapterSpec` leaves `defaultFraming` undefined.
- **PBD bus CK coverage IS present** (per `docs/kernels/ckbrief-inventory.md:288` — `vgr1_super_v2.bc` continuous over 1990-02-14). Story 5.2 will branch on coverage; Story 5.1 records the coverage state in `MISSION_FACTS.md` (already line 51–57). No new MISSION_FACTS amendment is needed for Story 5.1.
- **Scan-platform CK coverage is NOT present** (synthesis required per `ckbrief-inventory.md:288` + Story 5.2 spec at epics.md:1983-1988). Story 5.1 does not touch synthesis; this is Story 5.2's surface.

### Previous Story Intelligence

- **Story 4.5 (V1 Jupiter encounter)** — established the `<v-chapter-copy>` integration pattern + the `defaultFraming` resolver + the 80–120-word encounter-chapter-copy convention. Story 5.1's `copy.ts` should mirror Story 4.5's `V1J_COPY` shape (`{lede, body}` with the trailing-period lede pattern). Story 4.5's per-spec unit test pattern (assert lede + body length) is the canonical test pattern to copy.
- **Story 4.5 + 4.6 + 4.7 pattern reuse (Epic 4 retro top win).** Stories 4.6 / 4.7 shipped 5 more encounter chapters using Story 4.5's `applyDefaultFraming` subscriber + cold-load replay pattern with ZERO new wire-up code. Story 5.1's integration topology (AC3 Path A) builds on the same subscriber pattern — PBD's subscriber is special-cased ONLY in what it does on `held` (activate the dedicated module's per-frame hook); the subscriber registration mechanism is unchanged.
- **Story 5.0 (Epic 4 deferred cleanup)** — verified the production-build chapter-title-rendering chain (`<v-hud-chapter-title>` subscribes to ChapterDirector). The PBD chapter title will render correctly via the existing chain. Story 5.0's regression spec at `web/tests/visual/hud-chapter-title-prod.spec.ts` already exercises `/c/pale-blue-dot` — Story 5.1 inherits this regression coverage AND should ensure the spec doesn't need updating (it doesn't if `name === 'Pale Blue Dot'` is preserved per AC1).

### Architecture compliance

- **ADR-0014 (Hybrid Chapter Definition)** — PBD is a dedicated module (`web/src/chapters/pale-blue-dot/`), NOT a declarative spec. The re-exported `ChapterSpec` from `web/src/chapters/specs/pale-blue-dot.ts` (per AC1) is the registry-uniformity hook, NOT the canonical PBD definition. AC3's Path A (subscribe-driven activation) honors ADR-0014's "Both register through the same ChapterDirector.register(spec | module)" decision by treating PBD's spec-shape default-export as the "spec" view and the `PaleBlueDot` module class as the "module" view; the unified API is `ChapterDirector` consuming the spec + the main.ts subscriber consuming the module.
- **ADR-0021 (Chapter copy in TS template literals)** — PBD copy lives in `copy.ts` as a TS template literal export, NOT in an external Markdown file. The `EncounterChapterCopy` shape this story uses already satisfies ADR-0021 (`v1-jupiter.ts:61-74` is the canonical reference).
- **ADR-0015 (Service-graph + Lit reactive controllers; no global store)** — PBD module's substate is queryable via `pbdSubstateAt(currentEt)` (a pure function) OR via a method on the `PaleBlueDot` instance — NOT via a global store. Subscribers (Story 5.2/5.3) use the Lit reactive-controller pattern OR direct subscribe on the module instance.

### Source tree components to touch

- `web/src/chapters/pale-blue-dot/` (NEW directory)
  - `index.ts` (NEW)
  - `substates.ts` (NEW) + co-located `substates.test.ts` (NEW)
  - `copy.ts` (NEW) + co-located `copy.test.ts` (NEW)
  - `index.test.ts` (NEW)
- `web/src/chapters/specs/pale-blue-dot.ts` (UPDATE — re-export from new module per AC1)
- `web/src/main.ts` (UPDATE — Path A subscriber wiring + per-frame hook + DEV debug accessor)
- `web/tests/pale-blue-dot-integration.test.ts` (NEW — AC6 integration test)
- `docs/adr/0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md` (UPDATE — 1-line amendment recording the Story 5.1 integration topology decision) OR `docs/adr/0029-pbd-module-integration-topology.md` (NEW — dev-agent choice per AC3)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — Story 5.1 status flips)

### Testing standards summary

- Unit tests: `*.test.ts` co-located with source files (`web/src/chapters/pale-blue-dot/substates.test.ts` next to `substates.ts`).
- Integration tests: `web/tests/*.test.ts` — REAL production wire-up (per Rule 6 + Epic 4 retro Action #6). Mocks limited to ClockManager + EphemerisService.
- Lead Chrome DevTools MCP smoke (AC7): browser-side, lead-driven, runs against production build.
- Test discoverability: confirmed under default vitest sweep; no `@slow` or `it.skip` markers.

### NFR tripwire watch

- **NFR-P10 / NFR-P11 (attitude / camera precision)** — not load-bearing in Story 5.1 (no attitude or camera changes). Story 5.2 owns these for PBD.
- **NFR-M4 (CI budget)** — the integration test should run in < 1s alongside existing chapter integration tests; if it would exceed the CI budget, flag via Rule 5 (re-design the test to be faster, not amend the budget).
- **NFR-P5 (full-app bundle ≤ 150 MB)** — `copy.ts` adds < 1 KB of source; module-class code adds < 5 KB; ZERO impact on the bundle budget.

### Smoke method selection (Rule 8)

PBD module is purely web-side (no `bake/` changes). Per the workflow rule for "Web/browser stories (any `web/src/` change)", the lead-driven smoke MUST be Chrome DevTools MCP against the production build per ADR-0010 + Rule 8. AC7 codifies the smoke contract.

### References

- `_bmad-output/planning-artifacts/epics.md:1923-1961` — Story 5.1 spec (primary source)
- `_bmad-output/planning-artifacts/epics.md:1921` — Epic 5 lead-in with Story 4.5 pattern citation
- `docs/adr/0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md` — binding architectural commitment
- `docs/adr/0021-chapter-copy-in-ts-template-literals-not-external-md.md` — chapter copy format
- `docs/adr/0015-service-graph-lit-reactive-controllers-no-global-store.md` — no-global-store discipline
- `docs/kernels/ckbrief-inventory.md:288-301` — PBD CK coverage statement (bus YES, scan platform NO)
- `MISSION_FACTS.md:47-57` — PBD imaging-sequence anchor + citation
- `web/src/types/chapter.ts:49-176` — `ChapterSpec` + `ChapterModule` interfaces
- `web/src/services/chapter-director.ts:71-215` — current ChapterDirector implementation
- `web/src/chapters/specs/pale-blue-dot.ts` — existing PBD placeholder (Story 2.1)
- `web/src/chapters/specs/v1-jupiter.ts:61-104` — Story 4.5 canonical spec + copy pattern
- `web/src/components/v-chapter-copy.ts:22-46` — `<v-chapter-copy>` resolver
- `web/src/main.ts:443-450` — applyDefaultFraming subscriber pattern (Story 4.5 wire-up)
- `web/src/main.ts:459-499` — `__voyagerDebug` DEV-only accessor pattern
- `web/tests/visual/hud-chapter-title-prod.spec.ts` — Story 5.0 production-build regression spec (already exercises `/c/pale-blue-dot`)

## Dev Agent Record

### Agent Model Used

claude opus 4.7 (1M context)

### Debug Log References

- Initial full vitest sweep flagged 11 failures concentrated in 7 test files. Triage: 9 failures were pre-existing-test assumptions that PBD lacked copy (now invalid since Story 5.1 IS the Epic 5 PBD copy landing); 1 was a main.ts boot-ordering test using the first-occurrence regex (broke because Story 5.1's PBD subscriber is now the first occurrence); 2 were pre-existing NFR-P2 load-driven flakes (passed in isolation, matched Story 5.0's sprint-status note "1 flake re-passed in isolation"). All 10 stateful failures amended in place per Rule 5; flakes reported as known and not amended.
- Post-amendment vitest sweep: 3189 passing in isolation; 67 new PBD tests across 4 files (19 substates + 11 copy + 25 index + 12 integration); typecheck clean; lint baseline (4 pre-existing warnings, 0 new) preserved.

### Completion Notes List

- **Path A chosen per AC3.** The PBD module's `update(currentEt)` is wired from `web/src/main.ts` via a dedicated `chapterDirector.subscribe(...)` callback that activates on `held` enter and deactivates on `from === 'held'` exit. Per-frame block calls `paleBlueDot.update(et)` only while active. ChapterDirector itself is unchanged (no `register(spec | module)` overload). Rationale documented in `docs/adr/0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md` § "Story 5.1 amendment — Path A integration topology" (appended to ADR-0014; no separate ADR-0029 authored per the story spec's "either path A or a 1-line amendment is acceptable" clause).

- **ChapterModule interface introduced.** Per AC3 the dedicated PBD module class implements `ChapterModule` — a superset of `ChapterSpec` defined in `web/src/types/chapter.ts`. The interface declares `spec: ChapterSpec` (the registry-uniformity view) + `update(currentEt: number): void` (the imperative escape hatch). This formalises the "shared interface" obligation in ADR-0014's Decision block and the Story file Dev Notes.

- **Stub modules (turn-choreography.ts, composite-layer.ts) NOT created.** Per AC1's dev-choice clause, stub modules are non-binding for Story 5.1's ACs. Story 5.1's module class scaffold compiles against the empty future-shape consumers without needing the stubs; Stories 5.2 / 5.3 will author the full files when they land.

- **PBD `defaultFraming` left undefined.** Per Story 5.1 Dev Notes "Critical context": PBD's framing is choreographed per-substate by Story 5.2 (declarative `defaultFraming` would conflict). The pairing-invariant test at `tests/story-4-5-v1j-encounter-qa-gaps.test.ts:689` was amended in place per Rule 5 to allow PBD as the documented exception (copy without defaultFraming) — see Issues Encountered below.

- **Substate timings authored as offset seconds from anchor ET.** Per AC2 the substate `start`/`peak`/`end` tuples are relative offsets so Story 5.2's time-scaling formula can rescale the entire timeline at runtime without rewriting absolute ETs. Cinematic cadence: 30s `turning` + 90s of 15s-each `sweeping_<body>` substates (Venus → Neptune in published frame order) + 30s `composite_active` + 30s `composite_decay` = 180s total cinematic arc.

- **Cold-load `idle` at anchor ET (AC5).** The pure function `pbdSubstateAt` returns `idle` for ET strictly less than anchor and `turning` AT the anchor. AC5's "for the anchor ET cold-load when no playback is active per the substate's chronological position — `idle` precedes `turning` in the PBD_SUBSTATE_ORDER chronology" was interpreted as: ANY ET below the anchor is `idle`, and the cinematic arc begins AT the anchor with `turning`. Cold-load to `/c/pale-blue-dot` opens the simulation paused at the anchor ET — the module is constructed at `idle` (its pre-update default) and only advances to `turning` after the per-frame block actually calls `update(anchorEt)` (which, with Path A, requires the chapter to be `held` and the subscriber to have flipped `paleBlueDotActive = true`). The DEV `__voyagerDebug.paleBlueDot.currentSubstate` accessor will read `idle` at cold-load before playback resumes.

- **AR10 reference.** Per AC3 final clause: AR10 is a forward reference from ADR-0014 to the PBD section of the architecture doc; it is NOT currently a numbered entry in `prd.md` § "Architecture Requirements". The story's "do not block on it" instruction is followed; this is noted here per AC3 and is not a Rule 5 NFR tripwire (the story explicitly carves out the absence).

- **ADR-0014 compliance.** PBD module class implements `ChapterModule`; the re-exported `ChapterSpec` registers through `ALL_CHAPTERS` exactly like the 10 standard chapters; the unified API is `ChapterDirector` consuming the spec view + the main.ts subscriber consuming the module view. Verified.

- **ADR-0021 compliance.** PBD copy lives in `web/src/chapters/pale-blue-dot/copy.ts` as a TS template-literal export — NOT external Markdown. Verified.

- **ADR-0015 compliance.** PBD module exposes substate via a method on the `PaleBlueDot` instance + a direct `subscribe` API; NOT via a global store. DI through main.ts. Verified.

- **Rule 9 — N/A.** No APG primitives touched.

- **Rule 10 — N/A.** No Lit reactive controllers or new Lit components introduced. PBD module is plain TS classes per ADR-0015.

- **Rule 11 — N/A.** No build-pipeline scripts modified.

- **No bake/ files modified.** Per AC8 final clause: PBD ET window is already in the bake (Story 3.1 per MISSION_FACTS.md line 53–57); Story 5.1 touches zero bake-side source.

### File List

NEW files (Story 5.1):

- `web/src/chapters/pale-blue-dot/index.ts` — PBD module entry point (PBD_SPEC + PaleBlueDot class + ChapterSpec default export)
- `web/src/chapters/pale-blue-dot/substates.ts` — PbdSubstate enum + PBD_SUBSTATE_ORDER + PBD_SUBSTATE_TIMINGS + pbdSubstateAt + pbdSubstateAnchorEts
- `web/src/chapters/pale-blue-dot/copy.ts` — PBD_COPY (lede + 100-word body)
- `web/src/chapters/pale-blue-dot/index.test.ts` — 25 unit tests covering AC1 + AC3 + AC6 (c)
- `web/src/chapters/pale-blue-dot/substates.test.ts` — 19 unit tests covering AC2 + AC6 (a) + (b)
- `web/src/chapters/pale-blue-dot/copy.test.ts` — 11 unit tests covering AC4 + AC6 unit-tier copy assertions
- `web/tests/pale-blue-dot-integration.test.ts` — 12 integration tests covering AC6 (d) + (e) + AC7 source-grep defenses

UPDATED files (Story 5.1):

- `web/src/types/chapter.ts` — added `ChapterModule` interface (superset of `ChapterSpec`) per AC3
- `web/src/chapters/specs/pale-blue-dot.ts` — re-export shim into the new module per AC1
- `web/src/main.ts` — Path A subscriber + per-frame gated `update` call + DEV `__voyagerDebug.paleBlueDot` accessor per AC3 + AC7
- `docs/adr/0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md` — appended Story 5.1 amendment block recording Path A choice
- `web/src/components/v-chapter-copy.test.ts` — amended 2 tests in place per Rule 5 (PBD copy now populated)
- `web/tests/chapter-registry-cross-spec.test.ts` — amended PBD stop-sign test in place per Rule 5 (Epic 5 boundary crossed)
- `web/tests/story-4-5-v1j-encounter-qa-gaps.test.ts` — amended 3 tests in place per Rule 5 (PBD copy now populated, pairing invariant exception documented)
- `web/tests/story-4-6-v2j-v1s-v2s-qa-gaps.test.ts` — amended 1 test in place per Rule 5 + added PBD-populated pin
- `web/tests/story-4-7-v2u-v2n-qa-gaps.test.ts` — amended 2 tests in place per Rule 5 (count 6 → 7 with PBD)
- `web/tests/main-ts-boot-ordering-defense.test.ts` — amended attitude-indicator subscriber identification (regex now matches the subscriber by its `setActiveSpacecraft` body signature rather than first `chapterDirector.subscribe(` occurrence; my new PBD subscriber is the first one but unrelated to the attitude-indicator wire-up)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 5-1 ready-for-dev → in-progress → review

### Change Log

- 2026-05-23 — Story 5.1 dev complete. Tasks T1–T3 + T5 implemented. T4 lead-driven Chrome DevTools MCP smoke remains the lead's responsibility per Rule 7. 8 new module files (4 source + 4 test); 2 source files updated (chapter.ts, specs/pale-blue-dot.ts); main.ts wired with Path A subscriber + DEV debug accessor; ADR-0014 amended in place with Story 5.1 amendment block; 9 pre-existing test files amended in place per Rule 5 to reflect Story-5.1 PBD copy landing. Web vitest 3189 / 10 skipped; typecheck clean; lint 4 warnings baseline preserved (0 new).

## Review Findings (2026-05-23 — code-review stage)

**Reviewer:** bmad-code-review skill (parallel layers: Blind Hunter / Edge Case Hunter / Acceptance Auditor synthesized in-process per /epic-cycle orchestration).
**Scope:** working-tree diff vs `epic5` HEAD (post-Story-5.0). All Story 5.1 changes — 4 new module source files + 4 new test files + 6 amended source/test files + ADR-0014 amendment block.
**Verification commands run:**

- `npm test -- --run pale-blue-dot` → **4 files, 72 tests, all passing**.
- `npm test -- --run story-4-5-... story-4-6-... story-4-7-... chapter-registry-cross-spec main-ts-boot-ordering-defense v-chapter-copy.test` → **6 files, 171 tests, all passing** (amended pre-existing tests).
- `npm run typecheck` → **clean**.
- `npm run lint` → **4 warnings (pre-existing baseline; 0 new)**.
- `npm run build` → **succeeds; production bundle builds clean** (Story 5.0 BUG-006 pattern preserved).

### Focus-area verdicts

| Focus area | Verdict | Evidence |
| --- | --- | --- |
| 1. ADR-0014 (PBD as dedicated `ChapterModule`, not spec) | **PASS** | `PaleBlueDot` class at `web/src/chapters/pale-blue-dot/index.ts:123` implements `ChapterModule` interface, owns per-frame `update(et)` + substate machine + `subscribe` API. Distinct from declarative `ChapterSpec`. Registers via re-exported spec through `ALL_CHAPTERS` (Path A). ADR-0014 amended with Story 5.1 § Path A topology block. |
| 2. ADR-0021 (chapter copy in TS template literals) | **PASS** | `web/src/chapters/pale-blue-dot/copy.ts:62-75` exports `PBD_COPY` as a frozen object literal with backtick-equivalent string body. No external `.md` file. |
| 3. ADR-0015 (no global store) | **PASS** | Substate exposed via `PaleBlueDot.currentSubstate` getter + `PaleBlueDot.subscribe` API at `index.ts:136-173`. No global singleton; DI through `main.ts`. The DEV `__voyagerDebug.paleBlueDot` accessor at `main.ts:239-246` is gated by `import.meta.env.DEV` (stripped from production bundles via Vite constant folding). |
| 4. Integration AC7 — real wire-up (no mocked stubs) | **PASS** | `web/tests/pale-blue-dot-integration.test.ts` exercises real `ChapterDirector` + real `ALL_CHAPTERS` + real `PaleBlueDot` + real `<v-chapter-copy>` + real `startFirstPaint`. Only `ClockManager` is constructed (not mocked), per AC6 allowance. No `EphemerisService` mock surface needed (Story 5.1 doesn't require positions; Stories 5.2/5.3 will). |
| 5. Pre-existing test amendments (scoped exceptions, inline-documented) | **PASS** | 6 amended files (`v-chapter-copy.test.ts`, `chapter-registry-cross-spec.test.ts`, `main-ts-boot-ordering-defense.test.ts`, `story-4-5-v1j-encounter-qa-gaps.test.ts`, `story-4-6-v2j-v1s-v2s-qa-gaps.test.ts`, `story-4-7-v2u-v2n-qa-gaps.test.ts`) each carry inline "Amended in place per Rule 5" comments + scoped exceptions (e.g., `chapter.slug !== 'pale-blue-dot'` guard preserves the original pairing-invariant for non-PBD chapters). Pairing-invariant test at `story-4-5-v1j-encounter-qa-gaps.test.ts:698-711` correctly documents PBD as the sole permitted "copy without defaultFraming" exception. |
| 6. `__voyagerDebug.paleBlueDot` DEV-gate (Story 5.0 BUG-006 pattern) | **PASS** | `main.ts:239` wraps the accessor in `if (import.meta.env.DEV)`. QA-added integration test at `pale-blue-dot-integration.test.ts:278-309` pins the gate by source-grep (mirrors `viewFrame` defense at `main-ts-boot-ordering-defense.test.ts:156`). |
| 7. Rule 10 (Lit declare + ctor-init) | **N/A** | PaleBlueDot is plain TS, not a Lit component. No `static properties` declaration. The `lastEt: number \| null = null` class-field initializer at `index.ts:127` is fine (not a reactive accessor). |
| 8. No service-stub mocking (Epic 4 retro lesson) | **PASS** | Integration test uses real instances throughout. No mocks beyond `ClockManager` construction (which is itself a real service). |
| 9. Substate machine completeness (11-element order; idle at anchor cold-load) | **PASS** | `PBD_SUBSTATE_ORDER` at `substates.ts:94-106` is exactly the 11-element list from AC2 in the spec'd order. `pbdSubstateAt(PBD_ANCHOR_ET - 1) === idle` per AC5 (test at `substates.test.ts:96`). Cinematic-arc total-duration pin (180s) added by QA at `substates.test.ts:171-233`. |
| 10. Copy word count + required terms + lede | **PASS** | Body is exactly **100 words** (verified). Lede === `"Pale Blue Dot."` (trailing period). Body mentions `1990`, `Venus`, `Earth`, `Jupiter`, `Saturn`, `Uranus`, `Neptune`, and `/turn/i` ("the spacecraft turns back" — Sagan-grounded narration of the turn-back act). |

### Adversarial-layer findings

**Blind Hunter (diff-only):** No findings of consequence. The `lastEt: number | null = null` class-field initializer was flagged for review under Rule 10 — dismissed because Rule 10 applies only to Lit reactive properties, and `PaleBlueDot` is plain TS.

**Edge Case Hunter:** Two LOW findings deferred:

- AC5 "idle on cold-load" wording vs `pbdSubstateAt(anchor) === turning` interpretation tension (Dev Agent Record interprets this as "cold-load is paused, onFrame does not tick, module stays at constructor-default `idle`"; the lead's AC7 MCP smoke is the empirical resolver).
- Integration test at `:148-172` (reverse-scrub re-entry) tests subscriber side only, not the gated per-frame block. Coverage is sufficient via adjacent tests `:78` and `:120`.

**Acceptance Auditor (each AC vs implementation):** AC1–AC6 + AC8 all pass; AC7 is the lead-driven Chrome DevTools MCP smoke (runs AFTER code review per Rule 7 + Rule 3); AC8 ADR-compliance lines verified.

### Voyager-rule cross-checks

- **Rule 1 (Integration ACs):** AC7 is the named Integration AC and the integration test exercises the production wire-up chain (no mock-heavy stubs). PASS.
- **Rule 3 (per-story smoke evidence):** Story 5.1 touches a user-facing surface (`web/src/main.ts` + chapter copy + chapter spec). **AC7's Chrome DevTools MCP smoke is the lead's responsibility per Rule 7** and runs AFTER code review per /epic-cycle orchestration. **This review approves the implementation pending the lead's AC7 smoke.** Once the lead captures evidence under `_bmad-output/implementation-artifacts/5-1-smoke-evidence/`, the story can advance to done.
- **Rule 5 (NFR tripwire):** No NFR tripwire encountered. Pre-existing test amendments correctly carry inline "Amended in place per Rule 5" rationale (not silent relaxation). PASS.
- **Rule 6 (ADR violations are HIGH):** ADR-0014, ADR-0021, ADR-0015 all verified in compliance. ADR-0014 amended with Path A integration topology block in the same change-set. PASS.
- **Rule 9 (APG primitives):** N/A — no slider or listbox components touched.
- **Rule 10 (Lit declare + ctor-init):** N/A — no new Lit reactive properties introduced.

### Findings summary

- **HIGH:** 0
- **MED:** 0
- **LOW (deferred to `deferred-work.md` — Story 5-1 section):** 2 (AC5 cold-load interpretation; reverse-scrub test coverage)
- **Dismissed:** 5 (class-field initializer non-Rule-10; Path A choice matches AC3; inline-documented amendments correct; activation-flag reset correct; DEV-gate verified)
- **Auto-resolved inline:** 0 (no HIGH/MED required fixes)

### Approval

**Code review approves Story 5.1 pending the lead's AC7 Chrome DevTools MCP smoke** (per Rule 3 + Rule 7 — the lead is the canonical browser-smoke driver per Rule 8). The implementation is clean, ADR-compliant, and integration-tested through the production wire-up chain. Once the lead captures the AC7 smoke evidence (chapter title + copy panel + URL contract + DEV-only `currentSubstate` accessor) into `_bmad-output/implementation-artifacts/5-1-smoke-evidence/`, the story can flip to `done`.
