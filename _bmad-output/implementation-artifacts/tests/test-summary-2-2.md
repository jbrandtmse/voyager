# Story 2.2 — QA Test Automation Summary

**Story:** 2.2 (Chapter Markers on Mission Scrubber — Vertebrae)
**Story file:** `_bmad-output/implementation-artifacts/2-2-chapter-markers-on-mission-scrubber-vertebrae.md`
**Status at QA author entry:** `review` (dev complete; 27 per-AC unit tests authored in `v-timeline-scrubber.test.ts` — 1390 vitest pass at handoff, typecheck clean, lint 5 pre-existing warnings)
**QA author:** spawned 2026-05-20 under team `epic-cycle-2026-05-20`
**Skill:** `bmad-qa-generate-e2e-tests` (Voyager toml override loads MCP-smoke-stage requirement and Voyager skill rules as `persistent_facts`)

## Test Framework Detection

- **TypeScript (web side):** Vitest + happy-dom; component unit tests under `web/src/components/*.test.ts`, cross-cutting QA / integration tests under `web/tests/**/*.test.ts`. Runner: `cd web && npm test -- --run`.
- **No new framework introduced.** All Story 2.2 surfaces are web-side (`web/src/components/v-timeline-scrubber.ts`, `web/src/boot/first-paint.ts`, `web/src/main.ts`); bake side untouched.

## Per-AC Coverage Analysis

| AC | Scope | Dev-authored test exists? | New QA test added? | Verifying surface |
|----|-------|---|---|---|
| AC1 — 11 markers rendered along the track | `<v-timeline-scrubber>` shadow DOM | YES — 6 tests in `v-timeline-scrubber.test.ts` § "Story 2.2 AC1": count, chronological order, percentage positioning, marker-label text, `data-active` on the active slug, between-chapter no-active | **Augmented** — `scrubber-chapter-markers-integration.test.ts` § "at-most-one active marker across all 11 anchors (real registry)" sweeps every canonical anchor end-to-end through first-paint + ChapterDirector | Vitest unit (dev) + Vitest cross-cutting integration (QA) + lead-executed Chrome DevTools MCP smoke |
| AC2 — Markers are individually keyboard-focusable buttons | Marker shadow DOM | YES — 3 tests: native `<button>`, `aria-label` format, DOM order matches anchor order | NO additional — the static DOM contract is fully covered; the lead's MCP smoke `take_snapshot` corroborates the accessibility tree | Vitest + MCP accessibility-tree snapshot |
| AC3 — Hover tooltip + touchscreen alternative | CSS surface + per-marker DOM | YES — 5 tests: tooltip child + text, 200ms `transition-delay`, `--v-color-accent` color, `@media (hover: none) display:none`, persistent `.chapter-marker-label` (Tier-2 fallback) | **YES — `scrubber-chapter-markers-integration.test.ts` § "responsive CSS branches"** consolidates the UX-DR22 Tier-1 + Tier-2 contract into 4 assertions so a future stylesheet refactor that drops half the contract reds the suite | Vitest static-CSS + MCP screenshot evidence on dwell |
| AC4 — Activation jumps the simulation | Click + Enter + Space + CustomEvent emission | YES — 6 tests: click→`scrubTo` + pause, `chapter-jump` payload, Enter, Space, pointerdown doesn't bubble to track, no-clock fallback path | **YES — 4 new tests** in `scrubber-chapter-markers-integration.test.ts` § "chapter-jump CustomEvent payload (Story 2.4 contract)" + § "marker click race": (a) event bubbles+composes past the host to `document` (Story 2.4 router contract), (b) payload schema validated against the registry for every one of the 11 markers, (c) Enter via real first-paint composition, (d) marker pointerdown does NOT leak `voyager:scrub` from the track listener, (e) `clockManager.simTimeEt` lands EXACTLY at `chapter.anchorEt` (no race-induced pixel-fraction drift) | Vitest cross-cutting |
| AC5 — Active marker tracks ChapterDirector state | Subscription + per-transition re-render | YES — 4 tests: subscribe/unsub on connect/disconnect, crossing flips active, at-most-one across all 11 anchors, reverse scrubbing | **Augmented** — `scrubber-chapter-markers-integration.test.ts` § "first-paint wires the scrubber to ChapterDirector" asserts the subscription is set up on the SAME TICK the scrubber mounts (pre-mount property binding), so any future refactor that moves the assignment after `appendChild` breaks the suite immediately | Vitest cross-cutting |
| AC6 — Test suites green, no regressions | Aggregate gate | covered by all of the above | NO — meta-AC | `cd web && npm test -- --run` → **1411 passed** (was 1390 at handoff; +21 new from QA). `cd web && npm run typecheck` → 0 errors. `cd web && npm run lint` → 0 errors, 5 pre-existing warnings (unchanged from dev's baseline; unrelated to this story). |
| **Integration AC7 — Scrubber consumes real ChapterDirector + real ALL_CHAPTERS** | `main.ts` → `first-paint.ts` → `<v-timeline-scrubber>` wire-up | NO behavioural test by dev (Integration AC7 is the LEAD-executed Chrome DevTools MCP smoke per voyager-skill-rules Rule 3 and the story's Dev Notes § "Testing standards") | **YES — `scrubber-chapter-markers-integration.test.ts` covers the consumer-side wire-up in TWO complementary layers**: <br>(a) **Behavioural** — `startFirstPaint({ chapterDirector })` is exercised end-to-end with real `ChapterDirector(ALL_CHAPTERS)`, real `ClockManager`, real DOM; at `MISSION_START_ET` the `launch-v2` marker has `data-active` (AC7 boot assertion); sweeping all 11 anchors lights up the matching marker each time; clicking a non-active marker (`v1-heliopause`) shifts the active treatment after `director.update(simTimeEt)` (AC7 click assertion). <br>(b) **Static-source** — `main.ts` passes `chapterDirector` to `startFirstPaint`; `__voyagerDebug.scrubber` is gated behind `import.meta.env.DEV`; `first-paint.ts` accepts `chapterDirector?: ChapterDirector` on `FirstPaintOptions` and sets `scrubber.chapterDirector = …` BEFORE `host.appendChild(scrubber)` (pre-mount binding contract). | Vitest behavioural + Vitest static-source (QA) + Chrome DevTools MCP (lead-executed — see § "Chrome DevTools MCP smoke stage") |

## Files Added

```
web/tests/scrubber-chapter-markers-integration.test.ts   (NEW — 21 tests across 6 describe blocks)
```

**No functional code modified.** Tests only.

## Cross-Cutting QA Test Detail (`scrubber-chapter-markers-integration.test.ts`)

Six describe blocks orthogonal to the dev's in-shadow-DOM unit suite:

### 1. `Story 2.2 QA — first-paint wires the scrubber to ChapterDirector` (4 tests)

- `startFirstPaint` propagates the option to `scrubber.chapterDirector`.
- At `MISSION_START_ET` the `launch-v2` marker has `data-active` after `director.update(MISSION_START_ET)`.
- The chapter subscription is set up on the SAME TICK as `connectedCallback` (verified via spy on `director.subscribe`).
- Omitting the option keeps `scrubber.chapterDirector === null`; markers still render inactive (graceful default).

### 2. `Story 2.2 QA — at-most-one active marker across all 11 anchors (real registry)` (2 tests)

- Sweep every canonical anchor; assert exactly one `data-active` marker matching the slug.
- A between-chapter quiet zone (1995-ish ET) leaves zero markers active and `director.activeChapter` is null.

### 3. `Story 2.2 QA — chapter-jump CustomEvent payload (Story 2.4 contract)` (3 tests)

- Bubbling + composed: event reaches `document` (Story 2.4's URL router will listen at window/document level).
- Payload schema validated against the registry: `slug` is a non-empty string that resolves via `findChapterBySlug`, `anchorEt` equals the registry's anchor for that slug. Exercised for all 11 markers.
- Enter key on a focused marker also emits `chapter-jump` (keyboard parity with click).

### 4. `Story 2.2 QA — marker click race: no voyager:scrub dispatched from the track` (2 tests)

- Marker pointerdown does NOT leak to the track listener (no `voyager:scrub` fired).
- After a marker click, `clockManager.simTimeEt` lands EXACTLY at the canonical anchor — proves there is no race-induced pixel-fraction drift via the track's `attachPointerHandlers` path.

### 5. `Story 2.2 QA — main.ts + first-paint.ts wire-up shape (static-source check)` (5 tests)

Mirrors the Story 2.1 `main-chapter-director-wireup.test.ts` pattern. Pins:

- `main.ts` passes `chapterDirector` to `startFirstPaint`.
- `main.ts` exposes `__voyagerDebug.scrubber` inside the DEV gate (mirrors Story 2.1's chapter-director debug surface).
- The executable `__voyagerDebug.scrubber` assignment lives only inside an `import.meta.env.DEV` gate (comment-stripped substring check — no production leak).
- `first-paint.ts` accepts `chapterDirector?: ChapterDirector` on `FirstPaintOptions`.
- `first-paint.ts` sets `scrubber.chapterDirector = …` BEFORE `host.appendChild(scrubber)` (pre-mount binding — verified by indexOf order comparison).

### 6. `Story 2.2 QA — responsive CSS branches (UX-DR22 Tier-1 + Tier-2)` (4 tests)

- Tier-1: `@media (hover: hover)` block exists AND applies 200ms `transition-delay` inside it.
- Tier-2: `@media (hover: none)` block exists AND hides `.chapter-marker-tooltip` via `display: none`.
- Hover tooltip's base state is `opacity: 0` (the dwell reveal animates opacity, not display — CSS contract for non-animatable display transitions).
- Inactive markers use `--v-color-fg-muted`; active markers (`[data-active]`) use `--v-color-accent` (design-token contract from Story 1.7).

### 7. `Story 2.2 QA — title-card dissolve + scrubber reveal preserves markers` (1 test)

- Markers persist across the title-card dissolve + scrubber reveal sequence (visibility flip is the only mutation); the ChapterDirector subscription is preserved (verified by driving the director to a different anchor post-dissolve and confirming `data-active` moves).

## Chrome DevTools MCP Smoke Stage (Integration AC7 — Lead-Executed)

Per voyager-skill-rules Rule 3 + Rule 6: this stage is the per-story exit criterion for browser-smoke evidence. Story 2.2 touches files under `web/src/` (the scrubber, first-paint, and main.ts), so the MCP smoke stage is REQUIRED (not exempt).

The lead executes the following MCP tool sequence against the running dev server. **Sub-agents (this QA author included) MUST NOT drive MCP themselves** — per Rule 7, the ADR-0010 Layer-1 gate is the lead's tool inventory, not the sub-agent's.

Evidence directory: `_bmad-output/implementation-artifacts/2-2-smoke-evidence/`

### MCP step 1 — Navigate to the dev server

```
mcp__chrome-devtools-mcp__navigate_page(url: "http://localhost:5173/")
```

The base URL is sufficient; no `?dev=…` mode needed (Story 2.2 lives in the default app path). The lead should ensure the dev server is running (`cd web && npm run dev`) before invoking.

**Skip rules considered:** Story 2.2's `Files-to-Modify` list contains `web/src/components/v-timeline-scrubber.ts`, `web/src/boot/first-paint.ts`, and `web/src/main.ts` — all under `web/src/`. The "Pure bake-side exemption" does NOT apply. The MCP stage is REQUIRED.

### MCP step 2 — Wait for first paint + title-card dissolve

```
mcp__chrome-devtools-mcp__wait_for(text: "Voyager", timeout: 5000)
```

The title card holds for `TITLE_CARD_HOLD_MS` (~1500 ms) + dissolve (~700 ms). Waiting for the title text to appear and then for the scrubber to become visible is the most stable gate. Optional: `wait_for(selector: 'v-timeline-scrubber:not([style*=hidden])')` if the lead prefers a selector-based wait.

### MCP step 3 — Assert 11 markers exist at the correct horizontal positions (AC7 first half)

```
mcp__chrome-devtools-mcp__evaluate_script(script: `
  (() => {
    const w = window;
    const dbg = w.__voyagerDebug;
    const scrubber = dbg && dbg.scrubber;
    if (!scrubber) return { ok: false, reason: 'window.__voyagerDebug.scrubber missing (Story 2.2 DEV surface)' };
    const root = scrubber.shadowRoot;
    if (!root) return { ok: false, reason: 'scrubber has no shadowRoot' };
    const markers = Array.from(root.querySelectorAll('.chapter-marker'));
    return {
      ok: markers.length === 11,
      count: markers.length,
      slugs: markers.map(m => m.getAttribute('data-slug')),
      positions: markers.map(m => parseFloat(m.style.left)),
    };
  })()
`)
```

Expected: `ok === true`, 11 slugs in the canonical chronological order, positions in `[0, 100]` and strictly ascending. The lead pastes the JSON return into the smoke-evidence directory as `01-marker-positions.json`.

### MCP step 4 — Assert `launch-v2` is the active marker at boot (AC7 second half)

```
mcp__chrome-devtools-mcp__evaluate_script(script: `
  (() => {
    const dbg = window.__voyagerDebug;
    const scrubber = dbg && dbg.scrubber;
    const root = scrubber.shadowRoot;
    const active = Array.from(root.querySelectorAll('.chapter-marker[data-active]'));
    return {
      ok: active.length === 1 && active[0].getAttribute('data-slug') === 'launch-v2',
      activeCount: active.length,
      activeSlug: active.length === 1 ? active[0].getAttribute('data-slug') : null,
    };
  })()
`)
```

Expected: `ok === true`. At boot the URL has no `?t=`, so the clock is at `MISSION_START_ET` (1977-08-13), inside `launch-v2`'s ±7-day window per the spec.

### MCP step 5 — Screenshot proof of the rendered marker strip

```
mcp__chrome-devtools-mcp__take_screenshot(path: "_bmad-output/implementation-artifacts/2-2-smoke-evidence/02-boot-marker-strip.png")
```

Asserts visually that the 11 vertebrae are painted with the active treatment at `V2L` (leftmost). The lead inspects this image and approves it as Integration AC7 evidence.

### MCP step 6 — Accessibility-tree snapshot (Rule per persistent-facts: AC2 + AC4 touch a11y surfaces)

```
mcp__chrome-devtools-mcp__take_snapshot()
```

Expected: each of the 11 markers appears as an accessible `button` with `accessibleName` of the form `"<chapter.name> — <ISO-8601-date>"`. The snapshot covers AC2 ("individually keyboard-focusable buttons with `aria-label`").

### MCP step 7 — Click a different marker, assert active treatment shifts + HUD date updates (AC7 third half)

```
mcp__chrome-devtools-mcp__click(selector: "v-timeline-scrubber >>> .chapter-marker[data-slug='v1-jupiter']")
```

Then re-query:

```
mcp__chrome-devtools-mcp__evaluate_script(script: `
  (() => {
    const dbg = window.__voyagerDebug;
    const scrubber = dbg && dbg.scrubber;
    const root = scrubber.shadowRoot;
    const active = Array.from(root.querySelectorAll('.chapter-marker[data-active]'));
    // The chapter-director debug surface from Story 2.1 lets us also assert
    // the director's activeChapter agrees.
    const dirActive = dbg.chapterDirector && dbg.chapterDirector.activeChapter;
    return {
      activeMarkerSlug: active.length === 1 ? active[0].getAttribute('data-slug') : null,
      directorActiveSlug: dirActive ? dirActive.slug : null,
    };
  })()
`)
```

Expected: `activeMarkerSlug === 'v1-jupiter'` AND `directorActiveSlug === 'v1-jupiter'`. This is AC7's third assertion ("clicking a different marker (e.g., V1 Jupiter) shifts the active-marker treatment to that marker"). The HUD date update can be asserted by reading the HUD's text content if the lead wishes; it follows from `clockManager.simTimeEt` having moved to the V1 Jupiter anchor.

### MCP step 8 — Screenshot after marker activation

```
mcp__chrome-devtools-mcp__take_screenshot(path: "_bmad-output/implementation-artifacts/2-2-smoke-evidence/03-after-v1-jupiter-click.png")
```

Visual confirmation that the active treatment has moved from `V2L` to `V1J`.

### MCP step 9 — Console-clean assertion

```
mcp__chrome-devtools-mcp__list_console_messages()
```

Expected: only the Lit dev-mode banner (`Lit is in dev mode. Not recommended for production!`) and any pre-existing Voyager warnings that are part of the baseline. No NEW errors or warnings from Story 2.2 surfaces (`v-timeline-scrubber`, `first-paint`, marker activation).

### Mapping to ACs

- **MCP step 3 (positions) + step 5 (screenshot)** cover AC7's "all 11 chapter markers are visible in the DOM at the correct horizontal positions corresponding to their anchorEts".
- **MCP step 4 (boot active) + step 5 (screenshot)** cover AC7's "at boot the marker corresponding to `launch-v2` (active at MISSION_START_ET) has the `--v-color-accent` treatment".
- **MCP step 6 (a11y tree)** covers AC2.
- **MCP step 7 + step 8** cover AC7's "clicking a different marker (e.g., V1 Jupiter) shifts the active-marker treatment to that marker and the HUD date updates accordingly". This is also a behavioural cross-check of AC4 (click activation) and AC5 (active marker tracks director).
- **MCP step 9 (console-clean)** is the Rule-3 baseline-hygiene assertion.

## Coverage Summary

- **Per-AC unit/component:** dev-authored (1390 → unchanged baseline + 27 already accounted).
- **Consumer-side integration (Rule 2):** QA-authored, 21 new tests in `scrubber-chapter-markers-integration.test.ts`.
- **Browser smoke (Rule 3):** lead-executed Chrome DevTools MCP stage, 9 tool calls + 2 screenshots + 1 a11y snapshot, all keyed to Integration AC7.

| Tier | Surface | Tests | Status |
|---|---|---|---|
| Component unit (Vitest) | `v-timeline-scrubber.test.ts` | 27 (dev) | green |
| Cross-cutting integration (Vitest) | `scrubber-chapter-markers-integration.test.ts` | 21 (QA) | green |
| Static-source wire-up shape (Vitest) | embedded in cross-cutting suite | 5 (QA) | green |
| Browser smoke (Chrome DevTools MCP) | lead-executed against dev server | 9 tool calls | pending lead execution |

**Baseline gates** at QA completion:

- `cd web && npm test -- --run` → **1411 passed** (1390 + 21 QA). Was 1390 at dev handoff.
- `cd web && npm run typecheck` → 0 errors.
- `cd web && npm run lint` → 0 errors, 5 pre-existing warnings (the same baseline noted by dev; unrelated to this story — confined to `web/src/render/celestial-bodies.ts`, `skybox.ts`, `spacecraft-models.ts`, `web/src/services/ephemeris-service.ts`, `web/tests/celestial-defense-extended.test.ts`).

## Notes for the Lead

- The DEV-only debug surface `window.__voyagerDebug.scrubber` is the load-bearing contract for MCP step 3 and step 4. If the lead can't read it, check that the dev server is running in DEV mode (Vite's `import.meta.env.DEV === true`) and not in a production-bundle preview.
- The MCP smoke stage assumes the dev server is reachable at `http://localhost:5173/`. The Voyager Vite default port; if customized in the lead's environment, the URL in MCP step 1 should be adjusted.
- Sub-agent MCP propagation is best-effort per voyager-skill-rules Rule 7 — this QA author did NOT attempt MCP calls from inside the spawn. The MCP stage is the lead's responsibility and the binding browser-evidence gate.
- No Playwright counterpart is needed for Story 2.2: the AC7 surface is browser-side observable DOM + screenshot, which is exactly what Chrome DevTools MCP is calibrated for (ADR-0010 Layer-1).
