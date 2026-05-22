# ADR 0028 — NA Boresight Cone Only; Wide-Angle Camera Deferred to v1.1+

Status: Accepted
Date: 2026-05-22
Deciders: Voyager project maintainer

## Status

Accepted.

## Context

Story 3.5 (Narrow-Angle Camera Boresight Cone) renders a wireframe cone
extending from each spacecraft's scan platform along the imaging-camera
boresight, so visitors can see what each Voyager was pointed at moment-to-
moment. The Voyager ISS (Imaging Science Subsystem) has TWO cameras mounted
on the scan platform:

- **Narrow-Angle (NA) camera** — `VG1_ISSNA` (NAIF frame ID `-31101`),
  `VG2_ISSNA` (`-32101`). FOV 0.42° × 0.42° → half-angle 0.21°. The
  high-resolution imaging camera used for the canonical hero shots (Jupiter's
  Great Red Spot, Saturn's rings, Pale Blue Dot).
- **Wide-Angle (WA) camera** — `VG1_ISSWA` (NAIF frame ID `-31102`),
  `VG2_ISSWA` (`-32102`). FOV 3.17° × 3.17° → half-angle 1.585°. The lower-
  resolution context-imaging camera used for wide-field surveys (e.g. the
  Family Portrait mosaic backdrop, polar projection mapping).

The Voyager PRD § Out of Scope for v1 explicitly excludes the wide-angle
camera from the v1 visualization. This ADR records the rendering-side
implementation consequence of that PRD constraint, so future contributors
inspecting the boresight code don't have to re-derive WHY only one cone
appears.

The PRD constraint exists because:

1. The narrative anchor of "see what Voyager saw" is the NA camera — it shot
   every iconic Voyager image; the WA never produced an image that's part of
   public memory.
2. A second cone of ~7.5× the NA's half-angle (1.585° vs 0.21°) would
   visually compete with the NA cone (cluttering the scan platform with two
   nested cones at every encounter) for marginal narrative value.
3. The v1 timeline does not include the WA-specific encounters that would
   make the WA cone storyworthy (e.g. the Triton terminator wide-field
   shots fall inside Story 4.7's V2 Neptune chapter, but the chapter copy
   anchors on the NA close-up of Triton's geysers, not the WA backdrop).

## Decision

**Render ONLY the narrow-angle camera boresight cone in v1.** Defer the
wide-angle camera boresight cone to v1.1+ (post-launch enhancement work).

Story 3.5's `BoresightRenderer` (`web/src/render/boresight-renderer.ts`)
constructs exactly one `THREE.LineSegments` cone mesh per spacecraft (two
total: V1 + V2), each parented to its spacecraft's `SCAN_PLATFORM` node.
The cone's local +Z axis aligns with the NA camera boresight constant
`VG{1,2}_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM` from
`web/src/services/fk-constants.ts` (`[0, 0, 1]` — identity-relative-to-
platform per the `VG{1,2}_ISSNA` TKFRAME identity transform documented at
`kernels/vg1_v02.tf:247-256` and `kernels/vg2_v02.tf:256-265`).

A v1.1 implementation of the wide-angle cone would:

1. Add `VG1_WA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM` /
   `VG2_WA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM` constants to
   `fk-constants.ts`. Per `kernels/frame-ids.md`, the WA frames are TK
   class 4 relative to SCAN_PLATFORM with non-identity rotations
   (`VG1_ISSWA` angles `(0.275, -0.0247, 0.0315)` rad about axes
   `(3, 1, 2)` per `kernels/frame-ids.md:43`; `VG2_ISSWA` angles
   `(0.171102, 0.0068, -0.0308)` rad per `kernels/frame-ids.md:60`).
2. Extend `BoresightRenderer` to construct a SECOND cone per spacecraft
   with half-angle 1.585° (FOV 3.17° × 3.17°) and the WA-frame-relative
   orientation composed onto the cone's local transform at construction
   time (mirror of the NA cone's identity-orientation; the WA's non-
   identity offset must be baked in).
3. Add a distinct color and/or line style so the WA cone is visually
   distinguishable from the NA cone (e.g. dashed line, or
   `--v-color-accent-secondary`). UX spec amendment required.
4. Add an Integration AC verifying both cones are children of the same
   `SCAN_PLATFORM` and rotate together under platform articulation.

## Consequences

**Positive:**

- v1 visual register stays clean — one cone per spacecraft, easy to read at
  any zoom level.
- Implementation surface in Story 3.5 is minimal: ONE cone per spacecraft,
  ONE FK constant lookup, ONE color token.
- Future v1.1 enhancement can reuse the entire Story 3.5 architecture
  (BoresightRenderer is structured to support N cones; the NA cone is the
  first instance of a pattern that scales).

**Negative:**

- Visitors who know about the WA camera (Voyager enthusiasts, scholars) may
  notice the asymmetry. The /about page's attribution panel could document
  the deferral for that audience in v1.1 prep.
- Story 4.7 (V2 Neptune) will reference the NA cone exclusively even though
  some historically-significant Triton WA wide-field shots exist. The chapter
  copy anchors on the NA close-up to keep the visual register consistent.

**Migration story (if this decision is ever reversed):**

A v1.1 release would add the WA cone alongside the NA cone. No data
migration required — the FK constants are already available in the source
kernels; only the runtime constants surface and `BoresightRenderer` need
extending. URL contract is unaffected.

## Alternatives Considered

**Alternative 1 — Render both NA and WA cones in v1.**

Rejected because (a) the PRD explicitly scopes out the WA, (b) the visual
clutter from two overlapping cones (one inside the other since WA half-
angle subsumes NA half-angle at the same camera mount point but with the
small WA-frame offset) would dilute the "see what Voyager saw" narrative
anchor on the higher-resolution NA imagery, and (c) defers UX-design work
on color/style differentiation that's better done after v1 friendly-user
feedback (Story 6.5).

**Alternative 2 — Render only the WA cone (the wider one).**

Rejected because the WA camera was never the iconic instrument; every
canonical Voyager photograph in public memory was taken by the NA camera.
Visualizing the wider cone would undermine the narrative anchor.

**Alternative 3 — Add a UI toggle so visitors can switch NA / WA visibility.**

Rejected for v1 — adds a chrome control without a clear narrative payoff,
and complicates the embed-mode story (Story 2.5 deliberately minimizes
chrome). Reconsider for v1.1 if the WA cone is added; even then, the
toggle is likely OFF by default per the visual-register argument above.

## Related ADRs

- ADR-0008 (Three.js WebGLRenderer): native primitives (ConeGeometry,
  EdgesGeometry, LineSegments) are the implementation channel.
- ADR-0015 (no global store): the renderer is constructor-DI'd from
  `main.ts`, not a global.
- ADR-0026 (TS 6.x strict, zero `any`): the cone's TS surface is fully
  typed via Three.js's `@types/three`.

## References

- PRD § Out of scope for v1 (wide-angle camera explicitly listed).
- Story 3.5 § AC5 (this ADR's authoring directive).
- `kernels/frame-ids.md` § ISSWA rows for V1 + V2 frame definitions.
- `web/src/services/fk-constants.ts` § NA-camera boresight derivation.
