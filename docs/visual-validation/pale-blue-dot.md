# Pale Blue Dot Composite Layer — Visual Validation

> **Story 5.3 deliverable (AC7).** This document is the canonical
> visual-validation evidence that the PBD photo-plate composite layer
> aligns the historical NASA Photojournal narrow-angle frames with the
> simulation's projected NA-camera boresight axis at the Pale Blue Dot
> imaging instant.
>
> **Scope.** FR28 commits Voyager to a reconstruction of the 1990-02-14
> family-portrait imaging sequence — Voyager 1 turns its scan platform
> toward the inner solar system and the six narrow-angle frames composite
> into the scene at the corresponding chronological substates per
> `web/src/chapters/pale-blue-dot/substates.ts`. Story 5.3 ships the
> composite layer that performs the actual on-canvas compositing; this
> document closes AC7 by recording the visual alignment + chosen
> cinematic plate size against the historical reference.
>
> **Living artifact.** Like `gravity-assists.md`, this file is updated as
> friendly-user testing (Epic 7) or earlier feedback surfaces any
> alignment concern. The iteration loop is identical to Story 4.8's: the
> screenshot is re-captured, the doc rewritten in place, no test
> baseline changes.

## Chosen plate size — 128×128 px

Per Story 5.3 AC3 the composite plates are NOT shown at true angular
scale (Earth was 0.12 of a pixel in Voyager 1's narrow-angle frame at
PBD distances; rendering the frame at sub-pixel angular size would make
it invisible). The story spec recommends ~96 px square at 1280×720 — a
cinematically readable size that doesn't obscure the simulation. Story
5.3 procures the source PNGs at **128×128 px** (next power-of-2 above
96 — friendlier to browser texture caching) and the composite layer
displays them at **128 CSS pixels square** without further scaling.

At a 1280×720 viewport this is ~17.8% of viewport height and ~10% of
width — visible without obscuring the V1 spacecraft model or the
celestial-body field. At larger viewports the plate ratio shrinks
proportionally; at smaller viewports (mobile, ~390×844) the plate is
~15% of width but the simulation surface itself is reduced commensurately.

## Source frames — NASA Planetary Photojournal

The six per-body plates are derived from two canonical NASA PIA entries:

- **Earth — PIA00452.** The canonical "Pale Blue Dot" frame. The 453×614
  px JPEG is used in its entirety as the Earth plate (preserves the
  iconic Sagan-1994 light-streak composition that gives the scene its
  name). The build pipeline (`web/scripts/build_pbd_plates.ts`) resizes
  this directly to 128×128 PNG.
- **Venus / Jupiter / Saturn / Uranus / Neptune — PIA00453.** The
  six-panel "Solar System Portrait — Views of 6 Planets" composite. The
  620×500 px image lays out the six narrow-angle frames as a 3×2 grid
  in published reading order (Venus, Earth, Jupiter / Saturn, Uranus,
  Neptune). The build pipeline crops each ~206×250 cell, then resizes
  each crop to 128×128 PNG.

Full attribution is in [`THIRD_PARTY.md`](../../THIRD_PARTY.md) `§ NASA
Photojournal PBD photo plates (Story 5.3)` and surfaced at runtime via
`<v-attribution-panel>`.

## NA-boresight alignment — Path A HTML overlay

Per Story 5.3 AC3 the composite layer uses **Path A** (HTML overlay) —
absolutely-positioned `<img>` elements inside a sibling DOM container
`<div class="pbd-composite-layer">`. The container is appended to the
canvas's parent (NOT the canvas itself); `pointer-events: none` keeps
it from intercepting gestures.

The per-frame projection:

1. Resolve the live V1 `SCAN_PLATFORM` Object3D via the
   `SpacecraftModels.getHandle('voyager-1')` LOD-aware lookup
   (mirror of `boresight-renderer.ts:373-384`).
2. Read its world-space position via `getWorldPosition`.
3. Project to NDC via the perspective camera's `project(vec)`.
4. Map NDC → CSS pixels using
   `document.documentElement.clientWidth / clientHeight`.
5. Set the plate `<img>`'s `style.left` / `style.top` to position its
   top-left corner so the plate's center sits on the projected pixel.

This anchors each plate to the projected NA-camera boresight cone — the
same cone the Story 3.5 `BoresightRenderer` paints as a wireframe — so
the plate visually "sits at the end of the cone" the user sees on
screen.

The composite blending is **standard alpha** (`mix-blend-mode: normal`)
— additive blending was considered and rejected because the per-pixel
star-field already contrasts the plate against black space, and
additive would oversaturate the iconic Earth pixel itself.

## Substate-driven opacity (the "30-second pause" semantic)

The composite layer subscribes to `PaleBlueDot.subscribe(...)`. The
substate→plate mapping is in `composite-layer.ts:PBD_SUBSTATE_TO_PLATE`:

| Substate              | Plate visible | Story 5.3 rationale                                                |
| --------------------- | ------------- | ------------------------------------------------------------------- |
| `idle` / `turning`    | (none)        | Pre-sweep state — no plate yet.                                     |
| `sweeping_venus`      | Venus         | Fade-in to 1 over 200ms at substate start.                          |
| `sweeping_earth`      | Earth         | The hero shot. Fade-in to 1 over 200ms.                             |
| **`composite_active`**| **Earth held**| **30-second pause (success criterion).** Story 5.3 Rule-5 amendment to `substates.ts`. |
| `sweeping_jupiter`    | Jupiter       | Earth fades out, Jupiter fades in.                                  |
| `sweeping_saturn`     | Saturn        | (likewise)                                                          |
| `sweeping_uranus`     | Uranus        | (likewise)                                                          |
| `sweeping_neptune`    | Neptune       | (likewise)                                                          |
| `composite_decay`     | (none)        | Final plate fades out.                                              |
| `passed`              | (none)        | Internal timeline complete.                                         |

The Story 5.1 substate definitions had `composite_active` at the END of
the arc with the docstring "all six plates visible simultaneously",
which directly contradicted Story 5.3 AC4 ("at most ONE plate visible at
any moment"). Story 5.3 dev amended `substates.ts` in place per Rule 5
— moving `composite_active` to between `sweeping_earth` and
`sweeping_jupiter` so the Earth plate stays visible for 15s (sweep) +
30s (hold) = 45s, exceeding the FR28 30-second success-criterion pause.
The total cinematic arc length stays 180s.

## Reduced-motion path

`window.matchMedia('(prefers-reduced-motion: reduce)').matches` — when
true, the 200ms cross-fade becomes an instant opacity flip. The
substate-driven plate switch still fires; only the visual transition is
suppressed. This is the same matchMedia probe used by Story 5.2's
turn-choreography reduced-motion path.

## Embed-mode preservation (composites are simulation, not chrome)

Per Story 5.3 AC8 the composite layer remains in the DOM in embed mode.
The Story 2.5 chrome-skip discipline (chapter index, attitude indicator,
etc. omitted from the DOM when `?embed=true`) does NOT apply to the
composite layer because composites are **simulation content**, not HUD
chrome. The
[`pale-blue-dot-composite-integration.test.ts`](../../web/tests/pale-blue-dot-composite-integration.test.ts)
contract pins this and the
[`embed-mode-first-paint.test.ts`](../../web/tests/embed-mode-first-paint.test.ts)
suite extends the embed-mode test surface to assert no chrome-skip
pathway hides `.pbd-composite-layer`.

## Smoke evidence (AC9)

The lead-driven Chrome DevTools MCP smoke captures one screenshot at
each `sweeping_<body>` substate's peak ET plus one mid-transition fade
frame. Evidence is committed under
`_bmad-output/implementation-artifacts/5-3-smoke-evidence/`.

### Expected screenshot inventory

The smoke navigates to each peak ET via the Story 5.2 deep-link pattern
(`/c/pale-blue-dot/?t=<iso-of-peak-ET>`) and captures:

| File                                | Substate          | Peak offset (s from anchor) | Expected visible plate |
| ----------------------------------- | ----------------- | --------------------------- | ---------------------- |
| `01-sweeping-venus-peak.png`        | `sweeping_venus`  | +37.5                       | Venus                  |
| `02-sweeping-earth-peak.png`        | `sweeping_earth`  | +52.5                       | Earth                  |
| `03-composite-active-peak.png`      | `composite_active`| +75.0                       | Earth (30s hold)       |
| `04-sweeping-jupiter-peak.png`      | `sweeping_jupiter`| +97.5                       | Jupiter                |
| `05-sweeping-saturn-peak.png`       | `sweeping_saturn` | +112.5                      | Saturn                 |
| `06-sweeping-uranus-peak.png`       | `sweeping_uranus` | +127.5                      | Uranus                 |
| `07-sweeping-neptune-peak.png`      | `sweeping_neptune`| +142.5                      | Neptune                |
| `08-mid-fade-venus-to-earth.png`    | (transition)      | +45.1                       | Both partially visible |

Each peak-ET screenshot's annotation calls out: (a) the active plate's
`<img data-target="<body>">` element in the DOM with `opacity === 1`;
(b) the plate's center aligned with the projected NA-camera boresight
position (Story 3.5 cone end-point) within the 2-3% viewport-width
tolerance AC7 allows.

### Hero shot — Earth alignment

The `02-sweeping-earth-peak.png` (and the equivalent
`03-composite-active-peak.png`) is the AC7-binding evidence: it shows
the Earth plate's center positionally aligned with the V1→Earth
boresight projection, against the visual reference of the historical
PIA00452 frame itself. The 2-3% viewport-width tolerance corresponds to
Story 5.2's 5° aim tolerance from the AC7 verification — at the
position the camera sits during PBD, that aim spread maps to roughly
30 px on a 1280-px-wide viewport.

The plate appears in the scene rather than as a HUD overlay because:

1. The DOM container sits in the canvas's parent — the same DOM subtree
   the canvas + HUD live in.
2. `z-index: 1` keeps it above the canvas but below any HUD chrome
   (which sits at `z-index >= 10`).
3. The plate scales to ~17.8% of viewport height — large enough to read
   the historical photograph, small enough that the simulation around
   it remains visible.

This is the cinematic compromise documented in the Dev Agent Record of
Story 5.3 — the angular truth is sub-pixel, the cinematic truth is
"show the historical frame readably at the boresight target".

## Iteration loop

When friendly-user testing or earlier feedback surfaces an alignment
concern:

1. Re-run the Story 5.3 AC9 lead-driven Chrome DevTools MCP smoke to
   capture fresh screenshots.
2. Inspect the new screenshots against this doc's expected inventory.
3. If alignment has drifted (e.g., the boresight projection math
   changes), file the discrepancy as an amendment to Story 5.3 or a
   follow-up story.
4. Update this document in place to reflect the new pixel-precise
   placement.
5. Re-commit the smoke evidence alongside the doc change.

The pixel-precise placement is NOT a Playwright pixel-diff baseline
(that's Story 5.4's owner); this doc is the auditable record of the
chosen cinematic placement + visual alignment evidence.

## References

- `_bmad-output/planning-artifacts/epics.md` § Story 5.3 (lines 2009-2051) — spec
- `web/src/chapters/pale-blue-dot/composite-layer.ts` — implementation
- `web/src/chapters/pale-blue-dot/substates.ts` — substate timing table (Story 5.3 Rule-5 amendment block)
- `web/scripts/build_pbd_plates.ts` — procurement pipeline
- `THIRD_PARTY.md` § NASA Photojournal PBD photo plates (Story 5.3) — attribution
- `MISSION_FACTS.md` § Pale Blue Dot family-portrait imaging sequence — anchor ET
- ADR-0014 (Hybrid chapter definition — PBD as dedicated module)
- ADR-0019 (zero-analytics — no fetch beacons in composite layer)
