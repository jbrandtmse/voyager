# ADR 0023 — Translation-Only View-Frame Blend (No Rotation Blend in v1)

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted for v1. The view-frame blend during encounters is translation-only; quaternion rotation blending between heliocentric and body-centered frames is deferred. Revisit only if Jupiter's tilt feels wrong in playtesting.

## Context

`ViewFrame.getTransform(et)` returns the J2000 → render-space transform. During encounters (±2 days from closest approach), the rendering origin smoothsteps from heliocentric to body-centered. The math gives a cinematic anchor-and-recede: Jupiter gradually anchors as Voyager approaches, then recedes.

Two blend strategies:

1. **Translation only.** Smoothstep alpha [0, 1] from heliocentric origin to body-centered origin. Simple linear interpolation of the origin point. Camera orientation continues to follow the camera controller.
2. **Translation + rotation.** Also blend the *frame orientation* from inertial J2000 axes to body-centric axes (e.g., Jupiter's equatorial frame). Requires quaternion SLERP between frame quaternions.

The technical research recommended translation-only with a flagged open question: *whether the smooth-blended view frame should also rotate axes during encounters, or only translate.*

[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Pattern-3-Canonical-Reference-Frame]
[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Open-Questions]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-4c]

## Decision

**v1 ships translation-only view-frame blend.** The blend math:

```
w = smoothstep(et, tCA - 2 days, tCA + 2 days)   // 0..1 over the window
origin = (1 - w) * sunPos + w * bodyPos
transform = Matrix4.translation(-origin)
```

Frame *orientation* remains J2000 throughout. Camera quaternion is owned by `VoyagerCameraController`, not by `ViewFrame`.

**Revisit only if Jupiter's equator orientation feels off** during Phase 2 playtesting. If it does, a future ADR will supersede this one with a rotation-blend approach (SLERP between J2000 and Jupiter-equatorial frame quaternions over the same window).

## Consequences

**Positive:**
- Trivial implementation: one smoothstep, one origin lerp, one Matrix4 translation.
- No quaternion frame math at the ViewFrame layer; orientation stays in one place (the camera controller).
- Cinematic feel for the dominant encounter cases (planet "anchors" as we approach) without rotation complexity.
- Cheap to revisit if playtesting flags issues; the ViewFrame interface absorbs the upgrade.

**Negative:**
- For planets with significant axial tilt (Uranus at ~98° is the worst case), the rendered orientation during encounter may feel disconnected from the planet's spin axis. Acceptable risk: technical research's confidence on this is medium; first playtest call.
- If we ever do add rotation blend, the camera controller logic must adapt — currently it operates in J2000 throughout.

**Obligations on downstream stories:**
- Epic 5 / Story 5.x implements `BlendedEncounterViewFrame` with translation-only blend.
- Phase 2 playtesting checks each encounter (V1+V2 × Jupiter, Saturn, Uranus, Neptune) for orientation discomfort.
- If issues surface, a successor ADR captures the rotation-blend decision; this ADR is then marked `Superseded-by-NNNN`.

## Alternatives Considered

- **Translation + rotation blend (quaternion SLERP between J2000 and body-equatorial frames).** Rejected for v1: complexity (quaternion math at the ViewFrame layer, interaction with camera controller); marginal benefit unclear without playtesting. Reserved as the successor option.
- **Hard frame switch at sphere-of-influence entry.** Rejected: produces visible pops at the boundary unless alignment happens to match (it doesn't); contradicts the "cinematic encounter" feel goal.
- **Always-heliocentric (no blend).** Rejected for encounters: gravity-assist visual reads as Jupiter whipping past Voyager rather than Voyager being slung around Jupiter; the educational point of FR8–FR14 demands the blended-encounter reading.
- **Per-encounter custom rotation tunings.** Rejected for v1: would bake assumption-laden numbers into every encounter spec without a clear improvement signal. Defer to a future rotation-blend ADR if needed.
