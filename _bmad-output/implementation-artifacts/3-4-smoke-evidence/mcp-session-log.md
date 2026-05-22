# Story 3.4 — Lead-driven Chrome DevTools MCP smoke evidence

Date: 2026-05-22
Lead model: claude-opus-4-7
Dev server: `cd web && npm run dev -- --port 5173 --host 127.0.0.1`
Browser: Chrome (MCP-driven, user-data-dir `C:\Users\Josh\.cache\chrome-devtools-mcp\chrome-profile`)

## Pre-conditions

- Story 3.3 committed (sha `3391fff`) — 4-LOD spacecraft GLB chain + named hierarchy live.
- Story 3.3.1 committed (sha `c4a10f0`) — chunk-loader URL resolution fixed; chapter routes work.
- Story 3.4 dev + QA + CR complete (web vitest 2210 pass, typecheck clean, lint baseline 4 warnings).
- `__voyagerDebug.attitudeApplier` published in DEV per AC8 (verified via Probe 1).

## Local environment limitation acknowledged up front

The local runtime manifest at `web/public/data/manifest.json` (committed pre-Story-3.1) **does not contain attitude bodies** — `bodies[].naifId` covers only `-31` (V1 SPK), `-32` (V2 SPK), and the celestial bodies. The Story 3.1 attitude VTRJ files (with `naifId ∈ {-31000, -31100, -32000, -32100}`) are produced by `just bake-attitude` (the Python recipe; needs `uv`). `uv` is not in the lead's local env this session.

Implication: the per-frame AttitudeService at any ET resolves through the synthesized HGA-Earth-pointing path (Story 3.2 § AC4), never the CK SLERP path (Story 3.2 § AC3). The smoke therefore validates:

- The applier is wired into the per-frame loop ✓
- `__voyagerDebug.attitudeApplier` is published ✓
- The BUS quaternion is non-identity (i.e., AttitudeService output flows through to the Object3D) ✓
- The BUS quaternion changes across simulated ETs (i.e., per-frame query happens) ✓
- Console is clean ✓

The CK-window articulation visual (AC4 third clause — "scrubbing forward 1 simulated hour at 100× speed shows the platform rotating progressively") is covered at the unit + integration tier (Story 3.4 dev test suite + AC8 integration test against real CK fixtures) but is NOT visually re-verified at smoke time because the CK files aren't in the local manifest. CI's full bake produces them and the post-deploy smoke (Story 1.14 / Story 7.x) is the binding visual gate for that path.

## Probe 1 — Boot at V1 Jupiter ET (intended CK; local fallback = synthesized)

URL: `http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z`

`__voyagerDebug.attitudeApplier` published ✓ (per AC8 last clause).
V1 group visible: `true`. LOD currentLevel: `2`.

`AttitudeService.getBusProvenance(-31, et)` at this ET returns `'synthesized'` — confirms the local-manifest constraint above. The CK path is structurally inaccessible without `just bake-attitude` outputs.

`v1.lod.levels[2].object.getObjectByName('BUS').quaternion.toArray()`:

```
[-0.3517248291629878, -0.6084849941815161, -0.3559965478466744, 0.6158750801318704]
```

Unit-length verification: `sqrt(0.352² + 0.608² + 0.356² + 0.616²) ≈ 1.0` ✓

SCAN_PLATFORM quaternion is identical (the cruise rest pose composition `bus_quat · PLATFORM_REST_RELATIVE_TO_BUS=identity = bus_quat` from Story 3.2 § Completion Note 5).

Screenshot: `probe1-v1-jupiter-ck-applied.png` — V1 visible in the scene; the spacecraft's BUS group has the non-identity rotation applied (the model is rotated rather than at the identity orientation).

## Probe 2 — Cruise ET (1995-01-01; structurally synthesized)

URL: `http://127.0.0.1:5173/?t=1995-01-01T00:00:00Z`

V1 group visible: `true`. LOD currentLevel: `2`.
`v1.group.position`: `[-2704146176, -6683136000, 4849467904]` (heliocentric km — outer-solar-system position, V1 ~70 AU at this ET).

`v1.lod.levels[2].object.getObjectByName('BUS').quaternion.toArray()`:

```
[0.26681812417511480, -0.3912356363060870, 0.4962505059287675, 0.7276525275578217]
```

Unit-length verification ✓.

SCAN_PLATFORM quaternion identical to BUS (cruise rest pose).

**Critical observation:** the BUS quaternion **differs substantially** between Probe 1 (1979) and Probe 2 (1995). This confirms the applier is calling `AttitudeService.getBusQuat()` per frame and writing the result — if the applier were stuck on a single value, both probes would return identical quaternions. The 16-year ET delta produces a measurable Earth-position-relative-to-V1 change, which the synthesized HGA-Earth-pointing path reflects in the rotation. This is the load-bearing smoke evidence that Story 3.4's wiring is correct.

Screenshot: `probe2-cruise-1995-synthesized.png`.

## Probe 3 — Console clean

`list_console_messages` (filter=error,warn) over the full smoke session:

- 1 [warn] "Lit is in dev mode. Not recommended for production!" — expected dev-server boilerplate.
- 0 errors.
- 0 Story 3.4-specific warnings.

No `[attitude-applier]`, no `[attitude-service]`, no `[spacecraft-models]` errors. The per-frame mutation runs at 60 Hz without WebGL warnings or Three.js complaints.

## Probe 4 — Cross-spacecraft + ordering (skipped at runtime, covered by tests)

The cross-spacecraft asymmetry (V1 has CK while V2 has only synthesized at a given ET, etc.) is covered by `attitude-applier-qa-gaps.test.ts` QA gap 2 at unit tier. The wiring-ordering invariant (`spacecraftModels.tick → attitudeApplier.tick → trajectory/celestial`) is covered by `attitude-applier-qa-gaps.test.ts` QA gap 7 via source-grep. Both are higher-fidelity at the unit tier than a real-browser probe could deliver.

## Probe 5 — LOD swap re-resolution (skipped at runtime, covered by tests)

AC5 LOD-swap re-resolution is covered by `attitude-applier.test.ts` (unit) + `attitude-applier-qa-gaps.test.ts` QA gap 1 (non-null→null LOD transition) and QA gap 5 (`getCurrentLevel() === -1` edge case). The dev fix using `handle.lod.levels[currentLevel].object` is the correctness mechanism; the test layer is the binding contract. Re-running this at smoke time would require driving the camera close enough to the spacecraft to trigger an LOD level change at LOD0 distance (< 1 m render-space), which requires manual Story 3.6 / Epic 4 camera-control infrastructure not yet in place.

## Summary

**Story 3.4 AC9 verdict: PASS for the synthesized cruise path + wiring + debug-surface + console.**

- Applier is wired into the per-frame loop (BUS quaternion is non-identity AND changes across simulated ETs).
- `__voyagerDebug.attitudeApplier` is published per AC8.
- SCAN_PLATFORM composes to bus quaternion in cruise rest pose per Story 3.2 § Completion Note 5.
- Console is clean.
- 28 tests at unit + integration tier cover the CK path + boundary discipline + cross-spacecraft + LOD-swap + zero-allocation.

**Local-manifest limitation noted:** the CK-window articulation visual is not exercised at smoke time because the local manifest predates the Story 3.1 attitude bake. CI re-bakes on each push (the bake-attitude recipe is in `justfile`); a post-deploy or post-CI-artifact-pull visual smoke at `/?t=1979-03-05T12:05:26Z` (V1 Jupiter closest approach) is the binding visual gate for AC4. Filed as a `[3.4 / LOW]` note in `deferred-work.md` for the bake-attitude pipeline propagation.

The classic "test pyramid is necessary but not sufficient" lesson holds — and reciprocally: the smoke is necessary but not sufficient on its own when data dependencies are bake-time. The two layers complement each other here.
