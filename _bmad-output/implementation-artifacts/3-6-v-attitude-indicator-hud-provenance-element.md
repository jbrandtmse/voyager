# Story 3.6: `<v-attitude-indicator>` HUD Provenance Element

**Epic:** 3 — Attitude Reconstruction (the Differentiator)
**Status:** review
**Date created:** 2026-05-22
**Source:** epics.md § Epic 3 Story 3.6 (lines 1463–1504); ADR-0013 (Lit 3 no decorators); ADR-0015 (no global store; service-graph DI via constructor injection); ADR-0025 (WAI-ARIA APG patterns); ADR-0026 (TS 6.x strict).

## User Story

As any visitor,
I want a quiet, persistent HUD indicator that tells me whether the spacecraft attitude I'm seeing is CK-reconstructed or synthesized,
So that scientific honesty is felt as register (not as caveats), fulfilling FR19 + UX-DR10 — the "Synthesized (HGA Earth-pointing)" label is the textual companion to Story 3.4's visible articulation, and both must agree.

## Triage Source / Inheritance

- **Story 3.2** introduced `AttitudeService.getBusProvenance(naifId, et): 'ck' | 'synthesized'` and `getPlatformProvenance(...)`. This story consumes `getBusProvenance` for the HUD indicator (the bus provenance is the canonical "what regime is this spacecraft in" answer).
- **Story 1.11** built `<v-hud>` container with sub-components at viewport edges. This story adds `<v-attitude-indicator>` inline with `<v-hud-date>` in the top-right region.
- **Story 1.11 + Story 1.13** established the per-frame HUD tick pattern: `engine.onFrame((et) => { hud.tick(et); })` propagates ET to sub-components. Story 3.6 hooks into this pattern.
- **Active spacecraft selection** is a wrinkle: Epic 4 wires ChapterDirector/ViewFrame to determine which spacecraft is "active" per encounter. Story 3.6 implements the **stub with V1 as the default** and exposes an `activeSpacecraftChanged` event-emitter pattern that Epic 4 hooks up. The stub means: in this story, the HUD always reflects V1's provenance unless explicitly overridden.
- **Color tokens already exist** at `web/src/styles/tokens.css:27-28` — `--v-color-ck = #4a7c4e` (muted forest-green) and `--v-color-synth = #d4a017` (warm gold). No new tokens needed.
- **Embed mode** (Story 2.5): HUD chrome is stripped in embed mode. Story 3.6 follows the existing skip-mount pattern in `first-paint.ts` — `<v-attitude-indicator>` is NOT mounted when `EmbedModeState.embedEnabled === true`.

## Acceptance Criteria

### AC1 — `<v-attitude-indicator>` Lit component renders inline with `<v-hud-date>`

- **GIVEN** the existing `<v-hud>` container from Story 1.11 (`web/src/components/v-hud.ts` + sub-components)
- **AND** the top-right HUD region currently hosts `<v-hud-date>` + `<v-hud-distance>` + `<v-hud-chapter-title>` + `<v-hud-speed>` + `<v-hud-instruments>`
- **WHEN** Story 3.6 ships
- **THEN** a NEW `<v-attitude-indicator>` Lit component is rendered inline with `<v-hud-date>` (the canonical "top-right metadata strip" pattern)
- **AND** the component extends the existing `BaseElement` (or `LitElement` directly per ADR-0013) following the project's `<v-hud-*>` precedent
- **AND** the component is constructed in `<v-hud>` (or first-paint.ts if `<v-hud>` is a Light-DOM consumer) and per-frame tick wires through `engine.onFrame` like the other HUD sub-components

### AC2 — Provenance display: CK regime

- **GIVEN** `AttitudeService.getBusProvenance(activeSpacecraftId, currentEt) === 'ck'`
- **WHEN** the indicator renders
- **THEN** the DOM is structurally:
  ```html
  <output aria-label="Attitude data provenance">
    <span class="att-label">ATT</span>
    <span class="att-dot" style="color: var(--v-color-ck);">●</span>
    <span class="att-value" style="color: var(--v-color-ck);">CK reconstructed</span>
  </output>
  ```
  (exact tags/classes may vary; the load-bearing pieces are: `<output>` element with `aria-label="Attitude data provenance"`, the "ATT" label in `--v-color-fg-quiet`, the dot + value text in `--v-color-ck`)
- **AND** the value text "CK reconstructed" is fully readable INDEPENDENT of color (FR49 / UX-DR no-color-only) — the text is the primary signal; the color is reinforcement
- **AND** the dot is a small filled circle (e.g., `•` Unicode U+2022 or `●` U+25CF) consuming negligible space; if the dot character isn't well-rendered, fall back to a `<span>` with CSS `border-radius: 50%; width: 6px; height: 6px; background: currentColor;`

### AC3 — Provenance display: synthesized regime

- **GIVEN** `AttitudeService.getBusProvenance(activeSpacecraftId, currentEt) === 'synthesized'`
- **WHEN** the indicator renders
- **THEN** the DOM structure mirrors AC2 with: dot + value in `--v-color-synth` (warm gold); value text `"Synthesized (HGA Earth-pointing)"`
- **AND** the text "Synthesized" makes the construction explicit without apology (UX-DR10 honesty register)

### AC4 — Active spacecraft selection (stub default V1; Epic 4 wiring point)

- **GIVEN** Story 3.6 ships before Epic 4's ChapterDirector/ViewFrame active-spacecraft signal is built
- **WHEN** the indicator renders at boot
- **THEN** the default active spacecraft is V1 (NAIF -31) — the chronological lead
- **AND** the component exposes a public `setActiveSpacecraft(naifId: -31 | -32): void` method that Epic 4 will call from ChapterDirector when a chapter transition triggers a view-frame change
- **AND** a DOM `CustomEvent('activeSpacecraftChanged', { detail: { naifId } })` is dispatched on the component when `setActiveSpacecraft` is called — Epic 4 can subscribe via standard DOM event listener for analytics/test hooks
- **AND** Story 3.6 does NOT wire ChapterDirector → indicator (that's Epic 4's responsibility); the stub is the contract this story commits to

### AC5 — Per-frame tick: read provenance + update only on change

- **GIVEN** the indicator is mounted and `<v-hud>` ticks it via `engine.onFrame((et) => { ... })`
- **WHEN** each frame begins
- **THEN** the indicator calls `attitudeService.getBusProvenance(this.activeSpacecraftId, et)`
- **AND** if the returned provenance equals the LAST RENDERED provenance, NO Lit re-render is triggered (avoid 60 Hz reactive-property writes — pin the prev-value in a private field and only update the reactive property on change)
- **AND** if the provenance DIFFERS, update the reactive property; Lit's standard reactive update cycle renders the new state within one frame
- **AND** a unit test pins this contract: spy on the component's `requestUpdate` or `render` count; tick 100× at an ET with stable provenance → ≤ 1 re-render (the initial one); tick 100× at an ET that crosses a CK boundary → exactly 2 re-renders (the boundary transition)

### AC6 — Accessibility: aria-live polite + axe-core clean

- **GIVEN** the component MUST announce provenance changes to screen readers per UX-DR no-color-only encoding
- **WHEN** the provenance flips
- **THEN** the `<output>` element OR its parent has `aria-live="polite"` so screen readers announce the change on the next natural pause (per Story 1.11's announcement-throttling rules — don't announce every per-frame check; only announce on the change itself, which AC5 already enforces by gating re-renders on actual changes)
- **AND** the `<output>` element has `aria-label="Attitude data provenance"` for context
- **AND** when axe-core runs on the component in BOTH states (CK and synthesized), it reports zero violations
- **AND** the visual transition between provenance values uses `--v-duration-base` (200ms; 0ms under `prefers-reduced-motion: reduce` per the global token override) — COLOR shift only, no flashing or attention-grabbing motion

### AC7 — Embed mode skip-mount

- **GIVEN** Story 2.5's embed mode strips HUD chrome
- **WHEN** `EmbedModeState.embedEnabled === true` at boot
- **THEN** `<v-attitude-indicator>` is NOT mounted (the first-paint chrome-mount sequence skips it) — mirrors `<v-hud>`, `<v-help-overlay>`, `<v-chapter-index>`, `<v-attribution-panel>` etc.
- **AND** the existing embed-mode test infrastructure asserts the attitude indicator's absence in embed mode (extend `web/tests/embed-mode-qa-gaps.test.ts` OR `web/tests/first-paint-embed.test.ts` — verify the existing test naming pattern)

### AC8 — Integration AC (Rule 1): indicator ↔ AttitudeService wire-up

This story introduces a service-consuming component. Per voyager-skill-rules.md Rule 1.

- **GIVEN** the boot stack with AttitudeService loaded
- **WHEN** the integration test mounts `<v-hud>` with a stub AttitudeService that returns `'ck'` at one ET and `'synthesized'` at another
- **THEN** ticking the HUD at the first ET shows "CK reconstructed" in the indicator; ticking at the second ET shows "Synthesized (HGA Earth-pointing)"
- **AND** the `<output>` element's `textContent` matches the expected value exactly (cross-checks the no-color-only contract from AC2/AC3)
- **AND** the `activeSpacecraftChanged` event is dispatched when `setActiveSpacecraft(-32)` is called, with `detail.naifId === -32`
- **AND** integration test mounts via happy-dom (existing pattern from `web/tests/v-hud-integration.test.ts` if present)

### AC9 — Test sweep + per-story smoke

- **GIVEN** all AC1–AC8 changes are merged
- **WHEN** the test suite runs
- **THEN** `cd web && npm test -- --run` passes (Story 3.5 baseline = 2255; Story 3.6 adds ~15–25 net new tests across `v-attitude-indicator.test.ts` + integration extensions)
- **AND** typecheck clean; lint baseline 4 warnings preserved
- **AND** lead-driven Chrome DevTools MCP smoke (AC10):
  1. `navigate_page` → `http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z`
  2. `evaluate_script` → assert `document.querySelector('v-attitude-indicator output')?.textContent` includes `"CK"` OR `"Synthesized"`
  3. `take_screenshot` — visual: thin small label inline with the date, semi-prominent color
  4. `navigate_page` → `http://127.0.0.1:5173/?t=1995-01-01T00:00:00Z` (cruise; structurally synthesized)
  5. `evaluate_script` → verify the indicator now shows `"Synthesized"`
  6. `take_screenshot`
  7. `list_console_messages` (filter=error) — clean

### AC10 — Lead-driven Chrome DevTools MCP smoke (per Rule 3 + Rule 8)

Per the AC9 last clause — bundled into AC9's pipeline. Evidence in `_bmad-output/implementation-artifacts/3-6-smoke-evidence/`.

## Integration ACs

See AC8.

## Consumes

- `web/src/services/attitude-service.ts` (Story 3.2) — `getBusProvenance(naifId, et)`.
- `web/src/components/v-hud.ts` (Story 1.11) — the parent container; add `<v-attitude-indicator>` inline with `<v-hud-date>`.
- `web/src/styles/tokens.css` (Story 1.7) — `--v-color-fg-quiet`, `--v-color-ck`, `--v-color-synth`, `--v-duration-base`.
- `web/src/boot/first-paint.ts` (Story 1.9) — embed-mode skip-mount path.
- `web/src/services/embed-mode-state.ts` (Story 2.5) — read `embedEnabled` for AC7.

## Consumed-by (downstream)

- **Epic 4 (ChapterDirector/ViewFrame):** Epic 4's chapter transition handler calls `attitudeIndicator.setActiveSpacecraft(naifId)` when the view-frame changes between V1 and V2. The event-emitter pattern in AC4 is the wiring contract.

## Tasks / Subtasks

- [x] **T1 — Author `web/src/components/v-attitude-indicator.ts`** (AC1, AC2, AC3, AC4, AC5, AC6)
  - [x] T1.1: New file. Extend `BaseElement` (or `LitElement`). Shadow-DOM-scoped CSS via `static styles`. No decorators per ADR-0013.
  - [x] T1.2: Reactive properties (via the project's standard `static properties = { ... }` Lit 3 declaration — NOT decorators): `activeSpacecraftId: -31 | -32`, `provenance: 'ck' | 'synthesized'`.
  - [x] T1.3: `tick(et: number, attitudeService: AttitudeService): void` — read provenance; gate re-render on change (private `prevProvenance` field).
  - [x] T1.4: `setActiveSpacecraft(naifId): void` — update property + dispatch `CustomEvent('activeSpacecraftChanged', {detail: {naifId}, bubbles: true})`.
  - [x] T1.5: Render: `<output aria-label="Attitude data provenance" aria-live="polite">...</output>` with conditional content for CK vs synthesized.
  - [x] T1.6: Styles: `display: inline-flex; gap: var(--v-space-2)`; color via `--v-color-ck` or `--v-color-synth` based on state; transition `color var(--v-duration-base) ease`.

- [x] **T2 — Wire into `<v-hud>` (or first-paint.ts)** (AC1, AC7)
  - [x] T2.1: Inspect `web/src/components/v-hud.ts` to determine where `<v-hud-date>` is rendered; place `<v-attitude-indicator>` inline as a sibling in the same top-right slot.
  - [x] T2.2: Wire the per-frame tick via `<v-hud>`'s existing onFrame propagation pattern.
  - [x] T2.3: In `first-paint.ts`, skip mounting in embed mode (mirror `<v-help-overlay>` and other chrome components).

- [x] **T3 — Wire AttitudeService into the indicator** (AC1, AC5)
  - [x] T3.1: AttitudeService is constructed post-ManifestLoader in main.ts. Pass through to `<v-hud>` (already has EphemerisService — extend the same pattern).
  - [x] T3.2: Document the construction-order dependency: `<v-attitude-indicator>` must NOT call `getBusProvenance` until AttitudeService is non-null (pre-manifest state). Use a null-check + render a placeholder ("ATT —") until non-null.

- [x] **T4 — Unit tests** (AC2, AC3, AC4, AC5, AC6)
  - [x] T4.1: `web/src/components/v-attitude-indicator.test.ts` — render both states; assert DOM contents per AC2/AC3.
  - [x] T4.2: Tick test: spy on `requestUpdate`; 100 ticks at stable provenance → ≤ 1 update; 100 ticks crossing boundary → exactly 2 updates.
  - [x] T4.3: `setActiveSpacecraft` dispatches the custom event.
  - [x] T4.4: aria-live + aria-label attributes present.

- [x] **T5 — Integration test** (AC8)
  - [x] T5.1: `web/tests/v-attitude-indicator-integration.test.ts` (NEW). Mount `<v-hud>` with a stub AttitudeService; tick at CK + synthesized ETs; assert visible text in the `<output>` element.

- [x] **T6 — Embed-mode skip-mount test** (AC7)
  - [x] T6.1: Extend existing embed-mode test (locate in `web/tests/`). Assert `document.querySelector('v-attitude-indicator')` is null when embedEnabled.

- [ ] **T7 — Smoke (AC10)** — lead-driven post-CR.

## Dev Notes

### Architecture & ADR Compliance Touchpoints

- **ADR-0013 (Lit 3 no decorators):** new component uses `static properties = { ... }` declaration.
- **ADR-0015 (no global store):** AttitudeService is constructor-injected via `<v-hud>` reactive property.
- **ADR-0025 (APG patterns):** `<output>` element is the WAI-ARIA-compliant choice for live data display; aria-live="polite" + aria-label provide screen-reader context.
- **ADR-0026 (TS strict, zero `any`):** typed props; AttitudeService's branded return type flows through.

### File-Touch Inventory

**NEW:**
- `web/src/components/v-attitude-indicator.ts`
- `web/src/components/v-attitude-indicator.test.ts`
- `web/tests/v-attitude-indicator-integration.test.ts`

**UPDATED:**
- `web/src/components/v-hud.ts` — render `<v-attitude-indicator>` inline; pass attitudeService prop; tick propagation.
- `web/src/boot/first-paint.ts` — embed-mode skip-mount path.
- `web/src/main.ts` — pass attitudeService into the HUD construction (the existing wire-up extends naturally).
- One of `web/tests/embed-mode-qa-gaps.test.ts` or `web/tests/first-paint-embed.test.ts` (whichever covers embed-mode chrome skip-mount currently) — extend with v-attitude-indicator absence assertion.

### Voyager Skill-Rules

- **Rule 1:** AC8 is the integration AC. Service-consuming component → verify the wire-up via integration test.
- **Rule 3 + Rule 8:** AC10 is the lead-driven Chrome DevTools MCP smoke.
- **Rule 5:** none anticipated.
- **Rule 6:** ADR-0013/0015/0025/0026 honored.
- **Rule 9:** N/A (no slider/listbox keyboard handling).

### Project Context Reference

- BMAD workflow: `_bmad/custom/voyager-skill-rules.md`.
- Story 3.2 reference: `_bmad-output/implementation-artifacts/3-2-attitudeservice-slerp-interpolation-and-synthesized-hga-cruise-attitude.md` § Completion Note 3 (provenance API split into bus + platform).
- Story 1.11 reference (HUD container pattern): `_bmad-output/implementation-artifacts/1-11-v-hud-container-and-hud-sub-components.md`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (lead) for story creation; dev-3-6 (claude-opus-4-7 subagent) for implementation.

### Debug Log References

- Initial Lit class-field shadowing failure (19/25 unit tests red): class-field initializers (`provenance = undefined`, `activeSpacecraftId = -31`, `attitudeService = null`) shadowed Lit's reactive accessors generated by `static properties`. Lit emits a console error directing to lit.dev/msg/class-field-shadowing. Resolved by switching reactive fields to `declare`-only declarations + constructor initialization (matches the pattern in `v-chapter-index.ts:235-262`). Same fix applied to the new `embedEnabled` reactive property on `<v-hud>`.
- Initial embed-skip test asserted `expect(indicator).toBeUndefined()` against `shadowRoot?.querySelector(...)` which returns `null`, not `undefined`. Changed to `expect(indicator ?? null).toBeNull()`.

### Completion Notes List

1. **Component scaffold (T1).** New `<v-attitude-indicator>` lives at `web/src/components/v-attitude-indicator.ts`. Extends `BaseElement` per ADR-0013; declares reactive props via `static properties = { ... }` (NO decorators); reactive fields use `declare` + constructor initialization to avoid Lit class-field shadowing. Renders a single `<output aria-label="Attitude data provenance" aria-live="polite">` with an inline ATT label + dot + value triple. The dot/value colors are driven by `:host([data-provenance='ck'])` / `:host([data-provenance='synthesized'])` selectors so the regime style flips via the host attribute Lit reflects automatically.
2. **Re-render gating (AC5).** A private `prevProvenance` field pins the last rendered provenance; `tick(et)` short-circuits when the new value equals the pin, so 100 ticks at stable provenance triggers zero `requestUpdate` calls (verified by spy in unit test). A regime boundary triggers exactly one `requestUpdate`. The initial `prevProvenance = null` ensures the first successful tick paints out of the "ATT —" placeholder, and `updated()` resets the pin whenever `attitudeService` itself changes so a late wire-up paints correctly.
3. **Active spacecraft stub (AC4).** Default `activeSpacecraftId = -31` (V1). The public `setActiveSpacecraft(naifId)` setter is idempotent (no-op + no event when the value matches), updates the reactive property, clears `prevProvenance`, and dispatches a bubbling+composed `CustomEvent('activeSpacecraftChanged', { detail: { naifId } })`. The composed flag is important — it crosses the shadow boundary so a listener on the host (or document) catches it; Epic 4's ChapterDirector hook is exactly this kind of listener. Story 3.6 does NOT wire ChapterDirector → indicator; that contract is the event-emitter shape.
4. **Embed-mode skip (AC7) — pattern choice.** The story names AC7 as "first-paint chrome-mount sequence skips it". Because the indicator is a `<v-hud>` sub-component (not a sibling), the cleanest skip pattern is to pass `embedEnabled` from first-paint down to `<v-hud>`, which conditionally renders `<v-attitude-indicator>` in its template (`embedEnabled ? null : html\`<v-attitude-indicator>\``). This honors the chrome-skip discipline ("not in the DOM, not `display:none`") while keeping the HUD shell itself (date/distance/speed/instruments — simulation content) mounted in embed mode. Mirrors the existing `<v-chapter-index>` / `<v-help-overlay>` pattern from Story 2.5/2.8 but applied at the inner-component layer rather than at the first-paint appendChild layer.
5. **AttitudeService wire-up order (T3.2).** `<v-hud>` is mounted at first-paint, BEFORE the manifest lands; AttitudeService is constructed in the `ManifestLoader.then(...)` chain in `main.ts`. The indicator handles this gracefully: it renders an "ATT —" placeholder when `attitudeService === null`, `tick(et)` is a no-op in that state, and `updated()` re-baselines `prevProvenance` to null when the service reference flips so the first post-wire-up tick paints immediately.
6. **`<v-hud>` integration.** Added an `attitudeService` reactive-target field on `<v-hud>` (propagated to the inline indicator in `updated()`) and an `embedEnabled` reactive property (declared via `static properties`, initialized in the constructor). `<v-hud>.tick(et)` now also calls `this.attitudeIndicator?.tick(et)` so the indicator pulls provenance on the same frame as date/distance/instruments. `main.ts` assigns `firstPaintHandle.hud.attitudeService = attitudeService` once AttitudeService is constructed.
7. **Test coverage.** Unit tests at `web/src/components/v-attitude-indicator.test.ts` (25 tests covering AC1–AC6 plus disposal/re-mount); integration tests at `web/tests/v-attitude-indicator-integration.test.ts` (8 tests covering AC8 + the AC4 event-bubble contract via the HUD parent + the AC7 embed-mode hud-handle null contract); embed-mode skip-mount tests added to `web/tests/embed-mode-first-paint.test.ts` (5 new tests under the "Story 3.6 AC7" describe block). Full web vitest suite: 2295 pass / 1 skipped / 126 files (+40 from Story 3.5 baseline 2255). Typecheck clean. Lint baseline preserved (4 pre-existing warnings; 0 new).
8. **ADR compliance.** ADR-0013 (Lit 3, no decorators) — confirmed by `static properties = { ... }` + `declare` + constructor init. ADR-0015 (no global store) — AttitudeService is constructor-injected via the `<v-hud>` reactive-target property, flowing from main.ts. ADR-0025 (APG patterns) — `<output>` element with `aria-label` + `aria-live="polite"` per WAI-ARIA live region pattern; no slider/listbox keyboard handling (Rule 9 N/A). ADR-0026 (TS strict, zero `any`) — branded `AttitudeProvenance` flows through; stubs use `as unknown as AttitudeService` only at test boundaries.

### File List

**NEW:**
- `web/src/components/v-attitude-indicator.ts`
- `web/src/components/v-attitude-indicator.test.ts`
- `web/tests/v-attitude-indicator-integration.test.ts`

**UPDATED:**
- `web/src/components/v-hud.ts` — render `<v-attitude-indicator>` inline (conditional on `embedEnabled`); add `attitudeService` + `embedEnabled` reactive-target fields; propagate to indicator in `updated()`; tick the indicator in `tick(et)`; new `attitudeIndicator` shadow-root accessor.
- `web/src/boot/first-paint.ts` — pass `embedEnabled` flag through to `<v-hud>` so the inline indicator's conditional render fires before `connectedCallback`.
- `web/src/main.ts` — assign `firstPaintHandle.hud.attitudeService = attitudeService` after `AttitudeService` is constructed in the `ManifestLoader.then(...)` chain.
- `web/tests/embed-mode-first-paint.test.ts` — new "Story 3.6 AC7" describe block (5 tests) verifying the indicator is NOT in the HUD shadow root in embed mode + IS present otherwise.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `3-6-...` status: ready-for-dev → in-progress → review; cycle log entry appended.

### Change Log

- 2026-05-22 — Story 3.6 implementation: T1–T6 complete; AC1–AC9 satisfied at code/test tier; AC10 (lead-driven Chrome DevTools MCP smoke) remains lead's responsibility per voyager-skill-rules Rule 7.

### Review Findings

_(Filled by code reviewer.)_
