# ADR 0009 — No Web Workers for Trajectory Interpolation

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. Trajectory and attitude interpolation runs on the main thread. Web Workers are not used for `EphemerisService` or `AttitudeService`.

## Context

NFR-P7 budgets ≤1 ms/frame for trajectory interpolation across 12 bodies. NFR-P2 budgets P95 ≤16.7 ms total frame time (60 FPS) and P99 ≤22 ms. Web Workers offer off-main-thread CPU but pay a `postMessage` / `structuredClone` round-trip on every data exchange.

For this workload (closed-form Hermite eval, 12 bodies × 6 components per body per frame), the interpolation itself is sub-1-ms on a modest CPU. Worker overhead would dominate the computation.

[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Top-Recommendations]
[Source: _bmad-output/planning-artifacts/architecture.md#Category-2-Runtime-Service-Decomposition]

## Decision

**Run `EphemerisService.getStateAt` and `AttitudeService.getAttitudeAt` on the main thread.** No Web Worker offload for per-frame interpolation. `ChunkLoader` (network fetch) remains on the main thread too — `fetch` is non-blocking; the decompression cost is dominated by browser-native brotli decoding.

If a future workload genuinely benefits from worker offload (e.g., a Phase 4 large-N-body propagation experiment), that workload can be added behind a worker boundary without disturbing the per-frame interpolation path.

## Consequences

**Positive:**
- Zero `postMessage` round-trip cost on the per-frame hot path.
- Simpler service-graph topology: every service is a regular TS class, no worker shim.
- Easier debugging: stack traces and DevTools profiling work naturally.
- No double-buffer / shared-array-buffer complexity.

**Negative:**
- Main thread holds the interpolation cost. With ~1 ms / 12 bodies, well under budget; if a future feature pushes this above ~3 ms, revisit.
- Cannot easily parallelize across cores. Not a real loss at our body count.

**Obligations on downstream stories:**
- All service implementations under `web/src/services/` are main-thread classes (no `new Worker(...)`).
- Performance budget verification (Story 6.x / `/perf` route) confirms NFR-P7 holds without worker offload.

## Alternatives Considered

- **Web Worker per service.** Rejected: sub-1-ms work pre-worker; the `structuredClone` of input ET + output position arrays would cost more than the interpolation itself.
- **SharedArrayBuffer between main and worker.** Rejected: requires `Cross-Origin-Isolation` headers, which couples our CDN choice to a specific configuration and adds CSP friction. The performance gain at our scale doesn't justify the operational surface.
- **OffscreenCanvas + worker-based rendering.** Rejected: Three.js OffscreenCanvas support is partial across browsers in 2026; the rendering bottleneck is GPU not CPU at our scene complexity; the WebGL context loss handling across thread boundaries adds complexity for no measurable win.
- **Rust/WASM physics core in a worker.** Deferred to Phase 4 (per technical-research roadmap). `EphemerisService` is the swap seam if real-time orbital propagation becomes a feature. Not relevant for v1.
