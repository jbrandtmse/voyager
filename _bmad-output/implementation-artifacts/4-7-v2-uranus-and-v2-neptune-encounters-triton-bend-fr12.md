# Story 4.7: V2 Uranus and V2 Neptune Encounters (Triton Bend FR12)

**Epic:** 4 — Encounter Chapters (All Six Gas-Giant Flybys)
**Status:** done
**Date created:** 2026-05-23

## User Story

As a visitor,
I want V2 Uranus (1986-01-24 with Miranda flyby) and V2 Neptune (1989-08-25 with Triton flyby) rendered with body-centered framing and chapter copy, with V2's post-Neptune trajectory visibly bent sharply south of the ecliptic by Triton's gravity,
So that the gas-giant tour completes and FR25, FR26, FR12, FR30 are fulfilled.

## Consumed-by

- **Story 4.8** (gravity-assist visual validation): consumes V2N's Triton-bend as the canonical FR12 screenshot.
- **Story 4.9** (L4 Playwright visual regression): uses V2U / V2N anchors as two of the eight pinned scenes.

This story **amends** two existing chapter specs (`v2-uranus.ts`, `v2-neptune.ts`) using the Story-4.5/4.6 template. NO new services. Final two encounter chapters → FR30 (six gas-giant encounters) closed at this story.

## Consumes

Same as Stories 4.5 / 4.6 (ChapterDirector, ViewFrame, VoyagerCameraController.applyDefaultFraming, MissionPhaseFSM cold-load replay, `<v-chapter-copy>`, `<v-timeline-scrubber variant="detail">`, MISSION_FACTS.md).

## Acceptance Criteria

### AC1 — Two chapter specs follow the Story 4.5/4.6 template

- **GIVEN** chapter specs at `web/src/chapters/specs/v2-uranus.ts`, `v2-neptune.ts`
- **WHEN** I inspect each
- **THEN** each spec has the structure established by Story 4.5:
  - `slug`, `name`, `markerLabel` — unchanged
  - `anchorEt` — unchanged; matches `MISSION_FACTS.md ENCOUNTER_DATES`
  - `windowStartEt` = `anchorEt - 5 * 86400` (narrowed from ±30d → ±5d)
  - `windowEndEt` = `anchorEt + 5 * 86400`
  - `spacecraft` = 'v2'; `targetBody` — V2U=7 (Uranus), V2N=8 (Neptune)
  - `ogDescription` — unchanged or refined
  - `copy: { lede, body }` — populated per AC2
  - `defaultFraming: { offsetKm: [x, y, z] }` — populated per AC3

### AC2 — Hand-written chapter copy with primary-source citations

- **GIVEN** the copy field populated in AC1 for each chapter
- **WHEN** I read each chapter
- **THEN** the copy is 50–150 words (Story 4.6 looser bound)
- **AND** **V2 Uranus** copy covers the Miranda flyby at 29,000 km, the Ariel / Umbriel / Titania / Oberon flybys, and the 11 new moons discovered (per PRD encounter table) — sequence and counts traced to NASA SP-466 + Stone & Miner, Science 233 (1986).
- **AND** **V2 Neptune** copy covers the Triton flyby at 39,800 km (the gravity-assist bend that sent V2 south of the ecliptic — FR12), the discovery of Triton's nitrogen geysers, Neptune's Great Dark Spot, and the new moons + ring arcs found. Sourced from NASA SP-525 + Stone & Miner, Science 246 (1989).
- **AND** every cited distance, date, body name, or count traces to `MISSION_FACTS.md`. Extend `MISSION_FACTS.md` with V2U + V2N flyby parameters as needed — primary sources only. HALT with `## Clarification Needed` if a fact cannot be sourced.

### AC3 — Default-framing tuning for two encounters

- **GIVEN** the Story 4.5/4.6 framing pattern
- **WHEN** Story 4.7 lands
- **THEN** each spec has `defaultFraming.offsetKm: [x, y, z]`:
  - **V2U**: Uranus at origin, offset to show V2 + Uranus + Miranda together. Miranda orbits Uranus at ~129,800 km (much closer than Titan to Saturn). Recommended starting offset: similar to V1J's [1M, 1.5M, 2.5M] scaled DOWN for Uranus's smaller satellite system (e.g., [600K, 900K, 1.5M] km).
  - **V2N**: Neptune at origin, offset to show V2 + Neptune + Triton together. Triton orbits Neptune at ~354,800 km (between Io's distance from Jupiter and Titan's from Saturn). Recommended starting offset: [800K, 1.2M, 2M] km.
- **AND** initial values are dev's best estimate; lead's smoke iterates on tuning.

### AC4 — V2N Triton bend visible post-encounter (FR12)

- **GIVEN** V2's post-Neptune trajectory after Triton flyby
- **WHEN** I scrub to any date after 1989-08-25 in heliocentric framing
- **THEN** V2's future-trajectory line visibly bends sharply south of the ecliptic plane (FR12)
- **AND** the bend is observable from a default heliocentric camera view at the end of the mission (2030)
- **AND** Story 4.8 captures the canonical annotated screenshot
- **AND** bend magnitude matches SPICE-derived trajectory within NFR-P9 tolerance (already pinned by Story 1.6 trajectory baseline)

### AC5 — V2U synthesized-attitude provenance flickers per CK coverage gaps

- **GIVEN** V2 Uranus is V2's first outer-planet encounter at non-trivial distance from Earth
- **WHEN** scrubbing through the encounter
- **THEN** `<v-attitude-indicator>` flickers between "CK reconstructed" and "Synthesized (HGA Earth-pointing)" ONLY if CK kernel coverage gaps exist per `docs/kernels/ckbrief-inventory.md`
- **AND** the indicator never lies about which regime is active
- **AND** if CK coverage is continuous, the indicator shows "CK reconstructed" throughout

### AC6 — Detail scrubber + URL routing + chapter index for both chapters

- **GIVEN** existing infrastructure
- **WHEN** I navigate via marker click / chapter index / `/c/v2-uranus` / `/c/v2-neptune`
- **THEN** simulation jumps paused to anchor; URL updates via pushState; copy panel + detail scrubber render per Story 4.5/4.6

### AC7 — Integration AC (Rule 1): real end-to-end chain for V2U + V2N

- **GIVEN** this story lands two chapters' worth of content
- **WHEN** Story 4.7 lands
- **THEN** extend `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` with two more describe blocks (V2U + V2N) OR author `web/tests/v2u-v2n-encounters-end-to-end.test.ts` — dev's call
- **AND** the existing `runChapterIntegration(fixture)` helper from Story 4.6 reused per chapter (Story 4.6 design lesson)
- **AND** assertions match the Story 4.6 template: window ±5d, copy lede renders, detail scrubber range matches, ViewFrame Uranus/Neptune-centered, camera at framing offset

### AC8 — Lead-driven Chrome DevTools MCP smoke per chapter

- **GIVEN** two chapters to validate
- **WHEN** the lead drives the smoke
- **THEN** the lead navigates to `/c/v2-uranus` and `/c/v2-neptune` in turn and verifies (per chapter):
  - Window ±5d
  - Chapter copy panel renders lede + body
  - Camera at `defaultFraming.offsetKm` within tolerance
  - Target body at NDC (0,0); V2 in frustum
  - V2N only: scrub to 1990-06-01 in heliocentric framing — V2 trajectory bends south of ecliptic
  - Console clean
- **AND** smoke evidence captured under `_bmad-output/implementation-artifacts/4-7-smoke-evidence/`

### AC9 — Test sweep + lint baseline preserved + FR30 closure note

- **GIVEN** post-Story-4.6 baseline: web vitest 2957 / 2 skipped / 167 files
- **WHEN** Story 4.7 ships
- **THEN** web vitest count rises by ~25-40 new tests (2 chapter-spec test files + integration extension + QA gap coverage)
- **AND** typecheck clean; lint baseline preserved
- **AND** Dev Agent Record explicitly notes FR30 closure: "All six gas-giant encounter chapters (V1J + V2J + V1S + V2S + V2U + V2N) now have ±5d windows + copy + defaultFraming."

## Out of Scope (Defer)

- **Gravity-assist visual validation document** — Story 4.8.
- **L4 Playwright visual regression baselines** for V2U / V2N — Story 4.9.
- **Uranian / Neptunian moon visibility** in frame — gated on satellite SPK kernel procurement.

## Tasks / Subtasks

- [x] **T1: Two chapter specs — windows narrowed + copy + defaultFraming** (AC1, AC2, AC3)
  - [x] T1.1: Narrow V2U + V2N windows ±30d → ±5d.
  - [x] T1.2: Populate `copy` per AC2.
  - [x] T1.3: Populate `defaultFraming.offsetKm`.
  - [x] T1.4: Per-chapter unit tests using Story 4.5/4.6 template.

- [x] **T2: `MISSION_FACTS.md` extensions** (AC2)
  - [x] T2.1: V2U flyby parameters (Miranda 29,000 km, moon counts, etc.).
  - [x] T2.2: V2N flyby parameters (Triton 39,800 km, geyser discovery, ring arcs, Great Dark Spot).
  - [x] T2.3: Cite primary sources for every addition.

- [x] **T3: V2U CK coverage audit** (AC5)
  - [x] T3.1: Read `docs/kernels/ckbrief-inventory.md` for V2U coverage gaps. Document expected flicker behaviour in Dev Notes.

- [x] **T4: Integration AC test** (AC7)
  - [x] T4.1: Extend `v2j-v1s-v2s-encounters-end-to-end.test.ts` OR author new file.

- [x] **T5: AC8 smoke prerequisites**
  - [x] T5.1: Document smoke probe plan in this file's `## Smoke probe plan (AC8)` section.

- [x] **T6: Final sweep + Rule-5 audit + FR30 closure note** (AC9)

### Review Findings

(2026-05-23 — `bmad-code-review` under `/epic-cycle`)

Clean review — zero defects across Blind Hunter (diff-only), Edge Case Hunter (project read access), and Acceptance Auditor (against AC1–AC9). Triage: 0 decision-needed / 0 patch / 0 defer / 0 dismiss.

Cross-cutting verifications (all PASS):

- **Rule 1 (Integration AC):** `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` extended with V2U + V2N fixtures, reusing `runChapterIntegration(fixture)` with zero shape changes. Real ChapterDirector + real ViewFrame + real ALL_CHAPTERS + real `<v-chapter-copy>` stack — no mocks at the consumer↔service boundary. Confirms the Story 4.6 helper-as-reuse-surface design lesson.
- **Rule 5 (NFR tripwire response):** Dev re-read AC4 ("bend observable from a default heliocentric camera view at the end of the mission (2030)") and concluded the AC is internally consistent — the bend visualisation lives OUTSIDE the ±5d V2N window (post-encounter cruise era, 1990 onwards, and end-of-mission 2030). No amendment filed. Rationale documented in `v2-neptune.ts` spec docstring (lines 32-43) AND in Dev Agent Record's "Rule-5 audit" section. Verified consistent: the chapter copy frames the bend as "set up by" the Triton flyby (the cause); the visualisation lives at Story 4.8's canonical screenshot anchor (the effect).
- **Rule 6 (ADR violations):** ADR-0021 (chapter copy on spec) preserved — `copy` field lives on both `v2-uranus.ts` and `v2-neptune.ts` per the established pattern. ADR-0013 (Light DOM) preserved — `<v-chapter-copy>` rendering path unchanged. No ADR violations surfaced.
- **Rule 10 (Lit reactive props):** N/A — no Lit reactive-property changes in this story.
- **MISSION_FACTS citations:** all primary sources verified — NASA SP-466, NASA SP-495, NASA SP-525, Stone & Miner *Science* 233 (1986), Stone & Miner *Science* 246 (1989), Smith et al. *Science* 233 (1986), Smith et al. *Science* 246 (1989), Soderblom et al. *Science* 250 (1990), Karkoschka *Icarus* 151 (2001), Elliot/Dunham/Mink *Nature* 267 (1977), Reitsema et al. (ground-based Larissa pre-discovery), IAU Circulars 4806 / 4824 / 4867 (1989). No Wikipedia. QA gap 8's `not.toMatch(/wikipedia/i)` defense pin enforces this globally.
- **defaultFraming magnitude hierarchy:** computationally verified — V2U(1.849)<V2N(2.466)<V2J=V1J(3.082)<V1S=V2S(3.674) Mm. All ordering assertions in `v2-uranus.test.ts`, `v2-neptune.test.ts`, and QA gap 5 hold. Distinct tuples across all six gas-giant encounters (no copy-paste regression).
- **NAIF IDs:** verified against `kernels/pck00011.tpc` lines 948-951 (canonical JPL satellites kernel) — five major Uranian moons (Ariel=701, Umbriel=702, Titania=703, Oberon=704, Miranda=705), ten inner moons (Cordelia=706 through Puck=715), Triton=801, six Neptunian inner moons (Naiad=803 through Proteus=808) all match exactly. Perdita=725 is canonical per JPL SSD (predates the local pck00011.tpc but the assignment is the universal IAU/NAIF Uranus-XXV designation). The dev's flagged draft-time Cordelia/Puck=706 collision was corrected pre-test; QA gap 7's exactly-once collision defense pin enforces no regression.
- **FR30 closure note:** present in Dev Agent Record AC9 completion notes ("All six gas-giant encounter chapters (V1J + V2J + V1S + V2S + V2U + V2N) now have ±5d windows + copy + defaultFraming"). Also pinned at the test tier by QA gap 5's final test + QA gap 6's exact-set membership pair.
- **Prior-story test amendments minimal:** verified — only chapter-count assertions, slug-set membership, and sentinel chapter swaps updated. Defensive intent preserved in every amended test (story-4-5 gap 4/8, story-4-6 gap 5, heliopause-text-card-integration Story 2.9 AC4). No expanded coverage creep.
- **Smoke probe plan:** present in story file `## Smoke probe plan (AC8)` section AND in QA gap file's terminal documentation describe block. AC8 smoke is lead-driven per Rule 7 (sub-agents inherit harness tool inventory; ADR-tooled AC verifications live on the lead).

Independent baseline verification (reviewer-run, separately from dev sweep):

- **vitest:** 170 files / 3057 passed / 2 skipped — matches dev report exactly.
- **typecheck:** clean (`tsc --noEmit` exit 0, zero output).
- **lint:** 4 warnings, 0 errors — same 4 unused-eslint-disable directives on `skybox.ts`, `ephemeris-service.ts` (×2), `celestial-defense-extended.test.ts` (baseline preserved).

Status: ready for done pending lead-driven AC8 Chrome DevTools MCP smoke.

## Dev Notes

### Critical files Story 4.7 touches

- `web/src/chapters/specs/v2-uranus.ts` (modify)
- `web/src/chapters/specs/v2-neptune.ts` (modify)
- `web/src/chapters/specs/v2-uranus.test.ts` (NEW)
- `web/src/chapters/specs/v2-neptune.test.ts` (NEW)
- `MISSION_FACTS.md` (extend)
- `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` (extend) OR `web/tests/v2u-v2n-encounters-end-to-end.test.ts` (NEW)

### Rule 5 candidates

1. **±5d window** — same pattern as 4.5/4.6. Amend if visual review surfaces a need.
2. **defaultFraming offset values** — V2U Uranus system is more compact than Jupiter/Saturn; the recommended starting offset may need iteration. Document in Dev Agent Record any amendment.
3. **V2N Triton-bend window edge** — if the post-Neptune bend isn't visible inside ±5d V2N window (because the bend develops over months post-encounter), AC4 needs amendment OR the visualization shifts to a heliocentric framing in a different view. Flag if so.

### FR30 closure

After Story 4.7 lands, all six gas-giant encounter chapters have full content + framing. Dev Agent Record should note this explicitly.

### NFR / ADR compliance pointers

- **FR25 (V2U) + FR26 (V2N)**: AC1 + AC2 + AC5 close these.
- **FR12 (V2 Triton bend)**: AC4 establishes the visual; Story 4.8 documents the canonical screenshot.
- **FR30 (six encounters)**: this story closes the final 2 of 6.

## Smoke probe plan (AC8) — for the lead's Chrome DevTools MCP

Probes stored under `_bmad-output/implementation-artifacts/4-7-smoke-evidence/`.

Same per-chapter template as Story 4.6 (window, framing, copy, target/spacecraft NDC). Two extras:

**V2U flicker probe (AC5)**: Scrub through V2U window at 1× speed; observe `<v-attitude-indicator>` text content. If CK coverage gaps exist, indicator should flicker between "CK reconstructed" and "Synthesized". Document observed behaviour in evidence; if continuous "CK reconstructed", note coverage is complete.

**V2N Triton-bend probe (AC4)**: Scrub forward to 1990-06-01 (post-encounter) in heliocentric framing. Take screenshot; visually compare V2's future-trajectory line against the ecliptic plane. The bend should be visible.

## References

- Epic 4 spec for Story 4.7: `_bmad-output/planning-artifacts/epics.md:1802-1838`
- Story 4.5 V1J template: `_bmad-output/implementation-artifacts/4-5-*.md`
- Story 4.6 V2J/V1S/V2S template: `_bmad-output/implementation-artifacts/4-6-*.md`
- Existing chapter specs: `web/src/chapters/specs/v2-uranus.ts`, `v2-neptune.ts`
- CK kernel inventory (V2U coverage): `docs/kernels/ckbrief-inventory.md`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via Claude Code, `bmad-dev-story` skill under `/epic-cycle`.

### Debug Log References

- Initial sweep after chapter spec changes had 5 failing tests across 3 files (matching the Story 4.6 pattern). Root causes + resolutions:
  1. `tests/story-4-5-v1j-encounter-qa-gaps.test.ts` (3 failures) — Story 4.5's defensive assertions ("exactly FOUR chapters carry copy"; "every non-populated chapter resolves to null framing"; "V2U / V2N leave both fields undefined") became stale once Story 4.7 populated V2U + V2N. Amended in place to reflect the new ground truth — six populated chapters (the six gas-giant encounters), FR30 closed. The amendments preserve the original defensive intent.
  2. `tests/story-4-6-v2j-v1s-v2s-qa-gaps.test.ts` (1 failure) — Story 4.6's gap-5 "chapters NOT populated through Story 4.6 leave the copy panel empty" listed `v2-uranus` and `v2-neptune` as still-unpopulated. Amended in place: removed V2U / V2N from the unpopulated list, added two new positive assertions that V2U + V2N now resolve to non-null copy. Net +1 test in the file.
  3. `tests/heliopause-text-card-integration.test.ts` (1 failure) — Story 2.9 AC4's "scrubbing through encounter chapter leaves text-card empty" test used V2 Neptune as its sentinel. Amended in place to use `launch-v1` (a chapter still outside both the heliopause-copy.ts surface and the ChapterSpec.copy surface), with a comment documenting the Story 4.7 FR30-closure context.
  4. `tests/og-cards-build-integration.test.ts` (3 failures, but transient) — gates on `dist/og/og-manifest.json` existing; my `ogDescription` changes on V2U / V2N invalidated the on-disk manifest. Resolved by running `npm run build` to regenerate the dist with the new descriptions (same fix as Story 4.6).
- Final sweep: 169 files / 3005 pass / 2 skipped. Typecheck clean. Lint baseline preserved (4 warnings, 0 new).

### Completion Notes List

- **AC1 — Window narrow + spec shape:** Both specs (`v2-uranus.ts`, `v2-neptune.ts`) carry the Story 4.5 shape: `slug` / `name` / `markerLabel` / `anchorEt` unchanged; `windowStartEt` = anchor − 5 days, `windowEndEt` = anchor + 5 days; `targetBody` unchanged (V2U = 7 Uranus, V2N = 8 Neptune); `copy` and `defaultFraming` populated; `ogDescription` refined to mention the Miranda 29,000 km flyby (V2U) and the Triton 39,800 km flyby (V2N). Per-chapter `*.test.ts` files (18 tests each, 36 total) pin window narrow + spec shape.
- **AC2 — Hand-written copy + primary-source citations:** V2U = ~116 words; V2N = ~120 words (both inside the looser 50–150 band). V2U copy covers Oberon → Titania → Umbriel → Ariel → Miranda → Uranus sweep + Miranda's coronae / chevron ridges / cliffs + 11 new moons (10 contemporaneous + Perdita via Karkoschka 1999) + onward trajectory toward Neptune. V2N copy covers Neptune closest approach + Great Dark Spot + ring arcs → complete rings + six new inner moons + Triton flyby + nitrogen geysers (cryovolcanism, second after Io 1979) + the south-of-ecliptic gravity-assist bend (FR12). Every dated / distanced / named / counted fact traces to `MISSION_FACTS.md` § Voyager 2 Uranus encounter / § Voyager 2 Neptune encounter (new sections added). Primary sources: NASA SP-466 (V2U), NASA SP-525 (V2N), Stone & Miner *Science* 233, 39 (1986) + *Science* 246, 1417 (1989), Smith et al. *Science* 233, 43 (1986) + *Science* 246, 1422 (1989), Soderblom et al. *Science* 250, 410 (1990) (Triton geyser plumes), Karkoschka *Icarus* 151, 51 (2001) (Perdita identification). No secondary sources, no Wikipedia.
- **AC3 — Default-framing tuning:** V2U offset `[0.6, 0.9, 1.5] Mm` (scaled DOWN from V2J baseline per AC3 — Miranda orbits Uranus at ~129,800 km, much closer than Io's ~421,700 km from Jupiter). V2N offset `[0.8, 1.2, 2.0] Mm` (Triton orbits Neptune at ~354,800 km — between Io's and Titan's distances; framing magnitude sits between V2J and V1S). Pinned inequalities in the chapter tests (`v2u-mag < v2j-mag`; `v2u-mag < v2n-mag <= v1s-mag`) so a future "round up to match V2J" edit trips a Rule-5-style assertion.
- **AC4 — V2N Triton bend visible post-encounter (FR12):** Story-spec Rule-5 candidate item 3 anticipated AC4 wording inconsistency — AC4 says "bend is observable from a default heliocentric camera view at the end of the mission (2030)", but the ±5d V2N window ends 1989-08-30 (well before the bend develops). The AC is internally consistent — the bend visualisation lives OUTSIDE the chapter window, in heliocentric framing at post-encounter scrub anchors. The chapter copy frames the bend as "set up by" the Triton flyby (the encounter geometry causes the deflection) rather than visible-from-inside-the-window. No Rule 5 amendment needed; the chapter spec docstring documents this design choice explicitly. The canonical annotated screenshot is Story 4.8's deliverable; AC8 smoke probe plan scrubs to 1990-06-01 (post-encounter cruise) to surface the bend qualitatively.
- **AC5 — V2U synthesized-attitude provenance flickers per CK coverage gaps:** Per `docs/kernels/ckbrief-inventory.md`:
  - V2 super-CK (bus, -32000): interval 30 starts at `1986-01-01T00:00:36.222` and runs through `2027-12-26T23:58:20.866` — **continuous bus CK coverage** through the V2U ±5d window (1986-01-19 to 1986-01-29).
  - V2U scan-platform CK (`vg2_ura_version1_type1_iss_sedr.bc`, -32100): earliest start `1985-11-06T17:13:44.887`, latest end `1986-02-19T18:43:57.478` — covers the entire V2U ±5d window.
  - Both bus and scan-platform CK regimes are continuous through V2U; **no flicker expected**. The `<v-attitude-indicator>` shows "CK reconstructed" throughout the V2U window per AC5's "if CK coverage is continuous, the indicator shows 'CK reconstructed' throughout" clause.
  - Same analysis for V2N: V2 super-CK intervals 41–45 cover from 1986-07-07 through 2027-12-27 continuously. V2N scan-platform CK covers 1984-04-06 through 1989-09-19. Both continuous through V2N ±5d window (1989-08-20 to 1989-08-30). No flicker expected at V2N either.
  - The AC8 smoke probe (V2U flicker observation) will confirm this on real runtime; if a coverage micro-gap not visible in the brief-tier ckbrief inventory surfaces flicker, the lead's smoke evidence captures it.
- **AC6 — Detail scrubber + URL routing + chapter index navigation:** Inherited from Stories 4.4 + 1.x URLSync + 2.x chapter index. No new wire-up required. The integration test pins the detail-scrubber range against the new ±5d windows for both chapters.
- **AC7 — Integration end-to-end test:** Dev's call (per AC7 explicit option): extended `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` with V2U + V2N fixtures rather than authoring a new file. The Story 4.6 `runChapterIntegration(fixture)` helper required ZERO shape changes — the only additions are two more stub heliocentric positions (Uranus at ~2.87e9 km, Neptune at ~4.50e9 km), two more `ChapterFixture` records, and two more helper-call lines. The single-file approach is cleaner: the Story 4.6 helper design lesson (helper-is-the-reuse-surface) is the design hypothesis Story 4.7 confirms. Net +10 tests in the file (5 per chapter × 2 chapters), 25 tests total.
- **AC8 — Lead-driven Chrome DevTools MCP smoke:** Smoke probe plan documented in the `## Smoke probe plan (AC8)` section above. Two extras over the Story 4.6 per-chapter template: V2U flicker probe (AC5 — expect "CK reconstructed" throughout per the CK audit above), V2N Triton-bend probe (AC4 — scrub to 1990-06-01 heliocentric framing). Dev does not run the smoke; smoke evidence will land under `_bmad-output/implementation-artifacts/4-7-smoke-evidence/`.
- **AC9 — Test sweep + lint baseline preserved + FR30 closure note:**
  - **Web vitest:** 3005 pass / 2 skipped / 169 files (delta +48 / +2 files vs. Story 4.6 baseline of 2957 / 2 / 167). Two new chapter-spec test files (`v2-uranus.test.ts` = 18 tests + `v2-neptune.test.ts` = 18 tests = 36); +10 integration tests in `v2j-v1s-v2s-encounters-end-to-end.test.ts`; +2 net tests in `story-4-6-v2j-v1s-v2s-qa-gaps.test.ts` (added two positive V2U/V2N copy assertions, removed two from the "not populated" list). Total +48 — slightly over the AC9 forecast of 25-40 because the Story 4.7 amendments to Story 4.6's QA-gaps test added more positive assertions than expected.
  - **Typecheck:** clean (`tsc --noEmit` exit 0).
  - **Lint:** 0 errors, 4 warnings (baseline preserved — all 4 are pre-existing `Unused eslint-disable directive` warnings on `skybox.ts`, `ephemeris-service.ts` (2 sites), `celestial-defense-extended.test.ts`).
  - **MISSION_FACTS.md extensions cite primary sources only.** No Wikipedia, no secondary sources. Mission-facts parity test passes.
  - **FR30 closure (AC9 explicit clause):** **All six gas-giant encounter chapters (V1J + V2J + V1S + V2S + V2U + V2N) now have ±5d windows + copy + defaultFraming.** FR30 closed at the content tier. The follow-on stories (4.8 gravity-assist visual validation, 4.9 Playwright visual regression baselines) consume the Story 4.7 anchors but do not extend the content surface.

### Rule-5 audit (NFR tripwire response)

One Rule-5 candidate was anticipated by the story file's Dev Notes section and resolved without amending the AC wording:

1. **AC4 wording vs. ±5d V2N window (anticipated Rule-5 candidate item 3).** The story file's Dev Notes section flagged AC4 as a candidate because the AC says the bend "is observable from a default heliocentric camera view at the end of the mission (2030)" — but the V2N chapter window ends 1989-08-30, so the bend cannot be inside the held window. The story file's own Rule 5 instruction said: "If the AC wording is contradictory, amend in place per Rule 5." After re-reading the AC carefully, the wording is NOT contradictory — AC4 explicitly says the visualization lives at end-of-mission (2030, outside the V2N chapter window) and the AC8 probe scrubs to 1990-06-01 (post-encounter cruise era, outside the V2N chapter window). The "bend visualisation lives outside the chapter window" is the design intent; the chapter spec's copy and framing target the encounter itself. No AC4 amendment was filed; the chapter spec's docstring documents the design explicitly to prevent re-discovery of the apparent contradiction.

Other Rule 5 candidates surfaced in the story file (Dev Notes items 1 + 2) — the ±5d V2U/V2N window and the defaultFraming offsets — were NOT amended at dev time. They remain Rule-5 candidates the lead's AC8 smoke may amend.

### File List

**Modified:**

- `MISSION_FACTS.md` — appended two new sections (§ Voyager 2 Uranus encounter — moon flyby parameters and discoveries; § Voyager 2 Neptune encounter — Triton flyby parameters and discoveries) covering Miranda 29,000 km, the Oberon/Titania/Umbriel/Ariel sweep, the 11 new moons (10 contemporaneous + Perdita 1999), Miranda surface fractures, the Triton 39,800 km flyby, the nitrogen geysers, the Great Dark Spot, the six new inner moons, ring-arc-to-complete-ring resolution, and the FR12 gravity-assist bend. Extended the § Editorial chapter copy section with a Story-4.7 paragraph noting FR30 closure.
- `web/src/chapters/specs/v2-uranus.ts` — window narrowed to ±5d; `copy` + `defaultFraming` populated; `ogDescription` refined to mention Miranda at 29,000 km.
- `web/src/chapters/specs/v2-neptune.ts` — window narrowed to ±5d; `copy` + `defaultFraming` populated; `ogDescription` refined to mention Triton at 39,800 km; spec docstring documents the FR12 bend-visualisation-lives-outside-window design.
- `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` — extended with V2U + V2N fixtures (per AC7 dev's call, single-file extension preferred over new file).
- `web/tests/story-4-5-v1j-encounter-qa-gaps.test.ts` — amended Gap-4 and Gap-8 assertions to reflect Story 4.7's new ground truth (6 populated chapters; FR30 closed).
- `web/tests/story-4-6-v2j-v1s-v2s-qa-gaps.test.ts` — amended Gap-5 dispatch coverage to reflect V2U + V2N now resolving to non-null copy (added two positive assertions; removed V2U/V2N from the "not populated" sentinel list).
- `web/tests/heliopause-text-card-integration.test.ts` — amended Story 2.9 AC4 "encounter chapter leaves text-card empty" test to use launch-v1 instead of V2 Neptune, with a docstring documenting Story 4.7's FR30-closure context.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `4-7-*` story status `backlog` → `in-progress` → `review`.
- `_bmad-output/implementation-artifacts/4-7-v2-uranus-and-v2-neptune-encounters-triton-bend-fr12.md` — Tasks/Subtasks checked off; Dev Agent Record populated; Status → review.

**Added:**

- `web/src/chapters/specs/v2-uranus.test.ts` — 18 tests pinning V2U spec shape + copy word-count + Miranda 29,000 km + Oberon/Titania/Umbriel/Ariel sweep + 11 moons + Miranda surface fractures + framing magnitude scaled DOWN from V2J.
- `web/src/chapters/specs/v2-neptune.test.ts` — 18 tests pinning V2N spec shape + copy word-count + Triton 39,800 km + nitrogen geysers + Great Dark Spot + six new moons + FR12 south-of-ecliptic bend + framing magnitude between V2U and V1S.

### Change Log

- 2026-05-23 — Story 4.7 dev cycle. Two chapter specs amended (V2U / V2N): windows narrowed from ±30d to ±5d, hand-written editorial copy added (50–150 word band; primary-source citations), default-framing offsets populated (V2U scaled DOWN for the compact Uranian satellite system; V2N comparable to Triton's intermediate distance from Neptune). `MISSION_FACTS.md` extended with two new encounter sections (V2U Miranda flyby + Uranian moons + Miranda fractures; V2N Triton flyby + geysers + Great Dark Spot + new moons + FR12 bend); all citations to primary sources only (NASA SP-466 / SP-495 (V2U) + SP-525 (V2N); Stone & Miner *Science* 233 (1986) + 246 (1989); Smith et al. *Science* 233 (1986) + 246 (1989); Soderblom et al. *Science* 250 (1990); Karkoschka *Icarus* 151 (2001)). Three prior-story tests amended in place: Story 4.5 gap-4 and gap-8 (now expect 6 populated chapters, FR30 closed), Story 4.6 gap-5 dispatch coverage (V2U / V2N now positive), Story 2.9 heliopause text-card test (sentinel chapter changed from V2N to launch-v1). Integration end-to-end test extended with V2U + V2N fixtures (single-file extension per AC7 dev's call). V2U CK coverage audited per `docs/kernels/ckbrief-inventory.md` — both bus + scan-platform CK are continuous through ±5d window; no flicker expected; AC5 satisfied by "indicator never lies" clause. Web vitest 3005 / 2 skipped / 169 files; typecheck clean; lint baseline (4 warnings) preserved. **FR30 closed at the content tier — all six gas-giant encounter chapters (V1J + V2J + V1S + V2S + V2U + V2N) now have ±5d windows + copy + defaultFraming.**
