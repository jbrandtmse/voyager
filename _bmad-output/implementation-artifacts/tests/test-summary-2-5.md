# Test Automation Summary — Story 2.5

**Story:** `?embed=true` Chrome-less Mode
**Date:** 2026-05-20
**QA agent:** qa-2-5 (epic-cycle-2026-05-20)

## Scope

The dev-authored test suite (Story 2.5) covers AC1–AC7 at three tiers:

- `web/src/services/embed-mode-state.test.ts` — 14 unit tests for
  `parseEmbedParam` strict-boolean variants + `EmbedModeState`
  immutability (AC1).
- `web/src/services/url-sync.test.ts` § "Story 2.5 AC4 — URLSync
  embed=true preservation" — +10 unit tests covering every URLSync
  writeback API (`writeEtImmediate`, `writeEtThrottled`,
  `writeChapterPushState`, `writeChapterReplaceState`,
  `writeHomeReplaceState`, unknown-slug redirect, hash-fragment
  ordering).
- `web/tests/embed-mode-first-paint.test.ts` — 13 tests for AC2
  (conditional `<v-chapter-index>` mount-skip; simulation surface
  still mounts) + AC3 (M / 1..9 NO-OPs; Space still toggles play).
- `web/tests/url-router-qa-gaps.test.ts` § "Story 2.5 — `?embed=true`
  preservation through chapter + home writebacks" — 5 router-driven
  tests REPLACING the Story 2.4 drop pin (push, back-then-forward,
  cruise revert, baseline embedEnabled=false).

This QA stage fills cross-cutting gaps the dev suite does not
exercise:

- **Full first-paint composition at `?embed=true`** — the dev tests
  exercise ONE seam at a time (URLSync writes alone, or first-paint
  mount-skip alone). The QA tier boots the FULL stack
  (`EmbedModeState` × real `URLSync` × real `ClockManager` × real
  `ChapterDirector` × real `URLRouter` × real first-paint
  composition) at a `?embed=true` URL and verifies the wire-up —
  catches a future regression where one seam was updated but
  another was not.
- **End-to-end URL preservation sweep** — boot at `/?embed=true`,
  click a marker (chapter-jump CustomEvent) → URL becomes
  `/c/<slug>?t=<iso>&embed=true`; free-scrub within the chapter via
  `writeEtImmediate` and the throttled `writeEtThrottled` path →
  every replaceState write carries `embed=true`; popstate
  back/forward → URL retains `embed=true` throughout. The
  url-router-qa-gaps test exercises the chapter writes but not
  the throttled `?t=` writes from a free-scrub gesture; this QA
  file closes that gap.
- **Negative parse cases at boot composition** — the unit test file
  enumerates `parseEmbedParam` rejections (`1`, `yes`, `TRUE`, etc.)
  but does not verify that a mixed-case URL leads to first-paint
  MOUNTING the chapter-index toggle (because the parsed value is
  false). QA pins that contract at the composition level for
  `?embed=tRUE`, `?embed=TRUE`, `?embed=1`, `?embed=yes`,
  `?embed=` (empty), and `/` (no param).
- **Keyboard isolation in embed mode (orphan-listener safety)** —
  AC3 assertion that pressing M / 1..9 from `document.body` when
  the chapter-index element is NOT in the DOM produces no error,
  no `chapter-jump` dispatch, no `aria-expanded` change anywhere.
  Includes a baseline-parity test confirming that the non-embed
  composition DOES expose an `[aria-expanded]` button inside the
  chapter-index shadow root — without this baseline the embed
  assertion would be trivially true.
- **AC2 invariant defense in depth** — explicit checks that
  `querySelectorAll('v-chapter-index')` returns zero across both
  the host and `document`; explicit anti-`display:none` check
  pinning that the implementation uses `appendChild`-skip rather
  than a post-mount CSS hide.
- **MCP smoke probe plan for Integration AC8** — lead-executed in
  Chrome DevTools MCP (Rule 3 + Rule 6 + Rule 7), documented
  inline at the bottom of `web/tests/embed-mode-qa-gaps.test.ts`.

## Generated Tests

### `web/tests/embed-mode-qa-gaps.test.ts` (NEW)

24 vitest tests organized into 5 describe blocks:

1. **Story 2.5 — full first-paint composition at `?embed=true`** (4
   tests)
   - mounts simulation surface but NOT chapter-index
   - cold-load with no chapter and no `?t=` produces no URL writes
   - deep-link `/c/v1-jupiter?t=<iso>&embed=true` initializes the
     full stack with embed enabled
   - debug surface contract: `EmbedModeState.enabled` read-only
2. **Story 2.5 AC4 — end-to-end URL preservation sweep** (6 tests)
   - marker click → `/c/<slug>?t=<iso>&embed=true`
   - free-scrub `writeEtImmediate` writes all carry `embed=true`
   - throttled `writeEtThrottled` write carries `embed=true`
   - push → push → back → forward keeps `embed=true` on every URL
   - director-driven boundary `replaceState` preserves `embed=true`
   - cruise-gap home revert preserves `embed=true`
3. **Story 2.5 AC1 — negative parse cases at full-stack boot** (7
   tests)
   - `?embed=tRUE` / `?embed=TRUE` / `?embed=1` / `?embed=yes` /
     `?embed=` (empty) all leave chapter-index mounted
   - `/` (no param) leaves chapter-index mounted
   - `parseEmbedParam` strict-boolean rejection of 13 reject
     variants + the single `?embed=true` accept
4. **Story 2.5 AC3 — keyboard isolation + orphan-listener safety**
   (4 tests)
   - pressing M in embed mode: no `[aria-expanded]` anywhere
   - pressing M / 1..9 in embed mode: no chapter-jump events
   - pressing M / A / ? / 1..9: no throw
   - baseline parity: non-embed mode DOES expose an
     `[aria-expanded]` in chapter-index shadow root
5. **Story 2.5 AC2 — chrome elements wholly absent (composition
   tier)** (3 tests)
   - `querySelectorAll('v-chapter-index')` zero matches anywhere
   - no element with `display: none` or `[hidden]` for
     v-chapter-index (CSS hide path is NOT used)
   - `firstPaint.chapterIndex === null` in the handle

### Chrome DevTools MCP smoke (Integration AC8 — lead-executed)

Documented inline at the bottom of
`web/tests/embed-mode-qa-gaps.test.ts`. Covers AC1 (embedMode
flag), AC2 (chrome NOT in DOM), AC3 (M / A / ? / digit NO-OP),
AC4 (URL preservation through marker click + popstate
back-then-forward), AC6 (touch scrub preserves embed=true), and
AC1 negative case (`?embed=tRUE` mounts chapter-index normally).
Evidence path:
`_bmad-output/implementation-artifacts/2-5-smoke-evidence/`.

No `initScript` shim needed (Rule 6, post-Story-1.16).

## Verification

- `cd web && npm test -- --run` → **1610 passing** (1586 baseline +
  24 new from this file).
- `npm run typecheck` → clean.
- `npm run lint` → clean (5 pre-existing warnings; 0 new).

## Coverage matrix

| AC  | Dev surface                            | QA gap-fill                                              |
| --- | -------------------------------------- | -------------------------------------------------------- |
| AC1 | embed-mode-state.test.ts (14)          | full-stack negative parse cases (7) + read-only contract |
| AC2 | embed-mode-first-paint.test.ts (mount) | composition-tier whole-absence + anti-display:none       |
| AC3 | embed-mode-first-paint.test.ts (keys)  | full-stack `[aria-expanded]` orphan check + baseline     |
| AC4 | url-sync.test.ts (+10 unit)            | end-to-end push/throttle/replace/director/home sweep     |
| AC4 | url-router-qa-gaps.test.ts (+5)        | throttled write path closure (not in router pin)         |
| AC5 | docs/url-contract.md (dev)             | n/a — documentation, not test surface                    |
| AC6 | (smoke evidence — lead MCP)            | documented MCP probe sequence                            |
| AC7 | dev-side run (1546 → 1586)             | QA-side run (1586 → 1610)                                |
| AC8 | (smoke evidence — lead MCP)            | documented MCP probe sequence + DEV surface contract     |

## Decisions

- **Test pattern mirrored from `url-router-qa-gaps.test.ts`.** A
  single `bootFullStack()` helper composes real
  `EmbedModeState`/`URLSync`/`ClockManager`/`ChapterDirector`/
  `URLRouter`/`startFirstPaint` instances — matching `main.ts`'s
  wire-up minus `RenderEngine`. Tests against the actual wire-up
  catch the class of bug Epic 1 retrospective surfaced (services
  correct in isolation, broken when composed).
- **`<v-chapter-index>` shadow-DOM `[aria-expanded]` baseline.**
  The query for `[aria-expanded]` must walk into the shadow root —
  it is not in the light DOM. The baseline test awaits
  `chapterIndex.updateComplete` before asserting, since Lit
  renders the toggle button asynchronously.
- **MCP smoke sequence proposed (lead-executed).** Probe order is
  setup → AC1+AC2 read-state → AC3 keyboard NO-OP comparison
  (pre/post snapshot) → AC4 marker-click → back-forward → AC6
  touch scrub via `mcp__chrome-devtools-mcp__emulate` (mobile
  viewport) → AC1 negative case (`?embed=tRUE`). All assertions
  use the existing `__voyagerDebug` surface — no new dev hooks
  required.
- **axe-core deferred to Story 6.4.** Per the dev's Risk
  Mitigation Audit. The MCP smoke does NOT include axe-core
  probes; that belongs in the dedicated 6.4 harness work.
