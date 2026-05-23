# Story 4.10: Bug Fixes from 2026-05-23 Manual Review

**Epic:** 4 — Encounter Chapters (All Six Gas-Giant Flybys)
**Status:** review
**Date created:** 2026-05-23

## User Story

As the project maintainer,
I want the 8 bugs filed during the 2026-05-23 manual walkthrough triaged + fixed (or formally dismissed where Epic 4 work already addressed them),
So that the eight defect reports are closed before Epic 4 retrospective and the user-facing surface ships clean.

## Consumed-by

- **Epic 4 retrospective**: this story's closure is a prerequisite for the retrospective.
- **Epic 7 friendly-user testing**: the fixes here improve the surface that friendly users will exercise.

This story does NOT introduce new services. It's a defect-fix sweep across Epic 1 / Epic 2 / Epic 4 code (per the bug reports' `related_story` metadata).

## Bug-report inputs

All 8 reports under `_bmad-output/implementation-artifacts/bug-reports-2026-05-23/`:

- BUG-001 (M) — detail scrubber aria-label duplicate "encounter encounter"
- BUG-002 (H) — HUD distance permanently "— AU" for V1 + V2
- BUG-003 (C) — camera stuck at Sun origin during cruise (no chapter active)
- BUG-004 (M) — speed-slider aria-valuetext UTF-8 mojibake
- BUG-005 (C) — chapter-slug URL doesn't seek clock (no `/c/` prefix variant)
- BUG-006 (M) — HUD chapter title `<v-hud-chapter-title>` empty during chapter
- BUG-007 (L) — About page documents `/c/<slug>?embed=true` (verify vs router contract)
- BUG-008 (L) — help overlay missing R-key restore-default-camera shortcut

## Acceptance Criteria

### AC1 — Triage each bug; mark already-fixed / still-active per current `main` branch (post-Story-4.8)

For each of BUG-001 through BUG-008, the dev:
1. Verifies the bug's current state against the running app (dev server at http://localhost:5173).
2. Marks one of:
   - **STILL_ACTIVE** — bug reproduces; fix required this story.
   - **ALREADY_FIXED** — bug does not reproduce; Epic 4 work landed the fix. Document in Dev Agent Record which story closed it.
   - **MISFILED** — the bug report's premise was wrong; document why. (Example: BUG-005 + BUG-007 may have a URL-prefix confusion — both can't be right; the dev determines which interpretation matches the router contract.)

### AC2 — Fix each STILL_ACTIVE bug with minimal-change discipline

For each STILL_ACTIVE bug, the dev produces:
1. The minimal code change that closes the bug (single-file ideal; cross-file only when the bug genuinely requires it).
2. A defense test added at the unit-test tier that fails BEFORE the fix and passes AFTER. The test must be specific enough that a future regression of the exact bug fails this test, not a generic "did the feature break."
3. A one-line entry in `_bmad-output/implementation-artifacts/deferred-work.md` (or wherever the project tracks defect closure) noting the bug ID, fix commit, and defense-test location.

### AC3 — Bug-by-bug expected fix locations (dev's starting points; revise after triage)

- **BUG-001** (aria-label dup): `web/src/components/v-timeline-scrubber.ts` — label-composition for the detail variant. (Likely fixed by Story 4.4 — verify and mark accordingly.)
- **BUG-002** (HUD distance — AU): `web/src/components/v-hud-distance.ts` — wire to `EphemerisService.getPosition(bodyId, et)` and `length()`. Position data is confirmed available; HUD subscriber is missing.
- **BUG-003** (cruise camera origin): `web/src/render/voyager-camera-controller.ts` — fallback when `chapter.defaultFraming` is null AND no chapter is active. Story 4.5 added defaultFraming for encounters; cruise needs a default heliocentric framing too. Either: (a) add cruise/launch chapter `defaultFraming`, or (b) the controller has a hardcoded heliocentric fallback when no chapter is active. Dev's call.
- **BUG-004** (mojibake): `web/src/components/v-speed-multiplier.ts` — value formatter feeding aria-valuetext. Likely encoding double-conversion (`×` U+00D7 → "Ã —", `—` U+2014 → "â "). Use JS-string literals directly; avoid byte-conversion paths.
- **BUG-005** (URL clock seek): `UrlRouter` / `UrlSync` — Story 2.4's slug→ET resolution. Verify which URL contract is canonical (`/c/<slug>` per existing About page docs + my Epic 4 smoke evidence, OR `/<slug>` per the bug report's premise). If `/c/<slug>` is canonical AND `/<slug>` should be unsupported, this is MISFILED. If `/<slug>` is canonical and the cold-load clock seek is missing, fix the router.
- **BUG-006** (HUD chapter title empty): `web/src/components/v-hud-chapter-title.ts` — subscribe to ChapterDirector's activeChapter transitions and render chapter.name. The `<v-chapter-copy>` component does this for chapter copy; mirror the pattern for the HUD title.
- **BUG-007** (About docs URL format): cross-reference with BUG-005 triage. Likely the About page is correct (uses `/c/<slug>?embed=true`, matching the canonical router contract). Mark MISFILED if so. If the About page IS wrong, update it.
- **BUG-008** (help overlay R-key): `web/src/components/v-help-overlay.ts` — add the R-key restore-default-camera entry to the Display or Navigation section.

### AC4 — Integration AC (Rule 1): cross-bug regression test

- `web/tests/bug-fix-batch-2026-05-23-defense.test.ts` — single defense file with one describe block per bug. Each describe contains the bug-specific defense test added at AC2. The file's existence pins the closure batch — a future Story 5+ work that re-introduces any of these bugs fails this single file.

### AC5 — Lead-driven Chrome DevTools MCP smoke for visible-surface bugs

The lead drives a smoke validating the user-visible fixes:
1. Navigate to `/c/v1-jupiter` — verify the `<v-hud-chapter-title>` renders "Voyager 1 — Jupiter" (BUG-006), aria-label on detail scrubber is "Voyager 1 — Jupiter encounter timeline" not duplicate (BUG-001), HUD distance shows numeric AU for both spacecraft (BUG-002), speed-slider aria-valuetext is clean Unicode (BUG-004).
2. Navigate to `/?t=1980-01-01T00:00:00Z` — verify cruise camera is at a heliocentric vantage showing the inner solar system (BUG-003).
3. Open help overlay via `?` key — verify R-key restore-camera entry is present (BUG-008).
4. If `/<slug>` was deemed canonical (per AC3 BUG-005 triage), verify cold-load `/v1-jupiter` seeks to V1J anchor; otherwise verify the contract clarification.

Smoke evidence captured under `_bmad-output/implementation-artifacts/4-10-smoke-evidence/`.

### AC6 — Test sweep + lint baseline preserved

- **GIVEN** post-Story-4.8 baseline (web vitest 3063 / 10 skipped / 171 files)
- **WHEN** Story 4.10 ships
- **THEN** vitest count rises by ~5-12 new defense tests (one per active bug × ≥ 1 defense test); typecheck clean; lint baseline preserved (≤ 4 warnings; 0 new)

### AC7 — Bug-report files annotated with closure references

For each bug:
- Append a `## Closure (2026-05-23)` section to the bug report file documenting: status (FIXED / ALREADY_FIXED / MISFILED), fix commit hash, defense test path.
- This makes the bug-report folder a self-contained audit trail.

## Out of Scope (Defer)

- Bugs that surface a story-level scope question (e.g., "is the cruise default framing supposed to be heliocentric or a chapter-driven default?") — flag as Rule 5 candidates for the lead's review during AC5 smoke; defer the policy decision to the lead.
- Visual / chrome refinements beyond the bug-report scope.
- Other unrelated regressions surfaced during the bug-fix work — file separately.

## Tasks / Subtasks

- [x] **T1: Triage all 8 bugs** (AC1)
  - [x] T1.1: Reproduce each bug against current `main` (post-Story-4.8). For each, document status: STILL_ACTIVE / ALREADY_FIXED / MISFILED.

- [x] **T2: BUG-005 + BUG-007 URL-contract clarification** (AC1, AC3)
  - [x] T2.1: Read Story 2.4 spec + UrlRouter / UrlSync code to determine the canonical URL contract (`/c/<slug>` vs `/<slug>`).
  - [x] T2.2: Document the contract in Dev Agent Record. One of BUG-005 / BUG-007 will be misfiled (the URL contract is one or the other). Result: BOTH MISFILED — contract is `/c/<slug>`.

- [x] **T3: Fix STILL_ACTIVE bugs** (AC2)
  - [x] T3.1: BUG-002 (HUD distance) — wire `<v-hud-distance>` to EphemerisService (per-tick identity-gated propagation).
  - [x] T3.2: BUG-003 (cruise camera) — fallback heliocentric framing via main.ts cold-load branch.
  - [x] T3.3: BUG-004 (mojibake) — ALREADY_FIXED; no code change; defense test pins clean Unicode.
  - [x] T3.4: BUG-006 (HUD title) — wire `<v-hud-chapter-title>` to ChapterDirector via subscription pattern.
  - [x] T3.5: BUG-008 (help overlay) — added R-key entry under Display section.
  - [x] T3.6: BUG-001 — ALREADY_FIXED in production; latent fallback hardened.
  - [x] T3.7: BUG-005/BUG-007 — both MISFILED; no code change.

- [x] **T4: Defense tests + integration test file** (AC2, AC4)
  - [x] T4.1: One defense test per STILL_ACTIVE bug.
  - [x] T4.2: Consolidated file `web/tests/bug-fix-batch-2026-05-23-defense.test.ts` (12 tests).

- [x] **T5: Bug-report closure annotations** (AC7)

- [x] **T6: Final sweep + lint baseline** (AC6) — 172 files / 3075 tests / 8 skipped; lint 0 errors / 4 pre-existing warnings; typecheck clean.

## Dev Notes

### Triage discipline

Before fixing, the dev MUST verify the bug reproduces against the current `main` branch. Several bugs may have been incidentally fixed by Epic 4 work:

- **BUG-001** — my Epic 4 Story 4.4 smoke evidence showed `aria-label="Voyager 1 — Jupiter encounter timeline"` (no duplicate "encounter"). Likely ALREADY_FIXED.
- **BUG-005** — my Epic 4 Stories 4.5/4.6/4.7 smokes used `/c/<slug>` and clock seek worked (HUD date updated to the chapter's anchor). If the canonical URL contract is `/c/<slug>` (likely, per ADR-0001 + existing About page docs per BUG-007 evidence), BUG-005 (testing `/<slug>` without prefix) is MISFILED.
- **BUG-007** — depends on BUG-005 triage. If contract is `/c/<slug>`, the About page is CORRECT, and BUG-007 is MISFILED.

Document the misfilings in Dev Agent Record with the verification evidence.

### Code-quality discipline

Each fix should be minimal-change. Avoid drive-by refactors. If a fix surfaces a deeper design question (e.g., "should cruise framing be a chapter default or controller fallback?"), flag as a Rule 5 candidate but pick the simplest path that closes the bug for this story.

### NFR / ADR compliance pointers

- **ADR-0001** (URL contract): governs BUG-005 / BUG-007 triage. Don't break the URL contract.
- **FR34** (HUD distance + chapter title): BUG-002 + BUG-006 close FR34.
- **FR31** (cruise default framing): BUG-003 closes this for non-encounter timestamps.
- **FR33** (R-key restore): BUG-008's help-overlay entry makes FR33 discoverable.
- **Rule 10** (Lit declare+ctor): if BUG-002 / BUG-006 add reactive properties to HUD components, use `declare` + ctor-body. Canonical citation: `web/src/components/v-chapter-index.ts:235-262`.

## Smoke probe plan (AC5) — for the lead's Chrome DevTools MCP

**Probe 1 — `/c/v1-jupiter` user-facing surface (BUG-001, BUG-002, BUG-006, BUG-004)**:

```js
const dbg = window.__voyagerDebug;
const detailEl = document.querySelector('v-timeline-scrubber[variant="detail"]');
const detailLabel = detailEl?.shadowRoot?.querySelector('[role="slider"]')?.getAttribute('aria-label');
const hudTitle = document.querySelector('v-hud-chapter-title')?.shadowRoot?.querySelector('h2')?.textContent ?? null;
const hudDistanceRows = Array.from(document.querySelectorAll('v-hud-distance .value')).map((el) => el.textContent);
const speedSlider = document.querySelector('v-speed-multiplier')?.shadowRoot?.querySelector('[role="slider"]')?.getAttribute('aria-valuetext');
return { detailLabel, hudTitle, hudDistanceRows, speedSlider };
```

Expected (per AC5):
- `detailLabel === "Voyager 1 — Jupiter encounter timeline"` (no duplicate)
- `hudTitle === "Voyager 1 — Jupiter"` (NOT empty)
- `hudDistanceRows` includes numeric AU values like `"5.2 AU"` (NOT `"— AU"`)
- `speedSlider` is clean Unicode like `"1× — 1 sec/sec"` (NOT mojibake)

**Probe 2 — `/?t=1980-01-01T00:00:00Z` cruise framing (BUG-003)**:

```js
const camera = window.__voyagerDebug.renderEngine.camera;
const camMagnitude = Math.hypot(camera.position.x, camera.position.y, camera.position.z);
return { camPos: camera.position, camMagnitude };
```

Expected: `camMagnitude > 0` (not at origin); typical heliocentric vantage like 10 AU = 1.5e9 km. The exact value depends on the dev's chosen fallback framing.

**Probe 3 — Help overlay R-key entry (BUG-008)**:

```js
// Open help overlay (simulate "?" key) — or click the "Open keyboard shortcuts help" button
document.querySelector('button[aria-label="Open keyboard shortcuts help"]')?.click();
await new Promise((r) => setTimeout(r, 500));
const overlayText = document.querySelector('v-help-overlay')?.textContent ?? '';
return { hasRKey: /\bR\b/.test(overlayText) && /restore/i.test(overlayText) };
```

Expected: `hasRKey === true`.

**Probe 4 (conditional)** — URL contract verification per BUG-005 / BUG-007 triage: navigate to whatever the dev's triage determined IS the canonical URL contract; verify cold-load behavior matches.

## References

- Bug reports: `_bmad-output/implementation-artifacts/bug-reports-2026-05-23/BUG-{001..008}-*.md`
- Index: `_bmad-output/implementation-artifacts/bug-reports-2026-05-23/INDEX.md`
- ADR-0001 (URL contract): `docs/adr/0001-*.md`
- Stories that introduced affected components: per each bug's `related_story` frontmatter.

## Dev Agent Record

### Agent Model Used

claude opus 4.7 (1M context) — dev-4-10 spawn under `/epic-cycle` 2026-05-23.

### Debug Log References

- Live Chrome DevTools MCP smoke at `/c/v1-jupiter` and `/?t=1980-01-01T00:00:00Z`
  for triage + post-fix verification.
- Defense test file: `web/tests/bug-fix-batch-2026-05-23-defense.test.ts` (12 tests).
- Full vitest sweep: 172 files / 3075 tests / 8 skipped (baseline was 171 / 3063 / 10);
  net +1 file (defense), +12 tests (defense), -2 skipped (incidental).
- Lint: 0 errors / 4 warnings (all pre-existing `Unused eslint-disable` warnings,
  matches AC6 baseline).
- Typecheck: clean.

### Completion Notes List

**Triage outcomes (AC1):**

| Bug | Status | Notes |
| --- | --- | --- |
| BUG-001 | ALREADY_FIXED (latent fallback hardened) | Production label correct ("Voyager 1 — Jupiter encounter timeline"); fallback `'Encounter'` composed to "Encounter encounter timeline" — fixed to "Encounter timeline" |
| BUG-002 | STILL_ACTIVE → FIXED | Wire-up fix in `<v-hud>.tick(et)` (per-tick identity-gated propagation) |
| BUG-003 | STILL_ACTIVE → FIXED | `main.ts` cold-load replay extended with cruise branch (Option B) |
| BUG-004 | ALREADY_FIXED | Mojibake gone in current `main`; verified clean U+00D7 / U+2014 |
| BUG-005 | MISFILED | URL contract IS `/c/<slug>` per `docs/url-contract.md` + ADR-0001 |
| BUG-006 | STILL_ACTIVE → FIXED | `<v-hud-chapter-title>` rewritten with director subscription (mirrors `<v-chapter-copy>` pattern) |
| BUG-007 | MISFILED | About page documents canonical `/c/<slug>?embed=true` correctly |
| BUG-008 | STILL_ACTIVE → FIXED | Added R-key entry to help overlay Display section |

**Decisions:**

- **BUG-003**: Picked Option B (controller fallback) over Option A (declarative
  `defaultFraming` on cruise spec) per Rule 5 — Option B is a 4-line `main.ts`
  branch; Option A would require chapter-spec type changes + the
  `chapter-default-framing.ts` resolver + every cruise/launch spec. Same camera
  position either way; B is the smaller change.
- **BUG-001**: Hardened the latent `'Encounter'` fallback to `'Encounter timeline'`
  rather than leave it as dead code. The fallback path is unreachable in
  production (detail scrubber only mounts during encounter chapters), but the
  screen-reader hygiene cost was negligible and a test forces the
  no-active-chapter branch explicitly.
- **BUG-002 (LRU thrash)**: V1 distance now reads numeric AU when its chunk is
  cached but flips back to "— AU" intermittently during LRU eviction of the
  ~24-chunk working set against the 12-slot capacity. This is the existing
  ChunkLoader sizing limit, NOT a wire-up bug, and is OUT OF SCOPE for the
  story per the bug's narrow "permanently — AU" wording. Deferred-work
  candidate for a future story to size the LRU to the encounter scene's
  working-set.

**Issues Encountered:**

- None blocking. Found that `firstPaintHandle.hud.chapterDirector` was a new
  field needing wiring through `first-paint.ts` (analogous to existing
  `ephemerisService` / `attitudeService` wiring); added during the BUG-006 fix.

### File List

**Modified:**

- `web/src/main.ts` — BUG-003 cold-load replay cruise branch.
- `web/src/components/v-hud.ts` — BUG-002 + BUG-006 per-tick propagation of
  `ephemerisService` / `clockManager` / `chapterDirector` to sub-components.
- `web/src/components/v-hud-chapter-title.ts` — BUG-006 director subscription
  rewrite (stub → live wiring).
- `web/src/components/v-help-overlay.ts` — BUG-008 R-key entry in Display
  section.
- `web/src/components/v-timeline-scrubber.ts` — BUG-001 latent fallback
  hardening (`'Encounter'` → `'Encounter timeline'`).
- `web/src/boot/first-paint.ts` — BUG-006 wire `chapterDirector` to HUD.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — register
  `4-10-bug-fixes-from-2026-05-23-review: review`.
- All 8 bug-report markdown files under
  `_bmad-output/implementation-artifacts/bug-reports-2026-05-23/` — closure
  annotations.

**Added:**

- `web/tests/bug-fix-batch-2026-05-23-defense.test.ts` — single defense file
  per AC4, one describe block per bug (12 tests total).
