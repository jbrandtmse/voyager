# Story 2.6: Pre-rendered Open Graph Cards per Chapter

**Epic:** 2
**Status:** review
**Date created:** 2026-05-20
**Source:** `_bmad-output/planning-artifacts/epics.md` § Story 2.6 + Epic 2 Risks/Mitigations § R4 + ADR-0018

## User Story

As a sharing visitor (Maya, J2),
I want pasting a chapter URL into iMessage, Slack, Twitter, or Discord to show a preview image of the exact scene the link points to,
So that the OG card is a communication vector that propagates the artifact through messaging apps, fulfilling FR39.

## Consumes / Touches

- **Story 2.1 ALL_CHAPTERS** — build-time script reads from the SAME registry the runtime uses (R4 mitigation; no copy-paste)
- **Story 2.4 URL router** — generated cards target `/c/<slug>?t=<anchorEt-as-ISO>`
- **Story 1.14 CI/Cloudflare deploy** — `web/dist/og/*.png` is published as static assets with immutable cache headers
- **Playwright** — headless Chromium screenshots the built site

## Acceptance Criteria

### AC1 — Post-build OG generator script

- **GIVEN** a post-build script `web/scripts/og-cards.ts`
- **WHEN** CI runs it after `npm run build`
- **THEN** it boots a Playwright headless Chromium against the built `web/dist/` site served by a local static file server (e.g., `serve` or `http-server` on a free port)
- **AND** for each chapter in `ALL_CHAPTERS`, it navigates to `/c/<slug>?t=<anchorEt-as-ISO>` (skipping PBD if it would require Epic 5 logic — emit a placeholder PNG instead with a comment in the spec; PBD's real OG card lands in Epic 5)
- **AND** waits for the first-paint to stabilize (e.g., `waitFor` on the HUD date text matching the chapter's anchor or a fixed timeout of ~3s — pick whichever the Playwright capabilities support cleanly)
- **AND** captures a 1200×630 PNG screenshot at the chapter's anchor instant
- **AND** saves to `web/dist/og/<chapter-slug>.<hash>.png` (content-hash for cache busting; emit a manifest `og-manifest.json` mapping slug → filename so the HTML generation step (AC2) can lookup the hashed filename)

### AC2 — Per-chapter Open Graph + Twitter Card meta tags

- **GIVEN** the built site's HTML
- **WHEN** I inspect each chapter route's served HTML (`web/dist/c/<slug>/index.html` or a single SPA HTML that templates the meta tags — author's choice based on Vite output shape)
- **THEN** the `<head>` includes per-chapter Open Graph meta tags:
  - `og:image` pointing to the chapter's content-hashed OG PNG (`/og/<slug>.<hash>.png`)
  - `og:title` = chapter editorial name + " — Voyager"
  - `og:description` = one-sentence chapter summary (defined per-chapter in a new `ChapterSpec.ogDescription` field OR a sibling lookup map; author picks the cleanest extension)
  - `og:url` = canonical chapter URL (e.g., `https://voyager.app/c/v2-neptune`)
  - `og:type` = `website`
- **AND** Twitter Card meta tags are present:
  - `twitter:card` = `summary_large_image`
  - `twitter:image` = same as og:image
  - `twitter:title` = same as og:title
  - `twitter:description` = same as og:description
- **AND** the homepage `/` carries default OG metadata (any v1-launch scene is acceptable as a placeholder until Epic 5 adds the PBD V1-turn-around hero shot; document the choice in the script's comments)

### AC3 — CI assertion on OG card completeness (R4 mitigation)

- **GIVEN** CI verifies OG card completeness
- **WHEN** the build step finishes
- **THEN** a CI assertion (a Vitest test under `web/scripts/og-cards-defense.test.ts` or a script-level assertion in og-cards.ts itself) fails if any chapter's OG card PNG is missing from `web/dist/og/`
- **AND** the assertion counts exactly **11** PNGs (matching `ALL_CHAPTERS.length`); if PBD is a placeholder, it still counts as one PNG, so total is still 11
- **AND** a unit test enforces parity: `import { ALL_CHAPTERS } from 'web/src/chapters/registry'; ... expect(generatedOgManifest.entries.length).toBe(ALL_CHAPTERS.length)` — this is the R4 mitigation: build-time + runtime read from the same source

### AC4 — Crawler-facing correctness (smoke)

- **GIVEN** an OG card is requested by a social-platform crawler
- **WHEN** I `curl -A "facebookexternalhit/1.1" https://voyager.app/c/v2-neptune` (or against the local dev/build server in the smoke gate) and parse the response HTML
- **THEN** the meta tags resolve to the correct content-hashed OG PNG URL
- **AND** the PNG itself returns HTTP 200 with `Cache-Control: public, max-age=31536000, immutable` (per Story 1.14's CDN headers — verify the og/ files inherit the assets/ caching policy, OR add an explicit rule for og/)

### AC5 — Tests green

- `cd web && npm test -- --run` passes (baseline 1610 + new tests)
- `npm run typecheck` clean
- `npm run lint` clean (5 pre-existing warnings OK)
- The og-cards.ts script does NOT need to run in CI for this story's tests to pass — the script is a build artifact, not a unit-test artifact. Test what the script PROMISES (manifest shape, registry parity, HTML meta tag emission), not what it produces (PNGs).

## Risk Mitigation Audit (R4)

Epic 2 R4 mandate: "Story 2.6 must include a build/runtime parity assertion: OG generator and FSM read chapter definitions from the same source file (no copy-paste). A unit test must enforce that the OG generator's chapter list equals the FSM's chapter list at build time."

- ✅ AC1: OG generator imports `ALL_CHAPTERS` from `web/src/chapters/registry.ts` — the SAME file the runtime ChapterDirector consumes
- ✅ AC3: unit test asserts `generatedOgManifest.entries.length === ALL_CHAPTERS.length` AND every slug in the manifest is in ALL_CHAPTERS (no extras, no drops)

## Integration ACs (per voyager-skill-rules.md Rule 2)

### Integration AC6 — Smoke against built artifacts (PNG existence + meta tag emission)

- **GIVEN** `npm run build` followed by `node web/scripts/og-cards.ts` (or `npm run build:og` or whatever the project's task name is)
- **WHEN** the lead-side smoke inspects `web/dist/og/`
- **THEN** 11 PNG files exist, one per chapter, with content-hashed filenames matching the manifest
- **AND** OPTIONAL: `head` the generated HTML for one chapter (or `curl localhost:<port>/c/v2-neptune`) and verify `<meta property="og:image">` resolves to the hashed PNG filename
- **NOTE:** if Playwright isn't already installed (Story 4.9 introduces it), this story can EITHER install playwright-core for the build script OR formally defer the Playwright invocation to Story 4.9 / Story 7.x and ship just the meta-tag emission + manifest-shape unit tests. Dev's judgment — document the decision in Dev Agent Record.

## Files to Modify

| File | Action | Reason |
|---|---|---|
| `web/scripts/og-cards.ts` | NEW | Build-time generator using Playwright headless Chromium |
| `web/scripts/og-cards-defense.test.ts` | NEW | R4 mitigation parity test (no copy-paste); manifest-length assertion |
| `web/src/chapters/registry.ts` | UPDATE (maybe) | Add `ogDescription` field to ChapterSpec OR sibling lookup; author's choice |
| `web/src/types/chapter.ts` | UPDATE (maybe) | If new field added to ChapterSpec |
| `web/src/chapters/specs/*.ts` (11 files) | UPDATE (maybe) | Add ogDescription per chapter if new field path chosen |
| `web/vite.config.ts` (and/or `web/index.html`) | UPDATE | Per-chapter HTML emission with templated `<meta>` tags — Vite plugin or build hook |
| `web/index.html` (template) | UPDATE | Add default OG meta tags for `/` |
| `web/package.json` | UPDATE | Add `playwright-core` dep (or playwright); add `build:og` script |

## Tasks / Subtasks

- [x] **T1 (AC1): Build-time generator skeleton**
  - [x] Author `web/scripts/og-cards.ts` — imports ALL_CHAPTERS via `web/src/build/og-cards.ts`; runner emits PNG placeholders + manifest + per-chapter HTML against existing `dist/`. **Playwright headless-Chromium PNG capture deferred** to Story 4.9 / 7.x per story-file's authorised path (b) — see Dev Agent Record § Playwright deferral
  - [x] For each chapter, would navigate to `/c/<slug>?t=<isoFromEt(anchorEt)>` (Story 7.x will wire) — slug + anchor-ISO captured deterministically in the manifest entry's `anchorIso` field today
  - [x] Capture 1200×630 PNG via `page.screenshot(...)` — deferred to Story 7.x; this story writes a 1×1 transparent PNG placeholder per chapter so static-asset paths resolve to HTTP 200
  - [x] Save to `web/dist/og/<slug>.<contenthash>.png` — content hash is FNV-1a32 of `slug|anchorEt|windowStartEt|windowEndEt` (stable across builds until Story 7.x re-hashes from real PNG bytes)
  - [x] Emit `web/dist/og/og-manifest.json` mapping slug → filename — Vite plugin (`ogCardsPlugin` in vite.config.ts) emits it in `generateBundle`

- [x] **T2 (AC2): Per-chapter meta tag emission**
  - [x] Added `ogDescription: string` to `ChapterSpec` (field path chosen over sibling lookup for type-safety; one-touch authoring per chapter spec file)
  - [x] In Vite build config: `ogCardsPlugin` emits `dist/c/<slug>/index.html` per chapter with templated OG + Twitter meta tags via `renderChapterHtml` (pure function in `web/src/build/og-html-emitter.ts`)
  - [x] Default OG metadata on `/` (homepage) — `fallbackAndProbePlugin` injects `renderHomeOgMetaBlock` into `index.html`'s `<!-- OG_META -->` slot; default image = `v2-neptune` card (per AC2's "any v1-launch scene is acceptable as a placeholder until Epic 5")

- [x] **T3 (AC3 + R4): Parity test**
  - [x] Vitest test importing ALL_CHAPTERS and checking parity — `web/src/build/og-cards.test.ts` enforces (a) length equality, (b) slug-set equality, (c) order equality, (d) per-entry shape, (e) content-hash determinism. **THIS IS THE R4 MITIGATION**
  - [x] CI assertion — `web/scripts/og-cards-defense.test.ts` exercises `emitOgArtifacts` + `verifyOgArtifacts` end-to-end against a temp directory and fails on missing PNG, extra slug, dropped slug. The script `web/scripts/og-cards.ts` also exits with code 2 on manifest mismatch when invoked with `npm run build:og`

- [x] **T4 (AC5): Verification**
  - [x] Run `npm test -- --run` — **1681 pass** (+71 from 1610 baseline; 92 test files)
  - [x] `npm run typecheck` — clean
  - [x] `npm run lint` — 5 pre-existing warnings, 0 new
  - [x] `npm run build` — Vite emits 11 OG PNGs + og-manifest.json + 11 per-chapter HTML shells + homepage with default OG block (build verified at `c:/git/Voyager/web/dist/`)
  - [x] **Pre-existing test staleness fix:** `tests/feature-probe-size.test.ts` had a Story-1.8-era expectation for `DecompressionStream('br')` that was invalidated by Story 1.16 (brotli probe removed). The test was silently skipped without a prior `dist/` build; my `vite build` exposed the staleness. Updated the test to assert the post-Story-1.16 contract (probe MUST NOT contain `DecompressionStream('br')`). This is a Voyager skill rule 5-aligned fix (test contract amended to match the architecturally-decided NFR state, not worked around in deferred-work)

- [x] **T5 (smoke prep): Document the lead-side smoke** — see Dev Agent Record § Lead-side smoke recipe

## Dev Notes

### Build vs runtime split

The architecture commits the OG card generation to a build-time pipeline (per ADR-0018: "OG card generation via Playwright against built site"). This story implements that pipeline. The script does NOT run at deploy time on the CDN; it runs in CI after `npm run build` and the resulting PNGs are part of the static asset bundle.

### Playwright vs playwright-core

- `playwright` (full package) bundles browser binaries; ~150 MB install.
- `playwright-core` requires manual browser bin path; lighter dep.
- Story 4.9 is where Playwright's E2E test framework formally lands. This story can:
  - Add `playwright-core` for build-only use (recommended if browser binary is already on CI)
  - OR defer the Playwright invocation entirely to Story 7.x and ship just the meta-tag emission + manifest-parity unit tests (no real PNG capture in this story)
- Decision: dev picks based on what's installable in the project's CI environment. Document in Dev Agent Record.

### R4 parity discipline

The dev MUST NOT hand-author a parallel chapter list inside og-cards.ts. The script imports ALL_CHAPTERS via the registry barrel and iterates. The parity unit test is a safety net against future refactors.

### Voyager skill rules

- Rule 2: this story consumes ALL_CHAPTERS; the parity assertion IS the consumer-side integration AC.
- Rule 3: browser-smoke for `web/src/` is a per-story exit criterion — BUT this story doesn't touch `web/src/` runtime behavior. The build script lives under `web/scripts/`. The lead smoke is "inspect web/dist/og/ + sample meta tag" not "drive Chrome DevTools MCP."

### NFR considerations

- NFR-M4 ≤5 min CI budget: OG card generation is bounded — 11 Playwright navigations + screenshots ~~ 30s on warm cache + 10-15s for browser launch. Document the budget impact in the script's header comment.

## References

- `_bmad-output/planning-artifacts/epics.md` § Story 2.6 + Epic 2 R4
- `docs/adr/0018-og-card-generation-via-playwright-against-built-site.md`
- `web/src/chapters/registry.ts` (ALL_CHAPTERS — the single source of truth)
- Story 2.4 docs/url-contract.md (canonical chapter URLs)
- Story 1.14 web/.github/workflows/* (CI deploy pipeline)
- `_bmad/custom/voyager-skill-rules.md`

## Dev Agent Record

### Implementation summary

Implemented as a build-time pipeline split across:

1. **Pure core (`web/src/build/og-cards.ts`):** imports `ALL_CHAPTERS` from `web/src/chapters/registry.ts` (R4 single source of truth), exposes `buildOgManifest`, `ogContentHash`, `ogPngFilenameFor`, `ogImagePathFor`, `PLACEHOLDER_PNG_BYTES`. Content hash is FNV-1a32 over `slug|anchorEt|windowStartEt|windowEndEt`.

2. **HTML emitter (`web/src/build/og-html-emitter.ts`):** pure functions `renderOgMetaBlock`, `renderHomeOgMetaBlock`, `injectOgMeta`, `renderChapterHtml`. Canonical origin = `https://voyager.app`. HTML attribute-safe escape on `&`, `<`, `>`, `"`. Falls back from `<!-- OG_META -->` placeholder to before-`</head>` insertion if the slot is missing.

3. **Vite plugin (`ogCardsPlugin` in `web/vite.config.ts`):** captures the pristine root `index.html` in `transformIndexHtml` with `order: 'pre'` (so the homepage OG injection done by `fallbackAndProbePlugin` doesn't pollute the per-chapter HTML clones), then in `generateBundle` emits:
   - 11 placeholder PNGs at `dist/og/<slug>.<hash>.png`
   - `dist/og/og-manifest.json` (the slug→filename contract)
   - 11 per-chapter HTML shells at `dist/c/<slug>/index.html` with chapter-specific OG + Twitter meta tags
   The homepage OG injection itself happens inside `fallbackAndProbePlugin`'s `transformIndexHtml` handler (existing post-order, runs after our `pre` capture) using `renderHomeOgMetaBlock` with the V2 Neptune card as the placeholder image until Story 5.x lands the PBD hero shot.

4. **Standalone runner (`web/scripts/og-cards.ts`):** node-script that produces the same artifacts against an already-built `dist/`. Exposes `emitOgArtifacts` + `verifyOgArtifacts` for unit-tested CI gating. Runnable via `npm run build:og` (uses `node --import tsx`; tsx is not currently a dep — see Decisions). Returns exit code 2 on manifest mismatch, 3 on missing dist/.

5. **`ChapterSpec.ogDescription` field added** (was missing per story T2). Authored one descriptive sentence per chapter; the registry barrel propagates them.

### Tests added

- `web/src/build/og-cards.test.ts` — 26 tests covering R4 parity, manifest shape, content hash determinism, helper-function shape, placeholder PNG signature, fixture-injection escape hatch
- `web/src/build/og-html-emitter.test.ts` — 30 tests covering required tag set, Twitter card tag set, attribute escape discipline, origin override, homepage default block, placeholder vs `</head>` fallback injection, per-chapter HTML round-trip across all 11 chapters
- `web/scripts/og-cards-defense.test.ts` — 14 tests covering filesystem-level emit + verify, idempotency, R4 parity at the disk-write layer, missing-PNG / extra-slug / dropped-slug detection, decoupled CI-assertion path

Total new tests: ~70. Vitest baseline went from 1610 → 1681.

### Playwright deferral (story-file authorized choice b)

Per the team lead's prompt and story-file Integration AC6 NOTE, real Playwright PNG capture is **forward-deferred to Story 4.9 / Story 7.x**. The Vite plugin emits a 1×1 transparent PNG placeholder per chapter so `og:image` URLs resolve to HTTP 200. Reasoning:

- The story's quantitative threshold (AC5) says: "Test what the script PROMISES (manifest shape, registry parity, HTML meta tag emission), not what it produces (PNGs)." That contract is fully covered by the unit tests in `web/src/build/og-cards.test.ts` and `web/src/build/og-html-emitter.test.ts`.
- The R4 mitigation — the CRITICAL guarantee — is the manifest/registry parity assertion, NOT the PNG-content correctness. Parity is wired and tested at three layers (`og-cards.test.ts`, `og-cards-defense.test.ts`, `verifyOgArtifacts` script-level).
- Adding `playwright-core` + a browser binary download would lengthen the install path before any Epic-4 / Epic-7 story actually needs it. Story 4.9 (L4 visual regression) is the natural home for Playwright; cribbing one chapter of that story now would create scope drift.
- The placeholder PNG path is byte-identical in shape to the future real-PNG path — only the bytes change. Story 7.x will replace `PLACEHOLDER_PNG_BYTES` with `page.screenshot()` output without touching the manifest contract or the HTML emitter.

The deferral is documented in:
- `web/src/build/og-cards.ts` (module-level docstring + the `PLACEHOLDER_PNG_BYTES` export's docstring)
- `web/scripts/og-cards.ts` (module-level docstring)
- `web/vite.config.ts` (`ogCardsPlugin` docstring)

### Decisions

- **`ogDescription` location:** added to `ChapterSpec` directly (vs sibling lookup map). One-touch per-chapter authoring, type-safe, no drift risk.
- **Per-chapter HTML emission strategy:** Vite plugin emits `dist/c/<slug>/index.html` shells. Chosen over single-SPA-HTML-with-runtime-mutation because crawlers don't execute JS — they need static per-route meta tags. Adds ~3.5 KB × 11 = 38 KB to the static bundle.
- **Plugin lifecycle ordering:** `ogCardsPlugin.transformIndexHtml.order = 'pre'` to capture pristine HTML before `fallbackAndProbePlugin`'s post-order homepage OG injection. Without this fix the per-chapter shells stacked TWO OG blocks (homepage + chapter). Single-block verified at build artifact level.
- **Content hash inputs:** `slug|anchorEt|windowStartEt|windowEndEt`. These are the four fields that pin the chapter's canonical frame. Story 7.x will replace this with a hash of the actual PNG bytes; the manifest contract stays the same.
- **Default homepage OG image:** `v2-neptune` card (matches story AC2's note "any v1-launch scene is acceptable as a placeholder until Epic 5"). Reasoning in `vite.config.ts` near `HOMEPAGE_DEFAULT_OG_SLUG`.
- **`tsconfig.json`:** extended `include` from `["src"]` to `["src", "scripts"]` so the runner script + its defense test type-check. The `tests/` and `vite.config.ts` paths remain outside `include` (they're transpiled by vitest / Vite directly) to preserve the existing typecheck baseline.

### Pre-existing test staleness fix (per Voyager skill rule 5)

`tests/feature-probe-size.test.ts` had a Story-1.8-era expectation `expect(body).toContain("DecompressionStream('br')")` that was invalidated when Story 1.16 removed the brotli probe (per `feature-detect.ts:20-21` and Voyager skill rule 6). The test was silently skipped without a prior `dist/` build (`it.skipIf(!distHasBuild)`); my Story 2.6 build exposed the staleness. Updated to assert the post-Story-1.16 contract (the probe MUST NOT carry a brotli check). Also tightened the regex to `<script>(\(function\(\)\{[\s\S]*?)<\/script>` so it matches the REAL IIFE probe instead of `<script>` text inside the explanatory comment. No NFR amendment needed — the test was carrying stale Story-1.8 contract; Story 1.16 already amended the NFR.

### Lead-side smoke recipe (Integration AC6)

After `cd web && npm run build`, the following artifacts MUST exist with the stated shape:

| Artifact | Expected shape |
|---|---|
| `web/dist/og/og-manifest.json` | `{ version: 1, entries: [11 entries, slugs in chronological order by anchorEt] }` |
| `web/dist/og/*.png` | 11 files matching `<slug>.<8-hex>.png`, one per ALL_CHAPTERS entry |
| `web/dist/c/<slug>/index.html` | 11 files (one per chapter) each with `og:url" content="https://voyager.app/c/<slug>"` |
| `web/dist/index.html` | one OG block with `og:url" content="https://voyager.app/"` and `og:image` = V2 Neptune card |

Recommended commands (PowerShell or bash, against the repo root):

```sh
cd web && npm run build
ls dist/og/                       # should list 11 .png + og-manifest.json
ls dist/c/                        # should list 11 chapter slug directories
head -25 dist/og/og-manifest.json # entries[0..10] each with slug/title/description/imagePath/anchorIso
grep -E 'og:|twitter:' dist/c/v2-neptune/index.html  # 9 meta tags, all V2-Neptune-specific
grep -c 'meta property="og:title"' dist/c/v2-neptune/index.html  # MUST be exactly 1
grep -c 'meta property="og:title"' dist/index.html               # MUST be exactly 1
```

Per Voyager skill rule 3, this story does NOT touch `web/src/` runtime browser surfaces — it adds build-time tooling and a type field. The per-chapter HTML is parsed by crawlers (no JS execution); there is no DOM behaviour to smoke. The lead-side gate is the build-artifact inspection above. ADR-0010 Layer-1 (Chrome DevTools MCP) is reserved for stories whose code runs in a real browser; OG card generation is build-only.

### Files modified / added

- **New:** `web/src/build/og-cards.ts` (core), `web/src/build/og-cards.test.ts` (R4 parity test), `web/src/build/og-html-emitter.ts` (HTML templating), `web/src/build/og-html-emitter.test.ts` (HTML emitter tests), `web/scripts/og-cards.ts` (standalone runner), `web/scripts/og-cards-defense.test.ts` (FS-level defense test)
- **Modified:** `web/src/types/chapter.ts` (added `ogDescription` field), all 11 `web/src/chapters/specs/*.ts` (added one-sentence chapter descriptions), `web/src/types/chapter.test.ts` (updated literals + key list), `web/src/services/chapter-director.test.ts` (updated fixture literals), `web/index.html` (added `<!-- OG_META -->` slot), `web/vite.config.ts` (added `ogCardsPlugin` + homepage default OG injection in `fallbackAndProbePlugin`), `web/package.json` (added `build:og` script), `web/tsconfig.json` (added `scripts` to `include`), `web/tests/feature-probe-size.test.ts` (post-Story-1.16 contract fix)

### NFR-M4 impact

The Vite plugin adds ~11 PNG file emissions + 11 HTML file emissions + 1 JSON file emission during `generateBundle`. Measured impact on `vite build`: indistinguishable from baseline (under 100 ms on author's machine). Well within the ≤5-min CI budget.

Once Story 7.x lands real Playwright PNG capture, the additional cost will be browser launch (~10-15 s) + 11 × ~2 s screenshot navigations = ~30-40 s total. Still well within budget.

### Completion notes

- All 5 tasks (T1-T5) complete with subtasks checked
- 1681 vitest pass; typecheck clean; lint at baseline (5 pre-existing warnings)
- Real-build artifacts at `c:/git/Voyager/web/dist/` ready for lead-side smoke
- R4 parity mitigation wired at three independent layers (core unit test, FS-level defense test, runner-script verifier)
