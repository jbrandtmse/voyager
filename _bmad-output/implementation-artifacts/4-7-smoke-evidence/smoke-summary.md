# Story 4.7 — Chrome DevTools MCP Smoke Evidence

**Result:** PASS (iter-1 of 1) | **Defects caught:** 0 | **Lead:** claude-opus-4-7

Final encounter-chapter smoke. **FR30 closed at the runtime tier** — all six gas-giant encounter chapters now render end-to-end.

## Per-chapter probe results

### V2 Uranus (/c/v2-uranus)
PASS — window ±5d; `defaultFraming.offsetKm = [600K, 900K, 1.5M]` (smallest framing of any chapter — Uranian moon system is compact, Miranda orbits at ~129,800 km); `camera.position` matches framing exactly; chapter copy `<h2>V2 Uranus.</h2>` rendered; Uranus (NAIF 7) at NDC (0,0); V2 (voyager-2) at NDC (-0.07, 0.007) — both in frustum.

### V2 Neptune (/c/v2-neptune)
PASS — window ±5d; `defaultFraming.offsetKm = [800K, 1.2M, 2M]` (intermediate between V2U and V1S/V2S); `camera.position` matches framing exactly; chapter copy `<h2>V2 Neptune.</h2>` rendered; Neptune (NAIF 8) at NDC (0,0); V2 at NDC (0.004, -0.017) — both in frustum.

## Framing magnitude hierarchy (verified across all six chapters)

| Chapter | offsetKm | Magnitude (Mm) | Satellite system |
|---|---|---|---|
| V2U | [0.6, 0.9, 1.5] | 1.85 | Miranda 130k km (compact) |
| V2N | [0.8, 1.2, 2.0] | 2.47 | Triton 355k km (intermediate) |
| V1J | [1.0, 1.5, 2.5] | 3.08 | Io 422k km (Jupiter baseline) |
| V2J | [1.0, 1.5, 2.5] | 3.08 | Same as V1J (Jupiter geometry comparable) |
| V1S | [1.5, 1.5, 3.0] | 3.67 | Titan 1,222k km (large) |
| V2S | [1.5, 1.5, 3.0] | 3.67 | Same as V1S (Saturn geometry comparable) |

The hierarchy V2U < V2N < V1J=V2J < V1S=V2S is satellite-distance-driven, defensible, and pinned by Story 4.6 + Story 4.7 QA tests against future regressions.

## FR30 closure at runtime tier

All six gas-giant encounter chapters now have ±5d windows + populated chapter copy + body-centered defaultFraming. The encounter visit pattern works end-to-end:

1. Navigate to `/c/<chapter-slug>` (or chapter index marker click / keyboard shortcut).
2. ChapterDirector transitions to `entering → held` for the chapter.
3. `<v-chapter-copy>` panel slides in with the chapter's hand-written prose.
4. `<v-timeline-scrubber variant="detail">` slides in with ±5d range.
5. Mission scrubber paints the chapter's V*-marker in accent color.
6. `<v-attitude-indicator>` shows "CK reconstructed" (for the windows where Epic 3's CK pipeline has coverage).
7. ViewFrame puts the target body at world origin; VoyagerCameraController's `applyDefaultFraming` subscriber positions the camera at the chapter's offset.
8. Cold-load handles all of the above on first-paint via the Story 4.5 cold-load replay path.

Across all six chapters, zero new wire-up code was needed in Stories 4.6 + 4.7 — the Story 4.5 pattern generalized perfectly. The auto-trigger pattern (resolver registered + ChapterDirector subscriber + cold-load replay) is now load-bearing.

## Story-by-story summary

| Story | Cycles | Smoke iters | Defects caught |
|---|---|---|---|
| 4.3 | 7 | 4 | 3 |
| 4.4 | 1 | 1 | 0 |
| 4.5 | 2 | 2 | 1 |
| 4.6 | 1 | 1 | 0 |
| **4.7** | **1** | **1** | **0** |

After Story 4.5 established the chapter-activation auto-trigger pattern, three remaining chapter stories (4.6 + 4.7) shipped cleanly on iter-1 with zero defects each. The defense tests added across 4.3 + 4.5 + 4.6 + 4.7 (12 cold-load + 14 KTX2-init + 7 URL-routing + 5 applyDefaultFraming + 42 + 52 QA gaps = ~130 defense tests) close the pattern surface — a future regression in any of the wire-up paths now fails at the unit-test tier.

## Evidence files

- `v2-uranus-PASS.png`
- `v2-neptune-PASS.png`

## Lesson 8 status

The /epic-cycle workflow's Lesson 8 ("the per-story smoke is the bridge from tests pass to the product works") is fully reinforced by Epic 4:
- Smoke caught 4 test-pyramid-invisible defects across Stories 4.3 + 4.5.
- Each defect required a defense test added at the unit-test tier.
- Subsequent stories using the same patterns (4.4, 4.6, 4.7) shipped clean.
- The accumulating defense tests are the load-bearing closure that makes future regressions visible BEFORE smoke.

FR30 (six gas-giant encounters) closed at the runtime tier.
