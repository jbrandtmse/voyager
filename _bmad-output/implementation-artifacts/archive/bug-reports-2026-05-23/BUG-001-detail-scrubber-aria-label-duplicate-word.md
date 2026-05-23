---
id: BUG-001
title: Detail scrubber aria-label has duplicated word "Encounter encounter timeline"
severity: medium
type: accessibility / copy
discovered_during: review-2026-05-23
related_story: 4-4-v-timeline-scrubber-variant-detail-detail-scrubber-variant
related_epic: epic-4
---

## Summary

The `<v-timeline-scrubber variant="detail">` exposes its inner ARIA slider with `aria-label="Encounter encounter timeline"` — the word "encounter" is duplicated.

## Evidence

Live DOM query at `http://localhost:5173/` after fresh load:

```
{"label":"Encounter encounter timeline","valuenow":"1977-08-20T00:00:00Z"}
```

Scrubber elements present: `variant="mission"` (label: "Mission timeline" — correct) and `variant="detail"` (label: "Encounter encounter timeline" — duplicated).

## Expected

Story 4.4 calls this the "Detail-Scrubber Variant." Likely intended label: `"Encounter timeline"` or `"Detail timeline"` — single use of the disambiguating noun.

## Impact

- Screen-reader users hear "Encounter encounter timeline slider" — sounds like a stutter or bug.
- Visible aria-label fails basic copy review.

## Suspected location

`web/src/components/v-timeline-scrubber.ts` (label-composition logic for the `detail` variant — likely string concatenation that appends "encounter" to a value already containing "encounter").

## Closure (2026-05-23)

- **Status:** ALREADY_FIXED (latent fallback path hardened in 4.10 sweep)
- **Closing story:** 4.10 (verification + latent-fallback hardening)
- **Triage evidence:** Live smoke at `/c/v1-jupiter` (2026-05-23) returned
  `aria-label = "Voyager 1 — Jupiter encounter timeline"` (no duplicate). Story
  4.4 work landed the production fix; this story's only code change is a latent
  fallback (`activeDetailChapter === null`) that previously composed
  `"Encounter encounter timeline"`. Production never reaches that branch (the
  detail scrubber only opens when an encounter chapter holds), but the
  fallback is now `"Encounter timeline"` for screen-reader hygiene.
- **Fix commit:** (lead populates post-commit)
- **Defense test:** `web/tests/bug-fix-batch-2026-05-23-defense.test.ts`
  — `BUG-001 defense` describe block (2 tests: active-encounter happy-path
  + null-fallback negative).
