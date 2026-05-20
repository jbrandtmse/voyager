# Story 2.9: Heliopause Text Cards + Instrument-Shutoff HUD Integration

**Epic:** 2
**Status:** review
**Date created:** 2026-05-20
**Source:** `_bmad-output/planning-artifacts/epics.md` § Story 2.9

## User Story

As a visitor scrubbing through the long cruise,
I want the V1 (2012-08-25) and V2 (2018-11-05) heliopause crossings to appear as text-card chapters with explanatory copy, and the HUD to reflect the historical instrument-shutoff schedule as instruments go offline across the decades,
So that the bass-note elegy is felt and FR29, FR30 (text-card content), FR35 are operational.

## Consumes / Touches

- **Story 2.1 ChapterDirector** — subscribe to v1-heliopause / v2-heliopause activation
- **Story 1.10 ClockManager** — read current ET for instrument-shutoff state
- **Story 1.11 `<v-hud-instruments>`** — fill the placeholder (currently renders nothing)
- **Story 2.2 markers** — V1H / V2H markers already exist; clicking jumps + URL updates (Story 2.4); chapter copy appears via this story's `<v-chapter-copy>` infrastructure
- **`MISSION_FACTS.md`** — NEW canonical source for primary citations (launch dates, encounter dates, heliopause dates, instrument shutoff dates)

## Acceptance Criteria

### AC1 — Heliopause chapter text-cards via `<v-chapter-copy>`

- **GIVEN** a minimal `<v-chapter-copy>` Light DOM right-side panel infrastructure is introduced (full implementation deferred to Epic 4 for other chapters; this story implements ONLY the V1H / V2H text-card path)
- **WHEN** the simulation enters the V1 heliopause window (~2012-08-25 ±90 days)
- **THEN** a text-card chapter copy appears with the lede "V1 heliopause." followed by ~80–120 words of hand-written prose describing the cosmic-ray spike and solar-wind drop signatures that mark the boundary crossing (per MISSION_FACTS.md sourcing)
- **AND** the same behavior applies for V2's 2018-11-05 heliopause
- **AND** the trajectory line continues past the boundary unchanged (no special visualization — the chapter copy provides the meaning, not a 3D effect)
- **AND** under `prefers-reduced-motion: reduce`, the copy appears as an instant cut (per Story 1.7 `--v-duration-base` token rules)

### AC2 — MISSION_FACTS.md canonical source committed

- **GIVEN** `MISSION_FACTS.md` is committed at the project root (or under `docs/`; author's choice)
- **WHEN** I open it
- **THEN** the file documents primary-source citations for:
  - V1 launch date (1977-09-05) — NASA
  - V2 launch date (1977-08-20) — NASA
  - All six encounter closest-approach datetimes (V1 Jupiter 1979-03-05 12:05; V1 Saturn 1980-11-12 23:46; V2 Jupiter 1979-07-09 22:29; V2 Saturn 1981-08-26; V2 Uranus 1986-01-24 17:59; V2 Neptune 1989-08-25 03:56)
  - Both heliopause crossing datetimes (V1 2012-08-25; V2 2018-11-05)
  - Historical instrument shutoff dates per spacecraft (ISS, UVS, PLS, LECP)
- **AND** each fact has a source citation (NASA press release, NAIF documentation, or peer-reviewed publication)
- **AND** the V1H / V2H chapter copy prose lives in either MISSION_FACTS.md (as a quotation source) or in TypeScript template literals per ADR-0021 — the latter is cleaner; pick that

### AC3 — `<v-hud-instruments>` instrument-shutoff readout

- **GIVEN** `<v-hud-instruments>` was a placeholder in Story 1.11 (rendered nothing)
- **WHEN** the simulation is at any ET
- **THEN** the component reads the per-spacecraft instrument-shutoff schedule from a NEW TypeScript module that mirrors MISSION_FACTS.md (canonical shutoff dates)
- **AND** renders two rows in the existing HUD bottom-left corner:
  - `V1 ISS · UVS · PLS · LECP`
  - `V2 ISS · UVS · PLS · LECP`
- **AND** active instruments use `--v-color-fg-muted`
- **AND** instruments shut off at the current ET render with `text-decoration: line-through` in `--v-color-fg-quiet`
- **AND** as the simulation crosses each instrument's historical shutoff date, the corresponding instrument visibly transitions from active to strikethrough (the bass-note elegy made legible)

### AC4 — V1H / V2H marker click integration

- **GIVEN** the V1H / V2H markers on the scrubber (Story 2.2)
- **WHEN** I click the V1H or V2H marker
- **THEN** the simulation jumps paused to the heliopause anchor date (existing Story 2.2/2.4 behavior)
- **AND** the chapter copy text-card appears (this story's new behavior)
- **AND** the URL updates to `/c/v1-heliopause` or `/c/v2-heliopause` (Story 2.4 wires this)

### AC5 — No camera transition for heliopause crossings

- **GIVEN** the heliopause chapters have no body-centered camera framing or 3D-scene change (textual per PRD)
- **WHEN** the simulation crosses the boundary at any speed
- **THEN** the existing heliocentric camera framing is preserved
- **AND** no view-frame transition fires (those are Epic 4's encounter machinery)
- **AND** the chapter copy fades in/out at the window boundaries per `<v-chapter-copy>` infrastructure

### AC6 — Tests green

- `cd web && npm test -- --run` passes (baseline 1893 + new tests)
- `npm run typecheck` clean
- `npm run lint` clean (5 pre-existing warnings OK)

## Integration ACs (per voyager-skill-rules.md Rule 2)

### Integration AC7 — End-to-end heliopause + instrument-shutoff in real browser

- **GIVEN** the dev server running with Voyager loaded
- **WHEN** the lead-side Chrome DevTools MCP smoke:
  1. Cold-loads `/c/v1-heliopause` → confirms `<v-chapter-copy>` text-card with "V1 heliopause." lede appears
  2. Cold-loads `/c/v2-heliopause` → confirms V2 text-card appears
  3. Cold-loads `/` (boot at MISSION_START) → confirms `<v-hud-instruments>` shows TWO rows with V1 + V2 instrument lists, ALL instruments active (no strikethrough since 1977 predates all shutoffs)
  4. Cold-loads `/c/v2-neptune?t=2020-01-01T00:00:00Z` → confirms several instruments now strike-through (post-2010s shutoffs)
  5. Confirms trajectory line is uninterrupted through heliopause crossings (visual inspection or DOM check that no boundary-crossing 3D effects fire)
- **THEN** all probes pass

## Files to Modify

| File | Action | Reason |
|---|---|---|
| `web/src/components/v-chapter-copy.ts` | NEW | Minimal Light DOM right-side panel — only V1H/V2H text-cards in this story |
| `web/src/components/v-chapter-copy.test.ts` | NEW | Unit tests |
| `web/src/components/v-hud-instruments.ts` | UPDATE | Fill the placeholder; read shutoff schedule + render 2 rows with strikethrough state |
| `web/src/components/v-hud-instruments.test.ts` | UPDATE | New tests for shutoff state transitions |
| `web/src/data/mission-facts.ts` | NEW | TypeScript module mirroring MISSION_FACTS.md — shutoff dates per spacecraft × instrument |
| `web/src/data/mission-facts.test.ts` | NEW | Parity test: TS module dates match MISSION_FACTS.md |
| `web/src/data/heliopause-copy.ts` | NEW | TypeScript template-literal copy strings for V1H + V2H per ADR-0021 |
| `web/src/data/heliopause-copy.test.ts` | NEW | Sanity (word count 80-120) |
| `web/src/boot/first-paint.ts` | UPDATE | Mount `<v-chapter-copy>`; ensure `<v-hud-instruments>` is wired with ClockManager + mission-facts |
| `web/src/main.ts` | UPDATE | DEV `__voyagerDebug.chapterCopy` |
| `MISSION_FACTS.md` | NEW | Canonical source of primary citations |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | UPDATE | Final 2-9 → done flip |

## Tasks / Subtasks

- [x] **T1 (AC2): MISSION_FACTS.md + TS mirror**
  - [x] Author `MISSION_FACTS.md` with launch / encounter / heliopause / instrument-shutoff dates and citations
  - [x] Author `web/src/data/mission-facts.ts` with TS constants matching the doc
  - [x] Parity test: `web/src/data/mission-facts.test.ts` reads MISSION_FACTS.md (via Node fs) and asserts the TS constants line up — R4-style mitigation against drift

- [x] **T2 (AC3): `<v-hud-instruments>` instrument-shutoff readout**
  - [x] Update `web/src/components/v-hud-instruments.ts` from placeholder to a real component
  - [x] Read shutoff schedule from `web/src/data/mission-facts.ts`
  - [x] Subscribe to ClockManager (or read simTimeEt per frame via the existing HUD pattern from Story 1.11) — uses per-frame tick() forwarded by `<v-hud>` (mirrors `<v-hud-date>` / `<v-hud-distance>` pattern)
  - [x] Render two rows: "V1 ISS · UVS · PLS · LECP" and "V2 ISS · UVS · PLS · LECP"
  - [x] Apply `text-decoration: line-through` + `--v-color-fg-quiet` to shut-off instruments based on current ET vs shutoff dates
  - [x] Active instruments: `--v-color-fg-muted`
  - [x] Test the transition: at ET < shutoff = active; at ET > shutoff = strikethrough

- [x] **T3 (AC1): `<v-chapter-copy>` minimal component**
  - [x] Author `web/src/components/v-chapter-copy.ts` as a Light DOM right-side panel
  - [x] Subscribe to ChapterDirector: on transition to v1-heliopause or v2-heliopause `held` state, render the corresponding text-card
  - [x] Author copy strings in `web/src/data/heliopause-copy.ts` (TypeScript template literals per ADR-0021)
  - [x] Fade-in/out via CSS animation governed by `--v-duration-base` (reduced-motion = instant) — implemented in `web/src/styles/chapter-copy.css`

- [x] **T4 (AC4 + AC5): Verify marker integration**
  - [x] No new code needed — Story 2.2 markers + Story 2.4 URL routing already fire chapter-jump → ClockManager.scrubTo → ChapterDirector → `<v-chapter-copy>` reacts via its subscription
  - [x] Add an integration test that simulates a marker click and verifies the text-card appears — `web/tests/heliopause-text-card-integration.test.ts`

- [x] **T5 (AC6): Verification**
  - [x] Run tests + typecheck + lint
  - [x] Confirm vitest baseline 1893 + new tests — final count 1968 (+75)

## Dev Notes

### Architecture

- `<v-chapter-copy>` is a MINIMAL implementation for V1H / V2H. Other chapters (encounter chapters in Epic 4) will extend the same component with body-centered text-cards. This story should leave the component shape extensible (e.g., a `chapterSlug` prop the parent sets) rather than hard-coding only the heliopause case.
- ADR-0021 (chapter copy in TS template literals not external .md) — heliopause copy lives in `web/src/data/heliopause-copy.ts` as `export const V1_HELIOPAUSE_COPY = \`...\`;`.
- `MISSION_FACTS.md` is the source-of-truth for HUMAN-READABLE source citations. The TS module `mission-facts.ts` is the runtime source. A parity test enforces consistency.

### Previous Story Intelligence

- Story 1.11 `<v-hud-instruments>` is currently a placeholder with no content. Fill it in here.
- Story 2.1 ChapterDirector subscribe pattern: `chapterDirector.subscribe((event) => { if (event.to === 'held') ... })`. v1-heliopause / v2-heliopause slugs from ADR-0001.
- Story 2.2 markers: clicking V1H / V2H already fires chapter-jump CustomEvent → ClockManager.scrubTo → next frame → ChapterDirector enters `held` → this story's `<v-chapter-copy>` subscriber fires.

### NFR considerations

- A11y: text-card content is editorial prose; ensure heading hierarchy + readable contrast. axe-core remains deferred to 6.4.
- Performance: instrument-shutoff comparison is O(8) instruments per frame; trivial.

### Voyager skill rules

- Rule 2: consumer of ChapterDirector + ClockManager + ADR-0001 slug list.
- Rule 3: browser smoke applies.
- Rule 5: if MISSION_FACTS data has interpretation issues (e.g., some shutoff dates are approximate "circa 2007"), document the date you chose and the rationale.

## References

- `_bmad-output/planning-artifacts/epics.md` § Story 2.9
- `docs/adr/0021-chapter-copy-in-ts-template-literals-not-external-md.md`
- `docs/adr/0001-url-contract-as-public-api.md` (v1-heliopause / v2-heliopause slugs)
- `web/src/services/chapter-director.ts` (ChapterDirector subscribe pattern)
- `web/src/components/v-hud-instruments.ts` (Story 1.11 placeholder)
- `_bmad/custom/voyager-skill-rules.md`

## Dev Agent Record

### Implementation Plan

T1 (MISSION_FACTS.md + TS mirror) → T2 (`<v-hud-instruments>` shutoff readout) → T3 (`<v-chapter-copy>` + heliopause copy) → T4 (integration test for marker → text-card chain) → T5 (verify). Executed sequentially; each task validated with its own focused vitest run before the full sweep at the end.

### Completion Notes

- **T1:** `MISSION_FACTS.md` authored at repo root with primary-source citations for launches, six planetary encounters, two heliopause crossings, and the V1/V2 × ISS/UVS/PLS/LECP shutoff schedule. `web/src/data/mission-facts.ts` mirrors the doc with frozen records and pre-computed ET thresholds. Parity test (`mission-facts.test.ts`) reads MISSION_FACTS.md via `node:fs` and asserts every date string appears verbatim in the doc — the R4-style mitigation against drift between citation surface and runtime constants. Also includes cross-spec consistency checks against the existing chapter specs (`launch-v1.ts`, `v1-heliopause.ts`, etc.) so a future change to any anchor surfaces here.

- **T2:** `<v-hud-instruments>` now renders two rows ("V1 ISS · UVS · PLS · LECP", "V2 ISS · UVS · PLS · LECP") with the strikethrough state driven by per-frame `tick(et)` forwarded through `<v-hud>` — mirrors the `<v-hud-date>` / `<v-hud-distance>` pattern (visible DOM mutation outside Lit reactivity per architecture line 424). Active instruments use `--v-color-fg-muted`; shut-off use `text-decoration: line-through` + `--v-color-fg-quiet`. CSS `transition` governed by `--v-duration-base` so reduced-motion collapses the colour fade to instant via global.css. Seed render reads the wired ClockManager so the HUD never flashes "all active" before the first onFrame tick.

- **T3:** `<v-chapter-copy>` is a Light-DOM Lit element (`createRenderRoot` returns `this`) consistent with `<v-about-page>`'s editorial-typography pattern. Subscribes to ChapterDirector; on `to === 'held'` for v1-heliopause / v2-heliopause it renders the matching copy from `heliopause-copy.ts`; on `from === 'held'` it clears. Late-mount seeds from `director.activeChapter`. Styles in `web/src/styles/chapter-copy.css` (right-side fixed panel, `min(36ch, 40vw)` width, opacity transition via `--v-duration-base` honoring prefers-reduced-motion through tokens). Copy strings live in TS template literals per ADR-0021; ~110 words V1, ~110 words V2; mentions cosmic-ray + plasma/solar-wind signatures + magnetic-field rotation per AC1.

- **T4:** No new component code — the marker-click → chapter-jump → URLRouter → ClockManager.scrubTo → ChapterDirector chain was already wired in Stories 2.2/2.4. The integration test `tests/heliopause-text-card-integration.test.ts` covers the consumer-side wire-up: first-paint mounts `<v-chapter-copy>` and wires the director; scrubbing into V1H/V2H windows surfaces the right copy; scrubbing through an encounter chapter leaves the panel empty (Epic 4 owns encounter copy). AC5 verified by asserting NO `viewframe` / `viewframe-transition` / `camera-frame-change` event fires when the director transitions into a heliopause window — the chapter-copy appearance is the only observable effect.

- **T5:** vitest 1968 pass (+75 from 1893 baseline); typecheck clean; lint baseline preserved (5 pre-existing warnings, 0 new).

### Wire-up summary

- `web/src/boot/first-paint.ts` — appends `<v-chapter-copy>` when a `ChapterDirector` is provided; exposes `chapterCopy` on `FirstPaintHandle`. Mounts even in embed mode (chapter copy is editorial content, NOT chrome per the Story 2.5 split).
- `web/src/main.ts` — imports `chapter-copy.css`; publishes `__voyagerDebug.chapterCopy` for the lead-driven Chrome DevTools MCP smoke (Integration AC7).
- `web/src/components/v-hud.ts` — forwards `tick(et)` into `<v-hud-instruments>` so the shutoff strikethrough state updates per frame; wires `clockManager` down so the instruments seed render reflects the cold-load ET.

### File List

- **NEW:** `MISSION_FACTS.md`
- **NEW:** `web/src/data/mission-facts.ts`
- **NEW:** `web/src/data/mission-facts.test.ts`
- **NEW:** `web/src/data/heliopause-copy.ts`
- **NEW:** `web/src/data/heliopause-copy.test.ts`
- **NEW:** `web/src/components/v-chapter-copy.ts`
- **NEW:** `web/src/components/v-chapter-copy.test.ts`
- **NEW:** `web/src/styles/chapter-copy.css`
- **NEW:** `web/tests/heliopause-text-card-integration.test.ts`
- **MODIFIED:** `web/src/components/v-hud-instruments.ts` (placeholder → instrument-shutoff readout)
- **MODIFIED:** `web/src/components/v-hud-instruments.test.ts` (rewritten for AC3 contract)
- **MODIFIED:** `web/src/components/v-hud.ts` (forward tick to instruments; wire clock down)
- **MODIFIED:** `web/src/boot/first-paint.ts` (mount `<v-chapter-copy>` + expose handle)
- **MODIFIED:** `web/src/main.ts` (import chapter-copy.css; publish chapterCopy debug handle)
- **MODIFIED:** `web/tests/hud-defense.test.ts` (Story 1.11 stub assertion superseded by Story 2.9 fill)
- **MODIFIED:** `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-20 — Story 2.9 implemented: heliopause text-cards (`<v-chapter-copy>`) + instrument-shutoff HUD (`<v-hud-instruments>`); MISSION_FACTS.md canonical citation surface authored; vitest 1968 pass (+75); typecheck clean; lint baseline preserved.
