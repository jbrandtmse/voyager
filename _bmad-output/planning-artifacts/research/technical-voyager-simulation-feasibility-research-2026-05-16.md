---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - initial-research.md
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Voyager browser-based simulation feasibility — SPICE kernel integration, variable-dt physics engines, rendering approaches, language/runtime tradeoffs'
research_goals: 'Validate or refine the browser-based stack proposed in initial-research.md; evaluate alternative simulation engines (variable-dt physics libraries); compare rendering/visualization approaches (Three.js, Babylon.js, CesiumJS, WebGPU, native); evaluate language/runtime tradeoffs (TypeScript vs Rust/WASM vs Python vs native engines); determine concrete feasibility of SPICE kernel integration in target stack'
user_name: 'Developer'
date: '2026-05-16'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-05-16
**Author:** Developer
**Research Type:** technical
**Input Document:** initial-research.md

---

## Research Overview

This report assesses the technical feasibility of building a browser-based Voyager 1 & 2 mission simulator with full-fidelity SPICE ephemeris support, smooth time-lapse replay of the entire 1977→2030 mission, and pixel-accurate rendering across astronomical scales. It builds on [initial-research.md](initial-research.md), validates the proposed browser-first stack against current (May 2026) library and engine availability, surfaces and corrects several non-obvious technical choices (most importantly: **cubic Hermite interpolation, not Catmull-Rom**; **reverse-Z depth, not logarithmic depth, when available**; **`EXT_meshopt_compression`, not Draco**), and produces a phased roadmap a solo developer can execute in 5–8 weeks for $0/year of recurring cost.

The verdict: **the architecture proposed in initial-research.md is sound**. A precompute-trajectory-to-static-binary pipeline (SpiceyPy → little-endian Float64 with brotli) feeding a Three.js renderer with floating-origin and reverse-Z hits every requirement without server infrastructure, exotic toolchains, or WASM physics cores. ANISE (the Rust-rewrite of SPICE) is a viable alternative for the build step with cleaner licensing. WebGPU has reached mainstream in 2026 but Three.js's WebGPURenderer still lacks reverse-Z support — start on WebGLRenderer and migrate later. See the **Research Synthesis** section at the bottom for the consolidated executive summary, decision matrix, and handoff package for a coding agent.

---

<!-- Content will be appended sequentially through research workflow steps -->

## Technical Research Scope Confirmation

**Research Topic:** Voyager browser-based simulation feasibility — SPICE kernel integration, variable-dt physics engines, rendering approaches, language/runtime tradeoffs

**Research Goals:**

- Validate or refine the browser-based stack proposed in [initial-research.md](initial-research.md)
- Evaluate alternative simulation engines and variable-dt physics libraries
- Compare rendering/visualization approaches (Three.js, Babylon.js, CesiumJS, WebGPU, native engines)
- Evaluate language/runtime tradeoffs (TypeScript-only vs TS + Rust/WASM physics core vs Python desktop vs native engines)
- Determine concrete feasibility of SPICE kernel integration in the target stack

**Technical Research Scope:**

- Architecture Analysis — floating-origin patterns, twin-scene rendering, kernel-loading topology, client/server compute split
- Implementation Approaches — SPICE binding strategies, integrator selection (RK4 / RK45 / symplectic / Encke)
- Technology Stack — Three.js / Babylon.js / CesiumJS / Filament / Unity / Godot / Unreal, plus astrodynamics libs (Orekit, Tudat, REBOUND, Poliastro)
- Integration Patterns — kernel preprocessing pipelines, runtime data formats, streaming vs full-load
- Performance Considerations — Float64 vs Float32 precision, logarithmic depth buffer, LOD, time-lapse stress paths, WASM crossing cost

**Research Methodology:**

- Primary-source verification via Perplexity (NAIF docs, library repos, official benchmarks)
- Multi-source validation for contentious or fast-moving claims
- Confidence levels flagged where evidence is thin
- Output: single research report with concrete recommendations + tradeoff tables suitable for handing to a coding agent

**Scope Confirmed:** 2026-05-16

---

## Technology Stack Analysis

> **Methodology note.** Version numbers and release dates below were verified via live web search against project release pages, GitHub, PyPI, and crates.io on 2026-05-16. Architectural commentary and pattern recommendations draw on a mix of live results, the Perplexity reasoning model's training-data knowledge (which produced expert-grade analysis but with non-relevant citations — I treat that content as expert opinion subject to spot-checks), and the foundation laid in [initial-research.md](initial-research.md). Where evidence is thin, I flag confidence as **Low**.

### Programming Languages

The Voyager-sim problem touches four reasonable language candidates. JavaScript `Number` is IEEE-754 float64, so the often-cited "you need C++ for double precision" objection is wrong — the precision bottleneck is at the GPU (Float32) and is solved by the floating-origin pattern, not by language choice.

| Language | Float64 native | Astrodynamics ecosystem | Browser deploy | Concurrency | Solo-dev ergonomics |
|----------|----------------|--------------------------|-----------------|--------------|---------------------|
| **TypeScript / JS** | ✅ all Numbers are doubles | Sparse (satellite.js, astro libs are minimal) | ✅ native | Web Workers, SharedArrayBuffer | High |
| **Rust** | ✅ | Growing fast (nyx, anise, hifitime) | ✅ via wasm32 | Threads, rayon | Medium (steeper learning) |
| **Python** | ✅ | Best in class (SpiceyPy, Skyfield, Poliastro/hapsira, heyoka.py, Tudat) | ⚠️ via Pyodide; heavy | GIL still real in CPython 3.13; free-threaded 3.13+ helps | High |
| **C++** | ✅ | Best for raw performance (heyoka, Tudat, REBOUND, GMAT) | ⚠️ via Emscripten | Threads | Low for solo dev |
| **C# (Unity)** | ✅ (with `double` types) | Sparse; Unity Burst supports `double` in Jobs | ⚠️ Unity WebGL build | Job system | Medium |

- _Popular for orbital mechanics today:_ Python (Skyfield, Poliastro/hapsira, SpiceyPy) is the de facto research lingua franca. C++ dominates flight-dynamics production (GMAT, heyoka, Tudat).
- _Emerging:_ **Rust** through the Nyx Space ecosystem — `nyx-space`, `anise`, `hifitime` — has reached real flight heritage (ANISE was used on Firefly Blue Ghost, NASA TRL 9 in 2025). [ANISE on Nyx Space](https://nyxspace.com/anise/), [anise on crates.io](https://crates.io/crates/anise)
- _Performance:_ For a few dozen bodies queried at most a few hundred times per second (which is what this sim needs), all five languages are vastly faster than required. Performance is **not** the discriminator; ecosystem and deployment are.

### Web 3D Rendering Frameworks (Browser Target)

| Engine | Latest Release | WebGPU | Log Depth | Camera-relative / Float64 helpers | Astro/space adoption |
|--------|----------------|--------|-----------|------------------------------------|----------------------|
| **Three.js** | r171+ (WebGPU production-ready) | ✅ Production (default with WebGL2 fallback as of 2026) | ✅ `logarithmicDepthBuffer: true` | Manual; community patterns | Hobby & edu solar-system viz |
| **Babylon.js** | 9.0 (2026-03-26) | ✅ Native WGSL, no shader conversion layer; ~2× smaller bundle than 7.x WebGPU | ✅ `scene.useLogarithmicDepth = true` | Manual; documented patterns | Some education/research demos |
| **CesiumJS** | 1.141 (2026-05-01) | ❌ WebGL2 only as of May 2026; WebGPU under research | ✅ built-in + depth partitioning + multi-frusta | ✅ **First-class:** double `Cartesian3`, hi/lo split, `JulianDate`, `SampledPositionProperty`, time-varying entities | NASA Eyes-on, satellite tracking, aerospace SSA |
| **react-three-fiber** | Latest tracks Three.js | Inherits from Three.js | Inherits | Inherits | Some space demos |

**Sources:** [Three.js r170 release](https://github.com/mrdoob/three.js/releases/tag/r170), [WebGPU baseline 2026](https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default), [Babylon.js 9.0 announcement](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/), [CesiumJS releases](https://github.com/CesiumGS/cesium/releases), [Cesium WebGPU community thread](https://community.cesium.com/t/is-there-a-plan-to-support-webgpu/23381)

**Key takeaway:** CesiumJS is the only one of the three with **astronomical-scale precision and time-dynamic ephemeris baked in**. The others require you to implement floating-origin and double-precision time integration yourself (a known and not-too-hard pattern, but still meaningful effort). _Confidence: High._

### Astrodynamics & Physics Libraries

| Library | Language | License | Latest (verified 2026-05) | Integrators | n-body | SPICE / ephemeris | Notes |
|---------|----------|---------|---------------------------|-------------|--------|--------------------|-------|
| **Orekit** | Java | Apache 2.0 | 13.1.5 (2026-05-02) | DP54/DP853 (Dormand-Prince), Adams, GraggBulirschStoer, fixed-step | ✅ point-mass + perturbations | Native SPICE-style ephemerides; supports DE/INPOP | Mature; used by ESA, CNES, ArianeGroup |
| **Tudat / TudatPy** | C++ / Python | LGPL-3.0 | actively maintained (TU Delft) | RK4/45/78/87, ABM, BulirschStoer | ✅ | ✅ Spice via SpiceInterface | Academic backbone at TU Delft |
| **GMAT** | C++ (scripted) | NASA OSA 1.3 | actively released | RK4/56/89, PrinceDormand | ✅ | ✅ SPICE | NASA's flagship mission-design tool |
| **REBOUND** | C / Python | GPL-3.0 | actively maintained, releases Feb 2026 | IAS15 (adaptive 15th-order), WHFast (symplectic), MERCURIUS (hybrid), JANUS (bit-reversible) | ✅ best-in-class | Indirect via **ASSIST** extension (DE441) | Gold standard for long-term n-body |
| **ASSIST** | C / Python | GPL-3.0 | active (Rein et al.) | Inherits IAS15 from REBOUND | Inherits | ✅ DE441 + 16 massive asteroids | Designed for ephemeris-quality test-particle integration |
| **Skyfield** | Python | MIT | active | (Not an integrator — uses precomputed ephemerides) | Limited | ✅ JPL ephemerides, can read SPK | Best for "where is X at time T" queries |
| **Poliastro / hapsira** | Python | MIT | hapsira is the maintained fork | RK45, DOPRI8 via `scipy` | Limited two-body + patched conics | ✅ via astropy/jplephem | Hapsira continues after Poliastro archived |
| **heyoka / heyoka.py** | C++ / Python | MPL-2.0 | 7.11.0 (active, bluescarni) | **Taylor method** with JIT via LLVM — exceptional for long-term stability | ✅ | Via external loaders | Machine-precision over **tens of billions** of timesteps; ideal for multi-decade replay |
| **nyx-space** | Rust | AGPL-3.0 (commercial license available) | active (Nyx Space) | RK methods, DP, symplectic | ✅ | ✅ via ANISE | Production flight dynamics in Rust |
| **ANISE / anise-rs** | Rust (+ Python via PyO3) | MPL-2.0 | active, **TRL 9** (Firefly Blue Ghost, 2025) | n/a (ephemeris toolkit) | n/a | ✅ SPICE BSP, validated to machine precision; uses `hifitime` integer time | ~125k queries/s; Rust+WASM friendly |
| **satellite.js** | JS | MIT | active | SGP4/SDP4 only | ❌ | ❌ TLE only | Wrong tool — for Earth-orbit propagation |
| **calceph** | C (with Python/Java bindings) | CeCILL-B | active (IMCCE/CNES) | n/a (ephemeris reader) | n/a | ✅ INPOP, DE-series, SPK | Friendlier license than CSPICE |

**Sources:** [Orekit 13.1.5 release](https://www.orekit.org/news/2026/05/02/orekit-13.1.5-released.html), [ANISE on Nyx Space](https://nyxspace.com/anise/), [heyoka docs 7.11.0](https://bluescarni.github.io/heyoka.py/), [REBOUND on GitHub](https://github.com/hannorein/rebound), [ASSIST on PyPI](https://pypi.org/project/assist/)

**For a Voyager-mission replay specifically:**

- **Best fit for precomputed-trajectory pipeline (browser sim):** SpiceyPy or ANISE-python build-time → JSON/binary export. _Confidence: High._
- **Best fit for live n-body resimulation:** REBOUND + ASSIST (uses DE441) — but the Voyager probes' actual trajectories include thousands of trajectory-correction maneuvers (TCMs) and non-gravitational forces (RTG thermal recoil, attitude jet leaks) that no live n-body sim can reproduce without explicit injection. The SPICE-reconstructed trajectory **is** the answer; resimulating from launch state would diverge by thousands of km per year. _Confidence: High._
- **Best fit for high-fidelity "what-if" gravity-assist experimentation:** heyoka.py — Taylor integrators preserve machine precision over the 50-year mission duration. _Confidence: Medium-High._

### SPICE & Ephemeris Bindings

| Approach | Effort (solo dev) | Maturity | Verdict for Voyager sim |
|----------|-------------------|----------|--------------------------|
| **SpiceyPy → precompute → static binary/JSON** (build-time) | Low (hours-to-days) | 8.1.0 released 2026-04-05 — very mature, widely used | **✅ Recommended primary path** |
| **ANISE → precompute** (build-time, Rust or Python) | Low; cleaner API than CSPICE | TRL 9, production-validated in 2025 | ✅ Recommended alternative; better license, simpler kernel handling |
| **CSPICE → WebAssembly (Emscripten)** in browser | High (1–2 weeks of build + FS wiring) | No actively-maintained off-the-shelf port; `jsSpice` (lunarsurfaceoperations) appears dormant | ⚠️ Only if "SPICE-in-the-browser" is itself a project goal |
| **calceph → WebAssembly** | High; smaller surface than CSPICE | Stable but smaller community | ⚠️ Marginal advantage over CSPICE-WASM |
| **ANISE → WebAssembly** (Rust → wasm32) | Medium; clean Rust→WASM story, no Emscripten FS dance | Library is mature; WASM target less battle-tested | ⚠️ Promising; would be a strong middle ground if validated |
| **Server-side SPICE microservice** (FastAPI + SpiceyPy) | Medium (backend infra) | Mature backend tech | ⚠️ Only if you need arbitrary ephemeris queries beyond Voyager |
| **JPL Horizons REST API** at runtime | Trivial to call | JPL-maintained, but **rate-limited**, not designed for interactive viz | ❌ Use only for one-time export, not runtime |

**Sources:** [SpiceyPy 8.1.0 on GitHub](https://github.com/AndrewAnnex/SpiceyPy), [SpiceyPy changelog](https://github.com/AndrewAnnex/SpiceyPy/blob/main/CHANGELOG.md), [ANISE GitHub](https://github.com/nyx-space/anise), [ANISE docs](https://docs.rs/anise/latest/anise/)

**Quantitative bake estimate for Voyager 1, daily samples 1977→2030:**
- ~19,345 samples × 6 doubles (pos + vel) × 8 bytes = **~930 KB raw**, ~300–500 KB gzipped
- Hourly samples: ~463k × 48 bytes = **~22 MB raw**, ~5–8 MB gzipped
- Both probes + Sun + 8 planets + major moons at daily cadence: **<30 MB gzipped total**

That is a static asset, not a dataset. The "precompute and ship JSON" architecture from [initial-research.md](initial-research.md) is correct and easy. _Confidence: High._

### Native Engines (Desktop / Hybrid Targets)

| Engine | Float64 world coords | Floating-origin pattern | Web export | Solo-dev friction |
|--------|----------------------|--------------------------|-------------|--------------------|
| **Unity** (LTS in 2026) | ❌ engine transforms are float32; **Burst supports `double` in Jobs**; Krakensbane-style floating-origin is community pattern | Community; well-documented (KSP precedent) | ✅ WebGL/WASM build (large bundles, ~30+ MB) | Medium |
| **Godot 4.x** | ❌ float32 only as of 4.x; double-precision world-coords is a community fork (`godot-double-precision`) but not in main | Manual | ✅ HTML5 export works | Low–Medium |
| **Unreal 5 (LWC)** | ✅ **Large World Coordinates** introduced in UE5.0, mature through UE5.7 (2026); world space is 64-bit, view space renders in float32 | Built-in (transparently handled) | ❌ HTML5 export was removed at UE4.24; **Pixel Streaming** (server-rendered) is the only "browser" story | High (C++ heavy) |

**Source:** [Large World Coordinates in UE5.7](https://dev.epicgames.com/documentation/en-us/unreal-engine/large-world-coordinates-in-unreal-engine-5)

- **UE5 LWC** is technically the cleanest precision model — but desktop-only deployment (no HTML5 export, only Pixel Streaming) makes it a heavy bet for a Voyager visualization that needs cross-platform reach.
- **Unity** has the **best hybrid story**: solid desktop builds + WebGL fallback + a vibrant space-sim community (KSP, Children of a Dead Earth) producing reusable floating-origin patterns.
- **Godot** is the lightest engine but trails in precision tooling and ecosystem.

### Database / Storage / Hosting

For a Voyager simulator the "database" is a tiny static asset set:

- Trajectory binary/JSON (few tens of MB at hourly cadence, both probes + bodies)
- Planet textures (~50–200 MB depending on resolutions chosen)
- Spacecraft GLB model(s) (~5–20 MB)
- Optional Voyager raw imagery thumbnails (PDS sources)

This entire payload fits trivially on any static host (Cloudflare Pages, Vercel, Netlify, GitHub Pages, S3+CloudFront). No database is needed unless you add user-state features (saved bookmarks, sharing, telemetry capture). _Confidence: High._

### Development Tools & Build Toolchains

- **Bundler:** Vite is the 2026 default for browser apps; faster cold builds than webpack, native ESM, first-class TypeScript.
- **Type checking:** TypeScript 5.x; consider strict mode + project references.
- **Asset build pipeline:** Python scripts (SpiceyPy + numpy + msgpack/struct) producing pre-computed binaries at build time. Run via GitHub Actions or local make/just.
- **3D asset processing:** `gltf-pipeline` (Cesium) for GLB optimization, Draco compression for meshes, KTX2 for textures.
- **Testing:** Vitest for unit tests; Playwright for visual regression on the time-lapse playback.

### Cloud Infrastructure & Deployment

For a static-asset Voyager sim:
- **Static hosting:** Cloudflare Pages or Vercel — global CDN, free tier covers the expected traffic, ~50 ms first-byte worldwide.
- **CI/CD:** GitHub Actions with cached Python venv + npm cache; the SPICE precompute step is cacheable by kernel-hash so re-runs are seconds.
- **Optional backend (only if needed):** Cloudflare Workers / Vercel Functions for any dynamic API (e.g., a future "current Voyager telemetry" overlay via NASA DSN).
- **No need for containers/K8s** at this scale; the architecture is fundamentally CDN + static-bundle + WASM-in-browser. _Confidence: High._

### Technology Adoption Trends (2024 → 2026)

- **WebGPU has gone mainstream in 2026.** Chrome, Edge, Firefox, and Safari all ship WebGPU by default; Three.js r171+ made `WebGPURenderer` zero-config and Babylon.js 9.0 ships native WGSL with no shader-conversion overhead. WebGL2 remains a safe fallback. [WebGPU baseline 2026 article](https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default)
- **Rust + WASM** is replacing Emscripten as the modern path for ported C/C++ libraries — `wasm-bindgen`, `wasm-pack`, and direct `Uint8Array` interop skip the Emscripten virtual-filesystem dance. ANISE in Rust is a leading example.
- **Python's free-threaded build (PEP 703)** stabilized in CPython 3.13+ — but is irrelevant for the offline precompute step.
- **Hapsira** has clearly succeeded **Poliastro** in the maintained-Python orbital-mechanics niche. The transition is settled.
- **CesiumJS** is the dominant astro/orbital web engine but its WebGPU migration is still in research as of mid-2026 — a temporary disadvantage vs. Three.js/Babylon.

---

**Step 2 confidence summary:**
- **High confidence:** library identification, version numbers (verified live), browser engine capabilities, deployment story
- **Medium confidence:** ANISE-to-WASM maturity (library is mature, browser target less battle-tested), exact integrator performance comparisons
- **Low confidence (to validate in Step 5):** whether heyoka.py's Taylor integrator is worth its build complexity for a simulator that mostly replays precomputed data

---

## Integration Patterns Analysis

> The Voyager-sim integration concerns aren't generic web-app patterns (OAuth/microservices/API gateways). They are: **the build-time SPICE pipeline → static-asset boundary**, the **runtime binary trajectory format**, the **3D asset pipeline**, and the **inter-component dataflow** inside the browser app. This section addresses each concretely.

### Build-Time SPICE Pipeline (Python → Static Binaries)

The dominant integration boundary in this architecture is **build-time, not runtime**: a Python script consumes NAIF SPK kernels and emits binary trajectory files that the browser app loads as static assets. There is no live SPICE server, no runtime API, no auth.

#### Pipeline topology

```text
                BUILD TIME (Python)                          RUNTIME (Browser)
┌──────────────────────────────────────────┐        ┌─────────────────────────────────┐
│  NAIF SPK kernels (*.bsp)                 │        │  fetch('/data/voyager1-1977.bin')│
│  Voyager1+2, planets (DE440), Sun         │        │           │                      │
│           │                               │        │           ▼                      │
│           ▼                               │        │  new DataView(buffer)            │
│  SpiceyPy.spkezr() (vectorized)           │ ─────▶ │  read header → Float64Array view │
│           │                               │        │           │                      │
│           ▼                               │        │           ▼                      │
│  numpy.ndarray (N, 6) per body            │        │  cached in TrajectoryStore       │
│           │                               │        │           │                      │
│           ▼                               │        │           ▼                      │
│  pack to little-endian binary chunks      │        │  CatmullRomCurve3 interpolate    │
│           │                               │        │           │                      │
│           ▼                               │        │           ▼                      │
│  emit .bin files + manifest.json          │        │  Three.js scene update           │
│           │                               │        │                                  │
│           ▼                               │        │                                  │
│  brotli compress (build-time)             │        │                                  │
│           │                               │        │                                  │
│           ▼                               │        │                                  │
│  publish to CDN as immutable assets       │        │                                  │
└──────────────────────────────────────────┘        └─────────────────────────────────┘
```

#### Alternative: ANISE-based pipeline (Python or Rust)

ANISE has first-class Python bindings via PyO3 and ~125,000 BSP queries/sec (validated against CSPICE to machine precision). For greenfield projects in 2026, ANISE is arguably cleaner than SpiceyPy for the bake step:

- No CSPICE shared-library dependency at build time (pure Rust wheel)
- Permissive MPL-2.0 license
- Uses `hifitime` for integer time arithmetic (no leap-second corner cases)
- Same SPK-format compatibility

Either is fine; SpiceyPy has the larger community and more example code. _Confidence: High._

### Runtime Binary Trajectory Format

#### Format decision matrix

| Format | Bytes/scalar | Parse cost (500k samples) | Bundle overhead | Range/chunk friendly | Verdict |
|---|---|---|---|---|---|
| **Raw little-endian Float64Array + fixed-step header** | 8 B | ~1–2 ms (view construction) | ~0 (<100 LOC) | Trivial (offset math) | **✅ Winner** |
| MessagePack (`@msgpack/msgpack`) | ~10 B | 10–40 ms | 8–30 KB | No native support | ❌ Adds cost without benefit |
| Protobuf (`protobufjs`) | ~8 B (packed) | 15–60 ms (decode + copy) | 20–60 KB | No native support | ❌ Adds cost without benefit |
| FlatBuffers / Cap'n Proto | 8 B | 5–20 ms | 20–50 KB | Possible but complex | ❌ Schema toolchain not worth it |
| Apache Arrow IPC | ~8.4 B | 10–30 ms | **200–400 KB** | Possible via record batches | ❌ Bundle weight kills it |
| Zarr / Parquet | 8 B + chunk meta | 20–100+ ms | 100–250 KB | ✅ Excellent | ❌ Overkill for this scale |
| **Custom binary + brotli/gzip transport** | 8 B → 3–5 B on wire | 5–20 ms decompress + 1–2 ms view | ~0 | Per-chunk files | **✅ Winner with compression** |

**Conclusion:** At this scale (5–25 MB raw across all bodies), self-describing formats add parse overhead, bundle weight, and complexity without payoff. **Use a custom little-endian Float64 layout with a small fixed-step header, compressed once at build time with brotli, served as immutable static assets.** _Confidence: High._

#### Recommended binary layout

```text
Header (40 bytes, little-endian):
  offset  size  type        field
  0       4     char[4]     magic = "VTRJ"
  4       2     uint16      version = 1
  6       2     uint16      reserved
  8       8     float64     t0_et    (seconds since J2000 TDB)
  16      8     float64     dt_sec   (seconds between samples)
  24      4     uint32      numSamples
  28      4     uint32      componentsPerSample (6 = pos+vel, 3 = pos only)
  32      4     uint32      bodyId   (NAIF ID, e.g. -31 for Voyager 1)
  36      4     uint32      reserved

Data (numSamples × componentsPerSample × 8 bytes):
  float64[]   x, y, z, vx, vy, vz  (repeating per sample)
```

Time is **implicit** (`t = t0 + dt * i`), saving 50% of bytes vs storing timestamps. Variable-cadence segments (e.g., flyby high-resolution overlays) live in **separate chunk files**, each with their own header.

#### TypeScript loader (skeleton)

```typescript
interface TrajectoryHeader {
  t0Et: number;
  dtSec: number;
  numSamples: number;
  componentsPerSample: number;
  bodyId: number;
}

interface Trajectory {
  header: TrajectoryHeader;
  data: Float64Array;
}

const HEADER_SIZE = 40;
const MAGIC = "VTRJ";

export async function loadTrajectory(url: string): Promise<Trajectory> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const view = new DataView(buffer);

  const magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== MAGIC) throw new Error(`Bad magic: ${magic}`);

  const header: TrajectoryHeader = {
    t0Et: view.getFloat64(8, true),
    dtSec: view.getFloat64(16, true),
    numSamples: view.getUint32(24, true),
    componentsPerSample: view.getUint32(28, true),
    bodyId: view.getUint32(32, true),
  };

  const data = new Float64Array(
    buffer,
    HEADER_SIZE,
    header.numSamples * header.componentsPerSample,
  );

  return { header, data };
}
```

`new Float64Array(buffer, offset, length)` is a **zero-copy view** — no allocation beyond the wrapper struct.

### Chunked Loading Strategy (for fast time-jumps)

Three usable patterns, ranked by simplicity:

1. **Per-decade chunk files** (recommended): `voyager1_1977-1987.bin.br`, `voyager1_1987-1997.bin.br`, … Each is independently brotli-compressed (CDN edge caches well); client maintains a Map from time-range to URL. Jumping to 1989 loads one ~1 MB file. ✅ **Use this.**
2. **Single uncompressed file + HTTP Range**: Works but you cannot `Range` into a gzip-encoded response (Range applies to encoded bytes). Forces serving uncompressed (5–25 MB) or maintaining a separate `.gz`-named precompressed file alongside.
3. **Index file + Range into a single payload**: Most engineering effort, smallest deployment surface. Overkill at this scale.

Manifest format (loaded once at app start):

```json
{
  "version": 1,
  "epoch": "J2000",
  "bodies": {
    "voyager1": {
      "naifId": -31,
      "chunks": [
        { "tStart": "1977-09-05T00:00:00Z", "tEnd": "1987-01-01T00:00:00Z",
          "url": "/data/v1_1977-1987.bin", "samples": 3406 },
        { "tStart": "1987-01-01T00:00:00Z", "tEnd": "1997-01-01T00:00:00Z",
          "url": "/data/v1_1987-1997.bin", "samples": 3653 }
      ]
    }
  },
  "encounters": {
    "voyager1-jupiter-1979": {
      "tStart": "1979-03-01T00:00:00Z", "tEnd": "1979-03-10T00:00:00Z",
      "url": "/data/v1_jupiter_1979_1min.bin", "stepSec": 60,
      "note": "1-minute cadence overlay for flyby"
    }
  }
}
```

The encounter overlays sit on top of the daily-cadence base trajectory, swapped in automatically when the simulation clock enters their time range.

### 3D Asset Pipeline (NASA OBJ → optimized GLB)

The 3D asset boundary is also build-time. The pipeline is well-established in 2026.

#### Tooling stack (2026)

- **gltf-transform** (Don McCurdy) — Swiss-army CLI for glTF manipulation; replaces piecemeal use of `gltf-pipeline`, `obj2gltf`, etc.
- **KTX-Software** (`toktx`) — KTX2/Basis Universal texture encoding
- **Blender** (headless CLI mode) — for source-format conversion and material cleanup when needed
- **Three.js `KTX2Loader` + `MeshoptDecoder`** — runtime decoders, both ship in modern Three.js examples

#### Mesh compression: EXT_meshopt_compression beats Draco in 2026

| | Draco | EXT_meshopt_compression |
|---|---|---|
| Compression ratio | Slightly better raw | ~10–20% less; closes gap when combined with gzip/brotli transport |
| Decoder size | Larger WASM module | **Smaller** |
| Decode CPU | Higher | **Lower** |
| Streaming / partial-decode | Harder | **Better** |
| Engine support (Three.js, CesiumJS) | ✅ via `DRACOLoader` (worker) | ✅ via `MeshoptDecoder` (main-thread acceptable) |
| Recommended for new projects | Only for legacy assets | **✅ Use this** |

**Sources:** [Three.js GLTFLoader docs](https://threejs.org/docs/pages/GLTFLoader.html), [Three.js 100 perf tips 2026](https://www.utsubo.com/blog/threejs-best-practices-100-tips), [Three.js compression sample repo](https://github.com/klich3/threejs-gltf-with-compressions-sample)

#### Texture compression: KTX2 / Basis Universal

| Variant | Use for | Size | Decode | Notes |
|---|---|---|---|---|
| **ETC1S** | Planet maps, skybox, distant LODs | Smallest (JPEG-like) | Very fast | Slight softening; fine for distant equirect spheres |
| **UASTC** | Voyager hero textures, decals, labels | 4–8× larger | Fast | Near-lossless; use only where it shows |

**8k texture gotchas:** 8k × 8k × RGBA uncompressed = 256 MB GPU memory. KTX2/ETC1S brings file size down to ~3–6 MB per planet, but GPU memory residency is still ~64 MB compressed-on-GPU. Strategy: ship 4k by default, lazy-upgrade to 8k only when camera enters that planet's sphere of influence.

#### End-to-end CLI pipeline (Voyager spacecraft)

```bash
# 1. Convert NASA .obj/.3ds → clean .blend → raw GLB (one-time, in Blender)
blender -b voyager_source.blend --python export_voyager.py
# (export_voyager.py calls bpy.ops.export_scene.gltf with export_apply=True,
#  export_yup=True, export_format='GLB')

# 2. Optimize structure, convert specGloss → metalRough if needed
npx gltf-transform metalrough voyager_raw.glb voyager_mr.glb

# 3. Geometry compression (meshopt) + texture-size cap
npx gltf-transform optimize voyager_mr.glb voyager_meshopt.glb \
  --meshopt --meshopt.level high --meshopt.compress \
  --texture-size 4096

# 4. KTX2 textures
toktx --uastc 2 --zstd 18 --genmipmap \
  --assign_oetf srgb --assign_primaries bt709 \
  voyager_basecolor.ktx2 voyager_basecolor.png

toktx --encode etc1s --clevel 3 --qlevel 128 --genmipmap \
  --assign_oetf linear --assign_primaries bt709 \
  voyager_rm.ktx2 voyager_rm.png

# 5. Replace texture slots in GLB
npx gltf-transform etc1s voyager_meshopt.glb voyager_final.glb \
  --slots "baseColorTexture=voyager_basecolor.ktx2" \
  --slots "metallicRoughnessTexture=voyager_rm.ktx2"

# 6. Deploy to CDN as immutable asset:
#    Cache-Control: public, max-age=31536000, immutable
#    Content-Type: model/gltf-binary
```

For planets, same pipeline minus step (1). Generate spheres procedurally in Blender or with `gltf-transform`; texture each with the appropriate KTX2 ETC1S equirect map.

#### Three.js loader configuration

```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const ktx2 = new KTX2Loader()
  .setTranscoderPath('/lib/basis/')
  .detectSupport(renderer);

const loader = new GLTFLoader()
  .setKTX2Loader(ktx2)
  .setMeshoptDecoder(MeshoptDecoder);

const { scene: voyagerModel } = await loader.loadAsync('/assets/voyager_final.glb');
```

### Asset Payload Budget

| Asset | Compressed size | Notes |
|---|---|---|
| Voyager LOD0 GLB (meshopt + KTX2 UASTC) | 3–5 MB | Full ~99k tris + hero textures |
| Voyager LOD1, impostor | 1–2 MB | Mid-distance + billboard |
| Sun + 8 planets @ 4k ETC1S | 16–24 MB | Default initial-load tier |
| Earth/Jupiter/Saturn @ 8k upgrade | +9–18 MB | Loaded only on close approach |
| Selected moons @ 2k | 4–8 MB | Major Voyager flyby targets |
| Skybox (Milky Way) 2k ETC1S | 1–2 MB | |
| Trajectory binaries (both probes + bodies, daily, brotli) | <10 MB | Per Step 2 sizing |
| App JS bundle (Three.js + app code) | 200–400 KB | Vite + tree-shake |
| **First-paint total** | **~25–35 MB** | Well under 50 MB target |
| **Full assets total** | **~80–120 MB** | Under 200 MB target |

_Confidence: High._

### Inter-Component Dataflow (Inside the Browser App)

A clean module boundary keeps the system testable and lets you swap the physics layer for Rust/WASM later without touching the renderer:

```text
┌─────────────────────────────────────────────────────────────────────┐
│                          App (TypeScript)                           │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │ ClockManager │──▶│ Ephemeris    │──▶│ Renderer (Three.js)   │   │
│  │              │    │ Service      │    │                      │   │
│  │ getSimTime() │    │ getStateAt(t)│    │ - WorldGroup (Float64│   │
│  │ setRate(x)   │    │              │    │   accounting)        │   │
│  │ scrub(t)     │    │ - Trajectory │    │ - Camera-relative xf │   │
│  └──────────────┘    │   Store      │    │ - GLB models         │   │
│         │            │ - Catmull-   │    │ - logarithmicDepthBuf│   │
│         │            │   Rom interp │    └──────────────────────┘   │
│         │            └──────────────┘                 │             │
│         │                    ▲                        │             │
│         │                    │                        ▼             │
│         │              ┌──────────────┐    ┌──────────────────────┐ │
│         │              │ Manifest +   │    │ UI Overlay (React)   │ │
│         │              │ Asset Loader │    │ - timeline / scrubber│ │
│         │              │ (fetch+brotli│    │ - telemetry readouts │ │
│         │              │  + GLTF)     │    │ - milestone presets  │ │
│         │              └──────────────┘    └──────────────────────┘ │
│         │                                                           │
│         └──────────── State events ─────────────────▶               │
│                       (via store / signals / RxJS)                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Key contract:** `EphemerisService.getStateAt(bodyId, t: number): { pos: Float64Array, vel: Float64Array }` — a pure function. That single interface is the seam where you could later swap a TS+Float64 implementation for a Rust+WASM one without changing the renderer.

### External APIs (Optional, Future)

For Voyager's historical replay, no external API is needed at runtime. Two optional integrations worth mentioning:

| API | Purpose | Pattern |
|---|---|---|
| **JPL Horizons REST** | One-time ephemeris dump if SpiceyPy unavailable | Build-time only; rate-limited; not for runtime |
| **NASA Eyes on the Solar System / DSN status** | Live "current Voyager telemetry" overlay | Optional runtime fetch; small payload; may be undocumented/unstable |
| **NASA SPICE WebGeocalc** | Server-side SPICE computations | Build-time fallback; not designed for interactive viz |

None of these are part of the core architecture. _Confidence: Medium (Horizons API is stable; Eyes-on internal endpoints are less so)._

### Integration Security & CORS

Trivial at this scale:

- Static assets on a CDN with `Cache-Control: public, max-age=31536000, immutable`
- CORS headers permissive on the trajectory binaries (`Access-Control-Allow-Origin: *` is fine — public NASA-derived data)
- Subresource Integrity (SRI) hashes optional; immutable URLs (content-hashed filenames) accomplish the same thing
- No authentication, no PII, no user data ⇒ no OAuth/JWT/session story needed
- HTTPS everywhere, HSTS, modern TLS — standard CDN defaults

---

**Step 3 confidence summary:**

- **High confidence:** binary format choice, SPICE pipeline topology, asset pipeline tooling, payload budgeting
- **Medium confidence:** exact JS decode times (vary by browser & hardware; benchmark in Step 5 if needed)
- **Low confidence (revisit in Step 4):** whether to use a single full-load file vs per-decade chunks — depends on UX priorities (zero-latency time-jumps vs simpler architecture)

---

## Architectural Patterns

> Six patterns drive the architecture: (1) **floating-origin / camera-relative rendering**, (2) **depth-precision strategy**, (3) **canonical reference frame + view-frame abstraction**, (4) **cubic Hermite trajectory interpolation** (the under-appreciated key), (5) **decoupled simulation clock**, (6) **LOD and asset streaming**. Each is explained below with concrete TypeScript-level guidance and tradeoff calls.

### Pattern 1: Floating-Origin / Camera-Relative Rendering

The single most important architectural pattern. Without it, Float32 GPU coordinates jitter at AU scale (precision snaps to ~2 km increments at 165 AU); with it, sub-millimeter precision is achievable.

**Implementation:**

```text
Every frame:
  1. Compute camera position P_cam (Float64, in world frame)
  2. For each object O with world position P_O (Float64):
       P_local = (P_O − P_cam)             ← double precision subtraction
       P_render = P_local / SCALE          ← cast to float32 for GPU
  3. Camera is at (0, 0, 0) in render coordinates; only relative offsets ever
     reach the vertex shader.
```

`SCALE` is your unit choice: 1 unit = 1 km is common; 1 unit = 1 m for close-up shots. Switching scale between regimes is fine as long as you do it cleanly between frames.

**The "WorldGroup" pattern:**

A common Three.js implementation is a single root `THREE.Group` ("WorldGroup") that holds the entire scene. Each frame, set `worldGroup.position = -cameraWorldPos / SCALE`. This sweeps every child object into camera-relative space in one matrix update — no per-object computation. Works because Three.js multiplies the group transform into every child's world matrix automatically.

_Confidence: High._ This is the established pattern (KSP "Krakensbane", Cesium internal architecture, Unreal LWC's view-space handling).

### Pattern 2: Depth-Precision Strategy

#### The math (with floating origin in place)

Standard 24-bit linear depth buffer with far=165 AU (2.47×10¹³ m), near=0.1 m:
- Precision at 10 m from camera: **~10⁶ m** — useless.

Three alternatives:

| Approach | Precision @ 10 m (far=165 AU) | Performance | Three.js support (2026) |
|---|---|---|---|
| **Reverse-Z** (float depth + flipped compare) | **~0.6 mm** | **Best** (preserves early-Z) | ✅ **WebGLRenderer**, demo at `webgl_reversed_depth_buffer.html` |
| **Logarithmic depth buffer** | ~0.5–2 cm | Disables early-Z on some HW (~5–15% hit) | ✅ Both renderers (`{ logarithmicDepthBuffer: true }`) |
| **Multi-frustum / depth partitioning** | <0.01 mm | **Worst** (3–4× render cost) | Manual (CesiumJS does this internally) |

**Sources:** [Three.js reverse-Z demo](https://threejs.org/examples/webgl_reversed_depth_buffer.html), [Three.js forum: WebGPU reverse-Z](https://discourse.threejs.org/t/does-three-js-webgpu-support-reverse-z-buffer/87687), [Three.js forum: logDepth performance](https://discourse.threejs.org/t/beware-of-logarithmic-depth-buffer-it-can-degrade-scene-performance/88495/10)

#### The 2026 nuance

**Reverse-Z is the better technique but is currently WebGLRenderer-only in Three.js.** WebGPURenderer (as of October 2025) does not yet support reverse-Z and falls back to logarithmic depth. This makes the rendering-API choice non-trivial:

| Choice | Depth strategy | Tradeoff |
|---|---|---|
| **WebGLRenderer + reverse-Z** | Sub-mm precision, best perf, no shader gotchas | Forgo WebGPU's other perks (compute shaders, reduced draw-call overhead) |
| **WebGPURenderer + logarithmic depth** | ~0.5–2 cm precision, slight perf hit on older HW | Get WebGPU's draw-call efficiency, but pay early-Z cost; some custom shaders need adaptation |

**Recommendation:** Start with **WebGLRenderer + reverse-Z** for the Voyager sim specifically. The bottleneck for this app is not draw calls or compute (it's ~10 bodies + 1 spacecraft, not 10,000 particles); the wins WebGPU offers don't matter here, while sub-mm precision and clean shader compatibility do. Migrate to WebGPU + reverse-Z when Three.js's WebGPURenderer adds support (likely 2026/2027 given the active issue threads). _Confidence: High._

#### When multi-frustum would be necessary

Only if you wanted simultaneous full-system view + meter-detail of the spacecraft. Since this sim is **story-driven** — close to Voyager OR following a planet, almost never both at once — multi-frustum is unjustified. For the rare full-system "where am I" view, **render the spacecraft as a billboard** and the precision problem disappears.

### Pattern 3: Canonical Reference Frame + View-Frame Abstraction

**Store all state in one frame; render in another.**

#### Data layer (canonical, always heliocentric J2000)

```typescript
// Single inertial truth frame for the entire dataset.
// Units: km and km/s. Float64 throughout.
interface State { x: number; y: number; z: number; vx: number; vy: number; vz: number; }

interface EphemerisService {
  getStateJ2000(bodyId: number, et: number): State;  // pure function
}
```

Reasons to store in one frame only:
- No duplication, no synchronization risk
- SPICE provides frame transforms cheaply, so derive-on-read
- Float64 handles the full Voyager 1 distance (~165 AU ≈ 2.5×10¹⁰ km) with ~15 cm precision — fine for visualization

#### View layer (abstraction over rendering frame)

```typescript
interface ViewFrame {
  // Returns J2000 → view-frame transform at time et
  getTransform(et: number): Matrix4;
}

class HeliocentricViewFrame implements ViewFrame {
  getTransform(_et: number): Matrix4 { return Matrix4.identity(); }
}

class BlendedEncounterViewFrame implements ViewFrame {
  constructor(
    private bodyId: number,
    private tCA: number,            // closest-approach ET
    private blendIn: number = 2 * 86400,   // 2 days
    private blendOut: number = 2 * 86400,
  ) {}

  getTransform(et: number): Matrix4 {
    const w = this.blendWeight(et);
    const sunPos = { x: 0, y: 0, z: 0 };
    const bodyPos = ephemeris.getStateJ2000(this.bodyId, et);
    // Slide origin from Sun → body as w goes 0 → 1
    const ox = (1 - w) * sunPos.x + w * bodyPos.x;
    const oy = (1 - w) * sunPos.y + w * bodyPos.y;
    const oz = (1 - w) * sunPos.z + w * bodyPos.z;
    return Matrix4.translation(-ox, -oy, -oz);
  }

  private blendWeight(et: number): number {
    if (et <= this.tCA - this.blendIn) return 0;
    if (et >= this.tCA + this.blendOut) return 1;
    const x = (et - (this.tCA - this.blendIn)) / (this.blendIn + this.blendOut);
    return x * x * (3 - 2 * x); // smoothstep
  }
}
```

The view frame is **only** for rendering. Camera control logic, trajectory lines, and HUD overlays all read the same `M_view(et)` so they're consistent.

#### Frame strategy comparison

| Pattern | Visual quality | Implementation | Verdict |
|---|---|---|---|
| Always-heliocentric, camera follows Voyager | Physically correct but Jupiter "whips" past during flyby — hard to read the gravity assist | Trivial | Good for purist POV mode |
| Hard frame switch (sphere of influence) | Visible pop unless aligned at switch | Moderate | Risky |
| **Smooth blended (smoothstep over ±2 days)** | **Cinematic — Jupiter gradually anchors and recedes** | Moderate-plus | **✅ Recommended for encounters** |

Expose all three as ViewFrame implementations; default to blended for encounters, heliocentric for cruise, allow a UI toggle. _Confidence: High._

### Pattern 4: Cubic Hermite Trajectory Interpolation (the under-appreciated key)

**Correction to [initial-research.md](initial-research.md)** — it recommended Catmull-Rom (`THREE.CatmullRomCurve3`). That's the wrong choice here, because SPICE gives us **both position AND velocity** at every sample. Catmull-Rom estimates tangents from neighbor positions, throwing the known velocities away. **Cubic Hermite** uses both, giving exact position+velocity at every knot and significantly better accuracy mid-segment, especially during high-curvature flybys.

#### Hermite basis (for τ ∈ [0, 1])

```
h00(τ) =  2τ³ − 3τ² + 1
h10(τ) =    τ³ − 2τ² + τ
h01(τ) = −2τ³ + 3τ²
h11(τ) =    τ³ −   τ²

P(t) = h00(τ) P0 + h10(τ) (Δt V0) + h01(τ) P1 + h11(τ) (Δt V1)
       where τ = (t − t0) / Δt, Δt = t1 − t0
```

#### TypeScript implementation

```typescript
function hermitePosition(
  t: number,
  t0: number, t1: number,
  p0: Vec3, p1: Vec3, v0: Vec3, v1: Vec3,
): Vec3 {
  const dt = t1 - t0;
  const tau = (t - t0) / dt;
  const tau2 = tau * tau;
  const tau3 = tau2 * tau;

  const h00 =  2*tau3 - 3*tau2 + 1;
  const h10 =      tau3 - 2*tau2 + tau;
  const h01 = -2*tau3 + 3*tau2;
  const h11 =      tau3 -   tau2;

  // Scale velocities so units match positions (km/s * s = km)
  return {
    x: h00*p0.x + h10*v0.x*dt + h01*p1.x + h11*v1.x*dt,
    y: h00*p0.y + h10*v0.y*dt + h01*p1.y + h11*v1.y*dt,
    z: h00*p0.z + h10*v0.z*dt + h01*p1.z + h11*v1.z*dt,
  };
}
```

Cost: same as Catmull-Rom (one cubic per axis). **C1 continuous** at knots. Position and velocity are both **exact** at every sample. Mid-segment error is dramatically lower than Catmull-Rom during high-acceleration phases (flybys). _Confidence: High._

Higher-order alternatives (Lagrange degree-5, Chebyshev) offer no meaningful improvement once you have state vectors and risk Runge oscillation at edges. They're what SPICE uses **internally** to produce the state vectors you're consuming — re-applying them after sampling is interpolation-on-interpolation.

#### Sampling cadence by mission phase

| Phase | Cadence | Rationale |
|---|---|---|
| Cruise / interstellar | 1 day | Hermite from daily state vectors gives ~m-level error vs SPICE; visually invisible |
| Approach / departure (±30 days from C/A) | 1 hour | Tighter sampling for the curvature ramp-up |
| Flyby (±2 days from C/A) | 1 minute | Resolves the gravity-assist bend |
| Closest approach (±1 hour) | 10 seconds | For the most dramatic frames if user zooms in |

These are separate chunk files per Step 3's manifest format; the simulator picks the densest chunk available for the current time.

### Pattern 5: Decoupled Simulation Clock

Standard pattern, but worth stating explicitly:

```typescript
class ClockManager {
  private simTimeEt: number;           // canonical simulation time (Ephemeris Time)
  private rate: number = 1;            // 1× = real time; up to 1e9× for full-mission lapse
  private lastRealTime: number = performance.now();

  tick(): number {
    const now = performance.now();
    const realDt = (now - this.lastRealTime) / 1000;
    this.lastRealTime = now;
    this.simTimeEt += realDt * this.rate;
    return this.simTimeEt;
  }

  pause()          { this.rate = 0; }
  play(rate = 1)   { this.rate = rate; }
  scrub(et: number){ this.simTimeEt = et; }    // jump to a specific time
}
```

The render loop calls `clock.tick()` once and passes the returned ET to every downstream service (`EphemerisService.getStateJ2000`, `ViewFrame.getTransform`, instrument-status calculator). This keeps all visual state synchronized at exactly one time per frame.

**Time-warp gotcha:** at very high rates (1e9×) the render-frame `dt` corresponds to ~16 simulated years per real second. The system handles this trivially because **all interpolation is closed-form** (Hermite given t, no integration steps). There is no "step the simulation forward in tiny increments" loop. _Confidence: High._

### Pattern 6: LOD and Asset Streaming

#### Spacecraft LODs (distance-based mesh swap)

| Camera distance | Asset | Tris | Notes |
|---|---|---|---|
| < 50 m | LOD0 (full ~99k tris) | 99,000 | Hero shots, close inspection |
| 50 m – 5 km | LOD1 (decimated ~30k) | 30,000 | Mid-distance |
| 5 km – 100 km | LOD2 (silhouette ~5k) | 5,000 | Far approach |
| > 100 km | Billboard / impostor | (textured quad) | Always camera-facing, near-zero cost |

Implement with `THREE.LOD` (built-in) or manual visibility toggling. Avoid glTF `MSFT_lod`/`EXT_LOD` extensions — inconsistent engine support; rolling your own is more predictable.

#### Planet textures (resolution-tier swap)

- Default 4k ETC1S KTX2 in the initial load
- Lazy-upgrade to 8k UASTC when camera enters body's sphere of influence (or within ~10 body radii)
- Downgrade aggressively on mobile (detect via `renderer.capabilities` and `navigator.deviceMemory`)

#### Trajectory data (per-decade chunk loading per Step 3)

Already covered in Step 3. Architecturally relevant: the manifest is loaded once at app start; chunks are fetched on-demand via the `TrajectoryStore` cache. Pre-fetch the neighboring chunk when the simulation clock enters the last ~10% of the current chunk.

### Pattern 7 (Cross-cutting): State Machine for Mission Phases

A simple finite-state machine governs which assets and behaviors are active:

```text
   ┌─────────┐  launch    ┌─────────┐  jupiter   ┌─────────────┐
   │ PRE_    │─────────▶│ CRUISE  │───────────▶│ JUPITER_     │
   │ LAUNCH  │            │         │            │ ENCOUNTER    │
   └─────────┘            └─────────┘            └─────────────┘
                              ▲     │                   │
                              │     ▼                   ▼
                          ┌─────────┐            ┌─────────────┐
                          │ CRUISE  │◀──────────│ SATURN_      │
                          │         │            │ ENCOUNTER    │
                          └─────────┘            └─────────────┘
                              │                       (etc.)
                              ▼
                          ┌─────────────────┐
                          │ INTERSTELLAR    │
                          │ (post-heliopause│
                          │  2012/2018)     │
                          └─────────────────┘
```

State transitions are **time-driven** (the FSM reads the simulation clock, not user input), and govern:

- Which ViewFrame is active (heliocentric vs encounter-blended)
- Which spacecraft instruments are powered (per the shutoff table in [initial-research.md](initial-research.md))
- Which planetary body is the camera anchor by default
- Whether to show the "trajectory bend" overlay during flybys

This is the seam where mission-specific behavior lives. Adding a future "Voyager 3" or any other historical spacecraft amounts to: more SPICE data + a new FSM script + ViewFrame instances. The renderer, clock, and ephemeris service don't change.

---

**Step 4 confidence summary:**

- **High confidence:** floating-origin pattern, canonical-frame storage, Hermite interpolation choice, simulation-clock structure, LOD strategy
- **High confidence (with caveat):** reverse-Z depth — recommended, but tied to WebGLRenderer for now; will reassess when Three.js WebGPURenderer adds reverse-Z support
- **Medium confidence:** blend window sizing for encounter view frames (±2 days is a reasonable default but worth tuning visually during prototype)
- **Open question for Step 5:** should the Hermite interpolation run on the main thread or in a Web Worker? At 60 FPS × ~12 bodies × ~30 cycles/sec it's <1 ms of main-thread work — probably not worth a Worker, but I'll validate the budget in Step 5

---

## Implementation Approaches and Technology Adoption

### Phased Implementation Roadmap

A solo developer can ship this in clearly-bounded phases. Each phase yields a working, demoable artifact.

#### Phase 0 — Spike (1–2 days)

Verify the riskiest assumption before committing to the architecture: that SpiceyPy can produce trajectory data and that Three.js with reverse-Z renders a meter-scale spacecraft at AU-scale distances without precision artifacts.

- Install SpiceyPy, download minimal kernels (`naif0012.tls`, `de440.bsp`, `voyager_1.ST+1991_a54418u.merged.bsp`)
- Generate 100 sample positions for Voyager 1 in 1979 (around Jupiter flyby)
- Build a hello-world Three.js scene: Sun-at-origin, Jupiter-at-real-distance, Voyager-as-cube, reverse-Z enabled, floating-origin in place
- Zoom the camera to inspect the cube at 10 m and verify no jitter

**Exit criteria:** Spacecraft cube renders cleanly with no Z-fighting or jitter at any distance.

#### Phase 1 — MVP cruise viewer (1–2 weeks)

Just Voyager 1 + Sun + planets, daily cadence, heliocentric view, no encounter logic, no UI polish. Proves the core dataflow end-to-end.

- Python build script: bulk-extract Voyager 1 + planets (daily, 1977→2030) → binary chunks per decade + manifest.json
- TypeScript app: load manifest, fetch current-decade chunk, Hermite-interpolate, render
- Three.js scene with reverse-Z, floating-origin WorldGroup, Sun + 8 planet spheres (placeholder textures), Voyager glTF (low-LOD)
- Crude UI: pause/play, time-scrubber, speed multiplier
- Deploy to Cloudflare Pages or Vercel

**Exit criteria:** Press play, watch Voyager 1 fly past planets across 50 years in any speed from 1× to 1e9×.

#### Phase 2 — Encounters (2–3 weeks)

Add Voyager 2, dense flyby overlays, blended view frames, planet textures, mission-phase state machine.

- Generate per-encounter high-cadence overlays (1-min for flyby ±2 days, 10-sec for closest approach ±1 hr)
- Implement `BlendedEncounterViewFrame` with smoothstep over ±2 days
- Mission-phase FSM driving ViewFrame selection and instrument states
- Real KTX2 planet textures (4k default, 8k lazy-upgrade on close approach)
- Add Voyager 2, all four gas-giant encounters (1979 Jupiter, 1981 Saturn, 1986 Uranus, 1989 Neptune)
- "Quick-jump" UI for milestone events

**Exit criteria:** Click "Voyager 2 Neptune flyby" → camera arrives in a blended Neptune-anchored view, Triton visible, sees trajectory bend down out of ecliptic plane.

#### Phase 3 — Polish & instrumentation (1–2 weeks)

- Interstellar phase: heliopause crossings, instrument shutoff timeline, current-position telemetry
- Camera presets, cinematic transitions
- HUD overlays: distance from Sun/Earth, speed, active instruments, mission day
- Optional: "Family Portrait" reproduction view (Feb 14, 1990)
- Optional: NASA Eyes-on integration for live current position
- Accessibility: keyboard controls, screen-reader labels, reduced-motion preferences

**Exit criteria:** Production-feeling artifact you'd link from a portfolio.

#### Phase 4 (Deferred / optional)

Only if the previous phases revealed real bottlenecks:

- Rust/WASM physics core (if main-thread interpolation budget is exceeded — unlikely)
- WebGPU migration (when Three.js WebGPURenderer adds reverse-Z support)
- Server-side ANISE microservice for arbitrary ephemeris queries (only if expanding scope beyond Voyager)
- Per-instrument simulated telemetry / scientific overlay
- VR (WebXR) mode

**Total realistic timeline:** 5–8 weeks of focused solo-dev work for Phases 0–3. _Confidence: Medium_ (depends heavily on developer's familiarity with Three.js and SpiceyPy).

### Development Workflow

#### Repository structure

```text
voyager/
├── README.md
├── docs/                              # design notes, ADRs
├── kernels/                           # NAIF kernels (or download script)
│   ├── kernels-manifest.json          # SHA-256 hashes of pinned kernels
│   └── voyager.tm                     # SPICE meta-kernel
├── tools/                             # Python build scripts
│   ├── pyproject.toml
│   ├── extract_trajectory.py          # SpiceyPy bulk extraction
│   ├── extract_encounter_overlays.py  # dense-cadence flyby data
│   ├── pack_binary.py                 # write VTRJ binary format
│   ├── verify_kernels.py              # hash-check kernels
│   ├── validate_interpolation.py      # Hermite vs SPICE error check
│   └── generate_spice_samples.py      # random sample points for CI
├── assets/                            # raw 3D source files (Voyager OBJ, etc.)
├── public/
│   ├── data/                          # generated trajectory binaries (.bin.br)
│   ├── models/                        # optimized .glb files
│   └── textures/                      # KTX2 planet textures
├── src/                               # TypeScript app
│   ├── ephemeris/
│   │   ├── trajectory-loader.ts
│   │   ├── hermite.ts
│   │   ├── ephemeris-service.ts
│   │   └── manifest.ts
│   ├── view-frames/
│   │   ├── view-frame.ts
│   │   ├── heliocentric-view-frame.ts
│   │   └── blended-encounter-view-frame.ts
│   ├── clock/
│   │   └── clock-manager.ts
│   ├── render/
│   │   ├── scene.ts
│   │   ├── world-group.ts
│   │   ├── renderer.ts
│   │   └── lod.ts
│   ├── mission/
│   │   ├── mission-phase.ts           # FSM
│   │   └── events.ts
│   └── ui/                            # React or vanilla
├── tests/
│   ├── unit/
│   ├── spice-consistency/             # Node tests vs SPICE artifact
│   └── e2e/                           # Playwright
├── package.json
├── vite.config.ts
└── .github/workflows/ci.yml
```

#### Tooling

| Concern | Tool | Notes |
|---|---|---|
| TS bundler | **Vite** | fast HMR, native ESM, first-class TS |
| Type checking | **TypeScript 5.x strict** | catches the Float32/Float64 confusion at the type level |
| Linting | ESLint + Prettier | standard setup |
| Python deps | **uv** (or pip + venv) | uv is the 2026 default; faster install, deterministic lockfile |
| Python format/lint | Ruff | one tool, fast |
| Asset pipeline | gltf-transform + toktx | covered in Step 3 |
| Unit tests (TS) | **Vitest** | fast, Vite-native |
| E2E / visual | **Playwright** | built-in screenshot diff, multi-browser |
| Performance | Built-in Performance API + custom perf harness | Lighthouse CI optional |
| CI | GitHub Actions | covered below |
| Hosting | Cloudflare Pages or Vercel | static CDN |

### Testing & Validation Strategy

#### Layer 1: Python interpolation validation (one-time + regression)

Verify that the Python Hermite implementation reproduces SPICE ground truth at a target tolerance:

- Sample dense reference (10-second cadence) from SpiceyPy across a representative interval (e.g., 1979 Jupiter flyby ±5 days)
- Re-interpolate from coarse grid (1-hour cadence) using `scipy.interpolate.CubicHermiteSpline` (which mirrors the JS algorithm)
- Compute Euclidean position error vs the reference
- **Acceptance:** `max_error_km <= 20`, `rms_error_km <= 5` for visualization-grade output

This is the test that determines your **cadence choice** for each mission phase. Tune Δt until the bound is met.

#### Layer 2: JS Hermite vs SPICE consistency (CI)

A 2-step CI job:

1. **Python job**: with fixed RNG seed (`random.seed(42)`), pick 100 random ETs across the mission timeline; use SpiceyPy to compute ground truth; upload as artifact (`ground_truth.json`)
2. **Node job**: load the deployed trajectory binaries; for each sample time, call the production Hermite interpolator; compare positions

```typescript
import { describe, it, expect } from 'vitest';
import groundTruth from './ground_truth.json';
import { loadTrajectory, getStateAt } from '../src/ephemeris';

describe('JS Hermite vs SPICE', () => {
  it.each(groundTruth.samples)('matches SPICE at %s', async ({ et, posKm }) => {
    const traj = await loadTrajectory('/data/voyager1_full.bin');
    const { x, y, z } = getStateAt(traj, et);
    const err = Math.hypot(x - posKm[0], y - posKm[1], z - posKm[2]);
    expect(err).toBeLessThan(20); // km — visualization-grade tolerance
  });
});
```

#### Layer 3: Numerical unit tests (TS)

Pure-function tests for: `hermitePosition`, time conversions (UTC ↔ ET ↔ J2000), frame-blend weights at boundary conditions, manifest parsing. Run on every commit.

#### Layer 4: Visual regression (Playwright)

Pin specific simulation times and camera presets; screenshot-diff against committed baselines. Critical scenes:

- Jupiter closest approach (V1: 1979-03-05 12:05 UT, V2: 1979-07-09 22:29 UT)
- Saturn closest approach (V1: 1980-11-12 23:46 UT, V2: 1981-08-26)
- Uranus closest approach (V2: 1986-01-24)
- Neptune closest approach (V2: 1989-08-25 — the dramatic trajectory bend)
- Pale Blue Dot moment (V1: 1990-02-14)
- Heliopause crossing (V1: 2012-08-25)

Non-determinism mitigations: headless Chromium with SwiftShader, `antialias: false`, pinned canvas size 1280×720, pinned `devicePixelRatio = 1`, expose `window.__sim.setTime()` test API, `maxDiffPixelRatio: 0.001`.

#### Layer 5: End-to-end mission timeline (Playwright)

Expose `window.__sim.setTimeScale()` and an event bus. Test asserts that fast-forwarding from 1977 to 2030 fires all milestone events in correct sequence.

#### Layer 6: Performance regression (deferred to v2)

Add a `/perf` route that auto-runs a representative camera path and records P95 metrics. Assert `interpP95 < 1 ms`, `frameP95 < 16 ms`. Only meaningful on a fixed CI environment; run nightly, not per-PR.

#### Kernel pinning & drift detection

- Commit `kernels-manifest.json` with SHA-256 of each kernel
- Python build verifies hashes before bake
- When intentionally updating: rerun bake with old + new kernels, diff sample positions, accept if `max_drift_km <= 5`, document in changelog
- _Why this matters:_ NAIF occasionally releases refined Voyager kernels; silent drift would invalidate your visual regression baselines

### CI Pipeline (GitHub Actions sketch)

```yaml
name: CI
on: [push, pull_request]

jobs:
  lint-and-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm test

  spice-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true }  # if kernels are in LFS
      - uses: actions/setup-python@v5
        with: { python-version: '3.13' }
      - run: pip install uv && uv pip install -r tools/requirements.txt
      - run: python tools/verify_kernels.py
      - run: python tools/validate_interpolation.py
      - run: python tools/generate_spice_samples.py --out ground_truth.json
      - uses: actions/upload-artifact@v4
        with: { name: spice-ground-truth, path: ground_truth.json }

  spice-consistency:
    runs-on: ubuntu-latest
    needs: spice-validation
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with: { name: spice-ground-truth, path: ./artifacts }
      - run: npm run test:spice-consistency

  e2e:
    runs-on: ubuntu-latest
    needs: spice-consistency
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run preview -- --port=4173 &
      - run: npx wait-on http://127.0.0.1:4173
      - run: npx playwright test --project=chromium
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }
```

Total CI runtime should be **<5 minutes** for the MVP suite. Add Firefox/WebKit projects in v2 when the visual baselines are stable enough not to false-positive.

### Performance Budget

For a 60 FPS render loop (16.7 ms total per frame), realistic budget:

| Cost | Target | Notes |
|---|---|---|
| Trajectory interpolation (12 bodies × Hermite) | **<1 ms** | trivial unless something's wrong |
| Frame-of-reference transforms + floating-origin recenter | <1 ms | matrix multiplies |
| Scene graph update (positions, attitudes) | <2 ms | |
| Three.js draw call submission | 1–3 ms | depends on # objects, materials |
| GPU work (rasterize, shade) | 4–10 ms | dominant cost; mostly fixed for this scene |
| Headroom | 1–3 ms | absorbs spikes |

**Web Worker tradeoff:** structured-clone cost across the boundary is 0.1–0.5 ms per message regardless of payload. Interpolation work itself is sub-ms. **Not worth a Worker unless P95 exceeds ~3 ms consistently.** Measure first; default to main-thread.

_Confidence: High._ This sim is GPU-bound (texture upload, draw calls), not CPU-bound.

### Risk Register

Project-specific risks ranked by impact × likelihood:

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **NASA kernel updates silently shift positions** by km-scale | Medium | High (invalidates visual baselines + tests) | Hash-pin kernels; explicit upgrade flow with drift report |
| R2 | **CesiumJS WebGPU lag** vs Three.js — if you pick Cesium for ephemeris convenience, you're stuck on WebGL2 | Medium | Medium | Cesium WebGL2 is mature and fast for this scale; not a blocker |
| R3 | **3D asset licensing** — NASA models are public domain but check Sketchfab/third-party processors (Björn Jónsson textures may have attribution requirements) | Low | Medium | Audit each asset's license; cite in `THIRD_PARTY.md` |
| R4 | **Catmull-Rom in initial-research.md is wrong** — using it instead of Hermite degrades flyby accuracy | High (without this research) | Medium | Use Hermite (this report's Step 4) |
| R5 | **Float32 jitter from a subtle bug** in floating-origin math — easy to introduce when adding new objects | Medium | High (looks broken at zoom) | Type-distinguish `WorldVec3` (Float64) from `RenderVec3` (Float32) so the cast is explicit |
| R6 | **GLB asset bloat** — first paint >50 MB hurts mobile | Medium | Medium | Per Step 3 pipeline; KTX2 + LOD; CI check on bundle/asset size |
| R7 | **Time-warp at 1e9× breaks the chunk loader** — main thread starves waiting for the next decade | Low | Medium | Pre-fetch neighboring chunk in last 10% of current chunk; cap rate when chunks are loading |
| R8 | **Solo-dev burnout** — scope creep into "let me add Pioneer 10 too" | High | High | Stick to the phase plan; defer is the default |
| R9 | **CSPICE-in-WASM rabbit hole** — if you decide to support runtime SPICE queries, weeks disappear | Low (precompute path is clear) | High | Reject this path unless arbitrary ephemeris queries become a real product need |
| R10 | **Mobile WebGL2 device variability** — older Android can't handle 8k textures | Medium | Medium | 4k default + capability detection per Step 3 |

### Cost Analysis

For a single-developer hobby/portfolio deployment:

| Item | Cost | Notes |
|---|---|---|
| **Hosting (Cloudflare Pages free tier)** | $0/mo | 500 builds/mo, unlimited bandwidth on free tier |
| **Hosting (Vercel free tier)** | $0/mo | 100 GB/mo bandwidth; consider if traffic spikes |
| **Domain** | $10–15/year | optional |
| **GitHub Actions free tier** | $0/mo | 2,000 min/mo private; unlimited public |
| **CDN egress** at 10k unique visitors/month × 35 MB | ~350 GB | well within free tiers |
| **Perplexity / research tooling** | Already in use | for development only |
| **3D / texture assets** | $0 | NASA/USGS/Björn Jónsson (public/permissive) |
| **NAIF kernels** | $0 | NASA public |
| **Total ongoing** | **$0–15/year** | basically free |

If the project ever serves >1M MAU, Cloudflare Workers or paid Vercel runs ~$20/mo. Not a near-term concern.

### Team / Skill Requirements

For a solo developer to ship Phases 0–3, expected skill profile:

- **TypeScript proficiency** — required (the whole app is TS)
- **Three.js** — moderate; will need to learn `KTX2Loader`, `MeshoptDecoder`, `WebGLRenderer` advanced flags
- **Python** — basic; just enough for the build-script side (SpiceyPy is well-documented)
- **WebGL / linear algebra** — light; vector/matrix intuition, ideally one prior 3D project
- **Astrodynamics** — none required at the level of writing integrators; **read** the SPICE Required Reading and NAIF tutorials (a weekend)
- **CI / Playwright** — moderate; standard modern web dev
- **No Rust required** unless Phase 4 is pursued

This profile fits a mid-to-senior generalist web developer with a hobby interest in space. **It does not require a flight-dynamics engineer.** _Confidence: High._

### Technology Adoption / Migration Strategy

This is a greenfield project — no migration. But two adoption-style decisions deserve flagging:

1. **WebGL → WebGPU migration**: build on Three.js `WebGLRenderer` with reverse-Z today. Watch the Three.js `WebGPURenderer` reverse-Z issue; migrate when it lands (likely 2026–2027). The renderer choice is a single line of code; the rest of the app is renderer-agnostic if you stick to the `Mesh` / `Material` API.

2. **TS → Rust/WASM physics core**: build the `EphemerisService.getStateAt(bodyId, t)` interface so it's swappable. Defer the WASM port until/unless the main thread budget is exceeded. The Step 3 inter-component contract is designed for exactly this seam.

---

**Step 5 confidence summary:**

- **High confidence:** phased roadmap, repo structure, CI sketch, performance budget, cost estimates
- **High confidence:** validation strategy — the 6-layer test pyramid is overkill for v1; the minimum viable suite (numerical Python validation + JS-vs-SPICE consistency + 3 visual snapshots + 1 timeline test) is sufficient
- **Medium confidence:** timeline (5–8 weeks for Phases 0–3) — depends on developer's Three.js familiarity and how much UI polish is desired
- **Risk awareness:** R8 (scope creep) is the actual most-likely project killer for a solo dev; the technical risks are all bounded

---

## Research Synthesis

### Executive Summary

The Voyager simulator is **feasible as proposed** in [initial-research.md](initial-research.md), with four substantive corrections and a sharper roadmap. The core architecture — Python build-time SPICE precomputation, brotli-compressed binary trajectories on a CDN, Three.js + floating-origin + reverse-Z in the browser — is the right shape for May 2026 and will run on any modern desktop or mobile browser without server infrastructure or WebAssembly heroics.

The dominant integration is **build-time, not runtime**. SpiceyPy (v8.1.0, April 2026) extracts daily state vectors for both probes and major bodies in seconds; the output is a sub-30 MB gzipped asset bundle. Cubic Hermite interpolation in TypeScript reconstructs the trajectory at any time, exactly matching SPICE at every knot because we ship both position and velocity. A floating-origin WorldGroup centered every frame keeps GPU coordinates in a Float32-safe range, and reverse-Z depth (Three.js WebGLRenderer-supported, with a `webgl_reversed_depth_buffer.html` demo) gives sub-millimeter precision at meter scale even with the far plane at Voyager 1's actual 165 AU distance.

The technology landscape has consolidated in your favor since 2024: **WebGPU is mainstream** (all four major browsers, Three.js zero-config), **`EXT_meshopt_compression` has overtaken Draco** for new projects, **ANISE has reached TRL 9** as a Rust-native SPICE replacement (used on Firefly's Blue Ghost lunar lander in 2025), and **hapsira has succeeded the archived poliastro**. None of these is strictly required — the precompute path is so undemanding that you could ship using only SpiceyPy and Three.js — but they widen the option space if you want to experiment.

**Key Technical Findings:**

- **Pre-compute SPICE; don't ship CSPICE to the browser.** `jsSpice` is dormant, no canonical CSPICE-to-WASM port exists, and the runtime savings don't exist for a fixed historical mission. The build step is fast and the runtime payload is tiny.
- **Cubic Hermite > Catmull-Rom** for trajectory interpolation. SPICE provides velocity at every sample; Catmull-Rom throws it away. Same cost, materially better mid-segment accuracy during flybys. _This is the single most important correction to [initial-research.md](initial-research.md)._
- **Reverse-Z depth > logarithmic depth** in 2026, with the caveat that Three.js currently only supports it in WebGLRenderer. Start there; migrate to WebGPURenderer when reverse-Z lands (active issue, likely 2026–2027).
- **The runtime binary format is a 40-byte fixed-step header + raw little-endian Float64Array.** Self-describing formats (MessagePack, Protobuf, Arrow) add parse overhead and bundle weight for no benefit at this scale. Time is implicit (`t = t0 + dt*i`), saving 50% of bytes.
- **Asset compression in 2026 is `EXT_meshopt_compression` + KTX2 ETC1S/UASTC.** Smaller decoder, lower CPU, fully supported in Three.js and CesiumJS.
- **CesiumJS is the only engine with built-in astronomical-scale precision and time-dynamic ephemeris**, but its WebGPU migration is still in research as of May 2026. Three.js + manual floating-origin is a well-trodden path and probably the right call for this project's scope.
- **Multi-decade simulation does not require a physics engine.** The closed-form Hermite evaluation `getStateAt(t)` is all that's needed; 1× and 1e9× time-warp are equally easy.
- **The project is solo-buildable in 5–8 weeks for $0–15/year.** No infrastructure, no paid services, no flight-dynamics expertise.

### Top Recommendations (handoff package for a coding agent)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Runtime language | **TypeScript 5.x strict** | Float64 is native; vast ecosystem; the type system can branded-distinguish `WorldVec3` (Float64) from `RenderVec3` (Float32) to prevent precision bugs |
| 2 | Build-time language | **Python 3.13 + SpiceyPy 8.1.0** | Mature SPICE binding; vectorized bulk extraction; uv + Ruff toolchain |
| 3 | 3D engine | **Three.js (WebGLRenderer)** | Reverse-Z support today; migrate to WebGPURenderer when it gains reverse-Z |
| 4 | Trajectory interpolation | **Cubic Hermite** (not Catmull-Rom) | Uses SPICE velocity data; exact at knots; same cost as Catmull-Rom |
| 5 | Depth precision strategy | **Reverse-Z** (float depth, flipped compare) | Sub-mm at 10 m even with far=165 AU; preserves early-Z |
| 6 | World-frame storage | **Single canonical heliocentric J2000 (Float64)** | One source of truth; SPICE provides frame transforms cheaply |
| 7 | View-frame strategy | **Smooth blended (smoothstep over ±2 days) during encounters** | Cinematic; no pops; physically anchored |
| 8 | Spacecraft model | **NASA 3D Resources → gltf-transform meshopt + KTX2 UASTC** | Open, optimized, ~3–5 MB compressed per LOD |
| 9 | Planet textures | **USGS / Björn Jónsson → KTX2 ETC1S, 4k default + 8k lazy-upgrade** | Public-domain or attribution-friendly; tier swap on SOI entry |
| 10 | Trajectory format | **Custom 40-byte header + raw little-endian Float64Array, brotli at build** | Smallest payload, ~1 ms parse, zero bundle overhead |
| 11 | Chunking | **Per-decade files + manifest.json + encounter overlays** | Time-jump latency stays sub-second |
| 12 | Mesh compression | **`EXT_meshopt_compression`** (not Draco) | Smaller decoder, faster, better streaming |
| 13 | UI / Component framework | **React (optional) or vanilla TS** | Three.js scene + HTML overlay; React is convenient but optional |
| 14 | Bundler / Tooling | **Vite** | 2026 default; native ESM and TS |
| 15 | Hosting | **Cloudflare Pages or Vercel free tier** | Static + global CDN + immutable caching |
| 16 | Testing | **Vitest + Playwright + custom Python SPICE-consistency harness** | 6-layer pyramid; MVP suite is 4 layers in <5 min CI |
| 17 | Kernel pinning | **SHA-256 manifest + drift report on update** | Prevents silent ephemeris regressions |
| 18 | Web Worker offload | **No** | Sub-1ms interpolation; structured-clone cost dominates |
| 19 | Rust/WASM physics core | **Defer** to Phase 4; build `EphemerisService` interface as the swap seam | Premature; main thread has ample headroom |
| 20 | WebGPU migration | **Defer** until Three.js WebGPURenderer adds reverse-Z | Single-line change later; not blocking now |

### Corrections to initial-research.md

The foundation document is mostly correct. The five places this report changes its recommendation:

1. **Interpolation choice.** initial-research.md recommends `THREE.CatmullRomCurve3` with tension 0.5. **Replace with cubic Hermite using SPICE-provided velocities.** See Step 4, Pattern 4.
2. **Depth-buffer strategy.** initial-research.md recommends `logarithmicDepthBuffer: true` as "non-negotiable." **Prefer reverse-Z** on WebGLRenderer; fall back to logarithmic only on WebGPURenderer where reverse-Z isn't yet supported. See Step 4, Pattern 2.
3. **Mesh compression.** initial-research.md mentions `.glb` Draco-compressed by implication. **Prefer `EXT_meshopt_compression`** in 2026. See Step 3.
4. **Runtime data format.** initial-research.md describes "compress into a single clean JSON binary or CSV file." **Use a custom 40-byte header + Float64Array binary** — JSON parse cost is unjustified at this scale, CSV worse. See Step 3.
5. **Live API runtime calls.** initial-research.md correctly warns "Do not try to make live API calls to JPL Horizons." **Confirmed**, and extend the rule to all runtime SPICE: CSPICE-in-WASM is also a trap unless arbitrary ephemeris queries are a feature goal. See Step 3.

### Consolidated Implementation Roadmap

Detailed in Step 5; summarized:

- **Phase 0** (1–2 days) — spike: SpiceyPy → Three.js precision sanity check
- **Phase 1** (1–2 weeks) — MVP cruise viewer, Voyager 1 + planets, deployable
- **Phase 2** (2–3 weeks) — encounters, V2, blended view frames, real textures
- **Phase 3** (1–2 weeks) — polish, interstellar phase, HUD, accessibility
- **Phase 4** (deferred) — Rust/WASM, WebGPU, scope expansion

### Open Questions / Items for Validation During Build

These the report did not fully resolve; flag during Phase 0–1 to nail down with real measurements:

1. **Exact sampling cadence per phase.** Step 4 suggested 1-day cruise, 1-hour approach, 1-min flyby, 10-sec C/A. The Python interpolation-error validation (Step 5, Layer 1) will tell you the true minimum that meets the 20 km / 5 km tolerance.
2. **Whether the smooth-blended view frame should also rotate** axes during encounters, or only translate. Step 4 recommends translation-only; revisit if Jupiter's equator orientation feels off.
3. **8k texture memory budget on mobile.** Step 3 caps default at 4k; verify Pixel 8 / iPhone 14 can handle the 8k Jupiter texture on close approach without crashing.
4. **Voyager 1 attitude / CK kernels.** This report focused on trajectory (SPK); attitude reconstruction from CK kernels for instrument-pointing visualization is a separate concern. Defer to Phase 3 if desired.
5. **DSN-live current position overlay** — the NASA Eyes-on internal endpoint stability is uncertain. Treat as best-effort feature.

### Source Bibliography (verified live, May 2026)

**SPICE / ephemeris:**

- [SpiceyPy on GitHub](https://github.com/AndrewAnnex/SpiceyPy) — v8.1.0 released 2026-04-05
- [SpiceyPy CHANGELOG](https://github.com/AndrewAnnex/SpiceyPy/blob/main/CHANGELOG.md)
- [ANISE on Nyx Space](https://nyxspace.com/anise/) — TRL 9
- [ANISE on GitHub](https://github.com/nyx-space/anise)
- [ANISE on crates.io](https://crates.io/crates/anise) · [ANISE on PyPI](https://pypi.org/project/anise/) · [Rust docs](https://docs.rs/anise/latest/anise/)

**Astrodynamics libraries:**

- [Orekit](https://www.orekit.org/) — 13.1.5 released 2026-05-02
- [REBOUND on GitHub](https://github.com/hannorein/rebound) · [ASSIST on PyPI](https://pypi.org/project/assist/)
- [heyoka.py docs 7.x](https://bluescarni.github.io/heyoka.py/)
- [heyoka on GitHub](https://github.com/bluescarni/heyoka) · [heyoka.py on GitHub](https://github.com/bluescarni/heyoka.py)

**Web 3D engines:**

- [Three.js releases](https://github.com/mrdoob/three.js/releases) — r170+ with WebGPURenderer
- [Three.js r170 release notes](https://github.com/mrdoob/three.js/releases/tag/r170)
- [Three.js reverse-Z demo](https://threejs.org/examples/webgl_reversed_depth_buffer.html)
- [Three.js forum: WebGPU reverse-Z status](https://discourse.threejs.org/t/does-three-js-webgpu-support-reverse-z-buffer/87687)
- [Three.js forum: logDepth performance gotcha](https://discourse.threejs.org/t/beware-of-logarithmic-depth-buffer-it-can-degrade-scene-performance/88495/10)
- [Babylon.js 9.0 announcement (2026-03-26)](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/)
- [Babylon.js 8.0 announcement (2025-03)](https://blogs.windows.com/windowsdeveloper/2025/03/27/announcing-babylon-js-8-0/)
- [Babylon.js WebGPU docs](https://doc.babylonjs.com/setup/support/webGPU)
- [CesiumJS platform](https://cesium.com/platform/cesiumjs/) · [CesiumJS releases](https://github.com/CesiumGS/cesium/releases) — 1.141 released 2026-05-01
- [Cesium WebGPU community thread](https://community.cesium.com/t/is-there-a-plan-to-support-webgpu/23381)
- [WebGPU baseline 2026 article](https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default)

**Asset pipeline:**

- [Three.js GLTFLoader docs](https://threejs.org/docs/pages/GLTFLoader.html)
- [Three.js compression sample repo](https://github.com/klich3/threejs-gltf-with-compressions-sample)
- [Three.js 100 best-practices 2026](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [Three.js WebGPU migration guide 2026](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)

**Native engines:**

- [Unreal Engine Large World Coordinates docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/large-world-coordinates-in-unreal-engine-5)

**Initial research foundation:**

- [initial-research.md](initial-research.md) (in this repo) — the document this report builds on and corrects in five places

### Confidence Summary

| Topic | Confidence | Validation path if uncertain |
|---|---|---|
| SpiceyPy / ANISE precompute pipeline feasibility | **High** | Phase 0 spike |
| Binary format choice (custom Float64) | **High** | Vitest parse-time benchmark in Phase 1 |
| Floating-origin + reverse-Z gives sub-mm precision | **High** | Phase 0 visual spike with cube at 10 m, far=165 AU |
| Cubic Hermite vs Catmull-Rom advantage | **High** | Layer 1 Python validation (Step 5) — measure RMS error reduction |
| `EXT_meshopt_compression` > Draco | **High** | Asset pipeline test in Phase 2 |
| 5–8 week solo timeline | **Medium** | Depends on developer's Three.js familiarity |
| 8k textures viable on Pixel 8 / iPhone | **Medium** | Mobile device test in Phase 2 |
| ANISE-to-WASM browser maturity | **Medium** | Not needed unless replacing SpiceyPy with browser-native ANISE |
| Three.js WebGPURenderer reverse-Z timeline | **Low** | Track upstream issue; not blocking |
| Blend-window sizing (±2 days) for encounters | **Medium** | Visual tuning in Phase 2 |
| NASA Eyes-on internal API stability | **Low** | Treat as best-effort optional feature |

### Methodology Note

This research combined live web search (which produced verified 2026 version data) with Perplexity's `reason` and `search` MCP models (which produced strong analytical content but with citation lists that were consistently irrelevant — almost certainly a quirk of the Sonar Pro / Sonar Reasoning Pro retrieval at the time of this work). The technical content from Perplexity was treated as expert opinion subject to spot-checks against live web sources, not as freshly-sourced research. All version numbers, release dates, and feature-support claims in this report were independently verified via WebSearch on 2026-05-16. Reasoning about patterns (interpolation choice, depth strategy, frame transitions, etc.) was cross-checked against the Three.js forums, NAIF documentation, and the cited GitHub repos.

---

**Research Completion Date:** 2026-05-16
**Document Length:** ~1,400 lines / ~85 KB
**Source Verification:** All live web results citation-linked; expert-opinion content flagged as such
**Confidence Level:** High on architecture, medium on timeline, low on a few future-looking items (all flagged above)

_This document is the technical companion to [initial-research.md](initial-research.md) and is suitable for handing to a coding agent or yourself as the implementation plan for a browser-based Voyager mission simulator._

---

## Scope Addendum (2026-05-16): Attitude / CK Kernel Integration

> Added after the synthesis at the user's request. Brings spacecraft attitude (instrument pointing, scan platform articulation) into v1 scope so the simulator can show **what Voyager was looking at**, not just where Voyager was.

### What this unlocks

- **Instrument boresight cones** projecting from the spacecraft toward Io / Europa / Titan / Triton during flybys
- **Scan platform articulation** during imaging sequences (the 96-second time-lapse cadence at Jupiter)
- **"What did the camera see?"** — reconstruct the ISS field of view at any historical moment within an encounter
- **Pale Blue Dot reconstruction** — Voyager 1 rotating to image Earth from 40 AU on 1990-02-14
- **High-gain antenna pointing** during cruise (Earth-tracking attitude)
- **Spacecraft visual orientation** — accurate model rotation rather than a static pose

### Available CK data (verified live, NAIF FTP 2026-05-16)

Source: `https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/ck/`

| File | Spacecraft | Coverage | Size | Last update |
|---|---|---|---|---|
| `vg1_jup_qmw_na.bc` | Voyager 1 | Jupiter, narrow-angle camera | 547 KB | 2012-02-14 |
| `vg1_jup_qmw_wa.bc` | Voyager 1 | Jupiter, wide-angle camera | 160 KB | 2012-02-14 |
| `vg1_sat_qmw_na.bc` | Voyager 1 | Saturn, narrow-angle camera | 452 KB | 2012-02-14 |
| `vg1_sat_qmw_wa.bc` | Voyager 1 | Saturn, wide-angle camera | 227 KB | 2012-02-14 |
| **`vgr1_super_v2.bc`** | **Voyager 1** | **Consolidated (likely all encounter windows + some)** | **17 MB** | **2015-11-17** |
| `vg2_jup_qmw_na.bc` | Voyager 2 | Jupiter, narrow-angle | 460 KB | 2012-02-14 |
| `vg2_jup_qmw_wa.bc` | Voyager 2 | Jupiter, wide-angle | 127 KB | 2012-02-14 |
| `vg2_sat_qmw_na.bc` | Voyager 2 | Saturn, narrow-angle | 390 KB | 2012-02-14 |
| `vg2_sat_qmw_wa.bc` | Voyager 2 | Saturn, wide-angle | 130 KB | 2012-02-14 |
| **`vgr2_super_v2.bc`** | **Voyager 2** | **Consolidated (all 4 encounters likely)** | **31 MB** | **2015-11-17** |

**Total raw:** ~50 MB across both spacecraft. **Brotli-compressed for browser delivery:** likely ~15–25 MB.

**Provenance note:** The `qmw_` CKs were produced by Mitch Gordan (Queen Mary and Westfield College) from Voyager Supplemental Experiment Data Record (SEDR) files. **Pointing accuracy: ~0.05° (1 milliradian, ~100 narrow-angle pixels)** — more than fine for visualization, where 0.1° errors are imperceptible.

**Important:** NAIF itself is no longer maintaining Voyager CKs. The **PDS Rings Node at SETI** ([pds-rings.seti.org/voyager/spice/ck.html](https://pds-rings.seti.org/voyager/spice/ck.html)) hosts additional/newer Voyager CK products. **Phase 0 action:** check the Rings Node directory and prefer their versions if they extend coverage beyond NAIF's.

### Coverage strategy: encounter-windowed CK + synthesized cruise

CK data is **not continuous** across the 47-year mission. The architecture splits into two regimes:

| Time range | Attitude source | Confidence |
|---|---|---|
| **Encounter windows** (days around each flyby) | NAIF / PDS Rings CK kernels (real, reconstructed from SEDR) | High |
| **Cruise** (between encounters, post-Neptune, interstellar) | **Synthesized:** Earth-pointing high-gain antenna attitude derived from SPK | Medium (geometrically correct but not telemetry-verified) |
| **Pale Blue Dot** (1990-02-14, V1) | Check `vgr1_super_v2.bc` first; synthesize from known imaging targets if not covered | Medium |
| **Plasma roll maneuvers** during cruise | Likely not in CK; if needed, hand-build from mission documentation | Low (deferred — not v1 critical) |

#### Cruise attitude synthesis

The HGA must point at Earth for telemetry. Voyager has a defined HGA boresight direction in the spacecraft body frame (from the FK kernel). To synthesize cruise attitude:

```typescript
function synthesizeCruiseAttitude(et: number): Quaternion {
  // 1. Get the Voyager → Earth vector in J2000
  const voyager = ephemeris.getStateJ2000(VOYAGER_ID, et);
  const earth = ephemeris.getStateJ2000(EARTH_ID, et);
  const toEarth = normalize({
    x: earth.x - voyager.x,
    y: earth.y - voyager.y,
    z: earth.z - voyager.z,
  });

  // 2. HGA boresight in spacecraft body frame (from FK kernel; e.g., +Z axis)
  const hgaBody = { x: 0, y: 0, z: 1 };

  // 3. Quaternion that rotates hgaBody → toEarth
  return quaternionFromVectors(hgaBody, toEarth);
}
```

Roll about the HGA axis is unconstrained by this model. For visualization, freeze it or apply a slow roll rate from documentation — purely cosmetic.

### Architectural impact: two dynamic frames per spacecraft

Each Voyager carries **two articulated reference frames**:

```text
J2000 (inertial)
   │
   │ CK kernel: spacecraft bus attitude (q_bus)
   ▼
SC_BUS (Voyager body frame)
   │
   │ CK kernel: scan platform articulation (q_platform_rel_bus)
   ▼
SCAN_PLATFORM
   │
   │ FK / IK: fixed offsets per instrument
   ▼
NARROW_ANGLE_CAMERA  WIDE_ANGLE_CAMERA  IRIS  UVS  …
```

The scan platform is articulated **relative to the bus** (the bus is mostly Earth-pointing during imaging; the platform slews to track moving targets). Instrument boresights are then fixed offsets from the platform.

The renderer needs to compose: `q_world(t) = q_bus(t) * q_platform_rel_bus(t) * q_instrument_fixed`.

### Runtime data format extension

Add a parallel attitude stream alongside the trajectory stream. Two options:

**Option A: separate attitude binary files** (recommended)

```text
v1_v1_attitude_jupiter_1979.bin.br    — bus quaternions, 1-sec cadence, Jupiter encounter
v1_v1_platform_jupiter_1979.bin.br    — scan platform quaternions, 1-sec cadence
```

Format mirrors the trajectory binary but with quaternions:

```text
Header (40 bytes, same VTRJ layout but:)
  componentsPerSample = 4   (qw, qx, qy, qz)
  bodyId             = VOYAGER1_BUS or VOYAGER1_PLATFORM

Data: numSamples × 4 × float64 (quaternion components)
```

**Option B: unified state file with extended record layout** — rejected; loading entire mission attitude when you only care about one encounter wastes memory.

**Total payload addition: ~15–25 MB compressed**, lazy-loaded per encounter (only ship the file for the encounter currently in view). Compatible with the existing manifest schema; add an `attitude` block per encounter:

```json
{
  "voyager1": {
    "naifId": -31,
    "trajectory": { "chunks": [ ... ] },
    "attitude": {
      "encounters": {
        "jupiter_1979": {
          "tStart": "1979-02-15T00:00:00Z", "tEnd": "1979-04-15T00:00:00Z",
          "bus":      { "url": "/data/v1_bus_jupiter.bin",      "stepSec": 1 },
          "platform": { "url": "/data/v1_platform_jupiter.bin", "stepSec": 1 }
        }
      },
      "cruiseStrategy": "synthesize-earth-pointing"
    }
  }
}
```

### Interpolation: SLERP for quaternions

Unlike positions (Hermite), quaternions need **spherical linear interpolation** between samples:

```typescript
function slerp(q0: Quat, q1: Quat, t: number): Quat {
  let dot = q0.w*q1.w + q0.x*q1.x + q0.y*q1.y + q0.z*q1.z;
  // Take shortest path
  if (dot < 0) { q1 = { w: -q1.w, x: -q1.x, y: -q1.y, z: -q1.z }; dot = -dot; }
  if (dot > 0.9995) {
    // Near-parallel: linear interp + normalize
    return normalizeQuat({
      w: q0.w + t*(q1.w - q0.w), x: q0.x + t*(q1.x - q0.x),
      y: q0.y + t*(q1.y - q0.y), z: q0.z + t*(q1.z - q0.z),
    });
  }
  const theta = Math.acos(dot);
  const s0 = Math.sin((1 - t) * theta) / Math.sin(theta);
  const s1 = Math.sin(t * theta) / Math.sin(theta);
  return {
    w: s0*q0.w + s1*q1.w, x: s0*q0.x + s1*q1.x,
    y: s0*q0.y + s1*q1.y, z: s0*q0.z + s1*q1.z,
  };
}
```

Three.js already provides `THREE.Quaternion.slerp` and `THREE.Quaternion.slerpFlat` — use them rather than rolling your own.

For SPICE-grade accuracy you could use SQUAD (spherical cubic interpolation) which is C¹ continuous, but SLERP is fine for visualization at 1-sec CK cadence — discontinuities in angular velocity at knots are imperceptible.

### Build pipeline extension

Add to `tools/extract_trajectory.py` (or a sibling script):

```python
import spiceypy as sp

def extract_attitude(spacecraft_id: int, frame: str,
                     et_start: float, et_end: float, step: float,
                     out_path: str):
    """Extract quaternion stream from a CK kernel.

    spacecraft_id : NAIF ID (e.g., -31000 for Voyager 1 bus)
    frame : reference frame (typically 'J2000')
    """
    n_samples = int((et_end - et_start) / step) + 1
    ets = [et_start + i * step for i in range(n_samples)]
    quats = []
    for et in ets:
        # ckgp returns a rotation matrix; convert to quaternion
        mat, _ = sp.ckgp(spacecraft_id, et * sp.spd(), 1.0, frame)  # tolerance ~1 sec
        # OR use pxform if attitude is referenced via a defined frame
        quats.append(matrix_to_quaternion(mat))

    pack_binary(out_path, et_start, step, quats, body_id=spacecraft_id,
                components_per_sample=4)
```

NAIF IDs for Voyager attitude frames are defined in the FK kernel (`vg1_v02.tf`, `vg2_v02.tf` on NAIF). Phase 0 action: inventory the frame IDs from the FK kernel and document them in `kernels/frame-ids.md`.

### Use-case implementation sketches

#### Instrument boresight cone (Three.js)

```typescript
// Per-frame, given current sim time et:
const qBus      = attitudeService.getBusQuat(VOYAGER1, et);     // J2000 → bus
const qPlatform = attitudeService.getPlatformQuat(VOYAGER1, et); // bus → platform
const qInstFixed = instrumentFrames.NARROW_ANGLE.fixedOffset;    // platform → camera

// Compose
const qWorld = qBus.clone().multiply(qPlatform).multiply(qInstFixed);

// Camera boresight is +Z in camera frame, transform to world
const boresightWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(qWorld);

// Render as a cone from the spacecraft, half-angle = FOV/2 (0.21° for NA, 1.59° for WA)
boresightCone.position.copy(voyagerWorldPos);
boresightCone.quaternion.copy(qWorld);
```

The half-angles are from the existing camera spec in [initial-research.md](initial-research.md): NA FOV 0.42°×0.42°, WA FOV 3.17°×3.17°.

#### Pale Blue Dot reconstruction

If `vgr1_super_v2.bc` covers 1990-02-14, use CK directly. If not, synthesize:

```typescript
// Aim the narrow-angle camera at each target body sequentially
for (const target of ['venus', 'earth', 'jupiter', 'saturn', 'uranus', 'neptune']) {
  const direction = directionFrom(voyagerPos, ephemeris.getStateJ2000(target, et));
  const qSynth = pointInstrumentAt(NARROW_ANGLE_CAMERA, direction);
  recordPaleBlueDotFrame(target, et, qSynth);
}
```

### Roadmap impact

CK integration adds **2–3 days of work in Phase 2** (encounter-window CKs) and another **1–2 days in Phase 3** (cruise synthesis + Pale Blue Dot):

- **Phase 2 (was 2–3 weeks, now 2.5–3.5 weeks):**
  - +Day 1: extend build script to extract CKs to attitude binaries
  - +Day 2: add `AttitudeService` and SLERP to the runtime; compose quaternion chain
  - +Day 3: visual: boresight cones, scan platform articulation on the Voyager model

- **Phase 3 (was 1–2 weeks, now ~2 weeks):**
  - +Day 1: cruise Earth-pointing attitude synthesis
  - +Day 2: Pale Blue Dot reconstruction (CK or synthesized)

**Revised total Phase 0–3 timeline: 6–9 weeks** (was 5–8).

### Risk register additions

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R11 | **CK coverage gap surprises** — `vgr*_super_v2.bc` may not cover Uranus/Neptune as cleanly as Jupiter/Saturn | Medium | Medium | Inventory with `ckbrief` in Phase 0; PDS Rings Node CKs as alternative; fall back to synthesis for any uncovered windows |
| R12 | **Voyager 3D model lacks articulated scan platform** — NASA OBJ may be a single rigid mesh | Medium | Medium | Inspect model in Blender during Phase 0; if monolithic, split the scan platform geometry into its own glTF node by hand (~half-day) |
| R13 | **Instrument frame IDs / FK kernel parsing complexity** — Voyager FK has many frames (15+ instruments) | Low | Low | Hardcode the 2–3 relevant frames (NA camera, WA camera) per use case; defer the rest |
| R14 | **Quaternion sign-flip artifacts** at knots if CK packs the "long way" | Low | Medium | Pre-process during bake: walk the quaternion array and flip any with `dot(q_prev, q_curr) < 0` |

### Confidence summary for the addition

| Item | Confidence |
|---|---|
| Encounter CK availability + coverage for Jupiter, Saturn, Uranus, Neptune | **High** (NAIF directory confirmed live) |
| Pointing accuracy ~0.05° sufficient for visualization | **High** (per NAIF / PDS Rings documentation) |
| `vgr1_super_v2.bc` covering Pale Blue Dot (1990-02-14) | **Medium** (need `ckbrief` inventory in Phase 0) |
| Cruise Earth-pointing synthesis approach | **High** (well-established SPICE pattern; just SPK + a vector-to-quaternion rotation) |
| 2–5 day Phase 2/3 effort estimate | **Medium** (assumes the Voyager glTF model splits cleanly; otherwise +1 day to rebuild scan platform articulation) |
| Total runtime payload ~15–25 MB additional | **High** (CK kernels are small; quaternion-per-second is 32 B; encounter windows are days, not years) |

### Updated executive verdict

The simulator now targets a more ambitious feature set: not just "where Voyager went" but **"where Voyager was looking."** The data is small (+15–25 MB compressed), the math is well-defined (SLERP + quaternion composition), and the build cost is modest (+2–5 days across Phases 2 and 3). **No change to overall feasibility or budget.** The cost-per-feature ratio here is excellent — attitude reconstruction is the kind of detail that makes the simulator feel "real" rather than diagrammatic.

---

## Competitive Landscape (added 2026-05-16)

> A focused 60-minute scan of what already exists in the space-simulator and mission-replay space, to ground product-brief decisions in real comparisons. Not a full market analysis — just enough to know where the gaps are and what UX patterns to borrow.

### The Eight Reference Products

| Product | URL | Platform | Cost | Voyager-relevant strength | Voyager-relevant weakness |
|---|---|---|---|---|---|
| **NASA Eyes on the Solar System** | [eyes.nasa.gov](https://eyes.nasa.gov) | Web (WebGL) | Free, official NASA/JPL | **Direct competitor.** Voyager 1 & 2 with full trajectories, time-scrub 1949→2049, "Voyager's Grand Tour" interactive journey, official data provenance | Voyager is one of many missions, not the focus. Attitude/instrument pointing is shallow. Heavy on desktop; mediocre on mobile. No continuous "watch the whole mission as a film" mode |
| **OpenSpace** | [openspaceproject.com](https://www.openspaceproject.com) | Desktop (Win/Mac/Linux), dome theaters | Free, open-source | Highest scientific fidelity. Direct SPICE/CK integration. Voyager well-supported. Used in planetarium shows | Desktop only — **no browser version.** Power-user UI. No turnkey "Voyager Mission Replay" experience |
| **Universe Sandbox** | [universesandbox.com](https://universesandbox.com) | Desktop, commercial | Paid | Excellent physics sandbox | **Not a Voyager tool.** No mission replay, no telemetry fidelity, no attitude |
| **Celestia** | [celestia.space](https://celestia.space) | Desktop, free OSS | Free | Voyager add-ons exist (community); good time control | Dated UI. Spacecraft are position-only; no attitude. No story mode |
| **Solar System Scope** | [solarsystemscope.com](https://www.solarsystemscope.com) | Web + mobile apps | Freemium | **Best mobile/web UX in the category.** Touch-friendly, lightweight | Voyager support is superficial (icons + paths, no mission depth). No event timeline |
| **SpaceEngine** | [spaceengine.org](https://spaceengine.org) | Windows, commercial | Paid | Gorgeous procedural visuals; Voyager present | Desktop-only, high spec. Not mission-focused. No narrative/timeline |
| **Stellarium Web** | [stellarium-web.org](https://stellarium-web.org) | Web + mobile | Freemium | Excellent web/mobile sky-observer UX | Sky-from-Earth focus; Voyager is not in scope |
| **JPL Voyager mission site** | [voyager.jpl.nasa.gov](https://voyager.jpl.nasa.gov) | Web | Free, official | Timeline data, "where are they now" counters, archival material | Static infographics + dials. **No 3D, no scrubbable replay** |

### One UX reference outside the category worth studying

**Apollo in Real Time** ([apolloinrealtime.org](https://apolloinrealtime.org)) — not a space sim at all, but the gold standard for "watch a historical mission unfold with a scrubbable timeline." Syncs audio, video, transcripts, and telemetry to mission-elapsed time. Strongly narrative; everything anchors to a single coherent time axis. **Lesson to steal:** treat time as the primary navigation axis, not a side control.

### Where the gaps are

Four gaps appear consistently across all eight products:

1. **No browser-based, Voyager-exclusive, end-to-end mission replay exists.** NASA Eyes is the closest, but Voyager is just one of dozens of missions and isn't the design focus. Everyone else is either desktop-only (OpenSpace, Celestia, SpaceEngine), not Voyager (Universe Sandbox, Solar System Scope, Stellarium), or static (JPL site).

2. **Attitude and instrument-pointing visualization is universally weak.** Even OpenSpace requires scripting for it; NASA Eyes only does it for a handful of missions. Showing **where Voyager was looking** — which is what makes the Pale Blue Dot, the Io volcanoes, the Titan haze, and Neptune's Great Dark Spot meaningful — is an open lane.

3. **No product nails the "Apollo in Real Time" pattern for Voyager.** The closest is NASA Eyes' "Grand Tour" interactive journey, but it's a curated tour, not a true scrubbable timeline with chapters and inline annotation of science results.

4. **The mobile-friendly + portfolio-polish quadrant is empty.** Solar System Scope is web/mobile but shallow on Voyager content. Eyes is web but heavy. Everyone else is desktop. A clean, fast, touch-first Voyager experience would stand out.

### Differentiation opportunities

**Strong (solo-dev achievable):**

1. **Voyager-exclusive, end-to-end timeline.** A single continuous replay from launch to interstellar, with chapter markers (launch, TCMs, gravity assists, discoveries, heliopause crossings) and a multi-scale time axis that handles 1× through 1e9× cleanly. NASA Eyes doesn't structure Voyager as a film; that's the lane.
2. **Attitude / instrument boresight as a first-class feature.** Camera FOVs aimed at Io, Europa, Titan, Triton during each flyby; the Earth-pointing HGA during cruise; the slow turn for the Pale Blue Dot in 1990. Per the Scope Addendum, this is now in v1 scope and the data exists.
3. **Browser-first, mobile-considered, portfolio polish.** Beat NASA Eyes on mobile UX; beat OpenSpace on accessibility; bring Solar System Scope's lightness to a fidelity-first product.

**Contingent (only if scope expands beyond v1):**

1. **Documentary mode vs. Cinematic mode toggle.** Explicit transparency about what's real vs. illustrative. Not present in any current product.
2. **Layered data depth.** Engineering view (DSN contacts, data rates, power degradation), Science view (image plates by date, magnetometer/cosmic-ray plots).

### What this implies for the product brief

- **The niche is real.** Every existing product is either too broad (Eyes, OpenSpace), too shallow (Solar System Scope), or static (JPL site).
- **NASA Eyes sets the credibility floor.** Anything shallower than Eyes' current Voyager support won't differentiate. Matching its depth + adding the attitude layer + adding a true scrubbable narrative + great mobile = a recognizably better product.
- **The "Apollo in Real Time" UX pattern is the strongest steal.** Frame it as "this is a film with controls," not "this is a 3D sandbox with a time slider."
- **Likely audience:** space-enthusiast adults + science educators + curious students. Not the planetarium audience (OpenSpace owns that), not the casual-mobile-app audience (Solar System Scope), not the physics-gamer audience (Universe Sandbox). The brief should target the **"I want to actually understand Voyager and be moved by it"** audience.

