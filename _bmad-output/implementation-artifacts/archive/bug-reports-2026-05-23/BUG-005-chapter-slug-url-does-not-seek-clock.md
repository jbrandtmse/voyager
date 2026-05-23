---
id: BUG-005
title: Chapter-slug URL (`/v1-jupiter` etc.) does not seek the simulation clock on cold load
severity: critical
type: routing / state-sync
discovered_during: review-2026-05-23
related_story: 2-4-per-chapter-url-slug-scheme-and-pushstate-navigation
related_epic: epic-2
related_fr: FR4, FR37 (deep-link to chapter), FR41 (URL contract)
---

## Summary

Visiting `http://localhost:5173/v1-jupiter` (or any other chapter slug) loads the app but the simulation clock remains at the mission-start anchor (1977-08-20 00:00 UT) instead of the chapter's anchor ET (1979-03-05 for V1 Jupiter).

## Evidence

1. Cold-loaded `http://localhost:5173/v1-jupiter`, waited for the page to render.
2. HUD date reads `1977-08-20 00:00`.
3. Mission scrubber `aria-valuetext = "1977-08-20 00:00 UT"`.
4. Chapter index opens with the first option ("Voyager 2 Launch") selected and focused — confirming the clock matches mission start, not V1 Jupiter.
5. `__voyagerDebug.viewFrame.chapters` includes `{ slug: "v1-jupiter", anchorEt: -657244449.816 }` — the slug is registered correctly.
6. `window.location.pathname === "/v1-jupiter"` — the router sees the slug.

Screenshot:
`_bmad-output/implementation-artifacts/review-screenshots/02-v1-jupiter-slug-load.png`

## Expected (per Story 2.4)

> A visitor opens `voyager.app/v1-jupiter`, the simulation initializes paused at the chapter's anchor ET … the address-bar URL is preserved on subsequent timeline edits.

## Reproduction

```
1. Hard refresh http://localhost:5173/v1-jupiter
2. Wait for first paint
3. Observe HUD date and scrubber aria-valuetext
   Actual:   1977-08-20 00:00
   Expected: 1979-03-05 00:00 (or the documented anchor)
```

Same behaviour observed for `/v2-jupiter`, `/v1-saturn`, etc. (single sample tested — all are likely affected since the router never invokes a seek).

## Suspected location

- `UrlRouter` / `UrlSync` (registered in `__voyagerDebug.urlRouter`, `__voyagerDebug.urlSync`) — the slug→ET resolution and `ClockManager.setEt(...)` boot-time dispatch is not happening for path-style routes.
- Possible: `urlRouter.currentRouteKind` is not being initialised to "chapter" on cold load; only handles popstate / pushState transitions after first paint.

## Impact

- All deep-linked chapter URLs land the user at mission start instead of the promised chapter.
- FR37 (sharing URLs to specific chapters) is broken end-to-end.
- OG cards from Story 2.6 will preview accurately but the destination experience won't match the card.
- URL contract (FR41) is broken on first paint.

## Closure (2026-05-23)

- **Status:** MISFILED
- **Closing story:** 4.10 (URL contract clarification)
- **Verification evidence:** Canonical URL contract is **`/c/<chapter-slug>`**,
  per:
  - `docs/url-contract.md` table at line ~17: row `/c/<chapter-slug>` ↔
    "Chapter route" — `/c/v2-neptune` example.
  - `ADR-0001` (URL contract as Public API).
  - `web/src/services/url-sync.ts:153` constant
    `CHAPTER_PATH_PATTERN = /^\/c\/([^/?#]+)\/?$/` and the writeback
    URL builders (line 478, 508, 538, 560) all emit `/c/<slug>`.
  - Live smoke at `/c/v1-jupiter` confirmed `hudDate = "1979-03-05 12:05"`
    (chapter-anchor seek IS working on the canonical route).
- **Why the report was MISFILED:** the bug tested `/v1-jupiter` (bare slug,
  no `/c/` prefix). That route shape is intentionally UNSUPPORTED — it
  matches the "other paths" case in `parseInitialPath()` (line 335) and
  falls through to the `kind: 'home'` branch with `initialEt =
  MISSION_START_ET`. The observed "clock stayed at 1977-08-20" behavior
  was correct silent-reject (NFR-S7) for an unsupported URL shape, not a
  routing bug.
- **No code change.** The clock-seek path for the canonical `/c/<slug>`
  contract was already working in Epic 4 smoke evidence and continues to
  work post-Story-4.10.
- **Defense test:** `web/tests/bug-fix-batch-2026-05-23-defense.test.ts`
  — `BUG-005 defense` describe block (`docs/url-contract.md` pins
  `/c/<chapter-slug>` shape; `url-sync.ts` pins `CHAPTER_PATH_PATTERN`).
