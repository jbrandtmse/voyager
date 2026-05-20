# ADR 0024 — Pre-Bake Quaternion Sign-Flip Walk

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. The attitude bake walks each CK-derived quaternion stream and flips any sample whose dot product with the previous sample is negative, ensuring SLERP at runtime always interpolates the short way.

## Context

A unit quaternion `q` and its negation `-q` represent the *same* rotation but live on opposite sides of the 4-sphere. CK kernels can emit samples that switch sign between adjacent timesteps if SPICE's internal evaluation crosses a sign boundary — at that point, SLERP between the two samples interpolates the *long* way around (≈360° - intended-angle), producing a visible rotation-jerk artifact.

The fix is well-known: pre-process the quaternion array once, walking each pair `(q_prev, q_curr)` and flipping `q_curr ← -q_curr` whenever `dot(q_prev, q_curr) < 0`. Done once at bake time, the runtime SLERP sees only short-way pairs and the artifact disappears.

This is risk **R14** in the technical research's attitude-integration risk register. Likelihood Low; Impact Medium (it would surface as a visible jerk during encounter playback).

[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#R14]

## Decision

**Pre-bake quaternion sign-flip walk.** In `bake/src/bake_attitude.py`, after extracting the quaternion array from `sp.ckgp`, walk the array linearly:

```python
for i in range(1, len(quats)):
    if dot(quats[i-1], quats[i]) < 0:
        quats[i] = -quats[i]
```

Then serialize to VTRJ (ADR 0004 with `componentsPerSample=4`). Runtime SLERP via `THREE.Quaternion.slerp` sees only short-way pairs.

## Consequences

**Positive:**
- Runtime quaternion interpolation has zero sign-flip artifacts by construction.
- Cost is paid once at bake time, not per-frame at runtime.
- SLERP code stays standard `THREE.Quaternion.slerp`; no shortest-path checks needed at runtime.
- Determinism preserved: the walk is byte-deterministic given identical input quaternion samples; NFR-R4 byte-identical bake holds.

**Negative:**
- The walk imposes a serial pass through the quaternion array (cannot be parallelized within a single body's stream). At ~1 sec cadence × encounter windows × 2 spacecraft × ~5 encounters, the total quaternion count is tens of thousands — sub-second bake-time cost, irrelevant.
- If the runtime ever needs to *append* quaternion data dynamically (e.g., live data stream — not in scope), it would need to re-walk from the last known-good sample. Not a concern for the historical-only mission.

**Obligations on downstream stories:**
- Epic 2 / Story 2.x bake-attitude script implements the sign-flip walk.
- The L1 validation harness includes a test that the walked output has `dot(q_prev, q_curr) >= 0` for every adjacent pair.
- The L2 JS-vs-SPICE consistency test loads walked quaternion fixtures and asserts SLERP matches the SPICE-evaluated reference orientation within tolerance.

## Alternatives Considered

- **Do the sign-flip check at runtime inside SLERP.** Rejected as a *replacement*: pays the cost every frame; the de facto SLERP implementation already includes the shortest-path check, but doing it at bake time means we ship known-good data and the runtime check is just defense-in-depth. The walk eliminates the ambiguity from the data, not from the consumer.
- **Use SQUAD (spherical cubic interpolation) instead of SLERP.** Rejected: SQUAD requires three samples per evaluation and a precomputed intermediate; same sign-flip problem just delayed; no perceptual benefit at our 1-sec cadence per the technical research.
- **Re-extract from CK with a different SpiceyPy entry point.** Rejected: `sp.ckgp` and friends are the canonical CK readers; no other entry point avoids the sign issue at the source.
- **Skip and accept the occasional jerk.** Rejected: visible visual artifact during the highest-attention scenes (encounter close approach); the fix is one-line and free.
