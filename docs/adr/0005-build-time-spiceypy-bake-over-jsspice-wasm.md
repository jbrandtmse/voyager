# ADR 0005 — Build-Time SpiceyPy Bake over jsSpice-in-WebAssembly

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. All ephemeris (SPK) and attitude (CK) data is precomputed at build time by a Python+SpiceyPy bake. CSPICE-in-WebAssembly at runtime is explicitly rejected.

## Context

The simulator must reconstruct two Voyager probes plus major bodies (planets, key moons) from NAIF SPICE kernels (SPK, CK, PCK, LSK, FK). The data is *historical* — Voyager's mission is fixed-history, not live-evolving — so every state vector the runtime ever needs is knowable at build time.

Two architectural shapes are possible:

1. **Build-time bake:** Python reads SPICE kernels, emits a custom binary at fixed cadence, ships the binary. Runtime interpolates (per ADR 0003). No SPICE at runtime.
2. **Runtime SPICE in WASM:** Ship CSPICE compiled to WebAssembly; the browser evaluates kernels live. No bake step.

[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#R9]
[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Executive-Summary]
[Source: _bmad-output/planning-artifacts/architecture.md#Category-1-Build-Time-Data-Pipeline]

## Decision

Use the **build-time SpiceyPy bake**. Architecture:

- Python 3.13 + SpiceyPy 8.1.0 + scipy + numpy on the bake side.
- `bake/src/bake_trajectories.py` extracts daily/hourly/per-minute state vectors per body per time-window; `bake/src/bake_attitude.py` extracts quaternions from CK kernels.
- Output: VTRJ binaries (ADR 0004), brotli-compressed, manifest-tracked.
- Runtime: zero SPICE. Hermite interpolation (ADR 0003) for position+velocity; SLERP for quaternions. Closed-form `getStateAt(et)` — no integration steps.

The bake is byte-identical reproducible (NFR-R4): SpiceyPy pinned to `==8.1.0` exact, Python patch version via `.python-version`, `uv.lock` committed, CI runs only on linux/amd64.

## Consequences

**Positive:**
- Runtime payload is tiny (~5–25 MB trajectories + 15–25 MB attitude). No CSPICE binary ships to the browser.
- Browser-side interpolation is sub-1-ms per body per frame (NFR-P7).
- 1× and 1e9× time-warp are equally cheap because Hermite eval is closed-form.
- No WebAssembly / Emscripten toolchain on the runtime side.
- Reproducibility: byte-identical bake on CI is testable (NFR-R4).
- Kernel updates are a single Python re-run + drift report (NFR-M2 ≤30 min flow).

**Negative:**
- Cannot add new bodies or new time windows without a re-bake + redeploy (acceptable: the mission is fixed; the only realistic additions are if NASA publishes refined kernels, which is a tracked operational flow).
- Browser cannot answer arbitrary SPICE queries (not a feature requirement; we have no "what was V1 doing at time X" general-query UI beyond the timeline-scrubber).
- Bake-side runs only on linux/amd64 to keep CSPICE wheel reproducibility; Windows / macOS contributors run via the Python `uv` toolchain locally and rely on CI for the authoritative bake.

**Obligations on downstream stories:**
- The bake pipeline (Epic 2) implements the trajectory and attitude extraction scripts.
- The L1 Python validation harness asserts interpolation error bounds (NFR-P9: ≤20 km / ≤5 km RMS).
- The L2 JS-vs-SPICE consistency test loads fixed-seed Python references and asserts the JS Hermite implementation matches.
- Bake-determinism CI step re-bakes and asserts byte-identical SHAs (NFR-R4).

## Alternatives Considered

- **CSPICE-in-WebAssembly (jsSpice or fresh Emscripten port).** Rejected. `jsSpice` is dormant; no canonical CSPICE-to-WASM port exists as of May 2026; the runtime savings don't exist for a fixed historical mission. Risk register R9 calls this out as "weeks disappear" if pursued — keep this path off the table unless arbitrary ephemeris queries become a real product need.
- **Live JPL Horizons API at runtime.** Rejected: requires runtime network calls (NFR-S9 forbids cross-origin runtime fetches); API stability is uncertain; latency ruins time-jump UX; couples uptime to NASA infrastructure.
- **ANISE (Rust-native SPICE replacement) compiled to WASM.** Acknowledged as a viable future path (ANISE reached TRL 9 in 2025, used on Firefly Blue Ghost). Deferred — the precompute path is undemanding; switching to a runtime evaluator buys nothing for v1. The `EphemerisService` interface is the swap seam if a future need emerges.
- **Hybrid: bake the heavy lifting, ship CSPICE-WASM for edge cases.** Rejected: complexity without payoff. The "edge cases" don't exist for this product.
