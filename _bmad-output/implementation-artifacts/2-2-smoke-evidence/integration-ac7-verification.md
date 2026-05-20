# Story 2.2 — Integration AC7 Verification (Chrome DevTools MCP)

**Date:** 2026-05-20
**Method:** Lead-executed Chrome DevTools MCP smoke against the dev server (`http://localhost:5173/`)
**Verifier:** team-lead@epic-cycle-2026-05-20

## AC7 Probe Results

| Probe | Expected | Observed | Result |
|---|---|---|---|
| 11 markers rendered | 11 `<button>` markers w/ aria-label + data-slug | markerCount=11; ARIA labels match `<name> — <ISO date>` | ✓ PASS |
| Boot active marker | `launch-v2` (matches MISSION_START_ET = 1977-08-20 V2 launch) | activeSlug=launch-v2; HUD shows "1977-08-20 00:00" | ✓ PASS |
| Single-active invariant | exactly 1 marker has `data-active` | activeCount=1 | ✓ PASS |
| Marker positioning | percentage along track | launch-v2 at 0.003%, launch-v1 at 0.085%, v1-jupiter at 2.89% — monotonic ascending order | ✓ PASS |
| chapter-jump CustomEvent | bubbles=true, composed=true, payload `{ slug, anchorEt }` | bubbles=true, composed=true, slug=v1-jupiter, anchorEt=-657244449.816 | ✓ PASS |
| Click jumps simulation | After click + next frame, ChapterDirector.activeChapter = clicked chapter | After click on V1 Jupiter + waitForFrame: activeChapter.slug=v1-jupiter; data-active migrated to v1-jupiter marker | ✓ PASS |

## ARIA Verification

All 11 markers exposed via accessibility tree as labeled buttons in chronological order:

```
button "Voyager 2 Launch — 1977-08-20"
button "Voyager 1 Launch — 1977-09-05"
button "Voyager 1 — Jupiter — 1979-03-05"
button "Voyager 2 — Jupiter — 1979-07-09"
button "Voyager 1 — Saturn — 1980-11-12"
button "Voyager 2 — Saturn — 1981-08-26"
button "Voyager 2 — Uranus — 1986-01-24"
button "Voyager 2 — Neptune — 1989-08-25"
button "Pale Blue Dot — 1990-02-14"
button "Voyager 1 — Heliopause Crossing — 2012-08-25"
button "Voyager 2 — Heliopause Crossing — 2018-11-05"
```

Chronological DOM order ✓. AC2 ARIA contract satisfied.

## End-to-End Flow Verified

```
User clicks marker
  → marker.onClick handler fires
  → CustomEvent 'chapter-jump' emitted (bubbles+composed; reaches document for Story 2.4 router)
  → clockManager.scrubTo(anchorEt) called (pauses + sets simTimeEt)
  → next render frame: engine.onFrame((et) => chapterDirector.update(et))
  → ChapterDirector transitions: previous chapter → exiting/passed; target chapter → entering/held
  → ChapterDirector.subscribe callback fires → scrubber re-renders → data-active migrates
  → HUD date updates (separate ClockManager subscription)
```

All four downstream consumers exercised:
1. CustomEvent payload (for Story 2.4 URL router)
2. ClockManager.scrubTo (Story 1.10 wire-up)
3. ChapterDirector.update via engine.onFrame (Story 2.1 wire-up)
4. ChapterDirector subscribers (scrubber's active-marker re-render)

## Verdict

**PASS.** Integration AC7 satisfied. Markers render, active treatment tracks ChapterDirector, click activation jumps the clock + emits the documented CustomEvent for Story 2.4 to consume.
