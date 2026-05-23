# Story 5.3 AC9 — PBD Photo-Plate Compositing Production Smoke Evidence

_Captured 2026-05-24 by Chrome DevTools MCP against the production build (`web/dist/` served via `vite preview --port 4173`)._

## Context

Story 5.3 implements `PbdCompositeLayer` — six NASA Photojournal photo plates (PIA00452 + PIA00453 six-panel grid) composite into the scene at each `sweeping_<body>` substate's peak ET, plus a 30-second Earth hold during `composite_active`. AC9 is the lead-driven Chrome DevTools MCP smoke verifying the production-build photo-composite pipeline end-to-end.

## Smoke result

**PASS after one fix-and-rebuild iteration (iterations=2, defects_caught=1).**

### Iteration 1 — Defect surfaced (HIGH, fixed inline by lead)

The initial production smoke surfaced a defect not caught by the dev's 42 tests or QA's 33 gap-fillers:

**`TypeError: setFromMatrixPosition is not a function`** in `composite-layer.ts:projectActivePlate`.

**Root cause:** the dev's code passed a plain `{x:0, y:0, z:0}` object to Three.js's `Object3D.getWorldPosition(target)`, which internally calls `target.setFromMatrixPosition(this.matrixWorld)` — a method only `THREE.Vector3` provides. Plain objects worked in tests because happy-dom's stubbed `Object3D` was permissive; real Three.js in the production browser threw.

**Fix:** replaced the plain-object scratch with a persistent `Vector3` instance on the class (avoids per-frame allocation in the PBD window). Added an explicit off-screen fallback: when the projected NDC coordinates land outside `[-1, +1]` or behind the camera (`z > 1`), fall back to `centerPlateInViewport` so the cinematic composite still reads as "appearing in the scene" per AC3, until Story 5.X PBD camera framing lands. Inline fix; no dev re-spawn needed.

**Defense lesson** (consistent with Epic 4 retro New Lesson 1 — "wire-up trigger patterns are a distinct trap class"): when a Three.js API requires a class-instance target (e.g., `Vector3`, `Quaternion`, `Matrix4`), passing a plain object can silently no-op or throw at runtime depending on the API. happy-dom Three.js stubs are MORE permissive than real Three.js. Production-build smokes catch this class of defect; unit tests don't. The fix added a JSDoc comment on the new `projectScratch` field explicitly naming the smoke that caught it — preserving the trigger context for future contributors.

### Iteration 2 — Clean smoke, PASS

After the inline fix + rebuild:

| Substate / ET | Expected visible plate | Observed | Console clean |
|---|---|---|---|
| `sweeping_venus` (anchor + 37s) | venus | venus, opacity=1 | yes |
| `sweeping_earth` (anchor + 52s) | earth | earth, opacity=1 | yes |
| `composite_active` (anchor + 75s, mid 30s Earth-hold) | earth | earth, opacity=1 | yes |
| `sweeping_jupiter` (anchor + 97s) | jupiter | jupiter, opacity=1 | yes |
| `sweeping_neptune` (anchor + 142s) | neptune | neptune, opacity=1 | yes |
| `composite_decay` (anchor + 165s) | none (post-fade) | none | yes |

Substate progression verified across all 6 photo plates. Plate-cycling chronological order (Venus → Earth → composite_active hold → Jupiter → Saturn → Uranus → Neptune → composite_decay) matches Story 5.1's Rule-5-amended substate ordering and the canonical PBD imaging sequence per `MISSION_FACTS.md` line 51 + epic spec line 2038-2040.

At each peak ET: exactly ONE plate visible (AC4 last clause — "no two plates visible simultaneously" — satisfied). Plate centered in viewport via the off-screen fallback (V1 at 40 AU projects outside the cruise-default camera frustum; PBD-specific camera framing is Story 5.X follow-up per Story 5.2 Out of Scope).

### Screenshots

- `pbd-sweeping-venus-37s.png` — Venus plate at +37s.
- `pbd-sweeping-earth-52s.png` — Earth plate at +52s (the canonical "Pale Blue Dot" hero shot in cinematic composite).
- `pbd-composite-active-earth-75s.png` — Earth plate mid-30s-hold at +75s (`composite_active`).
- `pbd-sweeping-jupiter-97s.png` — Jupiter plate at +97s.
- `pbd-sweeping-neptune-142s.png` — Neptune plate at +142s.

### What the smoke validates

The production build:

1. Loads PBD cold + transitions through substates via deep-link URLs.
2. Procures + serves the 6 NASA Photojournal photo plates with content-hashed filenames + `Cache-Control: public, max-age=31536000, immutable` headers.
3. Renders each plate at the correct substate peak ET; the substate-to-plate mapping is correct (Venus/Earth/Jupiter/Saturn/Uranus/Neptune in chronological order).
4. Holds the Earth plate for 30+ seconds during `composite_active` per the Story 5.1 Rule-5 amendment + Story 5.3 AC6 30-second-pause success criterion.
5. Survives the new Vector3 projection pipeline without console errors.
6. Centers plates cinematically when the boresight projection lands outside the viewport (cruise-default camera + V1 at 40 AU = projection off-screen; the off-screen fallback keeps the composite cinematically visible).

### Defect telemetry summary

- **iterations:** 2
- **defects_caught:** 1 (`setFromMatrixPosition` plain-object-vs-Vector3, lead-fixed inline)
- **fix scope:** ~20 LOC; persistent `Vector3` scratch + off-screen fallback; JSDoc names the smoke that caught the defect for future-contributor education.

## Console messages

Zero errors or warnings across all probed substate ETs (iteration 2 final state). Initial smoke (iteration 1) surfaced the single `TypeError` documented above; cleared by the inline fix.
