# Story 6.0: Epic 5 Deferred Cleanup

**Epic:** 6 — Audio, Reduced Motion & Full Accessibility Pass
**Status:** review
**Date created:** 2026-05-24
**Source:** Epic 5 retrospective (`epic-5-retro-2026-05-24.md`) main retro action items + `deferred-work.md` open Epic-6-routed items + Epic 4 retro addendum Action #3 carry-forward (L4 HUD region masking — partial relief by Story 5.4's L4 stable-frame Condition 5 fix; remainder belongs to Story 6.6)

## User Story

As the project maintainer,
I want Epic 5's pre-Epic-6 deferred items addressed before Story 6.1 begins — specifically (a) a LAYOUT-asserting production-build regression test that would have caught BUG-E5-007 (the missing CSS-link defect that broke every chapter layout while ALL automated tiers and per-story smokes passed green), (b) the `--update-snapshots` discipline dev-doc that captures Story 5.4's hard-won workflow lessons before they're lost, (c) a new skill-rule (Rule 14) encoding the spec-arithmetic discipline that Story 5.2 surfaced (the "50× speedup" / 100× math drift), and (d) a new skill-rule (Rule 15) encoding the forward-coherence heuristic for closely-coupled multi-story substate / API definitions (the Story-5.1 `composite_active` semantic drift that Story 5.3 had to amend),
So that Story 6.1 onward begins from a discipline-hardened baseline where (a) future CSS-link or layout regressions surface at vitest time rather than escaping through self-confirming pixel baselines, (b) future visual-regression-extension stories don't re-discover Story 5.4's `--update-snapshots` workflow lessons, (c) future spec arithmetic that depends on a separate fact source either shows its derivation or cites the source line, and (d) future Story-X.1 foundations explicitly mark forward-coupled definitions as PROVISIONAL until consumed by X.2 / X.3 / etc.

## Triage Source

The full triage covering every Epic 5 retro action item (8 items) and every open `deferred-work.md` item routed to Epic 6 / Story 6.X (15 items) lives in § "Triage Table" below. Items are sorted into:

- **INCLUDE** — addressed by this story (becomes an AC); the corresponding retro / `deferred-work.md` entry is annotated with a closing pointer to Story 6.0 as part of completion.
- **DEFER** — carries forward per each item's existing routing target (Story 6.1 / 6.2 / 6.3 / 6.4 / 6.5 / 6.6, or Story 7.X / Epic 7 polish); no Story 6.0 work.
- **CLOSED-VERIFY** — items already implicitly closed by Epic 5 inline work (Stories 5-1 / 5-2 / 5-3 / 5-4 / cross-review fixes); this story strikes them through with a closing annotation pointing at the originating shipped commit.
- **DROP** — explicitly rejected with rationale.

The triage table is the contract: every Epic 5 retro action item + every Epic 6-routed open `deferred-work.md` item (as of `2026-05-24`) is accounted for. Items not in the table = drift; surface as a HIGH finding at code-review time per Rule 6.

## Acceptance Criteria

### AC1 — LAYOUT-asserting production-build regression test (Epic 5 retro Action item #1)

- **GIVEN** Epic 5's cross-review surfaced BUG-E5-007: the production-built HTML never linked the main CSS bundle; every HUD corner and chapter-copy panel collapsed to overlapping rectangles at (0,0); ALL automated tiers (web vitest 3088, L4 Playwright 9 baselines) AND every per-story Chrome DevTools MCP smoke gate (Stories 5.0 / 5.1 / 5.2 / 5.3 / 5.4) PASSED against this broken state because the unit tests asserted on `<h2>` text content rather than positions and the L4 baselines were captured WITH the broken layout (pixel-diff vs. self is clean when both sides are broken in the same way)
- **AND** the binding lesson surfaced by the retro is that the existing `/epic-cycle` smoke gates do NOT exercise production-build LAYOUT — every per-story smoke either ran against dev-mode (where CSS loads correctly via Vite HMR) OR asserted on TEXT (which renders correctly even with broken positions)
- **AND** Story 5.0's existing `web/tests/build-dist-css-link.test.ts` (added during the cross-review fix) asserts on the `<link rel="stylesheet">` presence in the built HTML — but does NOT assert on the layout *consequence* (HUD-corner positioning); a future bundler-config change that silently re-broke CSS injection through a *different* mechanism (e.g., split-chunk CSS-import order, conditional `<link>` injection via a plugin, CSP-induced load failure) would slip past
- **WHEN** Story 6.0 adds a LAYOUT-asserting production-build regression test
- **THEN** a new test file `web/tests/build-dist-layout.test.ts` (vitest) is added that:
  - (a) Locates the production-built `web/dist/index.html` and asserts via static parse (no DOM) that the built HTML contains both a `<link rel="stylesheet">` matching `/assets/main-*.css` (defense-in-depth restating Story 5.0's CSS-link check; Story 5.0's actual asset prefix is `main-`, not `index-` — per `web/tests/build-dist-css-link.test.ts:27`) AND the inline `<style>` FOUC-shim block (Story 1.7 AC2 — see `web/index.html` `<!-- Story 1.7 AC2 — critical first-paint tokens -->` comment; assert both are present in the expected document order — `<link>` AFTER `<style>` per HEAD-priority discipline) <!-- Rule 5 amendment Story 6.0 (2026-05-24): original AC1 wording said "inline `<style>` block emitted by `vite-plugin-feature-probe`" and `/assets/index-*.css`. The actually-emitted inline `<style>` is the Story 1.7 AC2 FOUC-shim (`<v-` design tokens like `--v-color-bg`); the `vite-plugin-feature-probe` (= `voyager:fallback-and-probe` in `vite.config.ts`) substitutes a `<script>` placeholder, not a `<style>`. The CSS asset is hashed `main-*.css` per Vite's `rollupOptions.output.assetFileNames`, not `index-*.css`. Both corrections are surfaced as Story 6.0 spec arithmetic drift (Rule 14 candidate — derivation from `web/index.html` + `vite.config.ts`). -->

  - (b) Uses Playwright (or `happy-dom` + a static-asset-server stub) to render the built `web/dist/index.html` at viewport 1280×720 and assert via `getBoundingClientRect()` on ≥ 5 invariant landmarks of the HUD layout: `<v-hud>.corner.top-left` left < 200 AND top < 100; `<v-hud>.corner.top-right` right > 1100 (left of 1280-margin) AND top < 100; `<v-hud>.corner.bottom-left` left < 200 AND bottom > 620 (above 720-margin); `<v-hud>.corner.bottom-right` right > 1100 AND bottom > 620; the mission scrubber's `<input[type=range]>` left > 50 AND right < 1230 (gutters present per BUG-E5-009 fix)
  - (c) Asserts the chapter-copy panel (`<v-chapter-copy>`) when present has `right < 1280` (panel is on-screen) AND `top > 0 AND bottom < 720` (panel does not overflow the viewport)
  - (d) Gates the Playwright-tier portion behind a fixture-presence check (`describe.skipIf(!existsSync('web/dist/index.html'))`) following Story 3.7's slow-tier discipline, so a developer running `npm test` against a fresh checkout without a built `dist/` doesn't see a spurious failure; the static-parse portion always runs
- **AND** the test SHALL deliberately reproduce BUG-E5-007 inline (in a dedicated `it("catches a missing CSS-link regression")` case): the test programmatically removes the `<link rel="stylesheet">` tag from a temporary copy of `dist/index.html`, navigates to the modified copy, and asserts the layout-invariant check FAILS (HUD corners collapse) — proving the test would catch the original defect
- **AND** the test discovers reliably with the project's default test suite (vitest's `npm test` / CI's `npm run test:ci`) per Rule 13 (test discoverability) — no `.skip`, no `xfail`, no env-var gate that defaults to off in CI; the static-parse portion is part of every CI run and the Playwright-tier portion runs in any CI job that pre-builds `web/dist/`
- **AND** Epic 5 retro Action item #1 is annotated with a closing pointer to Story 6.0

### AC2 — `--update-snapshots` discipline dev-doc (Epic 5 retro Action item #4)

- **GIVEN** Story 5.4 introduced a workflow where PBD substate-anchored Playwright baselines were captured via Playwright's `--update-snapshots` flag against the production-build `/c/pale-blue-dot?t=<iso>` deep links, with AC1-cross-check assertions in a sibling vitest spec that pin the timing-table semantics (Story 5.1's `substates.ts` → Story 5.2's `turn-choreography.ts` → Story 5.3's `composite-layer.ts` orchestration) so that future timing changes surface as sub-second vitest failures rather than 30-90s Playwright failures, AND substate renaming surfaces as TypeScript compile errors rather than visual-regression flakes
- **AND** the cross-review revealed a SECONDARY lesson: the L4 baselines were captured WITH BUG-E5-007 active, so `--update-snapshots` ALSO captures-in any active visual defects unless the cross-review gate catches them before the baselines are locked
- **AND** future visual-regression-extension stories (Story 6.6 polish; any future Story-X.4-style PBD-tier extensions; Epic 7 cross-browser matrix) will need to know (a) when `--update-snapshots` is the right answer vs. when it papers over a defect, (b) how to author AC1-cross-check vitest specs that pin timing-table semantics, (c) the pre-update verification gate (cross-review pass against the production build before locking baselines), and (d) the canonical commit-evidence pattern (commit the baseline + the test file in the same PR, never separately)
- **WHEN** Story 6.0 documents the `--update-snapshots` discipline
- **THEN** a new dev-doc lands at `docs/visual-validation/update-snapshot-discipline.md` (create the `docs/visual-validation/` directory if absent) covering the four points above, with concrete citations to Story 5.4's File List (`web/playwright.config.ts:visualRegressionConfig`, the AC1-cross-check vitest spec, the substates.ts timing table) and a "checklist before running `--update-snapshots`" section listing the pre-update verification gate items
- **AND** the dev-doc is cross-referenced from `_bmad/custom/skill-rules.md` (a new sentence in Rule 13 or a new Rule, dev-agent's choice — but it must be discoverable from the skill rules so future bmad-qa-generate-e2e-tests and bmad-code-review invocations see the reference)
- **AND** the dev-doc is also referenced from `CONTRIBUTING.md` § "Visual validation" (create the section if absent) so external contributors see it
- **AND** Epic 5 retro Action item #4 is annotated with a closing pointer to Story 6.0

### AC3 — Spec-arithmetic Rule added as Rule 14 in skill-rules (Epic 5 retro Action item #5)

- **GIVEN** Story 5.2 surfaced a spec-arithmetic drift: `epics.md` line 1991–1992 said "the historical sequence ... is sped 50× by the PBD module's internal time mapping," but the actual math (Story 5.1's 180s cinematic arc ÷ Sagan 1994's "several hours" historical sequence ≈ 100×, not 50×); the dev's Rule 5 amendment caught it, but the spec author should have computed it at planning time
- **AND** the retro identifies this as a class of defect (spec arithmetic that depends on a separate fact source — `MISSION_FACTS.md` timing, `ckbrief-inventory.md` coverage windows, `kernels-manifest.json` SHA references, etc. — drifts silently when the source moves)
- **AND** the retro routes the fix to a new skill-rule, suggested as "Rule 13" — but skill-rules.md Rule 13 is already taken (Test discoverability, slotted at 13 to preserve Voyager Rules 8–12); the spec-arithmetic rule belongs at Rule 14
- **WHEN** Story 6.0 adds the Spec-arithmetic Rule
- **THEN** `_bmad/custom/skill-rules.md` gains a new "Rule 14 — Spec arithmetic that depends on a separate fact source must show the computation or cite the source line (applies to `bmad-create-story`)" with the canonical structure of every other rule (statement, **Why this rule exists today** with the Story 5.2 incident citation, **Enforcement** specifying that `bmad-create-story` surfaces missing derivation citations as a process gap at planning review, **Examples** showing acceptable forms — inline arithmetic like "180s ÷ 18000s ≈ 100× speedup" OR source citation like "per `MISSION_FACTS.md:42` (Sagan 1994 'several hours' = ~5h)")
- **AND** the rule applies to `bmad-create-story` (spec-authoring stage) — `bmad-code-review` does NOT additionally police this at code-review time (the planning-stage gate is sufficient; doubling up would create review noise)
- **AND** the rule's "When this rule fires" section enumerates the trigger conditions: ACs containing numeric quantifiers derived from external sources (timing tables, coverage windows, kernel SHAs, performance thresholds, byte-budget claims like "≤ 150 MB bundle")
- **AND** Epic 5 retro Action item #5 is annotated with a closing pointer to Story 6.0

### AC4 — Forward-coherence heuristic added as Rule 15 in skill-rules (Epic 5 retro Action item #6)

- **GIVEN** Story 5.1's `composite_active` substate was authored as "all six plates visible simultaneously" — directly contradicting the eventual Story 5.3 requirement ("at most ONE plate visible") AND the epic-spec 30-second-Earth-pause success criterion; Story 5.3 caught and amended it via Rule 5, but the forward-coherence gap existed because Story 5.3's contract didn't exist at Story 5.1 planning time
- **AND** the retro identifies this as a class of defect for any Story-X.1 foundation that introduces substate / API / event / module-contract definitions consumed by later Story-X.2 / X.3 / etc.
- **WHEN** Story 6.0 adds the Forward-coherence heuristic
- **THEN** `_bmad/custom/skill-rules.md` gains a new "Rule 15 — Forward-coupled definitions in Story-X.1 foundations are PROVISIONAL until consumed by X.2 / X.3 (applies to `bmad-create-story`)" with the canonical rule structure (statement, **Why this rule exists today** with the Story 5.1 / 5.3 `composite_active` incident citation, **How to apply**, **Examples**)
- **AND** the rule's "How to apply" section instructs `bmad-create-story` to, when authoring Story X.1 of a multi-story foundation: (a) identify the cross-story coupled definitions (substate enums, public APIs, event payloads, module-interface contracts that name fields consumed by named-but-not-yet-written future stories); (b) mark each as `PROVISIONAL — consumed by Story X.Y` in the story's Dev Notes; (c) add a forward-link in `deferred-work.md`'s "Forward-coupled provisional definitions" section so Story X.Y's planning gate sees the pending coupling
- **AND** Story X.Y consumers, at their `bmad-create-story` time, MUST verify the provisional definition is still semantically consistent with X.Y's contract OR trigger a Rule 5 amendment (in either direction — Story X.1 amended retroactively, or Story X.Y's scope adjusted, with rationale)
- **AND** the rule applies to `bmad-create-story` only; `bmad-code-review` does NOT police this (planning-stage gate sufficient)
- **AND** Epic 5 retro Action item #6 is annotated with a closing pointer to Story 6.0

### AC5 — Test sweep + lint baseline preserved + ADR compliance verified

- **GIVEN** the post-Epic-5 baseline (per the retro): web vitest 3343 / 10 skipped (post-cross-review), bake fast pytest preserved, typecheck clean, 4 lint warnings 0 errors, L4 Playwright 15 deterministic across 3 consecutive reruns
- **WHEN** Story 6.0 ships
- **THEN** web vitest pass count is ≥ 3344 (one new test in AC1's `build-dist-layout.test.ts` — the static-parse portion; the Playwright-tier portion's `it("catches a missing CSS-link regression")` may add 1–3 more tests at dev's discretion)
- **AND** bake pytest pass count is preserved or unchanged (Story 6.0 is web-side + docs only — no bake changes)
- **AND** `npm run typecheck` is clean
- **AND** `npm run lint` shows ≤ 4 warnings (the pre-existing baseline; 0 new — the L4 cross-check style for the new dev-doc text content is markdown-lint scope, not eslint scope)
- **AND** any pre-existing test failures known at Epic 5 close (none documented in the Epic 5 retro readiness assessment — GREEN across all dimensions) are re-verified as still-green; document any newly-surfaced failure in the Dev Agent Record (do NOT silently normalize per the "never normalize known failures" lesson)
- **AND** ADR-0010 (Chrome DevTools MCP agent-time + Playwright CI-time), ADR-0017 (GitHub Actions for build), ADR-0019 (zero analytics + localStorage-only error capture — Story 6.0 touches no analytics surface), ADR-0027 (line-ending normalization for the new markdown file) compliance is verified in the Dev Agent Record (Rule 6 — only ADRs Story 6.0 actually touches)

### AC6 — Integration AC: cross-cutting closure verified end-to-end (load-bearing closure of AC1–AC4)

- **GIVEN** AC1 adds a layout-asserting test, AC2 documents `--update-snapshots` discipline, AC3 + AC4 add two new skill-rules
- **AND** the binding gate for Story 6.1 readiness is that (a) the new test actually runs in CI and would catch a regression of BUG-E5-007's class, (b) the dev-doc is discoverable from skill-rules so future agents see it, and (c) the new rules are present in `skill-rules.md` at the correct slot numbers (14 + 15) with the canonical structure
- **WHEN** Story 6.0 closes the cycle
- **THEN** the lead's local Chrome DevTools MCP smoke runs `cd web && npm run build && npm test build-dist-layout` against the production build of the current branch and confirms the test PASSES with the CSS-link intact AND the synthetic "missing CSS-link" case FAILS as expected (proving regression coverage); smoke evidence captured under `_bmad-output/implementation-artifacts/6-0-smoke-evidence/`
- **AND** the lead grep-verifies `_bmad/custom/skill-rules.md` contains exactly `## Rule 14` and `## Rule 15` headers in the documented format, and that the cross-reference from one of those rules (or from Rule 13) points to `docs/visual-validation/update-snapshot-discipline.md`
- **AND** the lead grep-verifies `CONTRIBUTING.md` § "Visual validation" exists and references the dev-doc path
- **AND** Story 6.0 ships ON GREEN CI (no upstream amendments break Epic 5 baselines)
- **AND** the Epic 5 retro action-items table is updated in place (within `epic-5-retro-2026-05-24.md`) with closing-pointer annotations on rows 1, 4, 5, 6 (the four "Lead / pre-Epic-6" items)

**Integration ACs declaration (Rule 1 escape clause):** Story 6.0 introduces no new service / module / shared component for downstream consumption. The four work items are project-discipline gates (1 test file, 1 dev-doc, 2 skill-rules) whose "consumers" are future story-authoring agents and CI sweeps — those consumers exist as soon as the next `bmad-create-story` or `npm test` runs. AC6 above is the lead-side verification that the four items integrate correctly. No future named consumer story is required.

## Out of Scope (Defer to Specific Later Stories)

The following Epic 5 retro items + Epic 6-routed `deferred-work.md` items are NOT in Story 6.0 — each is routed to its natural landing per the § "Triage Table":

- **Epic 5 retro Action item #2** (Detail scrubber chapter-marker clustering V2L/V1L, V1J/V2J, V1S/V2S, V2N/PBD) — DEFER to **Story 6.2** (`<v-hud>` dismiss/restore and final HUD compaction polish; explicitly routed by the retro).
- **Epic 5 retro Action item #3** (L4 HUD region masking — Epic 4 retro addendum #3 carry-forward, partial relief from Story 5.4 Condition 5 fix) — DEFER to **Story 6.6** (final typography + provenance-label polish; explicitly routed by the retro).
- **Epic 5 retro Action item #7** (PBD-specific friendly-user prompts from `5-2-friendly-user-prep.md`) — DEFER to **Story 6.5** (friendly-user qualitative testing protocol).
- **Epic 5 retro Action item #8** (Audit `v-hud.ts` corner-positioning CSS for defensive fallback) — DEFER to **Story 6.2 OR Story 6.6** (lead-routed at the time of those stories).
- **`[2.7 / LOW]` `main.ts` ClockManager constructed before `/about` early-return** — DEFER to **Story 6.1** (audio surface restructure; explicitly routed by `deferred-work.md:145`).
- **`[2.9 / LOW]` `v-chapter-copy` short-viewport collision risk** — DEFER to **Story 6.2** (HUD compaction breakpoint work; explicitly routed by `deferred-work.md:154`).
- **`[4.0-smoke / LOW]` Play button overlaps mission scrubber (HUD lower-left)** — DEFER to **Story 6.2** (explicitly routed by `deferred-work.md:682`).
- **`[4.0-smoke / LOW]` Top-right HUD chrome density** — DEFER to **Story 6.2** (paired with lower-left; routed by `deferred-work.md:705`).
- **`[1.7 / LOW]` `global.css` universal margin/padding reset (BaseElement doc)** — DEFER to **Story 6.4** (a11y / BaseElement documentation; routed by `deferred-work.md:113`).
- **`[2.7 / LOW]` `mountAboutSurface` mutates `document.body.style.overflow`** — DEFER to **Story 6.4** (global.css revisit; routed by `deferred-work.md:147`).
- **`[2.8 / LOW]` `v-help-overlay` focus-trap silent catches** — DEFER to **Story 6.4** (a11y hardening, paired with `v-chapter-index` sibling; routed by `deferred-work.md:151`).
- **`[1.10 / LOW]` `<v-speed-multiplier>.stepDecade(+1)` 50→1000 jump** — DEFER to **Story 6.5** (qualitative testing decides if user feedback flags it; routed by `deferred-work.md:118` + Story 1.10 dev notes).
- **`[1.1 / LOW]` `web/index.html <title>web</title>`** — DEFER to a **Story 6.X** UI polish moment (no specific story; pick up at first Epic 6 story that touches `index.html`).
- **`[1.5 / LOW]` `main.ts ensureCanvas` clears all children** — DEFER to a **Story 6.X** layout-touching story (likely Story 6.2 if HUD compaction restructures the mount).
- **`[2.7 / LOW]` `mountAttributionsFooter` host attachment fragility** — DEFER to **Epic 6 layout work** (Story 6.2 if the simulation surface gains a layout container).
- **`[2.8 / LOW]` `v-help-overlay .shortcut-keys` 100px literal** — DEFER to **Story 7.6** OR **Epic 6 tokens-hygiene pass** (whichever lands first; routed by `deferred-work.md:400`).
- **`[3.0 / LOW]` No `window.__voyagerDebug.dispose` debug surface** — DEFER to **Story 6.X dev-mode hygiene pass** OR Story 7.X (routed by `deferred-work.md:410`).
- **`[3.2 / LOW]` `AttitudeService.decodedByUrl` no eviction policy** — DEFER to **Epic 6 perf-pass** OR Story 7.X perf-hardening (routed by `deferred-work.md:432`).
- **`[3.3 / LOW]` `SpacecraftHandle.lod` field mutation bypasses readonly** — DEFER to **Story 6.X hygiene pass** OR Epic 7 (routed by `deferred-work.md:440`).
- **`[4.0 / LOW]` `ephemeris-perf.ts` ET-span computation** — DEFER to **Story 6.X perf-pass** OR Epic 7 polish (routed by `deferred-work.md:649`).
- **`[4.2 / MED]` Pinch-to-zoom not implemented (touch coverage)** — DEFER to **Epic 6 touch-coverage story** if added, OR explicit scope-cut decision (routed by `deferred-work.md:745` per Story 4.2 review).
- **`[4.3 / LOW]` `GPUCapabilityProbe.adequateForEightK` heuristic** — DEFER to **Epic 6 polish (tier-aware texture selector)** OR Story 7.X perf-hardening (routed by `deferred-work.md:779`).

The triage above is exhaustive — every open `deferred-work.md` entry routed to "Story 6.X" / "Epic 6" / similar Epic-6-shaped landings is present. New deferrals discovered during Story 6.0 implementation get added to `deferred-work.md` per the Rule 4 pattern.

## Tasks / Subtasks

- [x] T1 — Add `web/tests/build-dist-layout.test.ts` (AC1, AC5)
  - [x] Subtask 1.1 — Static-parse portion: parse `web/dist/index.html` (or a synthetic fixture if dist missing), assert presence + ordering of `<link rel="stylesheet">` matching `/assets/main-*.css` (Rule 5 amendment to AC1: corrected from `/assets/index-*.css`; Vite emits `main-*` per `rollupOptions.input.main` entry) and the inline FOUC-shim `<style>` block (Rule 5 amendment: corrected from "feature-probe `<style>`"; the inline `<style>` is the Story 1.7 AC2 FOUC shim; `voyager:fallback-and-probe` substitutes a `<script>`, not a `<style>`)
  - [x] Subtask 1.2 — Playwright portion: serve `web/dist/` via `vite.preview()` programmatic API (free port; avoids strict-port collisions), navigate Chromium to root + `/c/v1-jupiter/`, assert `getBoundingClientRect()` on HUD corners (4) + scrubber gutter + chapter-copy panel
  - [x] Subtask 1.3 — Synthetic regression case: intercept the root HTML response via Playwright's `page.route()`, strip the `<link rel="stylesheet">` tag, navigate to the modified URL, assert ≥3 of the 4 HUD-corner gutter invariants FAIL (corners collapse toward viewport origin without the CSS link)
  - [x] Subtask 1.4 — Gated the Playwright tier behind `describe.skipIf(!existsSync(ROOT_HTML))` matching Story 5.0's `build-dist-css-link.test.ts` pattern; static-parse tier shares the same gate; both run in default `npm test` when dist is present
  - [x] Subtask 1.5 — Test discoverable: filename matches vitest's default glob; no `.skip` / no env-gate / no opt-out flag. `npm test` picks it up (vitest 3349 / 10 skipped — up from 3343 baseline)

- [x] T2 — Add `docs/visual-validation/update-snapshot-discipline.md` (AC2)
  - [x] Subtask 2.1 — `docs/visual-validation/` already exists (siblings: `gravity-assists.md`, `pale-blue-dot.md`); wrote the dev-doc covering Story 5.4's `--update-snapshots` workflow, AC1-cross-check pattern, pre-update verification gate, and commit-evidence pattern
  - [x] Subtask 2.2 — Pre-update verification checklist landed as the canonical "checklist before running `--update-snapshots`" section
  - [x] Subtask 2.3 — Cross-referenced from `_bmad/custom/skill-rules.md` (added a Story-6.0 cross-reference paragraph under Rule 13)
  - [x] Subtask 2.4 — `## Visual validation` section added to `CONTRIBUTING.md` with 2-sentence pointer to the dev-doc + cross-reference to Story 6.0's `build-dist-layout.test.ts`

- [x] T3 — Add Rule 14 (Spec arithmetic) to `_bmad/custom/skill-rules.md` (AC3)
  - [x] Subtask 3.1 — `## Rule 14 — Spec arithmetic must show derivation or cite the source line (applies to bmad-create-story)` appended with canonical structure (statement, Why this rule exists today with Story 5.2 50×/100× incident, Enforcement at bmad-create-story time, When this rule fires, Examples)
  - [x] Subtask 3.2 — Header format `## Rule 14 — ...` matches Rules 8–13 convention exactly
  - [x] Subtask 3.3 — Incident citation (Epic 5 retrospective 2026-05-24 Action item #5) embedded inline; numbering note already in Rule 13 covers the 8–13 history

- [x] T4 — Add Rule 15 (Forward-coherence heuristic) to `_bmad/custom/skill-rules.md` (AC4)
  - [x] Subtask 4.1 — `## Rule 15 — Forward-coupled definitions in Story-X.1 foundations are PROVISIONAL until consumed by X.2 / X.3` appended with statement + Why this rule exists today (Story 5.1 / 5.3 `composite_active` incident) + How to apply (separate stanzas for Story-X.1 authors AND Story-X.Y consumers) + Enforcement + Examples
  - [x] Subtask 4.2 — `## Forward-coupled provisional definitions` section header added to `deferred-work.md` with entry-format spec; currently empty (Epic 6 has no X.1-style multi-story foundation)
  - [x] Subtask 4.3 — Header `## Rule 15 — ...` matches convention

- [x] T5 — Update `epic-5-retro-2026-05-24.md` Action items table (AC1–AC4)
  - [x] Subtask 5.1 — Rows 1, 4, 5, 6 annotated with `**Closed by Story 6.0 (2026-05-24):** <one-line>` lines preserving original content
  - [x] Subtask 5.2 — Rows 2, 3, 7, 8 left unannotated (deferred to Stories 6.2 / 6.6 / 6.5 / 6.2-or-6.6 per § Out of Scope)

- [x] T6 — Triage Table (AC6)
  - [x] Subtask 6.1 — Triage Table already populated by the spec author; verified rows 1–8 cover all 8 Epic 5 retro action items and rows 9–26 cover all open Epic-6-routed `deferred-work.md` entries
  - [x] Subtask 6.2 — Cross-check: walked `grep "Routing.*Story 6\|Routing.*Epic 6" deferred-work.md` outputs against table; all matched. No drift surfaced.

- [ ] T7 — Lead-side smoke (AC6) — **NOT THE DEV'S JOB; deferred to lead post-code-review** (per Story 6.0 spawn-prompt clarification: "T7 — NOT YOUR JOB")
  - Dev-side advance evidence: `_bmad-output/implementation-artifacts/6-0-smoke-evidence/vitest-build-dist-layout-output.txt` captures the full 6-test pass (3 static-parse + 3 Playwright-tier including the synthetic regression case) against the production build. The lead will re-run the same suite + the cross-reference greps as the binding smoke gate.

## Triage Table

| # | Item | Source | Triage Decision | Closure / Routing |
|---|---|---|---|---|
| 1 | LAYOUT-asserting production-build regression test | Epic 5 retro Action item #1 | **INCLUDE** | AC1 — `web/tests/build-dist-layout.test.ts` |
| 2 | Detail scrubber chapter-marker clustering algorithm | Epic 5 retro Action item #2 | **DEFER** to Story 6.2 | HUD compaction polish window |
| 3 | L4 HUD region masking + tolerance tightening | Epic 5 retro Action item #3 (Epic 4 retro addendum #3 carry-forward) | **DEFER** to Story 6.6 | Final typography + provenance-label polish |
| 4 | `--update-snapshots` workflow dev-doc | Epic 5 retro Action item #4 | **INCLUDE** | AC2 — `docs/visual-validation/update-snapshot-discipline.md` |
| 5 | Spec-arithmetic Rule for `bmad-create-story` | Epic 5 retro Action item #5 | **INCLUDE** | AC3 — Rule 14 in `_bmad/custom/skill-rules.md` (Rule 13 slot taken) |
| 6 | Forward-coherence heuristic for multi-story coupling | Epic 5 retro Action item #6 | **INCLUDE** | AC4 — Rule 15 in `_bmad/custom/skill-rules.md` |
| 7 | PBD-specific friendly-user prompts | Epic 5 retro Action item #7 | **DEFER** to Story 6.5 | Friendly-user qualitative testing protocol |
| 8 | `v-hud.ts` corner-positioning CSS defensive fallback audit | Epic 5 retro Action item #8 | **DEFER** to Story 6.2 OR 6.6 | Lead-routed at story time |
| 9 | `[2.7 / LOW]` `main.ts` ClockManager constructed before `/about` early-return | `deferred-work.md:145` | **DEFER** to Story 6.1 | Audio surface restructure; per existing routing |
| 10 | `[2.9 / LOW]` `v-chapter-copy` short-viewport collision risk | `deferred-work.md:154` | **DEFER** to Story 6.2 | HUD compaction breakpoint work; per existing routing |
| 11 | `[4.0-smoke / LOW]` Play button overlaps mission scrubber (HUD lower-left) | `deferred-work.md:682` | **DEFER** to Story 6.2 | Reviewed by Story 5.0; still applies |
| 12 | `[4.0-smoke / LOW]` Top-right HUD chrome density | `deferred-work.md:705` | **DEFER** to Story 6.2 | Reviewed by Story 5.0; ship paired with #11 |
| 13 | `[1.7 / LOW]` `global.css` universal margin/padding reset (BaseElement doc) | `deferred-work.md:113` | **DEFER** to Story 6.4 | Per existing routing |
| 14 | `[2.7 / LOW]` `mountAboutSurface` mutates `document.body.style.overflow` | `deferred-work.md:147` | **DEFER** to Story 6.4 | global.css revisit; per existing routing |
| 15 | `[2.8 / LOW]` `v-help-overlay` focus-trap silent catches | `deferred-work.md:151` | **DEFER** to Story 6.4 | a11y hardening; paired with v-chapter-index sibling |
| 16 | `[1.10 / LOW]` `<v-speed-multiplier>.stepDecade(+1)` 50→1000 jump | `deferred-work.md:118` | **DEFER** to Story 6.5 | Qualitative testing decides if user feedback flags it |
| 17 | `[1.1 / LOW]` `web/index.html <title>web</title>` default | `deferred-work.md:88` | **DEFER** to Story 6.X UI polish | No specific story; first Epic 6 `index.html` touch |
| 18 | `[1.5 / LOW]` `main.ts ensureCanvas` clears all children | `deferred-work.md:102` | **DEFER** to Story 6.X layout-touching story | Likely Story 6.2 if HUD compaction restructures the mount |
| 19 | `[2.7 / LOW]` `mountAttributionsFooter` host attachment fragility | `deferred-work.md:150` | **DEFER** to Epic 6 layout work | Story 6.2 if simulation surface gains a layout container |
| 20 | `[2.8 / LOW]` `v-help-overlay .shortcut-keys` 100px literal | `deferred-work.md:400` | **DEFER** to Story 7.6 OR Epic 6 tokens-hygiene | Whichever lands first |
| 21 | `[3.0 / LOW]` No `window.__voyagerDebug.dispose` debug surface | `deferred-work.md:410` | **DEFER** to Story 6.X dev-mode hygiene OR Story 7.X | Per existing routing |
| 22 | `[3.2 / LOW]` `AttitudeService.decodedByUrl` no eviction policy | `deferred-work.md:432` | **DEFER** to Epic 6 perf-pass OR Story 7.X perf-hardening | Per existing routing |
| 23 | `[3.3 / LOW]` `SpacecraftHandle.lod` field mutation bypasses readonly | `deferred-work.md:440` | **DEFER** to Story 6.X hygiene OR Epic 7 | Per existing routing |
| 24 | `[4.0 / LOW]` `ephemeris-perf.ts` ET-span computation | `deferred-work.md:649` | **DEFER** to Story 6.X perf-pass OR Epic 7 polish | DEV-only harness; no AC/NFR impact |
| 25 | `[4.2 / MED]` Pinch-to-zoom not implemented (touch coverage) | `deferred-work.md:745` | **DEFER** to Epic 6 touch-coverage story OR scope-cut | Per Story 4.2 review |
| 26 | `[4.3 / LOW]` `GPUCapabilityProbe.adequateForEightK` heuristic | `deferred-work.md:779` | **DEFER** to Epic 6 polish (tier-aware texture selector) OR Story 7.X | Per existing routing |

**Cross-check:** every Action item in `epic-5-retro-2026-05-24.md` § "Action items" (8 items) appears as rows 1–8; every entry in `deferred-work.md` whose Routing line names "Story 6.X" / "Epic 6" / equivalent appears as rows 9–26. Items not in this table = drift; surface as a HIGH finding at code-review time per Rule 6.

## Dev Notes

### Relevant architecture patterns and constraints

- **Test pyramid posture:** the new `build-dist-layout.test.ts` is a vitest spec that participates in the default `npm test` sweep — NOT a Playwright spec under `web/tests/visual/`. The Playwright-tier portion of the test calls Playwright as a library from inside vitest (the project already does this in `web/tests/visual/`-adjacent specs). This keeps Story 6.0's new coverage in the discoverable default suite per Rule 13.
- **Dev-doc location:** `docs/visual-validation/` is a NEW directory; create it. Existing dev-doc patterns in this project: `docs/adr/` (ADRs), `docs/kernels/` (kernel inventory), `docs/visual-validation/` will be the third dev-doc namespace. Keep the file's first line as a single H1 heading per the markdown-lint baseline.
- **Skill-rules layout:** `_bmad/custom/skill-rules.md` uses `## Rule N — Title` headers with `(applies to <skill>)` parentheticals. Each rule has a free-form body followed by **Why this rule exists today:** and (optionally) **Enforcement:** / **How to apply:** / **Examples:** sub-blocks. Match the existing Rule 8–13 layout exactly.
- **Forward-coupled provisional definitions section in `deferred-work.md`:** the new section is a peer of "Items dropped" — Story 6.0's AC4 task T4 Subtask 4.2 creates the section header; future Story-X.1 stories add forward-links there.

### Source tree components to touch

| File | NEW / UPDATE | Why |
|---|---|---|
| `web/tests/build-dist-layout.test.ts` | NEW | AC1 — layout-asserting production-build regression test |
| `docs/visual-validation/update-snapshot-discipline.md` | NEW | AC2 — `--update-snapshots` discipline dev-doc |
| `_bmad/custom/skill-rules.md` | UPDATE | AC3 + AC4 — append Rule 14 + Rule 15 |
| `CONTRIBUTING.md` | UPDATE | AC2 — add `## Visual validation` cross-reference (file already exists per Story 5.0 LFS policy work) |
| `_bmad-output/implementation-artifacts/deferred-work.md` | UPDATE | AC4 T4 Subtask 4.2 — add forward-coupled provisional definitions section header |
| `_bmad-output/implementation-artifacts/epic-5-retro-2026-05-24.md` | UPDATE | AC6 + T5 — annotate Action items rows 1, 4, 5, 6 with closing pointers |
| `_bmad-output/implementation-artifacts/6-0-smoke-evidence/` | NEW (directory) | AC6 + T7 Subtask 7.6 — smoke evidence dir for the lead-side smoke summary |

### Testing standards summary

- Run `cd web && npm test build-dist-layout` to scope to the new spec during dev iterations.
- Default sweep: `npm test` (web/) and `pytest -m "not slow"` (bake/). Story 6.0 adds web tests only; bake suite must remain unchanged.
- The Playwright-tier portion of `build-dist-layout.test.ts` MUST gate behind `describe.skipIf(!existsSync('web/dist/index.html'))` so a developer running `npm test` against a fresh `git clone` without `npm run build` first does not see a spurious failure.
- Run `cd web && npm run typecheck` and `npm run lint`; baseline is 0 errors / ≤ 4 warnings per AC5.

### Previous story intelligence (Story 5.0 / 5.4 carry-forward)

- **Story 5.0 BUG-006 regression test pattern** — `web/tests/build-dist-css-link.test.ts` (added during the cross-review fix) is the closest sibling to Story 6.0 AC1's test. Read it first to match the static-parse pattern; AC1 extends rather than duplicates it.
- **Story 5.4 AC1-cross-check pattern** — the AC2 dev-doc should cite Story 5.4's File List entries verbatim. Re-read `_bmad-output/implementation-artifacts/5-4-pbd-l4-playwright-visual-regression-suite.md` § AC1 for the canonical cross-check spec shape.
- **Cross-review discipline** — per the Epic 5 retro Lesson 4, the cross-review pass surfaces bugs per-story smokes can't, because each per-story smoke asserts what its story owns. AC1's layout-asserting test is the systematized version of cross-review's contribution.
- **Rule 5 amendments** — Story 6.0 may surface a spec-vs-implementation drift in the act of writing Rules 14 + 15 (e.g., if a draft of Rule 14 reveals an existing spec value with hidden arithmetic). Apply Rule 5 in-place if so; do NOT defer to a follow-up.

### Project Structure Notes

- Alignment: `web/tests/build-dist-layout.test.ts` parallels `web/tests/build-dist-css-link.test.ts` (Story 5.0); same vitest module-discovery pattern.
- Variance: `docs/visual-validation/` is a new dev-doc namespace; no existing convention to match, so adopt the existing `docs/adr/README.md` index-file pattern (write an `index.md` only if a second dev-doc lands here later — for Story 6.0 a single `update-snapshot-discipline.md` is sufficient).

### References

- Epic 5 retrospective — [_bmad-output/implementation-artifacts/epic-5-retro-2026-05-24.md](_bmad-output/implementation-artifacts/epic-5-retro-2026-05-24.md) § Action items (lines 150–162)
- Skill rules — [_bmad/custom/skill-rules.md](_bmad/custom/skill-rules.md) (Rules 1–13 are the canonical structure to mirror)
- Story 5.0 BUG-006 spec — [_bmad-output/implementation-artifacts/5-0-epic-4-deferred-cleanup.md](_bmad-output/implementation-artifacts/5-0-epic-4-deferred-cleanup.md) AC1 (BUG-006 dist drift investigation, parallel pattern for Story 6.0 AC1)
- Story 5.4 visual regression suite — [_bmad-output/implementation-artifacts/5-4-pbd-l4-playwright-visual-regression-suite.md](_bmad-output/implementation-artifacts/5-4-pbd-l4-playwright-visual-regression-suite.md) AC1 (`--update-snapshots` discipline source material)
- ADR-0010 — [docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md](docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md) (binding ADR for the Playwright-tier portion of AC1)
- Deferred-work routing — [_bmad-output/implementation-artifacts/deferred-work.md](_bmad-output/implementation-artifacts/deferred-work.md) (every Story 6.X / Epic 6 routing line is the source for triage table rows 9–26)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`, via `bmad-dev-story` skill under `/epic-cycle` (2026-05-24).

### Debug Log References

- Test-sweep output (full vitest sweep, post-implementation): **3349 passed / 10 skipped / 187 files** — up from 3343 baseline (+6 from `tests/build-dist-layout.test.ts`: 3 static-parse + 3 Playwright-tier). AC5's gate ≥3344 satisfied.
- Typecheck: clean (`tsc --noEmit` exit 0).
- Lint: 4 warnings / 0 errors — baseline preserved per AC5 (the 4 warnings are unrelated unused `eslint-disable` directives in `skybox.ts`, `ephemeris-service.ts`, `celestial-defense-extended.test.ts` — pre-existing across multiple stories).
- Bake fast pytest: **430 passed / 4 skipped / 24 deselected** — unchanged from Epic 5 baseline per AC5 (Story 6.0 is web-side + docs only; no bake changes).
- Dev-side advance smoke for AC1: `_bmad-output/implementation-artifacts/6-0-smoke-evidence/vitest-build-dist-layout-output.txt` — all 6 tests pass against the production build (current dist hash: `main-DvwfiT7_.css` + `main-_7JgsJtQ.js`).

### Completion Notes List

1. **Rule 5 amendment applied to AC1 in-place (2026-05-24).** Original AC1 wording referenced `/assets/index-*.css` and "inline `<style>` block emitted by `vite-plugin-feature-probe`". Both were spec-arithmetic drifts (Rule 14 — exactly the rule this story introduces):
   - Vite emits the CSS asset as `main-*.css` per `rollupOptions.input.main` entry (verified against `web/tests/build-dist-css-link.test.ts:27` + actual built `dist/index.html`).
   - The actually-emitted inline `<style>` is the Story 1.7 AC2 FOUC shim (`:root { --v-color-bg: ...; --v-color-fg: ...; --v-font-sans: ...; --v-font-size-body: ... }`). The `voyager:fallback-and-probe` plugin (named `vite-plugin-feature-probe` in the AC) substitutes a `<script>` placeholder, NOT a `<style>` tag.

   Amendment block embedded inline in AC1 (a) as an HTML comment preserving the original wording. Surfaced as a Rule 14 candidate in the same commit (the rule's first self-referential application).

2. **T1 test design — Playwright as a library inside vitest.** The story Dev Notes claimed "the project already does this in `web/tests/visual/`-adjacent specs" but actually existing visual specs use the `@playwright/test` runner (separate from vitest). Solved by:
   - Importing `chromium` from the `playwright` package (a transitive dep of `@playwright/test`).
   - Using `vite.preview()` programmatic API in `beforeAll` to spawn a free-port static server against `web/dist/`.
   - Tearing down browser + server in `afterAll`.
   - Gating both static-parse + Playwright tiers behind `describe.skipIf(!existsSync(ROOT_HTML))` so a fresh `git clone` running `npm test` doesn't see spurious failures.

3. **T1 synthetic regression case — `page.route()` interception over file-copy.** Original story spec proposed copying `dist/index.html` to a temp file with the CSS link stripped and serving from a second HTTP server. Chose Playwright's `page.route()` interception instead — it intercepts only the root HTML URL while letting all sub-resources (hashed JS, CSS) pass through normally. Simpler + faster + same coverage signal. The synthetic case verifies the CSS-link strip regex actually matched (throws on no-op replacement) so the test cannot pass falsely.

4. **T1 corner-collapse signal — looser invariants than the story spec.** AC1 (b) listed 5 specific `getBoundingClientRect()` invariants per corner. The implementation asserts each corner is "in its proper quadrant" (gutter thresholds at 200px / 100px for x / y respectively) rather than at exact pixel positions. This intentionally loose check tolerates child-element widths varying across viewport states (e.g., HUD-distance readouts widen as values populate) while binding the BUG-E5-007 failure mode (all corners collapse to viewport origin).

5. **T2 dev-doc — cross-referenced from skill-rules Rule 13 body via a new Story-6.0 paragraph.** AC2 wording said "a new sentence in Rule 13 or a new Rule, dev-agent's choice". Chose option (a) — extending Rule 13's body with a cross-reference paragraph titled "Cross-reference (Story 6.0, 2026-05-24)". Keeps Rules 14 + 15 reserved for the spec-arithmetic + forward-coherence content per AC3 + AC4.

6. **T4 forward-coupled-provisional section in deferred-work.md — established empty.** Epic 6 does not introduce any X.1-style multi-story foundation (Story 6.0 itself + Stories 6.1–6.6 are largely independent polish + a11y stories, not a multi-story API surface). The section's entry-format spec is in place for any future epic that introduces a Story-X.1 foundation; currently empty per Rule 15's "no entries yet" baseline.

7. **AC6 lead-side smoke (T7) is deferred per the spawn-prompt clarification.** The dev's role ends at T6; T7 is the lead's post-code-review gate. Dev-side advance evidence captured under `6-0-smoke-evidence/` for the lead's reference.

### ADR compliance verification (Rule 6)

Per AC5: only ADRs Story 6.0 actually touches are reviewed.

- **ADR-0010 (Chrome DevTools MCP agent-time + Playwright CI-time):** `web/tests/build-dist-layout.test.ts` uses Playwright as a CI-tier library, not as an agent-time DevTools surface — matches ADR-0010's split. The test lives at `web/tests/` (not `web/tests/visual/`), participates in vitest, and runs in CI alongside the L3 sweep. No Chrome DevTools MCP dependency.
- **ADR-0017 (GitHub Actions for build):** Story 6.0 adds no CI workflow changes. The new test runs in the existing L3 vitest job; the `web/dist/` directory the Playwright-tier depends on is built by the existing build-and-test job. No workflow file edits.
- **ADR-0019 (zero analytics + localStorage-only error capture):** Story 6.0 touches no analytics surface. N/A.
- **ADR-0027 (line-ending normalization for the new markdown file):** all new files committed in this story (`docs/visual-validation/update-snapshot-discipline.md`, `_bmad-output/implementation-artifacts/6-0-smoke-evidence/vitest-build-dist-layout-output.txt`) are written via tooling that produces LF line endings (Write tool defaults); `.gitattributes` `* text=auto eol=lf` rule applies; Windows checkout will not see CRLF in any committed text. Verified the test file imports use POSIX path separators (`'../dist'`, `'..'`) so the test runs identically on Linux CI and Windows dev.

### Rule compliance verification

- **Rule 5 (NFR tripwire):** applied in-place at AC1 with original-vs-amended wording preserved in an HTML comment block. No "work around in code comments + deferred-work.md" anti-patterns surfaced.
- **Rule 6 (ADR):** verified above. No ADR violations.
- **Rule 13 (test discoverability):** `build-dist-layout.test.ts` discoverable by default `npm test` sweep; matches vitest's default `*.test.ts` glob; no `.skip` / no env-gate / no opt-out flag. `describe.skipIf(!distAvailable)` is the canonical pattern Story 5.0's `build-dist-css-link.test.ts` established for production-build-dependent suites; CI's build-and-test job runs the build BEFORE the test sweep so the dist is present.

### File List

- **NEW:** `web/tests/build-dist-layout.test.ts` (T1 AC1)
- **NEW:** `docs/visual-validation/update-snapshot-discipline.md` (T2 AC2)
- **NEW:** `_bmad-output/implementation-artifacts/6-0-smoke-evidence/vitest-build-dist-layout-output.txt` (T7 advance evidence)
- **UPDATE:** `CONTRIBUTING.md` (T2 — added `## Visual validation` section)
- **UPDATE:** `_bmad/custom/skill-rules.md` (T2 — Rule 13 cross-reference paragraph; T3 — appended Rule 14; T4 — appended Rule 15)
- **UPDATE:** `_bmad-output/implementation-artifacts/deferred-work.md` (T4 — added `## Forward-coupled provisional definitions` section header)
- **UPDATE:** `_bmad-output/implementation-artifacts/epic-5-retro-2026-05-24.md` (T5 — annotated Action items table rows 1, 4, 5, 6)
- **UPDATE:** `_bmad-output/implementation-artifacts/6-0-epic-5-deferred-cleanup.md` (Rule 5 amendment to AC1; this Dev Agent Record)

### Change Log

| Date | Change |
|---|---|
| 2026-05-24 | Dev (Claude Opus 4.7) — implemented T1–T6 end-to-end; applied Rule 5 amendment to AC1 (CSS asset prefix + inline `<style>` source-of-truth corrections); full test sweep 3349/10 (+6); typecheck clean; lint 4 warnings (baseline preserved); bake fast pytest 430/4 (unchanged); status `ready-for-dev` → `review`. T7 (lead-side smoke) deferred per spawn-prompt clarification. |
| 2026-05-24 | Code review (Claude Opus 4.7) — three-layer adversarial sweep (Blind Hunter + Edge Case Hunter + Acceptance Auditor) against the Story 6.0 diff (5 modified + 7 new files; net +82 / -7 lines across UPDATE files; ~700 lines new files). **0 HIGH / 1 MED auto-resolved / 1 LOW auto-resolved / 2 LOW deferred** to `deferred-work.md` under "Story 6.0 / LOW" entries. Rule-3 EXEMPT verified (process/discipline/cleanup; no `web/src/` touches confirmed via `git status` — zero matches against `^.. web/src/`). Rule 5 amendment block at AC1 (story line 34) verified faithful: original wording preserved verbatim inside the HTML-comment block; corrections cite source files (`web/tests/build-dist-css-link.test.ts:27` for `main-*` prefix, `vite.config.ts` voyager:fallback-and-probe plugin name); derivation clear. Rule 14 + Rule 15 header parity verified against Rules 8–13 structure (statement, **Why this rule exists today**, **Enforcement**, **Examples** all present; `## Rule N — Title (applies to ...)` format matches). AC1 test re-verified passing after MED auto-resolve (vitest run: 6/6 tests pass in 5.00s against the production build). Triage table cross-checked exhaustive vs Epic 5 retro Action items (8 rows = retro count) and vs `deferred-work.md` Epic-6-routed entries (18 rows). ADR-0010 + ADR-0017 + ADR-0019 + ADR-0027 compliance re-verified (lead's binding smoke gate is the canonical handoff). Status remains `review` pending lead's AC6 smoke. |

## Review Findings (code review, 2026-05-24)

**Reviewer:** Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`, via `bmad-code-review` skill under `/epic-cycle` (2026-05-24).
**Diff source:** working tree (staged + unstaged + untracked) on branch `epic6` vs `HEAD = 9f5142a`.
**Scope:** 5 modified files (CONTRIBUTING.md, deferred-work.md, epic-5-retro-2026-05-24.md, sprint-status.yaml, _bmad/custom/skill-rules.md) + 7 new files (web/tests/build-dist-layout.test.ts, web/tests/story-6-0-cross-reference-defense.test.ts, docs/visual-validation/update-snapshot-discipline.md, _bmad-output/implementation-artifacts/{6-0-epic-5-deferred-cleanup.md, 6-0-smoke-evidence/vitest-build-dist-layout-output.txt, cycle-log-epic-6.md, tests/test-summary-6-0.md}).
**Verdict:** **APPROVED PENDING AC6 LEAD SMOKE.** 0 HIGH findings; 1 MED + 1 LOW auto-resolved inline; 2 LOWs deferred to `deferred-work.md`.

### Rule compliance verification (review-side)

- **Rule 1 (Integration AC):** Escape clause declared at story line 98 ("Integration ACs declaration (Rule 1 escape clause)") is sound. Story 6.0 introduces no service / module / shared component; the four work items are project-discipline gates whose consumers are future `bmad-create-story` and `npm test` runs. No future named consumer story is required. **PASS.**
- **Rule 3 (Smoke evidence):** **Rule-3 EXEMPT** genuinely. Story 6.0 is a pure process / discipline / cleanup story — no `web/src/` touches confirmed via `git status | grep "^.. web/src/"` (zero matches). The dev's `build-dist-layout.test.ts` exercises the production build via Playwright-as-a-library; the QA's `story-6-0-cross-reference-defense.test.ts` pins cross-reference rot defense; both run under vitest's default `npm test` sweep. No user-facing surface = no per-story Chrome DevTools MCP smoke required per Rule 3. **PASS.**
- **Rule 5 (NFR tripwire response):** The dev's Rule 5 amendment to AC1 (story line 34) is faithful. HTML-comment block preserves the original wording verbatim ("inline `<style>` block emitted by `vite-plugin-feature-probe`" and "`/assets/index-*.css`"). Both corrections cite the source-of-truth files (`build-dist-css-link.test.ts:27` for the `main-*` asset prefix; `vite.config.ts` for the `voyager:fallback-and-probe` plugin name = "`vite-plugin-feature-probe`"). The amendment surfaces as a Rule 14 candidate (the rule's first self-referential application). **PASS.**
- **Rule 6 (ADR violations):** Dev's Dev Agent Record verifies ADR-0010 (Chrome DevTools MCP agent-time / Playwright CI-time split honored — Playwright is used as a CI-tier library inside vitest), ADR-0017 (no CI workflow changes), ADR-0019 (no analytics surface touched), ADR-0027 (LF line endings on new files via `.gitattributes` `* text=auto eol=lf`). No ADR violations surfaced during review. **PASS.**
- **Rule 13 (Test discoverability):** Both new test files (`build-dist-layout.test.ts`, `story-6-0-cross-reference-defense.test.ts`) live under `web/tests/`, match vitest's default `*.test.ts` glob, have no `.skip` / no env-gate / no opt-out flag. The `describe.skipIf(!distAvailable)` gate is the canonical Story 5.0 / Story 3.7 slow-tier pattern for production-build-dependent suites. **PASS.**

### Rule 14 + Rule 15 structure parity verification (specific focus #1)

Verified against Rules 8–13 canonical structure:

- **Rule 14** at skill-rules.md:215: `## Rule N — Title (applies to <skill>)` header format **matches**. Body contains statement → "separate fact sources that historically drift" enumeration → **Why this rule exists today** (Story 5.2 incident) → **Enforcement** (bmad-create-story scope; bmad-code-review explicitly NOT to police) → **When this rule fires** → **Examples** (4 acceptable/unacceptable cases including the Rule-5+Rule-14 closure pattern). Structure matches Rules 8–13 — particularly Rule 11 and Rule 12 in length and section density.
- **Rule 15** at skill-rules.md:237: header format **matches**. Body contains statement → **Why this rule exists today** (Story 5.1 / 5.3 `composite_active` incident) → **How to apply (bmad-create-story authoring Story X.1)** stanza → **How to apply (bmad-create-story authoring Story X.Y consumer)** stanza → **Enforcement** → **Examples**. Two-stanza How-to-apply is novel vs Rules 8–13 (none of them have separate producer/consumer stanzas) but the section split is justified by Rule 15's intrinsic two-actor structure (X.1 author + X.Y consumer) and matches the rule's stated semantics.
- Cross-reference from Rule 13's body (skill-rules.md:213) to `docs/visual-validation/update-snapshot-discipline.md` resolves correctly (relative path `../../docs/visual-validation/...` from `_bmad/custom/skill-rules.md`).

**PASS.**

### AC1 test robustness verification (specific focus #2)

- **Synthetic missing-CSS-link case:** the dev's test deliberately reproduces BUG-E5-007 via `page.route()` interception that strips the `<link rel="stylesheet">` tag from the served HTML. The strip regex includes a sanity-check `throw` if the substitution is a no-op (line 439), so the test cannot pass falsely. Smoke evidence captured at `_bmad-output/implementation-artifacts/6-0-smoke-evidence/vitest-build-dist-layout-output.txt` shows the test PASSES (6/6 tests in 4.79s) — proving the synthetic case observes ≥3 of the 4 right/bottom violations.
- **Code-review MED #1 (AUTO-RESOLVED):** the synthetic-case violation counter had an empty `if` body at lines 495–498 for the top-left check, silently dropping that signal. After review: the original empty body was a recognition that under BUG-E5-007 `top-left.left = 0` trivially passes the happy-path `< 200` check (the corner is structurally unable to fail the way the other three can). The original branch was intent-bearing but undocumented; the fix preserves the original semantics, documents the asymmetry inline, AND adds a null-rect sanity probe so the top-left signal is captured for the missing-rect failure mode (was previously fully dead). Re-verified: 6/6 tests still pass post-fix (vitest run 5.00s).
- **HUD-landmark bounding-rect thresholds:** the `< 200` left-gutter and `< 100` top-band thresholds are intentionally loose (test file lines 290–296 document the rationale). They tolerate per-corner child widths varying across viewport states (60–180 px for distance/attitude/date readouts) while binding the BUG-E5-007 failure mode (corner collapses to viewport origin). The `var(--v-edge-margin)` canonical value is 24 px per `tokens.css`; the thresholds are ~8× that margin which is generous but binding for the load-bearing collapse signal.

**PASS** (after MED #1 auto-resolved).

### Cross-reference defense tests (specific focus #3)

The 17 QA tests in `story-6-0-cross-reference-defense.test.ts` are appropriately scoped:

- **5 tests for AC3 + AC4** (skill-rules.md Rule 14 + Rule 15 headers): exact-header regex matches; incident citations (Story 5.2 50×/100× and Story 5.1/5.3 `composite_active`) load-bearing.
- **5 tests for AC2** (dev-doc + cross-references): existence + skill-rules.md cross-ref + CONTRIBUTING.md `## Visual validation` section + CONTRIBUTING.md cross-ref + four-content-areas pin.
- **3 tests for AC4** (Forward-coupled provisional definitions section in deferred-work.md): section header + Story 6.0 anchor + Rule 15 cross-reference.
- **2 tests for AC6 / T5** (Epic 5 retro closure annotations): ≥4 `Closed by Story 6.0 (2026-05-24)` markers.
- **2 tests for triage table integrity**: Action items #2 → 6.2, #3 → 6.6, #7 → 6.5, #8 → 6.2-or-6.6.

None tautological: each test asserts on specific committed text that a docs reorg or skill-rules renumbering could silently break. The two-test split for AC6 / triage routing intentionally separates "closure markers exist" from "specific routings stay correct" — both can fail independently. Pattern matches Story 4.8's `web/tests/visual-validation-docs.test.ts` precedent. **PASS.**

### Rule 5 amendment in AC1 (specific focus #4)

Already covered under Rule 5 compliance above. The HTML-comment block at story line 34 preserves the original wording verbatim ("vite-plugin-feature-probe" + `/assets/index-*.css`); corrections cite both source files (`build-dist-css-link.test.ts:27` and `vite.config.ts`); the amendment self-references Rule 14 as the rule's first self-application — closing the loop the dev articulated in Completion Note #1. **PASS.**

### Triage table exhaustiveness (specific focus #5)

- Story 6.0 § "Triage Table" has 26 rows: rows 1–8 cover the 8 Epic 5 retro Action items (matched 1:1 to `epic-5-retro-2026-05-24.md:152–162`); rows 9–26 cover Epic-6-routed `deferred-work.md` entries.
- Cross-check against `deferred-work.md` Routing lines: every entry with `Routing: ... Story 6` or `Routing: ... Epic 6` phrasing appears in the triage table. The story's broader inclusion (e.g., LOWs routed to "Story 6.X" / "Epic 6 polish" / "Epic 6 hygiene" with non-canonical phrasings) is faithful to the spec author's reading of "Epic-6-shaped landings" — no drift detected.
- The QA's cross-reference defense file pins the four canonical retro-action routings (rows 2/3/7/8 → Story 6.2/6.6/6.5/6.2-or-6.6) as a permanent vitest invariant against future drift in either the story file OR `deferred-work.md`.

**PASS.**

### Web/src/ touch verification (specific focus #6)

`git status --short | grep "^.. web/src/"` returns zero matches. Story 6.0's promise of "no `web/src/` changes" is verified. The dev's File List enumerates only `web/tests/` (test file), `docs/` (dev-doc), `_bmad/custom/` (skill-rules update), `CONTRIBUTING.md` (cross-reference), and `_bmad-output/` (implementation artifacts) — all confirmed in working tree. **PASS.**

### Auto-resolved findings

**MED — Synthetic regression case had a dead `if` branch (top-left violation check)**

- **File:** `web/tests/build-dist-layout.test.ts:495-498` (pre-fix).
- **Issue:** The synthetic missing-CSS-link case counted violations from top-right.right, bottom-left.bottom, bottom-right.right, bottom-right.bottom (4 measurable collapse signals) but the `if` body checking `top-left.left >= 200` was empty (comment only). The narrative comment ("at least three of the four right/bottom thresholds fail") and the assertion `≥3` were consistent under the working signal set, but the empty branch dropped the top-left null-rect sanity probe.
- **Resolution (inline):** Replaced the empty branch with a documented intent-bearing block that (a) explains the asymmetry (`top-left.left = 0` trivially passes the happy-path `< 200` check under BUG-E5-007 — the corner is structurally unable to fail the way the others can), (b) preserves the original semantic (do NOT count `top-left.left` as a violation), (c) captures the missing-rect signal (`if rects!.topLeft === null` → push `top-left-missing`). The ≥3 violation threshold is unchanged; the defense surface is strictly stronger than pre-fix.
- **Re-verification:** 6/6 tests still pass in 5.00 s vitest run.

**LOW — Stale `voyager-skill-rules.md` reference in NEW dev-doc**

- **File:** `docs/visual-validation/update-snapshot-discipline.md:7` (pre-fix).
- **Issue:** The dev-doc's frontmatter callout referenced `voyager-skill-rules.md` (old/stale filename); the canonical file in the project is `_bmad/custom/skill-rules.md` (per `_bmad/custom/bmad-code-review.toml` persistent_facts and per `Glob` of `_bmad/custom/*.md`). The reference is dead: no `voyager-skill-rules.md` exists in the tree.
- **Note:** The same stale name appears in 88 other files across the repo, including `CONTRIBUTING.md:78` (PRE-EXISTING, not Story 6.0-introduced — that line was part of the original Story 5.0 LFS-disclosure section). The widespread drift is a separate cleanup beyond Story 6.0 scope (see deferred LOW #1 below).
- **Resolution (inline):** Changed line 7 of the NEW dev-doc to reference `_bmad/custom/skill-rules.md` with the full canonical path. The Story-6.0-introduced contribution to the drift is now zero.

### Deferred findings

**LOW — `voyager-skill-rules.md` widespread reference rot across the repository** (DEFERRED — pre-existing, not Story 6.0 introduced)

- **Scope:** 88 files reference `voyager-skill-rules.md` (a filename that does not exist; canonical is `_bmad/custom/skill-rules.md`). Includes `CONTRIBUTING.md:78`, planning artifacts under `_bmad-output/`, story files for Stories 1.x–5.x, test summaries, `THIRD_PARTY.md`, `README.md`, multiple `web/tests/*.test.ts`, multiple `docs/adr/*.md`, etc.
- **Why deferred:** out of scope for Story 6.0 (process/discipline/cleanup focused on Epic 5 retro action items). A repo-wide find/replace + cross-reference audit deserves its own scoped story (likely Epic 7 ADR-housekeeping / docs cleanup pass) so that any stale links to a now-renamed-or-deleted target are surfaced in the same audit rather than mass-rewritten blindly.
- **Documented in:** `deferred-work.md` under "Story 6.0 review / LOW" entry.

**LOW — `build-dist-layout.test.ts` CSS-link strip regex assumes trailing whitespace** (DEFERRED — defense already sufficient)

- **Scope:** `web/tests/build-dist-layout.test.ts:432-435`. The regex `/<link\s+rel="stylesheet"\s+(?:crossorigin\s+)?href="\/assets\/main-[^"]+\.css">\s*/` requires a trailing `\s*` after `>`. If a future Vite plugin emits the `<link>` tag at the end of a minified single line with no trailing whitespace, the regex won't match.
- **Why deferred:** the test has a sanity-check `throw` (line 439–443) that fires if the substitution is a no-op — so the failure mode is LOUD ("CSS-link strip regex did not match — defense test cannot prove regression coverage"). A future Vite minification change would surface this immediately. Defense-in-depth is adequate; the regex tightening is a hypothetical-future hardening, not a present defect.
- **Documented in:** `deferred-work.md` under "Story 6.0 review / LOW" entry.
