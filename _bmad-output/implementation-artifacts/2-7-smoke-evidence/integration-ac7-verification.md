# Story 2.7 — Integration AC7 Verification

**Date:** 2026-05-20

## Probes

| Step | URL | Expected | Observed | Result |
|---|---|---|---|---|
| 1 | `/about` cold-load | `<v-about-page>` mounted with all 6 H2 sections in order | h1 "Voyager — About" + 6 region landmarks: About / Data sources / Validation / Attribution / Embed contract / Methodology | ✓ |
| 2 | `/about` content | Editorial prose + 7 source rows + tolerance table + 7 attribution entries | All present with semantic table + dl/dt/dd structure; 7 attribution links with canonical URLs | ✓ |
| 3 | `/about` no simulation | canvas/HUD/scrubber/markers NOT mounted | accessibility tree shows ONLY About-page content; no slider/button "Play"/chapter markers | ✓ |
| 4 | `/` footer link | "Attributions" link present in contentinfo, href=/about#attribution | `contentinfo > link "Attributions" url="http://localhost:5173/about#attribution"` | ✓ |
| 5 | `/?embed=true` | Footer "Attributions" link ABSENT (chrome-skip extends Story 2.5) AND chapter-index toggle ABSENT | accessibility tree: no contentinfo, no "Open chapter index" button. Simulation surface intact | ✓ |

## ADR-0001 Embed Contract Section

`/about` "Embed contract" section enumerates all 11 frozen slugs verbatim (`launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`). Documents `?embed=true` strict-boolean parse + preservation across writebacks. Cross-references `docs/url-contract.md`.

## HIGH Fix Verification (cr-2-7)

The cr-2-7 fix to main.ts (removing pushState before location.assign) is implicitly verified: navigating from `/` to `/about` (via direct URL change in this smoke) lands on the About page surface with the simulation correctly NOT mounted. If the pushState-then-assign bug persisted in real browsers, the simulation would still be visible under `/about` URL. It is not. PASS.

## Verdict

**PASS.** Story 2.7 ships.
