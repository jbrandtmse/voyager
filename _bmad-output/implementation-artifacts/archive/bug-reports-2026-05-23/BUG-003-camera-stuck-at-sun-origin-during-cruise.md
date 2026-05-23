---
id: BUG-003
title: Camera stuck at heliocentric origin (Sun centre) during cruise — solar system not visible
severity: critical
type: rendering / camera framing
discovered_during: review-2026-05-23
related_story: 4-1-viewframe-service-and-translation-only-smoothstep-blend
related_epic: epic-4
related_fr: FR31 (camera smoothly transitions between heliocentric and body-centered view frames)
---

## Summary

Outside an active encounter chapter, the camera world-position is `(0, 0, 0)` (Sun barycenter) with no active target. The viewport shows only the Milky Way skybox — neither spacecraft, neither trajectory line, no planets, no Sun are visible from this vantage point.

## Evidence

At `http://localhost:5173/?t=1980-01-01T00:00:00Z`:

```json
{
  "cameraWorldPos": {"0":0, "1":0, "2":0},
  "cameraController.getActiveTarget()": null,
  "cameraController.getViewFrameOrigin()": {"0":0, "1":0, "2":0},
  "cameraController.resolveDefaultFraming()": null,
  "chapterDirector.currentChapter": null,
  "chapterDirector.states": {}  // empty FSM state map
}
```

Scene contents (positions confirm bodies/spacecraft are in correct heliocentric positions):

- `SunDirectionalLight` at ~(1.18e6, −1.02e5, −3.45e4) km (Sun mesh location)
- 8 planets at SPICE-derived positions (Earth at 1.45e8 km ≈ 1 AU — correct)
- `voyager-1` at (−9.82e8, 3.11e8, 3.35e7) km ≈ 6.6 AU from Sun (correct for 1980-01-01)
- `voyager-2` at (−8.26e8, 3.66e8, 2.40e7) km ≈ 5.7 AU (correct)
- 4 trajectory `Line2` meshes present

Render screenshot: only stars + a single body partially visible from the wrong angle. The corresponding screenshot:
`_bmad-output/implementation-artifacts/review-screenshots/01-1980-no-distance.png`

## Expected

Per Story 4.1 + the Epic 1 narrative ("a visitor lands on the site, sees both Voyager spacecraft moving along their heliocentric trajectories"), the default cruise framing must position the camera at a useful heliocentric vantage that contains the inner-or-relevant solar system in frame, with the active spacecraft (or both) visible.

`resolveDefaultFraming()` returning `null` and `getActiveTarget()` returning `null` when no chapter FSM state is active means the camera defaults to its initialization position (0,0,0) and never moves.

## Reproduction

1. Open `http://localhost:5173/?t=1980-01-01T00:00:00Z` (any non-chapter timestamp).
2. Observe canvas: only the Milky Way starfield, no solar-system content visible.

## Suspected location

- `web/src/scene/view-frame.ts` (or wherever `resolveDefaultFraming` is implemented) — the default heliocentric framing is not being returned when there is no active chapter.
- `web/src/scene/voyager-camera-controller.ts` — `getActiveTarget()` fallback path.
- `ChapterDirector` may never enter the "cruise" / default FSM state (`states` map is empty).

## Impact

- The single most important visual promise of Epic 1 (visitor sees both spacecraft on heliocentric trajectories) is not delivered for any non-encounter timestamp.
- FR31 default state is broken.
- Hides bugs further downstream: trajectory lines, distance HUD, etc. can't be visually verified by a user.

## Closure (2026-05-23)

- **Status:** STILL_ACTIVE → FIXED
- **Closing story:** 4.10
- **Triage evidence:** Live smoke at `/?t=1980-01-01T00:00:00Z` confirmed
  `camPos = (0, 0, 0)`, `activeTarget = null`, `defaultFraming = null`,
  `activeChapter = null`. Existing cold-load replay in `main.ts` (added by
  Story 4.5) only fired `applyDefaultFraming` when
  `initialActiveChapter !== null && initialActiveChapter.defaultFraming
  !== undefined`. The cruise case (no active chapter) was a silent
  fall-through to camera-at-world-origin.
- **Design choice (Rule 5):** Option B (controller fallback via existing
  `defaultFramingFallback`) chosen over Option A (declarative
  `defaultFraming` on cruise chapter spec) because the controller already
  has a working `CRUISE_DEFAULT_DISTANCE_KM = 10*AU` heliocentric framing
  for the `activeTarget === null` path — Option B is a 4-line main.ts
  branch; Option A would require updating chapter-spec types + the
  `chapter-default-framing.ts` resolver + every cruise/launch chapter
  spec. Both routes land the camera in the same place; B is the simpler
  closure.
- **Fix:** `main.ts` cold-load replay block extended with an explicit
  cruise branch — `if (initialActiveChapter === null) { applyDefaultFraming
  ({ animated: false }); }`. The controller's existing fallback resolves
  to `(0, 0, 10*AU)` looking at origin. Post-fix live smoke at
  `/?t=1980-01-01T00:00:00Z` returned `camPos.z = 1.496e9 km` (10 AU) and
  `camMagnitude / KM_PER_AU = 10`, confirming the fix.
- **Fix commit:** (lead populates post-commit)
- **Defense test:** `web/tests/bug-fix-batch-2026-05-23-defense.test.ts`
  — `BUG-003 defense` describe block (`defaultFramingFallback(null)` →
  10 AU magnitude; `main.ts` grep for the cruise branch).
