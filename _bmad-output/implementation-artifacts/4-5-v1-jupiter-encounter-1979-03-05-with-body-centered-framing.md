# Story 4.5: V1 Jupiter Encounter (1979-03-05) with Body-Centered Framing

**Epic:** 4 — Encounter Chapters (All Six Gas-Giant Flybys)
**Status:** review (cr_complete, pending lead AC8 smoke)
**Date created:** 2026-05-23

## User Story

As a visitor scrubbing to 1979-03-05,
I want V1's Jupiter encounter rendered with body-centered cinematic framing, articulated scan platform, NA boresight cone aimed at the historical targets, and hand-written chapter copy,
So that the differentiator's first encounter validation lands per the Step 4 success criteria, fulfilling FR21 and the V1 Jupiter portion of FR30.

## Consumed-by

- **Story 4.6** (V2J / V1S / V2S chapters): re-uses the encounter-chapter pattern this story establishes — chapter-spec shape, copy-block module, default-framing tuning rubric, encounter-copy wire-up in `<v-chapter-copy>`. Story 4.6 lands three more encounter chapters using the same machinery.
- **Story 4.7** (V2U / V2N chapters): same pattern, two more chapters.
- **Story 4.8** (gravity-assist visual validation): consumes the tuned camera framing this story establishes to capture annotated screenshots of V1J's swing.
- **Story 4.9** (L4 Playwright visual regression): uses V1J's anchor as one of the eight pinned scenes; the baseline image is captured AFTER this story's tuning lands.

This story **amends** existing services (`v1-jupiter.ts` chapter spec, `<v-chapter-copy>` registration, default camera-framing resolver) rather than introducing new services. The new behaviour:

- Narrows the v1-jupiter chapter window from the Story-4.1 placeholder ±30 days → the Story-4.5 spec ±5 days
- Extends `<v-chapter-copy>` to handle encounter-chapter slugs (currently only handles heliopause)
- Authors a chapter copy block for V1J (80–120 words, hand-written, fact-cited)
- Tunes the body-centered default framing for V1J so V1 + Jupiter + Io are visible together at closest approach

## Consumes

- **ChapterDirector** (Story 2.1) — for V1J substate transitions.
- **ViewFrame** (Story 4.1) — for the body-centered origin offset using chapter `targetBody: 5` (Jupiter).
- **VoyagerCameraController** (Story 4.2) — for the default-framing resolver hook.
- **MissionPhaseFSM** (Story 4.3) — already wired; V1J cold-load already fires Jupiter SOI replay (per Story 4.3 cycle-5 cold-load replay path).
- **`<v-timeline-scrubber variant="detail">`** (Story 4.4) — already wired; chapter-spec window-narrow flows through to detail scrubber's range automatically (no Story 4.5 changes to scrubber needed).
- **Epic 3 attitude system** — `<v-attitude-indicator>` already shows "CK reconstructed" during V1J windows.
- **`MISSION_FACTS.md`** — all cited facts (Io volcanism dates, Amalthea/Europa/Ganymede/Callisto sequence times, ring discovery references) must trace to this artifact.

## Acceptance Criteria

### AC1 — V1J chapter spec populated and window narrowed (±5 days)

- **GIVEN** the chapter spec at `web/src/chapters/specs/v1-jupiter.ts`
- **WHEN** I inspect it
- **THEN** the spec's fields are populated:
  - `slug: 'v1-jupiter'` (unchanged)
  - `name: 'Voyager 1 — Jupiter'` (unchanged)
  - `markerLabel: 'V1J'` (unchanged)
  - `anchorEt` = `etFromIso('1979-03-05T12:05:00Z')` (unchanged; matches `MISSION_FACTS.md ENCOUNTER_DATES[0].iso`)
  - `windowStartEt` = `anchorEt - 5 * 86400` (**narrowed from ±30 days to ±5 days** — Story 4.5 explicit spec; updates the Story 4.1 placeholder)
  - `windowEndEt` = `anchorEt + 5 * 86400`
  - `spacecraft: 'v1'` (unchanged)
  - `targetBody: 5` (Jupiter NAIF; unchanged from Story 4.1 AC5)
  - `ogDescription` (unchanged or refined for the narrower window framing)
- **AND** an additional `copy` field is added to `ChapterSpec` (extending `web/src/types/chapter.ts`) of type `EncounterChapterCopy` (defined alongside) — the field is optional on the union type so non-encounter chapters (cruise, pale-blue-dot, heliopause) need not populate it
- **AND** the copy field is populated for V1J with the structure `{ lede: string, body: string }` where `lede = 'V1 Jupiter.'` and `body` is 80–120 words of hand-written prose covering the Io volcano discovery (Linda Morabito's frame, 1979-03-08), the 48-hour sweep across Amalthea/Europa/Ganymede/Callisto, and the ring discovery (per the PRD encounter coverage table)

### AC2 — Hand-written chapter copy with `MISSION_FACTS.md` source citations

- **GIVEN** the chapter copy field populated in AC1
- **WHEN** I read it
- **THEN** every dated, distanced, named, or counted fact has a corresponding entry in `MISSION_FACTS.md` — no invented values
- **AND** the copy is between 80 and 120 words (word count enforced by a unit test in `web/src/chapters/specs/v1-jupiter.test.ts`)
- **AND** facts to cover, with the source-of-truth they trace to (extend `MISSION_FACTS.md` if a needed fact is missing — Rule 5 in spirit; the story file documents the additions):
  - Closest approach instant: 1979-03-05 12:05 UT (`ENCOUNTER_DATES[0]`)
  - Io volcano discovery (Linda Morabito, 1979-03-08, frame 0468J1-001 or comparable canonical citation)
  - Amalthea / Europa / Ganymede / Callisto flyby ordering and approximate times (extend `MISSION_FACTS.md` with a `V1J_INTERIOR_SWEEP_TIMELINE` table sourced from JPL final reports)
  - Ring discovery: V1 detected Jupiter's tenuous main ring on 1979-03-04 (extend `MISSION_FACTS.md`)
- **AND** the prose tone matches existing chapter copy (Stories 2.9 heliopause copy in `web/src/data/heliopause-copy.ts`) — declarative, present-tense, no editorial flourishes; visitor-facing

### AC3 — Body-centered camera framing tuned for V1J

- **GIVEN** the V1J chapter window is active (held state)
- **WHEN** the camera enters body-centered framing via `ViewFrame.getTransform`
- **THEN** the origin offset uses Jupiter (NAIF 5) per Story 4.1's `targetBody` wire-up (unchanged contract)
- **AND** the `VoyagerCameraController`'s default-framing resolver returns a chapter-specific framing for V1J:
  - Camera position offset from Jupiter centre tuned so that V1 + Jupiter + Io are visible together at closest approach
  - Distance / FOV chosen via visual review (lead drives the tuning iteration in the per-story smoke; final values committed to a new `chapterDefaultFraming` field on `ChapterSpec` OR a sibling resolver, your call — document the choice)
  - The framing values are written to the chapter spec (NOT magic numbers in the controller); a future story tuning V2J / V1S / V2S frames the same field per chapter
- **AND** the framing is stable across the chapter window — no per-frame jitter beyond what the existing smoothstep blend (Story 4.1) produces
- **AND** under reduced motion (`prefers-reduced-motion: reduce`), the framing is instant on chapter activation (zero blend duration — inherits Story 4.1's reduced-motion contract)

### AC4 — Scan platform articulation visible across the encounter

- **GIVEN** Epic 3's attitude system is operational (CK kernels furnished; `<v-attitude-indicator>` wired)
- **WHEN** I scrub through 1979-03-05 09:00 UT through 13:00 UT at 1× speed
- **THEN** the scan platform on the V1 model visibly articulates — the platform's pose changes over time as the CK data drives it (Epic 3 Story 3.4 wire-up; verified in the lead's smoke against the existing real-CK pipeline)
- **AND** the NA boresight cone sweeps from Io to Europa to Ganymede to Callisto in the historical sequence (validated against `docs/kernels/ckbrief-inventory.md` for V1J CK coverage; the exact sweep instants are recorded as a smoke-evidence note, not pinned in a fragile timestamp-equality assertion)
- **AND** `<v-attitude-indicator>` shows "ATT CK reconstructed" throughout the V1J window (no flicker to "Synthesized" — V1J has full CK coverage per the kernel inventory)

### AC5 — `<v-chapter-copy>` renders V1J copy in the right-side panel

- **GIVEN** the `<v-chapter-copy>` infrastructure from Story 2.9 (currently handles only heliopause chapters)
- **WHEN** the V1J window enters `held` state
- **THEN** the chapter copy panel renders V1J's lede + body on the right side of the viewport
- **AND** the lede uses serif `--v-size-chapter-copy-lg` weight 400 (matches Story 2.9 typography)
- **AND** the body uses serif `--v-size-chapter-copy` weight 350 in `--v-color-fg-muted` with max-width 32ch (matches Story 2.9)
- **AND** the panel fades in/out at window entry/exit per the existing chapter-copy fade rules (`--v-duration-base`; instant under reduced motion via the central token, not a per-component override)
- **AND** the lookup mechanism: extend the existing `chapterCopyForSlug` (or rename / split if cleaner — your call) to handle encounter chapter slugs OR introduce `encounterCopyForSlug` as a sibling pattern. The dev decides the cleanest extension; document the choice in Dev Notes.

### AC6 — Detail scrubber renders V1J date labels + V1J mission-scrubber marker is active

- **GIVEN** the detail scrubber from Story 4.4 + the active-chapter marker rendering on the mission scrubber (existing Story 2.2)
- **WHEN** the V1J window enters `held` state
- **THEN** the detail scrubber slides in with date-range labels:
  - Left label: "FEB 28" (V1J windowStartEt - 5 days, formatted via Story 4.4's `et-conversions` helpers)
  - Right label: "MAR 10, 1979" (V1J windowEndEt, year on right per AC1 of Story 4.4)
  - (Note: the Story 4.4 example "FEB 28" / "MAR 12" was for ±30d; now ±5d gives FEB 28 / MAR 10. The dev verifies the exact labels at runtime.)
- **AND** the active marker on the mission scrubber for V1J paints with `--v-color-accent` per Story 2.2's existing wire-up (no Story 4.5 changes — verify the marker correctly highlights now that the chapter window is narrower)

### AC7 — Integration AC (Rule 1): real ChapterDirector + real ViewFrame + real `<v-chapter-copy>` chain on V1J cold-load

- **GIVEN** this story extends `<v-chapter-copy>` to handle encounter chapters AND amends V1J chapter spec window
- **WHEN** Story 4.5 lands
- **THEN** `web/tests/v1j-encounter-end-to-end.test.ts` constructs:
  - A real `ChapterDirector` over `ALL_CHAPTERS`
  - A real `<v-chapter-copy>` instance wired to the director
  - A real `<v-timeline-scrubber variant="detail">` instance wired to the director (re-using Story 4.4's pattern)
  - A real `ViewFrame` instance wired to the director's active-chapter target body
- **AND** the test exercises:
  - Synthesize ET = V1J anchor (`1979-03-05T12:05:00Z`)
  - Walk the director from `out` → `entering` → `held` for V1J
  - Assert `<v-chapter-copy>` renders V1J's lede + body (DOM contains "V1 Jupiter.")
  - Assert the detail scrubber `aria-hidden="false"` and `aria-valuemin` / `aria-valuemax` match V1J's ±5d window
  - Assert `ViewFrame.getTransform(et)` returns a Jupiter-centered offset (origin shifted by the heliocentric Jupiter position at `et`)
  - Walk the director past `windowEndEt` to `exiting` → `passed`
  - Assert `<v-chapter-copy>` no longer renders V1J's lede (panel cleared)
  - Assert detail scrubber `aria-hidden="true"`

### AC8 — Lead-driven Chrome DevTools MCP smoke (Rule 3 + Rule 8)

- **GIVEN** Story 4.5 touches user-facing UI (chapter copy panel, default camera framing, narrow chapter window, ARIA labels)
- **WHEN** the lead drives the smoke after dev + QA + code-review complete
- **THEN** the lead navigates Chrome DevTools MCP to `/c/v1-jupiter` and verifies:
  - `__voyagerDebug.chapterDirector.activeChapter.slug === 'v1-jupiter'` AND `windowStartEt = anchorEt - 5 * 86400` AND `windowEndEt = anchorEt + 5 * 86400` (the ±5d narrowing landed)
  - `<v-chapter-copy>` panel is rendered with V1J's lede ("V1 Jupiter.") and body prose
  - Camera framing: jupiter mesh AND V1 spacecraft mesh AND Io mesh are all within the viewport bounds (no body offscreen at cold-load)
  - Detail scrubber's date labels read "FEB 28" / "MAR 10, 1979" (or the exact equivalents derived from the V1J window)
  - Mission scrubber's V1J marker is rendered with the accent color
  - `<v-attitude-indicator>` shows "ATT CK reconstructed"
  - Scrub forward to 1979-03-05 12:30 UT (25 minutes after closest approach); take a screenshot showing the scan platform pose has visibly changed from the closest-approach pose (Epic 3 articulation verification)
  - Console clean (modulo documented Lit dev banner + Story-4.3 cycle-7 KTX2-loaders advisory)
- **AND** smoke evidence captured under `_bmad-output/implementation-artifacts/4-5-smoke-evidence/`
- **AND** reverse-scrub mini-probe: scrub mission scrubber back to mission start (Home key); verify V1J detail panel + scrubber + marker all clear

### AC9 — Test sweep + lint baseline preserved + Rule-5 mission-facts amendment documented

- **GIVEN** the project's test pyramid post-Story-4.4 baseline: web vitest 2788 pass / 2 skipped; bake fast pytest 430/4/19
- **WHEN** Story 4.5 ships
- **THEN** web vitest pass count rises by the net new tests (estimate: +15 unit tests covering V1J chapter spec, copy word-count, ChapterSpec.copy field shape, encounter-chapter copy lookup, default-framing resolver, integration AC); bake pytest unchanged
- **AND** typecheck clean; lint baseline preserved (≤ 4 warnings; 0 new)
- **AND** any extension to `MISSION_FACTS.md` (V1J interior sweep timeline, ring discovery date) is documented per the existing artifact's citation conventions — primary sources only, dated, attributed to NASA / JPL / peer-reviewed papers. If a fact CANNOT be sourced to primary documentation, the dev halts and surfaces a clarification per Rule 5 (do NOT invent a value).
- **AND** the chapter-window narrowing (±30d → ±5d) is verified to NOT regress Story 4.3 / 4.4 functionality: Story 4.3's FSM SOI tracking is independent of the chapter window (FSM tracks SOI radius, not editorial window); Story 4.4's detail scrubber range auto-updates to the new window; Story 4.4's smoke evidence is documented as historical (pre-Story-4.5 ±30d state).

## Out of Scope (Defer to Specific Later Stories)

- **V2J, V1S, V2S chapter content** — Story 4.6.
- **V2U, V2N chapter content** — Story 4.7.
- **Gravity-assist visual validation** (annotated screenshot of V1's Jupiter swing) — Story 4.8.
- **L4 Playwright visual regression baseline** for V1J — Story 4.9 (captures the baseline AFTER this story's tuning lands; intentionally not in this story).
- **Reverse-scrub camera framing de-blend** — Story 4.1's translation-only smoothstep is symmetric on reverse scrub; this story doesn't introduce reverse-scrub-specific framing logic.
- **CK kernel coverage gap-fill** — if the smoke surfaces a CK coverage gap that flickers "Synthesized" within the V1J window, file as a deferred-work item; do not patch the kernel inventory in this story.

## Tasks / Subtasks

- [x] **T1: V1J chapter spec — window narrow + copy field** (AC1)
  - [x] T1.1: Narrow `web/src/chapters/specs/v1-jupiter.ts` window from ±30d to ±5d.
  - [x] T1.2: Extend `ChapterSpec` in `web/src/types/chapter.ts` with an optional `copy?: EncounterChapterCopy` field (type defined alongside).
  - [x] T1.3: Populate `copy` on V1J with the hand-written prose (AC2).

- [x] **T2: Hand-written chapter copy + mission-facts extension** (AC2)
  - [x] T2.1: Draft 80–120 words covering Io volcano discovery, 48-hour interior sweep (Amalthea/Europa/Ganymede/Callisto), ring discovery.
  - [x] T2.2: Extend `MISSION_FACTS.md` with any facts not already present (V1J interior sweep timeline, ring discovery date, Io volcanism reference). Cite primary sources only.
  - [x] T2.3: Word-count test in `web/src/chapters/specs/v1-jupiter.test.ts`.

- [x] **T3: Body-centered framing tuning** (AC3)
  - [x] T3.1: Add a `defaultFraming?: { distance: number; fov?: number; up?: [number,number,number]; ... }` (your call on shape) field to `ChapterSpec`. Populate for V1J.
  - [x] T3.2: `VoyagerCameraController` (Story 4.2) reads the chapter spec's `defaultFraming` on chapter activation; if absent, falls back to the existing default.
  - [x] T3.3: Unit test pins the framing values for V1J + the controller's chapter-spec read.
  - [x] T3.4: Lead drives the visual tuning in the smoke (AC8). Initial values are the dev's best estimate; the lead iterates if the smoke surfaces a tuning gap.

- [x] **T4: Scan platform articulation visual validation** (AC4)
  - [x] T4.1: No code change expected — this AC is a verification of existing Epic 3 wire-up. The lead drives the smoke to confirm articulation is visible.
  - [x] T4.2: If the smoke surfaces a CK coverage gap or articulation glitch, file as a separate finding (Story 4.5 may need a Rule 5 amendment to AC4 if articulation isn't actually visible across the full ±5d window).

- [x] **T5: `<v-chapter-copy>` encounter-chapter extension** (AC5)
  - [x] T5.1: Extend `<v-chapter-copy>` to handle encounter chapter slugs — wire the lookup to read from `ChapterSpec.copy` directly (or via an `encounterCopyForSlug` lookup; dev's choice).
  - [x] T5.2: Unit + integration tests pin the V1J copy renders on `held`.

- [x] **T6: Detail scrubber date-label spot-check + mission-scrubber marker** (AC6)
  - [x] T6.1: No code change expected for Story 4.4's auto-range-binding; this AC verifies the labels render correctly with the new ±5d window.
  - [x] T6.2: Spot-check the mission-scrubber V1J marker color in the smoke.

- [x] **T7: Integration AC test** (AC7)
  - [x] T7.1: Author `web/tests/v1j-encounter-end-to-end.test.ts` per AC7.

- [x] **T8: AC8 smoke prerequisites**
  - [x] T8.1: Document smoke probe plan in this file's `## Smoke probe plan (AC8)` section.

- [x] **T9: Final sweep + Rule-5 mission-facts amendment audit** (AC9)

## Dev Notes

### Critical files Story 4.5 touches

- `web/src/chapters/specs/v1-jupiter.ts` (modify — window narrow + copy field)
- `web/src/chapters/specs/v1-jupiter.test.ts` (NEW or extend — word-count + spec-shape tests)
- `web/src/types/chapter.ts` (modify — extend `ChapterSpec` with optional `copy` + optional `defaultFraming` fields)
- `web/src/components/v-chapter-copy.ts` (modify — encounter-chapter slug pattern + lookup)
- `web/src/components/v-chapter-copy.test.ts` (extend)
- `web/src/render/voyager-camera-controller.ts` (modify — read chapter spec's `defaultFraming` field if present)
- `MISSION_FACTS.md` (extend — V1J interior sweep timeline, ring discovery date, Io volcanism citation)
- `web/tests/v1j-encounter-end-to-end.test.ts` (NEW — Integration AC per Rule 1)

### Story 4.4 reference point (preserved)

Story 4.4's smoke captured the V1J state with the ±30d window. After Story 4.5 lands ±5d, the smoke values change: detail scrubber's `aria-valuemin`/`aria-valuemax` shift from `[anchor − 30d, anchor + 30d]` to `[anchor − 5d, anchor + 5d]`. This is INTENTIONAL — Story 4.4's smoke evidence file is correct for its time but becomes historical context.

### Rule 5 candidate — chapter copy prose word count

The 80–120 word range is from the original epic spec. If the V1J copy genuinely needs more than 120 words to honour the historical record (or fewer than 80 words is enough), amend the AC in place per Rule 5 with the rationale documented in Dev Agent Record. Do NOT pad prose to hit a word count.

### Rule 5 candidate — chapter window edge selection

If the visual smoke at AC8 surfaces that ±5 days is too narrow OR too wide (e.g., the detail scrubber's range covers too little of the gravity-assist swing for the scrubber to be useful), amend AC1's window in place per Rule 5 with the rationale documented. The ±5d came from the epic spec; the visual-review check is the lead's final pass.

### NFR / ADR compliance pointers

- **FR21 (V1 Jupiter encounter chapter complete)**: AC1 + AC2 + AC5 close this.
- **FR30 (six gas-giant encounters total)**: V1J portion only — Stories 4.6 / 4.7 close the rest.
- **UX-DR8 (chapter copy panel)**: AC5 honours the existing pattern.
- **`<v-chapter-copy>` Light-DOM idiom (ADR-0013, Story 2.9 lesson)**: T5 must preserve the Light-DOM render-root.
- **Rule 5 candidates documented in Dev Notes above** — dev surfaces any tripwire that fires during implementation.

## Smoke probe plan (AC8) — for the lead's Chrome DevTools MCP

Probes stored under `_bmad-output/implementation-artifacts/4-5-smoke-evidence/`.

**Pre-probe environment:**
- `cd web && pnpm dev`
- Navigate to `http://localhost:5173/c/v1-jupiter`

**Probe 1 — Chapter window narrowed to ±5 days:**

```js
const ch = window.__voyagerDebug.chapterDirector.activeChapter;
const FIVE_DAYS_SEC = 5 * 86400;
return {
  slug: ch.slug,
  windowSpanSec: ch.windowEndEt - ch.windowStartEt,
  expectedSpanSec: 10 * 86400,
  pass: Math.abs((ch.windowEndEt - ch.windowStartEt) - 10 * 86400) < 1,
};
```

**Probe 2 — `<v-chapter-copy>` panel renders V1J lede:**

```js
const panel = document.querySelector('v-chapter-copy');
const text = panel?.textContent ?? '';
return { textPreview: text.slice(0, 60), hasLede: text.includes('V1 Jupiter.') };
```

**Probe 3 — V1 + Jupiter + Io all in viewport:**

```js
const scene = window.__voyagerDebug.renderEngine.scene;
const cam = window.__voyagerDebug.renderEngine.camera;
const v1 = (() => { let n=null; scene.traverse(o=>{ if (o.name==='voyager-1') n=o; }); return n; })();
const jup = (() => { let n=null; scene.traverse(o=>{ if (o.name==='celestial-5') n=o; }); return n; })();
const io = (() => { let n=null; scene.traverse(o=>{ if (o.name==='celestial-501') n=o; }); return n; })();
// Inverse-project each world position to clip space; assert all are within [-1, 1]^3.
// Visible criterion: x,y in [-1.05, 1.05] (small margin for partial-mesh visibility).
```

**Probe 4 — Detail scrubber date labels match ±5d window:**

Read the detail-variant scrubber's shadow-DOM `.range-label-left` and `.range-label-right` text content. Expected: "FEB 28" left, "MAR 10, 1979" right (V1J ±5d).

**Probe 5 — Attitude indicator shows "CK reconstructed":**

```js
const ind = document.querySelector('v-attitude-indicator');
const text = ind?.textContent ?? '';
return { hasCkReconstructed: text.includes('CK reconstructed') };
```

**Probe 6 — Scan platform articulation visible:**

Capture screenshot at V1J anchor (1979-03-05 12:05 UT). Scrub forward to 1979-03-05 12:30 UT via `__voyagerDebug.clockManager.scrubTo(anchorEt + 1500)` (25 minutes later). Capture second screenshot. Visually compare scan platform pose — should differ.

**Probe 7 — Reverse-scrub mini-probe:**

Press `Home` on mission scrubber. Wait 1.5s. Verify V1J detail panel cleared, V1J marker no longer accent-colored.

**Evidence capture:**
- Two screenshots at V1J anchor + (anchor + 25 min) to show scan platform articulation.
- Screenshot of V1J cold-load with v-chapter-copy panel visible.
- Console message list — expected clean modulo documented baseline.

## References

- Epic 4 spec for Story 4.5: `_bmad-output/planning-artifacts/epics.md:1722-1758`
- Story 2.1 ChapterDirector: `web/src/services/chapter-director.ts`
- Story 2.9 `<v-chapter-copy>`: `web/src/components/v-chapter-copy.ts`
- Story 4.1 ViewFrame: `web/src/services/view-frame.ts`
- Story 4.2 VoyagerCameraController: `web/src/render/voyager-camera-controller.ts`
- Story 4.3 MissionPhaseFSM + textures + moons: committed `7e60dd9`
- Story 4.4 detail scrubber: committed `9b9c1d1`
- Epic 3 attitude pipeline + `<v-attitude-indicator>`: `web/src/components/v-attitude-indicator.ts`
- Existing chapter spec: `web/src/chapters/specs/v1-jupiter.ts`
- Existing heliopause copy module: `web/src/data/heliopause-copy.ts`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]` — invoked under
`/epic-cycle` bmad-dev-story skill on 2026-05-23.

### Debug Log References

- web vitest: 2817 passed / 2 skipped / 161 files (baseline 2788 + 29 net new).
- bake fast pytest: 430 passed / 4 skipped / 19 deselected — unchanged baseline.
- typecheck (`tsc --noEmit`): clean.
- lint (`eslint .`): 4 warnings (baseline preserved; 0 new).
- web build (`npm run build`): clean — refreshed dist/og/ + dist/c/ artifacts
  after the `ogDescription` change in `v1-jupiter.ts`.

### Completion Notes List

**Rule-5 candidates (both NOT triggered — implementation proceeded against
the original AC text):**

1. AC2 word count band (80–120): drafted prose lands at **97 words** —
   comfortable inside the band. No amendment required.
2. AC1 window edge (±5d): the ±5d window comfortably contains the V1J
   interior sweep (Amalthea CA at anchor − 5h11m through Callisto CA at
   anchor + 1d05h03m), the ring-discovery frame (1979-03-04, anchor − 1d),
   and Linda Morabito's volcano discovery (1979-03-08, anchor + 3d). If
   the lead's Chrome DevTools MCP smoke (AC8) surfaces that ±5d is too
   narrow or wide for the detail scrubber to be useful, this is a per-
   story amendment with rationale documented here. Today: not triggered.

**Implementation decisions:**

- **`ChapterSpec.copy` shape**: chose `{ lede: string, body: string }`
  (single body string) rather than mirroring the `HeliopauseCopy`
  `paragraphs[]` shape. Encounter copy is a single 80–120 word block per
  the PRD encounter coverage table; a single string keeps the shape
  minimal. The `<v-chapter-copy>` render path wraps the body in a
  one-element array internally so the existing `<h2>` + `<p>` skeleton
  serves both copy shapes.
- **`<v-chapter-copy>` lookup extension**: introduced an internal
  `copyForChapter(chapter)` helper that dispatches between
  `heliopauseCopyForSlug(slug)` (Story 2.9 ADR-0021 wire-up preserved)
  and the new `ChapterSpec.copy` field (Story 4.5). The two stay
  parallel rather than collapsed because heliopause copy lives in its
  own module per ADR-0021; the encounter copy lives on the spec because
  it's tightly bound to the chapter's window + framing data.
- **`defaultFraming` shape**: `{ offsetKm: [x, y, z], upWorld?:
  [x,y,z], fovDeg? }`. Offset is in render-space kilometers relative to
  the active body's position; `upWorld` defaults to `[0, 1, 0]` (J2000
  ecliptic +Z aligns with render-space +Y per the renderer's basis).
  `fovDeg` is reserved for future stories (Story 4.5 ignores it).
- **Default-framing resolver location**: created a new pure helper
  module `web/src/chapters/chapter-default-framing.ts` exposing
  `resolveChapterDefaultFraming(chapter, activeTarget)` returning a
  `DefaultFramingTarget | null`. This is wired into the
  `VoyagerCameraController` via `main.ts`'s constructor option (the
  controller already had a `resolveDefaultFraming` slot from Story 4.2;
  Story 4.5 fills it). The helper is pure so unit tests can pin the
  math without standing up the full controller.
- **V1J `defaultFraming.offsetKm` values**: chose
  `[1_000_000, 1_500_000, 2_500_000]` km — pulls the camera back ~2.5 Mm,
  lifts ~1.5 Mm above Jupiter's equator, and pans ~1 Mm to one side so
  Io's orbital position (~421,700 km from Jupiter center) is in frame.
  V1's closest-approach altitude is ~349,000 km; the offset magnitude
  (~3 Mm) frames all three bodies. Final values may be tuned by the
  lead's MCP smoke (AC8 Probe 3) if the visual review surfaces a gap.

**Test-amendment audit (Story-4.5 ±5d window narrowing knock-on):**

- `web/src/components/v-timeline-scrubber.test.ts` "at anchor + 10 days:
  ArrowRight steps by 3600 seconds (hourly tier)" — updated to use
  anchor + 3 days. With the new ±5d window, anchor + 10 days lands
  outside the held window and the detail variant's tier doesn't fire.
  Anchor + 3 days exercises the same hourly tier (>2 days = past the
  1min band; <30 days = still hourly) inside the held window.
- `web/tests/v-timeline-scrubber-detail-qa.test.ts` "lazy step
  recompute" — same amendment, anchor + 5 days → anchor + 3 days. With
  ±5d window, anchor + 5d lands at `windowEndEt` exactly; ArrowRight
  clamps to zero. Anchor + 3 days exercises the hourly tier cleanly.

**Test-pyramid additions (Story 4.5 net contributions):**

- `web/src/chapters/specs/v1-jupiter.test.ts` — 15 tests (spec shape,
  window width, copy.lede, copy.body word count + fact citations,
  defaultFraming shape).
- `web/src/chapters/chapter-default-framing.test.ts` — 6 tests
  (resolver null branches, position offset math, lookAt quaternion,
  upWorld override).
- `web/src/components/v-chapter-copy.test.ts` — replaced 2 "V1J does
  NOT render copy" tests with 2 new "V1J encounter copy renders + clears"
  tests + 1 added "launch-v1 has no copy" guard. Net +1 test.
- `web/tests/v1j-encounter-end-to-end.test.ts` — 5 tests covering AC7
  (real ChapterDirector × real ViewFrame × real `<v-chapter-copy>` ×
  real `<v-timeline-scrubber variant="detail">` end-to-end).
- Total net new web tests: +29 (15 + 6 + 1 + 5 + 2 minor updates).

**MISSION_FACTS.md amendments (per Rule 5 — primary sources only):**

- Added § "Voyager 1 Jupiter encounter — interior sweep timeline":
  Amalthea / Io / Europa / Ganymede / Callisto closest-approach UTC
  instants, sourced from NASA SP-439 Appendix A.
- Added § "Voyager 1 Jupiter ring discovery (1979-03-04)": detection
  frame ID FDS 16383.54, sourced from Smith et al. *Science* 204, 951
  (1979) and NASA SP-439 § 8.
- Added § "Voyager 1 Io volcanic activity discovery (1979-03-08)":
  L. Morabito frame `FDS 16390.29` / `0468J1-001`, sourced from
  Morabito et al. *Science* 204, 972 (1979).
- Extended § "Editorial chapter copy" with the Story 4.5 encounter-
  copy field reference + V1J citation trail.

### File List

**Modified:**

- `web/src/types/chapter.ts` — extended `ChapterSpec` with optional
  `copy?: EncounterChapterCopy` and `defaultFraming?: ChapterDefaultFraming`
  fields; added type definitions.
- `web/src/chapters/specs/v1-jupiter.ts` — narrowed window from ±30d to
  ±5d; populated `copy` with hand-written prose; populated
  `defaultFraming` with V1J-tuned camera offset.
- `web/src/components/v-chapter-copy.ts` — extended the slug-lookup with
  the encounter-chapter copy path via the new `copyForChapter` helper;
  replaced the `HeliopauseCopy` internal type with `ChapterCopyBlock` for
  uniformity.
- `web/src/components/v-chapter-copy.test.ts` — replaced V1J-ignored
  assertions with V1J-renders assertions; added launch-v1 ignored guard.
- `web/src/components/v-timeline-scrubber.test.ts` — amended the
  "anchor + 10 days" hourly-tier test to use "anchor + 3 days" (±5d
  window narrowing knock-on).
- `web/src/main.ts` — wired the V1J default-framing resolver into
  `VoyagerCameraController.resolveDefaultFraming` via the new helper.
- `web/tests/v-timeline-scrubber-detail-qa.test.ts` — amended the lazy
  step recompute test (anchor + 5d → anchor + 3d).
- `MISSION_FACTS.md` — added V1J interior sweep timeline, ring discovery,
  Io volcanism discovery sections; extended editorial chapter copy note.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — marked
  Story 4.5 in-progress → review.

**Created:**

- `web/src/chapters/chapter-default-framing.ts` — pure helper resolving
  `ChapterSpec.defaultFraming` into a `DefaultFramingTarget`.
- `web/src/chapters/chapter-default-framing.test.ts` — 6 unit tests.
- `web/src/chapters/specs/v1-jupiter.test.ts` — 15 unit tests (spec
  shape + copy + defaultFraming).
- `web/tests/v1j-encounter-end-to-end.test.ts` — 5 integration tests for
  AC7.
- `_bmad-output/implementation-artifacts/4-5-smoke-evidence/README.md` —
  smoke evidence directory placeholder for the lead's AC8 MCP smoke.

### Change Log

- 2026-05-23 — Story 4.5 dev: extended ChapterSpec with copy +
  defaultFraming fields; narrowed V1J window from ±30d to ±5d; populated
  V1J editorial copy (97 words, all facts cited to MISSION_FACTS.md);
  tuned V1J default camera framing offset; extended `<v-chapter-copy>`
  to render encounter copy from ChapterSpec.copy; wired
  chapter-default-framing resolver into VoyagerCameraController via
  main.ts. Added 29 net new web tests across 4 new test files + 2
  amended files; bake tests unchanged; typecheck clean; lint baseline
  preserved at 4 warnings. MISSION_FACTS.md extended with V1J interior
  sweep timeline + ring discovery + Io volcanism discovery sections
  (primary sources only — NASA SP-439, Smith et al. *Science* 204
  (1979), Morabito et al. *Science* 204 (1979)). Two Rule-5 candidates
  flagged in story Dev Notes: NEITHER triggered — copy lands at 97
  words (inside 80–120 band); ±5d window accommodates the full
  encounter geometry without amendment.
- 2026-05-23 — Story 4.5 QA: added `web/tests/story-4-5-v1j-encounter-qa-gaps.test.ts`
  (35 tests across 8 gap priorities: word-count helper canonical-split
  defense, MISSION_FACTS.md regex audit, heliopause regression,
  resolver fallback, detail-scrubber range derivation, DOM-attribute
  defense, controller restore wire-up, optionality canaries). Web
  vitest: 2852 pass / 2 skip; no regressions; typecheck clean; lint
  baseline preserved.
- 2026-05-23 — Story 4.5 code-review: clean review across all ten
  orchestrator focus areas and Rule 1/3/5/6/10/11 gates. 0
  `decision_needed`, 0 `patch`, 0 `defer`, 0 `dismiss`. Verifications:
  Rule 1 integration AC uses real ChapterDirector × ViewFrame ×
  `<v-chapter-copy>` × `<v-timeline-scrubber variant="detail">`
  (EphemerisService.getPosition stub only — appropriate per Story 4.1
  end-to-end test rationale); Rule 5 audit documented for both
  candidates (neither triggered); Rule 6 ADR-0013 + ADR-0021 honoured
  (Light DOM preserved, heliopause-copy.ts untouched, encounter copy
  on ChapterSpec.copy matches ADR-0021's "copy field of ChapterSpec"
  wording); Rule 10 N/A (no Lit reactive properties added); Rule 11
  N/A (no build-pipeline scripts touched); knock-on test amendments
  minimal (anchor+10d → anchor+3d; anchor+5d → anchor+3d) preserving
  hourly-tier intent; MISSION_FACTS.md citations are all primary
  (NASA SP-439, Smith et al. 1979, Morabito et al. 1979); copy +
  defaultFraming fields optional with no `as` casts. Vitest 2852
  pass / 2 skip; typecheck clean; lint 4 warnings (baseline).

### Review Findings

No findings. The dev + QA implementation cleanly satisfies all nine
acceptance criteria across the focus areas the code-review stage
audits.

- **Rule 1 (Integration AC):** `web/tests/v1j-encounter-end-to-end.test.ts`
  exercises a real ChapterDirector × real `<v-chapter-copy>` × real
  `<v-timeline-scrubber variant="detail">` × real ViewFrameService.
  Only `EphemerisService.getPosition` is stubbed (synthetic Jupiter
  position); per the test header rationale, the heliocentric position
  numerics are exercised end-to-end by Story 4.1 AC7's existing
  manifest-driven test. Verdict: PASS.

- **Rule 3 (Smoke probe plan):** `## Smoke probe plan (AC8)` section
  present in story file (lines 233-298), seven probes with concrete
  JS, expected outcomes, and evidence path. Lead-driven smoke is the
  next stage. Verdict: PASS.

- **Rule 5 (NFR tripwire audit):** Both Rule-5 candidates (AC2 word
  count, AC1 window edge) documented in Dev Agent Record §
  Completion Notes with quantitative rationale — 97 words inside
  [80, 120]; ±5d encompasses ring discovery (anchor-1d), Amalthea CA
  (anchor-5h11m), Callisto CA (anchor+1d05h), Morabito frame
  (anchor+3d). No amendment triggered. Verdict: PASS.

- **Rule 6 (ADR compliance):**
  - ADR-0013 (Lit 3, no decorators): `<v-chapter-copy>` preserves
    `createRenderRoot(): HTMLElement { return this; }` (Light DOM),
    no `@property`/`@state`/`@customElement` decorators introduced;
    `customElements.define('v-chapter-copy', VChapterCopy)` pattern
    retained.
  - ADR-0021 (chapter copy in TS template literals): the new
    `EncounterChapterCopy` lives inline in the chapter spec
    (`web/src/chapters/specs/v1-jupiter.ts` as a `Object.freeze({...})`
    template literal). The Story 2.9 `web/src/data/heliopause-copy.ts`
    module is untouched; the new `copyForChapter` dispatch in
    `<v-chapter-copy>` calls `heliopauseCopyForSlug(slug)` first
    (preserving the Story-2.9 wire-up) and falls through to
    `chapter.copy` for encounter chapters (matching ADR-0021's
    "copy is the `copy` field of the `ChapterSpec`" wording). The
    two paths coexist; nothing collapsed.
  - Verdict: PASS.

- **Rule 10 (Lit declare+ctor):** `<v-chapter-copy>` declares NO new
  Lit reactive properties (no `static properties = {}` block). All
  new state is plain private fields with explicit `requestUpdate()`
  flushes — same pattern as Story 2.9. Rule 10 only governs Lit
  reactive properties; does not apply here. Verdict: PASS.

- **Rule 11 (build-pipeline E2E):** Story 4.5 touches no script
  under `web/scripts/` or `bake/src/`. The `og-cards` rebuild noted
  in cycle-log is the existing Story 1.x build chain firing after
  the `ogDescription` field refinement, not a new pipeline. Verdict:
  N/A.

- **Knock-on test amendments to Story 4.4:** both amendments
  (`v-timeline-scrubber.test.ts:1376` anchor+10d → anchor+3d;
  `v-timeline-scrubber-detail-qa.test.ts:690` anchor+5d → anchor+3d)
  are data-pin updates necessitated by the ±30d → ±5d window
  narrowing. Test titles updated to describe the new anchor offset;
  comments added explaining the motivation. Test intent (exercise
  the hourly tier inside the held window) preserved. These are NOT
  Rule-5 NFR amendments — they are spec-driven test-data updates.
  Verdict: PASS.

- **MISSION_FACTS.md citations:** every new entry cites primary
  sources — NASA SP-439 Appendix A (interior sweep table), Smith
  et al., *Science* 204, 951 (1979) + NASA SP-439 § 8 (ring
  discovery), Morabito et al., *Science* 204, 972 (1979) (Io
  volcanism). No Wikipedia, no secondary citations. Frame-identifier
  dual-form (FDS 16390.29 ↔ 0468J1-001) properly disambiguated.
  Verdict: PASS.

- **Field optionality:** `ChapterSpec.copy?` and `ChapterSpec.defaultFraming?`
  are `?:` optional. The resolver at
  `web/src/chapters/chapter-default-framing.ts:46` returns `null` when
  `chapter.defaultFraming === undefined`. The dispatch at
  `web/src/components/v-chapter-copy.ts:41` checks
  `if (chapter.copy !== undefined)`. QA gap 8 explicitly asserts
  `ALL_CHAPTERS.filter(c => c.copy !== undefined).length === 1` and
  `ALL_CHAPTERS.filter(c => c.defaultFraming !== undefined).length === 1`
  AND enumerates the ten clean non-encounter slugs. No `as` casts.
  Verdict: PASS.

- **Verification gates:** Web vitest 162 files / 2852 pass / 2 skip
  (matches QA baseline exactly, no regressions); TypeScript `tsc
  --noEmit` clean; ESLint 4 warnings (all preexisting in
  `skybox.ts`, `ephemeris-service.ts`, `celestial-defense-extended.test.ts`
  — baseline preserved, 0 new). Verdict: PASS.

### Cycle-2 smoke fix (2026-05-23)

The lead's cycle-1 Chrome DevTools MCP smoke surfaced an AC3 wire-up
gap. Probes 1, 2, 4, 5 passed (window narrow ±5d; chapter copy renders
"V1 Jupiter." lede + 97-word body; detail scrubber `aria-label` +
`aria-valuemin/max` match V1J window; `<v-attitude-indicator>` shows
"CK reconstructed"). **Probe 3 FAILED:** V1 NDC `(13.228, 29.762)`,
Jupiter NDC `(null, null)` (behind camera), Io NDC `(90.386, -164.11)`
— with `camera.position = (0, 0, 0)` (embedded inside Jupiter at world
origin post-floating-origin recenter).

**Root cause:** `resolveDefaultFraming` closure registered in the
controller's constructor option but never CALLED on chapter activation.
The Story 4.2 R-key restore path called it (works); no equivalent
auto-trigger on `ChapterDirector` `to === 'held'` transitions. Same
shape as Story 4.3 cycle-5's cold-load SOI replay miss — the contract
was correct, the consumer code path didn't fire automatically. The
unit-tier was invisible to this because the resolver returned the
correct framing target whenever called; the gap was that nobody called
it.

**Cycle-2 fix:**

1. Refactored `VoyagerCameraController.restore()` to delegate to a new
   public method `applyDefaultFraming({ animated: boolean })`. The
   shared implementation reads the wired `resolveDefaultFraming`
   closure, resolves the target, then either tweens (animated) or
   assigns (instant) the camera position + quaternion. `restore()` is
   now a one-line wrapper `applyDefaultFraming({animated: true})`,
   backwards-compatible with Story 4.2 R-key + button-click paths.
2. Added a `ChapterDirector` subscriber in `main.ts` that fires
   `applyDefaultFraming({animated: true})` on `to === 'held'`
   transitions when the chapter has `defaultFraming` AND
   `ephemerisServiceRef`/`viewFrameServiceRef` are live AND
   `manualCameraActive` is false (user hasn't intervened). Suppression
   gates prevent the framing from overriding a user's manual gesture.
3. Added a cold-load framing replay after
   `prefetchCelestialBodyChunks` resolves (mirroring Story 4.3
   cycle-5's one-shot SOI replay): if `activeChapter` has
   `defaultFraming` and the manual flag is off, call
   `applyDefaultFraming({animated: false})` once. Instant on cold-load
   because the camera starts at (0, 0, 0); a 400ms tween from origin
   to a 3-Mm-out framing would be a jarring pull-back.

**Cycle-2 tests added:** new `Story 4.5 AC3 — applyDefaultFraming
wires the controller` block in
`web/tests/v1j-encounter-end-to-end.test.ts` — 5 tests covering:
V1J framing instant (cold-load path), V1J framing animated (runtime
transition path), `manualCameraSuspended` PBD no-op,
fallback path for a chapter without `defaultFraming` (e.g. heliopause —
controller's `defaultFramingFallback` takes over, no throw),
`restore()` delegation regression-pin (Story 4.2 backwards-compat).

**Web vitest baseline:** 162 files / 2857 pass / 2 skip (+5 from
cycle-1 + QA baseline of 2852). Typecheck clean; lint 4 warnings
preserved; build clean (re-emitted `dist/og/` and per-chapter HTML
shells after `ogDescription` and the controller refactor).

**Re-smoke expectation (iter-2):** Probe 3 V1 + Jupiter + Io all
within NDC `[-1, 1]^2`. Lead may iterate on `offsetKm` values in
`web/src/chapters/specs/v1-jupiter.ts` if the visual review surfaces
a framing-tuning gap (Rule 5 in spirit per the story's `## Dev Notes
§ Rule 5 candidate — chapter window edge selection`, but specifically
for the offsetKm values, not the window edges).

### Cycle-2 Files Modified (additional, beyond cycle-1)

- `web/src/render/voyager-camera-controller.ts` — added public
  `applyDefaultFraming({animated})` method; `restore()` now delegates.
- `web/src/main.ts` — added `ChapterDirector` `held` subscriber for
  framing + cold-load framing replay after celestial-body prefetch.
- `web/tests/v1j-encounter-end-to-end.test.ts` — 5 new defense tests
  for the cycle-2 wire-up.
