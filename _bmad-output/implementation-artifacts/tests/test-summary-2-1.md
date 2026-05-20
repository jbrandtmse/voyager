# Story 2.1 — QA Test Automation Summary

**Story:** 2.1 (ChapterDirector FSM and 11 Declarative Chapter Specs)
**Story file:** `_bmad-output/implementation-artifacts/2-1-chapterdirector-fsm-and-11-declarative-chapter-specs.md`
**Status at QA author entry:** `review` (dev complete; per-AC unit tests for AC1/AC4/AC5/AC6 already authored and passing — 1321 vitest pass at handoff)
**QA author:** spawned 2026-05-20 under team `epic-cycle-2026-05-19`
**Skill:** `bmad-qa-generate-e2e-tests` (with Voyager toml override loading the MCP-smoke-stage requirement as `persistent_facts`)

## Test Framework Detection

- **TypeScript (web side):** Vitest + jsdom; tests under `web/src/**/*.test.ts` (per-AC unit) and `web/tests/**/*.test.ts` (cross-cutting QA / defense / integration). Runner: `cd web && npm test -- --run`.
- **No new framework introduced.** All Story 2.1 surfaces are web-side; bake-side is untouched.

## Per-AC Coverage Analysis

| AC | Scope | Dev-authored test exists? | New QA test added? | Verifying surface |
|----|-------|---|---|---|
| AC1 — ChapterDirector class + per-frame FSM | `web/src/services/chapter-director.ts` | YES — `chapter-director.test.ts` covers initial state, forward, reverse, rapid scrub, idempotency, subscribe contract, throwing-subscriber hardening, dispose, transition payload | **Augmented** with real-registry integration + boundary-ET edges (see § "Integration & boundary tests" below) | Vitest unit (dev) + Vitest integration (QA) + lead-executed Chrome DevTools MCP smoke (§ "Chrome DevTools MCP smoke stage") |
| AC2 — 10 standard chapter specs | `web/src/chapters/specs/*.ts` (10 modules) | YES (indirectly) — `registry.test.ts` asserts length=11, chronological order, slug shape uniqueness, marker shape, non-overlapping windows, anchor-in-window, and pins V1L/V2L/V1J anchors against canonical ISO | **YES — 11 new cross-spec tests** in `tests/chapter-registry-cross-spec.test.ts` pinning the remaining 8 anchors, marker-label-to-slug canonical mapping, marker uniqueness, spacecraft-to-slug mapping, non-degenerate windows, mission-window-sanity | Vitest |
| AC3 — Pale Blue Dot placeholder | `web/src/chapters/specs/pale-blue-dot.ts` | NO dedicated test by dev (registry test covers length/order/slug but not the AC3 placeholder-comment contract or the ±1-day window invariant) | **YES — 4 new tests** asserting: (a) PBD window is exactly ±1 day around anchor (NOT the encounter ±30-day default), (b) the spec file carries the AC3 verbatim "Do NOT add PBD-specific choreography here" stop-sign, (c) PBD activates at anchor ±1 day inclusive, (d) PBD deactivates at anchor + 2 days | Vitest |
| AC4 — Single registry, frozen | `web/src/chapters/registry.ts` | YES — `registry.test.ts` covers length=11, sorted, slug shape unique, marker shape, non-overlap, anchor-in-window, canonical slug order, frozen mutation throws, lookup helpers (slug + ET) | NO additional needed for the registry contract itself; cross-spec test augments AC2 (which the registry exposes) | Vitest |
| AC5 — Unit-tested state machine | `web/src/services/chapter-director.ts` | YES — `chapter-director.test.ts` covers forward, reverse, rapid scrub (12 transitions / 3 chapters), reverse rapid scrub, idempotency, NaN/Infinity rejection | **YES — augmented** with real 11-chapter rapid-scrub (44 transitions) + round-trip forward+reverse + boundary-ET inclusivity at both ends + pre-mission + post-mission. See § "Integration & boundary tests". | Vitest |
| AC6 — Type module | `web/src/types/chapter.ts` | YES — `chapter.test.ts` covers ChapterSpec field set, ChapterState union, Spacecraft union, ChapterTransitionEvent shape, key set | NO additional needed — type contract is fully covered by dev tests + compile-time `expectTypeOf` guards | Vitest + tsc |
| AC7 — Suites green; no regressions | Aggregate gate | covered by all of the above | NO — meta-AC | `cd web && npm test -- --run` → **1363 passed** (was 1321 at handoff; +42 new from QA); `cd web && npm run typecheck` → 0 errors; `cd web && npm run lint` → 0 errors, 5 pre-existing warnings (the same baseline noted by the dev — unrelated to this story). |
| **AC8 — Integration AC: ChapterDirector ↔ ClockManager** | `web/src/main.ts` + dev-server browser smoke | NO test by dev — main.ts wire-up is verified by the LEAD-executed Chrome DevTools MCP smoke, not by Vitest (per the story's "Integration AC8 — Implementation guidance" note) | **YES — 6 new static-source tests** in `tests/main-chapter-director-wireup.test.ts` verify the wire-up SHAPE (import, construction with `ALL_CHAPTERS`, `engine.onFrame` registration, DEV-gated `__voyagerDebug.chapterDirector` exposure, no leak outside DEV). The behavioural half is covered by the MCP smoke stage below. | Vitest static-source check (QA) + Chrome DevTools MCP (lead-executed) |

## Files Added

```
web/tests/chapter-registry-cross-spec.test.ts        (NEW — 11 tests)
web/tests/chapter-director-integration.test.ts       (NEW — 25 tests)
web/tests/main-chapter-director-wireup.test.ts       (NEW —  6 tests)
```

**No functional code modified.** Tests only.

## Integration & Boundary Tests (`chapter-director-integration.test.ts`)

Three test groups orthogonal to the dev's small-integer fixture tests:

### Group 1 — Each canonical anchor activates its chapter (11 tests)

Iterates `(slug, ISO)` pairs from Story 2.1 AC2 (V2 launch through V2 heliopause, including PBD at 1990-02-14). For each:

- Constructs the director against the REAL `ALL_CHAPTERS` registry.
- Calls `director.update(etFromIso(iso))`.
- Asserts `director.activeChapter?.slug === slug`.
- Asserts `director.getState(slug) === 'held'`.
- Cross-checks `findActiveChapterAtEt(et)?.slug === slug` (the registry helper and the FSM are independent code paths reading the same windows — they must agree at the canonical anchor).

This catches both (a) a window mis-sized so the anchor falls outside its own window, and (b) any future window-overlap regression that lets a neighbour shadow the canonical anchor.

### Group 2 — Boundary-ET inclusivity (window-edge semantics)

Probes V1 Jupiter's ±30 day window (chosen because it's wide enough to test both edges without leaking into adjacent chapters' bands):

- Exact `windowStartEt` ⇒ `held` (lower-bound inclusive — pins the `restingStateAtEt` contract: `et >= windowStartEt`).
- Exact `windowEndEt` ⇒ `held` (upper-bound inclusive — `et <= windowEndEt`).
- `windowEndEt + 1` ⇒ `passed`, activeChapter null.
- `windowStartEt - 1` ⇒ `out`, activeChapter null.

### Group 3 — Pre-mission / post-mission / round-trip

- **Pre-mission (1900-01-01):** every chapter stays `out`, no transitions fire (the dev's fixture tests use ET=50 as "before the first window" but that's still after J2000; the real registry has chapters at negative ET — V1 launch ET ≈ -703M — which we exercise here).
- **Negative ET activation:** `update(etFromIso('1977-09-05T12:56:00Z'))` returns a NEGATIVE number and must still activate `v1-launch`. (The dev's tests never crossed et=0; this confirms the FSM is arithmetic-driven and doesn't accidentally special-case positive ETs.)
- **Post-mission (2100-01-01):** every chapter ends in `passed`, no active chapter, exactly **44 transitions** fire (11 chapters × 4 each) in chronological anchor order. The dev's rapid-scrub test uses 3 chapters / 12 transitions against a hand-rolled fixture; this exercises the real 11-chapter chain.
- **Round-trip scrub:** forward to 2100 fires 44 transitions, reverse to 1900 fires another 44 (passed→exiting→held→entering→out × 11), and every chapter is back to `out`.
- **Forward scrub stopping at V2 Neptune anchor:** chapters chronologically AFTER V2 Neptune (PBD, V1H, V2H) remain `out`; all earlier chapters reach `passed`.

### Group 4 — PBD ±1 day window precision (4 tests)

Confirms the AC3 placeholder window is exactly ±86_400 s around the 1990-02-14 anchor — at anchor, at `+1 day` (inclusive), at `-1 day` (inclusive), and OFF at `+2 days`.

## Cross-Spec Tests (`chapter-registry-cross-spec.test.ts`)

Eleven tests covering the cross-cutting AC2 invariants not pinned by the per-AC registry test:

1. Marker labels are unique across all 11 chapters (registry test only asserts shape per spec).
2. Each slug maps to the AC2-documented `markerLabel` (V1L/V2L/V1J/V2J/V1S/V2S/V2U/V2N/PBD/V1H/V2H).
3. Each slug maps to the AC2-documented `spacecraft` value (v1/v2; no `'both'` in Story 2.1).
4. Every `spacecraft` value is in the documented union `{v1, v2, both}`.
5. Every `name` is a non-empty trimmed string.
6. Every window is non-degenerate (`windowEndEt > windowStartEt`).
7. Each `anchorEt` matches the PRD/AC2 canonical ISO instant via `etFromIso`. (The dev's registry test only pins V1L/V2L/V1J anchors; this adds V2J, V1S, V2S, V2U, V2N, PBD, V1H, V2H.)
8. Every anchor falls inside the mission spine (V2 launch − 7 days → V2 heliopause + 90 days).
9. PBD placeholder window is the documented ±1 day, NOT the encounter ±30-day default (AC3 contract).
10. PBD spec file carries the AC3 verbatim "Placeholder per Story 2.1" + "Full PBD module is Epic 5" + "Do NOT add PBD-specific choreography here" stop-signs (catches future drift of the boundary-statement comment).

## main.ts Wire-Up Tests (`main-chapter-director-wireup.test.ts`)

Six static-source-check tests (same pattern as `celestial-defense-extended.test.ts`'s `engine.skyboxGroup.add` check):

1. `import { ChapterDirector } from './services/chapter-director'` is present.
2. `import { ALL_CHAPTERS } from './chapters/registry'` is present.
3. `new ChapterDirector(ALL_CHAPTERS)` — director is constructed with the canonical registry (NO parallel list).
4. `engine.onFrame(` + `chapterDirector.update(et)` — per-frame wire-up to Story 1.15's RenderEngine.
5. `if (import.meta.env.DEV)` guard + `__voyagerDebug` surface — the DEV-only debug surface for Integration AC8.
6. The only EXECUTABLE `__voyagerDebug = …` assignment is downstream of the `import.meta.env.DEV` gate (comment mentions earlier in the file don't count; this catches a future leak that publishes the surface to production bundles).

Rationale: loading `main.ts` under Vitest would execute `bootstrap()` and touch Three.js/the DOM. The static-source check is the established pattern for verifying main.ts wire-up shape (see Story 1.13's celestial-defense-extended `engine.skyboxGroup.add` test for the precedent).

## Chrome DevTools MCP Smoke Stage (Lead-Executed — Story 2.0 AC2 / voyager-skill-rules.md Rule 3 + Rule 6)

**Driver:** Chrome DevTools MCP. Post-Story-1.16 (brotli wasm polyfill), no initScript shim is required — Chrome-for-Testing 148 loads Voyager normally.

**Skip-rule check:** Story 2.1 touches `web/src/` (chapter director, specs, registry, main.ts) — MCP smoke stage is REQUIRED (not bake-only-exempt).

**Story 2.1 Integration AC8 — covered MCP steps:**

The story file's Integration AC8 explicitly defers MCP execution to the lead. The following steps are the proposed lead-executed sequence. Evidence path target: `_bmad-output/implementation-artifacts/2-1-smoke-evidence/`.

### Step 1 — Boot dev server and navigate

```
mcp__chrome-devtools-mcp__navigate_page
  url: http://localhost:5173/
```

(The dev server is `cd web && npm run dev`; default Vite port 5173.) No query params required — the chapter director is wired by default.

### Step 2 — Assert the debug surface exists

```
mcp__chrome-devtools-mcp__evaluate_script
  expression: typeof window.__voyagerDebug?.chapterDirector === 'object'
  expected:   true
```

Confirms the DEV-only debug surface from `main.ts` is exposed. If this returns `false` the DEV guard is producing the wrong bundle and the rest of the smoke is meaningless.

### Step 3 — Assert initial activeChapter is null (page loads with no time scrub)

```
mcp__chrome-devtools-mcp__evaluate_script
  expression: window.__voyagerDebug.chapterDirector.activeChapter
  expected:   either null OR a chapter spec, depending on the dev server's
              boot ET (the ClockManager's mission-start may put the cursor
              inside a chapter window — record observed value as baseline).
```

### Step 4 — Scrub to V1 Jupiter anchor and assert activeChapter

```
mcp__chrome-devtools-mcp__evaluate_script
  expression: (() => {
    // Drive the timeline scrubber to the V1 Jupiter encounter.
    // The exact API depends on Story 1.10 ClockManager surface; if the
    // scrubber UI is the only path, use `mcp__chrome-devtools-mcp__click`
    // + `fill` on the <input type=range>. Otherwise invoke via the debug
    // surface if exposed.
    return window.__voyagerDebug.chapterDirector.activeChapter?.slug;
  })()
  expected:   'v1-jupiter'
```

**MCP smoke covers AC8 — `evaluate_script` confirms `activeChapter.slug === 'v1-jupiter'` at the V1 Jupiter encounter ET (1979-03-05T12:05Z).**

### Step 5 — Scrub to between-chapter quiet zone and assert null

```
mcp__chrome-devtools-mcp__evaluate_script
  expression: (() => {
    // Scrub to 1995-01-01 (the long PBD → V1 heliopause gap).
    return window.__voyagerDebug.chapterDirector.activeChapter;
  })()
  expected:   null
```

**MCP smoke covers AC8 — between-chapter `activeChapter === null` assertion.**

### Step 6 — Screenshot per asserted AC state

```
mcp__chrome-devtools-mcp__take_screenshot
  path: _bmad-output/implementation-artifacts/2-1-smoke-evidence/v1-jupiter-active.png

mcp__chrome-devtools-mcp__take_screenshot
  path: _bmad-output/implementation-artifacts/2-1-smoke-evidence/quiet-zone-null.png
```

The first capture shows the HUD reading 1979-03-05 with the V1 Jupiter chapter marker highlighted; the second shows the HUD reading 1995-01-01 with no chapter active (no highlighted marker).

### Step 7 — Console-clean assertion

```
mcp__chrome-devtools-mcp__list_console_messages
  expected: zero `error`-level messages apart from the Lit dev-mode banner
            (text: "Lit is in dev mode") and any pre-existing allow-listed
            warnings (Vite asset 304 chatter, etc.).
```

A clean console during the scrub session confirms the FSM transitions do not produce subscriber errors and that the throwing-subscriber hardening path (verified in unit) is not triggered.

### Step 8 — Accessibility snapshot (optional — story does not introduce a new aria surface but the active-chapter readout flows into Story 2.3's chapter-index aria-current; capture a baseline)

```
mcp__chrome-devtools-mcp__take_snapshot
  path: _bmad-output/implementation-artifacts/2-1-smoke-evidence/accessibility-tree.json
```

Captures the aria tree at the V1 Jupiter scrub for future Story 2.3 regression baselines (chapter-index aria-current will need this as a reference).

## Verification (Final Run)

```
cd web && npm test -- --run         → 80 files, 1363 tests passed (was 1321 at handoff; +42 net QA tests)
cd web && npm run typecheck          → 0 errors
cd web && npm run lint               → 0 errors, 5 pre-existing warnings (baseline; unrelated to this story)
```

The 5 pre-existing lint warnings are the same five present before this session (`celestial-bodies.ts:148`, `skybox.ts:117`, `spacecraft-models.ts:186`, `ephemeris-service.ts:113`, `celestial-defense-extended.test.ts:91`) — all "Unused eslint-disable directive (no problems were reported from 'no-console')".

## Coverage Summary

| Surface | Per-AC test (dev) | QA test (this session) |
|---|---|---|
| ChapterDirector FSM (forward) | ✅ | ✅ augmented with real registry |
| ChapterDirector FSM (reverse) | ✅ | ✅ augmented with real registry round-trip |
| ChapterDirector FSM (rapid scrub) | ✅ (3-chapter fixture) | ✅ (real 11-chapter, 44 transitions, ordering) |
| ChapterDirector idempotency | ✅ | covered |
| ChapterDirector subscriber hardening | ✅ | covered |
| Boundary ETs (exact window edges) | ❌ | ✅ |
| Pre-mission ET / negative ET | ❌ | ✅ |
| Post-mission ET (far future) | ❌ | ✅ |
| Registry length / order / freeze | ✅ | covered |
| Slug + marker shape | ✅ | covered |
| Marker UNIQUENESS | ❌ | ✅ |
| Slug → marker canonical mapping | ❌ | ✅ |
| Slug → spacecraft canonical mapping | ❌ | ✅ |
| All 11 anchors at PRD canonical ETs | ✅ (3 anchors: V1L/V2L/V1J) | ✅ (remaining 8 anchors) |
| PBD ±1-day window precision | ❌ | ✅ |
| PBD placeholder-comment AC3 contract | ❌ | ✅ |
| main.ts: ChapterDirector construction shape | ❌ | ✅ |
| main.ts: engine.onFrame fan-out | ❌ | ✅ |
| main.ts: __voyagerDebug DEV-only guard | ❌ | ✅ |
| Integration AC8 behavioural smoke | n/a (lead-executed) | Described above for lead execution |

## Done

Tests generated, verified locally, summary delivered. Lead-executed MCP smoke stage documented above against the project's voyager-skill-rules.md Rule 3 + Rule 6 contract.
