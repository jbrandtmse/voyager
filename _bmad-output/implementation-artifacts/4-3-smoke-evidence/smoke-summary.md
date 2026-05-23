# Story 4.3 — Chrome DevTools MCP Smoke Evidence

**Result:** PASS (iter-4 of 4) | **Defects caught:** 3 | **Lead:** claude-opus-4-7

## Iterations

| Iter | Result | Defect | Fix landed in |
|---|---|---|---|
| 1 | FAIL | Cold-load FSM silent-seed contract meant no `soiEntered` fired when V1 cold-loaded ALREADY inside Jupiter's SOI — so `upgradePlanetTexture(5)` + `addMoonsFor(5)` never called | Cycle-5: cold-load replay path in `web/src/main.ts` + 12 new contract tests in `web/tests/cold-load-soi-replay.test.ts` |
| 2 | FAIL | `TextureLoaderService` constructed without renderer arg in `main.ts` (default no-renderer branch), so `KTX2Loader.detectSupport(renderer)` never called — all KTX2 loads rejected with `Missing initialization` | Cycle-6: pass `engine.getRenderer()` at TextureLoaderService construction + 7 defense tests in `web/tests/ktx2-loader-init-defense.test.ts` |
| 3 | MIXED (Jupiter PASS, moons FAIL) | Cycle-3's `TEXTURE_FILE_EXTENSION_BY_TIER` mapped `2k → png`; cycle-4 added 12 outer-moon slugs needing `.ktx2` at the 2k tier. URL routing inside texture-loader's `load()` keyed off `tier` (PNG path) even though `textureUrlForSlug` produced the right URL via per-slug override (eventually). | Cycle-7: `SLUG_TIER_OVERRIDES_TO_KTX2` set + `extensionForSlugTier` helper + URL-driven loader routing in `texture-loader.ts` + 7 more defense tests (total 14 in ktx2-loader-init-defense.test.ts) |
| **4** | **PASS** | — | — |

## Final probe state (iter-4, post cycle-7)

### Probe 1 — `__voyagerDebug.missionPhaseFSM` exists with correct shape
PASS — `update`, `subscribe`, `getSoiState` all `typeof === 'function'`.

### Probe 2 — `__voyagerDebug.renderEngine.upgradePlanetTexture` callable + capabilities
PASS — `upgradePlanetTexture` + `getCapabilities` callable. `getCapabilities()` returns `{ supportsReverseZ:true, supportsFloatDepth:true, recommendedTextureTier:'8k', adequateForEightK:true }` on this hardware.

### Probe 3 — Jupiter 4K KTX2 at V1J cold-load
PASS — Jupiter mesh `material.map` is a Three.js CompressedTexture: `isCompressedTexture=true`, `width=4096`, `height=2048`, `mipmaps.length=13`, `format=36492` (BC7_UNORM_BLOCK — UASTC transcode target on Windows / Chrome / WebGL2). `visible=true`. Network log confirms `jupiter-4k.ktx2` 200.

### Probe 4 — Galilean moon meshes (501/502/503/504) in scene with KTX2 textures
PASS at wire-up scope:
- All 4 meshes present in scene-graph (`celestial-501`, `celestial-502`, `celestial-503`, `celestial-504`).
- All 4 have `material.map.isCompressedTexture=true`, `width=2048`, `height=1024`, `mipmaps.length=12`.
- Network log: 4 separate KTX2 requests at 200 (`io-2k.ktx2`, `europa-2k.ktx2`, `ganymede-2k.ktx2`, `callisto-2k.ktx2`).

`visible=false` on all 4 moons is **expected graceful degradation** per Story 4.3 cycle-4 Issues Encountered #5 — moon position chunks aren't baked yet (satellite SPK kernels `jup365.bsp` etc. remain unprocured; `MOON_BODIES` table catches `SpiceyError` and skips). Texture / mesh / FSM wire-up is complete; ephemeris-driven visibility activates as a follow-up once kernels land. This is a documented Epic 4 follow-up, NOT a Story 4.3 regression.

### Probe 5 — UX-DR32 invisible-loading defense
PASS — `document.body.innerHTML` regex scan returns 0 matches for `/loading|spinner|progress|please wait/i` (no false-positives; no legitimate "—paused (loading)" because the clock isn't auto-capped on a non-stalled cold-load).

### Probe 6 — Console clean
PASS modulo one documented advisory:
- `[warn] Lit is in dev mode. Not recommended for production!` — pre-existing baseline (every story).
- `[warn] THREE.KTX2Loader: Multiple active KTX2 loaders may cause performance issues.` — documented in cycle-7 Issues Encountered #3. Story 3.3's spacecraft-models loader + cycle-3 TextureLoaderService loader coexist by design; both correctly initialized. Three.js advisory only; not a defect. Loader-unification deferred to a future story.

Zero `error`-level console messages. Zero unexpected `warn`-level messages.

### Reverse-scrub mini-probe
Not driven interactively (clockManager not exposed on `__voyagerDebug`). NFR-C6 monotonic-tier-ratchet (no de-escalation) is pinned at the unit-test layer in `web/src/render/celestial-bodies.qa.test.ts` per QA cycle.

## Network log highlights

5 KTX2 requests, all 200:
- jupiter-4k.ktx2
- io-2k.ktx2
- europa-2k.ktx2
- ganymede-2k.ktx2
- callisto-2k.ktx2

Zero `-8k.ktx2` requests (Rule-5 amendment to AC4: 4K is the highest tier the source data supports; the 8K tier is forward-compat-only).

Basis Universal transcoder (`basis_transcoder.js` + `basis_transcoder.wasm`) loaded once each at boot, both 200.

## Evidence files

- `iter-1-FAIL-cold-load-jupiter-still-2k-png.png` — pre-fix viewport (Jupiter served at cruise 2K PNG, no moons).
- `iter-4-PASS-jupiter-4k-galilean-moons-textured.png` — post-fix viewport (Jupiter at 4K KTX2; Galilean moon meshes textured but invisible pending kernels).

## Lesson 8 reinforcement

Three test-pyramid-invisible defects caught by the per-story smoke across cycles 4 → 6 → 7. Each defect (cold-load wire-up gap, loader-init contract miss, URL-routing inversion) shipped GREEN through unit + integration test tiers because each layer mocked the offending production code path. The smoke is the bridge from "tests pass" to "the product works" — exactly as the workflow's lesson 8 names it.

The cycle-5/6/7 defense tests added at each iteration (12 + 7 + 7 = 26 new tests) are the load-bearing closure: a future regression of any of the three defects now fails at the unit-test tier instead of needing another smoke iteration.
