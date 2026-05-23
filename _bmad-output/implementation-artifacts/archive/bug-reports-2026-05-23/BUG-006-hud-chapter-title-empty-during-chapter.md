---
id: BUG-006
title: HUD chapter-title (`<v-hud-chapter-title>`) renders empty even when a chapter is active
severity: medium
type: rendering / data binding
discovered_during: review-2026-05-23
related_story: 1-11-v-hud-container-and-hud-sub-components
related_secondary_story: 2-1-chapterdirector-fsm-and-11-declarative-chapter-specs
related_epic: epic-1
related_fr: FR34 (HUD shows current chapter title)
---

## Summary

The `<v-hud-chapter-title>` top-left HUD slot renders `<h2 aria-live="polite"></h2>` with no content even when navigating to a chapter URL.

## Evidence

At `http://localhost:5173/v1-jupiter`:

```html
<v-hud-chapter-title>
  #shadow-root
    <h2 aria-live="polite"></h2>
</v-hud-chapter-title>
```

A11y snapshot: `heading level="2" live="polite" relevant="additions text"` (no static-text child).

## Expected

Per Story 1.11 / FR34, the chapter title should populate with the chapter label when the chapter director enters a chapter state. During cruise it can be empty by design ("rendered empty during cruise" per Story 1.11), but at `/v1-jupiter` the chapter is supposed to be active.

## Note

This bug is downstream of BUG-005 (chapter slug routing). It may resolve automatically once the router seeks the clock and the chapter director enters the chapter's FSM state. Keeping it as a separate ticket because:

- The empty `<h2>` will still be a layout-stability issue during the cruise→chapter transition even when BUG-005 is fixed.
- `ChapterDirector.states` is empty (`{}`) regardless of URL, suggesting the FSM never enters any state.

## Closure (2026-05-23)

- **Status:** STILL_ACTIVE → FIXED
- **Closing story:** 4.10
- **Triage evidence:** Live smoke at `/c/v1-jupiter` confirmed
  `hudTitleText: ""` (empty) despite `activeChapter: "v1-jupiter"`.
  Component was a Story-1.11 stub: rendered `<h2 aria-live="polite"></h2>`
  with no chapter-director subscription. Story 2.1's TODO ("wires this up
  to the real ChapterDirector") was never completed.
- **Fix:** Rewrote `<v-hud-chapter-title>` to mirror the `<v-chapter-copy>`
  subscription pattern (Story 2.9 / 4.5):
  - `chapterDirector` setter/getter with subscribe/unsubscribe.
  - `connectedCallback` subscribes lazily + seeds from
    `director.activeChapter` (covers cold-load arrival where the
    director's sync seed already fired before mount).
  - `onTransition`: `to === 'held'` → render `chapter.name`; `from ===
    'held'` (matching current slug) → clear.
  - Added `chapterDirector` plain field on `<v-hud>` + identity-gated
    per-tick propagation in `tick(et)` (defends against the same
    post-render assignment trap that bit `attitudeService` in Story 3.6
    and `ephemerisService` in BUG-002).
  - Wired through `boot/first-paint.ts`: `hud.chapterDirector =
    options.chapterDirector` set pre-mount so the title's
    `connectedCallback` sees the director on first wire-up.
  - Post-fix live smoke at `/c/v1-jupiter` returned
    `hudTitleText: "Voyager 1 — Jupiter"`.
- **Fix commit:** (lead populates post-commit)
- **Defense test:** `web/tests/bug-fix-batch-2026-05-23-defense.test.ts`
  — `BUG-006 defense` describe block (post-mount director assignment +
  held → name populated; clear on `from === 'held'`).
