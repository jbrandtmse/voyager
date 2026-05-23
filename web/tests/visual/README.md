# L4 Playwright visual regression (Story 4.9, FR55)

This directory holds the **Layer 4** visual-regression suite — nine pinned
scene screenshots that act as a merge gate on Cloudflare-Pages-equivalent
production output. Every PR runs the suite; any unintended diff fails
the workflow.

Story 4.9 introduces the harness; Stories 5.1–5.4 and every later epic
update baselines intentionally whenever the rendered output is supposed
to change.

## Scene roster

| Slug             | URL                 | Anchor (UT)              | Owner story |
| ---------------- | ------------------- | ------------------------ | ----------- |
| `launch-v1`      | `/c/launch-v1`      | 1977-09-05T12:56:00Z     | 2.1         |
| `launch-v2`      | `/c/launch-v2`      | 1977-08-20T14:29:00Z     | 2.1         |
| `v1-jupiter`     | `/c/v1-jupiter`     | 1979-03-05T12:05:00Z     | 4.5         |
| `v2-jupiter`     | `/c/v2-jupiter`     | 1979-07-09T22:29:00Z     | 4.6         |
| `v1-saturn`      | `/c/v1-saturn`      | 1980-11-12T23:46:00Z     | 4.6         |
| `v2-saturn`      | `/c/v2-saturn`      | 1981-08-26T03:24:00Z     | 4.6         |
| `v2-uranus`      | `/c/v2-uranus`      | 1986-01-24T17:59:00Z     | 4.7         |
| `v2-neptune`     | `/c/v2-neptune`     | 1989-08-25T03:56:00Z     | 4.7         |
| `pale-blue-dot`  | `/c/pale-blue-dot`  | 1990-02-14T00:00:00Z     | 4.9 (stub) → 5.4 |

Baselines live at `__snapshots__/scene-<slug>.png` (committed to the
repo; **not** LFS-tracked — the PNGs are small enough at 1280×720 dark
backgrounds that committing them inline keeps the change diffable).

## Running locally

```bash
cd web
# One-time: install the pinned Chromium build (~180 MB).
npx playwright install chromium

# Build the production output the suite tests against.
npm run build

# Run the suite (preview server starts automatically per playwright.config).
npx playwright test --config tests/visual/playwright.config.ts
```

The suite uses Vite's `preview` server (port 4173) by default. If a
preview server is already running locally it'll be reused; if you want
a clean server every time, set `CI=true` (which also disables retries +
forces 1 worker — matching the GitHub Actions config).

## Updating baselines (intentional visual changes)

When you intentionally change the rendered output (chapter framing,
new HUD element, planet texture upgrade, etc.):

1. Build + run the suite to confirm which scenes diff.

   ```bash
   npm run build
   npx playwright test --config tests/visual/playwright.config.ts
   ```

   Failing tests dump `test-results/<scene>/scene-<slug>-diff.png`
   (and `-actual.png` / `-expected.png`) for review.

2. Update the affected baselines.

   ```bash
   npx playwright test --config tests/visual/playwright.config.ts --update-snapshots
   ```

   This **replaces** the PNGs under `__snapshots__/`. Inspect the diff
   visually (`git diff` of binary PNGs surfaces both old + new in
   GitHub's PR view).

3. Stage the updated baselines.

   ```bash
   git add web/tests/visual/__snapshots__/
   git commit
   ```

4. In the PR description:
   - Reference the **intentional change** driving the baseline update
     (story ID, chapter, etc.).
   - Include before/after screenshots so reviewers don't have to
     manually pull the PR + diff PNGs.
   - Flag any scenes that diffed unexpectedly — those usually indicate
     a side-effect bug worth investigating before the merge gate
     accepts them as "intended."

## CI integration

`.github/workflows/ci.yml` runs the suite in a job called
`l4-visual-regression` that:

- Builds the production output (`web/dist/`).
- Spins up `vite preview` on port 4173 (the same path local runs use).
- Runs `npx playwright test --config tests/visual/playwright.config.ts`
  with `CI=true` (1 worker, 1 retry on the first failure).
- On failure, uploads `test-results/` as an artifact (`playwright-l4-diffs`)
  so reviewers can pull the diff PNGs and decide whether the change is
  intentional.

The total L4 wall-clock per the suite's design budget is ≤ 3 minutes
(serial, ~20s/scene including boot + stable-frame wait + capture). That
leaves headroom against NFR-M4's 15-minute total L4+L5 limit.

## Flake defense

The biggest flake risk is capturing a screenshot mid-load. The waiter
at `helpers/wait-for-stable.ts` blocks until:

1. The `<v-hud-chapter-title>` element's `data-slug` attribute matches
   the expected chapter slug (the production-build observable proxy for
   `__voyagerDebug.chapterDirector.activeChapter.slug`).
2. `networkidle` — Playwright's 500ms-silence trailing-edge guarantee
   covers in-flight KTX2 textures + chapter chunks.
3. `<v-chapter-copy>` opacity == 1 (== fade complete; effectively a
   no-op under `reducedMotion: 'reduce'` but defended belt-and-braces).
4. Two consecutive identical downsampled canvas fingerprints (or
   1500ms fixed wait fallback if frame stability never hits within 5
   sampling attempts).

If a scene becomes intermittently flaky, the response order is:

1. Inspect `test-results/<scene>/trace.zip` (auto-uploaded on first
   retry) — usually reveals the mid-load capture state.
2. Tighten or relax the `playwright.config.ts` per-scene
   `maxDiffPixelRatio` if the diff is genuinely sub-perceptual font
   hinting / anti-aliasing noise.
3. Extend the stable-frame waiter's settle conditions if a new visual
   element introduces a per-frame animation the existing four
   conditions don't cover.

### Determinism check (manual, per-story)

Story 4.9 T5 — before declaring a baseline final, run the suite ≥ 10×
in a row on the same checkout and confirm 0 failures. The pinned
Chrome-for-Testing build + the reduced-motion + tz/locale pins
together aim at this; in practice 10 sequential runs is the floor of
what's acceptable for a CI gate.

```bash
# Quick local 10-run loop.
for i in {1..10}; do
  echo "=== run $i ==="
  npx playwright test --config tests/visual/playwright.config.ts || break
done
```

If any run fails, **do not** capture the failure as the new baseline.
Investigate (probably with the trace.zip from the first failure) and
either fix the source of variance or document the per-scene tolerance
loosening with a comment in `playwright.config.ts`.

## Inventory

```
web/tests/visual/
├── README.md                 (this file)
├── playwright.config.ts      (pinned viewport + locale + tz + reduced-motion)
├── encounters.spec.ts        (the 9 scene tests)
├── helpers/
│   └── wait-for-stable.ts    (stable-frame waiter)
└── __snapshots__/
    ├── scene-launch-v1.png
    ├── scene-launch-v2.png
    ├── scene-v1-jupiter.png
    ├── scene-v2-jupiter.png
    ├── scene-v1-saturn.png
    ├── scene-v2-saturn.png
    ├── scene-v2-uranus.png
    ├── scene-v2-neptune.png
    └── scene-pale-blue-dot.png
```
