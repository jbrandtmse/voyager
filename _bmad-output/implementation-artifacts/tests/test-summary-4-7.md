# Story 4.7 Test Automation Summary — V2 Uranus / V2 Neptune (Triton Bend FR12) QA Gap Hunting

## Story / Stage

- **Story:** 4.7 — V2 Uranus and V2 Neptune encounter chapters (Triton bend FR12, FR30 closure)
- **Stage:** `bmad-qa-generate-e2e-tests` under `/epic-cycle`
- **Date:** 2026-05-23

## Generated Tests

### Unit / Integration (web vitest)

- `web/tests/story-4-7-v2u-v2n-qa-gaps.test.ts` — 52 tests, 8 describe blocks (one per gap-hunting priority) + 1 documentation block for the Chrome DevTools MCP smoke plan.

### Chrome DevTools MCP smoke

Lead-driven per Rule 7 (sub-agents inherit harness tool inventory; ADR-tooled AC verifications live on the lead). The QA-gap test file's terminal `describe` block documents the canonical smoke probe plan and the per-AC coverage matrix. Evidence directory: `_bmad-output/implementation-artifacts/4-7-smoke-evidence/` (created during the lead's smoke; no initScript shim needed post-Story-1.16 per Rule 8).

## Gap Coverage

| Gap | Priority                                                  | Test count | Defends against |
| --- | ---------------------------------------------------------- | ---------- | --------------- |
| 1   | MISSION_FACTS.md citation regex audit (V2U/V2N)            | 8          | Editorial copy edited but citation surface not (Story 4.5/4.6 pattern extended to V2U + V2N). |
| 2   | V2N FR12 quantitative-deflection defense pin               | 4          | Editorial copy inventing a quantitative Triton-deflection angle (degrees/radians/etc.) without a primary-source citation. Story 4.6 gap-7 (V1S deflection) pattern repeated for V2N. |
| 3   | V2U Miranda 29,000 km altitude pin (both surfaces)         | 4          | Editorial copy and citation surface diverging on the canonical altitude; pins Stone & Miner + Smith et al. *Science* 233 (1986) citations. |
| 4   | V2N Triton 39,800 km altitude pin (both surfaces)          | 4          | Same shape — pins Smith et al. *Science* 246 (1989) + NASA SP-525 citations. |
| 5   | defaultFraming inequalities across all 6 gas giants        | 8          | Accidental copy-paste of V2J / V1S / V1J offsets over V2U or V2N; pins satellite-system-scale hierarchy V2U < V2N < V1S ≈ V2S; V2U < V1J ≈ V2J; also pins the six-chapter complete-spec invariant for FR30 closure. |
| 6   | copyForChapter dispatch coverage across all 6 chapters     | 11         | Story 4.6 gap-5 enumeration drift; now all six gas-giant encounters resolve to non-null copy. Pinned exact-membership invariants for `ALL_CHAPTERS.filter(c => c.copy)` and `ALL_CHAPTERS.filter(c => c.defaultFraming)` as FR30-closure defense pins. |
| 7   | Uranian + Neptunian moon NAIF ID correctness               | 5          | The dev's flagged draft-time typo (Cordelia=706 collision). Pins canonical moon-to-NAIF mapping for the ten new Uranian moons (706-715), Perdita (725), the five major Uranian moons (701-705), and the six new Neptunian moons (803-808). Also verifies no NAIF ID collisions inside each section. |
| 8   | MISSION_FACTS.md V2U/V2N primary-source citation defense   | 7          | Soderblom et al. *Science* 250 (1990) primary citation for Triton geyser plumes; secondary-source aggregators (Wikipedia, space.com, etc.) blocked; ISO-8601 timestamp format drift; at-least-N primary-citation anchors per section. |
| MCP | Chrome DevTools MCP smoke plan (Rule 3 + Rule 8)            | 1          | Per-story smoke evidence as exit criterion; lead-driven; per-AC coverage matrix in the docstring. |
| **Total** |                                                      | **52**     | |

## Discoverability

Web vitest's default glob (`*.test.ts`) picks up the new file automatically — no skip markers, no opt-in env-var gating. The file lives under `web/tests/` (one tier up from `web/src/`) alongside the dev's extended `v2j-v1s-v2s-encounters-end-to-end.test.ts` integration AC file and the predecessor QA-gap tests (`story-4-5-v1j-encounter-qa-gaps.test.ts`, `story-4-6-v2j-v1s-v2s-qa-gaps.test.ts` — naming convention preserved).

## Baseline / Delta

| Metric         | Before Story 4.7 QA | After Story 4.7 QA | Delta |
| -------------- | -------------------: | -----------------: | -----: |
| Test files     | 169                  | 170                | +1     |
| Tests passed   | 3005                 | 3057               | +52    |
| Tests skipped  | 2                    | 2                  | 0      |
| Typecheck      | clean                | clean              | —      |
| Lint           | 4 warnings (baseline) | 4 warnings (baseline) | 0   |

Note: a single unrelated test (`src/services/clock-manager.test.ts` — Story 1.10 AC7 NFR-P2 perf budget, 50ms tick limit) flaked at 50.14ms during the full sweep but passed on re-run with no changes. This flake is pre-existing and not caused by Story 4.7 QA work; it is a known perf-tier wall-clock sensitivity (NFR-P6 lesson per voyager-skill-rules.md Rule 5).

(Story 4.7 dev cycle landed +48/+2 files vs. Story 4.6; this QA cycle adds +52/+1 on top. Combined Story 4.7 dev+QA delta vs. Story 4.6: +100 tests / +3 files.)

## FR30 Closure Defense

Two test patterns explicitly defend the FR30 closure invariant ("all six gas-giant encounters carry ±5d windows + copy + defaultFraming"):

1. **Gap 5 final test** — iterates the six populated chapters and asserts each carries a complete spec triple (copy.lede + copy.body + defaultFraming.offsetKm[3] + 10-day window). Regression here means FR30 partially un-closed.
2. **Gap 6 final two tests** — exact-set assertions on `ALL_CHAPTERS.filter(c => c.copy !== undefined)` and `ALL_CHAPTERS.filter(c => c.defaultFraming !== undefined)`. Adding a populated chapter (Story 5.x?) or losing one will surface immediately at this defense pin.

## Test Quality Notes

- **Real-stack assertions, not mocks.** Gap 6 mounts a real `<v-chapter-copy>` against a real `ChapterDirector × ALL_CHAPTERS`; gaps 1/3/4/7/8 read the live `MISSION_FACTS.md`.
- **Boundary-condition coverage.** Gap 5 asserts non-zero magnitudes AND distinct tuples AND magnitude-ordering invariants AND complete-spec-triple invariants. Gap 7 enforces both presence (each moon-NAIF mapping documented) AND no-collision (each NAIF ID appears exactly once).
- **Clear failure messages.** Every `expect(...)` that could fail in a non-obvious way passes a custom message ("V2N body matches /\\d+\\s*degree/ — quantitative deflection angle without primary-source citation"; "V2U [...] and V2J [...] are identical — accidental copy-paste?") so the failure is self-explaining.
- **No order dependency.** Each `describe` block stands alone; the shared `MISSION_FACTS_CONTENT` constant is read once at module load and never mutated; `afterEach` cleans up DOM elements mounted by Gap 6.
- **Markdown-form-tolerant regexes.** Moon-NAIF assertions tolerate both bare `Moon (NNN)` and bold-emphasised `**Moon** (NNN)` forms (Perdita uses the bold form); annotated `(715, the largest...)` form (Puck) is also accepted. The exactly-once collision test counts table-row vs. parenthetical-enumeration occurrences correctly.

## Smoke Probe Plan (lead-driven)

Documented in the test file's terminal `describe` block. Five MCP tool calls per chapter (navigate, evaluate_script for window/copy/camera/target-mesh/spacecraft-mesh + V2U attitude-indicator regime checks, screenshot, snapshot, console-clean assertion) plus the canonical V2N Triton-bend sub-probe at 1990-06-01 heliocentric framing (FR12 — AC4). The end-of-mission 2030 annotated screenshot remains a Story 4.8 deliverable per the chapter spec docstring.

Evidence directory: `_bmad-output/implementation-artifacts/4-7-smoke-evidence/`.

## Issues / Iteration

- Two iteration rounds: first run produced two regex-pattern mismatches inside Gap 7 (Uranian NAIF IDs). Resolution:
  1. Puck's enumeration form includes annotation `(715, the largest of the ten, discovered earliest at 30 December 1985)`. Initial regex required `(715)` literal; updated to accept `(715[,)]` so both bare and annotated forms match.
  2. Perdita's enumeration form is markdown-bold-emphasised: `**Perdita** (725)`. Initial regex required `\s*` between moon name and `(`; updated to `\*{0,2}\s*` to permit markdown bold delimiters.
- No Rule-5 tripwires surfaced during gap hunting. The dev's AC4 Rule-5 analysis (V2N Triton-bend window-edge contradiction) is internally consistent per the dev's docstring; Gap 2 defends the qualitative-only framing.
- No HALT triggered.

## Next Steps

- The lead drives the AC8 Chrome DevTools MCP smoke against the dev server using the probe plan documented in this file's MCP block + the story's `## Smoke probe plan (AC8)` section. The V2N Triton-bend sub-probe at 1990-06-01 is the new evidence pattern; V2U attitude-indicator regime observation (expect "CK reconstructed" throughout per dev CK audit) is the other new sub-probe.
- Story 4.8 (gravity-assist visual validation) consumes the Story 4.7 V2N anchor as its canonical FR12 screenshot anchor.
- Story 4.9 (Playwright visual regression baselines) uses V2U + V2N anchors as two of the eight pinned scenes.
- FR30 is now closed at the content tier; no further encounter-chapter content surface stories are pending.
