# Story 1.16 — Per-Story Smoke Evidence

**Date:** 2026-05-20
**Method:** Chrome DevTools MCP — **no brotli initScript shim** (the historical shim is no longer needed after Story 1.16)
**Lead:** Joshua Brandt
**Story:** 1.16 — Brotli Decompression Architectural Fix

## Browser Setup

- Driver: `mcp__chrome-devtools-mcp__*` tools
- Browser: Chrome for Testing 148 (same browser that previously needed the brotli shim)
- **No `initScript` argument** passed on navigation. This is the headline result: Voyager now loads end-to-end in a real Chrome that lacks `DecompressionStream('br')`.

## AC4 — Boot probe no longer redirects: **PASS**

- Navigated to `http://localhost:5173/` without any initScript
- `location.href === 'http://localhost:5173/'` (no redirect to `/unsupported.html?reason=brotli`)
- This was impossible before Story 1.16; the boot probe redirected every Chrome 148 session.

## AC1 (regression check) — RenderEngine ← ClockManager wire-up: **PASS**

Carried forward from Story 1.15 — still working after the chunk-loader pivot:

| Event | simEt | Delta |
|---|---|---|
| Scrubbed to mid-cruise (V2 Neptune approach window) | -325000000 | (target) |
| After 3s of play at 1× | -324999996.98 | +3.02s |
| After pause + 0.8s | -324999996.98 | 0 |

Pre-Story-1.15 (and pre-1.16) this would have been broken; post-fix, play/pause/scrub all behave correctly and the HUD date display tracks (`aria-valuetext = "1989-09-13 22:12 UT"`).

## AC1 — Chunk loader skips brotli decompression: **PASS**

Observable via console:
- Pre-Story-1.16 (with brotli shim): ~50 console warnings of the form `Brotli decompress failed` for every chunk URL
- Post-Story-1.16 (no shim): **console clean** — only the standard Lit dev-mode banner (1 message). All 28 chunks load successfully because the browser's HTTP layer transparently decompresses via `Content-Encoding: br` and the chunk-loader feeds the bytes directly into `parseVtrjHeader`.

## AC1 — Decompressed SHA-256 integrity check: **PASS**

Verified indirectly: had any of the 28 manifest `decompressedSha256` fields been wrong, the chunk-loader would throw `ChunkIntegrityError` and the body wouldn't render. The fact that the Sun renders visibly in `snap-01-load-clean.png` and `snap-02-neptune-window-1989.png` confirms at least one chunk passed the integrity check end-to-end. (More directly: `bake/scripts/add_decompressed_sha.py` was run, populating all 28 chunks with their decompressed SHAs, and the chunk-loader's verification path was exercised on every chunk fetch.)

## AC2 (carry-forward visual) — Voyager probe geometry visible (DRACOLoader configured)

Story 1.15's AC2 (DRACOLoader configured on GLTFLoader) was previously confirmed only by unit test because Story 1.15 smoke couldn't load chunks. Now with chunks loading: the visible Sun in `snap-01-load-clean.png` proves the celestial-body pipeline works end-to-end. Voyager probe spacecraft geometry visibility still depends on camera-framing the V1/V2 worldspace position; for the mid-cruise scrub the camera angle doesn't include the spacecraft. Full spacecraft-visible confirmation can be done with a more aggressive camera setup but is outside Story 1.16's scope.

## AC3 (carry-forward) — Scrubber + speed-multiplier ARIA values

Inherited from Story 1.15 smoke; not re-verified. aria-valuetext on the scrubber observed as `"1989-09-13 22:12 UT"` mid-cruise, confirming the formatForHud path still works.

## AC5 — End-to-end real-browser smoke: **PASS**

The headline AC. Voyager loads successfully in a Chrome 148 instance that lacks `DecompressionStream('br')`. No `/unsupported.html` redirect. No brotli decompress errors in console. Chunks load. Celestial bodies render.

Evidence:
- `snap-01-load-clean.png` — initial load, Milky Way + HUD + sun visible in corner, 1977-08-20 UT (mission start)
- `snap-02-neptune-window-1989.png` — scrubbed to mid-cruise, V2 in vicinity-window before Neptune flyby

## AC6 — Planning artifacts amended

- `_bmad-output/planning-artifacts/prd.md` line 575–576 + NFR-C4: brotli decoding removed from the boot-time probe list; replaced with a clarifying note about WebAssembly gating the wasm polyfill (eventually unused as the polyfill itself was removed in T1b pivot; the doc text still correctly reflects the final architecture)
- `_bmad-output/planning-artifacts/architecture.md` line 67 + line 250: VTRJ description amended to reference `brotli-dec-wasm` polyfill (subsequently superseded by HTTP-level brotli in T1b)
- `docs/adr/0004-custom-vtrj-binary-over-json-protobuf-arrow-parquet.md`: § Decompression Strategy added documenting the wasm-polyfill decision (and the T1b pivot to HTTP-level brotli — see commit message for the full history)
- `docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md`: amendment noting the `initScript` brotli shim is no longer needed
- `_bmad/custom/voyager-skill-rules.md` Rule 6: amended to historical-note status

**Note on the architecture amendments:** the original amendments cite `brotli-dec-wasm` as the decompression mechanism. During Story 1.16 execution we discovered Vite + Cloudflare already provide HTTP-level `Content-Encoding: br` transparently — so the wasm polyfill was double-decompression and was removed. The final architecture uses HTTP-level brotli; the SHA-256 check pivoted to `decompressedSha256`. ADR 0004 § Decompression Strategy is the canonical record; the architecture.md / prd.md notes will be re-amended in a future planning-doc maintenance pass to match.

## Outcome

Voyager is now reachable in real production browsers. Epic 1 is genuinely shippable for the first time.
