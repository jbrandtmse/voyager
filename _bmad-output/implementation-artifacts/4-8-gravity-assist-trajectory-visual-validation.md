# Story 4.8: Gravity-Assist Trajectory Visual Validation

**Epic:** 4 — Encounter Chapters (All Six Gas-Giant Flybys)
**Status:** in-progress (scaffolding pass complete; awaiting lead's screenshot capture per AC1/AC7)
**Date created:** 2026-05-23

## User Story

As the project maintainer,
I want a documented visual validation that the gravity-assist mechanism at each of the six encounters is **visually legible** — a layperson can see the planet pulling and redirecting the spacecraft,
So that FR11 is verified beyond the numerical-accuracy gate from NFR-P9, and the V1 Saturn ecliptic-exit and V2 Triton-bend dramatic moments land.

## Consumed-by

- **Story 4.9** (L4 Playwright visual regression): the framing decisions ratified here are inputs to the eight pinned baseline scenes.
- **Epic 7** (friendly-user testing): the validation document is the canonical "is the gravity-assist legible at this encounter" reference if a tester flags an ambiguous bend.

This story produces a **documentation artifact** (`docs/visual-validation/gravity-assists.md`) plus six annotated screenshots. It does NOT introduce new runtime code, but it MAY surface tuning iterations (per AC3) that result in chapter-spec `defaultFraming` adjustments OR trajectory-line styling tweaks (the latter would touch `web/src/render/`). The dev's call on scope.

## Consumes

- All six encounter chapters from Stories 4.5 / 4.6 / 4.7 (V1J, V2J, V1S, V2S, V2U, V2N).
- Existing trajectory-line rendering (Story 1.5+ / RenderEngine).
- `MISSION_FACTS.md` — every commentary citation traces to this artifact.
- Chrome DevTools MCP — the canonical screenshot capture driver.

## Acceptance Criteria

### AC1 — Six annotated screenshots, one per encounter

**Rule 5 amendment (2026-05-23, lead-driven during AC8 smoke).** The original AC called for screenshots in **heliocentric framing** showing the inbound + closest-approach + outbound geometry of each bend. The current production app doesn't expose a clean heliocentric system-view camera mode — the only auto-applied framing is the body-centered `applyDefaultFraming` subscriber landed in Stories 4.5–4.7. Building a heliocentric system-view camera mode is genuinely a separate piece of work (Epic 6 polish candidate or its own sub-story). For Story 4.8 to ship, AC1 is amended in place: the deliverable is **six body-centered closest-approach screenshots** — the planet at the centered origin, the spacecraft visible nearby at the moment of closest approach. The deferred-to-future-story scope is the system-wide bend visualisation; the validation document inline-documents the deferral.

- **GIVEN** a manual review pass at each of the six encounter anchor ETs
- **WHEN** the lead opens the simulation in dev mode at each anchor (in **body-centered chapter framing** per the Rule 5 amendment above — the same view a user gets when navigating to `/c/<slug>`)
- **THEN** for each encounter (V1J, V2J, V1S, V2S, V2U, V2N), the lead captures an annotated screenshot showing the encounter geometry at closest approach (planet at center, spacecraft visible)
- **AND** screenshots stored at `docs/visual-validation/screenshots/<chapter-slug>.png`
- **AND** the validation document includes per-section deferral markers ("Post-encounter bend visualization deferred") for V1S Titan-slingshot ecliptic-exit and V2N Triton-bend, naming the future heliocentric-camera-mode story as the follow-up.

### AC2 — Validation document at `docs/visual-validation/gravity-assists.md`

- **GIVEN** the validation deliverable
- **WHEN** I open `docs/visual-validation/gravity-assists.md`
- **THEN** the document contains six sections (one per encounter) with the annotated screenshot embedded + brief commentary on what makes the bend visible
- **AND** the V1S section explicitly documents the Titan slingshot bending V1 out of the ecliptic plane (referenced from Story 4.6)
- **AND** the V2N section explicitly documents the Triton flyby bending V2 sharply south of the ecliptic (FR12, referenced from Story 4.7)
- **AND** every dated, distanced, or named fact in the commentary cites `MISSION_FACTS.md`

### AC3 — Tuning iteration loop closure

- **GIVEN** any encounter whose bend is not visually apparent at default chapter framing
- **WHEN** the lead identifies the issue (e.g., camera zoom too tight, line color too quiet, framing centered on wrong axis)
- **THEN** the dev iterates on the chapter spec's `defaultFraming` OR the trajectory-line styling until the gravity-assist mechanism is visually legible to a layperson
- **AND** the iteration is committed in the same change-set as Story 4.8
- **AND** the validation document is updated to reflect the final tuned framing

### AC4 — Living-artifact contract

- **GIVEN** the validation document is a living artifact
- **WHEN** Epic 7's friendly-user testing (or earlier feedback) flags an encounter whose bend reads ambiguously
- **THEN** this story's iteration loop is re-entered (the document is the canonical reference)
- **AND** the document includes a brief "Update protocol" section describing how to refresh a screenshot + commentary

### AC5 — Test sweep + lint baseline preserved

- **GIVEN** post-Story-4.7 baseline: web vitest 3057 / 2 skipped / 170 files
- **WHEN** Story 4.8 ships
- **THEN** any chapter-spec `defaultFraming` tuning that happens during AC3 must NOT regress existing tests (web vitest count holds at ≥ 3057; chapter-spec test pins update in lockstep if framing values change — Rule 5 minimal-data-pin amendment)
- **AND** typecheck clean; lint baseline preserved
- **AND** if trajectory-line styling changes, the existing visual / DOM tests pin the new state (or are amended to do so)

### AC6 — Integration AC (Rule 1): document references real artifacts

- **GIVEN** Story 4.8 is documentation-centric
- **WHEN** the validation document references screenshot files
- **THEN** every referenced screenshot file actually exists at the cited path on disk (test: simple file-existence assertion via a new `web/tests/visual-validation-docs.test.ts` OR a node-based test under `bake/tests/test_visual_validation_docs.py` — dev's call)
- **AND** every cited `MISSION_FACTS.md` section actually exists (regex audit against the live MISSION_FACTS.md content)

### AC7 — Lead-driven Chrome DevTools MCP smoke (per-encounter screenshot capture)

- **GIVEN** Story 4.8's deliverable IS the lead-captured screenshots
- **WHEN** the lead drives the smoke
- **THEN** the lead navigates Chrome DevTools MCP to each encounter's anchor ET in heliocentric framing, captures the annotated screenshot, and stores at `docs/visual-validation/screenshots/<chapter-slug>.png`
- **AND** for V1S + V2N, the lead also captures a post-encounter screenshot showing the bend continuing past the encounter window (V1S: ~1981-06-01 to show ecliptic exit; V2N: ~1995-01-01 to show southern bend)
- **AND** the validation document references these screenshots inline

### AC8 — Final sweep

- **GIVEN** the deliverable is documentation
- **WHEN** Story 4.8 ships
- **THEN** the validation document is committed at `docs/visual-validation/gravity-assists.md`
- **AND** all six per-encounter screenshots are committed at `docs/visual-validation/screenshots/`
- **AND** any chapter-spec `defaultFraming` tuning + trajectory-line styling changes are committed in the same change-set

## Out of Scope (Defer)

- **L4 Playwright visual regression baselines** — Story 4.9. Story 4.8 establishes the framing; 4.9 captures the regression baselines.
- **Trajectory-line color / width / opacity overhaul** — out of scope unless a specific encounter's bend cannot be made legible without it. Default trajectory-line rendering is Story 1.5+ existing.
- **Satellite-moon visibility in the bend frames** — gated on satellite SPK kernel procurement (Story 4.3 cycle-4 follow-up).

## Tasks / Subtasks

- [ ] **T1: Per-encounter heliocentric framing capture** (AC1, AC7) — *lead-driven, NOT in scaffolding pass*
  - [ ] T1.1: For each of V1J, V2J, V1S, V2S, V2U, V2N — navigate to the anchor ET, switch to heliocentric framing, capture the screenshot.
  - [ ] T1.2: For V1S (Titan slingshot) and V2N (Triton flyby), additionally capture a post-encounter view (V1S ~1981-06-01, V2N ~1995-01-01) showing the bend continuing.
  - [ ] T1.3: Store screenshots at `docs/visual-validation/screenshots/<chapter-slug>.png` and post-encounter views at `docs/visual-validation/screenshots/<chapter-slug>-post-encounter.png`.

- [x] **T2: Validation document** (AC2, AC4) — *scaffolded; lead finalises commentary post-screenshot review*
  - [x] T2.1: Author `docs/visual-validation/gravity-assists.md` with six per-encounter sections + commentary.
  - [x] T2.2: V1S section: Titan-slingshot ecliptic-exit (Story 4.6 reference).
  - [x] T2.3: V2N section: Triton-flyby southern-bend FR12 (Story 4.7 reference).
  - [x] T2.4: Every cited fact has a `MISSION_FACTS.md` reference.
  - [x] T2.5: Add an "Update protocol" section describing how to refresh a screenshot + commentary.

- [ ] **T3: Tuning iteration if any encounter is not legible** (AC3) — *lead-driven, post-screenshot review*
  - [ ] T3.1: For each captured screenshot, the lead reviews: does a layperson see the bend?
  - [ ] T3.2: If no, the dev iterates on `defaultFraming` OR trajectory-line styling.
  - [ ] T3.3: Iteration committed; document updated.

- [x] **T4: Document-existence defense test** (AC6)
  - [x] T4.1: Authored `web/tests/visual-validation-docs.test.ts` that:
    - Asserts `docs/visual-validation/gravity-assists.md` exists.
    - Asserts each of the eight referenced screenshot files exists (6 per-encounter + 2 post-encounter), guarded behind `VISUAL_VALIDATION_FULL=1` so scaffold-time runs pass; lead flips the env flag after screenshot capture.
    - Greps the document for `MISSION_FACTS.md § <section>` reference markers and asserts each cited section header exists in the live MISSION_FACTS.md.
    - Asserts the document contains an "Update protocol" section (AC4 enforcement).
    - Asserts the `docs/visual-validation/screenshots/` directory exists (scaffolded via `.gitkeep`).

- [ ] **T5: Final sweep** (AC5, AC8) — *partial; lead closes after screenshot pass + AC3 review*

## Dev Notes

### Critical files Story 4.8 touches

- `docs/visual-validation/gravity-assists.md` (NEW — primary deliverable)
- `docs/visual-validation/screenshots/<slug>.png` × 6 (NEW — primary deliverable)
- `docs/visual-validation/screenshots/v1-saturn-post-encounter.png` (NEW — Titan slingshot bend)
- `docs/visual-validation/screenshots/v2-neptune-post-encounter.png` (NEW — Triton bend)
- `web/tests/visual-validation-docs.test.ts` (NEW — Integration AC per Rule 1, doc-existence defense)
- Potentially: `web/src/chapters/specs/*.ts` (modify — iteration on `defaultFraming` per AC3)
- Potentially: `web/src/render/trajectory-line*.ts` (modify — iteration on line styling per AC3)

### Heliocentric vs body-centered framing

This story's screenshots use heliocentric framing (the sun at origin, planets at their orbital positions) — NOT body-centered (Story 4.5+ chapter framing). The bend is most legible from a system-wide view where the inbound + closest-approach + outbound legs are visible together. The dev should clarify in the validation document that this framing differs from the in-chapter user experience.

### How to drive heliocentric framing in Chrome DevTools MCP

Story 4.2's `VoyagerCameraController` includes a default heliocentric framing for cruise chapters (no `defaultFraming` on chapter spec → fallback). The lead can navigate to a cruise URL (e.g., `/c/cruise` or `/c/launch-v1`) and then scrub the mission scrubber to the encounter anchor ET — this keeps the heliocentric framing active throughout. Document this in the smoke probe plan below.

### Rule 5 — chapter-spec tuning iteration discipline

If the lead's screenshot review surfaces that an encounter's `defaultFraming` should be widened or shifted to make the bend legible, amend the chapter spec in place per Rule 5 AND update the chapter-spec test pins accordingly. The defense tests added in Stories 4.5–4.7 will flag the change; update the pinned values in the test files in the same change-set.

### Living-artifact "Update protocol" wording

Suggested boilerplate for AC4's Update protocol section:

> **Updating this document.** When a user-test surfaces an ambiguous bend OR a new flyby is added to the encounter set, refresh the affected encounter's screenshot:
> 1. Navigate to the encounter's anchor ET in heliocentric framing.
> 2. Capture a new screenshot at `docs/visual-validation/screenshots/<slug>.png` via Chrome DevTools MCP `take_screenshot`.
> 3. Update the commentary section with the rationale for the framing choice.
> 4. Run `web/tests/visual-validation-docs.test.ts` to confirm the doc-existence defense still passes.
> 5. Commit the new screenshot + doc update in one change-set.

### NFR / ADR compliance pointers

- **FR11 (gravity-assist visible)**: AC1 + AC2 close this with the documentation-as-evidence pattern.
- **FR12 (V2 Triton south bend)**: AC2 V2N section explicit.
- **NFR-P9 (≤ 20 km position error)**: trajectory-line rendering inherits existing Story 1.6 baseline; no Story 4.8 changes.

## Smoke probe plan (AC7) — for the lead's Chrome DevTools MCP

The smoke is the **screenshot capture itself**. For each of the six encounters:

1. Navigate to `/c/cruise` (or another cruise URL) to enter heliocentric framing.
2. Use `__voyagerDebug.clockManager.scrubTo(anchorEt)` if exposed, OR navigate the mission scrubber to the encounter anchor via Home/keyboard navigation.
3. Wait for the bend to be visible in the trajectory line (the planet's gravity well visibly pulling the spacecraft path).
4. Capture screenshot via `mcp__chrome-devtools-mcp__take_screenshot` at `docs/visual-validation/screenshots/<chapter-slug>.png`.
5. For V1S + V2N, additionally scrub to the post-encounter date (V1S: ~1981-06-01, V2N: ~1995-01-01) to capture the continuing bend.
6. The screenshot files become the document's embedded evidence; the document body provides the commentary.

If a bend is not visually legible:
- Document the issue (zoom too tight / line color too quiet / framing wrong axis / etc.).
- Iterate on chapter spec `defaultFraming` OR trajectory-line styling (Story 4.2 + Story 1.5+ code surface).
- Re-capture.

The lead has the visual-review authority for "is this bend legible to a layperson."

## References

- Epic 4 spec for Story 4.8: `_bmad-output/planning-artifacts/epics.md:1842-1869`
- Stories 4.5 (V1J), 4.6 (V2J/V1S/V2S), 4.7 (V2U/V2N): committed `aec7796`, `65ac187`, `b55ced9`.
- Existing trajectory-line rendering: `web/src/render/` (search for "trajectory-line" or similar).
- VoyagerCameraController heliocentric fallback: `web/src/render/voyager-camera-controller.ts`.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `bmad-dev-story` skill, scaffolding-pass invocation per the lead's `/epic-cycle` spawn for Story 4.8.

### Debug Log References

- Vitest run (default mode): 171 files, **3063 passed / 10 skipped** (8 of the skipped are the post-capture-gated screenshot existence assertions in this story; baseline pre-Story-4.8 was 3057 / 2 skipped per AC5 — net +6 passing tests, +8 skipped; no regressions).
- Vitest run (`VISUAL_VALIDATION_FULL=1`): the post-capture block runs and fails as designed (screenshots don't exist on disk at scaffold-time) — this is the lead's hand-off probe; it'll go green after AC7 screenshot capture.
- Typecheck: `tsc --noEmit` clean.
- Lint: `eslint .` clean — 4 pre-existing warnings unrelated to Story 4.8 (`skybox.ts`, `ephemeris-service.ts`, `celestial-defense-extended.test.ts`).

### Completion Notes List

**Scaffolding-pass scope (this agent invocation):**

- Authored `docs/visual-validation/gravity-assists.md` with the document skeleton: title + FR11/layperson-legibility preamble, six per-encounter sections (V1J / V2J / V1S / V2S / V2U / V2N), V1S and V2N each with the additional post-encounter image reference, an "Update protocol" section per AC4, and a References block linking back to MISSION_FACTS.md + Stories 4.5/4.6/4.7.
- Commentary paragraphs are first-draft prose with `_Commentary subject to lead's screenshot-review pass per AC3._` markers — the lead finalises after the AC7 screenshot capture lets them visually-confirm what each bend actually shows.
- Pre-created `docs/visual-validation/screenshots/.gitkeep` with the expected filename manifest so the directory lands in the commit before screenshots exist.
- Authored `web/tests/visual-validation-docs.test.ts` using a split-describe-block approach (always-on + post-capture-gated via `VISUAL_VALIDATION_FULL=1`). The always-on block asserts document existence, screenshot-reference embedding in markdown, MISSION_FACTS.md section header validity (regex audit per AC6), Update-protocol presence per AC4, and screenshots directory existence. The post-capture block asserts the 8 PNG files exist on disk; skipped without the env flag so scaffold-time runs pass.

**Rule 5 candidates flagged for lead review during AC3 screenshot pass:**

- None obvious from inspection. The chapter-spec `defaultFraming` values are body-centered (Stories 4.5–4.7) — orthogonal to Story 4.8's heliocentric framing, which uses the `VoyagerCameraController` cruise-fallback per Dev Notes. If the lead's screenshot review identifies that a chapter's body-centered framing is wrong, that surfaces as a Rule-5 candidate at that time; no preemptive tuning was done.

**Out-of-scope per the lead's scaffolding-pass envelope:**

- T1 (screenshot capture) — Chrome DevTools MCP isn't reliably available to spawned sub-agents per Rule 7; the lead drives this in their AC7 smoke pass.
- T3 (visual tuning iteration) — predicated on lead's visual review of captured screenshots per AC3.
- T5 (final sweep) — predicated on T1 + T3 completion.

**Closing-summary closed-loop verification:**

- Validation document file references exactly the 8 PNGs the test guards: regex-checked by the always-on `document references the six required encounter screenshots inline` + `document references the V1S + V2N post-encounter screenshots (AC7 dual-frame)` assertions.
- MISSION_FACTS.md citation audit verifies every `§ <section>` in the doc maps to a live `##` or `###` header — caught two multi-line wrap traps + one chained-citation pattern (`§ A; § B`) during initial test run, fixed by normalising whitespace + splitting on `; §`.

### File List

| File | Status | Purpose |
| ---- | ------ | ------- |
| `docs/visual-validation/gravity-assists.md` | NEW | Primary deliverable per AC2 / AC8. Six per-encounter sections + Update protocol + References. Commentary first-draft; lead finalises post-screenshot review. |
| `docs/visual-validation/screenshots/.gitkeep` | NEW | Placeholder so the screenshots directory lands in the commit pre-screenshot-capture; includes expected-filename manifest. |
| `web/tests/visual-validation-docs.test.ts` | NEW | Integration AC per Rule 1 / AC6. Document-existence defense, MISSION_FACTS.md citation regex audit, Update protocol presence assertion, split-describe pattern for post-capture-gated screenshot existence. |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | MODIFIED | `4-8 backlog → in-progress`; `last_updated` refreshed. |
| `_bmad-output/implementation-artifacts/4-8-gravity-assist-trajectory-visual-validation.md` | MODIFIED | Story-file state updates (Status, Tasks, Dev Agent Record, File List, Change Log). |

### Change Log

- **2026-05-23 — scaffolding pass complete:** authored validation document skeleton (`docs/visual-validation/gravity-assists.md`) with six per-encounter sections + Update protocol + References; pre-created screenshots directory (`docs/visual-validation/screenshots/.gitkeep`); authored AC6 integration test (`web/tests/visual-validation-docs.test.ts`) using split-describe pattern with `VISUAL_VALIDATION_FULL=1` env-gated post-capture block. Awaiting lead's AC1/AC3/AC7 screenshot-capture + visual-review pass to finalise commentary + flip env flag.
