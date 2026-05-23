# Story 4.10 — Bug-Fix Sweep Smoke Evidence

**Result:** PASS (iter-1 of 1) | **Defects caught:** 0 new | **Lead:** claude-opus-4-7

Single-iteration smoke validating 5 fixed bugs + confirming 2 misfiled triages + 1 already-fixed hardening from the 2026-05-23 manual review.

## Per-bug smoke results

| Bug | Severity | Status | Smoke verification |
|---|---|---|---|
| BUG-001 | M | ALREADY_FIXED + hardened | `aria-label="Voyager 1 — Jupiter encounter timeline"` (no duplicate "encounter"). Dev added a fallback for the unreachable `null`-chapter branch. |
| BUG-002 | H | FIXED (scope-correct) | V2 shows `4.78 AU` (numeric); V1 occasionally `— AU` due to known LRU chunk-cache thrash (24-chunk working set vs 12-slot capacity) — the "permanently — AU for BOTH" wording from the bug report is closed. LRU thrash is a separate deferred-work item per dev's notes. |
| BUG-003 | C | FIXED | Camera at `(0, 0, 1495978707)` km = exactly **10 AU heliocentric** on cruise URL `/?t=1980-01-01T00:00:00Z`. Was at world origin (0,0,0) inside Sun. Dev chose Option B (controller fallback in main.ts cold-load replay) — ~10 lines, reuses `CRUISE_DEFAULT_DISTANCE_KM = 10 AU`. |
| BUG-004 | M | FIXED | Speed slider `aria-valuetext === "1× — 1 sec/sec"` (clean Unicode); previously `"1Ã â 1 sec/sec"` (UTF-8 → Latin-1 double-encoding). Fixed by using JS-string literals directly. |
| BUG-005 | C | MISFILED | Canonical URL contract verified as `/c/<slug>` per `docs/url-contract.md`, ADR-0001, and `CHAPTER_PATH_PATTERN` in `url-sync.ts`. Bug report tested `/<slug>` (no prefix); that route is not supported by design. Cold-load clock seek WORKS at `/c/<slug>` per all Epic 4 smoke evidence. |
| BUG-006 | M | FIXED | `<v-hud-chapter-title>` shadow root contains `<h2 data-slug="v1-jupiter">Voyager 1 — Jupiter</h2>` at `/c/v1-jupiter`. Was empty. Dev wired identity-gated per-tick propagation in `<v-hud>.tick(et)` (matches Story-3.6 `attitudeService` pattern). |
| BUG-007 | L | MISFILED | About page correctly documents `/c/<slug>?embed=true` matching canonical contract. Bug report's premise that the contract is `/<slug>` (no prefix) is contradicted by ADR-0001 + live router. |
| BUG-008 | L | FIXED | Help overlay's Display section now contains "R Restore default camera view". Was missing per the bug report. |

## Bug-report folder annotated

Each bug-report file under `_bmad-output/implementation-artifacts/bug-reports-2026-05-23/` now has a `## Closure (2026-05-23)` section documenting status (FIXED / ALREADY_FIXED / MISFILED), defense test path, and brief rationale. The folder is now a self-contained audit trail.

## Defense test coverage

`web/tests/bug-fix-batch-2026-05-23-defense.test.ts` — 12 tests, one describe block per bug. Each STILL_ACTIVE bug's fix is pinned at the unit-test tier. A future regression of any bug now fails this single file.

## Test sweep + lint baseline

- web vitest: 3075 pass / 8 skipped / 172 files (post-Story-4.8 baseline 3063 + 12 new defense tests)
- typecheck clean
- lint: 4 warnings (baseline preserved, 0 new)

## Triage summary

- **5 fixed** (BUG-002, BUG-003, BUG-004, BUG-006, BUG-008) — all STILL_ACTIVE bugs from the manual review, closed with minimal-change fixes + defense tests.
- **2 misfiled** (BUG-005, BUG-007) — both had a URL-prefix premise contradicted by ADR-0001 + live router. Closure documented.
- **1 already-fixed + hardened** (BUG-001) — Story 4.4 closed it; dev hardened the latent unreachable branch.

## Evidence files

- `bug-008-help-overlay-r-key.png` — help overlay showing the R-key entry under Display section.

## Closing note

Epic 4 bug-fix sweep complete. Eight bugs from the 2026-05-23 manual review closed: 5 fixed + 2 misfiled + 1 already-fixed. Ready for Epic 4 retrospective.
