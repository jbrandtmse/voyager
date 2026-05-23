---
id: BUG-E4-002
title: Saturn renders as a featureless ball — no ring system mesh in the scene
severity: high
type: missing-asset / missing-feature
discovered_during: epic-4-rewalk-2026-05-23
related_stories:
  - 4-6-v2-jupiter-v1-saturn-titan-slingshot-and-v2-saturn-encounters
  - 1-13-celestial-bodies-sun-eight-planets-and-one-moon
related_epic: epic-4
related_fr: FR14 (celestial bodies rendered)
---

## Summary

Saturn renders as a textured sphere with no ring system. The V1 Saturn chapter copy explicitly describes the ring system as a primary discovery target ("first high-resolution photometry of the broad rings, the braided F-ring, and a new feature — radial 'spokes'"), but the scene tree contains no ring mesh at all.

## Evidence

At `/c/v1-saturn`, the entire `CelestialBodies` child list:

```
celestial-10 (Sun)         visible:true
celestial-1..8 (planets)   visible:true
celestial-301 (Earth Moon) visible:true
celestial-606..608         visible:false  (Titan/Hyperion/Iapetus — see BUG-E4-001)
SunDirectionalLight        visible:true
(unnamed Object3D)         visible:true
```

`bodies.find(b => /ring|saturn-ring/i.test(b.name))` → `NOT_FOUND`

Saturn (`celestial-6`) is a single Mesh with `radius: 58232` and **zero children** (no ring band attached).

Chapter copy at `/c/v1-saturn`:
> "the spacecraft sweeps the ring system: the first high-resolution photometry of the broad rings, the braided F-ring, and a new feature — radial 'spokes' that rotate with Saturn's magnetic field rather than Keplerian orbital motion."

## Impact

- Saturn is unrecognisable without its rings. Visitors zooming into the V1/V2 Saturn encounter see a generic yellow ball.
- The chapter narrative becomes incongruent — the copy speaks of "the ring system" but there is no ring system on screen.
- The V2 Neptune chapter copy similarly speaks of "ring arcs detected from Earth into complete rings with azimuthal density variations" — Neptune's rings are a separate but related missing-asset issue. Likely the same fix scope (procedural ring meshes for ringed planets).
- The Pale Blue Dot scene (Epic 5) will eventually look at Saturn from far away as one of the six worlds the narrow-angle camera sweeps. Without rings, Saturn-from-PBD-distance will be a tiny featureless dot.

## Expected

Per FR14 and the Step 13 / PRD encounter coverage, ringed planets need their rings:

- Saturn: full ring system (A, B, C, D, E, F bands at minimum) as a flat textured disc geometry (`THREE.RingGeometry` or a custom radial shader, depending on style register).
- Neptune: ring arcs (Adams, Le Verrier, Galle, Lassell, Arago rings) — referenced in V2 Neptune copy.
- Uranus: optional but called out by chapter copy reference to "ring arcs" / Voyager-era Uranian ring discoveries.

## Fix scope

1. Add a `saturn-ring-system` mesh as a child of `celestial-6` (or as a sibling under `CelestialBodies`) using `RingGeometry` with the saturn-ring texture mapped through the ring radii. The texture needs an alpha channel for ring-gap transparency.
2. Same pattern for Neptune ring arcs and (optionally) Uranus rings.
3. Render-tier consideration: rings need to respect the same KTX2 / LOD discipline as planet base colours (Story 4.3).
4. Defense: snapshot test that asserts a `*-ring` mesh exists under the ringed-planet meshes.

## Note

This is not strictly a regression against Story 4.6's stated AC (which doesn't enumerate "rings" in its acceptance criteria). It is a regression against the chapter copy / FR14 visitor promise, surfaced because Story 4.6 set the user expectation through hand-written prose without delivering the corresponding visual asset. Recommend addressing as a tightly-scoped follow-up story or as part of Epic 5 PBD asset prep.
