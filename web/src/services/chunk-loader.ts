// VTRJ chunk loader with LRU cache and observable loading flag (Story 1.6 AC2).
//
// Fetches a brotli-compressed VTRJ file. Vite (dev) and Cloudflare Pages (prod)
// both auto-apply `Content-Encoding: br` to `.bin.br` responses, so the
// browser's HTTP layer transparently brotli-decompresses before
// `fetch().arrayBuffer()` returns. No client-side decompression code is
// needed in the chunk loader.
//
// The chunk loader verifies the received (decompressed) bytes against the
// manifest's `decompressedSha256` field (Story 1.16), then parses the
// 40-byte VTRJ header + Float64 sample body. Cached chunks are stored in
// an insertion-order Map-backed LRU; cache hits are synchronous (Promise
// that resolves on the same microtask).
//
// Story 1.16 background: the original design assumed client-side brotli
// decompression via `DecompressionStream('br')`. That API was never
// standardized by the Compression Streams spec; no production browser
// supports it. After discovery (see epic-1-retro-2026-05-19.md § 3a), we
// pivoted to HTTP-level brotli (which Vite + Cloudflare already do
// automatically). The chunk loader receives decompressed bytes directly.
// The existing SHA-on-compressed integrity hash is preserved in the
// manifest for the bake's NFR-R4 determinism gate; the new
// `decompressedSha256` is what the runtime can actually verify.
//
// Architecture references:
//   - line 308 (chunk-loader entry in service graph)
//   - line 874 (async boundary discipline)
//   - line 1220 (subscribe/unsubscribe pattern)
//   - ADR 0004 (VTRJ binary format)

import type { ManifestFile } from './manifest-loader';

// === Public types ===================================================

export interface VtrjHeader {
  magic: string; // always "VTRJ"
  version: number; // always 1 (current)
  bodyId: number; // i32, NAIF target id (-31, -32, ...)
  etStart: number; // f64
  etEnd: number; // f64
  sampleCount: number; // u32, number of state vectors
  cadenceSeconds: number; // f64, uniform sample cadence
}

export interface LoadedChunk {
  readonly header: VtrjHeader;
  /**
   * Float64Array view over the decompressed body — `sampleCount * 6` doubles
   * laid out as `[x, y, z, vx, vy, vz]` per sample, units km and km/s,
   * ECLIPJ2000 frame.
   */
  readonly samples: Float64Array;
}

export class ChunkIntegrityError extends Error {
  readonly url: string;
  readonly expected: string;
  readonly computed: string;
  constructor(url: string, expected: string, computed: string) {
    super(
      `Chunk integrity check failed: ${url} — expected sha256=${expected}, computed sha256=${computed}`,
    );
    this.name = 'ChunkIntegrityError';
    this.url = url;
    this.expected = expected;
    this.computed = computed;
  }
}

export class VtrjFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VtrjFormatError';
  }
}

// === Injectable defaults ===========================================

const defaultSha256Hex = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

// === VTRJ header parser ============================================

const MAGIC = 'VTRJ';
const HEADER_SIZE = 40;
// Per-sample byte width depends on the VTRJ kind (Story 3.1 ADR-0004 § Body
// Layout per Kind amendment 2026-05-21). Trajectory bodies are 6 doubles per
// sample (`[x, y, z, vx, vy, vz]`); attitude bodies are 5 doubles per sample
// (`[et, qw, qx, qy, qz]` — explicit per-sample ETs in column 0 + SPICE
// scalar-first quaternion). The body kind is inferred from the `body_id`
// header field via the disjoint NAIF SPK-ID / CK structure-ID namespaces; the
// runtime mirror of `bake/src/vtrj_writer.py:_kind_for_body_id`.
const BYTES_PER_TRAJECTORY_SAMPLE = 48; // 6 × f64
const BYTES_PER_ATTITUDE_SAMPLE = 40; // 5 × f64
const SUPPORTED_VERSION = 1;

// CK structure IDs for the four attitude body classes per the Story 3.1 bake.
// Mirror of `bake/src/vtrj_writer.py:ATTITUDE_BODY_IDS`. Trajectory IDs (NAIF
// SPK IDs -31, -32, 10, 1..8, 301) are the complementary set; the union is
// `ALLOWED_BODY_IDS` in the Python writer.
const ATTITUDE_BODY_IDS = new Set<number>([-31000, -31100, -32000, -32100]);

/**
 * Returns the on-disk kind ('trajectory' | 'attitude') for a VTRJ body_id.
 * Disjoint namespaces — trajectory IDs are 2-digit NAIF SPK IDs, attitude IDs
 * are 5-digit CK structure IDs.
 */
export type VtrjKind = 'trajectory' | 'attitude';
export const kindForBodyId = (bodyId: number): VtrjKind =>
  ATTITUDE_BODY_IDS.has(bodyId) ? 'attitude' : 'trajectory';

const decodeMagic = (view: DataView): string => {
  let s = '';
  for (let i = 0; i < 4; i++) s += String.fromCharCode(view.getUint8(i));
  return s;
};

export const parseVtrjHeader = (buffer: ArrayBuffer): VtrjHeader => {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new VtrjFormatError(
      `VTRJ buffer too short: ${buffer.byteLength} bytes (< ${HEADER_SIZE}-byte header)`,
    );
  }
  const view = new DataView(buffer, 0, HEADER_SIZE);
  const magic = decodeMagic(view);
  if (magic !== MAGIC) {
    throw new VtrjFormatError(
      `VTRJ magic mismatch: expected "${MAGIC}", got "${magic}"`,
    );
  }
  const version = view.getUint16(4, /* littleEndian */ true);
  if (version !== SUPPORTED_VERSION) {
    throw new VtrjFormatError(
      `VTRJ version not supported: got ${version}, expected ${SUPPORTED_VERSION}`,
    );
  }
  const bodyId = view.getInt32(6, true);
  const etStart = view.getFloat64(10, true);
  const etEnd = view.getFloat64(18, true);
  const sampleCount = view.getUint32(26, true);
  const cadenceSeconds = view.getFloat64(30, true);
  // 2 reserved bytes at offset 38; ignored. (writer emits 0x0000)
  return {
    magic,
    version,
    bodyId,
    etStart,
    etEnd,
    sampleCount,
    cadenceSeconds,
  };
};

const sliceSamples = (buffer: ArrayBuffer, header: VtrjHeader): Float64Array => {
  // Per-sample width depends on the kind. Trajectory (NAIF SPK ID) → 6 doubles
  // per sample; attitude (CK structure ID) → 5 doubles per sample. The header
  // body_id is the disambiguator (Story 3.1 ADR-0004 amendment).
  const kind = kindForBodyId(header.bodyId);
  const componentsPerSample = kind === 'attitude' ? 5 : 6;
  const bytesPerSample =
    kind === 'attitude' ? BYTES_PER_ATTITUDE_SAMPLE : BYTES_PER_TRAJECTORY_SAMPLE;
  const expectedBodyBytes = header.sampleCount * bytesPerSample;
  const haveBodyBytes = buffer.byteLength - HEADER_SIZE;
  if (haveBodyBytes < expectedBodyBytes) {
    throw new VtrjFormatError(
      `VTRJ body truncated: have ${haveBodyBytes} bytes, expected ${expectedBodyBytes}`,
    );
  }
  // Float64Array requires 8-byte alignment of the underlying buffer offset.
  // Header is 40 bytes (multiple of 8), so the body offset is already aligned.
  return new Float64Array(buffer, HEADER_SIZE, header.sampleCount * componentsPerSample);
};

// === LRU cache ====================================================

export const DEFAULT_LRU_CAPACITY = 12;

class LruCache<V> {
  private readonly store = new Map<string, V>();
  private readonly capacity: number;
  constructor(capacity: number) {
    if (capacity <= 0) throw new Error('LRU capacity must be positive');
    this.capacity = capacity;
  }
  get(key: string): V | undefined {
    if (!this.store.has(key)) return undefined;
    const v = this.store.get(key)!;
    this.store.delete(key);
    this.store.set(key, v);
    return v;
  }
  set(key: string, value: V): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.capacity) {
      // Evict the oldest (first) entry.
      const oldestKey = this.store.keys().next().value as string | undefined;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, value);
  }
  has(key: string): boolean {
    return this.store.has(key);
  }
  size(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

// === ChunkLoader ===================================================

export interface ChunkLoaderOptions {
  capacity?: number;
  fetchImpl?: typeof fetch;
  sha256Hex?: (buffer: ArrayBuffer) => Promise<string>;
}

export class ChunkLoader {
  private readonly cache: LruCache<LoadedChunk>;
  private readonly inflight = new Map<string, Promise<LoadedChunk>>();
  private readonly subscribers = new Set<(loading: boolean) => void>();
  private readonly fetchImpl: typeof fetch;
  private readonly sha256Hex: (buffer: ArrayBuffer) => Promise<string>;

  constructor(options: ChunkLoaderOptions = {}) {
    this.cache = new LruCache(options.capacity ?? DEFAULT_LRU_CAPACITY);
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.sha256Hex = options.sha256Hex ?? defaultSha256Hex;
  }

  get loading(): boolean {
    return this.inflight.size > 0;
  }

  /**
   * Subscribe to changes in the `loading` flag. Callback fires whenever any
   * fetch starts or completes (success or error). Returns an unsubscribe
   * function. Architecture line 1220.
   */
  subscribe(callback: (loading: boolean) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Synchronously return a cached chunk if present, else undefined.
   * EphemerisService.getStateAt uses this to avoid touching async machinery
   * on the per-frame hot path (architecture line 874).
   */
  peek(url: string): LoadedChunk | undefined {
    return this.cache.get(url);
  }

  async load(file: ManifestFile): Promise<LoadedChunk> {
    const cached = this.cache.get(file.url);
    if (cached !== undefined) return cached;

    const existingInflight = this.inflight.get(file.url);
    if (existingInflight !== undefined) return existingInflight;

    const wasLoading = this.loading;
    const promise = this.fetchAndDecode(file);
    this.inflight.set(file.url, promise);
    if (!wasLoading) this.notify();

    try {
      const chunk = await promise;
      this.cache.set(file.url, chunk);
      return chunk;
    } finally {
      this.inflight.delete(file.url);
      if (this.inflight.size === 0) this.notify();
    }
  }

  private async fetchAndDecode(file: ManifestFile): Promise<LoadedChunk> {
    const response = await this.fetchImpl(file.url);
    if (!response.ok) {
      throw new Error(
        `Chunk fetch failed: ${file.url} returned HTTP ${response.status} ${response.statusText}`,
      );
    }
    // The browser HTTP layer has already brotli-decompressed because Vite /
    // Cloudflare serve `.bin.br` with `Content-Encoding: br` (Story 1.16).
    // `response.arrayBuffer()` returns the decompressed VTRJ bytes directly.
    const decompressed = await response.arrayBuffer();
    // Verify against `decompressedSha256` if the manifest provides it
    // (Story 1.16 added it). Manifests baked before 1.16 lack this field —
    // we skip the integrity check in that case rather than block on an
    // un-verifiable hash. The bake's own NFR-R4 determinism gate covers
    // build-side correctness; the gap is dev-only and small.
    if (file.decompressedSha256 !== undefined) {
      const computedSha = await this.sha256Hex(decompressed);
      if (computedSha !== file.decompressedSha256) {
        throw new ChunkIntegrityError(file.url, file.decompressedSha256, computedSha);
      }
    }
    const header = parseVtrjHeader(decompressed);
    const samples = sliceSamples(decompressed, header);
    return { header, samples };
  }

  private notify(): void {
    const value = this.loading;
    // Story 2.0 AC10 — wrap each subscriber in try/catch so a synchronously
    // throwing subscriber does not short-circuit notification of subsequent
    // subscribers in the Set. Async (promise-rejecting) subscribers are out
    // of scope: the iteration is synchronous and unawaited.
    for (const cb of this.subscribers) {
      try {
        cb(value);
      } catch (err) {
        console.error('chunk-loader subscriber threw:', err);
      }
    }
  }

  // Test helpers
  __cacheSize(): number {
    return this.cache.size();
  }
  __cacheKeys(): string[] {
    return this.cache.keys();
  }
}
