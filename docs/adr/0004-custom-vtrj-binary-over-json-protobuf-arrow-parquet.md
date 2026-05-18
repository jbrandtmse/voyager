# ADR 0004 — Custom VTRJ Binary over JSON / Protobuf / Arrow / Parquet

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. Trajectory and attitude streams are stored in a custom VTRJ binary format: 40-byte fixed-step header + raw little-endian Float64 body, brotli-compressed for transport.

## Context

The runtime consumes ~5–25 MB of raw trajectory data across all bodies (plus ~15–25 MB of attitude data for encounters). The format chosen for storage and transport affects parse cost (NFR-P3 ≤3 s TTI), bundle weight (NFR-P4 ≤35 MB first paint, NFR-P5 ≤150 MB full), and per-decade chunkability (FR7, FR12).

Self-describing formats add parse overhead and bundle weight without payoff at this scale. The format decision matrix in the technical research clearly favors a custom layout.

[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Runtime-Binary-Trajectory-Format]
[Source: _bmad-output/planning-artifacts/architecture.md#Category-1-Build-Time-Data-Pipeline]

## Decision

Use a **custom 40-byte-header + raw little-endian Float64 body** format ("VTRJ"), brotli-compressed for transport.

```text
Header (40 bytes, little-endian):
  offset  size  type      field
  0       4     char[4]   magic = "VTRJ"
  4       2     uint16    version = 1
  6       2     uint16    reserved
  8       8     float64   t0_et    (seconds since J2000 TDB)
  16      8     float64   dt_sec   (seconds between samples)
  24      4     uint32    numSamples
  28      4     uint32    componentsPerSample (6 = pos+vel, 4 = quat, 3 = pos only)
  32      4     uint32    bodyId   (NAIF ID, e.g. -31 for Voyager 1)
  36      4     uint32    reserved

Data (numSamples × componentsPerSample × 8 bytes):
  float64[]
```

- **Time is implicit** (`t = t0 + dt * i`), saving 50% of bytes vs storing timestamps.
- **Variable-cadence segments** (flyby high-resolution overlays) live in separate chunk files, each with its own header — keeps the on-wire format simple.
- **TypeScript loader is zero-copy:** `new Float64Array(buffer, HEADER_SIZE, numSamples * componentsPerSample)` is a view, not an allocation.
- **Same layout serves attitude streams** with `componentsPerSample = 4` (quaternion qw,qx,qy,qz) — single loader; single header parser.
- **Brotli compression** at build time, served as immutable static assets with `Cache-Control: public, max-age=31536000, immutable` (per ADR 0017's content-hash discipline).

## Consequences

**Positive:**
- ~1–2 ms parse cost (DataView wrapper construction); zero-copy view onto the data.
- Bundle overhead ≈0 (loader is <100 LOC).
- Per-chunk brotli compresses well at edge caches.
- Single format for trajectories *and* attitudes (orthogonal `componentsPerSample`).
- Trivially range-friendly: offset math gives O(1) sample lookup.

**Negative:**
- Format is bespoke; readers in other ecosystems would need to implement the spec (a non-issue for a closed browser-only artifact).
- Version bumps in the on-disk schema require an ADR (per architecture Decision 1b — runtime refuses unknown major schemaVersion; minor bumps must be backward-compatible).
- Endianness is fixed little-endian; on the unlikely event of a big-endian target, the loader would need a byte-swap path. CI runs on linux/amd64 (little-endian); browser targets are all little-endian in practice.

**Obligations on downstream stories:**
- The Python bake (Epic 2) writes the VTRJ header layout exactly as specified above.
- `bake/src/vtrj_writer.py` is the canonical authoring side; the TypeScript loader in `web/src/services/chunk-loader.ts` is the canonical reading side. Both reference this ADR.
- The L2 JS-vs-SPICE consistency test loads Python-baked VTRJ fixtures and asserts byte-identical header round-trips plus body sample equality at fixed seeds.
- Any future change to the header layout must increment `version`, document the migration, and supersede this ADR with a new one.

## Alternatives Considered

| Format | Bytes/scalar | Parse cost (500k samples) | Bundle overhead | Verdict |
| --- | --- | --- | --- | --- |
| **Raw little-endian Float64 + 40-byte header (chosen)** | 8 B | ~1–2 ms | ~0 | Winner |
| MessagePack (`@msgpack/msgpack`) | ~10 B | 10–40 ms | 8–30 KB | Rejected: parse + bundle cost |
| Protobuf (`protobufjs`) | ~8 B packed | 15–60 ms | 20–60 KB | Rejected: parse + bundle cost; schema toolchain overkill |
| FlatBuffers / Cap'n Proto | 8 B | 5–20 ms | 20–50 KB | Rejected: schema toolchain not worth it |
| Apache Arrow IPC | ~8.4 B | 10–30 ms | 200–400 KB | Rejected: bundle weight kills it |
| Zarr / Parquet | 8 B + chunk meta | 20–100 ms | 100–250 KB | Rejected: overkill at this scale |
| JSON / CSV | 20–40 B | 50–500 ms | ~0 | Rejected: payload size and parse cost |

JSON, CSV, MessagePack, Protobuf, Arrow, and Parquet at runtime are all explicitly rejected. The technical research confidence on this decision is High.
