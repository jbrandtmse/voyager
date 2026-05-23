# Test Automation Summary — Story 5.1 (PBD Dedicated Module + Internal Substates)

**Story file:** `_bmad-output/implementation-artifacts/5-1-pbd-dedicated-module-and-internal-substates.md`
**QA stage:** post-dev; dev shipped 67 tests across 4 new files; QA evaluated for gaps + added 5 supplemental tests.
**Test framework:** Vitest (project standard; co-located + `web/tests/` integration).
**Baseline at QA start:** 3189 passing in isolation; typecheck clean; lint 4 warnings.

## QA Coverage Evaluation

| AC6 surface | Dev coverage | Verdict |
|---|---|---|
| (a) `pbdSubstateAt(et)` start/peak/end boundaries | `substates.test.ts` (19 tests) — pin half-open-on-right convention + each substate boundary | Sufficient |
| (b) `PBD_SUBSTATE_ORDER` is 11-element chronological | `substates.test.ts` — length, ordering, freeze, contiguity | Sufficient |
| (c) Re-exported spec shape (slug / anchor / spacecraft / copy) | `index.test.ts` (25 tests) — slug, name, marker, anchor, window, spacecraft, copy lede + word count, defaultFraming undef, frozen | Sufficient |
| (d) Path A subscriber + held-window gating | `pale-blue-dot-integration.test.ts` (12 tests) — module fires only in held, reverse-scrub re-entry, V1J cross-chapter no-op | Sufficient (real-stack — ChapterDirector + ALL_CHAPTERS + PaleBlueDot all real instances per Rule 6) |
| (e) `<v-chapter-copy>` renders PBD prose in held | `pale-blue-dot-integration.test.ts` — cold-load → displayedSlug + lede DOM text + body /1990/ + embed mode + scrub-out clearing | Sufficient |
| Pairing-invariant exception (copy without defaultFraming) | `story-4-5-v1j-encounter-qa-gaps.test.ts:698-711` documents PBD as the sole permitted exception inline — verified NOT a silent relaxation | Sufficient |

**Gaps the QA stage closed:**

1. **DEV-gate discipline for `__voyagerDebug.paleBlueDot`** — dev source-grepped for the key's presence but did NOT pin that the publish lives inside `import.meta.env.DEV` so it's stripped from production builds. Mirrors the canonical `viewFrame` defense at `main-ts-boot-ordering-defense.test.ts:156` and protects ADR-0015 "no global store" + Story 5.0 production-bundle discipline.
2. **180s cinematic-arc total-duration pin** — dev's substate tests pinned each individual substate's start/peak/end but did NOT pin the aggregate arc duration (turning + 6×sweeping + composite_active + composite_decay = 180s). A future Story 5.2 timing tweak would silently re-balance without a unit-test failure; the new pin surfaces re-balancing at the unit tier BEFORE the choreography wire-up sees it.

**Gaps the QA stage explicitly considered AND chose NOT to add:**

- **`update` NOT called outside the window (AC3 gate test)** — already covered by `pale-blue-dot-integration.test.ts:120` ("does NOT fire outside the PBD window") + `:78` (deactivation contract on exit). No add.
- **`ChapterModule` interface contract surface (instanceof / has `spec` / has `update`)** — `index.test.ts:99-107` already pins `m.spec === PBD_SPEC` + `typeof m.update === 'function'`. The class declares `implements ChapterModule` (compile-time check). No runtime add needed.

## Generated Tests (Net New: 5)

### Unit (Vitest)

- **`web/src/chapters/pale-blue-dot/substates.test.ts`** — appended one `describe` block ("Story 5.1 AC2 — cinematic arc total duration pin (Story 5.2 timing tripwire)") with 4 tests:
  1. arc = turning + 6×sweeping + composites sums to 180s
  2. `turning` is 30s
  3. each `sweeping_<body>` is 15s; six of them = 90s
  4. `composite_active` + `composite_decay` each 30s (60s fade window)

### Integration (Vitest — real-stack)

- **`web/tests/pale-blue-dot-integration.test.ts`** — appended 1 test inside the existing AC7 `describe`:
  5. `__voyagerDebug.paleBlueDot` publish lives inside an `import.meta.env.DEV` gate (stripped from production builds — source-grep defense mirroring viewFrame at boot-ordering-defense:156)

## Results

- **Net new tests:** 5 (4 unit + 1 integration source-grep)
- **PBD test file aggregate:** 72 passing (67 dev + 5 QA)
- **Projected web vitest baseline:** 3189 (dev sweep) + 5 (QA additions) → **3194 passing in isolation**
- **Typecheck:** Inherited clean from dev baseline; no new types added.
- **Lint:** Inherited baseline; no new lint surfaces.
- **Test discoverability:** All new tests follow `*.test.ts` convention, co-located with source (substates) or under `web/tests/` (integration), discoverable by default vitest sweep, not excluded by `vitest.config.ts` or ignore files.

## Chrome DevTools MCP Smoke (AC7 — lead-driven, NOT QA)

Per voyager-skill-rules.md Rule 3 + Rule 8 + Story 2.0 AC2 (Chrome DevTools MCP smoke-stage policy), Story 5.1 touches `web/src/` (specifically `web/src/main.ts`, `web/src/chapters/pale-blue-dot/`, `web/src/types/chapter.ts`, `web/src/chapters/specs/pale-blue-dot.ts`) so the per-story exit criterion requires browser-smoke evidence from the lead. The smoke is documented as AC7 in the story file and the dev's task list (T4) carries it as lead-driven.

**Smoke contract — AC7 (lead-driven):**

The lead drives Chrome DevTools MCP against the dev server (or `vite preview` of the production build) navigating to `http://localhost:5173/c/pale-blue-dot` (or `:4173/c/pale-blue-dot` for production preview). Required tool calls + observations:

1. **`mcp__chrome-devtools-mcp__navigate_page`** — open `/c/pale-blue-dot`. URL contract: the final URL must equal `/c/pale-blue-dot` (per AC5 + AC7). Captures the cold-load jump-paused contract from Story 2.4.

2. **`mcp__chrome-devtools-mcp__evaluate_script`** — assert:
   - **AC7 (chapter title HUD):** the `<v-hud-chapter-title>` shadow-DOM element's rendered text === `"Pale Blue Dot"` (already passing per Story 5.0; AC7 re-confirms post-Story-5.1).
   - **AC7 (chapter copy panel):** `document.querySelector('v-chapter-copy')` is not null; its `.shadowRoot` (or light DOM, per the component's implementation — `v-chapter-copy` uses light-DOM rendering per `v-chapter-copy.ts`) contains a `.v-chapter-copy-lede` whose textContent === `"Pale Blue Dot."` (note trailing period); a `.v-chapter-copy-paragraph` whose textContent matches `/1990/`.
   - **AC7 (substate DEV-accessor in dev mode):** `window.__voyagerDebug.paleBlueDot.currentSubstate === "idle"` on cold-load (no playback) — verifying the substate machine starts pre-arc until playback resumes (per Dev Agent Record interpretation of AC5 / AC7). This accessor is DEV-only; the production-build smoke ONLY exercises the title + copy + URL contract above.
   - **AC3 (no PBD work outside the window):** scrub the timeline to a non-PBD ET (e.g. V1J anchor 1979-03-05) via `window.__voyagerDebug.chapterDirector` or the scrubber DOM, evaluate `window.__voyagerDebug.paleBlueDot.currentSubstate` — should still be `"idle"` (the module never advanced because the subscriber never flipped active=true).

3. **`mcp__chrome-devtools-mcp__take_screenshot`** — capture at least three frames into `_bmad-output/implementation-artifacts/5-1-smoke-evidence/`:
   - `pale-blue-dot-anchor.png` — cold-load at `/c/pale-blue-dot`, chapter title + copy panel both visible.
   - `pale-blue-dot-anchor-prod.png` — same as above against the `vite preview` production build (no DEV-only banners; title + copy must still render).
   - `pale-blue-dot-substate-idle-debug.png` — DEV mode console output showing `__voyagerDebug.paleBlueDot.currentSubstate === "idle"`.

4. **`mcp__chrome-devtools-mcp__take_snapshot`** — accessibility tree snapshot of the chapter copy panel + chapter title HUD (covers a11y surface per AR9 / NFR-A1; the lede `<h2>` and body `<p>` should be in the accessibility tree as readable text).

5. **Console-clean assertion** — capture console messages during the navigation + scrub sequence; assert no errors beyond the Lit dev-mode banner and any pre-existing allow-listed warnings. PBD's introduction must not raise new errors (`PaleBlueDot subscriber threw:` etc. would surface here if a listener regression slipped in).

**ACs covered by the MCP smoke (named explicitly per Rule 8 obligation):**

- AC4 (chapter copy via `<v-chapter-copy>` integration) — `take_screenshot` + `evaluate_script` against the rendered lede + body DOM.
- AC5 (scrubber marker + URL navigation pin at PBD anchor) — `navigate_page` + URL contract assertion.
- AC7 (cold-load to `/c/pale-blue-dot` end-to-end production smoke) — the entire smoke session.
- AC3 (outside the window, the dedicated module is inactive) — DEV `currentSubstate === 'idle'` after scrubbing OUT of the PBD window.

**Evidence destination:** `_bmad-output/implementation-artifacts/5-1-smoke-evidence/`.

**Why this is lead-driven (not QA-stage):** Rule 7 — sub-agent tool inventory is harness-inherited. Chrome DevTools MCP is mounted at the harness level only; the QA sub-agent does not invoke it. The lead's Chrome DevTools MCP session is the canonical browser-smoke driver per Rule 8 + the Story 5.0 precedent.

## Tests Added

- c:\git\Voyager\web\src\chapters\pale-blue-dot\substates.test.ts (extended — appended cinematic-arc total-duration `describe` block, 4 tests)
- c:\git\Voyager\web\tests\pale-blue-dot-integration.test.ts (extended — appended `__voyagerDebug.paleBlueDot` DEV-gate test, 1 test)

## Decisions

- Closed exactly two coverage gaps (DEV-gate discipline + 180s arc pin) rather than re-adding tests already covered by the dev's 67-test suite. Explicitly considered + rejected: `update` outside-window gate (already covered at integration-test:120) and `ChapterModule` instanceof-shape probe (interface is structural — `implements ChapterModule` compile-time check + dev's `m.spec` + `typeof m.update === 'function'` runtime check is the right level).

## Issues Encountered

- (none)
