---
title: "Product Brief Distillate: Voyager"
type: llm-distillate
source: "product-brief-Voyager.md"
created: "2026-05-16"
purpose: "Token-efficient context for downstream PRD creation and coding-agent handoff"
---

# Voyager Simulator — Detail Pack

> Companion to the 1.5-page executive brief and the ~1700-line technical research. Dense bullets, grouped by theme, each standalone. Read order: this file → product-brief-Voyager.md → research/technical-voyager-simulation-feasibility-research-2026-05-16.md (only the sections needed).

## Product Identity

- **One-line:** A browser-based, narrative-driven Voyager 1 & 2 mission replay (1977→2030) with SPICE-derived trajectories, CK-reconstructed attitude, and a single-coherent-time-axis scrubber. "A film with controls," not a sandbox.
- **Tagline candidate:** "See what Voyager saw." (Attitude/instrument boresight is the chosen differentiator and the emotional core.)
- **Visual register:** *Apollo in Real Time*'s silent, dignified, time-anchored aesthetic — applied to an unmanned mission. Not *Vox Explained* (Vox depends on narration which v1 excludes).
- **Tone:** Awe and wonder with weight. Reverent but not mournful. Closer to a long-form NYT science feature than to a children's planetarium show.

## Audience

- **Primary (design persona, not validated market segment):** Space-curious adult — watched *For All Mankind*, has *Pale Blue Dot* on a shelf, follows planetary scientists, reads long-form essays. North-star user.
- **Implied real audiences:** Apollo in Real Time readership, Planetary Society membership, r/space + r/NASA + collectSPACE communities, Three.js / FWA / Awwwards portfolio-craft community.
- **Secondary:** Science educators (middle-school through undergrad). Designed-for but not committed-to. Adoption is opportunistic.
- **Tertiary:** Museum / planetarium curators (COSI Immersive Voyager VR opened March 2026; 2027 anniversary will produce more). Designed-for through iframe-friendly chrome-less mode (architected but not heavily polished).

## Success Definition (Definition of Done)

- **Named reference projects:** [Apollo in Real Time](https://apolloinrealtime.org), NYT long-scroll science features (Snow Fall, Cassini retrospective), FWA Site of the Day winners in Three.js/WebGL category. Finished v1 = "linkable next to any of these without apology."
- **Qualitative gate:** 5–10 friendly first-time users can scrub launch→heliopause and come away with the mission's story.
- **Numerical gates:** Trajectory matches SPICE to <visualization tolerance (concrete: max position error ≤20 km, RMS ≤5 km — gated by Layer-1 Python validation harness). Attitude matches CK within encounter windows; synthesized elsewhere with UI labeling.
- **Performance gate:** 60 FPS on a mid-range laptop. 1280×720 minimum. Mobile is stretch goal, not requirement.
- **NOT engagement metrics.** Success is recognizable quality, not pageviews.

## Scope (v1 in/out/cut-order)

### In scope v1

- Voyager 1 + Voyager 2, full trajectories 1977→2030
- Six encounters: V1 Jupiter (1979), V2 Jupiter (1979), V1 Saturn (1980), V2 Saturn (1981), V2 Uranus (1986), V2 Neptune (1989)
- CK-reconstructed attitude during encounter windows (~milliradian accuracy)
- Synthesized Earth-pointing HGA cruise attitude (UI-labeled as synthesized)
- Pale Blue Dot reconstruction (1990-02-14): spacecraft physically turns; NA camera frustum sweeps Venus→Earth→Jupiter→Saturn→Uranus→Neptune; original NASA photo plates composite at corresponding instants
- Heliopause crossings (V1 2012-08-25, V2 2018-11-05): timeline cards with text, no cinematic scene (heliopause is plasma-boundary, no visual signature)
- Timeline scrubber + chapter markers + speed control 1× to 1e6× (1e6× scrubs full mission in ~50s)
- Blended view-frame camera transitions (smoothstep over ±2 days of closest approach)
- Narrow-angle camera boresight cone visualization
- HUD: simulation date, distance from Sun, current chapter title, speed multiplier
- Deep-linkable URL scheme: every chapter and every timestamp shareable with pre-rendered OG card
- **Voyager Golden Record as diegetic audio layer** (toggleable, off by default). NASA-public-domain, ~90 min source, ~30 MB compressed. Gently audible at chapter markers (launch, PBD, heliopause). Distinct from spoken narration.
- Desktop browsers (Chrome, Firefox, Safari) at 1280×720+

### Out of scope v1

- Plasma roll maneuvers and other non-imaging attitude events
- Live "where is Voyager now" telemetry (replaced by static last-known-position end-card)
- Documentary/Cinematic mode toggle
- Curated 20–40 hand-picked Voyager image plates (DEFERRED to v1.1 — high-leverage but adds curation/copy/rights work)
- Broader PDS image archive
- Engineering/science data layers (DSN contact windows, magnetometer plots)
- Spoken narration / voiceover
- Wide-angle camera boresight (NA only in v1; WA deferred to v1.1)
- VR / WebXR
- Pioneer 10, New Horizons, any other spacecraft
- Multi-language localization (architected for, not shipped)
- Dedicated classroom mode
- Mobile / tablet polish
- Pre-launch institutional outreach pass

### Pre-declared cut order if calendar slips

1. **First cut:** V2 Uranus (1986) + V2 Neptune (1989) → demote to labeled timeline cards
2. **Second cut:** V2 entirely → ship V1-only; V2 + Uranus + Neptune become v1.1 "completing the tour" timed for Sept 2027 anniversary
3. **Third cut:** Saturn encounters for both spacecraft → Jupiter is the only hero encounter
4. **Fourth cut:** Instrument boresight degrades from articulated cone to static cone

## Rejected Technical Ideas (do NOT re-propose)

- **Catmull-Rom spline interpolation** (`THREE.CatmullRomCurve3`). REJECTED because SPICE provides both position AND velocity at every sample; Catmull-Rom estimates tangents and discards the known velocities. Use **cubic Hermite** (uses both; exact at knots; same cost).
- **`logarithmicDepthBuffer: true`.** REJECTED for WebGLRenderer (use **reverse-Z** — sub-mm precision, preserves early-Z). Logarithmic depth is the fallback only when on WebGPURenderer, which doesn't yet have reverse-Z support as of Q4 2025.
- **CSPICE → WebAssembly in browser.** REJECTED. `jsSpice` is dormant; no canonical port exists; runtime savings don't exist for a fixed historical mission. Build-time precompute is the path. (Risk R9: "weeks disappear" if attempted.)
- **JSON or CSV runtime trajectory format.** REJECTED. JSON parse cost ~10–40 ms wasted; CSV worse. Use custom 40-byte VTRJ header + raw little-endian Float64Array binary, brotli-compressed. Self-describing formats (MessagePack, Protobuf, Arrow, FlatBuffers, Cap'n Proto, Zarr, Parquet) all rejected — overhead without benefit at this scale.
- **Multi-frustum / twin-scene rendering** (Scene A local + Scene B cosmos with depth-buffer clear between). REJECTED. Superseded by single-scene floating-origin + reverse-Z, which is simpler and equivalent in precision.
- **Draco mesh compression.** REJECTED for new project. Use **`EXT_meshopt_compression`** — smaller decoder, lower CPU, better streaming. Draco only for legacy assets.
- **`astroquery.jplhorizons` as the data source for trajectories.** REJECTED. Use SpiceyPy + NAIF SPK kernels instead — more accurate, provides velocities for Hermite interpolation.
- **Live JPL Horizons API calls at runtime.** REJECTED for any runtime use; Horizons is build-time only, rate-limited, not designed for interactive viz.
- **WebGPURenderer for v1.** DEFERRED. Three.js WebGPURenderer doesn't support reverse-Z as of Q4 2025. Migrate when it does (single line of code change).
- **Rust/WASM physics core.** DEFERRED. Premature; the `EphemerisService.getStateAt()` interface is the swap seam if ever needed. Sim is GPU-bound, not CPU-bound.
- **Web Workers for trajectory interpolation.** REJECTED. Sub-ms work; structured-clone cost across the boundary dominates.
- **"First of an archive" external narrative.** REJECTED by author decision. Project is positioned externally as a polished one-off about Voyager only. Architecture remains generalizable but mission-extension is explicitly not part of the product story.
- **Pre-launch institutional outreach pass** (Planetary Society, Ben Feist, NASA Voyager Project). REJECTED by author decision. Soft launch only.

## Verified Technology Stack (May 2026)

- **TypeScript 5.x strict** — runtime language. Float64 is native via JS `Number`.
- **Three.js (latest r-version, ≥r170)** — WebGL renderer with reverse-Z depth. Demo: [threejs.org/examples/webgl_reversed_depth_buffer.html](https://threejs.org/examples/webgl_reversed_depth_buffer.html).
- **Vite** — bundler. Standard 2026 default.
- **Python 3.13 + SpiceyPy 8.1.0** (released 2026-04-05) — build-time SPICE extraction. [SpiceyPy on GitHub](https://github.com/AndrewAnnex/SpiceyPy).
- **uv** — Python dep manager. **Ruff** — Python lint/format.
- **gltf-transform** (Don McCurdy) — Swiss-army GLB optimization CLI.
- **KTX-Software** (`toktx`) — KTX2/Basis Universal texture encoding.
- **Blender headless** — for OBJ → clean GLB conversion when needed.
- **Vitest** — TS unit tests.
- **Playwright** — E2E + visual regression.
- **Cloudflare Pages or Vercel** — static CDN hosting, free tier.
- **GitHub Actions** — CI.

### Alternative considered, not chosen for v1

- **ANISE / anise-rs** (NASA-collaborated SPICE replacement in Rust, TRL 9, flew on Firefly Blue Ghost 2025) — viable alternative to SpiceyPy for the bake step. Cleaner license (MPL-2.0), no CSPICE dep, hifitime integer time. SpiceyPy chosen for larger community/example code base. ANISE noted as fallback.
- **CesiumJS 1.141** — has native astronomical-scale precision + time-dynamic ephemeris (the only engine that does), but no WebGPU yet and heavier than needed for a single-mission focused product. Three.js + manual floating-origin chosen for lighter weight.
- **Babylon.js 9.0** (released 2026-03-26) — full native WGSL, ~2× smaller bundle than 7.x WebGPU. Viable alternative if WebGPU becomes mandatory. Three.js chosen for larger community + reverse-Z support today.

## SPICE / NAIF Kernel Data

### Trajectory (SPK) kernels — bake-time input

- Available at `https://naif.jpl.nasa.gov/pub/naif/VOYAGER/`
- Both Voyager 1 and Voyager 2 SPK files; planetary ephemerides (DE440); leap-seconds (`naif0012.tls`); planetary constants (PCK)
- Hash-pin every kernel in `kernels/kernels-manifest.json` (SHA-256); CI verifies hashes; drift report on update (accept if `max_drift_km ≤ 5`)

### Attitude (CK) kernels — bake-time input (encounter windows only)

Verified live on NAIF FTP 2026-05-16:

| File | Spacecraft | Coverage | Size | Date |
|---|---|---|---|---|
| `vg1_jup_qmw_na.bc` | V1 | Jupiter NA camera | 547 KB | 2012-02-14 |
| `vg1_jup_qmw_wa.bc` | V1 | Jupiter WA camera | 160 KB | 2012-02-14 |
| `vg1_sat_qmw_na.bc` | V1 | Saturn NA camera | 452 KB | 2012-02-14 |
| `vg1_sat_qmw_wa.bc` | V1 | Saturn WA camera | 227 KB | 2012-02-14 |
| **`vgr1_super_v2.bc`** | **V1** | **Consolidated, all encounters + some** | **17 MB** | **2015-11-17** |
| `vg2_jup_qmw_na.bc` | V2 | Jupiter NA | 460 KB | 2012-02-14 |
| `vg2_jup_qmw_wa.bc` | V2 | Jupiter WA | 127 KB | 2012-02-14 |
| `vg2_sat_qmw_na.bc` | V2 | Saturn NA | 390 KB | 2012-02-14 |
| `vg2_sat_qmw_wa.bc` | V2 | Saturn WA | 130 KB | 2012-02-14 |
| **`vgr2_super_v2.bc`** | **V2** | **Consolidated, likely all 4 encounters** | **31 MB** | **2015-11-17** |

- **Pointing accuracy:** ~0.05° (1 milliradian, ~100 NA pixels) — produced by Mitch Gordan (QMW) from SEDR files
- **NAIF stopped maintaining Voyager CKs**; **PDS Rings Node at SETI** ([pds-rings.seti.org/voyager/spice/ck.html](https://pds-rings.seti.org/voyager/spice/ck.html)) hosts additional/newer products. **Phase 0 action:** inventory both sources via `ckbrief` to compare coverage.
- **Coverage gaps:** no continuous CK across the 47-year mission. Encounter windows only. Cruise attitude must be synthesized from SPK + known HGA boresight direction (defined in FK kernel).
- **Pale Blue Dot CK coverage (1990-02-14):** uncertain — check `vgr1_super_v2.bc` first via `ckbrief`; synthesize if not covered.

### Frame topology

Two articulated frames per spacecraft:

```
J2000 (inertial)
  └─ q_bus (CK)       → SC_BUS
       └─ q_platform  → SCAN_PLATFORM
            └─ q_inst (FK fixed) → NA_CAMERA / WA_CAMERA / IRIS / UVS / ...
```

Frame IDs from `vg1_v02.tf` / `vg2_v02.tf` on NAIF; document in `kernels/frame-ids.md` during Phase 0.

## Mission Timeline (UT-precise pinned events)

### Voyager 1

- 1977-09-05 — Launch (Cape Canaveral LC-41, Titan IIIE-Centaur)
- 1977-09-06 — First Earth-Moon portrait
- 1977-12-15 — Overtakes Voyager 2
- 1979-03-05 12:05 UT — Jupiter closest approach, 348,890 km. Io volcanoes discovery, ring discovery, 48-hour moon flyby window (Amalthea, Europa, Ganymede, Callisto)
- 1980-11-12 23:46 UT — Saturn closest approach, 184,300 km
- 1980-11-12 — Titan close flyby, 6,490 km. Slingshots V1 up and out of ecliptic plane.
- 1990-02-14 — **Pale Blue Dot / Family Portrait**, 40 AU. ISS permanently powered down after.
- 1998-02-17 — Overtakes Pioneer 10 to become most distant human-made object.
- 2012-08-25 — Heliopause crossing, ~121 AU.

### Voyager 2

- 1977-08-20 — Launch (LC-41, Titan IIIE-Centaur). Launched FIRST, slower trajectory.
- 1977-12-10 — Enters Asteroid Belt
- 1977-12-19 — Overtaken by V1
- 1978-06 — Primary radio receiver fails (switch to backup for rest of mission)
- 1978-10-21 — Exits Asteroid Belt
- 1979-07-08 — Callisto flyby, 214,930 km
- 1979-07-09 — Core Jovian flybys: 07:14 Ganymede 62,130 km; 17:53 Europa 205,720 km; 20:01 Amalthea 558,370 km
- 1979-07-09 22:29 UT — Jupiter closest approach, 721,670 km
- 1981-08-22 — Iapetus flyby, 908,680 km
- 1981-08-25 01:25 — Hyperion flyby 431,370 km; 09:37 — Titan flyby 666,190 km
- 1981-08-26 — Saturn closest approach, 101,000 km
- 1986-01-24 — Uranus closest approach, 107,000 km. Miranda flyby 29,000 km + Ariel/Umbriel/Titania/Oberon all within hours. 11 new moons discovered.
- 1989-08-25 — Neptune closest approach, 4,950 km over north pole. Great Dark Spot discovered.
- 1989-08-25 09:23 UT — Triton flyby, 39,800 km. Bends trajectory sharply south of ecliptic.
- 2018-11-05 — Heliopause crossing, ~119 AU.

### Instrument shutoff schedule (HUD overlay)

| Instrument | V1 shutoff | V2 shutoff |
|---|---|---|
| ISS (Imaging) | 1990-02-14 | 1989-10-10 |
| UVS (Ultraviolet Spectrometer) | 2016-04-19 | 1998-11-12 |
| PLS (Plasma Science) | 2007-02-01 | 2024-09-26 |
| LECP (Low Energy Particle) | 2026-04-17 | 2025-03-24 |

## Imaging Camera Specs (for boresight cone + camera POV mode)

- **Narrow-Angle (NA):** 1500 mm focal length, FOV **0.42° × 0.42°**, half-angle 0.21°, 800×800 vidicon
- **Wide-Angle (WA):** 200 mm focal length, FOV **3.17° × 3.17°**, half-angle 1.59°, 800×800 vidicon
- Original images transmitted as 8-bit data over Deep Space Network. Optional shader effects: 800×800 downsample, scanlines, slight monochrome filter for "1979 JPL control room" aesthetic.

## Runtime Binary Format (VTRJ)

```text
Header (40 bytes, little-endian):
  0   4  char[4]   magic = "VTRJ"
  4   2  uint16    version = 1
  6   2  uint16    reserved
  8   8  float64   t0_et (seconds since J2000 TDB)
  16  8  float64   dt_sec
  24  4  uint32    numSamples
  28  4  uint32    componentsPerSample (6 = pos+vel, 4 = quaternion, 3 = pos only)
  32  4  uint32    bodyId (NAIF ID; e.g., -31 V1, -32 V2)
  36  4  uint32    reserved

Data: numSamples × componentsPerSample × 8 bytes (Float64)
```

- Time is implicit (`t = t0 + dt * i`) — saves 50% bytes vs storing per-sample timestamps
- Use `new Float64Array(buffer, HEADER_SIZE, length)` for zero-copy view in JS
- Parse cost ~1–2 ms for 500k samples
- Brotli-compressed for transport (~3–5 bytes/scalar on wire)

### Chunking

- Per-decade trajectory files: `v1_1977-1987.bin.br`, etc.
- Encounter overlays at higher cadence: `v1_jupiter_1979_1min.bin.br` (1-min cadence for flyby ±2 days), `v1_jupiter_1979_10sec.bin.br` (10-sec at closest approach ±1 hr)
- Attitude binaries parallel structure: `v1_bus_jupiter.bin`, `v1_platform_jupiter.bin` with `componentsPerSample = 4`
- `manifest.json` maps time ranges to URLs; client pre-fetches neighbor chunk in last 10% of current

### Sampling cadence by phase (preliminary; tune via Layer-1 validation)

| Phase | Cadence | Rationale |
|---|---|---|
| Cruise / interstellar | 1 day | Hermite ≤ m-level error vs SPICE; visually invisible |
| Approach / departure (±30 days from CA) | 1 hour | Curvature ramp-up |
| Flyby (±2 days from CA) | 1 minute | Gravity-assist bend |
| Closest approach (±1 hour) | 10 seconds | Dramatic frames if user zooms in |

## Architecture Patterns (decided)

1. **Floating-origin / camera-relative.** Single `WorldGroup` whose position = `-cameraWorldPos / SCALE` per frame; sweeps all children into camera-relative space in one matrix update.
2. **Reverse-Z depth buffer** on Three.js WebGLRenderer (float depth, flipped compare). Sub-mm precision at 10 m with far plane at 165 AU. **Use WebGLRenderer not WebGPURenderer** until WebGPU has reverse-Z.
3. **Single canonical frame (heliocentric J2000 Float64) + view-frame abstraction.** `ViewFrame.getTransform(et)` is the per-frame transform from J2000 to render space.
4. **Smooth blended encounter view frame:** smoothstep over ±2 days slides view origin from heliocentric to body-centered and back. Translation only; no rotation blending (translation-only is simpler and visually sufficient — revisit if Jupiter's tilt feels off).
5. **Cubic Hermite trajectory interpolation** using position+velocity at each sample (~20 LOC).
6. **SLERP for quaternion (attitude) interpolation.** Use `THREE.Quaternion.slerp`.
7. **Decoupled simulation clock.** `ClockManager.tick() → simTimeEt`, `setRate(x)`, `scrub(et)`. All downstream services read from one ET per frame.
8. **Type-distinguish `WorldVec3` (Float64) from `RenderVec3` (Float32)** so the cast is explicit (mitigates R5).
9. **LOD strategy:** 4 spacecraft LODs (full ~99k → ~30k → ~5k → billboard); planet textures 4k default → 8k lazy-upgrade on SOI entry.
10. **Mission-phase FSM.** Time-driven: PRE_LAUNCH → CRUISE → JUPITER_ENCOUNTER → … → INTERSTELLAR. Governs ViewFrame, active instruments, default camera anchor.

## Asset Pipeline

- **Source:** NASA 3D Resources OBJ/3DS (Voyager); USGS Astrogeology + Björn Jónsson maps (planet textures, audit attribution).
- **Pipeline:** Blender (OBJ → clean GLB) → gltf-transform (metalrough conversion + EXT_meshopt_compression at high level) → toktx (KTX2 UASTC for hero textures, ETC1S for planets/skybox) → gltf-transform (rewire texture slots) → deploy to CDN as immutable assets.
- **Three.js loader config:** `GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder)`.
- **Cache-Control:** `public, max-age=31536000, immutable`; content-hashed filenames.

## Asset / Payload Budget

| Asset | Compressed |
|---|---|
| Voyager LOD0 GLB (meshopt + KTX2 UASTC) | 3–5 MB |
| Voyager LOD1 + impostor | 1–2 MB |
| Sun + 8 planets @ 4k ETC1S | 16–24 MB |
| Earth/Jupiter/Saturn @ 8k upgrade (lazy) | +9–18 MB |
| Selected moons @ 2k | 4–8 MB |
| Skybox (Milky Way) 2k ETC1S | 1–2 MB |
| Trajectory binaries (both probes + bodies, daily, brotli) | <10 MB |
| Attitude binaries (encounter windows, both probes) | 15–25 MB |
| Golden Record audio (compressed) | ~30 MB |
| App JS bundle | 200–400 KB |
| **First-paint total** | **~25–35 MB** |
| **Full assets total (with Golden Record)** | **~110–150 MB** |

## Performance Budget (60 FPS = 16.7 ms / frame)

- Trajectory interpolation (12 bodies × Hermite): **<1 ms**
- Floating-origin recenter + frame transforms: **<1 ms**
- Scene graph update: **<2 ms**
- Three.js draw call submission: **1–3 ms**
- GPU rasterize/shade: **4–10 ms**
- Headroom (frame spikes): **1–3 ms**

Sim is **GPU-bound, not CPU-bound**. Web Workers not worth structured-clone cost.

## Testing Strategy (6 layers)

| Layer | What | Tooling | MVP? |
|---|---|---|---|
| 1 | Python interpolation validation vs dense SPICE reference | SpiceyPy + scipy.CubicHermiteSpline + numpy | ✅ MVP |
| 2 | JS-vs-SPICE consistency (fixed-seed random samples, artifact handoff between Python and Node CI jobs) | SpiceyPy bake → Vitest | ✅ MVP |
| 3 | TS numerical unit tests (Hermite math, time conversions, blend weights, manifest parsing) | Vitest | ✅ MVP |
| 4 | Visual regression at 6 pinned moments | Playwright screenshot diff | ✅ MVP (limit to 2–3 scenes) |
| 5 | E2E mission timeline (fast-forward 1977→2030 asserting event sequence) | Playwright | ✅ MVP (one test) |
| 6 | Performance regression harness (P95 metrics on `/perf` route) | Custom Performance API | ⚠️ v1.1 |

**Validation tolerances:** `max_error_km ≤ 20`, `rms_error_km ≤ 5` for visualization-grade. SPICE Voyager ephemerides are only known to ~1–10 km anyway; <1 m is overkill.

## Risk Register (10 + 4 from CK addendum)

| # | Risk | Mitigation |
|---|---|---|
| R1 | NASA kernel updates silently shift positions | SHA-256 hash-pin kernels; explicit upgrade flow with drift report |
| R2 | CesiumJS WebGPU lag (irrelevant; we use Three.js) | n/a |
| R3 | 3D asset licensing (NASA public domain but Björn Jónsson attribution) | `THIRD_PARTY.md` |
| R4 | Catmull-Rom-in-initial-research is wrong | Use Hermite (Pattern 4) |
| R5 | **Float32 jitter from a subtle bug in floating-origin math** | Branded types `WorldVec3` (F64) vs `RenderVec3` (F32) |
| R6 | GLB asset bloat — first paint >50 MB on mobile | Per Step 3 pipeline; KTX2 + LOD; CI check on asset sizes |
| R7 | Time-warp at 1e9× starves main thread waiting for chunk loads | Pre-fetch neighbor chunk in last 10% of current; cap rate while loading |
| R8 | **Solo-dev scope creep ("let me add Pioneer 10 too") — #1 most-likely project killer** | Stick to phase plan; defer is the default; pre-declared cut order |
| R9 | CSPICE-in-WASM rabbit hole (weeks disappear) | Reject path unless arbitrary ephemeris queries become real product need |
| R10 | Mobile WebGL2 device variability (older Android can't handle 8k textures) | 4k default + capability detection |
| R11 | CK coverage gap surprises (V2 Uranus/Neptune segments) | `ckbrief` inventory in Phase 0; PDS Rings Node alternative; fall back to synthesis |
| R12 | NASA Voyager 3D model may be monolithic (no articulated scan platform) | Inspect in Blender Phase 0; if monolithic, half-day Blender split |
| R13 | FK kernel frame-ID parsing complexity (15+ instruments) | Hardcode 2–3 relevant frames; defer rest |
| R14 | Quaternion sign-flip artifacts at CK knots | Pre-bake walk that flips when `dot(q_prev, q_curr) < 0` |

## Open Questions for Build-Time Validation

- **Exact sampling cadence per mission phase** — Layer-1 Python validation will report the true minimum that meets the 20 km tolerance. Starting points: 1d cruise, 1h approach, 1min flyby, 10s closest approach.
- **Smooth-blended view frame: rotate axes or only translate?** Start translate-only; revisit if Jupiter's tilt feels off (~1 hour to add quaternion slerp).
- **8k texture memory budget on Pixel 8 / iPhone 14** — empirical test in Phase 2 with phone in hand + Chrome remote devtools.
- **`vgr1_super_v2.bc` coverage of Pale Blue Dot (1990-02-14)?** — `ckbrief` inventory in Phase 0; if not covered, synthesize "point camera at Earth + each target body" from SPK.
- **PDS Rings Node CKs vs NAIF CKs — coverage comparison** — Phase 0 inventory.
- **Voyager 3D model articulation** — does NASA OBJ include scan platform as a separate node or is the model monolithic? Inspect in Blender Phase 0.
- **DSN-live "current Voyager position" API stability** — NASA Eyes-on internal endpoints undocumented; treat any integration as best-effort and explicitly out of v1.
- **Golden Record source quality** — NASA archive has digitized audio; need to audit licensing notes and pick representative tracks for chapter markers (launch, PBD, heliopause).

## Phased Implementation Roadmap

| Phase | Duration | Deliverable |
|---|---|---|
| Phase 0 — Spike | 1–2 days | SpiceyPy + Three.js precision sanity check; cube at 10 m / far=165 AU renders cleanly with reverse-Z |
| Phase 1 — MVP cruise viewer | 1–2 weeks | V1 + planets, daily cadence, no encounters, deployable |
| Phase 2 — Encounters | 2.5–3.5 weeks | V2 added, blended view frames, real textures, CK boresights, all 6 encounters |
| Phase 3 — Polish + interstellar + PBD | 2 weeks | Heliopause crossings, HUD complete, Pale Blue Dot, Golden Record audio, accessibility |
| **Engineering substrate total** | **~6–9 weeks** | |
| **+ Portfolio polish (the hard 20%)** | **+6–12 weeks** | Per reviewer's honest estimate |
| **= Realistic total to "linkable next to AiRT"** | **~3–5 months** | |
| Phase 4 (deferred / v1.1+) | — | Image plates (curated reel), wide-angle boresight, mobile polish, V2 cruise behaviors, narration, Documentary/Cinematic toggle, classroom mode, Pioneer 10 / other missions |

## Distribution Plan (soft launch — confirmed)

- **Public launch:** Hacker News + r/space + r/NASA + collectSPACE + Twitter/X
- **Deep-linked screenshots** for sharing: Pale Blue Dot moment, Titan slingshot, Triton arc (V2 bending south of ecliptic), Jupiter Io-volcano boresight, the launch
- **No pre-launch institutional outreach pass** — author decision. Artifact speaks for itself.
- **Anniversary timing:** opportunity not deadline. Aim for Q1–Q2 2027 if craft allows; Definition of Done is the gate.

## Source Bibliography (verified live, May 2026)

### SPICE / ephemeris

- [SpiceyPy on GitHub](https://github.com/AndrewAnnex/SpiceyPy) — v8.1.0 (2026-04-05)
- [ANISE on Nyx Space](https://nyxspace.com/anise/) — TRL 9
- [NAIF Voyager kernel repo](https://naif.jpl.nasa.gov/pub/naif/VOYAGER/)
- [PDS Rings Node Voyager CK](https://pds-rings.seti.org/voyager/spice/ck.html) — alternative source for additional CK products

### Astrodynamics libraries (considered, not chosen)

- [Orekit 13.1.5](https://www.orekit.org/news/2026/05/02/orekit-13.1.5-released.html) (2026-05-02)
- [REBOUND](https://github.com/hannorein/rebound) + [ASSIST](https://pypi.org/project/assist/)
- [heyoka.py 7.x](https://bluescarni.github.io/heyoka.py/)

### Web 3D engines

- [Three.js releases](https://github.com/mrdoob/three.js/releases) — r170+
- [Three.js reverse-Z demo](https://threejs.org/examples/webgl_reversed_depth_buffer.html)
- [Three.js forum: WebGPU reverse-Z status](https://discourse.threejs.org/t/does-three-js-webgpu-support-reverse-z-buffer/87687)
- [Babylon.js 9.0 announcement (2026-03-26)](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/)
- [CesiumJS releases](https://github.com/CesiumGS/cesium/releases) — 1.141 (2026-05-01)

### Reference UX

- [Apollo in Real Time](https://apolloinrealtime.org) — gold-standard "mission as scrubbable timeline"
- [Solar System 3D](https://solarsystem3d.space) — classroom-positioned with V1 model
- [I, Voyager](https://www.ivoyager.dev) — Godot-based open-source, web export
- [NASA Eyes on the Solar System](https://eyes.nasa.gov) — direct competitor; V1 & V2 supported, time-scrub 1949→2049

### Cultural context (2026)

- [NASA: Shuts Off Instrument on Voyager 1, April 2026](https://science.nasa.gov/blogs/voyager/2026/04/17/nasa-shuts-off-instrument-on-voyager-1-to-keep-spacecraft-operating/)
- [CNN: Voyager 1 'Big Bang' fix to extend mission](https://www.cnn.com/2026/04/27/science/voyager-1-big-bang)
- [Nautilus: (Almost) A Eulogy for Voyager](https://nautil.us/almost-a-eulogy-for-voyager-1280164)
- [COSI Immersive Voyager VR (opened March 16 2026)](https://cosi.org/vr-simulator/)

### Foundation documents in this repo

- [initial-research.md](research/initial-research.md) — foundation (4 corrections marked superseded)
- [technical-voyager-simulation-feasibility-research-2026-05-16.md](research/technical-voyager-simulation-feasibility-research-2026-05-16.md) — full technical research

## Confidence Flags

| Item | Confidence | Notes |
|---|---|---|
| Architecture choices (floating-origin, reverse-Z, Hermite, SLERP) | High | Validated against live sources |
| Library version data | High | Live web search 2026-05-16 |
| Encounter CK availability for Jupiter / Saturn | High | NAIF directory confirmed live |
| Pale Blue Dot CK coverage in `vgr1_super_v2.bc` | Medium | Phase 0 `ckbrief` inventory required |
| 6–9 week engineering substrate estimate | Medium | Depends on Three.js familiarity |
| 3–5 month total elapsed time at portfolio polish | Medium | Reviewer's honest estimate; reality may be longer if scope creep wins |
| Mobile WebGL viability on Pixel 8 / iPhone | Medium | Empirical test required |
| Three.js WebGPURenderer reverse-Z timeline | Low | Track upstream issue; not blocking |
| NASA Voyager 3D model articulation (scan platform separable) | Low | Phase 0 inspection required (R12) |
| Solo-dev scope discipline holding through full v1 | Low | R8 is the #1 most-likely project killer; cut order pre-declared |

## What the Author Has Decided (authoritative)

- **Audience:** Generalist — both adult enthusiasts and classroom educators equally; designed-with classroom gates but not committed-to.
- **Success:** Portfolio piece; recognizable quality > engagement metrics.
- **Scope:** Full v1 per technical plan (both Voyagers, all four gas-giant encounters, attitude, Pale Blue Dot).
- **Anniversary timing:** Aim for Sept 2027 50th as opportunity tailwind; success ≠ the date.
- **Tone:** Awe + wonder with weight; visual register of *Apollo in Real Time*.
- **Classroom gates:** Soft / nice-to-have, not committed.
- **Image plates:** Deferred to v1.1.
- **Pre-launch outreach:** No — soft launch only.
- **External narrative:** Polished one-off about Voyager (not "first of an archive").

## What the Author Has NOT Decided (open)

- Final visual design language (typography, color, motion vocabulary) — TBD at prototype stage
- Whether to use React or vanilla TS for the HUD/UI overlay — equally valid, defer
- Specific Voyager glTF source variant from NASA 3D Resources (multiple available with different polycounts)
- Exact Pale Blue Dot reconstruction approach (camera frustum + composited NASA photo plates is the planned shape; details TBD)
- Whether to use Cloudflare Pages or Vercel for hosting — both work
