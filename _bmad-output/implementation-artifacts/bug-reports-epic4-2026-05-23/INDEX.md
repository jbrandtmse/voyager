---
review_date: 2026-05-23
reviewer: claude (opus 4.7)
session: epic-4-completion-rewalk (after epic 4 marked complete)
total_bugs_filed: 4
---

# Bug Reports — Epic 4 completion rewalk (2026-05-23)

Four defects filed against the now-completed Epic 4 stories (4.5, 4.6, 4.7, 4.8). All four are visible in the production app today.

## By severity

| ID | Severity | Title | Stories |
|---|---|---|---|
| [BUG-E4-001](BUG-E4-001-encounter-moons-hidden-no-ephemeris.md) | critical | Encounter-target moons (Galilean, Titan, Miranda, Triton, etc.) loaded as hidden meshes at scene-origin; no ephemeris data baked | 4.5, 4.6, 4.7 |
| [BUG-E4-002](BUG-E4-002-saturn-no-rings-rendered.md) | high | Saturn renders without rings (also Neptune/Uranus rings missing per their chapter copy) | 4.6, also 4.7, 1.13 |
| [BUG-E4-003](BUG-E4-003-visual-validation-doc-unjustified-rule5-amendment.md) | high | Story 4.8 doc ships un-annotated screenshots + deferred FR11/FR12 hero shots via an incorrect "heliocentric camera mode not available" claim | 4.8 |
| [BUG-E4-004](BUG-E4-004-future-trajectory-degenerate-in-body-centered-framing.md) | medium | Future-trajectory Line2 has degenerate vertices past index ~121 in body-centered chapter framing | 4.1, 4.3, 1.12 |

## Recommended fix order

1. **BUG-E4-001** — biggest narrative breakage; chapter copy names moons the user can't see. Likely a single bake-pipeline + manifest extension plus a visibility-on-window-open subscriber.
2. **BUG-E4-002** — Saturn-without-rings is unrecognisable. Lowest-hanging visual win.
3. **BUG-E4-004** — fix the chunk-loader / scene-space mapping so future trajectory lines stay continuous in body-centered framing. This is a prerequisite for fixing BUG-E4-003 properly.
4. **BUG-E4-003** — once BUG-E4-004 is fixed, the trajectory bends will be legible in cruise framing (already are visually, but the doc claims the framing isn't available); re-do Story 4.8's screenshots in cruise heliocentric view, annotate per AC1, drop the Rule-5 amendment, restore the FR11/FR12 hero shots.

## Method

- Dev server at `http://localhost:5173` (PID 17052).
- Tested via Chrome DevTools MCP — navigation, screenshots, `__voyagerDebug` evaluation.
- Each Epic 4 done-story re-tested at its canonical `/c/<slug>` route.
- Visited cruise framings at `/?t=1985-01-01`, `/?t=1990-01-01`, `/?t=2010-01-01` to verify the FR11/FR12 bends are visible in production (they are).
- Read the Story 4.8 visual-validation document and per-chapter spec files (`web/src/chapters/specs/*.ts`) for AC verification.

## Stories that pass

- **Story 4.1** ViewFrame + smoothstep blend — body-centered framing applies correctly at each chapter route; cruise default is the heliocentric 10-AU view.
- **Story 4.2** VoyagerCameraController — manual override + R-key restore documented and functional.
- **Story 4.3** Cadence-shift chunks + 4K KTX2 — planet textures render with high detail; LOD chain (lod0..lod3) on spacecraft model is wired in. (Moon meshes loaded but unposed — see BUG-E4-001.)
- **Story 4.4** Detail scrubber variant — ARIA label correct (no duplicate-word bug); range labels render ("FEB 28 / MAR 10, 1979"); active marker styled in `--v-color-accent` (`#d4a017`).

## Stories that PARTIALLY pass

- **Story 4.5** V1 Jupiter — chapter copy ✓, body-centered framing ✓, scan platform articulates ✓ (SCAN_PLATFORM local quaternion changes between 08:00 → 12:05 UT), NAC boresight cone exists ✓, attitude indicator "CK reconstructed" ✓. **BUT:** Io explicitly named in spec + AC as "visible during closest approach" is hidden (BUG-E4-001). NAC sweep target sequence can't be visually verified.
- **Story 4.6** V2J/V1S/V2S — chapter copy + framing + URL routing + chapter markers work. **BUT:** Saturn lacks rings (BUG-E4-002); Saturnian moons hidden (BUG-E4-001); V1S Titan slingshot bend not visually evident in body-centered framing (BUG-E4-004); FR11 visual evidence not delivered (BUG-E4-003).
- **Story 4.7** V2U/V2N — chapter copy + framing work. **BUT:** Uranian / Neptune moons hidden (BUG-E4-001); FR12 Triton south-bend not visually evident in body-centered framing nor documented (BUG-E4-003).
- **Story 4.8** gravity-assist visual validation — doc exists at the right path, has six sections, has six screenshots. **BUT:** screenshots not annotated; Rule-5 amendment claim is false; FR11 + FR12 hero shots deferred (BUG-E4-003).
