/**
 * Story 5.3 T1 — `build_pbd_plates.ts` E2E test (Rule 11).
 *
 * Per `_bmad/custom/voyager-skill-rules.md` Rule 11, any build script
 * under `web/scripts/` that chains multiple library calls (sharp +
 * fetch + crypto hashing here) MUST have at least one end-to-end test
 * that runs the full pipeline against a small real fixture and asserts
 * on the produced output bytes / file metadata. Unit tests on individual
 * functions are necessary but not sufficient.
 *
 * This file covers:
 *
 *   - Pure-function tests for `sha256Hex`, `buildPlateFilename`,
 *     `PLATE_JOBS` shape (these are the boundary contracts).
 *   - A full-pipeline E2E run via `buildPlate(...)` against a synthetic
 *     JPEG fixture (Sharp-generated in-memory; no network access). This
 *     exercises the sharp.extract + resize + PNG encode chain end-to-end
 *     and asserts the produced PNG has the correct dimensions + content
 *     hash format.
 *
 * The pipeline's network-dependent `downloadIfMissing` path is NOT
 * exercised here (it lives in `buildAllPbdPlates` which performs real
 * fetch calls); the production `npm run build-pbd-plates` invocation
 * IS the integration check that runs against the live NASA Photojournal
 * CDN. This file's E2E coverage focuses on the deterministic
 * crop+resize+encode chain.
 */

import { describe, it, expect } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

import {
  PLATE_JOBS,
  PLATE_SIZE,
  SOURCE_PIAS,
  buildPlate,
  buildPlateFilename,
  sha256Hex,
} from './build_pbd_plates';

describe('Story 5.3 T1 — build_pbd_plates: pure-function contracts', () => {
  it('sha256Hex returns a 64-char lowercase hex string', () => {
    const hex = sha256Hex(new Uint8Array([1, 2, 3, 4]));
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic — same input produces the same hash.
    expect(sha256Hex(new Uint8Array([1, 2, 3, 4]))).toBe(hex);
  });

  it('sha256Hex handles strings + buffers symmetrically', () => {
    const a = sha256Hex('voyager');
    const b = sha256Hex(new TextEncoder().encode('voyager'));
    expect(a).toBe(b);
  });

  it('buildPlateFilename uses the first 8 hash chars as a suffix', () => {
    const hash = 'abcdef0123456789' + 'a'.repeat(48);
    expect(buildPlateFilename('earth', hash)).toBe('earth.abcdef01.png');
  });

  it('PLATE_JOBS lists six bodies in PBD chronological order', () => {
    expect(PLATE_JOBS.map((j) => j.body)).toEqual([
      'venus', 'earth', 'jupiter', 'saturn', 'uranus', 'neptune',
    ]);
  });

  it('PLATE_JOBS only uses the canonical NASA Photojournal source PIAs', () => {
    const validPias = new Set(SOURCE_PIAS.map((s) => s.pia));
    for (const job of PLATE_JOBS) {
      expect(validPias.has(job.sourcePia)).toBe(true);
    }
  });

  it('Earth uses PIA00452 directly (no crop) — preserves the iconic Sagan composition', () => {
    const earth = PLATE_JOBS.find((j) => j.body === 'earth')!;
    expect(earth.sourcePia).toBe('PIA00452');
    expect(earth.cropBox).toBe(null);
  });

  it('Non-Earth bodies crop from PIA00453', () => {
    for (const job of PLATE_JOBS) {
      if (job.body === 'earth') continue;
      expect(job.sourcePia).toBe('PIA00453');
      expect(job.cropBox).not.toBe(null);
    }
  });

  it('PLATE_SIZE is a power of 2 (browser texture-caching alignment)', () => {
    const isPow2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;
    expect(isPow2(PLATE_SIZE)).toBe(true);
  });
});

describe('Story 5.3 T1 — build_pbd_plates: full E2E pipeline (Rule 11)', () => {
  /**
   * Synthesize a 620×500 JPEG with six labelled grid cells matching
   * PIA00453's layout. The cell colors are distinct so the per-cell
   * crop+resize result is verifiable (each cropped+resized PNG should
   * be dominated by its assigned color).
   */
  const buildSyntheticSixPlateJpeg = async (): Promise<Uint8Array> => {
    // 620×500 with six 206×250 cells filled with distinct RGB colors.
    // We compose using `sharp` from a single grid color via `tile` to
    // get six solid-color cells.
    const cells = [
      { col: 0, row: 0, r: 200, g: 0, b: 200 }, // Venus (purple)
      { col: 1, row: 0, r: 100, g: 200, b: 0 }, // Earth (green)
      { col: 2, row: 0, r: 0, g: 0, b: 200 },   // Jupiter (blue)
      { col: 0, row: 1, r: 200, g: 100, b: 0 }, // Saturn (orange)
      { col: 1, row: 1, r: 0, g: 200, b: 200 }, // Uranus (cyan)
      { col: 2, row: 1, r: 200, g: 200, b: 0 }, // Neptune (yellow)
    ];
    const base = await sharp({
      create: { width: 620, height: 500, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).png().toBuffer();
    let composed = sharp(base);
    const overlays: sharp.OverlayOptions[] = [];
    for (const cell of cells) {
      const tile = await sharp({
        create: { width: 206, height: 250, channels: 3, background: { r: cell.r, g: cell.g, b: cell.b } },
      }).png().toBuffer();
      const left = cell.col === 0 ? 0 : cell.col === 1 ? 207 : 414;
      const top = cell.row === 0 ? 0 : 250;
      overlays.push({ input: tile, left, top });
    }
    composed = composed.composite(overlays);
    return new Uint8Array(await composed.jpeg().toBuffer());
  };

  /**
   * Synthesize a 453×614 JPEG with a known signature for the Earth
   * plate path (no crop).
   */
  const buildSyntheticEarthJpeg = async (): Promise<Uint8Array> => {
    const buf = await sharp({
      create: { width: 453, height: 614, channels: 3, background: { r: 50, g: 50, b: 80 } },
    }).jpeg().toBuffer();
    return new Uint8Array(buf);
  };

  it('produces 128×128 PNG plates with content-hashed filenames for the six-grid source', async () => {
    const six = await buildSyntheticSixPlateJpeg();
    const earth = await buildSyntheticEarthJpeg();
    const outDir = await mkdir(
      resolve(tmpdir(), `voyager-pbd-plates-test-${Date.now()}`),
      { recursive: true },
    );
    if (outDir === undefined) throw new Error('failed to mkdir');
    try {
      const results: Array<{ filename: string; bytes: number }> = [];
      for (const job of PLATE_JOBS) {
        const src = job.sourcePia === 'PIA00452' ? earth : six;
        const result = await buildPlate(job, src, outDir);
        results.push({ filename: result.filename, bytes: result.bytes });
        expect(result.filename).toMatch(/^[a-z]+\.[0-9a-f]{8}\.png$/);
        expect(result.bytes).toBeGreaterThan(100);
        // Re-read the file and verify it's a valid 128×128 PNG.
        const fileBytes = await readFile(join(outDir, result.filename));
        const meta = await sharp(fileBytes).metadata();
        expect(meta.format).toBe('png');
        expect(meta.width).toBe(PLATE_SIZE);
        expect(meta.height).toBe(PLATE_SIZE);
      }
      // All six filenames are unique (distinct content hashes).
      const filenames = new Set(results.map((r) => r.filename));
      expect(filenames.size).toBe(6);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('idempotent: same source bytes → same output filename + content hash', async () => {
    const six = await buildSyntheticSixPlateJpeg();
    const outDirA = await mkdir(
      resolve(tmpdir(), `voyager-pbd-plates-test-${Date.now()}-a`),
      { recursive: true },
    );
    const outDirB = await mkdir(
      resolve(tmpdir(), `voyager-pbd-plates-test-${Date.now()}-b`),
      { recursive: true },
    );
    if (outDirA === undefined || outDirB === undefined) throw new Error('failed to mkdir');
    try {
      const venusJob = PLATE_JOBS.find((j) => j.body === 'venus')!;
      const a = await buildPlate(venusJob, six, outDirA);
      const b = await buildPlate(venusJob, six, outDirB);
      expect(a.filename).toBe(b.filename);
      expect(a.sha256).toBe(b.sha256);
      expect(a.bytes).toBe(b.bytes);
    } finally {
      await rm(outDirA, { recursive: true, force: true });
      await rm(outDirB, { recursive: true, force: true });
    }
  });

  it('the cropped Venus cell from the synthetic six-grid is dominated by the Venus color (verifies crop coordinates)', async () => {
    // The synthetic source places Venus at cell (col=0, row=0) with RGB
    // (200, 0, 200) — purple. Cropping + resizing should produce a PNG
    // whose mean color is close to that purple.
    const six = await buildSyntheticSixPlateJpeg();
    const outDir = await mkdir(
      resolve(tmpdir(), `voyager-pbd-plates-test-${Date.now()}-venus`),
      { recursive: true },
    );
    if (outDir === undefined) throw new Error('failed to mkdir');
    try {
      const venusJob = PLATE_JOBS.find((j) => j.body === 'venus')!;
      const result = await buildPlate(venusJob, six, outDir);
      const fileBytes = await readFile(join(outDir, result.filename));
      // Use Sharp to read the mean RGB of the plate.
      const { dominant } = await sharp(fileBytes).stats();
      expect(dominant.r).toBeGreaterThan(150); // purple = ~200,0,200
      expect(dominant.r).toBeLessThan(250);
      expect(dominant.g).toBeLessThan(60);
      expect(dominant.b).toBeGreaterThan(150);
      expect(dominant.b).toBeLessThan(250);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('the cropped Jupiter cell is dominated by the Jupiter color (verifies grid coords col=2, row=0)', async () => {
    // Jupiter at (col=2, row=0) is RGB (0, 0, 200) — blue.
    const six = await buildSyntheticSixPlateJpeg();
    const outDir = await mkdir(
      resolve(tmpdir(), `voyager-pbd-plates-test-${Date.now()}-jupiter`),
      { recursive: true },
    );
    if (outDir === undefined) throw new Error('failed to mkdir');
    try {
      const jupiterJob = PLATE_JOBS.find((j) => j.body === 'jupiter')!;
      const result = await buildPlate(jupiterJob, six, outDir);
      const fileBytes = await readFile(join(outDir, result.filename));
      const { dominant } = await sharp(fileBytes).stats();
      // Blue: R low, G low, B high.
      expect(dominant.r).toBeLessThan(60);
      expect(dominant.g).toBeLessThan(60);
      expect(dominant.b).toBeGreaterThan(150);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
