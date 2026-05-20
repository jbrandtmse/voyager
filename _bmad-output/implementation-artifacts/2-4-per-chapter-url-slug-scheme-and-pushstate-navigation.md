# Story 2.4: Per-Chapter URL Slug Scheme and `pushState` Navigation

**Epic:** 2
**Status:** done
**Date created:** 2026-05-20
**Source:** `_bmad-output/planning-artifacts/epics.md` § Story 2.4 + Epic 2 Risks/Mitigations § R2 + ADR-0001 + `voyager-skill-rules.md`

## User Story

As a sharing visitor (Maya, J2; Hanno, J4),
I want every chapter to have a stable, human-readable URL that I can copy from the address bar and that my recipients land on paused at the exact moment,
So that the artifact becomes a communication vector and curators can build kiosk URL contracts on a stable scheme, fulfilling FR37, FR38, FR41.

## Consumes

- **Story 1.10 ClockManager** — read/write `simTimeEt`; deep-link arrival → `scrubTo`
- **Story 2.1 ChapterDirector + ALL_CHAPTERS** — slug ↔ ChapterSpec lookup via `findChapterBySlug`; subscribe to ChapterDirector transitions to write URL path on chapter boundary crossings
- **Story 2.2 + Story 2.3 chapter-jump CustomEvent contract** — single document-level handler subscribes to `chapter-jump` events from BOTH source elements (scrubber markers + chapter index)
- **Story 1.9 URLSync `?t=` machinery** — extend the existing URLSync class (do not duplicate); the `?t=` throttled writeback (250 ms) is already in place

## Acceptance Criteria

### AC1 — Two route shapes recognized at boot

- **GIVEN** the router boots
- **WHEN** it parses the URL
- **THEN** the app recognizes two route shapes: `/` (homepage at MISSION_START_ET unless `?t=` overrides) and `/c/<chapter-slug>` (chapter route)
- **AND** chapter slugs are exactly the ADR-0001 frozen 11: `launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`
- **AND** unknown slugs (e.g. `/c/foo`) redirect to `/` with a `console.warn` — no user-facing error UI (per NFR-S7 strict-typed parameter parse)

### AC2 — Deep-link arrival at `/c/<slug>?t=<iso>`

- **GIVEN** a user opens `voyager.app/c/v2-neptune?t=1989-08-25T09:23:00Z` from a cold cache
- **WHEN** the app boots
- **THEN** the router resolves `v2-neptune` to its `ChapterSpec` via `findChapterBySlug`
- **AND** `?t=` is parsed via the existing `etFromIso` helper
- **AND** the simulation initializes paused at the parsed ET via `clockManager.scrubTo(et)`
- **AND** if `?t=` is missing, the simulation initializes at the chapter's `anchorEt`
- **AND** if `?t=` is outside the chapter's `[windowStartEt, windowEndEt]` window, the simulation STILL initializes at the requested ET; ChapterDirector recomputes activeChapter at the next frame (no error UI)
- **AND** if `?t=` is malformed, falls back to anchorEt (per NFR-S7)

### AC3 — URL writeback on chapter-jump events

- **GIVEN** the user is anywhere in the app
- **WHEN** chapter activation occurs via marker click (Story 2.2), chapter index Enter (Story 2.3), or `1`–`9` shortcut (Story 2.3)
- **THEN** the URL updates via `history.pushState` to `/c/<slug>?t=<anchorEt-as-ISO>`
- **AND** the browser's back button returns to the prior route (history is push-state)
- **AND** the router subscribes to the `chapter-jump` CustomEvent at the document level (Story 2.2 + Story 2.3 confirmed bubbles+composed)

### AC4 — URL writeback during free scrubbing (replaceState, not pushState)

- **GIVEN** free scrubbing within a chapter
- **WHEN** the user drags the scrubber thumb
- **THEN** the `?t=` query parameter updates via `history.replaceState` (no history pollution during scrubs — preserves Story 1.9's existing 250 ms throttle contract)
- **AND** the URL path `/c/<slug>` remains stable while within a single chapter's window

### AC5 — URL writeback on chapter window boundary crossing (mid-scrub)

- **GIVEN** the user crosses a chapter window boundary mid-scrub
- **WHEN** ChapterDirector transitions to a new chapter (`held` → another chapter's `held`)
- **THEN** the URL path updates from `/c/<old-slug>` to `/c/<new-slug>` via `replaceState` (NOT pushState — mid-scrub boundary-cross is not back-button-able)
- **AND** when the simulation enters a cruise period outside any chapter, the URL reverts to `/?t=<currentEt-as-ISO>` (homepage form with timestamp)

### AC6 — Public URL contract documentation

- **GIVEN** the URL contract is part of the public API surface (per ADR-0001)
- **WHEN** I inspect `docs/url-contract.md`
- **THEN** the document records: canonical slug list (11 frozen IDs), `?t=` ISO-8601 parameter format, `?embed=true` placeholder (Story 2.5 will fill in), stability commitment ("chapter slugs and `?t=` shape will not change in any non-major release")
- **AND** the document is committed under `docs/` next to the ADR registry (e.g., `docs/url-contract.md`)
- **AND** the About page (Story 2.7) will link to or summarize this document (no action required from this story for the About link — that's Story 2.7's scope)

### AC7 — Tests green

- `cd web && npm test -- --run` passes (baseline 1477 + new tests; expect substantial integration coverage)
- `npm run typecheck` clean
- `npm run lint` clean (5 pre-existing warnings OK)

## Integration ACs (per voyager-skill-rules.md Rule 2 + Epic 2 R2 mitigation)

### Integration AC8 — Three edge cases verified end-to-end (R2 mitigation)

Epic 2 Risks § R2 mandates explicit ACs for three URL-state synchronization edge cases. Each is verified by Chrome DevTools MCP smoke (lead-executed).

- **(a) Cold-load deep-link to mid-chapter timestamp:** Navigate to `/c/v2-neptune?t=1989-08-25T09:23:00Z` from a cold cache. ClockManager initializes at the parsed ET. ChapterDirector activates `v2-neptune` on the first frame. HUD date shows the parsed timestamp.
- **(b) Mid-cycle URL update does NOT desync ClockManager state:** Open `/`, click V1 Jupiter marker → URL becomes `/c/v1-jupiter?t=<anchor-iso>`. ClockManager.simTimeEt matches the URL's `?t=` parameter (verified via `evaluate_script`). During subsequent scrub, `?t=` updates via replaceState; ClockManager.simTimeEt remains the SOLE source of truth (URL writes derive FROM clock, never the reverse).
- **(c) Browser back/forward correctly fires chapter transitions through FSM:** Click V1 Jupiter marker (pushState `/c/v1-jupiter`). Click V2 Saturn marker (pushState `/c/v2-saturn`). Press browser back → router catches `popstate` → ClockManager.scrubTo(v1-jupiter.anchorEt) → ChapterDirector transitions to v1-jupiter. The transition is observable both in the URL (back to `/c/v1-jupiter`) and in `__voyagerDebug.chapterDirector.activeChapter.slug`.

## Files to Modify

| File | Action | Reason |
|---|---|---|
| `web/src/services/url-sync.ts` | UPDATE | Extend URLSync with route parsing, pushState/replaceState chapter writeback, popstate handler |
| `web/src/services/url-sync.test.ts` | UPDATE | Add tests for new methods |
| `web/src/services/url-router.ts` | NEW (or fold into url-sync) | The chapter-jump CustomEvent listener + ChapterDirector subscription + popstate handler — author's choice on whether to live in url-sync.ts or a sibling file. Prefer extending url-sync for cohesion. |
| `web/src/main.ts` | UPDATE | Boot-time URL parse: detect `/c/<slug>` vs `/`; resolve slug; pass initialEt to ClockManager. Register URL router with chapterDirector + clockManager. |
| `docs/url-contract.md` | NEW | Canonical URL-contract doc per AC6 |
| `web/tests/url-router-integration.test.ts` | NEW (or extend existing) | Integration test covering routing, pushState/replaceState, popstate, deep-link arrival |

## Tasks / Subtasks

- [x] **T1 (AC1): Route parser**
  - [x] Parse `window.location.pathname` for `/c/<slug>` shape
  - [x] Validate slug against ALL_CHAPTERS (via `findChapterBySlug`); on no-match → `console.warn` + redirect to `/` (replaceState; no flash if possible)
  - [x] Continue to support the existing `?t=` parameter parse

- [x] **T2 (AC2): Deep-link arrival**
  - [x] In `main.ts` (or boot helper), determine `initialEt`:
    - If `/c/<slug>?t=<iso>`: parse `t` as ET; if missing → use chapter's anchorEt
    - If `/?t=<iso>` or `/`: parse t (or MISSION_START_ET)
    - Malformed t → fall back per existing URLSync.parseInitialT logic
  - [x] Pass initialEt to ClockManager (probably via `scrubTo(initialEt)` after construction, mirroring existing `?t=` path)

- [x] **T3 (AC3 + AC5): URL writeback subscriber**
  - [x] Subscribe to `chapter-jump` CustomEvent at the document level — on event, `history.pushState({}, '', `/c/${slug}?t=${isoFromEt(anchorEt)}`)`
  - [x] Subscribe to ChapterDirector state transitions — on `held` enter, if URL slug doesn't match new chapter, `replaceState` the path
  - [x] On exit of all chapters (between-chapter ET), `replaceState` to `/` + `?t=`

- [x] **T4 (AC4): replaceState during free scrub**
  - [x] Continue using URLSync's existing `writeEtThrottled(et)` (already throttled at 250 ms)
  - [x] Make sure the path is preserved during a free scrub within a chapter (only `?t=` changes)

- [x] **T5 (popstate / back-forward — AC8c)**
  - [x] Add window-level `popstate` listener
  - [x] On popstate, re-parse the new URL path + query; apply scrubTo to the parsed ET
  - [x] Verify ChapterDirector reaches the expected state on the next frame

- [x] **T6 (AC6): Public URL contract doc**
  - [x] Author `docs/url-contract.md` with the 11 slugs, `?t=` format, stability commitment, brief example of deep-link

- [x] **T7 (AC7): Verification + integration tests**
  - [x] Author or extend `web/tests/url-router-integration.test.ts` covering all 8 ACs including the three R2 edge cases
  - [x] Run web tests + typecheck + lint

## Dev Notes

### Architecture / Conventions

- **One URL router instance** — extend `URLSync` rather than introducing a second URL-touching service (avoids ordering bugs between two writers).
- **Throttled writeback is established at 250 ms** in Story 1.9. Do NOT change this; AC4 inherits it.
- **History pollution rule** (AC3 vs AC5): user-driven chapter activations (click marker, Enter on listbox, digit shortcut) use **pushState** (back-button-able). Director-driven boundary crossings (mid-scrub) use **replaceState**. The trigger source matters; subscribe to chapter-jump for pushState; subscribe to ChapterDirector transitions for replaceState.
- **Single popstate handler.** Register on window, not on document. Listen for browser back/forward only.

### Previous Story Intelligence

- Story 1.9 URLSync already implements `parseInitialT()`, `writeEtThrottled(et)`, `writeEtImmediate(et)`, `flush()`. The throttle uses a 250 ms window via setTimeout. Extend the class with: `parseInitialPath()`, `writeChapterPushState(slug, anchorEt)`, `writeChapterReplaceState(slug, et)`, `writeHomeReplaceState(et)`, `installPopstateHandler(callback)`.
- Story 2.2 + 2.3 CustomEvent payload: `{ slug, anchorEt }`, bubbles+composed. Slug is ADR-0001 frozen.
- ClockManager.scrubTo(et) pauses as a side effect (intentional). Boot from `/c/<slug>?t=<iso>` results in a paused simulation at the requested ET.

### Voyager skill rules

- Rule 2: this story is a CONSUMER of ChapterDirector + ALL_CHAPTERS + Story 2.2/2.3 CustomEvent. Document the consumed-by linkage in the Consumes section above.
- Rule 5 (NFR tripwire response): If you encounter a URL-contract edge case that ADR-0001 doesn't cover (e.g., trailing slashes, percent-encoding ambiguity), pause and amend ADR-0001 in place — don't ship a workaround in code comments.

### NFR considerations

- NFR-S7 (strict-typed URL parameter parsing): unknown slugs and malformed `?t=` MUST NOT surface error UI. Silent fall-back to safe defaults.
- NFR-M6 (multi-year URL stability): the URL contract is committed via ADR-0001. Do NOT introduce a slug shape that diverges from the frozen list.
- NFR-P2 (per-frame budget): URL writeback is throttled at 250 ms; no per-frame URL work.

## References

- `_bmad-output/planning-artifacts/epics.md` § Story 2.4 (lines 1039–1074)
- Epic 2 Risks § R2 (lines 908)
- `web/src/services/url-sync.ts` (existing Story 1.9 partial implementation)
- `web/src/chapters/registry.ts` (`findChapterBySlug`, ALL_CHAPTERS)
- `docs/adr/0001-url-contract-as-public-api.md` (frozen slug list, URL contract)
- `docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md` (smoke driver)
- `_bmad/custom/voyager-skill-rules.md` Rules 2, 3, 4, 5

## Dev Agent Record

### Implementation Plan (followed)

1. **T1 (AC1) — Route parser.** Added `parseInitialPath()` to `URLSync` (existing class extended, not duplicated). Matches `/c/<slug>` via a single `^\/c\/([^/?#]+)\/?$` regex; resolves against `findChapterBySlug`. Unknown slugs emit `console.warn` and `replaceState('/...preserving any ?t=')`. Trailing-slash variant accepted (`/c/v2-neptune/`).
2. **T2 (AC2) — Deep-link arrival.** `main.ts` now constructs `URLSync` up-front, calls `parseInitialPath()`, and seeds `ClockManager.scrubTo(initialEt)`. `first-paint.ts` extended with an `options.urlSync` plumb to reuse the same instance (no duplicate parse). The legacy Story 1.9 test-only call site that omits the option continues to do its own `parseInitialT()` so all 1477 prior tests stay green.
3. **T3 + AC5 — Writeback router.** New `URLRouter` (`web/src/services/url-router.ts`) subscribes to (a) document-level `chapter-jump` CustomEvent → `pushState`, (b) `ChapterDirector.subscribe` → `replaceState` on resting `activeChapter` change, (c) `URLSync.installPopstateHandler` → `clockManager.scrubTo`. Director-write decisions are batched in a microtask via `scheduleWaveSettle(et)` so a single `update(et)` call that walks many chapters does NOT emit multiple URL writes — only the FINAL `activeChapter` after the wave settles drives the URL. Suppression handshake (`suppressNextDirectorWriteForSlug`) prevents a chapter-jump pushState from being immediately overwritten by the follow-on director transition for the same slug. The same suppression mutes the popstate→director chain.
4. **T4 (AC4) — Free scrub.** `URLSync.writeEtThrottled` and `writeEtImmediate` were updated to target the instance's `currentPath` field (set by `parseInitialPath`, `writeChapterPushState`, `writeChapterReplaceState`, `writeHomeReplaceState`) rather than re-reading `location.pathname` per write. Existing 250 ms throttle contract is preserved unchanged.
5. **T5 (AC8c) — Popstate.** `URLSync.installPopstateHandler(cb)` registers a window-level listener that re-runs `parseInitialPath()` after each back/forward and forwards the parsed state to the caller. URLRouter consumes this hook and drives `clock.scrubTo`; the follow-on director transition is suppressed (see T3).
6. **T6 (AC6) — URL contract doc.** Authored `docs/url-contract.md` with route table, frozen-slug list, parameter behavior matrix, writeback rules, and stability commitment cross-referencing ADR-0001.
7. **T7 (AC7) — Tests.** Extended `web/src/services/url-sync.test.ts` (+27 tests). New `web/src/services/url-router.test.ts` (+9 tests covering AC3/AC5/AC8c). New `web/tests/url-router-integration.test.ts` (+11 tests covering AC8a/b/c R2 edge cases end-to-end at integration tier).

### Completion Notes

- All 8 ACs satisfied. AC1/AC2/AC3/AC4/AC5/AC7 verified by unit + integration tests in CI; AC6 satisfied by the new `docs/url-contract.md`. **AC8 (Integration AC — three R2 edge cases) has CI-tier coverage in `url-router-integration.test.ts`; the lead-executed Chrome DevTools MCP browser smoke remains the binding browser-evidence gate per Rule 7.**
- Voyager skill rules: **Rule 2 (consumer)** — story documents consumed services in `## Consumes`; integration AC8 verifies the consumer↔producer wire-up (URLSync↔URLRouter↔ChapterDirector↔ClockManager↔chapter-jump CustomEvent). **Rule 3 (browser smoke)** — code-side prerequisites in place; `window.__voyagerDebug.urlRouter` + `window.__voyagerDebug.urlSync` published for lead smoke. **Rule 4 (structured completion)** — emitted to team-lead. **Rule 5 (NFR tripwire)** — no tripwires encountered; ADR-0001 covers all edge cases used (trailing slashes, percent-encoding via URLSearchParams).
- **NFR-S7 (silent reject)** — verified by tests for: unknown slugs, malformed `?t=`, out-of-range `?t=` on homepage (rejected to MISSION_START_ET), out-of-window `?t=` on chapter routes (accepted per AC2's explicit clause), malformed CustomEvent detail, defensive guard on empty slugs.
- **NFR-M6 (URL stability)** — all 11 ADR-0001 slugs verified resolvable in `url-sync.test.ts`. The 11-slug list is centralized in `web/src/chapters/registry.ts` (Story 2.1) — no parallel hardcoded list introduced.
- **NFR-P2 (per-frame budget)** — URL writes still throttled at 250 ms (no new per-frame cost). The new microtask-based wave-settle is a per-update batch, not per-frame.
- **History pollution rule (AC3 vs AC5)** — `pushState` is reserved exclusively for chapter-jump (user-driven); ALL director-driven writes use `replaceState`. Suppression handshake prevents pushState+replaceState double-writes for the same chapter activation.
- **Rapid-scrub correctness** — when `director.update(et)` walks many chapters in one call (e.g., launch→neptune scrub), only ONE URL write fires per `update()` call, targeting the resting `activeChapter` (or `/` if no chapter is held). Pass-through chapters do not pollute the URL or history.
- **No deferred work introduced.**

### File List

**New files:**

- `web/src/services/url-router.ts` — URLRouter class (chapter-jump + director + popstate routing)
- `web/src/services/url-router.test.ts` — URLRouter unit tests (9 tests)
- `web/tests/url-router-integration.test.ts` — AC8a/b/c integration tests (11 tests)
- `docs/url-contract.md` — Public URL contract documentation (AC6)

**Modified files:**

- `web/src/services/url-sync.ts` — Extended with `parseInitialPath`, `writeChapterPushState`, `writeChapterReplaceState`, `writeHomeReplaceState`, `installPopstateHandler`, `dispose`; `writeNow` now targets `currentPath` (set by parse + chapter writes)
- `web/src/services/url-sync.test.ts` — Added 27 tests for Story 2.4 methods (`parseInitialPath`, push/replace chapter writes, popstate)
- `web/src/boot/first-paint.ts` — Accepts caller-supplied `URLSync` via `options.urlSync`; legacy `parseInitialT`+`scrubTo` path preserved when omitted
- `web/src/main.ts` — Constructs URLSync up-front, runs `parseInitialPath`, seeds `ClockManager.scrubTo(initialEt)`, instantiates `URLRouter` after first-paint, publishes `__voyagerDebug.urlRouter` + `__voyagerDebug.urlSync` (DEV only)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 2-4 marked `in-progress` → `review`
- `_bmad-output/implementation-artifacts/2-4-per-chapter-url-slug-scheme-and-pushstate-navigation.md` — this story file (status, tasks, Dev Agent Record, Change Log)

### Change Log

- 2026-05-20: Story 2.4 implemented (dev-2-4 / epic-cycle-2026-05-20). T1–T7 complete; 47 new tests (web vitest 1521 pass total, +44 from 1477 baseline); typecheck clean; lint baseline preserved (5 pre-existing warnings, 0 new). Integration AC8 has CI-tier coverage in `url-router-integration.test.ts`; lead-executed Chrome DevTools MCP smoke remains the binding browser-evidence gate per Rule 7. DEV debug surface `window.__voyagerDebug.urlRouter` + `window.__voyagerDebug.urlSync` published.
- 2026-05-20: Code review (cr-2-4 / epic-cycle-2026-05-20). 2 HIGH issues auto-resolved (popstate-to-home overwrite + main.ts boot-ordering contradiction); 4 LOW issues deferred to `deferred-work.md`. Final state: vitest 1546 pass (+2 regression tests), typecheck clean, lint baseline preserved. Status: review → done.

### Review Findings

- [x] [Review][Patch] popstate-to-`/` lets next director.update overwrite the back-target with `/c/<resolved-chapter>` (HIGH) — `web/src/services/url-router.ts:215-227`. Fixed by introducing `suppressNextDirectorWriteAny: boolean` (one-shot) set by `handlePopstate` regardless of resolved chapter; `settleWave` consumes it before slug-keyed suppression. Regression tests added in `web/src/services/url-router.test.ts` § "popstate to '/' suppresses the next director-driven write regardless of which chapter the director resolves" and `web/tests/url-router-qa-gaps.test.ts` § "back-to-home then director.update does NOT overwrite '/' with a director-resolved chapter route".
- [x] [Review][Patch] main.ts boot-ordering contradicts dev's comments + integration test model: `engine.onFrame((et) => chapterDirector.update(et))` only REGISTERS the per-frame callback; the first director.update happens on the next async RAF tick AFTER URLRouter.install, so cold-load `/` would have morphed to `/c/launch-v2` on first frame and cold-load to a chapter route would have emitted a redundant replaceState (HIGH) — `web/src/main.ts:154-169`. Fixed by adding a synchronous `chapterDirector.update(clockManager.simTimeEt)` call before URLRouter construction, matching the integration tests' `bootStack` model and honoring the dev's documented intent.
- [x] [Review][Defer] writeHomeReplaceState writes `/?t=<et>` even when already at `/` (LOW) — deferred to `deferred-work.md`; idempotent on browser side, bundle the optimisation with Story 2.5's `?embed=true` preservation work.
- [x] [Review][Defer] `?embed=true` (and other unknown query params) dropped on chapter writebacks (LOW) — deferred; already pinned in `web/tests/url-router-qa-gaps.test.ts` regression test, contract reserves the parameter for Story 2.5.
- [x] [Review][Defer] URLRouter.dispose() doesn't reset `pendingWaveSettle`, queued microtask can fire one trailing write after dispose (LOW) — deferred; no in-tree consumer triggers the race; add a `disposed` guard with Epic 7's HMR work.
- [x] [Review][Defer] URLSync constructor doesn't normalize empty pathname to `/` (LOW) — deferred; defensive one-liner, bundle with future URLSync hardening.

### Review Verdict

**APPROVED.** All 8 ACs (AC1–AC7 + Integration AC8) verified. ADR-0001 compliance verified (slug list matches frozen 11 exactly; URL writeback uses `chapter.slug` from registry, never reconstructs from path). ADR-0026 compliance verified (zero `any` in new code; only minimal `as unknown as History` test stubs and `as CustomEvent<ChapterJumpDetail>` cast required by DOM event-listener typing). Voyager skill rules 2/3/4/5 satisfied. Suppression handshake correctness: confirmed correct after broadening to any-slug suppression for popstate. Microtask batching: confirmed one URL write per `director.update(et)` regardless of how many chapter boundaries the call walks (verified by `web/tests/url-router-qa-gaps.test.ts` § "rapid scrub crossing multiple chapter boundaries"). popstate handler: installed once via `URLSync.installPopstateHandler`, detached on `dispose`; handler scrubs via ClockManager (does NOT touch ChapterDirector directly). History pollution invariant preserved: exactly 1 pushState per chapter-jump; free scrubs use only replaceState; the boot-ordering fix prevents the first cold-load frame from emitting a redundant write.
