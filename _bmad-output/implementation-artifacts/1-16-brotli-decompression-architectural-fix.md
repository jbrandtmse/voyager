# Story 1.16: Brotli Decompression Architectural Fix

**Epic:** 1 — Foundation & First Vertical Slice (Cruise Viewer)
**Status:** ready-for-dev
**Date created:** 2026-05-20
**Source:** Epic 1 retrospective continuation, 2026-05-19 — see `epic-1-retro-2026-05-19.md` § 3a (The Lesson Behind The Lesson — Brotli)

## User Story

As an end user opening Voyager in a current production browser (Chrome 148, Firefox stable, Safari stable, Edge stable),
I want the application to load and run without redirecting to `/unsupported.html?reason=brotli`,
So that the product is actually reachable in real browsers — not just in the Chrome DevTools MCP sandbox with an `initScript` shim.

## Background

Story 1.4 (VTRJ format) and Story 1.6 (chunk loader) baked in an architectural assumption that the browser's `DecompressionStream('br')` JS API would handle client-side brotli decompression. Story 1.8 added a boot probe that gates app load on `new DecompressionStream('br')` succeeding.

Empirical discovery during Epic 1 retrospective execution (2026-05-19): **no current production browser supports `DecompressionStream('br')`**. The Compression Streams API spec only standardized `gzip`, `deflate`, and `deflate-raw`. Brotli was never added. Chrome 148 stable, Firefox stable, and Safari stable all throw `Unsupported compression format: 'br'`.

Voyager has therefore never been reachable in any real production browser. All prior "manual verification" in Epic 1 was done via Chrome DevTools MCP with an `initScript` shim that fakes brotli support — the shim made the probe pass, but the actual `.bin.br` chunk decompression failed downstream (only the Milky Way skybox and HUD chrome were truly verified). This was masked because the MCP-with-shim setup was the only verification path used.

### Architectural Choice — Wasm brotli polyfill (not HTTP-level Content-Encoding)

Two structural paths exist for the fix; we picked the wasm polyfill route:

| Path | Pros | Cons | Decision |
|---|---|---|---|
| **A. Wasm brotli polyfill** (chosen) | Existing SHA-on-compressed integrity check preserved (no re-bake of 200 MB LFS); no Vite or Cloudflare config changes; chunk-loader logic stays close to its current shape (swap one decompressor for another); works in all browsers regardless of native API surface | ~50–80 KB bundle weight added (one-time wasm module) | **YES** |
| **B. HTTP-level `Content-Encoding: br`** | No bundle weight added; transparent decompression via browser network stack | Requires re-bake to compute SHA on decompressed bytes (the existing SHA-on-compressed check becomes impossible because `fetch().arrayBuffer()` returns already-decompressed bytes when the browser sees the encoding header); requires Vite middleware + Cloudflare `_headers` config; substantial LFS churn | Deferred (could revisit in Story 7.x if bundle weight becomes a concern) |

The wasm polyfill recommended for AC1 is `brotli-dec-wasm` (or equivalent — e.g., the wasm-pack build of Google's `brotli` Rust crate). Decoder-only is sufficient; we don't need the encoder.

## Acceptance Criteria

### AC1 — Chunk loader drops JS brotli decompression

- **GIVEN** the chunk loader currently calls `new DecompressionStream('br')` and pipes `fetch` body through it (see `web/src/services/chunk-loader.ts` `defaultDecompressBrotli`)
- **WHEN** Story 1.16 is reviewed for merge
- **THEN** the `defaultDecompressBrotli` function and the `DecompressFn` injection point are removed
- **AND** the chunk loader calls `fetch(url).then(r => r.arrayBuffer())` directly — the response body arrives uncompressed because the browser's HTTP layer handled `Content-Encoding: br`
- **AND** any vitest tests that previously injected a Node `zlib.brotliDecompressSync` decoder are updated to fetch pre-decompressed fixtures (or the dev server is run in tests with the same brotli-encoding pipeline)
- **Integration AC:** Chrome DevTools MCP smoke (no brotli shim required) fetches a chunk URL and asserts the returned bytes parse as a valid VTRJ header without any DecompressionStream call.

### AC2 — Dev server (Vite) serves `.bin.br` with `Content-Encoding: br`

- **GIVEN** the bake pipeline produces `.bin.br` brotli-compressed VTRJ chunks in `web/public/data/`
- **WHEN** the Vite dev server serves a `*.bin.br` URL
- **THEN** the response includes header `Content-Encoding: br`
- **AND** the response body is the brotli-compressed bytes (Vite does NOT re-compress)
- **AND** the browser's HTTP layer transparently decompresses, delivering plaintext bytes to the JS `fetch` consumer
- **Integration AC:** `curl -H 'Accept-Encoding: br' -i http://localhost:5173/data/sun.bin.br` returns `200 OK` with `Content-Encoding: br` header; piping the body through a non-brotli tool (e.g. `xxd`) shows it's still brotli-compressed bytes (the server is not re-decompressing).

### AC3 — Production headers (`web/public/_headers` for Cloudflare Pages) set `Content-Encoding: br`

- **GIVEN** Story 1.14 set up Cloudflare Pages deployment with a `_headers` file
- **WHEN** Story 1.16 is reviewed for merge
- **THEN** the `_headers` file includes a rule pattern matching `*.bin.br` (and any other brotli-compressed asset extensions in use) that sets `Content-Encoding: br`
- **AND** the same applies to `.vtrj.br`, `.glb.br`, or any other brotli-compressed asset family in `web/public/`
- Note: this is a documentation/config change; cannot be runtime-verified in Story 1.16 without an actual Cloudflare Pages preview deploy. Acceptance is based on file-config correctness; the runtime verification is in Story 7.4 (deploy rehearsal).

### AC4 — Boot probe drops the brotli check

- **GIVEN** Story 1.8's boot probe checks `new DecompressionStream('br')` and redirects to `/unsupported.html?reason=brotli` on failure
- **AND** brotli HTTP support is universal in all our target browsers (NFR-C1 tier 1: desktop Chrome/Firefox/Safari)
- **WHEN** Story 1.16 is reviewed for merge
- **THEN** the brotli branch is removed from `PROBE_BODY` in `web/src/boot/feature-detect.ts`
- **AND** `ProbeFailure` no longer includes `'brotli'` as a value
- **AND** `unsupported.html`'s `?reason=brotli` branch is preserved for now (defensive — in case some legacy browser ever lands without HTTP brotli) but is no longer reachable from the probe
- **AND** the probe now checks only WebGL2 and WebAssembly (the two genuinely unsupported-browser cases)
- **Integration AC:** Chrome DevTools MCP smoke (with NO initScript shim) navigates to `http://localhost:5173/` and confirms the URL stays at `/` (does not redirect to `/unsupported.html`).

### AC6 — Planning artifacts amended in place (per Decision E)

- **GIVEN** the original PRD / architecture / ADR documents describe the brotli-decompression architecture with claims that are empirically wrong (e.g., "DecompressionStream brotli is Chrome 120+, Firefox 126+, Safari 17.5+")
- **AND** Decision E from the Epic 1 retrospective requires amending planning artifacts in place when architectural assumptions are discovered wrong
- **WHEN** Story 1.16 is reviewed for merge
- **THEN** the following amendments are in place (each with a one-line note pointing back to Story 1.16 + the retro):
  - **`_bmad-output/planning-artifacts/prd.md` NFR-C4** (boot-time feature detection): updated to scope detection to WebGL2 + WebAssembly only; remove brotli mention
  - **`_bmad-output/planning-artifacts/architecture.md`** any section describing the chunk loader's decompression strategy or the boot probe's brotli check: updated to reflect HTTP-level `Content-Encoding: br` as the canonical decompression path
  - **`docs/adr/0004-*.md` (VTRJ binary format)**: amended to clarify decompression is HTTP-level (server sets `Content-Encoding: br`, browser network stack decompresses transparently); add a "Lessons Learned" section noting the original design assumption about JS-level `DecompressionStream('br')` was wrong and Story 1.16 corrected it
  - **`docs/adr/0010-*.md` or wherever Chrome DevTools MCP brotli-shim is referenced**: amended to note the shim is no longer needed for post-Story-1.16 smoke; the rule is dead-code defensive
  - **`web/src/services/chunk-loader.ts`** code comment at line 73 (claiming "Chrome 120+, Firefox 126+, Safari 17.5+" support for brotli `DecompressionStream`): removed entirely along with the brotli decompression path
- **AND** `_bmad/custom/voyager-skill-rules.md` Rule 6 (Chrome DevTools MCP brotli workaround) is either removed or amended to note it's historical / no longer load-bearing

### AC5 — End-to-end real-browser smoke passes

- **GIVEN** all of AC1–AC4 are merged
- **AND** the lead navigates a real browser (Chrome 148 stable on the user's machine) to `http://localhost:5173/`
- **WHEN** the page loads
- **THEN** no `/unsupported.html` redirect occurs
- **AND** the Milky Way skybox renders (Story 1.13)
- **AND** at least one celestial body (Sun, Earth, etc.) is visible after the relevant chunk loads
- **AND** at least one Voyager spacecraft trajectory line is drawn after its chunks load
- **AND** the HUD updates date + distance readouts when play is pressed (AC1 of Story 1.15)
- **AND** the spacecraft (Voyager probe geometry via Draco decoder) renders visibly when zoomed to its position
- **Evidence:** captured screenshots in `_bmad-output/implementation-artifacts/1-16-smoke-evidence/` taken via Chrome DevTools MCP without any initScript shim. Real-browser screenshots optional but encouraged.

## Files to Modify

| File | Action | Reason |
|------|--------|--------|
| `web/src/services/chunk-loader.ts` | UPDATE | Remove `defaultDecompressBrotli`, `DecompressFn` injection point, and the pipeThrough(DecompressionStream) call. Fetch bytes directly via `r.arrayBuffer()` (AC1) |
| `web/src/services/chunk-loader.test.ts` | UPDATE | Remove tests that inject a Node brotli decoder; update fixtures to use already-decompressed bytes OR run against a test dev server |
| `web/vite.config.ts` | UPDATE | Add a `configureServer` hook that sets `Content-Encoding: br` for `.bin.br` (and other `.br`-suffix asset) responses (AC2) |
| `web/public/_headers` | UPDATE | Add `Content-Encoding: br` rules for `*.bin.br`, `*.vtrj.br`, `*.glb.br` (AC3) |
| `web/src/boot/feature-detect.ts` | UPDATE | Remove brotli branch from `PROBE_BODY`; update `ProbeFailure` type; update `probeFeatures` and `ProbeResult` (AC4) |
| `web/src/boot/feature-detect.test.ts` | UPDATE | Remove brotli probe tests; keep webgl2 + wasm tests; add a test asserting `PROBE_BODY` does not reference brotli |
| `web/index.html` | UPDATE (maybe) | Verify the probe re-inlining via Vite still works after the PROBE_BODY changes |
| `web/public/unsupported.html` | OPTIONAL UPDATE | Keep the `?reason=brotli` branch as defensive dead code, OR remove it entirely; document the decision in the story |
| `_bmad-output/implementation-artifacts/deferred-work.md` | UPDATE | Strike through the `[1.8 / LOW]` brotli-shim entry as closed by Story 1.16; remove Story 2.0 routing item #8 (action item A3) since 1.16 supersedes it |
| `_bmad-output/implementation-artifacts/1-16-smoke-evidence/` | NEW | Folder for Chrome DevTools MCP screenshots demonstrating no-shim smoke success (AC5) |

## Tasks / Subtasks

- [ ] **T1** AC1 — Strip brotli decompression from chunk-loader
  - [ ] Read current `web/src/services/chunk-loader.ts` end-to-end
  - [ ] Remove `defaultDecompressBrotli`, `DecompressFn` type, the `decompress` constructor parameter, and all wiring through it
  - [ ] Replace the `pipeThrough(new DecompressionStream('br'))` call with `const body = await response.arrayBuffer()`
  - [ ] Update the `LoadedChunk` parser to read directly from the response bytes
  - [ ] Update `chunk-loader.test.ts`: tests that inject `zlib.brotliDecompressSync` should be removed or rewritten against an already-decompressed fixture. Decision: drop the Node-injected decoder pattern entirely; vitest tests fetch pre-decompressed `.bin` fixtures from a sibling `web/test-fixtures/` directory the dev wires up
- [ ] **T2** AC2 — Vite dev server sets Content-Encoding: br
  - [ ] In `web/vite.config.ts`, add a `configureServer` hook that intercepts `*.bin.br` (and any other `.br`-suffix) requests and sets `Content-Encoding: br` on the response before serving the file contents as-is
  - [ ] Verify via `curl -i http://localhost:5173/data/sun.bin.br` — must show `Content-Encoding: br` and the body must remain compressed (the dev server must NOT decompress)
- [ ] **T3** AC3 — Cloudflare Pages `_headers` file
  - [ ] Add to `web/public/_headers`:
    ```
    /data/*.bin.br
      Content-Encoding: br
    /data/*.vtrj.br
      Content-Encoding: br
    /*.glb.br
      Content-Encoding: br
    ```
  - [ ] (Verify the actual location and syntax against Cloudflare Pages docs)
- [ ] **T4** AC4 — Strip brotli check from boot probe
  - [ ] Edit `web/src/boot/feature-detect.ts`:
    - Remove the brotli branch from `PROBE_BODY` (the `else{try{new DecompressionStream('br');}catch(e){r='brotli';}}` segment)
    - Change `ProbeFailure` from `'webgl2' | 'wasm' | 'brotli' | null` to `'webgl2' | 'wasm' | null`
    - Update `ProbeResult` interface and `probeFeatures` function correspondingly
  - [ ] Update `feature-detect.test.ts`:
    - Remove "brotli detection" tests
    - Add a regression test: `PROBE_BODY` must NOT contain the substring `'br'` followed by quote (use regex or simple substring check)
  - [ ] Decide whether to keep `unsupported.html`'s `?reason=brotli` branch or remove (recommendation: keep as defensive dead code with a comment pointing to Story 1.16)
- [ ] **T5** AC5 — End-to-end smoke
  - [ ] After T1–T4 commits are local, navigate Chrome DevTools MCP to `http://localhost:5173/` with NO `initScript` argument
  - [ ] Confirm URL stays at `/` (no `/unsupported.html` redirect)
  - [ ] Confirm Milky Way + HUD render
  - [ ] Click play, wait 3s, screenshot
  - [ ] Scrub to a mid-cruise ET, screenshot
  - [ ] Inspect scene graph via `evaluate_script` — assert celestial-body and spacecraft objects are present (`children.length > 0`)
  - [ ] Save evidence to `1-16-smoke-evidence/`
  - [ ] If the user is available, also verify in their real Chrome 148 stable
- [ ] **T6** — Clean up the brotli-shim references in voyager-skill-rules.md and deferred-work.md
  - [ ] `voyager-skill-rules.md` Rule 6: amend to note Story 1.16 closed this gap; the shim is no longer needed; remove the rule or repurpose it as a historical note
  - [ ] `deferred-work.md`: strike through the `[1.8 / LOW]` brotli-shim entry; remove item #8 from the Story 2.0 routing table

## Definition of Done

- AC1–AC5 all pass
- Vitest suite passes (`npm test -- --run` from `web/`)
- pytest fast tier passes (`uv run pytest -m "not slow"` from `bake/`)
- Real-browser smoke confirms Voyager loads without `/unsupported.html` redirect
- Chrome DevTools MCP smoke evidence in `1-16-smoke-evidence/`
- `deferred-work.md` Story 2.0 routing updated
- Epic 1 closes after this story (`epic-1: in-progress → done` in `sprint-status.yaml`)

## Dev Notes

### Previous Story Intelligence

- **Story 1.4** introduced VTRJ format + brotli compression in the bake pipeline. The compression is fine; it's the *decompression strategy* that needs to change.
- **Story 1.6** built `chunk-loader.ts` with the `DecompressionStream('br')` decompression path. This is the file we strip.
- **Story 1.8** built the boot probe with the brotli check. Strip that branch.
- **Story 1.14** added the `web/public/_headers` file for Cloudflare Pages. Add brotli rules there.
- **Story 1.15** confirmed the wire-up issue empirically: Chrome 148 throws on `new DecompressionStream('br')`. This story (1.16) fixes the architectural cause.

### Implementation Notes

- **Vite `configureServer` hook (T2):** Vite serves files from `public/` directly without applying any custom middleware by default. The `configureServer` plugin hook gets a `server.middlewares` Connect-compatible middleware chain; insert a middleware that inspects `req.url`, sets `Content-Encoding: br` if it matches `*.bin.br` (or other brotli-suffix patterns), and then calls `next()` to let Vite's default static-file handling serve the actual bytes. Critical: the middleware sets the header BEFORE Vite's default handling, so the response stream uses the augmented headers.
- **`_headers` syntax (T3):** Cloudflare Pages uses the same `_headers` format as Netlify. The pattern path is URL-relative; the header lines are indented under it. Verify against the Cloudflare docs (https://developers.cloudflare.com/pages/configuration/headers/). NOTE: the file is at `web/public/_headers` per Story 1.14.
- **Cache busting (out of scope but worth noting):** brotli-compressed files often have aggressive `Cache-Control` headers in production. Verify the existing `_headers` cache rules still apply correctly when the new `Content-Encoding` rule is added.
- **Test fixtures (T1):** Vitest tests currently inject `zlib.brotliDecompressSync` to verify chunk-loader correctness. After this story, the chunk-loader doesn't decompress — so tests should provide pre-decompressed VTRJ bytes directly. Option A: commit small pre-decompressed `.bin` fixtures alongside `.bin.br` (doubles fixture size). Option B: use Node's `zlib.brotliDecompressSync` in the test setup to pre-decompress on-the-fly. Option B is cleaner; recommend it.
- **HTTP content-encoding negotiation:** When `Content-Encoding: br` is set, the browser automatically decompresses transparently and the `Content-Length` header (if present) refers to the COMPRESSED length. The `fetch().arrayBuffer()` returns the DECOMPRESSED bytes. Don't try to set Content-Length manually; let the browser handle it.

### Risk Mitigation Audit (per voyager-skill-rules.md Rule 1)

- **AC1 Integration AC:** MCP smoke proves chunk-loader works with HTTP-level decompression.
- **AC2 Integration AC:** `curl -i` proves dev server sets the header correctly.
- **AC4 Integration AC:** MCP smoke proves the probe no longer redirects unnecessarily.
- **AC5** is itself the integration-smoke for the whole feature.

## Change Log

- 2026-05-20: Created from Epic 1 retrospective § 3a (brotli architectural discovery during Story 1.15 execution).

## Dev Agent Record

(to be filled in by the developer agent)

### Implementation Plan

(to be filled in by the developer agent)

### Debug Log

(to be filled in by the developer agent)

### Completion Notes

(to be filled in by the developer agent)

### File List

(to be filled in by the developer agent)
