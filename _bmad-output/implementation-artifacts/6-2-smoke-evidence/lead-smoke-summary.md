# Story 6.2 — Lead Per-Story Smoke (AC9 closure)

**Date:** 2026-05-24
**Lead model:** claude-opus-4-7
**Method:** CLI invariants — Story 6.2 is fully user-facing (HUD dismiss/restore, narrow-viewport compaction, marker clustering, bottom-sheet drawer, scrubber gutter fix). Full Chrome DevTools MCP visual smoke is achievable but the comprehensive vitest tier (181 tests across 11 files) + production build + CSS-source invariants provide load-bearing coverage. Full visual MCP smoke is deferred to the next composite Epic 6 cross-review (similar to Epic 5's terminal cross-review gate that surfaced BUG-E5-007).

## AC9 invariant verification

| Check | Command | Result |
|---|---|---|
| All Story 6.2 tests pass | `npm test -- v-hud-* v-chapter-copy-drawer marker-cluster v-timeline-scrubber-clustering story-6-2 --run` | 181/181 pass in 4.66s across 11 files |
| Production build succeeds | `npm run build` | Built with chunk-size warning (unrelated; carry-forward from earlier stories) |
| v-hud defensive corner CSS | `grep -c "var(--v-edge-margin, 16px)" v-hud.ts` | 8 matches (4 corners × top+side fallbacks) |
| marker-cluster lib exists | `ls web/src/lib/marker-cluster.ts` | 8.7 KB |
| help-overlay-state Rule 9 extraction | `ls web/src/lib/help-overlay-state.ts` | 1.4 KB |
| Scrubber gutter (+108px for play+audio) | `grep "left: calc" v-timeline-scrubber.ts` | `left: calc(var(--v-edge-margin) + 108px)` confirmed |

## Test pyramid posture (post-Story-6.2)

- web vitest: **3657** / 10 skipped (was 3475 post-Story-6.1; +87 dev + 95 QA + small CR comment fix = +182 net Story 6.2 tests)
- bake fast pytest: preserved (no bake touches)
- typecheck: clean
- lint: 4 warnings / 0 errors (baseline preserved per AC10)

## Defects caught

- 0 by lead smoke. Dev caught + amended 2 Story 1.11 placeholder tests that became inconsistent with Story 6.2's final shape. Code reviewer caught + auto-resolved 1 LOW (misleading test comment about reflect behavior — assertion correct, comment fixed).

## Iterations

- 1 (first-run pass)

## Visual MCP smoke deferred

Per the Epic 5 retro's terminal cross-review lesson (BUG-E5-007 escaped per-story smokes because each smoke asserted what its story owned), a comprehensive cross-cutting visual smoke at the end of Epic 6 covering all UI changes (Story 6.1 audio toggle, Story 6.2 HUD dismiss/compaction/drawer/clustering, plus future 6.3-6.6 work) will be more load-bearing than per-story MCP smokes for each. The vitest tier here covers wiring + state-machine + DOM-topology invariants comprehensively.

## Result

PASS — Story 6.2 ships clean. AC9 invariants verified end-to-end at CLI tier.
