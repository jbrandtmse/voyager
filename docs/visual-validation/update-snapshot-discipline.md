# `--update-snapshots` Discipline — Visual Validation

> **Story 6.0 deliverable (AC2).** This document captures the
> hard-won workflow lessons from Story 5.4's L4 PBD Playwright visual
> regression suite — specifically, how to use Playwright's
> `--update-snapshots` flag without papering over latent defects. The
> companion artifact `_bmad/custom/skill-rules.md` Rule 13 (test
> discoverability) cross-references this doc; the corresponding
> CONTRIBUTING.md section also points here for external contributors.
>
> **Scope.** Every Voyager visual-regression baseline committed under
> `web/tests/visual/__snapshots__/` is governed by this discipline. The
> doc covers when `--update-snapshots` is appropriate, the AC1-cross-check
> vitest pattern that pins timing semantics, the pre-update verification
> gate, and the commit-evidence pattern.
>
> **Source incident.** Epic 5 cross-review (2026-05-24) surfaced
> BUG-E5-007: ALL 14 committed Playwright baselines (Story 4.9's 9 scenes
> + Story 5.4's 4 PBD substates + Story 5.0's 2 production-build-HUD-title
> regressions) had been captured WITH the broken production CSS link.
> Pixel-diff vs. self was clean — the baselines and the runtime were
> broken in the same way. `--update-snapshots` does NOT distinguish "the
> code changed legitimately" from "the runtime got worse and we locked
> the regression in."

## When `--update-snapshots` is the right answer

`--update-snapshots` rewrites every baseline whose current capture
differs from the committed PNG. It is the right answer if and only if
ALL of the following hold:

1. **The code change is legitimate.** A new feature, a deliberate
   visual change, a Three.js / Lit upgrade with documented expected
   pixel drift, or a baseline-tier upgrade (e.g. a font swap).
2. **A cross-review pass against the production build has surfaced no
   layout defects.** Run the full /epic-cycle cross-review smoke (or
   Story 6.0 AC1's `build-dist-layout.test.ts`) BEFORE updating
   baselines. If layout is broken, `--update-snapshots` will lock the
   broken layout in and every subsequent pixel-diff will pass against
   the wrong reference.
3. **The AC1-cross-check vitest spec still passes against the new code.**
   See § "AC1-cross-check pattern" below — Story 5.4's pattern pins
   timing-table semantics in sub-second vitest so substate renaming or
   timing-table drift surfaces as a fast unit failure, NOT a slow
   visual-regression flake.
4. **You are the dev who made the code change, NOT a reviewer.** A
   reviewer who runs `--update-snapshots` because "the diff looks
   reasonable" loses the binding regression-detection signal. If the
   reviewer thinks the diff is correct, they push back on the PR; the
   dev re-runs `--update-snapshots` locally and commits the new
   baselines.

If you are tempted to run `--update-snapshots` because "the diff is
small and probably antialiasing drift" — STOP. The Playwright config
already absorbs antialiasing drift via the `threshold: 0.25` +
`maxDiffPixelRatio: 0.005` settings (see
`web/tests/visual/playwright.config.ts:90–112`). If a 0.5%-tolerance
diff is failing, the cause is one of:

- A real visual regression (the most likely case — investigate first).
- A Chrome-for-Testing upgrade (rare, signals from `@playwright/test`
  version bumps).
- A token table change (deliberate; the diff will be uniform across the
  HUD region).

None of those are reasons to lower the threshold or rebaseline silently.

## AC1-cross-check pattern

Story 5.4's load-bearing innovation: every PBD substate-anchored
baseline at `__snapshots__/pbd-*.png` is mirrored by a vitest spec in
the same PR that asserts on the underlying timing-table contract
(`web/src/chapters/pale-blue-dot/substates.ts`). The vitest spec runs
in <1 s; the Playwright spec runs in 30–90 s.

**The contract:** if `substates.ts` is renamed or its timing table
shifts, the vitest spec fails IMMEDIATELY — before any L4 baseline
flakes. The vitest spec is the cross-check; the L4 baseline is the
pixel-level confirmation.

### Canonical citation

| Layer | File | What it pins |
| --- | --- | --- |
| L4 baseline | `web/tests/visual/__snapshots__/pbd-turning.png` etc. | Pixel-level render at substate peak |
| L4 spec | `web/tests/visual/encounters.spec.ts:265–279` (cross-check block) | Asserts URL-encoded offset lies strictly inside substate window |
| L3 cross-check | `web/src/chapters/pale-blue-dot/substates.test.ts` | Asserts timing-table values (~`pbdSubstateAt(et)`) directly |
| Source of truth | `web/src/chapters/pale-blue-dot/substates.ts` | The timing table itself |
| Playwright config | `web/tests/visual/playwright.config.ts:visualRegressionConfig` | Viewport / locale / tz / reduced-motion pinning |

The L4 spec's cross-check block reads (paraphrased):

```ts
// Inside encounters.spec.ts L4 PBD substates describe block:
test('substate window mid-fade peak matches committed offset', () => {
  const expectedSubstate = pbdSubstateAt(PBD_ANCHOR_ET + offsetSec);
  expect(expectedSubstate).toBe('sweeping_earth');  // or whichever
});
```

…and the L3 cross-check in `substates.test.ts` asserts the timing
table's offset windows directly:

```ts
it('pbdSubstateAt at +45s returns sweeping_earth', () => {
  expect(pbdSubstateAt(PBD_ANCHOR_ET + 45)).toBe(PbdSubstate.sweeping_earth);
});
```

If a future Epic 6 / Epic 7 story changes the timing table — say,
extends the 30-second Earth pause to 40 seconds — BOTH specs MUST be
updated as part of the same PR. The L3 spec failing means "the timing
table moved"; the L4 baseline failing means "the rendered scene
shifted." If the L3 spec passes but the L4 spec fails, the cause is
NOT a timing-table change — it is a render regression worth
investigating BEFORE `--update-snapshots`.

## Pre-update verification gate (checklist)

Before running `npm run test:visual:update`, walk this checklist:

- [ ] **Production build is current.** Run `cd web && npm run build`
      and verify the build completed cleanly (no warnings beyond the
      `chunk-size-warning` baseline).
- [ ] **Story 6.0 AC1 layout test passes.** Run
      `cd web && npx vitest run tests/build-dist-layout.test.ts` and
      verify all assertions pass (this gates against the BUG-E5-007
      class of defect — capturing-in a broken layout).
- [ ] **Cross-review smoke pass exists.** If this is the final
      baseline-update before commit, the /epic-cycle cross-review pass
      should have surfaced no layout defects. If it surfaced bug fixes,
      re-run the cross-review pass against the post-fix build BEFORE
      `--update-snapshots`.
- [ ] **AC1-cross-check vitest spec exists and pins the timing-table
      semantics.** Any baseline that depends on timing data (substate
      arc, FSM transition, animation peak) MUST have a paired vitest
      spec that asserts on the underlying source data. Without the
      cross-check, future timing drift will surface as opaque
      Playwright flakes.
- [ ] **Commit the baseline + the spec file in the same PR.** Never
      commit a new baseline without the corresponding test or vice
      versa. The L4 baseline + the L3 cross-check + any modified
      `substates.ts` (or equivalent timing source) ship as one unit.
- [ ] **Inspect the diff visually.** Open the produced
      `tests/visual/test-results/<scene>/<scene>-diff.png` (only
      emitted on failure) before running `--update-snapshots`. If the
      diff has any artifact you can't explain ("why is the chapter
      title 3 pixels lower?"), STOP — that's the BUG-E5-007 signal.

## Commit-evidence pattern

A baseline update commit (or PR) MUST contain ALL of:

1. The updated `.png` files under `web/tests/visual/__snapshots__/`.
2. The vitest spec(s) that pin the timing-table semantics (if the
   visual change is timing-related).
3. The source-of-truth file that changed (e.g. `substates.ts`,
   `turn-choreography.ts`, the `composite-layer.ts` peak constants).
4. A 1–2 sentence rationale in the commit body: "Story X.Y updated
   substates so Earth pause is 40 s; baselines re-captured against
   `npm run build` + Story 6.0 AC1 layout test green."

The commit body's rationale is the audit trail. Future contributors
running `git log --oneline web/tests/visual/__snapshots__/pbd-*.png`
should see exactly which story owns each baseline and what changed.

## What this discipline does NOT cover

- **`tests/visual/test-results/` artifacts.** These are per-run diff
  outputs; they are git-ignored and never committed. The discipline
  governs only the committed baselines under `__snapshots__/`.
- **Story-side visual-validation evidence** (`docs/visual-validation/
  gravity-assists.md`, `docs/visual-validation/pale-blue-dot.md`).
  Those are living narrative artifacts updated by friendly-user
  testing; they are not pixel-diff baselines and have their own
  iteration loop.
- **Chrome DevTools MCP smoke screens** under
  `_bmad-output/implementation-artifacts/<story>-smoke-evidence/`.
  Those are per-story audit captures, not regression baselines, and
  they are never input to `--update-snapshots`.

## Cross-references

- [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md)
  Rule 13 — test discoverability (the binding rule on visible vitest
  coverage; this dev-doc is referenced from Rule 13's body).
- [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md)
  Rule 14 — spec arithmetic citation (Story 6.0 AC3; same epic).
- [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md)
  Rule 15 — forward-coherence heuristic (Story 6.0 AC4; same epic).
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) § "Visual validation" —
  external-contributor pointer to this dev-doc.
- [`web/tests/visual/playwright.config.ts`](../../web/tests/visual/playwright.config.ts)
  — viewport / locale / tz pinning that backs the L4 suite.
- [`web/tests/build-dist-layout.test.ts`](../../web/tests/build-dist-layout.test.ts)
  — Story 6.0 AC1 production-build layout regression test (the
  pre-update verification gate this doc references).
- [`_bmad-output/implementation-artifacts/5-4-pbd-l4-playwright-visual-regression-suite.md`](../../_bmad-output/implementation-artifacts/5-4-pbd-l4-playwright-visual-regression-suite.md)
  — Story 5.4 source incident; the AC1 cross-check pattern was first
  shipped here.
- [`_bmad-output/implementation-artifacts/epic-5-retro-2026-05-24.md`](../../_bmad-output/implementation-artifacts/epic-5-retro-2026-05-24.md)
  § "What didn't go well" — the canonical record of BUG-E5-007 and
  the "self-captured baselines" defect class.
