# ADR 0006 — EXT_meshopt_compression over Draco

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. GLB mesh assets (Voyager spacecraft model + any future 3D assets) use the `EXT_meshopt_compression` glTF extension. Draco compression is explicitly rejected for this project.

## Context

The Voyager 3D model (NASA 3D Resources) ships as raw OBJ/3DS and must be optimized for browser delivery. First-paint asset budget is ≤35 MB compressed (NFR-P4); full bundle ≤150 MB compressed (NFR-P5). Mesh compression also affects parse and GPU upload cost on lower-end devices.

Two mature options exist in 2026: Draco (Google, older) and `EXT_meshopt_compression` (Arseny Kapoulkine / meshoptimizer, newer). The technical research's asset-pipeline analysis directly compared them.

[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#3D-Asset-Pipeline]
[Source: _bmad-output/planning-artifacts/architecture.md#Category-9-Asset-Pipeline]

## Decision

Use the **`EXT_meshopt_compression` glTF extension** for all GLB assets. Pipeline:

1. NASA OBJ → Blender headless → clean GLB (one-time per asset)
2. `gltf-transform meshopt` → compressed GLB
3. `toktx` → KTX2 textures (UASTC for hero, ETC1S for planets/skybox) — see ADR 0009 of UX spec terminology
4. Content-hashed filename + `Cache-Control: public, max-age=31536000, immutable`

**Story 4.3 amendment (2026-05-23, per voyager-skill-rules.md Rule 5):** the gas-giant 4K and outer-moon 2K KTX2 tiers shipped by Story 4.3 use **UASTC** for ALL textures — not ETC1S for the planet/moon tier as Decision step 3 originally specified. The rationale:

- The Story 4.3 KTX2 tier is the **SOI-entry upgrade** target (the cruise default is the Story 1.13 2K PNG, which remains unchanged). When the runtime loads the higher-tier KTX2 it is a "hero asset" for the active encounter — the visible texture for the gas giant a user is currently looking at, magnified to fill the viewport. ETC1S's lower fidelity is appropriate for cruise/background surfaces; UASTC's higher fidelity is appropriate for hero zoom.
- The bundle-budget impact is well under NFR-P5 (≤ 150 MB total): the 4 gas-giant 4K UASTC tier is ~10.6 MB and the 12 moon 2K UASTC tier is ~16.9 MB. Aggregate ~27.5 MB — leaves ~120 MB of headroom for future tiers.
- The cruise/background tier IS the 2K PNG (Story 1.13) — UASTC vs ETC1S only applies to the KTX2 upgrade tier. Decision step 3's "planets/skybox = ETC1S" guidance maps cleanly to the cruise 2K PNG (which is uncompressed-by-PNG, not by Basis at all) and remains correct for any future cruise-tier KTX2 conversion.

The amended Decision step 3 reading is: "UASTC for hero AND for SOI-entry/upgrade planet textures; ETC1S for cruise/background tier when Basis-encoded." A future story that introduces a cruise-tier KTX2 (e.g. swapping Story 1.13's PNGs for ETC1S KTX2 in a perf-pass) should follow Decision step 3 with the cruise-tier classification.

Three.js consumes the compressed GLB via `GLTFLoader` with `MeshoptDecoder` registered.

## Consequences

**Positive:**
- Smaller decoder (~30 KB vs Draco's ~200 KB), so the JS bundle penalty is lower.
- Faster decompression on the CPU; better streaming behavior.
- Fully supported in Three.js and CesiumJS as of 2026.
- `gltf-transform`'s CLI ergonomics are excellent — `gltf-transform meshopt input.glb output.glb` is the whole command.

**Negative:**
- Slightly newer extension than Draco; older glTF tooling may not recognize it. Mitigated: every tool in our pipeline supports it.
- Re-encoded GLBs are not human-inspectable without a `gltf-transform inspect` step (same is true of Draco).

**Obligations on downstream stories:**
- The asset acquisition pipeline (Epic 2 `acquire_models.py`) runs the gltf-transform meshopt step.
- The Three.js renderer setup (Story 1.10 / Epic 2) registers `MeshoptDecoder` with `GLTFLoader`.
- The L4 visual regression harness validates the spacecraft mesh renders correctly at all LOD tiers.

## Alternatives Considered

- **Draco compression.** Rejected. Larger decoder (~200 KB vs ~30 KB), older, less actively maintained. The initial-research foundation document mentioned Draco by implication; this ADR documents the correction (per the technical research's explicit recommendation).
- **No compression (raw GLB).** Rejected: spacecraft mesh at full LOD0 is ~99k triangles; raw GLB is ~5–10 MB; meshopt-compressed is ~3–5 MB. First-paint budget is tight enough that the saving matters.
- **Custom binary mesh format.** Rejected: gltf-transform meshopt is industry-standard, well-tooled, and gives all the wins of a custom format with none of the maintenance burden.
- **Re-mesh at lower poly counts only (no compression).** Rejected as a *replacement*; LOD tiers are part of the pipeline anyway (LOD0/LOD1/LOD2/impostor per the technical research), but compression is orthogonal and additive.
