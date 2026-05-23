/**
 * Story 4.3 AC4/AC5 — celestial-body texture build pipeline (toktx → KTX2).
 *
 * Mirrors `web/scripts/build_glb.ts`'s ADR-0006 compliance pattern (build-time
 * transcoding, NOT runtime — runtime decode is the Basis Universal transcoder
 * shipped as `web/public/basis/`).
 *
 * Reads:
 *   - web/textures-src/gas-giants/<slug>-<tier>.jpg|png  (Story 4.3 procurement)
 *   - web/textures-src/moons/<slug>-2k.jpg|png            (T4.5; blocked on
 *     moon-source procurement at the time of this story's first landing)
 *
 * Writes:
 *   - web/public/textures/<slug>-<tier>.ktx2              (Basis UASTC for
 *     surface textures — same parameters as `build_glb.ts`'s baseColor path
 *     per ADR-0006 § Decision step 3)
 *
 * Tier policy:
 *   - 2k  — KTX2 not produced (PNG path remains for the cruise tier; Story
 *           1.13's `<slug>-2k.png` files in `web/public/textures/` stay
 *           in place as the safe-fallback every device can host).
 *   - 4k  — KTX2 UASTC, produced for the 4 gas giants. Source file resolved
 *           from `web/textures-src/gas-giants/<slug>-4k.{jpg,png}`. If the
 *           4K source is absent (Solar System Scope does NOT ship 4K), the
 *           pipeline falls back to upsampling the 2K source via `sharp`.
 *   - 8k  — KTX2 UASTC, produced for the 4 gas giants. Source resolved from
 *           `web/textures-src/gas-giants/<slug>-8k.{jpg,png}`. If absent
 *           (Uranus / Neptune — Solar System Scope only ships 2K for those),
 *           the pipeline upsamples the 2K source via `sharp` — this is an
 *           honest "the source data simply doesn't have more detail" path:
 *           the encoder produces an 8K KTX2 from the 2K input without
 *           fabricating detail. Documented per Voyager's photographic-truth
 *           principle in `web/public/textures/README.md`.
 *   - moons: 2k KTX2 only (no 4k/8k moon tier in Story 4.3).
 *
 * Idempotency (NFR-R4): re-running with the same inputs MUST produce
 * byte-identical outputs. toktx is deterministic given fixed flags; the
 * sharp upsample path uses `kernel: lanczos3` which is also deterministic.
 * The pipeline writes to a tmp file first, computes SHA-256, and only
 * renames into place if the bytes differ from the existing file — so an
 * unchanged source is a no-op write.
 *
 * Prerequisites:
 *   - Node.js 20+ (tsx)
 *   - `toktx` (Khronos KTX-Software) on PATH — same as `build_glb.ts`
 *   - Source PNG/JPG files in `web/textures-src/`
 *
 * Invocation:
 *   - cd web && npm run build-textures
 *   - just bake-textures
 */

import {
  writeFile,
  readFile,
  mkdir,
  rm,
  mkdtemp,
  access,
  stat,
  rename,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const TEXTURES_SRC = join(REPO_ROOT, 'web', 'textures-src');
const TEXTURES_OUT = join(REPO_ROOT, 'web', 'public', 'textures');

/** Tiers we build at and the on-disk filename suffix. */
export type Tier = '2k' | '4k' | '8k';

/** Per-tier output dimensions used when the source needs upsampling. */
const TIER_DIMS: Record<Tier, { width: number; height: number }> = {
  '2k': { width: 2048, height: 1024 },
  '4k': { width: 4096, height: 2048 },
  '8k': { width: 8192, height: 4096 },
};

/** A build job — one input → one output. */
interface Job {
  /** Body slug (no tier suffix). */
  readonly slug: string;
  /** Target tier. */
  readonly tier: Tier;
  /** Source category — which `textures-src/` subdir to look in. */
  readonly category: 'gas-giants' | 'moons';
}

/**
 * Gas-giant build matrix — 4 bodies × 1 tier (4k). Story 4.3 AC4 originally
 * specified an 8K tier; this was amended in place per Rule 5 (NFR tripwire:
 * impossible-to-procure) once procurement discovered that **every canonical
 * upstream source caps at 4K** for the gas giants:
 *
 *   - Solar System Scope's `8k_<body>.jpg` files are actually 4096×2048
 *     (not 8192×4096) — the "8K" label refers to ~8 megapixels of imagery
 *     rather than 8K dimensions. Verified by `sharp.metadata()` on the
 *     downloaded files.
 *   - NASA SVS / JPL Photojournal do not publish equirectangular-projection
 *     cylindrical maps at >4K resolution for any of the four gas giants —
 *     the Voyager 2 close-up data for Uranus/Neptune is itself capped at
 *     that scale.
 *   - USGS Astrogeology does not provide gas-giant texture maps (only the
 *     moons + inner planets are mapped at high resolution by USGS).
 *
 * Honest answer: ship 4K KTX2 + UASTC for all four gas giants. The runtime
 * `RenderEngine.upgradePlanetTexture(bodyId, '4k')` swap on SOI entry
 * produces a visibly sharper texture than the 2K cruise PNG; the 8K tier
 * provides no additional information because the source data does not
 * carry it. A future story (Epic 7+ candidate) may hunt down genuinely-
 * higher-resolution gas-giant maps; until then, AC4's "8K" wording is
 * amended to "highest tier the source data supports = 4K".
 *
 * NFR-P5 compliance: 4-body × 4K UASTC ≈ 5 MB/body × 4 = ~20 MB; the
 * original 8K-tier estimate was ~80 MB, so this amendment also relaxes
 * the NFR-P5 ≤ 150 MB total-bundle pressure.
 */
const GAS_GIANT_JOBS: ReadonlyArray<Job> = Object.freeze([
  { slug: 'jupiter', tier: '4k', category: 'gas-giants' },
  { slug: 'saturn', tier: '4k', category: 'gas-giants' },
  { slug: 'uranus', tier: '4k', category: 'gas-giants' },
  { slug: 'neptune', tier: '4k', category: 'gas-giants' },
]);

/**
 * Moon jobs (Story 4.3 T4.5 — landed). 11 of 12 outer-system moons have
 * public-domain or NASA-public-domain equirectangular maps that the build
 * pipeline transcodes to 2K KTX2. The 12th — **Hyperion (NAIF 607)** — is
 * INTENTIONALLY OMITTED because no public-domain equirectangular map
 * exists: USGS confirms there is no Hyperion control network
 * (`https://astrogeology.usgs.gov/search/map/hyperion_image_control_network`)
 * because Hyperion's chaotic rotation prevents a clean global mosaic.
 * The runtime falls back to a default grey-sphere placeholder for
 * Hyperion (see `web/src/constants/body-radii.ts` — `textureSlug` is
 * `null` for NAIF 607).
 *
 * Source attribution lives in THIRD_PARTY.md `§ Moon equirectangular maps
 * (Story 4.3 T4.5)`. Sources are predominantly Steve Albers' Science On a
 * Sphere collection (compiled from NASA Voyager / Galileo / Cassini /
 * Juno imagery, public domain), plus Bjorn Jonsson's Callisto mosaic, the
 * NASA PIA19658 Cassini Titan mosaic, and Johnston's Archive Miranda map.
 *
 * Per-moon special cases (see `normalizeToPng`):
 *   - **Titan** source is 4374×2430 (~1.8:1, NASA equidistant projection
 *     layout). Pipeline center-crops to 2:1 (loses ~10% of polar regions
 *     which are visually featureless at flyby zoom).
 *   - **Ariel / Umbriel** sources are mode=L grayscale. Pipeline expands
 *     to RGB via channel replication BEFORE toktx (UASTC + 1-channel
 *     input is poorly supported across decoder backends).
 *   - **Other moons** (Io / Europa / Ganymede / Callisto / Iapetus /
 *     Miranda / Titania / Oberon / Triton) pass through the standard
 *     `normalizeToPng` resize-to-2K path.
 */
const MOON_JOBS: ReadonlyArray<Job> = Object.freeze([
  { slug: 'io', tier: '2k', category: 'moons' },
  { slug: 'europa', tier: '2k', category: 'moons' },
  { slug: 'ganymede', tier: '2k', category: 'moons' },
  { slug: 'callisto', tier: '2k', category: 'moons' },
  { slug: 'titan', tier: '2k', category: 'moons' },
  { slug: 'iapetus', tier: '2k', category: 'moons' },
  // hyperion (607) — DELIBERATELY OMITTED, no public-domain equirect map.
  { slug: 'miranda', tier: '2k', category: 'moons' },
  { slug: 'ariel', tier: '2k', category: 'moons' },
  { slug: 'umbriel', tier: '2k', category: 'moons' },
  { slug: 'titania', tier: '2k', category: 'moons' },
  { slug: 'oberon', tier: '2k', category: 'moons' },
  { slug: 'triton', tier: '2k', category: 'moons' },
]);

/**
 * Slugs whose source map is NOT a 2:1 equirectangular aspect ratio and
 * needs a center-crop to 2:1 before resize. (Currently only Titan;
 * declared as a named constant so the special-case is greppable.)
 */
const SLUGS_NEEDING_CENTER_CROP_TO_2_1: ReadonlySet<string> = new Set(['titan']);

/**
 * Slugs whose source map is single-channel grayscale (mode=L) and needs
 * RGB channel-replication expansion BEFORE toktx. UASTC + 1-channel input
 * is poorly supported across the Basis Universal decoder backends; we
 * expand at build time rather than depending on runtime fallback.
 */
const SLUGS_NEEDING_GRAYSCALE_TO_RGB: ReadonlySet<string> = new Set(['ariel', 'umbriel']);

/** Public — for E2E tests + just-bake-textures driver. */
export const ALL_JOBS: ReadonlyArray<Job> = Object.freeze([
  ...GAS_GIANT_JOBS,
  ...MOON_JOBS,
]);

// === toktx prerequisite check ================================================

const TOKTX_BIN = (() => {
  // Story 3.3 precedent: bake fails fast with a clear error if toktx is
  // unavailable on PATH. We use spawnSync(`toktx`, ...) directly so PATH
  // resolution happens through the shell.
  const probe = spawnSync('toktx', ['--version'], { encoding: 'utf-8' });
  if (probe.status === 0) return 'toktx';
  // Fall back to the canonical Windows install path used by Story 3.3.
  const winPath = 'C:\\Program Files\\KTX-Software\\bin\\toktx.exe';
  const winProbe = spawnSync(winPath, ['--version'], { encoding: 'utf-8' });
  if (winProbe.status === 0) return winPath;
  return null;
})();

const ensureToktx = (): string => {
  if (TOKTX_BIN !== null) return TOKTX_BIN;
  throw new Error(
    '[build-textures] toktx not found. Install from ' +
      'https://github.com/KhronosGroup/KTX-Software/releases or ' +
      'see web/scripts/build_glb.ts for the canonical install pointer.',
  );
};

// === Source resolution =======================================================

/** Try the canonical source paths for a job, in order of preference. */
const resolveSourcePath = async (job: Job): Promise<string | null> => {
  const dir = join(TEXTURES_SRC, job.category);
  // Prefer the exact-tier source (e.g. jupiter-8k.jpg from Solar System Scope).
  const exactStem = `${job.slug}-${job.tier}`;
  for (const ext of ['jpg', 'jpeg', 'png']) {
    const p = join(dir, `${exactStem}.${ext}`);
    if (await fileExists(p)) return p;
  }
  // Fallback for gas giants whose target tier source is absent — Solar System
  // Scope only ships 2K for Uranus/Neptune and 8K for Jupiter/Saturn. We use
  // the 2K source as the upsample input (sharp lanczos3); the encoder still
  // emits a target-tier KTX2 file. The source dimensions == 2K cap the
  // recoverable detail, which is the honest answer (no fabricated bands).
  if (job.category === 'gas-giants') {
    const stem2k = `${job.slug}-2k`;
    for (const ext of ['jpg', 'jpeg', 'png']) {
      const p = join(dir, `${stem2k}.${ext}`);
      if (await fileExists(p)) return p;
    }
  }
  return null;
};

const fileExists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

// === sharp resize (PNG normalization + optional upsample) ====================

/**
 * Normalize `srcPath` to a PNG sized at the target tier's dimensions.
 * toktx is happy with PNG/JPG inputs; we normalize to PNG so the toktx
 * invocation has a single deterministic input path regardless of the
 * upstream's format. Resize uses lanczos3 (deterministic, high-quality).
 *
 * Per-slug special cases (Story 4.3 T4.5 moon procurement):
 *
 *   - `titan` (NASA PIA19658, 4374×2430, ~1.8:1) — center-crop to 2:1
 *     BEFORE the resize. Without the crop, the resize-to-fill flattens
 *     the non-2:1 source onto a 2:1 canvas, which UV-maps to visible
 *     polar stretching on the sphere. The crop loses ~10% of polar
 *     regions which are nearly featureless at flyby scrub distances.
 *   - `ariel`, `umbriel` (Voyager 2 grayscale via Steve Albers, mode=L)
 *     — explicit `.toColorspace('srgb')` + `.ensureAlpha(0)` round-trip
 *     promotes the single-channel input to 3-channel RGB via grayscale
 *     duplication. Without this, toktx UASTC produces output that
 *     decodes as black on some Basis transcoder backends.
 */
const normalizeToPng = async (
  srcPath: string,
  targetTier: Tier,
  workDir: string,
  stem: string,
  slug: string,
): Promise<string> => {
  const { default: sharp } = await import('sharp');
  const dst = join(workDir, `${stem}.png`);
  const dims = TIER_DIMS[targetTier];

  let pipeline = sharp(srcPath);

  // Per-slug special-case 1 — center-crop a non-2:1 source to 2:1 before
  // the resize. The crop is computed against the actual source metadata,
  // not the target tier, so the math holds for any future non-2:1 source.
  if (SLUGS_NEEDING_CENTER_CROP_TO_2_1.has(slug)) {
    const meta = await pipeline.metadata();
    const srcW = meta.width ?? 0;
    const srcH = meta.height ?? 0;
    if (srcW > 0 && srcH > 0) {
      // Target aspect ratio is 2:1 (W = 2H). Compare against source.
      const srcAspect = srcW / srcH;
      const targetAspect = 2.0;
      if (Math.abs(srcAspect - targetAspect) > 0.01) {
        if (srcAspect > targetAspect) {
          // Source is too wide — crop the left + right edges. Probably
          // doesn't happen for any current moon source, but handled
          // for completeness.
          const newW = Math.round(srcH * targetAspect);
          const left = Math.floor((srcW - newW) / 2);
          pipeline = pipeline.extract({ left, top: 0, width: newW, height: srcH });
        } else {
          // Source is too tall — crop the top + bottom edges (polar
          // regions). This is Titan's case (4374×2430 → 4374×2187,
          // discarding ~243 rows total across both poles).
          const newH = Math.round(srcW / targetAspect);
          const top = Math.floor((srcH - newH) / 2);
          pipeline = pipeline.extract({ left: 0, top, width: srcW, height: newH });
        }
      }
    }
  }

  // Per-slug special-case 2 — grayscale → RGB expansion for the Voyager 2
  // mode=L Uranian moon maps. Sharp's `.toColorspace('srgb')` re-encodes a
  // grayscale input as 3-channel RGB by duplicating the luminance into
  // all three channels — the visually-identical RGB image toktx UASTC
  // handles cleanly.
  if (SLUGS_NEEDING_GRAYSCALE_TO_RGB.has(slug)) {
    pipeline = pipeline.toColorspace('srgb').removeAlpha();
  }

  // For 2k targets where the source is already 2k, sharp's resize is a
  // near-no-op (it still re-encodes to PNG for determinism — JPG sources
  // can't be passed through losslessly). For tier targets larger than the
  // source (e.g. Miranda 1440×720 → 2048×1024), lanczos3 upsamples.
  await pipeline
    .resize(dims.width, dims.height, { kernel: 'lanczos3', fit: 'fill' })
    .png({ compressionLevel: 9, palette: false })
    .toFile(dst);
  return dst;
};

// === toktx invocation ========================================================

/**
 * Run toktx on a single normalized PNG → KTX2. Returns the bytes of the
 * resulting .ktx2 file. The flags mirror `build_glb.ts`'s baseColor path
 * per ADR-0006 § Decision step 3 (UASTC for high-fidelity surface
 * textures). `--genmipmap` builds the mipchain inside the KTX2 container so
 * Three.js's KTX2Loader can stream it directly to the GPU.
 */
const runToktx = (
  bin: string,
  inputPng: string,
  outputKtx2: string,
): void => {
  const args = [
    '--encode', 'uastc',
    '--uastc_quality', '2',
    '--uastc_rdo_l', '1.0',
    '--zcmp', '20',
    '--genmipmap',
    '--assign_oetf', 'srgb',
    '--assign_primaries', 'bt709',
    outputKtx2,
    inputPng,
  ];
  const result = spawnSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    const stdout = result.stdout?.toString() ?? '';
    throw new Error(
      `[build-textures] toktx failed for ${inputPng}:\n${stdout}\n${stderr}`,
    );
  }
};

// === Atomic write with byte-identical idempotency ============================

/**
 * Write `bytes` to `dstPath` atomically. If `dstPath` already exists AND
 * has identical bytes, the write is a no-op (preserving the existing file's
 * mtime → no spurious diffs on a re-bake). Otherwise the new file replaces
 * the old via a temp-file + rename.
 *
 * Mirrors `build_glb.ts`'s content-hash idempotency pattern.
 */
const writeIfChanged = async (dstPath: string, bytes: Buffer): Promise<{
  written: boolean;
  sha256: string;
}> => {
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (await fileExists(dstPath)) {
    const existing = await readFile(dstPath);
    const existingSha = createHash('sha256').update(existing).digest('hex');
    if (existingSha === sha) return { written: false, sha256: sha };
  }
  const tmpPath = `${dstPath}.tmp`;
  await mkdir(dirname(dstPath), { recursive: true });
  await writeFile(tmpPath, bytes);
  await rename(tmpPath, dstPath);
  return { written: true, sha256: sha };
};

// === Job execution ===========================================================

export interface BuildResult {
  readonly job: Job;
  readonly outputPath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly written: boolean;
  readonly skipped?: 'source-missing';
}

/**
 * Build a single texture. Returns a result object; throws on toktx failure.
 * Returns `skipped: 'source-missing'` if neither the exact-tier source nor
 * the 2K fallback source exists (e.g. moon textures that haven't been
 * procured yet) — the build does not fail in that case, it just skips the
 * job so partial procurement still produces a working KTX2 set for what's
 * available.
 */
export const buildOne = async (
  job: Job,
  options: {
    workDir?: string;
    outDir?: string;
    toktxBin?: string;
  } = {},
): Promise<BuildResult> => {
  const bin = options.toktxBin ?? ensureToktx();
  const outDir = options.outDir ?? TEXTURES_OUT;
  const outPath = join(outDir, `${job.slug}-${job.tier}.ktx2`);

  const sourcePath = await resolveSourcePath(job);
  if (sourcePath === null) {
    return {
      job,
      outputPath: outPath,
      sha256: '',
      bytes: 0,
      written: false,
      skipped: 'source-missing',
    };
  }

  const workDir = options.workDir ?? (await mkdtemp(join(tmpdir(), 'voyager-tex-')));
  const stem = `${job.slug}-${job.tier}`;
  const normalizedPng = await normalizeToPng(sourcePath, job.tier, workDir, stem, job.slug);
  const tmpKtx2 = join(workDir, `${stem}.ktx2`);
  runToktx(bin, normalizedPng, tmpKtx2);
  const bytes = await readFile(tmpKtx2);
  const { written, sha256 } = await writeIfChanged(outPath, bytes);

  return {
    job,
    outputPath: outPath,
    sha256,
    bytes: bytes.length,
    written,
  };
};

/** Run the full Story 4.3 texture build. */
export const buildAll = async (): Promise<BuildResult[]> => {
  ensureToktx();
  const workDir = await mkdtemp(join(tmpdir(), 'voyager-tex-'));
  const results: BuildResult[] = [];
  try {
    for (const job of ALL_JOBS) {
      const r = await buildOne(job, { workDir });
      results.push(r);
      if (r.skipped === 'source-missing') {
        console.log(
          `[build-textures] SKIP ${job.slug}-${job.tier}  ` +
            '(source missing; procurement pending)',
        );
      } else {
        const action = r.written ? 'WRITE' : 'CACHE';
        console.log(
          `[build-textures] ${action} ${r.outputPath}  ` +
            `${r.bytes.toLocaleString()} bytes  sha=${r.sha256.slice(0, 12)}...`,
        );
      }
    }
  } finally {
    // Best-effort cleanup of the work dir.
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
  return results;
};

// === CLI entry point =========================================================

const isMain = (): boolean => {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  const here = fileURLToPath(import.meta.url);
  return resolve(argv1) === resolve(here);
};

if (isMain()) {
  buildAll()
    .then((results) => {
      const skipped = results.filter((r) => r.skipped !== undefined).length;
      const written = results.filter((r) => r.written).length;
      const cached = results.length - skipped - written;
      console.log(
        `[build-textures] done — ${written} written, ${cached} cached, ${skipped} skipped`,
      );
      // Probe stat is incidental — keep mostly silent.
      void stat;
    })
    .catch((err: unknown) => {
      console.error('[build-textures] FAILED:', err);
      process.exit(1);
    });
}
