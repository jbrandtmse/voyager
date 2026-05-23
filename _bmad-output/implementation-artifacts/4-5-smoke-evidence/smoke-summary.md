# Story 4.5 — Chrome DevTools MCP Smoke Evidence

**Result:** PASS (iter-2 of 2) | **Defects caught:** 1 | **Lead:** claude-opus-4-7

## Iterations

| Iter | Result | Defect | Fix landed in |
|---|---|---|---|
| 1 | FAIL | Camera framing — `chapter.defaultFraming.offsetKm` resolver registered on controller but never auto-triggered on chapter activation. Camera stuck at world origin (0,0,0), embedded inside Jupiter. Same shape as Story 4.3 cycle-5's cold-load replay miss. | Cycle-2: extracted `applyDefaultFraming({animated})` as a public method on VoyagerCameraController; wired ChapterDirector `to === 'held'` subscriber + cold-load replay pattern in main.ts (mirrors Story 4.3 cycle-5). |
| **2** | **PASS** | — | — |

## Final probe state (iter-2, post cycle-2)

### Probe 1 — Chapter window narrowed to ±5 days
PASS — `chapter.windowSpanSec === 864000` exactly (10 days = ±5d). Centered on anchor. Story-4.1 placeholder ±30d successfully replaced with Story-4.5 spec ±5d.

### Probe 2 — `<v-chapter-copy>` panel renders V1J lede + body
PASS — Light-DOM `<article>` element contains `<h2>V1 Jupiter.</h2>` and the full 97-word body prose (covers Io plume discovery on 1979-03-08, Linda Morabito's frame 0468J1-001, ring discovery on 1979-03-04, Amalthea/Io/Europa/Ganymede/Callisto sweep). All cited facts present in MISSION_FACTS.md (verified by QA's regex audit in `story-4-5-v1j-encounter-qa-gaps.test.ts`).

### Probe 3 — Camera framing: V1 + Jupiter in viewport
PASS for the bodies whose positions are available:
- `camera.position = (1_000_000, 1_500_000, 2_500_000)` — exact match to `chapter.defaultFraming.offsetKm`.
- Jupiter (NAIF 5) NDC `(0, 0, 0)` — at the centered origin (ViewFrame put it at world origin per Story 4.1).
- V1 (voyager-1) NDC `(0.095, 0.174, 0)` — close to centre, well inside frustum.

**Documented limitation (Story 4.3 cycle-4 follow-up):** Io / Europa / Ganymede / Callisto meshes share identical world positions (`481M, -627M, -8M` km) — Jupiter's heliocentric coordinates at this ET. The meshes are constructed and textured (per Story 4.3 cycle-7) but have no position chunks because satellite SPK kernels (`jup365.bsp` et al.) remain unprocured. AC3's "V1 + Jupiter + Io visible together" verification for the Io body is gated on this separate procurement task; Story 4.5 ships the camera framing correctly applied — Io's appearance in the frame will activate once kernels land.

### Probe 4 — Detail-scrubber a11y range matches narrowed window
PASS — `aria-label="Voyager 1 — Jupiter encounter timeline"`, `aria-valuemin/max` = `[anchorEt - 5d, anchorEt + 5d]` exactly. Story-4.4's auto-binding to chapter.windowStartEt/windowEndEt flows through correctly.

### Probe 5 — Attitude indicator shows "CK reconstructed"
PASS — `<v-attitude-indicator>` text content includes "CK reconstructed" throughout the V1J window (accessibility-tree snapshot confirmed).

### Probe 6 — Console clean
PASS modulo documented baseline:
- `[warn] Lit is in dev mode.` — pre-existing baseline.
- `[warn] THREE.KTX2Loader: Multiple active KTX2 loaders may cause performance issues.` — documented in Story-4.3 cycle-7 as advisory (Story 3.3 spacecraft-models loader + cycle-3 TextureLoaderService loader coexist by design; both correctly initialised). Loader-unification deferred.

Zero error-level messages. Zero new warnings.

## Accessibility-tree confirmation

```
uid=1_12 slider "Mission timeline" valuetext="1979-03-05 12:05 UT"
uid=1_13 slider "Voyager 1 — Jupiter encounter timeline" valuemin=-657676480 valuemax=-656812480
  (≈ V1J anchor ± 5 days; matches AC1 window narrow)
uid=1_24 status "Attitude data provenance" → "CK reconstructed"
uid=1_40 article live="polite"
  uid=1_41 heading "V1 Jupiter." level=2
  uid=1_42 body prose with Morabito + frame 0468J1-001 citations
```

## Evidence files

- `iter-1-FAIL-camera-framing-bodies-offscreen.png` — pre-fix viewport (camera at origin, scene shows Jupiter's interior plus far-off bodies).
- `iter-2-PASS-v1j-camera-framed.png` — post-fix viewport (camera at defaultFraming offset, Jupiter centered, V1 visible nearby).

## Lesson 8 reinforcement

One more test-pyramid-invisible defect caught by per-story smoke. The dev's unit tests passed the `applyDefaultFraming` resolver in isolation; the integration test passed because it tested the resolver-correctness, not the AUTO-TRIGGER on chapter activation. Smoke caught the missing trigger.

Cycle-2's defense tests now pin the trigger:
- `applyDefaultFraming({animated: false})` snaps camera to V1J chapter offset (cold-load path).
- `applyDefaultFraming({animated: true})` tweens to V1J chapter offset (runtime transition path).
- ChapterDirector `to === 'held'` subscriber fires `applyDefaultFraming` automatically.
- No-op when `manualCameraSuspended` (PBD carve-out preserved).
- No-op when chapter has no `defaultFraming` (heliopause / cruise fallback).
- `restore()` delegates to `applyDefaultFraming` (Story 4.2 R-key + button-click regression-pin).

The pattern (resolver registered ≠ trigger firing) is now recognised across Story 4.3 (cold-load FSM replay) and Story 4.5 (chapter activation framing). Both required a sibling subscriber + cold-load replay pair to wire up. A future encounter chapter (4.6, 4.7) gets this for free because the wire-up is generic — chapters with `defaultFraming` are auto-handled by the `to === 'held'` subscriber.
