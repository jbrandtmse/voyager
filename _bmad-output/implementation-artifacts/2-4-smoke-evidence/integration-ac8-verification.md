# Story 2.4 — Integration AC8 Verification (Epic 2 R2 Mitigation)

**Date:** 2026-05-20
**Verifier:** team-lead@epic-cycle-2026-05-20

## Three R2 Edge Cases Verified

### AC8a — Cold-load deep-link `/c/<slug>?t=<iso>`

- **URL:** `http://localhost:5173/c/v2-neptune?t=1989-08-25T09:23:00Z`
- **Observed:**
  - Mission timeline valuetext: `"1989-08-25 09:23 UT"` ✓
  - HUD date: `"1989-08-25 09:23"` ✓
  - `__voyagerDebug.chapterDirector.activeChapter.slug === "v2-neptune"` ✓
- **Verdict:** PASS

### AC8b — Mid-cycle URL update preserves ClockManager as source of truth

- **Action:** Click V1 Jupiter marker
- **Observed:**
  - URL: `/c/v1-jupiter?t=1979-03-05T12:05:00Z` (pushState) ✓
  - activeChapter: `v1-jupiter` ✓
  - `?t=` matches the chapter's anchorEt (URL derived FROM clock, not the other way) ✓
- **Verdict:** PASS

### AC8c — Browser back/forward fires chapter transitions through the FSM

Sequence: click V1 Jupiter (push) → click V2 Saturn (push) → browser back → browser forward.

| Step | URL | activeChapter |
|---|---|---|
| 1. V1 Jupiter click | `/c/v1-jupiter?t=1979-03-05T12:05:00Z` | v1-jupiter |
| 2. V2 Saturn click | `/c/v2-saturn?t=1981-08-26T00:00:00Z` | v2-saturn |
| 3. Browser back | `/c/v1-jupiter?t=1979-03-05T12:05:00Z` | v1-jupiter ✓ |
| 4. Browser forward | `/c/v2-saturn?t=1981-08-26T00:00:00Z` | v2-saturn ✓ |

Both back and forward correctly:
- Update the URL (browser-driven popstate)
- Fire the URLRouter's popstate handler
- Call `clockManager.scrubTo(et)` to seek to the parsed ET
- On the next frame: `engine.onFrame → chapterDirector.update(et)` → FSM transitions → activeChapter matches the URL slug

The cr-2-4 fix (popstate suppression broadened to any-slug + main.ts boot-ordering synchronous director update) holds end-to-end.

**Verdict:** PASS

## ADR-0001 Compliance

All URL slugs observed during the smoke (`v2-neptune`, `v1-jupiter`, `v2-saturn`) are in the ADR-0001 frozen list. `?t=` parameter format is ISO-8601 UTC as documented in `docs/url-contract.md`.

## Voyager Skill Rules Compliance

- Rule 1 (Integration AC): producer-side integration ACs from Stories 2.1/2.2/2.3 (ChapterDirector, scrubber markers, chapter index) all exercised end-to-end through this URL routing layer.
- Rule 2 (Consumed-by): URL router subscribes once at document level to `chapter-jump` CustomEvent emitted by BOTH the scrubber markers (Story 2.2) and the chapter index (Story 2.3) — verified by AC8b probe.
- Rule 3 (browser-smoke exit criterion): evidence in this directory.
- Rule 5 (NFR tripwire): NFR-S7 strict-typed parameter parsing verified in QA tests (out-of-range / malformed `?t=` and unknown slugs all silently fall back without user-facing error UI).

## Verdict

**PASS.** Story 2.4 ships. All three R2 mitigation edge cases verified in a real browser session. URL routing is the second-to-last piece of the Mission Spine substrate (Story 2.5 will add `?embed=true` chrome-less mode).
