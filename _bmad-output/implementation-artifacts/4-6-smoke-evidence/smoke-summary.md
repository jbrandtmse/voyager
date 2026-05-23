# Story 4.6 — Chrome DevTools MCP Smoke Evidence

**Result:** PASS (iter-1 of 1) | **Defects caught:** 0 | **Lead:** claude-opus-4-7

Single-iteration smoke across three chapters. All three pass on first run because Story 4.5 already landed the wire-up (applyDefaultFraming subscriber + cold-load replay); Story 4.6 reused the pattern without introducing new auto-trigger paths.

## Per-chapter probe results

### V2 Jupiter (/c/v2-jupiter)
PASS — window ±5d (span=864000s); `defaultFraming.offsetKm=[1M, 1.5M, 2.5M]`; `camera.position` matches framing within 100 km tolerance; chapter copy `<h2>V2 Jupiter.</h2>` + body prose rendered; Jupiter (NAIF 5) at NDC (0,0); V2 (voyager-2) at NDC (0.247, 0.356) — both in frustum.

Body prose validates the Rule-5 PRD amendment: copy reads "V2 sweeps inward from Callisto to Ganymede to Europa to Io" — no Amalthea. Original PRD's "Callisto/Ganymede/Europa/Amalthea" was historically wrong (per NASA SP-439 Appendix A); amended in place per Rule 5.

### V1 Saturn (/c/v1-saturn)
PASS — window ±5d (anchor 1980-11-12T23:46:00Z, valuemin/max in accessibility tree confirm); `defaultFraming.offsetKm=[1.5M, 1.5M, 3M]` (Saturn-scale, scaled up from V1J's [1M, 1.5M, 2.5M] for Titan distance); `camera.position` matches framing; chapter copy `<h2>V1 Saturn.</h2>` + body prose rendered; Saturn (NAIF 6) at NDC (0,0); V1 (voyager-1) at NDC (-0.013, 0.061) — both in frustum.

Titan (NAIF 606) NDC (-3.617, 0.734) — off-screen on X axis. Same satellite-SPK-procurement gap from Story 4.3 cycle-4 documented follow-up (Titan ephemeris not yet baked; `sat427.bsp` kernel pending). The body-centered framing IS correct; Titan will appear once kernels procure.

Body prose includes the quantitative 6,490 km Titan flyby altitude (Rule-5 audit: cited to MISSION_FACTS.md primary source). No invented deflection-angle value — qualitative "northward" / "climbs out of the ecliptic" only, per dev's documented Issue 3.

### V2 Saturn (/c/v2-saturn)
PASS — window ±5d (anchor 1981-08-26T00:00:00Z); `defaultFraming.offsetKm=[1.5M, 1.5M, 3M]` (same Saturn-scale baseline as V1S); `camera.position` matches framing; chapter copy `<h2>V2 Saturn.</h2>` (per the page snapshot for v2-saturn) + body prose rendered; Saturn at NDC (0,0); V2 at NDC (0.022, 0.14) — both in frustum.

## Accessibility-tree confirmation (per chapter)

Each chapter's accessibility tree shows the expected pattern:
- Mission slider with `valuetext` = chapter's anchor ISO
- Detail slider with `aria-label="<chapter name> encounter timeline"` and `aria-valuemin/max` = anchor ± 5 days
- HUD provenance status = "CK reconstructed"
- `<article>` with `<h2>` chapter lede + body prose

## V1S Titan-slingshot bend probe (AC4)

Deferred to lead's manual visual review — the V1S body prose ends with "After Saturn closest approach at twenty-three forty-six UTC, V1 climbs out of the ecliptic toward interstellar space." Story 4.8 captures the canonical annotated screenshot of the post-encounter bend.

## Console clean

Same baseline as Stories 4.4 + 4.5: Lit dev banner + documented "Multiple active KTX2 loaders" advisory. No new warnings or errors.

## Evidence files

- `v2-jupiter-PASS.png`
- `v1-saturn-PASS.png`
- `v2-saturn-PASS.png`

## Defect count vs. Story 4.3 / 4.5

| Story | Cycles | Smoke iters | Defects caught | Net effect |
|---|---|---|---|---|
| 4.3 | 7 | 4 | 3 | Established cold-load replay + KTX2Loader init + URL-routing defenses |
| 4.4 | 1 | 1 | 0 | Rules 9 + 10 prevented Story-4.3-style traps before they surfaced |
| 4.5 | 2 | 2 | 1 | Established applyDefaultFraming auto-trigger pattern (same shape as 4.3 cold-load replay) |
| **4.6** | **1** | **1** | **0** | **Reused 4.5's pattern — no new wire-up paths, no new defects** |

Story 4.6 is the cleanest encounter-chapter story so far. The pattern is now load-bearing — Story 4.7 (V2U + V2N) should ship the same way: copy + defaultFraming + auto-applied via existing trigger.
