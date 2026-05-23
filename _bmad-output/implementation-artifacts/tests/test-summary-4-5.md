# Test Automation Summary — Story 4.5 (QA stage)

**Story:** 4.5 — V1 Jupiter Encounter (1979-03-05) with Body-Centered Framing
**Stage:** QA (post-dev, pre-code-review)
**Date:** 2026-05-23

## Scope

Dev (Story 4.5 cycle 1) shipped happy-path tests across each AC:

- **AC1** V1J chapter spec window narrow + structure (5 tests in `web/src/chapters/specs/v1-jupiter.test.ts`).
- **AC1/AC2** encounter copy field shape + word-count band + fact mentions (10 tests in same file).
- **AC3** body-centered framing tuned + resolver math (6 tests in `web/src/chapters/chapter-default-framing.test.ts`).
- **AC5** `<v-chapter-copy>` encounter-chapter dispatch (replaced 2 ignore tests with 2 render tests + 1 launch-v1 guard).
- **AC7** Rule-1 integration: real ChapterDirector × ViewFrame × `<v-chapter-copy>` × `<v-timeline-scrubber variant="detail">` (5 tests in `web/tests/v1j-encounter-end-to-end.test.ts`).

QA's gap-hunt sweep targets the 8 failure modes the dev's coverage did NOT explicitly pin (per the spawn prompt's "QA gap-hunting priorities" list).

## Generated Tests

### Vitest — QA gap-hunt sweep

- [x] `web/tests/story-4-5-v1j-encounter-qa-gaps.test.ts` (35 tests)

#### QA priority 1 — Chapter copy word-count helper canonical-split defense (8 tests)

- Simple two-word string → 2.
- Whitespace-only strings → 0 (defends against empty / blank-prose accidentally passing the band).
- Hyphenated compounds ("long-exposure", "forty-eight") count as ONE word — pins the rule the dev's V1J spec uses; a future helper that splits on hyphens would inflate the count by 4 silently.
- Possessives ("Io's", "Sun's") count as ONE word — defends against a "smarter" helper that strips apostrophe-s.
- Em-dash splitting: ` — ` (whitespace-surrounded) is its own token; `a—b` (embedded) is a single token.
- V1J body re-asserted at 80–120 band (defense against future edits drifting the band).
- Synthetic exactly-80-word and exactly-120-word fixtures pass the band (boundary inclusivity).
- 79-word and 121-word fixtures fall outside (boundary exclusivity).

#### QA priority 2 — MISSION_FACTS.md fact-citation defense via regex audit (6 tests)

- `MISSION_FACTS.md` is loadable from the repo root (file-system path resolution test).
- Every natural-language date in V1J copy (e.g. "5 March 1979") converts to ISO form and resolves to `MISSION_FACTS.md` (defends against a future copy edit that introduces an un-cited date — the test will fail loudly).
- The Io-plume frame identifier `0468J1-001` is mentioned in both V1J copy AND `MISSION_FACTS.md`.
- "Linda Morabito" appears in `MISSION_FACTS.md` (accepts either "Linda Morabito" or "L. Morabito" form).
- Every named moon in V1J copy (Amalthea, Io, Europa, Ganymede, Callisto) is cited in the interior-sweep table.
- The canonical closest-approach ISO instant `1979-03-05T12:05:00Z` is in the facts file.

#### QA priority 3 — Heliopause copy regression (Story 2.9 dispatch preserved) (4 tests)

- V1H copy still renders via the new `copyForChapter` dispatch (Story 2.9 wire-up preserved through the Story 4.5 refactor).
- V2H copy still renders.
- Heliopause chapters do NOT carry a `ChapterSpec.copy` field (the dispatch routes through `heliopauseCopyForSlug` per ADR-0021).
- Switching V1J → V1H clears the V1J slug and paints the V1H lede (no slug bleed across the dispatch refactor).

#### QA priority 4 — Default-framing resolver fallback path (3 tests)

- Every non-V1J chapter in `ALL_CHAPTERS` (10 chapters: launch-v1/v2, v2-jupiter/v1-saturn/v2-saturn/v2-uranus/v2-neptune, pale-blue-dot, v1-heliopause/v2-heliopause) resolves to `null` — defends against accidentally populating `defaultFraming` on a non-encounter chapter.
- Heliopause spec → resolver returns null even when a valid target is supplied.
- V1J → resolver returns `target + offsetKm` (sanity check the math chain).

#### QA priority 5 — Detail-scrubber range derives from chapter spec, not hardcoded (3 tests)

- `detailScrubber.rangeStart / rangeEnd` are read DIRECTLY from `chapter.windowStartEt / windowEndEt` — if a future Rule-5 amendment widens or narrows the window, this test passes without modification (the dev's existing test hardcodes `10 * SECONDS_PER_DAY`; QA derives from the spec).
- Span = exactly 10 days (sanity check the ±5d narrowing landed).
- Scrubber hides outside V1J window even though it derives ranges from the active chapter (no stale-range leak).

#### QA priority 6 — `<v-chapter-copy>` DOM attributes on V1J held + cleared (3 tests)

- `article[data-active="true"][data-slug="v1-jupiter"][aria-live="polite"]` on held — pins the DOM surface that CSS targets.
- `article[data-active="false"][aria-hidden="true"]` after window-exit — pins the cleared state.
- Exactly ONE `<h2.v-chapter-copy-lede>` + ONE `<p.v-chapter-copy-paragraph>` for the V1J block (encounter shape distinct from heliopause's multi-paragraph).

#### QA priority 7 — VoyagerCameraController honours chapter defaultFraming on restore (2 tests)

- `controller.restore()` with V1J active reads `offsetKm` from chapter spec via the resolver, NOT a controller-internal default — the assertion verifies `camera.position` equals `target + V1J.defaultFraming.offsetKm` (defends against a future refactor that drops the resolver from `main.ts`).
- `controller.restore()` with a chapter that has NO `defaultFraming` does NOT throw — falls back to the controller's built-in cruise default.

#### QA priority 8 — ChapterSpec.copy / defaultFraming optionality at runtime (5 tests)

- Exactly ONE chapter (v1-jupiter) carries `copy` after Story 4.5 — pins so the "Story 4.6 lands but tests still pass for unpopulated chapters" failure mode surfaces immediately.
- Exactly ONE chapter (v1-jupiter) carries `defaultFraming` after Story 4.5.
- 10 non-V1J chapters all leave both fields undefined (explicit per-slug enumeration).
- Pairing invariant: every chapter with `copy` ALSO has `defaultFraming` — Story 4.5 establishes the encounter-pattern coupling.
- Lede prefix matches marker label pattern: "V1 Jupiter." ↔ markerLabel "V1J".

### Vitest — Dev's existing pin tests (re-verified to still pass)

- [x] `web/src/chapters/specs/v1-jupiter.test.ts` (15 tests) — window narrow, copy structure, word count, fact mentions, defaultFraming shape.
- [x] `web/src/chapters/chapter-default-framing.test.ts` (6 tests) — resolver math, null branches, upWorld override.
- [x] `web/src/components/v-chapter-copy.test.ts` — V1J render path + heliopause regression + late-mount seed.
- [x] `web/tests/v1j-encounter-end-to-end.test.ts` (5 tests, Rule 1 integration AC) — real-stack chapter director × view-frame × chapter-copy × detail-scrubber.

## Chrome DevTools MCP smoke

**Story 4.5 touches `web/src/`** — the smoke stage IS in scope per voyager-skill-rules.md Rule 3 + Rule 8.

The dev's `## Smoke probe plan (AC8)` in the story file documents 7 probes. QA recommends the lead execute those PLUS the two extensions below:

**Lead-driven smoke (per AC8):**

- **Environment:** `cd web && pnpm dev`; navigate to `http://localhost:5173/c/v1-jupiter`.
- **Evidence path:** `_bmad-output/implementation-artifacts/4-5-smoke-evidence/`.

**Probes 1–7 (per story file):**

1. `mcp__chrome-devtools-mcp__navigate_page` → `http://localhost:5173/c/v1-jupiter`.
2. `mcp__chrome-devtools-mcp__evaluate_script` → assert `__voyagerDebug.chapterDirector.activeChapter` has `slug === 'v1-jupiter'` and `windowEndEt - windowStartEt = 10 * 86400` (the ±5d narrowing landed).
3. `mcp__chrome-devtools-mcp__evaluate_script` → assert `<v-chapter-copy>` panel `textContent` contains `'V1 Jupiter.'`.
4. `mcp__chrome-devtools-mcp__evaluate_script` → inverse-project V1 mesh + Jupiter mesh + Io mesh world-positions; assert all three lie within `[-1.05, 1.05]^3` clip space (covers AC3 visual framing).
5. `mcp__chrome-devtools-mcp__take_snapshot` (Probe 4) — read the detail-variant scrubber's `.range-label-left` / `.range-label-right`; expected "FEB 28" / "MAR 10, 1979".
6. `mcp__chrome-devtools-mcp__evaluate_script` → assert `<v-attitude-indicator>` text contains `'CK reconstructed'`.
7. `mcp__chrome-devtools-mcp__take_screenshot` at V1J anchor; scrub to anchor + 1500s via `__voyagerDebug.clockManager.scrubTo(anchorEt + 1500)`; take second screenshot. Visually compare scan platform pose (Epic 3 articulation verification).

**QA extension probes:**

- **MCP smoke covers AC5 (chapter copy DOM)** — `mcp__chrome-devtools-mcp__take_snapshot` to capture the accessibility tree of the `<v-chapter-copy>` panel; assert the `<article aria-live="polite">` element holds the V1J lede + body. This complements probe 2 with an a11y-tree verification.
- **MCP smoke covers AC8 reverse-scrub (Probe 7)** — `mcp__chrome-devtools-mcp__press_key` Home; wait 1.5s; `mcp__chrome-devtools-mcp__evaluate_script` to assert the V1J detail panel cleared (`__voyagerDebug.chapterCopy.displayedSlug === null`) AND the V1J marker on the mission scrubber is no longer accent-coloured.
- **Console-clean assertion** — `mcp__chrome-devtools-mcp__list_console_messages` at the end of the session; assert no error-tier messages apart from the Lit dev banner and the documented Story-4.3 KTX2 loaders advisory.

**For each AC the MCP smoke covers, name the AC explicitly:**

- Probe 1 + 2 cover AC1 (window narrowed).
- Probe 3 + QA extension 1 cover AC5 (chapter copy panel).
- Probe 4 covers AC3 (body-centered framing — all three bodies in viewport).
- Probe 5 covers AC6 (detail scrubber date labels derived from ±5d window).
- Probe 6 covers AC4 (`<v-attitude-indicator>` shows CK reconstructed).
- Probe 7 covers AC4 (scan platform articulation visible).
- QA extension 2 (reverse-scrub probe) covers AC8's reverse-scrub mini-probe.
- QA extension 3 (console-clean) covers the AC8 console hygiene contract.

**Evidence shape (canonical examples):**

- `_bmad-output/implementation-artifacts/1-16-smoke-evidence/` — post-Story-1.16 fixture shape (no brotli initScript shim per Rule 8).
- `_bmad-output/implementation-artifacts/4-4-smoke-evidence/` — detail-scrubber screenshot evidence from the prior story (note: that capture used the pre-Story-4.5 ±30d window; the Story-4.5 evidence will show the ±5d narrowing).

## Coverage

- **Story 4.5 ACs covered:**
  - AC1 (window narrow + copy field): dev unit + QA optionality + QA dispatch tests.
  - AC2 (hand-written copy with citations): dev fact-mention tests + QA fact-citation regex audit against `MISSION_FACTS.md`.
  - AC3 (body-centered framing tuned): dev resolver math + QA non-V1J fallback enumeration + QA controller wire-up.
  - AC4 (scan platform articulation): lead-driven MCP smoke (Probe 7) — visual evidence required.
  - AC5 (`<v-chapter-copy>` panel renders V1J): dev render test + QA DOM-attribute defense.
  - AC6 (detail scrubber date labels): dev integration + QA derive-from-spec defense.
  - AC7 (Rule-1 integration AC): dev integration suite (5 tests).
  - AC8 (lead-driven Chrome DevTools MCP smoke): documented above.
  - AC9 (test sweep + lint baseline + Rule-5 audit): vitest full sweep verified (162 files / 2852 passed / 2 skipped), see Verification below.

## Verification

- **Vitest sweep** (`cd web && npx vitest run`): 162 files passed; 2852 tests passed; 2 skipped. Story 4.5 dev baseline was 2817; QA's 35 net new tests bring the count to **2852 passed**. No regressions in any pre-existing test.
- **New file under test discoverability:** `web/tests/story-4-5-v1j-encounter-qa-gaps.test.ts` is picked up by the default `*.test.ts` glob; no skip markers used.
- **Rule 5 audit during QA:** no tripwires surfaced. The dev's two Rule-5 candidates (word-count band + window edge selection) remained un-triggered; the QA gap tests pinned both as defensive invariants but did NOT amend either AC.

## Next Steps

- Lead executes the AC8 Chrome DevTools MCP smoke probes (7 dev + 3 QA extensions); captures evidence under `_bmad-output/implementation-artifacts/4-5-smoke-evidence/`.
- Code-review stage cross-checks the new test file against story ACs and the project's ADR registry (Rule 6 — ADR-0014 chapter-spec hybrid form; ADR-0021 chapter-copy module split).
