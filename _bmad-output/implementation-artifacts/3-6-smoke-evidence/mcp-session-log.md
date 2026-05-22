# Story 3.6 — Lead-driven Chrome DevTools MCP smoke evidence

Date: 2026-05-22
Lead model: claude-opus-4-7

## HIGH defect surfaced + auto-resolved inline

Initial smoke at `http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z` showed
`<v-attitude-indicator>` stuck on its placeholder `"ATT ● —"` with
`data-provenance === null`. Root cause: `<v-hud>.attitudeService` is a
plain class field — NOT a Lit `static properties` reactive property — so
when `main.ts` assigns `firstPaintHandle.hud.attitudeService = svc` after
manifest load, Lit's `updated()` does not fire, and the propagation logic
at `v-hud.ts:231-232` that copies the service to the inline indicator
never runs.

The unit + integration tests passed because they set the service BEFORE
first render (synchronous test setup); production sets it AFTER first
render (post-manifest-load async). Classic test-pyramid-vs-smoke gap
that voyager-skill-rules Rule 3 is designed to catch.

**Inline fix:** in `v-hud.ts.tick()`, identity-gate-propagate the service
to the child every tick — `if (att.attitudeService !== this.attitudeService) att.attitudeService = this.attitudeService`. One write per change (no-op once wired);
no churn on the per-frame hot path. Vitest 2322 still passes (+0 regressions).

## Post-fix probe 1 — V1 Jupiter ET (synthesized locally per Story 3.4 local-manifest constraint)

URL: `http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z`

```json
{
  "output_text": "ATT ● Synthesized (HGA Earth-pointing)",
  "data_provenance": "synthesized",
  "aria_label": "Attitude data provenance",
  "aria_live": "polite",
  "ai_attitudeService_set": true
}
```

AC2/AC3 satisfied (display text + reflect attribute). AC6 satisfied
(aria-label + aria-live="polite" present). Local-manifest constraint
applies (Story 3.4 deferred-work `[3.4 / LOW]` — no CK attitude entries
locally → AttitudeService falls through to synthesized for all ETs).

Screenshot: `probe1-v1-jupiter-att-indicator.png`.

## Probe 2 — Cruise ET (1995-01-01)

URL: `http://127.0.0.1:5173/?t=1995-01-01T00:00:00Z`

```json
{
  "output_text": "ATT ● Synthesized (HGA Earth-pointing)",
  "data_provenance": "synthesized"
}
```

Still `'synthesized'` (as expected — both ETs are structurally in the
synthesized regime per the local-manifest state). The indicator survives
the navigation + tick cycle on both probes — consistent state.

Screenshot: `probe2-cruise-att-indicator.png`.

## Console clean

Only the expected Lit dev-mode warn. No Story 3.6-specific errors.

## Summary

**Story 3.6 AC10 verdict: PASS** with one HIGH inline fix.

- `<v-attitude-indicator>` mounted inline with `<v-hud-date>` per AC1.
- Renders "ATT ● Synthesized (HGA Earth-pointing)" in synthesized regime per AC3 (CK regime structurally unverified locally — see Story 3.4 deferred-work).
- aria-label + aria-live="polite" on `<output>` per AC6.
- `data-provenance` reflect attribute correctly set.
- Console clean.

The HIGH fix in `v-hud.ts.tick()` brings the propagation to the per-frame
hot path with identity-gated single-write semantics. This is the 4th
HIGH-class smoke-time defect this Epic 3 has surfaced (Story 3.3: 3
fixes, Story 3.6: 1 fix) — the test pyramid is necessary but not
sufficient lesson holds across the epic.
