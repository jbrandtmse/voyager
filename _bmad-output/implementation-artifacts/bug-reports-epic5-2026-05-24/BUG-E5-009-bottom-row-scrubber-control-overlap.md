# BUG-E5-009 — Bottom row: play button + speed multiplier overlap mission scrubber chapter-markers

**Severity:** MED (visible overlap, but no functional break)
**Found:** 2026-05-24 by Epic 5 cross-review (user-prompted second pass)
**Status:** FIXED (same session, inline)

## Symptom

After BUG-E5-007 fixed the CSS link, the bottom row of controls became visible. The mission scrubber spans the full horizontal width with chapter-marker labels (V1L, V2L, V1J, V2J, V1S, V2S, V2U, V2N, PBD, V1H, V2H) anchored at the marker positions, which sit at y≈831 just above the scrubber track.

The play button (44×44 px) sits at (38, 818-862) and its glyph `▶` at (53, 832). The leftmost chapter-marker labels (V2L at x=28-48, V1L at x=29-49) sit at y=831 — exactly the same y as the play button glyph AND inside the play button's x-range.

Right side: speed multiplier readout `1× — 1 sec/sec` at (1116, 844) sits at the right edge of where the mission scrubber's right-edge date label would render.

## Root cause

Both `<v-timeline-scrubber>` variants (mission AND detail) span from `left: var(--v-edge-margin)` to `right: var(--v-edge-margin)` — the full content width. This puts them directly under the play button (left edge) AND directly behind the speed multiplier (right edge).

The chapter-marker labels (`bottom: 100%` relative to the scrubber track) end up in the same vertical region as the play button glyph.

Pre-BUG-E5-007 the issue was invisible because the bottom row controls were all collapsed at (0,0) with the missing CSS.

## Fix

Add explicit horizontal gutters to the scrubber host:

```css
:host {
  left: calc(var(--v-edge-margin) + 56px);  /* play button 44px + 12px gap */
  right: calc(var(--v-edge-margin) + 184px); /* speed multiplier 172px + 12px gap */
}
```

Both variants share this gutter; the detail variant overrides `bottom` for its different y-position but inherits the horizontal layout.

## Verification

Post-fix:
- Mission scrubber: x=93-1032 (was x=38-1216).
- Play button: x=38-82, unchanged. 11px gap to scrubber.
- Speed multiplier: x=1044-1217, unchanged. 12px gap to scrubber.
- Leftmost chapter-marker label V2L: x=84, y=831 — now sits to the RIGHT of the play button (which ends at x=82).
- Rightmost decade labels stop at x=1032 — clean of speed multiplier at x=1044.

## Known residual issue (deferred to Story 6.2)

Chapter-marker labels still overlap each other when chapters are temporally close on a multi-decade scrubber:
- V2L (1977-08-20) overlaps V1L (1977-09-05) — 16 days apart
- V1J (1979-03-05) overlaps V2J (1979-07-09) — 4 months apart
- V1S (1980-11-12) overlaps V2S (1981-08-25) — 9 months apart
- V2N (1989-08-25) overlaps PBD (1990-02-14) — 6 months apart

These are intra-scrubber overlaps that need a marker-clustering algorithm (collapse close pairs into a single dual-marker like `V1L/V2L`). The deferred-work entry `[2.2 / LOW] v-timeline-scrubber renderChapterMarker closure-per-render` already routes scrubber refactor to Story 7.6; the marker-clustering work joins that.

## Why earlier stories didn't catch this

Same dependency as BUG-E5-008 — the broken CSS in BUG-E5-007 collapsed the bottom row to (0,0), hiding the overlap. Once tokens resolved, the layout exposed both the play-button-vs-scrubber overlap (this bug) and the icon-vs-HUD overlap (BUG-E5-008).
