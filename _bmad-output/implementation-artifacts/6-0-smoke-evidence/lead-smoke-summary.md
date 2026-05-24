# Story 6.0 — Lead Per-Story Smoke (AC6 closure)

**Date:** 2026-05-24
**Lead model:** claude-opus-4-7
**Method:** CLI / file invariants — Story 6.0 is Rule-3-EXEMPT (process/discipline/cleanup, no user-facing surface).

## AC6 invariant verification

| Check | Command | Result |
|---|---|---|
| Layout regression test passes | `cd web && npm test -- build-dist-layout --run` | 6/6 passed in 4.72s |
| Skill-rules contains Rule 14 header | `grep -c '^## Rule 14' _bmad/custom/skill-rules.md` | 1 |
| Skill-rules contains Rule 15 header | `grep -c '^## Rule 15' _bmad/custom/skill-rules.md` | 1 |
| CONTRIBUTING.md has Visual validation section | `grep -c '## Visual validation' CONTRIBUTING.md` | 1 |
| Visual validation section references dev-doc | `grep -c 'update-snapshot-discipline' CONTRIBUTING.md` | 1 |
| No `web/src/*` touches (Rule 3 exemption) | `git status --short \| grep '^.. web/src'` | 0 matches |

## Test pyramid posture (post-Story-6.0)

- web vitest: 3366 / 10 skipped (was 3343 pre-Story-6.0; +6 dev + 17 QA = +23 net new)
- bake fast pytest: preserved at 430 (no bake touches in Story 6.0)
- typecheck: clean
- lint: 4 warnings / 0 errors (baseline preserved per AC5)

## Defects caught

- 0 by smoke (dev's Rule 5 amendment caught the two spec-arithmetic drifts at planning-review time; reviewer caught + auto-resolved 1 MED + 1 LOW at review time)

## Iterations

- 1 (first-run pass)

## Result

PASS — Story 6.0 ships clean. AC6 closure verified end-to-end.
