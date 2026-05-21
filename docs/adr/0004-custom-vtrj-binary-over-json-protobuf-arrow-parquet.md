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

- **Time is implicit for trajectory** (`t = t0 + dt * i`), saving 50% of bytes vs storing timestamps. **Time is explicit for attitude** (first column of each sample row) — see § Body Layout per Kind below for the Story 3.1 amendment.
- **TypeScript loader is zero-copy:** `new Float64Array(buffer, HEADER_SIZE, numSamples * componentsPerSample)` is a view, not an allocation.
- **Same loader serves both trajectory and attitude streams** — the body-shape discrimination is via `body_id` namespace (see § Body Layout per Kind below).
- **Brotli compression** at build time, served as immutable static assets with `Cache-Control: public, max-age=31536000, immutable` (per ADR 0017's content-hash discipline).

### Body Layout per Kind (amended 2026-05-21 per Story 3.1)

The Story 1.4 implementation locked the actual on-disk header struct as `<4sHiddId2s` (4-byte magic + u16 version + i32 body_id + f64 et_start + f64 et_end + u32 sample_count + f64 cadence_seconds + 2-byte reserved = 40 bytes). The `dt_sec / componentsPerSample / bodyId at offset 32` layout in the original Decision block above was aspirational pseudocode that the implementation never produced. The actual header layout is the canonical contract; **see `bake/src/vtrj_writer.py` for the authoritative struct.**

Body layout is **discriminated by `body_id` namespace**, not by a `componentsPerSample` header field:

- **Trajectory body IDs** (`{-31, -32, 10, 1..8, 301}` — Voyager 1, Voyager 2, Sun, planet barycenters, Moon): body = `N × 6 × float64` = `[x, y, z, vx, vy, vz]` per sample. Cadence is **uniform**; sample at index `i` lies at ET `et_start + i × cadence_seconds`. The `cadence_seconds` header field is exact.
- **Attitude body IDs** (`{-31000, -31100, -32000, -32100}` — CK structure IDs for V1/V2 bus and scan platform): body = `N × 5 × float64` = `[et, qw, qx, qy, qz]` per sample. Cadence is **variable per file** (10-sec near closest approach, 1-min through encounter, daily during CK-covered cruise — the mission cadence schedule). The decoder MUST read explicit ETs from column 0 of each sample row; the `cadence_seconds` header field is **informational only** (the finest cadence band that contributed to the file, useful for diagnostic emission).

`BYTES_PER_SAMPLE` is namespace-driven: 48 for trajectory body IDs, 40 for attitude body IDs. The discrimination at decode time is `body_id ∈ ATTITUDE_BODY_IDS` (see `vtrj_writer.py:ATTITUDE_BODY_IDS`).

**Why explicit ETs for attitude:** the mission cadence schedule is intentionally non-uniform — quaternion rate of change during the closest-approach minutes is two orders of magnitude higher than during quiet cruise, and the storage budget rewards dense sampling only where attitude is actually changing. A uniform-cadence file would either (a) waste hundreds of MB on cruise samples or (b) lose precision through the encounter peak. Splitting into per-band files (one possibility per the "Variable-cadence segments live in separate chunk files" line of the original Decision) would introduce internal boundary stitching with knot-continuity gotchas at exactly the most visually-sensitive moments of the experience. Inline explicit ETs at 25% bytes-per-sample overhead (40 vs 32 for implicit-ET) keeps the data shape mathematically faithful, single-file-per-encounter, and SLERP-trivial.

**Why the `cadence_seconds` header field stays:** trajectory consumers (chunk-loader, ephemeris service) read it as the canonical step; preserving the field preserves the Story 1.4 trajectory contract verbatim. The trajectory write path is unchanged.

**On-disk forward compatibility:** the header struct format string is unchanged; the body shape change is detected entirely by the `body_id ∈ ATTITUDE_BODY_IDS` check that already gates the schema-extension code path. No `schemaVersion` bump is needed (additive within the body_id namespace partition). A future format change that affects the header itself (or introduces new body_id namespaces) MUST bump `version`, supersede this ADR, and document migration.

### Decompression Strategy (amended 2026-05-20 per Story 1.16)

The original design assumed client-side brotli decompression via the JS `DecompressionStream('br')` API. Empirical discovery during Epic 1 retrospective execution (2026-05-19): no production browser supports the brotli format in the Compression Streams API. The spec only standardized `gzip`, `deflate`, `deflate-raw`. `new DecompressionStream('br')` throws in Chrome 148 stable, Firefox stable, and Safari stable.

**Current decompression path** (post Story 1.16):

- Client uses the [`brotli-dec-wasm`](https://github.com/ustclug-dev/brotli-dec-wasm) polyfill (~200 KB wasm module, dynamically imported on first decompress).
- The wasm module is lazy-loaded so jsdom/node test environments (where its top-level `fetch()` for the .wasm asset fails) don't pay the cost unless a test exercises the decompression path.
- Manifest SHA-256 is still computed on the **compressed** bytes (Story 1.3's bake-time hash discipline is preserved); the chunk-loader verifies the fetched compressed bytes before invoking the decoder.
- Alternative paths considered and rejected: (a) HTTP-level `Content-Encoding: br` (rejected — would require re-baking 200 MB of LFS kernels because the SHA would now apply to decompressed bytes, breaking the integrity-check contract); (b) shipping `.bin` files uncompressed (rejected — defeats the whole reason for compression).

See `_bmad-output/implementation-artifacts/epic-1-retro-2026-05-19.md` § 3a and Story 1.16 (`1-16-brotli-decompression-architectural-fix.md`) for the full discovery and decision context.

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
