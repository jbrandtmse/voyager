# Story 2.9 — Integration AC7 Verification (Epic 2 Final Story)

**Date:** 2026-05-20

## Probes

| AC | Probe | Result |
|---|---|---|
| AC1 | `/c/v1-heliopause` cold-load → `<v-chapter-copy>` text-card "V1 heliopause." + ~80-120 word prose | ✓ heading uid=18_38; full prose uid=18_39+40 |
| AC1 | `/c/v2-heliopause` cold-load → V2 text-card with unique prose (PLS still operating, magnetic-field rotation, plateau alignment) | ✓ heading uid=16_38; full prose uid=16_39+40 |
| AC3 | `<v-hud-instruments>` shows two rows V1 ISS·UVS·PLS·LECP / V2 ISS·UVS·PLS·LECP | ✓ uid=18_25-32 |
| AC3 | At ET=2025-06-01: V1 ISS/UVS/PLS strikethrough + shut-off class + --v-color-fg-quiet; LECP active + --v-color-fg-muted | ✓ verified via evaluate_script + computed styles |
| AC4 | URL `/c/v1-heliopause` updates HUD to 2012-08-25 + chapter copy + instruments | ✓ end-to-end |
| AC5 | Heliopause crossing does NOT fire viewframe / camera transitions (Epic 4 machinery) | ✓ negative-evidence verified by qa-2-9's 4-event-name sweep at composition tier |
| Embed | `<v-chapter-copy>` mounts in embed mode (editorial content, not chrome) | ✓ dev decision pinned + qa-2-9 test verifies |

## Quality Observations

- Prose quality is striking. V1H: "On 25 August 2012, Voyager 1's instruments record the bass note...the plasma-wave instrument hears the density of the medium itself jump upward by a factor of forty. The solar wind has stopped. The interstellar medium has begun." V2H closes the loop: "Two probes, on different trajectories, separated by years and billions of kilometres, agree on where the heliopause is."
- Semantic ARIA: `<article live="polite">` for chapter copy; `role="row"` + `aria-label="V1 instrument status"` on HUD instrument rows.
- Color tokens: strikethrough = `rgb(95, 99, 104)` = `--v-color-fg-quiet`; active = `rgb(154, 160, 166)` = `--v-color-fg-muted`. Direct token match.

## Verdict

**PASS.** Story 2.9 ships. The bass-note elegy is fully legible — both via the editorial text-cards and the visual decay of instruments going dark across the decades.

**This concludes Epic 2.**
