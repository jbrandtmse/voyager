# Test Automation Summary — Story 2.4

**Story:** Per-Chapter URL Slug Scheme + `pushState` Navigation
**Date:** 2026-05-20
**QA agent:** qa-2-4 (epic-cycle-2026-05-20)

## Scope

The dev-authored test suite (Story 2.4) covers AC1–AC8 at three tiers:

- `web/src/services/url-sync.test.ts` — +27 unit tests for `parseInitialPath`,
  `writeChapterPushState`, `writeChapterReplaceState`, `writeHomeReplaceState`,
  `installPopstateHandler`.
- `web/src/services/url-router.test.ts` — 9 unit tests for the router's
  chapter-jump listener, director subscription with suppression handshake,
  and popstate hook.
- `web/tests/url-router-integration.test.ts` — 11 integration tests covering
  R2 edge cases AC8a/b/c against a real ClockManager × ChapterDirector ×
  URLSync × URLRouter stack composed the same way `main.ts` boots them.

This QA stage fills cross-cutting gaps the dev suite does not exercise:

- **Microtask wave-settle batch under multi-boundary scrubs** — verifies
  the dev's claim that a single `director.update(et)` walking 2–3 chapter
  boundaries produces exactly ONE URL write to the resting `activeChapter`.
- **History sequence push→push→back→**forward** — the dev tested back; QA
  extends to the forward leg (the critical "forward must NOT pushState"
  invariant).
- **Boot-time race ordering** — pins the documented invariant that
  ChapterDirector's first `update()` fires BEFORE URLRouter subscribes,
  so cold-load arrival does NOT emit a redundant URL write.
- **`?embed=true` coexistence** — documents the CURRENT behavior: chapter
  pushState drops `embed` (the contract reserves it for Story 2.5 to
  preserve through writebacks). Regression-pins the current shape so
  Story 2.5 sees the gap explicitly.
- **Out-of-range / malformed `?t=` at integration tier** — unit tests
  cover this at the URLSync surface; QA verifies the full boot stack
  reaches MISSION_START_ET / chapter.anchorEt cleanly.
- **Pathname regex edge cases** — `/c`, `/c/foo/bar` (multi-segment),
  multi-param query strings, hash fragments through chapter routes.
- **`chapter-jump` defensive guards at integration tier** — `-Infinity`
  anchorEt rejected; unknown slug still writes the URL (the router
  does not validate against the registry — the next parseInitialPath
  hits the silent-reject path).
- **History-pollution invariant** — pushState + free-scrub stays
  push-state once (no double-push from the suppression handshake).
- **MCP smoke probe plan for Integration AC8** — lead-executed in
  Chrome DevTools MCP (Rule 3 + Rule 7), documented inline at the
  bottom of `web/tests/url-router-qa-gaps.test.ts`.

## Generated Tests

### Integration Tests

- [x] `web/tests/url-router-qa-gaps.test.ts` — 23 new tests

  | Suite | Tests | Focus |
  | --- | --- | --- |
  | Rapid scrub crossing multiple chapter boundaries (wave-settle batch) | 4 | 2-boundary, 3-boundary, scrub-to-cruise, two consecutive update() calls |
  | History sequence push → push → back → forward | 2 | forward-leg invariant; cruise back/forward round-trip |
  | Boot-time race: URLRouter subscribes AFTER first director update | 2 | cold-load v2-neptune emits no URL write; chapter-jump before install is dropped |
  | `?embed=true` coexistence (Story 2.5 forward compat) | 2 | boot survives embed presence; chapter pushState drops embed (current behavior pinned) |
  | Out-of-range / malformed `?t=` at integration tier | 6 | < MISSION_START; > MISSION_END; garbage on `/`; garbage on `/c/<slug>`; out-of-window `?t=` accepted (AC2); cold-load `/` emits no writes |
  | Pathname regex edge cases | 4 | `/c` (no slug); `/c/foo/bar` (multi-segment); multi-param query; hash fragment preservation |
  | `chapter-jump` defensive guards (integration tier) | 2 | `-Infinity` anchorEt rejected; unknown slug writes URL anyway |
  | History-pollution invariant: chapter-jump + free scrub | 1 | exactly ONE pushState per click + 5 follow-on scrubs |

### Chrome DevTools MCP smoke (Integration AC8 — lead-executed)

Per voyager-skill-rules.md Rule 3 + Rule 7. Documented inline at the
bottom of `web/tests/url-router-qa-gaps.test.ts` as a 19-step probe
plan covering AC8a (cold-load deep-link), AC8b (mid-cycle URL update
clock-of-truth), AC8c (back AND forward navigation), and console
hygiene. No `initScript` shim needed (Rule 6, post-Story-1.16).

Probe sequence highlights:

1. `mcp__chrome-devtools-mcp__navigate_page` → cold-load
   `http://localhost:5173/c/v2-neptune?t=1989-08-25T09:23:00Z` (AC8a).
2. `mcp__chrome-devtools-mcp__evaluate_script` → assert
   `__voyagerDebug.chapterDirector.activeChapter.slug === 'v2-neptune'`
   and HUD date includes "1989". **AC8a.**
3. `mcp__chrome-devtools-mcp__take_screenshot` →
   `2-4-smoke-evidence/01-cold-load-v2-neptune.png`.
4. `mcp__chrome-devtools-mcp__take_snapshot` →
   `2-4-smoke-evidence/01-cold-load-a11y.txt`.
5. Press `3` (V1 Jupiter digit shortcut) → assert path becomes
   `/c/v1-jupiter` AND `?t=` matches `activeChapter.anchorEt` within
   1 sec (clock-of-truth invariant). **AC8b.**
6. Screenshot → `2-4-smoke-evidence/02-after-v1-jupiter-jump.png`.
7. Press `4` (V2 Jupiter) → assert path `/c/v2-jupiter`.
8. `evaluate_script` → `window.history.back()` → assert path
   `/c/v1-jupiter` AND `activeChapter.slug === 'v1-jupiter'`. **AC8c.**
9. Screenshot → `2-4-smoke-evidence/03-back-to-v1-jupiter.png`.
10. `evaluate_script` → `window.history.forward()` → assert path
    `/c/v2-jupiter` AND `activeChapter.slug === 'v2-jupiter'`.
    **AC8c (forward leg).**
11. Screenshot → `2-4-smoke-evidence/04-forward-to-v2-jupiter.png`.
12. `list_console_messages` → assert no errors (Lit dev-mode banner
    is the only allow-listed message). **Console hygiene.**

## Verification

- `cd web && npx vitest run` — **1544 pass** (+23 from dev baseline 1521).
- `cd web && npm run typecheck` — clean.
- `cd web && npm run lint` — baseline preserved (5 pre-existing warnings,
  0 new).

## Coverage notes

- **All 8 ACs (AC1–AC8) and the three R2 edge cases have CI-tier
  coverage** between dev + QA suites.
- **Integration AC8** has CI-tier coverage at three integration
  layers (`web/src/services/url-router.test.ts`,
  `web/tests/url-router-integration.test.ts`,
  `web/tests/url-router-qa-gaps.test.ts`); the lead-executed Chrome
  DevTools MCP smoke remains the binding browser-evidence gate per
  Rule 7.
- **Forward-compat note for Story 2.5:** the current URLRouter
  writeback paths (`writeChapterPushState`, `writeChapterReplaceState`,
  `writeHomeReplaceState`, `writeNow`) build URLs as `?t=<iso>` only
  — they DROP `?embed=true` and any other query parameters present
  at boot. The `docs/url-contract.md` § Query Parameters reserves
  `embed` as a Story 2.5 placeholder; preserving `embed` through
  writebacks is therefore a Story 2.5 task. The current behavior is
  pinned by a regression test in
  `url-router-qa-gaps.test.ts › Story 2.4 — \`?embed=true\` coexistence`.

## Decisions

- **No new files in `web/src/`** — QA stage adds only test files.
- **All QA tests live in `web/tests/`** alongside the dev's
  integration suite, keeping the URLSync/URLRouter unit specs in
  `web/src/services/` undisturbed.
- **Embed-mode forward-compat pinned as current behavior** rather
  than fixed in this story — flagged for Story 2.5.

## Issues Encountered

- None blocking. The dev's wave-settle batching invariant held under
  3-boundary rapid scrubs, the boot-time subscription ordering held
  for cold-load deep-links, and the forward-leg of push→push→back→forward
  correctly consumed the existing history entry without a redundant
  pushState.
