# Test Automation Summary — Story 2.3

**Story:** `<v-chapter-index>` Listbox + Chapter Jump Keyboard Shortcuts
**Date:** 2026-05-20
**QA agent:** qa-2-3 (epic-cycle-2026-05-20)

## Scope

The dev-authored unit suite (`web/src/components/v-chapter-index.test.ts`,
38 tests) exercises the component in isolation against ad-hoc
`ChapterDirector` + `ClockManager` instances created inline. That covers
each of AC1–AC6 at the component surface. This QA stage fills the
cross-cutting consumer-side gaps that voyager-skill-rules Rules 2/3 + the
Story 2.3 Integration AC8 make load-bearing:

- Real-instance integration: chapter-index × real `ChapterDirector` ×
  real `ClockManager` × real `ALL_CHAPTERS`, composed via
  `startFirstPaint` exactly the way `main.ts` does.
- End-to-end shortcut propagation: digit press → `clockManager.scrubTo` →
  director sees the new ET on next update → chapter-index re-renders
  with `aria-current="true"` on the new chapter.
- Subscription + listener cleanup on disconnect (no leak after element
  removal — both the director subscription AND the global keydown
  listeners).
- Cross-handler keydown isolation: shadow-root-walking input guard,
  Ctrl/Alt/Meta modifier suppression, Space-key coexistence with the
  Story 1.10 play-toggle.
- `main.ts` + `first-paint.ts` wire-up shape (static-source check)
  pinning the DEV-only `__voyagerDebug.chapterIndex` debug surface +
  the pre-mount-binding order.

## Generated Tests

### Integration Tests

- [x] `web/tests/chapter-index-integration.test.ts` — 26 new tests
  - 4 tests — `startFirstPaint` wires the chapter index to ClockManager + ChapterDirector
  - 5 tests — global digit shortcut → real clock → real director propagation (+ chapter-jump payload contract symmetry with Story 2.2)
  - 2 tests — Enter on focused option propagates end-to-end (Listbox path)
  - 4 tests — keydown isolation (shadow-root input walk, Ctrl/Alt/Meta modifier guard, Space-key coexistence, `0` digit inert)
  - 4 tests — disconnect cleanup leak guard (director unsubscribe, global keydown uninstall, click-outside listener detach, mount→remove→mount once-per-press)
  - 7 tests — `first-paint.ts` + `main.ts` wire-up shape (pre-mount-binding order, DEV-only debug surface, visibility lifecycle)

### Chrome DevTools MCP smoke (Integration AC8 — lead-executed)

Per voyager-skill-rules Rule 3 + Rule 7. Documented inline at the bottom
of `web/tests/chapter-index-integration.test.ts`. 11 MCP probe calls
covering AC1 through Integration AC8:

1. `mcp__chrome-devtools-mcp__navigate_page` — open `http://localhost:5173`
   (no initScript/brotli shim needed post-Story-1.16, Rule 6).
2. `mcp__chrome-devtools-mcp__evaluate_script` — pre-condition the DEV
   surface is live and the panel is closed at boot. **AC1, AC2.**
3. `mcp__chrome-devtools-mcp__take_snapshot` — accessibility tree with
   the panel closed. Evidence: `2-3-smoke-evidence/01-panel-closed-a11y.txt`. **AC1 ARIA.**
4. `mcp__chrome-devtools-mcp__press_key key=m` + `evaluate_script` —
   panel opens via `M`; assert 11 options in `ALL_CHAPTERS` order,
   `launch-v2` has `aria-current="true"` at boot. **AC2, AC3.**
5. `mcp__chrome-devtools-mcp__take_screenshot` — slide-in visual
   evidence. Evidence: `2-3-smoke-evidence/02-panel-open.png`. **AC2.**
6. `mcp__chrome-devtools-mcp__take_snapshot` — accessibility tree with
   panel open; assert listbox semantics + focus-trap initial seat.
   Evidence: `2-3-smoke-evidence/03-panel-open-a11y.txt`. **AC3, AC5.**
7. `mcp__chrome-devtools-mcp__press_key key=ArrowDown` + `evaluate_script` —
   second option carries `tabindex="0"`, first carries `tabindex="-1"`. **AC4.**
8. `mcp__chrome-devtools-mcp__press_key key=Enter` + `evaluate_script` —
   `__voyagerDebug.chapterDirector.activeChapter.slug === 'launch-v1'`;
   panel closes. **AC4, Integration AC8.**
9. `mcp__chrome-devtools-mcp__take_screenshot` — post-activation visual.
   Evidence: `2-3-smoke-evidence/04-after-enter-launch-v1.png`. **Integration AC8.**
10. `mcp__chrome-devtools-mcp__press_key key=3` + `evaluate_script` —
    `__voyagerDebug.chapterDirector.activeChapter.slug === 'v1-jupiter'`. **AC6, Integration AC8.**
11. `mcp__chrome-devtools-mcp__list_console_messages` — console-clean
    assertion; the only allow-listed message is the Lit dev-mode banner.
    Evidence: `2-3-smoke-evidence/05-console.json`.

## Verification

- `cd web && npx vitest run` — **1477 pass** (+26 from baseline 1451).
- `cd web && npm run typecheck` — clean.
- `cd web && npm run lint` — baseline preserved (5 pre-existing warnings,
  0 new).

## Coverage

- AC1 (toggle button)        → dev unit + MCP probes 2, 3
- AC2 (slide-in panel)       → dev unit + MCP probes 4, 5
- AC3 (listbox + 11 options) → dev unit + integration + MCP probes 4, 6
- AC4 (keyboard nav)         → dev unit + integration + MCP probes 7, 8
- AC5 (focus trap on open)   → dev unit + MCP probe 6
- AC6 (global digit)         → dev unit + integration + MCP probe 10
- AC7 (test suites green)    → 1477 vitest pass + typecheck clean + lint baseline preserved
- **Integration AC8 (end-to-end wire-up)** → integration tests cover the consumer-side propagation chain (digit → clock → director → aria-current); MCP probes 4, 8, 10 are the binding browser-evidence gate per voyager-skill-rules Rule 3 + Rule 7

## Next Steps

- Lead executes the Chrome DevTools MCP smoke stage above and stores
  evidence under `_bmad-output/implementation-artifacts/2-3-smoke-evidence/`.
- Story-cycle progresses to code review.
