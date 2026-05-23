---
id: BUG-004
title: Playback-speed slider aria-valuetext contains UTF-8 mojibake ("1Ã â 1 sec/sec")
severity: medium
type: accessibility / character encoding
discovered_during: review-2026-05-23
related_story: 1-10-v-play-button-simulation-clock-and-v-speed-multiplier
related_epic: epic-1
---

## Summary

The `<v-speed-multiplier>` slider exposes `aria-valuetext="1Ã â 1 sec/sec"` to assistive tech, but the visible output in shadow DOM is `"1× — 1 sec/sec"` (correct). The aria attribute appears to have been double-encoded (UTF-8 bytes interpreted as Latin-1).

## Evidence

Live DOM at `http://localhost:5173/`:

- Snapshot (a11y tree): `valuetext="1Ã â 1 sec/sec"`
- Shadow-DOM rendered text: `"1× — 1 sec/sec"`

Other sliders (Mission timeline) do **not** have this problem — their `aria-valuetext` reads `"1977-08-20 00:00 UT"` cleanly.

## Expected

`aria-valuetext` should equal the rendered numeric/text format: `"1× — 1 sec/sec"`.

## Suspected location

`web/src/components/v-speed-multiplier.ts` — the value formatter feeding `aria-valuetext` is probably constructing the string from bytes (e.g., `String.fromCharCode` on a `Uint8Array`, or using `escape()`/`unescape()`) instead of using the JS-string literal that drives the visible text. Likely a single-byte vs multi-byte boundary issue where `×` (U+00D7 → C3 97) and `—` (U+2014 → E2 80 94) are emitted as `Ã —` ' ' `â `.

## Impact

- Screen-reader users hear corrupted text when adjusting playback speed.
- Inconsistent ARIA state across components is a regression risk for axe-core CI checks (Epic 6.4).

## Closure (2026-05-23)

- **Status:** ALREADY_FIXED
- **Closing story:** 4.10 (verification only)
- **Triage evidence:** Live smoke at `/?t=1980-01-01T00:00:00Z` returned
  `speedSlider aria-valuetext = "1× — 1 sec/sec"` — clean Unicode with the
  genuine U+00D7 multiplication sign and U+2014 em-dash, no mojibake byte
  sequence (Ã / â) anywhere in the string. Fix likely landed in a prior
  Epic 2/3 cycle when the speed-multiplier formatter was hardened against
  the byte-level conversion path described in the original bug report.
- **Fix commit:** (no fix in this story — pre-existing in current `main`)
- **Defense test:** `web/tests/bug-fix-batch-2026-05-23-defense.test.ts`
  — `BUG-004 defense` describe block (pins exact U+00D7 / U+2014
  presence + asserts mojibake byte sequence Ã / â absent).
