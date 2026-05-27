# Story 6.6 — Lead Per-Story Smoke (AC9 closure)

**Date:** 2026-05-25
**Lead model:** claude-opus-4-7
**Method:** CLI invariants. AC9 step (b) — L4 Playwright baseline re-capture under masking + tightened tolerance — is ROUTED TO THE MAINTAINER per the dev's smoke-evidence README (rationale: sub-agents have no build-then-screenshot pipeline, and 3-rerun determinism is a runtime gate that requires the maintainer's local Chrome-for-Testing).

## AC9 invariant verification (CLI)

| Check | Command | Result |
|---|---|---|
| All Story 6.6 tests pass | `npm test -- story-6-6-defense tabular-numerals --run` | 63/63 pass in 1.39s across 2 files |
| Contrast audit doc complete | `wc -l docs/accessibility/contrast-audit-launch-week.md` | 465 lines (per-surface audit + Typography + Focus + Provenance sections) |
| Reference-parity template complete | `wc -l docs/launch/reference-parity-review.md` | 229 lines (Methodology + Reference URLs + Reviewer roster + Verdict TBD) |
| L4 mask declarations | `grep -c "mask: \[" visual/*.spec.ts` | encounters: 2 declarations (shared across 12 scenes); reduced-motion: 1 declaration (shared across 5) |
| maxDiffPixelRatio tightened | `grep maxDiffPixelRatio playwright.config.ts` | `0.001` (5× tighter than the prior `0.005`; restores Story 4.9 AC2 target) |

## Test pyramid posture (post-Story-6.6)

- web vitest: **3875** / 10 skipped (was 3812 post-Story-6.5; +6 dev + 57 QA+CR defense = +63 net)
- Playwright L4: 20 baselines staged for re-capture (maintainer-driven; see "Maintainer follow-up" below)
- typecheck: clean
- lint: 4 warnings / 0 errors (baseline preserved)

## Defects caught

- 0 by lead smoke. Combined QA+CR was clean (0 HIGH / 0 MED / 0 LOW).

## Maintainer follow-up — L4 baseline re-capture protocol

Before launch, the maintainer must execute:

```sh
cd web
npm run build                              # ensure web/dist/ is current
npx playwright test visual --update-snapshots   # re-capture all 20 L4 baselines under mask + 0.001
npx playwright test visual                  # re-run #1
npx playwright test visual                  # re-run #2
npx playwright test visual                  # re-run #3 (determinism gate)
```

All 3 re-runs must pass deterministically; commit the new baselines. If any flake re-emerges at 0.001, the masking is insufficient — escalate to Story 7.x perf-hardening per the deferred-work convention.

## Result

PASS — Story 6.6 ships at code-polish-readiness layer. AC8 reference-parity verdict (out-of-band external reviewer pass) and AC9 step (b) L4 baseline re-capture are documented maintainer follow-ups. Epic 6 is now substantively complete pending the end-of-epic retrospective + merge gate.
