---
id: BUG-002
title: HUD distance values show "— AU" for both V1 and V2 at all timestamps
severity: high
type: rendering / data binding
discovered_during: review-2026-05-23
related_story: 1-11-v-hud-container-and-hud-sub-components
related_epic: epic-1
related_fr: FR34 (HUD shows per-spacecraft distance from Sun in AU)
---

## Summary

`<v-hud-distance>` always renders the placeholder string "— AU" for both V1 and V2, regardless of simulation time.

## Evidence

Tested at three timestamps via the live app at `http://localhost:5173`:

| URL | Date shown | V1 distance | V2 distance |
|---|---|---|---|
| `/` (default) | 1977-08-20 00:00 | `— AU` | `— AU` |
| `/?t=1980-01-01T00:00:00Z` | 1980-01-01 00:00 | `— AU` | `— AU` |
| `/v1-jupiter` (loads as 1977-08-20) | 1977-08-20 00:00 | `— AU` | `— AU` |

Shadow-DOM HTML for `<v-hud-distance>`:

```html
<div class="row">
  <span class="label" aria-hidden="true">V1</span>
  <span class="value" data-body="v1">— AU</span>
</div>
<div class="row">
  <span class="label" aria-hidden="true">V2</span>
  <span class="value" data-body="v2">— AU</span>
</div>
```

The screen-reader live region renders: `"Voyager 1 — AU, Voyager 2 — AU"`.

## Expected (per Story 1.11)

> Two rows render: "V1" + distance from Sun in AU + "AU" suffix, and "V2" + distance from Sun + "AU"; each value uses 2–3 significant figures (e.g., "5.20 AU", "121 AU") with tabular-nums mono.

At 1980-01-01, V1 ≈ 6.6 AU, V2 ≈ 5.7 AU; both should display numeric values.

## Verified prerequisites

- `EphemerisService` is loaded and bodies are at correct SPICE-derived positions in the scene (confirmed: V1 mesh world-position ≈ −9.82×10⁸ km offset → ~6.6 AU; V2 mesh ≈ −8.26×10⁸ → ~5.7 AU at 1980-01-01).
- Other HUD elements driven by ET (date, attitude provenance, speed) update correctly.

So the position data exists; the HUD subscriber is just not wired to it.

## Suspected location

`web/src/components/v-hud-distance.ts` — distance computation/binding to `EphemerisService.getPosition(bodyId, et)` and `length()` not running, or running with a guard that always returns null.

## Impact

- FR34 (per-spacecraft distance from Sun in AU) is not delivered.
- One of the four headline HUD readouts is permanently broken.

## Closure (2026-05-23)

- **Status:** STILL_ACTIVE → FIXED
- **Closing story:** 4.10
- **Triage evidence:** Live smoke confirmed `hudDistValues = ["— AU", "— AU"]`
  at `/c/v1-jupiter`. Root cause: `<v-hud>.ephemerisService` is a plain class
  field (not a Lit reactive property), so the post-manifest-load assignment
  from `main.ts` (line ~608) DID NOT trigger Lit's `updated()` lifecycle —
  the propagation in `updated()` at line ~217 only fires for `embedEnabled`
  reactive-property changes. Tests passed because they wired the service
  pre-mount; production wired it post-mount.
  Same trap that bit `attitudeService` in Story 3.6 (see existing comment at
  `v-hud.ts:250`).
- **Fix:** Added identity-gated per-tick propagation of
  `ephemerisService` + `clockManager` to `hudDistance` inside
  `<v-hud>.tick(et)` — mirrors the Story-3.6 attitudeService fix. Post-fix
  live smoke at `/c/v1-jupiter` returned numeric AU values (e.g. "4.78 AU"
  / "5.28 AU"), confirming the wire-up is live. (Intermittent "— AU" still
  appears during LRU-cache churn of the 24-chunk working set against the
  12-slot capacity — that's the existing ChunkLoader sizing issue; not in
  this bug's scope.)
- **Fix commit:** (lead populates post-commit)
- **Defense test:** `web/tests/bug-fix-batch-2026-05-23-defense.test.ts`
  — `BUG-002 defense` describe block (post-mount EphemerisService
  assignment + tick() propagation → numeric AU values).
