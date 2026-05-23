---
review_date: 2026-05-23
reviewer: claude (opus 4.7)
total_bugs_filed: 8
---

# Bug Reports — 2026-05-23 completed-story walkthrough

Eight defects filed during a walkthrough of every story marked `done` in `sprint-status.yaml` (Epic 1 → Epic 4.4). See `REVIEW-WALKTHROUGH.md` for the per-story verification log.

## By severity

### Critical (2)

| ID | Title | Stories affected |
|---|---|---|
| [BUG-003](BUG-003-camera-stuck-at-sun-origin-during-cruise.md) | Camera stuck at heliocentric origin during cruise — solar system not visible | 4.1, 1.12, 1.13, 3.3, 3.4, 3.5 (blocked downstream) |
| [BUG-005](BUG-005-chapter-slug-url-does-not-seek-clock.md) | Chapter-slug URL doesn't seek simulation clock on cold load | 2.4, 2.1 (FSM never enters states), 2.9, 4.1 |

### High (1)

| ID | Title | Stories affected |
|---|---|---|
| [BUG-002](BUG-002-hud-distance-permanently-em-dash-au.md) | HUD distance permanently "— AU" for V1 and V2 | 1.11 (FR34) |

### Medium (3)

| ID | Title | Stories affected |
|---|---|---|
| [BUG-001](BUG-001-detail-scrubber-aria-label-duplicate-word.md) | Detail scrubber aria-label "Encounter encounter timeline" (duplicate word) | 4.4 |
| [BUG-004](BUG-004-speed-slider-aria-valuetext-mojibake.md) | Speed-slider `aria-valuetext` mojibake (`"1Ã â 1 sec/sec"`) | 1.10 |
| [BUG-006](BUG-006-hud-chapter-title-empty-during-chapter.md) | HUD chapter-title element empty on chapter routes | 1.11, 2.1 |

### Low (2)

| ID | Title | Stories affected |
|---|---|---|
| [BUG-007](BUG-007-embed-doc-url-format-inconsistent.md) | About page documents `/c/<slug>?embed=true` but contract is `/<slug>?embed=true` | 2.7 |
| [BUG-008](BUG-008-restore-default-camera-shortcut-not-in-help-overlay.md) | Help overlay missing restore-default-camera shortcut | 2.8 (4.2) |

## Recommended fix order

1. **BUG-003** — unblocks visual verification of half the project; everything downstream of "user sees the spacecraft" hangs on this.
2. **BUG-005** — restores the URL-contract surface; required for OG cards, embeds, and curator workflows.
3. **BUG-002** — single missing HUD readout; one of the four headline values is wrong.
4. **BUG-006** — likely resolves itself once BUG-005 and the ChapterDirector FSM start entering states.
5. **BUG-001**, **BUG-004** — copy / encoding hygiene.
6. **BUG-007**, **BUG-008** — documentation patches; trivial.

## Method

- Dev server already running at `http://localhost:5173` (PID 17052).
- Tested via Chrome DevTools MCP (navigation, screenshots, a11y snapshots, live `__voyagerDebug` evaluation).
- Each completed story's epic-level AC read from `_bmad-output/planning-artifacts/epics.md`.
- Visual stories sampled at three timestamps: mission start, mid-cruise (1980-01-01), and a chapter slug (`/v1-jupiter`).
- Per-story file under `_bmad-output/implementation-artifacts/N-X-*.md` was NOT individually read for every story — the epic-level AC and live-app behaviour were the verification basis. Recommend a follow-up pass cross-referencing each per-story file's "Acceptance Criteria Verification" section against the bugs filed here.

## Out-of-scope / not verified in this pass

- First-paint title-card dissolve (Story 1.9) — would require a fresh tab on cold cache.
- Fallback page (Story 1.8) — would require simulating WebGL2/WASM/Brotli absence.
- Embed mode (Story 2.5) — not exercised.
- OG card images (Story 2.6) — build artefact.
- Audio toggle (deferred to Epic 6).
- L1/L2 validation harness behaviour (build-time, CI).
- Bake determinism / SHA pinning.
- 8K texture upgrade path (Story 4.3 — not exercised because BUG-003 hides bodies).
