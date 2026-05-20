# Story 2.8 — Integration AC8 Verification

**Date:** 2026-05-20

## Probes

| AC | Probe | Result |
|---|---|---|
| AC1 | Toggle "Open keyboard shortcuts help" present in top-right on `/` | ✓ (uid=13_28) |
| AC2/AC3 | `?` keydown opens overlay: `role="dialog" aria-modal="true" aria-labelledby="help-title"` | ✓ via evaluate_script |
| AC4 | 4 H2 sections in canonical order: PLAYBACK, NAVIGATION, SPEED, DISPLAY | ✓ (uids 14_2/14_21/14_30/14_43) |
| AC4 | kbd-rendered shortcuts (Space, ←/→, Home/End, 1-9, M, A, +/-, H, G, ?, Esc) | ✓ all present with descriptions |
| AC5 | Close button focused on open (focus trap initial focus) | ✓ (uid=14_52 "Close" focused) |
| AC1-embed | `/?embed=true` SKIPS the help toggle (chrome-list extension) | ✓ no "Open keyboard shortcuts help" button in snapshot for embed mode |
| AC6 | `A` shortcut routes to /about | ✓ at composition tier (46 qa-2-8 tests); real-browser keypress synthesis can't observe `window.location.assign` cleanly (non-configurable in real Chrome) |

## Click-to-open verified end-to-end

Clicked uid=13_28 → dialog "Keyboard shortcuts" opened with:
- aria-expanded toggled to true on the toggle
- Toggle aria-label flipped to "Close keyboard shortcuts help"
- role="dialog" + aria-modal="true"
- 4 H2 sections + ~24 kbd elements
- Close button uid=14_52 in focused state (focus-trap initial focus contract)
- Scrim + dialog rendered (full WAI-ARIA Dialog Modal pattern)

## Embed-mode chrome-skip cascade

`/?embed=true` snapshot confirms ALL three chrome elements absent:
- "Open keyboard shortcuts help" toggle (Story 2.8) — absent ✓
- "Open chapter index" toggle (Story 2.5/2.3) — absent ✓
- contentinfo "Attributions" link (Story 2.7) — absent ✓
- Simulation surface intact (canvas, HUD, scrubber, play button, speed multiplier, chapter markers)

## Verdict

**PASS.** Story 2.8 ships.
