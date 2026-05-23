# Story 4.5 — smoke evidence

Per Story 4.5 AC8 + Voyager skill Rule 3, the lead drives a Chrome DevTools
MCP smoke against the local dev server (http://localhost:5173/c/v1-jupiter)
to verify:

- `__voyagerDebug.chapterDirector.activeChapter` slug `v1-jupiter` with
  ±5-day held-window narrowing landed (`windowEndEt − windowStartEt ≈
  864000 s`).
- `<v-chapter-copy>` renders V1J's lede (`V1 Jupiter.`) and body prose.
- Camera framing places Jupiter mesh + V1 spacecraft mesh + Io mesh
  within viewport bounds at the cold-load anchor.
- Detail scrubber date labels read `FEB 28` (left) / `MAR 10, 1979`
  (right) per the ±5d window.
- Mission scrubber V1J marker paints with the accent color.
- `<v-attitude-indicator>` shows `ATT CK reconstructed` across the V1J
  window.
- Scan platform articulation visibly changes between anchor and anchor
  + 25 min.
- Console clean (modulo the documented Lit dev banner +
  KTX2-loaders advisory).

The probe scripts (1 through 7) are listed verbatim in the story file
under `## Smoke probe plan (AC8) — for the lead's Chrome DevTools MCP`.

Evidence artifacts captured during the smoke land here:

- `cold-load-anchor.png` — V1J cold-load at anchor (1979-03-05 12:05 UT).
- `articulation-anchor.png` — scan platform pose at anchor.
- `articulation-anchor-plus-25m.png` — scan platform pose at anchor + 25
  minutes (visibly different from `articulation-anchor.png`).
- `console-messages.json` — console-message capture.
- `probe-results.md` — pass/fail summary of all seven probes.

If a probe surfaces a tuning gap (e.g. V1 + Jupiter + Io not all in
viewport), the dev iterates the `defaultFraming.offsetKm` values in
`web/src/chapters/specs/v1-jupiter.ts` and the lead re-runs the smoke
until all probes pass.
