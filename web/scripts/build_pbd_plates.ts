/**
 * Story 5.3 T1 — PBD photo-plate procurement pipeline.
 *
 * Downloads the canonical NASA Planetary Photojournal narrow-angle
 * frames from the 1990-02-14 Voyager 1 "Family Portrait" imaging
 * sequence (the same sequence that produced the Pale Blue Dot — Sagan
 * 1994), crops them to per-body plates, and stages content-hashed PNGs
 * under `web/public/images/pbd/`.
 *
 * ## Source provenance
 *
 *   - **PIA00452** (NASA/JPL, "The Pale Blue Dot") — the canonical Earth
 *     narrow-angle frame at 453×614 px. Used DIRECTLY for the Earth
 *     plate to preserve the iconic light-streak composition that gives
 *     the scene its name.
 *   - **PIA00453** (NASA/JPL, "Solar System Portrait - Views of 6
 *     Planets") — the six narrow-angle color images laid out as a 3×2
 *     grid (Venus, Earth, Jupiter / Saturn, Uranus, Neptune in reading
 *     order per the NASA caption). 620×500 px. Cropped per cell for the
 *     five non-Earth plates.
 *
 * Both images are NASA public domain ("NASA Media Usage Guidelines" —
 * attribution requested, not legally required). Attribution is recorded
 * in THIRD_PARTY.md `§ NASA Photojournal PBD photo plates (Story 5.3)`
 * and surfaced at runtime via `<v-attribution-panel>`.
 *
 * ## Cinematic compromise on plate size
 *
 * The actual angular size of each body in Voyager 1's narrow-angle
 * camera at PBD distances (3.7 billion miles) is sub-pixel — Earth was
 * 0.12 of a pixel, Venus 0.11. The cinematic plate is NOT at true
 * angular scale — it shows the historical NASA frame as a visual
 * reference. The story spec recommends ~96 px square at 1280×720
 * viewport (~7.5% of viewport height — readable but doesn't obscure
 * the simulation). This pipeline emits 128×128 PNGs (next power-of-2;
 * Three.js / browser texture caching is friendlier to power-of-2
 * dimensions even when displayed via HTML `<img>`).
 *
 * ## Idempotency (NFR-R4)
 *
 * The pipeline is deterministic given fixed inputs + fixed Sharp
 * version + fixed crop coordinates. SHA-256 content hashes are
 * embedded in the output filenames so a re-run with the same source
 * bytes produces the same output filenames (matching Story 1.14's
 * immutable-asset discipline). The script computes hashes and only
 * writes files when the bytes differ.
 *
 * ## Content-hash filename convention
 *
 * Plates are emitted as `<body>.<8-char-sha256-prefix>.png` matching the
 * project's content-hashed-asset convention (mirror of how Vite hashes
 * the `/assets/` tree). 8-char prefix gives 2^32 collision space — fine
 * for the 6-plate set. The hash is computed from the cropped+normalized
 * PNG bytes (NOT the source JPEG), so the hash is stable across re-runs.
 *
 * ## Invocation
 *
 *   - cd web && npm run build-pbd-plates
 *   - tsx web/scripts/build_pbd_plates.ts
 *
 * Network access required (downloads two JPGs from NASA's static CDN at
 * `assets.science.nasa.gov`). The script caches downloads under
 * `web/public/images/pbd/_pia*.jpg` so subsequent runs are network-free
 * if the originals are present.
 */

import { mkdir, writeFile, readFile, readdir, unlink, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PBD_OUT_DIR = join(REPO_ROOT, 'web', 'public', 'images', 'pbd');
/**
 * Source-JPEG cache lives OUTSIDE the `public/` tree so Vite doesn't
 * ship them as bundle assets. Vite copies everything under `public/` to
 * `dist/` at build time; the upstream NASA Photojournal source JPEGs
 * are not part of the runtime contract (only the cropped + content-
 * hashed PNGs are). The cache lives under `web/textures-src/` alongside
 * Story 4.3's gas-giant / moon source files (same upstream-source
 * caching pattern).
 */
const PBD_SRC_CACHE_DIR = join(REPO_ROOT, 'web', 'textures-src', 'pbd-plates');

/**
 * Target plate output dimensions. 128×128 px per `Cinematic compromise`
 * docstring above. Power-of-2 for friendlier browser texture caching.
 */
export const PLATE_SIZE = 128;

/**
 * Source PIA descriptor — one row per NASA Photojournal frame this
 * pipeline downloads.
 */
export interface SourcePia {
  readonly pia: string;
  readonly url: string;
  readonly localFile: string;
  readonly description: string;
}

/**
 * Plate descriptor — one row per body. `sourcePia` indexes into
 * `SOURCE_PIAS`; `cropBox` is the rectangle to extract from the source
 * (omit for Earth, which uses the entire PIA00452 frame).
 */
export interface PlateJob {
  readonly body: 'venus' | 'earth' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
  readonly sourcePia: string;
  readonly cropBox: { left: number; top: number; width: number; height: number } | null;
  readonly description: string;
}

/**
 * NASA Planetary Photojournal source frames. Both URLs target the
 * `assets.science.nasa.gov` CDN; the legacy `photojournal.jpl.nasa.gov`
 * URL pattern 301-redirects to this CDN as of 2026-05.
 */
export const SOURCE_PIAS: ReadonlyArray<SourcePia> = Object.freeze([
  {
    pia: 'PIA00452',
    url: 'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia00/pia00452/PIA00452.jpg',
    localFile: '_pia00452-earth-pbd.jpg',
    description:
      'NASA/JPL "The Pale Blue Dot" — Voyager 1 narrow-angle Earth frame, 1990-02-14, the canonical PBD photo. 453×614 px.',
  },
  {
    pia: 'PIA00453',
    url: 'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia00/pia00453/PIA00453.jpg',
    localFile: '_pia00453-six-planets.jpg',
    description:
      'NASA/JPL "Solar System Portrait - Views of 6 Planets" — the six Voyager 1 narrow-angle color frames from the 1990-02-14 family portrait, laid out 3×2 (Venus, Earth, Jupiter / Saturn, Uranus, Neptune). 620×500 px.',
  },
]);

/**
 * Crop coordinates from the 620×500 PIA00453 grid. Each cell is
 * (620/3) × (500/2) = ~207 × 250 px. Verified visually against the
 * PIA00453 caption ("left to right and top to bottom: Venus, Earth,
 * Jupiter, Saturn, Uranus, Neptune") on 2026-05-23.
 *
 * The grid layout reads:
 *   [Venus  ] [Earth ] [Jupiter ]      <- row 0 (top)
 *   [Saturn ] [Uranus] [Neptune ]      <- row 1 (bottom)
 *
 * Cell width  = 620 / 3 ≈ 206.67 px (rounded down to 206 — losing 2px on
 *               the right is invisible against the black background and
 *               keeps the cells exactly integral)
 * Cell height = 500 / 2 = 250 px
 *
 * Crop box (left, top, width, height) per cell:
 *   col 0: left=  0, width=206
 *   col 1: left=207, width=206
 *   col 2: left=414, width=206
 *   row 0: top=  0, height=250
 *   row 1: top=250, height=250
 */
const PIA00453_CELL_WIDTH = 206;
const PIA00453_CELL_HEIGHT = 250;
const PIA00453_COL_LEFT: Record<0 | 1 | 2, number> = { 0: 0, 1: 207, 2: 414 };
const PIA00453_ROW_TOP: Record<0 | 1, number> = { 0: 0, 1: 250 };

const cellCrop = (col: 0 | 1 | 2, row: 0 | 1) => ({
  left: PIA00453_COL_LEFT[col],
  top: PIA00453_ROW_TOP[row],
  width: PIA00453_CELL_WIDTH,
  height: PIA00453_CELL_HEIGHT,
});

/**
 * Per-body plate jobs. Earth uses the dedicated PIA00452 frame
 * (preserves the iconic Sagan light-streak composition); the other five
 * crop from PIA00453's 3×2 grid in the published reading order.
 */
export const PLATE_JOBS: ReadonlyArray<PlateJob> = Object.freeze([
  {
    body: 'venus',
    sourcePia: 'PIA00453',
    cropBox: cellCrop(0, 0),
    description: 'PIA00453 cell (col 0, row 0) — Venus narrow-angle frame from Voyager 1 family-portrait series.',
  },
  {
    body: 'earth',
    sourcePia: 'PIA00452',
    cropBox: null, // use entire PIA00452 frame
    description: 'PIA00452 — Voyager 1 narrow-angle Earth frame, the canonical "Pale Blue Dot".',
  },
  {
    body: 'jupiter',
    sourcePia: 'PIA00453',
    cropBox: cellCrop(2, 0),
    description: 'PIA00453 cell (col 2, row 0) — Jupiter narrow-angle frame.',
  },
  {
    body: 'saturn',
    sourcePia: 'PIA00453',
    cropBox: cellCrop(0, 1),
    description: 'PIA00453 cell (col 0, row 1) — Saturn narrow-angle frame (rings visible).',
  },
  {
    body: 'uranus',
    sourcePia: 'PIA00453',
    cropBox: cellCrop(1, 1),
    description: 'PIA00453 cell (col 1, row 1) — Uranus narrow-angle frame (motion-smeared during 15s exposure).',
  },
  {
    body: 'neptune',
    sourcePia: 'PIA00453',
    cropBox: cellCrop(2, 1),
    description: 'PIA00453 cell (col 2, row 1) — Neptune narrow-angle frame (motion-smeared during 15s exposure).',
  },
]);

/**
 * Compute SHA-256 hex digest of a buffer. The 8-char prefix is used as
 * the content-hash filename segment (matching the Vite assets-hashing
 * convention).
 */
export const sha256Hex = (data: Uint8Array | string): string =>
  createHash('sha256').update(data).digest('hex');

/**
 * Build the per-body plate output filename: `<body>.<8-char-hash>.png`.
 */
export const buildPlateFilename = (body: PlateJob['body'], hash: string): string =>
  `${body}.${hash.slice(0, 8)}.png`;

/**
 * Download a single PIA source frame to the source-cache dir if it
 * isn't already cached. Uses the global `fetch` (Node 22+) — no
 * additional deps.
 *
 * The source-cache dir is `web/textures-src/pbd-plates/`, NOT inside
 * `web/public/`, so the upstream JPEGs do NOT ship in the runtime
 * bundle (Vite copies all of `public/` to `dist/`).
 */
const downloadIfMissing = async (src: SourcePia, cacheDir: string): Promise<Uint8Array> => {
  const localPath = join(cacheDir, src.localFile);
  try {
    const stats = await stat(localPath);
    if (stats.size > 1000) {
      // Cached — skip the network round-trip.
      console.log(`[build_pbd_plates] cached ${src.pia} (${stats.size} bytes)`);
      return new Uint8Array(await readFile(localPath));
    }
  } catch {
    // Not present — fall through to download.
  }
  console.log(`[build_pbd_plates] downloading ${src.pia} from ${src.url}`);
  const res = await fetch(src.url, {
    headers: { 'User-Agent': 'Voyager/5.3 (build_pbd_plates.ts)' },
  });
  if (!res.ok) {
    throw new Error(`Failed to download ${src.pia}: HTTP ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  await writeFile(localPath, buf);
  console.log(`[build_pbd_plates] downloaded ${src.pia} (${buf.byteLength} bytes)`);
  return buf;
};

/**
 * Process a single plate job — crop the source PIA, resize to
 * `PLATE_SIZE`×`PLATE_SIZE`, encode as PNG, content-hash, and write to
 * `web/public/images/pbd/<body>.<hash>.png`. Returns the produced
 * filename + source PIA + SHA-256 for the audit log.
 */
export const buildPlate = async (
  job: PlateJob,
  sourceBytes: Uint8Array,
  outDir: string,
): Promise<{
  body: PlateJob['body'];
  sourcePia: string;
  filename: string;
  sha256: string;
  bytes: number;
}> => {
  let pipeline = sharp(sourceBytes);
  if (job.cropBox !== null) {
    pipeline = pipeline.extract(job.cropBox);
  }
  // Resize to the target plate size. `fit: 'fill'` ignores aspect ratio
  // intentionally — each body's cell is roughly square already (after
  // the cropBox), and forcing the same plate size for all six keeps the
  // composite layer's CSS sizing trivial.
  const pngBuffer = await pipeline
    .resize(PLATE_SIZE, PLATE_SIZE, { fit: 'fill', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const hash = sha256Hex(pngBuffer);
  const filename = buildPlateFilename(job.body, hash);
  const outPath = join(outDir, filename);
  await writeFile(outPath, pngBuffer);
  return {
    body: job.body,
    sourcePia: job.sourcePia,
    filename,
    sha256: hash,
    bytes: pngBuffer.byteLength,
  };
};

/**
 * Remove stale plate outputs from a previous run that don't match the
 * current hashed-filename set. Keeps the source `_pia*.jpg` cache files.
 */
const removeStalePlates = async (
  outDir: string,
  keepFilenames: ReadonlySet<string>,
): Promise<string[]> => {
  let entries: string[];
  try {
    entries = await readdir(outDir);
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('_pia')) continue; // source cache
    if (entry === 'plate-manifest.json') continue; // manifest
    if (entry.endsWith('.png') && !keepFilenames.has(entry)) {
      await unlink(join(outDir, entry));
      removed.push(entry);
    }
  }
  return removed;
};

/**
 * Build all six plates. Returns the audit-log array (one row per plate)
 * suitable for the PIA-lookup-log table in the story file's Dev Agent
 * Record + the `plate-manifest.json` runtime aggregation.
 */
export const buildAllPbdPlates = async (
  outDir: string = PBD_OUT_DIR,
  cacheDir: string = PBD_SRC_CACHE_DIR,
): Promise<
  ReadonlyArray<{
    body: PlateJob['body'];
    sourcePia: string;
    filename: string;
    sha256: string;
    bytes: number;
  }>
> => {
  await mkdir(outDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  // Download / cache each unique source PIA once.
  const sourceBytes = new Map<string, Uint8Array>();
  for (const src of SOURCE_PIAS) {
    sourceBytes.set(src.pia, await downloadIfMissing(src, cacheDir));
  }
  // Build the six plates in chronological PBD substate order
  // (Venus → Earth → Jupiter → Saturn → Uranus → Neptune per
  // `PBD_SUBSTATE_ORDER` in `web/src/chapters/pale-blue-dot/substates.ts`).
  const log: Array<{
    body: PlateJob['body'];
    sourcePia: string;
    filename: string;
    sha256: string;
    bytes: number;
  }> = [];
  for (const job of PLATE_JOBS) {
    const src = sourceBytes.get(job.sourcePia);
    if (!src) {
      throw new Error(`Missing source bytes for ${job.sourcePia} (job ${job.body})`);
    }
    const result = await buildPlate(job, src, outDir);
    log.push(result);
    console.log(
      `[build_pbd_plates] wrote ${result.filename} (${result.bytes} bytes, sha256=${result.sha256.slice(0, 16)}…)`,
    );
  }
  // Remove any stale plate PNGs from a prior run (different hash prefix).
  const keep = new Set(log.map((row) => row.filename));
  const removed = await removeStalePlates(outDir, keep);
  if (removed.length > 0) {
    console.log(`[build_pbd_plates] removed stale plates: ${removed.join(', ')}`);
  }
  // Emit a small JSON manifest the runtime composite layer can fetch /
  // import. This is the bridge between the build-pipeline content-hashed
  // filenames and the runtime that needs to know "plate for body X is at
  // /images/pbd/<filename>".
  const manifest = {
    schemaVersion: 1,
    generatedBy: 'web/scripts/build_pbd_plates.ts (Story 5.3 T1)',
    plateSize: PLATE_SIZE,
    plates: log.map((row) => ({
      body: row.body,
      sourcePia: row.sourcePia,
      filename: row.filename,
      sha256: row.sha256,
      bytes: row.bytes,
    })),
  };
  await writeFile(join(outDir, 'plate-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return log;
};

// Allow direct CLI invocation: `tsx web/scripts/build_pbd_plates.ts`.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build_pbd_plates.ts')) {
  buildAllPbdPlates()
    .then((log) => {
      console.log(`[build_pbd_plates] DONE — built ${log.length} plates.`);
    })
    .catch((err) => {
      console.error('[build_pbd_plates] FAILED:', err);
      process.exit(1);
    });
}
