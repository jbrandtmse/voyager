# Story 2.5 — Integration AC8 Verification (R3 Mitigation)

**Date:** 2026-05-20

## Probe Results

| AC | Expected | Observed | Result |
|---|---|---|---|
| AC1 boot state | `__voyagerDebug.embedMode.enabled === true` | `enabled: true` | ✓ |
| AC2 chrome-absent | `__voyagerDebug.chapterIndex === null` AND no `<v-chapter-index>` in DOM | `chapterIndexDebug: null`, `chapterIndexInDom: false` | ✓ |
| AC2 accessibility tree | "Open chapter index" toggle ABSENT (compare to Story 2.3 smoke where uid=5_27 was present) | not present in this snapshot | ✓ |
| AC3 M-key no-op | activeElement unchanged + no console error | activeBefore=BODY, activeAfter=BODY, errorCaught=null | ✓ |
| AC3 digit-key no-op | URL unchanged after pressing "3" | URL identical before+after | ✓ |
| AC4 marker click preserves embed | `/c/v2-saturn?t=...&embed=true` (push) | `/c/v2-saturn?t=1981-08-26T00:00:00Z&embed=true` | ✓ |
| AC4 browser back preserves embed | `/c/v1-jupiter?t=...&embed=true` | `/c/v1-jupiter?t=1979-03-05T12:05:00Z&embed=true` | ✓ |

## R3 Mitigation Satisfied

Epic 2 R3 mandate (a11y + keyboard preservation + axe-core OR MCP keyboard smoke):
- ✅ Keyboard shortcuts targeting absent chrome (M, 1-9) correctly NO-OP (no listener attached because v-chapter-index.connectedCallback never ran)
- ✅ HUD ARIA live regions present in the snapshot (`heading level=2 live=polite`, `status live=polite`)
- ✅ Mission timeline slider + Play button + Speed multiplier all retain their ARIA roles
- ⏸️ axe-core deferred to Story 6.4 per dev-2-5 decision (no new dep for one assertion)

## URL Contract Closure

The Story 2.4 qa-2-4 pin ("embed=true currently DROPPED on chapter writebacks") is now CLOSED. The `?embed=true` parameter survives:
- pushState on marker click ✓
- popstate on browser back ✓
- (replaceState on free scrub verified at integration tier in tests)

## Verdict

**PASS.** Story 2.5 ships. Epic 2 R3 mitigation satisfied (modulo axe-core deferral to 6.4). Chrome-less mode is production-ready for kiosk embedding.
