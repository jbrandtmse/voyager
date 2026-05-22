# Story 3.3 — Lead-driven Chrome DevTools MCP smoke evidence

Date: 2026-05-22
Lead model: claude-opus-4-7
toktx version installed locally: v4.3.0~28 (CI uses v4.3.2 — minor drift, ABI-compatible)
Dev server: `cd web && npm run dev -- --port 5173 --host 127.0.0.1`
Browser: Chrome (MCP-driven, fresh `user-data-dir=C:\Users\Josh\.cache\chrome-devtools-mcp\chrome-profile`)

## Pre-conditions established at smoke time

1. **Story 3.3 dev-stage local-environment gap closed.** Dev agent could not run `web/scripts/build_glb.ts` end-to-end because `toktx` was not installed. Lead installed `KTX-Software v4.3.2` from the Khronos GitHub release (`KTX-Software-4.3.2-Windows-x64.exe`) at smoke time. User authorised the install per AskUserQuestion 2026-05-22 "Procure toktx now and bake KTX2".
2. **Two HIGH defects auto-resolved at smoke time** that the test pyramid alone would have shipped green:
   - `web/scripts/build_glb.ts` `writeTexturesAsKtx2()` extracted WebP bytes and handed them to `toktx`, which hard-failed (`No image plugin recognized the format of ... tex-0.webp`). The dev-stage comment block ("rely on EXT_texture_webp disposal to fall back to PNG") was empirically false — disposing the extension declaration does not swap the texture's image bytes. **Fix:** added a Sharp-based WebP → PNG transcode hop before invoking `toktx` (sharp is already a transitive dep via `@gltf-transform/functions` → `ndarray-pixels`).
   - The `EXTMeshoptCompression` writer threw `TypeError: Cannot read properties of undefined (reading 'encodeGltfBuffer')` at GLB-write time because `MeshoptEncoder` was not wired through the NodeIO dependency registry. **Fix:** added `'meshopt.encoder': MeshoptEncoder` to `io.registerDependencies({...})` per `@gltf-transform/extensions` §EXTMeshoptCompression usage docs.
3. **LODs produced locally and merged into the runtime manifest.** `npm run build-glb` emitted 4 LOD GLBs to `web/public/models/` and a `bake/out/models-manifest-fragment.json`. The fragment was merged into `web/public/data/manifest.json` via Node-side JSON splice (the pure-Python `manifest_writer.py` merge runs in CI; lead path is equivalent JSON-wise).

## Probe 1 — Boot manifest + named-hierarchy presence

URL: `http://127.0.0.1:5173/`

```js
window.__voyagerDebug.spacecraftModels.getHandle('voyager-1')
// → { id: 'voyager-1', naifId: -31, group, lod, hasInitialPosition: false }
const v1 = ...;
v1.lod.levels.length                // 4 ✓
typeof v1.lod.getCurrentLevel       // 'function' ✓
group.getObjectByName('BUS')        // non-null ✓
group.getObjectByName('SCAN_PLATFORM') // non-null ✓
group.getObjectByName('HGA')        // non-null ✓
```

Result: **PASS.** All three named nodes resolve. The LOD chain is wrapped in `THREE.LOD` with 4 levels. The handle exposes `lod` per AC9 probe 5 contract. `__voyagerDebug.spacecraftModels` published at boot per AC9.

Screenshot: probe1-baseline-v1-jupiter.png

## Probe 2 — SCAN_PLATFORM articulation + BUS-invariant under rotation (AC6)

URL: `http://127.0.0.1:5173/?t=1979-03-05T12:05:26Z` (V1 Jupiter closest approach)

State pre-rotation:
- `v1.group.visible: true` (ephemeris updated; floating-origin places V1 at heliocentric `[-481033568, 627369408, 8173032]` km)
- `v1.lod.getCurrentLevel() === 2` (cruise-scale band)
- Both BUS and SCAN_PLATFORM quaternions identity (no attitude applied yet — Story 3.4's job)

Rotation script:
```js
const platform = ...; // SCAN_PLATFORM
const hga = ...;       // HGA
v1.group.updateMatrixWorld(true);
const hgaBefore = hga.matrixWorld.elements.slice();
platform.quaternion.set(0, 0.3826834323650898, 0, 0.9238795325112867); // 45° about local +Y
v1.group.updateMatrixWorld(true);
const hgaAfter = hga.matrixWorld.elements.slice();
```

Result: **PASS.**
- `platform.parent.name === 'BUS'` ✓ (the AC1 hierarchy contract)
- After rotation: `sum(|hgaAfter - hgaBefore|) === 0` exactly — HGA's world matrix is invariant under SCAN_PLATFORM rotation (the BUS-static-relative invariant from AC6)
- The platform's children (NA-camera et al — wrapped inside `BODY.002` mesh per the mesh-mapping JSON) inherit the rotation as a rigid unit, since they're descendants of SCAN_PLATFORM

Screenshot: probe2-platform-rotated-45deg.png

## Probe 3 — Platform reset (idempotency)

```js
platform.quaternion.set(0, 0, 0, 1);
v1.group.updateMatrixWorld(true);
// platform.quaternion.toArray() === [0, 0, 0, 1]
```

Result: **PASS.** Reset is non-destructive; the hierarchy survives quaternion mutations cleanly.

## Probe 4 — Console clean on homepage navigation

URL: `http://127.0.0.1:5173/?t=1979-03-05T12:05:26Z` console messages (post-Probe-3):
- 1 [warn] "Lit is in dev mode. Not recommended for production" (expected dev-server boilerplate; not a Story 3.3 artifact)
- 0 errors
- 0 warnings related to Story 3.3 surfaces (no `[spacecraft-models]`, no `[manifest-loader]`, no KTX2Loader/MeshoptDecoder failures, no `THREE.LOD` warnings)

Result: **PASS** for Story 3.3 scope.

## Probe 5 — Chapter route render (AC9 probe 7)

URL: `http://127.0.0.1:5173/c/v1-jupiter`

Result: **PASS for Story 3.3 deliverables** — spacecraft-models loaded cleanly (V1 visible=false at chapter ET because trajectory chunks failed to load — see § Pre-existing bug found below — but the LOD chain itself initialized to `currentLevel === 0`, indicating the camera is now zoomed close enough to engage the highest-detail mesh).

Screenshot: probe3-v1-jupiter-chapter.png

### Pre-existing bug surfaced (NOT a Story 3.3 regression)

The `/c/v1-jupiter` navigation produced ~55 chunk-integrity warnings of the form:

```
[main] trajectory prefetch failed for data/voyager-1-seg01--704412036--704170304.bin.br;
  polyline will hold previous segment: ChunkIntegrityError: Chunk integrity check failed:
  data/voyager-1-seg01--704412036--704170304.bin.br —
  expected sha256=c07354b0..., computed sha256=ed1c69e7...
```

The repeating `computed sha256=ed1c69e7...` across all chunks is the SHA-256 of Vite's SPA-fallback `index.html` (`<!doctype html>...`). Root cause: the manifest's `files[].url` is a **relative** URL (`data/voyager-...bin.br`, no leading `/`), so when the active page is a chapter route like `/c/v1-jupiter`, the chunk-loader's `fetch(url)` resolves to `/c/data/voyager-...bin.br` instead of `/data/voyager-...bin.br`, and Vite returns the SPA fallback HTML. The hash mismatch is then guaranteed.

Verification at the browser console with the page at `/c/v1-jupiter`:
```js
await fetch('data/voyager-1-seg01--704412036--704170304.bin.br');
// → resolvedUrl: http://127.0.0.1:5173/c/data/voyager-1-seg01--704412036--704170304.bin.br
// → status: 200, contentType: text/html, bodyHash: ed1c69e7...

await fetch('/data/voyager-1-seg01--704412036--704170304.bin.br');
// → resolvedUrl: http://127.0.0.1:5173/data/voyager-1-seg01--704412036--704170304.bin.br
// → status: 200, contentType: application/octet-stream, bodyHash: c07354b0... (matches manifest)
```

This is a Story 1.6 / Story 2.4 chapter-routing bug that surfaced when Story 2.4 introduced chapter-route URLs. The chunk-loader needs to resolve the URL absolutely (prepend `/` or anchor to a stable base path). Routed to `deferred-work.md` as a HIGH finding from Story 3.3 smoke evidence. Not a Story 3.3 regression — Story 3.3 only added the `models[]` section + LOD GLBs (which use absolute URLs starting with `/models/`); the per-LOD GLB fetch on the chapter route worked correctly.

## Summary

**Story 3.3 AC9 verdict: PASS.**

- All Story 3.3-specific deliverables verified in real browser: LOD chain loads, named hierarchy present, SCAN_PLATFORM articulates with the BUS-static-relative invariant, the runtime registers MeshoptDecoder + KTX2Loader at /basis/ correctly (no errors), `__voyagerDebug.spacecraftModels` published with the AC9 probe-5-compliant `lod` field.
- 2 HIGH defects auto-resolved inline at smoke time (sharp-based WebP transcode + MeshoptEncoder dependency registration) — both were Story 3.3 introductions that the test pyramid did not catch (the pipeline was never end-to-end-exercised pre-smoke because the dev environment lacked toktx).
- 1 pre-existing HIGH bug surfaced (chapter-relative URL resolution in chunk-loader) — filed to deferred-work.md, routed to Story 3.4 or a hotfix. NOT a Story 3.3 regression.

The classic "test pyramid is necessary but not sufficient" lesson — three HIGH defects in this story alone that only the real-runtime smoke could surface.
