# Story 6.4 — AC8 Lead-side smoke evidence

**Date:** 2026-05-24
**Story:** 6.4 — axe-core CI Expansion and Manual Accessibility Test Layer
**Smoke runner:** Story 6.4 dev (agent-tier execution)

## AC8 Probe Sequence

### (a) `cd web && npm test a11y` — component-state checks PASS

Per Story 6.4 AC1 (component-state matrix) — see `probe-a-vitest-a11y.txt`.

- **Result:** **14 test files / 60 tests PASS** in 6.91s.
- **Coverage:** the 14 component-state matrix files exercise each documented state per the AC1 required matrix (`<v-title-card>`, `<v-timeline-scrubber>` mission + detail, `<v-play-button>`, `<v-speed-multiplier>` at 7 decade stops + focused + at-bounds, `<v-hud>` + 6 children, `<v-chapter-index>`, `<v-help-overlay>`, `<v-chapter-copy>`, `<v-attitude-indicator>`, `<v-audio-toggle>`, `<v-about-page>`, `<v-attribution-panel>`).
- **Impact-tier gate:** critical + serious violations FAIL; moderate + minor are advisories logged to stdout via `console.warn`.

### (b) `cd web && npm run build && npm run test:a11y` — route axe checks PASS

Per Story 6.4 AC2 (route matrix). See `probe-b-route-axe.txt`.

- **Result:** **16 / 16 routes PASS** in 1.5 minutes wall-clock.
- **Routes covered:** `/`, `/about`, 11 chapter slugs (`launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`), and 3 `/unsupported.html` variants (default, `?reason=webgl2`, `?reason=brotli`).
- **NFR-M4 budget:** 1.5 min vs. 15-min L4/L5 cap → 90% headroom.
- **Advisories surfaced:** `landmark-one-main`, `page-has-heading-one`, `region` (all moderate). Per AC2 these are reported as warnings but do NOT block the build. Disposition documented in the first manual run record under Findings + remediation.

### (c) Manual checklist files present — `manual-test-checklist.md` and `manual-test-runs/2026-05-24.md` PASS

Per Story 6.4 AC3 + AC4. See `probe-c-checklist-files.txt`.

- **`docs/accessibility/manual-test-checklist.md`** — exists; contains 9 enumerated test passes (Keyboard-only, VoiceOver, NVDA, TalkBack, Color blindness, Forced-colors, Reduced-transparency, Reduced-motion cross-check, Photosensitive-epilepsy audit). Each pass carries explicit PASS criteria, evidence-capture instructions, and a sign-off schema.
- **`docs/accessibility/manual-test-runs/2026-05-24.md`** — exists; captures the first run with the explicit agent-tier AGENT-PASS / DEFERRED partition required by AC4. Operator-tier passes (2, 3, 4, 5, 6, 7) are explicitly DEFERRED with the gap callout the AC mandates.

### (d) Focus-trap diagnostic surface lands — PASS via primitive extraction

Per Story 6.4 AC6 sub-bullet 3. See `probe-d-focus-trap-warn.txt`.

- **Result:** The literal `console.warn(...'focus-trap activation failed'...)` lines moved from inline duplication in `<v-help-overlay>` and `<v-chapter-index>` to the shared primitive at `web/src/primitives/dialog.ts` (Rule 9 third-consumer extraction). Both consumers wire their `componentName` so the warn output reads `[v-help-overlay] focus-trap activation failed: ...` or `[v-chapter-index] focus-trap activation failed: ...` exactly as the AC mandates.
- **Verification:** `grep -rn "focus-trap activation failed"` returns the primitive + the test that pins the diagnostic contract; `grep -rln "createDialogFocusTrap"` confirms both consumers route through the primitive.

## Aggregate verdict

All four AC8 probes PASS. The story's 9 ACs are satisfied:

- **AC1** (component-state matrix): +60 vitest tests at `web/tests/a11y/components/`, all PASS.
- **AC2** (route matrix): +16 Playwright tests at `web/tests/a11y/routes.spec.ts`, all PASS.
- **AC3** (manual checklist): `docs/accessibility/manual-test-checklist.md` authored.
- **AC4** (first run record + format): `docs/accessibility/manual-test-runs/2026-05-24.md` committed with the AC4-required schema + AGENT-PASS / DEFERRED partition.
- **AC5** (photosensitive-epilepsy audit): per-surface verdict table in the run record; aggregate PASS (zero `@keyframes`, zero `setInterval` in components, every transition one-shot).
- **AC6** (deferred-work cleanup): [1.7/LOW] + [2.7/LOW] + [2.8/LOW] all closed (strike-throughs in `deferred-work.md`); `primitives/dialog.ts` extracted per Rule 9 third-consumer threshold.
- **AC7** (CI budget compliance): L3 a11y stage 6.91s (vs. 5-min budget); L4 a11y route stage 1.5 min (vs. 15-min L4/L5 budget). CI workflow file updated with the new `l4-a11y-routes` job.
- **AC8** (integration AC = this smoke sequence): PASS.
- **AC9** (test sweep + ADR compliance): 3734 vitest pass / 10 skipped (+65 net new tests vs. 3669 baseline); typecheck clean; lint baseline preserved. ADR-0010 (Playwright per AC2), ADR-0025 (APG primitives — `primitives/dialog.ts` now extracted per AC6 + Rule 9), ADR-0027 (LF line endings) verified.

## Rule 5 incidents (NFR tripwire amendments)

Two critical a11y violations surfaced during the axe-core expansion. Both were genuine pre-existing code defects (not unimplementable ACs), so the appropriate response was to FIX them in-place — not amend an artifact:

1. **`<v-timeline-scrubber>` slider `aria-valuenow="<ISO>"`** — axe-core flagged the ISO string as a critical `aria-valid-attr-value` violation. ARIA spec requires `aria-valuenow` to be numeric. **Fix:** `aria-valuenow` now carries the raw ET seconds; the ISO form moved to `aria-valuetext` (which screen readers announce in preference anyway). Three existing tests updated to match. Documentation block at `v-timeline-scrubber.ts` line 92 updated.

2. **`<v-hud-instruments>` `role="row"` without grid parent** — axe-core flagged this as critical `aria-required-parent`. The row was semantically a labelled inline list, not a grid row. **Fix:** swapped `role="row"` → `role="group"` (the correct ARIA pattern for a labelled grouping of inline items).

3. **`<v-help-overlay>` + `<v-chapter-index>` aria-hidden focusable content** — when closed, both surfaces carried `aria-hidden="true"` on the panel but the close button / option list inside remained focusable. axe-core flagged this as serious `aria-hidden-focus`. **Fix:** added the `inert` attribute as the second-half of the aria-hidden contract. Same for the detail-variant `<v-timeline-scrubber>` host's closed state.

4. **`<v-timeline-scrubber>` detail variant inert sync** — paired with #3; updated `connectedCallback` + `syncDetailFromDirector` to manage `inert` synchronously alongside `aria-hidden`.

None of these required artifact amendments — they were code defects that the new axe-core gate caught at the unit-test tier. Documenting here so the code-review pass can spot-check the contract.

## Files produced

- `_bmad-output/implementation-artifacts/6-4-smoke-evidence/probe-a-vitest-a11y.txt` — vitest summary.
- `_bmad-output/implementation-artifacts/6-4-smoke-evidence/probe-b-route-axe.txt` — Playwright route summary.
- `_bmad-output/implementation-artifacts/6-4-smoke-evidence/probe-c-checklist-files.txt` — file-presence verification.
- `_bmad-output/implementation-artifacts/6-4-smoke-evidence/probe-d-focus-trap-warn.txt` — diagnostic-surface verification.
- `_bmad-output/implementation-artifacts/6-4-smoke-evidence/smoke-summary.md` — this file.
