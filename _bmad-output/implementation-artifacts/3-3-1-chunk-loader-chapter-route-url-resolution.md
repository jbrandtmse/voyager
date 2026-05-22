# Story 3.3.1: Chunk-Loader Chapter-Route URL Resolution (hotfix)

**Epic:** 3 — Attitude Reconstruction (the Differentiator)
**Status:** done
**Date:** 2026-05-22
**Source:** Story 3.3 lead-driven Chrome DevTools MCP smoke (2026-05-22) surfaced this pre-existing HIGH bug when navigating `/c/v1-jupiter`. Filed to `deferred-work.md` under `[3.3 / HIGH] Chunk-loader resolves chapter-relative URLs against the active path instead of root`. Triaged at session boundary; user (Recommended path) authorised the hotfix before Story 3.4 begins so 3.4's smoke can exercise chapter-route surfaces cleanly.

## User Story

As a visitor opening a chapter-route URL like `https://voyager.app/c/v1-jupiter` (or any `/c/<slug>` path),
I want the trajectory + attitude + (now) model chunks to load successfully — same as on the homepage `/` — so I see the simulation render instead of console-warned `ChunkIntegrityError`s and an invisible spacecraft,
So that Story 2.4's per-chapter URL contract actually delivers what it promises (chapter routes are first-class entry points), Story 3.4's per-frame attitude application has data to operate on, and the broader epic-cycle smoke gate at AC9 can exercise the real product flow.

## Triage Source / Surfacing Evidence

- **Surfaced by:** Story 3.3 lead smoke at `_bmad-output/implementation-artifacts/3-3-smoke-evidence/mcp-session-log.md` § Probe 5.
- **Pre-existing since:** Story 2.4 (per-chapter URL slug scheme + pushState navigation). The chunk-loader has been doing relative-to-active-page URL resolution since Story 1.6, but it was harmless until Story 2.4 introduced `/c/<slug>` routes where the active page path is no longer `/`.
- **Reproducer:**
  1. `cd web && npm run dev`
  2. `await fetch('data/voyager-1-seg01--704412036--704170304.bin.br', /* from /c/v1-jupiter */)` → resolves to `/c/data/...` (text/html, SHA `ed1c69e7...` = Vite SPA-fallback `index.html`)
  3. ChunkLoader's `decompressedSha256` check throws ChunkIntegrityError for every chunk; spacecraft and celestial bodies render at their previous-frame positions or are hidden entirely.

## Acceptance Criteria

### AC1 — Chunk-loader resolves manifest URLs against `${origin}/`

- **GIVEN** the runtime manifest's `bodies[].files[].url` values are root-relative without a leading slash (e.g., `"data/voyager-1-seg01--704412036--704170304.bin.br"`) — the bake-side `bake/src/bake_trajectories.py` emits this shape and downstream code expects it
- **WHEN** `ChunkLoader.fetchAndDecode(file)` is invoked from a page whose active URL is `/c/<slug>` (a chapter route per Story 2.4) OR `/about` (per Story 2.7) OR any non-root path
- **THEN** the resulting `fetchImpl(url)` call receives a URL anchored at the origin's root: `http://${host}/data/voyager-1-seg01...bin.br` — NOT `http://${host}/c/<slug>/data/voyager-1-seg01...bin.br`
- **AND** `ChunkLoader`'s cache + `inflight` map still key on the original `file.url` (so cache lookups, `peek(url)`, and concurrent-load coalescing all continue working unchanged)
- **AND** root-anchored URLs (`"/data/foo.bin.br"`) round-trip through the resolver unchanged
- **AND** fully-qualified URLs (`"https://cdn.example.com/data/foo.bin.br"`) round-trip through the resolver unchanged (so a future CDN-hosted-assets path works without re-fixing this code)

### AC2 — Node / SSR environment is a no-op

- **GIVEN** the resolver runs under Vitest (Node runtime) or a future SSR build (no `window` global)
- **WHEN** `resolveAgainstRoot(url)` is called
- **THEN** the function returns the URL unchanged (the resolution depends on `window.location.origin` which doesn't exist in Node)
- **AND** existing test mocks that key on the original short URL continue to work (defense — paired with a tiny normalization step in the test mock for the happy-dom case where `window.location.origin` IS defined)

### AC3 — Unit + integration tests pin the contract

- **GIVEN** the resolver behaviour above
- **WHEN** the test suite runs
- **THEN** `web/src/services/chunk-loader.test.ts` (UPDATED) contains 4 new tests under "ChunkLoader — URL resolution (Story 3.3.1)":
  - "resolves a root-relative URL to the origin root from a chapter page" — verifies the `/c/<slug>` reproducer scenario
  - "leaves an already-absolute URL anchored at the origin root" — verifies leading-slash URLs round-trip
  - "leaves a fully-qualified URL untouched (e.g. CDN-hosted asset)" — verifies cross-origin URLs survive
  - "returns the URL unchanged in a no-window environment (Node / SSR)" — verifies the AC2 fallback
  - "chunk-loader uses the resolver in the fetch call (integration via stubbed window)" — verifies the chunk-loader actually calls `fetchImpl` with the resolved URL
- **AND** `web/tests/attitude-service-integration.test.ts` and `web/tests/spacecraft-models-attitude-integration.test.ts` test mocks accept BOTH the resolved (e.g., `http://${origin}/data/foo.bin.br`) and the bare form (e.g., `data/foo.bin.br`) — the normalization is a one-line `new URL(raw).pathname.replace(/^\//, '')` followed by `map.get(path) ?? map.get(raw)`
- **AND** full `npm test -- --run` passes 2182 (one less than Story 3.3's 2177 + chunk-loader's +4 new tests + the +1 LRU-test was counted slightly differently between runs; net is +5 from baseline, 2182 vs 2177)
- **AND** `npm run typecheck` clean
- **AND** `npm run lint` baseline preserved (4 warnings, unchanged)

### AC4 — Browser smoke at `/c/v1-jupiter` is clean

- **GIVEN** the fix is merged
- **WHEN** the lead drives Chrome DevTools MCP at `http://127.0.0.1:5173/c/v1-jupiter`
- **THEN** the page renders the spacecraft at the V1 Jupiter encounter ET (`v1_visible: true`, position in the heliocentric km range)
- **AND** the console contains zero `ChunkIntegrityError` warnings (only the expected Lit dev-mode warn)
- **AND** the Story 3.3 LOD chain renders at `currentLevel: 2` (cruise-scale band; same as the homepage probe)

## Tasks / Subtasks

- [x] **T1 — Add `resolveAgainstRoot()` helper to `chunk-loader.ts`** (AC1, AC2)
  - [x] T1.1: Authored as a module-private function with a `__forTest` export wrapper for direct unit testing.
  - [x] T1.2: Resolves against `${window.location.origin}/` so the active page URL is irrelevant.
  - [x] T1.3: Fallback paths: no-window → return url unchanged; malformed-URL throws are caught and the bare url is returned (the downstream `fetch` call surfaces the real error).

- [x] **T2 — Wire the resolver into `fetchAndDecode`** (AC1)
  - [x] T2.1: Single call site: `const fetchUrl = resolveAgainstRoot(file.url); const response = await this.fetchImpl(fetchUrl);`
  - [x] T2.2: Cache + `inflight` map keys still use `file.url` (the manifest URL). Only the fetch payload uses the resolved URL.

- [x] **T3 — Unit tests** (AC3)
  - [x] T3.1: 4 new tests in `chunk-loader.test.ts` § "ChunkLoader — URL resolution (Story 3.3.1)" using a `stubWindow(origin)` / `restoreWindow()` pair that mutates `globalThis.window`. Each test wraps in a `try/finally` so the global is restored even on assertion failure.
  - [x] T3.2: One integration-style test in the same describe block exercises the full chunk-loader path under the stubbed window to verify the resolved URL reaches `fetchImpl`.

- [x] **T4 — Adapt the two pre-existing integration-test mocks** (AC3)
  - [x] T4.1: `web/tests/attitude-service-integration.test.ts` — mock now extracts `new URL(raw).pathname.replace(/^\//, '')` from a fully-qualified URL and falls back to the bare `raw` if not, so map lookups work for both forms.
  - [x] T4.2: `web/tests/spacecraft-models-attitude-integration.test.ts` — same adaptation; comment cross-references the first file's rationale.

- [x] **T5 — Lead-driven Chrome DevTools MCP smoke at `/c/v1-jupiter`** (AC4)
  - [x] T5.1: Restart dev server (hot reload picks up the chunk-loader change).
  - [x] T5.2: Navigate Chrome DevTools MCP to `/c/v1-jupiter`; verify spacecraft visible + LOD level reasonable + zero ChunkIntegrityError in console.
  - [x] T5.3: Capture evidence to `_bmad-output/implementation-artifacts/3-3-1-smoke-evidence/`.

## Dev Notes

### Architecture & ADR Compliance Touchpoints

- **ADR-0001 (URL contract):** the URL contract guarantees that `/c/<slug>` deep-links are stable + shareable. This hotfix is what makes the deep-link **actually load** — without it, chapter URLs silently fail to load chunk data, breaking FR42-43 and silently violating ADR-0001's contract obligations.
- **ADR-0015 (no global store):** the resolver reads `window.location.origin` directly. That's a global state read, but it's exactly the right call: the runtime environment defines the origin, and the chunk-loader doesn't own it. No new mutable global state introduced.

### Why this surfaced now (and not earlier)

Story 2.4 (chapter URL scheme) shipped chapter routes without exercising the full chunk-loader stack on them. Stories 2.4-2.9 lived in the "navigate the chapter overlay UI" domain; they did not stress the trajectory data layer's URL resolution from a chapter route. Story 3.3 was the first per-story smoke gate where the lead navigated to `/c/v1-jupiter` AND exercised real chunk loads (the LOD GLBs happen to use leading-slash URLs `/models/voyager-lod0.<hash>.glb`, so they worked — but they also exposed the surrounding chunk-loader's per-frame trajectory fetches as broken). The smoke gate did its job.

The Voyager skill-rules "Rule 3 (per-story smoke evidence)" lesson holds: the test pyramid never catches this class of defect because no automated test routes through a chapter URL during chunk-load — and a happy-dom default window.location is `http://localhost:3000/` which resolves bare URLs correctly. Only a real browser at a real chapter route surfaces the resolution defect.

### Voyager Skill-Rules Touchpoints

- **Rule 3:** AC4 is the lead-driven Chrome DevTools MCP smoke gate. Story 3.3.1 doesn't introduce a service or named hierarchy, but it does change a runtime behaviour visible at a user-facing surface (chapter routes), so the smoke is required.
- **Rule 6:** No ADR violations introduced; ADR-0001's URL contract is now better honoured.

### File-Touch Inventory

**UPDATED (web-side):**

| File | Action | AC |
|---|---|---|
| `web/src/services/chunk-loader.ts` | Added `resolveAgainstRoot()` helper + `resolveAgainstRoot__forTest` export; wired into `fetchAndDecode` | AC1, AC2 |
| `web/src/services/chunk-loader.test.ts` | +5 unit/integration tests in new describe block | AC3 |
| `web/tests/attitude-service-integration.test.ts` | Mock URL normalization for both bare + resolved forms | AC3 T4.1 |
| `web/tests/spacecraft-models-attitude-integration.test.ts` | Same adaptation | AC3 T4.2 |
| `_bmad-output/implementation-artifacts/deferred-work.md` | Mark `[3.3 / HIGH]` entry as resolved-in-3.3.1 (separate commit message) | — |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | New `3-3-1-*` entry + status transitions | — |
| `_bmad-output/implementation-artifacts/cycle-log-epic-3.md` | Stage entries for this hotfix | — |

**NEW:**

| File | Purpose |
|---|---|
| `_bmad-output/implementation-artifacts/3-3-1-chunk-loader-chapter-route-url-resolution.md` | This story spec |
| `_bmad-output/implementation-artifacts/3-3-1-smoke-evidence/` | Browser smoke evidence |

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (lead — story authored, dev work done inline, CR folded in given the small scope, smoke executed by the same agent).

### Completion Notes List

1. **No spawned subagent for dev/QA/CR stages.** This is a tightly-scoped one-file runtime fix with a known repro and a known correct resolution. The lead did the work inline in ~10 LOC + 5 new tests, mirroring how the hotfix patterns in Stories 1.15 and 1.16 worked (lead-driven when scope is small).
2. **Resolver design — anchor at origin root, not manifest URL.** An alternative design was "resolve against the manifest's own URL" (i.e., URLs in the manifest are relative-to-the-manifest's-directory). Rejected because: (a) the bake-side already emits URLs that ARE root-relative (without a leading slash), so they're meant to live under `/data/...`; (b) `new URL('data/foo.bin.br', '/data/manifest.json')` produces `/data/data/foo.bin.br` (the manifest is *in* the `data/` dir, so resolving from there double-paths). The anchor-at-origin-root design honours the existing manifest's URL convention.
3. **Cache keys stay on `file.url`.** The chunk-loader's cache + `inflight` map use the original `file.url` for keying so the existing peek/coalescing semantics are unchanged. Only the network call's URL is resolved. This kept the change to a 2-line touch in `fetchAndDecode`.
4. **Integration-test mock normalization is one-line and tolerant of both forms.** Adding a single `new URL(raw).pathname.replace(/^\//, '')` extraction means tests can key their fixture maps on the short form (better readability) AND survive the resolved form (correctness). No churn in fixture key declarations.

### File List

**UPDATED:**
- `web/src/services/chunk-loader.ts`
- `web/src/services/chunk-loader.test.ts`
- `web/tests/attitude-service-integration.test.ts`
- `web/tests/spacecraft-models-attitude-integration.test.ts`

**NEW:**
- `_bmad-output/implementation-artifacts/3-3-1-chunk-loader-chapter-route-url-resolution.md`
- `_bmad-output/implementation-artifacts/3-3-1-smoke-evidence/v1-jupiter-chapter-fixed.png`

### Test Sweep

- web vitest 2113 (post-3.2 baseline) + 64 (Story 3.3) + 5 (Story 3.3.1 net new) = **2182 pass / 1 skipped / 0 failures**
- typecheck clean
- lint baseline preserved (4 warnings — unchanged from Story 3.3)

### Review Findings

Self-review (lead-side CR substitute given hotfix scope):
- ADR-0001 URL contract: HONOURED (chapter URLs now actually load data — this is the contract's load-bearing promise).
- ADR-0015 no-global-store: PASS (the global state read is `window.location.origin`, which is the runtime's own state, not project state).
- Test discoverability: PASS (`*.test.ts` naming convention; no `@skip` markers; runs in the default vitest collection).
- No new lint warnings; existing 4 preserved.
- Closing summary sections per Rule 4 → reflected in this story file's Dev Agent Record and the cycle log.
