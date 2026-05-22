# Test Automation Summary — Story 3.0

**Story:** Epic 2 Deferred Cleanup
**Date:** 2026-05-20
**QA agent:** qa-3-0 (epic-cycle-2026-05-20-epic3)

## Scope

The dev-authored test suite (Story 3.0) covers AC1–AC10 at three tiers:

- **Bake-side (Python, pytest):**
  - `bake/tests/test_ck_inventory_bus_id.py` — 4 regression tests locking V1/V2/PBD
    bus_id mapping plus a source-level tripwire against re-introducing the
    fragile substring match (AC1).
  - `bake/tests/test_bake_defense.py` — updated `REQUIRED_RECIPES` to include
    `ck-inventory` and `fk-inventory` (AC3).
  - `bake/src/validate_l1.py` — `_furnish_kernels` narrowed to skip `ck` (AC2,
    not directly tested — the absence is observable through the existing L1
    validation suite passing unchanged because L1 doesn't query CKs via
    `spkgeo`).
- **Web-side primitives (TypeScript, vitest + happy-dom):**
  - `web/src/primitives/slider-keyboard.test.ts` — 12 unit tests covering the
    APG Slider contract (Home/End/Arrows/Shift+Arrows + clamping + lazy value
    read + start/end ordering) independent of any consumer.
  - `web/src/primitives/listbox-keyboard.test.ts` — 16 unit tests covering the
    APG Listbox contract (Home/End/Arrows/Enter/Space/Escape + propagation
    defence + zero-option handling) independent of any consumer.
- **Web-side first-paint (TypeScript, vitest + happy-dom):**
  - `web/tests/first-paint-dispose-cleanup.test.ts` — 9 tests covering
    embed + non-embed + cross-mode dispose lifecycle for AC6.

This QA stage fills the gaps where a primitive-only unit test or a
consumer-only unit test would miss a regression at the AC4 primitive ↔
consumer seam, plus two AC6 edge cases the dev tests did not cover:

- **AC4-I1 slider-keyboard ↔ scrubber wire-up** — verifies the refactored
  scrubber still routes keyboard input through `clockManager.scrubTo()`
  AND emits `voyager:scrub` with `source=keyboard`. The dev's primitive
  unit tests verified the primitive's `onChange` callback; the consumer's
  unit tests pre-date the refactor and continue to pass unchanged. This
  QA tier verifies the seam itself in case the primitive options change
  in a future story.
- **AC4-I2 listbox-keyboard ↔ chapter-index wire-up** — verifies the
  refactored chapter-index still binds the full Listbox contract, including
  the case dev's consumer tests did NOT cover: **Space activates the focused
  option**. The pre-refactor consumer test exercised Enter but not Space;
  the AC4 extraction promoted the Space-activate contract from "not
  explicitly tested at component tier" to "covered by the primitive AND
  the integration wire-up tests this file contributes".
- **AC4-I2 propagation defence at integration tier** — the listbox-keyboard
  primitive's `stopPropagation()` is the binding mechanism preventing the
  document-level Space-toggle-play listener (Story 1.10) from firing when
  Space activates a listbox option. QA pins the defence via the full
  `startFirstPaint` boot composition so a future regression that silently
  drops `stopPropagation()` would surface here, not just in the primitive
  unit test.
- **AC6 dispose() idempotency** — dev test #4 ("dispose() is safe after
  the title-card has already auto-removed") covers a partial-mount case;
  this QA test extends to the strict idempotency invariant — `dispose()`
  may be called twice in a row without throwing. Important for callers
  who maintain a `disposed` flag externally and may double-call defensively.
- **AC6 chapterCopy lifecycle** — dev tests do NOT wire a `ChapterDirector`
  so `chapterCopy` stays null. QA exercises the path where the director
  IS wired (chapterCopy mounts) AND `dispose()` removes it. The dev tests
  catch the null-safe path; QA catches the non-null cleanup path.

## Generated Tests

### Integration Tests

- [x] `web/tests/keyboard-primitives-integration.test.ts` — **18 new tests**

  | Suite | Tests | Focus |
  | --- | --- | --- |
  | AC4-I1 slider-keyboard ↔ `<v-timeline-scrubber>` | 8 | ArrowLeft/Right ±1 day, Shift+ArrowLeft/Right ±10 days, Home → MISSION_START_ET, End → MISSION_END_ET, voyager:scrub source=keyboard emit, un-handled-keys no-op |
  | AC4-I2 listbox-keyboard ↔ `<v-chapter-index>` | 6 | Space activates focused option, Space stopPropagation defence vs Space-toggle-play, Escape closes panel, ArrowDown+Enter activates ALL_CHAPTERS[1], End+Enter activates last chapter, un-handled-keys (Tab/ArrowLeft/ArrowRight/letters) no-op |
  | AC6 dispose() defence | 4 | Double-dispose idempotency, chapterCopy removed on dispose when director wired, chapterCopy null-safe path, post-dispose state + re-boot starting clean |

### Coverage Gaps (assessed, not filled)

- **AC1 ck_inventory `_resolve_bus_id` function-call coverage** — *not added*.
  AC1's contract is "no substring fallback; bus-ID resolution is by direct
  field read". The dev's `test_ck_inventory_source_no_longer_uses_substring_match`
  is a source-level tripwire that is stronger than a function-call coverage
  test would be: a future refactor that re-extracts the lookup into a helper
  named `_resolve_bus_id` would not break the field-read invariant, but a
  refactor that re-introduces substring matching anywhere in the file
  fails the tripwire. The proposed function-call coverage test would be
  redundant against a less-precise behaviour.
- **AC2 `_furnish_kernels` "ck excluded" pytest** — *not added*. The CK
  furnish set narrowing has no observable behaviour change in L1 validation
  (L1 doesn't query CKs); a positive assertion would be a source-level
  string grep that has nothing to lock except "the string `'ck'` is not in
  the priority dict literal", which is fragile and tells the reader
  nothing meaningful. The behavioural verification is the L1 validation
  suite passing unchanged after the refactor — which the dev's T1.6
  recorded.
- **AC4 slider PageUp/PageDown chapter-level steps** — *not in contract*.
  The lead task description mentioned PageUp/PageDown as "chapter-level
  steps" in the MCP-Probe 1 plan; this is NOT a contract the primitive
  implements (slider-keyboard.ts line 16 — Up/Down arrows are intentionally
  NOT handled either). PageUp/PageDown fall through to the parent keydown
  listener cleanly. The MCP smoke plan below has been corrected to match
  the actual contract. The QA tests verify PageUp/PageDown are no-ops at
  the integration tier (suite 1, "un-handled keys" test).

### Discoverability Verification (Rule 4 / Voyager skill rules on_complete)

The new file `web/tests/keyboard-primitives-integration.test.ts`:

- **Lives under `web/tests/`** — the project's vitest config (`web/package.json`
  scripts.test = `vitest run --passWithNoTests`) defaults to scanning all
  `*.test.ts` under the working dir, no explicit include/exclude in
  `vite.config.ts`. New file picked up by default.
- **Uses `// @vitest-environment happy-dom`** — the project convention for
  DOM-touching tests (mirrors `first-paint-dispose-cleanup.test.ts`,
  `chapter-index-integration.test.ts`, all other web/tests/ files).
- **Standard `describe`/`it` from `vitest`** — no `.skip`, no `.todo`,
  no `xfail`/`@skip` markers.
- **Verified**: `cd web && npm test -- --run` → **2062 pass** (up from
  dev's 2044 baseline, +18 new tests in this file). Test files: **111**
  (up from 110). Duration delta: ~0.3 s.

## Test Baselines (post-QA tier)

| Tier | Before (dev baseline) | After (QA tier) | Delta |
| --- | --- | --- | --- |
| Web vitest (`cd web && npm test -- --run`) | 2044 pass / 110 files | **2062 pass / 111 files** | **+18 tests, +1 file** |
| Bake fast (`cd bake && uv run pytest -q -m "not slow"`) | 266 pass / 3 skipped | 266 pass / 3 skipped | unchanged (no bake QA additions) |
| Web typecheck (`npm run typecheck`) | clean | clean | unchanged |
| Web lint (`npm run lint`) | 5 pre-existing warnings, 0 new | 5 pre-existing, 0 new | unchanged |

## Chrome DevTools MCP Smoke — Lead-Executed Plan (AC4 + AC6)

Per voyager-skill-rules.md Rule 3 (per-story smoke evidence) and Rule 8
(Chrome DevTools MCP is the canonical browser-smoke driver post-Story-1.16),
this stage is the **binding browser-evidence gate** for Story 3.0. The QA
tier authors the plan; the lead executes the MCP probes per ADR-0010 Layer 1
(sub-agent MCP propagation unreliable — Rule 7).

Story 3.0 touches `web/src/` (first-paint.ts, two primitives, two components)
so the MCP stage is **required**, not skipped. The probes below cover
AC4 (primitives in real-browser keyboard handling) and AC6 (dispose lifecycle
in real-browser DOM), which are the two ACs where happy-dom coverage has
inherent blind spots (real keyboard-event-bubble semantics across shadow
roots, real `document.querySelector` after a real custom-element teardown).

Evidence target directory:
`_bmad-output/implementation-artifacts/3-0-smoke-evidence/`

### MCP-Probe 1 — slider-keyboard primitive at the `<v-timeline-scrubber>` thumb (covers AC4-I1)

1. `mcp__chrome-devtools-mcp__navigate_page` → `http://localhost:5173/`
   (dev server root, no query params — the mission-variant scrubber paints
   on the homepage by default).
2. `mcp__chrome-devtools-mcp__wait_for` → wait for `v-timeline-scrubber`
   to be present (`document.querySelector('v-timeline-scrubber')` returns
   non-null) and the title-card auto-dissolve to complete (~1.5 s).
3. `mcp__chrome-devtools-mcp__take_snapshot` → capture the accessibility
   tree; confirm the scrubber's thumb is `role="slider"` with
   `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`,
   `aria-label="Mission timeline"`, and `tabindex="0"`.
4. `mcp__chrome-devtools-mcp__evaluate_script` → focus the thumb:
   `document.querySelector('v-timeline-scrubber').shadowRoot.querySelector('.thumb').focus()`.
5. `mcp__chrome-devtools-mcp__press_key` (or `evaluate_script` dispatching
   `KeyboardEvent`) → **sequence**: `Home`, `End`, `ArrowLeft` ×5,
   `ArrowRight` ×5, `Shift+ArrowLeft`, `Shift+ArrowRight`. After each key,
   read `__voyagerDebug.clockManager.simTimeEt` (or the thumb's
   `aria-valuenow` attribute) and assert it matches the per-key contract:
   - `Home` → simTimeEt === MISSION_START_ET (-705844751.817…)
   - `End` → simTimeEt === MISSION_END_ET (~1924992007.184…)
   - `ArrowLeft` × 5 from MISSION_END_ET → simTimeEt === MISSION_END_ET − 5×86400
   - `ArrowRight` × 5 → returns to MISSION_END_ET (clamped at the top)
   - `Shift+ArrowLeft` from some interior position → −10×86400 from prior
   - `Shift+ArrowRight` → +10×86400 from prior
   - **PageUp / PageDown** are NOT handled by the primitive (corrected from
     lead's task description); the assertion is that pressing them does
     NOT change simTimeEt — they fall through to the document's native
     scroll behaviour cleanly. The QA integration suite already pins this
     at the vitest tier; the MCP probe confirms the real-browser shape.
6. `mcp__chrome-devtools-mcp__take_screenshot` → capture the scrubber
   thumb position after the keyboard interaction sequence; save to
   `3-0-smoke-evidence/ac4-i1-slider-keyboard-after-sequence.png`.
7. `mcp__chrome-devtools-mcp__list_console_messages` → assert no errors
   (only the Lit dev-mode banner and any pre-allow-listed warnings — see
   `1-16-smoke-evidence/` console expectations for the canonical
   allow-list shape).

**Acceptance:** All assertions above pass; screenshot shows the thumb at
the expected position; console clean.

### MCP-Probe 2 — listbox-keyboard primitive at `<v-chapter-index>` (covers AC4-I2)

1. `mcp__chrome-devtools-mcp__navigate_page` → `http://localhost:5173/`.
2. `mcp__chrome-devtools-mcp__wait_for` → wait for the chapter-index toggle
   button to render (`document.querySelector('v-chapter-index')` non-null).
3. `mcp__chrome-devtools-mcp__press_key` → press `M` at document level to
   open the chapter index panel. (The global shortcut handler in
   `v-chapter-index.ts:586` owns this.)
4. `mcp__chrome-devtools-mcp__take_snapshot` → capture the accessibility
   tree of the now-open panel; confirm:
   - The `[role="listbox"]` element is present and has
     `aria-label="Mission chapters"`.
   - Exactly one option has `tabindex="0"` (the focused index — typically
     the active chapter or index 0 if none is active).
   - All 11 chapter options are present as `role="option"` children.
5. `mcp__chrome-devtools-mcp__evaluate_script` → focus the listbox:
   `document.querySelector('v-chapter-index').shadowRoot.querySelector('[role="listbox"]').focus()`
   (or click the focused option to ensure focus is inside the listbox).
6. Keyboard interaction sequence (per `press_key` or scripted KeyboardEvent
   dispatch on the listbox element):
   - `ArrowDown` ×3 → `focusedIndex` advances to index 3; assert the option
     at index 3 has `tabindex="0"` and `__voyagerDebug.chapterDirector`
     state has NOT changed (focus movement does NOT activate).
   - `ArrowUp` ×1 → `focusedIndex` back to 2.
   - `Home` → `focusedIndex` → 0.
   - `End` → `focusedIndex` → 10 (last option).
   - `Enter` → activates the focused option. Assert
     `__voyagerDebug.clockManager.simTimeEt === ALL_CHAPTERS[10].anchorEt`
     AND `__voyagerDebug.clockManager.playing === false` (scrubTo pauses).
     The panel SHOULD close as a side effect (assert
     `document.querySelector('v-chapter-index').open === false`).
   - Re-open the panel with `M` and navigate to a different chapter. Press
     `Space` (instead of Enter). Assert the Space-activates-option contract:
     same observable effect as Enter, AND `playing` stayed false
     (`stopPropagation` defence — the document-level Space-toggle-play
     listener must NOT have flipped `playing` to true between the activate
     and the scrubTo). This is the integration-tier defence the QA vitest
     test pins; the MCP probe confirms in the real browser where
     `composed: true` KeyboardEvents cross shadow-roots.
   - Re-open the panel with `M`. Press `Escape`. Assert the panel closes
     AND the focused option's chapter is NOT activated
     (`clockManager.simTimeEt` unchanged from the prior Space activation).
7. `mcp__chrome-devtools-mcp__take_screenshot` → capture the panel open
   state at one stage (e.g. after the Home key, before Enter), save to
   `3-0-smoke-evidence/ac4-i2-listbox-keyboard-panel-open.png`.
8. `mcp__chrome-devtools-mcp__list_console_messages` → console clean.

**Acceptance:** All listbox keyboard contract paths execute as expected,
Space-activates-option works without flipping play state (stopPropagation
defence verified in a real browser), screenshot shows the panel open
with the right option focused, console clean.

### MCP-Probe 3 — dispose() lifecycle in a real browser (covers AC6) — lower priority

1. `mcp__chrome-devtools-mcp__navigate_page` → `http://localhost:5173/`.
2. `mcp__chrome-devtools-mcp__wait_for` → boot complete (
   `document.querySelector('v-timeline-scrubber')` non-null AND
   `document.querySelector('v-chapter-index')` non-null AND
   `document.querySelector('v-help-overlay')` non-null).
3. `mcp__chrome-devtools-mcp__evaluate_script` → count baseline:
   ```js
   ({
     scrubber: document.querySelectorAll('v-timeline-scrubber').length,
     playButton: document.querySelectorAll('v-play-button').length,
     speedMultiplier: document.querySelectorAll('v-speed-multiplier').length,
     hud: document.querySelectorAll('v-hud').length,
     chapterIndex: document.querySelectorAll('v-chapter-index').length,
     helpOverlay: document.querySelectorAll('v-help-overlay').length,
     chapterCopy: document.querySelectorAll('v-chapter-copy').length,
   })
   ```
   Each count MUST equal 1.
4. `mcp__chrome-devtools-mcp__evaluate_script` → invoke dispose:
   `window.__voyagerDebug.dispose()` (or whichever debug surface the
   dev-mode harness exposes for first-paint teardown). If no such
   surface is exposed in dev mode, falling back to
   `location.reload({ forceReload: true })` is acceptable but does not
   exercise the same code path — note the divergence in the evidence file.
5. `mcp__chrome-devtools-mcp__evaluate_script` → re-count: each
   `querySelectorAll('v-*').length` MUST equal 0.
6. `mcp__chrome-devtools-mcp__evaluate_script` → re-init via
   `__voyagerDebug.reinit()` if available; else `location.reload()`.
7. After re-init, re-count: each element MUST again equal exactly 1
   (no accumulation, mirroring the vitest AC6 contract in a real browser).
8. `mcp__chrome-devtools-mcp__list_console_messages` → console clean.

**Acceptance:** Real-browser DOM-query confirms `dispose()` removes ALL
mounted elements (the AC6 contract); re-init does not accumulate stale
elements. **Note:** this probe is *lower priority* because the AC6 unit
tests under happy-dom already cover the same DOM-query semantics; the
MCP probe is defense-in-depth for the case where a real browser surfaces
a teardown order issue happy-dom misses (e.g., a real event listener
that holds a reference preventing GC and keeps a custom element alive
even after `.remove()`).

### Lead-Execution Annotation

The MCP smoke stage above is **executed by the LEAD**, not the QA agent.
Per voyager-skill-rules.md Rule 7 (sub-agent MCP propagation is best-effort
under `/epic-cycle`) and ADR-0010 Layer 1 (the lead's tool inventory is the
binding channel for browser-MCP smokes), the QA agent's job is to author
the plan above; the lead executes it before approving Story 3.0 to `done`.

Evidence captured during lead execution should be saved to
`_bmad-output/implementation-artifacts/3-0-smoke-evidence/` (screenshots,
optionally a `mcp-session-log.md` summarising the probe outputs +
assertions). The directory is created on first probe; the code-reviewer
references it when verifying the per-story smoke evidence exit criterion.

## Coverage

- **AC1 (bake ck_inventory bus_id):** unit + source-tripwire (dev). No QA
  addition (the dev coverage exceeds the proposed redundant function-call
  test).
- **AC2 (validate_l1 ck exclusion):** observable through existing L1 suite
  passing unchanged (dev). No QA addition.
- **AC3 (REQUIRED_RECIPES + ck-inventory / fk-inventory):** unit (dev). No
  QA addition.
- **AC4 (primitives extracted):**
  - Primitive unit tests (dev) — 12 + 16.
  - Consumer unit tests (pre-existing) — pass unchanged.
  - **QA integration tier — 14 new tests** at the primitive ↔ consumer
    seam, plus the MCP-Probe 1 + MCP-Probe 2 smoke plans for real-browser
    verification.
- **AC5 (planning artifact amendment):** documentation-only, no test surface.
- **AC6 (dispose() removes all mounted elements):**
  - Unit tests (dev) — 9 cases under happy-dom.
  - **QA integration tier — 4 new tests** for idempotency + chapterCopy
    paths, plus MCP-Probe 3 smoke plan for real-browser verification.
- **AC7 (close-and-strike-through):** documentation-only.
- **AC8 (deferred-work.md routing section):** documentation-only.
- **AC9 (Epic 2 retro action items):** documentation-only.
- **AC10 (test suites green; no regressions):** verified via the test
  baseline table above.

## Next Steps

- **Lead** — execute the Chrome DevTools MCP smoke plan above before
  approving Story 3.0 to `done`. Save evidence to
  `_bmad-output/implementation-artifacts/3-0-smoke-evidence/`.
- **Code reviewer** — verify per-story smoke evidence is captured (Rule 3
  exit criterion); flag as HIGH if absent.
- **Story 3.0** — once smoke evidence is captured, transition
  `review → done` in sprint-status.yaml.
