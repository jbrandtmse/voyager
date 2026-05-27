# Story 6.3 — Lead-side smoke evidence

> AC6 deliverable. The four-step smoke sequence per the story spec.

## Environment

- Date: 2026-05-24
- Branch: `epic6`
- Vite version: 7.x (per `web/package.json`)
- Playwright version: 1.60.0 (Chrome-for-Testing 148 bundle)
- OS: Windows 11 (development host)

## (a) Capture fresh reduced-motion baselines

```
cd web && npm run build && npx playwright test --config tests/visual/playwright.config.ts reduced-motion-regression --update-snapshots
```

Result: **5 baselines written** (none existed prior). All five FINAL-state
screenshots captured under `web/tests/visual/__snapshots__/reduced-motion-*.png`.

```
A snapshot doesn't exist at .../reduced-motion-title-card-final-state.png, writing actual.
A snapshot doesn't exist at .../reduced-motion-chapter-copy-final-state.png, writing actual.
A snapshot doesn't exist at .../reduced-motion-pbd-turn-final-state.png, writing actual.
A snapshot doesn't exist at .../reduced-motion-chapter-index-final-state.png, writing actual.
A snapshot doesn't exist at .../reduced-motion-hud-dismiss-final-state.png, writing actual.
  5 passed (24.1s)
```

The `--update-snapshots` discipline at
`docs/visual-validation/update-snapshot-discipline.md` was followed:

1. Code change is legitimate (Story 6.3 deliverable — new fixture per AC4).
2. Cross-review pass: dev verified the build succeeds + reduced-motion vitest defenses pass.
3. AC1-cross-check pattern: the vitest defense tests at `web/tests/reduced-motion-defense.test.ts` pin the underlying token + audit-doc contract.
4. Dev (not reviewer) ran `--update-snapshots`.

## (b) Re-run for determinism

```
cd web && npx playwright test --config tests/visual/playwright.config.ts reduced-motion-regression
```

Result: **5 passed (22.3s).** Baselines lock in deterministic on the
second run with no `--update-snapshots` flag.

## (c) Re-run the existing L4 standard-motion suite

```
cd web && npx playwright test --config tests/visual/playwright.config.ts
```

Result: **20 passed (1.2m).** All existing Story 4.9 + 5.4 baselines
(8 encounter / launch + 4 PBD substate + 2 production-HUD-title + 1 SCENES-roster
invariant = 15 prior tests) continue to pass alongside the 5 new
reduced-motion baselines.

## (d) Grep for bare-millisecond transition/animation literals in web/src/

The vitest defense at `web/tests/reduced-motion-defense.test.ts` performs
this audit on every test run. Pass count: **8 / 8**, including the bare-
literal sweep that asserts ZERO bypass declarations.

The one bypass found during the audit (`v-timeline-scrubber.ts:398` —
`transition: opacity 80ms ease;`) was FIXED IN-PLACE during Story 6.3
implementation — routed through `var(--v-duration-fast)` so the
reduced-motion override applies. The fix is recorded in
`docs/accessibility/reduced-motion.md` § 6.

## Test sweep summary

| Tier | Result | Note |
| --- | --- | --- |
| Vitest (web) | 3664 passed / 10 skipped / 1 pre-existing failure | The single failure is `tests/build-dist-layout.test.ts` "catches a missing CSS-link regression (synthetic BUG-E5-007)" — confirmed pre-existing on `epic6` HEAD via `git stash + re-run`. NOT introduced by Story 6.3. |
| Vitest new (Story 6.3) | 8 / 8 (`tests/reduced-motion-defense.test.ts`) | All three gates pass: token/override contract + bare-literal sweep + audit-doc cross-reference. |
| Playwright L4 reduced-motion | 5 / 5 (deterministic across 2 runs) | New file `tests/visual/reduced-motion-regression.spec.ts`. |
| Playwright L4 standard-motion | 15 / 15 (existing Story 4.9 + 5.4) | No regression from reduced-motion additions. |
| Typecheck | clean | `npm run typecheck` (= `tsc --noEmit`). |
| Lint | 4 warnings / 0 errors (baseline preserved) | Same 4 pre-existing "unused eslint-disable" warnings in `skybox.ts`, `ephemeris-service.ts` (x2), `tests/celestial-defense-extended.test.ts`. |

## ADR compliance verified

- **ADR-0010** — Playwright is the CI-tier driver for the new reduced-motion fixture (`tests/visual/reduced-motion-regression.spec.ts`). Chrome DevTools MCP remains available agent-time for iterative debugging. ✓
- **ADR-0027** — New markdown file (`docs/accessibility/reduced-motion.md`) uses LF line endings (Git's `.gitattributes` enforces `* text=auto eol=lf`). ✓

## Skill-rules compliance

- **Rule 5 (NFR tripwire)** — N/A. No tripwire surfaced during implementation; the reduced-motion contract was already coherent per Story 1.7 / UX-DR6.
- **Rule 6 (ADR violations as HIGH)** — N/A. No ADR violations surfaced; the new test file complies with ADR-0010's Playwright-for-CI-time commitment.

## Files modified / created

See `## Files Modified` and `## Tests Added` sections in the dev's
closing summary.
