# Story 5.3 — Test Automation Summary

**Story:** 5.3 Photo-Plate Compositing Pipeline at Historical Instants
**Stage:** QA (post-dev, /epic-cycle)
**Date:** 2026-05-23
**Test framework:** Vitest 4.1.6 (+ Sharp for build-pipeline E2E)

## Dev's coverage (baseline carried in)

The dev landed 42 new tests across four files plus amendments to four existing files:

- `web/src/chapters/pale-blue-dot/composite-layer.test.ts` (NEW — 21 unit tests)
  - AC2 module structure (5)
  - AC4 opacity fade-in / fade-out / at-most-one invariant / visibility (4)
  - AC5 reduced-motion instant cut (2)
  - AC6 sequence ordering + Rule-5 amendment Earth-hold (4)
  - AC2 + AC4 subscriber wire-up (2)
  - AC3 projection fallback (1)
  - AC10 ADR-0019 zero-analytics (1)
  - Constants pinning (2)
- `web/tests/pale-blue-dot-composite-integration.test.ts` (NEW — 6 integration tests)
  - Chronological PBD substate sequence through real PaleBlueDot + composite layer
  - AC4 DOM `<img>` opacity tracking
  - AC4 single-plate invariant in the DOM
  - AC5 reduced-motion DOM verification
  - AC8 container persistence
  - dispose() detaches subscriber
- `web/tests/embed-mode-first-paint.test.ts` (AMENDED — 2 new AC8 tests)
  - First-paint embed-mode does NOT inject CSS hiding `.pbd-composite-layer`
  - Non-embed mode also does NOT hide it (control)
- `web/scripts/build_pbd_plates.test.ts` (NEW — 12 build-pipeline tests, Rule 11 E2E)
  - Pure-function contracts (7): sha256Hex / buildPlateFilename / PLATE_JOBS shape / SOURCE_PIAS canon / Earth-uses-PIA00452-no-crop / non-Earth-crops-from-PIA00453 / PLATE_SIZE is power-of-2
  - Full-pipeline E2E (5): produces 128×128 PNGs with content-hashed filenames from synthetic JPEG fixture, idempotent (same source → same output filename + hash + bytes), per-cell color verification for Venus crop (col=0 row=0 → purple) and Jupiter crop (col=2 row=0 → blue)

Amended existing tests for the Rule-5 substate reorder (4 files): `substates.test.ts`, `index.test.ts`, `pale-blue-dot-override-lifecycle.test.ts`, `pale-blue-dot-turn-integration.test.ts`.

**Dev's full sweep baseline:** 3255 passed / 55 skipped / 184 files (the dev cited 3300/10 but with VISUAL_VALIDATION_FULL=0 and other env-gates active the live count is 3255/55 — the 3310 total matches dev's 3300+10 within 1).

## QA evaluation — coverage map

| AC | Dev coverage | Verdict |
|---|---|---|
| AC1 procurement + manifest + attribution + headers | THIRD_PARTY.md text + `<v-attribution-panel>` entry exist; `_headers` `/images/pbd/*` rule landed; 6 plate PNGs in `web/public/images/pbd/`; existing v-attribution-panel.test.ts covers the entry's presence | **GAP** — no test asserts the plate files actually exist on disk, that their SHA-256 matches the manifest + filename hash, that `_headers` carries the immutable rule, that THIRD_PARTY.md has the Story 5.3 section, that `<v-attribution-panel>` mentions BOTH PIAs |
| AC2 composite layer module structure | composite-layer.test.ts 5 tests + integration 2 | **OK** — gap: no explicit dispose() memory-leak guard |
| AC3 boresight projection + plate sizing | composite-layer.test.ts projection-fallback test (1) | **OK** — gap: no test exercising the projection branch (only the centering fallback) |
| AC4 fade-in/hold/fade-out | composite-layer.test.ts 4 + integration 2 | **OK** |
| AC5 reduced motion | composite-layer.test.ts 2 + integration 1 | **OK** |
| AC6 Venus → Neptune + 30s Earth pause + single-plate | composite-layer.test.ts 4 + integration 3 | **GAP** — no test asserts the 30s pause AT THE TIMING-TABLE LEVEL (`composite_active.end - sweeping_earth.start >= 30s`); no test pins the Rule-5 topology in `PBD_SUBSTATE_ORDER`; no test pins the 180s arc invariant |
| AC7 visual validation doc | doc exists at `docs/visual-validation/pale-blue-dot.md` | **GAP** — no test asserts the doc exists + cites the canonical files + records the Rule-5 amendment (matching the Story 4.8 pattern in `visual-validation-docs.test.ts`) |
| AC8 embed mode preserves composites | 2 new embed-mode tests + 1 integration | **OK** |
| AC9 Chrome DevTools MCP smoke | Lead-driven per Rule 7 — `5-3-smoke-evidence/README.md` lays out the probe | See "Chrome DevTools MCP smoke" section below |
| AC10 test sweep + ADR compliance | ADR notes inline in Dev Agent Record; ADR-0019 zero-analytics test in composite-layer.test.ts; ADR-0008/0014/0015/0026 covered by file location + module shape | **OK** |

## QA tests added (gap-fillers)

Single new test file: `web/tests/pale-blue-dot-composite-qa.test.ts` (33 tests).

### AC1 — procurement integrity (12 tests)

- **6 file-existence tests** (one per body via `it.each`) asserting the plate filename in `plate-manifest.json` actually points at a file on disk under `web/public/images/pbd/`.
- **6 content-hash drift defense tests** (one per body via `it.each`) asserting the actual file bytes' SHA-256 matches BOTH the manifest's `sha256` field AND the 8-char prefix embedded in the filename. This is the canonical defense against the case where a re-build drifts the file out of sync with either the manifest or the filename — the trio (file bytes / manifest / filename) is now fully cross-verified.

### AC1 — manifest shape (4 tests)

- `plate-manifest.json` is well-formed (schemaVersion=1, plateSize=128, six plates).
- Plates listed in chronological PBD order (Venus → Earth → Jupiter → Saturn → Uranus → Neptune).
- Six unique filenames (no hash collisions / dup entries).
- Only PIA00452 + PIA00453 sourced; Earth specifically from PIA00452.

### AC1 — `_headers` Cache-Control (1 test)

- `/images/pbd/*` path pattern present with `max-age=31536000` + `immutable` directives within ~200 chars (Story 1.14 immutable-asset discipline).

### AC1 — attribution surface integrity (2 tests)

- `THIRD_PARTY.md` has the `## NASA Photojournal PBD photo plates (Story 5.3)` section citing PIA00452 + PIA00453.
- `<v-attribution-panel>` (the runtime attribution surface) mentions both PIAs in its NASA Photojournal entry — guards against the Story 5.0 placeholder text drift.

### AC6 — 30-second Earth-pause invariants (5 tests)

- `composite_active.end - sweeping_earth.start >= 30s` directly from `PBD_SUBSTATE_TIMINGS` — the timing-table-level invariant for the FR28 success criterion.
- `composite_active.end - composite_active.start === 30s` — the held pause itself.
- `PBD_SUBSTATE_ORDER` positions `composite_active` immediately between `sweeping_earth` and `sweeping_jupiter` (Rule-5 amendment topology pinned at the ordering level).
- Cinematic arc length stays exactly 180s (30 turning + 6×15s sweep + 30s composite_active + 30s composite_decay = 180s) — Story 5.2's 50× speedup-factor recomputation is preserved.
- Absolute peak ETs match the Rule-5 amendment offsets (Earth peak +52.5s, composite_active peak +75s).

### AC7 — visual-validation doc cites real artifacts (5 tests)

- `docs/visual-validation/pale-blue-dot.md` exists.
- Doc cites `composite-layer.ts`, `substates.ts`, `build_pbd_plates.ts`.
- Doc records the Rule-5 amendment to `substates.ts`.
- Doc records the chosen plate size (128 px) + cinematic-compromise rationale.
- `_bmad-output/implementation-artifacts/5-3-smoke-evidence/` directory exists (lead's smoke landing zone).

### AC2 — dispose() memory-leak guard (3 tests)

- `dispose()` removes all six `<img>` children (no orphan plates in DOM).
- `dispose()` clears per-plate state (`getPlateOpacity` returns 0 for every body; `currentActivePlate` is null).
- `dispose()` called twice is idempotent (no throw on second call).

### AC3 — boresight projection branches (1 test)

- The `resolveScanPlatform` resolver is actually invoked when a non-null camera is supplied — guards against the projection branch being silently skipped (which would leave the plate stuck at the centering fallback in production).

## Test discoverability

The new file `web/tests/pale-blue-dot-composite-qa.test.ts` follows the project's convention (`.test.ts` suffix; under `web/tests/`) and is picked up by the default Vitest glob (`vite.config.ts` only excludes `**/tests/visual/**` which is the Playwright L4 suite). No slow-tier marker needed — all 33 tests complete in ~72ms.

The dev's `web/scripts/build_pbd_plates.test.ts` is also picked up by the default Vitest glob (it's adjacent to the script under `web/scripts/`, matching the Vitest `**/*.test.ts` pattern). The 12 tests complete in well under a second against synthetic JPEG fixtures with no network access — no need for slow-tier gating. Good practice: the file is Rule-11-compliant E2E (it exercises the full sharp.extract + resize + PNG encode + crypto hash + write/read chain end-to-end) without invoking the real NASA Photojournal CDN — that's exercised by `npm run build-pbd-plates` at procurement time.

## Build-pipeline E2E verdict (Rule 11)

`build_pbd_plates.test.ts` is a **true Rule-11 E2E test**, not pure unit testing of internal functions:

- It synthesizes a 620×500 six-cell JPEG fixture via Sharp in-memory.
- It calls the actual exported `buildPlate(job, source, outDir)` function for each of the six bodies.
- It re-reads the produced PNG from disk and verifies dimensions (128×128) via `sharp(bytes).metadata()`.
- It verifies the dominant color of the Venus crop matches the synthetic purple AND the Jupiter crop matches the synthetic blue — pinning the grid coordinates exercised end-to-end through extract+resize.
- The idempotency test runs the pipeline twice and asserts byte-identical output (filename, sha256, byte count all match).

The only piece NOT covered (intentionally) is `downloadIfMissing` against the live CDN — that's exercised by the production `npm run build-pbd-plates` invocation. The test file's docstring explicitly notes this scope decision.

This satisfies Rule 11's "MUST have at least one end-to-end test that runs the full pipeline against a small real input fixture and asserts on the produced output bytes / file metadata" requirement.

## Chrome DevTools MCP smoke

Per `_bmad/custom/voyager-skill-rules.md` Rule 3 + Rule 8, this story touches `web/src/` and therefore requires a lead-driven Chrome DevTools MCP smoke as the canonical browser-smoke evidence channel. Per Rule 7 the MCP tools live on the lead's harness, not on sub-agents.

The smoke runs against the production build (`cd web && npm run build && npx serve dist`) and probes the PBD chapter at each substate peak ET via the Story 5.2 deep-link pattern.

**MCP tool calls (lead executes):**

1. **`mcp__chrome-devtools-mcp__navigate_page`** — navigate to `/c/pale-blue-dot/?t=<peak-ET-iso>` for each of the 7 named substate-peak ETs:
   - `?t=1990-02-14T00:00:37.5Z` (sweeping_venus peak)
   - `?t=1990-02-14T00:00:52.5Z` (sweeping_earth peak — the hero shot)
   - `?t=1990-02-14T00:01:15Z` (composite_active peak — 30s Earth hold midpoint)
   - `?t=1990-02-14T00:01:37.5Z` (sweeping_jupiter peak)
   - `?t=1990-02-14T00:01:52.5Z` (sweeping_saturn peak)
   - `?t=1990-02-14T00:02:07.5Z` (sweeping_uranus peak)
   - `?t=1990-02-14T00:02:22.5Z` (sweeping_neptune peak)

2. **`mcp__chrome-devtools-mcp__evaluate_script`** — at each peak ET, assert the active plate is in the DOM at full opacity:
   ```js
   // Returns true iff the expected plate is visible at opacity 1
   const layer = window.__voyagerDebug?.pbdCompositeLayer;
   const expected = 'earth'; // varies by peak ET
   layer.currentActivePlate === expected &&
     layer.getPlateOpacity(expected) === 1 &&
     getComputedStyle(
       document.querySelector(`.pbd-composite-layer img[data-target=${expected}]`),
     ).opacity === '1';
   ```
   - Covers AC2 (composite layer surface), AC3 (plate in DOM at expected position via `getBoundingClientRect()` non-zero check), AC4 (opacity), AC6 (substate→plate mapping for the chronological sequence including composite_active mapping to Earth).

3. **`mcp__chrome-devtools-mcp__take_screenshot`** — capture 7 peak-ET screenshots + 1 mid-fade screenshot (at `?t=1990-02-14T00:00:45.1Z`, sweeping_venus→sweeping_earth boundary):
   - Evidence path: `_bmad-output/implementation-artifacts/5-3-smoke-evidence/01-sweeping-venus-peak.png` through `08-mid-fade-venus-to-earth.png`.
   - The mid-fade screenshot must show two `<img>` elements with partial opacity (covers AC4's transient fade-in/fade-out visibility).
   - The hero shot (`02-sweeping-earth-peak.png` and `03-composite-active-peak.png`) is the AC7-binding evidence: it shows the Earth plate's center aligned with the V1→Earth boresight projection.

4. **`mcp__chrome-devtools-mcp__take_snapshot`** — accessibility-tree snapshot at the composite_active peak ET to confirm the composite layer doesn't interfere with HUD/announcement aria contracts (defensive — composites are intentionally `pointer-events: none` and have no aria semantics, but the snapshot pins this).

5. **Console-clean assertion** — capture console messages during the full 0..+180s playback; assert no errors apart from the Lit dev-mode banner. Probes for: composite-layer manifest-load errors, projection NaN warnings, any uncaught exceptions during plate fade transitions.

**MCP smoke per-AC coverage:**

- AC2 (composite layer surface) — `evaluate_script` confirms `window.__voyagerDebug.pbdCompositeLayer.{currentActivePlate, getPlateOpacity, rootElement}` are reachable.
- AC3 (plate at projected boresight) — `take_screenshot` shows the plate adjacent to the boresight cone visually; `evaluate_script` reads `img.getBoundingClientRect()` to confirm non-zero size + non-(0,0) position.
- AC4 (fade) — the mid-fade screenshot at +45.1s shows two plates partially visible; `evaluate_script` reads `getPlateOpacity('venus')` and `getPlateOpacity('earth')` to confirm both are between 0 and 1.
- AC6 (chronological order + Earth-hold + single-plate) — the 7 peak-ET screenshots collectively pin the order; the composite_active screenshot shows Earth (not Neptune) per the Rule-5 amendment; `evaluate_script` asserts the single-plate invariant at each peak (only one plate has opacity 1).
- AC8 (embed mode) — repeat the navigation with `?embed=true` for at least one peak ET (`sweeping_earth`) and confirm the composite is still visible while HUD/chapter-index are not.

**Evidence target:** `_bmad-output/implementation-artifacts/5-3-smoke-evidence/` (already populated with a README.md by the dev; the lead's smoke commits the actual PNGs).

## Sweep results

- **Web vitest:** 3288 passed / 55 skipped / 185 files (previous baseline post-dev: 3255/55/184; QA adds 1 file with 33 tests → +33 tests). Typecheck clean.
- **Lint:** Not re-run by QA stage (dev's report: 4 warnings, pre-existing baseline preserved).
- **Build-pipeline E2E (Rule 11):** `build_pbd_plates.test.ts` passes (12 tests against synthetic JPEG fixtures; no network access).
- **Build-textures E2E (related):** `build-textures-e2e.test.ts` passes (3 tests, ~141 seconds — the existing slow-tier example showing the project's tolerance for build-script E2E latency).

## Next steps

- Lead executes the Chrome DevTools MCP smoke against `cd web && npm run build && npx serve dist` and commits the 7 peak-ET + 1 mid-fade screenshots under `_bmad-output/implementation-artifacts/5-3-smoke-evidence/`.
- Story-status flip from "review" to "done" after the lead's smoke evidence lands (per Rule 3).

## Tests Added
- c:\git\Voyager\web\tests\pale-blue-dot-composite-qa.test.ts

## Decisions
- Single consolidated QA test file (`pale-blue-dot-composite-qa.test.ts`) rather than several per-AC files — gap-fillers fan out across AC1/AC2/AC3/AC6/AC7 and a unified file keeps the QA add-on discoverable as a single artifact (matches the Story 4.8 `visual-validation-docs.test.ts` precedent for cross-cutting integration-defense tests).

## Issues Encountered
- (none)
