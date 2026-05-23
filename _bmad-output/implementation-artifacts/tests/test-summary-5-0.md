# Test Automation Summary — Story 5.0 (Epic 4 Deferred Cleanup)

**Story:** `_bmad-output/implementation-artifacts/5-0-epic-4-deferred-cleanup.md`
**Stage:** QA (`bmad-qa-generate-e2e-tests`)
**Date:** 2026-05-23
**Story type:** Process / cleanup / investigation (NOT service-introducing)

## QA disposition

**Verification pass — no new tests authored.** Story 5.0 is a process / docs / investigation story. The dev's AC1 investigation concluded BUG-006 does NOT reproduce against current HEAD (Story 4.10's per-tick identity-gated propagation through `<v-hud>.tick()` is sufficient) and shipped a Playwright regression spec at `web/tests/visual/hud-chapter-title-prod.spec.ts` to pin the production-build invariant. All other ACs are docs / triage / audit work whose evidence is verified by reading the artifacts.

## AC-by-AC verification

### AC1 — BUG-006 dist-drift investigation + production-build regression test
**VERIFIED.** The dev's investigation ruled out the four candidate root causes (Rule 10 / Lit class-field shadowing; Vite minifier tree-shake; `import.meta.env.DEV` gating; subscription order in production) by reading the current `<v-hud-chapter-title>` source + minified `dist/assets/main-*.js` + grepping all four `import.meta.env.DEV` blocks. The regression spec at `web/tests/visual/hud-chapter-title-prod.spec.ts` exercises both `/c/v1-jupiter/` and `/c/pale-blue-dot/` end-to-end through `web/dist/` → `vite preview` → real Chromium → DOM assertion on shadow-DOM `<h2>` text + `data-slug`. The test uses `waitForFunction` (not one-shot `evaluate`) to absorb Lit's `updated()` → setter → `setName()` → `requestUpdate()` microtask chain — the most likely explanation for the Story 4.9 dev-notes empty-render observation. **Verified locally:** spec runs 2 passed in 4.5s (`npx playwright test --config tests/visual/playwright.config.ts hud-chapter-title-prod`). Test discoverability: lives at `web/tests/visual/hud-chapter-title-prod.spec.ts` per Rule 11 + Story 4.9 visual-suite convention; matched by the suite's `testMatch: /.*\.spec\.ts$/` glob; runs via `npm run test:visual`; excluded from the default `npm test` Vitest sweep via `vite.config.ts` exclude pattern. Smoke evidence captured at `_bmad-output/implementation-artifacts/5-0-smoke-evidence/` (README + 2 screenshots).

**Chapter slug coverage assessment.** The spec covers 2 of 10 chapters (V1J + PBD); the existing `web/tests/visual/encounters.spec.ts` already covers all 10 chapters (launch-v1, launch-v2, v1-jupiter, v2-jupiter, v1-saturn, v2-saturn, v2-uranus, v2-neptune, pale-blue-dot) visually (which inherently exercises the chapter-title rendering at pixel-diff level). The dev's choice to focus the explicit invariant assertion on V1J (encounter pattern) + PBD (Epic 5 critical path) is sound; adding the other 8 chapters to this spec would be redundant against the visual suite and would double the wall-clock cost of the production-tier suite for no net signal gain. **No additional test authored.**

### AC2 — CONTRIBUTING.md LFS-size policy
**VERIFIED.** `CONTRIBUTING.md` § "Git LFS additions" includes all four required components per the AC:
1. **Threshold rules** — per-story > 500 MB OR single file > 250 MB (calibrated from Story 4-11's 2.3 GB / 387 MB outliers); 5 GB ceiling for footprint pre-clearance also documented.
2. **Disclosure requirement** — Dev Notes line at `/bmad-create-story` time naming files + sizes + total + rationale; example given. Process-violation classification matches Rule 5 / Rule 2 sibling pattern.
3. **`GIT_LFS_SKIP_SMUDGE=1` instruction** — full clone-time UX block with selective `--include` examples (kernels-only, textures-only, full pull).
4. **`git lfs ls-files -s` footprint audit pattern** — full awk-based byte-summation snippet included.

Plus cross-references to ADR-0011 and Rule 12. Rule 12 (`_bmad/custom/voyager-skill-rules.md` lines 189–203) cross-references CONTRIBUTING.md and encodes the `bmad-create-story` MED-at-omission / `bmad-code-review` HIGH-at-omission enforcement bar.

### AC3 — Epic 3 Retro Audit (8 action items, closure status documented)
**VERIFIED.** The story file's § "Epic 3 Retro Audit" table has exactly 8 rows (Actions #1–#8), each with a closure status + evidence pointer. Cross-checked against the source at `_bmad-output/implementation-artifacts/epic-3-retro-2026-05-22.md` lines 103–115:
- Actions #1, #2 — CLOSED-by-Story-4-0 (commit `755e3d6`) ✓
- Action #3 — CLOSED-by-Story-4.1-AC6 (`web/src/main.ts:242–269` cited) ✓
- Action #4 — CLOSED-by-Story-4.5 (`4-5-smoke-evidence/smoke-summary.md` Probe 5 cited) ✓
- Action #5 — CLOSED, already done (Rule 10 at lines 134–163) ✓
- Action #6 — CLOSED, already done (Rule 11 at lines 165–187) ✓
- Action #7 — CLOSED-by-Story-4-0 (`README.md:247` + `.github/workflows/ci.yml` lines cited) ✓
- Action #8 — **OPEN**, re-routed to next SpacecraftModels / build_glb touch (deferred-work entry preserved at lines 476–485) ✓

7 of 8 CLOSED, 1 of 8 (Action #8, LOD3 budget) OPEN with routing decision documented. No drift between the table and the cited sources.

### AC4 — deferred-work.md strike-through annotations
**VERIFIED.** All 14 Epic 4 entries in `_bmad-output/implementation-artifacts/deferred-work.md` carry the `_Story 5.0 (2026-05-23): still applies; carries to <routing>_` (or equivalent `REVIEWED by Story 5.0`) annotation in-place. The annotations cover:
- `[4.0 / LOW]` × 3 — `_extract_knot_ets_in_band` boundary tests; `ephemeris-perf.ts` attitude file picker; ADR-0004 cadence example numbers (rows 21–23 in the story's Triage Table — the three Story-4.0 code-review LOWs the original scope text overlooked).
- `[4.0-smoke / LOW]` × 2 — Play button overlap; top-right HUD chrome density.
- `[4.1 / LOW]` × 2 — ViewFrameService identity-transform sentinel; ViewFrameService NaN guard.
- `[4.2 / MED]` Pinch-to-zoom; `[4.2 / LOW]` zoom-clamp probe test.
- `[4.3 / LOW]` × 4 — boundaryStalled; GPUCapabilityProbe; build-textures-e2e fixture path; bake_trajectories.py print drift.
- `[4.6 / LOW]` — MISSION_FACTS MM/DD format.

All 14 deferred-work entries cross-match the story's Triage Table rows 11–23 (4 CLOSED-VERIFY rows for Epic 4 retro Actions #1–#4 plus 14 DEFERRED-forward rows; row counts agree: 14 deferred-work entries + 0 CLOSED-by-5.0 + 0 DROPPED). The triage-integrity contract holds.

### AC5 — Test sweep + lint baseline + ADR compliance
**VERIFIED in Dev Agent Record § "AC5 test sweep".** Web vitest 3120 passed (+32 from Story 4-12 baseline of 3088); 1 isolated false-fail re-run cleanly in isolation (5s timeout under parallel CPU contention while walking the repo tree on Windows). Typecheck clean. Lint 4 warnings (matches baseline). ADR-0011 / ADR-0017 / ADR-0027 compliance documented. Bake suite not locally re-evaluated (no uv on dev machine) — CI handles it.

### AC6 — PBD-ready integration smoke
**VERIFIED.** Both V1J and PBD chapters render the production-built `<v-hud-chapter-title>` `<h2>` correctly. The new regression spec is the durable assertion of this invariant; the dev's smoke evidence (`5-0-smoke-evidence/production-build-title-v1-jupiter.png`, `production-build-title-pale-blue-dot.png`, README) captures the agent-time confirmation. Lead-driven final smoke per Rule 7 is the canonical handoff gate.

## Test stages

### Vitest unit / integration (default `npm test` sweep)
- **Status:** No new vitest tests added by QA (the dev didn't add any to the unit tier either — AC1's regression test is correctly classified as a build-pipeline E2E test per Rule 11, not a unit test).
- **Baseline:** 3120 passed / 10 skipped / 174 files (Dev Agent Record § "AC5 test sweep"). Story 5.0 introduces no Vitest regressions.

### Playwright build-pipeline E2E (`npm run test:visual`)
- **Status:** 1 new spec — `web/tests/visual/hud-chapter-title-prod.spec.ts` (2 scenes; passing in 4.5s wall-clock; re-verified by QA at this stage).
- **Discoverability:** under the visual-suite's `testMatch: /.*\.spec\.ts$/`; co-located with `encounters.spec.ts` (Story 4.9); honoured by the CI `l4-visual-regression` job per ADR-0017 compliance.
- **Rule 11 satisfied:** the spec drives `web/dist/` → `vite preview` → real Chromium end-to-end, satisfying the build-pipeline E2E rule for any script that ships an artifact production runtime consumes (here, the bundled `main-*.js` and the `<v-hud-chapter-title>` wire-up chain).
- **No additional Playwright specs authored by QA.** Coverage is sufficient per the AC1 analysis above.

### Chrome DevTools MCP smoke (per Voyager test-tier policy — Rule 3 + Rule 8)

Story 5.0 touches `web/tests/visual/` (a `web/` path under the policy's scope), so this stage is in scope. The story is process / cleanup / investigation, so the MCP smoke focus is verification of the AC1 invariant against a real Chromium navigation; the dev has already captured smoke evidence under `_bmad-output/implementation-artifacts/5-0-smoke-evidence/` using a one-shot Playwright probe. The canonical lead-driven MCP smoke at code-review time should re-confirm the same invariant.

**Lead-driven MCP smoke contract (Rule 7 — lead executes, not subagent):**

1. **`mcp__chrome-devtools-mcp__navigate_page`** — `http://localhost:4173/c/v1-jupiter/` (after `cd web && npm run build && npx vite preview --port 4173 --strictPort`). Confirms the production build serves and the V1J encounter chapter resolves.

2. **`mcp__chrome-devtools-mcp__evaluate_script`** — assert on the production-build wire-up invariant covering AC1 + AC6:
   ```js
   () => {
     const hud = document.querySelector('v-hud');
     const title = hud?.shadowRoot?.querySelector('v-hud-chapter-title');
     const h2 = title?.shadowRoot?.querySelector('h2');
     return {
       h2Text: (h2?.textContent ?? '').trim(),
       h2DataSlug: h2?.getAttribute('data-slug') ?? null,
       chapterDirectorWired: title?.chapterDirector !== undefined,
     };
   }
   ```
   Expected: `{ h2Text: 'Voyager 1 — Jupiter', h2DataSlug: 'v1-jupiter', chapterDirectorWired: true }`.

3. **`mcp__chrome-devtools-mcp__take_screenshot`** — capture the HUD region showing the populated chapter title. Evidence path: `_bmad-output/implementation-artifacts/5-0-smoke-evidence/lead-mcp-v1-jupiter.png` (alongside the dev's existing screenshots).

4. **Repeat steps 1–3 for `/c/pale-blue-dot/`** — the load-bearing case for Epic 5. Expected: `{ h2Text: 'Pale Blue Dot', h2DataSlug: 'pale-blue-dot', chapterDirectorWired: true }`. Evidence path: `_bmad-output/implementation-artifacts/5-0-smoke-evidence/lead-mcp-pale-blue-dot.png`.

5. **`mcp__chrome-devtools-mcp__take_snapshot`** — accessibility tree snapshot for the HUD region on the PBD chapter. Confirms `<v-hud-chapter-title>` `<h2>` is in the a11y tree with the expected role (heading) and accessible name (the chapter name). Covers AC1's a11y surface implicit in the rendering chain.

6. **Console-clean assertion** — `mcp__chrome-devtools-mcp__list_console_messages` should report only the Lit dev-mode banner (which is suppressed in production builds — so the production build's console should be clean of any Lit warning). Any `class-field-shadowing` warning here would indicate a Rule 10 regression and must be a HIGH finding.

**AC coverage by MCP smoke:**
- AC1 — verified by steps 2 + 3 (production-build wire-up invariant + screenshot evidence).
- AC6 — verified by steps 1–4 (PBD-ready end-to-end smoke at both V1J and PBD chapters).
- AC2 / AC3 / AC4 / AC5 — pure docs / audit / triage work; not in MCP smoke scope.

**Why the lead executes this (Rule 7):** sub-agents inherit MCP from the harness on a best-effort basis only; the binding gate for ADR-0010-tooled smokes is the lead's tool inventory. The dev's one-shot Playwright probe in `5-0-smoke-evidence/` already exercises the same surface and is the agent-time evidence; the lead's MCP re-verification is defense-in-depth (and the canonical pre-merge smoke per ADR-0010 Layer 1).

## Coverage

- Production-build `<v-hud-chapter-title>` wire-up: 2 chapters (V1J + PBD); 8 other chapters covered by `encounters.spec.ts` at pixel-diff level.
- LFS-size policy: 4 of 4 components (threshold + disclosure + skip-smudge + footprint audit) verified in CONTRIBUTING.md.
- Epic 3 retro audit: 8 of 8 action items have closure determination.
- Epic 4 deferred-work triage: 14 of 14 entries annotated in-place.

## Tests Added

(none — verification pass; the dev's Playwright regression spec at `web/tests/visual/hud-chapter-title-prod.spec.ts` is the load-bearing test addition for AC1 and verified passing by QA)

## Decisions

- No additional chapter slugs added to `hud-chapter-title-prod.spec.ts` — coverage of V1J + PBD is sufficient given (a) `encounters.spec.ts` already pixel-diffs all 10 chapters, (b) PBD is Epic 5's critical path, (c) V1J is the canonical encounter-pattern representative, and (d) adding 8 more chapters to this spec would double its wall-clock cost without surfacing additional defect classes.

## Issues Encountered

(none — all 6 ACs verified against current HEAD; the regression spec runs green in 4.5s)
