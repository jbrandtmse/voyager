# Story 4.6: V2 Jupiter, V1 Saturn (Titan Slingshot), and V2 Saturn Encounters

**Epic:** 4 — Encounter Chapters (All Six Gas-Giant Flybys)
**Status:** done
**Date created:** 2026-05-23

## User Story

As a visitor,
I want V2 Jupiter (1979-07-09), V1 Saturn (1980-11-12 with the Titan slingshot), and V2 Saturn (1981-08-26) all rendered with body-centered framing and hand-written chapter copy, with V1's post-Saturn trajectory visibly bent out of the ecliptic by the Titan flyby,
So that the gas-giant tour progresses chronologically and FR22, FR23, FR24, FR30, FR11 (V1S slingshot) are fulfilled.

## Consumed-by

- **Story 4.7** (V2U / V2N): same encounter-chapter pattern.
- **Story 4.8** (gravity-assist visual validation): consumes V1S's Titan slingshot bend as one of the six legible-bend screenshots.
- **Story 4.9** (L4 Playwright visual regression): uses V2J / V1S / V2S anchors as three of the eight pinned scenes.

This story **amends** three existing chapter specs (`v2-jupiter.ts`, `v1-saturn.ts`, `v2-saturn.ts`) using the V1J pattern Story 4.5 established. NO new services or primitives — the heavy lifting (chapter-default-framing helper, copyForChapter dispatch, ChapterDirector subscriber, cold-load replay) is already in place from Story 4.5.

## Consumes

- All Story 4.5 consumers (ChapterDirector, ViewFrame, VoyagerCameraController.applyDefaultFraming, MissionPhaseFSM cold-load replay, `<v-chapter-copy>`, `<v-timeline-scrubber variant="detail">`).
- `MISSION_FACTS.md` — V2J / V1S / V2S facts must trace to primary sources (extend `MISSION_FACTS.md` with V2J / V1S / V2S sweep timelines + Titan flyby parameters as needed).

## Acceptance Criteria

### AC1 — Three chapter specs follow the Story 4.5 template

- **GIVEN** the chapter specs at `web/src/chapters/specs/v2-jupiter.ts`, `v1-saturn.ts`, `v2-saturn.ts`
- **WHEN** I inspect each
- **THEN** each spec has the full structure established by Story 4.5:
  - `slug`, `name`, `markerLabel` — unchanged from Story-2.1 stubs
  - `anchorEt` — unchanged; matches `MISSION_FACTS.md ENCOUNTER_DATES`
  - `windowStartEt` = `anchorEt - 5 * 86400` (**narrowed from Story-2.1 placeholder ±30d → Story-4.5 spec ±5d**)
  - `windowEndEt` = `anchorEt + 5 * 86400`
  - `spacecraft` — unchanged
  - `targetBody` — V2J=5 (Jupiter), V1S=6 (Saturn), V2S=6 (Saturn) — unchanged
  - `ogDescription` — unchanged or refined for narrower window
  - `copy: { lede, body }` — newly populated per AC2 below
  - `defaultFraming: { offsetKm: [x, y, z] }` — newly populated per AC3 below

### AC2 — Hand-written chapter copy with primary-source citations

- **GIVEN** the copy field populated in AC1 for each of the three chapters
- **WHEN** I read each chapter's copy
- **THEN** the copy is 50–150 words (looser bound than Story 4.5's 80–120; some chapters have less hand-written detail and that's OK)
- **AND** **V2 Jupiter** copy covers the Callisto / Ganymede / Europa / Amalthea sequence (per the PRD encounter coverage table), the differences from V1J (V2's path was deflected by Jupiter's gravity to set up Saturn-and-beyond), and any additional discoveries (ring detail / atmospheric measurements).
- **AND** **V1 Saturn** copy covers the Titan close flyby at 6,490 km (the slingshot deflection that ended V1's planetary tour and aimed it north of the ecliptic), the Saturn ring detail, and the brief Imhotep / Iapetus / Hyperion notes (whatever the historical record supports).
- **AND** **V2 Saturn** copy covers the Iapetus / Hyperion / Titan flybys, Saturn ring detail not visible on V1, and the trajectory setup for Uranus.
- **AND** every cited distance, date, body name, or count traces to `MISSION_FACTS.md`. Extend `MISSION_FACTS.md` if a needed fact is missing — primary sources only. If a fact CANNOT be sourced to primary documentation, HALT with a `## Clarification Needed` block.

### AC3 — Default-framing tuning for three encounters

- **GIVEN** the Story 4.5 framing pattern (chapter spec exposes `defaultFraming.offsetKm`; controller auto-applies on chapter `held`)
- **WHEN** Story 4.6 lands
- **THEN** each chapter spec has a `defaultFraming.offsetKm: [x, y, z]` field populated with values tuned for that chapter's specific encounter geometry:
  - **V2J**: comparable to V1J — Jupiter at origin, camera offset to show V2 + Jupiter together
  - **V1S**: Saturn at origin, camera offset to show V1 + Saturn + Titan together (Titan is the slingshot body; visibility important to AC4 below)
  - **V2S**: Saturn at origin, camera offset to show V2 + Saturn + Iapetus or Hyperion (whichever the visual review highlights)
- **AND** initial values are the dev's best estimate (start from Story 4.5's V1J values as a baseline and adjust for each chapter's bodies); the lead's per-story smoke iterates on tuning as needed
- **AND** the dev runs the existing `cycle-2 applyDefaultFraming` subscriber + cold-load replay pattern — NO new wire-up code expected (Story 4.5 already landed the trigger)

### AC4 — V1 Saturn Titan slingshot bend visible post-encounter

- **GIVEN** V1's post-Saturn trajectory after the Titan slingshot
- **WHEN** I scrub to a date after 1980-11-12 in heliocentric framing
- **THEN** V1's future-trajectory line visibly arcs upward (away from the ecliptic plane) — the gravity-assist bend out of the ecliptic
- **AND** this is validated visually in the lead's smoke against the existing SPICE-derived trajectory (within NFR-P9 ≤ 20 km max position error tolerance, already pinned by Story 1.6 trajectory baseline)
- **AND** Story 4.8 captures the canonical annotated screenshot of this bend

### AC5 — Chapter copy renders in `<v-chapter-copy>` for all three chapters

- **GIVEN** Story 4.5's `copyForChapter(chapter)` dispatch is already wired
- **WHEN** any of V2J / V1S / V2S enters `held`
- **THEN** `<v-chapter-copy>` renders the chapter's lede + body per the existing Story 2.9 / 4.5 typography
- **AND** the panel fades in/out at chapter entry/exit per the existing rules
- **AND** the lookup for non-heliopause encounter chapters returns the `ChapterSpec.copy` field directly (Story 4.5 pattern)

### AC6 — Detail scrubber + URL routing + chapter index navigation for all three

- **GIVEN** the existing detail scrubber + URL routing (Story 4.4 + Story 1.x URLSync) + chapter index (Story 2.x)
- **WHEN** I click a V2J / V1S / V2S marker on the mission scrubber OR select the chapter from the index OR navigate to `/c/v2-jupiter` / `/c/v1-saturn` / `/c/v2-saturn`
- **THEN** the simulation jumps paused to the chapter's anchor ET
- **AND** the URL updates to the corresponding slug via `pushState`
- **AND** the chapter copy panel + detail scrubber render per Stories 4.4 + 4.5
- **AND** the active marker on the mission scrubber paints with `--v-color-accent`

### AC7 — Integration AC (Rule 1): real end-to-end chain for each chapter

- **GIVEN** this story lands three chapters' worth of content
- **WHEN** Story 4.6 lands
- **THEN** `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` (single test file, three describe blocks) constructs a real `ChapterDirector`, real `<v-chapter-copy>`, real detail scrubber, real `ViewFrame`, and walks each of V2J / V1S / V2S through `out → entering → held → exiting → passed`, asserting at each chapter:
  - Chapter spec window is ±5 days
  - `<v-chapter-copy>` renders the chapter's lede on `held`
  - Detail scrubber `aria-hidden="false"` on `held`, aria-valuemin/max match window
  - `ViewFrame.getTransform(anchorEt)` returns the chapter's `targetBody`-centered offset
  - On `held`, camera position has been moved to the chapter's `defaultFraming.offsetKm` (the cycle-2 `applyDefaultFraming` subscriber path)
- **AND** if extending the existing `v1j-encounter-end-to-end.test.ts` is cleaner than a new file, the dev's call — document the choice

### AC8 — Lead-driven Chrome DevTools MCP smoke per chapter

- **GIVEN** three chapters to validate
- **WHEN** the lead drives the smoke after dev + QA + code-review complete
- **THEN** the lead navigates to each of `/c/v2-jupiter`, `/c/v1-saturn`, `/c/v2-saturn` in turn and verifies (per chapter):
  - `chapter.windowEndEt - chapter.windowStartEt === 10 * 86400` (±5d narrowed)
  - `<v-chapter-copy>` panel renders the chapter's lede + body
  - `camera.position` ≈ `chapter.defaultFraming.offsetKm` (within animation tolerance)
  - target body mesh visible at NDC near (0,0); spacecraft mesh visible in frustum
  - V1S only: scrub to 1981-01-01 (post-Saturn) in heliocentric framing — V1's future trajectory visibly arcs north of the ecliptic (AC4)
  - `<v-attitude-indicator>` shows "CK reconstructed" (where CK coverage exists per `docs/kernels/ckbrief-inventory.md`)
- **AND** smoke evidence captured under `_bmad-output/implementation-artifacts/4-6-smoke-evidence/` with one screenshot per chapter
- **AND** console clean (modulo documented baseline)

### AC9 — Test sweep + lint baseline preserved

- **GIVEN** post-Story-4.5 baseline: web vitest 2857 pass / 2 skipped / 162 files
- **WHEN** Story 4.6 ships
- **THEN** web vitest count rises by ~15-30 new tests (3 chapter-spec tests + 3 word-count tests + integration test extensions + any new QA gap coverage)
- **AND** typecheck clean; lint baseline preserved (≤ 4 warnings; 0 new)
- **AND** `MISSION_FACTS.md` extensions cited to primary sources (NASA SP-439, Science 1979/1981 papers, JPL final reports). NO Wikipedia, NO secondary sources.

## Out of Scope (Defer to Specific Later Stories)

- **V2U / V2N chapter content** — Story 4.7.
- **Gravity-assist visual validation document** — Story 4.8 (this story includes the V1S Titan-slingshot bend visual verification in the smoke, but the canonical annotated-screenshot document is Story 4.8's deliverable).
- **L4 Playwright visual regression baselines** for V2J / V1S / V2S — Story 4.9.
- **Galilean / Saturnian moon visibility** at the encounter — gated on satellite SPK kernel procurement (Story 4.3 cycle-4 documented follow-up); the moon meshes are constructed but lack ephemeris.

## Tasks / Subtasks

- [x] **T1: Three chapter specs — windows narrowed + copy + defaultFraming** (AC1, AC2, AC3)
  - [x] T1.1: Narrow each spec's window from ±30d to ±5d.
  - [x] T1.2: Populate `copy` per AC2 (50–150 words per chapter; primary-source-cited).
  - [x] T1.3: Populate `defaultFraming.offsetKm` per AC3 (best-estimate values; lead iterates in smoke).
  - [x] T1.4: Per-chapter unit tests (word-count, spec-shape, MISSION_FACTS.md regex audit) using the Story 4.5 v1-jupiter.test.ts template.

- [x] **T2: `MISSION_FACTS.md` extensions** (AC2)
  - [x] T2.1: V2J interior sweep timeline (Callisto / Ganymede / Europa / Io order + times). **Rule-5 amendment** — PRD encounter coverage table row had "Amalthea" in the V2J sequence; per NASA SP-439 Appendix A the V2 sweep was the four Galilean moons (no close Amalthea — Amalthea was V1-only). PRD amended in place; copy cites Io rather than Amalthea.
  - [x] T2.2: V1S Titan flyby parameters (closest approach altitude 6,490 km per NASA SP-451 § 3 + Smith et al., *Science* 212, 159, 1981). Deflection-angle figure not added — primary sources I could cite describe the qualitative northern deflection but a single canonical deflection-angle value was not surfaced from a primary-source citation; the copy describes the deflection qualitatively per AC4.
  - [x] T2.3: V2S Iapetus / Hyperion / Titan flyby parameters per Smith et al., *Science* 215, 504 (1982).
  - [x] T2.4: Primary sources cited for every addition (NASA SP-439, NASA SP-451, *Science* 204, 206, 212, 215). No Wikipedia, no secondary sources.

- [x] **T3: Integration AC test** (AC7)
  - [x] T3.1: Authored `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` (new file, three describe blocks via the `runChapterIntegration(fixture)` helper). NOT extending the existing V1J file because the V1J file already pins V1J-specific assertions; the new file shares the same shape but enumerates V2J / V1S / V2S without coupling.

- [x] **T4: AC8 smoke prerequisites + V1S slingshot probe**
  - [x] T4.1: Smoke probe plan already documented in this story's `## Smoke probe plan (AC8)` section by `bmad-create-story`. No edits required.

- [x] **T5: Final sweep + Rule-5 audit** (AC9)
  - [x] Full vitest sweep: 2915 pass / 2 skipped / 166 files (was 2857 pass / 2 skipped / 162 files; delta +58 pass / +4 files — three chapter-spec tests (43 tests) + integration test (15 tests) = 58, four new test files: v2-jupiter / v1-saturn / v2-saturn .test.ts + v2j-v1s-v2s-encounters-end-to-end.test.ts).
  - [x] Typecheck clean.
  - [x] Lint baseline preserved (4 warnings, 0 new).

## Dev Notes

### Critical files Story 4.6 touches

- `web/src/chapters/specs/v2-jupiter.ts` (modify — window narrow + copy + defaultFraming)
- `web/src/chapters/specs/v1-saturn.ts` (modify — same shape)
- `web/src/chapters/specs/v2-saturn.ts` (modify — same shape)
- `web/src/chapters/specs/v2-jupiter.test.ts` (NEW — Story 4.5 template)
- `web/src/chapters/specs/v1-saturn.test.ts` (NEW — Story 4.5 template + V1S slingshot ecliptic-exit data assertion if MISSION_FACTS has it)
- `web/src/chapters/specs/v2-saturn.test.ts` (NEW)
- `MISSION_FACTS.md` (extend per T2)
- `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` (NEW — Integration AC per Rule 1)

### Rule 5 candidates (anticipated)

1. **±5 days window edge** — same as Story 4.5. If the visual smoke surfaces ±5d is too narrow or wide for V2J / V1S / V2S, amend in place per Rule 5. The Titan slingshot bend (AC4) might prefer a wider window to make the bend visible from inside the chapter — flag if so.
2. **Word count 50–150** — looser bound than Story 4.5 reflects historical-record variance per encounter. Amend if any chapter genuinely needs fewer than 50 or more than 150 words.

### NFR / ADR compliance pointers

- **FR22 (V2J), FR23 (V1S), FR24 (V2S)**: AC1+AC2+AC5 close these.
- **FR30 (six gas-giant encounters total)**: this story closes 3 of 6 (V1J already done in 4.5; V2J + V1S + V2S close here; V2U + V2N in 4.7).
- **FR11 (gravity-assist visible)**: AC4 V1S Titan slingshot. Story 4.8 documents the canonical screenshot.
- **NFR-P9 (≤ 20 km trajectory error)**: AC4 references the existing Story 1.6 baseline pin.

## Smoke probe plan (AC8) — for the lead's Chrome DevTools MCP

Probes stored under `_bmad-output/implementation-artifacts/4-6-smoke-evidence/`. Three sub-probes (one per chapter) + one V1S slingshot bend probe.

**Per-chapter probe template** (run for each of `/c/v2-jupiter`, `/c/v1-saturn`, `/c/v2-saturn`):

```js
async () => {
  const dbg = window.__voyagerDebug;
  const ch = dbg.chapterDirector.activeChapter;
  const camera = dbg.renderEngine.camera;
  const scene = dbg.renderEngine.scene;
  const findByName = (name) => { let f=null; scene.traverse(o=>{ if(o.name===name) f=o; }); return f; };
  const targetMesh = findByName(`celestial-${ch.targetBody}`);
  const spacecraftMesh = findByName(ch.spacecraft === 'v1' ? 'voyager-1' : 'voyager-2');
  return {
    slug: ch.slug,
    windowSpanSec: ch.windowEndEt - ch.windowStartEt,
    spanPass: Math.abs(ch.windowEndEt - ch.windowStartEt - 10 * 86400) < 1,
    cameraAtFraming: ch.defaultFraming
      ? Math.abs(camera.position.x - ch.defaultFraming.offsetKm[0]) < 100
        && Math.abs(camera.position.y - ch.defaultFraming.offsetKm[1]) < 100
        && Math.abs(camera.position.z - ch.defaultFraming.offsetKm[2]) < 100
      : null,
    copyPanelPresent: !!document.querySelector('v-chapter-copy h2'),
    copyLede: document.querySelector('v-chapter-copy h2')?.textContent ?? null,
    targetMeshInFrustum: (() => {
      if (!targetMesh) return false;
      const wp = new targetMesh.position.constructor();
      targetMesh.getWorldPosition(wp); wp.project(camera);
      return Math.abs(wp.x) < 1.05 && Math.abs(wp.y) < 1.05;
    })(),
    spacecraftMeshInFrustum: (() => {
      if (!spacecraftMesh) return false;
      const wp = new spacecraftMesh.position.constructor();
      spacecraftMesh.getWorldPosition(wp); wp.project(camera);
      return Math.abs(wp.x) < 1.05 && Math.abs(wp.y) < 1.05;
    })(),
  };
}
```

**V1S slingshot bend probe** (run after the V1S chapter probe):

Scrub forward to 1981-01-01 (post-Saturn cruise toward interstellar exit) via mission-scrubber drag or `clockManager.scrubTo` if exposed. In a fresh heliocentric framing (not body-centered), assert V1's worldPosition's Z-component is positive and rising over time (V1 is climbing out of the ecliptic plane). Take an annotated screenshot.

**Evidence capture:** one screenshot per chapter + one slingshot-bend screenshot = 4 PNGs total under `_bmad-output/implementation-artifacts/4-6-smoke-evidence/`.

## References

- Epic 4 spec for Story 4.6: `_bmad-output/planning-artifacts/epics.md:1762-1798`
- Story 4.5 V1J template: `_bmad-output/implementation-artifacts/4-5-v1-jupiter-encounter-1979-03-05-with-body-centered-framing.md`
- Existing chapter specs: `web/src/chapters/specs/v2-jupiter.ts`, `v1-saturn.ts`, `v2-saturn.ts`
- VoyagerCameraController + applyDefaultFraming: `web/src/render/voyager-camera-controller.ts`
- ChapterDirector subscriber wire-up: `web/src/main.ts`
- `<v-chapter-copy>` copyForChapter dispatch: `web/src/components/v-chapter-copy.ts`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via Claude Code, `bmad-dev-story` skill under `/epic-cycle`.

### Debug Log References

- Initial integration sweep had 7 failing tests across 2 files. Root causes + resolutions:
  1. `tests/story-4-5-v1j-encounter-qa-gaps.test.ts` (4 failures) — Story 4.5 authored defensive assertions ("exactly ONE chapter carries copy" / "every non-V1J chapter resolves to null framing") that became stale once Story 4.6 populated V2J / V1S / V2S. Resolved by amending those assertions in place to reflect the new ground truth (4 populated chapters: V1J + V2J + V1S + V2S; V2U / V2N remain Story 4.7 territory). The amendments preserve the original defensive intent — they still pin "exactly these and no other chapters."
  2. `tests/og-cards-build-integration.test.ts` (3 failures) — these gate on `dist/og/og-manifest.json` existing; my `ogDescription` changes on V2J / V1S / V2S invalidated the on-disk manifest. Resolved by running `npm run build` to regenerate the dist with the new descriptions.
- Final sweep: 2915 pass / 2 skipped / 166 files. Typecheck clean. Lint baseline preserved.

### Completion Notes List

- **AC1 — Window narrow + spec shape:** All three specs (`v2-jupiter.ts`, `v1-saturn.ts`, `v2-saturn.ts`) carry the Story 4.5 shape: `slug` / `name` / `markerLabel` / `anchorEt` unchanged; `windowStartEt` = anchor − 5 days, `windowEndEt` = anchor + 5 days; `targetBody` unchanged (V2J = 5 Jupiter, V1S/V2S = 6 Saturn); `copy` and `defaultFraming` populated. Per-chapter `*.test.ts` files pin the window narrow + the spec shape.
- **AC2 — Hand-written copy + primary-source citations:** V2J = 88 words; V1S = 109 words; V2S = 111 words (all inside the 50–150 band). V2J copy covers Callisto → Ganymede → Europa → Io + Grand Tour deflection + finer ring imagery / Ganymede grooved terrain. V1S covers the 6,490 km Titan flyby + radio occultation + ecliptic-exit slingshot + ring imagery (broad rings / F-ring braiding / spokes). V2S covers Iapetus / Hyperion / Titan triple-flyby + Iapetus two-toned hemispheres / Cassini Regio + V2 higher-cadence ring imagery (C-ring / D-ring) + Uranus trajectory setup. Every dated / distanced / named fact traces to `MISSION_FACTS.md` § Voyager 2 Jupiter encounter / § Voyager 1 Saturn encounter / § Voyager 2 Saturn encounter (new sections added). Primary sources: NASA SP-439 (Voyagers Encounter Jupiter), NASA SP-451 (Voyages to Saturn), Smith et al. *Science* 204 (1979), 206 (1979), 212 (1981), 215 (1982); Tyler et al. *Science* 212 (1981).
- **AC3 — Default-framing tuning:** V2J offset `[1.0, 1.5, 2.5] Mm` (V1J baseline reused — comparable Jupiter system geometry). V1S offset `[1.5, 1.5, 3.0] Mm` (scaled up: Titan is ~1.22 Mm from Saturn vs. Io ~0.42 Mm from Jupiter). V2S offset `[1.5, 1.5, 3.0] Mm` (same as V1S baseline; Iapetus is far out at ~3.56 Mm but the lead's smoke can iterate per Rule 5).
- **AC4 — V1S Titan slingshot bend visible post-encounter:** Cycle-1 dev does not validate this visually — it's the lead's AC8 smoke deliverable. The copy and the windowEndEt + 5d band are both consistent with the bend being visible within the ±5d held window's outbound half. If the lead's smoke flags the bend as not legible inside ±5d, that's a Rule 5 candidate for a wider V1S window. The MISSION_FACTS extension cites the qualitative deflection per NASA SP-451 / Smith et al. *Science* 212.
- **AC5 — Chapter copy renders via `<v-chapter-copy>`:** Verified for all three chapters in the integration test — `<v-chapter-copy>` renders the chapter's lede + body on `held`, clears on exit. The `copyForChapter(chapter)` dispatch (Story 4.5) reads `ChapterSpec.copy` directly; no component-side changes required.
- **AC6 — Detail scrubber + URL routing + chapter index navigation:** Inherited from Stories 4.4 + 1.x URLSync + 2.x chapter index. No new wire-up required. The integration test pins the detail-scrubber range against the new ±5d windows for each chapter.
- **AC7 — Integration end-to-end test:** `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` constructs a real `ChapterDirector`, real `<v-chapter-copy>`, real detail scrubber, real `ViewFrameService`, and real `VoyagerCameraController` for each of V2J / V1S / V2S. The test walks out → entering → held → exiting → passed, asserting copy renders, detail scrubber un-hides + range matches, ViewFrame returns body-centered offset, and `applyDefaultFraming({animated:false})` snaps the camera to `target + offsetKm`. 15 tests; all pass.
- **AC8 — Lead-driven Chrome DevTools MCP smoke:** Smoke probe plan is in `## Smoke probe plan (AC8)` above. Dev does not run the smoke (lead's deliverable). The probe pattern matches Story 4.5's per-chapter probe + a V1S slingshot bend sub-probe at 1981-01-01. Smoke evidence will land under `_bmad-output/implementation-artifacts/4-6-smoke-evidence/`.
- **AC9 — Test sweep + lint baseline preserved:**
  - **Web vitest:** 2915 pass / 2 skipped / 166 files (delta +58 / +4 files vs. Story 4.5 baseline of 2857 / 2 / 162).
  - **Typecheck:** clean (`tsc --noEmit` exit 0).
  - **Lint:** 0 errors, 4 warnings (baseline preserved — all 4 are pre-existing `Unused eslint-disable directive` warnings on `skybox.ts`, `ephemeris-service.ts` (2 sites), and `celestial-defense-extended.test.ts`).
  - **MISSION_FACTS.md extensions cite primary sources only.** No Wikipedia, no secondary sources. Mission-facts parity test passes.

### Rule-5 audit (NFR tripwire response)

Two Rule-5 amendments were filed during this story:

1. **PRD encounter coverage table row 129 — V2J sequence misnamed.** Original draft listed V2J as "Callisto, Ganymede, Europa, Amalthea sequence." Per NASA SP-439 Appendix A the V2 sweep was the four Galilean moons (Callisto → Ganymede → Europa → Io); V2 did NOT make a close Amalthea pass — Amalthea was a V1-only close encounter. Amended PRD row in place with the corrected sequence and an inline Rule-5 note pointing to this story. Editorial chapter copy at `v2-jupiter.ts` cites Io rather than Amalthea, and the per-chapter unit test (`v2-jupiter.test.ts`) explicitly asserts `expect(body).not.toMatch(/Amalthea/)` to pin the corrected ground truth.
2. **`±5d window edge` not amended** — anticipated as a potential tripwire in the story's `### Rule 5 candidates (anticipated)` section. Dev's cycle-1 implementation kept ±5d for all three chapters; AC4 (V1S Titan slingshot bend visible post-encounter) is the riskiest because the bend may want a wider window. Deferred to the lead's AC8 smoke — if the bend isn't legible inside ±5d, Rule 5 amendment will follow in that cycle (NOT a dev-side action). Story 4.5's V1J framing analogously stayed ±5d through dev + smoke.

### File List

**Modified:**

- `MISSION_FACTS.md` — appended three new sections (§ Voyager 2 Jupiter encounter — interior sweep timeline; § Voyager 1 Saturn encounter — Titan flyby parameters; § Voyager 2 Saturn encounter — moon flyby parameters) and extended the § Editorial chapter copy section with a Story-4.6 paragraph.
- `_bmad-output/planning-artifacts/prd.md` — Rule-5 amendment to the V2 Jupiter row of the encounter coverage table (Amalthea → Io).
- `web/src/chapters/specs/v2-jupiter.ts` — window narrowed to ±5d; `copy` + `defaultFraming` populated.
- `web/src/chapters/specs/v1-saturn.ts` — window narrowed to ±5d; `copy` + `defaultFraming` populated; `ogDescription` refined to mention the 6,490 km Titan flyby.
- `web/src/chapters/specs/v2-saturn.ts` — window narrowed to ±5d; `copy` + `defaultFraming` populated; `ogDescription` refined to mention Iapetus / Hyperion / Titan.
- `web/tests/story-4-5-v1j-encounter-qa-gaps.test.ts` — amended Gap-4 and Gap-8 assertions to reflect Story 4.6's new ground truth (4 populated chapters; V2U/V2N still pending Story 4.7).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `4-6-*` story status `backlog` → `in-progress` → `review`.
- `_bmad-output/implementation-artifacts/4-6-v2-jupiter-v1-saturn-titan-slingshot-and-v2-saturn-encounters.md` — Tasks/Subtasks checked off; Dev Agent Record populated; Status → review.

**Added:**

- `web/src/chapters/specs/v2-jupiter.test.ts` — 14 tests pinning V2J spec shape + copy word-count + fact citations + defaultFraming shape.
- `web/src/chapters/specs/v1-saturn.test.ts` — 14 tests pinning V1S spec shape + copy word-count + Titan flyby altitude + slingshot deflection facts.
- `web/src/chapters/specs/v2-saturn.test.ts` — 15 tests pinning V2S spec shape + copy word-count + Iapetus/Hyperion/Titan facts + Uranus setup.
- `web/tests/v2j-v1s-v2s-encounters-end-to-end.test.ts` — 15 integration tests (5 per chapter × 3 chapters) pinning ChapterDirector → ViewFrame → `<v-chapter-copy>` → detail scrubber → `applyDefaultFraming` wire-up.

### Change Log

- 2026-05-23 — Story 4.6 dev cycle. Three chapter specs amended (V2J / V1S / V2S): windows narrowed from ±30d to ±5d, hand-written editorial copy added (50–150 word band; primary-source citations), default-framing offsets populated. `MISSION_FACTS.md` extended with three new encounter sections (V2J Galilean sweep, V1S Titan flyby parameters, V2S moon flybys); all citations to primary sources only (NASA SP-439, NASA SP-451, *Science* 204/206/212/215, Tyler et al. *Science* 212). PRD encounter coverage table V2J row amended in place per Rule 5 (Amalthea → Io; V2 did NOT make a close Amalthea pass per NASA SP-439). Story 4.5 QA-gap test amended in place to reflect Story 4.6's new ground truth. Integration end-to-end test authored. Web vitest 2915 / 2 skipped / 166 files; typecheck clean; lint baseline (4 warnings) preserved.
- 2026-05-23 — Story 4.6 QA cycle. Added `web/tests/story-4-6-v2j-v1s-v2s-qa-gaps.test.ts` (42 tests across 8 priorities) covering: MISSION_FACTS citation regex audit, Rule-5 PRD amendment defense pin, V1S Titan altitude pin, defaultFraming scale-up justification, copyForChapter dispatch coverage, integration-test symmetry, V1S deflection-angle gap defense, and primary-source-only MISSION_FACTS audit. Full sweep: 2957 pass / 2 skipped / 167 files.
- 2026-05-23 — Story 4.6 code-review. Adversarial pass (Blind Hunter + Edge Case Hunter + Acceptance Auditor) returned ZERO HIGH or MED findings; one LOW deferred (MISSION_FACTS V2J slash-format style nit, routed to `deferred-work.md`). Rule 1 (Integration AC): integration test confirmed real-chain (no `vi.mock`, only ephemeris + manualCameraActive stubbed). Rule 3 (smoke probe plan): present in story file `## Smoke probe plan (AC8)`. Rule 5 (PRD amendment): documented in PRD itself, V2J spec docstring, AND Dev Agent Record original-vs-amended — all three surfaces present; QA gap 2 pins the defense at PRD + MISSION_FACTS surfaces. Rule 6 (ADR-0021): `web/src/data/heliopause-copy.ts` unchanged (verified via `git status`). Rule 10 (Lit reactive properties): N/A — no new components introduced. Baselines: typecheck clean, lint 4 warnings preserved.

### Review Findings

- [x] [Review][Defer] MISSION_FACTS.md V2J interior-sweep paragraph uses `07/08`/`07/09` slash format once [MISSION_FACTS.md § Voyager 2 Jupiter encounter — interior sweep timeline closing paragraph] — deferred, LOW style nit; outside QA gap-8's `\d{2}/\d{2}/\d{4}` anti-format defense (no year, so not regression-triggering). Routed to `deferred-work.md` under "Deferred from: code review of story 4-6 (2026-05-23)".
