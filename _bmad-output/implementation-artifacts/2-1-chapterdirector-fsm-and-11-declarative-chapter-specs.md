# Story 2.1: ChapterDirector FSM and 11 Declarative Chapter Specs

**Epic:** 2 — Mission Spine (Chapter Navigation, Deep-Linking & Embed)
**Status:** review
**Date created:** 2026-05-20
**Source:** `_bmad-output/planning-artifacts/epics.md` § "Story 2.1" (lines 914–948) + Epic 2 Risks/Mitigations § R1 (line 907) + `_bmad/custom/voyager-skill-rules.md` Rules 1, 2, 3

## User Story

As the project maintainer,
I want a per-frame chapter state machine plus declarative specs for all 11 chapters so that subsequent stories have a single source of truth for chapter membership, lifecycle, and anchor timestamps,
So that the Pale Blue Dot module (Epic 5) and encounter modules (Epic 4) plug into a stable substrate without duplicating chapter metadata.

## Acceptance Criteria

### AC1 — ChapterDirector class with per-frame state machine

- **GIVEN** the chapter system module
- **WHEN** I inspect `web/src/services/chapter-director.ts` (per architecture.md line 758; epics.md says `web/src/chapters/` — see Architecture Compliance below for the resolution)
- **THEN** there is a `ChapterDirector` class that exposes `update(currentEt: number): void` called once per frame from the render loop (via `RenderEngine.onFrame((et) => chapterDirector.update(et))`)
- **AND** the director tracks each chapter's lifecycle state machine: `out → entering → held → exiting → passed`
- **AND** state transitions are triggered by `currentEt` crossing the chapter's window bounds (`windowStartEt`, `windowEndEt`) with no hysteresis required at this story
- **AND** the director exposes `activeChapter: ChapterSpec | null` (the chapter currently in `held` state — at most one) as a synchronous getter for HUD / scrubber consumers
- **AND** the director exposes `getState(chapterSlug: string): 'out' | 'entering' | 'held' | 'exiting' | 'passed'` for fine-grained queries
- **AND** the director exposes `subscribe(cb: (event: ChapterTransitionEvent) => void): () => void` where `ChapterTransitionEvent = { chapter: ChapterSpec; from: ChapterState; to: ChapterState; et: number }` — fired ONLY on state transitions, not per-frame (mirrors ClockManager's subscribe-on-event-only contract)

### AC2 — 10 standard chapter specs as TypeScript modules

- **GIVEN** the chapter spec format
- **WHEN** I inspect `web/src/chapters/specs/`
- **THEN** 10 standard chapter specs exist as TypeScript modules (one file per chapter): `launch-v1.ts`, `launch-v2.ts`, `v1-jupiter.ts`, `v2-jupiter.ts`, `v1-saturn.ts`, `v2-saturn.ts`, `v2-uranus.ts`, `v2-neptune.ts`, `v1-heliopause.ts`, `v2-heliopause.ts` (slugs `launch-v1`, `launch-v2` etc. per ADR-0001 frozen URL contract)
- **AND** each spec exports a default `ChapterSpec` object with fields: `slug` (URL slug, kebab-case), `name` (editorial name), `markerLabel` (2–4 char uppercase mono — V1L, V2L, V1J, V2J, V1S, V2S, V2U, V2N, V1H, V2H), `anchorEt` (ET seconds), `windowStartEt`, `windowEndEt`, `spacecraft` (`'v1'` | `'v2'` | `'both'`)
- **AND** anchor timestamps match the canonical encounter dates from PRD §Encounter coverage and `MISSION_FACTS.md` sourcing:
  - V1 launch: 1977-09-05 12:56:00 UTC
  - V2 launch: 1977-08-20 14:29:00 UTC
  - V1 Jupiter: 1979-03-05 12:05 UTC
  - V2 Jupiter: 1979-07-09 (closest approach 22:29 UTC)
  - V1 Saturn: 1980-11-12 23:46 UTC
  - V2 Saturn: 1981-08-26
  - V2 Uranus: 1986-01-24 17:59 UTC
  - V2 Neptune: 1989-08-25 (closest approach 03:56 UTC)
  - V1 heliopause: 2012-08-25
  - V2 heliopause: 2018-11-05
- **AND** ET conversions use the canonical SPICE epoch (`J2000 = 2000-01-01 12:00:00 TDB`); the dev should use a small helper (`isoToEt`) or rely on the existing constants from Epic 1 if such a helper was already authored
- **AND** each spec's `windowStartEt` / `windowEndEt` is a sensible per-encounter window (e.g., ±30 days for encounters; ±90 days for heliopause crossings) chosen so that adjacent chapters' windows do NOT overlap — overlap would force the FSM to enter `held` for two chapters simultaneously, violating "at most one active chapter"

### AC3 — Pale Blue Dot chapter placeholder

- **GIVEN** the Pale Blue Dot chapter
- **WHEN** I inspect `web/src/chapters/specs/pale-blue-dot.ts`
- **THEN** the spec exists as a placeholder pointing to its dedicated Epic 5 module (no PBD-specific behavior is wired in this story)
- **AND** the placeholder contains `slug: 'pale-blue-dot'`, `name: 'Pale Blue Dot'`, `markerLabel: 'PBD'`, `anchorEt = isoToEt('1990-02-14T00:00:00')`, `spacecraft: 'v1'`, a tight ±1 day window around the anchor
- **AND** the placeholder is sufficient for chapter-marker rendering (Story 2.2) and URL routing (Story 2.4) without coupling to PBD content
- **AND** a comment at the top of `pale-blue-dot.ts` explicitly notes: "Placeholder per Story 2.1. Full PBD module is Epic 5 (Story 5.1+). Do NOT add PBD-specific choreography here."

### AC4 — Single chapter registry (one source of truth)

- **GIVEN** the chapter registry
- **WHEN** I import `web/src/chapters/registry.ts`
- **THEN** it exposes `ALL_CHAPTERS: readonly ChapterSpec[]` as a single ordered array of all 11 specs (10 standard + PBD) in chronological order by `anchorEt`
- **AND** consumers (scrubber markers, chapter index, URL router, OG generator) MUST read from this single registry — no parallel lists allowed
- **AND** `ALL_CHAPTERS` is frozen (`Object.freeze`) so accidental mutation throws in dev mode
- **AND** the registry exposes lookup helpers: `findChapterBySlug(slug: string): ChapterSpec | null` and `findActiveChapterAtEt(et: number): ChapterSpec | null` (returns the chapter whose window contains `et`, or null)
- **AND** a unit test asserts ALL_CHAPTERS.length === 11 and the chronological ordering is correct

### AC5 — Unit-tested state machine semantics

- **GIVEN** the ChapterDirector is running
- **WHEN** I unit-test it with a fixture of ETs crossing window boundaries
- **THEN** each chapter transitions through `out → entering → held → exiting → passed` exactly once per forward traversal (each transition fires `subscribe` callbacks)
- **AND** scrubbing backwards reverses the state machine through `passed → exiting → held → entering → out` (with reverse transitions firing subscribe callbacks symmetrically)
- **AND** no chapter transitions are skipped under rapid scrubs (state machine is event-driven on ET crossings, not time-delta-driven — a single `update(et)` call that crosses multiple window boundaries fires all intermediate transitions in chronological order)
- **AND** `update(et)` is idempotent for the same `et` value (calling twice with no ET change fires no subscribers)

### AC6 — TypeScript interface modules

- **GIVEN** the type module
- **WHEN** I inspect `web/src/types/chapter.ts`
- **THEN** it exports `ChapterSpec` interface with the field shape described in AC2
- **AND** it exports `ChapterState = 'out' | 'entering' | 'held' | 'exiting' | 'passed'`
- **AND** it exports `ChapterTransitionEvent` interface used by ChapterDirector.subscribe
- **AND** it exports `Spacecraft = 'v1' | 'v2' | 'both'`
- **AND** strict mode passes (no `any` types)

### AC7 — Test suites green; no regressions

- **GIVEN** all AC1–AC6 changes are merged on the working tree
- **WHEN** the test suite is exercised
- **THEN** `cd web && npm test -- --run` passes 100% (no failed tests, no new flakes)
- **AND** typecheck passes (`cd web && npm run typecheck`)
- **AND** linters pass (`cd web && npm run lint`)

## Integration ACs (per voyager-skill-rules.md Rule 1)

**This story is service-introducing.** ChapterDirector is consumed by every downstream Epic 2 story (2.2 markers, 2.3 chapter index, 2.4 URL routing, 2.5 embed mode flag-state, 2.6 OG generator, 2.7 about/attribution chapter linkage, 2.8 help overlay, 2.9 heliopause cards) PLUS later epics (4.x encounters, 5.x PBD, 6.x audio cues). Rule 1 + Epic 2 Risks § R1 mandate at least one Integration AC verifying the consumer-side wire-up against a real instance.

### Integration AC8 — ChapterDirector ↔ ClockManager wire-up verified in a real browser

- **GIVEN** the dev server is running and Voyager is loaded in Chrome DevTools MCP
- **AND** the ChapterDirector is constructed with a real `ClockManager` instance and registered as a per-frame callback via `RenderEngine.onFrame`
- **WHEN** the lead-side smoke navigates to a chapter window (e.g., scrubs the timeline to 1979-03-05 — V1 Jupiter encounter)
- **THEN** the ChapterDirector's `activeChapter` reports the corresponding chapter spec (in this example, `v1-jupiter`) as observable from the page via `window.__voyagerDebug.chapterDirector.activeChapter` (a dev-only debug surface — guarded by `if (import.meta.env.DEV)`)
- **AND** scrubbing to a between-chapter region (e.g., 1995-01-01) reports `activeChapter === null`
- **AND** the lead captures evidence as a screenshot showing the HUD date matches the scrubbed ET AND the JS console shows the chapter-director's active-chapter readout via `evaluate_script`
- **AND** the smoke verifies the wire-up against a REAL ClockManager instance — NOT a mock; the test is a Chrome DevTools MCP scenario, not a Vitest mock test

### ViewframeService / MissionPhaseFSM wire-up — forward-deferred

Epic 2 Risks § R1 mitigation language calls for a "three-way wire-up" verification of FSM ↔ ClockManager ↔ **ViewframeService**. ViewframeService does NOT yet exist (Epic 4 Story 4.1 introduces it). MissionPhaseFSM also does not yet exist as a separate service in `web/src/services/` (the architecture references it but Epic 1 did not build it).

Per Rule 1 + Rule 5 (NFR tripwire response), this story documents the partial mitigation:

- **Story 2.1 verifies:** ChapterDirector ↔ ClockManager wire-up (Integration AC8 above)
- **Story 4.1 (ViewframeService introduction) will verify:** ViewframeService reads `activeChapter` from ChapterDirector and produces the expected ±2-day smoothstep blend
- **Future story (if MissionPhaseFSM ever ships as a separate service):** that story's consumer-side integration AC will mirror the wire-up here

This deferral is explicitly documented in this story's Risk Mitigation Audit below. No planning artifacts are amended in place because the deferral is per-story-scope, not an NFR misinterpretation.

## Consumed-by (per voyager-skill-rules.md Rule 2)

The following downstream stories will consume ChapterDirector + ALL_CHAPTERS and MUST hold consumer-side Integration ACs in their own specs:

- **Story 2.2 (Chapter Markers on Scrubber):** scrubber subscribes to ChapterDirector state changes; markers reflect active chapter via `--v-color-accent`. Consumer integration AC: "scrubber marker for active chapter visually highlights when ChapterDirector transitions to `held`."
- **Story 2.3 (Chapter Index Listbox):** chapter index reads `ALL_CHAPTERS` to render options; `aria-current` reflects ChapterDirector active chapter. Consumer integration AC: "opening chapter index shows 11 options in chronological order; current chapter is highlighted via aria-current and visible accent treatment."
- **Story 2.4 (URL Slug Scheme):** URL router reads `findChapterBySlug` on deep-link arrival and writes `ChapterDirector.activeChapter.slug` to URL via `pushState`. Consumer integration AC: "deep-linking to `/chapter/v1-jupiter` scrubs to the V1 Jupiter anchor ET and activeChapter reports `v1-jupiter`."
- **Story 2.5 (Embed Mode):** EmbedModeState reads chapter context for chrome-less HUD decisions (specific consumer behavior to be detailed in 2.5).
- **Story 2.6 (OG Cards):** build-time generator reads `ALL_CHAPTERS` from the same registry file (no copy-paste — Epic 2 R4 mitigation). Consumer integration AC: "OG generator output has one file per chapter in ALL_CHAPTERS; a unit test asserts `generatedOgCards.length === ALL_CHAPTERS.length`."
- **Story 2.9 (Heliopause Cards):** chapter copy panel reads ChapterDirector active chapter to know when to show V1H / V2H text cards.
- **Story 4.1 (ViewframeService):** consumer-side integration AC verifying ViewframeService reads ChapterDirector active chapter and applies the per-chapter view-frame target with ±2-day smoothstep.

## Risk Mitigation Audit (per Epic 2 Risks)

Epic 2 R1 (Chapter FSM coupling) is the only risk applicable to this story.

**R1 mitigation as written:** "Story 2.1 (ChapterDirector FSM) must have an explicit Integration AC … verifying the FSM ↔ ClockManager ↔ ViewframeService three-way wire-up via Chrome DevTools MCP, in a real browser, against the dev server. Mocks at the boundary are not acceptable. The per-story smoke gate covers the final wire-up validation."

**This story's response:**
- ✅ Integration AC8 covers the ChapterDirector ↔ ClockManager half of the wire-up via Chrome DevTools MCP in a real browser. No mocks at the boundary.
- ⏸️ ViewframeService leg is forward-deferred to Story 4.1 because ViewframeService does not yet exist. Documented above under "ViewframeService / MissionPhaseFSM wire-up — forward-deferred." This is NOT a Rule 5 NFR tripwire — it's a normal forward dependency that gets a consumer-side AC when its producer story ships.
- ✅ The per-story smoke gate (lead-side Chrome DevTools MCP) covers the final wire-up validation.

## Files to Modify

| File | Action | Reason |
|---|---|---|
| `web/src/types/chapter.ts` | NEW | AC6: ChapterSpec, ChapterState, ChapterTransitionEvent, Spacecraft type exports |
| `web/src/chapters/specs/launch-v1.ts` | NEW | AC2: V1 launch chapter spec (slug `launch-v1` per ADR-0001) |
| `web/src/chapters/specs/launch-v2.ts` | NEW | AC2: V2 launch chapter spec (slug `launch-v2` per ADR-0001) |
| `web/src/chapters/specs/v1-jupiter.ts` | NEW | AC2: V1 Jupiter chapter spec |
| `web/src/chapters/specs/v2-jupiter.ts` | NEW | AC2: V2 Jupiter chapter spec |
| `web/src/chapters/specs/v1-saturn.ts` | NEW | AC2: V1 Saturn chapter spec |
| `web/src/chapters/specs/v2-saturn.ts` | NEW | AC2: V2 Saturn chapter spec |
| `web/src/chapters/specs/v2-uranus.ts` | NEW | AC2: V2 Uranus chapter spec |
| `web/src/chapters/specs/v2-neptune.ts` | NEW | AC2: V2 Neptune chapter spec |
| `web/src/chapters/specs/v1-heliopause.ts` | NEW | AC2: V1 heliopause chapter spec |
| `web/src/chapters/specs/v2-heliopause.ts` | NEW | AC2: V2 heliopause chapter spec |
| `web/src/chapters/specs/pale-blue-dot.ts` | NEW | AC3: PBD placeholder spec |
| `web/src/chapters/registry.ts` | NEW | AC4: ALL_CHAPTERS array + lookup helpers |
| `web/src/services/chapter-director.ts` | NEW | AC1: ChapterDirector class with FSM |
| `web/src/utils/iso-to-et.ts` | NEW (if not extracted from Epic 1) | AC2: ISO-8601 → ET conversion helper (check if Epic 1 already shipped one; reuse if so) |
| `web/src/types/chapter.test.ts` | NEW | AC6 type spec / shape test |
| `web/src/chapters/registry.test.ts` | NEW | AC4 registry test: length=11, chronological order, lookup helpers, frozen |
| `web/src/services/chapter-director.test.ts` | NEW | AC5 state machine tests (forward, reverse, rapid-scrub, idempotency) |
| `web/src/main.ts` | UPDATE | Wire ChapterDirector into RenderEngine.onFrame; expose `window.__voyagerDebug.chapterDirector` in DEV mode for Integration AC8 verification |

## Tasks / Subtasks

- [x] **T1 (AC6): Type module**
  - [x] Create `web/src/types/chapter.ts` with `ChapterSpec`, `ChapterState`, `ChapterTransitionEvent`, `Spacecraft` exports
  - [x] Add a type-shape test that constructs a fixture and asserts the field set

- [x] **T2 (AC2 + AC3): Chapter spec modules**
  - [x] Check whether Epic 1 shipped an `isoToEt` helper. If yes, import; if no, create `web/src/utils/iso-to-et.ts` using the canonical SPICE epoch (J2000 = 2000-01-01 12:00:00 TDB → ET seconds = (date - J2000)/1000 in ms with leap-second guard — verify by cross-checking against ClockManager's MISSION_START_ET / MISSION_END_ET constants)
  - [x] Author all 11 chapter spec files under `web/src/chapters/specs/`
  - [x] For each: choose a sensible window (±30 days for encounters, ±90 days for heliopauses, ±1 day for PBD placeholder) such that NO two adjacent chapters' windows overlap
  - [x] Cross-check anchor ETs against PRD §Encounter coverage table
  - [x] PBD spec includes the "do not add choreography" comment

- [x] **T3 (AC4): Registry**
  - [x] Create `web/src/chapters/registry.ts` exporting `ALL_CHAPTERS` as a frozen array
  - [x] Sort by `anchorEt` ascending
  - [x] Implement `findChapterBySlug(slug)` and `findActiveChapterAtEt(et)` helpers
  - [x] Unit test in `registry.test.ts`: length=11, chronological ordering verified, lookups work, mutation throws in strict mode

- [x] **T4 (AC1 + AC5): ChapterDirector class**
  - [x] Create `web/src/services/chapter-director.ts` with the FSM
  - [x] Constructor takes no clock instance (the director is driven by per-frame `update(et)` calls from outside; this keeps it testable without instantiating ClockManager)
  - [x] Implement state machine: maintain `Map<slug, ChapterState>` internally; on each `update(et)` compare to previous `et` to detect crossings
  - [x] Fire subscribers ONLY on state transitions (not per-frame)
  - [x] Implement `activeChapter` getter (first chapter in `held`, or null)
  - [x] Implement `getState(slug)` getter
  - [x] Implement `subscribe(cb)` returning unsub function
  - [x] Unit tests in `chapter-director.test.ts`:
    - Forward traversal through V1 Jupiter window: out → entering → held → exiting → passed (each transition fires once)
    - Reverse traversal: passed → exiting → held → entering → out (each transition fires once)
    - Rapid scrub: single `update(et)` that crosses 3 chapter windows fires all 12 expected transitions (3 chapters × 4 transitions each, in chronological order)
    - Idempotency: two consecutive `update(et)` calls with the same et fire zero subscribers on the second call

- [x] **T5 (AC1 — render-loop wire-up): main.ts integration**
  - [x] In `web/src/main.ts`, after ClockManager + RenderEngine instantiation, construct `chapterDirector = new ChapterDirector()` and add `engine.onFrame((et) => chapterDirector.update(et))`
  - [x] Wire the registry: pass `ALL_CHAPTERS` to the director's constructor (or via a `register()` API — pick whichever fits the architecture better; the spec is ambiguous, dev judgment applies)
  - [x] In DEV-only build (`if (import.meta.env.DEV)`), expose `(window as any).__voyagerDebug = { ...existing, chapterDirector }` for Integration AC8 verification

- [x] **T6 (AC7): Verification sweep**
  - [x] `cd web && npm test -- --run` — expect 1285 + new tests, all green
  - [x] `cd web && npm run typecheck` — 0 errors
  - [x] `cd web && npm run lint` — 0 errors (5 pre-existing warnings OK)
  - [x] If any new lint warnings on new code, fix them

## Dev Notes

### Architecture / Conventions

- **Location decision:** `architecture.md` lines 758 + 1135 place `chapter-director.ts` under `web/src/services/`. The epics.md AC1 wording (line 922–924) says "inspect `web/src/chapters/`" — this is documentation drift. The dev MUST place the ChapterDirector at `web/src/services/chapter-director.ts` (matching the established Epic 1 pattern: ClockManager, EphemerisService, ChunkLoader all live in `services/`). The chapter SPECS go under `web/src/chapters/specs/` (data, not service).
- **No decorators / no Lit on the service side.** ChapterDirector is plain TypeScript — no Lit, no decorators, no reactive controllers. The Lit + reactive-controller pattern from Epic 1 is for UI components only.
- **Subscribe semantics mirror ClockManager.** ClockManager (Story 1.10) fires subscribers only on explicit state-change events (play / pause / setRate / scrubTo / autoCap), NOT on every `tick`. ChapterDirector should mirror this — `subscribe(cb)` fires on state transitions only, NOT on every `update(et)` call. Per-frame consumers should read `activeChapter` directly.
- **No imports from `web/src/ui/`.** The service layer must not import from the UI layer. UI components (`<v-chapter-index>`, etc.) import the service, never vice-versa.
- **Strict mode + branded types.** No `any` types. Use TypeScript 6.x (per ADR-0026). If you need a typed ET value, reuse the Epic 1 ET-typing pattern if one exists (check `web/src/types/branded.ts`). If not, plain `number` is fine — ET semantics are documented in JSDoc.

### Previous Story Intelligence (Stories 1.10, 1.15, 1.16, 2.0)

- **Story 1.10 ClockManager pattern** is the canonical service-layer template — same shape (constructor + per-frame method + subscribe + getters). Mirror it.
- **Story 1.15 RenderEngine.onFrame** is the established per-frame callback hook (`engine.onFrame((et) => ...)`). Use this to wire ChapterDirector.update.
- **Story 1.16 brotli polyfill** is unrelated to chapter wiring but confirmed that chunk-loader correctness reaches the real browser — the established main.ts wire-up pattern through `ChunkLoader` is the same shape ChapterDirector should follow.
- **Story 2.0 chunk-loader notify try/catch hardening** means that ChapterDirector subscribers can throw without silencing other subscribers (a defense for downstream stories). No action required from this story; just be aware that the subscribe pattern is robust.

### NFR considerations

- **NFR-P2 (per-frame budget ≤ 50ms).** ChapterDirector.update(et) must be O(N) in the number of chapters (N=11) — simple linear scan over chapter windows. With 11 chapters and arithmetic per check, expected per-call time is ~µs, well under any reasonable budget.
- **NFR-R4 (bake-determinism).** Not applicable — pure web-side story, no bake-pipeline changes.
- **NFR-M4 (CI ≤ 5 min L1+L3).** Adding ~3 unit test files; expected vitest impact ≤ 1 second.
- **No NFR tripwires expected.** The state machine semantics are well-defined.

### Integration AC8 — Implementation guidance

The Integration AC8 verification (Chrome DevTools MCP smoke) is a LEAD-SIDE step performed during the per-story smoke gate, NOT a dev-time test. The dev's only obligation is to expose the debug surface (`window.__voyagerDebug.chapterDirector`) in DEV-only builds so the lead can `evaluate_script` against it. The dev does NOT need to drive Chrome DevTools MCP themselves.

### Testing standards

- Vitest unit + integration tests live under `web/src/**/*.test.ts`.
- Defense tests follow the `*-defense.test.ts` convention if you author any (probably not needed for 2.1).
- For state-machine tests, prefer table-driven fixture style (an array of `(initialEt, updateEt, expectedTransitions[])` rows) to make adding cases cheap.

## References

- `_bmad-output/planning-artifacts/epics.md` § Story 2.1 (lines 914–948)
- `_bmad-output/planning-artifacts/epics.md` § Epic 2 Risks/Mitigations § R1 (lines 907, 912)
- `_bmad-output/planning-artifacts/architecture.md` lines 78, 205, 310, 311, 392–396, 758, 814, 1135 (chapter / service-layer architecture)
- `_bmad/custom/voyager-skill-rules.md` Rules 1, 2, 3 (Integration ACs, Consumed-by, browser smoke)
- `docs/adr/0001-url-contract-as-public-api.md` (URL-as-public-API; ChapterDirector slugs are part of the contract Story 2.4 wires)
- `docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md` (Integration AC8 verification driver)
- `docs/adr/0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md` (hybrid spec/module shape — 10 standard chapters use the `ChapterSpec` shape; PBD will get a module in Epic 5)
- `docs/adr/0015-service-graph-lit-reactive-controllers-no-global-store.md` (service-graph topology — ChapterDirector is one node in the graph)
- `web/src/services/clock-manager.ts` (canonical service-layer template; mirror its shape)
- `web/src/render/render-engine.ts:RenderEngineOptions.clockManager` (Story 1.15 wire-up pattern)
- `web/src/main.ts` (the wire-up site for both ClockManager and ChapterDirector)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`.

### Debug Log References

- `cd web && npm test -- --run` — 77 files / 1321 tests pass (baseline was 1285; +36 new tests across `types/chapter.test.ts`, `chapters/registry.test.ts`, `services/chapter-director.test.ts`).
- `cd web && npm run typecheck` — 0 errors.
- `cd web && npm run lint` — 0 errors, 5 pre-existing warnings (the same 5 noted in the epic2 baseline — unrelated to this story).

### Completion Notes List

- **T2 — `isoToEt` helper:** Epic 1 already shipped `etFromIso(iso)` in `web/src/math/et-conversions.ts` with SpiceyPy-accurate leap-second handling. Per the story's "if yes, import; if no, create" guidance, every chapter spec imports `etFromIso` directly — no new helper file added (avoids premature abstraction). The story's File-List entry for `web/src/utils/iso-to-et.ts` was therefore not created.
- **T2 — V1/V2 launch window sizing:** The default ±30 day encounter window would force V1-launch (1977-09-05) and V2-launch (1977-08-20) windows to overlap (they are only 16 days apart). Both launch chapters use ±7 day windows so the "no adjacent overlap" contract from AC2 is satisfied. All other chapters use the documented ±30 day (encounters) or ±90 day (heliopauses) windows; PBD uses ±1 day per AC3. The registry test asserts non-overlap across the full chain.
- **T4 — FSM transient-state semantics:** AC1 says transitions are triggered by ET crossing window bounds (two bounds: `windowStartEt`, `windowEndEt`) but AC5 requires four distinct transitions per pass (`out→entering→held→exiting→passed`). Resolved by treating `entering` and `exiting` as TRANSIENT states — emitted as transition events but never a resting state. Crossing `windowStartEt` fires `out→entering→held` back-to-back; crossing `windowEndEt` fires `held→exiting→passed`. The rapid-scrub AC ("12 transitions across 3 chapter windows") and idempotency AC ("same et fires zero") both pin this model and pass.
- **T4 — Subscriber-throw hardening:** Mirrors the Story 2.0 chunk-loader notify try/catch pattern. A throwing subscriber must not silence later subscribers; the throw is logged via `console.error` and swallowed. A test under "subscribe / unsubscribe contract" asserts this.
- **T5 — Constructor vs. register() API:** Picked constructor injection (`new ChapterDirector(ALL_CHAPTERS)`) over `register()` because the chapter set is known at boot time and never changes during a session. This keeps the director immutable post-construction and removes any "did you forget to register?" failure mode for downstream consumers.
- **Integration AC8 — DEV debug surface:** `window.__voyagerDebug.chapterDirector` is wired in `main.ts` under `if (import.meta.env.DEV)`. Vite folds `import.meta.env.DEV` to a literal at build time, so the surface is stripped from production bundles. The lead's Chrome DevTools MCP smoke can `evaluate_script` `window.__voyagerDebug.chapterDirector.activeChapter?.slug` after scrubbing the timeline to validate the wire-up.
- **No NFR tripwires encountered.** State machine semantics resolved cleanly; per-frame cost is an O(N=11) linear scan with simple arithmetic — well under NFR-P2's 50 ms/frame budget.
- **Forward-deferred per the story file:** ViewframeService leg of Epic 2 R1 mitigation. ViewframeService is introduced by Story 4.1 and will own the consumer-side integration AC verifying ViewframeService reads `activeChapter` from ChapterDirector. No planning artifacts amended.

### File List

NEW:

- `web/src/types/chapter.ts`
- `web/src/types/chapter.test.ts`
- `web/src/chapters/specs/launch-v1.ts`
- `web/src/chapters/specs/launch-v2.ts`
- `web/src/chapters/specs/v1-jupiter.ts`
- `web/src/chapters/specs/v2-jupiter.ts`
- `web/src/chapters/specs/v1-saturn.ts`
- `web/src/chapters/specs/v2-saturn.ts`
- `web/src/chapters/specs/v2-uranus.ts`
- `web/src/chapters/specs/v2-neptune.ts`
- `web/src/chapters/specs/v1-heliopause.ts`
- `web/src/chapters/specs/v2-heliopause.ts`
- `web/src/chapters/specs/pale-blue-dot.ts`
- `web/src/chapters/registry.ts`
- `web/src/chapters/registry.test.ts`
- `web/src/services/chapter-director.ts`
- `web/src/services/chapter-director.test.ts`

UPDATED:

- `web/src/main.ts` (added ChapterDirector construction + onFrame wire-up + DEV debug surface)

NOT CREATED (deviation from story file's File-List):

- `web/src/utils/iso-to-et.ts` — Epic 1 already shipped `etFromIso` in `web/src/math/et-conversions.ts`. Imported from the existing module instead.

### Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-05-20 | Story 2.1 created with Integration AC8 (Rule 1 + R1 mitigation); ViewframeService leg forward-deferred to Story 4.1 | Service-introducing story per Rule 1; ViewframeService not yet built |
| 2026-05-20 | T1–T6 implemented; 17 new files + main.ts update; 1321 web vitest tests pass (+36 from 1285 baseline); typecheck + lint clean | Story 2.1 dev cycle complete; ready for lead-side Chrome DevTools MCP smoke (Integration AC8) and code review |
| 2026-05-20 | Code-review HIGH-1 resolved: renamed launch specs `v1-launch.ts`/`v2-launch.ts` → `launch-v1.ts`/`launch-v2.ts`; slugs `v1-launch`/`v2-launch` → `launch-v1`/`launch-v2` (and downstream tests + epics.md AC2 + story AC2 + file list updates) | Align with ADR-0001 frozen URL contract (also referenced by PRD §FR41, architecture.md §Decision-6e, UX-spec, readiness report). Story planner had diverged from the ratified slug list; implementation followed the story. Fixed at slug-source. 1363/1363 tests pass, typecheck + lint clean post-rename. |
