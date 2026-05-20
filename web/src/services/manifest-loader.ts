// Asset manifest loader (Story 1.6 AC1).
//
// Fetches `web/public/data/manifest.json` (the runtime contract; architecture
// Decision 1b, lines 263-289) and validates it with Zod. The loader is
// module-scoped cached by URL so repeated callers share an in-flight promise.
//
// On schema violations the loader rejects with a `ManifestValidationError`
// carrying the failing path (e.g. "bodies[0].files[2].sha256: required").
// Per architecture line 289, unknown major schemaVersion is a fail-fast.

import { z, type ZodError } from 'zod';

// === Zod schema =====================================================
//
// Mirrors Decision 1b. `kind` is currently only "trajectory" (Story 1.4);
// "bus_attitude" and "platform_attitude" are reserved for later stories.

const FileSchema = z.object({
  url: z.string(),
  // sha256 of the file as it exists on disk (brotli-compressed). Story 1.3's
  // bake-side hash discipline + bake determinism gate (NFR-R4) compute
  // against this value. The runtime client cannot verify it because Vite /
  // Cloudflare serve the file with `Content-Encoding: br`, so the browser
  // transparently decompresses before delivering bytes to JS.
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  // sha256 of the decompressed VTRJ body. Story 1.16 adds this so the
  // runtime chunk-loader can verify integrity of the bytes it actually
  // receives from `fetch` (which are post-HTTP-decompression). Optional
  // during the rollout so old manifests still parse; required once every
  // emitting bake produces it.
  decompressedSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  sizeBytes: z.number().int().positive(),
  timeRangeEt: z.tuple([z.number(), z.number()]),
  cadenceSec: z.number().positive(),
  kind: z.enum(['trajectory', 'bus_attitude', 'platform_attitude']),
});

const BodySchema = z.object({
  naifId: z.number().int(),
  name: z.string(),
  files: z.array(FileSchema),
});

const KernelSchema = z.object({
  file: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  kind: z.string(),
  source_url: z.string(),
});

const ValidationTolerancesSchema = z.object({
  maxPositionErrorKm: z.number().positive(),
  rmsPositionErrorKm: z.number().positive(),
});

const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  bakeCommit: z.string(),
  bakeTimestamp: z.string(),
  kernels: z.array(KernelSchema),
  bodies: z.array(BodySchema),
  chapters: z.array(z.unknown()),
  validationTolerances: ValidationTolerancesSchema,
});

// === Public types ===================================================

export type ManifestFile = z.infer<typeof FileSchema>;
export type ManifestBody = z.infer<typeof BodySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export class ManifestValidationError extends Error {
  readonly url: string;
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(url: string, issues: ReadonlyArray<{ path: string; message: string }>) {
    const head = issues[0];
    const message = head
      ? `Manifest validation failed for ${url}: ${head.path}: ${head.message}`
      : `Manifest validation failed for ${url} (no issues reported)`;
    super(message);
    this.name = 'ManifestValidationError';
    this.url = url;
    this.issues = issues;
  }
}

// === Cache ==========================================================
//
// In-flight promises share across concurrent callers; resolved promises stay
// cached so a second `load(url)` resolves synchronously to the same Manifest.

const _cache = new Map<string, Promise<Manifest>>();

export const __resetCacheForTests = (): void => {
  _cache.clear();
};

// === Issue formatting ==============================================

const formatPath = (path: ReadonlyArray<PropertyKey>): string => {
  if (path.length === 0) return '<root>';
  return path
    .map((segment) =>
      typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`,
    )
    .join('')
    .replace(/^\./, '');
};

const zodIssuesToReadable = (
  err: ZodError,
): ReadonlyArray<{ path: string; message: string }> =>
  err.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));

// === Loader =========================================================

export interface ManifestLoaderOptions {
  // Injectable for tests; defaults to the global fetch.
  fetchImpl?: typeof fetch;
}

export const load = (
  url: string,
  options: ManifestLoaderOptions = {},
): Promise<Manifest> => {
  const cached = _cache.get(url);
  if (cached !== undefined) return cached;

  const fetchImpl = options.fetchImpl ?? fetch;
  const promise = (async () => {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(
        `Manifest fetch failed: ${url} returned HTTP ${response.status} ${response.statusText}`,
      );
    }
    const raw: unknown = await response.json();
    const result = ManifestSchema.safeParse(raw);
    if (!result.success) {
      throw new ManifestValidationError(url, zodIssuesToReadable(result.error));
    }
    return result.data;
  })();

  _cache.set(url, promise);
  promise.catch(() => {
    // On failure, evict so a subsequent retry can re-fetch (e.g. a transient
    // 503). Validation errors persist in their rejected state if the
    // upstream JSON hasn't changed; that's fine.
    _cache.delete(url);
  });
  return promise;
};

// Convenience export object mirroring the AC's "ManifestLoader.load(url)" shape.
export const ManifestLoader = { load };
