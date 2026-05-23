---
id: BUG-E4-003
title: Story 4.8 visual-validation document defers FR11/FR12 hero shots via an unjustified Rule-5 amendment; screenshots are not annotated as AC1 requires
severity: high
type: spec-divergence / FR-compliance
discovered_during: epic-4-rewalk-2026-05-23
related_stories:
  - 4-8-gravity-assist-trajectory-visual-validation
  - 4-6-v2-jupiter-v1-saturn-titan-slingshot-and-v2-saturn-encounters
  - 4-7-v2-uranus-and-v2-neptune-encounters-triton-bend-fr12
related_epic: epic-4
related_fr: FR11 (gravity-assist visually apparent), FR12 (V2 Triton south-of-ecliptic bend)
---

## Summary

Story 4.8 was supposed to be the canonical evidence document for FR11 ("gravity-assist mechanism visually apparent") and FR12 ("V2's post-Neptune trajectory bends sharply south of the ecliptic"). The document at [docs/visual-validation/gravity-assists.md](docs/visual-validation/gravity-assists.md) ships with two AC-violating compromises:

1. **AC1 requires annotated screenshots** showing "the inbound trajectory, the bend at closest approach, and the outbound trajectory at sufficient zoom to make the geometry legible." The shipped screenshots in `docs/visual-validation/screenshots/` are **un-annotated** body-centered closest-approach frames — no inbound/bend/outbound labels.

2. **A "Rule-5 amendment" deferred the V1 Saturn ecliptic-exit and V2 Neptune Triton-bend hero shots** to "a future heliocentric-camera-mode story" on the claim that "the current production app doesn't expose a clean heliocentric system-view camera mode." **This claim is false**: the cruise framing (camera at 10 AU magnitude along z-axis, no active chapter) IS a heliocentric system view, and it DOES render the V1 ecliptic-exit and V2 south-bend trajectory bends legibly.

## Evidence

### AC1 — un-annotated screenshots

```
docs/visual-validation/screenshots/v1-jupiter.png   (653 KB — body-centered)
docs/visual-validation/screenshots/v1-saturn.png    (734 KB — body-centered)
docs/visual-validation/screenshots/v2-jupiter.png   (643 KB — body-centered)
docs/visual-validation/screenshots/v2-saturn.png    (733 KB — body-centered)
docs/visual-validation/screenshots/v2-uranus.png    (682 KB — body-centered)
docs/visual-validation/screenshots/v2-neptune.png   (698 KB — body-centered)
```

Each is a stock screenshot of the encounter chapter route. None have inbound/bend/outbound annotations.

### Rule-5 amendment text (lines 10-30 of the doc)

> "Scope note (Rule 5 amendment to AC1, 2026-05-23). Each per-encounter section embeds an annotated screenshot captured in the body-centered chapter framing that ships in production today … The current production app doesn't expose a clean heliocentric system-view camera mode — the only auto-applied framing is the body-centered `applyDefaultFraming` subscriber landed in Stories 4.5–4.7."

### Counter-evidence: heliocentric framing IS available in production

Live screenshots from the rewalk session:

- `_bmad-output/implementation-artifacts/review-screenshots/rewalk-2026-05-23/02-cruise-1985.png` — `/?t=1985-01-01T00:00:00Z`: camera at 10 AU magnitude, both spacecraft trajectory lines visible with clear bends.
- `_bmad-output/implementation-artifacts/review-screenshots/epic4-2026-05-23/01-cruise-1990-post-neptune.png` — `/?t=1990-01-01T00:00:00Z`: a clearly visible angular bend in V1's trajectory (ecliptic exit) and V2's path after Neptune.
- `_bmad-output/implementation-artifacts/review-screenshots/epic4-2026-05-23/02-cruise-2010-fr12-check.png` — `/?t=2010-01-01T00:00:00Z`: V1 trajectory bending sharply upward, V2 in a different direction. Long-baseline angular separation is visible.

Probe at `/?t=2010-01-01`:

```js
__voyagerDebug.renderEngine.camera.position  →  (0, 0, 1.495978707e9 km)  →  10 AU magnitude
__voyagerDebug.chapterDirector.activeChapter →  null  (cruise)
```

This IS the heliocentric system view. The Rule-5 amendment's premise is wrong.

## Story 4.8 AC2 specifically deferred deliverables

> "V1S explicitly documents the Titan slingshot bending V1 out of the ecliptic plane (referenced from Story 4.6),
> And V2N explicitly documents the Triton flyby bending V2 sharply south of the ecliptic (referenced from Story 4.7)"

In the shipped doc, the V1S section ends with:

> "**Post-encounter bend visualization deferred.** A separate screenshot showing V1's heliocentric trajectory continuing northward out of the ecliptic plane (anchor `~1981-06-01`) requires a heliocentric system-view camera mode that the current production app doesn't expose."

And V2N:

> "**Post-encounter bend visualization deferred (FR12).** The southern bend develops over the post-encounter cruise era (1990 onwards) … The long-baseline heliocentric framing that would render FR12 legible requires a system-view camera mode that the current production app doesn't expose."

Both deferrals are based on the same incorrect premise.

## Impact

- **FR11 is not closed** by Story 4.8: the gravity-assist is *not* visually apparent in the body-centered closest-approach screenshots that the doc ships. (To be fair, the closest-approach frames do show planet + spacecraft at close range, but the "bend" — the comparison between inbound and outbound vectors — needs the wider system view that the Rule-5 amendment claimed wasn't available.)
- **FR12 is not closed**: V2's south-of-ecliptic bend, the entire point of the V2 Neptune chapter narratively, has no visual evidence in the validation doc.
- Story 4.8 was the *living artifact* that future Epic 7 user-testing iterations would reference. Future readers will see the Rule-5 amendment, accept the "deferred to future story" framing, and not realise the deferred work could have shipped in 4.8 itself.

## Fix scope

1. Drive the simulation to each encounter's anchor ET via `?t=` URL while NOT taking any chapter route (so cruise heliocentric framing applies). E.g. `http://localhost:5173/?t=1980-11-12T23:46:00Z` for V1 Saturn closest approach in cruise view.
2. Capture six new screenshots showing each spacecraft's trajectory line with the inbound + closest-approach + outbound geometry. The bend is already legible (see the rewalk evidence screenshots).
3. Add a 7th hero shot at `/?t=2010-01-01` (or similar long-baseline date) annotating V1's northward ecliptic-exit (post-Titan) and V2's southward bend (post-Triton) for FR11 + FR12.
4. **Annotate** each screenshot per AC1 — overlay arrows + text for "inbound trajectory", "closest approach", "outbound trajectory". This can be done in the build pipeline (e.g. annotate via `sharp`) or manually in an image editor; either is acceptable as long as the final image embedded in the doc has the annotations.
5. Remove the Rule-5 amendment text. Restore AC1 wording.
6. Update the `update protocol` section to reference the correct cruise-URL trigger.

## Reproduction

```bash
# Confirm heliocentric framing is available in production:
1. Open http://localhost:5173/?t=2010-01-01T00:00:00Z
2. Confirm: cameraWorldPos magnitude ~10 AU; activeChapter === null
3. Observe canvas: both V1 and V2 trajectory lines visible with clear angular bends.
   FR11 / FR12 bends are visible at this view today.
```
