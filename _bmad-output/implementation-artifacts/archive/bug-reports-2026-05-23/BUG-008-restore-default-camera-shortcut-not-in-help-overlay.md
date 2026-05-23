---
id: BUG-008
title: Help overlay (Story 2.8) is missing the "restore default camera" keyboard shortcut
severity: low
type: completeness / documentation
discovered_during: review-2026-05-23
related_story: 2-8-v-help-overlay-modal-with-full-keyboard-shortcut-inventory
related_secondary_story: 4-2-voyagercameracontroller-manual-override-and-restore-default
related_epic: epic-2
related_fr: FR33 (return to default framing with a single action)
---

## Summary

The `<v-help-overlay>` keyboard-shortcut inventory does not document the "restore default camera framing" shortcut introduced in Story 4.2.

## Evidence

Captured shortcut list from the live help overlay (Esc closes / "?" opens):

- **Playback:** Space; ←/→; Shift+←/→; Home/End
- **Navigation:** 1…9; M (chapter index); A (About)
- **Speed:** +/−; Shift+(+/−)
- **Display:** H (toggle HUD); G (toggle audio); ? (this overlay); Esc

Story 4.2 acceptance criteria require a single-action restore (typically `R` or similar). FR33: "User can return to default camera framing with a single action after manual camera control."

Screenshot:
`_bmad-output/implementation-artifacts/review-screenshots/03-help-overlay.png`

## Expected

The shortcut for restoring default camera framing (whatever the implementation chose — `R`, `D`, or the same key that triggers manual orbit reset) must appear under the **Display** or **Navigation** section per Story 2.8's "full keyboard shortcut inventory" promise.

## Suspected location

`web/src/components/v-help-overlay.ts` — the static inventory needs a new entry once Story 4.2's restore shortcut is finalized. Verify in `voyager-camera-controller.ts` what the implemented restore keybinding actually is.

## Impact

- FR33 is implemented but undiscoverable via the documented shortcut surface.
- Story 2.8's "full inventory" promise breaks each time a downstream story adds a shortcut without updating the help overlay.

## Closure (2026-05-23)

- **Status:** STILL_ACTIVE → FIXED
- **Closing story:** 4.10
- **Triage evidence:** Opened help overlay live; the rendered text contained
  only `Space ← → Shift+(←/→) Home/End 1…9 M A + - Shift+(+/-) H G ? Esc` —
  no `R` entry under any section. Story 4.2's R-key restore-default-camera
  shortcut (per FR33) was implemented in `boot/camera-restore-affordance.ts`
  but never added to the help overlay's static inventory.
- **Fix:** Added a new `renderShortcut([['R']], 'Restore default camera
  view')` entry to the `Display` section of `<v-help-overlay>` (between
  the `G` toggle audio and the `?` self-reference). Post-fix live smoke
  confirmed `R Restore default camera view` appears in the overlay text.
- **Fix commit:** (lead populates post-commit)
- **Defense test:** `web/tests/bug-fix-batch-2026-05-23-defense.test.ts`
  — `BUG-008 defense` describe block (opens overlay, finds the `R` kbd
  element, asserts its sibling description mentions restore/default/camera
  AND the parent section is Display or Navigation).
