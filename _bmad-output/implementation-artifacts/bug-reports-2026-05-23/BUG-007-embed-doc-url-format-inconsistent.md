---
id: BUG-007
title: About page documents `/c/<slug>?embed=true` URL format that doesn't match implementation (`/<slug>`)
severity: low
type: documentation / copy
discovered_during: review-2026-05-23
related_story: 2-7-v-about-page-and-v-attribution-panel
related_secondary_story: 2-4-per-chapter-url-slug-scheme-and-pushstate-navigation
related_epic: epic-2
---

## Summary

The About page's "Embed contract" section states the embed URL example as `/c/v2-neptune?embed=true`, but the actual chapter URL slug scheme uses no `/c/` prefix (e.g., `/v2-neptune`).

## Evidence

About page at `http://localhost:5173/about` includes:

> "a kiosk that deep-links to `/c/v2-neptune?embed=true` survives both director-driven boundary crossings…"

Actual URL contract (per Story 2.4 and the live router):

```
launch-v1, launch-v2, v1-jupiter, v2-jupiter, v1-saturn, v2-saturn,
v2-uranus, v2-neptune, pale-blue-dot, v1-heliopause, v2-heliopause
```

No `/c/` prefix; visited as `http://localhost:5173/<slug>`.

## Expected

Either:

- Update the About page copy to `/v2-neptune?embed=true`, **or**
- Update the router to also accept `/c/<slug>` as an alias (less likely, since URL contract is frozen by ADR-0001).

## Suspected location

`web/src/pages/v-about-page.ts` (or equivalent) — the embed-contract paragraph.

## Impact

- Curators copying the documented URL into a kiosk iframe will get a 404 (or land on the unsupported route).
- URL contract documentation contradicts the URL contract.

## Closure (2026-05-23)

- **Status:** MISFILED
- **Closing story:** 4.10 (URL contract clarification — paired with BUG-005)
- **Verification evidence:** The About page's `/c/v2-neptune?embed=true`
  example MATCHES the canonical URL contract. See BUG-005 closure for the
  full contract trace (`docs/url-contract.md`, `ADR-0001`,
  `url-sync.ts:CHAPTER_PATH_PATTERN`, live smoke).
- **Why the report was MISFILED:** the bug premise ("the actual chapter
  URL slug scheme uses no `/c/` prefix") is inverted — the actual scheme
  DOES use the `/c/` prefix. The About page is correctly documenting the
  canonical contract; the bug filer was testing against an unsupported
  bare-slug route (see BUG-005).
- **No code change.** The About page's documented embed URL is correct.
- **Defense test:** `web/tests/bug-fix-batch-2026-05-23-defense.test.ts`
  — `BUG-007 defense` describe block (greps `v-about-page.ts` for the
  `/c/<slug>?embed=true` form so a future PR that accidentally drops the
  prefix regresses the test).
