# Test Automation Summary — Story 2.6

**Story:** Pre-rendered Open Graph Cards per Chapter
**Date:** 2026-05-20
**QA agent:** qa-2-6 (epic-cycle-2026-05-20)

## Scope

The dev-authored test suite (Story 2.6) covers AC1–AC5 at three tiers:

- `web/src/build/og-cards.test.ts` — 26 tests for R4 parity
  (manifest entries === ALL_CHAPTERS slug-set, length, order),
  manifest entry shape, content-hash determinism, helper shape, and
  placeholder PNG signature.
- `web/src/build/og-html-emitter.test.ts` — 30 tests for required
  OG + Twitter Card tag set, attribute escape discipline, origin
  override, homepage default block, placeholder vs `</head>` fallback
  injection paths, per-chapter HTML round-trip across all 11 chapters.
- `web/scripts/og-cards-defense.test.ts` — 14 tests covering
  filesystem-level emit + verify against a temp dist/ directory:
  idempotency, R4 parity at the disk-write layer, missing-PNG /
  extra-slug / dropped-slug detection, CI-assertion path decoupled
  from emitter.

Total dev coverage: ~70 new tests; vitest baseline 1610 → 1681.

This QA stage fills cross-cutting gaps the dev suite does not
exercise:

- **Build-output integration against REAL `web/dist/` artifacts** —
  the dev tier exercises the script path (`scripts/og-cards.ts ::
  emitOgArtifacts`) against a temp directory and the core path
  (`src/build/og-cards.ts`) against in-memory objects, but never
  asserts against the REAL `web/dist/og/` + `web/dist/c/` tree
  produced by the Vite plugin (`vite.config.ts :: ogCardsPlugin`).
  The plugin path and the script path are two distinct code branches;
  a regression that breaks only the plugin path would slip past the
  dev tier. QA pins the cross-cutting contract against the real
  build output.
- **Vite plugin lifecycle ordering invariant** — the `ogCardsPlugin`
  declares `transformIndexHtml: { order: 'pre' }` so it captures the
  root HTML BEFORE `fallbackAndProbePlugin`'s post-order homepage
  OG injection. If a future contributor drops the `order: 'pre'`
  annotation, the captured root HTML would already carry the homepage
  OG block; `renderChapterHtml` would then fall back to the `</head>`
  injection path and stack TWO OG blocks per chapter shell. QA pins
  this invariant at the pure-function level so the regression test
  fires WITHOUT requiring a build.
- **Manifest schema round-trip stability** — the dev tier verifies
  manifest shape in memory but does not assert that `JSON.parse(
  JSON.stringify(buildOgManifest()))` is byte-identical to the
  original (no `Object.freeze` artefacts, no symbol props, no
  non-serialisable fields). Downstream Story 7.x Playwright capture
  + future CDN audit tooling will READ this file via `JSON.parse`;
  the schema contract needs to hold across the serialisation
  boundary.
- **ChapterDirector regression on the new `ChapterSpec.ogDescription`
  field** — per Voyager skill Rule 2 (Consumed-by linkage), adding
  a REQUIRED field to a previously-consumed type is a wire-up event
  that needs an explicit regression test. The contract IS that the
  director treats the field as opaque data (never reads or mutates
  it); QA pins that contract end-to-end.

## Test Framework

- **Framework:** Vitest 4.1.6 (existing project default).
- **Pattern:** matches the existing `tests/feature-probe-size.test.ts`
  build-integration model — gates on `dist/og/og-manifest.json`
  existing via `it.skipIf(!distHasOgArtifacts)`, so a unit-only
  `vitest run` (no prior build) doesn't fail. The CI lane is
  expected to `npm run build` before `npm test`.

## Generated Tests

### Build-output integration

- `web/tests/og-cards-build-integration.test.ts` (NEW, **15 tests + 1 expected-fail**)
  - `dist/og/og-manifest.json` exists and parses as JSON
  - on-disk manifest === `buildOgManifest()` (single source of truth)
  - exactly 11 entries (AC3 count + AC3 parity with `ALL_CHAPTERS.length`)
  - every entry has a corresponding PNG with PNG magic-byte signature
  - every `ALL_CHAPTERS` slug resolves to a hashed PNG matching `ogPngFilenameFor`
  - no extra PNG files in `dist/og/` (stale-build defense)
  - `dist/c/<slug>/index.html` exists for every chapter
  - each per-chapter HTML carries chapter-specific `og:url`, `og:title`,
    `og:description`
  - each per-chapter HTML has EXACTLY ONE `og:title` and ONE
    `twitter:title` (no homepage-block stacking — confirms the
    plugin's `order: 'pre'` invariant at the integration layer)
  - each per-chapter HTML carries all 9 expected meta tags
    (5 og + 4 twitter)
  - per-chapter `og:image` and `twitter:image` match the manifest
    entry's imagePath exactly
  - root `index.html` has exactly one `og:url` meta pointing at
    canonical origin `/`
  - root `index.html` uses v2-neptune card as the default homepage
    `og:image` (per AC2 note)
  - root `index.html` does NOT carry per-chapter `og:url`
    (no chapter-block leak into homepage)
  - root `index.html` has exactly 9 OG/Twitter meta tags
  - root `index.html` has the `OG_META` placeholder substituted
    (no leftover comment slot)

### Vite plugin lifecycle ordering

- `web/tests/og-cards-plugin-ordering.test.ts` (NEW, **5 tests**)
  - pristine root HTML produces a chapter shell with EXACTLY ONE
    `og:title` (good path)
  - REGRESSION DEMONSTRATION: HTML already carrying the homepage OG
    block (no `pre` capture) would double-inject (2 `og:title` tags)
  - all 11 chapters produce single-block shells from pristine HTML
  - injecting the homepage block via `OG_META` placeholder produces
    a single-block homepage
  - homepage block uses the v2-neptune card per AC2 note

### Manifest schema round-trip

- `web/tests/og-cards-manifest-roundtrip.test.ts` (NEW, **7 tests**)
  - `JSON.parse(JSON.stringify(buildOgManifest()))` deep-equals the original
  - serialised output is pretty-printed (2-space indent — pins the
    on-disk emission contract)
  - round-tripped manifest re-indexes cleanly via `indexManifestBySlug`
  - every entry has exactly the documented keys (no extra, no missing)
  - every entry field is a non-empty string of the right shape
    (`slug` kebab-case, `imagePath` hashed PNG path, `anchorIso`
    ISO-8601 UTC seconds)
  - `entries` array is sorted chronologically by `anchorIso`
    ascending (canonical view; Story 7.x may rely on this ordering)
  - schema version field is 1 across the round-trip

### ChapterDirector regression (consumed-by linkage)

- `web/tests/chapter-director-og-description-regression.test.ts` (NEW, **6 tests**)
  - constructs cleanly from real `ALL_CHAPTERS` (no missing field,
    no type drift)
  - every chapter has a non-empty `ogDescription` string (catches
    empty-string drift) and contains no raw HTML-special chars
  - `activeChapter` exposes `ogDescription` on the held chapter
    (downstream readability for future HUD chapter card)
  - transition events preserve `ogDescription` on `event.chapter`
  - FSM transition sequence is independent of `ogDescription`
    content (verified with two synthetic fixtures: very short and
    very long ogDescription strings)
  - 11-chapter rapid-scrub produces 44 transitions in chronological
    order (Story 2.1 AC5 contract still holds post-ogDescription
    addition)

## Verification

- `cd web && npm test -- --run` → **1717 pass | 1 expected fail (1718 total)**
  (was 1681; +36 passing tests across 4 new files, +1 expected-fail
  that documents the KNOWN REGRESSION below).
- `npm run typecheck` → clean.
- `npm run lint` → 5 pre-existing warnings, 0 new.
- Build artifacts at `c:/git/Voyager/web/dist/` ready (dev-2-6
  already ran the build); the integration tests run against them.

## QA finding — KNOWN REGRESSION (filed as follow-up, not blocking)

The `og-cards-build-integration.test.ts` suite surfaced a behaviour
issue in the per-chapter HTML shells:

**Symptom:** `dist/c/<slug>/index.html` for every chapter contains
the literal HTML comment `<!-- FEATURE_PROBE -->` instead of the
substituted inline `<script>(function(){ … })();</script>` boot
probe that `dist/index.html` carries. A user who navigates DIRECTLY
to `/c/<slug>` gets a static HTML page with no JS bootstrap — the
SPA never loads.

**Root cause:** the `ogCardsPlugin.transformIndexHtml` declares
`order: 'pre'`, which captures the root HTML BEFORE
`fallbackAndProbePlugin`'s post-order handler substitutes the
FEATURE_PROBE comment. The captured-then-cloned per-chapter shells
therefore still contain the placeholder comment.

**Trade-off:** the `'pre'` ordering is LOAD-BEARING for OG block
correctness — it keeps the `OG_META` placeholder intact so the
per-chapter block substitutes cleanly without double-injection.
Resolving this likely requires `ogCardsPlugin` to substitute the
FEATURE_PROBE placeholder explicitly when cloning the captured HTML
(call `buildProbeInline` once per chapter clone), or to move
per-chapter HTML emission to a post-order `transformIndexHtml`
per-route entry instead of the `generateBundle` hook.

**Severity assessment:**

- HIGH for direct-link landing UX — a user clicking a Discord/Slack
  preview link to `/c/<slug>` gets a dead page.
- LOW for OG card propagation (FR39 — the PRIMARY purpose of Story
  2.6): crawlers never execute JS; they DO read the meta tags
  correctly. The OG card flow works as intended.
- The Story 2.4 client-side router handles `/c/<slug>` paths from
  the homepage entry point, so users landing at `/` first and then
  navigating still get the right boot path.

**Test handling:**

- `it.fails` on the assertion that the per-chapter HTML matches the
  root probe payload — pins the contract; when the bug is fixed,
  vitest flags the `.fails` test for promotion to a positive gate.
- A companion baseline-lock assertion confirms the CURRENT
  (broken) state — both should be cleaned up together once fixed.

**Recommendation:** file a follow-up story in Epic 2 deferred-work
or Epic 4 (which lands Playwright + the real OG screenshot capture
— natural moment to revisit the per-chapter shell pipeline).

## Voyager skill-rule documentation

### Rule 3 — Browser-smoke per-story exit criterion (PARTIAL EXEMPTION)

Per the team lead's prompt: Story 2.6 is partially exempt from Rule 3
because it touches BUILD-time artifacts (`web/src/build/`,
`web/scripts/`) and a type-only field on `web/src/types/chapter.ts`,
not runtime browser surfaces. The `ChapterSpec.ogDescription` field
is consumed at build time by the OG generator; the runtime FSM in
`chapter-director.ts` treats it as opaque (verified by the new
regression test). Per the Story 2.6 Dev Agent Record's Lead-side
smoke recipe section: "ADR-0010 Layer-1 (Chrome DevTools MCP) is
reserved for stories whose code runs in a real browser; OG card
generation is build-only."

The `og-cards-build-integration.test.ts` suite IS the equivalent
gate — it inspects the served HTML and asset tree the way a
crawler would. The Chrome DevTools MCP smoke stage is correctly
skipped for this story.

The KNOWN REGRESSION above is the ONE place a real browser smoke
would have caught the issue earlier (a Chrome DevTools MCP
`navigate_page` to `/c/v2-neptune` would see the dead HTML). That
caveat is now captured in the test suite; future Story 2.6
follow-ups should add the MCP smoke for `/c/<slug>` direct-land.

### Rule 2 — Integration ACs

All four new test files exercise the integration AC6 from the story
file: smoke against built artifacts (PNG existence + meta tag
emission). The build-integration file is the primary IAC; the
plugin-ordering and round-trip files pin the contracts that IAC6
depends on.

### Rule 4 — Structured completion handshake

This QA agent is the `qa-2-6` sub-agent under
`/epic-cycle epic-cycle-2026-05-20`. Completion message sent to
`team-lead` via the SendMessage tool per the task-in-prompt mode
described in the team lead's prompt.

## Coverage

- Build artifact assertions: 11/11 chapters covered for PNG + HTML
- Plugin lifecycle ordering: covered + regression demonstrated
- Manifest schema: round-trip pinned + chronological ordering pinned
- ChapterDirector regression: covered (real registry + synthetic
  fixtures + rapid-scrub)

## Next Steps

- File a follow-up issue / story for the FEATURE_PROBE-in-per-chapter
  -HTML regression. Recommended landing point: Epic 4 alongside the
  Playwright PNG capture (Story 4.9 / 7.x).
- After Story 4.9 / 7.x lands, revisit `og-cards-build-integration
  .test.ts` — the placeholder PNG signature assertion will still
  hold (real PNG also begins with the signature), but the byte-size
  assertion can be tightened to "≥ 10 KB" (or similar) to confirm
  the real screenshot landed.
- Re-run the suite once the dev decides on the FEATURE_PROBE fix —
  remove the `.fails` modifier and promote the assertion to a
  positive gate; remove the companion baseline-lock test.
