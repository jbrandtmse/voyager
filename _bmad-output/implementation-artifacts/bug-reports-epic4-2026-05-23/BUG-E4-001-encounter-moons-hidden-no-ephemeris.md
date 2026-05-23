---
id: BUG-E4-001
title: Encounter-target moons are loaded as meshes but never positioned or made visible
severity: critical
type: missing-feature / data-pipeline-gap
discovered_during: epic-4-rewalk-2026-05-23
related_stories:
  - 4-5-v1-jupiter-encounter-1979-03-05-with-body-centered-framing
  - 4-6-v2-jupiter-v1-saturn-titan-slingshot-and-v2-saturn-encounters
  - 4-7-v2-uranus-and-v2-neptune-encounters-triton-bend-fr12
related_epic: epic-4
related_fr: FR14 (key moons), FR21–FR26 (per-encounter content), FR23 (Titan flyby legibility), FR26 (Triton flyby)
---

## Summary

For each of the six gas-giant encounters, the chapter copy explicitly names target moons that the user is supposed to see during the encounter. The moons are loaded into the Three.js scene as `Mesh` instances with `MeshStandardMaterial`, textures (`hasMap: true`), and correct radii — but every one of them is pinned at scene-space `(0, 0, 0)` and rendered with `visible: false`. The bake pipeline does not produce ephemeris data for any moon other than Earth's Moon (NAIF 301), so the runtime has no positions to apply.

## Evidence (per chapter)

### V1 Jupiter (`/c/v1-jupiter`)

Galilean moons present, all hidden at scene origin:

```
celestial-501 (Io)        visible:false  pos:(0,0,0)  radius:1821.6 km  hasMap:true
celestial-502 (Europa)    visible:false  pos:(0,0,0)  radius:1560.8 km  hasMap:true
celestial-503 (Ganymede)  visible:false  pos:(0,0,0)  radius:2634.1 km  hasMap:true
celestial-504 (Callisto)  visible:false  pos:(0,0,0)  radius:2410.3 km  hasMap:true
```

Chapter copy (visible at `<v-chapter-copy>`):
> "the spacecraft sweeps past Amalthea, Io, Europa, Ganymede, and Callisto in turn …  Linda Morabito notices a crescent on Io's limb …"

Story 4.5 spec header at [web/src/chapters/specs/v1-jupiter.ts:10-15](web/src/chapters/specs/v1-jupiter.ts#L10-L15) explicitly:
> "The body-centered framing was tuned to keep V1 + Jupiter + Io visible together at closest approach."

Story 4.5 AC3:
> "the NA boresight cone sweeps from Io to Europa to Ganymede to Callisto in the historical sequence (validated against `ckbrief` inventory for V1J coverage)"

None of the four can be visually validated because they are all hidden at origin.

### V1 Saturn (`/c/v1-saturn`)

```
celestial-606 (Titan)     visible:false  pos:(0,0,0)
celestial-607 (Hyperion)  visible:false  pos:(0,0,0)
celestial-608 (Iapetus)   visible:false  pos:(0,0,0)
```

Chapter copy:
> "the spacecraft has already cleared its hero target — Titan, 6,490 kilometres above the surface"

Titan is the *headline* target of the V1 Saturn encounter (FR23 — "the Titan close flyby that slingshots V1 out of the ecliptic plane"). Titan is invisible.

### V2 Uranus (`/c/v2-uranus`)

```
celestial-701 (Ariel)     visible:false  pos:(0,0,0)
celestial-702 (Umbriel)   visible:false  pos:(0,0,0)
celestial-703 (Titania)   visible:false  pos:(0,0,0)
celestial-704 (Oberon)    visible:false  pos:(0,0,0)
celestial-705 (Miranda)   visible:false  pos:(0,0,0)
```

Chapter copy:
> "the approach takes the probe past Oberon, then Titania, then Umbriel, then Ariel, before the closest planetary approach … the flyby is tuned for a close pass at Miranda — at twenty-nine thousand kilometres"

Story 4.7 AC2 explicitly requires Uranus chapter copy to "cover the Miranda flyby at 29,000 km, the Ariel / Umbriel / Titania / Oberon flybys". The user is told the spacecraft is flying past these five moons but sees none of them.

### V2 Neptune (`/c/v2-neptune`)

```
celestial-801 (Triton)    visible:false  pos:(0,0,0)
```

Chapter copy:
> "V2 sweeps past Triton at thirty-nine thousand eight hundred kilometres, capturing active nitrogen geysers … The Triton encounter geometry deflects V2's trajectory south of the ecliptic plane, the final gravity assist of the mission."

FR26 explicitly: "V2 Neptune encounter, including the Triton flyby that bends the trajectory south of the ecliptic". Triton is the gravitational source of the FR12 bend — but Triton is invisible.

### V2 Jupiter, V2 Saturn

Per-chapter probing not separately captured here, but the pattern is identical — chapter copy describes moons, manifest contains only NAIF-301 moon ephemeris, the encounter target's moons are present as hidden meshes at origin.

## Root cause (verified)

`__voyagerDebug.viewFrame.ephemeris.bodiesById` map keys at runtime:

```
[-32, -31, 1, 2, 3, 4, 5, 6, 7, 8, 10, 301]
```

That's V1, V2, eight planets, Sun, and Earth's Moon (NAIF 301). **No other moon has ephemeris data baked.** The mesh loader (per Story 4.3 "moon meshes" commit `7e60dd9`) prepares the meshes and adds them to the scene, but no positioning subscriber runs because there are no bodiesById entries for them.

`celestialBodies.moonHandles` at `/c/v2-neptune` is a `Map(1)` with only key `801` (Triton) — and even that handle's mesh stays `visible: false` because no position update fires.

## Impact

- Five of the six encounter chapters fail their core narrative promise (FR21–FR26: "user experiences the encounter").
- Story 4.5 AC1's "Io visible during closest approach" requirement is literally false.
- Story 4.5 AC3's NAC boresight cone sweep across Io → Europa → Ganymede → Callisto cannot be visually verified.
- FR12 (Triton flyby bending V2 south) cannot be visualised at the encounter because Triton is invisible.
- The chapter copy reads as if it's describing an empty room.

## Fix scope

1. **Bake pipeline:** extend `bake/src/sample.py` (or wherever moon trajectory sampling is configured) to produce VTRJ files for NAIF IDs 501–504, 606–608, 701–705, 801 across each spacecraft's encounter window (±5 days is sufficient — these don't need full-mission cadence).
2. **Manifest:** add the new VTRJ files to `manifest.json`.
3. **Runtime:** confirm `EphemerisService` consumes the new bodies; positioning subscriber updates moon mesh positions per frame; visibility toggles `true` when the chapter window opens and `false` outside it.
4. **Defense tests:** assert that at each encounter anchor, the encounter's target moons resolve to non-zero ephemeris positions and have `visible === true`.

## Reproduction

```
1. http://localhost:5173/c/v1-jupiter  → confirm Galilean moons hidden.
2. http://localhost:5173/c/v1-saturn   → confirm Titan/Hyperion/Iapetus hidden.
3. http://localhost:5173/c/v2-uranus   → confirm Miranda/Ariel/Umbriel/Titania/Oberon hidden.
4. http://localhost:5173/c/v2-neptune  → confirm Triton hidden.
```

In each case, the relevant moons exist in `__voyagerDebug.renderEngine.worldGroup.CelestialBodies.children` with `visible: false` and `position = (0, 0, 0)`.
