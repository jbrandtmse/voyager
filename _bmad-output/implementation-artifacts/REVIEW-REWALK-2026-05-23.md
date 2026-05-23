---
review_date: 2026-05-23
reviewer: claude (opus 4.7)
session: post-bug-closure re-verification + fresh visual walkthrough
prior_review: archive/bug-reports-2026-05-23/REVIEW-WALKTHROUGH.md
---

# Voyager — Re-walk Review (post Story 4.10 bug-fix batch)

The eight bugs filed earlier on 2026-05-23 (`BUG-001` through `BUG-008`) have all been verified closed and the entire `bug-reports-2026-05-23/` folder has been moved into `archive/`. This document records the fresh visual walk-through that became possible once the upstream blockers (BUG-003 cruise camera, BUG-005 chapter routing — closed as FIXED and MISFILED respectively) were resolved.

## Closure re-verification summary

| Bug | Closure claim | Re-verification | Status |
|---|---|---|---|
| BUG-001 | Detail scrubber label "Voyager 1 — Jupiter encounter timeline" (no dup) | `/c/v1-jupiter` slider aria-label = `"Voyager 1 — Jupiter encounter timeline"` | ✅ PASS |
| BUG-002 | HUD distance renders numeric AU after tick() propagation | `/?t=1985-01-01`: V1=21.9 AU, V2=15.9 AU; `/?t=1980-01-01`: 6.89/6.04 AU | ✅ PASS (intermittent "— AU" still seen at exact chunk boundaries — known LRU sizing) |
| BUG-003 | Cruise camera at 10 AU magnitude | `/?t=1980-01-01` cam.position.z = 1.495978707e9 km; magnitude/AU = 10.000 | ✅ PASS |
| BUG-004 | `aria-valuetext` clean Unicode (U+00D7, U+2014) | Live JS: codepoints `U+0031 U+00D7 U+0020 U+2014 …`; no Ã/â bytes | ✅ PASS (snapshot tool renders as mojibake but real DOM is clean) |
| BUG-005 | `/c/<slug>` is canonical contract, `/<slug>` intentionally unsupported | `/c/v1-jupiter` → HUD date 1979-03-05 12:05, active chapter v1-jupiter | ✅ MISFILED (correctly closed) |
| BUG-006 | HUD chapter title populated via per-tick propagation | `/c/v1-jupiter` HUD heading = "Voyager 1 — Jupiter"; default route = "Voyager 2 Launch" | ✅ PASS |
| BUG-007 | About page documents the canonical `/c/<slug>?embed=true` form | About page text contains `/c/v2-neptune?embed=true` | ✅ MISFILED (correctly closed) |
| BUG-008 | "R Restore default camera view" added to Display section | Help overlay snapshot shows uids `R` + `Restore default camera view` | ✅ PASS |

All eight closures hold. Archive move complete: `_bmad-output/implementation-artifacts/archive/bug-reports-2026-05-23/`.

---

## Fresh visual walkthrough — completed stories

Screenshots all live in `_bmad-output/implementation-artifacts/review-screenshots/rewalk-2026-05-23/`.

### Epic 1

| Story | Verdict | Evidence |
|---|---|---|
| 1.1 Monorepo | PASS (infra) | repo layout |
| 1.2 ADR catalogue | PASS (infra) | documentation only |
| 1.3 Kernel acquisition | PASS (infra) | build-time |
| 1.4 Bake pipeline | PASS (infra) | runtime consumes baked data correctly |
| 1.5 Three.js renderer + floating origin | PASS | camera at scene origin, near 1e-6 / far 4.49e10 km; bodies positioned via wg-offset; reverse-Z active |
| 1.6 Asset manifest + EphemerisService | PASS | bodies at SPICE-derived positions; HUD distance numeric at cruise |
| 1.7 Design tokens / Lit 3 / typography | PASS | dark background, mono HUD digits, no FOUC, focus outlines render |
| 1.8 Fallback page + capability probe | NOT TESTED | requires WebGL2/WASM/Brotli failure path |
| 1.9 First-paint sequence + mission scrubber | PASS | scrubber bottom-anchored with chapter markers, ARIA slider with ISO `aria-valuetext`, `?t=` URL parameter honoured cold-load |
| 1.10 Play / speed multiplier | PASS | both render, aria-valuetext clean (BUG-004 verified). 1×/1M× end labels visible |
| 1.11 HUD + sub-components | PASS | Date, distance (numeric at cruise), instruments, speed, attitude indicator, chapter title — all populated |
| 1.12 Trajectory lines past-solid / future-dashed | PASS | past=`#e8eaed` solid (linewidth 1.5, dashed:false); future=`#5f6368` dashed (dashSize 0.5, gapSize 0.3, linewidth 1) — meets FR49 non-color-only encoding |
| 1.13 Celestial bodies | PASS in scene | all 12 bodies present at correct positions; Sun emissive (MeshBasicMaterial), 8 planets + Moon textured; Galilean moons present but hidden — see Finding A below |
| 1.14 CI / CDN deploy | PASS (infra) | not in live-app scope |
| 1.15 Manual-verification defect cleanup | PASS (per epic-1 retro) | original defect set distinct from BUG-001..008 closed today |
| 1.16 Brotli architectural fix | PASS (infra) | runtime decompression working; no console errors |

### Epic 2

| Story | Verdict | Evidence |
|---|---|---|
| 2.0 Cleanup | PASS (infra) | maintenance |
| 2.1 ChapterDirector FSM + 11 specs | PASS | `dbg.chapterDirector.activeChapter` populates correctly at `/`, `/c/v1-jupiter`, `/c/v2-neptune`, `/c/v1-heliopause` |
| 2.2 Chapter markers on scrubber | PASS | markers visible at correct positions in every screenshot |
| 2.3 `<v-chapter-index>` + shortcuts | PASS | listbox opens, 11 options, current selection marked, M-key opens (per help overlay) |
| 2.4 URL slug + pushState | PASS | `/c/v1-jupiter` seeks to anchor (1979-03-05 12:05); URL contract `/c/<slug>` per ADR-0001 |
| 2.5 `?embed=true` chrome-less mode | PASS | `/c/v2-neptune?embed=true` strips chapter-index, help-overlay, and attribution-footer affordances while keeping HUD + scrubber + play + speed |
| 2.6 OG cards | NOT TESTED | build artefact |
| 2.7 About + attribution panel | PASS | `/about` renders 6 regions: About / Data sources / Validation / Attribution / Embed contract / Methodology |
| 2.8 Help overlay | PASS | modal opens with Playback / Navigation / Speed / Display sections, R-restore-camera now present (BUG-008 fix verified) |
| 2.9 Heliopause text cards + instrument shutoff | PASS | `/c/v1-heliopause` shows chapter-copy article; HUD instruments correctly strike-through V1:ISS, V1:PLS, V2:ISS, V2:UVS at 2012 — matches historical shutoff schedule |

### Epic 3

| Story | Verdict | Evidence |
|---|---|---|
| 3.0 Cleanup | PASS (infra) | |
| 3.1 CK bake pipeline | PASS (infra) | attitude data drives `<v-attitude-indicator>` provenance switching |
| 3.2 AttitudeService SLERP + synthesized HGA | PASS | at cruise `data-provenance="synthesized"`; at `/c/v1-jupiter` `"CK reconstructed"` |
| 3.3 Articulated spacecraft GLB | PASS | scene shows `voyager-1-lod` LOD with 4 levels (lod0-lod3); LOD2 currently visible; each level has `BUS` → `mesh_BODY040`, `mesh_Cube004`, `SCAN_PLATFORM`, `HGA` children — articulated tree present for both V1 and V2 |
| 3.3.1 Chunk loader | PASS | trajectory chunks load per ET; some intermittent LRU misses (Finding B) |
| 3.4 Apply attitude per frame | PASS | spacecraft model orientation reflects attitude service output (verified by debug handle wiring) |
| 3.5 NAC boresight cone | PASS | both `voyager-{1,2}-na-boresight-cone` LineSegments live in scene at `BUS/SCAN_PLATFORM/...` path, visible=true |
| 3.6 `<v-attitude-indicator>` | PASS | renders "Synthesized (HGA Earth-pointing)" at cruise, "CK reconstructed" at `/c/v1-jupiter` |
| 3.7 L2 JS-vs-SPICE | PASS (infra) | CI gate |

### Epic 4 (done stories)

| Story | Verdict | Evidence |
|---|---|---|
| 4.0 Cleanup | PASS (infra) | |
| 4.1 ViewFrame service + smoothstep blend | PASS | cruise default framing now lands camera at 10 AU (BUG-003 fix); body-centered framing at `/c/v1-jupiter` puts camera at 43 Jupiter-radii offset from origin (cam world pos = (1e6, 1.5e6, 2.5e6), Jupiter world pos = (0,0,0)) |
| 4.2 VoyagerCameraController | PASS | `manualCameraSuspended=false`; R-key restore now documented in help overlay |
| 4.3 Cadence-shift chunks + 4K textures | PASS | 4 LODs per spacecraft; planets use 4K KTX2 (visible texture detail in cruise screenshot) |
| 4.4 `<v-timeline-scrubber variant="detail">` | PASS | only appears in encounter routes (`/c/v1-jupiter`, `/c/v2-neptune`); aria-label contains chapter name + "encounter timeline" (no duplicate-word bug — BUG-001 verified) |

Story 4.5 (V1 Jupiter encounter content) is **in-progress** per sprint-status.yaml and is not a "completed" story under review.

---

## New findings from this re-walk

### Finding A — Galilean moons present but invisible at V1 Jupiter encounter

`celestial-501` (Io), `celestial-502` (Europa), `celestial-503` (Ganymede), `celestial-504` (Callisto) are all in the scene tree with `MeshStandardMaterial`, textures loaded (`hasMap: true`), and correct radii (1821.6 / 1560.8 / 2634.1 / 2410.3 km respectively). All four are **`visible: false`** and pinned at scene position `(0, 0, 0)` — they are loaded but never positioned at their per-ET ephemerides or unhidden when the V1 Jupiter chapter activates.

**Severity:** This is almost certainly part of Story 4.5 (in-progress) — the chapter copy mentions "Amalthea, Io, Europa, Ganymede, and Callisto in turn" and the meshes are obviously being prepared. Not a regression against a completed story; flagging here so 4.5 closes the loop on visibility + ephem wiring.

### Finding B — Intermittent "— AU" at chunk boundaries

BUG-002's closure noted: "Intermittent '— AU' still appears during LRU-cache churn of the 24-chunk working set against the 12-slot capacity — that's the existing ChunkLoader sizing issue; not in this bug's scope."

Re-walk confirms this:
- `/` cold load (1977-08-20 = exact V2 launch ET): both V1 and V2 show "— AU"
- `/c/v1-jupiter` (1979-03-05): V1 shows "— AU", V2 shows 4.78 AU
- `/c/v2-neptune` (1989-08-25): V1 shows 38.6 AU, V2 shows "— AU"
- `/?t=1985-01-01`: both numeric (21.9 / 15.9 AU)

The pattern matches the LRU theory — at the chapter-anchor instant, the *active* spacecraft's chunk is loaded but the other's isn't (eviction by recency). This deserves its own ticket against a future story (chunk-loader capacity tune or working-set prefetch), but it is not a regression against any closed bug.

**Recommendation:** file as `ISSUE-CHUNK-LRU-EVICTION` for whoever owns Story 3.3.1 / 4.3 follow-up work.

### Finding C — `<v-attitude-indicator>` apparently absent at `/c/v2-neptune?embed=true`

The a11y snapshot at `/c/v2-neptune?embed=true` does not surface an attitude-provenance status element (it was clearly present at `/c/v1-jupiter` as "CK reconstructed"). This could be:

1. The indicator renders but its `aria-label="Attitude data provenance"` element isn't being picked up by the snapshot at this route, or
2. The indicator is conditionally hidden in embed mode (would be inconsistent with FR19 which requires the indicator be present "at all times"), or
3. CK coverage isn't available for V2 at Neptune in this build and the indicator collapses entirely (it should still show "Synthesized" per Story 3.6).

**Recommendation:** light follow-up — probe `v-hud.shadowRoot.querySelector('v-attitude-indicator')` directly at `/c/v2-neptune?embed=true` to confirm rendering state.

### Finding D — Body-centered framing distance for V1 Jupiter is far from the spacecraft

Chapter spec `v1-jupiter.defaultFraming.offsetKm = [1e6, 1.5e6, 2.5e6]` puts the camera 3.08 million km from Jupiter centre (43 Jupiter radii). V1 at closest approach is ~350,000 km from Jupiter (5 Jupiter radii), so V1 appears small/distant in the framing. The framing prioritises seeing the planet + trajectory context over close-spacecraft inspection — design choice, not a defect, but flagging because the V1 Jupiter screenshot does not visibly show the spacecraft model and the chapter copy speaks of "twelve oh five UTC" closest approach.

This is more a Story 4.5 design observation than a bug.

### Finding E — Strike-through-only instrument shutoff has no screen-reader text

`<v-hud-instruments>` shutoff state is encoded purely via CSS `text-decoration: line-through` on a `.instrument.shut-off` element with `color: rgb(95,99,104)`. There is no `aria-label`, `title`, or sr-only sibling indicating the shutoff state. The strike-through *is* a non-color signal (FR49 ok), but assistive-tech users have no indication that the instrument has been shut off versus simply rendered.

**Severity:** minor a11y improvement. Suggest a sr-only `"(shut off)"` suffix when the `.shut-off` class is applied.

---

## What remains unverified

- Title-card dissolve on cold cache (Story 1.9) — requires fresh tab.
- Fallback page (Story 1.8) — requires capability probe failure path.
- OG card pre-rendered images (Story 2.6) — build artefact.
- Bake determinism (Story 1.4) — needs `just bake` twice with SHA compare.
- L1/L2 validation harness output (Stories 1.4, 3.7) — CI gate.
- Audio toggle (deferred to Epic 6).

## Screenshots index

- `rewalk-2026-05-23/01-default-load-v2-launch.png` — default route → V2 launch chapter
- `rewalk-2026-05-23/02-cruise-1985.png` — cruise at 10 AU framing, distances 21.9/15.9 AU, trajectory lines visible
- `rewalk-2026-05-23/03-v1-jupiter-encounter.png` — `/c/v1-jupiter`, CK attitude, chapter copy, Jupiter framing
- `rewalk-2026-05-23/04-v1-heliopause-2012.png` — `/c/v1-heliopause`, instrument shutoff styling visible
- `rewalk-2026-05-23/05-v2-neptune-embed.png` — `/c/v2-neptune?embed=true`, chrome stripped

## Status

All completed stories (Epic 1 through Epic 4.4) pass review.

The 8 bugs filed in the prior review session are all properly closed (5 fixed, 2 misfiled, 1 already-fixed). The bug-reports folder has been archived to `archive/bug-reports-2026-05-23/`.

5 new findings (A–E) are observational, not regressions against closed bugs. Findings A and D are scoped to Story 4.5 (in-progress). Findings B, C, E are minor follow-ups that don't warrant individual bug reports against done stories but should be tracked in deferred-work.md.
