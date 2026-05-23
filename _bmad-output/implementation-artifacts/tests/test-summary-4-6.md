# Story 4.6 Test Automation Summary — V2 Jupiter / V1 Saturn (Titan Slingshot) / V2 Saturn QA Gap Hunting

## Story / Stage

- **Story:** 4.6 — V2 Jupiter, V1 Saturn (Titan Slingshot), V2 Saturn encounter chapters
- **Stage:** `bmad-qa-generate-e2e-tests` under `/epic-cycle`
- **Date:** 2026-05-23

## Generated Tests

### Unit / Integration (web vitest)

- `web/tests/story-4-6-v2j-v1s-v2s-qa-gaps.test.ts` — 42 tests, 8 describe blocks (one per gap-hunting priority) + 1 documentation block for the Chrome DevTools MCP smoke plan.

### Chrome DevTools MCP smoke

Lead-driven per Rule 7 (sub-agents inherit harness tool inventory; ADR-tooled AC verifications live on the lead). The QA-gap test file's terminal `describe` block documents the canonical smoke probe plan and the per-AC coverage matrix. Evidence directory: `_bmad-output/implementation-artifacts/4-6-smoke-evidence/` (created during the lead's smoke; no initScript shim needed post-Story-1.16 per Rule 8).

## Gap Coverage

| Gap | Priority                                          | Test count | Defends against |
| --- | -------------------------------------------------- | ---------- | --------------- |
| 1   | MISSION_FACTS.md citation regex audit (V2J/V1S/V2S) | 7          | Editorial copy edited but citation surface not (post-Story-4.5 pattern extended to three chapters). |
| 2   | Rule-5 PRD amendment defense (V2J = Io, not Amalthea) | 4          | Future regression re-introducing "Amalthea" in V2J body OR PRD wording; also pins MISSION_FACTS "V2 did NOT make a close pass" rationale. |
| 3   | V1S Titan flyby distance pin (6,490 km in both surfaces) | 4          | Editorial copy and citation surface diverging on the canonical altitude; a more-precise primary-source update would force both to change together. |
| 4   | defaultFraming scale-up justification              | 6          | Accidental copy-paste of V1S offset over V2J (Jupiter-scale vs. Saturn-scale framings); also pins current V1S=V2S equality so a future differentiation is intentional. |
| 5   | copyForChapter dispatch coverage (V1J/V2J/V1S/V2S) | 7          | Story 4.5's gap-8 enumeration drift; now four chapters populated, six still null/heliopause-routed. Real `<v-chapter-copy>` mount via ChapterDirector. |
| 6   | Integration test coverage symmetry                 | 4          | Helper-driven describe blocks (V2J/V1S/V2S via `runChapterIntegration(fixture)`) accidentally double-dispatching same chapter or losing per-chapter assertions; also pins the chronological ordering. |
| 7   | V1S deflection-angle gap defense (dev's Issue 3)   | 3          | Editorial copy inventing a quantitative deflection angle (degrees/radians) without a primary-source citation. |
| 8   | MISSION_FACTS.md V1S/V2S extensions cite primary sources | 5          | Wikipedia or secondary-aggregator citations entering the file; ISO-8601 timestamp format drift; absence of NASA SP-451 / *Science* 212/215 / Smith et al. / Tyler et al. anchor citations. |
| MCP | Chrome DevTools MCP smoke plan (Rule 3 + Rule 8)   | 1          | Per-story smoke evidence as exit criterion; lead-driven; per-AC coverage matrix in the docstring. |
| **Total** |                                              | **42**     | |

## Discoverability

Web vitest's default glob (`*.test.ts`) picks up the new file automatically — no skip markers, no opt-in env-var gating. The file lives under `web/tests/` (one tier up from `web/src/`) alongside the dev's `v2j-v1s-v2s-encounters-end-to-end.test.ts` integration AC file and Story 4.5's QA-gap test (`story-4-5-v1j-encounter-qa-gaps.test.ts` — naming convention preserved).

## Baseline / Delta

| Metric         | Before Story 4.6 QA | After Story 4.6 QA | Delta |
| -------------- | -------------------: | -----------------: | -----: |
| Test files     | 166                  | 167                | +1     |
| Tests passed   | 2915                 | 2957               | +42    |
| Tests skipped  | 2                    | 2                  | 0      |
| Typecheck      | clean                | clean              | —      |
| Lint           | 4 warnings (baseline) | 4 warnings (baseline) | 0   |

(Story 4.6 dev cycle landed +58/+4 files vs. Story 4.5; this QA cycle adds +42/+1 on top. Combined Story 4.6 dev+QA delta vs. Story 4.5: +100 tests / +5 files.)

## Test Quality Notes

- **Real-stack assertions, not mocks.** Gap 5 mounts a real `<v-chapter-copy>` against a real `ChapterDirector × ALL_CHAPTERS`; gap 2's PRD pin reads the live planning artifact; gaps 1/2/3/7/8 read the live `MISSION_FACTS.md`.
- **Boundary-condition coverage.** Gap 4 asserts both magnitude bounds (non-zero, distinct across chapters) AND the current V1S=V2S identity invariant (with a comment that intentional differentiation must update this test); gap 7 uses multiple regex patterns to defend against several invented-angle phrasings.
- **Clear failure messages.** Every `expect(...)` that could fail in a non-obvious way passes a custom message ("V2J copy mentions ${dateStr} but ${iso} is not cited in MISSION_FACTS.md") so the failure is self-explaining.
- **No order dependency.** Each `describe` block stands alone; the shared `MISSION_FACTS_CONTENT` and `PRD_CONTENT` constants are read once at module load and never mutated.

## Smoke Probe Plan (lead-driven)

Documented in the test file's terminal `describe` block. Five MCP tool calls per chapter (navigate, evaluate_script for window/copy/camera/mesh-frustum checks, screenshot, snapshot, console-clean assertion) plus a V1S slingshot bend sub-probe at 1981-01-01. Evidence directory: `_bmad-output/implementation-artifacts/4-6-smoke-evidence/`.

## Issues / Iteration

- Two iteration rounds: first run produced two regex-pattern mismatches against MISSION_FACTS (line-wrap between "a" and "close" required `\s+` instead of literal space; italic-asterisk between `Science*` and `212` required `\*?` before the whitespace). Both fixed; final 42/42 pass.
- No Rule-5 tripwires surfaced during gap hunting. The dev's Rule-5 amendment (V2J Amalthea → Io) is now defended by gap 2; the dev's Issue 3 (no quantitative deflection angle) is now defended by gap 7.
- No HALT triggered.

## Next Steps

- The lead drives the AC8 Chrome DevTools MCP smoke against the dev server using the probe plan documented in this file's MCP block + the story's `## Smoke probe plan (AC8)` section.
- Story 4.7 (V2U / V2N) will follow the same pattern; the `story-4-7-*-qa-gaps.test.ts` file should reuse the regex audit + dispatch-coverage skeleton from this file.
