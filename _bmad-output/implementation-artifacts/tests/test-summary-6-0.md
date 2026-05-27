# Test Automation Summary — Story 6.0 (Epic 5 Deferred Cleanup)

**Story:** `_bmad-output/implementation-artifacts/6-0-epic-5-deferred-cleanup.md`
**Stage:** QA (`bmad-qa-generate-e2e-tests` under `/epic-cycle`)
**Date:** 2026-05-24
**Story type:** Process / discipline / cleanup (NOT service-introducing, NOT user-facing)
**Test framework:** Vitest 4.1.6 (default `npm test` sweep)

## QA disposition — Rule 3 exempt + targeted defense additions

Story 6.0 is a pure process / discipline / cleanup story. Its four deliverables are:

1. **AC1** — a vitest LAYOUT-asserting production-build regression test (`web/tests/build-dist-layout.test.ts`) shipped by the dev (6 tests: 3 static-parse + 3 Playwright-tier).
2. **AC2** — a dev-doc at `docs/visual-validation/update-snapshot-discipline.md`.
3. **AC3** — Rule 14 (spec arithmetic) appended to `_bmad/custom/skill-rules.md`.
4. **AC4** — Rule 15 (forward-coherence) appended to `_bmad/custom/skill-rules.md` + `## Forward-coupled provisional definitions` section header in `deferred-work.md`.

Per **Rule 3**, non-user-facing build-pipeline / internal-tooling / refactor / documentation stories are EXEMPT from the per-story Chrome DevTools MCP smoke evidence requirement. Story 6.0 touches no user-facing surface (no `web/src/`, no chapter spec, no HUD component) — it adds a vitest test, a dev-doc, two skill-rules, and retro annotations. **Rule 3 exemption applies and is recorded here explicitly.**

The dev's `build-dist-layout.test.ts` already covers AC1's regression-catching contract end-to-end (static-parse + Playwright-tier + synthetic missing-CSS-link case). QA adds ONE small companion file pinning cross-reference rot defense for AC2 / AC3 / AC4 / AC6.

## QA gap filler added — cross-reference rot defense

**File:** `web/tests/story-6-0-cross-reference-defense.test.ts` (NEW — 17 tests).

**Why this defense exists.** AC6 binds the lead's grep verification that `skill-rules.md` contains exactly `## Rule 14` + `## Rule 15` headers, that a cross-reference from those rules (or Rule 13) points to the new dev-doc, and that `CONTRIBUTING.md` § "Visual validation" references the dev-doc path. A future docs reorg or skill-rules renumbering can silently break this cross-reference graph, leaving the lead's AC6 grep audit to surface the drift at next-story-review time. Pinning the cross-references at sub-second vitest cost surfaces the drift at edit-time instead.

**Pattern precedent.** Mirrors `web/tests/visual-validation-docs.test.ts` (Story 4.8 AC6 — same defense class: pin cross-references between planning artifacts so docs-drift surfaces in vitest at edit-time).

**What the 17 tests pin (grouped into 5 describe blocks):**

1. **AC3 + AC4 — skill-rules.md Rule 14 + Rule 15 headers (5 tests).** Asserts `## Rule 14 — Spec arithmetic must show derivation or cite the source line (applies to bmad-create-story)` and `## Rule 15 — Forward-coupled definitions in Story-X.1 foundations are PROVISIONAL until consumed by X.2 / X.3 (applies to bmad-create-story)` match exact headers (regex). Asserts Rule 14 cites the Story 5.2 50×/100× incident and Rule 15 cites the Story 5.1 / 5.3 `composite_active` incident — the load-bearing source-incident citations the rules need to remain historically rooted.

2. **AC2 — update-snapshot-discipline.md dev-doc + cross-reference pins (5 tests).** Asserts the dev-doc exists at `docs/visual-validation/update-snapshot-discipline.md`; asserts `_bmad/custom/skill-rules.md` references that path (a docs reorg moving the dev-doc must update this anchor); asserts `CONTRIBUTING.md` has a `## Visual validation` section that references the dev-doc path; asserts the dev-doc covers the four AC2 content areas (`--update-snapshots` discussion, AC1-cross-check pattern, pre-update verification gate, commit-evidence pattern).

3. **AC4 — Forward-coupled provisional definitions section in deferred-work.md (3 tests).** Asserts the section header exists, anchored by the Story 6.0 establishment paragraph and the Rule 15 cross-reference. A future edit that drops the section header (e.g., during a deferred-work reformat) fails here.

4. **AC6 / T5 — Epic 5 retro closure annotations (2 tests).** Asserts `epic-5-retro-2026-05-24.md` contains ≥ 4 `**Closed by Story 6.0 (2026-05-24):**` annotation markers (one per row 1 / 4 / 5 / 6 per AC6 + T5 Subtask 5.1). One-line summaries are not pinned (those can evolve editorially) — only the annotation marker count.

5. **Triage table integrity — Out of Scope routing pins (2 tests).** Asserts Story 6.0's § "Out of Scope" cites the correct routing stories named in `deferred-work.md`: Action item #2 → Story 6.2; #3 → Story 6.6; #7 → Story 6.5; #8 → Story 6.2 OR Story 6.6. A future edit that re-routes one of these without updating both files (drift across the triage table) fails here.

**Trade-off.** These are not behavioral tests; they are cross-reference / shape pins on planning artifacts. The trade-off is intentional: AC6 lists explicit lead-side greps as gating, and this companion file makes those greps a permanent vitest invariant rather than a one-shot ceremony.

## AC-by-AC verification

| AC | Dev coverage | QA verdict |
|---|---|---|
| AC1 — LAYOUT-asserting production-build regression test | `web/tests/build-dist-layout.test.ts` (3 static-parse + 3 Playwright-tier; synthetic missing-CSS-link case proves regression coverage) | **OK** — Dev's 6 tests verified passing locally; Playwright tier gates on `describe.skipIf(!existsSync(dist))` per Rule 13 + Story 3.7 / Story 5.0 slow-tier pattern. Rule 5 amendment to AC1 (CSS asset prefix `main-*.css` + inline `<style>` source-of-truth) applied in-place in the story file. |
| AC2 — `--update-snapshots` discipline dev-doc | `docs/visual-validation/update-snapshot-discipline.md` ships covering all four AC2 content areas; cross-referenced from `_bmad/custom/skill-rules.md` Rule 13 body and `CONTRIBUTING.md` § "Visual validation" | **OK** — QA cross-reference defense (5 tests) pins the existence + the two cross-references against rot. |
| AC3 — Rule 14 (Spec arithmetic) | `## Rule 14 — Spec arithmetic must show derivation or cite the source line (applies to bmad-create-story)` appended at `_bmad/custom/skill-rules.md:215` with canonical structure (statement + Why this rule exists today + Enforcement + When this rule fires + Examples), citing the Story 5.2 50×/100× incident | **OK** — QA defense (2 tests) pins the header + the Story 5.2 incident citation. |
| AC4 — Rule 15 (Forward-coherence) | `## Rule 15 — Forward-coupled definitions in Story-X.1 foundations are PROVISIONAL until consumed by X.2 / X.3 (applies to bmad-create-story)` appended at `_bmad/custom/skill-rules.md:237` with canonical structure (How to apply for Story-X.1 authors + Story-X.Y consumers + Enforcement + Examples), citing the Story 5.1 / 5.3 `composite_active` incident; `## Forward-coupled provisional definitions` section header added to `deferred-work.md:885` with entry-format spec (currently empty per Epic 6's lack of multi-story X.1 foundation) | **OK** — QA defense (2 + 3 tests) pins the header + the `composite_active` incident citation + the deferred-work.md section header + its Story 6.0 + Rule 15 anchors. |
| AC5 — Test sweep + lint + ADR compliance | Vitest 3349 / 10 (dev's count, post-T1); typecheck clean; lint 4 warnings (baseline); bake fast pytest 430 (per dev's Dev Agent Record); ADR-0010 / ADR-0017 / ADR-0019 / ADR-0027 compliance verified | **OK** — QA re-verified the web sweep with the new defense file: **3366 / 10 (was 3349; +17 from `story-6-0-cross-reference-defense.test.ts`)**; typecheck clean; lint 4 warnings 0 errors (baseline preserved). Bake fast pytest not re-verified locally (no `uv` / `spiceypy` on QA's Windows host — same posture as Story 5.0's QA pass; CI handles bake verification); dev's recorded 430-passing baseline accepted as evidence per the Story 5.0 precedent. |
| AC6 — Integration AC (cross-cutting closure) | Lead-side AC; dev advanced evidence at `_bmad-output/implementation-artifacts/6-0-smoke-evidence/vitest-build-dist-layout-output.txt`. Dev verified Rule 14 + Rule 15 + dev-doc reference via grep. | **OK** — QA defense file makes the four grep-verifications a vitest invariant: skill-rules Rule 14 header, skill-rules Rule 15 header, skill-rules → dev-doc cross-reference, CONTRIBUTING.md → dev-doc cross-reference. Lead's AC6 grep ceremony remains the canonical handoff gate; the QA defense makes the cross-references permanent invariants. |

All six ACs verified.

## Test stages

### Vitest unit / integration (default `npm test` sweep)
- **Status:** 1 new test file authored — `web/tests/story-6-0-cross-reference-defense.test.ts` (17 tests; runs in 0.48s). Dev's `web/tests/build-dist-layout.test.ts` carried in (6 tests).
- **Discoverability (Rule 13):** filename matches vitest's default `*.test.ts` glob; under `web/tests/` so vitest picks it up; no `.skip`, no env-gate, no opt-out flag. Verified with `npx vitest run tests/story-6-0-cross-reference-defense.test.ts` → 17/17 pass in 0.48s, then full sweep `npm test -- --run` → 3366/10 skipped / 188 files.
- **Pass-count baseline:** 3349 (dev's count post-T1) → **3366** (+17 from QA's defense file). Bake suite: dev recorded 430 passed / 4 skipped / 24 deselected — unchanged from Epic 5 baseline (Story 6.0 is web + docs only; bake suite not re-verified locally per the no-`uv` posture, accepted from dev's evidence). Typecheck clean. Lint 4 warnings (baseline).

### Playwright build-pipeline (`tests/visual/` runner — `npm run test:visual`)
- **Status:** No new visual specs. Story 6.0's `build-dist-layout.test.ts` is a vitest-tier spec that imports Playwright as a library (it is NOT a `tests/visual/` baseline spec).

### Chrome DevTools MCP smoke (per Voyager test-tier policy — Rule 3 + Rule 8)
- **Status:** **Rule 3 EXEMPT.** Story 6.0 is a pure process / discipline / cleanup story (vitest test + dev-doc + skill-rules + retro annotations). Per Rule 3: "Pure non-user-facing stories (build pipeline, internal tooling, refactors) are exempt; note the exemption explicitly in the review." The dev's advance evidence (`_bmad-output/implementation-artifacts/6-0-smoke-evidence/vitest-build-dist-layout-output.txt`) captures the load-bearing AC1 contract; no additional MCP browser smoke is required.

## Coverage statement

- AC1: dev's 6 tests in `build-dist-layout.test.ts` cover static-parse + Playwright-tier + synthetic regression case end-to-end; verified passing.
- AC2 + AC3 + AC4 + AC6: QA's 17 tests in `story-6-0-cross-reference-defense.test.ts` pin existence + cross-references + rule citations + retro closures + triage routing against silent drift.
- Combined: **23 new tests** ship under Story 6.0 (6 dev + 17 QA). Pre-Story-6.0 baseline 3343 → post-QA 3366 (+23).

## Tests Added

- `web/tests/story-6-0-cross-reference-defense.test.ts` (17 tests — cross-reference rot defense for AC2 / AC3 / AC4 / AC6)

## Decisions

- **Rule 3 exemption applied + targeted defense additions.** Story 6.0 qualifies for the Rule 3 non-user-facing exemption (no per-story MCP smoke required), but cross-reference rot is a real risk for the AC6 grep contract → added a single companion defense file at vitest cost (0.48s). The defense pattern follows the Story 4.8 precedent at `web/tests/visual-validation-docs.test.ts`.
- **No additional Playwright / visual specs.** The dev's `build-dist-layout.test.ts` is the load-bearing AC1 spec; the visual suite at `web/tests/visual/` is the canonical L4 baseline tier and is not the right home for Story 6.0's contract.
- **No additional bake / Python tests.** Story 6.0 is web + docs only; the bake suite is preserved unchanged.

## Issues Encountered

(none — all six ACs verified; vitest sweep 3366/10 / 188 files; typecheck clean; lint 4 warnings 0 errors baseline preserved; bake suite not re-verified locally per the no-`uv` Windows posture matching the Story 5.0 precedent, accepted from dev's 430-passing evidence in the Dev Agent Record)
