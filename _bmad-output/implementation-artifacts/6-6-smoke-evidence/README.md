# Story 6.6 — smoke evidence

**Story:** 6.6 — Final Contrast, Typography, and Provenance-Label Polish
**Created:** 2026-05-25

This directory hosts the lead-driven per-story smoke evidence for
Story 6.6 (AC9). The dev agent committed the code changes (T1–T8);
the lead executes the 6-step smoke sequence against the production
build and saves evidence here.

The dev agent CANNOT execute the lead-driven Playwright / production-
build steps (they require a real Chromium runtime against a built
`dist/`, plus the dev agent does not have a build-then-screenshot
pipeline). Per Rule 3 (Per-story smoke evidence is a per-story exit
criterion) + Rule 7 (sub-agent tool inventory is harness-inherited),
the lead runs the smoke and amends this directory with evidence.

## Smoke sequence (per AC9)

The lead's 6-step verification:

1. **(a) `cd web && npm test`** — full vitest sweep. Verify ≥ 3812
   passing + new tests (AC2 tabular-numerals invariance + AC5 focus-
   persistence + AC1 contrast-defense updates). Record the final
   pass count and any unexpected failures.

2. **(b) `cd web && npm run build && npx playwright test --config tests/visual/playwright.config.ts --update-snapshots`**
   — re-capture all 17 L4 baselines under the new
   `mask: [v-hud, v-chapter-copy, v-timeline-scrubber]` parameters
   and the tightened `maxDiffPixelRatio: 0.001`. Then run the same
   command WITHOUT `--update-snapshots` THREE consecutive times to
   verify deterministic baselines (no pixel-diff across reruns).
   Record the 3-rerun result (`PASS / PASS / PASS` expected).

3. **(c)** Open
   [`docs/accessibility/contrast-audit-launch-week.md`](../../docs/accessibility/contrast-audit-launch-week.md)
   — verify it covers AC1's audit table (§ 1, § 2, § 3) AND AC2's
   typography section (§ 4). Sign off in this README's § "Audit doc
   sign-off" below.

4. **(d)** Open
   [`docs/launch/reference-parity-review.md`](../../docs/launch/reference-parity-review.md)
   — verify it is a complete template with the verdict marked
   "TO BE POPULATED AFTER EXTERNAL REVIEW" in § 6. Sign off in
   this README's § "Reference-parity template sign-off" below.

5. **(e) `grep -rn "--v-color-fg-quiet" web/src/`** — verify every
   site is either (i) at ≥ 18 px text size, (ii) inside the HUD
   shadow tree (text-shadow-boosted), or (iii) used for non-text UI
   (border / divider) at 3:1. The expected list is documented in
   `contrast-audit-launch-week.md` § 3.

6. **(f) `grep -rn "outline:\s*none" web/src/`** — verify every site
   is either (i) immediately replaced with a compensating
   `:focus-visible` style, or (ii) on a non-focusable element. The
   expected list is documented in
   [`docs/accessibility/contrast-audit-launch-week.md § 5.2`](../../docs/accessibility/contrast-audit-launch-week.md)
   (6 sites enumerated; every site PASSES the AC5 contract).

## Audit doc sign-off

**Status:** PENDING — to be signed off by lead post-smoke.
**Lead sign-off line (populate at smoke time):** `Verified by <lead> on <date>; audit doc covers AC1 § 1–3 and AC2 § 4; PASS.`

## Reference-parity template sign-off

**Status:** PENDING — to be signed off by lead post-smoke.
**Lead sign-off line (populate at smoke time):** `Verified by <lead> on <date>; reference-parity template covers methodology, reference set, reviewer roster, session log, per-reviewer verdicts, aggregate verdict; verdict marked TBD; PASS.`

## L4 baseline re-capture log

**Status:** PENDING — to be populated by lead's `--update-snapshots` run.
**Expected output:** 17 baselines re-captured (8 cold-load encounters +
4 PBD substates + 5 reduced-motion). Run 1 captures new baselines;
runs 2 + 3 produce 0 pixel-diff.

Expected baseline list (no new baselines; the 17 existing baselines
re-captured):

- 8 cold-load: `scene-launch-v1.png`, `scene-launch-v2.png`,
  `scene-v1-jupiter.png`, `scene-v2-jupiter.png`, `scene-v1-saturn.png`,
  `scene-v2-saturn.png`, `scene-v2-uranus.png`, `scene-v2-neptune.png`
- 4 PBD substates: `pbd-turning.png`, `pbd-sweeping-earth.png`,
  `pbd-sweeping-neptune.png`, `pbd-composite-decay.png`
- 5 reduced-motion: `reduced-motion-title-card-final-state.png`,
  `reduced-motion-chapter-copy-final-state.png`,
  `reduced-motion-chapter-index-final-state.png`,
  `reduced-motion-pbd-turn-final-state.png`,
  `reduced-motion-hud-dismiss-final-state.png`

Story 6.6 dev notes (line 84 of the story file) mention "20 baselines"
— the actual current count is 17 (8 + 4 + 5). The 3 missing from 20
are likely two stories' deltas (Story 4.9 originally shipped 9
cold-load scenes including a `pale-blue-dot` cold-load stub baseline
that Story 5.4 REMOVED per Path A, dropping from 9 → 8; the 4 PBD
substates were added in Story 5.4 separately). The exact mismatch is
documented for traceability — the contract holds regardless of the
exact integer (the contract is "all existing L4 baselines re-captured
under masking", which is honored for whatever set is committed at
re-capture time).

## Test pass count log

**Status:** PENDING — populate at smoke time.
**Pre-Story-6.6 baseline:** 3812 / 10 skipped (per Story 6.5 close).
**Post-Story-6.6 expected:** 3812 + 5 (AC2 tabular-numerals defense
tests) + 0 (AC5 focus-persistence is L4 Playwright, not vitest) ≈
3817 vitest. Any additional defense-style tests (e.g. updated
v-version test pinning fg-muted) net 0 (tests modified in place,
not added).

## Lint / typecheck log

**Status:** PENDING.
**Pre-Story-6.6 baseline:** 4 lint warnings, 0 errors; typecheck clean.
**Post-Story-6.6 expected:** ≤ 4 lint warnings, 0 errors; typecheck clean.

## ADR compliance verification

Per AC10:

- **ADR-0010 (Playwright per AC6):** L4 visual + L4 a11y suites are
  Playwright-driven; agent-time Chrome DevTools MCP is the alternative
  for in-iteration developer fixes. AC6's masking + tolerance fix lands
  in the L4 Playwright suite, honouring ADR-0010.
- **ADR-0025 (APG primitives — focus styling):** the three APG
  primitives (slider thumb on `<v-timeline-scrubber>` +
  `<v-speed-multiplier>`; listbox on `<v-chapter-index>`) all declare
  per-component `:focus-visible` styles that pair with `outline: none`
  on the host. Story 6.6's AC5 audit verified each compensating focus
  style is present. ADR-0025 compliant.
- **ADR-0027 (line-ending for new markdown docs):** the two new docs
  (`docs/accessibility/contrast-audit-launch-week.md` and
  `docs/launch/reference-parity-review.md`) plus this README inherit
  `* text=auto eol=lf` from the repo's `.gitattributes`. ADR-0027
  compliant.
