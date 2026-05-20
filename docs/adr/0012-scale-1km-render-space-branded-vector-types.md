# ADR 0012 — SCALE=1 km in Render-Space with Branded Vector Types

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. Render-space scale is `SCALE = 1` (1 unit = 1 km). The precision layering is enforced at the type level via branded vector aliases: `WorldVec3` (Float64 km), `RenderVec3` (Float32 km post-recenter), `MeshLocalVec3` (Float32 m).

## Context

The single biggest technical risk is **R5: silent Float32 jitter under zoom from a subtle bug in floating-origin math** (the technical research's risk register flags this as Medium likelihood × High impact). The bug looks like the app is "broken at zoom" and is easy to introduce when adding new objects to the scene that bypass the WorldGroup recenter, or when a service forgets to keep authoritative state in Float64.

The mitigation is to make the precision-loss boundary *visible* at the type-system level so a developer (or AI agent) writing new code cannot accidentally cross it without an explicit cast.

[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#R5]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-3a]

## Decision

**Render-space scale: `SCALE = 1` (1 km per unit).** Float32 precision at the render-space origin is ~1.2e-7 km = 0.12 mm, which clears every sub-mm precision target in the scene.

**Branded vector type layering (TypeScript branded types):**

- `WorldVec3` — Float64, km, J2000 heliocentric. Authoritative. Emitted by `EphemerisService.getStateAt`. Never reaches the GPU directly.
- `RenderVec3` — Float32, km, post-floating-origin-recenter. Passed to Three.js scene-graph (positions on Object3D).
- `MeshLocalVec3` — Float32, meters. Vertex-local within a model (e.g., Voyager spacecraft mesh's bone-local positions).

**Cast points are explicit at the type-system level.** Functions named like `castWorldToRender(v: WorldVec3, cameraPos: WorldVec3): RenderVec3` are the *only* place precision is downcast. Audit by grep.

**Camera near/far:** near = 1e-6 km (1 mm), far = 1.65e10 km (≥165 AU). Reverse-Z float depth (per ADR 0002) handles depth precision across this range.

## Consequences

**Positive:**
- R5 (silent Float32 jitter) becomes a *type error* rather than a runtime visual bug — adding `position: WorldVec3` to a Three.js Object3D fails to compile.
- The precision boundary is documentable, greppable, and reviewable.
- AI agents working in this codebase get explicit type signals at the cast boundary.
- Unit ambiguity (km vs meters vs AU) is impossible inside a function: the type carries the unit.

**Negative:**
- Slightly more verbose API surface than raw `THREE.Vector3` everywhere. Mitigated: `WorldVec3` is a structural alias of `{ x: number, y: number, z: number }` with a brand tag, not a class — zero runtime overhead.
- Developers must remember to use the branded constructors / cast functions. Mitigated by enforcing it in lint rules where feasible and by docstring-grade comments at the cast sites.

**Obligations on downstream stories:**
- `web/src/types/branded.ts` (or equivalent) defines the three branded aliases and the cast functions. Lands in Epic 2 / Story 2.x (RenderEngine + EphemerisService).
- All service implementations honor the branding: `getStateAt(et) → WorldVec3`, render-side recenter produces `RenderVec3`.
- Forbidden variable-name patterns (`positionKm`, `positionMeters`, `position_km`) are documented in the architecture's naming patterns section; the type carries the unit, the variable name does not repeat it.

## Alternatives Considered

- **`SCALE = 1000` (1 unit = 1 m).** Rejected: pushes the camera-far plane from 1.65e10 to 1.65e13, which exceeds Float32's safe integer range and forces tricks. SCALE=1 km is the sweet spot for the AU-to-meter range we need.
- **Plain `THREE.Vector3` everywhere, with a code-review/comments approach.** Rejected: relies on humans to remember the precision boundary; exactly the failure mode this ADR prevents. R5 is too costly to detect downstream.
- **Class-based wrappers `class WorldVec3 { ... }`.** Rejected: runtime overhead per allocation, and Three.js's APIs expect `{ x, y, z }`-shaped objects. Branded structural types give the type-level safety without the runtime cost.
- **AU as the unit.** Rejected: AU is for HUD display only; doing math in AU forces division by 1.496e8 km on every SPICE lookup, gaining nothing.
- **Logarithmic-space coordinates (some games do this for galactic scales).** Rejected: SPICE outputs linear km; converting in and out of log space loses precision and complicates Hermite interpolation; floating-origin is the standard solution at this scale.
