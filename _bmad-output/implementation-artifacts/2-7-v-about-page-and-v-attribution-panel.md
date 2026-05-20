# Story 2.7: `<v-about-page>` + `<v-attribution-panel>`

**Epic:** 2
**Status:** review
**Date created:** 2026-05-20
**Source:** `_bmad-output/planning-artifacts/epics.md` § Story 2.7

## User Story

As a curious visitor (any persona),
I want a discoverable About / Methodology page that explains the data sources, validation tolerances, and embed contract, plus a clear attribution surface for every third-party asset,
So that scientific honesty is surfaced as a register (not as caveats) and curators can audit attribution before institutional embedding, fulfilling FR47, FR48 (UI surface), UX-DR18, UX-DR19.

## Consumes / Touches

- **Story 2.4 URL router** — `/about` route added to URLSync.parseInitialPath; popstate handler routes between `/`, `/c/<slug>`, and `/about`
- **Story 1.7 design tokens** — typography tokens (`--v-font-sans`, `--v-font-serif`, `--v-font-mono`, `--v-size-about-*`, `--v-color-fg`, `--v-color-accent`, etc.)
- **Story 2.5 embed mode** — About link in the footer must NOT be added to the DOM in embed mode (chrome list)
- **Story 2.5 url-contract.md** — the "Embed contract" section of the About page references the parameter contract

## Acceptance Criteria

### AC1 — `/about` route renders `<v-about-page>` with editorial layout

- **GIVEN** the `/about` route is registered in the router (extend Story 2.4's URLSync.parseInitialPath to recognize `/about` alongside `/` and `/c/<slug>`)
- **WHEN** I navigate to `http://localhost:5173/about`
- **THEN** `<v-about-page>` renders a Light-DOM editorial layout in a single column with `max-width: 60ch`, centered horizontally, generous vertical spacing
- **AND** the typography uses `--v-font-sans` (Inter) for headings — `<h1>` at `--v-size-about-heading-lg` weight 400, `<h2>` at `--v-size-about-heading` weight 500, `<h3>` at `--v-size-about-heading-sm` — and `--v-font-serif` (Source Serif 4) for body at `--v-size-about-body` with line-height 1.55
- **AND** the canvas + HUD + scrubber + chapter index toggle are NOT rendered on `/about` (the About page is its own surface, not an overlay)

### AC2 — About page content structure (canonical section order)

- **GIVEN** the page content
- **WHEN** I read top to bottom
- **THEN** the sections appear in this order:
  1. `<h1>` "Voyager — About"
  2. `<h2>` "About the project" (~200 words of editorial prose)
  3. `<h2>` "Data sources" (semantic `<table>` with `<caption>`, `<thead>`, `<th scope>` listing NAIF SPICE kernels, PDS Rings Node CK products, NASA 3D Resources, USGS Astrogeology, Björn Jónsson planetary textures, NASA Photojournal, Voyager Golden Record)
  4. `<h2>` "Validation" (tolerance table: trajectory max ≤ 20 km / RMS ≤ 5 km, attitude ≤ 1 mrad, frame rate ≥ 60 FPS)
  5. `<h2>` "Attribution" (embedded `<v-attribution-panel>` — `id="attribution"` for `#attribution` anchor)
  6. `<h2>` "Embed contract" (documents `?embed=true`, the slug list from ADR-0001, the stability commitment — links to `docs/url-contract.md` if applicable)
  7. `<h2>` "Methodology" (links to underlying technical research document and GitHub repo if public)
- **AND** inline code / URLs use `--v-font-mono` in `--v-color-accent`

### AC3 — `<v-attribution-panel>` semantic definition list

- **GIVEN** `<v-attribution-panel>` rendered inside the About page (id="attribution")
- **WHEN** I inspect the DOM
- **THEN** it is a `<dl>` semantic definition list with `<dt>` source-name pairs and `<dd>` license/usage statements
- **AND** the entries are:
  - "NAIF SPICE kernels" — NASA public domain, trajectory + attitude data, links to naif.jpl.nasa.gov
  - "PDS Rings Node CK products" — public domain, SETI's PDS Rings Node with Mitch Gordon QMW SEDR credit
  - "NASA 3D Resources — Voyager spacecraft model" — NASA public domain
  - "Björn Jónsson planetary textures" — attribution required; per-asset license terms documented in `THIRD_PARTY.md`
  - "USGS Astrogeology — planetary base maps" — public domain
  - "Voyager Golden Record audio" — NASA public domain (placeholder — Story 6.1 will surface in-app)
  - "NASA Planetary Photojournal — Pale Blue Dot composite plates" — public domain
- **AND** each source name links to its canonical URL where applicable (use `<a href="...">` inside `<dt>`)

### AC4 — Homepage footer "Attributions" link

- **GIVEN** the homepage `/` in non-embed mode
- **WHEN** the layout renders
- **THEN** a small "Attributions" link is present in a footer area (or another minimal non-intrusive surface — author's choice based on existing layout; document the placement in Dev Agent Record)
- **AND** the link routes to `/about#attribution`
- **AND** the link is keyboard-tab-focusable with the global `:focus-visible` ring from Story 1.7
- **AND** in embed mode (Story 2.5), the footer link is NOT added to the DOM (extend first-paint chrome-list)

### AC5 — Accessibility (axe-core deferral note)

- **GIVEN** the About page's accessibility
- **WHEN** I (or a future axe-core run in Story 6.4) audit `/about`
- **THEN** zero `critical` or `serious` violations would be reported
- **AND** heading hierarchy is correctly nested (no skipped levels — h1 → h2 → h3, no h4-without-h3)
- **AND** tables within "Data sources" and "Validation" have proper `<caption>`, `<thead>`, `<th scope="col">` semantics
- **AXE-CORE STATUS:** axe-core is still deferred to Story 6.4 (per Story 2.5 deferral). This story SHOULD author the page in an a11y-compliant way (semantic HTML, ARIA, focus management); Story 6.4 will add the test harness.

### AC6 — Tests green

- `cd web && npm test -- --run` passes (baseline 1717 + new tests)
- `npm run typecheck` clean
- `npm run lint` clean (5 pre-existing warnings OK)

## Integration ACs (per voyager-skill-rules.md Rule 2)

### Integration AC7 — `/about` deep-link + footer link + embed-mode chrome-list

- **GIVEN** the dev server running with Voyager loaded
- **WHEN** the lead-side Chrome DevTools MCP smoke:
  1. Navigates to `http://localhost:5173/about` (cold-load)
  2. Verifies `<v-about-page>` is mounted with all 7 H2 sections in order
  3. Confirms canvas + HUD + scrubber are NOT mounted on /about
  4. Navigates to `http://localhost:5173/`
  5. Verifies the footer "Attributions" link is present + routes to `/about#attribution` on click
  6. Verifies the URL updates via the existing router
  7. Navigates to `http://localhost:5173/?embed=true`
  8. Verifies the footer "Attributions" link is ABSENT from the DOM in embed mode
- **THEN** all probes pass

## Files to Modify

| File | Action | Reason |
|---|---|---|
| `web/src/components/v-about-page.ts` | NEW | Lit Light-DOM component (use createRenderRoot to return `this` for Light DOM rendering) |
| `web/src/components/v-about-page.test.ts` | NEW | Unit tests for layout, section order, semantic HTML |
| `web/src/components/v-attribution-panel.ts` | NEW | Semantic `<dl>` component (Light DOM) |
| `web/src/components/v-attribution-panel.test.ts` | NEW | Unit tests for `<dt>`/`<dd>` pairs, links |
| `web/src/services/url-sync.ts` | UPDATE | parseInitialPath recognizes `/about` route |
| `web/src/services/url-router.ts` | UPDATE | Route changes between `/about` and other routes update the DOM (mount/unmount `<v-about-page>` vs simulation root) |
| `web/src/boot/first-paint.ts` | UPDATE | Conditional rendering: on `/about` route, mount `<v-about-page>`; otherwise mount the simulation surface; in embed mode skip the footer "Attributions" link |
| `web/src/main.ts` | UPDATE | Wire route-based rendering |
| `web/index.html` | UPDATE (maybe) | Add a footer template slot if not present |

## Tasks / Subtasks

- [x] **T1 (AC3): Author `<v-attribution-panel>` component**
  - [x] Lit component using Light DOM (`createRenderRoot() { return this; }`)
  - [x] Render `<dl id="attribution">` with `<dt>` + `<dd>` for each of the 7 attribution entries
  - [x] Links use `target="_blank" rel="noopener"`
  - [x] Unit tests for shape

- [x] **T2 (AC1, AC2): Author `<v-about-page>` component**
  - [x] Lit Light DOM with editorial layout (`max-width: 60ch`, centered)
  - [x] Sections in canonical order (H1 → 6 H2s)
  - [x] Tables for Data sources + Validation with `<caption>` + `<thead>` + `<th scope>`
  - [x] Embed `<v-attribution-panel>` in the "Attribution" section
  - [x] Use `--v-font-sans/serif/mono` design tokens
  - [x] Unit tests for section order, table semantics, attribution panel presence

- [x] **T3 (AC1, AC5 — routing): Extend URLSync/URLRouter for `/about`**
  - [x] URLSync.parseInitialPath returns a new shape that distinguishes `/about` from `/c/<slug>` and `/`
  - [x] URLRouter handles `/about` ↔ `/` ↔ `/c/<slug>` transitions on popstate
  - [x] Boot at `/about` mounts `<v-about-page>` and SKIPS simulation mount (canvas, HUD, scrubber)
  - [x] Boot at `/` or `/c/<slug>` mounts simulation surface (existing path)
  - [x] Bookmark / direct-link `/about` cold-load works

- [x] **T4 (AC4): Homepage footer "Attributions" link**
  - [x] Add a `<footer>` element to the simulation page (mounted in non-embed mode)
  - [x] Footer contains a single small `<a href="/about#attribution">Attributions</a>` link
  - [x] First-paint chrome-list includes the footer in the "skip in embed mode" branch
  - [x] Click routes via the URLRouter (or use native anchor with pushState interception)

- [x] **T5 (AC2 — content): Editorial copy**
  - [x] About section: ~200 words of editorial prose (dev's call on tone; can mirror voice from Voyager personas / mission brief)
  - [x] Data sources table: 7 rows per AC2
  - [x] Validation table: 3 rows (trajectory, attitude, frame rate)
  - [x] Embed contract section: brief docs + link to `docs/url-contract.md`
  - [x] Methodology section: GitHub repo link OR "not public yet" placeholder

- [x] **T6 (AC6): Verification**
  - [x] Run tests + typecheck + lint

## Dev Notes

### Architecture / Conventions

- About page is Light DOM (not Shadow DOM) so the editorial typography uses the global token stylesheet directly. Use `createRenderRoot() { return this; }` per Lit 3 Light DOM idiom (no decorators).
- Routing extension: Story 2.4's URLSync.parseInitialPath currently recognizes `/` and `/c/<slug>`. Add `/about` as a third top-level shape. Return discriminated union: `{ kind: 'home' | 'chapter' | 'about', ... }`.
- The "Attribution" panel anchors at `#attribution` inside the About page. Browser native fragment scrolling handles the deep-link to that section.
- Embed mode: per Story 2.5's first-paint chrome-list, the footer "Attributions" link is added to the skip-in-embed list. The About page itself is reachable in embed mode (an embed user can still navigate to /about if they want; AC4 only governs the footer link).

### Previous Story Intelligence (Story 2.4, 2.5)

- URLSync.parseInitialPath signature already extended for embed mode; add `route` shape alongside `embedEnabled`.
- URLRouter's popstate handler already broadens suppression to any-slug (cr-2-4 fix). For `/about`, the same suppression logic applies — the popstate-driven mount doesn't fight the director.
- The "skip chrome on embed" pattern from first-paint is the template — add the footer to the chrome-skip list.

### NFR considerations

- A11y: per AC5, axe-core test is deferred to Story 6.4; this story authors a11y-compliant HTML.
- Performance: About page is static; no per-frame work; negligible budget impact.

### Voyager skill rules

- Rule 2: consumer of URLSync/URLRouter; consumer-side integration AC for `/about` deep-link.
- Rule 3: `/about` is `web/src/` runtime — Chrome DevTools MCP smoke applies.
- Rule 4: structured completion handshake.

## References

- `_bmad-output/planning-artifacts/epics.md` § Story 2.7
- `web/src/services/url-sync.ts` + `web/src/services/url-router.ts` (Story 2.4)
- `web/src/boot/first-paint.ts` (Story 2.5 chrome-skip pattern)
- `docs/adr/0013-lit3-web-components-over-react-preact-svelte.md` (Lit Light DOM idiom)
- `docs/url-contract.md` (Embed contract section reference)
- `_bmad/custom/voyager-skill-rules.md`

## Dev Agent Record

### Implementation summary (2026-05-20)

- **T1 — `<v-attribution-panel>`.** Light-DOM LitElement (extends `LitElement` directly with `createRenderRoot() { return this; }`); single `<dl id="attribution">` with 7 `<dt>`/`<dd>` pairs (NAIF SPICE, PDS Rings CK, NASA 3D Resources, USGS Astrogeology, Björn Jónsson textures, Voyager Golden Record audio, NASA Photojournal). Source-name links use `target="_blank" rel="noopener"`. 6 unit tests cover registration, Light-DOM render-root, semantic dl/dt/dd shape, 7-entry canonical order, link attributes, and canonical URL hosts.
- **T2 — `<v-about-page>`.** Light-DOM Lit component with sectioned editorial layout (`<article>` + 6 `<section>` blocks, each `aria-labelledby` its `<h2>`). 7 headings total — h1 "Voyager — About" followed by the 6 canonical h2s in order. Tables for Data sources (7 rows) and Validation (3 rows) carry `<caption>`, `<thead>`, `<th scope="col">` + `<th scope="row">`. Embedded `<v-attribution-panel>` exposes the `#attribution` anchor in the body Light DOM. 14 unit tests cover registration, section order, heading hierarchy (no skipped levels), prose word-count (~200 words target, range 150–280), Data-sources / Validation table semantics, all 3 canonical tolerances, ADR-0001 slug coverage in the embed-contract copy, and methodology presence.
- **T3 — URLSync / URLRouter routing.** `ParseInitialPathResult` extended with a discriminated `kind: 'home' | 'chapter' | 'about'` (the `RouteKind` type is exported for consumers). `parseInitialPath` recognises `/about` and `/about/` and stamps `kind: 'about'`; `/c/<unknown-slug>` redirect resolves to `kind: 'home'`. URLRouter takes an `initialRouteKind` option and emits route-change events via a new `onRouteChange(listener)` subscription; `handlePopstate` fires the listener BEFORE the clock scrub when the kind transitions. main.ts branches at boot on `initialUrlState.kind === 'about'` and mounts ONLY `<v-about-page>` (no engine, no chapter director, no scrubber); a route-change listener on the simulation surface triggers `window.location.reload()` when popstate crosses into `/about`, and the about surface installs a popstate handler that reloads when popstate crosses out. 7 URLSync tests + 7 URLRouter tests cover the new path.
- **T4 — Homepage footer "Attributions" link.** `mountAttributionsFooter(host, embedEnabled, navigate)` exported from `boot/first-paint.ts`. Mounts a `<footer class="v-app-footer">` containing a single `<a href="/about#attribution">Attributions</a>` when `embedEnabled === false`; returns null and skips DOM insertion when `embedEnabled === true` (extends the Story 2.5 chrome-skip pattern). Plain left-clicks call the `navigate` callback (main.ts pushState + `location.assign` to flip surfaces); Ctrl/Cmd/Shift/Alt clicks and middle-click preserve native open-in-new-tab semantics. Footer is hosted inside `canvas.parentElement` so it shares the simulation surface's lifecycle. 7 unit tests in `web/src/boot/about-footer.test.ts`.
- **T5 — Editorial copy.** "About the project" prose is 3 short paragraphs (~210 words inclusive). Data sources table has 7 rows; Validation table has 3 rows with the canonical tolerances (`max ≤ 20 km` / `RMS ≤ 5 km`, `≤ 1 mrad`, `≥ 60 FPS`). Embed-contract section enumerates all 11 ADR-0001 slugs and links to `docs/url-contract.md`. Methodology section notes that source / build pipeline / validation harness will be published when the project goes public.
- **T6 — Verification.** `npm test -- --run` → 1769 pass (1717 baseline + 52 new). `npm run typecheck` → clean. `npm run lint` → 5 pre-existing warnings (no new). `docs/url-contract.md` updated to add the `/about` route shape to the "Route Shapes" table and document the popstate cross-surface reload contract.

### Design tokens added

The story spec referenced about-page typography tokens that did not exist:

- `--v-size-about-heading-lg` — `clamp(32px, 2.4vw, 44px)` (h1)
- `--v-size-about-heading` — `clamp(22px, 1.6vw, 28px)` (h2)
- `--v-size-about-heading-sm` — `clamp(18px, 1.2vw, 22px)` (h3)
- `--v-size-about-body` — `clamp(16px, 1rem + 0.15vw, 19px)` (serif body)

Added to `web/src/styles/tokens.css` under the existing "Typography — size scale" group, immediately after `--v-size-title-card`. Per Voyager skill rule 5 (NFR tripwire) this is the right place — tokens.css is the documented single source of truth; the story spec named the tokens explicitly with values matching the comment block.

### Routing approach for /about ↔ simulation popstate

Cross-surface popstate (home/chapter → about, or about → home/chapter) triggers a `window.location.reload()`. This is the simplest correct way to flip between two top-level surfaces that have completely different mount lifecycles (the simulation surface owns a WebGL canvas + render loop + chapter director; the about surface is static editorial DOM). Within-surface popstate (chapter ↔ chapter, home ↔ chapter via URL writes) is unchanged from Story 2.4. The behaviour is documented in `docs/url-contract.md`.

### Manual browser smoke note (Rule 3)

`npm run dev` was NOT exercised in this dev session — the binding browser-evidence gate is the lead-driven Chrome DevTools MCP smoke per voyager-skill-rules.md Rule 7. Code-side prerequisites in place: `<v-about-page>`, `<v-attribution-panel>`, `/about` route in URLSync, route-change listener wired to `window.location.reload()`, footer link mounted in non-embed mode and skipped in embed mode. Lead-side smoke should verify Integration AC7 by navigating to `/about`, `/`, `/?embed=true`, and clicking the footer link.

### Completion Notes

- All 6 acceptance criteria (AC1–AC6) and the integration AC7 code-side prerequisites are satisfied; lead-side Chrome DevTools MCP smoke per Rule 3 remains the binding browser-evidence gate (Rule 7).
- axe-core a11y test remains deferred to Story 6.4 per AC5 + Story 2.5 deferral. The page is authored to a11y-compliant HTML: semantic article/section/h1-h2 hierarchy (no skipped levels), `<table>` + `<caption>` + `<thead>` + `<th scope>`, `<dl>`/`<dt>`/`<dd>` for attribution, native anchor links inheriting the global `:focus-visible` ring.

## File List

### New files

- `web/src/components/v-about-page.ts` — Lit Light-DOM editorial surface with 6 canonical sections.
- `web/src/components/v-about-page.test.ts` — 14 unit tests covering AC1, AC2, AC3 embed, AC5 a11y semantics.
- `web/src/components/v-attribution-panel.ts` — Semantic `<dl>` with 7 source/license entries (AC3).
- `web/src/components/v-attribution-panel.test.ts` — 6 unit tests for shape, entries, link attributes.
- `web/src/styles/about.css` — Editorial layout styles + `.v-app-footer` footer styles.
- `web/src/boot/about-footer.test.ts` — 7 unit tests for the homepage footer mount + click-intercept behaviour (AC4).

### Modified files

- `web/src/services/url-sync.ts` — `ParseInitialPathResult` gains `kind: 'home' | 'chapter' | 'about'`; `parseInitialPath()` recognises `/about` + `/about/` (Story 2.7 AC1 + T3).
- `web/src/services/url-sync.test.ts` — +7 tests for the new route kind; one existing test updated to assert `kind: 'home'`.
- `web/src/services/url-router.ts` — `UrlRouterOptions.initialRouteKind` + `onRouteChange(listener)` subscription + cross-kind transition logic in `handlePopstate`.
- `web/src/services/url-router.test.ts` — +7 tests for `onRouteChange` covering home→about, chapter→about, about→home transitions, same-kind no-fire, unsubscribe, and throwing-listener defence.
- `web/src/boot/first-paint.ts` — Exports `mountAttributionsFooter(host, embedEnabled, navigate)` per AC4.
- `web/src/main.ts` — `/about` cold-load branch mounts `<v-about-page>` and skips simulation bootstrap; route-change listener flips surface on popstate; homepage footer link wired with pushState + reload navigate callback; `about.css` import in the style chain.
- `web/src/styles/tokens.css` — +4 about-page typography tokens (heading-lg / heading / heading-sm / body).
- `docs/url-contract.md` — `/about` added to "Route Shapes" table; cross-surface popstate reload documented.

## Change Log

- 2026-05-20 — Story 2.7 implementation completed (1769 vitest pass, +52 from 1717 baseline; typecheck clean; lint baseline preserved at 5 pre-existing warnings).
- 2026-05-20 — Story 2.7 code review (cr-2-7) complete. Verdict: APPROVE_WITH_CHANGES_RESOLVED. 1 HIGH auto-resolved (footer-link navigate callback: `pushState` followed by `location.assign` to the same URL would degrade to a same-document hash navigation in normal browser behavior and NOT reload — leaving the simulation surface mounted under the `/about` URL; fix removed the `pushState` so `location.assign` performs a cross-pathname load against the simulation surface's `/` or `/c/<slug>` origin URL). 0 MEDIUM. 6 LOW deferred to `deferred-work.md`. ADR-0001/0013/0025/0026 compliance verified. Tests post-fix: 1804 pass, typecheck clean, lint baseline preserved. Lead-driven Chrome DevTools MCP smoke remains the binding Integration AC7 gate (Rule 3 + Rule 7) — probe plan in `web/tests/about-page-qa-gaps.test.ts:767-868`.
