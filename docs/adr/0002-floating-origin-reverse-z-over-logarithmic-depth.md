# ADR 0002 — Floating-Origin + Reverse-Z over Logarithmic Depth

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. Floating-origin recenter every frame, plus reverse-Z depth on Three.js WebGLRenderer, is the depth-precision strategy for v1. Logarithmic depth is the GPU-capability fallback (NFR-C5).

## Context

The simulation must render coherently from sub-meter detail (Voyager spacecraft mesh) out to 165 AU (Voyager 1's actual current distance) without z-fighting and without Float32 jitter (NFR-P8, FR12).

A naive Float32 GPU coordinate system at AU scale snaps to ~2 km increments at 165 AU — the spacecraft model would jitter visibly at every camera move. A naive 24-bit linear depth buffer with far=165 AU gives ~10⁶ m precision at 10 m — useless for a scene meant to show meter-scale spacecraft articulation.

Two orthogonal techniques solve these two problems:

1. **Floating-origin** addresses the Float32 *position* precision issue: every frame the world-group is recentered on the camera so render-space coordinates stay near the origin where Float32 has sub-mm precision.
2. **Reverse-Z** addresses the *depth-buffer* precision issue: a float depth buffer with reversed compare gives sub-mm precision near the camera even with far=165 AU, while preserving early-Z optimizations.

[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Pattern-1-Floating-Origin]
[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Pattern-2-Depth-Precision-Strategy]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-3a]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-3b]

## Decision

**Floating-origin via the WorldGroup pattern.** A single root `THREE.Group` ("WorldGroup") holds the entire scene. Each frame: `worldGroup.position = -cameraWorldPos / SCALE`. This sweeps every child into camera-relative space via Three.js's automatic transform composition — no per-object computation. Combined with branded type layering (`WorldVec3` Float64 km → `RenderVec3` Float32 km post-recenter; see ADR 0012), the precision-loss boundary is explicit at the type-system level.

**Reverse-Z on Three.js WebGLRenderer (≥r170).** Use the native reverse-Z API: float depth buffer, flipped depth compare. Sub-mm precision at 10 m from the camera even with far=1.65e10 km. Camera near = 1e-6 km (1 mm), far = 1.65e10 km (≥165 AU). Three.js's reverse-Z demo (`webgl_reversed_depth_buffer.html`) is the canonical reference.

**Logarithmic depth as the GPU-capability fallback.** Boot-time `GPUCapabilityProbe` runs a small reverse-Z test pattern; on detected failure flips to `logarithmicDepthBuffer: true` (NFR-C5). The probe heuristic and failure threshold are owned by Story 1.10 / Epic 2 implementation.

## Consequences

**Positive:**
- Sub-mm precision near the spacecraft (the visually-important region) at every zoom level (NFR-P8: zero z-fighting, zero jitter).
- Best performance: reverse-Z preserves early-Z optimization; logarithmic depth disables it on some hardware (5–15% perf hit).
- Cinematic continuity: the user can zoom from full mission view to spacecraft surface without artifacts.

**Negative:**
- Forgoes WebGPURenderer perks (compute shaders, draw-call efficiency) until Three.js's WebGPU implementation gains reverse-Z support — this is a deferred migration (see ADR 0008). Tracked: [Three.js forum thread](https://discourse.threejs.org/t/does-three-js-webgpu-support-reverse-z-buffer/87687).
- Custom shaders (if any are introduced) must honor the reversed compare convention.
- The floating-origin recenter must happen *every* frame, including when the camera is stationary, so that newly-added world-space objects pick up the correct render-space offset.

**Obligations on downstream stories:**
- Renderer initialization (Story 1.10) configures WebGLRenderer with reverse-Z and the float depth buffer.
- GPU capability probe (Story 1.10) must run before main bundle init.
- Any code path that adds objects to the scene must add them to `WorldGroup`, not directly to the scene root.

## Alternatives Considered

- **Naive Float32 + standard 24-bit linear depth.** Rejected: jitters at AU scale; near-camera depth precision is useless.
- **Logarithmic depth only (no reverse-Z).** Rejected as primary: ~0.5–2 cm precision at 10 m (vs ~0.6 mm with reverse-Z); disables early-Z on some hardware. Kept as the capability fallback only.
- **Multi-frustum / depth partitioning** (the CesiumJS approach internally). Rejected: 3–4× render cost, complex implementation. The Voyager scene is story-driven — close to Voyager OR following a planet, almost never simultaneously — so multi-frustum is unjustified. For the rare full-system "where am I" view, the spacecraft renders as a billboard impostor and the precision problem disappears.
- **WebGPURenderer + logarithmic depth (the WebGPU-now path).** Rejected for v1: the WebGPU draw-call wins don't matter at this scale (~10 bodies + 1 spacecraft, not 10,000 particles), while reverse-Z precision and clean shader compatibility do.
