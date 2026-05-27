# Story 6.4 — Lead Per-Story Smoke (AC8 closure)

**Date:** 2026-05-25
**Lead model:** claude-opus-4-7
**Method:** CLI invariants — Story 6.4 is fully a11y-discipline + test-infrastructure work, validated via the new test infrastructure itself.

## AC8 invariant verification

| Check | Command | Result |
|---|---|---|
| All a11y tests + defense pass | `npm test -- a11y story-6-4-defense --run` | 100/100 pass across 15 files in 7.73s |
| Manual checklist + first run record | `ls docs/accessibility/{manual-test-checklist,manual-test-runs/2026-05-24}.md` | both present |
| Rules 14 + 15 + 16 present in skill-rules | `grep -c "^## Rule 1[4-6]" skill-rules.md` | 3 (canonical sequence) |
| Dialog primitive exists | `ls web/src/primitives/dialog.ts` | present |
| focus-trap diagnostic warn migrated to primitive | `grep -c console.warn dialog.ts` | 4 occurrences (cleaner than per-component scatter) |
| 3 in-place a11y fixes hold (regression defense in story-6-4-defense.test.ts) | included in 100/100 pass | confirmed |

## Test pyramid posture (post-Story-6.4)

- web vitest: **3774** / 10 skipped (was 3669 post-Story-6.3; +65 dev + 40 QA = +105 net)
- Playwright route axe: 16 routes (covered by route axe Playwright suite)
- Playwright L4 visual: 20 baselines preserved (Story 4.9 + 5.4 + 6.3 reduced-motion)
- bake fast pytest: preserved
- typecheck: clean
- lint: 4 warnings / 0 errors (baseline preserved)

## Headline outcomes

- **3 pre-existing critical/serious a11y violations FIXED in-place** — `aria-valuenow=<ISO>`, orphan `role="row"`, `aria-hidden`+focusable. These would have shipped silently without Story 6.4's axe expansion.
- **Rule 9 dialog primitive extraction** — third APG primitive (slider + listbox + dialog) — ADR-0025's commitments are now COMPLETELY closed.
- **Rule 16 added** — manual a11y checklist gate before phase milestones.
- **3 deferred-work items closed** — `[1.7/LOW]`, `[2.7/LOW]`, `[2.8/LOW]`.

## Defects caught

- 0 by lead smoke. CR caught + auto-resolved 1 LOW (misleading dispose-path comments in main.ts + about.css). 2 LOW deferred (aria-valuenow NaN safety; dialog.test hedge).

## Iterations

- 1 (first-run pass after CR's inline fixes)

## Result

PASS — Story 6.4 ships clean. Voyager's a11y baseline is now mechanically gated by axe-core (105 tests) + 16 route checks + a documented manual checklist for the screen-reader / color-blindness / forced-colors / reduced-transparency gaps that axe cannot catch.
