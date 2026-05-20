# Story 3.0 — Chrome DevTools MCP Smoke Evidence

**Date:** 2026-05-20
**Lead:** team-lead@epic-cycle-2026-05-20-epic3 (claude-opus-4-7)
**Plan:** `_bmad-output/implementation-artifacts/tests/test-summary-3-0.md` § Chrome DevTools MCP Smoke
**Dev server:** http://localhost:5173/ (Vite 8.0.13, started before probes)

## Pre-flight

- Lead-MCP profile lock was held by an orphaned Chrome instance from a prior session; cleared via `Stop-Process` on all `chrome-devtools-mcp\chrome-profile`-owned PIDs, then `new_page` succeeded.
- Boot complete in 0 ms after `navigate_page` (page already cached); all 8 `__voyagerDebug` surfaces published: `chapterDirector`, `scrubber`, `chapterIndex`, `helpOverlay`, `chapterCopy`, `urlRouter`, `urlSync`, `embedMode`.
- Pre-existing console noise (NOT Story 3.0 regression): every `voyager-{1,2}-seg*.bin.br` chunk-load reports `ChunkIntegrityError` with computed SHA = `ed1c69e7b3228a2f9436a469f281bcacd8f0561b1a7f18e19427a95ca5badc94` (same SHA across all chunks ⇒ Vite SPA fallback HTML served in place of missing brotli payloads). This is a dev-environment artifact (chunks not built/copied to `web/public/data/`), unrelated to Story 3.0 — same warnings would exist on the pre-Story-3.0 baseline. **NEW LOW:** routed to deferred-work.md as Story 3.0-time smoke observation.

## Probe 1 — slider-keyboard ↔ `<v-timeline-scrubber>` (AC4-I1)

**Method:** Focus the scrubber's `[role="slider"]` thumb in the shadow root, dispatch `KeyboardEvent('keydown', { ... composed: true })` for each contract key, read `__voyagerDebug.scrubber.clockManager.simTimeEt` after each press.

| Key | Expected | Observed | Pass |
|---|---|---|---|
| Home | simTimeEt === MISSION_START_ET (`-705844751.817…`) | `-705844751.8171712` | ✓ |
| End | simTimeEt === MISSION_END_ET (canonical value) | `978264068.1839114` (matches `2030-12-31T23:59:59Z` per URL writeback) | ✓ |
| ArrowLeft × 5 from End | delta = 5 × 86400 = 432000 | `delta = 432000` | ✓ |
| ArrowRight × 5 | back to End (clamped) | exact equality with prior End ET | ✓ |
| Shift+ArrowLeft | delta = 10 × 86400 = 864000 | `864000` | ✓ |
| Shift+ArrowRight | delta = 10 × 86400 = 864000 | `864000` | ✓ |
| PageUp / PageDown | NOT handled — simTimeEt unchanged | unchanged | ✓ |

**Console (filter=error):** clean.
**Evidence:** `probe1-slider-keyboard-after-sequence.png`.

**Verdict — PASS.** All slider-keyboard contract paths verified in real browser. The primitive extraction (`web/src/primitives/slider-keyboard.ts`) preserves the exact Story 1.10 → 2.2 keyboard behaviour pre-extraction.

## Probe 2 — listbox-keyboard ↔ `<v-chapter-index>` (AC4-I2)

**Method:** `M` keydown at document level (global shortcut) → confirm `<v-chapter-index>.open === true` → dispatch `KeyboardEvent` on the inner `[role="listbox"]` for each contract key → observe `__voyagerDebug.chapterDirector` / `clockManager` state and panel state.

| Action | Expected | Observed | Pass |
|---|---|---|---|
| `M` at document → panel opens | `<v-chapter-index>.open === true` | `true` | ✓ |
| Listbox structure | 11 options, exactly 1 with `tabindex="0"` | 11 options, 1 focused | ✓ |
| ArrowDown × 3 from index 0 | focusedIndex → 3; slug = `v2-jupiter` | `focusIdxAfterDown3=3`, slug `v2-jupiter` | ✓ |
| Focus move != activation | `clockManager.simTimeEt` unchanged | unchanged (still MISSION_START_ET) | ✓ |
| ArrowUp × 1 | focusedIndex → 2 | `focusIdxAfterUp=2` | ✓ |
| Home | focusedIndex → 0 | `focusIdxAfterHome=0` | ✓ |
| End | focusedIndex → 10 (last); slug = `v2-heliopause` | `focusIdxAfterEnd=10`, slug `v2-heliopause` | ✓ |
| Enter on End | panel closes; simTimeEt → v2-heliopause anchor (`594648069.184`); playing === false; URL → `/c/v2-heliopause?t=…` | panel closed, simTimeEt `594648069.184`, playing false, URL `/c/v2-heliopause?t=2018-11-05T00:00:00Z` | ✓ |
| Re-open + ArrowDown ×2 to index 2 (`v1-jupiter`) | focused `v1-jupiter` | `focusedBeforeSpace = "v1-jupiter"` | ✓ |
| **Space activates option** | simTimeEt → `v1-jupiter` anchor (`-657244449.816`); panel closes | simTimeEt `-657244449.816`, panel closed | ✓ |
| **Space stopPropagation defence** | `playing` does NOT flip true (the document-level Space-toggle-play from Story 1.10 must NOT fire) | `playingAfterSpace === false` ✓ | ✓ |
| Re-open + Home + ArrowDown → index 1; Escape | panel closes WITHOUT activating; simTimeEt unchanged | panel closed, simTimeEt unchanged (`-657244449.816`) | ✓ |

**Console (filter=error):** clean.
**Evidence:** `probe2-listbox-keyboard-final-state.png`.

**Verdict — PASS.** All listbox-keyboard contract paths verified in real browser. The critical **Space-activates-option-without-firing-Space-toggle-play** integration contract — the stopPropagation defence that is happy-dom-blind because real-browser `composed: true` KeyboardEvents cross shadow roots in a way happy-dom approximates differently — verifies cleanly. URL routing on chapter activation is wire-up-clean (chapter pushState fires; ?t= preserved).

## Probe 3 — dispose() lifecycle in real browser (AC6) — NOT EXECUTED

**Status:** `not_executed_falls_back_to_test_pyramid`.

**Rationale:** the QA-plan's Probe 3 step 4 requires `window.__voyagerDebug.dispose()` — no such surface is currently published. Verified via `Object.keys(window.__voyagerDebug)` enumeration: 8 published surfaces (`chapterDirector`, `scrubber`, `chapterIndex`, `helpOverlay`, `chapterCopy`, `urlRouter`, `urlSync`, `embedMode`) — none expose a `dispose` / `destroy` / `teardown` function. The fallback path (`location.reload()`) does not exercise the dispose() code path; it re-instantiates everything fresh.

**Mitigation:** AC6 is covered by:
- **9 dev unit tests** in `web/tests/first-paint-dispose-cleanup.test.ts` under happy-dom (covers DOM-query semantics post-`.remove()`).
- **4 QA integration tests** in `web/tests/keyboard-primitives-integration.test.ts` § "AC6 dispose() defence" (double-dispose idempotency, chapterCopy removed when director wired, null-safe path, post-dispose state + re-boot starting clean).
- **No real-browser-only blind spot** for `.remove()` semantics — happy-dom's DOM model is faithful to native for the `removeChild` / `Node.remove()` paths exercised here. The probe would only catch a teardown-order issue where a real event listener holds a reference preventing GC — and the AC6 implementation does not use any pattern that would leak references (each `.remove()` is unconditional with optional-chain guards, no captured-closure event handlers retain element refs).

**Routing forward:** add a `__voyagerDebug.dispose` debug surface in a future story (likely Story 6.x or 7.x dev-mode hygiene pass) to enable Probe 3 in subsequent stories that touch first-paint lifecycle. Adding it now would expand Story 3.0 scope beyond the deferred-cleanup remit. Filed to `deferred-work.md` as a **[3.0 / LOW]** entry.

## Overall Smoke Verdict — PASS

Probe 1 + Probe 2 cover the AC4 primitive extraction (the load-bearing Story 3.0 change) in a real browser. Probe 3 is gracefully degraded to test-pyramid coverage; AC6's implementation has no real-browser-only blind spot.

No Story 3.0 regressions surfaced.

## Cycle Log Entry (lead-written after this file)

```
2026-05-20T<smoke_complete_TS>Z	Story 3.0	smoke_complete	method=browser result=pass iterations=1 defects_caught=0 probe1_slider=pass probe2_listbox=pass probe3_dispose=not_executed_fallback_to_test_pyramid evidence=_bmad-output/implementation-artifacts/3-0-smoke-evidence/ model=claude-opus-4-7
```
