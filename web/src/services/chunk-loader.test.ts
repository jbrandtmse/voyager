import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  ChunkLoader,
  ChunkIntegrityError,
  VtrjFormatError,
  parseVtrjHeader,
  DEFAULT_LRU_CAPACITY,
  resolveAgainstRoot__forTest,
} from './chunk-loader';
import type { ManifestFile } from './manifest-loader';

// === VTRJ fixture builders =========================================
//
// Constructs a synthetic VTRJ blob matching Story 1.4's writer exactly:
//   40-byte LE header (magic="VTRJ", version u16, body_id i32, et_start f64,
//   et_end f64, sample_count u32, cadence_seconds f64, reserved 2 bytes 0x0000)
//   + Float64Array body of sample_count * 6 doubles.

const buildVtrj = (params: {
  bodyId: number;
  etStart: number;
  etEnd: number;
  sampleCount: number;
  cadenceSeconds: number;
  samples?: Float64Array;
  magic?: string;
  version?: number;
}): ArrayBuffer => {
  const {
    bodyId,
    etStart,
    etEnd,
    sampleCount,
    cadenceSeconds,
    magic = 'VTRJ',
    version = 1,
  } = params;
  const bodyBytes = sampleCount * 48;
  const total = 40 + bodyBytes;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  // magic: 4 bytes ASCII
  for (let i = 0; i < 4; i++) view.setUint8(i, magic.charCodeAt(i));
  view.setUint16(4, version, true);
  view.setInt32(6, bodyId, true);
  view.setFloat64(10, etStart, true);
  view.setFloat64(18, etEnd, true);
  view.setUint32(26, sampleCount, true);
  view.setFloat64(30, cadenceSeconds, true);
  view.setUint16(38, 0, true);
  if (params.samples) {
    const f64 = new Float64Array(buf, 40, sampleCount * 6);
    f64.set(params.samples);
  }
  return buf;
};

// Story 1.16 — Vite + Cloudflare auto-apply Content-Encoding: br to .bin.br
// files; the browser HTTP layer transparently decompresses before the chunk
// loader sees bytes. The chunk loader therefore expects already-decompressed
// VTRJ bytes from `fetch().arrayBuffer()`. In tests we simulate that by
// passing the raw VTRJ bytes directly (this helper is now an identity
// transform; the brotli-compress / brotli-decompress round-trip is gone).
const passthrough = (input: ArrayBuffer): ArrayBuffer => input;

const sha256Hex = (input: ArrayBuffer): string => {
  const h = createHash('sha256');
  h.update(Buffer.from(input));
  return h.digest('hex');
};

// (Story 1.16 removed nodeBrotliDecompress — the chunk loader no longer
// performs client-side decompression; the browser HTTP layer handles it.)

const mockFetchOk = (compressed: ArrayBuffer): typeof fetch => {
  return vi.fn(async () => {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => compressed,
    } as unknown as Response;
  }) as unknown as typeof fetch;
};

// === Tests ==========================================================

describe('parseVtrjHeader', () => {
  it('parses a valid header', () => {
    const samples = new Float64Array([1, 2, 3, 0.1, 0.2, 0.3, 4, 5, 6, 0.4, 0.5, 0.6]);
    const buf = buildVtrj({
      bodyId: -31,
      etStart: -704412000.0,
      etEnd: -704411940.0,
      sampleCount: 2,
      cadenceSeconds: 60.0,
      samples,
    });
    const header = parseVtrjHeader(buf);
    expect(header.magic).toBe('VTRJ');
    expect(header.version).toBe(1);
    expect(header.bodyId).toBe(-31);
    expect(header.etStart).toBe(-704412000.0);
    expect(header.etEnd).toBe(-704411940.0);
    expect(header.sampleCount).toBe(2);
    expect(header.cadenceSeconds).toBe(60.0);
  });

  it('rejects bad magic', () => {
    const buf = buildVtrj({
      bodyId: -31,
      etStart: 0,
      etEnd: 60,
      sampleCount: 1,
      cadenceSeconds: 60,
      magic: 'XXXX',
    });
    expect(() => parseVtrjHeader(buf)).toThrow(VtrjFormatError);
    expect(() => parseVtrjHeader(buf)).toThrow(/magic/);
  });

  it('rejects unsupported version', () => {
    const buf = buildVtrj({
      bodyId: -31,
      etStart: 0,
      etEnd: 60,
      sampleCount: 1,
      cadenceSeconds: 60,
      version: 2,
    });
    expect(() => parseVtrjHeader(buf)).toThrow(/version/);
  });

  it('rejects buffer shorter than 40 bytes', () => {
    const tiny = new ArrayBuffer(10);
    expect(() => parseVtrjHeader(tiny)).toThrow(/too short/);
  });
});

describe('ChunkLoader.load — happy path', () => {
  let decompressed: ArrayBuffer;
  let compressed: ArrayBuffer;
  let sha: string;
  let file: ManifestFile;

  beforeEach(() => {
    const samples = new Float64Array([
      1, 2, 3, 0.1, 0.2, 0.3,
      4, 5, 6, 0.4, 0.5, 0.6,
      7, 8, 9, 0.7, 0.8, 0.9,
    ]);
    decompressed = buildVtrj({
      bodyId: -31,
      etStart: 100.0,
      etEnd: 220.0,
      sampleCount: 3,
      cadenceSeconds: 60.0,
      samples,
    });
    compressed = passthrough(decompressed);
    sha = sha256Hex(compressed);
    file = {
      url: 'data/seg.bin.br',
      sha256: sha,
      decompressedSha256: sha,
      sizeBytes: compressed.byteLength,
      timeRangeEt: [100.0, 220.0],
      cadenceSec: 60.0,
      kind: 'trajectory',
    };
  });

  it('decodes the VTRJ and returns header + samples', async () => {
    const fetchImpl = mockFetchOk(compressed);
    const loader = new ChunkLoader({
      fetchImpl,
    });
    const chunk = await loader.load(file);
    expect(chunk.header.bodyId).toBe(-31);
    expect(chunk.header.sampleCount).toBe(3);
    expect(chunk.samples.length).toBe(18);
    expect(chunk.samples[0]).toBe(1);
    expect(chunk.samples[6]).toBe(4);
  });

  it('returns the same chunk on the second call without re-fetching', async () => {
    const fetchImpl = mockFetchOk(compressed);
    const loader = new ChunkLoader({
      fetchImpl,
    });
    const a = await loader.load(file);
    const b = await loader.load(file);
    expect(a).toBe(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent in-flight loads for the same URL', async () => {
    const fetchImpl = mockFetchOk(compressed);
    const loader = new ChunkLoader({
      fetchImpl,
    });
    const [a, b] = await Promise.all([loader.load(file), loader.load(file)]);
    expect(a).toBe(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('ChunkLoader — URL resolution (Story 3.3.1)', () => {
  // Story 3.3 smoke surfaced a pre-existing HIGH: from a chapter route like
  // /c/v1-jupiter, a `fetch('data/foo.bin.br')` resolves to
  // /c/data/foo.bin.br (Vite then serves the SPA fallback HTML and the
  // integrity check throws against the HTML's hash). The chunk-loader now
  // resolves every URL against `${origin}/` via `resolveAgainstRoot__forTest`,
  // so the active page URL doesn't affect chunk fetches.
  //
  // These tests target the resolution helper directly (the chunk-loader's
  // test environment is `node`, so `window` is undefined and the helper
  // returns the URL unchanged — matching the SSR fallback path documented
  // in the helper's docblock. Stub a window for each test that needs one.)

  const originalWindow = (globalThis as { window?: unknown }).window;

  const stubWindow = (origin: string): void => {
    (globalThis as { window?: unknown }).window = {
      location: { origin },
    };
  };

  const restoreWindow = (): void => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  };

  it('resolves a root-relative URL to the origin root from a chapter page', () => {
    stubWindow('http://127.0.0.1:5173');
    try {
      // Sanity: even though the active page is /c/v1-jupiter, the URL
      // constructor against `${origin}/` ignores the page path entirely.
      const resolved = resolveAgainstRoot__forTest('data/voyager-1-seg01.bin.br');
      expect(resolved).toBe('http://127.0.0.1:5173/data/voyager-1-seg01.bin.br');
      expect(resolved).not.toContain('/c/v1-jupiter/');
    } finally {
      restoreWindow();
    }
  });

  it('leaves an already-absolute URL anchored at the origin root', () => {
    stubWindow('http://127.0.0.1:5173');
    try {
      const resolved = resolveAgainstRoot__forTest('/data/already-absolute.bin.br');
      expect(resolved).toBe('http://127.0.0.1:5173/data/already-absolute.bin.br');
    } finally {
      restoreWindow();
    }
  });

  it('leaves a fully-qualified URL untouched (e.g. CDN-hosted asset)', () => {
    stubWindow('http://127.0.0.1:5173');
    try {
      const resolved = resolveAgainstRoot__forTest('https://cdn.example.com/data/foo.bin.br');
      expect(resolved).toBe('https://cdn.example.com/data/foo.bin.br');
    } finally {
      restoreWindow();
    }
  });

  it('returns the URL unchanged in a no-window environment (Node / SSR)', () => {
    // Node-default state — no `window` global. This is the path test runners
    // and SSR builds exercise; the chunk-loader's downstream fetchImpl is
    // expected to be mocked or proxied in those contexts anyway.
    restoreWindow();
    expect(resolveAgainstRoot__forTest('data/foo.bin.br')).toBe('data/foo.bin.br');
  });

  it('chunk-loader uses the resolver in the fetch call (integration via stubbed window)', async () => {
    stubWindow('http://127.0.0.1:5173');
    try {
      const samples = new Float64Array([1, 2, 3, 0.1, 0.2, 0.3, 4, 5, 6, 0.4, 0.5, 0.6]);
      const decompressed = buildVtrj({
        bodyId: -31,
        etStart: 100.0,
        etEnd: 160.0,
        sampleCount: 2,
        cadenceSeconds: 60.0,
        samples,
      });
      const compressed = passthrough(decompressed);
      const sha = sha256Hex(compressed);
      const file: ManifestFile = {
        url: 'data/voyager-1-seg01.bin.br',
        sha256: sha,
        decompressedSha256: sha,
        sizeBytes: compressed.byteLength,
        timeRangeEt: [100.0, 160.0],
        cadenceSec: 60.0,
        kind: 'trajectory',
      };

      const received: string[] = [];
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        received.push(String(input));
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async () => compressed,
        } as unknown as Response;
      }) as unknown as typeof fetch;

      const loader = new ChunkLoader({ fetchImpl });
      await loader.load(file);

      expect(received).toHaveLength(1);
      // The chunk-loader's fetchImpl receives the RESOLVED URL, not the raw
      // manifest URL. This is the load-bearing contract for Story 3.3.1.
      expect(received[0]).toBe('http://127.0.0.1:5173/data/voyager-1-seg01.bin.br');
    } finally {
      restoreWindow();
    }
  });
});

describe('ChunkLoader.load — error paths', () => {
  let decompressed: ArrayBuffer;
  let compressed: ArrayBuffer;
  let sha: string;

  beforeEach(() => {
    decompressed = buildVtrj({
      bodyId: -31,
      etStart: 0,
      etEnd: 60,
      sampleCount: 1,
      cadenceSeconds: 60,
      samples: new Float64Array([1, 2, 3, 0.1, 0.2, 0.3]),
    });
    compressed = passthrough(decompressed);
    sha = sha256Hex(compressed);
  });

  it('rejects on SHA mismatch', async () => {
    const file: ManifestFile = {
      url: 'data/bad.bin.br',
      sha256: 'f'.repeat(64), // not the actual sha
      // Runtime checks decompressedSha256 (Story 1.16); set a value that
      // doesn't match the actual decompressed bytes.
      decompressedSha256: 'f'.repeat(64),
      sizeBytes: compressed.byteLength,
      timeRangeEt: [0, 60],
      cadenceSec: 60,
      kind: 'trajectory',
    };
    const fetchImpl = mockFetchOk(compressed);
    const loader = new ChunkLoader({
      fetchImpl,
    });
    await expect(loader.load(file)).rejects.toBeInstanceOf(ChunkIntegrityError);
  });

  it('rejects on bad magic (decoded body has wrong header)', async () => {
    const broken = buildVtrj({
      bodyId: -31,
      etStart: 0,
      etEnd: 60,
      sampleCount: 1,
      cadenceSeconds: 60,
      magic: 'BAD!',
    });
    const brokenCompressed = passthrough(broken);
    const brokenSha = sha256Hex(brokenCompressed);
    const file: ManifestFile = {
      url: 'data/bad-magic.bin.br',
      sha256: brokenSha,
      decompressedSha256: brokenSha,
      sizeBytes: brokenCompressed.byteLength,
      timeRangeEt: [0, 60],
      cadenceSec: 60,
      kind: 'trajectory',
    };
    const fetchImpl = mockFetchOk(brokenCompressed);
    const loader = new ChunkLoader({
      fetchImpl,
    });
    await expect(loader.load(file)).rejects.toBeInstanceOf(VtrjFormatError);
  });

  it('rejects on unsupported version', async () => {
    const broken = buildVtrj({
      bodyId: -31,
      etStart: 0,
      etEnd: 60,
      sampleCount: 1,
      cadenceSeconds: 60,
      version: 99,
    });
    const c = passthrough(broken);
    const file: ManifestFile = {
      url: 'data/bad-ver.bin.br',
      sha256: sha256Hex(c),
      decompressedSha256: sha256Hex(c),
      sizeBytes: c.byteLength,
      timeRangeEt: [0, 60],
      cadenceSec: 60,
      kind: 'trajectory',
    };
    const loader = new ChunkLoader({
      fetchImpl: mockFetchOk(c),
    });
    await expect(loader.load(file)).rejects.toThrow(/version/);
  });

  it('rejects on HTTP error', async () => {
    const file: ManifestFile = {
      url: 'data/missing.bin.br',
      sha256: sha,
      decompressedSha256: sha,
      sizeBytes: compressed.byteLength,
      timeRangeEt: [0, 60],
      cadenceSec: 60,
      kind: 'trajectory',
    };
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          arrayBuffer: async () => new ArrayBuffer(0),
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    const loader = new ChunkLoader({
      fetchImpl,
    });
    await expect(loader.load(file)).rejects.toThrow(/404/);
  });
});

describe('ChunkLoader — LRU eviction', () => {
  it('evicts the oldest entry when capacity is exceeded', async () => {
    // Build N=13 distinct chunks (1 over default capacity 12) and verify the
    // oldest one is gone.
    const capacity = DEFAULT_LRU_CAPACITY;
    const overflow = capacity + 1;

    const files: ManifestFile[] = [];
    const blobs = new Map<string, ArrayBuffer>();
    for (let i = 0; i < overflow; i++) {
      const dec = buildVtrj({
        bodyId: -31,
        etStart: i * 1000,
        etEnd: i * 1000 + 60,
        sampleCount: 1,
        cadenceSeconds: 60,
        samples: new Float64Array([i, 0, 0, 0, 0, 0]),
      });
      const c = passthrough(dec);
      const url = `data/c${i}.bin.br`;
      blobs.set(url, c);
      files.push({
        url,
        sha256: sha256Hex(c),
        decompressedSha256: sha256Hex(c),
        sizeBytes: c.byteLength,
        timeRangeEt: [i * 1000, i * 1000 + 60],
        cadenceSec: 60,
        kind: 'trajectory',
      });
    }

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = blobs.get(url);
      if (!data) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          arrayBuffer: async () => new ArrayBuffer(0),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => data,
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const loader = new ChunkLoader({
      fetchImpl,
    });

    for (const f of files) {
      await loader.load(f);
    }

    expect(loader.__cacheSize()).toBe(capacity);
    expect(loader.peek(files[0].url)).toBeUndefined();
    expect(loader.peek(files[overflow - 1].url)).toBeDefined();
  });
});

// Story 2.0 AC10 — chunk-loader notify() try/catch defense.
//
// A throwing synchronous subscriber must NOT short-circuit notification of
// other subscribers in the Set. Story 2.1's ChapterDirector is the first
// real-world non-trivial subscriber, raising the risk surface.
describe('ChunkLoader — notify() try/catch defense (Story 2.0 AC10)', () => {
  it('one throwing subscriber does not silence the others; error is logged', async () => {
    const dec = buildVtrj({
      bodyId: -31,
      etStart: 0,
      etEnd: 60,
      sampleCount: 1,
      cadenceSeconds: 60,
      samples: new Float64Array([1, 2, 3, 0, 0, 0]),
    });
    const c = passthrough(dec);
    const file: ManifestFile = {
      url: 'data/throwing-sub.bin.br',
      sha256: sha256Hex(c),
      decompressedSha256: sha256Hex(c),
      sizeBytes: c.byteLength,
      timeRangeEt: [0, 60],
      cadenceSec: 60,
      kind: 'trajectory',
    };

    const loader = new ChunkLoader({ fetchImpl: mockFetchOk(c) });

    // Order matters: register the throwing subscriber FIRST so we test
    // that subsequent subscribers in the Set are still notified.
    const sentinel: string[] = [];
    let asyncRejected = false;
    let counter = 0;
    loader.subscribe(() => {
      sentinel.push('throwing-sub-called');
      throw new Error('synthetic subscriber failure');
    });
    loader.subscribe(() => {
      // Promise-rejecting subscriber — the notify loop is synchronous and
      // unawaited, so this rejection is unhandled at the subscriber's own
      // boundary; AC10 only requires the synchronous throw be contained.
      Promise.reject(new Error('async failure'))
        .catch(() => {
          asyncRejected = true;
        });
      sentinel.push('promise-sub-called');
    });
    loader.subscribe(() => {
      counter += 1;
      sentinel.push('counter-sub-called');
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await loader.load(file);
    // Allow the async-reject microtask to run.
    await new Promise((r) => setTimeout(r, 0));

    // All three subscribers were invoked for BOTH the leading-edge
    // (loading=true) and trailing-edge (loading=false) notifications.
    const counts: Record<string, number> = {};
    for (const tag of sentinel) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
    expect(counts['throwing-sub-called']).toBe(2);
    expect(counts['promise-sub-called']).toBe(2);
    expect(counts['counter-sub-called']).toBe(2);
    expect(counter).toBe(2);
    expect(asyncRejected).toBe(true);

    // The synchronous throw was reported via console.error — once per notify
    // cycle, so 2 total (leading + trailing edge).
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy.mock.calls[0][0]).toMatch(/subscriber threw/);
    errorSpy.mockRestore();
  });
});

describe('ChunkLoader — subscribe / loading observable', () => {
  it('emits true when a load is in flight, false when it completes', async () => {
    const dec = buildVtrj({
      bodyId: -31,
      etStart: 0,
      etEnd: 60,
      sampleCount: 1,
      cadenceSeconds: 60,
      samples: new Float64Array([1, 2, 3, 0, 0, 0]),
    });
    const c = passthrough(dec);
    const file: ManifestFile = {
      url: 'data/sub.bin.br',
      sha256: sha256Hex(c),
      decompressedSha256: sha256Hex(c),
      sizeBytes: c.byteLength,
      timeRangeEt: [0, 60],
      cadenceSec: 60,
      kind: 'trajectory',
    };
    const events: boolean[] = [];
    const loader = new ChunkLoader({
      fetchImpl: mockFetchOk(c),
    });
    const unsub = loader.subscribe((v) => events.push(v));
    expect(loader.loading).toBe(false);
    await loader.load(file);
    expect(loader.loading).toBe(false);
    expect(events).toEqual([true, false]);

    // Unsubscribe — future events should NOT be observed.
    unsub();
    const dec2 = buildVtrj({
      bodyId: -32,
      etStart: 0,
      etEnd: 60,
      sampleCount: 1,
      cadenceSeconds: 60,
      samples: new Float64Array([1, 2, 3, 0, 0, 0]),
    });
    const c2 = passthrough(dec2);
    const file2: ManifestFile = {
      url: 'data/sub2.bin.br',
      sha256: sha256Hex(c2),
      decompressedSha256: sha256Hex(c2),
      sizeBytes: c2.byteLength,
      timeRangeEt: [0, 60],
      cadenceSec: 60,
      kind: 'trajectory',
    };
    const loader2 = new ChunkLoader({
      fetchImpl: mockFetchOk(c2),
    });
    const events2: boolean[] = [];
    const unsub2 = loader2.subscribe((v) => events2.push(v));
    unsub2(); // immediately unsubscribe
    await loader2.load(file2);
    expect(events2).toEqual([]);
  });
});
