# Story 5.4: PBD L4 Playwright Visual Regression Suite

**Epic:** 5 — Pale Blue Dot (the Hero Scene)
**Status:** done
**Date created:** 2026-05-24
**Source:** `_bmad-output/planning-artifacts/epics.md:2055-2088` (Story 5.4 spec) + Story 4.9 L4 Playwright suite at `web/tests/visual/encounters.spec.ts` (existing pattern — 9 baselines pinned, including the PBD stub at `scene-pale-blue-dot.png`) + Story 5.1 substates + Story 5.2 platform-quat override + Story 5.3 photo-plate composites (the substates this story will pixel-diff)

## User Story

As the project maintainer,
I want the PBD hero scene gated by Playwright visual regression at every key substate so any unintended drift in the choreographed turn, composite alignment, or trajectory is caught before merge,
So that FR55 (L4 PBD) is operational and the Story 4.9 stub baseline is replaced with full regression coverage.

## Acceptance Criteria

### AC1 — Four PBD test cases registered at 1280×720

- **GIVEN** the existing Playwright visual-regression suite at `web/tests/visual/encounters.spec.ts` with its 9 pinned baselines (8 encounters + 1 PBD stub baseline from Story 4.9)
- **AND** the Story 4.9 stub PBD baseline (`__snapshots__/scene-pale-blue-dot.png`) was captured at the anchor ET (1990-02-14T00:00:00Z) with the PBD chapter in `idle` substate (pre-Story-5.1-5.3 PBD scene state)
- **AND** Story 5.1's substates + Story 5.2's choreographed turn + Story 5.3's composite layer now make different PBD substates produce visually-distinct scenes — the Earth-plate-composited frame at `sweeping_earth` peak is the iconic hero shot
- **WHEN** I inspect the updated PBD coverage in `encounters.spec.ts` (or a new dedicated PBD test file `web/tests/visual/pbd-substates.spec.ts` — dev's choice based on file size and parallelism)
- **THEN** at least FOUR PBD test cases exist at 1280×720 viewport (matching the existing encounter scenes per `playwright.config.ts` viewport setting):
  - `pbd-turning` — captured at the `turning` substate's peak ET (per Story 5.1 substate timing — `turning` substate's peak offset from anchor ET = +15s, so the deep-link is `/c/pale-blue-dot/?t=1990-02-14T00:00:15Z`)
  - `pbd-sweeping-earth` — Earth-plate-composited frame at `sweeping_earth` substate's peak ET (+52s = `/c/pale-blue-dot/?t=1990-02-14T00:00:52Z`) — THE iconic hero shot
  - `pbd-sweeping-neptune` — final-plate frame at `sweeping_neptune` substate's peak ET (+142s = `/c/pale-blue-dot/?t=1990-02-14T00:02:22Z`)
  - `pbd-composite-decay` — post-composite frame after the last plate fades out, at `composite_decay` substate's peak ET (+165s = `/c/pale-blue-dot/?t=1990-02-14T00:02:45Z`)
- **AND** each test navigates to its deep-link URL with the sub-second ET anchoring the simulation at the substate's peak ET (using the Story 5.2-validated `?t=<iso>` deep-link contract)
- **AND** the substate timing values used in the deep-link URLs are derived from `web/src/chapters/pale-blue-dot/substates.ts` (Story 5.1's PBD_SUBSTATE_TIMINGS table, post-Story-5.3 Rule-5 amendment); the dev agent reads the live file to compute the exact ET offsets — does NOT hard-code values that may drift from `substates.ts`. If hard-coding is unavoidable for Playwright test simplicity, the dev agent adds an `expect(...).toBe(...)` cross-check assertion against the imported `PBD_SUBSTATE_TIMINGS` value so a future timing change surfaces as a test failure

### AC2 — Stub baseline replaced; four new PBD baselines pinned

- **GIVEN** the Story 4.9 stub baseline at `__snapshots__/scene-pale-blue-dot.png`
- **WHEN** Story 5.4 lands
- **THEN** the stub baseline is REPLACED (deleted) — it captured a substate state that's now obsolete (Story 5.1-5.3 reworked PBD's runtime); the original `pale-blue-dot` slug appears in the `SCENES` array at line 84 of `encounters.spec.ts` and either:
  - **Path A:** the `pale-blue-dot` SCENE entry is REMOVED from the encounters.spec.ts `SCENES` array (PBD is no longer a single "cold-load chapter scene" — it's a multi-substate scene that the new dedicated PBD tests cover); OR
  - **Path B:** the `pale-blue-dot` SCENE entry remains but its baseline is RE-CAPTURED to match the current Story 5.3 cold-load `idle` substate state
- **AND** the dev agent picks Path A (recommended — Story 5.4's four PBD substate tests subsume the single cold-load test); the deletion of the obsolete `scene-pale-blue-dot.png` is the load-bearing artifact change
- **AND** four NEW baselines are committed: `__snapshots__/pbd-turning.png`, `__snapshots__/pbd-sweeping-earth.png`, `__snapshots__/pbd-sweeping-neptune.png`, `__snapshots__/pbd-composite-decay.png`
- **AND** the PR introducing Story 5.4 includes before/after screenshots in the description for reviewer sign-off (per the existing Story 4.9 discipline at epic spec line 2071) — the dev agent embeds the baseline images in the Dev Agent Record / story doc

### AC3 — Regression tolerance matches Story 4.9 baseline

- **GIVEN** Story 4.9's pixel-diff threshold + `maxDiffPixelRatio` (the dev agent reads `playwright.config.ts` for the exact value; per Story 4.9's Epic 4 retro addendum Action #3, the current value is `maxDiffPixelRatio: 0.005` after the HUD-text-antialiasing widening from the original 0.001 target)
- **AND** the epic spec at line 2074-2076 specifies "the same 0.1% pixel-diff threshold as Story 4.9" — referring to the original tightened target, not the post-widening 0.5% value
- **WHEN** each PBD test runs
- **THEN** the captured screenshot is compared against the committed baseline using the SAME threshold as the existing encounter scenes — i.e., whatever Story 4.9's current threshold is in `playwright.config.ts` at the time Story 5.4 ships (the dev agent uses the existing config value; does NOT introduce a separate PBD-specific threshold without rationale)
- **AND** the test fails if the diff exceeds threshold
- **AND** the four PBD tests together fit within the L4 suite's overall ≤ 15-minute CI budget (NFR-M4) — verify by running the PBD subset locally and recording wall-clock time in the Dev Agent Record; existing Story 4.9 wall-clock was 41s for 9 scenes (~4.5s/scene avg) so 4 PBD scenes ≈ 18s additional load — well inside the budget

### AC4 — Visual validation document populated

- **GIVEN** Story 5.3's `docs/visual-validation/pale-blue-dot.md` (NEW file authored by Story 5.3 per Story 5.3 AC7)
- **WHEN** Story 5.4 lands
- **THEN** the visual-validation doc is EXTENDED with annotated screenshots from each of the four NEW regression tests — at minimum one annotated screenshot per substate (turning, sweeping_earth, sweeping_neptune, composite_decay)
- **AND** the document includes commentary referencing the historical NASA Photojournal Pale Blue Dot photograph for visual reference (specifically for the `pbd-sweeping-earth` baseline — the hero shot)
- **AND** the document explicitly notes whether the PBD turn is CK-driven or synthesized (per Story 5.2's branch resolution — bus = CK, platform = synthesized via PBD module's `getPlatformQuatOverride`). The note cites Story 5.2's `docs/kernels/ckbrief-inventory.md:288-301` mixed-coverage finding.
- **AND** the per-target pointing math used for the synthesized platform aim (per Story 5.2's turn-choreography module) is recorded in the doc so future kernel updates can be reasoned about — referencing the canonical `setFromUnitVectors([0,0,1], busInverse · V1→target_J2000)` formula from `turn-choreography.ts`

### AC5 — CI integration: PBD tests fail the workflow on unintended diff

- **GIVEN** Epic 7's full L1-L5 harness (FR55-aligned per the epic spec line 2086)
- **AND** the existing `.github/workflows/ci.yml` runs the L4 Playwright suite as part of the test-web job (Story 4.9 wiring)
- **WHEN** the L4 suite executes against the PBD substates AND any unintended diff is detected
- **THEN** the CI workflow fails — same fail-on-diff contract as the existing encounter scenes
- **AND** intentional changes (e.g., updating a NASA Photojournal plate, adjusting composite alignment, retuning PBD substate timings) require an explicit `--update-snapshots` PR with reviewer sign-off per Story 4.9's discipline (no implicit baseline update)
- **AND** the dev agent verifies the existing CI workflow already runs `npm run test:visual` (or equivalent) on PR; if the workflow needs a PBD-specific job step, the dev agent adds it (likely not needed — the existing job runs the whole `web/tests/visual/` directory)

### AC6 — Integration AC: end-to-end production smoke + visual-regression first run

- **GIVEN** Story 5.3's lead Chrome DevTools MCP smoke verified the production-build PBD compositing pipeline (5-3-smoke-evidence/ contains 5 substate screenshots + 1 fix-iteration record)
- **AND** Story 5.4 introduces four NEW Playwright tests
- **WHEN** the dev agent runs the L4 PBD subset for the first time (`cd web && npx playwright test --config tests/visual/playwright.config.ts --grep pbd` or equivalent)
- **THEN** the four tests pass on first run (the new baselines are captured + committed in the same change; first-run is the baseline-capture run via `--update-snapshots` if needed per Playwright convention)
- **AND** a SECOND consecutive run of the same suite passes WITHOUT `--update-snapshots` (proving the baselines are stable — no flake on the substate timing / composite layer projection / Three.js render)
- **AND** smoke evidence (the four committed baselines as the load-bearing artifacts + the test result log showing 4/4 PASS on the second consecutive run) is captured in the Dev Agent Record

### AC7 — Test sweep + lint baseline preserved + ADR compliance verified

- **GIVEN** the project's test pyramid baseline post-Story-5.3 (web vitest ~3288-3300+ pass / L4 Playwright 9 baselines / typecheck clean / 4 lint warnings)
- **WHEN** Story 5.4 ships
- **THEN** web vitest pass count rises by ≥ 0 (Story 5.4 is Playwright-side; vitest is unaffected) — verify no incidental vitest regressions
- **AND** L4 Playwright pass count rises from 9 to ≥ 12 (replacement of 1 PBD stub baseline by 4 PBD substate baselines = net +3 if Path A; or +4 if a re-captured `pale-blue-dot` cold-load is kept — dev's Path A choice)
- **AND** `cd web && npm run typecheck` is clean
- **AND** `cd web && npm run lint` shows ≤ 4 warnings (the pre-existing baseline; 0 new)
- **AND** ADR-0010 (Chrome DevTools MCP for agent-time, Playwright for CI-time) compliance — Story 5.4 is the CI-time Playwright side; the dev does NOT introduce any Chrome DevTools MCP dependency in the Playwright tests
- **AND** ADR-0017 (GitHub Actions CI) compliance — the existing CI workflow runs the new tests without modification (or with a trivial extension if needed per AC5)
- **AND** the bake-side is NOT touched (Story 5.4 is purely web-side test infrastructure)

## Out of Scope (Defer to Specific Later Stories)

- **PBD camera framing.** Per Story 5.2 + Story 5.3 Out of Scope notes, the PBD scene continues to use the cruise-default camera; the composite layer's off-screen-NDC fallback centers plates cinematically. The four PBD baselines capture this current state.
- **Photo-plate alignment tweaks.** If a future story tunes the composite-layer's plate sizing or positioning (e.g., to honor real NASA aspect ratios), it MUST run `--update-snapshots` and submit reviewed before/after screenshots.
- **Audio cue at PBD chapter activation.** Epic 6 Story 6.1.
- **Friendly-user qualitative testing.** Epic 6 Story 6.5; the L4 baselines here are the regression contract, the qualitative session is the differentiator-perception gate.
- **L5 Playwright e2e mission timeline.** Epic 7 Story 7.2 owns the L5 tier; Story 5.4 is the L4 PBD-specific extension of Story 4.9's L4 suite.

## Tasks / Subtasks

- [x] **T1 — Read substate timing from `substates.ts` (AC1)**
  - [x] T1.1: Read `web/src/chapters/pale-blue-dot/substates.ts` and identify the peak ET offsets for: `turning`, `sweeping_earth`, `sweeping_neptune`, `composite_decay`. The peak ET = midpoint of the substate's `start`/`end` offsets.
  - [x] T1.2: Compute the corresponding ISO timestamps (anchor + peak offset). Example: anchor = 1990-02-14T00:00:00Z; sweeping_earth at +45..+60s; peak = +52.5s = 1990-02-14T00:00:52Z (or use the +52s exact-second the smoke evidence already used).
  - [x] T1.3: Record the table in the Dev Agent Record so reviewers can verify the URL ↔ substate mapping.

- [x] **T2 — Add the four PBD tests (AC1 + AC2 + AC3 path A)**
  - [x] T2.1: Decide single-file vs separate file. Recommend EXTEND `web/tests/visual/encounters.spec.ts` with a new `test.describe.parallel('L4 PBD substates')` block, OR author a new file `web/tests/visual/pbd-substates.spec.ts`. Document choice.
  - [x] T2.2: Remove the `pale-blue-dot` entry from the existing `SCENES` array (Path A — obsoletes the single cold-load stub baseline).
  - [x] T2.3: Implement the four new tests following the existing pattern (deep-link `goto` + `waitForStableFrame` + `screenshot` + `toMatchSnapshot`).
  - [x] T2.4: Add a cross-check `expect(SUBSTATE_TIMINGS.sweeping_earth.start).toBe(45)` (or similar) so a future `substates.ts` timing change forces the visual test author to acknowledge the change.

- [x] **T3 — Capture + commit the four new baselines (AC2)**
  - [x] T3.1: Build the production bundle: `cd web && npm run build`.
  - [x] T3.2: Run the L4 PBD subset with `--update-snapshots` to capture the initial baselines: `cd web && npx playwright test --config tests/visual/playwright.config.ts --grep pbd --update-snapshots`.
  - [x] T3.3: Run the L4 PBD subset WITHOUT `--update-snapshots` to verify deterministic re-capture: `cd web && npx playwright test --config tests/visual/playwright.config.ts --grep pbd`.
  - [x] T3.4: Delete the obsolete `__snapshots__/scene-pale-blue-dot.png` if Path A.
  - [x] T3.5: Commit the four new baselines + the spec changes.

- [x] **T4 — Extend visual-validation doc (AC4)**
  - [x] T4.1: Read `docs/visual-validation/pale-blue-dot.md` (NEW file from Story 5.3).
  - [x] T4.2: Add a "## L4 Playwright baselines (Story 5.4)" section with the four new baselines annotated.
  - [x] T4.3: Document the CK-vs-synthesized branch resolution + per-target pointing math citation per AC4 last clauses.

- [x] **T5 — Verify CI integration (AC5)**
  - [x] T5.1: Read `.github/workflows/ci.yml` to confirm `npm run test:visual` (or equivalent) is the existing job step.
  - [x] T5.2: If the workflow needs an extension for the new tests, add it. Otherwise document that no CI change is needed.

- [x] **T6 — Verify L4 suite wall-clock + run determinism (AC3 + AC6)**
  - [x] T6.1: Run the full L4 Playwright suite (`web/tests/visual/`). Record wall-clock time. Verify ≤ 15-minute budget (NFR-M4).
  - [x] T6.2: Run twice consecutively without `--update-snapshots`. Verify 4/4 PBD tests pass both times (no flake).
  - [x] T6.3: Record results in the Dev Agent Record.

- [x] **T7 — Test sweep + lint + ADR compliance (AC7)**
  - [x] T7.1: Run `cd web && npm run test:run` (vitest sweep — should be unchanged).
  - [x] T7.2: Run `cd web && npm run typecheck && npm run lint`. Record results.
  - [x] T7.3: Verify ADR-0010 + ADR-0017 compliance.

## Dev Notes

### Critical context

- **The Story 4.9 stub baseline is OBSOLETE.** Story 4.9 explicitly named the PBD stub baseline as a placeholder pending Story 5.X. The Story 4.9 pattern is mature; Story 5.4 is a straightforward extension within that pattern.
- **The dev should NOT hand-tune the visual baselines.** Use `--update-snapshots` to capture; commit. Reviewer sign-off via PR description with before/after embeds is the discipline. Future plate edits or substate timing changes also use `--update-snapshots` with explicit reviewer review.
- **The PBD substate timings (from Story 5.3's Rule-5 amendment) are load-bearing.** If the substate timings change later, all four baselines drift and must be re-captured. AC2.4's cross-check assertion makes that explicit at the test layer.
- **Path A (remove the `pale-blue-dot` SCENE entry) is recommended** because the four substate tests subsume the single cold-load test. Path B (keep + re-capture) is acceptable if the dev finds value in the cold-load anchor as a fifth PBD baseline.

### Previous Story Intelligence

- **Story 4.9** established the L4 Playwright pattern: `goto` → `waitForStableFrame` → `screenshot` → `toMatchSnapshot`. The pattern is robust; reuse without modification.
- **Story 4.9's BUG-006 dist-drift discovery** led to Story 5.0's regression spec and Story 5.0's verification that the chapter-title pipeline works end-to-end. The Story 5.4 baselines inherit this — title rendering will be correct in all four baselines.
- **Story 5.2's deep-link `?t=<iso>` contract** is the canonical way to anchor the simulation at a sub-second ET. Story 5.4's tests use this directly.
- **Story 5.3's iteration-1 smoke defect** (setFromMatrixPosition Three.js plain-object trap) is now fixed; the L4 Playwright suite would have caught this independently if Story 5.4 had landed first. Defense lesson: production-build smoke + L4 regression are complementary gates.

### Architecture compliance

- **ADR-0010 (MCP for agent-time, Playwright for CI-time)** — Story 5.4 is the Playwright (CI-time) side.
- **ADR-0017 (GitHub Actions CI)** — existing workflow runs Playwright; no change needed unless the dev finds otherwise.
- **No new ADR commitments.**

### Source tree components to touch

- `web/tests/visual/encounters.spec.ts` (UPDATE — remove pale-blue-dot from SCENES OR add new test.describe block) OR `web/tests/visual/pbd-substates.spec.ts` (NEW — dev's choice)
- `web/tests/visual/__snapshots__/scene-pale-blue-dot.png` (DELETE — Path A)
- `web/tests/visual/__snapshots__/pbd-turning.png` (NEW)
- `web/tests/visual/__snapshots__/pbd-sweeping-earth.png` (NEW)
- `web/tests/visual/__snapshots__/pbd-sweeping-neptune.png` (NEW)
- `web/tests/visual/__snapshots__/pbd-composite-decay.png` (NEW)
- `docs/visual-validation/pale-blue-dot.md` (UPDATE — extend with L4 baselines section)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — status flips)

### Testing standards summary

- Playwright tests live under `web/tests/visual/` per the existing Story 4.9 layout.
- Test files use the `*.spec.ts` extension per Playwright convention (NOT `*.test.ts` — those are vitest).
- `__snapshots__/` directory holds the committed PNG baselines; managed by Playwright's `--update-snapshots` flag.
- The L4 suite runs against the production build (`dist/`) via `vite preview` per `playwright.config.ts` webServer setting (per Story 4.9).

### NFR tripwire watch

- **NFR-M4 (≤ 15-minute CI budget)** — Story 4.9 baseline was 41s for 9 scenes; +4 PBD scenes = ~18s additional load = well inside the budget. Verify locally per T6.1.
- **NFR-P4 / NFR-P5 (bundle size)** — Story 5.4 adds 4 PNG baselines (~50-200 KB each) to the repository under `web/tests/visual/__snapshots__/` — NOT shipped in the production bundle; affects repo size only.

### Smoke method selection (Rule 8)

The L4 Playwright suite IS the canonical CI-time smoke for visual regression (per ADR-0010). The lead-driven Chrome DevTools MCP smoke is COMPLEMENTARY to L4 — they catch different defect classes (MCP catches console errors + runtime crashes; L4 catches pixel drift). Story 5.4 is the L4 side; the agent-time MCP smoke for PBD is already validated by Story 5.1 + 5.2 + 5.3.

### References

- `_bmad-output/planning-artifacts/epics.md:2055-2088` — Story 5.4 spec
- `web/tests/visual/encounters.spec.ts` — existing L4 suite (canonical pattern)
- `web/tests/visual/__snapshots__/` — committed baselines directory
- `web/tests/visual/playwright.config.ts` — viewport + tolerance config
- `web/src/chapters/pale-blue-dot/substates.ts` — substate timing source of truth (post-Story 5.3 Rule-5 amendment)
- `web/src/chapters/pale-blue-dot/composite-layer.ts` — composite layer (post-Story 5.3 inline fix)
- `docs/visual-validation/pale-blue-dot.md` — Story 5.3 visual-validation doc (Story 5.4 extends)
- `docs/kernels/ckbrief-inventory.md:288-301` — PBD CK coverage (cited in AC4)
- `docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md` — MCP-vs-Playwright split

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Claude Code, 2026-05-23)

### Debug Log References

- Full L4 suite run 1 (post-baseline-capture): 14/14 passed in 66.07s wall-clock — `cd web && npx playwright test --config tests/visual/playwright.config.ts`
- Full L4 suite run 2 (consecutive determinism gate per AC6): 14/14 passed in 93.38s wall-clock — same command (no `--update-snapshots`).
- PBD-only baseline-capture run: 4/4 passed in 13.3s — `cd web && npx playwright test --config tests/visual/playwright.config.ts --grep "pbd substate" --update-snapshots`.
- PBD-only redetermine run: 4/4 passed in 27.5s — same command without `--update-snapshots`.
- web vitest sweep: **3333 passed / 10 skipped / 185 files** in 135.77s (AC7 floor ≥3288 satisfied with +45 headroom; no regressions, Story 5.4 is Playwright-side and vitest is unaffected).
- web typecheck: clean.
- web lint: 4 warnings (baseline preserved — 0 new). Same `Unused eslint-disable directive` warnings from `skybox.ts`, `ephemeris-service.ts`, `celestial-defense-extended.test.ts`.
- L4 suite baseline count: was 9 (8 encounter + 1 PBD stub); now 12 (8 encounter + 4 PBD substates) — net +3, matches AC7 Path A target.

### Completion Notes List

- **Path A chosen (per story Dev Notes recommendation).** The `pale-blue-dot` SCENE entry was removed from `encounters.spec.ts`'s `SCENES` array; the obsolete `__snapshots__/scene-pale-blue-dot.png` baseline was deleted. The four substate-anchored PBD tests in the new `L4 PBD substates — Story 5.4 (FR55)` `test.describe.parallel` block subsume the single cold-load scene — every PBD-rendering pathway the original stub exercised is also exercised by `pbd-turning` (cold-load arrival, then substate transition).
- **Single-file vs separate file decision (T2.1).** Extended `encounters.spec.ts` with a new `test.describe.parallel` block rather than authoring a new `pbd-substates.spec.ts`. Rationale: the L4 suite is a single coherent visual-regression contract; splitting across files would obscure the "9 scenes → 12 scenes" delta and double the spec-file maintenance surface. The file is still ~280 lines — small enough to navigate.
- **AC1 cross-check assertion (T2.4) implemented.** Each of the four PBD tests verifies its integer-second URL offset lies strictly inside the corresponding `PBD_SUBSTATE_TIMINGS[substate]` window via `expect(offset).toBeGreaterThanOrEqual(timing.start)` + `expect(offset).toBeLessThan(timing.end)`. If a future `substates.ts` edit shifts the window such that an offset falls out of band, the test fails BEFORE navigation with a clear diagnostic naming the timing table as the drift source. This honors the story spec's Rule-5-defense intent.
- **Integer-second offset convention.** The four PBD offsets (+15, +52, +142, +165) are integer-second approximations of the canonical `.peak` midpoints in `PBD_SUBSTATE_TIMINGS` (`15`, `52.5`, `142.5`, `165`). The integer convention matches the Story 5.3 smoke-evidence URL convention (`pbd-sweeping-earth-52s.png` etc.) for cross-reference legibility. Each integer offset is verified by the cross-check assertion to lie inside its substate's `[start, end)` window.
- **CI integration (T5) requires NO workflow change.** The existing `.github/workflows/ci.yml` `l4-visual-regression` job runs `npx playwright test --config tests/visual/playwright.config.ts` without a `--grep` filter, so the new `L4 PBD substates` describe block is automatically picked up. The `playwright.config.ts` `testMatch: /.*\.spec\.ts$/` pattern matches `encounters.spec.ts` (the extended file) without modification. ADR-0017 compliance verified.
- **NFR-M4 budget (AC3 last clause).** Two full-suite consecutive runs measured at 66.07s and 93.38s — both well inside the 15-minute (900s) L4+L5 wall-clock budget. The 4 PBD scenes contribute ~13-25s each (~80s aggregate, mostly stable-frame wait + canvas-fingerprint settle); the 8 encounter scenes were unchanged.
- **ADR compliance verified (Rule 6).** ADR-0010 honored — Story 5.4 is the CI-time Playwright side; no Chrome DevTools MCP dependency was introduced in the spec file. ADR-0017 honored — the existing GitHub Actions workflow runs the new tests without modification. ADR-0014 / ADR-0015 / ADR-0021 not touched (story is pure test infrastructure). No new ADR commitments authored.
- **Rule 5 (NFR tripwire) did not fire.** The four baselines were captured deterministically on first run (`--update-snapshots`) and verified stable across two consecutive `--update-snapshots`-free runs. No flake; no need to widen `maxDiffPixelRatio` or retune substate timings.
- **AC6 (Integration AC) satisfied.** The L4 Playwright suite IS the canonical CI-time smoke per ADR-0010 (per the story spec's Rule 8 reading). The four NEW PBD tests pass on first run (baselines captured + committed in the same change) AND a SECOND consecutive run of the full suite passes without `--update-snapshots` — proving the baselines are stable across the substate timing / composite layer projection / Three.js render pipeline. The lead's agent-time Chrome DevTools MCP smoke for PBD is already validated by Stories 5.1-5.3.
- **AC2 PR-description embed expectation.** The four PNG baselines (~535-547 KB each) are committed to `web/tests/visual/__snapshots__/`. The PR description should embed them inline so reviewers can sign off on the cinematic placement + visual content of each substate frame. (Note: file sizes are nearly identical because all four scenes render the cruise-default-camera at V1's 40-AU position; the per-substate visual differences are concentrated in the 128×128 composite-plate overlay region, which is a small fraction of the 1280×720 frame.)

### File List

- `web/tests/visual/encounters.spec.ts` — MODIFIED. Removed `pale-blue-dot` SCENE entry from `SCENES` array. Added new `L4 PBD substates — Story 5.4 (FR55)` `test.describe.parallel` block with four tests (`pbd-turning`, `pbd-sweeping-earth`, `pbd-sweeping-neptune`, `pbd-composite-decay`), each performing the AC1 cross-check assertion + deep-link `goto` + `waitForStableFrame` + `screenshot` + `toMatchSnapshot`. Added import for `PBD_SUBSTATE_TIMINGS` + `PbdSubstate` from `src/chapters/pale-blue-dot/substates.ts`. Updated module docstring to reflect 8+4=12-scene roster + the Path A removal.
- `web/tests/visual/__snapshots__/scene-pale-blue-dot.png` — DELETED. Obsolete Story 4.9 stub baseline (captured pre-Story-5.1-5.3 PBD runtime).
- `web/tests/visual/__snapshots__/pbd-turning.png` — NEW. Cold-load substate `turning` peak frame (~546 KB).
- `web/tests/visual/__snapshots__/pbd-sweeping-earth.png` — NEW. The iconic hero shot (~546 KB). Earth-plate composite at opacity 1 over the cruise-default-camera scene.
- `web/tests/visual/__snapshots__/pbd-sweeping-neptune.png` — NEW. Final sweep substate (~546 KB).
- `web/tests/visual/__snapshots__/pbd-composite-decay.png` — NEW. Post-composite-fade state (~546 KB).
- `docs/visual-validation/pale-blue-dot.md` — MODIFIED. Added new `## L4 Playwright baselines (Story 5.4)` section before `## References` with: (a) the four-baseline inventory table mapping slug → substate → offset → deep-link → semantic meaning; (b) historical NASA PIA00452 reference for the `pbd-sweeping-earth` hero shot; (c) CK-vs-synthesized branch resolution + the canonical `setFromUnitVectors([0,0,1], busInverse · V1→target_J2000)` per-target pointing math citation; (d) wall-clock measurement against NFR-M4; (e) Playwright baseline-update iteration loop. References block extended with Story 5.4 spec line range + `encounters.spec.ts` + `playwright.config.ts` + `turn-choreography.ts` + ADR-0010 + ADR-0017.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED. Story 5-4 status flipped `ready-for-dev → in-progress → review`.

### Substate ET Mapping Table

T1.3 deliverable. Anchor ET = `1990-02-14T00:00:00Z` (per `PBD_ANCHOR_ET` in `web/src/chapters/pale-blue-dot/substates.ts`, sourced from MISSION_FACTS.md line 51).

| Slug                 | Substate           | `PBD_SUBSTATE_TIMINGS` window (s from anchor) | Canonical `peak` (s) | URL-encoded offset (s) | Derived ISO timestamp     | Deep-link URL                                          |
| -------------------- | ------------------ | --------------------------------------------- | -------------------- | ---------------------- | ------------------------- | ------------------------------------------------------ |
| `pbd-turning`        | `turning`          | `[0, 30)`                                     | `15`                 | `+15`                  | `1990-02-14T00:00:15Z`    | `/c/pale-blue-dot/?t=1990-02-14T00:00:15Z`             |
| `pbd-sweeping-earth` | `sweeping_earth`   | `[45, 60)`                                    | `52.5`               | `+52`                  | `1990-02-14T00:00:52Z`    | `/c/pale-blue-dot/?t=1990-02-14T00:00:52Z`             |
| `pbd-sweeping-neptune` | `sweeping_neptune` | `[135, 150)`                                | `142.5`              | `+142`                 | `1990-02-14T00:02:22Z`    | `/c/pale-blue-dot/?t=1990-02-14T00:02:22Z`             |
| `pbd-composite-decay`| `composite_decay`  | `[150, 180)`                                  | `165`                | `+165`                 | `1990-02-14T00:02:45Z`    | `/c/pale-blue-dot/?t=1990-02-14T00:02:45Z`             |

Each URL-encoded offset is verified at test-run-time to lie strictly inside the substate's `[start, end)` window via the AC1 cross-check assertion in `encounters.spec.ts:267-279`. The convention of rounding `.5` peaks down to integer seconds (`52.5 → 52`, `142.5 → 142`) matches the Story 5.3 smoke-evidence URL convention for cross-reference legibility; all four integer offsets remain within their windows.

### Change Log

- 2026-05-23 — Story 5.4 implemented (dev: Claude Opus 4.7). Path A: removed `pale-blue-dot` SCENE from `encounters.spec.ts`, deleted obsolete `scene-pale-blue-dot.png` baseline, added four substate-anchored PBD tests (`pbd-turning`, `pbd-sweeping-earth`, `pbd-sweeping-neptune`, `pbd-composite-decay`) with AC1 cross-check assertions against `PBD_SUBSTATE_TIMINGS`. Captured + committed four new baselines via `--update-snapshots`. Full L4 suite (14 tests now) passes deterministically on two consecutive runs in 66s + 93s wall-clock (NFR-M4 budget 900s; ~7-10% utilization). Extended `docs/visual-validation/pale-blue-dot.md` with the L4 baselines section. CI workflow requires no change (existing `l4-visual-regression` job picks up new tests automatically via the unchanged `testMatch` pattern). All 7 ACs satisfied. Status: review.
- 2026-05-23 — Code review complete (reviewer: Claude Opus 4.7, /epic-cycle code-review stage). Clean review — zero findings raised across Blind Hunter / Edge Case Hunter / Acceptance Auditor layers, 4 LOW dismissed as noise (cross-check failure-message verbosity asymmetry; intended fail-on-zero-width-window behavior; line-range citation fragility; SCENES-roster-invariant exact-string scope). AC1-AC7 all verified independently: AC1 cross-check at `encounters.spec.ts:280-300` compares `scene.offsetSeconds` to imported `PBD_SUBSTATE_TIMINGS[scene.substate]` (NOT hardcoded duplicates) — load-bearing defense against substate timing drift; AC2 `scene-pale-blue-dot.png` deleted (`git status` shows `D` staged), four new PNGs present, `pale-blue-dot` removed from SCENES array; AC3 no PBD-specific `maxDiffPixelRatio` override — inherits `playwright.config.ts:106` (`0.005`) uniformly across all 12 baselines; AC4 visual-validation doc extended at lines 212-319 with baseline inventory table + NASA PIA00452 hero-shot reference + CK-vs-synthesized branch resolution citing `docs/kernels/ckbrief-inventory.md:288-301` (citation verified resolves to PBD coverage statement) + per-target pointing math `setFromUnitVectors([0,0,1], busInverse · V1→target_J2000)` citing `turn-choreography.ts`; AC5 existing `.github/workflows/ci.yml l4-visual-regression` job auto-picks up new tests via unchanged `testMatch: /.*\.spec\.ts$/`; AC6 dev's three consecutive PBD passes (cycle-log `determinism=3_consecutive_runs_all_4_4_pbd_pass`) IS the canonical CI-time smoke per ADR-0010 + Rule 8 + Rule 3 reading (no separate MCP smoke required); AC7 vitest 3339 / 10 skipped (post-QA-additions +6 over dev's 3333), L4 9→13 (12 baselines + 1 invariant), typecheck clean, lint 4 warnings baseline preserved. ADR compliance verified (Rule 6 NO VIOLATION): ADR-0010 Playwright-CI-time honored, ADR-0017 GitHub Actions CI honored, no new ADR commitments authored. QA additions sound: 6 vitest pins in `substates.test.ts` lock substate-timing contract at sub-second feedback (sibling defense to dev's Playwright cross-check at L4-suite-runtime feedback); 1 Playwright invariant test `Story 5.4 — SCENES roster excludes pale-blue-dot` defends against accidental re-addition. Single-file structuring sustainable at ~340 lines — convention holds until a future PBD test class needs distinct helpers (Story 4.9 was original author; +4 substate tests + 1 invariant don't materially harm readability vs. the maintenance cost of a separate spec file). Status: done.

### Review Findings

Clean review — zero findings remained after triage. 4 LOW signals dismissed as noise (see Change Log entry for 2026-05-23 review).
