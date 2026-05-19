// VTRJ chunk loader with LRU cache and observable loading flag (Story 1.6 AC2).
//
// Fetches a brotli-compressed VTRJ file, decompresses it via the browser's
// `DecompressionStream('br')`, verifies the SHA-256 against the manifest, and
// parses the 40-byte header + Float64 sample body. Cached chunks are stored in
// an insertion-order Map-backed LRU; cache hits are synchronous (Promise that
// resolves on the same microtask).
//
// The decoder/decompressor and fetch implementation are injectable so vitest
// tests under Node (which lacks `DecompressionStream('br')` in v22) can
// substitute Node's `zlib.brotliDecompressSync`. Production uses the browser
// API: see `defaultDecompressBrotli` below.
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

export type DecompressFn = (compressed: ArrayBuffer) => Promise<ArrayBuffer>;

const defaultDecompressBrotli: DecompressFn = async (compressed) => {
  // Browser path: streams brotli decode via the standards-track API.
  // DecompressionStream is available in Chrome 80+, Firefox 113+, Safari 16.4+;
  // the 'br' format is Chrome 120+, Firefox 126+, Safari 17.5+ per Story 1.6
  // Dev Notes. Pre-2024 browsers hit the fallback page (Story 1.8).
  const ds = new DecompressionStream('br' as CompressionFormat);
  const stream = new Response(compressed).body!.pipeThrough(ds);
  return await new Response(stream).arrayBuffer();
};

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
const BYTES_PER_SAMPLE = 48; // 6 × f64
const SUPPORTED_VERSION = 1;

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
  const expectedBodyBytes = header.sampleCount * BYTES_PER_SAMPLE;
  const haveBodyBytes = buffer.byteLength - HEADER_SIZE;
  if (haveBodyBytes < expectedBodyBytes) {
    throw new VtrjFormatError(
      `VTRJ body truncated: have ${haveBodyBytes} bytes, expected ${expectedBodyBytes}`,
    );
  }
  // Float64Array requires 8-byte alignment of the underlying buffer offset.
  // Header is 40 bytes (multiple of 8), so the body offset is already aligned.
  return new Float64Array(buffer, HEADER_SIZE, header.sampleCount * 6);
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
  decompress?: DecompressFn;
  sha256Hex?: (buffer: ArrayBuffer) => Promise<string>;
}

export class ChunkLoader {
  private readonly cache: LruCache<LoadedChunk>;
  private readonly inflight = new Map<string, Promise<LoadedChunk>>();
  private readonly subscribers = new Set<(loading: boolean) => void>();
  private readonly fetchImpl: typeof fetch;
  private readonly decompress: DecompressFn;
  private readonly sha256Hex: (buffer: ArrayBuffer) => Promise<string>;

  constructor(options: ChunkLoaderOptions = {}) {
    this.cache = new LruCache(options.capacity ?? DEFAULT_LRU_CAPACITY);
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.decompress = options.decompress ?? defaultDecompressBrotli;
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
    const compressed = await response.arrayBuffer();
    const decompressed = await this.decompress(compressed);
    const computedSha = await this.sha256Hex(compressed);
    if (computedSha !== file.sha256) {
      throw new ChunkIntegrityError(file.url, file.sha256, computedSha);
    }
    const header = parseVtrjHeader(decompressed);
    const samples = sliceSamples(decompressed, header);
    return { header, samples };
  }

  private notify(): void {
    const value = this.loading;
    for (const cb of this.subscribers) cb(value);
  }

  // Test helpers
  __cacheSize(): number {
    return this.cache.size();
  }
  __cacheKeys(): string[] {
    return this.cache.keys();
  }
}
