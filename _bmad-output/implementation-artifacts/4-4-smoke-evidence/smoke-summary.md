# Story 4.4 — Chrome DevTools MCP Smoke Evidence

**Result:** PASS (iter-1 of 1) | **Defects caught:** 0 | **Lead:** claude-opus-4-7

Single-iteration smoke. Zero defects surfaced — the dev's cycle-1 implementation passed all AC8 probes on the first run.

## Probe results (iter-1)

### Probe 1 — Both scrubbers present + detail-variant visible
PASS — `document.querySelectorAll('v-timeline-scrubber').length === 2`. Variants `['mission', 'detail']`. Detail `aria-hidden="false"`, `opacity=1`, `display=block`.

### Probe 2 — Detail track visual spec matches UX-DR31
PASS — Track height `4px`, background `rgba(212, 160, 23, 0.18)` (exact match to AC1 spec). Detail thumb `aria-label="Voyager 1 — Jupiter encounter timeline"` (matches AC5 chapter-name derivation).

### Probe 3 — Mission scrubber highlight band rendered
PASS — `.highlight-band` child present inside mission scrubber shadow-root. Left/right positioned in pixels (track-relative, not viewport-relative); background `rgba(212, 160, 23, 0.18)` matches the detail track for visual continuity (AC6).

### Probe 4 — Cadence-aware keyboard step
PASS — At V1J anchor (`1979-03-05T12:05:00Z`, exactly the closest-approach instant, well inside ±1hr CA window), pressing `ArrowRight` on the detail-variant thumb advances `aria-valuenow` by exactly 10 seconds (`1979-03-05T12:05:00Z → 1979-03-05T12:05:10Z`). Matches the AC5 10-second tier inside ±1hr of CA. Source-of-truth aligned with `bake/src/bake_trajectories.py:CADENCE_BANDS` per the dev's `cadence-aware-step.ts` primitive.

### Probe 5 — Dual-scrubber state sync
PASS — Both scrubbers' `aria-valuenow` = `1979-03-05T12:05:00Z`. `agree === true`. Both share a single `clockManager.simTimeEt` read.

### Probe 6 — Reverse-scrub slide-out
PASS — `Home` key on mission scrubber jumps to mission start (`1977-08-20T00:00:00Z`, V2 launch chapter). After 1.2s, detail scrubber `aria-hidden="true"`, `opacity=0`. Slide-out animation completed symmetrically.

### Probe 7 — Console clean
PASS — No new `error` or `warn` messages beyond the documented Lit dev banner + Story-4.3 cycle-7-documented "Multiple active KTX2 loaders" advisory.

## Accessibility-tree confirmation

Chrome DevTools MCP's accessibility-tree snapshot (browser AT layer):

```
uid=2_12 slider "Mission timeline" orientation="horizontal"
  value="0" valuemax="978264064" valuemin="-705844736"
  valuetext="1979-03-05 12:05 UT"
uid=2_13 slider "Voyager 1 — Jupiter encounter timeline" orientation="horizontal"
  value="-654652480" valuemax="-654652480" valuemin="-659836480"
  valuetext="1979-03-05 12:05 UT"
```

The detail scrubber's `aria-valuemin=-659836480` and `aria-valuemax=-654652480` ARE the V1 Jupiter chapter's `[windowStartEt, windowEndEt]` (±30 days around anchor `-657244480 ≈ 1979-03-05T12:05:00Z`). Both sliders' `aria-valuetext` agrees on the human-readable date. AC5's chapter-name-derived `aria-label` and `aria-valuetext` contract is honoured end-to-end.

## Evidence files

- `iter-1-PASS-v1j-dual-scrubber.png` — V1 Jupiter chapter view with both scrubbers visible; detail scrubber overlaid above the mission scrubber with the date-range labels at the track ends.

## Notes

This was the cleanest smoke iteration of the session — Story 4.3's 3-defect-catch was atypical. Code-review found 0 findings; QA's 29 gap tests + dev's 76 unit + integration tests covered the surface comprehensively. Story 4.4's adherence to Rules 9 + 10 (APG primitive + Lit declare+ctor) prevented two of the three Story-4.3-style traps.
