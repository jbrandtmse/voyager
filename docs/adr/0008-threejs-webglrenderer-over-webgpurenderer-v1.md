# ADR 0008 — Three.js WebGLRenderer over WebGPURenderer for v1

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted for v1. WebGPURenderer migration is deferred until Three.js's WebGPU backend supports reverse-Z.

## Context

Three.js (≥r170) exposes both WebGLRenderer and WebGPURenderer. WebGPU is mainstream across all four major browsers as of 2026 and offers compute shaders and reduced draw-call overhead. However, **WebGPURenderer does not yet support reverse-Z** (active upstream issue, likely 2026–2027), forcing logarithmic depth as the only option there.

The depth-precision strategy chosen in ADR 0002 (floating-origin + reverse-Z) is the primary correctness lever for sub-mm precision at 165 AU. Switching to WebGPURenderer would force logarithmic depth (≤0.5–2 cm precision at 10 m, plus early-Z disable on some hardware), which directly conflicts with NFR-P8 (zero z-fighting, zero jitter).

[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Pattern-2-Depth-Precision-Strategy]
[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Top-Recommendations]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-3b]

## Decision

Use **Three.js WebGLRenderer (≥r170)** for v1. Configure with reverse-Z depth and float depth buffer. Migrate to WebGPURenderer when Three.js's WebGPU backend gains reverse-Z support.

## Consequences

**Positive:**
- Sub-mm depth precision at 10 m from camera (per ADR 0002 analysis).
- Preserves early-Z optimization; no perf hit from logarithmic depth on older GPUs.
- Wider compatibility: WebGLRenderer hits more devices than WebGPU baseline 2026 (NFR-C1–C3 desktop/tablet/phone tiers).
- WebGL2 is the well-trodden path; Three.js examples and community knowledge are predominantly WebGL.

**Negative:**
- Forgoes WebGPU's compute shader and draw-call efficiency. Not a problem at our scale (~10 bodies + 1 spacecraft, not thousands of particles).
- Future migration to WebGPU will be a single-renderer-swap when upstream lands reverse-Z; tracked but not blocking.
- Some WebGPU-specific Three.js features (e.g., WGSL custom shaders) are unavailable; we use plain GLSL where needed.

**Obligations on downstream stories:**
- Renderer initialization (Story 1.10 / Epic 2) constructs WebGLRenderer; reverse-Z config per ADR 0002.
- The `GPUCapabilityProbe` (also covered in ADR 0002) selects reverse-Z vs logarithmic-depth fallback at boot.
- The `MeshoptDecoder` registration with `GLTFLoader` (ADR 0006) works identically on WebGLRenderer.
- The WebGPU migration is its own future story; superseding this ADR.

## Alternatives Considered

- **WebGPURenderer + logarithmic depth.** Rejected: trades sub-mm precision for ~0.5–2 cm precision plus early-Z disable, in exchange for WebGPU wins that don't matter at our scale. The depth-precision target is non-negotiable per NFR-P8.
- **Dual-renderer support (pick at boot).** Rejected: doubles the rendering-code maintenance surface for zero v1 user benefit. Single-renderer for v1; swap later as a clean migration.
- **CesiumJS engine.** Rejected (separate decision): CesiumJS has built-in astronomical-scale precision but its WebGPU migration is still in research as of May 2026, and it bundles opinions (terrain rendering, geo-spatial coordinate primitives) we don't need. Three.js + manual floating-origin is the right scope for this project.
- **Babylon.js.** Acknowledged (Babylon 9.0 released 2026-03-26) but rejected for project-fit reasons: smaller community for astronomical-scale work; Three.js's `webgl_reversed_depth_buffer.html` example is exactly the technique we need.
