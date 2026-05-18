# ADR 0003 — Cubic Hermite over Catmull-Rom for Trajectories

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. Trajectory interpolation uses cubic Hermite over SPICE-provided position+velocity samples. Catmull-Rom is explicitly rejected.

## Context

The `EphemerisService.getStateAt(et, bodyId)` must reconstruct continuous trajectories from a finite, discrete set of state vectors emitted by the build-time SpiceyPy bake. Required accuracy: ≤20 km / ≤5 km RMS trajectory accuracy (NFR-P9), ≤1 ms/frame interpolation cost for 12 bodies (NFR-P7). Mid-segment accuracy during high-curvature flybys is the dominant correctness gate.

SPICE emits both *position* and *velocity* at every sample. Catmull-Rom (the choice in the initial-research foundation document) estimates tangents from neighboring positions, throwing the known velocity data away. Cubic Hermite uses both, giving exact position+velocity at every knot.

The technical research document explicitly flagged this as the single most important correction to initial-research.md.

[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Pattern-4-Cubic-Hermite-Trajectory-Interpolation]
[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#R4]

## Decision

Use **cubic Hermite interpolation** over position+velocity samples for all body and spacecraft trajectories. Hermite basis (τ ∈ [0,1]):

```
h00(τ) =  2τ³ − 3τ² + 1
h10(τ) =    τ³ − 2τ² + τ
h01(τ) = −2τ³ + 3τ²
h11(τ) =    τ³ −   τ²

P(t) = h00(τ)·P0 + h10(τ)·(Δt·V0) + h01(τ)·P1 + h11(τ)·(Δt·V1)
```

The bake emits 6-component samples (x, y, z, vx, vy, vz) per body per time step (see ADR 0004 for the on-disk format). The runtime evaluates the closed-form expression above; no integration steps, no neighbor-tangent estimation.

## Consequences

**Positive:**
- C1 continuous at knots: position *and* velocity exact at every sample (matches SPICE bit-for-bit at knots).
- Same per-frame cost as Catmull-Rom (one cubic per axis).
- Dramatically lower mid-segment error during flybys (the visually critical phase).
- Closed-form: 1× and 1e9× time-warp are equally cheap (NFR-P6).

**Negative:**
- Sample files are 50% larger than position-only at the same cadence (6 floats vs 3). Mitigated by the per-decade cruise cadence (1 day) keeping the daily file ~1 MB; encounter overlays (1 sec / 10 sec) are tighter but still well within the asset budget (NFR-P5).
- L1 Python validation harness must verify the JS Hermite implementation against SpiceyPy at a fixed-seed grid (L2 layer of the 6-layer test pyramid).

**Obligations on downstream stories:**
- The VTRJ binary format (ADR 0004) carries `componentsPerSample = 6` for trajectories.
- The L1 / L2 validation harness asserts Hermite-vs-SPICE error stays under NFR-P9 thresholds.
- `EphemerisService` exposes a pure function `getStateAt(et, bodyId) → {position, velocity}` — never just position.

## Alternatives Considered

- **Catmull-Rom (`THREE.CatmullRomCurve3`, tension 0.5).** Rejected: discards the velocity data SPICE already provides; mid-segment error materially worse during flybys. This was the initial-research recommendation; this ADR documents the correction.
- **Linear interpolation between samples.** Rejected: piecewise-linear positions produce visible kinks at sample boundaries and zero velocity continuity.
- **Higher-order Lagrange (degree 5+) or Chebyshev polynomials.** Rejected: no meaningful improvement once state vectors are available, plus Runge oscillation risk at edges. These are what SPICE uses *internally* to produce the samples we consume — re-applying them is interpolation-on-interpolation.
- **Live SPICE evaluation in the browser (CSPICE-in-WASM).** Rejected — see ADR 0005 (build-time bake over runtime SPICE).
- **SQUAD (spherical cubic) for quaternions, applied to positions.** Not applicable; SQUAD is a quaternion technique. For attitude (the analogous problem) we use SLERP at 1-sec CK cadence — see implicit handling in ADR 0024.
