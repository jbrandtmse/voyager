# Story 5.1 AC7 — PBD Cold-Load Production Smoke Evidence

_Captured 2026-05-23 by Chrome DevTools MCP against the production build (`web/dist/` served via `vite preview --port 4173`)._

## Context

Story 5.1 introduces the Pale Blue Dot dedicated chapter module per ADR-0014. AC7 is the lead-driven Chrome DevTools MCP smoke that validates the entire spec → resolver → component → DOM pipeline end-to-end against a production build.

## Smoke result

**PASS** — every AC7 assertion satisfied. Single iteration; zero defects.

### Verified invariants (Chrome DevTools MCP `evaluate_script` against built `dist/`)

| Assertion | Expected | Observed | Pass |
|---|---|---|---|
| URL | `/c/pale-blue-dot/` | `/c/pale-blue-dot/` | ✅ |
| `<v-hud-chapter-title>` `<h2>` text (inside `<v-hud>` shadow root) | `Pale Blue Dot` | `Pale Blue Dot` | ✅ |
| `<v-hud-chapter-title>` `<h2>` `data-slug` | `pale-blue-dot` | `pale-blue-dot` | ✅ |
| `<v-chapter-copy>` lede text | `Pale Blue Dot.` (trailing period) | `Pale Blue Dot.` | ✅ |
| `<v-chapter-copy>` paragraph count | 1 | 1 | ✅ |
| `<v-chapter-copy>` body word count | [80, 120] | 100 | ✅ |
| `<v-chapter-copy>` body contains `1990` | true | true | ✅ |
| `<v-chapter-copy>` body contains all 6 targets (Venus, Earth, Jupiter, Saturn, Uranus, Neptune) | true | true | ✅ |
| `<v-chapter-copy>` body contains `/turn/i` (turn-back act per PRD differentiator) | true | true | ✅ |
| `<v-chapter-copy>` article `data-slug` | `pale-blue-dot` | `pale-blue-dot` | ✅ |
| `window.__voyagerDebug` absent in production build (DEV-gate discipline per AC7 + Story 5.0 lesson) | true (absent) | true (absent) | ✅ |
| Console errors / warnings | none | none | ✅ |

### Notes on element querying

The smoke initially queried `document.querySelector('v-hud-chapter-title')` and got `null` — `<v-hud-chapter-title>` is rendered INSIDE the `<v-hud>` shadow root, NOT in the document root. The correct query path is `document.querySelector('v-hud').shadowRoot.querySelector('v-hud-chapter-title').shadowRoot.querySelector('h2')`. This is normal Shadow DOM encapsulation per Story 1.11's HUD architecture — captured here so a future smoke author doesn't repeat the false-negative.

`<v-chapter-copy>` uses light DOM rendering (`createRenderRoot` returns `this`), so its content is direct children, not shadow-encapsulated. Per Story 2.9's design.

### Screenshot

`lead-mcp-pale-blue-dot.png` — captured at the PBD cold-load anchor ET (1990-02-14T00:00:00Z). Shows the chapter title in the top-left HUD (`Pale Blue Dot`) and the deep-space starfield matching V1's actual position 40 AU from the Sun. Chapter copy panel is off-screen-right at this viewport size — its presence + content was confirmed via the DOM probe above.

## Pipeline chain validated

This smoke confirms the production-build pipeline is intact:

1. `URLRouter` parses `/c/pale-blue-dot/` → resolves slug → seeds `ClockManager` at anchor ET.
2. `ChapterDirector` transitions PBD from `out` → `entering` → `held`.
3. `<v-hud-chapter-title>` subscribes to the director, sees `held` for PBD, renders `Pale Blue Dot` (Story 4.10 wire-up + Story 5.0 production-build regression coverage holds).
4. `<v-chapter-copy>` reads `activeChapter.copy` via its `copyForChapter` resolver, sees `PBD_COPY` from the new module (Story 5.1 AC4), renders the lede + paragraph.
5. The PBD module's `update(currentEt)` is wired via main.ts Path A subscriber (AC3) and called only when PBD is in `held` (verified by the absence of console errors that a misfiring per-frame call would surface).

## What this smoke does NOT cover

- Story 5.2's choreographed turn behaviour (substate `turning` and `sweeping_<body>` activation by playback — Story 5.1's `pbdSubstateAt` returns `idle` at the anchor ET, which is the correct substate for cold-load pause; the substate ETs themselves are pinned at unit-test tier).
- Story 5.3's photo-plate compositing (no plates exist yet).
- Story 5.4's L4 Playwright visual regression (PBD baselines remain at Story 4.9's stub).

These are explicit Story 5.1 Out-of-Scope items.
