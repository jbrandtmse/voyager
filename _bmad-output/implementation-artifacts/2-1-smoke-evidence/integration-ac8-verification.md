# Story 2.1 — Integration AC8 Verification (Chrome DevTools MCP)

**Date:** 2026-05-20
**Method:** Lead-executed Chrome DevTools MCP smoke against the dev server (`http://localhost:5174/`)
**Verifier:** team-lead@epic-cycle-2026-05-20
**ADR governance:** ADR-0010 Layer 1 (Lead-executed verifications), ADR-0001 (frozen URL chapter-ID contract)

## Acceptance Criteria Verified

### AC8 — ChapterDirector ↔ ClockManager wire-up

**Test sequence (executed via `mcp__chrome-devtools-mcp__evaluate_script` against the live dev server):**

| # | ET probe | Expected activeChapter slug | Observed activeChapter slug | Result |
|---|---|---|---|---|
| 1 | Boot (ClockManager.simTimeEt = MISSION_START_ET = V2 launch 1977-08-20) | `launch-v2` | `launch-v2` | ✓ PASS |
| 2 | V1 Jupiter ET (anchorEt ≈ -657115500) | `v1-jupiter` | `v1-jupiter` | ✓ PASS |
| 3 | Between-chapter (1995-01-01) | `null` | `null` | ✓ PASS |
| 4 | V2 Neptune ET (1989-08-25 03:56 UTC) | `v2-neptune` | `v2-neptune` | ✓ PASS |

**Wire-up topology confirmed:**

```
ClockManager.simTimeEt  →  RenderEngine.onFrame((et) => chapterDirector.update(et))
                       →  ChapterDirector internal Map<slug, ChapterState>
                       →  activeChapter getter returns the held chapter (or null)
```

The boot-time observation (test #1) is the load-bearing evidence: ClockManager initialises `simTimeEt = MISSION_START_ET` (V2 launch), the HUD `<v-hud-date>` renders "1977-08-20 00:00 UT", and `__voyagerDebug.chapterDirector.activeChapter.slug === 'launch-v2'` — three independent observations of the same wire-up converging.

## Debug Surface Verified

```js
window.__voyagerDebug.chapterDirector instanceof ChapterDirector  // true
typeof __voyagerDebug.chapterDirector.update         === 'function'  // true
typeof __voyagerDebug.chapterDirector.subscribe      === 'function'  // true
typeof __voyagerDebug.chapterDirector.getState       === 'function'  // true
'activeChapter' in Object.getPrototypeOf(__voyagerDebug.chapterDirector)  // true (getter)
```

DEV-only exposure: confirmed gated by `if (import.meta.env.DEV)` per AC1 (qa-2-1 static wire-up test `main-chapter-director-wireup.test.ts`).

## Console Cleanliness

```
[debug] [vite] connecting...
[debug] [vite] connected.
[warn] preload font ... Inter (not used within a few seconds of load)
[warn] preload font ... Source Serif (likewise)
[warn] preload font ... JetBrains Mono (likewise)
```

No errors. Three font-preload warnings are pre-existing baseline (visible in Story 2.0 smoke too) — they are diagnostic, not failure indicators, and reflect that the chrome-driven session loaded the page faster than the fonts. Not a Story 2.1 regression.

## ADR-0001 Compliance

The lead independently re-read `docs/adr/0001-url-contract-as-public-api.md` line 24 — the frozen chapter ID list is:

> `launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`

The asymmetric naming convention (`launch-<spacecraft>` for launches, `<spacecraft>-<body>` for encounters, `<spacecraft>-heliopause` for heliopauses, single `pale-blue-dot` for PBD) is the canonical contract. All 11 implemented slugs match this contract. cr-2-1's HIGH-severity finding (originally only `v1-launch`/`v2-launch` were wrong; fixed) was the only ADR-0001 violation. The encounter slugs `v1-jupiter` / `v2-saturn` / etc. that initially appeared inconsistent are in fact ADR-compliant.

## Evidence

- Screenshot: `story-2-1-integration-ac8-boot.png` (this directory) — page viewport at boot showing HUD with "1977-08-20 00:00" and the canvas rendering.
- This document: machine-readable summary of the verification.

## Verdict

**PASS.** Integration AC8 satisfied: ChapterDirector reads ClockManager.simTimeEt via the per-frame `engine.onFrame` callback; activeChapter tracks ET changes correctly across forward-traversal (boot → V1 Jupiter → between → V2 Neptune); chapter slugs match ADR-0001's frozen contract; DEV debug surface is correctly gated.

ViewframeService leg of Epic 2 R1 mitigation remains forward-deferred to Story 4.1 per the story file.
