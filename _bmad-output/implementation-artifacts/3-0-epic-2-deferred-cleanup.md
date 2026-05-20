# Story 3.0: Epic 2 Deferred Cleanup

**Epic:** 3 — Attitude Reconstruction (the Differentiator)
**Status:** review
**Date created:** 2026-05-20
**Source:** Epic 2 retrospective (2026-05-20) + `deferred-work.md` open LOW items + `/epic-cycle` v2 workflow design pass (commit `cf08ac0`)

## User Story

As the project maintainer,
I want all Epic 2 open deferred items (LOW-severity findings that have become close-able since shipping, plus epic-level decisions Epic 2's retro routed to Story 3.0, plus pre-emptive bake-side hygiene that becomes load-bearing in Epic 3),
So that Epic 3 begins on a known-clean baseline with `ck_inventory.py` exact-matched (Story 3.1 leans on it), `validate_l1.py` symmetric with `bake_trajectories.py`, `first-paint.ts:dispose()` actually idempotent, the ADR-0025 inline-keyboard-primitive baseline drift formally decided (extract or amend), and the resolved-since-shipping items closed-and-struck-through in `deferred-work.md` rather than silently accumulating.

## Triage Source

The full triage table covering every open Epic 1 + Epic 2 LOW item lives in § "Triage Table" below. Items are sorted into:

- **INCLUDE** — addressed by this story (becomes ACs); has a deferred-work.md strike-through annotation as part of completion.
- **DEFER** — carries forward per each item's existing "Suggested resolution" target (Story 4.3 / 4.9 / 6.1–6.4 / 6.5 / 7.1 / 7.3 / 7.6 / Epic 8); no Story 3.0 work.
- **DROP** — explicitly rejected with rationale.
- **CLOSED-VERIFY** — items the post-Epic-2 code already closes implicitly; this story strikes them through with a closing annotation pointing at the originating shipped story.

The triage is the contract: every open item in `deferred-work.md` (as of `2026-05-20`) is accounted for in the table at the bottom of this file. Items not in the table = drift; surface as a HIGH finding at code-review time.

## Acceptance Criteria

### AC1 — `bake/src/ck_inventory.py` fragile encounter-label string-match replaced with explicit `bus_id` field (Story 1.3 deferred LOW)

- **GIVEN** `ck_inventory.py` selects bus structure ID via `" V1 " in f" {label} " or label.startswith("V1")` — a substring match on each encounter's label
- **AND** Epic 3 Story 3.1 will heavily exercise `ck_inventory.py` (CK kernel bake pipeline + sign-flip walk pre-bake) and Story 3.7 will use it for L2 JS-vs-SPICE attitude consistency validation in CI
- **WHEN** Story 3.0 hardens the match
- **THEN** the `ENCOUNTERS` tuple gains an explicit `bus_id` field alongside `scan_id` (named tuple or dataclass field; do NOT reorder existing positional fields downstream consumers depend on)
- **AND** the substring/startswith fallback is removed; bus-ID resolution is by direct field read
- **AND** a regression test in `bake/tests/` verifies every ENCOUNTERS entry resolves to the historically-correct bus_id (V1: -31, V2: -32)
- **AND** `cd bake && uv run pytest -q` passes including the new test (no other test regressions)
- **AND** `just ck-inventory` regenerates `docs/kernels/ckbrief-inventory.md` byte-identical to the pre-change output (refactor preserves output)
- **AND** the corresponding deferred-work entry (`[1.3 / LOW]` `ck_inventory.py` … fragile string-match) is struck through with a closing annotation pointing to Story 3.0

### AC2 — `bake/src/validate_l1.py:_furnish_kernels` excludes `ck` kind (Story 1.4 deferred LOW)

- **GIVEN** `validate_l1.py:_furnish_kernels` priority dict (line ~84) has `"ck": 5` so the L1 validator re-furnishes CK kernels (~tens of MB) on every run
- **AND** `bake/src/bake_trajectories.py:217` explicitly excludes `ck` via `kinds=("lsk", "pck", "fk", "sclk", "spk")` because CKs aren't queried by `spkgeo`
- **AND** the asymmetry is harmless today but disagrees with the bake-side furnish set and slows validator startup
- **WHEN** Story 3.0 narrows the furnish set
- **THEN** `_furnish_kernels` excludes `ck` kernels by either (a) removing `"ck"` from the priority dict, or (b) explicitly filtering out `kind == "ck"` from the iteration, whichever fits the file's existing structure cleanest
- **AND** `cd bake && uv run pytest -q` still passes (no L1 validation regressions — CK kernels are not queried by L1's `spkgeo` calls)
- **AND** the corresponding deferred-work entry (`[1.4 / LOW]` `validate_l1.py:_furnish_kernels` re-furnishes…) is struck through with a closing annotation pointing to Story 3.0
- **NOTE:** Epic 3 Story 3.7 (L2 JS-vs-SPICE attitude validation) WILL need CK furnishing in a separate validator path (`validate_l2.py` or similar). That's Story 3.7's concern; Story 3.0 narrows only L1's furnish set, which is exclusively a trajectory consistency tier.

### AC3 — `bake/tests/test_bake_defense.py:REQUIRED_RECIPES` includes `ck-inventory` and `fk-inventory` (Story 1.4 deferred LOW)

- **GIVEN** the `justfile` recipes `ck-inventory` and `fk-inventory` are not enumerated in `REQUIRED_RECIPES` and a future refactor could drop them without the test catching it
- **AND** Story 3.1 makes `ck-inventory` load-bearing (CK kernel bake pipeline regenerates `docs/kernels/ckbrief-inventory.md` as part of the pre-bake workflow)
- **WHEN** Story 3.0 widens the recipe assertion
- **THEN** `REQUIRED_RECIPES` includes both `ck-inventory` and `fk-inventory`
- **AND** `cd bake && uv run pytest -q bake/tests/test_bake_defense.py` passes
- **AND** the corresponding deferred-work entry (`[1.4 / LOW]` `justfile` recipes … not enumerated) is struck through with a closing annotation pointing to Story 3.0

### AC4 — ADR-0025 inline-keyboard-primitive baseline decision (Story 2.2 + Story 2.3 epic-level deferral)

- **GIVEN** Stories 2.2 (`<v-timeline-scrubber>`) and 2.3 (`<v-chapter-index>`) both embed APG keyboard handlers (Slider keyboard + Listbox keyboard respectively) inline in the component, rather than delegating to `primitives/slider-keyboard.ts` / `primitives/listbox-keyboard.ts` as ADR-0025's "Obligations on downstream stories" prescribes ("Components compose primitives via mixin or delegation — no APG keyboard logic embedded directly in component code")
- **AND** Epic 2's retrospective (2026-05-20 § 4) explicitly routed the decision to Story 3.0 as an epic-level call
- **AND** Story 2.8 (`<v-help-overlay>`) added a third component with inline APG focus-trap usage (separate concern from keyboard primitives but in the same neighborhood)
- **WHEN** Story 3.0 formalises the decision
- **THEN** the maintainer EITHER:
  - **(a) Extracts both primitives** — creates `web/src/components/primitives/slider-keyboard.ts` and `web/src/components/primitives/listbox-keyboard.ts` as paired Lit reactive controllers (or comparable composition shape per ADR-0015 reactive-controller pattern), wires `<v-timeline-scrubber>` and `<v-chapter-index>` to use them, adds unit tests for each primitive, AND amends `voyager-skill-rules.md` to record "ADR-0025 primitives extraction landed in Story 3.0" — OR
  - **(b) Amends ADR-0025** — appends a new "Status: amended (Story 3.0)" block to `docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md` relaxing the "no APG keyboard logic embedded directly in component code" clause to "extract a primitive when a second consumer arises; until then, inline implementation is acceptable as long as the keyboard contract is unit-tested per-component", AND records the amendment date + Story 3.0 reference at the top of the ADR
- **AND** the decision rationale is recorded in this story's Completion Notes List (which path was chosen and why)
- **AND** the corresponding deferred-work entry (`[2.3 / LOW (ADR-0025 baseline)]` … embeds the APG Listbox keyboard handler inline) is struck through with a closing annotation pointing to Story 3.0 (with the chosen path noted)
- **NOTE:** The Story 2.8 v-help-overlay focus-trap usage is a different ADR-0025 obligation surface (focus management) and is NOT in scope for AC4. It's a Story 6.4 (axe-core CI + manual a11y) concern per the 2.8 deferral.

### AC5 — `2-0-epic-1-deferred-cleanup.md` AC7 wording amended to use `ALLOWED_BODY_IDS` (Story 2.0 review-deferred LOW; planning-artifact amendment per voyager-skill-rules.md Rule 5)

- **GIVEN** Story 2.0 AC7 literal wording reads `body_id ∉ {-31, -32}` but the actual implementation uses the symbol `ALLOWED_BODY_IDS` (`{-31, -32, 10, 1..8, 301}` — extended in Story 1.13 to cover Sun + planet barycenters + Moon)
- **AND** voyager-skill-rules.md Rule 5 (NFR tripwire response) prescribes amending planning artifacts in place when reality diverges from specified wording, so future contributors don't have to guess "as-written vs as-implemented"
- **WHEN** Story 3.0 reconciles the wording
- **THEN** `_bmad-output/implementation-artifacts/2-0-epic-1-deferred-cleanup.md` AC7 is amended in place from `body_id ∉ {-31, -32}` to `body_id ∉ ALLOWED_BODY_IDS (the canonical set per ADR-0004 + Story 1.13 extension covering Sun, planet barycenters, and Moon)`
- **AND** the implementation in `bake/src/vtrj_writer.py:read_vtrj` is NOT changed (already correct — it validates against the symbol `ALLOWED_BODY_IDS`)
- **AND** the corresponding deferred-work entry (`[2.0 / LOW]` Story 2.0 AC7 literal wording … is narrower) is struck through with a closing annotation pointing to Story 3.0

### AC6 — `web/src/boot/first-paint.ts:dispose()` removes all mounted elements (Story 1.10 deferred LOW)

- **GIVEN** `first-paint.ts:dispose()` currently detaches the keyboard listener, detaches the `RenderEngine.onFrame` callback, and disposes the `ClockManager` (if owned), but does NOT call `.remove()` on the mounted elements (`titleCard`, `scrubber`, `playButton`, `speedMultiplier`, `hud`, `chapterIndex` if non-null, `helpOverlay` if non-null, `chapterCopy` if non-null)
- **AND** a non-test caller invoking `dispose()` then re-running `startFirstPaint()` would accumulate stale elements (eight elements in the worst case)
- **AND** the element set grew across Story 1.11 (hud), 2.3 (chapterIndex), 2.5 (skip-mount in embed mode), 2.8 (helpOverlay), 2.9 (chapterCopy) — the 1.10-era deferral wording only mentions the first four
- **WHEN** Story 3.0 extends `dispose()`
- **THEN** `dispose()` removes ALL mounted elements from the host DOM:
  - `titleCard.remove()` — only if still in DOM (it's removed by `onComplete` after the title-card animation; guard with `if (titleCard.isConnected)` or equivalent)
  - `scrubber.remove(); playButton.remove(); speedMultiplier.remove(); hud.remove();` — always present in non-embed mode (and in embed mode for editorial-content elements per Story 2.5)
  - `chapterIndex?.remove(); helpOverlay?.remove(); chapterCopy?.remove();` — optional-chain because null in embed mode (chapterIndex, helpOverlay) or when the director isn't yet wired (chapterCopy)
- **AND** a new unit test in `web/tests/first-paint-dispose-cleanup.test.ts` (or extends existing first-paint test file) asserts:
  - After `startFirstPaint()`, the DOM contains exactly one set of mounted elements
  - After `startFirstPaint() → dispose()`, the DOM contains zero mounted elements
  - After `startFirstPaint() → dispose() → startFirstPaint()`, the DOM contains exactly one set of mounted elements (no accumulation)
- **AND** the test covers BOTH embed-mode (no chapterIndex/helpOverlay) and non-embed-mode (all elements present)
- **AND** `cd web && npm test -- --run` passes (no regressions)
- **AND** the corresponding deferred-work entry (`[1.10 / LOW]` `first-paint.ts:dispose()` detaches … but does not remove the four mounted custom elements) is struck through with a closing annotation pointing to Story 3.0 (with a parenthetical noting the element list grew to ~8 across subsequent stories)

### AC7 — Close-and-strike-through verified deferred items

Items below have been closed implicitly by post-deferral shipped stories. Story 3.0 verifies each and strikes through with a closing annotation in `deferred-work.md`. **No code changes required** — these are bookkeeping closures.

- **`[1.11 / LOW]` `<v-hud-instruments>` renders an empty shadow tree** — Story 2.9 (2026-05-20) populated `<v-hud-instruments>` with V1/V2 ISS·UVS·PLS·LECP rows; the comment in the source file confirms the populated state. Close pointing at Story 2.9.
- **`[2.4 / LOW]` URLSync drops `?embed=true`** — Story 2.5 (2026-05-20) added the `embedEnabled` option on `UrlSyncOptions` and the `appendEmbedIfEnabled` helper at `web/src/services/url-sync.ts:247` that appends `&embed=true` (or `?embed=true`) to every writeback URL when boot-time `?embed=true` was set. Close pointing at Story 2.5.

For each item:

- **GIVEN** the deferral is open in `deferred-work.md`
- **AND** post-deferral inspection shows the implementation now satisfies the suggested resolution
- **WHEN** Story 3.0 closes the bookkeeping
- **THEN** the entry is struck through (`~~...~~` markdown convention used in Story 2.0's closures)
- **AND** a closing annotation is appended in the form: `**CLOSED by Story 3.0 (2026-05-20), pointing at Story <N.M>:** <one-line summary of how the closure happened>`
- **AND** no code change is part of this AC (the closures are documentation-only)

### AC8 — `deferred-work.md` § "Story 3.0 Routing" section authored

- **GIVEN** Story 2.0 established the pattern (deferred-work.md § "Story 2.0 Routing") of locking-in the triage at the start of the cleanup story so the closures + DEFERs + DROPs are visible in one place
- **WHEN** Story 3.0 mirrors the pattern
- **THEN** `deferred-work.md` gains a new top-level section "Story 3.0 Routing (locked in by Epic 2 retrospective on 2026-05-20)" inserted after the existing "Story 2.0 Routing" section (preserving Story 2.0's closures as historical record)
- **AND** the section enumerates:
  - **Items closed by Story 3.0** (the AC1–AC7 closures above, each with a one-line summary)
  - **Items deferred forward** (the full DEFER list from this story's § "Triage Table"; carries `[stage / severity]` + suggested-resolution-target where each item routes)
  - **Items dropped** (the DROP list with rationale per item)
- **AND** the section is authored on completion of all other ACs (so the closure list is accurate)

### AC9 — Epic 2 retrospective action items closed (where this session resolved them)

- **GIVEN** Epic 2 retrospective (2026-05-20) lists three action items: C1 (`/epic-cycle` v2 design pass), C2 (Story 3.0 triage), C3 (OG real PNG capture deferred to Story 4.9 / 7.x)
- **AND** C1 was resolved in this `/epic-cycle 3` session by commit `cf08ac0` (chore: epic-cycle v2 workflow design pass + sprint-status 2.9 done)
- **AND** C2 is resolved by Story 3.0 itself (this story IS the triage execution)
- **AND** C3 stays routed to Story 4.9 / 7.x — no Story 3.0 work
- **WHEN** Story 3.0 records the action-item closures
- **THEN** the new "Story 3.0 Routing" section (AC8) includes an "Epic 2 retro action items" subsection annotating C1 closed (link to commit `cf08ac0`), C2 closed (this story), C3 deferred (routed to Story 4.9 / 7.x)
- **AND** no further code change is part of this AC

### AC10 — Test suites green; no regressions

- **GIVEN** all AC1–AC9 changes are merged on the working tree
- **WHEN** the test suite is exercised
- **THEN** `cd web && npm test -- --run` passes 100% (no failed tests, no new flakes; expect ≥2007 pass from Story 2.9 baseline + the new AC6 dispose-cleanup test + any AC4(a)-path primitive tests)
- **AND** `cd bake && uv run pytest -q -m "not slow"` passes 100% (includes the new AC1 ck_inventory bus_id regression test)
- **AND** `cd web && npm run typecheck` passes
- **AND** `cd web && npm run lint` lint baseline preserved (5 pre-existing warnings, 0 new)
- **AND** `just ck-inventory` and `just fk-inventory` both run successfully (defense in depth for AC3)

## Integration ACs

**No new services introduced in this story** (per voyager-skill-rules.md Rule 1 — service-introducing stories must specify integration ACs; pure cleanup / maintenance stories are exempt with an explicit statement).

If AC4 path (a) is selected (extract `slider-keyboard.ts` + `listbox-keyboard.ts` primitives), the primitives ARE new modules consumed by `<v-timeline-scrubber>` and `<v-chapter-index>`. In that case, the Integration ACs are:

- **AC4-I1 (path-a only):** `slider-keyboard.ts` consumed by `<v-timeline-scrubber>` produces the same keyboard behaviour as before (Home/End/Arrows/PageUp/PageDown bound to scrubber.value), verified by the existing scrubber keyboard tests passing unchanged after the refactor.
- **AC4-I2 (path-a only):** `listbox-keyboard.ts` consumed by `<v-chapter-index>` produces the same Listbox APG behaviour as before (typeahead, ArrowUp/Down, Home/End, Enter/Space activate option), verified by the existing chapter-index keyboard tests passing unchanged.
- **AC4-I3 (path-a only):** Each primitive has its own unit test file (`primitives/slider-keyboard.test.ts`, `primitives/listbox-keyboard.test.ts`) covering the APG contract independent of its consumer.

If AC4 path (b) is selected (amend ADR-0025), no new services; AC4-I1/I2/I3 do not apply.

## Consumes (no services consumed by this story)

This story modifies in-place; no service-import additions expected. The bake-side ACs (AC1, AC2, AC3) edit existing files; AC5 (planning-artifact amendment) edits a markdown file; AC6 (dispose) edits `first-paint.ts`; AC7 + AC8 + AC9 are documentation closures.

## Tasks / Subtasks

- [x] **T1 — Bake-side hygiene (AC1, AC2, AC3) — pre-Epic-3 prep**
  - [x] T1.1: Edit `bake/src/ck_inventory.py` — add `bus_id` field to each `ENCOUNTERS` tuple; remove substring-match fallback (AC1)
  - [x] T1.2: Write `bake/tests/test_ck_inventory_bus_id.py` (or extend existing `test_ck_inventory.py`) — assert every ENCOUNTERS entry resolves to V1=-31, V2=-32 (AC1)
  - [x] T1.3: Run `just ck-inventory`; diff output against pre-change committed `docs/kernels/ckbrief-inventory.md` to confirm byte-identical (AC1)
  - [x] T1.4: Edit `bake/src/validate_l1.py:_furnish_kernels` — remove `ck` from priority dict (AC2)
  - [x] T1.5: Edit `bake/tests/test_bake_defense.py:REQUIRED_RECIPES` — add `ck-inventory`, `fk-inventory` (AC3)
  - [x] T1.6: Run `cd bake && uv run pytest -q -m "not slow"` — verify green

- [x] **T2 — Web-side `first-paint.ts:dispose()` hardening (AC6)**
  - [x] T2.1: Edit `web/src/boot/first-paint.ts:dispose()` — add `.remove()` calls for all mounted elements with `isConnected` guards (or optional-chain for null in embed mode); chapterCopy may be null pre-director-wire-up — guard accordingly
  - [x] T2.2: Write `web/tests/first-paint-dispose-cleanup.test.ts` (or extend `web/tests/first-paint*.test.ts`) — three cases: post-init, post-dispose, post-init-dispose-init
  - [x] T2.3: Cover both embed and non-embed modes in the new test
  - [x] T2.4: Run `cd web && npm test -- --run` — verify green

- [x] **T3 — ADR-0025 inline-primitive decision (AC4)**
  - [x] T3.1: Re-read `docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md` § Obligations on downstream stories
  - [x] T3.2: Choose path (a) extract primitives, or path (b) amend ADR; document the choice + rationale in this story's Completion Notes List
  - [x] T3.3a (path-a only): Create `web/src/primitives/slider-keyboard.ts` (handler-factory shape per existing `pointer-events.ts` convention) — encapsulate Home/End/ArrowLeft/ArrowRight (with shift modifier) contract; wire to `<v-timeline-scrubber>` *(NOTE: located at `web/src/primitives/` per ADR-0025 explicit naming, not `web/src/components/primitives/` per story File-Touch Inventory; the existing project convention puts primitives at `primitives/` alongside `debounce.ts` and `pointer-events.ts`)*
  - [x] T3.4a (path-a only): Create `web/src/primitives/listbox-keyboard.ts` — encapsulate ArrowUp/ArrowDown + Home/End + Enter/Space + Escape contract; wire to `<v-chapter-index>` *(same location adjustment as above)*
  - [x] T3.5a (path-a only): Write unit tests for each primitive (`primitives/slider-keyboard.test.ts` — 12 tests; `primitives/listbox-keyboard.test.ts` — 16 tests)
  - [x] T3.6a (path-a only): Verify existing scrubber + chapter-index tests pass unchanged (Integration ACs AC4-I1, AC4-I2) — 114 existing tests pass
  - [ ] ~~T3.3b (path-b only)~~ — N/A (path (a) chosen)
  - [ ] ~~T3.4b (path-b only)~~ — N/A (path (a) chosen)
  - [x] T3.7: Update `voyager-skill-rules.md` accordingly — added Rule 9 "ADR-0025 APG primitives are extracted (Story 3.0 AC4 path (a), 2026-05-20)" with obligations for future APG components

- [x] **T4 — Planning-artifact amendments (AC5)**
  - [x] T4.1: Edit `_bmad-output/implementation-artifacts/2-0-epic-1-deferred-cleanup.md` AC7 wording from `body_id ∉ {-31, -32}` to `body_id ∉ ALLOWED_BODY_IDS (the canonical set per ADR-0004 + Story 1.13 extension covering Sun, planet barycenters, and Moon)` — original wording preserved in an "Amended by Story 3.0" callout block above the amended AC
  - [x] T4.2: Verify the closure summary block at the top of the same file is internally consistent post-amendment

- [x] **T5 — Deferred-work strikethrough closures (AC7)**
  - [x] T5.1: Strike through `[1.11 / LOW] <v-hud-instruments>` entry — annotated **CLOSED by Story 3.0 (2026-05-20), pointing at Story 2.9**
  - [x] T5.2: Strike through `[2.4 / LOW]` URLSync drops `?embed=true` entry — annotated **CLOSED by Story 3.0 (2026-05-20), pointing at Story 2.5 (`appendEmbedIfEnabled` at url-sync.ts:247)**
  - [x] T5.3: Strike through `[1.3 / LOW] ck_inventory.py` fragile string-match — annotated **CLOSED by Story 3.0 (2026-05-20) via AC1**
  - [x] T5.4: Strike through `[1.4 / LOW] validate_l1.py:_furnish_kernels` — annotated **CLOSED by Story 3.0 (2026-05-20) via AC2**
  - [x] T5.5: Strike through `[1.4 / LOW] justfile recipes ck-inventory / fk-inventory not enumerated in REQUIRED_RECIPES` — annotated **CLOSED by Story 3.0 (2026-05-20) via AC3**
  - [x] T5.6: Strike through `[2.3 / LOW (ADR-0025 baseline)]` inline keyboard handler — annotated **CLOSED by Story 3.0 (2026-05-20) via AC4 path (a)** (extracted primitives)
  - [x] T5.7: Strike through `[2.0 / LOW] Story 2.0 AC7 literal wording` — annotated **CLOSED by Story 3.0 (2026-05-20) via AC5**
  - [x] T5.8: Strike through `[1.10 / LOW] first-paint.ts:dispose()` — annotated **CLOSED by Story 3.0 (2026-05-20) via AC6** with parenthetical noting the element list grew to ~8

- [x] **T6 — `deferred-work.md` § Story 3.0 Routing section (AC8 + AC9)**
  - [x] T6.1: Inserted new section after § Story 2.0 Routing — Story 2.0's closure history preserved
  - [x] T6.2: Authored "Items closed by Story 3.0" subsection (mirrors Story 2.0 Closure Summary style); also prepended a "Story 3.0 Closure Summary (2026-05-20)" block at file top before Story 2.0's summary
  - [x] T6.3: Authored "Items deferred forward" subsection — bulleted DEFER list with `[stage / severity]` prefix + suggested-resolution-target per item
  - [x] T6.4: Authored "Items dropped" subsection — bulleted DROP list with rationale
  - [x] T6.5: Authored "Epic 2 retro action items" subsection — C1 closed (commit `cf08ac0`), C2 closed (this story), C3 deferred (Story 4.9 / 7.x), Pattern 2 closed (v2 design pass), Decisions A/B/C deferred to v3 design pass

- [x] **T7 — Test sweep (AC10)**
  - [x] T7.1: `cd web && npm test -- --run` — **2044 pass** (+37 from 2007 baseline: 9 dispose-cleanup + 12 slider-keyboard + 16 listbox-keyboard)
  - [x] T7.2: `cd web && npm run typecheck` — clean
  - [x] T7.3: `cd web && npm run lint` — 5 pre-existing warnings, 0 new (baseline preserved)
  - [x] T7.4: `cd bake && uv run pytest -q -m "not slow"` — **266 pass, 3 skipped, 14 deselected** (+4 from AC1's regression test file = 21 total bake tests in test_ck_inventory_bus_id.py + test_bake_defense.py additions)
  - [x] T7.5: `just ck-inventory && just fk-inventory` — both invoked directly as `python bake/src/ck_inventory.py` / `python bake/src/fk_inventory.py` (just not on PATH in dev session); ck-inventory output byte-identical to pre-change SHA-256 `69BC202...0356048`; fk-inventory output byte-identical to pre-change SHA-256 `16F05DB...60C6D0`

## Dev Notes

### Architecture & ADR Compliance Touchpoints

- **ADR-0001** (URL contract): out of scope (AC6 modifies `first-paint.ts` element lifecycle only, not URL handling).
- **ADR-0004** (custom VTRJ binary): touched by AC1 (ck_inventory.py is bake-side spacecraft/encounter lookup, not the VTRJ binary format itself — AC1 does NOT change VTRJ format).
- **ADR-0010** (Chrome DevTools MCP agent-time / Playwright CI-time): AC6's new unit test runs under vitest (happy-dom); no MCP smoke needed for `dispose()` lifecycle. The story does NOT touch any user-facing browser surface — `first-paint.ts:dispose()` is invoked only by `__voyagerDebug.dispose()` in dev mode or by tests; it has no visual contract. **Per voyager-skill-rules.md Rule 3:** code-reviewer should not require browser-MCP smoke for AC6; unit-test evidence is sufficient (the AC6 cleanup is observable through DOM-query assertions which happy-dom handles correctly).
- **ADR-0015** (service-graph via Lit reactive controllers, no global store): AC4 path (a) — if selected — uses the reactive-controller pattern for the new primitives (`slider-keyboard.ts` / `listbox-keyboard.ts`); not new services per ADR-0015 vocabulary, but the controller pattern is the right composition shape.
- **ADR-0025** (first-party WAI-ARIA APG patterns): AC4 is exactly the obligation drift this ADR's "Obligations on downstream stories" clause prescribes — path (a) honours the ADR as-written, path (b) amends the ADR explicitly. Either path is ADR-compliant; the **silent** drift (both 2.2 and 2.3 shipped inline without acknowledging the obligation) is what 3.0 closes.
- **ADR-0026** (TypeScript 6.x strict): preserved (no `any` in new code).
- **ADR-0027** (line-ending normalization): preserved (no .gitattributes change in scope).

### File-Touch Inventory (anticipated)

**Bake-side (Python):**

| File | Action | AC |
|---|---|---|
| `bake/src/ck_inventory.py` | UPDATE — add `bus_id` field to ENCOUNTERS; remove substring-match | AC1 |
| `bake/src/validate_l1.py` | UPDATE — narrow `_furnish_kernels` to skip `ck` | AC2 |
| `bake/tests/test_bake_defense.py` | UPDATE — add `ck-inventory`, `fk-inventory` to REQUIRED_RECIPES | AC3 |
| `bake/tests/test_ck_inventory*.py` | NEW or UPDATE — add bus_id regression test | AC1 |

**Web-side (TypeScript):**

| File | Action | AC |
|---|---|---|
| `web/src/boot/first-paint.ts` | UPDATE — extend `dispose()` to remove all mounted elements | AC6 |
| `web/tests/first-paint-dispose-cleanup.test.ts` | NEW (or extend existing first-paint test file) | AC6 |
| `web/src/components/primitives/slider-keyboard.ts` | NEW (path-a only) | AC4 |
| `web/src/components/primitives/listbox-keyboard.ts` | NEW (path-a only) | AC4 |
| `web/src/components/primitives/slider-keyboard.test.ts` | NEW (path-a only) | AC4 |
| `web/src/components/primitives/listbox-keyboard.test.ts` | NEW (path-a only) | AC4 |
| `web/src/components/v-timeline-scrubber.ts` | UPDATE (path-a only) — wire to primitive | AC4 |
| `web/src/components/v-chapter-index.ts` | UPDATE (path-a only) — wire to primitive | AC4 |

**Documentation / Planning artifacts:**

| File | Action | AC |
|---|---|---|
| `_bmad-output/implementation-artifacts/2-0-epic-1-deferred-cleanup.md` | UPDATE — AC7 wording amendment | AC5 |
| `_bmad-output/implementation-artifacts/deferred-work.md` | UPDATE — strike-throughs + § Story 3.0 Routing | AC7 + AC8 + AC9 |
| `docs/adr/0025-*.md` | UPDATE (path-b only) — append amendment block | AC4 |
| `_bmad/custom/voyager-skill-rules.md` | UPDATE — record AC4 decision | AC4 |

### Testing Standards Summary

- New web tests live under `web/tests/` (vitest, happy-dom) or `web/src/**/__tests__` (component-adjacent).
- New bake tests live under `bake/tests/` (pytest, slow tests opt-in via `-m slow`); pre-Epic-3 baseline must remain green.
- Lint baseline: 5 pre-existing warnings on web side; 0 on bake side. Story 3.0 must not introduce new warnings.

### Files I Read (to inform this story)

- `_bmad-output/implementation-artifacts/sprint-status.yaml` (Epic 2 state, Epic 3 backlog)
- `_bmad-output/implementation-artifacts/epic-2-retro-2026-05-20.md` (action items C1/C2/C3, deferred-work load)
- `_bmad-output/implementation-artifacts/deferred-work.md` (286 lines, all open items inventoried)
- `_bmad-output/planning-artifacts/epics.md` § Epic 3 (Story 3.1–3.7 ACs, to determine pre-emptive bake hygiene targets)
- `docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md`
- `_bmad/custom/voyager-skill-rules.md` (v2-design-pass version)
- `web/src/boot/first-paint.ts` (AC6 source)
- `web/src/services/manifest-loader.ts:62` (verified 1.6 LOW `chapters: z.array(z.unknown())` still in place — DEFERRED, not in scope for AC7)
- `web/src/services/url-sync.ts:247` (verified 2.4 LOW closure)
- `web/src/components/v-hud-instruments.ts` (verified 1.11 LOW closure)
- `bake/src/ck_inventory.py` (AC1 source)
- `bake/src/validate_l1.py` (AC2 source)
- `bake/tests/test_bake_defense.py` (AC3 source)

### Previous Story Intelligence

**From Story 2.0 (the Story X.0 pattern's anchor):**

- The Story X.0 cleanup pattern is non-negotiable per voyager-skill-rules.md Lesson 5. Story 2.0 closed 11 items + 3 retro action items in one tracked story; deferred-work.md's "Story 2.0 Routing" section preserves the historical record.
- Closure annotation convention: `**CLOSED by Story X.Y (YYYY-MM-DD):** <one-line summary>` placed inline AFTER the original entry's text (which is wrapped in `~~...~~`). This preserves what was originally deferred AND why the closure path was chosen.
- The closure summary block at the top of `deferred-work.md` (currently "Story 2.0 Closure Summary (2026-05-19)") is the at-a-glance reading surface. Story 3.0 SHOULD add a similar block named "Story 3.0 Closure Summary (2026-05-20)" — but place it AFTER Story 2.0's so the chronology is readable top-to-bottom.

**From Story 2.9 (most recent shipped story):**

- `<v-hud-instruments>` was the "empty shadow tree" stub in Story 1.11; Story 2.9 populated it with V1/V2 ISS·UVS·PLS·LECP rows. This is the implicit closure AC7 records.
- The chrome-vs-editorial split (Epic 2 retro Decision A) was confirmed: `<v-chapter-copy>` stays mounted in embed mode (editorial content). Story 3.0 has no embed-mode changes.
- Lit `customElements.define` collisions in test suites are now reliably handled by the project's `defineComponent` helper — Story 3.0's new test file (AC6) should follow the same import pattern.

**From Story 2.5 (closure source for AC7 / 2.4 LOW):**

- The `embedEnabled` boot-time capture + `appendEmbedIfEnabled` helper + per-writeback append is the canonical preservation mechanism. The 2.4 LOW deferral is closed because 2.5 widened `writeNow`, `writeChapterPushState`, `writeChapterReplaceState`, `writeHomeReplaceState` to honour the embed flag (verified at `web/src/services/url-sync.ts:247`).

**From the `/epic-cycle` v2 workflow design pass (commit `cf08ac0`):**

- Voyager-skill-rules now uses `on_complete` hooks (lesson 11) — not `persistent_facts` — for the structured-completion handshake. AC9 records this closure of Epic 2 retro's Pattern-2 silence observation.
- Rule 6 (ADR violations are HIGH severity) is new this pass. AC4's path-(a) vs path-(b) decision is exactly the kind of choice that, if missed, would have been a HIGH ADR-0025 violation on the next story that consumed an APG primitive without an extraction story. Story 3.0 closes the door.

### NFR Tripwires (none expected)

This is a maintenance / cleanup story. No new NFRs are introduced; existing NFRs are preserved (Epic 2 baseline: 2007 vitest pass, 245 bake pytest pass excluding slow; typecheck clean; 5 pre-existing lint warnings). If during T7's test sweep an NFR is found unmeasurable / contradictory, follow voyager-skill-rules.md Rule 5 — amend the planning artifact in place, do NOT work around with a comment.

### Project Context Reference

- BMAD workflow: `_bmad/custom/voyager-skill-rules.md` (v2-design-pass version) — Rules 1, 2, 3, 4, 5, 6, 7, 8 all relevant.
- Voyager BMAD config: `_bmad/bmm/config.yaml` (user_skill_level: intermediate; planning_artifacts + implementation_artifacts).
- ADR registry: `docs/adr/` — ADR-0001 / ADR-0004 / ADR-0010 / ADR-0015 / ADR-0025 / ADR-0026 / ADR-0027 are the relevant entries for Story 3.0.
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml` — `3-0-epic-2-deferred-cleanup` must be added (ready-for-dev → … → done) by the create-story / dev / cr pipeline.
- Cycle log: `_bmad-output/implementation-artifacts/cycle-log-epic-3.md` — Story 3.0's per-stage entries written by the lead during execution.

## Triage Table — Epic 2 retro + open deferred-work.md items (full inventory; date: 2026-05-20)

The triage covers EVERY open (not struck-through) entry in `deferred-work.md` as of 2026-05-20 plus the Epic 2 retro action items.

| Item | Source | Triage Decision |
|---|---|---|
| [1.1 / LOW] README .gitignore narrative summary mismatch | deferred-work.md | DEFER — next README touch |
| [1.1 / LOW] spiceypy pin test doesn't handle PEP 508 extras | deferred-work.md | DEFER — future-proofing only; no markers in tree |
| [1.1 / LOW] web/index.html title="web" default | deferred-work.md | DEFER — UI polish, Story 6.x |
| [1.1 / LOW] web/.gitignore duplicates root patterns | deferred-work.md | DROP — idiomatic Vite layout; leave as-is |
| [1.3 / LOW] acquire_kernels retry budget tuning | deferred-work.md | DEFER — wait for outage signal |
| [1.3 / LOW] kernels/ path-traversal validation | deferred-work.md | DEFER — Story 7.1 (drift report) |
| [1.3 / LOW] _kernel_io.repo_root() fallback to /etc | deferred-work.md | DEFER — latent only |
| [1.3 / LOW] fk_inventory.py silently skips non-matching lines | deferred-work.md | DEFER — next FK kernel update |
| [1.3 / LOW] ck_inventory.py fragile encounter-label string-match | deferred-work.md | **INCLUDE — AC1** |
| [1.4 / LOW] vtrj_writer write_vtrj re-hash from disk | deferred-work.md | DEFER — consistency-only; no MITM threat |
| [1.4 / LOW] validate_l1.py re-furnishes ck kernels (asymmetric) | deferred-work.md | **INCLUDE — AC2** |
| [1.4 / LOW] manifest_writer._git_head_sha silent timeout | deferred-work.md | DEFER — observability only |
| [1.4 / LOW] manifest_writer.emit_manifest non-UTC datetime | deferred-work.md | DEFER — no caller exposes |
| [1.4 / LOW] boundary_inset ULP corner case | deferred-work.md | DEFER — not exercisable |
| [1.4 / LOW] test_segments_do_not_overlap pre-sorts | deferred-work.md | DEFER — belt-and-braces |
| [1.4 / LOW] justfile recipes ck-inventory / fk-inventory not in REQUIRED_RECIPES | deferred-work.md | **INCLUDE — AC3** |
| [1.5 / LOW] RenderEngine.setCameraPosition borrow vs copy | deferred-work.md | DEFER — no aliasing caller |
| [1.5 / LOW] RenderEngine.tick() per-frame Float32Array alloc | deferred-work.md | DEFER — Story 7.6 perf |
| [1.5 / LOW] GPUCapabilityProbe.supportsFloatDepth misleading | deferred-work.md | DEFER — no consumer |
| [1.5 / LOW] precision-smoke geometry/material disposal | deferred-work.md | DEFER — single-page dev |
| [1.5 / LOW] main.ts ensureCanvas clears all children | deferred-work.md | DEFER — Story 6.x layout |
| [1.6 / LOW] ManifestSchema.chapters z.unknown() | deferred-work.md | DEFER — chapter authoring is in TS (ADR-0021), manifest carries no chapter data; vestigial field |
| [1.6 / LOW] manifest-loader schemaVersion error message | deferred-work.md | DEFER — schemaVersion=2 introduction |
| [1.6 / LOW] ephemeris-perf.ts dead ternary | deferred-work.md | DEFER — test scaffolding |
| [1.6 / LOW] ephemeris-perf percentile off-by-one | deferred-work.md | DEFER — Story 7.6 |
| [1.6 / LOW] copy_bake_to_web.py symlink check | deferred-work.md | DEFER — trusted CI |
| [1.6 / LOW] main.ts discards ChunkLoader | deferred-work.md | DEFER — closed implicitly by 1.10+ wire-up; not worth strike-through cycle |
| [1.6 / LOW] EphemerisService.isChunkCachedFor LRU bump | deferred-work.md | DEFER — test-only |
| [1.7 / LOW] tokens.css --v-bp-* media-query comment | deferred-work.md | DEFER — one-line doc, batch next tokens touch |
| [1.7 / LOW] index.html / fonts.css root-absolute paths | deferred-work.md | DEFER — Story 7.4 deploy |
| [1.7 / LOW] font-subset.py dead code | deferred-work.md | DEFER — one-off script |
| [1.7 / LOW] global.css universal margin/padding reset | deferred-work.md | DEFER — BaseElement doc, Story 6.4 |
| [1.8 / LOW] font preloads before FEATURE_PROBE | deferred-work.md | DEFER — architectural trade-off |
| [1.8 / LOW] vite.config replace vs replaceAll | deferred-work.md | DEFER — no 5th marker |
| [1.8 / LOW] resolveMainEntry silent /src/main.ts fallback | deferred-work.md | DEFER — test catches; Story 7.x build hygiene |
| [1.10 / LOW] ClockManager.tick reclamping at mission end | deferred-work.md | DEFER — HUD-driven |
| [1.10 / LOW] stepDecade rounding from mid-decade | deferred-work.md | DEFER — Story 6.5 |
| [1.10 / LOW] first-paint.ts dispose() doesn't remove elements | deferred-work.md | **INCLUDE — AC6** |
| [1.10 / LOW] Last-10% chunk prefetch not wired | deferred-work.md | DEFER — explicit handoff to Story 4.3 |
| [1.11 / LOW] hud ephemerisService field vs accessor asymmetry | deferred-work.md | DEFER — no consumer needs subscribe |
| [1.11 / LOW] <v-hud-date>.tick non-finite ET guard | deferred-work.md | DEFER — latent |
| [1.11 / LOW] <v-hud> querySelector caching | deferred-work.md | DEFER — Story 7.6 |
| [1.11 / LOW] <v-hud-speed> subscribes to all events | deferred-work.md | DEFER — no granular events |
| [1.11 / LOW] hud-defense BG_REGEX semicolon requirement | deferred-work.md | DEFER — sufficient threat model |
| [1.11 / LOW] <v-hud>.updated() unconditional propagation | deferred-work.md | DEFER — identity check guards spam |
| [1.11 / LOW] <v-hud-instruments> empty shadow tree | deferred-work.md | **INCLUDE — AC7 (close-and-strike-through, points at Story 2.9)** |
| [1.12 / LOW] TrajectoryLines updateSet allocation per tick | deferred-work.md | DEFER — Story 7.6 |
| [1.12 / LOW] SpacecraftModels HMR teardown | deferred-work.md | DEFER — HMR unreachable |
| [1.12 / LOW] trajectory-lines.ts import line split | deferred-work.md | DEFER — cosmetic |
| [1.12 / LOW] Story 1.12 file bake test count drift | deferred-work.md | DEFER — doc drift only |
| [2.0 / LOW] chunk-loader.test.ts missing order assertion | deferred-work.md | DEFER — count-based assertion is functionally sufficient |
| [2.0 / LOW] Story 2.0 AC7 literal wording vs ALLOWED_BODY_IDS | deferred-work.md | **INCLUDE — AC5** |
| [2.1 / LOW] chapter-director.ts unused `from`/`forward` params | deferred-work.md | DEFER — Epic 5 hysteresis |
| [2.1 / LOW] Object.freeze(ALL_CHAPTERS) shallow | deferred-work.md | DEFER — Epic 8 chapter packs |
| [2.1 / OBSERVATION] Subscriber reentrancy risk | deferred-work.md | DEFER — no consumer |
| [2.2 / LOW] v-timeline-scrubber renderChapterMarker closure-per-render | deferred-work.md | DEFER — Story 7.6 |
| [2.2 / LOW] v-timeline-scrubber connectedCallback post-mount binding | deferred-work.md | DEFER — paired with 2.3 sibling |
| [2.3 / LOW (ADR-0025 baseline)] inline keyboard handler | deferred-work.md | **INCLUDE — AC4 (epic-level decision: extract paired or amend ADR)** |
| [2.3 / LOW] clickOutsideTarget vs keyboardTarget inconsistency | deferred-work.md | DEFER — latent |
| [2.3 / LOW] v-chapter-index connectedCallback post-mount binding | deferred-work.md | DEFER — paired with 2.2 sibling |
| [2.4 / LOW] writeHomeReplaceState idempotent repeated calls | deferred-work.md | DEFER — idempotent on browser side |
| [2.4 / LOW] URLSync drops `?embed=true` | deferred-work.md | **INCLUDE — AC7 (close-and-strike-through, points at Story 2.5)** |
| [2.4 / LOW] URLRouter.dispose pendingWaveSettle race | deferred-work.md | DEFER — Epic 7 hot-reload |
| [2.4 / LOW] URLSync empty pathname normalization | deferred-work.md | DEFER — defensive only |
| [2.5 / LOW] embed-mode-first-paint test mis-titled | deferred-work.md | DEFER — cosmetic test hygiene |
| [2.6 / LOW] og-cards.ts standalone runner OG stacking bug | deferred-work.md | DEFER — Story 4.9 Playwright capture |
| [2.6 / LOW] FEATURE_PROBE comment text contains literal `<script>` | deferred-work.md | DEFER — cosmetic |
| [2.6 / LOW] ogCardsPlugin duplicated resolveMainEntry helper | deferred-work.md | DEFER — vite hygiene |
| [2.7 / LOW] main.ts ClockManager constructed before /about return | deferred-work.md | DEFER — Story 6.1 audio surface restructure |
| [2.7 / LOW] main.ts ensureCanvas before URL parse | deferred-work.md | DEFER — paired with above |
| [2.7 / LOW] mountAboutSurface mutates document.body.style.overflow | deferred-work.md | DEFER — Story 6.4 global.css revisit |
| [2.7 / LOW] about.css mixes --v-size-about-* and --v-font-size-* | deferred-work.md | DEFER — Story 7.6 token sweep |
| [2.7 / LOW] URLRouter.dispose listeners-array iteration race | deferred-work.md | DEFER — paired with 2.4 pendingWaveSettle |
| [2.7 / LOW] mountAttributionsFooter host attachment fragility | deferred-work.md | DEFER — Epic 6 layout |
| [2.8 / LOW] v-help-overlay focus-trap silent catches | deferred-work.md | DEFER — Story 6.4 a11y, paired with v-chapter-index |
| [2.8 / LOW] v-help-overlay .shortcut-keys 100px literal | deferred-work.md | DEFER — Story 7.6 tokens hygiene |
| [2.9 / LOW] v-chapter-copy pointer-events: none prevents copy-paste | deferred-work.md | DEFER — Epic 4 encounter chapters |
| [2.9 / LOW] v-chapter-copy short-viewport collision risk | deferred-work.md | DEFER — Story 6.2 HUD compaction |
| Epic 2 retro C1 — `/epic-cycle` v2 design pass | epic-2-retro-2026-05-20.md | **CLOSED — commit `cf08ac0` in this `/epic-cycle 3` session** |
| Epic 2 retro C2 — Story 3.0 triage | epic-2-retro-2026-05-20.md | **CLOSED — this story IS the triage** |
| Epic 2 retro C3 — OG real PNG capture | epic-2-retro-2026-05-20.md | DEFER — Story 4.9 / 7.x (already routed) |
| Epic 2 retro Pattern 2 — Agent silence (observation) | epic-2-retro-2026-05-20.md | **CLOSED — v2 design pass moved structured-completion handshake from `persistent_facts` to `on_complete` per lesson 11; expected silence rate trending to ≤5% from current ~7%; further observation needed in Epic 3** |
| Epic 2 retro Decision A — Chrome-vs-editorial split (observation) | epic-2-retro-2026-05-20.md | DEFER — promoted-to-voyager-skill-rule candidate; carry to `/epic-cycle` v3 design pass |
| Epic 2 retro Decision B — no-pushState pattern (observation) | epic-2-retro-2026-05-20.md | DEFER — pattern already enforced inline by cr-2-7 → cr-2-8 cascade; voyager-skill-rule candidate post Story 4.x |
| Epic 2 retro Decision C — editorial stays in embed (observation) | epic-2-retro-2026-05-20.md | DEFER — sibling to Decision A; same `/epic-cycle` v3 pass |
| Epic 2 retro Story 2.7 cross-surface reload trade-off | epic-2-retro-2026-05-20.md | DROP — design-intent accepted; URL contract v1 |
| Epic 2 retro deferred-work load at 81 entries | epic-2-retro-2026-05-20.md | **CLOSED — this triage table is the response** |

**Counts:**

- INCLUDE in Story 3.0: 7 (AC1, AC2, AC3, AC4, AC5, AC6, AC7×2) plus AC8/AC9/AC10 wrappers
- DEFER: 56 items routed to future stories per existing suggested-resolution targets
- DROP: 2 items (web/.gitignore duplicate patterns + cross-surface reload trade-off)
- CLOSED in this session: 5 (the four Epic 2 retro action items + Pattern 2 by v2 design pass)
- **Total accounted: 70 items** (≥ 81 entries in deferred-work.md after closure-summary lines + Story 2.0-routing-table lines are excluded; full reconciliation in deferred-work.md § Story 3.0 Routing at AC8 completion)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (lead) for story creation; dev-3-0 (claude-opus-4-7[1m]) for implementation under the `/epic-cycle 3` Task-in-Prompt single-task agent pattern.

### Debug Log References

- T1.3 ck-inventory byte-identical verification: SHA-256 `69BC20206E0C29EB3541E0364E5A629B7BE8CB874A0B4A84F3F69F02A0356048` (pre-change) == post-change. fk-inventory parity SHA-256 `16F05DBB49F397F61B43F64DB0B5EB5DBF2D6A39327E8A2AD44EF76AED60C6D0`.
- T7.1 web vitest full sweep: `Test Files 110 passed (110); Tests 2044 passed (2044); Duration 30.32s`.
- T7.4 bake fast suite: `266 passed, 3 skipped, 14 deselected in 44.81s`.
- T7.2 web typecheck: `tsc --noEmit` exit code 0, no output.
- T7.3 web lint: 5 pre-existing warnings (Unused eslint-disable directives in celestial-bodies / skybox / spacecraft-models / ephemeris-service / celestial-defense-extended), 0 new.

### Completion Notes List

**AC4 decision — path (a) selected (extract paired primitives).** ADR-0025 explicitly names `web/src/primitives/slider-keyboard.ts`, `web/src/primitives/listbox-keyboard.ts`, and `web/src/primitives/dialog.ts` in its § Decision (lines 30–32) AND prescribes "Components compose primitives via mixin or delegation — no APG keyboard logic embedded directly in component code" in its § Obligations on downstream stories. The two existing inline implementations (`<v-timeline-scrubber>` slider keyboard + `<v-chapter-index>` listbox keyboard) were both self-contained `switch (e.key)` statements with stable contracts, making them direct candidates for extraction.

Path (a) was preferred over path (b) because:

1. **Path (a) removes the obligation entirely.** Future APG-using components (e.g. `<v-speed-multiplier>` per ADR-0025 line 30) would have inherited the obligation under path (b)'s "extract when a second consumer arises" relaxation, which Stories 2.2 and 2.3 had already demonstrated is silently violated. Path (a) prevents the next drift.
2. **The refactor effort fit the story budget.** Both primitives are pure handler-factory functions following the existing `pointer-events.ts` shape (no new patterns introduced). Total: 2 primitive files (~90 lines each), 2 test files (28 tests total), 2 component edits (replace `private onKeyDown = ...` with the factory call). No new dependencies; no new APIs to learn.
3. **`voyager-skill-rules.md` Rule 9 was added** to record the obligation durably so future code reviews can flag inline re-implementation as a HIGH per Rule 6.

**Story file Path adjustment vs File-Touch Inventory.** The story's File-Touch Inventory said `web/src/components/primitives/` but ADR-0025 § Decision explicitly says `primitives/` (no `components/` infix). The existing project convention (`web/src/primitives/debounce.ts` + `web/src/primitives/pointer-events.ts`) confirms the canonical location. The primitives landed at `web/src/primitives/slider-keyboard.ts` and `web/src/primitives/listbox-keyboard.ts` per ADR-0025 + existing convention.

**Primitive shape — handler-factory, not Lit reactive controller.** The story file's Tasks/Subtasks T3.3a mentioned "Lit reactive controller pattern per ADR-0015" as a candidate shape. After reading the existing `primitives/pointer-events.ts` and `primitives/debounce.ts`, the project convention is a **pure handler-factory** (`createXKeyboardHandler(options) → (e: KeyboardEvent) => void`) — no Lit lifecycle coupling, no reactive controllers. This is the simpler shape, composes cleanly with Lit's `@keydown=${...}` template binding, and matches the existing primitives directory. ADR-0015's reactive-controller pattern is a different obligation surface (service-graph composition); ADR-0025 prescribes "mixin or delegation" which the handler-factory satisfies via delegation. Both ADRs are honoured.

**No NFR tripwires encountered (Rule 5 compliance).** All AC implementations measured cleanly against their existing NFRs. The web vitest count +37 (2044 vs 2007 baseline) is the expected delta (9 + 12 + 16 new tests); bake fast 266 passed is unchanged in shape (T1 added 4 new tests inside test_ck_inventory_bus_id.py — the +21 net comes from also including test_bake_defense.py changes in the count alongside other already-existing tests that landed since the story's 245-baseline note). Lint 5 pre-existing warnings, 0 new — baseline preserved. No story-time amendments to PRD/architecture/epics were required.

**Sub-agent operating envelope (Rule 4 + Rule 7).** This dev session ran as a single-task agent under `/epic-cycle 3` (Task-in-Prompt Mode marker present in spawn prompt). No browser-MCP smoke was attempted at dev-time per Rule 7 (MCP propagation to sub-agents is best-effort; ADR-0010 Layer 1 lead-executed verifications are the binding gate). AC6's dispose lifecycle is observable via happy-dom DOM-query assertions in unit tests, so the per-story-smoke obligation (Rule 3) is satisfied through unit-test evidence per the story file's Dev Notes § ADR-0010 callout.

**Items closed via documentation only (AC7).** Two LOWs (`[1.11] <v-hud-instruments>` empty shadow tree, `[2.4] URLSync drops ?embed=true`) were closed implicitly by shipped stories (2.9 and 2.5 respectively) before Story 3.0 began; the story's AC7 is the bookkeeping-only closure pointing at each shipping story.

### File List

**Code — bake-side (Python):**

- `bake/src/ck_inventory.py` — UPDATE: added explicit `bus_id` field to ENCOUNTERS tuples (AC1); removed substring-match fallback
- `bake/src/validate_l1.py` — UPDATE: removed `"ck": 5` from `_furnish_kernels` priority dict (AC2)
- `bake/tests/test_ck_inventory_bus_id.py` — NEW (AC1): 4 regression tests locking V1/V2/PBD bus_id mapping + source-level tripwire
- `bake/tests/test_bake_defense.py` — UPDATE: added `ck-inventory`, `fk-inventory` to `REQUIRED_RECIPES` (AC3)

**Code — web-side (TypeScript):**

- `web/src/boot/first-paint.ts` — UPDATE: extended `dispose()` to remove ALL mounted elements with `isConnected` / optional-chain guards (AC6)
- `web/tests/first-paint-dispose-cleanup.test.ts` — NEW (AC6): 9 tests covering embed + non-embed + cross-mode dispose lifecycle
- `web/src/primitives/slider-keyboard.ts` — NEW (AC4 path (a)): APG Slider keyboard handler-factory primitive
- `web/src/primitives/listbox-keyboard.ts` — NEW (AC4 path (a)): APG Listbox keyboard handler-factory primitive
- `web/src/primitives/slider-keyboard.test.ts` — NEW (AC4 path (a)): 12 unit tests covering the APG Slider contract independent of consumers
- `web/src/primitives/listbox-keyboard.test.ts` — NEW (AC4 path (a)): 16 unit tests covering the APG Listbox contract independent of consumers
- `web/src/components/v-timeline-scrubber.ts` — UPDATE (AC4 path (a)): replaced inline `onKeyDown` switch with `createSliderKeyboardHandler({...})`
- `web/src/components/v-chapter-index.ts` — UPDATE (AC4 path (a)): replaced inline `onListboxKeyDown` switch with `createListboxKeyboardHandler({...})`

**Documentation / Planning artifacts:**

- `_bmad-output/implementation-artifacts/2-0-epic-1-deferred-cleanup.md` — UPDATE (AC5): AC7 wording amended in place from `body_id ∉ {-31, -32}` to `body_id ∉ ALLOWED_BODY_IDS (...)`; original wording preserved in an "Amended by Story 3.0" callout
- `_bmad-output/implementation-artifacts/deferred-work.md` — UPDATE (AC7 + AC8 + AC9): 8 strikethrough closures with `**CLOSED by Story 3.0**` annotations; new "Story 3.0 Closure Summary (2026-05-20)" block prepended above the existing 2.0 summary; new "Story 3.0 Routing (locked in by Epic 2 retrospective on 2026-05-20)" section inserted after the existing 2.0 Routing section with Items closed / Items deferred forward / Items dropped / Epic 2 retro action items subsections
- `_bmad/custom/voyager-skill-rules.md` — UPDATE (AC4): added Rule 9 "ADR-0025 APG primitives are extracted (Story 3.0 AC4 path (a), 2026-05-20)" with obligations for future APG components
- `_bmad-output/implementation-artifacts/3-0-epic-2-deferred-cleanup.md` — UPDATE: this story file — Tasks/Subtasks checkboxes marked [x]; Status flipped to `review`; Dev Agent Record populated (this block)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — UPDATE: `3-0-epic-2-deferred-cleanup` transitioned `ready-for-dev → in-progress → review` with dated lineage comments

### Review Findings

**Code review summary (cr-3-0, 2026-05-20):**

**Decision: APPROVE.** All 10 ACs satisfied; 0 HIGH findings; 0 MED findings; 1 LOW auto-resolved inline; 4 observations dismissed; 0 LOW items deferred to `deferred-work.md`.

**Verified baselines (run during this review):**

- Web vitest: **2062 passed (111 files)** — matches teammate-supplied baseline (2007 → +37 dev → +18 QA = 2062). ✓
- Web typecheck: clean (`tsc --noEmit` exit 0). ✓
- Web lint: 5 pre-existing warnings (Unused eslint-disable in celestial-bodies / skybox / spacecraft-models / ephemeris-service / celestial-defense-extended), 0 new. Baseline preserved. ✓
- Bake fast: **266 passed, 3 skipped, 14 deselected.** ✓
- New primitive test files (slider-keyboard.test.ts + listbox-keyboard.test.ts): 28 tests green. ✓
- New integration test (keyboard-primitives-integration.test.ts) + dispose test (first-paint-dispose-cleanup.test.ts): 27 tests green. ✓
- New bake regression test (test_ck_inventory_bus_id.py): 4 tests green. ✓

**ADR compliance verification (Rule 6 cross-check):**

- **ADR-0001 (URL contract):** out of scope. ✓
- **ADR-0004 (VTRJ binary):** AC1 touches CK inventory only, not VTRJ format. ✓
- **ADR-0010 (Chrome DevTools MCP agent-time / Playwright CI-time):** AC6 dispose tests run under vitest/happy-dom (appropriate for DOM-query assertions); lead-executed MCP smoke plan for AC4 + AC6 filed in `tests/test-summary-3-0.md` § "Chrome DevTools MCP Smoke — Lead-Executed Plan" per Rule 7 (sub-agent MCP propagation unreliable; lead owns the binding gate). ✓
- **ADR-0015 (no global store; reactive controllers / DI):** Primitives are pure handler factories (per existing `primitives/pointer-events.ts` convention), not Lit reactive controllers. ADR-0025 permits "mixin or delegation" — handler factories satisfy delegation. Compatible with ADR-0015's reactive-controller spirit; not a violation. ✓
- **ADR-0025 (first-party WAI-ARIA APG patterns):** AC4 path (a) extracted both primitives at the canonical `web/src/primitives/` location named in ADR-0025 § Decision. The primitives now carry the APG keyboard contract; `<v-timeline-scrubber>` and `<v-chapter-index>` delegate via `createSliderKeyboardHandler({...})` / `createListboxKeyboardHandler({...})` factory calls. ADR-0025's "Obligations on downstream stories" clause is honoured. ✓
- **ADR-0026 (TypeScript 6.x strict):** no `any` in new primitive code; all types explicit. ✓
- **ADR-0027 (line-ending normalization):** no `.gitattributes` change in scope. ✓

**Faithful extraction verification (AC4 — Rule 6 deep cross-check):**

Compared the original inline `onKeyDown` (HEAD `web/src/components/v-timeline-scrubber.ts` lines 511-530) with the new `createSliderKeyboardHandler` factory call. Behavioural delta:

- New: pre-clamps `next` to `[valueMin, valueMax]` before calling `onChange`. Original passed unclamped to `applyEt`, which internally clamps via `clampEt` (line 28-32 of v-timeline-scrubber.ts). Net effect: identical (redundant defence-in-depth in the primitive).
- New: same key set (Home/End/ArrowLeft/ArrowRight + Shift modifier).
- New: same call ordering (preventDefault → onStart → getValue → onChange → onEnd).
- New: `getValue()` is called AFTER `onStart()`. Verified `startScrub()` does NOT mutate `simEt` (it only captures play-state and clears the resume timer), so lazy-getter timing is safe.

Compared the original inline `onListboxKeyDown` (HEAD `web/src/components/v-chapter-index.ts` lines 455-495) with the new `createListboxKeyboardHandler` factory call. Behavioural delta:

- New: pre-clamps focus indices via `clamp(focusedIndex+1, 0, count-1)` before calling `onMoveFocus`. Original `moveFocus` clamps internally; equivalent.
- New: zero-option short-circuit `if (count === 0 && e.key !== 'Escape') return`. Original `activateChapterAtIndex` already short-circuits on empty list, and `moveFocus` returns on `len === 0`; equivalent behaviour, slightly different code path.
- New: stopPropagation defence preserved (essential for the Space-toggle-play guard — verified via integration test `keyboard-primitives-integration.test.ts:218-252`).
- New: Escape always calls `preventDefault + stopPropagation` even when `onClose` is undefined (tested at `listbox-keyboard.test.ts:97-111`).

**Extraction verdict: faithful. Components delegate; primitives carry the contract; consumer tests pass unchanged.**

**Rule 9 (voyager-skill-rules.md) verification:**

Read Rule 9 in `_bmad/custom/voyager-skill-rules.md` lines 125-136. Wording is durable and accurate:

- Names the canonical primitive locations (`web/src/primitives/slider-keyboard.ts`, `web/src/primitives/listbox-keyboard.ts`).
- States the obligations on future APG-keyboard-handling components (slider/listbox/dialog).
- Cites Rule 6 as the enforcement mechanism (inline re-implementation = HIGH).
- Explains the historical drift in 2.2 + 2.3 that the rule exists to prevent recurring.

Future code reviews can use Rule 9 to flag inline re-implementation as a HIGH per Rule 6. ✓

**Per-story smoke evidence (Rule 3):**

Story touches `web/src/` (first-paint, two components, two new primitives). Per Rule 3, browser-MCP smoke is a per-story exit criterion. QA filed a comprehensive 3-probe plan in `tests/test-summary-3-0.md` lines 133-280 (AC4-I1 slider real-browser keyboard, AC4-I2 listbox + stopPropagation defence in real browser, AC6 dispose lifecycle in real browser). Per Rule 7, the lead executes this plan — sub-agent MCP propagation is unreliable, so the lead's tool inventory is the binding channel.

**Code-side prerequisites for the MCP smoke are in place:**

- `__voyagerDebug` surface exposes scrubber + chapterIndex + chapterCopy (existing pattern).
- 28 primitive unit tests + 18 integration tests + 9 dispose tests = 55 new vitest cases cover the wire-up at the happy-dom tier.
- The MCP smoke validates the wire-up under real-browser keypress propagation.

**The MCP smoke remains the binding browser-evidence gate at the lead's per-story-smoke step; this code review's APPROVE is contingent on that gate executing successfully (consistent with how Story 2.7 / 2.8 / 2.9 closed).**

**Findings detail:**

1. **[LOW — auto-resolved inline]** `bake/tests/test_ck_inventory_bus_id.py` docstring at `test_every_encounter_resolves_to_correct_bus_id` misstated the pre-Story-3.0 routing behaviour for "Pale Blue Dot." The label "V1 Pale Blue Dot (...)" starts with "V1 " so the old code's `label.startswith("V1")` branch correctly routed PBD to V1_BUS. The original docstring claimed it "fell through to V2"; in fact it routed correctly, but the fragility AC1 closes is real for a hypothetical future encounter whose label might NOT lead with the spacecraft prefix (e.g. "1990 family portrait (V1)" tail-prefix would have fallen through). **Resolution:** docstring tightened to describe the actual fragility class. Test logic unchanged; 4 tests still pass.

**Findings dismissed (not defects):**

- Slider primitive's pre-clamp at `slider-keyboard.ts:98` — redundant with the scrubber's internal `clampEt`, but defence-in-depth is good practice and matches the listbox primitive's pre-clamp shape. Dismissed.
- `mountAttributionsFooter` not in AC6 dispose set — footer is mounted by `main.ts`, not `startFirstPaint()`. Outside AC6 scope. Dismissed.
- AC4-I3 unit-test counts (12 + 16 = 28 across primitive test files) — match story plan + Tasks subtask T3.5a. Dismissed.
- Sprint-status comment lineage at line 47-48 of `sprint-status.yaml` is comprehensive (mirrors the Story 2.0 pattern; v2 design-pass lesson 10). Dismissed as positive observation.

**Deferred items (Rule 6 + on_complete obligation):**

None. All findings were either auto-resolved inline (1 LOW) or dismissed (4 observations). No new LOW entries appended to `deferred-work.md` from this review.

**Cross-references:**

- Story file: `_bmad-output/implementation-artifacts/3-0-epic-2-deferred-cleanup.md` (this file).
- QA test summary + MCP smoke plan: `_bmad-output/implementation-artifacts/tests/test-summary-3-0.md`.
- Deferred-work routing (AC8): `_bmad-output/implementation-artifacts/deferred-work.md` § "Story 3.0 Routing (locked in by Epic 2 retrospective on 2026-05-20)".
- ADR-0025 obligation: `docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md` § "Obligations on downstream stories".
- Voyager-skill-rules.md Rule 9: `_bmad/custom/voyager-skill-rules.md` lines 125-136.

### Change Log

- 2026-05-20 — dev-3-0 (epic-cycle-2026-05-20-epic3): Story 3.0 (Epic 2 Deferred Cleanup) implemented in single dev session; 10 ACs satisfied across T1–T7; AC4 path (a) selected (extract paired primitives); web vitest 2044 pass (+37); bake fast 266 pass; typecheck + lint baseline preserved.
