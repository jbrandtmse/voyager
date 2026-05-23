# Story 4.1 — Chrome DevTools MCP smoke evidence (lead-driven, Rule 3 gate)

**Date:** 2026-05-23
**Lead:** model claude-opus-4-7
**Dev server:** `npm run dev` (port 5174, port 5173 occupied by a stale process).

## Probes executed

### Probe 1 — V2 Saturn chapter (`/c/v2-saturn`)

- `__voyagerDebug` keys present (13 of 13 expected): `chapterDirector`, `scrubber`, `chapterIndex`, `helpOverlay`, `chapterCopy`, `urlRouter`, `urlSync`, `embedMode`, `spacecraftModels`, `attitudeService`, `attitudeApplier`, `boresightRenderer`, **`viewFrame`** (new — AC2 publication confirmed).
- `chapterDirector.activeChapter`: `{ slug: "v2-saturn", spacecraft: "v2", targetBody: 6 }` — AC5 confirms targetBody = 6 (Saturn barycenter NAIF) populated correctly.
- `viewFrame.getTransform(activeChapter.anchorEt, activeChapter).originOffsetWorld` magnitude: **1,435,067,330 km** (Saturn heliocentric distance at the V2 Saturn anchor; AC1 full body-centered shift at alpha=1).
- `<v-attitude-indicator>`: `activeSpacecraftId = -32` (V2), `data-provenance = "ck"`, output text = `"ATT ● CK reconstructed"`. **AC6 verified — Epic 3 retro Action #3 closure confirmed.**
- Screenshot: `mcp-v2-saturn-fullpage.png`.

### Probe 2 — V1 Jupiter chapter (`/c/v1-jupiter`)

- `chapterDirector.activeChapter.slug`: `"v1-jupiter"`.
- `viewFrame.getTransform(...).originOffsetWorld` magnitude: **790,478,942 km** (Jupiter heliocentric distance at the V1 Jupiter anchor).
- `<v-attitude-indicator>`: `activeSpacecraftId = -31` (V1), `data-provenance = "ck"`, output text = `"ATT ● CK reconstructed"`.
- Console: zero error messages, zero warn messages (not even the Lit dev-mode banner — Vite HMR served the latest module set cleanly).
- Screenshot: `mcp-v1-jupiter-fullpage.png`.

### Probe 3 — Cruise probe (between encounter windows, ET ≈ 2023)

- `viewFrame.getTransform(1700000000, null).originOffsetWorld` magnitude: **0 km** (AC1 identity-transform branch verified — cruise returns no shift).

## HIGH defect surfaced + auto-resolved inline during the smoke (Rule 3 fix-before-commit)

**Defect:** AC6's `setActiveSpacecraft(naifId)` call in `main.ts:245` no-opped at boot. The `chapterDirector.subscribe(...)` callback was registered before the synchronous `chapterDirector.update(clockManager.simTimeEt)` cold-load seed at line 259 (per QA's `main-ts-boot-ordering-defense.test.ts` source-grep pin), and the cold-load seed DID fire the `held` event for V2 Saturn — but `firstPaintHandle.hud.attitudeIndicator` was still `null` at that moment because `<v-hud>`'s first Lit render runs microtask-async after `connectedCallback`. The optional-chain `?.setActiveSpacecraft` silently no-opped. Initial probe at `/c/v2-saturn` showed `activeSpacecraftId = -31` (V1 stub default) — exactly the Story 4.0 smoke gap AC6 was supposed to close.

**Diagnosis evidence (captured during smoke):**

```json
{
  "indicator_present": true,
  "indicator_activeSpacecraftId": -31,    // ← BUG: should be -32 on /c/v2-saturn
  "has_setActiveSpacecraft_fn": true,
  "chapter_director_active": "v2-saturn",
  "chapter_director_active_spacecraft": "v2",
  // Manual call confirms the indicator + setter both work:
  "after_manual_setActiveSpacecraft_minus32": {
    "activeSpacecraftId": -32,
    "output_text": "ATT ● CK reconstructed"
  }
}
```

**Fix:** added a post-Lit-render replay block in `main.ts` immediately after the existing cold-load seed:

```ts
let lastHeldNaifId: -31 | -32 | null = null;
chapterDirector.subscribe((event) => {
  if (event.to !== 'held') return;
  const naifId = naifIdForSpacecraft(event.chapter.spacecraft);
  lastHeldNaifId = naifId;
  firstPaintHandle.hud.attitudeIndicator?.setActiveSpacecraft(naifId);
});

chapterDirector.update(clockManager.simTimeEt);

void firstPaintHandle.hud.updateComplete?.then(() => {
  const naifId =
    lastHeldNaifId ??
    (chapterDirector.activeChapter
      ? naifIdForSpacecraft(chapterDirector.activeChapter.spacecraft)
      : null);
  if (naifId !== null) {
    firstPaintHandle.hud.attitudeIndicator?.setActiveSpacecraft(naifId);
  }
});
```

**Defense tests added** to `web/tests/chapter-director-attitude-indicator-wire.test.ts` (2 new source-grep pins inside the existing AC6 wire-up test suite):

- `records the last held naifId in a closure so a post-Lit replay can fire it` — pins `let lastHeldNaifId` + `lastHeldNaifId = naifId` assignment.
- `replays setActiveSpacecraft inside firstPaintHandle.hud.updateComplete.then(...) after Lit's first render` — pins the `updateComplete?.then(` call + the `chapterDirector.activeChapter` fallback.

**Post-fix verification:** reloaded `/c/v2-saturn` → `activeSpacecraftId = -32`, output `"ATT ● CK reconstructed"`, `data-provenance = "ck"`. AC6 closure now verified end-to-end in browser.

Per Rule 3 ("Failed smoke is a HIGH-severity finding that must clear before commit — never deferrable"), this fix lands in the same Story 4.1 commit as the original work.

## Test sweep verification

- `web/tests/chapter-director-attitude-indicator-wire.test.ts` (the AC6 test file with the 2 new defense pins): **15/15 pass** (was 13/13 pre-fix; the 2 new pins both green).
- Full web vitest run: 2480 / 2 skipped / 139 files. One flaky failure in `tests/clock-multiplier-defense.test.ts > Story 1.10 defense — mission-scrub perf harness` — `maxTickMs` observed 60.49ms vs the 50ms threshold; re-ran in isolation: **36/36 pass**. Confirmed background-load flake (dev server + chrome running in parallel inflated the timing); NOT a Story 4.1 regression. Flagged for Story 7.x perf-hardening (test should either widen the threshold or read the env-load and adjust — already in scope per the pre-existing Story 7.x CI-hardening deferral pattern from Story 4.0's `[3.7 / MED]` routing).

Typecheck clean. Lint baseline preserved (4 warnings; 0 new).

## Smoke verdict

**PASS** for all Story 4.1 ACs verified end-to-end:

- AC1 + AC2 + AC5: ViewFrame returns correct body-centered offset at V2 Saturn (Saturn-magnitude ~1.43B km) and V1 Jupiter (Jupiter-magnitude ~790M km); cruise identity verified.
- AC3: ViewFrameTransform has no quaternion field (verified via code review's `Object.keys` runtime test).
- AC6: indicator paints the correct spacecraft on cold-load arrival at chapter pages (closes Epic 3 retro Action #3 + Story 4.0 smoke gap).
- AC7: real-stack integration test exercises 5 ET probes including the entering ramp.
- AC8: this lead-driven MCP smoke evidence.
- AC9: typecheck clean, lint baseline preserved.

## Files

- `mcp-v1-jupiter-fullpage.png` — V1 Jupiter chapter (V1 active spacecraft + indicator CK reconstructed).
- `mcp-v2-saturn-fullpage.png` — V2 Saturn chapter (V2 active spacecraft + indicator CK reconstructed, post-fix).
- `mcp-smoke-summary.md` — this file.
