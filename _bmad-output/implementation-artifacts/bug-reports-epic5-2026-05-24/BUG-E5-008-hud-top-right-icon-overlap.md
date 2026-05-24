# BUG-E5-008 — HUD top-right corner: help/chapter-index icons overlap HUD date row

**Severity:** MED (visible overlap, but no functional break)
**Found:** 2026-05-24 by Epic 5 cross-review (user-prompted second pass)
**Status:** FIXED (same session, inline)

## Symptom

After BUG-E5-007 fixed the CSS link injection, the HUD top-right corner became visible. With the corner now properly positioned, the help-overlay icon (`?`) and chapter-index hamburger icon (`☰`) overlap horizontally with the HUD date row at y=38.

Pre-fix rect data:
- `<v-hud-date>`: x=1069-1216, y=38-58
- `<v-help-overlay>` icon: x=1140-1172, y=38-70 (overlaps date right portion)
- `<v-chapter-index>` icon: x=1184-1216, y=38-79 (overlaps date right edge)

## Root cause

Both `<v-help-overlay>` and `<v-chapter-index>` are positioned at `top: var(--v-edge-margin)` (≈38px at 1280×900). The HUD top-right corner is ALSO at `top: var(--v-edge-margin)`. All three elements stack at the same y-coordinate.

Pre-BUG-E5-007 the issue was invisible because the HUD itself was collapsed to (0,0) with the missing CSS tokens — the right edge was empty.

## Fix

Push both icon hosts DOWN by 116px (HUD top-right column height ~100px + 16px gap):

- `web/src/components/v-help-overlay.ts`: `top: calc(var(--v-edge-margin) + 116px)`
- `web/src/components/v-chapter-index.ts`: `top: calc(var(--v-edge-margin) + 116px)`

Both retain their existing `right` offsets to preserve the stacked-cluster horizontal arrangement.

## Verification

Post-fix:
- Help icon at (1140, 153) — clearly below the HUD distance row (which ends at y=136).
- Chapter-index icon at (1184, 153) — same row as help.
- No vertical overlap with HUD date, attitude indicator, or distance.

## Why earlier stories didn't catch this

The HUD top-right corner content was effectively invisible in production before the BUG-E5-007 fix landed today. With the corner collapsed to (0,0) due to missing CSS tokens, no one could see the icon overlap because there was no rendered date/attitude/distance text in the top-right to overlap WITH.

This bug surfaced as soon as BUG-E5-007 was fixed — a direct dependency.
